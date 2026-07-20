# 🌐 Integración con notaxlost.com/tickets

Para que cada venta quede atribuida al establecimiento correcto, la web debe
"reenganchar" el código que trae el QR (`?ref=EST-XXXXX`) a los enlaces de
GetYourGuide como parámetro de campaña (`cmp`). Sin este paso, GYG paga la
comisión igualmente (por el `partner_id`) pero no se puede saber de qué local
vino la venta.

## La cadena completa

1. El cliente escanea el QR del local → `https://notaxlost.com/tickets?ref=EST-XXXXX`.
2. La web guarda el `ref` en una cookie de 30 días y añade `cmp=EST-XXXXX` a
   todos los enlaces hacia GetYourGuide.
3. El cliente reserva en GYG → la reserva queda registrada con vuestra cuenta de
   partner **y** con la campaña `EST-XXXXX`.
4. En el Partner Portal de GYG se descarga el informe de transacciones, que
   incluye la columna de campaña.
5. Ese informe se importa en el CRM (pestaña **💶 Ventas → 📥 Importar CSV**),
   usando la campaña como `codigo_establecimiento`.

## Fragmento para la web

Pegar justo antes de cerrar `</body>` en la página de tickets:

```html
<script>
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
</script>
```

Notas:

- La cookie de 30 días cubre a quien escanea y compra más tarde desde el mismo
  dispositivo (la ventana de atribución de GYG es de ~31 días desde el clic).
- Si los enlaces de GYG se pintan con JavaScript después de cargar la página
  (widgets, carruseles), ejecutar el fragmento después de que existan o usar un
  `MutationObserver`. Los widgets incrustados de GYG llevan la campaña de otra
  forma — consultar antes de tocar.
- El fragmento no interfiere con visitantes sin `ref`: no hace nada.

## Cómo verificar que funciona

1. Abrir `https://notaxlost.com/tickets?ref=PRUEBA1` en una ventana de incógnito.
2. Pasar el ratón (o mantener pulsado en móvil) sobre cualquier enlace de GYG y
   comprobar que la URL contiene `cmp=PRUEBA1`.
3. Navegar a otra página y volver **sin** el `?ref=`: los enlaces deben seguir
   llevando `cmp=PRUEBA1` (cookie).
4. Hacer una reserva de prueba y comprobar en el Partner Portal de GYG que la
   transacción aparece con la campaña `PRUEBA1`.

## Límites conocidos del modelo de afiliación

- Si el cliente escanea con un dispositivo y compra desde otro, la campaña se
  pierde (la venta puede seguir atribuida a NoTaxLost si usa un enlace vuestro).
- Si el cliente va a GYG directamente sin pasar por la web, no hay comisión.
- La atribución de GYG es al último clic dentro de su ventana.
