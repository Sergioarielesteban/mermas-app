import type { FixedExpense, FixedExpenseCategory } from '@/lib/finanzas-economics-types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const FIXED_EXPENSE_CATEGORY_LABEL: Record<FixedExpenseCategory, string> = {
  rent: 'Alquiler',
  utilities: 'Suministros',
  insurance: 'Seguros',
  software: 'Software',
  banking_fees: 'Banca / comisiones',
  equipment_lease: 'Arrendamiento equipos',
  marketing: 'Marketing',
  other: 'Otros',
};

export type FixedExpenseCategorySlice = {
  category: FixedExpenseCategory;
  label: string;
  amountEur: number;
  pctOfTotal: number;
};

/** Agregación ligera para gráfico (sin nuevas consultas; a partir del listado acotado del periodo). */
export function aggregateFixedExpensesByCategoryForChart(rows: FixedExpense[]): FixedExpenseCategorySlice[] {
  const m = new Map<FixedExpenseCategory, number>();
  for (const r of rows) {
    m.set(r.category, round2((m.get(r.category) ?? 0) + r.amountEur));
  }
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()]
    .map(([category, amountEur]) => ({
      category,
      label: FIXED_EXPENSE_CATEGORY_LABEL[category] ?? category,
      amountEur,
      pctOfTotal: total > 0 ? round2((amountEur / total) * 100) : 0,
    }))
    .filter((x) => x.amountEur > 0)
    .sort((a, b) => b.amountEur - a.amountEur);
}
