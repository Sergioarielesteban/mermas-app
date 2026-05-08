'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ESCANDALLO_USAGE_UNIT_PRESETS, validateEscandalloUsageUnitInput } from '@/lib/escandallo-ingredient-units';
import { ChefHat, ChevronDown, GitCompare, History, LineChart, Package, Search, Star } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { computeCosteUnitarioUsoEur } from '@/lib/purchase-article-internal-cost';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import {
  fetchPurchaseArticles,
  fetchSupplierCatalogRowsForArticleIds,
  isMissingPurchaseArticlesError,
  labelMetodoCosteMaster,
  setPurchaseArticleActivo,
  updatePurchaseArticleMasterCostFields,
  type PurchaseArticle,
  type SupplierCatalogRow,
} from '@/lib/purchase-articles-supabase';
import {
  fetchSupplierProductPriceHistory,
  fetchSupplierProductPriceSamples,
  type SupplierProductPriceHistory,
  type SupplierProductPriceSample,
} from '@/lib/pedidos-supabase';
import { formatMoneyEur, formatUnitPriceEur, roundMoney } from '@/lib/money-format';
import {
  clearEscandalloWizardArticulosReturn,
  readEscandalloWizardArticulosReturn,
} from '@/lib/escandallo-articulos-nav';

function formatShortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch {
    return iso;
  }
}

export default function PedidosArticulosPage() {
  const { localCode, localName, localId, email, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [articles, setArticles] = useState<PurchaseArticle[]>([]);
  const [catalogByArticle, setCatalogByArticle] = useState<Map<string, SupplierCatalogRow[]>>(new Map());
  const [priceHistory, setPriceHistory] = useState<Map<string, SupplierProductPriceHistory>>(new Map());
  const [priceSamples, setPriceSamples] = useState<Map<string, SupplierProductPriceSample[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [origenFilter, setOrigenFilter] = useState<'todos' | 'proveedor' | 'cocina_central'>('todos');
  /** Por defecto solo activos: los inactivos siguen en BD y se recuperan con Inactivos/Todos. */
  const [estadoFilter, setEstadoFilter] = useState<'activos' | 'inactivos' | 'todos'>('activos');
  const [hasArticulosReturn, setHasArticulosReturn] = useState(false);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setArticles([]);
      setCatalogByArticle(new Map());
      setPriceHistory(new Map());
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
      const [hist, samples] = await Promise.all([
        productIds.length ? fetchSupplierProductPriceHistory(supabase, localId, productIds) : new Map(),
        productIds.length ? fetchSupplierProductPriceSamples(supabase, localId, productIds) : new Map(),
      ]);

      setArticles(list);
      setCatalogByArticle(catalogMap);
      setPriceHistory(hist);
      setPriceSamples(samples);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar artículos.';
      if (isMissingPurchaseArticlesError(msg)) {
        setBanner('Los artículos de compra no están disponibles para este local. Consulta con administración.');
      } else {
        setBanner(msg);
      }
      setArticles([]);
      setCatalogByArticle(new Map());
      setPriceHistory(new Map());
      setPriceSamples(new Map());
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
    <div className="space-y-2.5 pb-6 sm:space-y-3 sm:pb-8">
      <MermasStyleHero
        slim
        className="!px-3 !py-1.5 sm:!px-4 sm:!py-2"
        eyebrow="Pedidos"
        title="Artículos base (master)"
      />

      <div className="space-y-1.5">
        <div className="grid min-h-0 grid-cols-3 gap-1 sm:gap-1.5">
          <Link
            href="/pedidos/proveedores"
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-1.5 py-1.5 text-center text-[11px] font-semibold leading-tight text-zinc-700 sm:min-h-10 sm:px-2 sm:text-xs"
          >
            Proveedores
          </Link>
          <Link
            href="/pedidos/precios"
            className="inline-flex min-h-9 items-center justify-center gap-0.5 rounded-lg border border-sky-200 bg-sky-50 px-1.5 py-1.5 text-center text-[11px] font-semibold leading-tight text-sky-900 sm:min-h-10 sm:gap-1 sm:px-2 sm:text-xs"
          >
            <LineChart className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Precios
          </Link>
          <Link
            href="/escandallos/recetas/nuevo?paso=ingredientes"
            className="inline-flex min-h-9 items-center justify-center gap-0.5 rounded-lg border border-violet-200 bg-violet-50 px-1.5 py-1.5 text-center text-[11px] font-semibold leading-tight text-violet-900 sm:min-h-10 sm:gap-1 sm:px-2 sm:text-xs"
          >
            <ChefHat className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Ingredientes
          </Link>
        </div>
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
      </div>

      {banner ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-950">{banner}</div>
      ) : null}

      <section className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-zinc-200 sm:p-2.5">
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
            className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[9px] font-semibold text-zinc-700 shadow-sm sm:py-1 sm:text-[10px]"
          >
            Actualizar
          </button>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1 sm:flex sm:flex-wrap sm:gap-1">
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
                'min-h-8 rounded-md border px-1.5 py-1 text-[9px] font-bold leading-tight sm:min-h-0 sm:px-2 sm:text-[10px]',
                origenFilter === key
                  ? key === 'cocina_central'
                    ? 'border-amber-300 bg-amber-100 text-amber-950'
                    : 'border-zinc-400 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-700',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1 sm:flex sm:flex-wrap sm:gap-1">
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
                'min-h-8 rounded-md border px-1.5 py-1 text-[9px] font-bold leading-tight sm:min-h-0 sm:px-2 sm:text-[10px]',
                estadoFilter === key
                  ? 'border-emerald-600 bg-emerald-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700',
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
        <ul className="space-y-2">
          {filtered.map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              catalogRows={catalogByArticle.get(a.id) ?? []}
              priceHistory={priceHistory}
              priceSamples={priceSamples}
              onReload={() => void load()}
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
  priceHistory,
  priceSamples,
  onReload,
}: {
  article: PurchaseArticle;
  catalogRows: SupplierCatalogRow[];
  priceHistory: Map<string, SupplierProductPriceHistory>;
  priceSamples: Map<string, SupplierProductPriceSample[]>;
  onReload: () => void;
}) {
  const { localId } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [activoBusy, setActivoBusy] = useState(false);
  const [activoErr, setActivoErr] = useState<string | null>(null);
  const [masterBusy, setMasterBusy] = useState(false);
  const [masterMsg, setMasterMsg] = useState<string | null>(null);
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
    return (
      <li className={['list-none', !a.activo ? 'opacity-60' : ''].join(' ')}>
        <details className="group overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-sm ring-1 ring-amber-100">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-2.5 sm:gap-3 sm:p-3 [&::-webkit-details-marker]:hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-900">
              <ChefHat className="h-3.5 w-3.5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-amber-200/90 px-1.5 py-0.5 text-[8px] font-black uppercase leading-none text-amber-950 sm:text-[9px]">
                  Cocina Central
                </span>
                {!a.activo ? (
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[8px] font-bold uppercase leading-none text-zinc-700 sm:text-[9px]">
                    Inactivo
                  </span>
                ) : null}
              </div>
              <p
                className={[
                  'mt-0.5 line-clamp-2 text-sm font-bold leading-snug sm:text-base',
                  a.activo ? 'text-zinc-900' : 'text-zinc-500',
                ].join(' ')}
              >
                {a.nombre}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[8px] font-bold uppercase leading-tight text-zinc-500 sm:text-[9px]">Coste uso</p>
              <p className="text-base font-black tabular-nums leading-tight text-zinc-900 sm:text-lg">
                {cup != null ? formatUnitPriceEur(roundMoney(cup), uso) : '—'}
              </p>
            </div>
            <button
              type="button"
              disabled={activoBusy || !localId || !supabaseOk}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void applyActivo(!a.activo);
              }}
              className="shrink-0 rounded-lg border border-amber-300/80 bg-white px-2 py-1.5 text-[10px] font-bold text-amber-950 shadow-sm disabled:opacity-50 sm:text-[11px]"
            >
              {activoBusy ? '…' : a.activo ? 'Desactivar' : 'Activar'}
            </button>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-zinc-400 transition group-open:rotate-180"
              aria-hidden
            />
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
  const compraUnitEur =
    principalRefRow != null
      ? principalRefRow.pricePerUnit
      : a.costeCompraActual ?? master ?? null;
  const factorNum = Number(String(factorUso).replace(/\s/g, '').replace(',', '.'));
  const rendNum = Number(String(rendPct).replace(/\s/g, '').replace(',', '.'));
  const previewCosteUso =
    compraUnitEur != null && Number.isFinite(factorNum) && factorNum > 0 && Number.isFinite(rendNum)
      ? computeCosteUnitarioUsoEur(compraUnitEur, factorNum, rendNum > 0 ? rendNum : 100)
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
        origenCoste: 'app_config',
      });
      onReload();
    } catch (e: unknown) {
      setMasterMsg(e instanceof Error ? e.message : 'No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setMasterBusy(false);
    }
  };

  const nombreCompacto = (nombreVisibleProveedor || a.nombre).trim();

  return (
    <li className={['list-none', !a.activo ? 'opacity-60' : ''].join(' ')}>
      <details className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm ring-1 ring-zinc-100">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-2.5 sm:gap-3 sm:p-3 [&::-webkit-details-marker]:hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-800">
            <Package className="h-3.5 w-3.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[8px] font-black uppercase leading-none text-indigo-900 sm:text-[9px]">
                Artículo
              </span>
              {!a.activo ? (
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[8px] font-bold uppercase leading-none text-zinc-700 sm:text-[9px]">
                  Inactivo
                </span>
              ) : null}
            </div>
            <p
              className={[
                'mt-0.5 line-clamp-2 text-sm font-bold leading-snug sm:text-base',
                a.activo ? 'text-zinc-900' : 'text-zinc-500',
              ].join(' ')}
            >
              {nombreCompacto}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[8px] font-bold uppercase leading-tight text-zinc-500 sm:text-[9px]">Máster</p>
            <p className="text-base font-black tabular-nums leading-tight text-zinc-900 sm:text-lg">
              {master != null ? formatMoneyEur(roundMoney(master)) : '—'}
            </p>
          </div>
          <button
            type="button"
            disabled={activoBusy || !localId || !supabaseOk}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void applyActivo(!a.activo);
            }}
            className="shrink-0 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-[10px] font-bold text-zinc-900 shadow-sm disabled:opacity-50 sm:text-[11px]"
          >
            {activoBusy ? '…' : a.activo ? 'Desactivar' : 'Activar'}
          </button>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-zinc-400 transition group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="space-y-2 border-t border-zinc-100 bg-zinc-50/40 px-3 pb-3 pt-2 sm:space-y-3 sm:px-4 sm:pb-4 sm:pt-2">
          {activoErr ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-900">{activoErr}</p>
          ) : null}
          <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-700">
            {a.nombreCorto?.trim() ? (
              <p>
                <span className="font-semibold text-zinc-500">Alias:</span> {a.nombreCorto}
              </p>
            ) : null}
            <p className={a.nombreCorto?.trim() ? 'mt-0.5 text-zinc-600' : ''}>
              {a.unidadBase ? `${a.unidadBase}` : '—'}
              {a.categoria ? ` · ${a.categoria}` : ''}
            </p>
          </div>
          <section className="rounded-lg border border-indigo-200/80 bg-indigo-50/40 p-2.5 ring-1 ring-indigo-100 sm:p-3">
            <h3 className="text-[10px] font-black uppercase tracking-wide text-indigo-900">Compra y uso en cocina</h3>
            {masterMsg ? (
              <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-950">
                {masterMsg}
              </p>
            ) : null}
            <div className="mt-2 space-y-2">
              <div>
                <p className="text-[9px] font-black uppercase text-indigo-900/75">Compra</p>
                <dl className="mt-1 grid gap-1 text-[11px] text-zinc-800 sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">Proveedor habitual</dt>
                    <dd className="font-medium">{principalRefRow?.supplierName ?? '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-zinc-500">Referencia</dt>
                    <dd>
                      <select
                        value={refProdId}
                        disabled={masterBusy || compareRows.length === 0}
                        onChange={(e) => setRefProdId(e.target.value)}
                        className="mt-0.5 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs"
                      >
                        <option value="">—</option>
                        {compareRows.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.supplierName} · {r.name} ({formatUnitPriceEur(r.pricePerUnit, r.unit)})
                          </option>
                        ))}
                      </select>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Unidad de compra</dt>
                    <dd>{principalRefRow?.unit ?? a.unidadCompra ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Precio compra actual</dt>
                    <dd className="font-semibold tabular-nums">
                      {compraUnitEur != null ? formatMoneyEur(roundMoney(compraUnitEur)) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">IVA</dt>
                    <dd>{a.ivaCompraPct != null ? `${a.ivaCompraPct} %` : '—'}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-indigo-900/75">Uso en cocina</p>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <label className="block text-[11px] font-semibold text-zinc-700">
                    Unidad de uso
                    <input
                      list={`pa-usage-${a.id}`}
                      value={unidadUso}
                      disabled={masterBusy}
                      onChange={(e) => setUnidadUso(e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                      placeholder="loncha, g, ración…"
                    />
                    <datalist id={`pa-usage-${a.id}`}>
                      {ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                  </label>
                  <label className="block text-[11px] font-semibold text-zinc-700">
                    Uso por unidad de compra
                    <input
                      value={factorUso}
                      disabled={masterBusy}
                      onChange={(e) => setFactorUso(e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-zinc-700">
                    Rendimiento (%)
                    <input
                      value={rendPct}
                      disabled={masterBusy}
                      onChange={(e) => setRendPct(e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums"
                      inputMode="decimal"
                    />
                  </label>
                  <div className="flex flex-col justify-end rounded-md bg-white/90 px-2 py-1.5 ring-1 ring-indigo-100">
                    <p className="text-[9px] font-bold uppercase text-zinc-500">Coste unitario de uso</p>
                    <p className="text-base font-black tabular-nums text-emerald-800">
                      {previewCosteUso != null ? formatMoneyEur(roundMoney(previewCosteUso)) : '—'}
                    </p>
                    {a.costeUnitarioUso != null ? (
                      <p className="text-[10px] text-zinc-500">Guardado: {formatMoneyEur(roundMoney(a.costeUnitarioUso))}</p>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-indigo-100 bg-white/70 px-2 py-1.5 text-[11px] text-zinc-700">
                <p className="text-[9px] font-black uppercase text-indigo-900/75">Impacto</p>
                <dl className="mt-1 grid grid-cols-3 gap-1 text-center sm:text-left">
                  <div>
                    <dt className="text-[9px] text-zinc-500">Escandallos</dt>
                    <dd className="font-semibold">Sí</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] text-zinc-500">Mermas</dt>
                    <dd className="font-semibold text-zinc-400">—</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] text-zinc-500">Comida personal</dt>
                    <dd className="font-semibold text-zinc-400">—</dd>
                  </div>
                </dl>
              </div>
            </div>
            <button
              type="button"
              disabled={masterBusy || !localId || !supabaseOk}
              onClick={() => void saveMasterEconomics()}
              className="mt-2 w-full rounded-lg bg-indigo-900 py-2 text-xs font-bold text-white disabled:opacity-50 sm:w-auto sm:px-5 sm:text-sm"
            >
              {masterBusy ? 'Guardando…' : 'Guardar'}
            </button>
          </section>

          {/* Coste máster */}
          <section className="rounded-lg bg-white p-2.5 ring-1 ring-zinc-200 sm:p-3">
            <h3 className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-600">
              <LineChart className="h-3.5 w-3.5" aria-hidden />
              Coste máster
            </h3>
            <dl className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-bold uppercase text-zinc-500">Importe</dt>
                <dd className="font-mono font-semibold tabular-nums text-zinc-900">
                  {master != null ? formatMoneyEur(roundMoney(master)) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-zinc-500">Origen del valor</dt>
                <dd className="text-zinc-800">{labelMetodoCosteMaster(a.metodoCosteMaster)}</dd>
              </div>
              {a.costeMasterFijadoEn ? (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase text-zinc-500">Fijado / actualizado en</dt>
                  <dd className="text-zinc-800">{formatShortDate(a.costeMasterFijadoEn)}</dd>
                </div>
              ) : null}
            </dl>
            {masterStale ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
                Catálogo mín. <strong>{formatMoneyEur(roundMoney(minCatalog!))}</strong> · Máster{' '}
                <strong>{formatMoneyEur(roundMoney(master!))}</strong>. Conviene revisar la coherencia.
              </p>
            ) : null}
          </section>

          {/* Producto vinculado */}
          {originRow ? (
            <section className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-2.5 sm:p-3">
              <h3 className="text-[10px] font-black uppercase text-zinc-600">Producto de referencia</h3>
              <div className="mt-2 flex flex-col gap-2 rounded-lg bg-white p-2.5 ring-1 ring-zinc-200 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-zinc-600">
                    Catálogo
                  </span>
                  <p className="mt-1 font-semibold text-zinc-900">{originRow.supplierName}</p>
                  <p className="text-xs text-zinc-600">
                    {originRow.name} · {originRow.unit}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] font-bold uppercase text-zinc-500">Precio catálogo</p>
                  <p className="text-lg font-black tabular-nums text-zinc-900">{formatUnitPriceEur(originRow.pricePerUnit, originRow.unit)}</p>
                  {master != null ? (
                    <p className="text-[11px] text-zinc-500">
                      Δ vs máster:{' '}
                      <span
                        className={
                          Math.abs(originRow.pricePerUnit - master) < 0.01
                            ? 'font-semibold text-emerald-700'
                            : 'font-semibold text-amber-800'
                        }
                      >
                        {formatMoneyEur(roundMoney(originRow.pricePerUnit - master))}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          ) : (
            <p className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-600">
              Sin catálogo vinculado. Revisa en Proveedores.
            </p>
          )}

          {/* Comparativa proveedores */}
          <section className="rounded-lg bg-white p-2.5 ring-1 ring-zinc-200 sm:p-3">
            <h3 className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-600">
              <GitCompare className="h-3.5 w-3.5" aria-hidden />
              Comparativa por proveedor
            </h3>
            {compareRows.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">Sin datos de catálogo.</p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg ring-1 ring-zinc-100">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-zinc-50 font-black uppercase text-zinc-500">
                    <tr>
                      <th className="px-2 py-2">Proveedor</th>
                      <th className="px-2 py-2">Producto</th>
                      <th className="px-2 py-2">Ud</th>
                      <th className="px-2 py-2 text-right">Catálogo €</th>
                      <th className="px-2 py-2 text-right">vs máster</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((row) => {
                      const isMin =
                        minCatalog != null && row.pricePerUnit === minCatalog && compareRows.length > 1;
                      const isOrigin = originId === row.id;
                      const isPrincipal =
                        (a.referenciaPrincipalSupplierProductId != null &&
                          a.referenciaPrincipalSupplierProductId === row.id) ||
                        (a.referenciaPrincipalSupplierProductId == null && originId === row.id);
                      const isPref = preferredId === row.supplierId;
                      const deltaM = master != null ? row.pricePerUnit - master : null;
                      return (
                        <tr
                          key={row.id}
                          className={[
                            'border-t border-zinc-100',
                            isMin ? 'bg-emerald-50/90' : '',
                            !row.isActive ? 'opacity-60' : '',
                          ].join(' ')}
                        >
                          <td className="px-2 py-2 font-semibold text-zinc-900">
                            <span className="inline-flex flex-wrap items-center gap-1">
                              {row.supplierName}
                              {isPref ? (
                                <Star
                                  className="inline h-3.5 w-3.5 fill-amber-400 text-amber-500"
                                  aria-label="Proveedor preferido en artículo"
                                />
                              ) : null}
                              {isOrigin ? (
                                <span className="rounded bg-indigo-100 px-1 text-[9px] font-black text-indigo-900">Origen</span>
                              ) : null}
                              {isPrincipal ? (
                                <span className="rounded bg-sky-100 px-1 text-[9px] font-black text-sky-900">Principal</span>
                              ) : null}
                              {isMin ? (
                                <span className="rounded bg-emerald-200 px-1 text-[9px] font-black text-emerald-900">Mejor</span>
                              ) : null}
                            </span>
                          </td>
                          <td className="max-w-[140px] truncate px-2 py-2 text-zinc-700" title={row.name}>
                            {row.name}
                          </td>
                          <td className="px-2 py-2 text-zinc-600">{row.unit}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-zinc-900">
                            {formatUnitPriceEur(row.pricePerUnit, row.unit)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                            {deltaM != null ? (
                              <span className={Math.abs(deltaM) < 0.01 ? 'text-emerald-700' : 'text-amber-800'}>
                                {formatMoneyEur(roundMoney(deltaM))}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {compareRows.length > 1 && minCatalog != null && maxCatalog != null ? (
              <p className="mt-1.5 text-[10px] text-zinc-500">
                {formatMoneyEur(roundMoney(minCatalog))} – {formatMoneyEur(roundMoney(maxCatalog))} · {compareRows.length} líneas
              </p>
            ) : null}
          </section>

          {/* Histórico precios pedidos */}
          <section className="rounded-lg bg-white p-2.5 ring-1 ring-zinc-200 sm:p-3">
            <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-black uppercase text-zinc-600">
              <span className="inline-flex items-center gap-2">
                <History className="h-3.5 w-3.5" aria-hidden />
                Histórico de precios
              </span>
              <Link href="/pedidos/precios" className="font-semibold normal-case text-[#B91C1C] underline-offset-2 hover:underline">
                Evolución
              </Link>
            </h3>
            <div className="mt-2 space-y-2">
              {compareRows.map((row) => {
                const h = priceHistory.get(row.id);
                const samples = priceSamples.get(row.id) ?? [];
                return (
                  <div key={row.id} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
                    <p className="text-xs font-bold text-zinc-800">
                      {row.supplierName} · {row.name}
                    </p>
                    {h && h.samples > 0 ? (
                      <p className="mt-1 text-[11px] text-zinc-600">
                        Último {formatMoneyEur(roundMoney(h.lastPrice))} · Media {formatMoneyEur(roundMoney(h.avgPrice))} · Min{' '}
                        {formatMoneyEur(roundMoney(h.minPrice))} · Max {formatMoneyEur(roundMoney(h.maxPrice))} · {h.samples}{' '}
                        línea{h.samples === 1 ? '' : 's'}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-zinc-500">Sin compras registradas con este producto.</p>
                    )}
                    {samples.length > 0 ? (
                      <ul className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto text-[10px]">
                        {samples.map((s, i) => (
                          <li
                            key={`${s.at}-${i}`}
                            className="rounded border border-zinc-200 bg-white px-2 py-1 tabular-nums text-zinc-800"
                          >
                            {formatMoneyEur(roundMoney(s.pricePerUnit))}{' '}
                            <span className="text-zinc-400">{formatShortDate(s.at)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </details>
    </li>
  );
}
