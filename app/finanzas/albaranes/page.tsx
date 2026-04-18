'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import FinanzasCsvButton from '@/components/FinanzasCsvButton';
import FinanzasSectionShell from '@/components/FinanzasSectionShell';
import { fetchDeliveryNotesForFinanzas, type DeliveryNote } from '@/lib/delivery-notes-supabase';
import {
  deliveryNoteGrossAmount,
  deliveryNoteImputationYmd,
  deliveryNoteNetAmount,
  finanzasPeriodRanges,
  type FinanzasDashboardData,
  type FinanzasPeriodPreset,
} from '@/lib/finanzas-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';

function eur(n: number) {
  return `${n.toFixed(2)} €`;
}

function statusLabel(s: DeliveryNote['status']): string {
  const m: Record<DeliveryNote['status'], string> = {
    draft: 'Borrador',
    ocr_read: 'OCR',
    pending_review: 'Revisión',
    validated: 'Validado',
    with_incidents: 'Incidencias',
    archived: 'Archivado',
  };
  return m[s] ?? s;
}

function FinanzasAlbaranesTable({
  rows,
  emptyMessage,
}: {
  rows: DeliveryNote[];
  emptyMessage: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600">
          <tr>
            <th className="px-4 py-2">Nº</th>
            <th className="px-4 py-2">Proveedor</th>
            <th className="px-4 py-2">Estado</th>
            <th className="px-4 py-2">Imputación</th>
            <th className="px-4 py-2 text-right">Neto</th>
            <th className="px-4 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((n) => {
              const imp = deliveryNoteImputationYmd(n);
              return (
                <tr key={n.id} className="border-t border-zinc-100">
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    <Link href={`/pedidos/albaranes/${n.id}`} className="text-[#B91C1C] underline-offset-2 hover:underline">
                      {n.deliveryNoteNumber || n.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-700">{n.supplierName}</td>
                  <td className="px-4 py-2 text-zinc-600">{statusLabel(n.status)}</td>
                  <td className="px-4 py-2 tabular-nums text-zinc-600">{imp}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-zinc-900">{eur(deliveryNoteNetAmount(n))}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-600">{eur(deliveryNoteGrossAmount(n))}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function FinanzasAlbaranesBody() {
  const sp = useSearchParams();
  const estado = sp.get('estado');
  const pendienteVista = estado === 'pendiente';

  return (
    <FinanzasSectionShell
      title="Albaranes"
      description="Documentos filtrados por fecha de imputación (entrega o creación). Validados y pendientes de validar."
      periodBasePath="/finanzas/albaranes"
    >
      {({ data, loading, localId, preset }) => (
        <FinanzasAlbaranesInner
          dashboardLoading={loading}
          data={data}
          localId={localId}
          preset={preset}
          pendienteVista={pendienteVista}
        />
      )}
    </FinanzasSectionShell>
  );
}

export default function FinanzasAlbaranesPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-600">Cargando…</p>
        </section>
      }
    >
      <FinanzasAlbaranesBody />
    </Suspense>
  );
}

function FinanzasAlbaranesInner({
  dashboardLoading,
  data,
  localId,
  preset,
  pendienteVista,
}: {
  dashboardLoading: boolean;
  data: FinanzasDashboardData | null;
  localId: string;
  preset: FinanzasPeriodPreset;
  pendienteVista: boolean;
}) {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const { from, to } = finanzasPeriodRanges(preset).current;

  useEffect(() => {
    if (!data?.hasDeliveryNotesTable) {
      setNotes([]);
      setNotesError(null);
      setNotesLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setNotesLoading(true);
      setNotesError(null);
      try {
        const n = await fetchDeliveryNotesForFinanzas(getSupabaseClient()!, localId);
        if (!cancelled) setNotes(n);
      } catch (e: unknown) {
        if (!cancelled) {
          setNotes([]);
          setNotesError(e instanceof Error ? e.message : 'Error al cargar albaranes.');
        }
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, localId]);

  const { validados, pendientes } = useMemo(() => {
    const validados: DeliveryNote[] = [];
    const pendientes: DeliveryNote[] = [];
    for (const n of notes) {
      const d = deliveryNoteImputationYmd(n);
      if (d < from || d > to) continue;
      if (n.status === 'validated') validados.push(n);
      else if (n.status !== 'archived') pendientes.push(n);
    }
    validados.sort((a, b) => deliveryNoteImputationYmd(b).localeCompare(deliveryNoteImputationYmd(a)));
    pendientes.sort((a, b) => deliveryNoteImputationYmd(b).localeCompare(deliveryNoteImputationYmd(a)));
    return { validados, pendientes };
  }, [notes, from, to]);

  const list = pendienteVista ? pendientes : validados;

  if (dashboardLoading && !data) {
    return <p className="text-sm text-zinc-600">Cargando…</p>;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          <Link
            href={`/finanzas/albaranes?p=${preset}`}
            scroll={false}
            className={[
              'rounded-lg px-3 py-2 text-xs font-bold sm:text-sm',
              !pendienteVista ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-700',
            ].join(' ')}
          >
            Validados en periodo
          </Link>
          <Link
            href={`/finanzas/albaranes?estado=pendiente&p=${preset}`}
            scroll={false}
            className={[
              'rounded-lg px-3 py-2 text-xs font-bold sm:text-sm',
              pendienteVista ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-700',
            ].join(' ')}
          >
            Pendientes en periodo
          </Link>
        </div>
        <FinanzasCsvButton
          filename={`finanzas-albaranes_${pendienteVista ? 'pendiente' : 'validado'}_${data.periodFrom}_${data.periodTo}.csv`}
          columns={[
            { key: 'id', header: 'Id' },
            { key: 'num', header: 'Num_albaran' },
            { key: 'supplier', header: 'Proveedor' },
            { key: 'estado', header: 'Estado' },
            { key: 'imputacion', header: 'Imputacion' },
            { key: 'neto', header: 'Neto_eur' },
            { key: 'total', header: 'Total_eur' },
          ]}
          rows={list.map((n) => ({
            id: n.id,
            num: n.deliveryNoteNumber || '',
            supplier: n.supplierName,
            estado: statusLabel(n.status),
            imputacion: deliveryNoteImputationYmd(n),
            neto: deliveryNoteNetAmount(n),
            total: deliveryNoteGrossAmount(n),
          }))}
          disabled={list.length === 0}
        />
      </div>

      <p className="text-xs text-zinc-600">
        Periodo {from} — {to}. Pendientes: sin validar ni archivar, con imputación en el rango.
      </p>

      {notesError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{notesError}</div>
      ) : null}

      {notesLoading ? <p className="text-sm text-zinc-600">Cargando albaranes…</p> : null}

      {!notesLoading && data.hasDeliveryNotesTable ? (
        <FinanzasAlbaranesTable
          rows={list}
          emptyMessage={
            pendienteVista ? 'No hay albaranes pendientes de validar en este periodo.' : 'No hay albaranes validados en este periodo.'
          }
        />
      ) : null}

      <p className="text-center text-sm">
        <Link href="/pedidos/albaranes" className="font-semibold text-[#B91C1C] underline-offset-2 hover:underline">
          Gestionar albaranes en Pedidos
        </Link>
      </p>
    </div>
  );
}
