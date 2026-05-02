'use client';

import Link from 'next/link';
import Image from 'next/image';
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { enterDemoMode } from '@/lib/demo-mode';
import Logo from '@/components/Logo';

const BRAND = '#D32F2F';

/** Curva tipo deslizamiento premium (suave, sin brusquedad) */
const SLIDE_EASE = [0.22, 1, 0.36, 1] as const;

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

  const scrollToIndex = React.useCallback(
    (idx: number) => {
      const el = scrollerRef.current;
      if (!el) return;
      const card = el.children[idx] as HTMLElement | undefined;
      if (!card) return;
      if (reduceMotion) {
        card.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
        return;
      }
      const target =
        card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
      el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    },
    [reduceMotion],
  );

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
      <p className="mb-5 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 sm:mb-6 sm:text-[11px]">
        Desliza las tarjetas
      </p>
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain px-2 pb-10 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollPaddingInline: 'max(1rem, calc(50% - 9.25rem))',
          scrollBehavior: 'smooth',
        }}
      >
        {HERO_SLIDES.map((slide, idx) => {
          const isActive = idx === active;
          const sideTilt = !isActive ? (idx < active ? 4 : -4) : 0;
          const transform = reduceMotion
            ? isActive
              ? 'scale(1)'
              : 'scale(0.92)'
            : isActive
              ? 'scale(1.02) translateZ(32px)'
              : `scale(0.86) translateZ(0) rotateY(${sideTilt}deg)`;
          return (
            <article
              key={slide.title}
              style={{
                transform,
                transformStyle: reduceMotion ? undefined : 'preserve-3d',
                transitionTimingFunction: `cubic-bezier(${SLIDE_EASE.join(',')})`,
              }}
              className={[
                'w-[min(78vw,18rem)] shrink-0 snap-center snap-always sm:w-[19.5rem]',
                'transition-[transform,opacity,filter] duration-500 will-change-transform',
                isActive
                  ? 'z-20 opacity-100 [filter:brightness(1)_saturate(1)]'
                  : 'z-10 opacity-[0.72] [filter:brightness(0.97)_saturate(0.96)]',
              ].join(' ')}
            >
              <div
                className={[
                  'rounded-[1.5rem] bg-gradient-to-b from-stone-600 via-stone-900 to-stone-950 p-[6px]',
                  isActive
                    ? '[box-shadow:0_36px_72px_-20px_rgba(0,0,0,0.18),0_12px_28px_-8px_rgba(211,47,47,0.12),0_0_0_1px_rgba(255,255,255,0.06)_inset] ring-2 ring-[#D32F2F]/30 ring-offset-[10px] ring-offset-[#f3f4f6]'
                    : '[box-shadow:0_20px_40px_-16px_rgba(0,0,0,0.12)] ring-1 ring-black/25',
                ].join(' ')}
              >
                <div className="overflow-hidden rounded-[1.2rem] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-white/15">
                  <div className="flex items-center gap-2 border-b border-stone-200/90 bg-gradient-to-b from-stone-50 to-stone-100/95 px-3 py-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#ff5f57]" aria-hidden />
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#febc2e]" aria-hidden />
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#28c840]" aria-hidden />
                    <span className="min-w-0 truncate pl-1 text-[10px] font-semibold tracking-wide text-stone-500">
                      {slide.title}
                    </span>
                  </div>
                  <div className="relative h-[212px] w-full overflow-hidden bg-gradient-to-b from-stone-100 to-stone-200/90 sm:h-[252px]">
                    <Image
                      src={slide.src}
                      alt={slide.alt}
                      fill
                      className="object-cover object-top"
                      sizes="(max-width: 640px) 78vw, 312px"
                      priority={idx === 0}
                    />
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 via-black/15 to-transparent"
                      aria-hidden
                    />
                  </div>
                  <div className="border-t border-stone-100 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
                    <p className="text-sm font-bold tracking-tight text-stone-900">{slide.title}</p>
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
              className={`h-1.5 rounded-full transition-[width,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${idx === active ? 'w-7 bg-[#D32F2F]' : 'w-2 bg-stone-300/90'}`}
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

const ctaBase =
  'inline-flex min-h-[3.375rem] w-full min-w-0 items-center justify-center rounded-2xl px-5 text-[0.96875rem] font-bold tracking-tight transition active:scale-[0.99] supports-[padding:max(0px)]:min-h-[max(3.375rem,48px)] sm:min-h-[3.5rem] sm:px-7 sm:text-[1rem] md:min-h-[3.625rem]';

export default function MarketingHero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden border-b border-stone-200/50 bg-gradient-to-b from-white via-[#fafafa] to-[#f0f1f4]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_88%_52%_at_50%_-22%,rgba(211,47,47,0.1),transparent),radial-gradient(ellipse_48%_38%_at_100%_0%,rgba(15,23,42,0.045),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[90rem] px-4 pb-[7.5rem] pt-2 sm:px-6 sm:pb-11 sm:pt-3 md:pb-12 md:pt-4 lg:px-8 lg:pb-14 lg:pt-5">
        <div
          className={[
            'mx-auto flex w-full max-w-[min(100%,44rem)] flex-col items-center text-center',
            'sm:max-w-[min(100%,50rem)] md:max-w-[min(100%,54rem)] lg:max-w-[58rem] xl:max-w-[62rem]',
            'gap-3 sm:gap-4 md:gap-5',
          ].join(' ')}
        >
          {/* Sin translateY aquí: si no, el full-bleed/centering rompe y el logo se corta en móvil. */}
          <motion.div
            className="mb-1 flex w-full shrink-0 justify-center leading-none [-webkit-tap-highlight-color:transparent] sm:mb-2"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.48, ease: SLIDE_EASE, delay: reduceMotion ? 0 : 0.02 }}
          >
            <Link
              href="/"
              className="inline-flex max-w-full outline-none ring-offset-4 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40"
              aria-label="Chef-One — inicio"
            >
              <Logo
                variant="hero"
                className="max-w-[min(98vw,28rem)] sm:max-w-[min(92vw,30rem)] md:max-w-[min(70vw,28rem)] lg:max-w-[28rem] xl:max-w-[29rem]"
              />
            </Link>
          </motion.div>

          <motion.h1
            className="mx-auto w-full max-w-[min(100%,24rem)] text-balance font-extrabold tracking-[-0.03em] text-stone-950 sm:max-w-[min(100%,34rem)] md:max-w-[min(100%,40rem)] lg:max-w-[min(100%,45rem)] xl:max-w-[48rem] text-[clamp(2.45rem,8.8vw,5.35rem)] leading-[1.03] sm:text-[clamp(2.8rem,6.9vw,5.35rem)] md:leading-[1.02] lg:text-[clamp(3.1rem,5.6vw,5.35rem)]"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.06 }}
          >
            Todo lo que pasa en tu cocina,
            <span className="mt-2 block font-extrabold text-[#D32F2F] sm:mt-2.5 md:mt-3">
              en un solo sitio.
            </span>
          </motion.h1>

          <motion.p
            className="mx-auto w-full max-w-[min(100%,26rem)] text-pretty text-[clamp(1.09375rem,3.5vw,1.4rem)] font-medium leading-[1.55] text-stone-600 sm:max-w-xl sm:leading-[1.52] md:max-w-[38rem] md:text-[1.21875rem] md:leading-[1.58] lg:max-w-[42rem]"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.46, delay: reduceMotion ? 0 : 0.085 }}
          >
            Gestiona pedidos, control, equipo y cumplimiento sin cambiar de app ni depender de memoria.
          </motion.p>

          <motion.div
            className="grid w-full max-w-[22.5rem] grid-cols-1 gap-3.5 sm:max-w-xl sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3.5 md:max-w-2xl lg:max-w-[48rem] xl:max-w-[56rem] xl:grid-cols-4 xl:gap-x-3.5 xl:gap-y-0"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.46, delay: reduceMotion ? 0 : 0.11 }}
          >
            <Link
              href="#solicitar-info"
              className={`${ctaBase} text-white shadow-[0_14px_36px_-12px_rgba(211,47,47,0.55)] hover:brightness-[1.03]`}
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
              className={`${ctaBase} border-2 border-[#D32F2F]/40 bg-white text-[#B91C1C] shadow-sm hover:bg-red-50`}
            >
              Ver demo
            </button>
            <Link
              href="#modulos"
              className={`${ctaBase} border-2 border-stone-200/95 bg-white/95 text-stone-800 shadow-sm backdrop-blur-sm hover:border-stone-300 hover:bg-white`}
            >
              Ver módulos
            </Link>
            <Link href="/login" className={`${ctaBase} text-stone-700 ring-1 ring-stone-200/90 hover:bg-stone-50`}>
              Ir a la app
            </Link>
          </motion.div>
        </div>

        <div className="mx-auto mt-8 w-full max-w-6xl sm:mt-10 md:mt-12">
          <div className="rounded-[24px] bg-gradient-to-b from-white/80 to-transparent px-1 pb-1 pt-2 [box-shadow:0_20px_50px_-20px_rgba(15,23,42,0.12)]">
            <HeroCardCarousel />
          </div>
        </div>
      </div>
    </section>
  );
}
