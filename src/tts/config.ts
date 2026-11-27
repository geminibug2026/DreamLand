// ── 읽어 주기 설정 (S.settings.tts) ──
import { S } from '../lib/core';
import type { Conn } from '../lib/types';
import type { VoicePick } from './api';

export interface TtsCfg {
  /** 읽어 주기 켜기 (자동 읽기 · 전화가 이것을 본다) */
  on: boolean;
  /** 새 답변을 자동으로 읽기 */
  autoRead: boolean;
  /** *행동* 도 읽을지 */
  actions: 'read' | 'skip';
  /** 전체 속도 배율 · 음량 (0~1) */
  rate: number; volume: number;
  /** 기본 목소리 */
  voice: VoicePick;
  /** 캐릭터 id → 목소리 (없으면 기본) */
  chars: Record<string, VoicePick>;
  /** 메시지를 읽는 동안 가는 한 줄 띠에 그 글을 띄우고 읽는 자리를 따라간다 */
  follow: boolean;
  /** 그 띠의 자리: 위(대화 머리 아래) · 아래(입력창 위) */
  stripAt: 'top' | 'bottom';
  /** 메시지 안에서도 읽는 낱말을 옅게 짚는다 */
  inMsg: boolean;
  // ── 목소리 연기 ──
  /** 대사는 말한 사람의 목소리로, 지문은 해설 목소리로, 속마음은 속삭이듯 나누어 읽는다 */
  act: boolean;
  /** 답변을 쓸 때 연기 표시(누가 · 어떤 말투로 · 효과음)를 함께 받는다 — 모델 호출은 그대로, 프롬프트만 조금 길어진다 */
  ask: boolean;
  /** 해설(지문) 목소리. 없으면 그 메시지 캐릭터의 목소리 그대로 */
  narrator?: VoicePick;
  /** 카드가 없는 인물(처음 보는 사람)의 목소리: 여자 · 남자 · 그 밖 */
  extras: { f?: VoicePick; m?: VoicePick; x?: VoicePick };
  /** 읽을 것: all = 지문까지 · lines = 대사와 속마음만 */
  only: 'all' | 'lines';
  /** 말하는 사람이 바뀔 때 쉬는 틈 (밀리초) */
  gap: number;
  /** 말투를 얼마나 살릴지: 0 담담하게 · 1 보통 · 2 크게 */
  acting: number;
  /** 목소리마다 다른 소리 크기를 고르게 맞춘다 (음성 연결의 목소리) */
  even: boolean;
  /** 장면 소리: 효과음 · 바탕 소리 켜기, 각각의 크기 (0~1) */
  sfx: boolean; sfxVol: number; bedVol: number;
  /** 다 읽으면 다음 답변으로 이어서 읽는다 */
  chain: boolean;
  /** 발음 사전: 이 글자는 이렇게 읽는다 (charId 가 있으면 그 캐릭터 목소리에서만) */
  pron: PronWord[];
  /** 만든 목소리를 이 브라우저에 보관해 다시 들을 때 다시 만들지 않는다 (비용 아낌) */
  keep: boolean;
}
export interface PronWord { from: string; to: string; charId?: string }
export const DEFAULT_VOICE: VoicePick = { provider: 'browser', voice: '', rate: 1, pitch: 1 };

export function cfg(): TtsCfg {
  const st = S.settings as unknown as { tts?: Partial<TtsCfg> };
  const c = (st.tts ||= {});
  c.on ??= false; c.autoRead ??= false; c.actions ||= 'read'; c.rate ??= 1; c.volume ??= 1;
  c.voice ||= { ...DEFAULT_VOICE }; c.chars ||= {}; c.follow ??= true; if (c.stripAt !== 'bottom') c.stripAt = 'top'; c.inMsg ??= false;
  c.act ??= true; c.ask ??= false; c.extras ||= {}; if (c.only !== 'lines') c.only = 'all'; c.gap ??= 280; c.acting ??= 1; c.even ??= true;
  c.sfx ??= true; c.sfxVol ??= 0.8; c.bedVol ??= 0.45; c.chain ??= false; c.pron ||= []; c.keep ??= true;
  return c as TtsCfg;
}
export const saveCfg = () => S.saveSettings();

/** 음성 연결인가 (제공자 id 가 tts_ 로 시작) */
export const isTtsProvider = (p?: string) => !!p && p.startsWith('tts_');
export const ttsConns = (): Conn[] => S.conns.filter(c => isTtsProvider(c.provider));
/** 목소리 설정이 가리키는 연결 */
export function connOf(v: Partial<VoicePick>): Conn | undefined {
  if (!v || v.provider === 'browser') return undefined;
  return (v.connId ? S.get('conns', v.connId as string) : undefined) || ttsConns().find(c => c.provider === v.provider);
}
