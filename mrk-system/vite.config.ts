import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" → 빌드 결과를 어느 경로(정적 호스팅, 아티팩트 미리보기)에 올려도 동작
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": "/src" } },
  server: { port: 5173, host: true },
  // 전체 앱이 한 덩어리여도 gzip 200KB 수준이라 경고 기준만 올린다
  build: { chunkSizeWarningLimit: 800 },
});
