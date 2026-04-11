import React from 'react';

type Props = { className?: string };

/** Línea roja con degradado y glow, como el hero del panel. */
export default function ChefOneGlowLine({ className = '' }: Props) {
  return (
    <span
      className={`h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#EF4444] to-transparent shadow-[0_0_14px_5px_rgba(211,47,47,0.55)] ${className}`}
      aria-hidden
    />
  );
}
