# Chef One — Lógica operativa

Documento maestro **operativo y estratégico**. Explica **cómo funciona realmente un restaurante** y **cómo Chef One debe comportarse** para encajar en esa realidad. No sustituye a documentación técnica (`ARCHITECTURE.md`) ni visual (`DESIGN_SYSTEM.md`): define **el “por qué” del trabajo en cocina y sala** y **qué debe resolver cada módulo** desde la perspectiva del negocio.

**Premisa:** Chef One está pensado **por gente de cocina, para gente de cocina**. La lógica del producto debe honrar la **presión, la velocidad y la imperfección humana** del turno — no el mundo ideal del despacho.

---

## Filosofía operativa general

### Cómo trabaja realmente un restaurante

Un restaurante no es una línea de producción silenciosa. Es **picos de demanda**, **cadenas de dependencias** (pedido → recepción → mise en place → servicio → cierre), **personal con distintos ritmos** y **decisiones bajo fatiga**. Gran parte del valor se crea en **ventanas cortas de tiempo** donde “más tarde” equivale a “no hecho”.

### Qué problemas existen

- **Información dispersa**: WhatsApp, papel, Excel, memoria del encargado.
- **Desalineación** entre lo pedido, lo recibido y lo facturado.
- **Producción sin trazabilidad** clara (¿cuándo se hizo?, ¿cuándo caduca?, ¿qué lote?).
- **Inventario teórico** que no refleja robos, roturas, mermas ni errores de conteo.
- **Personal y cumplimiento** tratados como algo “aparte” del servicio, cuando son parte del riesgo operativo y legal.

### Dónde se pierde tiempo

- **Reconstruir** lo que ya se dijo en otro canal.
- **Buscar** números, precios o lotes en sitios distintos.
- **Rectificar** errores que un flujo más claro habría evitado.
- **Explicar** a un compañero lo que el sistema no deja ver de un vistazo.

### Dónde aparecen errores

- **Entrada de datos** en momentos de prisa o interrupción.
- **Suposiciones** (“seguro que llegó igual que la semana pasada”).
- **Handoffs** mal definidos entre quien pide, quien recibe y quien cocina.
- **Fatiga** al final del turno: ahí se olvidan cierres, registros y mermas.

### Por qué muchos softwares fallan

Están diseñados para **auditar después** o para **configurar antes**, no para **acompañar el minuto operativo**. Exigen demasiados pasos, demasiado contexto administrativo o pantallas pensadas para ratón y calma. En cocina, eso se traduce en **abandono del sistema** y vuelta al papel y al grupo de WhatsApp — con pérdida de control.

**Chef One debe invertir la prioridad:** primero **servir al turno**, después **alimentar la inteligencia del negocio** — sin obligar al usuario a elegir entre las dos.

---

## Pedidos

### Cómo piensa un encargado al hacer pedidos

Piensa en **lista mental**: qué falta, qué se acaba, qué sube el fin de semana, qué proveedor suele traer mal, qué puede sustituirse. Necesita **repetir sin reescribir**, **ajustar cantidades rápido** y **saber que lo enviado quedó registrado**.

### Rapidez

El pedido no es un ensayo: es **acción**. Cada segundo de fricción es un segundo que no está en recepción o en cocina. El módulo debe permitir **flujos cortos**, plantillas, historial y atajos a lo habitual.

### Repetición semanal

La hostelería es **cíclica**. Los pedidos se parecen entre semanas; el sistema debe **reutilizar** pedidos anteriores, catálogos por proveedor y patrones sin forzar al usuario a recomponer la realidad desde cero.

### Control de recepción

Pedir no es cerrar el ciclo. Hay que **cuadrar** lo enviado con lo pedido: faltas, sustituciones, pesos distintos, cajas rotas. La lógica operativa debe contemplar **recepción como momento de verdad**, no como trámite opcional.

### Pedido vs albarán

- **Pedido:** intención, compromiso con el proveedor, planificación.
- **Albarán / entrega real:** lo que **entró** al local, base para **inventario**, **precio** y **reclamaciones**.

Confundir ambos genera **desajustes de stock y de coste**. Chef One debe mantener la distinción **clara en el flujo** aunque al usuario se le presente de forma simple.

### Control de precios

Los precios **cambian**. El encargado necesita ver **desviaciones**, no descubrir sorpresas al cerrar mes. La lógica debe favorecer **comparación**, histórico y alertas comprensibles — sin convertir cada pedido en una clase de contabilidad.

### Recepción real de mercancía

Sucede **de pie**, a veces en frío o con prisa. Hay que **contar, pesar, rechazar o anotar incidencias** con pocos gestos. Los errores típicos: cantidades mal tomadas, líneas olvidadas, precio no validado. El producto debe **reducir superficie de error** (confirmaciones en el lugar correcto, estados visibles).

### Errores habituales

- Pedir **unidades equivocadas** (caja vs unidad).
- **Duplicar** líneas o pedidos.
- **No registrar** una entrega parcial.
- **Asumir** precio sin contrastar.

### Trabajo con proveedores

Cada proveedor tiene **ritmo, catálogo y letra pequeña** distintos. La lógica debe permitir **flexibilidad** (notas, incidencias) sin romper la trazabilidad interna.

---

## Producción

### Cómo funciona una cocina (y cocina central)

Hay **plan** (qué toca hacer hoy), **ejecución** (cuánto se hizo, cuándo), y **salida** (lotes, etiquetas, envíos a otras sedes en modelos centralizados). La presión es **tiempo + espacio + temperatura + personal**.

### Planificación

La planificación vive entre **lo que dice la carta**, **lo que pide el servicio** y **lo que permite el personal**. Debe ser **ajustable** sin borrar la realidad: plantillas, bloques de días, objetivos por periodo.

### Elaboración

Cocinar es **lotes**, **tiempos** y **caducidad**. Registrar “hecho” debe ser **más rápido que anotar en una pizarra**; si no, la pizarra gana.

### Lotes

Los lotes son **identidad** para trazabilidad y seguridad. La lógica debe ligar **elaboración → código → QR o etiqueta** sin obligar a memorizar reglas.

### Etiquetado

Etiquetar es **obligatorio** en buena práctica y a menudo **legalmente sensible**. Debe ser **rápido, coherente con el tamaño de impresora real** y **difícil de equivocar** (plantillas claras, datos mínimos correctos).

### Control de producción

Saber **qué falta por hacer**, **qué se desvió del objetivo** y **qué quedó cerrado** es control operativo, no solo “reporting bonito”.

### Organización por zonas

Cocina se divide en **partidas** (frío, caliente, pastelería…). La misma lista puede leerse de formas distintas; la lógica debe permitir **agrupar sin duplicar datos**.

### Presión operativa

En producción, **interrupciones** son la norma. Flujos largos o frágiles se rompen. Todo debe tolerar **salir y volver** con contexto recuperable.

---

## Inventario

### Inventario real

El inventario real **cambia cada recepción, cada merma, cada producción y cada error humano**. No es una foto estática; es un **saldo vivo** que solo tiene valor si refleja **movimientos honestos**.

### Problemas habituales

- **Conteos** espaciados y poco creíbles.
- **Unidades** mezcladas (kg, cajas, unidades).
- **Coste** desactualizado respecto a la última compra.
- **Miedo** a registrar mermas por “ensuciar” el inventario.

### Descuadres

Suelen ser **síntoma**, no el problema: falta de registro en recepción, mermas no declaradas, robos, errores de unidad. La lógica debe hacer **visibles** los descuadres y **fácil** la corrección con causa.

### Mermas ocultas

Lo no registrado **aparece como fantasma** en el inventario. El producto debe **normalizar** el registro rápido de mermas sin culpa inútil — como parte del oficio.

### Movimientos reales

Entrada, salida, ajuste, transferencia entre sedes. Cada movimiento debe tener **quién / cuándo / por qué** suficiente para auditar sin convertir cada gesto en un formulario eterno.

---

## Mermas

### Cómo se generan

Por **error**, **calidad**, **exceso de producción**, **caducidad**, **rotura**, **degustación no controlada**, **mal pronóstico de venta**. Es inevitable; lo dañino es **no verlas**.

### Importancia real

Las mermas **comen margen** y enseñan **patrones** (plato, turno, proveedor, sección). Son una de las palancas más baratas de mejora si se registran con **honestidad y rapidez**.

### Cómo registrarlas rápido

Pocos campos, **valores por defecto**, **repetición** de lo habitual, **contexto del turno** ya conocido por el sistema. El registro debe poder hacerse **entre dos tickets**.

### Cómo analizarlas

Agrupaciones **útiles**: por producto, por causa, por franja, por responsable operativo (no necesariamente “culpable”, sino **punto de mejora**). Evitar gráficos que impresionen en reunión pero no cambien el día siguiente.

### Cómo detectar patrones

Alertas **simples**: “esta semana X sube”, “este ítem repite”. La lógica es **operativa**: que alguien **actúe**, no que alguien archive un PDF.

---

## Escandallos

### Importancia del coste real

La carta se vende a precio de menú, pero se cocina a **coste de compra y rendimiento**. Sin escandallo creíble, **el margen es opinión**.

### Conexión con compras

Si el precio del proveedor **sube**, el escandallo debe **reflejar** o **avisar** que el plato deja de ser rentable. La lógica es **puente** entre compras y carta.

### Evolución de precios

No es un ejercicio anual: es **continuo**. El producto debe hacer **seguible** el cambio sin exigir al usuario una carrera de Excel.

### Impacto en margen

Las decisiones son **subir precio**, **cambiar receta**, **negociar**, **sacar del menú**. La información debe empujar a **decisiones**, no a contemplar curvas.

---

## Personal y horarios

### Realidad de turnos

Los turnos **cambian**, se **solapan**, se **alargan** y se **rompen** con bajas de última hora. El sistema debe ser **flexible** sin perder trazabilidad legal.

### Cambios rápidos

Sustitución, intercambio, refuerzo: debe poder **registrarse** sin burocracia en el momento.

### Estrés operativo

Fichar no puede ser un laberinto: **entrada, pausa, salida** con secuencia clara y mensajes que expliquen **por qué** algo no se puede fichar ahora (evitar la sensación de “el sistema me odia”).

### Descansos

Los descansos mal registrados generan **conflictos** y **riesgo**. La lógica debe distinguir **pausa** de **salida** sin obligar al empleado a leer normativa.

### Sustituciones

Deben quedar **registradas** para que el día cuadre y no dependa del encargado de memoria.

### Fichajes

Son **dato legal y humano** a la vez: precisión sin humillar; **kiosk** o móvil según el modelo del local.

### Control legal

El producto debe **ayudar a cumplir** sin convertir cada gesto en un juicio. La trazabilidad es para **proteger al local y al equipo**, no para micromanagement gratuito.

---

## APPCC

### Simplicidad operativa

La seguridad alimentaria en sala de cocina **vive en gestos**: temperaturas, aceite, limpieza, alérgenos. Si el registro es pesado, **no se hace** y el riesgo sube.

### Registros rápidos

**Pocos toques**, valores por defecto razonables, **hora automática**, posibilidad de **corregir** con auditoría cuando haga falta.

### Cumplimiento legal

El objetivo es **demostrar** disciplina en inspección, no llenar carpetas inútiles. La lógica debe producir **historial claro** y **exportable** sin doble trabajo.

### Evitar burocracia absurda

No pedir diez campos si tres bastan para el control real del riesgo.

### Facilidad para inspecciones

Un inspector debe **encontrar** orden: fechas, responsables, incidencias. El producto debe **anticipar** esa necesidad sin asustar al usuario diario.

---

## Checklists

### Apertura y cierre

Son **rituales** que evitan fallos caros (neveras, aceite, cajas, llaves). Deben ser **listas cortas**, **obligatorias donde toque** y **rápidas de tachar**.

### Control diario

No es un examen: es **confirmación** de que lo crítico está hecho.

### Rapidez y claridad

Cada ítem **una línea**, estado **binario o semáforo**, comentario solo si hay incidencia.

### Responsabilidad

Quien marca debe **saber** que marca; **firma ligera** (usuario ya autenticado) y trazabilidad suficiente.

---

## Finanzas

### Métricas accionables

Si un número no sugiere **acción** esta semana, es ruido. Priorizar **compras**, **mermas**, **coste de personal relativo**, **rentabilidad por línea de negocio** cuando el dato exista.

### Evitar complejidad contable

El restaurante necesita **gestión**, no un ERP contable dentro del móvil. Profundidad **bajo demanda**, no en la primera pantalla.

### Enfoque operativo

Finanzas en Chef One deben **hablar con cocina**: “qué está pasando con el coste de X”, no solo “informe Q3”.

### Decisiones rápidas

Comparativas **simples**, alertas **claras**, export **cuando haga falta** — no obligatoria para el día a día.

### Análisis útil para hostelería

Pensar en **semanas**, **turnos**, **estacionalidad**, **eventos** — no solo en meses contables abstractos.

---

## Chat interno

### Comunicación rápida

Mensajes **cortos**, **contexto del local**, **menos ruido** que un grupo de WhatsApp mezclado con la vida personal.

### Avisos

Canal para **coordinación** (“falta X”, “llegó el camión”) sin perderse en hilos eternos.

### Coordinación

Quién debe enterarse **ya** debe poder hacerlo sin buscar en cinco grupos.

### Evitar WhatsApp desordenado

El valor no es “otro chat”, es **chat ligado al trabajo**: menos improvisación, más **registro** cuando el mensaje importa.

---

## Filosofía de automatización

### Reducir trabajo manual

Todo lo que el sistema **ya sabe** (local, usuario, fecha, último pedido, último precio) **no debe pedirse otra vez**.

### Evitar doble escritura

Pedido → recepción → inventario → coste debe ser **cadena**, no cuatro entradas independientes salvo que el negocio lo exija.

### Reutilizar datos

Históricos, plantillas y sugerencias son **automatización silenciosa** que el usuario percibe como “el sistema me entiende”.

### Automatizar lo repetitivo

Recordatorios, regeneración de pedidos, alertas de precio, avisos de checklist incompleto — siempre **con control humano** en el punto crítico.

---

## Filosofía de reducción de errores

### Minimizar errores humanos

Diseñar para **fatiga**: campos claros, unidades explícitas, confirmaciones **solo** donde el coste del fallo es alto.

### Flujos claros

Un camino **obvio** por pantalla; alternativas **visibles** pero no competidoras del camino principal.

### Evitar confusión

Mismo vocabulario en todos los módulos: **pedido**, **recepción**, **lote**, **merma** — no sinónimos distintos por pantalla.

---

## Velocidad operativa

### Todo debe ser rápido

La velocidad no es vanidad: es **supervivencia** del sistema en el turno. Si es lento, el equipo **deja de usarlo**.

### Mínimo número de pasos

Cada paso debe tener **justificación operativa**. “Porque el ERP lo pide” no cuenta.

### Mínimo número de clics

Especialmente en acciones **repetidas cientos de veces al mes**.

### Decisiones instantáneas

Estados y totales **legibles al vistazo**; el usuario no debe “calcular mentalmente” lo que el sistema puede mostrar.

---

## Errores que nunca deben cometerse

1. **Burocracia** — trámites que no reducen riesgo ni mejoran margen.
2. **Procesos lentos** — flujos que solo funcionan con tiempo y silencio.
3. **Formularios infinitos** — castigar al usuario por honestidad.
4. **Pasos innecesarios** — “siguiente” que no aporta valor.
5. **Datos duplicados** — volver a escribir lo que ya está en el sistema.
6. **Complejidad absurda** — opciones que solo un consultor entiende.
7. **Pantallas difíciles bajo presión** — UI que exige concentración de laboratorio.
8. **Confundir roles mentales** — mezclar en una sola vista la cabeza del encargado y la del contable sin avisar.
9. **Castigar el error** — hacer sentir al usuario culpable por un fallo que el flujo podría haber evitado.
10. **Optimizar el informe antes que el turno** — belleza analítica que nadie alimenta porque cocina no tiene tiempo.

---

## Cómo usar este documento

- **Producto:** definir prioridades de roadmap y criterios de “hecho” por módulo.
- **Diseño:** traducir presión operativa en **jerarquía y flujo** (ver `DESIGN_SYSTEM.md`).
- **Desarrollo:** no es especificación técnica, pero **sí filtro de decisión**: si una feature aumenta fricción sin reducir riesgo o tiempo, se reconsidera.

Chef One solo cumple su misión si **cocina lo adopta**. Esta biblia operativa existe para que **ninguna decisión olvide el contexto del fuego encendido y el comensal en la mesa**.

---

*Documento vivo. Actualizar cuando cambien procesos legales o el modelo operativo del cliente tipo; mantener coherencia con `PRODUCT_PHILOSOPHY.md`.*
