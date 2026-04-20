'use client';

import React, { useEffect, useState } from 'react';

export type LogoVariant = 'header' | 'hero' | 'login' | 'banner' | 'footer' | 'inline';

const variantClassName: Record<LogoVariant, string> = {
  header: 'h-10 w-auto max-w-[min(240px,72vw)] object-contain object-left',
  /**
   * Hero landing: protagonista real. Escala por ancho + tope de altura (SVG cuadrado o PNG apaisado).
   * Coloca `/public/logo-chef-one.png` (transparente); si no existe, se usa SVG vía fallback en `preferRaster`.
   */
  hero: [
    'mx-auto block h-auto w-full object-contain object-center',
    'max-w-[min(94vw,28rem)]',
    'max-h-[min(48svh,15rem)]',
    'sm:max-w-[min(92vw,38rem)] sm:max-h-[min(44svh,19rem)]',
    'md:max-w-[min(90vw,46rem)] md:max-h-[min(40svh,22rem)]',
    'lg:max-w-[min(88vw,54rem)] lg:max-h-[min(36svh,26rem)]',
    'xl:max-w-[min(86vw,62rem)] xl:max-h-[min(34svh,30rem)]',
    '2xl:max-w-[min(84vw,70rem)] 2xl:max-h-[min(32svh,34rem)]',
  ].join(' '),
  login: 'h-20 w-auto max-w-[min(320px,90vw)] object-contain sm:h-[88px]',
  banner: 'mx-auto h-7 w-auto max-w-[min(200px,70vw)] object-contain sm:h-8',
  footer: 'mx-auto h-8 w-auto max-w-[200px] object-contain sm:h-9',
  inline: 'h-11 w-auto max-w-[200px] object-contain sm:h-12',
};

export type LogoProps = {
  variant?: LogoVariant;
  className?: string;
  /** En hero: intenta PNG transparente primero; si falla, SVG. */
  preferRaster?: boolean;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>;

/**
 * Logo oficial: por defecto `/logo-chef-one.svg`. Con `preferRaster` (hero) intenta `/logo-chef-one.png`.
 */
export default function Logo({
  variant = 'inline',
  className = '',
  alt = 'Chef-One',
  preferRaster = false,
  ...rest
}: LogoProps) {
  const v = variantClassName[variant];
  const [src, setSrc] = useState(
    () => (preferRaster && variant === 'hero' ? '/logo-chef-one.png' : '/logo-chef-one.svg'),
  );

  useEffect(() => {
    if (preferRaster && variant === 'hero') {
      setSrc('/logo-chef-one.png');
    } else {
      setSrc('/logo-chef-one.svg');
    }
  }, [preferRaster, variant]);

  const onError = () => {
    if (src.endsWith('.png')) setSrc('/logo-chef-one.svg');
  };

  return (
    <img
      src={src}
      alt={alt}
      width={variant === 'hero' ? 960 : 375}
      height={variant === 'hero' ? 320 : 375}
      decoding="async"
      className={[v, className].filter(Boolean).join(' ')}
      onError={onError}
      {...rest}
    />
  );
}
