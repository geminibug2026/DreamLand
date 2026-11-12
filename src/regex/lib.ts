// 정규식 화면이 쓰는 자료 꼴과 다리. 실행 규칙(engine) · 진단(regex-lint) · 범위 저장과 멈춤 방지 작업자(f-regex 의 RegexUI)는 옛 모듈을 그대로 부른다
import { L, mod } from '../legacy';
import type { Char, Chat } from '../types';
import { S, arr, core, type Msg, type Obj, type Preset, type Regex } from '../studio/bridge';

export interface Sc { kind: 'global' | 'preset' | 'char'; id?: string }
export interface Entry { r: Regex; sc: Sc }
export interface Issue { level: 'error' | 'warn' | 'info'; msg: string }
export interface Lint { ok: boolean; issues: Issue[]; flagNotes: string[]; groups: number }
export interface Match { index: number; match: string; groups: (string | undefined)[]; named: Record<string, string | undefined> | null; raw: string; cut: string; out: string }
export interface Trace { source?: string; matches?: Match[]; error?: string }
export type Who = 'user' | 'ai' | 'slash' | 'lore' | 'reason';
export type Target = 'display' | 'prompt' | 'store';
export interface Env { who: Who; target: Target; depth?: number; charId?: string; chat?: Chat | null; preset?: Preset; edit: boolean; ctx: unknown }
export interface ScriptIt { r: Regex; kind: Sc['kind']; owner: string; skip: string }
export interface Step { id: string; name: string; kind: Sc['kind']; owner: string; r: Regex; skip: string; before?: string; after?: string; source?: string; matches?: Match[] }
export interface RegexSet { id: string; name: string; on: string[]; known: string[] }
export type HitPart = { t: string; hit: boolean; i?: number };
export type DiffPart = { t: string } | { t?: undefined; del: string; ins: string; i: number };

interface EngineMod {
  compileRegex(src: string): RegExp | null; regexAllowed(kind: 'chars' | 'presets', id?: string): boolean;
  regexScripts(o: { chat?: Chat | null; charId?: string; preset?: Preset; all?: boolean }): ScriptIt[];
  regexSkip(r: Regex, env: Partial<Env>): string; regexFind(r: Regex, ctx: unknown): string;
  regexEnv(o: Partial<Omit<Env, 'ctx'>>): Env; regexStep(it: ScriptIt, text: string, env: Env): Step;
  runRegexScript(r: Regex, text: string, ctx: unknown, trace?: Trace): string;
}
interface LintMod {
  lintScript(r: Partial<Regex>): Lint; whyNoMatch(lint: Lint, sample: string): string[]; SKIP_TEXT: Record<string, string>;
  skipDetail(code: string, r: Regex, env?: Partial<Env>): string; diffParts(text: string, matches?: Match[]): DiffPart[]; hitParts(text: string, matches?: Match[]): HitPart[];
  tally(matches?: Match[]): { found: number; removed: number; added: number };
}
interface CardsMod {
  regexToSt(r: Regex): Obj; regexFromJson(j: unknown, scope?: string): Regex[]; scopedRegex(charId?: string): Regex[];
  presetToSt(p: Preset): Obj; stPresetWithRegex(j: Obj, scripts: Regex[]): Obj;
}
interface RegexUi {
  Scope: { list(sc: Sc): Regex[]; save(sc: Sc, r: Regex): Promise<void>; reorder(sc: Sc, list: Regex[]): Promise<void>; add(sc: Sc, r: Regex): Promise<Regex>; remove(sc: Sc, r: Regex): Promise<void> };
  everything(): Entry[]; moveScripts(items: Entry[], to: Sc): Promise<number>; applySet(set: RegexSet): Promise<number>;
  probe(source: string, flags: string, text: string, ms?: number): Promise<{ ok: boolean }>; findScript(id: string): Entry | null;
}
interface ChatApi { current(): { chat: Chat | null; msgs: Msg[]; busy: boolean }; groupTitle(c: Chat): string; roomName(c: Chat): string; redraw(): void }

export const needs = ['f-regex', 'engine', 'cards', 'regex-lint', 'chat'];
export const E = () => mod<EngineMod>('engine');
export const Lint = () => mod<LintMod>('regex-lint');
export const Cards = () => mod<CardsMod>('cards');
export const RX = () => mod<{ RegexUI: RegexUi }>('f-regex').RegexUI;
export const chatApi = () => mod<{ chatApi: ChatApi }>('chat').chatApi;

// ── 범위 ──
export const G: Sc = { kind: 'global' };
export const isGlobal = (r: Regex) => !r.scope || r.scope === 'global';
export const scKey = (sc: Sc) => (sc.kind === 'global' ? 'global' : `${sc.kind}:${sc.id}`);
export const scShort = (sc: Sc) => ({ global: '전역', preset: '프리셋', char: '캐릭터' }[sc.kind]);
export const scOwner = (sc: Sc) => (sc.kind === 'preset' ? S().get<Preset>('presets', sc.id)?.name || '없어진 프리셋' : sc.kind === 'char' ? S().get<Char>('chars', sc.id)?.name || '없어진 캐릭터' : '');
export const scName = (sc: Sc) => (sc.kind === 'global' ? '전역' : `${scShort(sc)} · ${scOwner(sc)}`);
type AllowMap = Record<string, Record<string, boolean | 'ask'> | undefined>;
const allowMap = () => (S().settings.regexAllow || {}) as AllowMap;
export const allowState = (sc: Sc) => allowMap()[sc.kind === 'char' ? 'chars' : 'presets']?.[sc.id || ''];
export const isAllowed = (sc: Sc) => sc.kind === 'global' || E().regexAllowed(sc.kind === 'char' ? 'chars' : 'presets', sc.id);
export function setAllow(sc: Sc, v: boolean) {
  if (sc.kind === 'global') return;
  const a = allowMap(), k = sc.kind === 'char' ? 'chars' : 'presets';
  S().set({ regexAllow: { ...a, [k]: { ...(a[k] || {}), [sc.id || '']: v } } });
}
export const redrawChat = () => { try { if (L.ui.route.page === 'chat' && !chatApi().current().busy) chatApi().redraw(); } catch { /* 대화 화면이 아직 없으면 그대로 둔다 */ } };

// ── 표시용 짧은 글 ──
export type WhoKey = 'onUser' | 'onAI' | 'onSlash' | 'onLore' | 'onReason';
export const WHO: [WhoKey, string, string, Who][] = [['onUser', '내 입력', '입력', 'user'], ['onAI', 'AI 응답', '응답', 'ai'], ['onSlash', '명령어로 넣은 글', '명령', 'slash'], ['onLore', '로어북 내용', '로어', 'lore'], ['onReason', '생각 과정', '생각', 'reason']];
export const MODES: [string, string, string][] = [['display', '화면에 보일 때만', '화면'], ['prompt', 'AI 에게 보낼 때만', '전송'], ['both', '화면 + 전송 (원문은 그대로)', '화면+전송'], ['store', '원문을 바꿔 저장', '원문']];
export const whoShort = (r: Regex) => WHO.filter(w => r[w[0]]).map(w => w[2]).join('·') || '대상 없음';
export const modeShort = (r: Regex) => MODES.find(m => m[0] === r.mode)?.[2] || '화면';
export const clip = (v: unknown, n = 70) => { const s = String(v ?? '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) + '…' : s; };
// eslint-disable-next-line no-control-regex
export const safeName = (s: unknown) => String(s || 'regex').replace(/[\s.<>:"/\\|?*\x00-\x1F\x7F]/g, '_').toLowerCase();
const lintCache = new Map<string, Lint>();
export function lintOf(r: Regex) {
  const key = JSON.stringify([r.find, r.replace, r.trim, r.onUser, r.onAI, r.onSlash, r.onLore, r.onReason, r.mode, r.subst, r.minDepth, r.maxDepth, r.runOnEdit]);
  let v = lintCache.get(key);
  if (!v) { if (lintCache.size > 3000) lintCache.clear(); v = Lint().lintScript(r); lintCache.set(key, v); }
  return v;
}
export const worst = (r: Regex) => { const is = lintOf(r).issues; return is.some(x => x.level === 'error') ? 'error' : is.some(x => x.level === 'warn') ? 'warn' : ''; };

/** 매크로 문맥: 지금 열려 있는 대화(없으면 가장 최근 대화) 기준 */
export function ctxOf(chat: Chat | null): unknown { try { return chat ? E().regexEnv({ chat }).ctx : null; } catch { return null; } }
export const lastChat = (): Chat | null => chatApi().current().chat || [...S().chats].sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
export const chatLabel = (c: Chat) => { try { return `${chatApi().groupTitle(c)} · ${chatApi().roomName(c)}`; } catch { return c.name || '대화'; } };

// ── 내보내기 · 켜짐 묶음 ──
export const exportOne = (r: Regex) => core().download(`regex-${safeName(r.name)}.json`, JSON.stringify(Cards().regexToSt(r), null, 4));
export const exportMany = (list: Regex[]) => core().download(`regex-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(list.map(Cards().regexToSt), null, 4));
export const sets = () => arr(S().settings.regexSets as RegexSet[] | undefined);
export const snapshot = () => { const all = RX().everything(); return { on: all.filter(e => e.r.enabled).map(e => e.r.id), known: all.map(e => e.r.id) }; };

export const TARGETS: [Target, string][] = [['display', '화면 표시'], ['prompt', '프롬프트 전송'], ['store', '저장할 때']];
export { debounce } from '../studio/bridge';
