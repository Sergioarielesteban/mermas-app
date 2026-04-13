'use client';

import Link from 'next/link';
import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/components/AuthProvider';
import { usePedidosOrders } from '@/components/PedidosOrdersProvider';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { formatQuantityWithUnit } from '@/lib/pedidos-format';
import { billingQuantityForLine, type PedidoOrder } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

type PricePoint = {
  date: string;
  supplier: string;
  unit: string;
  price: number;
  /** Desempate si varios pedidos comparten la misma fecha de precio */
  orderCreatedAt: string;
  itemId: string;
  /** 0 = precio pedido (base), 1 = precio albarán; misma fecha ISO → base antes que albarán */
  sortRank?: number;
};

type PurchaseRow = {
  date: string;
  supplier: string;
  qty: number;
  unit: Unit;
  price: number;
};

type PriceSummary = {
  key: string;
  productName: string;
  points: PricePoint[];
  purchases: PurchaseRow[];
  weightedAvg: number;
  totalWeightedQty: number;
  base: PricePoint;
  current: PricePoint;
  delta: number;
  deltaPct: number;
};

function orderPriceDate(order: PedidoOrder): string {
  return order.receivedAt ?? order.sentAt ?? order.createdAt;
}

/** Fecha del precio «pedido» (catálogo al enviar) para contrastar con albarán en un mismo pedido. */
function orderBasePriceDate(order: PedidoOrder): string {
  return order.sentAt ?? order.createdAt;
}

/**
 * Clave estable por proveedor + producto + unidad. No usar solo `supplier_product_id`:
 * si en un pedido falta el UUID y en otro no, antes se creaban dos series y no había “evolución”.
 * Las incidencias no cambian esta clave: el precio facturado en línea sigue contando.
 */
function evolutionProductKey(order: PedidoOrder, item: PedidoOrder['items'][number]): string {
  const name = item.productName.trim().replace(/\s+/g, ' ').toLowerCase();
  return `${order.supplierId}|${name}|${item.unit}`;
}

/** Precio unitario para historial: incluye líneas con incidencia si `price_per_unit` quedó en 0 pero hay subtotal. */
function unitPriceForPriceHistory(item: PedidoOrder['items'][number]): number | null {
  const p = item.pricePerUnit;
  if (Number.isFinite(p) && p > 0) return Math.round(p * 100) / 100;
  const billed = billingQuantityForLine(item);
  if (billed > 0 && item.lineTotal > 0) {
    return Math.round((item.lineTotal / billed) * 100) / 100;
  }
  if (item.quantity > 0 && item.lineTotal > 0) {
    return Math.round((item.lineTotal / item.quantity) * 100) / 100;
  }
  return null;
}

function weightQtyForHistory(item: PedidoOrder['items'][number]): number {
  const billed = billingQuantityForLine(item);
  if (billed > 0) return billed;
  if (item.quantity > 0) return item.quantity;
  /* Incluir la línea en evolución/media aunque cantidad sea 0 (p. ej. incidencia), para no perder el precio facturado. */
  return 1;
}

export default function PedidosPreciosPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const { orders: allOrders } = usePedidosOrders();
  const orders = React.useMemo(() => allOrders.filter((o) => o.status !== 'draft'), [allOrders]);
  const [message, setMessage] = React.useState<string | null>(null);

  const series = React.useMemo<PriceSummary[]>(() => {
    type Acc = {
      key: string;
      productName: string;
      points: PricePoint[];
      purchases: PurchaseRow[];
      wSum: number;
      wQty: number;
    };
    const map = new Map<string, Acc>();
    for (const order of orders) {
      const dBill = orderPriceDate(order);
      const dBase = orderBasePriceDate(order);
      for (const item of order.items) {
        const unitPrice = unitPriceForPriceHistory(item);
        if (unitPrice == null) continue;
        const key = evolutionProductKey(order, item);
        const wq = weightQtyForHistory(item);
        const acc =
          map.get(key) ?? {
            key,
            productName: item.productName.trim(),
            points: [],
            purchases: [],
            wSum: 0,
            wQty: 0,
          };
        const baseRaw = item.basePricePerUnit;
        const basePrice =
          baseRaw != null && Number.isFinite(baseRaw) && baseRaw > 0 ? Math.round(baseRaw * 100) / 100 : null;
        if (basePrice != null && Math.abs(basePrice - unitPrice) > 0.001) {
          acc.points.push({
            date: dBase,
            supplier: order.supplierName,
            unit: item.unit,
            price: basePrice,
            orderCreatedAt: order.createdAt,
            itemId: `${item.id}:base`,
            sortRank: 0,
          });
        }
        acc.points.push({
          date: dBill,
          supplier: order.supplierName,
          unit: item.unit,
          price: unitPrice,
          orderCreatedAt: order.createdAt,
          itemId: item.id,
          sortRank: 1,
        });
        acc.purchases.push({
          date: dBill,
          supplier: order.supplierName,
          qty: wq,
          unit: item.unit,
          price: unitPrice,
        });
        acc.wSum += unitPrice * wq;
        acc.wQty += wq;
        map.set(key, acc);
      }
    }
    return Array.from(map.values())
      .map((acc) => {
        const ordered = [...acc.points].sort((a, b) => {
          const t = Date.parse(a.date) - Date.parse(b.date);
          if (t !== 0) return t;
          const oc = Date.parse(a.orderCreatedAt) - Date.parse(b.orderCreatedAt);
          if (oc !== 0) return oc;
          const ra = a.sortRank ?? 0;
          const rb = b.sortRank ?? 0;
          if (ra !== rb) return ra - rb;
          return a.itemId.localeCompare(b.itemId);
        });
        const base = ordered[0];
        const current = ordered[ordered.length - 1];
        const delta = Math.round((current.price - base.price) * 100) / 100;
        const deltaPct = base.price > 0 ? Math.round((delta / base.price) * 10000) / 100 : 0;
        const weightedAvg = acc.wQty > 0 ? Math.round((acc.wSum / acc.wQty) * 100) / 100 : current.price;
        const purchasesSorted = [...acc.purchases].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
        return {
          key: acc.key,
          productName: acc.productName,
          points: [...ordered].reverse(),
          purchases: purchasesSorted,
          weightedAvg,
          totalWeightedQty: acc.wQty,
          base,
          current,
          delta,
          deltaPct,
        };
      })
      .filter((row) => row.points.length >= 2 && Math.abs(row.delta) > 0.001)
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
        `${row.weightedAvg.toFixed(2)} €/${row.current.unit}`,
        `${row.current.price.toFixed(2)} €/${row.current.unit}`,
        `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(2)} €`,
        `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(2)}%`,
      ]);
    }
    autoTable(doc, {
      startY: 62,
      head: [['Producto', 'Precio base', 'Precio medio ponderado', 'Precio actual', 'Variación €', 'Variación %']],
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
                Base: {row.base.price.toFixed(2)} €/{row.base.unit} · Actual: {row.current.price.toFixed(2)} €/
                {row.current.unit}
              </p>
              <p className="pt-1 text-xs font-semibold text-zinc-800">
                Precio medio ponderado:{' '}
                <span className="tabular-nums">
                  {row.weightedAvg.toFixed(2)} €/{row.current.unit}
                </span>{' '}
                · Cantidad total acumulada:{' '}
                <span className="tabular-nums">{row.totalWeightedQty.toLocaleString('es-ES')}</span>
              </p>
              <p className={`pt-1 text-xs font-semibold ${trendClass(row)}`}>{trendLabel(row)}</p>
              <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Compras (más reciente primero)</p>
              <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-200">
                {row.purchases.map((pur, idx) => (
                  <p key={`${row.key}-p-${idx}`} className="text-xs text-zinc-600">
                    {new Date(pur.date).toLocaleDateString('es-ES')} · {pur.supplier} ·{' '}
                    {formatQuantityWithUnit(pur.qty, pur.unit)} · {pur.price.toFixed(2)} €/{pur.unit}
                  </p>
                ))}
              </div>
              <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Evolución precio unitario</p>
              <div className="mt-1 max-h-28 space-y-1 overflow-auto rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-200">
                {row.points.slice(0, 12).map((point, idx) => (
                  <p key={`${row.key}-${idx}`} className="text-xs text-zinc-600">
                    {new Date(point.date).toLocaleDateString('es-ES')} · {point.supplier} · {point.price.toFixed(2)} €/
                    {point.unit}
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

