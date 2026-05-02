'use client';

import { useParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
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
  resolveChefProductionDayBlock,
  updateChefProductionSessionForcedBlock,
  updateChefProductionSessionLineQty,
} from '@/lib/chef-ops-supabase';
import { appConfirm } from '@/lib/app-dialog-bridge';

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

function faltanCount(objective: number, stock: number | null): number {
  const s = stock != null && !Number.isNaN(stock) ? stock : 0;
  const d = objective - s;
  return d > 0 ? d : 0;
}

function excesoCount(objective: number, stock: number | null): number {
  const s = stock != null && !Number.isNaN(stock) ? stock : 0;
  return s > objective ? s - objective : 0;
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
  const [stockDraft, setStockDraft] = useState<Record<string, string>>({});
  const stockDraftRef = useRef<Record<string, string>>({});
  stockDraftRef.current = stockDraft;
  const [manualLineId, setManualLineId] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const debouncePersistRef = useRef<number | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearDebouncePersist = useCallback(() => {
    if (debouncePersistRef.current != null) {
      window.clearTimeout(debouncePersistRef.current);
      debouncePersistRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearLongPressTimer();
      clearDebouncePersist();
    },
    [clearLongPressTimer, clearDebouncePersist],
  );

  useEffect(() => {
    if (manualLineId && manualInputRef.current) {
      manualInputRef.current.focus();
      manualInputRef.current.select();
    }
  }, [manualLineId]);

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
      setStockDraft(h);
      setManualLineId(null);
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

  const persistStock = useCallback(
    async (sessionLineId: string, displayValue: string) => {
      if (!supabaseOk || isClosed) return;
      const qty = parseQty(displayValue);
      setSavingId(sessionLineId);
      setBanner(null);
      try {
        const supabase = getSupabaseClient()!;
        await updateChefProductionSessionLineQty(supabase, sessionLineId, qty);
        setStockDraft((prev) => ({ ...prev, [sessionLineId]: fmtQty(qty) }));
        setSessionLines((prev) =>
          prev.map((r) => (r.id === sessionLineId ? { ...r, qtyOnHand: qty } : r)),
        );
      } catch (e) {
        setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
      } finally {
        setSavingId(null);
      }
    },
    [supabaseOk, isClosed],
  );

  const scheduleDebouncedPersist = useCallback(
    (sessionLineId: string, displayValue: string) => {
      clearDebouncePersist();
      debouncePersistRef.current = window.setTimeout(() => {
        debouncePersistRef.current = null;
        void persistStock(sessionLineId, displayValue);
      }, 500);
    },
    [clearDebouncePersist, persistStock],
  );

  const bumpStock = async (sessionLineId: string, blockItemId: string, delta: number) => {
    if (!supabaseOk || isClosed) return;
    clearLongPressTimer();
    clearDebouncePersist();
    setManualLineId((cur) => (cur === sessionLineId ? null : cur));
    const cur = byBlockItemId.get(blockItemId);
    const draftN = parseQty(stockDraftRef.current[sessionLineId] ?? '');
    const base =
      draftN != null && !Number.isNaN(draftN)
        ? draftN
        : cur?.qtyOnHand != null && !Number.isNaN(cur.qtyOnHand)
          ? cur.qtyOnHand
          : 0;
    const next = Math.max(0, base + delta);
    const nextStr = fmtQty(next);
    stockDraftRef.current = { ...stockDraftRef.current, [sessionLineId]: nextStr };
    setStockDraft((prev) => ({ ...prev, [sessionLineId]: nextStr }));
    await persistStock(sessionLineId, String(next));
  };

  /** Pone stock = objetivo (un toque: cubrir lo que falta). */
  const applyMakeAll = async (sessionLineId: string, objectiveValue: number) => {
    if (!supabaseOk || isClosed) return;
    clearLongPressTimer();
    clearDebouncePersist();
    setManualLineId((cur) => (cur === sessionLineId ? null : cur));
    const nextStr = fmtQty(objectiveValue);
    stockDraftRef.current = { ...stockDraftRef.current, [sessionLineId]: nextStr };
    setStockDraft((prev) => ({ ...prev, [sessionLineId]: nextStr }));
    await persistStock(sessionLineId, String(objectiveValue));
  };

  const startStockLongPress = (sessionLineId: string, initialDisplay: string, disabled: boolean) => {
    if (disabled || isClosed) return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      setManualLineId(sessionLineId);
      setManualValue(initialDisplay);
    }, 550);
  };

  const closeSession = async () => {
    if (!supabaseOk || !session || isClosed) return;
    if (!(await appConfirm('¿Registrar cierre de esta lista? Quedará en el historial con la foto del momento.'))) return;
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

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-center text-sm font-medium text-zinc-700">Sesión o Supabase no disponibles.</p>
      ) : loading ? (
        <p className="text-center text-sm font-medium text-zinc-700">Cargando…</p>
      ) : !session ? null : snapshotOk ? (
        <>
          <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-700">Lista cerrada</p>
            <p className="mt-1 text-sm font-bold text-zinc-900">
              {session.workDate}
              {session.periodLabel ? ` · ${session.periodLabel}` : ''}
            </p>
            <p className="mt-1 text-xs font-semibold text-zinc-600">Bloque: {snapshotOk.blockLabel}</p>
            <p className="mt-2 text-[11px] font-medium text-zinc-700">
              Cerrada {session.completedAt ? new Date(session.completedAt).toLocaleString() : ''}
            </p>
          </div>
          <div className="space-y-5">
            {snapshotOk.sections.map((sec) => (
              <div key={sec.title} className="space-y-2">
                <p className="px-1 text-[11px] font-black uppercase tracking-wider text-zinc-700">{sec.title}</p>
                <div className="space-y-2">
                  {sec.items.map((it, idx) => (
                    <div
                      key={`${it.label}-${idx}`}
                      className="rounded-lg border border-zinc-200/90 bg-white px-2 py-1.5 shadow-sm ring-1 ring-zinc-50"
                    >
                      <p className="truncate text-xs font-black text-zinc-900">{it.label}</p>
                      <div className="mt-1 grid grid-cols-3 gap-1 text-center">
                        <div>
                          <p className="text-[8px] font-bold uppercase text-zinc-600">Obj.</p>
                          <p className="text-xs font-black tabular-nums text-zinc-900">{it.objective}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-bold uppercase text-zinc-600">Stock</p>
                          <p className="text-xs font-black tabular-nums text-zinc-800">{it.hecho ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-bold uppercase text-zinc-600">Faltan</p>
                          <p
                            className={`text-xs font-black tabular-nums ${
                              it.hacer > 0 ? 'text-[#B91C1C]' : 'text-emerald-600'
                            }`}
                          >
                            {it.hacer}
                          </p>
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
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-200/90 bg-white p-3 shadow-sm ring-1 ring-zinc-100 sm:p-3.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wide text-zinc-700">Día de trabajo</p>
                <p className="text-xs font-bold text-zinc-900 sm:text-sm">{session.workDate}</p>
                {session.periodLabel ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-zinc-600">{session.periodLabel}</p>
                ) : null}
              </div>
            </div>

            {!activeBlock && blocks.length > 0 ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-center text-[11px] font-bold text-amber-950 ring-1 ring-amber-100">
                Ningún bloque coincide con este día. Elige uno abajo.
              </p>
            ) : null}

            {blocks.length > 0 ? (
              <div className="mt-2">
                <p className="text-[9px] font-black uppercase text-zinc-700">Bloque del día</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <button
                    type="button"
                    disabled={isClosed || savingId === '_block'}
                    onClick={() => void setForcedBlock(null)}
                    className={[
                      'rounded-md px-2 py-1.5 text-[10px] font-black uppercase tracking-wide transition sm:px-2.5 sm:text-[11px]',
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
                          'max-w-[11rem] truncate rounded-md px-2 py-1.5 text-[10px] font-black uppercase tracking-wide transition sm:max-w-none sm:px-2.5 sm:text-[11px]',
                          session.forcedBlockId === b.id ||
                          (session.forcedBlockId == null && activeBlock?.id === b.id)
                            ? 'bg-[#D32F2F] text-white shadow-sm'
                            : 'border border-zinc-200 bg-zinc-50 text-zinc-700',
                        ].join(' ')}
                        title={b.label}
                      >
                        {b.label}
                      </button>
                    ))}
                </div>
                <p className="mt-1 text-[9px] font-semibold text-zinc-800">
                  <span className="font-bold text-zinc-900">{activeBlock?.label ?? '—'}</span>
                  {activeBlock ? ` · ${blockItems.length} prod.` : ''}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-center text-[11px] font-semibold text-zinc-800">
                Sin bloques de día. Configúralo en Plantillas.
              </p>
            )}

            <button
              type="button"
              disabled={closing}
              onClick={() => void closeSession()}
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-zinc-900 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 sm:py-3 sm:text-sm"
            >
              {closing ? 'Guardando…' : 'Registrar cierre'}
            </button>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            {!activeBlock ? (
              <p className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center text-sm font-medium text-zinc-800">
                Selecciona un bloque para ver la lista de productos.
              </p>
            ) : blockItems.length === 0 ? (
              <p className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center text-sm font-medium text-zinc-800">
                Este bloque no tiene productos. Añádelos en Plantillas.
              </p>
            ) : (
              [...blockItems]
                .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                .map((it) => {
                  const sl = byBlockItemId.get(it.id);
                  if (!sl) return null;
                  const objective = it.targetQty;
                  const parsedDraft = parseQty(stockDraft[sl.id] ?? '');
                  const stockEffective =
                    parsedDraft != null && !Number.isNaN(parsedDraft)
                      ? parsedDraft
                      : (sl.qtyOnHand ?? null);
                  const stockNum =
                    stockEffective != null && !Number.isNaN(stockEffective) ? stockEffective : 0;
                  const stockDisplayStr = String(stockNum);
                  const manualHere = manualLineId === sl.id;
                  const parsedManual = parseQty(manualValue);
                  const effectiveForFaltan =
                    manualHere && parsedManual != null && !Number.isNaN(parsedManual)
                      ? parsedManual
                      : stockEffective;
                  const faltan = faltanCount(objective, effectiveForFaltan);
                  const exceso = excesoCount(objective, effectiveForFaltan);
                  const saving = savingId === sl.id;
                  const controlsDisabled = isClosed || saving;
                  return (
                    <div
                      key={it.id}
                      className="rounded-lg border border-zinc-200/90 bg-white px-2 py-2 shadow-sm ring-1 ring-zinc-50 sm:px-2.5 sm:py-2"
                    >
                      <div className="flex gap-2 sm:items-center sm:gap-3">
                        {/* Izquierda: nombre + objetivo */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black leading-tight text-zinc-900 sm:text-[15px]">
                            {it.label}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-zinc-600">
                            Obj. <span className="text-zinc-800">{objective}</span>
                          </p>
                        </div>

                        {/* Centro-derecha: estado + HACER en columna compacta */}
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {exceso > 0 ? (
                            <span className="text-right text-[10px] font-bold leading-none text-zinc-500">
                              Exc.{' '}
                              <span className="tabular-nums text-amber-600">+{exceso}</span>
                            </span>
                          ) : faltan > 0 ? (
                            <div className="flex flex-col items-end leading-none">
                              <span className="text-[8px] font-black uppercase text-zinc-500">Faltan</span>
                              <span className="text-2xl font-black tabular-nums text-[#B91C1C] sm:text-[26px]">
                                {faltan}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm font-black leading-none text-emerald-600 sm:text-base">
                              OK
                            </span>
                          )}
                          {faltan > 0 ? (
                            <button
                              type="button"
                              disabled={controlsDisabled}
                              onClick={() => void applyMakeAll(sl.id, objective)}
                              className="rounded-md bg-[#D32F2F] px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow active:scale-[0.98] disabled:opacity-45 sm:px-2.5 sm:text-[11px]"
                            >
                              Hacer {faltan}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* Stock: fila compacta bajo el texto */}
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2">
                        <span className="text-[9px] font-black uppercase text-zinc-500">Stock</span>
                        <div className="flex items-center gap-1 sm:gap-1.5">
                          <button
                            type="button"
                            disabled={controlsDisabled}
                            onClick={() => void bumpStock(sl.id, it.id, -1)}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-zinc-300 bg-white text-zinc-900 shadow-sm active:scale-[0.97] disabled:opacity-45 sm:h-10 sm:w-10"
                            aria-label="Restar uno al stock"
                          >
                            <Minus className="h-4 w-4 stroke-[2.5] sm:h-[18px] sm:w-[18px]" />
                          </button>
                          {manualHere ? (
                            <input
                              ref={manualInputRef}
                              disabled={isClosed}
                              inputMode="decimal"
                              aria-label={`Cantidad manual: ${it.label}`}
                              value={manualValue}
                              onChange={(e) => {
                                const v = e.target.value;
                                setManualValue(v);
                                setStockDraft((prev) => {
                                  const next = { ...prev, [sl.id]: v };
                                  stockDraftRef.current = next;
                                  return next;
                                });
                                scheduleDebouncedPersist(sl.id, v);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  clearDebouncePersist();
                                  const v = (e.target as HTMLInputElement).value;
                                  void persistStock(sl.id, v);
                                  setManualLineId(null);
                                }
                              }}
                              onBlur={(e) => {
                                clearDebouncePersist();
                                void persistStock(sl.id, e.target.value);
                                setManualLineId(null);
                              }}
                              className="h-9 w-[3.25rem] rounded-lg border-2 border-[#D32F2F]/50 bg-zinc-50 px-1 text-center text-lg font-black tabular-nums text-zinc-900 outline-none sm:h-10 sm:w-14 sm:text-xl"
                            />
                          ) : (
                            <span
                              className={[
                                'flex h-9 w-[3.25rem] select-none items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-lg font-black tabular-nums text-zinc-900 touch-manipulation sm:h-10 sm:w-14 sm:text-xl',
                                controlsDisabled
                                  ? 'pointer-events-none opacity-45'
                                  : 'cursor-pointer active:bg-zinc-100',
                              ].join(' ')}
                              style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                              title="Mantén pulsado para escribir cantidad"
                              aria-label={`Stock ${stockDisplayStr}. Mantén pulsado para editar`}
                              onContextMenu={(e) => e.preventDefault()}
                              onPointerDown={() =>
                                startStockLongPress(sl.id, stockDisplayStr, controlsDisabled)
                              }
                              onPointerUp={clearLongPressTimer}
                              onPointerCancel={clearLongPressTimer}
                              onPointerLeave={clearLongPressTimer}
                            >
                              {stockDisplayStr}
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={controlsDisabled}
                            onClick={() => void bumpStock(sl.id, it.id, 1)}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-zinc-300 bg-white text-zinc-900 shadow-sm active:scale-[0.97] disabled:opacity-45 sm:h-10 sm:w-10"
                            aria-label="Sumar uno al stock"
                          >
                            <Plus className="h-4 w-4 stroke-[2.5] sm:h-[18px] sm:w-[18px]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </>
      )}
    </div>
  );
}
