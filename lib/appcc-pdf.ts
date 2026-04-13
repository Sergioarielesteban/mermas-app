import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  APPCC_UNIT_TYPE_LABEL,
  APPCC_ZONE_LABEL,
  enumerateDateKeysInclusive,
  formatAppccDateEs,
  readingsByUnitAndSlot,
  type AppccColdUnitRow,
  type AppccReadingRow,
} from '@/lib/appcc-supabase';

function tempCell(r: AppccReadingRow | undefined) {
  if (!r) return '—';
  const n = r.notes?.trim();
  return n ? `${r.temperature_c} °C (${n})` : `${r.temperature_c} °C`;
}

function appendTemperaturasDayPage(
  doc: jsPDF,
  opts: {
    localLabel: string;
    dateKey: string;
    dateFormatted: string;
    orderedUnits: AppccColdUnitRow[];
    bySlot: Map<string, AppccReadingRow>;
    periodLine?: string;
  },
  isFirstPage: boolean,
) {
  if (!isFirstPage) doc.addPage(undefined, 'landscape');
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text('Chef-One · Temperaturas de frío (APPCC)', 40, 36);
  doc.setFontSize(9);
  doc.text(`Local: ${opts.localLabel}`, 40, 52);
  doc.text(`Día: ${opts.dateFormatted} (${opts.dateKey})`, 40, 64);
  if (opts.periodLine) {
    doc.text(opts.periodLine, 40, 76);
  }

  const startY = opts.periodLine ? 88 : 76;

  const body = opts.orderedUnits.map((u) => {
    const m = opts.bySlot.get(`${u.id}:manana`);
    const n = opts.bySlot.get(`${u.id}:noche`);
    return [
      APPCC_ZONE_LABEL[u.zone],
      u.name,
      APPCC_UNIT_TYPE_LABEL[u.unit_type],
      tempCell(m),
      tempCell(n),
    ];
  });

  autoTable(doc, {
    startY,
    head: [['Zona', 'Equipo', 'Tipo', 'Mañana', 'Noche']],
    body,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [211, 47, 47] },
    alternateRowStyles: { fillColor: [252, 252, 252] },
  });

  const genY =
    (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 400;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    `Generado ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`,
    40,
    genY + 18,
  );
}

export function downloadAppccTemperaturasPdf(opts: {
  localLabel: string;
  dateKey: string;
  dateFormatted: string;
  orderedUnits: AppccColdUnitRow[];
  bySlot: Map<string, AppccReadingRow>;
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  appendTemperaturasDayPage(
    doc,
    {
      localLabel: opts.localLabel,
      dateKey: opts.dateKey,
      dateFormatted: opts.dateFormatted,
      orderedUnits: opts.orderedUnits,
      bySlot: opts.bySlot,
    },
    true,
  );
  doc.save(`appcc-temperaturas-${opts.dateKey}.pdf`);
}

/** Una página por cada día del rango (inclusive); celdas sin lectura = —. */
export function downloadAppccTemperaturasRangePdf(opts: {
  localLabel: string;
  dateFrom: string;
  dateTo: string;
  orderedUnits: AppccColdUnitRow[];
  readings: AppccReadingRow[];
}) {
  let from = opts.dateFrom;
  let to = opts.dateTo;
  if (from > to) [from, to] = [to, from];
  const days = enumerateDateKeysInclusive(from, to);
  const byDate = new Map<string, AppccReadingRow[]>();
  for (const r of opts.readings) {
    const list = byDate.get(r.reading_date) ?? [];
    list.push(r);
    byDate.set(r.reading_date, list);
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const periodLine = `Periodo PDF: ${formatAppccDateEs(from)} – ${formatAppccDateEs(to)} (${from} … ${to})`;

  days.forEach((dk, i) => {
    const dayRows = byDate.get(dk) ?? [];
    const bySlot = readingsByUnitAndSlot(dayRows);
    appendTemperaturasDayPage(
      doc,
      {
        localLabel: opts.localLabel,
        dateKey: dk,
        dateFormatted: formatAppccDateEs(dk),
        orderedUnits: opts.orderedUnits,
        bySlot,
        periodLine,
      },
      i === 0,
    );
  });

  const slug = `${from}_${to}`.replace(/-/g, '');
  doc.save(`appcc-temperaturas-${slug}.pdf`);
}
