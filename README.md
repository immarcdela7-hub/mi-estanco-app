# 🎟️ CRM · Venta de entradas con QR por establecimiento

CRM para gestionar la red de establecimientos donde nos anunciamos con códigos QR.
Cada establecimiento tiene un **QR único** que lleva a nuestra web de venta de
entradas (partner de **GetYourGuide**). Cuando alguien compra a través de ese QR,
le devolvemos al establecimiento un porcentaje de la comisión que GYG nos paga.

## Cómo ejecutarlo

```bash
pip install -r requirements.txt
streamlit run app.py
```

Primer acceso: usuario `admin`, contraseña `admin1234` (cámbiala en **⚙️ Ajustes**).

## Los dos portales

### 🧑‍💼 Portal de administración (nosotros)

| Sección | Qué hace |
|---|---|
| 📊 Panel | Métricas globales, comisión mensual (nuestra parte vs. establecimientos) y ranking de locales |
| 🏪 Establecimientos | Alta/edición de locales, **QR único descargable**, % de comisión devuelta y creación de accesos al portal |
| 💶 Ventas | Registro manual, **importación CSV** y validación de ventas (validar = GYG nos la ha abonado) |
| 💸 Liquidaciones | Cálculo de lo pendiente por local, generación de pagos y histórico exportable |
| ⚙️ Ajustes | Nombre de marca, URL base de los QR, % por defecto y contraseña |

### 🏪 Portal del establecimiento

Cada local entra con su propio usuario y ve **solo sus datos**: panel con su
comisión, listado de sus ventas, historial de liquidaciones y su QR descargable.

## Flujo de una venta

1. El establecimiento coloca su QR → el cliente escanea y compra en nuestra web
   (el enlace lleva `?ref=CÓDIGO` para atribuir la venta).
2. Registramos la venta en el CRM (manual o CSV) → estado **pendiente**.
3. Cuando GYG nos abona la comisión, la **validamos**.
4. Generamos la **liquidación**: agrupa todo lo validado del local, lo marca como
   **pagada** y queda en el histórico de ambos portales.

## Notas técnicas

- **Stack**: Streamlit + SQLite (`crm_data.db`, se crea sola en el primer arranque).
- La base de datos local es suficiente para empezar; si se despliega en Streamlit
  Cloud, los datos se pierden al redesplegar → cuando el volumen crezca, migraremos
  a una base de datos gestionada (Supabase/Postgres).
- Contraseñas con hash PBKDF2 (200k iteraciones). Los roles son `admin` y `partner`.
- El QR se genera con la librería `qrcode` y añade parámetros UTM
  (`utm_source=qr`, `utm_campaign=CÓDIGO`) para poder medirlo también en analítica web.
