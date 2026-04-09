'use client';

import Link from 'next/link';
import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/components/AuthProvider';
import { canAccessPedidos } from '@/lib/pedidos-access';
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

export default function PedidosPreciosPage() {
  const { localCode, localName, localId, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email, localName, localId);
  const [orders, setOrders] = React.useState<PedidoOrder[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchOrders(supabase, localId)
      .then((rows) => setOrders(rows.filter((o) => o.status !== 'draft')))
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId]);

  const series = React.useMemo<ProductPriceSeries[]>(() => {
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
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        points: row.points.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
      }))
      .filter((row) => {
        const uniquePrices = new Set(row.points.map((p) => p.price.toFixed(2)));
        return uniquePrices.size > 1;
      })
      .filter((row) => row.productName.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => a.productName.localeCompare(b.productName, 'es'));
  }, [orders, search]);

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
      const ordered = [...row.points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      for (let i = 0; i < ordered.length; i += 1) {
        const point = ordered[i];
        const prev = i > 0 ? ordered[i - 1] : null;
        const delta = prev ? point.price - prev.price : 0;
        body.push([
          row.productName,
          new Date(point.date).toLocaleDateString('es-ES'),
          point.supplier,
          point.unit,
          `${point.price.toFixed(2)} €`,
          `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} €`,
        ]);
      }
    }
    autoTable(doc, {
      startY: 62,
      head: [['Producto', 'Fecha', 'Proveedor', 'Unidad', 'Precio', 'Delta']],
      body,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [211, 47, 47] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`evolucion-precios-${stamp}.pdf`);
  }, [series]);

  if (!canUse) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Modulo no habilitado</p>
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible para los locales de Mataro y Premia.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <Link href="/pedidos" className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700">
          ← Atras
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-lg font-black text-zinc-900">Evolucion de precios</h1>
        <p className="pt-1 text-sm text-zinc-600">Comparativa histórica por artículo para detectar subidas y bajadas.</p>
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar artículo..."
          className="mt-3 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
        />
      </section>

      <section className="space-y-2">
        {series.length === 0 ? <div className="rounded-2xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">No hay histórico de precios para mostrar.</div> : null}
        {series.map((row) => {
          const last = row.points[0];
          const prev = row.points[1];
          const delta = prev ? last.price - prev.price : 0;
          return (
            <div key={row.key} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-black text-zinc-900">{row.productName}</p>
              <p className="pt-1 text-xs text-zinc-600">
                Ultimo: {last.price.toFixed(2)} €/{last.unit}
                {prev ? ` · Anterior: ${prev.price.toFixed(2)} € · Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} €` : ' · Sin comparación previa'}
              </p>
              <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-200">
                {row.points.slice(0, 10).map((point, idx) => (
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

