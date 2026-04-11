import React from 'react';

type Props = { className?: string };

/** Línea roja sólida (#D32F2F), sin degradado ni puntas transparentes. */
export default function ChefOneGlowLine({ className = '' }: Props) {
  return (
    <span
      className={`mx-auto block h-[2px] shrink-0 rounded-[1px] bg-[#D32F2F] ${className}`}
      aria-hidden
    />
  );
}
