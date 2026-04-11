import React from 'react';

type Props = { className?: string };

/** Línea roja sólida y nítida (sin degradado ni glow). */
export default function ChefOneGlowLine({ className = '' }: Props) {
  return <span className={`block h-[2px] shrink-0 bg-[#D32F2F] ${className}`} aria-hidden />;
}
