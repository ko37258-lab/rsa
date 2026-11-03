// 웹판(ko372.com/mrk-vr/app/) 빌드 — 서버 없이 브라우저만으로 돈다. npm run build:web → dist-web/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';

export default defineConfig({
  base: '/mrk-vr/app/',
  plugins: [
    react(),
    {
      name: 'web-entry-to-index',
      closeBundle() {
        copyFileSync('dist-web/web/index.html', 'dist-web/index.html');
      },
    },
  ],
  define: { 'import.meta.env.VITE_WEB': JSON.stringify('1') },
  build: { outDir: 'dist-web', emptyOutDir: true, rollupOptions: { input: 'web/index.html' } },
});
