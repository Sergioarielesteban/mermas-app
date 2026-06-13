'use client';

/**
 * EditIngredientLineModal
 *
 * Bottom-sheet compacto para editar cantidad, unidad y modo de uso de una
 * línea de ingrediente existente.  NO elimina ni recrea la línea — llama a
 * updateEscandalloLine con los campos modificados.
 *
 * Renderiza campos diferenciados por sourceType:
 *  - raw          → qty + unit + formato de uso (si el artículo tiene formatos)
 *  - subrecipe    → modo (estándar / personalizado) + qty + unit operacional
 *  - processed    → qty + unit
 *  - central_kitchen → qty + unit
 *  - manual       → qty + unit + precio manual
 */

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { resolveEscandalloLineCost } from '@/lib/escandallos-cost-engine';
import { formatMoneyEur, formatUnitPriceEur } from '@/lib/money-format';
import { ESCANDALLO_USAGE_UNIT_PRESETS, validateEscandalloUsageUnitInput } from '@/lib/escandallo-ingredient-units';
import type { EscandalloYieldUnit } from '@/lib/escandallo-operational-usage';
import type {
  EscandalloLine,
  EscandalloProcessedProduct,
  EscandalloRawProduct,
  EscandalloRecipe,
  EscandalloRecipePriceContext,
} from '@/lib/escandallos-supabase';
import type { EscandalloCentralKitchenCatalogItem } from '@/lib/central-kitchen-public-catalog';
import type { EscandalloTechnicalSheet } from '@/lib/escandallos-technical-sheet-supabase';
import type { ArticleUsageFormat } from '@/lib/purchase-articles-supabase';
import { isModuleEnabled } from '@/lib/module-config';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EditIngredientLinePatch = {
  qty: number;
  unit: string;
  usageFormatId?: string | null;
  subRecipeUsageMode?: 'custom' | 'standard_portion' | null;
  subRecipeOperationalQuantity?: number | null;
  subRecipeOperationalUnit?: EscandalloYieldUnit | null;
  manualPricePerUnit?: number | null;
};

export type EditIngredientLineModalProps = {
  line: EscandalloLine;
  rawProductById: Map<string, EscandalloRawProduct>;
  processedById: Map<string, EscandalloProcessedProduct>;
  centralKitchenById: Map<string, EscandalloCentralKitchenCatalogItem>;
  technicalSheetsByRecipe: Map<string, EscandalloTechnicalSheet>;
  recipesById: Map<string, EscandalloRecipe>;
  linesByRecipe: Record<string, EscandalloLine[]>;
  busy: boolean;
  onSave: (patch: EditIngredientLinePatch) => Promise<void>;
  onClose: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLineLabel(label: string): { supplier?: string; name: string } {
  const sep = label.indexOf(' · ');
  if (sep > 0) return { supplier: label.slice(0, sep), name: label.slice(sep + 3) };
  return { name: label };
}

function sourceBadgeLabel(sourceType: EscandalloLine['sourceType'], centralKitchenEnabled: boolean): string {
  switch (sourceType) {
    case 'raw': return 'Crudo / Proveedor';
    case 'processed': return 'Elaboración';
    case 'subrecipe': return 'Base / Sub-receta';
    case 'central_kitchen': return centralKitchenEnabled ? 'Cocina Central' : 'Elaboración';
    case 'manual': return 'Manual';
  }
}

const YIELD_UNITS: EscandalloYieldUnit[] = ['kg', 'g', 'l', 'ml', 'ud'];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function EditIngredientLineModal({
  line,
  rawProductById,
  processedById,
  centralKitchenById,
  technicalSheetsByRecipe,
  recipesById,
  linesByRecipe,
  busy,
  onSave,
  onClose,
}: EditIngredientLineModalProps) {
  const centralKitchenEnabled = isModuleEnabled('cocina_central');
  const parsed = parseLineLabel(line.label);

  // ── Estado del formulario ─────────────────────────────────────────────────
  const [draftQty, setDraftQty] = useState(String(line.qty));
  const [draftUnit, setDraftUnit] = useState(line.unit);
  const [draftFormatId, setDraftFormatId] = useState<string>(line.usageFormatId ?? '');
  const [draftMode, setDraftMode] = useState<'standard_portion' | 'custom'>(
    line.subRecipeUsageMode === 'standard_portion' ? 'standard_portion' : 'custom',
  );
  const [draftOpQty, setDraftOpQty] = useState(
    line.subRecipeOperationalQuantity != null ? String(line.subRecipeOperationalQuantity) : '',
  );
  const [draftOpUnit, setDraftOpUnit] = useState<EscandalloYieldUnit>(
    (line.subRecipeOperationalUnit as EscandalloYieldUnit | null) ?? 'g',
  );
  const [draftManualPrice, setDraftManualPrice] = useState(
    line.manualPricePerUnit != null ? String(line.manualPricePerUnit) : '',
  );
  const unitError = useMemo(() => validateEscandalloUsageUnitInput(draftUnit), [draftUnit]);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Datos del origen ──────────────────────────────────────────────────────
  const rawProduct = line.rawSupplierProductId ? rawProductById.get(line.rawSupplierProductId) : null;
  const usageFormats: ArticleUsageFormat[] = rawProduct?.usageFormats ?? [];
  const subSheet = line.subRecipeId ? technicalSheetsByRecipe.get(line.subRecipeId) : undefined;
  const hasOperationalCost = subSheet?.operationalCost != null && Number.isFinite(subSheet.operationalCost);
  const centralItem = line.centralProductionRecipeId
    ? centralKitchenById.get(line.centralProductionRecipeId)
    : null;

  // ── Línea "live" con los valores del draft para preview de coste ──────────
  const previewLine = useMemo<EscandalloLine>(() => {
    const qty = parseFloat(draftQty.replace(',', '.'));
    return {
      ...line,
      qty: Number.isFinite(qty) && qty > 0 ? qty : line.qty,
      unit: draftUnit || line.unit,
      usageFormatId: draftFormatId || null,
      subRecipeUsageMode:
        line.sourceType === 'subrecipe' ? draftMode : line.subRecipeUsageMode,
      subRecipeOperationalQuantity:
        draftMode === 'standard_portion' && draftOpQty
          ? parseFloat(draftOpQty.replace(',', '.')) || line.subRecipeOperationalQuantity
          : line.subRecipeOperationalQuantity,
      subRecipeOperationalUnit: draftMode === 'standard_portion' ? draftOpUnit : line.subRecipeOperationalUnit,
      manualPricePerUnit:
        line.sourceType === 'manual' && draftManualPrice
          ? parseFloat(draftManualPrice.replace(',', '.')) || null
          : line.manualPricePerUnit,
    };
  }, [draftQty, draftUnit, draftFormatId, draftMode, draftOpQty, draftOpUnit, draftManualPrice, line]);

  const priceContext = useMemo<EscandalloRecipePriceContext>(() => ({
    linesByRecipe,
    recipesById,
    centralKitchenById,
    recipeId: line.recipeId,
  }), [linesByRecipe, recipesById, centralKitchenById, line.recipeId]);

  const previewCost = useMemo(() => {
    try {
      return resolveEscandalloLineCost({
        line: previewLine,
        rawProductById,
        processedById,
        context: priceContext,
      });
    } catch {
      return null;
    }
  }, [previewLine, rawProductById, processedById, priceContext]);

  // ── Cerrar con Escape ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Guardar ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaveError(null);
    const qty = parseFloat(draftQty.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      setSaveError('La cantidad debe ser un número mayor que 0.');
      return;
    }
    const unitErr = validateEscandalloUsageUnitInput(draftUnit);
    if (unitErr) { setSaveError(unitErr); return; }

    const patch: EditIngredientLinePatch = { qty, unit: draftUnit };

    if (line.sourceType === 'raw') {
      patch.usageFormatId = draftFormatId || null;
    }

    if (line.sourceType === 'subrecipe') {
      patch.subRecipeUsageMode = draftMode;
      if (draftMode === 'standard_portion') {
        const opQty = parseFloat(draftOpQty.replace(',', '.'));
        patch.subRecipeOperationalQuantity = Number.isFinite(opQty) && opQty > 0 ? opQty : null;
        patch.subRecipeOperationalUnit = draftOpUnit;
      } else {
        patch.subRecipeOperationalQuantity = null;
        patch.subRecipeOperationalUnit = null;
      }
    }

    if (line.sourceType === 'manual') {
      const mp = parseFloat(draftManualPrice.replace(',', '.'));
      patch.manualPricePerUnit = Number.isFinite(mp) && mp >= 0 ? mp : null;
    }

    try {
      await onSave(patch);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error al guardar.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-[2rem] bg-[#f5f5f7] shadow-[0_-8px_40px_rgba(0,0,0,0.14)] sm:max-w-md sm:rounded-[2rem] sm:shadow-[0_24px_60px_rgba(0,0,0,0.18)]">

        {/* Cabecera */}
        <div className="flex items-center gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#7E7468]">
              Editar ingrediente · {sourceBadgeLabel(line.sourceType, centralKitchenEnabled)}
            </p>
            <p className="mt-0.5 truncate text-[16px] font-black leading-tight text-[#0A0908]">
              {parsed.name}
            </p>
            {parsed.supplier ? (
              <p className="truncate text-[11px] text-[#7E7468]">{parsed.supplier}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[#7E7468] shadow-sm ring-1 ring-[rgba(10,9,8,0.08)] transition hover:bg-zinc-100"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          <div className="space-y-4">

            {/* ── Cantidad y unidad ── */}
            <fieldset className="rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-[rgba(10,9,8,0.06)]">
              <legend className="mb-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#7E7468]">
                {line.sourceType === 'subrecipe' && draftMode === 'standard_portion'
                  ? 'Número de raciones'
                  : 'Cantidad y unidad'}
              </legend>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold text-[#7E7468]">Cantidad</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draftQty}
                    onChange={(e) => setDraftQty(e.target.value)}
                    placeholder="ej. 250"
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-[#FAFAF9] px-3 text-[14px] font-bold tabular-nums text-[#0A0908] outline-none focus:border-[#4A6B3A] focus:ring-2 focus:ring-[#4A6B3A]/20"
                  />
                </div>

                {/* Unidad — solo editable para raw, processed, central_kitchen, manual */}
                {line.sourceType !== 'subrecipe' || draftMode === 'custom' ? (
                  <div className="w-28">
                    <label className="mb-1 block text-[10px] font-semibold text-[#7E7468]">Unidad</label>
                    {line.sourceType === 'subrecipe' || ESCANDALLO_USAGE_UNIT_PRESETS.includes(draftUnit as typeof ESCANDALLO_USAGE_UNIT_PRESETS[number]) ? (
                      <select
                        value={draftUnit}
                        onChange={(e) => setDraftUnit(e.target.value)}
                        className="h-11 w-full rounded-xl border border-zinc-200 bg-[#FAFAF9] px-2 text-[13px] font-semibold text-[#0A0908] outline-none focus:border-[#4A6B3A] focus:ring-2 focus:ring-[#4A6B3A]/20"
                      >
                        {ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                        {!ESCANDALLO_USAGE_UNIT_PRESETS.includes(draftUnit as typeof ESCANDALLO_USAGE_UNIT_PRESETS[number]) && (
                          <option value={draftUnit}>{draftUnit}</option>
                        )}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={draftUnit}
                        onChange={(e) => setDraftUnit(e.target.value)}
                        placeholder="kg"
                        className="h-11 w-full rounded-xl border border-zinc-200 bg-[#FAFAF9] px-3 text-[13px] font-semibold text-[#0A0908] outline-none focus:border-[#4A6B3A] focus:ring-2 focus:ring-[#4A6B3A]/20"
                      />
                    )}
                  </div>
                ) : (
                  <div className="w-28">
                    <label className="mb-1 block text-[10px] font-semibold text-[#7E7468]">Unidad</label>
                    <div className="flex h-11 items-center rounded-xl border border-zinc-100 bg-zinc-50 px-3 text-[13px] text-[#7E7468]">
                      raciones
                    </div>
                  </div>
                )}
              </div>
              {unitError ? (
                <p className="mt-1.5 text-[10px] text-[#D32F2F]">{unitError}</p>
              ) : null}
            </fieldset>

            {/* ── Formato de uso (raw con formatos) ── */}
            {line.sourceType === 'raw' && usageFormats.length > 0 ? (
              <fieldset className="rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-[rgba(10,9,8,0.06)]">
                <legend className="mb-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#7E7468]">
                  Formato de uso
                </legend>
                <select
                  value={draftFormatId}
                  onChange={(e) => setDraftFormatId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-[#FAFAF9] px-2.5 text-[12px] font-semibold text-[#0A0908] outline-none focus:border-[#4A6B3A] focus:ring-2 focus:ring-[#4A6B3A]/20"
                >
                  <option value="">— Sin formato específico —</option>
                  {usageFormats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} · {formatUnitPriceEur(f.costPerUsageUnit, f.usageUnit)}
                    </option>
                  ))}
                </select>
              </fieldset>
            ) : null}

            {/* ── Modo uso para sub-receta ── */}
            {line.sourceType === 'subrecipe' ? (
              <fieldset className="rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-[rgba(10,9,8,0.06)]">
                <legend className="mb-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#7E7468]">
                  Modo de uso
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: 'standard_portion', label: 'Ración estándar' },
                      { v: 'custom', label: 'Personalizado' },
                    ] as const
                  ).map(({ v, label }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDraftMode(v)}
                      className={`rounded-xl py-2.5 text-[11px] font-bold transition ${
                        draftMode === v
                          ? 'bg-[#4A6B3A] text-white shadow-sm'
                          : 'bg-[#FAFAF9] text-[#7E7468] ring-1 ring-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {draftMode === 'standard_portion' ? (
                  <div className="mt-3 space-y-3">
                    {!hasOperationalCost ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-snug text-amber-900">
                        Esta base no tiene coste operativo configurado. El coste se calculará como 0 hasta que se configure la ficha técnica.
                      </p>
                    ) : null}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="mb-1 block text-[10px] font-semibold text-[#7E7468]">Cantidad operacional</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draftOpQty}
                          onChange={(e) => setDraftOpQty(e.target.value)}
                          placeholder={subSheet?.operationalQuantity != null ? String(subSheet.operationalQuantity) : 'ej. 25'}
                          className="h-10 w-full rounded-xl border border-zinc-200 bg-[#FAFAF9] px-3 text-[13px] font-bold tabular-nums text-[#0A0908] outline-none focus:border-[#4A6B3A] focus:ring-2 focus:ring-[#4A6B3A]/20"
                        />
                      </div>
                      <div className="w-24">
                        <label className="mb-1 block text-[10px] font-semibold text-[#7E7468]">Unidad</label>
                        <select
                          value={draftOpUnit}
                          onChange={(e) => setDraftOpUnit(e.target.value as EscandalloYieldUnit)}
                          className="h-10 w-full rounded-xl border border-zinc-200 bg-[#FAFAF9] px-2 text-[12px] font-semibold text-[#0A0908] outline-none focus:border-[#4A6B3A] focus:ring-2 focus:ring-[#4A6B3A]/20"
                        >
                          {YIELD_UNITS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ) : null}
              </fieldset>
            ) : null}

            {/* ── Precio manual ── */}
            {line.sourceType === 'manual' ? (
              <fieldset className="rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-[rgba(10,9,8,0.06)]">
                <legend className="mb-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#7E7468]">
                  Precio manual
                </legend>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draftManualPrice}
                    onChange={(e) => setDraftManualPrice(e.target.value)}
                    placeholder="0.00"
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-[#FAFAF9] pl-3 pr-8 text-[13px] font-bold tabular-nums text-[#0A0908] outline-none focus:border-[#4A6B3A] focus:ring-2 focus:ring-[#4A6B3A]/20"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#7E7468]">€</span>
                </div>
              </fieldset>
            ) : null}

            {/* ── Preview de coste ── */}
            <div className="rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-[rgba(10,9,8,0.06)]">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#7E7468]">
                Coste calculado
              </p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-[#7E7468]">
                    {previewCost
                      ? `${formatUnitPriceEur(previewCost.unitCost, previewLine.unit)} · ${previewCost.detailLabel}`
                      : '—'}
                  </p>
                  {centralItem?.unitCost != null ? (
                    <p className="text-[10px] text-[#7E7468]">
                      {formatUnitPriceEur(centralItem.unitCost, centralItem.outputUnit)}
                    </p>
                  ) : null}
                </div>
                <p className="text-[20px] font-black tabular-nums text-[#0A0908]">
                  {previewCost ? formatMoneyEur(previewCost.totalCost) : '—'}
                </p>
              </div>
            </div>

            {saveError ? (
              <p className="rounded-xl border border-[#D32F2F]/30 bg-[#D32F2F]/5 px-3 py-2 text-[11px] text-[#D32F2F]">
                {saveError}
              </p>
            ) : null}
          </div>
        </div>

        {/* Botones fijos al fondo */}
        <div className="flex gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-2xl border border-zinc-200 bg-white py-3.5 text-[13px] font-bold text-[#0A0908] shadow-sm transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || Boolean(unitError)}
            className="flex-1 rounded-2xl bg-[#4A6B3A] py-3.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#3d5a30] disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
