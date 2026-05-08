# Chef One — Documento de arquitectura técnica

Documento maestro para **onboarding** de desarrolladores senior y para **agentes de IA** que trabajen sobre el repositorio. Describe el estado del monorepo de aplicación (Next.js) tal como está en código; las migraciones SQL en raíz son la referencia de esquema Supabase.

---

## Visión general

### Qué es Chef One

**Chef One** es una aplicación web **multi-local** orientada a la **operación diaria de restaurantes y grupos de hostelería**: compras, producción, trazabilidad, cumplimiento (APPCC), inventario, personal y comunicación interna. El nombre comercial en metadata es «Chef-One»; el paquete npm se llama `chef-one`.

### Objetivo del producto

Reducir fricción operativa en cocina y dirección: **menos papel, menos Excel**, más flujos guiados en **móvil y tablet**, con datos centralizados en **Supabase** y despliegue en **Vercel**.

### Tipo de SaaS

- **B2B SaaS** por **local** (`locals`): cada sede tiene datos acotados por RLS y un **plan de suscripción** (`OPERATIVO` | `CONTROL` | `PRO`) que habilita módulos.
- **Roles de aplicación** (`admin` | `manager` | `staff`) definidos en perfil; el **admin** hace bypass de plan para desarrollo/gestión.
- **Superadmin** opcional (allowlist por email) para operaciones de plataforma.

### Filosofía operativa

- **Una sola fuente de verdad** en Postgres (Supabase); la app es cliente.
- **Mobile-first**: formularios táctiles, listas densas pero legibles, navegación inferior en módulos largos.
- **Módulos acoplados de forma laxa** vía rutas y `lib/`*; se evita cargar realtime pesado fuera del contexto del módulo (ej. pedidos solo bajo `/pedidos`).

### Enfoque mobile-first para hostelería

- Viewport con `maximumScale: 1` y `userScalable: false` en `app/layout.tsx` (UX tipo app; revisar accesibilidad si se relaja).
- **PWA**: `manifest.webmanifest`, `PwaRegister`, iconos Apple, sesión Supabase en `localStorage` para reanudar en PWA.
- Pantallas especiales **full-bleed** sin shell estándar: login, fichaje terminal, impresión de etiquetas, etc. (`AppFrame`).

---

## Stack tecnológico


| Capa          | Tecnología                                                                                                | Notas en repo                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Framework     | **Next.js 16** (App Router)                                                                               | `package.json`: `next@16.2.2`                                          |
| UI            | **React 19**                                                                                              | `react@19.2.4`                                                         |
| Lenguaje      | **TypeScript 5**                                                                                          | Strict típico de proyecto Next                                         |
| Estilos       | **Tailwind CSS 4**                                                                                        | `@import "tailwindcss"` en `app/globals.css`                           |
| Backend datos | **Supabase**                                                                                              | `@supabase/supabase-js`; cliente singleton en `lib/supabase-client.ts` |
| Hosting       | **Vercel** (implícito)                                                                                    | `vercel.json` (crons); `NEXT_PUBLIC_SITE_URL` para metadata            |
| PWA           | **Web App Manifest + SW**                                                                                 | `app/manifest.ts`, `public/sw.js` vía `PwaRegister`                    |
| Tiempo real   | **Supabase Realtime**                                                                                     | Canales por `localId` en varios módulos (ver sección Datos)            |
| Otros         | **qrcode**, **jspdf**, **AWS Textract** (OCR pedidos/albaranes), **html5-qrcode**, **recharts**, **xlsx** | Según dependencias en `package.json`                                   |


### App Router

- `**app/layout.tsx`**: fuente global, fuentes (Lora + Geist Mono), providers (`AuthProvider`, `AppDialogProvider`, `MermasStoreProvider`, `AppFrame`).
- **Rutas por carpeta** bajo `app/<modulo>/.../page.tsx`.
- **Layouts anidados** en módulos que necesitan providers locales: `app/pedidos/layout.tsx`, `app/personal/layout.tsx`, `app/cocina-central/layout.tsx`, `app/finanzas/layout.tsx`, `app/panel/layout.tsx`.
- **API routes** bajo `app/api/` (ej. crons WhatsApp en `vercel.json`).

### Convención importante (Next.js)

El proyecto incluye `AGENTS.md` que recuerda leer la documentación empaquetada de Next en `node_modules/next/dist/docs/` ante APIs nuevas o deprecadas.

---

## Estructura del proyecto

```
app/                 # Rutas App Router, layouts, API, manifest, globals.css
components/          # Componentes React compartidos (shell, providers, UI por dominio)
lib/                 # Lógica de dominio, clientes Supabase por módulo, permisos, utilidades
hooks/               # Hooks reutilizables (p. ej. staff bundle, realtime)
services/            # Servicios auxiliares (si aplica)
data/                # Datos estáticos o seeds ligeros
public/              # Assets estáticos, logos, manifest consumido por el navegador
scripts/             # Scripts de mantenimiento / utilidad
```

### `app/`

- `**page.tsx**`, `**login/**`, `**onboarding/**`, `**panel/**`: entrada y hub.
- **Módulos de negocio**: carpetas de primer nivel (`pedidos`, `produccion`, `cocina-central`, `finanzas`, `inventario`, `escandallos`, `appcc`, `servicio`, `checklist`, `comida-personal`, `personal`, `chat`, etc.).
- `**terminal-fichaje/`**: kiosk PIN para asistencia.
- `**api/`**: rutas server (cron, integraciones).
- `**manifest.ts**`: generación del manifest PWA.

### `components/`

- `**AppShell.tsx` / `AppFrame.tsx` / `BottomNav.tsx**`: cáscara, header rojo, navegación inferior, rutas especiales sin shell.
- `**AuthProvider.tsx**`: sesión, perfil, local activo, plan, superadmin.
- `**RoleRouteGate.tsx**`: bloqueo por plan + rol; redirección a `/panel` o `/planes`.
- `**MermasStoreProvider.tsx**`: estado y realtime de **mermas / catálogo** en contextos de ruta acotados.
- `**PedidosOrdersProvider.tsx`**: estado y realtime de **pedidos** (montado solo bajo `app/pedidos`).
- Dominio: `components/pedidos/`, notificaciones, marketing, etc.

### `lib/`

- `**supabase-client.ts`**: cliente browser, sesión persistente.
- `**permissions.ts`**, `**canAccessModule.ts**`, `**planPermissions.ts**`: matriz **plan × rol × módulo**.
- `**chef-ops-supabase.ts`**, `**pedidos-supabase.ts`**, `**cocina-central-supabase.ts**`, etc.: acceso a datos por dominio.
- `**app-navigation.ts**`: breadcrumbs y títulos por ruta.
- `**production-label-config.ts**`: plantillas de etiquetas (mm), CSS de impresión.

### `hooks/`

- Ej.: `useStaffBundle`, `useStaffRealtime` — carga de equipo + suscripción a cambios.

### `stores/`

**No hay carpeta `stores/` dedicada.** El patrón actual es:

- **Context + provider** (`MermasStoreProvider`, `PedidosOrdersProvider`, `AuthProvider`).
- **Estado local** en páginas con `useState` / `useMemo` / debounce para escritura.

### `providers/`

Los “providers” viven como componentes en `components/` e integran el árbol en `app/layout.tsx` o layouts de módulo.

### Supabase (en repo)

- Esquemas y migraciones como archivos `**supabase-*.sql`** en la raíz (no un único `supabase/` CLI estándar).
- Convención por prefijo: `supabase-pedidos-*`, `supabase-chef-production-*`, `supabase-cocina-central-*`, `supabase-inventory-*`, `supabase-appcc-*`, `supabase-staff-*`, `supabase-finanzas-*`, `supabase-comida-personal-*`, `supabase-local-chat.sql`, etc.

### Layouts y rutas

- **Global**: `app/layout.tsx`.
- **Por módulo**: ver lista de `app/*/layout.tsx` arriba.
- **Rutas sensibles**: `isRouteBlockedForRole` e `isPotentiallyRoleGatedPath` en `lib/permissions.ts`.

### Módulos (mapa rápido)


| Prefijo ruta                           | Plan module (`planPermissions`) |
| -------------------------------------- | ------------------------------- |
| `/pedidos`                             | `pedidos`                       |
| `/dashboard`, `/productos`, `/resumen` | `mermas`                        |
| `/produccion`                          | `produccion`                    |
| `/cocina-central`                      | `cocina_central`                |
| `/finanzas`                            | `finanzas`                      |
| `/appcc`                               | `appcc`                         |
| `/inventario`                          | `inventario`                    |
| `/escandallos`                         | `escandallos`                   |
| `/personal`, `/terminal-fichaje`       | `personal`                      |
| `/comida-personal`                     | `comida_personal`               |
| `/servicio`                            | `servicio`                      |
| `/checklist`                           | `checklist`                     |
| `/chat`                                | `chat`                          |


---

## Módulos actuales

Para cada módulo: **objetivo**, **lógica principal**, **relaciones**, **SQL de referencia** (archivos en raíz), **piezas UI clave**.

### Pedidos

- **Objetivo**: Gestión del ciclo de compra a proveedores (líneas, envío, recepción, precios, albaranes).
- **Lógica principal**: `lib/pedidos-*.ts`, `lib/pedidos-supabase.ts`; UI en `app/pedidos/`**.
- **Relaciones**: Inventario (artículos/costes), cocina central en entornos multi-sede, PDF/WhatsApp según utilidades.
- **Tablas Supabase**: ver `supabase-pedidos-schema.sql` y migraciones `supabase-pedidos-*.sql`.
- **Componentes importantes**: `PedidosOrdersProvider` (fetch + canal `pedidos-orders-rt:${localId}`), `app/pedidos/layout.tsx` acota el provider al módulo.

### Producción

- **Objetivo**: Pizarra de **producción del día** por plantilla (bloques Lun–Jue / Vie–Dom, cantidades objetivo, “hecho”, cierre de día).
- **Lógica principal**: `lib/chef-ops-supabase.ts`, `app/produccion/page.tsx`, sesiones y líneas en Supabase.
- **Relaciones**: Escandallos/recetas (vida útil para etiquetas), etiquetas de impresión, personal opcional.
- **Tablas Supabase**: `supabase-chef-production-*.sql`, `supabase-chef-ops-*.sql`.
- **Componentes importantes**: página principal de tablero; flujo de impresión `app/produccion/etiquetas/print`; etiquetas manuales `app/produccion/etiquetas`.

### Cocina central

- **Objetivo**: Ordenes de producción central, lotes, entregas, QR de trazabilidad, catálogo hacia sedes.
- **Lógica principal**: `lib/cocina-central-*.ts`, `app/cocina-central/`**.
- **Relaciones**: Pedidos desde sedes (`pedidos-cocina`), inventario interno, etiquetas con QR (`lib/cocina-central-qr.ts`).
- **Tablas Supabase**: `supabase-cocina-central-*.sql` (esquema grande en `supabase-cocina-central-schema.sql`).
- **Componentes importantes**: páginas de lotes, etiquetas `app/cocina-central/etiquetas/[id]`, permisos `lib/cocina-central-permissions.ts`.

### Finanzas

- **Objetivo**: Módulo económico (compras, agregados, rentabilidad según rutas); restringido a administración y plan PRO.
- **Lógica principal**: `app/finanzas/`**, libs asociadas (`lib/*finanzas*` si existen en repo).
- **Relaciones**: Pedidos, mermas analíticas, datos de personal sensibles (subconjunto admin).
- **Tablas Supabase**: `supabase-finanzas-phase1.sql`, `supabase-finanzas-phase2-aggregates.sql`, RLS en `supabase-security-finanzas-admin-rls.sql`.

### Mermas

- **Objetivo**: Registro y análisis de mermas; parte del núcleo operativo (`mermas` en plan).
- **Lógica principal**: Rutas bajo `app/dashboard`, `app/productos`, `app/resumen` mapeadas a módulo `mermas`; `MermasStoreProvider` con realtime `mermas-local-rt:${localId}` en rutas relevantes.
- **Relaciones**: Productos del registro, objetivos € (analytics ejecutivo restringido a admin vía permisos).
- **Tablas Supabase**: `supabase-mermas-*.sql`, piezas en `supabase-schema.sql` según evolución.
- **Componentes importantes**: `MermasStoreProvider`, vistas de panel/resumen.

### APPCC

- **Objetivo**: Cumplimiento: aceite, limpieza, temperaturas, carta de alérgenos, etc.
- **Lógica principal**: `app/appcc/`**; canales realtime por página (ej. `appcc-readings`, `appcc-cleaning`, `appcc-oil`, `appcc-fryers`).
- **Relaciones**: Locales, posible inventario en registros cruzados.
- **Tablas Supabase**: `supabase-appcc-*.sql`.

### Inventario

- **Objetivo**: Stock y catálogo por local, costes, historial.
- **Lógica principal**: `app/inventario/page.tsx`, libs `lib/*inventory*` o nombres `supabase-inventory-*` alineados.
- **Relaciones**: Pedidos (recepción), producción, escandallos (costes).
- **Tablas Supabase**: `supabase-inventory-*.sql`.

### Escandallos

- **Objetivo**: Recetas, fichas técnicas, costes de carta; uso administrativo.
- **Lógica principal**: `app/escandallos/`**, libs de recetas/escandallo.
- **Relaciones**: Producción (vida útil), inventario, finanzas.
- **Tablas Supabase**: `supabase-escandallos-*.sql`, `supabase-escandallo-recipes-read-same-local.sql`, etc.

### Horarios (personal / staff)

- **Objetivo**: Equipo, turnos, fichaje, solicitudes según rol.
- **Lógica principal**: `app/personal/`**, `app/terminal-fichaje`, `lib/staff/*`, `hooks/useStaffRealtime.ts` (canal `staff-rt:${localId}`).
- **Relaciones**: Módulo plan `personal`; producción operativa; normas/manual.
- **Tablas Supabase**: `supabase-staff-*.sql`, `supabase-personal-normas-manual.sql`, asistencia `supabase-staff-attendance-schema.sql`.

### Servicio

- **Objetivo**: Flujos de servicio / carta / platos (módulo plan `servicio`).
- **Lógica principal**: `app/servicio/`**.
- **Relaciones**: Escandallos, producción de servicio.
- **Tablas Supabase**: `supabase-servicio-module.sql`.

### Checklist

- **Objetivo**: Listas de verificación operativas.
- **Lógica principal**: `app/checklist/`**.
- **Relaciones**: APPCC operativo, personal.
- **Tablas Supabase**: `supabase-chef-ops-checklist-*.sql`.

### Consumo interno

- **Objetivo**: Comida personal / consumo del staff (`comida-personal`).
- **Lógica principal**: `app/comida-personal/`**.
- **Relaciones**: Personal, posible contabilidad.
- **Tablas Supabase**: `supabase-comida-personal-*.sql`.

### Chat

- **Objetivo**: Mensajería por local.
- **Lógica principal**: `app/chat/page.tsx`, canal `local-chat-${localId}`.
- **Relaciones**: Notificaciones (`supabase-notifications.sql`, componentes de campana en shell).
- **Tablas Supabase**: `supabase-local-chat.sql`.

### Otros rutas relevantes

- `**/pedidos-cocina`**: pedidos de sede a cocina central (flujo cruzado con `cocina-central`).
- `**/superadmin`**, `**/planes**`, `**/cuenta/seguridad**`: gobierno de producto y cuenta.

---

## Sistema de datos

### Gestión de estado

1. **React Context**: auth, diálogos, mermas, pedidos (scoped).
2. **Estado local en página**: tablas editables con debounce (ej. producción “hecho”).
3. **Caché session/localStorage**: patrones en pedidos y perfil (ver comentarios en providers).

### Realtime

- Suscripciones **Postgres changes** vía `supabase.channel(...).subscribe()`.
- **Buenas prácticas ya presentes en código**:
  - Pedidos: provider **solo** bajo `/pedidos` (comentario en `app/pedidos/layout.tsx`).
  - Mermas: sincronización acotada a rutas donde tiene sentido (comentario en `MermasStoreProvider`).
- **Riesgo**: duplicar canales para el mismo `localId` en la misma página → revisar `useEffect` cleanup y nombres de canal únicos.

### Fetch patterns

- **Cliente browser**: `getSupabaseClient()` + funciones en `lib/*-supabase.ts`.
- **Sin capa unificada tipo React Query** visible; invalidación manual tras mutaciones o vía realtime.
- **Listas grandes**: usar paginación/límites en RPCs donde existan; evitar `select *` sin límite en tablas grandes (revisar por módulo).

### Problemas detectados (genéricos)

- **N+1 / over-fetch**: posible en pantallas que monten muchas filas sin virtualización.
- **Egress**: exportaciones PDF/Excel y catálogos completos; conviene filtros por fecha/local.
- **Realtime + refetch**: combinar eventos con reload completo puede duplicar trabajo.

### Optimizaciones pendientes (recomendaciones)

- Centralizar **política de caché** (SWR/React Query) para lecturas repetidas.
- **Índices y vistas** en SQL ya fragmentados en migraciones; mantener documentación de dependencias entre migraciones.
- **Telementría** de errores Supabase en producción (opcional).

---

## Sistema visual

### Filosofía

- **Marca roja** (`#D32F2F` / variantes) en header y CTAs críticos.
- **Tipografía**: serif (Lora) para titulares de marca; UI densa en sans del sistema / Tailwind.
- **Modo claro forzado** en `globals.css` (`color-scheme: light`) para evitar inputs invisibles en móvil con `prefers-color-scheme: dark`.

### Mobile-first

- Bottom nav en `AppFrame` para módulos estándar.
- Tarjetas (`rounded-2xl`, `ring-1`, sombras suaves) en paneles.
- **Safe area** y padding inferior reservado para la barra rápida.

### Navegación

- **AppShell**: menú lateral, breadcrumb contextual (`lib/app-navigation.ts`), botón volver jerárquico.
- **RoleRouteGate**: coherencia entre lo **visible** en menú y lo **accesible** por URL.

### Consistencia UX

- Reutilizar patrones de `AppShell` / `MermasStyleHero` donde existan.
- Evitar introducir otro sistema de color fuera de zinc + rojo marca sin motivo.

---

## Impresión

### Etiquetas

- **Configuración**: `lib/production-label-config.ts` — plantillas por **mm** (ej. 62×29, 62×50, 62×80 QR), campos por plantilla, CSS generado con `buildLabelPrintCss`.
- **Producción**: `app/produccion/etiquetas/print` (lotes desde sesión del día), `app/produccion/etiquetas` (manuales).
- **Cocina central**: `app/cocina-central/etiquetas/[id]` con **QR** (`qrcode` + URL de trazabilidad).
- **CSS print**: inyección en `document.head` en algunas pantallas para que `@page { size: … }` sea fiable en impresión; `print-color-adjust: exact` para evitar texto “en blanco” en ciertos navegadores.
- **Brother / macOS**: el navegador **no** puede fijar impresora; el usuario debe preajuste de papel en el sistema (documentado en `LabelPrintSetupTip`).

---

## Seguridad y roles

### Roles de aplicación

Definidos en `lib/profile-app-role` / `AuthProvider` como `**admin` | `manager` | `staff`**.

- **admin**: acceso completo a módulos; bypass de restricción de **plan** en `getModuleAccess`.
- **manager**: conjunto amplio operativo; **bloqueadas** rutas avanzadas de personal (`control`, `planificacion`, `solicitudes`, `incidencias`) según `isRouteBlockedForRole`.
- **staff**: subconjunto operativo (mermas, appcc, checklist, chat, servicio, producción, personal básico).

### Planes

- `OPERATIVO` < `CONTROL` < `PRO` en `lib/planPermissions.ts`; cada plan lista módulos permitidos.
- Sin plan válido o módulo fuera de plan → redirección a `**/planes`** (`RoleRouteGate`).

### Restricciones

- **RLS** en Supabase (archivos `supabase-security-*.sql`, políticas por tabla).
- **Gates de ruta** en cliente; no sustituyen auditoría en servidor — cualquier API Route debe validar sesión/local.
- **Cuenta y seguridad**: ruta restringida a `admin` (`canAccessCuentaSeguridad`).

---

## Objetivos futuros (roadmap orientativo)

- **IA integrada**: asistentes sobre datos operativos (resúmenes, alertas); respetar privacidad y coste.
- **OCR**: ya hay dependencia Textract y flujos de albarán en pedidos; ampliar calidad y feedback en UI.
- **Voice assistant**: comandos manos libres en cocina (integración futura).
- **Forecasting**: predicción de compra/producción desde histórico pedidos y mermas.
- **Automatizaciones**: reglas (ej. avisos WhatsApp — ya hay cron en `vercel.json`).
- **Multi-local avanzado**: roles por local, informes grupo, plantillas centralizadas (evolución de `locals` y suscripciones).

---

## Reglas importantes (para contribuidores e IA)

1. **Evitar refetch masivos** tras cada tecla; usar debounce o mutación optimista acotada.
2. **Limitar queries**: filtros por `local_id`, fechas y paginación; revisar RPCs existentes antes de nuevos `select`.
3. **Optimizar egress**: no descargar catálogos completos en cada visita; cache en contexto o storage con TTL claro.
4. **Realtime**: no suscribirse dos veces al mismo canal; siempre `removeChannel` / cleanup en `useEffect`.
5. **Consistencia visual**: Tailwind + patrones del shell; no añadir librerías CSS paralelas sin consenso.
6. **Permisos**: cualquier nueva ruta bajo módulos gatados debe añadirse a `moduleForPath`, `isRouteBlockedForRole` / `isPotentiallyRoleGatedPath` si aplica.
7. **Next.js**: revisar docs internas del paquete para cambios de versión (ver `AGENTS.md`).

---

## Referencias rápidas de archivos


| Concern          | Archivo(s)                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Auth y perfil    | `components/AuthProvider.tsx`                                                                      |
| Plan × rol       | `lib/canAccessModule.ts`, `lib/planPermissions.ts`, `lib/permissions.ts`                           |
| Gate de rutas    | `components/RoleRouteGate.tsx`                                                                     |
| Shell / nav      | `components/AppShell.tsx`, `components/AppFrame.tsx`, `lib/app-navigation.ts`                      |
| Cliente Supabase | `lib/supabase-client.ts`                                                                           |
| Etiquetas        | `lib/production-label-config.ts`, `app/produccion/etiquetas/`**, `app/cocina-central/etiquetas/`** |
| Pedidos realtime | `components/PedidosOrdersProvider.tsx`, `app/pedidos/layout.tsx`                                   |
| Mermas realtime  | `components/MermasStoreProvider.tsx`                                                               |
| Staff realtime   | `hooks/useStaffRealtime.ts`                                                                        |


---

*Última actualización del documento: alineada con el repositorio `chef-one` (Next 16, React 19, Tailwind 4). Mantener este archivo al evolucionar módulos o gates de acceso.*