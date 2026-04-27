'use client';

import React, { useEffect, type SetStateAction } from 'react';
import { ChevronDown, ChevronUp, Plus, Search, Trash2 } from 'lucide-react';
import { ESCANDALLO_USAGE_UNIT_PRESETS } from '@/lib/escandallo-ingredient-units';
import {
  emptyIngredientDraft,
  estimateDraftRowCostEur,
  parseDecimal,
  type IngredientDraftRow,
} from '@/lib/escandallos-recipe-draft-utils';
import {
  escandalloRecipeUnitForRawProduct,
  rawProductPickerSummaryLine,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { formatMoneyEur, formatUnitPriceEur, roundMoney } from '@/lib/money-format';

export type EscandalloIngredientDraftEditorProps = {
  drafts: IngredientDraftRow[];
  onChange: (next: SetStateAction<IngredientDraftRow[]>) => void;
  sortedRaw: EscandalloRawProduct[];
  processedProducts: EscandalloProcessedProduct[];
  recipes: EscandalloRecipe[];
  excludeRecipeId: string | null;
  disabled: boolean;
  linesByRecipe?: Record<string, EscandalloLine[]>;
  rawById?: Map<string, EscandalloRawProduct>;
  processedById?: Map<string, EscandalloProcessedProduct>;
  recipesById?: Map<string, EscandalloRecipe>;
  addButtonLabel?: string;
};

function badgeLabel(t: IngredientDraftRow['sourceType']): string {
  switch (t) {
    case 'raw':
      return 'Crudo';
    case 'processed':
      return 'Elaborado';
    case 'subrecipe':
      return 'Sub-receta';
    case 'manual':
      return 'Manual';
    default:
      return '';
  }
}

function displayUnitForRow(
  row: IngredientDraftRow,
  sortedRaw: EscandalloRawProduct[],
  processedProducts: EscandalloProcessedProduct[],
): string {
  if (row.sourceType === 'raw' && row.rawId) {
    const rp = sortedRaw.find((x) => x.id === row.rawId);
    return rp ? escandalloRecipeUnitForRawProduct(rp) : row.unit;
  }
  if (row.sourceType === 'processed' && row.processedId) {
    return processedProducts.find((x) => x.id === row.processedId)?.outputUnit ?? row.unit;
  }
  return row.unit.trim() || 'ud';
}

export default function EscandalloIngredientDraftEditor({
  drafts,
  onChange,
  sortedRaw,
  processedProducts,
  recipes,
  excludeRecipeId,
  disabled,
  linesByRecipe = {},
  rawById,
  processedById,
  recipesById,
  addButtonLabel = 'Añadir ingrediente',
}: EscandalloIngredientDraftEditorProps) {
  const updateRow = (key: string, patch: Partial<IngredientDraftRow>) => {
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const removeRow = (key: string) => {
    if (drafts.length <= 1) {
      onChange([emptyIngredientDraft()]);
      return;
    }
    onChange(drafts.filter((d) => d.key !== key));
  };

  const moveRow = (from: number, to: number) => {
    if (to < 0 || to >= drafts.length || from === to) return;
    onChange((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const filteredRaw = (q: string) => {
    const s = q.trim().toLowerCase();
    if (!s) return sortedRaw;
    return sortedRaw.filter((p) => `${p.name} ${p.supplierName}`.toLowerCase().includes(s));
  };

  const canEstimate = rawById != null && processedById != null && recipesById != null;

  const anyRawPickerOpen = drafts.some((d) => d.rawDropdownOpen);
  useEffect(() => {
    if (!anyRawPickerOpen) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      const roots = document.querySelectorAll('[data-esc-raw-picker]');
      for (const r of roots) {
        if (r.contains(t)) return;
      }
      onChange((prev) => prev.map((d) => ({ ...d, rawDropdownOpen: false })));
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [anyRawPickerOpen, onChange]);

  return (
    <div className="space-y-3">
      {drafts.map((row, idx) => {
        const est =
          canEstimate
            ? estimateDraftRowCostEur(row, rawById, processedById, recipesById, linesByRecipe, excludeRecipeId)
            : null;
        const subLines =
          row.sourceType === 'subrecipe' && row.subRecipeId ? (linesByRecipe[row.subRecipeId] ?? []) : [];
        const qtyNum = parseDecimal(row.qty);
        const dispUnit = displayUnitForRow(row, sortedRaw, processedProducts);
        const unitEurForLine =
          est != null && qtyNum != null && qtyNum > 0 ? est / qtyNum : null;
        const unitPriceStr =
          unitEurForLine != null && Number.isFinite(unitEurForLine)
            ? formatUnitPriceEur(unitEurForLine, dispUnit)
            : '—';
        const qtyLabel =
          qtyNum != null && qtyNum > 0 ? (
            <>
              <span className="font-semibold tabular-nums text-zinc-900">{row.qty.trim() || '—'}</span>{' '}
              <span className="text-zinc-700">{dispUnit}</span>
            </>
          ) : (
            <span className="text-zinc-500">—</span>
          );

        return (
          <div
            key={row.key}
            className="min-h-0 overflow-visible rounded-xl border border-zinc-200/90 bg-white px-3 py-3 shadow-sm ring-1 ring-zinc-100/80"
          >
            {/* Fila 1: tipo + nombre / selectores */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden w-6 text-center text-[10px] font-bold text-zinc-400 sm:inline">{idx + 1}</span>
                <select
                  value={row.sourceType}
                  disabled={disabled}
                  onChange={(e) =>
                    updateRow(row.key, {
                      sourceType: e.target.value as IngredientDraftRow['sourceType'],
                      rawId: '',
                      processedId: '',
                      subRecipeId: '',
                      rawSearch: '',
                      rawDropdownOpen: false,
                      unit: 'kg',
                    })
                  }
                  className="min-h-[40px] rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-900 outline-none focus:border-[#D32F2F]/40 focus:ring-2 focus:ring-[#D32F2F]/15 sm:min-h-0"
                  aria-label="Tipo de ingrediente"
                >
                  <option value="raw">Crudo</option>
                  <option value="processed">Elaborado</option>
                  <option value="subrecipe">Sub-receta</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {row.sourceType === 'raw' ? (
                  <div className="relative w-full" data-esc-raw-picker>
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
                      aria-hidden
                    />
                    <input
                      value={row.rawSearch}
                      disabled={disabled}
                      autoComplete="off"
                      onFocus={() => updateRow(row.key, { rawDropdownOpen: true })}
                      onChange={(e) => {
                        updateRow(row.key, {
                          rawSearch: e.target.value,
                          rawDropdownOpen: true,
                          rawId: '',
                        });
                      }}
                      placeholder="Buscar por proveedor o producto…"
                      className="min-h-[48px] w-full rounded-xl border-2 border-zinc-200 bg-white py-3 pl-11 pr-3 text-base leading-snug outline-none transition focus:border-[#D32F2F]/50 focus:ring-2 focus:ring-[#D32F2F]/15 sm:min-h-0 sm:py-2.5 sm:text-sm"
                    />
                    {row.rawDropdownOpen ? (
                      <div
                        className="absolute left-0 right-0 z-[80] mt-2 max-h-[min(55vh,22rem)] overflow-y-auto overscroll-contain rounded-xl border-2 border-zinc-200 bg-white shadow-2xl sm:max-h-72"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {filteredRaw(row.rawSearch).length === 0 ? (
                          <p className="px-4 py-4 text-center text-sm text-zinc-500">Sin resultados</p>
                        ) : (
                          filteredRaw(row.rawSearch).map((p) => {
                            const pack = p.unitsPerPack > 0 ? p.unitsPerPack : 1;
                            const ru = p.recipeUnit ?? 'ud';
                            const sub =
                              pack > 1
                                ? `Compra ${formatUnitPriceEur(p.pricePerUnit, p.unit)} · Coste uso ${formatUnitPriceEur(roundMoney(p.pricePerUnit / pack), ru)}`
                                : formatUnitPriceEur(p.pricePerUnit, p.unit);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() =>
                                  updateRow(row.key, {
                                    rawId: p.id,
                                    rawSearch: rawProductPickerSummaryLine(p),
                                    rawDropdownOpen: false,
                                    unit: escandalloRecipeUnitForRawProduct(p),
                                  })
                                }
                                className="flex min-h-[56px] w-full flex-col items-start gap-0.5 border-b border-zinc-100 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-50 active:bg-zinc-100"
                              >
                                <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                                  {p.supplierName}
                                </span>
                                <span className="break-words text-[15px] font-semibold leading-snug text-zinc-900">
                                  {p.name}
                                </span>
                                <span className="text-sm tabular-nums text-zinc-600">{sub}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {row.sourceType === 'processed' ? (
                  <select
                    value={row.processedId}
                    disabled={disabled}
                    onChange={(e) => {
                      const id = e.target.value;
                      const p = processedProducts.find((x) => x.id === id);
                      updateRow(row.key, { processedId: id, unit: p?.outputUnit ?? 'kg' });
                    }}
                    className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base leading-snug sm:min-h-0 sm:text-sm"
                  >
                    <option value="">Elaborado…</option>
                    {processedProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {row.sourceType === 'subrecipe' ? (
                  <select
                    value={row.subRecipeId}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.key, { subRecipeId: e.target.value })}
                    className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base font-semibold leading-snug sm:min-h-0 sm:text-sm"
                  >
                    <option value="">Base / sub-receta…</option>
                    {recipes
                      .filter((r) => r.id !== excludeRecipeId)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                          {r.isSubRecipe ? ' (base)' : ''}
                        </option>
                      ))}
                  </select>
                ) : null}
                {row.sourceType === 'manual' ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <input
                      value={row.manualLabel}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.key, { manualLabel: e.target.value })}
                      placeholder="Concepto (nombre del ingrediente)"
                      className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-base leading-snug sm:min-h-0 sm:text-sm"
                    />
                    <input
                      value={row.manualPrice}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.key, { manualPrice: e.target.value })}
                      placeholder="€/ud"
                      className="min-h-[48px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-base tabular-nums sm:min-h-0 sm:w-36 sm:text-sm"
                      inputMode="decimal"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {/* Fila 2: cantidad, unidad, precios — sin solapar */}
            <div className="mt-3 flex min-h-0 flex-col gap-2 border-t border-zinc-100 pt-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase text-zinc-500">Cantidad</span>
                  <input
                    value={row.qty}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                    className="min-h-[44px] w-[5.5rem] rounded-lg border border-zinc-200 bg-white px-2 py-2 text-base font-semibold tabular-nums outline-none focus:border-[#D32F2F]/40 sm:min-h-0 sm:w-24 sm:py-1.5 sm:text-sm"
                    inputMode="decimal"
                    placeholder="0"
                  />
                </label>
                {row.sourceType === 'raw' && row.rawId ? (
                  <div className="flex min-h-[44px] min-w-0 max-w-full flex-1 flex-col justify-center rounded-lg border border-indigo-100 bg-indigo-50/80 px-2 py-1.5 sm:min-h-0 sm:max-w-[10rem]">
                    <span className="text-[8px] font-bold uppercase text-indigo-800/80">Unidad (catálogo)</span>
                    <span className="break-words text-xs font-semibold text-indigo-950" title="Viene del artículo o del catálogo">
                      {(() => {
                        const rp = sortedRaw.find((x) => x.id === row.rawId);
                        return rp ? escandalloRecipeUnitForRawProduct(rp) : row.unit;
                      })()}
                    </span>
                  </div>
                ) : null}
                {row.sourceType === 'processed' && row.processedId ? (
                  <div className="flex min-h-[44px] min-w-0 max-w-full flex-1 flex-col justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 sm:min-h-0 sm:max-w-[10rem]">
                    <span className="text-[8px] font-bold uppercase text-zinc-500">Unidad</span>
                    <span className="break-words text-xs font-semibold text-zinc-900">
                      {processedProducts.find((x) => x.id === row.processedId)?.outputUnit ?? row.unit}
                    </span>
                  </div>
                ) : null}
                {row.sourceType === 'subrecipe' || row.sourceType === 'manual' ? (
                  <>
                    <label className="flex min-w-0 flex-col gap-0.5 sm:max-w-[9rem]">
                      <span className="text-[9px] font-bold uppercase text-zinc-500">Unidad uso</span>
                      <input
                        list={`esc-draft-units-${row.key}`}
                        value={row.unit}
                        disabled={disabled}
                        onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                        className="min-h-[44px] w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-base outline-none focus:border-[#D32F2F]/40 sm:min-h-0 sm:py-1.5 sm:text-sm"
                        placeholder="ud"
                      />
                    </label>
                    <datalist id={`esc-draft-units-${row.key}`}>
                      {ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                  </>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-col items-stretch justify-center gap-1 sm:items-end sm:text-right">
                <p className="text-[11px] leading-snug text-zinc-600 sm:max-w-[20rem]">
                  <span className="text-zinc-500">{badgeLabel(row.sourceType)}</span>
                  <span className="mx-1.5 text-zinc-300">·</span>
                  {qtyLabel}
                  <span className="mx-1.5 text-zinc-300">·</span>
                  <span className="tabular-nums text-zinc-700">{unitPriceStr}</span>
                </p>
                <p className="text-lg font-black tabular-nums text-zinc-900">
                  {est != null ? `~${formatMoneyEur(est)}` : '—'}
                </p>
              </div>
            </div>

            {/* Fila 3: reordenar + eliminar */}
            <div className="mt-3 flex flex-wrap items-center justify-end gap-1 border-t border-zinc-100 pt-2">
              <span className="mr-auto text-[10px] font-semibold uppercase text-zinc-400 sm:hidden">{badgeLabel(row.sourceType)}</span>
              <button
                type="button"
                disabled={disabled || idx === 0}
                onClick={() => moveRow(idx, idx - 1)}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-zinc-200 p-2 text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-30 sm:min-h-0 sm:min-w-0 sm:p-1.5"
                aria-label="Subir fila"
              >
                <ChevronUp className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
              <button
                type="button"
                disabled={disabled || idx >= drafts.length - 1}
                onClick={() => moveRow(idx, idx + 1)}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-zinc-200 p-2 text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-30 sm:min-h-0 sm:min-w-0 sm:p-1.5"
                aria-label="Bajar fila"
              >
                <ChevronDown className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeRow(row.key)}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-transparent p-2 text-red-700 transition hover:border-red-100 hover:bg-red-50 sm:min-h-0 sm:min-w-0 sm:p-1.5"
                aria-label="Quitar fila"
              >
                <Trash2 className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            </div>

            {/* Sub-receta: desglose base, siempre bajo el bloque principal */}
            {row.sourceType === 'subrecipe' && subLines.length > 0 ? (
              <div className="mt-3 border-t border-dashed border-zinc-200/90 pt-2">
                <p className="text-[11px] font-semibold text-zinc-500">Desglose base</p>
                <ul className="mt-1.5 space-y-1.5 pl-0.5 text-[11px] leading-relaxed text-zinc-500">
                  {subLines.map((ln) => (
                    <li key={ln.id} className="break-words pl-1 tabular-nums">
                      <span className="font-medium text-zinc-600">{ln.label}</span>
                      <span className="text-zinc-400"> · </span>
                      {ln.qty} {ln.unit}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...drafts, emptyIngredientDraft()])}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
      >
        <Plus className="h-4 w-4" />
        {addButtonLabel}
      </button>
    </div>
  );
}
