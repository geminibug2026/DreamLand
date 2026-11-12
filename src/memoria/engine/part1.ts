// memory.js 374–864 줄을 그대로 옮긴 것. 본문은 고치지 않고 타입(Part1)만 붙인다
import { S, DB, uid, msgText, emit } from '../../lib/core';
import { quickCall } from '../../lib/engine';
import type { MemoryApi } from './api';
import type { CommitOpts } from './part2';
import type { Mem, Msg, ChatM, Cfg, MemCheck, Summary, Pledge, CanonRow, StatusRow } from '../types';
import { G, PROMPTS, NARRATOR, PUBLIC_ONLY, LANG_DIRECTIVES, MEMORY_DEFAULTS, SHELVES, PROMPT_KEYS, empty, cache, mesHashOf, mesHashLegacySet, turnMatches, cleanStr, getStringHash, untouchedPrompt, transformTags, visibleProse, sanitizeRecord, cleanMultiline, FOSSIL, fossilShape, parseLoose, rollbackOrDrop, statusCache, updateTimers, BUNDLE_SKIP, activityLog, CHAT_IDLE_MAX_WAIT_MS, overrides, audits, lasts, freezes, PACKET_HEADER, PACKET_FOOTER } from './base';
import * as MP from '../prompts';
import { findStatusBars, statusOneLine, isPauseDirective, isPauseMessage, verifyIssues } from '../scene';
import { withDeadline, parsePhraseList, BUNDLE_EXCLUDED, resolveBundleName, switchBundle } from '../craft';

/** 저장된 설정 (S.settings.memory) — 빠진 칸이 있을 수 있고, 화석화는 예전에 숫자 하나였다 */
export type RawCfg = Partial<Omit<KnownKeys<Cfg>, 'fossil' | 'embed' | 'prompts'>> & { fossil?: Cfg['fossil'] | number; embed?: Partial<Cfg['embed']>; prompts?: Record<string, string>; [k: string]: unknown };
/** 이름이 적힌 칸만 (색인 서명을 뺀다 — Omit 이 이름 있는 칸까지 지우지 않게) */
type KnownKeys<T> = { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] };
/** 연속성 검사 옵션 */
export interface CheckOpts { queued?: boolean; signal?: AbortSignal }
/** 사서 일지의 한 줄 */
export type ActivityRow = ReturnType<typeof activityLog.add>;
/** 메시지에서 읽은 상태창 하나 */
export type StatusBar = ReturnType<typeof findStatusBars>[number];
export type StatusHistoryRow = StatusBar & { msgId: string; mesId: number };
/** 장부 재료를 모을 때의 옵션 (archiveQueryOpt) */
export type ArchiveQueryOpt = { query: string; noDirection: boolean } | { msgs: Msg[]; noDirection: boolean; inputs: ReturnType<MemoryApi['recallInputs']> };
/** 요약 글을 고칠 때 보는 칸 (묶음 · 연대기 · 병합 전 묶음 경계) */
type TextRow = { text: string; av?: unknown; avm?: string };
/** 턴 번호를 담는 칸들 (shiftTurns 가 옮긴다) */
type TurnKeys<K extends string> = { [P in K]?: number | null };
/** 본문에서 읽지 않는 매개변수를 타입에서만 짚는다 (본문을 바꾸지 않고 noUnusedParameters 를 지나기 위해) */
type Seen<_T, R> = R;

/** 이 조각이 맡는 Memory 메서드의 서명 */
export interface Part1 {
  load(chatId: string): Promise<Mem>;
  get(chatId: string): Mem | null;
  save(mem: Mem): Promise<void>;
  reset(chatId: string): Promise<Mem>;
  cfg(): Cfg;
  migrateSettings(s?: RawCfg | null): boolean;
  promptDefault(key: string): string;
  promptText(key: string): string;
  promptOutdated(): string[];
  resetPrompt(key: string): void;
  getStringHash: typeof getStringHash;
  conn(chat?: ChatM | null): ReturnType<typeof S.helperConn>;
  busy(): number;
  languageDirective(): string;
  langLine(): string;
  tok(want: number): number;
  call(chat: ChatM | null | undefined, system: string, user: string, maxTokens?: number, signal?: AbortSignal): Promise<string>;
  callJson(chat: ChatM | null | undefined, system: string, user: string, maxTokens?: number, signal?: AbortSignal): Promise<ReturnType<typeof parseLoose>>;
  enqueue<T>(fn: () => T | PromiseLike<T>): Promise<T>;
  perspective(mem?: Mem | null): string;
  isSharedPerspective(v: string | undefined): boolean;
  hasChatPerspective(mem?: Mem | null): boolean;
  resolvePerspective(mem: Mem | null | undefined, shared: string): string;
  effectivePerspective(mem?: Mem | null): string;
  setPerspectivePreference(mem: Mem | null | undefined, value: string, local?: boolean): Promise<void>;
  bundleDefaults(): Record<string, unknown>;
  bundleOwner(chat?: ChatM | null): { key: string; label: string };
  applyBundleForChat(chat?: ChatM | null): boolean;
  reconcile(mem: Mem, msgs?: Msg[] | null): boolean;
  reconcileWithChat(mem: Mem, msgs?: Msg[] | null): boolean;
  repairChatSync(chat: ChatM, msgs?: Msg[] | null): Promise<{ changed: boolean; before: number; after: number }>;
  dropAffectedSummaries(mem: Mem, deleted: number[]): void;
  repairSummaryRecords(mem: Mem): number;
  mesHashOf(m?: Msg | null): string;
  mesHashLegacySet(m?: Msg | null): Set<string>;
  clearDerived(mem: Mem, msgId: string): void;
  shiftTurns(mem: Mem, at: number, d: number): void;
  dropTurn(mem: Mem, msgId: string): void;
  invalidateTurnByMesId(mem: Mem, msgId: string): void;
  pending(mem: Mem, msgs: Msg[], opt?: { includeHidden?: boolean; from?: number; to?: number }): Msg[];
  failedTurnMesIds(mem: Mem, msgs: Msg[]): string[];
  isSideMessage(msg?: Msg | null): boolean;
  messageStatusBars(msg?: Msg | null): StatusBar[];
  statusHistory(msgs?: Msg[] | null, limit?: number): StatusHistoryRow[];
  noteQuietPrompt(text?: unknown): void;
  tagSideMessage(chat: ChatM | null | undefined, msgs: Msg[] | null | undefined, msg: Msg | null | undefined, type?: string): boolean;
  saveMsgMarks(chat: ChatM, marked?: (Msg | null | undefined)[] | null): Promise<number>;
  checkOf(msg?: Msg | null): MemCheck | null;
  checkReply(chat: ChatM | null | undefined, msgs: Msg[], msg: Msg | null | undefined, opt?: CheckOpts): Promise<MemCheck | null>;
  queueCheck(chat: ChatM | null | undefined, msgs: Msg[], msg: Msg | null | undefined, opt?: CheckOpts): Promise<MemCheck | null>;
  checkReplyNow(chat: ChatM | null | undefined, msgs: Msg[], msg: Msg | null | undefined, signal?: AbortSignal): Promise<MemCheck | null>;
  archiveQueryOpt(mem: Mem, query: string, msgs?: Msg[] | null): ArchiveQueryOpt;
  onMessageUpdated(chat: ChatM | null | undefined, msgs: Msg[] | null | undefined, msg: Msg | null | undefined): void;
  onMessageEdited(chat: ChatM | null | undefined, msgs: Msg[], msg: Msg | null | undefined): Promise<void>;
  waitForChatIdle(what?: string): Promise<void>;
  chatGenerating(): boolean;
  activityLog: typeof activityLog;
  logActivity(kind: string, text: string, extra?: Record<string, unknown> | null): ActivityRow;
  activity(): ActivityRow[];
  clearActivity(): void;
  bannedPhrases(): string[];
  firstUserMesIndex(msgs: Msg[]): number;
  recordDelayTurns(): number;
  requiredStepsFor(msgs: Msg[], i: number): number;
  storyStepsAfter(msgs: Msg[], i: number): number;
  isSettledForRecord(msgs: Msg[], i: number): boolean;
  commitSettledTurns(chat: ChatM, mem: Mem, msgs: Msg[]): Msg[];
  commit(chat: ChatM, msgs: Msg[], ai: Msg, opts?: CommitOpts): Promise<Mem>;
  queueCommit(chat: ChatM, msgs: Msg[], ai: Msg, opts?: CommitOpts): Promise<Mem>;
  post(chat: ChatM, msgs: Msg[], signal?: AbortSignal): Promise<void>;
}

export const part1: Part1 & ThisType<MemoryApi> = {
  async load(chatId) {
    if (!cache.has(chatId)) {
      const saved = await DB.get('mem', chatId), m: Mem = { ...empty(chatId), ...(saved || {}) };
      if (saved && !saved.bondRev) m.bondRev = 0;
      if (saved && typeof m.perspective === 'string' && !m.perspectiveScope) m.perspectiveScope = 'chat';   // 옛 서고: 적용 범위를 적기 전에는 글이 적혀 있으면 이 대화만의 방식이었다
      if (m.chapters && !m.chunks.length) { m.chunks = m.chapters; m.chunked = m.chaptered || 0; }
      for (const k of SHELVES) if (!Array.isArray(m[k])) m[k] = [];
      if ((m.bondRev || 0) < 1) { for (const b of m.bonds) this.compactBondLog(b); m.bondRev = 1; }   // 같은 단계를 말만 바꿔 여러 칸으로 쌓아 둔 관계선을 한 번 접는다
      cache.set(chatId, m);
    }
    return cache.get(chatId)!;
  },
  get: chatId => cache.get(chatId) || null,
  async save(mem) { cache.set(mem.id, mem); await DB.put('mem', mem); emit('memory', mem); },
  async reset(chatId) { const m = empty(chatId); await this.save(m); overrides.delete(chatId); audits.delete(chatId); lasts.delete(chatId); freezes.delete(chatId); return m; },
  cfg() {
    const s: RawCfg = S.settings.memory || {}; this.migrateSettings(s);
    const c: Cfg = { ...MEMORY_DEFAULTS, ...s, embed: { ...MEMORY_DEFAULTS.embed, ...(s.embed || {}) }, prompts: { ...MEMORY_DEFAULTS.prompts, ...(s.prompts || {}) }, fossil: fossilShape(s.fossil) };
    // 빈 문자열 = 기본값. 옛 기본 프롬프트를 그대로 저장해 둔 것도 손대지 않은 것이므로 새 기본값을 쓴다
    if (c.prompt && untouchedPrompt('archivist', c.prompt)) c.prompt = '';
    for (const k of ['supervisor', 'chunk', 'arc']) if (c.prompts[k] && untouchedPrompt(k, c.prompts[k])) c.prompts[k] = '';
    return c;
  },
  /**
   * 설정 개정. 프롬프트 개정: 손대지 않은 프롬프트만 새 기본값으로 바꾸고(빈 문자열로 비운다), 직접 고친 프롬프트는 그대로 두고 "새 기본값이 나왔다"는 표시만 남긴다.
   * 저장은 다음 설정 저장 때 함께 된다 (그전까지는 열 때마다 같은 판정을 다시 한다)
   */
  migrateSettings(s = S.settings.memory) {
    if (!s || typeof s !== 'object' || ((s.promptRev || 1) >= MP.PROMPT_REV && (s.settingsRev || 1) >= 3)) return false;
    if ((s.promptRev || 1) < MP.PROMPT_REV) {
      if (!s.promptOutdated || typeof s.promptOutdated !== 'object') s.promptOutdated = {};
      for (const k of PROMPT_KEYS) {
        const cur = String((k === 'archivist' ? s.prompt : s.prompts?.[k]) ?? '');
        if (untouchedPrompt(k, cur)) { if (cur) { if (k === 'archivist') s.prompt = ''; else s.prompts![k] = ''; } delete s.promptOutdated[k]; }
        else s.promptOutdated[k] = MP.PROMPT_REV;
      }
      s.promptRev = MP.PROMPT_REV;
    }
    if ((s.settingsRev || 1) < 3) { if (s.responseTokens === 6000 || s.responseTokens! <= 2048) s.responseTokens = MEMORY_DEFAULTS.responseTokens; if (s.tokenBudget === 1600 || s.tokenBudget === 4000) s.tokenBudget = MEMORY_DEFAULTS.tokenBudget; if (s.minCosine === 0.05) s.minCosine = MEMORY_DEFAULTS.minCosine; if (s.fossil === 40) s.fossil = { ...FOSSIL }; s.settingsRev = 3; }   // 사서 응답 상한의 옛 기본값을 올린다 (직접 바꾼 값은 둔다)
    return true;
  },
  /** 기본 프롬프트 글 (key: archivist · supervisor · chunk · arc) */
  promptDefault: key => PROMPTS[key as keyof typeof PROMPTS] || '',
  /** 지금 실제로 쓰이는 프롬프트 글 (직접 고친 글, 없으면 기본값) */
  promptText(key) { const c = this.cfg(); return (key === 'archivist' ? c.prompt : c.prompts[key]) || PROMPTS[key as keyof typeof PROMPTS] || ''; },
  /** 직접 고친 탓에 새 기본값으로 바뀌지 않은 프롬프트들 (안내: "새 기본 프롬프트가 나왔습니다 … [기본값]") */
  promptOutdated() { const s: RawCfg = S.settings.memory || {}; this.migrateSettings(s); return Object.keys(s.promptOutdated || {}).filter(k => PROMPT_KEYS.includes(k) && !untouchedPrompt(k, k === 'archivist' ? s.prompt : s.prompts?.[k])); },
  /** 프롬프트를 기본값으로 되돌린다 (안내도 지운다) */
  resetPrompt(key) {
    const s = S.settings.memory as Cfg | undefined; if (!s || !PROMPT_KEYS.includes(key)) return;
    if (key === 'archivist') s.prompt = ''; else s.prompts = { ...(s.prompts || {}), [key]: '' };
    if (s.promptOutdated) delete s.promptOutdated[key];
    S.set({ memory: s });
  },
  getStringHash,
  conn: chat => S.helperConn('memory', chat),
  busy: () => G.busy,
  /** 요약 출력 언어 지시 (프롬프트 뒤에 붙인다) */
  languageDirective() { const l = this.cfg().language || 'auto'; return LANG_DIRECTIVES[l as keyof typeof LANG_DIRECTIVES] || (l && !/^(auto)$/.test(l) ? `LANGUAGE (MANDATORY): Write ALL output in ${l}. Keep quoted dialogue in its original language.` : LANG_DIRECTIVES.auto); },
  langLine() { return '\n\n' + this.languageDirective(); },
  /** 생각하는 모델은 사고에 쓴 토큰도 응답 상한을 먹는다 — 여유분을 얹되 사서 최대 응답 토큰은 넘기지 않는다 */
  tok(want) { const c = this.cfg(), head = Math.max(0, +c.reasoningHeadroom || 0); return Math.max(want, Math.min(+c.responseTokens || want, want + head)); },
  call(chat, system, user, maxTokens, signal) { return quickCall(system, user, { maxTokens: this.tok(maxTokens || 1500), signal, conn: this.conn(chat) }); },
  async callJson(chat, system, user, maxTokens, signal) {
    let err = null;
    for (let attempt = 0; attempt < 3; attempt++) {   // 읽지 못한 답 · API 오류(순간 혼잡 · 속도 제한) 모두 간격을 두고 세 번까지
      if (attempt) await new Promise(r => setTimeout(r, attempt * 2500));
      let j = null; try { j = parseLoose(await this.call(chat, system + (attempt ? '\n\nFORMAT WARNING: the previous reply could not be parsed. Respond with EXACTLY ONE minified JSON object — no code fences, no commentary, nothing before "{" or after "}".' : ''), user, maxTokens, signal)); err = null; } catch (e: any) { if (e.name === 'AbortError' || signal?.aborted) throw e; err = e; console.warn(`[장기기억] 사서 호출 실패 (${attempt + 1}/3)`, e); }
      if (j) return j;
    }
    if (err) throw err;
    return null;
  },
  enqueue(fn) { G.busy++; emit('memory:busy', G.busy); const p = G.queue.then(fn); G.queue = p.catch(() => { }); return p.finally(() => { G.busy--; emit('memory:busy', G.busy); }); },
  /** 이 대화에 적용되는 기억 · 서술 방식 ('' 자동, PUBLIC_ONLY, NARRATOR, 또는 인물 이름) — 이 대화만 따로 정한 것이 있으면 그것, 없으면 공통 기본값 */
  perspective(mem) { return this.effectivePerspective(mem); },
  /** 모든 대화가 함께 쓸 수 있는 방식인가 (자동 · 공개 기억만 · 소설·풀사칭). 특정 인물 시점은 그 이야기에만 속한다 */
  isSharedPerspective: v => ['', PUBLIC_ONLY, NARRATOR].includes(v as string),
  /** 이 대화만 따로 정한 방식이 있는가. 적용 범위를 적기 전에 고른 인물 시점도 그 이야기의 것으로 본다 */
  hasChatPerspective(mem) {
    if (!mem) return false; if (mem.perspectiveScope === 'chat') return true; if (mem.perspectiveScope === 'default') return false;
    return typeof mem.perspective === 'string' && !this.isSharedPerspective(mem.perspective);
  },
  resolvePerspective(mem, shared) { return this.hasChatPerspective(mem) || !this.isSharedPerspective(shared) ? (typeof mem?.perspective === 'string' ? mem.perspective : '') : shared; },
  effectivePerspective(mem) {
    const s = S.settings.memory; let shared = typeof s?.perspective === 'string' ? s.perspective : '';
    if (!this.isSharedPerspective(shared)) {   // 공통 기본값에는 공통 방식만 둔다 — 처음 연 대화의 선택으로 한 번 채우고, 그 뒤의 대화는 덮어쓰지 못한다
      shared = mem && !this.hasChatPerspective(mem) && this.isSharedPerspective(mem.perspective) ? mem.perspective! : '';
      if (mem && s) { s.perspective = shared; S.set({ memory: s }); }
    }
    return this.resolvePerspective(mem, shared);
  },
  /** 기억 · 서술 방식을 고른다. local: 이 대화만 따로(인물 시점도 고를 수 있다) · 아니면 공통 기본값(자동 · 공개 기억만 · 소설·풀사칭). 고쳐 둔 1회용 장부는 버린다 */
  async setPerspectivePreference(mem, value, local) {
    if (typeof value !== 'string' || (!local && !this.isSharedPerspective(value))) throw new Error('기억·서술 방식의 선택을 확인해 주세요.');
    if (local && !mem) throw new Error('대화를 먼저 열어 주세요.');
    this.effectivePerspective(mem);
    if (!local) { const s = S.settings.memory || (S.settings.memory = {} as Cfg); s.perspective = value; S.set({ memory: s }); }
    if (mem) { mem.perspective = value; mem.perspectiveScope = local ? 'chat' : 'default'; overrides.delete(mem.id); await this.save(mem); }
  },

  // ════════ 설정 세트 — 봇 · 대화마다 다른 설정 ════════
  /** 세트에 담을 수 있는 설정의 기본값. 모든 대화 공통이어야 하는 것(켜기/끄기 · 임베딩 · 프롬프트와 개정 번호 · 공통 서술 방식 · 세트 자체)은 뺀다 */
  bundleDefaults() { return Object.fromEntries(Object.entries(MEMORY_DEFAULTS).filter(([k]) => !BUNDLE_SKIP.includes(k) && !BUNDLE_EXCLUDED.includes(k))); },
  /** 세트를 붙일 대상 — 이 대화의 (첫) 캐릭터 */
  bundleOwner(chat) { const c = S.get('chars', chat?.charIds?.[0]); return c ? { key: `char:${c.id}`, label: `이 캐릭터 (${c.name || ''})` } : { key: '', label: '이 캐릭터' }; },
  /** 지금 대화에 맞는 세트로 설정을 갈아 끼운다 — 먼저 보는 순서: 이 대화에 붙인 것 → 캐릭터에 붙인 것 → 기본 설정. 바뀌었으면 true */
  applyBundleForChat(chat) {
    const s = S.settings.memory || (S.settings.memory = {} as Cfg), defaults = this.bundleDefaults();
    this.migrateSettings(s);
    // 살아 있는 설정에 빠진 칸은 기본값으로 채워 둔다 — 세트를 뗐을 때 세트의 값이 기본 설정에 남지 않게 (맡아 두는 기본 설정에는 있는 칸만 담긴다)
    for (const [k, v] of Object.entries(defaults)) if (s[k] === undefined) s[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    const name = chat ? resolveBundleName(s, { chatBundle: String(chat.memBundle || ''), ownerKey: this.bundleOwner(chat).key }) : '';
    if (!switchBundle(s, name, defaults)) return false;
    S.set({ memory: s });
    this.reinjectNow(chat);   // 얼려 둔 장부 · 삼갈 표현 목록은 새 설정으로 다시 짓는다
    this.logActivity('bundle', name ? `설정 세트 "${name}"을(를) 적용했어요` : '기본 설정으로 돌아왔어요');
    return true;
  },

  // ════════ 대화와 기록 맞추기 ════════
  /**
   * 대화 메시지와 저장된 턴 기록을 맞춘다. 지워졌거나 글이 바뀐(수정 · 스와이프) 답변, 막간이 된 답변의 턴을 걷어내고 그 턴이 고친 값은 이전 값으로 되돌린다.
   * 턴은 메시지 id 로 묶여 있어, 앞쪽 삭제로 번호가 밀려도 내용으로 자리를 다시 찾을 필요가 없다. 반환: 바뀐 것이 있는지 (저장은 부른 쪽이)
   */
  reconcile(mem, msgs) {
    const byId = new Map((msgs || []).map(m => [m.id, m])), gone = [], inPlace = []; let changed = false;
    for (const t of mem.turns) {
      const m = byId.get(t.msgId);
      if (!m || m.role === 'user' || this.isSideMessage(m)) { gone.push(t); continue; }   // 이미 기록된 막간은 그 턴의 기억째 걷어낸다
      const h = mesHashOf(m); if (t.hash === h) continue;
      if (mesHashLegacySet(m).has(t.hash!)) { t.hash = h; changed = true; continue; }   // 옛 방식 해시 → 새 해시로 옮긴다
      inPlace.push(t);
    }
    // 안전장치 — 여러 턴이 한꺼번에 "사라졌다"고 나왔는데 그 자리의 메시지가 멀쩡히 남아 있다면, 메시지를 고친 게 아니라 해시 계산 방식이 바뀐 것이다 (기록을 지우지 않고 해시만 새로 잰다)
    let orphans = [...gone, ...inPlace];
    if (inPlace.length >= 3 && inPlace.length >= orphans.length * 0.8) {
      for (const t of inPlace) t.hash = mesHashOf(byId.get(t.msgId));
      console.warn(`[장기기억] 턴 ${inPlace.length}개의 해시가 맞지 않지만 메시지는 그대로 있어 기록을 유지했습니다 (해시 방식 변경으로 판단)`);
      orphans = gone; changed = true;
    }
    if (orphans.length) {
      const dead = new Set<string | undefined>(orphans.map(t => t.msgId)), idx = orphans.map(t => mem.turns.indexOf(t)), lost = new Set(idx), alive: (n: number) => boolean = n => Number.isInteger(n) && n >= 0 && n < mem.turns.length && !lost.has(n);
      // 인물 카드를 낳은 답변 (되돌리기가 카드의 msgId 를 비우기 전에 적어 둔다. 직접 적었거나 이어받은 카드에는 없다)
      const born = new Map(mem.cast.map(c => [c, Object.hasOwn(c, 'firstMsgId') ? c.firstMsgId || '' : (c.first === c.updated ? c.msgId || '' : '')]));
      for (const t of orphans) this.clearDerived(mem, t.msgId);
      this.dropAffectedSummaries(mem, idx);
      // 인물 · 물건은 "생성 턴 또는 마지막 갱신 턴 가운데 하나라도 아직 남아 있으면" 둔다 — 합쳐진 최신 프로필은 지키되, 둘 다 사라졌으면(관련된 턴이 전부 지워졌으면) 정리한다.
      // (턴별로 하나씩 지우면서 판단하면 갱신 이력이 있는 인물은 영영 지워지지 않는다 — 전체 삭제 결과를 놓고 한 번에 본다)
      mem.cast = mem.cast.filter(c => c.manual || c.locked || !dead.has(born.get(c)) || alive(c.updated!));
      mem.items = mem.items.filter(i => i.manual || !dead.has(i.msgId) || alive(i.updated!));
      for (const at of [...idx].sort((a, b) => b - a)) { mem.turns.splice(at, 1); this.shiftTurns(mem, at, -1); }   // 뒤에서부터 걷어내며 번호를 빈틈없이 다시 매긴다
      mem.clockDays = mem.turns.reduce((a, t) => a + (t.days || 0), 0);
      changed = true;
    }
    // 이야기 이어쓰기 · 확장 태그가 섞인 요약을 정리하고, 별칭이 있는데도 다른 표기로 남아 있는 상태 · 기억을 정식 이름으로 접는다 (접을 게 없으면 순회만 하고 끝난다)
    const repaired = this.repairSummaryRecords(mem);
    if (repaired) { console.info(`[장기기억] 요약 복구: 이야기 이어쓰기 · 확장 태그가 섞인 기록 ${repaired}건 정리`); changed = true; }
    const folded = this.foldAliases(mem);
    if (folded.states || folded.memories) { console.info(`[장기기억] 이름 접기: 상태 ${folded.states}건 · 기억 ${folded.memories}건을 정식 이름으로 통합`); changed = true; }
    return changed;
  },
  reconcileWithChat(mem, msgs) { return this.reconcile(mem, msgs); },
  /** 수동 맞추기 — 이미 지워진 기록은 복구하지 않는다. 반환 { changed, before, after }(기록 턴 수) */
  async repairChatSync(chat, msgs) {
    const mem = await this.load(chat.id), before = mem.turns.length, changed = this.reconcile(mem, msgs);
    if (changed) { await this.save(mem); this.reinjectNow(chat); }
    return { changed, before, after: mem.turns.length };
  },
  /** 지워진 턴(0부터 세는 번호들)이 걸친 묶음 · 연대기 요약을 정리한다. 연대기는 병합 전 묶음 경계(src)가 남아 있으면 실제로 안 걸친 묶음은 독립 묶음으로 되살리고, 걸친 것만 버린다 */
  dropAffectedSummaries(mem, deleted) {
    const hits = (from: number, to: number) => deleted.some(i => i >= from && i <= to), revived: Summary[] = []; let minFrom = Infinity, minArcFrom = Infinity;
    mem.chunks = mem.chunks.filter(s => { if (!hits(s.from, s.to)) return true; minFrom = Math.min(minFrom, s.from); return false; });
    mem.arcs = mem.arcs.filter(s => {
      if (s.carried || !hits(s.from, s.to)) return true;
      minArcFrom = Math.min(minArcFrom, s.from);
      if (Array.isArray(s.src) && s.src.length) { for (const c of s.src) { if (hits(c.from, c.to)) minFrom = Math.min(minFrom, c.from); else revived.push({ id: 'c' + uid(), from: c.from, to: c.to, text: c.text }); } }
      else minFrom = Math.min(minFrom, s.from);   // 묶음 경계가 없는(옛) 연대기 — 통째로 버리는 수밖에 없다
      return false;
    });
    if (revived.length) { mem.chunks.push(...revived); mem.chunks.sort((a, b) => a.from - b.from); }
    // 연대기가 실제로 삭제로 사라졌을 때만 되감는다 — 안 그러면 그 자리에 새로 생길 연대기가 낡은 커서 값 때문에 "이미 검토됨"으로 잘못 건너뛰어질 수 있다
    if (minArcFrom < Infinity && (mem.arcCursor || 0) > minArcFrom) mem.arcCursor = minArcFrom;
    // 뒤에 아직 안 지워진 더 최신 요약이 남아 있으면(드문 중간 구간 삭제) 다음 계산(summaryCoveredTurn)이 그쪽을 기준으로 알아서 잡는다 — 여기선 덮어써도 안전하다
    if (minFrom < Infinity) mem.chunked = Math.min(mem.chunked || 0, minFrom);
  },
  /**
   * 이미 저장된 요약 · 턴 기록에서 이야기 이어쓰기와 확장 태그 블록을 걷어낸다.
   * 판정이 애매하면 그대로 두므로 여러 번 돌려도 안전하다. 반환: 고친 수
   */
  repairSummaryRecords(mem) {
    let fixed = 0;
    const fixText = (obj: TextRow, key: 'text', cap: number) => {
      const before = String(obj[key] || ''); if (!before) return;
      const after = cleanMultiline(sanitizeRecord(before), cap);
      if (after && after !== before) { obj[key] = after; delete obj.av; delete obj.avm; fixed++; }   // 본문이 바뀌었으니 묶음 임베딩은 다음 회상 때 다시 잡는다
    };
    for (const c of mem.chunks || []) fixText(c, 'text', 2000);
    for (const a of mem.arcs || []) { fixText(a, 'text', a.saga ? 2800 : 2400); for (const sc of Array.isArray(a.src) ? a.src : []) fixText(sc, 'text', 2000); }
    // 턴 기록은 구조가 없는 산문이라 태그 블록만 걷어낸다
    for (const t of mem.turns || []) {
      const before = String(t.digest || ''); if (!before || !before.includes('<')) continue;
      const after = cleanStr(transformTags(before.replace(/<!--[\s\S]*?-->/g, ' '), 'record'), 2000);
      if (after && after !== before) { t.digest = after; fixed++; }
    }
    return fixed;
  },
  mesHashOf: m => mesHashOf(m),
  mesHashLegacySet: m => mesHashLegacySet(m),
  /** 한 턴에서 나온 기록만 걷어낸다 (턴 자리는 남긴다). 그 턴이 고친 값은 한 단계 이전 값으로, 재확인만 한 줄은 재확인 이전으로 되돌린다 */
  clearDerived(mem, msgId) {
    const t = mem.turns.find(x => x.msgId === msgId), at = t ? mem.turns.indexOf(t) : -1; if (t) mem.clockDays = Math.max(0, (mem.clockDays || 0) - (t.days || 0));
    const bySummary = (by: string | undefined, turn: number | null | undefined, l: Pledge) => at >= 0 && !by && !l.manual && turn === at;   // 요약이 닫은 서약 — 답변이 아니라 턴 번호로만 묶여 있다
    mem.memories = mem.memories.filter(m => m.msgId !== msgId || m.manual || m.pinned);
    for (const key of ['canon', 'status']) mem[key] = rollbackOrDrop(mem[key] as (CanonRow | StatusRow)[], msgId);
    // 그 턴에 처음 생긴 서약만 지운다 — 옛 서약이 이 턴에 다시 적혀 턴만 옮겨진 경우까지 지우면 오래 지켜 온 서약이 통째로 사라진다
    mem.pledges = mem.pledges.flatMap(l => {
      if (l.msgId === msgId && !l.manual) return [];
      if (l.updMsgId === msgId && !l.reMsgId) return [l.prev   // 이 턴에서 문구 · 우선순위 · 상태가 다시 적힌 서약 → 그 이전 값으로
        ? { ...l, summary: l.prev.summary, status: l.prev.status, priority: l.prev.priority, owner: l.prev.owner || '', turn: l.prevTurn ?? l.createdTurn ?? 0, updMsgId: '', prev: null, prevTurn: null }
        : { ...l, turn: l.createdTurn ?? 0, updMsgId: '' }];
      if (l.reMsgId === msgId) return [{ ...l, turn: l.createdTurn ?? l.turn ?? 0, reMsgId: '' }];   // 재확인만 됐다 — 재확인 이전 시점으로
      return [l];
    });
    for (const l of mem.pledges) {
      if (l.status === 'resolved' && (l.resolvedBy === msgId || (bySummary(l.resolvedBy, l.resolvedTurn, l) && l.resolution === '요약 때 정리됨'))) { l.status = 'active'; l.resolvedTurn = null; l.resolvedBy = ''; }   // 이 턴에서 "해소됨" 판정을 받은 서약은 다시 활성으로
      if (l.suggestResolved && (l.suggestBy === msgId || (at >= 0 && !l.suggestBy && l.suggestTurn === at))) { l.suggestResolved = false; l.suggestTurn = null; l.suggestBy = ''; }
      if (l.resolution && l.status !== 'resolved') l.resolution = null;
    }
    // 인물 카드를 통째로 지울지는 여기서 보지 않는다(맞추기가 판단한다). 이 턴에 바뀐 칸만 한 단계 이전 값으로 되돌린다
    for (const c of mem.cast) {
      if (msgId && c.msgId === msgId) {
        if (c.prev && c.prevBy === msgId && !c.locked) { for (const k of ['role', 'age', 'occupation', 'appearance', 'voice']) c[k] = c.prev[k] || ''; c.traits = c.prev.traits || []; c.updated = c.prevTurn ?? c.first ?? 0; c.prev = null; c.prevTurn = null; c.prevBy = ''; }
        else c.updated = c.first ?? 0;   // 재확인만 됐던 경우 — 재확인 이전 시점으로만
        c.msgId = '';
      }
      // 이 턴에서 모은 남긴 말 · 달라진 점 · 바탕은 턴과 함께 사라진다 (직접 적은 것은 msgId 가 없어 남는다)
      if (Array.isArray(c.lines)) c.lines = c.lines.filter(l => l.pinned || !l.msgId || l.msgId !== msgId);
      if (Array.isArray(c.growth)) c.growth = c.growth.filter(g => !g.msgId || g.msgId !== msgId);
      if (c.core && c.coreMsgId && c.coreMsgId === msgId && !c.locked) { c.core = ''; c.coreTurn = null; c.coreMsgId = ''; }
    }
    // 관계선: 이 턴에 적힌 단계만 걷어낸다 — 그 앞 단계가 다시 현재가 되고, 남는 단계가 없으면 줄 자체가 사라진다.
    // 이 턴이 같은 계단을 고쳐 쓴 것이었으면 고치기 전 글로, 새 계단을 놓은 것이었으면 그 계단을 걷어낸다
    for (const b of mem.bonds || []) b.log = (b.log || []).flatMap(e => (e.manual || !e.msgId || e.msgId !== msgId ? [e] : e.was ? [e.was] : []));
    mem.bonds = (mem.bonds || []).filter(b => b.log.length);
    mem.items = mem.items.filter(x => x.msgId !== msgId || x.manual || (x.updated ?? x.first ?? x.turn) !== (x.first ?? x.turn));   /* 이 턴에 처음 적힌 물건만 지운다 — 뒤 턴이 고친 물건은 남긴다 (맞추기가 생성 · 갱신 턴이 모두 사라졌는지 본다) */ mem.milestones = mem.milestones.filter(x => x.msgId !== msgId || x.manual);
  },
  /** 턴 번호를 대화 순서대로 다시 맞춘다 (at 자리에서 d 만큼) */
  shiftTurns(mem, at, d) {
    const sh: (v: number) => number = v => (d < 0 ? v > at : v >= at) ? v + d : v, mv = <K extends string>(x: TurnKeys<K>, ...ks: K[]) => { for (const k of ks) if (x[k] != null) x[k] = sh(x[k]); };
    for (const k of ['memories', 'milestones'] as const) mem[k].forEach(x => mv(x, 'turn'));
    for (const k of ['canon', 'status'] as const) mem[k].forEach(x => mv(x, 'turn', 'prevTurn', 'createdTurn'));
    mem.pledges.forEach(x => mv(x, 'turn', 'prevTurn', 'createdTurn', 'created', 'resolvedTurn', 'suggestTurn', 'sleptTurn'));
    mem.items.forEach(x => mv(x, 'turn', 'first', 'updated'));
    for (const c of mem.cast) { mv(c, 'first', 'updated', 'prevTurn', 'coreTurn'); for (const l of c.lines || []) if (l.msgId) mv(l, 'turn'); for (const g of c.growth || []) if (g.msgId) mv(g, 'turn'); }   // 직접 적은 줄(턴 0)은 턴 번호가 아니다
    for (const b of mem.bonds || []) for (const e of b.log || []) { mv(e, 'turn'); if (e.was) mv(e.was, 'turn'); }
    const span: (c: { from: number; to: number }) => void = c => { if (d < 0) { if (c.from > at) c.from--; if (c.to >= at) c.to--; } else { if (c.from >= at) c.from++; if (c.to >= at) c.to++; } };
    for (const c of [...mem.chunks, ...mem.arcs]) { if (c.carried) continue; span(c); for (const sc of Array.isArray(c.src) ? c.src : []) span(sc); }   // 이어받은 요약의 범위는 이 대화의 축이 아니다
    mem.chunks = mem.chunks.filter(c => c.to >= c.from); mem.arcs = mem.arcs.filter(c => c.carried || c.to >= c.from);
    for (const k of ['chunked', 'consolidatedAt', 'arcAt', 'arcCursor'] as const) if (at < (mem[k] || 0)) mem[k] = Math.max(0, mem[k]! + d);   // 요약 · 서고 정리 · 연대기 정리 커서
  },
  dropTurn(mem, msgId) {
    const at = mem.turns.findIndex(x => x.msgId === msgId);
    this.clearDerived(mem, msgId);
    if (at >= 0) { mem.turns.splice(at, 1); this.shiftTurns(mem, at, -1); }
  },
  /** 한 답변의 턴을 무효로 한다 — 그 턴에서 나온 기록을 걷어내고 번호를 빈틈없이 다시 매긴다. 요약은 건드리지 않는다 */
  invalidateTurnByMesId(mem, msgId) { return this.dropTurn(mem, msgId); },
  /** 아직 기록하지 않았거나 기록에 실패한 답변. 막간은 뺀다. 숨긴 메시지는 기록에 실패한 턴만 다시 시도한다 — includeHidden 이면 가려 둔 초반부도 색인한다. from / to: 메시지 번호(1부터) */
  pending(mem, msgs, { includeHidden = false, from = 0, to = Infinity } = {}) {
    const turnOf = new Map(mem.turns.map(t => [t.msgId, t]));
    return msgs.filter((m, i) => {
      if (!m || m.role !== 'assistant' || i + 1 < from || i + 1 > to || this.isSideMessage(m) || !msgText(m).trim()) return false;
      const t = turnOf.get(m.id);
      if (m.hidden && !includeHidden) return !!t?.failed;
      return !(t && !t.failed && turnMatches(t, m));
    });
  },
  /** 기록에 실패했던 턴들의 답변 */
  failedTurnMesIds(mem, msgs) { const byId = new Map(msgs.map(m => [m.id, m])); return mem.turns.filter(t => t.failed && byId.get(t.msgId)?.role === 'assistant').map(t => t.msgId); },

  // ════════ 이야기가 아닌 메시지 · 상태창 (기록이 쓰는 최소한) ════════
  /** 이야기가 아닌 메시지인가 — 롤플을 멈추고 뽑은 막간. 기록 · 회상 질의 · 연속성 검사 · 상태창에서 모두 뺀다. 사용자가 정한 값(memSide)이 자동 판정보다 우선한다 */
  isSideMessage(msg) {
    const mode = this.cfg().qrMode || 'side'; if (!msg || mode === 'keep') return false;
    if (msg.memSide === true) return true; if (msg.memSide === false) return false;
    if (msg.type === 'comment') return true;
    return mode === 'all' && (msg.type === 'narrator' || msg.viaCommand === true || msg.role === 'system');
  },
  /** 한 메시지의 상태창들 (본문이 바뀌거나 설정이 바뀔 때만 다시 읽는다) */
  messageStatusBars(msg) {
    const cfg = this.cfg(); if (!msg || msg.role === 'user' || cfg.statusMode === 'off' || this.isSideMessage(msg)) return [];
    const key = `${cfg.statusMode}|${cfg.statusPattern}`, text = msgText(msg); let hit = statusCache.get(msg);
    if (!hit || hit.text !== text || hit.key !== key) { let bars: StatusBar[] = []; try { bars = findStatusBars(text, { mode: cfg.statusMode, pattern: cfg.statusPattern }); } catch (e) { console.debug('[장기기억] 상태창 읽기 실패', e); } hit = { text, key, bars }; statusCache.set(msg, hit); }
    return hit.bars;
  },
  /** 상태창이 바뀐 순서대로 — 시간 · 장소 · 날씨가 달라질 때마다 한 줄, 최신이 위. [{ msgId, mesId(메시지 번호, 0부터), when, place, weather, raw }] */
  statusHistory(msgs, limit = 200) {
    const out: StatusHistoryRow[] = []; let last = '';
    for (let i = 0; i < (msgs || []).length; i++) for (const bar of this.messageStatusBars(msgs![i])) { const line = statusOneLine(bar); if (!line || line === last) continue; last = line; out.push({ msgId: msgs![i].id, mesId: i, ...bar }); }
    return out.slice(-limit).reverse();
  },
  /** 명령어가 조용히 생성을 시킬 때 그 지시문을 알려 둔다 — 그 결과가 대화에 들어올 때 막간인지 가린다 (30분 안의 것만 본다) */
  noteQuietPrompt(text) { G.lastQuietPrompt = text ? { text: String(text), at: Date.now() } : null; },
  /**
   * 새로 들어온 메시지를 막간/이야기로 표시한다. 막간이면 true. 이미 정해진 값(memSide)은 건드리지 않는다.
   * 명령어가 만든 메시지(viaCommand)는 직전에 알려 둔 생성 지시문이 "롤플을 멈춰라"였는지로, 그 밖의 답변은 바로 앞 사용자 메시지가 시스템 지시 모양의 멈춤 문구인지로 가린다 (그 사용자 메시지도 함께 막간이 된다)
   */
  tagSideMessage(chat, msgs, msg, type = '') {
    if (!msg || msg.role === 'user' || (this.cfg().qrMode || 'side') === 'keep') return false;
    if (typeof msg.memSide === 'boolean') return msg.memSide;
    const id = (msgs || []).indexOf(msg), marked = [msg]; let side = null;
    if (msg.viaCommand === true || type === 'command') {
      const recent = G.lastQuietPrompt && Date.now() - G.lastQuietPrompt.at < 30 * 60 * 1000 ? G.lastQuietPrompt : null;
      if (recent) side = isPauseDirective(recent.text);
      G.lastQuietPrompt = null;
    } else {
      // "<System>롤플을 멈추고…</System>" 을 보내고 답을 받는 경우: 바로 앞 사용자 메시지가 곧 지시문이다
      for (let i = id - 1; i >= 0 && i >= id - 3; i--) {
        if (msgs![i]?.role !== 'user') continue;
        if (isPauseMessage(msgText(msgs![i]))) { side = true; msgs![i].memSide = true; marked.push(msgs![i]); }
        break;
      }
    }
    if (side === null) return false;
    msg.memSide = side;
    if (chat) Promise.resolve(this.saveMsgMarks(chat, marked)).catch(e => console.warn('[장기기억] 막간 표시 저장', e));
    if (side) this.logActivity('side', `#${id + 1}은 롤플을 멈추고 만든 막간이라 기억에 넣지 않아요`);
    return side;
  },
  /** 메시지에 붙인 표시(memSide · memCheck)만 저장된 대화에 옮겨 적는다 — 그사이 대화 화면이 고친 메시지 목록을 통째로 덮어쓰지 않게. 반환: 옮겨 적은 칸 수 */
  async saveMsgMarks(chat, marked) {
    const saved = await S.msgs(chat.id); let n = 0;
    for (const m of marked || []) {
      const row = (saved || []).find(x => x.id === m?.id); if (!row || row === m) continue;
      for (const k of ['memSide', 'memCheck']) { if (m![k] === undefined) { if (k in row) { delete row[k]; n++; } } else { row[k] = m![k]; n++; } }
    }
    if (n) await DB.put('msgs', { id: chat.id, list: saved });
    return n;
  },

  // ════════ 연속성 검사 — 새 답변이 기록 · 최근 대화와 어긋나는지 ════════
  /** 메시지에 붙은 점검 결과 — 그 글에 대한 것일 때만 (스와이프 · 수정으로 글이 바뀌면 옛 경고는 무효) */
  checkOf(msg) { const c = msg?.memCheck; return c && c.h === mesHashOf(msg) ? c : null; },
  /**
   * 새 답변 하나를 서고 · 직전 대화와 견주어 어긋난 곳을 찾고, 결과를 메시지에 붙인다: msg.memCheck = { h, issues: [{ quote, evidence, source, problem }], filtered: [{ …, why }] }. 답변을 고쳐 쓰지는 않는다.
   * 점검은 기록과 같은 줄에 세운다 — 보조 모델을 동시에 두 번 부르지 않는다 (opt.queued === false 면 줄 세우지 않고 바로). 설정 replyCheck 가 꺼져 있으면 하지 않는다. 반환: 붙인 결과 또는 null
   */
  checkReply(chat, msgs, msg, opt = {}) { return opt.queued === false ? this.checkReplyNow(chat, msgs, msg, opt.signal) : this.enqueue(() => this.checkReplyNow(chat, msgs, msg, opt.signal)); },
  queueCheck(chat, msgs, msg, opt) { return this.checkReply(chat, msgs, msg, { ...opt, queued: true }); },
  async checkReplyNow(chat, msgs, msg, signal) {
    const cfg = this.cfg(); if (!cfg.enabled || !cfg.replyCheck || !chat || !msg) return null;
    await this.waitForChatIdle('연속성 검사');
    const idx = (msgs || []).indexOf(msg);
    if (idx < 0 || msg.role !== 'assistant' || msg.hidden || this.tagSideMessage(chat, msgs, msg) || this.isSideMessage(msg)) return null;   // 막간은 점검하지 않는다
    const reply = visibleProse(msgText(msg)); if (reply.trim().length < 20) return null;
    const h = mesHashOf(msg), mem = await this.load(chat.id), persona = S.persona(chat), char = S.get('chars', msg.charId) || S.get('chars', chat.charIds?.[0]), no = idx + 1;
    // 아직 요약되지 않은 최근 대화를 가능한 한 많이 보여 준다 — 그 안에서 바뀐 것을 모순으로 잘못 짚지 않게
    const recent = []; let room = 12000;
    for (let i = idx - 1; i >= 0 && recent.length < 24 && room > 0; i--) {
      const m = msgs[i]; if (!m || m.hidden || this.isSideMessage(m)) continue;
      const line = `[#${i + 1}] ${m.role === 'user' ? (m.name || persona?.name || 'User') : (m.name || char?.name || 'Character')}: ${cleanMultiline(visibleProse(msgText(m)), 1600)}`;
      room -= line.length; recent.unshift(line);
    }
    const parts = this.buildPacketSections(chat, mem, null, this.archiveQueryOpt(mem, reply.slice(0, 600), msgs));
    const archive = String(this.renderPacket({ ...parts, voices: [], banned: [], banTell: false }, { excerptLimit: 4 })).split('\n').filter((l: string) => l !== PACKET_HEADER && l !== PACKET_FOOTER).slice(this.packetGuidance(parts).length).join('\n');
    const context = `<archive>\n${archive}\n</archive>\n\n<recent_messages>\n${recent.join('\n\n')}\n</recent_messages>`;
    const userPrompt = `${context}\n\n<new_reply number="#${no}" by="${msg.name || char?.name || 'Character'}">\n${reply.slice(0, 8000)}\n</new_reply>`;
    let result = null;
    try {
      const { value, timedOut } = await withDeadline(this.call(chat, MP.REPLY_CHECK_PROMPT, userPrompt, 1500, signal), 120000, null);
      if (timedOut) this.logActivity('error', `#${no} 연속성 검사가 2분 안에 끝나지 않아 건너뛰었어요`); else result = parseLoose(value);
    } catch (e: any) { if (e?.name === 'AbortError' || signal?.aborted) throw e; this.logActivity('error', `#${no} 연속성 검사 실패: ${e?.message || e}`); }
    // 점검하는 사이 다른 답변으로 넘겼거나 고쳤으면 결과를 붙이지 않는다
    if (!result || (this.get(chat.id) || mem) !== mem || !msgs.includes(msg) || mesHashOf(msg) !== h) return null;
    const found = Array.isArray(result) ? result : result.issues, { kept, filtered } = verifyIssues(found, reply, context);
    if (kept.length || filtered.length) msg.memCheck = { h, issues: kept, filtered }; else delete msg.memCheck;
    await this.saveMsgMarks(chat, [msg]).catch(e => console.warn('[장기기억] 점검 결과 저장', e));
    emit('memory:check', { chatId: chat.id, msgId: msg.id, check: msg.memCheck || null });
    const total = Array.isArray(found) ? found.length : 0;
    this.logActivity('check', total ? `#${no} 점검: 찾은 경고 ${total}개 → 근거 확인 안 됨 ${filtered.length}개 → 남은 경고 ${kept.length}개` : `#${no} 점검: 어긋난 곳 없음`);
    return msg.memCheck || null;
  },
  /** 서고에 묻기 · 말로 고치기 · 연속성 검사가 장부 재료를 모을 때의 옵션 — 질의는 직접 주고, 장면(지금 자리에 있는 인물 · 상태창)은 대화에서 읽는다. 연출은 싣지 않는다 */
  archiveQueryOpt(mem, query, msgs) {
    if (!Array.isArray(msgs)) return { query, noDirection: true };
    return { msgs, noDirection: true, inputs: { ...this.recallInputs(mem, null, { msgs }), query: String(query ?? ''), aux: [] } };
  },

  // ════════ 다른 기능이 고친 메시지 · 직접 고친 메시지 ════════
  /**
   * 답변을 다시 쓰거나 그림 · 번역을 끼워 넣는 기능은 메시지를 고친 뒤 "수정됨"이 아니라 "갱신됨" 신호만 보낸다.
   * 화면만 다시 그린 경우가 훨씬 많으므로, 사서가 읽는 본문의 지문이 실제로 달라졌을 때만 그 턴을 다시 기록한다. 연달아 오는 갱신(그림 여러 장 · 문단별 재작성)은 1.5초 모아 한 번으로
   */
  onMessageUpdated(chat, msgs, msg) {
    const cfg = this.cfg(); if (!cfg.enabled || !cfg.auto || cfg.watchUpdates === false || !chat || !msg?.id) return;
    const key = chat.id + '\u0001' + msg.id; clearTimeout(updateTimers.get(key));
    updateTimers.set(key, setTimeout(async () => {
      updateTimers.delete(key);
      try {
        const i = (msgs || []).indexOf(msg); if (i < 0 || msg.role !== 'assistant' || msg.hidden) return;
        const mem = await this.load(chat.id), turn = mem.turns.find(t => t.msgId === msg.id);
        if (!turn || turn.failed || turnMatches(turn, msg)) return;   // 아직 기록 전이면 기록될 때 새 본문을 읽는다
        this.logActivity('update', `#${i + 1} 메시지의 본문이 바뀌어 그 턴을 다시 기록해요`);
        this.dropTurn(mem, msg.id); await this.save(mem);
        if (this.isSettledForRecord(msgs!, i)) await this.queueCommit(chat, msgs!, msg);
      } catch (e: any) { console.warn('[장기기억]', e); this.logActivity('error', `이벤트 처리 중 오류: ${e?.message || e}`); }
    }, 1500));
  },
  /** 메시지를 직접 고쳤을 때: 답변이면 그 턴을 걷어내고, 이미 확정된 응답이면 새 내용으로 다시 기록한다 — 아직 확정 전인 응답(기록 지연 · 첫 인사)은 확정되면 그때 기록된다. 답변이 아니면 맞추기만 */
  async onMessageEdited(chat, msgs, msg) {
    const cfg = this.cfg(); if (!cfg.enabled || !chat || !msg) return;
    const mem = await this.load(chat.id), i = (msgs || []).indexOf(msg);
    if (msg.role === 'assistant' && !msg.hidden && cfg.auto) {
      if (mem.turns.some(t => t.msgId === msg.id)) { this.dropTurn(mem, msg.id); await this.save(mem); }
      if (i >= 0 && this.isSettledForRecord(msgs, i)) await this.queueCommit(chat, msgs, msg);
    } else if (this.reconcile(mem, msgs)) await this.save(mem);
  },
  /** 답변을 생성하는 중이면 끝날 때까지 기다린다 (설정 yieldToChat). 끝 신호를 놓쳐도 영영 멈추지 않게 3분 상한 */
  async waitForChatIdle(what = '기록') {
    if (!G.chatGenerating || !this.cfg().yieldToChat) return;
    const began = Date.now(); this.logActivity('defer', `답변 생성 중이라 ${what}을(를) 잠시 미뤘어요`);
    while (G.chatGenerating && this.cfg().yieldToChat) {
      if (Date.now() - G.chatGeneratingSince > CHAT_IDLE_MAX_WAIT_MS) { G.chatGenerating = false; G.chatGeneratingSince = 0; break; }
      if (Date.now() - began > CHAT_IDLE_MAX_WAIT_MS) break;
      await new Promise(r => setTimeout(r, 400));
    }
  },
  chatGenerating: () => G.chatGenerating,
  /** 사서 일지 — 회상 · 기록 · 요약처럼 저절로 일어난 일을 남긴다 */
  activityLog,
  /** extra: 줄에 덧붙일 값 (예: { chatId }) — kind · text · at · count 는 덮지 않는다 */
  logActivity(kind, text, extra) { const row = activityLog.add(kind, text); if (extra && typeof extra === 'object') { const { kind: _k, text: _t, at: _a, count: _c, ...rest } = extra; Object.assign(row, rest); } emit('memory:activity', row); return row; },
  /** 사서 일지의 줄들 — 최신이 위 [{ kind, text, at, count }] */
  activity() { return activityLog.list(); },
  clearActivity() { activityLog.clear(); emit('memory:activity', null); },
  /** 삼갈 표현 · 반복 표현 목록 (설정 글이 바뀔 때만 다시 나눈다) */
  bannedPhrases() { const raw = String(this.cfg().bannedPhrases || ''); if (G.bannedCache.raw !== raw) G.bannedCache = { raw, list: parsePhraseList(raw) }; return G.bannedCache.list; },

  // ════════ 기록 시점 — 응답이 "확정"된 뒤에 기록한다 ════════
  // 응답이 오자마자 기록하면 리롤할 응답 · 잠깐 띄웠다 지울 응답 · 새 대화마다 뜨는 첫 인사에도 사서를 부르게 된다.
  // 기록 지연(recordDelay)을 N 으로 두면 그 응답 뒤에 이야기가 N 걸음 더 나아간 뒤에야 기록한다. 첫 인사는 지연이 0 이어도 첫 답을 기다린다
  /** 첫 사용자 메시지의 위치 (없으면 -1). 그보다 앞의 캐릭터 메시지는 첫 인사다 */
  firstUserMesIndex(msgs) { return msgs.findIndex(m => m?.role === 'user'); },
  recordDelayTurns() { return Math.max(0, Math.min(20, Math.round(Number(this.cfg().recordDelay) || 0))); },
  /** 이 응답을 기록하려면 그 뒤로 이야기가 몇 걸음 더 나아가야 하는가 */
  requiredStepsFor(msgs, i) { const fu = this.firstUserMesIndex(msgs), greeting = fu < 0 || i < fu; return greeting ? Math.max(1, this.recordDelayTurns()) : this.recordDelayTurns(); },
  /** 응답 뒤로 이야기가 몇 걸음 나아갔는지 — 사용자 메시지 수와 새 응답 수 중 많은 쪽 (입력 없이 전개 지시 · 풀사칭으로만 진행해도 확정되게) */
  storyStepsAfter(msgs, i) { let users = 0, replies = 0; for (let k = i + 1; k < msgs.length; k++) { const m = msgs[k]; if (!m) continue; if (m.role === 'user') users++; else replies++; } return Math.max(users, replies); },
  isSettledForRecord(msgs, i) { return this.storyStepsAfter(msgs, i) >= this.requiredStepsFor(msgs, i); },
  /** 막 확정된 응답들. 대화 끝에서부터 거슬러 올라가되 기록 조건을 갓 채운 구간(필요 걸음 수 + 여유 3)까지만 본다 — 그보다 오래된 미기록 턴은 색인이 맡는다. 반환: 기록할 답변(대화 순서) */
  commitSettledTurns(chat, mem, msgs) {
    const cfg = this.cfg(), due: Seen<typeof chat, Msg[]> = []; if (!cfg.enabled || !cfg.auto) return due;
    const horizon = Math.max(1, this.recordDelayTurns()) + 3; let users = 0, replies = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]; if (!m) continue;
      const steps = Math.max(users, replies);   // 이 메시지보다 뒤에 있는 것만 센다
      if (m.role === 'assistant' && !m.hidden && !this.isSideMessage(m)) {
        const need = this.requiredStepsFor(msgs, i);
        if (steps >= Math.max(1, need)) { const t = mem.turns.find(x => x.msgId === m.id); if (!t || !turnMatches(t, m)) due.unshift(m); }   // 지연 0 이면 응답이 도착할 때 이미 기록됐다. 실패한 턴은 색인이 다시 시도한다
      }
      if (m.role === 'user') users++; else replies++;
      if (Math.max(users, replies) > horizon) break;
    }
    return due;
  },

  // ════════ 기록 ════════
  /** 한 주고받음을 사서에게 맡겨 기록한다. 대화 화면이 답변 직후 부를 때(네 번째 인자 없음)는 기록 지연과 뒷정리까지 맡는다 */
  commit(chat, msgs, ai, opts) {
    return this.enqueue(async () => {
      if (opts) return this.commitOne(chat, msgs, ai, opts);
      const mem = await this.load(chat.id), i = msgs.indexOf(ai);
      this.reconcile(mem, msgs);
      if (i >= 0 && (this.tagSideMessage(chat, msgs, ai) || this.isSideMessage(ai))) return mem;   // 막간은 기록도 뒷정리도 하지 않는다
      if (i >= 0 && this.requiredStepsFor(msgs, i) === 0) await this.commitOne(chat, msgs, ai, {});   // 지연 0 이면 응답이 도착하자마자
      for (const m of this.commitSettledTurns(chat, mem, msgs)) await this.commitOne(chat, msgs, m, {});   // 이야기가 필요한 만큼 더 나아간 응답 (첫 인사 포함)
      await this.post(chat, msgs);
      return mem;
    });
  },
  queueCommit(chat, msgs, ai, opts = {}) { return this.commit(chat, msgs, ai, opts); },
  /** 답변 뒤 뒷정리: 자동 숨김 · 질의 임베딩 · 장면 연출 (다음 답변을 위해 미리 계산해 둔다) */
  async post(chat, msgs, signal) {
    const cfg = this.cfg();
    if (!cfg.enabled) return;
    if (cfg.autoHide) { const n = this.autoHide(chat, msgs); if (n) { await S.saveMsgs(chat, msgs); emit('memory:msgs', chat); } }
    if (cfg.embed.mode === 'api') await this.embedQuery(chat, msgs, signal).catch(e => console.warn('[장기기억] 질의 임베딩', e));
    if (cfg.supervisor) { await this.waitForChatIdle('장면 연출'); await this.direct(chat, msgs, signal).catch(e => console.warn('[장기기억] 장면 연출', e)); }
  },

};
