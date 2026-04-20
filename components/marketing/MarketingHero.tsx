'use client';

import Link from 'next/link';
import Image from 'next/image';
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { enterDemoMode } from '@/lib/demo-mode';

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
      className="relative w-full [perspective:1400px]"
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.6, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : 0.08 }}
    >
      <p className="mb-4 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 sm:text-[11px]">
        Desliza las tarjetas
      </p>
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-8 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollPaddingInline: 'max(0.75rem, calc(50% - 8.75rem))',
          scrollBehavior: 'smooth',
        }}
      >
        {HERO_SLIDES.map((slide, idx) => {
          const isActive = idx === active;
          const sideTilt = !isActive ? (idx < active ? 6 : -6) : 0;
          const transform = reduceMotion
            ? isActive
              ? 'scale(1)'
              : 'scale(0.9)'
            : isActive
              ? 'scale(1) translateZ(24px)'
              : `scale(0.88) translateZ(0) rotateY(${sideTilt}deg)`;
          return (
            <article
              key={slide.title}
              style={{
                transform,
                transformStyle: reduceMotion ? undefined : 'preserve-3d',
              }}
              className={[
                'w-[min(82vw,17.5rem)] shrink-0 snap-center sm:w-[18.5rem]',
                'transition-[transform,opacity] duration-300 ease-out',
                isActive ? 'z-20 opacity-100' : 'z-10 opacity-[0.78]',
              ].join(' ')}
            >
              <div
                className={[
                  'rounded-[1.35rem] bg-gradient-to-b from-stone-700 via-stone-900 to-stone-950 p-[5px] [box-shadow:0_24px_48px_rgba(0,0,0,0.14),0_8px_16px_rgba(0,0,0,0.06)]',
                  isActive
                    ? 'ring-2 ring-[#D32F2F]/35 ring-offset-2 ring-offset-[#f0f1f4]'
                    : 'ring-1 ring-black/20',
                ].join(' ')}
              >
                <div className="overflow-hidden rounded-[1.15rem] bg-white shadow-inner ring-1 ring-white/10">
                  <div className="flex items-center gap-2 border-b border-stone-200/90 bg-gradient-to-b from-stone-50 to-stone-100/90 px-3 py-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#ff5f57]" aria-hidden />
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#febc2e]" aria-hidden />
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#28c840]" aria-hidden />
                    <span className="min-w-0 truncate pl-1 text-[10px] font-semibold tracking-wide text-stone-500">
                      Chef-One · {slide.title}
                    </span>
                  </div>
                  <div className="relative h-[200px] w-full overflow-hidden bg-stone-200/80 sm:h-[240px]">
                    <Image
                      src={slide.src}
                      alt={slide.alt}
                      fill
                      className="object-cover object-top"
                      sizes="(max-width: 640px) 82vw, 296px"
                      priority={idx === 0}
                    />
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/45 to-transparent"
                      aria-hidden
                    />
                  </div>
                  <div className="border-t border-stone-100 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
                    <p className="text-sm font-bold tracking-tight text-stone-900">{slide.title}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-stone-500">Chef-One</p>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-center gap-3">
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
    <section className="relative overflow-hidden border-b border-stone-200/50 bg-gradient-to-b from-white via-[#fafafa] to-[#f0f1f4] px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-14">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-25%,rgba(211,47,47,0.11),transparent),radial-gradient(ellipse_50%_40%_at_100%_0%,rgba(15,23,42,0.05),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center lg:mx-0 lg:max-w-xl lg:text-left">
          <motion.h1
            className="mt-2 text-balance text-3xl font-extrabold leading-[1.08] tracking-tight text-stone-950 sm:mt-3 sm:text-4xl sm:leading-[1.06] lg:text-[2.65rem]"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.04 }}
          >
            Todo lo que pasa en tu cocina,
            <span className="mt-1 block font-extrabold text-[#D32F2F]">en un solo sitio.</span>
          </motion.h1>

          <motion.p
            className="mx-auto mt-4 max-w-lg text-pretty text-base leading-snug text-stone-600 sm:text-lg lg:mx-0"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.09 }}
          >
            Gestiona pedidos, control, equipo y cumplimiento sin cambiar de app ni depender de memoria.
          </motion.p>

          <motion.div
            className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.14 }}
          >
            <Link
              href="#solicitar-info"
              className="inline-flex h-12 items-center justify-center rounded-2xl px-8 text-sm font-bold text-white shadow-[0_10px_28px_-8px_rgba(211,47,47,0.5)] transition hover:brightness-105 active:scale-[0.99]"
              style={{ backgroundColor: BRAND }}
            >
              Solicitar demo
            </Link>
            <button
              type="button"
              onClick={() => {
                enterDemoMode();
                window.location.assign('/panel');
              }}
              className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-[#D32F2F]/40 bg-white px-8 text-sm font-bold text-[#B91C1C] shadow-sm transition hover:bg-red-50 active:scale-[0.99]"
            >
              Ver demo
            </button>
            <Link
              href="#modulos"
              className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-stone-200/95 bg-white/95 px-8 text-sm font-bold text-stone-800 shadow-sm backdrop-blur-sm transition hover:border-stone-300 hover:bg-white"
            >
              Ver módulos
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-2xl px-8 text-sm font-bold text-stone-700 underline-offset-4 ring-1 ring-stone-200/90 transition hover:bg-stone-50"
            >
              Ir a la app
            </Link>
          </motion.div>
        </div>

        <div className="mt-12 lg:mt-16">
          <div className="rounded-[24px] bg-gradient-to-b from-white/80 to-transparent px-1 pb-1 pt-2 [box-shadow:0_20px_50px_-20px_rgba(15,23,42,0.12)]">
            <HeroCardCarousel />
          </div>
        </div>
      </div>
    </section>
  );
}
