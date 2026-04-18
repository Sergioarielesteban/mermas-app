'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import FinanzasCsvButton from '@/components/FinanzasCsvButton';
import FinanzasSectionShell from '@/components/FinanzasSectionShell';

function eur(n: number) {
  return `${n.toFixed(2)} €`;
}

function FinanzasComprasBody() {
  return (
    <FinanzasSectionShell
      title="Compras"
      description="Gasto validado (neto) frente al compromiso de pedidos en el mismo periodo."
      periodBasePath="/finanzas/compras"
    >
      {({ data, loading }) => (
        <>
          {loading && !data ? <p className="text-sm text-zinc-600">Cargando…</p> : null}

          {data ? (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Gasto validado (neto)</p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-zinc-900">{eur(data.spendValidatedNet)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Albaranes validados, por fecha de entrega</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Compromiso pedidos (neto)</p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-zinc-900">{eur(data.ordersCommitmentNet)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Pedidos enviados/recibidos en el periodo</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Desvío (neto)</p>
                  <p
                    className={[
                      'mt-1 text-2xl font-black tabular-nums',
                      data.deviationOrdersVsDn > 0 ? 'text-amber-700' : data.deviationOrdersVsDn < 0 ? 'text-emerald-700' : 'text-zinc-900',
                    ].join(' ')}
                  >
                    {data.deviationOrdersVsDn >= 0 ? '+' : ''}
                    {eur(data.deviationOrdersVsDn)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">Pedidos − albaranes validados</p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-900">Albaranes validados en el periodo</h2>
                    <p className="text-xs text-zinc-500">{data.validatedNotesRows.length} documento(s)</p>
                  </div>
                  <FinanzasCsvButton
                    filename={`finanzas-compras_${data.periodFrom}_${data.periodTo}.csv`}
                    columns={[
                      { key: 'deliveryNoteNumber', header: 'Num_albaran' },
                      { key: 'supplierName', header: 'Proveedor' },
                      { key: 'imputationDate', header: 'Imputacion' },
                      { key: 'net', header: 'Neto_eur' },
                      { key: 'gross', header: 'Total_eur' },
                      { key: 'relatedOrderId', header: 'Pedido_vinculado_id' },
                    ]}
                    rows={data.validatedNotesRows.map((row) => ({
                      deliveryNoteNumber: row.deliveryNoteNumber || row.id,
                      supplierName: row.supplierName,
                      imputationDate: row.imputationDate,
                      net: row.net,
                      gross: row.gross,
                      relatedOrderId: row.relatedOrderId ?? '',
                    }))}
                    disabled={data.validatedNotesRows.length === 0}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600">
                      <tr>
                        <th className="px-4 py-2">Nº albarán</th>
                        <th className="px-4 py-2">Proveedor</th>
                        <th className="px-4 py-2">Imputación</th>
                        <th className="px-4 py-2 text-right">Neto</th>
                        <th className="px-4 py-2 text-right">Total</th>
                        <th className="px-4 py-2">Pedido vinc.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.validatedNotesRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                            No hay albaranes validados en este periodo.
                          </td>
                        </tr>
                      ) : (
                        data.validatedNotesRows.map((row) => (
                          <tr key={row.id} className="border-t border-zinc-100">
                            <td className="px-4 py-2 font-medium text-zinc-900">
                              <Link href={`/pedidos/albaranes/${row.id}`} className="text-[#B91C1C] underline-offset-2 hover:underline">
                                {row.deliveryNoteNumber || row.id.slice(0, 8)}
                              </Link>
                            </td>
                            <td className="px-4 py-2 text-zinc-700">{row.supplierName}</td>
                            <td className="px-4 py-2 tabular-nums text-zinc-600">{row.imputationDate}</td>
                            <td className="px-4 py-2 text-right tabular-nums font-semibold text-zinc-900">{eur(row.net)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-zinc-600">{eur(row.gross)}</td>
                            <td className="px-4 py-2">
                              {row.relatedOrderId ? (
                                <span className="font-mono text-[11px] text-zinc-600" title={row.relatedOrderId}>
                                  {row.relatedOrderId.slice(0, 8)}…
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </FinanzasSectionShell>
  );
}

export default function FinanzasComprasPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-600">Cargando…</p>
        </section>
      }
    >
      <FinanzasComprasBody />
    </Suspense>
  );
}
