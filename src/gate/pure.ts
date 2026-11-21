// 물음(판정문)의 순수 계산: 조건식에서 ask:"…" 읽기 · 유지/쉬기/주기 타이머 · 모델 답 읽기. 화면도 저장소도 모른다 (node 로 따로 돌려 검증한다)
import type { AskMods, AskSite, SiteState } from './types';

const QUOTES: Record<string, string> = { '"': '"', "'": "'", '“': '”', '‘': '’' };
/** from 자리의 따옴표 글을 읽는다 → [글, 끝난 다음 자리] | null */
function quoted(s: string, from: number): [string, number] | null {
  const close = QUOTES[s[from]]; if (!close) return null;
  let j = from + 1, v = '';
  while (j < s.length && s[j] !== close) { if (s[j] === '\\' && j + 1 < s.length) j++; v += s[j]; j++; }
  return j < s.length ? [v, j + 1] : null;
}
/** 수식어를 늘 같은 차례의 글로 (타이머 기록의 열쇠) */
export const modsKey = (m: AskMods) => [m.sticky ? 's' + m.sticky : '', m.cooldown ? 'c' + m.cooldown : '', m.every ? 'e' + m.every : '', m.until ? 'u' + m.until : ''].filter(Boolean).join(' ');
export const siteKey = (stmt: string, m: AskMods) => stmt + '\u0001' + modsKey(m);

export interface AskSpan extends AskSite { start: number; end: number }
/** 조건식 안의 ask:"문장" sticky:N cooldown:N every:N until:"문장" 을 모두 찾는다 */
export function findAsks(cond: string): AskSpan[] {
  const out: AskSpan[] = [], re = /(^|[^\w.])ask\s*:\s*(?=["'“‘])/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(cond))) {
    const start = m.index + m[1].length, q = quoted(cond, re.lastIndex); if (!q) continue;
    const mods: AskMods = {}; let end = q[1];
    for (;;) {
      const rest = cond.slice(end), n = /^\s+(sticky|cooldown|every)\s*:\s*(\d+)/i.exec(rest);
      if (n) { const v = Math.min(999, +n[2]); if (v > 0) mods[n[1].toLowerCase() as 'sticky' | 'cooldown' | 'every'] = v; end += n[0].length; continue; }
      const u = /^\s+until\s*:\s*(?=["'“‘])/i.exec(rest);
      if (u) { const uq = quoted(cond, end + u[0].length); if (!uq) break; if (uq[0].trim()) mods.until = uq[0].trim(); end = uq[1]; continue; }
      break;
    }
    if (q[0].trim()) out.push({ start, end, stmt: q[0].trim(), mods });
    re.lastIndex = end;
  }
  return out;
}
/** 조건식의 물음들을 판정 결과로 바꿔 끼운다. 참은 (1 > 0), 거짓은 (0 > 1) — 조건식 계산기가 그대로 읽는다 */
export function rewriteCond(cond: string, resolve: (site: AskSite) => boolean): string {
  const spans = findAsks(cond); if (!spans.length) return cond;
  let out = '', pos = 0;
  for (const s of spans) { out += cond.slice(pos, s.start) + (resolve({ stmt: s.stmt, mods: s.mods }) ? '(1 > 0)' : '(0 > 1)'); pos = s.end; }
  return out + cond.slice(pos);
}
/** 로어북 항목의 물음 한 줄: 문장 뒤에 sticky:3 같은 수식어를 붙여 쓸 수 있다 (따옴표는 없어도 된다) */
export function parseLine(line: string): AskSite | null {
  const s = String(line || '').trim(); if (!s) return null;
  const viaAsk = findAsks(/^ask\s*:/i.test(s) ? s : QUOTES[s[0]] ? 'ask:' + s : ''); if (viaAsk.length) return { stmt: viaAsk[0].stmt, mods: viaAsk[0].mods };
  const mods: AskMods = {}; let rest = s;
  for (;;) {
    const n = /\s+(sticky|cooldown|every)\s*:\s*(\d+)\s*$/i.exec(rest); if (!n) break;
    if (+n[2] > 0) mods[n[1].toLowerCase() as 'sticky' | 'cooldown' | 'every'] = Math.min(999, +n[2]); rest = rest.slice(0, n.index);
  }
  return rest.trim() ? { stmt: rest.trim(), mods } : null;
}

// ════════ 타이머 ════════
// 턴(T) = 지금 쓰려는 답변 앞에 이미 있는 답변의 수. 새 답변이 쌓여야 늘고, 스와이프 · 다시 쓰기로는 늘지 않고, 지우면 줄어든다.
export type Plan =
  | { kind: 'held'; left: number; s: SiteState }                 // sticky 로 유지 중 — 묻지 않는다
  | { kind: 'until'; ask: string; s: SiteState }                 // 유지 중이고, 끝내는 문장을 묻는다
  | { kind: 'cool'; left: number; s: SiteState }                 // 쉬는 중 — 묻지 않고 거짓
  | { kind: 'every'; left: number; s: SiteState }                // 주기가 안 됨 — 지난 답을 그대로
  | { kind: 'ask'; ask: string; s: SiteState };                  // 묻는다
const bare = (s: SiteState): SiteState => ({ at: s.at, v: s.v, on: s.on ?? null, cool: s.cool ?? null, asked: s.asked ?? null });
/** 이 턴을 시작할 때의 기록: 되감긴 기록은 버리고, 같은 턴을 다시 계산하면 그 턴 앞의 모습으로 돌아간다 */
export function begin(st: SiteState | undefined | null, T: number): SiteState {
  if (!st || st.at > T) return { at: -1, v: false, on: null, cool: null, asked: null };
  if (st.at === T) return st.p ? bare(st.p) : { at: -1, v: false, on: null, cool: null, asked: null };
  return bare(st);
}
/** 이번 턴에 무엇을 알아야 하는가 */
export function plan(st: SiteState | undefined | null, site: AskSite, T: number): Plan {
  const s = begin(st, T), m = site.mods;
  if (s.on != null) {
    if (m.sticky && T <= s.on + m.sticky) return { kind: 'held', left: s.on + m.sticky - T, s };
    if (m.until) return { kind: 'until', ask: m.until, s };
    s.on = null; if (m.cooldown) s.cool = T + m.cooldown - 1;   // 유지가 끝났다: 쉬기는 참이 아니게 된 첫 턴부터 센다
  }
  if (s.cool != null) { if (T <= s.cool) return { kind: 'cool', left: s.cool - T + 1, s }; s.cool = null; }
  if (m.every && s.asked != null && T - s.asked < m.every) return { kind: 'every', left: m.every - (T - s.asked), s };
  return { kind: 'ask', ask: site.stmt, s };
}
export type Tag = 'yes' | 'no' | 'held' | 'cool' | 'every' | 'none';
/** 답(없으면 null)을 받아 이번 턴의 값과 새 기록을 정한다. 답이 없으면 거짓이고 기록은 그대로 둔다 */
export function settle(before: SiteState | undefined | null, site: AskSite, T: number, p: Plan, answer: boolean | null): { v: boolean; tag: Tag; left?: number; st: SiteState } {
  const s = bare(p.s), m = site.mods, prev = begin(before, T);
  let v = false, tag: Tag = 'no', left: number | undefined;
  if (p.kind === 'held') { v = true; tag = 'held'; left = p.left; }
  else if (p.kind === 'cool') { tag = 'cool'; left = p.left; }
  else if (p.kind === 'every') { v = s.v; tag = 'every'; left = p.left; }
  else if (answer === null) tag = 'none';
  else if (p.kind === 'until') {
    if (answer) { s.on = null; if (m.cooldown) s.cool = T + m.cooldown - 1; tag = 'no'; }   // 끝내는 문장이 참: 이번 턴부터 닫힌다
    else { v = true; tag = 'held'; }
  } else {
    s.asked = T; v = answer; tag = answer ? 'yes' : 'no';
    if (answer) { if (m.sticky || m.until) s.on = T; else if (m.cooldown) s.cool = T + m.cooldown; }
  }
  return { v, tag, left, st: { ...s, at: T, v, p: bare(prev) } };
}

// ════════ 모델에게 보내는 목록 · 받은 답 ════════
export interface Check { n: number; kind: 'yn' | 'pick'; text: string; options?: string[] }
export const checksText = (list: Check[]) => list.map(c => c.kind === 'yn' ? `${c.n}. [yes/no] ${c.text}` : `${c.n}. [choice] ${c.text} — options: ${(c.options || []).join(' | ')}`).join('\n');
const yn = (v: unknown): boolean | null => {
  if (v === true || v === 1) return true; if (v === false || v === 0) return false;
  const s = String(v ?? '').trim().toLowerCase().replace(/[."'`*]/g, '');
  return /^(true|yes|y|1|예|네|참)$/.test(s) ? true : /^(false|no|n|0|아니오|아니요|거짓)$/.test(s) ? false : null;
};
/** 모델의 답에서 번호 → 값. JSON 한 덩이가 기본이고, 줄마다 "1. yes" 처럼 쓴 답도 읽는다. 읽지 못한 번호는 빠진다 */
export function parseVerdict(text: string, list: Check[]): Record<number, boolean | string | null> {
  const out: Record<number, boolean | string | null> = {}, byN = new Map(list.map(c => [c.n, c]));
  const put = (k: unknown, v: unknown) => {
    const c = byN.get(Number(String(k).replace(/[^\d]/g, ''))); if (!c || c.n in out) return;
    if (c.kind === 'yn') { const b = yn(v); if (b !== null) out[c.n] = b; }
    else out[c.n] = matchOption(v, c.options || []);
  };
  const src = String(text || '').replace(/```(?:json)?/gi, ''), a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { const j: unknown = JSON.parse(src.slice(a, b + 1)); if (j && typeof j === 'object' && !Array.isArray(j)) { for (const [k, v] of Object.entries(j)) put(k, v); if (Object.keys(out).length) return out; } } catch { /* 아래에서 줄 단위로 다시 읽는다 */ }
  }
  if (src.trim().startsWith('[')) { try { const j: unknown = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1)); if (Array.isArray(j)) { j.forEach((v, i) => put(list[i]?.n, v)); return out; } } catch { /* 줄 단위로 */ } }
  for (const m of src.matchAll(/["']?(\d+)["']?\s*[.:=)\-–]+\s*("[^"\n]*"|'[^'\n]*'|[^,\n}]+)/g)) put(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
  return out;
}
/** 선택지형 답을 선택지 가운데 하나로 (번호 · 같은 글 · 들어 있는 글). 맞는 것이 없으면 null */
export function matchOption(v: unknown, options: string[]): string | null {
  if (v == null) return null;
  if (typeof v === 'number') return options[v - 1] ?? null;
  const s = String(v).trim().replace(/^["'`]+|["'`.]+$/g, ''), low = s.toLowerCase(); if (!s || /^(null|none|없음)$/i.test(s)) return null;
  const exact = options.find(o => o.trim().toLowerCase() === low); if (exact) return exact;
  if (/^\d+$/.test(s) && options[+s - 1]) return options[+s - 1];
  const inside = options.filter(o => low.includes(o.trim().toLowerCase()) || o.trim().toLowerCase().includes(low));
  return inside.length === 1 ? inside[0] : null;
}
