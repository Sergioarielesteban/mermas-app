'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';
import { printRecipePDF, type RecipePrintPayload } from '@/lib/escandallo-recipe-print-pdf';

type RecipePrintPDFButtonProps = {
  payload: RecipePrintPayload;
  disabled?: boolean;
  className?: string;
};

export default function RecipePrintPDFButton({ payload, disabled = false, className }: RecipePrintPDFButtonProps) {
  const [printing, setPrinting] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled || printing}
      onClick={async () => {
        setPrinting(true);
        try {
          await printRecipePDF(payload);
        } finally {
          setPrinting(false);
        }
      }}
      className={
        className ??
        'inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[rgba(10,9,8,0.08)] bg-white text-[9px] font-semibold text-[#0A0908] disabled:opacity-50'
      }
    >
      <Printer className="h-3.5 w-3.5" />
      {printing ? 'Generando…' : 'Imprimir'}
    </button>
  );
}
