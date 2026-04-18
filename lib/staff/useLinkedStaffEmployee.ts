'use client';

import { useMemo } from 'react';
import type { StaffEmployee } from '@/lib/staff/types';

export function useLinkedStaffEmployee(employees: StaffEmployee[], authUserId: string | null): StaffEmployee | null {
  return useMemo(() => {
    if (!authUserId) return null;
    return employees.find((e) => e.userId === authUserId) ?? null;
  }, [employees, authUserId]);
}
