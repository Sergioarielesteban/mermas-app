## App de Mermas (Next.js)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## WhatsApp semanal automatico (Opcion A)

Se implemento:
- Sincronizacion automatica del estado local a Supabase (`/api/sync`) cuando cambian productos/mermas.
- Cron en Vercel (`/api/cron/weekly-whatsapp`) para enviar resumen semanal por WhatsApp.
- Envio con Twilio WhatsApp.

### 1) Crear tabla en Supabase

Ejecuta el SQL de `supabase-schema.sql` en tu proyecto Supabase.

### 2) Variables de entorno (Vercel/Local)

Configura:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM` (ej: `whatsapp:+14155238886`)
- `WHATSAPP_TO` (tu numero: `whatsapp:+34622915421`)
- `WEEKLY_REPORT_EMAIL` (email permitido que usa la app)
- `CRON_SECRET` (token secreto para proteger el endpoint cron)

### 3) Cron semanal lunes 08:00 Madrid

`vercel.json` incluye dos disparos (06:00 y 07:00 UTC) y el endpoint valida hora local Madrid para cubrir horario de invierno/verano.

Para invocar manualmente:

```bash
curl -H "Authorization: Bearer TU_CRON_SECRET" https://TU_DOMINIO/api/cron/weekly-whatsapp
```

## Multi-local aislado (Mataro, Premia, etc.)

Si quieres que cada local tenga sus datos independientes:

1. Ejecuta `supabase-multilocal-schema.sql` en Supabase.
2. Crea un perfil por usuario en `public.profiles` asignando su `local_id`.
3. Usa solo consultas autenticadas (no service role en cliente), para que aplique RLS.

### Como funciona el aislamiento

- Cada tabla operativa (`products`, `mermas`) tiene `local_id`.
- RLS fuerza que un usuario solo vea/escriba su propio `local_id`.
- Puedes desplegar nuevas versiones de la app sin mezclar datos entre locales.
