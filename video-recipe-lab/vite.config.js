import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = `http://127.0.0.1:${process.env.PORT || 8787}`; // 서버가 127.0.0.1 에서만 열리므로 IPv6(::1) 로 가지 않게

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': api, '/output': api },
  },
});
