'use client';

import Link from 'next/link';
import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/components/AuthProvider';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { fetchOrders, type PedidoOrder } from '@/lib/pedidos-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';

type PricePoint = {
  date: string;
  supplier: string;
  unit: string;
  price: number;
};

type ProductPriceSeries = {
  key: string;
  productName: string;
  points: PricePoint[];
};

type PriceSummary = ProductPriceSeries & {
  base: PricePoint;
  current: PricePoint;
  delta: number;
  deltaPct: number;
};

export default function PedidosPreciosPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const [orders, setOrders] = React.useState<PedidoOrder[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) => setOrders(rows.filter((o) => o.status !== 'draft')))
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId]);

  const series = React.useMemo<PriceSummary[]>(() => {
    const map = new Map<string, ProductPriceSeries>();
    for (const order of orders) {
      for (const item of order.items) {
        const key = item.supplierProductId ?? `name:${item.productName}`;
        const row = map.get(key) ?? { key, productName: item.productName, points: [] };
        row.points.push({
          date: order.createdAt,
          supplier: order.supplierName,
          unit: item.unit,
          price: item.pricePerUnit,
        });
        map.set(key, row);
      }
    }
    return Array.from(map.values()).map((row) => {
      const ordered = [...row.points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      const base = ordered[0];
      const current = ordered[ordered.length - 1];
      const delta = Math.round((current.price - base.price) * 100) / 100;
      const deltaPct = base.price > 0 ? Math.round((delta / base.price) * 10000) / 100 : 0;
      return {
        ...row,
        points: ordered.reverse(),
        base,
        current,
        delta,
        deltaPct,
      };
    })
      .filter((row) => Math.abs(row.delta) > 0.001)
      .sort((a, b) => a.productName.localeCompare(b.productName, 'es'));
  }, [orders]);

  const trendLabel = (row: PriceSummary) => {
    if (row.delta > 0) {
      return `Sube +${row.delta.toFixed(2)} € (+${row.deltaPct.toFixed(2)}%)`;
    }
    if (row.delta < 0) {
      return `Baja ${row.delta.toFixed(2)} € (${row.deltaPct.toFixed(2)}%)`;
    }
    return 'Sin cambio';
  };

  const trendClass = (row: PriceSummary) => {
    if (row.delta > 0) return 'text-red-700';
    if (row.delta < 0) return 'text-emerald-700';
    return 'text-zinc-600';
  };

  const downloadReportPdf = React.useCallback(() => {
    if (series.length === 0) {
      setMessage('No hay datos con cambios de precio para descargar.');
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Informe de evolución de precios', 40, 34);
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`, 40, 50);

    const body: string[][] = [];
    for (const row of series) {
      body.push([
        row.productName,
        `${row.base.price.toFixed(2)} €/${row.base.unit}`,
        `${row.current.price.toFixed(2)} €/${row.current.unit}`,
        `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(2)} €`,
        `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(2)}%`,
      ]);
    }
    autoTable(doc, {
      startY: 62,
      head: [['Producto', 'Precio base', 'Precio actual', 'Variación €', 'Variación %']],
      body,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [211, 47, 47] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`evolucion-precios-${stamp}.pdf`);
  }, [series]);

  if (!hasPedidosEntry) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Modulo no habilitado</p>
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible para los locales de Mataro y Premia.</p>
      </section>
    );
  }
  if (!canUse) {
    return <PedidosPremiaLockedScreen />;
  }

  return (
    <div className="space-y-4">
      <section>
        <Link href="/pedidos" className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700">
          ← Atras
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-center text-lg font-black text-zinc-900">EVOLUCION DE PRECIOS</h1>
        {message ? <p className="pt-2 text-sm text-[#B91C1C]">{message}</p> : null}
        <div className="mt-3">
          <button
            type="button"
            onClick={downloadReportPdf}
            className="h-10 rounded-xl bg-[#D32F2F] px-3 text-sm font-semibold text-white"
          >
            Descargar informe PDF
          </button>
        </div>
      </section>

      <section className="space-y-2">
        {series.length === 0 ? <div className="rounded-2xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">No hay evolución de precios para mostrar.</div> : null}
        {series.map((row) => {
          return (
            <div key={row.key} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-black text-zinc-900">{row.productName}</p>
              <p className="pt-1 text-xs text-zinc-600">
                Base: {row.base.price.toFixed(2)} €/{row.base.unit} · Actual: {row.current.price.toFixed(2)} €/{row.current.unit}
              </p>
              <p className={`pt-1 text-xs font-semibold ${trendClass(row)}`}>{trendLabel(row)}</p>
              <div className="mt-2 max-h-36 space-y-1 overflow-auto rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-200">
                {row.points.slice(0, 8).map((point, idx) => (
                  <p key={`${row.key}-${idx}`} className="text-xs text-zinc-600">
                    {new Date(point.date).toLocaleDateString('es-ES')} · {point.supplier} · {point.price.toFixed(2)} €/{point.unit}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

