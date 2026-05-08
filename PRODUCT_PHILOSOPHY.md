# Chef One — Filosofía de producto

Documento interno. Define **cómo debe ser Chef One** para quien diseña, desarrolla o escribe sobre el producto. No sustituye a la documentación técnica; orienta **decisiones de producto, UX y tono**.

---

## Qué es Chef One

### Visión del producto

Chef One es la **capa operativa** del restaurante: el lugar donde el equipo **hace** el trabajo del día — pedir, producir, registrar, cumplir normas, comunicarse — sin sentir que está “administrando un sistema”. La visión es que **la operación fluya** y el software pase desapercibido salvo cuando **aclara, acelera o evita un error**.

### Problema que resuelve

La hostelería real se fragmenta entre papeles, grupos de WhatsApp, hojas sueltas y herramientas pensadas para oficina. Eso genera **retrasos, duplicidades, pérdida de trazabilidad y fatiga**. Chef One concentra lo operativo en **un solo lugar**, **en el dispositivo que ya tienes en el bolsillo o en la tablet de cocina**, con flujos cortos y estados claros.

### Filosofía operativa

- **Operar primero, documentar después**: el registro nace de la acción, no del relleno teórico.
- **Un local, un contexto**: lo que ves es lo que toca hacer **aquí y ahora**.
- **Cocina y sala bajo presión**: si un flujo solo funciona con calma, no es suficientemente Chef One.

### Enfoque hostelería real

Los usuarios no son analistas de datos de día completo; son **encargados, jefes de cocina, cocineros y personal de sala** en turnos largos, ruido, prisa y manos ocupadas. Chef One debe asumir **manos sucias, poca paciencia y interrupciones constantes**.

### Por qué es diferente de otros SaaS

Muchas herramientas “para restaurantes” son **ERP o suites administrativas** adaptadas. Chef One no compite en ser el archivo maestro de todo el holding; compite en ser **rápido, claro y táctil** en el momento operativo. La diferencia se nota en **segundos**: si en tres segundos no entiendo qué hacer en la pantalla, algo falla.

---

## Qué no debe ser

### UX que no queremos

- Pantallas donde hay que **leer antes de actuar**.
- Flujos de **más de un objetivo por pantalla** sin jerarquía clara.
- **Configuración obligatoria** antes de obtener valor.
- Mensajes genéricos (“Ha ocurrido un error”) sin **qué pasó y qué hacer**.

### Software que no queremos parecer

- **ERP de los 2000**: mil menús, mil permisos visibles, sensación de peso.
- **Backoffice bancario**: tablas densas, grises uniformes, miedo a tocar.
- **Suite corporativa fría**: iconografía genérica, copy neutro que no habla a cocina.

### Errores a evitar

- **Feature por feature** sin historia de usuario en contexto real (“¿a las 22:30 con servicio lleno?”).
- **Paridad con Excel**: si la app replica una hoja, debe **mejorar** el flujo, no copiar el dolor.
- **Asumir escritorio**: diseñar primero en ancho grande y “adaptar” al móvil como segunda clase.

### Patrones visuales a evitar

- **Muros de texto** y labels largos donde bastan **números, iconos y color de estado**.
- **Demasiados bordes, cajas y divisores** que compiten por atención.
- **Tipografías pequeñas** en acciones críticas.
- **Paleta arcoíris** de estados sin sistema; el color debe **significar** algo repetible.

### Flujos demasiado complejos

- Asistentes de **cinco pasos** para algo que en papel son **dos tachones**.
- **Modales encadenados** para una acción que debería ser un botón y confirmación clara.
- **Formularios largos** sin guardado parcial, sin progreso visible y sin salida obvia.

---

## Filosofía de operación

Chef One “piensa” como quien **tiene que cerrar el turno**, no como quien **audita el trimestre**.

- **Menos clics**: cada pantalla debe justificar por qué no tiene un camino más corto.
- **Menos pasos**: si dos pasos pueden ser uno sin perder seguridad, son uno.
- **Velocidad**: la sensación de lentitud es un defecto de producto, no solo de servidor.
- **Claridad**: una sola idea dominante por vista móvil cuando sea posible.
- **Acción rápida**: lo que hago **hoy** debe estar a **un gesto** de distancia.
- **Operativa real**: flujos probados mentalmente en **servicio, mise en place y cierre**.
- **Reducir fricción**: autocompletar, recordar contexto, evitar reintroducir lo mismo.
- **Reducir errores humanos**: confirmaciones inteligentes, estados imposibles de ignorar, feedback inmediato.
- **Reducir carga mental**: no obligar a recordar reglas; el producto las **muestra o las cumple** en la UI.

---

## Filosofía visual

- **Mobile-first real**: diseñar y validar en **el tamaño más estrecho** que use el local; el resto es ampliación ordenada.
- **Botones táctiles**: áreas de toque generosas; nada crítico en “enlaces de un píxel”.
- **Tarjetas claras**: agrupan una unidad de significado; no decoran por moda.
- **Jerarquía visual fuerte**: primero **qué es esto**, segundo **qué hago**, tercero **detalle**.
- **Información importante grande**: cantidades, alertas, estado del día — **legible de un vistazo**.
- **Evitar ruido visual**: cada elemento debe ganarse su sitio; si no guía la acción, sobra.
- **Evitar pantallas saturadas**: el blanco (o el respiro) es parte del diseño premium.
- **Evitar exceso de texto**: sustituir por **etiquetas cortas, iconos consistentes y números**.

---

## Filosofía UX

- **Un cocinero no debe leer párrafos**: el copy debe ser **escaneable**; los párrafos son para ayuda secundaria o legal.
- **Una acción importante debe verse al instante**: botón primario evidente; no esconder “Guardar” o “Enviar” en menús oscuros.
- **Los estados críticos deben ser visuales**: pendiente / hecho / retraso / error — con **color, posición y forma**, no solo con palabras.
- **Los errores deben ser obvios**: dónde, por qué (en lenguaje humano), y **siguiente paso**.
- **Entender la pantalla en segundos**: test mental — *si entro sin formación de producto, ¿sé qué es esto en 5 segundos?* Si no, simplificar.

---

## Cómo deben diseñarse los módulos

Todos los módulos — pedidos, producción, APPCC, inventario, etc. — deben sentirse **parte del mismo producto**, no productos acoplados.

- **Conexión perceptiva**: misma lógica de **cabecera, tarjetas, botones y feedback**.
- **Coherencia visual**: tipografía, radios, sombras y color de acento alineados con el sistema existente.
- **Coherencia de navegación**: volver, módulo, y “salir al panel” deben comportarse de forma **predecible**.
- **Coherencia de interacción**: un gesto que aprendí en Pedidos debe **funcionar igual** donde tenga sentido en Producción.
- **Coherencia de animación y espaciado**: microinteracciones **sutiles**; nada teatral que retrase la sensación de velocidad.

Un módulo nuevo no es “otra app dentro de la app”; es **otra habitación de la misma casa**.

---

## Filosofía de datos

Los datos existen para **mover a la acción**, no para adornar reuniones.

- **No solo mostrar información**: cada bloque de datos debería responder a *¿y ahora qué hago?*
- **Dashboards accionables**: si muestro un número rojo, debo poder **actuar** desde ahí o saber **dónde ir**.
- **Alertas claras**: pocas, graduadas, sin fatiga de notificaciones.
- **Métricas simples**: mejor **tres KPIs** que se entienden que veinte que nadie mira.
- **Evitar paneles financieros ilegibles**: si el módulo es financiero, debe mantener **la claridad Chef One**; densidad sin jerarquía es un fallo de producto.

---

## Filosofía de rendimiento

La rapidez es **atributo premium**.

- **Rapidez extrema como objetivo**: tiempos de respuesta percibidos importan tanto como los reales.
- **Evitar cargas innecesarias**: no traer mitad del servidor para pintar una lista corta.
- **Evitar realtime absurdo**: sincronizar donde **duele** no actualizar; no donde molesta al bolsillo o a la batería.
- **Evitar listas infinitas sin control**: paginación, límites y “cargar más” consciente.
- **Optimización móvil**: redes cocina, dispositivos modestos, pantalla encendida todo el turno.
- **Prioridad a la fluidez**: un frame perdido en una transición secundaria importa menos que **un scroll que engancha** en la lista del día.

---

## Filosofía premium

**Premium no es complicado.** Premium es **orden, criterio y calma**.

- Chef One debe sentirse **premium incluso siendo simple**: menos elementos, mejor colocados.
- **Elegancia minimalista**: restar hasta que rompa; luego sumar **un solo** detalle donde humaniza.
- **Sensación moderna**: actual sin ser moda pasajera; atemporal en estructura, contemporáneo en tacto.
- **Calidad visual**: alineación, ritmo, consistencia — el usuario nota el cuidado aunque no lo nombre.
- **Consistencia**: el usuario confía cuando el producto **no le sorprende** con reglas nuevas en cada pantalla.
- **Pequeños detalles UX**: estados de carga honestos, feedback háptico implícito (visual), copy que respeta el oficio (“Hecho”, “Enviar pedido”, no “Submit”).

---

## Reglas absolutas

1. **No sobreingeniería**: la solución más simple que cumple el requisito en hostelería real gana.
2. **No formularios infinitos**: dividir, guardar, contextualizar; nunca castigar con una pared de campos.
3. **No tablas gigantes ilegibles en móvil**: jerarquía, filas tipo tarjeta, o vistas alternativas; la tabla densa es excepción, no regla.
4. **No modales absurdos**: un modal debe **cerrar una decisión**; no ser un mini-sitio dentro del sitio.
5. **No esconder acciones importantes**: primario visible; secundario accesible pero no humillante de encontrar.
6. **No diseños corporativos genéricos**: nada de “plantilla SaaS 2016”; Chef One tiene **personalidad propia**.
7. **No saturar la pantalla**: si no cabe sin scroll en móvil con aire, **recortar funciones o etapas**, no tipografía.
8. **No asumir formación previa**: etiquetas y flujos deben ser **autodescriptivos** en contexto.
9. **No castigar el error**: error es momento de **confianza**; explicar y recuperar, no culpar.
10. **No romper la coherencia por prisa**: una feature mal integrada **destruye** la sensación premium de todo el producto.

---

## Cómo usar este documento

- **Producto y diseño**: checklist antes de ship; debate en revisiones de UX.
- **Desarrollo**: traducir principios en **decisiones de UI** (tamaños, flujos, estados), no en discusiones de framework.
- **IA y redacción**: tono **directo, respetuoso, operativo**; español claro; vocabulario de cocina y sala cuando toque.

Chef One es **herramienta de trabajo bajo presión**. Si en algún momento el producto se siente **administrativo, lento o frío**, volver a este documento y **restar hasta recuperar la sensación correcta**.

---

*Documento vivo. Actualizarlo cuando la visión evolucione; no cuando cambie una librería.*