'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@/components/AuthProvider';
import LabelPrintSetupTip from '@/components/LabelPrintSetupTip';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { buildCocinaCentralBatchQrUrl } from '@/lib/cocina-central-qr';
import { ccFetchBatchById, ccProductName } from '@/lib/cocina-central-supabase';
import {
  buildLabelPrintCss,
  getLabelTemplate,
  labelTemplateStorageKey,
  LABEL_TEMPLATES,
  PRODUCTION_LABEL_MAIN_LOGO_SRC,
  PRODUCTION_LABEL_SECONDARY_LOGO_SRC,
  type LabelTemplateId,
} from '@/lib/production-label-config';

function fmtIsoDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function CocinaCentralEtiquetaPage() {
  const { id } = useParams<{ id: string }>();
  const { profileReady, localId } = useAuth();
  const supabase = getSupabaseClient();

  const [templateId, setTemplateId] = useState<LabelTemplateId>('large_62x80_qr');
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [batch, setBatch] = useState<Awaited<ReturnType<typeof ccFetchBatchById>>>(null);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(labelTemplateStorageKey('central')) : null;
    setTemplateId(getLabelTemplate(stored, 'central').id);
  }, []);

  const labelTemplate = useMemo(() => getLabelTemplate(templateId, 'central'), [templateId]);

  useEffect(() => {
    const el = document.createElement('style');
    el.setAttribute('data-label-print', 'central');
    el.textContent = buildLabelPrintCss(labelTemplate);
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, [labelTemplate]);

  const selectTemplate = (next: LabelTemplateId) => {
    setTemplateId(next);
    window.localStorage.setItem(labelTemplateStorageKey('central'), next);
  };

  useEffect(() => {
    if (!supabase || !id) return;
    let cancelled = false;
    void (async () => {
      try {
        const b = await ccFetchBatchById(supabase, id);
        if (cancelled) return;
        setBatch(b);
        if (!b) {
          setErr('Lote no encontrado');
          return;
        }
        const origin =
          typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL ?? '';
        const url = buildCocinaCentralBatchQrUrl(origin, b.id, b.qr_token);
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 260 });
        if (!cancelled) setQr(dataUrl);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Error QR');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

  if (!profileReady) return <p className="p-6 text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase || !localId) return <p className="p-6 text-sm text-zinc-600">Sin sesión.</p>;

  if (!batch) {
    return <p className="p-6 text-sm text-zinc-600">{err ?? 'Cargando lote…'}</p>;
  }

  const productName = ccProductName(
    (Array.isArray(batch.central_preparations) ? batch.central_preparations[0] : batch.central_preparations) ??
      batch.products,
  );

  return (
    <>
      <div className="label-page-bg px-4 py-5 print:bg-white print:p-0">
        <div className="no-print mx-auto mb-5 max-w-md space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-900">Etiqueta cocina central</h1>
            <p className="mt-1 text-xs text-zinc-500">Brother 810 · ancho 62 mm · lote {batch.codigo_lote}</p>
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
            Plantilla activa: <strong className="text-zinc-900">{labelTemplate.name}</strong>. {labelTemplate.description}
          </p>

          {err ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</p> : null}

          <button
            type="button"
            onClick={() => window.print()}
            className="h-12 w-full rounded-2xl bg-zinc-900 text-sm font-extrabold uppercase tracking-wide text-white"
          >
            Imprimir etiqueta
          </button>
          <LabelPrintSetupTip />
        </div>

        <div className="label-sheet">
          <article className="production-label">
            {labelTemplate.fields.mainLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={PRODUCTION_LABEL_MAIN_LOGO_SRC} alt="" className="label-logo-main" />
            ) : null}

            {labelTemplate.fields.product ? <div className="label-product-name">{productName}</div> : null}

            {labelTemplate.fields.lot ? <div className="label-body-line">Lote <span>{batch.codigo_lote}</span></div> : null}

            {labelTemplate.fields.madeDate ? (
              <div className="label-body-line">Elab. <span>{fmtIsoDate(batch.fecha_elaboracion)}</span></div>
            ) : null}

            {labelTemplate.fields.expiryDate ? (
              <div className="label-body-line">Cad. <span>{fmtIsoDate(batch.fecha_caducidad)}</span></div>
            ) : null}

            {labelTemplate.fields.status ? <div className="label-small-muted">Estado: {batch.estado}</div> : null}

            {labelTemplate.fields.qr ? (
              qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Código QR del lote" className="label-qr" />
              ) : (
                <div className="label-small-muted">Generando QR…</div>
              )
            ) : null}

            {labelTemplate.fields.token ? <div className="label-small-muted">{batch.qr_token}</div> : null}

            {labelTemplate.fields.chefOneLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={PRODUCTION_LABEL_SECONDARY_LOGO_SRC} alt="" className="label-logo-chefone" />
            ) : null}
          </article>
        </div>
      </div>
    </>
  );
}
