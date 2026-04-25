-- Extiende unidades de pedido: docena, litro, ml, g (además de las existentes).
-- Ejecución: Supabase SQL Editor **después** de supabase-pedidos-schema.sql.
-- Asigna la misma lista a `unit`, `recipe_unit` y `billing_unit` en catálogo y a `unit`/`billing_unit` en líneas de pedido.

do $$
  declare
    u text[] := array[
      'kg','ud','bolsa','racion','caja','paquete','bandeja',
      'docena','litro','ml','g'
    ];
    ulist text;
  begin
    ulist := (select string_agg(quote_literal(x), ',') from unnest(u) as x);

    -- pedido_supplier_products.unit
    execute format($f$
      alter table public.pedido_supplier_products
        drop constraint if exists pedido_supplier_products_unit_check;
      alter table public.pedido_supplier_products
        add constraint pedido_supplier_products_unit_check
        check (unit in (%s));
    $f$, ulist);

    -- recipe_unit
    execute format($f$
      alter table public.pedido_supplier_products
        drop constraint if exists pedido_supplier_products_recipe_unit_check;
      alter table public.pedido_supplier_products
        add constraint pedido_supplier_products_recipe_unit_check
        check (
          recipe_unit is null
          or recipe_unit in (%s)
        );
    $f$, ulist);

    -- billing_unit
    execute format($f$
      alter table public.pedido_supplier_products
        drop constraint if exists pedido_supplier_products_billing_unit_check;
      alter table public.pedido_supplier_products
        add constraint pedido_supplier_products_billing_unit_check
        check (
          billing_unit is null
          or billing_unit in (%s)
        );
    $f$, ulist);

    -- purchase_order_items.unit
    execute format($f$
      alter table public.purchase_order_items
        drop constraint if exists purchase_order_items_unit_check;
      alter table public.purchase_order_items
        add constraint purchase_order_items_unit_check
        check (unit in (%s));
    $f$, ulist);

    execute format($f$
      alter table public.purchase_order_items
        drop constraint if exists purchase_order_items_billing_unit_check;
      alter table public.purchase_order_items
        add constraint purchase_order_items_billing_unit_check
        check (
          billing_unit is null
          or billing_unit in (%s)
        );
    $f$, ulist);
  end
$$;

comment on table public.pedido_supplier_products is
'Catálogo de compra: `unit` = unidad de pedido al proveedor; `price_per_unit` = precio por esa unidad; '
' `units_per_pack` = unidades de uso interno (receta) por 1 unidad de pedido; `recipe_unit` = unidad de uso interna cuando aplica.';
