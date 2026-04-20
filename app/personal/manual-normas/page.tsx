'use client';

import Link from 'next/link';
import React from 'react';
import { BookOpen, ClipboardList, Table2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';

const cards = [
  {
    href: '/personal/manual-normas/operaciones',
    title: 'Manual de operaciones',
    sub: 'Procedimientos por área: cocina, recepción, limpieza y producción.',
    Icon: BookOpen,
  },
  {
    href: '/personal/manual-normas/normas',
    title: 'Normas de la empresa',
    sub: 'Políticas internas y lectura obligatoria cuando se actualizan.',
    Icon: ClipboardList,
  },
  {
    href: '/personal/manual-normas/matriz',
    title: 'Matriz de alérgenos',
    sub: 'Consulta directa desde escandallos (solo lectura).',
    Icon: Table2,
  },
] as const;

export default function ManualNormasHubPage() {
  return (
    <div className="space-y-5 pb-6">
      <MermasStyleHero
        eyebrow="Horarios"
        title="Manual y normas"
        tagline="Documentación del local en un solo sitio: operaciones, normas y alérgenos."
        compact
      />
      <Link
        href="/personal"
        className="inline-flex text-sm font-bold text-zinc-600 hover:text-[#D32F2F]"
      >
        ← Volver a Horarios
      </Link>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map(({ href, title, sub, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100 transition hover:border-[#D32F2F]/35 hover:shadow-md active:scale-[0.99]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#D32F2F] text-white shadow-md shadow-[#D32F2F]/20">
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="mt-3 text-sm font-extrabold text-zinc-900">{title}</span>
            <span className="mt-1 text-xs leading-relaxed text-zinc-600">{sub}</span>
            <span className="mt-3 text-xs font-black text-[#D32F2F]">Abrir →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
