// ── Dreamland qr-data: 빠른 버튼 세트의 자료 구조 · Quick Reply 세트 변환 (화면 없음) ──
// S.settings.qr = { v, sets: [세트], bar, migrated }
// 세트 = { id, name, scope: 'global'|'char'|'chat', on, charIds, chatIds, items: [버튼] }
// 버튼 = { id, label, icon, title, text, kind: 'insert'(입력창에 넣기)|'send'(바로 보내기)|'script'(명령 실행), hidden, auto: { start, open, newChat, user, ai, gen }, automationId }
import { S, uid, arr } from './core.js';

export const QR_KINDS = { insert: '입력창에 넣기', send: '바로 보내기', script: '명령 실행' };
export const QR_AUTO = { open: '대화를 열 때', newChat: '새 대화를 처음 열 때', user: '내가 보낸 뒤', ai: '답변이 온 뒤', gen: '생성을 시작할 때', start: '앱을 켤 때' };
export const QR_SCOPES = { global: '모든 대화', char: '고른 캐릭터', chat: '고른 대화방' };

export const newQrItem = (o = {}) => ({ id: uid(), label: '새 버튼', icon: '', title: '', text: '', kind: 'insert', hidden: false, auto: {}, automationId: '', ...o });
export const newQrSet = (o = {}) => ({ id: uid(), name: '새 세트', scope: 'global', on: true, charIds: [], chatIds: [], items: [], ...o });
const kindOf = text => /^\s*\//.test(text || '') ? 'script' : 'insert';

/** 저장소. 예전 빠른 답장(S.settings.quick: [{ label, text }])은 처음 한 번 "기본 버튼" 세트로 옮긴다 */
export function qrStore() {
  const q = S.settings.qr ||= { v: 1, sets: [], bar: true };
  if (!Array.isArray(q.sets)) q.sets = [];
  if (!q.migrated) {
    const d = Object.getOwnPropertyDescriptor(S.settings, 'quick'), old = d && 'value' in d && Array.isArray(d.value) ? d.value : [];
    const items = old.filter(x => x && x.text).map(x => newQrItem({ label: String(x.label || '버튼'), text: String(x.text), kind: kindOf(x.text) }));
    if (items.length && !q.sets.some(s => s.legacy)) q.sets.unshift(newQrSet({ name: '기본 버튼', legacy: true, items }));
    q.migrated = true; S.saveSettings?.();
  }
  return q;
}
export const qrSave = () => S.set({ qr: S.settings.qr });
/** 이 대화에서 켜져 있는 세트 */
export function qrActive(chat) {
  const off = new Set(chat?.qrOff || []);
  return qrStore().sets.filter(s => s.on !== false && !off.has(s.id) && (s.scope === 'char' ? (chat?.charIds || []).some(id => (s.charIds || []).includes(id)) : s.scope === 'chat' ? (s.chatIds || []).includes(chat?.id) : true));
}
export const qrFind = (key, chat) => { const k = String(key || '').trim(); if (!k) return null; const sets = qrStore().sets, act = chat ? qrActive(chat) : sets; for (const list of [act, sets]) for (const s of list) { const it = s.items.find(i => i.id === k) || s.items.find(i => i.label === k); if (it) return { set: s, item: it }; } return null; };

/** Quick Reply 세트(.json) → 세트 */
export function stQrToSet(j, name) {
  const noSend = !!j.disableSend;
  return newQrSet({
    name: j.name || name || '가져온 세트', src: 'st',
    items: arr(j.qrList).filter(x => x && (x.message || x.label)).map(x => newQrItem({
      label: String(x.label || x.title || '버튼'), title: x.title || '', text: x.message || '', kind: /^\s*\//.test(x.message || '') ? 'script' : (noSend ? 'insert' : 'send'), hidden: !!x.isHidden,
      auto: { start: !!x.executeOnStartup, open: !!x.executeOnChatChange, newChat: !!x.executeOnNewChat, user: !!x.executeOnUser, ai: !!x.executeOnAi, gen: !!x.executeBeforeGeneration },
      automationId: x.automationId || '', stIcon: x.icon || '',
    })),
  });
}
/** 세트 → Quick Reply 세트(.json) */
export function setToStQr(set) {
  return {
    version: 2, name: set.name, disableSend: set.items.length > 0 && set.items.every(i => i.kind !== 'send'), placeBeforeInput: false, injectInput: false, color: 'transparent', onlyBorderColor: false,
    qrList: set.items.map((it, i) => ({ id: i + 1, icon: it.stIcon || '', showLabel: !it.stIcon, label: it.label, title: it.title || '', message: it.text || '', contextList: [], preventAutoExecute: true, isHidden: !!it.hidden,
      executeOnStartup: !!it.auto?.start, executeOnUser: !!it.auto?.user, executeOnAi: !!it.auto?.ai, executeOnChatChange: !!it.auto?.open, executeOnGroupMemberDraft: false, executeOnNewChat: !!it.auto?.newChat, executeBeforeGeneration: !!it.auto?.gen, automationId: it.automationId || '' })),
    idIndex: set.items.length + 1,
  };
}
/** 세트를 넣는다. 같은 이름이 있으면 그 세트의 버튼을 새로 받은 것으로 바꾼다. 넣은 버튼 수를 돌려준다 */
export function qrAddSet(set) {
  const q = qrStore(), old = q.sets.find(s => s.name === set.name && !s.legacy);
  if (old) old.items = set.items; else q.sets.push(set);
  qrSave(); return set.items.length;
}
/** 낱개 버튼들을 기본 세트에 더한다 (다른 코드가 예전 방식으로 넣을 때) */
export function qrAddLoose(list) {
  const q = qrStore(); let base = q.sets.find(s => s.legacy); const add = arr(list).filter(x => x && x.text);
  if (!add.length) return 0;
  if (!base) { base = newQrSet({ name: '기본 버튼', legacy: true }); q.sets.unshift(base); }
  const fresh = add.filter(a => !base.items.some(i => i.text === a.text));
  base.items.push(...fresh.map(x => newQrItem({ label: String(x.label || '버튼'), text: String(x.text), kind: kindOf(x.text) })));
  qrSave(); return fresh.length;
}
