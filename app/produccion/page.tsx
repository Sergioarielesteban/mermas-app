'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  activeChefProductionBoardBlockItem,
  type ChefProductionBoardRow,
  completeChefProductionSession,
  ensureChefProductionSessionLinesForTemplate,
  type ChefProductionDayBlock,
  fetchChefProductionDayBlocks,
  fetchChefProductionZones,
  fetchChefProductionSessionLines,
  fetchChefProductionSessionRow,
  fetchChefProductionTemplates,
  fetchFullProductionDayBoardRowsForTemplate,
  formatProductionMigrationError,
  getOrCreateChefProductionSession,
  mergedRowSessionLine,
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

function groupRowsByKitchenSection(rows: ChefProductionBoardRow[]): { title: string; rows: ChefProductionBoardRow[] }[] {
  const anyNamed = rows.some((r) => r.kitchenSection.trim() !== '');
  const m = new Map<string, ChefProductionBoardRow[]>();
  for (const row of rows) {
    const raw = row.kitchenSection.trim();
    const key = anyNamed ? raw || 'Sin zona' : '';
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
  useEffect(() => {
    hechoDraftRef.current = hechoDraft;
  }, [hechoDraft]);

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

  /** Si la fecha no coincide con ningún bloque, usar periodo Lun–Jue (o primer bloque), sin vaciar la tabla. */
  const effectivePeriodBlockId = useMemo(() => {
    if (activeBlock) return activeBlock.id;
    return (
      ljBlockId ??
      vdBlockId ??
      [...blocks].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))[0]?.id ??
      null
    );
  }, [activeBlock, ljBlockId, vdBlockId, blocks]);

  const effectivePeriodBlock = useMemo(
    () => (effectivePeriodBlockId ? blocks.find((b) => b.id === effectivePeriodBlockId) ?? null : null),
    [blocks, effectivePeriodBlockId],
  );

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

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_LAST_TEMPLATE, templateEff);
      }

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

      const zones = await fetchChefProductionZones(supabase, templateEff).catch(
        () => [] as { id: string; label: string }[],
      );
      const zoneMap = new Map(zones.map((z) => [z.id, z.label]));
      const rows = await fetchFullProductionDayBoardRowsForTemplate(supabase, templateEff, {
        zoneLabel: (zid) => (zid ? zoneMap.get(zid) ?? '' : ''),
      });
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de sesión cuando el perfil está listo
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

  const irEtiquetasImprimir = () => {
    if (!session || !templateId.trim()) return;
    setBanner(null);
    router.push(
      `/produccion/etiquetas/print?date=${encodeURIComponent(session.workDate)}&templateId=${encodeURIComponent(templateId)}`,
    );
  };

  const sectionGroups = useMemo(() => groupRowsByKitchenSection(boardRows), [boardRows]);

  const isClosed = Boolean(session?.completedAt);

  return (
    <div className="touch-pan-y w-full min-w-0 max-w-full overflow-x-hidden pb-16 pt-0 [overflow-wrap:anywhere] sm:pt-1">
      <header className="sticky top-0 z-20 w-full max-w-full border-b border-zinc-200/90 bg-[#fafafa]/95 py-3 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-[#fafafa]/88 sm:static sm:z-auto sm:mb-1 sm:border-0 sm:bg-transparent sm:py-0 sm:shadow-none sm:backdrop-blur-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-1">
            <h1 className="font-serif text-[0.95rem] font-black leading-tight tracking-tight text-zinc-900 sm:text-lg">
              Producción del día
            </h1>
            <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-500 sm:whitespace-normal">{templateName || '—'}</p>
          </div>
          <nav className="flex shrink-0 flex-wrap justify-end gap-1.5 text-[10px] font-bold sm:gap-2 sm:text-[11px]">
            <Link
              href="/produccion/planes"
              className="rounded-lg border border-zinc-200/90 bg-white px-2.5 py-1.5 text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              Plantillas
            </Link>
            <Link
              href="/produccion/historial"
              className="rounded-lg border border-zinc-200/90 bg-white px-2.5 py-1.5 text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              Historial
            </Link>
          </nav>
        </div>

        <div className="mt-3 grid gap-2.5 sm:mt-4 sm:flex sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-0 flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 sm:min-w-[10rem] sm:flex-1">
            Fecha
            <input
              type="date"
              value={workDate}
              disabled={isClosed || loading}
              onChange={(e) => setWorkDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-semibold text-zinc-900 shadow-inner shadow-zinc-100/80 outline-none ring-0 transition focus:border-zinc-400 disabled:opacity-50"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 sm:min-w-[12rem] sm:flex-1">
            Plantilla
            <select
              value={templateId}
              disabled={isClosed || loading || templates.length === 0}
              onChange={(e) => setTemplateId(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-semibold text-zinc-900 shadow-inner shadow-zinc-100/80 outline-none transition focus:border-zinc-400 disabled:opacity-50"
            >
              {templates.length === 0 ? <option value="">Sin plantillas</option> : null}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-2 sm:pl-0 md:ml-auto">
            <button
              type="button"
              disabled={closing || !session?.id || isClosed}
              onClick={() => void guardarDia()}
              className="col-span-2 h-10 min-w-0 rounded-lg border border-zinc-900 bg-zinc-900 px-2 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-45 sm:col-span-1 sm:px-3"
            >
              {closing ? '…' : 'Guardar día'}
            </button>
            <Link
              href="/produccion/etiquetas"
              className="flex h-10 min-w-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-1.5 text-center text-[10px] font-black uppercase leading-tight tracking-wide text-zinc-900 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 sm:px-2.5 sm:text-[11px]"
            >
              Etiquetas a mano
            </Link>
            <button
              type="button"
              disabled={!session?.id || !templateId.trim()}
              onClick={irEtiquetasImprimir}
              className="h-10 min-w-0 rounded-lg border border-zinc-200 bg-white px-1.5 text-[10px] font-black uppercase leading-tight tracking-wide text-zinc-900 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-45 sm:px-2.5 sm:text-[11px]"
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
              <p className="text-[11px] font-bold text-amber-950">
                Ningún bloque coincide con esta fecha de forma automática. Se usa <span className="font-black">Lun–jueves</span> por defecto para objetivos y «hacer». Puedes forzar otro periodo aquí sin perder la lista de productos.
              </p>
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

          {effectivePeriodBlock ? (
            <p className="mt-2 text-[11px] font-semibold text-zinc-600">
              Periodo aplicado:{' '}
              <span className="font-black text-zinc-900">{effectivePeriodBlock.label}</span>
              {session.forcedBlockId ? ' · manual' : activeBlock ? ' · auto' : ' · Lun–jue por defecto'}
            </p>
          ) : null}

          <div className="mt-3 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-zinc-200/95 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <table className="table-fixed w-full min-w-0 max-w-full border-collapse text-left text-xs">
              <colgroup>
                <col style={{ width: 'auto' }} />
                <col style={{ width: '2.375rem' }} />
                <col style={{ width: '2.375rem' }} />
                <col style={{ width: '3.125rem' }} />
                <col style={{ width: '2.5rem' }} />
              </colgroup>
              <thead>
                <tr className="h-10 border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-zinc-100/90 text-[9px] font-black uppercase tracking-wide text-zinc-600">
                  <th className="min-w-0 px-2 py-2 pl-2.5">Producto</th>
                  <th className="px-0 py-2 text-center tabular-nums">L–J</th>
                  <th className="px-0 py-2 text-center tabular-nums">V–D</th>
                  <th className="px-0 py-2 text-center text-[8px] sm:text-[9px]">Hecho</th>
                  <th className="px-0 py-2 text-center tabular-nums">Hacer</th>
                </tr>
              </thead>
              <tbody>
                {sectionGroups.flatMap(({ title, rows: secRows }) => {
                  const head =
                    title.trim() !== '' ? (
                      <tr key={`h-${title}`} className="bg-zinc-50">
                        <td
                          colSpan={5}
                          className="border-t border-zinc-200 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-600"
                        >
                          Zona: {title}
                        </td>
                      </tr>
                    ) : null;
                  const bodyRows = secRows.map((row) => {
                    const activeItem = activeChefProductionBoardBlockItem(
                      row,
                      effectivePeriodBlockId,
                      ljBlockId,
                      vdBlockId,
                    );
                    const sl = mergedRowSessionLine(row, byBlockItemId);
                    const ljT = row.ljItem?.targetQty ?? (row.extraItem ? row.extraItem.targetQty : 0);
                    const vdT = row.vdItem?.targetQty ?? 0;
                    const activeTarget = activeItem?.targetQty ?? 0;
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
                      !sl || isClosed ? 'bg-zinc-50/50' : hacer > 0 ? 'bg-rose-50/90' : 'bg-emerald-50/80';
                    const saving = lineId !== null && savingLineId === lineId;

                    return (
                      <tr key={row.rowKey} className={[rowTint, 'border-b border-zinc-100 last:border-b-0'].join(' ')}>
                        <td className="min-w-0 max-w-0 break-words px-2 py-2 pl-2.5 text-[13px] font-bold leading-snug text-zinc-900 sm:text-xs sm:py-2.5">
                          {row.displayLabel}
                        </td>
                        <td className="px-0 py-2 text-center text-[12px] tabular-nums text-zinc-800 sm:py-2.5 sm:text-xs">{ljT}</td>
                        <td className="px-0 py-2 text-center text-[12px] tabular-nums text-zinc-800 sm:py-2.5 sm:text-xs">{vdT}</td>
                        <td className="px-0 py-2 text-center sm:py-2.5">
                          {sl && lineId ? (
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
                              className="box-border h-8 w-[2.75rem] max-w-full rounded-md border border-zinc-300/90 bg-white px-0.5 text-center text-xs font-black tabular-nums text-zinc-900 shadow-inner shadow-zinc-100/50 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400/30 disabled:opacity-50 sm:h-9 sm:w-12 sm:px-1 sm:text-sm"
                            />
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-0 py-2 text-center text-xs font-black tabular-nums text-zinc-900 sm:py-2.5 sm:text-sm">
                          {hacer}
                        </td>
                      </tr>
                    );
                  });
                  return head ? [head, ...bodyRows] : bodyRows;
                })}
              </tbody>
            </table>
            </div>
          </div>

          {!isClosed && blocks.length > 1 ? (
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
                      (session.forcedBlockId == null && effectivePeriodBlockId === b.id)
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
