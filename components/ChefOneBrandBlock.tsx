import React from 'react';

type Props = {
  /** Ancho máximo del bloque (logo cuadrado) */
  className?: string;
};

/**
 * Logo Chef-One (SVG con fondo negro, serif granate y línea roja) para splash, login y marca compacta.
 */
export default function ChefOneBrandBlock({ className = '' }: Props) {
  return (
    <img
      src="/logo-chef-one.svg"
      alt="Chef-One"
      className={['h-auto w-full max-w-[min(16rem,78vw)] select-none', className].filter(Boolean).join(' ')}
      width={320}
      height={320}
      decoding="async"
    />
  );
}
