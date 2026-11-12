// 정규식 화면이 쓰는 자료 꼴과 다리. 실행 규칙(engine) · 진단(regex-lint) · 진단(regex-lint)은 옛 모듈을 그대로 부르고, 범위 저장 · 켜짐 묶음 · 멈춤 방지 작업자는 여기 있다
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
export interface RegexUi {
  Scope: { list(sc: Sc): Regex[]; save(sc: Sc, r: Regex): Promise<void>; reorder(sc: Sc, list: Regex[]): Promise<void>; add(sc: Sc, r: Regex): Promise<Regex>; remove(sc: Sc, r: Regex): Promise<void> };
  everything(): Entry[]; moveScripts(items: Entry[], to: Sc): Promise<number>; applySet(set: RegexSet): Promise<number>;
  probe(source: string, flags: string, text: string, ms?: number): Promise<{ ok: boolean }>; findScript(id: string): Entry | null;
}
interface ChatApi { current(): { chat: Chat | null; msgs: Msg[]; busy: boolean }; groupTitle(c: Chat): string; roomName(c: Chat): string; redraw(): void }

export const needs = ['engine', 'cards', 'regex-lint', 'chat'];
export const E = () => mod<EngineMod>('engine');
export const Lint = () => mod<LintMod>('regex-lint');
export const Cards = () => mod<CardsMod>('cards');
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

// ── 범위별 저장 ──
const byOrder = (list: Regex[]) => list.map((r, i) => [r, i] as const).sort((a, b) => (+(a[0].order ?? 0) || 0) - (+(b[0].order ?? 0) || 0) || a[1] - b[1]).map(x => x[0]);
const presetOf = (sc: Sc) => S().get<Preset>('presets', sc.id);
export const Scope: RegexUi['Scope'] = {
  list(sc) { return sc.kind === 'global' ? byOrder(S().regex.filter(isGlobal)) : sc.kind === 'char' ? Cards().scopedRegex(sc.id) : arr(presetOf(sc)?.regex).filter(r => r && typeof r === 'object'); },
  async save(sc, r) { if (sc.kind === 'preset') { const p = presetOf(sc); if (p) await S().save('presets', p, true); } else await S().save('regex', r, true); },
  /** 목록을 이 순서로 굳힌다 */
  async reorder(sc, list) {
    if (sc.kind === 'preset') { const p = presetOf(sc); if (!p) return; list.forEach((r, i) => { r.order = i; }); p.regex = list; await S().save('presets', p, true); return; }
    for (let i = 0; i < list.length; i++) if (list[i].order !== i) { list[i].order = i; await S().save('regex', list[i], true); }
  },
  async add(sc, r) {
    const list = Scope.list(sc);
    r.scope = sc.kind === 'global' ? 'global' : sc.kind === 'char' ? sc.id : 'preset';
    r.order = list.reduce((m, x) => Math.max(m, +(x.order ?? 0) || 0), -1) + 1;
    if (sc.kind === 'preset') {
      const p = presetOf(sc); if (!p) throw new Error('프리셋을 찾지 못했어요');
      if (list.some(x => x.id === r.id)) r.id = L.core.uid();
      p.regex = [...list, r]; await S().save('presets', p, true);
    } else { const hit = S().get<Regex>('regex', r.id); if (hit && hit !== r) r.id = L.core.uid(); await S().save('regex', r, true); }
    return r;
  },
  async remove(sc, r) {
    if (sc.kind === 'preset') { const p = presetOf(sc); if (!p) return; p.regex = arr(p.regex).filter(x => x !== r); await S().save('presets', p, true); }
    else await S().remove('regex', r.id);
  },
};
/** 모든 범위의 스크립트 — 전역, 프리셋들, 캐릭터들 순 */
export function everything(): Entry[] {
  const out: Entry[] = Scope.list(G).map(r => ({ r, sc: G }));
  for (const p of S().presets) { const sc: Sc = { kind: 'preset', id: p.id }; for (const r of Scope.list(sc)) out.push({ r, sc }); }
  for (const id of [...new Set(S().regex.filter(r => !isGlobal(r)).map(r => r.scope))]) { const sc: Sc = { kind: 'char', id }; for (const r of Scope.list(sc)) out.push({ r, sc }); }
  return out;
}
export const findScript = (id: string): Entry | null => everything().find(e => e.r.id === id) || null;
/** 스크립트를 다른 범위로 옮긴다. 옮겨 간 범위는 바로 쓸 수 있게 허용해 둔다 (직접 옮긴 것이니 다시 묻지 않는다) */
export async function moveScripts(items: Entry[], to: Sc) {
  let n = 0;
  for (const { r, sc } of items) {
    if (scKey(sc) === scKey(to)) continue;
    await Scope.remove(sc, r);
    await Scope.add(to, r); n++;
  }
  if (n && !isAllowed(to)) setAllow(to, true);
  return n;
}
/** 켜짐 묶음을 적용한다 → 바뀐 개수 */
export async function applySet(set: RegexSet) {
  const on = new Set(set.on), known = new Set(set.known), presets = new Set<string>(); let n = 0;
  for (const { r, sc } of everything()) {
    if (!known.has(r.id)) continue;
    const want = on.has(r.id); if (!!r.enabled === want) continue;
    r.enabled = want; n++;
    if (sc.kind === 'preset') presets.add(sc.id || ''); else await S().save('regex', r, true);
  }
  for (const id of presets) { const p = S().get<Preset>('presets', id); if (p) await S().save('presets', p, true); }
  S().set({ regexSet: set.id }); redrawChat();
  return n;
}

// ── 멈춤 방지: 정규식을 따로 떨어진 작업자에서 먼저 돌려 본다 ──
const PROBE = 'onmessage = e => { const d = e.data; try { const re = new RegExp(d.source, d.flags); let n = 0; d.text.replace(re, () => { n++; return ""; }); postMessage({ id: d.id, ok: true, n }); } catch (err) { postMessage({ id: d.id, ok: true, n: 0 }); } };';
type Probed = { ok: boolean; hang?: boolean; unguarded?: boolean };
let worker: Worker | null = null, probeSeq = 0, probeQueue: Promise<Probed> = Promise.resolve({ ok: true });
function probeOnce(source: string, flags: string, text: string, ms: number) {
  return new Promise<Probed>(res => {
    if (typeof Worker === 'undefined') return res({ ok: true, unguarded: true });
    try { worker ||= new Worker(URL.createObjectURL(new Blob([PROBE], { type: 'text/javascript' }))); } catch { return res({ ok: true, unguarded: true }); }
    const id = ++probeSeq, w = worker;
    const done = (v: Probed) => { clearTimeout(timer); w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); res(v); };
    const onMsg = (e: MessageEvent<{ id?: number }>) => { if (e.data?.id === id) done({ ok: true }); };
    const onErr = () => { worker = null; done({ ok: true, unguarded: true }); };
    const timer = setTimeout(() => { try { w.terminate(); } catch { /* 이미 끝났다 */ } if (worker === w) worker = null; done({ ok: false, hang: true }); }, ms);
    w.addEventListener('message', onMsg); w.addEventListener('error', onErr);
    w.postMessage({ id, source, flags, text });
  });
}
/** 이 정규식이 이 글에서 제때 끝나는가. 끝나지 않으면 { ok: false, hang: true } — 화면이 얼지 않게 본 실행 전에 확인한다 */
export const probe = (source: string, flags: string, text: string, ms = 1500) => (probeQueue = probeQueue.then(() => probeOnce(source, flags, text, ms)));
const UI: RegexUi = { Scope, everything, findScript, moveScripts, applySet, probe };
export const RX = () => UI;

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
