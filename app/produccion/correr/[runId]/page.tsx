'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  type ChefProductionBlockItem,
  type ChefProductionDayBlock,
  type ChefProductionSession,
  type ChefProductionSessionLine,
  type ChefProductionSnapshotV1,
  type ChefProductionTemplate,
  completeChefProductionSession,
  ensureChefProductionSessionLinesForTemplate,
  fetchChefProductionBlockItems,
  fetchChefProductionDayBlocks,
  fetchChefProductionSessionLines,
  fetchChefProductionSessionRow,
  fetchChefProductionTemplate,
  formatProductionMigrationError,
  productionQtyToMake,
  resolveChefProductionDayBlock,
  updateChefProductionSessionForcedBlock,
  updateChefProductionSessionLineQty,
} from '@/lib/chef-ops-supabase';

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

function isSnapshotV1(x: unknown): x is ChefProductionSnapshotV1 {
  return (
    x != null &&
    typeof x === 'object' &&
    (x as ChefProductionSnapshotV1).version === 1 &&
    Array.isArray((x as ChefProductionSnapshotV1).sections)
  );
}

export default function ProduccionCorrerPage() {
  const params = useParams();
  const sessionId = typeof params.runId === 'string' ? params.runId : '';
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ChefProductionSession | null>(null);
  const [template, setTemplate] = useState<ChefProductionTemplate | null>(null);
  const [blocks, setBlocks] = useState<ChefProductionDayBlock[]>([]);
  const [blockItems, setBlockItems] = useState<ChefProductionBlockItem[]>([]);
  const [sessionLines, setSessionLines] = useState<ChefProductionSessionLine[]>([]);
  const [hechoDraft, setHechoDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId || !localId || !supabaseOk) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const s = await fetchChefProductionSessionRow(supabase, sessionId);
      if (!s || s.localId !== localId) {
        setSession(null);
        setTemplate(null);
        setBanner('Lista no encontrada o de otro local.');
        return;
      }
      setSession(s);
      const tpl = await fetchChefProductionTemplate(supabase, localId, s.templateId);
      setTemplate(tpl);
      const bl = await fetchChefProductionDayBlocks(supabase, s.templateId);
      setBlocks(bl);
      const ab = resolveChefProductionDayBlock(bl, s.workDate, s.forcedBlockId);
      const items = ab ? await fetchChefProductionBlockItems(supabase, ab.id) : [];
      setBlockItems(items);
      if (!s.completedAt) {
        await ensureChefProductionSessionLinesForTemplate(supabase, s.id, s.templateId);
      }
      const sl = await fetchChefProductionSessionLines(supabase, sessionId);
      setSessionLines(sl);
      const h: Record<string, string> = {};
      for (const x of sl) {
        h[x.id] = fmtQty(x.qtyOnHand);
      }
      setHechoDraft(h);
    } catch (e) {
      setBanner(formatProductionMigrationError(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId, localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const byBlockItemId = useMemo(() => {
    const m = new Map<string, ChefProductionSessionLine>();
    for (const sl of sessionLines) m.set(sl.blockItemId, sl);
    return m;
  }, [sessionLines]);

  const activeBlock = useMemo(() => {
    if (!session) return null;
    return resolveChefProductionDayBlock(blocks, session.workDate, session.forcedBlockId);
  }, [session, blocks]);

  const isClosed = Boolean(session?.completedAt);
  const snapshot = session?.linesSnapshot;
  const snapshotOk = isClosed && isSnapshotV1(snapshot) ? snapshot : null;

  const setForcedBlock = async (blockId: string | null) => {
    if (!supabaseOk || !session || isClosed) return;
    setSavingId('_block');
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await updateChefProductionSessionForcedBlock(supabase, session.id, blockId);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo cambiar el bloque.');
    } finally {
      setSavingId(null);
    }
  };

  const persistHecho = async (sessionLineId: string, displayValue: string) => {
    if (!supabaseOk || isClosed) return;
    const qty = parseQty(displayValue);
    setSavingId(sessionLineId);
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
      setSavingId(null);
    }
  };

  const bumpHecho = async (sessionLineId: string, blockItemId: string, delta: number) => {
    if (!supabaseOk || isClosed) return;
    const cur = byBlockItemId.get(blockItemId);
    const base = cur?.qtyOnHand != null && !Number.isNaN(cur.qtyOnHand) ? cur.qtyOnHand : 0;
    const next = Math.max(0, base + delta);
    setHechoDraft((prev) => ({ ...prev, [sessionLineId]: fmtQty(next) }));
    await persistHecho(sessionLineId, String(next));
  };

  const closeSession = async () => {
    if (!supabaseOk || !session || isClosed) return;
    if (!window.confirm('¿Registrar cierre de esta lista? Quedará en el historial con la foto del momento.')) return;
    setClosing(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await completeChefProductionSession(supabase, session.id);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo cerrar.');
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero eyebrow="Producción" title={template?.name ?? 'Lista del día'} slim />

      <Link
        href="/produccion/ejecutar"
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-700 hover:text-[#D32F2F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Otras listas
      </Link>

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-center text-sm text-zinc-500">Sesión o Supabase no disponibles.</p>
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : !session ? null : snapshotOk ? (
        <>
          <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Lista cerrada</p>
            <p className="mt-1 text-sm font-bold text-zinc-900">
              {session.workDate}
              {session.periodLabel ? ` · ${session.periodLabel}` : ''}
            </p>
            <p className="mt-1 text-xs font-semibold text-zinc-600">Bloque: {snapshotOk.blockLabel}</p>
            <p className="mt-2 text-[11px] text-zinc-500">
              Cerrada {session.completedAt ? new Date(session.completedAt).toLocaleString() : ''}
            </p>
          </div>
          <div className="space-y-5">
            {snapshotOk.sections.map((sec) => (
              <div key={sec.title} className="space-y-2">
                <p className="px-1 text-[11px] font-black uppercase tracking-wider text-zinc-500">{sec.title}</p>
                <div className="space-y-2">
                  {sec.items.map((it, idx) => (
                    <div
                      key={`${it.label}-${idx}`}
                      className="rounded-xl border border-zinc-200/90 bg-white px-3 py-3 shadow-sm ring-1 ring-zinc-50"
                    >
                      <p className="text-sm font-bold leading-snug text-zinc-900">{it.label}</p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] font-bold uppercase text-zinc-400">Obj.</p>
                          <p className="mt-0.5 text-sm font-black tabular-nums text-zinc-900">{it.objective}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-zinc-400">Hecho</p>
                          <p className="mt-0.5 text-sm font-black tabular-nums text-zinc-800">
                            {it.hecho ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-zinc-400">Hacer</p>
                          <p className="mt-0.5 text-sm font-black tabular-nums text-[#B91C1C]">{it.hacer}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : isClosed ? (
        <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50 px-4 py-8 text-center shadow-sm ring-1 ring-zinc-100">
          <p className="text-sm font-bold text-zinc-800">Lista cerrada</p>
          <p className="mt-2 text-xs text-zinc-600">
            No hay resumen guardado para esta entrada. Las listas nuevas guardan el detalle al cerrar.
          </p>
          <Link
            href="/produccion/historial"
            className="mt-4 inline-block text-xs font-bold text-[#D32F2F] underline"
          >
            Volver al historial
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Día de trabajo</p>
                <p className="text-sm font-bold text-zinc-900">{session.workDate}</p>
                {session.periodLabel ? (
                  <p className="mt-1 text-xs font-semibold text-zinc-600">{session.periodLabel}</p>
                ) : null}
              </div>
            </div>

            {!activeBlock && blocks.length > 0 ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-950 ring-1 ring-amber-100">
                Ningún bloque coincide con este día. Elige uno abajo para ver productos y objetivos.
              </p>
            ) : null}

            {blocks.length > 0 ? (
              <div className="mt-4">
                <p className="text-[10px] font-black uppercase text-zinc-500">Bloque del día</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={isClosed || savingId === '_block'}
                    onClick={() => void setForcedBlock(null)}
                    className={[
                      'rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wide transition',
                      session.forcedBlockId == null
                        ? 'bg-[#D32F2F] text-white shadow-sm'
                        : 'border border-zinc-200 bg-zinc-50 text-zinc-700',
                    ].join(' ')}
                  >
                    Auto
                  </button>
                  {[...blocks]
                    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                    .map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        disabled={isClosed || savingId === '_block'}
                        onClick={() => void setForcedBlock(b.id)}
                        className={[
                          'rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wide transition',
                          session.forcedBlockId === b.id ||
                          (session.forcedBlockId == null && activeBlock?.id === b.id)
                            ? 'bg-[#D32F2F] text-white shadow-sm'
                            : 'border border-zinc-200 bg-zinc-50 text-zinc-700',
                        ].join(' ')}
                      >
                        {b.label}
                      </button>
                    ))}
                </div>
                <p className="mt-2 text-[10px] font-medium text-zinc-500">
                  Activo:{' '}
                  <span className="font-bold text-zinc-800">{activeBlock?.label ?? '—'}</span>
                  {activeBlock ? ` · ${blockItems.length} producto${blockItems.length === 1 ? '' : 's'}` : ''}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-center text-xs font-semibold text-zinc-500">
                Esta plantilla no tiene bloques de día. Configúrala en Plantillas.
              </p>
            )}

            <button
              type="button"
              disabled={closing}
              onClick={() => void closeSession()}
              className="mt-4 w-full rounded-xl border border-zinc-300 bg-zinc-900 py-3 text-sm font-black uppercase tracking-wide text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {closing ? 'Guardando…' : 'Registrar cierre'}
            </button>
          </div>

          <div className="space-y-2">
            {!activeBlock ? (
              <p className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center text-sm text-zinc-600">
                Selecciona un bloque para ver la lista de productos.
              </p>
            ) : blockItems.length === 0 ? (
              <p className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center text-sm text-zinc-600">
                Este bloque no tiene productos. Añádelos en Plantillas.
              </p>
            ) : (
              [...blockItems]
                .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                .map((it) => {
                  const sl = byBlockItemId.get(it.id);
                  if (!sl) return null;
                  const objective = it.targetQty;
                  const onHand = parseQty(hechoDraft[sl.id] ?? '');
                  const hechoEffective =
                    onHand != null && !Number.isNaN(onHand) ? onHand : (sl.qtyOnHand ?? null);
                  const hacer = productionQtyToMake(objective, hechoEffective);
                  const saving = savingId === sl.id;
                  return (
                    <div
                      key={it.id}
                      className="rounded-xl border border-zinc-200/90 bg-white px-3 py-3 shadow-sm ring-1 ring-zinc-50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-bold leading-snug text-zinc-900">{it.label}</p>
                        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-600">
                          Obj. {objective}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div className="flex flex-1 items-center gap-2">
                          <span className="text-[10px] font-bold uppercase text-zinc-400">Hecho</span>
                          <button
                            type="button"
                            disabled={isClosed || saving}
                            onClick={() => void bumpHecho(sl.id, it.id, -1)}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-800 shadow-sm active:scale-[0.98] disabled:opacity-45"
                            aria-label="Menos uno"
                          >
                            <Minus className="h-5 w-5" />
                          </button>
                          <input
                            disabled={isClosed || saving}
                            inputMode="decimal"
                            value={hechoDraft[sl.id] ?? ''}
                            onChange={(e) =>
                              setHechoDraft((prev) => ({ ...prev, [sl.id]: e.target.value }))
                            }
                            onBlur={(e) => void persistHecho(sl.id, e.target.value)}
                            className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 text-center text-base font-black tabular-nums text-zinc-900 outline-none focus:border-[#D32F2F]/40 disabled:opacity-60"
                            placeholder="0"
                          />
                          <button
                            type="button"
                            disabled={isClosed || saving}
                            onClick={() => void bumpHecho(sl.id, it.id, 1)}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-800 shadow-sm active:scale-[0.98] disabled:opacity-45"
                            aria-label="Más uno"
                          >
                            <Plus className="h-5 w-5" />
                          </button>
                        </div>
                        <div className="rounded-xl bg-zinc-50 px-4 py-2 text-center ring-1 ring-zinc-100 sm:min-w-[6.5rem]">
                          <p className="text-[10px] font-bold uppercase text-zinc-400">Hacer</p>
                          <p className="text-xl font-black tabular-nums text-[#B91C1C]">{hacer}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          <Link href="/produccion/historial" className="block text-center text-xs font-bold text-[#D32F2F] underline">
            Ver historial
          </Link>
        </>
      )}
    </div>
  );
}
