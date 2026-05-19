-- Mermas · productos del registro: ampliar unidades permitidas en `public.products`.
-- El formulario de mermas puede heredar unidad de artículo máster (g, ml, litro…)
-- o de escandallo; el check original solo permitía kg/ud/bolsa/racion y rechazaba el INSERT.

alter table public.products
  drop constraint if exists products_unit_check;

alter table public.products
  add constraint products_unit_check
  check (
    unit in (
      'kg',
      'g',
      'ud',
      'bolsa',
      'racion',
      'litro',
      'ml',
      'caja',
      'paquete',
      'bandeja',
      'docena'
    )
  );

comment on constraint products_unit_check on public.products is
  'Unidades alineadas con lib/types Unit (mermas / catálogo productos).';
