'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  slugifyOperationalZoneKey,
  type CustomOperationalZoneRow,
} from '@/lib/staff/operational-custom-zones';
import { STAFF_ZONE_PRESETS, type StaffShift } from '@/lib/staff/types';
import { appAlert } from '@/lib/app-dialog-bridge';

/** Misma constante que en OperationalWeekGrid (puestos fijos del cuadrante). */
const DISPLAY_ZONE_ORDER = ['cocina', 'barra', 'sala', 'cocina_central'] as const;
const OPERATIONAL_NONE_ZONE = '__none__' as const;

function shiftZoneKey(s: StaffShift): string {
  const z = (s.zone ?? '').trim().toLowerCase();
  return z || OPERATIONAL_NONE_ZONE;
}

/** Slugs que no pueden usarse para puestos personalizados (colisionan con filas del sistema). */
function systemReservedZoneSlugs(): Set<string> {
  const s = new Set<string>([...DISPLAY_ZONE_ORDER, OPERATIONAL_NONE_ZONE]);
  for (const p of STAFF_ZONE_PRESETS) s.add(p.value);
  return s;
}

export type OperationalZonesManagerModalProps = {
  open: boolean;
  onClose: () => void;
  zones: CustomOperationalZoneRow[];
  shifts: StaffShift[];
  onApply: (next: CustomOperationalZoneRow[]) => void;
  canEdit: boolean;
};

export default function OperationalZonesManagerModal({
  open,
  onClose,
  zones,
  shifts,
  onApply,
  canEdit,
}: OperationalZonesManagerModalProps) {
  const [newLabel, setNewLabel] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => {
    if (!open) {
      setNewLabel('');
      setEditingKey(null);
      setEditDraft('');
    }
  }, [open]);

  const shiftCountForZone = useCallback(
    (key: string) => shifts.filter((s) => shiftZoneKey(s) === key).length,
    [shifts],
  );

  const tryDelete = useCallback(
    async (key: string) => {
      if (!canEdit) return;
      const n = shiftCountForZone(key);
      if (n > 0) {
        await appAlert(
          `No se puede eliminar este puesto: tiene ${n} turno(s) en el cuadrante. Mueve o elimina esos turnos antes.`,
        );
        return;
      }
      onApply(zones.filter((z) => z.key !== key));
    },
    [canEdit, onApply, shiftCountForZone, zones],
  );

  const tryAdd = useCallback(async () => {
    if (!canEdit) return;
    const label = newLabel.trim();
    if (!label) {
      await appAlert('Escribe un nombre para el puesto.');
      return;
    }
    let key = slugifyOperationalZoneKey(label);
    const reserved = systemReservedZoneSlugs();
    if (reserved.has(key)) {
      await appAlert(
        'Ese nombre coincide con un puesto del sistema (Cocina, Barra, etc.). Elige otro nombre distinto.',
      );
      return;
    }
    let n = 2;
    while (zones.some((z) => z.key === key)) {
      key = `${slugifyOperationalZoneKey(label)}-${n}`;
      n += 1;
    }
    onApply([...zones, { key, label }]);
    setNewLabel('');
  }, [canEdit, newLabel, onApply, zones]);

  const startEdit = useCallback((z: CustomOperationalZoneRow) => {
    setEditingKey(z.key);
    setEditDraft(z.label);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditDraft('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!canEdit || !editingKey) return;
    const label = editDraft.trim();
    if (!label) {
      await appAlert('El nombre no puede estar vacío.');
      return;
    }
    onApply(zones.map((z) => (z.key === editingKey ? { ...z, label } : z)));
    cancelEdit();
  }, [canEdit, cancelEdit, editDraft, editingKey, onApply, zones]);

  const list = useMemo(() => [...zones].sort((a, b) => a.label.localeCompare(b.label, 'es')), [zones]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[min(85vh,560px)] w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-zinc-200 sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operational-zones-manager-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 id="operational-zones-manager-title" className="text-sm font-extrabold text-zinc-900">
            Gestionar puestos
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto px-4 py-3">
          <p className="mb-3 text-xs text-zinc-600">
            Puestos personalizados del cuadrante. Los puestos fijos (Cocina, Barra, Sala…) no se pueden editar aquí.
          </p>
          <ul className="space-y-2">
            {list.length === 0 ? (
              <li className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">Aún no hay puestos extra.</li>
            ) : (
              list.map((z) => {
                const busy = shiftCountForZone(z.key);
                const isEditing = editingKey === z.key;
                return (
                  <li
                    key={z.key}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2"
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <input
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm font-semibold text-zinc-900"
                          autoFocus
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!canEdit}
                            className="rounded-lg bg-[#D32F2F] px-2.5 py-1 text-[11px] font-extrabold text-white disabled:opacity-50"
                            onClick={() => void saveEdit()}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-700"
                            onClick={cancelEdit}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-zinc-900">{z.label}</p>
                          {busy > 0 ? (
                            <p className="text-[10px] font-semibold text-amber-800">
                              {busy} turno{busy !== 1 ? 's' : ''} — no se puede eliminar hasta vaciar
                            </p>
                          ) : (
                            <p className="text-[10px] text-zinc-500">Sin turnos · se puede eliminar</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            disabled={!canEdit}
                            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[10px] font-extrabold text-zinc-800 disabled:opacity-50"
                            onClick={() => startEdit(z)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={!canEdit}
                            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-extrabold text-red-700 disabled:opacity-50"
                            onClick={() => void tryDelete(z.key)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
        <div className="border-t border-zinc-200 bg-zinc-50/90 px-4 py-3">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Añadir puesto</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nombre del puesto"
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900"
            />
            <button
              type="button"
              disabled={!canEdit}
              className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50"
              onClick={() => void tryAdd()}
            >
              Añadir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
