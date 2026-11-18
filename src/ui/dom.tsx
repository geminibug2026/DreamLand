// 옛 ui.js 의 DOM 모양 부품: avatar · modal(body 는 DOM) · form(DOM 을 돌려줌). 확장 API 와 DOM 을 만드는 옛 코드가 쓴다
import { createElement, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { h, type HKid } from '../lib/core';
import { Emblems } from '../lib/emblems';
import { openModal, type ModalAction } from './Modal';
import { Form, type FormDefs } from './Form';

// ── 확장에 건네는 DOM 부품 (옛 ui.js 의 avatar · modal · form 과 같은 모양) ──
/** DOM 노드를 React 자리에 그대로 붙인다 */
function DomSlot({ node }: { node: Node | null | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const el = ref.current; if (!el || !node) return; el.replaceChildren(node); return () => { el.replaceChildren(); }; }, [node]);
  return createElement('div', { ref, style: { display: 'contents' } });
}
const emblem = (o: { tags?: unknown; name?: string } | null | undefined, mini = false) => {
  const t = document.createElement('template');
  t.innerHTML = Emblems.svg(Emblems.pick(Array.isArray(o?.tags) ? o.tags : [], o?.name || ''), mini ? 'mini' : '');
  return t.content.firstChild as Node;
};
export function avatar(o: { avatar?: string; tags?: unknown; name?: string } | null | undefined, cls = '') {
  const el = h(`div.avatar${cls ? '.' + cls : ''}`);
  if (o?.avatar) el.style.backgroundImage = `url("${o.avatar}")`;
  else if (Array.isArray(o?.tags) && cls !== 'xs') { el.classList.add('blank'); el.append(emblem(o, true)); }   // 캐릭터
  else { el.classList.add('blank'); el.textContent = (o?.name || '?').trim().slice(0, 1); }                       // 페르소나 · 이름만 있는 대상
  return el;
}
interface ModalOpts { title?: string; body?: HKid; actions?: ModalAction[]; wide?: boolean; onClose?: () => void }
/** 옛 modal(): body 는 DOM. src/ui 의 openModal 위에 얹는다 */
export function modal({ title, body, actions = [], wide = false, onClose }: ModalOpts = {}) {
  const node = body instanceof Node ? body : body == null || body === false ? null : h('div', body);
  return openModal({ title: title || '', body: createElement(DomSlot, { node }) as ReactNode, actions, wide, onClose });
}
export function form<T extends object>(obj: T, defs: FormDefs, onChange: (o: T) => void = () => { }) {
  const box = h('div', { style: { display: 'contents' } });
  createRoot(box).render(createElement(Form<T>, { obj, defs, onChange }));
  return box;
}

