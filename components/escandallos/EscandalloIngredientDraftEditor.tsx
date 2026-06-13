'use client';

import React, { useEffect, type SetStateAction } from 'react';
import { ChevronDown, ChevronUp, Plus, Search, Trash2 } from 'lucide-react';
import { ESCANDALLO_USAGE_UNIT_PRESETS } from '@/lib/escandallo-ingredient-units';
import { computeOperationalCost, formatOperationalSummary, type EscandalloYieldUnit, unitCompatible } from '@/lib/escandallo-operational-usage';
import {
  emptyIngredientDraft,
  estimateDraftRowCostEur,
  parseDecimal,
  type IngredientDraftRow,
} from '@/lib/escandallos-recipe-draft-utils';
import {
  escandalloRecipeUnitForRawProduct,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import type { EscandalloTechnicalSheet } from '@/lib/escandallos-technical-sheet-supabase';
import { formatMoneyEur, formatUnitPriceEur } from '@/lib/money-format';
import { rawIngredientWeightDetail } from '@/lib/escandallo-input-weight';
import type { EscandalloCentralKitchenCatalogItem } from '@/lib/central-kitchen-public-catalog';
import { isModuleEnabled } from '@/lib/module-config';

export type EscandalloIngredientDraftEditorProps = {
  drafts: IngredientDraftRow[];
  onChange: (next: SetStateAction<IngredientDraftRow[]>) => void;
  sortedRaw: EscandalloRawProduct[];
  processedProducts: EscandalloProcessedProduct[];
  recipes: EscandalloRecipe[];
  centralKitchenProducts?: EscandalloCentralKitchenCatalogItem[];
  excludeRecipeId: string | null;
  disabled: boolean;
  linesByRecipe?: Record<string, EscandalloLine[]>;
  rawById?: Map<string, EscandalloRawProduct>;
  processedById?: Map<string, EscandalloProcessedProduct>;
  recipesById?: Map<string, EscandalloRecipe>;
  technicalSheetsByRecipe?: Map<string, EscandalloTechnicalSheet>;
  addButtonLabel?: string;
  onSubmitDrafts?: () => void;
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
    case 'central_kitchen':
      return 'COCINA CENTRAL';
    default:
      return '';
  }
}

function displayUnitForRow(
  row: IngredientDraftRow,
  sortedRaw: EscandalloRawProduct[],
  processedProducts: EscandalloProcessedProduct[],
  centralKitchenProducts: EscandalloCentralKitchenCatalogItem[],
): string {
  if (row.sourceType === 'raw' && row.rawId) {
    const rp = sortedRaw.find((x) => x.id === row.rawId);
    const fmt = selectedUsageFormatForRow(row, rp ?? null);
    if (fmt) return fmt.usageUnit;
    if (row.rawUsageFormatId === '__manual_weight__') return row.unit.trim() || 'kg';
    return rp ? escandalloRecipeUnitForRawProduct(rp) : row.unit;
  }
  if (row.sourceType === 'processed' && row.processedId) {
    return processedProducts.find((x) => x.id === row.processedId)?.outputUnit ?? row.unit;
  }
  if (row.sourceType === 'central_kitchen' && row.centralKitchenId) {
    return centralKitchenProducts.find((x) => x.id === row.centralKitchenId)?.outputUnit ?? row.unit;
  }
  return row.unit.trim() || 'ud';
}

function defaultUsageFormatForRaw(p: EscandalloRawProduct | null | undefined) {
  const formats = p?.usageFormats ?? [];
  return formats.find((f) => f.isDefault) ?? formats[0] ?? null;
}

function selectedUsageFormatForRow(row: IngredientDraftRow, p: EscandalloRawProduct | null | undefined) {
  if (!p || row.sourceType !== 'raw' || !row.rawUsageFormatId || row.rawUsageFormatId === '__manual_weight__') {
    return null;
  }
  return p.usageFormats?.find((f) => f.id === row.rawUsageFormatId) ?? null;
}

type SearchOption = {
  key: string;
  group: 'ARTÍCULOS' | 'BASES Y ELABORACIONES' | 'COCINA CENTRAL';
  sourceType: IngredientDraftRow['sourceType'];
  id: string;
  title: string;
  subtitle: string;
  unit: string;
};

function getSubrecipeOperationalConfig(
  row: IngredientDraftRow,
  recipesById?: Map<string, EscandalloRecipe>,
  technicalSheetsByRecipe?: Map<string, EscandalloTechnicalSheet>,
) {
  if (!row.subRecipeId) return null;
  const recipe = recipesById?.get(row.subRecipeId) ?? null;
  const sheet = technicalSheetsByRecipe?.get(row.subRecipeId) ?? null;
  const yieldUnit = (sheet?.yieldUnit ?? recipe?.finalWeightUnit ?? null) as EscandalloYieldUnit | null;
  const yieldCostPerUnit =
    sheet?.yieldCostPerUnit != null && Number.isFinite(sheet.yieldCostPerUnit) ? sheet.yieldCostPerUnit : null;
  const quantity =
    row.subRecipeOperationalQuantity && parseDecimal(row.subRecipeOperationalQuantity) != null
      ? parseDecimal(row.subRecipeOperationalQuantity)!
      : sheet?.operationalQuantity ?? null;
  const unit = (row.subRecipeOperationalUnit
    ? row.subRecipeOperationalUnit
    : sheet?.operationalUnit ?? null) as EscandalloYieldUnit | null;
  const portionCost =
    sheet?.operationalCost != null && Number.isFinite(sheet.operationalCost)
      ? sheet.operationalCost
      : computeOperationalCost(yieldCostPerUnit, yieldUnit, quantity, unit);
  return {
    recipe,
    sheet,
    quantity,
    unit,
    yieldUnit,
    yieldCostPerUnit,
    portionCost,
    canUseStandard: Boolean(
      sheet?.operationalUsageType &&
        quantity != null &&
        quantity > 0 &&
        unit &&
        portionCost != null,
    ),
  };
}

function getStandardPortionPatch(
  row: IngredientDraftRow,
  mode: 'custom' | 'standard_portion',
  recipesById?: Map<string, EscandalloRecipe>,
  technicalSheetsByRecipe?: Map<string, EscandalloTechnicalSheet>,
) {
  if (mode !== 'standard_portion') {
    return {
      subRecipeUsageMode: mode,
      subRecipeOperationalQuantity: '',
      subRecipeOperationalUnit: '',
      unit: row.unit || 'g',
    } as const;
  }
  const config = getSubrecipeOperationalConfig(row, recipesById, technicalSheetsByRecipe);
  return {
    subRecipeUsageMode: mode,
    subRecipeOperationalQuantity:
      config?.quantity != null && Number.isFinite(config.quantity) && config.quantity > 0
        ? String(config.quantity)
        : '',
    subRecipeOperationalUnit: config?.unit ?? '',
    unit: 'racion',
  } as const;
}

export default function EscandalloIngredientDraftEditor({
  drafts,
  onChange,
  sortedRaw,
  processedProducts,
  recipes,
  centralKitchenProducts = [],
  excludeRecipeId,
  disabled,
  linesByRecipe = {},
  rawById,
  processedById,
  recipesById,
  technicalSheetsByRecipe,
  addButtonLabel = 'Añadir ingrediente',
  onSubmitDrafts,
  variant = 'default',
}: EscandalloIngredientDraftEditorProps) {
  const centralKitchenEnabled = isModuleEnabled('cocina_central');
  const enabledCentralKitchenProducts = React.useMemo(
    () => (centralKitchenEnabled ? centralKitchenProducts : []),
    [centralKitchenEnabled, centralKitchenProducts],
  );
  const centralKitchenById = React.useMemo(
    () => new Map(enabledCentralKitchenProducts.map((item) => [item.id, item])),
    [enabledCentralKitchenProducts],
  );

  const updateRow = (key: string, patch: Partial<IngredientDraftRow>) => {
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const removeRow = (key: string) => {
    if (variant === 'editor') {
      const next = drafts.filter((d) => d.key !== key);
      onChange(next.length > 0 ? next : [emptyIngredientDraft()]);
      return;
    }
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

  const buildSearchOptions = (sourceType: IngredientDraftRow['sourceType'], q: string): SearchOption[] => {
    const s = q.trim().toLowerCase();
    if (sourceType === 'processed') {
      return processedProducts
        .filter((p) => !s || p.name.toLowerCase().includes(s))
        .slice(0, s ? 18 : 10)
        .map(
          (p): SearchOption => ({
            key: `proc-${p.id}`,
            group: 'BASES Y ELABORACIONES',
            sourceType: 'processed',
            id: p.id,
            title: p.name,
            subtitle: `Elaboración · ${p.outputUnit}`,
            unit: p.outputUnit,
          }),
        );
    }
    if (sourceType === 'subrecipe') {
      return recipes
        .filter((r) => r.id !== excludeRecipeId && r.isSubRecipe)
        .filter((r) => !s || r.name.toLowerCase().includes(s))
        .slice(0, s ? 18 : 10)
        .map(
          (r): SearchOption => ({
            key: `sub-${r.id}`,
            group: 'BASES Y ELABORACIONES',
            sourceType: 'subrecipe',
            id: r.id,
            title: r.name,
            subtitle: 'Base / elaboración Chef One',
            unit: 'g',
          }),
        );
    }
    if (sourceType === 'central_kitchen') {
      if (!centralKitchenEnabled) return [];
      return enabledCentralKitchenProducts
        .filter((p) => p.active)
        .filter((p) => !s || `${p.name} ${p.category ?? ''}`.toLowerCase().includes(s))
        .slice(0, s ? 18 : 10)
        .map(
          (p): SearchOption => ({
            key: `ck-${p.id}`,
            group: 'COCINA CENTRAL',
            sourceType: 'central_kitchen',
            id: p.id,
            title: p.name,
            subtitle:
              p.unitCost != null ? `${formatUnitPriceEur(p.unitCost, p.outputUnit)} · Cocina Central` : 'Cocina Central',
            unit: p.outputUnit,
          }),
        );
    }
    if (sourceType === 'manual') return [];
    const rawOpts = sortedRaw
      .filter((p) => !s || `${p.name} ${p.supplierName}`.toLowerCase().includes(s))
      .slice(0, s ? 18 : 10)
      .map(
        (p): SearchOption => ({
          key: `raw-${p.id}`,
          group: 'ARTÍCULOS',
          sourceType: 'raw',
          id: p.id,
          title: p.name,
          subtitle: p.supplierName,
          unit: escandalloRecipeUnitForRawProduct(p),
        }),
      );
    return rawOpts;
  };

  const selectSearchOption = (row: IngredientDraftRow, option: SearchOption) => {
    const selectedRaw = option.sourceType === 'raw' ? sortedRaw.find((p) => p.id === option.id) ?? null : null;
    const defaultFormat = defaultUsageFormatForRaw(selectedRaw);
    updateRow(row.key, {
      sourceType: option.sourceType,
      rawId: option.sourceType === 'raw' ? option.id : '',
      rawUsageFormatId: option.sourceType === 'raw' && defaultFormat ? defaultFormat.id : '',
      processedId: option.sourceType === 'processed' ? option.id : '',
      subRecipeId: option.sourceType === 'subrecipe' ? option.id : '',
      centralKitchenId: option.sourceType === 'central_kitchen' ? option.id : '',
      rawSearch: option.title,
      rawDropdownOpen: false,
      manualLabel: '',
      manualPrice: '',
      unit: option.sourceType === 'raw' && defaultFormat ? defaultFormat.usageUnit : option.unit,
      qty: row.qty || '1',
      subRecipeUsageMode: option.sourceType === 'subrecipe' ? 'custom' : 'custom',
      subRecipeOperationalQuantity: '',
      subRecipeOperationalUnit: '',
    });
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

  const draftRowConfigured = (row: IngredientDraftRow): boolean => {
    if (row.sourceType === 'raw') return Boolean(row.rawId);
    if (row.sourceType === 'processed') return Boolean(row.processedId);
    if (row.sourceType === 'subrecipe') return Boolean(row.subRecipeId);
    if (row.sourceType === 'central_kitchen') return Boolean(row.centralKitchenId);
    return Boolean(row.manualLabel.trim());
  };

  const renderUsageFormatSelector = (row: IngredientDraftRow, compact: boolean) => {
    if (row.sourceType !== 'raw' || !row.rawId) return null;
    const rawProduct = sortedRaw.find((x) => x.id === row.rawId) ?? null;
    const formats = rawProduct?.usageFormats ?? [];
    if (!rawProduct || formats.length === 0) return null;
    const selected = selectedUsageFormatForRow(row, rawProduct);
    const className = compact
      ? 'h-7 w-full rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-2 text-[10px] font-bold text-[#0A0908] outline-none focus:border-[#D32F2F]/35'
      : 'min-h-[44px] w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-base font-semibold outline-none focus:border-[#D32F2F]/40 sm:min-h-0 sm:py-1.5 sm:text-sm';
    return (
      <div className={compact ? 'mt-1.5 grid gap-1' : 'grid gap-1 sm:max-w-[24rem]'}>
        <span className={compact ? 'text-[8px] font-black uppercase tracking-[0.12em] text-[#7E7468]' : 'text-[9px] font-bold uppercase text-zinc-500'}>
          Formato de uso
        </span>
        <select
          value={row.rawUsageFormatId || selected?.id || ''}
          disabled={disabled}
          onChange={(e) => {
            const value = e.target.value;
            const fmt = formats.find((f) => f.id === value) ?? null;
            updateRow(row.key, {
              rawUsageFormatId: value,
              unit: fmt ? fmt.usageUnit : escandalloRecipeUnitForRawProduct(rawProduct),
            });
          }}
          className={className}
        >
          {formats.map((fmt) => (
            <option key={fmt.id} value={fmt.id}>
              {fmt.name} · {formatUnitPriceEur(fmt.costPerUsageUnit, fmt.usageUnit)}
            </option>
          ))}
          <option value="__manual_weight__">Usar peso manual · {formatUnitPriceEur(rawProduct.pricePerUnit, rawProduct.pricingUnit ?? rawProduct.unit)}</option>
        </select>
      </div>
    );
  };

  const renderCompactDraftRow = (row: IngredientDraftRow) => {
    const est = canEstimate
      ? estimateDraftRowCostEur(
          row,
          rawById!,
          processedById!,
          recipesById!,
          centralKitchenById,
          linesByRecipe,
          excludeRecipeId,
          technicalSheetsByRecipe,
        )
      : null;
    const dispUnit = displayUnitForRow(row, sortedRaw, processedProducts, enabledCentralKitchenProducts);
    const configured = draftRowConfigured(row);
    const rawProduct = row.sourceType === 'raw' && row.rawId ? sortedRaw.find((x) => x.id === row.rawId) : null;
    const centralItem =
      row.sourceType === 'central_kitchen' && row.centralKitchenId
        ? enabledCentralKitchenProducts.find((x) => x.id === row.centralKitchenId) ?? null
        : null;
    const centralUnitWarning =
      centralItem && !unitCompatible(centralItem.outputUnit, row.unit) && centralItem.outputUnit !== row.unit
        ? 'Unidad no compatible con el formato de Cocina Central.'
        : null;
    const qtyNum = parseDecimal(row.qty);
    const rawWeightDetail =
      row.sourceType === 'raw' && rawProduct && qtyNum != null
        ? rawIngredientWeightDetail(qtyNum, dispUnit, rawProduct)
        : null;
    const subrecipeConfig =
      row.sourceType === 'subrecipe' ? getSubrecipeOperationalConfig(row, recipesById, technicalSheetsByRecipe) : null;
    const usingStandard = row.sourceType === 'subrecipe' && row.subRecipeUsageMode === 'standard_portion';

    return (
      <div key={row.key} className="rounded-lg border border-[rgba(10,9,8,0.06)] bg-[#FAFAF9]/80 px-2 py-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <select
                value={row.sourceType}
                disabled={disabled}
                onChange={(e) =>
                  updateRow(row.key, {
                    sourceType: e.target.value as IngredientDraftRow['sourceType'],
                    rawId: '',
                    rawUsageFormatId: '',
                    processedId: '',
                    subRecipeId: '',
                    centralKitchenId: '',
                    rawSearch: '',
                    rawDropdownOpen: false,
                    manualLabel: '',
                    manualPrice: '',
                    unit: row.unit || 'kg',
                    subRecipeUsageMode: 'custom',
                    subRecipeOperationalQuantity: '',
                    subRecipeOperationalUnit: '',
                  })
                  }
                className="h-7 w-[4.9rem] shrink-0 rounded-md border border-zinc-200 bg-white px-1 text-[8px] font-bold uppercase tracking-wide text-zinc-900 outline-none focus:border-[#D32F2F]/35"
                aria-label="Tipo de ingrediente"
              >
                <option value="raw">Crudo</option>
                <option value="processed">Elaborado</option>
                <option value="subrecipe">Base</option>
                {centralKitchenEnabled ? <option value="central_kitchen">Cocina Central</option> : null}
                <option value="manual">Manual</option>
              </select>

              <div className="min-w-0 flex-1">
                {row.sourceType !== 'manual' ? (
                  <div className="relative w-full" data-esc-raw-picker>
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7E7468]" aria-hidden />
                    <input
                      value={row.rawSearch}
                      disabled={disabled}
                      autoComplete="off"
                      onFocus={() => updateRow(row.key, { rawDropdownOpen: true })}
                      onChange={(e) =>
                        updateRow(row.key, {
                          rawSearch: e.target.value,
                          rawDropdownOpen: true,
                          rawId: '',
                          rawUsageFormatId: '',
                          processedId: '',
                          subRecipeId: '',
                          centralKitchenId: '',
                        })
                      }
                      placeholder={centralKitchenEnabled ? 'Buscar artículos, bases o Cocina Central…' : 'Buscar artículos o bases…'}
                      className="h-7 w-full rounded-lg border border-[rgba(10,9,8,0.08)] bg-white py-1 pl-8 pr-2 text-[11px] font-medium text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/10"
                    />
                    {row.rawDropdownOpen ? (
                      <div
                        className="absolute left-0 right-0 z-[80] mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-[rgba(10,9,8,0.08)] bg-white shadow-[0_8px_24px_rgba(10,9,8,0.12)]"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {buildSearchOptions(row.sourceType, row.rawSearch).length === 0 ? (
                          <p className="px-3 py-3 text-center text-[11px] text-[#7E7468]">Sin resultados</p>
                        ) : (
                          (() => {
                            let currentGroup = '';
                            return buildSearchOptions(row.sourceType, row.rawSearch).map((option) => {
                              const showGroup = option.group !== currentGroup;
                              currentGroup = option.group;
                              return (
                                <React.Fragment key={option.key}>
                                  {showGroup ? (
                                    <p className="bg-[#FAFAF9] px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#7E7468]">
                                      {option.group}
                                    </p>
                                  ) : null}
                                  <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => selectSearchOption(row, option)}
                                    className="flex w-full flex-col items-start gap-0.5 border-b border-zinc-100 px-3 py-2 text-left last:border-b-0 hover:bg-zinc-50"
                                  >
                                    <span className="truncate text-[11px] font-bold text-zinc-900">{option.title}</span>
                                    <span className="truncate text-[10px] text-[#7E7468]">{option.subtitle}</span>
                                  </button>
                                </React.Fragment>
                              );
                            });
                          })()
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {row.sourceType === 'subrecipe' ? (
                  <div className="space-y-1">
                    {subrecipeConfig?.canUseStandard ? (
                      <div className="grid grid-cols-[1fr_auto] gap-1.5">
                        <select
                          value={row.subRecipeUsageMode ?? 'custom'}
                          disabled={disabled}
                          onChange={(e) =>
                            updateRow(
                              row.key,
                              getStandardPortionPatch(
                                row,
                                e.target.value as 'custom' | 'standard_portion',
                                recipesById,
                                technicalSheetsByRecipe,
                              ),
                            )
                          }
                          className="h-7 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-2 text-[10px] font-bold text-[#0A0908]"
                        >
                          <option value="custom">Personalizado</option>
                          <option value="standard_portion">Ración estándar</option>
                        </select>
                        {row.subRecipeUsageMode === 'standard_portion' ? (
                          <span className="inline-flex items-center rounded-md bg-[#4A6B3A]/10 px-2 text-[10px] font-bold text-[#35502A]">
                            {formatOperationalSummary(subrecipeConfig.quantity, subrecipeConfig.unit)}
                          </span>
                        ) : null}
                      </div>
                    ) : row.subRecipeId ? (
                      <p className="text-[10px] font-medium text-[#B8872A]">
                        Configura uso operativo para usar raciones estándar.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {renderUsageFormatSelector(row, true)}
                {row.sourceType === 'manual' ? (
                  <div className="flex gap-1.5">
                    <input
                      value={row.manualLabel}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.key, { manualLabel: e.target.value })}
                      placeholder="Nombre"
                      className="h-7 min-w-0 flex-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-2 text-[11px] font-medium text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/10"
                    />
                    <input
                      value={row.manualPrice}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.key, { manualPrice: e.target.value })}
                      placeholder="€/ud"
                      className="h-7 w-16 shrink-0 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-1.5 text-[11px] font-bold tabular-nums text-[#0A0908] outline-none focus:border-[#D32F2F]/35"
                      inputMode="decimal"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1">
                  <span className="text-[9px] font-bold uppercase text-[#7E7468]">Cantidad</span>
                  <input
                    value={row.qty}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                    className="h-7 w-16 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-2 text-[11px] font-semibold tabular-nums text-[#0A0908] outline-none focus:border-[#D32F2F]/35 focus:ring-1 focus:ring-[#D32F2F]/10"
                    inputMode="decimal"
                  />
                </label>
                {row.sourceType === 'central_kitchen' ||
                (row.sourceType === 'raw' && row.rawUsageFormatId === '__manual_weight__') ? (
                  <input
                    list={`esc-draft-units-${row.key}`}
                    value={row.unit}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                    className="h-7 w-16 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white px-2 text-[10px] font-semibold text-[#7E7468] outline-none focus:border-[#D32F2F]/35"
                    placeholder={dispUnit}
                  />
                ) : (
                  <span className="text-[10px] font-semibold text-[#7E7468]">{dispUnit}</span>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {usingStandard && subrecipeConfig ? (
                  <p className="hidden text-[9px] font-medium text-[#7E7468] sm:block">
                    {formatOperationalSummary(subrecipeConfig.quantity, subrecipeConfig.unit)} ·{' '}
                    {subrecipeConfig.yieldCostPerUnit != null && subrecipeConfig.yieldUnit
                      ? formatUnitPriceEur(subrecipeConfig.yieldCostPerUnit, subrecipeConfig.yieldUnit)
                      : 'Pendiente'}
                  </p>
                ) : null}
                {configured ? <p className="text-[13px] font-black tabular-nums text-[#0A0908]">{est != null ? formatMoneyEur(est) : '—'}</p> : null}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeRow(row.key)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#D32F2F] transition hover:bg-[#D32F2F]/10"
                  aria-label="Quitar línea"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {rawWeightDetail ? (
              <p className="mt-1 text-[9px] font-medium text-[#7E7468]">
                {rawProduct?.name} · {rawWeightDetail}
              </p>
            ) : null}
            {centralUnitWarning ? (
              <p className="mt-1 text-[9px] font-medium text-[#B8872A]">{centralUnitWarning}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  if (variant === 'editor') {
    const visibleDrafts = drafts;
    return (
      <div className="space-y-2.5">
        {visibleDrafts.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7E7468]">Pendientes de añadir</p>
            {visibleDrafts.map((row) => renderCompactDraftRow(row))}
          </div>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (onSubmitDrafts) {
              onSubmitDrafts();
              return;
            }
            onChange([...drafts, emptyIngredientDraft()]);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
        >
          <Plus className="h-4 w-4" />
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
            ? estimateDraftRowCostEur(
                row,
                rawById,
                processedById,
                recipesById,
                centralKitchenById,
                linesByRecipe,
                excludeRecipeId,
                technicalSheetsByRecipe,
              )
            : null;
        const subLines =
          row.sourceType === 'subrecipe' && row.subRecipeId ? (linesByRecipe[row.subRecipeId] ?? []) : [];
        const subrecipeConfig =
          row.sourceType === 'subrecipe' ? getSubrecipeOperationalConfig(row, recipesById, technicalSheetsByRecipe) : null;
        const qtyNum = parseDecimal(row.qty);
        const dispUnit = displayUnitForRow(row, sortedRaw, processedProducts, enabledCentralKitchenProducts);
        const rawProduct = row.sourceType === 'raw' && row.rawId ? sortedRaw.find((x) => x.id === row.rawId) : null;
        const centralItem =
          row.sourceType === 'central_kitchen' && row.centralKitchenId
            ? enabledCentralKitchenProducts.find((x) => x.id === row.centralKitchenId) ?? null
            : null;
        const rawWeightDetail =
          row.sourceType === 'raw' && rawProduct && qtyNum != null
            ? rawIngredientWeightDetail(qtyNum, dispUnit, rawProduct)
            : null;
        const centralUnitWarning =
          centralItem && !unitCompatible(centralItem.outputUnit, row.unit) && centralItem.outputUnit !== row.unit
            ? 'Unidad no compatible con el formato de Cocina Central.'
            : null;
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
                      rawUsageFormatId: '',
                      processedId: '',
                      subRecipeId: '',
                      centralKitchenId: '',
                      rawSearch: '',
                      rawDropdownOpen: false,
                      unit: 'kg',
                      subRecipeUsageMode: 'custom',
                      subRecipeOperationalQuantity: '',
                      subRecipeOperationalUnit: '',
                    })
                  }
                  className="min-h-[40px] rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-900 outline-none focus:border-[#D32F2F]/40 focus:ring-2 focus:ring-[#D32F2F]/15 sm:min-h-0"
                  aria-label="Tipo de ingrediente"
                >
                  <option value="raw">Crudo</option>
                  <option value="processed">Elaborado</option>
                  <option value="subrecipe">Base</option>
                  {centralKitchenEnabled ? <option value="central_kitchen">Cocina Central</option> : null}
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {row.sourceType !== 'manual' ? (
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
                          rawUsageFormatId: '',
                          processedId: '',
                          subRecipeId: '',
                          centralKitchenId: '',
                        });
                      }}
                      placeholder={centralKitchenEnabled ? 'Buscar artículos, bases o Cocina Central…' : 'Buscar artículos o bases…'}
                      className="min-h-[48px] w-full rounded-xl border-2 border-zinc-200 bg-white py-3 pl-11 pr-3 text-base leading-snug outline-none transition focus:border-[#D32F2F]/50 focus:ring-2 focus:ring-[#D32F2F]/15 sm:min-h-0 sm:py-2.5 sm:text-sm"
                    />
                    {row.rawDropdownOpen ? (
                      <div
                        className="absolute left-0 right-0 z-[80] mt-2 max-h-[min(55vh,22rem)] overflow-y-auto overscroll-contain rounded-xl border-2 border-zinc-200 bg-white shadow-2xl sm:max-h-72"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {buildSearchOptions(row.sourceType, row.rawSearch).length === 0 ? (
                          <p className="px-4 py-4 text-center text-sm text-zinc-500">Sin resultados</p>
                        ) : (
                          (() => {
                            let currentGroup = '';
                            return buildSearchOptions(row.sourceType, row.rawSearch).map((option) => {
                              const showGroup = option.group !== currentGroup;
                              currentGroup = option.group;
                              return (
                                <React.Fragment key={option.key}>
                                  {showGroup ? (
                                    <p className="bg-[#FAFAF9] px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#7E7468]">
                                      {option.group}
                                    </p>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => selectSearchOption(row, option)}
                                    className="flex min-h-[56px] w-full flex-col items-start gap-0.5 border-b border-zinc-100 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-50 active:bg-zinc-100"
                                  >
                                    <span className="break-words text-[15px] font-semibold leading-snug text-zinc-900">
                                      {option.title}
                                    </span>
                                    <span className="text-sm text-zinc-600">{option.subtitle}</span>
                                  </button>
                                </React.Fragment>
                              );
                            });
                          })()
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {row.sourceType === 'subrecipe' ? (
                  <div className="space-y-2">
                    {subrecipeConfig?.canUseStandard ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_auto]">
                        <label className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase text-zinc-500">Modo</span>
                          <select
                            value={row.subRecipeUsageMode ?? 'custom'}
                            disabled={disabled}
                            onChange={(e) =>
                              updateRow(row.key, {
                                ...getStandardPortionPatch(
                                  row,
                                  e.target.value as 'custom' | 'standard_portion',
                                  recipesById,
                                  technicalSheetsByRecipe,
                                ),
                                qty: row.qty || '1',
                              })
                            }
                            className="min-h-[44px] rounded-lg border border-zinc-200 bg-white px-2 py-2 text-base sm:min-h-0 sm:text-sm"
                          >
                            <option value="custom">Personalizado</option>
                            <option value="standard_portion">Ración estándar</option>
                          </select>
                        </label>
                        {row.subRecipeUsageMode === 'standard_portion' ? (
                          <>
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[9px] font-bold uppercase text-zinc-500">Cantidad</span>
                              <input
                                value={row.qty}
                                disabled={disabled}
                                onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                                className="min-h-[44px] rounded-lg border border-zinc-200 bg-white px-2 py-2 text-base font-semibold tabular-nums sm:min-h-0 sm:text-sm"
                                inputMode="decimal"
                              />
                            </label>
                            <div className="flex min-h-[44px] flex-col justify-center rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1.5 sm:min-h-0">
                              <span className="text-[8px] font-bold uppercase text-emerald-800/80">Detalle</span>
                              <span className="text-[11px] font-semibold text-emerald-950">
                                {formatOperationalSummary(subrecipeConfig.quantity, subrecipeConfig.unit)}
                              </span>
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : row.subRecipeId ? (
                      <p className="text-[11px] font-medium text-[#B8872A]">
                        Configura uso operativo para usar raciones estándar.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {renderUsageFormatSelector(row, false)}
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
                      {dispUnit}
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
                {row.sourceType === 'manual' ||
                row.sourceType === 'central_kitchen' ||
                (row.sourceType === 'raw' && row.rawUsageFormatId === '__manual_weight__') ||
                (row.sourceType === 'subrecipe' && row.subRecipeUsageMode !== 'standard_portion') ? (
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
                  {row.sourceType === 'subrecipe' && row.subRecipeUsageMode === 'standard_portion' ? (
                    <>
                      <span className="font-semibold tabular-nums text-zinc-900">{row.qty.trim() || '1'}</span>{' '}
                      <span className="text-zinc-700">ración estándar</span>
                    </>
                  ) : (
                    qtyLabel
                  )}
                  <span className="mx-1.5 text-zinc-300">·</span>
                  <span className="tabular-nums text-zinc-700">
                    {row.sourceType === 'subrecipe' && subrecipeConfig?.yieldCostPerUnit != null && subrecipeConfig?.yieldUnit
                      ? formatUnitPriceEur(subrecipeConfig.yieldCostPerUnit, subrecipeConfig.yieldUnit)
                      : unitPriceStr}
                  </span>
                </p>
                {row.sourceType === 'subrecipe' ? (
                  <p className="text-[10px] leading-snug text-zinc-500">
                    {row.subRecipeUsageMode === 'standard_portion'
                      ? `${formatOperationalSummary(subrecipeConfig?.quantity, subrecipeConfig?.unit)} · ${
                          subrecipeConfig?.yieldCostPerUnit != null && subrecipeConfig?.yieldUnit
                            ? formatUnitPriceEur(subrecipeConfig.yieldCostPerUnit, subrecipeConfig.yieldUnit)
                            : 'Pendiente de configurar'
                        }`
                      : `Personalizado · ${row.qty.trim() || '—'} ${dispUnit} · ${
                          subrecipeConfig?.yieldCostPerUnit != null && subrecipeConfig?.yieldUnit
                            ? formatUnitPriceEur(subrecipeConfig.yieldCostPerUnit, subrecipeConfig.yieldUnit)
                            : unitPriceStr
                        }`}
                  </p>
                ) : null}
                {rawWeightDetail ? (
                  <p className="text-[10px] leading-snug text-zinc-500">
                    {rawProduct?.name} · {rawWeightDetail}
                  </p>
                ) : null}
                {centralItem && !centralItem.active ? (
                  <p className="text-[10px] leading-snug text-[#B8872A]">Producto desactivado en Cocina Central</p>
                ) : null}
                {centralUnitWarning ? (
                  <p className="text-[10px] leading-snug text-[#B8872A]">{centralUnitWarning}</p>
                ) : null}
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
