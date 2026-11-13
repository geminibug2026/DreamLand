// memory.js 1–372 줄(작은 도구 · 태그 처리 · 내장 검색 · 모듈 상태)을 그대로 옮긴 것. 본문은 고치지 않고 타입만 붙인다
import { uid, msgText, on } from '../../lib/core';
import { tokens } from '../../lib/engine';
import { t as tr } from '../../i18n';
import type { Cfg, Mem, MemItem, Msg, RowHistory, Turn } from '../types';
import type { PrepResult } from './part3';
import type { Freeze, PacketResult, StableOpts } from './part4';
import type { findStatusBars } from '../scene';
import * as MP from '../prompts';
import { createActivityLog } from '../craft';

/** 옛 모듈의 let 변수들 (다른 파일에서 바꿀 수 있게 한 객체에 모았다) */
export interface EngineState {
  lastQuietPrompt: { text: string; at: number } | null; clockRecalBusy: boolean;
  chatGenerating: boolean; chatGeneratingSince: number; lastGenerationType: string;
  queue: Promise<unknown>; busy: number;
  bannedCache: { raw: string | null; list: string[] }; rebuildRunning: boolean;
}
export const G: EngineState = { lastQuietPrompt: null, clockRecalBusy: false, chatGenerating: false, chatGeneratingSince: 0, lastGenerationType: '', queue: Promise.resolve(), busy: 0, bannedCache: { raw: null, list: [] }, rebuildRunning: false };

// ── 이 파일의 캐시 · 상태가 담는 꼴 (조각들이 함께 쓴다) ──
/** 서고에서 목록인 칸 */
export type ShelfKey = 'turns' | 'memories' | 'canon' | 'status' | 'pledges' | 'cast' | 'bonds' | 'chunks' | 'arcs' | 'items' | 'milestones' | 'dossier';
/** 모델 답에서 읽은 JSON 객체 (칸마다 믿을 수 없다) */
export type Loose = Record<string, unknown>;
/** 태그 처리 방식: 대화 원문 | 요약 출력 */
export type TagMode = 'chat' | 'record';
interface TagFrame { tag: string | null; attrs: string; parts: string[] }
export type StatusBars = ReturnType<typeof findStatusBars>;
/** 기억 하나의 내장 벡터 (요약 쪽 · 단서 쪽) */
export interface VecPair { sum: Float32Array; cue: Float32Array | null }
/** 직전에 실린 회상 기억 */
export interface Audit { ids: string[]; at: number }
/** 캐논 · 상태 줄 (upsertRow · rollbackOrDrop 이 다루는 줄) */
export type HistRow = RowHistory & { value: string };
/** 옛 명칭 맞춤 — 모델 출력 · 저장된 값이라 무엇이든 올 수 있다 */
type Norm = (k?: unknown) => string;
/** 본문을 바꾸지 않고 "쓰지 않는 매개변수" 검사를 지나가기 위한 표시 — 반환 타입에 Promise<Unused<typeof x>> 처럼 적는다 */
export type Unused<_T> = void;

export const KINDS: Record<string, string> = { event: '사건', relationship: '관계', fact: '사실', preference: '취향', promise: '약속', goal: '목표', item: '물건', place: '장소', secret: '비밀', impression: '인상' };
export const LOCKS: Record<string, string> = { keep_unresolved: '미해결 유지', keep_secret: '비밀 유지', knowledge_gap: '정보 격차', consent: '동의 경계', world_limit: '세계 제약', loose_end: '열린 떡밥', foreshadow: '복선' };
export const VIS: Record<string, string> = { public: '공개', private: '개인', secret: '비밀' };
export const SCOPES: string[] = ['session', 'world', 'region', 'location', 'faction', 'system'];
export const LIBRARIAN_PROMPT = MP.DEFAULT_ARCHIVIST_PROMPT;
export const PROMPTS: Record<string, string> = { archivist: MP.DEFAULT_ARCHIVIST_PROMPT, supervisor: MP.DEFAULT_SUPERVISOR_PROMPT, chunk: MP.DEFAULT_CHUNK_PROMPT, arc: MP.DEFAULT_ARC_PROMPT };
export const NARRATOR = '__narrator__', PUBLIC_ONLY = '__public__';
export const LANGS: Record<string, string> = { auto: '자동 (대화 언어)', ko: '한국어', en: '영어', ja: '일본어', hybrid: '하이브리드 (영어 서술 + 대사 원문)' };
export const LANG_DIRECTIVES: Record<string, string> = MP.LANG_DIRECTIVES;
/** 설정 기본값 (S.settings.memory 에 없는 키는 여기서 채운다) */
/** 이 방의 요약 주기(턴): 대화 모드 방은 따로 정한 값이 있으면 그것 (대화 모드는 한 턴이 짧다) */
export const chunkTurnsOf = (cfg: Pick<Cfg, 'chunkTurns' | 'chunkTurnsTalk'>, chat?: { mode?: string } | null) =>
  Math.max(3, +(chat?.mode === 'talk' && +cfg.chunkTurnsTalk > 0 ? cfg.chunkTurnsTalk : cfg.chunkTurns) || 8);
export const MEMORY_DEFAULTS: Cfg = {
  enabled: false, auto: true, recordDelay: 0, tokenBudget: 8000, topK: 10, minScore: 0.12, minCosine: 0.08, mmrLambda: 0.74, maxPerKind: 3, maxPerTurn: 2, multiQueryRecent: 3,
  chunkTurns: 8, chunkTurnsTalk: 0, arcMergeAt: 6, consolidateEvery: 30, arcConsolidateEvery: 100, maxMemories: 400, responseTokens: 24000, summaryContextCount: 3, fossil: { settling: 12, fossilized: 40, deep: 120 }, language: 'auto',
  cast: true, lockEdited: true, items: false, milestones: false, storyClock: true, refProfile: true, refLore: false,
  trim: false, keepRecent: 20, autoHide: false, preserveRecent: 6,
  supervisor: false, associative: true, authorizePrivate: true, perspective: '', audit: true, reasoningHeadroom: 8000,
  position: 'split', depth: 1, prompt: '',
  embed: { mode: 'off', connId: '', model: 'text-embedding-3-small', floor: 0.35 },
  prompts: { supervisor: '', chunk: '', arc: '' },
  // ── v2 에서 생긴 설정 ──
  recallWaitSec: 5,         // 답변 전 회상(임베딩 왕복) 최대 대기 초 — 넘으면 내장 검색만으로 바로 생성 (0 = 제한 없음)
  yieldToChat: true,        // 답변을 생성하는 동안에는 사서 · 요약 호출을 시작하지 않고 기다린다
  watchUpdates: true,       // 다른 기능이 고친 메시지도 본문이 실제로 바뀌었으면 다시 기록
  splitInjection: false,    // 고정 장부 — 안정 구간을 얼려 따로 주입하고 매 턴 바뀌는 것만 최근 대화 옆에 (프롬프트 캐시)
  stableRefreshTurns: 24,   // 고정 장부를 이 턴 수마다 새로 뜬다 (0 = 달라진 줄이 넘칠 때만)
  styleGuard: true,         // "기록은 사실만 — 문체는 지금 대화를 따른다" 지시
  recallQuotes: true,       // 회상에 옛 원문 대사 인용을 싣는다 (옛 말투가 돌아오면 끈다)
  voiceSamples: 2,          // 장면 속 인물마다 실을 실제 남긴 말 수 (0 = 싣지 않음)
  bannedPhrases: '',        // 삼갈 표현 · 반복 표현 (줄바꿈 · 쉼표 구분) — 장부에서 걷어낸다
  banInChat: false,         // AI 에게 보내는 최근 대화에서도 삼갈 표현을 뺀다 (저장된 대화는 그대로)
  banTell: false,           // 삼갈 표현 목록을 모델에게 직접 알려준다 (모델에 따라 역효과)
  threadSleepTurns: 60,     // 이 턴 수 동안 진전 없는 떡밥은 잠재운다 (서고에는 남고, 다시 언급되면 깨어남. 0 = 끔)
  eraKeep: 8,               // 연대기를 이 개수까지만 따로 두고, 넘치면 가장 오래된 것부터 하나의 '옛 이야기'로 접는다
  statusMode: 'auto',       // 상태창 읽기: 'auto' 자동으로 찾기 | 'custom' 직접 정한 모양 | 'off'
  statusPattern: '',        // 직접 정한 모양(정규식) — 괄호로 묶은 부분을 상태창 내용으로 읽는다
  statusInject: true,       // 가장 최근 상태창을 AI 에게 알려 시간 · 날짜 · 장소를 잇는다
  qrMode: 'side',           // 명령으로 만든 메시지: 'side' 코멘트와 막간만 빼기 | 'all' 전부 빼기 | 'keep' 빼지 않기
  replyCheck: false,        // 연속성 검사 — 새 답변이 기록 · 최근 대화와 어긋나면 ⚠ (답변마다 호출 1회)
  bundles: {},              // 설정 세트 { 이름: 값들 }
  bundleByOwner: {},        // 캐릭터 · 그룹에 붙인 세트
  activeBundle: '',         // 지금 적용 중인 세트 ('' = 기본 설정)
  bundleBase: null,         // 세트가 적용된 동안 맡아 둔 기본 설정
  noticed: {},              // 한 번만 띄우는 안내를 이미 봤는지
  promptRev: MP.PROMPT_REV, settingsRev: 3, promptOutdated: {},
};
export const SHELVES: ShelfKey[] = ['turns', 'memories', 'canon', 'status', 'pledges', 'cast', 'bonds', 'chunks', 'arcs', 'items', 'milestones', 'dossier'];
export const SHELF_LABELS: Record<string, string> = { turns: '턴 기록', memories: '기억', canon: '캐논', status: '상태', pledges: '서약', chunks: '요약', arcs: '연대기', cast: '인물', bonds: '관계선', milestones: '연표', items: '물건', dossier: '자료실', archive: '서고 설정' };
export const SLOT_ALIASES: Record<string, string> = {
  physical_state: 'condition', physical_condition: 'condition', body_state: 'condition', body_condition: 'condition', health: 'condition', health_state: 'condition', state: 'condition', current_state: 'condition',
  injuries: 'injury', wound: 'injury', wounds: 'injury',
  outfit_state: 'outfit', clothing: 'outfit', clothes: 'outfit', attire: 'outfit', clothing_state: 'outfit', dress: 'outfit',
  emotion: 'mood', emotions: 'mood', feeling: 'mood', feelings: 'mood', emotional_state: 'mood', mood_state: 'mood', mental_state: 'mood',
  posture: 'activity', position: 'activity', pose: 'activity', stance: 'activity', body_position: 'activity',
  held_items: 'holding', held_item: 'holding', carrying: 'holding', in_hand: 'holding',
  place: 'location', current_location: 'location', whereabouts_now: 'location',
  action: 'activity', current_action: 'activity', ongoing_action: 'activity', doing: 'activity',
};
export const VOLATILE = new Set(['mood', 'outfit', 'holding', 'activity', 'expression', 'condition']);
export const PAST_QUERY_RE = /(처음|예전|옛날|그때|그 때|지난번|언제였|언제 였|기억나|기억 나|기억해|기억하|첫날|첫 만남|만났을 때|했었|였었|하던 때|remember when|back then|first met|first time|used to|at first|way back|昔|最初|あの時|あのとき|覚えて)/i;
export const DOSSIER_CHUNK = 700;
export const DOSSIER_MAX = 400000;
export const CHARACTER_LINES_MAX = 6, CHARACTER_GROWTH_MAX = 5, BOND_LOG_MAX = 8, BOND_SETTLE_TURNS = 4;
export const PROMPT_KEYS: string[] = ['archivist', 'supervisor', 'chunk', 'arc'];

export const empty: (id: string) => Mem = id => ({ id, turns: [], memories: [], canon: [], status: [], pledges: [], cast: [], chunks: [], arcs: [], items: [], milestones: [], dossier: [], bonds: [], chunked: 0, consolidatedAt: 0, arcAt: 0, clockDays: 0, bondRev: 1 });
export const cache = new Map<string, Mem>();
export const hash: (s: string) => string = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
/** 턴 동일성 판별 — 사서가 보는 본문(visibleProse) 기준이어야 편집 · 숨은 태그와 맞추기가 어긋나지 않는다 */
export const hashCache = new WeakMap<Msg, { text: string; h: string }>();   // 메시지 → { text, h } (맞추기가 답변마다 되풀이해 재지 않게 — 본문이 바뀌면 다시 잰다)
export const mesHashOf: (m?: Msg | null) => string = m => { if (!m || typeof m !== 'object') return hash(''); const text = msgText(m), hit = hashCache.get(m); if (hit && hit.text === text) return hit.h; const h = hash(visibleProse(text)); hashCache.set(m, { text, h }); return h; };
/** 옛 방식으로 계산했을 해시들 — 저장된 턴이 어느 판에서 기록됐든 같은 메시지로 알아본다. 맞추기는 여기서 맞는 게 있으면 새 해시로 옮기고, 없을 때만 바뀐 턴으로 본다 */
export const mesHashLegacySet: (m?: Msg | null) => Set<string> = m => new Set([hash(m ? msgText(m) : '')]);   // 원문 그대로 재던 때
export const turnMatches = (t: Pick<Turn, 'hash'>, m?: Msg | null) => t.hash === mesHashOf(m) || mesHashLegacySet(m).has(t.hash!);
export const clamp01 = (x: unknown, d = 0.5) => { const n = Number(x); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };   // 0~1 로 자르기
export const str: (v: unknown) => string = v => (v == null || v === 'null' ? '' : String(v).trim());
export const list: <T = unknown>(v?: T[] | {} | null) => T[] = v => Array.isArray(v) ? v : [];
export const snake: (s: unknown) => string = s => str(s).toLowerCase().replace(/[\s-]+/g, '_');
export const clip = <S,>(s: S | string, n: number) => { s = str(s); return s.length > n ? s.slice(0, n) + '…' : s; };
export const low: (s: unknown) => string = s => String(s ?? '').toLowerCase();
/** 공백을 한 칸으로 접고 max 자에서 자른다 */
export const cleanStr = (s: unknown, max = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
/** 자동 기록용 자르기 — 문장 · 단어 경계에서 끊어 단어 중간에서 잘리지 않게 한다 */
export const clipStr = (s: unknown, max: number) => {
  const t = cleanStr(s, max * 2); if (t.length <= max) return t;
  const head = t.slice(0, max), sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('｡'), head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'));
  if (sentence > max * 0.6) return head.slice(0, sentence + 1).trim();
  const space = head.lastIndexOf(' ');
  return (space > max * 0.6 ? head.slice(0, space) : head).trim() + '…';
};
export const toSnake: (s: unknown) => string = s => String(s || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 64);
export const num01 = (x: unknown, d = 0.5) => { const n = Number(x); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
/** 원문의 첫 문장만 (사서가 실패했을 때 사건 요약 대신 — 통째 복사 방지) */
export const firstSentence = (s: unknown, max = 160) => { const t = cleanStr(s, 600), m = t.match(/^.*?[.!?。！？…](?=\s|$)/); return cleanStr(m ? m[0] : t, max); };
/** 문자열 해시 — 저장된 프롬프트가 옛 기본값 그대로인지 가릴 때 쓴다 */
export function getStringHash(str: unknown, seed = 0): number {
  if (typeof str !== 'string') return 0;
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export const pastCache = new Map<string, boolean>();
/** 손대지 않은 프롬프트인가 — 비었거나, 지금 기본값이거나, 역대 기본 프롬프트 가운데 하나 */
export const untouchedPrompt = (key: string, text: unknown): boolean => {
  const cur = String(text ?? ''); if (!cur.trim() || cur === PROMPTS[key]) return true;
  const k = key + '\u0001' + cur; if (!pastCache.has(k)) { if (pastCache.size > 40) pastCache.clear(); pastCache.set(k, (MP.PAST_DEFAULT_PROMPT_HASHES[key as keyof typeof MP.PAST_DEFAULT_PROMPT_HASHES] || []).includes(getStringHash(cur))); }
  return pastCache.get(k)!;
};
export const canonSlot: (s: unknown) => string = s => SLOT_ALIASES[snake(s)] || snake(s);
export const na: (v: unknown) => string = v => { const t = str(v); return !t || /^(n\/?a|null|unknown|불명|없음|-)$/i.test(t) ? '' : t; };
export const copy: <T>(o: T) => T = o => JSON.parse(JSON.stringify(o, (k, v) => k === 'av' || k === 'acv' ? undefined : v));   // 임베딩 벡터는 본문에서 다시 계산할 수 있으므로 복사·백업에서 뺀다
export const cleanRecord: (t: unknown) => string = t => String(t || '').replace(/<(think|thinking|thought|reasoning|reflection)>[\s\S]*?<\/\1>/gi, '').replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();

// ── 태그 처리: 대화 원문에서 이야기만 남기고(visibleProse), 요약 출력에서 기록만 남긴다(sanitizeRecord).
//    메시지에는 이야기 말고도 연출 계획 · 상태창 · 그림 프롬프트 · 본문 서식이 섞여 온다. 태그를 스택으로 짝지어 안쪽부터 풀면서 종류별로 다르게 다룬다 ──
export const setOf: (s: string) => Set<string> = s => new Set(s.split(' '));
export const PROSE_TAGS = setOf('b i em strong u s strike del ins mark small big sub sup span p div br hr a q cite abbr blockquote pre code font center ul ol li dl dt dd h1 h2 h3 h4 h5 h6 section article table thead tbody tfoot tr td th caption details summary figure figcaption ruby rt rp kbd var time');   // 껍데기만 벗긴다
export const BREAK_TAGS = setOf('p div br hr li tr blockquote pre section article details summary h1 h2 h3 h4 h5 h6 ul ol table figure figcaption dt dd');
export const VOID_TAGS = setOf('br hr img input meta link wbr source col area embed track param');
export const STORY_TAGS = setOf('prose story narrative narration roleplay response reply content novel');   // 이런 블록이 있으면 그 안만 이야기다
export const VOICE_TAGS = setOf('true_thoughts inner_thoughts inner_monologue private_thoughts');   // 속마음 — 살리되 표시를 붙인다
export const META_TAGS = setOf('scene_plan scene_reasoning plan planning analysis director_state writing_thoughts think thinking thought thoughts reasoning reflection ooc status status_window statusbar status_bar tracker threads story_threads psychological_states momentum momentum_route conflict cyoa choices options sheet stats infobox info_box hud autopic apchar uc image_prompt img_prompt sd_prompt nai_prompt imagine pic style script svg canvas iframe audio video template noscript object');   // 내용째로 버린다
export const S_OPEN = '\u0001', S_CLOSE = '\u0002', S_SEG = /\u0001([^\u0001\u0002]*)\u0002/g, S_MARK = /[\u0001\u0002]/g;
export const REC_ANY = /(?:^|\n)\s*(?:WHEN|PLOT|SHIFTS|OPEN)\s*[:：]/i, REC_RULE = /^\s*(?:[*\-_=~—]\s*){3,}$/, REC_LABEL = /^\s*(?:WHEN|PLOT|SHIFTS|OPEN)\s*[:：]/i, REC_BULLET = /^\s*(?:[-•·]|\*(?!\*))\s+\S/, REC_TALK = /^\s*["“「『'‘(]/;
/** 블록 안쪽이 문장이 아니라 데이터(태그 나열 · 키:값 목록 · CSS)처럼 보이는가 */
export function looksLikeData(inner: unknown): boolean {
  const raw = String(inner || '').replace(S_MARK, ' '), t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return true;
  if (/[{}]/.test(t) && /:/.test(t) && /;|,/.test(t) && !/[.!?。！？…]\s/.test(t)) return true;
  if (/[.!?。！？…](?=\s|$|["'”’」』)])/.test(t) || /[다요죠네까니](?=\s|$|["'”’」』)])/.test(t)) return false;
  const parts = t.split(/[,，、]/).map(x => x.trim()).filter(Boolean);
  if (parts.length >= 3 && parts.reduce((a, x) => a + x.length, 0) / parts.length <= 24) return true;
  const lines = raw.split('\n').map(x => x.trim()).filter(Boolean);
  return lines.length >= 2 && lines.every(l => /^[-*•·]?\s*[^:：|]{1,30}\s*[:：|]/.test(l));
}
export function voiceLine(attrs: unknown, inner: unknown): string {
  const who = (String(attrs).match(/\b(?:character|char|name|who)\s*=\s*["“']([^"”']+)["”']/i) || [])[1], body = String(inner).replace(S_MARK, ' ').replace(/\s+/g, ' ').trim();
  return body ? `\n(inner thoughts${who ? ` — ${who.trim()}` : ''}: ${body})\n` : ' ';
}
export function tagClosed(tag: string, attrs: string, inner: string, mode: TagMode): string {
  const brk = BREAK_TAGS.has(tag) ? '\n' : ' ';
  if (PROSE_TAGS.has(tag)) return brk + inner + brk;
  if (STORY_TAGS.has(tag)) return mode === 'chat' ? `${S_OPEN}${inner.replace(S_MARK, '')}${S_CLOSE}` : `\n${inner}\n`;
  if (mode === 'record') return REC_ANY.test(inner) ? `\n${inner}\n` : ' ';
  if (META_TAGS.has(tag)) return '\n';
  if (VOICE_TAGS.has(tag)) return voiceLine(attrs, inner);
  return looksLikeData(inner) ? ' ' : brk + inner + brk;
}
/** 닫히지 않은 블록 — 답변이 잘렸거나 닫는 태그가 빠진 경우 */
export function tagOpen(tag: string, attrs: string, inner: string, mode: TagMode): string {
  if (STORY_TAGS.has(tag)) return tagClosed(tag, attrs, inner, mode);
  if (VOICE_TAGS.has(tag) && mode === 'chat') return voiceLine(attrs, inner);
  if (mode === 'chat' && META_TAGS.has(tag)) { const segs = [...inner.matchAll(S_SEG)].map(m => S_OPEN + m[1] + S_CLOSE); return segs.length ? segs.join('\n') : looksLikeData(inner) ? '\n' : `\n${inner}\n`; }   // 이야기를 날리는 것보다 상태창 몇 줄이 새는 편이 낫다
  if (mode === 'record' && !PROSE_TAGS.has(tag) && !REC_ANY.test(inner)) return ' ';
  return ` ${inner} `;
}
export function transformTags(text: unknown, mode: TagMode): string {
  const src = String(text || ''); if (!src.includes('<')) return src;
  const re = /<\/?([a-zA-Z][\w:.-]*)\b([^<>]*)>/g, stack: TagFrame[] = [{ tag: null, attrs: '', parts: [] }], top = () => stack[stack.length - 1]; let last = 0, m;
  while ((m = re.exec(src))) {
    top().parts.push(src.slice(last, m.index)); last = re.lastIndex;
    const tag = m[1].toLowerCase(), attrs = m[2] || '';
    if (m[0][1] === '/') {
      let idx = -1; for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { idx = i; break; }
      if (idx < 0) { top().parts.push(' '); continue; }
      while (stack.length - 1 > idx) { const f = stack.pop()!; top().parts.push(tagOpen(f.tag!, f.attrs, f.parts.join(''), mode)); }
      const f = stack.pop()!; top().parts.push(tagClosed(f.tag!, f.attrs, f.parts.join(''), mode));
    } else if (VOID_TAGS.has(tag) || /\/\s*$/.test(attrs)) top().parts.push(BREAK_TAGS.has(tag) ? '\n' : ' ');
    else stack.push({ tag, attrs, parts: [] });
  }
  top().parts.push(src.slice(last));
  while (stack.length > 1) { const f = stack.pop()!; top().parts.push(tagOpen(f.tag!, f.attrs, f.parts.join(''), mode)); }
  return stack[0].parts.join('');
}
/** 대화 원문에서 "눈에 보이는 이야기"만 남긴다 (사서에게 보내는 글 · 인용 대조 · 출처 보기에 쓴다. 턴 해시도 이 글로 잰다) */
export function visibleProse(s: unknown): string {
  let t = String(s ?? ''); if (!t) return '';
  t = transformTags(t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(think|thinking|thought|reasoning|reflection)>[\s\S]*?<\/\1>/gi, ' ').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' '), 'chat');
  if (t.includes(S_OPEN)) { const story = [...t.matchAll(S_SEG)].map(x => x[1]).filter(x => x.trim()).join('\n\n'); t = story.replace(/\s/g, '').length >= 20 ? story : t; }
  return t.replace(S_MARK, ' ').replace(/[​-‍﻿]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
export const prose: (m: Msg) => string = m => { const raw = msgText(m); return visibleProse(raw) || raw.trim(); };
/** 요약 출력에서 WHEN / PLOT / SHIFTS / OPEN 기록만 남긴다 (기록 뒤에 선을 긋고 이야기를 이어 쓰거나 다른 지시의 태그 블록을 덧붙이는 경우를 걸러 낸다) */
export function sanitizeRecord(raw: unknown): string {
  const cleaned = transformTags(cleanRecord(raw).replace(/<!--[\s\S]*?-->/g, ' '), 'record').replace(/\r/g, ''), lines = cleaned.split('\n'), start = lines.findIndex(l => REC_LABEL.test(l));
  if (start < 0) return cleaned.trim();   // 구조가 없는 답이면 태그만 걷어 내고 둔다
  const kept = []; let lastLine = '';
  for (let i = start; i < lines.length; i++) {
    const line = lines[i], t = line.trim();
    if (REC_RULE.test(line)) break;
    if (!t) { kept.push(line); continue; }
    if (REC_LABEL.test(line) || REC_BULLET.test(line)) { kept.push(line); lastLine = t; continue; }
    if (!(lastLine && !REC_TALK.test(line) && (REC_LABEL.test(lastLine) || REC_BULLET.test(lastLine)))) break;   // 대사로 시작하면 이야기가 다시 시작된 것
    kept.push(line); lastLine = '';   // 이어짐은 한 줄까지
  }
  const out = kept.join('\n').trim();
  return out.replace(/^[ \t]*(?:PLOT|SHIFTS|OPEN)[ \t]*[:：][ \t]*$/gim, '').replace(/^[ \t]*WHEN[ \t]*[:：].*$/gim, '').replace(/\s/g, '').length >= 2 ? out : cleaned.trim();
}
export const ekey: (s: unknown) => string = s => String(s || '').toLowerCase().replace(/[\s._\-'"`]+/g, '').trim();

// ── 내장 검색: 해시 임베딩 (외부 API 불필요 · 언어 무관 · 결정적) + 어휘 겹침 —
//    단어(1.0) · 단어 안 3글자 조각(0.32) · 글 전체 3글자 조각(0.08)을 128칸에 부호를 붙여 해시한다 ──
export const DIM = 128;
export function tokenizeForEmbedding(text: unknown): [string, number][] {
  const out: [string, number][] = [], lower = String(text || '').toLowerCase();
  for (const w of lower.match(/[\p{L}\p{N}]+/gu) || []) { out.push([`w:${w}`, 1.0]); if (w.length >= 3) for (let i = 0; i <= w.length - 3; i++) out.push([`t:${w.slice(i, i + 3)}`, 0.32]); }
  const compact = lower.replace(/\s+/g, ' ');
  for (let i = 0; i <= compact.length - 3; i += 2) out.push([`c:${compact.slice(i, i + 3)}`, 0.08]);
  return out;
}
export function vec(text: unknown): Float32Array {
  const v = new Float32Array(DIM);
  for (const [tok, w] of tokenizeForEmbedding(text)) { const h1 = getStringHash(tok) >>> 0, h2 = getStringHash(tok, 1337) >>> 0; v[h1 % DIM] += ((h2 & 1) ? 1 : -1) * w; }
  let n = 0; for (let i = 0; i < DIM; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1; for (let i = 0; i < DIM; i++) v[i] /= n;
  return v;
}
export const cos = (a?: ArrayLike<number> | null, b?: ArrayLike<number> | null): number => { if (!a || !b || a.length !== b.length) return 0; let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const vcache = new Map<string, VecPair>();
/** 회상 단서 글 — 원문 인용 · 떠올릴 단서 · 인물 이름만. 요약은 사서의 문체지만 인용 · 단서는 장면의 말 그대로라 따로 잰다 */
export const cueText: (m: Pick<MemItem, 'quote' | 'hints' | 'entities'>) => string = m => `${m.quote || ''} ${(m.hints || []).join(' ')} ${(m.entities || []).join(' ')}`.trim();
/** 기억을 찾을 때 임베딩 · 어휘 매칭에 쓰는 글 */
export const indexText: (m: Pick<MemItem, 'summary' | 'entities' | 'tags' | 'hints'>) => string = m => `${m.summary} ${(m.entities || []).join(' ')} ${(m.tags || []).join(' ')} ${(m.hints || []).join(' ')}`;
export const vecOf: (m: Pick<MemItem, 'id' | 'summary' | 'quote' | 'entities' | 'tags' | 'hints'>) => VecPair = m => { const it = indexText(m), c = cueText(m), k = m.id + ':' + hash(it + '|' + c); if (!vcache.has(k)) { if (vcache.size > 6000) vcache.clear(); vcache.set(k, { sum: vec(it), cue: c.length >= 4 ? vec(c) : null }); } return vcache.get(k)!; };
export const cleanMultiline = (s: unknown, max = 2000) => String(s ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
/** 같은 등급 · 같은 소유자의 기억인가 — 서고 정리와 연상 회상은 이 경계를 넘지 않는다 */
export const normScope: (v: unknown) => string = v => String(v ?? '').normalize('NFKC').trim().toLowerCase();
export const sameKnowledgeScope = (a: Pick<MemItem, 'visibility' | 'owner'>, b: Pick<MemItem, 'visibility' | 'owner'>) => (a.visibility || 'public') === (b.visibility || 'public') && normScope(a.owner) === normScope(b.owner);
/** 화석화 설정의 모양 맞춤. 지금은 { settling, fossilized, deep }, 예전에는 숫자 하나였다 — 저장된 숫자는 예전 계산식(×0.3 · ×1 · ×3) 그대로 읽는다 */
export const FOSSIL = { settling: 12, fossilized: 40, deep: 120 };
export function fossilShape(f?: Partial<Cfg['fossil']> | number | null): Cfg['fossil'] {
  if (f && typeof f === 'object') { const n: (k: keyof typeof FOSSIL) => number = k => Number.isFinite(+f[k]!) && +f[k]! > 0 ? +f[k]! : FOSSIL[k]; return { settling: n('settling'), fossilized: n('fossilized'), deep: n('deep') }; }
  const n = Number(f); if (!Number.isFinite(n) || n <= 0 || n === 40) return { ...FOSSIL };
  return { settling: n * 0.3, fossilized: n, deep: n * 3 };
}
export const storyFossilWeight: (d: number) => number = d => d < 2 ? 1 : d < 30 ? 0.7 : d < 365 ? 0.35 : 0.12;
export const words: (t: unknown) => Set<string> = t => new Set(low(t).match(/[\p{L}\p{N}]+/gu) || []);
export const grams: (t: unknown) => Set<string> = t => { const s = low(t).replace(/[^\p{L}\p{N}]+/gu, ''), g = new Set<string>(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
export const lexical = (q: Set<string>, text: unknown) => { if (!q.size) return 0; const w = words(text); if (!w.size) return 0; let hit = 0; for (const t of q) if (w.has(t)) hit++; return hit / Math.sqrt(q.size * w.size); };
export const gramOverlap = (q: Set<string>, text: unknown) => { if (q.size < 6) return 0; const g = grams(text); if (g.size < 6) return 0; let hit = 0; for (const x of q) if (g.has(x)) hit++; return hit / Math.sqrt(q.size * g.size); };
/** 두 글의 겹침 비율 (짧은 쪽 기준, 단어 · 2글자 조각 중 높은 쪽) */
export function overlap(a: unknown, b: unknown): number {
  const min = (sa: Set<string>, sb: Set<string>) => { if (!sa.size || !sb.size) return 0; let hit = 0; for (const w of sa) if (sb.has(w)) hit++; return hit / Math.min(sa.size, sb.size); };
  const w: (t: unknown) => Set<string> = t => new Set(low(t).match(/[\p{L}\p{N}]{2,}/gu) || []);
  const ga = grams(a), gb = grams(b);
  return Math.max(min(w(a), w(b)), ga.size >= 8 && gb.size >= 8 ? min(ga, gb) : 0);
}
export const calibrate = (c: number, floor: number) => c <= floor ? 0 : (c - floor) * (0.55 / (1 - floor));

/** 모델 답에서 JSON 객체 하나를 읽는다 — 사고 블록 · 코드 펜스 · 스타일/스크립트를 걷고, 여는 중괄호 후보를 앞에서부터 차례로 "뒤에서 줄이기 → 강제 닫기"까지 해 본다 */
export function parseLoose<T = Loose>(text: unknown): T | null {
  if (!text) return null;
  let t = String(text).trim().replace(/<(think|thinking|thought|reasoning|reflection)>[\s\S]*?<\/\1>/gi, '').trim();   // 블록 안의 예시 JSON 을 기록으로 잘못 읽지 않게
  const stray = t.match(/<\/(?:think|thinking|thought|reasoning|reflection)>/gi);   // 여는 태그 없이 닫는 태그만 남은 답(앞이 잘림) — 마지막 닫는 태그 뒤만
  if (stray) { const tag = stray[stray.length - 1]; t = t.slice(t.lastIndexOf(tag) + tag.length).trim(); }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);   // 코드 펜스가 중간에 있으면 그 안을 먼저 본다 (앞에 설명을 붙이는 모델)
  if (fence && fence[1].includes('{')) t = fence[1].trim(); else t = t.replace(/^```(?:json)?/i, '').replace(/```$/m, '').trim();
  t = t.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');   // 스타일 · 스크립트의 중괄호를 JSON 시작으로 보지 않게
  const starts = []; for (let i = t.indexOf('{'); i >= 0 && starts.length < 12; i = t.indexOf('{', i + 1)) starts.push(i);
  const isObj: (v: unknown) => unknown = v => v && typeof v === 'object' && !Array.isArray(v);
  for (const start of starts) {
    for (let end = t.length; end > start; end--) { if (t[end - 1] !== '}') continue; try { const v = JSON.parse(t.slice(start, end)); if (isObj(v)) return v; } catch { /* 더 줄인다 */ } }
    const repaired = repairTruncatedJson(t.slice(start)); if (isObj(repaired)) return repaired as T;
    if (/^\{\s*"/.test(t.slice(start, start + 24))) break;   // JSON 처럼 생긴 후보가 끝내 안 읽히면 더 안쪽 조각 객체를 답으로 집지 않는다 (빈 기록이 "성공"으로 처리돼 재시도조차 안 된다)
  }
  return null;
}
/** 끝이 잘린 JSON 을 괄호 순서대로 닫아 읽는다. 끝에서부터 쉼표 자리를 하나씩 물러나며(마지막 항목이 반쯤 쓰인 경우) 여는 괄호 스택을 거꾸로 닫아 본다 */
export function repairTruncatedJson(s: string): unknown {
  const scan: (str: string) => { stack: string[]; inStr: boolean } = str => { const stack: string[] = []; let inStr = false, esc = false; for (const c of str) { if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; } if (c === '"') inStr = true; else if (c === '{') stack.push('}'); else if (c === '[') stack.push(']'); else if (c === '}' || c === ']') stack.pop(); } return { stack, inStr }; };
  const cuts = [s.length]; for (let i = s.length - 1; i > 0 && cuts.length < 25; i--) if (s[i] === ',') cuts.push(i);
  for (const cut of cuts) {
    let head = s.slice(0, cut).replace(/[\s,:]+$/, ''); const { stack, inStr } = scan(head);
    if (!stack.length && !inStr) continue;   // 닫을 게 없으면 앞의 줄이기 단계에서 이미 해 봤다
    if (inStr) head += '"';
    try { return JSON.parse(head + stack.reverse().join('')); } catch { /* 한 칸 더 물러난다 */ }
  }
  return null;
}
/** "6h", "2d", "3개월" 같은 압축 기간 표기를 일수로. 읽지 못하거나 0 이면 0 (100년 상한) */
export function parseDurationDays(raw: unknown): number {
  const t = String(raw ?? '').trim().toLowerCase(); if (!t || t === '0' || t === 'null' || t === 'none') return 0;
  const m = t.match(/^~?\s*(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|w|mo|y|초|분|시간|일|주|개월|달|년|해)\.?s?$/i); if (!m) return 0;
  const n = parseFloat(m[1]); if (!Number.isFinite(n) || n <= 0) return 0;
  const PER_DAY: Record<string, number> = { s: 86400, sec: 86400, 초: 86400, m: 1440, min: 1440, 분: 1440, h: 24, hr: 24, 시간: 24, d: 1, 일: 1, w: 1 / 7, 주: 1 / 7, mo: 1 / 30, 개월: 1 / 30, 달: 1 / 30, y: 1 / 365, 년: 1 / 365, 해: 1 / 365 };
  return Math.min(n / (PER_DAY[m[2]] ?? 1), 36500);
}
export const toDays = parseDurationDays;
export const fmtDays: (d: number) => string = d => d >= 365 ? `${(d / 365).toFixed(1)}년` : d >= 30 ? `${Math.round(d / 30)}개월` : d >= 1 ? `${Math.round(d)}일` : d > 0 ? `${Math.max(1, Math.round(d * 24))}시간` : '0';
export const ago: (d: number) => string = d => d < 1 ? `${Math.max(1, Math.round(d * 24))}h` : d < 14 ? `${Math.round(d)}d` : d < 60 ? `${Math.round(d / 7)}w` : d < 730 ? `${Math.round(d / 30)}mo` : `${Math.round(d / 365)}y`;
/** 문서를 문단 경계 기준 ~700자 대목으로 나눈다 */
export function chunkDossier(text: unknown): string[] {
  const out = []; let buf = '';
  for (const p of String(text || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)) {
    if (buf && buf.length + p.length > DOSSIER_CHUNK) { out.push(buf); buf = p; } else buf = buf ? `${buf}\n${p}` : p;
    while (buf.length > DOSSIER_CHUNK * 2) { out.push(buf.slice(0, DOSSIER_CHUNK * 2)); buf = buf.slice(DOSSIER_CHUNK * 2); }
  }
  if (buf) out.push(buf);
  return out.slice(0, 600);
}
export const dcache = new Map<string, Float32Array>();
export const dvec = (id: string, i: number, text: string): Float32Array => { const k = `${id}:${i}:${text.length}`; if (!dcache.has(k)) { if (dcache.size > 4000) dcache.clear(); dcache.set(k, vec(text)); } return dcache.get(k)!; };
/** 장부 글을 구역별로 나눠 토큰 수를 센다 */
export function packetSections(text: unknown): { name: string; tokens: number }[] {
  const out = []; let cur = { name: tr('memoria.overview.sec.intro'), text: '' };
  for (const line of String(text).split('\n')) {
    if (/^<\/?memoria_/.test(line)) continue;
    if (line.startsWith('## ')) { out.push(cur); cur = { name: line.slice(3).split(' (')[0].split(' —')[0], text: '' }; }
    cur.text += line + '\n';
  }
  out.push(cur);
  return out.filter(s => s.text.trim()).map(s => ({ name: s.name, tokens: tokens(s.text) }));
}

// 옛 명칭(저장된 서고 · 모델 출력)을 지금 명칭으로
export const LEGACY_KIND_MAP: Record<string, string> = { condition: 'goal', item_state: 'item', location: 'place', subjective: 'impression', subjective_memory: 'impression' };
export const LEGACY_LOCK_MAP: Record<string, string> = { do_not_resolve: 'keep_unresolved', secret_boundary: 'keep_secret', speaker_boundary: 'knowledge_gap', consent_boundary: 'consent', world_constraint: 'world_limit', open_thread: 'loose_end' };
export const LEGACY_VIS_MAP: Record<string, string> = { owner_private: 'private' };
export const normKind: Norm = k => Object.hasOwn(KINDS, k as string ?? '') ? k as string : (LEGACY_KIND_MAP[k as string] || 'fact'), normLockKind: Norm = k => Object.hasOwn(LOCKS, k as string ?? '') ? k as string : (LEGACY_LOCK_MAP[k as string] || 'loose_end'), normVisibility: Norm = v => Object.hasOwn(VIS, v as string ?? '') ? v as string : (LEGACY_VIS_MAP[v as string] || 'public');
export const pledgeId: (mem: Pick<Mem, 'pledges'>) => string = mem => 'p' + (mem.pledges.reduce((a, x) => Math.max(a, +String(x.id).replace(/\D/g, '') || 0), 0) + 1);
/**
 * 설정 · 상태 한 줄 넣기. 같은 값이면 재확인(턴만 옮기고 이전 값 이력은 둔다), 값이 바뀌면 바뀌기 직전 값을 한 단계 남긴다.
 * msgId = 이 값을 적은 답변, reMsgId = 그 뒤 같은 값을 재확인만 한 답변, createdTurn = 처음 생긴 턴 (스와이프 한 번에 오래 지켜 온 줄이 사라지지 않게)
 */
export function upsertRow<V extends { value: string }>(rows: HistRow[], idx: number, rec: V, turn: number, msgId?: string): void {
  if (idx < 0) { rows.push({ id: uid(), ...rec, turn, createdTurn: turn, prev: null, prevTurn: null, msgId }); return; }
  const cur = rows[idx], createdTurn = cur.createdTurn ?? cur.turn;
  if ((cur.turn || 0) > turn) return;   // 최신성 보호: 옛 턴 재기록이 새 사실을 덮지 못한다
  if (cur.value === rec.value) { cur.turn = turn; cur.createdTurn = createdTurn; if (msgId && cur.msgId !== msgId) cur.reMsgId = msgId; return; }
  if (msgId ? cur.msgId === msgId : (cur.turn || 0) === turn) { rows[idx] = { id: cur.id, ...rec, turn, createdTurn, prev: cur.prev ?? null, prevTurn: cur.prevTurn ?? null, prevMsgId: cur.prevMsgId || '', msgId }; return; }   // 같은 턴 안의 중복 — 값만 갱신
  rows[idx] = { id: cur.id, ...rec, turn, createdTurn, prev: cur.value, prevTurn: cur.turn, prevMsgId: cur.reMsgId || cur.msgId || '', msgId };
}
/** 이 답변이 적은 줄을 지우되, 이전 값이 있으면 그 값으로 되돌린다. 재확인만 한 줄은 재확인 이전으로 (직접 적은 줄은 건드리지 않는다) */
export const rollbackOrDrop = <R extends HistRow>(rows: R[], msgId?: string): R[] => rows.flatMap<R>(r => {
  if (r.manual || !msgId) return [r];
  if (r.reMsgId === msgId) return [{ ...r, turn: r.createdTurn ?? r.turn, reMsgId: '' }];
  if (r.msgId !== msgId) return [r];
  if (r.reMsgId) return [{ ...r, msgId: r.reMsgId, reMsgId: '' }];   // 뒤 턴이 같은 값을 다시 확인했다 — 그 턴의 기록으로 남는다
  if (r.prev != null) return [{ ...r, value: r.prev, turn: r.prevTurn ?? 0, msgId: r.prevMsgId || '', prev: null, prevTurn: null, prevMsgId: '' }];
  return [];
});
export const statusCache = new WeakMap<Msg, { text: string; key: string; bars: StatusBars }>();
export const updateTimers = new Map<string, ReturnType<typeof setTimeout>>();   // 다른 기능이 고친 메시지 — 연달아 오는 갱신을 한 번으로 모으는 타이머
export const BUNDLE_SKIP: string[] = ['embed', 'prompt', 'perspective'];   // 설정 세트에 담지 않는 것 가운데 여기서 이름이 바뀐 키
export const activityLog = createActivityLog(120);
// 답변 생성 중에는 사서 · 요약 호출을 시작하지 않는다 (설정 yieldToChat)
export const CHAT_IDLE_MAX_WAIT_MS = 180000;
on<{ quietPrompt?: unknown; type?: unknown } | undefined>('generate:start', x => { if (x?.quietPrompt) G.lastQuietPrompt = { text: String(x.quietPrompt), at: Date.now() }; if (x?.type === 'impersonate' || x?.type === 'quiet') return; G.chatGenerating = true; G.chatGeneratingSince = Date.now(); G.lastGenerationType = String(x?.type || ''); });
on('generate:end', () => { G.chatGenerating = false; G.chatGeneratingSince = 0; });

export const overrides = new Map<string, string>();   // chatId → 다음 답변 한 번에만 실을 장부
export const audits = new Map<string, Audit>();      // chatId → 직전에 실린 회상 기억 (답변에 반영됐는지 채점)
export const lasts = new Map<string, PacketResult>();       // chatId → 직전에 실제로 실린 장부
export const pendingEmbeds = new Map<string, Promise<boolean>>();     // 떠나 있는 질의 임베딩 호출 (같은 글을 두 번 부르지 않게)
export const queryEmbedCache = new Map<string, Float32Array>();   // 임베딩 모델 + 질의 글 → 벡터 (같은 입력으로 장부를 여러 번 지을 때 다시 부르지 않게. 늦게 도착한 것은 다음 턴에 쓰인다)
export const freezes = new Map<string, Freeze>();     // chatId → 얼려 둔 장부의 안정 구간 { chatId, key, level, opts, turn, entries, text, tokens }
export const preps = new Map<string, PrepResult>();       // chatId → 답변 전 준비(임베딩 왕복)에 걸린 시간 · 대기 상한에 걸렸는지
export const PACKET_HEADER = '<memoria_ledger>', PACKET_FOOTER = '</memoria_ledger>', NOW_HEADER = '<memoria_now>', NOW_FOOTER = '</memoria_now>';
export const STABLE_OPT_KEYS: (keyof StableOpts)[] = ['summaryLimit', 'ruleLimit', 'charLimit', 'extraLimit'];

