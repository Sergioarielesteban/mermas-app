'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ESCANDALLO_USAGE_UNIT_PRESETS, validateEscandalloUsageUnitInput } from '@/lib/escandallo-ingredient-units';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  GitCompare,
  History,
  LineChart,
  Package,
  Search,
  Star,
} from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { computeCosteUnitarioUsoEur } from '@/lib/purchase-article-internal-cost';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import {
  fetchPurchaseArticleDuplicateCandidates,
  fetchPurchaseArticles,
  fetchSupplierCatalogRowsForArticleIds,
  isMissingPurchaseArticlesError,
  labelMetodoCosteMaster,
  updatePurchaseArticleMasterCostFields,
  type PurchaseArticle,
  type PurchaseArticleDuplicateCandidate,
  type SupplierCatalogRow,
} from '@/lib/purchase-articles-supabase';
import {
  fetchSupplierProductPriceHistory,
  fetchSupplierProductPriceSamples,
  type SupplierProductPriceHistory,
  type SupplierProductPriceSample,
} from '@/lib/pedidos-supabase';
import { formatMoneyEur, formatUnitPriceEur, roundMoney } from '@/lib/money-format';

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
  const [duplicates, setDuplicates] = useState<PurchaseArticleDuplicateCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showDup, setShowDup] = useState(false);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setArticles([]);
      setCatalogByArticle(new Map());
      setPriceHistory(new Map());
      setPriceSamples(new Map());
      setDuplicates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const list = await fetchPurchaseArticles(supabase, localId);
      const articleIds = list.map((a) => a.id);
      const [catalogMap, dups] = await Promise.all([
        fetchSupplierCatalogRowsForArticleIds(supabase, localId, articleIds).catch(() => new Map()),
        fetchPurchaseArticleDuplicateCandidates(supabase, localId).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          if (/duplicate_candidates|purchase_article_duplicate|schema cache|does not exist/i.test(msg)) {
            return [] as PurchaseArticleDuplicateCandidate[];
          }
          throw e;
        }),
      ]);

      const productIds = [...new Set([...catalogMap.values()].flat().map((r) => r.id))];
      const [hist, samples] = await Promise.all([
        productIds.length ? fetchSupplierProductPriceHistory(supabase, localId, productIds) : new Map(),
        productIds.length ? fetchSupplierProductPriceSamples(supabase, localId, productIds) : new Map(),
      ]);

      setArticles(list);
      setCatalogByArticle(catalogMap);
      setPriceHistory(hist);
      setPriceSamples(samples);
      setDuplicates(dups);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar artículos.';
      if (isMissingPurchaseArticlesError(msg)) {
        setBanner('Ejecuta en Supabase: supabase-pedidos-migration-purchase-articles.sql');
      } else {
        setBanner(msg);
      }
      setArticles([]);
      setCatalogByArticle(new Map());
      setPriceHistory(new Map());
      setPriceSamples(new Map());
      setDuplicates([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return articles;
    return articles.filter(
      (a) =>
        a.nombre.toLowerCase().includes(t) ||
        (a.categoria ?? '').toLowerCase().includes(t) ||
        (a.observaciones ?? '').toLowerCase().includes(t),
    );
  }, [articles, q]);

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
    <div className="space-y-4 pb-10">
      <MermasStyleHero
        slim
        eyebrow="Pedidos"
        title="Artículos base (master)"
        description="Coste interno por unidad de uso; escandallo hereda unidad y coste cuando el crudo enlaza al artículo."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/pedidos/proveedores"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          Proveedores
        </Link>
        <Link
          href="/pedidos/precios"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-900"
        >
          <LineChart className="h-4 w-4" aria-hidden />
          Precios
        </Link>
      </div>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 ring-1 ring-indigo-100 sm:p-5">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-indigo-900">
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
          Artículo vs producto de proveedor
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-3 ring-1 ring-indigo-100/80">
            <p className="text-[10px] font-black uppercase text-indigo-600">Artículo base</p>
            <p className="mt-1 text-sm text-zinc-800">
              Concepto <strong>interno</strong> del local: nombre unificado, unidad de referencia y{' '}
              <strong>coste máster</strong> (referencia de coste que puedes ir afinando). No sustituye al catálogo.
            </p>
          </div>
          <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200/80">
            <p className="text-[10px] font-black uppercase text-zinc-500">Producto de proveedor</p>
            <p className="mt-1 text-sm text-zinc-800">
              Lo que eliges en <strong>Nuevo pedido</strong>: precio de catálogo, IVA, envase, etc. Los pedidos guardan este
              vínculo; el artículo es una capa de análisis encima.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase text-zinc-500">Listado</p>
            <p className="text-sm text-zinc-600">
              <span className="font-bold tabular-nums text-zinc-900">{filtered.length}</span> artículos
              {q.trim() ? ' (filtrado)' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-[40px] rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800"
          >
            Actualizar
          </button>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, categoría…"
            className="min-h-[48px] w-full rounded-xl border border-zinc-200 py-3 pl-9 pr-3 text-base outline-none focus:ring-2 focus:ring-[#D32F2F]/20 sm:text-sm"
          />
        </div>
      </section>

      <details
        className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 ring-1 ring-amber-100"
        open={showDup}
        onToggle={(e) => setShowDup(e.currentTarget.open)}
      >
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-bold text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Posibles duplicados (nombre parecido)
        </summary>
        <p className="mt-2 text-xs text-amber-900/90">
          Solo sugerencias; no se fusionan artículos. Vista SQL:{' '}
          <code className="rounded bg-white/80 px-1">purchase_article_duplicate_candidates</code>.
        </p>
        {duplicates.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">
            {loading ? 'Cargando…' : 'No hay pares por encima del umbral o la vista aún no existe.'}
          </p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
            {duplicates.map((d) => (
              <li key={`${d.articleIdA}-${d.articleIdB}`} className="rounded-lg bg-white px-3 py-2 ring-1 ring-amber-200/80">
                <p className="font-semibold text-zinc-900">
                  {d.nombreA} ↔ {d.nombreB}
                </p>
                <p className="text-[11px] text-zinc-500">
                  Similitud {(d.score * 100).toFixed(0)}% ·{' '}
                  <span className="font-mono">{d.articleIdA.slice(0, 8)}…</span> /{' '}
                  <span className="font-mono">{d.articleIdB.slice(0, 8)}…</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </details>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando artículos…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl bg-zinc-50 py-10 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
          {articles.length === 0
            ? 'Aún no hay artículos. Ejecuta la migración SQL o crea productos en Proveedores.'
            : 'Nada coincide con la búsqueda.'}
        </p>
      ) : (
        <ul className="space-y-3">
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
      setMasterMsg(
        e instanceof Error
          ? e.message
          : 'No se pudo guardar. ¿Ejecutaste supabase-pedidos-migration-master-article-usage-cost.sql?',
      );
    } finally {
      setMasterBusy(false);
    }
  };

  return (
    <li className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm ring-1 ring-zinc-100">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800">
            <Package className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-black uppercase text-indigo-900">
                Artículo
              </span>
              {a.activo ? (
                <span className="text-[10px] font-bold uppercase text-emerald-700">Activo</span>
              ) : (
                <span className="text-[10px] font-bold uppercase text-zinc-500">Inactivo</span>
              )}
            </div>
            <p className="mt-1 text-base font-bold text-zinc-900 sm:text-lg">{a.nombre}</p>
            <p className="text-xs text-zinc-600">
              {a.unidadBase ? `Unidad ref.: ${a.unidadBase}` : 'Sin unidad base'}
              {a.categoria ? ` · ${a.categoria}` : ''}
            </p>
          </div>
        </div>
        <div className="w-full text-left sm:w-auto sm:text-right">
          <p className="text-[10px] font-bold uppercase text-zinc-500">Coste máster</p>
          <p className="text-xl font-black tabular-nums text-zinc-900 sm:text-2xl">
            {master != null ? formatMoneyEur(roundMoney(master)) : '—'}
          </p>
          <p className="text-[11px] text-zinc-500">{labelMetodoCosteMaster(a.metodoCosteMaster)}</p>
        </div>
      </div>

      <details className="group border-t border-zinc-100 bg-zinc-50/40">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-zinc-800 sm:px-5">
          <span className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-zinc-500" aria-hidden />
            Detalle: catálogo, histórico y comparativa
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-zinc-400 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
          <section className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-3 ring-1 ring-indigo-100 sm:p-4">
            <h3 className="text-xs font-black uppercase text-indigo-900">Compra → uso cocina</h3>
            {masterMsg ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
                {masterMsg}
              </p>
            ) : null}
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase text-indigo-900/80">A) Compra</p>
                <dl className="mt-1 grid gap-1 text-xs text-zinc-800 sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-zinc-500">Proveedor habitual</dt>
                    <dd>{principalRefRow?.supplierName ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-zinc-500">Referencia principal</dt>
                    <dd className="truncate" title={principalRefRow?.name}>
                      {principalRefRow?.name ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-zinc-500">Unidad de compra</dt>
                    <dd>{principalRefRow?.unit ?? a.unidadCompra ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-zinc-500">IVA compra</dt>
                    <dd>{a.ivaCompraPct != null ? `${a.ivaCompraPct} %` : '—'}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-indigo-900/80">B) Uso interno</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Referencia principal (catálogo)
                    <select
                      value={refProdId}
                      disabled={masterBusy || compareRows.length === 0}
                      onChange={(e) => setRefProdId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {compareRows.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.supplierName} · {r.name} ({formatUnitPriceEur(r.pricePerUnit, r.unit)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-lg bg-white/90 px-3 py-2 text-xs ring-1 ring-indigo-100">
                    <p className="font-bold uppercase text-zinc-500">Coste compra actual</p>
                    <p className="mt-1 text-lg font-black tabular-nums text-zinc-900">
                      {compraUnitEur != null ? formatMoneyEur(roundMoney(compraUnitEur)) : '—'}
                    </p>
                    <p className="text-[10px] text-zinc-500">Sincronizado con la referencia (SQL).</p>
                  </div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Unidad de uso
                    <input
                      list={`pa-usage-${a.id}`}
                      value={unidadUso}
                      disabled={masterBusy}
                      onChange={(e) => setUnidadUso(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
                      placeholder="loncha, g, ración…"
                    />
                    <datalist id={`pa-usage-${a.id}`}>
                      {ESCANDALLO_USAGE_UNIT_PRESETS.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                  </label>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Unidades de uso por unidad de compra
                    <input
                      value={factorUso}
                      disabled={masterBusy}
                      onChange={(e) => setFactorUso(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm tabular-nums"
                      inputMode="decimal"
                      placeholder="Ej. 50 lonchas / 1 kg → 50"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-zinc-700 sm:col-span-1">
                    Rendimiento útil (%)
                    <input
                      value={rendPct}
                      disabled={masterBusy}
                      onChange={(e) => setRendPct(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm tabular-nums"
                      inputMode="decimal"
                    />
                  </label>
                  <div className="flex flex-col justify-end rounded-lg bg-white/90 px-3 py-2 ring-1 ring-indigo-100 sm:col-span-1">
                    <p className="text-[10px] font-bold uppercase text-zinc-500">Coste unitario de uso (vista)</p>
                    <p className="text-lg font-black tabular-nums text-emerald-800">
                      {previewCosteUso != null ? formatMoneyEur(roundMoney(previewCosteUso)) : '—'}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      En BD: {a.costeUnitarioUso != null ? formatMoneyEur(roundMoney(a.costeUnitarioUso)) : '—'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-indigo-100 bg-white/60 px-3 py-2 text-xs text-zinc-700">
                <p className="text-[10px] font-black uppercase text-indigo-900/80">C) Impacto</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>
                    <strong>Escandallos:</strong> sí (unidad + coste del máster).
                  </li>
                  <li>
                    <strong>Mermas:</strong> no conectado.
                  </li>
                  <li>
                    <strong>Comida personal:</strong> pendiente.
                  </li>
                </ul>
              </div>
            </div>
            <button
              type="button"
              disabled={masterBusy || !localId || !supabaseOk}
              onClick={() => void saveMasterEconomics()}
              className="mt-3 w-full rounded-xl bg-indigo-900 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto sm:px-6"
            >
              {masterBusy ? 'Guardando…' : 'Guardar conversión y referencia'}
            </button>
          </section>

          {/* Coste máster */}
          <section className="rounded-xl bg-white p-3 ring-1 ring-zinc-200 sm:p-4">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase text-zinc-600">
              <LineChart className="h-3.5 w-3.5" aria-hidden />
              Coste máster (referencia)
            </h3>
            <p className="mt-2 text-xs text-zinc-600">
              Histórico / compatibilidad. Coste cocina: <strong>coste_unitario_uso</strong> (bloque B arriba).
            </p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
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
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                El precio de catálogo más bajo ahora es <strong>{formatMoneyEur(roundMoney(minCatalog!))}</strong> y el máster es{' '}
                <strong>{formatMoneyEur(roundMoney(master!))}</strong>. Revisa si quieres alinear el máster manualmente en base de datos
                o en una futura edición en app.
              </p>
            ) : null}
          </section>

          {/* Producto vinculado */}
          {originRow ? (
            <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-3 sm:p-4">
              <h3 className="text-xs font-black uppercase text-zinc-600">Producto de proveedor de referencia</h3>
              <p className="mt-1 text-xs text-zinc-600">
                Línea de catálogo enlazada (origen migración o alta). Es la que usa el flujo de pedidos con ese UUID.
              </p>
              <div className="mt-3 flex flex-col gap-2 rounded-lg bg-white p-3 ring-1 ring-zinc-200 sm:flex-row sm:items-center sm:justify-between">
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
            <p className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
              No hay filas de catálogo con este <code className="rounded bg-zinc-100 px-1">article_id</code>. Comprueba la
              migración o el enlace en Proveedores.
            </p>
          )}

          {/* Comparativa proveedores */}
          <section className="rounded-xl bg-white p-3 ring-1 ring-zinc-200 sm:p-4">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase text-zinc-600">
              <GitCompare className="h-3.5 w-3.5" aria-hidden />
              Comparativa por proveedor (mismo artículo)
            </h3>
            <p className="mt-1 text-xs text-zinc-600">
              Filas de <strong>pedido_supplier_products</strong> que comparten este artículo. Ordenadas por precio de catálogo.
              Si solo hay una, más adelante podrás enlazar otro proveedor al mismo artículo para comparar.
            </p>
            {compareRows.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">Sin datos de catálogo.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg ring-1 ring-zinc-100">
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
              <p className="mt-2 text-[11px] text-zinc-500">
                Rango catálogo activo: {formatMoneyEur(roundMoney(minCatalog))} – {formatMoneyEur(roundMoney(maxCatalog))} ({compareRows.length}{' '}
                filas)
              </p>
            ) : null}
          </section>

          {/* Histórico precios pedidos */}
          <section className="rounded-xl bg-white p-3 ring-1 ring-zinc-200 sm:p-4">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase text-zinc-600">
              <History className="h-3.5 w-3.5" aria-hidden />
              Histórico de precios (pedidos)
            </h3>
            <p className="mt-1 text-xs text-zinc-600">
              Resumen y últimas líneas con <strong>supplier_product_id</strong> en pedidos enviados/recibidos. Para gráficos
              avanzados usa <Link href="/pedidos/precios" className="font-bold text-[#D32F2F] underline">Precios</Link>.
            </p>
            <div className="mt-3 space-y-3">
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
