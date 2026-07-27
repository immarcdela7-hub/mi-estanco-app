# notaxlost.com/tickets — el escaparate de actividades

Sitio HTML estático servido por nginx desde `/var/www/ntl`. Página principal:
`tickets.html` (`notaxlost.com/tickets`). Diseño claro con azul marino/verde de
marca NTL, Tailwind compilado en `css/app.css`. Sin frameworks en runtime.

## "Don't know what to visit? We do." (`recommend.js`)

Recomendador contextual bajo los filtros. Elige 3 actividades **sin preguntar
nada**, a partir de:

- **La hora**: mañana → cultura y excursiones; tarde → mar y aventura;
  noche → gastronomía, flamenco, atardeceres y fiesta.
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
2. Consigue la **foto**: se scrapea sola (ver abajo) o pega a mano la URL de la
   imagen de GetYourGuide (clic derecho sobre la foto → Copiar dirección de la
   imagen) en la columna `imagen`.
3. Regenera: `node tools/build-catalog.mjs`.
4. Despliega (sincroniza `web/` → `/var/www/ntl`; no hace falta reiniciar nginx).

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
| `trending` | `si` / `no` (muestra la etiqueta "Trending") |
| `keywords` | palabras para el buscador (`data-name`) |
| `etiqueta_pie` | etiqueta pequeña del pie (p. ej. "Open Bar") |
| `url_getyourguide` | enlace de GYG **con** `?partner_id=IBO5PAK&utm_medium=local_partners` |
| `imagen` | URL de la foto (hotlink a `cdn.getyourguide.com`) |
| `imagen_old` | (histórico) ruta de la imagen local anterior; no se usa |

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
