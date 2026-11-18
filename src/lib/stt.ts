// 말로 입력하기 (음성 인식). 브라우저에 든 음성 인식(Web Speech API)을 쓴다 — 서버도 키도 필요 없다.
// 지원하지 않는 브라우저(일부 Firefox 등)에서는 단추를 보이지 않는다.
import { getLang } from '../i18n';

interface Rec {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecCtor = new () => Rec;
const ctor = (): RecCtor | null => { if (typeof window === 'undefined') return null; const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }; return w.SpeechRecognition || w.webkitSpeechRecognition || null; };
/** 이 브라우저에서 말로 입력할 수 있는가 */
export const sttSupported = () => !!ctor();
const LOCALE: Record<string, string> = { ko: 'ko-KR', en: 'en-US', 'zh-CN': 'zh-CN', ja: 'ja-JP' };
/** 인식할 언어: 화면 언어를 따른다 */
export const sttLang = () => LOCALE[getLang()] || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en-US';

let live: Rec | null = null;
/** 지금 듣고 있는가 */
export const listening = () => !!live;
/**
 * 듣기 시작. 한 번 말을 마치면(잠깐 쉬면) 끝난다.
 * onText(확정된 글, 아직 바뀔 수 있는 글) 이 말하는 동안 계속 불리고, 끝나면 onEnd(확정된 글 전체).
 * 돌려주는 함수를 부르면 그 자리에서 멈춘다 (그때까지 들은 글로 onEnd).
 */
export function listen(o: { onText?: (final: string, interim: string) => void; onEnd: (text: string) => void; onError?: (why: string) => void }): () => void {
  const C = ctor(); if (!C) { o.onError?.('unsupported'); o.onEnd(''); return () => { }; }
  live?.abort();
  const r = new C(); let done = '', ended = false;
  r.lang = sttLang(); r.continuous = false; r.interimResults = true;
  r.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i], t = res[0]?.transcript || ''; if (res.isFinal) done += t; else interim += t; }
    o.onText?.(done, interim);
  };
  const finish = () => { if (ended) return; ended = true; if (live === r) live = null; o.onEnd(done.trim()); };
  r.onerror = e => { if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') o.onError?.(e.error); finish(); };
  r.onend = finish;
  live = r;
  try { r.start(); } catch (e) { o.onError?.(String((e as Error)?.message || e)); finish(); }
  return () => { try { r.stop(); } catch { finish(); } };
}
