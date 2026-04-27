'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { EscandalloRawProduct } from '@/lib/escandallos-supabase';
import {
  computeQuickCalc,
  masterLineCostEur,
  resolveQuickCalcUsageCost,
} from '@/lib/escandallo-quick-calculator-math';
import { writeEscandalloQuickCalcPrefill } from '@/lib/escandallo-quick-calc-prefill';
import { downloadEscandalloQuickCalcPdf } from '@/lib/escandallo-quick-calc-pdf';
import { fetchPurchaseArticleCostHintsByIds } from '@/lib/purchase-articles-supabase';
import { formatMoneyEur, parsePriceInput } from '@/lib/money-format';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';

type ManualLine = { id: string; type: 'manual'; concept: string; costInput: string };
type MasterLine = {
  id: string;
  type: 'master';
  productId: string;
  productName: string;
  supplierName: string;
  costeUnitarioUso: number;
  unidadUso: string;
  qtyInput: string;
};

type QuickLine = ManualLine | MasterLine;

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function lineCostEur(line: QuickLine): number | null {
  if (line.type === 'manual') {
    const n = parsePriceInput(line.costInput);
    if (n == null || !Number.isFinite(n) || n < 0) return null;
    return n;
  }
  const q = parsePriceInput(line.qtyInput);
  if (q == null || !Number.isFinite(q) || q < 0) return null;
  return masterLineCostEur(q, line.costeUnitarioUso);
}

function parseCostTotal(lines: QuickLine[]): number {
  let sum = 0;
  for (const line of lines) {
    const c = lineCostEur(line);
    if (c != null) sum += c;
  }
  return sum;
}

function fmtPct(n: number) {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(Math.round(n)) : String(r);
}

type Props = {
  open: boolean;
  onClose: () => void;
  rawProducts: EscandalloRawProduct[];
  localId: string | null;
};

export default function EscandalloQuickCalculatorModal({ open, onClose, rawProducts, localId }: Props) {
  const router = useRouter();
  const titleId = useId();
  const sorted = useMemo(
    () => [...rawProducts].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [rawProducts],
  );

  const [hintsByArticleId, setHintsByArticleId] = useState<
    Map<string, { costeUnitarioUso: number | null; unidadUso: string | null }>
  >(() => new Map());

  const [plato, setPlato] = useState('');
  const [foodCostPct, setFoodCostPct] = useState('30');
  const [ivaPct, setIvaPct] = useState('10');
  const [lines, setLines] = useState<QuickLine[]>([]);
  const [masterQuery, setMasterQuery] = useState('');

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !localId) {
      setHintsByArticleId(new Map());
      return;
    }
    const supabase = getSupabaseClient();
    if (!isSupabaseEnabled() || !supabase) {
      setHintsByArticleId(new Map());
      return;
    }
    const ids = [...new Set(rawProducts.map((p) => p.articleId).filter(Boolean))] as string[];
    if (ids.length === 0) {
      setHintsByArticleId(new Map());
      return;
    }
    let cancelled = false;
    void fetchPurchaseArticleCostHintsByIds(supabase, localId, ids).then((m) => {
      if (!cancelled) setHintsByArticleId(m);
    });
    return () => {
      cancelled = true;
    };
  }, [open, localId, rawProducts]);

  const filteredMasters = useMemo(() => {
    const q = masterQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return sorted
      .filter(
        (p) => p.name.toLowerCase().includes(q) || p.supplierName.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [masterQuery, sorted]);

  const masterSearchActive = masterQuery.trim().length >= 2;

  const fc = parsePriceInput(foodCostPct) ?? 30;
  const iva = parsePriceInput(ivaPct) ?? 10;
  const costeTotal = useMemo(() => parseCostTotal(lines), [lines]);
  const calc = useMemo(() => computeQuickCalc(costeTotal, fc, iva), [costeTotal, fc, iva]);

  const addManual = useCallback(() => {
    setLines((L) => [...L, { id: newId('man'), type: 'manual', concept: '', costInput: '' }]);
  }, []);

  const onPickMaster = useCallback(
    (p: EscandalloRawProduct) => {
      const resolved = resolveQuickCalcUsageCost(p, hintsByArticleId);
      if (!resolved) {
        window.alert(
          'No hay coste unitario de uso en Artículos máster para este producto. Enlaza el producto a un artículo con coste de uso o añade un importe manual.',
        );
        return;
      }
      setLines((L) => [
        ...L,
        {
          id: newId('mst'),
          type: 'master',
          productId: p.id,
          productName: p.name,
          supplierName: p.supplierName,
          costeUnitarioUso: resolved.costeUnitarioUso,
          unidadUso: resolved.unidadUso,
          qtyInput: '1',
        },
      ]);
      setMasterQuery('');
    },
    [hintsByArticleId],
  );

  const clearAll = useCallback(() => {
    if (!window.confirm('¿Vaciar nombre, porcentajes y todas las líneas?')) return;
    setPlato('');
    setFoodCostPct('30');
    setIvaPct('10');
    setLines([]);
    setMasterQuery('');
  }, []);

  const printPdf = useCallback(() => {
    const lineRows: {
      type: 'manual';
      concept: string;
      importe: number;
    }[] = [];
    const masterRows: {
      type: 'master';
      productName: string;
      supplierName: string;
      costeUnitarioUso: number;
      unidadUso: string;
      cantidad: number;
      importe: number;
    }[] = [];
    for (const line of lines) {
      if (line.type === 'manual') {
        const imp = lineCostEur(line);
        if (imp == null) continue;
        lineRows.push({
          type: 'manual',
          concept: line.concept,
          importe: imp,
        });
      } else {
        const imp = lineCostEur(line);
        if (imp == null) continue;
        const q = parsePriceInput(line.qtyInput);
        masterRows.push({
          type: 'master',
          productName: line.productName,
          supplierName: line.supplierName,
          costeUnitarioUso: line.costeUnitarioUso,
          unidadUso: line.unidadUso,
          cantidad: q ?? 0,
          importe: imp,
        });
      }
    }
    downloadEscandalloQuickCalcPdf({
      nombreCalculo: plato.trim() || '—',
      lineRows: [...lineRows, ...masterRows],
      calc,
    });
  }, [lines, plato, calc]);

  const createEscandallo = useCallback(() => {
    if (
      !window.confirm(
        '¿Abrir el asistente de nueva receta? Se rellenarán el nombre del plato, el IVA y el PVP con IVA de este cálculo (si no tenías un borrador con nombre). No se guarda la receta hasta que la completes en el asistente.',
      )
    ) {
      return;
    }
    const name = plato.trim() || 'Nuevo plato';
    const saleGross = new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(calc.pvpIvaIncluido);
    const saleVat = fmtPct(iva);
    writeEscandalloQuickCalcPrefill({ name, saleGross, saleVat });
    onClose();
    router.push('/escandallos/recetas/nuevo');
  }, [plato, calc.pvpIvaIncluido, iva, onClose, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative z-[81] max-h-[min(92dvh,900px)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl ring-1 ring-zinc-200/90 sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white px-4 py-3 sm:px-5">
          <h2 id={titleId} className="text-base font-bold tracking-tight text-zinc-900 sm:text-lg">
            Calculadora rápida de platos
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Cerrar calculadora"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-zinc-600">Nombre del cálculo</label>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 ring-0 placeholder:text-zinc-400 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200/80"
                placeholder="Ej. Burger chicken"
                value={plato}
                onChange={(e) => setPlato(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-nowrap gap-3">
              <div className="min-w-0 flex-1 basis-0">
                <label className="text-xs font-semibold text-zinc-600">Food cost objetivo (%)</label>
                <input
                  className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200/80"
                  inputMode="decimal"
                  value={foodCostPct}
                  onChange={(e) => setFoodCostPct(e.target.value)}
                />
              </div>
              <div className="min-w-0 flex-1 basis-0">
                <label className="text-xs font-semibold text-zinc-600">IVA venta (%)</label>
                <input
                  className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200/80"
                  inputMode="decimal"
                  value={ivaPct}
                  onChange={(e) => setIvaPct(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-zinc-900">Líneas de coste</h3>
              <button
                type="button"
                onClick={addManual}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-800 ring-1 ring-zinc-100 transition hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir producto manual
              </button>
            </div>

            {lines.length > 0 ? (
              <ul className="space-y-2">
                {lines.map((line) => {
                  if (line.type === 'manual') {
                    return (
                      <li
                        key={line.id}
                        className="flex flex-col gap-2 rounded-lg border border-zinc-200/90 bg-zinc-50/50 p-2.5 sm:flex-row sm:items-end"
                      >
                        <div className="min-w-0 flex-1">
                          <input
                            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-medium text-zinc-900"
                            value={line.concept}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((L) =>
                                L.map((x) =>
                                  x.id === line.id && x.type === 'manual' ? { ...x, concept: v } : x,
                                ),
                              );
                            }}
                            placeholder="Concepto"
                          />
                        </div>
                        <div className="flex w-full items-end gap-2 sm:w-40">
                          <input
                            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums"
                            inputMode="decimal"
                            value={line.costInput}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((L) =>
                                L.map((x) =>
                                  x.id === line.id && x.type === 'manual' ? { ...x, costInput: v } : x,
                                ),
                              );
                            }}
                            placeholder="0,00 €"
                          />
                          <button
                            type="button"
                            className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-700"
                            aria-label="Eliminar línea"
                            onClick={() => setLines((L) => L.filter((x) => x.id !== line.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  }
                  const c = lineCostEur(line);
                  return (
                    <li
                      key={line.id}
                      className="flex gap-2 rounded-lg border border-zinc-200/90 bg-zinc-50/50 p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-zinc-900">{line.productName}</p>
                        <p className="text-xs text-zinc-500">
                          {line.supplierName} · {formatMoneyEur(line.costeUnitarioUso)}/{line.unidadUso}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-700">
                          <span className="shrink-0">Cantidad:</span>
                          <input
                            className="w-20 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs tabular-nums"
                            inputMode="decimal"
                            value={line.qtyInput}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((L) =>
                                L.map((x) =>
                                  x.id === line.id && x.type === 'master' ? { ...x, qtyInput: v } : x,
                                ),
                              );
                            }}
                          />
                          <span className="text-zinc-600">{line.unidadUso}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-between">
                        <p className="text-sm font-extrabold tabular-nums text-zinc-900">
                          {c != null ? formatMoneyEur(c) : '—'}
                        </p>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-700"
                          aria-label="Eliminar"
                          onClick={() => setLines((L) => L.filter((x) => x.id !== line.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="mt-3">
              <p className="text-xs font-bold text-zinc-800">Añadir desde Artículos Máster</p>
              {rawProducts.length === 0 ? (
                <p className="mt-2 text-xs text-amber-800">No hay productos de proveedor activos en catálogo.</p>
              ) : (
                <>
                  <div className="relative mt-1.5">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                    <input
                      className="h-8 w-full rounded-lg border border-zinc-200 bg-white py-1 pl-7 pr-2 text-sm text-zinc-900"
                      placeholder="Buscar producto..."
                      value={masterQuery}
                      onChange={(e) => setMasterQuery(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  {masterSearchActive ? (
                    <div className="mt-1">
                      {filteredMasters.length === 0 ? (
                        <p className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 py-1.5 text-xs text-zinc-500">
                          No encontrado
                        </p>
                      ) : (
                        <ul className="max-h-[9.5rem] overflow-y-auto rounded-lg border border-zinc-200 bg-white text-sm shadow-sm">
                          {filteredMasters.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                className="w-full border-b border-zinc-100 px-2 py-1.5 text-left text-xs last:border-0 hover:bg-zinc-50"
                                onClick={() => onPickMaster(p)}
                              >
                                <span className="font-medium text-zinc-900">{p.name}</span>
                                <span className="block text-zinc-500">{p.supplierName}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-4 ring-1 ring-zinc-100">
            <div className="grid gap-3 sm:grid-cols-3 sm:gap-3">
              <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-200/60">
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Coste total</p>
                <p className="mt-1 text-lg font-black tabular-nums text-zinc-900">
                  {formatMoneyEur(calc.costeTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-[#B91C1C]/20 bg-gradient-to-br from-red-50/80 to-white p-3 shadow-sm ring-1 ring-red-100/80">
                <p className="text-[10px] font-bold uppercase tracking-wide text-red-800/80">PVP recomendado</p>
                <p className="mt-1 text-lg font-black tabular-nums text-[#B91C1C]">
                  {formatMoneyEur(calc.pvpIvaIncluido)}
                </p>
                <p className="text-[9px] text-zinc-500">IVA incluido</p>
              </div>
              <div
                className={`rounded-xl p-3 shadow-sm ring-1 ${
                  calc.margenBrutoPorcentaje >= 0
                    ? 'border border-emerald-200/60 bg-emerald-50/70 ring-emerald-100/80'
                    : 'bg-amber-50/80 ring-amber-200/60'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Margen bruto</p>
                <p
                  className={`mt-1 text-lg font-black tabular-nums ${
                    calc.margenBrutoPorcentaje >= 0 ? 'text-emerald-800' : 'text-amber-900'
                  }`}
                >
                  {fmtPct(calc.margenBrutoPorcentaje)}%
                </p>
                <p className="text-[9px] text-zinc-600">≈ {formatMoneyEur(calc.margenBruto)} neto</p>
              </div>
            </div>
            {fc <= 0 ? (
              <p className="mt-2 text-xs font-medium text-amber-800">Indica un food cost objetivo &gt; 0 %.</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 border-t border-zinc-200/90 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
            <button
              type="button"
              onClick={printPdf}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-800 ring-1 ring-zinc-100 transition hover:bg-zinc-50"
            >
              <Printer className="h-4 w-4" />
              Imprimir PDF
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100 px-3 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200/80"
            >
              Limpiar cálculo
            </button>
            <button
              type="button"
              onClick={createEscandallo}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-[#C62828] to-[#B91C1C] px-4 text-sm font-bold text-white shadow-md ring-1 ring-red-900/20 transition hover:from-[#B91C1C] hover:to-[#9a1515] sm:ml-auto"
            >
              Crear escandallo desde este cálculo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
