# Pruebas de la web (navegador real)

Cuatro baterías sobre `web/`, con Playwright. Cubren lo que no se puede ver
leyendo el código: que la **atribución** sobreviva a cada cambio, que los
filtros y las vistas funcionen, y que nada desborde en móvil.

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
```

Cada una imprime `=== N/N pruebas OK ===`. Las capturas van a `tools/capturas/`.

`test-gyg-widgets.mjs` cubre los widgets de GetYourGuide que **inyectamos por
JS** (el de disponibilidad de cada parada y el de ciudad perezoso): que montan
de verdad al inyectarlos, que la URL del iframe lleva `cmp` y `partner_id`, que
no se acumulan widgets de ciudad, y que si GYG está caído o bloqueado salta el
enlace de rescate — también con su atribución.

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
