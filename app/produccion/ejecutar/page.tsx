'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type ChefProductionTemplate,
  collectAllBlockItemsInTemplate,
  fetchChefProductionTemplates,
  getOrCreateChefProductionSession,
  formatProductionMigrationError,
} from '@/lib/chef-ops-supabase';

async function countProductsInTemplate(supabase: SupabaseClient, templateId: string): Promise<number> {
  const items = await collectAllBlockItemsInTemplate(supabase, templateId);
  return items.length;
}

export default function ProduccionEjecutarPage() {
  const router = useRouter();
  const { localId, profileReady, userId } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [templates, setTemplates] = useState<ChefProductionTemplate[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodLabel, setPeriodLabel] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setTemplates([]);
      setCounts({});
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const ts = await fetchChefProductionTemplates(supabase, localId);
      setTemplates(ts);
      const entries = await Promise.all(
        ts.map(async (t) => [t.id, await countProductsInTemplate(supabase, t.id)] as const),
      );
      setCounts(Object.fromEntries(entries));
    } catch (e) {
      setBanner(formatProductionMigrationError(e));
      setTemplates([]);
      setCounts({});
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const openSession = async (templateId: string) => {
    if (!localId || !supabaseOk) return;
    setStartingId(templateId);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const session = await getOrCreateChefProductionSession(
        supabase,
        localId,
        templateId,
        workDate,
        periodLabel.trim() || null,
        userId,
      );
      router.push(`/produccion/correr/${session.id}`);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo abrir la lista.');
    } finally {
      setStartingId(null);
    }
  };

  const sorted = useMemo(
    () => [...templates].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [templates],
  );

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero
        eyebrow="Producción"
        title="Lista del día"
        description="Elige plantilla y fecha. La app detecta el bloque de día que toca y muestra solo los productos de ese bloque."
        slim
      />

      <Link
        href="/produccion"
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-700 hover:text-[#D32F2F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </Link>

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-center text-sm text-zinc-500">Conecta Supabase y un local.</p>
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <div className="mx-auto w-full max-w-sm rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50 to-white px-4 py-3 text-center shadow-sm ring-1 ring-zinc-100">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Día de trabajo</p>
              <p className="mt-1.5 text-[11px] font-medium leading-snug text-zinc-600">
                Se usa para saber qué bloque de la plantilla aplica (lunes, fin de semana, diario…).
              </p>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                aria-label="Día de trabajo"
                className="mx-auto mt-3 box-border h-11 w-full max-w-[17.5rem] rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:ring-2 focus:ring-[#D32F2F]/15"
              />
            </div>
            <label className="mt-4 block">
              <span className="text-[11px] font-bold uppercase text-zinc-500">Etiqueta (opcional)</span>
              <input
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                placeholder="Ej. Turno mañana, Semana 16…"
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/15"
              />
            </label>
          </section>

          <div className="space-y-2">
            {sorted.length === 0 ? (
              <p className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center text-sm text-zinc-600">
                No hay plantillas. Crea una en{' '}
                <Link href="/produccion/planes" className="font-bold text-[#D32F2F] underline">
                  Plantillas
                </Link>
                .
              </p>
            ) : (
              sorted.map((t) => {
                const n = counts[t.id] ?? 0;
                const disabled = n === 0 || startingId !== null;
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/90 bg-gradient-to-r from-white to-zinc-50/90 px-4 py-3.5 shadow-sm ring-1 ring-zinc-100"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-zinc-900">{t.name}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#B91C1C]">
                        {n} producto{n === 1 ? '' : 's'} en bloques
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void openSession(t.id)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#D32F2F] px-3 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm disabled:opacity-45"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {startingId === t.id ? '…' : 'Abrir'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
