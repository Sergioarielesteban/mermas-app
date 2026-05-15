# PEDIDOS — CHEF ONE

## Filosofía del módulo

Módulo operativo mobile-first diseñado para que cocina y encargados puedan:

- pedir rápido
- recibir rápido
- detectar incidencias rápido
- controlar precios reales
- operar con mínimo ruido visual

NO debe sentirse como ERP clásico.  
Debe sentirse táctil, compacto, fluido y extremadamente operativo.

Prioridades:

1. velocidad operativa
2. claridad visual
3. continuidad de flujo
4. control de costes
5. mínima fricción

---

## Objetivos operativos

- Centralizar pedidos a proveedores
- Controlar recepciones reales
- Detectar variaciones de precio
- Detectar incidencias/faltantes
- Mantener histórico de precios
- Facilitar pedidos recurrentes
- Reducir errores operativos
- Integrar WhatsApp como canal real de pedido
- Mantener continuidad de trabajo entre locales

---

## Estado actual

Módulo funcional y avanzado.

Actualmente incluye:

- creación de pedidos
- recepción de pedidos
- control de incidencias
- control de precios
- artículos máster
- comparativa de precios
- compras del mes
- sugerencias de pedido
- historial parcial
- integración WhatsApp
- OCR Document AI en preparación

Problemas actuales:

- demasiado ruido visual en algunas pantallas
- exceso de bloques secundarios
- algunos refrescos visuales bruscos
- pérdida de scroll/contexto al salir de app
- informes demasiado densos
- demasiada información simultánea

---

## Funcionalidades implementadas

### Pedidos

- pedidos por proveedor
- catálogo por proveedor
- cantidades rápidas
- steppers
- subtotal automático
- envío WhatsApp

### Recepción

- recepción línea por línea
- incidencias
- diferencias de precio
- subtotales
- marcar OK
- swipe operativo
- validación completa

### Precio

- histórico parcial
- comparación precio recibido
- alertas de variación
- artículos máster

### Compras

- compras del mes
- totales por proveedor
- histórico de recepciones

### UX operativa

- bottom actions persistentes
- cards compactas
- panel operativo
- accesos rápidos

---

## Problemas pendientes

### UX

- limpiar catálogo de pedidos
- reducir filtros visibles
- eliminar ruido visual
- compactar artículos máster
- rediseñar compras del mes
- mejorar jerarquía visual

### Fluidez

- eliminar micro-refrescos/re-render brusco
- mantener scroll/contexto al volver a app
- evitar reset de pantallas

### Datos

- separar precio base vs último recibido
- no sobrescribir automáticamente precio base
- mantener referencia estable de catálogo

### OCR

- integrar escaneo de albarán con Document AI
- detección automática de:
  - precios
  - cantidades
  - productos
  - incidencias

---

## Reglas críticas que NO deben romperse

### Precio base

El precio base del proveedor NO debe cambiar automáticamente al recibir un pedido más caro.

Solo cambia:

- desde edición manual proveedor/artículo
- actualización explícita

La recepción es informativa.  
NO redefine catálogo automáticamente.

### Continuidad operativa

Si usuario sale de app:

- debe volver al mismo scroll
- misma línea
- mismo pedido
- mismo estado

Nunca resetear flujo operativo.

### Recepción

No romper:

- steppers
- swipe
- subtotales
- validación rápida
- flujo táctil

### Mobile-first

Todo debe funcionar perfectamente en móvil real con una mano.

---

## UX/UI guidelines

### Estética

- limpia
- premium
- compacta
- muy poco ruido
- estilo panel financiero moderno

### NO usar

- tablas gigantes
- banners pesados
- exceso de botones
- demasiados filtros
- bloques redundantes
- texto excesivo

### Sí usar

- cards compactas
- métricas visuales
- iconografía simple
- jerarquía clara
- colores suaves
- foco operativo

### Prioridad visual

El catálogo/producto SIEMPRE es protagonista.

Todo lo secundario:

- oculto
- colapsable
- contextual

---

## Archivos importantes

Rutas aproximadas actuales:

- app/pedidos/page.tsx
- app/pedidos/nuevo/page.tsx
- app/pedidos/recepcion/page.tsx
- app/pedidos/compras-del-mes/page.tsx
- app/pedidos/articulos-master/page.tsx

Posibles componentes relacionados:

- components/pedidos/*
- components/recepcion/*
- components/proveedores/*
- components/ui/*

---

## Componentes importantes

### Operativos

- cards de pedido
- cards de recepción
- steppers cantidad
- swipe confirmación
- resumen recepción
- incidencias

### Datos

- artículos máster
- comparativa proveedor
- histórico precios
- sugerencias pedido

### Navegación

- bottom actions
- panel operativo
- persistencia scroll

---

## Riesgos técnicos

### Re-render excesivo

Hay riesgo de:

- refresh visual brusco
- pérdida de estado
- doble carga

Especialmente en:

- recepción
- realtime
- listeners

### Estado global

Evitar:

- recargas completas innecesarias
- invalidaciones masivas
- reset de componentes

### Supabase

Controlar:

- exceso de fetch
- realtime agresivo
- egress innecesario

---

## Próximos pasos

### Prioridad alta

1. persistencia scroll/contexto
2. limpieza visual catálogo pedidos
3. separar precio base vs precio recibido
4. rediseño compras del mes
5. optimizar recepción móvil

### Prioridad media

1. logos proveedores
2. OCR albaranes
3. gráficos ejecutivos
4. top productos/proveedores

### Prioridad futura

1. IA predictiva pedidos
2. consumo inteligente
3. anomalías automáticas
4. forecasting operativo

