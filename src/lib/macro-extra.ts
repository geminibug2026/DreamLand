// ── 매크로 보강 (순수 계산): 가중치 무작위 · 대소문자 블록 · 흐른 시간 말로 · 끼워 넣기(include)의 순환 막기 ──
// 화면 · 저장소를 모른다. 엔진과 src/gate 가 가져다 쓰고, node 로 따로 돌려 검증한다.

/** 선택지 끝의 "@숫자" 만 가중치로 읽는다. 하나도 없으면 null (예전처럼 고르게 뽑는다) */
export function weighted(opts: string[]): { items: string[]; w: number[] } | null {
  let any = false; const items: string[] = [], w: number[] = [];
  for (const o of opts) {
    const m = /^([\s\S]*?)@\s*(\d+(?:\.\d+)?|\.\d+)\s*$/.exec(o);
    if (m) { any = true; items.push(m[1].trim()); w.push(Number(m[2])); } else { items.push(o.trim()); w.push(1); }
  }
  return any ? { items, w } : null;
}
/** r(0 이상 1 미만)을 가중치 위에 떨어뜨려 하나를 고른다. 가중치 0 은 뽑히지 않고, 전부 0 이면 빈 글 */
export function wpick(items: string[], w: number[], r: number): string {
  const total = w.reduce((n, x) => n + (x > 0 ? x : 0), 0); if (!(total > 0)) return '';
  let at = Math.min(Math.max(r, 0), 0.999999999) * total;
  for (let i = 0; i < items.length; i++) { if (!(w[i] > 0)) continue; at -= w[i]; if (at < 0) return items[i]; }
  for (let i = items.length - 1; i >= 0; i--) if (w[i] > 0) return items[i];
  return '';
}

// {{uppercase}}…{{/uppercase}} · {{lowercase}}…{{/lowercase}}: 매크로가 표식만 남기고, 다 풀린 뒤에 한 번에 바꾼다
export const CASE_MARK = { U: '\u0003U\u0003', u: '\u0003/U\u0003', L: '\u0003L\u0003', l: '\u0003/L\u0003' };
/** 표식 사이의 글을 대문자 · 소문자로. 짝이 맞지 않는 표식은 그냥 지운다 */
export function caseFold(text: string): string {
  // eslint-disable-next-line no-control-regex
  let out = text.replace(/\u0003U\u0003([\s\S]*?)\u0003\/U\u0003/g, (_m, b: string) => b.toUpperCase()).replace(/\u0003L\u0003([\s\S]*?)\u0003\/L\u0003/g, (_m, b: string) => b.toLowerCase());
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\u0003\/?[UL]\u0003/g, '');
  return out;
}

/** 흐른 시간을 사람 말로 (프롬프트에 들어가므로 영어). 1분 안쪽은 "just now" */
export function idleText(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60000) return 'just now';
  const min = Math.floor(ms / 60000), n = (v: number, u: string) => `${v} ${u}${v === 1 ? '' : 's'}`;
  if (min < 60) return n(min, 'minute');
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m && h < 6 ? `${n(h, 'hour')} ${n(m, 'minute')}` : n(h, 'hour');
  const d = Math.floor(h / 24), hh = h % 24;
  if (d < 14) return hh && d < 3 ? `${n(d, 'day')} ${n(hh, 'hour')}` : n(d, 'day');
  if (d < 60) return n(Math.floor(d / 7), 'week');
  if (d < 730) return n(Math.floor(d / 30), 'month');
  return n(Math.floor(d / 365), 'year');
}

// ── {{include::항목}} ──
export const INCLUDE_MAX = 5;
/**
 * 로어북 항목 본문을 끼워 넣는다. find(이름, 책) → { key: 항목을 가리키는 고유 값, text: 본문 } | null
 * expand(본문, 지금까지 거친 항목들) 이 본문 안의 매크로(다른 include 포함)를 푼다. 자기 자신으로 돌아오거나 너무 깊으면 빈 글
 */
export function includeText(name: string, book: string, stack: string[], find: (name: string, book: string) => { key: string; text: string } | null, expand: (text: string, stack: string[]) => string): string {
  const hit = find(name, book); if (!hit) return '';
  if (stack.includes(hit.key) || stack.length >= INCLUDE_MAX) return '';
  return expand(hit.text, [...stack, hit.key]);
}

// ── 실리태번 1.19 의 변수 매크로 ── {{getvarkey::이름::칸}} · {{setvarkey::이름::칸::값}} (목록 · 사전 변수의 한 칸) 과
// 줄임 꼴 {{.이름}} (대화 변수) · {{$이름}} (전역 변수) 에 붙는 연산자 (=, +=, -=, ++, --, ??, ??=, ||, ||=, ==, !=, >, >=, <, <=)
/** 매크로가 내보내는 글: 없으면 빈 글, 목록 · 사전은 JSON (실리태번과 같다) */
export const macroText = (v: unknown): string => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const parseJson = (v: unknown): unknown => { if (v && typeof v === 'object') return v; if (typeof v !== 'string') return null; try { return JSON.parse(v); } catch { return null; } };
/** 목록 · 사전 변수의 한 칸 읽기 */
export function getKey(raw: unknown, key: string): string {
  const j = parseJson(raw); if (!j || typeof j !== 'object') return '';
  return macroText((j as Record<string, unknown>)[Array.isArray(j) ? Number(key) : key]);
}
/** 한 칸 쓰기: 변수가 없으면 칸이 수이면 목록, 아니면 사전으로 새로 만든다. 돌려주는 값은 JSON 글 (실리태번처럼 글로 적어 둔다) */
export function setKey(raw: unknown, key: string, value: string): string {
  let j = parseJson(raw ?? null); const num = String(key).trim() !== '' && Number.isInteger(Number(key));
  if (!j || typeof j !== 'object') j = num ? [] : {};
  if (Array.isArray(j) && num) j[Number(key)] = value; else (j as Record<string, unknown>)[key] = value;
  return JSON.stringify(j);
}
/** 더하기: 목록이면 끝에 붙이고, 둘 다 수이면 더하고, 아니면 글을 잇는다 */
export function addTo(cur: unknown, value: string): unknown {
  const j = parseJson(cur);
  if (Array.isArray(j)) { j.push(value); return JSON.stringify(j); }
  const a = Number(cur ?? 0), b = Number(value);
  return isNaN(a) || isNaN(b) ? String(cur ?? '') + value : a + b;
}
export interface VarShort { global: boolean; name: string; op: string; value: string }
/** {{.이름 연산자 값}} · {{$이름 …}} 를 읽는다. 아니면 null */
export function varShorthand(body: string): VarShort | null {
  const m = /^\s*([.$])([A-Za-z](?:[\w-]*\w)?)\s*(\+\+|--|\?\?=|\?\?|\|\|=|\|\||-=|\+=|==|!=|>=|<=|>|<|=)?([\s\S]*)$/.exec(body);
  if (!m) return null;
  if (!m[3] && m[4].trim()) return null;   // 이름 뒤에 연산자 없이 다른 글이 오면 줄임 꼴이 아니다
  return { global: m[1] === '$', name: m[2], op: m[3] || '', value: m[4].trim() };
}
const falsy = (v: unknown) => !v || ['false', 'off', '0', 'no'].includes(macroText(v).trim().toLowerCase());
/** 줄임 꼴 계산. vars 는 그 범위의 변수 묶음 (여기서 바꾼 값이 그대로 남는다) */
export function runVarShorthand(s: VarShort, vars: Record<string, unknown>): string {
  const has = Object.prototype.hasOwnProperty.call(vars, s.name), cur = has ? vars[s.name] : undefined, v = s.value;
  const num = (x: unknown) => (x === '' || x == null ? NaN : Number(x));
  const cmp = (f: (a: number, b: number) => boolean) => { const a = num(cur), b = num(v); return isNaN(a) || isNaN(b) ? 'false' : String(f(a, b)); };
  switch (s.op) {
    case '': return macroText(cur);
    case '=': vars[s.name] = v; return '';
    case '++': vars[s.name] = (Number(cur) || 0) + 1; return macroText(vars[s.name]);
    case '--': vars[s.name] = (Number(cur) || 0) - 1; return macroText(vars[s.name]);
    case '+=': vars[s.name] = addTo(cur, v); return '';
    case '-=': { const n = Number(v); if (!isNaN(n)) vars[s.name] = addTo(cur, String(-n)); return ''; }
    case '||': return falsy(cur) ? v : macroText(cur);
    case '??': return has ? macroText(cur) : v;
    case '||=': if (falsy(cur)) { vars[s.name] = v; return v; } return macroText(cur);
    case '??=': if (!has) { vars[s.name] = v; return v; } return macroText(cur);
    case '==': return String(macroText(cur) === v);
    case '!=': return String(macroText(cur) !== v);
    case '>': return cmp((a, b) => a > b); case '>=': return cmp((a, b) => a >= b);
    case '<': return cmp((a, b) => a < b); case '<=': return cmp((a, b) => a <= b);
  }
  return '';
}
