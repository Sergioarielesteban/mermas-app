'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Package, Search } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import {
  fetchPurchaseArticleDuplicateCandidates,
  fetchPurchaseArticles,
  isMissingPurchaseArticlesError,
  type PurchaseArticle,
  type PurchaseArticleDuplicateCandidate,
} from '@/lib/purchase-articles-supabase';

export default function PedidosArticulosPage() {
  const { localCode, localName, localId, email, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [articles, setArticles] = useState<PurchaseArticle[]>([]);
  const [duplicates, setDuplicates] = useState<PurchaseArticleDuplicateCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showDup, setShowDup] = useState(false);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setArticles([]);
      setDuplicates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const [list, dups] = await Promise.all([
        fetchPurchaseArticles(supabase, localId),
        fetchPurchaseArticleDuplicateCandidates(supabase, localId).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.toLowerCase().includes('purchase_article_duplicate')) {
            return [] as PurchaseArticleDuplicateCandidate[];
          }
          throw e;
        }),
      ]);
      setArticles(list);
      setDuplicates(dups);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar artículos.';
      if (isMissingPurchaseArticlesError(msg)) {
        setBanner('Ejecuta en Supabase: supabase-pedidos-migration-purchase-articles.sql');
      } else {
        setBanner(msg);
      }
      setArticles([]);
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
        title="Artículos base"
        description="Catálogo interno de compras: un artículo por producto de proveedor tras la migración; convive con el catálogo actual sin sustituirlo."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/pedidos"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Pedidos
        </Link>
        <Link
          href="/pedidos/proveedores"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700"
        >
          Proveedores
        </Link>
      </div>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

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
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800"
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
            className="w-full rounded-xl border border-zinc-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
          />
        </div>
      </section>

      <details
        className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 ring-1 ring-amber-100"
        open={showDup}
        onToggle={(e) => setShowDup(e.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Posibles duplicados (nombre parecido) — revisión manual
        </summary>
        <p className="mt-2 text-xs text-amber-900/90">
          Lista generada con similitud de texto (pg_trgm). No fusiona artículos automáticamente. En Supabase puedes consultar la
          vista <code className="rounded bg-white/80 px-1">purchase_article_duplicate_candidates</code>.
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
                  Similitud {(d.score * 100).toFixed(0)}% · IDs{' '}
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
        <ul className="space-y-2">
          {filtered.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 gap-2">
                  <Package className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-900">{a.nombre}</p>
                    <p className="text-xs text-zinc-600">
                      {a.unidadBase ?? '—'}
                      {a.categoria ? ` · ${a.categoria}` : ''}
                      {a.metodoCosteMaster ? ` · ${a.metodoCosteMaster}` : ''}
                    </p>
                    {a.createdFromSupplierProductId ? (
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Origen catálogo:{' '}
                        <span className="font-mono">{a.createdFromSupplierProductId.slice(0, 8)}…</span>
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black tabular-nums text-zinc-900">
                    {a.costeMaster != null ? `${a.costeMaster.toFixed(4)} €` : '—'}
                  </p>
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">{a.activo ? 'Activo' : 'Inactivo'}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
