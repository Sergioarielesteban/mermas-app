import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EscandalloLine,
  EscandalloProcessedProduct,
  EscandalloRawProduct,
  EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import {
  foodCostPercentOfNetSale,
  recipeTotalCostEur,
  saleNetPerUnitFromGross,
} from '@/lib/escandallos-supabase';

/** Umbrales orientativos (MVP); ajustables en UI más adelante. */
export const RENTABILIDAD_DEVIATION_COST_WARN_PCT = 8;
export const RENTABILIDAD_MARGIN_LOW_PCT = 22;
export const RENTABILIDAD_FOOD_COST_HIGH_PCT = 38;
export const RENTABILIDAD_INGREDIENT_DRIFT_PCT = 15;

export type RentabilidadRecipeAnalisis = {
  recipeId: string;
  name: string;
  posArticleCode: string | null;
  categoria: string | null;
  isSubRecipe: boolean;
  yieldQty: number;
  yieldLabel: string;
  saleGrossEur: number | null;
  saleNetEur: number | null;
  /** Coste total receta con precios de ficha (catálogo). */
  costTheoreticalTotalEur: number;
  costTheoreticalPerYieldEur: number;
  /** Coste total con PMP (compras en ventana móvil). */
  costRealTotalEur: number;
  costRealPerYieldEur: number;
  /** real − teórico por unidad de yield. */
  costDeviationEurPerYield: number;
  /** (real − teórico) / teórico × 100 */
  costDeviationPct: number | null;
  marginTheoreticalGrossEur: number | null;
  marginRealGrossEur: number | null;
  marginTheoreticalPct: number | null;
  marginRealPct: number | null;
  foodCostPctTheoretical: number | null;
  foodCostPctReal: number | null;
  lineCount: number;
};

export type RentabilidadAlert = {
  id: string;
  priority: 'P1' | 'P2' | 'P3';
  title: string;
  detail: string;
  recipeId?: string;
  impactEur?: number | null;
};

export type RentabilidadKpis = {
  /** Media simple sobre platos con PVP y líneas. */
  avgMarginRealPct: number | null;
  avgMarginTheoreticalPct: number | null;
  productsWithCostDeviation: number;
  recipesOutdatedCost: number;
  estimatedMonthlyLossFromDeviationEur: number | null;
  mainRecipesAnalyzed: number;
};

export type IngredientPriceDrift = {
  supplierProductId: string;
  label: string;
  catalogPricePerUnit: number;
  pmpPricePerUnit: number;
  driftPct: number;
};

function yieldSafe(y: number): number {
  return y > 0 ? y : 1;
}

export function buildRentabilidadRecipeRows(
  recipes: EscandalloRecipe[],
  linesByRecipe: Record<string, EscandalloLine[]>,
  rawCatalogById: Map<string, EscandalloRawProduct>,
  rawPmpById: Map<string, EscandalloRawProduct>,
  processedById: Map<string, EscandalloProcessedProduct>,
  categoriaByRecipeId: Map<string, string>,
): RentabilidadRecipeAnalisis[] {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));

  return recipes.map((recipe) => {
    const lines = linesByRecipe[recipe.id] ?? [];
    const ctx = { linesByRecipe, recipesById, recipeId: recipe.id };
    const costTheo = recipeTotalCostEur(lines, rawCatalogById, processedById, ctx);
    const costReal = recipeTotalCostEur(lines, rawPmpById, processedById, ctx);
    const y = yieldSafe(recipe.yieldQty);
    const cTy = Math.round((costTheo / y) * 100) / 100;
    const cR = Math.round((costReal / y) * 100) / 100;
    const dev = Math.round((cR - cTy) * 100) / 100;
    const devPct = cTy > 0.001 ? Math.round((dev / cTy) * 10000) / 100 : null;

    const gross = recipe.salePriceGrossEur;
    const vat = recipe.saleVatRatePct;
    const vatEff = vat != null && vat >= 0 ? vat : 10;
    const saleNet = gross != null && gross > 0 ? saleNetPerUnitFromGross(gross, vatEff) : null;

    const marginTheo = saleNet != null ? Math.round((saleNet - cTy) * 100) / 100 : null;
    const marginReal = saleNet != null ? Math.round((saleNet - cR) * 100) / 100 : null;
    const marginTheoPct =
      saleNet != null && saleNet > 0 && marginTheo != null
        ? Math.round((marginTheo / saleNet) * 10000) / 100
        : null;
    const marginRealPct =
      saleNet != null && saleNet > 0 && marginReal != null
        ? Math.round((marginReal / saleNet) * 10000) / 100
        : null;

    const fcTheo = foodCostPercentOfNetSale(costTheo, recipe.yieldQty, saleNet);
    const fcReal = foodCostPercentOfNetSale(costReal, recipe.yieldQty, saleNet);

    return {
      recipeId: recipe.id,
      name: recipe.name,
      posArticleCode: recipe.posArticleCode,
      categoria: categoriaByRecipeId.get(recipe.id) ?? null,
      isSubRecipe: recipe.isSubRecipe,
      yieldQty: recipe.yieldQty,
      yieldLabel: recipe.yieldLabel,
      saleGrossEur: gross,
      saleNetEur: saleNet,
      costTheoreticalTotalEur: costTheo,
      costTheoreticalPerYieldEur: cTy,
      costRealTotalEur: costReal,
      costRealPerYieldEur: cR,
      costDeviationEurPerYield: dev,
      costDeviationPct: devPct,
      marginTheoreticalGrossEur: marginTheo,
      marginRealGrossEur: marginReal,
      marginTheoreticalPct: marginTheoPct,
      marginRealPct: marginRealPct,
      foodCostPctTheoretical: fcTheo,
      foodCostPctReal: fcReal,
      lineCount: lines.length,
    };
  });
}

/** Comparación precio ficha vs PMP por ingrediente de proveedor usado en escandallos. */
export function collectIngredientPriceDrifts(
  linesByRecipe: Record<string, EscandalloLine[]>,
  rawCatalogById: Map<string, EscandalloRawProduct>,
  rawPmpById: Map<string, EscandalloRawProduct>,
): IngredientPriceDrift[] {
  const seen = new Set<string>();
  const out: IngredientPriceDrift[] = [];

  for (const lines of Object.values(linesByRecipe)) {
    for (const line of lines) {
      if (line.sourceType !== 'raw' || !line.rawSupplierProductId) continue;
      const id = line.rawSupplierProductId;
      if (seen.has(id)) continue;
      seen.add(id);
      const cat = rawCatalogById.get(id);
      const pmp = rawPmpById.get(id);
      if (!cat || !pmp) continue;
      const a = cat.pricePerUnit;
      const b = pmp.pricePerUnit;
      if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) continue;
      const driftPct = Math.round(((b - a) / a) * 10000) / 100;
      if (Math.abs(driftPct) < 0.05) continue;
      out.push({
        supplierProductId: id,
        label: `${cat.supplierName} · ${cat.name}`,
        catalogPricePerUnit: a,
        pmpPricePerUnit: b,
        driftPct,
      });
    }
  }
  return out.sort((x, y) => Math.abs(y.driftPct) - Math.abs(x.driftPct));
}

export function buildRentabilidadAlerts(
  rows: RentabilidadRecipeAnalisis[],
  drifts: IngredientPriceDrift[],
): RentabilidadAlert[] {
  const alerts: RentabilidadAlert[] = [];
  let aid = 0;
  const nextId = () => `rent-${++aid}`;

  for (const r of rows) {
    if (r.isSubRecipe || r.lineCount === 0) continue;

    if (r.costDeviationPct != null && r.costDeviationPct >= RENTABILIDAD_DEVIATION_COST_WARN_PCT) {
      alerts.push({
        id: nextId(),
        priority: 'P2',
        title: 'Escandallo desactualizado (coste compras vs ficha)',
        detail: `«${r.name}»: el coste con PMP sube un ${r.costDeviationPct.toFixed(1)} % frente al precio de catálogo en ingredientes (+${r.costDeviationEurPerYield.toFixed(2)} €/ud de yield).`,
        recipeId: r.recipeId,
        impactEur: r.costDeviationEurPerYield,
      });
    }

    if (r.marginRealPct != null && r.marginRealPct < RENTABILIDAD_MARGIN_LOW_PCT && r.saleNetEur != null) {
      alerts.push({
        id: nextId(),
        priority: r.marginRealPct < 12 ? 'P1' : 'P2',
        title: 'Margen por debajo del umbral',
        detail: `«${r.name}»: margen bruto operativo ~${r.marginRealPct.toFixed(1)} % sobre venta neta (objetivo orientativo ≥${RENTABILIDAD_MARGIN_LOW_PCT} %).`,
        recipeId: r.recipeId,
        impactEur: r.marginRealGrossEur,
      });
    }

    if (
      r.marginTheoreticalPct != null &&
      r.marginRealPct != null &&
      r.marginTheoreticalPct - r.marginRealPct >= 8
    ) {
      alerts.push({
        id: nextId(),
        priority: 'P2',
        title: 'Erosión de margen por costes',
        detail: `«${r.name}»: el margen con PMP es ${(r.marginTheoreticalPct - r.marginRealPct).toFixed(1)} pp inferior al calculado solo con ficha de proveedor.`,
        recipeId: r.recipeId,
      });
    }

    if (
      r.foodCostPctTheoretical != null &&
      r.foodCostPctReal != null &&
      r.foodCostPctTheoretical < 34 &&
      r.foodCostPctReal >= RENTABILIDAD_FOOD_COST_HIGH_PCT
    ) {
      alerts.push({
        id: nextId(),
        priority: 'P2',
        title: 'Subida de coste no repercutida en precio',
        detail: `«${r.name}»: con ficha el food cost sería ~${r.foodCostPctTheoretical.toFixed(1)} %; con compras reales ~${r.foodCostPctReal.toFixed(1)} %. Revisa PVP.`,
        recipeId: r.recipeId,
      });
    }

    if (r.foodCostPctReal != null && r.foodCostPctReal >= RENTABILIDAD_FOOD_COST_HIGH_PCT) {
      alerts.push({
        id: nextId(),
        priority: 'P3',
        title: 'Food cost elevado con precios reales',
        detail: `«${r.name}»: ~${r.foodCostPctReal.toFixed(1)} % sobre venta neta (referencia &lt;35 %).`,
        recipeId: r.recipeId,
      });
    }
  }

  for (const d of drifts.slice(0, 5)) {
    if (Math.abs(d.driftPct) < RENTABILIDAD_INGREDIENT_DRIFT_PCT) break;
    if (d.driftPct <= 0) continue;
    alerts.push({
      id: nextId(),
      priority: 'P3',
      title: 'Artículo con desviación fuerte (ficha vs PMP)',
      detail: `${d.label}: catálogo ${d.catalogPricePerUnit.toFixed(2)} € → PMP ${d.pmpPricePerUnit.toFixed(2)} € (+${d.driftPct.toFixed(1)} %).`,
    });
  }

  const pri = { P1: 0, P2: 1, P3: 2 };
  return alerts.sort((a, b) => pri[a.priority] - pri[b.priority]);
}

export function buildRentabilidadKpis(
  rows: RentabilidadRecipeAnalisis[],
  quantityByRecipeId: Record<string, number>,
): RentabilidadKpis {
  const mains = rows.filter((r) => !r.isSubRecipe && r.lineCount > 0);
  const withPvp = mains.filter((r) => r.saleNetEur != null && r.saleNetEur > 0 && r.marginRealPct != null);

  let sumReal = 0;
  let sumTheo = 0;
  let n = 0;
  for (const r of withPvp) {
    sumReal += r.marginRealPct ?? 0;
    sumTheo += r.marginTheoreticalPct ?? 0;
    n += 1;
  }

  let devCount = 0;
  let outdated = 0;
  for (const r of mains) {
    if (r.costDeviationPct != null && r.costDeviationPct >= 3) devCount += 1;
    if (r.costDeviationPct != null && r.costDeviationPct >= RENTABILIDAD_DEVIATION_COST_WARN_PCT) outdated += 1;
  }

  let loss: number | null = 0;
  let lossQty = 0;
  for (const r of mains) {
    const q = quantityByRecipeId[r.recipeId] ?? 0;
    if (q <= 0) continue;
    const extra = Math.max(0, r.costDeviationEurPerYield) * q;
    loss += extra;
    lossQty += q;
  }
  if (lossQty === 0) loss = null;
  else loss = Math.round(loss! * 100) / 100;

  return {
    avgMarginRealPct: n > 0 ? Math.round((sumReal / n) * 10) / 10 : null,
    avgMarginTheoreticalPct: n > 0 ? Math.round((sumTheo / n) * 10) / 10 : null,
    productsWithCostDeviation: devCount,
    recipesOutdatedCost: outdated,
    estimatedMonthlyLossFromDeviationEur: loss,
    mainRecipesAnalyzed: mains.length,
  };
}

export type FamiliaMargenRow = {
  categoria: string;
  n: number;
  avgMarginRealPct: number | null;
  avgDeviationCostPct: number | null;
};

export function buildFamiliaMargenRows(rows: RentabilidadRecipeAnalisis[]): FamiliaMargenRow[] {
  const mains = rows.filter((r) => !r.isSubRecipe && r.lineCount > 0);
  const byCat = new Map<string, RentabilidadRecipeAnalisis[]>();
  for (const r of mains) {
    const k = r.categoria?.trim() || 'Sin categoría';
    const list = byCat.get(k) ?? [];
    list.push(r);
    byCat.set(k, list);
  }
  const out: FamiliaMargenRow[] = [];
  for (const [categoria, list] of byCat) {
    const withMargin = list.filter((x) => x.marginRealPct != null);
    const avgMargin =
      withMargin.length > 0
        ? Math.round(
            (withMargin.reduce((a, x) => a + (x.marginRealPct ?? 0), 0) / withMargin.length) * 10,
          ) / 10
        : null;
    const withDev = list.filter((x) => x.costDeviationPct != null);
    const avgDev =
      withDev.length > 0
        ? Math.round(
            (withDev.reduce((a, x) => a + (x.costDeviationPct ?? 0), 0) / withDev.length) * 10,
          ) / 10
        : null;
    out.push({ categoria, n: list.length, avgMarginRealPct: avgMargin, avgDeviationCostPct: avgDev });
  }
  return out.sort((a, b) => (a.avgMarginRealPct ?? 999) - (b.avgMarginRealPct ?? 999));
}

export async function fetchEscandalloRecipeCategoriasMap(
  supabase: SupabaseClient,
  localId: string,
): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabase
      .from('escandallo_recipe_technical_sheets')
      .select('recipe_id, categoria')
      .eq('local_id', localId);
    if (error) return new Map();
    const m = new Map<string, string>();
    for (const row of (data ?? []) as { recipe_id: string; categoria: string | null }[]) {
      const id = String(row.recipe_id);
      const cat = row.categoria != null ? String(row.categoria).trim() : '';
      if (cat) m.set(id, cat);
    }
    return m;
  } catch {
    return new Map();
  }
}
