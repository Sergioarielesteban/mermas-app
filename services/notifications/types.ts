import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationType } from './visibility';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

/** Tipos de evento canónicos para visibilidad por rol. */
export type NotificationEventType = NotificationType;

export type CreateNotificationInput = {
  localId: string;
  type: NotificationEventType | string;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  createdBy?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export type NotificationRow = {
  id: string;
  localId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  createdBy: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type NotificationWithRead = NotificationRow & {
  readAt: string | null;
};

export type RegisterDeviceInput = {
  userId: string;
  localId: string;
  deviceType?: string | null;
  pushToken?: string | null;
  platform?: string | null;
  userAgent?: string | null;
};

export type NotificationsSupabase = SupabaseClient;
