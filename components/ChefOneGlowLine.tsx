'use client';

import React from 'react';

type Props = { className?: string };

/**
 * Línea estilo panel: rojo sangre brillante, más intensa en el centro y
 * desvanecida en los extremos, con halo suave (no trazo recto plano).
 */
export default function ChefOneGlowLine({ className = '' }: Props) {
  const uid = React.useId().replace(/:/g, '');

  return (
    <svg
      className={`mx-auto block h-[26px] w-full shrink-0 ${className}`}
      viewBox="0 0 320 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`${uid}-stem`} x1="0" y1="0" x2="320" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B71C1C" stopOpacity="0" />
          <stop offset="0.34" stopColor="#E53935" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#FF1744" stopOpacity="1" />
          <stop offset="0.66" stopColor="#E53935" stopOpacity="0.85" />
          <stop offset="1" stopColor="#B71C1C" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-halo`} x="-35%" y="-120%" width="170%" height="340%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Trazo ligeramente curvo: más “cuerpo” al centro, puntas finas por el degradado */}
      <path
        d="M 6 13 Q 88 10.5 160 13 Q 232 15.5 314 13"
        stroke={`url(#${uid}-stem)`}
        strokeWidth="3.25"
        strokeLinecap="round"
        fill="none"
        filter={`url(#${uid}-halo)`}
      />
    </svg>
  );
}
