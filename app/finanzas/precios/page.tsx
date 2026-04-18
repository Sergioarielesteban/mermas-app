'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import FinanzasCsvButton from '@/components/FinanzasCsvButton';
import FinanzasSectionShell from '@/components/FinanzasSectionShell';
import { FINANZAS_UMBRALES } from '@/lib/finanzas-supabase';

function FinanzasPreciosBody() {
  return (
    <FinanzasSectionShell
      title="Subidas de precio"
      description={`PMP media ponderada en albaranes validados: periodo seleccionado vs comparación. Umbral: +${Math.round((FINANZAS_UMBRALES.preciosPmp.spikeRatio - 1) * 100)}% y PMP anterior ≥ ${FINANZAS_UMBRALES.preciosPmp.minPrevAvgEur} €/ud.`}
      periodBasePath="/finanzas/precios"
    >
      {({ data, loading }) => (
        <>
          {loading && !data ? <p className="text-sm text-zinc-600">Cargando…</p> : null}

          {data ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-600">
                  Comparativa: <strong>{data.prevFrom}</strong> → <strong>{data.prevTo}</strong> frente a{' '}
                  <strong>{data.periodFrom}</strong> → <strong>{data.periodTo}</strong>. Misma clave proveedor + artículo que en rankings.
                </p>
                <FinanzasCsvButton
                  filename={`finanzas-precios_${data.periodFrom}_${data.periodTo}.csv`}
                  columns={[
                    { key: 'label', header: 'Articulo' },
                    { key: 'supplierName', header: 'Proveedor' },
                    { key: 'prevAvg', header: 'PMP_periodo_anterior' },
                    { key: 'last', header: 'PMP_periodo_actual' },
                    { key: 'deltaPct', header: 'Delta_pct' },
                  ]}
                  rows={data.topPriceIncreases.map((r) => ({
                    label: r.label,
                    supplierName: r.supplierName,
                    prevAvg: r.prevAvg,
                    last: r.last,
                    deltaPct: r.deltaPct,
                  }))}
                  disabled={data.topPriceIncreases.length === 0}
                />
              </div>

              <p className="text-center text-sm">
                <Link href="/pedidos/precios" className="font-semibold text-[#B91C1C] underline-offset-2 hover:underline">
                  Ajustar precios en catálogo Pedidos
                </Link>
              </p>

              <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600">
                    <tr>
                      <th className="px-4 py-2">Artículo</th>
                      <th className="px-4 py-2">Proveedor</th>
                      <th className="px-4 py-2 text-right">PMP ant. (€/ud.)</th>
                      <th className="px-4 py-2 text-right">PMP actual</th>
                      <th className="px-4 py-2 text-right">Δ %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPriceIncreases.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                          No hay líneas que superen el umbral en este periodo (o falta histórico en el periodo anterior).
                        </td>
                      </tr>
                    ) : (
                      data.topPriceIncreases.map((r, idx) => (
                        <tr key={`${idx}-${r.label}-${r.prevAvg}`} className="border-t border-zinc-100">
                          <td className="px-4 py-2 font-medium text-zinc-900">{r.label}</td>
                          <td className="px-4 py-2 text-zinc-700">{r.supplierName}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-zinc-600">{r.prevAvg.toFixed(4)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-zinc-900">{r.last.toFixed(4)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold text-amber-800">+{r.deltaPct.toFixed(1)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </FinanzasSectionShell>
  );
}

export default function FinanzasPreciosPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-600">Cargando…</p>
        </section>
      }
    >
      <FinanzasPreciosBody />
    </Suspense>
  );
}
