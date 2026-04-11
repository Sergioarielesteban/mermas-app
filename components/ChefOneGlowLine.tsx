import React from 'react';

type Props = { className?: string };

/** Mismo rojo central #D32F2F; extremos que se afinan (degradado a transparente). */
export const CHEF_ONE_TAPER_LINE_CLASS =
  'block h-[2px] shrink-0 rounded-full bg-[linear-gradient(90deg,transparent_0%,rgba(211,47,47,0.2)_5%,#D32F2F_16%,#D32F2F_84%,rgba(211,47,47,0.2)_95%,transparent_100%)]';

export default function ChefOneGlowLine({ className = '' }: Props) {
  return <span className={`mx-auto ${CHEF_ONE_TAPER_LINE_CLASS} ${className}`} aria-hidden />;
}
