'use client';

import Link from 'next/link';
import Image from 'next/image';
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

const BRAND = '#D32F2F';

type HeroSlide = { title: string; src: string; alt: string };

const HERO_SLIDES: HeroSlide[] = [
  { title: 'Pedidos', src: '/marketing/hero-slides/01-pedidos.png', alt: 'Chef-One: pedidos y recepción' },
  { title: 'Escandallos', src: '/marketing/hero-slides/02-escandallos.png', alt: 'Chef-One: escandallos y costes' },
  { title: 'Mermas', src: '/marketing/hero-slides/03-mermas.png', alt: 'Chef-One: mermas' },
  {
    title: 'APPCC',
    src: '/marketing/hero-slides/04-appcc.png',
    alt: 'Chef-One: APPCC — limpieza, temperaturas y aceite',
  },
  { title: 'Analítica', src: '/marketing/hero-slides/05-analitica.png', alt: 'Chef-One: analítica' },
  { title: 'Inventario', src: '/marketing/hero-slides/06-inventario.png', alt: 'Chef-One: inventario' },
];

function HeroCardCarousel() {
  const reduceMotion = useReducedMotion();
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);

  const scrollToIndex = React.useCallback((idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.children[idx] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }, [reduceMotion]);

  const go = React.useCallback(
    (delta: number) => {
      const next = Math.min(HERO_SLIDES.length - 1, Math.max(0, active + delta));
      setActive(next);
      scrollToIndex(next);
    },
    [active, scrollToIndex],
  );

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const cards = Array.from(el.children) as HTMLElement[];
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      cards.forEach((c, i) => {
        const cx = c.offsetLeft + c.clientWidth / 2;
        const d = Math.abs(cx - mid);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      setActive(best);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.div
      className="relative w-full"
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.6, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : 0.08 }}
    >
      <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 sm:text-[11px]">
        Desliza las tarjetas
      </p>
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollPaddingInline: 'max(1rem, calc(50% - 9.5rem))' }}
      >
        {HERO_SLIDES.map((slide, idx) => (
          <article
            key={slide.title}
            className="w-[min(100%,19rem)] shrink-0 snap-center sm:w-[20.5rem]"
          >
            <div
              className="overflow-hidden rounded-[1.35rem] border border-white/60 bg-gradient-to-b from-white via-white to-stone-50/95 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.25),0_0_0_1px_rgba(15,23,42,0.04)] ring-1 ring-stone-900/[0.04]"
            >
              <div className="relative aspect-[16/11] w-full overflow-hidden bg-stone-100">
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 640px) 85vw, 328px"
                  priority={idx === 0}
                />
              </div>
              <div className="border-t border-stone-100/90 px-4 py-3">
                <p className="text-sm font-bold tracking-tight text-stone-900">{slide.title}</p>
                <p className="mt-0.5 text-[11px] font-medium text-stone-500">Chef-One</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-1 flex items-center justify-center gap-3">
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => go(-1)}
          className="grid h-9 w-9 place-items-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm transition hover:bg-stone-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {HERO_SLIDES.map((s, idx) => (
            <button
              key={s.title}
              type="button"
              aria-label={`Ir a ${s.title}`}
              onClick={() => {
                setActive(idx);
                scrollToIndex(idx);
              }}
              className={`h-1.5 rounded-full transition-all ${idx === active ? 'w-6 bg-[#D32F2F]' : 'w-2 bg-stone-300'}`}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Siguiente"
          onClick={() => go(1)}
          className="grid h-9 w-9 place-items-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm transition hover:bg-stone-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

export default function MarketingHero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden border-b border-stone-200/50 bg-gradient-to-b from-white via-[#fafafa] to-[#f4f4f5] px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-25%,rgba(211,47,47,0.11),transparent),radial-gradient(ellipse_50%_40%_at_100%_0%,rgba(15,23,42,0.05),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center lg:mx-0 lg:max-w-xl lg:text-left">
          <motion.div
            className="flex flex-wrap items-center justify-center gap-2 lg:justify-start"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-stone-200/90 bg-white/90 px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-[#D32F2F]" aria-hidden />
              Chef-One — operaciones de cocina
            </span>
          </motion.div>

          <motion.h1
            className="mt-6 text-balance text-3xl font-extrabold leading-[1.08] tracking-tight text-stone-900 sm:text-4xl sm:leading-[1.06] lg:text-[2.65rem]"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.04 }}
          >
            Menos caos en servicio.
            <span className="mt-1 block bg-gradient-to-r from-[#D32F2F] to-[#9a1818] bg-clip-text text-transparent">
              Más control, sin complicarte.
            </span>
          </motion.h1>

          <motion.p
            className="mx-auto mt-4 max-w-lg text-pretty text-base leading-snug text-stone-600 sm:text-lg lg:mx-0"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.09 }}
          >
            Módulos a tu medida: activa solo lo que necesites y crece cuando quieras. Una app pensada para móvil y
            tablet, con el ritmo de cocina de verdad.
          </motion.p>

          <motion.div
            className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.14 }}
          >
            <Link
              href="#solicitar-info"
              className="inline-flex h-12 items-center justify-center rounded-2xl px-8 text-sm font-bold text-white shadow-[0_10px_28px_-8px_rgba(211,47,47,0.5)] transition hover:brightness-105 active:scale-[0.99]"
              style={{ backgroundColor: BRAND }}
            >
              Hablar con nosotros
            </Link>
            <Link
              href="#modulos"
              className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-stone-200/95 bg-white/95 px-8 text-sm font-bold text-stone-800 shadow-sm backdrop-blur-sm transition hover:border-stone-300 hover:bg-white"
            >
              Ver módulos
            </Link>
          </motion.div>
        </div>

        <div className="mt-12 lg:mt-14">
          <HeroCardCarousel />
        </div>
      </div>
    </section>
  );
}
