'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import FinanzasCsvButton from '@/components/FinanzasCsvButton';
import FinanzasSectionShell from '@/components/FinanzasSectionShell';

function eur(n: number) {
  return `${n.toFixed(2)} €`;
}

function FinanzasMermasBody() {
  return (
    <FinanzasSectionShell
      title="Mermas"
      description="Impacto de mermas en el periodo (fecha de registro) frente al gasto neto validado."
      periodBasePath="/finanzas/mermas"
    >
      {({ data, loading }) => (
        <>
          {loading && !data ? <p className="text-sm text-zinc-600">Cargando…</p> : null}

          {data ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Mermas en el periodo</p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-zinc-900">{eur(data.mermaEur)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {data.spendValidatedNet > 0
                      ? `${data.mermaPctOfSpend.toFixed(1)}% del gasto neto validado`
                      : 'Sin gasto validado en el periodo para comparar'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FinanzasCsvButton
                    filename={`finanzas-mermas_${data.periodFrom}_${data.periodTo}.csv`}
                    columns={[
                      { key: 'label', header: 'Concepto' },
                      { key: 'eur', header: 'Importe_eur' },
                      { key: 'pctOfSpend', header: 'Pct_sobre_compra_neta' },
                    ]}
                    rows={data.topMermas.map((row) => ({
                      label: row.label,
                      eur: row.eur,
                      pctOfSpend: row.pctOfSpend,
                    }))}
                    disabled={data.topMermas.length === 0}
                  />
                  <Link
                    href="/"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#D32F2F] px-4 text-sm font-bold text-white"
                  >
                    Ir a registrar mermas
                  </Link>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-100 px-4 py-3">
                  <h2 className="text-sm font-bold text-zinc-900">Por producto / causa</h2>
                </div>
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600">
                    <tr>
                      <th className="px-4 py-2">Concepto</th>
                      <th className="px-4 py-2 text-right">Importe</th>
                      <th className="px-4 py-2 text-right">% gasto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topMermas.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                          No hay mermas registradas en este periodo.
                        </td>
                      </tr>
                    ) : (
                      data.topMermas.map((row) => (
                        <tr key={row.key} className="border-t border-zinc-100">
                          <td className="px-4 py-2 font-medium text-zinc-900">{row.label}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-zinc-900">{eur(row.eur)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-zinc-600">{row.pctOfSpend.toFixed(1)}%</td>
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

export default function FinanzasMermasPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-600">Cargando…</p>
        </section>
      }
    >
      <FinanzasMermasBody />
    </Suspense>
  );
}
