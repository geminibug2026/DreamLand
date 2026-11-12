// ── Dreamland 정규식 범위 (옛 js/f-regex.js 의 화면 밖 부분: RegexUI 의 범위 저장 · 허용 · 멈춤 방지 작업자 · 켜짐 묶음) ──
// 화면(편집 창 · 디버거 · 목록)은 src/regex 가, 명령어 · 처음 쓸 때 묻는 창은 src/features/regexLib.tsx 가 맡는다.
import * as core from './core';
import { regexAllowed, type Regex, type Preset, type Chat } from './engine';
import * as cards from './cards';

export type ScKind = 'global' | 'preset' | 'char';
/** sc = { kind: 'global' } | { kind: 'preset', id } | { kind: 'char', id } */
export interface Sc { kind: ScKind; id?: string }
export interface Entry { r: Regex; sc: Sc }
export interface RegexSet { id: string; name: string; on: string[]; known: string[] }
type AllowMap = Record<string, Record<string, boolean | 'ask'> | undefined>;
interface ScopeStore {
  settings: { regexAllow?: AllowMap; regexSets?: RegexSet[]; regexSet?: string; [k: string]: unknown };
  regex: Regex[]; presets: Preset[]; chars: { id: string; name: string }[];
  get(coll: string, id?: string): unknown; save(coll: string, obj: unknown, silent?: boolean): Promise<unknown>; remove(coll: string, id: string): Promise<unknown>; set(patch: Record<string, unknown>): void;
  presetFor(chat: Chat): Preset | undefined;
}
const C0 = core as unknown as { S: ScopeStore; uid(): string; arr<T>(v: T | T[] | null | undefined): T[] };
const S = C0.S, uid = () => C0.uid(), arr = <T>(v: T | T[] | null | undefined): T[] => C0.arr(v);
const scopedRegex = (charId?: string) => (cards as unknown as { scopedRegex(id?: string): Regex[] }).scopedRegex(charId);

/** 대화 화면을 다시 그리는 곳 (화면 쪽이 붙인다 — 옛 판의 redrawChat) */
export const regexScopeHooks: { redrawChat: () => void } = { redrawChat: () => { } };
const redrawChat = () => { try { regexScopeHooks.redrawChat(); } catch { /* 대화 화면이 없으면 그대로 둔다 */ } };

// ════════ 범위 ════════
export const G: Sc = { kind: 'global' };
export const isGlobal = (r: Regex) => !r.scope || r.scope === 'global';
const byOrder = (list: Regex[]) => list.map((r, i) => [r, i] as const).sort((a, b) => (+(a[0].order as number) || 0) - (+(b[0].order as number) || 0) || a[1] - b[1]).map(x => x[0]);
export const scKey = (sc: Sc) => (sc.kind === 'global' ? 'global' : `${sc.kind}:${sc.id}`);
export const scShort = (sc: Sc) => ({ global: '전역', preset: '프리셋', char: '캐릭터' }[sc.kind]);
export const scOwner = (sc: Sc) => (sc.kind === 'preset' ? (S.get('presets', sc.id) as Preset | undefined)?.name || '없어진 프리셋' : sc.kind === 'char' ? (S.get('chars', sc.id) as { name?: string } | undefined)?.name || '없어진 캐릭터' : '');
export const scName = (sc: Sc) => (sc.kind === 'global' ? '전역' : `${scShort(sc)} · ${scOwner(sc)}`);
const presetOf = (sc: Sc) => S.get('presets', sc.id) as Preset | undefined;
export const Scope = {
  list(sc: Sc): Regex[] { return sc.kind === 'global' ? byOrder(S.regex.filter(isGlobal)) : sc.kind === 'char' ? scopedRegex(sc.id) : arr(presetOf(sc)?.regex as Regex[] | undefined).filter(r => r && typeof r === 'object'); },
  async save(sc: Sc, r: Regex): Promise<void> { if (sc.kind === 'preset') { const p = presetOf(sc); if (p) await S.save('presets', p, true); } else await S.save('regex', r, true); },
  /** 목록을 이 순서로 굳힌다 */
  async reorder(sc: Sc, list: Regex[]): Promise<void> {
    if (sc.kind === 'preset') { const p = presetOf(sc); if (!p) return; list.forEach((r, i) => { r.order = i; }); p.regex = list; await S.save('presets', p, true); return; }
    for (let i = 0; i < list.length; i++) if (list[i].order !== i) { list[i].order = i; await S.save('regex', list[i], true); }
  },
  async add(sc: Sc, r: Regex): Promise<Regex> {
    const list = this.list(sc);
    r.scope = sc.kind === 'global' ? 'global' : sc.kind === 'char' ? sc.id as string : 'preset';
    r.order = list.reduce((m, x) => Math.max(m, +(x.order as number) || 0), -1) + 1;
    if (sc.kind === 'preset') {
      const p = presetOf(sc); if (!p) throw new Error('프리셋을 찾지 못했어요');
      if (list.some(x => x.id === r.id)) r.id = uid();
      p.regex = [...list, r]; await S.save('presets', p, true);
    } else { const hit = S.get('regex', r.id); if (hit && hit !== r) r.id = uid(); await S.save('regex', r, true); }
    return r;
  },
  async remove(sc: Sc, r: Regex): Promise<void> {
    if (sc.kind === 'preset') { const p = presetOf(sc); if (!p) return; p.regex = arr(p.regex as Regex[] | undefined).filter(x => x !== r); await S.save('presets', p, true); }
    else await S.remove('regex', r.id);
  },
};
/** 모든 범위의 스크립트 [{ r, sc }] — 전역, 프리셋들, 캐릭터들 순 */
export function everything(): Entry[] {
  const out: Entry[] = Scope.list(G).map(r => ({ r, sc: G }));
  for (const p of S.presets) { const sc: Sc = { kind: 'preset', id: p.id }; for (const r of Scope.list(sc)) out.push({ r, sc }); }
  for (const id of [...new Set(S.regex.filter(r => !isGlobal(r)).map(r => r.scope as string))]) { const sc: Sc = { kind: 'char', id }; for (const r of Scope.list(sc)) out.push({ r, sc }); }
  return out;
}
export const allowState = (sc: Sc) => S.settings.regexAllow?.[sc.kind === 'char' ? 'chars' : 'presets']?.[sc.id as string];
export const isAllowed = (sc: Sc) => sc.kind === 'global' || regexAllowed(sc.kind === 'char' ? 'chars' : 'presets', sc.id);
export function setAllow(sc: Sc, v: boolean) {
  if (sc.kind === 'global') return;
  const a = S.settings.regexAllow || {}, k = sc.kind === 'char' ? 'chars' : 'presets';
  S.set({ regexAllow: { ...a, [k]: { ...(a[k] || {}), [sc.id as string]: v } } });
}
/** 스크립트를 다른 범위로 옮긴다. 옮겨 간 범위는 바로 쓸 수 있게 허용해 둔다 (직접 옮긴 것이니 다시 묻지 않는다) */
export async function moveScripts(items: Entry[], to: Sc): Promise<number> {
  let n = 0;
  for (const { r, sc } of items) {
    if (scKey(sc) === scKey(to)) continue;
    await Scope.remove(sc, r);
    await Scope.add(to, r); n++;
  }
  if (n && !isAllowed(to)) setAllow(to, true);
  return n;
}
export function findScript(id: string): Entry | null { return everything().find(e => e.r.id === id) || null; }

// ════════ 멈춤 방지: 정규식을 따로 떨어진 작업자에서 먼저 돌려 본다 ════════
const PROBE = 'onmessage = e => { const d = e.data; try { const re = new RegExp(d.source, d.flags); let n = 0; d.text.replace(re, () => { n++; return ""; }); postMessage({ id: d.id, ok: true, n }); } catch (err) { postMessage({ id: d.id, ok: true, n: 0 }); } };';
export interface Probed { ok: boolean; hang?: boolean; unguarded?: boolean }
let worker: Worker | null = null, probeSeq = 0, probeQueue: Promise<unknown> = Promise.resolve();
function probeOnce(source: string, flags: string, text: string, ms: number): Promise<Probed> {
  return new Promise<Probed>(res => {
    if (typeof Worker === 'undefined') return res({ ok: true, unguarded: true });
    try { worker ||= new Worker(URL.createObjectURL(new Blob([PROBE], { type: 'text/javascript' }))); } catch { return res({ ok: true, unguarded: true }); }
    const id = ++probeSeq, w = worker;
    const done = (v: Probed) => { clearTimeout(timer); w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); res(v); };
    const onMsg = (e: MessageEvent<{ id?: number } | null>) => { if (e.data?.id === id) done({ ok: true }); };
    const onErr = () => { worker = null; done({ ok: true, unguarded: true }); };
    const timer = setTimeout(() => { try { w.terminate(); } catch { /* 이미 끝났다 */ } if (worker === w) worker = null; done({ ok: false, hang: true }); }, ms);
    w.addEventListener('message', onMsg); w.addEventListener('error', onErr);
    w.postMessage({ id, source, flags, text });
  });
}
/** 이 정규식이 이 글에서 제때 끝나는가. 끝나지 않으면 { ok: false, hang: true } — 화면이 얼지 않게 본 실행 전에 확인한다 */
export const probe = (source: string, flags: string, text: string, ms = 1500): Promise<Probed> => (probeQueue = probeQueue.then(() => probeOnce(source, flags, text, ms))) as Promise<Probed>;

// ════════ 켜짐 묶음 (어떤 스크립트를 켤지 저장해 두고 한 번에 바꾸기) ════════
export const sets = (): RegexSet[] => arr(S.settings.regexSets);
export const snapshot = () => { const all = everything(); return { on: all.filter(e => e.r.enabled).map(e => e.r.id), known: all.map(e => e.r.id) }; };
export async function applySet(set: RegexSet): Promise<number> {
  const on = new Set(set.on), known = new Set(set.known), presets = new Set<string>(); let n = 0;
  for (const { r, sc } of everything()) {
    if (!known.has(r.id)) continue;
    const want = on.has(r.id); if (!!r.enabled === want) continue;
    r.enabled = want; n++;
    if (sc.kind === 'preset') presets.add(sc.id as string); else await S.save('regex', r, true);
  }
  for (const id of presets) { const p = S.get('presets', id); if (p) await S.save('presets', p, true); }
  S.set({ regexSet: set.id }); redrawChat();
  return n;
}
