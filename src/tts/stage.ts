// ── 목소리 연기 표시: 답변을 쓰는 모델에게 표시를 부탁하는 프롬프트 조각 · 받은 답변에서 표시 떼기 ──
// 추가 모델 호출 없이, 답변을 쓰는 모델이 그 자리에서 단다. 표시는 화면 · 저장 글에 남지 않는다 (src/tts/marks.ts).
//
// 이 조각이 실리는 곳: RP 대화(새 답 · 다시 쓰기 · 이어 쓰기, 그룹 포함) · 대화 모드에서 연 장면.
// 실리지 않는 곳: 대화 모드(줄마다 이미 갈래가 표시된다) · 통화 · 음성 메시지 · 대신 쓰기 · 스크립트 생성(quiet) · 변수 갱신 같은 보조 호출 ·
//   삽화 분석 · 기억 정리 (이 둘은 따로 부르는 호출이라 이 조각을 거치지 않는다).
import { X, type PromptInfo, type PromptPiece } from '../lib/hooks';
import type { Swipe } from '../lib/types';
import { cfg } from './config';
import { BED_IDS, SOUND_IDS, mergeVoice, readVoiceMarks, stripVoiceMarks, type VoiceMeta } from './marks';

export const VOICE_MARKS = `<voice_acting>
This story is read aloud with a separate voice for each person. Add small marks for the voice player. They are removed before anything is shown, so write the story itself exactly as you otherwise would.
- Right before the opening quotation mark of every spoken line, name the speaker: [@Name]"…". When the way it is said matters, add one to three plain English words: [@Name: whispering, teasing]"…".
- A thought written out in the text gets [@Name: thought] in the same place.
- Names to use: {{names}}. Anyone else gets a short name or role, the same every time, with (f) or (m): [@Innkeeper (m): gruff]"…".{{sounds}}
- Narration needs no mark. Never mention, explain or describe the marks.
</voice_acting>`;
export const VOICE_SOUNDS = `
- At the exact point a clear sound happens, you may add [sound: name], using one of: {{list}}. Only for sounds that matter, not in every reply.
- When the background sound of the place changes, add [ambience: name], using one of: {{beds}}, or [ambience: none] when it falls quiet.`;

/** 이 프롬프트에 연기 표시 부탁을 싣는가 */
export function wantsMarks(info: Pick<PromptInfo, 'chat' | 'type' | 'call' | 'aux'>): boolean {
  const c = cfg();
  if (!c.on || !c.act || !c.ask) return false;
  if (info.call || info.aux) return false;                                   // 통화 · 음성 메시지 · 보조 호출
  if (info.type === 'impersonate' || info.type === 'quiet') return false;   // 내 말 대신 쓰기 · 스크립트 생성
  return info.chat.mode !== 'talk';                                           // 대화 모드는 줄 갈래로 충분 (연 장면은 RP 로 조립된다)
}

export function voicePiece(info: PromptInfo): PromptPiece[] {
  if (!wantsMarks(info)) return [];
  const c = cfg(), names = info.chars.map(ch => ch.name).filter(Boolean).join(', ') || '{{char}}';
  const sounds = c.sfx !== false ? VOICE_SOUNDS.replace('{{list}}', SOUND_IDS.join(', ')).replace('{{beds}}', BED_IDS.join(', ')) : '';
  return [{ where: 'end', src: '목소리 연기 표시', content: VOICE_MARKS.replace('{{names}}', names).replace('{{sounds}}', sounds) }];
}

/** 받은 답변: 표시를 떼어 내 답변 한 장에 적는다. 이어 쓴 답변은 앞서 적은 것에 더한다 */
export function takeVoice(text: string, o: { swipe: Swipe; type: string }): string {
  const r = readVoiceMarks(text), sw = o.swipe as Swipe & { voice?: VoiceMeta };
  const has = r.meta.lines.length || r.meta.cues.length;
  if (o.type === 'continue') { if (has) sw.voice = mergeVoice(sw.voice, r.meta); }
  else if (has) sw.voice = r.meta; else delete sw.voice;
  return r.text;
}

let on = false;
/** 읽어 주기 기능이 켤 때 한 번 */
export function setupStage() {
  if (on) return; on = true;
  X.prompt.push({ owner: 'tts', fn: voicePiece });
  X.marks.push({ owner: 'tts', strip: stripVoiceMarks, take: takeVoice });
}
