'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import {
  deleteManualLecturaByManual,
  deleteManualProcedimiento,
  fetchManualLecturaIds,
  fetchManualProcedimientos,
  insertManualProcedimiento,
  MANUAL_CATEGORIA_LABEL,
  MANUAL_CATEGORIA_ORDER,
  type ManualCategoriaKey,
  type ManualProcedimientoRow,
  pasosFromTextarea,
  textareaFromPasos,
  updateManualProcedimiento,
  upsertManualLectura,
} from '@/lib/personal-normas-manual-supabase';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { safeCreateNotification } from '@/services/notifications';

function emptyForm(): {
  titulo: string;
  categoria: ManualCategoriaKey;
  pasosText: string;
  puntos_criticos: string;
  errores_comunes: string;
  activo: boolean;
} {
  return {
    titulo: '',
    categoria: 'cocina',
    pasosText: '',
    puntos_criticos: '',
    errores_comunes: '',
    activo: true,
  };
}

export default function ManualOperacionesPage() {
  const { localId, userId, profileReady, profileRole } = useAuth();
  const isAdmin = profileRole === 'admin';
  const supabaseOk = isSupabaseEnabled() && !!getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [rows, setRows] = useState<ManualProcedimientoRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [openDetail, setOpenDetail] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!localId || !supabaseOk || !userId) {
      setRows([]);
      setReadIds(new Set());
      return;
    }
    const supabase = getSupabaseClient()!;
    const [list, ids] = await Promise.all([
      fetchManualProcedimientos(supabase, localId),
      fetchManualLecturaIds(supabase, localId, userId),
    ]);
    setRows(list);
    setReadIds(ids);
  }, [localId, supabaseOk, userId]);

  useEffect(() => {
    if (!profileReady) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setBanner(null);
      try {
        await reload();
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Error al cargar el manual.';
          if (msg.toLowerCase().includes('manual_procedimientos') || msg.includes('does not exist')) {
            setBanner('Ejecuta en Supabase el SQL supabase-personal-normas-manual.sql.');
          } else setBanner(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [profileReady, reload]);

  const toggleDetail = (id: string) => {
    setOpenDetail((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onMarkRead = async (manualId: string) => {
    if (!localId || !userId || !supabaseOk) return;
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await upsertManualLectura(supabase, localId, userId, manualId);
      setReadIds((prev) => new Set(prev).add(manualId));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo registrar la lectura.');
    }
  };

  const notifyManual = async (manualId: string) => {
    if (!localId || !supabaseOk || !userId) return;
    const supabase = getSupabaseClient()!;
    await safeCreateNotification(supabase, {
      localId,
      type: 'manual_operaciones_actualizado',
      title: 'Manual de operaciones',
      message: '🔔 Se ha actualizado el manual de operaciones. Revisión necesaria.',
      createdBy: userId,
      entityType: 'manual_procedimiento',
      entityId: manualId,
    });
  };

  const openNew = () => {
    setEditingId('__new__');
    setForm(emptyForm());
  };

  const openEdit = (row: ManualProcedimientoRow) => {
    setEditingId(row.id);
    setForm({
      titulo: row.titulo,
      categoria: row.categoria,
      pasosText: textareaFromPasos(row.pasos),
      puntos_criticos: row.puntos_criticos,
      errores_comunes: row.errores_comunes,
      activo: row.activo,
    });
  };

  const closeForm = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const onSave = async () => {
    if (!localId || !supabaseOk || !userId || !isAdmin) return;
    if (!form.titulo.trim()) {
      setBanner('El título es obligatorio.');
      return;
    }
    const pasos = pasosFromTextarea(form.pasosText);
    if (pasos.length === 0) {
      setBanner('Añade al menos un paso (una línea por paso).');
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      if (editingId === '__new__') {
        const row = await insertManualProcedimiento(supabase, localId, {
          titulo: form.titulo,
          categoria: form.categoria,
          pasos,
          puntos_criticos: form.puntos_criticos,
          errores_comunes: form.errores_comunes,
          activo: form.activo,
        });
        await notifyManual(row.id);
        closeForm();
        await reload();
      } else if (editingId) {
        await updateManualProcedimiento(supabase, localId, editingId, {
          titulo: form.titulo,
          categoria: form.categoria,
          pasos,
          puntos_criticos: form.puntos_criticos,
          errores_comunes: form.errores_comunes,
          activo: form.activo,
        });
        await deleteManualLecturaByManual(supabase, localId, editingId);
        await notifyManual(editingId);
        closeForm();
        await reload();
      }
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!localId || !supabaseOk || !isAdmin) return;
    if (!(await appConfirm('¿Eliminar este procedimiento?'))) return;
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await deleteManualProcedimiento(supabase, localId, id);
      if (editingId === id) closeForm();
      await reload();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar.');
    }
  };

  const byCategory = MANUAL_CATEGORIA_ORDER.map((cat) => ({
    cat,
    label: MANUAL_CATEGORIA_LABEL[cat],
    items: rows.filter((r) => r.categoria === cat && r.activo),
  }));

  if (!profileReady || loading) {
    return <p className="text-sm text-zinc-500">Cargando…</p>;
  }

  return (
    <div className="space-y-5 pb-10">
      <MermasStyleHero eyebrow="Procedimientos" title="Manual de operaciones" compact />
      <Link href="/personal/manual-normas" className="text-sm font-bold text-zinc-600 hover:text-[#D32F2F]">
        ← Manual y normas
      </Link>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-sm text-zinc-600">Necesitas sesión con local.</p>
      ) : (
        <>
          {byCategory.map(({ cat, label, items }) =>
            items.length === 0 ? null : (
              <section key={cat} className="space-y-2">
                <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#B91C1C]">{label}</h2>
                <ul className="space-y-2">
                  {items.map((proc) => {
                    const read = readIds.has(proc.id);
                    const open = openDetail.has(proc.id);
                    return (
                      <li
                        key={proc.id}
                        className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm ring-1 ring-zinc-100"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-extrabold text-zinc-900">{proc.titulo}</p>
                            {!read ? (
                              <p className="mt-1 text-[10px] font-black uppercase text-amber-800">Revisión pendiente</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDetail(proc.id)}
                            className="shrink-0 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100"
                          >
                            {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </button>
                        </div>
                        {open ? (
                          <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
                            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-zinc-800">
                              {proc.pasos.map((p, i) => (
                                <li key={i} className="leading-snug">
                                  {p.text}
                                </li>
                              ))}
                            </ol>
                            {proc.puntos_criticos.trim() ? (
                              <div className="rounded-xl bg-red-50/90 px-3 py-2 ring-1 ring-red-100">
                                <p className="text-[10px] font-extrabold uppercase text-red-900">Puntos críticos</p>
                                <p className="mt-1 text-xs leading-relaxed text-red-950">{proc.puntos_criticos}</p>
                              </div>
                            ) : null}
                            {proc.errores_comunes.trim() ? (
                              <div className="rounded-xl bg-amber-50/90 px-3 py-2 ring-1 ring-amber-100">
                                <p className="text-[10px] font-extrabold uppercase text-amber-900">Errores frecuentes</p>
                                <p className="mt-1 text-xs leading-relaxed text-amber-950">{proc.errores_comunes}</p>
                              </div>
                            ) : null}
                            <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-100">
                              <input
                                type="checkbox"
                                checked={read}
                                disabled={read}
                                onChange={() => void onMarkRead(proc.id)}
                                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-[#D32F2F] focus:ring-[#D32F2F]"
                              />
                              <span className="text-xs font-semibold text-zinc-800">
                                He leído y comprendo este procedimiento
                                {read ? <span className="ml-1 font-normal text-emerald-700">(registrado)</span> : null}
                              </span>
                            </label>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ),
          )}

          {rows.every((r) => !r.activo) ? (
            <p className="text-sm text-zinc-600">No hay procedimientos activos publicados.</p>
          ) : null}

          {isAdmin ? (
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 ring-1 ring-zinc-100">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-extrabold uppercase tracking-wide text-zinc-600">Administración</h2>
                {editingId ? (
                  <button type="button" onClick={closeForm} className="text-xs font-bold text-zinc-600 underline">
                    Cerrar formulario
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openNew}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#D32F2F] px-3 py-2 text-xs font-extrabold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Nuevo procedimiento
                  </button>
                )}
              </div>

              {editingId ? (
                <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                  <label className="block text-[11px] font-bold text-zinc-600">
                    Título
                    <input
                      value={form.titulo}
                      onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-[11px] font-bold text-zinc-600">
                    Categoría
                    <select
                      value={form.categoria}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, categoria: e.target.value as ManualCategoriaKey }))
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                    >
                      {MANUAL_CATEGORIA_ORDER.map((c) => (
                        <option key={c} value={c}>
                          {MANUAL_CATEGORIA_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[11px] font-bold text-zinc-600">
                    Pasos (una línea por paso)
                    <textarea
                      value={form.pasosText}
                      onChange={(e) => setForm((f) => ({ ...f, pasosText: e.target.value }))}
                      rows={5}
                      className="mt-1 w-full resize-none rounded-lg border border-zinc-200 px-2 py-2 font-mono text-sm"
                    />
                  </label>
                  <label className="block text-[11px] font-bold text-zinc-600">
                    Puntos críticos
                    <input
                      value={form.puntos_criticos}
                      onChange={(e) => setForm((f) => ({ ...f, puntos_criticos: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-[11px] font-bold text-zinc-600">
                    Errores comunes
                    <input
                      value={form.errores_comunes}
                      onChange={(e) => setForm((f) => ({ ...f, errores_comunes: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-800">
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                      className="h-4 w-4 rounded border-zinc-300 text-[#D32F2F]"
                    />
                    Activo
                  </label>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onSave()}
                    className="h-11 w-full rounded-xl bg-zinc-900 text-sm font-extrabold text-white disabled:opacity-50"
                  >
                    {saving ? 'Guardando…' : editingId === '__new__' ? 'Crear y notificar' : 'Guardar, invalidar lecturas y notificar'}
                  </button>
                </div>
              ) : null}

              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {rows.map((n) => (
                  <li
                    key={n.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-zinc-200"
                  >
                    <span className="min-w-0 truncate font-semibold text-zinc-800">
                      <span className="text-[10px] font-bold text-zinc-500">{MANUAL_CATEGORIA_LABEL[n.categoria]} · </span>
                      {n.titulo}
                      {!n.activo ? (
                        <span className="ml-2 text-[10px] font-bold uppercase text-zinc-400">inactivo</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(n)}
                        className="rounded-lg px-2 py-1 text-[11px] font-bold text-[#D32F2F] hover:bg-red-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(n.id)}
                        className="rounded-lg p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
