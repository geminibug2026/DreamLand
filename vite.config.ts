import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// index.html → dist/index.html. 서버는 / 에서 dist/index.html 을 연다 (dist/ 는 저장소에 함께 넣는다)
export default defineConfig({
  plugins: [react()],
  base: '/dist/',
  publicDir: false,
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: 'index.html' } },
});
