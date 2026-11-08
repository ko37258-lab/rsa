import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 단일 서버/도커 배포용 독립 실행 번들 (.next/standalone)
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // 로컬 개발용 내장 Postgres(WASM 파일 포함)는 번들에서 제외
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
