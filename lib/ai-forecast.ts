import type { MermaRecord, Product } from '@/lib/types';

export type AiForecastItem = {
  productId: string;
  productName: string;
  unit: Product['unit'];
  riskScore: number; // 0-100
  estimatedWasteTomorrow: number;
  suggestedPrepQty: number;
  reason: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function mondayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function safeDiv(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return a / b;
}

export function buildAiForecast(products: Product[], mermas: MermaRecord[], limit = 5): AiForecastItem[] {
  const now = new Date();
  const dayIdxTomorrow = (mondayIndex(now) + 1) % 7;
  const msDay = 24 * 60 * 60 * 1000;
  const lookbackDays = 28;
  const lookbackStart = new Date(now.getTime() - lookbackDays * msDay);
  const maxObserved = Math.max(1, ...mermas.map((m) => m.quantity));

  const rows = products.map((product) => {
    const productMermas = mermas
      .filter((m) => m.productId === product.id)
      .filter((m) => new Date(m.occurredAt) >= lookbackStart);

    const totalQty = productMermas.reduce((acc, item) => acc + item.quantity, 0);
    const avgDaily = safeDiv(totalQty, lookbackDays);

    const weekdayQty = productMermas
      .filter((m) => mondayIndex(new Date(m.occurredAt)) === dayIdxTomorrow)
      .reduce((acc, item) => acc + item.quantity, 0);
    const weekdaySamples = Math.max(
      1,
      Math.floor(lookbackDays / 7),
    );
    const avgTomorrowWeekday = safeDiv(weekdayQty, weekdaySamples);

    const recent7Start = new Date(now.getTime() - 7 * msDay);
    const prev7Start = new Date(now.getTime() - 14 * msDay);
    const recent7 = productMermas
      .filter((m) => new Date(m.occurredAt) >= recent7Start)
      .reduce((acc, item) => acc + item.quantity, 0);
    const prev7 = productMermas
      .filter((m) => {
        const d = new Date(m.occurredAt);
        return d >= prev7Start && d < recent7Start;
      })
      .reduce((acc, item) => acc + item.quantity, 0);

    const trend = safeDiv(recent7 - prev7, Math.max(1, prev7));
    const weekdayFactor = avgDaily > 0 ? safeDiv(avgTomorrowWeekday, Math.max(0.001, avgDaily)) : 0;

    const estimatedWasteTomorrow = round2(
      Math.max(0, avgDaily * (0.75 + weekdayFactor * 0.35) * (1 + clamp(trend, -0.5, 0.9))),
    );

    const normalizedWaste = safeDiv(estimatedWasteTomorrow, maxObserved);
    const riskScore = Math.round(
      clamp(18 + normalizedWaste * 60 + weekdayFactor * 12 + clamp(trend, -0.3, 0.8) * 20, 0, 100),
    );

    // Sin ventas reales: sugerencia conservadora basada en histórico de merma.
    const suggestedPrepQty = Math.max(
      1,
      Math.round((avgDaily + avgTomorrowWeekday) * 1.4 + (riskScore > 70 ? 0 : 1)),
    );

    let reason = 'Riesgo estable según histórico reciente.';
    if (riskScore >= 75) reason = 'Riesgo alto: coincide patrón de día y tendencia al alza.';
    else if (riskScore >= 55) reason = 'Riesgo medio: conviene ajustar producción de forma preventiva.';
    else if (riskScore <= 30) reason = 'Riesgo bajo: comportamiento de merma contenido.';

    return {
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      riskScore,
      estimatedWasteTomorrow,
      suggestedPrepQty,
      reason,
    } satisfies AiForecastItem;
  });

  return rows.sort((a, b) => b.riskScore - a.riskScore).slice(0, limit);
}

