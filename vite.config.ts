import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React 판: next.html → dist/next.html. 아직 옮기지 않은 화면은 /js 의 모듈을 실행 중에 그대로 불러 쓴다
export default defineConfig({
  plugins: [react()],
  base: '/dist/',
  publicDir: false,
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: 'next.html' } },
});
