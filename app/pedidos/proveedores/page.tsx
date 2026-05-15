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
  PackagePlus,
  Phone,
  Plus,
  PencilLine,
  Search,
  Power,
  Snowflake,
  Sparkles,
  Trash2,
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
import { markPedidosUiSkipRestoreOnce } from '@/lib/pedidos-ui-session';
import {
  attachOperationalScrollSave,
  attachOperationalStateListeners,
  makePersistedScreenStateKey,
  readOperationalScrollY,
  readPersistedScreenState,
  restoreOperationalScrollY,
  writePersistedScreenState,
} from '@/lib/persisted-screen-state';
import {
  createSupplier,
  type PedidoConsumptionPlan,
  type PedidoConsumptionPlanMode,
  type PedidoConsumptionPlanSegment,
  type PedidoConsumptionWeekday,
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

const CONSUMPTION_WEEKDAYS: Array<{ value: PedidoConsumptionWeekday; short: string; label: string }> = [
  { value: 'monday', short: 'L', label: 'Lunes' },
  { value: 'tuesday', short: 'M', label: 'Martes' },
  { value: 'wednesday', short: 'X', label: 'Miércoles' },
  { value: 'thursday', short: 'J', label: 'Jueves' },
  { value: 'friday', short: 'V', label: 'Viernes' },
  { value: 'saturday', short: 'S', label: 'Sábado' },
  { value: 'sunday', short: 'D', label: 'Domingo' },
];

function weekdayLabel(day: PedidoConsumptionWeekday): string {
  return CONSUMPTION_WEEKDAYS.find((d) => d.value === day)?.label ?? day;
}

function formatCoversDaysText(days: PedidoConsumptionWeekday[]): string {
  if (days.length === 0) return 'Este pedido cubrirá el consumo del día indicado.';
  const labels = days.map(weekdayLabel);
  if (labels.length === 1) return `Este pedido cubrirá el consumo de ${labels[0]}.`;
  if (labels.length === 2) return `Este pedido cubrirá el consumo de ${labels[0]} y ${labels[1]}.`;
  return `Este pedido cubrirá el consumo de ${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}.`;
}

function SoftField({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        'h-9 w-full rounded-[14px] border border-zinc-200/80 bg-zinc-50/70 px-2.5 text-[13px] text-zinc-900 outline-none transition',
        'placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-4 focus:ring-zinc-900/5',
        className,
      ].join(' ')}
    />
  );
}

function SoftSelect({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        'h-9 w-full rounded-[14px] border border-zinc-200/80 bg-zinc-50/70 px-2.5 text-[13px] text-zinc-900 outline-none transition',
        'focus:border-zinc-300 focus:bg-white focus:ring-4 focus:ring-zinc-900/5',
        className,
      ].join(' ')}
    />
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  tone = 'neutral',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <button
      {...props}
      className={[
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium transition active:scale-[0.99]',
        tone === 'danger'
          ? 'border border-rose-200/80 bg-rose-50/80 text-rose-700 shadow-sm'
          : 'border border-zinc-200/80 bg-white text-zinc-700 shadow-sm',
        className,
      ].join(' ')}
    >
      <Icon className="h-3 w-3" strokeWidth={2.25} />
      <span>{label}</span>
    </button>
  );
}

function MiniIconButton({
  icon: Icon,
  label,
  tone = 'neutral',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <button
      {...props}
      aria-label={label}
      className={[
        'grid h-7 w-7 place-items-center rounded-full border transition active:scale-[0.98]',
        tone === 'danger'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-zinc-200 bg-white text-zinc-600',
        className,
      ].join(' ')}
    >
      <Icon className="h-3 w-3" strokeWidth={2.25} />
    </button>
  );
}

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
  consumptionMode?: PedidoConsumptionPlanMode;
  consumptionSegments?: Array<{
    orderDay: PedidoConsumptionWeekday;
    coversDays: PedidoConsumptionWeekday[];
    targetQuantity: string;
  }>;
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
  consumptionMode: 'simple',
  consumptionSegments: [],
};

type ProveedoresUiState = {
  expandedSupplierId: string | null;
  editingSupplierId: string | null;
  editingProductId: string | null;
  supplierCatalogQuery: string;
  scrollY: number;
  editingProductDraft: ProductDraft | null;
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
  const [expandedSupplierId, setExpandedSupplierId] = React.useState<string | null>(null);
  const [supplierCatalogQuery, setSupplierCatalogQuery] = React.useState('');
  const [supplierDrafts, setSupplierDrafts] = React.useState<
    Record<
      string,
      { name: string; contact: string; deliveryCycleWeekdays: number[]; deliveryExceptionDates: string[] }
    >
  >({});
  const [exceptionInputBySupplier, setExceptionInputBySupplier] = React.useState<Record<string, string>>({});
  const [productDrafts, setProductDrafts] = React.useState<Record<string, ProductDraft>>({});
  const proveedoresUiHydratedForKeyRef = React.useRef<string | null>(null);
  const proveedoresUiSkipInitialSaveRef = React.useRef(false);
  const proveedoresUiKey = React.useMemo(
    () => makePersistedScreenStateKey('pedidos-proveedores', [localId ?? 'sin-local']),
    [localId],
  );

  const saveProveedoresUiState = React.useCallback(() => {
    if (!localId || proveedoresUiHydratedForKeyRef.current !== proveedoresUiKey) return;
    writePersistedScreenState<ProveedoresUiState>(
      proveedoresUiKey,
      {
        expandedSupplierId,
        editingSupplierId,
        editingProductId,
        supplierCatalogQuery,
        scrollY: readOperationalScrollY(),
        editingProductDraft: editingProductId ? productDrafts[editingProductId] ?? null : null,
      },
      { storage: 'local' },
    );
  }, [
    editingProductId,
    editingSupplierId,
    expandedSupplierId,
    localId,
    productDrafts,
    proveedoresUiKey,
    supplierCatalogQuery,
  ]);

  React.useEffect(() => {
    if (!localId || proveedoresUiHydratedForKeyRef.current === proveedoresUiKey) return;
    const saved = readPersistedScreenState<ProveedoresUiState>(proveedoresUiKey, { storage: 'local' });
    proveedoresUiHydratedForKeyRef.current = proveedoresUiKey;
    if (!saved) return;
    proveedoresUiSkipInitialSaveRef.current = true;
    setExpandedSupplierId(saved.expandedSupplierId ?? null);
    setEditingSupplierId(saved.editingSupplierId ?? null);
    setEditingProductId(saved.editingProductId ?? null);
    setSupplierCatalogQuery(saved.supplierCatalogQuery ?? '');
    if (saved.editingProductId && saved.editingProductDraft) {
      setProductDrafts((prev) => ({
        ...prev,
        [saved.editingProductId as string]: saved.editingProductDraft as ProductDraft,
      }));
    }
    if (saved.scrollY > 0) {
      window.setTimeout(() => restoreOperationalScrollY(saved.scrollY), 120);
      window.setTimeout(() => restoreOperationalScrollY(saved.scrollY), 520);
    }
    window.setTimeout(() => {
      proveedoresUiSkipInitialSaveRef.current = false;
    }, 0);
  }, [localId, proveedoresUiKey]);

  React.useEffect(() => {
    if (!localId || proveedoresUiHydratedForKeyRef.current !== proveedoresUiKey) return;
    if (proveedoresUiSkipInitialSaveRef.current) return;
    saveProveedoresUiState();
  }, [localId, proveedoresUiKey, saveProveedoresUiState]);

  React.useEffect(() => {
    if (!localId) return;
    const detachState = attachOperationalStateListeners({
      save: saveProveedoresUiState,
      restore: () => {
        const saved = readPersistedScreenState<ProveedoresUiState>(proveedoresUiKey, { storage: 'local' });
        if (saved?.scrollY && readOperationalScrollY() <= 8) restoreOperationalScrollY(saved.scrollY);
      },
    });
    const detachScroll = attachOperationalScrollSave(saveProveedoresUiState);
    return () => {
      detachState();
      detachScroll();
    };
  }, [localId, proveedoresUiKey, saveProveedoresUiState]);

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
            consumptionMode: p.consumptionPlan?.mode === 'advanced' ? 'advanced' : 'simple',
            consumptionSegments:
              p.consumptionPlan?.mode === 'advanced'
                ? (p.consumptionPlan.segments ?? []).map((seg) => ({
                    orderDay: seg.order_day,
                    coversDays: [...(seg.covers_days ?? [])],
                    targetQuantity: formatDecimalInputEs(seg.target_quantity ?? 0, 2),
                  }))
                : [],
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
        setTimeout(() => {
          const saved = readPersistedScreenState<ProveedoresUiState>(proveedoresUiKey, { storage: 'local' });
          if (saved?.scrollY && readOperationalScrollY() <= 8) restoreOperationalScrollY(saved.scrollY);
        }, 300);
        writeSuppliersSessionCache(lid, rows);
      })
      .catch((err: Error) => setMessage(err.message));
  }, [applySupplierRows, canUse, localId, proveedoresUiKey]);

  React.useEffect(() => {
    if (!canUse || !localId) return;
    const cached = readSuppliersSessionCache(localId);
    if (cached !== null) setTimeout(() => applySupplierRows(cached), 0);
    setTimeout(() => reload(), 0);
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
    const mode: PedidoConsumptionPlanMode = draft.consumptionMode === 'advanced' ? 'advanced' : 'simple';
    const segmentsSource = draft.consumptionSegments ?? [];
    const segments: PedidoConsumptionPlanSegment[] = [];
    for (const seg of segmentsSource) {
      const qtyRaw = parsePriceInput(seg.targetQuantity ?? '');
      if (qtyRaw == null) continue;
      if (qtyRaw < 0) return setMessage('Plan de consumo: la cantidad objetivo no puede ser negativa.');
      const covers = [...new Set(seg.coversDays ?? [])].filter((d): d is PedidoConsumptionWeekday =>
        CONSUMPTION_WEEKDAYS.some((x) => x.value === d),
      );
      segments.push({
        order_day: seg.orderDay,
        covers_days: covers,
        target_quantity: Math.round(qtyRaw * 100) / 100,
      });
    }
    const consumptionPlan: PedidoConsumptionPlan = {
      mode,
      weekly_reference: Math.max(0, Math.round(parW * 100) / 100),
      segments: mode === 'advanced' ? segments : [],
    };
    void updateSupplierProduct(supabase, localId, productId, {
      name: normalizeUpper(name),
      unit: draft.unit,
      pricePerUnit,
      vatRate,
      parStock: parW,
      consumptionPlan,
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
    const filtered = sorted.filter((s) => {
      if (normalizeMatch(s.name).includes(q)) return true;
      return s.products.some((p) => normalizeMatch(p.name).includes(q));
    });
    return filtered.sort((a, b) => {
      const aSupplierHit = normalizeMatch(a.name).includes(q);
      const bSupplierHit = normalizeMatch(b.name).includes(q);
      const aProductHit = a.products.some((p) => normalizeMatch(p.name).includes(q));
      const bProductHit = b.products.some((p) => normalizeMatch(p.name).includes(q));
      if (aProductHit !== bProductHit) return aProductHit ? -1 : 1;
      if (aSupplierHit !== bSupplierHit) return aSupplierHit ? -1 : 1;
      return a.name.localeCompare(b.name, 'es');
    });
  }, [suppliers, supplierCatalogQuery]);

  React.useEffect(() => {
    const raw = supplierCatalogQuery.trim();
    if (!raw) return;
    const q = normalizeMatch(raw);
    const directSupplier = suppliers.find((s) => normalizeMatch(s.name).includes(q));
    const directProductSupplier = suppliers.find((s) => s.products.some((p) => normalizeMatch(p.name).includes(q)));
    const target = directSupplier ?? directProductSupplier;
    if (!target) return;
    const t = window.setTimeout(() => setExpandedSupplierId(target.id), 0);
    return () => window.clearTimeout(t);
  }, [supplierCatalogQuery, suppliers]);

  const openAddProductForSupplier = (supplierId: string) => {
    setMessage(null);
    setProductSupplierId(supplierId);
    setAddProductOpen(true);
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
    <div className="mx-auto w-full max-w-3xl space-y-2.5">
      {showDeletedBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
          <div className="rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black uppercase tracking-wide text-white">ELIMINADO</p>
          </div>
        </div>
      ) : null}
      <div className="mb-1">
        <Link
          href="/pedidos"
          onClick={markPedidosUiSkipRestoreOnce}
          className="inline-flex items-center gap-1 py-0.5 text-xs font-medium text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline"
        >
          ← Pedidos
        </Link>
      </div>

      {message ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100/80">
          {message}
        </div>
      ) : null}

      <section className="rounded-[18px] border border-zinc-200/80 bg-white/95 p-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.035)] ring-1 ring-zinc-100/80 sm:p-3">
        <button
          type="button"
          className="flex h-10 w-full touch-manipulation items-center gap-2 rounded-[15px] bg-[#D32F2F] px-3 shadow-[0_8px_18px_rgba(211,47,47,0.11)] ring-1 ring-[#D32F2F]/15 transition active:scale-[0.99] active:bg-[#B91C1C]"
          onClick={() => {
            setMessage(null);
            setNewSupplierOpen(true);
          }}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/20">
            <Plus className="h-3.5 w-3.5 text-white" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-center text-[13px] font-semibold text-white">Nuevo proveedor</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-white/85" strokeWidth={2.25} aria-hidden />
        </button>
        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            strokeWidth={2}
            aria-hidden
          />
          <input
            value={supplierCatalogQuery}
            onChange={(e) => setSupplierCatalogQuery(e.target.value)}
            placeholder="Buscar proveedor o artículo…"
            className="h-9 w-full rounded-[15px] border border-zinc-200/80 bg-zinc-50/60 pl-10 pr-3 text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-4 focus:ring-zinc-900/5"
          />
        </div>
      </section>

      {visibleSuppliers.map((supplier) => {
        const SupplierIcon = pickSupplierListIcon(supplier.name);
        const isOpen = expandedSupplierId === supplier.id;
        return (
        <section key={supplier.id} className="overflow-hidden rounded-[18px] border border-zinc-200/75 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)] ring-1 ring-zinc-100/70">
          <button
            type="button"
            className="flex w-full touch-manipulation items-center gap-2.5 px-2.5 py-2 text-left transition-colors active:bg-zinc-50/80 sm:px-3 sm:py-2.5"
            onClick={() => setExpandedSupplierId((id) => (id === supplier.id ? null : supplier.id))}
            aria-expanded={isOpen}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[14px] bg-[#D32F2F]/[0.06] ring-1 ring-[#D32F2F]/10" aria-hidden>
              <SupplierIcon className="h-4 w-4 text-[#C62828]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[14px] font-semibold leading-tight tracking-tight text-zinc-950">{supplier.name}</span>
                <span className="shrink-0 rounded-full bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 ring-1 ring-zinc-200/70">
                  {supplier.products.length}
                </span>
              </span>
              <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] leading-tight text-zinc-500">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Phone className="h-3 w-3 shrink-0 text-zinc-400" strokeWidth={2} aria-hidden />
                  <span className="truncate">{supplier.contact || '—'}</span>
                </span>
                <span className="inline-flex min-w-0 items-center gap-1">
                  <CalendarDays className="h-3 w-3 shrink-0 text-zinc-400" strokeWidth={2} aria-hidden />
                  <span className="truncate">{formatDeliveryCycleSummary(supplier.deliveryCycleWeekdays ?? [])}</span>
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 pl-1">
              <span className="hidden rounded-full bg-[#FFF7F5] px-2 py-0.5 text-[10px] font-medium text-[#B91C1C] ring-1 ring-[#D32F2F]/15 min-[390px]:inline">
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
            <div className="border-t border-zinc-100 px-2.5 pb-2.5 pt-2 sm:px-3 sm:pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <ToolbarButton
                  icon={PencilLine}
                  label={editingSupplierId === supplier.id ? 'Cerrar' : 'Editar'}
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
                />
                <ToolbarButton icon={PackagePlus} label="Producto" onClick={() => openAddProductForSupplier(supplier.id)} />
                <ToolbarButton
                  icon={Trash2}
                  label="Eliminar"
                  tone="danger"
                  onClick={() => removeSupplier(supplier.id, supplier.name)}
                />
              </div>

              <div className="mt-2 space-y-1.5">
            {[...supplier.products]
              .sort((a, b) => a.name.localeCompare(b.name, 'es'))
              .map((p) => (
              <div key={p.id} className="rounded-[16px] border border-zinc-200/70 bg-[#fffdf8] px-2.5 py-2 shadow-[0_5px_14px_rgba(15,23,42,0.03)] ring-1 ring-zinc-100/60">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[10px] bg-white text-zinc-500 ring-1 ring-zinc-200/70" aria-hidden>
                      <Package className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight tracking-tight text-zinc-950">
                          {p.name}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          <p className="mr-1 hidden whitespace-nowrap text-right text-[13px] font-semibold leading-none tracking-tight text-zinc-950 tabular-nums min-[390px]:block">
                            {formatUnitPriceEur(p.pricePerUnit, unitPriceCatalogSuffix[p.unit])}
                          </p>
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
                            consumptionMode:
                              prev[p.id]?.consumptionMode ??
                              (p.consumptionPlan?.mode === 'advanced' ? 'advanced' : 'simple'),
                            consumptionSegments:
                              prev[p.id]?.consumptionSegments ??
                              (p.consumptionPlan?.mode === 'advanced'
                                ? (p.consumptionPlan.segments ?? []).map((seg) => ({
                                    orderDay: seg.order_day,
                                    coversDays: [...(seg.covers_days ?? [])],
                                    targetQuantity: formatDecimalInputEs(seg.target_quantity ?? 0, 2),
                                  }))
                                : []),
                          },
                        }));
                              setEditingProductId(p.id);
                            }}
                            className="grid h-7 w-7 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm active:scale-[0.98]"
                          >
                            <PencilLine className="h-3 w-3" strokeWidth={2.25} />
                          </button>
                          <button
                            type="button"
                            onClick={() => disableProduct(p.id)}
                            className="grid h-7 w-7 place-items-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 shadow-sm active:scale-[0.98]"
                          >
                            <Power className="h-3 w-3" strokeWidth={2.25} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9.5px] font-medium text-zinc-500">
                        {p.unitsPerPack && p.unitsPerPack > 1 ? (
                          <span className="rounded-full bg-white px-1.5 py-0.5 ring-1 ring-zinc-200/70">
                            x{p.unitsPerPack} {unitPriceCatalogSuffix[p.recipeUnit ?? 'ud']}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="pl-8 min-[390px]:hidden">
                    <p className="whitespace-nowrap text-[14px] font-semibold leading-none tracking-tight text-zinc-950 tabular-nums">
                      {formatUnitPriceEur(p.pricePerUnit, unitPriceCatalogSuffix[p.unit])}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pl-8 text-[9.5px] font-medium text-zinc-500">
                    <span className="rounded-full bg-white px-1.5 py-0.5 ring-1 ring-zinc-200/70">IVA {(p.vatRate * 100).toFixed(0)}%</span>
                    {p.ultimoPrecioRecibido != null &&
                    Number.isFinite(p.ultimoPrecioRecibido) &&
                    p.ultimoPrecioRecibido > 0 ? (
                      <span className="rounded-full bg-white px-1.5 py-0.5 ring-1 ring-zinc-200/70">
                        Últ. recepción {formatUnitPriceEur(p.ultimoPrecioRecibido, unitPriceCatalogSuffix[p.unit])}
                      </span>
                    ) : null}
                    {supplierProductHasDistinctBilling(p) && p.billingUnit === 'kg' && p.pricePerBillingUnit != null ? (
                      <span className="rounded-full bg-white px-1.5 py-0.5 ring-1 ring-zinc-200/70">
                        {formatUnitPriceEur(p.pricePerBillingUnit, 'kg')} · ~{p.billingQtyPerOrderUnit ?? '—'} kg/{unitPriceCatalogSuffix[p.unit]}
                      </span>
                    ) : null}
                    {!supplierProductHasDistinctBilling(p) &&
                    unitSupportsReceivedWeightKg(p.unit) &&
                    p.estimatedKgPerUnit != null &&
                    p.estimatedKgPerUnit > 0 ? (
                      <span className="rounded-full bg-white px-1.5 py-0.5 ring-1 ring-zinc-200/70">
                        ~{p.estimatedKgPerUnit} kg/{p.unit}
                      </span>
                    ) : null}
                    {(p.parStock ?? 0) > 0 ? (
                      <span className="rounded-full bg-white px-1.5 py-0.5 ring-1 ring-zinc-200/70">
                        Ref. sem. {p.parStock}
                      </span>
                    ) : null}
                  </div>
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
        <div className="grid grid-cols-1 gap-2.5">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Nombre comercial</label>
            <SoftField
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              placeholder="Ej. MAKRO"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Contacto (tel. o email)</label>
            <SoftField
              value={newSupplierContact}
              onChange={(e) => setNewSupplierContact(e.target.value)}
              placeholder="Opcional"
              className="mt-1"
            />
          </div>
          <button
            type="button"
            onClick={createNewSupplier}
            className="h-10 w-full rounded-2xl bg-[#D32F2F] text-sm font-semibold text-white shadow-[0_10px_20px_rgba(211,47,47,0.12)]"
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
        <div className="mt-1 grid grid-cols-1 gap-2.5">
          <p className="rounded-2xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2.5 text-sm font-medium text-zinc-900">
            {suppliers.find((s) => s.id === productSupplierId)?.name ?? 'Proveedor'}
          </p>
          <SoftField
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Nombre producto"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SoftSelect
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
            >
              {PEDIDO_ORDER_UNITS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SoftSelect>
            {productDualKgBilling && unitSupportsReceivedWeightKg(productUnit) && productUnit !== 'kg' ? (
              <div className="flex h-11 items-center rounded-2xl border border-zinc-200/70 bg-zinc-50/80 px-3 text-sm font-medium text-zinc-800">
                {dualNewProductDerivedPrice != null
                  ? `${formatUnitPriceEur(dualNewProductDerivedPrice, unitPriceCatalogSuffix[productUnit])} (derivado)`
                  : '— (equiv. × €/kg)'}
              </div>
            ) : (
              <SoftField
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
                placeholder="Precio por unidad de pedido"
              />
            )}
            <SoftField
              value={productVat}
              onChange={(e) => setProductVat(e.target.value)}
              placeholder="IVA (0,21)"
            />
          </div>
          {unitSupportsReceivedWeightKg(productUnit) && productUnit !== 'kg' ? (
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-700">
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
              <SoftField
                value={productEquivKg}
                onChange={(e) => setProductEquivKg(e.target.value)}
                placeholder={`Kg por ${unitPriceCatalogSuffix[productUnit]} (estimado)`}
              />
              <SoftField
                value={productPricePerKg}
                onChange={(e) => setProductPricePerKg(e.target.value)}
                placeholder="€/kg habitual"
              />
            </div>
          ) : null}
          <SoftField
            value={productUnitsPerPack}
            onChange={(e) => setProductUnitsPerPack(e.target.value)}
            placeholder="Unidades de uso interno por 1 unidad de pedido (ej. 12 huevos/docena)"
            title="Ej. 12 si pides por docenas y el uso interno es por huevo (ud); 180 si 1 caja = 180 ud. 1 = el precio ya es por esa unidad de pedido."
          />
          {parseUnitsPerPack(productUnitsPerPack) != null && parseUnitsPerPack(productUnitsPerPack)! > 1 ? (
            <div>
              <label className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Unidad de uso interna (escandallo / coste)</label>
              <SoftSelect
                value={productRecipeUnit}
                onChange={(e) => setProductRecipeUnit(e.target.value as Unit)}
                className="mt-1"
              >
                {PEDIDO_RECIPE_UNITS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SoftSelect>
            </div>
          ) : null}
          <p className="text-[11px] leading-snug text-zinc-500">
            La unidad de pedido (selector de arriba) es la que ves al hacer el pedido al proveedor. El precio es por esa
            unidad salvo «cobro por kg». Si 1 docena / 1 caja equivale a varias unidades internas (huevos, piezas), indica
            el factor y la unidad de uso interna.
          </p>
          <SoftField
            value={productParWeekly}
            onChange={(e) => setProductParWeekly(e.target.value)}
            placeholder="Consumo ref. semanal (opcional, misma unidad que el pedido)"
            title="Para sugerencias en Nuevo pedido: necesidad aproximada en 7 días; el sistema la reparte según días hasta el siguiente reparto."
          />
          {unitSupportsReceivedWeightKg(productUnit) && !productDualKgBilling ? (
            <SoftField
              value={productEstimatedKg}
              onChange={(e) => setProductEstimatedKg(e.target.value)}
              placeholder="Kg estimados por envase — bandeja/caja (opcional)"
            />
          ) : null}
          <button
            type="button"
            onClick={saveSupplierProduct}
            className="h-10 rounded-2xl bg-[#D32F2F] px-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(211,47,47,0.12)]"
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
          <div className="grid grid-cols-1 gap-3 rounded-[22px] border border-zinc-200/70 bg-white/70 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] ring-1 ring-zinc-100/70">
              <SoftField
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
              />
              <SoftField
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
              />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Días de reparto</p>
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
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Excepciones de reparto (festivos)</p>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  Si una semana cambia el día (ej. jueves festivo → miércoles), añádelo aquí.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <SoftField
                    type="date"
                    value={exceptionInputBySupplier[editSup.id] ?? ''}
                    onChange={(e) =>
                      setExceptionInputBySupplier((prev) => ({ ...prev, [editSup.id]: e.target.value }))
                    }
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
                    className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm"
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

              <details className="rounded-[18px] border border-zinc-200/70 bg-white/80 ring-1 ring-zinc-100/80 [&_summary::-webkit-details-marker]:hidden">
                <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-medium text-zinc-800">
                  Agenda de pedido <span className="font-normal text-zinc-500">(opcional)</span>
                </summary>
                <div className="space-y-3 border-t border-zinc-100 px-3 pb-3 pt-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-zinc-800">
                    <input
                      type="checkbox"
                      checked={agendaEnabled}
                      onChange={(e) => setAgendaEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-400"
                    />
                    Activar agenda para este proveedor
                  </label>
                  {agendaEnabled ? (
                    <div className="rounded-[18px] border border-zinc-100 bg-zinc-50/70 px-2.5 py-2 ring-1 ring-zinc-100/80">
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Tipo en «Agenda de hoy»</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        Obligatorio: bloque rojo con hora límite. Solo revisar: checklist con la misma hora como referencia.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setAgendaMode('mandatory')}
                          className={[
                          'min-h-[2.25rem] flex-1 touch-manipulation rounded-2xl px-2 py-1.5 text-center text-[11px] font-medium leading-snug ring-1 transition-colors',
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
                          'min-h-[2.25rem] flex-1 touch-manipulation rounded-2xl px-2 py-1.5 text-center text-[11px] font-medium leading-snug ring-1 transition-colors',
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
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Días para hacer el pedido</p>
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
                      <SoftField
                        type="time"
                        value={agendaCutoff}
                        onChange={(e) => setAgendaCutoff(e.target.value)}
                        className="mt-1"
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
                        <SoftField
                          type="number"
                          min={0}
                          max={1440}
                          value={agendaReminder}
                          onChange={(e) => setAgendaReminder(Number(e.target.value))}
                          className="mt-1"
                        />
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Días de entrega (referencia)</p>
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
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Productos a revisar antes de pedir</p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      Solo recordatorio visual; no añade líneas al pedido.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <SoftSelect
                        value={agendaReviewPick}
                        onChange={(e) => setAgendaReviewPick(e.target.value)}
                      >
                        <option value="">Elegir del catálogo…</option>
                        {editSup.products
                          .filter((p) => p.isActive !== false)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </SoftSelect>
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
                        className="h-10 shrink-0 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-800 shadow-sm"
                      >
                        Añadir
                      </button>
                    </div>
                    {agendaReviews.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {agendaReviews.map((r, idx) => (
                          <li
                            key={`${r.supplierProductId ?? 'x'}-${idx}`}
                            className="flex items-center justify-between gap-2 rounded-full border border-zinc-100 bg-zinc-50/80 px-2 py-1 text-[12px]"
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
                className="h-11 rounded-2xl bg-[#D32F2F] px-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(211,47,47,0.12)] active:scale-[0.99]"
              >
                Guardar cambios
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
                  <div className="grid grid-cols-1 gap-2 rounded-[18px] border border-zinc-200/70 bg-white/75 p-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.035)] ring-1 ring-zinc-100/70">
                    <SoftField
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
                    />
                    <div className="grid grid-cols-3 gap-1.5">
                      <SoftSelect
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
                      >
                        {PEDIDO_ORDER_UNITS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </SoftSelect>
                      {editDual ? (
                        <div className="flex h-9 items-center rounded-[14px] border border-zinc-200/70 bg-zinc-50/80 px-2.5 text-[11px] font-medium text-zinc-800">
                          {editDerived != null
                            ? `${formatUnitPriceEur(editDerived, unitPriceCatalogSuffix[u])} (derivado)`
                            : '— (equiv. × €/kg)'}
                        </div>
                      ) : (
                        <SoftField
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
                        />
                      )}
                      <SoftField
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
                      />
                    </div>
                    {unitSupportsReceivedWeightKg(u) && u !== 'kg' ? (
                      <label className="flex cursor-pointer items-center gap-2 rounded-[14px] bg-zinc-50/70 px-2.5 py-1.5 text-[12px] text-zinc-700 ring-1 ring-zinc-200/70">
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
                          className="h-3.5 w-3.5 rounded border-zinc-400"
                        />
                        Cobro por kg
                      </label>
                    ) : null}
                    {editDual ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        <SoftField
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
                        />
                        <SoftField
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
                        />
                      </div>
                    ) : null}
                    <div className="rounded-[16px] border border-zinc-200/75 bg-zinc-50/55 p-2 ring-1 ring-zinc-100/70">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Plan de consumo</p>
                        <span
                          className="grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-semibold text-zinc-400 ring-1 ring-zinc-200/70"
                          title="Cantidad semanal estimada. En avanzado puedes fijar cantidades por día de pedido."
                        >
                          ?
                        </span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5">
                        <label className="min-w-0">
                          <span className="mb-1 block truncate text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                          Consumo semanal de referencia
                          </span>
                          <SoftField
                            value={productDrafts[editP.id]?.parWeekly ?? ''}
                            onChange={(e) =>
                              setProductDrafts((prev) => ({
                                ...prev,
                                [editP.id]: {
                                  ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                  parWeekly: e.target.value,
                                },
                              }))
                            }
                            placeholder="0"
                          />
                        </label>
                          <span className="mb-0.5 rounded-full border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-600">
                            {unitPriceCatalogSuffix[u]}
                          </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 rounded-full border border-zinc-200 bg-white p-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [editP.id]: {
                                ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                consumptionMode: 'simple',
                              },
                            }))
                          }
                          className={[
                            'h-7 rounded-full text-[10.5px] font-medium transition',
                            (productDrafts[editP.id]?.consumptionMode ?? 'simple') === 'simple'
                              ? 'bg-zinc-900 text-white'
                              : 'text-zinc-600',
                          ].join(' ')}
                        >
                          Simple automático
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [editP.id]: {
                                ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                consumptionMode: 'advanced',
                              },
                            }))
                          }
                          className={[
                            'h-7 rounded-full text-[10.5px] font-medium transition',
                            (productDrafts[editP.id]?.consumptionMode ?? 'simple') === 'advanced'
                              ? 'bg-[#D32F2F] text-white'
                              : 'text-zinc-600',
                          ].join(' ')}
                        >
                          Avanzado manual
                        </button>
                      </div>

                      {(productDrafts[editP.id]?.consumptionMode ?? 'simple') === 'advanced' ? (
                        <div className="mt-2 space-y-1.5">
                          {(productDrafts[editP.id]?.consumptionSegments ?? []).map((seg, segIdx) => (
                            <div key={`${seg.orderDay}-${segIdx}`} className="rounded-[14px] border border-zinc-200 bg-white p-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold text-zinc-800">Tramo {segIdx + 1}</p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setProductDrafts((prev) => ({
                                      ...prev,
                                      [editP.id]: {
                                        ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                        consumptionSegments: (prev[editP.id]?.consumptionSegments ?? []).filter((_, i) => i !== segIdx),
                                      },
                                    }))
                                  }
                                  className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-medium text-rose-700 ring-1 ring-rose-100"
                                  aria-label="Eliminar tramo"
                                >
                                  Eliminar
                                </button>
                              </div>
                              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                <div>
                                  <label className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-400">Día pedido</label>
                                  <SoftSelect
                                    className="mt-1"
                                    value={seg.orderDay}
                                    onChange={(e) =>
                                      setProductDrafts((prev) => ({
                                        ...prev,
                                        [editP.id]: {
                                          ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                          consumptionSegments: (prev[editP.id]?.consumptionSegments ?? []).map((item, i) =>
                                            i === segIdx ? { ...item, orderDay: e.target.value as PedidoConsumptionWeekday } : item,
                                          ),
                                        },
                                      }))
                                    }
                                  >
                                    {CONSUMPTION_WEEKDAYS.map((day) => (
                                      <option key={day.value} value={day.value}>
                                        {day.label}
                                      </option>
                                    ))}
                                  </SoftSelect>
                                </div>
                                <div>
                                  <label className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-400">Cantidad</label>
                                  <SoftField
                                    className="mt-1"
                                    value={seg.targetQuantity}
                                    onChange={(e) =>
                                      setProductDrafts((prev) => ({
                                        ...prev,
                                        [editP.id]: {
                                          ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                          consumptionSegments: (prev[editP.id]?.consumptionSegments ?? []).map((item, i) =>
                                            i === segIdx ? { ...item, targetQuantity: e.target.value } : item,
                                          ),
                                        },
                                      }))
                                    }
                                    placeholder="0"
                                  />
                                </div>
                              </div>
                              <div className="mt-1.5">
                                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-400">Cubre</p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {CONSUMPTION_WEEKDAYS.map((day) => {
                                    const selected = seg.coversDays.includes(day.value);
                                    return (
                                      <button
                                        key={day.value}
                                        type="button"
                                        onClick={() =>
                                          setProductDrafts((prev) => {
                                            const rows = [...(prev[editP.id]?.consumptionSegments ?? [])];
                                            const row = rows[segIdx];
                                            if (!row) return prev;
                                            const set = new Set(row.coversDays);
                                            if (set.has(day.value)) set.delete(day.value);
                                            else set.add(day.value);
                                            rows[segIdx] = { ...row, coversDays: [...set] };
                                            return {
                                              ...prev,
                                              [editP.id]: { ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }), consumptionSegments: rows },
                                            };
                                          })
                                        }
                                        className={[
                                          'h-6 min-w-[1.75rem] rounded-full px-1.5 text-[10px] font-medium',
                                          selected ? 'bg-[#D32F2F] text-white' : 'border border-zinc-200 bg-zinc-50 text-zinc-600',
                                        ].join(' ')}
                                      >
                                        {day.short}
                                      </button>
                                    );
                                  })}
                                </div>
                                <p className="mt-1 truncate text-[10.5px] leading-snug text-zinc-500" title={formatCoversDaysText(seg.coversDays)}>
                                  {formatCoversDaysText(seg.coversDays)}
                                </p>
                              </div>
                            </div>
                          ))}
                          {(productDrafts[editP.id]?.consumptionSegments ?? []).length === 0 ? (
                            <p className="rounded-xl border border-dashed border-zinc-200 bg-white px-2.5 py-1.5 text-[10.5px] text-zinc-500">
                              Sin tramos. Añade uno para definir cantidades manuales.
                            </p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              setProductDrafts((prev) => ({
                                ...prev,
                                [editP.id]: {
                                  ...(prev[editP.id] ?? { ...EMPTY_PRODUCT_DRAFT }),
                                  consumptionSegments: [
                                    ...(prev[editP.id]?.consumptionSegments ?? []),
                                    { orderDay: 'monday', coversDays: [], targetQuantity: '' },
                                  ],
                                },
                              }))
                            }
                            className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-[11px] font-medium text-zinc-700 shadow-sm"
                          >
                            + Añadir tramo
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <SoftField
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
                        placeholder="Piezas/envase"
                      />
                      {parseUnitsPerPack(productDrafts[editP.id]?.unitsPerPack ?? '1') != null &&
                      parseUnitsPerPack(productDrafts[editP.id]?.unitsPerPack ?? '1')! > 1 ? (
                        <SoftSelect
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
                        >
                          {PEDIDO_RECIPE_UNITS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </SoftSelect>
                      ) : null}
                      {!editDual && unitSupportsReceivedWeightKg(productDrafts[editP.id]?.unit ?? editP.unit) ? (
                        <SoftField
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
                          placeholder="Kg/envase"
                        />
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => saveProductChanges(editP.id)}
                      className="h-9 rounded-[15px] bg-[#D32F2F] px-3 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(211,47,47,0.11)]"
                    >
                      Guardar cambios
                    </button>
                  </div>

              </ProveedoresModalShell>
            );
          })()
        : null}

    </div>
  );
}
