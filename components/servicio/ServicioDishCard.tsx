'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, { memo } from 'react';
import type { ServicioDish } from '@/lib/servicio/types';
import ServicioAllergenChips from '@/components/servicio/ServicioAllergenChips';

type Props = { dish: ServicioDish; priority?: boolean; fecha?: string };

function ServicioDishCardInner({ dish, priority = false, fecha }: Props) {
  const href =
    fecha && fecha.length ? `/servicio/plato/${dish.id}?fecha=${encodeURIComponent(fecha)}` : `/servicio/plato/${dish.id}`;
  const statusLabel = dish.status === 'listo' ? 'Listo' : 'En preparación';
  const statusClass =
    dish.status === 'listo'
      ? 'bg-emerald-100 text-emerald-900 ring-emerald-200'
      : 'bg-amber-100 text-amber-950 ring-amber-200';

  return (
    <Link
      href={href}
      className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-zinc-200/90 shadow-sm transition active:scale-[0.99] hover:ring-zinc-300"
    >
      <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-zinc-100">
        <Image
          src={dish.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="72px"
          loading={priority ? 'eager' : 'lazy'}
          priority={priority}
          decoding="async"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-extrabold text-zinc-900">{dish.name}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{dish.shortDesc}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <ServicioAllergenChips keys={dish.allergens} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-600">
          <span className="rounded-lg bg-zinc-100 px-2 py-0.5 ring-1 ring-zinc-200/80">
            {dish.portions} raciones
          </span>
          <span className={`rounded-lg px-2 py-0.5 ring-1 ${statusClass}`}>{statusLabel}</span>
        </div>
      </div>
    </Link>
  );
}

export default memo(ServicioDishCardInner);
