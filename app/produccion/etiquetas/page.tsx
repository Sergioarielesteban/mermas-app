'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import LabelPrintSetupTip from '@/components/LabelPrintSetupTip';
import {
  buildLabelPrintCss,
  getLabelTemplate,
  labelTemplateStorageKey,
  LABEL_TEMPLATES,
  PRODUCTION_LABEL_MAIN_LOGO_SRC,
  PRODUCTION_LABEL_SECONDARY_LOGO_SRC,
  type LabelTemplateId,
} from '@/lib/production-label-config';

type QuickLabel = {
  producto: string;
  elaboracion: string;
  caducidad: string;
  lote: string;
  quantity: number;
  templateId: LabelTemplateId;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtEs(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function makeLot() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const n = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
  return `PRD-${ymd}-${n}`;
}

const FAVORITES = [
  { name: 'Bacon tiras', templateId: 'small_62x29' as LabelTemplateId, days: 5 },
  { name: 'Salsa boloñesa', templateId: 'medium_62x50' as LabelTemplateId, days: 7 },
  { name: 'Cebolla caramelizada', templateId: 'small_62x29' as LabelTemplateId, days: 7 },
  { name: 'Salsa trufa', templateId: 'medium_62x50' as LabelTemplateId, days: 5 },
] as const;

function templateSizeLabel(id: LabelTemplateId): string {
  if (id === 'small_62x29') return '62×29';
  if (id === 'medium_62x50') return '62×50';
  return '62×80 QR';
}

export default function ProduccionEtiquetasPage() {
  const [quickOpen, setQuickOpen] = useState(false);
  const [producto, setProducto] = useState('BACON TIRAS');
  const [elaboracion, setElaboracion] = useState(todayIso());
  const [caducidad, setCaducidad] = useState(addDaysIso(5));
  const [lote, setLote] = useState(() => makeLot());
  const [quantity, setQuantity] = useState(1);
  const [templateId, setTemplateId] = useState<LabelTemplateId>('small_62x29');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(labelTemplateStorageKey('production')) : null;
    const tpl = getLabelTemplate(stored, 'production');
    setTemplateId(tpl.id);
  }, []);

  const template = useMemo(() => getLabelTemplate(templateId, 'production'), [templateId]);

  useEffect(() => {
    const el = document.createElement('style');
    el.setAttribute('data-label-print', 'produccion-etiquetas-personalizadas');
    el.textContent = buildLabelPrintCss(template);
    document.head.appendChild(el);
    return () => {
      document.head.removeChild(el);
    };
  }, [template]);

  const currentLabel: QuickLabel = {
    producto,
    elaboracion,
    caducidad,
    lote,
    quantity,
    templateId,
  };

  const selectTemplate = (id: LabelTemplateId) => {
    setTemplateId(id);
    window.localStorage.setItem(labelTemplateStorageKey('production'), id);
  };

  const applyFavorite = (fav: (typeof FAVORITES)[number]) => {
    setProducto(fav.name.toUpperCase());
    setCaducidad(addDaysIso(fav.days));
    setTemplateId(fav.templateId);
    setLote(makeLot());
    setQuickOpen(true);
  };

  const labelsToPrint = Array.from({ length: Math.max(1, quantity) });

  return (
    <>
      <div className="no-print min-h-screen w-full min-w-0 max-w-full overflow-x-hidden bg-zinc-50 px-3 py-4 text-zinc-950 sm:px-4">
        <div className="mx-auto w-full min-w-0 max-w-7xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-zinc-500">Producción / Etiquetas</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight">Etiquetas de producción</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setQuickOpen(true)}
                className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-black text-red-700 shadow-sm"
              >
                ⚡ Etiqueta rápida
              </button>
              <Link
                href="/produccion"
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800"
              >
                Volver
              </Link>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_370px]">
            <main className="space-y-5">
              <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
                <div className="flex flex-wrap gap-2 border-b border-zinc-100 pb-4">
                  <Link
                    href="/produccion"
                    className="rounded-xl bg-red-50 px-4 py-2 text-sm font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100/80"
                  >
                    Producción del día
                  </Link>
                  <Link
                    href="/pedidos/articulos"
                    className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-zinc-600 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                  >
                    Artículos
                  </Link>
                  <Link
                    href="/inventario"
                    className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-zinc-600 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                  >
                    Inventario
                  </Link>
                  <Link
                    href="/produccion/historial"
                    className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-zinc-600 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                  >
                    Historial
                  </Link>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <input
                    placeholder="Buscar producción, artículo..."
                    className="min-h-11 flex-1 rounded-xl border border-zinc-300 bg-white px-4 text-sm outline-none focus:border-red-400"
                  />
                  <button type="button" className="rounded-xl border border-zinc-300 bg-white px-4 text-sm font-bold">
                    Filtros
                  </button>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  {[
                    ['BACON TIRAS', '07/05 08:15', 24],
                    ['SALSA BOLOÑESA', '07/05 09:30', 18],
                    ['ARROZ BASMATI', '07/05 09:45', 12],
                    ['POLLO ASADO', '07/05 10:20', 16],
                    ['CEBOLLA CARAMELIZADA', '07/05 10:45', 10],
                  ].map((row) => (
                    <div
                      key={String(row[0])}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-zinc-100 px-3 py-2.5 last:border-b-0 sm:gap-3 sm:px-4 sm:py-3"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-black leading-snug text-zinc-900">{row[0]}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-zinc-500">Elab: {row[1]}</p>
                      </div>
                      <div className="shrink-0 text-center text-sm font-bold tabular-nums text-zinc-800 sm:text-base">{row[2]}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setProducto(String(row[0]));
                          setLote(makeLot());
                          setQuickOpen(true);
                        }}
                        className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[11px] font-bold text-zinc-900 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 whitespace-nowrap sm:px-3"
                      >
                        Imprimir
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-black">⭐ Favoritos</h2>
                  <button type="button" className="text-xs font-bold text-red-700">
                    Ver todos
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {FAVORITES.map((fav) => (
                    <button
                      key={fav.name}
                      type="button"
                      onClick={() => applyFavorite(fav)}
                      className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-center hover:border-red-300 hover:bg-red-50"
                    >
                      <p className="text-sm font-black">{fav.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">{templateSizeLabel(fav.templateId)}</p>
                    </button>
                  ))}
                </div>
              </section>
            </main>

            <aside className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black">Vista previa</h2>
                <button
                  type="button"
                  onClick={() => setQuickOpen(true)}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-bold"
                >
                  Editar
                </button>
              </div>
              <div className="space-y-6">
                <div className="flex flex-col items-center">
                  <article className="production-label">
                    {template.fields.mainLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- impresión: URL pública estática.
                      <img src={PRODUCTION_LABEL_MAIN_LOGO_SRC} alt="" className="label-logo-main" />
                    ) : null}
                    <div className="label-product-name">{producto || 'PRODUCTO'}</div>
                    <div className="label-body-line">
                      Elab: <span>{fmtEs(elaboracion)}</span>
                    </div>
                    <div className="label-body-line">
                      Cad: <span>{fmtEs(caducidad)}</span>
                    </div>
                    {template.fields.lot ? <div className="label-small-muted">Lote: {lote}</div> : null}
                    {template.fields.chefOneLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={PRODUCTION_LABEL_SECONDARY_LOGO_SRC} alt="" className="label-logo-chefone" />
                    ) : null}
                  </article>
                  <p className="mt-2 text-xs font-medium text-zinc-500">
                    {template.widthMm} × {template.heightMm} mm
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.values(LABEL_TEMPLATES) as Array<(typeof LABEL_TEMPLATES)[LabelTemplateId]>).map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => selectTemplate(tpl.id)}
                      className={[
                        'rounded-2xl border border-zinc-200 bg-zinc-50 px-2 py-3 text-center text-[11px] font-black',
                        templateId === tpl.id ? 'label-template-card-active' : '',
                      ].join(' ')}
                    >
                      {tpl.shortName}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full rounded-2xl bg-zinc-950 px-4 py-4 text-sm font-black uppercase tracking-wide text-white"
                >
                  Imprimir {quantity} etiqueta{quantity === 1 ? '' : 's'}
                </button>
                <LabelPrintSetupTip />
              </div>
            </aside>
          </div>
        </div>
      </div>

      {quickOpen ? (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-black">⚡ Etiqueta rápida</h2>
                <p className="mt-1 text-sm text-zinc-500">Crea e imprime una etiqueta personalizada.</p>
              </div>
              <button type="button" onClick={() => setQuickOpen(false)} className="rounded-full px-3 py-1 text-xl text-zinc-500">
                ×
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-black uppercase text-zinc-700">Producto / Nombre</span>
                <input
                  value={producto}
                  onChange={(e) => setProducto(e.target.value.toUpperCase())}
                  className="mt-1 min-h-12 w-full rounded-xl border border-zinc-300 px-3 text-sm font-bold outline-none focus:border-red-500"
                  placeholder="Escribe el producto..."
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-black uppercase text-zinc-700">Elaboración</span>
                  <input
                    type="date"
                    value={elaboracion}
                    onChange={(e) => setElaboracion(e.target.value)}
                    className="mt-1 min-h-12 w-full rounded-xl border border-zinc-300 px-3 text-sm font-bold"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase text-zinc-700">Caducidad</span>
                  <input
                    type="date"
                    value={caducidad}
                    onChange={(e) => setCaducidad(e.target.value)}
                    className="mt-1 min-h-12 w-full rounded-xl border border-zinc-300 px-3 text-sm font-bold"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-black uppercase text-zinc-700">Lote</span>
                <input
                  value={lote}
                  onChange={(e) => setLote(e.target.value.toUpperCase())}
                  className="mt-1 min-h-12 w-full rounded-xl border border-zinc-300 px-3 text-sm font-bold"
                />
              </label>
              <div>
                <span className="text-xs font-black uppercase text-zinc-700">Cantidad</span>
                <div className="mt-1 grid grid-cols-3 overflow-hidden rounded-xl border border-zinc-300">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="min-h-12 font-black">
                    −
                  </button>
                  <div className="flex items-center justify-center font-black">{quantity}</div>
                  <button type="button" onClick={() => setQuantity((q) => q + 1)} className="min-h-12 font-black">
                    +
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.values(LABEL_TEMPLATES) as Array<(typeof LABEL_TEMPLATES)[LabelTemplateId]>).map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => selectTemplate(tpl.id)}
                    className={[
                      'rounded-2xl border border-zinc-200 bg-zinc-50 px-2 py-3 text-center text-xs font-black',
                      templateId === tpl.id ? 'label-template-card-active' : '',
                    ].join(' ')}
                  >
                    {tpl.shortName}
                  </button>
                ))}
              </div>
              <LabelPrintSetupTip />
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickOpen(false)}
                  className="rounded-xl border border-zinc-300 bg-white py-3 text-sm font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickOpen(false);
                    setTimeout(() => window.print(), 100);
                  }}
                  className="rounded-xl bg-red-600 py-3 text-sm font-black text-white"
                >
                  Imprimir
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="hidden print:block">
        <div className="label-sheet">
          {labelsToPrint.map((_, idx) => (
            <article key={idx} className="production-label">
              {template.fields.mainLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={PRODUCTION_LABEL_MAIN_LOGO_SRC} alt="" className="label-logo-main" />
              ) : null}
              <div className="label-product-name">{currentLabel.producto || 'PRODUCTO'}</div>
              <div className="label-body-line">
                Elab: <span>{fmtEs(currentLabel.elaboracion)}</span>
              </div>
              <div className="label-body-line">
                Cad: <span>{fmtEs(currentLabel.caducidad)}</span>
              </div>
              {template.fields.lot ? <div className="label-small-muted">Lote: {currentLabel.lote}</div> : null}
              {template.fields.chefOneLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={PRODUCTION_LABEL_SECONDARY_LOGO_SRC} alt="" className="label-logo-chefone" />
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
