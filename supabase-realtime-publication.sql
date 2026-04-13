-- =============================================================================
-- Activar Realtime para Chef-One (mismo usuario / mismo local en varios dispositivos)
-- =============================================================================
-- Dónde ejecutarlo: Supabase Dashboard → SQL → New query → pegar todo → Run
--
-- Qué hace: registra las tablas en la publicación `supabase_realtime` para que
-- la app reciba cambios al instante (pedidos, mermas, catálogo proveedores…).
--
-- Si una línea falla con "already member of publication", esa tabla ya estaba: OK.
-- =============================================================================

do $$
declare
  tbl text;
  tables text[] := array[
    'products',
    'mermas',
    'purchase_orders',
    'purchase_order_items',
    'pedido_suppliers',
    'pedido_supplier_products',
    'appcc_cold_units',
    'appcc_temperature_readings',
    'appcc_fryers',
    'appcc_oil_events',
    'inventory_local_categories',
    'inventory_items',
    'inventory_movements',
    'local_chat_messages'
  ];
begin
  foreach tbl in array tables
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
      raise notice 'Realtime: añadida tabla %', tbl;
    exception
      when duplicate_object then
        raise notice 'Realtime: % ya estaba en supabase_realtime', tbl;
      when undefined_table then
        raise notice 'Realtime: tabla public.% no existe en este proyecto (omite)', tbl;
    end;
  end loop;
end $$;

-- Comprueba el resultado (deberías ver varias filas, no 0 tablas):
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;

-- =============================================================================
-- Módulos nuevos en el futuro (ej. escandallos)
-- =============================================================================
-- 1) SUPABASE — Publicación (este archivo)
--    - Crea las tablas del módulo en SQL (con local_id si es multi-local).
--    - APPCC: supabase-appcc-schema.sql (frío); supabase-appcc-aceite-schema.sql (freidoras).
--    - Inventario: supabase-inventory-schema.sql (catálogo global + stock por local).
--    - Añade el nombre de cada tabla NUEVA al array `tables` de arriba y vuelve a
--      ejecutar solo el bloque `do $$ ... end $$` (o un ALTER manual).
--    - Comprueba con el SELECT final que aparecen en pg_publication_tables.
--
-- 2) SUPABASE — Realtime en el proyecto
--    - Database → Publications: la tabla debe listarse bajo supabase_realtime.
--    - RLS: políticas para que authenticated solo vea filas de su local (como
--      products/mermas/pedidos). Sin RLS correcto, o no ves datos o ves de más.
--
-- 3) APP (Next.js)
--    - Donde cargues datos del módulo (Provider o layout del módulo), suscríbete
--      con supabase.channel().on('postgres_changes', { table: '...', filter:
--      'local_id=eq.' || localId }, ...) y haz refetch / setState con debounce
--      (~1–2 s), igual que PedidosOrdersProvider o MermasStoreProvider.
--    - Tras mutaciones (guardar/borrar), sigue siendo buena práctica refrescar
--      desde servidor o disparar el mismo refetch que use Realtime.
--
-- Resumen: tabla nueva → publicación supabase_realtime + RLS + suscripción en código.
-- =============================================================================
