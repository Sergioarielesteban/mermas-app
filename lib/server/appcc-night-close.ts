import { formatAppccDateEs } from '@/lib/appcc-supabase';
import { adminRestGet, adminRestPost, isSupabaseAdminConfigured } from '@/lib/server/supabase-admin';

/** Objetivo diario si hay equipos de frío / freidoras configurados. */
const MIN_TEMP_READINGS_PER_DAY = 2;
const MIN_OIL_EVENTS_PER_DAY = 1;

/** Ventana: hora 2 en Europe/Madrid (tras cierre ~2:00, revisar el día civil anterior). */
export function shouldRunAppccNightCloseCron(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '99');
  return hour === 2;
}

/** Fecha civil en Madrid del día de trabajo que acaba de cerrar (~2h), en YYYY-MM-DD. */
export function madridYesterdayDateKeyFromNow(now: Date): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = today.split('-').map((n) => Number(n));
  const ud = new Date(Date.UTC(y, m - 1, d));
  ud.setUTCDate(ud.getUTCDate() - 1);
  const y2 = ud.getUTCFullYear();
  const m2 = String(ud.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(ud.getUTCDate()).padStart(2, '0');
  return `${y2}-${m2}-${d2}`;
}

type IdRow = { id: string };

export type AppccNightCloseResult = {
  ran: boolean;
  checkDate: string | null;
  localsChecked: number;
  notificationsCreated: number;
  skipped?: string;
};

export async function runAppccNightCloseJob(now: Date): Promise<AppccNightCloseResult> {
  if (!isSupabaseAdminConfigured()) {
    return {
      ran: false,
      checkDate: null,
      localsChecked: 0,
      notificationsCreated: 0,
      skipped: 'Supabase admin not configured',
    };
  }

  if (!shouldRunAppccNightCloseCron(now)) {
    return {
      ran: false,
      checkDate: null,
      localsChecked: 0,
      notificationsCreated: 0,
      skipped: 'Outside Europe/Madrid hour 02',
    };
  }

  const checkDate = madridYesterdayDateKeyFromNow(now);
  const locals = await adminRestGet<IdRow[]>(
    'locals?select=id&is_active=eq.true&limit=2000',
  ).catch(async () => adminRestGet<IdRow[]>('locals?select=id&limit=2000'));

  let created = 0;
  let checked = 0;

  for (const loc of locals) {
    const localId = loc.id;
    checked += 1;

    const coldUnits = await adminRestGet<IdRow[]>(
      `appcc_cold_units?select=id&local_id=eq.${localId}&is_active=eq.true`,
    );
    const fryers = await adminRestGet<IdRow[]>(
      `appcc_fryers?select=id&local_id=eq.${localId}&is_active=eq.true`,
    );

    if (coldUnits.length === 0 && fryers.length === 0) continue;

    const tempRows = await adminRestGet<IdRow[]>(
      `appcc_temperature_readings?select=id&local_id=eq.${localId}&reading_date=eq.${checkDate}&limit=${MIN_TEMP_READINGS_PER_DAY + 1}`,
    );
    const missTemps = coldUnits.length > 0 && tempRows.length < MIN_TEMP_READINGS_PER_DAY;

    let missOil = false;
    if (fryers.length > 0) {
      const oilRows = await adminRestGet<IdRow[]>(
        `appcc_oil_events?select=id&local_id=eq.${localId}&event_date=eq.${checkDate}&limit=${MIN_OIL_EVENTS_PER_DAY + 1}`,
      );
      missOil = oilRows.length < MIN_OIL_EVENTS_PER_DAY;
    }

    if (!missTemps && !missOil) continue;

    const recent = await adminRestGet<{ id: string; metadata: unknown }[]>(
      `notifications?select=id,metadata&local_id=eq.${localId}&type=eq.appcc_fin_jornada&order=created_at.desc&limit=8`,
    );
    const already = recent.some(
      (r) =>
        r.metadata &&
        typeof r.metadata === 'object' &&
        r.metadata !== null &&
        (r.metadata as Record<string, unknown>).dateKey === checkDate,
    );
    if (already) continue;

    const parts: string[] = [];
    if (missTemps) parts.push('al menos 2 registros de temperatura');
    if (missOil) parts.push('al menos 1 registro de aceite');
    const dateLabel = formatAppccDateEs(checkDate);
    const message = `El ${dateLabel} no constan ${parts.join(' ni ')}. Revisa APPCC.`;

    await adminRestPost('notifications', [
      {
        local_id: localId,
        type: 'appcc_fin_jornada',
        severity: 'warning',
        title: 'APPCC: faltan registros del día',
        message,
        created_by: null,
        entity_type: 'appcc_daily_review',
        entity_id: null,
        metadata: {
          dateKey: checkDate,
          missingTemps: missTemps,
          missingOil: missOil,
        },
      },
    ]);
    created += 1;
  }

  return {
    ran: true,
    checkDate,
    localsChecked: checked,
    notificationsCreated: created,
  };
}
