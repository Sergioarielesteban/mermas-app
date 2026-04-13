-- Renombrar categoría de catálogo (inventario): «Producción Champanillo» → «Producción propia»
-- Ejecutar en Supabase SQL Editor (una vez por proyecto que ya tuviera el seed antiguo).

update public.inventory_catalog_categories
set name = 'Producción propia'
where lower(trim(name)) in ('producción champanillo', 'produccion champanillo');

update public.inventory_catalog_items
set format_label = replace(format_label, 'PRODUCCIÓN CHAMPANILLO', 'PRODUCCIÓN PROPIA')
where format_label like '%PRODUCCIÓN CHAMPANILLO%';
