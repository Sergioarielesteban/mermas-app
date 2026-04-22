'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { Suspense, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import ServicioProductionOrder from '@/components/servicio/ServicioProductionOrder';
import { estimateServiceMinutes, getServicioBundle } from '@/lib/servicio/mock-data';
import { dateKeyLocal, parseDateKeyLocal } from '@/lib/servicio/date-key';

function ProduccionInner() {
  const sp = useSearchParams();
  const q = sp.get('fecha');
  const dateKey = useMemo(() => {
    const p = q ? parseDateKeyLocal(q) : null;
    return p ? dateKeyLocal(p) : dateKeyLocal(new Date());
  }, [q]);

  const bundle = useMemo(() => getServicioBundle(dateKey), [dateKey]);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const totalRaciones = useMemo(() => bundle.dishes.reduce((a, d) => a + d.portions, 0), [bundle.dishes]);
  const nPlatos = bundle.dishes.length;
  const tiempo = useMemo(() => estimateServiceMinutes(bundle.dishes), [bundle.dishes]);

  const allChecked = bundle.mise.every((m) => done[m.id]);
  const toggle = (id: string) => setDone((prev) => ({ ...prev, [id]: !prev[id] }));

  const markAll = () => {
    const n: Record<string, boolean> = {};
    for (const m of bundle.mise) n[m.id] = true;
    setDone(n);
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 px-3 pb-28 pt-2 sm:px-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/servicio?fecha=${dateKey}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-800 ring-1 ring-zinc-200 active:scale-[0.98]"
          aria-label="Volver a servicio"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-lg font-extrabold text-zinc-900">Producción</h2>
      </div>

      <div className="grid gap-2 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Raciones</p>
          <p className="text-xl font-extrabold text-zinc-900">{totalRaciones}</p>
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Platos</p>
          <p className="text-xl font-extrabold text-zinc-900">{nPlatos}</p>
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Tiempo aprox.</p>
          <p className="text-xl font-extrabold text-zinc-900">{tiempo} min</p>
        </div>
      </div>

      <ServicioProductionOrder />

      <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-700">Checklist mise en place</p>
        <ul className="mt-3 space-y-2">
          {bundle.mise.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-xl bg-zinc-50/80 p-3 ring-1 ring-zinc-200/80">
              <input
                type="checkbox"
                checked={!!done[item.id]}
                onChange={() => toggle(item.id)}
                className="mt-1 h-5 w-5 shrink-0 accent-[#D32F2F]"
                aria-label={item.text}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-zinc-900">{item.text}</p>
                <p className="mt-0.5 text-xs font-semibold text-zinc-600">{item.qty}</p>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={markAll}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-zinc-900 text-sm font-extrabold text-white active:scale-[0.99]"
        >
          Marcar todo como listo
        </button>
        {allChecked ? (
          <p className="mt-3 text-center text-xs font-bold text-emerald-700">Listo para servicio</p>
        ) : null}
      </div>
    </div>
  );
}

export default function ServicioProduccionPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-zinc-500">Cargando producción…</div>
      }
    >
      <ProduccionInner />
    </Suspense>
  );
}
