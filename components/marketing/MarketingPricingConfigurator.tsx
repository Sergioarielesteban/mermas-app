'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle2, MessageCircle, Sparkles } from 'lucide-react';

const BRAND = '#D32F2F';

const BASE_PRICE = 29;
const CONTROL_ADDON = 20;
const GESTION_ADDON = 29;
const TOTAL_RECOMMENDED = 69;

const CONTROL_MODULES = ['APPCC', 'Checklists', 'Mermas'] as const;
const GESTION_MODULES = ['Produccion', 'Inventario', 'Escandallos'] as const;

export default function MarketingPricingConfigurator() {
  const [withControl, setWithControl] = useState(true);
  const [withGestion, setWithGestion] = useState(true);

  const total = useMemo(() => {
    let next = BASE_PRICE;
    if (withControl) next += CONTROL_ADDON;
    if (withGestion) next += GESTION_ADDON;
    return next;
  }, [withControl, withGestion]);

  const selectedTier = useMemo(() => {
    if (withControl && withGestion) return 'total';
    if (withControl) return 'control';
    if (withGestion) return 'gestion';
    return 'base';
  }, [withControl, withGestion]);

  return (
    <section
      id="precio"
      className="scroll-mt-[4.5rem] border-t border-stone-200/60 bg-gradient-to-b from-[#fafafa] to-white px-4 py-14 sm:scroll-mt-24 sm:px-6 sm:py-20"
      aria-labelledby="precio-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D32F2F]/90">Pricing modular</p>
          <h2 id="precio-heading" className="mt-2 text-balance text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
            Empieza por lo basico y suma cuando toque
          </h2>
          <p className="mt-3 text-pretty text-sm text-stone-600 sm:text-base">
            Base obligatoria de pedidos y recepcion. A partir de ahi activas packs por necesidad real de tu cocina.
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-[0_18px_44px_-24px_rgba(15,23,42,0.18)] ring-1 ring-stone-100 sm:p-6">
            <p className="text-[11px] font-black uppercase tracking-wide text-stone-500">Configurador rapido</p>

            <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-zinc-900">Base operativa</p>
                  <p className="mt-1 text-xs text-zinc-600">Pedidos y recepcion</p>
                </div>
                <p className="text-lg font-black text-zinc-900">{BASE_PRICE} EUR</p>
              </div>
            </div>

            <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
              <div>
                <p className="text-sm font-bold text-zinc-900">Pack Control</p>
                <p className="mt-1 text-xs text-zinc-600">{CONTROL_MODULES.join(' · ')}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-zinc-900">+{CONTROL_ADDON} EUR</p>
                <input
                  type="checkbox"
                  checked={withControl}
                  onChange={(e) => setWithControl(e.target.checked)}
                  className="mt-2 h-4 w-4 rounded border-zinc-300 text-[#D32F2F] focus:ring-[#D32F2F]/25"
                />
              </div>
            </label>

            <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
              <div>
                <p className="text-sm font-bold text-zinc-900">Pack Gestion</p>
                <p className="mt-1 text-xs text-zinc-600">{GESTION_MODULES.join(' · ')}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-zinc-900">+{GESTION_ADDON} EUR</p>
                <input
                  type="checkbox"
                  checked={withGestion}
                  onChange={(e) => setWithGestion(e.target.checked)}
                  className="mt-2 h-4 w-4 rounded border-zinc-300 text-[#D32F2F] focus:ring-[#D32F2F]/25"
                />
              </div>
            </label>

            <div className="mt-4 rounded-2xl border border-[#D32F2F]/25 bg-[#D32F2F]/5 p-4">
              <p className="text-[11px] font-black uppercase tracking-wide text-[#B91C1C]">Total estimado por local</p>
              <p className="mt-1 text-3xl font-black tracking-tight text-zinc-900">{total} EUR/mes</p>
              <p className="mt-1 text-xs font-semibold text-zinc-600">
                Chat del local <span className="text-emerald-700">siempre incluido</span>.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                No pagas por modulos que no usas. Puedes empezar con base y ampliar despues.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <article className="relative overflow-hidden rounded-3xl border border-[#D32F2F]/25 bg-white p-5 shadow-[0_20px_50px_-30px_rgba(211,47,47,0.5)] ring-1 ring-[#D32F2F]/10 sm:p-6">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#D32F2F] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                <Sparkles className="h-3 w-3" />
                Recomendado
              </span>
              <h3 className="mt-3 text-xl font-black tracking-tight text-zinc-900">Pack Total</h3>
              <p className="mt-1 text-sm text-zinc-600">Control operativo completo para local con ritmo alto.</p>
              <p className="mt-3 text-3xl font-black tracking-tight text-zinc-900">{TOTAL_RECOMMENDED} EUR/mes</p>
              <ul className="mt-4 space-y-2 text-sm text-zinc-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Pedidos y recepcion + Pack Control + Pack Gestion
                </li>
                <li className="flex items-start gap-2">
                  <MessageCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Chat del local incluido en todos los planes
                </li>
              </ul>
              <p className="mt-4 text-xs text-zinc-500">
                Ideal para quien quiere una sola app para operacion, seguridad y rentabilidad.
              </p>
            </article>

            <article className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 ring-1 ring-zinc-100">
              <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Modulos proximamente</p>
              <p className="mt-2 text-sm font-semibold text-zinc-800">Fichaje · Horarios · Cocina central</p>
              <p className="mt-1 text-xs text-zinc-600">
                Se muestran fuera de los packs activos. No se cobran en esta estructura actual.
              </p>
            </article>

            <p className="text-xs text-zinc-500">
              Precios orientativos por local. Configuracion final segun puesta en marcha y necesidades.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
