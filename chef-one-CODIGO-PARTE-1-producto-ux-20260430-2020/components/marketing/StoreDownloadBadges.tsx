'use client';

import React from 'react';

/** Badges estilo tienda (oscuros), sin URL real; listos para enlazar cuando existan las apps. */
export default function StoreDownloadBadges({ className = '' }: { className?: string }) {
  const stop = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4 ${className}`.trim()}
      role="group"
      aria-label="Descarga en App Store y Google Play"
    >
      <a
        href="#"
        onClick={stop}
        className="inline-flex h-[40px] w-[120px] shrink-0 items-center justify-center rounded-md bg-black px-2.5 text-white no-underline ring-1 ring-white/10 transition hover:bg-zinc-900 hover:ring-white/20"
        aria-label="Download on the App Store"
      >
        <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
          />
        </svg>
        <span className="ml-1.5 min-w-0 text-left leading-none">
          <span className="block text-[8px] font-medium text-white/85">Download on the</span>
          <span className="block text-[13px] font-semibold tracking-tight">App Store</span>
        </span>
      </a>
      <a
        href="#"
        onClick={stop}
        className="inline-flex h-[40px] w-[135px] shrink-0 items-center justify-center rounded-md bg-black px-2.5 text-white no-underline ring-1 ring-white/10 transition hover:bg-zinc-900 hover:ring-white/20"
        aria-label="Get it on Google Play"
      >
        <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" aria-hidden>
          <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
        </svg>
        <span className="ml-1.5 min-w-0 text-left leading-none">
          <span className="block text-[8px] font-medium text-white/85">GET IT ON</span>
          <span className="block text-[13px] font-semibold tracking-tight">Google Play</span>
        </span>
      </a>
    </div>
  );
}
