// STscript 명령이 읽는 이름 붙은 값(key= · index= …)을 명령 소스에서 직접 뽑는다. 손으로 적은 목록은 낡기 때문이다.
// 빌드할 때 vite 플러그인이 이 결과를 'virtual:st-ref' 로 넣는다 (등불지기의 스크립트 점검 · 명령 찾기가 쓴다).
// 결과: { 패턴: { named: [이름…], open?: true } } — 패턴은 명령 이름 그대로이거나, 이름을 만드는 틀(`set${p}var`)을 바꾼 /정규식/
//   open: 이름 붙은 값을 통째로 넘기는 명령(/run 처럼) — 무엇이든 받는다
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
export const ST_FILES = ['src/stscript/commands.ts', ...['chat', 'misc', 'people', 'prompt', 'world', 'lalib', 'lalib-app'].map(n => `src/stscript/ext/${n}.tsx`)];

/** from 자리의 여는 괄호에서 짝이 맞는 닫는 괄호까지 (글자 · 틀 글자 · 주석 · 정규식은 건너뛴다). 못 찾으면 -1 */
function close(s, from) {
  const open = s[from], shut = { '(': ')', '{': '}', '[': ']' }[open]; let depth = 0;
  for (let i = from; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'" || ch === '`') { i = skipStr(s, i); continue; }
    if (ch === '/' && s[i + 1] === '/') { i = s.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (ch === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i + 2) + 1; if (i <= 0) return -1; continue; }
    if (ch === '/' && /[(,=:[!&|?{};+\-*%<>~^]\s*$|\breturn\s*$|^\s*$/.test(s.slice(Math.max(0, i - 12), i))) { i = skipRegex(s, i); continue; }
    if (ch === open) depth++; else if (ch === shut && !--depth) return i;
  }
  return -1;
}
function skipStr(s, i) {
  const q = s[i];
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (q === '`' && s[j] === '$' && s[j + 1] === '{') { j = close(s, j + 1); if (j < 0) return s.length; continue; }
    if (s[j] === q) return j;
  }
  return s.length;
}
function skipRegex(s, i) {
  let cls = false;
  for (let j = i + 1; j < s.length; j++) { const ch = s[j]; if (ch === '\\') { j++; continue; } if (ch === '\n') return i; if (cls) { if (ch === ']') cls = false; continue; } if (ch === '[') cls = true; else if (ch === '/') { while (/[a-z]/.test(s[j + 1] || '')) j++; return j; } }
  return i;
}
const lits = s => [...s.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"/g)].map(m => m[1] ?? m[2]);
/** def( 의 첫 인자 글 → 명령 이름 패턴들 */
function namesOf(first, before) {
  first = first.trim();
  if (/^['"]/.test(first) || first.startsWith('[')) return lits(first);
  // p ? `set${p}var` : ['setvar', 'setchatvar'] 처럼 틀 글자가 섞인 것
  const out = [...first.matchAll(/`([^`]*)`/g)].map(m => '/^' + m[1].replace(/\$\{[^}]*\}/g, '(.*)') + '$/');
  out.push(...lits(first.replace(/`[^`]*`/g, '')));
  if (out.length) return out;
  // for (const [n, …] of [['sin', …], …]) def(n, …) — 앞의 for 줄에서 첫 글자들을 가져온다
  const m = /for\s*\(\s*const\s*\[\s*(\w+)[^\]]*\]\s*of\s*(\[[\s\S]*?\])\s*(as\s[^)]*)?\)\s*$/.exec(before);
  if (m && m[1] === first) return [...m[2].matchAll(/\[\s*'([^']+)'/g)].map(x => x[1]);
  return [];
}
/** 한 덩이 글에서 이름 붙은 값을 읽는 자리: 도움 함수(a, '이름') · a.named.이름 · a.named['이름'] · pick('이름', …) */
function reads(body) {
  const out = new Set();
  for (const m of body.matchAll(/\b\w+\(\s*a\s*,\s*'(\w+)'/g)) out.add(m[1]);
  for (const m of body.matchAll(/\ba\.named(?:\?\.|\.)(\w+)/g)) out.add(m[1]);
  for (const m of body.matchAll(/\ba\.named\[\s*'(\w+)'\s*\]/g)) out.add(m[1]);
  if (/\ba\.named\[\s*\w+\s*\]/.test(body)) for (const m of body.matchAll(/\bpick\(([^)]*)\)/g)) for (const x of lits(m[1])) out.add(x);
  // 이름을 목록으로 돌며 읽는 것: for (const [k, f] of [['name', 'name'], …]) arg(a, k)
  if (/\b\w+\(\s*a\s*,\s*[a-z]\w*\s*[,)]|\ba\.named\[\s*[a-z]\w*\s*\]/.test(body)) for (const m of body.matchAll(/\[\s*\[\s*'/g)) { const e = close(body, m.index); if (e > 0) for (const x of body.slice(m.index + 1, e).matchAll(/\[\s*'(\w+)'\s*,/g)) out.add(x[1]); }
  return out;
}
/** 이름 붙은 값을 통째로 다루는가 (Object.entries(a.named) · a.named 를 넘김) */
const isOpen = body => /Object\.(entries|keys|values)\(\s*a\.named\s*\)|\(\s*a\.named\s*[,)]|=\s*a\.named\s*[;,]|\.\.\.\s*a\.named\b/.test(body);

/** 파일 하나: 맨 바깥의 도움 함수(인자 a: Args 를 받는 것) → 그 몸통, 그리고 def 호출들 */
function scanFile(src) {
  const helpers = new Map();
  const decl = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*)/g; let m;
  while ((m = decl.exec(src))) {
    const name = m[1] || m[2], at = m.index + m[0].length - (m[1] ? 1 : 0);
    // 몸통: 함수면 { … }, const 면 줄 끝(;)까지 — 여는 괄호를 따라가며
    let end;
    if (m[1]) { const b = src.indexOf('{', close(src, at) + 1); end = close(src, b); }
    else { end = at; for (let i = at; i < src.length; i++) { const ch = src[i]; if ('({['.includes(ch)) { i = close(src, i); if (i < 0) break; continue; } if (ch === '"' || ch === "'" || ch === '`') { i = skipStr(src, i); continue; } if (ch === ';' || (ch === '\n' && !/[,=>({[]\s*$/.test(src.slice(at, i)) && /^\s*(const|function|export|def|for|\/\/|$)/.test(src.slice(i + 1, i + 40)))) { end = i; break; } end = i; } }
    if (end > at) { const body = src.slice(at, end + 1); if (/\(\s*a\s*:\s*Args\b/.test(body)) helpers.set(name, body); }
  }
  const defs = [];
  const re = /\bdef\(/g;
  while ((m = re.exec(src))) {
    const open = m.index + 3, end = close(src, open); if (end < 0) continue;
    const inner = src.slice(open + 1, end);
    // 첫 인자 = 맨 바깥 쉼표 앞
    let depth = 0, cut = -1;
    for (let i = 0; i < inner.length; i++) { const ch = inner[i]; if (ch === '"' || ch === "'" || ch === '`') { i = skipStr(inner, i); continue; } if ('({['.includes(ch)) depth++; else if (')}]'.includes(ch)) depth--; else if (ch === ',' && !depth) { cut = i; break; } }
    if (cut < 0) continue;
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const names = namesOf(inner.slice(0, cut), src.slice(Math.max(0, lineStart - 400), m.index));
    const opts = inner.slice(cut + 1), alias = /\balias\s*:\s*(\[[^\]]*\])/.exec(opts);
    if (alias) names.push(...lits(alias[1]));
    if (names.length) defs.push({ names, body: opts });
  }
  // def 를 감싼 함수: const math = (name, …) => def(name, { … }) — 부르는 자리의 첫 글자가 명령 이름
  for (const [w, body] of scanWrappers(src)) {
    const r = new RegExp(`\\b${w}\\(`, 'g'); let c;
    while ((c = r.exec(src))) { const e = close(src, c.index + w.length); if (e < 0) continue; const args = src.slice(c.index + w.length + 1, e); const first = /^\s*('[^']*'|\[[^\]]*\])/.exec(args); if (first) defs.push({ names: lits(first[1]), body }); }
  }
  return { helpers, defs };
}
function scanWrappers(src) {
  const out = [];
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*\((\w+)\b[^\n]*?\)\s*=>\s*def\(\s*\2\s*,/g)) { const open = m.index + m[0].lastIndexOf('def(') + 3, e = close(src, open); if (e > 0) out.push([m[1], src.slice(open, e + 1)]); }
  return out;
}
function namedOf(body, helpers, seen = new Set()) {
  const out = reads(body); let open = isOpen(body);
  for (const m of body.matchAll(/\b(\w+)\s*\(/g)) {
    const h = helpers.get(m[1]); if (!h || seen.has(m[1])) continue; seen.add(m[1]);
    const r = namedOf(h, helpers, seen); for (const x of r.named) out.add(x); open ||= r.open;
  }
  return { named: [...out], open };
}

/** 저장소 뿌리에서 읽어 패턴 → { named, open } */
export function analyze(root = path.resolve(here, '..')) {
  const out = {};
  for (const f of ST_FILES) {
    const { helpers, defs } = scanFile(fs.readFileSync(path.join(root, f), 'utf8'));
    for (const d of defs) {
      const r = namedOf(d.body, helpers);
      for (const n of d.names) { const prev = out[n]; out[n] = { named: [...new Set([...(prev?.named || []), ...r.named])].sort(), ...(r.open || prev?.open ? { open: true } : {}) }; }
    }
  }
  return out;
}

/** vite 플러그인: import ref from 'virtual:st-ref' */
export function stRefPlugin() {
  const ID = 'virtual:st-ref', RID = '\0' + ID;
  return {
    name: 'st-ref',
    resolveId(id) { return id === ID ? RID : null; },
    load(id) {
      if (id !== RID) return null;
      const root = path.resolve(here, '..');
      for (const f of ST_FILES) this.addWatchFile?.(path.join(root, f));
      return 'export default ' + JSON.stringify(analyze(root)) + ';';
    },
  };
}

// node scripts/st-ref.mjs → 결과를 보여 준다 (점검용)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(here, 'st-ref.mjs')) {
  const r = analyze(), ks = Object.keys(r);
  console.log(JSON.stringify(r, null, 1));
  console.error(`명령 패턴 ${ks.length}개, 이름 붙은 값이 있는 것 ${ks.filter(k => r[k].named.length).length}개, 열린 것 ${ks.filter(k => r[k].open).length}개`);
}
