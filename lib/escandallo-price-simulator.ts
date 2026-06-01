/**
 * Simulador de precio para escandallos.
 * Lógica pura — sin React, sin Supabase.
 * Reutiliza foodCostPercentOfNetSale y saleNetPerUnitFromGross del motor.
 */

import { roundMoney } from '@/lib/money-format';
import {
  foodCostPercentOfNetSale,
  saleNetPerUnitFromGross,
} from '@/lib/escandallos-supabase';

// ─── Constantes Chef One ──────────────────────────────────────────────────────

/** FC objetivo canónico Chef One (modo Equilibrado). */
export const CHEF_ONE_FOOD_COST_TARGET_PCT = 30;

// ─── Modos ────────────────────────────────────────────────────────────────────

export type PriceSimulatorMode =
  | 'pvp_manual'
  | 'food_cost_target'
  | 'margin_target'
  | 'positioning';

export type PositioningPreset = 'economico' | 'equilibrado' | 'premium';

export const POSITIONING_FC_TARGETS: Readonly<Record<PositioningPreset, number>> = {
  economico: 35,
  equilibrado: 30,
  premium: 25,
} as const;

export const POSITIONING_LABELS: Readonly<Record<PositioningPreset, string>> = {
  economico: 'Económico',
  equilibrado: 'Equilibrado',
  premium: 'Premium',
} as const;

export const POSITIONING_SUBTITLES: Readonly<Record<PositioningPreset, string>> = {
  economico: 'FC ≤ 35 %',
  equilibrado: 'FC ≤ 30 %',
  premium: 'FC ≤ 25 %',
} as const;

// ─── Warnings ─────────────────────────────────────────────────────────────────

export type PriceSimulatorWarningCode =
  | 'no_cost'
  | 'no_yield'
  | 'invalid_pvp'
  | 'invalid_fc_target'
  | 'invalid_margin_target'
  | 'fc_out_of_range'
  | 'margin_out_of_range'
  | 'price_below_cost';

export type PriceSimulatorWarning = {
  code: PriceSimulatorWarningCode;
  message: string;
};

// ─── Input / Output ───────────────────────────────────────────────────────────

export type PriceSimulatorInput = {
  totalCostEur: number;
  yieldQty: number;
  vatRatePct: number;
  mode: PriceSimulatorMode;
  pvpGrossEur?: number | null;
  foodCostTargetPct?: number | null;
  marginTargetPct?: number | null;
  positioningPreset?: PositioningPreset | null;
};

export type PriceSimulatorSnapshot = {
  valid: boolean;
  warnings: PriceSimulatorWarning[];
  costPerYieldEur: number;
  vatRatePct: number;
  pvpGrossEur: number | null;
  saleNetPerUnitEur: number | null;
  foodCostPct: number | null;
  marginPct: number | null;
  effectiveFoodCostTargetPct: number | null;
  positioningPreset: PositioningPreset | null;
};

export type PriceSimulatorComparison = {
  actual: PriceSimulatorSnapshot;
  simulated: PriceSimulatorSnapshot;
  deltaPvpGrossEur: number | null;
  deltaFoodCostPp: number | null;
  deltaMarginPp: number | null;
};

// ─── Familia ──────────────────────────────────────────────────────────────────

export type FamilyBenchmarkRow = {
  recipeId: string;
  foodCostPct: number | null;
  marginPct: number | null;
  saleGrossEur: number | null;
};

export type FamilyPriceBenchmark = {
  familyName: string;
  sampleCount: number;
  fcSampleCount: number;
  avgFoodCostPct: number | null;
  avgMarginPct: number | null;
  avgPvpGrossEur: number | null;
  sufficient: boolean;
};

export type FamilyComparison = {
  benchmark: FamilyPriceBenchmark;
  deltaFoodCostPp: number | null;
  deltaMarginPp: number | null;
  deltaPvpEur: number | null;
  foodCostMessage: string | null;
  marginMessage: string | null;
};

// ─── Objetivo Chef One ────────────────────────────────────────────────────────

export type ChefOneTargetComparison = {
  targetFoodCostPct: number;
  actualFoodCostPct: number | null;
  deltaFoodCostPp: number | null;
  message: string | null;
  tone: 'above' | 'below' | 'aligned' | null;
};

// ─── Helpers de validación ────────────────────────────────────────────────────

export function isValidFoodCostTargetPct(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 100;
}

export function isValidMarginTargetPct(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 100;
}

export function isValidPvpGross(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

// ─── Función privada: coste/ración ───────────────────────────────────────────

function safeCostPerYield(totalCostEur: number, yieldQty: number): number {
  const y = yieldQty > 0 ? yieldQty : 1;
  return totalCostEur / y;
}

// ─── resolveEffectiveFoodCostTargetPct ───────────────────────────────────────

export function resolveEffectiveFoodCostTargetPct(
  input: Pick<
    PriceSimulatorInput,
    'mode' | 'foodCostTargetPct' | 'marginTargetPct' | 'positioningPreset'
  >,
): number | null {
  if (input.mode === 'food_cost_target') {
    return input.foodCostTargetPct ?? null;
  }
  if (input.mode === 'margin_target') {
    const m = input.marginTargetPct;
    if (m == null || !isValidMarginTargetPct(m)) return null;
    return 100 - m;
  }
  if (input.mode === 'positioning') {
    const preset = input.positioningPreset;
    if (!preset) return null;
    return POSITIONING_FC_TARGETS[preset];
  }
  return null;
}

// ─── recommendPvpGrossFromFoodCost ────────────────────────────────────────────

export function recommendPvpGrossFromFoodCost(params: {
  costPerYieldEur: number;
  foodCostTargetPct: number;
  vatRatePct: number;
}): { pvpGrossEur: number; saleNetPerUnitEur: number } | null {
  const { costPerYieldEur, foodCostTargetPct, vatRatePct } = params;
  if (!isValidFoodCostTargetPct(foodCostTargetPct)) return null;
  if (!Number.isFinite(costPerYieldEur) || costPerYieldEur < 0) return null;
  const saleNetPerUnitEur = costPerYieldEur / (foodCostTargetPct / 100);
  const pvpGrossEur = roundMoney(saleNetPerUnitEur * (1 + Math.max(0, vatRatePct) / 100));
  return { pvpGrossEur, saleNetPerUnitEur: Math.round(saleNetPerUnitEur * 10000) / 10000 };
}

// ─── buildActualPriceSnapshot ─────────────────────────────────────────────────

export function buildActualPriceSnapshot(params: {
  totalCostEur: number;
  yieldQty: number;
  vatRatePct: number;
  pvpGrossEur: number | null;
}): PriceSimulatorSnapshot {
  const { totalCostEur, yieldQty, vatRatePct, pvpGrossEur } = params;
  const warnings: PriceSimulatorWarning[] = [];
  const costPerYieldEur = safeCostPerYield(totalCostEur, yieldQty);

  if (!Number.isFinite(totalCostEur) || totalCostEur <= 0) {
    warnings.push({ code: 'no_cost', message: 'Añade ingredientes para simular.' });
  }
  if (yieldQty <= 0) {
    warnings.push({ code: 'no_yield', message: 'Indica el número de raciones.' });
  }

  let saleNetPerUnitEur: number | null = null;
  let foodCostPct: number | null = null;
  let marginPct: number | null = null;

  if (pvpGrossEur != null && pvpGrossEur > 0) {
    saleNetPerUnitEur = saleNetPerUnitFromGross(pvpGrossEur, vatRatePct);
    foodCostPct = foodCostPercentOfNetSale(totalCostEur, yieldQty > 0 ? yieldQty : 1, saleNetPerUnitEur);
    marginPct = foodCostPct != null ? Math.round((100 - foodCostPct) * 10) / 10 : null;
    if (saleNetPerUnitEur < costPerYieldEur) {
      warnings.push({ code: 'price_below_cost', message: 'El PVP está por debajo del coste.' });
    }
  }

  return {
    valid: warnings.filter((w) => w.code !== 'price_below_cost').length === 0,
    warnings,
    costPerYieldEur,
    vatRatePct,
    pvpGrossEur,
    saleNetPerUnitEur,
    foodCostPct,
    marginPct,
    effectiveFoodCostTargetPct: null,
    positioningPreset: null,
  };
}

// ─── buildSimulatedPriceSnapshot ─────────────────────────────────────────────

export function buildSimulatedPriceSnapshot(input: PriceSimulatorInput): PriceSimulatorSnapshot {
  const { totalCostEur, yieldQty, vatRatePct, mode } = input;
  const warnings: PriceSimulatorWarning[] = [];
  const costPerYieldEur = safeCostPerYield(totalCostEur, yieldQty);

  if (!Number.isFinite(totalCostEur) || totalCostEur <= 0) {
    warnings.push({ code: 'no_cost', message: 'Añade ingredientes para simular.' });
    return {
      valid: false, warnings, costPerYieldEur, vatRatePct,
      pvpGrossEur: null, saleNetPerUnitEur: null, foodCostPct: null, marginPct: null,
      effectiveFoodCostTargetPct: null, positioningPreset: null,
    };
  }

  if (mode === 'pvp_manual') {
    const pvp = input.pvpGrossEur;
    if (pvp == null || !isValidPvpGross(pvp)) {
      warnings.push({ code: 'invalid_pvp', message: 'Introduce un PVP válido mayor que 0.' });
      return {
        valid: false, warnings, costPerYieldEur, vatRatePct,
        pvpGrossEur: null, saleNetPerUnitEur: null, foodCostPct: null, marginPct: null,
        effectiveFoodCostTargetPct: null, positioningPreset: null,
      };
    }
    const saleNetPerUnitEur = saleNetPerUnitFromGross(pvp, vatRatePct);
    const foodCostPct = foodCostPercentOfNetSale(totalCostEur, yieldQty > 0 ? yieldQty : 1, saleNetPerUnitEur);
    const marginPct = foodCostPct != null ? Math.round((100 - foodCostPct) * 10) / 10 : null;
    if (saleNetPerUnitEur < costPerYieldEur) {
      warnings.push({ code: 'price_below_cost', message: 'El PVP está por debajo del coste.' });
    }
    return {
      valid: true, warnings, costPerYieldEur, vatRatePct,
      pvpGrossEur: pvp, saleNetPerUnitEur, foodCostPct, marginPct,
      effectiveFoodCostTargetPct: null, positioningPreset: null,
    };
  }

  // Modos FC objetivo / margen / posicionamiento
  const effectiveFc = resolveEffectiveFoodCostTargetPct(input);
  const preset = mode === 'positioning' ? (input.positioningPreset ?? null) : null;

  if (effectiveFc == null) {
    if (mode === 'food_cost_target') {
      warnings.push({ code: 'invalid_fc_target', message: 'Introduce un food cost objetivo válido.' });
    } else if (mode === 'margin_target') {
      warnings.push({ code: 'invalid_margin_target', message: 'Introduce un margen objetivo válido.' });
    } else {
      warnings.push({ code: 'invalid_fc_target', message: 'Selecciona un posicionamiento.' });
    }
    return {
      valid: false, warnings, costPerYieldEur, vatRatePct,
      pvpGrossEur: null, saleNetPerUnitEur: null, foodCostPct: null, marginPct: null,
      effectiveFoodCostTargetPct: null, positioningPreset: preset,
    };
  }

  if (!isValidFoodCostTargetPct(effectiveFc)) {
    warnings.push({ code: 'fc_out_of_range', message: 'El food cost objetivo debe estar entre 0,1 % y 99,9 %.' });
    return {
      valid: false, warnings, costPerYieldEur, vatRatePct,
      pvpGrossEur: null, saleNetPerUnitEur: null, foodCostPct: null, marginPct: null,
      effectiveFoodCostTargetPct: effectiveFc, positioningPreset: preset,
    };
  }

  const result = recommendPvpGrossFromFoodCost({ costPerYieldEur, foodCostTargetPct: effectiveFc, vatRatePct });
  if (!result) {
    warnings.push({ code: 'invalid_fc_target', message: 'No se pudo calcular el PVP.' });
    return {
      valid: false, warnings, costPerYieldEur, vatRatePct,
      pvpGrossEur: null, saleNetPerUnitEur: null, foodCostPct: null, marginPct: null,
      effectiveFoodCostTargetPct: effectiveFc, positioningPreset: preset,
    };
  }

  const marginPct = Math.round((100 - effectiveFc) * 10) / 10;
  return {
    valid: true,
    warnings,
    costPerYieldEur,
    vatRatePct,
    pvpGrossEur: result.pvpGrossEur,
    saleNetPerUnitEur: result.saleNetPerUnitEur,
    foodCostPct: effectiveFc,
    marginPct,
    effectiveFoodCostTargetPct: effectiveFc,
    positioningPreset: preset,
  };
}

// ─── comparePriceSnapshots ────────────────────────────────────────────────────

export function comparePriceSnapshots(
  actual: PriceSimulatorSnapshot,
  simulated: PriceSimulatorSnapshot,
): PriceSimulatorComparison {
  const deltaPvp =
    actual.pvpGrossEur != null && simulated.pvpGrossEur != null
      ? Math.round((simulated.pvpGrossEur - actual.pvpGrossEur) * 100) / 100
      : null;
  const deltaFc =
    actual.foodCostPct != null && simulated.foodCostPct != null
      ? Math.round((simulated.foodCostPct - actual.foodCostPct) * 10) / 10
      : null;
  const deltaMargin =
    actual.marginPct != null && simulated.marginPct != null
      ? Math.round((simulated.marginPct - actual.marginPct) * 10) / 10
      : null;
  return { actual, simulated, deltaPvpGrossEur: deltaPvp, deltaFoodCostPp: deltaFc, deltaMarginPp: deltaMargin };
}

// ─── buildFamilyPriceBenchmark ────────────────────────────────────────────────

export function buildFamilyPriceBenchmark(params: {
  familyName: string;
  rows: FamilyBenchmarkRow[];
  excludeRecipeId?: string;
  minSampleWithFc?: number;
}): FamilyPriceBenchmark {
  const { familyName, rows, excludeRecipeId, minSampleWithFc = 3 } = params;

  const pool = excludeRecipeId ? rows.filter((r) => r.recipeId !== excludeRecipeId) : rows;

  const withFc = pool.filter((r) => r.foodCostPct != null && Number.isFinite(r.foodCostPct));
  const withPvp = pool.filter((r) => r.saleGrossEur != null && r.saleGrossEur > 0);

  const avgFoodCostPct =
    withFc.length > 0
      ? Math.round((withFc.reduce((s, r) => s + (r.foodCostPct ?? 0), 0) / withFc.length) * 10) / 10
      : null;
  const avgMarginPct =
    withFc.length > 0
      ? Math.round(((100 - (withFc.reduce((s, r) => s + (r.foodCostPct ?? 0), 0) / withFc.length)) * 10)) / 10
      : null;
  const avgPvpGrossEur =
    withPvp.length > 0
      ? Math.round((withPvp.reduce((s, r) => s + (r.saleGrossEur ?? 0), 0) / withPvp.length) * 100) / 100
      : null;

  return {
    familyName,
    sampleCount: pool.length,
    fcSampleCount: withFc.length,
    avgFoodCostPct,
    avgMarginPct,
    avgPvpGrossEur,
    sufficient: withFc.length >= minSampleWithFc,
  };
}

// ─── compareRecipeToFamily ────────────────────────────────────────────────────

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function compareRecipeToFamily(params: {
  foodCostPct: number | null;
  marginPct: number | null;
  pvpGrossEur: number | null;
  benchmark: FamilyPriceBenchmark;
}): FamilyComparison {
  const { foodCostPct, marginPct, pvpGrossEur, benchmark } = params;

  const deltaFoodCostPp =
    foodCostPct != null && benchmark.avgFoodCostPct != null
      ? round1(foodCostPct - benchmark.avgFoodCostPct)
      : null;
  const deltaMarginPp =
    marginPct != null && benchmark.avgMarginPct != null
      ? round1(marginPct - benchmark.avgMarginPct)
      : null;
  const deltaPvpEur =
    pvpGrossEur != null && benchmark.avgPvpGrossEur != null
      ? Math.round((pvpGrossEur - benchmark.avgPvpGrossEur) * 100) / 100
      : null;

  let foodCostMessage: string | null = null;
  if (deltaFoodCostPp != null) {
    const absD = Math.abs(deltaFoodCostPp);
    const sign = deltaFoodCostPp > 0 ? '+' : '';
    if (absD < 0.05) {
      foodCostMessage = `Tu plato está alineado con el FC medio de ${benchmark.familyName}.`;
    } else if (deltaFoodCostPp > 0) {
      foodCostMessage = `Tu plato está ${sign}${absD.toFixed(1)} puntos por encima del FC medio de ${benchmark.familyName}.`;
    } else {
      foodCostMessage = `Tu plato está ${absD.toFixed(1)} puntos por debajo del FC medio de ${benchmark.familyName}.`;
    }
  }

  let marginMessage: string | null = null;
  if (deltaMarginPp != null) {
    const absD = Math.abs(deltaMarginPp);
    if (absD >= 0.05) {
      if (deltaMarginPp > 0) {
        marginMessage = `Margen +${absD.toFixed(1)} pp sobre la media de ${benchmark.familyName}.`;
      } else {
        marginMessage = `Margen ${absD.toFixed(1)} pp por debajo de la media de ${benchmark.familyName}.`;
      }
    }
  }

  return { benchmark, deltaFoodCostPp, deltaMarginPp, deltaPvpEur, foodCostMessage, marginMessage };
}

// ─── compareToChefOneTarget ───────────────────────────────────────────────────

export function compareToChefOneTarget(
  actualFoodCostPct: number | null,
  targetPct: number = CHEF_ONE_FOOD_COST_TARGET_PCT,
): ChefOneTargetComparison {
  if (actualFoodCostPct == null || !Number.isFinite(actualFoodCostPct)) {
    return {
      targetFoodCostPct: targetPct,
      actualFoodCostPct: null,
      deltaFoodCostPp: null,
      message: null,
      tone: null,
    };
  }

  const delta = round1(actualFoodCostPct - targetPct);
  const absD = Math.abs(delta);

  let message: string;
  let tone: ChefOneTargetComparison['tone'];

  if (absD < 0.05) {
    message = 'Alineado con el objetivo Chef One.';
    tone = 'aligned';
  } else if (delta > 0) {
    message = `+${delta.toFixed(1)} puntos sobre objetivo`;
    tone = 'above';
  } else {
    message = `${delta.toFixed(1)} puntos por debajo del objetivo`;
    tone = 'below';
  }

  return {
    targetFoodCostPct: targetPct,
    actualFoodCostPct,
    deltaFoodCostPp: delta,
    message,
    tone,
  };
}
