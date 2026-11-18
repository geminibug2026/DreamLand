// 웹 버전(서버 없이 도는 것)에 필요한 파일을 web/ 에 채운다.  사용: npm run build:web
// vite 가 web/index.html · web/assets 를 만든 뒤, 서버가 직접 내주던 폴더들을 옆에 복사한다.
// 아이폰 앱(ios-app/)도 이 web/ 폴더를 그대로 담는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'web');
if (!fs.existsSync(path.join(out, 'index.html'))) { console.error('web/index.html 이 없습니다 — vite build 가 먼저 돌아야 합니다.'); process.exit(1); }

for (const dir of ['css', 'vendor', 'sounds', 'extensions']) {
  if (fs.existsSync(path.join(root, dir))) fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
}

// 서버의 /api/extensions 가 하던 일: 함께 넣은 확장의 목록
const list = [];
const extDir = path.join(root, 'extensions');
if (fs.existsSync(extDir)) for (const d of fs.readdirSync(extDir, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(extDir, d.name, 'manifest.json'), 'utf8'));
    const main = m.main || 'index.js';
    const base = 'extensions/' + encodeURIComponent(d.name) + '/';
    const v = Math.round(fs.statSync(path.join(extDir, d.name, main)).size);
    list.push({ id: String(m.id || d.name), name: m.name || d.name, version: m.version || '', author: m.author || '', description: m.description || '', entry: base + main + '?v=' + (m.version || v), css: m.css ? base + m.css : '' });
  } catch { /* manifest 가 없거나 깨진 폴더는 건너뛴다 */ }
}
fs.writeFileSync(path.join(out, 'extensions', 'index.json'), JSON.stringify(list, null, 1));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`web/ 준비 끝 (확장 ${list.length}개)`);
