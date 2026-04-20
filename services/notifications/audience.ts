/**
 * Si `metadata.target_user_ids` existe y no está vacío, la notificación solo aplica a esos usuarios.
 * Sin clave (o array vacío): comportamiento anterior — visible para todo el local con permiso de tipo.
 */
export function notificationIsForUser(
  metadata: Record<string, unknown> | null | undefined,
  viewerUserId: string | null,
): boolean {
  if (!metadata || typeof metadata !== 'object') return true;
  const raw = metadata.target_user_ids;
  if (raw == null) return true;
  if (!Array.isArray(raw) || raw.length === 0) return true;
  if (!viewerUserId) return false;
  return raw.some((id) => String(id) === viewerUserId);
}
