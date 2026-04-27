-- Permite LECTURA de platos (escandallo_recipes) a cualquier usuario autenticado del local.
-- La edición de recetas escandallo sigue restringida a admin vía la política de escritura.
-- Necesario para que la matriz de alérgenos muestre la misma carta a STAFF, MANAGER y ADMIN.
-- Ejecutar en Supabase tras supabase-security-escandallos-admin-rls.sql si aplica.
--
-- La política "escandallo_recipes same local write" (FOR ALL + admin) sigue gobernando
-- INSERT/UPDATE/DELETE; en modo PERMISSIVE, el SELECT se permite si esta política de solo lectura
-- coincide (mismo local) aunque el usuario no sea admin.

drop policy if exists "escandallo_recipes same local read" on public.escandallo_recipes;

create policy "escandallo_recipes same local read"
on public.escandallo_recipes
for select
to authenticated
using (local_id = public.current_local_id());
