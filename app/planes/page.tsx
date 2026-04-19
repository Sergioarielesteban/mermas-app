'use client';

import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import type { PlanCode } from '@/lib/planPermissions';

type PlanCard = {
  code: PlanCode;
  name: string;
  price: string;
  modules: string[];
  recommended?: boolean;
};

const PLAN_CARDS: PlanCard[] = [
  {
    code: 'OPERATIVO',
    name: 'Plan Operativo',
    price: '39,90 €/mes',
    modules: ['Pedidos', 'Mermas', 'APPCC', 'Checklist', 'Chat'],
  },
  {
    code: 'CONTROL',
    name: 'Plan Control',
    price: '69,90 €/mes',
    modules: ['Todo Operativo', 'Inventario', 'Escandallos', 'Produccion'],
  },
  {
    code: 'PRO',
    name: 'Plan Pro',
    price: '99 €/mes',
    modules: ['Todo Control', 'Cocina central', 'Finanzas', 'Personal', 'Comida personal'],
    recommended: true,
  },
];

export default function PlanesPage() {
  const router = useRouter();
  const { plan, profileRole, selectPlan, subscriptionProvider, subscriptionStatus } = useAuth();
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [busyPlan, setBusyPlan] = React.useState<PlanCode | null>(null);
  const isAdmin = profileRole === 'admin';

  const onSelectPlan = async (nextPlan: PlanCode) => {
    if (plan === nextPlan) return;
    setBusyPlan(nextPlan);
    const res = await selectPlan(nextPlan);
    setBusyPlan(null);
    if (res.ok) {
      setFeedback(`Plan ${nextPlan} seleccionado correctamente.`);
      return;
    }
    setFeedback(res.reason ?? 'No se pudo actualizar el plan en este momento.');
  };

  return (
    <div className="space-y-5">
      <MermasStyleHero
        eyebrow="Planes"
        title="Elige tu plan"
        tagline="Gestiona accesos por modulos sin salir de la app"
        compact
      />

      {feedback ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {feedback}
        </p>
      ) : null}
      <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        Suscripción actual: {subscriptionStatus} · proveedor: {subscriptionProvider}
      </p>
      {isAdmin ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
          Modo admin activo: tienes acceso completo a todos los modulos, incluso durante setup sin suscripción activa.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLAN_CARDS.map((card) => {
          const isCurrent = card.code === plan;
          return (
            <article
              key={card.code}
              className={[
                'rounded-3xl border bg-white p-5 shadow-sm',
                card.recommended ? 'border-[#D32F2F]/40 ring-1 ring-[#D32F2F]/20' : 'border-zinc-200',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-extrabold text-zinc-900">{card.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-zinc-600">{card.price}</p>
                </div>
                {card.recommended ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#D32F2F]/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#B91C1C]">
                    <Sparkles className="h-3 w-3" />
                    Mas popular
                  </span>
                ) : null}
              </div>

              <ul className="mt-4 space-y-2">
                {card.modules.map((module) => (
                  <li key={`${card.code}-${module}`} className="flex items-start gap-2 text-sm text-zinc-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{module}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => void onSelectPlan(card.code)}
                disabled={isCurrent || busyPlan === card.code}
                className={[
                  'mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold transition',
                  isCurrent || busyPlan === card.code
                    ? 'cursor-default border border-zinc-300 bg-zinc-100 text-zinc-600'
                    : card.recommended
                      ? 'bg-[#D32F2F] text-white hover:bg-[#B91C1C]'
                      : 'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50',
                ].join(' ')}
              >
                {isCurrent ? 'Plan actual' : busyPlan === card.code ? 'Actualizando...' : 'Seleccionar plan'}
              </button>
            </article>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => router.push('/panel')}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 hover:bg-zinc-50"
        >
          Volver al panel
        </button>
      </div>
    </div>
  );
}
