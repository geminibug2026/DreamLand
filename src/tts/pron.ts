// ── 발음 사전: 목소리 엔진이 잘못 읽는 낱말을 읽는 법으로 바꿔 보낸다 (화면 글은 그대로) ──
// 글자 위치가 달라지므로 바꾼 글의 위치 → 원래 글의 위치 표를 함께 돌려준다 (따라 읽기 · 글자별 시각이 원래 글을 짚게).
import type { PronWord } from './config';

export interface Respelled { text: string; /** 바꾼 글의 i 번째 글자가 원래 글의 몇 번째인가 (길이 = text.length + 1) */ map: number[] | null }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 이 목소리(charId)에 쓰는 낱말만 (모두에게 쓰는 것 + 그 캐릭터 것) */
export const wordsFor = (all: PronWord[], charId?: string | null) => all.filter(w => w.from?.trim() && w.to?.trim() && (!w.charId || w.charId === charId));

export function respell(text: string, words: PronWord[]): Respelled {
  if (!words.length || !text) return { text, map: null };
  // 긴 낱말부터 (짧은 것이 긴 것 안을 먼저 바꾸지 않게). 라틴 글자 낱말은 낱말 경계에서만
  const list = [...words].sort((a, b) => b.from.trim().length - a.from.trim().length);
  const re = new RegExp(list.map(w => { const f = esc(w.from.trim()); return /^[A-Za-z0-9]/.test(w.from.trim()) ? `(?<![A-Za-z0-9])${f}(?![A-Za-z0-9])` : f; }).join('|'), 'gi');
  let out = '', last = 0; const map: number[] = []; let hit = false;
  for (const m of text.matchAll(re)) {
    const i = m.index!, w = list.find(x => x.from.trim().toLowerCase() === m[0].toLowerCase()); if (!w) continue;
    for (let k = last; k < i; k++) { map.push(k); } out += text.slice(last, i);
    const to = w.to.trim(); for (let k = 0; k < to.length; k++) map.push(i + Math.floor(k * m[0].length / to.length));
    out += to; last = i + m[0].length; hit = true;
  }
  if (!hit) return { text, map: null };
  for (let k = last; k < text.length; k++) map.push(k);
  out += text.slice(last); map.push(text.length);
  return { text: out, map };
}
