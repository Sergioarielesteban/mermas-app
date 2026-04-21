'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { PersonalSectionNav } from '@/components/staff/StaffPersonalShell';
import { useAuth } from '@/components/AuthProvider';
import {
  deleteEmpresaNorma,
  deleteNormasLecturaByNorma,
  fetchEmpresaNormas,
  fetchNormasLecturaNormaIds,
  insertEmpresaNorma,
  type EmpresaNormaRow,
  updateEmpresaNorma,
  upsertNormaLectura,
} from '@/lib/personal-normas-manual-supabase';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { safeCreateNotification } from '@/services/notifications';

function emptyForm(): { titulo: string; categoria: string; descripcion: string; activa: boolean } {
  return { titulo: '', categoria: '', descripcion: '', activa: true };
}

export default function EmpresaNormasPage() {
  const { localId, userId, profileReady, profileRole } = useAuth();
  const isAdmin = profileRole === 'admin';
  const supabaseOk = isSupabaseEnabled() && !!getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [normas, setNormas] = useState<EmpresaNormaRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!localId || !supabaseOk || !userId) {
      setNormas([]);
      setReadIds(new Set());
      return;
    }
    const supabase = getSupabaseClient()!;
    const [list, ids] = await Promise.all([
      fetchEmpresaNormas(supabase, localId),
      fetchNormasLecturaNormaIds(supabase, localId, userId),
    ]);
    setNormas(list);
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
          const msg = e instanceof Error ? e.message : 'Error al cargar normas.';
          if (msg.toLowerCase().includes('empresa_normas') || msg.includes('does not exist')) {
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

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onMarkRead = async (normaId: string) => {
    if (!localId || !userId || !supabaseOk) return;
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await upsertNormaLectura(supabase, localId, userId, normaId);
      setReadIds((prev) => new Set(prev).add(normaId));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo registrar la lectura.');
    }
  };

  const openNew = () => {
    setEditingId('__new__');
    setForm(emptyForm());
  };

  const openEdit = (row: EmpresaNormaRow) => {
    setEditingId(row.id);
    setForm({
      titulo: row.titulo,
      categoria: row.categoria,
      descripcion: row.descripcion,
      activa: row.activa,
    });
  };

  const closeForm = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const notifyNormasUpdate = async (normaId: string) => {
    if (!localId || !supabaseOk || !userId) return;
    const supabase = getSupabaseClient()!;
    await safeCreateNotification(supabase, {
      localId,
      type: 'normas_empresa_actualizada',
      title: 'Normas de empresa',
      message: '🔔 Nueva actualización de normas de empresa. Revísalas.',
      createdBy: userId,
      entityType: 'empresa_norma',
      entityId: normaId,
    });
  };

  const onSave = async () => {
    if (!localId || !supabaseOk || !userId || !isAdmin) return;
    if (!form.titulo.trim() || !form.categoria.trim()) {
      setBanner('Título y categoría son obligatorios.');
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      if (editingId === '__new__') {
        const row = await insertEmpresaNorma(supabase, localId, form);
        await notifyNormasUpdate(row.id);
        closeForm();
        await reload();
      } else if (editingId) {
        await updateEmpresaNorma(supabase, localId, editingId, form);
        await deleteNormasLecturaByNorma(supabase, localId, editingId);
        await notifyNormasUpdate(editingId);
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
    if (!(await appConfirm('¿Eliminar esta norma?'))) return;
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      await deleteEmpresaNorma(supabase, localId, id);
      if (editingId === id) closeForm();
      await reload();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar.');
    }
  };

  const activas = normas.filter((n) => n.activa);

  if (!profileReady || loading) {
    return <p className="text-sm text-zinc-500">Cargando…</p>;
  }

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero eyebrow="Lectura obligatoria" title="Normas de la empresa" compact />
      <PersonalSectionNav />
      <Link href="/personal/manual-normas" className="text-sm font-bold text-zinc-600 hover:text-[#D32F2F]">
        ← Manual y normas
      </Link>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      {!localId || !supabaseOk ? (
        <p className="text-sm text-zinc-600">Necesitas sesión con local para ver las normas.</p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Normas activas</h2>
            {activas.length === 0 ? (
              <p className="text-sm text-zinc-600">Aún no hay normas publicadas.</p>
            ) : (
              activas.map((n) => {
                const read = readIds.has(n.id);
                const open = expanded.has(n.id);
                return (
                  <article
                    key={n.id}
                    className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm ring-1 ring-zinc-100"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-zinc-900">{n.titulo}</p>
                        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          {n.categoria}
                          {!read ? (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">
                              Pendiente de lectura
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleExpand(n.id)}
                        className="shrink-0 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100"
                        aria-expanded={open}
                      >
                        {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </button>
                    </div>
                    {open ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{n.descripcion}</p>
                    ) : (
                      <p className="mt-2 line-clamp-2 text-xs text-zinc-600">{n.descripcion}</p>
                    )}
                    <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-100">
                      <input
                        type="checkbox"
                        checked={read}
                        disabled={read}
                        onChange={() => void onMarkRead(n.id)}
                        className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-[#D32F2F] focus:ring-[#D32F2F]"
                      />
                      <span className="text-xs font-semibold text-zinc-800">
                        He leído y acepto esta norma
                        {read ? <span className="ml-1 font-normal text-emerald-700">(registrado)</span> : null}
                      </span>
                    </label>
                  </article>
                );
              })
            )}
          </section>

          {isAdmin ? (
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 ring-1 ring-zinc-100">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-extrabold uppercase tracking-wide text-zinc-600">Administración</h2>
                {editingId ? (
                  <button
                    type="button"
                    onClick={closeForm}
                    className="text-xs font-bold text-zinc-600 underline"
                  >
                    Cerrar formulario
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openNew}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#D32F2F] px-3 py-2 text-xs font-extrabold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Nueva norma
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
                    <input
                      value={form.categoria}
                      onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                      placeholder="ej. higiene, horarios…"
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-[11px] font-bold text-zinc-600">
                    Descripción
                    <textarea
                      value={form.descripcion}
                      onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                      rows={4}
                      className="mt-1 w-full resize-none rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-800">
                    <input
                      type="checkbox"
                      checked={form.activa}
                      onChange={(e) => setForm((f) => ({ ...f, activa: e.target.checked }))}
                      className="h-4 w-4 rounded border-zinc-300 text-[#D32F2F]"
                    />
                    Activa (visible para el equipo)
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

              <ul className="space-y-1.5">
                {normas.map((n) => (
                  <li
                    key={n.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-zinc-200"
                  >
                    <span className="min-w-0 truncate font-semibold text-zinc-800">
                      {n.titulo}
                      {!n.activa ? (
                        <span className="ml-2 text-[10px] font-bold uppercase text-zinc-400">inactiva</span>
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
