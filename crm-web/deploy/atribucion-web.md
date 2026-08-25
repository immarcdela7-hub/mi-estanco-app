# Atribución de QR en la web (notaxlost.com)

Cómo está instalada la atribución que conecta los QR de los establecimientos con
las reservas de GetYourGuide. **La web NO es WordPress**: es un sitio de HTML
estático servido por nginx desde `/var/www/ntl` en el VPS. Por eso la atribución
no se instala con un plugin, sino con un pequeño archivo JavaScript incluido en
la página de tickets.

## Qué hace

Cuando alguien llega desde un QR (`https://notaxlost.com/tickets?ref=EST-XXXXX`):

1. Añade `cmp=EST-XXXXX` a todos los enlaces hacia GetYourGuide, **sin tocar el
   `partner_id`** que ya llevan.
2. Si el visitante ha aceptado las cookies, guarda además ese `ref` en la cookie
   `ntl_ref` durante 30 días.

Así cada reserva queda atribuida a la cuenta de partner de NoTaxLost
(`partner_id`) y, dentro de ella, al establecimiento concreto (`cmp`), que es la
columna de campaña que aparece en el Partner Portal de GYG.

### Lo que hay que entender antes de tocar nada

**Rechazar las cookies NO le quita la venta al establecimiento.** El código del
local viaja en la propia dirección (`?ref=`), así que esa visita se atribuye
igual sin guardar nada en el móvil. Lo único que se pierde al rechazar es la
**memoria entre visitas**: que el turista vuelva semanas después, ya sin el QR, y
el local siga cobrando.

Esto es lo que permite cumplir el artículo 22.2 de la LSSI sin dejar de pagar a
los estancos, y conviene decírselo a ellos con esas palabras. Si alguien
«simplifica» el script metiendo toda la atribución detrás del consentimiento, la
web seguirá pareciendo correcta y los estancos empezarán a cobrar de menos sin
que salte ningún error. `tools/tests/test-consentimiento.mjs` existe para
impedirlo.

## Cómo está instalada (estado actual)

- **Archivos JS:** `/var/www/ntl/ntl-consent.js` y `/var/www/ntl/ntl-attrib.js`
- **Incluidos en:** `/var/www/ntl/tickets.html`, en este orden y no al revés:
  ```html
  <script src="/ntl-consent.js?v=1"></script>
  <script src="/ntl-attrib.js?v=3"></script>
  ```
  El consentimiento primero: si se carga después, en la primera carga la
  atribución no encuentra el permiso y no guarda nada aunque el usuario ya
  hubiera aceptado en otra visita.
- `ntl-consent.js` va además en **todas** las páginas (`home`, `index`,
  `merchants`, `how-it-works`, `ecosystem`, `404`, `coming-soon`), porque el
  aviso y el pie legal tienen que estar en toda la web.
- **Páginas legales:** `/aviso-legal`, `/privacidad` y `/cookies`.
- No hace falta reiniciar nginx al cambiar archivos estáticos.

## El plazo de la cookie está escrito en varios sitios

Si se cambia, hay que cambiarlo en todos o quedarán contradiciéndose:

| Dónde | Qué dice |
|---|---|
| `web/ntl-attrib.js` | `var DIAS = 30;` — el valor real |
| `web/cookies.html` | la tabla de la política de cookies |
| `web/README.md` | la descripción del mecanismo |
| `crm-web/src/app/admin/integracion-web/page.tsx` | el texto del panel |
| `crm-web/deploy/atribucion-web.md` | este archivo |

`tools/tests/test-consentimiento.mjs` comprueba el valor real contra los 30 días,
así que si se cambia el código sin cambiar la prueba, salta.

> **Ojo con Safari.** Las cookies escritas por JavaScript se borran a los 7 días
> en iPhone, sea cual sea el `max-age`. Subir el plazo no cambia nada ahí: para
> eso habría que emitir la cookie desde nginx, y sólo se puede hacer respetando
> el consentimiento.

## Reinstalar o añadir a otra página

Si en el futuro se rehace la web y se pierde, o hay que atribuir otra página con
enlaces a GYG (por ejemplo `home.html`), basta con:

1. Asegurarse de que existe `/var/www/ntl/ntl-attrib.js` (crearlo con el
   contenido de arriba si no está).
2. Añadir la línea del `<script>` antes de `</body>` en esa página:
   ```bash
   F=/var/www/ntl/PAGINA.html
   cp -a "$F" "$F.bak-$(date +%Y%m%d-%H%M%S)"           # copia de seguridad
   grep -q "ntl-attrib.js" "$F" || \
     perl -0777 -i -pe 's{(</body>)(?!.*</body>)}{  <script src="/ntl-attrib.js"></script>\n$1}is' "$F"
   ```

## Verificación

**En el servidor:**
```bash
curl -sS -o /dev/null -w "JS: HTTP %{http_code} · tipo=%{content_type}\n" https://notaxlost.com/ntl-attrib.js
curl -sS https://notaxlost.com/tickets | grep -o '<script src="/ntl-attrib.js"></script>'
```
Esperado: `HTTP 200 · tipo=application/javascript` y la línea del `<script>`.

**En el navegador (equivale a escanear un QR):**
1. Incógnito → `https://notaxlost.com/tickets?ref=PRUEBA1`
2. F12 → Console →
   ```js
   document.querySelector('a[href*="getyourguide."]').href
   ```
   Debe devolver una URL que conserve `partner_id=...` y termine en `&cmp=PRUEBA1`.

## Notas importantes

- El `cmp` debe coincidir con el **código del establecimiento del CRM**
  (`EST-XXXXX`); es lo que casa al importar en **Ventas → Importar CSV**. En el
  export de GetYourGuide esa columna se llama **`Campaign`**; en nuestra
  plantilla, `codigo_establecimiento`. Los QR del CRM ya usan ese código en el
  `?ref=`, así que sale automático.
- **Una venta con `Campaign` vacío no se puede repartir**, pero sí se registra:
  entra como **venta directa** (sin establecimiento, sin reparto). Es ingreso
  nuestro y sin ella la contabilidad no cuadra con lo que paga GetYourGuide.
  La primera venta real (Prado, 29/07/2026) fue así: compra propia, sin QR de
  por medio.

  Si aparecen ventas sin campaña que **no** son propias, hay que mirarlo: puede
  significar que el `cmp` no sobrevive a navegar **dentro** de GetYourGuide
  hasta una actividad distinta de la que se pinchó. El `partner_id` sí sobrevive
  —esas ventas se nos pagan—, pero eso no prueba que el `cmp` lo haga. Se
  distingue con una compra de prueba: entrar con `?ref=`, pinchar una actividad
  **del catálogo** y comprar esa misma.
- Si el cliente escanea en un móvil pero compra en otro dispositivo, la campaña
  se pierde (límite del modelo de afiliación de GYG).
- El script actúa sobre los `<a href>` presentes al cargar la página. Si algún
  día los enlaces de GYG pasan a generarse por JavaScript o mediante widgets
  incrustados, habría que adaptar el fragmento.

## La ventana de GetYourGuide: 31 dias (medido, no supuesto)

**Este es el numero que gobierna el negocio.** Nuestra cookie decide que
establecimiento cobra; la de GetYourGuide decide si cobramos nosotros. Son dos
cookies en dominios distintos y la segunda no la controlamos: la pone GYG en
`getyourguide.com` y dura lo que ellos digan.

Medido el 25 de agosto de 2026 en Chrome: tras llegar por un QR y pulsar una
actividad, la cookie de GYG que contiene `partner_id=IBO5PAK` caducaba el **25
de septiembre**. Es decir, **31 dias desde el clic**.

### Lo que se descubrio de paso, y es mas importante que el numero

En la primera medicion salio una fecha mas corta (9 dias vista). No era una
ventana corta: era una cookie **anterior** que el clic nuevo **no refresco**.

O sea: **volver a pasar por notaxlost.com no reinicia el contador mientras haya
una cookie viva**. Conviene no dar por hecho lo contrario al planificar. Se
observo una sola vez, asi que no es una certeza absoluta, pero es lo que se vio.

### Consecuencias practicas

- **Alargar nuestra cookie no alarga nada de esto.** Si el turista compra el dia
  45, la cookie de GYG ya caduco y no hay comision para nadie, tenga la nuestra
  30 dias o 120.
- Donde SI sirve una ventana propia larga: si el turista vuelve a notaxlost.com
  pasado el dia 31 y pulsa, GYG abre una cookie nueva de 31 dias, y la nuestra
  es la que mantiene pegado el codigo del establecimiento. Sin ella esa venta
  seria directa (nos quedariamos el 100% en vez del 70%).
- Por tanto alargar nuestra cookie **es un coste**, no un ingreso: reparte en
  mas ventas. Puede compensar como inversion para que los locales mantengan el
  cartel, pero conviene decidirlo sabiendo eso.

### Como volver a medirlo

Estas ventanas se cambian sin avisar. Repetir cada pocos meses, en Chrome de
escritorio y en ventana normal (nunca incognito, que se borra al cerrar):

1. F12 (o clic derecho, Inspeccionar) -> pestaña **Aplicacion**.
2. **Almacenamiento -> Cookies -> `https://www.getyourguide.com`**.
3. Borrar TODAS las cookies de ese dominio. Sin esto se mide una cookie vieja y
   el resultado engaña, que es justo lo que paso la primera vez.
4. Ir a `notaxlost.com/tickets?ref=<codigo>` y pulsar una actividad.
5. Filtrar por `IBO5PAK` y leer la columna **Expires / Max-Age**.

Restar la fecha de hoy. Eso es la ventana.

> Sigue pendiente pedirle a GetYourGuide la cifra **por escrito**: lo medido en
> un navegador describe como se comporta hoy, no un compromiso contractual.

## La atribucion es a ULTIMO clic, y su propia publicidad nos pisa

Medido el 25 de agosto de 2026, en el mismo navegador y una cosa detras de otra:

1. Se llega por el QR y se pincha una actividad. En las cookies de
   `getyourguide.com` aparece nuestro `IBO5PAK`.
2. Se busca "get your guide" en Google y se pincha **su anuncio de pago**
   (`partner_id=CD951&cmp=brand&gclid=...`, que es su campana de marca).
   Resultado: **`IBO5PAK` desaparece y queda `CD951`**.
3. Se vuelve a entrar por notaxlost.com. Resultado: **vuelve `IBO5PAK`**.

Es decir: **gana el ultimo clic etiquetado**, y se puede perder y recuperar.

Junto con lo de la seccion anterior (un clic del MISMO partner no refresca la
cookie), el modelo que encaja con lo observado es: la cookie solo se reescribe
cuando **cambia** el partner. Son observaciones sueltas, no documentacion
oficial de GetYourGuide, pero es lo que se vio.

### Por que esto importa mas que la duracion de nuestra cookie

El agujero real del negocio no es que la cookie dure 31 dias o 120. Es este:

> El turista escanea el QR en el bar, mira, se va. Dias despues quiere reservar,
> teclea "getyourguide" en Google, pincha el primer resultado —que es el anuncio
> de ellos— y **nos borra**. Esa venta la pierde NoTaxLost y la pierde el bar.

Y pasa constantemente, porque nadie se guarda la web del bar: la gente teclea el
nombre de la marca que recuerda. Contra eso, una cookie mas larga no hace nada
en absoluto: el turista no ha pasado por nuestra web, asi que nuestra cookie ni
se consulta.

Lo unico que lo combate es **acortar la distancia entre el interes y el clic de
salida**, y **tener una forma de traerlo de vuelta por nuestra web** (un enlace
que quiera guardar, el plan por correo con su permiso). Si vuelve por
notaxlost.com antes de comprar, se recupera la atribucion.

### Pendiente de comprobar

Cuando se recupera la atribucion (paso 3), ¿la cookie vuelve a durar 31 dias
desde ese momento, o conserva la fecha que traia? Se mira igual: filtrar por
`IBO5PAK` y leer **Expires / Max-Age**.
