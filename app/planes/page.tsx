'use client';

import React from 'react';
import { Check, CreditCard, Smartphone, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { enterDemoMode } from '@/lib/demo-mode';
import type { PlanCode } from '@/lib/planPermissions';

const COMING_SOON_COPY = 'Muy pronto disponible. Puedes probar la demo.';

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
    modules: ['Todo Control', 'Cocina central', 'Finanzas', 'Personal', 'Consumo interno'],
    recommended: true,
  },
];

export default function PlanesPage() {
  const router = useRouter();
  const { plan, profileRole, selectPlan, subscriptionProvider, subscriptionStatus } = useAuth();
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [busyPlan, setBusyPlan] = React.useState<PlanCode | null>(null);
  const [startOpen, setStartOpen] = React.useState(false);
  const [pendingPlan, setPendingPlan] = React.useState<PlanCode | null>(null);
  const [startStep, setStartStep] = React.useState<'choose' | 'soon'>('choose');
  const isAdmin = profileRole === 'admin';

  const closeStartFlow = React.useCallback(() => {
    setStartOpen(false);
    setPendingPlan(null);
    setStartStep('choose');
  }, []);

  React.useEffect(() => {
    if (!startOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeStartFlow();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startOpen, closeStartFlow]);

  const openStartFlow = (code: PlanCode) => {
    setPendingPlan(code);
    setStartStep('choose');
    setStartOpen(true);
  };

  const tryDemo = () => {
    enterDemoMode();
    closeStartFlow();
    router.push('/panel');
  };

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

  const pendingPlanLabel = pendingPlan
    ? PLAN_CARDS.find((c) => c.code === pendingPlan)?.name ?? pendingPlan
    : '';

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

              {isCurrent ? (
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Plan actual</p>
              ) : null}

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
                onClick={() => openStartFlow(card.code)}
                disabled={busyPlan === card.code}
                className={[
                  'mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold transition',
                  busyPlan === card.code
                    ? 'cursor-wait border border-zinc-300 bg-zinc-100 text-zinc-600'
                    : card.recommended
                      ? 'bg-[#D32F2F] text-white hover:bg-[#B91C1C]'
                      : 'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50',
                ].join(' ')}
              >
                Empezar
              </button>

              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => void onSelectPlan(card.code)}
                  disabled={isCurrent || busyPlan === card.code}
                  className="mt-2 w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCurrent ? 'Ya es el plan del local' : busyPlan === card.code ? 'Actualizando…' : 'Fijar plan manualmente (pruebas)'}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>

      {startOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeStartFlow();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="planes-start-title"
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="planes-start-title" className="text-lg font-extrabold text-zinc-900">
                  Cómo quieres empezar
                </h2>
                {pendingPlan ? (
                  <p className="mt-1 text-xs font-medium text-zinc-500">
                    Plan: <span className="font-semibold text-zinc-700">{pendingPlanLabel}</span>
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeStartFlow}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {startStep === 'choose' ? (
              <>
                <p className="mt-3 text-xs leading-snug text-zinc-600">
                  Elige cómo quieres activar tu acceso. El pago y las tiendas se conectarán más adelante; ahora solo
                  preparamos el flujo.
                </p>
                <ul className="mt-4 space-y-2">
                  <li>
                    <button
                      type="button"
                      onClick={() => setStartStep('soon')}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-700">
                        <CreditCard className="h-5 w-5" aria-hidden />
                      </span>
                      Pago con tarjeta
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setStartStep('soon')}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-700">
                        <Smartphone className="h-5 w-5" aria-hidden />
                      </span>
                      Descargar en iPhone
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setStartStep('soon')}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-700">
                        <Smartphone className="h-5 w-5" aria-hidden />
                      </span>
                      Descargar en Android
                    </button>
                  </li>
                </ul>
                {isAdmin && pendingPlan ? (
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        await onSelectPlan(pendingPlan);
                        closeStartFlow();
                      })();
                    }}
                    disabled={busyPlan === pendingPlan || plan === pendingPlan}
                    className="mt-4 w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
                  >
                    Fijar este plan manualmente (solo pruebas)
                  </button>
                ) : null}
              </>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
                  {COMING_SOON_COPY}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeStartFlow}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 hover:bg-zinc-50"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={tryDemo}
                    className="rounded-xl bg-[#D32F2F] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#B91C1C]"
                  >
                    Probar la demo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

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
