'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  type ChefProductionBoardRow,
  ensureChefProductionSessionLinesForTemplate,
  fetchChefProductionSessionLines,
  fetchFullProductionDayBoardRowsForTemplate,
  fetchChefProductionZones,
  getOrCreateChefProductionSession,
  mergedRowSessionLine,
  type ChefProductionSessionLine,
} from '@/lib/chef-ops-supabase';
import {
  buildLabelPrintCss,
  getLabelTemplate,
  labelTemplateStorageKey,
  LABEL_TEMPLATES,
  PRODUCTION_LABEL_MAIN_LOGO_SRC,
  PRODUCTION_LABEL_SECONDARY_LOGO_SRC,
  type LabelTemplateId,
} from '@/lib/production-label-config';

type LabelPayload = {
  producto: string;
  elaboracion: string;
  caducidad: string | null;
  lote: string;
};

function addCalendarDaysIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function fmtEsDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function labelsFromBoardAndLines(
  workDateIso: string,
  rows: ChefProductionBoardRow[],
  lines: ChefProductionSessionLine[],
): LabelPayload[] {
  const byItem = new Map(lines.map((sl) => [sl.blockItemId, sl]));
  const elaboracion = fmtEsDate(workDateIso);
  let seq = 0;
  const labels: LabelPayload[] = [];

  for (const row of rows) {
    const sl = mergedRowSessionLine(row, byItem);
    if (!sl) continue;

    const hechoNum =
      sl.qtyOnHand != null && !Number.isNaN(Number(sl.qtyOnHand))
        ? Number(sl.qtyOnHand)
        : 0;

    if (hechoNum <= 0) continue;

    seq += 1;

    const shelf =
      row.ljItem?.shelfLifeDays ??
      row.vdItem?.shelfLifeDays ??
      row.extraItem?.shelfLifeDays ??
      null;

    const caducidad =
      shelf != null && Number.isFinite(shelf)
        ? fmtEsDate(addCalendarDaysIso(workDateIso, shelf))
        : null;

    const lotePref = workDateIso.replace(/-/g, '');

    labels.push({
      producto: row.displayLabel,
      elaboracion,
      caducidad,
      lote: `L${lotePref}-${seq}`,
    });
  }

  return labels;
}

function ProduccionEtiquetasPrintInner() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const templateParam = searchParams.get('templateId');
  const urlLabelTemplate = searchParams.get('labelTemplate');

  const { localId, profileReady, userId } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [templateId, setTemplateId] = useState<LabelTemplateId>('small_62x29');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [labels, setLabels] = useState<LabelPayload[]>([]);
  const [meta, setMeta] = useState<{ workDate: string } | null>(null);

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(labelTemplateStorageKey('production'))
        : null;

    const next = getLabelTemplate(urlLabelTemplate ?? stored, 'production').id;
    setTemplateId(next);
  }, [urlLabelTemplate]);

  const labelTemplate = useMemo(
    () => getLabelTemplate(templateId, 'production'),
    [templateId],
  );

  useEffect(() => {
    const el = document.createElement('style');
    el.setAttribute('data-label-print', 'production');
    el.textContent = buildLabelPrintCss(labelTemplate);
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, [labelTemplate]);

  const selectTemplate = (id: LabelTemplateId) => {
    setTemplateId(id);
    window.localStorage.setItem(labelTemplateStorageKey('production'), id);
  };

  useEffect(() => {
    if (!profileReady) return;

    const dateEff = dateParam?.trim() ?? '';
    const tplEff = templateParam?.trim() ?? '';

    if (!localId || !supabaseOk) {
      setLoading(false);
      setErr('Sin sesión o Supabase.');
      return;
    }

    if (!dateEff || !tplEff || dateEff.length < 10) {
      setLoading(false);
      setErr(!dateEff || !tplEff ? 'Faltan date o templateId en la URL.' : 'Fecha no válida.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErr(null);

    void (async () => {
      const supabase = getSupabaseClient()!;

      try {
        const sessionRow = await getOrCreateChefProductionSession(
          supabase,
          localId,
          tplEff,
          dateEff,
          null,
          userId ?? null,
        );

        if (cancelled) return;

        if (!sessionRow.completedAt) {
          await ensureChefProductionSessionLinesForTemplate(supabase, sessionRow.id, tplEff);
        }

        const zones = await fetchChefProductionZones(supabase, tplEff).catch(
          () => [] as { id: string; label: string }[],
        );

        const zoneMap = new Map(zones.map((z) => [z.id, z.label]));

        const boardRows = await fetchFullProductionDayBoardRowsForTemplate(supabase, tplEff, {
          zoneLabel: (zid) => (zid ? zoneMap.get(zid) ?? '' : ''),
        });

        const sl = await fetchChefProductionSessionLines(supabase, sessionRow.id);
        const nextLabels = labelsFromBoardAndLines(sessionRow.workDate, boardRows, sl);

        if (cancelled) return;

        setMeta({ workDate: dateEff });
        setLabels(nextLabels);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Error al cargar.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileReady, localId, supabaseOk, dateParam, templateParam, userId]);

  if (!profileReady || loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Cargando etiquetas…</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="no-print space-y-4 p-6">
        <p className="text-sm text-red-700">{err}</p>
        <Link
          href="/produccion"
          className="inline-flex rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-bold text-zinc-800"
        >
          Volver a producción
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="label-page-bg px-4 py-5 print:bg-white print:p-0">
        <div className="no-print mx-auto mb-5 max-w-md space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-900">
              Etiquetas de producción
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              {meta?.workDate ?? ''} · Brother 810 · ancho 62 mm
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(Object.values(LABEL_TEMPLATES) as Array<(typeof LABEL_TEMPLATES)[LabelTemplateId]>).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => selectTemplate(tpl.id)}
                className={[
                  'rounded-2xl border border-zinc-200 bg-zinc-50 px-2 py-3 text-center text-[11px] font-black text-zinc-700',
                  templateId === tpl.id ? 'label-template-card-active' : '',
                ].join(' ')}
              >
                <span className="block">{tpl.shortName}</span>
                <span className="mt-1 block text-[9px] font-semibold normal-case leading-tight text-zinc-500">
                  {tpl.id === 'small_62x29' ? 'diaria' : tpl.id === 'medium_62x50' ? 'media' : 'QR'}
                </span>
              </button>
            ))}
          </div>

          <p className="rounded-2xl bg-zinc-50 px-3 py-2 text-xs font-medium leading-relaxed text-zinc-600">
            Plantilla activa:{' '}
            <strong className="text-zinc-900">{labelTemplate.name}</strong>.{' '}
            {labelTemplate.description}
          </p>

          {labels.length > 0 ? (
            <button
              type="button"
              onClick={() => window.print()}
              className="flex min-h-[3.25rem] w-full touch-manipulation items-center justify-center rounded-2xl bg-zinc-900 text-sm font-black uppercase tracking-wide text-white"
            >
              Imprimir {labels.length} etiqueta{labels.length === 1 ? '' : 's'}
            </button>
          ) : (
            <p className="text-sm leading-relaxed text-zinc-700">
              No hay etiquetas para imprimir. Marca cantidades en HECHO en Producción del día.
            </p>
          )}

          <Link
            href="/produccion"
            className="flex min-h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white text-xs font-bold text-zinc-800"
          >
            Volver a producción
          </Link>
        </div>

        {labels.length > 0 ? (
          <div className="label-sheet">
            {labels.map((lb, idx) => {
              const cad = lb.caducidad != null && lb.caducidad.trim() !== '' ? lb.caducidad : '—';

              return (
                <article key={`${lb.lote}-${idx}`} className="production-label">
                  {labelTemplate.fields.mainLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- impresión: imagen pública estable.
                    <img src={PRODUCTION_LABEL_MAIN_LOGO_SRC} alt="" className="label-logo-main" />
                  ) : null}

                  {labelTemplate.fields.product ? (
                    <div className="label-product-name">{lb.producto}</div>
                  ) : null}

                  {labelTemplate.fields.madeDate ? (
                    <div className="label-body-line">
                      Elab. <span>{lb.elaboracion}</span>
                    </div>
                  ) : null}

                  {labelTemplate.fields.expiryDate ? (
                    <div className="label-body-line">
                      Cad. <span>{cad}</span>
                    </div>
                  ) : null}

                  {labelTemplate.fields.lot && lb.lote.trim() !== '' ? (
                    <div className="label-small-muted">Lote: {lb.lote}</div>
                  ) : null}

                  {labelTemplate.fields.chefOneLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={PRODUCTION_LABEL_SECONDARY_LOGO_SRC} alt="" className="label-logo-chefone" />
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}

export default function ProduccionEtiquetasPrintPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-600">Cargando…</p>}>
      <ProduccionEtiquetasPrintInner />
    </Suspense>
  );
}