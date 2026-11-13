// ── 읽어 주기 공급자: 음성 연결(Conn, 제공자 id 'tts_…')로 저장한다 ──
// 키는 채팅 연결과 똑같이 다룬다: 드림랜드 서버가 있으면 서버 보관(꼬리표 @@dl:id:apiKey@@ 만 남김),
// 금고를 켰으면 암호문, 아니면 브라우저. 꼬리표가 든 요청은 core.ts 의 fetch 감싸개가 /api/proxy 로 돌린다.
import { PROVIDERS, type ProviderDef } from '../lib/engine';
import type { Conn } from '../lib/types';
import { t } from '../i18n';
import { Server } from '../lib/server';
import type { VoicePick } from './api';

export interface TtsDef extends ProviderDef { voiceStyle?: string }
const D = (name: string, base: string, models: string[], extra: Partial<ProviderDef> = {}): ProviderDef => ({ name, group: '음성', base, models, kind: 'tts', ...extra });
export const TTS_PROVIDERS: Record<string, ProviderDef> = {
  tts_openai: D('OpenAI TTS', 'https://api.openai.com/v1', ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd']),
  tts_eleven: D('ElevenLabs', 'https://api.elevenlabs.io', ['eleven_multilingual_v2', 'eleven_v4', 'eleven_v3', 'eleven_flash_v2_5', 'eleven_turbo_v2_5']),
  tts_google: D('Google Cloud TTS', 'https://texttospeech.googleapis.com', []),
  tts_azure: D('Azure Speech', '', [], { ph: 'https://eastus.tts.speech.microsoft.com' }),
  tts_minimax: D('MiniMax', 'https://api.minimax.io', ['speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-hd', 'speech-2.6-turbo', 'speech-02-hd', 'speech-02-turbo']),
  tts_fish: D('Fish Audio', 'https://api.fish.audio', ['s2.1-pro', 's2-pro', 's1', 'drama-3']),
  tts_compat: D('OpenAI compatible TTS', '', ['kokoro', 'tts-1'], { ph: 'http://127.0.0.1:8880/v1', keyless: true }),
};
Object.defineProperty(TTS_PROVIDERS.tts_compat, 'name', { get: () => t('tts.prov.compat'), enumerable: true, configurable: true });
Object.defineProperty(TTS_PROVIDERS.tts_compat, 'note', { get: () => t('tts.prov.compatNote'), enumerable: true, configurable: true });
Object.defineProperty(TTS_PROVIDERS.tts_azure, 'note', { get: () => t('tts.prov.azureNote'), enumerable: true, configurable: true });
Object.assign(PROVIDERS, TTS_PROVIDERS);

export const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
const defOf = (c: Conn) => TTS_PROVIDERS[c.provider] || TTS_PROVIDERS.tts_compat;
export const baseOf = (c: Conn) => (c.baseUrl || defOf(c).base || '').trim().replace(/\/+$/, '');

// ── 요청: 연결의 "서버를 거쳐 연결" 설정을 따르고, 막히면 서버를 거쳐 다시 한 번 ──
const viaProxy = (url: string, method: string, headers: Record<string, string>, body: string | undefined, signal?: AbortSignal) =>
  Server.proxy({ url, method, headers, body }, signal);
async function req(c: Conn, url: string, o: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}): Promise<Response> {
  const method = o.method || (o.body ? 'POST' : 'GET'), headers = o.headers || {};
  let r: Response;
  try { r = c.proxy ? await viaProxy(url, method, headers, o.body, o.signal) : await fetch(url, { method, headers, body: o.body, signal: o.signal }); }
  catch (e) {
    if ((e as Error)?.name === 'AbortError' || c.proxy) throw e;
    try { r = await viaProxy(url, method, headers, o.body, o.signal); } catch (e2) { if ((e2 as Error)?.name === 'AbortError') throw e2; throw new Error(t('tts.err.connect', { why: (e as Error)?.message || '' })); }
  }
  if (!r.ok) {
    const raw = await r.text().catch(() => '');
    let why = raw.slice(0, 300);
    try { const j = JSON.parse(raw); const e = j.error ?? j.detail ?? j.message ?? j.base_resp?.status_msg; why = typeof e === 'string' ? e : e?.message || JSON.stringify(e).slice(0, 300); } catch { }
    throw new Error(`${r.status} ${why}`.trim());
  }
  return r;
}
const keyOf = (c: Conn) => String(c.apiKey || '').trim();
const needKey = (c: Conn) => { if (!keyOf(c) && !defOf(c).keyless) throw new Error(t('tts.err.noKey', { name: c.name })); return keyOf(c); };
const needBase = (c: Conn) => { const b = baseOf(c); if (!b) throw new Error(t('tts.err.noUrl', { name: c.name })); return b; };
const json = (o: unknown) => JSON.stringify(o);
const JH = { 'Content-Type': 'application/json' };
const b64Blob = (b64: string, type = 'audio/mpeg') => new Blob([Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))], { type });
const hexBlob = (hex: string, type = 'audio/mpeg') => { const u = new Uint8Array(hex.length >> 1); for (let i = 0; i < u.length; i++) u[i] = parseInt(hex.substr(i * 2, 2), 16); return new Blob([u], { type }); };
const xml = (s: string) => s.replace(/[<>&'"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch] as string));
const langOfVoice = (v: string, text: string) => /^[a-z]{2,3}-[A-Z]{2}/.exec(v)?.[0] || (/[가-힣]/.test(text) ? 'ko-KR' : 'en-US');
const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v)) ? v : (v !== '' && v != null && isFinite(+(v as number)) ? +(v as number) : d);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export interface VoiceOpt { id: string; label: string }

/** 한 조각을 소리 파일로 만든다 */
export async function synth(c: Conn, v: VoicePick, text: string, speed: number, signal?: AbortSignal): Promise<Blob> {
  const key = needKey(c), voice = String(v.voice || '').trim(), model = String(v.model || c.model || defOf(c).models[0] || '').trim();
  const pitch = num(v.pitch, 1);
  switch (c.provider) {
    case 'tts_openai': case 'tts_compat': {
      const body: Record<string, unknown> = { model: model || 'tts-1', input: text, voice: voice || 'alloy', response_format: 'mp3', speed: clamp(speed, 0.25, 4) };
      if (v.instructions && /gpt-4o.*tts/.test(model)) body.instructions = String(v.instructions);
      const r = await req(c, needBase(c) + '/audio/speech', { headers: { ...JH, ...(key ? { Authorization: 'Bearer ' + key } : {}) }, body: json(body), signal });
      return r.blob();
    }
    case 'tts_eleven': {
      if (!voice) throw new Error(t('tts.err.noVoice'));
      if (/^eleven_v4/.test(model)) {   // v4 는 대화(Text to Dialogue) 주소로만 안내된다. 설정 이름이 similarity 이고 말 빠르기는 받지 않는다
        const body = { inputs: [{ text, voice_id: voice }], model_id: model, settings: { stability: num(v.stability, 0.5), similarity: num(v.similarity, 0.75) } };
        const r = await req(c, `${needBase(c)}/v1/text-to-dialogue/stream?output_format=mp3_44100_128`, { headers: { ...JH, 'xi-api-key': key, Accept: 'audio/mpeg' }, body: json(body), signal });
        return r.blob();
      }
      const body = { text, model_id: model || 'eleven_multilingual_v2', voice_settings: { stability: num(v.stability, 0.5), similarity_boost: num(v.similarity, 0.75), style: num(v.style, 0), speed: clamp(speed, 0.7, 1.2) } };
      const r = await req(c, `${needBase(c)}/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`, { headers: { ...JH, 'xi-api-key': key, Accept: 'audio/mpeg' }, body: json(body), signal });
      return r.blob();
    }
    case 'tts_google': {
      const name = voice || 'ko-KR-Standard-A';
      // Chirp 3 HD: speakingRate 0.25–2, audioConfig.pitch 미지원 → 보내지 않는다
      const chirp = /chirp/i.test(name);
      const audioConfig: Record<string, unknown> = { audioEncoding: 'MP3', speakingRate: clamp(speed, 0.25, chirp ? 2 : 4) };
      if (!chirp) audioConfig.pitch = clamp(Math.round((pitch - 1) * 20), -20, 20);
      const body = { input: { text }, voice: { languageCode: langOfVoice(name, text), name }, audioConfig };
      const r = await req(c, needBase(c) + '/v1/text:synthesize', { headers: { ...JH, 'X-Goog-Api-Key': key }, body: json(body), signal });
      const j = await r.json() as { audioContent?: string }; if (!j.audioContent) throw new Error(t('tts.err.empty'));
      return b64Blob(j.audioContent);
    }
    case 'tts_azure': {
      const name = voice || 'ko-KR-SunHiNeural', lang = langOfVoice(name, text);
      const rate = Math.round((speed - 1) * 100), pt = Math.round((pitch - 1) * 50), style = String(v.azStyle || '').trim();
      let inner = `<prosody rate="${rate >= 0 ? '+' : ''}${rate}%" pitch="${pt >= 0 ? '+' : ''}${pt}%">${xml(text)}</prosody>`;
      if (style) inner = `<mstts:express-as style="${xml(style)}">${inner}</mstts:express-as>`;
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}"><voice name="${xml(name)}">${inner}</voice></speak>`;
      const r = await req(c, needBase(c) + '/cognitiveservices/v1', { headers: { 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'Ocp-Apim-Subscription-Key': key }, body: ssml, signal });
      return r.blob();
    }
    case 'tts_minimax': {
      const vs: Record<string, unknown> = { voice_id: voice || 'Korean_SweetGirl', speed: clamp(speed, 0.5, 2), vol: 1, pitch: clamp(Math.round((pitch - 1) * 12), -12, 12) };
      if (v.emotion) vs.emotion = String(v.emotion);
      const body = { model: model || 'speech-02-turbo', text, stream: false, voice_setting: vs, audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 } };
      const r = await req(c, needBase(c) + '/v1/t2a_v2', { headers: { ...JH, Authorization: 'Bearer ' + key }, body: json(body), signal });
      const j = await r.json() as { data?: { audio?: string }; base_resp?: { status_code?: number; status_msg?: string } };
      if (j.base_resp?.status_code) throw new Error(j.base_resp.status_msg || String(j.base_resp.status_code));
      if (!j.data?.audio) throw new Error(t('tts.err.empty'));
      return hexBlob(j.data.audio);
    }
    case 'tts_fish': {
      const body: Record<string, unknown> = { text, format: 'mp3', prosody: { speed: clamp(speed, 0.5, 2), volume: 0 } };
      if (voice) body.reference_id = voice;
      const r = await req(c, needBase(c) + '/v1/tts', { headers: { ...JH, Authorization: 'Bearer ' + key, model: model || 's2.1-pro' }, body: json(body), signal });
      return r.blob();
    }
  }
  throw new Error(t('tts.err.unknown', { name: c.provider }));
}

/** 공급자의 목소리 목록 */
export async function listVoices(c: Conn): Promise<VoiceOpt[]> {
  const key = keyOf(c);
  switch (c.provider) {
    case 'tts_openai': return OPENAI_VOICES.map(id => ({ id, label: id }));
    case 'tts_compat': {
      try {
        const r = await req(c, needBase(c) + '/audio/voices', { headers: key ? { Authorization: 'Bearer ' + key } : {} });
        const j = await r.json() as { voices?: (string | { id?: string; name?: string })[] } | string[];
        const arr = Array.isArray(j) ? j : j.voices || [];
        const out = arr.map(x => typeof x === 'string' ? { id: x, label: x } : { id: String(x.id || x.name), label: String(x.name || x.id) }).filter(x => x.id);
        if (out.length) return out;
      } catch { }
      return OPENAI_VOICES.map(id => ({ id, label: id }));
    }
    case 'tts_eleven': {
      const r = await req(c, needBase(c) + '/v1/voices', { headers: { 'xi-api-key': needKey(c) } });
      const j = await r.json() as { voices?: { voice_id: string; name: string; category?: string }[] };
      return (j.voices || []).map(x => ({ id: x.voice_id, label: x.name + (x.category ? ` · ${x.category}` : '') }));
    }
    case 'tts_google': {
      const r = await req(c, needBase(c) + '/v1/voices', { headers: { 'X-Goog-Api-Key': needKey(c) } });
      const j = await r.json() as { voices?: { name: string; languageCodes?: string[]; ssmlGender?: string }[] };
      return (j.voices || []).map(x => ({ id: x.name, label: `${x.name}${x.ssmlGender ? ' · ' + x.ssmlGender.toLowerCase() : ''}` })).sort((a, b) => +!a.id.startsWith('ko') - +!b.id.startsWith('ko') || a.id.localeCompare(b.id));
    }
    case 'tts_azure': {
      const r = await req(c, needBase(c) + '/cognitiveservices/voices/list', { headers: { 'Ocp-Apim-Subscription-Key': needKey(c) } });
      const j = await r.json() as { ShortName: string; LocalName?: string; Gender?: string; StyleList?: string[] }[];
      return j.map(x => ({ id: x.ShortName, label: `${x.ShortName}${x.LocalName ? ' · ' + x.LocalName : ''}${x.StyleList?.length ? ' · ' + x.StyleList.slice(0, 4).join('/') : ''}` })).sort((a, b) => +!a.id.startsWith('ko') - +!b.id.startsWith('ko') || a.id.localeCompare(b.id));
    }
    case 'tts_minimax': {
      const r = await req(c, needBase(c) + '/v1/get_voice', { headers: { ...JH, Authorization: 'Bearer ' + needKey(c) }, body: json({ voice_type: 'all' }) });
      const j = await r.json() as Record<string, { voice_id: string; voice_name?: string }[] | undefined>;
      return ['system_voice', 'voice_cloning', 'voice_generation'].flatMap(k => j[k] || []).map(x => ({ id: x.voice_id, label: x.voice_name ? `${x.voice_name} · ${x.voice_id}` : x.voice_id }));
    }
    case 'tts_fish': {
      const r = await req(c, needBase(c) + '/model?self=true&page_size=100', { headers: { Authorization: 'Bearer ' + needKey(c) } });
      const j = await r.json() as { items?: { _id: string; title?: string }[] };
      return (j.items || []).map(x => ({ id: x._id, label: x.title || x._id }));
    }
  }
  return [];
}
