// 지운 메시지 보관함: 지운 메시지를 대화별로 30일 동안 둔다 → 원래 자리에 되살리거나 완전히 지운다. 지운 직후에는 "되돌리기"를 띄운다
// 보관: kv 의 trash:<대화 id> 한 줄씩 (휴지통도 내 기록이라 백업에 함께 담긴다 — 기한이 지나면 스스로 비운다) + 어느 대화에 있는지 적은 xt-trash 한 줄
import { useState } from 'react';
import { Btn } from '../kit';
import { confirmBox, openModal, toast, type ModalHandle } from '../ui';
import { DB, S, emit, msgText, now, uid } from '../lib/core';
import { Live } from '../lib/live';
import type { Chat, Msg } from '../lib/types';
import { chatApi } from '../chat/actions';
import { fmtDate, t } from '../i18n';
import { cfg } from './cfg';

export interface TrashItem { m: Msg; at: number; after: string; ts: number; batch: string }
interface TrashRow { id: string; items: TrashItem[] }
interface IndexRow { id: 'xt-trash'; chats: Record<string, number> }
const MAX_ITEMS = 400, DAY = 86400000, keyOf = (chatId: string) => 'trash:' + chatId;
const ttl = () => Math.max(1, +cfg().trash.days || 30) * DAY;
const getRow = async (chatId: string): Promise<TrashRow> => ((await DB.get('kv', keyOf(chatId)).catch(() => undefined)) as TrashRow | undefined) || { id: keyOf(chatId), items: [] };
const getIndex = async (): Promise<IndexRow> => ((await DB.get('kv', 'xt-trash').catch(() => undefined)) as IndexRow | undefined) || { id: 'xt-trash', chats: {} };
async function putRow(chatId: string, row: TrashRow) {
  const idx = await getIndex();
  if (row.items.length) { await DB.put('kv', row); idx.chats[chatId] = Math.min(...row.items.map(i => i.ts)); } else { await DB.del('kv', row.id); delete idx.chats[chatId]; }
  await DB.put('kv', idx);
}

export const Trash = {
  /** 지운 메시지를 넣는다. gone 은 원래 차례대로, at 은 첫 메시지가 있던 자리, after 는 바로 앞 메시지 id */
  async add(chat: Chat, gone: Msg[], at: number, after: string) {
    if (!gone.length) return '';
    const row = await getRow(chat.id), batch = uid(), ts = now();
    let prev = after; gone.forEach((m, i) => { row.items.push({ m, at: at + i, after: prev, ts, batch }); prev = m.id; });
    if (row.items.length > MAX_ITEMS) row.items.splice(0, row.items.length - MAX_ITEMS);
    await putRow(chat.id, row); return batch;
  },
  async list(chatId: string) { const row = await getRow(chatId), live = row.items.filter(i => now() - i.ts < ttl()); if (live.length !== row.items.length) { row.items = live; await putRow(chatId, row); } return live; },
  /** 완전히 지운다 (ids 가 없으면 전부) */
  async purge(chatId: string, ids?: Set<string>) { const row = await getRow(chatId); row.items = ids ? row.items.filter(i => !ids.has(i.m.id)) : []; await putRow(chatId, row); },
  /** 되살린다: 앞에 있던 메시지 바로 뒤, 그 메시지가 없으면 원래 번호 자리에 */
  async restore(chat: Chat, pick: (i: TrashItem) => boolean) {
    const row = await getRow(chat.id), back = row.items.filter(pick); if (!back.length) return 0;
    const open = chatApi.current().chat?.id === chat.id, msgs = open ? chatApi.current().msgs : await S.msgs(chat.id), have = new Set(msgs.map(m => m.id));
    let n = 0;
    for (const it of [...back].sort((a, b) => a.ts - b.ts || a.at - b.at)) {
      if (have.has(it.m.id)) continue;
      const i = it.after ? msgs.findIndex(m => m.id === it.after) : -1;
      msgs.splice(i >= 0 ? i + 1 : Math.max(0, Math.min(msgs.length, it.at)), 0, it.m); have.add(it.m.id); n++;
    }
    const ids = new Set(back.map(i => i.m.id)); row.items = row.items.filter(i => !ids.has(i.m.id)); await putRow(chat.id, row);
    try { Live.rewind(chat as never, msgs as never); } catch { /* 상태창을 쓰지 않는 방 */ }
    await S.saveMsgs(chat, msgs);
    if (open) { chatApi.redraw(); emit('message:deleted', { chat, msgs }); }   // 목록이 달라졌으니 기억 · 변수 같은 것도 다시 맞추게 알린다
    return n;
  },
  /** 기한이 지난 것을 비운다 (앱을 열 때 · 백업을 되돌린 뒤) */
  async sweep() {
    const idx = await getIndex(), cut = now() - ttl();
    for (const [chatId, oldest] of Object.entries(idx.chats)) { if (!S.get('chats', chatId)) { await DB.del('kv', keyOf(chatId)); delete idx.chats[chatId]; continue; } if (oldest < cut) await this.list(chatId); }
    const fresh = await getIndex(); for (const k of Object.keys(fresh.chats)) if (!(k in idx.chats)) delete fresh.chats[k]; await DB.put('kv', fresh);
  },
  async dropChat(chatId: string) { await DB.del('kv', keyOf(chatId)); const idx = await getIndex(); if (chatId in idx.chats) { delete idx.chats[chatId]; await DB.put('kv', idx); } },
};

/** 지운 직후 잠깐 뜨는 알림: 누르면 방금 지운 것을 되살린다 */
export function undoToast(chat: Chat, batch: string, n: number) {
  const host = document.getElementById('toasts'); if (!host || !batch) return;
  host.querySelectorAll('.xt-undo').forEach(e => e.remove());
  const el = document.createElement('div'); el.className = 'toast xt-undo'; el.setAttribute('role', 'status');
  const txt = document.createElement('span'); txt.textContent = t('extras.trash.deleted', { n });
  const b = document.createElement('button'); b.type = 'button'; b.textContent = t('extras.trash.undo');
  const out = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
  b.onclick = async () => { b.disabled = true; out(); await Trash.restore(chat, i => i.batch === batch); };
  el.append(txt, b); host.append(el); setTimeout(out, 7000);
}

// ════════ 창 ════════
/** 빈 보관함: 빈 서랍 한 칸 */
const EmptyArt = () => <svg viewBox="0 0 56 56" className="fx-art"><path d="M8 18h40v26H8zM8 30h40" /><path className="t" d="M24 24h8M24 37h8" /><path className="d" d="M14 12h28M18 7h20" /></svg>;

function Window({ chat, first, close }: { chat: Chat; first: TrashItem[]; close: () => void }) {
  const [items, setItems] = useState(first), [sel, setSel] = useState<Set<string>>(new Set());
  const reload = async () => { setItems(await Trash.list(chat.id)); setSel(new Set()); };
  const persona = S.persona(chat).name, days = Math.max(1, +cfg().trash.days || 30);
  const who = (m: Msg) => m.role === 'user' ? persona : m.role === 'system' ? t('extras.trash.narr') : (m.name || '—');
  // 한 번에 지운 것끼리 묶어서, 최근 것부터
  const groups = new Map<string, TrashItem[]>(); for (const it of items) (groups.get(it.batch) || groups.set(it.batch, []).get(it.batch)!).push(it);
  const sorted = [...groups.values()].sort((a, b) => b[0].ts - a[0].ts);
  const flip = (ids: string[]) => { const s = new Set(sel), all = ids.every(i => s.has(i)); ids.forEach(i => all ? s.delete(i) : s.add(i)); setSel(s); };
  const restore = async (pick: (i: TrashItem) => boolean) => { const n = await Trash.restore(chat, pick); toast(t('extras.trash.restored', { n }), 'ok'); await reload(); if (!(await Trash.list(chat.id)).length) close(); };
  if (!items.length) return <div className="fx-empty"><EmptyArt /><p>{t('extras.trash.empty', { days })}</p></div>;
  return <div className="xt-trash">
    <p className="hint">{t('extras.trash.hint', { days })}</p>
    <div className="xt-trash-list">{sorted.map(g => { const ids = g.map(i => i.m.id), left = Math.max(0, Math.ceil((g[0].ts + days * DAY - now()) / DAY));
      return <section key={g[0].batch} className="xt-trash-g">
        <header><button type="button" className="xt-trash-all" onClick={() => flip(ids)} aria-label={t('extras.trash.pickGroup')}><i className={'xt-box' + (ids.every(i => sel.has(i)) ? ' on' : '')} /></button>
          <span className="fx-num">{fmtDate(g[0].ts, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span className="fx-lbl kr">{t('extras.trash.count', { n: g.length })}</span><i className="xt-lead" /><span className="fx-lbl kr">{t('extras.trash.left', { n: left })}</span>
          <button type="button" className="xt-link" onClick={() => void restore(i => i.batch === g[0].batch)}>{t('extras.trash.restore')}</button></header>
        <div className="fx-rows">{g.map(it => <label key={it.m.id} className="xt-trash-row"><input type="checkbox" checked={sel.has(it.m.id)} onChange={() => flip([it.m.id])} /><i className={'xt-box' + (sel.has(it.m.id) ? ' on' : '')} />
          <span className="fx-num xt-no">{String(it.at + 1).padStart(3, '0')}</span><b>{who(it.m)}</b><span className="xt-trash-txt">{msgText(it.m).replace(/\s+/g, ' ').slice(0, 160) || '—'}</span></label>)}</div>
      </section>; })}</div>
    <div className="row end xt-trash-foot"><span className="fx-num">{String(sel.size).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span><i className="xt-lead" />
      <Btn label={t('extras.trash.purge')} ic="trash" cls="ghost danger" onClick={async () => { const all = !sel.size; if (!(await confirmBox(all ? t('extras.trash.purgeAllAsk') : t('extras.trash.purgeAsk', { n: sel.size }), t('common.delete'), true))) return; await Trash.purge(chat.id, all ? undefined : sel); await reload(); }} />
      <Btn label={sel.size ? t('extras.trash.restoreN', { n: sel.size }) : t('extras.trash.restoreAll')} ic="refresh" cls="primary" onClick={() => void restore(sel.size ? i => sel.has(i.m.id) : () => true)} /></div>
  </div>;
}
export async function openTrash(chat: Chat) {
  const first = await Trash.list(chat.id);
  const m: ModalHandle = openModal({ title: t('extras.trash.title'), wide: true, body: <Window chat={chat} first={first} close={() => m.close()} /> });
}
