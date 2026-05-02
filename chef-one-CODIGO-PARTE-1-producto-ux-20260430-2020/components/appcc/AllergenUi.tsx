'use client';

import React from 'react';
import {
  REVIEW_STATUS_LABEL,
  presenceLabel,
  reviewStatusColor,
  type AllergenMasterRow,
  type AllergenPresenceType,
  type RecipeReviewStatus,
} from '@/lib/appcc-allergens-supabase';

export function ReviewStatusBadge({ status }: { status: RecipeReviewStatus }) {
  return (
    <span className={['rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1', reviewStatusColor(status)].join(' ')}>
      {REVIEW_STATUS_LABEL[status]}
    </span>
  );
}

export function PresenceBadge({ presence }: { presence: AllergenPresenceType }) {
  const cls =
    presence === 'contains'
      ? 'bg-red-50 text-red-800 ring-red-200'
      : presence === 'traces'
        ? 'bg-amber-50 text-amber-900 ring-amber-200'
        : 'bg-zinc-100 text-zinc-700 ring-zinc-200';
  return (
    <span className={['rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1', cls].join(' ')}>
      {presenceLabel(presence)}
    </span>
  );
}

export function AllergenChip({
  allergen,
  selected,
  onClick,
}: {
  allergen: AllergenMasterRow;
  selected: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold ring-1 transition',
        selected
          ? 'bg-[#D32F2F]/10 text-[#B91C1C] ring-[#D32F2F]/30'
          : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50',
      ].join(' ')}
    >
      <span aria-hidden>{allergen.icon}</span>
      <span>{allergen.name}</span>
    </button>
  );
}

export function SmallDateLabel({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-xs text-zinc-400">Sin revisar</span>;
  return (
    <span className="text-xs text-zinc-500">
      {new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
    </span>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">{children}</p>;
}
