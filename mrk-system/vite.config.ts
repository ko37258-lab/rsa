import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" → 빌드 결과를 어느 경로(정적 호스팅, 아티팩트 미리보기)에 올려도 동작
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": "/src" } },
  server: { port: 5173, host: true },
});
