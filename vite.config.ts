import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { stRefPlugin } from './scripts/st-ref.mjs';

// index.html → dist/index.html. 서버는 / 에서 dist/index.html 을 연다 (dist/ 는 저장소에 함께 넣는다)
export default defineConfig({
  // stRefPlugin: STscript 명령이 읽는 이름 붙은 값을 소스에서 뽑아 'virtual:st-ref' 로 넣는다 (등불지기의 스크립트 점검용)
  plugins: [react(), stRefPlugin()],
  base: '/dist/',
  publicDir: false,
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: 'index.html' } },
});
