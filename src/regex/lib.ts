// 정규식 화면이 쓰는 자료 꼴과 표시용 도우미. 실행 규칙은 src/lib/engine, 진단은 src/lib/regex-lint, 범위 저장 · 켜짐 묶음 · 멈춤 방지는 src/lib/regex-scope
import type { Chat } from '../lib/types';
import type { Regex } from '../studio/parts';
import { route } from '../lib/router';
import { S } from '../lib/core';
import * as core from '../lib/core';
import * as E from '../lib/engine';
import * as LintNs from '../lib/regex-lint';
import * as Cards from '../lib/cards';
import { chatApi } from '../chat/actions';
import { getLang, t } from '../i18n';
import { Scope, everything, findScript, moveScripts, applySet, probe } from '../lib/regex-scope';
export { E, LintNs as Lint, Cards, chatApi };

export type { Sc, Entry, RegexSet } from '../lib/regex-scope';
import type { Sc, Entry, RegexSet } from '../lib/regex-scope';
export type { Issue, Lint as LintResult, HitPart, DiffPart } from '../lib/regex-lint';
import type { Lint as LintResult } from '../lib/regex-lint';
export type { Match, Trace, RegexEnv as Env, ScriptIt, Step, Who, Target } from '../lib/engine';
import type { Ctx } from '../lib/engine';
import type { Who, Target } from '../lib/engine';
export interface RegexUi {
  Scope: { list(sc: Sc): Regex[]; save(sc: Sc, r: Regex): Promise<void>; reorder(sc: Sc, list: Regex[]): Promise<void>; add(sc: Sc, r: Regex): Promise<Regex>; remove(sc: Sc, r: Regex): Promise<void> };
  everything(): Entry[]; moveScripts(items: Entry[], to: Sc): Promise<number>; applySet(set: RegexSet): Promise<number>;
  probe(source: string, flags: string, text: string, ms?: number): Promise<{ ok: boolean }>; findScript(id: string): Entry | null;
}


// ── 범위 · 저장 · 켜짐 묶음 · 멈춤 방지 작업자: src/lib/regex-scope.ts ──
export { G, isGlobal, scKey, scShort, scOwner, scName, allowState, isAllowed, setAllow, Scope, everything, findScript, moveScripts, applySet, probe, sets, snapshot } from '../lib/regex-scope';
/** 대화 화면이 열려 있으면 다시 그린다 (켜고 끈 정규식이 바로 보이게) */
export const redrawChat = () => { try { if (route.page === 'chat' && !chatApi.current().busy) chatApi.redraw(); } catch { /* 대화 화면이 아직 없으면 그대로 둔다 */ } };
const UI: RegexUi = { Scope, everything, findScript, moveScripts, applySet, probe };
export const RX = () => UI;

// ── 표시용 짧은 글 ──
export type WhoKey = 'onUser' | 'onAI' | 'onSlash' | 'onLore' | 'onReason';
// 두 번째 · 세 번째 칸은 i18n 키 — 그리는 곳에서 t() 한다
export const WHO: [WhoKey, string, string, Who][] = [['onUser', 'regex.who.user', 'regex.who.userShort', 'user'], ['onAI', 'regex.who.ai', 'regex.who.aiShort', 'ai'], ['onSlash', 'regex.who.slash', 'regex.who.slashShort', 'slash'], ['onLore', 'regex.who.lore', 'regex.who.loreShort', 'lore'], ['onReason', 'regex.who.reason', 'regex.who.reasonShort', 'reason']];
export const MODES: [string, string, string][] = [['display', 'regex.mode.display', 'regex.mode.displayShort'], ['prompt', 'regex.mode.prompt', 'regex.mode.promptShort'], ['both', 'regex.mode.both', 'regex.mode.bothShort'], ['store', 'regex.mode.store', 'regex.mode.storeShort']];
export const whoShort = (r: Regex) => WHO.filter(w => r[w[0]]).map(w => t(w[2])).join('·') || t('regex.who.none');
export const modeShort = (r: Regex) => t(MODES.find(m => m[0] === r.mode)?.[2] || 'regex.mode.displayShort');
export const clip = (v: unknown, n = 70) => { const s = String(v ?? '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) + '…' : s; };
// eslint-disable-next-line no-control-regex
export const safeName = (s: unknown) => String(s || 'regex').replace(/[\s.<>:"/\\|?*\x00-\x1F\x7F]/g, '_').toLowerCase();
const lintCache = new Map<string, LintResult>();
export function lintOf(r: Regex) {
  const key = JSON.stringify([getLang(), r.find, r.replace, r.trim, r.onUser, r.onAI, r.onSlash, r.onLore, r.onReason, r.mode, r.subst, r.minDepth, r.maxDepth, r.runOnEdit]);
  let v = lintCache.get(key);
  if (!v) { if (lintCache.size > 3000) lintCache.clear(); v = LintNs.lintScript(r); lintCache.set(key, v); }
  return v;
}
export const worst = (r: Regex) => { const is = lintOf(r).issues; return is.some(x => x.level === 'error') ? 'error' : is.some(x => x.level === 'warn') ? 'warn' : ''; };

/** 매크로 문맥: 지금 열려 있는 대화(없으면 가장 최근 대화) 기준 */
export function ctxOf(chat: Chat | null): Ctx | null { try { return chat ? E.regexEnv({ chat }).ctx : null; } catch { return null; } }
export const lastChat = (): Chat | null => chatApi.current().chat || [...S.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
export const chatLabel = (c: Chat) => { try { return `${chatApi.groupTitle(c)} · ${chatApi.roomName(c)}`; } catch { return c.name || t('regex.chatFallback'); } };

// ── 내보내기 · 켜짐 묶음 ──
export const exportOne = (r: Regex) => core.download(`regex-${safeName(r.name)}.json`, JSON.stringify(Cards.regexToSt(r), null, 4));
export const exportMany = (list: Regex[]) => core.download(`regex-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(list.map(Cards.regexToSt), null, 4));

export const TARGETS: [Target, string][] = [['display', 'regex.target.display'], ['prompt', 'regex.target.prompt'], ['store', 'regex.target.store']];   // 두 번째 칸은 i18n 키
export { debounce } from '../studio/parts';
