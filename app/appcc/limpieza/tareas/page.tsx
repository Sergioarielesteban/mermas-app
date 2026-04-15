'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { requestDeleteSecurityPin } from '@/lib/delete-security';
import {
  type AppccCleaningCategoryRow,
  type AppccCleaningTaskRow,
  deleteCleaningCategory,
  deleteCleaningTask,
  fetchCleaningCategories,
  fetchCleaningTasks,
  insertCleaningCategory,
  insertCleaningTask,
  updateCleaningTask,
} from '@/lib/appcc-limpieza-supabase';

export default function AppccLimpiezaTareasPage() {
  const { localId, profileReady } = useAuth();
  const [categories, setCategories] = useState<AppccCleaningCategoryRow[]>([]);
  const [tasks, setTasks] = useState<AppccCleaningTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [newCatName, setNewCatName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});
  const [newTaskInstr, setNewTaskInstr] = useState<Record<string, string>>({});

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!localId || !supabaseOk) {
        setCategories([]);
        setTasks([]);
        if (!silent) setLoading(false);
        return;
      }
      const supabase = getSupabaseClient()!;
      if (!silent) {
        setLoading(true);
        setBanner(null);
      }
      try {
        const [c, t] = await Promise.all([
          fetchCleaningCategories(supabase, localId),
          fetchCleaningTasks(supabase, localId, false),
        ]);
        setCategories(c);
        setTasks(t);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al cargar.';
        if (!silent) {
          if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
            setBanner('Ejecuta supabase-appcc-limpieza-schema.sql en Supabase.');
          } else {
            setBanner(msg);
          }
          setCategories([]);
          setTasks([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [localId, supabaseOk],
  );

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
    return () => document.removeEventListener('visibilitychange', ping);
  }, []);

  const tasksByCat = useMemo(() => {
    const m = new Map<string, AppccCleaningTaskRow[]>();
    for (const t of tasks) {
      const list = m.get(t.category_id) ?? [];
      list.push(t);
      m.set(t.category_id, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'es'));
    }
    return m;
  }, [tasks]);

  const handleAddCategory = async () => {
    if (!localId || !supabaseOk) return;
    const name = newCatName.trim();
    if (!name) {
      setBanner('Escribe el nombre de la categoría (ej. Maquinaria, Superficies).');
      return;
    }
    const supabase = getSupabaseClient()!;
    setBusy('cat');
    setBanner(null);
    try {
      const row = await insertCleaningCategory(supabase, localId, name);
      setCategories((prev) => [...prev, row].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es')));
      setNewCatName('');
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo crear.');
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteCategory = async (cat: AppccCleaningCategoryRow) => {
    if (!localId || !supabaseOk) return;
    const n = tasksByCat.get(cat.id)?.length ?? 0;
    if (!window.confirm(`¿Eliminar «${cat.name}»${n ? ` y sus ${n} tareas` : ''}?`)) return;
    if (!requestDeleteSecurityPin()) {
      setBanner('Clave de seguridad incorrecta.');
      return;
    }
    const supabase = getSupabaseClient()!;
    setBusy(cat.id);
    setBanner(null);
    try {
      await deleteCleaningCategory(supabase, localId, cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setTasks((prev) => prev.filter((t) => t.category_id !== cat.id));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setBusy(null);
    }
  };

  const handleAddTask = async (categoryId: string) => {
    if (!localId || !supabaseOk) return;
    const title = (newTaskTitle[categoryId] ?? '').trim();
    const instructions = (newTaskInstr[categoryId] ?? '').trim();
    if (!title) {
      setBanner('Cada tarea necesita un nombre (ej. Nev. 1 quesos, Cubo barra).');
      return;
    }
    const supabase = getSupabaseClient()!;
    setBusy(`task-${categoryId}`);
    setBanner(null);
    try {
      const row = await insertCleaningTask(supabase, localId, categoryId, { title, instructions });
      setTasks((prev) => [...prev, row]);
      setNewTaskTitle((p) => ({ ...p, [categoryId]: '' }));
      setNewTaskInstr((p) => ({ ...p, [categoryId]: '' }));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo añadir la tarea.');
    } finally {
      setBusy(null);
    }
  };

  const handleToggleTask = async (task: AppccCleaningTaskRow) => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    setBusy(task.id);
    try {
      await updateCleaningTask(supabase, localId, task.id, { is_active: !task.is_active });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_active: !t.is_active } : t)));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al actualizar.');
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteTask = async (task: AppccCleaningTaskRow) => {
    if (!localId || !supabaseOk) return;
    if (!window.confirm(`¿Eliminar la tarea «${task.title}» y su historial de marcas?`)) return;
    if (!requestDeleteSecurityPin()) {
      setBanner('Clave de seguridad incorrecta.');
      return;
    }
    const supabase = getSupabaseClient()!;
    setBusy(task.id);
    try {
      await deleteCleaningTask(supabase, localId, task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <MermasStyleHero
        eyebrow="APPCC"
        title="Categorías y tareas de limpieza"
        description="Agrupa por tipo (neveras, suelos, cubos…) y describe el método en cada punto."
        compact
      />
      <Link
        href="/appcc/limpieza"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
      >
        <ChevronLeft className="h-4 w-4" />
        Limpieza APPCC
      </Link>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{banner}</div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-3 ring-1 ring-zinc-100">
        <p className="text-[10px] font-bold uppercase text-zinc-500">Nueva categoría</p>
        <p className="mt-1 text-xs text-zinc-600">
          Ejemplos: Maquinaria, Superficies y suelos, Cubos de basura, Zonas de trabajo.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Nombre de la categoría"
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy !== null || !localId}
            onClick={() => void handleAddCategory()}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#D32F2F] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Crear
          </button>
        </div>
      </section>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : categories.length === 0 ? (
        <p className="rounded-xl bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
          Crea la primera categoría arriba.
        </p>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const list = tasksByCat.get(cat.id) ?? [];
            return (
              <section key={cat.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 ring-1 ring-zinc-100">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-bold text-zinc-900">{cat.name}</h2>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleDeleteCategory(cat)}
                    className="rounded-lg p-1.5 text-red-700 hover:bg-red-50"
                    aria-label="Eliminar categoría"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <ul className="mt-2 space-y-2">
                  {list.map((task) => (
                    <li
                      key={task.id}
                      className={[
                        'rounded-xl border border-zinc-200 bg-white px-2.5 py-2',
                        !task.is_active ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900">{task.title}</p>
                          {task.instructions.trim() ? (
                            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-zinc-600">
                              {task.instructions}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[10px] text-zinc-400">Sin instrucciones</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void handleToggleTask(task)}
                            className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[9px] font-bold uppercase text-zinc-700"
                          >
                            {task.is_active ? 'Ocultar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void handleDeleteTask(task)}
                            className="rounded-md p-1 text-red-700 hover:bg-red-50"
                            aria-label="Eliminar tarea"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-white/90 p-2">
                  <p className="text-[10px] font-bold uppercase text-zinc-500">Añadir tarea en {cat.name}</p>
                  <input
                    value={newTaskTitle[cat.id] ?? ''}
                    onChange={(e) => setNewTaskTitle((p) => ({ ...p, [cat.id]: e.target.value }))}
                    placeholder="Nombre (ej. Cong. 1 rep. fritos)"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  />
                  <textarea
                    value={newTaskInstr[cat.id] ?? ''}
                    onChange={(e) => setNewTaskInstr((p) => ({ ...p, [cat.id]: e.target.value }))}
                    placeholder="Cómo limpiar: pasos, productos, frecuencia…"
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleAddTask(cat.id)}
                    className="mt-2 w-full rounded-lg bg-zinc-900 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Guardar tarea
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!profileReady ? <p className="text-xs text-zinc-500">Cargando sesión…</p> : null}
    </div>
  );
}
