// 창: <Modal> 과 명령형 openModal · confirmBox · promptBox (옛 ui.js 의 modal / confirmBox / promptBox)
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Btn, IconBtn } from '../kit';

/** 창 아래 버튼. onclick 이 false 를 돌려주면(약속이어도 된다) 창을 닫지 않는다 */
export interface ModalAction { label: string; ic?: string; cls?: string; onclick?: () => unknown }
/** el 은 #modals 바로 아래의 .modal-wrap */
export interface ModalHandle { close(): void; el: HTMLDivElement }
export interface ModalProps {
  title?: ReactNode; wide?: boolean; actions?: ModalAction[];
  /** 닫힐 때 한 번 불린다 (X · 바깥 누름 · Esc · 버튼 · 뒤로 가기 · close()) */
  onClose?: () => void;
  /** 처음 붙을 때 손잡이를 건넨다 */
  handle?: (h: ModalHandle) => void;
  /** openModal 이 미리 만들어 둔 .modal-wrap (직접 쓸 일은 없다) */
  wrap?: HTMLDivElement;
  children?: ReactNode;
}

const FADE = 180;   // .modal-wrap.out 이 사라지는 시간
const host = () => document.getElementById('modals')!;
const newWrap = () => { const d = document.createElement('div'); d.className = 'modal-wrap'; return d; };

/**
 * #modals 아래에 뜨는 창. 그려져 있는 동안 열려 있다.
 * 닫기(X · 바깥 · Esc · 버튼)를 하면 onClose 가 불리고 창은 흐려지며 사라진다 — 부모는 onClose 에서 이 컴포넌트를 내리면 된다.
 */
export function Modal({ title, wide = false, actions = [], onClose, handle, wrap: given, children }: ModalProps) {
  const [wrap] = useState(() => given ?? newWrap());
  const st = useRef({ onClose, handle, closedAt: 0 });
  useLayoutEffect(() => { st.current.onClose = onClose; st.current.handle = handle; });
  const [close] = useState(() => () => {
    const s = st.current; if (s.closedAt) return;
    s.closedAt = performance.now(); wrap.classList.add('out'); setTimeout(() => wrap.remove(), FADE); s.onClose?.();
  });

  useLayoutEffect(() => {
    const s = st.current;
    if (!wrap.isConnected) host().append(wrap);
    // Esc 는 맨 위 창만 닫는다 (옛 코드가 띄운 창과도 같은 자리를 쓴다)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && wrap === host().lastElementChild) close(); };
    const down = (e: MouseEvent) => { if (e.target === wrap) close(); };
    document.addEventListener('keydown', key); wrap.addEventListener('mousedown', down);
    const t = setTimeout(() => wrap.querySelector<HTMLElement>('input,textarea,select')?.focus(), 60);
    s.handle?.({ close, el: wrap });
    return () => {
      clearTimeout(t); document.removeEventListener('keydown', key); wrap.removeEventListener('mousedown', down);
      if (!wrap.isConnected) return;
      // 내려갈 때도 옛 것처럼 흐려지며 사라지게, 지금 모습을 본뜬 것을 잠시 남긴다
      const left = s.closedAt ? FADE - (performance.now() - s.closedAt) : FADE;
      if (left < 16) { wrap.remove(); return; }
      const ghost = wrap.cloneNode(true) as HTMLDivElement; ghost.classList.add('out');
      wrap.replaceWith(ghost); setTimeout(() => ghost.remove(), left);
    };
  }, [wrap, close]);

  return createPortal(<div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true">
    <header className="modal-head"><h2>{title || ''}</h2><IconBtn ic="x" title="닫기" onClick={close} /></header>
    <div className="modal-body">{children}</div>
    {actions.length ? <footer className="modal-foot">{actions.map((a, i) =>
      <Btn key={i} label={a.label} ic={a.ic} cls={a.cls || ''} onClick={async () => { if ((await a.onclick?.()) !== false) close(); }} />)}</footer> : null}
  </div>, wrap);
}

/** 창을 바로 띄운다. body 는 React 조각 (옛 DOM 은 kit 의 <Dom node={…} /> 로 감싼다) */
export function openModal({ body, onClose, ...o }: Omit<ModalProps, 'children' | 'handle' | 'wrap'> & { body?: ReactNode } = {}): ModalHandle {
  const wrap = newWrap(), root = createRoot(document.createElement('div'));
  host().append(wrap);   // 본문 안에서 또 창을 그려도 이 창이 아래에 오도록 먼저 붙인다
  let inner: ModalHandle | null = null, early = false;
  flushSync(() => root.render(
    <Modal {...o} wrap={wrap} handle={h => { inner = h; if (early) h.close(); }} onClose={() => { setTimeout(() => root.unmount(), FADE); onClose?.(); }}>{body}</Modal>));
  return { el: wrap, close: () => { if (inner) inner.close(); else early = true; } };
}

/** 예/아니오. 확인을 누르면 true, 그 밖에는 false */
export const confirmBox = (msg: string, okLabel = '확인', danger = false) => new Promise<boolean>(res => {
  let done = false;
  const m = openModal({ title: msg, body: <div />, onClose: () => { if (!done) res(false); }, actions: [{ label: '취소' }, { label: okLabel, cls: danger ? 'danger' : 'primary', onclick: () => { done = true; res(true); } }] });
  m.el.classList.add('dialog');   // 휴대폰에서도 아래에 붙지 않고 가운데에 뜬다
});

/** 글 한 줄(area 면 여러 줄) 받기. 취소하면 null */
export const promptBox = (title: string, value = '', { area = false, placeholder = '' }: { area?: boolean; placeholder?: string } = {}) => new Promise<string | null>(res => {
  let done = false, el: HTMLInputElement | HTMLTextAreaElement | null = null;
  const ok = () => { done = true; res(el ? el.value : value); };
  const m: ModalHandle = openModal({
    title, onClose: () => { if (!done) res(null); }, actions: [{ label: '취소' }, { label: '확인', cls: 'primary', onclick: ok }],
    body: area
      ? <textarea className="inp" defaultValue={value} placeholder={placeholder} rows={6} ref={x => { el = x; }} />
      : <input className="inp" defaultValue={value} placeholder={placeholder} ref={x => { el = x; }} onKeyDown={e => { if (e.key === 'Enter') { ok(); m.close(); } }} />,
  });
  m.el.classList.add('dialog');
});
