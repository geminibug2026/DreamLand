import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { stRefPlugin } from './scripts/st-ref.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 메시지 화면 틀(vendor/frame.html)의 판 번호: 틀 주소에 붙여 브라우저가 오래 들고 있게 한다 (틀이 바뀌면 번호도 바뀐다)
const frameV = createHash('sha1').update(readFileSync(new URL('./vendor/frame.html', import.meta.url))).digest('hex').slice(0, 10);

// 켤 때 반드시 읽는 코드(시작 파일에서 정적 import 로 닿는 모듈 전부)는 한 파일로 묶는다 — 수십 개 조각으로 나뉘어 있으면 휴대폰에서 조각마다 받기 · 준비하는 데 시간이 든다.
// 처음 열 때 받는 화면 · 기능(동적 import)은 지금처럼 따로 둔다
type Ctx = { getModuleInfo(id: string): { importedIds: readonly string[]; isEntry: boolean } | null };
let boot: Set<string> | null = null;
function bootGroup(id: string, ctx: Ctx): string | null {
  if (!boot) {
    boot = new Set(); const main = [...MAIN].find(m => ctx.getModuleInfo(m)); const stack = main ? [main] : [];
    while (stack.length) { const m = stack.pop()!; if (boot.has(m)) continue; boot.add(m); for (const d of ctx.getModuleInfo(m)?.importedIds || []) stack.push(d); }
    if (main) boot.delete(main);
  }
  return boot.has(id) ? 'boot' : null;
}
const MAIN = new Set([fileURLToPath(new URL('./src/main.tsx', import.meta.url))]);

// index.html → dist/index.html. 서버는 / 에서 dist/index.html 을 연다 (dist/ 는 저장소에 함께 넣는다)
export default defineConfig({
  // stRefPlugin: STscript 명령이 읽는 이름 붙은 값을 소스에서 뽑아 'virtual:st-ref' 로 넣는다 (등불지기의 스크립트 점검용)
  plugins: [react(), stRefPlugin(), { name: 'boot-chunk', buildStart() { boot = null; } }],   // 다시 빌드할 때(watch) 묶음을 새로 센다
  base: '/dist/',
  define: { __FRAME_V__: JSON.stringify(frameV) },
  publicDir: false,
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: 'index.html', output: { codeSplitting: { groups: [{ name: bootGroup }] } } } },
});
