'use client';

import { useParams, useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import CentralSupplyOrderDeleteConfirm from '@/components/cocina-central/CentralSupplyOrderDeleteConfirm';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canManageDeliveries } from '@/lib/cocina-central-permissions';
import {
  SUPPLY_ORDER_ESTADO_LABEL,
  formatSupplyUnitLabel,
  type CentralSupplyOrderItemRow,
  type CentralSupplyOrderRow,
  type SupplyOrderEstado,
  formatEur,
} from '@/lib/cocina-central-supply-supabase';

const ESTADOS: SupplyOrderEstado[] = [
  'enviado',
  'visto',
  'en_preparacion',
  'servido',
  'cancelado',
];

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export default function CocinaCentralPedidoSedeDetallePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const { profileReady, isCentralKitchen, profileRole } = useAuth();
  const supabase = getSupabaseClient();
  const canDeliver = canManageDeliveries(isCentralKitchen, profileRole);

  const [order, setOrder] = useState<CentralSupplyOrderRow | null>(null);
  const [items, setItems] = useState<CentralSupplyOrderItemRow[]>([]);
  const [estado, setEstado] = useState<SupplyOrderEstado>('enviado');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !id || !isCentralKitchen || !canDeliver) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const { ccFetchSupplyOrderWithItems } = await import('@/lib/cocina-central-supply-supabase');
      const res = await ccFetchSupplyOrderWithItems(supabase, id);
      setOrder(res.order);
      setItems(res.items);
      setEstado(res.order.estado);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo cargar');
      setOrder(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, id, isCentralKitchen, canDeliver]);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteOrder = async () => {
    if (!supabase || !order) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      const { ccDeleteSupplyOrder } = await import('@/lib/cocina-central-supply-supabase');
      await ccDeleteSupplyOrder(supabase, order.id);
      setDeleteOpen(false);
      router.replace('/cocina-central/pedidos-sedes');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo eliminar');
      setDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  const saveEstado = async () => {
    if (!supabase || !order) return;
    setSaving(true);
    setErr(null);
    try {
      const { ccUpdateSupplyOrderEstado } = await import('@/lib/cocina-central-supply-supabase');
      await ccUpdateSupplyOrderEstado(supabase, order.id, estado);
      router.refresh();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!profileReady) {
    return <p className="text-center text-sm text-zinc-500">Cargando perfil…</p>;
  }

  if (!isSupabaseEnabled() || !supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Supabase no está configurado.
      </div>
    );
  }

  if (!isCentralKitchen || !canDeliver) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm">
        <p className="text-zinc-700">Sin permiso para gestionar pedidos de sede.</p>
      </div>
    );
  }

  if (loading) {
    return <p className="text-center text-sm text-zinc-500">Cargando pedido…</p>;
  }

  if (err && !order) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-700">{err}</p>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <div className="space-y-5">
      <CentralSupplyOrderDeleteConfirm
        open={deleteOpen}
        busy={deleteBusy}
        mode="single"
        onCancel={() => {
          if (!deleteBusy) setDeleteOpen(false);
        }}
        onConfirm={() => void deleteOrder()}
      />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Pedido de sede</p>
          <h1 className="text-xl font-extrabold text-zinc-900">
            {order.local_solicitante_label ?? order.local_solicitante_id}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Entrega <strong>{fmtDate(order.fecha_entrega_deseada)}</strong> · {formatEur(Number(order.total_eur))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-extrabold text-red-800 ring-1 ring-red-100 hover:bg-red-100/60"
        >
          <Trash2 className="h-4 w-4" />
          Eliminar
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
        <label className="block">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Estado</span>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as SupplyOrderEstado)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold sm:max-w-xs"
            >
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {SUPPLY_ORDER_ESTADO_LABEL[s]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={saving || estado === order.estado}
              onClick={() => void saveEstado()}
              className="h-10 rounded-xl bg-[#D32F2F] px-4 text-xs font-extrabold text-white disabled:opacity-45"
            >
              {saving ? 'Guardando…' : 'Guardar estado'}
            </button>
          </div>
        </label>
        <p className="mt-2 text-xs text-zinc-500">Estado actual en servidor: {SUPPLY_ORDER_ESTADO_LABEL[order.estado]}</p>
        {err ? <p className="mt-2 text-xs font-semibold text-red-700">{err}</p> : null}
      </div>

      {order.notas?.trim() ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
          <span className="font-bold">Notas del local: </span>
          {order.notas.trim()}
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-extrabold text-zinc-900">Líneas</h2>
        <ul className="mt-2 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white ring-1 ring-zinc-100">
          {items.map((it) => (
            <li key={it.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-zinc-900">{it.product_name}</p>
                <p className="text-xs text-zinc-600">
                  {it.cantidad} {formatSupplyUnitLabel(it.unidad)} × {formatEur(Number(it.precio_unitario_eur))}
                </p>
              </div>
              <p className="text-sm font-extrabold text-zinc-900">{formatEur(Number(it.line_total_eur))}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
