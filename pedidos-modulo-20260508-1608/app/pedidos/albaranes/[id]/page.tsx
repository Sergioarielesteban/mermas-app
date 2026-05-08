'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  FileWarning,
  Link2,
  Link2Off,
  Loader2,
  Save,
  ShieldCheck,
  Archive,
  PlusCircle,
} from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { createDeliveryNoteSignedUrl } from '@/lib/delivery-notes-storage';
import { buildDeliveryNoteAccountingPreview } from '@/lib/delivery-notes-accounting';
import {
  deliveryNoteFlowStepIndex,
  deliveryNoteStatusVisual,
  MATCH_STATUS_LABEL,
  matchRowAccent,
} from '@/lib/delivery-notes-ui';
import {
  DELIVERY_NOTE_INCIDENT_LABEL,
  DELIVERY_NOTE_STATUS_LABEL,
  fetchDeliveryNoteById,
  generateIncidentsFromDeliveryNoteComparison,
  insertDeliveryNoteIncident,
  refreshDeliveryNoteStatusFromIncidents,
  recomputeDeliveryNoteLineMatching,
  replaceDeliveryNoteItems,
  resolveDeliveryNoteIncident,
  updateDeliveryNote,
  type DeliveryNote,
  type DeliveryNoteIncident,
  type DeliveryNoteIncidentType,
  type DeliveryNoteItem,
  type DeliveryNoteItemDraft,
  type DeliveryNoteItemMatchStatus,
  type DeliveryNoteStatus,
} from '@/lib/delivery-notes-supabase';
import { syncCatalogPricesFromValidatedDeliveryNote } from '@/lib/delivery-note-catalog-price-sync';
import {
  fetchOrderById,
  fetchOrders,
  fetchSuppliersWithProducts,
  type PedidoOrder,
  type PedidoOrderItem,
  type PedidoSupplier,
} from '@/lib/pedidos-supabase';
import { catalogNameByProductIdFromSuppliers, orderLineDisplayName } from '@/lib/pedidos-line-display-name';
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

const INCIDENT_TYPES: DeliveryNoteIncidentType[] = [
  'qty_diff',
  'price_diff',
  'not_ordered',
  'line_unknown',
  'total_mismatch',
  'incomplete_doc',
  'other',
];

type LineDraftRow = DeliveryNoteItemDraft & { _key: string };

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

function itemToLineDraft(i: DeliveryNoteItem): LineDraftRow {
  return { ...itemToDraft(i), _key: i.id };
}

function newEmptyLine(): LineDraftRow {
  return {
    _key: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ln-${Date.now()}-${Math.random()}`,
    supplierProductName: '',
    quantity: 1,
    unit: 'ud',
    unitPrice: null,
    lineSubtotal: null,
    matchStatus: 'not_applicable',
  };
}

function orderedQtyForUi(oi: PedidoOrderItem): number {
  return Math.round(oi.quantity * 100) / 100;
}

function normalizeDraftCompare(d: DeliveryNoteItemDraft): string {
  return JSON.stringify({
    supplierProductName: d.supplierProductName.trim(),
    internalProductId: d.internalProductId ?? null,
    quantity: d.quantity,
    unit: d.unit,
    unitPrice: d.unitPrice ?? null,
    lineSubtotal: d.lineSubtotal ?? null,
    vatRate: d.vatRate ?? null,
    matchedOrderItemId: d.matchedOrderItemId ?? null,
    matchStatus: d.matchStatus ?? null,
    notes: (d.notes ?? '').trim(),
  });
}

function StatusStepper({ status }: { status: DeliveryNoteStatus }) {
  const labels = ['Borrador / carga', 'OCR', 'Revisión', 'Cerrado'];
  const idx = deliveryNoteFlowStepIndex(status);
  const isIncident = status === 'with_incidents';
  const isArchived = status === 'archived';
  const isValidated = status === 'validated';

  const stepKind = (i: number): 'done' | 'current' | 'incident' | 'todo' => {
    if (isArchived || isValidated) return 'done';
    if (isIncident) return i < 3 ? 'done' : i === 3 ? 'incident' : 'todo';
    if (i < idx) return 'done';
    if (i === idx) return 'current';
    return 'todo';
  };

  return (
    <div className="mt-3 overflow-x-auto pb-1">
      <ol className="flex min-w-[280px] items-center gap-0">
        {labels.map((lab, i) => {
          const kind = stepKind(i);
          const connectorGreen =
            isArchived || isValidated ? true : isIncident ? i < 3 : i < idx;
          return (
            <li key={lab} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span
                  className={[
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black',
                    kind === 'incident'
                      ? 'bg-red-600 text-white ring-2 ring-red-300'
                      : kind === 'done'
                        ? 'bg-emerald-600 text-white'
                        : kind === 'current'
                          ? 'bg-amber-500 text-white ring-2 ring-amber-200'
                          : 'bg-zinc-200 text-zinc-500',
                  ].join(' ')}
                >
                  {kind === 'done' ? '✓' : kind === 'incident' ? '!' : i + 1}
                </span>
                <span className="max-w-[4.5rem] text-center text-[9px] font-bold uppercase leading-tight text-zinc-500">
                  {kind === 'incident' ? 'Incidencias' : lab}
                </span>
              </div>
              {i < labels.length - 1 ? (
                <div
                  className={['mx-1 h-0.5 min-w-[12px] flex-1 rounded-full', connectorGreen ? 'bg-emerald-400' : 'bg-zinc-200'].join(
                    ' ',
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
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
  const [lineDrafts, setLineDrafts] = useState<LineDraftRow[]>([]);

  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [incidentTab, setIncidentTab] = useState<'open' | 'resolved' | 'all'>('open');
  const [resolveModalId, setResolveModalId] = useState<string | null>(null);
  const [resolveComment, setResolveComment] = useState('');
  const [manualIncType, setManualIncType] = useState<DeliveryNoteIncidentType>('other');
  const [manualIncDesc, setManualIncDesc] = useState('');
  const [catalogSuppliers, setCatalogSuppliers] = useState<PedidoSupplier[]>([]);

  const catalogNameByProductId = useMemo(
    () => catalogNameByProductIdFromSuppliers(catalogSuppliers),
    [catalogSuppliers],
  );

  useEffect(() => {
    if (!localId || !supabaseOk) {
      setCatalogSuppliers([]);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchSuppliersWithProducts(supabase, localId)
      .then((rows) => setCatalogSuppliers(rows))
      .catch(() => setCatalogSuppliers([]));
  }, [localId, supabaseOk]);

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
      setLineDrafts(pack.items.map(itemToLineDraft));
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

  const linesDirty = useMemo(() => {
    if (lineDrafts.length !== items.length) return true;
    for (let i = 0; i < items.length; i++) {
      if (normalizeDraftCompare(lineDrafts[i]!) !== normalizeDraftCompare(itemToDraft(items[i]!))) return true;
    }
    return false;
  }, [lineDrafts, items]);

  const openIncidents = useMemo(() => incidents.filter((i) => i.status === 'open'), [incidents]);
  const filteredIncidents = useMemo(() => {
    if (incidentTab === 'open') return incidents.filter((i) => i.status === 'open');
    if (incidentTab === 'resolved') return incidents.filter((i) => i.status === 'resolved');
    return incidents;
  }, [incidents, incidentTab]);

  const accountingPreview = useMemo(() => (note ? buildDeliveryNoteAccountingPreview(note, items) : null), [note, items]);

  const comparisonRows = useMemo(() => {
    if (!order) return [];
    const byMatch = new Map(items.map((i) => [i.matchedOrderItemId ?? '', i] as const));
    return order.items.map((oi) => {
      const ni = byMatch.get(oi.id);
      const qOrd = orderedQtyForUi(oi);
      const qAlb = ni ? Math.round(ni.quantity * 100) / 100 : null;
      const pOrd = oi.pricePerUnit;
      const pAlb = ni?.unitPrice ?? null;
      const deltaQty = qAlb != null ? Math.round((qAlb - qOrd) * 100) / 100 : null;
      const deltaLine =
        qAlb != null && pAlb != null ? Math.round(qAlb * pAlb * 100) / 100 - Math.round(qOrd * pOrd * 100) / 100 : null;
      return { oi, ni, qOrd, qAlb, pOrd, pAlb, deltaQty, deltaLine };
    });
  }, [order, items]);

  const mismatchCount = useMemo(() => {
    if (!order) return 0;
    return comparisonRows.filter((r) => r.ni && r.ni.matchStatus && r.ni.matchStatus !== 'matched').length;
  }, [comparisonRows, order]);

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
      const drafts: DeliveryNoteItemDraft[] = lineDrafts.map(({ _key: _k, ...d }) => d);
      const next = await replaceDeliveryNoteItems(supabase, localId, note.id, drafts);
      setItems(next);
      setLineDrafts(next.map(itemToLineDraft));
      if (note.relatedOrderId && order) {
        const matched = await recomputeDeliveryNoteLineMatching(supabase, localId, note.id, order.items);
        setItems(matched);
        setLineDrafts(matched.map(itemToLineDraft));
      }
      setBanner('Líneas guardadas.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al guardar líneas.');
    } finally {
      setBusy(false);
    }
  };

  const saveAll = async () => {
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
      const drafts: DeliveryNoteItemDraft[] = lineDrafts.map(({ _key: _k, ...d }) => d);
      const next = await replaceDeliveryNoteItems(supabase, localId, note.id, drafts);
      setItems(next);
      setLineDrafts(next.map(itemToLineDraft));
      if (note.relatedOrderId && order) {
        const matched = await recomputeDeliveryNoteLineMatching(supabase, localId, note.id, order.items);
        setItems(matched);
        setLineDrafts(matched.map(itemToLineDraft));
      }
      setBanner('Cabecera y líneas guardadas.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al guardar.');
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
      setLineDrafts(matched.map(itemToLineDraft));
      setBanner('Pedido vinculado y líneas emparejadas.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al vincular.');
    } finally {
      setBusy(false);
    }
  };

  const unlinkOrder = async () => {
    if (!localId || !note) return;
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const updated = await updateDeliveryNote(supabase, localId, note.id, { relatedOrderId: null });
      setNote(updated);
      const cleared: DeliveryNoteItemDraft[] = lineDrafts.map(({ _key: _k, ...d }) => ({
        ...d,
        matchedOrderItemId: null,
        matchStatus: 'not_applicable',
      }));
      const next = await replaceDeliveryNoteItems(supabase, localId, note.id, cleared);
      setItems(next);
      setLineDrafts(next.map(itemToLineDraft));
      setOrder(null);
      setLinkOrderId('');
      setBanner('Pedido desvinculado. Revisa líneas si hace falta.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al desvincular.');
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
        setLineDrafts(pack.items.map(itemToLineDraft));
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
      const updated = await updateDeliveryNote(supabase, localId, note.id, { status: s });
      setNote(updated);
      setBanner('Estado actualizado.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error.');
    } finally {
      setBusy(false);
    }
  };

  const confirmAlbaran = async () => {
    if (!localId || !note) return;
    if (linesDirty) {
      setBanner('Guarda las líneas antes de confirmar el albarán.');
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const pack = await fetchDeliveryNoteById(supabase, localId, id);
      if (!pack) {
        setBanner('No se pudo recargar el albarán.');
        return;
      }
      let extra = '';
      try {
        const syn = await syncCatalogPricesFromValidatedDeliveryNote(
          supabase,
          localId,
          note.id,
          pack.items,
          userId ?? null,
          { receptionDate: pack.note.deliveryDate },
        );
        if (syn.updated > 0) {
          extra = ` ${syn.updated} precio(s) de catálogo actualizado(s).`;
        }
      } catch (e: unknown) {
        extra = ` (Aviso: ${e instanceof Error ? e.message : 'precios no actualizados'}.)`;
      }
      const updated = await updateDeliveryNote(supabase, localId, note.id, {
        status: 'validated',
        validatedAt: new Date().toISOString(),
        validatedBy: userId ?? null,
      });
      setNote(updated);
      setBanner(`Albarán confirmado.${extra}`);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error.');
    } finally {
      setBusy(false);
    }
  };

  const confirmResolve = async () => {
    if (!localId || !userId || !resolveModalId) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await resolveDeliveryNoteIncident(supabase, localId, resolveModalId, userId, resolveComment);
      const pack = await fetchDeliveryNoteById(supabase, localId, id);
      if (pack) {
        setIncidents(pack.incidents);
        const refreshed = await refreshDeliveryNoteStatusFromIncidents(supabase, localId, note!.id);
        setNote(refreshed);
      }
      setResolveModalId(null);
      setResolveComment('');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error.');
    } finally {
      setBusy(false);
    }
  };

  const addManualIncident = async () => {
    if (!localId || !note || !manualIncDesc.trim()) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await insertDeliveryNoteIncident(supabase, localId, {
        deliveryNoteId: note.id,
        incidentType: manualIncType,
        description: manualIncDesc.trim(),
      });
      const refreshed = await refreshDeliveryNoteStatusFromIncidents(supabase, localId, note.id);
      setNote(refreshed);
      const pack = await fetchDeliveryNoteById(supabase, localId, id);
      if (pack) setIncidents(pack.incidents);
      setManualIncDesc('');
      setBanner('Incidencia registrada.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error.');
    } finally {
      setBusy(false);
    }
  };

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
      </div>
    );
  }

  const statusVis = deliveryNoteStatusVisual(note.status);
  const headerTotal = parseOpt(totalAmount);

  return (
    <div className="space-y-4 pb-28 sm:pb-12">
      <MermasStyleHero
        slim
        eyebrow="Albarán"
        title={supplierName || 'Detalle'}
        description={`Nº ${deliveryNoteNumber || '—'}${deliveryDate ? ` · ${new Date(`${deliveryDate}T12:00:00`).toLocaleDateString('es-ES')}` : ''}`}
      />

      <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5 ${statusVis.borderClass}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-zinc-500">Estado</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${statusVis.chipClass}`}>
                {statusVis.label}
              </span>
              {order ? (
                <span className="rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-700">Pedido vinculado</span>
              ) : (
                <span className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200">
                  Sin pedido
                </span>
              )}
              {openIncidents.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-1 text-[11px] font-black text-red-900">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {openIncidents.length} abierta{openIncidents.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
            <StatusStepper status={note.status} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
              <p className="text-[9px] font-bold uppercase text-zinc-500">Líneas</p>
              <p className="text-lg font-black tabular-nums text-zinc-900">{items.length}</p>
            </div>
            <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
              <p className="text-[9px] font-bold uppercase text-zinc-500">Total cabecera</p>
              <p className="text-lg font-black tabular-nums text-zinc-900">
                {headerTotal != null ? `${headerTotal.toFixed(2)} €` : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
              <p className="text-[9px] font-bold uppercase text-zinc-500">Σ líneas</p>
              <p className="text-lg font-black tabular-nums text-zinc-900">
                {accountingPreview?.computedLinesTotal != null ? `${accountingPreview.computedLinesTotal.toFixed(2)} €` : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
              <p className="text-[9px] font-bold uppercase text-zinc-500">Desajustes</p>
              <p className="text-lg font-black tabular-nums text-amber-800">{order ? mismatchCount : '—'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden flex-wrap gap-2 sm:flex">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveAll()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-3 text-sm font-bold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden />
          Guardar todo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirmAlbaran()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Confirmar albarán
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

      {order && linesDirty ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Hay cambios en las líneas sin guardar. La tabla <strong>pedido vs albarán</strong> usa los datos guardados; guarda
          antes de confiar en la comparación o en &quot;Generar incidencias&quot;.
        </div>
      ) : null}

      {/* Pedido vs albarán — prioridad revisión */}
      <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5 ${order ? 'ring-2 ring-sky-100' : ''}`}>
        <h2 className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-zinc-500">
          <Link2 className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
          Pedido vs albarán
        </h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <select
            value={linkOrderId}
            onChange={(e) => setLinkOrderId(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold sm:min-w-[16rem] sm:flex-1"
          >
            <option value="">— Sin pedido —</option>
            {ordersPick.slice(0, 120).map((o) => (
              <option key={o.id} value={o.id}>
                {o.supplierName} · {new Date(o.createdAt).toLocaleDateString('es-ES')} · {o.status}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !linkOrderId}
              onClick={() => void applyLinkOrder()}
              className="min-h-[44px] flex-1 rounded-xl bg-[#D32F2F] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50 sm:flex-none"
            >
              Vincular y emparejar
            </button>
            {order ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void unlinkOrder()}
                className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-bold text-zinc-800"
              >
                <Link2Off className="h-4 w-4" aria-hidden />
                Desvincular
              </button>
            ) : null}
          </div>
        </div>

        {order ? (
          <>
            <p className="mt-3 text-xs text-zinc-600">
              Cada fila: cantidades y precios del pedido frente a la línea del albarán emparejada. Los deltas ayudan a revisar
              rápido en móvil.
            </p>
            {/* Móvil: tarjetas */}
            <ul className="mt-4 space-y-3 sm:hidden">
              {comparisonRows.map(({ oi, ni, qOrd, qAlb, pOrd, pAlb, deltaQty, deltaLine }) => {
                const ms = ni?.matchStatus ?? null;
                const accent = matchRowAccent(ms);
                return (
                  <li key={oi.id} className={`rounded-2xl p-3 ring-1 ${accent}`}>
                    <p className="text-sm font-bold text-zinc-900">{oi.productName}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="font-bold text-zinc-500">Pedido</p>
                        <p className="tabular-nums text-zinc-800">
                          {qOrd} {oi.unit} × {pOrd.toFixed(2)} €
                        </p>
                        <p className="text-[10px] text-zinc-500">{(qOrd * pOrd).toFixed(2)} € línea</p>
                      </div>
                      <div>
                        <p className="font-bold text-zinc-500">Albarán</p>
                        {ni ? (
                          <>
                            <p className="tabular-nums text-zinc-800">
                              {qAlb} {ni.unit} × {pAlb != null ? `${pAlb.toFixed(2)}` : '—'} €
                            </p>
                            <p className="text-[10px] text-zinc-500">
                              {pAlb != null && qAlb != null ? `${(qAlb * pAlb).toFixed(2)} € línea` : '—'}
                            </p>
                          </>
                        ) : (
                          <p className="text-amber-800">Sin línea emparejada</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {deltaQty != null && Math.abs(deltaQty) > 0.001 ? (
                        <span
                          className={[
                            'rounded-full px-2 py-0.5 text-[10px] font-black',
                            deltaQty > 0 ? 'bg-sky-100 text-sky-900' : 'bg-orange-100 text-orange-900',
                          ].join(' ')}
                        >
                          Δ cantidad {deltaQty > 0 ? '+' : ''}
                          {deltaQty}
                        </span>
                      ) : ni ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-900">
                          Cantidad OK
                        </span>
                      ) : null}
                      {deltaLine != null && Math.abs(deltaLine) > 0.02 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-950">
                          Δ importe {deltaLine > 0 ? '+' : ''}
                          {deltaLine.toFixed(2)} €
                        </span>
                      ) : null}
                      {ms ? (
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-zinc-800 ring-1 ring-zinc-200">
                          {MATCH_STATUS_LABEL[ms]}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {/* Escritorio: tabla */}
            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-zinc-100 sm:block">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-zinc-50 text-[10px] font-black uppercase text-zinc-500">
                  <tr>
                    <th className="px-2 py-2">Producto</th>
                    <th className="px-2 py-2">Pedido</th>
                    <th className="px-2 py-2">Albarán</th>
                    <th className="px-2 py-2">Δ cant.</th>
                    <th className="px-2 py-2">Δ € línea</th>
                    <th className="px-2 py-2">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map(({ oi, ni, qOrd, qAlb, pOrd, pAlb, deltaQty, deltaLine }) => {
                    const ms = ni?.matchStatus ?? null;
                    return (
                      <tr key={oi.id} className={`border-t border-zinc-100 ${ms ? matchRowAccent(ms) : ''}`}>
                        <td className="px-2 py-2 font-medium text-zinc-900">
                          {orderLineDisplayName(oi, catalogNameByProductId)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-zinc-700">
                          {qOrd} {oi.unit} × {pOrd.toFixed(2)} €
                        </td>
                        <td className="px-2 py-2 tabular-nums text-zinc-700">
                          {ni ? (
                            <>
                              {qAlb} {ni.unit} × {pAlb != null ? pAlb.toFixed(2) : '—'} €
                            </>
                          ) : (
                            <span className="font-bold text-amber-800">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 tabular-nums font-semibold text-zinc-800">
                          {deltaQty != null && Math.abs(deltaQty) > 0.001 ? (
                            <span className={deltaQty > 0 ? 'text-sky-800' : 'text-orange-800'}>
                              {deltaQty > 0 ? '+' : ''}
                              {deltaQty}
                            </span>
                          ) : ni ? (
                            '0'
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-2 py-2 tabular-nums font-semibold text-zinc-800">
                          {deltaLine != null && Math.abs(deltaLine) > 0.02 ? (
                            <span className={deltaLine > 0 ? 'text-amber-900' : 'text-orange-900'}>
                              {deltaLine > 0 ? '+' : ''}
                              {deltaLine.toFixed(2)}
                            </span>
                          ) : ni && pAlb != null ? (
                            '0'
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {ms ? <span className="font-bold text-zinc-800">{MATCH_STATUS_LABEL[ms]}</span> : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              disabled={busy || linesDirty}
              onClick={() => void runCompareIncidents()}
              title={linesDirty ? 'Guarda las líneas antes' : undefined}
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 disabled:opacity-50"
            >
              <FileWarning className="h-4 w-4" aria-hidden />
              Generar incidencias desde diferencias
            </button>
          </>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Vincula un pedido enviado o recibido para ver la comparación línea a línea.</p>
        )}
      </section>

      {/* Líneas */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Líneas del albarán</h2>
          {linesDirty ? (
            <span className="text-[11px] font-black uppercase text-amber-800">Borrador · sin guardar</span>
          ) : (
            <span className="text-[11px] font-bold text-emerald-700">Guardado</span>
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Revisa y corrige producto, cantidad y precio antes de guardar. El OCR puede fallar: puedes editar o añadir líneas a
          mano.
        </p>
        <div className="mt-3 hidden overflow-x-auto rounded-xl border border-zinc-100 sm:block">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-zinc-50 text-[10px] font-black uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Producto</th>
                <th className="px-2 py-2">Cant.</th>
                <th className="px-2 py-2">Ud</th>
                <th className="px-2 py-2">€ / ud</th>
                <th className="px-2 py-2">Match</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lineDrafts.map((row, idx) => {
                const savedMatch = row.matchStatus as DeliveryNoteItemMatchStatus | null | undefined;
                return (
                  <tr key={row._key} className="border-t border-zinc-100">
                    <td className="px-2 py-2 align-top">
                      <input
                        value={row.supplierProductName}
                        onChange={(e) =>
                          setLineDrafts((d) => d.map((x, i) => (i === idx ? { ...x, supplierProductName: e.target.value } : x)))
                        }
                        className="min-h-[40px] w-full min-w-[140px] rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                        placeholder="Producto"
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        value={String(row.quantity)}
                        onChange={(e) =>
                          setLineDrafts((d) =>
                            d.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value.replace(',', '.')) || 0 } : x)),
                          )
                        }
                        className="min-h-[40px] w-20 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm tabular-nums"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <select
                        value={row.unit}
                        onChange={(e) =>
                          setLineDrafts((d) => d.map((x, i) => (i === idx ? { ...x, unit: e.target.value as Unit } : x)))
                        }
                        className="min-h-[40px] rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                      >
                        {UNITS.map((u) => (
                          <option key={u.v} value={u.v}>
                            {u.l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        value={row.unitPrice != null ? String(row.unitPrice) : ''}
                        onChange={(e) =>
                          setLineDrafts((d) =>
                            d.map((x, i) => {
                              const t = e.target.value.trim();
                              return i === idx ? { ...x, unitPrice: t === '' ? null : Number(t.replace(',', '.')) } : x;
                            }),
                          )
                        }
                        className="min-h-[40px] w-24 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm tabular-nums"
                        placeholder="€"
                      />
                    </td>
                    <td className="px-2 py-2 align-middle text-[10px] font-bold text-zinc-600">
                      {savedMatch && savedMatch !== 'not_applicable' ? MATCH_STATUS_LABEL[savedMatch] : '—'}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => setLineDrafts((d) => d.filter((_, i) => i !== idx))}
                        className="text-[11px] font-bold text-red-700"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-3 sm:hidden">
          {lineDrafts.map((row, idx) => {
            const savedMatch = row.matchStatus as DeliveryNoteItemMatchStatus | null | undefined;
            return (
              <div
                key={row._key}
                className={`rounded-xl p-3 ring-1 ${savedMatch && savedMatch !== 'not_applicable' ? matchRowAccent(savedMatch) : 'ring-zinc-200'}`}
              >
                <div className="grid gap-2 sm:grid-cols-12">
                  <input
                    value={row.supplierProductName}
                    onChange={(e) =>
                      setLineDrafts((d) => d.map((x, i) => (i === idx ? { ...x, supplierProductName: e.target.value } : x)))
                    }
                    className="min-h-[44px] sm:col-span-5 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Producto"
                  />
                  <input
                    value={String(row.quantity)}
                    onChange={(e) =>
                      setLineDrafts((d) =>
                        d.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value.replace(',', '.')) || 0 } : x)),
                      )
                    }
                    className="min-h-[44px] sm:col-span-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
                    inputMode="decimal"
                  />
                  <select
                    value={row.unit}
                    onChange={(e) =>
                      setLineDrafts((d) => d.map((x, i) => (i === idx ? { ...x, unit: e.target.value as Unit } : x)))
                    }
                    className="min-h-[44px] sm:col-span-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
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
                          return i === idx ? { ...x, unitPrice: t === '' ? null : Number(t.replace(',', '.')) } : x;
                        }),
                      )
                    }
                    className="min-h-[44px] sm:col-span-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
                    placeholder="€/ud"
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {savedMatch && savedMatch !== 'not_applicable' ? (
                    <span className="text-[10px] font-bold text-zinc-600">Match: {MATCH_STATUS_LABEL[savedMatch]}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setLineDrafts((d) => d.filter((_, i) => i !== idx))}
                    className="text-[11px] font-bold text-red-700"
                  >
                    Quitar línea
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setLineDrafts((d) => [...d, newEmptyLine()])}
          className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#D32F2F]"
        >
          <PlusCircle className="h-4 w-4" aria-hidden />
          Añadir línea
        </button>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveLines()}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white py-3 text-sm font-black text-zinc-900 disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            Solo líneas
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveAll()}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            Guardar cabecera + líneas
          </button>
        </div>
      </section>

      {/* Incidencias */}
      <section className="rounded-2xl border border-red-100 bg-red-50/50 p-4 shadow-sm ring-1 ring-red-100/80 sm:p-5">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-red-900">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Incidencias
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ['open', 'Abiertas', openIncidents.length],
              ['resolved', 'Resueltas', incidents.filter((i) => i.status === 'resolved').length],
              ['all', 'Todas', incidents.length],
            ] as const
          ).map(([key, lab, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setIncidentTab(key)}
              className={[
                'min-h-[40px] rounded-xl px-3 py-2 text-xs font-black uppercase',
                incidentTab === key ? 'bg-red-600 text-white shadow' : 'bg-white text-red-900 ring-1 ring-red-200',
              ].join(' ')}
            >
              {lab} ({count})
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-white p-3 ring-1 ring-red-100 sm:p-4">
          <p className="text-[10px] font-black uppercase text-zinc-500">Nueva incidencia manual</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select
              value={manualIncType}
              onChange={(e) => setManualIncType(e.target.value as DeliveryNoteIncidentType)}
              className="min-h-[44px] rounded-lg border border-zinc-200 px-3 text-sm"
            >
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DELIVERY_NOTE_INCIDENT_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              value={manualIncDesc}
              onChange={(e) => setManualIncDesc(e.target.value)}
              placeholder="Descripción breve"
              className="min-h-[44px] rounded-lg border border-zinc-200 px-3 text-sm sm:col-span-2"
            />
          </div>
          <button
            type="button"
            disabled={busy || !manualIncDesc.trim()}
            onClick={() => void addManualIncident()}
            className="mt-2 min-h-[44px] rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            Registrar
          </button>
        </div>

        {filteredIncidents.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600">No hay incidencias en esta vista.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {filteredIncidents.map((inc) => (
              <li
                key={inc.id}
                className={[
                  'rounded-xl p-3 ring-1',
                  inc.status === 'open' ? 'bg-white ring-red-200' : 'bg-zinc-50/80 ring-zinc-200',
                ].join(' ')}
              >
                <p className="text-[10px] font-black uppercase text-red-800">{DELIVERY_NOTE_INCIDENT_LABEL[inc.incidentType]}</p>
                <p className="mt-1 text-sm text-zinc-800">{inc.description}</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {inc.status === 'open' ? (
                    <span className="font-bold text-red-700">Abierta</span>
                  ) : (
                    <span className="font-bold text-emerald-700">Resuelta</span>
                  )}
                  {inc.resolutionComment ? ` · ${inc.resolutionComment}` : ''}
                </p>
                {inc.status === 'open' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setResolveModalId(inc.id);
                      setResolveComment('');
                    }}
                    className="mt-2 inline-flex min-h-[40px] items-center gap-1 text-xs font-bold text-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Marcar resuelta…
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cabecera — colapsable en móvil */}
      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
        <button
          type="button"
          onClick={() => setHeaderExpanded((v) => !v)}
          className="flex w-full min-h-[48px] items-center justify-between gap-2 p-4 text-left sm:pointer-events-none sm:min-h-0 sm:cursor-default sm:p-5 sm:pb-0"
        >
          <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Cabecera e importes</h2>
          <ChevronDown
            className={`h-5 w-5 text-zinc-400 transition sm:hidden ${headerExpanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        <div className={`px-4 pb-4 sm:block ${headerExpanded ? 'block' : 'hidden'} sm:p-5 sm:pt-3`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-zinc-500">Proveedor</label>
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500">Nº albarán</label>
              <input
                value={deliveryNoteNumber}
                onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500">Fecha</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500">Subtotal</label>
              <input
                value={subtotal}
                onChange={(e) => setSubtotal(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500">IVA</label>
              <input
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500">Total</label>
              <input
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
                inputMode="decimal"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-zinc-500">Observaciones</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveHeader()}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            Guardar solo cabecera
          </button>
        </div>
      </section>

      {/* Contabilidad / informes (vista previa) */}
      {accountingPreview ? (
        <details className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-black uppercase text-zinc-600">
            <Calculator className="h-4 w-4" aria-hidden />
            Datos para informes contables (vista previa)
          </summary>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-bold uppercase text-zinc-500">Periodo (mes entrega)</dt>
              <dd className="font-mono font-semibold text-zinc-900">{accountingPreview.bookkeepingMonth ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-zinc-500">Moneda</dt>
              <dd className="font-semibold text-zinc-900">{accountingPreview.currency}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-zinc-500">Total cabecera</dt>
              <dd className="tabular-nums font-semibold text-zinc-900">
                {accountingPreview.headerTotal != null ? `${accountingPreview.headerTotal.toFixed(2)}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-zinc-500">Suma líneas (qty × precio)</dt>
              <dd className="tabular-nums font-semibold text-zinc-900">
                {accountingPreview.computedLinesTotal != null ? `${accountingPreview.computedLinesTotal.toFixed(2)}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-zinc-500">Estado</dt>
              <dd className="font-semibold text-zinc-900">{DELIVERY_NOTE_STATUS_LABEL[accountingPreview.status]}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-zinc-500">Pedido relacionado</dt>
              <dd className="font-mono text-xs font-semibold text-zinc-900">{accountingPreview.relatedOrderId ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-zinc-500">
            Estructura pensada para exportación CSV/PDF futura: clave de mes, importes de cabecera vs suma de líneas, vínculo a
            pedido.
          </p>
        </details>
      ) : null}

      {/* Documento — menos scroll en móvil */}
      <details className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 open:ring-sky-200" open={false}>
        <summary className="cursor-pointer text-xs font-black uppercase text-zinc-500">Documento original</summary>
        {docUrl ? (
          <div className="mt-3 space-y-2">
            <a href={docUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#D32F2F] underline">
              Abrir en pestaña nueva
            </a>
            {note.originalMimeType?.includes('pdf') ? (
              <iframe title="PDF" src={docUrl} className="mt-2 h-[min(55vh,480px)] w-full rounded-xl border border-zinc-200 sm:h-[min(70vh,520px)]" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={docUrl} alt="Albarán" className="mt-2 max-h-[360px] w-full rounded-xl border border-zinc-200 object-contain sm:max-h-[480px]" />
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">Sin archivo.</p>
        )}
      </details>

      {ocrPreview ? (
        <details className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <summary className="cursor-pointer text-xs font-bold text-zinc-600">Texto OCR (referencia)</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-zinc-700">{ocrPreview}</pre>
        </details>
      ) : null}

      {/* Barra fija móvil */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-2 border-t border-zinc-200 bg-white/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveAll()}
          className="h-12 flex-1 rounded-xl bg-zinc-900 text-sm font-black text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirmAlbaran()}
          className="h-12 flex-1 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50"
        >
          Confirmar
        </button>
      </div>

      {resolveModalId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <p className="text-sm font-bold text-zinc-900">Resolver incidencia</p>
            <p className="mt-1 text-xs text-zinc-600">Comentario (opcional). Quedará guardado en el historial.</p>
            <textarea
              value={resolveComment}
              onChange={(e) => setResolveComment(e.target.value)}
              rows={3}
              className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Ej.: Aceptada diferencia de peso…"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setResolveModalId(null);
                  setResolveComment('');
                }}
                className="h-11 flex-1 rounded-xl border border-zinc-200 text-sm font-bold text-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmResolve()}
                className="h-11 flex-1 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
