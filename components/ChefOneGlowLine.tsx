import React from 'react';

type Props = { className?: string };

/** Línea rojo sangre sólida (#D32F2F), sin degradado ni blur. */
export default function ChefOneGlowLine({ className = '' }: Props) {
  return (
    <span
      className={`block h-[2.5px] shrink-0 rounded-[1px] bg-[#D32F2F] ${className}`}
      aria-hidden
    />
  );
}
