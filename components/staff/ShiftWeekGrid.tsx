'use client';

import React from 'react';
import { addDays, formatDayMonth, formatWeekdayShort, ymdLocal } from '@/lib/staff/staff-dates';
import type { StaffEmployee, StaffShift } from '@/lib/staff/types';
import { staffDisplayName } from '@/lib/staff/staff-supabase';

function shortTime(t: string) {
  const [h, m] = t.split(':');
  return `${h}:${m ?? '00'}`;
}

type Props = {
  weekStartMonday: Date;
  employees: StaffEmployee[];
  shifts: StaffShift[];
  onCellActivate: (employeeId: string, dateYmd: string, shiftsHere: StaffShift[]) => void;
};

export default function ShiftWeekGrid({ weekStartMonday, employees, shifts, onCellActivate }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartMonday, i));

  const shiftsByKey = new Map<string, StaffShift[]>();
  for (const s of shifts) {
    const k = `${s.employeeId}|${s.shiftDate}`;
    const arr = shiftsByKey.get(k) ?? [];
    arr.push(s);
    shiftsByKey.set(k, arr);
  }

  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200/90">
      <table className="min-w-[720px] w-full border-collapse text-left text-xs sm:text-sm">
        <thead>
          <tr className="bg-zinc-50">
            <th className="sticky left-0 z-20 min-w-[120px] border-b border-r border-zinc-200 bg-zinc-50 px-2 py-3 text-[10px] font-extrabold uppercase tracking-wide text-zinc-500 sm:px-3">
              Equipo
            </th>
            {days.map((d) => (
              <th
                key={ymdLocal(d)}
                className="border-b border-zinc-200 px-1 py-3 text-center font-extrabold text-zinc-800 sm:px-2"
              >
                <span className="block text-[10px] uppercase text-zinc-500">{formatWeekdayShort(d)}</span>
                <span className="block text-sm">{formatDayMonth(d)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((em) => (
            <tr key={em.id} className="bg-white">
              <td className="sticky left-0 z-10 border-b border-r border-zinc-100 bg-white px-2 py-2 sm:px-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ background: em.color ?? '#D32F2F' }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-zinc-900">{staffDisplayName(em)}</p>
                    {em.operationalRole ? (
                      <p className="truncate text-[10px] font-medium text-zinc-500">{em.operationalRole}</p>
                    ) : null}
                  </div>
                </div>
              </td>
              {days.map((d) => {
                const ymd = ymdLocal(d);
                const here = (shiftsByKey.get(`${em.id}|${ymd}`) ?? []).sort((a, b) =>
                  a.startTime.localeCompare(b.startTime),
                );
                return (
                  <td key={ymd} className="align-top border-b border-zinc-100 p-1 sm:p-1.5">
                    <button
                      type="button"
                      onClick={() => onCellActivate(em.id, ymd, here)}
                      className="min-h-[64px] w-full rounded-xl border border-dashed border-zinc-200/90 bg-zinc-50/50 p-1 text-left transition hover:border-[#D32F2F]/40 hover:bg-[#D32F2F]/5"
                    >
                      {here.length === 0 ? (
                        <span className="block pt-2 text-center text-[10px] font-semibold text-zinc-400">+</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {here.map((s) => (
                            <div
                              key={s.id}
                              className="rounded-lg px-2 py-1.5 text-[10px] font-bold leading-tight shadow-sm ring-1 ring-black/5 sm:text-xs"
                              style={{
                                background: s.colorHint
                                  ? `${s.colorHint}22`
                                  : em.color
                                    ? `${em.color}33`
                                    : '#fce4ec',
                                color: '#374151',
                              }}
                            >
                              <span className="block text-zinc-900">
                                {shortTime(s.startTime)} – {shortTime(s.endTime)}
                              </span>
                              {s.zone ? (
                                <span className="block text-[9px] font-semibold uppercase text-zinc-500">{s.zone}</span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
