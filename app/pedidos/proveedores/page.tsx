'use client';

import React from 'react';

export default function ProveedoresPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-lg font-black text-zinc-900">Proveedores y catalogo</h1>
        <p className="pt-1 text-sm text-zinc-600">
          Aqui gestionaremos proveedores, productos por proveedor y precios de compra.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-semibold text-zinc-800">Estado actual</p>
        <p className="pt-1 text-sm text-zinc-600">
          Pantalla base creada. Falta alta/edicion de proveedor y tabla de productos.
        </p>
      </section>
    </div>
  );
}
