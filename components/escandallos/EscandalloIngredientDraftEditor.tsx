'use client';

import React, { useEffect, useState, type SetStateAction } from 'react';
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
  /** UI compacta tipo Pedidos para el editor de receta */
  variant?: 'default' | 'editor';
};

function badgeLabel(t: IngredientDraftRow['sourceType']): string {
  switch (t) {
    case 'raw':
      return 'CRUDO';
    case 'processed':
      return 'ELABORADO';
    case 'subrecipe':
      return 'BASE';
    case 'manual':
      return 'MANUAL';
    default:
      return '';
  }
}

function badgeTone(t: IngredientDraftRow['sourceType']): string {
  switch (t) {
    case 'raw':
      return 'bg-[#F7F3EE] text-[#7E7468] ring-[rgba(10,9,8,0.06)]';
    case 'processed':
      return 'bg-violet-50 text-violet-800 ring-violet-100';
    case 'subrecipe':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-100';
    default:
      return 'bg-zinc-100 text-zinc-600 ring-zinc-200';
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

function rowDisplayName(
  row: IngredientDraftRow,
  sortedRaw: EscandalloRawProduct[],
  processedProducts: EscandalloProcessedProduct[],
  recipes: EscandalloRecipe[],
): string {
  if (row.sourceType === 'raw' && row.rawId) {
    const p = sortedRaw.find((x) => x.id === row.rawId);
    return (p?.name ?? row.rawSearch) || 'Producto';
  }
  if (row.sourceType === 'processed' && row.processedId) {
    return processedProducts.find((x) => x.id === row.processedId)?.name ?? 'Elaborado';
  }
  if (row.sourceType === 'subrecipe' && row.subRecipeId) {
    return recipes.find((x) => x.id === row.subRecipeId)?.name ?? 'Base';
  }
  return row.manualLabel.trim() || 'Concepto manual';
}

function rowSupplierHint(
  row: IngredientDraftRow,
  sortedRaw: EscandalloRawProduct[],
): string | null {
  if (row.sourceType === 'raw' && row.rawId) {
    return sortedRaw.find((x) => x.id === row.rawId)?.supplierName ?? null;
  }
  return null;
}

function rowHasContent(row: IngredientDraftRow): boolean {
  if (row.sourceType === 'raw') return Boolean(row.rawId || row.rawSearch.trim());
  if (row.sourceType === 'processed') return Boolean(row.processedId);
  if (row.sourceType === 'subrecipe') return Boolean(row.subRecipeId);
  return Boolean(row.manualLabel.trim() || row.manualPrice.trim());
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
  variant = 'default',
}: EscandalloIngredientDraftEditorProps) {
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

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
    if (!s) return sortedRaw.slice(0, 24);
    return sortedRaw.filter((p) => `${p.name} ${p.supplierName}`.toLowerCase().includes(s)).slice(0, 32);
  };

  const pickRawProduct = (p: EscandalloRawProduct) => {
    onChange((prev) => {
      const emptyIdx = prev.findIndex((d) => d.sourceType === 'raw' && !d.rawId);
      if (emptyIdx >= 0) {
        return prev.map((d, i) =>
          i === emptyIdx
            ? {
                ...d,
                sourceType: 'raw' as const,
                rawId: p.id,
                rawSearch: rawProductPickerSummaryLine(p),
                rawDropdownOpen: false,
                unit: escandalloRecipeUnitForRawProduct(p),
              }
            : d,
        );
      }
      return [
        ...prev,
        {
          ...emptyIngredientDraft(),
          sourceType: 'raw' as const,
          rawId: p.id,
          rawSearch: rawProductPickerSummaryLine(p),
          unit: escandalloRecipeUnitForRawProduct(p),
        },
      ];
    });
    setGlobalSearch('');
    setSearchFocused(false);
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

  const showGlobalResults =
    variant === 'editor' && (searchFocused || globalSearch.trim().length > 0);

  const renderCompactDraftRow = (row: IngredientDraftRow, idx: number) => {
    const est =
      canEstimate
        ? estimateDraftRowCostEur(row, rawById!, processedById!, recipesById!, linesByRecipe, excludeRecipeId)
        : null;
    const subLines =
      row.sourceType === 'subrecipe' && row.subRecipeId ? (linesByRecipe[row.subRecipeId] ?? []) : [];
    const dispUnit = displayUnitForRow(row, sortedRaw, processedProducts);
    const name = rowDisplayName(row, sortedRaw, processedProducts, recipes);
    const supplier = rowSupplierHint(row, sortedRaw);
    const qtyNum = parseDecimal(row.qty);
    const unitEurForLine =
      est != null && qtyNum != null && qtyNum > 0 ? est / qtyNum : null;
    const unitPriceStr =
      unitEurForLine != null && Number.isFinite(unitEurForLine)
        ? formatUnitPriceEur(unitEurForLine, dispUnit)
        : '—';

    return (
      <div
        key={row.key}
        className="rounded-xl border border-[rgba(10,9,8,0.06)] bg-white px-2.5 py-2 shadow-[0_1px_0_rgba(10,9,8,0.04)] ring-1 ring-[rgba(10,9,8,0.04)]"
      >
        <EditorDraftRowTop
          row={row}
          name={name}
          supplier={supplier}
          unitPriceStr={unitPriceStr}
          dispUnit={dispUnit}
          qtyNum={qtyNum}
          est={est}
        />

        {(row.sourceType === 'processed' ||
          row.sourceType === 'subrecipe' ||
          row.sourceType === 'manual' ||
          (row.sourceType === 'raw' && !row.rawId)) && (
          <div className="mt-2 space-y-2 border-t border-[rgba(10,9,8,0.06)] pt-2">
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
              className="h-7 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[9px] font-bold uppercase tracking-wide text-[#0A0908]"
              aria-label="Tipo"
            >
              <option value="raw">Crudo</option>
              <option value="processed">Elaborado</option>
              <option value="subrecipe">Base</option>
              <option value="manual">Manual</option>
            </select>
            {row.sourceType === 'processed' ? (
              <select
                value={row.processedId}
                disabled={disabled}
                onChange={(e) => {
                  const id = e.target.value;
                  const p = processedProducts.find((x) => x.id === id);
                  updateRow(row.key, { processedId: id, unit: p?.outputUnit ?? 'kg' });
                }}
                className="h-9 w-full rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-2 text-[12px] font-semibold text-[#0A0908]"
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
                className="h-9 w-full rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-2 text-[12px] font-semibold text-[#0A0908]"
              >
                <option value="">Base…</option>
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
              <div className="flex gap-2">
                <input
                  value={row.manualLabel}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.key, { manualLabel: e.target.value })}
                  placeholder="Nombre"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[rgba(10,9,8,0.08)] px-2 text-[12px]"
                />
                <input
                  value={row.manualPrice}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.key, { manualPrice: e.target.value })}
                  placeholder="€/ud"
                  className="h-9 w-20 rounded-lg border border-[rgba(10,9,8,0.08)] px-2 text-[12px] tabular-nums"
                  inputMode="decimal"
                />
              </div>
            ) : null}
            {row.sourceType === 'raw' && !row.rawId ? (
              <p className="text-[10px] text-[#7E7468]">Usa el buscador superior o elige otro tipo.</p>
            ) : null}
            {(row.sourceType === 'subrecipe' || row.sourceType === 'manual') && (
              <>
                <input
                  list={`esc-draft-units-${row.key}`}
                  value={row.unit}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                  className="h-8 w-24 rounded-lg border border-[rgba(10,9,8,0.08)] px-2 text-[11px]"
                  placeholder="ud"
                />
                <datalist id={`esc-draft-units-${row.key}`}>
                  {ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-[rgba(10,9,8,0.06)] pt-2">
          <div className="flex items-center gap-1">
            <input
              value={row.qty}
              disabled={disabled}
              onChange={(e) => updateRow(row.key, { qty: e.target.value })}
              className="h-8 w-14 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-1.5 text-center text-[13px] font-black tabular-nums text-[#0A0908] outline-none focus:border-[#D32F2F]/40 focus:ring-1 focus:ring-[#D32F2F]/15"
              inputMode="decimal"
              aria-label="Cantidad"
            />
            <span className="text-[11px] font-semibold text-[#7E7468]">{dispUnit}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={disabled || idx === 0}
              onClick={() => moveRow(idx, idx - 1)}
              className="grid h-7 w-7 place-items-center rounded-md text-[#7E7468] transition hover:bg-[#F7F3EE] disabled:opacity-25"
              aria-label="Subir"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled || idx >= drafts.length - 1}
              onClick={() => moveRow(idx, idx + 1)}
              className="grid h-7 w-7 place-items-center rounded-md text-[#7E7468] transition hover:bg-[#F7F3EE] disabled:opacity-25"
              aria-label="Bajar"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeRow(row.key)}
              className="grid h-7 w-7 place-items-center rounded-md text-[#D32F2F] transition hover:bg-[#D32F2F]/10"
              aria-label="Quitar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {row.sourceType === 'subrecipe' && subLines.length > 0 ? (
          <ul className="mt-2 space-y-0.5 border-t border-dashed border-[rgba(10,9,8,0.08)] pt-2 text-[10px] text-[#7E7468]">
            {subLines.map((ln) => (
              <li key={ln.id} className="tabular-nums">
                {ln.label} · {ln.qty} {ln.unit}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  if (variant === 'editor') {
    const visibleDrafts = drafts.filter((d, i) => rowHasContent(d) || i > 0 || drafts.length > 1);
    const results = filteredRaw(globalSearch);

    return (
      <div className="space-y-2.5">
        <div className="relative" data-esc-raw-picker>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7E7468]" aria-hidden />
          <input
            value={globalSearch}
            disabled={disabled}
            autoComplete="off"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 160)}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Buscar producto o proveedor…"
            className="h-10 w-full rounded-xl border border-[rgba(10,9,8,0.08)] bg-white py-2 pl-9 pr-3 text-[13px] font-medium text-[#0A0908] shadow-[0_1px_0_rgba(10,9,8,0.04)] outline-none transition placeholder:text-[#7E7468]/80 focus:border-[#D32F2F]/35 focus:ring-2 focus:ring-[#D32F2F]/10"
          />
          {showGlobalResults ? (
            <div
              className="absolute left-0 right-0 z-[80] mt-1.5 max-h-[min(50vh,18rem)] overflow-y-auto overscroll-contain rounded-xl border border-[rgba(10,9,8,0.08)] bg-white shadow-[0_8px_24px_rgba(10,9,8,0.12)]"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {results.length === 0 ? (
                <p className="px-3 py-4 text-center text-[12px] text-[#7E7468]">Sin resultados</p>
              ) : (
                results.map((p) => {
                  const pack = p.unitsPerPack > 0 ? p.unitsPerPack : 1;
                  const ru = p.recipeUnit ?? 'ud';
                  const sub =
                    pack > 1
                      ? `${formatUnitPriceEur(roundMoney(p.pricePerUnit / pack), ru)} / ${ru}`
                      : formatUnitPriceEur(p.pricePerUnit, p.unit);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => pickRawProduct(p)}
                      className="flex w-full items-center gap-2 border-b border-[rgba(10,9,8,0.04)] px-2.5 py-2.5 text-left last:border-b-0 transition hover:bg-[#FAFAF9] active:bg-[#F7F3EE]"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#D32F2F]/10 text-[11px] font-black text-[#B91C1C]">
                        +
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-bold text-[#0A0908]">{p.name}</span>
                        <span className="block truncate text-[10px] text-[#7E7468]">
                          {p.supplierName} · {sub}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(['raw', 'processed', 'subrecipe', 'manual'] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange((prev) => {
                  const emptyIdx = prev.findIndex((d) => !rowHasContent(d));
                  if (emptyIdx >= 0) {
                    return prev.map((d, i) =>
                      i === emptyIdx
                        ? {
                            ...emptyIngredientDraft(),
                            key: d.key,
                            sourceType: t,
                            unit: t === 'raw' ? 'kg' : d.unit,
                          }
                        : d,
                    );
                  }
                  return [...prev, { ...emptyIngredientDraft(), sourceType: t }];
                });
              }}
              className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ring-1 transition ${badgeTone(t)}`}
            >
              {badgeLabel(t)}
            </button>
          ))}
        </div>

        {visibleDrafts.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Pendientes de añadir</p>
            {visibleDrafts.map((row, idx) => renderCompactDraftRow(row, drafts.indexOf(row)))}
          </div>
        ) : null}

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...drafts, emptyIngredientDraft()])}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[rgba(10,9,8,0.12)] py-2 text-[11px] font-semibold text-[#7E7468] transition hover:border-[#D32F2F]/25 hover:bg-[#FAFAF9] hover:text-[#0A0908]"
        >
          <Plus className="h-3.5 w-3.5" />
          {addButtonLabel}
        </button>
      </div>
    );
  }

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

            <div className="mt-3 flex flex-wrap items-center justify-end gap-1 border-t border-zinc-100 pt-2">
              <span className="mr-auto text-[10px] font-semibold uppercase text-zinc-400 sm:hidden">
                {badgeLabel(row.sourceType)}
              </span>
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

function EditorDraftRowTop({
  row,
  name,
  supplier,
  unitPriceStr,
  dispUnit,
  qtyNum,
  est,
}: {
  row: IngredientDraftRow;
  name: string;
  supplier: string | null;
  unitPriceStr: string;
  dispUnit: string;
  qtyNum: number | null;
  est: number | null;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.1em] ring-1 ${badgeTone(row.sourceType)}`}
      >
        {badgeLabel(row.sourceType)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[12px] font-bold leading-tight text-[#0A0908]">{name}</p>
        {supplier ? <p className="mt-0.5 truncate text-[10px] text-[#7E7468]">{supplier}</p> : null}
        {qtyNum != null && qtyNum > 0 ? (
          <p className="mt-0.5 text-[10px] tabular-nums text-[#7E7468]">
            {row.qty.trim()} {dispUnit} · {unitPriceStr}
          </p>
        ) : null}
      </div>
      <p className="shrink-0 text-[14px] font-black tabular-nums text-[#0A0908]">
        {est != null ? formatMoneyEur(est) : '—'}
      </p>
    </div>
  );
}
