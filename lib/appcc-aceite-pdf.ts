import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { APPCC_OIL_EVENT_LABEL, type AppccOilEventWithFryer } from '@/lib/appcc-aceite-supabase';
import { APPCC_ZONE_LABEL, formatAppccDateEs } from '@/lib/appcc-supabase';

function litersCell(l: number | null) {
  if (l == null) return '—';
  return `${l} L`;
}

function notesCell(n: string | undefined) {
  const t = n?.trim();
  return t ? t : '—';
}

function operatorCell(n: string | null | undefined) {
  const t = n?.trim();
  return t ? t : '—';
}

/** Resumen de eventos de aceite en un rango de fechas (más recientes primero en la tabla). */
export function downloadAppccAceiteResumenPdf(opts: {
  localLabel: string;
  dateFrom: string;
  dateTo: string;
  events: AppccOilEventWithFryer[];
  titleSuffix?: string;
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(12);
  doc.text('Chef-One · Aceite en freidoras (APPCC)', 40, 36);
  doc.setFontSize(9);
  doc.text(`Local: ${opts.localLabel}`, 40, 52);
  const fromEs = formatAppccDateEs(opts.dateFrom);
  const toEs = formatAppccDateEs(opts.dateTo);
  doc.text(
    `Periodo: ${fromEs} – ${toEs} (${opts.dateFrom} … ${opts.dateTo})${opts.titleSuffix ? ` · ${opts.titleSuffix}` : ''}`,
    40,
    64,
  );

  const body = opts.events.map((e) => {
    const z = e.fryer?.zone;
    const zoneLabel = z ? APPCC_ZONE_LABEL[z] : '—';
    const name = e.fryer?.name ?? '—';
    return [
      e.event_date,
      formatAppccDateEs(e.event_date),
      zoneLabel,
      name,
      APPCC_OIL_EVENT_LABEL[e.event_type],
      litersCell(e.liters_used),
      operatorCell(e.operator_name),
      notesCell(e.notes),
    ];
  });

  autoTable(doc, {
    startY: 76,
    head: [['Fecha', 'Día', 'Zona', 'Freidora', 'Tipo', 'Litros', 'Realizado por', 'Notas']],
    body,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [211, 47, 47] },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 88 },
      2: { cellWidth: 48 },
      3: { cellWidth: 82 },
      4: { cellWidth: 48 },
      5: { cellWidth: 40 },
      6: { cellWidth: 72 },
    },
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

  const slug = `${opts.dateFrom}_${opts.dateTo}`.replace(/-/g, '');
  doc.save(`appcc-aceite-${slug}.pdf`);
}
