'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  type AppccFryerRow,
  deleteAppccFryer,
  fetchAppccFryers,
  insertAppccFryer,
} from '@/lib/appcc-aceite-supabase';
import { APPCC_ZONE_LABEL, type AppccZone } from '@/lib/appcc-supabase';

export default function AppccAceiteEquiposPage() {
  const { localId, profileReady } = useAuth();
  const [fryers, setFryers] = useState<AppccFryerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [zone, setZone] = useState<AppccZone>('cocina');
  const [sortOrder, setSortOrder] = useState('0');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!localId || !supabaseOk) {
      setFryers([]);
      if (!silent) setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    if (!silent) setLoading(true);
    if (!silent) setBanner(null);
    try {
      const f = await fetchAppccFryers(supabase, localId, false);
      setFryers(f);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar.';
      if (!silent) {
        if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
          setBanner('Ejecuta supabase-appcc-aceite-schema.sql en Supabase antes de usar esta pantalla.');
        } else {
          setBanner(msg);
        }
        setFryers([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [localId, supabaseOk]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === 'visible') void loadRef.current({ silent: true });
    };
    document.addEventListener('visibilitychange', ping);
    window.addEventListener('focus', ping);
    const onPageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) ping();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', ping);
      window.removeEventListener('focus', ping);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const channel = supabase
      .channel(`appcc-fryers-${localId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appcc_fryers',
          filter: `local_id=eq.${localId}`,
        },
        () => void load({ silent: true }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [localId, supabaseOk, load]);

  const addFryer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const trimmed = name.trim();
    if (!trimmed) {
      setBanner('Indica un nombre para la freidora.');
      return;
    }
    const so = Number(sortOrder);
    const order = Number.isFinite(so) ? Math.trunc(so) : 0;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      setBanner('No se pudo identificar al usuario.');
      return;
    }
    setSubmitting(true);
    setBanner(null);
    try {
      const created = await insertAppccFryer(supabase, {
        localId,
        name: trimmed,
        zone,
        sortOrder: order,
        notes: notes.trim(),
        userId: user.id,
      });
      setName('');
      setSortOrder('0');
      setNotes('');
      setFryers((prev) =>
        [...prev, created].sort((a, b) =>
          a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name),
        ),
      );
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'No se pudo crear la freidora.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeFryer = async (f: AppccFryerRow) => {
    if (
      !window.confirm(
        `¿Eliminar «${f.name}»? Se borrará también el historial de aceite de esta freidora. No se puede deshacer.`,
      )
    ) {
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !localId) return;
    setDeletingId(f.id);
    setBanner(null);
    try {
      await deleteAppccFryer(supabase, f.id);
      setFryers((prev) => prev.filter((x) => x.id !== f.id));
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'No se pudo eliminar la freidora.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/appcc/aceite"
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
        >
          <ChevronLeft className="h-4 w-4" />
          Aceite
        </Link>
        <span className="text-zinc-300">·</span>
        <Link
          href="/appcc/aceite/registro"
          className="text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
        >
          Registro
        </Link>
      </div>

      <MermasStyleHero
        eyebrow="APPCC"
        title="Freidoras"
        description="Alta de freidoras por zona (cocina o barra). Solo las activas aparecen en el registro diario."
      />

      {!isSupabaseEnabled() || !getSupabaseClient() ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Configura las variables de entorno de Supabase para usar este módulo.
        </div>
      ) : null}

      {!localId && profileReady ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Tu usuario necesita perfil con local en Supabase.
        </div>
      ) : null}

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      <form
        onSubmit={addFryer}
        className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 ring-1 ring-zinc-100"
      >
        <p className="text-sm font-bold text-zinc-900">Añadir freidora</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-bold uppercase text-zinc-500">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              placeholder="Ej. Freidora cocina 1"
              disabled={!localId || submitting}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-zinc-500">Zona</label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value as AppccZone)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              disabled={!localId || submitting}
            >
              <option value="cocina">{APPCC_ZONE_LABEL.cocina}</option>
              <option value="barra">{APPCC_ZONE_LABEL.barra}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-zinc-500">Orden</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              disabled={!localId || submitting}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-bold uppercase text-zinc-500">Notas (opc.)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              placeholder="Referencia interna"
              disabled={!localId || submitting}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={!localId || submitting || !profileReady}
          className="h-11 w-full rounded-xl bg-[#D32F2F] text-sm font-bold uppercase tracking-wide text-white disabled:opacity-50 sm:w-auto sm:px-6"
        >
          {submitting ? 'Guardando…' : 'Dar de alta'}
        </button>
      </form>

      <div>
        <p className="mb-3 text-sm font-bold text-zinc-900">Freidoras del local</p>
        {loading ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : fryers.length === 0 ? (
          <p className="text-sm text-zinc-600">Aún no hay freidoras. Usa el formulario de arriba.</p>
        ) : (
          <ul className="space-y-2">
            {fryers.map((f) => (
              <li
                key={f.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-zinc-900">
                    {f.name}
                    {!f.is_active ? (
                      <span className="ml-2 text-xs font-semibold text-amber-700">(inactiva)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-500">{APPCC_ZONE_LABEL[f.zone]}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeFryer(f)}
                  disabled={!localId || deletingId === f.id}
                  className="h-9 shrink-0 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#b71c1c] disabled:opacity-50"
                >
                  {deletingId === f.id ? '…' : 'Eliminar'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
