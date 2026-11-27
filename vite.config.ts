import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { stRefPlugin } from './scripts/st-ref.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// 메시지 화면 틀(vendor/frame.html)의 판 번호: 틀 주소에 붙여 브라우저가 오래 들고 있게 한다 (틀이 바뀌면 번호도 바뀐다)
const frameV = createHash('sha1').update(readFileSync(new URL('./vendor/frame.html', import.meta.url))).digest('hex').slice(0, 10);

// index.html → dist/index.html. 서버는 / 에서 dist/index.html 을 연다 (dist/ 는 저장소에 함께 넣는다)
export default defineConfig({
  // stRefPlugin: STscript 명령이 읽는 이름 붙은 값을 소스에서 뽑아 'virtual:st-ref' 로 넣는다 (등불지기의 스크립트 점검용)
  plugins: [react(), stRefPlugin()],
  base: '/dist/',
  define: { __FRAME_V__: JSON.stringify(frameV) },
  publicDir: false,
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: 'index.html' } },
});
