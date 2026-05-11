'use client';

import Link from 'next/link';
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Beef,
  CalendarDays,
  ChevronRight,
  Coffee,
  Droplets,
  Fish,
  Milk,
  Package,
  Phone,
  Plus,
  Search,
  Snowflake,
  Sparkles,
  Truck,
} from 'lucide-react';
import { ProveedoresModalShell } from '@/components/pedidos/ProveedoresModalShell';
import { useAuth } from '@/components/AuthProvider';
import { appConfirm } from '@/lib/app-dialog-bridge';
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
  formatDecimalInputEs,
  formatMoneyEur,
  formatUnitPriceEur,
  parsePriceInput,
} from '@/lib/money-format';
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
  supplierProductHasDistinctBilling,
  unitSupportsReceivedWeightKg,
  type PedidoSupplier,
  type PedidoSupplierProduct,
} from '@/lib/pedidos-supabase';
import { formatCutoffHm, type PedidoAgendaMode } from '@/lib/pedidos-order-agenda-engine';
import {
  fetchReviewItemsForSupplier,
  fetchScheduleForSupplier,
  replaceReviewItemsForSupplier,
  upsertOrderSchedule,
} from '@/lib/pedidos-order-agenda-supabase';
import { PEDIDO_ORDER_UNITS, PEDIDO_RECIPE_UNITS } from '@/lib/pedidos-units';
import type { Unit } from '@/lib/types';

const DEFAULT_SUPPLIER_CONTACT = '622915421';

function normalizeUpper(value: string) {
  return value.trim().toUpperCase();
}

function normalizeMatch(value: string) {
  return normalizeUpper(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Icono suave por nombre (heurística simple; sin datos extra). */
function pickSupplierListIcon(name: string): LucideIcon {
  const n = normalizeMatch(name);
  if (/CARN|ROME|TERN|BOVI|VACU/.test(n)) return Beef;
  if (/PESC|MARIS|PESC/.test(n)) return Fish;
  if (/BEB|REFRE|ZUMO|AGUA/.test(n)) return Droplets;
  if (/CAFE|CAFÉ/.test(n)) return Coffee;
  if (/CONG|HELAD|NEVER/.test(n)) return Snowflake;
  if (/LACT|QUES|LECH|YOG/.test(n)) return Milk;
  if (/LIMP|LAV|DETER/.test(n)) return Sparkles;
  if (/TRANS|LOGIS/.test(n)) return Truck;
  return Package;
}

function normalizeUnit(raw: string): Unit {
  const value = raw.trim().toLowerCase();
  if (value.includes('kg') || value === 'kilo' || value === 'kilos') return 'kg';
  if (value.includes('docena')) return 'docena';
  if (value.includes('caja')) return 'caja';
  if (value.includes('paquete')) return 'paquete';
  if (value.includes('bandeja')) return 'bandeja';
  if (value.includes('bolsa')) return 'bolsa';
  if (value.includes('racion')) return 'racion';
  if (value === 'l' || value.includes('litro')) return 'litro';
  if (value.includes('ml')) return 'ml';
  if (value === 'g' || value.includes('gr') || value.includes('gramo')) return 'g';
  return 'ud';
}

/** €/kg o €/unidad de cobro (hasta 4 decimales internos). */
function parsePricePerBilling(raw: string) {
  const value = parsePriceInput(raw);
  if (value == null || value < 0) return null;
  return Math.round(value * 10000) / 10000;
}

/** Kg estimado por bandeja/caja (3 decimales). Vacío = sin estimación. */
function parseKgEstimate(raw: string) {
  const t = String(raw).trim();
  if (t === '') return null;
  const value = parsePriceInput(t);
  if (value == null || value <= 0) return undefined;
  return Math.round(value * 1000) / 1000;
}

/** Piezas usables en receta por envase; mínimo 1. */
function parseUnitsPerPack(raw: string): number | null {
  const t = String(raw).trim();
  if (t === '' || t === '0') return 1;
  const value = parsePriceInput(t);
  if (value == null || value <= 0) return null;
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

function findProductContext(
  list: PedidoSupplier[],
  productId: string,
): { supplier: PedidoSupplier; p: PedidoSupplierProduct } | null {
  for (const supplier of list) {
    const p = supplier.products.find((x) => x.id === productId);
    if (p) return { supplier, p };
  }
  return null;
}

type ProductDraft = {
  name: string;
  unit: Unit;
  price: string;
  vatRate: string;
  estimatedKg: string;
  unitsPerPack: string;
  recipeUnit: Unit;
  parWeekly: string;
  /** Pedido en envase, cobro al peso (€/kg). */
  dualKgBilling?: boolean;
  equivKg?: string;
  pricePerKg?: string;
};

const EMPTY_PRODUCT_DRAFT: ProductDraft = {
  name: '',
  unit: 'ud',
  price: '',
  vatRate: '0',
  estimatedKg: '',
  unitsPerPack: '1',
  recipeUnit: 'ud',
  parWeekly: '',
  dualKgBilling: false,
  equivKg: '',
  pricePerKg: '',
};

export default function ProveedoresPage() {
  const { localCode, localName, localId, email } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const [suppliers, setSuppliers] = React.useState<PedidoSupplier[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [showDeletedBanner, setShowDeletedBanner] = React.useState(false);
  const deletedBannerTimeoutRef = React.useRef<number | null>(null);
  const [newSupplierOpen, setNewSupplierOpen] = React.useState(false);
  const [newSupplierName, setNewSupplierName] = React.useState('');
  const [newSupplierContact, setNewSupplierContact] = React.useState('');
  const [addProductOpen, setAddProductOpen] = React.useState(false);
  React.useEffect(() => {
    if (!newSupplierOpen) return;
    setNewSupplierName('');
    setNewSupplierContact('');
  }, [newSupplierOpen]);
  const [productSupplierId, setProductSupplierId] = React.useState('');
  const [productName, setProductName] = React.useState('');
  const [productUnit, setProductUnit] = React.useState<Unit>('ud');
  const [productPrice, setProductPrice] = React.useState('');
  const [productEstimatedKg, setProductEstimatedKg] = React.useState('');
  const [productVat, setProductVat] = React.useState('0,21');
  const [productUnitsPerPack, setProductUnitsPerPack] = React.useState('1');
  const [productRecipeUnit, setProductRecipeUnit] = React.useState<Unit>('ud');
  const [productParWeekly, setProductParWeekly] = React.useState('');
  const [productDualKgBilling, setProductDualKgBilling] = React.useState(false);
  const [productEquivKg, setProductEquivKg] = React.useState('');
  const [productPricePerKg, setProductPricePerKg] = React.useState('');
  const [editingSupplierId, setEditingSupplierId] = React.useState<string | null>(null);
  const [editingProductId, setEditingProductId] = React.useState<string | null>(null);
  const [expandedSupplierId, setExpandedSupplierId] = React.useState<string | null>(() => { try { return localStorage.getItem('pedidos_expanded_supplier'); } catch { return null; } });
  React.useEffect(() => { try { if (expandedSupplierId) localStorage.setItem('pedidos_expanded_supplier', expandedSupplierId); else localStorage.removeItem('pedidos_expanded_supplier'); } catch {} }, [expandedSupplierId]);
  React.useEffect(() => { const handleScroll = () => { try { localStorage.setItem("pedidos_scroll", window.scrollY.toString()); } catch {} }; window.addEventListener("scroll", handleScroll); const saved = localStorage.getItem("pedidos_scroll"); if (saved) setTimeout(() => window.scrollTo(0, parseInt(saved)), 1500); return () => window.removeEventListener("scroll", handleScroll); }, []);
  const [supplierCatalogQuery, setSupplierCatalogQuery] = React.useState('');
  const [supplierDrafts, setSupplierDrafts] = React.useState<
    Record<
      string,
      { name: string; contact: string; deliveryCycleWeekdays: number[]; deliveryExceptionDates: string[] }
    >
  >({});
  const [exceptionInputBySupplier, setExceptionInputBySupplier] = React.useState<Record<string, string>>({});
  const [productDrafts, setProductDrafts] = React.useState<Record<string, ProductDraft>>({});

  const [agendaEnabled, setAgendaEnabled] = React.useState(false);
  const [agendaOrderDays, setAgendaOrderDays] = React.useState<number[]>([]);
  const [agendaCutoff, setAgendaCutoff] = React.useState('13:00');
  const [agendaReminder, setAgendaReminder] = React.useState(30);
  const [agendaDeliveryDays, setAgendaDeliveryDays] = React.useState<number[]>([]);
  const [agendaReviews, setAgendaReviews] = React.useState<Array<{ supplierProductId: string | null; name: string }>>(
    [],
  );
  const [agendaReviewPick, setAgendaReviewPick] = React.useState('');
  const [agendaMode, setAgendaMode] = React.useState<PedidoAgendaMode>('mandatory');

  React.useEffect(() => {
    if (!editingSupplierId || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      try {
        const [sch, rev] = await Promise.all([
          fetchScheduleForSupplier(supabase, localId, editingSupplierId),
          fetchReviewItemsForSupplier(supabase, localId, editingSupplierId),
        ]);
        if (cancelled) return;
        if (sch) {
          setAgendaEnabled(sch.enabled);
          setAgendaOrderDays([...(sch.order_weekdays ?? [])]);
          setAgendaCutoff(formatCutoffHm(sch.cutoff_time));
          setAgendaReminder(sch.reminder_minutes_before ?? 30);
          setAgendaDeliveryDays(sch.delivery_weekdays != null ? [...sch.delivery_weekdays] : []);
          setAgendaMode(sch.agenda_mode === 'review' ? 'review' : 'mandatory');
        } else {
          setAgendaEnabled(false);
          setAgendaOrderDays([]);
          setAgendaCutoff('13:00');
          setAgendaReminder(30);
          setAgendaDeliveryDays([]);
          setAgendaMode('mandatory');
        }
        setAgendaReviews(
          rev
            .filter((r) => r.enabled)
            .map((r) => ({
              supplierProductId: r.supplier_product_id,
              name: r.product_name_snapshot.trim() || 'Producto',
            })),
        );
        setAgendaReviewPick('');
      } catch {
        if (!cancelled) {
          setAgendaEnabled(false);
          setAgendaOrderDays([]);
          setAgendaReviews([]);
          setAgendaMode('mandatory');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingSupplierId, localId]);

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
            price: formatDecimalInputEs(p.pricePerUnit, 2),
            vatRate: formatDecimalInputEs(p.vatRate ?? 0, 2),
            estimatedKg:
              !supplierProductHasDistinctBilling(p) &&
              unitSupportsReceivedWeightKg(p.unit) &&
              p.estimatedKgPerUnit != null &&
              p.estimatedKgPerUnit > 0
                ? formatDecimalInputEs(p.estimatedKgPerUnit, 4)
                : '',
            unitsPerPack: String((p.unitsPerPack ?? 1) >= 1 ? (p.unitsPerPack ?? 1) : 1),
            recipeUnit: (p.recipeUnit ?? 'ud') as Unit,
            parWeekly: String((p.parStock ?? 0) > 0 ? p.parStock : ''),
            dualKgBilling: supplierProductHasDistinctBilling(p) && p.billingUnit === 'kg',
            equivKg:
              supplierProductHasDistinctBilling(p) && p.billingQtyPerOrderUnit != null
                ? formatDecimalInputEs(p.billingQtyPerOrderUnit, 4)
                : '',
            pricePerKg:
              supplierProductHasDistinctBilling(p) && p.pricePerBillingUnit != null
                ? formatDecimalInputEs(p.pricePerBillingUnit, 4)
                : '',
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
        setTimeout(() => { try { const s = localStorage.getItem("pedidos_scroll"); if (s) window.scrollTo({ top: parseInt(s), behavior: 'instant' }); } catch {} }, 300);
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

  const dualNewProductDerivedPrice = React.useMemo(() => {
    if (!productDualKgBilling || productUnit === 'kg' || !unitSupportsReceivedWeightKg(productUnit)) return null;
    const eq = parseKgEstimate(productEquivKg);
    const ppk = parsePricePerBilling(productPricePerKg);
    if (eq == null || eq === undefined || ppk == null) return null;
    return Math.round(eq * ppk * 100) / 100;
  }, [productDualKgBilling, productUnit, productEquivKg, productPricePerKg]);

  React.useEffect(
    () => () => {
      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
    },
    [],
  );

  const createNewSupplier = () => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    const name = normalizeUpper(newSupplierName);
    if (!name) return setMessage('Nombre de proveedor obligatorio.');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    return createSupplier(supabase, localId, name, newSupplierContact.trim() || DEFAULT_SUPPLIER_CONTACT)
      .then(() => {
        setMessage('Proveedor guardado.');
        setNewSupplierOpen(false);
        reload();
        dispatchPedidosDataChanged();
      })
      .catch((err: Error) => setMessage(err.message));
  };

  const saveSupplierProduct = () => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    if (!productSupplierId) return setMessage('Selecciona proveedor.');
    const name = normalizeUpper(productName);
    const vatRate = parsePriceInput(productVat);
    if (!name) return setMessage('Nombre de producto obligatorio.');
    if (vatRate == null || vatRate < 0 || vatRate > 1) return setMessage('IVA inválido. Usa 0,21 o 0,10.');
    const pack = parseUnitsPerPack(productUnitsPerPack);
    if (pack == null) return setMessage('«Piezas por envase» debe ser un número mayor que 0 (ej. 40).');
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    const dualOk =
      productDualKgBilling && unitSupportsReceivedWeightKg(productUnit) && productUnit !== 'kg';
    const parsedPrice = parsePriceInput(productPrice);
    let pricePerUnit = parsedPrice ?? NaN;
    let estimatedKgPerUnit: number | null = null;
    let billingUnit: Unit | null = null;
    let billingQtyPerOrderUnit: number | null = null;
    let pricePerBillingUnit: number | null = null;
    if (dualOk) {
      const eq = parseKgEstimate(productEquivKg);
      const ppk = parsePricePerBilling(productPricePerKg);
      if (eq === undefined) return setMessage('Indica kg por unidad de pedido (equivalencia) o desactiva «cobro por kg».');
      if (eq === null) return setMessage('Indica kg por unidad de pedido (equivalencia) o desactiva «cobro por kg».');
      if (ppk == null) return setMessage('Indica €/kg habitual o desactiva «cobro por kg».');
      billingUnit = 'kg';
      billingQtyPerOrderUnit = eq;
      pricePerBillingUnit = ppk;
      pricePerUnit = Math.round(eq * ppk * 100) / 100;
    } else {
      if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) {
        return setMessage('Producto y precio válidos son obligatorios.');
      }
      if (unitSupportsReceivedWeightKg(productUnit)) {
        const parsedKg = parseKgEstimate(productEstimatedKg);
        if (parsedKg === undefined) return setMessage('Kg estimado por envase inválido (usa un número > 0 o déjalo vacío).');
        estimatedKgPerUnit = parsedKg;
      }
    }
    const parW = parseParWeekly(productParWeekly);
    void createSupplierProduct(supabase, localId, productSupplierId, {
      name,
      unit: productUnit,
      pricePerUnit,
      vatRate,
      parStock: parW,
      estimatedKgPerUnit,
      unitsPerPack: pack,
      recipeUnit: pack > 1 ? productRecipeUnit : null,
      billingUnit,
      billingQtyPerOrderUnit,
      pricePerBillingUnit,
    })
      .then(() => {
        setProductName('');
        setProductPrice('');
        setProductEstimatedKg('');
        setProductVat('0,21');
        setProductUnitsPerPack('1');
        setProductRecipeUnit('ud');
        setProductParWeekly('');
        setProductDualKgBilling(false);
        setProductEquivKg('');
        setProductPricePerKg('');
        setAddProductOpen(false);
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
    if (agendaEnabled && agendaOrderDays.length === 0) {
      return setMessage('Agenda: elige al menos un día de pedido o desactiva la agenda.');
    }

    void updateSupplier(supabase, localId, supplierId, {
      name: normalizeUpper(name),
      contact: draft?.contact ?? '',
      deliveryCycleWeekdays: draft?.deliveryCycleWeekdays ?? [],
      deliveryExceptionDates: draft?.deliveryExceptionDates ?? [],
    })
      .then(async () => {
        await upsertOrderSchedule(supabase, localId, supplierId, {
          enabled: agendaEnabled,
          orderWeekdays: agendaOrderDays,
          cutoffTime: agendaCutoff,
          reminderMinutesBefore: Math.min(1440, Math.max(0, agendaReminder)),
          deliveryWeekdays: agendaDeliveryDays.length > 0 ? agendaDeliveryDays : null,
          agendaMode,
        });
        await replaceReviewItemsForSupplier(
          supabase,
          localId,
          supplierId,
          agendaReviews.map((r) => ({
            supplierProductId: r.supplierProductId,
            productNameSnapshot: r.name.trim() || 'Producto',
            enabled: true,
          })),
        );
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
    const priceRaw = parsePriceInput(draft?.price ?? '');
    const vatRate = parsePriceInput(draft?.vatRate ?? '');
    if (!name) {
      return setMessage('El nombre del producto es obligatorio.');
    }
    if (vatRate == null || vatRate < 0 || vatRate > 1) {
      return setMessage('IVA inválido. Usa 0,21 o 0,10.');
    }
    const pack = parseUnitsPerPack(draft.unitsPerPack ?? '1');
    if (pack == null) return setMessage('«Piezas por envase» debe ser un número mayor que 0.');
    const dualOk =
      draft.dualKgBilling === true && unitSupportsReceivedWeightKg(draft.unit) && draft.unit !== 'kg';
    if (!dualOk && (priceRaw == null || priceRaw <= 0)) {
      return setMessage('Producto, unidad y precio válido son obligatorios.');
    }
    let pricePerUnit = priceRaw ?? NaN;
    let estimatedKgPerUnit: number | null = null;
    let billingUnit: Unit | null = null;
    let billingQtyPerOrderUnit: number | null = null;
    let pricePerBillingUnit: number | null = null;
    if (dualOk) {
      const eq = parseKgEstimate(draft.equivKg ?? '');
      const ppk = parsePricePerBilling(draft.pricePerKg ?? '');
      if (eq === undefined) return setMessage('Equiv. kg por unidad de pedido inválida o desactiva «cobro por kg».');
      if (eq === null) return setMessage('Equiv. kg por unidad de pedido obligatoria o desactiva «cobro por kg».');
      if (ppk == null) return setMessage('€/kg habitual inválido o desactiva «cobro por kg».');
      billingUnit = 'kg';
      billingQtyPerOrderUnit = eq;
      pricePerBillingUnit = ppk;
      pricePerUnit = Math.round(eq * ppk * 100) / 100;
    } else {
      if (unitSupportsReceivedWeightKg(draft.unit)) {
        const parsedKg = parseKgEstimate(draft.estimatedKg ?? '');
        if (parsedKg === undefined) return setMessage('Kg estimado por envase inválido (usa un número > 0 o déjalo vacío).');
        estimatedKgPerUnit = parsedKg;
      }
    }
    const supabase = getSupabaseClient();
    if (!supabase) return setMessage('Supabase no disponible en esta sesión.');
    const parW = parseParWeekly(draft.parWeekly ?? '');
    void updateSupplierProduct(supabase, localId, productId, {
      name: normalizeUpper(name),
      unit: draft.unit,
      pricePerUnit,
      vatRate,
      parStock: parW,
      estimatedKgPerUnit,
      unitsPerPack: pack,
      recipeUnit: pack > 1 ? draft.recipeUnit : null,
      billingUnit,
      billingQtyPerOrderUnit,
      pricePerBillingUnit,
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
    void (async () => {
    if (!localId) return setMessage('Perfil del local no cargado. Cierra sesión y vuelve a entrar.');
    const ok = await appConfirm(`¿Eliminar proveedor "${supplierName}"?`);
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
    })();
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
  const editSup =
    editingSupplierId != null
      ? (suppliers.find((s) => s.id === editingSupplierId) ?? null)
      : null;
  const editProductTarget = editingProductId
    ? findProductContext(suppliers, editingProductId)
    : null;

  const visibleSuppliers = React.useMemo(() => {
    const sorted = [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const raw = supplierCatalogQuery.trim();
    if (!raw) return sorted;
    const q = normalizeMatch(raw);
    return sorted.filter((s) => {
      if (normalizeMatch(s.name).includes(q)) return true;
      return s.products.some((p) => normalizeMatch(p.name).includes(q));
    });
  }, [suppliers, supplierCatalogQuery]);

  const openAddProductForSupplier = (supplierId: string) => {
    setMessage(null);
    setProductSupplierId(supplierId);
    setAddProductOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-2">
      {showDeletedBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
          <div className="rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black uppercase tracking-wide text-white">ELIMINADO</p>
          </div>
        </div>
      ) : null}
      <div className="mb-0">
        <Link
          href="/pedidos"
          className="inline-flex items-center gap-1 py-0.5 text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
        >
          ← Pedidos
        </Link>
      </div>

      {message ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100/80">
          {message}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-200/90 bg-white p-3 ring-1 ring-zinc-100 sm:p-4">
        <h1 className="text-lg font-bold tracking-tight text-zinc-900">Proveedores</h1>
        <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">Gestiona contactos y artículos</p>
        <button
          type="button"
          className="mt-3 flex h-12 w-full touch-manipulation items-center gap-3 rounded-xl bg-[#D32F2F] px-3 shadow-sm ring-1 ring-[#D32F2F]/20 transition active:scale-[0.99] active:bg-[#B91C1C]"
          onClick={() => {
            setMessage(null);
            setNewSupplierOpen(true);
          }}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/25">
            <Plus className="h-5 w-5 text-white" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-center text-[15px] font-bold text-white">Nuevo proveedor</span>
          <ChevronRight className="h-5 w-5 shrink-0 text-white/90" strokeWidth={2.25} aria-hidden />
        </button>
        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            strokeWidth={2}
            aria-hidden
          />
          <input
            value={supplierCatalogQuery}
            onChange={(e) => setSupplierCatalogQuery(e.target.value)}
            placeholder="Buscar proveedor o artículo…"
            className="h-10 w-full rounded-xl border border-zinc-200/90 bg-zinc-50/50 pl-10 pr-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-2 focus:ring-zinc-200/60"
          />
        </div>
      </section>

      {visibleSuppliers.map((supplier) => {
        const SupplierIcon = pickSupplierListIcon(supplier.name);
        const isOpen = expandedSupplierId === supplier.id;
        return (
        <section key={supplier.id} className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-zinc-100/80">
          <button
            type="button"
            className="flex w-full touch-manipulation items-start gap-2.5 px-3 py-2.5 text-left transition-colors active:bg-zinc-50/90 sm:gap-3 sm:py-2"
            onClick={() => setExpandedSupplierId((id) => (id === supplier.id ? null : supplier.id))}
            aria-expanded={isOpen}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#D32F2F]/[0.07] ring-1 ring-[#D32F2F]/12" aria-hidden>
              <SupplierIcon className="h-[18px] w-[18px] text-[#C62828]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold leading-tight tracking-tight text-zinc-900">{supplier.name}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[11px] leading-tight text-zinc-500">
                <Phone className="h-3 w-3 shrink-0 text-zinc-400" strokeWidth={2} aria-hidden />
                <span className="min-w-0 truncate">{supplier.contact || '—'}</span>
              </span>
              <span className="mt-0.5 flex items-start gap-1.5 text-[10px] leading-snug text-zinc-500">
                <CalendarDays className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" strokeWidth={2} aria-hidden />
                <span>{formatDeliveryCycleSummary(supplier.deliveryCycleWeekdays ?? [])}</span>
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end justify-center gap-1 self-stretch pl-1">
              <span className="rounded-full bg-[#FFF7F5] px-2 py-0.5 text-[10px] font-semibold text-[#B91C1C] ring-1 ring-[#D32F2F]/15">
                Ver artículos
              </span>
              <ChevronRight
                className={['h-4 w-4 text-zinc-400 transition-transform', isOpen ? 'rotate-90' : ''].join(' ')}
                strokeWidth={2.25}
                aria-hidden
              />
            </span>
          </button>

          {isOpen ? (
            <div className="border-t border-zinc-100 px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (editingSupplierId === supplier.id) {
                      setEditingSupplierId(null);
                      return;
                    }
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
                    setEditingSupplierId(supplier.id);
                  }}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700"
                >
                  {editingSupplierId === supplier.id ? 'Cerrar' : 'Editar proveedor'}
                </button>
                <button
                  type="button"
                  onClick={() => openAddProductForSupplier(supplier.id)}
                  className="rounded-lg border border-[#D32F2F]/35 bg-[#FFF7F5] px-2 py-1 text-xs font-semibold text-[#B91C1C] ring-1 ring-[#D32F2F]/15"
                >
                  Añadir producto
                </button>
                <button
                  type="button"
                  onClick={() => removeSupplier(supplier.id, supplier.name)}
                  className="rounded-lg border border-[#B91C1C] bg-white px-2 py-1 text-xs font-semibold text-[#B91C1C]"
                >
                  Eliminar proveedor
                </button>
              </div>

              <div className="mt-2 space-y-1.5">
            {[...supplier.products]
              .sort((a, b) => a.name.localeCompare(b.name, 'es'))
              .map((p) => (
              <div key={p.id} className="rounded-lg border border-zinc-100/80 bg-zinc-50/80 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium leading-tight text-zinc-800">{p.name}</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (editingProductId === p.id) {
                          setEditingProductId(null);
                          return;
                        }
                        setProductDrafts((prev) => ({
                          ...prev,
                          [p.id]: {
                            name: prev[p.id]?.name ?? p.name,
                            unit: prev[p.id]?.unit ?? p.unit,
                            price: prev[p.id]?.price ?? formatDecimalInputEs(p.pricePerUnit, 2),
                            vatRate: prev[p.id]?.vatRate ?? formatDecimalInputEs(p.vatRate ?? 0, 2),
                            estimatedKg:
                              prev[p.id]?.estimatedKg ??
                              (!supplierProductHasDistinctBilling(p) &&
                              unitSupportsReceivedWeightKg(p.unit) &&
                              p.estimatedKgPerUnit != null &&
                              p.estimatedKgPerUnit > 0
                                ? formatDecimalInputEs(p.estimatedKgPerUnit, 4)
                                : ''),
                            unitsPerPack:
                              prev[p.id]?.unitsPerPack ?? String((p.unitsPerPack ?? 1) >= 1 ? (p.unitsPerPack ?? 1) : 1),
                            recipeUnit: prev[p.id]?.recipeUnit ?? (p.recipeUnit ?? 'ud'),
                            parWeekly:
                              prev[p.id]?.parWeekly ??
                              ((p.parStock ?? 0) > 0 ? String(p.parStock) : ''),
                            dualKgBilling:
                              prev[p.id]?.dualKgBilling ??
                              (supplierProductHasDistinctBilling(p) && p.billingUnit === 'kg'),
                            equivKg:
                              prev[p.id]?.equivKg ??
                              (supplierProductHasDistinctBilling(p) && p.billingQtyPerOrderUnit != null
                                ? formatDecimalInputEs(p.billingQtyPerOrderUnit, 4)
                                : ''),
                            pricePerKg:
                              prev[p.id]?.pricePerKg ??
                              (supplierProductHasDistinctBilling(p) && p.pricePerBillingUnit != null
                                ? formatDecimalInputEs(p.pricePerBillingUnit, 4)
                                : ''),
                          },
                        }));
                        setEditingProductId(p.id);
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
                <div className="pt-1 space-y-1.5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      Precio base catálogo
                    </p>
                    <p className="text-base font-bold tabular-nums text-zinc-900">
                      {formatUnitPriceEur(p.pricePerUnit, unitPriceCatalogSuffix[p.unit])}
                    </p>
                  </div>
                  {p.ultimoPrecioRecibido != null &&
                  Number.isFinite(p.ultimoPrecioRecibido) &&
                  p.ultimoPrecioRecibido > 0 ? (
                    <div className="rounded-md border border-dashed border-zinc-300/90 bg-zinc-100/50 px-2 py-1">
                      <p className="text-[9px] font-semibold text-zinc-500">Último recibido</p>
                      <p className="text-xs font-semibold tabular-nums text-zinc-600">
                        {formatUnitPriceEur(p.ultimoPrecioRecibido, unitPriceCatalogSuffix[p.unit])}
                      </p>
                    </div>
                  ) : null}
                  <p className="text-[11px] leading-snug text-zinc-600">
                    IVA {(p.vatRate * 100).toFixed(0)}%
                    {(p.unitsPerPack ?? 1) > 1 ? (
                      <>
                        {' '}
                        · Coste uso:{' '}
                        {formatUnitPriceEur(
                          p.pricePerUnit / (p.unitsPerPack ?? 1),
                          unitPriceCatalogSuffix[p.recipeUnit ?? 'ud'],
                        )}{' '}
                        (×{p.unitsPerPack ?? 1} {unitPriceCatalogSuffix[p.recipeUnit ?? 'ud']}/
                        {unitPriceCatalogSuffix[p.unit]})
                      </>
                    ) : null}
                    {supplierProductHasDistinctBilling(p) && p.billingUnit === 'kg' && p.pricePerBillingUnit != null
                      ? ` · cobro ${formatUnitPriceEur(p.pricePerBillingUnit, 'kg')} (~${p.billingQtyPerOrderUnit ?? '—'} kg/${unitPriceCatalogSuffix[p.unit]})`
                      : ''}
                    {!supplierProductHasDistinctBilling(p) &&
                    unitSupportsReceivedWeightKg(p.unit) &&
                    p.estimatedKgPerUnit != null &&
                    p.estimatedKgPerUnit > 0
                      ? ` · ~${p.estimatedKgPerUnit} kg/${p.unit}`
                      : ''}
                    {(p.parStock ?? 0) > 0 ? ` · ref. sem. ${p.parStock} ${unitPriceCatalogSuffix[p.unit]}` : ''}
                  </p>
                </div>
              </div>
              ))}
              </div>
            </div>
          ) : null}
        </section>
      );
      })}

      {suppliers.length > 0 && visibleSuppliers.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
          Ningún proveedor coincide con la búsqueda.
        </p>
      ) : null}

      <ProveedoresModalShell
        open={newSupplierOpen}
        title="Nuevo proveedor"
        onClose={() => setNewSupplierOpen(false)}
      >
        <div className="grid grid-cols-1 gap-2">
          <div>
            <label className="text-xs font-semibold text-zinc-600">Nombre comercial</label>
            <input
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              placeholder="Ej. MAKRO"
              className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600">Contacto (tel. o email)</label>
            <input
              value={newSupplierContact}
              onChange={(e) => setNewSupplierContact(e.target.value)}
              placeholder="Opcional"
              className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
          </div>
          <button
            type="button"
            onClick={createNewSupplier}
            className="h-10 w-full rounded-xl bg-[#D32F2F] text-sm font-bold text-white"
          >
            Guardar proveedor
          </button>
        </div>
      </ProveedoresModalShell>

      <ProveedoresModalShell
        open={addProductOpen}
        title="Añadir producto"
        onClose={() => setAddProductOpen(false)}
      >
        <div className="mt-2 grid grid-cols-1 gap-2">
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-semibold text-zinc-900">
            {suppliers.find((s) => s.id === productSupplierId)?.name ?? 'Proveedor'}
          </p>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Nombre producto"
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              value={productUnit}
              onChange={(e) => {
                const u = e.target.value as Unit;
                setProductUnit(u);
                if (u === 'kg' || !unitSupportsReceivedWeightKg(u)) {
                  setProductDualKgBilling(false);
                  setProductEquivKg('');
                  setProductPricePerKg('');
                }
              }}
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
            >
              {PEDIDO_ORDER_UNITS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {productDualKgBilling && unitSupportsReceivedWeightKg(productUnit) && productUnit !== 'kg' ? (
              <div className="flex h-10 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-800">
                {dualNewProductDerivedPrice != null
                  ? `${formatUnitPriceEur(dualNewProductDerivedPrice, unitPriceCatalogSuffix[productUnit])} (derivado)`
                  : '— (equiv. × €/kg)'}
              </div>
            ) : (
              <input
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
                placeholder="Precio por unidad de pedido"
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
              />
            )}
            <input
              value={productVat}
              onChange={(e) => setProductVat(e.target.value)}
              placeholder="IVA (0,21)"
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
            />
          </div>
          {unitSupportsReceivedWeightKg(productUnit) && productUnit !== 'kg' ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={productDualKgBilling}
                onChange={(e) => {
                  setProductDualKgBilling(e.target.checked);
                  if (e.target.checked) setProductPrice('');
                }}
                className="h-4 w-4 rounded border-zinc-400"
              />
              Cobro por kg (pedido en {unitPriceCatalogSuffix[productUnit]}, factura por peso)
            </label>
          ) : null}
          {productDualKgBilling && unitSupportsReceivedWeightKg(productUnit) && productUnit !== 'kg' ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={productEquivKg}
                onChange={(e) => setProductEquivKg(e.target.value)}
                placeholder={`Kg por ${unitPriceCatalogSuffix[productUnit]} (estimado)`}
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
              />
              <input
                value={productPricePerKg}
                onChange={(e) => setProductPricePerKg(e.target.value)}
                placeholder="€/kg habitual"
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
              />
            </div>
          ) : null}
          <input
            value={productUnitsPerPack}
            onChange={(e) => setProductUnitsPerPack(e.target.value)}
            placeholder="Unidades de uso interno por 1 unidad de pedido (ej. 12 huevos/docena)"
            title="Ej. 12 si pides por docenas y el uso interno es por huevo (ud); 180 si 1 caja = 180 ud. 1 = el precio ya es por esa unidad de pedido."
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          />
          {parseUnitsPerPack(productUnitsPerPack) != null && parseUnitsPerPack(productUnitsPerPack)! > 1 ? (
            <div>
              <label className="text-xs font-semibold text-zinc-600">Unidad de uso interna (escandallo / coste)</label>
              <select
                value={productRecipeUnit}
                onChange={(e) => setProductRecipeUnit(e.target.value as Unit)}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
              >
                {PEDIDO_RECIPE_UNITS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <p className="text-xs text-zinc-500">
            La unidad de pedido (selector de arriba) es la que ves al hacer el pedido al proveedor. El precio es por esa
            unidad salvo «cobro por kg». Si 1 docena / 1 caja equivale a varias unidades internas (huevos, piezas), indica
            el factor y la unidad de uso interna.
          </p>
          <input
            value={productParWeekly}
            onChange={(e) => setProductParWeekly(e.target.value)}
            placeholder="Consumo ref. semanal (opcional, misma unidad que el pedido)"
            title="Para sugerencias en Nuevo pedido: necesidad aproximada en 7 días; el sistema la reparte según días hasta el siguiente reparto."
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
          />
          {unitSupportsReceivedWeightKg(productUnit) && !productDualKgBilling ? (
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

      </ProveedoresModalShell>

      {editSup && editingSupplierId ? (
        <ProveedoresModalShell
          open
          title="Editar proveedor"
          onClose={() => setEditingSupplierId(null)}
        >
<div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <input
                value={supplierDrafts[editSup.id]?.name ?? ''}
                onChange={(e) =>
                  setSupplierDrafts((prev) => ({
                    ...prev,
                    [editSup.id]: {
                      ...(prev[editSup.id] ?? {
                        name: editSup.name,
                        contact: editSup.contact ?? '',
                        deliveryCycleWeekdays: [...(editSup.deliveryCycleWeekdays ?? [])],
                        deliveryExceptionDates: [...(editSup.deliveryExceptionDates ?? [])],
                      }),
                      name: e.target.value,
                    },
                  }))
                }
                placeholder="Nombre proveedor"
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
              />
              <input
                value={supplierDrafts[editSup.id]?.contact ?? ''}
                onChange={(e) =>
                  setSupplierDrafts((prev) => ({
                    ...prev,
                    [editSup.id]: {
                      ...(prev[editSup.id] ?? {
                        name: editSup.name,
                        contact: editSup.contact ?? '',
                        deliveryCycleWeekdays: [...(editSup.deliveryCycleWeekdays ?? [])],
                        deliveryExceptionDates: [...(editSup.deliveryExceptionDates ?? [])],
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
                    const days = supplierDrafts[editSup.id]?.deliveryCycleWeekdays ?? [];
                    const sel = days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setSupplierDrafts((prev) => {
                            const cur = prev[editSup.id] ?? {
                              name: editSup.name,
                              contact: editSup.contact ?? '',
                              deliveryCycleWeekdays: [...(editSup.deliveryCycleWeekdays ?? [])],
                              deliveryExceptionDates: [...(editSup.deliveryExceptionDates ?? [])],
                            };
                            const set = new Set(cur.deliveryCycleWeekdays);
                            if (set.has(day)) set.delete(day);
                            else set.add(day);
                            return {
                              ...prev,
                              [editSup.id]: {
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
                    value={exceptionInputBySupplier[editSup.id] ?? ''}
                    onChange={(e) =>
                      setExceptionInputBySupplier((prev) => ({ ...prev, [editSup.id]: e.target.value }))
                    }
                    className="h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = (exceptionInputBySupplier[editSup.id] ?? '').trim();
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                      setSupplierDrafts((prev) => {
                        const cur = prev[editSup.id] ?? {
                          name: editSup.name,
                          contact: editSup.contact ?? '',
                          deliveryCycleWeekdays: [...(editSup.deliveryCycleWeekdays ?? [])],
                          deliveryExceptionDates: [...(editSup.deliveryExceptionDates ?? [])],
                        };
                        if (cur.deliveryExceptionDates.includes(v)) return prev;
                        return {
                          ...prev,
                          [editSup.id]: {
                            ...cur,
                            deliveryExceptionDates: [...cur.deliveryExceptionDates, v].sort(),
                          },
                        };
                      });
                      setExceptionInputBySupplier((prev) => ({ ...prev, [editSup.id]: '' }));
                    }}
                    className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700"
                  >
                    Añadir
                  </button>
                </div>
                {(supplierDrafts[editSup.id]?.deliveryExceptionDates ?? []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(supplierDrafts[editSup.id]?.deliveryExceptionDates ?? []).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setSupplierDrafts((prev) => {
                            const cur = prev[editSup.id];
                            if (!cur) return prev;
                            return {
                              ...prev,
                              [editSup.id]: {
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

              <details className="rounded-xl border border-zinc-200 bg-white ring-1 ring-zinc-100/80 [&_summary::-webkit-details-marker]:hidden">
                <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-bold text-zinc-800">
                  Agenda de pedido <span className="font-normal text-zinc-500">(opcional)</span>
                </summary>
                <div className="space-y-3 border-t border-zinc-100 px-3 pb-3 pt-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-zinc-800">
                    <input
                      type="checkbox"
                      checked={agendaEnabled}
                      onChange={(e) => setAgendaEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-400"
                    />
                    Activar agenda para este proveedor
                  </label>
                  {agendaEnabled ? (
                    <div className="rounded-xl border border-zinc-100 bg-zinc-50/90 px-2.5 py-2 ring-1 ring-zinc-100/80">
                      <p className="text-[11px] font-semibold text-zinc-800">Tipo en «Agenda de hoy»</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        Obligatorio: bloque rojo con hora límite. Solo revisar: checklist con la misma hora como referencia.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setAgendaMode('mandatory')}
                          className={[
                            'min-h-[2.25rem] flex-1 touch-manipulation rounded-xl px-2 py-1.5 text-center text-[11px] font-bold leading-snug ring-1 transition-colors',
                            agendaMode === 'mandatory'
                              ? 'bg-[#E30613] text-white ring-[#c50512]'
                              : 'border border-zinc-200 bg-white text-zinc-700 ring-zinc-100',
                          ].join(' ')}
                        >
                          Obligatorio
                          <span className="mt-0.5 block text-[9px] font-semibold opacity-90">Hora límite</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAgendaMode('review')}
                          className={[
                            'min-h-[2.25rem] flex-1 touch-manipulation rounded-xl px-2 py-1.5 text-center text-[11px] font-bold leading-snug ring-1 transition-colors',
                            agendaMode === 'review'
                              ? 'bg-amber-600 text-white ring-amber-700'
                              : 'border border-zinc-200 bg-white text-zinc-700 ring-zinc-100',
                          ].join(' ')}
                        >
                          Solo revisar
                          <span className="mt-0.5 block text-[9px] font-semibold opacity-90">Checklist</span>
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-700">Días para hacer el pedido</p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {agendaMode === 'review'
                        ? 'Esos días aparecerá en «Revisar proveedores» (sin hora límite obligatoria).'
                        : 'Solo esos días aparecerá en «Agenda de hoy» con la hora límite.'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {DELIVERY_DAY_CHIPS.map(({ day, label }) => {
                        const sel = agendaOrderDays.includes(day);
                        return (
                          <button
                            key={`ag-${day}`}
                            type="button"
                            onClick={() =>
                              setAgendaOrderDays((prev) => {
                                const s = new Set(prev);
                                if (s.has(day)) s.delete(day);
                                else s.add(day);
                                return [...s].sort((a, b) => a - b);
                              })
                            }
                            className={[
                              'h-8 min-w-[2rem] rounded-lg px-2 text-xs font-bold',
                              sel
                                ? 'bg-[#E30613] text-white ring-1 ring-[#c50512]'
                                : 'border border-zinc-300 bg-white text-zinc-700',
                            ].join(' ')}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className={agendaMode === 'mandatory' ? 'grid grid-cols-2 gap-2' : ''}>
                    <div>
                      <p className="text-[11px] font-semibold text-zinc-700">
                        Hora límite{agendaMode === 'review' ? ' (referencia)' : ''}
                      </p>
                      <input
                        type="time"
                        value={agendaCutoff}
                        onChange={(e) => setAgendaCutoff(e.target.value)}
                        className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none"
                      />
                      {agendaMode === 'review' ? (
                        <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                          Se muestra en «Revisar proveedores» como guía de corte; el checklist reduce ruido cuando ya
                          miraste el proveedor.
                        </p>
                      ) : null}
                    </div>
                    {agendaMode === 'mandatory' ? (
                      <div>
                        <p className="text-[11px] font-semibold text-zinc-700">Aviso antes (min)</p>
                        <input
                          type="number"
                          min={0}
                          max={1440}
                          value={agendaReminder}
                          onChange={(e) => setAgendaReminder(Number(e.target.value))}
                          className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none"
                        />
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-700">Días de entrega (referencia)</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {DELIVERY_DAY_CHIPS.map(({ day, label }) => {
                        const sel = agendaDeliveryDays.includes(day);
                        return (
                          <button
                            key={`dl-${day}`}
                            type="button"
                            onClick={() =>
                              setAgendaDeliveryDays((prev) => {
                                const s = new Set(prev);
                                if (s.has(day)) s.delete(day);
                                else s.add(day);
                                return [...s].sort((a, b) => a - b);
                              })
                            }
                            className={[
                              'h-8 min-w-[2rem] rounded-lg px-2 text-xs font-bold',
                              sel
                                ? 'bg-emerald-600 text-white ring-1 ring-emerald-700'
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
                    <p className="text-[11px] font-semibold text-zinc-700">Productos a revisar antes de pedir</p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      Solo recordatorio visual; no añade líneas al pedido.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <select
                        value={agendaReviewPick}
                        onChange={(e) => setAgendaReviewPick(e.target.value)}
                        className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none"
                      >
                        <option value="">Elegir del catálogo…</option>
                        {editSup.products
                          .filter((p) => p.isActive !== false)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!agendaReviewPick) return;
                          const p = editSup.products.find((x) => x.id === agendaReviewPick);
                          if (!p) return;
                          if (agendaReviews.some((r) => r.supplierProductId === p.id)) return;
                          setAgendaReviews((prev) => [...prev, { supplierProductId: p.id, name: p.name }]);
                          setAgendaReviewPick('');
                        }}
                        className="h-10 shrink-0 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800"
                      >
                        Añadir
                      </button>
                    </div>
                    {agendaReviews.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {agendaReviews.map((r, idx) => (
                          <li
                            key={`${r.supplierProductId ?? 'x'}-${idx}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/90 px-2 py-1 text-[12px]"
                          >
                            <span className="min-w-0 truncate font-medium text-zinc-900">{r.name}</span>
                            <button
                              type="button"
                              className="shrink-0 text-[11px] font-semibold text-[#B91C1C]"
                              onClick={() => setAgendaReviews((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              Quitar
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[10px] text-zinc-500">Sin productos marcados.</p>
                    )}
                  </div>
                </div>
              </details>

              <button
                type="button"
                onClick={() => saveSupplierChanges(editSup.id)}
                className="h-10 rounded-xl bg-[#2563EB] px-3 text-sm font-bold text-white"
              >
                Guardar cambios proveedor
              </button>
            </div>

        </ProveedoresModalShell>
      ) : null}

      {editingProductId && editProductTarget
        ? (() => {
            const editP = editProductTarget.p;
            const d = productDrafts[editP.id];
            const u = (d?.unit ?? editP.unit) as Unit;
            const editDual = d?.dualKgBilling === true && unitSupportsReceivedWeightKg(u) && u !== 'kg';
            const editDerived = (() => {
              if (!editDual) return null;
              const eq = parseKgEstimate(d?.equivKg ?? '');
              const ppk = parsePricePerBilling(d?.pricePerKg ?? '');
              if (eq == null || eq === undefined || ppk == null) return null;
              return Math.round(eq * ppk * 100) / 100;
            })();
            return (
              <ProveedoresModalShell
                open
                title="Editar producto"
                onClose={() => setEditingProductId(null)}
              >
                  <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-white p-2">
                    <input
                      value={productDrafts[editP.id]?.name ?? ''}
                      onChange={(e) =>
                        setProductDrafts((prev) => ({
                          ...prev,
                          [editP.id]: {
                            ...(prev[editP.id] ?? {
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
                        value={productDrafts[editP.id]?.unit ?? 'ud'}
                        onChange={(e) => {
                          const nextU = e.target.value as Unit;
                          setProductDrafts((prev) => ({
                            ...prev,
                            [editP.id]: {
                              ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                              unit: nextU,
                              ...(nextU === 'kg' || !unitSupportsReceivedWeightKg(nextU)
                                ? { dualKgBilling: false, equivKg: '', pricePerKg: '' }
                                : {}),
                            },
                          }));
                        }}
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
                      >
                        {PEDIDO_ORDER_UNITS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {editDual ? (
                        <div className="flex h-9 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-800">
                          {editDerived != null
                            ? `${formatUnitPriceEur(editDerived, unitPriceCatalogSuffix[u])} (derivado)`
                            : '— (equiv. × €/kg)'}
                        </div>
                      ) : (
                        <input
                          value={productDrafts[editP.id]?.price ?? ''}
                          onChange={(e) =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [editP.id]: {
                                ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                price: e.target.value,
                              },
                            }))
                          }
                          placeholder="Precio unidad"
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                        />
                      )}
                      <input
                        value={productDrafts[editP.id]?.vatRate ?? ''}
                        onChange={(e) =>
                          setProductDrafts((prev) => ({
                            ...prev,
                            [editP.id]: {
                              ...(prev[editP.id] ?? {
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
                    {unitSupportsReceivedWeightKg(u) && u !== 'kg' ? (
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-800">
                        <input
                          type="checkbox"
                          checked={productDrafts[editP.id]?.dualKgBilling === true}
                          onChange={(e) =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [editP.id]: {
                                ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                dualKgBilling: e.target.checked,
                                ...(e.target.checked ? { price: '' } : { equivKg: '', pricePerKg: '' }),
                              },
                            }))
                          }
                          className="h-4 w-4 rounded border-zinc-400"
                        />
                        Cobro por kg
                      </label>
                    ) : null}
                    {editDual ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          value={productDrafts[editP.id]?.equivKg ?? ''}
                          onChange={(e) =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [editP.id]: {
                                ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                equivKg: e.target.value,
                              },
                            }))
                          }
                          placeholder={`Kg por ${unitPriceCatalogSuffix[u]} (estimado)`}
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                        />
                        <input
                          value={productDrafts[editP.id]?.pricePerKg ?? ''}
                          onChange={(e) =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [editP.id]: {
                                ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                pricePerKg: e.target.value,
                              },
                            }))
                          }
                          placeholder="€/kg habitual"
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none"
                        />
                      </div>
                    ) : null}
                    <input
                      value={productDrafts[editP.id]?.parWeekly ?? ''}
                      onChange={(e) =>
                        setProductDrafts((prev) => ({
                          ...prev,
                          [editP.id]: {
                            ...(prev[editP.id] ?? {
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
                      value={productDrafts[editP.id]?.unitsPerPack ?? '1'}
                      onChange={(e) =>
                        setProductDrafts((prev) => ({
                          ...prev,
                          [editP.id]: {
                            ...(prev[editP.id] ?? {
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
                    {parseUnitsPerPack(productDrafts[editP.id]?.unitsPerPack ?? '1') != null &&
                    parseUnitsPerPack(productDrafts[editP.id]?.unitsPerPack ?? '1')! > 1 ? (
                      <select
                        value={productDrafts[editP.id]?.recipeUnit ?? 'ud'}
                        onChange={(e) =>
                          setProductDrafts((prev) => ({
                            ...prev,
                            [editP.id]: {
                              ...(prev[editP.id] ?? {
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
                        {PEDIDO_RECIPE_UNITS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {!editDual && unitSupportsReceivedWeightKg(productDrafts[editP.id]?.unit ?? editP.unit) ? (
                      <input
                        value={productDrafts[editP.id]?.estimatedKg ?? ''}
                        onChange={(e) =>
                          setProductDrafts((prev) => ({
                            ...prev,
                            [editP.id]: {
                              ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
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
                      onClick={() => saveProductChanges(editP.id)}
                      className="h-9 rounded-lg bg-[#2563EB] px-3 text-sm font-bold text-white"
                    >
                      Guardar cambios producto
                    </button>
                  </div>

              </ProveedoresModalShell>
            );
          })()
        : null}

    </div>
  );
}
