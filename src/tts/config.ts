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
}
export const DEFAULT_VOICE: VoicePick = { provider: 'browser', voice: '', rate: 1, pitch: 1 };

export function cfg(): TtsCfg {
  const st = S.settings as unknown as { tts?: Partial<TtsCfg> };
  const c = (st.tts ||= {});
  c.on ??= false; c.autoRead ??= false; c.actions ||= 'read'; c.rate ??= 1; c.volume ??= 1;
  c.voice ||= { ...DEFAULT_VOICE }; c.chars ||= {};
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
