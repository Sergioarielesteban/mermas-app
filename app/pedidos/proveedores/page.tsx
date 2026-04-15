'use client';

import Link from 'next/link';
import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { dispatchPedidosDataChanged, usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import {
  formatDeliveryCycleSummary,
  normalizeDeliveryCycleWeekdays,
} from '@/lib/pedidos-coverage';
import { unitPriceCatalogSuffix } from '@/lib/pedidos-format';
import {
  readSuppliersSessionCache,
  writeSuppliersSessionCache,
} from '@/lib/pedidos-session-cache';
import {
  createSupplier,
  createSupplierProduct,
  deleteSupplier,
  fetchSuppliersWithProducts,
  setSupplierProductActive,
  updateSupplier,
  updateSupplierProduct,
  unitSupportsReceivedWeightKg,
  type PedidoSupplier,
} from '@/lib/pedidos-supabase';
import { PEDIDOS_SUPPLIERS_FROM_INVENTORY } from '@/lib/pedidos-inventory-import';
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

function normalizeMatch(value: string) {
  return normalizeUpper(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

/** Kg estimado por bandeja/caja (3 decimales). Vacío = sin estimación. */
function parseKgEstimate(raw: string) {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * 1000) / 1000;
}

/** Piezas usables en receta por envase; mínimo 1. */
function parseUnitsPerPack(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || normalized === '0') return 1;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 10000) / 10000;
}

/** Referencia de consumo semanal (7 días) para escalar al tramo entre repartos en Nuevo pedido. */
function parseParWeekly(raw: string): number {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Días 0=dom … 6=sáb; chips en orden operativo Lun→Dom. */
const DELIVERY_DAY_CHIPS: { day: number; label: string }[] = [
  { day: 1, label: 'L' },
  { day: 2, label: 'M' },
  { day: 3, label: 'X' },
  { day: 4, label: 'J' },
  { day: 5, label: 'V' },
  { day: 6, label: 'S' },
  { day: 0, label: 'D' },
];

type ProductDraft = {
  name: string;
  unit: Unit;
  price: string;
  vatRate: string;
  estimatedKg: string;
  unitsPerPack: string;
  recipeUnit: Unit;
  parWeekly: string;
};

export default function ProveedoresPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
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
  const [productUnitsPerPack, setProductUnitsPerPack] = React.useState('1');
  const [productRecipeUnit, setProductRecipeUnit] = React.useState<Unit>('ud');
  const [productParWeekly, setProductParWeekly] = React.useState('');
  const [editingSupplierId, setEditingSupplierId] = React.useState<string | null>(null);
  const [editingProductId, setEditingProductId] = React.useState<string | null>(null);
  const [expandedSupplierId, setExpandedSupplierId] = React.useState<string | null>(null);
  const [supplierDrafts, setSupplierDrafts] = React.useState<
    Record<
      string,
      { name: string; contact: string; deliveryCycleWeekdays: number[]; deliveryExceptionDates: string[] }
    >
  >({});
  const [exceptionInputBySupplier, setExceptionInputBySupplier] = React.useState<Record<string, string>>({});
  const [productDrafts, setProductDrafts] = React.useState<Record<string, ProductDraft>>({});
  const [bulkImportBusy, setBulkImportBusy] = React.useState(false);

  const applySupplierRows = React.useCallback((rows: PedidoSupplier[]) => {
    setSuppliers(rows);
    setProductSupplierId((prev) => prev || rows[0]?.id || '');
    setSupplierDrafts((prev) => {
      const next = { ...prev };
      for (const supplier of rows) {
        next[supplier.id] = next[supplier.id] ?? {
          name: supplier.name,
          contact: supplier.contact ?? '',
          deliveryCycleWeekdays: [...(supplier.deliveryCycleWeekdays ?? [])],
          deliveryExceptionDates: [...(supplier.deliveryExceptionDates ?? [])],
        };
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
              unitSupportsReceivedWeightKg(p.unit) && p.estimatedKgPerUnit != null && p.estimatedKgPerUnit > 0
                ? String(p.estimatedKgPerUnit)
                : '',
            unitsPerPack: String((p.unitsPerPack ?? 1) >= 1 ? (p.unitsPerPack ?? 1) : 1),
            recipeUnit: (p.recipeUnit ?? 'ud') as Unit,
            parWeekly: String((p.parStock ?? 0) > 0 ? p.parStock : ''),
          };
        }
      }
      return next;
    });
  }, []);

  const reload = React.useCallback(() => {
    if (!canUse) return;
    if (!localId) {
      setMessage('No se pudo cargar proveedores: tu usuario no tiene local_id activo en perfil.');
      return;
    }
    const lid = localId;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void fetchSuppliersWithProducts(supabase, lid)
      .then((rows) => {
        applySupplierRows(rows);
        writeSuppliersSessionCache(lid, rows);
      })
      .catch((err: Error) => setMessage(err.message));
  }, [applySupplierRows, canUse, localId]);

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const cached = readSuppliersSessionCache(localId);
    if (cached !== null) applySupplierRows(cached);
    reload();
  }, [applySupplierRows, canUse, localId, reload]);

  usePedidosDataChangedListener(reload, Boolean(hasPedidosEntry && canUse));

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
        dispatchPedidosDataChanged();
      })
      .catch((err: Error) => setMessage(err.message));
  };

  const importMissingSuppliersFromInventory = () => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    if (bulkImportBusy) return;

    void (async () => {
      setBulkImportBusy(true);
      setMessage(null);
      try {
        let providersCreated = 0;
        let productsCreated = 0;
        const latestSuppliers = await fetchSuppliersWithProducts(supabase, localId);
        const suppliersByName = new Map(
          latestSuppliers.map((s) => [normalizeMatch(s.name), s] as const),
        );

        for (const [supplierName, seedProducts] of Object.entries(PEDIDOS_SUPPLIERS_FROM_INVENTORY)) {
          const key = normalizeMatch(supplierName);
          let supplier = suppliersByName.get(key) ?? null;
          if (!supplier) {
            const created = await createSupplier(
              supabase,
              localId,
              supplierName,
              PREFERRED_CONTACT_BY_SUPPLIER[normalizeUpper(supplierName)] ?? DEFAULT_SUPPLIER_CONTACT,
            );
            supplier = {
              id: created.id,
              name: created.name,
              contact: created.contact ?? '',
              deliveryCycleWeekdays: normalizeDeliveryCycleWeekdays(
                (created as { delivery_cycle_weekdays?: number[] | null }).delivery_cycle_weekdays,
              ),
              deliveryExceptionDates: [],
              products: [],
            };
            suppliersByName.set(key, supplier);
            providersCreated += 1;
          }

          const existingProducts = new Set(supplier.products.map((p) => normalizeMatch(p.name)));
          for (const seed of seedProducts) {
            const pKey = normalizeMatch(seed.name);
            if (existingProducts.has(pKey)) continue;
            await createSupplierProduct(supabase, localId, supplier.id, {
              name: seed.name,
              unit: normalizeUnit(seed.unitRaw),
              pricePerUnit: seed.pricePerUnit,
              vatRate: 0.21,
              parStock: 0,
              estimatedKgPerUnit: null,
            });
            existingProducts.add(pKey);
            productsCreated += 1;
          }
        }

        setMessage(
          `Importación completada. Proveedores nuevos: ${providersCreated}. Productos nuevos: ${productsCreated}.`,
        );
        reload();
        dispatchPedidosDataChanged();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'No se pudo importar proveedores/artículos.');
      } finally {
        setBulkImportBusy(false);
      }
    })();
  };

  const saveSupplierProduct = () => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    if (!productSupplierId) return setMessage('Selecciona proveedor.');
    const name = normalizeUpper(productName);
    const price = Number(productPrice.replace(',', '.'));
    const vatRate = Number(productVat.replace(',', '.'));
    if (!name || !Number.isFinite(price) || price <= 0) return setMessage('Producto y precio válidos son obligatorios.');
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) return setMessage('IVA inválido. Usa 0,21 o 0,10.');
    const pack = parseUnitsPerPack(productUnitsPerPack);
    if (pack == null) return setMessage('«Piezas por envase» debe ser un número mayor que 0 (ej. 40).');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    let estimatedKgPerUnit: number | null = null;
    if (unitSupportsReceivedWeightKg(productUnit)) {
      const parsedKg = parseKgEstimate(productEstimatedKg);
      if (parsedKg === undefined) return setMessage('Kg estimado por envase inválido (usa un número > 0 o déjalo vacío).');
      estimatedKgPerUnit = parsedKg;
    }
    const parW = parseParWeekly(productParWeekly);
    void createSupplierProduct(supabase, localId, productSupplierId, {
      name,
      unit: productUnit,
      pricePerUnit: price,
      vatRate,
      parStock: parW,
      estimatedKgPerUnit,
      unitsPerPack: pack,
      recipeUnit: pack > 1 ? productRecipeUnit : null,
    })
      .then(() => {
        setProductName('');
        setProductPrice('');
        setProductEstimatedKg('');
        setProductVat('0,21');
        setProductUnitsPerPack('1');
        setProductRecipeUnit('ud');
        setProductParWeekly('');
        setMessage('Producto de proveedor guardado.');
        reload();
        dispatchPedidosDataChanged();
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
      deliveryCycleWeekdays: draft?.deliveryCycleWeekdays ?? [],
      deliveryExceptionDates: draft?.deliveryExceptionDates ?? [],
    })
      .then(() => {
        setEditingSupplierId(null);
        setMessage('Proveedor actualizado.');
        reload();
        dispatchPedidosDataChanged();
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
    const pack = parseUnitsPerPack(draft.unitsPerPack ?? '1');
    if (pack == null) return setMessage('«Piezas por envase» debe ser un número mayor que 0.');
    let estimatedKgPerUnit: number | null = null;
    if (unitSupportsReceivedWeightKg(draft.unit)) {
      const parsedKg = parseKgEstimate(draft.estimatedKg ?? '');
      if (parsedKg === undefined) return setMessage('Kg estimado por envase inválido (usa un número > 0 o déjalo vacío).');
      estimatedKgPerUnit = parsedKg;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    const parW = parseParWeekly(draft.parWeekly ?? '');
    void updateSupplierProduct(supabase, localId, productId, {
      name: normalizeUpper(name),
      unit: draft.unit,
      pricePerUnit: price,
      vatRate,
      parStock: parW,
      estimatedKgPerUnit,
      unitsPerPack: pack,
      recipeUnit: pack > 1 ? draft.recipeUnit : null,
    })
      .then(() => {
        setEditingProductId(null);
        setMessage('Producto actualizado.');
        reload();
        dispatchPedidosDataChanged();
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
        dispatchPedidosDataChanged();
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
        dispatchPedidosDataChanged();
      })
      .catch((err: Error) => setMessage(`No se pudo eliminar proveedor: ${err.message}`));
  };

  if (!hasPedidosEntry) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Modulo no habilitado</p>
        <p className="pt-1 text-sm text-zinc-600">Pedidos esta disponible para los locales de Mataro y Premia.</p>
      </section>
    );
  }
  if (!canUse) {
    return <PedidosPremiaLockedScreen />;
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
          <button
            type="button"
            onClick={importMissingSuppliersFromInventory}
            disabled={bulkImportBusy}
            className="h-10 rounded-xl border border-[#D32F2F] bg-white px-3 text-sm font-bold text-[#D32F2F] disabled:opacity-50"
          >
            {bulkImportBusy ? 'Importando…' : 'Importar proveedores y artículos (inventario)'}
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
              placeholder="Precio por unidad de pedido"
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
            />
            <input
              value={productVat}
              onChange={(e) => setProductVat(e.target.value)}
              placeholder="IVA (0,21)"
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
            />
          </div>
          <input
            value={productUnitsPerPack}
            onChange={(e) => setProductUnitsPerPack(e.target.value)}
            placeholder="Piezas por envase en receta (1 = ya es precio por pieza)"
            title="Ej. 40 panes en la caja. 1 = el precio ya es por unidad de receta."
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          />
          {parseUnitsPerPack(productUnitsPerPack) != null && parseUnitsPerPack(productUnitsPerPack)! > 1 ? (
            <div>
              <label className="text-xs font-semibold text-zinc-600">Unidad en escandallo (por pieza)</label>
              <select
                value={productRecipeUnit}
                onChange={(e) => setProductRecipeUnit(e.target.value as Unit)}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
              >
                <option value="ud">ud</option>
                <option value="kg">kg</option>
                <option value="bolsa">bolsa</option>
                <option value="racion">racion</option>
                <option value="caja">caja</option>
                <option value="paquete">paquete</option>
                <option value="bandeja">bandeja</option>
              </select>
            </div>
          ) : null}
          <p className="text-xs text-zinc-500">
            El precio es por la unidad de pedido (caja, kg…). Si un envase trae varias piezas, indica cuántas: el
            escandallo usará el precio por pieza automáticamente.
          </p>
          <input
            value={productParWeekly}
            onChange={(e) => setProductParWeekly(e.target.value)}
            placeholder="Consumo ref. semanal (opcional, misma unidad que el pedido)"
            title="Para sugerencias en Nuevo pedido: necesidad aproximada en 7 días; el sistema la reparte según días hasta el siguiente reparto."
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          />
          {unitSupportsReceivedWeightKg(productUnit) ? (
            <input
              value={productEstimatedKg}
              onChange={(e) => setProductEstimatedKg(e.target.value)}
              placeholder="Kg estimados por envase — bandeja/caja (opcional)"
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
        <section key={supplier.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200">
          <button
            type="button"
            onClick={() => setExpandedSupplierId((id) => (id === supplier.id ? null : supplier.id))}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
            aria-expanded={expandedSupplierId === supplier.id}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-zinc-900">{supplier.name}</p>
              <p className="pt-1 text-xs text-zinc-500">Contacto: {supplier.contact || '-'}</p>
              <p className="pt-0.5 text-[11px] text-zinc-500">
                Reparto: {formatDeliveryCycleSummary(supplier.deliveryCycleWeekdays ?? [])}
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#D32F2F]">
              {expandedSupplierId === supplier.id ? 'Ocultar' : 'Ver artículos'}
              <ChevronDown
                className={['h-4 w-4 transition-transform', expandedSupplierId === supplier.id ? 'rotate-180' : ''].join(' ')}
                aria-hidden
              />
            </span>
          </button>

          {expandedSupplierId === supplier.id ? (
            <div className="border-t border-zinc-100 px-4 pb-4 pt-3">
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingSupplierId((prev) => (prev === supplier.id ? null : supplier.id));
                    setSupplierDrafts((prev) => ({
                      ...prev,
                      [supplier.id]: {
                        name: prev[supplier.id]?.name ?? supplier.name,
                        contact: prev[supplier.id]?.contact ?? supplier.contact ?? '',
                        deliveryCycleWeekdays:
                          prev[supplier.id]?.deliveryCycleWeekdays ?? [...(supplier.deliveryCycleWeekdays ?? [])],
                        deliveryExceptionDates:
                          prev[supplier.id]?.deliveryExceptionDates ?? [...(supplier.deliveryExceptionDates ?? [])],
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

              {editingSupplierId === supplier.id ? (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <input
                value={supplierDrafts[supplier.id]?.name ?? ''}
                onChange={(e) =>
                  setSupplierDrafts((prev) => ({
                    ...prev,
                    [supplier.id]: {
                      ...(prev[supplier.id] ?? {
                        name: supplier.name,
                        contact: supplier.contact ?? '',
                        deliveryCycleWeekdays: [...(supplier.deliveryCycleWeekdays ?? [])],
                        deliveryExceptionDates: [...(supplier.deliveryExceptionDates ?? [])],
                      }),
                      name: e.target.value,
                    },
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
                    [supplier.id]: {
                      ...(prev[supplier.id] ?? {
                        name: supplier.name,
                        contact: supplier.contact ?? '',
                        deliveryCycleWeekdays: [...(supplier.deliveryCycleWeekdays ?? [])],
                        deliveryExceptionDates: [...(supplier.deliveryExceptionDates ?? [])],
                      }),
                      contact: e.target.value,
                    },
                  }))
                }
                placeholder="Telefono o email de contacto"
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
              />
              <div>
                <p className="text-[11px] font-semibold text-zinc-700">Días de reparto</p>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  Ninguno marcado = objetivo semanal completo (7 días). Marca 2 días (ej. L y J) para tramos Lun–Mié y
                  Jue–Dom en Nuevo pedido.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DELIVERY_DAY_CHIPS.map(({ day, label }) => {
                    const days = supplierDrafts[supplier.id]?.deliveryCycleWeekdays ?? [];
                    const sel = days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setSupplierDrafts((prev) => {
                            const cur = prev[supplier.id] ?? {
                              name: supplier.name,
                              contact: supplier.contact ?? '',
                              deliveryCycleWeekdays: [...(supplier.deliveryCycleWeekdays ?? [])],
                              deliveryExceptionDates: [...(supplier.deliveryExceptionDates ?? [])],
                            };
                            const set = new Set(cur.deliveryCycleWeekdays);
                            if (set.has(day)) set.delete(day);
                            else set.add(day);
                            return {
                              ...prev,
                              [supplier.id]: {
                                ...cur,
                                deliveryCycleWeekdays: [...set].sort((a, b) => a - b),
                              },
                            };
                          })
                        }
                        className={[
                          'h-8 min-w-[2rem] rounded-lg px-2 text-xs font-bold',
                          sel
                            ? 'bg-[#D32F2F] text-white ring-1 ring-[#B91C1C]'
                            : 'border border-zinc-300 bg-white text-zinc-700',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-zinc-700">Excepciones de reparto (festivos)</p>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  Si una semana cambia el día (ej. jueves festivo → miércoles), añádelo aquí.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="date"
                    value={exceptionInputBySupplier[supplier.id] ?? ''}
                    onChange={(e) =>
                      setExceptionInputBySupplier((prev) => ({ ...prev, [supplier.id]: e.target.value }))
                    }
                    className="h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = (exceptionInputBySupplier[supplier.id] ?? '').trim();
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                      setSupplierDrafts((prev) => {
                        const cur = prev[supplier.id] ?? {
                          name: supplier.name,
                          contact: supplier.contact ?? '',
                          deliveryCycleWeekdays: [...(supplier.deliveryCycleWeekdays ?? [])],
                          deliveryExceptionDates: [...(supplier.deliveryExceptionDates ?? [])],
                        };
                        if (cur.deliveryExceptionDates.includes(v)) return prev;
                        return {
                          ...prev,
                          [supplier.id]: {
                            ...cur,
                            deliveryExceptionDates: [...cur.deliveryExceptionDates, v].sort(),
                          },
                        };
                      });
                      setExceptionInputBySupplier((prev) => ({ ...prev, [supplier.id]: '' }));
                    }}
                    className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700"
                  >
                    Añadir
                  </button>
                </div>
                {(supplierDrafts[supplier.id]?.deliveryExceptionDates ?? []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(supplierDrafts[supplier.id]?.deliveryExceptionDates ?? []).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setSupplierDrafts((prev) => {
                            const cur = prev[supplier.id];
                            if (!cur) return prev;
                            return {
                              ...prev,
                              [supplier.id]: {
                                ...cur,
                                deliveryExceptionDates: cur.deliveryExceptionDates.filter((x) => x !== d),
                              },
                            };
                          })
                        }
                        className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900"
                        title="Quitar excepción"
                      >
                        {new Date(`${d}T00:00:00`).toLocaleDateString('es-ES')} ×
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] text-zinc-500">Sin excepciones guardadas.</p>
                )}
              </div>
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
                              (unitSupportsReceivedWeightKg(p.unit) && p.estimatedKgPerUnit != null && p.estimatedKgPerUnit > 0
                                ? String(p.estimatedKgPerUnit)
                                : ''),
                            unitsPerPack:
                              prev[p.id]?.unitsPerPack ?? String((p.unitsPerPack ?? 1) >= 1 ? (p.unitsPerPack ?? 1) : 1),
                            recipeUnit: prev[p.id]?.recipeUnit ?? (p.recipeUnit ?? 'ud'),
                            parWeekly:
                              prev[p.id]?.parWeekly ??
                              ((p.parStock ?? 0) > 0 ? String(p.parStock) : ''),
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
                  {p.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[p.unit]} · IVA {(p.vatRate * 100).toFixed(0)}%
                  {(p.unitsPerPack ?? 1) > 1 ? (
                    <>
                      {' '}
                      · escandallo ~{(p.pricePerUnit / (p.unitsPerPack ?? 1)).toFixed(4)} €/
                      {unitPriceCatalogSuffix[p.recipeUnit ?? 'ud']} (×{p.unitsPerPack ?? 1})
                    </>
                  ) : null}
                  {unitSupportsReceivedWeightKg(p.unit) && p.estimatedKgPerUnit != null && p.estimatedKgPerUnit > 0
                    ? ` · ~${p.estimatedKgPerUnit} kg/${p.unit}`
                    : ''}
                  {(p.parStock ?? 0) > 0 ? ` · ref. sem. ${p.parStock} ${unitPriceCatalogSuffix[p.unit]}` : ''}
                </p>
                {editingProductId === p.id ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-white p-2">
                    <input
                      value={productDrafts[p.id]?.name ?? ''}
                      onChange={(e) =>
                        setProductDrafts((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] ?? {
                              name: '',
                              unit: 'ud',
                              price: '',
                              vatRate: '0',
                              estimatedKg: '',
                              unitsPerPack: '1',
                              recipeUnit: 'ud' as Unit,
                              parWeekly: '',
                            }),
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
                              ...(prev[p.id] ?? {
                                name: '',
                                unit: 'ud',
                                price: '',
                                vatRate: '0',
                                estimatedKg: '',
                                unitsPerPack: '1',
                                recipeUnit: 'ud' as Unit,
                                parWeekly: '',
                              }),
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
                              ...(prev[p.id] ?? {
                                name: '',
                                unit: 'ud',
                                price: '',
                                vatRate: '0',
                                estimatedKg: '',
                                unitsPerPack: '1',
                                recipeUnit: 'ud' as Unit,
                                parWeekly: '',
                              }),
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
                              ...(prev[p.id] ?? {
                                name: '',
                                unit: 'ud',
                                price: '',
                                vatRate: '0',
                                estimatedKg: '',
                                unitsPerPack: '1',
                                recipeUnit: 'ud' as Unit,
                                parWeekly: '',
                              }),
                              vatRate: e.target.value,
                            },
                          }))
                        }
                        placeholder="IVA (0,21)"
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                      />
                    </div>
                    <input
                      value={productDrafts[p.id]?.parWeekly ?? ''}
                      onChange={(e) =>
                        setProductDrafts((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] ?? {
                              name: '',
                              unit: 'ud',
                              price: '',
                              vatRate: '0',
                              estimatedKg: '',
                              unitsPerPack: '1',
                              recipeUnit: 'ud' as Unit,
                              parWeekly: '',
                            }),
                            parWeekly: e.target.value,
                          },
                        }))
                      }
                      placeholder="Consumo ref. semanal (opcional)"
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                    />
                    <input
                      value={productDrafts[p.id]?.unitsPerPack ?? '1'}
                      onChange={(e) =>
                        setProductDrafts((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] ?? {
                              name: '',
                              unit: 'ud',
                              price: '',
                              vatRate: '0',
                              estimatedKg: '',
                              unitsPerPack: '1',
                              recipeUnit: 'ud' as Unit,
                              parWeekly: '',
                            }),
                            unitsPerPack: e.target.value,
                          },
                        }))
                      }
                      placeholder="Piezas por envase (receta)"
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                    />
                    {parseUnitsPerPack(productDrafts[p.id]?.unitsPerPack ?? '1') != null &&
                    parseUnitsPerPack(productDrafts[p.id]?.unitsPerPack ?? '1')! > 1 ? (
                      <select
                        value={productDrafts[p.id]?.recipeUnit ?? 'ud'}
                        onChange={(e) =>
                          setProductDrafts((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...(prev[p.id] ?? {
                                name: '',
                                unit: 'ud',
                                price: '',
                                vatRate: '0',
                                estimatedKg: '',
                                unitsPerPack: '1',
                                recipeUnit: 'ud' as Unit,
                                parWeekly: '',
                              }),
                              recipeUnit: e.target.value as Unit,
                            },
                          }))
                        }
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
                      >
                        <option value="ud">ud (escandallo)</option>
                        <option value="kg">kg</option>
                        <option value="bolsa">bolsa</option>
                        <option value="racion">racion</option>
                        <option value="caja">caja</option>
                        <option value="paquete">paquete</option>
                        <option value="bandeja">bandeja</option>
                      </select>
                    ) : null}
                    {unitSupportsReceivedWeightKg(productDrafts[p.id]?.unit ?? p.unit) ? (
                      <input
                        value={productDrafts[p.id]?.estimatedKg ?? ''}
                        onChange={(e) =>
                          setProductDrafts((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...(prev[p.id] ?? {
                                name: '',
                                unit: 'ud',
                                price: '',
                                vatRate: '0',
                                estimatedKg: '',
                                unitsPerPack: '1',
                                recipeUnit: 'ud' as Unit,
                                parWeekly: '',
                              }),
                              estimatedKg: e.target.value,
                            },
                          }))
                        }
                        placeholder="Kg estimados por envase (opcional)"
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
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
