// 객석: 대화 화면에 떠 있는 작은 창. 이야기를 지켜보는 관객의 반응이 한 줄씩 올라온다. 반응은 본문 프롬프트에 들어가지 않고, "관객 요청"으로 고른 한 줄만 연출 지시로 보낸다
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { S, emit, on } from '../lib/core';
import { route } from '../lib/router';
import { IconBtn, useEvents } from '../kit';
import { promptBox, toast } from '../ui';
import { chatApi } from '../chat/actions';
import { t, getLang } from '../i18n';
import type { CrewChat, CrewSwipe, SeatLine } from './types';
import { seatsOf } from './builtin';
import { cfg, defOf, isOn, modeNow, st } from './logic';
import { hash, rng } from './text';
import { SeatsArt } from './Art';

interface Item { key: string; msgId: string; i: number; who: number; text: string }
/** 최근 답장 몇 개의 지금 스와이프에서 반응을 모은다 — 스와이프를 넘기거나 지우면 창도 따라 바뀐다 */
function feed(): Item[] {
  const { msgs } = chatApi.current(), out: Item[] = []; let n = 0;
  for (let k = msgs.length - 1; k >= 0 && n < 3; k--) {
    const m = msgs[k], lines = (m.swipes[m.sw] as CrewSwipe | undefined)?.crew?.seats as SeatLine[] | undefined;
    if (m.role !== 'assistant' || m.hidden || !Array.isArray(lines)) continue;
    n++; out.unshift(...lines.map((l, i) => ({ key: `${m.id}:${m.sw}:${i}`, msgId: m.id, i, who: l.who, text: l.text })));
  }
  return out;
}
/** 반응 하나를 다음 턴의 연출 지시로 보낸다 (고쳐서 보낼 수 있게 먼저 보여 준다) */
async function request(nick: string, text: string) {
  if (chatApi.current().busy) return toast(t('crew.err.busy'));
  const v = await promptBox(t('crew.seats.askTitle'), t('crew.seats.askDefault', { nick, text }), { area: true });
  if (!v?.trim()) return;
  const { sendDirection } = await import('../flow/logic');
  await sendDirection(v.trim());
}
export async function setSeatsOpen(chat: CrewChat, v: boolean) { const s = st(chat); s.seats = { ...(s.seats || {}), open: v }; await S.save('chats', chat, true); emit('crew:changed'); }

function Win({ chat }: { chat: CrewChat }) {
  const [, bump] = useState(0), box = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);
  // 새로 온 묶음은 시차를 두고 한 줄씩 보인다: fresh = { 메시지, 보인 줄 수 }
  const fresh = useRef<{ msgId: string; shown: number } | null>(null);
  const seats = seatsOf(chat.id, getLang()), w = st(chat).seats || {}, items = feed().filter(it => !fresh.current || it.msgId !== fresh.current.msgId || it.i < fresh.current.shown);
  useEffect(() => {
    let timer = 0;
    const off = on<{ chatId: string; msgId: string }>('crew:seats', e => {
      if (e.chatId !== chat.id) return;
      const r = rng(hash(e.msgId + Date.now())), total = feed().filter(it => it.msgId === e.msgId).length;
      fresh.current = { msgId: e.msgId, shown: 0 }; clearTimeout(timer);
      const step = () => { if (!fresh.current) return; fresh.current.shown++; bump(n => n + 1); if (fresh.current.shown >= total) fresh.current = null; else timer = window.setTimeout(step, 650 + r() * 1100); };
      timer = window.setTimeout(step, 350);
    });
    return () => { off(); clearTimeout(timer); };
  }, [chat.id]);
  // 새 줄이 오면 맨 아래로
  useEffect(() => { const el = body.current; if (el) el.scrollTop = el.scrollHeight; });
  // 머리를 끌어 옮긴다. 놓을 때 자리를 대화에 적어 둔다
  const drag = (e: RPointerEvent<HTMLElement>) => {
    const el = box.current; if (!el || (e.target as HTMLElement).closest('button') || matchMedia('(max-width: 820px)').matches) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { const x = Math.max(4, Math.min(innerWidth - r.width - 4, ev.clientX - dx)), y = Math.max(4, Math.min(innerHeight - 44, ev.clientY - dy)); el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); const q = el.getBoundingClientRect(); st(chat).seats = { ...(st(chat).seats || {}), x: Math.round(q.left), y: Math.round(q.top) }; void S.save('chats', chat, true); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  const fold = () => { st(chat).seats = { ...w, fold: !w.fold }; void S.save('chats', chat, true); bump(n => n + 1); };
  const pos = w.x != null && w.y != null ? { left: Math.min(w.x, innerWidth - 80), top: Math.min(w.y, innerHeight - 60), right: 'auto', bottom: 'auto' } : undefined;
  const last = items[items.length - 1], style = cfg().seats.style;
  return <aside ref={box} className={'cr-seats fx-frame' + (w.fold ? ' fold' : '')} style={pos} aria-label={t('crew.b.seats.name')}>
    <header className="cr-seats-head" onPointerDown={drag}>
      <span className="cr-seats-title"><span className="fx-serif">{t('crew.b.seats.name')}</span><span className="fx-lbl kr">{t('crew.seats.s.' + style)}</span></span>
      <IconBtn ic={w.fold ? 'up' : 'down'} cls="tiny" title={w.fold ? t('crew.seats.unfold') : t('crew.seats.fold')} onClick={fold} />
      <IconBtn ic="x" cls="tiny" title={t('common.close')} onClick={() => void setSeatsOpen(chat, false).then(() => bump(n => n + 1))} />
    </header>
    {w.fold ? (last ? <p className="cr-seats-tick"><b>{seats[last.who % seats.length].nick}</b>{last.text}</p> : null) : <>
      <div className="cr-seats-body" ref={body} aria-live="polite">
        {items.length ? items.map(it => { const a = seats[it.who % seats.length]; return <div className="cr-line fx-in" key={it.key}>
          <span className="cr-line-seat fx-num">{a.no}</span>
          <p><b>{a.nick}</b>{it.text}</p>
          <button type="button" className="cr-line-ask" title={t('crew.seats.ask')} aria-label={t('crew.seats.ask')} onClick={() => void request(a.nick, it.text)}><svg viewBox="0 0 24 24" width="14" height="14" className="fx-art"><path d="M4 12h11M11 7l5 5l-5 5M19 6v12" /></svg></button>
        </div>; }) : <div className="cr-seats-empty"><p>{fresh.current ? t('crew.seats.arriving') : t('crew.seats.empty')}</p></div>}
        {fresh.current && items.length > 0 && <span className="cr-seats-wait" aria-hidden="true"><i /><i /><i /></span>}
      </div>
      <footer className="cr-seats-foot"><SeatsArt seed={chat.id} taken={seats.length} /><span className="fx-lbl kr">{t('crew.seats.private')}</span></footer>
    </>}
  </aside>;
}
/** 대화 화면이고, 이 대화에서 객석이 켜져 있고, 창을 닫지 않았을 때만 그린다 */
export function SeatsHost() {
  useEvents('route', 'chat:open', 'crew:changed', 'crew:seats', 'message:swiped', 'message:deleted', 'generate:end', 'settings');
  const chat = chatApi.current().chat as CrewChat | null, d = defOf('seats');
  if (route.page !== 'chat' || !chat || !d || !isOn(d, chat) || !d.modes.includes(modeNow(chat)) || chat.crew?.seats?.open === false) return null;
  return <Win key={chat.id} chat={chat} />;
}
