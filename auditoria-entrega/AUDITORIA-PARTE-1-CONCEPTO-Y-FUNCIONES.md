# Chef-One / Mermas — Parte 1: Concepto y funciones (auditoría)

**Producto comercial:** operaciones de cocina y restaurante multi-local (España), marca de producto **Chef-One** en la landing; código interno del paquete npm `chef-one`.

---

## 1. Propósito de la app

Centralizar en **una sola aplicación web** (móvil y escritorio) lo que en muchos locales vive repartido entre **WhatsApp, Excel, cuadernos y carpetas**: pedidos a proveedores, recepción y albaranes, mermas, APPCC (limpieza, frío, aceite), listas de chequeo, inventario, escandallos y costes, finanzas operativas, personal, consumo interno del equipo, chat por local, y módulos de **cocina central** para quien produce para varias sedes.

El objetivo es **trazabilidad**, **menos pérdida de información entre turnos** y **números coherentes** (compras, mermas, coste de plato) sin obligar al equipo a aprender “otro ERP” rígido.

---

## 2. Problemas que resuelve en el restaurante


| Problema típico                                                    | Cómo lo aborda la solución                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Pedidos y recepción desconectados; el que pide no es el que recibe | Mismo listado de pedidos, estados (borrador / enviado / recibido), recepción con incidencias            |
| Albarán en papel o foto sin volcar a sistema                       | OCR (AWS Textract u OCR interno) para proponer cantidades y precios; el usuario valida antes de guardar |
| Mermas sin motivo ni cifra                                         | Registro rápido con motivo y coste orientativo; historial                                               |
| APPCC en hojas sueltas                                             | Temperaturas, aceite, limpieza con historial y exportación                                              |
| Coste de plato desconectado de la compra real                      | Escandallos con ingredientes, unidades de uso, importación de ventas por código TPV cuando se configura |
| Varios locales mezclando datos                                     | Aislamiento por `local_id` en base de datos (Supabase + RLS)                                            |
| Coordinación solo por grupos externos                              | Chat por local dentro de la app                                                                         |
| Control de acceso por “lo que contratas”                           | Planes (Operativo / Control / Pro) que abren o cierran módulos                                          |


---

## 3. Funcionalidades principales (visión MVP / producto)

Desglose alineado con permisos de plan en código (`lib/planPermissions.ts`):

- **Plan OPERATIVO:** pedidos, mermas, APPCC, checklist, chat, servicio (plato del día / carta operativa).
- **Plan CONTROL:** lo anterior + inventario, escandallos, producción (planes de elaboración).
- **Plan PRO:** lo anterior + cocina central, finanzas, personal, comida personal (consumo interno).

Módulos descritos comercialmente (textos y beneficios) en `components/marketing/moduleDefinitions.ts`: pedidos y recepción (incl. OCR), Oído Chef (asistente por voz/texto), mermas, APPCC, checklist, producción, inventario, escandallos, consumo interno, chat; roadmap explícito para horarios, fichaje y mensajes de “próximamente” donde aplica.

---

## 4. Flujo de usuario (resumen)

1. **Autenticación** (Supabase Auth) y **perfil** con `local_id` (y rol según módulo).
2. **Landing pública** (`/`) — propuesta de valor, módulos, formulario de contacto / llamada / WhatsApp.
3. **Onboarding / selección de contexto** según despliegue.
4. **Navegación por módulos** (bottom nav / menú): según plan, ve Pedidos, Mermas, APPCC, etc.
5. **Pedidos:** proveedores → catálogo → nuevo pedido → envío (p. ej. WhatsApp con mensaje generado) → recepción / OCR albarán.
6. **Mermas / APPCC / Checklist:** registro por turno o día con historial.
7. **Inventario / Escandallos / Finanzas:** capas más analíticas (planes superiores).
8. **Superadmin / multi-local** (cuando aplica): gestión de locales y permisos.

---

## 5. Modelo de negocio y precios

- **SaaS B2B por local:** el producto se empaqueta en **tres niveles de plan** (Operativo, Control, Pro) con **conjuntos de módulos** distintos (ver `PLAN_MODULES` en `lib/planPermissions.ts`).
- **Precios públicos:** la landing puede mostrar planes **sin cifra fija** (“próximamente” u oferta comercial directa), según la política comercial del momento; la **lógica de empaquetado** está en código (qué rutas exigen qué plan).
- **No hay pasarela de pago integrada en la app** para checkout del suscriptor final en el repositorio analizado: la relación comercial (facturación, contrato) es **externa** a la aplicación; la app **aplica** el plan almacenado en perfil / suscripción en Supabase cuando corresponde.

---

## 6. Qué incluye el ZIP “Parte 1”

- Este documento.
- `README.md` del repositorio (arranque y notas generales).
- Definición comercial de módulos: `components/marketing/`**.
- Página de planes: `app/planes/`**.
- Entrada de producto público: `app/page.tsx`.
- Reglas de empaquetado por plan: `lib/planPermissions.ts`, `lib/moduleAccessControl.ts`, `lib/canAccessModule.ts`, `lib/subscriptions-supabase.ts` (cuando exista en el zip).

**Parte 2** del entrega contiene el stack, integraciones, SQL, APIs y el resto del código.

---

*Documento generado para auditoría. Contenido funcional revisado frente al código en fecha de empaquetado.*