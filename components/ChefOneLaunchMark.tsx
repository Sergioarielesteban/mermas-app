import React from 'react';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

type Props = {
  /** Clases extra para el contenedor de marca. */
  boxClassName?: string;
  imgClassName?: string;
  lineClassName?: string;
};

/**
 * Presentación de marca: logo y línea roja tapered.
 * Misma composición en login, splash y pantalla de carga de sesión.
 */
export default function ChefOneLaunchMark({
  boxClassName = '',
  imgClassName = 'mx-auto block h-[min(38vw,200px)] w-auto max-w-[min(88vw,280px)] select-none object-contain',
  lineClassName = 'mt-5 w-full max-w-[min(85vw,340px)]',
}: Props) {
  return (
    <div className="flex w-full flex-col items-center">
      <div className={boxClassName}>
        <img
          src="/logo-chef-one.svg"
          alt="Chef-One"
          className={imgClassName}
          width={512}
          height={512}
          decoding="async"
        />
      </div>
      <ChefOneGlowLine className={`scale-x-50 ${lineClassName}`} />
    </div>
  );
}
