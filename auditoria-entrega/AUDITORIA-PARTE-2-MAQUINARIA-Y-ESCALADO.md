# Chef-One / Mermas — Parte 2: Maquinaria y escalado (auditoría)

---

## 1. Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Framework frontend / SSR | **Next.js 16** (App Router), **React 19** |
| Lenguaje | **TypeScript** |
| Estilo UI | **Tailwind CSS 4**, componentes propios |
| Autenticación y base de datos | **Supabase** (`@supabase/supabase-js`): Postgres, Auth, RLS, Realtime donde está habilitado |
| Despliegue típico | **Vercel** (`vercel.json`, cron) |
| PDF / informes | **jsPDF**, **jspdf-autotable** |
| Gráficos | **Recharts** |
| Animación | **Framer Motion** |
| OCR | **AWS Textract** (`@aws-sdk/client-textract`); rutas API bajo `app/api/pedidos/` |
| Excel | **xlsx** (importaciones / exportaciones) |
| QR | **html5-qrcode**, **qrcode** |

**Lenguajes:** principalmente TS/TSX; SQL de esquema y migraciones en archivos `supabase*.sql` en la raíz del repo.

---

## 2. Base de datos e integridad multi-local

- **PostgreSQL** (Supabase) con tablas operativas ligadas a **`local_id`**.
- **Row Level Security (RLS)** para que cada usuario autenticado solo acceda a datos de su local (según políticas desplegadas).
- Numerosos scripts SQL versionados: pedidos, inventario, escandallos, finanzas, personal, cocina central, migraciones incrementales.

---

## 3. Integraciones conocidas en código

| Integración | Uso |
|-------------|-----|
| **Supabase** | Auth, datos, storage según módulo |
| **Vercel** | Hosting, **cron** (p. ej. resumen semanal) |
| **Twilio WhatsApp** | Envío automático de resumen (cron); ver `README.md` y `/api/cron/weekly-whatsapp` |
| **AWS Textract** | OCR de documentos de pedidos / albaranes |
| **OpenAI** (opcional) | Asistente “Oído Chef” si se configuran claves en el despliegue |
| **WhatsApp (cliente)** | Enlaces `api.whatsapp.com` para envío manual de pedidos desde el navegador |

**TPV:** no hay SDK de TPV en `package.json`. La referencia a **códigos TPV** aparece en el discurso de producto (escandallos / importación de ventas); la integración concreta depende de exportaciones o flujos definidos en `lib/` y SQL (revisar módulo finanzas / escandallos en el ZIP de código).

**Pasarelas de pago (Stripe, Redsys, etc.):** **no** figuran como dependencias npm en el manifiesto actual; el modelo de cobro al cliente final de Chef-One es **externo** a la app (contrato / facturación manual o otro sistema).

---

## 4. Variables de entorno (orientación)

Ver **`.env.example`** en el ZIP de código: URLs Supabase, claves reservadas al servidor, secretos de cron, Twilio, opcionales para OCR/IA, teléfono público de contacto en landing, etc.

---

## 5. Escalado y empaquetado

- **Horizontal por locales:** nuevos `locals` + perfiles con `local_id`; mismo despliegue, datos aislados por RLS.
- **Vertical por plan:** más módulos activos en planes superiores (`lib/planPermissions.ts`).
- **CI/CD:** build `next build`; sin Docker obligatorio en repo (despliegue serverless típico en Vercel).
- **Marketing:** landing estática/SSR en `/`, formulario de leads (`/api/leads` si está activo en despliegue).

---

## 6. Qué incluye el ZIP “Parte 2”

Código fuente completo del repositorio **excluyendo** artefactos regenerables (`node_modules`, `.next`, cachés), más este documento. Para ejecutar en local: `npm install` y `npm run dev` según `README.md`.

---

*Documento generado para auditoría. Revisar `package.json` y `app/api/` para el detalle fino de endpoints.*
