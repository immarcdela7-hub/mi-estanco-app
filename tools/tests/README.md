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
se comprueba en las tres baterías.
