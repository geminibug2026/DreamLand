// ── 읽어 주기(TTS) 공용 입구 ── 다른 기능(전화 · 채팅 읽어 주기)은 이 파일의 것만 쓴다.
// 실제 구현은 src/tts/ 의 다른 파일이 setTtsImpl() 로 끼운다. 끼우기 전에는 아무 소리도 내지 않는다.

/** 한 캐릭터의 목소리 설정 (없으면 기본 목소리) */
export interface VoicePick { provider: string; voice: string; rate: number; pitch: number; connId?: string; model?: string; [k: string]: unknown }

/** 흘러오는 글을 받아 문장이 끝날 때마다 바로 읽는 묶음. 전화 · 스트리밍 답변에 쓴다 */
export interface SpeechStream {
  /** 새로 나온 글 조각 (스트리밍 델타) */
  push(delta: string): void;
  /** 글이 다 나왔다 — 남은 조각까지 읽고 끝낸다 */
  end(): void;
  /** 바로 멈춘다 (읽던 것 · 기다리던 것 모두 버림) */
  stop(): void;
  /** 다 읽었거나 멈췄을 때 */
  done: Promise<void>;
  /** 지금 소리를 내는 중인지 */
  readonly speaking: boolean;
}

export interface TtsApi {
  /** 사용자가 읽어 주기를 켜 두었는가 (전역) */
  enabled(): boolean;
  /** 이 캐릭터의 목소리 (캐릭터 설정 → 기본값) */
  voiceFor(charId?: string | null): VoicePick;
  /** 글 하나를 읽는다. 끝나면 풀린다. signal 로 멈춤 */
  speak(text: string, o?: { charId?: string | null; signal?: AbortSignal; voice?: Partial<VoicePick> }): Promise<void>;
  /** 흘러오는 글을 문장 단위로 읽는다 */
  stream(o?: { charId?: string | null; voice?: Partial<VoicePick> }): SpeechStream;
  /** 모든 소리를 멈춘다 */
  stopAll(): void;
  /** 녹음용: 지금 나는 TTS 소리를 담을 수 있는 MediaStream (지원하지 않는 공급자 · 브라우저 음성이면 null) */
  captureStream?(): MediaStream | null;
}

const silent: TtsApi = {
  enabled: () => false,
  voiceFor: () => ({ provider: 'browser', voice: '', rate: 1, pitch: 1 }),
  speak: async () => { },
  stream: () => ({ push() { }, end() { }, stop() { }, done: Promise.resolve(), speaking: false }),
  stopAll() { },
  captureStream: () => null,
};
let impl: TtsApi = silent;
export const setTtsImpl = (x: TtsApi) => { impl = x; };
/** 지금 쓰는 TTS (구현이 없으면 조용한 가짜) */
export const TTS: TtsApi = {
  enabled: () => impl.enabled(),
  voiceFor: id => impl.voiceFor(id),
  speak: (text, o) => impl.speak(text, o),
  stream: o => impl.stream(o),
  stopAll: () => impl.stopAll(),
  captureStream: () => impl.captureStream?.() ?? null,
};
