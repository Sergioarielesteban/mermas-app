'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import React, { useState } from 'react';
import type { AllergenKey } from '@/lib/servicio/types';
import { SERVICIO_ALERGEN_OPTIONS, SERVICIO_CATEGORIA_OPTIONS } from '@/lib/servicio/constants';
import type { PlatoUpsertPayload, ServicioIngredienteInput, ServicioPasoInput } from '@/lib/servicio/servicio-supabase';
import { savePlatoFull, uploadServicioImage } from '@/lib/servicio/servicio-supabase';

type Props = {
  supabase: SupabaseClient;
  localId: string;
  platoId?: string;
  initial: {
    plato: PlatoUpsertPayload;
    pasos: ServicioPasoInput[];
    ingredientes: ServicioIngredienteInput[];
    alergenos: AllergenKey[];
  };
  onSaved: (platoId: string) => void;
  onCancel: () => void;
};

export default function PlatoEditorForm({ supabase, localId, platoId, initial, onSaved, onCancel }: Props) {
  const [plato, setPlato] = useState<PlatoUpsertPayload>(initial.plato);
  const [pasos, setPasos] = useState<ServicioPasoInput[]>(
    initial.pasos.length ? initial.pasos : [{ orden: 0, titulo: '', descripcion_corta: '', imagen_url: null, tiempo_min: null }],
  );
  const [ingredientes, setIngredientes] = useState<ServicioIngredienteInput[]>(
    initial.ingredientes.length
      ? initial.ingredientes
      : [{ orden: 0, nombre_ingrediente: '', cantidad: 0, unidad: '', observaciones: null }],
  );
  const [alergenos, setAlergenos] = useState<AllergenKey[]>(initial.alergenos);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleAlergeno = (k: AllergenKey) => {
    setAlergenos((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const n = [...arr];
    [n[i], n[j]] = [n[j], n[i]];
    return n.map((row, idx) => ({ ...row, orden: idx } as T));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!plato.nombre.trim()) {
      setErr('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    const res = await savePlatoFull({
      supabase,
      localId,
      platoId,
      plato,
      pasos: pasos
        .map((p, i) => ({ ...p, orden: i }))
        .filter((p) => p.titulo.trim() || p.descripcion_corta.trim()),
      ingredientes: ingredientes
        .map((g, i) => ({ ...g, orden: i }))
        .filter((g) => g.nombre_ingrediente.trim()),
      alergenos,
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    onSaved(res.platoId);
  };

  const uploadMain = async (file: File | null) => {
    if (!file) return;
    const r = await uploadServicioImage(supabase, localId, 'platos', file);
    if (r.ok) setPlato((p) => ({ ...p, imagen_url: r.publicUrl }));
    else setErr(r.message);
  };

  const uploadPaso = async (idx: number, file: File | null) => {
    if (!file) return;
    const r = await uploadServicioImage(supabase, localId, 'pasos', file);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setPasos((prev) => prev.map((p, i) => (i === idx ? { ...p, imagen_url: r.publicUrl } : p)));
  };

  const btn =
    'h-11 rounded-xl px-3 text-sm font-extrabold transition active:scale-[0.99] disabled:opacity-50';
  const field = 'mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-900';

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-5 px-3 pb-28 pt-2 sm:px-4">
      {err ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 ring-1 ring-rose-200">{err}</p>
      ) : null}

      <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-600">Datos generales</p>
        <label className="mt-3 block text-[11px] font-bold text-zinc-500">Nombre</label>
        <input className={field} value={plato.nombre} onChange={(e) => setPlato({ ...plato, nombre: e.target.value })} />
        <label className="mt-2 block text-[11px] font-bold text-zinc-500">Categoría</label>
        <select
          className={field}
          value={plato.categoria}
          onChange={(e) => setPlato({ ...plato, categoria: e.target.value as PlatoUpsertPayload['categoria'] })}
        >
          {SERVICIO_CATEGORIA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="mt-2 block text-[11px] font-bold text-zinc-500">Descripción corta</label>
        <input
          className={field}
          value={plato.descripcion_corta}
          onChange={(e) => setPlato({ ...plato, descripcion_corta: e.target.value })}
        />
        <label className="mt-2 block text-[11px] font-bold text-zinc-500">Slug (opcional)</label>
        <input
          className={field}
          value={plato.slug ?? ''}
          onChange={(e) => setPlato({ ...plato, slug: e.target.value.trim() || null })}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-bold text-zinc-800">
            <input type="checkbox" checked={plato.activo} onChange={(e) => setPlato({ ...plato, activo: e.target.checked })} />
            Activo
          </label>
        </div>
        <p className="mt-3 text-[11px] font-bold text-zinc-500">Imagen principal</p>
        {plato.imagen_url ? (
          <p className="mt-1 truncate text-xs text-zinc-600">{plato.imagen_url}</p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">Sin imagen</p>
        )}
        <input type="file" accept="image/*" className="mt-2 block w-full text-sm" onChange={(e) => void uploadMain(e.target.files?.[0] ?? null)} />
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-600">Datos operativos</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-bold text-zinc-500">Raciones base</label>
            <input
              type="number"
              min={0}
              className={field}
              value={plato.raciones_base}
              onChange={(e) => setPlato({ ...plato, raciones_base: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-zinc-500">Tiempo total (min)</label>
            <input
              type="number"
              min={0}
              className={field}
              value={plato.tiempo_total_min}
              onChange={(e) => setPlato({ ...plato, tiempo_total_min: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-bold text-zinc-500">Dificultad</label>
            <select
              className={field}
              value={plato.dificultad}
              onChange={(e) => setPlato({ ...plato, dificultad: e.target.value as PlatoUpsertPayload['dificultad'] })}
            >
              <option value="facil">Fácil</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-zinc-500">Coste / ración (€)</label>
            <input
              type="number"
              step="0.0001"
              className={field}
              value={plato.coste_por_racion ?? ''}
              onChange={(e) =>
                setPlato({ ...plato, coste_por_racion: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-zinc-500">PVP (€)</label>
            <input
              type="number"
              step="0.01"
              className={field}
              value={plato.pvp_sugerido ?? ''}
              onChange={(e) =>
                setPlato({ ...plato, pvp_sugerido: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-bold text-zinc-500">Margen bruto (€ o ratio libre)</label>
            <input
              type="number"
              step="0.0001"
              className={field}
              value={plato.margen_bruto ?? ''}
              onChange={(e) =>
                setPlato({ ...plato, margen_bruto: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-600">Pasos</p>
        <div className="mt-3 space-y-3">
          {pasos.map((p, idx) => (
            <div key={idx} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
              <div className="flex gap-2">
                <button type="button" className={btn + ' border border-zinc-200 bg-white'} onClick={() => setPasos((a) => move(a, idx, -1))}>
                  ↑
                </button>
                <button type="button" className={btn + ' border border-zinc-200 bg-white'} onClick={() => setPasos((a) => move(a, idx, 1))}>
                  ↓
                </button>
                <button
                  type="button"
                  className={btn + ' ml-auto border border-zinc-200 bg-white text-rose-800'}
                  onClick={() => setPasos((a) => a.filter((_, i) => i !== idx))}
                >
                  Quitar
                </button>
              </div>
              <label className="mt-2 block text-[11px] font-bold text-zinc-500">Título</label>
              <input
                className={field}
                value={p.titulo}
                onChange={(e) => setPasos((arr) => arr.map((x, i) => (i === idx ? { ...x, titulo: e.target.value } : x)))}
              />
              <label className="mt-2 block text-[11px] font-bold text-zinc-500">Texto corto</label>
              <input
                className={field}
                value={p.descripcion_corta}
                onChange={(e) =>
                  setPasos((arr) => arr.map((x, i) => (i === idx ? { ...x, descripcion_corta: e.target.value } : x)))
                }
              />
              <label className="mt-2 block text-[11px] font-bold text-zinc-500">Tiempo (min, opcional)</label>
              <input
                type="number"
                min={0}
                className={field}
                value={p.tiempo_min ?? ''}
                onChange={(e) =>
                  setPasos((arr) =>
                    arr.map((x, i) =>
                      i === idx ? { ...x, tiempo_min: e.target.value === '' ? null : Number(e.target.value) } : x,
                    ),
                  )
                }
              />
              <input type="file" accept="image/*" className="mt-2 block w-full text-sm" onChange={(e) => void uploadPaso(idx, e.target.files?.[0] ?? null)} />
            </div>
          ))}
        </div>
        <button
          type="button"
          className={btn + ' mt-3 w-full border border-zinc-300 bg-zinc-100 text-zinc-900'}
          onClick={() => setPasos((a) => [...a, { orden: a.length, titulo: '', descripcion_corta: '', imagen_url: null, tiempo_min: null }])}
        >
          + Añadir paso
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-600">Ingredientes</p>
        <div className="mt-3 space-y-3">
          {ingredientes.map((g, idx) => (
            <div key={idx} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
              <div className="flex gap-2">
                <button type="button" className={btn + ' border border-zinc-200 bg-white'} onClick={() => setIngredientes((a) => move(a, idx, -1))}>
                  ↑
                </button>
                <button type="button" className={btn + ' border border-zinc-200 bg-white'} onClick={() => setIngredientes((a) => move(a, idx, 1))}>
                  ↓
                </button>
                <button
                  type="button"
                  className={btn + ' ml-auto border border-zinc-200 bg-white text-rose-800'}
                  onClick={() => setIngredientes((a) => a.filter((_, i) => i !== idx))}
                >
                  Quitar
                </button>
              </div>
              <label className="mt-2 block text-[11px] font-bold text-zinc-500">Nombre</label>
              <input
                className={field}
                value={g.nombre_ingrediente}
                onChange={(e) =>
                  setIngredientes((arr) => arr.map((x, i) => (i === idx ? { ...x, nombre_ingrediente: e.target.value } : x)))
                }
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-zinc-500">Cantidad</label>
                  <input
                    type="number"
                    step="0.0001"
                    className={field}
                    value={g.cantidad}
                    onChange={(e) =>
                      setIngredientes((arr) =>
                        arr.map((x, i) => (i === idx ? { ...x, cantidad: Number(e.target.value) || 0 } : x)),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-500">Unidad</label>
                  <input
                    className={field}
                    value={g.unidad}
                    onChange={(e) =>
                      setIngredientes((arr) => arr.map((x, i) => (i === idx ? { ...x, unidad: e.target.value } : x)))
                    }
                  />
                </div>
              </div>
              <label className="mt-2 block text-[11px] font-bold text-zinc-500">Observación</label>
              <input
                className={field}
                value={g.observaciones ?? ''}
                onChange={(e) =>
                  setIngredientes((arr) =>
                    arr.map((x, i) => (i === idx ? { ...x, observaciones: e.target.value.trim() || null } : x)),
                  )
                }
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className={btn + ' mt-3 w-full border border-zinc-300 bg-zinc-100 text-zinc-900'}
          onClick={() =>
            setIngredientes((a) => [
              ...a,
              { orden: a.length, nombre_ingrediente: '', cantidad: 0, unidad: '', observaciones: null },
            ])
          }
        >
          + Añadir ingrediente
        </button>
      </div>

      <div className="rounded-2xl bg-amber-50/90 p-4 ring-1 ring-amber-100">
        <p className="text-xs font-extrabold uppercase tracking-wide text-amber-950/80">Alérgenos</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SERVICIO_ALERGEN_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => toggleAlergeno(o.key)}
              className={[
                'rounded-full px-3 py-2 text-xs font-extrabold ring-1',
                alergenos.includes(o.key)
                  ? 'bg-[#D32F2F] text-white ring-[#B91C1C]'
                  : 'bg-white text-zinc-700 ring-zinc-200',
              ].join(' ')}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={btn + ' flex-1 border border-zinc-300 bg-white text-zinc-800'}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className={btn + ' flex-[2] bg-[#D32F2F] text-white shadow-md'}
        >
          {saving ? 'Guardando…' : 'Guardar plato'}
        </button>
      </div>
    </form>
  );
}
