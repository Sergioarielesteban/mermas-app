# Configuración multi-local (Supabase)

La app puede usar tablas por local (`locals`, `profiles`, `products`, `mermas`) en lugar del snapshot JSON por email. El SQL base está en `supabase-multilocal-schema.sql`.

## 1. Aplicar el esquema

En **Supabase → SQL → New query**, pega y ejecuta el contenido de `supabase-multilocal-schema.sql` (o ejecútalo por partes si ya existen tablas).

## 2. Locales de ejemplo

El script incluye un seed con códigos `MATARO` y `PREMIA`. Para añadir otro local:

```sql
insert into public.locals (code, name, city)
values ('CODIGO_UNICO', 'Nombre visible', 'Ciudad')
on conflict (code) do nothing;
```

## 3. Perfil por usuario

No hay política RLS de **insert** en `profiles` para usuarios normales: los perfiles se crean con rol de servicio o desde el **SQL Editor** (postgres).

1. Crea el usuario en **Authentication** (o ya existente).
2. Obtén su `user_id`:

```sql
select id, email from auth.users where email = 'usuario@ejemplo.com';
```

3. Inserta el perfil enlazando al local:

```sql
insert into public.profiles (user_id, email, local_id, role)
values (
  'UUID_DE_auth.users',
  'usuario@ejemplo.com',
  (select id from public.locals where code = 'MATARO' limit 1),
  'staff'
);
```

`email` en `profiles` debe coincidir con el del usuario de auth (y es único).

## 4. Realtime (opcional)

Para que varios dispositivos vean cambios al instante: **Database → Replication** y activa `products` y `mermas` para la publicación `supabase_realtime` (o el flujo que use tu proyecto).

## 5. Variables de entorno

La app necesita `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (y opcionalmente `SUPABASE_URL` en servidor). Tras cambios, redeploy.

## 6. Comportamiento en la app

- Con sesión Supabase y fila en `profiles` con `local_id`, la app carga y guarda productos/mermas en esas tablas (aisladas por RLS al local del usuario).
- Sin perfil o sin Supabase, sigue el modo anterior (localStorage + API de snapshot, según configuración).
