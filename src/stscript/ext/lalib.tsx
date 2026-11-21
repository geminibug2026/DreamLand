// ── LALib 명령 묶음 (1): 식 · 흐름 · 목록 · 글자 · 정규식 · 구조 자료 · 예외 · 빈 값 · 비동기 · 기록 ──
// 실리태번 확장 LALib(LenAnderson)를 깐 실리태번과 같은 이름 · 같은 인자 · 같은 결과가 되도록 설명서와 동작을 보고 새로 짰다.
// 대화 · 로어북 · 퀵 리플라이 · 화면에 닿는 명령은 lalib-app.tsx
// 실리태번처럼 이름 없는 값을 낱말 · "따옴표" · [목록] · {사전} · 닫힌 블록으로 나눠 받는 명령이 있다 (splitArgs)
import { t } from '../../i18n';
import { openModal } from '../../ui';
import { Abort, COMMANDS, Scope, callClosure, def, evalValue, expand, isBound, isSignal, runCmds, str, type Args, type Bound, type Ctx, type Val } from '../run';
import { parse, type Part, type Value } from '../parse';
import { compile, ExprError, type ExprEnv } from '../expr';

// ════════ 도움 ════════
export const N = (a: Args, k: string, d = '') => a.named[k] === undefined ? d : str(a.named[k]);
const has = (a: Args, k: string) => a.named[k] !== undefined;
/** 실리태번 isTrueBoolean */
export const isTrue = (s: unknown) => ['on', 'true'].includes(String(s ?? '').trim().toLowerCase());
export const isFalse = (s: unknown) => ['off', 'false'].includes(String(s ?? '').trim().toLowerCase());
/** LALib 의 깃발: 없으면 거짓, 값 없이(name=) 쓰면 참 */
export const flag = (a: Args, k: string) => has(a, k) && isTrue(N(a, k) || 'true');
export const tx = (k: string, o?: Record<string, unknown>) => t('st.x.lalib.' + k, o);
export const fail = (k: string, o?: Record<string, unknown>): never => { throw new Error(tx(k, o)); };
export const jsonOf = (s: unknown): unknown => { if (typeof s !== 'string') return s; try { return JSON.parse(s); } catch { return undefined; } };
/** 결과를 파이프 글자로: 글자는 그대로, 없으면 빈 글자, 나머지는 JSON */
export const out = (v: unknown): Val => typeof v === 'string' ? v : v === undefined || v === null ? '' : isBound(v) ? v : JSON.stringify(v);
const isObj = (v: unknown): v is object => v !== null && typeof v === 'object';
/** LALib getListVar: 대화 변수 → 전역 변수 → 글자(JSON 목록 · 사전) 순으로 목록 · 사전을 찾는다 */
export function listVar(c: Ctx, local?: string, global?: string, literal?: unknown): unknown {
  const parse = (s: string | undefined) => { const j = jsonOf(s); return isObj(j) ? j : undefined; };
  let l: unknown;
  if (local) l = parse(c.host.getVar(local));
  if (!l && global) l = parse(c.host.getGlobal(global));
  if (!l && literal != null) l = isObj(literal) && !isBound(literal) ? literal : parse(typeof literal === 'string' ? literal : undefined);
  return l;
}
/** 목록 · 사전 → [열쇠, 값] (목록이면 번호가 열쇠) */
const entriesOf = (l: unknown): [string | number, unknown][] | null => Array.isArray(l) ? l.map((x, i) => [i, x]) : isObj(l) ? Object.entries(l) : null;
const asArg = (v: unknown) => typeof v === 'string' ? v : JSON.stringify(v);

// ── 이름 없는 값 나누기 (실리태번 splitUnnamedArgument) ──
type Tok = string | Bound;
/** 글 하나에서 첫 낱말: "따옴표" · [목록] · {사전} · {{매크로}} 를 한 덩이로 */
function firstWord(s: string, i: number): { raw: string; quoted: boolean; end: number } {
  if (s[i] === '"') {
    let j = i + 1, raw = '';
    for (; j < s.length && s[j] !== '"'; j++) { if (s[j] === '\\' && (s[j + 1] === '"' || s[j + 1] === '\\')) { raw += s[++j]; continue; } raw += s[j]; }
    return { raw, quoted: true, end: Math.min(s.length, j + 1) };
  }
  if (s[i] === '[' || (s[i] === '{' && s[i + 1] !== '{')) {
    let depth = 0, q = false, j = i;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (q) { if (ch === '\\') j++; else if (ch === '"') q = false; continue; }
      if (ch === '"') q = true; else if (ch === '[' || ch === '{') depth++; else if ((ch === ']' || ch === '}') && --depth === 0) { j++; break; }
    }
    return { raw: s.slice(i, j), quoted: false, end: j };
  }
  let j = i;
  while (j < s.length && !/\s/.test(s[j])) {
    if (s.startsWith('{{', j)) { let d = 0; for (; j < s.length; j++) { if (s.startsWith('{{', j)) { d++; j++; } else if (s.startsWith('}}', j)) { d--; j++; if (!d) { j++; break; } } } continue; }
    j++;
  }
  return { raw: s.slice(i, j), quoted: false, end: j };
}
/** 이름 없는 값의 원문(매크로를 바꾸기 전)을 낱말로 나눈다. max 개가 차면 나머지는 한 덩이 */
function splitRaw(v: Value, max = Infinity): Part[] {
  const toks: Part[] = [];
  for (const p of v) {
    if (typeof p !== 'string') { toks.push(p); continue; }
    let i = 0;
    for (; ;) {
      while (i < p.length && /\s/.test(p[i])) i++;
      if (i >= p.length) break;
      if (toks.length >= max) { const r = p.slice(i).trimEnd(), w = firstWord(r, 0); toks.push(w.quoted && w.end >= r.length ? w.raw : r); break; }
      const w = firstWord(p, i); toks.push(w.raw); i = w.end;
    }
  }
  return toks;
}
/** 나눈 낱말마다 매크로를 바꾼다. 이름 없는 값을 적지 않았으면 앞 결과({{pipe}}) 하나 */
export async function splitArgs(a: Args, c: Ctx, max?: number): Promise<Tok[]> {
  if (!a.cmd.unnamed.length) return a.parts as Tok[];
  const out: Tok[] = [];
  for (const p of splitRaw(a.cmd.unnamed, max)) out.push(await evalValue([p], c) as Tok);
  return out;
}
/** 첫 낱말(목록 · 변수 이름)과 그 뒤 (닫힌 블록 하나 또는 식 글자) */
interface HeadRest { head: Tok | undefined; body: Bound | null; text: string }
async function headRest(a: Args, c: Ctx): Promise<HeadRest> {
  if (!a.cmd.unnamed.length) return { head: a.parts[0] as Tok | undefined, body: null, text: '' };
  const v = a.cmd.unnamed;
  let k = 0, head: Part | undefined, restFirst = '';
  for (; k < v.length; k++) {
    const p = v[k];
    if (typeof p !== 'string') { head = p; k++; break; }
    const i = p.search(/\S/); if (i < 0) continue;
    const w = firstWord(p, i); head = w.raw; restFirst = p.slice(w.end); k++; break;
  }
  const rest: Part[] = [...(restFirst.trim() ? [restFirst] : []), ...v.slice(k)];
  const cl = rest.find(p => typeof p !== 'string');
  const raw = rest.filter((p): p is string => typeof p === 'string').join(' ').trim();
  // 닫힌 블록이 없으면 글을 바꾼다. 글이 {{var::이름}} 하나이고 그 변수가 닫힌 블록이면 그 블록이 몸통
  const body = cl ? await evalValue([cl], c) : raw ? await evalValue([raw], c) : null;
  const head0 = head === undefined ? undefined : await evalValue([head], c) as Tok;
  if (isBound(body)) return { head: head0, body, text: cl ? expand(raw, c) : '' };
  return { head: head0, body: null, text: body === null ? '' : str(body) };
}
/** 닫힌 블록 · 명령 글 가운데 하나 (try · catch · else · fireandforget …) */
const commandOf = (a: Args): Bound | string => (a.parts.find(isBound) as Bound | undefined) ?? a.parts.map(str).join(' ').trim();

/** 명령 글을 지금 범위에서 돌린다 (실리태번의 executeSlashCommandsWithOptions + scope) */
export const runText = (src: string, c: Ctx, pipe = c.pipe) => runCmds(parse(src), { host: c.host, scope: c.scope, pipe, depth: c.depth + 1 });
/** 닫힌 블록을 함수처럼 부른다: 머리에 적은 이름 차례로 값을 넣고(없으면 defaults 이름), /return 은 그 블록의 결과 */
export async function callFn(b: Bound, c: Ctx, values: string[], defaults: string[] = [], macros?: Record<string, string>, pipe = c.pipe): Promise<string> {
  const names = b.closure.args.map(x => x.split('=')[0]);
  const args: Record<string, string> = {};
  values.forEach((v, i) => { const k = names[i] ?? defaults[i]; if (k) args[k] = v; });
  try { return await callClosure(b, c, args, pipe, macros); } catch (e) { if (isSignal(e, 'return')) return e.value; throw e; }
}
/** 되풀이 몸통 하나를 돈다. 'break' 면 null */
async function iter(fn: () => Promise<string>): Promise<{ v: string } | null> {
  try { return { v: await fn() }; } catch (e) { if (isSignal(e, 'break')) return null; throw e; }
}

// ── 식의 변수 ──
/** 식이 읽고 쓰는 변수: 명령에 넘긴 이름 붙은 값(+ pipe) → 범위 → 대화 → 전역. 대화 · 전역에 넣는 것은 끝나고 기다린다 */
export interface Env extends ExprEnv { local: Scope; pending: Promise<unknown>[]; flush(): Promise<void> }
export function exprEnv(a: Args | null, c: Ctx, extra: Record<string, Val> = {}): Env {
  const local = new Scope(c.scope), pending: Promise<unknown>[] = [];
  local.let('pipe', c.pipe);
  if (a) for (const [k, v] of Object.entries(a.named)) if (!k.startsWith('_')) local.let(k, v);
  for (const [k, v] of Object.entries(extra)) local.let(k, v);
  const raw = (k: string): unknown => local.vars.has(k) ? local.vars.get(k) : c.scope.get(k) ?? c.host.getVar(k) ?? c.host.getGlobal(k);
  return {
    local, pending,
    get: raw,
    isClosure: isBound,
    macro: text => expand(text, { ...c, scope: local }),
    set(name, value, kind) {
      const [base, ...path] = name.split('.');
      const where = kind === 'step' && local.vars.has(base) ? 'local' : c.scope.has(base) ? 'scope' : c.host.getVar(base) !== undefined ? 'chat' : c.host.getGlobal(base) !== undefined ? 'global' : 'new';
      const cur = where === 'local' ? local.vars.get(base) : where === 'scope' ? c.scope.get(base) : where === 'chat' ? c.host.getVar(base) : where === 'global' ? c.host.getGlobal(base) : undefined;
      const next = path.length ? setPath(isBound(cur) ? undefined : cur as string | undefined, path, value) : value;
      if (where === 'local') local.vars.set(base, next);
      else if (where === 'scope') c.scope.set(base, next);
      else if (where === 'chat') pending.push(Promise.resolve(c.host.setVar(base, next)));
      else if (where === 'global') pending.push(Promise.resolve(c.host.setGlobal(base, next)));
      else c.scope.let(base, next);
    },
    async flush() { await Promise.all(pending.splice(0)); },
  };
}
/** "a.0.b" 같은 경로의 칸에 글자를 넣은 JSON */
function setPath(raw: string | undefined, path: string[], value: string): string {
  let root = jsonOf(raw ?? '');
  if (!isObj(root)) root = Number.isNaN(parseInt(path[0], 10)) ? {} : [];
  let o = root as Record<string, unknown> | unknown[];
  const key = (x: object, k: string) => Array.isArray(x) && /^-?\d+$/.test(k) ? (+k < 0 ? x.length + +k : +k) : k;
  for (let i = 0; i < path.length - 1; i++) {
    const k = key(o, path[i]) as never;
    let next = (o as Record<string, unknown>)[k];
    if (typeof next === 'string') { const j = jsonOf(next); if (isObj(j)) next = j; }
    if (!isObj(next)) next = Number.isNaN(parseInt(path[i + 1], 10)) ? {} : [];
    (o as Record<string, unknown>)[k] = next; o = next as Record<string, unknown>;
  }
  (o as Record<string, unknown>)[key(o, path[path.length - 1]) as never] = value;
  return JSON.stringify(root);
}
/** 식을 읽는다 (잘못 쓴 식은 무엇이 잘못인지 알려 주는 오류) */
export function exprOf(text: string, env: Env): () => unknown {
  try { return compile(text, env); } catch (e) { throw new Error(tx('badExpr', { msg: (e as Error).message })); }
}
export async function runExpr(text: string, env: Env): Promise<unknown> {
  const f = exprOf(text, env);
  let v: unknown; try { v = f(); } catch (e) { if (e instanceof ExprError) throw new Error(tx('badExpr', { msg: e.message })); throw e; }
  await env.flush(); return v;
}
/** 식의 값 → 파이프 글자 */
const exprOut = (v: unknown): Val => v instanceof RegExp ? String(v) : out(v);
/** 참 거짓 판정: 닫힌 블록이면 그 결과가 true 인지, 식이면 그 값 */
async function truth(test: Bound | (() => unknown), c: Ctx, env?: Env): Promise<unknown> {
  if (isBound(test)) return isTrue(await callFn(test, c, []));
  let v: unknown; try { v = test(); } catch (e) { if (e instanceof ExprError) throw new Error(tx('badExpr', { msg: e.message })); throw e; }
  await env?.flush(); return v;
}

// ════════ 도움말 ════════
/** LALib 3.12 의 명령 (설명서 차례) — /lalib? 가 보여 준다 */
export const LALIB = ['lalib?', '=', 'test', 'and', 'or', 'not', 'pop', 'push', 'shift', 'unshift', 'foreach', 'map', 'whilee', 'reduce', 'groupby', 'sorte', 'flatten', 'filter', 'find', 'slice', 'splice', 'shuffle', 'pick', 'reverse', 'dict', 'keys',
  'split', 'join', 'trim', 'pad-start', 'pad-end', 'pad-both', 'diff', 'json-pretty', 'substitute', 'encodeURIComponent', 'decodeURIComponent', 'wordcount', 'sentencecount', 'segment', 're-escape', 're-test', 're-replace', 're-exec',
  'getat', 'setat', 'try', 'catch', 'ifempty', 'ifnullish', 'copy', 'download', 'dom', 'char-get', 'memberpos', 'group-get', 'switch', 'case', 'ife', 'elseif', 'else', 'then', 'wi-list-books', 'wi-list-entries', 'wi-activate', 'wi-trigger',
  'costumes', 'qr-edit', 'qr-add', 'swipes-get', 'swipes-list', 'swipes-count', 'swipes-index', 'swipes-add', 'swipes-del', 'swipes-go', 'swipes-swipe', 'message-edit', 'message-move', 'message-get', 'message-list',
  'chat-list', 'chat-parent', 'message-on', 'message-off', 'message-listeners', 'role-swap', 'timestamp', 'fireandforget', 'console-log', 'console-warn', 'console-error', 'sfx', 'fonts', 'fetch', '$', '$$'];
/** 도움말 창: 명령 목록, 또는 식 문법 */
function showHelp(topic: string) {
  if (topic === 'expressions') {
    openModal({ title: tx('help.exprTitle'), wide: true, body: <div className="help">{EXPR_HELP.map(([k, code]) => <div className="help-row" key={k}><code>{code}</code><span>{tx('help.expr.' + k)}</span></div>)}</div> });
    return;
  }
  // 명령 표 · 번역 키는 작은 글자 이름 (/encodeURIComponent → encodeuricomponent)
  const rows = LALIB.filter(n => COMMANDS.has(n.toLowerCase())), usage = (n: string) => t('st.args.' + n.toLowerCase()) ? ` ${t('st.args.' + n.toLowerCase())}` : '';
  openModal({ title: tx('help.title'), wide: true, body: <div className="help"><p className="dim">{tx('help.intro')}</p>{rows.map(n => <div className="help-row" key={n}><code>{'/' + n + usage(n)}</code><span>{t('st.cmd.' + n.toLowerCase())}</span></div>)}</div> });
}
def('lalib?', { help: '', run: a => { showHelp(str(a.unnamed).trim().toLowerCase()); return ''; } });
const EXPR_HELP: [string, string][] = [
  ['values', "true · false · 'text' · 1.5 · [1,2] · /re/i · {char}"],
  ['vars', 'x · x.0 · x.-1 · x.length · x.a.b · x*.name'],
  ['not', '!x · !(a or b)'],
  ['logic', 'a and b · a xor b · a or b'],
  ['compare', 'a == b · a === b · a != b · a !== b · a < b · a <= b · a > b · a >= b · a <=> b'],
  ['in', "a in b · a not in b · 'x' starts with 'y' · 'x' ends with 'y'"],
  ['type', 'x is string · number · boolean · list · dictionary · closure'],
  ['regex', "/oo$/ == 'foo' · /a\\|b/i in list"],
  ['math', 'a + b · a - b · a * b · a / b · a // b · a % b · a ** b'],
  ['assign', 'x = 1 · x += 1 · x -= 1 · x *= 2 · x /= 2 · x //= 2 · x %= 2 · x **= 2 · x.0 = 1'],
  ['step', '++x · --x · x++ · x--'],
  ['named', "/= v={{pipe}} ('foo' in v)"],
];

// ════════ 참 거짓 ════════
def('=', {
  help: '', run: async (a, c) => {
    const text = a.parts.map(p => isBound(p) ? '' : str(p)).join(' ').trim();
    return exprOut(await runExpr(text, exprEnv(a, c)));
  },
});
def('and', {
  help: '', run: async (a, c) => {
    if (has(a, 'left') && has(a, 'right')) { c.host.echo(tx('deprecatedLR', { cmd: 'and' }), 'warning'); return JSON.stringify(isTrue(N(a, 'left')) && isTrue(N(a, 'right'))); }
    for (const v of await splitArgs(a, c)) if (!isTrue(str(v))) return 'false';
    return 'true';
  },
});
def('or', {
  help: '', run: async (a, c) => {
    if (has(a, 'left') && has(a, 'right')) { c.host.echo(tx('deprecatedLR', { cmd: 'or' }), 'warning'); return JSON.stringify(isTrue(N(a, 'left')) || isTrue(N(a, 'right'))); }
    for (const v of await splitArgs(a, c)) if (isTrue(str(v))) return 'true';
    return 'false';
  },
});
def('not', { help: '', run: a => JSON.stringify(!isTrue(str(a.unnamed))) });
// /test 는 commands.ts (정규식 pattern= 과 비교 left= rule= right= 둘 다)

// ════════ 목록 ════════
/** 변수 이름이면 그 변수(범위 → 대화 → 전역)를 고치고, 아니면 글자 그대로의 목록 */
function listTarget(c: Ctx, target: string): { list: unknown; save: (l: unknown) => Promise<void> | void } {
  const parseList = (s: unknown) => { const j = jsonOf(typeof s === 'string' ? s : ''); if (!Array.isArray(j)) fail('needList', { value: String(s).slice(0, 60) }); return j as unknown[]; };
  if (c.scope.has(target)) return { list: parseList(c.scope.get(target)), save: l => { c.scope.set(target, JSON.stringify(l)); } };
  const lv = c.host.getVar(target); if (lv !== undefined) return { list: parseList(lv), save: async l => { await c.host.setVar(target, JSON.stringify(l)); } };
  const gv = c.host.getGlobal(target); if (gv !== undefined) return { list: parseList(gv), save: async l => { await c.host.setGlobal(target, JSON.stringify(l)); } };
  return { list: parseList(target), save: () => { } };
}
for (const [name, end] of [['pop', 'end'], ['shift', 'start']] as const) def(name, {
  help: '', run: async (a, c) => {
    const { list, save } = listTarget(c, str(a.unnamed).trim()), l = list as unknown[];
    const v = end === 'end' ? l.pop() : l.shift(); await save(l);
    return out(v);
  },
});
for (const [name, end] of [['push', 'end'], ['unshift', 'start']] as const) def(name, {
  help: '', run: async (a, c) => {
    const [target, ...items] = await splitArgs(a, c);
    const { list, save } = listTarget(c, str(target ?? '').trim()), l = list as unknown[], add = items.map(str);
    if (end === 'end') l.push(...add); else l.unshift(...add);
    await save(l); return JSON.stringify(l);
  },
});
/** foreach · map 공용: 목록 · 사전과 몸통(닫힌 블록 또는 명령 글) */
interface LoopArgs { list: [string | number, unknown][]; isList: boolean; body: Bound | string }
async function loopArgs(a: Args, c: Ctx, cmd: string): Promise<LoopArgs> {
  let l: unknown, body: Bound | string;
  if (has(a, 'var') || has(a, 'globalvar') || has(a, 'list')) {
    c.host.echo(tx('deprecatedVar', { cmd }), 'warning');
    l = listVar(c, N(a, 'var'), N(a, 'globalvar'), a.named.list === undefined ? undefined : str(a.named.list));
    body = commandOf(a);
  } else {
    const h = await headRest(a, c);
    l = listVar(c, undefined, undefined, h.head); body = h.body ?? h.text;
  }
  const list = entriesOf(l); if (!list) fail('needListDict', { cmd });
  return { list: list as [string | number, unknown][], isList: Array.isArray(l), body };
}
/** 한 칸 돌리기: 닫힌 블록이면 item · index (또는 머리에 적은 이름), 명령 글이면 {{item}} · {{index}} 를 바꿔서 */
const runItem = (body: Bound | string, c: Ctx, item: string, index: string, pipe?: string) => isBound(body)
  ? callFn(body, c, [item, index], ['item', 'index'], { item, index }, pipe)
  : runText(body.replace(/\{\{item\}\}/gi, item).replace(/\{\{index\}\}/gi, index), c, pipe);
def('foreach', {
  help: '', run: async (a, c) => {
    const { list, body } = await loopArgs(a, c, 'foreach');
    let result = '';
    for (const [k, v] of list) { const r = await iter(() => runItem(body, c, asArg(v), String(k))); if (!r) break; result = r.v; }
    return result;
  },
});
def('map', {
  help: '', run: async (a, c) => {
    const { list, isList, body } = await loopArgs(a, c, 'map');
    const res: Record<string, unknown> = {}, arr: unknown[] = [];
    for (const [k, v] of list) {
      const r = await iter(() => runItem(body, c, asArg(v), String(k))); if (!r) break;
      const j = jsonOf(r.v), val = j === undefined ? r.v : j;
      if (isList) arr[k as number] = val; else res[k] = val;
    }
    if (isList) return JSON.stringify(arr);
    return JSON.stringify(flag(a, 'aslist') || flag(a, 'asList') ? Object.values(res) : res);
  },
});
/** 시험 몸통: 닫힌 블록, 또는 식 (item · index 가 변수) */
async function testArgs(a: Args, c: Ctx, cmd: string) {
  let l: unknown, body: Bound | null = null, text = '';
  if (has(a, 'var') || has(a, 'globalvar') || has(a, 'list')) {
    c.host.echo(tx('deprecatedVar', { cmd }), 'warning');
    l = listVar(c, N(a, 'var'), N(a, 'globalvar'), a.named.list === undefined ? undefined : str(a.named.list));
    const b = commandOf(a); if (isBound(b)) body = b; else text = b;
  } else { const h = await headRest(a, c); l = listVar(c, undefined, undefined, h.head); body = h.body; text = h.text; }
  const list = entriesOf(l); if (!list) fail('needListDict', { cmd });
  return { l, list: list as [string | number, unknown][], isList: Array.isArray(l), body, text };
}
/** 칸 하나가 맞는지: 닫힌 블록 → 그 결과, 식 → 그 값, 둘 다 아니면 명령 글 */
async function matches(a: Args, c: Ctx, body: Bound | null, text: string, item: string, index: string | number, asExpr: boolean): Promise<boolean | null> {
  if (body) { const r = await iter(() => callFn(body, c, [item, String(index)], ['item', 'index'], { item, index: String(index) })); return r ? isTrue(r.v) : null; }
  if (asExpr) { const env = exprEnv(a, c, { item, index: String(index) }); const v = await runExpr(text, env); return isTrue(String(v)); }
  return isTrue(await runText(text.replace(/\{\{item\}\}/gi, item).replace(/\{\{index\}\}/gi, String(index)), c));
}
def('filter', {
  help: '', run: async (a, c) => {
    const { list, isList, body, text } = await testArgs(a, c, 'filter');
    if (!body && !text) fail('needTest', { cmd: 'filter' });
    const arr: unknown[] = [], res: Record<string, unknown> = {};
    for (const [k, v] of list) {
      const ok = await matches(a, c, body, text, asArg(v), k, !has(a, 'var') && !has(a, 'globalvar') && !has(a, 'list')); if (ok === null) break;
      if (ok) { if (isList) arr.push(v); else res[k] = v; }
    }
    return JSON.stringify(isList ? arr : res);
  },
});
def('find', {
  help: '', run: async (a, c) => {
    const { list, body, text } = await testArgs(a, c, 'find');
    if (!body && !text) fail('needTest', { cmd: 'find' });
    const rows = flag(a, 'last') ? [...list].reverse() : list;
    for (const [k, v] of rows) {
      const item = asArg(v);
      const ok = await matches(a, c, body, text, item, k, !has(a, 'var') && !has(a, 'globalvar') && !has(a, 'list')); if (ok === null) break;
      if (ok) return flag(a, 'index') ? String(k) : item;
    }
    return '';
  },
});
def('whilee', {
  help: '', noPipe: true, run: async (a, c) => {
    const run = [...a.parts].reverse().find(isBound) as Bound | undefined;
    if (!run) fail('needClosure', { cmd: 'whilee' });
    const first = a.parts.find(p => isBound(p) || str(p).trim());
    let test: Bound | (() => unknown), env: Env | undefined;
    if (isBound(first) && first !== run) test = first;
    else {
      const text = a.parts.filter(p => !isBound(p)).map(str).join(' ').trim();
      env = exprEnv(a, c); test = exprOf(text, env);
    }
    let result = '', n = 0;
    while (await truth(test, c, env)) {
      if (c.host.stopped?.()) throw new Abort(true);
      if (++n % 200 === 0) await new Promise(r => setTimeout(r, 0));   // 끝없는 되풀이에서도 화면이 멈추지 않게
      // /break 값이 있으면 그것이 결과 (LALib 의 /whilee 는 멈춘 블록의 결과를 돌려준다)
      try { result = await callFn(run as Bound, c, []); } catch (e) { if (isSignal(e, 'break')) { result = e.value; break; } throw e; }
    }
    return result;
  },
});
def('reduce', {
  help: '', run: async (a, c) => {
    const h = await headRest(a, c), l = listVar(c, undefined, undefined, h.head);
    if (!Array.isArray(l)) fail('needList', { value: str(h.head ?? '').slice(0, 60) });
    if (!h.body) fail('needClosure', { cmd: 'reduce' });
    const list = l as unknown[], fn = h.body as Bound;
    let acc: unknown, start = 0;
    if (has(a, 'initial')) acc = str(a.named.initial);
    else { if (!list.length) fail('reduceEmpty'); acc = list[0]; start = 1; }
    for (let i = start; i < list.length; i++) acc = await callFn(fn, c, [asArg(acc), asArg(list[i]), String(i)]);
    return out(acc);
  },
});
def('groupby', {
  help: '', run: async (a, c) => {
    const h = await headRest(a, c), l = listVar(c, undefined, undefined, h.head);
    if (!Array.isArray(l)) fail('needListDict', { cmd: 'groupby' });
    if (!h.body && !h.text) fail('needTest', { cmd: 'groupby' });
    const env = h.body ? null : exprEnv(a, c, { item: '', index: '' }), f = env ? exprOf(h.text, env) : null;
    const groups: Record<string, unknown[]> = {};
    for (const [i, v] of (l as unknown[]).entries()) {
      let key: unknown;
      if (h.body) key = await callFn(h.body, c, [asArg(v), String(i)], ['item', 'index']);
      else { env!.local.vars.set('item', asArg(v)); env!.local.vars.set('index', String(i)); key = f!(); await env!.flush(); }
      const k = typeof key === 'string' ? key : isObj(key) ? JSON.stringify(key) : String(key);
      (groups[k] ||= []).push(v);
    }
    return JSON.stringify(groups);
  },
});
def('sorte', {
  help: '', run: async (a, c) => {
    const h = await headRest(a, c), name = typeof h.head === 'string' ? h.head.trim() : '';
    let l: unknown, save: ((s: string) => Promise<void> | void) | null = null;
    if (name && c.scope.has(name)) { l = jsonOf(str(c.scope.get(name))); save = s => { c.scope.set(name, s); }; }
    else if (name && Array.isArray(jsonOf(c.host.getVar(name)))) { l = jsonOf(c.host.getVar(name)); save = s => c.host.setVar(name, s); }
    else if (name && Array.isArray(jsonOf(c.host.getGlobal(name)))) { l = jsonOf(c.host.getGlobal(name)); save = s => c.host.setGlobal(name, s); }
    else l = isBound(h.head) ? undefined : jsonOf(h.head);
    if (!Array.isArray(l)) fail('needList', { value: name.slice(0, 60) });
    const list = (l as unknown[]).map(x => typeof x === 'string' && x.length && !Number.isNaN(Number(x)) ? Number(x) : x);
    const keyFn = isBound(a.named.key) ? a.named.key : null;
    const rows: { key: unknown; item: unknown; index: number }[] = [];
    for (const [i, item] of list.entries()) rows.push({ key: keyFn ? await callFn(keyFn, c, [], [], { item: asArg(item), index: String(i) }) : item, item, index: i });
    if (h.body) {
      // 닫힌 블록으로 견주기: 모든 짝을 먼저 돌려 두고 정렬한다 (정렬은 기다릴 수 없다)
      const look: number[][] = rows.map(() => []);
      for (const x of rows) for (const y of rows) if (x !== y) look[x.index][y.index] = Number(await callFn(h.body, c, [asArg(x.key), asArg(y.key)]));
      rows.sort((x, y) => look[x.index][y.index] || 0);
    } else {
      const env = exprEnv(a, c, { a: '', b: '' }), f = exprOf(h.text || 'a <=> b', env);
      rows.sort((x, y) => { env.local.vars.set('a', asArg(x.key)); env.local.vars.set('b', asArg(y.key)); return Number(f()) || 0; });
      await env.flush();
    }
    const res = JSON.stringify(rows.map(r => r.item));
    if (save) await save(res);
    return res;
  },
});
def('flatten', {
  help: '', run: a => {
    const l = jsonOf(str(a.unnamed)); if (!Array.isArray(l)) fail('needList', { value: str(a.unnamed).slice(0, 60) });
    let d = parseInt(N(a, 'depth', '1'), 10); if (d === 0) d = Infinity;
    return JSON.stringify((l as unknown[]).flat(Number.isNaN(d) ? 1 : d));
  },
});
def('slice', {
  help: '', run: (a, c) => {
    let v: unknown;
    if (has(a, 'var') || has(a, 'globalvar')) { c.host.echo(tx('deprecatedVar', { cmd: 'slice' }), 'warning'); v = listVar(c, N(a, 'var'), N(a, 'globalvar')) ?? c.host.getVar(N(a, 'var')) ?? c.host.getGlobal(N(a, 'globalvar')) ?? str(a.unnamed); }
    else v = listVar(c, undefined, undefined, str(a.unnamed)) ?? str(a.unnamed);
    if (!Array.isArray(v) && typeof v !== 'string') fail('needListText', { cmd: 'slice' });
    const start = Number(N(a, 'start')), end = has(a, 'end') ? Number(N(a, 'end')) : N(a, 'length') ? (start || 0) + Number(N(a, 'length')) : undefined;
    return out((v as unknown[] | string).slice(Number.isNaN(start) ? 0 : start, end));
  },
});
def('splice', {
  help: '', run: (a, c) => {
    const start = Number(N(a, 'start')), del = N(a, 'delete', 'x') === '' ? Number.MAX_SAFE_INTEGER : Number(N(a, 'delete'));
    let l: unknown, insert: unknown;
    if (has(a, 'var') || has(a, 'globalvar') || has(a, 'value')) {
      c.host.echo(tx('deprecatedVar', { cmd: 'splice' }), 'warning');
      l = listVar(c, N(a, 'var'), N(a, 'globalvar'), has(a, 'value') ? N(a, 'value') : undefined) ?? (c.host.getVar(N(a, 'var')) ?? c.host.getGlobal(N(a, 'globalvar')) ?? N(a, 'value'));
      insert = listVar(c, undefined, undefined, str(a.unnamed)) ?? str(a.unnamed).split(' ').filter(Boolean);
    } else {
      l = listVar(c, undefined, undefined, str(a.unnamed)) ?? str(a.unnamed);
      insert = has(a, 'insert') ? listVar(c, undefined, undefined, N(a, 'insert')) ?? [N(a, 'insert')].filter(Boolean) : [];
    }
    const isList = Array.isArray(l), list = isList ? l as unknown[] : [...String(l)];
    list.splice(Number.isNaN(start) ? 0 : start, Number.isNaN(del) ? 0 : del, ...(Array.isArray(insert) ? insert : Object.values(insert as object)));
    return isList ? JSON.stringify(list) : list.join('');
  },
});
const shuffled = (a: Args) => {
  const l = jsonOf(str(a.unnamed)); if (!Array.isArray(l)) fail('needList', { value: str(a.unnamed).slice(0, 60) });
  const list = [...l as unknown[]];
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
};
def('shuffle', { help: '', run: a => JSON.stringify(shuffled(a)) });
def('pick', {
  help: '', run: a => {
    const list = shuffled(a), n = Number(N(a, 'items', '1')), picks = list.slice(0, Number.isNaN(n) ? 1 : n);
    return n > 1 || flag(a, 'list') ? JSON.stringify(picks) : out(picks[0]);
  },
});
def('reverse', { help: '', run: a => { const l = jsonOf(str(a.unnamed)); if (!Array.isArray(l)) fail('needList', { value: str(a.unnamed).slice(0, 60) }); return JSON.stringify([...l as unknown[]].reverse()); } });
def('dict', {
  help: '', run: (a, c) => {
    const l = listVar(c, N(a, 'var'), N(a, 'globalvar'), str(a.unnamed)); if (!Array.isArray(l)) fail('needList', { value: str(a.unnamed).slice(0, 60) });
    const o: Record<string, unknown> = {};
    for (const row of l as unknown[]) { if (!Array.isArray(row) || row.length < 2) fail('dictPairs'); o[String((row as unknown[])[0])] = (row as unknown[])[1]; }
    return JSON.stringify(o);
  },
});
def('keys', {
  help: '', run: (a, c) => {
    let v: unknown;
    if (has(a, 'var') || has(a, 'globalvar')) { c.host.echo(tx('deprecatedVar', { cmd: 'keys' }), 'warning'); v = listVar(c, N(a, 'var'), N(a, 'globalvar')); }
    else v = listVar(c, undefined, undefined, str(a.unnamed));
    if (!isObj(v)) fail('needListDict', { cmd: 'keys' });
    return JSON.stringify(Object.keys(v as object));
  },
});

// ════════ 나누기 · 잇기 ════════
const toRe = (find: string): RegExp => { const m = /^\/([\s\S]+)\/([a-z]*)$/.exec(find); try { return m ? new RegExp(m[1], m[2]) : new RegExp(find); } catch (e) { return fail('badRegex', { msg: (e as Error).message }); } };
def('split', {
  help: '', run: (a, c) => {
    let v = str(a.unnamed);
    if (has(a, 'var') || has(a, 'globalvar')) { c.host.echo(tx('deprecatedVar', { cmd: 'split' }), 'warning'); v = c.host.getVar(N(a, 'var')) ?? c.host.getGlobal(N(a, 'globalvar')) ?? v; }
    const f = N(a, 'find', ','), find: string | RegExp = /^\/.+\/[a-z]*$/.test(f) ? toRe(f) : f, trim = isTrue(N(a, 'trim', 'true'));
    return JSON.stringify(v.split(find).map(x => trim ? x.trim() : x));
  },
});
def('join', {
  help: '', run: (a, c) => {
    if (has(a, 'var') || has(a, 'globalvar')) c.host.echo(tx('deprecatedVar', { cmd: 'join' }), 'warning');
    const l = listVar(c, N(a, 'var'), N(a, 'globalvar'), str(a.unnamed));
    if (!Array.isArray(l)) return '';
    return (l as unknown[]).map(x => isObj(x) ? JSON.stringify(x) : String(x ?? '')).join(N(a, 'glue', ', ').replace(/\{\{space\}\}/g, ' '));
  },
});

// ════════ 글자 ════════
def('trim', { help: '', run: a => str(a.unnamed).trim() });
for (const [name, side] of [['pad-start', 'start'], ['pad-end', 'end'], ['pad-both', 'both']] as const) def(name, {
  help: '', run: async (a, c) => {
    const [lenV, ...rest] = await splitArgs(a, c, 1);
    const len = parseInt(str(lenV ?? ''), 10), text = rest.map(str).join(' '), fill = N(a, 'fill', ' ') || ' ';
    if (Number.isNaN(len)) fail('needLength', { cmd: name });
    if (side === 'start') return text.padStart(len, fill);
    if (side === 'end') return text.padEnd(len, fill);
    const add = (len - text.length) / 2; if (add <= 0) return text;
    const l = Math.floor(add), r = Math.ceil(add);
    return fill.repeat(l).slice(0, l) + text + fill.repeat(r).slice(0, r);
  },
});
def('json-pretty', { help: '', run: a => { const j = jsonOf(str(a.unnamed)); if (j === undefined) fail('badJson'); return JSON.stringify(j, null, 4); } });
def('substitute', { help: '', run: (a, c) => expand(str(a.unnamed), c) });
def('encodeURIComponent', { help: '', run: a => encodeURIComponent(str(a.unnamed)) });
def('decodeURIComponent', { help: '', run: a => { try { return decodeURIComponent(str(a.unnamed)); } catch { return fail('badUri'); } } });
const segs = (gran: 'word' | 'sentence' | 'grapheme', a: Args) => {
  const lang = N(a, 'language', 'en') || 'en';
  let seg: Intl.Segmenter; try { seg = new Intl.Segmenter(lang, { granularity: gran }); } catch { seg = new Intl.Segmenter('en', { granularity: gran }); }
  return [...seg.segment(str(a.unnamed))];
};
def('wordcount', { help: '', run: a => String(segs('word', a).filter(s => s.isWordLike).length) });
def('sentencecount', { help: '', run: a => String(segs('sentence', a).length) });
def('segment', {
  help: '', run: a => {
    const g = (N(a, 'granularity', 'word') || 'word') as 'word' | 'sentence' | 'grapheme';
    if (!['word', 'sentence', 'grapheme'].includes(g)) fail('badGranularity', { value: g });
    return JSON.stringify(segs(g, a).filter(s => g !== 'word' || s.isWordLike).map(s => s.segment));
  },
});

// ════════ 정규식 ════════
def('re-escape', { help: '', run: a => str(a.unnamed).replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&') });
def('re-test', {
  help: '', run: (a, c) => {
    if (has(a, 'var') || has(a, 'globalvar')) c.host.echo(tx('deprecatedVar', { cmd: 're-test' }), 'warning');
    if (!has(a, 'find')) fail('needFind', { cmd: 're-test' });
    const text = c.host.getVar(N(a, 'var')) ?? c.host.getGlobal(N(a, 'globalvar')) ?? str(a.unnamed);
    return JSON.stringify(toRe(N(a, 'find')).test(text));
  },
});
/** exec 를 되풀이해 맞은 것 모두 (g 가 없으면 하나) */
const allMatches = (re: RegExp, text: string): RegExpExecArray[] => {
  const outL: RegExpExecArray[] = []; let m: RegExpExecArray | null, last = -1;
  while ((m = re.exec(text)) && m.index !== last) { last = m.index; outL.push(m); if (!re.global && !re.sticky) break; if (m[0] === '') re.lastIndex++; }
  return outL;
};
def('re-replace', {
  help: '', run: async (a, c) => {
    if (has(a, 'var') || has(a, 'globalvar')) c.host.echo(tx('deprecatedVar', { cmd: 're-replace' }), 'warning');
    if (!has(a, 'find')) fail('needFind', { cmd: 're-replace' });
    const text = c.host.getVar(N(a, 'var')) ?? c.host.getGlobal(N(a, 'globalvar')) ?? str(a.unnamed);
    const re = () => toRe(N(a, 'find'));
    const cmd = a.named.cmd;
    if (cmd !== undefined) {
      const reps: string[] = [];
      if (isBound(cmd)) {
        for (const m of allMatches(re(), text)) {
          const mac: Record<string, string> = { '$index': String(m.index), '$input': m.input, '$*': '' };
          m.forEach((x, i) => { mac['$' + i] = x ?? ''; });
          for (const [k, v] of Object.entries(m.groups || {})) mac['$:' + k] = v ?? '';
          reps.push(await callFn(cmd, c, [], [], mac));
        }
      } else {
        const tpl = str(cmd), todo: string[] = [];
        text.replace(re(), (...g: unknown[]) => { todo.push(tpl.replace(/\$(\d+)/g, (_m, i: string) => String(g[+i] ?? ''))); return ''; });
        for (const s of todo) reps.push(await runText(s, c));
      }
      return text.replace(re(), () => reps.shift() ?? '');
    }
    if (has(a, 'replace')) return text.replace(re(), N(a, 'replace'));
    return fail('needReplace');
  },
});
def('re-exec', {
  help: '', run: a => {
    if (!has(a, 'find')) fail('needFind', { cmd: 're-exec' });
    const list = allMatches(toRe(N(a, 'find')), str(a.unnamed)).map(m => {
      const o: Record<string, unknown> = {}; m.forEach((x, i) => { o[i] = x; });
      for (const [k, v] of Object.entries(m.groups || {})) o[':' + k] = v;
      o.index = m.index; o.input = m.input; return o;
    });
    if (flag(a, 'first')) return list.length ? JSON.stringify(list[0]) : '';
    return JSON.stringify(list);
  },
});

// ════════ 구조 자료 ════════
/** index= : 한 칸 · 이름, 또는 [목록] 으로 여러 단계 */
const indexList = (a: Args): unknown[] => { const raw = N(a, 'index'), j = jsonOf(raw); return Array.isArray(j) ? [...j] : [raw]; };
def('getat', {
  help: '', run: (a, c) => {
    if (has(a, 'var') || has(a, 'globalvar')) c.host.echo(tx('deprecatedVar', { cmd: 'getat' }), 'warning');
    if (!has(a, 'index')) fail('needIndex', { cmd: 'getat' });
    let v: unknown = listVar(c, N(a, 'var'), N(a, 'globalvar'), str(a.unnamed));
    for (const k of indexList(a)) {
      if (v === undefined || v === null) break;
      v = Array.isArray(v) ? v.slice(Number(k))[0] : (Object(v) as Record<string, unknown>)[String(k)];
      if (typeof v === 'string') { const j = jsonOf(v); if (j !== undefined) v = j; }
    }
    return out(v);
  },
});
def('setat', {
  help: '', run: async (a, c) => {
    if (has(a, 'var') || has(a, 'globalvar')) c.host.echo(tx('deprecatedVar', { cmd: 'setat' }), 'warning');
    if (!has(a, 'index')) fail('needIndex', { cmd: 'setat' });
    const raw = str(a.unnamed), j = jsonOf(raw), value = j === undefined ? raw : j;
    const idx = indexList(a);
    const root = listVar(c, N(a, 'var'), N(a, 'globalvar'), has(a, 'value') ? N(a, 'value') : undefined) ?? (Number.isNaN(Number(String(idx[0]))) ? {} : []);
    let o = root as Record<string, unknown>;
    for (let i = 0; i < idx.length; i++) {
      const k = String(idx[i]), last = i === idx.length - 1;
      if (last) { o[k] = value; break; }
      let next = o[k];
      if (typeof next === 'string') { const p = jsonOf(next); if (isObj(p)) { next = p; o[k] = p; } }
      if (!isObj(next)) { next = Number.isNaN(Number(String(idx[i + 1]))) ? {} : []; o[k] = next; }
      o = next as Record<string, unknown>;
    }
    const res = JSON.stringify(root);
    if (N(a, 'var')) await c.host.setVar(N(a, 'var'), res);
    if (N(a, 'globalvar')) await c.host.setGlobal(N(a, 'globalvar'), res);
    return res;
  },
});

// ════════ 예외 ════════
/** 돌려 보고 결과 · 오류를 JSON 으로 (멈추기 · /return · /break 는 그대로 위로) */
def('try', {
  help: '', noPipe: true, run: async (a, c) => {
    const cmd = commandOf(a);
    try {
      const r = isBound(cmd) ? await callClosure(cmd, c) : await runText(cmd, c);
      return JSON.stringify({ isException: false, result: r });
    } catch (e) {
      if (e instanceof Abort || isSignal(e)) throw e;
      return JSON.stringify({ isException: true, exception: e instanceof Error ? e.message : String(e) });
    }
  },
});
def('catch', {
  help: '', noPipe: true, run: async (a, c) => {
    const cmd = commandOf(a), data = jsonOf(c.pipe) as { isException?: boolean; exception?: string; result?: string } | undefined;
    if (data?.isException) {
      const ex = String(data.exception ?? '');
      if (isBound(cmd)) return callClosure(cmd, c, {}, c.pipe, { exception: ex, error: ex });
      return runText(cmd.replace(/\{\{(exception|error)\}\}/gi, ex), c);
    }
    return out(data?.result);
  },
});

// ════════ 빈 값 ════════
def('ifempty', {
  help: '', run: (a, c) => {
    const v = N(a, 'value'), l = listVar(c, undefined, undefined, v);
    if (Array.isArray(l) ? !l.length : isObj(l) ? !Object.keys(l).length : !v.length) return a.unnamed;
    return v;
  },
});
def('ifnullish', { help: '', run: a => N(a, 'value') ? N(a, 'value') : a.unnamed });

// ════════ switch · case ════════
def('switch', {
  help: '', run: (a, c) => {
    if (has(a, 'var') || has(a, 'globalvar')) c.host.echo(tx('deprecatedVar', { cmd: 'switch' }), 'warning');
    const v = (N(a, 'var') && c.host.getVar(N(a, 'var'))) ?? (N(a, 'globalvar') && c.host.getGlobal(N(a, 'globalvar'))) ?? str(a.unnamed);
    return JSON.stringify({ switch: v || str(a.unnamed), break: false });
  },
});
def('case', {
  help: '', noPipe: true, run: async (a, c) => {
    let value: string | undefined, cmd: Tok | undefined;
    if (has(a, 'value')) { c.host.echo(tx('deprecatedValue', { cmd: 'case' }), 'warning'); value = N(a, 'value'); cmd = commandOf(a); }
    else { const toks = await splitArgs(a, c); if (toks.length > 1) { value = str(toks[0]); cmd = toks[1]; } else cmd = toks[0]; }
    const data = jsonOf(c.pipe) as { switch?: unknown; break?: boolean } | undefined;
    if (!isObj(data) || data.break) return c.pipe;
    if (data.switch === undefined || !(value === undefined || String(data.switch) === value)) return c.pipe;
    data.break = true; const pipe = JSON.stringify(data), sw = String(data.switch);
    if (isBound(cmd)) return callClosure(cmd, c, {}, pipe, { value: sw });
    return runText(str(cmd ?? '').replace(/\{\{value\}\}/gi, sw), c, pipe);
  },
});

// ════════ ife · elseif · else ════════
// /ife 는 {"if":결과,"isHandled":…,"scope":…} 를 넘기고, 뒤의 /elseif · /else 가 그것을 읽는다. scope 는 같은 범위의 /ife 짝인지 가린다
const ifeMark = new WeakMap<Scope, string>();
const ifeScopeOf = (s: Scope) => { for (let x: Scope | null = s; x; x = x.parent) { const m = ifeMark.get(x); if (m) return m; } return undefined; };
let ifeSeq = 0;
const ifValue = (v: unknown) => typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string' ? v : !!v;
/** 조건(식 또는 닫힌 블록)과 몸통 */
interface IfParts { yes: unknown; then: Bound | null }
async function ifParts(a: Args, c: Ctx, cmd: string): Promise<IfParts> {
  const parts = a.parts.filter(p => isBound(p) || str(p).trim());
  let then: Bound | null = null;
  if (parts.length > 1 && isBound(parts[parts.length - 1])) then = parts.pop() as Bound;
  if (isBound(parts[0])) return { yes: isTrue(await callFn(parts[0], c, [])), then };
  const text = parts.map(str).join(' ').trim();
  if (!text) fail('needCondition', { cmd });
  return { yes: await runExpr(text, exprEnv(a, c)), then };
}
def('ife', {
  help: '', noPipe: true, run: async (a, c) => {
    const id = `ife-${++ifeSeq}`; ifeMark.set(c.scope, id);
    const { yes, then } = await ifParts(a, c, 'ife');
    const data = { if: ifValue(yes), isHandled: false, scope: id };
    if (yes && then) { data.isHandled = true; return callClosure(then, c); }
    return JSON.stringify(data);
  },
});
def('elseif', {
  help: '', noPipe: true, run: async (a, c) => {
    const data = jsonOf(c.pipe) as { if?: unknown; scope?: string } | undefined;
    if (!isObj(data) || data.if === undefined) return c.pipe;
    if (data.scope !== ifeScopeOf(c.scope)) return '';
    if (data.if) return c.pipe;
    const { yes, then } = await ifParts(a, c, 'elseif');
    const next = { if: ifValue(yes), isHandled: false, scope: data.scope };
    if (yes && then) { next.isHandled = true; return callClosure(then, c); }
    return JSON.stringify(next);
  },
});
def('else', {
  help: '', noPipe: true, run: async (a, c) => {
    const cmd = commandOf(a), data = jsonOf(c.pipe) as { if?: unknown; isHandled?: boolean; scope?: string } | undefined;
    if (!isObj(data) || data.if === undefined || data.isHandled) return c.pipe;
    if (data.scope !== ifeScopeOf(c.scope)) return '';
    if (data.if) return c.pipe;
    return isBound(cmd) ? callClosure(cmd, c) : runText(cmd, c);
  },
});
def('then', {
  help: '', noPipe: true, run: async (a, c) => {
    c.host.echo(tx('deprecatedThen'), 'warning');
    const cmd = commandOf(a), data = jsonOf(c.pipe) as { if?: unknown; isHandled?: boolean } | undefined;
    if (!isObj(data) || data.if === undefined || data.isHandled || !data.if) return c.pipe;
    return isBound(cmd) ? callClosure(cmd, c) : runText(cmd, c);
  },
});

// ════════ 시간 · 비동기 · 기록 ════════
def('timestamp', { help: '', noPipe: true, run: () => String(Date.now()) });
def('fireandforget', {
  help: '', run: (a, c) => {
    const cmd = commandOf(a), ctx: Ctx = { host: c.host, scope: c.scope, pipe: c.pipe, depth: c.depth };
    const p = isBound(cmd) ? callClosure({ ...cmd, scope: c.scope }, ctx) : runText(cmd, ctx);
    p.catch(e => { if (e instanceof Abort || isSignal(e)) return; c.host.echo(e instanceof Error ? e.message : String(e), 'error'); });
    return '';
  },
});
for (const [name, level] of [['console-log', 'log'], ['console-warn', 'warn'], ['console-error', 'error']] as const) def(name, {
  help: '', run: a => { const v = str(a.unnamed), j = jsonOf(v); console[level](`[/console-${level}]`, j === undefined ? v : j); return ''; },
});
