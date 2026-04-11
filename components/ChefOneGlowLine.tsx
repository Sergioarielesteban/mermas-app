import React from 'react';

type Props = { className?: string };

/** Línea fina con centro #D32F2F y extremos difuminados + halo (estilo banner panel). */
export default function ChefOneGlowLine({ className = '' }: Props) {
  return (
    <span
      className={[
        'mx-auto block h-px min-h-px shrink-0 rounded-full',
        'bg-gradient-to-r from-transparent via-[#D32F2F] to-transparent',
        'shadow-[0_0_10px_2px_rgba(211,47,47,0.4),0_0_4px_rgba(239,68,68,0.25)]',
        className,
      ].join(' ')}
      aria-hidden
    />
  );
}
