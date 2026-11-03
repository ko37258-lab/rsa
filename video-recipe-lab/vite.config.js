import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = `http://127.0.0.1:${process.env.PORT || 8787}`; // 서버가 127.0.0.1 에서만 열리므로 IPv6(::1) 로 가지 않게

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // 5173 이 이미 쓰이고 있으면 다른 번호로 몰래 바꾸지 말고 멈춘다 (이미 실행 중이라는 뜻)
    proxy: { '/api': api, '/output': api },
  },
});
