# Atribución de QR en la web (notaxlost.com)

Cómo está instalada la atribución que conecta los QR de los establecimientos con
las reservas de GetYourGuide. **La web NO es WordPress**: es un sitio de HTML
estático servido por nginx desde `/var/www/ntl` en el VPS. Por eso la atribución
no se instala con un plugin, sino con un pequeño archivo JavaScript incluido en
la página de tickets.

## Qué hace

Cuando alguien llega desde un QR (`https://notaxlost.com/tickets?ref=EST-XXXXX`):

1. Guarda ese `ref` en una cookie `ntl_ref` de 30 días.
2. Añade `cmp=EST-XXXXX` a todos los enlaces hacia GetYourGuide, **sin tocar el
   `partner_id`** que ya llevan.

Así cada reserva queda atribuida a la cuenta de partner de NoTaxLost
(`partner_id`) y, dentro de ella, al establecimiento concreto (`cmp`), que es la
columna de campaña que aparece en el Partner Portal de GYG.

## Cómo está instalada (estado actual)

- **Archivo JS:** `/var/www/ntl/ntl-attrib.js`
- **Incluido en:** `/var/www/ntl/tickets.html`, con esta línea justo antes de
  `</body>`:
  ```html
  <script src="/ntl-attrib.js"></script>
  ```
- **Por qué solo en `tickets.html`:** es la única página con enlaces a
  GetYourGuide y es donde aterriza el QR (`base_url` del CRM = `.../tickets`).
- nginx sirve `/ntl-attrib.js` como `application/javascript` (HTTP 200).
- No hace falta reiniciar nginx al cambiar archivos estáticos.

## Contenido de `/var/www/ntl/ntl-attrib.js`

```js
/* NoTaxLost: atribución de QR.
   Guarda ?ref= en una cookie de 30 días y añade cmp=<ref>
   a todos los enlaces de GetYourGuide (sin tocar partner_id). */
(function () {
  var ref = new URLSearchParams(location.search).get("ref");
  if (ref) {
    document.cookie = "ntl_ref=" + encodeURIComponent(ref) +
      "; max-age=" + 30 * 24 * 3600 + "; path=/";
  } else {
    var m = document.cookie.match(/(?:^|; )ntl_ref=([^;]*)/);
    if (m) ref = decodeURIComponent(m[1]);
  }
  if (!ref) return;
  document.querySelectorAll('a[href*="getyourguide."]').forEach(function (a) {
    try {
      var u = new URL(a.href);
      u.searchParams.set("cmp", ref);
      a.href = u.toString();
    } catch (e) {}
  });
})();
```

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
- **Una venta con `Campaign` vacío no se puede repartir.** Es dinero nuestro,
  pero sin saber de qué QR viene. Comprobado con la primera venta real (Prado,
  29/07/2026): salió sin campaña. Lo que hay que descartar antes de dar por
  buena la atribución:
  1. que se entrara a `notaxlost.com/tickets` **sin** `?ref=` (lo más probable
     y lo esperable: entonces no hay fallo que arreglar);
  2. que el `cmp` no sobreviva a navegar **dentro** de GetYourGuide hasta otra
     actividad distinta de la que se pinchó. El `partner_id` sí sobrevive —esa
     venta se nos pagó—, pero eso no prueba que el `cmp` lo haga.

  Se distingue con una compra de prueba: entrar con `?ref=`, pinchar una
  actividad **del catálogo** y comprar esa misma. Si sale con campaña, el
  sistema está bien y lo de antes fue el caso 1.
- Si el cliente escanea en un móvil pero compra en otro dispositivo, la campaña
  se pierde (límite del modelo de afiliación de GYG).
- El script actúa sobre los `<a href>` presentes al cargar la página. Si algún
  día los enlaces de GYG pasan a generarse por JavaScript o mediante widgets
  incrustados, habría que adaptar el fragmento.
