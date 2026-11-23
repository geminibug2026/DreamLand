// 실리태번 도우미(Tavern Helper) 함수의 앱 쪽 공용 조각: 부른 화면 · 이름으로 찾기 · 저장(되돌리기 장부와 함께) · 알림
// 이 묶음(src/th)은 스크립트 · 화면이 이 함수들을 처음 부를 때만 불러온다 (쓰지 않는 카드에는 아무 비용이 없다)
import { S } from '../lib/core';
import { cur } from '../chat/store';
import { chatApi } from '../chat/actions';
import { confirmBox, toast } from '../ui';
import { t } from '../i18n';
import { keepUndo, undoChange } from '../guide/changes';
import type { Kind } from '../guide/types';
import type { Char, Chat, Lore, Persona, Preset } from '../lib/types';

export type Obj = Record<string, unknown>;
/** 부른 쪽: 숨은 스크립트 화면(사용자가 허락해 켠 것)이면 script 에 그 스크립트 id, 메시지 속 화면이면 null */
export interface Ctx { f: HTMLIFrameElement | null; script: string | null; msgId: number }
export const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
export const str = (v: unknown) => v == null ? '' : String(v);
export const clone = <T,>(v: T): T => v == null ? v : structuredClone(v);
/** 도우미 함수가 실리태번처럼 던지는 오류 (스크립트가 받아 처리한다) */
export const fail = (key: string, v?: Record<string, unknown>): never => { throw new Error(t('th.err.' + key, v)); };

export const chat = (): Chat | null => cur.chat;
export const charsOf = (c: Chat | null = chat()): Char[] => (c?.charIds || []).map(id => S.get('chars', id)).filter((x): x is Char => !!x);
export const curChar = (): Char | null => charsOf()[0] || null;
const bare = (s: string) => s.replace(/\.png$/i, '');
/** 캐릭터 찾기: 'current' · 드림랜드 id · 이름 · "이름.png" (실리태번의 캐릭터 id 는 그림 파일 이름이다) */
export function findChar(ref: unknown): Char | null {
  const r = str(ref).trim();
  if (!r || r === 'current') return curChar();
  return S.get('chars', r) || S.get('chars', bare(r)) || S.chars.find(c => c.name === r) || S.chars.find(c => c.name === bare(r)) || S.chars.find(c => c.name.toLowerCase() === bare(r).toLowerCase()) || null;
}
export const bookByName = (name: unknown): Lore | undefined => { const n = str(name); return S.lore.find(b => b.name === n) || S.get('lore', n); };
export const bookName = (id: string | undefined) => (id && S.get('lore', id)?.name) || null;
export const presetOf = (name: unknown): Preset | undefined => { const n = str(name); return n === 'in_use' ? S.presetFor(chat()) : S.presets.find(p => p.name === n) || S.get('presets', n); };
export function findPersona(ref: unknown): Persona | undefined {
  const r = str(ref).trim();
  if (!r || r === 'current') return S.persona(chat());
  return S.get('personas', r) || S.get('personas', bare(r)) || S.personas.find(p => p.name === r);
}

// ── 쓰기 ── 사용자 자료는 늘 S.save 로 (자료 폴더 · 편집 화면 · 되돌리기 장부가 함께 맞는다)
const lastUndo = new Map<string, number>();
const UNDO_GAP = 10 * 60_000;
/** 고치기 전 사본을 되돌리기 장부에 둔다. 스크립트가 같은 것을 잇달아 고치면 처음 한 번만 (10분 안) — 장부가 스크립트 기록으로 넘치지 않게 */
export async function remember(kind: Kind, id: string, name: string, before: Obj | null, force = false) {
  const k = kind + ':' + id, at = lastUndo.get(k) || 0;
  if (!force && Date.now() - at < UNDO_GAP) return '';
  lastUndo.set(k, Date.now());
  return keepUndo(kind, id, t('th.undo.target', { name }), before).catch(() => '');
}
/** 지운 뒤 잠깐 뜨는 알림: 누르면 되살린다 */
export function undoToast(text: string, undoId: string) {
  if (!undoId) { toast(text); return; }
  const box = document.createElement('span'), b = document.createElement('button');
  box.textContent = text + ' '; b.type = 'button'; b.className = 'btn ghost sm'; b.textContent = t('th.undo.btn');
  b.onclick = () => { b.disabled = true; void undoChange(undoId).then(ok => toast(ok ? t('th.undo.done') : t('th.undo.gone'), ok ? 'ok' : 'err')); };
  box.append(b); toast(box);
}
/** 지우기 전에: 메시지 속 화면이 부른 것이면 사용자에게 묻는다 (사용자가 켠 스크립트는 묻지 않고, 되돌리기 알림을 띄운다) */
export async function mayDelete(c: Ctx, what: string, name: string, always = false): Promise<boolean> {
  if (c.script && !always) return true;
  return confirmBox(t('th.ask.delete', { what, name }), t('common.delete'), true);
}
/** 대화 화면을 다시 그린다 (정규식 · 캐릭터 등 보이는 글이 바뀌었을 때) */
export const redraw = () => { try { chatApi.redraw(); } catch { /* 대화 화면이 없다 */ } };
