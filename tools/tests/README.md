# Pruebas de la web (navegador real)

Once baterías sobre `web/` y el motor de reservas del CRM, con Playwright.
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
node tests/test-horarios.mjs              # que nunca se recomiende algo cerrado
node tests/test-distintivos.mjs           # pastillas de las tarjetas y su atribucion
node tests/test-zonas.mjs                 # ?zona= por ciudad y la regla del city
node tests/test-cesta.mjs                 # la cesta de los planes y su memoria
node tests/test-plan-propio.mjs           # reservar un plan entero de una vez
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

`test-horarios.mjs` congela el reloj del navegador y recorre el dia entero. La
regla que vigila es una sola y no admite excepciones: **nada de lo que se
recomienda puede estar cerrado a la hora en que se propone empezar**, ni de
madrugada ni tras seis tiradas de "Surprise me". Y comprueba que el texto y las
tarjetas cuenten lo mismo: decir "esto es lo que haríamos esta noche" y enseñar
un museo es el fallo del que nació esta batería.

`test-disponibilidad.mjs` no abre navegador: compila
`crm-web/src/lib/booking.ts` y prueba el motor que decide qué se ofrece y qué
se acepta. Ahí están los casos que en producción se ven una vez y duelen: el
cambio de hora de octubre, un día que se queda sin plazas suficientes para el
mínimo, y el reparto en céntimos entre nosotros y el establecimiento.

`test-distintivos.mjs` cubre el sistema de pastillas: que ninguna tarjeta lleve
más de una, que todas vayan en la misma posición, que las del top 50 lleven
"TRAVELLERS' FAVOURITE" y el resto no, que la nuestra lleve "NTL EXPERIENCE" en
verde sin perder su pie azul, y que **cada actividad del top 50 salga con su
`cmp`** — las recién añadidas son justo las que más fácil se quedan fuera de la
atribución. Lee el top 50 de `tools/top50.json`, así que si se regenera ese
fichero la prueba se ajusta sola.

`test-cesta.mjs` cubre la cesta de los planes. No cobra —GetYourGuide no deja
pagar tres actividades de una vez—, así que lo que vigila no es un carrito sino
que **el plan no se pierda**: que la cuenta sea correcta, que sobreviva a irse a
GetYourGuide y volver, que el cliente pueda desdecirse, y dos cosas que ya
fallaron una vez: que abrir el mismo plan dos veces no cuente doble (el oyente
se engancha una sola vez) y que marcar una parada no le cierre el calendario de
otra al cliente. Va en su propia batería porque toca `localStorage`.

`test-plan-propio.mjs` cubre lo que con GetYourGuide no se puede hacer:
**reservar varias paradas de una vez**. Vigila que sea de verdad una sola
operación (una petición con `items[]`, no una por parada), que el total y el
localizador único cuadren, que el contador de arriba cuente las dos clases de
parada, y que si el CRM rechaza se diga *cuál* falla sin dar el plan por hecho.
La atomicidad de servidor —que un plan a medias no deje reservas sueltas— vive
en la transacción serializable y se comprueba contra un Postgres real:

```bash
# con el CRM levantado y sembrado con dos actividades propias
curl -s -X POST $CRM/api/publico/reservas -H 'Content-Type: application/json' \
  -H "Origin: $WEB" -d '{"items":[{"slug":"a","fecha":"…","hora":"11:00","personas":2},
  {"slug":"b","fecha":"…","hora":"23:00","personas":2}],"nombre":"X","email":"x@y.z"}'
# -> 409 con la parada que falla, y CERO reservas creadas
```

`test-zonas.mjs` vigila la regla de negocio de la fase 3: que **ninguna actividad
haya cambiado su `city`** para encajar en una zona (lo compara contra el CSV del
commit anterior con `git show`), que `?zona=<ciudad>` deje al menos diez tarjetas
y que las **de** esa ciudad salgan primero, y que `zona=costadaurada` siga
funcionando ahora que el apaño se ha quitado del código y vive en los datos.

**La prueba que nunca debe fallar** es la de atribución: si un cambio deja
enlaces sin `cmp=EST-XXXXX`, las ventas dejan de poder repartirse al
establecimiento y la web *parece* seguir bien. Es un fallo silencioso, por eso
se comprueba en todas las baterías.

## Dos cosas que dan falsos negativos

**Sin salida a `widget.getyourguide.com`**, `test-gyg-widgets.mjs` se queda en
7/15: el script de GYG no carga y todo lo que depende de él cae en cascada. Se
reconoce porque el primer fallo es `El script de GYG carga y expone su API --
GYG.refresh=undefined`; los demás son consecuencia. Las demás baterías sí
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
