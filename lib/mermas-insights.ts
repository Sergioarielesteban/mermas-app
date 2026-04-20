import type { MermaRecord, Product } from '@/lib/types';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

export type MermaInsight = { id: string; text: string };

/**
 * Recomendaciones suaves solo con patrón claro (suficientes registros + concentración).
 */
export function computeMermaInsights(mermas: MermaRecord[], products: Product[]): MermaInsight[] {
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Producto';
  const byProduct = new Map<string, MermaRecord[]>();
  for (const m of mermas) {
    const arr = byProduct.get(m.productId) ?? [];
    arr.push(m);
    byProduct.set(m.productId, arr);
  }
  const out: MermaInsight[] = [];

  for (const [pid, rows] of byProduct) {
    if (rows.length < 8) continue;

    const dayCounts = new Array(7).fill(0);
    for (const r of rows) {
      dayCounts[new Date(r.occurredAt).getDay()]++;
    }
    const total = rows.length;
    const max = Math.max(...dayCounts);
    const maxDay = dayCounts.indexOf(max);
    if (max >= 4 && max / total >= 0.38) {
      out.push({
        id: `ins-wd-${pid}`,
        text: `Los ${WEEKDAYS[maxDay]} concentra con frecuencia la merma de ${productName(pid)} (patrón repetido en los datos).`,
      });
    }

    const withShift = rows.filter((r) => r.shift === 'manana' || r.shift === 'tarde');
    if (withShift.length >= 12) {
      const manana = withShift.filter((r) => r.shift === 'manana').length;
      const tarde = withShift.filter((r) => r.shift === 'tarde').length;
      if (tarde >= 6 && manana >= 4 && tarde >= manana * 1.45) {
        out.push({
          id: `ins-st-tarde-${pid}`,
          text: `En turno tarde suele subir la merma de ${productName(pid)} respecto a la mañana (donde hay datos de turno).`,
        });
      } else if (manana >= 6 && tarde >= 4 && manana >= tarde * 1.45) {
        out.push({
          id: `ins-st-manana-${pid}`,
          text: `En turno mañana suele subir la merma de ${productName(pid)} respecto a la tarde.`,
        });
      }
    }
  }

  return out.slice(0, 4);
}
