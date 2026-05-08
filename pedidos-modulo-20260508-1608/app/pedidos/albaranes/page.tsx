'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  FileText,
  Paperclip,
  Plus,
  Search,
} from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { deliveryNoteStatusVisual } from '@/lib/delivery-notes-ui';
import {
  DELIVERY_NOTE_STATUS_LABEL,
  fetchDeliveryNotesList,
  type DeliveryNoteListEntry,
  type DeliveryNoteStatus,
} from '@/lib/delivery-notes-supabase';

const STATUSES: (DeliveryNoteStatus | 'all')[] = [
  'all',
  'draft',
  'ocr_read',
  'pending_review',
  'validated',
  'with_incidents',
  'archived',
];

export default function PedidosAlbaranesPage() {
  const { localCode, localName, localId, email, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [rows, setRows] = useState<DeliveryNoteListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DeliveryNoteStatus | 'all'>('all');
  const [supplierQ, setSupplierQ] = useState('');
  const [onlyIncidents, setOnlyIncidents] = useState<'all' | 'yes' | 'no'>('all');
  const [onlyLinked, setOnlyLinked] = useState<'all' | 'yes' | 'no'>('all');

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setBanner(null);
    try {
      const list = await fetchDeliveryNotesList(getSupabaseClient()!, localId);
      setRows(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar albaranes.';
      if (msg.includes('does not exist')) {
        setBanner('Ejecuta en Supabase: supabase-pedidos-delivery-notes.sql');
      } else {
        setBanner(msg);
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const filtered = useMemo(() => {
    const sq = supplierQ.trim().toLowerCase();
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (onlyIncidents === 'yes' && !r.hasOpenIncidents) return false;
      if (onlyIncidents === 'no' && r.hasOpenIncidents) return false;
      if (onlyLinked === 'yes' && !r.relatedOrderId) return false;
      if (onlyLinked === 'no' && r.relatedOrderId) return false;
      if (sq && !r.supplierName.toLowerCase().includes(sq)) return false;
      if (qq) {
        const blob = [
          r.deliveryNoteNumber,
          r.supplierName,
          r.relatedOrderId ?? '',
          r.notes,
        ]
          .join(' ')
          .toLowerCase();
        if (!blob.includes(qq)) return false;
      }
      return true;
    });
  }, [rows, status, supplierQ, q, onlyIncidents, onlyLinked]);

  const sumTotal = useMemo(
    () =>
      filtered.reduce((acc, r) => {
        const t = r.totalAmount;
        return acc + (t != null && Number.isFinite(t) ? t : 0);
      }, 0),
    [filtered],
  );

  if (!profileReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando…</p>
      </section>
    );
  }

  if (!hasPedidosEntry) {
    return <PedidosPremiaLockedScreen />;
  }

  if (!canUse || !localId || !supabaseOk) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Albaranes no disponibles en esta sesión.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero
        slim
        eyebrow="Pedidos"
        title="Albaranes"
        description="Bandeja de albaranes: importación, OCR, revisión, vínculo con pedidos e incidencias. El lector OCR dentro de cada pedido enviado sigue igual en su sitio."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/pedidos/albaranes/nuevo"
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-4 text-sm font-black text-white shadow-md sm:flex-none"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Importar albarán
        </Link>
      </div>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase text-zinc-500">Filtros</p>
            <p className="text-sm text-zinc-600">
              Listado filtrado: <span className="font-bold tabular-nums text-zinc-900">{filtered.length}</span> · Total
              filtrado ~<span className="font-bold tabular-nums text-zinc-900">{sumTotal.toFixed(2)}</span> €
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800"
          >
            Actualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nº, proveedor, nota…"
              className="w-full rounded-xl border border-zinc-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
            />
          </div>
          <input
            value={supplierQ}
            onChange={(e) => setSupplierQ(e.target.value)}
            placeholder="Filtrar proveedor"
            className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DeliveryNoteStatus | 'all')}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'Todos los estados' : DELIVERY_NOTE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={onlyIncidents}
            onChange={(e) => setOnlyIncidents(e.target.value as 'all' | 'yes' | 'no')}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none"
          >
            <option value="all">Incidencias: todas</option>
            <option value="yes">Con incidencia abierta</option>
            <option value="no">Sin incidencia abierta</option>
          </select>
          <select
            value={onlyLinked}
            onChange={(e) => setOnlyLinked(e.target.value as 'all' | 'yes' | 'no')}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none"
          >
            <option value="all">Pedido: todos</option>
            <option value="yes">Con pedido relacionado</option>
            <option value="no">Sin pedido</option>
          </select>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          Exportación CSV / PDF e informes por proveedor o mes: preparado a nivel de datos; botones llegarán en una siguiente
          iteración.
        </p>
      </section>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando albaranes…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl bg-zinc-50 py-10 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
          No hay albaranes con este criterio.{' '}
          <Link href="/pedidos/albaranes/nuevo" className="font-bold text-[#D32F2F] underline">
            Importar uno
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/pedidos/albaranes/${r.id}`}
                className="block rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100 transition hover:border-zinc-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-900">{r.supplierName || 'Proveedor sin nombre'}</p>
                    <p className="text-xs text-zinc-600">
                      Albarán{' '}
                      <span className="font-mono tabular-nums">{r.deliveryNoteNumber || '—'}</span>
                      {r.deliveryDate ? (
                        <>
                          {' '}
                          · {new Date(`${r.deliveryDate}T12:00:00`).toLocaleDateString('es-ES')}
                        </>
                      ) : null}
                    </p>
                    {r.relatedOrderId ? (
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Pedido <span className="font-mono">{r.relatedOrderId.slice(0, 8)}…</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-zinc-400">Sin pedido relacionado</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={[
                        'rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide',
                        deliveryNoteStatusVisual(r.status).chipClass,
                      ].join(' ')}
                    >
                      {DELIVERY_NOTE_STATUS_LABEL[r.status]}
                    </span>
                    <span className="text-sm font-black tabular-nums text-zinc-900">
                      {r.totalAmount != null ? `${r.totalAmount.toFixed(2)} €` : '—'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-zinc-500">
                  {r.originalStoragePath ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600">
                      <Paperclip className="h-3.5 w-3.5" aria-hidden />
                      Documento
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">Sin archivo</span>
                  )}
                  {r.hasOpenIncidents ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {r.openIncidentCount} incid.
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    {r.sourceType === 'ocr' ? 'OCR' : r.sourceType === 'linked_order' ? 'Vinculado' : 'Manual'}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
