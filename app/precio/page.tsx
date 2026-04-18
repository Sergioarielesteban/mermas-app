'use client';

import Link from 'next/link';
import React from 'react';

export default function PrecioPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-zinc-50/80 p-8 text-center shadow-sm ring-1 ring-zinc-100">
        <p className="text-xs font-bold uppercase tracking-widest text-[#D32F2F]">Chef-One</p>
        <p className="mt-4 text-4xl font-black tabular-nums text-zinc-900">39,90 €</p>
        <p className="mt-1 text-sm font-semibold text-zinc-600">al mes · por local</p>
        <p className="mt-6 text-balance text-base font-medium text-zinc-800">Menos de 2 menús al mes</p>
        <p className="mt-2 text-sm text-zinc-600">
          Si la app te evita una merma o un error de pedido, ya se paga sola.
        </p>
        <Link
          href="/login"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-2xl bg-[#D32F2F] text-sm font-bold text-white shadow-md"
        >
          Empezar ahora
        </Link>
        <Link href="/onboarding" className="mt-4 block text-sm font-semibold text-zinc-600 underline">
          Ver introducción
        </Link>
        <Link href="/" className="mt-2 block text-sm text-zinc-500 underline">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
