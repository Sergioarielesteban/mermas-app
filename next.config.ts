import type { NextConfig } from "next";

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
};

export default nextConfig;
