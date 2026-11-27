// 사진: 대화 화면에 보낸 사진을 보낸 자리에 놓는다 (삽화 꾸미기와 같은 때 돈다 — src/scenebook/decorate 의 decorators)
// 대화 화면(React)이 그린 본문 안에 우리 칸을 끼운다. 본문을 다시 그려 칸이 지워지면 다음 꾸미기 때 다시 놓는다.
// 자리: 보낸 사진 바로 앞 줄(after)이 보이는 말풍선 뒤 → 못 찾으면 줄 차례로. 한 줄씩 나타나는 동안은 그 줄이 보일 때 함께 나타난다
import { msgText } from '../lib/core';
import type { Msg, Swipe } from '../lib/types';
import { cur } from '../chat/store';
import { make, mountNode } from '../scenebook/parts';
import { findQuote, mapIndex } from '../scenebook/place';
import { flat } from '../scenebook/util';
import type { SentPhoto } from './types';
import { photosOf, slotOf } from './store';
import { SentBubble } from './ui';

/** 사진을 둘 자리: 그 뒤에 놓을 본문 칸의 차례 (-1 = 맨 앞) · null = 아직 (그 줄이 아직 보이지 않는다) */
function spot(p: SentPhoto, texts: string[], total: number, painting: boolean): number | null {
  if (!(Number(p.at) > 0)) return -1;   // 글보다 먼저 보낸 사진
  if (!texts.length) return painting ? null : -1;
  const at = Math.min(Math.round(Number(p.at)), Math.max(1, total)), guess = mapIndex(at - 1, Math.max(1, total), texts.length), key = flat(p.after).slice(0, 40);
  if (key) { if (flat(texts[guess]).includes(key)) return guess; const i = findQuote(p.after, texts); if (i >= 0) return i; }
  if (painting) return null;
  return at >= total ? texts.length - 1 : guess;
}
/** 그 답장(지금 보이는 스와이프)의 보낸 사진을 본문의 제자리에 놓는다 */
export function decorateSent(art: HTMLElement, m: Msg, sw: Swipe) {
  const list = photosOf(sw).filter(p => !slotOf(sw, p)?.hidden), body = art.querySelector<HTMLElement>('.msg-body'), ids = new Set(list.map(p => p.id));   // 숨긴 사진(삽화 도구의 숨기기)은 놓지 않는다
  for (const el of art.querySelectorAll<HTMLElement>('.ph-sent')) if (el.parentElement !== body || !ids.has(el.dataset.ph || '')) el.remove();   // 지난 스와이프 · 지운 사진
  const chat = cur.chat; if (!body || !list.length || !chat) return;
  const painting = cur.paint.has(m.id), kids = [...body.children].filter(el => !el.classList.contains('ph-sent') && !el.classList.contains('typing'));
  const texts = kids.map(el => el.textContent || ''), total = msgText(m).split('\n').filter(l => l.trim()).length, order = new Map(list.map((p, i) => [p.id, i]));
  list.forEach((p, i) => {
    let el = body.querySelector<HTMLElement>(`:scope > .ph-sent[data-ph="${CSS.escape(p.id)}"]`);
    const at = spot(p, texts, total, painting);
    if (at === null) { el?.remove(); return; }
    // 같은 자리에 먼저 보낸 사진이 있으면 그 뒤로 (보낸 차례 그대로)
    let ref: Element | null = at < 0 ? null : kids[at];
    for (let nx = ref ? ref.nextElementSibling : body.firstElementChild; nx && nx.classList.contains('ph-sent') && (order.get((nx as HTMLElement).dataset.ph || '') ?? 99) < i; nx = nx.nextElementSibling) ref = nx;
    if (!el) { el = make('div', 'ph-sent'); el.dataset.ph = p.id; mountNode(el, <SentBubble chat={chat} m={m} sw={sw} p={p} />); }
    if ((ref ? ref.nextElementSibling : body.firstElementChild) !== el) { if (ref) ref.after(el); else body.prepend(el); }
  });
}
