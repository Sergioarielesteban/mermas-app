'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Euro,
  FileText,
  Filter,
  Link2,
  Loader2,
  ScanLine,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { deliveryNoteStatusVisual } from '@/lib/delivery-notes-ui';
import AlbaranOcrLauncher from '@/components/pedidos/albaranes/AlbaranOcrLauncher';
import {
  DELIVERY_NOTE_STATUS_LABEL,
  deleteDeliveryNote,
  fetchDeliveryNotesList,
  type DeliveryNoteListEntry,
  type DeliveryNoteStatus,
} from '@/lib/delivery-notes-supabase';
import { removeDeliveryNoteOriginal } from '@/lib/delivery-notes-storage';
import {
  computeDeliveryNotesMonthlyStats,
  pickOcrPendingNotes,
  summarisePendingReason,
} from '@/lib/delivery-notes-stats';
import { markPedidosUiSkipRestoreOnce } from '@/lib/pedidos-ui-session';

const STATUS_OPTIONS: (DeliveryNoteStatus | 'all')[] = [
  'all',
  'draft',
  'ocr_read',
  'pending_review',
  'validated',
  'with_incidents',
  'archived',
];

function formatNoteDate(entry: DeliveryNoteListEntry): string {
  const iso = entry.deliveryDate ? `${entry.deliveryDate}T12:00:00` : entry.createdAt;
  const d = new Date(iso);
  const dateFmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
  });
  const timeFmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
  });
  const date = dateFmt.format(d).replace('.', '');
  const time = entry.deliveryDate ? '' : ` · ${timeFmt.format(d)}`;
  return `${date}${time}`;
}

function formatEuro(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)} €`;
}

export default function PedidosAlbaranesPage() {
  const { localCode, localName, localId, email, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [rows, setRows] = useState<DeliveryNoteListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [launcherOpen, setLauncherOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DeliveryNoteStatus | 'all'>('all');
  const [supplierQ, setSupplierQ] = useState('');
  const [onlyIncidents, setOnlyIncidents] = useState<'all' | 'yes' | 'no'>('all');
  const [onlyLinked, setOnlyLinked] = useState<'all' | 'yes' | 'no'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setBanner(null);
    try {
      const list = await fetchDeliveryNotesList(getSupabaseClient()!, localId);
      setRows(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar albaranes.';
      if (msg.includes('does not exist')) {
        setBanner('Ejecuta en Supabase: supabase-pedidos-delivery-notes.sql');
      } else {
        setBanner(msg);
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  // Refresh cuando vuelvas a la pestaña: para captar el albarán recién creado.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const filtered = useMemo(() => {
    const sq = supplierQ.trim().toLowerCase();
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (onlyIncidents === 'yes' && !r.hasOpenIncidents) return false;
      if (onlyIncidents === 'no' && r.hasOpenIncidents) return false;
      if (onlyLinked === 'yes' && !r.relatedOrderId) return false;
      if (onlyLinked === 'no' && r.relatedOrderId) return false;
      if (sq && !r.supplierName.toLowerCase().includes(sq)) return false;
      if (dateFrom && (!r.deliveryDate || r.deliveryDate < dateFrom)) return false;
      if (dateTo && (!r.deliveryDate || r.deliveryDate > dateTo)) return false;
      if (qq) {
        const blob = [
          r.deliveryNoteNumber,
          r.supplierName,
          r.relatedOrderId ?? '',
          r.notes,
        ]
          .join(' ')
          .toLowerCase();
        if (!blob.includes(qq)) return false;
      }
      return true;
    });
  }, [rows, status, supplierQ, q, onlyIncidents, onlyLinked, dateFrom, dateTo]);

  const stats = useMemo(() => computeDeliveryNotesMonthlyStats(rows), [rows]);
  const pendingTop = useMemo(() => pickOcrPendingNotes(rows, 3), [rows]);
  const totalPending = useMemo(() => pickOcrPendingNotes(rows, 9999).length, [rows]);

  const activeFiltersCount = useMemo(() => {
    let n = 0;
    if (status !== 'all') n++;
    if (supplierQ.trim()) n++;
    if (onlyIncidents !== 'all') n++;
    if (onlyLinked !== 'all') n++;
    if (dateFrom) n++;
    if (dateTo) n++;
    return n;
  }, [status, supplierQ, onlyIncidents, onlyLinked, dateFrom, dateTo]);

  const resetFilters = () => {
    setStatus('all');
    setSupplierQ('');
    setOnlyIncidents('all');
    setOnlyLinked('all');
    setDateFrom('');
    setDateTo('');
  };

  const handleDelete = useCallback(
    async (entry: DeliveryNoteListEntry) => {
      if (!localId || !supabaseOk) return;
      const supabase = getSupabaseClient()!;
      setDeletingId(entry.id);
      setBanner(null);
      try {
        await deleteDeliveryNote(supabase, localId, entry.id);
        if (entry.originalStoragePath) {
          await removeDeliveryNoteOriginal(supabase, entry.originalStoragePath);
        }
        setRows((prev) => prev.filter((r) => r.id !== entry.id));
        setConfirmDeleteId(null);
      } catch (e: unknown) {
        setBanner(e instanceof Error ? e.message : 'No se pudo eliminar el albarán.');
      } finally {
        setDeletingId(null);
      }
    },
    [localId, supabaseOk],
  );

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
        <p className="text-sm text-zinc-600">Albaranes no disponibles en esta sesión.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* HEADER COMPACTO */}
      <header className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Pedidos</p>
          <h1 className="text-[22px] font-black leading-tight text-zinc-900">Albaranes</h1>
        </div>
        <Link
          href="/pedidos"
          onClick={markPedidosUiSkipRestoreOnce}
          className="text-[12px] font-semibold text-zinc-500 hover:text-zinc-900"
        >
          ← Pedidos
        </Link>
      </header>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {banner}
        </div>
      ) : null}

      {/* 1. HERO OCR */}
      <HeroOcrCard onOpen={() => setLauncherOpen(true)} />

      {/* 2. OCR PENDIENTES */}
      <OcrPendingSection
        loading={loading}
        items={pendingTop}
        totalPending={totalPending}
        onViewAll={() => setStatus('pending_review')}
      />

      {/* 3. ALBARANES RECIENTES */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[15px] font-black text-zinc-900">Albaranes recientes</h2>
          <span className="text-[11px] font-semibold text-zinc-500">
            {filtered.length} de {rows.length}
          </span>
        </div>

        {/* Buscador inline + botón Filtros */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nº, proveedor, nota…"
              className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="relative inline-flex h-10 items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-3 text-[13px] font-bold text-zinc-800 shadow-sm"
          >
            <Filter className="h-4 w-4" aria-hidden />
            Filtros
            {activeFiltersCount > 0 ? (
              <span className="ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#D32F2F] px-1 text-[10px] font-black text-white">
                {activeFiltersCount}
              </span>
            ) : null}
          </button>
        </div>

        {loading ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-zinc-500 ring-1 ring-zinc-200">
            Cargando albaranes…
          </p>
        ) : filtered.length === 0 ? (
          <EmptyState onOpen={() => setLauncherOpen(true)} />
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {filtered.map((r) => (
              <li key={r.id}>
                <RecentNoteRow
                  entry={r}
                  confirming={confirmDeleteId === r.id}
                  deleting={deletingId === r.id}
                  onAskDelete={() => setConfirmDeleteId(r.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onConfirmDelete={() => void handleDelete(r)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 5. MINI KPIs COMPACTOS */}
      <MiniKpiGrid stats={stats} />

      {/* BOTTOM SHEETS */}
      <AlbaranOcrLauncher
        mode="sheet"
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
      />
      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        status={status}
        setStatus={setStatus}
        supplierQ={supplierQ}
        setSupplierQ={setSupplierQ}
        onlyIncidents={onlyIncidents}
        setOnlyIncidents={setOnlyIncidents}
        onlyLinked={onlyLinked}
        setOnlyLinked={setOnlyLinked}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        onReset={resetFilters}
        activeCount={activeFiltersCount}
      />
    </div>
  );
}

// ─── HERO OCR ────────────────────────────────────────────────────────────────
function HeroOcrCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-gradient-to-br from-white via-white to-rose-50/40 p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#D32F2F]/10 text-[#D32F2F] ring-1 ring-[#D32F2F]/20">
          <ScanLine className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-black text-zinc-900">Escanear albarán</h2>
          <p className="text-[13px] text-zinc-600">Recepción rápida con OCR</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onOpen}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] text-white shadow-lg ring-1 ring-[#D32F2F]/30 active:scale-[0.98]"
        >
          <ScanLine className="h-5 w-5" aria-hidden />
          <span className="text-[13.5px] font-black tracking-tight">Cámara</span>
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-sm active:scale-[0.98]"
        >
          <FileText className="h-5 w-5 text-[#D32F2F]" aria-hidden />
          <span className="text-[13.5px] font-black tracking-tight">Subir PDF / Imagen</span>
        </button>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-zinc-500 sm:grid-cols-3">
        <li className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-emerald-600" aria-hidden /> Extrae líneas y precios
        </li>
        <li className="flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-amber-600" aria-hidden /> Detecta diferencias
        </li>
        <li className="flex items-center gap-1.5">
          <Link2 className="h-3 w-3 text-sky-600" aria-hidden /> Vincula con pedido
        </li>
      </ul>
    </section>
  );
}

// ─── OCR PENDIENTES ──────────────────────────────────────────────────────────
function OcrPendingSection({
  loading,
  items,
  totalPending,
  onViewAll,
}: {
  loading: boolean;
  items: DeliveryNoteListEntry[];
  totalPending: number;
  onViewAll: () => void;
}) {
  if (loading) return null;
  if (items.length === 0) {
    return (
      <section className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-[14.5px] font-black text-emerald-900">Sin OCR pendientes</h3>
            <p className="text-[12px] text-emerald-800/80">
              Todos los albaranes recibidos están validados o archivados.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-[14.5px] font-black text-zinc-900">OCR pendientes</h3>
            <p className="text-[12px] text-zinc-600">
              {totalPending === 1
                ? '1 albarán necesita revisión'
                : `${totalPending} albaranes necesitan revisión`}
            </p>
          </div>
        </div>
        {totalPending > items.length ? (
          <button
            type="button"
            onClick={onViewAll}
            className="rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-black text-white"
          >
            Ver todos
          </button>
        ) : null}
      </div>

      <ul className="mt-3 space-y-2">
        {items.map((entry) => (
          <li key={entry.id}>
            <PendingMiniCard entry={entry} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PendingMiniCard({ entry }: { entry: DeliveryNoteListEntry }) {
  const reason = summarisePendingReason(entry);
  const visual = deliveryNoteStatusVisual(entry.status);
  return (
    <Link
      href={`/pedidos/albaranes/${entry.id}`}
      className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 transition hover:border-zinc-300 hover:shadow-sm"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${visual.dotClass}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-black text-zinc-900">
          {entry.supplierName || 'Proveedor sin nombre'}
        </p>
        <p className="truncate text-[11.5px] text-zinc-600">
          {reason}
          {entry.relatedOrderId ? (
            <>
              {' '}
              · Pedido <span className="font-mono">{entry.relatedOrderId.slice(0, 6)}…</span>
            </>
          ) : (
            ' · Sin pedido'
          )}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
    </Link>
  );
}

// ─── RECENT ROW (compacto, alta densidad) ────────────────────────────────────
function RecentNoteRow({
  entry,
  confirming,
  deleting,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  entry: DeliveryNoteListEntry;
  confirming: boolean;
  deleting: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const visual = deliveryNoteStatusVisual(entry.status);
  const dateLine = formatNoteDate(entry);

  if (confirming) {
    return (
      <div className="flex items-center gap-2 bg-red-50 px-3 py-2.5">
        <Trash2 className="h-4 w-4 shrink-0 text-red-700" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-red-900">
          ¿Eliminar albarán de {entry.supplierName || 'proveedor'}?
        </p>
        <button
          type="button"
          onClick={onCancelDelete}
          disabled={deleting}
          className="h-8 rounded-full bg-white px-3 text-[11.5px] font-bold text-zinc-700 ring-1 ring-zinc-200 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmDelete}
          disabled={deleting}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-red-600 px-3 text-[11.5px] font-black text-white shadow-sm disabled:opacity-60"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          )}
          Eliminar
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-white pl-3 pr-1 py-2 transition hover:bg-zinc-50">
      <span className={`h-2 w-2 shrink-0 rounded-full ${visual.dotClass}`} aria-hidden />

      <Link
        href={`/pedidos/albaranes/${entry.id}`}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-black leading-tight text-zinc-900">
            {entry.supplierName || 'Proveedor sin nombre'}
          </p>
          <p className="truncate text-[10.5px] leading-tight text-zinc-500">
            {dateLine}
            {entry.deliveryNoteNumber ? (
              <>
                {' '}
                · <span className="font-mono">#{entry.deliveryNoteNumber}</span>
              </>
            ) : null}
            {entry.relatedOrderId ? (
              <>
                {' '}
                · Pedido{' '}
                <span className="font-mono">{entry.relatedOrderId.slice(0, 6)}…</span>
              </>
            ) : null}
          </p>
        </div>

        {entry.hasOpenIncidents ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-black text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {entry.openIncidentCount}
          </span>
        ) : null}

        <span
          className={[
            'shrink-0 rounded-full px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide',
            visual.chipClass,
          ].join(' ')}
        >
          {DELIVERY_NOTE_STATUS_LABEL[entry.status]}
        </span>

        <span className="w-[64px] shrink-0 text-right text-[12px] font-black tabular-nums text-zinc-900">
          {formatEuro(entry.totalAmount)}
        </span>
      </Link>

      <button
        type="button"
        onClick={onAskDelete}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
        aria-label="Eliminar albarán"
        title="Eliminar albarán"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
      <Link
        href={`/pedidos/albaranes/${entry.id}`}
        className="flex h-8 w-6 shrink-0 items-center justify-center text-zinc-300"
        aria-label="Abrir"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D32F2F]/10 text-[#D32F2F]">
        <ScanLine className="h-6 w-6" aria-hidden />
      </div>
      <p className="mt-3 text-[14px] font-black text-zinc-900">No hay albaranes con este criterio</p>
      <p className="mt-1 text-[12px] text-zinc-500">
        Cuando escanees o subas uno aparecerá aquí ordenado por fecha.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-2xl bg-[#D32F2F] px-4 text-[13px] font-black text-white shadow-md"
      >
        <ScanLine className="h-4 w-4" aria-hidden /> Escanear ahora
      </button>
    </div>
  );
}

// ─── MINI KPIs ───────────────────────────────────────────────────────────────
function MiniKpiGrid({
  stats,
}: {
  stats: ReturnType<typeof computeDeliveryNotesMonthlyStats>;
}) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-zinc-500">
          Resumen del mes
        </p>
        <p className="text-[10.5px] font-mono tabular-nums text-zinc-400">
          {stats.monthKey}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi
          icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
          label="Albaranes"
          value={String(stats.countMonth)}
          tone="zinc"
        />
        <Kpi
          icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
          label="Con incidencias"
          value={String(stats.countMonthWithIncidents)}
          tone={stats.countMonthWithIncidents > 0 ? 'amber' : 'zinc'}
        />
        <Kpi
          icon={<Euro className="h-3.5 w-3.5" aria-hidden />}
          label="Importe recibido"
          value={`${stats.totalAmountMonth.toFixed(0)} €`}
          tone="zinc"
        />
        <Kpi
          icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden />}
          label="Subidas precio"
          value="—"
          tone="zinc"
          hint="Próximamente"
        />
      </div>
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'zinc' | 'amber';
  hint?: string;
}) {
  const toneClasses =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-900 ring-amber-200'
      : 'bg-zinc-50 text-zinc-800 ring-zinc-200';
  return (
    <div className={`rounded-2xl px-2.5 py-2 ring-1 ${toneClasses}`}>
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-80">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 text-[16px] font-black tabular-nums leading-tight">{value}</p>
      {hint ? <p className="text-[9.5px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

// ─── FILTERS SHEET ───────────────────────────────────────────────────────────
function FiltersSheet({
  open,
  onClose,
  status,
  setStatus,
  supplierQ,
  setSupplierQ,
  onlyIncidents,
  setOnlyIncidents,
  onlyLinked,
  setOnlyLinked,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onReset,
  activeCount,
}: {
  open: boolean;
  onClose: () => void;
  status: DeliveryNoteStatus | 'all';
  setStatus: (v: DeliveryNoteStatus | 'all') => void;
  supplierQ: string;
  setSupplierQ: (v: string) => void;
  onlyIncidents: 'all' | 'yes' | 'no';
  setOnlyIncidents: (v: 'all' | 'yes' | 'no') => void;
  onlyLinked: 'all' | 'yes' | 'no';
  setOnlyLinked: (v: 'all' | 'yes' | 'no') => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  onReset: () => void;
  activeCount: number;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[16px] font-black text-zinc-900">Filtros</h3>
            <p className="text-[12px] text-zinc-500">Acota la lista de albaranes</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Estado">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DeliveryNoteStatus | 'all')}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'Todos los estados' : DELIVERY_NOTE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Proveedor">
            <input
              value={supplierQ}
              onChange={(e) => setSupplierQ(e.target.value)}
              placeholder="Nombre del proveedor"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
            />
          </Field>

          <Field label="Incidencias">
            <SegmentedControl
              value={onlyIncidents}
              onChange={setOnlyIncidents}
              options={[
                { value: 'all', label: 'Todas' },
                { value: 'yes', label: 'Con incidencias' },
                { value: 'no', label: 'Sin incidencias' },
              ]}
            />
          </Field>

          <Field label="Pedido relacionado">
            <SegmentedControl
              value={onlyLinked}
              onChange={setOnlyLinked}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'yes', label: 'Vinculados' },
                { value: 'no', label: 'Sin pedido' },
              ]}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Desde">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none"
              />
            </Field>
            <Field label="Hasta">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none"
              />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={activeCount === 0}
            className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-[13px] font-bold text-zinc-700 disabled:opacity-50"
          >
            Restablecer
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-[#D32F2F] px-4 py-2.5 text-[13px] font-black text-white shadow-md"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function SegmentedControl<V extends string>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (v: V) => void;
  options: Array<{ value: V; label: string }>;
}) {
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={[
              'rounded-lg px-2 py-1.5 text-[12px] font-bold transition',
              active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
