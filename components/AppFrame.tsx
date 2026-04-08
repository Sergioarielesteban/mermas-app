'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/components/AuthProvider';

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { email, loading } = useAuth();
  const isLogin = pathname === '/login';

  useEffect(() => {
    if (loading) return;
    if (!email && !isLogin) {
      router.replace('/login');
      // Fallback in case client router transition gets stuck.
      window.setTimeout(() => {
        if (window.location.pathname !== '/login') {
          window.location.replace('/login');
        }
      }, 400);
    }
    if (email && isLogin) router.replace('/');
  }, [email, isLogin, loading, router]);

  // Keep server and first client paint aligned to avoid hydration mismatch.
  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-50 px-4">
        <p className="text-sm font-semibold text-zinc-600">Cargando sesión...</p>
      </main>
    );
  }

  if (!email && !isLogin) {
    return null;
  }

  if (isLogin) {
    return <main className="min-h-screen px-4 py-8">{children}</main>;
  }

  return (
    <>
      <div className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <AppShell>{children}</AppShell>
      </div>
      <BottomNav />
    </>
  );
}

