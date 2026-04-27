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
    'max-w-[min(90vw,17rem)]',
    'sm:max-w-[min(86vw,18rem)]',
    'md:max-w-[min(52vw,12rem)]',
    'lg:max-w-[11rem]',
    'xl:max-w-[11.5rem]',
    '2xl:max-w-[12rem]',
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
  /** Menú lateral: compacto, centrado, sin fondo; object-fit compensa márgenes internos del SVG. */
  sidebar: [
    'mx-auto block h-auto w-[75%] max-w-[220px] min-w-0',
    'object-contain object-center bg-transparent p-0',
    'ring-0 outline-none',
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
      className={[v, 'select-none', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
