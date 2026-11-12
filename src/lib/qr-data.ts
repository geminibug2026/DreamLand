// ── Dreamland qr-data: 빠른 버튼 세트의 자료 구조 · Quick Reply 세트 변환 (화면 없음, 옛 js/qr-data.js 그대로) ──
// S.settings.qr = { v, sets: [세트], bar, migrated }
// 세트 = { id, name, scope: 'global'|'char'|'chat', on, charIds, chatIds, items: [버튼] }
// 버튼 = { id, label, icon, title, text, kind: 'insert'(입력창에 넣기)|'send'(바로 보내기)|'script'(명령 실행), hidden, auto: { start, open, newChat, user, ai, gen }, automationId }
import { S, uid, arr } from './core';

export interface QrAuto { start?: boolean; open?: boolean; newChat?: boolean; user?: boolean; ai?: boolean; gen?: boolean }
export interface QrItem { id: string; label: string; icon: string; title: string; text: string; kind: 'insert' | 'send' | 'script'; hidden: boolean; auto: QrAuto; automationId: string; stIcon?: string }
export interface QrSet { id: string; name: string; scope: 'global' | 'char' | 'chat'; on: boolean; charIds: string[]; chatIds: string[]; items: QrItem[]; legacy?: boolean; src?: string }
export interface QrStore { v: number; sets: QrSet[]; bar: boolean; migrated?: boolean }
/** Quick Reply 세트 파일의 한 버튼 */
interface StQr { label?: string; title?: string; message?: string; isHidden?: boolean; icon?: string; automationId?: string; executeOnStartup?: boolean; executeOnChatChange?: boolean; executeOnNewChat?: boolean; executeOnUser?: boolean; executeOnAi?: boolean; executeBeforeGeneration?: boolean }
export interface StQrSet { name?: string; disableSend?: boolean; qrList?: StQr[] | StQr | null }
interface Loose { label?: string; text?: string }
interface QChat { id?: string; charIds?: string[]; qrOff?: string[] }
interface QStore { settings: { qr?: QrStore; [k: string]: unknown }; set(patch: object): void; saveSettings?: () => void }
const St = S as unknown as QStore;
const mkId = uid as unknown as () => string;
const toArr = arr as unknown as <T>(v: T | T[] | null | undefined | '') => T[];

export const QR_KINDS = { insert: '입력창에 넣기', send: '바로 보내기', script: '명령 실행' };
export const QR_AUTO = { open: '대화를 열 때', newChat: '새 대화를 처음 열 때', user: '내가 보낸 뒤', ai: '답변이 온 뒤', gen: '생성을 시작할 때', start: '앱을 켤 때' };
export const QR_SCOPES = { global: '모든 대화', char: '고른 캐릭터', chat: '고른 대화방' };

export const newQrItem = (o: Partial<QrItem> = {}): QrItem => ({ id: mkId(), label: '새 버튼', icon: '', title: '', text: '', kind: 'insert', hidden: false, auto: {}, automationId: '', ...o });
export const newQrSet = (o: Partial<QrSet> = {}): QrSet => ({ id: mkId(), name: '새 세트', scope: 'global', on: true, charIds: [], chatIds: [], items: [], ...o });
const kindOf = (text?: string) => /^\s*\//.test(text || '') ? 'script' : 'insert';

/** 저장소. 예전 빠른 답장(S.settings.quick: [{ label, text }])은 처음 한 번 "기본 버튼" 세트로 옮긴다 */
export function qrStore(): QrStore {
  const q = St.settings.qr ||= { v: 1, sets: [], bar: true };
  if (!Array.isArray(q.sets)) q.sets = [];
  if (!q.migrated) {
    const d = Object.getOwnPropertyDescriptor(St.settings, 'quick'), old: Loose[] = d && 'value' in d && Array.isArray(d.value) ? d.value : [];
    const items = old.filter(x => x && x.text).map(x => newQrItem({ label: String(x.label || '버튼'), text: String(x.text), kind: kindOf(x.text) }));
    if (items.length && !q.sets.some(s => s.legacy)) q.sets.unshift(newQrSet({ name: '기본 버튼', legacy: true, items }));
    q.migrated = true; St.saveSettings?.();
  }
  return q;
}
export const qrSave = () => St.set({ qr: St.settings.qr });
/** 이 대화에서 켜져 있는 세트 */
export function qrActive(chat?: QChat | null): QrSet[] {
  const off = new Set(chat?.qrOff || []);
  return qrStore().sets.filter(s => s.on !== false && !off.has(s.id) && (s.scope === 'char' ? (chat?.charIds || []).some(id => (s.charIds || []).includes(id)) : s.scope === 'chat' ? (s.chatIds || []).includes(chat?.id as string) : true));
}
export const qrFind = (key: unknown, chat?: QChat | null) => { const k = String(key || '').trim(); if (!k) return null; const sets = qrStore().sets, act = chat ? qrActive(chat) : sets; for (const list of [act, sets]) for (const s of list) { const it = s.items.find(i => i.id === k) || s.items.find(i => i.label === k); if (it) return { set: s, item: it }; } return null; };

/** Quick Reply 세트(.json) → 세트 */
export function stQrToSet(j: StQrSet, name?: string): QrSet {
  const noSend = !!j.disableSend;
  return newQrSet({
    name: j.name || name || '가져온 세트', src: 'st',
    items: toArr(j.qrList).filter(x => x && (x.message || x.label)).map(x => newQrItem({
      label: String(x.label || x.title || '버튼'), title: x.title || '', text: x.message || '', kind: /^\s*\//.test(x.message || '') ? 'script' : (noSend ? 'insert' : 'send'), hidden: !!x.isHidden,
      auto: { start: !!x.executeOnStartup, open: !!x.executeOnChatChange, newChat: !!x.executeOnNewChat, user: !!x.executeOnUser, ai: !!x.executeOnAi, gen: !!x.executeBeforeGeneration },
      automationId: x.automationId || '', stIcon: x.icon || '',
    })),
  });
}
/** 세트 → Quick Reply 세트(.json) */
export function setToStQr(set: QrSet) {
  return {
    version: 2, name: set.name, disableSend: set.items.length > 0 && set.items.every(i => i.kind !== 'send'), placeBeforeInput: false, injectInput: false, color: 'transparent', onlyBorderColor: false,
    qrList: set.items.map((it, i) => ({ id: i + 1, icon: it.stIcon || '', showLabel: !it.stIcon, label: it.label, title: it.title || '', message: it.text || '', contextList: [], preventAutoExecute: true, isHidden: !!it.hidden,
      executeOnStartup: !!it.auto?.start, executeOnUser: !!it.auto?.user, executeOnAi: !!it.auto?.ai, executeOnChatChange: !!it.auto?.open, executeOnGroupMemberDraft: false, executeOnNewChat: !!it.auto?.newChat, executeBeforeGeneration: !!it.auto?.gen, automationId: it.automationId || '' })),
    idIndex: set.items.length + 1,
  };
}
/** 세트를 넣는다. 같은 이름이 있으면 그 세트의 버튼을 새로 받은 것으로 바꾼다. 넣은 버튼 수를 돌려준다 */
export function qrAddSet(set: QrSet): number {
  const q = qrStore(), old = q.sets.find(s => s.name === set.name && !s.legacy);
  if (old) old.items = set.items; else q.sets.push(set);
  qrSave(); return set.items.length;
}
/** 낱개 버튼들을 기본 세트에 더한다 (다른 코드가 예전 방식으로 넣을 때) */
export function qrAddLoose(list: Loose[] | Loose | null | undefined): number {
  const q = qrStore(); let base = q.sets.find(s => s.legacy); const add = toArr(list).filter(x => x && x.text);
  if (!add.length) return 0;
  if (!base) { base = newQrSet({ name: '기본 버튼', legacy: true }); q.sets.unshift(base); }
  const have = base;
  const fresh = add.filter(a => !have.items.some(i => i.text === a.text));
  have.items.push(...fresh.map(x => newQrItem({ label: String(x.label || '버튼'), text: String(x.text), kind: kindOf(x.text) })));
  qrSave(); return fresh.length;
}
