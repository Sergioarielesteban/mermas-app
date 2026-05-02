'use client';

import { Download } from 'lucide-react';
import { downloadCsvFile } from '@/lib/csv-download';

type Props = {
  filename: string;
  columns: { key: string; header: string }[];
  rows: Record<string, string | number | null | undefined>[];
  label?: string;
  disabled?: boolean;
};

export default function FinanzasCsvButton({ filename, columns, rows, label = 'Descargar CSV', disabled }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || rows.length === 0}
      onClick={() => downloadCsvFile(filename, columns, rows)}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
    >
      <Download className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}
