# Validaciones manuales Escandallos Cost Engine

## 1. PMP real

Datos:
- 100 kg a 2 EUR/kg
- 5 kg a 5 EUR/kg

Calculo:
- importe total = 200 + 25 = 225
- cantidad total = 105
- PMP = 225 / 105 = 2.142857 EUR/kg

Resultado esperado:
- 2,14 EUR/kg mostrado con redondeo a 2 decimales.

## 2. Base con racion estandar

Datos:
- coste real = 5,50 EUR/kg
- racion = 25 g

Calculo:
- 5,50 / 1000 * 25 = 0,1375

Resultado esperado:
- unit_cost = operational_cost
- total_cost = 0,1375 para 1 racion.

## 3. Plato con base

Datos:
- base configurada con racion estandar 25 g
- operational_cost = 0,1375

Resultado esperado:
- 1 racion estandar suma 0,14 EUR.
- No suma 5,50 EUR.

## 4. Cocina Central

Datos:
- salsa = 14,07 EUR/kg
- uso = 30 g

Calculo:
- 14,07 / 1000 * 30 = 0,4221

Resultado esperado:
- coste linea = 0,4221 EUR.
- mostrado redondeado = 0,42 EUR.

## 5. Cambio de coste base

Datos:
- una receta A usa base B.
- una receta C usa receta A como subreceta.

Resultado esperado:
- `getAffectedRecipesByCostSource({ type: 'subrecipe', recipeId: B })` devuelve A como directa y C como indirecta.
