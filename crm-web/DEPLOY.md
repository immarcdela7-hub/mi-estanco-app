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
correspondientes. Deja `APP_PORT=8090`. Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

---

## 5. Arrancar el CRM

```bash
docker compose up -d --build
```

La primera vez tarda unos minutos (construye la imagen). Comprueba que arranca y
que aplica las migraciones solo:

```bash
docker compose logs -f app     # espera "Migraciones aplicadas. Arrancando el servidor."  (Ctrl+C para salir)
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

Entra con `admin` / `admin1234`. La aplicación te obligará a crear tu contraseña
definitiva. Después, en **Ajustes**, confirma que la URL de la web es
`https://notaxlost.com/tickets`.

---

## 8. Activar la atribución en el WordPress

Pega el contenido de `deploy/wordpress-snippet.html` justo antes de `</body>` en
el `footer.php` del tema activo (o con un plugin de "insertar en el footer").
Verifícalo abriendo `https://notaxlost.com/tickets?ref=PRUEBA1` en incógnito y
comprobando que los enlaces de GetYourGuide llevan `cmp=PRUEBA1`.

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
