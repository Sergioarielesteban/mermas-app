'use client';

import Link from 'next/link';
import { Bot, ExternalLink, Sparkles } from 'lucide-react';
import type { OidoChefPremiumResult } from '@/lib/oido-chef-premium';

type Props = {
  result: OidoChefPremiumResult;
};

function metricToneClass(tone?: 'neutral' | 'good' | 'warn') {
  if (tone === 'good') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (tone === 'warn') return 'bg-amber-50 text-amber-900 ring-amber-200';
  return 'bg-zinc-50 text-zinc-700 ring-zinc-200';
}

export default function OidoChefPremiumResult({ result }: Props) {
  return (
    <section className="space-y-3 rounded-2xl border border-[#D32F2F]/20 bg-gradient-to-b from-white to-zinc-50/60 p-4 shadow-[0_12px_28px_-16px_rgba(15,23,42,0.28)] ring-1 ring-zinc-900/5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#D32F2F]/10 text-[#D32F2F]">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Respuesta premium</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">“{result.question}”</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
        <p className="text-sm font-semibold leading-snug text-zinc-900">{result.summary}</p>
      </div>

      {result.metrics && result.metrics.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {result.metrics.map((metric) => (
            <article key={`${metric.label}-${metric.value}`} className={['rounded-xl px-3 py-2 ring-1', metricToneClass(metric.tone)].join(' ')}>
              <p className="text-[10px] font-black uppercase tracking-wide">{metric.label}</p>
              <p className="mt-1 text-base font-black">{metric.value}</p>
            </article>
          ))}
        </div>
      ) : null}

      {result.rows && result.rows.length > 0 && result.columns ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white ring-1 ring-zinc-100">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/80">
                  {result.columns.map((col) => (
                    <th
                      key={col.key}
                      className={['px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-500', col.align === 'right' ? 'text-right' : 'text-left'].join(' ')}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, idx) => (
                  <tr key={`row-${idx}`} className="border-b border-zinc-100 last:border-b-0">
                    {result.columns!.map((col) => (
                      <td
                        key={`${idx}-${col.key}`}
                        className={['px-3 py-2 text-xs text-zinc-700', col.align === 'right' ? 'text-right font-semibold tabular-nums' : 'text-left'].join(' ')}
                      >
                        {row[col.key] ?? '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : result.emptyMessage ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
          {result.emptyMessage}
        </div>
      ) : null}

      {result.actions && result.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {result.actions.map((action) => (
            <Link
              key={`${action.href}-${action.label}`}
              href={action.href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}

      <p className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
        <Sparkles className="h-3.5 w-3.5 text-[#D32F2F]" />
        Copiloto operativo: resumen + datos reales + accesos directos.
      </p>
    </section>
  );
}
