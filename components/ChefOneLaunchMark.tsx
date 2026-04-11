import React from 'react';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

type Props = {
  /** Clases extra en la caja blanca (borde negro). */
  boxClassName?: string;
  imgClassName?: string;
  lineClassName?: string;
};

/**
 * Presentación de marca: caja blanca con borde negro fino, wordmark y línea roja sólida.
 * Misma composición en login, splash y pantalla de carga de sesión.
 */
export default function ChefOneLaunchMark({
  boxClassName = '',
  imgClassName = 'mx-auto block w-[min(88vw,400px)] max-w-full select-none',
  lineClassName = 'mt-5 w-full max-w-[min(85vw,340px)]',
}: Props) {
  return (
    <div className="flex w-full flex-col items-center">
      <div
        className={`rounded-2xl border border-black bg-white px-5 py-4 shadow-sm sm:rounded-3xl sm:px-7 sm:py-5 ${boxClassName}`}
      >
        <img
          src="/logo-chef-one-wordmark.svg"
          alt="Chef-One"
          className={imgClassName}
          width={512}
          height={176}
          decoding="async"
        />
      </div>
      <ChefOneGlowLine className={lineClassName} />
    </div>
  );
}
