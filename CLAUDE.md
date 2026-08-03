# Trabajar en este repositorio

## Al terminar cualquier cambio, dar SIEMPRE el despliegue

No es opcional ni hay que pedirlo. Todo cambio termina con los comandos exactos
para subirlo al VPS, aunque el cambio sea pequeño y aunque sea evidente.

El motivo: aquí el código no vale nada hasta que está en `notaxlost.com`. Un
cambio commiteado y sin desplegar es peor que no haberlo hecho, porque parece
hecho. Y la web y el CRM se despliegan por caminos distintos, así que es fácil
subir uno y olvidar el otro.

El despliegue va **al final de la respuesta**, en un bloque aparte, y dice:

1. **Qué lado toca**: solo CRM, solo web, o los dos. Se mira con
   `git diff --name-only <ultimo-desplegado> HEAD`.
2. **Los comandos**, copiables tal cual, en orden.
3. **Si hay migración de base de datos**, decirlo por su nombre.
4. **Cómo comprobar que funcionó**, en una o dos frases concretas: qué abrir y
   qué se tiene que ver. No «comprueba que va bien».

### Los dos caminos

```bash
# CRM (Next.js en Docker). Las migraciones se aplican solas al arrancar.
cd /opt/ntl-crm && git pull && cd crm-web
docker compose up -d --build

# Web (HTML estático servido por nginx desde /var/www/ntl)
cd /opt/ntl-crm
cp /var/www/ntl/tickets.html /var/www/ntl/tickets.html.bak
cp web/*.js web/*.csv web/tickets.html /var/www/ntl/
chown www-data:www-data /var/www/ntl/*.js /var/www/ntl/*.csv /var/www/ntl/tickets.html
```

`tickets.html` va **siempre** que se toque un `.js` de `web/`: los scripts se
piden con `?v=N` y si no sube ese número el navegador sigue sirviendo el viejo
de caché. Y al tocar un `.js` hay que subir el `?v=N` en `tickets.html`.

El detalle completo está en `crm-web/DEPLOY.md`.

## Otras reglas de la casa

- Rama de trabajo: `claude/crm-ticket-sales-ve5k0t`. No abrir pull requests
  salvo que se pidan.
- Mensajes de commit **en español y sin tildes**, explicando el *por qué* del
  cambio, no el *qué* (el diff ya dice el qué).
- Diseño: claro, azul `rgb(0 43 91)` y verde `rgb(0 200 83)`, acento
  `rgb(0 123 190)`, tipografía Plus Jakarta Sans. **Sin emojis**, en ningún
  sitio.
- Cada actividad nueva del catálogo **se clasifica en horario** (`horario` y
  `franja`). Las herramientas de `tools/` fallan a propósito si falta.
- Antes de dar algo por hecho, probarlo: `tools/tests/` tiene doce baterías y
  las de dinero se comprueban además contra un Postgres real.
