// 상태창(HUD): 대화 위의 띠 · 인물 카드 · 지난 시점 훑어보기 · 고치기 창 (옛 js/live.js 의 hud · editState. 계산은 옛 Live 를 다리로)
import { useReducer, useRef, type MouseEvent } from 'react';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import { confirmBox, menu, openModal, promptBox } from '../ui';
import * as live from '../lib/live';
import { cur, useCh } from './store';
import { hudOpts, type HudOpts } from './actions';
import { liveSettings } from './LiveSettings';
import type { Cast, Field, Msg, Room } from './types';
import { S } from '../lib/core';
import { Live } from '../lib/live';
import { t as tr } from '../i18n';

const THINK = /속마음|생각|독백|thought|mind/i;
const lastAi = (msgs: Msg[]) => [...msgs].reverse().find(m => m.role === 'assistant');
const pct = (v: string, f: Field) => Math.max(0, Math.min(100, (parseFloat(v) - (f.min ?? 0)) / (((f.max ?? 0) - (f.min ?? 0)) || 1) * 100)) + '%';
const Lock = () => <Icon name="lock" size={10} />;

/** 대화 위에 떠 있는 상태창 */
export function Hud() {
  useCh('hud');
  const chat = cur.chat; if (!chat) return null;
  const st = S.settings.tracker || {}; if (!st.enabled || st.hud === false) return null;
  const { timeline, snapOf, stateAt, copyState, rewound } = live;
  const opt = hudOpts(), msgs = opt.msgs, fields = Live.fields(), cf = Live.castFields(), lock = chat.trackLock || {}, hide = chat.trackHide || {};
  const tl = timeline(msgs), vi = Live.view?.chat === chat.id && tl.includes(Live.view.i) ? Live.view.i : -1, past = vi >= 0;
  const state = past ? copyState(snapOf(msgs[vi])) : Live.state(chat), before = past ? (stateAt(msgs, vi)?.state || copyState(chat.snap0)) : null;
  const keys = (fields.length ? fields.map(f => f.key) : Object.keys(state.w)).filter(k => !hide['w:' + k]);
  const people = cf.length ? [...new Set([...opt.chars.map(c => c.name), ...Object.keys(state.c)])] : [];
  if (!keys.length && !people.length) return null;
  const diff = chat.trackDiff || {}, cdiff = chat.castDiff || {}, t = Date.now();
  const fresh = (k: string) => before ? (before.w[k] ?? '') !== (state.w[k] ?? '') : !!diff[k] && t - diff[k].at < 90000;
  const freshC = (n: string, f: string) => before ? (before.c[n]?.[f] ?? '') !== (state.c[n]?.[f] ?? '') : !!cdiff[`${n}:${f}`] && t - cdiff[`${n}:${f}`].at < 90000;
  const done = (stampIt = true) => { if (stampIt) { const last = lastAi(msgs); if (last) Live.stamp(chat, last); } opt.saved(); opt.redraw(); };
  const cellMenu = (anchor: Element, key: string, label: string, value: string) => {
    if (past) return;
    menu(anchor, [
      { label: tr('chat.hud.edit'), ic: 'edit', onclick: async () => { const v = await promptBox(label, value || ''); if (v === null) return; Live.setValue(chat, key, v); done(); } },
      { label: lock[key] ? tr('chat.hud.unlock') : tr('chat.hud.lock'), ic: 'lock', hint: lock[key] ? '' : tr('chat.hud.lockHint'), onclick: () => { Live.toggle(chat, 'trackLock', key); done(false); } },
      { label: tr('chat.hud.hide'), ic: 'eyeoff', hint: tr('chat.hud.hideHint'), onclick: () => { Live.toggle(chat, 'trackHide', key); done(false); } }]);
  };
  const cell = (k: string) => {
    const f = fields.find(x => x.key === k) || ({ key: k } as Field), v = state.w[k] ?? '', d = diff[k], meter = f.max != null && isFinite(parseFloat(v)), fr = fresh(k);
    const dv = before ? parseFloat(v) - parseFloat(before.w[k]) : d?.d, was = before ? before.w[k] : d?.from;
    return <button key={k} type="button" className={['hud-cell', meter && 'meter', fr && 'fresh', lock['w:' + k] && 'locked'].filter(Boolean).join(' ')}
      title={[f.desc, fr && was ? tr('chat.hud.was', { value: was }) : '', lock['w:' + k] ? tr('chat.hud.locked') : ''].filter(Boolean).join(' · ')} onClick={e => cellMenu(e.currentTarget, 'w:' + k, k, v)}>
      <span className="hud-k">{k}{lock['w:' + k] ? <Lock /> : null}</span>{meter ? <span className="hud-bar"><i style={{ width: pct(v, f) }} /></span> : null}
      <b className="hud-v">{v === '' ? '—' : meter ? String(parseFloat(v)) : v}</b>
      {fr && dv && isFinite(dv) ? <i className={'hud-d ' + (dv > 0 ? 'up' : 'down')}>{`${dv > 0 ? '▲' : '▼'}${Math.abs(Math.round(dv * 10) / 10)}`}</i> : null}
    </button>;
  };
  // 인물 카드
  const card = (name: string) => {
    const ch = opt.chars.find(c => c.name === name), data = state.c[name] || {}, rows = cf.filter(f => !hide[`c:${name}:${f.key}`]);
    const row = (f: Field) => {
      const key = `c:${name}:${f.key}`, v = data[f.key] ?? '', meter = f.max != null && isFinite(parseFloat(v)), fr = freshC(name, f.key);
      const base = { type: 'button' as const, title: [f.desc, lock[key] ? tr('chat.hud.locked') : ''].filter(Boolean).join(' · '), onClick: (e: MouseEvent<HTMLButtonElement>) => cellMenu(e.currentTarget, key, `${name} · ${f.key}`, v) };
      const k = <span className="pcard-k">{f.key}{lock[key] ? <Lock /> : null}</span>;
      if (THINK.test(f.key)) return <button key={f.key} className={['pcard-think', fr && 'fresh', !v && 'blank'].filter(Boolean).join(' ')} {...base}>{k}<p>{v || tr('chat.hud.unknown')}</p></button>;
      return <button key={f.key} className={'pcard-row' + (fr ? ' fresh' : '')} {...base}>{k}{meter ? <span className="hud-bar"><i style={{ width: pct(v, f) }} /></span> : null}<b>{v === '' ? '—' : v}</b></button>;
    };
    return <article className="pcard" key={name}>
      <header className="pcard-head"><Avatar o={ch || { name }} cls="sm" /><b>{name}</b>{ch ? null : <small>{tr('chat.hud.companion')}</small>}
        {past ? null : <IconBtn ic="more" title={tr('chat.hud.cardMenu')} cls="tiny" onClick={e => menu(e.currentTarget, [
          ...cf.filter(f => hide[`c:${name}:${f.key}`]).map(f => ({ label: tr('chat.hud.unhide', { key: f.key }), ic: 'eye', onclick: () => { Live.toggle(chat, 'trackHide', `c:${name}:${f.key}`); done(false); } })),
          { label: tr('chat.hud.clearCard'), ic: 'trash', danger: true, onclick: () => { if (chat.cast) delete chat.cast[name]; for (const k of Object.keys(lock)) if (k.startsWith(`c:${name}:`)) delete lock[k]; done(); } }])} />}</header>
      <div className="pcard-body">{rows.filter(f => !THINK.test(f.key)).map(row)}{rows.filter(f => THINK.test(f.key)).map(row)}</div>
    </article>;
  };
  const go = (i: number) => { Live.view = i < 0 ? null : { chat: chat.id, i }; opt.redraw(); };
  const at = past ? tl.indexOf(vi) : tl.length - 1, older = at > 0 ? tl[at - 1] : -1, newer = past ? (at + 1 >= tl.length - 1 ? -1 : tl[at + 1]) : -2;
  const when = (e: MouseEvent<HTMLButtonElement>) => { if (past) menu(e.currentTarget, [
    { label: tr('chat.hud.gotoMsg'), ic: 'search', onclick: () => opt.onJump(msgs[vi]) },
    { label: tr('chat.hud.restore'), ic: 'refresh', hint: tr('chat.hud.restoreHint'), onclick: async () => { if (!(await confirmBox(tr('chat.hud.restoreConfirm', { n: vi + 1 }), tr('chat.hud.restoreBtn')))) return; const next = rewound(Live.state(chat), state, lock); chat.tracker = next.w; chat.cast = next.c; chat.trackDiff = {}; chat.castDiff = {}; Live.view = null; done(); } },
    { label: tr('chat.hud.toNow'), ic: 'right', onclick: () => go(-1) }]); };
  const nav = tl.length > 1 ? <div className="hud-nav">
    <button type="button" title={tr('chat.hud.prev')} disabled={older < 0} onClick={() => go(older)}><Icon name="left" size={13} /></button>
    <button type="button" className="hud-when" title={past ? tr('chat.hud.whenPast') : tr('chat.hud.whenNow')} onClick={when}>{past ? `#${String(vi + 1).padStart(3, '0')}` : tr('chat.hud.now')}{past ? <small>{`${at + 1}/${tl.length}`}</small> : null}</button>
    <button type="button" title={past ? tr('chat.hud.next') : tr('chat.hud.latest')} disabled={!past} onClick={() => go(newer)}><Icon name="right" size={13} /></button>
  </div> : null;
  const fold = !!chat.hudFold, head = fold ? keys.slice(0, 3).map(k => `${k} ${state.w[k] ?? '—'}`).join('  ·  ') : '';
  const castOpen = !!people.length && chat.hudCast !== false;
  return <div className={['hud', fold && 'fold', past && 'past'].filter(Boolean).join(' ')}>
    <div className="hud-line">
      <button type="button" className="hud-tab" title={fold ? tr('chat.hud.unfold') : tr('chat.hud.fold')} onClick={() => void opt.onFold()}><i>✦</i>{fold ? <span>{head || tr('chat.hud.status')}</span> : tr('chat.hud.status')}</button>
      {fold ? null : <div className="hud-grid">{keys.map(cell)}{!keys.length ? <span className="hud-none">{tr('chat.hud.allHidden')}</span> : null}</div>}
      {fold ? null : <div className="hud-side">{nav}
        {people.length ? <button type="button" className={'hud-people' + (castOpen ? ' on' : '')} title={castOpen ? tr('chat.hud.castFold') : tr('chat.hud.castUnfold')} onClick={() => { chat.hudCast = !castOpen; opt.saved(); opt.redraw(); }}><i>☾</i>{tr('chat.hud.people', { count: people.length })}</button> : null}
        <button type="button" className="hud-edit" title={tr('chat.hud.editAll')} onClick={() => editState(chat, opt)}>⋯</button></div>}
    </div>
    {!fold && castOpen ? <div className="hud-cast">{people.map(card)}</div> : null}
  </div>;
}

function StateEdit({ chat, opt }: { chat: Room; opt: HudOpts }) {
  const [gen, draw] = useReducer((x: number) => x + 1, 0);
  const timer = useRef(0);
  const lock = chat.trackLock ||= {}, hide = chat.trackHide ||= {};
  const flush = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => { const last = lastAi(opt.msgs); if (last) Live.stamp(chat, last); opt.saved(); opt.redraw(); }, 300); };
  const fields = Live.fields(), cf = Live.castFields(), w = chat.tracker || {}, c = chat.cast || {};
  const keys = fields.length ? fields.map(f => f.key) : Object.keys(w), people = cf.length ? [...new Set([...opt.chars.map(x => x.name), ...Object.keys(c)])] : [];
  const row = (key: string, label: string, value: string | undefined, f?: Field) => <div className={'se-row' + (hide[key] ? ' se-off' : '')} key={key}>
    <span className="se-k">{label}{f?.max != null ? <small>{`${f.min}–${f.max}`}</small> : null}</span>
    <input className="inp" key={gen} defaultValue={value ?? ''} placeholder={f?.desc || tr('chat.hud.empty')} onChange={e => { Live.setValue(chat, key, e.target.value); flush(); }} />
    <button type="button" className={'se-tog' + (lock[key] ? ' on' : '')} title={lock[key] ? tr('chat.hud.lockOn') : tr('chat.hud.lockOff')} onClick={() => { Live.toggle(chat, 'trackLock', key); flush(); draw(); }}><Icon name="lock" size={15} /></button>
    <button type="button" className={'se-tog' + (hide[key] ? ' on' : '')} title={hide[key] ? tr('chat.hud.hideOn') : tr('chat.hud.hideOff')} onClick={() => { Live.toggle(chat, 'trackHide', key); flush(); draw(); }}><Icon name={hide[key] ? 'eyeoff' : 'eye'} size={15} /></button>
  </div>;
  const who = (name: string): Cast | { name: string } => opt.chars.find(x => x.name === name) || { name };
  return <div className="state-edit">
    <p className="hint">{tr('chat.hud.editHint')}</p>
    <h3 className="form-sec"><i className="se-mark">✦</i>{tr('chat.hud.sceneSec')}</h3>
    {keys.length ? <div className="se-list">{keys.map(k => row('w:' + k, k, w[k], fields.find(f => f.key === k)))}</div> : <p className="dim">{tr('chat.hud.noFields')}</p>}
    {cf.length ? <h3 className="form-sec"><i className="se-mark">☾</i>{tr('chat.hud.castSec')}</h3> : null}
    {cf.length ? people.map(name => <section className="se-person" key={name}>
      <header><Avatar o={who(name)} cls="xs" /><b>{name}</b>
        {opt.chars.some(x => x.name === name) ? null : <IconBtn ic="trash" title={tr('chat.hud.deleteCard')} cls="tiny" onClick={() => { delete c[name]; for (const k of Object.keys(lock)) if (k.startsWith(`c:${name}:`)) delete lock[k]; flush(); draw(); }} />}</header>
      <div className="se-list">{cf.map(f => row(`c:${name}:${f.key}`, f.key, c[name]?.[f.key], f))}</div></section>) : null}
    {cf.length ? <div className="row"><Btn label={tr('chat.hud.addPerson')} ic="plus" cls="ghost" onClick={async () => { const n = (await promptBox(tr('chat.hud.addPersonPrompt'), ''))?.trim(); if (!n) return; (chat.cast ||= {})[n] ||= {}; flush(); draw(); }} /></div> : null}
    <div className="row wrap"><Btn label={tr('chat.hud.settings')} ic="sliders" cls="ghost" onClick={() => liveSettings('tracker', chat)} />
      <Btn label={tr('chat.hud.clearAll')} cls="ghost" onClick={async () => { if (!(await confirmBox(tr('chat.hud.clearAllConfirm'), tr('chat.hud.clearBtn'), true))) return; chat.tracker = {}; chat.cast = {}; chat.trackDiff = {}; chat.castDiff = {}; flush(); draw(); }} /></div>
  </div>;
}
/** 상태창 고치기: 값 · 잠금 · 숨김을 한곳에서 */
export function editState(chat: Room, opt: HudOpts = hudOpts()) {
  return openModal({ title: tr('chat.hud.editTitle'), wide: true, body: <StateEdit chat={chat} opt={opt} />, actions: [{ label: tr('common.close'), cls: 'primary' }] });
}
