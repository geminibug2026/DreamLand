// 중계 코드의 사본이 원본(vercel/lib/openai.js)과 같은지 확인한다. --fix 면 다시 만든다
// Cloudflare 판은 배포 버튼이 그 폴더만 가져가고, Supabase 판은 편집기에 파일 하나를 붙여 넣으므로 사본을 둔다
import fs from 'node:fs';
const at = p => new URL(p, import.meta.url), src = fs.readFileSync(at('./vercel/lib/openai.js'), 'utf8');
const want = { './cloudflare/src/openai.js': src, './supabase/index.ts': '// @ts-nocheck\n' + src + fs.readFileSync(at('./supabase/entry.js'), 'utf8') };
let bad = 0;
for (const [p, text] of Object.entries(want)) {
  const now = fs.existsSync(at(p)) ? fs.readFileSync(at(p), 'utf8') : null; if (now === text) continue;
  if (process.argv.includes('--fix')) { fs.writeFileSync(at(p), text); console.log('맞춤: ' + p); } else { console.error('다름: ' + p + ' — node relay/check-copies.mjs --fix'); bad++; }
}
if (bad) process.exit(1); else if (!process.argv.includes('--fix')) console.log('사본이 모두 같아요');
