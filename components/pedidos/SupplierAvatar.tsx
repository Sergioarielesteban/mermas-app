'use client';

import React from 'react';

function supplierInitials(name: string) {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const text = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '');
  return text.toUpperCase() || 'PR';
}

export function SupplierAvatar({
  name,
  logoUrl,
  className = '',
  imageClassName = '',
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
  imageClassName?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const src = logoUrl && logoUrl.trim() !== '' && !failed ? logoUrl.trim() : null;
  const hasLogo = Boolean(src);

  return (
    <span
      className={[
        'grid shrink-0 place-items-center overflow-hidden rounded-full',
        hasLogo
          ? 'bg-white ring-1 ring-zinc-200/80'
          : 'bg-[#D32F2F]/[0.08] text-[11px] font-black uppercase tracking-tight text-[#B91C1C] ring-1 ring-[#D32F2F]/[0.14]',
        className,
      ].join(' ')}
      aria-hidden
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className={['block h-full w-full object-cover', imageClassName].join(' ')}
          onError={() => setFailed(true)}
        />
      ) : (
        supplierInitials(name)
      )}
    </span>
  );
}

