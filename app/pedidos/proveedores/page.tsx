'use client';

import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { MOCK_SUPPLIERS } from '@/lib/pedidos-mock-catalog';

export default function ProveedoresPage() {
  const { localCode, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email);
  if (!canUse) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Modulo no habilitado</p>
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible solo para el local de Mataro.</p>
      </section>
    );
  }
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-lg font-black text-zinc-900">Proveedores y catalogo</h1>
        <p className="pt-1 text-sm text-zinc-600">Demo inicial con 3 proveedores ficticios y sus productos.</p>
      </section>

      {MOCK_SUPPLIERS.map((supplier) => (
        <section key={supplier.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-sm font-black text-zinc-900">{supplier.name}</p>
          <p className="pt-1 text-xs text-zinc-500">Contacto demo: {supplier.contact}</p>
          <div className="mt-3 space-y-2">
            {supplier.products.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                <p className="text-sm text-zinc-800">{p.name}</p>
                <p className="text-xs font-semibold text-zinc-600">
                  {p.pricePerUnit.toFixed(2)} EUR/{p.unit}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
