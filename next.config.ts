import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita el badge "Rendering..." del overlay en dev (suele quedarse visible si hay mucho trabajo en cliente).
  devIndicators: false,
};

export default nextConfig;
