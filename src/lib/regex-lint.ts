// ── Dreamland 정규식 진단 ── 무엇이 잘못됐는지 짚어 준다. 화면도 저장소도 모르는 계산 (설명 글은 i18n 의 t())
import { t } from '../i18n';

/** 찾기 문장을 /패턴/플래그 로 가른다. 슬래시 꼴이 아니면 통째로 패턴이고 전체 검색(g)이다 — src/lib/engine.ts 의 compileRegex 와 같은 규칙 */
export interface Parsed { source: string; flags: string; slashed: boolean }
export function parseFind(find: unknown): Parsed {
  const s = String(find ?? ''), m = s.match(/^\/([\s\S]+)\/([a-z]*)$/i);
  return m ? { source: m[1], flags: m[2], slashed: true } : { source: s, flags: 'g', slashed: false };
}

// 값은 i18n 키 (쓰는 곳에서 t()). FLAG_INFO 의 키 목록은 쓸 수 있는 플래그를 가리는 데도 쓴다
const FLAG_INFO: Record<string, string> = { g: 'regex.lint.flag.g', i: 'regex.lint.flag.i', m: 'regex.lint.flag.m', s: 'regex.lint.flag.s', u: 'regex.lint.flag.u', y: 'regex.lint.flag.y', d: 'regex.lint.flag.d', v: 'regex.lint.flag.v' };
const FLAG_FOREIGN: Record<string, string> = { x: 'regex.lint.foreign.x', X: '', U: 'regex.lint.foreign.U', A: 'regex.lint.foreign.A', J: 'regex.lint.foreign.J' };
const foreign = (f: string) => (FLAG_FOREIGN[f] ? t(FLAG_FOREIGN[f]) : f);

/** 브라우저마다 다른 오류 문장을 한 가지 설명으로 (값은 i18n 키) */
const ERRORS: [RegExp, string][] = [
  [/unterminated group|missing \)|unterminated parenthetical/i, 'regex.lint.err.unterminatedGroup'],
  [/unmatched '?\)'?|unmatched \) in|unmatched parenthes/i, 'regex.lint.err.unmatchedParen'],
  [/nothing to repeat/i, 'regex.lint.err.nothingToRepeat'],
  [/unterminated character class|missing terminating \]/i, 'regex.lint.err.unterminatedClass'],
  [/range out of order|invalid range in character class/i, 'regex.lint.err.rangeOrder'],
  [/numbers out of order/i, 'regex.lint.err.numbersOrder'],
  [/invalid capture group name|invalid group specifier name/i, 'regex.lint.err.groupName'],
  [/duplicate capture group name|duplicate group specifier name/i, 'regex.lint.err.dupGroupName'],
  [/invalid named reference|invalid named capture referenced/i, 'regex.lint.err.namedRef'],
  [/invalid group|invalid regexp group|unrecognized character after \(\?/i, 'regex.lint.err.invalidGroup'],
  [/lone quantifier brackets|raw brace is not allowed|incomplete quantifier/i, 'regex.lint.err.brace'],
  [/\\ at end of pattern/i, 'regex.lint.err.trailingBackslash'],
  [/invalid unicode escape|invalid escape|invalid identity escape|invalid property name|invalid unicode property/i, 'regex.lint.err.escape'],
  [/invalid character class|invalid class set|invalid set operation/i, 'regex.lint.err.classSet'],
  [/too large|stack overflow|too much recursion/i, 'regex.lint.err.tooLarge'],
  [/invalid flags/i, 'regex.lint.err.flags'],
];
export function explainError(message: unknown): string {
  const tail = String(message || '').replace(/^Invalid regular expression:\s*/i, '').replace(/^\/[\s\S]*\/[a-z]*:\s*/i, '');
  for (const [re, key] of ERRORS) if (re.test(tail) || re.test(String(message))) return t(key);
  return t('regex.lint.err.unknown', { detail: tail || message });
}

/** 패턴을 훑어 괄호 · 대괄호의 짝과 그룹 이름, 겹친 되풀이를 찾는다 */
export interface Scan { at: number; what: string; nested: number; names: string[]; groups: number; dot: boolean; anchor: boolean; tops: number[] }
interface OpenGroup { at: number; inf: boolean; capture: boolean }
export function scanSource(source: unknown): Scan {
  const s = String(source), stack: OpenGroup[] = [], names: string[] = [], out: Scan = { at: -1, what: '', nested: -1, names, groups: 0, dot: false, anchor: false, tops: [] };
  let inClass = -1, lastGroupInf = false, i = 0;
  const markInf = () => { for (const g of stack) g.inf = true; };
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; lastGroupInf = false; continue; }
    if (inClass >= 0) { if (c === ']') inClass = -1; continue; }
    if (c === '[') { inClass = i; lastGroupInf = false; continue; }
    if (c === '(') {
      const g: OpenGroup = { at: i, inf: false, capture: true };
      if (s[i + 1] === '?') { const m = s.slice(i).match(/^\(\?<([^=!>][^>]*)>/); if (m) names.push(m[1]); else g.capture = false; }
      if (g.capture) out.groups++;
      stack.push(g); lastGroupInf = false; continue;
    }
    if (c === ')') {
      const g = stack.pop();
      if (!g) { if (out.at < 0) { out.at = i; out.what = ')'; } lastGroupInf = false; continue; }
      lastGroupInf = g.inf; if (!stack.length) out.tops.push(i + 1);
      continue;
    }
    if (c === '*' || c === '+' || (c === '{' && /^\{\d+,\}/.test(s.slice(i)))) {
      if (lastGroupInf && out.nested < 0) out.nested = i;
      markInf(); lastGroupInf = false;
      if (c === '{') i = s.indexOf('}', i);
      if (s[i + 1] === '?') i++;
      if (!stack.length) out.tops.push(i + 1);
      continue;
    }
    if (c === '.') out.dot = true;
    if (c === '^' || c === '$') out.anchor = true;
    lastGroupInf = false;
    if (!stack.length && c !== '?' && c !== '|') out.tops.push(i + 1);
  }
  if (out.at < 0 && inClass >= 0) { out.at = inClass; out.what = '['; }
  if (out.at < 0 && stack.length) { out.at = stack[stack.length - 1].at; out.what = '('; }
  return out;
}

export type Level = 'error' | 'warn' | 'info';
export interface Issue { level: Level; msg: string; at?: number }
const issue = (level: Level, msg: string, extra?: { at: number }): Issue => ({ level, msg, ...extra });
export interface Lint { ok: boolean; source: string; flags: string; slashed: boolean; re: RegExp | null; groups: number; names: string[]; issues: Issue[]; flagNotes: string[] }
/**
 * 찾기 문장 진단. { ok, source, flags, slashed, re, groups, names, issues[{ level: 'error'|'warn'|'info', msg, at }] , flagNotes[] }
 * at 은 패턴 안에서 문제가 있는 글자 자리(0부터). 없으면 -1.
 */
export function lintFind(find: unknown): Lint {
  const raw = String(find ?? ''), { source, flags, slashed } = parseFind(raw), issues: Issue[] = [];
  const res: Lint = { ok: false, source, flags, slashed, re: null, groups: 0, names: [], issues, flagNotes: [] };
  if (!raw) { issues.push(issue('info', t('regex.lint.emptyFind'))); return res; }
  if (!slashed && raw.startsWith('/') && raw.length > 1) issues.push(issue('warn', t('regex.lint.slashUnclosed')));
  // 플래그
  const bad = [...new Set([...flags].filter(f => !FLAG_INFO[f]))], dup = [...new Set([...flags].filter((f, i) => flags.indexOf(f) !== i))];
  if (bad.length) issues.push(issue('error', t(bad.some(f => f in FLAG_FOREIGN) ? 'regex.lint.badFlagsForeign' : 'regex.lint.badFlags', { flags: bad.map(foreign).join(', ') })));
  if (dup.length) issues.push(issue('error', t('regex.lint.dupFlags', { flags: dup.join(', ') })));
  if (flags.includes('u') && flags.includes('v')) issues.push(issue('error', t('regex.lint.uv')));
  const scan = scanSource(source);
  res.names = scan.names;
  if (issues.some(x => x.level === 'error')) return res;
  try { res.re = new RegExp(source, flags); }
  catch (err) {
    const e = err as Error;
    const where = scan.at >= 0 ? t('regex.lint.where', { n: scan.at + 1, what: scan.what }) : '';
    issues.push(issue('error', explainError(e.message) + where, { at: scan.at }));
    if (/nothing to repeat/i.test(e.message) && /(^|[^\\])\*[^*\n]+\*/.test(source)) issues.push(issue('info', t('regex.lint.markdownStar')));
    return res;
  }
  res.ok = true;
  try { res.groups = (new RegExp(source + '|', flags.replace(/[gy]/g, '')).exec('') as RegExpExecArray).length - 1; } catch { res.groups = scan.groups; }
  // 플래그가 뜻하는 것
  res.flagNotes.push(flags.includes('g') ? t('regex.lint.flag.g') : t('regex.lint.flag.noG'), flags.includes('i') ? t('regex.lint.flag.i') : t('regex.lint.flag.noI'));
  for (const f of 'msuyv') if (flags.includes(f)) res.flagNotes.push(t(FLAG_INFO[f]));
  if (slashed && !flags.includes('g')) issues.push(issue('info', t('regex.lint.noG')));
  // 위험 · 흔한 실수
  if (scan.nested >= 0) issues.push(issue('warn', t('regex.lint.nested', { n: scan.nested + 1 }), { at: scan.nested }));
  let empty = false; try { empty = new RegExp(source, flags.replace(/[gy]/g, '')).exec('') !== null; } catch { }
  if (empty) issues.push(issue('warn', t('regex.lint.matchesEmpty')));
  if (scan.dot && !flags.includes('s') && /\.[*+]/.test(source)) issues.push(issue('info', t('regex.lint.dotNewline')));
  if (scan.anchor && !flags.includes('m') && /(^|[^\\[])(\^|\$)/.test(source)) issues.push(issue('info', t('regex.lint.anchorM')));
  if (flags.includes('y')) issues.push(issue('info', t('regex.lint.sticky')));
  return res;
}

/** 스크립트 전체 진단 (찾기 + 바꾸기 · 대상 · 깊이 · 매크로의 어긋남). lintFind 의 결과에 issues 를 덧붙여 돌려준다 */
export interface ScriptLike { find?: unknown; replace?: unknown; trim?: unknown; onUser?: unknown; onAI?: unknown; onSlash?: unknown; onLore?: unknown; onReason?: unknown; mode?: unknown; subst?: unknown; minDepth?: unknown; maxDepth?: unknown; runOnEdit?: unknown }
export function lintScript(r: ScriptLike): Lint {
  const res = lintFind(r?.find), is = res.issues, rep = String(r?.replace ?? ''), find = String(r?.find ?? '');
  const num = (v: unknown) => (v == null || v === '' || isNaN(+v) ? null : +v);
  if (!r.onUser && !r.onAI && !r.onSlash && !r.onLore && !r.onReason) is.push(issue('warn', t('regex.lint.noTarget')));
  if (res.ok) {
    const nums = [...rep.matchAll(/\$(\d+)/g)].map(m => +m[1]).filter(n => n > res.groups);
    if (nums.length) is.push(issue('warn', t(res.groups === 0 ? 'regex.lint.groupRefNone' : 'regex.lint.groupRef', { refs: [...new Set(nums)].map(n => '$' + n).join(', '), groups: res.groups })));
    const miss = [...rep.matchAll(/\$<([^>]+)>/g)].map(m => m[1]).filter(n => !res.names.includes(n));
    if (miss.length) is.push(issue('warn', t('regex.lint.namedMissing', { name: miss[0] })));
  }
  if (/\$&|\$`|\$'/.test(rep)) is.push(issue('info', t('regex.lint.dollarSpecial')));
  const trims = Array.isArray(r.trim) ? (r.trim as unknown[]).filter(Boolean) : [];
  if (trims.length && !/\$\d+|\$<[^>]+>|\{\{match\}\}/i.test(rep)) is.push(issue('info', t('regex.lint.trimNoCapture')));
  if (find.includes('{{') && Number(r.subst ?? 1) === 0) is.push(issue('warn', t('regex.lint.macroNoSubst')));
  if (find.includes('{{') && Number(r.subst ?? 1) === 1) is.push(issue('info', t('regex.lint.macroRaw')));
  const lo = num(r.minDepth), hi = num(r.maxDepth);
  if (lo !== null && hi !== null && hi >= 0 && lo > hi) is.push(issue('warn', t('regex.lint.depthOrder', { min: lo, max: hi })));
  if (r.mode === 'store' && (lo !== null || hi !== null)) is.push(issue('info', t('regex.lint.depthStore')));
  if (r.onLore && r.mode !== 'prompt' && r.mode !== 'both') is.push(issue('warn', t('regex.lint.loreMode')));
  if (r.runOnEdit && r.mode !== 'store') is.push(issue('info', t('regex.lint.runOnEdit')));
  return res;
}

/** 시험 입력에서 하나도 못 찾았을 때 짚어 줄 까닭들 (문자열 배열). lint 는 lintFind/lintScript 의 결과 */
export function whyNoMatch(lint: Pick<Lint, 'ok' | 'source' | 'flags'> | null | undefined, sample: unknown): string[] {
  const out: string[] = [], text = String(sample ?? '');
  if (!lint?.ok || !text) return out;
  const { source, flags } = lint, count = (src: string, fl: string) => { try { return [...text.matchAll(new RegExp(src, fl.includes('g') ? fl : fl + 'g'))].filter(m => m[0] !== '').length; } catch { return 0; } };
  const tryFlag = (f: string, why: string) => { if (flags.includes(f)) return; const n = count(source, flags + f); if (n) out.push(t('regex.lint.why.tryFlag', { why: t(why), flag: f, count: n })); };
  tryFlag('i', 'regex.lint.why.case');
  if (/\./.test(source)) tryFlag('s', 'regex.lint.why.multiline');
  if (/[\^$]/.test(source)) tryFlag('m', 'regex.lint.why.anchor');
  if (/["']/.test(source) && /[“”‘’「」『』]/.test(text)) { const n = count(source.replace(/"/g, '["“”]').replace(/'/g, "['‘’]"), flags); out.push(n ? t('regex.lint.why.curlyInTextN', { count: n }) : t('regex.lint.why.curlyInText')); }
  if (/[“”‘’]/.test(source) && /["']/.test(text) && !/[“”‘’]/.test(text)) out.push(t('regex.lint.why.curlyInPattern'));
  if (/ /.test(source)) { const n = count(source.replace(/ +/g, '\\s+'), flags); if (n) out.push(t('regex.lint.why.spaces', { count: n })); }
  // 패턴 앞에서부터 어디까지 맞는지
  if (!out.length) {
    const tops = scanSource(source).tops.filter(n => n < source.length).reverse().slice(0, 80);
    for (const n of tops) {
      const head = source.slice(0, n);
      let hit: RegExpExecArray | null = null; try { hit = new RegExp(head, flags.replace(/[gy]/g, '')).exec(text); } catch { continue; }
      if (hit && hit[0]) { out.push(t('regex.lint.why.partial', { head: clip(head), hit: clip(hit[0], 40), rest: clip(source.slice(n)) })); break; }
    }
    if (!out.length) out.push(t('regex.lint.why.fromStart'));
  }
  return out;
}
const clip = (v: unknown, n = 36) => { const s = String(v).replace(/\n/g, '⏎'); return s.length > n ? s.slice(0, n) + '…' : s; };

/** 건너뛴 까닭을 한 줄 설명으로 (값은 i18n 키 — skipText() 로 꺼낸다) */
export const SKIP_TEXT: Record<string, string> = {
  off: 'regex.skip.off', nofind: 'regex.skip.nofind', place: 'regex.skip.place', mode: 'regex.skip.mode', edit: 'regex.skip.edit', min: 'regex.skip.min', max: 'regex.skip.max',
  'scope:char': 'regex.skip.scopeChar', 'scope:preset': 'regex.skip.scopePreset', 'blocked:char': 'regex.skip.blockedChar', 'blocked:preset': 'regex.skip.blockedPreset',
  badregex: 'regex.skip.badregex', hang: 'regex.skip.hang',
};
export const skipText = (code: string) => (SKIP_TEXT[code] ? t(SKIP_TEXT[code]) : code);
const WHO_KO: Record<string, string> = { user: 'regex.who.user', ai: 'regex.who.ai', slash: 'regex.who.slash', lore: 'regex.who.lore', reason: 'regex.who.reason' };
const MODE_KO: Record<string, string> = { display: 'regex.mode.display', prompt: 'regex.mode.prompt', both: 'regex.skip.modeBoth', store: 'regex.mode.store' };
const TARGET_KO: Record<string, string> = { display: 'regex.target.display', prompt: 'regex.target.prompt', store: 'regex.skip.targetStore' };
const tk = (map: Record<string, string>, k: unknown) => (typeof k === 'string' && map[k] ? t(map[k]) : undefined);
/** 건너뛴 까닭을 스크립트 설정과 견줘 풀어 쓴다 */
export interface SkipEnv { who?: string; target?: string; depth?: number }
type SkipScript = ScriptLike & { [k: string]: unknown };
export function skipDetail(code: string, r: SkipScript | null | undefined, env: SkipEnv = {}): string {
  const ON: Record<string, string> = { user: 'onUser', ai: 'onAI', slash: 'onSlash', lore: 'onLore', reason: 'onReason' };
  const on = ['user', 'ai', 'slash', 'lore', 'reason'].filter(w => r?.[ON[w]]).map(w => t(WHO_KO[w]));
  switch (code) {
    case 'place': return t('regex.skip.d.place', { who: tk(WHO_KO, env.who) || t('regex.who.ai'), targets: on.length ? on.join(' · ') : t('common.none') });
    case 'mode': return t('regex.skip.d.mode', { target: tk(TARGET_KO, env.target) || env.target, mode: tk(MODE_KO, r?.mode) || r?.mode });
    case 'min': return t('regex.skip.d.min', { depth: env.depth, min: r?.minDepth });
    case 'max': return t('regex.skip.d.max', { depth: env.depth, max: r?.maxDepth });
    case 'edit': return t('regex.skip.d.edit');
    case 'off': return t('regex.skip.d.off');
    case 'nofind': return t('regex.skip.d.nofind');
    case 'blocked:char': return t('regex.skip.d.blockedChar');
    case 'blocked:preset': return t('regex.skip.d.blockedPreset');
    case 'scope:char': return t('regex.skip.d.scopeChar');
    case 'scope:preset': return t('regex.skip.d.scopePreset');
    case 'badregex': return t('regex.skip.d.badregex');
    case 'hang': return t('regex.skip.d.hang');
    default: return skipText(code);
  }
}

/** 찾은 곳을 기준으로 원문을 조각낸다: [{ t, hit, i }] (hit 이면 i 번째로 찾은 곳) */
export interface MatchLike { index: number; match: string; out: string }
export interface HitPart { t: string; hit: boolean; i?: number }
export type DiffPart = { t: string } | { t?: undefined; del: string; ins: string; i: number };
export function hitParts(text: string, matches: MatchLike[] | null | undefined): HitPart[] {
  const out: HitPart[] = []; let at = 0;
  (matches || []).forEach((m, i) => {
    if (m.index < at) return;
    if (m.index > at) out.push({ t: text.slice(at, m.index), hit: false });
    out.push({ t: m.match, hit: true, i }); at = m.index + m.match.length;
  });
  if (at < text.length) out.push({ t: text.slice(at), hit: false });
  return out;
}
/** 바뀐 곳 보기: [{ t } | { del, ins, i }] — 그대로인 글과, 지워진 글(del) · 들어간 글(ins) 짝 */
export function diffParts(text: string, matches: MatchLike[] | null | undefined): DiffPart[] {
  return hitParts(text, matches).map(p => (p.hit ? { del: p.t, ins: (matches as MatchLike[])[p.i as number].out, i: p.i as number } : { t: p.t }));
}
/** 글자 수 변화 요약 */
export function tally(matches: Pick<MatchLike, 'match' | 'out'>[] | null | undefined) {
  let found = 0, removed = 0, added = 0;
  for (const m of matches || []) { found++; removed += m.match.length; added += m.out.length; }
  return { found, removed, added };
}
