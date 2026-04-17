# Sistema de notificaciones por local

Documentación del módulo de notificaciones internas, Realtime y preparación para Web Push.

## Archivos principales

| Área | Ruta |
|------|------|
| Esquema SQL | `supabase-notifications.sql` |
| Publicación Realtime | `supabase-realtime-publication.sql` (tabla `notifications`) |
| Tipos y constantes | `services/notifications/types.ts`, `constants.ts` |
| CRUD / RPC | `services/notifications/createNotification.ts`, `getNotifications.ts`, `markAsRead.ts`, `registerDevice.ts` |
| Eventos de dominio | `services/notifications/triggers.ts` |
| Deep links | `services/notifications/navigation.ts` |
| Push (stub) | `services/notifications/pushDispatch.ts` |
| Hooks | `hooks/useNotifications.ts`, `hooks/useRegisterNotificationDevice.ts` |
| UI | `components/notifications/NotificationBell.tsx`, `NotificationsPanel.tsx`, `NotificationItem.tsx` |
| Shell | `components/AppShell.tsx` (campana en cabecera) |

### Integraciones en flujos reales

- `app/pedidos/nuevo/page.tsx` — pedido enviado (WhatsApp / envío en un paso)  
- `app/pedidos/page.tsx` — pedido recibido; incidencias al guardar líneas marcadas (✗)  
- `app/pedidos/recepcion/page.tsx` — incidencia (nota no vacía) en revisión de precios  
- `app/inventario/page.tsx` — inventario cerrado  
- `app/chat/page.tsx` — mensaje al equipo  
- `app/appcc/temperaturas/page.tsx` — alerta APPCC (temperatura fuera de rango)

## Arquitectura

1. **Evento en el local** — El código llama a un helper en `triggers.ts` (p. ej. `notifyPedidoEnviado`), que construye título, mensaje, `entity_type` / `entity_id` y `metadata`.
2. **Persistencia** — `safeCreateNotification` / `createNotification` inserta en `public.notifications` con `local_id` del perfil actual (`current_local_id()` debe coincidir con el evento).
3. **Lectura por usuario** — Cada usuario ve solo filas de su `current_local_id()`. El estado leído es una fila en `notification_reads` (`notification_id`, `user_id` únicos).
4. **Tiempo real** — Tras añadir `notifications` a `supabase_realtime`, `useNotifications` se suscribe a `INSERT` con `filter: local_id=eq.{localId}` y refresca lista y contador.
5. **Push futuro** — `user_devices` guarda dispositivos; `preparePushDispatch` / `sendPushToLocalUsers` son stubs documentados (sin envío real hasta VAPID + SW + backend).

## Añadir un nuevo tipo de notificación

1. En `services/notifications/types.ts`, amplía `NotificationEventType` con el literal nuevo (p. ej. `'nuevo_modulo_evento'`).
2. En `services/notifications/constants.ts`, añade entrada en `defaultSeverityForType` si el tipo tiene severidad distinta de `info`.
3. En `services/notifications/triggers.ts`, crea `notifyNuevoModuloEvento(supabase, { localId, userId, ... })` que llame a `safeCreateNotification` con `type`, `title`, `message`, `entityType`, `entityId`, `metadata`.
4. En `services/notifications/navigation.ts`, si debe abrir una pantalla concreta, mapea `entity_type` + `metadata` a una ruta.
5. Invoca el helper desde el flujo real (mutación exitosa en servidor/cliente).

Opcional: filas en `notification_preferences` cuando implementes preferencias en UI.

## Activar push notifications reales (pasos pendientes)

La app ya puede registrar filas en `user_devices` (sin token Web Push hasta que exista suscripción).

Para **Web Push** completo haría falta, como mínimo:

1. **Claves VAPID** en variables de entorno del servidor (o Edge Function) y, si aplica, clave pública expuesta al cliente.
2. **Service Worker** que escuche `push` y muestre notificaciones; registro del SW desde el cliente.
3. **`push_token`** (o campo dedicado) rellenado con el endpoint de la suscripción Push API (JSON serializado o URL del endpoint según convención del proveedor).
4. **Backend de envío** — p. ej. Edge Function invocada tras insertar notificación (o desde `preparePushDispatch` en servidor), que lea `user_devices` activos del `local_id`, respete preferencias y envíe con `web-push` o servicio equivalente.
5. **Permisos del navegador** y política HTTPS (o localhost en desarrollo).

Hasta entonces, `pushDispatch.ts` documenta el hook sin realizar envíos.

## Avisos en la pantalla del móvil (sin Web Push completo)

Las notificaciones **dentro de la app** (campana) usan Supabase Realtime. Para un **banner del sistema** cuando otro usuario del local genera un evento:

1. Abre el panel de la campana y pulsa **«Activar avisos en este dispositivo»** (permiso del navegador).
2. Con permiso concedido, cada `INSERT` en `notifications` de tu local dispara un `Notification` nativo **si el evento no lo creó tu propio usuario** (evita avisarte a ti mismo).

**Límites:** en **iOS**, las notificaciones web/PWA son más restrictivas que en Android; sin Web Push + SW no hay avisos con la app totalmente cerrada. Para eso hace falta el bloque «Activar push notifications reales» de arriba.

## Incidencias de pedido (dos sitios)

- **`/pedidos/recepcion`**: al guardar una **nota de incidencia** no vacía en el bloque de incidencias.
- **`/pedidos`** (pedidos enviados / recepción rápida): al **guardar incidencias** con líneas marcadas como problema (✗), incluido el texto por defecto «No recibido».

Ambos flujos llaman a `notifyIncidenciaRecepcion`.

## Cron APPCC (fin de jornada ~2:00 Madrid)

Ruta: **`GET /api/cron/appcc-night-close`** con header `Authorization: Bearer CRON_SECRET`.

- En **Vercel** está programado **cada hora** (`vercel.json`); solo ejecuta la lógica en la **hora 2** (Europe/Madrid).
- Revisa el **día civil anterior** en Madrid: si hay equipos de frío activos, al menos **2** lecturas en `appcc_temperature_readings` ese día; si hay **freidoras** activas, al menos **1** fila en `appcc_oil_events` ese día.
- Inserta una fila en `notifications` por local (`type: appcc_fin_jornada`, `entity_type: appcc_daily_review`) si falta algo y no había ya un aviso con el mismo `metadata.dateKey`.
- Requiere **`SUPABASE_SERVICE_ROLE_KEY`** (y URL Supabase) en el servidor, igual que otros crons.

## Pasos manuales en Supabase

1. Ejecutar **`supabase-notifications.sql`** en el SQL Editor (una vez por proyecto).
2. Ejecutar el bloque `do $$ ... $$` de **`supabase-realtime-publication.sql`** (o `alter publication supabase_realtime add table public.notifications;`) para que Realtime emita `INSERT`.
3. En Dashboard → **Database → Publications**, comprobar que `notifications` aparece en `supabase_realtime`.

Si `set_updated_at` no existiera en el proyecto, crear el trigger de `user_devices` requeriría esa función (el resto del esquema multilocal de Chef-One ya la suele definir).

## SQL de migración (referencia)

El contenido canónico está en **`supabase-notifications.sql`** (tablas `notifications`, `notification_reads`, `user_devices`, `notification_preferences`, RLS, función `mark_all_notifications_read_for_local`). No duplicar aquí el SQL completo: mantener una sola fuente en ese archivo para evitar divergencias.

## Seguridad (RLS)

- **SELECT** en `notifications`: solo filas con `local_id = current_local_id()`.
- **INSERT** en `notifications`: `local_id` debe ser el local actual (evita crear eventos en otro local desde el cliente).
- **notification_reads**: el usuario solo inserta/actualiza/ve sus filas; la notificación referenciada debe ser del mismo local.
- **user_devices**: `user_id = auth.uid()` y `local_id = current_local_id()`.
- **mark_all_notifications_read_for_local**: `SECURITY DEFINER`, solo `authenticated`; marca lecturas solo para notificaciones del local actual.
