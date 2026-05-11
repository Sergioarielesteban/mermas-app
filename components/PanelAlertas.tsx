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
type Alerta = {
  id: string;
  tipo: 'temperatura';
  icono: string;
  texto: string;
  href: string;
  urgente: boolean;
};

/**
 * Alertas operativas del panel (solo temperaturas pendientes).
 * Pedidos con entrega hoy van en la tarjeta «Pedidos que llegan hoy» (sin duplicar en banner).
 */
export default function PanelAlertas({ localId }: { localId: string }) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargarAlertas = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) {
      setCargando(false);
      return;
    }

    const nuevas: Alerta[] = [];

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
      /* silencioso */
    }

    setAlertas(nuevas);
    setCargando(false);
  }, [localId]);

  useEffect(() => {
    if (!localId) {
      setAlertas([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    void cargarAlertas();
  }, [localId, cargarAlertas]);

  useEffect(() => {
    if (!localId) return;
    const id = window.setInterval(() => {
      void cargarAlertas();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [localId, cargarAlertas]);

  if (cargando || alertas.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {alertas.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          className={[
            'flex min-h-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left antialiased outline-none select-none touch-manipulation transition-transform active:scale-[0.99] ring-1',
            a.urgente ? 'bg-red-50 ring-red-200' : 'bg-amber-50 ring-amber-200',
          ].join(' ')}
        >
          <span className="text-base leading-none shrink-0">{a.icono}</span>
          <p
            className={[
              'flex-1 text-[12px] font-semibold leading-snug',
              a.urgente ? 'text-red-700' : 'text-amber-800',
            ].join(' ')}
          >
            {a.texto}
          </p>
          <span
            className={[
              'text-[11px] font-bold shrink-0',
              a.urgente ? 'text-red-500' : 'text-amber-500',
            ].join(' ')}
          >
            →
          </span>
        </Link>
      ))}
    </div>
  );
}
