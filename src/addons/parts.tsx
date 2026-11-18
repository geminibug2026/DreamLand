// 번역 · 에셋 · 표정 · 일정 · 벡터 화면이 함께 쓰는 작은 부품과, 옛 자리(기능 탭 · 장면 패널 · 창)에 React 를 올리는 도우미
import { useReducer, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { TipBtn, openModal as uiModal, type ModalAction, type ModalHandle } from '../ui';

/** 직접 그린 길(path)로 만든 아이콘 */
export function PathIcon({ d, size = 18 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} className="ic"><path d={d} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function Check({ label, on, onChange, hint, cls = '' }: { label: ReactNode; on: unknown; onChange: (v: boolean) => void; hint?: ReactNode; cls?: string }) {
  // 설명은 옆에 붙이지 않고 "?" 안에 (설정 화면 Form 과 같다) — 좁은 화면에서 이름이 세로로 찌그러지지 않게
  return <label className={`check ${cls}`.trim()}><input type="checkbox" checked={!!on} onChange={e => onChange(e.target.checked)} /><i /><span>{label}</span>{hint ? <TipBtn /> : null}{hint ? <small className="tip-text">{hint}</small> : null}</label>;
}
export type Opt = readonly [value: string, label: string];
export function Select({ value, opts, onChange, cls = '', title, disabled }: { value: unknown; opts: readonly Opt[]; onChange: (v: string) => void; cls?: string; title?: string; disabled?: boolean }) {
  const v = String(value ?? ''), has = opts.some(o => o[0] === v);
  return <select className={`inp ${cls}`.trim()} title={title} disabled={disabled} value={has ? v : opts[0]?.[0] ?? ''} onChange={e => onChange(e.target.value)}>{opts.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>;
}
export function Field({ label, hint, cls = '', children }: { label: ReactNode; hint?: ReactNode; cls?: string; children: ReactNode }) {
  return <label className={`field ${cls}`.trim()}><span className="field-label">{label}</span>{children}{hint ? <small className="hint">{hint}</small> : null}</label>;
}
/** 설정 객체를 직접 고친 뒤 다시 그리게 하는 훅 (옛 draw() 자리) */
export const useRedraw = (): (() => void) => useReducer((x: number) => x + 1, 0)[1];

const roots = new Map<string, () => void>();
const make = (spec: string) => { const [tag, ...cls] = spec.split('.'); const el = document.createElement(tag || 'div'); if (cls.length) el.className = cls.join(' '); return el; };
/**
 * 옛 코드가 Node 를 바라는 자리(기능 화면의 탭 · 장면 패널)에 줄 요소. spec('div.card.x')이 옛 뿌리 요소이고 그 안을 React 가 그린다.
 * 같은 key 로 다시 부르면 앞의 것을 내린다.
 */
export function reactNode(key: string, spec: string, node: ReactNode): HTMLElement {
  const old = roots.get(key); if (old) setTimeout(old, 0);
  const el = make(spec), root = createRoot(el); root.render(node);
  roots.set(key, () => root.unmount());
  return el;
}
/** 공용 창(src/ui)을 열고 본문 뿌리(spec 요소) 안을 그린다. render 는 닫는 함수를 받는다 */
export function openModal(o: { title?: string; wide?: boolean; spec?: string; actions?: ModalAction[]; onClose?: () => void }, render: (close: () => void) => ReactNode): ModalHandle {
  const [tag, ...cls] = (o.spec || 'div').split('.'), Tag = (tag || 'div') as 'div';
  let box: ModalHandle | null = null;
  box = uiModal({ title: o.title, wide: o.wide, actions: o.actions, onClose: o.onClose, body: <Tag className={cls.join(' ') || undefined}>{render(() => box?.close())}</Tag> });
  return box;
}

/** 기능의 스타일 파일을 한 번만 건다 (옛 모듈이 하던 일) */
export function useCss(file: string) {
  if (document.querySelector(`link[rel="stylesheet"][href$="css/${file}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `css/${file}`; document.head.append(l);
}
export const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);
export const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';
