'use client';

import React, { useEffect, type SetStateAction } from 'react';
import { ChevronDown, Plus, Search, Trash2 } from 'lucide-react';
import { ESCANDALLO_USAGE_UNIT_PRESETS } from '@/lib/escandallo-ingredient-units';
import {
  emptyIngredientDraft,
  estimateDraftRowCostEur,
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

export type EscandalloIngredientDraftEditorProps = {
  drafts: IngredientDraftRow[];
  onChange: (next: SetStateAction<IngredientDraftRow[]>) => void;
  sortedRaw: EscandalloRawProduct[];
  processedProducts: EscandalloProcessedProduct[];
  recipes: EscandalloRecipe[];
  excludeRecipeId: string | null;
  disabled: boolean;
  /** Líneas existentes en BD (para desglose opcional de sub-recetas). */
  linesByRecipe?: Record<string, EscandalloLine[]>;
  rawById?: Map<string, EscandalloRawProduct>;
  processedById?: Map<string, EscandalloProcessedProduct>;
  recipesById?: Map<string, EscandalloRecipe>;
  addButtonLabel?: string;
};

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

  const filteredRaw = (q: string) => {
    const s = q.trim().toLowerCase();
    if (!s) return sortedRaw;
    return sortedRaw.filter((p) => `${p.name} ${p.supplierName}`.toLowerCase().includes(s));
  };

  const canEstimate =
    rawById != null && processedById != null && recipesById != null;

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
    <div className="space-y-2">
      {drafts.map((row, idx) => {
        const est =
          canEstimate
            ? estimateDraftRowCostEur(row, rawById, processedById, recipesById, linesByRecipe, excludeRecipeId)
            : null;
        const subLines =
          row.sourceType === 'subrecipe' && row.subRecipeId
            ? (linesByRecipe[row.subRecipeId] ?? [])
            : [];

        return (
          <div
            key={row.key}
            className="rounded-xl border border-zinc-200/90 bg-white px-3 py-3 shadow-sm ring-1 ring-zinc-100/80 sm:py-2.5"
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="hidden w-7 shrink-0 text-center text-[10px] font-bold text-zinc-400 sm:inline">
                  {idx + 1}
                </span>
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
                  className="min-h-[44px] shrink-0 rounded-lg border border-zinc-200 bg-zinc-50/90 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-800 outline-none focus:border-[#D32F2F]/40 focus:ring-2 focus:ring-[#D32F2F]/20 sm:min-h-0 sm:py-1.5"
                >
                  <option value="raw">Crudo</option>
                  <option value="processed">Elaborado</option>
                  <option value="subrecipe">Sub-receta</option>
                  <option value="manual">Manual</option>
                </select>
                <input
                  value={row.qty}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                  className="min-h-[44px] w-[4.5rem] shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-base font-semibold tabular-nums outline-none focus:border-[#D32F2F]/40 sm:min-h-0 sm:w-20 sm:py-1.5 sm:text-sm"
                  inputMode="decimal"
                  placeholder="Cant."
                />
                {row.sourceType === 'raw' && row.rawId ? (
                  <div className="flex min-h-[44px] min-w-[4.5rem] shrink-0 flex-col justify-center rounded-lg border border-indigo-100 bg-indigo-50/80 px-2 py-1 sm:min-h-0 sm:w-[5.5rem] sm:px-1.5">
                    <span className="text-[8px] font-bold uppercase text-indigo-800/80">Unidad</span>
                    <span className="truncate text-xs font-semibold text-indigo-950" title="Viene del artículo máster o del catálogo">
                      {(() => {
                        const rp = sortedRaw.find((x) => x.id === row.rawId);
                        return rp ? escandalloRecipeUnitForRawProduct(rp) : row.unit;
                      })()}
                    </span>
                  </div>
                ) : null}
                {row.sourceType === 'processed' && row.processedId ? (
                  <div className="flex min-h-[44px] min-w-[4.5rem] shrink-0 flex-col justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 sm:min-h-0 sm:w-[5.5rem] sm:px-1.5">
                    <span className="text-[8px] font-bold uppercase text-zinc-500">Unidad</span>
                    <span className="truncate text-xs font-semibold text-zinc-900">
                      {processedProducts.find((x) => x.id === row.processedId)?.outputUnit ?? row.unit}
                    </span>
                  </div>
                ) : null}
                {row.sourceType === 'subrecipe' || row.sourceType === 'manual' ? (
                  <>
                    <input
                      list={`esc-draft-units-${row.key}`}
                      value={row.unit}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                      className="min-h-[44px] w-full min-w-[6rem] max-w-[10rem] rounded-lg border border-zinc-200 bg-white px-2 py-2 text-base outline-none focus:border-[#D32F2F]/40 sm:min-h-0 sm:w-[6.5rem] sm:py-1.5 sm:text-xs"
                      placeholder="Ud."
                    />
                    <datalist id={`esc-draft-units-${row.key}`}>
                      {ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                  </>
                ) : null}
                <div className="ml-auto flex shrink-0 items-center gap-2 border-t border-zinc-100 pt-2 sm:border-t-0 sm:pt-0">
                  <span className="text-xs tabular-nums text-zinc-600">
                    {est != null ? <span className="font-semibold text-zinc-900">~{est.toFixed(2)} €</span> : '—'}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeRow(row.key)}
                    className="min-h-[44px] min-w-[44px] rounded-lg border border-transparent p-2 text-red-700 transition hover:border-red-100 hover:bg-red-50 sm:min-h-0 sm:min-w-0 sm:p-1.5"
                    aria-label="Quitar fila"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="w-full min-w-0">
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
                      className="min-h-[52px] w-full rounded-xl border-2 border-zinc-200 bg-white py-3 pl-11 pr-3 text-base outline-none transition focus:border-[#D32F2F]/50 focus:ring-2 focus:ring-[#D32F2F]/15 sm:min-h-0 sm:py-2.5 sm:text-sm"
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
                            const sub =
                              pack > 1
                                ? `${p.pricePerUnit.toFixed(2)} €/${p.unit} → ${(p.pricePerUnit / pack).toFixed(2)} €/${p.recipeUnit ?? 'ud'}`
                                : `${p.pricePerUnit.toFixed(2)} €/${p.unit}`;
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
                                className="flex w-full min-h-[56px] flex-col items-start gap-0.5 border-b border-zinc-100 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-50 active:bg-zinc-100"
                              >
                                <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                                  {p.supplierName}
                                </span>
                                <span className="text-[15px] font-semibold leading-snug text-zinc-900">{p.name}</span>
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
                    className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base sm:min-h-0 sm:text-sm"
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
                    className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base sm:min-h-0 sm:text-sm"
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
                      placeholder="Concepto"
                      className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-base sm:min-h-0 sm:text-sm"
                    />
                    <input
                      value={row.manualPrice}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.key, { manualPrice: e.target.value })}
                      placeholder="€/ud"
                      className="min-h-[48px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-base tabular-nums sm:min-h-0 sm:w-28 sm:text-sm"
                      inputMode="decimal"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {row.sourceType === 'subrecipe' && subLines.length > 0 ? (
              <details className="mt-2 border-t border-dashed border-zinc-200 pt-2 text-xs text-zinc-600">
                <summary className="cursor-pointer select-none font-semibold text-zinc-500 hover:text-zinc-800">
                  <span className="inline-flex items-center gap-1">
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    Ver desglose de la base ({subLines.length})
                  </span>
                </summary>
                <ul className="mt-1.5 space-y-0.5 pl-1">
                  {subLines.map((ln) => (
                    <li key={ln.id} className="truncate tabular-nums">
                      {ln.label} · {ln.qty} {ln.unit}
                    </li>
                  ))}
                </ul>
              </details>
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
