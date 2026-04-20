import React from 'react';

export type LogoVariant = 'header' | 'hero' | 'login' | 'banner' | 'footer' | 'inline';

/**
 * SVG ~cuadrado: la **altura** escala con viewport (`vw` / `vmin`) con tope en `rem`
 * para legible en móvil y controlado en escritorio.
 */
const variantClassName: Record<LogoVariant, string> = {
  header: 'h-10 w-auto max-w-[min(240px,72vw)] object-contain object-left',
  /** Landing hero: ~×2 lineal respecto al tamaño anterior (≈×4 área); tope dvh en landscape. */
  hero: [
    'mx-auto block w-auto max-h-[min(22rem,48dvh)] object-contain object-center',
    'h-[min(88vw,22rem)]',
    'sm:h-[min(78vw,20rem)] sm:max-h-[min(20rem,50dvh)]',
    'md:h-[min(64vw,18rem)] md:max-h-[min(18rem,52dvh)]',
    'lg:h-[min(52vw,16rem)] lg:max-h-[min(16rem,54dvh)]',
    'xl:h-[min(44vw,14rem)] xl:max-h-[min(14rem,56dvh)]',
    '2xl:h-[min(38vw,13rem)] 2xl:max-h-[min(13rem,58dvh)]',
  ].join(' '),
  login: [
    'mx-auto block w-auto object-contain object-center',
    'h-[min(38vw,10rem)]',
    'sm:h-[min(34vw,9.5rem)]',
    'md:h-[min(30vw,9rem)]',
    'lg:h-[min(26vw,8.75rem)]',
  ].join(' '),
  banner: 'mx-auto h-7 w-auto max-w-[min(200px,70vw)] object-contain sm:h-8',
  footer: 'mx-auto h-8 w-auto max-w-[200px] object-contain sm:h-9',
  inline: [
    'mx-auto block w-auto object-contain object-center',
    'h-[min(36vmin,7.75rem)]',
    'sm:h-[min(34vmin,7.5rem)]',
    'md:h-[min(30vmin,7.25rem)]',
  ].join(' '),
};

export type LogoProps = {
  variant?: LogoVariant;
  className?: string;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>;

export default function Logo({ variant = 'inline', className = '', alt = 'Chef-One', ...rest }: LogoProps) {
  const v = variantClassName[variant];

  return (
    <img
      src="/logo-chef-one.svg"
      alt={alt}
      width={375}
      height={375}
      decoding="async"
      className={[v, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
