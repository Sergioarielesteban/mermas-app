'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import Logo from '@/components/Logo';
import { enterDemoMode } from '@/lib/demo-mode';

export default function OnboardingPage() {
  const [step, setStep] = useState(0);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-zinc-50 to-white px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center">
        {step === 0 ? (
          <div className="text-center">
            <div className="flex justify-center">
              <Logo variant="login" className="shrink-0" />
            </div>
            <h1 className="mt-5 text-balance text-3xl font-black text-zinc-900 sm:mt-6 sm:text-4xl">
              Controla tu cocina en minutos
            </h1>
            <p className="mt-4 text-pretty text-sm text-zinc-600 sm:text-base">
              Pedidos, mermas, escandallos y finanzas en el móvil, sin perder el ritmo del servicio.
            </p>
            <button
              type="button"
              className="mt-10 h-12 w-full rounded-2xl bg-[#D32F2F] text-sm font-bold text-white shadow-lg shadow-red-900/20"
              onClick={() => setStep(1)}
            >
              Siguiente
            </button>
            <Link href="/login" className="mt-4 block text-center text-sm font-semibold text-zinc-600 underline">
              Ya tengo cuenta
            </Link>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="text-center">
            <h1 className="text-balance text-3xl font-black text-zinc-900 sm:text-4xl">
              Reduce costes, controla mermas y mejora tu rentabilidad
            </h1>
            <p className="mt-4 text-pretty text-sm text-zinc-600 sm:text-base">
              Ves dónde se va el dinero y qué tocar primero: sin hojas de cálculo ni reuniones eternas.
            </p>
            <button
              type="button"
              className="mt-10 h-12 w-full rounded-2xl bg-[#D32F2F] text-sm font-bold text-white shadow-lg shadow-red-900/20"
              onClick={() => setStep(2)}
            >
              Siguiente
            </button>
            <button
              type="button"
              className="mt-3 w-full text-sm font-semibold text-zinc-500"
              onClick={() => setStep(0)}
            >
              Atrás
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="text-center">
            <h1 className="text-balance text-2xl font-black text-zinc-900 sm:text-3xl">¿Cómo quieres empezar?</h1>
            <p className="mt-3 text-sm text-zinc-600">
              Prueba con datos de ejemplo o entra con tu usuario real.
            </p>
            <button
              type="button"
              className="mt-8 h-12 w-full rounded-2xl border-2 border-[#D32F2F] bg-white text-sm font-bold text-[#B91C1C]"
              onClick={() => {
                enterDemoMode();
                window.location.assign('/panel');
              }}
            >
              Ver demo
            </button>
            <Link
              href="/login"
              className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-[#D32F2F] text-sm font-bold text-white shadow-md"
            >
              Empezar
            </Link>
            <Link href="/precio" className="mt-6 block text-center text-sm font-semibold text-zinc-600 underline">
              Saber más sobre Chef-One
            </Link>
            <button
              type="button"
              className="mt-3 w-full text-sm font-semibold text-zinc-500"
              onClick={() => setStep(1)}
            >
              Atrás
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
