// 번역 점검: 코드가 쓰는 키가 언어 파일에 다 있는지, 언어끼리 빠진 키 · {자리} 가 맞는지
// 사용: npm run i18n:check   (문제가 있으면 1 로 끝난다)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const dir = path.join(root, 'src', 'i18n');
const load = code => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'locales', `${code}.json`), 'utf8'));
  const parts = path.join(dir, 'parts');
  if (fs.existsSync(parts)) for (const f of fs.readdirSync(parts)) if (f.endsWith(`.${code}.json`)) Object.assign(d, JSON.parse(fs.readFileSync(path.join(parts, f), 'utf8')));
  return d;
};
const codes = fs.readdirSync(path.join(dir, 'locales')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
const dicts = Object.fromEntries(codes.map(c => [c, load(c)]));
const ko = dicts.ko;

// 코드에서 t('…') · tn('…') 로 부르는 키
const used = new Map();
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'i18n') walk(p); } else if (/\.(tsx?|mjs)$/.test(e.name)) scan(p); } };
const scan = p => {
  const src = fs.readFileSync(p, 'utf8');
  for (const m of src.matchAll(/\b(tn?|tr)\(\s*'([\w.-]+)'/g)) { const k = m[2]; if (!used.has(k)) used.set(k, { file: path.relative(root, p), plural: m[1] === 'tn' }); }
};
walk(path.join(root, 'src'));

const problems = [];
const exists = (d, k, plural) => plural ? (`${k}.other` in d || k in d) : k in d;
// 'lore.pos.' + v 처럼 앞부분만 적힌 키는 그 앞부분으로 시작하는 키가 하나라도 있으면 된다
const prefixed = k => Object.keys(ko).some(x => x.startsWith(k));
for (const [k, { file, plural }] of used) if (k.endsWith('.') ? !prefixed(k) : !exists(ko, k, plural)) problems.push(`ko 에 없는 키: ${k}  (${file})`);
// 언어마다 일부러 다른 자리를 쓰는 키 (호출하는 쪽이 모든 자리를 넘긴다)
const SLOT_OK = new Set(['bind.yearMonth']);
const slots = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
for (const c of codes) {
  if (c === 'ko') continue;
  const d = dicts[c];
  for (const k of Object.keys(ko)) {
    if (!(k in d)) { problems.push(`${c} 에 없는 키: ${k}`); continue; }
    if (k.endsWith('.one') || k.endsWith('.other')) continue;
    if (slots(ko[k]) !== slots(d[k]) && !SLOT_OK.has(k)) problems.push(`${c} 의 {자리} 가 다름: ${k}  ko=${slots(ko[k])} ${c}=${slots(d[k])}`);
  }
  // 단수형(.one 등)은 그 언어에만 있어도 된다
  for (const k of Object.keys(d)) if (!(k in ko) && !/\.(zero|one|two|few|many)$/.test(k)) problems.push(`${c} 에만 있는 키: ${k}`);
}
const unused = Object.keys(ko).filter(k => !used.has(k) && !used.has(k.replace(/\.(zero|one|two|few|many|other)$/, '')));

console.log(`언어 ${codes.join(' · ')}, 키 ${Object.keys(ko).length}개, 코드에서 쓰는 키 ${used.size}개`);
if (unused.length) console.log(`(코드에서 이름으로 찾지 못한 키 ${unused.length}개 — 동적으로 만드는 키일 수 있음)`);
if (problems.length) { console.log(problems.join('\n')); console.log(`문제 ${problems.length}개`); process.exit(1); }
console.log('문제 없음');
