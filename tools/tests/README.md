# Pruebas de la web (navegador real)

Seis baterías sobre `web/` y el motor de reservas del CRM, con Playwright.
Cubren lo que no se puede ver leyendo el código: que la **atribución**
sobreviva a cada cambio, que los filtros y las vistas funcionen, que se pueda
reservar de principio a fin sin salir de la web, y que nada desborde en móvil.

```bash
# servir la web en el 8099 (MULTIHILO: el http.server normal se satura con los
# iframes de GetYourGuide y da falsos negativos)
cd web && python3 -c "from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer; ThreadingHTTPServer(('127.0.0.1',8099), SimpleHTTPRequestHandler).serve_forever()" &
cd tools && npm install                   # una vez (Playwright)
npx playwright install chromium           # una vez (el navegador)
node tests/test-web.mjs                   # catálogo, filtros, widget de ciudad
node tests/test-picks.mjs                 # recomendador "We do" + zonas del QR
node tests/test-plans.mjs                 # planes, detalle y disponibilidad
node tests/test-gyg-widgets.mjs           # widgets de GYG inyectados por JS
node tests/test-reservas.mjs              # reserva propia, de punta a punta
node tests/test-disponibilidad.mjs        # motor de cupo del CRM (sin navegador)
```

Cada una imprime `=== N/N pruebas OK ===`. Las capturas van a `tools/capturas/`.

`test-gyg-widgets.mjs` cubre los widgets de GetYourGuide que **inyectamos por
JS** (el de disponibilidad de cada parada y el de ciudad perezoso): que montan
de verdad al inyectarlos, que la URL del iframe lleva `cmp` y `partner_id`, que
no se acumulan widgets de ciudad, y que si GYG está caído o bloqueado salta el
enlace de rescate — también con su atribución.

`test-reservas.mjs` es la que demuestra lo que con GetYourGuide no se puede
hacer: elegir día, hora y personas, ver el total y confirmar **sin salir de
notaxlost.com**. El CRM se simula con `page.route`, así que no hace falta ni
base de datos ni red. Comprueba además tres cosas que son de negocio, no de
pantalla: que la reserva viaja con el código del QR (si no, la venta no se
puede repartir), que el precio lo pone el CRM y no el navegador, y que si el
CRM se cae el catálogo de GetYourGuide sigue entero y con su atribución.

`test-disponibilidad.mjs` no abre navegador: compila
`crm-web/src/lib/booking.ts` y prueba el motor que decide qué se ofrece y qué
se acepta. Ahí están los casos que en producción se ven una vez y duelen: el
cambio de hora de octubre, un día que se queda sin plazas suficientes para el
mínimo, y el reparto en céntimos entre nosotros y el establecimiento.

**La prueba que nunca debe fallar** es la de atribución: si un cambio deja
enlaces sin `cmp=EST-XXXXX`, las ventas dejan de poder repartirse al
establecimiento y la web *parece* seguir bien. Es un fallo silencioso, por eso
se comprueba en las cuatro baterías.

## Dos cosas que dan falsos negativos

**Sin salida a `widget.getyourguide.com`**, `test-gyg-widgets.mjs` se queda en
7/15: el script de GYG no carga y todo lo que depende de él cae en cascada. Se
reconoce porque el primer fallo es `El script de GYG carga y expone su API --
GYG.refresh=undefined`; los demás son consecuencia. Las otras tres baterías sí
pasan enteras sin red. Si necesitas verificar los widgets, hazlo desde una
máquina con internet abierto.

**Con un servidor de un solo hilo** (`python3 -m http.server`) aparecen fallos
fantasma que parecen bugs de producto: 0 tarjetas en móvil, o el widget de
ciudad equivocado. No lo son: es el servidor saturado por los iframes. Usa
siempre el multihilo del comando de arriba.

## Al escribir pruebas nuevas

- `[data-province="…"]` casa **con 60 elementos** (el botón y las 59 tarjetas de
  esa provincia). Para el botón usa `button.province-btn[data-province="…"]`.
- `window.ntlPlansReset()` vuelve del detalle a la lista de planes, **no** al
  catálogo. Al catálogo se vuelve con la flecha de la cabecera (`#hdBack`).
- Las tarjetas de actividades propias llegan **después** del render inicial
  (vienen del CRM por `fetch`). Espera a `.experience-item.ntl-own` antes de
  contar tarjetas, o contarás 101 en vez de 102.
- Al simular el CRM con `page.route`, la respuesta necesita
  `access-control-allow-origin`: sin esa cabecera el navegador bloquea el
  `fetch` igual que en producción y la prueba falla por CORS, no por el código.
