// ── 읽어 주기(TTS) 공용 입구 ── 다른 기능(전화 · 채팅 읽어 주기)은 이 파일의 것만 쓴다.
// 실제 구현은 src/tts/ 의 다른 파일이 setTtsImpl() 로 끼운다. 끼우기 전에는 아무 소리도 내지 않는다.

/** 한 캐릭터의 목소리 설정 (없으면 기본 목소리) */
export interface VoicePick { provider: string; voice: string; rate: number; pitch: number; connId?: string; model?: string; [k: string]: unknown }

/** 대본 한 토막 (목소리 연기): 누가 · 어떻게 · 무엇을. 글은 화면 글의 조각 그대로 둔다 (따라 읽기가 화면 글에서 찾는다) */
export interface Take {
  text: string;
  /** say 소리 내어 한 말 · think 속마음 · narr 지문(해설) · text 보낸 문자(대화 모드 말풍선) */
  kind?: 'say' | 'think' | 'narr' | 'text';
  /** 목소리 주인 (캐릭터 id) */ charId?: string | null;
  /** 화면에 띄울 이름 (카드가 없는 조연은 이것만) */ name?: string;
  /** 목소리를 직접 정한다 (해설 · 처음 보는 인물) */ voice?: Partial<VoicePick>;
  /** 말투: 영어 낱말 몇 개 (whispering, cheerful …) — 공급자마다 알맞게 옮긴다 */ how?: string[];
  /** 이 토막 바로 앞에 울릴 효과음 · 이 토막부터 깔 바탕 소리 ('' = 바탕 소리 그치기) */ sound?: string; bed?: string;
}

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
  /** 이제부터 받는 글의 말투 (전화의 목소리 색) */
  tone?(how: string[]): void;
}

/** 읽기를 부를 때 덧붙이는 것 */
export interface SpeakOpts {
  charId?: string | null; voice?: Partial<VoicePick>;
  /** 화면이 자기 글을 알아보는 이름 (예: msg:<id> · call:<시각>) — 따라 읽기 표시가 쓴다 */
  key?: string;
  /** 읽는 글이 화면 글의 어디서 시작하는가 (문장을 눌러 거기부터 읽을 때) */
  at?: number;
  /** 소리 효과: phone = 전화기 너머 목소리처럼 (음성 연결의 목소리에만 — 브라우저 음성은 그대로) */
  fx?: 'phone';
  /** 말투 (영어 낱말 몇 개) */
  how?: string[];
}
/** 지금 읽는 자리 (따라 읽기 표시 · 읽기 단추가 본다) */
export interface Reading {
  key: string; job: number; charId?: string | null;
  /** 읽으라고 받은 글 (흘러오는 중이면 지금까지) */ src: string;
  /** 화면 글에서 읽기를 시작한 위치 */ at: number;
  /** 지금 읽는 조각(다듬은 글) · 그 번호 · 그 조각 안에서 지금 읽는 글자 위치 */ seg: string; segNo: number; char: number;
  paused: boolean; canBack: boolean; canNext: boolean;
  /** 목소리 연기로 읽을 때: 지금 토막의 이름 · 갈래 */ name?: string; kind?: Take['kind'];
}
/** 지금 읽는 것 한 줄 요약 (다른 화면의 재생 카드용). 낱말이 넘어갈 때는 바뀌지 않는다 */
export interface NowPlaying { key: string; charId?: string | null; name?: string; kind?: Take['kind']; /** 지금 읽는 문장 */ line: string; paused: boolean }

export interface TtsApi {
  /** 사용자가 읽어 주기를 켜 두었는가 (전역) */
  enabled(): boolean;
  /** 이 캐릭터의 목소리 (캐릭터 설정 → 기본값) */
  voiceFor(charId?: string | null): VoicePick;
  /** 글 하나를 읽는다. 끝나면 풀린다. signal 로 멈춤 */
  speak(text: string, o?: SpeakOpts & { signal?: AbortSignal }): Promise<void>;
  /** 흘러오는 글을 문장 단위로 읽는다 */
  stream(o?: SpeakOpts): SpeechStream;
  /** 대본(토막들)을 차례로 연기한다: 토막마다 목소리 · 말투 · 효과음 */
  perform?(takes: Take[], o?: SpeakOpts & { signal?: AbortSignal }): Promise<void>;
  /** 지금 나오는 소리의 크기 0~1 (말하는 모양 그리기용. 모르면 0) */
  level?(): number;
  /** 모두 멈춘(stopAll) 횟수 — 읽기가 저절로 끝났는지 멈춰서 끝났는지 가릴 때 */
  epoch?(): number;
  /** 모든 소리를 멈춘다 */
  stopAll(): void;
  /** 녹음용: 지금 나는 TTS 소리를 담을 수 있는 MediaStream (지원하지 않는 공급자 · 브라우저 음성이면 null) */
  captureStream?(): MediaStream | null;
  /** 지금 읽는 자리 (아무것도 안 읽으면 null) */
  reading(): Reading | null;
  /** 읽는 자리가 바뀔 때마다 부른다 (낱말이 넘어갈 때 · 멈춤 · 끝). 돌려받은 함수로 그만 듣는다 */
  watch(f: () => void): () => void;
  /** 읽기를 잠시 멈춘다 · 이어 읽는다 */
  pause(): void; resume(): void;
  /** 지금 읽는 글에서 앞(-1) · 다음(+1) 문장으로 */
  step(d: number): void;
}

const silent: TtsApi = {
  enabled: () => false,
  voiceFor: () => ({ provider: 'browser', voice: '', rate: 1, pitch: 1 }),
  speak: async () => { },
  stream: () => ({ push() { }, end() { }, stop() { }, done: Promise.resolve(), speaking: false }),
  stopAll() { },
  captureStream: () => null,
  reading: () => null, watch: () => () => { }, pause() { }, resume() { }, step() { },
};
let impl: TtsApi = silent;
const nowOf = (r: Reading | null): NowPlaying | null => r ? { key: r.key, charId: r.charId, name: r.name, kind: r.kind, line: r.seg, paused: r.paused } : null;
const sig = (n: NowPlaying | null) => n ? `${n.key}|${n.charId || ''}|${n.name || ''}|${n.kind || ''}|${n.line}|${n.paused ? 1 : 0}` : '';
let nowMemo: { sig: string; val: NowPlaying | null } = { sig: '', val: null };
export const setTtsImpl = (x: TtsApi) => { impl = x; };
/** 지금 쓰는 TTS (구현이 없으면 조용한 가짜) */
export const TTS: TtsApi = {
  enabled: () => impl.enabled(),
  voiceFor: id => impl.voiceFor(id),
  speak: (text, o) => impl.speak(text, o),
  stream: o => impl.stream(o),
  stopAll: () => impl.stopAll(),
  captureStream: () => impl.captureStream?.() ?? null,
  reading: () => impl.reading(),
  watch: f => impl.watch(f),
  pause: () => impl.pause(),
  resume: () => impl.resume(),
  step: d => impl.step(d),
  perform: (takes, o) => impl.perform ? impl.perform(takes, o) : impl.speak(takes.map(x => x.text).join('\n'), o),
  level: () => impl.level?.() ?? 0,
  epoch: () => impl.epoch?.() ?? 0,
};
/** 지금 읽는 것 (없으면 null) — 같은 문장을 읽는 동안은 같은 값을 돌려준다 */
export function nowPlaying(): NowPlaying | null {
  const n = nowOf(TTS.reading()), k = sig(n);
  if (k !== nowMemo.sig) nowMemo = { sig: k, val: n };
  return nowMemo.val;
}
/** 읽는 것이 바뀔 때만 (문장 · 사람 · 멈춤 · 끝) 부른다. 돌려받은 함수로 그만 듣는다 */
export function onNowPlaying(f: () => void): () => void {
  let last = sig(nowPlaying());
  return TTS.watch(() => { const k = sig(nowPlaying()); if (k !== last) { last = k; f(); } });
}
