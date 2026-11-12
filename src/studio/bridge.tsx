// 기능 · 모듈 · 꾸미기 · 고급 포맷팅 · 정규식 · 확장 화면이 함께 쓰는 다리와 작은 부품
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { L } from '../legacy';
import type { Char, Chat } from '../types';
import { Form, openModal as uiModal, toast, type ModalAction, type ModalHandle } from '../ui';

export { PageHead, charPicker, confirmBox, menu, promptBox, toast, useDragSort, type FormDefs, type FieldDef as FormDef } from '../ui';
export type Obj = Record<string, unknown>;
export type Opt = string | readonly [string | number, string];
export type ModalX = ModalHandle;
interface Db { get<T = Obj>(store: string, id: string): Promise<T | undefined>; put(store: string, rec: Obj): Promise<unknown>; del(store: string, id: string): Promise<unknown>; all<T = Obj>(store: string): Promise<T[]> }
interface CoreX {
  download(name: string, data: string | Blob, type?: string): void;
  pickFiles(o?: { accept?: string; multiple?: boolean }): Promise<File[]>;
  readDataURL(f: File): Promise<string>;
  shrinkImage(src: string, max?: number, mime?: string, q?: number): Promise<string>;
  newRegex(o?: Partial<Regex>): Regex;
  msgText(m: Msg): string;
  DB: Db;
}
export const core = () => L.core as unknown as CoreX;

// ── 자료 꼴 (이 묶음이 쓰는 만큼만) ──
export interface Regex {
  id: string; name: string; find: string; replace: string; trim: string[]; enabled?: boolean; mode: string; scope?: string; order?: number;
  subst?: number; runOnEdit?: boolean; minDepth?: number | null; maxDepth?: number | null; mod?: string;
  onUser?: boolean; onAI?: boolean; onSlash?: boolean; onLore?: boolean; onReason?: boolean;
  [k: string]: unknown;
}
export interface Preset { id: string; name: string; regex?: Regex[]; [k: string]: unknown }
export interface Lore { id: string; name: string; description?: string; entries?: Obj[]; mod?: string; [k: string]: unknown }
export interface Conn { id: string; name: string; model?: string; provider: string; [k: string]: unknown }
export interface Persona { id: string; name: string; avatar?: string }
export interface Msg { id: string; role: string; name?: string; charId?: string; hidden?: boolean; [k: string]: unknown }
export interface ChatX extends Chat { count?: number }
export interface StoreX {
  chars: Char[]; chats: ChatX[]; lore: Lore[]; presets: Preset[]; conns: Conn[]; regex: Regex[]; settings: Obj;
  get<T = unknown>(coll: string, id?: string | null): T | undefined;
  save<T extends object>(coll: string, obj: T, silent?: boolean): Promise<T>;
  remove(coll: string, id: string): Promise<void>;
  set(patch: Obj): void;
  msgs(chatId: string): Promise<Msg[]>;
  conn(): Conn | undefined;
  preset(): Preset | undefined;
  presetFor(chat: Chat): Preset | undefined;
  persona(chat?: Chat): Persona;
}
export const S = () => L.core.S as unknown as StoreX;
export const arr = <T,>(v: T[] | T | null | undefined | ''): T[] => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v as T]);
export const plain = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
export const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);

/** 옛 코드가 만든 DOM 을 끼운다. 같은 조각이면 다시 그릴 때 건드리지 않는다 (입력 중 포커스가 날아가지 않게) */
export function Host({ node }: { node: Node | null | undefined }) {
  const el = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = el.current; if (!box) return;
    if (!node) box.replaceChildren(); else if (box.firstChild !== node || box.childNodes.length !== 1) box.replaceChildren(node);
  }, [node]);
  return <span style={{ display: 'contents' }} ref={el} />;
}

/** 폼: 공용 부품 그대로 (다시 만들려면 key 를 바꾼다) */
export const LForm = Form;

/** 켜고 끄는 스위치 */
export function Switch({ checked, onChange, title, span = false }: { checked: boolean; onChange: (v: boolean) => void; title: string; span?: boolean }) {
  const kids = <><input type="checkbox" checked={checked} aria-label={title} onChange={e => onChange(e.target.checked)} /><i /></>;
  return span ? <span className="switch" title={title} onClick={e => e.stopPropagation()}>{kids}</span> : <label className="switch" title={title} onClick={e => e.stopPropagation()}>{kids}</label>;
}

/** 창을 띄운다. box 는 창 본문을 감싸는 요소의 클래스(옛 구조와 같게), cls 는 .modal-wrap 에 붙일 클래스. 그리는 함수는 창 손잡이를 받는다 */
export function openModal(o: { title?: string; wide?: boolean; actions?: (ModalAction | false | null | undefined)[]; onClose?: () => void; cls?: string; box?: string }, render: (m: ModalX) => ReactNode): ModalX {
  let h: ModalX | null = null, early = false;
  const m: ModalX = { close: () => { if (h) h.close(); else early = true; }, get el() { return h!.el; } };
  const body = render(m);
  h = uiModal({ title: o.title, wide: o.wide, actions: (o.actions || []).filter((a): a is ModalAction => !!a), onClose: o.onClose, body: o.box ? <div className={o.box}>{body}</div> : body });
  if (o.cls) h.el.classList.add(...o.cls.split(' '));
  if (early) h.close();
  return m;
}
/** 글만 든 간단한 창 */
export const textModal = (title: string, cls: string, text: string) => { uiModal({ title, wide: true, body: <pre className={cls}>{text}</pre> }); };
/** 그림 크게 보기 */
export const imageModal = (title: string, src: string) => { uiModal({ title, wide: true, body: <img className="full-img" src={src} alt={title} /> }); };
export const copyText = (text: string) => { void navigator.clipboard?.writeText(text).then(() => toast('복사했어요', 'ok'), () => toast('복사하지 못했어요', 'err')); };
/** 잠깐 모았다가 한 번만 부른다 */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
