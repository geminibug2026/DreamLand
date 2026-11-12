// 대화 메뉴 · 그룹 만들기 · 상태 메뉴 · 이 대화에서 찾기 · 이 방의 시각
import { editSchedule } from '../schedule/Editor';
import { useReducer, useState } from 'react';
import { charPicker, confirmBox, menu, openModal, promptBox, toast, type MenuItem, type ModalHandle } from '../ui';
import { cur, ui } from './store';
import { charsOf, drawMain, drawSide, drawTop, jumpTo, modeOf, presenceOf, titleOf } from './actions';
import { inspector } from './Inspector';
import { liveSettings } from './LiveSettings';
import type { Cast, ClockCfg, Room } from './types';
import { S, download, emit, msgText } from '../lib/core';
import { go } from '../lib/router';
import { Live, mo } from '../lib/live';
import { Clock, clockHint } from '../lib/clock';
import { STATUS, scheduleOf } from '../lib/f-schedule';
import { chatToStJsonl } from '../lib/cards';
import { startMenu } from './start';
import { Assets } from '../lib/assets';
import { t } from '../i18n';

export interface TopHooks { narrow: boolean; setMode(k: 'rp' | 'talk'): void; find(): void; me(a: Element): void; pres(a: Element): void }

export const presItems = (c: Room, chars: Cast[]): MenuItem[] => [
  ...chars.map(ch => { const p = presenceOf(c, ch); return { label: `${ch.name} · ${STATUS[p.status]}`, hint: p.activity || (scheduleOf(ch) ? '' : t('chat.menu.noSchedule')), ic: 'moon', onclick: () => editSchedule(ch) }; }),
  '-', { label: t('chat.menu.liveSettings'), ic: 'sliders', onclick: () => { liveSettings('auto', c); } }];
export const meItems = (): MenuItem[] => {
    return [
    ...Object.entries(Live.userStatuses).map(([k, l]) => ({ label: l, ic: mo('userStatus') === k ? 'check' : 'user', hint: k === 'dnd' ? t('chat.menu.me.dnd') : k === 'hidden' ? t('chat.menu.me.hidden') : k === 'idle' ? '' : t('chat.menu.me.autoIdle', { n: mo('userIdleMin') || 0 }), onclick: () => Live.setUserStatus(k) })),
    '-', { label: t('chat.menu.writeActivity'), ic: 'edit', hint: String(mo('userActivity') || ''), onclick: async () => { const v = await promptBox(t('chat.menu.me.activityPrompt'), String(mo('userActivity') || ''), { placeholder: t('chat.live.pres.userActivityPh') }); if (v !== null) { S.settings.modes.userActivity = v.trim(); S.set({}); } } }];
};

export function chatMenu(anchor: Element, c: Room, top: TopHooks | null = null) {
  const talk = modeOf(c) === 'talk', N = top?.narrow ? top : null, parent = c.parent && S.get('chats', c.parent.id);
  menu(anchor, [
    ...(N ? [
      { label: talk ? t('chat.menu.toRp') : t('chat.menu.toTalk'), ic: talk ? 'feather' : 'chat', hint: talk ? t('chat.menu.likeNovel') : t('chat.menu.likeMessenger'), onclick: () => N.setMode(talk ? 'rp' : 'talk') },
      talk ? { label: t('chat.menu.charStatus'), ic: 'moon', onclick: () => N.pres(anchor) } : null,
      talk ? { label: t('chat.menu.myStatus'), ic: 'user', hint: Live.userStatus().label, onclick: () => N.me(anchor) } : null,
      { label: t('chat.menu.diary'), ic: 'book', onclick: () => emit('diary:open', c) },
      { label: t('chat.menu.find'), ic: 'search', onclick: N.find },
      { label: t('chat.menu.newChat'), ic: 'plus', onclick: () => startMenu(anchor, c.charIds) },
      { label: t('chat.menu.inspect'), ic: 'code', onclick: inspector },
      '-'] as MenuItem[] : []),
    talk ? { label: t('chat.menu.clock'), ic: 'moon', hint: clockHint(c), onclick: () => { clockDialog(c, () => { if (c.id === cur.chat?.id) drawMain(); }); } } : null,
    { label: t('chat.menu.talkSettings'), ic: 'sliders', hint: t('chat.menu.talkSettingsHint'), onclick: () => { liveSettings(modeOf(c) === 'talk' ? 'auto' : 'tracker', c); } },
    { label: c.pinned ? t('chat.menu.unpin') : t('chat.menu.pin'), ic: 'star', onclick: async () => { c.pinned = !c.pinned; await S.save('chats', c, true); drawSide(); } },
    parent ? { label: t('chat.menu.toParent'), ic: 'branch', onclick: () => go('chat', parent.id) } : null,
    { label: t('chat.menu.rename'), ic: 'edit', onclick: async () => { const v = await promptBox(t('chat.menu.renamePrompt'), c.name); if (v !== null) { c.name = v; await S.save('chats', c, true); drawSide(); if (c.id === cur.chat?.id) drawTop(); } } },
    { label: t('chat.menu.exportJsonl'), ic: 'import', hint: t('chat.menu.stCompat'), onclick: async () => { const ms = await S.msgs(c.id); download(`${titleOf(c)}-${c.id}.jsonl`, chatToStJsonl(c, ms, S.persona(c).name, charsOf(c)[0]?.name || 'Character'), 'application/jsonl'); } },
    { label: t('chat.menu.exportTxt'), ic: 'note', onclick: async () => { const ms = await S.msgs(c.id); download(`${titleOf(c)}.txt`, ms.filter(m => !m.hidden).map(m => `${m.role === 'user' ? S.persona(c).name : m.role === 'system' ? '나레이션' : (m.name || titleOf(c))}: ${msgText(m)}`).join('\n\n'), 'text/plain'); } },
    '-',
    { label: t('chat.menu.delete'), ic: 'trash', danger: true, onclick: async () => {
      if (!(await confirmBox(t('chat.menu.deleteConfirm', { name: titleOf(c) }), t('common.delete'), true))) return;
      if (cur.gen?.chat === c) cur.abort?.abort();
      await Assets.removeOwner('chat:' + c.id); await S.remove('chats', c.id);
      if (c.id === cur.chat?.id) { cur.chat = null; S.set({ lastChat: '' }); go('chat'); } else drawSide();
    } },
  ]);
}

export function groupDialog() {
  if (S.chars.length < 2) return toast(t('chat.group.needTwo'));
  charPicker({ title: t('chat.group.pickTitle'), onDone: ids => { if (ids.length < 2) return toast(t('chat.group.pickTwo')); startMenu(ui.side || document.body, ids); } });
}

function Find({ close }: { close: () => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const hits = term ? cur.msgs.map((x, i) => ({ x, i, t: msgText(x) })).filter(o => o.t.toLowerCase().includes(term)).slice(-80).reverse() : null;
  return <div className="col"><input className="inp" placeholder={t('chat.find.placeholder')} value={q} onChange={e => setQ(e.target.value)} />
    <div className="find-list">{hits && (hits.length ? hits.map(o => { const at = o.t.toLowerCase().indexOf(term); return <button className="find-item" key={o.x.id} onClick={() => { close(); jumpTo(o.x); }}>
      <b>{`${String(o.i + 1).padStart(3, '0')} · ${o.x.role === 'user' ? S.persona(cur.chat).name : (o.x.name || t('chat.find.narrator'))}`}</b><span>{(at > 30 ? '…' : '') + o.t.slice(Math.max(0, at - 30), at + 90).replace(/\s+/g, ' ')}</span></button>; }) : <p className="dim">{t('chat.find.none')}</p>)}</div></div>;
}
export function findInChat() { const m: ModalHandle = openModal({ title: t('chat.menu.find'), body: <Find close={() => m.close()} /> }); }

// ── 이 방의 시각 ──
const pad = (n: number) => String(n).padStart(2, '0');
const local = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function ClockDlg({ chat }: { chat: Room }) {
  const [gen, redraw] = useReducer((x: number) => x + 1, 0);
    const set = async (patch: ClockCfg) => { chat.clock = { mode: 'real', at: Date.now(), setAt: Date.now(), flow: 'real', step: 5, ai: false, ...(chat.clock || {}), ...patch }; await S.save('chats', chat, true); emit('clock', chat); redraw(); };
  const c: ClockCfg = chat.clock || { mode: 'real' }, mode = c.mode || 'real';
  const card = (k: 'real' | 'story' | 'none', title: string, desc: string) => <button type="button" className={'clock-opt' + (mode === k ? ' on' : '')} onClick={() => void set(k === 'story' && mode !== 'story' ? { mode: k, at: Clock.ms(chat), setAt: Date.now() } : { mode: k })}><i /><b>{title}</b><small>{desc}</small></button>;
  const jump = (min: number) => { const now = Clock.ms(chat); let t = now + min * 60000; if (!min) { const d = new Date(now); t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0).getTime(); } void set({ at: t, setAt: Date.now() }); };
  return <div className="clock-dlg">
    <div className="clock-opts">
      {card('real', t('chat.clock.real'), t('chat.clock.realDesc'))}
      {card('story', t('chat.clock.story'), t('chat.clock.storyDesc'))}
      {card('none', t('chat.clock.none'), t('chat.clock.noneDesc'))}
    </div>
    {mode === 'story' ? <div className="clock-story">
      <label className="field"><span className="field-label">{t('chat.clock.now')}</span><input className="inp" type="datetime-local" key={gen} defaultValue={local(Clock.ms(chat))} onChange={e => { const t = new Date(e.target.value).getTime(); if (isFinite(t)) void set({ at: t, setAt: Date.now() }); }} /></label>
      <div className="clock-jump">{([[t('chat.clock.plus1h'), 60], [t('chat.clock.plus6h'), 360], [t('chat.clock.nextMorning'), 0], [t('chat.clock.plus1w'), 10080]] as const).map(([l, min]) => <button type="button" className="chip" key={l} onClick={() => jump(min)}>{l}</button>)}</div>
      <label className="field"><span className="field-label">{t('chat.clock.flow')}</span><select className="inp" value={c.flow || 'real'} onChange={e => void set({ at: Clock.ms(chat), setAt: Date.now(), flow: e.target.value as ClockCfg['flow'] })}>
        <option value="real">{t('chat.clock.flowReal')}</option><option value="step">{t('chat.clock.flowStep')}</option><option value="hold">{t('chat.clock.flowHold')}</option></select></label>
      {c.flow === 'step' ? <label className="field"><span className="field-label">{t('chat.clock.step')}</span><input className="inp" type="number" min={0} max={1440} defaultValue={c.step ?? 5} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={e => { const v = Math.max(0, +e.target.value || 0); if (v !== (c.step ?? 5)) void set({ step: v }); }} /></label> : null}
      <label className="check"><input type="checkbox" checked={!!c.ai} onChange={e => void set({ ai: e.target.checked })} /><i /><span>{t('chat.clock.ai')}</span><small>{t('chat.clock.aiHint')}</small></label>
      <small className="hint">{t('chat.clock.hint')}</small>
    </div> : null}
  </div>;
}
/** 이 방의 시각 고르기. 고치는 즉시 저장된다 */
export function clockDialog(chat: Room, done: () => void = () => { }) {
  return openModal({ title: t('chat.menu.clock'), body: <ClockDlg chat={chat} />, actions: [{ label: t('common.close'), cls: 'primary' }], onClose: done });
}
