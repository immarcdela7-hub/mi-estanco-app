# Pruebas de la web (navegador real)

Tres baterías sobre `web/`, con Playwright. Cubren lo que no se puede ver
leyendo el código: que la **atribución** sobreviva a cada cambio, que los
filtros y las vistas funcionen, y que nada desborde en móvil.

```bash
cd web && python3 -m http.server 8099 &   # servir la web en el 8099
cd tools && npm install                   # una vez (Playwright)
node tests/test-web.mjs                   # catálogo, filtros, widget de ciudad
node tests/test-picks.mjs                 # recomendador "We do" + zonas del QR
node tests/test-plans.mjs                 # planes, detalle y disponibilidad
```

Cada una imprime `=== N/N pruebas OK ===`. Las capturas van a `tools/capturas/`.

**La prueba que nunca debe fallar** es la de atribución: si un cambio deja
enlaces sin `cmp=EST-XXXXX`, las ventas dejan de poder repartirse al
establecimiento y la web *parece* seguir bien. Es un fallo silencioso, por eso
se comprueba en las tres baterías.
