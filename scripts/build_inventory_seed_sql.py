#!/usr/bin/env python3
"""
Genera supabase-inventory-seed-champanillo.sql

Uso:
  python3 scripts/build_inventory_seed_sql.py > supabase-inventory-seed-champanillo.sql

Datos: data/inventory_champanillo_pipe.txt (cat|proveedor|producto|unidad|precio)
        + bloque inicial ROWS (P y C) en este script.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

CAT = {
    "P": "Producción propia",
    "C": "Carnes",
    "L": "Lácteos, embutidos y salsas",
    "Z": "Congelados",
    "FV": "Frutas y verduras",
    "BA": "Bebidas con alcohol",
    "BNA": "Bebidas sin alcohol",
    "PAN": "Pan y bollería",
    "PK": "Packaging y limpieza",
    "CF": "Cafés y topping",
}

CAT_ORDER = ["P", "C", "L", "Z", "FV", "BA", "BNA", "PAN", "PK", "CF"]

SORT_ORDER_CAT = {k: (i + 1) * 10 for i, k in enumerate(CAT_ORDER)}


def map_unit(u: str) -> str:
    x = u.upper().strip()
    x = re.sub(r"\s+", " ", x)
    if not x:
        return "ud"
    if x == "KG" or x.startswith("POR KG"):
        return "kg"
    if re.fullmatch(r"KG", x):
        return "kg"
    if "KG" in x and "UNID" not in x and "BIBERON" not in x and "CAJA" not in x and "PAQUETE" not in x:
        if re.search(r"\d", x) or x in ("KG",):
            return "kg"
    if "CAJA" in x or "CARTÓN" in x or "CARTON" in x:
        return "caja"
    if "PAQUETE" in x or "PACK " in x or re.search(r"\bPAQ\.", x):
        return "paquete"
    if "BANDEJA" in x:
        return "bandeja"
    if x.startswith("BOLSA") or (x.startswith("BOLSA ") and "PLÁSTICO" not in x):
        return "bolsa"
    if "RACI" in x:
        return "racion"
    return "ud"


def esc(s: str) -> str:
    return s.replace("'", "''")


def format_label(supplier: str, unit_raw: str) -> str:
    u = unit_raw.strip() if unit_raw else ""
    s = supplier.strip() if supplier else ""
    if s and u:
        return f"{s} · {u}"
    return s or u or ""


def parse_pipe_file(path: Path) -> list[tuple[str, str, str, str, float]]:
    out: list[tuple[str, str, str, str, float]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|", 4)
        if len(parts) != 5:
            continue
        cat, sup, name, unit_raw, price_s = parts
        cat = cat.strip()
        if cat not in CAT:
            continue
        try:
            p = float(price_s.strip().replace(",", "."))
        except ValueError:
            continue
        if p < 0:
            continue
        out.append((cat, sup.strip(), name.strip(), unit_raw.strip(), round(p, 2)))
    return out


# Producción + Carnes (mismo listado que en el Excel)
ROWS_PC: list[tuple[str, str, str, str, float]] = [
    ("P", "PRODUCCIÓN CHAMPANILLO", "BACON LONCHA MARCADO (MERMA 49%)", "KG", 14.36),
    ("P", "PRODUCCIÓN CHAMPANILLO", "BACON TIRAS MARCADO (MERMA 44%)", "KG", 10.53),
    ("P", "PRODUCCIÓN CHAMPANILLO", "PICADILLO ELABORADO", "KG", 2.32),
    ("P", "PRODUCCIÓN CHAMPANILLO", "BIKINIS CONGELADOS", "PAQUETE 11 UNID", 9.35),
    ("P", "PRODUCCIÓN CHAMPANILLO", "VIKINGOS CONGELADOS", "PAQUETE 11 UNID", 15.40),
    ("P", "PRODUCCIÓN CHAMPANILLO", "CEBOLLA POCHADA (MERMA 30%)", "KG", 7.78),
    ("P", "PRODUCCIÓN CHAMPANILLO", "LECHUGA CORTADA (MERMA 27%)", "KG", 5.02),
    ("P", "PRODUCCIÓN CHAMPANILLO", "TOMATE CORTADO NO TIENE MERMA LO USAMOS PARA EL TRITURADO", "KG", 1.65),
    ("P", "PRODUCCIÓN CHAMPANILLO", "CEBOLLA MORADA CORTADA (MERMA 10%) SE TIENE QUE PESAR SIN AGUA", "KG", 1.60),
    ("P", "PRODUCCIÓN CHAMPANILLO", "MORRO MARCADO (MERMA 50%)", "KG", 12.44),
    ("P", "PRODUCCIÓN CHAMPANILLO", "QUESO MANCHEGO CORTADO (MERMA 6%)", "KG", 15.39),
    ("P", "PRODUCCIÓN CHAMPANILLO", "TOFFI (BOLSA)", "UNIDAD", 6.00),
    ("P", "PRODUCCIÓN CHAMPANILLO", "BIBERONES SALSA CHEDDAR (COCINA)", "BIBERON", 1.51),
    ("P", "PRODUCCIÓN CHAMPANILLO", "BIBERONES SALSA BARBACOA (COCINA)", "BIBERON", 0.93),
    ("P", "PRODUCCIÓN CHAMPANILLO", "TARTA DE CHOCOLATE", "UNIDAD", 25.00),
    ("P", "PRODUCCIÓN CHAMPANILLO", "SALSA TRUFADA BIBERON", "POR KG", 4.05),
    ("P", "PRODUCCIÓN CHAMPANILLO", "TARTAS DE QUESO", "UNIDAD", 20.00),
    ("P", "PRODUCCIÓN CHAMPANILLO", "SALSA SECRETA", "UNIDAD", 20.00),
    ("P", "PRODUCCIÓN CHAMPANILLO", "VINAGRETA", "SOBRE", 6.00),
    ("P", "PRODUCCIÓN CHAMPANILLO", "GUACAMOLE BIBERÓN", "UNIDAD", 4.55),
    ("C", "CARNS ROMEU, S.L.U.", "HAMBURGUESA VACA NACIONAL 200gr", "CAJA", 41.80),
    ("C", "CARNS ROMEU, S.L.U.", "BURGER MEAT TERNERA 90gr", "KG", 8.15),
    ("C", "CARNS ROMEU, S.L.U.", "PULLED CERDO BANDEJA 1,2Kg", "UNIDAD", 12.00),
    ("C", "GRAU VILA S.L.U.", "PECHUGA DE POLLO FILETEADA", "KG", 7.95),
    ("C", "GRAU VILA S.L.U.", "HAMBURGUESA CERDO/CEBOLLA", "KG", 7.50),
    ("C", "GRAU VILA S.L.U.", "CHORIZO CRIOLLO", "KG", 8.05),
    ("C", "GRAU VILA S.L.U.", "LOMO FILETEADO EN BANDEJA 1Kg", "UNIDAD", 6.20),
    ("C", "GRAU VILA S.L.U.", "MORCILLA CEBOLLA PIÑONES 1x1", "KG", 7.40),
    ("C", "GRAU VILA S.L.U.", "CHISTORRA VACIO 1x1", "KG", 6.90),
    ("C", "VALLES AUTENTIC S.L.U.", "BACON LONCHA BOCADILLO 1Kg", "UNIDAD", 9.99),
    ("C", "QUE´S LIDER S.L.", "BACON CORTE TIRAS 1,5Kg", "UNIDAD 1,5Kg", 8.74),
    ("C", "QUE´S LIDER S.L.", "BACON LONCHA S/PIEL \"ALEMANES\"", "KG", 7.61),
    ("C", "JOSEP XARGAYÓ S.A.", "CHORIZO PICANTE 3Kg (7,30€/kg)", "UNIDAD", 21.90),
]


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    pipe = root / "data" / "inventory_champanillo_pipe.txt"
    all_rows: list[tuple[str, str, str, str, float]] = list(ROWS_PC)
    if pipe.exists():
        all_rows.extend(parse_pipe_file(pipe))
    else:
        print(f"-- WARNING: no existe {pipe}, solo P+C", file=sys.stderr)

    # sort_order dentro de categoría
    per_cat: dict[str, int] = {}
    sorted_rows: list[tuple[str, str, str, str, float, int]] = []
    for ck in CAT_ORDER:
        for cat, sup, name, ur, price in all_rows:
            if cat != ck:
                continue
            per_cat[ck] = per_cat.get(ck, 0) + 1
            sorted_rows.append((cat, sup, name, ur, price, per_cat[ck]))

    print("-- Seed catálogo inventario Champanillo (ejecutar en SQL Editor con rol que pueda escribir tablas de catálogo)")
    print("-- Requiere: supabase-inventory-schema.sql ya aplicado")
    print("-- Regenerar: python3 scripts/build_inventory_seed_sql.py > supabase-inventory-seed-champanillo.sql")
    print("-- Si repites ítems: delete from public.inventory_catalog_items; antes del begin (o trunca solo ítems).")
    print()
    print("begin;")
    print()
    print("-- Categorías (idempotente si ya existen por nombre)")
    for ck in CAT_ORDER:
        nm = esc(CAT[ck])
        so = SORT_ORDER_CAT[ck]
        print(
            f"insert into public.inventory_catalog_categories (name, sort_order) "
            f"select '{nm}', {so} where not exists ("
            f"select 1 from public.inventory_catalog_categories c "
            f"where lower(trim(c.name)) = lower(trim('{nm}')));"
        )
    print()

    for cat, sup, name, ur, price, so in sorted_rows:
        cname = esc(CAT[cat])
        nm = esc(name)
        u = map_unit(ur)
        fl = esc(format_label(sup, ur))
        print(
            f"insert into public.inventory_catalog_items "
            f"(catalog_category_id, name, unit, default_price_per_unit, format_label, sort_order) "
            f"select c.id, '{nm}', '{u}', {price:.2f}::numeric, '{fl}', {so} "
            f"from public.inventory_catalog_categories c where c.name = '{cname}' limit 1;"
        )

    print()
    print("commit;")


if __name__ == "__main__":
    main()
