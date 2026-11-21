// 이어진 방 · 속내 쪽지 · 귓속말 · 자리에 없는 사람 · 끊고 들어오기 — 대화방과 메시지에 얹는 자료 꼴
import type { Chat, Msg, Swipe } from '../lib/types';

/** 나누는 방식: lines = 최근 몇 줄 · memory = 기억(장기기억 기록)만 · off = 나누지 않음 */
export type Share = 'lines' | 'memory' | 'off';
/** 톡 방에서 이야기(RP) 방의 일을 말하는 자리: self = 그 일을 겪은 본인으로 · actor = 그 배역을 연기한 배우로 */
export type Frame = 'self' | 'actor';
/** 대화방에 얹는 것 (chat.th) */
export interface ThCfg {
  /** 이어진 방들의 id — 서로의 목록에 함께 적힌다 */ links?: string[];
  /** 이 방이 이어진 방에서 받아 오는 것 (기본 lines) */ share?: Share; /** 몇 줄 (기본 6) */ shareN?: number; frame?: Frame;
  /** 속내 쪽지 */ notes?: boolean;
  /** 끊고 들어오기 */ cut?: boolean;
  /** 캐릭터의 귓속말 (그룹 · 기본 켜짐) */ whisper?: boolean; /** 캐릭터끼리의 귓속말은 나에게도 가린다 ("엿듣기"로 연다) */ veilMe?: boolean;
  /** 자리에 없는 캐릭터 id */ away?: string[]; /** 답장의 [leave:] [enter:] 로 스스로 드나든다 */ autoAway?: boolean;
  /** 톡에서 캐릭터가 먼저 "장면으로 가자"고 권할 수 있다 */ stage?: boolean;
  /** 장면 건네기로 열린 방: 돌아갈 톡 방과 장면 이름 */ origin?: { id: string; title: string; place?: string; at: number };
}
export type ThChat = Chat & { th?: ThCfg };
/** 캐릭터가 한 귓속말 한 건. to = 캐릭터 id 또는 'user' */
export interface Whisper { to: string; text: string; /** 가려 둔 것을 내가 엿들었다 */ peeked?: boolean }
/** 다른 방에 남긴 말 한 건 */
export interface Relay { id: string; room: string; text: string }
/** 스와이프에 얹는 것: 그 답장의 속내 · 귓속말 · 끊은 자리 · 옮겨 말한 것 */
export type ThSwipe = Swipe & {
  thNotes?: string; /** 이 답장에서 지난 속내를 모두 지웠다 */ thWipe?: boolean;
  thWh?: Whisper[]; thCut?: { id: string; at: number }; thTo?: Relay[];
};
/** 방과 방 사이에 남는 카드 (시스템 메시지) */
export interface ThCard { kind: 'invite' | 'left' | 'arrived' | 'visited'; title?: string; place?: string; line?: string; premise?: string; room?: string; by?: string; done?: boolean }
export type ThMsg = Msg & {
  /** 내 귓속말: 들은 캐릭터 id */ thW?: { to: string[] };
  /** 이 말이 오갈 때 자리에 없던 캐릭터 id */ thGone?: string[];
  /** 다른 방에서 건너온 말 */ thFrom?: { id: string; room: string };
  thCard?: ThCard;
};
export const thOf = (chat: Chat): ThCfg => ((chat as ThChat).th ||= {});
export const thPeek = (chat?: Chat | null): ThCfg => (chat as ThChat | null | undefined)?.th || {};
export const swOf = (m: Msg): ThSwipe => (m.swipes[m.sw] || { text: '' }) as ThSwipe;
