// ── Dreamland cond: 조건식 · {{#if}} 블록 · 프리셋 변수 값 풀기 (화면과 무관한 순수 계산) ──
import type { PresetVar, PresetVarOption } from './types';

const FALSY = new Set(['', 'false', '0', 'no', 'off', 'null', 'undefined']);
export const truthy = (v: unknown): boolean => v === true || (v !== false && !FALSY.has(String(v ?? '').trim().toLowerCase()));
const isNum = (v: unknown) => v !== '' && v != null && !isNaN(Number(v));

// ════════ 프리셋 변수 ════════
// preset.vars = [{ id, name, label, hint, type: 'select'|'slider'|'toggle'|'text', default, options: [{ label, value }], min, max, step, onText, offText }]
// 대화방별 값은 chat.pvars[preset.id][name] 에 둔다. 없으면 정의의 default.
export type PvOption = PresetVarOption;
export type PvDef = PresetVar;
export type PvRaw = string | number | boolean;
export interface PvValue { type: string; raw: PvRaw; text: string; label: string }
export type PvMap = Record<string, PvValue>;
interface PresetLike { id?: string; vars?: unknown; [k: string]: unknown }
interface ChatLike { pvars?: unknown; [k: string]: unknown }

export const PV_TYPES: Record<string, string> = { select: '선택지', slider: '슬라이더', toggle: '토글', text: '짧은 글' };
export const pvName = (s: unknown) => String(s ?? '').trim().replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '');
export const pvDefs = (preset: PresetLike | null | undefined): PvDef[] => Array.isArray(preset?.vars) ? (preset.vars as (PvDef | null)[]).filter((v): v is PvDef => !!(v && v.name)) : [];
const stepFix = (n: number, d: PvDef) => { const st = Number(d.step) > 0 ? Number(d.step) : 0, min = isNum(d.min) ? Number(d.min) : 0; return st ? +(min + Math.round((n - min) / st) * st).toFixed(6) : n; };
export function pvDefault(d: PvDef): PvRaw {
  if (d.type === 'slider') { const n = Number(d.default); return isNum(d.default) ? n : (isNum(d.min) ? Number(d.min) : 0); }
  if (d.type === 'toggle') return d.default === true || d.default === 'true';
  if (d.type === 'select') { const o = d.options || []; return o.some(x => x.label === d.default) ? d.default as string : (o[0]?.label ?? ''); }
  return String(d.default ?? '');
}
/** 저장된 값을 정의에 맞게 고친다 (범위 밖 숫자 · 사라진 선택지 등) */
export function pvCoerce(d: PvDef, raw: unknown): PvRaw {
  if (raw === undefined || raw === null) return pvDefault(d);
  if (d.type === 'slider') { if (!isNum(raw)) return pvDefault(d); const min = isNum(d.min) ? Number(d.min) : 0, max = isNum(d.max) ? Number(d.max) : 100; return Math.min(max, Math.max(min, stepFix(Number(raw), d))); }
  if (d.type === 'toggle') return raw === true || raw === 1 || ['true', '1', 'on', 'yes', '켬'].includes(String(raw).trim().toLowerCase());
  if (d.type === 'select') { const o = d.options || [], s = String(raw); const hit = o.find(x => x.label === s) || o.find(x => x.label.toLowerCase() === s.trim().toLowerCase()); return hit ? hit.label : pvDefault(d); }
  return String(raw);
}
/** 이름 → { type, raw: 고른 값, text: 프롬프트에 들어갈 글, label: 고른 선택지 이름 } */
export function pvResolve(preset: PresetLike | null | undefined, chat: ChatLike | null | undefined): PvMap {
  const mine = (chat?.pvars as Record<string, Record<string, unknown> | undefined> | undefined)?.[preset?.id as string] || {}, out: PvMap = {};
  for (const d of pvDefs(preset)) {
    const raw = pvCoerce(d, mine[d.name]); let text = '', label: PvRaw = '';
    if (d.type === 'toggle') { text = raw ? (d.onText || 'true') : (d.offText || ''); label = raw ? 'on' : 'off'; }
    else if (d.type === 'select') { const o = (d.options || []).find(x => x.label === raw); text = o ? String(o.value ?? '') : ''; label = raw; }
    else text = String(raw);
    out[d.name] = { type: d.type || 'text', raw, text, label: label as string };
  }
  return out;
}

// ════════ 조건식 ════════
// 값: "따옴표 글" · 숫자 · 이름(프리셋 변수 → 대화 변수 → 전역 변수 → char/user 같은 낱말) · var:이름
// 연산: == = is · != is not · > < >= <= · contains includes · not contains · && and · || or · ! not · ( )
export interface CondEnv { pv?: PvMap | null; vars?: Record<string, unknown> | null; gvars?: Record<string, unknown> | null; scope?: Record<string, unknown> | null; kw?: Record<string, unknown> | null }
interface Tok { t: 'str' | 'op' | 'word'; v: string; w?: string }
const WORD_OPS: Record<string, string> = { is: '==', and: '&&', or: '||', not: '!', contains: 'has', includes: 'has', in: 'in' };
function lex(src: unknown): Tok[] {
  const out: Tok[] = []; let i = 0; const s = String(src ?? '');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'" || c === '“' || c === '‘') {
      const close = c === '“' ? '”' : c === '‘' ? '’' : c; let j = i + 1, v = '';
      while (j < s.length && s[j] !== close) { if (s[j] === '\\' && j + 1 < s.length) { j++; v += s[j] === 'n' ? '\n' : s[j]; } else v += s[j]; j++; }
      out.push({ t: 'str', v }); i = j + 1; continue;
    }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('=<>!()'.includes(c)) { out.push({ t: 'op', v: c === '=' ? '==' : c }); i++; continue; }
    let j = i; while (j < s.length && !/[\s"'“‘=<>!()&|]/.test(s[j])) j++;
    if (j === i) { i++; continue; }   // 낱개 & | 같은 글자는 건너뛴다
    const w = s.slice(i, j), lw = w.toLowerCase(); i = j;
    if (lw in WORD_OPS) out.push({ t: 'op', v: WORD_OPS[lw], w }); else out.push({ t: 'word', v: w });
  }
  // "is not" → != ,  "not contains" → !has
  const merged: Tok[] = [];
  for (let k = 0; k < out.length; k++) {
    const a = out[k], b = out[k + 1];
    if (a.t === 'op' && a.v === '==' && a.w && b?.t === 'op' && b.v === '!' && b.w) { merged.push({ t: 'op', v: '!=' }); k++; }
    else if (a.t === 'op' && a.v === '!' && a.w && b?.t === 'op' && b.v === 'has') { merged.push({ t: 'op', v: '!has' }); k++; }
    else if (a.t === 'op' && a.v === '!' && a.w && b?.t === 'op' && b.v === 'in') { merged.push({ t: 'op', v: '!in' }); k++; }
    else merged.push(a);
  }
  return merged;
}
const KEYWORDS: Record<string, string> = { char: 'char', user: 'user', group: 'group', persona: 'persona', description: 'description', personality: 'personality', scenario: 'scenario', input: 'input', model: 'model', character: 'char',
  lastmessage: 'lastMessage', lastusermessage: 'lastUserMessage', lastcharmessage: 'lastCharMessage', mode: 'mode', type: 'type' };
interface Val { v: string; alt?: string[]; known: boolean; lit?: boolean; bool?: boolean }
/** env: { pv, vars, gvars, scope, kw } → 이름을 값으로. { v: 글, alt: 같다고 볼 다른 글들, known } */
function lookup(name: string, env: CondEnv): Val {
  let n = String(name), forced = false;
  const m = n.match(/^(?:var|pvar|getvar)(?:::|[:.])(.+)$/i); if (m) { n = m[1]; forced = true; }
  if (env.scope && n in env.scope) return { v: String(env.scope[n] ?? ''), known: true };
  const p = env.pv?.[n]; if (p) return { v: p.text, alt: [p.label, String(p.raw)].filter(x => x !== ''), known: true, bool: p.type === 'toggle' ? !!p.raw : undefined };
  if (env.vars && Object.hasOwn(env.vars, n)) return { v: String(env.vars[n] ?? ''), known: true };
  if (env.gvars && Object.hasOwn(env.gvars, n)) return { v: String(env.gvars[n] ?? ''), known: true };
  const k = KEYWORDS[n.toLowerCase()]; if (!forced && k && env.kw && env.kw[k] != null) return { v: String(env.kw[k]), known: true };
  return { v: forced ? '' : n, known: forced };
}
const eq = (a: unknown, b: unknown) => { const x = String(a).trim(), y = String(b).trim(); return isNum(x) && isNum(y) ? Number(x) === Number(y) : x.toLowerCase() === y.toLowerCase(); };
const same = (L: Val, R: Val) => [L.v, ...(L.alt || [])].some(x => [R.v, ...(R.alt || [])].some(y => eq(x, y)));
function compare(L: Val, op: string, R: Val): boolean {
  switch (op) {
    case '==': return same(L, R);
    case '!=': return !same(L, R);
    case 'has': return String(L.v).toLowerCase().includes(String(R.v).toLowerCase());
    case '!has': return !String(L.v).toLowerCase().includes(String(R.v).toLowerCase());
    case 'in': return String(R.v).toLowerCase().includes(String(L.v).toLowerCase());
    case '!in': return !String(R.v).toLowerCase().includes(String(L.v).toLowerCase());
    default: { if (!isNum(L.v) || !isNum(R.v)) return false; const a = Number(L.v), b = Number(R.v); return op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b; }
  }
}
const CMP = ['==', '!=', '>', '<', '>=', '<=', 'has', '!has', 'in', '!in'];
/** 조건식을 참/거짓으로. 읽을 수 없는 식은 거짓 */
export function evalCond(expr: unknown, env: CondEnv = {}): boolean {
  const tk = lex(expr); let i = 0, lastLeft: Val | null = null;
  const peek = () => tk[i], isOp = (v: string) => tk[i]?.t === 'op' && tk[i].v === v;
  const operand = (): Val | null => {
    const t = tk[i]; if (!t) return null;
    if (t.t === 'str') { i++; return { v: t.v, known: true, lit: true }; }
    if (t.t !== 'word') return null;
    const words: string[] = []; while (tk[i]?.t === 'word') words.push(tk[i++].v);
    if (words.length > 1) return { v: words.join(' '), known: true, lit: true };   // 따옴표 없는 여러 낱말은 글 그대로
    return isNum(words[0]) ? { v: words[0], known: true, lit: true } : lookup(words[0], env);
  };
  const primary = (): boolean => {
    if (isOp('(')) { i++; const v = or(); if (isOp(')')) i++; return v; }
    if (isOp('!')) { i++; return !primary(); }
    const L = operand(); if (!L) { i++; return false; }
    const t = peek();
    if (t?.t === 'op' && CMP.includes(t.v)) { i++; const R = operand() || { v: '', known: true }; if (t.v === '==') lastLeft = L; return compare(L, t.v, R); }
    if (L.lit && lastLeft && !(t?.t === 'op' && CMP.includes(t.v))) return same(lastLeft, L);   // a == "x" || "y"
    return L.bool !== undefined ? L.bool : (L.known ? truthy(L.v) : false);
  };
  const and = (): boolean => { let v = primary(); while (isOp('&&')) { i++; lastLeft = null; const r = primary(); v = v && r; } return v; };
  const or = (): boolean => { let v = and(); while (isOp('||')) { i++; const r = and(); v = v || r; } return v; };
  try { return !!or(); } catch { return false; }
}

// ════════ {{#if 조건}} … {{else if 조건}} … {{else}} … {{/if}} ════════
const TAG = /\{\{\s*(#if|#unless|else\s*if|elseif|else|\/if|\/unless)(?![\w-])/gi;
interface Tag { at: number; end: number; kind: string; cond: string }
function nextTag(src: string, from: number): Tag | null {
  TAG.lastIndex = from; const m = TAG.exec(src); if (!m) return null;
  let i = TAG.lastIndex, depth = 0;
  for (; i < src.length - 1; i++) {
    if (src[i] === '{' && src[i + 1] === '{') { depth++; i++; }
    else if (src[i] === '}' && src[i + 1] === '}') { if (!depth) break; depth--; i++; }
  }
  if (i >= src.length - 1) return null;
  return { at: m.index, end: i + 2, kind: m[1].toLowerCase().replace(/\s+/g, ''), cond: src.slice(TAG.lastIndex, i).trim() };
}
interface Branch { cond: string | null; neg?: boolean; from: number; to?: number }
/** test(조건글) → 참/거짓. 맞는 가지만 남기고 나머지는 지운다. 닫히지 않은 블록은 건드리지 않는다 */
export function condBlocks(srcIn: unknown, test: (cond: string) => unknown): string {
  const src = String(srcIn ?? '');
  if (src.indexOf('{{') < 0 || !/\{\{\s*#(if|unless)/i.test(src)) return src;
  let out = '', pos = 0;
  for (;;) {
    let open = nextTag(src, pos);
    while (open && open.kind !== '#if' && open.kind !== '#unless') open = nextTag(src, open.end);
    if (!open) { out += src.slice(pos); break; }
    out += src.slice(pos, open.at);
    const branches: Branch[] = [{ cond: open.cond, neg: open.kind === '#unless', from: open.end }]; let depth = 1, p = open.end, closed = false;
    while (depth) {
      const t = nextTag(src, p); if (!t) break; p = t.end;
      if (t.kind === '#if' || t.kind === '#unless') depth++;
      else if (t.kind === '/if' || t.kind === '/unless') { if (!--depth) { branches[branches.length - 1].to = t.at; closed = true; } }
      else if (depth === 1) { branches[branches.length - 1].to = t.at; branches.push({ cond: t.kind === 'else' ? null : t.cond, from: t.end }); }
    }
    if (!closed) { out += src.slice(open.at, open.end); pos = open.end; continue; }
    let pick = '';
    for (const b of branches) { const ok = b.cond === null ? true : (!!test(b.cond) !== !!b.neg); if (ok) { pick = src.slice(b.from, b.to); break; } }
    pick = condBlocks(pick.replace(/^[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*$/, ''), test);
    if (!pick && /(^|\n)[ \t]*$/.test(out) && /^[ \t]*\r?\n/.test(src.slice(p))) p += (src.slice(p).match(/^[ \t]*\r?\n/) as RegExpMatchArray)[0].length;   // 빈 가지가 남기는 빈 줄을 없앤다
    out += pick; pos = p;
  }
  return out;
}
/** 글에서 쓰인 프리셋 변수 이름들 ({{var::이름}} · {{#if 이름 …}}) */
export function usedVars(text: unknown): string[] {
  const out = new Set<string>(); const s = String(text || '');
  s.replace(/\{\{\s*(?:var|pvar)\s*::\s*([^:{}]+?)\s*(?:::[^{}]*)?\}\}/gi, (_, n: string) => { out.add(n); return ''; });
  return [...out];
}
