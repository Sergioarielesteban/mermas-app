'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  type ChefProductionBoardRow,
  chefProdLabelsStorageKeyV2,
  ensureChefProductionSessionLinesForTemplate,
  fetchChefProductionSessionLines,
  fetchFullProductionDayBoardRowsForTemplate,
  fetchChefProductionZones,
  getOrCreateChefProductionSession,
  mergedRowSessionLine,
  type ChefProductionSessionLine,
} from '@/lib/chef-ops-supabase';
import { shouldUseManualPrintOnly } from '@/lib/print-platform';

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

  const [err, setErr] = useState<string | null>(null);
  const [labels, setLabels] = useState<LabelPayload[]>([]);
  const [meta, setMeta] = useState<{ workDate: string } | null>(null);
  const [manualPrintOnly, setManualPrintOnly] = useState(false);

  useEffect(() => {
    setManualPrintOnly(shouldUseManualPrintOnly());
  }, []);

  useEffect(() => {
    if (!profileReady || !localId || !supabaseOk) {
      if (profileReady && (!localId || !supabaseOk)) {
        setErr('Sin sesión o Supabase.');
      }
      return;
    }

    const dateEff = dateParam?.trim() ?? '';
    const tplEff = templateParam?.trim() ?? '';
    if (!dateEff || !tplEff || dateEff.length < 10) {
      if (profileReady) setErr(!dateEff || !tplEff ? 'Faltan parámetros date o templateId en la URL.' : 'Fecha no válida.');
      return;
    }

    let cancelled = false;
    void (async () => {
      const supabase = getSupabaseClient()!;
      try {
        let nextLabels: LabelPayload[] = [];

        if (typeof window !== 'undefined') {
          try {
            const raw = sessionStorage.getItem(chefProdLabelsStorageKeyV2(dateEff, tplEff));
            if (raw) {
              const parsed = JSON.parse(raw) as { workDate?: string; labels?: LabelPayload[] };
              if (
                Array.isArray(parsed.labels) &&
                parsed.labels.length > 0 &&
                parsed.workDate === dateEff
              ) {
                nextLabels = parsed.labels;
              }
            }
          } catch {
            /* ignore */
          }
        }

        if (nextLabels.length === 0) {
          const session = await getOrCreateChefProductionSession(
            supabase,
            localId,
            tplEff,
            dateEff,
            null,
            userId ?? null,
          );
          if (cancelled) return;
          if (!session.completedAt) {
            await ensureChefProductionSessionLinesForTemplate(supabase, session.id, tplEff);
          }
          const zones = await fetchChefProductionZones(supabase, tplEff).catch(() => [] as { id: string; label: string }[]);
          const zoneMap = new Map(zones.map((z) => [z.id, z.label]));
          const rows = await fetchFullProductionDayBoardRowsForTemplate(supabase, tplEff, {
            zoneLabel: (zid) => (zid ? zoneMap.get(zid) ?? '' : ''),
          });
          const sl = await fetchChefProductionSessionLines(supabase, session.id);
          nextLabels = labelsFromBoardAndLines(session.workDate, rows, sl);
        }

        if (cancelled) return;
        setErr(null);
        setMeta({ workDate: dateEff });
        setLabels(nextLabels);
        if (nextLabels.length === 0) {
          setErr('No hay producción registrada (hecho > 0) para etiquetar.');
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Error al cargar.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileReady, localId, supabaseOk, dateParam, templateParam, userId]);

  /** Escritorio: disparo automático tipo ventana nueva. iOS/Android con WebKit restrictivo: el usuario pulsa «Imprimir» (gesto → window.print, igual que /cocina-central/etiquetas). */
  useEffect(() => {
    if (labels.length === 0 || err || manualPrintOnly) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (!cancelled) {
        try {
          window.print();
        } catch {
          /* ignore */
        }
      }
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [labels, err, manualPrintOnly]);

  if (!profileReady) return <p className="p-6 text-sm text-zinc-600">Cargando…</p>;
  if (err) return <p className="p-6 text-sm text-red-700">{err}</p>;
  if (labels.length === 0) return <p className="p-6 text-sm text-zinc-600">Sin etiquetas.</p>;

  return (
    <>
      <style
        // eslint-disable-next-line react/no-danger -- CSS de impresión estático sin datos de usuario como HTML ejecutable.
        dangerouslySetInnerHTML={{
          __html: `
        @page { size: 58mm 40mm; margin: 0; }
        @media print {
          body { margin: 0 !important; background: white !important; }
          html { margin: 0 !important; padding: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          .production-label {
            border-color: #000 !important;
            box-shadow: none !important;
            width: 58mm !important;
            min-height: 38mm !important;
            padding: 3mm !important;
            box-sizing: border-box !important;
            page-break-after: always !important;
          }
        }
        .production-label {
          box-sizing: border-box;
          width: 58mm;
          min-height: 38mm;
          padding: 3mm;
          margin: 0 auto 4mm;
          border: 1px solid #333;
          page-break-after: always;
          font-family: system-ui, -apple-system, sans-serif;
        }`,
        }}
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
          className="min-h-12 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-black uppercase tracking-wide text-white touch-manipulation"
        >
          Imprimir etiqueta
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-bold text-zinc-800"
        >
          Cerrar
        </button>
        <span className="text-[11px] text-zinc-600">
          {meta?.workDate ?? ''} · {labels.length} etiqueta{labels.length !== 1 ? 's' : ''}
        </span>
        {manualPrintOnly ? (
          <p className="w-full text-[11px] font-semibold leading-snug text-zinc-700">
            En iPhone o iPad, pulsa <span className="font-black">Imprimir etiqueta</span> para abrir AirPrint (el navegador no permite abrir impresión automática sin tu toque).
          </p>
        ) : null}
      </div>

      <div className="bg-white">
        {labels.map((lb, idx) => {
          const cad = lb.caducidad != null && lb.caducidad.trim() !== '' ? lb.caducidad : '—';
          return (
            <article key={`${lb.lote}-${idx}`} className="production-label">
              <div className="text-[11px] font-extrabold uppercase leading-snug tracking-wide">{lb.producto}</div>
              <div className="mt-2 text-[9px] font-semibold text-zinc-800">
                Fecha elaboración: <span className="font-bold tabular-nums">{lb.elaboracion}</span>
              </div>
              <div className="text-[9px] font-semibold text-zinc-800">
                Caducidad: <span className="font-bold tabular-nums">{cad}</span>
              </div>
              {lb.lote.trim() !== '' ? (
                <div className="mt-1 text-[8px] font-bold tabular-nums text-zinc-600">Lote: {lb.lote}</div>
              ) : null}
            </article>
          );
        })}
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
