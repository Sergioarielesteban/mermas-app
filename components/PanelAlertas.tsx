'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase-client';
import {
  fetchAppccColdUnits,
  fetchAppccReadingsForDate,
  madridDateKey,
  appccTemperaturasOperationalDateKey,
} from '@/lib/appcc-supabase';
import { fetchOrders } from '@/lib/pedidos-supabase';
import type { AppccSlot } from '@/lib/appcc-supabase';

type Alerta = {
  id: string;
  tipo: 'pedido' | 'temperatura';
  icono: string;
  texto: string;
  href: string;
  urgente: boolean;
};

function getSlotActual(): AppccSlot | null {
  const h = new Date().getHours();
  const m = new Date().getMinutes();
  const totalMin = h * 60 + m;
  // Mañana: avisa si pasan de las 11:00 sin registro
  if (totalMin >= 11 * 60 && totalMin < 15 * 60) return 'manana';
  // Tarde: avisa si pasan de las 16:00 sin registro
  if (totalMin >= 16 * 60 && totalMin < 22 * 60) return 'tarde';
  // Noche: avisa si pasan de las 23:00 sin registro
  if (totalMin >= 23 * 60) return 'noche';
  return null;
}

export default function PanelAlertas({ localId }: { localId: string }) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!localId) { setCargando(false); return; }
    cargarAlertas();
  }, [localId]);

  const cargarAlertas = async () => {
    const sb = getSupabaseClient();
    if (!sb) { setCargando(false); return; }

    const nuevas: Alerta[] = [];
    const hoy = madridDateKey();
    const hoyISO = new Date().toISOString().slice(0, 10);

    // ── Alertas de temperatura ──────────────────────────────────
    try {
      const slotActual = getSlotActual();
      if (slotActual) {
        const [units, readings] = await Promise.all([
          fetchAppccColdUnits(sb, localId),
          fetchAppccReadingsForDate(sb, localId, appccTemperaturasOperationalDateKey()),
        ]);

        if (units.length > 0) {
          const registradoEsteSlot = readings.some(r => r.slot === slotActual);
          if (!registradoEsteSlot) {
            const labels: Record<AppccSlot, string> = {
              manana: 'de mañana',
              tarde: 'de tarde',
              noche: 'de cierre',
            };
            nuevas.push({
              id: `temp-${slotActual}`,
              tipo: 'temperatura',
              icono: '🌡️',
              texto: `Temperaturas ${labels[slotActual]} sin registrar`,
              href: '/appcc/temperaturas',
              urgente: slotActual === 'noche',
            });
          }
        }
      }
    } catch {
      // silencioso — no bloquear el panel si falla
    }

    // ── Alertas de pedidos esperados hoy ───────────────────────
    try {
      const orders = await fetchOrders(sb, localId, { recentDays: 7 });
      const pedidosHoy = orders.filter(
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
  };

  if (cargando || alertas.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
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
