import React from 'react';

export type LogoVariant = 'header' | 'hero' | 'login' | 'banner' | 'footer' | 'inline';

/**
 * El SVG oficial es ~cuadrado (viewBox amplio); limitar sobre todo la **altura** evita
 * que en móvil/tablet ocupe medio viewport. Siempre `/logo-chef-one.svg`.
 */
const variantClassName: Record<LogoVariant, string> = {
  header: 'h-10 w-auto max-w-[min(240px,72vw)] object-contain object-left',
  hero: [
    'mx-auto block h-auto w-auto max-w-full object-contain object-center',
    'max-h-[4.25rem] max-w-[min(88vw,14rem)]',
    'sm:max-h-[4.75rem] sm:max-w-[15rem]',
    'md:max-h-[5.25rem] md:max-w-[16rem]',
    'lg:max-h-24 lg:max-w-[17rem]',
    'xl:max-h-[6.25rem] xl:max-w-[18rem]',
    '2xl:max-h-[6.5rem] 2xl:max-w-[19rem]',
  ].join(' '),
  login: [
    'mx-auto block h-auto w-auto max-w-full object-contain object-center',
    'max-h-[3.75rem] max-w-[min(88vw,13rem)]',
    'sm:max-h-[4.25rem] sm:max-w-[14rem]',
    'md:max-h-20 md:max-w-[15rem]',
  ].join(' '),
  banner: 'mx-auto h-7 w-auto max-w-[min(200px,70vw)] object-contain sm:h-8',
  footer: 'mx-auto h-8 w-auto max-w-[200px] object-contain sm:h-9',
  inline: [
    'mx-auto block h-auto w-auto max-w-full object-contain object-center',
    'max-h-14 max-w-[min(85vw,200px)]',
    'sm:max-h-16 sm:max-w-[220px]',
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
