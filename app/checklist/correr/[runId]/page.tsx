'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  CHECKLIST_CONTEXT_LABEL,
  type ChefChecklist,
  type ChefChecklistItem,
  type ChefChecklistRun,
  type ChefChecklistRunItem,
  type ChefChecklistSection,
  completeChefChecklistRun,
  fetchChefChecklist,
  fetchChefChecklistItems,
  fetchChefChecklistRunItems,
  fetchChefChecklistRunRow,
  fetchChefChecklistSections,
  setChefChecklistRunItemDone,
} from '@/lib/chef-ops-supabase';
import { appConfirm } from '@/lib/app-dialog-bridge';

export default function ChecklistCorrerPage() {
  const params = useParams();
  const runId = typeof params.runId === 'string' ? params.runId : '';
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<ChefChecklistRun | null>(null);
  const [checklist, setChecklist] = useState<ChefChecklist | null>(null);
  const [sections, setSections] = useState<ChefChecklistSection[]>([]);
  const [items, setItems] = useState<ChefChecklistItem[]>([]);
  const [runItems, setRunItems] = useState<ChefChecklistRunItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!runId || !localId || !supabaseOk) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const r = await fetchChefChecklistRunRow(supabase, runId);
      if (!r || r.localId !== localId) {
        setRun(null);
        setChecklist(null);
        setBanner('Ejecución no encontrada o de otro local.');
        return;
      }
      setRun(r);
      const cl = await fetchChefChecklist(supabase, localId, r.checklistId);
      setChecklist(cl);
      const [sec, its, ris] = await Promise.all([
        fetchChefChecklistSections(supabase, r.checklistId),
        fetchChefChecklistItems(supabase, r.checklistId),
        fetchChefChecklistRunItems(supabase, runId),
      ]);
      setSections(sec);
      setItems(its);
      setRunItems(ris);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al cargar.');
    } finally {
      setLoading(false);
    }
  }, [runId, localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const byItemId = useMemo(() => {
    const m = new Map<string, ChefChecklistRunItem>();
    for (const ri of runItems) m.set(ri.itemId, ri);
    return m;
  }, [runItems]);

  const orderedBlocks = useMemo(() => {
    const loose = items.filter((i) => !i.sectionId).sort((a, b) => a.sortOrder - b.sortOrder);
    const secBlocks = sections
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        kind: 'section' as const,
        section: s,
        items: items.filter((i) => i.sectionId === s.id).sort((a, b) => a.sortOrder - b.sortOrder),
      }));
    return { loose, secBlocks };
  }, [items, sections]);

  const total = runItems.length;
  const doneCount = runItems.filter((x) => x.isDone).length;
  const allDone = total > 0 && doneCount === total;
  const isClosed = Boolean(run?.completedAt);

  const toggle = async (runItem: ChefChecklistRunItem) => {
    if (!supabaseOk || isClosed) return;
    setBusyId(runItem.id);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await setChefChecklistRunItemDone(supabase, runItem.id, !runItem.isDone);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo actualizar.');
    } finally {
      setBusyId(null);
    }
  };

  const closeRun = async () => {
    if (!supabaseOk || !run || isClosed) return;
    if (!allDone) {
      if (!(await appConfirm('Aún faltan ítems. ¿Registrar cierre igualmente?'))) return;
    }
    setClosing(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await completeChefChecklistRun(supabase, run.id);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo cerrar.');
    } finally {
      setClosing(false);
    }
  };

  const Row = ({ ri, label }: { ri: ChefChecklistRunItem; label: string }) => {
    const loadingRow = busyId === ri.id;
    return (
      <button
        type="button"
        disabled={isClosed || loadingRow}
        onClick={() => void toggle(ri)}
        className={[
          'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition',
          ri.isDone
            ? 'border-emerald-200/90 bg-emerald-50/60 ring-1 ring-emerald-100'
            : 'border-zinc-200/90 bg-white ring-1 ring-zinc-50 hover:border-[#D32F2F]/25',
          isClosed ? 'opacity-80' : '',
        ].join(' ')}
      >
        {ri.isDone ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2.2} />
        ) : (
          <Circle className="mt-0.5 h-5 w-5 shrink-0 text-zinc-300" strokeWidth={2.2} />
        )}
        <span className={`text-sm font-semibold leading-snug ${ri.isDone ? 'text-emerald-950 line-through decoration-emerald-700/50' : 'text-zinc-900'}`}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero eyebrow="Check list" title={checklist?.title ?? 'Ejecución'} compact />

      <Link
        href="/checklist/ejecutar"
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-700 hover:text-[#D32F2F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Otras listas
      </Link>

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-center text-sm text-zinc-500">Sesión o Supabase no disponibles.</p>
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : !run ? null : (
        <>
          <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Contexto</p>
                <p className="text-sm font-bold text-zinc-900">
                  {checklist ? CHECKLIST_CONTEXT_LABEL[checklist.context] : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Día</p>
                <p className="text-sm font-bold text-zinc-900">{run.runDate}</p>
              </div>
            </div>
            {run.shiftLabel ? (
              <p className="mt-2 text-xs font-semibold text-zinc-600">
                Turno: <span className="text-zinc-900">{run.shiftLabel}</span>
              </p>
            ) : null}
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[11px] font-bold uppercase text-zinc-500">
                <span>Progreso</span>
                <span>
                  {doneCount}/{total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-[#D32F2F] transition-all duration-300"
                  style={{ width: `${total ? Math.round((doneCount / total) * 100) : 0}%` }}
                />
              </div>
            </div>
            {isClosed ? (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-900 ring-1 ring-emerald-100">
                Cerrada · {new Date(run.completedAt!).toLocaleString()}
              </p>
            ) : (
              <button
                type="button"
                disabled={closing}
                onClick={() => void closeRun()}
                className="mt-4 w-full rounded-xl border border-zinc-300 bg-zinc-900 py-3 text-sm font-black uppercase tracking-wide text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {closing ? 'Guardando…' : 'Registrar cierre'}
              </button>
            )}
          </div>

          <div className="space-y-4">
            {orderedBlocks.loose.length > 0 ? (
              <div className="space-y-2">
                {orderedBlocks.loose.map((it) => {
                  const ri = byItemId.get(it.id);
                  if (!ri) return null;
                  return <Row key={it.id} ri={ri} label={it.label} />;
                })}
              </div>
            ) : null}

            {orderedBlocks.secBlocks.map(({ section, items: secItems }) => (
              <div key={section.id} className="space-y-2">
                <p className="px-1 text-[11px] font-black uppercase tracking-wider text-zinc-500">{section.title}</p>
                <div className="space-y-2">
                  {secItems.map((it) => {
                    const ri = byItemId.get(it.id);
                    if (!ri) return null;
                    return <Row key={it.id} ri={ri} label={it.label} />;
                  })}
                </div>
              </div>
            ))}
          </div>

          <Link href="/checklist/historial" className="block text-center text-xs font-bold text-[#D32F2F] underline">
            Ver historial
          </Link>
        </>
      )}
    </div>
  );
}
