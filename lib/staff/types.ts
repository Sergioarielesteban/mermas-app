import type { ProfileAppRole } from '@/components/AuthProvider';

export type StaffShiftStatus = 'planned' | 'confirmed' | 'worked' | 'incident';

export type StaffTimeEventType = 'clock_in' | 'break_start' | 'break_end' | 'clock_out';

export type StaffIncidentType =
  | 'late'
  | 'no_clock_in'
  | 'incomplete'
  | 'early_out'
  | 'overlap'
  | 'overtime'
  | 'unassigned'
  | 'other';

export type StaffIncidentStatus = 'open' | 'resolved' | 'dismissed';

export type StaffEmployee = {
  id: string;
  localId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  alias: string | null;
  phone: string | null;
  email: string | null;
  operationalRole: string | null;
  weeklyHoursTarget: number | null;
  workdayType: string | null;
  color: string | null;
  hasPin: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StaffShift = {
  id: string;
  localId: string;
  employeeId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  breakMinutes: number;
  zone: string | null;
  notes: string | null;
  status: StaffShiftStatus;
  colorHint: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StaffTimeEntry = {
  id: string;
  localId: string;
  employeeId: string;
  shiftId: string | null;
  eventType: StaffTimeEventType;
  occurredAt: string;
  source: string;
  note: string | null;
  createdAt: string;
};

export type StaffIncident = {
  id: string;
  localId: string;
  employeeId: string;
  shiftId: string | null;
  incidentDate: string;
  incidentType: StaffIncidentType;
  description: string | null;
  status: StaffIncidentStatus;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClockSessionState = {
  /** Botones coherentes a mostrar (orden sugerido). */
  availableActions: StaffTimeEventType[];
  lastEventType: StaffTimeEventType | null;
  /** Inicio de la jornada actual si sigue abierta. */
  openSince: string | null;
};

export type StaffPermissions = {
  profileRole: ProfileAppRole | null;
  canManageSchedules: boolean;
  canManageEmployees: boolean;
  canCorrectEntries: boolean;
  canResolveIncidents: boolean;
  canViewTeamSummary: boolean;
};

export const STAFF_ZONE_PRESETS = [
  { value: 'cocina', label: 'Cocina' },
  { value: 'sala', label: 'Sala' },
  { value: 'barra', label: 'Barra' },
  { value: 'office', label: 'Office' },
  { value: 'reparto', label: 'Reparto' },
  { value: 'almacen', label: 'Almacén' },
] as const;
