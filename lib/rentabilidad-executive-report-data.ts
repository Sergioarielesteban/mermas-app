import { rawSupplierLineUnitPriceEur, type EscandalloLine, type EscandalloRawProduct } from '@/lib/escandallos-supabase';

export const CHEF_ONE_TARGET_FOOD_COST_PCT = 30;
export const CHEF_ONE_WARNING_FOOD_COST_PCT = 35;

export type ExecutiveReportPeriod = {
  label: string;
  yearMonth?: string;
};

export type FoodCostBucketKey = 'lt25' | '25_30' | '30_35' | 'gt35';

export type ExecutiveKpis = {
  activeRecipes: number;
  avgFoodCostPct: number | null;
  avgMarginPct: number | null;
  avgPvpGrossEur: number | null;
  recipesWithFoodCost: number;
};

export type FoodCostDistributionRow = {
  bucket: FoodCostBucketKey;
  label: string;
  count: number;
  pct: number;
};

export type FamilyProfitabilityRow = {
  family: string;
  recipes: number;
  avgFoodCostPct: number | null;
  avgMarginPct: number | null;
};

export type EvolutionPoint = {
  label: string;
  foodCostPct: number | null;
  recipesInMix: number;
};

export type ChefOneAlert = {
  label: string;
  count: number;
  impactEur: number | null;
  detail: string;
};

export type ChefOneRecommendation = {
  title: string;
  detail: string;
};

export type IngredientImpactRow = {
  ingredientId: string;
  ingredientName: string;
  pmpCurrentEur: number | null;
  priceSource: string | null;
  affectedRecipes: number;
  impact5Eur: number | null;
  impact10Eur: number | null;
  impact20Eur: number | null;
};

export type ExecutiveReportRecipeRow = {
  recipeId: string;
  name: string;
  family: string;
  costEur: number;
  pvpGrossEur: number | null;
  foodCostPct: number | null;
  marginPct: number | null;
};

export type ExecutiveProfitabilityReportData = {
  localName: string;
  generatedAt: Date;
  period: ExecutiveReportPeriod;
  kpis: ExecutiveKpis;
  distribution: FoodCostDistributionRow[];
  topProfitable: ExecutiveReportRecipeRow[];
  topReview: ExecutiveReportRecipeRow[];
  families: FamilyProfitabilityRow[];
  evolution: EvolutionPoint[];
  alerts: ChefOneAlert[];
  recommendations: ChefOneRecommendation[];
  ranking: ExecutiveReportRecipeRow[];
  ingredientImpact: IngredientImpactRow[];
};

export type ExecutiveReportSourceRow = {
  recipeId: string;
  name: string;
  family: string | null;
  isSubRecipe: boolean;
  yieldQty: number;
  costTotalEur: number;
  costPerYieldEur: number;
  pvpGrossEur: number | null;
  saleNetEur: number | null;
  foodCostPct: number | null;
  marginPct: number | null;
  lineCount: number;
};

export type BuildExecutiveReportInput = {
  localName?: string | null;
  period: ExecutiveReportPeriod;
  rows: ExecutiveReportSourceRow[];
  linesByRecipe: Record<string, EscandalloLine[]>;
  rawById: Map<string, EscandalloRawProduct>;
  quantityByRecipeId?: Record<string, number>;
  evolutionQuantityByMonth?: Array<{
    label: string;
    quantityByRecipeId: Record<string, number>;
  }>;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function avg(values: Array<number | null | undefined>): number | null {
  const real = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!real.length) return null;
  return round1(real.reduce((a, b) => a + b, 0) / real.length);
}

function recipeFamily(row: ExecutiveReportSourceRow): string {
  return row.family?.trim() || 'Sin familia';
}

function toRecipeRow(row: ExecutiveReportSourceRow): ExecutiveReportRecipeRow {
  return {
    recipeId: row.recipeId,
    name: row.name,
    family: recipeFamily(row),
    costEur: row.costPerYieldEur,
    pvpGrossEur: row.pvpGrossEur,
    foodCostPct: row.foodCostPct,
    marginPct: row.marginPct,
  };
}

function bucketForFoodCost(fc: number): FoodCostBucketKey {
  if (fc < 25) return 'lt25';
  if (fc < 30) return '25_30';
  if (fc <= 35) return '30_35';
  return 'gt35';
}

function buildDistribution(rows: ExecutiveReportSourceRow[]): FoodCostDistributionRow[] {
  const withFc = rows.filter((r) => r.foodCostPct != null);
  const total = withFc.length || 1;
  const labels: Record<FoodCostBucketKey, string> = {
    lt25: '<25%',
    '25_30': '25%-30%',
    '30_35': '30%-35%',
    gt35: '>35%',
  };
  const counts: Record<FoodCostBucketKey, number> = {
    lt25: 0,
    '25_30': 0,
    '30_35': 0,
    gt35: 0,
  };
  for (const row of withFc) counts[bucketForFoodCost(row.foodCostPct ?? 0)] += 1;
  return (Object.keys(labels) as FoodCostBucketKey[]).map((bucket) => ({
    bucket,
    label: labels[bucket],
    count: counts[bucket],
    pct: withFc.length ? round1((counts[bucket] / total) * 100) : 0,
  }));
}

function buildFamilyRows(rows: ExecutiveReportSourceRow[]): FamilyProfitabilityRow[] {
  const byFamily = new Map<string, ExecutiveReportSourceRow[]>();
  for (const row of rows) {
    const family = recipeFamily(row);
    const list = byFamily.get(family) ?? [];
    list.push(row);
    byFamily.set(family, list);
  }
  return [...byFamily.entries()]
    .map(([family, list]) => ({
      family,
      recipes: list.length,
      avgFoodCostPct: avg(list.map((r) => r.foodCostPct)),
      avgMarginPct: avg(list.map((r) => r.marginPct)),
    }))
    .sort((a, b) => (b.avgFoodCostPct ?? -1) - (a.avgFoodCostPct ?? -1));
}

function quantityFor(row: ExecutiveReportSourceRow, quantityByRecipeId: Record<string, number>): number {
  const q = quantityByRecipeId[row.recipeId] ?? 0;
  return Number.isFinite(q) && q > 0 ? q : 0;
}

function estimatedRecoverableImpact(
  rows: ExecutiveReportSourceRow[],
  quantityByRecipeId: Record<string, number>,
): number | null {
  let total = 0;
  let hasQty = false;
  for (const row of rows) {
    const q = quantityFor(row, quantityByRecipeId);
    if (q <= 0 || row.saleNetEur == null || row.saleNetEur <= 0) continue;
    const targetCost = row.saleNetEur * (CHEF_ONE_TARGET_FOOD_COST_PCT / 100);
    const recoverPerUnit = Math.max(0, row.costPerYieldEur - targetCost);
    if (recoverPerUnit <= 0) continue;
    hasQty = true;
    total += recoverPerUnit * q;
  }
  return hasQty ? round2(total) : null;
}

function buildEvolution(
  rows: ExecutiveReportSourceRow[],
  evolutionQuantityByMonth: BuildExecutiveReportInput['evolutionQuantityByMonth'],
): EvolutionPoint[] {
  if (!evolutionQuantityByMonth?.length) return [];
  return evolutionQuantityByMonth.map((point) => {
    let cost = 0;
    let net = 0;
    let count = 0;
    for (const row of rows) {
      const q = quantityFor(row, point.quantityByRecipeId);
      if (q <= 0 || row.saleNetEur == null || row.saleNetEur <= 0) continue;
      cost += row.costPerYieldEur * q;
      net += row.saleNetEur * q;
      count += 1;
    }
    return {
      label: point.label,
      foodCostPct: net > 0 ? round1((cost / net) * 100) : null,
      recipesInMix: count,
    };
  });
}

function buildIngredientImpact(input: BuildExecutiveReportInput, mainRows: ExecutiveReportSourceRow[]): IngredientImpactRow[] {
  const byRecipe = new Map(mainRows.map((row) => [row.recipeId, row]));
  const acc = new Map<
    string,
    {
      name: string;
      pmpCurrentEur: number | null;
      priceSource: string | null;
      affectedRecipeIds: Set<string>;
      baseImpactEur: number;
      hasQuantity: boolean;
    }
  >();

  for (const [recipeId, lines] of Object.entries(input.linesByRecipe)) {
    const recipeRow = byRecipe.get(recipeId);
    if (!recipeRow) continue;
    const qtySold = quantityFor(recipeRow, input.quantityByRecipeId ?? {});
    for (const line of lines) {
      if (line.sourceType !== 'raw' || !line.rawSupplierProductId) continue;
      const raw = input.rawById.get(line.rawSupplierProductId);
      if (!raw) continue;
      const current = acc.get(raw.id) ?? {
        name: raw.name,
        pmpCurrentEur: raw.pricePerUnit > 0 ? raw.pricePerUnit : null,
        priceSource: raw.operationalPriceSource ?? null,
        affectedRecipeIds: new Set<string>(),
        baseImpactEur: 0,
        hasQuantity: false,
      };
      current.affectedRecipeIds.add(recipeId);
      if (qtySold > 0 && recipeRow.yieldQty > 0) {
        const lineTotal = line.qty * rawSupplierLineUnitPriceEur(line, raw);
        const unitContribution = lineTotal / recipeRow.yieldQty;
        current.baseImpactEur += unitContribution * qtySold;
        current.hasQuantity = true;
      }
      acc.set(raw.id, current);
    }
  }

  return [...acc.entries()]
    .map(([ingredientId, value]) => ({
      ingredientId,
      ingredientName: value.name,
      pmpCurrentEur: value.pmpCurrentEur,
      priceSource: value.priceSource,
      affectedRecipes: value.affectedRecipeIds.size,
      impact5Eur: value.hasQuantity ? round2(value.baseImpactEur * 0.05) : null,
      impact10Eur: value.hasQuantity ? round2(value.baseImpactEur * 0.1) : null,
      impact20Eur: value.hasQuantity ? round2(value.baseImpactEur * 0.2) : null,
    }))
    .sort((a, b) => (b.impact20Eur ?? b.affectedRecipes) - (a.impact20Eur ?? a.affectedRecipes))
    .slice(0, 24);
}

function buildAlerts(
  rows: ExecutiveReportSourceRow[],
  input: BuildExecutiveReportInput,
  ingredientImpact: IngredientImpactRow[],
): ChefOneAlert[] {
  const q = input.quantityByRecipeId ?? {};
  const highFc = rows.filter((r) => (r.foodCostPct ?? 0) > CHEF_ONE_WARNING_FOOD_COST_PCT);
  const noCost = rows.filter((r) => r.lineCount === 0 || r.costPerYieldEur <= 0);
  const lowMargin = rows.filter((r) => r.marginPct != null && r.marginPct < 100 - CHEF_ONE_TARGET_FOOD_COST_PCT);
  const noPmpIngredients = ingredientImpact.filter((r) => r.priceSource !== 'pmp');
  const recover = estimatedRecoverableImpact(highFc, q);

  return [
    {
      label: 'Recetas FC >35%',
      count: highFc.length,
      impactEur: recover,
      detail: 'Platos con food cost por encima del rango saludable de Chef One.',
    },
    {
      label: 'Recetas sin coste',
      count: noCost.length,
      impactEur: null,
      detail: 'Recetas sin ingredientes o sin coste calculable.',
    },
    {
      label: 'Recetas margen bajo',
      count: lowMargin.length,
      impactEur: estimatedRecoverableImpact(lowMargin, q),
      detail: 'Margen por debajo del objetivo equivalente a FC 30%.',
    },
    {
      label: 'Ingredientes sin PMP',
      count: noPmpIngredients.length,
      impactEur: null,
      detail: 'Ingredientes con último precio, artículo master o sin histórico ponderado.',
    },
  ];
}

function buildRecommendations(
  rows: ExecutiveReportSourceRow[],
  families: FamilyProfitabilityRow[],
  quantityByRecipeId: Record<string, number>,
): ChefOneRecommendation[] {
  const recommendations: ChefOneRecommendation[] = [];
  const worstFamily = families.find((f) => f.avgFoodCostPct != null);
  if (worstFamily?.avgFoodCostPct != null) {
    recommendations.push({
      title: `Revisar familia ${worstFamily.family}`,
      detail: `Tiene un Food Cost medio del ${worstFamily.avgFoodCostPct.toFixed(1)}%, con ${worstFamily.recipes} recetas analizadas.`,
    });
  }

  const critical = rows
    .filter((r) => r.foodCostPct != null)
    .sort((a, b) => (b.foodCostPct ?? 0) - (a.foodCostPct ?? 0))
    .slice(0, 3);
  if (critical.length) {
    recommendations.push({
      title: 'Prioridad de carta',
      detail: `${critical.map((r) => r.name).join(', ')} concentran los Food Cost más altos del informe.`,
    });
  }

  const recover = estimatedRecoverableImpact(critical, quantityByRecipeId);
  if (recover != null && recover > 0) {
    recommendations.push({
      title: 'Recuperación estimada',
      detail: `Llevando las 3 recetas más críticas al objetivo FC 30% se recuperarían aproximadamente ${round2(recover * 12).toLocaleString('es-ES')} €/año, según ventas del periodo.`,
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      title: 'Sin alertas prioritarias',
      detail: 'No hay datos suficientes o desviaciones relevantes para generar recomendaciones ejecutivas.',
    });
  }
  return recommendations.slice(0, 4);
}

export function buildExecutiveProfitabilityReportData(
  input: BuildExecutiveReportInput,
): ExecutiveProfitabilityReportData {
  const mainRows = input.rows.filter((row) => !row.isSubRecipe);
  const withLines = mainRows.filter((row) => row.lineCount > 0);
  const withFc = withLines.filter((row) => row.foodCostPct != null);
  const ranking = [...withLines]
    .map(toRecipeRow)
    .sort((a, b) => {
      if (a.foodCostPct == null && b.foodCostPct == null) return a.name.localeCompare(b.name, 'es');
      if (a.foodCostPct == null) return 1;
      if (b.foodCostPct == null) return -1;
      return b.foodCostPct - a.foodCostPct;
    });
  const families = buildFamilyRows(withLines);
  const ingredientImpact = buildIngredientImpact(input, withLines);

  return {
    localName: input.localName?.trim() || 'Chef One',
    generatedAt: new Date(),
    period: input.period,
    kpis: {
      activeRecipes: mainRows.length,
      avgFoodCostPct: avg(withFc.map((row) => row.foodCostPct)),
      avgMarginPct: avg(withFc.map((row) => row.marginPct)),
      avgPvpGrossEur: avg(withFc.map((row) => row.pvpGrossEur)),
      recipesWithFoodCost: withFc.length,
    },
    distribution: buildDistribution(withFc),
    topProfitable: [...withFc]
      .sort((a, b) => (b.marginPct ?? -1) - (a.marginPct ?? -1))
      .slice(0, 10)
      .map(toRecipeRow),
    topReview: [...withFc]
      .sort((a, b) => (b.foodCostPct ?? -1) - (a.foodCostPct ?? -1))
      .slice(0, 10)
      .map(toRecipeRow),
    families,
    evolution: buildEvolution(withLines, input.evolutionQuantityByMonth),
    alerts: buildAlerts(withLines, input, ingredientImpact),
    recommendations: buildRecommendations(withLines, families, input.quantityByRecipeId ?? {}),
    ranking,
    ingredientImpact,
  };
}

export function recentYearMonths(count = 12, base = new Date()): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
