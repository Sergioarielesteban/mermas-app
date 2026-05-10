'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase-client';
import {
  fetchAppccColdUnits,
  fetchAppccReadingsForDate,
  appccTemperaturasOperationalDateKey,
  getDueTemperatureRegistrationSlots,
} from '@/lib/appcc-supabase';
import { fetchOrders } from '@/lib/pedidos-supabase';
import { computeCutoffForToday, isOrderDayToday } from '@/lib/pedidos-order-agenda-engine';
import {
  fetchOrderSchedulesForLocal,
  fetchReviewItemsForLocal,
  fetchSupplierNamesMap,
} from '@/lib/pedidos-order-agenda-supabase';
import { usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';

type Alerta = {
  id: string;
  tipo: 'pedido' | 'temperatura' | 'agenda';
  icono: string;
  texto: string;
  href: string;
  urgente: boolean;
};

export default function PanelAlertas({
  localId,
  showPedidos = true,
  /** En la home operativa las temperaturas se muestran en el cuadrado «Temperaturas» (no duplicar banners). */
  hideTemperaturaAlerts = false,
}: {
  localId: string;
  /** Misma condición que el acceso al módulo Pedidos en el panel (agenda + cortes). */
  showPedidos?: boolean;
  hideTemperaturaAlerts?: boolean;
}) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [agendaAlDiaMicro, setAgendaAlDiaMicro] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargarAlertas = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) { setCargando(false); return; }

    const nuevas: Alerta[] = [];
    const hoyISO = new Date().toISOString().slice(0, 10);

    let ordersRecent: Awaited<ReturnType<typeof fetchOrders>> = [];
    try {
      ordersRecent = await fetchOrders(sb, localId, { recentDays: 14 });
    } catch {
      ordersRecent = [];
    }

    // ── Alertas de temperatura (mañana/noche, hora Madrid; mismo criterio que /appcc/temperaturas) ──
    if (!hideTemperaturaAlerts) {
      try {
        const [units, readings] = await Promise.all([
          fetchAppccColdUnits(sb, localId),
          fetchAppccReadingsForDate(sb, localId, appccTemperaturasOperationalDateKey()),
        ]);

        if (units.length > 0) {
          const dueSlots = getDueTemperatureRegistrationSlots(units, readings);
          for (const slot of dueSlots) {
            const texto =
              slot === 'manana'
                ? 'Temperatura de la mañana sin registrar'
                : 'Temperatura de la noche sin registrar';
            nuevas.push({
              id: `temp-${slot}`,
              tipo: 'temperatura',
              icono: '🌡️',
              texto,
              href: '/appcc/temperaturas',
              urgente: slot === 'noche',
            });
          }
        }
      } catch {
        // silencioso — no bloquear el panel si falla
      }
    }

    // ── Agenda operativa (mismo criterio que /pedidos: visible hasta enviar el pedido) ──
    if (showPedidos) {
      try {
        const now = new Date();
        const [schedulesMap, namesMap, reviewBySupplier] = await Promise.all([
          fetchOrderSchedulesForLocal(sb, localId),
          fetchSupplierNamesMap(sb, localId),
          fetchReviewItemsForLocal(sb, localId),
        ]);

        type AgendaSort = { supplierId: string; texto: string; urgente: boolean; order: number; name: string };
        const agendaPending: AgendaSort[] = [];
        let suppliersAgendaHoy = 0;

        for (const [supplierId, schedule] of schedulesMap) {
          if (!schedule.enabled || !isOrderDayToday(schedule, now)) continue;
          const computed = computeCutoffForToday(schedule, ordersRecent, supplierId, now);
          if (!computed) continue;
          suppliersAgendaHoy++;
          if (computed.status === 'enviado') continue;

          const name = namesMap.get(supplierId) ?? 'Proveedor';
          let texto: string;
          let urgente = false;
          let order = 4;
          if (computed.status === 'vencido') {
            texto = `Hora límite pasada (${computed.cutoffLabel}). Si aún no pediste a ${name}, hazlo cuanto antes.`;
            urgente = true;
            order = 0;
          } else if (computed.status === 'vence_pronto') {
            texto = `Queda poco para el corte (${computed.cutoffLabel}). Revisa el pedido a ${name}.`;
            order = 1;
          } else {
            texto = `Hoy toca pedir a ${name} antes de las ${computed.cutoffLabel}.`;
            order = 2;
          }
          agendaPending.push({ supplierId, texto, urgente, order, name });
        }

        agendaPending.sort(
          (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'),
        );
        for (const row of agendaPending) {
          nuevas.push({
            id: `agenda-${row.supplierId}`,
            tipo: 'agenda',
            icono: '📋',
            texto: row.texto,
            href: `/pedidos/nuevo?supplierId=${encodeURIComponent(row.supplierId)}`,
            urgente: row.urgente,
          });
        }

        let reviewItemsAgendaHoy = 0;
        for (const [supplierId, schedule] of schedulesMap) {
          if (!schedule.enabled || !isOrderDayToday(schedule, now)) continue;
          for (const it of reviewBySupplier.get(supplierId) ?? []) {
            if (it.enabled) reviewItemsAgendaHoy++;
          }
        }

        setAgendaAlDiaMicro(
          suppliersAgendaHoy > 0 &&
            agendaPending.length === 0 &&
            reviewItemsAgendaHoy === 0,
        );
      } catch {
        setAgendaAlDiaMicro(false);
      }
    } else {
      setAgendaAlDiaMicro(false);
    }

    // ── Alertas de pedidos esperados hoy ───────────────────────
    try {
      const pedidosHoy = ordersRecent.filter(
        o => o.status === 'sent' && o.deliveryDate === hoyISO,
      );
      if (pedidosHoy.length > 0) {
        nuevas.push({
          id: 'pedidos-hoy',
          tipo: 'pedido',
          icono: '📦',
          texto: pedidosHoy.length === 1
            ? 'Hoy llega 1 pedido pendiente de recepción'
            : `Hoy llegan ${pedidosHoy.length} pedidos pendientes de recepción`,
          href: '/pedidos',
          urgente: false,
        });
      }
    } catch {
      // silencioso
    }

    setAlertas(nuevas);
    setCargando(false);
  }, [localId, showPedidos, hideTemperaturaAlerts]);

  useEffect(() => {
    if (!localId) {
      setAlertas([]);
      setAgendaAlDiaMicro(false);
      setCargando(false);
      return;
    }
    setCargando(true);
    void cargarAlertas();
  }, [localId, showPedidos, cargarAlertas]);

  useEffect(() => {
    if (!localId) return;
    const id = window.setInterval(() => {
      void cargarAlertas();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [localId, cargarAlertas]);

  usePedidosDataChangedListener(() => {
    void cargarAlertas();
  }, Boolean(localId));

  if (cargando || (alertas.length === 0 && !agendaAlDiaMicro)) return null;

  return (
    <div className="flex flex-col gap-2">
      {agendaAlDiaMicro ? (
        <section
          className="rounded-xl border border-emerald-200/60 bg-emerald-50/35 px-2.5 py-1.5 shadow-sm ring-1 ring-emerald-100/50"
          aria-live="polite"
        >
          <p className="text-[11px] font-semibold leading-tight text-emerald-900">Agenda al día</p>
          <p className="mt-0.5 text-[10px] leading-snug text-emerald-800/85">
            Todos los pedidos programados están enviados.
          </p>
        </section>
      ) : null}
      {alertas.map(a => (
        <Link
          key={a.id}
          href={a.href}
          className={[
            'flex items-center gap-3 rounded-2xl px-4 py-3 text-left antialiased outline-none select-none touch-manipulation transition-transform active:scale-[0.99] ring-1',
            a.urgente
              ? 'bg-red-50 ring-red-200'
              : 'bg-amber-50 ring-amber-200',
          ].join(' ')}
        >
          <span className="text-xl shrink-0">{a.icono}</span>
          <p className={[
            'flex-1 text-[13px] font-semibold leading-tight',
            a.urgente ? 'text-red-700' : 'text-amber-800',
          ].join(' ')}>
            {a.texto}
          </p>
          <span className={[
            'text-xs font-bold shrink-0',
            a.urgente ? 'text-red-500' : 'text-amber-500',
          ].join(' ')}>
            →
          </span>
        </Link>
      ))}
    </div>
  );
}
