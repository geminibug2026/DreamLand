// ── STscript 돌리기 ──
// 스크립트 하나 = 명령 목록. 명령마다 결과(글자)를 내고, 그 결과가 다음 명령의 {{pipe}} 가 된다.
// 대화 화면과 닿는 일(보내기 · 생성 · 창 띄우기 · 변수 저장)은 Host 가 맡는다 — 시험에서는 가짜 Host 를 넣는다.
import { t } from '../i18n';
import { parse, type Closure, type Cmd, type Value } from './parse';

/** 닫힌 블록 + 만든 자리의 변수 범위 */
export interface Bound { kind: 'bound'; closure: Closure; scope: Scope }
export type Val = string | Bound;
export const isBound = (v: unknown): v is Bound => !!v && typeof v === 'object' && (v as Bound).kind === 'bound';

export class Scope {
  vars = new Map<string, Val>();
  constructor(public parent: Scope | null = null) { }
  find(k: string): Scope | null { for (let s: Scope | null = this; s; s = s.parent) if (s.vars.has(k)) return s; return null; }
  get(k: string): Val | undefined { return this.find(k)?.vars.get(k); }
  has(k: string) { return !!this.find(k); }
  let(k: string, v: Val) { this.vars.set(k, v); }
  set(k: string, v: Val) { (this.find(k) || this).vars.set(k, v); }
  /** 매크로가 읽을 평평한 모양 (가까운 것이 이긴다) */
  flat(): Record<string, string> { const o: Record<string, string> = {}; const chain: Scope[] = []; for (let s: Scope | null = this; s; s = s.parent) chain.unshift(s); for (const s of chain) for (const [k, v] of s.vars) o[k] = isBound(v) ? v.closure.src : v; return o; }
}

export interface Host {
  /** 매크로 바꾸기 ({{char}} · {{getvar::x}} · {{var::x}} · {{pipe}} …) */
  macro(text: string, scope: Record<string, string>, pipe: string): string;
  getVar(k: string): string | undefined; setVar(k: string, v: string): void | Promise<void>; delVar(k: string): void | Promise<void>;
  getGlobal(k: string): string | undefined; setGlobal(k: string, v: string): void | Promise<void>; delGlobal(k: string): void | Promise<void>;
  /** 이름 없는 명령 · 드림랜드 명령 · 확장 명령. 없으면 null */
  fallback(name: string, arg: string, named: Record<string, string>): Promise<string | null | undefined>;
  /** 퀵 리플라이 찾기: "세트.이름" 또는 이름 → 스크립트 글 */
  findQr(key: string): { text: string; label: string } | null;
  echo(text: string, severity?: string): void;
  /** 사용자가 멈췄는지 */
  stopped?(): boolean;
  [k: string]: unknown;
}

export class Abort extends Error { constructor(public quiet = false) { super('abort'); } }
class Signal { constructor(public kind: 'break' | 'return', public value: string) { } }

export interface Ctx {
  host: Host; scope: Scope; pipe: string; depth: number;
  /** 명령 하나가 받은 값 (이름 붙은 값은 매크로를 바꾼 글자 또는 닫힌 블록) */
}
export interface Args { named: Record<string, Val>; unnamed: Val; parts: Val[]; rawNamed: Record<string, Value>; cmd: Cmd; /** 이름 없는 값이 있었는지 (앞 결과를 받은 것 포함) */ given: boolean }
export type CmdFn = (a: Args, c: Ctx) => Promise<Val | void | null | undefined> | Val | void | null | undefined;
export interface CmdDef { run: CmdFn; help?: string; args?: string; alias?: string[]; /** true 면 앞 결과를 이름 없는 값으로 넣지 않는다 */ noPipe?: boolean }
export const COMMANDS = new Map<string, CmdDef>();
export function def(name: string | string[], d: CmdDef) { for (const n of Array.isArray(name) ? name : [name]) COMMANDS.set(n.toLowerCase(), d); for (const a of d.alias || []) COMMANDS.set(a.toLowerCase(), d); }

const MAX_DEPTH = 60;

/** 값 하나를 돌릴 때의 모양으로: 닫힌 블록 하나면 그 블록, 아니면 매크로를 바꾼 글자 */
export async function evalValue(v: Value, c: Ctx): Promise<Val> {
  const one = async (p: Value[number]): Promise<Val> => typeof p === 'string' ? expand(p, c) : p.now ? callClosure({ kind: 'bound', closure: p, scope: c.scope }, c) : { kind: 'bound', closure: p, scope: c.scope };
  if (v.length === 1) return one(v[0]);
  const parts = await Promise.all(v.map(one));
  const firstClosure = parts.find(isBound);
  return firstClosure && parts.every(p => isBound(p) || !String(p).trim()) ? firstClosure : parts.map(str).join('');
}
/** 이름 없는 값을 조각째로 (/if 처럼 글자 + 닫힌 블록을 따로 보는 명령용) */
export async function evalParts(v: Value, c: Ctx): Promise<Val[]> {
  const out: Val[] = [];
  for (const p of v) out.push(typeof p === 'string' ? expand(p, c) : p.now ? await callClosure({ kind: 'bound', closure: p, scope: c.scope }, c) : { kind: 'bound', closure: p, scope: c.scope });
  return out;
}
/** 매크로 바꾸기. {{timesIndex}} 같은 지역 이름은 범위에서 먼저 찾는다 */
export function expand(s: string, c: Ctx): string {
  if (!s.includes('{{')) return s;
  const flat = c.scope.flat();
  s = s.replace(/\{\{(timesIndex|pipe)\}\}/g, (m, k: string) => k === 'pipe' ? c.pipe : (flat[k] ?? m));
  // {{arg::이름}} — /run 으로 넘겨받은 값 (없으면 빈 글자)
  s = s.replace(/\{\{arg::([^}]+)\}\}/g, (_m, k: string) => flat[k.trim()] ?? '');
  return c.host.macro(s, flat, c.pipe);
}
export const str = (v: Val | void | null | undefined): string => v == null ? '' : isBound(v) ? v.closure.src : String(v);

/** 스크립트 글 하나를 돌린다. 결과는 마지막 {{pipe}} */
export async function runScript(src: string, host: Host, opt: { scope?: Scope; pipe?: string; args?: Record<string, string> } = {}): Promise<string> {
  const scope = new Scope(opt.scope || null);
  for (const [k, v] of Object.entries(opt.args || {})) scope.let(k, v);
  try { return await runCmds(parse(src), { host, scope, pipe: opt.pipe ?? '', depth: 0 }); }
  catch (e) { if (e instanceof Signal) return e.value; if (e instanceof Abort) return ''; throw e; }
}

export async function runCmds(cmds: Cmd[], c: Ctx): Promise<string> {
  if (c.depth > MAX_DEPTH) throw new Error(t('st.err.tooDeep'));
  let first = true;
  for (const cmd of cmds) {
    if (cmd.name === '#') continue;
    if (c.host.stopped?.()) throw new Abort(true);
    const out = await runCmd(cmd, c, first);
    first = false;
    c.pipe = out == null ? '' : str(out);   // 결과를 내지 않는 명령 뒤에는 빈 글자 (실리태번과 같다)
  }
  return c.pipe;
}

async function runCmd(cmd: Cmd, c: Ctx, first: boolean): Promise<Val | void | null | undefined> {
  // /:이름 — 범위에 담긴 닫힌 블록이나 퀵 리플라이를 부른다
  if (cmd.name.startsWith(':')) return callNamed(cmd.name.slice(1) || str(await evalValue(cmd.unnamed, c)), cmd, c);
  const d = COMMANDS.get(cmd.name);
  const named: Record<string, Val> = {};
  for (const [k, v] of Object.entries(cmd.named)) named[k] = await evalValue(v, c);
  const inject = !first && !cmd.noPipe && !d?.noPipe;
  const given = cmd.unnamed.length > 0 || inject;
  const parts = cmd.unnamed.length ? await evalParts(cmd.unnamed, c) : inject ? [c.pipe] : [];
  const unnamed: Val = parts.length === 1 ? parts[0] : parts.find(isBound) && parts.every(p => isBound(p) || !String(p).trim()) ? parts.find(isBound) as Bound : parts.map(str).join('');
  if (d) return d.run({ named, unnamed, parts, rawNamed: cmd.named, cmd, given }, c);
  const strNamed = Object.fromEntries(Object.entries(named).map(([k, v]) => [k, str(v)]));
  const r = await c.host.fallback(cmd.name, str(unnamed), strNamed);
  if (r === null) throw new Error(t('st.err.unknown', { name: cmd.name }));
  return r ?? undefined;
}

/** 닫힌 블록을 돌린다. args 는 블록 머리에 적은 이름=기본값을 채운다 */
export async function callClosure(b: Bound, c: Ctx, args: Record<string, string> = {}, pipe = c.pipe): Promise<string> {
  const scope = new Scope(b.scope);
  for (const a of b.closure.args) { const [k, ...dv] = a.split('='); scope.let(k, k in args ? args[k] : expand(dv.join('='), { ...c, scope })); }
  for (const [k, v] of Object.entries(args)) if (!scope.vars.has(k)) scope.let(k, v);
  // /return 은 여기서 잡지 않는다: /if 안의 /return 도 그 스크립트(또는 /run 으로 부른 블록)를 끝낸다
  return runCmds(b.closure.body, { host: c.host, scope, pipe, depth: c.depth + 1 });
}
/** 이름으로 부르기: 범위의 닫힌 블록 → 퀵 리플라이 */
export async function callNamed(name: string, cmd: Cmd | null, c: Ctx, extra: Record<string, string> = {}): Promise<string> {
  const args = { ...extra };
  if (cmd) for (const [k, v] of Object.entries(cmd.named)) args[k] = str(await evalValue(v, c));
  const v = c.scope.get(name);
  const call = async (b: Bound) => { try { return await callClosure(b, c, args); } catch (e) { if (e instanceof Signal && e.kind === 'return') return e.value; throw e; } };
  if (isBound(v)) return call(v);
  if (typeof v === 'string' && v.trim().startsWith('{:')) { const b = parse('/pass ' + v)[0].unnamed[0]; if (typeof b === 'object') return call({ kind: 'bound', closure: b, scope: c.scope }); }
  const qr = c.host.findQr(name);
  if (!qr) throw new Error(t('st.err.notFound', { name }));
  const scope = new Scope(null); for (const [k, x] of Object.entries(args)) scope.let(k, x);
  try { return await runCmds(parse(qr.text), { host: c.host, scope, pipe: c.pipe, depth: c.depth + 1 }); }
  catch (e) { if (e instanceof Signal && e.kind === 'return') return e.value; throw e; }
}

// ════════ 흐름 ════════
export const signal = (kind: 'break' | 'return', value: string) => new Signal(kind, value);
export const isSignal = (e: unknown, kind?: 'break' | 'return'): e is Signal => e instanceof Signal && (!kind || e.kind === kind);
