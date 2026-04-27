-- Un mismo usuario de app no puede estar vinculado a dos fichas en el mismo local.
-- Ejecutar en Supabase si aún no existe el índice.

create unique index if not exists uq_staff_employees_local_user
  on public.staff_employees (local_id, user_id)
  where user_id is not null;
