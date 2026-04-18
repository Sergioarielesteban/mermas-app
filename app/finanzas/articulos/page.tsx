'use client';

import { Suspense } from 'react';
import FinanzasCsvButton from '@/components/FinanzasCsvButton';
import FinanzasSectionShell from '@/components/FinanzasSectionShell';

function eur(n: number) {
  return `${n.toFixed(2)} €`;
}

function FinanzasArticulosBody() {
  return (
    <FinanzasSectionShell
      title="Artículos"
      description="Artículos con mayor gasto neto en albaranes validados del periodo."
      periodBasePath="/finanzas/articulos"
    >
      {({ data, loading }) => (
        <>
          {loading && !data ? <p className="text-sm text-zinc-600">Cargando…</p> : null}

          {data ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                <FinanzasCsvButton
                  filename={`finanzas-articulos_${data.periodFrom}_${data.periodTo}.csv`}
                  columns={[
                    { key: 'label', header: 'Articulo' },
                    { key: 'lines', header: 'Lineas' },
                    { key: 'net', header: 'Neto_eur' },
                  ]}
                  rows={data.topArticles.map((row) => ({
                    label: row.label,
                    lines: row.lines,
                    net: row.net,
                  }))}
                  disabled={data.topArticles.length === 0}
                />
              </div>
              <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600">
                    <tr>
                      <th className="px-4 py-2">Artículo</th>
                      <th className="px-4 py-2 text-right">Líneas</th>
                      <th className="px-4 py-2 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topArticles.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                          Sin líneas de albarán en este periodo.
                        </td>
                      </tr>
                    ) : (
                      data.topArticles.map((row) => (
                        <tr key={row.key} className="border-t border-zinc-100">
                          <td className="px-4 py-2 font-medium text-zinc-900">{row.label}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-zinc-700">{row.lines}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-zinc-900">{eur(row.net)}</td>
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

export default function FinanzasArticulosPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-600">Cargando…</p>
        </section>
      }
    >
      <FinanzasArticulosBody />
    </Suspense>
  );
}
