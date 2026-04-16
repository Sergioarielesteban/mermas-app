'use client';

import Link from 'next/link';
import React from 'react';

type ShellProps = {
  children: React.ReactNode;
  /** Ancho máximo del contenido (Tailwind). */
  maxWidthClass?: string;
  className?: string;
  /** Clases del contenedor interior (espaciado vertical entre hijos). */
  contentClassName?: string;
};

/**
 * Fondo y ancho coherentes con Oído Chef / centros de mando: gradiente suave y columna centrada.
 */
export function ModulePageShell({
  children,
  maxWidthClass = 'max-w-3xl',
  className = '',
  contentClassName = 'space-y-5',
}: ShellProps) {
  return (
    <div
      className={[
        'min-h-[100dvh] bg-gradient-to-b from-zinc-100 via-zinc-50 to-white',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={['mx-auto w-full px-4 pb-12 pt-1 sm:px-5', maxWidthClass, contentClassName]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </div>
  );
}

type BackLinkProps = {
  href?: string;
  label?: string;
};

/** Enlace tipo píldora hacia panel u otra ruta (misma línea que Oído Chef standalone). */
export function ModuleBackLink({ href = '/panel', label = 'Panel' }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200/90 bg-white/90 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-600 shadow-sm backdrop-blur-sm ring-1 ring-black/[0.04] transition hover:border-zinc-300 hover:text-zinc-900"
    >
      ← {label}
    </Link>
  );
}
