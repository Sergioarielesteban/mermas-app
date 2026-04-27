'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Copy, Plus, Search, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  escandalloRecipeUnitForRawProduct,
  rawProductPickerSummaryLine,
  type EscandalloRawProduct,
} from '@/lib/escandallos-supabase';
import { computeMasterLineCostEur, computeQuickCalc } from '@/lib/escandallo-quick-calculator-math';
import { writeEscandalloQuickCalcPrefill } from '@/lib/escandallo-quick-calc-prefill';
import { formatMoneyEur, parsePriceInput } from '@/lib/money-format';
import { validateEscandalloUsageUnitInput, sanitizeEscandalloIngredientUnit } from '@/lib/escandallo-ingredient-units';

type ManualLine = { id: string; type: 'manual'; concept: string; costInput: string };
type MasterLine = {
  id: string;
  type: 'master';
  productId: string;
  concept: string;
  qtyInput: string;
  unitInput: string;
};

type QuickLine = ManualLine | MasterLine;

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function lineCostEur(
  line: QuickLine,
  productsById: Map<string, EscandalloRawProduct>,
): number | null {
  if (line.type === 'manual') {
    const n = parsePriceInput(line.costInput);
    if (n == null || !Number.isFinite(n) || n < 0) return null;
    return n;
  }
  const p = productsById.get(line.productId);
  if (!p) return null;
  const q = parsePriceInput(line.qtyInput);
  if (q == null || !Number.isFinite(q) || q < 0) return null;
  const u = line.unitInput.trim() || escandalloRecipeUnitForRawProduct(p);
  return computeMasterLineCostEur(p, q, u);
}

function parseCostTotal(lines: QuickLine[], productsById: Map<string, EscandalloRawProduct>): number {
  let sum = 0;
  for (const line of lines) {
    const c = lineCostEur(line, productsById);
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
};

export default function EscandalloQuickCalculatorModal({ open, onClose, rawProducts }: Props) {
  const router = useRouter();
  const titleId = useId();
  const productsById = useMemo(
    () => new Map(rawProducts.map((p) => [p.id, p])),
    [rawProducts],
  );
  const sorted = useMemo(
    () => [...rawProducts].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [rawProducts],
  );

  const [plato, setPlato] = useState('');
  const [foodCostPct, setFoodCostPct] = useState('30');
  const [ivaPct, setIvaPct] = useState('10');
  const [lines, setLines] = useState<QuickLine[]>([]);

  const [masterQuery, setMasterQuery] = useState('');
  const [masterPicked, setMasterPicked] = useState<EscandalloRawProduct | null>(null);
  const [masterQty, setMasterQty] = useState('1');
  const [masterUnit, setMasterUnit] = useState('');

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

  const filteredMasters = useMemo(() => {
    const q = masterQuery.trim().toLowerCase();
    if (q.length < 1) return sorted.slice(0, 50);
    return sorted
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.supplierName.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [masterQuery, sorted]);

  const fc = parsePriceInput(foodCostPct) ?? 30;
  const iva = parsePriceInput(ivaPct) ?? 10;
  const costeTotal = useMemo(
    () => parseCostTotal(lines, productsById),
    [lines, productsById],
  );
  const calc = useMemo(
    () => computeQuickCalc(costeTotal, fc, iva),
    [costeTotal, fc, iva],
  );

  const addManual = useCallback(() => {
    setLines((L) => [...L, { id: newId('man'), type: 'manual', concept: '', costInput: '' }]);
  }, []);

  const onPickMaster = useCallback((p: EscandalloRawProduct) => {
    setMasterPicked(p);
    setMasterQty('1');
    setMasterUnit(escandalloRecipeUnitForRawProduct(p));
  }, []);

  const addMasterLine = useCallback(() => {
    if (!masterPicked) return;
    const uErr = validateEscandalloUsageUnitInput(masterUnit);
    if (uErr) {
      window.alert(uErr);
      return;
    }
    const u = sanitizeEscandalloIngredientUnit(masterUnit);
    setLines((L) => [
      ...L,
      {
        id: newId('mst'),
        type: 'master',
        productId: masterPicked.id,
        concept: masterPicked.name,
        qtyInput: masterQty,
        unitInput: u,
      },
    ]);
    setMasterPicked(null);
    setMasterQuery('');
  }, [masterPicked, masterQty, masterUnit]);

  const clearAll = useCallback(() => {
    if (!window.confirm('¿Vaciar nombre, porcentajes y todas las líneas?')) return;
    setPlato('');
    setFoodCostPct('30');
    setIvaPct('10');
    setLines([]);
    setMasterPicked(null);
    setMasterQuery('');
  }, []);

  const copySummary = useCallback(() => {
    const name = plato.trim() || '—';
    const copyText = `CALCULADORA RÁPIDA
Plato: ${name}
Coste total: ${formatMoneyEur(calc.costeTotal)}
Food cost objetivo: ${fmtPct(fc)}%
PVP recomendado: ${formatMoneyEur(calc.pvpIvaIncluido)} IVA incluido
Margen bruto estimado: ${fmtPct(calc.margenBrutoPorcentaje)}%`;
    void navigator.clipboard.writeText(copyText).then(
      () => {
        /* ok */
      },
      () => window.alert('No se pudo copiar al portapapeles.'),
    );
  }, [plato, calc, fc]);

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
          <div>
            <h2 id={titleId} className="text-base font-bold tracking-tight text-zinc-900 sm:text-lg">
              Calculadora rápida de platos
            </h2>
            <p className="mt-0.5 text-sm text-zinc-600">
              Calcula un PVP orientativo sin crear un escandallo completo.
            </p>
          </div>
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
          {/* Resultado destacado */}
          <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-4 ring-1 ring-zinc-100">
            <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
              <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-200/60">
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Coste total</p>
                <p className="mt-1 text-xl font-black tabular-nums text-zinc-900">
                  {formatMoneyEur(calc.costeTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-[#B91C1C]/20 bg-gradient-to-br from-red-50/80 to-white p-3 shadow-sm ring-1 ring-red-100/80">
                <p className="text-[10px] font-bold uppercase tracking-wide text-red-800/80">PVP recomendado</p>
                <p className="mt-1 text-xl font-black tabular-nums text-[#B91C1C]">
                  {formatMoneyEur(calc.pvpIvaIncluido)}
                </p>
                <p className="text-[10px] text-zinc-500">IVA incluido (neto {formatMoneyEur(calc.precioVentaNeto)} + IVA {formatMoneyEur(calc.ivaImporte)})</p>
              </div>
              <div
                className={`rounded-xl p-3 shadow-sm ring-1 ${
                  calc.margenBrutoPorcentaje >= 0
                    ? 'border border-emerald-200/60 bg-emerald-50/70 ring-emerald-100/80'
                    : 'bg-amber-50/80 ring-amber-200/60'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Margen bruto (estim.)</p>
                <p
                  className={`mt-1 text-xl font-black tabular-nums ${
                    calc.margenBrutoPorcentaje >= 0 ? 'text-emerald-800' : 'text-amber-900'
                  }`}
                >
                  {fmtPct(calc.margenBrutoPorcentaje)}%
                </p>
                <p className="text-[10px] text-zinc-600">≈ {formatMoneyEur(calc.margenBruto)} neto / ración</p>
              </div>
            </div>
            {fc <= 0 ? (
              <p className="mt-2 text-xs font-medium text-amber-800">Indica un food cost objetivo &gt; 0 %.</p>
            ) : null}
          </div>

          {/* Nombre y % */}
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Food cost objetivo (%)</label>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200/80"
                  inputMode="decimal"
                  value={foodCostPct}
                  onChange={(e) => setFoodCostPct(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-600">IVA venta (%)</label>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200/80"
                  inputMode="decimal"
                  value={ivaPct}
                  onChange={(e) => setIvaPct(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Líneas */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-zinc-900">Líneas de coste</h3>
              <button
                type="button"
                onClick={addManual}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-800 ring-1 ring-zinc-100 transition hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir línea manual
              </button>
            </div>

            {lines.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-4 text-center text-sm text-zinc-500">
                Añade líneas manuales o elige un artículo abajo. La suma alimenta el coste total.
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex flex-col gap-2 rounded-xl border border-zinc-200/90 bg-zinc-50/40 p-2.5 sm:flex-row sm:items-end"
                  >
                    {line.type === 'manual' ? (
                      <>
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold uppercase text-zinc-500">Concepto</span>
                          <input
                            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                            value={line.concept}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((L) => L.map((x) => (x.id === line.id && x.type === 'manual' ? { ...x, concept: v } : x)));
                            }}
                            placeholder="p. ej. Pollo, packaging…"
                          />
                        </div>
                        <div className="w-full sm:w-32">
                          <span className="text-[10px] font-bold uppercase text-zinc-500">Neto €</span>
                          <input
                            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 tabular-nums"
                            inputMode="decimal"
                            value={line.costInput}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((L) => L.map((x) => (x.id === line.id && x.type === 'manual' ? { ...x, costInput: v } : x)));
                            }}
                            placeholder="0,00"
                          />
                        </div>
                        <div className="shrink-0 self-end sm:self-end">
                          <span className="text-[10px] font-bold uppercase text-zinc-500 sm:sr-only">Quitar</span>
                          <button
                            type="button"
                            className="rounded-lg p-2 text-zinc-500 hover:bg-red-50 hover:text-red-700"
                            aria-label="Eliminar línea"
                            onClick={() => setLines((L) => L.filter((x) => x.id !== line.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      (() => {
                        const p = productsById.get(line.productId);
                        const c = lineCostEur(line, productsById);
                        return (
                          <>
                            <div className="min-w-0 flex-1 text-sm text-zinc-800">
                              <span className="text-[10px] font-bold uppercase text-zinc-500">Máster</span>
                              <p className="font-semibold">{line.concept}</p>
                              {p ? (
                                <p className="text-xs text-zinc-500">{rawProductPickerSummaryLine(p)}</p>
                              ) : null}
                            </div>
                            <div className="grid w-full grid-cols-2 gap-2 sm:max-w-sm">
                              <div>
                                <span className="text-[10px] font-bold uppercase text-zinc-500">Cantidad</span>
                                <input
                                  className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                                  inputMode="decimal"
                                  value={line.qtyInput}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setLines((L) => L.map((x) => (x.id === line.id && x.type === 'master' ? { ...x, qtyInput: v } : x)));
                                  }}
                                />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold uppercase text-zinc-500">Unidad</span>
                                <input
                                  className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                                  value={line.unitInput}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setLines((L) => L.map((x) => (x.id === line.id && x.type === 'master' ? { ...x, unitInput: v } : x)));
                                  }}
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end">
                              <p className="text-sm font-bold text-zinc-800 tabular-nums sm:text-right">
                                {c != null ? formatMoneyEur(c) : '—'}
                              </p>
                              <button
                                type="button"
                                className="rounded-lg p-2 text-zinc-500 hover:bg-red-50 hover:text-red-700"
                                aria-label="Eliminar"
                                onClick={() => setLines((L) => L.filter((x) => x.id !== line.id))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </>
                        );
                      })()
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Añadir desde máster */}
            <div className="mt-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-3 ring-1 ring-zinc-100">
              <p className="text-xs font-bold text-zinc-800">+ Añadir desde Artículos Máster</p>
              <p className="text-[11px] text-zinc-500">
                Buscador con lupa, el producto, cantidad usada y unidad; el coste se calcula según precio de catálogo / PMP.
                Solo lectura.
              </p>
              {rawProducts.length === 0 ? (
                <p className="mt-2 text-xs text-amber-800">No hay productos de proveedor activos para este local.</p>
              ) : (
                <>
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-8 pr-3 text-sm text-zinc-900"
                      placeholder="Buscar (nombre o proveedor)…"
                      value={masterQuery}
                      onChange={(e) => setMasterQuery(e.target.value)}
                    />
                  </div>
                  <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-zinc-200 bg-white text-sm">
                    {masterPicked ? (
                      <li className="border-b border-zinc-100 p-2">
                        <p className="font-semibold text-zinc-900">{masterPicked.name}</p>
                        <p className="text-xs text-zinc-500">{rawProductPickerSummaryLine(masterPicked)}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <div>
                            <span className="text-[10px] text-zinc-500">Cantidad usada</span>
                            <input
                              className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm"
                              inputMode="decimal"
                              value={masterQty}
                              onChange={(e) => setMasterQty(e.target.value)}
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-500">Unidad de uso</span>
                            <input
                              className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm"
                              value={masterUnit}
                              onChange={(e) => setMasterUnit(e.target.value)}
                            />
                          </div>
                          <div className="col-span-2 flex flex-col gap-2 sm:col-span-1 sm:justify-end">
                            <button
                              type="button"
                              onClick={addMasterLine}
                              className="w-full rounded-xl bg-gradient-to-b from-[#C62828] to-[#B91C1C] py-2 text-xs font-bold text-white shadow-sm ring-1 ring-red-900/20"
                            >
                              Añadir a la calculadora
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMasterPicked(null);
                                setMasterQuery('');
                              }}
                              className="w-full rounded-lg border border-zinc-200 py-1.5 text-xs font-bold text-zinc-700"
                            >
                              Deseleccionar
                            </button>
                          </div>
                        </div>
                      </li>
                    ) : (
                      filteredMasters.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="flex w-full flex-col items-start gap-0.5 border-b border-zinc-100 px-2 py-2 text-left last:border-0 hover:bg-zinc-50"
                            onClick={() => onPickMaster(p)}
                          >
                            <span className="font-medium text-zinc-900">{p.name}</span>
                            <span className="text-xs text-zinc-500">{p.supplierName}</span>
                          </button>
                        </li>
                      ))
                    )}
                    {!masterPicked && filteredMasters.length === 0 ? (
                      <li className="p-2 text-sm text-zinc-500">Sin resultados. Escribe para buscar.</li>
                    ) : null}
                  </ul>
                </>
              )}
            </div>
          </div>

          {/* Barra de acciones */}
          <div className="flex flex-col gap-2 border-t border-zinc-200/90 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copySummary}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-100 transition hover:bg-zinc-50"
              >
                <Copy className="h-4 w-4" />
                Copiar resumen
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200/80"
              >
                Limpiar cálculo
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={createEscandallo}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-[#C62828] to-[#B91C1C] px-4 py-2.5 text-sm font-bold text-white shadow-md ring-1 ring-red-900/20 transition hover:from-[#B91C1C] hover:to-[#9a1515]"
              >
                Crear escandallo desde este cálculo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
