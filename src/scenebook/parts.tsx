// 삽화 화면의 작은 부품: 칸 · 고르기 · 체크 · 글상자 · 접는 묶음 · 나란히 고르기 + 옛 창에 올리는 도우미
import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Icon } from '../kit';
import { openModal as uiModal, type ModalAction, type ModalHandle } from '../ui';

export const useBump = () => useReducer((x: number) => x + 1, 0)[1];

/** 옛 btn() 과 같은 단추 (disabled · hidden 을 쓸 수 있다) */
export function Btn({ label, ic, cls = '', title, disabled, onClick, innerRef }: { label?: string; ic?: string; cls?: string; title?: string; disabled?: boolean; onClick?: (e: MouseEvent<HTMLButtonElement>) => void; innerRef?: Ref<HTMLButtonElement> }) {
  return <button ref={innerRef} type="button" className={`btn ${cls}`.trim()} title={title ?? (label ? undefined : '')} disabled={disabled} onClick={onClick}>{ic && <Icon name={ic} />}{label && <span>{label}</span>}</button>;
}
export function IBtn({ ic, title, cls = '', disabled, hidden, onClick }: { ic: string; title: string; cls?: string; disabled?: boolean; hidden?: boolean; onClick?: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return <button type="button" className={`ibtn ${cls}`.trim()} title={title} aria-label={title} disabled={disabled} hidden={hidden} onClick={onClick}><Icon name={ic} /></button>;
}

export function Fld({ label, hint, cls = '', children }: { label: string; hint?: string | null; cls?: string; children: ReactNode }) {
  return <label className={`field ${cls}`.trim()}><span className="field-label">{label}</span>{children}{hint ? <small className="hint">{hint}</small> : null}</label>;
}
type Opt = string | [string | number, string];
/** 고르기. 처음 값은 value, 그 뒤로는 사용자가 고른 대로 (value 가 바뀌면 따라간다) */
export function Sel({ opts, value, onChange }: { opts: Opt[]; value: unknown; onChange: (v: string) => void }) {
  const start = String(value ?? ''), [v, setV] = useState(start);
  useEffect(() => { setV(start); }, [start]);
  return <select className="inp" value={v} onChange={e => { setV(e.target.value); onChange(e.target.value); }}>{opts.map(o => { const [val, l] = Array.isArray(o) ? o : [o, o]; return <option key={String(val)} value={String(val)}>{l}</option>; })}</select>;
}
export function Chk({ label, checked, onChange, hint }: { label: string; checked: unknown; onChange: (v: boolean) => void; hint?: string }) {
  const start = !!checked, [v, setV] = useState(start);
  useEffect(() => { setV(start); }, [start]);
  return <label className="check"><input type="checkbox" checked={v} onChange={e => { setV(e.target.checked); onChange(e.target.checked); }} /><i /><span>{label}</span>{hint ? <small>{hint}</small> : null}</label>;
}
type Bag = Record<string, unknown>;
/** obj[k] 를 바로 고치는 여러 줄 글상자 */
export function Area({ obj, k, label, rows = 3, ph = '', onInput, hint }: { obj: object; k: string; label: string; rows?: number; ph?: string; onInput?: () => void; hint?: string }) {
  const bump = useBump(), o = obj as Bag;
  return <Fld label={label} hint={hint}><textarea className="inp" rows={rows} value={String(o[k] ?? '')} placeholder={ph} spellCheck={false} onChange={e => { o[k] = e.target.value; onInput?.(); bump(); }} /></Fld>;
}
/** obj[k] 를 바로 고치는 한 줄 글상자 */
export function Text({ obj, k, label, ph = '', onInput, cls = '' }: { obj: object; k: string; label: string; ph?: string; onInput?: () => void; cls?: string }) {
  const bump = useBump(), o = obj as Bag;
  return <Fld label={label} cls={cls}><input className="inp" value={String(o[k] ?? '')} placeholder={ph} spellCheck={false} autoComplete="off" onChange={e => { o[k] = e.target.value; onInput?.(); bump(); }} /></Fld>;
}
const openGroups = new Set(['이미지']);
/** 접었다 펴는 묶음. 펴 둔 것은 화면을 다시 그려도 기억한다 */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  const [open] = useState(() => openGroups.has(title));
  return <details className="sb-group" open={open} onToggle={e => { if (e.currentTarget.open) openGroups.add(title); else openGroups.delete(title); }}><summary>{title}</summary><div className="sb-group-body">{children}</div></details>;
}
export const Empty = ({ children }: { children: ReactNode }) => <p className="sb-empty">{children}</p>;

/** 나란히 놓고 하나만 고르는 선택 (화면 비율 등) */
export function Seg({ label, choices, value, onChange }: { label: string; choices: [string, string][]; value: string; onChange?: (v: string) => void }) {
  const [v, setV] = useState(value), el = useRef<HTMLDivElement>(null);
  const pick = (id: string) => { if (v === id) return; setV(id); onChange?.(id); };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault();
    const i = (choices.findIndex(c => c[0] === v) + (e.key === 'ArrowRight' ? 1 : -1) + choices.length) % choices.length;
    (el.current?.children[i] as HTMLElement | undefined)?.focus(); pick(choices[i][0]);
  };
  return <div className="sb-seg" role="radiogroup" aria-label={label} ref={el} onKeyDown={key}>{choices.map(([id, caption]) =>
    <button key={id} type="button" role="radio" data-value={id} aria-checked={v === id} className={v === id ? 'on' : undefined} tabIndex={v === id ? 0 : -1} onClick={() => pick(id)}>{caption}</button>)}</div>;
}

// ════════ 옛 창 · 옛 화면에 React 올리기 ════════
interface Live { el: HTMLElement; root: Root; seen: boolean; at: number }
let live: Live[] = [];
/** 화면에서 빠진 조각을 내린다 */
export function sweep() {
  const t = Date.now(), gone: Live[] = [];
  live = live.filter(x => { if (x.el.isConnected) { x.seen = true; return true; } if (x.seen || t - x.at > 60000) { gone.push(x); return false; } return true; });
  if (gone.length) setTimeout(() => { for (const x of gone) x.root.unmount(); });
}
/** 옛 코드가 가져다 붙일 요소에 React 조각을 올린다. 요소가 화면에서 빠지면 알아서 내린다 */
export function mountNode<T extends HTMLElement>(el: T, node: ReactNode): T {
  sweep();
  const root = createRoot(el); flushSync(() => root.render(node));
  live.push({ el, root, seen: el.isConnected, at: Date.now() });
  return el;
}
export const make = (tag: string, cls = ''): HTMLElement => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };

export interface Box { close(): void; el: HTMLElement }
/** 공용 창을 열고 본문 요소(tag.cls) 안에 조각을 그린다. render 는 창 손잡이를 받는다 */
export function openModal(o: { title: string; wide?: boolean; tag?: 'div' | 'p'; cls?: string; actions?: (ModalAction | false | null | undefined)[]; onClose?: () => void }, render: (box: Box) => ReactNode): Box {
  let m: ModalHandle | null = null;
  const box: Box = { close: () => m?.close(), el: document.body }, Tag = o.tag || 'div';
  m = uiModal({ title: o.title, wide: o.wide, actions: (o.actions || []).filter((a): a is ModalAction => !!a), onClose: o.onClose, body: <Tag className={o.cls || undefined}>{render(box)}</Tag> });
  box.el = m.el;
  return box;
}
