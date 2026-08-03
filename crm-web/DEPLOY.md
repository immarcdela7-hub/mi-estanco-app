# Despliegue del CRM en el VPS de Hostinger

Guía paso a paso para publicar el CRM en `crm.notaxlost.com` sobre tu VPS
(Ubuntu 24.04). El CRM corre en Docker (app + Postgres + copias de seguridad) y
no toca tu WordPress: se sirve en un puerto local y tu servidor web actual hace
de proxy hacia él.

Todos los comandos se ejecutan en la **terminal del VPS** (botón *Terminal* en el
panel de Hostinger, o `ssh root@72.62.16.253`).

---

## 1. Apuntar el subdominio (panel de Hostinger, no terminal)

En Hostinger → tu dominio `notaxlost.com` → **DNS / Nameservers**, crea un
registro:

| Tipo | Nombre | Apunta a       | TTL   |
|------|--------|----------------|-------|
| A    | `crm`  | `72.62.16.253` | 14400 |

Espera unos minutos a que propague. Comprueba desde la terminal:

```bash
dig +short crm.notaxlost.com   # debe devolver 72.62.16.253
```

---

## 2. Instalar Docker (si no está)

```bash
docker --version || (curl -fsSL https://get.docker.com | sh)
docker compose version
```

---

## 3. Descargar el CRM

Clona el repositorio en `/opt/ntl-crm`. Si el repo es privado, cuando pida
contraseña pega un **token de acceso personal** de GitHub (Settings → Developer
settings → Personal access tokens), no tu contraseña.

```bash
cd /opt
git clone https://github.com/immarcdela7-hub/mi-estanco-app.git ntl-crm
cd ntl-crm
git checkout claude/crm-ticket-sales-ve5k0t
cd crm-web
```

---

## 4. Configurar los secretos

```bash
cp .env.production.example .env
# Genera dos secretos aleatorios:
echo "POSTGRES_PASSWORD=$(openssl rand -base64 30 | tr -d '/+=')"
echo "AUTH_SECRET=$(openssl rand -base64 48 | tr -d '/+=')"
```

Abre `.env` con `nano .env` y pega esos dos valores en las líneas
correspondientes. Deja `APP_PORT=8090`. Opcional: pon una `INITIAL_ADMIN_PASSWORD`
(mínimo 8 caracteres); si la dejas vacía, la app generará una aleatoria y la
mostrará en los logs al arrancar. Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

> `AUTH_SECRET` es obligatorio y debe tener 32+ caracteres: la app no arranca si
> falta o es corto.

---

## 5. Arrancar el CRM

```bash
docker compose up -d --build
```

La primera vez tarda unos minutos (construye la imagen). Comprueba que arranca y
que aplica las migraciones solo:

```bash
# El servicio "migrate" aplica las migraciones y termina; luego arranca "app".
docker compose logs migrate    # debe mostrar "All migrations have been successfully applied."
docker compose logs -f app     # espera "Ready" de Next.js  (Ctrl+C para salir)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8090/login   # debe dar 200
```

---

## 6. Publicarlo en crm.notaxlost.com (proxy inverso + SSL)

Detecta qué servidor web sirve tu WordPress:

```bash
systemctl is-active nginx apache2 2>/dev/null
```

### Si es **nginx** (`nginx` = active)

```bash
cp deploy/nginx-crm.conf /etc/nginx/sites-available/crm.notaxlost.com
ln -sf /etc/nginx/sites-available/crm.notaxlost.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
# Certificado HTTPS gratuito (Let's Encrypt):
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d crm.notaxlost.com --redirect --agree-tos -m TU_EMAIL --non-interactive
```

### Si es **apache2** (`apache2` = active)

```bash
a2enmod proxy proxy_http headers
cp deploy/apache-crm.conf /etc/apache2/sites-available/crm.notaxlost.com.conf
a2ensite crm.notaxlost.com.conf
apache2ctl configtest && systemctl reload apache2
# Certificado HTTPS gratuito (Let's Encrypt):
apt-get install -y certbot python3-certbot-apache
certbot --apache -d crm.notaxlost.com --redirect --agree-tos -m TU_EMAIL --non-interactive
```

Certbot renueva el certificado automáticamente. Al terminar, abre
`https://crm.notaxlost.com` en el navegador.

---

## 7. Primer acceso

El usuario es `admin`. La contraseña inicial es la que pusiste en
`INITIAL_ADMIN_PASSWORD`; si la dejaste vacía, obtenla de los logs:

```bash
docker compose logs app | grep -A2 "Contraseña inicial"
```

Entra con esas credenciales: la aplicación te obligará a crear tu contraseña
definitiva. Hazlo **cuanto antes**, idealmente antes de difundir la URL. Después,
en **Ajustes**, confirma que la URL de la web es `https://notaxlost.com/tickets`.

---

## 8. Activar la atribución en la web

La web `notaxlost.com` es HTML estático (servido por nginx desde `/var/www/ntl`),
no WordPress. La atribución se instala con el archivo `ntl-attrib.js` incluido
antes de `</body>` en `tickets.html`. El procedimiento completo, la reinstalación
y la verificación están en **`deploy/atribucion-web.md`**.

Verificación rápida: abre `https://notaxlost.com/tickets?ref=PRUEBA1` en incógnito
y comprueba que los enlaces de GetYourGuide conservan `partner_id=...` y llevan
`cmp=PRUEBA1`.

## 9. Actividades propias (reserva dentro de notaxlost.com)

Las de GetYourGuide se reservan siempre en su web. Las **nuestras** no: el
cliente elige día y hora y confirma sin salir de `notaxlost.com`. Para que
funcione hacen falta dos piezas, una a cada lado.

**En el CRM** no hay que configurar nada: al actualizar, la migración crea las
tablas y aparecen los menús *Actividades propias* y *Reservas*. Crea una
actividad y quedará publicada al momento.

Los formatos de cartel viven en `src/lib/flyer.ts` (`FORMATOS`): cada uno con
su plantilla en `public/` y las coordenadas del hueco del QR **medidas sobre el
PDF original**, en milímetros y con el origen abajo a la izquierda. Una
plantilla puede tener varias caras: la tarjeta de mesa a dos caras son dos
páginas, y el PDF sale con las dos seguidas, que es como la quiere la imprenta.
Si rehaces un diseño, vuelve a medir: las coordenadas no se deducen solas.

**En la web** hace falta subir dos archivos: el módulo nuevo y la página que lo
carga. Se copian sueltos a propósito — un `rsync --delete` sobre `/var/www/ntl`
borraría cualquier cosa que esté en el servidor y no en el repositorio.

```bash
cd /opt/ntl-crm && git pull
cp /var/www/ntl/tickets.html /var/www/ntl/tickets.html.bak   # por si acaso
cp web/own.js web/tickets.html /var/www/ntl/
chown www-data:www-data /var/www/ntl/own.js /var/www/ntl/tickets.html
```

La web llama a tres rutas públicas del CRM (`/api/publico/actividades`,
`/api/publico/disponibilidad` y `/api/publico/reservas`). Son las únicas sin
sesión, así que están limitadas por IP en la app **y** en nginx; el POST de
reserva solo se acepta desde el origen de la web. Si sirves la web desde otro
dominio (pruebas, staging), añádelo en el `.env`:

```bash
PUBLIC_WEB_ORIGINS=https://staging.notaxlost.com
```

y decláralo en `docker-compose.yml` dentro de `app.environment`. Si usas nginx,
copia otra vez `deploy/nginx-crm.conf`: trae el bloque nuevo de `/api/publico/`.

Comprobación rápida, desde cualquier sitio:

```bash
curl -s https://crm.notaxlost.com/api/publico/actividades | head -c 200
```

Debe responder un JSON con `actividades` (vacío si aún no has creado ninguna).

---

## Mantenimiento

### Actualizar el CRM cuando haya cambios

```bash
cd /opt/ntl-crm && git pull && cd crm-web
docker compose up -d --build
```

### Copias de seguridad

Se hacen **solas cada día** en `crm-web/backups/` (se conservan 14 días). Para
una copia manual inmediata:

```bash
docker compose exec -T db pg_dump -U crm --no-owner crm | gzip > backups/manual_$(date +%F).sql.gz
```

### Restaurar una copia

```bash
gunzip -c backups/NOMBRE.sql.gz | docker compose exec -T db psql -U crm -d crm
```

### Ver estado / logs

```bash
docker compose ps
docker compose logs -f app
```

---

## Notas

- La app solo escucha en `127.0.0.1:8090`: no es accesible desde fuera salvo a
  través del proxy con HTTPS. Postgres nunca se expone al exterior.
- Los datos viven en un volumen Docker (`db_data`) y en `backups/`, así que
  sobreviven a reinicios y reconstrucciones de la imagen.
- Si algún día quieres mover el CRM a otro servidor, copia la carpeta y el último
  backup: es autocontenido.
