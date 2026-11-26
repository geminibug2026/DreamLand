// 곁들임(extras) 설정: 딱지 · 반응 · 손끝 울림 · 배경 서가 · 캐릭터 꾸밈 · 지운 메시지 보관함이 함께 쓰는 값
import { S } from '../lib/core';

export interface ExtrasCfg {
  /** 딱지: 캐릭터가 보내는 방식(pick = 직접 고름 · mood = 감정으로 자동 · off) · RP 에서도 · 내 딱지를 그림으로도 붙이기 · 최근 쓴 것 · 입력창에 단추 보이기(기본 끔 — 끄면 입력창 「+」 메뉴에서 보낸다) */
  stk: { ai: 'pick' | 'mood' | 'off'; rp: boolean; vision: boolean; recent: string[]; moodRate: number; btn: boolean };
  /** 반응: 최근 쓴 것 · 대화 모드에서 알리기 · RP 에서도 알리기 */
  react: { recent: string[]; talk: boolean; rp: boolean };
  /** 손끝 울림: 켬 · 세기(0.5~1.6) · 답장 · 캐릭터 명령 · 게임 · 전화 */
  buzz: { on: boolean; level: number; reply: boolean; ai: boolean; game: boolean; call: boolean };
  /** 캐릭터 꾸밈: 캐릭터 id → 허락한 CSS 의 지문 ('no' = 묻지 않기) */
  css: { ok: Record<string, string> };
  /** 지운 메시지를 두는 날 수 */
  trash: { days: number };
}
const DEF: ExtrasCfg = {
  stk: { ai: 'pick', rp: false, vision: false, recent: [], moodRate: 0.35, btn: false },
  react: { recent: [], talk: true, rp: false },
  buzz: { on: false, level: 1, reply: true, ai: true, game: true, call: true },
  css: { ok: {} },
  trash: { days: 30 },
};
/** 설정 값. 없던 칸은 기본값으로 채워서 돌려준다 (저장은 고칠 때 S.set({}) 로) */
export function cfg(): ExtrasCfg {
  const st = S.settings as unknown as { extras?: Partial<ExtrasCfg> }, c = (st.extras ||= {}) as Record<string, Record<string, unknown>>;
  for (const [k, v] of Object.entries(DEF)) c[k] = { ...(v as object), ...(c[k] || {}) };
  return c as unknown as ExtrasCfg;
}
export const saveCfg = () => S.set({});
/** 글자열 지문 (같은 글인지 가리는 데만 쓴다) */
export const hash = (s: string) => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return (x >>> 0).toString(36); };
/** 씨앗 있는 난수 (그림을 늘 같게 그리려고) */
export const rng = (seed: string) => { let a = parseInt(hash(seed), 36) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
