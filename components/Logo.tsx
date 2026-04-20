'use client';

import React, { useEffect, useState } from 'react';

export type LogoVariant = 'header' | 'hero' | 'login' | 'banner' | 'footer' | 'inline';

const variantClassName: Record<LogoVariant, string> = {
  header: 'h-10 w-auto max-w-[min(240px,72vw)] object-contain object-left',
  /**
   * Landing hero: solo ancho fluido (SVG 1:1 escala nítido; sin max-h que lo encoja).
   * Con `preferRaster` y `/logo-chef-one.png` disponible, se cambia tras comprobar con HEAD.
   */
  hero: [
    'mx-auto block h-auto max-w-full object-contain object-center',
    'w-[min(94vw,38rem)]',
    'sm:w-[min(92vw,46rem)]',
    'md:w-[min(90vw,54rem)]',
    'lg:w-[min(88vw,62rem)]',
    'xl:w-[min(86vw,70rem)]',
    '2xl:w-[min(84vw,76rem)]',
  ].join(' '),
  login: [
    'mx-auto block h-auto max-w-full object-contain object-center',
    'w-[min(92vw,24rem)]',
    'sm:w-[min(88vw,28rem)]',
    'md:w-[30rem]',
  ].join(' '),
  banner: 'mx-auto h-7 w-auto max-w-[min(200px,70vw)] object-contain sm:h-8',
  footer: 'mx-auto h-8 w-auto max-w-[200px] object-contain sm:h-9',
  /** Drawer / compactos */
  inline: [
    'mx-auto block h-auto max-w-[85%] object-contain object-center',
    'w-[min(72vw,220px)]',
    'sm:w-[min(68vw,260px)]',
  ].join(' '),
};

export type LogoProps = {
  variant?: LogoVariant;
  className?: string;
  /** Si hay `/logo-chef-one.png` en public, úsalo en hero (comprobación HEAD; primera pintura siempre SVG). */
  preferRaster?: boolean;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>;

/**
 * Logo oficial. Siempre hay `/logo-chef-one.svg`; PNG opcional en hero si existe.
 */
export default function Logo({
  variant = 'inline',
  className = '',
  alt = 'Chef-One',
  preferRaster = false,
  ...rest
}: LogoProps) {
  const v = variantClassName[variant];
  const [src, setSrc] = useState('/logo-chef-one.svg');

  useEffect(() => {
    if (variant !== 'hero' || !preferRaster) {
      setSrc('/logo-chef-one.svg');
      return;
    }
    const ac = new AbortController();
    void fetch('/logo-chef-one.png', { method: 'HEAD', signal: ac.signal })
      .then((r) => {
        if (r.ok) setSrc('/logo-chef-one.png');
        else setSrc('/logo-chef-one.svg');
      })
      .catch(() => setSrc('/logo-chef-one.svg'));
    return () => ac.abort();
  }, [variant, preferRaster]);

  const onError = () => {
    if (src.endsWith('.png')) setSrc('/logo-chef-one.svg');
  };

  return (
    <img
      src={src}
      alt={alt}
      width={variant === 'hero' ? 960 : variant === 'login' ? 640 : 375}
      height={variant === 'hero' ? 320 : variant === 'login' ? 240 : 375}
      decoding="async"
      className={[v, className].filter(Boolean).join(' ')}
      onError={onError}
      {...rest}
    />
  );
}
