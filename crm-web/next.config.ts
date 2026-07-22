import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Servidor autónomo mínimo para la imagen Docker (server.js).
  output: "standalone",
  // Sin optimización on-the-fly: los pocos assets de marca se sirven como
  // estáticos, evitando la dependencia de sharp en el contenedor.
  images: { unoptimized: true },
};

export default nextConfig;
