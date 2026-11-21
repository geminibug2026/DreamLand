// 막후의 순수한 글 처리: 느슨한 JSON 읽기 · 낱말 단위 비교(diff) · 반복 검출 · 씨앗 난수. 다른 파일을 끌어오지 않는다 (node 로 따로 돌려 볼 수 있게)

// ════════ 씨앗 난수 ════════
/** 글자열을 씨앗 숫자로 */
export function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** 같은 씨앗이면 늘 같은 차례로 나오는 난수 (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** 씨앗으로 n 개를 겹치지 않게 뽑는다 (원래 배열은 그대로) */
export function pick<T>(list: readonly T[], n: number, seed: number): T[] {
  const r = rng(seed), a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// ════════ 느슨한 JSON ════════
/** 모델이 낸 글에서 JSON 객체 하나를 찾아 읽는다. 코드 울타리 · 앞뒤 군말 · 끝의 쉼표는 봐준다. 못 읽으면 null */
export function parseLoose(text: string): Record<string, unknown> | null {
  let s = String(text || '').trim().replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
  const a = s.indexOf('{'); if (a < 0) return null;
  // 맨 처음 여는 괄호에서 짝이 맞는 닫는 괄호까지 (글자열 안의 괄호는 세지 않는다)
  let d = 0, inStr = false, end = -1;
  for (let i = a; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') d++; else if (c === '}') { d--; if (!d) { end = i; break; } }
  }
  s = end > 0 ? s.slice(a, end + 1) : s.slice(a);
  const tries = [s, s.replace(/,\s*([}\]])/g, '$1'), s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')];
  for (const x of tries) { try { const v: unknown = JSON.parse(x); if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>; } catch { /* 다음 방법으로 */ } }
  return null;
}
/** 조수 한 명의 몫을 { out, memo } 로 편다. 조수가 틀을 안 지키고 값만 냈어도 받아 준다 */
export function unwrap(v: unknown): { out: unknown; memo: string } {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>, memo = typeof o.memo === 'string' ? o.memo.slice(0, 600) : '';
    if ('out' in o) return { out: o.out, memo };
    const rest: Record<string, unknown> = { ...o }; delete rest.memo;
    return { out: rest, memo };
  }
  return { out: v, memo: '' };
}
/** 결과를 글로 (글이면 그대로, 아니면 JSON) */
export const asText = (v: unknown): string => v == null ? '' : typeof v === 'string' ? v.trim() : JSON.stringify(v);

// ════════ 낱말 단위 비교 ════════
export interface DiffPart { op: 'same' | 'ins' | 'del'; text: string }
/** 낱말과 그 사이 띄어쓰기로 쪼갠다. 띄어쓰기가 없는 글(한중일)은 글자 하나가 낱말 */
export function words(s: string): string[] {
  return String(s).match(/\s+|[A-Za-z0-9À-ɏЀ-ӿ'’_-]+|[가-힣]+|[\s\S]/g) || [];
}
/** 두 글의 차이를 낱말 단위로. 가장 긴 공통 수열로 맞춘 뒤 이웃한 같은 종류를 붙인다 */
export function diffWords(a: string, b: string): DiffPart[] {
  let A = words(a), B = words(b);
  // 너무 길면 표가 커지니 낱말을 줄 단위로 바꿔 어림한다
  if (A.length * B.length > 4_000_000) { A = String(a).split(/(?<=\n)/); B = String(b).split(/(?<=\n)/); }
  let pre = 0; while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0; while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const x = A.slice(pre, A.length - suf), y = B.slice(pre, B.length - suf), n = x.length, m = y.length;
  const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffPart[] = [], put = (op: DiffPart['op'], text: string) => { const t = out[out.length - 1]; if (t && t.op === op) t.text += text; else if (text) out.push({ op, text }); };
  put('same', A.slice(0, pre).join(''));
  let i = 0, j = 0;
  while (i < n && j < m) { if (x[i] === y[j]) { put('same', x[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) put('del', x[i++]); else put('ins', y[j++]); }
  while (i < n) put('del', x[i++]); while (j < m) put('ins', y[j++]);
  put('same', A.slice(A.length - suf).join(''));
  // 지움 · 넣음 사이에 낀 띄어쓰기는 양쪽 몫으로 돌리고, 이어진 바뀜은 지움 하나 · 넣음 하나로 모은다 — 바뀐 구절이 한 덩어리로 보이게
  const flat: DiffPart[] = [];
  out.forEach((p, k) => { if (p.op === 'same' && /^\s+$/.test(p.text) && out[k - 1] && out[k + 1] && out[k - 1].op !== 'same' && out[k + 1].op !== 'same') flat.push({ op: 'del', text: p.text }, { op: 'ins', text: p.text }); else flat.push(p); });
  const res: DiffPart[] = []; let del = '', ins = '';
  const flush = () => { if (del) res.push({ op: 'del', text: del }); if (ins) res.push({ op: 'ins', text: ins }); del = ins = ''; };
  for (const p of flat) { if (p.op === 'del') del += p.text; else if (p.op === 'ins') ins += p.text; else { flush(); res.push(p); } }
  flush();
  return res;
}
/** 바뀐 덩어리 수 (지움과 넣음이 붙어 있으면 하나로 센다) */
export function countChanges(parts: DiffPart[]): number { let n = 0, prev = 'same'; for (const p of parts) { if (p.op !== 'same' && prev === 'same') n++; prev = p.op; } return n; }

// ════════ 답장 검사 ════════
export interface Issue { kind: 'banned' | 'echo' | 'loop' | 'opener' | 'starts' | 'speakFor'; detail: string }
export interface CheckOpt { words?: string[]; repeat?: boolean; opener?: boolean; speakFor?: boolean; user?: string }
const norm = (s: string) => s.toLowerCase().replace(/[*_~`]/g, '');
/** 뜻을 싣는 낱말만 (구두점과 띄어쓰기는 뺀다). 띄어쓰기 없는 글은 글자 단위 */
export function tokens(s: string): string[] { return (norm(s).match(/[a-z0-9À-ɏЀ-ӿ'’]+|[가-힣]+|[぀-ヿ一-鿿]/g) || []); }
const grams = (tk: string[], n: number) => { const m = new Map<string, number>(); for (let i = 0; i + n <= tk.length; i++) { const g = tk.slice(i, i + n).join(' '); m.set(g, (m.get(g) || 0) + 1); } return m; };
/** 한중일 글자가 대부분이면 낱말이 짧으니 더 긴 묶음으로 본다 */
const gramSize = (tk: string[]) => { const one = tk.filter(t => t.length === 1 && t.charCodeAt(0) > 0x3000).length; return one > tk.length * 0.6 ? 7 : 4; };
/** 두 답장에 함께 나오는 구절 (겹치는 묶음은 길게 이어 붙인다) */
export function sharedPhrases(now: string, prev: string): string[] {
  const a = tokens(now), b = tokens(prev), n = gramSize(a), seen = grams(b, n), out: string[] = [];
  for (let i = 0; i + n <= a.length; i++) {
    if (!seen.has(a.slice(i, i + n).join(' '))) continue;
    let j = i + 1; while (j + n <= a.length && seen.has(a.slice(j, j + n).join(' '))) j++;
    out.push(a.slice(i, j - 1 + n).join(' ')); i = j - 1 + n - 1;
  }
  return [...new Set(out)];
}
/** 한 답장 안에서 세 번 넘게 되풀이된 구절 */
export function loops(text: string): string[] {
  const tk = tokens(text), n = Math.max(3, gramSize(tk) - 1), out: string[] = [];
  for (const [g, c] of grams(tk, n)) if (c >= 3) out.push(g);
  // 서로 겹치는 묶음은 하나만 남긴다
  return out.filter((g, i) => !out.slice(0, i).some(h => h.split(' ').slice(1).join(' ') === g.split(' ').slice(0, -1).join(' '))).slice(0, 4);
}
/** 문장으로 쪼갠다 (따옴표 안의 마침표도 끊지만, 시작 낱말을 보는 데는 충분하다) */
export function sentences(text: string): string[] { return String(text).replace(/\[\[[\s\S]*?\]\]/g, ' ').split(/(?<=[.!?。！？…])["'”’*)\]]*\s+|\n+/).map(s => s.trim()).filter(s => s.length > 1); }
/** 첫 문장이 어떻게 여는지: 대사 · 지문 · 서술 */
export function openerKind(text: string): 'dialogue' | 'action' | 'narration' {
  const s = String(text).trimStart();
  return /^["“「『«]/.test(s) ? 'dialogue' : /^[*_(（]/.test(s) ? 'action' : 'narration';
}
const firstWords = (s: string, n: number) => tokens(s).slice(0, n).join(' ');
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SAY_EN = 'said|says|asked|asks|replied|replies|answered|answers|whispered|whispers|murmured|murmurs|muttered|mutters|shouted|shouts|laughed|laughs|sighed|sighs';
const SAY_KO = '말했|말한다|말하며|물었|묻는다|대답했|대답한다|답했|속삭였|속삭인다|중얼거렸|외쳤|소리쳤';
/** 답장을 코드로 살핀다. 걸린 것이 없으면 빈 배열 — 그러면 모델을 부르지 않는다 */
export function checkReply(text: string, prev: string, o: CheckOpt = {}): Issue[] {
  const out: Issue[] = [], low = norm(text);
  const hits = (o.words || []).map(w => String(w).trim()).filter(Boolean).filter(w => low.includes(w.toLowerCase()));
  if (hits.length) out.push({ kind: 'banned', detail: hits.slice(0, 8).join(', ') });
  if (o.repeat !== false) {
    if (prev) { const sh = sharedPhrases(text, prev); if (sh.length >= 2 || sh.some(p => p.split(' ').length >= 7)) out.push({ kind: 'echo', detail: sh.slice(0, 4).map(p => `"${p}"`).join(', ') }); }
    const lp = loops(text); if (lp.length) out.push({ kind: 'loop', detail: lp.map(p => `"${p}"`).join(', ') });
  }
  if (o.opener !== false) {
    if (prev) {
      const a = firstWords(text, 3), b = firstWords(prev, 3);
      if (a && a === b) out.push({ kind: 'opener', detail: `"${a}"` });
      else if (openerKind(text) === openerKind(prev) && openerKind(text) !== 'narration') out.push({ kind: 'opener', detail: openerKind(text) });
    }
    const ss = sentences(text);
    if (ss.length >= 5) {
      const c = new Map<string, number>(); for (const s of ss) { const w = firstWords(s, 1); if (w) c.set(w, (c.get(w) || 0) + 1); }
      const top = [...c].sort((x, y) => y[1] - x[1])[0];
      if (top && top[1] >= Math.max(4, Math.ceil(ss.length * 0.5))) out.push({ kind: 'starts', detail: `"${top[0]}" × ${top[1]}/${ss.length}` });
    }
  }
  const u = String(o.user || '').trim();
  if (o.speakFor !== false && u.length >= 2) {
    const U = reEsc(u), Q = '["“「『][^"”」』\\n]{2,}["”」』]';
    const pats = [new RegExp(`^\\s*${U}\\s*[:：]`, 'im'), new RegExp(`${Q}[,.]?\\s*${U}\\s+(?:${SAY_EN})\\b`, 'i'), new RegExp(`\\b${U}\\s+(?:${SAY_EN})\\b[^.\\n"“]{0,24}[,:]?\\s*["“]`, 'i'), new RegExp(`${U}(?:은|는|이|가)?\\s[^.\\n"“「]{0,24}(?:${SAY_KO})`), new RegExp(`${Q}\\s*${U}(?:은|는|이|가)\\s[^.\\n]{0,16}(?:${SAY_KO})`), new RegExp(`${U}(?:은|는|이|가)?\\s[^.\\n"“「]{0,20}${Q}(?:이?라고|하고|라며)?\\s*[^.\\n]{0,8}(?:${SAY_KO})`)];
    const m = pats.map(p => p.exec(text)).find(Boolean);
    if (m) out.push({ kind: 'speakFor', detail: m[0].trim().slice(0, 80) });
  }
  return out;
}
/** 고쳐 쓴 글을 받아도 되는지: 비었거나 길이가 원문에서 35% 넘게 벗어나면 버린다 */
export function rewriteOk(orig: string, next: string, band = 0.35): boolean {
  const a = orig.trim().length, b = String(next || '').trim().length;
  return b > 0 && a > 0 && Math.abs(b - a) / a <= band && next.trim() !== orig.trim();
}
