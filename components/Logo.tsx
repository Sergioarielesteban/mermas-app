import React from 'react';

export type LogoVariant = 'header' | 'hero' | 'login' | 'banner' | 'footer' | 'inline' | 'sidebar';

/**
 * SVG ~cuadrado: la **altura** escala con viewport (`vw` / `vmin`) con tope en `rem`
 * para legible en móvil y controlado en escritorio.
 */
const variantClassName: Record<LogoVariant, string> = {
  header: 'h-10 w-auto max-w-[min(240px,72vw)] object-contain object-left',
  /** Hero: legible en móvil, moderado en escritorio; ancho máximo (SVG cuadrado ⇒ h auto). */
  hero: [
    'mx-auto block h-auto w-auto border-0 bg-transparent object-contain object-center outline-none ring-0',
    'max-w-[min(96vw,24rem)]',
    'sm:max-w-[min(90vw,26rem)]',
    'md:max-w-[min(64vw,24rem)]',
    'lg:max-w-[24rem]',
    'xl:max-w-[25rem]',
    '2xl:max-w-[26rem]',
  ].join(' '),
  login: [
    'mx-auto block w-auto object-contain object-center',
    'h-[min(96vw,33rem)]',
    'sm:h-[min(78vw,27rem)]',
    'md:h-[min(56vw,21rem)]',
    'lg:h-[min(42vw,16.5rem)]',
  ].join(' '),
  banner: 'mx-auto h-7 w-auto max-w-[min(200px,70vw)] object-contain sm:h-8',
  footer: 'mx-auto h-8 w-auto max-w-[200px] object-contain sm:h-9',
  inline: [
    'mx-auto block w-auto object-contain object-center',
    'h-[min(36vmin,7.75rem)]',
    'sm:h-[min(34vmin,7.5rem)]',
    'md:h-[min(30vmin,7.25rem)]',
  ].join(' '),
  /** Menú lateral: logo-chef-one-menu.svg (viewBox al wordmark); ancho 75% hasta 220px, alto acotado. */
  sidebar: [
    'mx-auto block h-auto min-h-0 min-w-0 max-h-[70px] w-[75%] max-w-[220px]',
    'object-contain object-center bg-transparent p-0 m-0',
    'ring-0 outline-none',
  ].join(' '),
};

export type LogoProps = {
  variant?: LogoVariant;
  className?: string;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>;

export default function Logo({ variant = 'inline', className = '', alt = 'Chef-One', ...rest }: LogoProps) {
  const v = variantClassName[variant];
  const isSidebar = variant === 'sidebar';
  const useWordmarkCropped = variant === 'sidebar' || variant === 'hero';
  /** Wordmark recortado (sin bandas vacías del canvas 375²) para el menú lateral. */
  const src = useWordmarkCropped ? '/logo-chef-one-menu.svg' : '/logo-chef-one.svg';
  const w = useWordmarkCropped ? 272 : 375;
  const h = useWordmarkCropped ? 52 : 375;

  return (
    <img
      src={src}
      alt={alt}
      width={w}
      height={h}
      decoding="async"
      className={[v, 'select-none', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
