'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import ServicioDishCard from '@/components/servicio/ServicioDishCard';
import { getServicioBundle } from '@/lib/servicio/mock-data';
import type { ServicioCourse } from '@/lib/servicio/types';
import { addDaysLocal, dateKeyLocal, parseDateKeyLocal } from '@/lib/servicio/date-key';

const TABS: { id: ServicioCourse; label: string }[] = [
  { id: 'entrantes', label: 'Entrantes' },
  { id: 'principales', label: 'Principales' },
  { id: 'postres', label: 'Postres' },
];

function ServicioHomeInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const qDate = sp.get('fecha');
  const day = useMemo(() => {
    const p = qDate ? parseDateKeyLocal(qDate) : null;
    return p ?? new Date();
  }, [qDate]);

  const dateKey = dateKeyLocal(day);
  const bundle = useMemo(() => getServicioBundle(dateKey), [dateKey]);
  const [tab, setTab] = useState<ServicioCourse>('entrantes');

  const syncQuery = useCallback(
    (d: Date) => {
      const k = dateKeyLocal(d);
      router.replace(`/servicio?fecha=${k}`, { scroll: false });
    },
    [router],
  );

  const shiftDay = (delta: number) => {
    const n = addDaysLocal(day, delta);
    syncQuery(n);
  };

  const formatted = useMemo(
    () =>
      new Intl.DateTimeFormat('es', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      }).format(day),
    [day],
  );

  const filtered = useMemo(
    () => bundle.dishes.filter((d) => d.course === tab),
    [bundle.dishes, tab],
  );

  return (
    <div className="mx-auto max-w-lg space-y-4 px-3 pb-28 pt-2 sm:px-4">
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-zinc-50 px-3 py-3 ring-1 ring-zinc-200">
        <button
          type="button"
          onClick={() => shiftDay(-1)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200 active:scale-[0.98]"
          aria-label="Día anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Servicio
          </p>
          <p className="mt-0.5 capitalize text-sm font-extrabold leading-tight text-zinc-900">{formatted}</p>
        </div>
        <button
          type="button"
          onClick={() => shiftDay(1)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200 active:scale-[0.98]"
          aria-label="Día siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <Link
        href={`/servicio/produccion?fecha=${dateKey}`}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] text-base font-extrabold text-white shadow-md active:scale-[0.99]"
      >
        <ClipboardList className="h-5 w-5" aria-hidden />
        Producción (mise en place)
      </Link>

      <div className="flex gap-1 rounded-2xl bg-zinc-100 p-1 ring-1 ring-zinc-200/80">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'h-12 min-w-0 flex-1 rounded-xl text-xs font-extrabold uppercase tracking-wide transition',
              tab === t.id ? 'bg-white text-[#B91C1C] shadow-sm ring-1 ring-zinc-200' : 'text-zinc-600',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {filtered.map((dish, i) => (
          <ServicioDishCard
            key={dish.id}
            dish={dish}
            fecha={dateKey}
            priority={i === 0 && tab === 'entrantes'}
          />
        ))}
      </div>
    </div>
  );
}

export default function ServicioPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm font-medium text-zinc-500">Cargando servicio…</div>
      }
    >
      <ServicioHomeInner />
    </Suspense>
  );
}
