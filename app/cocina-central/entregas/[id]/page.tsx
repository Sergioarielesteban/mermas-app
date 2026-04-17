'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import SignaturePad from '@/components/cocina-central/SignaturePad';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  canConfirmDeliveryDispatch,
  canManageDeliveries,
} from '@/lib/cocina-central-permissions';
import {
  ccFetchDeliveryDetail,
  ccUpdateDeliveryEstado,
  ccConfirmDeliveryDispatch,
  ccSignDeliveryReceipt,
  ccProductName,
  type DeliveryItemRow,
  type DeliveryRow,
} from '@/lib/cocina-central-supabase';
import { buildDeliveryAlbaranPdf } from '@/lib/cocina-central-pdf';

export default function CocinaCentralEntregaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { localId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const supabase = getSupabaseClient();
  const canDeliveries = canManageDeliveries(isCentralKitchen, profileRole);
  const canConfirm = canConfirmDeliveryDispatch(isCentralKitchen, profileRole);

  const [delivery, setDelivery] = useState<DeliveryRow | null>(null);
  const [items, setItems] = useState<DeliveryItemRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nombre, setNombre] = useState('');
  const [sig, setSig] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    setErr(null);
    try {
      const { delivery: d, items: it } = await ccFetchDeliveryDetail(supabase, id);
      setDelivery(d);
      setItems(it);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    }
  }, [supabase, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOrigin = delivery && localId === delivery.local_origen_id;
  const isDest = delivery && localId === delivery.local_destino_id;

  const pdfDownload = () => {
    if (!delivery) return;
    const doc = buildDeliveryAlbaranPdf({ delivery, items });
    doc.save(`albaran-${delivery.id.slice(0, 8)}.pdf`);
  };

  const toPrepared = async () => {
    if (!supabase || !delivery) return;
    setBusy(true);
    setErr(null);
    try {
      await ccUpdateDeliveryEstado(supabase, delivery.id, 'preparado');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const toEnReparto = async () => {
    if (!supabase || !delivery) return;
    setBusy(true);
    setErr(null);
    try {
      await ccUpdateDeliveryEstado(supabase, delivery.id, 'en_reparto');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const confirmSalida = async () => {
    if (!supabase || !delivery) return;
    setBusy(true);
    setErr(null);
    try {
      await ccConfirmDeliveryDispatch(supabase, delivery.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const sign = async () => {
    if (!supabase || !delivery || !sig || !nombre.trim()) {
      setErr('Nombre y firma obligatorios.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await ccSignDeliveryReceipt(supabase, {
        deliveryId: delivery.id,
        nombreReceptor: nombre.trim(),
        signatureDataUrl: sig,
        firmaUrl: null,
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase || !localId) {
    return <p className="text-sm text-zinc-600">Sin sesión.</p>;
  }

  if (!delivery) {
    return <p className="text-sm text-zinc-600">{err ?? 'Cargando entrega…'}</p>;
  }

  if (!isOrigin && !isDest) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Esta entrega no pertenece a tu local.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href={isOrigin ? '/cocina-central/entregas' : '/cocina-central/recepciones'} className="text-sm font-bold text-[#D32F2F]">
        ← Volver
      </Link>

      <div>
        <h1 className="text-xl font-extrabold text-zinc-900">Entrega</h1>
        <p className="mt-1 text-xs font-mono text-zinc-500">{delivery.id}</p>
        <p className="mt-2 text-sm font-semibold text-zinc-700">
          {delivery.local_origen_label ?? 'Origen'} → {delivery.local_destino_label ?? 'Destino'}
        </p>
        <p className="text-sm text-zinc-600">
          {delivery.fecha} · <span className="font-bold uppercase">{delivery.estado}</span>
        </p>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-extrabold text-zinc-900">Líneas</h2>
        <ul className="mt-3 divide-y divide-zinc-100">
          {items.map((it) => {
            const b = Array.isArray(it.production_batches) ? it.production_batches[0] : it.production_batches;
            return (
              <li key={it.id} className="py-2 text-sm">
                <span className="font-bold text-zinc-900">{ccProductName(it.products)}</span>
                <span className="text-zinc-600">
                  {' '}
                  · Lote {b?.codigo_lote ?? '—'} · {it.cantidad} {it.unidad}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {isOrigin && canDeliveries ? (
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <h2 className="text-sm font-extrabold text-zinc-900">Acciones central</h2>
          {delivery.estado === 'borrador' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toPrepared()}
              className="h-12 w-full rounded-xl bg-zinc-900 text-sm font-extrabold text-white"
            >
              Marcar preparado
            </button>
          ) : null}
          {delivery.estado === 'preparado' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toEnReparto()}
              className="h-12 w-full rounded-xl border border-zinc-400 bg-white text-sm font-extrabold"
            >
              En reparto
            </button>
          ) : null}
          {(delivery.estado === 'preparado' || delivery.estado === 'en_reparto') && canConfirm ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmSalida()}
              className="h-14 w-full rounded-2xl bg-[#D32F2F] text-base font-extrabold text-white"
            >
              Confirmar salida (descuenta stock)
            </button>
          ) : null}
          {(delivery.estado === 'preparado' || delivery.estado === 'en_reparto') && !canConfirm ? (
            <p className="text-xs text-zinc-600">Solo admin o manager confirman la salida y el descuento de stock.</p>
          ) : null}
        </section>
      ) : null}

      {isDest && delivery.estado === 'entregado' ? (
        <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
          <h2 className="text-sm font-extrabold text-emerald-950">Firma de recepción</h2>
          <label className="block text-xs font-bold uppercase text-emerald-900">
            Nombre quien recibe
            <input
              className="mt-1 h-12 w-full rounded-xl border border-emerald-200 bg-white px-3 text-base font-semibold"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre y apellidos"
            />
          </label>
          <SignaturePad onChange={setSig} />
          <button
            type="button"
            disabled={busy}
            onClick={() => void sign()}
            className="h-14 w-full rounded-2xl bg-emerald-700 text-base font-extrabold text-white"
          >
            Firmar y cerrar
          </button>
        </section>
      ) : null}

      {delivery.estado === 'firmado' || delivery.signature_data_url ? (
        <button
          type="button"
          onClick={pdfDownload}
          className="h-12 w-full rounded-2xl border-2 border-zinc-900 bg-white text-sm font-extrabold"
        >
          Descargar PDF
        </button>
      ) : null}

      {delivery.estado === 'entregado' && isOrigin ? (
        <p className="text-center text-xs text-zinc-500">
          Pendiente de firma en destino. El PDF completo estará disponible tras firmar.
        </p>
      ) : null}
    </div>
  );
}
