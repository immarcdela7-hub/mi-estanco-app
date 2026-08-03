# notaxlost.com/tickets — el escaparate de actividades

Sitio HTML estático servido por nginx desde `/var/www/ntl`. Página principal:
`tickets.html` (`notaxlost.com/tickets`). Diseño claro con azul marino/verde de
marca NTL, Tailwind compilado en `css/app.css`. Sin frameworks en runtime.

## "Don't know what to visit? We do." — la barra de ayuda

Bajo los filtros hay una barra **siempre visible** con las 3 recomendaciones del
momento, el botón **Surprise me** y un acceso a **Ready-made plans**. No se
puede ocultar: es parte de la página, no un panel que haya que descubrir. Ocupa
poco para que el catálogo (lo principal) se vea sin bajar.

Los planes **no** viven dentro de la barra: al pulsar "Ready-made plans" se
abre una **vista aparte** que oculta el catálogo (todo lo marcado con
`data-view="catalog"`) hasta que se pulsa "Back to experiences".

- El cambio de vista está en un `<script>` al final de `tickets.html`, después
  de `recommend.js` y `plans-ui.js`, para saber ya si cada uno tiene contenido:
  sin recomendaciones la barra no aparece, y sin planes se oculta su botón.
- **Navegación hacia atrás**: vive en la cabecera, no dentro de las secciones.
  La flecha de arriba a la izquierda es contextual (`window.ntlSetBack(modo)`):
  en el catálogo sale a `notaxlost.com` ("Main site"), en los planes vuelve a
  las experiencias, y en el detalle vuelve a la lista de planes. El **logo NTL
  va centrado** y es el que siempre sale a la web principal.
- Regla imprescindible: `[data-view][hidden] { display:none !important; }`.
  Varias secciones del catálogo llevan la clase `flex` de Tailwind y ese
  `display:flex` le gana al atributo `hidden`.

### Pestaña "Our picks" (`recommend.js`)

Elige 3 actividades **sin preguntar nada**, a partir de:

- **Qué está abierto dentro de dos horas.** Es un filtro, no un peso: si a esa
  hora está cerrado, no se recomienda y punto. Nadie sale de casa en el momento
  de mirar el móvil, así que se planifica con dos horas de margen. Si a esa hora
  no quedan al menos tres cosas abiertas —de madrugada no quedan—, se pasa a
  mañana por la mañana **y se dice en el texto**, en vez de proponer un museo
  cerrado. De ahí salen las columnas `horario` y `franja` del catálogo.
- **La hora**: mañana → cultura y excursiones; tarde → mar y aventura;
  noche → gastronomía, flamenco, atardeceres y fiesta. Los cortes están puestos
  sobre la hora *objetivo*, no la actual.
- **La zona del cartel QR**: el CRM graba la ciudad del establecimiento en el
  propio QR (`?zona=lloret-de-mar`), así que prioriza lo que hay cerca y lo dice
  ("Right here in Lloret de Mar").
- **Valoración y tirón**, con un empujón a lo mejor valorado.

Cada tarjeta muestra un motivo corto ("Beat the queues", "Golden hour pick"),
sin repetir motivo ni sitio entre las tres. El botón **Surprise me** vuelve a
tirar con mucha más aleatoriedad.

Detalles a respetar si se toca:

- Tras pintar las tarjetas **hay que llamar a `window.ntlApplyAttribution()`**
  o los enlaces nuevos se quedan sin `cmp=EST-XXXXX` y se pierde la atribución.
- El bloque va oculto (`hidden`) y solo se muestra si hay catálogo: sin datos o
  sin JS, la página funciona igual.
- Los estilos son **CSS plano** en `tickets.html`, no clases de Tailwind:
  `css/app.css` es un build purgado y no incluye clases que no se usaran antes.
- Al modificar `recommend.js`, sube el `?v=N` de su `<script>` en `tickets.html`.

## Vista de planes (`plans.csv` → `plans.js` → `plans-ui.js`)

Itinerarios nuestros ("First time in Barcelona", "Barcelona after dark", "48h on
the Costa Daurada"): una lista **ordenada** de actividades del catálogo, cada una
con una nota escrita por nosotros. Es lo que convierte el escaparate en consejo.

Se presentan como **tarjetas con un collage de las fotos de sus paradas**, su
descripción y "duración · paradas · desde X€"; al elegir una se abre su detalle
con los pasos en orden. Se ordenan por la zona del QR y por la hora: el plan de
la zona sale primero.

### Añadir o editar un plan

1. Edita `plans.csv` (una fila = un plan):

   | columna | qué es |
   |---|---|
   | `id` | identificador corto, sin espacios (`gaudi-day`) |
   | `titulo` / `subtitulo` | lo que se ve en la cabecera del plan |
   | `provincia` / `city` | para que salga primero cuando el QR es de esa zona |
   | `momento` | `morning`, `afternoon`, `evening`, `night`, `any` (o varios separados por comas) |
   | `duracion` | texto libre: `1 day`, `1 night`, `2 days` |
   | `actividades` | **ids de GetYourGuide** separados por `\|`: `50027\|53791\|1043339` |
   | `notas` | una nota por actividad, en el mismo orden, separadas por `\|` |

   El id de una actividad es el número que va tras la `t` en su URL de GYG
   (`…-t50027/` → `50027`), y tiene que existir ya en `catalog.csv`.

2. Regenera: `node tools/build-plans.mjs`. Avisa si un id no está en el catálogo
   o si el número de notas no cuadra con el de actividades.
3. Despliega (sincroniza `web/` → `/var/www/ntl`).

El precio "from X€" del plan se calcula solo sumando los mínimos de sus paradas.

### Reservar el plan entero (solo lo nuestro)

Una parada de un plan puede ser **nuestra**: en `plans.csv` se escribe
`ntl:<slug>` en vez del id de GetYourGuide. Esas no están en `catalog.csv` —viven
en el CRM— así que `build-plans.mjs` las deja apuntadas y `plans-ui.js` las
resuelve en el navegador con lo que trae `own.js`.

Y son las únicas que se pueden meter en una cesta de verdad: **se reservan
juntas, en una sola operación, todo o nada**. Un envío, un localizador, un
total. Si la segunda parada se ha llenado por el camino, no se crea ninguna:
nadie se queda con la cata pagada y sin la visita. Eso lo garantiza la
transacción serializable de `POST /api/publico/reservas`, que acepta `items[]`.

En un plan mixto se dice sin rodeos: *"2 of the 3 stops are ours, so they book
here together. The rest are on GetYourGuide and go one at a time."*

### La cesta del plan (paradas de GetYourGuide)

**GetYourGuide no tiene cesta para afiliados**: cada enlace vende una actividad
y no hay URL que acepte varios `tour_id` (comprobado uno por uno: `?tour_ids=`,
`?bundle=`, `?add_to_cart=1`, `/cart/?tour_ids=`, `/shopping-cart/` — los ignora
todos). Su página `/cart/` existe y guarda la selección 30 minutos, pero solo se
llena navegando por su web; no hay forma de rellenarla desde fuera. Un plan de
tres paradas son tres reservas, y eso no lo podemos cambiar.

Reservar por API **no es cuestión de tráfico**, que es lo que parecía. Los
niveles de la Partner API son tres y solo el último reserva:

| Nivel | Requisito | ¿Reserva? |
|-------|-----------|-----------|
| Basic | 100.000 visitas/mes | No: solo textos, imágenes y precios |
| Reading | 1.000.000 visitas + 300 reservas/mes | No |
| Masterbill | Contrato con depósito, vía partner manager | Sí |

O sea: llegar a 100.000 visitas no daría cesta. Haría falta negociar Masterbill,
y con él **nosotros pasamos a ser el vendedor** (merchant of record): cobramos,
respondemos de la reserva y asumimos las cancelaciones. Es una decisión de
negocio, no un desbloqueo técnico que llegue solo con crecer.

La investigación entera —qué se probó, qué se verificó en navegador y qué se
leyó en su documentación— está en **`tools/gyg-cesta.md`**. Antes de volver a
intentarlo, léelo: ahí están las seis variantes de URL que ya no funcionan.

Lo que sí se puede arreglar es el problema de verdad: que al volver de la
segunda parada ya no sabes por dónde ibas. La cesta lleva la cuenta —"1 de 3
reservadas"—, marca cada parada al pulsar Book, y **sobrevive a irse a GYG y
volver** (`localStorage`, una clave por plan: `ntl_cesta_<id>`). Los enlaces del
plan abren en otra pestaña a propósito: el plan es el sitio de trabajo.

Detalles que ya costaron un fallo:

- El oyente de la cesta se engancha **una sola vez**, fuera de `showDetail`. Si
  se enganchara en cada apertura, al segundo plan cada clic contaría por dos.
- Al marcar una parada se repinta **solo la barra**, no el detalle entero: si no,
  se le cerraría el calendario de otra parada justo mientras elige día.
- `localStorage` puede lanzar en modo privado. Todo va envuelto en `try`: sin
  memoria la cesta no recuerda, pero el plan funciona igual.

### El día del plan (`date_from`)

De todo lo que se probó, **`date_from=YYYY-MM-DD` es lo único que GetYourGuide
acepta desde fuera**: su página abre con el calendario ya en ese día. No es una
cesta, pero quita el paso que más se repetía —un plan son tres reservas y el
cliente elegía la misma fecha tres veces—.

La barra "When are you going?" va encima de la cesta, guarda el día en
`ntl_fecha_<id>` y lo mete en **todos** los enlaces de cada parada, no solo en
el botón Book: quien entra por la foto o por el título lo perdería. También es
el día por defecto de nuestras paradas; si esa actividad no abre ese día, el
selector cae al primero libre en vez de enseñar un día sin horas.

Cambiar el día **sí** repinta el detalle entero: la fecha viaja dentro de cada
URL, así que hay que rehacerlas todas. Es la única excepción a la regla de
repintar solo la barra.

> `date_from` está verificado. `_pc=1,2` (personas) aparece en sus URLs pero no
> se ha comprobado que respete el valor, así que no se usa.

> Al modificar `plans-ui.js`, sube el `?v=N` de su `<script>` en `tickets.html`.

## Widget de ciudad de GetYourGuide ("Discover more")

Bajo el catálogo hay un widget de ciudad de GYG que **cambia con la provincia
seleccionada**: Barcelona (`l45`), Salou para Tarragona (`l1884`), Girona
(`l550`) y Lleida (`l100032`). "All Catalunya" muestra Barcelona.

Sirve sobre todo donde nuestra oferta es corta (Lleida tiene 3 actividades):
convierte un "aquí no hay casi nada" en una salida al catálogo completo de GYG.

Se monta **uno solo** y **de forma perezosa**, cuando la sección entra en
pantalla (`IntersectionObserver`). Va al final de 101 tarjetas, así que la
mayoría de visitas no llegan a verla y no pagan su coste: cada widget son
~1,5 MB y ~27 peticiones a GetYourGuide.

- El script de GYG **sí detecta los `data-gyg-href` inyectados después**
  (verificado en navegador real: monta en 43-315 ms), así que no hace falta
  tenerlos todos puestos ni forzar un re-escaneo.
- El `data-gyg-cmp` se pone en el `div` al inyectarlo. Ese atributo vive fuera
  del iframe y GYG lo traslada a la URL del iframe, así que las reservas del
  widget también quedan atribuidas al local.

Para cambiar a qué ciudad apunta una provincia: el mapa `CITY_WIDGET` en
`tickets.html` y el `data-gyg-location-id` del `div` correspondiente. El id sale
de la URL de GYG (`…/barcelona-l45/` → `45`).

> Tarragona apunta a **Salou** porque es donde está nuestra oferta (11
> actividades). Si prefieres la ciudad de Tarragona, saca su id del generador
> de widgets del Partner Portal y cámbialo.

## Widget de disponibilidad ("Check dates & live price")

Está en los **dos sitios**: en cada tarjeta del catálogo y en cada parada de un
plan. Muestra calendario, personas y **precio en vivo** — la solución de fondo a
que nuestros precios sean una foto fija.

Se presenta distinto según el sitio, porque el contexto lo pide:

- **Catálogo**: abre una **ventana** (en móvil, hoja inferior). En una rejilla
  de tres columnas no se puede desplegar en línea sin descuadrarla. Al cerrar se
  vacía el contenido para descargar el iframe.
- **Detalle de un plan**: se despliega **en línea** bajo la parada, que es una
  lista vertical y ahí sí encaja.

Los dos usan la misma función (`window.ntlMountAvailability`, en `plans-ui.js`),
así que la atribución y la red de seguridad son idénticas.

> **La reserva se cierra siempre en GetYourGuide.** Su botón "Check availability"
> navega a su web; es así por diseño y está documentado. Reservar sin salir
> requeriría el nivel Masterbill de la Partner API —contrato con depósito, no una
> cifra de visitas—. El valor del widget es ver fecha y precio real **antes** de
> salir, y llegar a GYG ya decidido.

- **Bajo demanda y uno cada vez** (`plans-ui.js` → `mountAvailability`): son
  iframes de ~600 KB; abrir uno cierra el anterior.
- Lleva `data-gyg-cmp` con el código del establecimiento.
- **Red de seguridad**: si a los 3,5 s no hay iframe (GYG caído o bloqueado),
  el hueco se sustituye por un enlace normal a la actividad, con su
  `partner_id` y su `cmp`. El cliente nunca ve un hueco roto.

## Actividades propias (`own.js`) — aquí sí se reserva

Lo de arriba tiene un techo: mientras vendamos producto de GetYourGuide, la
reserva es suya y termina en su dominio. Sus widgets no permiten cobrar fuera, y
la única alternativa —el nivel Masterbill de la Partner API— es un contrato con
depósito que nos convertiría en el vendedor. No se desbloquea creciendo.

Las **actividades propias** son el camino que sí llega hasta el final. Son
nuestras — catas, visitas guiadas, lo que acordemos directamente con el
proveedor — y el cliente elige día, hora y personas, ve el total y confirma
**sin salir de notaxlost.com**.

No se editan en `catalog.csv`: viven en el CRM (**Actividades propias**) y
`own.js` las trae al cargar la página.

```
CRM /api/publico/actividades      -> tarjetas (van en la misma rejilla)
CRM /api/publico/disponibilidad   -> días y horas con plazas libres
CRM /api/publico/reservas  (POST) -> la reserva, ya con el código del QR
```

El reservador va en **dos pasos**: primero *cuándo* (fecha, hora, personas,
total) y solo después *quién* (nombre y correo). Quien abre esto quiere saber
si hay sitio el sábado, no rellenar sus datos todavía. Se abre con la primera
fecha y la primera hora ya marcadas, para que nadie se encuentre un botón
apagado sin saber por qué.

Cómo se comporta:

- **Se distinguen a la vista**: distintivo verde "Book here" y pie azul
  "Choose a date & book here". No es cosmética: el cliente tiene que saber con
  quién contrata, y el acuerdo con GetYourGuide es no exclusivo pero sí exige
  no confundir sobre quién vende.
- **El botón del pie NO lleva la clase `.ntl-card-dates`.** Esa la escucha el
  catálogo para abrir el widget de GetYourGuide; si se la ponemos, se abren los
  dos a la vez y el suyo sin `tour`, que cae en su anuncio genérico. `own.js`
  usa `.ntl-own-dates` y `tickets.html` además ignora cualquier clic que venga
  de dentro de una `.ntl-own`.
- **Son una tarjeta más**: mismas clases y mismos `data-*`, así que entran en
  los filtros, el buscador, el orden y las dos vistas. Se registran con
  `window.ntlAddItems(nodos)` porque llegan después del render inicial.
- **La atribución no viaja en un enlace** (aquí no hay enlace externo al que
  colgarle `cmp`), sino en el cuerpo de la reserva: `ref` con el código del QR.
  El CRM lo resuelve contra el establecimiento y calcula su comisión.
- **El precio y el cupo los pone el CRM**, nunca el navegador. Lo que se envía
  es qué, cuándo y cuántos; el importe se recalcula al otro lado.
- **Si el CRM no responde, la web sigue entera**: simplemente no aparecen las
  propias. El catálogo de GetYourGuide y su atribución no se enteran.
- **Enlace directo**: `/tickets?actividad=<slug>` abre esa reserva ya abierta.

El origen del CRM se fija en `tickets.html` (`window.NTL_CRM`), no dentro de
`own.js`, para poder apuntarlo a otro sitio sin tocar el módulo.

## Pruebas

En `tools/tests/` hay nueve baterías con navegador real. Ejecútalas ante
cualquier cambio en `web/` — sobre todo por la atribución, que es un fallo
silencioso: si un enlace pierde el `cmp`, la web *parece* seguir bien pero las
ventas ya no se pueden repartir. Ver `tools/tests/README.md`.

## Catálogo dirigido por datos

Las tarjetas **no** se escriben a mano en el HTML: se generan por JS desde
`catalog.js` (`window.NTL_CATALOG`), que a su vez se **genera** desde el maestro
editable `catalog.csv`.

```
catalog.csv   (editas esto: una fila = una actividad)
     │  node tools/build-catalog.mjs
     ▼
catalog.js    (generado; lo carga tickets.html y pinta las tarjetas)
```

### Añadir una actividad

1. Añade una fila a `catalog.csv` (Excel/Sheets sirve; se guarda como CSV UTF-8).
2. **Clasifica su horario. Es obligatorio.** Rellena `horario` con la ventana en
   la que la actividad puede **empezar** (`09:00-18:00`) y `franja` con
   `dia`, `tarde`, `noche` o `flexible`. Si cruza medianoche, la hora de cierre
   va antes que la de apertura (`23:00-03:00`).
3. Consigue la **foto**: se scrapea sola (ver abajo) o pega a mano la URL de la
   imagen de GetYourGuide (clic derecho sobre la foto → Copiar dirección de la
   imagen) en la columna `imagen`.
4. Regenera: `node tools/build-catalog.mjs`.
5. Despliega (sincroniza `web/` → `/var/www/ntl`; no hace falta reiniciar nginx).

> `build-catalog.mjs` **se niega a generar** si alguna fila se queda sin horario,
> y `add-activities.mjs` lo comprueba antes de abrir el navegador. No es una
> molestia: sin ventana horaria el recomendador vuelve a proponer la Sagrada
> Familia a las 23:33, que es de donde viene esta regla.

### Columnas de `catalog.csv`

| columna | qué es |
|---|---|
| `order` | orden base (número) |
| `provincia` | `barcelona` \| `tarragona` \| `girona` \| `lleida` |
| `city` | localidad (para agrupar y para los deep-links `?zona=`) |
| `categoria` | `culture` \| `sea` \| `tours` \| `food` |
| `categoria_label` | etiqueta que se muestra arriba del título (p. ej. "Nightlife") |
| `titulo` / `descripcion` | textos de la tarjeta |
| `precio` | número (se usa para ordenar por precio) |
| `precio_display` | texto de precio, `from N€` (precio real "desde" de GYG) |
| `rating` | nota (p. ej. 4.8) |
| `distintivo` | `travelers-choice`, `top-pick` o vacío (ver abajo) |
| `horario` | **obligatorio.** Ventana en la que puede *empezar*: `09:00-18:00`. Si cierra antes de abrir, cruza medianoche (`23:00-03:00`) |
| `franja` | `dia` \| `tarde` \| `noche` \| `flexible` |
| `zonas` | ciudades a las que **también** sirve, separadas por `\|`. Vacío = solo la suya |
| `keywords` | palabras para el buscador (`data-name`) |
| `etiqueta_pie` | etiqueta pequeña del pie (p. ej. "Open Bar") |
| `url_getyourguide` | enlace de GYG **con** `?partner_id=IBO5PAK&utm_medium=local_partners` |
| `imagen` | URL de la foto (hotlink a `cdn.getyourguide.com`) |
| `imagen_old` | (histórico) ruta de la imagen local anterior; no se usa |

## Zonas: que el QR de un bar de Reus ensene cosas de Reus

Un QR llega con `?zona=<slug-de-ciudad>`, que el CRM saca del establecimiento
(`citySlug()` en `crm-web/src/lib/qr.ts`). El problema: GetYourGuide **solo tiene
oferta propia en 8 de los 24 municipios catalanes de más de 50.000 habitantes**
(comprobado uno a uno; buscar "Sabadell" en GYG devuelve actividades de Sevilla).
Sin más, el QR de Cornellà dejaría la pantalla vacía.

Se resuelve con la columna **`zonas`**, no reetiquetando:

```
city  = barcelona                                   <- donde ES de verdad
zonas = cornella-de-llobregat|rubi|viladecans       <- a quien SIRVE
```

> **La línea que no se cruza:** nunca se cambia el `city` de una actividad para
> que parezca de otra ciudad. El cliente paga y viaja: si la tarjeta miente sobre
> dónde es, se planta en el sitio equivocado. Hay una prueba que lo vigila
> (`test-zonas.mjs` compara el `city` de cada fila contra el commit anterior).

- **Criterio de "alrededores"**, escrito una vez y aplicado igual a todas:
  misma área metropolitana o **~40 min en transporte público**. Está en
  `tools/zonas.json` junto al mapa ciudad → hubs, con la nota de cada una.
- **Orden dentro de una zona**: primero lo que es **DE** esa ciudad, después los
  alrededores. Quien escanea en Reus ve Reus arriba.
- El antiguo apaño de `costadaurada` (que estaba escrito en el JS) **ya no
  existe**: Salou y Cambrils llevan `costadaurada` en su columna `zonas`.

```
node municipios.mjs      # lista de municipios >50k desde Idescat -> municipios.json
node descubrir-ciudades.mjs  # que ciudades tienen oferta propia en GYG
node curate-ciudades.mjs # lo que falta para que cada una tenga 10 propias
node add-activities.mjs  # las da de alta
node rank-ciudades.mjs --apply   # calcula los top 10 y escribe la columna zonas
node build-catalog.mjs
```

`tools/top-ciudades.json` guarda el top 10 de cada ciudad y cuántas son suyas.

> **Tres ciudades no llegan a diez y no se rellenan a ojo**: Lleida (5, no hay
> nada a menos de 40 min), y **Manresa y Vic (0)**. Barcelona está a 70 min de
> las dos; Montserrat está a 30 min de Manresa, pero esas actividades **salen de
> Barcelona**. Sus QR se quedan en el filtro de provincia.

## Distintivos de la tarjeta

Cada tarjeta lleva **como mucho una** pastilla, siempre arriba a la derecha (la
valoración vive arriba a la izquierda). Son la misma familia —mismo tamaño,
forma y peso— y sólo cambian de color:

| `distintivo` | Se ve | Color | De dónde sale | Cuántas |
|---|---|---|---|---|
| `travelers-choice` | TRAVELLERS' FAVOURITE | azul marino | está entre las **25 primeras** del ranking | 25 |
| `top-pick` | GYG TOP PICK | ámbar | GYG la marca "Top pick" y está fuera del corte | 9 |
| (vacío) | — | — | el resto | 91 |
| — (propias) | NTL EXPERIENCE | verde NTL | `web/own.js`, las actividades nuestras | — |

No se usa "Travelers' Choice" literal: es el nombre registrado del premio de
Tripadvisor y estas actividades no lo han ganado.

**Por qué el corte está en 25 y no en 50.** El catálogo contiene las 50 más
vendidas, pero pintarles la pastilla a todas dejaba el **40%** de las tarjetas
con la misma etiqueta, y un distintivo que lleva medio catálogo no distingue
nada. Con 25 se queda en el 27% contando las dos pastillas. Se cambia en el
`CORTE` de `tools/apply-distintivos.mjs` (y el de `tools/tests/test-distintivos.mjs`).

> **GYG no marca "Bestseller"** a ninguna de las 821 actividades cosechadas: sus
> etiquetas reales son New activity (198), Likely to sell out (33), Top pick (19),
> Official ticket (16) y Originals (2). Por eso el segundo distintivo se alimenta
> de "Top pick", que sí existe.

## El top 50 de Cataluña

El catálogo contiene, como mínimo, las **50 actividades más vendidas de
Cataluña** en GetYourGuide.

### Cómo se decide

GYG **no publica ventas**, así que se combinan las señales que sí publica:

1. **nº de reseñas** — el mejor proxy de volumen. Se usa `log10(reseñas+1)`
   porque van de decenas a cientos de miles y en lineal una sola actividad
   aplastaría al resto.
2. **posición en el listado** — su orden por defecto es por popularidad; hasta
   +0,5 por la mejor posición conseguida.
3. **distintivos de GYG** — Bestseller +0,40, Likely to sell out +0,25,
   Top pick +0,25.

```
node harvest-listings.mjs   # cosecha 16 listados -> tools/harvest.json
node rank-top50.mjs         # ranking auditable   -> tools/top50.json
node curate-top50.mjs       # las que faltan      -> tools/new-activities.json
node add-activities.mjs     # las da de alta en catalog.csv
node apply-distintivos.mjs --apply   # rellena la columna distintivo
node build-catalog.mjs
```

`tools/top50.json` es la **prueba** de por qué cada actividad está en el top 50:
guarda reseñas, valoración, posición, distintivos y de qué listados salió.

> **Ojo con la concentración.** El top 50 real de Cataluña sale 42 de Barcelona,
> 5 de Girona, 3 de Tarragona y **0 de Lleida**: la primera de Girona está en el
> puesto 13 y la de Tarragona en el 28. Un top global es, en la práctica, un top
> de Barcelona, y no le sirve al turista que escanea un QR en Salou o Lloret.
> Pendiente de decidir: top por zona además del global, o subir en el orden las
> de la provincia del cartel (`?zona=`).

## Fotos

Se sacan de la **ficha de cada actividad en GetYourGuide** (`og:image`) con un
navegador real (Playwright, `channel: chrome`). La API de partner de GYG no está
disponible y GYG bloquea peticiones sin navegador (403), por eso el navegador real.

```
cd tools && npm install          # una vez (instala Playwright; usa tu Chrome)
node scrape-gyg.mjs              # rellena `imagen` en las filas que la tengan vacía
node scrape-gyg.mjs --all        # re-scrapea todas
```

Va despacio a propósito (pocas por minuto) para que GYG no bloquee. Si alguna
falla, plan B: pega la URL de la imagen a mano en el CSV.

## Precios (refrescar cada pocos meses)

Los precios de GetYourGuide **cambian con la temporada**, así que conviene relanzar
esto cada pocos meses. El precio "desde" se saca del JSON-LD de cada ficha (la oferta
más baja) con navegador real y rate-limited. Moneda: EUR.

```
cd tools
node scrape-prices.mjs           # scrapea las 101 URLs -> tools/scrape-results.json
node apply-prices.mjs            # DRY-RUN: lista outliers (<10€ o >300€) y cambios
#  -> revisa los outliers a mano contra la ficha de GYG (ayuda: node verify-outliers.mjs).
#     Si GYG expone un precio raro en su JSON-LD (p. ej. coge un tour privado en vez
#     del básico), corrígelo en  tools/price-overrides.json  ->  { "<tid>": <precio> }
node apply-prices.mjs --apply    # escribe catalog.csv: precio + precio_display="from N€"
node build-catalog.mjs           # regenera catalog.js
```

Reglas:
- `precio` (numérico, para ordenar/filtrar) y `precio_display` (`from N€`) se mantienen
  **siempre coherentes**; `apply-prices.mjs` lo garantiza.
- **Revisa outliers**: por debajo de 10€ o por encima de 300€ pueden ser errores de
  scraping (coger el precio de un tour privado en vez del básico) — verifícalos.
- `tools/scrape-results.json` guarda el crudo (precio, moneda, ofertas JSON-LD) para
  poder repetir y auditar.

## Atribución (crítico — no romper)

`ntl-attrib.js` guarda `?ref=EST-XXXXX` en una cookie de 30 días y añade
`cmp=EST-XXXXX` a **todos** los enlaces de GetYourGuide (sin tocar `partner_id`).
Como las tarjetas se pintan por JS, **hay que reejecutar la atribución después de
renderizar**: `tickets.html` llama a `window.ntlApplyAttribution()` tras pintar, y
`ntl-attrib.js` incluye además un `MutationObserver` de seguridad.

Verificar: abrir `…/tickets?ref=PRUEBA1` y comprobar que los enlaces de GYG
terminan en `&cmp=PRUEBA1` conservando `partner_id=IBO5PAK`.

Deep-links de carteles por local: `?zona=barcelona|salou|cambrils|costadaurada`
(o `?provincia=girona|lleida|…`) preselecciona la provincia.

En las **actividades propias** no hay enlace a GetYourGuide, así que el `cmp` no
aplica: el mismo `ref` viaja en el cuerpo de la reserva (`own.js`) y el CRM lo
resuelve contra el establecimiento. Es el mismo código y el mismo reparto, por
otro camino.

## Herramientas (`tools/`, no se despliega)

| script | qué hace |
|---|---|
| `extract-cards.mjs` | (una vez) vuelca el HTML original a `catalog.csv` |
| `scrape-gyg.mjs` | rellena la columna `imagen` desde GYG |
| `scrape-prices.mjs` | scrapea el precio "desde" real de las 101 → `scrape-results.json` |
| `apply-prices.mjs` | aplica precios al CSV (`--apply`); marca outliers; usa `price-overrides.json` |
| `verify-outliers.mjs` | abre en el navegador las fichas dudosas para revisar el precio a mano |
| `harvest-listings.mjs` | recolecta URLs reales de actividades de páginas de GYG |
| `curate.py` / `select.py` | filtran y seleccionan candidatos → `new-activities.json` |
| `add-activities.mjs` | enriquece y añade actividades nuevas al CSV |
| `build-catalog.mjs` | **`catalog.csv` → `catalog.js`** (el que usarás a menudo) |
| `verify.mjs` | prueba en navegador (render, filtros, atribución) |
