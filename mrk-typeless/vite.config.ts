import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// 두 가지 빌드를 만듭니다.
// - 기본(`vite build`): 어디서나 여는 독립 웹앱. React와 Claude SDK를 함께 묶습니다.
// - artifact(`vite build --mode artifact`): claude.ai 아티팩트용 한 장짜리 페이지.
//   React는 cdnjs에서 불러오고, API 키 엔진은 빼고(아티팩트에서는 외부 요청이 막혀 있음)
//   내 Claude 계정(sample 기능)으로 정리합니다.
export default defineConfig(({ mode }) => {
  const artifact = mode === "artifact";
  return {
    base: "./",
    plugins: [react()],
    define: { __ARTIFACT__: JSON.stringify(artifact) },
    resolve: artifact
      ? {
          alias: {
            "react/jsx-runtime": fileURLToPath(new URL("./src/artifact/jsx-runtime.ts", import.meta.url)),
          },
        }
      : undefined,
    build: artifact
      ? {
          outDir: "dist-artifact",
          cssCodeSplit: false,
          modulePreload: false,
          rollupOptions: {
            external: ["react", "react-dom", "react-dom/client"],
            output: {
              format: "iife",
              globals: { react: "React", "react-dom": "ReactDOM", "react-dom/client": "ReactDOM" },
              entryFileNames: "app.js",
              assetFileNames: "app.[ext]",
            },
          },
        }
      : {
          outDir: "dist",
          // 웹앱(index.html)과 PC 프로그램 내려받기 페이지(download.html) 두 장을 만듭니다.
          rollupOptions: {
            input: {
              main: fileURLToPath(new URL("./index.html", import.meta.url)),
              download: fileURLToPath(new URL("./download.html", import.meta.url)),
            },
          },
        },
    test: { environment: "node" },
  };
});
