import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

/** Raíz real del repo (evita que Turbopack use otro lockfile, p. ej. en el directorio home). */
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/**" }],
  },
  // Evita el badge "Rendering..." del overlay en dev (suele quedarse visible si hay mucho trabajo en cliente).
  devIndicators: false,
  // Evita errores EMFILE en desarrollo usando sondeo en lugar de demasiados file watchers nativos.
  watchOptions: {
    pollIntervalMs: 1000,
  },
  turbopack: {
    root: turbopackRoot,
  },
};

export default nextConfig;
