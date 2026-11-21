// 막후(대화 뒤에서 일하는 조수들)의 자료 꼴
import type { Chat, Swipe } from '../lib/types';

/** 조수가 일하는 때: 답장 전 · 답장 뒤 */
export type Phase = 'before' | 'after';
/** 결과가 가는 곳: inject 본문 프롬프트에 넣기 · rewrite 답장 고쳐 쓰기 · aside 나만 보는 메모 · json 자료로 보관 */
export type Out = 'inject' | 'rewrite' | 'aside' | 'json';
export type Mode = 'rp' | 'talk' | 'game';
/** 내장 조수가 하는 특별한 일 (맞춤 조수는 비어 있다) */
export type Kind = 'seats' | 'proof' | 'growth' | 'keeper' | 'scale' | 'props';

export interface CrewDef {
  id: string; name: string; desc?: string; phase: Phase; out: Out;
  /** 몇 턴마다 (1 = 매 턴) */ every: number;
  /** 있으면 최근 글에 이 낱말이 나올 때만 깨어난다 */ keywords?: string[];
  /** 낱말이 안 나와도 이만큼 쉬었으면 한 번 돈다 (0 = 낱말이 나올 때만) */ maxSkip?: number;
  modes: Mode[]; prompt: string;
  /** inject 일 때 프롬프트의 어디에 */ where?: 'top' | 'before' | 'depth' | 'end'; depth?: number;
  /** 한 번에 받을 결과의 길이 어림 (토큰) */ max?: number;
  builtin?: boolean; kind?: Kind;
  /** 모델을 부르지 않는 조수 (몰입 소품) */ free?: boolean;
  /** 같은 턴을 다시 생성해도 다시 돌지 않는다 (제안을 쌓는 조수) */ once?: boolean;
}

/** 관객 한 사람 */
export interface Seat { no: string; nick: string; trait: string }
export interface SeatLine { who: number; text: string }

/** 검토를 기다리는 제안 */
export interface Proposal {
  id: string; kind: 'card' | 'lore'; turn: number; ts: number; reason?: string;
  // 캐릭터 카드
  charId?: string; field?: string; oldText?: string; newText?: string;
  // 로어북
  action?: 'add' | 'update'; name?: string; keys?: string[]; content?: string;
}
/** 받아들인 제안 (되돌릴 수 있게 앞의 글을 같이 둔다) */
export interface Applied extends Proposal { at: number; before?: string; loreId?: string; entryId?: string; undone?: boolean }

/** 이야기 저울이 혼자 쥐고 있는 것 */
export interface Scale { arc: string; next: string; cue: string; turn: number }

/** 대화에 붙는 막후 상태 (chat.crew) — 분기하면 대화와 함께 복사된다 */
export interface ChatCrew {
  /** 이 대화에서만 켜고 끈 조수 (없으면 전체 설정을 따른다) */ on?: Record<string, boolean>;
  /** 조수별 비공개 메모 */ memo?: Record<string, string>;
  /** 조수가 마지막으로 일한 턴 */ last?: Record<string, number>;
  /** 밀어 주기: 다음 답장 한 번만 전개를 세게 민다 */ push?: boolean;
  /** 답장 전 조수의 결과 (같은 직전 메시지면 다시 부르지 않는다) */ pre?: { key: string; out: Record<string, string>; /** 이 직전 메시지에 대해 이미 돈 조수 */ ran?: string[] };
  pending?: Proposal[]; done?: Applied[]; scale?: Scale;
  /** 설정 사서가 채우는 이 대화의 로어북 */ loreId?: string;
  /** 객석 창: 열림 · 접힘 · 자리 */ seats?: { open?: boolean; fold?: boolean; x?: number; y?: number };
}
export type CrewChat = Chat & { crew?: ChatCrew; game?: { on?: boolean } };
/** 스와이프에 붙는 결과 */
export type CrewSwipe = Swipe & { crew?: Record<string, unknown>; crewOrig?: string; crewFix?: string[]; crewKept?: boolean };

/** 전체 설정 (settings.crew) */
export interface CrewCfg {
  /** 막후 전체 스위치 */ on: boolean;
  enabled: Record<string, boolean>; every: Record<string, number>;
  custom: CrewDef[];
  seats: { style: string; custom: string; lines: number };
  proof: { words: string[]; repeat: boolean; opener: boolean; speakFor: boolean };
  /** 내장 조수 프롬프트를 고쳐 쓴 것 (비우면 기본) */ prompts: Record<string, string>;
}

/** 실행 기록 한 줄 */
export interface LogItem { ts: number; turn: number; phase: Phase | 'rewrite' | 'manual'; ids: string[]; tokIn: number; tokOut: number; ms: number; ok: boolean; note?: string; out?: Record<string, string> }
