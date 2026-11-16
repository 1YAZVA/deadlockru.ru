import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages: NEXT_EXPORT=1 → статический экспорт в .next-export (без API);
  // обычный серверный билд — standalone в .next (как задумано автором)
  output: process.env.NEXT_EXPORT ? "export" : "standalone",
  distDir: process.env.NEXT_EXPORT ? ".next-export" : ".next",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
