'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProduccionEjecutarRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/produccion');
  }, [router]);
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-medium text-zinc-700">Abriendo producción del día…</p>
    </div>
  );
}
