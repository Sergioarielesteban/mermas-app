'use client';

import Link from 'next/link';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canAccessPedidos } from '@/lib/pedidos-access';
import {
  createSupplier,
  createSupplierProduct,
  deleteSupplier,
  fetchSuppliersWithProducts,
  setSupplierProductActive,
  updateSupplier,
  updateSupplierProduct,
  type PedidoSupplier,
} from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

export default function ProveedoresPage() {
  const { localCode, localName, localId, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email, localName, localId);
  const [suppliers, setSuppliers] = React.useState<PedidoSupplier[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [supplierName, setSupplierName] = React.useState('');
  const [supplierContact, setSupplierContact] = React.useState('');
  const [productSupplierId, setProductSupplierId] = React.useState('');
  const [productName, setProductName] = React.useState('');
  const [productUnit, setProductUnit] = React.useState<Unit>('ud');
  const [productPrice, setProductPrice] = React.useState('');
  const [editingSupplierId, setEditingSupplierId] = React.useState<string | null>(null);
  const [editingProductId, setEditingProductId] = React.useState<string | null>(null);
  const [supplierDrafts, setSupplierDrafts] = React.useState<Record<string, { name: string; contact: string }>>({});
  const [productDrafts, setProductDrafts] = React.useState<Record<string, { name: string; unit: Unit; price: string }>>({});

  const reload = React.useCallback(() => {
    if (!canUse || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchSuppliersWithProducts(supabase, localId)
      .then((rows) => {
        setSuppliers(rows);
        if (!productSupplierId && rows[0]?.id) setProductSupplierId(rows[0].id);
        setSupplierDrafts((prev) => {
          const next = { ...prev };
          for (const supplier of rows) {
            next[supplier.id] = next[supplier.id] ?? { name: supplier.name, contact: supplier.contact ?? '' };
          }
          return next;
        });
        setProductDrafts((prev) => {
          const next = { ...prev };
          for (const supplier of rows) {
            for (const p of supplier.products) {
              next[p.id] = next[p.id] ?? {
                name: p.name,
                unit: p.unit,
                price: String(p.pricePerUnit),
              };
            }
          }
          return next;
        });
      })
      .catch((err: Error) => setMessage(err.message));
  }, [canUse, localId, productSupplierId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const saveSupplier = () => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    const name = supplierName.trim();
    if (!name) return setMessage('Nombre de proveedor obligatorio.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    void createSupplier(supabase, localId, name, supplierContact)
      .then(() => {
        setSupplierName('');
        setSupplierContact('');
        setMessage('Proveedor guardado.');
        reload();
      })
      .catch((err: Error) => setMessage(err.message));
  };

  const saveSupplierProduct = () => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    if (!productSupplierId) return setMessage('Selecciona proveedor.');
    const name = productName.trim();
    const price = Number(productPrice.replace(',', '.'));
    if (!name || !Number.isFinite(price) || price <= 0) return setMessage('Producto y precio válidos son obligatorios.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    void createSupplierProduct(supabase, localId, productSupplierId, {
      name,
      unit: productUnit,
      pricePerUnit: price,
    })
      .then(() => {
        setProductName('');
        setProductPrice('');
        setMessage('Producto de proveedor guardado.');
        reload();
      })
      .catch((err: Error) => setMessage(err.message));
  };

  const saveSupplierChanges = (supplierId: string) => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    const draft = supplierDrafts[supplierId];
    const name = draft?.name?.trim() ?? '';
    if (!name) return setMessage('El nombre del proveedor no puede estar vacío.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    void updateSupplier(supabase, localId, supplierId, {
      name,
      contact: draft?.contact ?? '',
    })
      .then(() => {
        setEditingSupplierId(null);
        setMessage('Proveedor actualizado.');
        reload();
      })
      .catch((err: Error) => setMessage(err.message));
  };

  const saveProductChanges = (productId: string) => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    const draft = productDrafts[productId];
    const name = draft?.name?.trim() ?? '';
    const price = Number((draft?.price ?? '').replace(',', '.'));
    if (!name || !Number.isFinite(price) || price <= 0) {
      return setMessage('Producto, unidad y precio válido son obligatorios.');
    }
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    void updateSupplierProduct(supabase, localId, productId, {
      name,
      unit: draft.unit,
      pricePerUnit: price,
    })
      .then(() => {
        setEditingProductId(null);
        setMessage('Producto actualizado.');
        reload();
      })
      .catch((err: Error) => setMessage(err.message));
  };

  const disableProduct = (productId: string) => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    void setSupplierProductActive(supabase, localId, productId, false)
      .then(() => {
        setMessage('Producto desactivado.');
        reload();
      })
      .catch((err: Error) => setMessage(err.message));
  };

  const removeSupplier = (supplierId: string, supplierName: string) => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    const ok = window.confirm(`¿Eliminar proveedor "${supplierName}"?`);
    if (!ok) return;
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    void deleteSupplier(supabase, localId, supplierId)
      .then(() => {
        setMessage('Proveedor eliminado.');
        reload();
      })
      .catch((err: Error) => setMessage(`No se pudo eliminar proveedor: ${err.message}`));
  };

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
      <section>
        <Link
          href="/pedidos"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          ← Atras
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-lg font-black text-zinc-900">Proveedores y catalogo</h1>
        <p className="pt-1 text-sm text-zinc-600">Gestiona proveedores reales y su catalogo en Supabase.</p>
      </section>

      {message ? (
        <section className="rounded-2xl bg-white p-4 text-sm text-zinc-700 ring-1 ring-zinc-200">{message}</section>
      ) : null}

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Nuevo proveedor</p>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="Nombre proveedor"
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          />
          <input
            value={supplierContact}
            onChange={(e) => setSupplierContact(e.target.value)}
            placeholder="Contacto (email/teléfono)"
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          />
          <button
            type="button"
            onClick={saveSupplier}
            className="h-10 rounded-xl bg-[#2563EB] px-3 text-sm font-bold text-white"
          >
            Guardar proveedor
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Añadir producto a proveedor</p>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <select
            value={productSupplierId}
            onChange={(e) => setProductSupplierId(e.target.value)}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Nombre producto"
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={productUnit}
              onChange={(e) => setProductUnit(e.target.value as Unit)}
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
            >
              <option value="ud">ud</option>
              <option value="kg">kg</option>
              <option value="caja">caja</option>
              <option value="paquete">paquete</option>
              <option value="bandeja">bandeja</option>
              <option value="bolsa">bolsa</option>
              <option value="racion">racion</option>
            </select>
            <input
              value={productPrice}
              onChange={(e) => setProductPrice(e.target.value)}
              placeholder="Precio unidad"
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={saveSupplierProduct}
            className="h-10 rounded-xl bg-[#D32F2F] px-3 text-sm font-bold text-white"
          >
            Guardar producto
          </button>
        </div>
      </section>

      {suppliers.map((supplier) => (
        <section key={supplier.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-zinc-900">{supplier.name}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingSupplierId((prev) => (prev === supplier.id ? null : supplier.id));
                  setSupplierDrafts((prev) => ({
                    ...prev,
                    [supplier.id]: {
                      name: prev[supplier.id]?.name ?? supplier.name,
                      contact: prev[supplier.id]?.contact ?? supplier.contact ?? '',
                    },
                  }));
                }}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700"
              >
                {editingSupplierId === supplier.id ? 'Cerrar' : 'Editar proveedor'}
              </button>
              <button
                type="button"
                onClick={() => removeSupplier(supplier.id, supplier.name)}
                className="rounded-lg border border-[#B91C1C] bg-white px-2 py-1 text-xs font-semibold text-[#B91C1C]"
              >
                Eliminar proveedor
              </button>
            </div>
          </div>
          <p className="pt-1 text-xs text-zinc-500">Contacto: {supplier.contact || '-'}</p>
          {editingSupplierId === supplier.id ? (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <input
                value={supplierDrafts[supplier.id]?.name ?? ''}
                onChange={(e) =>
                  setSupplierDrafts((prev) => ({
                    ...prev,
                    [supplier.id]: { ...(prev[supplier.id] ?? { name: '', contact: '' }), name: e.target.value },
                  }))
                }
                placeholder="Nombre proveedor"
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
              />
              <input
                value={supplierDrafts[supplier.id]?.contact ?? ''}
                onChange={(e) =>
                  setSupplierDrafts((prev) => ({
                    ...prev,
                    [supplier.id]: { ...(prev[supplier.id] ?? { name: '', contact: '' }), contact: e.target.value },
                  }))
                }
                placeholder="Telefono o email de contacto"
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
              />
              <button
                type="button"
                onClick={() => saveSupplierChanges(supplier.id)}
                className="h-10 rounded-xl bg-[#2563EB] px-3 text-sm font-bold text-white"
              >
                Guardar cambios proveedor
              </button>
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {supplier.products.map((p) => (
              <div key={p.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-zinc-800">{p.name}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProductId((prev) => (prev === p.id ? null : p.id));
                        setProductDrafts((prev) => ({
                          ...prev,
                          [p.id]: {
                            name: prev[p.id]?.name ?? p.name,
                            unit: prev[p.id]?.unit ?? p.unit,
                            price: prev[p.id]?.price ?? String(p.pricePerUnit),
                          },
                        }));
                      }}
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700"
                    >
                      {editingProductId === p.id ? 'Cerrar' : 'Editar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => disableProduct(p.id)}
                      className="rounded-lg border border-[#B91C1C] bg-white px-2 py-1 text-xs font-semibold text-[#B91C1C]"
                    >
                      Desactivar
                    </button>
                  </div>
                </div>
                <p className="pt-1 text-xs font-semibold text-zinc-600">
                  {p.pricePerUnit.toFixed(2)} EUR/{p.unit}
                </p>
                {editingProductId === p.id ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-white p-2">
                    <input
                      value={productDrafts[p.id]?.name ?? ''}
                      onChange={(e) =>
                        setProductDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...(prev[p.id] ?? { name: '', unit: 'ud', price: '' }), name: e.target.value },
                        }))
                      }
                      placeholder="Nombre producto"
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={productDrafts[p.id]?.unit ?? 'ud'}
                        onChange={(e) =>
                          setProductDrafts((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...(prev[p.id] ?? { name: '', unit: 'ud', price: '' }),
                              unit: e.target.value as Unit,
                            },
                          }))
                        }
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
                      >
                        <option value="ud">ud</option>
                        <option value="kg">kg</option>
                        <option value="caja">caja</option>
                        <option value="paquete">paquete</option>
                        <option value="bandeja">bandeja</option>
                        <option value="bolsa">bolsa</option>
                        <option value="racion">racion</option>
                      </select>
                      <input
                        value={productDrafts[p.id]?.price ?? ''}
                        onChange={(e) =>
                          setProductDrafts((prev) => ({
                            ...prev,
                            [p.id]: { ...(prev[p.id] ?? { name: '', unit: 'ud', price: '' }), price: e.target.value },
                          }))
                        }
                        placeholder="Precio unidad"
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => saveProductChanges(p.id)}
                      className="h-9 rounded-lg bg-[#2563EB] px-3 text-sm font-bold text-white"
                    >
                      Guardar cambios producto
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
