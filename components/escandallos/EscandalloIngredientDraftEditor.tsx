'use client';

import React from 'react';
import { ChevronDown, Plus, Search, Trash2 } from 'lucide-react';
import {
  emptyIngredientDraft,
  ESCANDALLO_DRAFT_UNITS,
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
import type { Unit } from '@/lib/types';

export type EscandalloIngredientDraftEditorProps = {
  drafts: IngredientDraftRow[];
  onChange: (next: IngredientDraftRow[]) => void;
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
            className="rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100/80"
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
                    })
                  }
                  className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50/90 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-800 outline-none focus:border-[#D32F2F]/40 focus:ring-1 focus:ring-[#D32F2F]/20"
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
                  className="w-20 shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-semibold tabular-nums outline-none focus:border-[#D32F2F]/40"
                  inputMode="decimal"
                  placeholder="Cant."
                />
                {row.sourceType === 'subrecipe' || row.sourceType === 'manual' ? (
                  <select
                    value={row.unit}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.key, { unit: e.target.value as Unit })}
                    className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#D32F2F]/40"
                  >
                    {ESCANDALLO_DRAFT_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                ) : null}
                <div className="min-w-0 flex-1">
                  {row.sourceType === 'raw' ? (
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                        aria-hidden
                      />
                      <input
                        value={row.rawSearch}
                        disabled={disabled}
                        onFocus={() => updateRow(row.key, { rawDropdownOpen: true })}
                        onChange={(e) => {
                          updateRow(row.key, {
                            rawSearch: e.target.value,
                            rawDropdownOpen: true,
                            rawId: '',
                          });
                        }}
                        placeholder="Buscar crudo…"
                        className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[#D32F2F]/40"
                      />
                      {row.rawDropdownOpen ? (
                        <div className="absolute z-30 mt-1 max-h-36 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                          {filteredRaw(row.rawSearch).length === 0 ? (
                            <p className="px-3 py-2 text-xs text-zinc-500">Sin resultados</p>
                          ) : (
                            filteredRaw(row.rawSearch).map((p) => {
                              const lab = rawProductPickerSummaryLine(p);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() =>
                                    updateRow(row.key, {
                                      rawId: p.id,
                                      rawSearch: lab,
                                      rawDropdownOpen: false,
                                      unit: escandalloRecipeUnitForRawProduct(p),
                                    })
                                  }
                                  className="block w-full px-3 py-1.5 text-left text-xs text-zinc-800 hover:bg-zinc-50"
                                >
                                  {lab}
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
                      className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
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
                      className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
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
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={row.manualLabel}
                        disabled={disabled}
                        onChange={(e) => updateRow(row.key, { manualLabel: e.target.value })}
                        placeholder="Concepto"
                        className="min-w-[6rem] flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                      <input
                        value={row.manualPrice}
                        disabled={disabled}
                        onChange={(e) => updateRow(row.key, { manualPrice: e.target.value })}
                        placeholder="€/ud"
                        className="w-24 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm tabular-nums"
                        inputMode="decimal"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-100 pt-2 lg:border-t-0 lg:pt-0">
                <span className="text-xs tabular-nums text-zinc-600">
                  {est != null ? <span className="font-semibold text-zinc-900">~{est.toFixed(2)} €</span> : '—'}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeRow(row.key)}
                  className="rounded-lg border border-transparent p-1.5 text-red-700 transition hover:border-red-100 hover:bg-red-50"
                  aria-label="Quitar fila"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
