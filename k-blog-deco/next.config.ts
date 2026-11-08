import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 단일 서버/도커 배포용 독립 실행 번들 (.next/standalone)
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // libsql ships native bindings; keep it out of the server bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
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
