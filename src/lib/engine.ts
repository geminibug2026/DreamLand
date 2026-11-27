// ── Dreamland engine: 토큰 추정 · 매크로 · 정규식 · 로어북 · 프롬프트 조립 · API ──
import * as core from './core';
import * as hooks from './hooks';
import { bareNames, condBlocks, evalCond, hasCondBlock, pvResolve, type CondEnv, type PvMap } from './cond';
import { ejs } from './ejs';
import { addTo, caseFold, getKey, macroText, runVarShorthand, setKey, varShorthand, weighted, wpick } from './macro-extra';
import * as clock from './clock';
import * as advanced from './advanced';
import { t as tr } from '../i18n';
import { Server } from './server';
import { Rpm } from '../reach/rpm';

// ════════ 자료 꼴 (엔진이 읽는 만큼) ════════
type Obj = Record<string, unknown>;
type Num = number | string;
import type { Swipe, Msg, Char, Persona, Chat, Regex, Preset, PresetBlock as Block, PresetParams, Conn, LoreEntry, Lore as LoreBook } from './types';
export type { Swipe, Msg, Char, Persona, Chat, Regex, Preset, Block, Conn, LoreEntry, LoreBook };
/** 프리셋 매개변수 + 보조 호출이 덧붙이는 이름들 */
/** 정해진 꼴로 답하게 하기 (스트리밍하지 않는 호출에서만): 도구 호출 하나를 꼭 부르게 · JSON 스키마 · JSON 객체 */
export interface Structured { tool?: { name: string; description: string; parameters: Obj }; json?: { name: string; schema: Obj }; jsonObject?: boolean }
export type Params = Partial<PresetParams> & { /** 보조 호출(기억 정리 등): 생각(추론)을 적게 하라고 요청한다 */ lowThink?: boolean; structured?: Structured; stop?: unknown[]; names?: Names; groupNudge?: string; continueNudge?: string; impersonatePrompt?: string };
export interface Names { user?: string; char?: string; others?: string[] }
export type LoreState = Record<string, { sticky: number; cool: number }>;
export interface LoreHit extends LoreEntry { text: string; book?: string; bookId: string; tok: number }
/** 매크로 문맥 */
export interface Ctx {
  user?: string; char?: string; group?: string; persona?: string; description?: string; personality?: string; scenario?: string; mesExamples?: string; model?: string; input?: string;
  vars?: Obj; lastMessage?: string; lastUserMessage?: string; lastCharMessage?: string; pv?: PvMap; mode?: string; chat?: Chat; type?: string;
  outlets?: Record<string, string[]>; original?: string; scope?: Obj; pipe?: unknown; [k: string]: unknown;
}
export interface PromptMsg { role: string; content: string; src?: string; name?: string; images?: string[]; part?: string; prefill?: boolean; first?: boolean; [k: string]: unknown }
interface InstructT { name?: string; wrap?: boolean; story_string_suffix?: string; user_alignment_message?: string; [k: string]: unknown }
interface ContextT { story_string?: string; story_string_position?: Num; story_string_role?: Num; story_string_depth?: Num; chat_start?: string; example_separator?: string; names_as_stop_strings?: boolean; use_stop_strings?: boolean; [k: string]: unknown }
export interface Tc { type: string; instruct: InstructT | null; context: ContextT; group: boolean; why?: string; stops?: string[] }
export type PromptList = PromptMsg[] & { tc?: Tc };
export interface Built { messages: PromptList; total: number; lore: LoreHit[]; dropped: number; ctx: Ctx; story?: boolean; talk?: boolean }
export interface ProviderDef { name: string; group: string; base: string; models: string[]; kind: string; official?: boolean; samplers?: boolean; keyless?: boolean; ph?: string; note?: string }

// ════════ 이웃 모듈 다리 (옛 모듈과 같은 이름 · 같은 값을 쓴다) ════════
interface ReasonFmt { addToPrompts?: boolean; maxAdditions?: number; prefix?: string; suffix?: string; separator?: string; autoParse?: boolean; headroom?: Num }
interface FormatT {
  storyMode?: boolean; reasoning?: ReasonFmt; sysprompt?: { enabled?: boolean; content?: string; post_history?: string }; startReplyWith?: string; tokenPadding?: number;
  ccExampleSep?: string; ccChatStart?: string; collapseNewlines?: boolean; singleLine?: boolean; fixMarkdown?: boolean; trimSentences?: boolean; trimSpaces?: boolean;
  showBias?: boolean; alwaysForceName2?: boolean; stopMacro?: boolean;
}
interface LoreSettings { includeNames?: boolean; groupScoring?: boolean; maxRecursion?: Num; minActivations?: Num; minDepthMax?: Num }
interface EngineSettings {
  globalVars: Obj; regexAllow?: Record<string, Record<string, boolean | 'ask'> | undefined>; lore?: LoreSettings; activeLore?: string[]; userNameFallback?: string;
  direct?: { prompt?: string; past?: string; pastFormat?: string }; modes?: { talkPrompt?: string; commands?: boolean; talkTokens?: number };
  format?: { tokenPadding?: number; reasoning?: ReasonFmt }; memory?: { enabled?: boolean; trim?: boolean; keepRecent?: number };
  tracker: { enabled?: boolean; inject?: boolean }; [k: string]: unknown;
}
interface EngineStore {
  settings: EngineSettings; regex: Regex[]; presets: Preset[];
  get(coll: string, id?: string): unknown; saveSettings(): void;
  preset(): Preset; presetFor(chat: Chat): Preset; conn(): Conn | undefined; connFor(chat: Chat): Conn | undefined; persona(chat: Chat): Persona | undefined;
}
interface PromptPart { where?: string; role?: string; content?: string; depth?: Num; order?: Num; src?: string }
interface PromptHook { owner: string; fn(info: Obj): PromptPart[] | null | undefined }
interface Hooks { macros: Map<string, { owner?: string; fn(args: string[], c: Ctx): unknown }>; prompt: PromptHook[]; loreVec?: ((id: string) => unknown) | null; covered?: ((chat: Chat) => number) | null;
  loreFilter: ((books: LoreBook[], o: { chat: Chat; chars: Char[]; persona?: Persona | null }) => LoreBook[]) | null; varsOf: ((chat: Chat | null | undefined) => Record<string, unknown> | null) | null; macroLike: ((text: string, c: Ctx) => string)[];
  gate?: { cond(cond: string, c: Ctx): string; lore(e: LoreEntry, c: Ctx): boolean; each(text: string, c: Ctx): string; post(text: string): string } | null }
interface ClockApi { now(chat?: Chat | null): Date; mode(chat: Chat): string; timeOf(chat: Chat, m: Msg): number; line(chat: Chat): string; command(chat: Chat): string }
interface FmtChatOpts { name: string; mes: string; isUser: boolean; isNarrator: boolean; force?: number; group?: boolean; user?: string; char?: string; mx?: (t: string) => string }
interface AdvancedApi {
  AF(): FormatT; resolve(conn: Conn | null | undefined): { instruct: InstructT | null; context: ContextT; why: string }; TEXT_PROVIDER_KINDS: string[];
  renderStory(C: ContextT, I: InstructT | null, params: Obj, mx: (t: string) => string): string;
  fmtStory(I: InstructT | null, C: ContextT, story: string, mx: (t: string) => string): string;
  fmtChat(I: InstructT, o: FmtChatOpts): string;
  fmtLast(I: InstructT, o: { name: string; isImpersonate?: boolean; isQuiet?: boolean; bias?: string; group?: boolean; mx?: (t: string) => string }): string;
  parseExamples(str: string, isInstruct: boolean, C: ContextT, mx: (t: string) => string): string[];
  fmtExamples(I: InstructT, C: ContextT, blocks: string[], o: { user?: string; char?: string; group?: boolean; groupNames?: string[]; mx?: (t: string) => string }): string[];
  instructStops(I: InstructT, o: { user: string; char: string; mx: (t: string) => string }): string[];
  trimToEndSentence(input: string): string;
  cleanCompletion(text: string, o: { I: InstructT | null; stops: string[]; user?: string; char?: string; isImpersonate?: boolean }): string;
}
interface CoreApi {
  S: EngineStore; msgText(m: Msg): string; arr<T>(v: T | T[] | null | undefined): T[]; Secrets: { is(v: unknown): boolean };
  on(ev: string, fn: (data: never) => void): unknown;
}
const C0 = core as unknown as CoreApi;
const S = C0.S, msgText = (m: Msg) => C0.msgText(m), arr = <T>(v: T | T[] | null | undefined): T[] => C0.arr(v), Secrets = C0.Secrets, on = C0.on;
const X = (hooks as unknown as { X: Hooks }).X;
const Clock = (clock as unknown as { Clock: ClockApi }).Clock;
const A = advanced as unknown as AdvancedApi;
const AF = () => A.AF();

// ── 토큰 추정 (정확한 토크나이저가 아니라 근사값) ──
export function tokens(text: string | null | undefined): number {
  if (!text) return 0;
  let a = 0, w = 0;
  for (let i = 0; i < text.length; i++) text.charCodeAt(i) < 0x250 ? a++ : w++;
  return Math.ceil(a / 3.8 + w / 1.4);
}

// ── 주사위 ──
export interface Roll { rolls: number[]; mod: number; total: number; expr: string }
export function roll(expr: unknown): Roll | null {
  const m = String(expr).replace(/\s+/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  const n = Math.min(100, +m[1] || 1), sides = +m[2], mod = +m[3] || 0;
  if (sides < 1) return null;
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
  return { rolls, mod, total: rolls.reduce((x, y) => x + y, 0) + mod, expr: `${n}d${sides}${mod ? (mod > 0 ? '+' : '') + mod : ''}` };
}

// ── 매크로 ──
/** 순서 값: 없거나 수가 아니면 100 (로어북 기본값) — 정렬이 NaN 으로 뒤섞이지 않게 */
export const ordOf = (v: unknown) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : 100; };
/** 그 객체 자신의 값만 (프로토타입의 constructor · toString 따위는 없는 것으로) */
const own = <T,>(o: Record<string, T> | null | undefined, k: string | undefined): T | undefined => o && k != null && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
/** 로어북 · 프리셋 · 카드 글의 <% … %> 템플릿을 처리한다 (조건문 · 값 넣기. 코드를 실제로 실행하지는 않는다) */
export function tpl(text: string | null | undefined, c: Ctx = {}): string {
  const s = text || ''; if (s.indexOf('<%') < 0) return s;
  const vars = (c.vars || {}) as Record<string, unknown>, g = (S.settings.globalVars || {}) as Record<string, unknown>;
  let mv: Record<string, unknown> | null | undefined;   // 대화 변수에 없는 이름은 마지막 메시지 변수에서 (변수 갱신 틀의 stat_data 등 — 실리태번 템플릿처럼)
  const msgVar = (n: string) => { if (mv === undefined) mv = X.varsOf?.(c.chat as Chat | undefined) || null; return mv && Object.prototype.hasOwnProperty.call(mv, n) ? mv[n] : undefined; };
  return ejs(s, { getvar: n => Object.prototype.hasOwnProperty.call(vars, n) ? vars[n] : msgVar(n), getGlobalVar: n => Object.prototype.hasOwnProperty.call(g, n) ? g[n] : undefined });
}
/** 그룹 대화에서 쉬게 하지 않은 멤버 이름들 */
function notMuted(c: Ctx): string {
  const chat = c.chat as (Chat & { muted?: string[] }) | undefined; if (!chat || (chat.charIds || []).length < 2) return '';
  const off = new Set(chat.muted || []);
  return chat.charIds.filter(id => !off.has(id)).map(id => (S.get('chars', id) as Char | undefined)?.name).filter(Boolean).join(', ');
}
/** 실리태번 1.19 의 {{if 조건}}: ! 를 앞에 붙이면 뒤집고, 매크로 이름 · {{.변수}} · {{$변수}} 줄임 꼴이면 그 값을, 아니면 글 그대로를 본다.
 *  비었거나 false · off · 0 이면 거짓 */
function stIf(condIn: string, c: Ctx): boolean {
  let s = condIn.trim(), neg = false;
  while (s.startsWith('!')) { neg = !neg; s = s.slice(1).trim(); }
  let v = s;
  if (/^[.$]?[A-Za-z][\w-]*$/.test(s)) { const r = macro('{{' + s + '}}', c); if (r !== '{{' + s + '}}') v = r; } else v = macro(s, c);
  return !['', 'false', 'off', '0'].includes(v.trim().toLowerCase()) !== neg;
}
/** <USER> · <BOT> · <CHAR> (대소문자 무시) */
const ANGLE_MACRO = /<USER>|<BOT>|<CHAR>/gi;
/** 날짜 · 시각 글꼴은 한 번 만들어 둔다 (toLocale…String 은 부를 때마다 새로 만든다) */
const DTF = {
  time: new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }),
  date: new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
  weekday: new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }),
};
export function macro(textIn: string | null | undefined, c: Ctx = {}): string {
  let text = textIn as string;
  if (!text) return '';
  // {{ 가 없으면 바꿀 것은 <USER> · <BOT> · <CHAR> 뿐이다 (정규식 바꿀 문장은 거의 다 HTML 이라 '<' 만으로는 거르지 못한다 — 답이 흐르는 동안 일치마다 불린다)
  if (text.indexOf('{{') < 0) return text.indexOf('<') < 0 ? text : text.replace(ANGLE_MACRO, m => (m[1] === 'u' || m[1] === 'U') ? c.user ?? '' : c.char ?? '');
  if (X.macroLike.length && text.indexOf('{{') >= 0) for (const f of X.macroLike) { try { text = f(text, c); } catch (e) { console.warn('[매크로]', e); } }
  const vars = c.vars || {}, g = S.settings.globalVars;
  if (X.gate && text.indexOf('{{#each') >= 0) text = X.gate.each(text, c);   // {{#each char}}…{{/each}}: 그룹의 캐릭터마다 되풀이
  if (text.indexOf('{{') >= 0 && hasCondBlock(text)) text = condBlocks(text, (cond, st) => st ? stIf(cond, c) : evalCond(macro(askCond(cond, c), c), condEnv(c)));   // {{#if 조건}}…{{else}}…{{/if}} · 실리태번의 {{if 값}}
  let dd: Date | null = null; const day = () => (dd ||= Clock.now(c.chat));   // 방마다 따로 가는 시계 (기본은 현실 시각) — 시각 매크로가 있을 때만 잰다
  const simple: Record<string, unknown> = {
    user: c.user, char: c.char, charifnotgroup: c.char, group: c.group || c.char, groupnotmuted: notMuted(c) || c.group || c.char, persona: c.persona, description: c.description,
    personality: c.personality, scenario: c.scenario, mesexamples: c.mesExamples, model: c.model, input: c.input,
    lastmessage: c.lastMessage, lastusermessage: c.lastUserMessage, lastcharmessage: c.lastCharMessage,
    get time() { return DTF.time.format(day()); }, get date() { return DTF.date.format(day()); },
    get weekday() { return DTF.weekday.format(day()); }, get isotime() { return day().toTimeString().slice(0, 5); }, get isodate() { return day().toISOString().slice(0, 10); },
    newline: '\n', noop: '', trim: '\u0000TRIM\u0000',
  };
  const pickSeen: Record<string, number> = {};   // 한 글 안에서 같은 {{pick}} 이 여러 번 나오면 차례로 다른 자리
  const one = (body: string): string | null => {
    const raw = body.trim().replace(/^(ask_pick)\s*:\s*(?=["'“‘])/i, '$1::');   // {{ask_pick:"물음"::가::나}} 도 받는다
    if (raw.startsWith('//')) return '';
    if (raw[0] === '.' || raw[0] === '$') {   // {{.변수}} · {{$전역변수}} 줄임 꼴 (실리태번 1.19)
      const vs = varShorthand(raw); if (vs) { const r = runVarShorthand(vs, vs.global ? g : vars); if (vs.global && vs.op && !/^(\?\?|\|\||==|!=|[<>]=?)$/.test(vs.op)) S.saveSettings(); return r; }
    }
    const sep = raw.includes('::') ? '::' : ':';
    const [nameRaw, ...rest] = raw.split(sep);
    const name = nameRaw.trim().toLowerCase();
    const args = rest.map(x => x.trim());
    if (own(simple, name) !== undefined && !rest.length) return String(simple[name] ?? '');   // 자기 값만 ({{constructor}} 같은 이름이 Object 의 것을 내보내지 않게)
    switch (name) {
      case 'random': case 'pick': {
        const o = args.length > 1 ? args : (args[0] || '').split(','); if (!o.length) return '';
        const wt = weighted(o);   // 끝에 @숫자 가 붙은 선택지가 있으면 그 비율대로 ({{random::흔함@3::드묾@0.5}})
        if (name === 'random') return wt ? wpick(wt.items, wt.w, Math.random()) : o[Math.floor(Math.random() * o.length)].trim();
        // {{pick}}: 같은 대화 · 같은 자리에서는 늘 같은 것 (실리태번과 같다). /reroll-pick 이 시드를 바꾼다
        const seen = (pickSeen[raw] = (pickSeen[raw] || 0) + 1);
        const key = `${c.chat?.id || ''}:${(c.chat as { pickSeed?: number } | undefined)?.pickSeed || 0}:${raw}:${seen}`;
        let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
        return wt ? wpick(wt.items, wt.w, (h >>> 0) / 4294967296) : o[(h >>> 0) % o.length].trim();
      }
      case 'roll': { const r = roll(/d/i.test(args[0] || '') ? args[0] : 'd' + args[0]); return r ? String(r.total) : ''; }
      case 'getvar': return macroText(own(vars, args[0]));
      case 'setvar': vars[args[0]] = args.slice(1).join(sep); return '';
      case 'addvar': { const a = Number(own(vars, args[0])), b = Number(args[1]); vars[args[0]] = isNaN(a) || isNaN(b) ? String(own(vars, args[0]) ?? '') + (args[1] ?? '') : a + b; return ''; }
      case 'incvar': vars[args[0]] = (Number(own(vars, args[0])) || 0) + 1; return String(vars[args[0]]);
      case 'decvar': vars[args[0]] = (Number(own(vars, args[0])) || 0) - 1; return String(vars[args[0]]);
      case 'getglobalvar': return macroText(own(g, args[0]));
      case 'setglobalvar': g[args[0]] = args.slice(1).join(sep); S.saveSettings(); return '';
      // 실리태번에도 있는 변수 매크로들 (있나 · 지우기 · 전역 더하기 · 목록 · 사전의 한 칸)
      case 'hasvar': return String(own(vars, args[0]) !== undefined);
      case 'deletevar': delete vars[args[0]]; return '';
      case 'hasglobalvar': return String(own(g, args[0]) !== undefined);
      case 'deleteglobalvar': delete g[args[0]]; S.saveSettings(); return '';
      case 'addglobalvar': g[args[0]] = addTo(own(g, args[0]), args.slice(1).join(sep)); S.saveSettings(); return '';
      case 'incglobalvar': g[args[0]] = (Number(own(g, args[0])) || 0) + 1; S.saveSettings(); return String(g[args[0]]);
      case 'decglobalvar': g[args[0]] = (Number(own(g, args[0])) || 0) - 1; S.saveSettings(); return String(g[args[0]]);
      case 'getvarkey': case 'getvarindex': return getKey(own(vars, args[0]), args[1] ?? '');
      case 'setvarkey': case 'setvarindex': vars[args[0]] = setKey(own(vars, args[0]), args[1] ?? '', args.slice(2).join(sep)); return '';
      case 'getglobalvarkey': case 'getglobalvarindex': return getKey(own(g, args[0]), args[1] ?? '');
      case 'setglobalvarkey': case 'setglobalvarindex': g[args[0]] = setKey(own(g, args[0]), args[1] ?? '', args.slice(2).join(sep)); S.saveSettings(); return '';
      case 'outlet': return ((c.outlets && own(c.outlets, args[0])) || []).join('\n');
      case 'original': return c.original ?? '';
      case 'var': case 'pvar': {   // 프리셋 변수 (명령 스크립트 안에서는 /let 으로 만든 값이 먼저)
        const k = args[0] ?? ''; if (c.scope && own(c.scope, k) !== undefined) return String(c.scope[k] ?? '');
        const p = c.pv && own(c.pv, k); return p ? (args[1] === 'label' ? p.label : args[1] === 'raw' ? String(p.raw) : p.text) : String(own(vars, k) ?? '');
      }
      case 'pipe': return String(c.pipe ?? '');
      default: { const ext = X.macros.get(name); if (!ext && !rest.length && c.pv && own(c.pv, nameRaw.trim())) return c.pv[nameRaw.trim()].text;   // {{이름}} 만 써도 프리셋 변수로 읽는다
        if (!ext) return null; try { return String(ext.fn(args, c) ?? ''); } catch (e) { console.warn('[확장 매크로]', name, e); return ''; } }
    }
  };
  let out = text;
  for (let pass = 0; pass < 4 && out.includes('{{'); pass++) {
    const next = out.replace(/\{\{([^{}]*)\}\}/g, (_m, b: string) => { const r = one(b); return r === null ? '\u0001' + b + '\u0002' : r; });
    if (next === out) break; out = next;
  }
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\u0001/g, '{{').replace(/\u0002/g, '}}').replace(/<USER>/gi, c.user ?? '').replace(/<BOT>|<CHAR>/gi, c.char ?? '');
  // eslint-disable-next-line no-control-regex
  if (out.includes('\u0000TRIM\u0000')) out = out.replace(/\s*\u0000TRIM\u0000\s*/g, '');
  if (out.includes('\u0003')) out = X.gate ? X.gate.post(out) : caseFold(out);   // {{uppercase}}…{{/uppercase}} 따위의 표식
  return out;
}

/** 엔진 · 기능이 프롬프트를 만들 때 스스로 채우는 자리 (빈자리로 묻지 않는다) */
const ENGINE_SLOTS = new Set(['slot', 'direction', 'clock_command', 'call_command', 'else', 'tools', 'cast', 'names', 'rooms', 'scope', 'place', 'note', 'prompt', 'shape', 'about', 'what', 'next', 'title', 'max', 'match', 'name']);
/** 프리셋 글에 {{이름}} 으로만 쓰였고 매크로도 · 정의된 변수도 아닌 빈자리 이름들 (새 대화를 열 때 직접 적게 한다) */
export function looseSlots(preset: Preset | null | undefined): string[] {
  if (!preset) return [];
  // 사람이 쓰는 글 블록만 본다 (요약 자리 같은 블록의 {{slot}} 은 엔진이 채운다)
  const texts = [...(preset.blocks || []).filter(b => b.enabled !== false && ['text', 'main', 'jailbreak'].includes(b.kind)).map(b => b.content), ...['prefill', 'continueNudge', 'impersonatePrompt', 'groupNudge'].map(k => preset.params?.[k])];
  const defined = new Set((preset.vars || []).map(v => v.name)), out: string[] = [];
  // 대화 중에 값이 차는 기본 매크로({{user}} · {{char}} …)가 비어 보이지 않게 아무 글이나 넣어 둔 자리로 시험한다
  const f = 'x', probeCtx = { user: f, char: f, group: f, persona: f, description: f, personality: f, scenario: f, mesExamples: f, model: f, input: f, lastMessage: f, lastUserMessage: f, lastCharMessage: f, original: f, pipe: f } as Ctx;
  for (const tx of texts) for (const n of bareNames(tx)) {
    if (defined.has(n) || out.includes(n) || ENGINE_SLOTS.has(n.toLowerCase())) continue;
    const probe = '{{' + n + '}}'; let r = probe; try { r = macro(probe, probeCtx); } catch { r = ''; }
    if (r === probe) out.push(n);   // 아무도 풀지 못했다 = 빈자리
  }
  return out;
}
/** 조건식이 읽을 값들 */
export const condEnv = (c: Ctx): CondEnv => ({ pv: c.pv, vars: c.vars, gvars: S.settings.globalVars, scope: c.scope, kw: c });
/** 조건식 하나를 지금 대화 기준으로 판정한다 */
export const testCond = (expr: unknown, c: Ctx) => evalCond(macro(askCond(String(expr || ''), c), c), condEnv(c));
/** 조건식 안의 ask:"…" (모델에게 묻는 판정문)를 판정 결과로 바꾼다. 물음 기능이 없으면 거짓으로 읽힌다 */
function askCond(cond: string, c: Ctx): string { return cond.indexOf('ask') < 0 || !/(^|[^\w.])ask\s*:/i.test(cond) ? cond : X.gate ? X.gate.cond(cond, c) : cond.replace(/(^|[^\w.])ask\s*:\s*"[^"]*"/gi, '$1(0 > 1)'); }

// ── 정규식 스크립트 ──
// 범위는 셋: 전역(S.regex 의 scope 'global') · 프리셋(preset.regex — 프리셋에 실려 다닌다) · 캐릭터(S.regex 의 scope = 캐릭터 id).
// 적용 순서는 과 같다: 전역 → 프리셋 → 캐릭터, 한 범위 안에서는 order 순(같으면 만든 순).
const reCache = new Map<string, RegExp | null>();
export function compileRegex(src: string): RegExp | null {
  if (reCache.has(src)) return reCache.get(src) as RegExp | null;
  let re: RegExp | null = null;
  try {
    const m = String(src).match(/^\/([\s\S]+)\/([a-z]*)$/);
    re = m ? new RegExp(m[1], m[2]) : new RegExp(src, 'g');
  } catch { re = null; }
  if (reCache.size > 2000) reCache.clear();
  reCache.set(src, re);
  return re;
}
let regexChat: Chat | null = null;   // 지금 열려 있는 대화 — 화면 표시처럼 대화를 넘겨받지 못한 호출이 범위(캐릭터 · 프리셋)를 알 수 있게
on('chat:open', (c: Chat | null) => { regexChat = c || null; }); on('chat:deleted', (id: string) => { if (regexChat?.id === id) regexChat = null; });
export type Who = 'user' | 'ai' | 'slash' | 'lore' | 'reason';
export type Target = 'display' | 'prompt' | 'store';
const REGEX_ON: Record<string, 'onUser' | 'onAI' | 'onSlash' | 'onLore' | 'onReason'> = { user: 'onUser', ai: 'onAI', slash: 'onSlash', lore: 'onLore', reason: 'onReason' };
const reNum = (v: unknown) => (v == null || v === '' || isNaN(+(v as number)) ? null : +(v as number));
const byOrder = (list: Regex[]) => list.map((r, i) => [r, i] as const).sort((a, b) => (+(a[0].order as number) || 0) - (+(b[0].order as number) || 0) || a[1] - b[1]).map(x => x[0]);
/** 캐릭터 · 프리셋에 실린 정규식을 써도 되는가. kind: 'chars' | 'presets'. 값이 없으면 허용(직접 만든 것), 'ask' 는 가져온 뒤 아직 묻지 않은 것 */
export const regexAllowed = (kind: 'chars' | 'presets', id?: string) => { const v = S.settings.regexAllow?.[kind]?.[id as string]; return v === undefined || v === true; };
export type ScopeKind = 'global' | 'preset' | 'char';
export interface ScriptIt { r: Regex; kind: ScopeKind; owner: string; skip: string }
export interface ScriptsOpts { chat?: Chat | null; charId?: string; preset?: Preset | null; all?: boolean }
/** 적용 순서대로 줄 세운 스크립트 [{ r, kind: 'global'|'preset'|'char', owner, skip }]. all 이면 지금 범위가 아닌 것도 이유(skip)를 달아 함께 돌려준다 */
export function regexScripts({ chat, charId, preset, all = false }: ScriptsOpts = {}): ScriptIt[] {
  if (chat === undefined) chat = regexChat;
  const ids = chat?.charIds?.length ? chat.charIds : (charId ? [charId] : []), solo = ids.length === 1;
  const pre = preset === undefined ? (chat ? S.presetFor(chat) : S.preset()) : preset;
  const out: ScriptIt[] = [];
  for (const r of byOrder(S.regex.filter(r => !r.scope || r.scope === 'global'))) out.push({ r, kind: 'global', owner: '', skip: '' });
  for (const p of all ? [pre, ...S.presets.filter(x => x !== pre)].filter(Boolean) as Preset[] : [pre].filter(Boolean) as Preset[]) {
    const skip = p !== pre ? 'scope:preset' : regexAllowed('presets', p.id) ? '' : 'blocked:preset';
    if (skip && !all) continue;
    for (const r of arr(p.regex as Regex[])) if (r && typeof r === 'object') out.push({ r, kind: 'preset', owner: p.id, skip });
  }
  // 1:1 대화에서는 그 캐릭터의 스크립트가 방 전체에, 그룹에서는 그 캐릭터가 쓴 메시지에만 적용된다
  const mine = (r: Regex) => ids.includes(r.scope as string) && (solo || r.scope === charId);
  const scoped = byOrder(S.regex.filter(r => r.scope && r.scope !== 'global'));
  for (const r of [...scoped.filter(mine), ...(all ? scoped.filter(r => !mine(r)) : [])]) {
    const skip = !mine(r) ? 'scope:char' : regexAllowed('chars', r.scope) ? '' : 'blocked:char';
    if (skip && !all) continue;
    out.push({ r, kind: 'char', owner: r.scope as string, skip });
  }
  return out;
}
export interface SkipOpts { who?: string; target?: string; depth?: number; edit?: boolean }
/** 이 스크립트를 건너뛰는 이유. 돌려도 되면 ''. off 꺼짐 · nofind 찾기 없음 · place 대상 아님 · mode 적용 방식 다름 · edit 고칠 때 안 돎 · min/max 깊이 밖 */
export function regexSkip(r: Regex, { who = 'ai', target = 'display', depth, edit = false }: SkipOpts = {}): string {
  if (!r.enabled) return 'off';
  if (!r.find) return 'nofind';
  if (!r[REGEX_ON[who] || 'onAI']) return 'place';
  // mode: store(저장되는 원문 변경) · display(화면만) · prompt(전송만) · both(화면+전송)
  if (target === 'store' ? r.mode !== 'store' : (r.mode !== target && r.mode !== 'both')) return 'mode';
  if (edit && r.runOnEdit !== true) return 'edit';
  if (target !== 'store' && typeof depth === 'number') {
    const lo = reNum(r.minDepth), hi = reNum(r.maxDepth);
    if (lo !== null && lo >= -1 && depth < lo) return 'min';
    if (hi !== null && hi >= 0 && depth > hi) return 'max';
  }
  return '';
}
const ESC_MAP: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\v': '\\v', '\f': '\\f', '\0': '\\0' };
const escMacro = (x: unknown) => String(x).replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/g, s => ESC_MAP[s] || '\\' + s);
/** 찾기 문장에 매크로를 넣은 결과. subst: 0 그대로 · 1 값을 그대로 넣기 · 2 정규식 기호를 글자로 바꿔 넣기 (값이 없는 옛 스크립트는 매크로가 보이면 1) */
export function regexFind(r: Regex, ctx: Ctx | null | undefined): string {
  const find = String(r.find || ''), mode = Number(r.subst ?? (find.includes('{{') ? 1 : 0));
  if (!mode || !ctx || !find.includes('{{')) return find;
  return mode === 2 ? find.replace(/\{\{[^{}]*\}\}/g, t => { const v = macro(t, ctx); return v === t ? t : escMacro(v); }) : macro(find, ctx);
}
export interface Match { index: number; match: string; groups: (string | undefined)[]; named: Record<string, string | undefined> | null; raw: string; cut: string; out: string }
export interface Trace { source?: string; matches?: Match[]; error?: string }
/** 스크립트 하나를 글에 돌린다. trace(빈 객체)를 주면 source · error · matches[{ index, match, groups, named, raw, cut, out }] 를 채운다 */
export function runRegexScript(r: Regex, text: string, ctx?: Ctx | null, trace?: Trace): string {
  const src = regexFind(r, ctx), re = compileRegex(src);
  if (trace) { trace.source = src; trace.matches = []; trace.error = re ? '' : 'compile'; }
  if (!re || !text) return text;
  re.lastIndex = 0;
  let rep = String(r.replace ?? '').replace(/\{\{match\}\}/gi, '$0');
  // 바꿀 문장 안 스크립트의 한 줄 주석(// …)에 가져온 글이 들어가는 자리: 여러 줄이면 주석 밖으로 새어 스크립트가 통째로 죽는다 → 그 자리만 한 줄로 편다
  if (rep.includes('<script') && rep.includes('//')) rep = rep.replace(/^[ \t]*\/\/[^\n]*$/gm, line => line.replace(/\$(\d+)/g, '$\u0001$1'));
  const trims = arr(r.trim as string[]).filter(t => typeof t === 'string' && t).map(t => (ctx ? macro(t, ctx) : t)).filter(Boolean);
  return text.replace(re, (...a: unknown[]) => {
    const named = typeof a[a.length - 1] === 'object' ? a.pop() as Record<string, string | undefined> : null;
    const whole = a.pop() as string, index = a.pop() as number, caps = a.slice(1) as (string | undefined)[];
    const fill = (cutting: boolean) => rep.replace(/\$(\u0001?)(\d+)|\$<([^>]+)>/g, (_, flat: string, n: string, name: string) => {
      let v = name ? named?.[name] : (+n === 0 ? a[0] as string : caps[+n - 1]);
      if (!v) return '';
      if (flat) v = v.replace(/\s*\r?\n\s*/g, ' ');
      if (cutting) for (const t of trims) v = v.split(t).join('');   // 다듬기 문자열은 가져온 부분($n · {{match}})에서만 지운다
      return v;
    });
    const cut = fill(true);
    let out = ctx ? macro(cut, ctx) : cut;         // 매크로는 맨 마지막에
    // 바꾼 결과가 코드블록(```)이면 앞뒤가 빈 줄로 떨어져 있어야 블록으로 읽힌다 (문장 한가운데나 <details> 같은 HTML 줄 바로 밑이면 글자로 남는다): 앞뒤를 빈 줄로 떼어 준다
    if (/^\s*```/.test(out) && index > 0 && !/\n[^\S\n]*\n\s*$/.test(whole.slice(Math.max(0, index - 8), index))) out = '\n\n' + out.replace(/^\s+/, '');
    const after = index + String(a[0]).length;
    if (/```\s*$/.test(out) && after < whole.length && !/^[^\S\n]*\r?\n[^\S\n]*\r?\n/.test(whole.slice(after, after + 8))) out = out.replace(/\s+$/, '') + '\n\n';
    if (trace && (trace.matches as Match[]).length < 2000) (trace.matches as Match[]).push({ index, match: a[0] as string, groups: caps, named, raw: trims.length ? fill(false) : cut, cut, out });
    return out;
  });
}
let autoCtx: { chat: Chat; charId?: string; ctx: Ctx } | null = null;   // 매크로 문맥을 넘겨받지 못한 호출(화면 표시)을 위해 한 번 만들어 같은 틱 동안 돌려쓴다
function regexCtx(chat: Chat | null | undefined, charId?: string): Ctx | null {
  if (!chat) return null;
  if (autoCtx && autoCtx.chat === chat && autoCtx.charId === charId) return autoCtx.ctx;
  const chars = arr(chat.charIds).map(id => S.get('chars', id) as Char | undefined).filter(Boolean) as Char[];
  const ctx = makeCtx({ chat, char: chars.find(c => c.id === charId) || chars[0], chars, persona: S.persona(chat), msgs: [] });
  if (!autoCtx) queueMicrotask(() => { autoCtx = null; });
  autoCtx = { chat, charId, ctx };
  return ctx;
}
export interface RegexEnv { who: string; target: string; depth?: number; charId?: string; chat: Chat | null | undefined; preset?: Preset | null; edit: boolean; readonly ctx: Ctx | null }
export interface EnvOpts { who?: string; target?: string; depth?: number; charId?: string; ctx?: Ctx | null; chat?: Chat | null; preset?: Preset | null; edit?: boolean }
/** 호출 인자를 한 벌의 조건으로. who: 'user'|'ai'|'slash'|'lore'|'reason', target: 'display'|'prompt'|'store', edit: 메시지를 고쳐 저장할 때 */
export function regexEnv({ who = 'ai', target = 'display', depth, charId, ctx, chat, preset, edit = false }: EnvOpts = {}): RegexEnv {
  if (chat === undefined) chat = ctx?.chat || regexChat;
  if (target === 'prompt' && ctx?.type === 'continue' && typeof depth === 'number' && who !== 'lore') depth -= 1;   // 이어 쓰는 메시지는 깊이 -1
  let made: Ctx | null | undefined;
  const ch = chat;
  return { who, target, depth, charId, chat, preset, edit, get ctx() { return ctx || (made === undefined ? (made = regexCtx(ch, charId)) : made); } };
}
export interface Step { id: string; name: string; kind: ScopeKind; owner: string; r: Regex; skip: string; before?: string; after?: string; source?: string; matches?: Match[] }
/** 파이프라인의 한 단계: 건너뛰면 { skip }, 돌리면 { before, after, source, matches } */
export function regexStep(it: ScriptIt, text: string, env: RegexEnv): Step {
  const base = { id: it.r.id, name: it.r.name, kind: it.kind, owner: it.owner, r: it.r }, skip = it.skip || regexSkip(it.r, env);
  if (skip) return { ...base, skip };
  const t: Trace = {}, after = runRegexScript(it.r, text, env.ctx, t);
  return { ...base, skip: t.error ? 'badregex' : '', before: text, after, source: t.source, matches: t.matches };
}
/** 글 하나가 어떤 스크립트를 어떤 순서로 거치는지 (디버거용). applyRegex 와 같은 판정 · 같은 실행을 쓴다 */
export function traceRegex(textIn: string, opts: EnvOpts = {}): { out: string; steps: Step[] } {
  let text = textIn;
  const env = regexEnv(opts), steps: Step[] = [];
  for (const it of regexScripts({ chat: env.chat, charId: env.charId, preset: env.preset, all: true })) { const s = regexStep(it, text, env); steps.push(s); if (!s.skip) text = s.after as string; }
  return { out: text, steps };
}
export function applyRegex<T>(textIn: T, opts: EnvOpts = {}): T {
  if (!textIn || typeof textIn !== 'string') return textIn;
  let text: string = textIn;
  const env = regexEnv(opts);
  for (const it of regexScripts(env)) { if (regexSkip(it.r, env)) continue; text = runRegexScript(it.r, text, env.ctx); if (!text) break; }
  return text as T;
}

// ── 로어북 ──
// 월드 인포의 발동 규칙을 따른다: 모든 책의 항목을 한 줄로 세워 훑고(초기 → 연쇄 → 최소 발동 수), 묶음·확률·예산 순으로 거른다.
const LORE_MAX_DEPTH = 1000, LORE_MAX_STEPS = 24;
const LORE_TRIGGER: Record<string, string[]> = { normal: ['normal'], continue: ['continue'], impersonate: ['impersonate'], regen: ['regenerate', 'swipe'], swipe: ['swipe', 'regenerate'], quiet: ['quiet'] };
let lastLore: LoreHit[] = [];
/** 스캔 진단 (보기 전용 — 결과에는 영향을 주지 않는다). hit: 항목 → 무엇에 걸려 깨어났나 (constant · sticky · vector · ask · key:글 · chain:글) /
 *  skip: 항목 → 왜 빠졌나 (filter · delay · cooldown · group · chance · budget · ask) / used: 책 → 쓴 토큰 */
export interface LoreDiag { hit: Record<string, string>; skip: Record<string, string>; used: Record<string, number>; chatId?: string; commit?: boolean; at?: number }
let diagLast: LoreDiag | null = null, diagReal: LoreDiag | null = null;
/** 마지막 스캔의 진단. real 이면 실제 생성 때의 것만 */
export const loreDiag = (real = false) => real ? diagReal : diagLast;
/** 마지막 실제 생성에서 발동한 항목들 (자동 실행 연결용) */
export const loreFired = () => lastLore;

interface KeyFlags { cs: boolean; ww: boolean; rx: boolean; mx: (k: unknown) => string }
function keyMatch(keyIn: unknown, hay: string, hayLower: string, f: KeyFlags): boolean {
  const key = String(keyIn).trim();
  if (!key) return false;
  const rx = key.match(/^\/([\s\S]+)\/([a-z]*)$/);
  if (rx || f.rx) {
    try { return new RegExp(rx ? rx[1] : key, rx ? rx[2] : (f.cs ? '' : 'i')).test(hay); } catch { return false; }
  }
  const h = f.cs ? hay : hayLower, k = f.cs ? key : key.toLowerCase();
  // eslint-disable-next-line no-control-regex
  if (f.ww && /^[\x00-\x7f]+$/.test(k)) {
    return new RegExp('(?:^|[^\\w])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[^\\w])').test(h);
  }
  return h.includes(k);
}
function entryHit(e: LoreEntry, hay: string, hayLower: string, f: KeyFlags): boolean {
  if (!e.keys?.length || !e.keys.some(k => keyMatch(f.mx(k), hay, hayLower, f))) return false;
  const k2 = (e.keys2 || []).filter(Boolean);
  if (!k2.length) return true;
  const hits = k2.map(k => keyMatch(f.mx(k), hay, hayLower, f));
  switch (+(e.logic as number) || 0) {
    case 1: return !hits.every(Boolean);     // NOT ALL
    case 2: return !hits.some(Boolean);      // NOT ANY
    case 3: return hits.every(Boolean);      // AND ALL
    default: return hits.some(Boolean);      // AND ANY
  }
}
/** 묶음 점수: 걸린 키워드 수 (보조 키워드는 긍정 조건일 때만 더한다) */
function entryScore(e: LoreEntry, hay: string, hayLower: string, f: KeyFlags): number {
  const k1 = (e.keys || []).filter(Boolean), k2 = (e.keys2 || []).filter(Boolean);
  if (!k1.length) return 0;
  const p = k1.filter(k => keyMatch(f.mx(k), hay, hayLower, f)).length, s = k2.filter(k => keyMatch(f.mx(k), hay, hayLower, f)).length;
  if (k2.length) { if ((+(e.logic as number) || 0) === 0) return p + s; if (+(e.logic as number) === 3) return s === k2.length ? p + s : p; }
  return p;
}
const groupsOf = (e: LoreEntry) => String(e.group || '').split(/,\s*/).map(g => g.trim()).filter(Boolean);
const untilRec = (e: LoreEntry) => (e.delayUntilRecursion as unknown) === true ? 1 : Math.max(0, +(e.delayUntilRecursion as number) || 0);

export interface ScanOpts { state?: LoreState; count?: number; commit?: boolean; type?: string; char?: Char | null; persona?: Persona | null; names?: string[] | null; /** 진단을 여기에 적는다 */ diag?: LoreDiag }
interface Item { e: LoreEntry; book: LoreBook }
/**
 * books: 로어북들 · history: [{ content }] (오래된 것부터) · ctx: 매크로 문맥
 * opt: state(유지·쿨다운 기록) · count(대화 길이) · commit(실제 생성인지) · type(생성 종류) · char · persona · names(history 와 나란한 화자 이름)
 */
export function scanLore(books: LoreBook[], history: { content?: string | null }[], ctx: Ctx, { state = {}, count = history.length, commit = false, type = 'normal', char = null, persona = null, names = null, diag }: ScanOpts = {}): LoreHit[] {
  const G: LoreSettings = S.settings.lore || {};
  const D: LoreDiag = diag || { hit: {}, skip: {}, used: {} }; D.chatId = ctx.chat?.id; D.commit = commit; D.at = Date.now(); diagLast = D; if (commit) diagReal = D;
  /** 항목에 걸린 물음: 'need' = 깨어난 뒤 물음도 참이어야 · 'wake' = 물음이 참이면 키워드 없이도. 답이 없으면 아니오 */
  const askOf = (e: LoreEntry) => (e.askMode === 'need' || e.askMode === 'wake') && String(e.ask || '').trim() ? e.askMode : '', askYes = (e: LoreEntry) => !!X.gate?.lore(e, ctx);
  const texts = history.map((m, i) => (G.includeNames && names?.[i] ? names[i] + ': ' : '') + (m.content || ''));
  const mxk = (kIn: unknown) => { const k = String(kIn); return k.includes('{{') ? macro(k, ctx) : k; };
  const trig = LORE_TRIGGER[type] || [type];
  const card: [string, unknown][] = [['matchPersona', persona?.description], ['matchCharDesc', char?.description], ['matchCharPersonality', char?.personality], ['matchCharNote', char?.depthPrompt?.prompt], ['matchScenario', char?.scenario], ['matchCreatorNotes', char?.creatorNotes]];
  const charTags = (char?.tags || []).map(t => String(t).toLowerCase()), charName = String(char?.name || '').toLowerCase();

  const all: Item[] = [];
  for (const book of books) for (const e of book.entries || []) if (e.enabled !== false && (e.content || '').trim()) all.push({ e, book });
  all.sort((a, b) => (+!!b.e.constant - +!!a.e.constant) || (ordOf(b.e.order) - ordOf(a.e.order)));
  if (!all.length) { if (commit) lastLore = []; return []; }

  const flagsOf = (it: Item): KeyFlags => ({ cs: it.e.caseSensitive ?? it.book.caseSensitive ?? false, ww: it.e.wholeWord ?? it.book.wholeWord ?? false, rx: !!it.e.useRegex, mx: mxk });
  const isSticky = (e: LoreEntry) => (state[e.id]?.sticky || 0) > count;
  const isCool = (e: LoreEntry) => (state[e.id]?.cool || 0) > count;
  const baseDepth = Math.max(0, ...books.map(b => +(b.scanDepth ?? 4) || 0));
  const recurse: string[] = []; let skew = 0, st = 'initial', steps = 0, ver = 0;
  const cache = new Map<string, { h: string; l: string }>();
  /** 이 항목이 살필 글: 최근 메시지 + (고른) 카드 필드 + 연쇄로 불려 나온 내용 */
  const hayOf = (it: Item) => {
    const e = it.e, own = e.scanDepth != null && (e.scanDepth as unknown) !== '';
    const depth = Math.min(LORE_MAX_DEPTH, Math.max(0, own ? +(e.scanDepth as Num) || 0 : (+(it.book.scanDepth ?? 4) || 0) + skew));
    const fields = card.filter(([k, v]) => e[k] && v).map(([k]) => k).join(','), rec = st !== 'min' && it.book.recursive && recurse.length > 0;
    const key = `${depth}|${fields}|${rec ? ver : '-'}`;
    let hit = cache.get(key);
    if (!hit) {
      const parts = depth ? texts.slice(-depth) : [];
      for (const [k, v] of card) if (e[k] && v) parts.push(mxk(v));
      if (rec) parts.push(...recurse);
      const h = parts.join('\n'); hit = { h, l: h.toLowerCase() }; cache.set(key, hit);
    }
    return hit;
  };

  const activated = new Map<string, { it: Item; text: string; tok: number }>(), failed = new Set<string>(), used = new Map<string, number>();
  const levels = [...new Set(all.map(it => untilRec(it.e)).filter(Boolean))].sort((a, b) => a - b);
  let level = levels.shift() ?? 0;

  /** 같은 묶음에서는 하나만: 유지 중인 것 → 점수 → 우선 항목 → 가중치 추첨 */
  const filterGroups = (now: Item[]) => {
    const groups = new Map<string, Item[]>();
    for (const it of now) for (const g of groupsOf(it.e)) { if (!groups.has(g)) groups.set(g, []); (groups.get(g) as Item[]).push(it); }
    const drop = (it: Item) => { const i = now.indexOf(it); if (i >= 0) { now.splice(i, 1); D.skip[it.e.id] = 'group'; delete D.hit[it.e.id]; } };
    for (const [key, members] of groups) {
      let grp = members.filter(it => now.includes(it));
      const stuck = grp.filter(it => isSticky(it.e));
      if (stuck.length) { for (const it of grp) if (!stuck.includes(it)) drop(it); continue; }
      if (grp.some(it => it.e.useGroupScoring ?? G.groupScoring)) {
        const scores = grp.map(it => { const h = hayOf(it); return entryScore(it.e, h.h, h.l, flagsOf(it)); }), max = Math.max(...scores);
        grp = grp.filter((it, i) => { if ((it.e.useGroupScoring ?? G.groupScoring) && scores[i] < max) { drop(it); return false; } return true; });
      }
      if ([...activated.values()].some(a => groupsOf(a.it.e).includes(key))) { grp.forEach(drop); continue; }
      if (grp.length <= 1) continue;
      const prio = grp.filter(it => it.e.groupOverride ?? true);   // 예전 드림랜드 항목(값 없음)은 우선순위가 가장 높은 하나
      if (prio.length) { for (const it of grp) if (it !== prio[0]) drop(it); continue; }
      const total = grp.reduce((n, it) => n + (+(it.e.groupWeight ?? 100) || 0), 0); let r = Math.random() * total, win = grp[grp.length - 1];
      for (const it of grp) { r -= (+(it.e.groupWeight ?? 100) || 0); if (r <= 0) { win = it; break; } }
      for (const it of grp) if (it !== win) drop(it);
    }
  };

  while (st && steps < LORE_MAX_STEPS) {
    if (+(G.maxRecursion as Num) > 0 && +(G.maxRecursion as Num) <= steps) break;
    steps++;
    const now: Item[] = [];
    for (const it of all) {
      const e = it.e;
      if (failed.has(e.id) || activated.has(e.id)) continue;
      if (e.triggers?.length && !e.triggers.some(t => trig.includes(t))) { D.skip[e.id] = 'filter'; continue; }   // 생성 종류
      const cf = e.charFilter;
      if (cf?.names?.length) { const inc = cf.names.some(n => String(n).toLowerCase() === charName); if (cf.exclude ? inc : !inc) { D.skip[e.id] = 'filter'; continue; } }
      if (cf?.tags?.length) { const inc = cf.tags.some(t => charTags.includes(String(t).toLowerCase())); if (cf.exclude ? inc : !inc) { D.skip[e.id] = 'filter'; continue; } }
      const sticky = isSticky(e);
      if (e.delay && count < +e.delay) { D.skip[e.id] = 'delay'; continue; }                           // 대화가 N개 쌓이기 전에는 잠듦
      if (isCool(e) && !sticky) { D.skip[e.id] = 'cooldown'; continue; }                               // 쿨다운 중
      const dur = untilRec(e);
      if (st !== 'recursion' && dur && !sticky) continue;                                              // 연쇄 단계에서만 깨어나는 항목
      if (st === 'recursion' && dur > level && !sticky) continue;
      if (st === 'recursion' && e.excludeRecursion && !sticky) continue;                               // 연쇄로는 깨어나지 않는 항목
      const ask = askOf(e), vec = !e.constant && !sticky && st === 'initial' && !!X.loreVec?.(e.id);
      if (e.constant || sticky || vec) {   // 벡터 검색이 뜻으로 찾아 깨운 항목
        if (ask === 'need' && !sticky && !askYes(e)) { D.skip[e.id] = 'ask'; continue; }   // 유지 중인 항목은 다시 묻지 않는다
        D.hit[e.id] = sticky ? 'sticky' : e.constant ? 'constant' : 'vector'; now.push(it); continue;
      }
      if (ask === 'wake' && st === 'initial') { if (askYes(e)) { D.hit[e.id] = 'ask'; now.push(it); continue; } D.skip[e.id] = 'ask'; }   // 물음이 참이면 키워드 없이도 깨어난다 (아니면 키워드를 본다)
      if (!e.keys?.length) continue;
      const hay = hayOf(it);
      if (hay.h && entryHit(e, hay.h, hay.l, flagsOf(it))) {
        if (ask === 'need' && !askYes(e)) { D.skip[e.id] = 'ask'; continue; }
        const f = flagsOf(it); D.hit[e.id] = (st === 'recursion' ? 'chain:' : 'key:') + String(e.keys.find(k => keyMatch(f.mx(k), hay.h, hay.l, f)) ?? '');
        now.push(it);
      }
    }
    if (now.length > 1) { const idx = new Map(now.map((it, i) => [it, i])); now.sort((a, b) => (+isSticky(b.e) - +isSticky(a.e)) || (idx.get(a) as number) - (idx.get(b) as number)); }
    filterGroups(now);
    const fresh: Item[] = [];
    for (const it of now) {
      const e = it.e, bid = it.book.id;
      if (+(e.probability ?? 100) < 100 && !isSticky(e) && Math.random() * 100 > +(e.probability as Num)) { failed.add(e.id); D.skip[e.id] = 'chance'; delete D.hit[e.id]; continue; }
      const text = applyRegex(macro(tpl(e.content, ctx), ctx), { who: 'lore', target: 'prompt', depth: e.position === 'depth' ? +(e.depth ?? 4) : undefined, ctx }), t = tokens(text), u = used.get(bid) || 0;
      if (!e.ignoreBudget) { if (u + t > +(it.book.tokenBudget || 2048) && u > 0) { D.skip[e.id] = 'budget'; continue; } used.set(bid, u + t); D.used[bid] = u + t; }
      activated.set(e.id, { it, text, tok: t }); fresh.push(it); delete D.skip[e.id];
    }
    const rec = fresh.filter(it => !it.e.noRecurse && it.book.recursive);
    let next = rec.length ? 'recursion' : '';
    if (!next && st === 'min' && recurse.length) next = 'recursion';
    if (!next && +(G.minActivations as Num) > 0 && activated.size < +(G.minActivations as Num)) {
      const d = baseDepth + skew;
      if (!((+(G.minDepthMax as Num) > 0 && d >= +(G.minDepthMax as Num)) || d >= texts.length)) { next = 'min'; skew++; }   // 정한 깊이(또는 대화 끝)를 넘겨서는 살피지 않는다
    }
    if (!next && levels.length) { next = 'recursion'; level = levels.shift() as number; }
    st = next;
    if (st) { for (const it of rec) recurse.push((activated.get(it.e.id) as { text: string }).text); ver++; }
  }

  if (commit) for (const { it: { e } } of activated.values()) if (!isSticky(e) && (e.sticky || e.cooldown)) state[e.id] = { sticky: e.sticky ? count + +e.sticky : 0, cool: e.cooldown ? count + (+(e.sticky as Num) || 0) + +e.cooldown : 0 };
  const out: LoreHit[] = [...activated.values()].map(a => ({ ...a.it.e, text: a.text, book: a.it.book.name, bookId: a.it.book.id, tok: a.tok })).sort((a, b) => ordOf(a.order) - ordOf(b.order));
  if (commit) lastLore = out;
  return out;
}

// ── 프롬프트 조립 ──
export const GROUP_NUDGE = '[Write the next reply only as {{char}}. Do not write for the other characters or for {{user}}.]';
export const CONTINUE_NUDGE = '[Continue your last message exactly from where it stopped. Do not repeat or restart it; write only the continuation.]';
export const IMPERSONATE_NUDGE = "[Write the next message from {{user}}'s point of view, in {{user}}'s voice, based on the story so far. Write only {{user}}'s message and do not write for {{char}}.]";

/** 이번 생성의 프롬프트에 실을 로어북들 (기능이 항목을 거를 수 있다: X.loreFilter) */
export function loreBooksFor(chat: Chat, chars: Char[], persona?: Persona | null): LoreBook[] {
  const books = activeBooks(chat, chars, persona);
  if (!X.loreFilter) return books;
  try { return X.loreFilter(books, { chat, chars, persona }); } catch (e) { console.warn('[로어북 거르기]', e); return books; }
}
export function activeBooks(chat: Chat, chars: Char[], persona?: Persona | null): LoreBook[] {
  const ids = new Set([...(S.settings.activeLore || []), ...(chat.loreIds || []), ...chars.flatMap(c => c.loreIds || []), ...(persona?.loreIds || [])]);
  return [...ids].map(id => S.get('lore', id) as LoreBook | undefined).filter(Boolean) as LoreBook[];
}

export interface CtxInput { chat: Chat; char?: Char | null; chars: Char[]; persona?: Persona | null; msgs: Msg[]; input?: string }
export function makeCtx({ chat, char, chars, persona, msgs, input }: CtxInput): Ctx {
  const vis = msgs.filter(m => !m.hidden);
  const last = (r: (m: Msg) => boolean) => { const m = [...vis].reverse().find(r); return m ? msgText(m) : ''; };
  return {
    user: persona?.name || S.settings.userNameFallback, char: char?.name || '', group: chars.map(c => c.name).join(', '),
    persona: persona?.description || '', description: char?.description || '', personality: char?.personality || '', scenario: char?.scenario || '',
    mesExamples: char?.mesExample || '', model: S.connFor(chat)?.model || '', input: input || '', vars: chat.vars ||= {},
    lastMessage: last(() => true), lastUserMessage: last(m => m.role === 'user'), lastCharMessage: last(m => m.role === 'assistant'),
    pv: pvResolve(S.presetFor(chat), chat), mode: chat.mode === 'talk' ? 'talk' : 'rp', chat,
  };
}

// ── 연출 지시: 사용자가 대사가 아니라 작가로서 적은 지시 (msg.direct) ──
export const DIRECT_DEFAULT = `<direction>
A note from the author, written outside the story. {{user}} does not say or do this inside the scene.
It is for your next reply only, and it comes first: where it clashes with the pace or the turn you had in mind, follow the note.
Play it out inside the story — through narration and through {{char}}'s own actions and words — and keep continuity with what has already happened. Never quote, mention or answer the note itself.
[Direction: {{direction}}]
</direction>`;
export const DIRECT_PAST = '[Author direction: {{direction}}]';
/** 지금 쓰는 답변에 걸린 연출 지시: 맨 끝 메시지이거나, 이어 쓰는 답변의 바로 앞 메시지 */
function liveDirect(source: Msg[], type: string): Msg | null {
  const n = source.length - 1, last = source[n];
  if (last?.direct && last.role === 'user') return last;
  const prev = source[n - 1];
  return type === 'continue' && last?.role === 'assistant' && prev?.direct && prev.role === 'user' ? prev : null;
}
/** 연출 지시 메시지를 프롬프트용 글로. 마지막 것은 지시문 전체, 지난 것은 짧은 꼬리표(또는 빼기 → null) */
function directText(text: string, isLast: boolean, mx: (t?: string) => string): string | null {
  const D = S.settings.direct || {};
  if (isLast) return mx(D.prompt || DIRECT_DEFAULT).replace(/\{\{direction\}\}/gi, () => text);
  if (D.past !== 'note') return null;
  return mx(D.pastFormat || DIRECT_PAST).replace(/\{\{direction\}\}/gi, () => text);
}

// ════════ 대화 모드 (메신저) ════════
// 프리셋의 프롬프트 블록을 쓰지 않고, 전용 지시문 + 캐릭터 카드 + 시각이 찍힌 기록 + 지금 상황으로 조립한다.
export const TALK_DEFAULT = `You are {{char}}, texting {{user}} in a private messenger. You are a person with your own day, moods and things to do — not a narrator and not an assistant. Unless the chat shows otherwise, you two are in different places.
- Write only {{char}}'s side. Never write {{user}}'s messages, actions or feelings, and never treat a question you asked as already answered.
- Type the way {{char}} really would, in the language the chat is in: their words, their punctuation habits, emoji or none. Fragments and dropped punctuation are fine when they suit {{char}}.
- One line is one message bubble. Send 1 to 4 and let the moment decide: a bare "ok" when that is all there is, a quick burst when {{char}} is excited or upset. Do not fall into the same count and rhythm every turn.
- Feeling shows in word choice, pace and what is left unsaid, not in explaining it.
- Answer what {{user}} just said, then add something of your own: a reaction, an opinion, a piece of your day, a question you actually want answered. Do not hand their words back to them, and do not open or close the way your recent messages did.
- {{char}}'s tone toward {{user}} follows the relationship as the chat shows it. It warms or cools only when something in this conversation gives a reason. Being brief, distracted, teasing or slow to open up is fine if that is who {{char}} is.
- Do not end the chat for {{user}} — no sending them off to bed or to eat, no goodbyes — unless {{char}} has a real reason to go. Do not suddenly turn up where {{user}} is either; you meet only when the two of you have arranged it.
- The [HH:MM] marks on messages are only for your sense of time. Never write timestamps or your own name at the start of a message.`;
/**
 * 줄마다 무엇인지 표시하는 약속. 화면은 이 표시만 보고 말풍선 · 소리 내어 한 말 · 속마음 · 지문을 가른다 (코드로 추측하지 않는다).
 * 직접 쓴 대화 지시문을 써도 늘 붙는다
 */
export const TALK_LINES = `<format>
Every line you write is exactly one of four kinds, and the app draws each kind differently — so mark every line:
- plain line: a text message {{char}} types and sends; one line is one bubble. Almost everything is this. A long message is still one plain line.
- "double quotes": words spoken out loud, only while you two are physically together or on a call. A typed message never gets quotes.
- 'single quotes': a private thought {{user}} cannot see. Rare.
- *asterisks*: action or setting, one short line, only when it matters. Any sentence that describes what {{char}} does or what is around them — instead of being something {{char}} types — goes inside asterisks, never as a plain line.
One kind per line: a message and an action never share a line; split them. No narration paragraphs and no third-person storytelling outside asterisks.
</format>`;
/** 답을 쓰기 바로 앞에 한 번 더 (가까이 있는 지시를 더 잘 따른다) */
export const TALK_LINES_CHECK = 'Before sending, check each line: a plain typed message, "spoken words", \'a thought\' or *an action*. Anything that describes rather than texts goes inside *asterisks*.';
export const TALK_COMMANDS = `<commands>
Optional. Add one on its own line only when it really applies; most replies need none. They are removed before {{user}} sees your message, so never mention or explain them.
[react: emoji="😂"] — put one emoji on {{user}}'s last message, with or without a written reply.
[status: state="online|idle|dnd|offline", activity="what you are doing"] — your availability just changed (falling asleep, class starting, back home).
[selfie: context="what the photo shows"] — send a photo of yourself, only when asked or when {{char}} clearly would.
[memory: summary="one full sentence, with names instead of I or you"] — a lasting fact about {{user}} or a promise between you that is worth keeping. Not for small talk.{{clock_command}}{{call_command}}
</commands>`;
/** 캐릭터가 직접 전화를 거는 명령 (1:1 대화 모드 · 설정 › 전화에서 끌 수 있다) */
export const TALK_CALL_COMMAND = `\n[call: reason="why you are calling"] — phone {{user}} right now instead of texting. Only when {{char}} really would call at this moment: {{user}} asked you to call or to pick up, something urgent or emotional that texting cannot carry, or {{char}} simply needs to hear their voice. Not for routine replies. Write your messages first, then put this on the last line.`;
const hhmm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export interface BuildInput { chat: Chat; char: Char; chars: Char[]; persona?: Persona | null; preset: Preset; msgs: Msg[]; type?: string; commit?: boolean; proactive?: boolean }
type Inj = PromptMsg & { depth: Num; order: Num };
/** 이번 턴에 작가 노트를 넣을 차례인가 — freq 1(기본)은 매번, N 은 내 메시지 N 번마다, 0 은 넣지 않음 */
function noteDue(chat: Chat, msgs: Msg[]): boolean {
  if (!chat.note?.text) return false;
  const f = Math.round(Number(chat.note.freq ?? 1)); if (!Number.isFinite(f) || f === 1) return true; if (f <= 0) return false;
  const n = msgs.filter(m => m.role === 'user' && !m.hidden).length; return n > 0 && n % f === 0;
}
/** 기록이 길어 잘려 나간 앞부분 가운데 고정한 메시지 — 고정한 것은 오래돼도 프롬프트에 남는다 */
const pinnedBefore = (source: Msg[], history: PromptMsg[], start: number): PromptMsg[] => source.length === history.length ? history.slice(0, start).filter((_h, i) => source[i]?.pin === true) : [];
/** 기록 가공 훅: 프롬프트에 싣기 전에 기록을 "이번에 말할 캐릭터가 보고 들은 것"으로 바꾼다 (귓속말 · 자리에 없던 동안 · 끊긴 말 — src/threads 가 건다). 메시지를 고치려면 원본이 아니라 복사본을 돌려줘야 한다 */
export type HistoryLens = (source: Msg[], o: { chat: Chat; char: Char; chars: Char[]; type: string }) => Msg[];
let historyLens: HistoryLens | null = null;
export const setHistoryLens = (fn: HistoryLens | null) => { historyLens = fn; };
const lensed = (source: Msg[], o: Parameters<HistoryLens>[1]): Msg[] => { if (!historyLens) return source; try { return historyLens(source, o) || source; } catch (e) { console.warn('[기록 가공]', e); return source; } };
function buildTalkPrompt({ chat, char, chars, persona, preset, msgs, type = 'normal', commit = false, proactive = false }: BuildInput): Built {
  const P: Params = preset.params || {}, M = S.settings.modes || {};
  const ctx = makeCtx({ chat, char, chars, persona, msgs }); ctx.type = type;
  const mx = (t?: string) => macro(tpl(t, ctx), ctx);   // 프리셋 · 카드 글: 템플릿(<% %>) 다음에 매크로
  // 통화 중(src/call 이 기록 끝에 'Phone call started' 를 넣는다)에는 전화 걸기 안내를 주지 않는다
  const inCall = msgs.some(m => m.role === 'system' && msgText(m) === 'Phone call started');
  const isGroup = chars.length > 1, clockMode = Clock.mode(chat), today = Clock.now(chat).toDateString();
  let source = lensed(msgs.filter(m => !m.hidden), { chat, char, chars, type });
  if (type === 'regen' || type === 'swipe') source = source.slice(0, -1);
  const live = liveDirect(source, type);   // 연출 지시는 그 지시로 쓰는 답변 한 번에만 지시문으로 실린다
  if ((S.settings.direct || {}).past !== 'note') source = source.filter(m => !m.direct || m === live);
  const history: PromptMsg[] = source.map((m, i) => {
    const depth = source.length - 1 - i, t = Clock.timeOf(chat, m);
    if (m.direct && m.role === 'user') return { role: 'user', content: directText(msgText(m), m === live, mx) as string, src: 'history' };
    const stamp = clockMode === 'none' ? '' : new Date(t).toDateString() === today ? `[${hhmm(t)}] ` : `[${new Date(t).getMonth() + 1}/${new Date(t).getDate()} ${hhmm(t)}] `;
    let text = applyRegex(msgText(m), { who: m.role === 'user' ? 'user' : 'ai', target: 'prompt', depth, charId: m.charId, ctx });
    if (m.role === 'system') return { role: 'system', content: `[${text}]`, src: 'history' };
    if (m.role === 'assistant' && isGroup) text = text.split('\n').filter(l => l.trim()).map(l => `${m.name || char.name}: ${l}`).join('\n');
    return { role: m.role, content: `${stamp}${text}`, src: 'history', images: m.images?.length ? m.images : undefined };
  });
  const lore = scanLore(loreBooksFor(chat, chars, persona), history, ctx, { state: (chat.loreState ||= {}) as LoreState, count: msgs.length, commit, type, char, persona, names: source.map(m => m.role === 'system' ? '' : m.role === 'user' ? ctx.user as string : (m.name || char.name)) });
  const card = (c: Char) => [`<character name="${c.name}">`, macro(c.description, { ...ctx, char: c.name }), c.personality && `Personality: ${macro(c.personality, { ...ctx, char: c.name })}`, c.scenario && `Situation: ${macro(c.scenario, { ...ctx, char: c.name })}`, c.mesExample && `How they talk:\n${macro(c.mesExample, { ...ctx, char: c.name }).replace(/<START>/gi, '').trim()}`, '</character>'].filter(Boolean).join('\n');
  const before: PromptMsg[] = [{ role: 'system', src: '대화 모드 지시문', content: `<instructions>\n${mx(M.talkPrompt || TALK_DEFAULT)}\n\n${mx(TALK_LINES)}${isGroup ? `\nThis is a group chat. You write only ${char.name}'s messages; ${chars.filter(c => c.id !== char.id).map(c => c.name).join(', ')} write their own, so never speak for them.` : ''}\n</instructions>` },
    { role: 'system', src: '캐릭터 카드', content: [card(char), ...chars.filter(c => c.id !== char.id).map(card)].join('\n\n') }];
  if (persona?.description) before.push({ role: 'system', src: '페르소나', content: `<user name="${ctx.user}">\n${mx(persona.description)}\n</user>` });
  if (lore.length) before.push({ role: 'system', src: '로어북', content: `<lore>\n${lore.map(e => e.text).join('\n')}\n</lore>` });
  if (chat.summary) before.push({ role: 'system', src: '옛 요약', content: `Things you must remember from past conversations:\n${chat.summary}` });
  const late: PromptMsg[] = [];
  for (const p of X.prompt) {
    if (p.owner === 'mode' || p.owner === 'illust') continue;
    let parts: PromptPart[] = []; try { parts = p.fn({ chat, char, chars, persona, history, msgs, type, commit, ctx }) || []; } catch (e) { console.warn('[프롬프트 조각]', p.owner, e); }
    for (const part of parts) if (part?.content) (part.where === 'top' ? before : part.where === 'before' ? before : late).push({ role: 'system', content: mx(part.content), src: part.src || p.owner });   // 기능이 덧붙이는 조각도 {{user}} · {{char}} 같은 매크로를 푼다
  }
  if (chat.note?.text && noteDue(chat, msgs)) late.push({ role: 'system', content: mx(chat.note.text), src: '작가 노트' });
  // 지금 상황: 상태 · 시각 · 먼저 말 거는 경우의 안내
  const pr: { status?: string; activity?: string } = chat.presence || {};
  const quiet = source.length ? Math.round((Date.now() - (source[source.length - 1].ts || Date.now())) / 60000) : 0;
  const situation = [
    `Your current status: ${pr.status || 'online'}${pr.activity ? ` (${pr.activity})` : ''}.`,
    proactive && `There is no new message from ${ctx.user}: they have been quiet for about ${quiet} minutes, and you are the one texting first. Start from your own side — your mood, what you are doing, or something the two of you left open. Do not answer for them, and do not repeat or rephrase your previous message.`,
    Clock.line(chat),
    type === 'continue' && 'Continue your last message from exactly where it stopped. Do not restart it or repeat what is already written.',
    type === 'impersonate' && `Write ${ctx.user}'s next text message, in the voice and length their earlier messages show. Output only that message, as plain lines.`,
    type !== 'impersonate' && TALK_LINES_CHECK,
  ].filter(Boolean).join('\n');
  const tail: PromptMsg = { role: 'user', src: '지금 상황 · 명령 안내', content: `<context>\n${situation}\n</context>${M.commands === false || type === 'impersonate' ? '' : '\n\n' + mx(TALK_COMMANDS.replace('{{clock_command}}', Clock.command(chat) ? '\n' + Clock.command(chat) : '').replace('{{call_command}}', !inCall && (S.settings as { call?: { aiCall?: boolean } }).call?.aiCall !== false ? TALK_CALL_COMMAND : ''))}` };
  const fixed = [...before, ...late, tail].reduce((n, m) => n + tokens(m.content) + 4, 0);
  const budget = Math.max(500, (P.contextSize || 128000) - (M.talkTokens || 400) - fixed - (S.settings.format?.tokenPadding || 0));
  let used = 0, start = history.length;
  for (let i = history.length - 1; i >= 0; i--) { const t = tokens(history[i].content) + 4; if (used + t > budget && start < history.length) break; used += t; start = i; }
  const out = [...before, ...pinnedBefore(source, history, start), ...history.slice(start), ...late, tail];   // 고정한 메시지는 잘려도 남긴다
  return { messages: out, total: out.reduce((n, m) => n + tokens(m.content) + 4, 0), lore, dropped: start, ctx, talk: true };
}

export interface TalkCmd { name: string; args: Record<string, string> }
/** 대화 모드 답변 정리: 새어 나온 시각·이름을 지우고 명령을 떼어 낸다 */
export function parseTalk(text: string, _names: string[] = []): { text: string; cmds: TalkCmd[] } {
  const cmds: TalkCmd[] = [];
  let out = text.replace(/^[ \t]*\[(react|status|schedule_update|selfie|memory|time|call)\s*:?\s*([^\]\n]*)\][ \t]*$/gim, (_m, name: string, args: string) => {
    const o: Record<string, string> = {}; args.replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, k: string, v: string) => { o[k] = v; return ''; });
    cmds.push({ name: name.toLowerCase() === 'schedule_update' ? 'status' : name.toLowerCase(), args: o }); return '';
  }).replace(/\[(react|status|schedule_update|selfie|memory|time|call)\s*:?[^\]\n]*\]/gi, '');
  out = out.split('\n').map(l => l.replace(/^\s*\[\d{1,2}(?:\/\d{1,2})?\s*\d{0,2}:?\d{0,2}\]\s*/, '')).filter(l => l.trim()).join('\n');
  return { text: out.trim(), cmds };
}

/** 마지막으로 조립한 생성 요청의 정보 (답변을 다듬을 때 쓴다) */
let gen: { tc?: Tc | null; user?: string; char?: string; type?: string; bias?: string } = {};
/** 출력 다듬기 */
export function postFormat(textIn: string): string {
  let text = textIn;
  const f = AF(), g = gen;
  if (g.tc) text = A.cleanCompletion(text, { I: g.tc.instruct, stops: g.tc.stops || [], user: g.user, char: g.char, isImpersonate: g.type === 'impersonate' });
  else if (g.char && g.type !== 'impersonate') text = text.replace(new RegExp('^\\s*' + g.char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[^\\S\\n]*'), '');   // 모델이 따라 붙인 이름 꼬리표
  if (f.collapseNewlines) text = text.replace(/\n+/g, '\n');
  if (f.singleLine) text = text.split('\n').find(l => l.trim()) || text;
  if (f.fixMarkdown) text = text.split('\n').map(lIn => { let l = lIn; for (const mk of ['**', '*', '"']) { const body = mk === '*' ? l.replace(/\*\*/g, '') : l; const n = body.split(mk).length - 1; if (n % 2 && !/^\s*[*-]\s/.test(l)) l = l.replace(/\s*$/, '') + mk; } return l; }).join('\n');
  if (f.trimSentences) text = A.trimToEndSentence(text);
  if (f.trimSpaces !== false) text = text.trim();
  return text;
}

export function buildPrompt({ chat, char, chars, persona, preset, msgs, type = 'normal', commit = false, proactive = false }: BuildInput): Built {
  if (chat.mode === 'talk') { if (commit) gen = { type }; return buildTalkPrompt({ chat, char, chars, persona, preset, msgs, type, commit, proactive }); }
  const P: Params = preset.params || {}, F = AF();
  const ctx = makeCtx({ chat, char, chars, persona, msgs }); ctx.type = type;
  const isGroup = chars.length > 1;
  const mx = (t?: string | null) => macro(tpl(t, ctx), ctx);   // 프리셋 · 카드 글: 템플릿(<% %>) 다음에 매크로
  // 텍스트 완성형 연결은 스토리 스트링 + 인스트럭트 템플릿으로 조립한다 (채팅 완성형은 프리셋 블록 그대로)
  const conn = S.connFor(chat), R = conn && A.TEXT_PROVIDER_KINDS.includes(defOf(conn).kind) && F.storyMode !== false ? A.resolve(conn) : null;

  // 1) 기록
  let source = lensed(msgs.filter(m => !m.hidden), { chat, char, chars, type });
  if (type === 'regen' || type === 'swipe') source = source.slice(0, -1);
  const mk = S.settings.memory;   // 장기기억이 맡은 옛 대화는 보내지 않는다 (선택)
  if (mk?.enabled && mk.trim && (X.covered?.(chat) || 0) > 0 && source.length > (mk.keepRecent || 20)) source = source.slice(-(mk.keepRecent || 20));
  // 지난 생각 과정을 다시 넣기: 마지막 메시지부터 세어 최대 개수까지만
  const rz = F.reasoning || {}, withThink = new Set<Msg>();
  const live = liveDirect(source, type);   // 연출 지시는 그 지시로 쓰는 답변 한 번에만 지시문으로 실린다
  if ((S.settings.direct || {}).past !== 'note') source = source.filter(m => !m.direct || m === live);
  if (rz.addToPrompts) for (let i = source.length - 1; i >= 0 && withThink.size < (rz.maxAdditions ?? 1); i--) if (source[i].role === 'assistant' && source[i].swipes[source[i].sw]?.reasoning) withThink.add(source[i]);
  const history: PromptMsg[] = source.map((m, i) => {
    const depth = source.length - 1 - i;
    let text = applyRegex(msgText(m), { who: m.role === 'user' ? 'user' : 'ai', target: 'prompt', depth, charId: m.charId, ctx });
    if (m.direct && m.role === 'user') { const dt = directText(text, m === live, mx) as string; return R ? { role: 'system', content: dt, name: '', src: 'history' } : { role: 'user', content: dt, src: 'history', images: m.images?.length ? m.images : undefined }; }
    if (withThink.has(m)) text = `${mx(rz.prefix)}${applyRegex(m.swipes[m.sw].reasoning, { who: 'reason', target: 'prompt', depth, charId: m.charId, ctx })}${mx(rz.suffix)}${mx(rz.separator)}${text}`;
    if (R) return { role: m.role, content: text, name: m.role === 'system' ? '' : m.role === 'user' ? ctx.user : (m.name || char.name), src: 'history' };
    if (m.role === 'assistant' && isGroup && P.namesInGroup !== false) text = `${m.name || char.name}: ${text}`;
    if (m.role === 'system') text = `[${text}]`;
    return { role: m.role === 'system' ? 'system' : m.role, content: text, src: 'history', images: m.images?.length ? m.images : undefined };
  });

  // 2) 로어북
  const lore = scanLore(loreBooksFor(chat, chars, persona), history, ctx, { state: (chat.loreState ||= {}) as LoreState, count: msgs.length, commit, type, char, persona, names: source.map(m => m.role === 'system' ? '' : m.role === 'user' ? ctx.user as string : (m.name || char.name)) });
  const at = (pos: string) => lore.filter(e => e.position === pos).map(e => e.text).join('\n');
  ctx.outlets = {};
  for (const e of lore) if (e.position === 'outlet') (ctx.outlets[(e.outlet || e.name) as string] ||= []).push(e.text);

  // 3) 깊이 삽입: 로어북 · 작가 노트 · 캐릭터 노트 · 트래커 · 확장이 덧붙이는 조각
  const inject: Inj[] = [], extBefore: (PromptMsg & { own: string })[] = [], extTop: PromptMsg[] = [], tail: PromptMsg[] = [];
  for (const e of lore) if (e.position === 'depth') inject.push({ role: e.role || 'system', content: e.text, depth: e.depth ?? 4, order: e.order as Num, src: '로어북: ' + (e.name || e.book) });
  const noteParts = [at('an_top'), noteDue(chat, msgs) ? mx(chat.note?.text) : '', at('an_bottom')].filter(Boolean);
  if (noteParts.length) {
    const item = { role: chat.note?.role || 'system', content: noteParts.join('\n'), src: '작가 노트' }, pos = chat.note?.pos || 'chat';
    if (pos === 'before') extTop.push(item); else if (pos === 'after') extBefore.push({ ...item, own: 'note' }); else inject.push({ ...item, depth: chat.note?.depth ?? 4, order: 200 });
  }
  if (char.depthPrompt?.prompt) inject.push({ role: char.depthPrompt.role || 'system', content: mx(char.depthPrompt.prompt), depth: char.depthPrompt.depth ?? 4, order: 150, src: '캐릭터 노트' });
  const tr = chat.tracker || {};
  if (S.settings.tracker.enabled && S.settings.tracker.inject && Object.keys(tr).length) {
    inject.push({ role: 'system', content: '[Current state]\n' + Object.entries(tr).map(([k, v]) => `${k}: ${v}`).join('\n'), depth: 1, order: 50, src: '트래커' });
  }
  for (const p of X.prompt) {
    let parts: PromptPart[] = []; try { parts = p.fn({ chat, char, chars, persona, history, msgs, type, commit, ctx }) || []; } catch (e) { console.warn('[프롬프트 조각]', p.owner, e); }
    for (const part of parts) { if (!part?.content) continue; const item = { role: part.role || 'system', content: mx(part.content), src: part.src || p.owner }; if (part.where === 'top') extTop.push(item); else if (part.where === 'before') extBefore.push({ ...item, own: p.owner }); else if (part.where === 'end') tail.push(item); else inject.push({ ...item, depth: part.depth ?? 1, order: part.order ?? 100 }); }
  }

  const over = P.cardOverrides !== false;
  const slot = (b: Block, v: string) => !v ? '' : (b.content && b.content.includes('{{slot}}') ? mx(b.content).replace(/\{\{slot\}\}/g, () => v) : v);
  const charDesc = () => {
    let d = mx(char.description);
    if (isGroup) { const others = chars.filter(c => c.id !== char.id && c.description).map(c => `[${c.name}]\n${macro(c.description, { ...ctx, char: c.name })}`).join('\n\n'); if (others) d += `\n\n[Other characters in the scene]\n${others}`; }
    return d;
  };
  const bias = type === 'impersonate' ? '' : mx(P.prefill || F.startReplyWith);   // 응답 시작 문구: 프리셋의 프리필이 먼저, 없으면 고급 포맷팅의 것
  // 실리태번 프리셋 프롬프트의 "생성 종류" (injection_trigger): 정해 두었으면 그 종류의 생성에서만 넣는다
  const gtypes = LORE_TRIGGER[type] || [type], onType = (b: Block) => !Array.isArray(b.trigger) || !b.trigger.length || (b.trigger as string[]).some(t => gtypes.includes(t));
  const injOrder = (b: Block) => (typeof b.injOrder === 'number' && isFinite(b.injOrder) ? b.injOrder : 100);
  const done = (out: Built) => { if (commit) gen = { tc: out.messages.tc || null, user: ctx.user, char: ctx.char, type, bias }; return out; };

  // 4-A) 텍스트 완성형: 스토리 스트링
  if (R) {
    const I = R.instruct, C = R.context, sys = F.sysprompt || {}, n = { user: ctx.user, char: ctx.char, group: isGroup, groupNames: chars.map(c => c.name), mx };
    const system = sys.enabled === false ? '' : (over && char.systemPrompt?.trim() ? macro(char.systemPrompt, { ...ctx, original: mx(sys.content) }) : mx(sys.content));
    const jb = sys.enabled === false ? '' : (over && char.postHistory?.trim() ? macro(char.postHistory, { ...ctx, original: mx(sys.post_history) }) : mx(sys.post_history));
    const emWrap = (list: string[]) => [at('em_top') && at('em_top') + '\n', ...list, at('em_bottom') && at('em_bottom') + '\n'].filter(Boolean);   // 로어북: 대화 예시 앞 · 뒤
    const rawEx = emWrap(A.parseExamples(mx(char.mesExample), false, C, mx)), ex = I ? emWrap(A.fmtExamples(I, C, A.parseExamples(mx(char.mesExample), true, C, mx), n)) : rawEx;
    const sumB = (preset.blocks || []).find(b => b.kind === 'summary' && b.enabled);
    const anchorAfter = [...extBefore.map(p => p.content), chat.summary && sumB ? slot(sumB, chat.summary) : ''].filter(Boolean).join('\n').trim();
    const story = A.renderStory(C, I, { description: charDesc(), personality: mx(char.personality), persona: mx(persona?.description), scenario: mx(char.scenario), system, char: ctx.char, user: ctx.user,
      wiBefore: at('before'), wiAfter: at('after'), loreBefore: at('before'), loreAfter: at('after'), anchorBefore: '', anchorAfter, mesExamples: ex.join(''), mesExamplesRaw: rawEx.join('') }, mx);
    for (const b of preset.blocks || []) if (b.enabled && b.kind === 'text' && b.depth != null && (b.depth as unknown) !== '' && onType(b) && (!b.when || testCond(b.when, ctx)) && mx(b.content).trim()) inject.push({ role: b.role || 'system', content: mx(b.content), depth: +b.depth, order: injOrder(b), src: b.name || '프롬프트' });
    for (const t of tail) inject.push({ ...t, depth: 0, order: 300 });
    const inChat = +(C.story_string_position as Num) === 1;
    if (inChat && story) inject.push({ role: ROLE3[C.story_string_role as number] || 'system', content: story, depth: C.story_string_depth ?? 1, order: 0, src: '스토리 스트링' });
    const head: PromptMsg[] = [];
    if (!inChat && story) head.push({ role: 'system', content: story, src: '스토리 스트링', part: 'story' });
    if (ex.length && !/\{\{\s*mesExamples(Raw)?\s*\}\}/.test(C.story_string || '')) head.push({ role: 'system', content: ex.join(''), src: '대화 예시', part: 'raw' });
    if (C.chat_start) head.push({ role: 'system', content: mx(C.chat_start) + '\n', src: '대화 시작 표시', part: 'raw' });
    const cost = (m: PromptMsg) => tokens(m.content) + 4;
    const fixed = [...head, ...inject].reduce((s, m) => s + cost(m), 0) + tokens(jb) + tokens(bias);
    const budget = Math.max(500, (P.contextSize || 128000) - (P.maxTokens || 4096) - fixed - (F.tokenPadding || 0));
    let used = 0, start = history.length;
    for (let i = history.length - 1; i >= 0; i--) { const t = cost(history[i]); if (used + t > budget && start < history.length) break; used += t; start = i; }
    const hist = [...pinnedBefore(source, history, start), ...history.slice(start)], cont = type === 'continue' && hist[hist.length - 1]?.role === 'assistant';
    for (const j of inject.sort((a, b) => +b.depth - +a.depth || ordOf(a.order) - ordOf(b.order))) {
      const d = cont && j.depth === 0 ? 1 : j.depth;
      hist.splice(Math.max(0, hist.length - +d), 0, { role: j.role, content: j.content, name: j.role === 'user' ? ctx.user : j.role === 'assistant' ? ctx.char : '', src: j.src });
    }
    if (jb) hist.splice(cont ? hist.length - 1 : hist.length, 0, { role: 'user', content: jb, name: ctx.user, src: '후속 지시' });   // 마지막 사용자 메시지로
    if (start === 0 && hist[0]) hist[0].first = true;
    const messages: PromptList = [...head, ...hist];
    if (bias && !cont) messages.push({ role: 'assistant', content: bias, src: '응답 시작 문구', prefill: true });
    messages.tc = { type, instruct: I, context: C, group: isGroup, why: R.why };
    return done({ messages, total: messages.reduce((s, m) => s + cost(m), 0), lore, dropped: start, ctx, story: true });
  }

  // 4-B) 채팅 완성형: 프리셋 블록
  const value = (b: Block): string => {
    switch (b.kind) {
      case 'text': return mx(b.content);
      case 'main': { const base = mx(b.content); return over && char.systemPrompt ? macro(char.systemPrompt, { ...ctx, original: base }) : base; }
      case 'jailbreak': { const base = mx(b.content); return over && char.postHistory ? macro(char.postHistory, { ...ctx, original: base }) : base; }
      case 'worldInfoBefore': return slot(b, at('before'));
      case 'worldInfoAfter': return slot(b, at('after'));
      case 'personaDescription': return slot(b, mx(persona?.description));
      case 'charDescription': return slot(b, charDesc());
      case 'charPersonality': return slot(b, mx(char.personality));
      case 'scenario': return slot(b, mx(char.scenario));
      case 'dialogueExamples': return slot(b, [at('em_top'), mx(char.mesExample).replace(/<START>/gi, F.ccExampleSep || '[Example dialogue]').trim(), at('em_bottom')].filter(Boolean).join('\n'));
      case 'summary': { memSlot = true; return slot(b, [...extBefore.filter(p => p.own === 'memoria').map(p => p.content), chat.summary].filter(Boolean).join('\n\n')); }   // 장기기억 자리 (옛 요약이 남아 있으면 함께)
      default: return '';
    }
  };
  const before: PromptMsg[] = [], after: PromptMsg[] = [];
  let seenHistory = false, memSlot = false;
  for (const b of preset.blocks || []) {
    if (!b.enabled) continue;
    if (b.kind === 'chatHistory') { seenHistory = true; continue; }
    if (b.when && !testCond(b.when, ctx)) continue;   // 조건부 블록
    if (!onType(b)) continue;
    let text = value(b);
    if (!text || !text.trim()) continue;
    if (b.wrapTag) text = `<${b.wrapTag}>\n${text}\n</${b.wrapTag}>`;
    const item = { role: b.role || 'system', content: text, src: b.name || b.kind };
    if (b.depth != null && (b.depth as unknown) !== '') inject.push({ ...item, depth: +b.depth, order: injOrder(b) });
    else (seenHistory ? after : before).push(item);
  }
  before.push(...extBefore.filter(p => !(memSlot && p.own === 'memoria')).map(({ own: _own, ...p }) => p));
  before.unshift(...extTop);   // 맨 앞 조각 (/inject position=before 등)

  // 5) 컨텍스트 예산에 맞춰 오래된 기록부터 제외
  const fixed = [...before, ...after, ...inject].reduce((n, m) => n + tokens(m.content) + 4, 0);
  const budget = Math.max(500, (P.contextSize || 128000) - (P.maxTokens || 4096) - fixed - (F.tokenPadding || 0));
  let used = 0, start = history.length;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = tokens(history[i].content) + 4;
    if (used + t > budget && start < history.length) break;
    used += t; start = i;
  }
  const hist = [...pinnedBefore(source, history, start), ...history.slice(start)];
  if (F.ccChatStart && hist.length) hist.unshift({ role: 'system', content: mx(F.ccChatStart), src: '대화 시작 표시' });
  for (const j of inject.sort((a, b) => +b.depth - +a.depth || ordOf(a.order) - ordOf(b.order))) {
    const idx = Math.max(0, hist.length - +j.depth);
    hist.splice(idx, 0, { role: j.role, content: j.content, src: j.src });
  }

  let out: PromptMsg[] = [...before, ...hist, ...after, ...tail];
  if (isGroup) out.push({ role: 'system', content: mx(P.groupNudge || GROUP_NUDGE), src: '그룹 지시' });
  if (type === 'continue') out.push({ role: 'system', content: mx(P.continueNudge || CONTINUE_NUDGE), src: '이어쓰기 지시' });
  if (type === 'impersonate') out.push({ role: 'system', content: mx(P.impersonatePrompt || IMPERSONATE_NUDGE), src: '대필 지시' });
  if (bias) out.push({ role: 'assistant', content: bias, src: '응답 시작 문구', prefill: true });

  if (P.squash !== false) {
    const sq: PromptMsg[] = [];
    for (const m of out) {
      const p = sq[sq.length - 1];
      if (p && p.role === 'system' && m.role === 'system' && p.src !== 'history' && m.src !== 'history') { p.content += '\n\n' + m.content; p.src += ' + ' + m.src; }
      else sq.push({ ...m });
    }
    out = sq;
  }
  const total = out.reduce((n, m) => n + tokens(m.content) + 4, 0);
  return done({ messages: out, total, lore, dropped: start, ctx });
}
const ROLE3 = ['system', 'user', 'assistant'];

// ── API ──
// kind: 요청 형식 (openai 호환 · anthropic · google · vertex · azure · mock)
const P = (name: string, group: string, base: string, models: string[] = [], extra: Partial<ProviderDef> = {}): ProviderDef => ({ name, group, base, models, kind: 'openai', ...extra });
export const PROVIDERS: Record<string, ProviderDef> = {
  // 주요
  openai: P('OpenAI', '주요', 'https://api.openai.com/v1', ['gpt-6-astra', 'gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.3-chat-latest', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'], { official: true }),
  anthropic: P('Anthropic (Claude)', '주요', 'https://api.anthropic.com', ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'], { kind: 'anthropic' }),
  google: P('Google AI Studio (Gemini)', '주요', 'https://generativelanguage.googleapis.com', ['gemini-4-hydrogen', 'gemini-4-neon', 'gemini-4-carbon', 'gemini-4-argon', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemma-4-31b-it'], { kind: 'google' }),
  openrouter: P('OpenRouter', '주요', 'https://openrouter.ai/api/v1', [], { samplers: true }),
  // 클라우드
  vertexai: P('Google Vertex AI (익스프레스 키)', '클라우드', 'https://aiplatform.googleapis.com', ['gemini-4-hydrogen', 'gemini-4-neon', 'gemini-4-carbon', 'gemini-4-argon', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], { kind: 'vertex' }),
  azure: P('Azure OpenAI', '클라우드', '', [], { kind: 'azure', ph: 'https://내리소스.openai.azure.com', note: '모델 칸에는 배포(deployment) 이름을 넣습니다.' }),
  xai: P('xAI (Grok)', '클라우드', 'https://api.x.ai/v1'),
  deepseek: P('DeepSeek', '클라우드', 'https://api.deepseek.com/v1', ['deepseek-chat', 'deepseek-reasoner']),
  mistralai: P('Mistral AI', '클라우드', 'https://api.mistral.ai/v1', ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest']),
  cohere: P('Cohere', '클라우드', 'https://api.cohere.ai/compatibility/v1', ['command-a-03-2025', 'command-r-plus-08-2024', 'command-r-08-2024', 'command-r7b-12-2024']),
  perplexity: P('Perplexity', '클라우드', 'https://api.perplexity.ai', ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro', 'sonar-deep-research']),
  groq: P('Groq', '클라우드', 'https://api.groq.com/openai/v1', ['qwen/qwen3-32b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile']),
  ai21: P('AI21', '클라우드', 'https://api.ai21.com/studio/v1', ['jamba-large', 'jamba-mini']),
  moonshot: P('Moonshot (Kimi)', '클라우드', 'https://api.moonshot.ai/v1', ['kimi-latest', 'kimi-k2-0711-preview', 'kimi-thinking-preview', 'moonshot-v1-auto']),
  zai: P('Z.AI (GLM)', '클라우드', 'https://api.z.ai/api/paas/v4', ['glm-5.2', 'glm-5.1', 'glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash', 'glm-4.6']),
  minimax: P('MiniMax', '클라우드', 'https://api.minimax.io/v1', ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'M2-her']),
  fireworks: P('Fireworks', '클라우드', 'https://api.fireworks.ai/inference/v1', [], { samplers: true }),
  togetherai: P('Together AI', '클라우드', 'https://api.together.xyz/v1', [], { samplers: true }),
  siliconflow: P('SiliconFlow', '클라우드', 'https://api.siliconflow.com/v1', [], { samplers: true }),
  huggingface: P('Hugging Face', '클라우드', 'https://router.huggingface.co/v1'),
  workers_ai: P('Cloudflare Workers AI', '클라우드', '', [], { ph: 'https://api.cloudflare.com/client/v4/accounts/계정ID/ai/v1' }),
  bedrock: P('Amazon Bedrock (API 키)', '클라우드', '', [], { ph: 'https://bedrock-mantle.us-east-1.api.aws/v1', note: '리전에 맞는 주소를 넣습니다. 교차 리전 추론 프로필은 https://bedrock-runtime.리전.amazonaws.com/v1 을 씁니다.' }),
  zai_coding: P('Z.AI (코딩 플랜)', '클라우드', 'https://api.z.ai/api/coding/paas/v4', ['glm-5.2', 'glm-5.1', 'glm-5', 'glm-4.7']),
  // 중계 · 모음 서비스
  nanogpt: P('NanoGPT', '모음 서비스', 'https://nano-gpt.com/api/v1', [], { samplers: true }),
  chutes: P('Chutes', '모음 서비스', 'https://llm.chutes.ai/v1', [], { samplers: true }),
  electronhub: P('Electron Hub', '모음 서비스', 'https://api.electronhub.ai/v1'),
  aimlapi: P('AI/ML API', '모음 서비스', 'https://api.aimlapi.com/v1'),
  cometapi: P('CometAPI', '모음 서비스', 'https://api.cometapi.com/v1'),
  pollinations: P('Pollinations', '모음 서비스', 'https://gen.pollinations.ai/v1'),
  featherless: P('Featherless', '모음 서비스', 'https://api.featherless.ai/v1', [], { samplers: true }),
  infermaticai: P('Infermatic', '모음 서비스', 'https://api.totalgpt.ai/v1', [], { samplers: true }),
  arliai: P('Arli AI', '모음 서비스', 'https://api.arliai.com/v1', [], { samplers: true }),
  dreamgen: P('DreamGen', '모음 서비스', 'https://dreamgen.com/api/openai/v1', [], { kind: 'text' }),
  horde: P('AI Horde', '모음 서비스', 'https://aihorde.net/api/v2', ['any'], { kind: 'horde', keyless: true, note: '키를 비워 두면 익명으로 접속합니다. 응답이 올 때까지 기다리는 방식이라 스트리밍은 되지 않아요.' }),
  novelai: P('NovelAI (텍스트)', '모음 서비스', '', ['llama-3-erato-v1', 'kayra-v1', 'clio-v1'], { kind: 'novelai', note: '텍스트 완성 방식입니다. 연결이 막히면 고급 설정에서 서버를 거쳐 연결을 켜세요.' }),
  mancer: P('Mancer', '모음 서비스', 'https://neuro.mancer.tech/oai/v1', [], { samplers: true }),
  // 내 컴퓨터
  ollama: P('Ollama', '내 컴퓨터', 'http://127.0.0.1:11434/v1', [], { keyless: true, samplers: true }),
  koboldcpp: P('KoboldCpp', '내 컴퓨터', 'http://127.0.0.1:5001/v1', [], { keyless: true, samplers: true }),
  llamacpp: P('llama.cpp', '내 컴퓨터', 'http://127.0.0.1:8080/v1', [], { keyless: true, samplers: true }),
  lmstudio: P('LM Studio', '내 컴퓨터', 'http://127.0.0.1:1234/v1', [], { keyless: true, samplers: true }),
  ooba: P('Text Generation WebUI', '내 컴퓨터', 'http://127.0.0.1:5000/v1', [], { keyless: true, samplers: true }),
  tabby: P('TabbyAPI', '내 컴퓨터', 'http://127.0.0.1:5000/v1', [], { keyless: true, samplers: true }),
  vllm: P('vLLM', '내 컴퓨터', 'http://127.0.0.1:8000/v1', [], { keyless: true, samplers: true }),
  aphrodite: P('Aphrodite', '내 컴퓨터', 'http://127.0.0.1:2242/v1', [], { keyless: true, samplers: true }),
  koboldclassic: P('KoboldAI (클래식 API)', '내 컴퓨터', 'http://127.0.0.1:5000/api', [], { kind: 'kobold', keyless: true }),
  textcomp: P('텍스트 완성 (/v1/completions)', '내 컴퓨터', '', [], { kind: 'text', keyless: true, ph: 'http://127.0.0.1:5000/v1', note: '채팅 형식이 아닌 텍스트 완성 서버용입니다. 인스트럭트 · 컨텍스트 템플릿은 고급 포맷팅 화면에서 고릅니다.' }),
  // 기타
  custom: P('OpenAI 호환 (직접 입력)', '기타', '', [], { ph: 'https://…/v1', samplers: true, keyless: true }),
  mock: P('연습용 에코 (키 불필요)', '기타', '', ['echo'], { kind: 'mock', keyless: true }),
};
// 화면에 보이는 이름 · 안내 · 자리 표시 글은 부를 때마다 지금 언어로 (group 은 한국어 id 그대로 — 그리는 쪽이 번역한다)
for (const [id, f, k] of [['vertexai', 'name', 'vertexai.name'], ['azure', 'ph', 'azure.ph'], ['azure', 'note', 'azure.note'], ['workers_ai', 'ph', 'workers_ai.ph'], ['bedrock', 'name', 'bedrock.name'], ['bedrock', 'note', 'bedrock.note'], ['zai_coding', 'name', 'zai_coding.name'],
  ['horde', 'note', 'horde.note'], ['novelai', 'name', 'novelai.name'], ['novelai', 'note', 'novelai.note'], ['koboldclassic', 'name', 'koboldclassic.name'], ['textcomp', 'name', 'textcomp.name'], ['textcomp', 'note', 'textcomp.note'], ['custom', 'name', 'custom.name'], ['mock', 'name', 'mock.name']] as const)
  Object.defineProperty(PROVIDERS[id], f, { get: () => tr('engine.provider.' + k), enumerable: true, configurable: true });
const defOf = (c: Conn) => PROVIDERS[c.provider] || PROVIDERS.custom;
const baseOf = (c: Conn) => ((defOf(c).kind === 'vertex' ? String(c.baseUrl || '').split(/[\s,]+/).find(Boolean) : c.baseUrl) || defOf(c).base || '').trim().replace(/\/+$/, '');
const claudeAdaptive = (m?: string) => /fable|mythos|opus-(4-[6-9]|[5-9])|sonnet-(4-[6-9]|[5-9])|haiku-[5-9]/.test(m || '');
export const prefillOk = (conn: Conn) => !(defOf(conn).kind === 'anthropic' && claudeAdaptive(conn.model));
const num = (v: unknown): v is Num => v !== null && v !== '' && v !== undefined && !isNaN(+(v as number));
const jsonOr = <T extends object>(text: unknown, fallback: T): T => { if (!text || !String(text).trim()) return fallback; try { const j = JSON.parse(text as string); return j && typeof j === 'object' ? j : fallback; } catch { return fallback; } };
const errMsg = (e: unknown) => (e as { message?: unknown } | null)?.message;
const errName = (e: unknown) => (e as { name?: unknown } | null)?.name;

// ── Vertex AI 서비스 계정 ──
const tokenCache = new Map<string, { token: string; exp: number }>();
const b64url = (buf: Uint8Array | string) => { const u = buf instanceof Uint8Array ? buf : new TextEncoder().encode(buf); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export interface ServiceAccount { client_email: string; private_key: string; token_uri?: string; project_id?: string; [k: string]: unknown }
export function parseServiceAccount(text: unknown): ServiceAccount {
  let j: ServiceAccount; try { j = JSON.parse(text as string); } catch { throw new Error(tr('engine.err.saJson')); }
  if (!j.client_email || !j.private_key) throw new Error(tr('engine.err.saFields'));
  return j;
}
interface TokenJson { access_token?: string; expires_in?: number; error?: string; error_description?: string }
async function vertexToken(conn: Conn): Promise<string> {
  if (Secrets.is(conn.serviceAccount)) {   // 키가 서버에 보관돼 있으면 서버가 서명한다
    const hit = tokenCache.get('ref:' + conn.id); if (hit && hit.exp > Date.now() + 60000) return hit.token;
    const r = await Server.post('vertex-token', { ref: conn.id });
    const j: TokenJson = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || tr('engine.err.googleAuth'));
    tokenCache.set('ref:' + conn.id, { token: j.access_token as string, exp: Date.now() + (j.expires_in || 3600) * 1000 }); return j.access_token as string;
  }
  const sa = parseServiceAccount(conn.serviceAccount);
  const hit = tokenCache.get(sa.client_email);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;
  let token: string | undefined, ttl = 3600;
  // 1) 드림랜드 서버가 대신 서명·교환 (CORS 와 비보안 접속 문제를 피한다)
  try {
    const r = await Server.post('vertex-token', { serviceAccount: sa });
    if (r.ok) { const j: TokenJson = await r.json(); token = j.access_token; ttl = j.expires_in || ttl; }
    else if (r.status !== 404) throw new Error((await r.json().catch(() => ({})) as TokenJson).error || tr('engine.err.token'));
  } catch (e) { if (!/Failed to fetch|NetworkError|404/.test(String(errMsg(e)))) throw e; }
  // 2) 서버가 없으면 브라우저에서 직접
  if (!token) {
    if (!crypto?.subtle) throw new Error(tr('engine.err.noSubtle'));
    const now = Math.floor(Date.now() / 1000), aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
    const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud, iat: now, exp: now + 3600 }));
    const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
    const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(sig) }) });
    const j: TokenJson = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(tr('engine.err.googleAuthWhy', { why: j.error_description || j.error || r.status }));
    token = j.access_token; ttl = j.expires_in || ttl;
  }
  tokenCache.set(sa.client_email, { token: token as string, exp: Date.now() + ttl * 1000 });
  return token as string;
}
// ── 중계 주소 여러 개 (Vertex): 주소 칸에 빈칸 · 쉼표로 나눠 여럿 적으면, 429 가 날 때 다음 주소(다른 지역)로 바로 넘어간다 ──
// 한 지역에서만 계속 나가면 그 지역도 결국 429 가 나기 때문. 통한 주소는 기억해 두고 다음에도 거기부터 쓴다
const relayAt = new Map<string, number>();
export const relayList = (conn: Conn): string[] => String(conn.baseUrl || '').split(/[\s,]+/).map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
const relayIdx = (conn: Conn, n: number) => { let i = relayAt.get(conn.id); if (i == null) { try { i = +(localStorage.getItem('dreamland.relayAt.' + conn.id) || 0) || 0; } catch { i = 0; } relayAt.set(conn.id, i); } return n ? i % n : 0; };
const relayBase = (conn: Conn) => { const l = relayList(conn); return l.length ? l[relayIdx(conn, l.length)] : ''; };
const relayNext = (conn: Conn, n: number) => { const i = (relayIdx(conn, n) + 1) % n; relayAt.set(conn.id, i); try { localStorage.setItem('dreamland.relayAt.' + conn.id, String(i)); } catch { /* 저장 못 해도 이번 창에서는 기억한다 */ } return i; };
/** Vertex 요청 주소와 인증 헤더 */
async function vertexTarget(conn: Conn, publisher: string, model: string, method: string): Promise<{ url: string; headers: Record<string, string> }> {
  if (!conn.serviceAccount?.trim()) {
    const key = (conn.apiKey || '').trim(), bearer = key.startsWith('ya29.') || /^[\w-]+\.[\w-]+\.[\w-]+$/.test(key);
    const region = ((conn.region as string) || 'global').trim(), project = ((conn.project as string) || '').trim();
    const host = relayBase(conn) || (project && region !== 'global' ? `https://${region}-aiplatform.googleapis.com` : 'https://aiplatform.googleapis.com');
    return { url: `${host}/v1/${project ? `projects/${project}/locations/${region}/` : ''}publishers/${publisher}/models/${model}:${method}`, headers: bearer ? { Authorization: 'Bearer ' + key } : { 'x-goog-api-key': key } };
  }
  const sa = Secrets.is(conn.serviceAccount) ? { project_id: conn.saProject || '' } : parseServiceAccount(conn.serviceAccount), region = ((conn.region as string) || 'global').trim(), project = ((conn.project as string) || sa.project_id || '').trim();
  if (!project) throw new Error(tr('engine.err.noProject'));
  const host = relayBase(conn) || (region === 'global' ? 'https://aiplatform.googleapis.com' : `https://${region}-aiplatform.googleapis.com`);
  return { url: `${host}/v1/projects/${project}/locations/${region}/publishers/${publisher}/models/${model}:${method}`, headers: { Authorization: 'Bearer ' + await vertexToken(conn) } };
}

// ── 429 때 다른 리전으로 (Vertex) ──
// Vertex 의 Gemini 는 리전마다 따로 나눠 쓰는 처리 용량이 있다. 한 리전이 붐벼 429 가 나도 다른 리전은 비어 있을 수 있다.
// 중계는 요청이 나가는 곳(IP)만 바꾸고 주소 속 리전은 그대로라, 그 리전이 붐비면 중계를 다 돌아도 429 다. 여기서는 주소 속 리전 자체를 바꾼다 (중계를 쓰면 중계는 그대로 두고 리전만)
export const regionList = (conn: Conn): string[] => { const own = String(conn.region || 'global').trim() || 'global'; return [...new Set([own, ...String(conn.regions || '').split(/[\s,]+/).map(x => x.trim().toLowerCase()).filter(x => /^[a-z]+(-[a-z0-9]+)*$/.test(x))])]; };
/** 그 리전에 이 모델이 없다(404)고 답한 곳: 하루 동안 건너뛴다 · 마지막으로 답을 받은 리전: 30분 동안 거기서 시작한다 */
const regionGone = new Map<string, number>(), regionGood = new Map<string, { r: string; at: number }>();
const regionKey = (conn: Conn, url: string) => `${conn.id}|${(url.match(/\/models\/([^/:]+)/) || [])[1] || ''}`;
const regionOf = (url: string) => (url.match(/\/locations\/([a-z0-9-]+)\//) || [])[1] || '';
/** 주소의 리전을 바꾼다. 중계 주소면 중계는 그대로, 구글 주소면 그 리전의 주소로 */
function withRegion(url: string, to: string, relays: string[]): string {
  const path = url.replace(/\/locations\/[a-z0-9-]+\//, `/locations/${to}/`);
  if (relays.some(r => path.startsWith(r))) return path;
  return path.replace(/^https:\/\/([a-z0-9-]+-)?aiplatform\.googleapis\.com/, to === 'global' ? 'https://aiplatform.googleapis.com' : `https://${to}-aiplatform.googleapis.com`);
}
/** 이번 요청을 어느 리전에서 시작할지: 최근에 답을 받은 리전이 있으면 거기서 */
function startRegion(conn: Conn, url: string, relays: string[]): string {
  if (defOf(conn).kind !== 'vertex' || !regionOf(url) || !String(conn.regions || '').trim()) return url;
  const g = regionGood.get(regionKey(conn, url)), list = regionList(conn);
  return g && Date.now() - g.at < 30 * 60000 && list.includes(g.r) && g.r !== regionOf(url) && !((regionGone.get(regionKey(conn, url) + '|' + g.r) || 0) > Date.now()) ? withRegion(url, g.r, relays) : url;
}
/** 붐빌 때 보조 호출이 비켜 선다: 같은 연결로 본 답변이 나가는 동안, 그리고 그 연결에서 429 가 난 직후 잠깐은 기억 · 번역 · 선택지 같은 보조 호출을 늦게 보낸다
 *  (한꺼번에 여러 개가 나가 본 답변까지 429 를 맞지 않게, 막힌 연결을 보조 호출이 계속 두드리지 않게). 본 답변은 기다리지 않는다 */
const mainLive = new Map<string, number>(), cooled = new Map<string, number>(), mainDone = new Set<() => void>();
const isHelper = (label?: string) => label === 'helper' || label === 'mvu';
async function yieldToMain(id: string, signal?: AbortSignal | null) {
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const cool = (cooled.get(id) || 0) - Date.now(), busy = (mainLive.get(id) || 0) > 0;
    if (!busy && cool <= 0) return;
    await new Promise<void>(res => { const done = () => { clearTimeout(tm); mainDone.delete(done); res(); }; const tm = setTimeout(done, busy ? 4000 : Math.min(cool, 4000) + 50); mainDone.add(done); signal?.addEventListener('abort', done, { once: true }); });
  }
}
const mainStart = (id: string) => { mainLive.set(id, (mainLive.get(id) || 0) + 1); return () => { const n = (mainLive.get(id) || 1) - 1; if (n > 0) mainLive.set(id, n); else mainLive.delete(id); for (const f of [...mainDone]) f(); }; };

/** 생각하는 모델에 덧붙이는 출력 여유분 */
const THINK_ROOM = () => Math.max(0, +(S.settings.format?.reasoning?.headroom ?? 8000) || 0);
interface CallOpts { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal }
/** 429 자동 재시도 (연결마다, 기본 꺼짐): 글자가 오기 전의 429 만 — 응답을 받기 시작한 뒤에는 다시 보내지 않는다.
 *  서버가 Retry-After 를 주면 그만큼, 아니면 retryWait 초부터 두 배씩 (조금씩 흔들어 여러 창이 한꺼번에 몰리지 않게) */
async function call(conn: Conn, url: string, opts: CallOpts): Promise<Response> {
  const n = Math.max(0, Math.min(5, Math.round(+(conn.retry429 || 0)) || 0)), wait = Math.max(0.5, Math.min(30, +(conn.retryWait || 0) || 2));
  const vertex = defOf(conn).kind === 'vertex', relays = vertex ? relayList(conn) : []; let hops = 0;
  // 리전 돌려쓰기: 주소에 리전이 들어 있고(프로젝트를 쓰는 Vertex) 돌아갈 리전을 적어 둔 연결만
  const regions = vertex && regionOf(url) && String(conn.regions || '').trim() ? regionList(conn) : [], rkey = regions.length ? regionKey(conn, url) : '';
  if (regions.length) url = startRegion(conn, url, relays);
  let tried = new Set<string>([regionOf(url)]), busyErr: unknown = null, busyUrl = url;
  for (let i = 0; ; ) {
    try { const r = await callOnce(conn, url, opts); if (regions.length) regionGood.set(rkey, { r: regionOf(url), at: Date.now() }); return r; }
    catch (e0) {
      let e = e0, st = (e as { status?: number }).status; const after = (e as { retryAfter?: number }).retryAfter;
      if (st === 429) cooled.set(conn.id, Date.now() + Math.max(15000, (after || 0) * 1000));   // 이 연결은 잠깐 붐빈다: 보조 호출은 그동안 비켜 선다
      if (st === 429 && !opts.signal?.aborted && relays.length > 1 && hops < relays.length - 1) {   // 다음 중계(다른 지역)로: 기다리지 않고 바로
        const from = relays[relayIdx(conn, relays.length)], to = relays[relayNext(conn, relays.length)]; hops++;
        if (url.startsWith(from)) { url = to + url.slice(from.length); core.emit('conn:hop', { conn: conn.name, n: hops, of: relays.length - 1 }); continue; }
      }
      // 다른 리전으로: 429(붐빔)면 다음 리전, 옮겨 간 리전에 그 모델이 없다(404)고 하면 하루 동안 그 리전을 건너뛰고 다음으로
      const here = regionOf(url), moved = here !== regions[0];
      const nothere = moved && (st === 404 || (st === 400 && /locat|region|not (supported|available)/i.test(String((e as Error).message || ''))));
      if (st === 429) { busyErr = e; busyUrl = url; }
      if (regions.length && !opts.signal?.aborted && (st === 429 || nothere)) {
        if (nothere) regionGone.set(rkey + '|' + here, Date.now() + 86400000);
        const next = regions.find(r => !tried.has(r) && !((regionGone.get(rkey + '|' + r) || 0) > Date.now()));
        if (next) { tried.add(next); url = withRegion(url, next, relays); hops = 0; core.emit('conn:region', { conn: conn.name, region: next, n: tried.size - 1, of: regions.length - 1 }); continue; }
        // 남은 리전이 다 '그 모델 없음'이었다 (global 에만 있는 모델): 처음의 429 로 돌아가 재시도 · 대체 연결이 이어지게 한다
        if (nothere) { regionGood.delete(rkey); if (!busyErr) throw e; e = busyErr; st = 429; url = busyUrl; }
      }
      if (i >= n || st !== 429 || opts.signal?.aborted) throw e;
      i++; hops = 0; tried = new Set([regionOf(url)]);
      const ms = Math.min(60000, after ? after * 1000 : wait * 1000 * 2 ** (i - 1) * (0.85 + Math.random() * 0.3));
      core.emit('conn:retry', { conn: conn.name, n: i, of: n, sec: Math.round(ms / 100) / 10 });
      await new Promise<void>((res, rej) => { const tm = setTimeout(res, ms); opts.signal?.addEventListener('abort', () => { clearTimeout(tm); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true }); });
    }
  }
}
async function callOnce(conn: Conn, url: string, { method = 'POST', headers = {}, body, signal }: CallOpts): Promise<Response> {
  headers = { ...headers, ...jsonOr<Record<string, string>>(conn.extraHeaders, {}) };
  const tap = signal ? taps.get(signal) : undefined;   // 터미널 로그(전체): 실제로 보낸 요청 · 받은 응답
  tap?.req(method, url, body);
  let res: Response | null | undefined;
  try {
    const via = (conn.via || '').trim();
    if (via) {   // 바깥 프록시를 거친다: 드림랜드 서버만 할 수 있다 (브라우저는 프록시를 고를 수 없다)
      if (Server.web || Server.app) throw new Error(tr('engine.err.viaNeedsServer'));
      res = await Server.proxy({ url, method, headers, body, via }, signal);
    }
    else if (conn.proxy) res = await Server.proxy({ url, method, headers, body }, signal);
    else res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    if (errName(e) === 'AbortError') throw e;
    if (!conn.proxy && !(conn.via || '').trim()) { try { res = await Server.proxy({ url, method, headers, body }, signal); } catch (e2) { if (errName(e2) === 'AbortError') throw e2; res = null; } }
    if (!res) throw Object.assign(new Error(tr(Server.web && !Server.app ? 'engine.err.connectWeb' : 'engine.err.connect', { why: (e as { raw?: string }).raw || errMsg(e) })), { net: true });   // net · status: 대체 연결로 넘길지 가리는 꼬리표 (src/reach/fallback.ts)
  }
  const r = res as Response;
  if (!r.ok) {
    let t: unknown = await r.text().catch(() => '');
    if (tap) { let j: unknown = t; try { j = JSON.parse(t as string); } catch { /* 글 그대로 */ } tap.res(r.status, j); }
    try {
      const j = JSON.parse(t as string), e = Array.isArray(j) ? j[0]?.error : j.error;
      t = e?.message || e?.type || j.message || j.detail || (typeof j.error === 'string' ? j.error : t);
    } catch { /* JSON 이 아니면 글 그대로 */ }
    const ra = Number(r.headers.get('retry-after')) || 0;
    throw Object.assign(new Error(tr('engine.err.apiStatus', { status: r.status, body: String(t).slice(0, 400) || r.statusText })), { status: r.status, ...(ra > 0 && ra <= 60 ? { retryAfter: ra } : {}) });
  }
  if (tap && /json/i.test(r.headers.get('content-type') || '')) tap.res(r.status, r.clone().json().catch(() => null));   // 스트리밍(SSE)은 다 받은 뒤 글로 남긴다
  return r;
}

async function* sse(res: Response): AsyncGenerator<unknown> {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>;
    // 받는 도중에 연결이 끊기면 브라우저는 'network error' 라고만 한다. 무슨 일인지 적어서 알린다 (멈춘 것은 그대로)
    try { step = await reader.read(); } catch (e) { if (errName(e) === 'AbortError') throw e; throw new Error(tr('engine.err.cut', { why: String(errMsg(e) || e) })); }
    const { done, value } = step;
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n/)) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + (buf[i] === '\r' ? 2 : 1));
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (!d || d === '[DONE]') continue;
      let j: unknown, ok = true; try { j = JSON.parse(d); } catch { ok = false; }
      if (ok) yield j;
    }
  }
  buf += dec.decode();   // 줄바꿈 없이 끝난 마지막 줄
  if (buf.startsWith('data:')) { const d = buf.slice(5).trim(); if (d && d !== '[DONE]') { let j: unknown, ok = true; try { j = JSON.parse(d); } catch { ok = false; } if (ok) yield j; } }
}

/** 프롬프트 후처리
 *  merge: 같은 역할이 이어지면 합친다 · semi: 첫 system 만 남기고 나머지는 user 로 · strict: semi + user 로 시작 · single: 전부 user 한 덩어리 */
const PLACEHOLDER = "Let's get started.";
export function shapeMessages(messages: PromptMsg[], mode = 'none', names: Names = {}): PromptMsg[] {
  if (mode === 'none' || !mode) return messages;
  const strict = mode !== 'merge', single = mode === 'single', placeholders = mode === 'strict';
  const squash = (list: PromptMsg[]) => { const out: PromptMsg[] = []; for (const m of list) { const last = out[out.length - 1]; if (last && last.role === m.role && m.content && last.content && !m.prefill) { last.content += '\n\n' + m.content; if (m.images?.length) last.images = [...(last.images || []), ...m.images]; } else out.push({ ...m }); } return out; };
  let list = messages.map(m => {
    let { role, content } = m; content ||= '';
    if (single) { const who = role === 'assistant' ? names.char : role === 'user' ? names.user : ''; if (who && !content.startsWith(who + ': ')) content = who + ': ' + content; role = 'user'; }
    return { ...m, role, content };
  });
  list = squash(list);
  if (!list.length) list = [{ role: 'user', content: PLACEHOLDER }];
  if (strict) {
    list = list.map((m, i) => i > 0 && m.role === 'system' ? { ...m, role: 'user' } : m);
    if (placeholders) {
      if (list[0].role === 'system' && (!list[1] || list[1].role !== 'user')) list.splice(1, 0, { role: 'user', content: PLACEHOLDER });
      else if (list[0].role !== 'system' && list[0].role !== 'user') list.unshift({ role: 'user', content: PLACEHOLDER });
    }
    list = squash(list);
  }
  return list;
}

/** 텍스트 완성형 백엔드를 위한 프롬프트 한 줄 만들기
 *  messages.tc 가 있으면 buildPrompt 가 스토리 스트링으로 조립한 것이고, 없으면 보조 호출·대화 모드의 일반 메시지 목록이다. */
export function flatten(messages: PromptList, conn: Conn, names: Names = {}): { prompt: string; stop: string[] } {
  const user = names.user || 'User', char = names.char || 'Assistant', others = names.others || [];
  const F = AF(), tc = messages.tc, R = tc || A.resolve(conn), I = R.instruct, C = R.context, group = tc ? tc.group : others.length > 0, type = tc?.type || 'normal';
  const mx = (t: unknown) => macro(String(t ?? ''), { user, char });
  const bias = messages.find(m => m.prefill)?.content || '';
  let list = messages.filter(m => !m.prefill), head = '';
  if (!tc) {   // 앞쪽에 몰려 있는 시스템 메시지는 스토리 스트링 자리로
    let n = 0; while (n < list.length && list[n].role === 'system') n++;
    if (n && n < list.length) { let story = list.slice(0, n).map(m => m.content).join('\n\n'); if (!story.endsWith('\n') && (!I || (I.wrap && !I.story_string_suffix))) story += '\n'; head = I ? A.fmtStory(I, { ...C, story_string_position: 0 }, story, mx) : story; list = list.slice(n); }
  }
  const items: PromptMsg[] = [];
  for (const m of list) { if (m.part === 'story') head += A.fmtStory(I, C, m.content, mx); else if (m.part === 'raw') head += m.content; else items.push(m); }
  const isImp = type === 'impersonate', cont = type === 'continue' && items[items.length - 1]?.role === 'assistant';
  const nameOf = (m: PromptMsg) => m.role === 'system' ? '' : m.name ?? (m.role === 'user' ? user : char);
  const one = (m: PromptMsg, force: number | boolean | undefined) => I ? A.fmtChat(I, { name: nameOf(m), mes: m.content, isUser: m.role === 'user', isNarrator: m.role === 'system', force: force as number, group, user, char, mx }) : (nameOf(m) ? `${nameOf(m)}: ${m.content}\n` : `${m.content}\n`);
  const lastUser = items.map(m => m.role).lastIndexOf('user');
  const parts = items.map((m, i) => one(m, i === lastUser && !isImp ? 2 : (tc ? m.first : i === 0) ? 1 : 0));
  let cycle = '';
  if (cont) {   // 이어 쓰기: 마지막 답변을 끝 시퀀스 없이 열어 둔다
    const m = items[items.length - 1], MARK = '\u0000￼\u0000';
    cycle = one({ ...m, content: m.content + MARK }, 2); cycle = cycle.slice(0, cycle.lastIndexOf(MARK)); parts.pop();
  }
  if (I?.user_alignment_message && items[0]?.role !== 'user') parts.unshift(A.fmtChat(I, { name: user, mes: mx(I.user_alignment_message), isUser: true, isNarrator: false, force: 1, group, user, char, mx }));
  if (!cont) {
    if (!parts.length) parts.push('');
    let last = parts[parts.length - 1];
    if (!I || I.wrap) last = last.replace(/\n?$/, '');
    if (I) last += A.fmtLast(I, { name: isImp ? user : char, isImpersonate: isImp, isQuiet: !tc && !names.char, bias, group, mx });
    else {
      if (isImp || F.alwaysForceName2 !== false) { if (!last.endsWith('\n')) last += '\n'; last += `${isImp ? user : char}:`; }
      if (!isImp && bias.trim()) last += /\s/.test(last.slice(-1)) ? bias.trimStart() : ` ${bias.trimStart()}`;
    }
    parts[parts.length - 1] = last;
  }
  let prompt = (head + parts.join('') + cycle).replace(/\r/g, '');
  if (F.collapseNewlines) prompt = prompt.replace(/\n+/g, '\n');
  const stop: string[] = [];
  if (C.names_as_stop_strings !== false) { stop.push(isImp ? `\n${char}:` : `\n${user}:`, `\n${user}:`); if (group) stop.push(...others.map(n => `\n${n}:`)); }
  if (I) stop.push(...A.instructStops(I, { user, char, mx }));
  if (C.use_stop_strings) { if (C.chat_start) stop.push('\n' + mx(C.chat_start)); if (C.example_separator) stop.push('\n' + mx(C.example_separator)); }
  if (F.singleLine) stop.unshift('\n');
  const stops = [...new Set(stop.filter(Boolean))];
  if (tc) tc.stops = stops;
  return { prompt, stop: stops };
}
interface AltMsg { role: string; content: string; images?: string[] }
function toAlternating(messages: PromptMsg[], userFirst: boolean): { system: string; rest: AltMsg[] } {
  const sys: string[] = []; const rest: AltMsg[] = []; let lead = true;
  for (const m of messages) {
    if (m.role === 'system' && lead) { sys.push(m.content); continue; }
    lead = false;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const last = rest[rest.length - 1];
    if (last && last.role === role) { last.content += '\n\n' + m.content; if (m.images?.length) last.images = [...(last.images || []), ...m.images]; }
    else rest.push({ role, content: m.content, images: m.images?.length ? [...m.images] : undefined });
  }
  if (userFirst && rest[0]?.role !== 'user') rest.unshift({ role: 'user', content: '[Start]' });
  if (!rest.length) rest.push({ role: 'user', content: '[Start]' });
  return { system: sys.join('\n\n'), rest };
}
const b64 = (url: unknown) => { const m = String(url).match(/^data:([^;]+);base64,(.*)$/); return m ? { mime: m[1], data: m[2] } : null; };
const nn = <T>(v: T | null): v is T => !!v;

/** 답변 앞쪽의 생각 블록(추론 서식의 접두 … 접미)을 생각 과정으로 분리 */
export function splitThink(text: string): { text: string; think: string } {
  const rz = AF().reasoning || {}, out = parseThink(text, rz);
  if (AF().showBias === false && gen.bias && out.text.startsWith(gen.bias)) out.text = out.text.slice(gen.bias.length).replace(/^\s+/, '');   // 응답 시작 문구를 답변에 보이지 않기
  return out;
}
function parseThink(text: string, rz: ReasonFmt): { text: string; think: string } {
  if (rz.autoParse === false) return { text, think: '' };
  const pre = String(rz.prefix || '').trim(), suf = String(rz.suffix || '').trim();
  if (pre && suf && (pre !== '<think>' || suf !== '</think>')) {
    const t = text.trimStart(); if (!t.startsWith(pre)) return { text, think: '' };
    const end = t.indexOf(suf, pre.length);
    return end < 0 ? { text: '', think: t.slice(pre.length).trim() } : { text: t.slice(end + suf.length).replace(/^\s+/, ''), think: t.slice(pre.length, end).trim() };
  }
  if (!pre || !suf) return { text, think: '' };   // 접두·접미가 모두 있어야 분리한다
  const m = text.match(/^\s*<(think|thinking|reasoning)>([\s\S]*?)(?:<\/\1>|$)/i);
  if (!m) return { text, think: '' };
  return { text: text.slice(m[0].length).replace(/^\s+/, ''), think: m[2].trim() };
}

// 받은 조각의 꼴 (읽는 만큼)
interface AnthEvent { type?: string; delta?: { type?: string; text?: string; thinking?: string; stop_reason?: string }; usage?: unknown; error?: { message?: string } }
interface AnthJson { content?: { type: string; text?: string; thinking?: string; name?: string; input?: unknown }[]; stop_reason?: string; usage?: unknown }
interface GemJson { error?: { code?: Num; message?: string }; candidates?: { content?: { parts?: { thought?: boolean; text?: string; functionCall?: { name?: string; args?: unknown } }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string }; usageMetadata?: unknown }
interface OaiChoice { text?: string; finish_reason?: string; message?: { content?: string; reasoning_content?: string; reasoning?: string; tool_calls?: { function?: { name?: string; arguments?: string } }[] }; delta?: { content?: unknown; reasoning_content?: string; reasoning?: string } }
interface OaiJson { error?: { message?: string }; choices?: OaiChoice[]; usage?: unknown }
export interface StreamOpts { signal?: AbortSignal; onText?: (t: string) => void; onThink?: (t: string) => void; /** 터미널 로그에 적을 호출 이름 */ label?: string }
export interface StreamResult { text: string; think: string; finish: string | undefined; usage: unknown; /** structured.tool 로 부른 도구의 인자 (JSON 글) */ tool?: string }

/** 스트리밍 채팅. onText(delta), onThink(delta) */
/** 모델 호출. 서버 터미널에도 기록을 남긴다 (설정 › 터미널 로그) */
export async function streamChat(conn: Conn | null | undefined, P: Params, messages: PromptList, opts: StreamOpts = {}): Promise<StreamResult> {
  const t0 = Date.now(), who = conn ? `${conn.name || defOf(conn).kind} · ${conn.model || '?'}` : '?';
  const chars = messages.reduce((n, m) => n + String(m.content ?? '').length, 0);
  const id = ++termSeq, mode = termMode(), full = mode === 'full';
  termSend('call', `▶ ${who} · ${messages.length} msgs · ~${Math.round(chars / 3)} tok in · max ${P.maxTokens ?? '-'}`, () => ({ call: { ...termCallInfo(id, conn, P, messages, opts.label || '', false), raw: full } }));
  // 전체 모드: 이 호출의 요청 · 응답을 call() 에서 받아 실리태번처럼 그대로 찍는다. 그러려고 이 호출만의 signal 을 쓴다 (밖의 signal 을 따라 멈춘다)
  let ac: AbortController | null = null, unlink = () => { }; const pending: Promise<unknown>[] = []; let gotJson = false;
  if (full) {
    const a = ac = new AbortController(), outer = opts.signal;
    if (outer) { if (outer.aborted) a.abort(outer.reason); else { const on = () => a.abort(outer.reason); outer.addEventListener('abort', on, { once: true }); unlink = () => outer.removeEventListener('abort', on); } }
    taps.set(a.signal, {
      req: (method, url, body) => termSend('req', '', () => ({ req: { id, method, url: maskUrl(url), body: scrub(body ?? null) } })),
      res: (status, data) => { gotJson = true; pending.push(Promise.resolve(data).then(j => termSend('res', '', () => ({ res: { id, status, body: scrub(j) } })))); },
    });
  }
  const after = (f: () => void) => { void Promise.allSettled(pending).then(f); };   // 응답 기록이 먼저 찍히게
  try {
    if (conn && isHelper(opts.label)) await yieldToMain(conn.id, opts.signal);   // 보조 호출: 같은 연결로 본 답변이 나가는 중이거나 막 429 가 났으면 잠깐 비켜 선다
    if (conn?.rpm) await Rpm.gate(conn.id, +conn.rpm, opts.signal);   // 분당 요청 수 제한: 넘치면 자리가 날 때까지 기다린다
    const endMain = conn && !isHelper(opts.label) ? mainStart(conn.id) : null;
    // 이 모델이 받는 최대 출력 길이를 알고 있으면 그 안으로 맞춘다. 모르고 넘쳤으면 오류에서 한도를 읽어 한 번 다시 보내고 기억한다
    const capKey = `${conn?.provider || ''}|${conn?.model || ''}`, cap = outCap.get(capKey);
    let Pc = cap && (P.maxTokens || 0) > cap ? { ...P, maxTokens: cap } : P;
    let r: StreamResult; try {
      try { r = await streamChatRaw(conn, Pc, messages, ac ? { ...opts, signal: ac.signal } : opts); }
      catch (e) {
        const fit = fitMaxTokens(e, Pc.maxTokens || 0); if (!fit) throw e;
        outCap.set(capKey, fit); saveOutCap(); Pc = { ...Pc, maxTokens: fit };
        termSend('done', `↺ ${who} · max ${P.maxTokens} → ${fit} (model limit)`, () => ({}));
        r = await streamChatRaw(conn, Pc, messages, ac ? { ...opts, signal: ac.signal } : opts);
      }
    } finally { endMain?.(); }
    after(() => termSend('done', `✓ ${who} · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${r.text.length} chars out · finish=${r.finish || '-'}`, () => ({
      done: { id, ms: Date.now() - t0, chars: r.text.length, tok: tokens(r.text), finish: r.finish || '', usage: usageOf(r.usage), thinkTok: tokens(r.think),
        think: full && !gotJson ? r.think.slice(0, 50000) : '', out: full ? (gotJson ? '' : r.text.slice(0, 50000)) : oneLine(r.text, 300) },
    })));
    return r;
  } catch (e) {
    const abort = e instanceof Error && e.name === 'AbortError';
    after(() => termSend(abort ? 'done' : 'err', `${abort ? '■ stopped' : '✗ error'} · ${who} · ${((Date.now() - t0) / 1000).toFixed(1)}s${abort ? '' : ' · ' + String((e as Error)?.message || e).slice(0, 400)}`,
      () => abort ? { done: { id, ms: Date.now() - t0, stopped: true } } : { err: { id, ms: Date.now() - t0, msg: String((e as Error)?.message || e).slice(0, 2000) } }));
    throw e;
  } finally { unlink(); if (ac) taps.delete(ac.signal); }
}
// ── 모델마다의 최대 출력 길이: 넘치게 보냈다가 거절되면 오류 글에서 한도를 읽어 둔다 (연결 · 모델마다, 이 브라우저에) ──
const outCap = new Map<string, number>(Object.entries((() => { try { return JSON.parse(localStorage.getItem('dl-outcap') || '{}') as Record<string, number>; } catch { return {}; } })()));
const saveOutCap = () => { try { localStorage.setItem('dl-outcap', JSON.stringify(Object.fromEntries(outCap))); } catch { /* 저장소를 못 쓰는 창 */ } };
/** "출력 길이가 너무 길다"는 거절이면 받을 수 있는 maxTokens 를 돌려준다 (아니면 0).
 *  보낸 값(생각 여유를 더한 것일 수 있다)과 허용 값이 함께 적혀 있으면 그 차이만큼 줄인다 — Claude · OpenAI · Gemini 의 글꼴을 읽는다 */
export function fitMaxTokens(e: unknown, maxTokens: number): number {
  const st = (e as { status?: number }).status, msg = String((e as Error)?.message || e || '');
  if (st === 429 || st === 401 || st === 403 || !maxTokens) return 0;
  if (!/max[_ ]?(output[_ ]?|completion[_ ]?)?tokens|maxOutputTokens|output tokens|completion tokens/i.test(msg) || !/too large|maximum|at most|supported range|exceed|limit|>\s*\d|less than or equal/i.test(msg)) return 0;
  const nums = [...msg.matchAll(/\d[\d,]*/g)].map(m => Number(m[0].replace(/,/g, ''))).filter(n => n >= 256 && n < 10_000_000);
  if (!nums.length) return maxTokens > 8192 ? Math.floor(maxTokens / 2) : 0;   // 한도가 적혀 있지 않다: 반으로 줄여 본다
  const sent = Math.max(...nums), under = nums.filter(n => n < sent);
  if (!under.length) return 0;
  const allowed = Math.max(...under) - (/exclusive/i.test(msg) ? 1 : 0), fit = Math.max(512, maxTokens - (sent - allowed));
  return fit < maxTokens ? fit : 0;
}
/** 호출마다의 요청 · 응답 받이 (streamChat 이 만든 signal → call() 이 찾는다) */
const taps = new WeakMap<AbortSignal, { req: (method: string, url: string, body: unknown) => void; res: (status: number, data: unknown) => void }>();
/** 주소 속 키는 가린다 */
const maskUrl = (u: string) => u.replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&]+/gi, '$1***');
/** 터미널에 찍을 사본: 이미지 같은 긴 base64 는 길이만 */
function scrub(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v.length > 600 && (/^data:[^;,]+;base64,/.test(v) || /^[A-Za-z0-9+/=\r\n]+$/.test(v)) ? `[base64 ${Math.round(v.length / 1024)}KB]` : v;
  if (!v || typeof v !== 'object' || depth > 40) return v;
  if (Array.isArray(v)) return v.map(x => scrub(x, depth + 1));
  const o: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v)) o[k] = scrub(x, depth + 1); return o;
}
type TermMode = 'off' | 'brief' | 'full';
const termMode = () => ((S.settings as { termLog?: TermMode }).termLog || 'full') as TermMode;
let termSeq = 0;
const oneLine = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);
const textOf = (c: unknown): string => typeof c === 'string' ? c : Array.isArray(c) ? c.map(p => typeof p === 'string' ? p : String((p as { text?: unknown })?.text ?? '')).join('') : c == null ? '' : JSON.stringify(c);
/** 업체마다 다른 사용량 이름 → { in, out } (모르면 0) */
function usageOf(u: unknown): { in: number; out: number } {
  const o = (u && typeof u === 'object' ? u : {}) as Record<string, unknown>;
  const n = (...ks: string[]) => { for (const k of ks) { const v = Number(o[k]); if (Number.isFinite(v) && v > 0) return v; } return 0; };
  return { in: n('prompt_tokens', 'input_tokens', 'promptTokenCount'), out: n('completion_tokens', 'output_tokens', 'candidatesTokenCount') };
}
const TERM_PARAMS: [string, string][] = [['temperature', 'temp'], ['topP', 'top_p'], ['topK', 'top_k'], ['minP', 'min_p'], ['topA', 'top_a'], ['repPen', 'rep_pen'], ['freqPen', 'freq_pen'], ['presPen', 'pres_pen'], ['seed', 'seed'], ['effort', 'effort']];
/** 터미널에 보일 호출 정보: 연결 · 모델 · 설정 · 메시지마다 역할과 토큰 (전체 모드면 내용까지) */
function termCallInfo(id: number, conn: Conn | null | undefined, P: Params, messages: PromptList, label: string, full: boolean) {
  let host = ''; try { host = conn ? new URL(String(conn.baseUrl || defOf(conn).base || '')).host : ''; } catch { /* 주소 없음 */ }
  const params: Record<string, string | number> = {};
  for (const [k, n] of TERM_PARAMS) { const v = (P as Record<string, unknown>)[k]; if ((typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v)) params[n] = v as string | number; }
  let budget = 300000;   // 전체 모드에서도 한 번에 보내는 글은 이만큼까지
  const msgs = messages.map(m => {
    const text = textOf(m.content), shown = full ? text.slice(0, Math.max(0, budget)) : oneLine(text, 160); if (full) budget -= shown.length;
    return { role: String(m.role || ''), name: String(m.name || ''), tok: tokens(text), img: Array.isArray(m.images) ? m.images.length : 0, text: shown, cut: shown.length < (full ? text.length : 0) };
  });
  return { id, label, conn: conn?.name || '', provider: conn?.provider || '', model: conn?.model || '', host, stream: P.stream !== false, max: P.maxTokens ?? null, params, msgs, full };
}
/** 서버 터미널로 보낸다. line 은 옛 서버(새로 켜지 않은 서버)도 찍는 한 줄 요약, more 는 새 서버가 보기 좋게 그리는 자료 */
function termSend(kind: 'call' | 'req' | 'res' | 'done' | 'err', line: string, more: () => Record<string, unknown>) {
  if (termMode() === 'off' || typeof fetch === 'undefined') return;
  // 기록을 꾸미는 일(프롬프트 전체의 토큰 세기 · 한 줄로 줄이기)은 한가할 때 한다 — 보내기를 누른 순간 긴 대화에서 화면이 멈추지 않게. 찍히는 차례는 그대로
  termQ = termQ.then(termIdle).then(() => { let extra: Record<string, unknown> = {}; try { extra = more(); } catch (e) { console.warn('[터미널 로그]', e); } return Server.post('log', { kind, line, v: 2, ...extra }); }).catch(() => { });
}
const termIdle = () => new Promise<void>(r => { const w = globalThis as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }; if (w.requestIdleCallback) w.requestIdleCallback(() => r(), { timeout: 1500 }); else setTimeout(r, 0); });
/** 터미널 기록은 보낸 차례대로 찍히게 하나씩 보낸다 */
let termQ: Promise<unknown> = Promise.resolve();
const termPost = (body: { kind: string; line: string; [k: string]: unknown }) => { termQ = termQ.then(() => Server.post('log', body)).catch(() => { }); };
/** 브라우저에서 일어난 일을 서버 터미널(Termux 등)에 한 줄 찍는다. 실패해도 조용히 넘어간다 */
export function termLog(kind: 'call' | 'done' | 'err' | 'info', line: string, prompt?: PromptList, out?: string) {
  const mode = termMode();
  if (mode === 'off' || typeof fetch === 'undefined') return;
  const body: { kind: string; line: string; prompt?: string; out?: string } = { kind, line };
  if (mode === 'full') {
    if (prompt) body.prompt = prompt.map(m => `[${m.role}] ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n').slice(0, 200000);
    if (out) body.out = out.slice(0, 50000);
  }
  termPost(body);
}

async function streamChatRaw(conn: Conn | null | undefined, Pin: Params, messages: PromptList, { signal, onText = () => { }, onThink = () => { } }: StreamOpts = {}): Promise<StreamResult> {
  if (!conn) throw new Error(tr('engine.err.noConn'));
  let P = Pin;
  const def = defOf(conn), kind = def.kind, model = conn.model as string;
  if (P.lowThink && P.effort) P = { ...P, effort: 'low' };   // 프리셋이 추론 강도를 정해 두었으면 보조 호출은 낮게
  const stream = P.stream !== false;
  const extra = jsonOr<Obj>(conn.extraBody, {});
  if (P.stop?.length) P = { ...P, stop: P.stop.map(xIn => { const x = String(xIn).replace(/\\n/g, '\n'); return AF().stopMacro !== false && P.names ? macro(x, { user: P.names.user, char: P.names.char }) : x; }).filter(Boolean) };   // 중단 문자열 안의 \n · 매크로
  const stopList = () => P.stop as string[];
  let text = '', think = '', finish: string | undefined = '', usage: unknown = null;
  const put = (t: string | undefined) => { if (t) { text += t; onText(t); } };
  const putThink = (t: string | undefined) => { if (t) { think += t; onThink(t); } };

  if (kind === 'mock') {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const reply = tr('engine.mock.reply', { text: lastUser.replace(/["“”]/g, '').slice(0, 60) || tr('engine.mock.hello') });
    for (const ch of reply.match(/[\s\S]{1,3}/g) as RegExpMatchArray) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      put(ch); await new Promise(r => setTimeout(r, 12));
    }
    return { text, think, finish: 'stop', usage };
  }

  if (!model) throw new Error(tr('engine.err.noModel'));
  const base = baseOf(conn);
  if (!base && kind !== 'vertex' && kind !== 'horde' && kind !== 'novelai') throw new Error(tr('engine.err.noBase'));

  const claudeOnVertex = kind === 'vertex' && /^claude/i.test(model);
  if (kind === 'anthropic' || claudeOnVertex) {
    const adaptive = claudeAdaptive(model);
    let msgs = messages as PromptMsg[];
    if (adaptive && msgs[msgs.length - 1]?.prefill) msgs = msgs.slice(0, -1); // 최신 Claude 는 프리필 미지원
    const { system, rest } = toAlternating(msgs, true);
    const body: Obj = {
      model, max_tokens: (P.maxTokens || 4096) + (adaptive ? THINK_ROOM() : 0), stream,
      messages: rest.map(m => ({ role: m.role, content: m.images?.length ? [...m.images.map(b64).filter(nn).map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text: m.content }] : m.content })),
    };
    if (system) body.system = system;
    if (conn.cache) body.cache_control = { type: 'ephemeral' };
    if (adaptive) {
      body.thinking = { type: 'adaptive', display: 'summarized' };
      if (P.effort) body.output_config = { effort: P.effort };
    } else {
      if (num(P.temperature)) body.temperature = Math.min(1, +P.temperature);
      else if (num(P.topP)) body.top_p = +P.topP; // 구형 Claude 는 temperature 와 top_p 를 함께 받지 않는다
      if (num(P.topK)) body.top_k = +P.topK;
    }
    if (P.stop?.length) body.stop_sequences = P.stop;
    const st = !stream ? P.structured : undefined;
    if (st?.tool) { body.tools = [{ name: st.tool.name, description: st.tool.description, input_schema: st.tool.parameters }]; body.tool_choice = adaptive ? { type: 'auto' } : { type: 'any' }; }
    Object.assign(body, extra);
    let url = base.replace(/\/v1$/, '') + '/v1/messages';
    let headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-api-key': conn.apiKey as string, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    if (claudeOnVertex) {
      const t = await vertexTarget(conn, 'anthropic', model, stream ? 'streamRawPredict' : 'rawPredict');
      url = t.url; headers = { 'Content-Type': 'application/json', ...t.headers };
      delete body.model; body.anthropic_version = 'vertex-2023-10-16';
    }
    const res = await call(conn, url, { headers, body, signal });
    const stopNote = (r?: string) => { if (r === 'refusal') put('\n\n' + tr('engine.refused')); };
    if (!stream) {
      const j: AnthJson = await res.json();
      let tool: string | undefined;
      for (const b of j.content || []) { if (b.type === 'text') put(b.text); if (b.type === 'thinking') putThink(b.thinking); if (b.type === 'tool_use' && b.name === st?.tool?.name) tool = JSON.stringify(b.input ?? {}); }
      stopNote(j.stop_reason);
      return { text, think, finish: j.stop_reason, usage: j.usage, tool };
    }
    for await (const evRaw of sse(res)) {
      const ev = evRaw as AnthEvent;
      if (ev.type === 'content_block_delta') { if (ev.delta?.type === 'text_delta') put(ev.delta.text); else if (ev.delta?.type === 'thinking_delta') putThink(ev.delta.thinking); }
      else if (ev.type === 'message_delta') { finish = ev.delta?.stop_reason || finish; usage = ev.usage || usage; }
      else if (ev.type === 'error') throw new Error(tr('engine.err.api', { why: ev.error?.message || 'stream error' }));
    }
    stopNote(finish);
    return { text, think, finish, usage };
  }

  if (kind === 'google' || kind === 'vertex') {
    const { system, rest } = toAlternating(messages, true);
    const thinks = /gemini-(2\.5|[3-9])/.test(model);
    const gen: Obj = { maxOutputTokens: (P.maxTokens || 4096) + (thinks ? THINK_ROOM() : 0) };
    if (num(P.temperature)) gen.temperature = +P.temperature;
    if (num(P.topP)) gen.topP = +P.topP;
    if (num(P.topK)) gen.topK = +P.topK;
    if (num(P.seed)) gen.seed = +P.seed;
    if (P.stop?.length) gen.stopSequences = P.stop.slice(0, 5);
    // 생각 정도: 보조 호출은 낮게, 본 대화는 프리셋의 "추론 강도"를 따른다 (비워 두면 모델 기본값). 2.5 는 토큰 수, 3 이후는 단계(low · high — 모든 모델이 받는 두 단계만 쓴다)
    const eff = P.lowThink ? 'low' : String(P.effort || '');
    const thinkSet = !eff ? {} : /gemini-2\.5/.test(model) ? { thinkingBudget: P.lowThink ? 512 : eff === 'low' ? 1024 : eff === 'medium' ? 8192 : 24576 } : { thinkingLevel: eff === 'low' ? 'low' : 'high' };
    if (thinks) gen.thinkingConfig = { includeThoughts: true, ...thinkSet };
    const body: Obj = {
      contents: rest.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [...(m.images || []).map(b64).filter(nn).map(i => ({ inlineData: { mimeType: i.mime, data: i.data } })), { text: m.content }] })), generationConfig: gen,
      safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map(c => ({ category: c, threshold: 'BLOCK_NONE' })),
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const st = !stream ? P.structured : undefined;
    if (st?.tool) { body.tools = [{ functionDeclarations: [{ name: st.tool.name, description: st.tool.description, parameters: gemSchema(st.tool.parameters) }] }]; body.toolConfig = { functionCallingConfig: { mode: 'ANY' } }; }
    if (st?.json || st?.jsonObject) gen.responseMimeType = 'application/json';
    let tool: string | undefined;
    Object.assign(body, extra);
    const id = encodeURIComponent(model.replace(/^models\//, '')), method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const t = kind === 'vertex' ? await vertexTarget(conn, 'google', id, method) : { url: `${base}/v1beta/models/${id}:${method}`, headers: { 'x-goog-api-key': conn.apiKey as string } };
    const res = await call(conn, t.url, { headers: { 'Content-Type': 'application/json', ...t.headers }, body, signal });
    const eat = (jIn: unknown) => {
      let j = jIn as GemJson;
      if (Array.isArray(j)) j = j[0] || {};
      if (j.error) throw new Error(tr('engine.err.apiStatus', { status: j.error.code || '', body: j.error.message || JSON.stringify(j.error) }));
      const c = j.candidates?.[0];
      for (const p of c?.content?.parts || []) { if (p.functionCall && p.functionCall.name === st?.tool?.name) tool = JSON.stringify(p.functionCall.args ?? {}); else if (p.thought) putThink(p.text); else put(p.text); }
      if (c?.finishReason) finish = c.finishReason;
      if (j.promptFeedback?.blockReason) put('\n\n' + tr('engine.blocked', { why: j.promptFeedback.blockReason }));
      usage = j.usageMetadata || usage;
    };
    if (stream) { for await (const ev of sse(res)) eat(ev); } else eat(await res.json());
    if (tool !== undefined) return { text, think, finish, usage, tool };
    // 글이 한 자도 안 왔으면 이유를 알려 준다
    if (!text.trim()) {
      const why = ['MAX_TOKENS', 'SAFETY', 'PROHIBITED_CONTENT', 'RECITATION', 'BLOCKLIST', 'SPII', 'OTHER'].includes(finish as string) ? tr('engine.finish.' + finish) : '';
      if (why) throw new Error(`${why} (finishReason: ${finish})`);
      if (!think) throw new Error(tr('engine.err.empty'));
    }
    return { text, think, finish, usage };
  }

  if (kind === 'text' || kind === 'kobold' || kind === 'horde' || kind === 'novelai') {
    const { prompt, stop } = flatten(messages, conn, P.names || {});
    const stops = [...new Set([...(stopList() || []), ...stop])];
    if (kind === 'text') {
      const body: Obj = { model, prompt, stream, max_tokens: P.maxTokens || 512, stop: stops.slice(0, 16) };
      if (num(P.temperature)) body.temperature = +P.temperature; if (num(P.topP)) body.top_p = +P.topP; if (num(P.topK)) body.top_k = +P.topK;
      if (num(P.minP)) body.min_p = +P.minP; if (num(P.topA)) body.top_a = +P.topA; if (num(P.repPen)) body.repetition_penalty = +P.repPen; if (num(P.seed)) body.seed = +P.seed;
      Object.assign(body, moreSamplers(P), logitBiasOf(P), extra);
      const res = await call(conn, base + '/completions', { headers: { 'Content-Type': 'application/json', ...(conn.apiKey ? { Authorization: 'Bearer ' + conn.apiKey } : {}) }, body, signal });
      if (!stream) { const j: OaiJson = await res.json(); put(j.choices?.[0]?.text || ''); return { text, think, finish: j.choices?.[0]?.finish_reason, usage: j.usage }; }
      for await (const evRaw of sse(res)) { const ev = evRaw as OaiJson; if (ev.error) throw new Error(tr('engine.err.api', { why: ev.error.message || JSON.stringify(ev.error) })); put(ev.choices?.[0]?.text || ''); if (ev.choices?.[0]?.finish_reason) finish = ev.choices[0].finish_reason; }
      return { text, think, finish, usage };
    }
    const kparams = { max_context_length: P.contextSize || 8192, max_length: Math.min(P.maxTokens || 512, 2048), stop_sequence: stops, ...(num(P.temperature) ? { temperature: +P.temperature } : {}), ...(num(P.topP) ? { top_p: +P.topP } : {}), ...(num(P.topK) ? { top_k: +P.topK } : {}), ...(num(P.topA) ? { top_a: +P.topA } : {}), ...(num(P.minP) ? { min_p: +P.minP } : {}), ...(num(P.repPen) ? { rep_pen: +P.repPen } : {}) };
    if (kind === 'kobold') {
      const res = await call(conn, base.replace(/\/v1$/, '') + '/v1/generate', { headers: { 'Content-Type': 'application/json' }, body: { prompt, ...kparams, use_story: false, use_memory: false, use_authors_note: false, use_world_info: false, ...extra }, signal });
      put(((await res.json()) as { results?: { text?: string }[] }).results?.[0]?.text || ''); return { text, think, finish: 'stop', usage };
    }
    if (kind === 'horde') {
      const hb = base || 'https://aihorde.net/api/v2', headers = { 'Content-Type': 'application/json', apikey: conn.apiKey || '0000000000', 'Client-Agent': 'Dreamland:1:local' };
      const { id } = await (await call(conn, hb + '/generate/text/async', { headers, body: { prompt, params: kparams, models: model && model !== 'any' ? [model] : [], ...extra }, signal })).json() as { id: string };
      try {
        for (;;) {
          await new Promise((r, j) => { const t = setTimeout(r, 2500); signal?.addEventListener('abort', () => { clearTimeout(t); j(new DOMException('aborted', 'AbortError')); }, { once: true }); });
          const st = await (await call(conn, hb + '/generate/text/status/' + id, { method: 'GET', headers, signal })).json() as { faulted?: boolean; done?: boolean; generations?: { text?: string }[] };
          if (st.faulted) throw new Error(tr('engine.err.horde'));
          if (st.done) { put(st.generations?.[0]?.text || ''); return { text, think, finish: 'stop', usage }; }
        }
      } catch (e) { if (errName(e) === 'AbortError') call(conn, hb + '/generate/text/status/' + id, { method: 'DELETE', headers }).catch(() => { }); throw e; }
    }
    // NovelAI
    const nb = base || (/kayra|erato/.test(model) ? 'https://text.novelai.net' : 'https://api.novelai.net');
    const res = await call(conn, nb + '/ai/generate', { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + conn.apiKey }, body: { input: prompt, model, parameters: { use_string: true, temperature: num(P.temperature) ? +P.temperature : 1, max_length: Math.min(P.maxTokens || 150, 250), min_length: 1, ...(num(P.topP) ? { top_p: +P.topP } : {}), ...(num(P.topK) ? { top_k: +P.topK } : {}), ...(num(P.repPen) ? { repetition_penalty: +P.repPen } : {}), generate_until_sentence: true, ...extra } }, signal });
    put(((await res.json()) as { output?: string }).output || ''); return { text, think, finish: 'stop', usage };
  }

  // OpenAI 호환 (+ Azure)
  const shaped = shapeMessages(messages, conn.postProcess || 'none', P.names || {});
  const body: Obj = { model, stream, messages: shaped.map(m => ({ role: m.role, content: m.images?.length ? [{ type: 'text', text: m.content }, ...m.images.map(url => ({ type: 'image_url', image_url: { url } }))] : m.content })) };
  const official = !!def.official || kind === 'azure';
  if (num(P.maxTokens)) body[official ? 'max_completion_tokens' : 'max_tokens'] = +P.maxTokens;
  if (num(P.temperature)) body.temperature = +P.temperature;
  if (num(P.topP)) body.top_p = +P.topP;
  if (num(P.freqPen)) body.frequency_penalty = +P.freqPen;
  if (num(P.presPen)) body.presence_penalty = +P.presPen;
  if (num(P.seed)) body.seed = +P.seed;
  if (P.stop?.length) body.stop = P.stop.slice(0, 4);
  if (def.samplers) { // 표준 밖의 샘플러는 받아 주는 곳에만 보낸다
    if (num(P.topK)) body.top_k = +P.topK;
    if (num(P.minP)) body.min_p = +P.minP;
    if (num(P.topA)) body.top_a = +P.topA;
    if (num(P.repPen)) body.repetition_penalty = +P.repPen;
    Object.assign(body, moreSamplers(P));
  }
  Object.assign(body, logitBiasOf(P));
  if (P.effort) { if (conn.provider === 'openrouter') body.reasoning = { effort: P.effort }; else body.reasoning_effort = P.effort; }
  else if (P.lowThink && conn.provider === 'openrouter') body.reasoning = { effort: 'low' };   // OpenRouter 는 추론하지 않는 모델이면 이 값을 그냥 넘긴다
  // 보조 호출(기억 정리 등): 프리셋에 추론 강도가 없어도 Gemini 계열은 'low' 를 적어 보낸다 — OpenAI 호환 주소(중계 · 사용자 지정)로 가면 모델 기본값(높음)으로 생각을 길게 해서 잘리거나 실패하고 요금이 몇 배로 든다.
  // 받지 않는 곳이면 quickCall 이 그 설정을 빼고 한 번 더 보낸다
  else if (P.lowThink && /gemini/i.test(model)) body.reasoning_effort = 'low';
  if (stream && official) body.stream_options = { include_usage: true };
  const st = !stream ? P.structured : undefined;
  if (st?.tool) { body.tools = [{ type: 'function', function: { name: st.tool.name, description: st.tool.description, parameters: st.tool.parameters } }]; body.tool_choice = 'required'; }
  if (st?.json) body.response_format = { type: 'json_schema', json_schema: { name: st.json.name, strict: false, schema: st.json.schema } };
  else if (st?.jsonObject) body.response_format = { type: 'json_object' };
  Object.assign(body, extra);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (conn.apiKey) { if (kind === 'azure') headers['api-key'] = conn.apiKey; else headers.Authorization = 'Bearer ' + conn.apiKey; }
  if (conn.provider === 'openrouter') { headers['X-Title'] = 'Dreamland'; headers['HTTP-Referer'] = location.origin; }
  const url = kind === 'azure' ? base.replace(/\/openai(\/v1)?$/, '') + '/openai/v1/chat/completions' : base + '/chat/completions';
  const res = await call(conn, url, { headers, body, signal });
  if (!stream) {
    const j: OaiJson = await res.json(); const m = j.choices?.[0]?.message || {};
    putThink(m.reasoning_content || m.reasoning || ''); put(m.content || '');
    const call0 = st?.tool ? [...(m.tool_calls || [])].reverse().find(c => c.function?.name === st.tool!.name) : undefined;
    return { text, think, finish: j.choices?.[0]?.finish_reason, usage: j.usage, tool: call0?.function?.arguments ?? undefined };
  }
  for await (const evRaw of sse(res)) {
    const ev = evRaw as OaiJson;
    if (ev.error) throw new Error(tr('engine.err.api', { why: ev.error.message || JSON.stringify(ev.error) }));
    const d = ev.choices?.[0]?.delta || {};
    putThink(d.reasoning_content || d.reasoning || '');
    put(typeof d.content === 'string' ? d.content : '');
    if (ev.choices?.[0]?.finish_reason) finish = ev.choices[0].finish_reason;
    if (ev.usage) usage = ev.usage;
  }
  return { text, think, finish, usage };
}

type ModelItem = string | { id?: string; name?: string };
export async function listModels(conn: Conn): Promise<string[]> {
  const def = defOf(conn), base = baseOf(conn);
  if (def.kind === 'mock') return ['echo'];
  if (def.kind === 'vertex') {   // 모델 가든에서 실제 목록을 받아 온다 (Google · Anthropic)
    const out: string[] = [];
    for (const pub of ['google', 'anthropic']) {
      try {
        const t = await vertexTarget(conn, pub, 'x', 'y');   // 주소와 인증만 빌려 쓴다
        const host = new URL(t.url).origin; let page = '';
        for (let i = 0; i < 5; i++) {
          const j = await (await call(conn, `${host}/v1beta1/publishers/${pub}/models?pageSize=200${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, { method: 'GET', headers: t.headers })).json() as { publisherModels?: { name?: string }[]; nextPageToken?: string };
          for (const m of j.publisherModels || []) { const id = String(m.name || '').split('/').pop(); if (id && (pub === 'anthropic' || /gemini|gemma/.test(id))) out.push(id); }
          page = j.nextPageToken || ''; if (!page) break;
        }
      } catch (e) { if (pub === 'google' && !out.length) console.warn('vertex models', e); }
    }
    return out.length ? [...new Set(out)].sort().reverse() : def.models;
  }
  if (def.kind === 'anthropic') {
    const r = await call(conn, base.replace(/\/v1$/, '') + '/v1/models?limit=100', { method: 'GET', headers: { 'x-api-key': conn.apiKey as string, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    return ((await r.json()) as { data: { id: string }[] }).data.map(m => m.id);
  }
  if (def.kind === 'google') {
    const r = await call(conn, base + '/v1beta/models?pageSize=200', { method: 'GET', headers: { 'x-goog-api-key': conn.apiKey as string } });
    return ((await r.json()) as { models: { name: string; supportedGenerationMethods?: string[] }[] }).models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  }
  const headers: Record<string, string> = !conn.apiKey ? {} : def.kind === 'azure' ? { 'api-key': conn.apiKey } : { Authorization: 'Bearer ' + conn.apiKey };
  const url = def.kind === 'azure' ? base.replace(/\/openai(\/v1)?$/, '') + '/openai/v1/models' : base + '/models';
  const j = await (await call(conn, url, { method: 'GET', headers })).json() as ModelItem[] | { data?: ModelItem[]; models?: ModelItem[] };
  return (Array.isArray(j) ? j : (j.data || j.models || [])).map(m => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean).sort() as string[];
}

/** 보조 호출(요약·트래커·번역): 스트리밍 없이 한 번에 */
/** 프리셋의 추가 샘플러 (로컬 · 모음 서비스용). 비워 둔 것은 보내지 않는다 */
const MORE_SAMPLERS: [string, string][] = [['typicalP', 'typical_p'], ['tfs', 'tfs'], ['topNSigma', 'top_n_sigma'], ['smoothing', 'smoothing_factor'], ['mirostat', 'mirostat_mode'], ['mirostatTau', 'mirostat_tau'], ['mirostatEta', 'mirostat_eta'],
  ['dryMultiplier', 'dry_multiplier'], ['dryBase', 'dry_base'], ['dryLength', 'dry_allowed_length'], ['xtcThreshold', 'xtc_threshold'], ['xtcProbability', 'xtc_probability']];
function moreSamplers(P: Params): Obj { const o: Obj = {}; for (const [k, name] of MORE_SAMPLERS) { const v = (P as Record<string, unknown>)[k]; if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) o[name] = Number(v); } return o; }
/** 로짓 바이어스: 프리셋에 적은 { "토큰 번호": 값 } (JSON). 올바르지 않으면 보내지 않는다 */
function logitBiasOf(P: Params): Obj {
  const raw = String((P as Record<string, unknown>).logitBias || '').trim(); if (!raw) return {};
  try { const j = JSON.parse(raw); if (!j || typeof j !== 'object' || Array.isArray(j)) return {}; const o: Record<string, number> = {}; for (const [k, v] of Object.entries(j)) if (/^\d+$/.test(k) && Number.isFinite(Number(v))) o[k] = Math.max(-100, Math.min(100, Number(v))); return Object.keys(o).length ? { logit_bias: o } : {}; } catch { return {}; }
}
/** Gemini 함수 선언이 받는 꼴로 (JSON 스키마의 $schema · additionalProperties 같은 칸은 뺀다) */
function gemSchema(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(gemSchema);
  if (!v || typeof v !== 'object') return v;
  const o: Obj = {}; for (const [k, x] of Object.entries(v as Obj)) if (k !== '$schema' && k !== 'additionalProperties') o[k] = gemSchema(x); return o;
}
/** 생각을 적게 하라는 요청을 거절한 모델 (이번 실행 동안은 다시 보내지 않는다) */
const noLowThink = new Set<string>();
export async function quickCall(system: string, user: string, { maxTokens = 1500, signal, conn, lowThink = false, temp }: { maxTokens?: number; signal?: AbortSignal; conn?: Conn | null; lowThink?: boolean; temp?: number } = {}): Promise<string> {
  const c = conn || S.conn(), key = `${c?.provider}|${c?.model}`, low = lowThink && !noLowThink.has(key);
  const P: Params = { ...S.preset().params, stream: false, maxTokens, prefill: '', stop: [], ...(low ? { lowThink: true } : {}), ...(temp != null ? { temperature: temp } : {}) };
  const msgs: PromptList = [{ role: 'system', content: system }, { role: 'user', content: user }];
  let r: StreamResult;
  try { r = await streamChat(c, P, msgs, { signal, label: 'helper' }); }
  catch (e) {
    // 생각 설정을 받지 않는 모델이면 한 번만 그 설정 없이 다시 보내고 기억해 둔다
    if (!low || errName(e) === 'AbortError' || !/think|reason|effort|budget|level|invalid argument|unknown (field|name|parameter)/i.test(String(errMsg(e) ?? ''))) throw e;
    noLowThink.add(key); r = await streamChat(c, { ...P, lowThink: false }, msgs, { signal, label: 'helper' });
  }
  return splitThink(r.text).text.trim();
}
