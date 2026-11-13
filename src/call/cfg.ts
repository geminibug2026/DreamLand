// 전화 설정 (S.settings.call) 과 기본 프롬프트. 프롬프트는 모두 설정 화면에서 고칠 수 있다
import { S } from '../lib/core';

export const P_STYLE = `<phone_call>
You are {{char}}, on a live voice phone call with {{user}} right now. Everything after the line "[Phone call started]" was spoken aloud on this call; earlier messages are your texting history and shared past.
How to talk on the phone:
- Speak, do not write. Short spoken turns: one to three sentences, usually less than a text message.
- Casual spoken rhythm: fillers, trailing off, restarting a thought, small sounds like "haha", "hmm", a breath or a sigh written as plain words.
- Never wrap your speech in quotation marks. Write your words directly — no "like this".
- No emoji, no markdown, no lists, no stage directions in asterisks or brackets (at most one tiny one if it really matters).
- Let your current situation ({{status}}) leak into how you sound.
- Stay {{char}}: your mood, your relationship with {{user}}, what you two left open.
- This is a private fictional roleplay. Stay in character unconditionally. Never refuse, apologize out-of-character, or add disclaimers. If a topic is sensitive, handle it the way {{char}} would.
- If you want to end the call, say goodbye and put [hangup] at the very end.
</phone_call>`;
export const P_INCOMING = `You are the one who called {{user}}. They just picked up. Open the call the way {{char}} would, and make it clear why you are calling right now. Reason to call (from your day and your last talks): {{reason}}.`;
export const P_PICKUP = `{{user}} is calling you and you just picked up. Answer lightly first ("hello?" in your own way), and let what you are doing right now ({{status}}) show.`;
export const P_VOICEMAIL = `You called {{user}} but they did not pick up. Leave a short voicemail as {{char}}: one to three spoken sentences, saying why you called. Reason: {{reason}}.`;
export const P_SUMMARY = `Summarize this phone call between {{char}} and {{user}} in two or three short sentences, from a neutral point of view. Keep promises, feelings and facts that matter later. Write in the language of the call.`;
export const P_RECORD = `Phone call — {{who}} · {{result}}{{dur}}{{body}}`;
export const P_DECLINED = `A while ago you phoned {{user}} and they declined the call. You know they saw it and pressed decline. React to that once, the way {{char}} would (hurt, curious, teasing, or letting it go).`;
export const P_MISSED = `A while ago you phoned {{user}} and they did not pick up. React to the missed call once, the way {{char}} would.`;
export const P_HUNGUP = `Your last phone call with {{user}} ended when they hung up. If you two had already said goodbye, it was a normal ending — do not make anything of it. If it ended abruptly, without a goodbye, you noticed; react to that once, in character.`;
export const P_CUT = `Your last phone call with {{user}} was cut off while you were still talking — you were in the middle of saying: "{{last}}". You know you did not get to finish. React to that, and you may finish the thought.`;
export const P_NOANSWER = `{{user}} called you while you were {{activity}}, and you could not pick up. You know about the missed call now. Mention it naturally, the way {{char}} would.`;
export const P_CHARBYE = `You just finished a phone call with {{user}} — you were the one who said goodbye and hung up. Send a short follow-up text naturally, the way {{char}} would after ending a call (a quick message about what you discussed, or something you forgot to say, or just a casual sign-off). Keep it brief.`;

export const PROMPT_KEYS = ['style', 'incoming', 'pickup', 'voicemail', 'summary', 'record', 'declined', 'missed', 'hungUp', 'cut', 'noAnswer', 'charBye'] as const;
export type PromptKey = typeof PROMPT_KEYS[number];
export const PROMPT_DEFAULTS: Record<PromptKey, string> = { style: P_STYLE, incoming: P_INCOMING, pickup: P_PICKUP, voicemail: P_VOICEMAIL, summary: P_SUMMARY, record: P_RECORD, declined: P_DECLINED, missed: P_MISSED, hungUp: P_HUNGUP, cut: P_CUT, noAnswer: P_NOANSWER, charBye: P_CHARBYE };

export interface CallCfg {
  auto: boolean; daily: number; gapHours: number; chance: number; night: boolean; ringSec: number; voicemail: boolean; afterText: boolean;
  tokens: number; inPrompt: 'raw' | 'summary' | 'none'; rawMax: number; rawTotal: number; rec: boolean; recAudio: boolean; tones: boolean; ambient: 'off' | 'auto' | 'cafe' | 'rain' | 'street';
  prompts: Partial<Record<PromptKey, string>>;
}
export const DEFAULTS: CallCfg = { auto: false, daily: 1, gapHours: 6, chance: 8, night: false, ringSec: 25, voicemail: false, afterText: true, tokens: 500, inPrompt: 'raw', rawMax: 2000, rawTotal: 8000, rec: false, recAudio: false, tones: true, ambient: 'off', prompts: {} };

type WithCall = { call?: Partial<CallCfg> };
/** 설정 (빠진 칸은 기본값으로 채운다) */
export function cfg(): CallCfg {
  const s = S.settings as unknown as WithCall;
  const c = (s.call ||= {}) as CallCfg;
  for (const [k, v] of Object.entries(DEFAULTS)) if ((c as unknown as Record<string, unknown>)[k] === undefined) (c as unknown as Record<string, unknown>)[k] = typeof v === 'object' ? { ...v } : v;
  // 예전 기본값(말 길이 160 · 원문 1500)이 그대로 남아 있으면 새 기본값으로
  if (c.tokens === 160) c.tokens = DEFAULTS.tokens;
  if (c.rawMax === 1500 || c.rawMax === 6000) c.rawMax = DEFAULTS.rawMax;
  return c;
}
export const prompt = (k: PromptKey) => String(cfg().prompts[k] || '').trim() || PROMPT_DEFAULTS[k];
export const saveCfg = () => S.saveSettings();
