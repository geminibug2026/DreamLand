// memory.js 1336–1950 줄을 그대로 옮긴 것. 본문은 고치지 않고 타입(Part3)만 붙인다
import { S, DB, uid, msgText } from '../../lib/core';
import { embedTexts, embedKind, embedModel } from '../../lib/embed';
import type { MemoryApi } from './api';
import type { StatusBar } from './part1';
import type { CastCard, Cfg, ChatM, Mem, MemItem, Msg, Summary, SummarySrc, Turn } from '../types';
import { G, NARRATOR, PUBLIC_ONLY, PAST_QUERY_RE, str, list, clip, low, cleanStr, visibleProse, sanitizeRecord, ekey, vec, cos, cueText, indexText, vecOf, cleanMultiline, normScope, sameKnowledgeScope, storyFossilWeight, grams, lexical, gramOverlap, calibrate, parseLoose, toDays, ago, dcache, dvec, normLockKind, normVisibility, overrides, pendingEmbeds, queryEmbedCache, preps } from './base';
import * as MP from '../prompts';
import { THREAD_KINDS, withDeadline, hasPhrase, splitClosedLine } from '../craft';

type Chat = ChatM | null | undefined;
type Progress = (done: number, total: number) => void;
/** 묶음 요약 옵션 */
export interface SummarizeChunkOpts { signal?: AbortSignal; flushAll?: boolean; onProgress?: Progress | null; shouldStop?: (() => boolean) | null; strict?: boolean }
/** 화면이 부르는 요약 옵션 */
export interface SummarizeOpts { signal?: AbortSignal; flush?: boolean; strict?: boolean; onProgress?: Progress | null; stop?: (() => boolean) | null }
export interface RebuildOpts { signal?: AbortSignal; onProgress?: Progress | null; stop?: (() => boolean) | null }
/** 서고 정리 결과 */
export interface ConsolidationStats { merged: number; dropped: number; reweighted: number }
/** 서사 시계 재계산 결과 */
export interface ClockRecalResult { before: number; after: number; failed: number }
/** 답변 전 준비 결과 (took = ms) */
export interface PrepResult { took: number; timedOut: boolean; waitSec?: number; at?: number }
/** 프롬프트에 실리는 대화 한 줄 (메시지가 아니라 조립된 기록) */
export interface HistoryMsg { role: string; content?: unknown; [k: string]: unknown }
/** 회상의 입력 */
export interface RecallInputs { query: string; aux: string[]; scene: string; recentText: string }
export interface RecallOpts { msgs?: Msg[]; type?: string; query?: string | null; inputs?: RecallInputs; topK?: number }
/** 왜 골랐는지 (기억 id 별) */
export interface RecallTraceParts { cos: number; lex: number; imp: number; rec: number; bonus: number; sem: number }
export interface RecallTrace { reason: string; mode: 'pinned' | 'trigger' | 'direct' | 'association'; score?: number; parts?: RecallTraceParts; via?: string }
/** 회상 결과 */
export interface RecallResult { selected: MemItem[]; pinned: MemItem[]; triggered: MemItem[]; hidden: number; trace: Map<string, RecallTrace>; query: string; inputs: RecallInputs }
/** 연상의 씨앗 · 연상으로 이어진 기억 */
export interface RecallSeed { m: MemItem; score: number }
export interface AssocLink { m: MemItem; score: number; via: string; cues: string[] }
/** 자료실에서 고른 대목 */
export interface DossierExcerpt { title?: string; text: string; score: number }
/** 지금 장면 (상태 보드의 scene 줄) */
export interface SceneSnapshot { location: string; date: string; time: string; present: string; mood: string; any: boolean }
/** 가장 최근 상태창 */
export type LatestStatus = { msgId: string; mesId: number } & StatusBar;
/** 회상 한 줄에 곁들이는 것 */
export interface MemoryLineOpts { ages?: Map<number, number> | null; T?: number; banned?: string[] | null; notes?: Map<string, string> | null }
/** 인물 한 줄 — brief: 장면 밖 인물 · sceneNow: 지금 장면에 있다 */
export type CastLine = CastCard & { brief?: boolean; sceneNow?: boolean };

/** 옛 본문이 쓰지 않는 매개변수 · 변수 — 이름을 바꿀 수 없어 typeof 로 한 번 가리킨다 (결과는 R 그대로) */
type Keep<T, R> = [T] extends [never] ? R : R;
/** 사서의 답 (JSON) — 재그룹 · 서고 정리 */
interface GroupPlan { groups?: unknown }
interface CuratorMerge { keep?: unknown; absorb?: unknown; summary?: unknown }
interface CuratorReweight { id?: unknown; importance?: unknown }
interface CuratorPlan { merge?: unknown; drop?: unknown; reweight?: unknown }
/** 회상 후보 (v = 요약 축 내장 벡터) */
interface Cand { m: MemItem; score: number; v: ReturnType<typeof vec> }
/** 회상이 읽는 한 줄 — 대화 메시지이거나 조립된 기록 */
type Line = Msg | HistoryMsg;

/** 이 조각이 맡는 Memory 메서드의 서명 */
export interface Part3 {
  previousSummariesForContext(mem: Mem): string;
  prevSummaries(mem: Mem): string;
  summaryCoveredTurn(mem: Mem): number;
  digestTag(t: Turn, i: number): string;
  chunkText(chat: Chat, mem: Mem, from: number, to: number, signal?: AbortSignal, strict?: boolean, opts?: { threads?: boolean }): Promise<string>;
  maybeSummarizeChunk(chat: Chat, mem: Mem, opts?: SummarizeChunkOpts): Promise<number>;
  summarize(chat: Chat, mem: Mem, opts?: SummarizeOpts): Promise<number>;
  rebuildAllSummaries(chat: Chat, mem: Mem, opts?: RebuildOpts): Promise<number | null>;
  rebuildSummaries(chat: Chat, mem: Mem, opts?: RebuildOpts): Promise<number | null>;
  arcText(chat: Chat, parts: SummarySrc[], signal?: AbortSignal, opts?: { extra?: string; max?: number }): Promise<string>;
  pushArcFromChunks(chat: Chat, mem: Mem, merging: Summary[], signal?: AbortSignal): Promise<void>;
  pushArc(chat: Chat, mem: Mem, merging: Summary[], signal?: AbortSignal): Promise<void>;
  askGroups(chat: Chat, rows: Summary[], prompt: string, tag: string, signal?: AbortSignal): Promise<Summary[][] | null>;
  regroupChunksIntoArcs(chat: Chat, mem: Mem, signal?: AbortSignal): Promise<number | null>;
  regroup(chat: Chat, mem: Mem, signal?: AbortSignal): Promise<number | null>;
  mergeArcsIntoOne(chat: Chat, mem: Mem, arcs: Summary[], signal?: AbortSignal): Promise<Summary>;
  regroupArcs(chat: Chat, mem: Mem, signal?: AbortSignal): Promise<number>;
  maybeConsolidateArcs(chat: Chat, mem: Mem, signal?: AbortSignal): Promise<void>;
  maybeFoldEras(chat: Chat, mem: Mem, signal?: AbortSignal): Promise<boolean>;
  consolidationCandidates(mem: Mem): MemItem[];
  runConsolidation(chat: Chat, mem: Mem, signal?: AbortSignal): Promise<ConsolidationStats | null>;
  consolidate(chat: Chat, mem: Mem, signal?: AbortSignal): Promise<ConsolidationStats | null>;
  maybeConsolidate(chat: Chat, mem: Mem, signal?: AbortSignal): Promise<void>;
  recalClock(chat: Chat, mem: Mem, opts?: { signal?: AbortSignal; onProgress?: Progress | null }): Promise<ClockRecalResult | null>;
  recalibrateStoryClock(chat: Chat, mem: Mem, opts?: { signal?: AbortSignal; onProgress?: Progress | null }): Promise<ClockRecalResult | null>;
  autoHide(chat: ChatM, msgs: Msg[]): number;
  applyAutoHide(chat: ChatM, msgs: Msg[]): number;
  unhideAllMessages(chat: Chat, msgs: Msg[] | null | undefined, opts?: { all?: boolean }): number;
  embedSig(): string;
  vecOk(avm: string | null | undefined): boolean;
  embedCall(texts: string[], signal?: AbortSignal, opts?: { timeoutMs?: number; query?: boolean }): Promise<Float32Array[]>;
  embedMemories(chat: Chat, mem: Mem, opts?: { all?: boolean; signal?: AbortSignal; onProgress?: Progress | null }): Promise<number>;
  embedQueriesViaApi(texts: string[]): Promise<(Float32Array | null)[] | null>;
  queryVec(text: string): Float32Array | null;
  recallQueryTexts(inp: RecallInputs): string[];
  embedQuery(chat: ChatM, msgs: Msg[], signal?: AbortSignal): Promise<void>;
  prepare(chat: Chat, msgs: Msg[], opts?: { type?: string; background?: boolean }): Promise<PrepResult>;
  storyAges(mem: Mem): Map<number, number>;
  buildStoryAgeMap(mem: Mem): Map<number, number>;
  fossilWeight(age: number, cfg?: Cfg): number;
  authorizedEntities(chat: Chat, mem: Mem): Set<string>;
  authorized(chat: Chat, mem: Mem): Set<string>;
  knowsMemory(m: MemItem, auth: Set<string>): boolean;
  findAssociations(mem: Mem, memories: MemItem[], seeds: RecallSeed[], opts?: { limit?: number }): AssocLink[];
  associations(mem: Mem, rows: MemItem[], seeds: RecallSeed[], limit?: number): AssocLink[];
  recallInputs(mem: Mem, history: HistoryMsg[] | null | undefined, opt?: RecallOpts): RecallInputs;
  recallEx(chat: Chat, mem: Mem, history?: HistoryMsg[] | null, opt?: RecallOpts): RecallResult;
  retrieveMemories(chat: Chat, mem: Mem, history?: HistoryMsg[] | null, opt?: RecallOpts): RecallResult;
  recall(mem: Mem, history?: HistoryMsg[] | null): MemItem[];
  pickRecalledChapter(mem: Mem, query: string | null | undefined, sceneText?: string | null): Summary | null;
  chapterVec(c: Summary): Float32Array;
  dossierPick(mem: Mem, query: string, aux?: string[] | null, max?: number): DossierExcerpt[];
  pickDossierExcerpts(mem: Mem, query: string, aux?: string[] | null, opt?: { max?: number }): DossierExcerpt[];
  scene(mem: Mem): SceneSnapshot;
  latestStatus(msgs: Msg[] | null | undefined, before?: number): LatestStatus | null;
  markOutdatedRecall(memories: MemItem[], mem: Mem): Map<string, string>;
  formatMemoryLine(m: MemItem, withExcerpt?: boolean, x?: MemoryLineOpts): string;
  formatCharacterLine(c: CastLine): string;
}

export const part3: Part3 & ThisType<MemoryApi> = {
  /** 요약 호출에 붙이는 앞선 요약들 — 이름 · 시간 · 장소 · 관계가 이어지게 (사건을 되풀이하라는 뜻이 아니다) */
  previousSummariesForContext(mem) {
    const count = this.cfg().summaryContextCount ?? 3; if (count === 0) return '';
    const all = [...mem.arcs.map(s => ({ ...s, tag: s.carried ? 'earlier chat' : `t${s.from + 1}–t${s.to + 1}` })), ...mem.chunks.map(s => ({ ...s, tag: `t${s.from + 1}–t${s.to + 1}` }))];
    const picked = count < 0 ? all : all.slice(-count);
    return picked.length ? `Previous summaries (for continuity of names, time, place, relationships — do not restate their events):\n${picked.map(s => `[${s.tag}] ${s.text}`).join('\n')}\n` : '';
  },
  prevSummaries(mem) { return this.previousSummariesForContext(mem); },
  /** 요약이 이미 다룬 턴 수 (묶음 · 연대기 · 건너뛴 창 커서 중 가장 뒤). 다음에 요약할 턴의 번호(0부터)와 같다 */
  summaryCoveredTurn(mem) {
    return Math.min(mem.turns.length, Math.max(mem.chunked || 0, mem.chunks.reduce((a, c) => Math.max(a, (c.to ?? -1) + 1), 0), mem.arcs.filter(a => !a.carried).reduce((a, c) => Math.max(a, (c.to ?? -1) + 1), 0)));
  },
  /** 요약에 넘기는 턴 기록의 꼬리표 — 순서(tN), 결정적 턴 표시(★), 작중 시간 · 장소. i = 0부터 세는 턴 번호 */
  digestTag(t, i) {
    const bits = [`t${i + 1}${(t.weight ?? 0) >= 0.75 ? ' ★' : ''}`];
    if (t.when) bits.push(cleanStr(t.when, 60)); if (t.where) bits.push(cleanStr(t.where, 60));
    return bits.join(' · ');
  },
  /**
   * 한 구간(from~to, 0부터)의 묶음 요약 글을 만든다. threads: 요약 호출이 이 구간을 통째로 읽는 김에, 열려 있는 떡밥 가운데 풀렸거나 의미가 없어진 것을 함께 묻고 닫는다 (호출을 따로 쓰지 않는다).
   * strict: 요약 호출이 실패하면 턴 기록을 이어 붙여 넣는 대신 오류를 던진다
   */
  async chunkText(chat, mem, from, to, signal, strict = false, { threads = false } = {}) {
    const parts = mem.turns.slice(from, to + 1).map((t, i) => t.digest && `[${this.digestTag(t, from + i)}] ${t.digest}`).filter(Boolean);
    if (!parts.length) return '';
    const open = threads ? mem.pledges.filter(l => l.status === 'active' && THREAD_KINDS.includes(normLockKind(l.kind))).sort((a, b) => (a.turn || 0) - (b.turn || 0)).slice(0, 16) : [];
    const threadTags = new Map(open.map((l, i) => [`o${i + 1}`, l]));
    const threadBlock = open.length ? `Open threads on file:\n${[...threadTags].map(([tag, l]) => `[${tag}] ${l.summary}`).join('\n')}\n` : '';
    const threadDirective = open.length
      ? '\n\nTHREAD CHECK: after the record, add ONE final line "CLOSED: o2, o5" naming every listed open thread that these turns (or the earlier records shown) have clearly settled, answered, carried out, abandoned, or made pointless. A thread nobody will plausibly return to — a passing errand, a small question already overtaken by events — counts as closed. Write "CLOSED: none" when all are still live. This line is filing metadata, not part of the record.'
      : '';
    let text = '';
    try {
      const refBlock = await this.buildReferenceBlock(chat, { lean: true });   // 카드 본문은 다시 보내지 않는다 — 이름만
      const userPrompt = [refBlock, this.previousSummariesForContext(mem), threadBlock, `Turn digests to weave:\n${parts.join('\n')}`].filter(Boolean).join('\n');
      const reply = splitClosedLine(await this.call(chat, `${this.promptText('chunk')}${threadDirective}\n\n${this.languageDirective()}`, userPrompt, 4000, signal));
      text = cleanMultiline(sanitizeRecord(reply.text), 2000);
      if (text) {
        let closed = 0;
        for (const tag of reply.closed) {
          const lock = threadTags.get(tag); if (!lock || lock.status !== 'active') continue;
          if (lock.manual) { lock.suggestResolved = true; lock.suggestTurn = to; continue; }   // 직접 적은 떡밥은 사서가 닫지 못한다 — "해소된 듯" 의견만 붙인다
          lock.status = 'resolved'; lock.resolvedTurn = to; lock.resolution = lock.resolution || '요약 때 정리됨'; closed++;
        }
        if (closed) this.logActivity('summary', `풀렸거나 의미가 없어진 떡밥 ${closed}개를 닫았어요`);
      }
    } catch (e: any) { if (strict || e?.name === 'AbortError' || signal?.aborted) throw e; console.debug('[장기기억] 묶음 요약 실패, 턴 기록을 이어 붙입니다', e); }
    if (!text) { if (strict) throw new Error(`t${from + 1}–t${to + 1} 요약 응답이 비어 있습니다`); text = cleanStr(parts.join(' / '), 2000); }
    return text;
  },
  /**
   * 밀린 턴을 요약 주기 단위로 묶어 요약한다. 반환: 새로 만든 묶음 수.
   * flushAll — 주기를 다 못 채운 마지막 자투리까지 ("지금 요약" · 전체 다시 만들기) · onProgress(done, total) · shouldStop() 이 true 면 다음 창부터 멈춘다 · strict — 실패하면 오류를 던진다.
   * 미요약 범위가 크게 밀렸어도(일괄 색인 · 기록 실패 구간) 한 덩이로 삼키지 않고 n턴 창 단위로 나눈다. 턴 기록이 없어 건너뛴 창도 "지나갔다"고 기억한다(mem.chunked)
   */
  async maybeSummarizeChunk(chat, mem, { signal, flushAll = false, onProgress = null, shouldStop = null, strict = false } = {}) {
    const cfg = this.cfg(), n = Math.max(3, +cfg.chunkTurns || 8);
    let covered = this.summaryCoveredTurn(mem), made = 0, done = 0;
    const pending = mem.turns.length - covered, total = pending <= 0 ? 0 : (flushAll ? Math.ceil(pending / n) : Math.floor(pending / n));
    while (flushAll ? mem.turns.length > covered : mem.turns.length - covered >= n) {
      if (shouldStop?.()) break;
      const from = covered, to = Math.min(covered + n, mem.turns.length) - 1; covered = to + 1;
      const text = await this.chunkText(chat, mem, from, to, signal, strict, { threads: true });
      if (!text) { mem.chunked = covered; onProgress?.(++done, total); continue; }   // 턴 기록이 하나도 없는 창
      mem.chunks.push({ id: 'c' + uid(), from, to, text }); mem.chunked = covered; made++; onProgress?.(++done, total);
    }
    // 안전 상한: 서고 정리 주기가 길거나 꺼져 있어도 묶음이 무한정 쌓이지 않게. 새 묶음이 생겼을 때만 본다 —
    // 사서가 "전부 따로 둔다"고 답하면 개수가 줄지 않으므로, 다시 묶어도 상한 아래로 내려가지 않으면 가장 오래된 네 개를 연대기로 접는다
    const cap = Math.max(3, +cfg.arcMergeAt || 6);
    if (made && mem.chunks.length > cap) {
      try { await this.regroupChunksIntoArcs(chat, mem, signal); } catch (e: any) { if (e?.name === 'AbortError' || signal?.aborted) throw e; console.warn('[장기기억] 안전 상한 재그룹 실패', e); }
      while (mem.chunks.length > cap && !shouldStop?.()) { const oldest = mem.chunks.slice(0, 4); mem.chunks = mem.chunks.slice(4); await this.pushArcFromChunks(chat, mem, oldest, signal); }
    }
    return made;
  },
  /** 예전 이름 · 화면이 부르는 모양: { flush, stop } */
  summarize(chat, mem, { signal, flush = false, strict = false, onProgress, stop } = {}) { return this.maybeSummarizeChunk(chat, mem, { signal, flushAll: flush, strict, onProgress, shouldStop: stop }); },
  /**
   * 이 대화의 요약 · 연대기를 턴 기록에서 처음부터 다시 만든다 (이어받은 연대기는 그대로 둔다).
   * 초안에서 다 만든 뒤 마지막에 한 번에 바꿔 끼운다 — 중단하거나 실패하면 원래 요약을 그대로 둔다. 기록 줄에 세워, 도중에 새 턴 기록이 요약을 끼워 넣지 못하게 한다.
   * 반환: 만든 묶음 수, 중단되면 null. 실패하면 오류를 던진다
   */
  async rebuildAllSummaries(chat, mem, { signal, onProgress, stop } = {}) {
    if (G.rebuildRunning) throw new Error('이미 다시 만드는 중입니다');
    G.rebuildRunning = true;
    try {
      return await this.enqueue(async () => {
        const draft: Mem = { ...mem, chunks: [], arcs: mem.arcs.filter(a => a.carried), chunked: 0, arcCursor: 0 };
        const halted = () => !!stop?.() || !!signal?.aborted || (this.get(mem.id) || mem) !== mem;
        const made = await this.maybeSummarizeChunk(chat, draft, { signal, flushAll: true, strict: true, onProgress, shouldStop: halted });
        if (halted()) return null;
        await this.checkpoint(mem, '요약 전체 다시 만들기 전').catch(() => { });
        Object.assign(mem, { chunks: draft.chunks, arcs: draft.arcs, chunked: draft.chunked, arcCursor: draft.arcCursor || 0 });
        await this.save(mem);
        return made;
      });
    } finally { G.rebuildRunning = false; }
  },
  rebuildSummaries(chat, mem, opts) { return this.rebuildAllSummaries(chat, mem, opts); },
  /** 여러 요약(묶음 · 연대기)을 하나의 연대기 글로 줄인다. extra: 프롬프트에 덧붙일 지시. 실패하면 '' */
  async arcText(chat, parts, signal, { extra = '', max = 2400 } = {}) {
    try { return cleanMultiline(sanitizeRecord(await this.call(chat, `${this.promptText('arc')}${extra}\n\n${this.languageDirective()}`, parts.map(c => `[t${c.from + 1}–t${c.to + 1}]\n${c.text}`).join('\n\n'), 4000, signal)), max); }
    catch (e: any) { if (e?.name === 'AbortError' || signal?.aborted) throw e; console.debug('[장기기억] 연대기 병합 실패', e); return ''; }
  },
  /** 묶음 여러 개를 하나의 연대기로 줄여 밀어 넣는다. 병합 전 묶음 경계(src)를 남겨 둔다 — 나중에 삭제로 연대기 일부만 걸리면 안 걸린 묶음을 되살릴 수 있게 */
  async pushArcFromChunks(chat, mem, merging, signal) {
    if (!merging.length) return;
    const text = await this.arcText(chat, merging, signal) || cleanStr(merging.map(c => c.text).join(' '), 2400);
    mem.arcs.push({ id: 'a' + uid(), from: merging[0].from, to: merging[merging.length - 1].to, text, src: merging.map(c => ({ from: c.from, to: c.to, text: c.text })) });
  },
  pushArc(chat, mem, merging, signal) { return this.pushArcFromChunks(chat, mem, merging, signal); },
  /**
   * 사서에게 "이어진 사건끼리 묶어 달라"고 묻는다. 모든 항목이 정확히 한 번씩, 원래 순서대로 연속되게 나와야 받아들인다 —
   * "1번과 3번을 묶고 2번은 따로"처럼 시간순을 건너뛰는 묶음은 허용하지 않는다. 반환: 묶음 목록, 판정 실패는 null (다음 주기에 다시)
   */
  async askGroups(chat, rows, prompt, tag, signal) {
    const ids = new Map(rows.map((c, i): Keep<typeof c, [string, number]> => [tag + (i + 1), i])); let plan: GroupPlan | null = null;
    try { plan = parseLoose(await this.call(chat, prompt, rows.map((c, i) => `[${tag}${i + 1}] (t${c.from + 1}–t${c.to + 1})\n${c.text}`).join('\n\n'), 2000, signal)) as GroupPlan | null; }
    catch (e: any) { if (e?.name === 'AbortError' || signal?.aborted) throw e; console.warn('[장기기억] 재그룹 판정 실패 (다음 주기에 재시도)', e); return null; }
    if (!Array.isArray(plan?.groups)) return null;
    const out: Summary[][] = []; let next = 0;
    for (const g of plan.groups) { const idxs = list(g).map(t => ids.get(String(t || '').trim())).filter(i => i != null) as number[]; if (!idxs.length) continue; for (const i of idxs) { if (i !== next) return null; next++; } out.push(idxs.map(i => rows[i])); }
    return next === rows.length ? out : null;
  },
  /**
   * 묶음 요약들을 사건 단위로 다시 묶어 연대기로 합친다 — 개수가 아니라 실제로 같은 사건인지를 한 번에 통째로 보고 판단한다.
   * 묶음 자체는 고정 턴 수라 한 사건이 우연히 경계에 걸려 반토막 나 있어도 여기서 다시 하나로 묶인다. 반환: 합친 그룹 수, 또는 null(대상 없음 · 판정 실패)
   */
  async regroupChunksIntoArcs(chat, mem, signal) {
    const chunks = mem.chunks; if (chunks.length < 2) return null;
    const groups = await this.askGroups(chat, chunks, MP.CHUNK_REGROUP_PROMPT, 'c', signal); if (!groups) return null;
    const remaining = []; let merged = 0;
    for (const g of groups) { if (g.length < 2) { remaining.push(g[0]); continue; } await this.pushArcFromChunks(chat, mem, g, signal); merged++; }
    mem.chunks = remaining;
    return merged;
  },
  regroup(chat, mem, signal) { return this.regroupChunksIntoArcs(chat, mem, signal); },
  /** 연대기 여러 개를 하나로 다시 줄인다 (src 는 이어 붙여 보존) */
  async mergeArcsIntoOne(chat, mem, arcs, signal): Promise<Keep<typeof mem, Summary>> {
    const text = await this.arcText(chat, arcs, signal) || cleanStr(arcs.map(a => a.text).join(' '), 2400);
    return { id: 'a' + uid(), from: arcs[0].from, to: arcs[arcs.length - 1].to, text, src: arcs.flatMap(a => Array.isArray(a.src) && a.src.length ? a.src : [{ from: a.from, to: a.to, text: a.text }]) };
  },
  /**
   * 연대기 정리 — 묶음 재그룹과 별개. 이미 줄여 둔 연대기끼리만 훨씬 보수적으로 다시 보고, 정말 같은 사건인데 만들어진 때가 달라 갈라진 것만 합친다.
   * 커서(arcCursor) 앞은 "이미 결론 남"으로 보되, 커서 바로 앞의 하나는 다음 것과 이어질 수 있어 매번 후보에 넣는다. 반환: 합친 그룹 수
   */
  async regroupArcs(chat, mem, signal) {
    const local = mem.arcs.filter(a => !a.carried).sort((a, b) => a.from - b.from), cursor = mem.arcCursor || 0;
    let start = local.findIndex(a => a.to >= cursor); if (start < 0) return 0; if (start > 0) start--;
    const pool = local.slice(start); if (pool.length < 2) return 0;
    const groups = await this.askGroups(chat, pool, MP.ARC_REGROUP_PROMPT, 'a', signal); if (!groups) return 0;
    const fin = []; let merged = 0;
    for (const g of groups) { if (g.length < 2) { fin.push(g[0]); continue; } fin.push(await this.mergeArcsIntoOne(chat, mem, g, signal)); merged++; }
    const set = new Set(pool); mem.arcs = [...mem.arcs.filter(a => !set.has(a)), ...fin];
    if (fin.length >= 2) mem.arcCursor = fin[fin.length - 2].to + 1;   // 마지막 그룹은 다음에도 이어질 수 있다 — 그 앞까지만 "결론 남"
    return merged;
  },
  /** N턴마다 연대기 정리 (설정 arcConsolidateEvery, 0 = 끔). 실패해도 다음 주기까지 기다린다 */
  async maybeConsolidateArcs(chat, mem, signal) {
    const every = +this.cfg().arcConsolidateEvery || 0; if (every < 1) return;
    if (mem.turns.length - (mem.arcAt || 0) < every) return;
    mem.arcAt = mem.turns.length;
    try { const merged = await this.regroupArcs(chat, mem, signal); if (merged) console.info(`[장기기억] 연대기 정리: ${merged}개 그룹 병합`); }
    catch (e: any) { if (e?.name === 'AbortError' || signal?.aborted) throw e; console.warn('[장기기억] 연대기 정리 실패 (다음 주기에 재시도)', e); }
  },
  /**
   * 옛 이야기 접기 — 긴 대화의 핵심. 연대기는 사건마다 하나씩 생겨 끝없이 늘어난다. 그대로 두면 장부가 예산을 넘는 순간 가장 오래된 연대기부터 통째로 잘려 "이야기의 처음"을 잃는다.
   * 그래서 정해 둔 개수(eraKeep)를 넘으면 가장 오래된 것들을 하나의 '옛 이야기'(saga)로 접는다. 접힌 것은 다음에 또 넘칠 때 함께 다시 접혀, 몇천 턴이 되어도 요약의 크기는 일정한 범위에 머문다.
   * 실패하면 그대로 둔다 (이어 붙인 날것으로 바꾸지 않는다). 반환: 접었는지
   */
  async maybeFoldEras(chat, mem, signal) {
    const keep = Math.max(3, Math.round(Number(this.cfg().eraKeep) || 8));
    const local = mem.arcs.filter(a => !a.carried).sort((a, b) => a.from - b.from);
    if (local.length <= keep) return false;
    const folding = local.slice(0, Math.max(3, local.length - keep + 2));
    const directive = '\n\nThese are the OLDEST records of a long story, being folded into its single standing "story so far". Up to 10 PLOT bullets. Spend them on what the whole story still stands on: how the characters met and what they became to each other, the turning points, lasting promises, secrets and who holds them, deaths, and anything still unresolved. Let routine scenes go.';
    const text = await this.arcText(chat, folding, signal, { extra: directive, max: 2800 });
    if (!text || (this.get(mem.id) || mem) !== mem) return false;
    const ids = new Set(folding.map(a => a.id));
    mem.arcs = [...mem.arcs.filter(a => !ids.has(a.id)), { id: 'a' + uid(), saga: true, from: folding[0].from, to: folding[folding.length - 1].to, text, src: folding.flatMap(a => (Array.isArray(a.src) && a.src.length ? a.src : [{ from: a.from, to: a.to, text: a.text }])) }];
    this.logActivity('summary', `가장 오래된 연대기 ${folding.length}개를 '옛 이야기'로 접었어요`);
    return true;
  },
  /** 서고 정리 대상: 고정 · 수동 · 최근 기억은 건드리지 않는다. 모델 입력도 등급 · 소유자별로 나눈다 — 비밀을 본 모델이 공개 요약에 섞어 쓰지 않게 (가장 큰 묶음 하나, 120개까지) */
  consolidationCandidates(mem) {
    const T = mem.turns.length, scopes: MemItem[][] = [];
    for (const m of mem.memories.filter(m => !m.pinned && !m.manual && !m.disabled && T - 1 - (m.turn ?? T) >= 4)) { const group = scopes.find(rows => sameKnowledgeScope(rows[0], m)); if (group) group.push(m); else scopes.push([m]); }
    return (scopes.sort((a, b) => b.length - a.length)[0] || []).slice(0, 120);
  },
  /**
   * 서고 정리 (기억 통합 — 중복 병합 · 소음 제거 · 중요도 재조정). 건네받은 서고(mem)를 바로 고친다 — 검토가 필요하면 부르는 쪽이 초안(snapshot)을 넘기고 diff 로 비교한다.
   * 반환: { merged, dropped, reweighted } 또는 null(대상이 12개 미만)
   */
  async runConsolidation(chat, mem, signal) {
    const candidates = this.consolidationCandidates(mem); if (candidates.length < 12) return null;
    const idMap = new Map(candidates.map((m, i) => [`m${i + 1}`, m]));
    const response = await this.call(chat, MP.CURATOR_PROMPT, [...idMap].map(([tag, m]) => `[${tag}] (${m.kind}, t${(m.turn ?? 0) + 1}, imp ${Number(m.importance).toFixed(2)}) ${m.summary}`).join('\n'), 8000, signal);
    const plan = parseLoose(response) as CuratorPlan | null;
    if (!plan || typeof plan !== 'object') {   // 무엇을 만져야 할지 알 수 있게 — 가장 흔한 원인(추론 모델이 사고에 출력 상한을 다 써서 응답이 잘림)을 짚어 준다
      const head = cleanStr(response, 300); console.warn('[장기기억] 서고 정리: 사서 응답을 JSON 으로 읽지 못했습니다. 응답 앞부분:', head || '(빈 응답)');
      throw new Error(head ? '사서 응답을 JSON으로 읽지 못했습니다 (응답이 중간에 잘렸을 수 있습니다 — 설정 탭의 "사고 토큰 여유분"을 늘려 보세요)' : '사서 응답이 비어 있습니다 (추론 모델이 사고에 출력 상한을 다 썼을 수 있습니다 — 설정 탭의 "사고 토큰 여유분"을 늘려 보세요)');
    }
    const stats = { merged: 0, dropped: 0, reweighted: 0 }, removeIds = new Set<string>(), mergedKeepIds = new Set<string>(), tagOf: (t: unknown) => MemItem | undefined = t => idMap.get(String(t || '').trim());
    for (const mg of list(plan.merge).slice(0, 20) as CuratorMerge[]) {
      const keep = tagOf(mg?.keep), absorb = [...new Set(list(mg?.absorb))].map(tagOf).filter(m => m && m !== keep && !removeIds.has(m.id) && sameKnowledgeScope(keep || {}, m)) as MemItem[];
      if (!keep || removeIds.has(keep.id) || !absorb.length) continue;
      if (absorb.length !== new Set(list(mg.absorb).map(String)).size) continue;   // 일부만 허용된 병합의 요약에는 제외된 비밀이 섞일 수 있다 — 병합 전체를 거부한다
      mergedKeepIds.add(keep.id);
      const newSummary = cleanStr(mg?.summary, 300); if (newSummary) keep.summary = newSummary;
      for (const a of absorb) {   // 흡수되는 기억의 인물 · 태그 · 단서를 합치고, 중요도는 최댓값
        keep.entities = [...new Set([...(keep.entities || []), ...(a.entities || [])])].slice(0, 8); keep.tags = [...new Set([...(keep.tags || []), ...(a.tags || [])])].slice(0, 8); keep.hints = [...new Set([...(keep.hints || []), ...(a.hints || [])])].slice(0, 6);
        keep.importance = Math.max(keep.importance, a.importance); removeIds.add(a.id);
      }
      delete keep.av; delete keep.acv;   // 임베딩은 다음 계산 때 다시
      stats.merged += absorb.length;
    }
    for (const tag of list(plan.drop).slice(0, 30)) { const m = tagOf(tag); if (m && !removeIds.has(m.id) && !mergedKeepIds.has(m.id)) { removeIds.add(m.id); stats.dropped++; } }
    for (const rw of list(plan.reweight).slice(0, 40) as CuratorReweight[]) { const m = tagOf(rw?.id), imp = Number(rw?.importance); if (m && !removeIds.has(m.id) && rw?.importance != null && Number.isFinite(imp)) { m.importance = Math.max(0, Math.min(1, imp)); stats.reweighted++; } }
    if (removeIds.size) mem.memories = mem.memories.filter(m => !removeIds.has(m.id));
    return stats;
  },
  consolidate(chat, mem, signal) { return this.runConsolidation(chat, mem, signal); },
  /** N턴마다 자동 서고 정리 (설정 consolidateEvery, 0 = 끔). 모델 결과는 초안에만 적용하고, 그사이 서고가 바뀌지 않았을 때만 복구 지점을 남기고 바꿔 끼운다. 이어서 묶음을 사건별로 다시 묶는다 */
  async maybeConsolidate(chat, mem, signal) {
    const every = +this.cfg().consolidateEvery || 0; if (every < 1) return;
    if (mem.turns.length - (mem.consolidatedAt || 0) < every) return;
    mem.consolidatedAt = mem.turns.length;   // 실패해도 다음 주기까지 기다린다 (호출 폭주 방지)
    try {
      const sig = () => mem.memories.map(m => `${m.id}\u0001${m.summary}\u0001${m.importance}\u0001${m.disabled ? 1 : 0}${m.pinned ? 1 : 0}`).join('\u0002'), baseline = sig();
      const draft = { ...mem, memories: mem.memories.map(m => ({ ...m })) };
      const stats = await this.runConsolidation(chat, draft, signal);
      if (stats && (stats.merged || stats.dropped || stats.reweighted)) {
        if ((this.get(mem.id) || mem) !== mem || sig() !== baseline) throw new Error('정리하는 동안 서고가 바뀌었습니다. 다음 주기에 다시 정리합니다.');
        await this.checkpoint(mem, '자동 서고 정리 전').catch(() => { });
        mem.memories = draft.memories;
        console.info(`[장기기억] 서고 정리: 병합 ${stats.merged} · 정리 ${stats.dropped} · 재조정 ${stats.reweighted}`);
        await this.embedMemories(chat, mem, { signal }).catch(e => console.warn('[장기기억] 임베딩', e));
      }
    } catch (e: any) { if (e?.name === 'AbortError' || signal?.aborted) throw e; console.warn('[장기기억] 서고 정리 실패 (다음 주기에 재시도):', e); }
    try { const merged = await this.regroupChunksIntoArcs(chat, mem, signal); if (merged) console.info(`[장기기억] 서고 정리: 묶음 재그룹 — 연대기 ${merged}개로 병합`); }
    catch (e: any) { if (e?.name === 'AbortError' || signal?.aborted) throw e; console.warn('[장기기억] 묶음 재그룹 실패 (다음 주기에 재시도):', e); }
  },
  /** 서사 시계 재계산 — 다시 색인하지 않고, 기록된 턴을 처음부터 이어 읽으며 이야기 속 흐른 시간을 다시 잰다. 반환 { before, after, failed(실패한 묶음 수) }, 재계산할 턴이 없으면 null */
  async recalClock(chat, mem, { signal, onProgress } = {}) {
    if (G.clockRecalBusy) throw new Error('서사 시계를 이미 재계산하는 중입니다.');
    const turns = mem.turns.map((t, i) => ({ t, i })).filter(x => x.t.digest); if (turns.length < 2) return null;
    G.clockRecalBusy = true;
    try {
      if (G.busy > 0) await G.queue;   // 진행 중 · 대기 중인 턴 기록이 끝나길 기다렸다 시작 — 사서 호출과 재계산 배치가 겹치면 양쪽 다 실패할 수 있다
      const before = mem.turns.reduce((a, t) => a + (t.days || 0), 0), up = new Map<number, number>(), B = 80; let failed = 0;
      for (let i = 0; i < turns.length; i += B) {
        onProgress?.(Math.min(i + B, turns.length), turns.length);
        // 배치 경계에서 시간이 끊기지 않게 직전 턴 기록 몇 개를 문맥으로 붙인다
        const lines = [...turns.slice(Math.max(0, i - 3), i).map(x => `(context) [t${x.i + 1}] ${x.t.digest}`), ...turns.slice(i, i + B).map(x => `[t${x.i + 1}] ${x.t.digest}`)].join('\n');
        try { const j = parseLoose(await this.call(chat, MP.CLOCK_RECAL_PROMPT, lines, 4000, signal)); if (!j) { failed++; continue; } for (const [k, v] of Object.entries(j)) { const m = /^t(\d+)$/.exec(str(k)); if (m) up.set(+m[1] - 1, toDays(v)); } }
        catch (e: any) { if (e.name === 'AbortError' || signal?.aborted) throw e; failed++; console.error('[장기기억] 서사 시계 재계산 배치 실패:', e); }
      }
      if (!up.size) throw new Error('서사 시계 재계산에 실패했습니다. (모델 응답 오류)');
      mem.turns.forEach((t, i) => { if (up.has(i)) t.days = up.get(i); });   // 응답에 없는 턴은 기존 값을 유지한다 (0 으로 밀어 버리지 않는다)
      mem.clockDays = mem.turns.reduce((a, t) => a + (t.days || 0), 0);
      await this.save(mem);
      return { before, after: mem.clockDays, failed };
    } finally { G.clockRecalBusy = false; }
  },
  recalibrateStoryClock(chat, mem, opts) { return this.recalClock(chat, mem, opts); },
  /** 요약이 맡은 옛 메시지를 숨긴다 (최근 preserveRecent 개는 남긴다). 반환: 숨긴 수 — 저장은 부른 쪽이 */
  autoHide(chat, msgs) {
    const cfg = this.cfg(), mem = this.get(chat.id); if (!mem) return 0;
    const covered = Math.max(-1, ...mem.chunks.map(c => c.to), ...mem.arcs.filter(a => !a.carried).map(a => a.to)); if (covered < 0) return 0;
    const order = new Map(msgs.map((m, i) => [m.id, i]));
    const last = Math.max(-1, ...mem.turns.slice(0, covered + 1).map(t => order.get(t.msgId) ?? -1));
    const end = Math.min(last, msgs.length - Math.max(1, +cfg.preserveRecent || 6) - 1); let n = 0;
    for (let i = 0; i <= end; i++) if (!msgs[i].hidden) { msgs[i].hidden = true; msgs[i].memHidden = true; n++; }
    return n;
  },

  applyAutoHide(chat, msgs) { const cfg = this.cfg(); return cfg.enabled && cfg.autoHide ? this.autoHide(chat, msgs) : 0; },
  /** 자동 숨김으로 가린 메시지를 다시 보인다 (all: 직접 숨긴 것까지 전부). 반환: 보이게 한 수 — 저장은 부른 쪽이 */
  unhideAllMessages(chat, msgs, { all = false } = {}): Keep<typeof chat, number> {
    let n = 0; for (const m of msgs || []) if (m?.hidden && (all || m.memHidden)) { m.hidden = false; delete m.memHidden; n++; }
    return n;
  },

  // ════════ 임베딩 (선택): OpenAI 호환 /embeddings ════════
  /** 글 목록 → 정규화한 벡터 목록. 실패하면 오류를 던진다. timeoutMs: 이 시간 안에 끝나지 않으면 끊는다 */
  embedSig() { const e = this.cfg().embed, c = S.get('conns', e.connId); return c ? `${embedKind(c, e.kind || 'auto')}:${embedModel(c, e.kind || 'auto', e.model)}` : ''; },
  vecOk(avm) { const sig = this.embedSig(), raw = String(this.cfg().embed.model || '').trim(); return !!avm && (avm === sig || (!!raw && avm === raw)); },
  async embedCall(texts, signal, { timeoutMs = 0, query = false } = {}) {
    const e = this.cfg().embed, conn = S.get('conns', e.connId);
    if (!conn) throw new Error('임베딩에 쓸 연결을 골라 주세요.');
    return embedTexts(texts, { conn, model: e.model, kind: e.kind || 'auto', signal, timeoutMs, query });   // 소스별 요청 모양은 embed.js 가 맡는다
  },
  /**
   * 아직 벡터가 없는 기억을 임베딩한다 (all: 전부 다시) — 요약 축(av)과 단서 축(acv) 모두. 임베딩이 켜져 있으면 회상의 모든 축이 그 임베딩을 따라간다.
   * 반환: 계산한 기억 수
   */
  async embedMemories(chat, mem, { all = false, signal, onProgress } = {}): Promise<Keep<typeof chat, number>> {
    const e = this.cfg().embed; if (e.mode !== 'api') return 0;
    const todo = mem.memories.filter(m => all || !(m.av instanceof Float32Array) || !this.vecOk(m.avm)); if (!todo.length) return 0;
    for (let i = 0; i < todo.length; i += 32) {
      const part = todo.slice(i, i + 32), texts: string[] = [], slots: [MemItem, 'av' | 'acv'][] = [];
      for (const m of part) { texts.push(clip(indexText(m), 1500)); slots.push([m, 'av']); const cue = cueText(m); if (cue.length >= 4) { texts.push(clip(cue, 1500)); slots.push([m, 'acv']); } else delete m.acv; }
      const vs = await this.embedCall(texts, signal, { timeoutMs: 30000 });   // 멈춘 임베딩 서버가 기록 대기열을 붙잡지 못하게
      slots.forEach(([m, k], n) => { m[k] = vs[n]; m.avm = this.embedSig(); }); onProgress?.(Math.min(i + 32, todo.length), todo.length);
    }
    await this.save(mem);
    return todo.length;
  },
  /**
   * 질의 임베딩 (같은 글은 다시 부르지 않는다). 응답 생성을 붙잡고 기다리게 하는 경로라 오래 매달리지 않는다 — 8초 · 재시도 없음, 실패하면 null (내장 검색으로 진행).
   * 결과는 캐시에 남아, 대기 상한을 넘겨 늦게 도착해도 다음 턴부터 쓰인다
   */
  async embedQueriesViaApi(texts) {
    const e = this.cfg().embed; if (e.mode !== 'api') return null;
    const key: (t: string) => string = t => `${e.model}\u0001${t}`, misses = [...new Set(texts.filter(t => !queryEmbedCache.has(key(t)) && !pendingEmbeds.has(key(t))))];
    if (misses.length) {
      const job = this.embedCall(misses, undefined, { timeoutMs: 8000, query: true }).then(vecs => {
        misses.forEach((t, i) => queryEmbedCache.set(key(t), vecs[i]));
        if (queryEmbedCache.size > 60) for (const k of [...queryEmbedCache.keys()].slice(0, 30)) queryEmbedCache.delete(k);
        return true;
      }).catch(err => { console.warn('[장기기억] 질의 임베딩 실패 (내장 검색으로 진행)', err); return false; }).finally(() => { for (const t of misses) pendingEmbeds.delete(key(t)); });
      for (const t of misses) pendingEmbeds.set(key(t), job);
    }
    const waits = [...new Set(texts.map(t => pendingEmbeds.get(key(t))).filter(Boolean))];   // 이미 떠난 호출(메시지를 보낼 때 시작해 둔 것 포함)은 그 답을 기다린다
    if (waits.length && (await Promise.all(waits)).includes(false)) return null;
    return texts.map(t => queryEmbedCache.get(key(t)) || null);
  },
  /** 이미 계산해 둔 질의 벡터 (없으면 null) — 장부를 지을 때는 기다리지 않고 이것만 본다 */
  queryVec(text) { const e = this.cfg().embed; return e.mode === 'api' && text ? queryEmbedCache.get(`${e.model}\u0001${text}`) || null : null; },
  /** 이번 회상이 임베딩 API 에 물을 글들: 질의 · 보조 질의 · 직전 장면 */
  recallQueryTexts(inp) {
    const n = this.cfg().multiQueryRecent, scene = String(inp.scene || '').trim() ? String(inp.scene).slice(0, 2400) : '';
    return [inp.query, ...inp.aux.slice(0, n), ...(scene ? [scene] : [])].filter(t => String(t || '').trim());
  },
  /** 답변이 끝난 뒤, 다음 답변에서 쓰일 질의 벡터(직전 장면 · 직전 입력)를 미리 계산해 둔다 */
  async embedQuery(chat, msgs, signal): Promise<Keep<typeof signal, void>> {
    if (this.cfg().embed.mode !== 'api') return;
    const mem = await this.load(chat.id), texts = this.recallQueryTexts(this.recallInputs(mem, null, { msgs })); if (!texts.length) return;
    await this.embedQueriesViaApi(texts);
  },
  /**
   * 답변 전 준비. 장부는 프롬프트를 조립할 때 기다림 없이 지어야 하므로, 임베딩 왕복(질의 임베딩 · 옛 묶음 요약의 벡터 채우기)은 여기서 미리 한다.
   * 설정 recallWaitSec 초를 넘기면 기다리지 않고 돌아간다 — 내장 검색 결과만으로 바로 진행하고, 호출은 뒤에서 끝나 다음 턴부터 쓰인다. 0 = 상한 없음.
   * 대화 화면이 프롬프트를 조립하기 직전에 await 한다. 반환: { took(ms), timedOut }
   */
  async prepare(chat, msgs, { type = '', background = false } = {}) {
    const cfg = this.cfg(), none: PrepResult = { took: 0, timedOut: false };
    if (!cfg.enabled || cfg.embed.mode !== 'api' || !chat) return none;
    const mem = await this.load(chat.id); if (overrides.get(chat.id) || mem.packetPin?.text) return none;   // 고친 · 고정한 장부를 그대로 실을 때는 회상하지 않는다
    const waitSec = Math.max(0, Number(cfg.recallWaitSec) || 0), began = Date.now(), deadline = waitSec > 0 ? began + waitSec * 1000 : 0; let timedOut = false;
    const within = async <T,>(start: () => Promise<T>, fallback: T | null = null): Promise<T | null> => {   // 기다림 상한 안에서만
      if (!deadline) return await start();
      const left = deadline - Date.now(); if (left <= 0) { timedOut = true; return fallback; }
      const r = await withDeadline(start(), left, fallback) as { value: T | null; timedOut: boolean }; if (r.timedOut) timedOut = true; return r.value;
    };
    const inp = this.recallInputs(mem, null, { msgs, type }), texts = this.recallQueryTexts(inp);
    const qv = texts.length ? await within(() => this.embedQueriesViaApi(texts)) : null;
    // 주입 창에서 밀려난 옛 묶음 요약의 벡터 — 생성 직전 경로이므로 짧게만 시도하고 안 되면 다음 기회로 미룬다 (벡터 캐시일 뿐이라 화면을 다시 그리지 않는다)
    const missing = mem.chunks.slice(0, -3).filter(c => !(c.av instanceof Float32Array) || !this.vecOk(c.avm));
    if (qv?.[0] && missing.length && String(inp.query).trim().length >= 4) {
      const fill = () => this.embedCall(missing.map(c => String(c.text || '').slice(0, 2000)), undefined, { timeoutMs: 8000 }).then(vs => { missing.forEach((c, i) => { c.av = vs[i]; c.avm = this.embedSig(); }); if (this.get(mem.id) === mem) DB.put('mem', mem).catch(() => { }); return true; }).catch(() => false);
      await within(fill, false);
    }
    const out: PrepResult = { took: Date.now() - began, timedOut, waitSec, at: Date.now() };
    if (!background) preps.set(chat.id, out);
    return out;
  },

  // ════════ 회상 ════════
  /** 이야기 시계: 각 턴 시점에서 지금까지 흐른 이야기 속 시간(일수). 턴 T 의 나이 = T 뒤 턴들의 days 합 */
  storyAges(mem) { const map = new Map<number, number>(); let acc = 0; for (let i = mem.turns.length - 1; i >= 0; i--) { map.set(i, acc); acc += mem.turns[i].days || 0; } return map; },
  buildStoryAgeMap(mem) { return this.storyAges(mem); },
  /** 화석화: 턴 나이에 따른 최신성 가중치 (설정 fossil: { settling, fossilized, deep }) */
  fossilWeight(this: MemoryApi, age, cfg = this.cfg()) { const f = cfg.fossil; if (age < f.settling) return 1.0; if (age < f.fossilized) return 0.7; if (age < f.deep) return 0.35; return 0.12; },
  /**
   * 이 대화의 시점에서 비공개 · 비밀 기억을 볼 수 있는 이름들 (소문자).
   * 소설 · 풀사칭: 서술자가 참고할 수 있어도 등장인물의 지식은 합치지 않는다 — 소유자와 아는 사람 표기를 그대로 둔다.
   * 그룹의 자동 모드는 공개 기억만: 다음에 누가 말할지 알 수 없는 시점에는 비밀을 합치지 않는다
   */
  authorizedEntities(chat, mem) {
    const names = new Set<string>(), cfg = this.cfg(); if (cfg.authorizePrivate === false) return names;
    const p = this.perspective(mem);
    if (p === NARRATOR) { for (const m of mem.memories) { if (m.disabled) continue; if (m.owner) names.add(low(m.owner)); for (const k of m.knowers || []) names.add(low(k)); } return names; }
    const owner = p === PUBLIC_ONLY ? '' : p || ((chat?.charIds || []).length === 1 ? S.get('chars', chat!.charIds[0])?.name || '' : '');
    if (owner) { names.add(low(owner)); const card = mem.cast.find(c => ekey(c.name) === ekey(owner) || (c.aka || []).some(a => ekey(a) === ekey(owner))); if (card) for (const n of [card.name, ...(card.aka || [])]) names.add(low(n)); }
    return names;
  },
  authorized(chat, mem) { return this.authorizedEntities(chat, mem); },
  /** 이 시점(auth)이 비공개 기억을 아는가 — 소유자이거나, 아는 사람 목록에 있거나 */
  knowsMemory(m, auth) { if (m.owner && auth.has(low(m.owner))) return true; return (m.knowers || []).some(k => auth.has(low(k))); },
  /** 드문 공통 단서로 이어진 기억을 더 찾는다. 직접적이고 흔치 않은 증거만 잇고, 등급 · 소유자 경계는 넘지 않으며, 연상을 다시 연상으로 잇지 않는다 */
  findAssociations(mem, memories, seeds, { limit = 2 } = {}) {
    const generic = new Set(['manual', 'carried', 'episode_raw', 'event', 'relationship', 'fact', 'secret', '사건', '관계', '기억']);
    const knowledgeKey: (m: MemItem) => string = m => JSON.stringify([m.visibility || 'public', normScope(m.owner)]), canonicalName: (n: string) => string = n => ekey(this.canonName(mem, n));
    const rows = memories.filter(m => !m.disabled), cues = new Map<string, Set<string>>(rows.map(m => [m.id, new Set<string>([...(m.tags || []), ...(m.hints || [])].map(normScope).filter(s => s.length >= 2 && !generic.has(s)))]));
    const scopes = new Map<string, { size: number; frequency: Map<string, number> }>();
    for (const m of rows) { const k = knowledgeKey(m); if (!scopes.has(k)) scopes.set(k, { size: 0, frequency: new Map() }); const sc = scopes.get(k)!; sc.size++; for (const t of cues.get(m.id)!) sc.frequency.set(t, (sc.frequency.get(t) || 0) + 1); }
    const seedIds = new Set(seeds.map(s => s.m.id)), links: AssocLink[] = [];
    for (const m of rows) {
      if (seedIds.has(m.id) || m.pinned) continue;
      const entities = new Set((m.entities || []).map(canonicalName)); let best: AssocLink | null = null;
      for (const seed of seeds.slice(0, 3)) {
        if (seed.score < 0.18 || !sameKnowledgeScope(m, seed.m)) continue;
        const scope = scopes.get(knowledgeKey(m))!, shared = [...(cues.get(m.id) || [])].filter(t => cues.get(seed.m.id)?.has(t) && scope.frequency.get(t)! <= Math.max(2, Math.ceil(scope.size * 0.12)));
        const person = (seed.m.entities || []).some(e => entities.has(canonicalName(e)));
        if (shared.length < 2 && !(shared.length && person)) continue;
        const score = Math.min(0.48, seed.score * 0.65 + Math.min(0.12, shared.length * 0.04));
        if (!best || score > best.score) best = { m, score, via: seed.m.id, cues: shared.slice(0, 3) };
      }
      if (best) links.push(best);
    }
    return links.sort((a, b) => b.score - a.score || String(a.m.id).localeCompare(String(b.m.id))).slice(0, limit);
  },
  associations(mem, rows, seeds, limit = 2) { return this.findAssociations(mem, rows, seeds, { limit }); },
  /**
   * 회상의 입력. 숨긴 메시지 · 시스템 메시지 · 막간은 빼고, 연출 계획 · 상태창 · 태그를 걷어 낸 이야기만 본다.
   * 반환 { query(주 질의), aux(그 앞의 사용자 입력들 — 최신부터), scene(직전 답변 — 짧은 입력에도 장면이 이어지게), recentText(최근 4개 메시지, 소문자) }.
   * 소설 · 풀사칭: 오래전 사용자 답장 대신 마지막 장면의 끝을 질의로 삼고, 보조 질의는 쓰지 않는다.
   * opt: { msgs(대화 메시지 — 있으면 이쪽을 본다), type('regen' · 'swipe' 면 다시 쓰는 마지막 답변은 뺀다), query(직접 준 검색어) }
   */
  recallInputs(mem, history, opt = {}) {
    if (opt.query != null) return { query: String(opt.query), aux: [], scene: '', recentText: '' };
    const narrator = this.perspective(mem) === NARRATOR, want = Math.max(0, Math.round(Number(this.cfg().multiQueryRecent) || 0)) + 1, byMsgs = Array.isArray(opt.msgs);
    let src: Line[] = byMsgs ? opt.msgs! : (history || []);
    if (byMsgs && (opt.type === 'regen' || opt.type === 'swipe') && src[src.length - 1]?.role === 'assistant') src = src.slice(0, -1);
    const raw: (m: Line) => string = m => byMsgs ? msgText(m as Msg) : String(m.content || ''), usable: (m: Line) => boolean = m => m && m.role !== 'system' && !(byMsgs && (m.hidden || this.isSideMessage(m as Msg)));
    const users: string[] = [], last4: string[] = []; let scene: string | null = null, lastAny: string | null = null, lastText = '', lastRole = '';
    for (let i = src.length - 1, seen = 0; i >= 0 && seen < 400; i--) {   // 끝에서부터 필요한 만큼만 읽는다
      const m = src[i]; if (!usable(m)) continue; seen++;
      const r = raw(m); if (lastAny == null) lastAny = visibleProse(r);
      if (last4.length < 4) last4.unshift(visibleProse(r));
      if (!r) continue;
      if (!lastText) { const t = visibleProse(r).trim(); if (t) { lastText = t; lastRole = m.role; } }
      if (m.role === 'user') { if (users.length < want) users.push(visibleProse(r)); }
      else if (scene == null) scene = visibleProse(r);
      if (users.length >= want && scene != null && last4.length >= 4 && lastText) break;
    }
    scene = scene || ''; if (narrator) scene = scene.slice(-2400);
    const query = narrator ? (lastRole === 'user' ? lastText : lastText.slice(-2400)) : (users[0] || lastAny || '');
    return { query, aux: narrator ? [] : users.slice(1), scene, recentText: low(last4.join('\n')) };
  },
  /**
   * 지금 장면과 맞닿은 기억 고르기: 문맥 유사도 0.62 + 어휘 0.18 + 중요도 0.12 + 최신성 0.08 (+ 인물 0.08 · 단서 0.07 · 장면 인물 0.05), 겹치지 않게(MMR) · 종류 · 턴별 상한.
   * 프롬프트 조립은 기다릴 수 없으므로 임베딩 API 축은 미리 계산해 둔 질의 벡터(prepare · embedQuery)가 있을 때만 쓴다 — 없으면 내장 검색만으로 고른다.
   * 반환 { selected, pinned, triggered, hidden, trace(왜 골랐는지), query, inputs }
   */
  recallEx(chat, mem, history, opt = {}) {
    const cfg = this.cfg(), T = mem.turns.length, inp = opt.inputs || this.recallInputs(mem, history, opt), query = String(inp.query || '');
    const out: RecallResult = { selected: [], pinned: [], triggered: [], hidden: 0, trace: new Map(), query, inputs: inp };
    const active = mem.memories.filter(m => !m.disabled); if (!active.length) return out;
    // 볼 수 있는 기억만 후보: 비공개 기억은 소유자, 또는 "아는 사람"으로 적힌 인물의 시점에서만
    const auth = this.authorizedEntities(chat, mem), cands: Cand[] = [], eligible: MemItem[] = [];
    const aux = inp.aux.slice(0, cfg.multiQueryRecent), sceneText = String(inp.scene || '');
    const qv = vec(query), auxV = aux.map(vec), sv = sceneText.trim() ? vec(sceneText.slice(0, 2400)) : null;   // 장면 연속 보정: 입력이 짧아도 직전 답변이 담은 장면으로 회상을 이어간다
    const qT = new Set(low(query).match(/[\p{L}\p{N}]+/gu) || []), qG = grams(query), ql = low(query);
    const pastQ = PAST_QUERY_RE.test(ql);   // 과거 회상형 질의면 최신성 페널티(화석화)를 걸지 않는다 — 오래된 기억도 동등하게 겨룬다
    const ages = cfg.storyClock !== false ? this.storyAges(mem) : null;   // 이야기 속에서 흐른 시간도 노화 축으로 (시간을 자주 건너뛰는 롤플 대응)
    const sceneQuery = sv ? sceneText.slice(0, 2400) : '', rawFloor = Number(cfg.embed.floor), floor = Number.isFinite(rawFloor) ? Math.max(0, Math.min(0.9, rawFloor)) : 0.35;
    const apiQ = this.queryVec(query), apiAux = aux.map(t => this.queryVec(t)), apiS = sceneQuery ? this.queryVec(sceneQuery) : null, model = cfg.embed.model;
    // 장면 인물 사전확률: 지금 장면에 있는 인물(이름 · 다른 이름이 최근 글에 나옴). 한국어 롤플은 대명사 · 호칭 생략이 많아 질의에 이름이 없어도 장면 속 인물과 얽힌 기억이 관련 있을 확률이 높다
    const presence: Keep<typeof model, string> = low(`${query}\n${inp.aux.join('\n')}\n${sceneText}`), present = new Set<string>();
    for (const c of mem.cast) if (!c.disabled && [c.name, ...(c.aka || [])].some(n => n && String(n).length >= 2 && presence.includes(low(n)))) present.add(low(c.name));
    for (const m of active) {
      if (m.visibility !== 'public' && !this.knowsMemory(m, auth)) { out.hidden++; continue; }
      eligible.push(m);
      if (m.pinned) { out.pinned.push(m); out.trace.set(m.id, { reason: '고정 기억', mode: 'pinned' }); continue; }
      if (m.trigger) { try { if (new RegExp(m.trigger, 'i').test(ql)) { out.triggered.push(m); out.trace.set(m.id, { reason: '입력의 트리거 일치', mode: 'trigger' }); continue; } } catch { /* 잘못된 정규식은 무시 */ } }
      const v = vecOf(m); let c = cos(qv, v.sum);
      for (const a of auxV) c = Math.max(c, cos(a, v.sum) * 0.92);
      if (sv) c = Math.max(c, cos(sv, v.sum) * 0.85);
      if (v.cue) { let cc = cos(qv, v.cue); if (sv) cc = Math.max(cc, cos(sv, v.cue) * 0.85); c = Math.max(c, cc * 0.97); }   // 단서 축: 인용 · 단서는 장면의 말 그대로라 입력과 결이 맞는다
      // 임베딩이 양쪽에 다 있으면 의미 유사도를 보정 스케일로 — 요약 축과 단서 축 모두에 질의 · 보조 질의 · 장면을 각각 잰다 (감쇠는 내장 축과 같은 계수)
      let sem = 0;
      if ((apiQ || apiS) && m.av instanceof Float32Array && this.vecOk(m.avm)) {
        sem = apiQ ? calibrate(cos(apiQ, m.av), floor) : 0;
        for (const aq of apiAux) if (aq) sem = Math.max(sem, calibrate(cos(aq, m.av), floor) * 0.92);
        if (apiS) sem = Math.max(sem, calibrate(cos(apiS, m.av), floor) * 0.85);
        if (m.acv instanceof Float32Array) { if (apiQ) sem = Math.max(sem, calibrate(cos(apiQ, m.acv), floor) * 0.97); if (apiS) sem = Math.max(sem, calibrate(cos(apiS, m.acv), floor) * 0.85 * 0.97); }
        c = Math.max(c, sem);
      }
      // 어휘 축: 단어 일치와 글자 조각 일치 중 더 강하게 닿는 쪽 — 한국어는 조사 · 어미 변형 때문에 단어 축만으로는 절반이 샌다
      const idx = indexText(m), lex = Math.max(lexical(qT, idx), gramOverlap(qG, idx) * 0.9);
      const hitEnts = (m.entities || []).filter(e => e && ql.includes(low(e))), entityHit = hitEnts.length > 0;
      const hintHit = (m.hints || []).some(h => { const hl = low(h); return hl.length >= 2 && ql.includes(hl) && !hitEnts.some(e => low(e).includes(hl)); });   // 이미 맞은 인물 이름에 통째로 든 단서는 같은 일치의 중복이다
      const presenceHit = !entityHit && present.size > 0 && (m.entities || []).some(e => present.has(low(e)));
      // 관문: 사전확률만으로는 절반의 의미 유사도라도 있어야 통과 (무관한 기억이 쏟아지지 않게)
      if (c < cfg.minCosine && lex < 0.035 && !entityHit && !hintHit && !(presenceHit && c >= cfg.minCosine * 0.5)) continue;
      const age = Math.max(0, T - 1 - (m.turn ?? T));
      let fossil = this.fossilWeight(age, cfg);   // 화석화: 턴 나이와 이야기 나이 중 더 오래됐다고 말하는 쪽 (10년을 건너뛰면 직전 턴도 옛일)
      if (ages) fossil = Math.min(fossil, storyFossilWeight(ages.get(m.turn!) ?? 0));
      if ((m.importance || 0) >= 0.75) fossil = Math.max(fossil, 0.7);   // "잊으면 이야기가 깨지는 급" 기억은 깊은 화석화를 면한다
      const rec = pastQ ? 0.55 : Math.exp(-age / 18) * fossil, bonus = (entityHit ? 0.08 : 0) + (hintHit ? 0.07 : 0) + (presenceHit ? 0.05 : 0);
      const score = 0.62 * Math.max(0, c) + 0.18 * lex + 0.12 * (m.importance || 0) + 0.08 * rec + bonus;
      if (score < cfg.minScore) continue;
      cands.push({ m, score, v: v.sum });
      out.trace.set(m.id, { mode: 'direct', score, parts: { cos: Math.max(0, c), lex, imp: m.importance || 0, rec, bonus, sem }, reason: [entityHit && '인물 일치', hintHit && '검색 힌트', presenceHit && '현재 장면의 인물', lex >= 0.035 && '어휘 일치', c >= cfg.minCosine && '문맥 유사도'].filter(Boolean).join(' · ') || '관련성 점수' });
    }
    cands.sort((a, b) => b.score - a.score);
    if (cfg.associative !== false) {
      const seeds = cands.filter(c => c.score >= Math.max(0.18, (cands[0]?.score || 0) * 0.75)).slice(0, 3);
      for (const link of this.findAssociations(mem, eligible, seeds)) {
        if (out.triggered.some(m => m.id === link.m.id)) continue;
        const ex = cands.find(c => c.m.id === link.m.id); if (ex && ex.score >= link.score) continue;
        if (ex) ex.score = link.score; else cands.push({ m: link.m, score: link.score, v: vecOf(link.m).sum });
        out.trace.set(link.m.id, { reason: `연결 단서: ${link.cues.join(', ')}`, mode: 'association', via: link.via, score: link.score });
      }
      cands.sort((a, b) => b.score - a.score);
    }
    // MMR 다양화 + 종류 · 턴별 상한. 직접 적은 · 이어받은 기억은 턴 번호가 의미 없으므로 턴 상한을 나눠 쓰지 않는다
    const pool = cands.slice(0, 80), picked: Cand[] = [], perKind: Record<string, number> = {}, perTurn: Record<string | number, number> = {}, lam = cfg.mmrLambda, topK = opt.topK || cfg.topK, tk: (m: MemItem) => string | number = m => m.manual ? m.id : m.turn!;
    while (picked.length < topK && pool.length) {
      let best = -1, bestV = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        const x = pool[i]; if ((perKind[x.m.kind] || 0) >= cfg.maxPerKind || (perTurn[tk(x.m)] || 0) >= cfg.maxPerTurn) continue;
        let maxSim = 0, dupe = false;
        for (const p of picked) { const s = cos(x.v, p.v); maxSim = Math.max(maxSim, s); if (tk(p.m) === tk(x.m) && s > 0.82) { dupe = true; break; } }   // 같은 턴의 사실상 같은 기억(원문 발췌 vs 사서의 사건 기억)은 하나만
        if (dupe) continue;
        const val = lam * x.score - (1 - lam) * maxSim; if (val > bestV) { bestV = val; best = i; }
      }
      if (best < 0) break;
      const x = pool.splice(best, 1)[0]; perKind[x.m.kind] = (perKind[x.m.kind] || 0) + 1; perTurn[tk(x.m)] = (perTurn[tk(x.m)] || 0) + 1; picked.push(x);
    }
    out.selected = picked.map(x => x.m);
    return out;
  },
  retrieveMemories(chat, mem, history, opt) { return this.recallEx(chat, mem, history, opt); },
  recall(mem, history) { const r = this.recallEx(S.get('chats', mem.id), mem, history); return [...r.pinned, ...r.triggered, ...r.selected]; },
  /** 주입 창(마지막 3개) 밖으로 밀려난 묶음 요약 가운데 지금 질의와 가장 맞는 하나 (문턱 미달이면 null). 기억 조각은 파편이지만 묶음 요약은 그 시절의 이어진 맥락을 준다 */
  pickRecalledChapter(mem, query, sceneText) {
    const old = mem.chunks.slice(0, -3), q = String(query || '').trim(); if (!old.length || q.length < 4) return null;
    const qv = vec(q), sv = String(sceneText || '').trim() ? vec(String(sceneText).slice(0, 2400)) : null, qT = new Set(low(q).match(/[\p{L}\p{N}]+/gu) || []), qG = grams(q), pastQ = PAST_QUERY_RE.test(low(q));
    const cfg = this.cfg(), rawFloor = Number(cfg.embed.floor), floor = Number.isFinite(rawFloor) ? Math.max(0, Math.min(0.9, rawFloor)) : 0.35;
    const apiQ = this.queryVec(q) || this.queryVec(String(query || '')), apiS = sv ? this.queryVec(String(sceneText).slice(0, 2400)) : null;   // 임베딩이 켜져 있으면 이 축도 그 임베딩을 따른다 (벡터는 prepare 가 채워 둔다)
    let best = null, bestScore = 0;
    for (const c of old) {
      const v = this.chapterVec(c); let cs = cos(qv, v);
      if (sv) cs = Math.max(cs, cos(sv, v) * 0.85);
      if (c.av instanceof Float32Array && this.vecOk(c.avm) && (apiQ || apiS)) { if (apiQ) cs = Math.max(cs, calibrate(cos(apiQ, c.av), floor)); if (apiS) cs = Math.max(cs, calibrate(cos(apiS, c.av), floor) * 0.85); }
      const lex = Math.max(lexical(qT, c.text || ''), gramOverlap(qG, c.text || '') * 0.9), s = cs + lex * 2;
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return bestScore >= (pastQ ? 0.3 : 0.42) ? best : null;   // 회상형 질문이면 문턱을 낮춘다 — "그 시절" 얘기를 정면으로 묻고 있으므로
  },
  chapterVec(c) { const k = `ch:${c.id}:${(c.text || '').length}`; if (!dcache.has(k)) { if (dcache.size > 4000) dcache.clear(); dcache.set(k, vec(String(c.text || '').slice(0, 2400))); } return dcache.get(k)!; },
  /** 자료실에서 지금 장면과 관련된 대목 고르기 → [{ title, text, score }] */
  dossierPick(mem, query, aux, max = 3) {
    const docs = (mem.dossier || []).filter(d => !d.disabled && d.chunks?.length); if (!docs.length || !str(query)) return [];
    const qv = vec(query), av = (aux || []).slice(0, 2).map(vec), qT = new Set(low(query).match(/[\p{L}\p{N}]+/gu) || []), scored: DossierExcerpt[] = [];
    for (const d of docs) d.chunks.forEach((text, i) => { const v = dvec(d.id, i, text); let c = cos(qv, v); for (const a of av) c = Math.max(c, cos(a, v) * 0.9); const score = 0.7 * Math.max(0, c) + 0.3 * lexical(qT, text); if (score >= 0.09) scored.push({ title: d.title, text, score }); });   // 관련 없는 대목은 아예 싣지 않는다
    return scored.sort((a, b) => b.score - a.score).slice(0, max);
  },
  pickDossierExcerpts(mem, query, aux, opt = {}) { return this.dossierPick(mem, query, aux, opt.max ?? 3); },
  /** 상태 보드의 scene 줄에서 지금 장면(장소 · 날짜 · 시각 · 자리에 있는 사람들 · 분위기)을 골라낸다 */
  scene(mem) {
    const pick: (slots: string[]) => string = slots => { for (let i = mem.status.length - 1; i >= 0; i--) { const s = mem.status[i]; if (low(s.entity) === 'scene' && slots.includes(low(s.slot))) return s.value; } return ''; };
    const location = pick(['location', 'place']), date = pick(['date']), time = pick(['time_of_day', 'time']), present = pick(['present']), mood = pick(['mood']);
    return { location, date, time, present, mood, any: !!(location || date || time || present) };
  },
  /** 대화에서 가장 최근 상태창 (숨긴 메시지도 본다, 막간은 뺀다). before: 이 번호 앞까지만. 반환 { msgId, mesId(메시지 번호), when, place, weather, … } 또는 null */
  latestStatus(msgs, before = msgs?.length || 0) {
    if (!Array.isArray(msgs) || this.cfg().statusMode === 'off') return null;
    const end = Math.min(msgs.length, before) - 1;
    for (let i = end; i >= 0 && i > end - 300; i--) { const bars = this.messageStatusBars(msgs[i]); if (bars.length) return { msgId: msgs[i].id, mesId: i, ...bars[bars.length - 1] }; }
    return null;
  },

  // ════════ 장부 (프롬프트에 싣는 글) ════════
  /** 회상된 기억이 그 뒤 값이 바뀐 상태의 옛 값을 담고 있으면 "당시 기준" 꼬리표를 붙인다 (id → 안내문). 장부를 지을 때마다 다시 잰다 */
  markOutdatedRecall(memories, mem) {
    const notes = new Map<string, string>(); if (!memories.length) return notes;
    const changes = mem.status.filter(s => s.prev != null && String(s.prev).length >= 2 && s.claim !== 'belief').slice(-24); if (!changes.length) return notes;   // 이전 값 이력이 있는 최근 변경만
    for (const m of memories) {
      const text = low(`${m.summary || ''} ${m.quote || ''}`);
      for (const s of changes) {
        if ((m.turn || 0) >= (s.turn || 0)) continue;   // 변경 뒤의 기억은 무관
        if (!text.includes(low(s.prev)) || text.includes(low(s.value))) continue;   // 옛 값을 말하고 새 값은 모르는 기억만
        const e = low(s.entity); if (!(e === 'scene' || (m.entities || []).some(x => low(x) === e) || text.includes(e))) continue;
        notes.set(m.id, `${s.entity}.${s.slot} is now: ${s.value}`); break;
      }
    }
    return notes;
  },
  /** 회상 한 줄. x: { ages(이야기 시계), T(지금까지의 턴 수), banned(삼갈 표현), notes(당시 기준 꼬리표) } */
  formatMemoryLine(m, withExcerpt, { ages = null, T = 0, banned = null, notes = null } = {}) {
    const visNorm = normVisibility(m.visibility);
    // 비밀은 "누가 아는가"까지 적어야 지켜진다 — 소유자만 적으면 함께 아는 인물까지 모르는 척하게 된다
    const others = (m.knowers || []).filter(k => ekey(k) !== ekey(m.owner || '')), known = others.length ? ` · also known to ${others.join(', ')}` : '';
    const vis = visNorm === 'public' ? '' : ` [${visNorm}${m.owner ? `:${m.owner}` : ''}${known}]`;
    // 인용은 짧을 때만 — 원문 발췌 기억(episode_raw)의 인용은 요약이 이미 담고 있어 싣지 않는다. 40턴이 지난 옛 대사는 모델이 되풀이하기 쉬워 요약만 남긴다 (고정 · 핵심 기억은 예외).
    // 삼갈 표현이 든 옛 대사는 걷어내면 말이 깨지므로 인용째로 뺀다
    const back = Math.max(0, T - 1 - (m.turn ?? T)), fresh = back <= 40 || m.pinned || (m.importance ?? 0) >= 0.8;
    const quote = withExcerpt && !(m.tags || []).includes('episode_raw') && fresh && m.quote && m.quote.length <= 160 && !(banned?.length && hasPhrase(m.quote, banned)) ? m.quote : null;
    const dated = notes?.has(m.id) ? ` [as of then — ${notes.get(m.id)}]` : '';
    const d = ages?.get(m.turn!) ?? 0, agoNote = d >= 1 ? ` · ~${ago(d)} ago in-story` : '';   // 이야기 속에서 하루 넘게 지난 기억은 얼마나 옛일인지
    const when = m.manual || m.turn == null ? 'noted' : back <= 0 ? 'this exchange' : back === 1 ? 'last exchange' : `${back} exchanges back`;   // 절대 턴 번호 대신 상대 최신성
    const core = (m.importance ?? 0) >= 0.8 || m.pinned ? ' · core' : '';   // 오래돼도 무거운 기억에는 core 표시
    return `- (${m.kind}${core}, ${when}${agoNote})${vis} ${m.summary}${quote ? ` — "${quote}"` : ''}${dated}`;
  },
  /** 인물 한 줄. c.brief: 장면 밖 인물 — 누구인지와 핵심 한 줄만. c.sceneNow: 지금 장면에 있다 (외형을 싣는다) */
  formatCharacterLine(c) {
    const head = [c.role, c.age, c.occupation].filter(Boolean).join(', ');
    if (c.brief) {   // 말투 · 달라진 점 · 관계 전부는 그 인물이 장면에 설 때 싣는다
      const gist = c.core ? cleanStr(c.core, 90) : (c.traits || []).slice(0, 3).join(', '), akaBrief = c.aka?.length ? ` (aka ${c.aka.slice(0, 2).join(', ')})` : '';
      return `- ${c.name}${akaBrief}${head ? ` (${head})` : ''}${gist ? ` — ${gist}` : ''}`;
    }
    const bits = [];
    if (c.appearance && (c.sceneNow || c.provisional)) bits.push(c.appearance);   // 외형은 지금 장면에 있는 인물(묘사에 필요)과 이름 없는 인물(외형이 곧 식별자)만
    // 바탕은 변하지 않는 기준, 달라진 점은 그 위에 천천히 얹히는 것 — 둘을 따로 적어야 모델이 장면 하나의 기분을 성격으로 굳히지 않는다
    if (c.core) bits.push(`core (constant — the story does not rewrite this): ${c.core}`);
    if (c.voice) bits.push(`voice: ${c.voice}`);
    if (c.traits?.length) bits.push(c.traits.join(', '));
    if (c.growth?.length) bits.push(`grown in this story (gradual, on top of the core): ${c.growth.slice(-2).map(g => g.text).join('; ')}`);
    if (c.relationships?.length) bits.push(c.relationships.map(r => `${r.target}: ${r.relation}`).join('; '));
    return `- ${c.name}${c.aka?.length ? ` (aka ${c.aka.join(', ')})` : ''}${head ? ` (${head})` : ''}${c.provisional ? ' [not yet named in-story — refer to them only by this handle]' : ''}${bits.length ? ` — ${bits.join(' | ')}` : ''}`;
  },
};
