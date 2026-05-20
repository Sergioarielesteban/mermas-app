'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronDown,
  ClipboardList,
  Flame,
  ImageIcon,
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
  familyOptions: string[];
  loading: boolean;
  saving: boolean;
  onCreate: () => Promise<void>;
  onSave: (patch: EscandalloTechnicalSheetUpdate, stepDrafts: TechnicalSheetStepDraft[]) => Promise<void>;
};

function CompactAccordion({
  id,
  title,
  summary,
  icon: Icon,
  tone = 'neutral',
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  tone?: 'neutral' | 'red' | 'amber' | 'olive';
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'red'
      ? 'bg-[#D32F2F]/8 text-[#B91C1C] ring-[#D32F2F]/12'
      : tone === 'amber'
        ? 'bg-[#B8872A]/10 text-[#7A5518] ring-[#B8872A]/15'
        : tone === 'olive'
          ? 'bg-[#4A6B3A]/10 text-[#35502A] ring-[#4A6B3A]/15'
          : 'bg-[#F7F3EE] text-[#7E7468] ring-[rgba(10,9,8,0.06)]';

  return (
    <section className="overflow-hidden rounded-lg border border-[rgba(10,9,8,0.07)] bg-white ring-1 ring-[rgba(10,9,8,0.035)]">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex min-h-11 w-full items-center gap-2 px-2.5 py-2 text-left transition hover:bg-[#FAFAF9]"
      >
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-black uppercase tracking-wide text-[#0A0908]">{title}</span>
          <span className="block truncate text-[10px] font-medium text-[#7E7468]">{summary || 'Sin datos'}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#7E7468] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="border-t border-[rgba(10,9,8,0.06)] px-2.5 pb-2.5 pt-2">{children}</div> : null}
    </section>
  );
}

export default function RecipeTechnicalSheetPanel({
  recipe,
  sheet,
  steps,
  recipeAllergens,
  familyOptions,
  loading,
  saving,
  onCreate,
  onSave,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({});

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
    const match = t.match(/\d+(?:\.\d+)?/);
    const n = match ? Number(match[0]) : Number(t);
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

  const readImageFile = (file: File, onReady: (dataUrl: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onReady(reader.result);
    };
    reader.readAsDataURL(file);
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
    'h-8 w-full rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 text-[12px] font-semibold text-[#0A0908] outline-none focus:border-[#C4531F]/45 focus:ring-1 focus:ring-[#C4531F]/15';
  const textareaCls =
    'min-h-16 w-full resize-none rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] px-2 py-1.5 text-[12px] leading-snug text-[#0A0908] outline-none focus:border-[#C4531F]/45 focus:ring-1 focus:ring-[#C4531F]/15';
  const labelCls = 'text-[8px] font-black uppercase tracking-[0.11em] text-[#7E7468]';
  const metricCls = 'space-y-1';
  const summaryValue = (value: string, fallback = '—') => value.trim() || fallback;
  const totalTime = [tPrep, tCocc, tReposo].reduce((acc, n) => acc + (Number(n.replace(',', '.')) || 0), 0);
  const productionSummary = [
    numeroRaciones.trim() ? `${numeroRaciones.trim()} rac.` : recipe.yieldQty ? `${recipe.yieldQty} rac.` : '',
    gramajePorRacion.trim(),
    totalTime > 0 ? `${totalTime} min` : '',
  ].filter(Boolean).join(' · ');
  const conservationSummary = [
    summaryValue(tipoCons, 'Sin tipo'),
    tempCons.trim(),
    vidaUtil.trim(),
  ].filter(Boolean).join(' · ');
  const allergenSummary = allergensVisible.length
    ? allergensVisible.slice(0, 3).map((a) => a.allergen?.name ?? 'Alérgeno').join(' · ') + (allergensVisible.length > 3 ? ` · +${allergensVisible.length - 3}` : '')
    : 'Sin alérgenos activos';
  const platingSummary = [
    emplDesc.trim() ? 'Montaje' : '',
    emplFoto.trim() ? 'foto añadida' : '',
    emplMenaje.trim() ? emplMenaje.trim() : '',
  ].filter(Boolean).join(' · ');
  const observationsCount = [notasChef, puntosCrit, errores, reco].filter((x) => x.trim()).length;
  const toggleBlock = (id: string) => setOpenBlocks((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-1.5">
      <section className="rounded-lg border border-[rgba(10,9,8,0.07)] bg-white ring-1 ring-[rgba(10,9,8,0.035)]">
        <div className="grid gap-1.5 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-[#0A0908]">Familia de carta</p>
              <p className="text-[10px] font-medium text-[#7E7468]">Agrupa la receta en la analítica de escandallos.</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <input
              list="escandallo-editor-family-options"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className={`${inputCls} min-w-0 flex-1`}
              placeholder="Burgers, tapas, postres..."
              aria-label="Familia de carta"
            />
            <datalist id="escandallo-editor-family-options">
              {familyOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
        </div>
      </section>

      <CompactAccordion
        id="production"
        title="Producción"
        summary={productionSummary || rendimientoTotal || `${recipe.yieldQty} ${recipe.yieldLabel}`}
        icon={Flame}
        tone="red"
        open={Boolean(openBlocks.production)}
        onToggle={toggleBlock}
      >
          <div className="grid grid-cols-3 gap-1.5">
            <label className={metricCls}>
              <span className={labelCls}>Raciones</span>
              <input value={numeroRaciones} onChange={(e) => setNumeroRaciones(e.target.value)} className={inputCls} inputMode="decimal" placeholder={String(recipe.yieldQty)} />
            </label>
            <label className={metricCls}>
              <span className={labelCls}>Gramaje / unidad</span>
              <input value={gramajePorRacion} onChange={(e) => setGramajePorRacion(e.target.value)} className={inputCls} placeholder="180 g / unid" />
            </label>
            <label className={metricCls}>
              <span className={labelCls}>Total</span>
              <input value={totalTime > 0 ? String(totalTime) : ''} readOnly className={`${inputCls} bg-white text-[#7E7468]`} placeholder="min" />
            </label>
            <label className={metricCls}>
              <span className={labelCls}>Prep</span>
              <input value={tPrep} onChange={(e) => setTPrep(e.target.value)} className={inputCls} inputMode="numeric" placeholder="min" />
            </label>
            <label className={metricCls}>
              <span className={labelCls}>Cocción</span>
              <input value={tCocc} onChange={(e) => setTCocc(e.target.value)} className={inputCls} inputMode="numeric" placeholder="min" />
            </label>
            <label className={metricCls}>
              <span className={labelCls}>Reposo</span>
              <input value={tReposo} onChange={(e) => setTReposo(e.target.value)} className={inputCls} inputMode="numeric" placeholder="min" />
            </label>
            <label className={`${metricCls} col-span-3`}>
              <span className={labelCls}>Temperatura servicio</span>
              <input value={tempServicio} onChange={(e) => setTempServicio(e.target.value)} className={inputCls} placeholder="62 °C / frío 4 °C" />
            </label>
            <label className={`${metricCls} col-span-3`}>
              <span className={labelCls}>Rendimiento total</span>
              <input value={rendimientoTotal} onChange={(e) => setRendimientoTotal(e.target.value)} className={inputCls} placeholder="1 bandeja, 2,5 kg mezcla..." />
            </label>

            <div className="col-span-3 mt-1 space-y-1.5 border-t border-[rgba(10,9,8,0.06)] pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase text-[#7E7468]">Elaboración</span>
                <button type="button" onClick={() => setStepDrafts((prev) => [...prev, emptyStep()])} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[rgba(10,9,8,0.16)] px-2 py-1 text-[10px] font-bold text-[#0A0908]">
                  <Plus className="h-3 w-3" aria-hidden />
                  Paso
                </button>
              </div>
              {stepDrafts.map((st, idx) => (
                <div key={st.key} className="rounded-lg border border-[rgba(10,9,8,0.06)] bg-[#FAFAF9] p-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#0A0908] text-[10px] font-black text-white">{idx + 1}</span>
                    <input
                      value={st.titulo}
                      onChange={(e) => setStepDrafts((prev) => prev.map((p, i) => (i === idx ? { ...p, titulo: e.target.value } : p)))}
                      className={`${inputCls} min-w-0 flex-1 bg-white`}
                      placeholder="Título"
                    />
                    <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="p-1 text-[#7E7468] disabled:opacity-30" aria-label="Subir paso"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx >= stepDrafts.length - 1} className="p-1 text-[#7E7468] disabled:opacity-30" aria-label="Bajar paso"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button
                      type="button"
                      onClick={() => setStepDrafts((prev) => (prev.length <= 1 ? [emptyStep()] : prev.filter((_, i) => i !== idx)))}
                      className="p-1 text-[#D32F2F]"
                      aria-label="Eliminar paso"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={st.descripcion}
                    onChange={(e) => setStepDrafts((prev) => prev.map((p, i) => (i === idx ? { ...p, descripcion: e.target.value } : p)))}
                    rows={2}
                    className={`${textareaCls} mt-1 bg-white`}
                    placeholder="Operación, tiempos, control..."
                  />
                </div>
              ))}
            </div>
          </div>
      </CompactAccordion>

      <CompactAccordion
        id="conservation"
        title="Conservación"
        summary={conservationSummary}
        icon={Refrigerator}
        tone="olive"
        open={Boolean(openBlocks.conservation)}
        onToggle={toggleBlock}
      >
          <div className="grid grid-cols-3 gap-1.5">
            <label className={metricCls}>
              <span className={labelCls}>Tipo</span>
              <input value={tipoCons} onChange={(e) => setTipoCons(e.target.value)} className={inputCls} placeholder="Refrig." />
            </label>
            <label className={metricCls}>
              <span className={labelCls}>Temp.</span>
              <input value={tempCons} onChange={(e) => setTempCons(e.target.value)} className={inputCls} placeholder="0-4 °C" />
            </label>
            <label className={metricCls}>
              <span className={labelCls}>Vida</span>
              <input value={vidaUtil} onChange={(e) => setVidaUtil(e.target.value)} className={inputCls} placeholder="3 días" />
            </label>
            <label className={`${metricCls} col-span-3`}>
              <span className={labelCls}>Formato / regeneración</span>
              <textarea value={regeneracion} onChange={(e) => setRegeneracion(e.target.value)} rows={2} className={textareaCls} placeholder="Vacío, GN, MAP, horno, salamandra..." />
            </label>
          </div>
      </CompactAccordion>

      <CompactAccordion
        id="allergens"
        title="Alérgenos"
        summary={allergenSummary}
        icon={AlertTriangle}
        tone="amber"
        open={Boolean(openBlocks.allergens)}
        onToggle={toggleBlock}
      >
          <div className="flex flex-wrap gap-1.5">
            {allergensVisible.length === 0 ? (
              <span className="rounded-full bg-[#F7F3EE] px-2 py-1 text-[10px] font-semibold text-[#7E7468]">Sin alérgenos activos</span>
            ) : (
              allergensVisible.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 rounded-full border border-[#B8872A]/20 bg-[#B8872A]/10 px-2 py-1 text-[10px] font-bold text-[#7A5518]"
                >
                  <span aria-hidden>{a.allergen?.icon ?? '•'}</span>
                  {a.allergen?.name ?? 'Alérgeno'}
                  <span className="font-medium opacity-75">{presenceLabel(a.presence_type)}</span>
                </span>
              ))
            )}
          </div>
          {!recipe.isSubRecipe ? (
            <Link href={`/appcc/carta-alergenos/${recipe.id}`} className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#C4531F]">
              <ImageIcon className="h-3.5 w-3.5" aria-hidden />
              Carta APPCC
            </Link>
          ) : null}
          <label className="mt-2 block space-y-1">
            <span className={labelCls}>Notas manuales</span>
            <textarea value={alergManual} onChange={(e) => setAlergManual(e.target.value)} rows={2} className={textareaCls} placeholder="Trazas, puede contener..." />
          </label>
      </CompactAccordion>

      <CompactAccordion
        id="plating"
        title="Emplatado"
        summary={platingSummary || 'Montaje · decoración · foto'}
        icon={Camera}
        open={Boolean(openBlocks.plating)}
        onToggle={toggleBlock}
      >
          <div className="grid gap-1.5">
            <label className={metricCls}>
              <span className={labelCls}>Montaje</span>
              <textarea value={emplDesc} onChange={(e) => setEmplDesc(e.target.value)} rows={2} className={textareaCls} />
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <label className={metricCls}>
                <span className={labelCls}>Decoración</span>
                <input value={emplDeco} onChange={(e) => setEmplDeco(e.target.value)} className={inputCls} />
              </label>
              <label className={metricCls}>
                <span className={labelCls}>Soporte</span>
                <input value={emplMenaje} onChange={(e) => setEmplMenaje(e.target.value)} className={inputCls} />
              </label>
            </div>
            <div className={metricCls}>
              <span className={labelCls}>Foto emplatado</span>
              <label className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[rgba(10,9,8,0.16)] bg-[#FAFAF9] px-2 text-[11px] font-bold text-[#0A0908]">
                <Camera className="h-3.5 w-3.5 text-[#C4531F]" aria-hidden />
                Subir foto
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    readImageFile(file, setEmplFoto);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {emplFoto.trim() ? (
              <div className="flex items-center gap-2 rounded-lg border border-[rgba(10,9,8,0.08)] bg-[#FAFAF9] p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={emplFoto.trim()} alt="" className="h-12 w-12 rounded-md object-cover" />
                <span className="text-[10px] font-semibold text-[#7E7468]">Foto añadida</span>
                <button type="button" onClick={() => setEmplFoto('')} className="ml-auto rounded-md px-2 py-1 text-[10px] font-bold text-[#D32F2F]">
                  Quitar
                </button>
              </div>
            ) : null}
          </div>
      </CompactAccordion>

      <CompactAccordion
        id="observations"
        title="Observaciones"
        summary={observationsCount > 0 ? `${observationsCount} notas` : 'Sin notas'}
        icon={ClipboardList}
        open={Boolean(openBlocks.observations)}
        onToggle={toggleBlock}
      >
          <div className="grid gap-1.5">
            <label className={metricCls}>
              <span className={labelCls}>Notas chef</span>
              <textarea value={notasChef} onChange={(e) => setNotasChef(e.target.value)} rows={2} className={textareaCls} />
            </label>
            <label className={metricCls}>
              <span className={labelCls}>Puntos críticos</span>
              <textarea value={puntosCrit} onChange={(e) => setPuntosCrit(e.target.value)} rows={2} className={textareaCls} />
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <label className={metricCls}>
                <span className={labelCls}>Errores</span>
                <textarea value={errores} onChange={(e) => setErrores(e.target.value)} rows={2} className={textareaCls} />
              </label>
              <label className={metricCls}>
                <span className={labelCls}>Recomend.</span>
                <textarea value={reco} onChange={(e) => setReco(e.target.value)} rows={2} className={textareaCls} />
              </label>
            </div>
          </div>
      </CompactAccordion>
      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#D32F2F] text-[12px] font-black text-white transition hover:bg-[#B91C1C] disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
        Guardar ficha
      </button>
    </div>
  );
}
