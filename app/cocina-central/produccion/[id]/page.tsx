'use client';

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CocinaCentralForceDeleteModal } from '@/components/cocina-central/CocinaCentralForceDeleteModal';
import { useAuth } from '@/components/AuthProvider';
import { appConfirm } from '@/lib/app-dialog-bridge';
import type { LoteProduccionMetaV1 } from '@/lib/cocina-central-production-meta';
import { estimateTotalOutputKg } from '@/lib/cocina-central-production-meta';
import { canUseCocinaCentralForceDelete, ccForceDeleteProductionOrder } from '@/lib/cocina-central-force-delete';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate } from '@/lib/cocina-central-permissions';
import type { CcPreparationUnit, CcUnit, ProductionOrderLineRow, ProductionOrderRow } from '@/lib/cocina-central-supabase';
import {
  ccDeleteProductionOrder,
  ccFetchProductionOrderById,
  ccFetchProductionOrderLines,
  ccListBatchesForPreparationInCentral,
  ccRegisterProductionBatch,
  ccReplaceProductionOrderLines,
  ccUpdateProductionOrder,
} from '@/lib/cocina-central-supabase';
import { ccProductName } from '@/lib/cocina-central-supabase';
function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const STATE_LABEL: Record<string, string> = {
  borrador: 'Pendiente',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

export default function DetalleProduccionPage() {
  const params = useParams();
  const id = String(params.id ?? '');
  const router = useRouter();
  const { localId, profileReady, isCentralKitchen, profileRole } = useAuth();
  const canUse = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const supabase = getSupabaseClient();

  const [order, setOrder] = useState<ProductionOrderRow | null>(null);
  const [lines, setLines] = useState<ProductionOrderLineRow[]>([]);
  const [notes, setNotes] = useState('');
  const [outQty, setOutQty] = useState('');
  const [linesState, setLinesState] = useState<Record<string, { real: string; origin: string }>>({});
  const [cadYmd, setCadYmd] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchesByIng, setBatchesByIng] = useState<Record<string, Awaited<ReturnType<typeof ccListBatchesForPreparationInCentral>>>>({});
  const [recipeName, setRecipeName] = useState<string | null>(null);
  const [forceDeleteOpen, setForceDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const canForceDelete = canUseCocinaCentralForceDelete();

  const load = useCallback(async () => {
    if (!supabase || !localId || !id) return;
    setErr(null);
    try {
      const o = await ccFetchProductionOrderById(supabase, id);
      if (!o || o.local_central_id !== localId) {
        setOrder(null);
        return;
      }
      setOrder(o);
      const pr = o.production_recipes;
      const prName = Array.isArray(pr) ? pr[0]?.name : pr?.name;
      setRecipeName(prName ?? null);
      setNotes(o.notes?.trim() ?? '');
      setOutQty(String(o.cantidad_producida ?? o.cantidad_objetivo));
      const ls = await ccFetchProductionOrderLines(supabase, id);
      setLines(ls);
      const m: Record<string, { real: string; origin: string }> = {};
      for (const row of ls) {
        m[row.id] = {
          real: row.real_qty != null ? String(row.real_qty) : String(row.theoretical_qty),
          origin: row.origin_batch_id ?? '',
        };
      }
      setLinesState(m);
      const prep = o.central_preparations
        ? Array.isArray(o.central_preparations)
          ? o.central_preparations[0]
          : o.central_preparations
        : null;
      const cadDias = prep && 'caducidad_dias' in prep ? (prep as { caducidad_dias?: number | null }).caducidad_dias : null;
      if (cadDias != null && Number.isFinite(cadDias) && cadDias > 0) {
        setCadYmd(addDaysYmd(o.fecha, Math.floor(cadDias)));
      } else {
        setCadYmd('');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar');
    }
  }, [supabase, localId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!supabase || !localId || !lines.length) return;
    let cancelled = false;
    const prepIds = [...new Set(lines.map((l) => l.ingredient_preparation_id))];
    void (async () => {
      const by: Record<string, Awaited<ReturnType<typeof ccListBatchesForPreparationInCentral>>> = {};
      for (const pid of prepIds) {
        try {
          by[pid] = await ccListBatchesForPreparationInCentral(supabase, localId, pid);
        } catch {
          by[pid] = [];
        }
        if (cancelled) return;
      }
      if (!cancelled) setBatchesByIng(by);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, localId, lines]);

  const outPrep = order?.central_preparations
    ? (Array.isArray(order.central_preparations) ? order.central_preparations[0] : order.central_preparations)
    : null;
  const outUnidad = (outPrep && 'unidad_base' in outPrep ? (outPrep as { unidad_base: CcPreparationUnit }).unidad_base : 'kg') as CcPreparationUnit;

  const saveDraft = async () => {
    if (!supabase || !order) return;
    if (order.estado === 'completada' || order.estado === 'cancelada') return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await ccUpdateProductionOrder(supabase, order.id, { notes: notes.trim() || null });
      const payload = lines.map((row) => {
        const st = linesState[row.id] ?? { real: String(row.theoretical_qty), origin: '' };
        const r = Number(String(st.real).replace(',', '.'));
        return {
          ingredient_preparation_id: row.ingredient_preparation_id,
          label_snapshot: row.label_snapshot,
          theoretical_qty: row.theoretical_qty,
          unidad: row.unidad,
          real_qty: Number.isFinite(r) ? r : null,
          origin_batch_id: st.origin || null,
          cost_estimated_eur: row.cost_estimated_eur,
          article_id: row.article_id,
          production_recipe_line_id: row.production_recipe_line_id,
          escandallo_line_id: null,
        };
      });
      await ccReplaceProductionOrderLines(supabase, order.id, payload);
      const oq = Number(String(outQty).replace(',', '.'));
      if (Number.isFinite(oq) && oq > 0) {
        await ccUpdateProductionOrder(supabase, order.id, { cantidad_producida: oq });
      }
      setMsg('Cambios guardados.');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!supabase || !order) return;
    if (!(await appConfirm('¿Cancelar esta orden? No se descontará stock.'))) return;
    setBusy(true);
    setErr(null);
    try {
      await ccUpdateProductionOrder(supabase, order.id, { estado: 'cancelada' });
      router.push('/cocina-central/produccion');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const showDelete = Boolean(
    canUse &&
      order &&
      (canForceDelete || order.estado === 'completada' || order.estado === 'cancelada'),
  );

  const runLegacyOrderDelete = async () => {
    if (!supabase || !order) return;
    if (order.estado !== 'completada' && order.estado !== 'cancelada') return;
    if (!(await appConfirm('¿Eliminar esta producción?'))) return;
    if (order.estado === 'completada') {
      if (
        !(await appConfirm(
          'Esta orden generó un lote. Se eliminarán la orden, el lote y los movimientos de stock asociados en central. ¿Continuar?',
        ))
      ) {
        return;
      }
    }
    setDeleteBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await ccDeleteProductionOrder(supabase, order.id);
      router.push('/cocina-central/produccion');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo eliminar');
    } finally {
      setDeleteBusy(false);
    }
  };

  const requestOrderDelete = () => {
    if (canForceDelete) {
      setForceDeleteOpen(true);
      return;
    }
    void runLegacyOrderDelete();
  };

  const confirmForceOrderDelete = async () => {
    if (!supabase || !order) return;
    setDeleteBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await ccForceDeleteProductionOrder(supabase, order.id);
      setForceDeleteOpen(false);
      router.push('/cocina-central/produccion?eliminado=1');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo eliminar');
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmProduccion = async () => {
    if (!supabase || !localId || !order || !order.preparation_id) return;
    if (order.estado === 'completada' || order.estado === 'cancelada') return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (!lines.length) throw new Error('No hay líneas de ingredientes.');
      const oq = Number(String(outQty).replace(',', '.'));
      if (!Number.isFinite(oq) || oq <= 0) throw new Error('Indica la cantidad producida.');

      const withoutLot = lines.filter((row) => {
        const st = linesState[row.id];
        return !st?.origin?.trim();
      });
      if (withoutLot.length > 0) {
        const ok = await appConfirm(
          `Hay ${withoutLot.length} ingrediente(s) sin lote origen. La trazabilidad quedará incompleta. ¿Continuar?`,
        );
        if (!ok) {
          setBusy(false);
          return;
        }
      }

      const ingredients = lines.map((row) => {
        const st = linesState[row.id] ?? { real: String(row.theoretical_qty), origin: '' };
        const r = Number(String(st.real).replace(',', '.'));
        const qty = Number.isFinite(r) && r > 0 ? r : row.theoretical_qty;
        return {
          preparation_id: row.ingredient_preparation_id,
          cantidad: qty,
          unidad: row.unidad as CcUnit,
        };
      });

      const cad = cadYmd.trim() || null;
      const prFromOrder = order.production_recipes
        ? (Array.isArray(order.production_recipes) ? order.production_recipes[0] : order.production_recipes)
        : null;
      const totalKg =
        prFromOrder && prFromOrder.base_yield_quantity != null
          ? estimateTotalOutputKg(oq, {
              base_yield_quantity: Number(prFromOrder.base_yield_quantity),
              weight_kg_per_base_yield: prFromOrder.weight_kg_per_base_yield ?? null,
            })
          : null;
      let sumCost: number | null = null;
      for (const row of lines) {
        const st = linesState[row.id] ?? { real: String(row.theoretical_qty), origin: '' };
        const rUsed = Number(String(st.real).replace(',', '.'));
        const qty = Number.isFinite(rUsed) && rUsed >= 0 ? rUsed : row.theoretical_qty;
        if (row.cost_estimated_eur != null && row.theoretical_qty > 0) {
          const c = row.cost_estimated_eur * (qty / row.theoretical_qty);
          sumCost = (sumCost ?? 0) + c;
        }
      }
      if (sumCost != null) {
        sumCost = Math.round(sumCost * 100) / 100;
      }
      const costPerOut = sumCost != null && oq > 0 ? Math.round((sumCost / oq) * 10000) / 10000 : null;
      const costPerKg =
        sumCost != null && totalKg != null && totalKg > 0
          ? Math.round((sumCost / totalKg) * 10000) / 10000
          : null;
      const loteProduccionMeta: LoteProduccionMetaV1 = {
        version: 1,
        production_recipe_id: order.production_recipe_id,
        recipe_name: prFromOrder?.name?.trim() ?? null,
        target_output_qty: oq,
        target_output_unit: prFromOrder?.final_unit ?? null,
        total_kg: totalKg,
        total_cost_eur: sumCost,
        cost_per_output_unit_eur: costPerOut,
        cost_per_kg_eur: costPerKg,
      };
      const batchId = await ccRegisterProductionBatch(supabase, {
        orderId: order.id,
        preparationId: order.preparation_id,
        localCentralId: localId,
        fechaElaboracion: order.fecha,
        fechaCaducidad: cad,
        cantidad: oq,
        unidad: outUnidad,
        ingredients,
        loteProduccionMeta,
      });

      await ccUpdateProductionOrder(supabase, order.id, {
        estado: 'completada',
        cantidad_producida: oq,
        notes: notes.trim() || null,
      });
      setMsg(`Producción confirmada. Lote: ${batchId.slice(0, 8)}… (ver Lotes y stock).`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al confirmar');
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase) {
    return <p className="text-sm text-amber-800">Supabase no disponible.</p>;
  }
  if (!localId || !canUse) {
    return <p className="text-sm text-zinc-600">Sin acceso.</p>;
  }
  if (!order) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-zinc-600">Orden no encontrada.</p>
        <Link href="/cocina-central/produccion" className="text-sm font-bold text-[#D32F2F]">
          Volver
        </Link>
      </div>
    );
  }

  const title = ccProductName(outPrep ?? null);
  const nameSnap = recipeName;
  const prData = order.production_recipes
    ? (Array.isArray(order.production_recipes) ? order.production_recipes[0] : order.production_recipes)
    : null;
  const displayRecipeName = prData?.name?.trim() || nameSnap || title;
  const totalEstKgForOrder =
    prData && prData.base_yield_quantity != null
      ? estimateTotalOutputKg(order.cantidad_objetivo, {
          base_yield_quantity: Number(prData.base_yield_quantity),
          weight_kg_per_base_yield: prData.weight_kg_per_base_yield ?? null,
        })
      : null;

  return (
    <div className="space-y-6">
      <CocinaCentralForceDeleteModal
        open={forceDeleteOpen}
        onClose={() => {
          if (!deleteBusy) setForceDeleteOpen(false);
        }}
        onConfirm={confirmForceOrderDelete}
        entity="orden"
        busy={deleteBusy}
      />
      <div>
        <Link href="/cocina-central/produccion" className="text-sm font-semibold text-[#D32F2F]">
          ← Órdenes
        </Link>
        <h1 className="mt-2 text-xl font-extrabold text-zinc-900">Detalle de producción</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {displayRecipeName} · {STATE_LABEL[order.estado] ?? order.estado}
        </p>
        {prData ? (
          <p className="mt-1 text-sm font-semibold text-zinc-800">
            Cantidad: {order.cantidad_objetivo} {prData.final_unit || ''}
            {totalEstKgForOrder != null
              ? ` · Peso total estimado: ${totalEstKgForOrder.toLocaleString('es-ES', { maximumFractionDigits: 4 })} kg`
              : null}
          </p>
        ) : null}
      </div>
      {msg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</div>
      ) : null}
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-extrabold text-zinc-900">Resumen</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-700">
          <li>
            <span className="font-bold">Fórmula / elaboración:</span> {displayRecipeName}
          </li>
          <li>
            <span className="font-bold">Cantidad a producir:</span> {order.cantidad_objetivo} {prData?.final_unit ? `· ${prData.final_unit}` : `(${String(outUnidad)})`}
          </li>
          {totalEstKgForOrder != null ? (
            <li>
              <span className="font-bold">Peso total estimado:</span>{' '}
              {totalEstKgForOrder.toLocaleString('es-ES', { maximumFractionDigits: 4 })} kg
            </li>
          ) : null}
          <li>
            <span className="font-bold">Fecha:</span> {order.fecha}
          </li>
          <li>
            <span className="font-bold">Estado:</span> {STATE_LABEL[order.estado] ?? order.estado}
          </li>
        </ul>
        <label className="mt-3 block text-xs font-bold uppercase text-zinc-500">
          Cantidad producida (salida)
          <input
            type="text"
            inputMode="decimal"
            disabled={order.estado === 'completada' || order.estado === 'cancelada'}
            className="mt-1 h-11 w-full max-w-xs rounded-lg border border-zinc-300 px-3 text-sm font-semibold"
            value={outQty}
            onChange={(e) => setOutQty(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-xs font-bold uppercase text-zinc-500">
          Caducidad del lote (elaboración)
          <input
            type="date"
            disabled={order.estado === 'completada' || order.estado === 'cancelada'}
            className="mt-1 h-11 w-full max-w-xs rounded-lg border border-zinc-300 px-3 text-sm"
            value={cadYmd}
            onChange={(e) => setCadYmd(e.target.value)}
          />
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          Si la elaboración tiene días de caducidad, se rellenó un valor sugerido; ajústalo si hace falta.
        </p>
        <label className="mt-3 block text-xs font-bold uppercase text-zinc-500">
          Observaciones
          <textarea
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            rows={2}
            disabled={order.estado === 'completada' || order.estado === 'cancelada'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-extrabold text-zinc-900">Ingredientes calculados</h2>
        <p className="mt-1 text-xs text-zinc-500">Cantidades teóricas escaladas desde la receta base; ajusta el real usado y el lote origen.</p>
        <div className="mt-3 space-y-3">
          {lines.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No hay ingredientes (revisa la fórmula de producción o vuelve a generar la orden).
            </p>
          ) : (
            lines.map((row) => {
              const st = linesState[row.id] ?? { real: String(row.theoretical_qty), origin: '' };
              const opts = batchesByIng[row.ingredient_preparation_id] ?? [];
              const rUsed = Number(String(st.real).replace(',', '.'));
              const qtyForCost =
                Number.isFinite(rUsed) && rUsed >= 0 ? rUsed : row.theoretical_qty;
              const lineCost =
                row.cost_estimated_eur != null && row.theoretical_qty > 0
                  ? row.cost_estimated_eur * (qtyForCost / row.theoretical_qty)
                  : null;
              return (
                <div key={row.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                  <p className="text-sm font-bold text-zinc-900">{row.label_snapshot}</p>
                  <p className="text-xs text-zinc-600">
                    Teórico: {row.theoretical_qty} {row.unidad}
                    {row.cost_estimated_eur != null
                      ? ` · Coste teórico (orden): ${eur.format(row.cost_estimated_eur)}`
                      : null}
                    {lineCost != null && qtyForCost !== row.theoretical_qty
                      ? ` · Coste ajustado a cantidad: ${eur.format(Math.round(lineCost * 100) / 100)}`
                      : null}
                    {' · '}
                    Real usado:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={order.estado === 'completada'}
                      className="h-10 w-28 rounded-lg border border-zinc-300 px-2 text-sm"
                      value={st.real}
                      onChange={(e) =>
                        setLinesState((prev) => ({
                          ...prev,
                          [row.id]: { ...st, real: e.target.value },
                        }))
                      }
                    />
                    <select
                      className="h-10 min-w-[180px] flex-1 rounded-lg border border-zinc-300 text-sm"
                      disabled={order.estado === 'completada' || opts.length === 0}
                      value={st.origin}
                      onChange={(e) =>
                        setLinesState((prev) => ({
                          ...prev,
                          [row.id]: { ...st, origin: e.target.value },
                        }))
                      }
                    >
                      <option value="">
                        {opts.length === 0 ? 'No hay lote disponible' : 'Lote origen (opcional)'}
                      </option>
                      {opts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.codigo_lote} · {b.estado}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {order.estado !== 'completada' && order.estado !== 'cancelada' ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveDraft()}
            className="h-12 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800"
          >
            Guardar cambios
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmProduccion()}
            className="h-12 rounded-xl bg-[#D32F2F] px-4 text-sm font-extrabold text-white"
          >
            Confirmar producción
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancelOrder()}
            className="h-12 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-900"
          >
            Cancelar orden
          </button>
        </div>
      ) : null}

      {order.estado === 'completada' ? (
        <p className="text-sm text-zinc-600">
          Orden completada. Consulta el lote en{' '}
          <Link className="font-bold text-[#D32F2F]" href="/cocina-central/lotes">
            Lotes y stock
          </Link>
          .
        </p>
      ) : null}

      {showDelete ? (
        <div className="flex items-center justify-end border-t border-zinc-100 pt-4">
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-900 disabled:opacity-50"
            disabled={busy || deleteBusy}
            onClick={() => void requestOrderDelete()}
            title="Eliminar producción"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2.2} />
            Eliminar
          </button>
        </div>
      ) : null}
    </div>
  );
}
