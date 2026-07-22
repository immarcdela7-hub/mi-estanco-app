# NoTaxLost CRM

CRM para gestionar la red de establecimientos donde NoTaxLost se anuncia con
códigos QR. Cada establecimiento tiene un QR único que lleva a la web de venta
de entradas (partner de GetYourGuide); cuando alguien compra a través de ese QR,
se le devuelve al establecimiento un porcentaje de la comisión que GYG paga.

La aplicación está en **[`crm-web/`](crm-web/)** (Next.js + Postgres). Incluye:

- **Portal de administración**: panel con métricas, alta de establecimientos con
  QR descargable, registro/importación y validación de ventas, liquidaciones,
  pool de códigos QR con generación de carteles A6 e integración web.
- **Portal del establecimiento**: sus ventas, comisiones, liquidaciones y su QR.

## Puesta en marcha

- **Desarrollo local**: ver [`crm-web/`](crm-web/) (`npm install`, Postgres,
  `npm run dev`).
- **Despliegue en producción** (Docker + Postgres + copias de seguridad):
  seguir la guía [`crm-web/DEPLOY.md`](crm-web/DEPLOY.md).

## Historial

La primera versión fue un prototipo en Streamlit; se sustituyó por la aplicación
Next.js de `crm-web/`, que es la que se despliega. El prototipo permanece en el
historial de Git.
