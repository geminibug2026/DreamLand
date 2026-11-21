// 밤의 게시판: 자료 모양과 기본 설정 (쪽지 · 계정 · 묶음 · 알림)
// 쪽지(Note)는 글과 답글을 함께 담는다 — 답글은 root(매달린 글)와 re(바로 위 답글)를 가진 쪽지다.

/** 내 계정의 열쇠 (캐릭터 계정의 열쇠는 캐릭터 id) */
export const ME = 'me';

/** 계정 = 캐릭터 하나(또는 나). handle 은 손잡이 이름, voice 는 게시판에서의 말투 메모 */
export interface Account { id: string; handle: string; bio: string; voice: string; on: boolean; at: number; /** 아직 소개를 짓지 않았다 */ fresh?: boolean }
export interface Poll { q: string; opts: string[]; /** 계정 → 고른 칸 */ votes: Record<string, number> }
export interface Note {
  id: string; by: string; text: string; ts: number;
  /** 답글이면: 매달린 글 · 바로 위 답글(없으면 글에 바로) */ root?: string; re?: string;
  poll?: Poll;
  /** 모델이 적어 준 그림 설명 (그리기 전) · 그린/붙인 그림의 에셋 id */ imagePrompt?: string; image?: string;
  likes: string[]; echoes: string[];
  /** 어느 새로 고침에서 왔나 (되돌리기용) */ batch?: string;
  /** 대화 중 [post:] 로 올라온 글: 그 답장의 자리. 스와이프를 넘기면 off 로 거둔다 */ src?: { chatId: string; msgId: string; sw: number }; off?: boolean;
  /** 내가 숨긴 글 (프롬프트에도 싣지 않는다) */ hidden?: boolean;
}
/** 나에게 온 것 */
export interface Notice { id: string; kind: 'like' | 'reply' | 'echo' | 'vote'; by: string; note: string; ts: number; batch?: string }
/** 한 번의 새로 고침이 남긴 자국 — 이것만 있으면 그 묶음을 통째로 되돌릴 수 있다 */
export interface BatchLog { id: string; ts: number; notes: string[]; likes: [string, string][]; echoes: [string, string][]; votes: [string, string][]; ties: [string, string][] }
export interface FeedState {
  id: 'feed'; accounts: Account[]; notes: Note[]; /** 따르는 사이: 계정 → 따르는 계정들 */ follows: Record<string, string[]>;
  notices: Notice[]; seenAt: number; last: BatchLog | null; lastAt: number;
  /** 자동 새로 고침 장부 */ auto: { day: string; count: number; at: number };
}
export const emptyState = (): FeedState => ({ id: 'feed', accounts: [], notes: [], follows: {}, notices: [], seenAt: 0, last: null, lastAt: 0, auto: { day: '', count: 0, at: 0 } });

/** 설정 (S.settings.feed) */
export interface FeedCfg {
  /** 한 번에 새 글 몇 개 */ n: number; /** 답 토큰 상한 */ maxTokens: number; /** 내 글 글자 수 */ limit: number;
  /** 하루 자동 새로 고침 횟수 (0 = 끔) */ auto: number; /** 새 글의 그림을 바로 그리기 */ autoImage: boolean;
  /** 대화에 게시판 활동 싣기 (대화 모드 기본) · 몇 시간 안의 것 · 최대 몇 개 · 토큰 상한 */ carry: boolean; carryHours: number; carryMax: number; carryTokens: number;
  /** 대화 모드에서 캐릭터가 [post:] 로 글을 올릴 수 있게 */ chatPost: boolean;
  /** 옛 글 회상 개수 · 허락한 대화에서 가져올 줄 수 · 기억 줄 수 */ recall: number; mentionLines: number; memLines: number;
  /** 덧붙일 지침 (비우면 없음) · 글 언어 (비우면 화면 언어) */ guide: string; lang: string;
}
export const FEED_DEFAULTS: FeedCfg = { n: 4, maxTokens: 2400, limit: 280, auto: 0, autoImage: false, carry: true, carryHours: 48, carryMax: 5, carryTokens: 320, chatPost: true, recall: 3, mentionLines: 6, memLines: 3, guide: '', lang: '' };
/** 대화별 스위치 (chat.feed) */
export interface ChatFeed { /** 게시판에서 이 대화를 언급해도 됨 (기본 꺼짐) */ mention?: boolean; /** 게시판 활동을 이 대화에 싣기 (정하지 않으면 대화 모드에서만) */ carry?: boolean }

// ── 모델이 내는 묶음 (직접 정한 모양) ──
// { "notes":[{ "k":"n1", "by":"손잡이", "text":"…", "poll":{ "q":"…", "opts":["…","…"] }, "image":"그림 설명" }],
//   "acts":[{ "by":"손잡이", "on":"n1 또는 e3", "do":"like|echo|reply|vote", "text":"…", "pick":0, "k":"r1", "under":"r1 또는 e7" }],
//   "ties":[{ "a":"손잡이", "b":"손잡이" }] }
export interface RawBatch { notes?: unknown; acts?: unknown; ties?: unknown; [k: string]: unknown }
/** 걸러 낸 뒤의 묶음 — 계정 id 와 실제 글 id(또는 묶음 안 열쇠)로 풀려 있다 */
export interface CleanNote { k: string; by: string; text: string; poll?: { q: string; opts: string[] }; image?: string }
export interface CleanAct { by: string; do: 'like' | 'echo' | 'reply' | 'vote'; /** 묶음 안 글이면 k, 기존 글이면 id */ on: string; local: boolean; text?: string; pick?: number; k?: string; under?: string; underLocal?: boolean }
export interface CleanBatch { notes: CleanNote[]; acts: CleanAct[]; ties: [string, string][]; dropped: string[] }
