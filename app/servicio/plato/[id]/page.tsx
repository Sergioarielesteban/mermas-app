'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import ServicioAllergenChips from '@/components/servicio/ServicioAllergenChips';
import { getDishById } from '@/lib/servicio/mock-data';
import { dateKeyLocal, parseDateKeyLocal } from '@/lib/servicio/date-key';
import { getSupabaseClient } from '@/lib/supabase-client';
import { useAuth } from '@/components/AuthProvider';
import { fetchPlatoDetail } from '@/lib/servicio/servicio-supabase';
import { canManageServicioOperaciones } from '@/lib/servicio/permissions';
import type { ServicioDish } from '@/lib/servicio/types';
import type { ServicioPlanEstado } from '@/lib/servicio/constants';

type TabId = 'pasos' | 'ingredientes' | 'alergenos';

function mapPlanEstadoToStatus(estado: ServicioPlanEstado): ServicioDish['status'] {
  if (estado === 'listo') return 'listo';
  return 'preparacion';
}

function PlatoDetailInner() {
  const params = useParams();
  const router = useRouter();
  const sp = useSearchParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { localId, profileReady, profileRole } = useAuth();
  const canManage = canManageServicioOperaciones(profileRole);
  const supabase = useMemo(() => getSupabaseClient(), []);

  const q = sp.get('fecha');
  const planLineId = sp.get('planLine') ?? '';
  const dateKey = useMemo(() => {
    const p = q ? parseDateKeyLocal(q) : null;
    return p ? dateKeyLocal(p) : dateKeyLocal(new Date());
  }, [q]);

  const [dish, setDish] = useState<ServicioDish | null>(null);
  const [tab, setTab] = useState<TabId>('pasos');
  const [stepDone, setStepDone] = useState<Record<number, boolean>>({});
  const stepsRef = useRef<HTMLDivElement | null>(null);

  const scrollToPasos = useCallback(() => {
    setTab('pasos');
    requestAnimationFrame(() => {
      stepsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  useEffect(() => {
    if (!id || !profileReady) return;
    let cancelled = false;
    void (async () => {
      let next: ServicioDish | null = null;
      if (supabase && localId) {
        next = await fetchPlatoDetail(supabase, localId, id);
        if (planLineId) {
          const { data: line } = await supabase
            .from('servicio_plan_dia')
            .select('raciones_previstas, estado')
            .eq('id', planLineId)
            .eq('local_id', localId)
            .maybeSingle();
          if (line && next) {
            next = {
              ...next,
              portions: Number(line.raciones_previstas) || next.portions,
              status: mapPlanEstadoToStatus(line.estado as ServicioPlanEstado),
            };
          }
        }
      }
      if (!next) next = getDishById(id) ?? null;
      if (!cancelled) setDish(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, localId, supabase, profileReady, planLineId]);

  const imgUnopt = dish?.imageUrl?.startsWith('/') || dish?.imageUrl?.includes('supabase.co');

  if (!dish) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-sm font-semibold text-zinc-600">Plato no encontrado.</p>
      </div>
    );
  }

  const diffLabel = dish.difficulty === 'facil' ? 'Fácil' : dish.difficulty === 'media' ? 'Media' : 'Alta';

  return (
    <div className="mx-auto max-w-lg space-y-4 px-3 pb-28 pt-2 sm:px-4">
      <div className="flex items-center gap-2">
        <h2 className="line-clamp-2 min-w-0 flex-1 text-base font-extrabold leading-tight text-zinc-900">{dish.name}</h2>
        {canManage ? (
          <button
            type="button"
            onClick={() => router.push(`/servicio/platos/${dish.platoId}/editar`)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white"
            aria-label="Editar plato"
          >
            <Pencil className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200">
        <Image
          src={dish.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 512px) 100vw, 512px"
          priority
          decoding="async"
          unoptimized={!!imgUnopt}
        />
      </div>

      <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-zinc-500">Raciones</p>
            <p className="font-extrabold text-zinc-900">{dish.portions}</p>
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase text-zinc-500">Tiempo total</p>
            <p className="font-extrabold text-zinc-900">{dish.totalTimeMin} min</p>
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase text-zinc-500">Dificultad</p>
            <p className="font-extrabold text-zinc-900">{diffLabel}</p>
          </div>
          {dish.costeRacionEuro != null ? (
            <div>
              <p className="text-[10px] font-extrabold uppercase text-zinc-500">Coste / rac.</p>
              <p className="font-extrabold text-zinc-900">{dish.costeRacionEuro.toFixed(2)} €</p>
            </div>
          ) : null}
          {dish.pvpEuro != null ? (
            <div>
              <p className="text-[10px] font-extrabold uppercase text-zinc-500">PVP</p>
              <p className="font-extrabold text-zinc-900">{dish.pvpEuro.toFixed(2)} €</p>
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={scrollToPasos}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] text-base font-extrabold text-white shadow-md active:scale-[0.99]"
      >
        Ver cómo se hace
        <ChevronDown className="h-5 w-5" aria-hidden />
      </button>

      <div className="flex gap-1 rounded-2xl bg-zinc-100 p-1 ring-1 ring-zinc-200/80">
        {(
          [
            { id: 'pasos' as const, label: 'Pasos' },
            { id: 'ingredientes' as const, label: 'Ingredientes' },
            { id: 'alergenos' as const, label: 'Alérgenos' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'h-12 min-w-0 flex-1 rounded-xl text-xs font-extrabold uppercase tracking-wide',
              tab === t.id ? 'bg-white text-[#B91C1C] shadow-sm ring-1 ring-zinc-200' : 'text-zinc-600',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div ref={stepsRef}>
        {tab === 'pasos' ? (
          <ul className="space-y-2">
            {dish.steps.map((s, idx) => (
              <li key={`${s.n}-${idx}`} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
                <input
                  type="checkbox"
                  checked={!!stepDone[s.n]}
                  onChange={() => setStepDone((p) => ({ ...p, [s.n]: !p[s.n] }))}
                  className="mt-1 h-5 w-5 shrink-0 accent-[#D32F2F]"
                  aria-label={`Paso ${s.n}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-extrabold uppercase text-zinc-500">Paso {s.n}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-zinc-900">{s.text}</p>
                  {s.imageUrl ? (
                    <div className="relative mt-2 h-20 w-28 overflow-hidden rounded-xl bg-zinc-100">
                      <Image
                        src={s.imageUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="112px"
                        loading="lazy"
                        decoding="async"
                        unoptimized={s.imageUrl.includes('supabase.co')}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === 'ingredientes' ? (
          <ul className="space-y-2">
            {dish.ingredients.map((ing, idx) => (
              <li
                key={`${ing.name}-${idx}`}
                className="flex items-baseline justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-zinc-200"
              >
                <span className="text-sm font-bold text-zinc-900">{ing.name}</span>
                <span className="shrink-0 text-sm font-extrabold text-[#B91C1C]">{ing.qty}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === 'alergenos' ? (
          <div className="rounded-2xl bg-amber-50/90 p-4 ring-1 ring-amber-100">
            <p className="text-xs font-extrabold uppercase text-amber-950/80">Declaración</p>
            <div className="mt-2">
              <ServicioAllergenChips keys={dish.allergens} />
            </div>
            {!dish.allergens.length ? (
              <p className="mt-2 text-sm font-semibold text-zinc-700">Sin alérgenos de los 14 declarados.</p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-zinc-700">Revisar carta completa si hay dudas con el cliente.</p>
            )}
          </div>
        ) : null}
      </div>

      <Link
        href={`/servicio/produccion?fecha=${dateKey}`}
        className="flex h-12 w-full items-center justify-center rounded-2xl border-2 border-zinc-300 bg-white text-sm font-extrabold text-zinc-800 active:scale-[0.99]"
      >
        Ir a producción
      </Link>
    </div>
  );
}

export default function ServicioPlatoPage() {
  return (
    <Suspense fallback={<div className="px-4 py-10 text-center text-sm text-zinc-500">Cargando plato…</div>}>
      <PlatoDetailInner />
    </Suspense>
  );
}
