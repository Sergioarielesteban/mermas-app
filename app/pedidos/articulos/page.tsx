'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ESCANDALLO_USAGE_UNIT_PRESETS, validateEscandalloUsageUnitInput } from '@/lib/escandallo-ingredient-units';
import { ChevronDown, Eye, FileImage, FileText, GitCompare, LineChart, Paperclip, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { computeCosteUnitarioUsoEur } from '@/lib/purchase-article-internal-cost';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import {
  fetchPurchaseArticles,
  fetchSupplierCatalogRowsForArticleIds,
  isMissingPurchaseArticlesError,
  setPurchaseArticleActivo,
  updatePurchaseArticleTechnicalFileFields,
  updatePurchaseArticleMasterCostFields,
  type PurchaseArticle,
  type SupplierCatalogRow,
} from '@/lib/purchase-articles-supabase';
import {
  createPurchaseArticleDocumentSignedUrl,
  deletePurchaseArticleDocument,
  uploadPurchaseArticleDocument,
  validatePurchaseArticleDocument,
} from '@/lib/purchase-article-documents-storage';
import {
  fetchSupplierProductPriceSamples,
  type SupplierProductPriceSample,
} from '@/lib/pedidos-supabase';
import { formatMoneyEur, formatUnitPriceEur, roundMoney } from '@/lib/money-format';
import {
  clearEscandalloWizardArticulosReturn,
  readEscandalloWizardArticulosReturn,
} from '@/lib/escandallo-articulos-nav';
import { fetchEscandalloRawProductsWithWeightedPurchasePrices } from '@/lib/escandallos-supabase';
import { useOperationalAutoCollapse } from '@/lib/use-operational-auto-collapse';

function formatShortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch {
    return iso;
  }
}

function formatFileSize(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 1024 * 1024) return `${(value / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} KB`;
  return `${(value / (1024 * 1024)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
}

function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

export default function PedidosArticulosPage() {
  const { localCode, localName, localId, email, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [articles, setArticles] = useState<PurchaseArticle[]>([]);
  const [catalogByArticle, setCatalogByArticle] = useState<Map<string, SupplierCatalogRow[]>>(new Map());
  const [priceSamples, setPriceSamples] = useState<Map<string, SupplierProductPriceSample[]>>(new Map());
  const [escandalloPricingBySupplierProduct, setEscandalloPricingBySupplierProduct] = useState<
    Map<string, { pricePerUnit: number; unit: string; source: string | null }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [origenFilter, setOrigenFilter] = useState<'todos' | 'proveedor' | 'cocina_central'>('todos');
  /** Por defecto solo activos: los inactivos siguen en BD y se recuperan con Inactivos/Todos. */
  const [estadoFilter, setEstadoFilter] = useState<'activos' | 'inactivos' | 'todos'>('activos');
  const [hasArticulosReturn, setHasArticulosReturn] = useState(false);
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);
  const articleListRef = React.useRef<HTMLUListElement | null>(null);
  const dirtyArticleIdsRef = React.useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setArticles([]);
      setCatalogByArticle(new Map());
      setPriceSamples(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const list = await fetchPurchaseArticles(supabase, localId);
      const articleIds = list.map((a) => a.id);
      const catalogMap = await fetchSupplierCatalogRowsForArticleIds(supabase, localId, articleIds).catch(
        () => new Map(),
      );

      const productIds = [...new Set([...catalogMap.values()].flat().map((r) => r.id))];
      const samples = productIds.length ? await fetchSupplierProductPriceSamples(supabase, localId, productIds) : new Map();
      const escPricingRows = await fetchEscandalloRawProductsWithWeightedPurchasePrices(supabase, localId).catch(() => []);
      const escPricingMap = new Map(
        escPricingRows.map((row) => [
          row.id,
          {
            pricePerUnit: row.pricePerUnit,
            unit: row.pricingUnit ?? row.unit,
            source: row.operationalPriceSource ?? null,
          },
        ]),
      );

      setArticles(list);
      setCatalogByArticle(catalogMap);
      setPriceSamples(samples);
      setEscandalloPricingBySupplierProduct(escPricingMap);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar artículos.';
      if (isMissingPurchaseArticlesError(msg)) {
        setBanner('Los artículos de compra no están disponibles para este local. Consulta con administración.');
      } else {
        setBanner(msg);
      }
      setArticles([]);
      setCatalogByArticle(new Map());
      setPriceSamples(new Map());
      setEscandalloPricingBySupplierProduct(new Map());
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  useEffect(() => {
    if (!localId) {
      setHasArticulosReturn(false);
      return;
    }
    setHasArticulosReturn(readEscandalloWizardArticulosReturn(localId) !== null);
  }, [localId]);

  const ccCount = useMemo(() => articles.filter((a) => a.origenArticulo === 'cocina_central').length, [articles]);

  const filtered = useMemo(() => {
    let list =
      origenFilter === 'cocina_central'
        ? articles.filter((a) => a.origenArticulo === 'cocina_central')
        : origenFilter === 'proveedor'
          ? articles.filter((a) => a.origenArticulo !== 'cocina_central')
          : articles;
    if (estadoFilter === 'activos') list = list.filter((a) => a.activo);
    else if (estadoFilter === 'inactivos') list = list.filter((a) => !a.activo);
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter((a) => {
      const cat = catalogByArticle.get(a.id) ?? [];
      const catalogNames = cat.map((r) => r.name).join(' ');
      return (
        a.nombre.toLowerCase().includes(t) ||
        (a.nombreCorto ?? '').toLowerCase().includes(t) ||
        (a.categoria ?? '').toLowerCase().includes(t) ||
        (a.observaciones ?? '').toLowerCase().includes(t) ||
        catalogNames.toLowerCase().includes(t)
      );
    });
  }, [articles, catalogByArticle, q, origenFilter, estadoFilter]);

  useOperationalAutoCollapse({
    activeId: expandedArticleId,
    containerRef: articleListRef,
    onCollapse: () => setExpandedArticleId(null),
    hasPendingChanges: () => (expandedArticleId ? dirtyArticleIdsRef.current.has(expandedArticleId) : false),
  });

  if (!profileReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando…</p>
      </section>
    );
  }

  if (!hasPedidosEntry) return <PedidosPremiaLockedScreen />;

  if (!canUse || !localId || !supabaseOk) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Artículos no disponibles en esta sesión.</p>
      </section>
    );
  }

  return (
    <div className="space-y-2.5 pb-[6.5rem] sm:space-y-3 sm:pb-7">
      {hasArticulosReturn ? (
        <Link
          href="/escandallos/recetas/nuevo"
          onClick={() => {
            clearEscandalloWizardArticulosReturn();
            setHasArticulosReturn(false);
          }}
          className="flex min-h-9 w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-center text-[11px] font-semibold text-zinc-700 sm:text-xs"
        >
          Volver al asistente
        </Link>
      ) : null}

      {banner ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-950">{banner}</div>
      ) : null}

      <section className="rounded-xl bg-white p-2 ring-1 ring-zinc-200/70 sm:p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase leading-tight text-zinc-500">Listado</p>
            <p className="text-[11px] leading-tight text-zinc-600 sm:text-xs">
              <span className="font-bold tabular-nums text-zinc-900">{filtered.length}</span> artículos
              {q.trim() || origenFilter !== 'todos' || estadoFilter !== 'activos' ? ' · filtrado' : ''}
              {ccCount > 0 ? (
                <span className="text-zinc-500">
                  {' '}
                  · <span className="tabular-nums">{ccCount}</span> Cocina Central
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-zinc-100/80 px-2.5 text-[9px] font-black text-zinc-600 transition hover:bg-zinc-200/70 active:scale-[0.98] sm:text-[10px]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => setExpandedArticleId(null)}
            className="inline-flex h-7 shrink-0 items-center rounded-full bg-amber-50 px-2.5 text-[9px] font-black text-amber-900 ring-1 ring-amber-200/70 transition hover:bg-amber-100/70 active:scale-[0.98] sm:text-[10px]"
          >
            Cerrar todo
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-0.5 rounded-full bg-zinc-100/70 p-0.5 ring-1 ring-zinc-200/50 sm:inline-grid sm:min-w-[18rem]">
          {(
            [
              ['todos', 'Todos'],
              ['proveedor', 'Proveedor'],
              ['cocina_central', 'Cocina Central'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setOrigenFilter(key)}
              className={[
                'h-7 rounded-full px-2 text-[9px] font-black leading-none transition active:scale-[0.98] sm:text-[10px]',
                origenFilter === key
                  ? key === 'cocina_central'
                    ? 'bg-amber-100 text-amber-950 shadow-sm ring-1 ring-amber-200/80'
                    : 'bg-amber-50 text-amber-950 shadow-sm ring-1 ring-amber-200/70'
                  : 'text-zinc-500 hover:bg-white/70 hover:text-zinc-800',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-3 gap-0.5 rounded-full bg-zinc-100/70 p-0.5 ring-1 ring-zinc-200/50 sm:inline-grid sm:min-w-[18rem]">
          {(
            [
              ['activos', 'Activos'],
              ['inactivos', 'Inactivos'],
              ['todos', 'Todos'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setEstadoFilter(key)}
              className={[
                'h-7 rounded-full px-2 text-[9px] font-black leading-none transition active:scale-[0.98] sm:text-[10px]',
                estadoFilter === key
                  ? key === 'activos'
                    ? 'bg-emerald-50 text-emerald-900 shadow-sm ring-1 ring-emerald-200/80'
                    : key === 'inactivos'
                      ? 'bg-emerald-50 text-emerald-900 shadow-sm ring-1 ring-emerald-200/80'
                      : 'bg-emerald-50 text-emerald-900 shadow-sm ring-1 ring-emerald-200/80'
                  : 'text-zinc-500 hover:bg-white/70 hover:text-zinc-800',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative mt-1.5">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="h-9 w-full rounded-lg border border-zinc-200 py-1.5 pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
          />
        </div>
      </section>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando artículos…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl bg-zinc-50 py-10 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
          {articles.length === 0
            ? 'Aún no hay artículos. Alta en Proveedores o revisa la configuración del local.'
            : origenFilter === 'cocina_central' && ccCount === 0
              ? 'No hay artículos de Cocina Central en este local.'
              : estadoFilter === 'inactivos' && articles.every((x) => x.activo)
                ? 'No hay artículos inactivos. Prueba «Activos» o «Todos».'
                : estadoFilter === 'activos' && articles.every((x) => !x.activo)
                  ? 'No hay artículos activos. Prueba «Inactivos» o «Todos».'
                  : 'Nada coincide con el filtro o la búsqueda.'}
        </p>
      ) : (
        <ul ref={articleListRef} className="space-y-1.5">
          {filtered.map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              catalogRows={catalogByArticle.get(a.id) ?? []}
              priceSamples={priceSamples}
              escandalloPricingBySupplierProduct={escandalloPricingBySupplierProduct}
              onReload={() => void load()}
              expanded={expandedArticleId === a.id}
              onExpandedChange={(open) => setExpandedArticleId(open ? a.id : null)}
              onDirtyChange={(dirty) => {
                if (dirty) dirtyArticleIdsRef.current.add(a.id);
                else dirtyArticleIdsRef.current.delete(a.id);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ArticleCard({
  article: a,
  catalogRows,
  priceSamples,
  escandalloPricingBySupplierProduct,
  onReload,
  expanded,
  onExpandedChange,
  onDirtyChange,
}: {
  article: PurchaseArticle;
  catalogRows: SupplierCatalogRow[];
  priceSamples: Map<string, SupplierProductPriceSample[]>;
  escandalloPricingBySupplierProduct: Map<string, { pricePerUnit: number; unit: string; source: string | null }>;
  onReload: () => void;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { localId } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [activoBusy, setActivoBusy] = useState(false);
  const [activoErr, setActivoErr] = useState<string | null>(null);
  const [masterBusy, setMasterBusy] = useState(false);
  const [masterMsg, setMasterMsg] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [docMsg, setDocMsg] = useState<string | null>(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const [refProdId, setRefProdId] = useState(
    () => a.referenciaPrincipalSupplierProductId ?? a.createdFromSupplierProductId ?? '',
  );
  const [unidadUso, setUnidadUso] = useState(() => {
    const u = (a.unidadUso ?? a.unidadBase ?? 'kg').trim();
    return u || 'kg';
  });
  const [factorUso, setFactorUso] = useState(() =>
    a.unidadesUsoPorUnidadCompra != null && a.unidadesUsoPorUnidadCompra > 0 ? String(a.unidadesUsoPorUnidadCompra) : '1',
  );
  const [rendPct, setRendPct] = useState(() =>
    a.rendimientoPct != null && a.rendimientoPct > 0 ? String(a.rendimientoPct) : '100',
  );

  useEffect(() => {
    setRefProdId(a.referenciaPrincipalSupplierProductId ?? a.createdFromSupplierProductId ?? '');
    setUnidadUso((() => {
      const u = (a.unidadUso ?? a.unidadBase ?? 'kg').trim();
      return u || 'kg';
    })());
    setFactorUso(
      a.unidadesUsoPorUnidadCompra != null && a.unidadesUsoPorUnidadCompra > 0 ? String(a.unidadesUsoPorUnidadCompra) : '1',
    );
    setRendPct(a.rendimientoPct != null && a.rendimientoPct > 0 ? String(a.rendimientoPct) : '100');
  }, [
    a.id,
    a.referenciaPrincipalSupplierProductId,
    a.createdFromSupplierProductId,
    a.unidadUso,
    a.unidadBase,
    a.unidadesUsoPorUnidadCompra,
    a.rendimientoPct,
  ]);

  const isCc = a.origenArticulo === 'cocina_central';
  const technicalPath = a.technicalFileUrl?.trim() || null;
  const technicalType = a.technicalFileType?.trim() || null;
  const isTechnicalImage = Boolean(technicalType && technicalType.startsWith('image/'));
  const technicalLabel = a.technicalFileName?.trim() || 'Documento adjunto';

  const isDirty =
    refProdId !== (a.referenciaPrincipalSupplierProductId ?? a.createdFromSupplierProductId ?? '') ||
    unidadUso !== (() => {
      const u = (a.unidadUso ?? a.unidadBase ?? 'kg').trim();
      return u || 'kg';
    })() ||
    factorUso !== String(a.unidadesUsoPorUnidadCompra ?? 1) ||
    rendPct !== String(a.rendimientoPct ?? 100);

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    setDocPreviewUrl(null);
    setImageViewerUrl(null);
    if (!expanded || !isTechnicalImage || !technicalPath || !localId || !supabaseOk) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    void createPurchaseArticleDocumentSignedUrl(supabase, technicalPath)
      .then((url) => {
        if (!cancelled) setDocPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDocPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, isTechnicalImage, technicalPath, localId, supabaseOk]);

  const applyActivo = async (next: boolean) => {
    if (!localId || !supabaseOk) return;
    if (a.activo && !next) {
      if (!window.confirm('Este artículo dejará de aparecer en pedidos e inventario.')) return;
    }
    setActivoErr(null);
    setActivoBusy(true);
    try {
      const supabase = getSupabaseClient()!;
      await setPurchaseArticleActivo(supabase, localId, a.id, next);
      onReload();
    } catch (e: unknown) {
      setActivoErr(e instanceof Error ? e.message : 'No se pudo actualizar el estado del artículo.');
    } finally {
      setActivoBusy(false);
    }
  };

  if (isCc) {
    const uso = (a.unidadUso ?? a.unidadBase ?? '').trim() || '—';
    const cup = a.costeUnitarioUso ?? a.costeMaster;
    const ccMeta = [
      uso !== '—' ? uso : null,
      a.centralCostSyncedAt ? `act. ${formatShortDate(a.centralCostSyncedAt)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <li className={['list-none', !a.activo ? 'opacity-60' : ''].join(' ')}>
        <details
          open={expanded}
          onToggle={(e) => {
            if (e.currentTarget.open !== expanded) onExpandedChange(e.currentTarget.open);
          }}
          className="group overflow-hidden rounded-xl border border-amber-200/80 bg-white ring-1 ring-amber-100/80"
        >
          <summary className="flex cursor-pointer list-none items-start gap-2 p-2 sm:p-2.5 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1">
                <span className="rounded bg-amber-200/90 px-1 py-px text-[8px] font-bold uppercase text-amber-950">
                  Cocina Central
                </span>
                {!a.activo ? (
                  <span className="rounded bg-zinc-200/90 px-1 py-px text-[8px] font-bold uppercase text-zinc-600">
                    Inactivo
                  </span>
                ) : null}
              </div>
              <p
                className={[
                  'mt-0.5 text-[15px] font-bold leading-snug tracking-tight sm:text-base',
                  a.activo ? 'text-zinc-950' : 'text-zinc-500',
                ].join(' ')}
              >
                {a.nombre}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-800">
                {cup != null ? formatUnitPriceEur(roundMoney(cup), uso) : '—'}
              </p>
              {ccMeta ? <p className="mt-1 text-[11px] text-zinc-500">{ccMeta}</p> : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                disabled={activoBusy || !localId || !supabaseOk}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void applyActivo(!a.activo);
                }}
                className="rounded border border-zinc-200/90 bg-white px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
              >
                {activoBusy ? '…' : a.activo ? 'Desactivar' : 'Activar'}
              </button>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-zinc-400 transition group-open:rotate-180"
                aria-hidden
              />
            </div>
          </summary>
          <div className="space-y-2 border-t border-amber-100 bg-amber-50/30 px-3 pb-2.5 pt-2 sm:px-4 sm:pb-3">
            {activoErr ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-900">{activoErr}</p>
            ) : null}
            <div className="rounded-lg border border-amber-200/80 bg-white px-2.5 py-1.5 text-[11px] text-zinc-700">
              <p>
                <span className="font-semibold text-zinc-500">Uso:</span> {uso}
                {a.centralCostSyncedAt ? (
                  <span className="text-zinc-500"> · Actualizado {formatShortDate(a.centralCostSyncedAt)}</span>
                ) : null}
              </p>
              {a.centralProductionRecipeId ? (
                <p className="mt-1">
                  <Link
                    href={`/cocina-central/produccion/recetas/${a.centralProductionRecipeId}`}
                    className="font-semibold text-[#D32F2F] underline"
                  >
                    Fórmula
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        </details>
      </li>
    );
  }

  const originId = a.createdFromSupplierProductId;
  const preferredId = a.proveedorPreferidoId;
  const activeRows = catalogRows.filter((r) => r.isActive);
  const compareRows = activeRows.length > 0 ? activeRows : catalogRows;
  const minCatalog =
    compareRows.length > 0 ? Math.min(...compareRows.map((r) => r.pricePerUnit)) : null;
  const maxCatalog =
    compareRows.length > 0 ? Math.max(...compareRows.map((r) => r.pricePerUnit)) : null;
  const master = a.costeMaster;
  const masterStale =
    master != null &&
    minCatalog != null &&
    Math.abs(master - minCatalog) > 0.005 &&
    compareRows.length > 0;

  const originRow = originId
    ? catalogRows.find((r) => r.id === originId) ?? compareRows[0]
    : compareRows[0];

  const principalRefRow =
    (refProdId ? compareRows.find((r) => r.id === refProdId) : null) ?? originRow ?? compareRows[0];
  const nombreVisibleProveedor = principalRefRow?.name?.trim() || '';
  const escandalloPricing = principalRefRow ? escandalloPricingBySupplierProduct.get(principalRefRow.id) ?? null : null;
  const facturacionUnit = (principalRefRow?.billingUnit ?? principalRefRow?.unit ?? a.unidadCompra ?? 'ud') as string;
  const compraUnitEur =
    principalRefRow != null
      ? principalRefRow.pricePerUnit
      : a.costeCompraActual ?? master ?? null;
  const precioFacturacionEur =
    principalRefRow?.pricePerBillingUnit != null
      ? principalRefRow.pricePerBillingUnit
      : compraUnitEur;
  const factorNum = Number(String(factorUso).replace(/\s/g, '').replace(',', '.'));
  const rendNum = Number(String(rendPct).replace(/\s/g, '').replace(',', '.'));
  const previewCosteUso =
    precioFacturacionEur != null && Number.isFinite(factorNum) && factorNum > 0 && Number.isFinite(rendNum)
      ? computeCosteUnitarioUsoEur(precioFacturacionEur, factorNum, rendNum > 0 ? rendNum : 100)
      : null;

  const saveMasterEconomics = async () => {
    if (!localId || !supabaseOk) return;
    if (!refProdId) {
      setMasterMsg('Elige la fila de catálogo de referencia para la compra.');
      return;
    }
    if (!Number.isFinite(factorNum) || factorNum <= 0) {
      setMasterMsg('Unidades de uso por unidad de compra debe ser mayor que 0.');
      return;
    }
    const usoErr = validateEscandalloUsageUnitInput(unidadUso);
    if (usoErr) {
      setMasterMsg(usoErr);
      return;
    }
    if (!Number.isFinite(rendNum) || rendNum <= 0 || rendNum > 100) {
      setMasterMsg('Rendimiento útil debe ser mayor que 0 y como máximo 100.');
      return;
    }
    setMasterBusy(true);
    setMasterMsg(null);
    try {
      const supabase = getSupabaseClient()!;
      const cat = compareRows.find((r) => r.id === refProdId);
      await updatePurchaseArticleMasterCostFields(supabase, localId, a.id, {
        referenciaPrincipalSupplierProductId: refProdId,
        unidadCompra: cat?.unit ?? a.unidadCompra,
        costeCompraActual: cat?.pricePerUnit ?? compraUnitEur ?? undefined,
        unidadUso: unidadUso.trim(),
        unidadesUsoPorUnidadCompra: factorNum,
        rendimientoPct: rendNum,
        costeUnitarioUso: previewCosteUso,
        origenCoste: 'app_config',
      });
      onReload();
    } catch (e: unknown) {
      setMasterMsg(e instanceof Error ? e.message : 'No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setMasterBusy(false);
    }
  };

  const handleUploadTechnicalDocument = async (file: File) => {
    if (!localId || !supabaseOk) return;
    const validationError = validatePurchaseArticleDocument(file);
    if (validationError) {
      setDocMsg(validationError);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setDocBusy(true);
    setDocMsg(null);
    let uploadedPath: string | null = null;
    const previousPath = technicalPath;
    try {
      const uploaded = await uploadPurchaseArticleDocument(supabase, localId, a.id, file);
      uploadedPath = uploaded.storagePath;
      await updatePurchaseArticleTechnicalFileFields(supabase, localId, a.id, {
        technicalFileUrl: uploaded.storagePath,
        technicalFileName: uploaded.fileName,
        technicalFileType: uploaded.fileType,
        technicalFileSize: uploaded.fileSize,
      });
      if (previousPath && previousPath !== uploaded.storagePath) {
        await deletePurchaseArticleDocument(supabase, previousPath).catch(() => {});
      }
      onReload();
    } catch (e: unknown) {
      if (uploadedPath) {
        await deletePurchaseArticleDocument(supabase, uploadedPath).catch(() => {});
      }
      setDocMsg(e instanceof Error ? e.message : 'No se pudo guardar el documento.');
    } finally {
      setDocBusy(false);
    }
  };

  const handleDeleteTechnicalDocument = async () => {
    if (!localId || !supabaseOk || !technicalPath) return;
    if (!window.confirm('¿Eliminar el archivo adjunto de este artículo?')) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setDocBusy(true);
    setDocMsg(null);
    try {
      await updatePurchaseArticleTechnicalFileFields(supabase, localId, a.id, {
        technicalFileUrl: null,
        technicalFileName: null,
        technicalFileType: null,
        technicalFileSize: null,
      });
      await deletePurchaseArticleDocument(supabase, technicalPath).catch(() => {});
      setDocPreviewUrl(null);
      setImageViewerUrl(null);
      onReload();
    } catch (e: unknown) {
      setDocMsg(e instanceof Error ? e.message : 'No se pudo eliminar el documento.');
    } finally {
      setDocBusy(false);
    }
  };

  const handleOpenTechnicalDocument = async () => {
    if (!technicalPath || !localId || !supabaseOk) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const shouldOpenInSameTab = !isTechnicalImage && isMobileBrowser();
    const pdfWindow = !isTechnicalImage && !shouldOpenInSameTab ? window.open('', '_blank') : null;
    setDocBusy(true);
    setDocMsg(null);
    try {
      const signedUrl = await createPurchaseArticleDocumentSignedUrl(supabase, technicalPath);
      if (isTechnicalImage) {
        setDocPreviewUrl(signedUrl);
        setImageViewerUrl(signedUrl);
      } else {
        if (shouldOpenInSameTab) {
          window.location.assign(signedUrl);
          return;
        }
        if (pdfWindow) {
          pdfWindow.location.replace(signedUrl);
        } else {
          window.open(signedUrl, '_blank', 'noopener,noreferrer');
        }
      }
    } catch (e: unknown) {
      if (pdfWindow && !pdfWindow.closed) pdfWindow.close();
      setDocMsg(e instanceof Error ? e.message : 'No se pudo abrir el documento.');
    } finally {
      setDocBusy(false);
    }
  };

  const nombreCompacto = (nombreVisibleProveedor || a.nombre).trim();
  const unitCompra = (principalRefRow?.unit ?? a.unidadCompra ?? 'ud') as string;
  const precioCompraLine =
    compraUnitEur != null ? formatUnitPriceEur(roundMoney(compraUnitEur), unitCompra) : '—';
  const precioFacturacionLine =
    precioFacturacionEur != null ? formatUnitPriceEur(roundMoney(precioFacturacionEur), facturacionUnit) : '—';
  const precioEscandalloLine =
    escandalloPricing != null
      ? formatUnitPriceEur(roundMoney(escandalloPricing.pricePerUnit), escandalloPricing.unit)
      : '—';
  const precioEscandalloSource =
    escandalloPricing?.source === 'pmp'
      ? 'PMP'
      : escandalloPricing?.source === 'ultimo_precio'
        ? 'Último precio'
        : escandalloPricing?.source === 'articulo_master'
          ? 'Master manual'
          : null;
  const factorMeta =
    Number.isFinite(factorNum) && factorNum > 0
      ? `${factorNum.toLocaleString('es-ES', { maximumFractionDigits: 4 })} ud`
      : null;
  const ivaMeta = a.ivaCompraPct != null ? `IVA ${a.ivaCompraPct}%` : null;
  const usoMeta =
    previewCosteUso != null ? `uso ${formatMoneyEur(roundMoney(previewCosteUso))}` : null;
  const masterMeta = master != null ? `máster ${formatMoneyEur(roundMoney(master))}` : null;
  const metaCompact = [factorMeta, ivaMeta, usoMeta, masterMeta].filter(Boolean).join(' · ');

  return (
    <li className={['list-none', !a.activo ? 'opacity-60' : ''].join(' ')}>
      <details
        open={expanded}
        onToggle={(e) => {
          if (e.currentTarget.open !== expanded) onExpandedChange(e.currentTarget.open);
        }}
        className="group overflow-hidden rounded-[1.2rem] bg-white shadow-sm ring-1 ring-zinc-200/80"
      >
        <summary className="flex cursor-pointer list-none items-start gap-2.5 p-2.5 transition-colors active:bg-zinc-50 sm:p-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">
                Artículo master
              </span>
              <span
                className={[
                  'rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]',
                  a.activo
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                    : 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200',
                ].join(' ')}
              >
                {a.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <p
              className={[
                'mt-1.5 text-[15px] font-black leading-snug tracking-tight sm:text-base',
                a.activo ? 'text-zinc-950' : 'text-zinc-500',
              ].join(' ')}
            >
              {nombreCompacto}
            </p>
            <p className="mt-1 text-sm font-black tabular-nums text-zinc-900">{precioCompraLine}</p>
            {metaCompact ? (
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-500">{metaCompact}</p>
            ) : null}
            {principalRefRow?.name ? (
              <p className="mt-0.5 truncate text-[10px] text-zinc-400" title={principalRefRow.name}>
                Ref. {principalRefRow.supplierName} · {principalRefRow.name}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              disabled={activoBusy || !localId || !supabaseOk}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void applyActivo(!a.activo);
              }}
              className="rounded-full border border-zinc-200/90 bg-white px-2 py-1 text-[9px] font-bold text-zinc-500 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              {activoBusy ? '…' : a.activo ? 'Desactivar' : 'Activar'}
            </button>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-zinc-400 transition group-open:rotate-180"
              aria-hidden
            />
          </div>
        </summary>
        <div className="space-y-2 border-t border-zinc-100 bg-[#FAF8F5] px-2.5 pb-2.5 pt-2.5 sm:space-y-2.5 sm:px-3 sm:pb-3">
          {activoErr ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-900">{activoErr}</p>
          ) : null}

          <section className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-200/80">
            <h3 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
              <LineChart className="h-3.5 w-3.5 text-[#D32F2F]" aria-hidden />
              Coste master
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-4">
              <div className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-100">
                <dt className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Importe master</dt>
                <dd className="mt-0.5 text-base font-black tabular-nums text-zinc-950">
                  {master != null ? formatMoneyEur(roundMoney(master)) : '—'}
                </dd>
              </div>
              <div className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-100">
                <dt className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Actualizado</dt>
                <dd className="mt-0.5 text-[13px] font-bold text-zinc-900">
                  {a.costeMasterFijadoEn ? formatShortDate(a.costeMasterFijadoEn) : '—'}
                </dd>
              </div>
              <div className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-100">
                <dt className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Precio catálogo</dt>
                <dd className="mt-0.5 text-[13px] font-black tabular-nums text-zinc-950">
                  {principalRefRow ? formatUnitPriceEur(principalRefRow.pricePerUnit, principalRefRow.unit) : '—'}
                </dd>
              </div>
              <div className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-100">
                <dt className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Diferencia</dt>
                <dd
                  className={[
                    'mt-0.5 text-[13px] font-black tabular-nums',
                    master != null && principalRefRow != null && Math.abs(principalRefRow.pricePerUnit - master) < 0.01
                      ? 'text-emerald-700'
                      : 'text-amber-800',
                  ].join(' ')}
                >
                  {master != null && principalRefRow != null
                    ? formatMoneyEur(roundMoney(principalRefRow.pricePerUnit - master))
                    : '—'}
                </dd>
              </div>
            </dl>
            {masterStale ? (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-950">
                Catálogo mín. <strong>{formatMoneyEur(roundMoney(minCatalog!))}</strong> · Master{' '}
                <strong>{formatMoneyEur(roundMoney(master!))}</strong>. Revisa coherencia antes de usarlo en fichas.
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-200/80">
            <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Compra y uso en cocina</h3>
            {masterMsg ? (
              <p className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950">
                {masterMsg}
              </p>
            ) : null}
            <div className="mt-2 space-y-2">
              <div className="rounded-xl bg-zinc-50 p-2.5 ring-1 ring-zinc-100">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Compra</p>
                <dl className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px] text-zinc-700">
                  <div>
                    <dt className="text-[9px] font-bold uppercase text-zinc-400">Proveedor habitual</dt>
                    <dd className="mt-0.5 font-black text-zinc-950">{principalRefRow?.supplierName ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-bold uppercase text-zinc-400">Unidad compra</dt>
                    <dd className="mt-0.5 font-black text-zinc-950">{principalRefRow?.unit ?? a.unidadCompra ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-bold uppercase text-zinc-400">Unidad facturación / precio</dt>
                    <dd className="mt-0.5 font-black text-zinc-950">{facturacionUnit}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-bold uppercase text-zinc-400">Último recibido</dt>
                    <dd className="mt-0.5 font-black tabular-nums text-zinc-950">
                      {compraUnitEur != null ? formatMoneyEur(roundMoney(compraUnitEur)) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-bold uppercase text-zinc-400">Precio operativo</dt>
                    <dd className="mt-0.5 font-black tabular-nums text-zinc-950">{precioFacturacionLine}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-bold uppercase text-zinc-400">IVA</dt>
                    <dd className="mt-0.5 font-black text-zinc-950">{a.ivaCompraPct != null ? `${a.ivaCompraPct} %` : '—'}</dd>
                  </div>
                </dl>
                <label className="mt-2 block">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Referencia</span>
                  <select
                    value={refProdId}
                    disabled={masterBusy || compareRows.length === 0}
                    onChange={(e) => setRefProdId(e.target.value)}
                    className="mt-1 h-9 w-full rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-900 outline-none focus:ring-4 focus:ring-[#D32F2F]/10"
                  >
                    <option value="">—</option>
                    {compareRows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.supplierName} · {r.name} ({formatUnitPriceEur(r.pricePerBillingUnit ?? r.pricePerUnit, r.billingUnit ?? r.unit)})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-2xl bg-white p-0 ring-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Uso en cocina</p>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <label className="block rounded-xl bg-zinc-50 p-1.5 ring-1 ring-zinc-100">
                    <span className="block truncate text-[9px] font-black uppercase text-zinc-400">Unidad uso</span>
                    <input
                      list={`pa-usage-${a.id}`}
                      value={unidadUso}
                      disabled={masterBusy}
                      onChange={(e) => setUnidadUso(e.target.value)}
                      className="mt-1 h-7 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-black text-zinc-950 outline-none focus:ring-2 focus:ring-[#D32F2F]/15"
                      placeholder="ud"
                    />
                    <datalist id={`pa-usage-${a.id}`}>
                      {ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                  </label>
                  <label className="block rounded-xl bg-zinc-50 p-1.5 ring-1 ring-zinc-100">
                    <span className="block truncate text-[9px] font-black uppercase text-zinc-400">Uso x compra</span>
                    <input
                      value={factorUso}
                      disabled={masterBusy}
                      onChange={(e) => setFactorUso(e.target.value)}
                      className="mt-1 h-7 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-black tabular-nums text-zinc-950 outline-none focus:ring-2 focus:ring-[#D32F2F]/15"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="block rounded-xl bg-zinc-50 p-1.5 ring-1 ring-zinc-100">
                    <span className="block truncate text-[9px] font-black uppercase text-zinc-400">Rendimiento</span>
                    <input
                      value={rendPct}
                      disabled={masterBusy}
                      onChange={(e) => setRendPct(e.target.value)}
                      className="mt-1 h-7 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-black tabular-nums text-zinc-950 outline-none focus:ring-2 focus:ring-[#D32F2F]/15"
                      inputMode="decimal"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50 px-2.5 py-2 ring-1 ring-emerald-100">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Coste unitario de uso</p>
                <p className="mt-0.5 text-base font-black tabular-nums text-emerald-950">
                  {previewCosteUso != null ? `${formatMoneyEur(roundMoney(previewCosteUso))}/${unidadUso || 'ud'}` : '—'}
                </p>
                {a.costeUnitarioUso != null ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-emerald-800">
                    Guardado: {formatMoneyEur(roundMoney(a.costeUnitarioUso))}/{a.unidadUso || unidadUso || 'ud'}
                  </p>
                ) : null}
                {precioEscandalloSource ? (
                  <p className="mt-1 text-[11px] font-semibold text-emerald-900">
                    Escandallo usa ahora: {precioEscandalloLine} · {precioEscandalloSource}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-200/80">
            <h3 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
              <Paperclip className="h-3.5 w-3.5 text-[#D32F2F]" aria-hidden />
              Técnica y documentación
            </h3>
            {docMsg ? (
              <p className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950">
                {docMsg}
              </p>
            ) : null}
            {!technicalPath ? (
              <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-4 text-center">
                <p className="text-[12px] font-semibold text-zinc-500">No hay archivos adjuntos</p>
                <label className="mt-3 inline-flex h-9 cursor-pointer items-center justify-center rounded-xl bg-white px-3 text-[11px] font-black text-zinc-900 ring-1 ring-zinc-200 transition hover:bg-zinc-50">
                  Añadir imagen o PDF
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={docBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void handleUploadTechnicalDocument(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            ) : (
              <div className="mt-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-2.5 ring-1 ring-zinc-100">
                <div className="flex items-start gap-3">
                  {isTechnicalImage ? (
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200/70">
                      {docPreviewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={docPreviewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-zinc-400">
                          <FileImage className="h-5 w-5" aria-hidden />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white text-zinc-500 ring-1 ring-zinc-200/70">
                      <FileText className="h-6 w-6" aria-hidden />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-black text-zinc-950">{technicalLabel}</p>
                    <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                      {technicalType === 'application/pdf' ? 'PDF' : 'Imagen'} · {formatFileSize(a.technicalFileSize)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={docBusy}
                    onClick={() => void handleOpenTechnicalDocument()}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-white px-2.5 text-[10px] font-black text-zinc-900 ring-1 ring-zinc-200 transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                    Ver
                  </button>
                  <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg bg-white px-2.5 text-[10px] font-black text-zinc-900 ring-1 ring-zinc-200 transition hover:bg-zinc-50">
                    Sustituir
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={docBusy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void handleUploadTechnicalDocument(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={docBusy}
                    onClick={() => void handleDeleteTechnicalDocument()}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-black text-[#D32F2F] transition hover:bg-[#D32F2F]/5 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-200/80">
            <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
              Impacto en ficha técnica
            </h3>
            <dl className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-xl bg-zinc-50 px-2 py-2 ring-1 ring-zinc-100">
                <dt className="text-[9px] font-black uppercase text-zinc-400">Escandallos</dt>
                <dd className="mt-0.5 text-sm font-black text-emerald-700">Sí</dd>
              </div>
              <div className="rounded-xl bg-zinc-50 px-2 py-2 ring-1 ring-zinc-100">
                <dt className="text-[9px] font-black uppercase text-zinc-400">Mermas</dt>
                <dd className="mt-0.5 text-sm font-black text-zinc-400">—</dd>
              </div>
              <div className="rounded-xl bg-zinc-50 px-2 py-2 ring-1 ring-zinc-100">
                <dt className="text-[9px] font-black uppercase text-zinc-400">Comida</dt>
                <dd className="mt-0.5 text-sm font-black text-zinc-400">—</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-200/80">
            <h3 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
              <GitCompare className="h-3.5 w-3.5 text-[#D32F2F]" aria-hidden />
              Comparativa por proveedor
            </h3>
            {compareRows.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">Sin datos de catálogo.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {compareRows.map((row) => {
                  const isMin = minCatalog != null && row.pricePerUnit === minCatalog && compareRows.length > 1;
                  const isOrigin = originId === row.id;
                  const isPrincipal =
                    (a.referenciaPrincipalSupplierProductId != null &&
                      a.referenciaPrincipalSupplierProductId === row.id) ||
                    (a.referenciaPrincipalSupplierProductId == null && originId === row.id);
                  const isPref = preferredId === row.supplierId;
                  const deltaM = master != null ? row.pricePerUnit - master : null;
                  const latestSample = priceSamples.get(row.id)?.[0] ?? null;
                  return (
                    <div
                      key={row.id}
                      className={[
                        'rounded-xl p-2.5 ring-1',
                        isMin ? 'bg-emerald-50 ring-emerald-100' : 'bg-zinc-50 ring-zinc-100',
                        !row.isActive ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-zinc-950">
                            {row.supplierName}
                            {isPref ? (
                              <Star className="ml-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label="Proveedor preferido" />
                            ) : null}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-[10px] font-semibold text-zinc-500" title={row.name}>
                            {row.name}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {isPrincipal ? <span className="rounded-full bg-[#D32F2F]/10 px-2 py-0.5 text-[9px] font-black text-[#B91C1C]">Habitual</span> : null}
                            {isOrigin ? <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[9px] font-black text-zinc-600">Origen</span> : null}
                            {isMin ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-800">Mejor precio</span> : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black tabular-nums text-zinc-950">
                            {formatUnitPriceEur(row.pricePerBillingUnit ?? row.pricePerUnit, row.billingUnit ?? row.unit)}
                          </p>
                          <p
                            className={[
                              'mt-0.5 text-[11px] font-black tabular-nums',
                              deltaM != null && Math.abs(deltaM) < 0.01 ? 'text-emerald-700' : 'text-amber-800',
                            ].join(' ')}
                          >
                            Δ {deltaM != null ? formatMoneyEur(roundMoney(deltaM)) : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px] text-zinc-500">
                        <p>
                          Unidad compra: <span className="font-bold text-zinc-800">{row.unit}</span>
                        </p>
                        <p className="text-right">
                          Facturación: <span className="font-bold text-zinc-800">{row.billingUnit ?? row.unit}</span>
                        </p>
                        <p className="text-right">
                          Última compra:{' '}
                          <span className="font-bold text-zinc-800">{latestSample ? formatShortDate(latestSample.at) : '—'}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {compareRows.length > 1 && minCatalog != null && maxCatalog != null ? (
              <p className="mt-2 text-[10px] font-semibold text-zinc-500">
                {formatMoneyEur(roundMoney(minCatalog))} – {formatMoneyEur(roundMoney(maxCatalog))} · {compareRows.length} líneas
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-zinc-200/80">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                disabled={masterBusy || !localId || !supabaseOk}
                onClick={() => void saveMasterEconomics()}
                className="h-10 rounded-xl bg-[#D32F2F] px-4 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-[#D32F2F]/20 disabled:opacity-50"
              >
                {masterBusy ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                disabled={activoBusy || !localId || !supabaseOk}
                onClick={() => void applyActivo(!a.activo)}
                className="h-10 rounded-xl bg-zinc-50 px-3 text-xs font-black text-zinc-700 ring-1 ring-zinc-200 disabled:opacity-50"
              >
                {a.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </section>
        </div>
      </details>
      {imageViewerUrl ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Cerrar imagen"
            className="absolute inset-0 cursor-default"
            onClick={() => setImageViewerUrl(null)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-[1.4rem] bg-white p-2 shadow-2xl ring-1 ring-zinc-200">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <p className="min-w-0 truncate text-[12px] font-black text-zinc-900">{technicalLabel}</p>
              <button
                type="button"
                onClick={() => setImageViewerUrl(null)}
                className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-[10px] font-black text-zinc-500 hover:bg-zinc-100"
              >
                Cerrar
              </button>
            </div>
            <div className="overflow-hidden rounded-[1.1rem] bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageViewerUrl} alt={technicalLabel} className="max-h-[70vh] w-full object-contain" />
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
