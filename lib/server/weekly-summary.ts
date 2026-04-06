import type { MermaRecord, Product } from '@/lib/types';

function toMadridParts(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    yyyyMmDd: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour') || '0'),
    minute: Number(get('minute') || '0'),
    weekday: get('weekday').toLowerCase(),
  };
}

export function shouldSendNowMadrid(now = new Date()) {
  const p = toMadridParts(now);
  const isMonday = p.weekday.includes('mon') || p.weekday.includes('lun');
  return isMonday && p.hour === 8 && p.minute < 10;
}

function getPreviousWeekRangeMadrid(now = new Date()) {
  const p = toMadridParts(now);
  const [year, month, day] = p.yyyyMmDd.split('-').map(Number);
  const local = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  const jsDay = local.getUTCDay(); // 0 sunday..6 saturday
  const mondayOffset = (jsDay + 6) % 7;
  const mondayThisWeek = new Date(local);
  mondayThisWeek.setUTCDate(local.getUTCDate() - mondayOffset);
  const mondayPrevWeek = new Date(mondayThisWeek);
  mondayPrevWeek.setUTCDate(mondayThisWeek.getUTCDate() - 7);
  const sundayPrevWeek = new Date(mondayThisWeek);
  sundayPrevWeek.setUTCDate(mondayThisWeek.getUTCDate() - 1);

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(mondayPrevWeek), to: iso(sundayPrevWeek) };
}

export function buildWeeklyWhatsappMessage(input: {
  mermas: MermaRecord[];
  products: Product[];
  now?: Date;
}) {
  const { from, to } = getPreviousWeekRangeMadrid(input.now);
  const within = input.mermas.filter((m) => {
    const day = m.occurredAt.slice(0, 10);
    return day >= from && day <= to;
  });

  const total = within.reduce((acc, item) => acc + item.costEur, 0);
  const count = within.length;

  const valueByProduct = new Map<string, number>();
  for (const m of within) {
    valueByProduct.set(m.productId, (valueByProduct.get(m.productId) ?? 0) + m.costEur);
  }

  const top = Array.from(valueByProduct.entries())
    .map(([productId, value]) => ({
      name: input.products.find((p) => p.id === productId)?.name ?? 'Producto',
      value: Math.round(value * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const topLines =
    top.length > 0
      ? top.map((item, idx) => `${idx + 1}. ${item.name}: ${item.value.toFixed(2)} €`).join('\n')
      : 'Sin productos destacados esta semana.';

  const text =
    `*Resumen semanal de mermas*\n` +
    `Periodo: ${from} a ${to}\n` +
    `Registros: ${count}\n` +
    `Valor total: ${total.toFixed(2)} €\n\n` +
    `Top impacto:\n${topLines}`;

  return { text, from, to, count, total };
}
