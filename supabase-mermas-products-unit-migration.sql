-- Ampliar unidades permitidas en productos de mermas (artículo máster, composición, etc.).
-- Antes solo: kg, ud, bolsa, racion — insuficiente para unidad de uso (g, litro, ml, caja…).

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
      'caja',
      'paquete',
      'bandeja',
      'docena',
      'litro',
      'ml'
    )
  );
