'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  ClipboardList,
  Flame,
  ImageIcon,
  Layers,
  Loader2,
  Plus,
  Refrigerator,
  Save,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { RecipeAllergenRow } from '@/lib/appcc-allergens-supabase';
import { presenceLabel } from '@/lib/appcc-allergens-supabase';
import type { EscandalloLine, EscandalloRecipe } from '@/lib/escandallos-supabase';
import type {
  EscandalloTechnicalSheet,
  EscandalloTechnicalSheetStep,
  EscandalloTechnicalSheetUpdate,
  TechnicalSheetStepDraft,
} from '@/lib/escandallos-technical-sheet-supabase';

function stepDraftKey() {
  return `s-${Math.random().toString(36).slice(2, 11)}`;
}

type StepDraft = TechnicalSheetStepDraft & { key: string };

function stepsToDrafts(rows: EscandalloTechnicalSheetStep[]): StepDraft[] {
  return rows.map((s) => ({
    key: s.id,
    titulo: s.titulo ?? '',
    descripcion: s.descripcion ?? '',
  }));
}

function emptyStep(): StepDraft {
  return { key: stepDraftKey(), titulo: '', descripcion: '' };
}

type Props = {
  recipe: EscandalloRecipe;
  lines: EscandalloLine[];
  sheet: EscandalloTechnicalSheet | null;
  steps: EscandalloTechnicalSheetStep[];
  recipeAllergens: RecipeAllergenRow[];
  loading: boolean;
  saving: boolean;
  onCreate: () => Promise<void>;
  onSave: (patch: EscandalloTechnicalSheetUpdate, stepDrafts: TechnicalSheetStepDraft[]) => Promise<void>;
};

function Block({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        'rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-5',
        className ?? '',
      ].join(' ')}
    >
      <div className="mb-3 flex items-center gap-2 border-b border-zinc-100 pb-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#D32F2F]/10 text-[#B91C1C] ring-1 ring-[#D32F2F]/15">
          <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden />
        </span>
        <h3 className="text-sm font-black uppercase tracking-wide text-zinc-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export default function RecipeTechnicalSheetPanel({
  recipe,
  lines,
  sheet,
  steps,
  recipeAllergens,
  loading,
  saving,
  onCreate,
  onSave,
}: Props) {
  const [creating, setCreating] = useState(false);

  const [categoria, setCategoria] = useState('');
  const [codigoInterno, setCodigoInterno] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [activa, setActiva] = useState(true);
  const [rendimientoTotal, setRendimientoTotal] = useState('');
  const [numeroRaciones, setNumeroRaciones] = useState('');
  const [gramajePorRacion, setGramajePorRacion] = useState('');
  const [tPrep, setTPrep] = useState('');
  const [tCocc, setTCocc] = useState('');
  const [tReposo, setTReposo] = useState('');
  const [tempServicio, setTempServicio] = useState('');
  const [emplDesc, setEmplDesc] = useState('');
  const [emplDeco, setEmplDeco] = useState('');
  const [emplMenaje, setEmplMenaje] = useState('');
  const [emplFoto, setEmplFoto] = useState('');
  const [tipoCons, setTipoCons] = useState('');
  const [tempCons, setTempCons] = useState('');
  const [vidaUtil, setVidaUtil] = useState('');
  const [regeneracion, setRegeneracion] = useState('');
  const [alergManual, setAlergManual] = useState('');
  const [notasChef, setNotasChef] = useState('');
  const [puntosCrit, setPuntosCrit] = useState('');
  const [errores, setErrores] = useState('');
  const [reco, setReco] = useState('');
  const [stepDrafts, setStepDrafts] = useState<StepDraft[]>([emptyStep()]);

  useEffect(() => {
    if (!sheet) {
      setCategoria('');
      setCodigoInterno('');
      setFotoUrl('');
      setActiva(true);
      setRendimientoTotal('');
      setNumeroRaciones('');
      setGramajePorRacion('');
      setTPrep('');
      setTCocc('');
      setTReposo('');
      setTempServicio('');
      setEmplDesc('');
      setEmplDeco('');
      setEmplMenaje('');
      setEmplFoto('');
      setTipoCons('');
      setTempCons('');
      setVidaUtil('');
      setRegeneracion('');
      setAlergManual('');
      setNotasChef('');
      setPuntosCrit('');
      setErrores('');
      setReco('');
      setStepDrafts([emptyStep()]);
      return;
    }
    setCategoria(sheet.categoria);
    setCodigoInterno(sheet.codigoInterno);
    setFotoUrl(sheet.fotoUrl ?? '');
    setActiva(sheet.activa);
    setRendimientoTotal(sheet.rendimientoTotal);
    setNumeroRaciones(sheet.numeroRaciones != null ? String(sheet.numeroRaciones) : '');
    setGramajePorRacion(sheet.gramajePorRacionG != null ? String(sheet.gramajePorRacionG) : '');
    setTPrep(sheet.tiempoPreparacionMin != null ? String(sheet.tiempoPreparacionMin) : '');
    setTCocc(sheet.tiempoCoccionMin != null ? String(sheet.tiempoCoccionMin) : '');
    setTReposo(sheet.tiempoReposoMin != null ? String(sheet.tiempoReposoMin) : '');
    setTempServicio(sheet.temperaturaServicio);
    setEmplDesc(sheet.emplatadoDescripcion);
    setEmplDeco(sheet.emplatadoDecoracion);
    setEmplMenaje(sheet.emplatadoMenaje);
    setEmplFoto(sheet.emplatadoFotoUrl ?? '');
    setTipoCons(sheet.tipoConservacion);
    setTempCons(sheet.temperaturaConservacion);
    setVidaUtil(sheet.vidaUtil);
    setRegeneracion(sheet.regeneracion);
    setAlergManual(sheet.alergenosManual.join('\n'));
    setNotasChef(sheet.notasChef);
    setPuntosCrit(sheet.puntosCriticos);
    setErrores(sheet.erroresComunes);
    setReco(sheet.recomendaciones);
    setStepDrafts(steps.length > 0 ? stepsToDrafts(steps) : [emptyStep()]);
  }, [sheet?.id, sheet, steps]);

  const allergensVisible = useMemo(
    () => recipeAllergens.filter((a) => a.status !== 'excluded'),
    [recipeAllergens],
  );

  const parseOptInt = (raw: string): number | null => {
    const t = raw.trim();
    if (t === '') return null;
    const n = Math.round(Number(t.replace(',', '.')));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const parseOptDecimal = (raw: string): number | null => {
    const t = raw.trim().replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : null;
  };

  const handleSave = async () => {
    if (!sheet) return;
    const manualList = alergManual
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const drafts: TechnicalSheetStepDraft[] = stepDrafts
      .filter((d) => d.titulo.trim() !== '' || d.descripcion.trim() !== '')
      .map((d) => ({ titulo: d.titulo, descripcion: d.descripcion }));
    await onSave(
      {
        categoria: categoria.trim(),
        codigoInterno: codigoInterno.trim(),
        fotoUrl: fotoUrl.trim() === '' ? null : fotoUrl.trim(),
        activa,
        rendimientoTotal: rendimientoTotal.trim(),
        numeroRaciones: parseOptDecimal(numeroRaciones),
        gramajePorRacionG: parseOptDecimal(gramajePorRacion),
        tiempoPreparacionMin: parseOptInt(tPrep),
        tiempoCoccionMin: parseOptInt(tCocc),
        tiempoReposoMin: parseOptInt(tReposo),
        temperaturaServicio: tempServicio.trim(),
        emplatadoDescripcion: emplDesc.trim(),
        emplatadoDecoracion: emplDeco.trim(),
        emplatadoMenaje: emplMenaje.trim(),
        emplatadoFotoUrl: emplFoto.trim() === '' ? null : emplFoto.trim(),
        tipoConservacion: tipoCons.trim(),
        temperaturaConservacion: tempCons.trim(),
        vidaUtil: vidaUtil.trim(),
        regeneracion: regeneracion.trim(),
        alergenosManual: manualList,
        notasChef: notasChef.trim(),
        puntosCriticos: puntosCrit.trim(),
        erroresComunes: errores.trim(),
        recomendaciones: reco.trim(),
      },
      drafts,
    );
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= stepDrafts.length) return;
    setStepDrafts((prev) => {
      const next = [...prev];
      const t = next[idx]!;
      next[idx] = next[j]!;
      next[j] = t;
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/80 py-12 text-sm font-semibold text-zinc-600">
        <Loader2 className="h-5 w-5 animate-spin text-[#D32F2F]" aria-hidden />
        Cargando ficha técnica…
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="rounded-2xl border border-dashed border-[#D32F2F]/35 bg-gradient-to-br from-red-50/60 to-white p-6 text-center ring-1 ring-red-100/70">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#D32F2F] text-white shadow-lg shadow-red-900/20">
          <ClipboardList className="h-7 w-7" strokeWidth={2} aria-hidden />
        </div>
        <p className="mt-4 text-base font-bold text-zinc-900">Sin ficha técnica</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
          Crea una ficha profesional para elaboración, emplatado, conservación y formación del equipo. Los
          ingredientes se leen del escandallo; los alérgenos se enlazan con la carta APPCC.
        </p>
        <button
          type="button"
          disabled={creating}
          onClick={async () => {
            setCreating(true);
            try {
              await onCreate();
            } finally {
              setCreating(false);
            }
          }}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-red-900/25 transition hover:bg-[#B91C1C] disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          Crear ficha técnica
        </button>
      </div>
    );
  }

  const inputCls =
    'mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D32F2F]/40 focus:ring-2 focus:ring-[#D32F2F]/15';
  const labelCls = 'text-[10px] font-bold uppercase tracking-wide text-zinc-500';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-gradient-to-r from-zinc-50 to-white p-4 ring-1 ring-zinc-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#B91C1C]">Ficha técnica</p>
          <p className="mt-0.5 truncate text-lg font-black text-zinc-900">{recipe.name}</p>
          <p className="mt-1 text-xs text-zinc-600">
            Estado:{' '}
            <span className={activa ? 'font-bold text-emerald-700' : 'font-bold text-zinc-500'}>
              {activa ? 'Activa' : 'Inactiva'}
            </span>
            {codigoInterno.trim() ? (
              <>
                {' '}
                · Código <span className="font-mono tabular-nums">{codigoInterno.trim()}</span>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-black text-white shadow-md transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Guardar ficha
        </button>
      </div>

      <Block title="Datos generales" icon={Layers}>
        <p className="text-xs text-zinc-600">
          <span className="font-semibold text-zinc-800">Nombre (receta):</span> {recipe.name}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Categoría</label>
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls} placeholder="Ej. Entrante frío" />
          </div>
          <div>
            <label className={labelCls}>Código interno</label>
            <input
              value={codigoInterno}
              onChange={(e) => setCodigoInterno(e.target.value)}
              className={`${inputCls} font-mono tabular-nums`}
              placeholder="Opcional"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelCls}>Foto principal (URL)</label>
          <input value={fotoUrl} onChange={(e) => setFotoUrl(e.target.value)} className={inputCls} placeholder="https://…" />
          {fotoUrl.trim() ? (
            <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoUrl.trim()} alt="" className="max-h-48 w-full object-cover" />
            </div>
          ) : null}
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
          <span className="text-sm font-semibold text-zinc-800">Ficha activa (visible para operativa)</span>
        </label>
      </Block>

      <Block title="Producción" icon={Flame}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Rendimiento total (texto libre)</label>
            <input
              value={rendimientoTotal}
              onChange={(e) => setRendimientoTotal(e.target.value)}
              className={inputCls}
              placeholder="Ej. 1 bandeja 60×40, 2,5 kg mezcla…"
            />
          </div>
          <div>
            <label className={labelCls}>N.º raciones (opcional)</label>
            <input value={numeroRaciones} onChange={(e) => setNumeroRaciones(e.target.value)} className={inputCls} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Gramaje por ración (g)</label>
            <input value={gramajePorRacion} onChange={(e) => setGramajePorRacion(e.target.value)} className={inputCls} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Preparación (min)</label>
            <input value={tPrep} onChange={(e) => setTPrep(e.target.value)} className={inputCls} inputMode="numeric" />
          </div>
          <div>
            <label className={labelCls}>Cocción (min)</label>
            <input value={tCocc} onChange={(e) => setTCocc(e.target.value)} className={inputCls} inputMode="numeric" />
          </div>
          <div>
            <label className={labelCls}>Reposo (min)</label>
            <input value={tReposo} onChange={(e) => setTReposo(e.target.value)} className={inputCls} inputMode="numeric" />
          </div>
          <div>
            <label className={labelCls}>Temperatura de servicio</label>
            <input value={tempServicio} onChange={(e) => setTempServicio(e.target.value)} className={inputCls} placeholder="Ej. 62 °C / frío 4 °C" />
          </div>
        </div>
      </Block>

      <Block title="Ingredientes (escandallo)" icon={ClipboardList}>
        <p className="text-xs leading-relaxed text-zinc-600">
          Lista de la receta: mismas cantidades que en la pestaña <strong>Ingredientes</strong>. Si cambias el escandallo, esta sección se actualiza al guardar la receta.
        </p>
        {lines.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">Aún no hay líneas en el escandallo.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-zinc-50/50">
            {lines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="font-semibold text-zinc-900">{line.label}</span>
                <span className="tabular-nums text-zinc-700">
                  {line.qty} {line.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Elaboración paso a paso" icon={Sparkles}>
        <div className="space-y-3">
          {stepDrafts.map((st, idx) => (
            <div key={st.key} className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 ring-1 ring-zinc-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-900 text-xs font-black text-white">
                  {idx + 1}
                </span>
                <input
                  value={st.titulo}
                  onChange={(e) =>
                    setStepDrafts((prev) => prev.map((p, i) => (i === idx ? { ...p, titulo: e.target.value } : p)))
                  }
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
                  placeholder={`Título opcional · Paso ${idx + 1}`}
                />
                <div className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveStep(idx, -1)}
                    disabled={idx === 0}
                    className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-700 disabled:opacity-40"
                    aria-label="Subir paso"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(idx, 1)}
                    disabled={idx >= stepDrafts.length - 1}
                    className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-700 disabled:opacity-40"
                    aria-label="Bajar paso"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (stepDrafts.length <= 1) {
                        setStepDrafts([emptyStep()]);
                        return;
                      }
                      setStepDrafts((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="rounded-lg border border-red-100 bg-red-50 p-2 text-red-800"
                    aria-label="Eliminar paso"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <textarea
                value={st.descripcion}
                onChange={(e) =>
                  setStepDrafts((prev) => prev.map((p, i) => (i === idx ? { ...p, descripcion: e.target.value } : p)))
                }
                rows={3}
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/15"
                placeholder="Describe la operación, tiempos, puntos de control…"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setStepDrafts((prev) => [...prev, emptyStep()])}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Añadir paso
        </button>
      </Block>

      <Block title="Emplatado / presentación" icon={Camera}>
        <div className="grid gap-3">
          <div>
            <label className={labelCls}>Montaje / descripción</label>
            <textarea value={emplDesc} onChange={(e) => setEmplDesc(e.target.value)} rows={3} className={inputCls} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Decoración</label>
              <input value={emplDeco} onChange={(e) => setEmplDeco(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Soporte / menaje</label>
              <input value={emplMenaje} onChange={(e) => setEmplMenaje(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Foto emplatado (URL)</label>
            <input value={emplFoto} onChange={(e) => setEmplFoto(e.target.value)} className={inputCls} placeholder="https://…" />
            {emplFoto.trim() ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={emplFoto.trim()} alt="" className="max-h-48 w-full object-cover" />
              </div>
            ) : null}
          </div>
        </div>
      </Block>

      <Block title="Conservación" icon={Refrigerator}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Tipo</label>
            <input value={tipoCons} onChange={(e) => setTipoCons(e.target.value)} className={inputCls} placeholder="Ej. refrigerado / congelado / MAP" />
          </div>
          <div>
            <label className={labelCls}>Temperatura</label>
            <input value={tempCons} onChange={(e) => setTempCons(e.target.value)} className={inputCls} placeholder="Ej. 0–4 °C" />
          </div>
          <div>
            <label className={labelCls}>Vida útil estimada</label>
            <input value={vidaUtil} onChange={(e) => setVidaUtil(e.target.value)} className={inputCls} placeholder="Ej. 48 h" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Regeneración (opcional)</label>
            <textarea value={regeneracion} onChange={(e) => setRegeneracion(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>
      </Block>

      <Block title="Alérgenos" icon={AlertTriangle}>
        <p className="text-xs text-zinc-600">
          Calculados desde ingredientes y revisión APPCC. Para matriz completa y exclusiones, abre la carta de alérgenos.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {allergensVisible.length === 0 ? (
            <span className="text-sm text-zinc-400">Sin alérgenos activos registrados para este plato.</span>
          ) : (
            allergensVisible.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-950 ring-1 ring-amber-200/80"
              >
                <span aria-hidden>{a.allergen?.icon ?? '•'}</span>
                {a.allergen?.name ?? 'Alérgeno'}
                <span className="text-[10px] font-normal text-amber-800/90">({presenceLabel(a.presence_type)})</span>
              </span>
            ))
          )}
        </div>
        {!recipe.isSubRecipe ? (
          <Link
            href={`/appcc/carta-alergenos/${recipe.id}`}
            className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#D32F2F] hover:underline"
          >
            <ImageIcon className="h-4 w-4" aria-hidden />
            Abrir carta de alérgenos del plato
          </Link>
        ) : null}
        <div className="mt-4">
          <label className={labelCls}>Confirmación manual / notas (una línea por ítem)</label>
          <textarea
            value={alergManual}
            onChange={(e) => setAlergManual(e.target.value)}
            rows={3}
            className={inputCls}
            placeholder="Ej. trazas frutos secos en salsa (revisado en sala)"
          />
        </div>
      </Block>

      <Block title="Observaciones internas" icon={ClipboardList}>
        <div className="grid gap-3">
          <div>
            <label className={labelCls}>Notas del chef</label>
            <textarea value={notasChef} onChange={(e) => setNotasChef(e.target.value)} rows={2} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Puntos críticos (CCP / merma)</label>
            <textarea value={puntosCrit} onChange={(e) => setPuntosCrit(e.target.value)} rows={2} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Errores comunes</label>
            <textarea value={errores} onChange={(e) => setErrores(e.target.value)} rows={2} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Recomendaciones internas</label>
            <textarea value={reco} onChange={(e) => setReco(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>
      </Block>

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] py-4 text-base font-black text-white shadow-lg shadow-red-900/20 transition hover:bg-[#B91C1C] disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Save className="h-5 w-5" aria-hidden />}
        Guardar ficha técnica
      </button>
    </div>
  );
}
