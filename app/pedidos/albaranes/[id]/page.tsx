'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileWarning,
  Link2,
  Loader2,
  Save,
  ShieldCheck,
  Archive,
} from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { createDeliveryNoteSignedUrl } from '@/lib/delivery-notes-storage';
import {
  DELIVERY_NOTE_INCIDENT_LABEL,
  DELIVERY_NOTE_STATUS_LABEL,
  fetchDeliveryNoteById,
  generateIncidentsFromDeliveryNoteComparison,
  refreshDeliveryNoteStatusFromIncidents,
  recomputeDeliveryNoteLineMatching,
  replaceDeliveryNoteItems,
  resolveDeliveryNoteIncident,
  updateDeliveryNote,
  type DeliveryNote,
  type DeliveryNoteIncident,
  type DeliveryNoteItem,
  type DeliveryNoteItemDraft,
  type DeliveryNoteStatus,
} from '@/lib/delivery-notes-supabase';
import { fetchOrderById, fetchOrders, type PedidoOrder } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

const UNITS: { v: Unit; l: string }[] = [
  { v: 'kg', l: 'kg' },
  { v: 'ud', l: 'ud' },
  { v: 'caja', l: 'caja' },
  { v: 'bolsa', l: 'bolsa' },
  { v: 'racion', l: 'ración' },
  { v: 'paquete', l: 'paquete' },
  { v: 'bandeja', l: 'bandeja' },
];

function itemToDraft(i: DeliveryNoteItem): DeliveryNoteItemDraft {
  return {
    supplierProductName: i.supplierProductName,
    internalProductId: i.internalProductId,
    quantity: i.quantity,
    unit: i.unit,
    unitPrice: i.unitPrice,
    lineSubtotal: i.lineSubtotal,
    vatRate: i.vatRate,
    matchedOrderItemId: i.matchedOrderItemId,
    matchStatus: i.matchStatus,
    notes: i.notes,
  };
}

export default function AlbaranDetallePage() {
  const params = useParams();
  const id = String(params.id ?? '');
  const { localCode, localName, localId, email, userId, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [note, setNote] = useState<DeliveryNote | null>(null);
  const [items, setItems] = useState<DeliveryNoteItem[]>([]);
  const [incidents, setIncidents] = useState<DeliveryNoteIncident[]>([]);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [order, setOrder] = useState<PedidoOrder | null>(null);
  const [ordersPick, setOrdersPick] = useState<PedidoOrder[]>([]);
  const [linkOrderId, setLinkOrderId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [supplierName, setSupplierName] = useState('');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [lineDrafts, setLineDrafts] = useState<DeliveryNoteItemDraft[]>([]);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk || !id) {
      setNote(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const pack = await fetchDeliveryNoteById(supabase, localId, id);
      if (!pack) {
        setNote(null);
        setLoading(false);
        return;
      }
      setNote(pack.note);
      setItems(pack.items);
      setIncidents(pack.incidents);
      setOcrPreview(pack.lastOcrText);
      setSupplierName(pack.note.supplierName);
      setDeliveryNoteNumber(pack.note.deliveryNoteNumber);
      setDeliveryDate(pack.note.deliveryDate ?? '');
      setNotes(pack.note.notes);
      setSubtotal(pack.note.subtotal != null ? String(pack.note.subtotal) : '');
      setTaxAmount(pack.note.taxAmount != null ? String(pack.note.taxAmount) : '');
      setTotalAmount(pack.note.totalAmount != null ? String(pack.note.totalAmount) : '');
      setLineDrafts(pack.items.map(itemToDraft));
      setLinkOrderId(pack.note.relatedOrderId ?? '');

      if (pack.note.originalStoragePath) {
        const url = await createDeliveryNoteSignedUrl(supabase, pack.note.originalStoragePath, 7200);
        setDocUrl(url);
      } else {
        setDocUrl(null);
      }

      if (pack.note.relatedOrderId) {
        const o = await fetchOrderById(supabase, localId, pack.note.relatedOrderId);
        setOrder(o);
      } else {
        setOrder(null);
      }

      const all = await fetchOrders(supabase, localId);
      setOrdersPick(all.filter((o) => o.status === 'sent' || o.status === 'received'));
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al cargar.');
      setNote(null);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk, id]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const parseOpt = (raw: string): number | null => {
    const t = raw.trim().replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const saveHeader = async () => {
    if (!localId || !note) return;
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const updated = await updateDeliveryNote(supabase, localId, note.id, {
        supplierName: supplierName.trim(),
        deliveryNoteNumber: deliveryNoteNumber.trim(),
        deliveryDate: deliveryDate.trim() || null,
        notes: notes.trim(),
        subtotal: parseOpt(subtotal),
        taxAmount: parseOpt(taxAmount),
        totalAmount: parseOpt(totalAmount),
      });
      setNote(updated);
      setBanner('Cabecera guardada.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setBusy(false);
    }
  };

  const saveLines = async () => {
    if (!localId || !note) return;
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const next = await replaceDeliveryNoteItems(supabase, localId, note.id, lineDrafts);
      setItems(next);
      setLineDrafts(next.map(itemToDraft));
      if (note.relatedOrderId && order) {
        const matched = await recomputeDeliveryNoteLineMatching(supabase, localId, note.id, order.items);
        setItems(matched);
        setLineDrafts(matched.map(itemToDraft));
      }
      setBanner('Líneas guardadas.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al guardar líneas.');
    } finally {
      setBusy(false);
    }
  };

  const applyLinkOrder = async () => {
    if (!localId || !note || !linkOrderId.trim()) return;
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const o = await fetchOrderById(supabase, localId, linkOrderId.trim());
      if (!o) {
        setBanner('Pedido no encontrado.');
        setBusy(false);
        return;
      }
      const updated = await updateDeliveryNote(supabase, localId, note.id, {
        relatedOrderId: o.id,
        supplierId: o.supplierId,
        supplierName: o.supplierName,
        sourceType: 'linked_order',
        status: note.status === 'draft' ? 'pending_review' : note.status,
      });
      setNote(updated);
      setSupplierName(updated.supplierName);
      setOrder(o);
      const matched = await recomputeDeliveryNoteLineMatching(supabase, localId, note.id, o.items);
      setItems(matched);
      setLineDrafts(matched.map(itemToDraft));
      setBanner('Pedido vinculado y líneas emparejadas.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al vincular.');
    } finally {
      setBusy(false);
    }
  };

  const runCompareIncidents = async () => {
    if (!localId || !note || !order) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await generateIncidentsFromDeliveryNoteComparison(supabase, localId, note.id, items, order.items);
      const refreshed = await refreshDeliveryNoteStatusFromIncidents(supabase, localId, note.id);
      setNote(refreshed);
      const pack = await fetchDeliveryNoteById(supabase, localId, id);
      if (pack) {
        setIncidents(pack.incidents);
        setItems(pack.items);
        setLineDrafts(pack.items.map(itemToDraft));
      }
      setBanner('Incidencias generadas desde comparación.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (s: DeliveryNoteStatus) => {
    if (!localId || !note) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      if (s === 'validated') {
        const updated = await updateDeliveryNote(supabase, localId, note.id, {
          status: s,
          validatedAt: new Date().toISOString(),
          validatedBy: userId ?? null,
        });
        setNote(updated);
      } else {
        const updated = await updateDeliveryNote(supabase, localId, note.id, { status: s });
        setNote(updated);
      }
      setBanner('Estado actualizado.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error.');
    } finally {
      setBusy(false);
    }
  };

  const resolveInc = async (incidentId: string) => {
    if (!localId || !userId) return;
    const comment = window.prompt('Comentario de resolución (opcional)') ?? '';
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await resolveDeliveryNoteIncident(supabase, localId, incidentId, userId, comment);
      const pack = await fetchDeliveryNoteById(supabase, localId, id);
      if (pack) {
        setIncidents(pack.incidents);
        const refreshed = await refreshDeliveryNoteStatusFromIncidents(supabase, localId, note!.id);
        setNote(refreshed);
      }
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error.');
    } finally {
      setBusy(false);
    }
  };

  const comparisonRows = useMemo(() => {
    if (!order) return [];
    const byMatch = new Map(items.map((i) => [i.matchedOrderItemId ?? '', i] as const));
    return order.items.map((oi) => {
      const ni = byMatch.get(oi.id);
      return { oi, ni };
    });
  }, [order, items]);

  if (!profileReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando…</p>
      </section>
    );
  }

  if (!hasPedidosEntry) return <PedidosPremiaLockedScreen />;
  if (!canUse || !localId || !supabaseOk) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">No disponible.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#D32F2F]" aria-hidden />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">Albarán no encontrado.</p>
        <Link href="/pedidos/albaranes" className="text-[#D32F2F] font-semibold underline">
          Volver a la bandeja
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      <MermasStyleHero
        slim
        eyebrow="Albarán"
        title={supplierName || 'Detalle'}
        description={`Estado: ${DELIVERY_NOTE_STATUS_LABEL[note.status]} · Nº ${deliveryNoteNumber || '—'}`}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/pedidos/albaranes"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Bandeja
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => void setStatus('validated')}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Validar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void setStatus('archived')}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-100 px-3 text-sm font-bold text-zinc-800 disabled:opacity-50"
        >
          <Archive className="h-4 w-4" aria-hidden />
          Archivar
        </button>
      </div>

      {banner ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{banner}</div>
      ) : null}

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
        <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Cabecera</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold text-zinc-500">Proveedor</label>
            <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500">Nº albarán</label>
            <input value={deliveryNoteNumber} onChange={(e) => setDeliveryNoteNumber(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500">Fecha</label>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500">Subtotal</label>
            <input value={subtotal} onChange={(e) => setSubtotal(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums" inputMode="decimal" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500">IVA</label>
            <input value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums" inputMode="decimal" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500">Total</label>
            <input value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums" inputMode="decimal" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold text-zinc-500">Observaciones</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveHeader()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden />
          Guardar cabecera
        </button>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
        <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Documento original</h2>
        {docUrl ? (
          <div className="mt-3 space-y-2">
            <a href={docUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#D32F2F] underline">
              Abrir / descargar archivo firmado
            </a>
            {note.originalMimeType?.includes('pdf') ? (
              <iframe title="PDF" src={docUrl} className="mt-2 h-[min(70vh,520px)] w-full rounded-xl border border-zinc-200" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={docUrl} alt="Albarán" className="mt-2 max-h-[480px] w-full rounded-xl border border-zinc-200 object-contain" />
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">Sin archivo.</p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-zinc-500">
          <Link2 className="h-4 w-4" aria-hidden />
          Relación con pedido
        </h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <select
            value={linkOrderId}
            onChange={(e) => setLinkOrderId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold sm:min-w-[16rem] sm:flex-1"
          >
            <option value="">— Sin pedido —</option>
            {ordersPick.slice(0, 120).map((o) => (
              <option key={o.id} value={o.id}>
                {o.supplierName} · {new Date(o.createdAt).toLocaleDateString('es-ES')} · {o.status}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !linkOrderId}
            onClick={() => void applyLinkOrder()}
            className="rounded-xl bg-[#D32F2F] px-4 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            Vincular y emparejar
          </button>
        </div>
        {order ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-100">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[10px] font-black uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Producto pedido</th>
                  <th className="px-2 py-2">Pedido</th>
                  <th className="px-2 py-2">Albarán</th>
                  <th className="px-2 py-2">Match</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ oi, ni }) => (
                  <tr key={oi.id} className="border-t border-zinc-100">
                    <td className="px-2 py-2 font-medium text-zinc-900">{oi.productName}</td>
                    <td className="px-2 py-2 tabular-nums text-zinc-700">
                      {oi.quantity} {oi.unit} × {oi.pricePerUnit.toFixed(2)} €
                    </td>
                    <td className="px-2 py-2 tabular-nums text-zinc-700">
                      {ni ? (
                        <>
                          {ni.quantity} {ni.unit} × {ni.unitPrice?.toFixed(2) ?? '—'} €
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {ni?.matchStatus ? (
                        <span
                          className={
                            ni.matchStatus === 'matched'
                              ? 'text-emerald-700'
                              : ni.matchStatus === 'extra_line'
                                ? 'text-amber-800'
                                : 'text-red-700'
                          }
                        >
                          {ni.matchStatus}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {order ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runCompareIncidents()}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950"
          >
            <FileWarning className="h-4 w-4" aria-hidden />
            Generar incidencias desde diferencias
          </button>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
        <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Líneas del albarán</h2>
        <div className="mt-3 space-y-3">
          {lineDrafts.map((row, idx) => (
            <div key={idx} className="rounded-xl border border-zinc-200 p-3">
              <div className="grid gap-2 sm:grid-cols-12">
                <input
                  value={row.supplierProductName}
                  onChange={(e) =>
                    setLineDrafts((d) => d.map((x, i) => (i === idx ? { ...x, supplierProductName: e.target.value } : x)))
                  }
                  className="sm:col-span-5 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  placeholder="Producto"
                />
                <input
                  value={String(row.quantity)}
                  onChange={(e) =>
                    setLineDrafts((d) =>
                      d.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value.replace(',', '.')) || 0 } : x)),
                    )
                  }
                  className="sm:col-span-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm tabular-nums"
                  inputMode="decimal"
                />
                <select
                  value={row.unit}
                  onChange={(e) =>
                    setLineDrafts((d) => d.map((x, i) => (i === idx ? { ...x, unit: e.target.value as Unit } : x)))
                  }
                  className="sm:col-span-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                >
                  {UNITS.map((u) => (
                    <option key={u.v} value={u.v}>
                      {u.l}
                    </option>
                  ))}
                </select>
                <input
                  value={row.unitPrice != null ? String(row.unitPrice) : ''}
                  onChange={(e) =>
                    setLineDrafts((d) =>
                      d.map((x, i) => {
                        const t = e.target.value.trim();
                        return i === idx
                          ? { ...x, unitPrice: t === '' ? null : Number(t.replace(',', '.')) }
                          : x;
                      }),
                    )
                  }
                  className="sm:col-span-3 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm tabular-nums"
                  placeholder="€/ud"
                />
              </div>
              <button
                type="button"
                onClick={() => setLineDrafts((d) => d.filter((_, i) => i !== idx))}
                className="mt-2 text-[11px] font-bold text-red-700"
              >
                Quitar línea
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setLineDrafts((d) => [
              ...d,
              {
                supplierProductName: '',
                quantity: 1,
                unit: 'ud',
                unitPrice: null,
                lineSubtotal: null,
                matchStatus: 'not_applicable',
              },
            ])
          }
          className="mt-3 text-sm font-bold text-[#D32F2F]"
        >
          + Añadir línea
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveLines()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-black text-white disabled:opacity-50 sm:w-auto sm:px-6"
        >
          <Save className="h-4 w-4" aria-hidden />
          Guardar líneas
        </button>
      </section>

      <section className="rounded-2xl border border-red-100 bg-red-50/40 p-4 shadow-sm ring-1 ring-red-100 sm:p-5">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-red-900">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Incidencias
        </h2>
        {incidents.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">Sin incidencias registradas.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {incidents.map((inc) => (
              <li key={inc.id} className="rounded-xl bg-white p-3 ring-1 ring-red-100">
                <p className="text-[10px] font-black uppercase text-red-800">{DELIVERY_NOTE_INCIDENT_LABEL[inc.incidentType]}</p>
                <p className="mt-1 text-sm text-zinc-800">{inc.description}</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {inc.status === 'open' ? 'Abierta' : 'Resuelta'}
                  {inc.resolutionComment ? ` · ${inc.resolutionComment}` : ''}
                </p>
                {inc.status === 'open' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resolveInc(inc.id)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Marcar resuelta
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {ocrPreview ? (
        <details className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <summary className="cursor-pointer text-xs font-bold text-zinc-600">Texto OCR (referencia)</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-zinc-700">{ocrPreview}</pre>
        </details>
      ) : null}
    </div>
  );
}
