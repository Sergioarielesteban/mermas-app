'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  activeChefProductionBoardBlockItem,
  buildChefProductionBoardRows,
  type ChefProductionBoardRow,
  completeChefProductionSession,
  ensureChefProductionSessionLinesForTemplate,
  type ChefProductionDayBlock,
  fetchChefProductionBlockItems,
  fetchChefProductionDayBlocks,
  fetchChefProductionSessionLines,
  fetchChefProductionSessionRow,
  fetchChefProductionTemplates,
  formatProductionMigrationError,
  getOrCreateChefProductionSession,
  productionQtyToMake,
  resolveChefProductionDayBlock,
  resolveLjAndVdBlocks,
  type ChefProductionSession,
  type ChefProductionSessionLine,
  type ChefProductionTemplate,
  updateChefProductionSessionForcedBlock,
  updateChefProductionSessionLineQty,
} from '@/lib/chef-ops-supabase';
import { appConfirm } from '@/lib/app-dialog-bridge';

const STORAGE_LAST_TEMPLATE = 'chef_prod_last_template_v1';

function parseQty(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmtQty(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '';
  return String(n);
}

function addCalendarDaysIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function fmtEsDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

type LabelPayload = {
  producto: string;
  elaboracion: string;
  caducidad: string | null;
  lote: string;
};

function openPrintLabels(workDateIso: string, rows: LabelPayload[]) {
  if (typeof window === 'undefined') return;
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    alert('Permite ventanas emergentes para imprimir.');
    return;
  }
  const itemsHtml = rows
    .map(
      (r) => `
    <article class="etq">
      <div class="p">${escapeHtml(r.producto)}</div>
      <div class="meta">Elab. ${escapeHtml(r.elaboracion)}${r.caducidad ? ` · Cad. ${escapeHtml(r.caducidad)}` : ''}</div>
      <div class="lote">${escapeHtml(r.lote)}</div>
    </article>`,
    )
    .join('');
  const doc = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Etiquetas ${escapeHtml(
    workDateIso,
  )}</title><style>
@page { size: 58mm auto; margin: 2mm; }
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:4px;color:#111}
.etq{width:54mm;margin:0 auto 4mm;padding:5px 4px;border:1px solid #333;border-radius:2mm;break-inside:avoid;page-break-inside:avoid}
.p{font-size:11px;font-weight:800;line-height:1.2;text-transform:uppercase;letter-spacing:.02em;word-break:break-word}
.meta{font-size:9px;margin-top:3px;line-height:1.25;color:#444}
.lote{font-size:8px;margin-top:2px;color:#555;font-variant-numeric:tabular-nums}
@media screen{body{max-width:90mm;margin:0 auto;background:#fafafa;padding:12px}}
</style></head><body>${itemsHtml}<script>window.onload=function(){setTimeout(function(){window.print()},100)};<\/script></body></html>`;
  w.document.open();
  w.document.write(doc);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function groupRowsByKitchenSection(rows: ChefProductionBoardRow[]): { title: string; rows: ChefProductionBoardRow[] }[] {
  const m = new Map<string, ChefProductionBoardRow[]>();
  for (const row of rows) {
    const t = row.kitchenSection.trim();
    const key = t;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(row);
  }
  return [...m.entries()].map(([title, rs]) => ({ title, rows: rs }));
}

function ProduccionBoardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sesionQ = searchParams.get('sesion');
  const { localId, profileReady, userId } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ChefProductionTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [session, setSession] = useState<ChefProductionSession | null>(null);
  const [blocks, setBlocks] = useState<ChefProductionDayBlock[]>([]);
  const [boardRows, setBoardRows] = useState<ChefProductionBoardRow[]>([]);
  const [ljBlockId, setLjBlockId] = useState<string | null>(null);
  const [vdBlockId, setVdBlockId] = useState<string | null>(null);
  const [sessionLines, setSessionLines] = useState<ChefProductionSessionLine[]>([]);
  const [hechoDraft, setHechoDraft] = useState<Record<string, string>>({});
  const hechoDraftRef = useRef(hechoDraft);
  hechoDraftRef.current = hechoDraft;

  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const debouncePersistRef = useRef<number | null>(null);
  const sesionBootstrapRef = useRef<string | null>(null);

  const clearDebouncePersist = useCallback(() => {
    if (debouncePersistRef.current != null) {
      window.clearTimeout(debouncePersistRef.current);
      debouncePersistRef.current = null;
    }
  }, []);

  useEffect(() => () => clearDebouncePersist(), [clearDebouncePersist]);

  const byBlockItemId = useMemo(() => {
    const m = new Map<string, ChefProductionSessionLine>();
    for (const sl of sessionLines) m.set(sl.blockItemId, sl);
    return m;
  }, [sessionLines]);

  const activeBlock = useMemo(() => {
    if (!session) return null;
    return resolveChefProductionDayBlock(blocks, session.workDate, session.forcedBlockId);
  }, [session, blocks]);

  const persistHecho = useCallback(
    async (sessionLineId: string, displayValue: string) => {
      if (!supabaseOk || session?.completedAt) return;
      const qty = parseQty(displayValue);
      setSavingLineId(sessionLineId);
      setBanner(null);
      try {
        const supabase = getSupabaseClient()!;
        await updateChefProductionSessionLineQty(supabase, sessionLineId, qty);
        setHechoDraft((prev) => ({ ...prev, [sessionLineId]: fmtQty(qty) }));
        setSessionLines((prev) =>
          prev.map((r) => (r.id === sessionLineId ? { ...r, qtyOnHand: qty } : r)),
        );
      } catch (e) {
        setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
      } finally {
        setSavingLineId(null);
      }
    },
    [supabaseOk, session?.completedAt],
  );

  const scheduleDebouncedPersist = useCallback(
    (sessionLineId: string, displayValue: string) => {
      clearDebouncePersist();
      debouncePersistRef.current = window.setTimeout(() => {
        debouncePersistRef.current = null;
        void persistHecho(sessionLineId, displayValue);
      }, 500);
    },
    [clearDebouncePersist, persistHecho],
  );

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const tplList = await fetchChefProductionTemplates(supabase, localId);
      setTemplates(tplList);

      const sesionFromUrl = sesionQ;
      let dateEff = workDate;
      let templateEff = templateId;

      if (sesionFromUrl && sesionBootstrapRef.current !== sesionFromUrl) {
        const row = await fetchChefProductionSessionRow(supabase, sesionFromUrl);
        if (row?.localId === localId && !row.completedAt) {
          sesionBootstrapRef.current = sesionFromUrl;
          dateEff = row.workDate;
          templateEff = row.templateId;
          setWorkDate(row.workDate);
          setTemplateId(row.templateId);
          router.replace('/produccion', { scroll: false });
        } else if (row?.localId === localId && row.completedAt) {
          router.replace(`/produccion/correr/${sesionFromUrl}`, { scroll: false });
        }
      }

      if (!templateEff && tplList.length > 0) {
        let pick = tplList[0]!.id;
        if (typeof window !== 'undefined') {
          const ls = window.localStorage.getItem(STORAGE_LAST_TEMPLATE);
          if (ls && tplList.some((t) => t.id === ls)) pick = ls;
        }
        templateEff = pick;
        setTemplateId(pick);
      }

      if (!templateEff || tplList.length === 0) {
        setSession(null);
        setBlocks([]);
        setBoardRows([]);
        setSessionLines([]);
        setHechoDraft({});
        setLoading(false);
        return;
      }

      typeof window !== 'undefined' &&
        window.localStorage.setItem(STORAGE_LAST_TEMPLATE, templateEff);

      const sess = await getOrCreateChefProductionSession(
        supabase,
        localId,
        templateEff,
        dateEff,
        null,
        userId ?? null,
      );
      setSession(sess);

      const bl = await fetchChefProductionDayBlocks(supabase, templateEff);
      setBlocks(bl);
      const { ljBlock, vdBlock } = resolveLjAndVdBlocks(bl);
      setLjBlockId(ljBlock?.id ?? null);
      setVdBlockId(vdBlock?.id ?? null);

      const ljItems = ljBlock ? await fetchChefProductionBlockItems(supabase, ljBlock.id) : [];
      const vdItems = vdBlock ? await fetchChefProductionBlockItems(supabase, vdBlock.id) : [];
      const rows = buildChefProductionBoardRows(ljItems, vdItems);
      setBoardRows(rows);

      if (!sess.completedAt) {
        await ensureChefProductionSessionLinesForTemplate(supabase, sess.id, templateEff);
      }
      const sl = await fetchChefProductionSessionLines(supabase, sess.id);
      setSessionLines(sl);
      const h: Record<string, string> = {};
      for (const x of sl) {
        h[x.id] = fmtQty(x.qtyOnHand);
      }
      setHechoDraft(h);
    } catch (e) {
      setBanner(formatProductionMigrationError(e));
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [
    localId,
    supabaseOk,
    workDate,
    templateId,
    userId,
    sesionQ,
    router,
  ]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const templateName = templates.find((t) => t.id === templateId)?.name ?? '';

  const setForcedBlock = async (blockId: string | null) => {
    if (!supabaseOk || !session || session.completedAt) return;
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionSessionForcedBlock(supabase, session.id, blockId);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo cambiar el bloque.');
    }
  };

  const bumpHecho = async (sessionLineId: string | null, delta: number) => {
    if (!sessionLineId || !supabaseOk || session?.completedAt) return;
    clearDebouncePersist();
    const cur = sessionLines.find((s) => s.id === sessionLineId);
    const draftN = parseQty(hechoDraftRef.current[sessionLineId] ?? '');
    const base =
      draftN != null && !Number.isNaN(draftN)
        ? draftN
        : cur?.qtyOnHand != null && !Number.isNaN(Number(cur.qtyOnHand))
          ? Number(cur.qtyOnHand)
          : 0;
    const next = Math.max(0, base + delta);
    const nextStr = fmtQty(next);
    hechoDraftRef.current = { ...hechoDraftRef.current, [sessionLineId]: nextStr };
    setHechoDraft((prev) => ({ ...prev, [sessionLineId]: nextStr }));
    await persistHecho(sessionLineId, nextStr);
  };

  const guardarDia = async () => {
    if (!supabaseOk || !session?.id || session.completedAt) return;
    if (!(await appConfirm('¿Guardar y cerrar este día? Quedará en el historial con el resumen del momento.')))
      return;
    setClosing(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await completeChefProductionSession(supabase, session.id);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setClosing(false);
    }
  };

  const imprimirEtiquetas = () => {
    if (!session) return;
    const elaboracion = fmtEsDate(session.workDate);
    let seq = 0;
    const labels: LabelPayload[] = [];

    for (const row of boardRows) {
      const activeItem = activeChefProductionBoardBlockItem(row, activeBlock?.id ?? null, ljBlockId, vdBlockId);
      if (!activeItem) continue;
      const sl = byBlockItemId.get(activeItem.id);
      if (!sl) continue;
      const draftRaw = hechoDraft[sl.id] ?? '';
      const draftN = parseQty(draftRaw);
      const hecho =
        draftN != null && !Number.isNaN(draftN) && draftRaw.trim() !== ''
          ? draftN
          : sl.qtyOnHand != null && !Number.isNaN(Number(sl.qtyOnHand))
            ? Number(sl.qtyOnHand)
            : 0;
      if (hecho <= 0) continue;
      seq += 1;
      const shelf = activeItem.shelfLifeDays ?? row.ljItem?.shelfLifeDays ?? row.vdItem?.shelfLifeDays ?? null;
      const caducidad =
        shelf != null && Number.isFinite(shelf) ? fmtEsDate(addCalendarDaysIso(session.workDate, shelf)) : null;
      const lotePref = session.workDate.replace(/-/g, '');
      labels.push({
        producto: row.displayLabel,
        elaboracion,
        caducidad,
        lote: `L${lotePref}-${seq}`,
      });
    }

    if (labels.length === 0) {
      setBanner('No hay producción registrada (hecho > 0) para etiquetar hoy.');
      return;
    }
    setBanner(null);
    openPrintLabels(session.workDate, labels);
  };

  const sectionGroups = useMemo(() => groupRowsByKitchenSection(boardRows), [boardRows]);

  const isClosed = Boolean(session?.completedAt);

  return (
    <div className="pb-16 pt-2">
      <header className="sticky top-0 z-10 -mx-1 border-b border-zinc-200/90 bg-[#fafafa] px-1 pb-2 pt-1 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:pb-0 sm:pt-0">
        <div className="flex flex-wrap items-center gap-2 sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-black tracking-tight text-zinc-900 sm:text-lg">Producción del día</h1>
            <p className="text-[11px] font-medium text-zinc-600">{templateName || '—'}</p>
          </div>
          <nav className="flex flex-wrap gap-2 text-[11px] font-bold">
            <Link href="/produccion/planes" className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-zinc-800">
              Plantillas
            </Link>
            <Link href="/produccion/historial" className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-zinc-800">
              Historial
            </Link>
          </nav>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5 text-[10px] font-bold uppercase text-zinc-700">
            Fecha
            <input
              type="date"
              value={workDate}
              disabled={isClosed || loading}
              onChange={(e) => setWorkDate(e.target.value)}
              className="h-10 rounded border border-zinc-300 bg-white px-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
            />
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5 text-[10px] font-bold uppercase text-zinc-700">
            Plantilla
            <select
              value={templateId}
              disabled={isClosed || loading || templates.length === 0}
              onChange={(e) => setTemplateId(e.target.value)}
              className="h-10 rounded border border-zinc-300 bg-white px-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
            >
              {templates.length === 0 ? <option value="">Sin plantillas</option> : null}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button
              type="button"
              disabled={closing || !session?.id || isClosed}
              onClick={() => void guardarDia()}
              className="h-10 rounded border border-zinc-800 bg-zinc-900 px-3 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
            >
              {closing ? '…' : 'Guardar día'}
            </button>
            <button
              type="button"
              disabled={!session}
              onClick={imprimirEtiquetas}
              className="h-10 rounded border border-zinc-300 bg-white px-3 text-xs font-black uppercase tracking-wide text-zinc-900 disabled:opacity-45"
            >
              Imprimir etiquetas
            </button>
          </div>
        </div>
      </header>

      {banner ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="mt-6 text-center text-sm text-zinc-700">Conecta Supabase y un local.</p>
      ) : loading ? (
        <p className="mt-6 text-center text-sm text-zinc-700">Cargando…</p>
      ) : templates.length === 0 ? (
        <p className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-800">
          No hay plantillas. Configúralas en{' '}
          <Link className="font-bold text-[#D32F2F] underline" href="/produccion/planes">
            Plantillas
          </Link>
          .
        </p>
      ) : !session ? null : (
        <>
          {isClosed ? (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
              Día guardado ({session.completedAt ? new Date(session.completedAt).toLocaleString('es-ES') : ''}). Solo
              lectura. Ver detalle en{' '}
              <Link href={`/produccion/correr/${session.id}`} className="underline">
                historial del día
              </Link>
              .
            </p>
          ) : null}

          {!activeBlock && blocks.length > 0 ? (
            <div className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2">
              <p className="text-[11px] font-bold text-amber-950">Ningún bloque encaja en esta fecha. Elige uno:</p>
              <div className="flex flex-wrap gap-1">
                {[...blocks]
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                  .map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      disabled={isClosed}
                      onClick={() => void setForcedBlock(b.id)}
                      className="rounded bg-white px-2 py-1 text-[10px] font-black uppercase text-zinc-800 ring-1 ring-zinc-200"
                    >
                      {b.label}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}

          {activeBlock ? (
            <p className="mt-2 text-[11px] font-semibold text-zinc-600">
              Periodo aplicado: <span className="font-black text-zinc-900">{activeBlock.label}</span>
              {session.forcedBlockId ? ' · manual' : ' · auto'}
            </p>
          ) : null}

          <div className="mt-3 overflow-x-auto rounded border border-zinc-200 bg-white">
            <table className="w-full min-w-[340px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-100 text-[10px] font-black uppercase text-zinc-700">
                  <th className="px-2 py-2">Producto</th>
                  <th className="w-12 px-1 py-2 text-center tabular-nums">L–J</th>
                  <th className="w-12 px-1 py-2 text-center tabular-nums">V–D</th>
                  <th className="w-16 px-1 py-2 text-center">Hecho</th>
                  <th className="w-12 px-1 py-2 text-center tabular-nums">Hacer</th>
                  <th className="w-24 px-1 py-2 text-center"> </th>
                </tr>
              </thead>
              <tbody>
                {sectionGroups.flatMap(({ title, rows: secRows }) => {
                  const head =
                    title.trim() !== '' ? (
                      <tr key={`h-${title}`} className="bg-zinc-50">
                        <td
                          colSpan={6}
                          className="border-t border-zinc-200 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-600"
                        >
                          {title}
                        </td>
                      </tr>
                    ) : null;
                  const bodyRows = secRows.map((row) => {
                    const activeItem = activeChefProductionBoardBlockItem(
                      row,
                      activeBlock?.id ?? null,
                      ljBlockId,
                      vdBlockId,
                    );
                    const ljT = row.ljItem?.targetQty ?? 0;
                    const vdT = row.vdItem?.targetQty ?? 0;
                    const activeTarget = activeItem?.targetQty ?? 0;
                    const sl = activeItem ? (byBlockItemId.get(activeItem.id) ?? null) : null;
                    const lineId = sl?.id ?? null;
                    const draftStr = lineId ? (hechoDraft[lineId] ?? '') : '';
                    const parsedDraft = parseQty(draftStr);
                    const hechoNum =
                      lineId &&
                      parsedDraft != null &&
                      !Number.isNaN(parsedDraft) &&
                      draftStr.trim() !== ''
                        ? parsedDraft
                        : sl?.qtyOnHand != null && !Number.isNaN(Number(sl.qtyOnHand))
                          ? Number(sl.qtyOnHand)
                          : 0;
                    const hacer = productionQtyToMake(activeTarget, sl ? hechoNum : null);
                    const rowTint =
                      !activeItem || !sl || isClosed
                        ? 'bg-zinc-50/50'
                        : hacer > 0
                          ? 'bg-rose-50/90'
                          : 'bg-emerald-50/80';
                    const saving = lineId !== null && savingLineId === lineId;

                    return (
                      <tr key={row.labelKey} className={[rowTint, 'border-b border-zinc-100'].join(' ')}>
                        <td className="max-w-[9rem] px-2 py-1 font-bold leading-tight text-zinc-900 sm:max-w-none">
                          {row.displayLabel}
                        </td>
                        <td className="px-1 py-1 text-center tabular-nums text-zinc-800">{ljT}</td>
                        <td className="px-1 py-1 text-center tabular-nums text-zinc-800">{vdT}</td>
                        <td className="px-1 py-1 text-center">
                          {activeItem && lineId ? (
                            <input
                              inputMode="decimal"
                              disabled={isClosed || saving}
                              value={draftStr}
                              aria-label={`Hecho ${row.displayLabel}`}
                              onChange={(e) => {
                                const v = e.target.value;
                                setHechoDraft((p) => {
                                  const n = { ...p, [lineId]: v };
                                  hechoDraftRef.current = n;
                                  return n;
                                });
                                scheduleDebouncedPersist(lineId, v);
                              }}
                              onBlur={() => {
                                clearDebouncePersist();
                                void persistHecho(lineId, hechoDraftRef.current[lineId] ?? '');
                              }}
                              className="w-14 rounded border border-zinc-300 bg-white px-1 py-0.5 text-center text-sm font-black tabular-nums text-zinc-900 disabled:opacity-50"
                            />
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-1 py-1 text-center text-sm font-black tabular-nums text-zinc-900">{hacer}</td>
                        <td className="px-1 py-1">
                          {activeItem && lineId && !isClosed ? (
                            <div className="flex justify-end gap-0.5">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void bumpHecho(lineId, 1)}
                                className="min-h-8 min-w-8 rounded border border-zinc-300 bg-white text-[10px] font-black text-zinc-900 active:scale-[0.98] disabled:opacity-45"
                              >
                                +1
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void bumpHecho(lineId, 5)}
                                className="min-h-8 min-w-8 rounded border border-zinc-300 bg-white text-[10px] font-black text-zinc-900 active:scale-[0.98] disabled:opacity-45"
                              >
                                +5
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  });
                  return head ? [head, ...bodyRows] : bodyRows;
                })}
              </tbody>
            </table>
          </div>

          {!isClosed && blocks.length > 1 && activeBlock ? (
            <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] font-bold text-zinc-600">
              <span className="uppercase">Periodo</span>
              <button
                type="button"
                disabled={isClosed}
                onClick={() => void setForcedBlock(null)}
                className={
                  session.forcedBlockId == null
                    ? 'rounded bg-zinc-900 px-2 py-1 text-white'
                    : 'rounded border border-zinc-200 bg-white px-2 py-1'
                }
              >
                Auto
              </button>
              {[...blocks]
                .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    disabled={isClosed}
                    onClick={() => void setForcedBlock(b.id)}
                    className={
                      session.forcedBlockId === b.id ||
                      (session.forcedBlockId == null && activeBlock.id === b.id)
                        ? 'rounded bg-zinc-900 px-2 py-1 text-white'
                        : 'rounded border border-zinc-200 bg-white px-2 py-1'
                    }
                  >
                    {b.label}
                  </button>
                ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function ProduccionPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-zinc-600">Cargando…</p>}>
      <ProduccionBoardInner />
    </Suspense>
  );
}
