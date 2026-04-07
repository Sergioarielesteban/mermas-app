'use client';

import React from 'react';
import { useAuth } from '@/components/AuthProvider';

const BETA_PURCHASES_EMAILS = ['sergioarielesteban@hotmail.com'];

export default function PedidosPage() {
  const { email } = useAuth();
  const canSeePurchases = Boolean(email && BETA_PURCHASES_EMAILS.includes(email.toLowerCase()));

  if (!canSeePurchases) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">No disponible</p>
        <p className="mt-1 text-sm text-zinc-600">
          Este modulo aun no esta habilitado para este usuario.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Modulo beta</p>
        <h1 className="pt-1 text-lg font-black text-zinc-900">Pedidos</h1>
        <p className="pt-2 text-sm text-zinc-600">
          Pantalla en construccion. Aqui ira el flujo de pedidos y recepcion para Mataro.
        </p>
      </div>
    </div>
  );
}
