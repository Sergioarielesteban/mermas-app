'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
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
  buildProductionLabelPrintCss,
  DEFAULT_PRODUCTION_LABEL_CONFIG,
  PRODUCTION_LABEL_MAIN_LOGO_SRC,
  PRODUCTION_LABEL_SECONDARY_LOGO_SRC,
  productionLabelAlignClass,
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
      sl.qtyOnHand != null && !Number.isNaN(Number(sl.qtyOnHand)) ? Number(sl.qtyOnHand) : 0;
    if (hechoNum <= 0) continue;
    seq += 1;
    const shelf =
      row.ljItem?.shelfLifeDays ?? row.vdItem?.shelfLifeDays ?? row.extraItem?.shelfLifeDays ?? null;
    const caducidad =
      shelf != null && Number.isFinite(shelf) ? fmtEsDate(addCalendarDaysIso(workDateIso, shelf)) : null;
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
  const { localId, profileReady, userId } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const labelCfg = DEFAULT_PRODUCTION_LABEL_CONFIG;
  const labelAlignClass = productionLabelAlignClass(labelCfg.align);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [labels, setLabels] = useState<LabelPayload[]>([]);
  const [meta, setMeta] = useState<{ workDate: string } | null>(null);

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
        const zones = await fetchChefProductionZones(supabase, tplEff).catch(() => [] as { id: string; label: string }[]);
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
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Error al cargar.');
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
      <style
        // eslint-disable-next-line react/no-danger -- CSS de impresión con medidas desde LabelConfig
        dangerouslySetInnerHTML={{
          __html: buildProductionLabelPrintCss(labelCfg),
        }}
      />

      <div className="mx-auto max-w-md px-4 py-6 print:px-0 print:py-0">
        <div className="no-print mb-6 space-y-3">
          <h1 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Etiquetas de producción</h1>
          {meta ? (
            <p className="text-[11px] text-zinc-500">{meta.workDate}</p>
          ) : null}
          {labels.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex min-h-[3rem] w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-black uppercase tracking-wide text-white touch-manipulation"
              >
                IMPRIMIR
              </button>
              <Link
                href="/produccion"
                className="flex min-h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white text-xs font-bold text-zinc-800"
              >
                Volver a producción
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-zinc-700">
                No hay etiquetas para imprimir. Marca cantidades en HECHO en Producción del día.
              </p>
              <Link
                href="/produccion"
                className="inline-flex rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-bold text-zinc-800"
              >
                Volver a producción
              </Link>
            </>
          )}
        </div>

        {labels.length > 0 ? (
          <div className="bg-white">
            {labels.map((lb, idx) => {
              const cad = lb.caducidad != null && lb.caducidad.trim() !== '' ? lb.caducidad : '—';
              return (
                <article
                  key={`${lb.lote}-${idx}`}
                  className={['production-label', labelAlignClass].join(' ')}
                >
                  {labelCfg.showMainLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- impresión: PNG en /public, fiel al archivo
                    <img src={PRODUCTION_LABEL_MAIN_LOGO_SRC} alt="" className="logo-main" />
                  ) : null}
                  <div className="production-label-body">
                    <div className="text-[10px] font-extrabold uppercase leading-snug">{lb.producto}</div>
                    <div className="mt-1 text-[8px] font-semibold text-zinc-800">
                      Fecha elaboración: <span className="font-bold tabular-nums">{lb.elaboracion}</span>
                    </div>
                    <div className="text-[8px] font-semibold text-zinc-800">
                      Caducidad: <span className="font-bold tabular-nums">{cad}</span>
                    </div>
                    {lb.lote.trim() !== '' ? (
                      <div className="mt-1 text-[7px] font-bold tabular-nums text-zinc-600">Lote: {lb.lote}</div>
                    ) : null}
                  </div>
                  {labelCfg.showChefOneLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={PRODUCTION_LABEL_SECONDARY_LOGO_SRC}
                      alt=""
                      className="logo-secondary"
                    />
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
