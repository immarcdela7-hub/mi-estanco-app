import type { NextConfig } from "next";

// Todo el contenido es del propio origen (sin recursos externos): fuentes y
// logo locales, QR y descargas en el mismo dominio. Next inyecta scripts y
// estilos en línea para la hidratación, de ahí 'unsafe-inline'.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Servidor autónomo mínimo para la imagen Docker (server.js).
  output: "standalone",
  experimental: {
    // Las Server Actions vienen capadas a 1 MB, y por ahí no pasa ni un PDF
    // escaneado. El tope real de una factura son 12 MB (`MAX_BYTES` en
    // src/lib/facturas.ts); esto deja sitio para eso más lo que ocupa el
    // propio formulario. nginx tiene su propio límite, `client_max_body_size`.
    serverActions: { bodySizeLimit: "16mb" },
  },
  // Sin optimización on-the-fly: los pocos assets de marca se sirven como
  // estáticos, evitando la dependencia de sharp en el contenedor.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
