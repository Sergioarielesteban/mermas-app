'use client';

import { useEffect, useRef } from 'react';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { registerDevice } from '@/services/notifications';

function clientPlatformHint(): string | null {
  if (typeof navigator === 'undefined') return null;
  const uad = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return uad?.platform?.trim() || navigator.platform || null;
}

/**
 * Registra el dispositivo/navegador actual en user_devices (base Web Push).
 * Idempotente: no bloquea la UI; errores silenciosos.
 */
export function useRegisterNotificationDevice(
  localId: string | null,
  userId: string | null,
  enabled: boolean,
) {
  const doneRef = useRef(false);

  useEffect(() => {
    if (!enabled || !localId || !userId || !isSupabaseEnabled() || !getSupabaseClient()) return;
    if (doneRef.current) return;
    doneRef.current = true;

    const supabase = getSupabaseClient()!;
    void registerDevice(supabase, {
      userId,
      localId,
      deviceType: 'web',
      platform: clientPlatformHint(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }).catch(() => {
      doneRef.current = false;
    });
  }, [enabled, localId, userId]);
}
