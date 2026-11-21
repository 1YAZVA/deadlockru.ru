import type { NextConfig } from "next";

/**
 * Два режима сборки:
 *  - по умолчанию — серверный standalone (VPS/локальный запуск с API-роутами);
 *  - BUILD_STATIC=1 — статический экспорт для GitHub Pages (output: "export").
 *    В статике API-роуты исключаются из сборки (в Actions: rm -rf src/app/api),
 *    данные берутся из public/api/*.json, картинки — из /img-mirror.
 */
const isStaticExport = process.env.BUILD_STATIC === "1";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  /* GitHub Pages отдаёт /heroes/abrams/ как directory index, а не /heroes/abrams.
     trailingSlash гарантирует, что экспорт создаёт <slug>/index.html и ссылки
     ведут на рабочие адреса. */
  trailingSlash: isStaticExport,
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
