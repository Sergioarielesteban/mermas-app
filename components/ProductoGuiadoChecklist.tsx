'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { isDemoMode } from '@/lib/demo-mode';
import { canAccessFinanzas } from '@/lib/app-role-permissions';

const DISMISS_KEY = 'chef_one_guia_cerrada';

type Step = { id: string; title: string; hint: string; href: string };

const STEPS: Step[] = [
  {
    id: 'ventas',
    title: 'Paso 1: introduce ventas',
    hint: 'Registra ventas del periodo para ver el cockpit con sentido.',
    href: '/finanzas/datos/ventas',
  },
  {
    id: 'costes',
    title: 'Paso 2: revisa costes',
    hint: 'Compras, mermas y personal en un solo vistazo.',
    href: '/finanzas',
  },
  {
    id: 'resultados',
    title: 'Paso 3: mira resultados',
    hint: 'Márgenes y alertas por plato.',
    href: '/finanzas/rentabilidad',
  },
];

export default function ProductoGuiadoChecklist() {
  const { profileRole } = useAuth();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  if (!canAccessFinanzas(profileRole)) return null;
  if (dismissed || isDemoMode()) return null;

  return (
    <section
      className="rounded-2xl border border-sky-200/90 bg-sky-50/90 p-3 shadow-sm ring-1 ring-sky-100"
      aria-label="Guía primer uso"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-sky-900">Primeros pasos</p>
          <p className="mt-1 text-sm font-semibold text-sky-950">Tres pasos para sacar partido a Chef-One</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-xl border border-sky-300 bg-white px-3 py-2 text-xs font-bold text-sky-900"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, '1');
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
        >
          Cerrar guía
        </button>
      </div>
      <ol className="mt-2 space-y-2">
        {STEPS.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              className="flex gap-2 rounded-xl border border-sky-100 bg-white/90 p-2.5 ring-1 ring-sky-100/80 transition hover:bg-white"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center text-sky-600" aria-hidden>
                <ListChecks className="h-6 w-6" strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-bold text-zinc-900">{s.title}</span>
                <span className="mt-0.5 block text-xs text-zinc-600">{s.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
