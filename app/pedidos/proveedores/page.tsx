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

const PREFERRED_CONTACT_BY_SUPPLIER: Record<string, string> = {
  ROMEU: '699446517',
  'CARNES ROMEU': '699446517',
  ASSOLIM: '622915421',
  TGT: '695292301',
  'CASA VALLES': '629111218',
  FERRER: '696248973',
};

const DEFAULT_SUPPLIER_CONTACT = '622915421';

function normalizeUpper(value: string) {
  return value.trim().toUpperCase();
}

function normalizeUnit(raw: string): Unit {
  const value = raw.trim().toLowerCase();
  if (value.includes('kg') || value === 'kilo' || value === 'kilos') return 'kg';
  if (value.includes('caja')) return 'caja';
  if (value.includes('paquete')) return 'paquete';
  if (value.includes('bandeja')) return 'bandeja';
  if (value.includes('bolsa')) return 'bolsa';
  if (value.includes('racion')) return 'racion';
  return 'ud';
}

function parseDecimal(raw: string) {
  const normalized = raw.trim().replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/** Kg estimado por bandeja (3 decimales). Vacío = sin estimación. */
function parseKgEstimate(raw: string) {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * 1000) / 1000;
}

type ProductDraft = { name: string; unit: Unit; price: string; vatRate: string; estimatedKg: string };

export default function ProveedoresPage() {
  const { localCode, localName, localId, email } = useAuth();
  const canUse = canAccessPedidos(localCode, email, localName, localId);
  const [suppliers, setSuppliers] = React.useState<PedidoSupplier[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [showDeletedBanner, setShowDeletedBanner] = React.useState(false);
  const deletedBannerTimeoutRef = React.useRef<number | null>(null);
  const [supplierName, setSupplierName] = React.useState('');
  const [supplierContact, setSupplierContact] = React.useState('');
  const [productSupplierId, setProductSupplierId] = React.useState('');
  const [productName, setProductName] = React.useState('');
  const [productUnit, setProductUnit] = React.useState<Unit>('ud');
  const [productPrice, setProductPrice] = React.useState('');
  const [productEstimatedKg, setProductEstimatedKg] = React.useState('');
  const [productVat, setProductVat] = React.useState('0,21');
  const [editingSupplierId, setEditingSupplierId] = React.useState<string | null>(null);
  const [editingProductId, setEditingProductId] = React.useState<string | null>(null);
  const [supplierDrafts, setSupplierDrafts] = React.useState<Record<string, { name: string; contact: string }>>({});
  const [productDrafts, setProductDrafts] = React.useState<Record<string, ProductDraft>>({});

  const reload = React.useCallback(() => {
    if (!canUse) return;
    if (!localId) {
      setMessage('No se pudo cargar proveedores: tu usuario no tiene local_id activo en perfil.');
      return;
    }
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
                vatRate: String(p.vatRate ?? 0),
                estimatedKg:
                  p.unit === 'bandeja' && p.estimatedKgPerUnit != null && p.estimatedKgPerUnit > 0
                    ? String(p.estimatedKgPerUnit)
                    : '',
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

  React.useEffect(
    () => () => {
      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
    },
    [],
  );

  const saveSupplier = () => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    const name = normalizeUpper(supplierName);
    if (!name) return setMessage('Nombre de proveedor obligatorio.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    void createSupplier(supabase, localId, name, supplierContact.trim() || DEFAULT_SUPPLIER_CONTACT)
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
    const name = normalizeUpper(productName);
    const price = Number(productPrice.replace(',', '.'));
    const vatRate = Number(productVat.replace(',', '.'));
    if (!name || !Number.isFinite(price) || price <= 0) return setMessage('Producto y precio válidos son obligatorios.');
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) return setMessage('IVA inválido. Usa 0,21 o 0,10.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    let estimatedKgPerUnit: number | null = null;
    if (productUnit === 'bandeja') {
      const parsedKg = parseKgEstimate(productEstimatedKg);
      if (parsedKg === undefined) return setMessage('Kg estimado por bandeja inválido (usa un número > 0 o déjalo vacío).');
      estimatedKgPerUnit = parsedKg;
    }
    void createSupplierProduct(supabase, localId, productSupplierId, {
      name,
      unit: productUnit,
      pricePerUnit: price,
      vatRate,
      parStock: 0,
      estimatedKgPerUnit,
    })
      .then(() => {
        setProductName('');
        setProductPrice('');
        setProductEstimatedKg('');
        setProductVat('0,21');
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
      name: normalizeUpper(name),
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
    const vatRate = Number((draft?.vatRate ?? '').replace(',', '.'));
    if (!name || !Number.isFinite(price) || price <= 0) {
      return setMessage('Producto, unidad y precio válido son obligatorios.');
    }
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) {
      return setMessage('IVA inválido. Usa 0,21 o 0,10.');
    }
    let estimatedKgPerUnit: number | null = null;
    if (draft.unit === 'bandeja') {
      const parsedKg = parseKgEstimate(draft.estimatedKg ?? '');
      if (parsedKg === undefined) return setMessage('Kg estimado por bandeja inválido (usa un número > 0 o déjalo vacío).');
      estimatedKgPerUnit = parsedKg;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    void updateSupplierProduct(supabase, localId, productId, {
      name: normalizeUpper(name),
      unit: draft.unit,
      pricePerUnit: price,
      vatRate,
      parStock: 0,
      estimatedKgPerUnit,
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
        setShowDeletedBanner(true);
        if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
        deletedBannerTimeoutRef.current = window.setTimeout(() => {
          setShowDeletedBanner(false);
          deletedBannerTimeoutRef.current = null;
        }, 1000);
        reload();
      })
      .catch((err: Error) => setMessage(`No se pudo eliminar proveedor: ${err.message}`));
  };

  if (!canUse) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Modulo no habilitado</p>
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible para los locales de Mataro y Premia.</p>
      </section>
    );
  }
  return (
    <div className="space-y-4">
      {showDeletedBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
          <div className="rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black uppercase tracking-wide text-white">ELIMINADO</p>
          </div>
        </div>
      ) : null}
      <section>
        <Link
          href="/pedidos"
          className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          ← Atras
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-center text-lg font-black text-zinc-900">PROVEEDORES Y PRODUCTOS</h1>
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
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
            <input
              value={productVat}
              onChange={(e) => setProductVat(e.target.value)}
              placeholder="IVA (0,21)"
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
            />
          </div>
          {productUnit === 'bandeja' ? (
            <input
              value={productEstimatedKg}
              onChange={(e) => setProductEstimatedKg(e.target.value)}
              placeholder="Kg estimados por bandeja (opcional)"
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
            />
          ) : null}
          <button
            type="button"
            onClick={saveSupplierProduct}
            className="h-10 rounded-xl bg-[#D32F2F] px-3 text-sm font-bold text-white"
          >
            Guardar producto
          </button>
        </div>
      </section>

      {[...suppliers]
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .map((supplier) => (
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
            {[...supplier.products]
              .sort((a, b) => a.name.localeCompare(b.name, 'es'))
              .map((p) => (
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
                            vatRate: prev[p.id]?.vatRate ?? String(p.vatRate ?? 0),
                            estimatedKg:
                              prev[p.id]?.estimatedKg ??
                              (p.unit === 'bandeja' && p.estimatedKgPerUnit != null && p.estimatedKgPerUnit > 0
                                ? String(p.estimatedKgPerUnit)
                                : ''),
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
                  {p.pricePerUnit.toFixed(2)} €/{p.unit} · IVA {(p.vatRate * 100).toFixed(0)}%
                  {p.unit === 'bandeja' && p.estimatedKgPerUnit != null && p.estimatedKgPerUnit > 0
                    ? ` · ~${p.estimatedKgPerUnit} kg/bandeja`
                    : ''}
                </p>
                {editingProductId === p.id ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-white p-2">
                    <input
                      value={productDrafts[p.id]?.name ?? ''}
                      onChange={(e) =>
                        setProductDrafts((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] ?? { name: '', unit: 'ud', price: '', vatRate: '0', estimatedKg: '' }),
                            name: e.target.value,
                          },
                        }))
                      }
                      placeholder="Nombre producto"
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <select
                        value={productDrafts[p.id]?.unit ?? 'ud'}
                        onChange={(e) =>
                          setProductDrafts((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...(prev[p.id] ?? { name: '', unit: 'ud', price: '', vatRate: '0', estimatedKg: '' }),
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
                            [p.id]: {
                              ...(prev[p.id] ?? { name: '', unit: 'ud', price: '', vatRate: '0', estimatedKg: '' }),
                              price: e.target.value,
                            },
                          }))
                        }
                        placeholder="Precio unidad"
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                      />
                      <input
                        value={productDrafts[p.id]?.vatRate ?? ''}
                        onChange={(e) =>
                          setProductDrafts((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...(prev[p.id] ?? { name: '', unit: 'ud', price: '', vatRate: '0', estimatedKg: '' }),
                              vatRate: e.target.value,
                            },
                          }))
                        }
                        placeholder="IVA (0,21)"
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                      />
                    </div>
                    {productDrafts[p.id]?.unit === 'bandeja' ? (
                      <input
                        value={productDrafts[p.id]?.estimatedKg ?? ''}
                        onChange={(e) =>
                          setProductDrafts((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...(prev[p.id] ?? { name: '', unit: 'ud', price: '', vatRate: '0', estimatedKg: '' }),
                              estimatedKg: e.target.value,
                            },
                          }))
                        }
                        placeholder="Kg estimados por bandeja (opcional)"
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                      />
                    ) : null}
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
