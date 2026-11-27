// ── 대본 만들기: 메시지 글 → 목소리 연기 토막들 (화면 · DOM 과 무관한 순수 함수) ──
// 무엇이 대사이고 무엇이 지문인지는 글에 이미 있는 표시로만 가른다: 따옴표 = 소리 내어 한 말, 작은따옴표 = 속마음, *별표* = 행동.
// 누가 말했는지는 모델이 단 연기 표시(swipe.voice)로만 안다. 표시가 없는 대사는 그 메시지의 캐릭터 몫이다 (글을 보고 짐작하지 않는다).
import type { Take, VoicePick } from './api';
import { head, type VoiceCue, type VoiceLine, type VoiceMeta } from './marks';
import { norm } from './follow';

export interface Person { id: string; name: string }
export interface ScriptOpts {
  /** 그 메시지의 캐릭터 · 이 방의 캐릭터들 */
  charId?: string | null; people: Person[];
  /** talk = 대화 모드 말풍선 (줄마다 갈래) · rp = 이야기 글 */
  mode: 'talk' | 'rp';
  /** 모델이 단 연기 표시 */
  meta?: VoiceMeta | null;
  /** 해설 목소리 (없으면 그 메시지 캐릭터의 목소리) · 처음 보는 인물의 목소리 */
  narrator?: VoicePick; extras?: { f?: VoicePick; m?: VoicePick; x?: VoicePick };
  /** *행동* 읽기 · 지문까지 읽기 */
  actions: 'read' | 'skip'; only: 'all' | 'lines';
}

/** 읽지 않을 덩어리(코드 · 숨은 블록 · 꼬리표 · 주석)를 같은 길이의 빈칸으로 가린다 — 글자 위치가 화면 글과 그대로 맞는다 */
export function mask(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return String(text || '')
    .replace(/```[\s\S]*?(?:```|$)/g, blank)
    .replace(/<(think|thinking|details|style|script|status|hud|statusblock|info)\b[^>]*>[\s\S]*?<\/\1>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<[^>\n]+>/g, blank)
    .replace(/^\s*\[[^\]\n]{0,300}\]\s*$/gm, blank)
    .replace(/^\s*\|.*\|\s*$/gm, blank);
}

type Kind = 'say' | 'think' | 'act' | 'narr' | 'text';
interface Seg { a: number; b: number; kind: Kind }
// 대사 "…" “…” 「…」 『…』 · 속마음 ‘…’ '…' · 행동 *…* (화면이 쓰는 것과 같은 표시)
const SEG = /("[^"\n]+?"|“[^”\n]+”|「[^」\n]+」|『[^』\n]+』)|(‘[^’\n]+’|(?<![\w가-힣])'[^'\n]{2,}?'(?![\w가-힣]))|((?<!\*)\*(?!\*)[^*\n]+\*(?!\*))/g;

/** 이야기 글을 조각으로: 대사 · 속마음 · 행동 · 지문 (cut = 효과음 자리에서도 나눈다) */
function split(text: string, cuts: number[]): Seg[] {
  const out: Seg[] = []; let pos = 0;
  const push = (a: number, b: number, kind: Kind) => {
    if (b <= a) return;
    const inner = cuts.filter(c => c > a && c < b);
    let s = a; for (const c of inner) { out.push({ a: s, b: c, kind }); s = c; } out.push({ a: s, b, kind });
  };
  for (const m of text.matchAll(SEG)) {
    const at = m.index!;
    push(pos, at, 'narr');
    push(at, at + m[0].length, m[1] ? 'say' : m[2] ? 'think' : 'act');
    pos = at + m[0].length;
  }
  push(pos, text.length, 'narr');
  return out.filter(s => /[\p{L}\p{N}]/u.test(text.slice(s.a, s.b)) || cuts.includes(s.a));
}

/** 대화 모드: 한 줄이 한 갈래 (그냥 쓴 줄 = 보낸 문자 · "…" = 소리 내어 한 말 · '…' = 속마음 · *…* = 행동) */
function talkLines(text: string): Seg[] {
  const out: Seg[] = []; let pos = 0;
  for (const line of text.split('\n')) {
    const a = pos, b = pos + line.length, t = line.trim(); pos = b + 1;
    if (!/[\p{L}\p{N}]/u.test(t)) continue;
    out.push({ a, b, kind: /^\*[^*]+\*$/.test(t) || /^\([^)]*\)$/.test(t) ? 'act' : /^['‘].*['’]$/.test(t) ? 'think' : /^["“「『].*["”」』]$/.test(t) ? 'say' : 'text' });
  }
  return out;
}

/** 효과음 표시의 자리를 지금 글에서 찾는다 (글을 고쳤으면 앞머리로 다시 찾는다. 못 찾으면 버린다) */
export function placeCues(text: string, cues: VoiceCue[]): { pos: number; cue: VoiceCue }[] {
  if (!cues?.length) return [];
  const n = norm(text), out: { pos: number; cue: VoiceCue }[] = [];
  for (const c of cues) {
    let pos = -1;
    if (!c.near) pos = Math.min(text.length, Math.max(0, c.at));
    else {
      const k = n.s.indexOf(c.near.slice(0, 12)); if (k < 0) continue;
      let best = k, i = k; while (i >= 0) { if (Math.abs(n.at[i] - c.at) < Math.abs(n.at[best] - c.at)) best = i; i = n.s.indexOf(c.near.slice(0, 12), i + 1); }
      pos = n.at[best];
      // 표시가 놓인 자리는 그 낱말 앞 (여는 따옴표 · 별표까지 포함)
      while (pos > 0 && /["“「『'‘*(\s]/.test(text[pos - 1]) && text[pos - 1] !== '\n') pos--;
      while (pos < text.length && /\s/.test(text[pos])) pos++;
    }
    out.push({ pos, cue: c });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

/** 이름으로 사람 찾기 (대소문자 · 앞 이름만 써도) */
export function findPerson(people: Person[], who: string): Person | undefined {
  const w = who.trim().toLowerCase(); if (!w) return undefined;
  return people.find(p => p.name.trim().toLowerCase() === w) || people.find(p => { const n = p.name.trim().toLowerCase(); return n.split(/\s+/)[0] === w || w.split(/\s+/)[0] === n.split(/\s+/)[0] && n.length > 1; });
}

/** 메시지 글 → 토막들. text 는 화면 글(번역을 보이고 있으면 번역) 그대로 */
export function buildScript(text: string, o: ScriptOpts): Take[] {
  const src = mask(text), placed = placeCues(src, o.meta?.cues || []);
  const segs = o.mode === 'talk' ? talkLines(src) : split(src, placed.map(p => p.pos));
  const lines: VoiceLine[] = o.meta?.lines || [];
  const spoken = segs.filter(s => s.kind === 'say' || s.kind === 'think');
  const byIndex = lines.length > 0 && lines.length === spoken.length;   // 번역처럼 글이 바뀌었어도 대사 수가 같으면 차례대로
  let p = 0;
  const own = (s: Seg): VoiceLine | null => {
    if (!lines.length || o.mode === 'talk') return null;
    const q = head(src.slice(s.a, s.b), 24); if (!q) return null;
    for (let k = p; k < lines.length; k++) { const l = lines[k], n = Math.min(8, l.q.length, q.length); if (n >= 2 && l.q.slice(0, n) === q.slice(0, n)) { p = k + 1; return l; } }
    if (byIndex && (s.kind === 'say' || s.kind === 'think')) { const l = lines[spoken.indexOf(s)]; if (l) { p = Math.max(p, lines.indexOf(l) + 1); return l; } }
    return null;
  };
  const takes: Take[] = [];
  let ci = 0;
  for (const s of segs) {
    // 이 조각 앞(또는 시작)에 놓인 효과음 · 바탕 소리
    const cues: VoiceCue[] = []; while (ci < placed.length && placed[ci].pos <= s.a + 1) cues.push(placed[ci++].cue);
    const sound = cues.find(c => c.sound)?.sound, bedCue = cues.find(c => c.bed !== undefined);
    const extra = { ...(sound ? { sound } : {}), ...(bedCue ? { bed: bedCue.bed } : {}) };
    const mark = own(s);
    let kind: NonNullable<Take['kind']> = s.kind === 'act' ? 'narr' : s.kind;
    if (mark?.how?.includes('thought') && kind !== 'think') kind = 'think';
    // 읽지 않는 것: 지문 빼기(대사만) · *행동* 빼기. 거기 놓인 효과음은 글 없이 남긴다
    if (kind === 'narr' && (o.only === 'lines' || (s.kind === 'act' && o.actions === 'skip'))) { if (sound || bedCue) takes.push({ text: '', kind: 'narr', ...extra }); continue; }
    const take: Take = { text: src.slice(s.a, s.b), kind, ...extra };
    if (kind === 'narr') { if (o.narrator?.provider) take.voice = o.narrator; else take.charId = o.charId; }
    else if (mark) {
      const who = findPerson(o.people, mark.who);
      if (who) take.charId = who.id;
      else {   // 카드가 없는 인물: 성별에 맞춘 목소리 → 없으면 기본 목소리 (그 메시지 캐릭터와 섞이지 않게)
        take.name = mark.who;
        const v = (mark.g && o.extras?.[mark.g]) || o.extras?.x;
        if (v?.provider) take.voice = v; else take.charId = null;
      }
      const how = (mark.how || []).filter(h => h !== 'thought'); if (how.length) take.how = how;
    } else take.charId = o.charId;
    if (kind === 'think' && !take.how?.length) take.how = ['soft'];
    takes.push(take);
  }
  // 남은 효과음 (글 끝)
  for (; ci < placed.length; ci++) { const c = placed[ci].cue; takes.push({ text: '', kind: 'narr', ...(c.sound ? { sound: c.sound } : {}), ...(c.bed !== undefined ? { bed: c.bed } : {}) }); }
  return takes;
}
