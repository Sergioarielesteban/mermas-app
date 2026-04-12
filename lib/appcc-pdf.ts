import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  APPCC_UNIT_TYPE_LABEL,
  APPCC_ZONE_LABEL,
  type AppccColdUnitRow,
  type AppccReadingRow,
} from '@/lib/appcc-supabase';

function tempCell(r: AppccReadingRow | undefined) {
  if (!r) return '—';
  const n = r.notes?.trim();
  return n ? `${r.temperature_c} °C (${n})` : `${r.temperature_c} °C`;
}

export function downloadAppccTemperaturasPdf(opts: {
  localLabel: string;
  dateKey: string;
  dateFormatted: string;
  orderedUnits: AppccColdUnitRow[];
  bySlot: Map<string, AppccReadingRow>;
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(12);
  doc.text('Chef-One · Temperaturas de frío (APPCC)', 40, 36);
  doc.setFontSize(9);
  doc.text(`Local: ${opts.localLabel}`, 40, 52);
  doc.text(`Día: ${opts.dateFormatted} (${opts.dateKey})`, 40, 64);

  const body = opts.orderedUnits.map((u) => {
    const m = opts.bySlot.get(`${u.id}:manana`);
    const t = opts.bySlot.get(`${u.id}:tarde`);
    const n = opts.bySlot.get(`${u.id}:noche`);
    return [
      APPCC_ZONE_LABEL[u.zone],
      u.name,
      APPCC_UNIT_TYPE_LABEL[u.unit_type],
      tempCell(m),
      tempCell(t),
      tempCell(n),
    ];
  });

  autoTable(doc, {
    startY: 76,
    head: [['Zona', 'Equipo', 'Tipo', 'Mañana', 'Tarde', 'Noche']],
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

  doc.save(`appcc-temperaturas-${opts.dateKey}.pdf`);
}
