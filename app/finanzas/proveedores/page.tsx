'use client';

import { Suspense } from 'react';
import FinanzasCsvButton from '@/components/FinanzasCsvButton';
import FinanzasSectionShell from '@/components/FinanzasSectionShell';

function eur(n: number) {
  return `${n.toFixed(2)} €`;
}

function FinanzasProveedoresBody() {
  return (
    <FinanzasSectionShell
      title="Proveedores"
      description="Ranking de gasto neto por proveedor en el periodo (albaranes validados)."
      periodBasePath="/finanzas/proveedores"
    >
      {({ data, loading }) => (
        <>
          {loading && !data ? <p className="text-sm text-zinc-600">Cargando…</p> : null}

          {data ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                <FinanzasCsvButton
                  filename={`finanzas-proveedores_${data.periodFrom}_${data.periodTo}.csv`}
                  columns={[
                    { key: 'supplierName', header: 'Proveedor' },
                    { key: 'net', header: 'Neto_eur' },
                    { key: 'count', header: 'Albaranes' },
                    { key: 'pctOfTotal', header: 'Pct_total' },
                    { key: 'deltaVsPrevPct', header: 'Delta_vs_periodo_ant_pct' },
                  ]}
                  rows={data.topSuppliers.map((row) => ({
                    supplierName: row.supplierName,
                    net: row.net,
                    count: row.count,
                    pctOfTotal: row.pctOfTotal,
                    deltaVsPrevPct: row.deltaVsPrev == null ? '' : row.deltaVsPrev,
                  }))}
                  disabled={data.topSuppliers.length === 0}
                />
              </div>
              <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600">
                    <tr>
                      <th className="px-4 py-2">Proveedor</th>
                      <th className="px-4 py-2 text-right">Neto</th>
                      <th className="px-4 py-2 text-right">Albaranes</th>
                      <th className="px-4 py-2 text-right">% del total</th>
                      <th className="px-4 py-2 text-right">vs periodo ant.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topSuppliers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                          Sin datos de proveedores en este periodo.
                        </td>
                      </tr>
                    ) : (
                      data.topSuppliers.map((row) => (
                        <tr key={`${row.supplierId ?? 'noid'}-${row.supplierName}`} className="border-t border-zinc-100">
                          <td className="px-4 py-2 font-medium text-zinc-900">{row.supplierName}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-zinc-900">{eur(row.net)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-zinc-700">{row.count}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-zinc-600">{row.pctOfTotal.toFixed(1)}%</td>
                          <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
                            {row.deltaVsPrev == null ? (
                              '—'
                            ) : (
                              <span
                                className={
                                  row.deltaVsPrev > 0 ? 'text-amber-700' : row.deltaVsPrev < 0 ? 'text-emerald-700' : ''
                                }
                              >
                                {row.deltaVsPrev >= 0 ? '+' : ''}
                                {row.deltaVsPrev.toFixed(1)}%
                              </span>
                            )}
                          </td>
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

export default function FinanzasProveedoresPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-600">Cargando…</p>
        </section>
      }
    >
      <FinanzasProveedoresBody />
    </Suspense>
  );
}
