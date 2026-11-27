// ── 연기 표시: 답변에 모델이 단 기계 표시를 읽고 지운다 (화면 · DOM 과 무관한 순수 함수) ──
// 표시는 사람이 보는 글에 남지 않는다. 다 받은 답변에서 떼어 내 답변 한 장(swipe.voice)에 적어 두고, 읽어 줄 때 쓴다.
//   [@이름] · [@이름: 말투 낱말]      여는 따옴표 바로 앞: 그 대사를 누가 어떻게 말하는가. 이름 뒤 (f) · (m) 은 카드 없는 인물의 성별
//   [sound: 이름]                     그 자리에서 울릴 효과음
//   [ambience: 이름] · [ambience: none]  그 자리부터 깔 바탕 소리 · 그치기
//   [tone: 말투 낱말]                 (통화) 이번 차례의 목소리 색

/** 효과음 이름 (프롬프트에 그대로 싣는다) */
export const SOUND_IDS = ['knock', 'doorbell', 'door_open', 'door_close', 'footsteps', 'phone_buzz', 'message', 'glass_clink', 'glass_break', 'page', 'rustle', 'coins', 'lock', 'blade', 'sword', 'punch', 'gunshot', 'thunder', 'heartbeat', 'camera'] as const;
/** 바탕 소리 이름 */
export const BED_IDS = ['rain', 'storm', 'wind', 'cafe', 'street', 'night', 'forest', 'sea', 'fire', 'room'] as const;
export type SoundId = typeof SOUND_IDS[number];
export type BedId = typeof BED_IDS[number];
const SOUNDS = new Set<string>(SOUND_IDS), BEDS = new Set<string>(BED_IDS);
/** 모델이 조금 달리 쓴 이름을 맞춘다 (띄어쓰기 · 하이픈 · 복수형) */
const tidy = (x: string) => x.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/^the_/, '');
export function soundId(x: string): SoundId | null { const k = tidy(x); return (SOUNDS.has(k) ? k : SOUNDS.has(k.replace(/s$/, '')) ? k.replace(/s$/, '') : null) as SoundId | null; }
export function bedId(x: string): BedId | '' | null { const k = tidy(x); if (/^(none|off|stop|silence|quiet)$/.test(k)) return ''; return (BEDS.has(k) ? k : null) as BedId | null; }

/** 대사 한 줄에 붙은 표시: q = 표시 뒤 글의 앞머리(글자 · 숫자만, 소문자) · who = 이름 · g = 성별 · how = 말투 */
export interface VoiceLine { q: string; who: string; g?: 'f' | 'm'; how?: string[] }
/** 효과음 · 바탕 소리 자리: at = 표시를 뗀 글의 위치 · near = 그 뒤 글의 앞머리(고친 글에서 다시 찾는다) */
export interface VoiceCue { at: number; near: string; sound?: SoundId; bed?: BedId | '' }
/** 답변 한 장에 적어 두는 연기 표시 */
export interface VoiceMeta { lines: VoiceLine[]; cues: VoiceCue[] }

const WORD = /[\p{L}\p{N}]/u;
/** 글자 · 숫자만 앞에서 n 개 (소문자) */
export function head(text: string, n = 24): string { let o = ''; for (const ch of text) { if (WORD.test(ch)) { o += ch.toLowerCase(); if (o.length >= n) break; } } return o; }

const SPEAKER = /\[@([^\]\n]{1,80})\]/g;
const CUE = /\[(sound|ambience|tone)\s*:\s*([^\]\n]{0,60})\]/gi;
const ANY = new RegExp(`${SPEAKER.source}|${CUE.source}`, 'gi');
/** 말투 낱말 (쉼표 · 슬래시로 나눔, 셋까지) */
export const howOf = (s: string) => s.split(/[,/·|]+/).map(x => x.trim().toLowerCase().replace(/[^a-z \-']/g, '').trim()).filter(Boolean).slice(0, 3);
function speaker(inner: string): Omit<VoiceLine, 'q'> | null {
  const [rawName, ...rest] = inner.split(':'), how = howOf(rest.join(':'));
  let name = rawName.trim(), g: 'f' | 'm' | undefined;
  const gm = /\s*\((f|m|female|male|여|남|w|woman|man)\)\s*$/i.exec(name);
  if (gm) { g = /^(f|female|여|w|woman)$/i.test(gm[1]) ? 'f' : 'm'; name = name.slice(0, gm.index).trim(); }
  name = name.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!name || name.length > 40) return null;
  return { who: name, ...(g ? { g } : {}), ...(how.length ? { how } : {}) };
}

/** 받는 중인 글 끝에 걸린 덜 쓴 표시 ("[@Mi" · "[sou" …) */
function cutPartial(text: string): string {
  const i = text.lastIndexOf('['); if (i < 0) return text;
  const tail = text.slice(i + 1); if (tail.includes(']') || tail.includes('\n') || tail.length > 90) return text;
  const t = tail.toLowerCase();
  const could = !t || t.startsWith('@') || ['sound', 'ambience', 'tone'].some(w => w.startsWith(t.replace(/\s*:.*$/, '')) && (t.length <= w.length || /^\w+\s*:/.test(t)));
  return could ? text.slice(0, i).replace(/[ \t]+$/, '') : text;
}

/** 화면용: 표시를 모두 지운다 (받는 중이면 덜 쓴 것까지). 표시만 있던 줄은 줄째 없앤다 */
export function stripVoiceMarks(text: string): string {
  if (!text || !text.includes('[')) return text;
  return finish(cutPartial(text).split('\n').map(line => { if (!line.includes('[')) return line; const out = line.replace(new RegExp(`([ \\t]*)(?:${ANY.source})([ \\t]*)`, 'gi'), (m, a: string, ...r) => { const off = r[r.length - 2] as number, b = r[r.length - 3] as string; return off === 0 ? '' : (a || b) && !/^\s*$/.test(line.slice(off + m.length)) ? ' ' : ''; }); return out.trim() || line.trim() === '' ? out : null; }));
}
const finish = (lines: (string | null)[]) => lines.filter((l): l is string => l !== null).join('\n');

/** 다 받은 글: 표시를 떼어 내고 읽은 것을 돌려준다. tone = 통화의 목소리 색 (맨 앞의 것) */
export function readVoiceMarks(text: string): { text: string; meta: VoiceMeta; tone?: string[]; bed?: BedId | '' } {
  const meta: VoiceMeta = { lines: [], cues: [] };
  let tone: string[] | undefined, firstBed: BedId | '' | undefined;
  if (!text || !text.includes('[')) return { text, meta };
  const out: string[] = []; let pos = 0;   // pos = 지금까지 만든 글의 길이 (줄바꿈 포함)
  const pend: { at: number; line?: Omit<VoiceLine, 'q'>; cue?: Omit<VoiceCue, 'at' | 'near'> }[] = [];
  for (const line of text.split('\n')) {
    let built = '', last = 0, had = false;
    for (const m of line.matchAll(new RegExp(`([ \\t]*)(?:${ANY.source})([ \\t]*)`, 'gi'))) {
      had = true;
      const before = line.slice(last, m.index), atLineStart = !built && !before.trim();
      built += atLineStart ? before.replace(/[ \t]+$/, '') : before;
      const rest = line.slice(m.index + m[0].length);
      if (!atLineStart && (m[1] || m[m.length - 1]) && rest.trim()) built += ' ';
      const at = pos + built.length;
      const [, , spk, kind, arg] = m;
      if (spk != null) { const s = speaker(spk); if (s) pend.push({ at, line: s }); }
      else if (kind) {
        const k = kind.toLowerCase();
        if (k === 'sound') { const id = soundId(arg); if (id) pend.push({ at, cue: { sound: id } }); }
        else if (k === 'ambience') { const id = bedId(arg); if (id !== null) { pend.push({ at, cue: { bed: id } }); if (firstBed === undefined) firstBed = id; } }
        else if (k === 'tone' && !tone) { const h = howOf(arg); if (h.length) tone = h; }
      }
      last = m.index + m[0].length;
    }
    built += line.slice(last);
    if (had && !built.trim()) continue;   // 표시만 있던 줄
    out.push(built); pos += built.length + 1;
  }
  const clean = out.join('\n');
  for (const p of pend) {
    const after = clean.slice(p.at), near = head(after, 16);
    if (p.line) meta.lines.push({ q: head(after.replace(/^[\s"“「『'‘*(]+/, ''), 24), ...p.line });
    else if (p.cue) meta.cues.push({ at: p.at, near, ...p.cue });
  }
  return { text: clean, meta, ...(tone ? { tone } : {}), ...(firstBed !== undefined ? { bed: firstBed } : {}) };
}

/** 이어 쓴 답변: 앞서 적어 둔 표시에 새로 읽은 것을 더한다 */
export function mergeVoice(a: VoiceMeta | undefined, b: VoiceMeta): VoiceMeta {
  if (!a) return b;
  const seen = new Set(a.lines.map(l => l.q));
  return { lines: [...a.lines, ...b.lines.filter(l => !seen.has(l.q))], cues: [...a.cues, ...b.cues.filter(c => !a.cues.some(x => x.at === c.at && x.sound === c.sound && x.bed === c.bed))] };
}
