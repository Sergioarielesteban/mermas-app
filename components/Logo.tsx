import React from 'react';

export type LogoVariant = 'header' | 'hero' | 'login' | 'banner' | 'footer' | 'inline';

/**
 * SVG ~cuadrado: la **altura** escala con viewport (`vw` / `vmin`) con tope en `rem`
 * para legible en móvil y controlado en escritorio.
 */
const variantClassName: Record<LogoVariant, string> = {
  header: 'h-10 w-auto max-w-[min(240px,72vw)] object-contain object-left',
  /**
   * Landing hero: muy grande (~×3 respecto al bloque 88vw/22rem/48dvh).
   * `90dvh` sustituye al antiguo `48dvh` para no “encoger” el cuadrado en altura.
   */
  hero: [
    'mx-auto block w-auto object-contain object-center',
    'h-[min(100vw,90dvh,68rem)]',
    'sm:h-[min(98vw,88dvh,64rem)]',
    'md:h-[min(92vw,85dvh,58rem)]',
    'lg:h-[min(78vw,80dvh,52rem)]',
    'xl:h-[min(68vw,75dvh,48rem)]',
    '2xl:h-[min(60vw,72dvh,44rem)]',
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
