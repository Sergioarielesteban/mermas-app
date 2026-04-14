-- Seed opcional: categorías y tareas de limpieza para el local MATARO (Champanillo / referencia operativa).
-- Requiere: supabase-appcc-limpieza-schema.sql ya aplicado; fila en public.locals con code = 'MATARO'.
--
-- Idempotencia: solo inserta si el local MATARO no tiene ninguna fila en appcc_cleaning_tasks.
-- Si ya creaste tareas a mano, este script no hace nada (evita duplicados).
--
-- Ejecutar en Supabase → SQL Editor (una vez).

do $$
declare
  lid uuid;
  n_tasks int;
  cat_neveras uuid;
  cat_cong uuid;
  cat_maq uuid;
  cat_areas uuid;
begin
  select id into lid
  from public.locals
  where upper(trim(code)) = 'MATARO'
  limit 1;

  if lid is null then
    raise notice 'appcc limpieza seed: no hay local con code MATARO; no se inserta nada.';
    return;
  end if;

  select count(*)::int into n_tasks
  from public.appcc_cleaning_tasks
  where local_id = lid;

  if n_tasks > 0 then
    raise notice 'appcc limpieza seed: MATARO ya tiene tareas de limpieza (%); no se inserta.', n_tasks;
    return;
  end if;

  insert into public.appcc_cleaning_categories (local_id, name, sort_order)
  values
    (lid, 'Neveras', 0),
    (lid, 'Congeladores', 1),
    (lid, 'Máquinas', 2),
    (lid, 'Áreas y superficies', 3)
  on conflict (local_id, name) do nothing;

  select id into cat_neveras from public.appcc_cleaning_categories where local_id = lid and name = 'Neveras';
  select id into cat_cong from public.appcc_cleaning_categories where local_id = lid and name = 'Congeladores';
  select id into cat_maq from public.appcc_cleaning_categories where local_id = lid and name = 'Máquinas';
  select id into cat_areas from public.appcc_cleaning_categories where local_id = lid and name = 'Áreas y superficies';

  if cat_neveras is null or cat_cong is null or cat_maq is null or cat_areas is null then
    raise exception 'appcc limpieza seed: faltan categorías tras insert (revisa unicidad local_id + name).';
  end if;

  insert into public.appcc_cleaning_tasks (local_id, category_id, title, instructions, sort_order, is_active)
  values
    (lid, cat_neveras, 'Nev. 1 (quesos)', 'Vaciar si procede, higienizar interior y estanterías; montar con orden de caducidad (FIFO).', 0, true),
    (lid, cat_neveras, 'Nev. 2 (frankfur)', 'Revisar producto, limpiar cajones y guías; secar y montar con orden.', 1, true),
    (lid, cat_neveras, 'Nev. 3 (carnes)', 'Limpiar y desinfectar según protocolo; comprobar temperatura y orden de uso.', 2, true),
    (lid, cat_neveras, 'Nev. 4 (C. frío)', 'Vaciar según plan, fregar interior y estanterías; remontar con fechas visibles.', 3, true),
    (lid, cat_neveras, 'Nev. 6 (Chafas)', 'Limpiar bandejas y zona de goteo; revisar restos de grasa.', 4, true),
    (lid, cat_neveras, 'Nev. 7 (Plancha 3 y 4)', 'Limpieza de interior y rejillas; superficies sin restos de alimentos.', 5, true),
    (lid, cat_neveras, 'Nev. 8 (Plancha 1 y 2)', 'Igual que planchas anteriores: interior, cajones y orden.', 6, true),
    (lid, cat_neveras, 'Nev. 9 (Verduras)', 'Cajones al lavavajillas si aplica; interior fregado; montar con consumo prioritario.', 7, true),
    (lid, cat_neveras, 'Nev. 10 (Tartas)', 'Superficies y estantes limpios; empaquetado y fechas correctas.', 8, true),

    (lid, cat_cong, 'Cong. 1 (rep. fritos)', 'Según plan: vaciar a cámara si toca, desenchufar si procede; cajones por lavavajillas; interior y remonte.', 0, true),
    (lid, cat_cong, 'Cong. 2 (Patatas)', 'Vaciar, fregar estanterías e interior; montar con orden de fechas.', 1, true),
    (lid, cat_cong, 'Cong. 3 y 4 (fritos)', 'Limpieza profunda de cajones e interior; verificar cierre y hielo.', 2, true),
    (lid, cat_cong, 'Cong. 5 (Cámara)', 'Revisar carga, limpieza de suelo y estanterías; sin acumulación de hielo.', 3, true),

    (lid, cat_maq, 'Cortadora de embutidos', 'Desmontar piezas según manual; limpiar y desinfectar; engrasar si procede.', 0, true),
    (lid, cat_maq, 'Freidora grande', 'Filtrado / cambio de aceite según APPCC; limpieza de cubeta y zona.', 1, true),
    (lid, cat_maq, 'Chafa bocatas', 'Planchas y superficies sin restos; bandeja y zona de trabajo.', 2, true),
    (lid, cat_maq, 'Impresoras y monitor', 'Superficies, teclas y pantalla sin grasa; cables ordenados.', 3, true),

    (lid, cat_areas, 'Altillo packaging', 'Barrer / fregar; material ordenado y sin polvo.', 0, true),
    (lid, cat_areas, 'Zona producción', 'Suelos, mesas y pasos libres; utensilios en su sitio.', 1, true),
    (lid, cat_areas, 'Área de pica', 'Pica desinfectada; rejillas y desagües revisados.', 2, true),
    (lid, cat_areas, 'Área de pase', 'Superficies y suelo; sin obstáculos ni restos.', 3, true),
    (lid, cat_areas, 'Paredes', 'Salpicaduras y zonas de contacto higienizadas.', 4, true),
    (lid, cat_areas, 'Detrás de neveras', 'Acceso seguro; polvo y restos retirados.', 5, true),
    (lid, cat_areas, 'Campanas', 'Filtros y superficies visibles según frecuencia acordada.', 6, true);

  raise notice 'appcc limpieza seed: insertadas tareas de limpieza para MATARO (local_id=%).', lid;
end $$;
