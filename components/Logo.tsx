import React from 'react';

export type LogoVariant = 'header' | 'hero' | 'login' | 'banner' | 'footer' | 'inline';

const variantClassName: Record<LogoVariant, string> = {
  /** Barra superior / cabeceras ~40px alto */
  header: 'h-10 w-auto max-w-[min(240px,72vw)] object-contain object-left',
  /** Home hero 80–120px alto */
  hero: 'h-[88px] w-auto max-w-full object-contain sm:h-[100px] md:h-[120px]',
  /** Login y splash ~80px */
  login: 'h-20 w-auto max-w-[min(320px,90vw)] object-contain sm:h-[88px]',
  /** Banners oscuros (panel, inventario): discreto */
  banner: 'mx-auto h-7 w-auto max-w-[min(200px,70vw)] object-contain sm:h-8',
  /** Pie marketing */
  footer: 'mx-auto h-8 w-auto max-w-[200px] object-contain sm:h-9',
  /** Drawer y usos genéricos */
  inline: 'h-11 w-auto max-w-[200px] object-contain sm:h-12',
};

export type LogoProps = {
  variant?: LogoVariant;
  className?: string;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>;

/**
 * Logo oficial único (`/logo-chef-one.svg`, vectorial con transparencia).
 * Cuando tengas un PNG exportado con canal alfa, sustituye el archivo y el `src` aquí.
 */
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
