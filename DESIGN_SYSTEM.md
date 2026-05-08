# Chef One — Sistema de diseño y experiencia

Guía maestra **visual y de UX** para Chef One. Define **cómo debe verse y comportarse** la interfaz en todos los módulos. No incluye código, nombres de componentes ni utilidades de estilo: es el **criterio** que debe aplicar producto, diseño y desarrollo al implementar pantallas.

**Principio rector:** Chef One es un SaaS **premium y operativo** para hostelería. La interfaz debe sentirse **moderna, limpia, táctil, rápida y clara** — nunca corporativa gris, nunca ERP pesado, nunca “hoja de cálculo con botones”.

---

## Identidad visual

### Sensación general

Al abrir Chef One, el usuario debe percibir **orden y control sin frialdad**: espacio respirable, jerarquía clara, sensación de **herramienta de trabajo de alta gama**, no de backoffice bancario. La sensación es de **“puedo hacer esto en medio del servicio”**, no de “tengo que sentarme a administrar”.

### Personalidad visual

- **Directa**: lo importante está delante, sin metáforas innecesarias.
- **Segura**: estados y acciones se entienden sin manual.
- **Cercana al oficio**: vocabulario y ritmo pensados para cocina y sala, no para consultoría.
- **Contemporánea**: estética actual sin gimmicks que envejezcan en un año.

### Estética

Equilibrio entre **minimalismo** (pocos elementos, mucho aire controlado) y **operativa real** (datos y acciones visibles cuando importan). No es un museo vacío ni un tablero de avión: es **densidad justa** para decidir y actuar en segundos.

### Lenguaje visual

- **Formas**: contenedores con esquinas suavemente redondeadas; sensación amable y táctil, no cajas rígidas de ERP.
- **Profundidad ligera**: sombras sutiles que separan capas sin dramatismo.
- **Contraste funcional**: el foco va al contenido y a la acción, no al chrome decorativo.

### Minimalismo vs operativa real

- **Minimalismo** aquí significa **eliminar lo que no ayuda a actuar**, no esconder lo necesario.
- Si un dato es necesario para **decidir o registrar en el momento**, tiene derecho a espacio y tamaño; si es **contexto secundario**, puede ir un escalón por debajo en jerarquía o tras un gesto de expansión.
- Regla práctica: *si quitamos este bloque, ¿falla el turno?* Si no, considerar recortar o agrupar.

---

## Mobile-first real

### Orden de diseño

1. **Móvil** (ancho estrecho, una columna, pulgar).
2. **Tablet** (cocina, pasillo, despacho pequeño — muchas horas de uso).
3. **Escritorio** (ampliación ordenada, nunca la fuente de verdad única del layout).

### Tablet como prioridad operativa

En muchos locales la tablet es el **dispositivo principal** en cocina o recepción. Las áreas táctiles, la densidad de filas y la legibilidad deben validarse **en tablet** antes de dar por cerrada una pantalla crítica.

### Desktop secundario

El escritorio **amplía** espacio para listas o paneles laterales; no debe ser el único lugar donde una función sea usable. Nada esencial solo en “pantalla grande”.

### Ergonomía táctil

- Pensar en **manos húmedas, guantes finos o prisa**: targets generosos, poca precisión milimétrica exigida.
- Evitar controles que dependan de **hover** para entender la UI (el hover en táctil no existe).

### Tamaños mínimos táctiles

Orientación (ajustar a guidelines del sistema, pero como regla Chef One):

- **Mínimo recomendado para acción primaria o fila clicable completa:** equivalente a ~44–48 px de altura lógica en el eje del dedo.
- **Acciones secundarias en línea** (iconos, pasos): no por debajo de ~40 px si son el único objetivo del toque.
- **Separación** entre targets adyacentes suficiente para no activar el vecino por error.

### Zonas cómodas de interacción

En móvil, priorizar acciones frecuentes en la **mitad inferior** de la pantalla cuando tenga sentido (zona natural del pulgar), sin esconder la información crítica arriba. En tablet, distribuir **peso visual** entre centro y bordes según lectura (título arriba, acción clara abajo o a la derecha en horizontal).

---

## Espaciados

### Filosofía

El espacio **estructura** la pantalla: agrupa lo que va junto y separa lo que es otro tema. El ritmo debe ser **predecible** entre módulos (misma sensación de “unidad” y “respiro”).

### Padding (contenedores y pantalla)

- **Contenedor principal de contenido:** padding horizontal coherente en todo el producto (evitar que un módulo se sienta “más estrecho” que otro sin motivo).
- **Interior de tarjetas:** padding uniforme por tipo de card; más aire en bloques con pocos elementos; algo más compacto en listas operativas densas **sin** llegar a sensación de tabla apretada.

### Márgenes entre bloques

- Entre **secciones distintas** (ej. resumen del día vs lista): margen vertical claramente mayor que entre dos filas de la misma lista.
- Entre **elementos de la misma familia** (dos tarjetas hermanas): margen moderado, constante.

### Separación entre tarjetas

- Tarjetas en lista: separación suficiente para **leer el borde** de cada una sin fusionarse; no tanto que parezcan islas flotantes sin relación.

### Ritmo visual

Usar una **escala reducida de pasos** (por ejemplo 2–3 niveles de separación vertical reutilizables) en todo el producto. Escala mental:

- **S** — entre ítems muy relacionados (líneas dentro de una card).
- **M** — entre bloques dentro de una pantalla.
- **L** — entre regiones de significado distinto (hero vs contenido vs acciones fijas).

### Densidad correcta

- **Evitar pantallas vacías:** si hay poco contenido, el espacio en blanco debe **dirigir** (ilustración mínima, mensaje útil, CTA), no dejar sensación de “¿se ha roto?”.
- **Evitar pantallas saturadas:** si no cabe sin scroll continuo de bloques iguales, **dividir flujo**, usar tabs o resumir.
- **Evitar exceso de aire:** demasiado padding vertical en listas largas obliga a scroll innecesario y fatiga.
- **Evitar exceso de bloques:** cada card o panel debe tener **un rol**; fragmentar en micro-cards sin jerarquía produce ruido.

---

## Jerarquía visual

### Información importante

Lo importante debe ganar por **tamaño, peso, color y posición** — no solo por orden en el DOM.

- **Nivel 1:** qué es esta pantalla / qué decisión tomo aquí (título + estado global si aplica).
- **Nivel 2:** el dato o acción del momento (cantidad, alerta, botón principal).
- **Nivel 3:** contexto y acciones secundarias.

### Tamaños visuales

- Título de pantalla: **claramente mayor** que el cuerpo; en móvil, aún legible a brazo extendido en tablet colgada.
- Datos operativos críticos (cantidades, totales, estado): **escala intermedia alta** respecto al texto de apoyo.

### Pesos tipográficos

- Un solo eje de **extrabold/black** reservado para **titulares y cifras clave**; abusar de él anula la jerarquía.
- Cuerpo: peso medio/semibold para legibilidad rápida; texto auxiliar más ligero o menor tamaño, nunca microscópico.

### Prioridades y lectura rápida

- **F patrón** en bloques de contenido: título arriba izquierda, acción derecha o abajo según dispositivo.
- En listas operativas: **primera línea = identidad del ítem**, segunda línea = contexto, tercera = metadato opcional.

---

## Tarjetas

### Estilo

Tarjetas **limpias**, fondo claro, borde o sombra muy sutil — suficiente para separar del fondo sin marco pesado. Sensación **de objeto tangible** al tocar, no de celda de Excel.

### Radios

Esquinas **consistentemente redondeadas** en todo el producto (un solo sistema de radio por familia: ej. cards grandes vs chips). Evitar mezclar “casi cuadrado” y “muy redondo” en el mismo flujo sin motivo.

### Sombras

Sombras **bajas y difusas**: profundidad suave; nunca sombras duras tipo material de marketing agresivo.

### Densidad

- **Cards informativas** (resumen): pueden llevar más aire interno.
- **Cards de lista operativa**: más compactas, pero sin sacrificar altura táctil de la fila completa.

### Espaciado interno

Padding homogéneo; alineación de texto y controles a una **rejilla implícita** (mismos márgenes izquierdos en una columna de contenido).

### Consistencia entre módulos

Misma **gramática de card** en Pedidos, Producción, APPCC, etc.: si el usuario aprende una vez, debe reconocer el patrón siempre.

---

## Botones

### Tamaños

- **Primario:** altura táctil completa; ancho según contexto (bloque completo en móvil para acción única crítica, o ancho auto con padding horizontal generoso).
- **Secundario:** misma altura táctil cuando compiten en una fila; si es texto-enlace, área de toque ampliada invisible.

### Importancia visual

Una pantalla debe tener **una acción primaria clara** (color de marca, peso máximo). Secundarias: outline o fondo neutro. Terciarias: texto o icono con zona de toque amplia.

### Jerarquías

No más de **dos niveles de “fuerte”** por vista: primario + secundario visible; el resto bajo “más opciones” o pantalla siguiente si es necesario.

### CTA principales

Verbos **operativos** en contexto: “Guardar día”, “Enviar pedido”, “Registrar” — no “Aceptar” genérico si se puede ser específico sin alargar.

### Botones secundarios

Visibles pero **visualmente más ligeros**; nunca el mismo peso que el primario salvo error de jerarquía intencional (raro).

### Botones destructivos

Estilo **distinto** (color de alerta/destrucción del sistema), no como primario de marca. Confirmación clara antes de acciones irreversibles.

### Interacción táctil

Feedback inmediato: estado **pressed/disabled** obvio; evitar doble envío con estado de carga en el propio botón.

---

## Banners y headers

### Estructura visual

- **Cabecera de producto/módulo:** zona superior con identidad (título + contexto corto: local, fecha, plantilla).
- **Banners informativos** (avisos, periodo forzado, día cerrado): **una franja** con color semántico suave, texto corto, acción opcional a la derecha o debajo en móvil.

### Altura correcta

- El header **no debe comer la mitad de la pantalla** en móvil: título + una línea de contexto + acceso a navegación secundaria debe caber en **una fracción razonable** del viewport; el contenido operativo debe empezar pronto.

### Evitar desperdicio vertical

- Subtítulos largos → **truncar con expansión** o mover a tooltip/“ver más” solo si es imprescindible.
- Decoración (líneas, iconos repetidos) **mínima**: cada píxel vertical cuenta en cocina.

### Títulos y subtítulos

- Título: **qué es esta pantalla** en pocas palabras.
- Subtítulo: **una línea** de contexto (plantilla, sede, fecha), no párrafo.

### Líneas decorativas

Uso **parcimonioso**: separadores finos entre regiones cuando agrupan; no rejillas de líneas que recuerden formularios viejos.

### Navegación en cabecera

Accesos a **Plantillas / Historial / Volver** deben ser **reconocibles y tocables**, sin competir con el título en peso visual.

---

## Formularios

### Inputs modernos

Campos **claros**, altura táctil, etiquetas visibles o placeholders que no sustituyen la accesibilidad. Estados de foco y error **visibles** (borde o fondo semántico).

### Densidad correcta

Agrupar campos relacionados; **no listas interminables** de un campo por fila sin secciones. En móvil, **una columna** salvo pares obvios (fecha inicio / fin).

### Evitar formularios eternos

- Dividir en **pasos** solo si cada paso tiene cierre lógico y feedback.
- Preferir **valores por defecto inteligentes** y campos opcionales claramente marcados.

### Agrupación lógica

Títulos de sección cortos (“Datos del pedido”, “Entrega”) — nunca capítulos de manual.

### Claridad inmediata

Al entrar en un formulario, el usuario debe saber **qué conseguirá al enviar** sin leer pie de página.

---

## Tablas

### Cuándo usar tablas

Cuando hay **muchas filas homogéneas**, comparación numérica horizontal clara y **usuario en contexto “analítico”** o en tablet/escritorio con espacio. Aún así, deben ser **legibles** y con jerarquía de columnas.

### Cuándo no usar tablas

- **Móvil estrecho** como presentación principal de datos ricos (nombre + meta + acción + estado).
- Cuando cada fila tiene **acciones distintas** y mucho texto: mejor **card de fila**.

### Tablas como cards en móvil

Misma información: **primera columna → título de card**, resto → filas etiqueta/valor o chips, acciones al pie o en esquina. No forzar scroll horizontal global de página por una tabla ancha.

### Listas operativas modernas

- Fondo de fila o borde izquierdo para **estado** (pendiente / hecho / alerta).
- Números grandes solo donde importan (cantidades, “hacer”).
- Acción principal **al alcance del pulgar** o en celda clara.

---

## Tipografía

### Sensación

Combinación **serif para marca y titulares** (calidez, restaurante) + **sans para interfaz** (legibilidad, datos) es coherente con una identidad premium gastronómica. Mantener **una familia de UI** y pesos limitados.

### Jerarquías

Escala tipográfica **corta** (pocos tamaños reutilizables): título pantalla, subtítulo, cuerpo, caption, número destacado.

### Pesos

Reservar **black/extrabold** a titulares y cifras clave; cuerpo en **semibold/medium** para escaneo rápido en listas.

### Tamaños

- Nada crítico por debajo de tamaño **ilegible en tablet a medio metro**.
- Captions y metadata: legibles pero **claramente subordinados**.

### Legibilidad

- **Interlineado** suficiente en títulos multilínea.
- **Números tabulares** donde haya comparación visual de cantidades (alineación).

### Densidad

Texto corrido **mínimo** en pantallas operativas; párrafos reservados para ayuda, legal o onboarding.

---

## Colores

### Filosofía

- **Marca** (rojo): acento, identidad, CTAs primarios y elementos de navegación destacada — **no** pintar pantallas enteras de rojo.
- **Neutros:** zinc/grises cálidos para fondos y bordes — **elegancia sin frialdad hospitalaria**.
- **Superficie:** claridad y contraste suficiente para lectura en cocina (luz variable).

### Colores operativos

Estados de fila o chips: **verde** éxito/completado, **ámbar** atención, **rojo** error o urgencia — **consistentes** en todos los módulos (mismo significado siempre).

### Alertas

Fondos **suaves** del color semántico + texto oscuro legible; evitar neón que canse.

### Estados

- Éxito: tranquilidad, “listo”.
- Warning: **actuar pronto**, no pánico.
- Error: **inequívoco**, con siguiente paso.

### Neutralidad elegante

Gris **no es aburrimiento** si está bien jerarquizado: es el lienzo para que datos y acciones brillen.

---

## Animaciones

### Suaves y rápidas

Transiciones **cortas** (percepción instantánea). Nada que retrase una acción operativa.

### Microinteracciones

- Cambios de estado en botones, aparición de banners, **feedback** de “recibido”.
- **Evitar** animaciones que distraigan durante entrada de datos repetitiva.

### Velocidad

Prioridad: **sensación de inmediatez**; si la animación suma más de ~200–300 ms de sensación de espera innecesaria, recortar.

### Feedback visual

**Skeleton o spinner** solo donde el contenido depende de red; en acciones locales, estados en el control.

### Evitar efectos exagerados

No parallax, no rebotes largos, no modales que “vuelan” desde el espacio. Premium = **contención**.

---

## Navegación

### Rapidez

El usuario debe **volver**, **cambiar de módulo** y **repetir la última acción frecuente** sin laberinto.

### Claridad

Etiquetas de menú **en lenguaje de negocio** (Pedidos, Producción), no jerga interna.

### Módulos

Cada módulo tiene **identidad** pero **misma gramática** de entrada/salida.

### Menús

- Menú lateral o inferior: **icono + texto** donde el espacio lo permita; solo icono solo si el significado es universal y probado.

### Tabs

Tabs cuando hay **mutua exclusión** de vistas al mismo nivel (misma entidad, distinto corte). Evitar tabs dentro de tabs.

### Acceso rápido

Acciones frecuentes del turno **cerca** de la navegación principal o del dashboard contextual.

---

## Experiencia operativa

### En cocina real

Chef One se usa **de pie, con prisa, con interrupciones**. La interfaz debe tolerar:

- **Salir y volver** sin perder contexto cuando sea razonable.
- **Errores de toque** con confirmación en acciones graves y **deshacer** donde aplique.

### Velocidad

Cada pantalla debe **responder** lo antes posible; la percepción de lentitud rompe la confianza premium.

### Estrés operativo

En picos de carga cognitiva, **menos opciones visibles** a la vez; el producto debe **guiar**, no preguntar veinte cosas.

### Claridad inmediata

Estado del sistema (día cerrado, sin conexión, sin plantilla) **visible** antes que listas vacías confusas.

### Reducción de errores

- Valores por defecto sensatos.
- Confirmaciones **solo** donde el coste del error es alto.
- Mensajes que digan **qué hacer**, no solo que falló.

---

## Consistencia global

### Un solo sistema

Todos los módulos son **Chef One**: mismas reglas de espacio, tarjeta, botón, color semántico y navegación. Un módulo “con otra skin” rompe la confianza.

### Coherencia total

- **Mismo lenguaje visual** (radios, sombras, tonos).
- **Mismas reglas UX** (dónde va el primario, cómo se muestran errores, cómo se listan ítems).

### Evolución

Nuevas pantallas **extienden** el sistema; si algo nuevo rompe reglas, se actualiza **este documento** y luego el resto del producto converge — no al revés.

---

## Errores que nunca deben hacerse

1. **Pantallas saturadas** — demasiados bloques, demasiadas decisiones a la vez.
2. **Exceso de texto** — párrafos donde bastan líneas o iconos + número.
3. **Formularios enormes** — una sola pantalla de veinte campos sin secciones ni progreso.
4. **Banners gigantes** — héroes que roban el viewport en móvil sin aportar acción.
5. **Tablas imposibles** — scroll horizontal forzado en móvil como única solución.
6. **Modales absurdos** — diálogos que contienen flujos enteros o scroll infinito.
7. **Navegación confusa** — mismas acciones con nombres distintos en módulos distintos sin motivo.
8. **Estilos diferentes entre módulos** — “cada equipo su tema”; Chef One es uno.
9. **Microtipografía en datos críticos** — forzar zoom mental en cantidades o alertas.
10. **Estética corporativa genérica** — gris plano, iconos stock sin criterio, sensación de intranet.

---

## Uso de este documento

- **Antes de diseñar** una pantalla nueva: revisar **jerarquía, densidad y táctil**.
- **Antes de aprobar** un diseño: test mental **móvil + tablet + servicio con prisa**.
- **Al debatir** con stakeholders: este documento es la referencia de **qué es “premium operativo”** en Chef One.

---

*Manual vivo. Actualizar cuando se refine la identidad; mantener alineado con `PRODUCT_PHILOSOPHY.md`.*
