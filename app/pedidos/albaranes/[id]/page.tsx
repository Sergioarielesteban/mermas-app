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

function KpiCell({
  label,
  value,
  tone = 'zinc',
}: {
  label: string;
  value: string;
  tone?: 'zinc' | 'amber';
}) {
  const toneClasses =
    tone === 'amber'
      ? 'bg-amber-50 ring-amber-200 text-amber-900'
      : 'bg-zinc-50 ring-zinc-200 text-zinc-900';
  return (
    <div className={`rounded-2xl px-2.5 py-2 ring-1 ${toneClasses}`}>
      <p className="text-[9.5px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-[15px] font-black tabular-nums leading-tight">{value}</p>
    </div>
  );
}

function KvRow({
  label,
  value,
  mono,
  num,
}: {
  label: string;
  value: string;
  mono?: boolean;
  num?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200">
      <dt className="text-[10.5px] font-bold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd
        className={[
          'text-[12.5px] font-semibold text-zinc-900',
          mono ? 'font-mono' : '',
          num ? 'tabular-nums' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
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
  const linesSum = accountingPreview?.computedLinesTotal ?? null;
  const isClosed = note.status === 'validated' || note.status === 'archived';
  const showStepper = !isClosed;

  // Próxima acción sugerida — un único CTA según el estado real.
  type NextAction =
    | { kind: 'save'; label: string }
    | { kind: 'confirm'; label: string }
    | { kind: 'link'; label: string }
    | { kind: 'review-lines'; label: string }
    | { kind: 'incidents'; label: string }
    | { kind: 'none'; label: string };

  const nextAction: NextAction = (() => {
    if (note.status === 'validated') return { kind: 'none', label: 'Albarán validado' };
    if (note.status === 'archived') return { kind: 'none', label: 'Albarán archivado' };
    if (linesDirty) return { kind: 'save', label: 'Guardar cambios' };
    if (openIncidents.length > 0)
      return { kind: 'incidents', label: `Resolver ${openIncidents.length} incidencia${openIncidents.length === 1 ? '' : 's'}` };
    if (!order) return { kind: 'link', label: 'Vincular con un pedido' };
    if (items.length === 0) return { kind: 'review-lines', label: 'Revisa o añade líneas' };
    return { kind: 'confirm', label: 'Confirmar albarán' };
  })();

  return (
    <div className="space-y-4 pb-28 sm:pb-12">
      {/* HEADER COMPACTO */}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Albarán</p>
          <h1 className="truncate text-[22px] font-black leading-tight text-zinc-900">
            {supplierName || 'Detalle'}
          </h1>
          <p className="mt-0.5 truncate text-[11.5px] text-zinc-500">
            Nº <span className="font-mono">{deliveryNoteNumber || '—'}</span>
            {deliveryDate
              ? ` · ${new Date(`${deliveryDate}T12:00:00`).toLocaleDateString('es-ES')}`
              : ''}
          </p>
        </div>
        <Link
          href="/pedidos/albaranes"
          className="shrink-0 text-[12px] font-semibold text-zinc-500 hover:text-zinc-900"
        >
          ← Bandeja
        </Link>
      </header>

      {/* HERO DE ESTADO */}
      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-[10.5px] font-black uppercase tracking-wide ${statusVis.chipClass}`}
          >
            {statusVis.label}
          </span>
          {order ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[10.5px] font-black text-sky-900 ring-1 ring-sky-200">
              <Link2 className="h-3 w-3" aria-hidden /> Pedido vinculado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-black text-amber-900 ring-1 ring-amber-200">
              <Link2Off className="h-3 w-3" aria-hidden /> Sin pedido
            </span>
          )}
          {openIncidents.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10.5px] font-black text-red-800 ring-1 ring-red-200">
              <AlertTriangle className="h-3 w-3" aria-hidden /> {openIncidents.length} incidencia
              {openIncidents.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {showStepper ? <StatusStepper status={note.status} /> : null}

        {/* KPI strip horizontal */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <KpiCell label="Líneas" value={String(items.length)} />
          <KpiCell
            label="Total"
            value={headerTotal != null ? `${headerTotal.toFixed(2)} €` : '—'}
          />
          <KpiCell
            label="Σ líneas"
            value={linesSum != null ? `${linesSum.toFixed(2)} €` : '—'}
          />
          <KpiCell
            label="Desajustes"
            value={order ? String(mismatchCount) : '—'}
            tone={order && mismatchCount > 0 ? 'amber' : 'zinc'}
          />
        </div>

        {/* Próxima acción */}
        {nextAction.kind !== 'none' ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11.5px] font-semibold text-zinc-500">
              Próximo paso ·{' '}
              <span className="text-zinc-800">{nextAction.label}</span>
            </p>
            <div className="flex gap-2">
              {nextAction.kind === 'save' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveAll()}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl bg-zinc-900 px-4 text-[13px] font-black text-white shadow-md disabled:opacity-50"
                >
                  <Save className="h-4 w-4" aria-hidden /> Guardar cambios
                </button>
              ) : null}
              {nextAction.kind === 'confirm' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmAlbaran()}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl bg-emerald-600 px-4 text-[13px] font-black text-white shadow-md disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Confirmar
                </button>
              ) : null}
              {nextAction.kind === 'link' ? (
                <a
                  href="#vincular"
                  className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#D32F2F] px-4 text-[13px] font-black text-white shadow-md"
                >
                  <Link2 className="h-4 w-4" aria-hidden /> Vincular
                </a>
              ) : null}
              {nextAction.kind === 'incidents' ? (
                <a
                  href="#incidencias"
                  className="inline-flex h-10 items-center gap-2 rounded-2xl bg-red-600 px-4 text-[13px] font-black text-white shadow-md"
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden /> Revisar
                </a>
              ) : null}
              {nextAction.kind === 'review-lines' ? (
                <a
                  href="#lineas"
                  className="inline-flex h-10 items-center gap-2 rounded-2xl bg-zinc-900 px-4 text-[13px] font-black text-white shadow-md"
                >
                  <PlusCircle className="h-4 w-4" aria-hidden /> Líneas
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-[11.5px] font-semibold text-emerald-700">{nextAction.label}</p>
            {note.status === 'validated' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setStatus('archived')}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[12px] font-bold text-zinc-700"
              >
                <Archive className="h-3.5 w-3.5" aria-hidden /> Archivar
              </button>
            ) : null}
          </div>
        )}
      </section>

      {banner ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-zinc-800 shadow-sm">
          {banner}
        </div>
      ) : null}

      {order && linesDirty ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-950">
          Hay cambios en las líneas sin guardar. La comparación contra el pedido se basa en lo guardado — guarda antes de
          confiar en los desajustes o en &quot;Generar incidencias&quot;.
        </div>
      ) : null}

      {/* Pedido vs albarán */}
      <section
        id="vincular"
        className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div
            className={[
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1',
              order
                ? 'bg-sky-50 text-sky-700 ring-sky-200'
                : 'bg-zinc-100 text-zinc-500 ring-zinc-200',
            ].join(' ')}
          >
            <Link2 className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-black text-zinc-900">Pedido vs albarán</h2>
            <p className="text-[12px] text-zinc-500">
              {order
                ? 'Comparación línea a línea con el pedido vinculado.'
                : 'Vincula con un pedido para detectar diferencias automáticamente.'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <select
            value={linkOrderId}
            onChange={(e) => setLinkOrderId(e.target.value)}
            className="min-h-[44px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-[13.5px] font-semibold sm:min-w-[16rem] sm:flex-1"
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
              className="min-h-[44px] flex-1 rounded-2xl bg-[#D32F2F] px-4 text-[13px] font-black text-white shadow-md disabled:opacity-50 sm:flex-none"
            >
              {order ? 'Re-emparejar' : 'Vincular y emparejar'}
            </button>
            {order ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void unlinkOrder()}
                className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-2xl border border-zinc-200 bg-white px-3 text-[13px] font-bold text-zinc-700"
              >
                <Link2Off className="h-4 w-4" aria-hidden />
                Desvincular
              </button>
            ) : null}
          </div>
        </div>

        {order ? (
          <>
            <p className="mt-3 text-[11.5px] text-zinc-500">
              Cada fila: cantidades y precios del pedido frente a la línea del albarán emparejada.
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
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 text-[12.5px] font-black text-amber-950 disabled:opacity-50"
            >
              <FileWarning className="h-4 w-4" aria-hidden />
              Generar incidencias desde diferencias
            </button>
          </>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 px-3 py-4 text-center">
            <p className="text-[12.5px] text-zinc-600">
              Sin pedido vinculado · la comparación aparecerá aquí cuando emparejes el albarán con un pedido.
            </p>
          </div>
        )}
      </section>

      {/* Líneas */}
      <section
        id="lineas"
        className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-zinc-900">Líneas del albarán</h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              {items.length} línea{items.length === 1 ? '' : 's'} · revisa producto, cantidad y precio.
            </p>
          </div>
          {linesDirty ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
              Sin guardar
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200">
              Guardado
            </span>
          )}
        </div>
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
          className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-2xl border border-dashed border-zinc-300 bg-white px-3 text-[13px] font-black text-[#D32F2F]"
        >
          <PlusCircle className="h-4 w-4" aria-hidden />
          Añadir línea
        </button>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy || !linesDirty}
            onClick={() => void saveAll()}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 text-[13.5px] font-black text-white shadow-md disabled:opacity-40"
          >
            <Save className="h-4 w-4" aria-hidden />
            Guardar cambios
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveLines()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-[12.5px] font-bold text-zinc-700"
            title="Guarda solo las líneas, sin tocar la cabecera"
          >
            Solo líneas
          </button>
        </div>
      </section>

      {/* Incidencias */}
      <section
        id="incidencias"
        className={[
          'rounded-3xl border p-4 shadow-sm sm:p-5',
          openIncidents.length > 0
            ? 'border-red-200 bg-red-50/40'
            : 'border-zinc-200 bg-white',
        ].join(' ')}
      >
        <div className="flex items-start gap-3">
          <div
            className={[
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1',
              openIncidents.length > 0
                ? 'bg-red-100 text-red-700 ring-red-200'
                : incidents.length > 0
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : 'bg-zinc-100 text-zinc-500 ring-zinc-200',
            ].join(' ')}
          >
            {openIncidents.length > 0 ? (
              <AlertTriangle className="h-5 w-5" aria-hidden />
            ) : incidents.length > 0 ? (
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            ) : (
              <ShieldCheck className="h-5 w-5" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-black text-zinc-900">Incidencias</h2>
            <p className="text-[12px] text-zinc-500">
              {openIncidents.length === 0
                ? incidents.length === 0
                  ? 'Sin incidencias detectadas.'
                  : `${incidents.length} resueltas · todo en orden.`
                : `${openIncidents.length} abiertas · ${incidents.length - openIncidents.length} resueltas`}
            </p>
          </div>
        </div>

        {incidents.length > 0 ? (
          <div className="mt-3 inline-flex overflow-hidden rounded-2xl border border-zinc-200 bg-white p-0.5">
            {(
              [
                ['open', 'Abiertas', openIncidents.length],
                ['resolved', 'Resueltas', incidents.filter((i) => i.status === 'resolved').length],
                ['all', 'Todas', incidents.length],
              ] as const
            ).map(([key, lab, count]) => {
              const active = incidentTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIncidentTab(key)}
                  className={[
                    'rounded-xl px-3 py-1.5 text-[11.5px] font-black uppercase tracking-wide transition',
                    active ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500',
                  ].join(' ')}
                >
                  {lab} <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {filteredIncidents.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-zinc-500">
            {incidents.length === 0
              ? 'No se han generado incidencias en este albarán.'
              : 'No hay incidencias en esta vista.'}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {filteredIncidents.map((inc) => (
              <li
                key={inc.id}
                className={[
                  'rounded-2xl p-3 ring-1',
                  inc.status === 'open' ? 'bg-white ring-red-200' : 'bg-white ring-zinc-200',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                    {DELIVERY_NOTE_INCIDENT_LABEL[inc.incidentType]}
                  </p>
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wide',
                      inc.status === 'open'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-emerald-50 text-emerald-800',
                    ].join(' ')}
                  >
                    {inc.status === 'open' ? 'Abierta' : 'Resuelta'}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-zinc-800">{inc.description}</p>
                {inc.resolutionComment ? (
                  <p className="mt-1 text-[11px] text-zinc-500">{inc.resolutionComment}</p>
                ) : null}
                {inc.status === 'open' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setResolveModalId(inc.id);
                      setResolveComment('');
                    }}
                    className="mt-2 inline-flex h-8 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-[11px] font-black text-emerald-800 ring-1 ring-emerald-200"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Marcar resuelta
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* Nueva incidencia manual — siempre disponible, en bloque secundario */}
        <details className="mt-4 group rounded-2xl border border-dashed border-zinc-300 bg-white p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[12px] font-black uppercase tracking-wide text-zinc-600">
            Añadir incidencia manual
            <ChevronDown
              className="h-4 w-4 text-zinc-400 transition group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={manualIncType}
              onChange={(e) => setManualIncType(e.target.value as DeliveryNoteIncidentType)}
              className="min-h-[44px] rounded-xl border border-zinc-200 px-3 text-[13px] sm:col-span-2"
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
              placeholder="Descripción breve…"
              className="min-h-[44px] rounded-xl border border-zinc-200 px-3 text-[13px] sm:col-span-2"
            />
          </div>
          <button
            type="button"
            disabled={busy || !manualIncDesc.trim()}
            onClick={() => void addManualIncident()}
            className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl bg-red-600 px-4 text-[12.5px] font-black text-white shadow-md disabled:opacity-40"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Registrar
          </button>
        </details>
      </section>

      {/* Cabecera e importes */}
      <details
        className="group rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm open:shadow-md sm:p-5"
        open={headerExpanded}
        onToggle={(e) => setHeaderExpanded((e.target as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-zinc-900">Cabecera e importes</h2>
            <p className="text-[12px] text-zinc-500">Proveedor, número, fecha y totales.</p>
          </div>
          <ChevronDown
            className="h-5 w-5 text-zinc-400 transition group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Proveedor</label>
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13.5px]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Nº albarán</label>
            <input
              value={deliveryNoteNumber}
              onChange={(e) => setDeliveryNoteNumber(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13.5px] font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Fecha</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13.5px]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Subtotal</label>
            <input
              value={subtotal}
              onChange={(e) => setSubtotal(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13.5px] tabular-nums"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">IVA</label>
            <input
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13.5px] tabular-nums"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Total</label>
            <input
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13.5px] tabular-nums"
              inputMode="decimal"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Observaciones</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13.5px]"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveHeader()}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-zinc-900 px-4 text-[13px] font-black text-white shadow-md disabled:opacity-40"
        >
          <Save className="h-4 w-4" aria-hidden />
          Guardar cabecera
        </button>
      </details>

      {/* Documento original */}
      <details className="group rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm open:shadow-md sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-zinc-900">Documento original</h2>
            <p className="text-[12px] text-zinc-500">PDF o imagen subida del albarán.</p>
          </div>
          <ChevronDown
            className="h-5 w-5 text-zinc-400 transition group-open:rotate-180"
            aria-hidden
          />
        </summary>
        {docUrl ? (
          <div className="mt-3 space-y-2">
            <a
              href={docUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#D32F2F]/10 px-3 text-[12px] font-black text-[#D32F2F] ring-1 ring-[#D32F2F]/20"
            >
              Abrir en pestaña nueva
            </a>
            {note.originalMimeType?.includes('pdf') ? (
              <iframe
                title="PDF"
                src={docUrl}
                className="mt-2 h-[min(55vh,480px)] w-full rounded-2xl border border-zinc-200 sm:h-[min(70vh,520px)]"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={docUrl}
                alt="Albarán"
                className="mt-2 max-h-[360px] w-full rounded-2xl border border-zinc-200 object-contain sm:max-h-[480px]"
              />
            )}
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] text-zinc-500">Sin archivo adjunto.</p>
        )}
      </details>

      {/* Datos contables — sólo si hay preview */}
      {accountingPreview ? (
        <details className="group rounded-3xl border border-zinc-200 bg-zinc-50/60 p-4 shadow-sm open:bg-white open:shadow-md sm:p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Calculator className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <h2 className="text-[14px] font-black text-zinc-700">Datos para informes contables</h2>
            </div>
            <ChevronDown
              className="h-5 w-5 text-zinc-400 transition group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
            <KvRow label="Periodo (mes entrega)" value={accountingPreview.bookkeepingMonth ?? '—'} mono />
            <KvRow label="Moneda" value={accountingPreview.currency} />
            <KvRow
              label="Total cabecera"
              value={
                accountingPreview.headerTotal != null
                  ? `${accountingPreview.headerTotal.toFixed(2)}`
                  : '—'
              }
              num
            />
            <KvRow
              label="Suma líneas"
              value={
                accountingPreview.computedLinesTotal != null
                  ? `${accountingPreview.computedLinesTotal.toFixed(2)}`
                  : '—'
              }
              num
            />
            <KvRow label="Estado" value={DELIVERY_NOTE_STATUS_LABEL[accountingPreview.status]} />
            <KvRow label="Pedido relacionado" value={accountingPreview.relatedOrderId ?? '—'} mono />
          </dl>
          <p className="mt-2 text-[10.5px] text-zinc-500">
            Estructura pensada para exportación CSV/PDF: clave de mes, importes y vínculo a pedido.
          </p>
        </details>
      ) : null}

      {ocrPreview ? (
        <details className="group rounded-3xl border border-zinc-200 bg-zinc-50/60 p-4 shadow-sm open:bg-white sm:p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <h2 className="text-[13px] font-black text-zinc-600">Texto OCR (referencia)</h2>
            <ChevronDown
              className="h-5 w-5 text-zinc-400 transition group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[11px] text-zinc-700 ring-1 ring-zinc-200">
            {ocrPreview}
          </pre>
        </details>
      ) : null}

      {/* Barra fija móvil + escritorio compacto */}
      {!isClosed ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-2 border-t border-zinc-200 bg-white/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur">
          <button
            type="button"
            disabled={busy || !linesDirty}
            onClick={() => void saveAll()}
            className="h-12 flex-1 rounded-2xl bg-zinc-900 text-[13.5px] font-black text-white shadow-md disabled:opacity-30"
          >
            {linesDirty ? 'Guardar' : 'Sin cambios'}
          </button>
          <button
            type="button"
            disabled={busy || linesDirty}
            onClick={() => void confirmAlbaran()}
            className="h-12 flex-1 rounded-2xl bg-emerald-600 text-[13.5px] font-black text-white shadow-md disabled:opacity-30"
            title={linesDirty ? 'Guarda los cambios antes' : undefined}
          >
            Confirmar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setStatus('archived')}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-600 shadow-sm"
            aria-label="Archivar"
            title="Archivar"
          >
            <Archive className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-2 border-t border-zinc-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur">
          <p className="text-[12.5px] font-semibold text-zinc-700">
            {note.status === 'validated' ? 'Albarán validado' : 'Albarán archivado'}
          </p>
          <Link
            href="/pedidos/albaranes"
            className="inline-flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-4 text-[12.5px] font-black text-zinc-700"
          >
            Volver a bandeja
          </Link>
        </div>
      )}

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
