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
      { label: '고치기', ic: 'edit', onclick: async () => { const v = await promptBox(label, value || ''); if (v === null) return; Live.setValue(chat, key, v); done(); } },
      { label: lock[key] ? '잠금 풀기' : '잠그기', ic: 'lock', hint: lock[key] ? '' : '모델이 못 바꿔요', onclick: () => { Live.toggle(chat, 'trackLock', key); done(false); } },
      { label: '숨기기', ic: 'eyeoff', hint: '띠에서만', onclick: () => { Live.toggle(chat, 'trackHide', key); done(false); } }]);
  };
  const cell = (k: string) => {
    const f = fields.find(x => x.key === k) || ({ key: k } as Field), v = state.w[k] ?? '', d = diff[k], meter = f.max != null && isFinite(parseFloat(v)), fr = fresh(k);
    const dv = before ? parseFloat(v) - parseFloat(before.w[k]) : d?.d, was = before ? before.w[k] : d?.from;
    return <button key={k} type="button" className={['hud-cell', meter && 'meter', fr && 'fresh', lock['w:' + k] && 'locked'].filter(Boolean).join(' ')}
      title={[f.desc, fr && was ? `이전: ${was}` : '', lock['w:' + k] ? '잠겨 있어요' : ''].filter(Boolean).join(' · ')} onClick={e => cellMenu(e.currentTarget, 'w:' + k, k, v)}>
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
      const base = { type: 'button' as const, title: [f.desc, lock[key] ? '잠겨 있어요' : ''].filter(Boolean).join(' · '), onClick: (e: MouseEvent<HTMLButtonElement>) => cellMenu(e.currentTarget, key, `${name} · ${f.key}`, v) };
      const k = <span className="pcard-k">{f.key}{lock[key] ? <Lock /> : null}</span>;
      if (THINK.test(f.key)) return <button key={f.key} className={['pcard-think', fr && 'fresh', !v && 'blank'].filter(Boolean).join(' ')} {...base}>{k}<p>{v || '아직 알 수 없어요'}</p></button>;
      return <button key={f.key} className={'pcard-row' + (fr ? ' fresh' : '')} {...base}>{k}{meter ? <span className="hud-bar"><i style={{ width: pct(v, f) }} /></span> : null}<b>{v === '' ? '—' : v}</b></button>;
    };
    return <article className="pcard" key={name}>
      <header className="pcard-head"><Avatar o={ch || { name }} cls="sm" /><b>{name}</b>{ch ? null : <small>함께 있는 사람</small>}
        {past ? null : <IconBtn ic="more" title="카드 메뉴" cls="tiny" onClick={e => menu(e.currentTarget, [
          ...cf.filter(f => hide[`c:${name}:${f.key}`]).map(f => ({ label: `${f.key} 다시 보이기`, ic: 'eye', onclick: () => { Live.toggle(chat, 'trackHide', `c:${name}:${f.key}`); done(false); } })),
          { label: '카드 비우기', ic: 'trash', danger: true, onclick: () => { if (chat.cast) delete chat.cast[name]; for (const k of Object.keys(lock)) if (k.startsWith(`c:${name}:`)) delete lock[k]; done(); } }])} />}</header>
      <div className="pcard-body">{rows.filter(f => !THINK.test(f.key)).map(row)}{rows.filter(f => THINK.test(f.key)).map(row)}</div>
    </article>;
  };
  const go = (i: number) => { Live.view = i < 0 ? null : { chat: chat.id, i }; opt.redraw(); };
  const at = past ? tl.indexOf(vi) : tl.length - 1, older = at > 0 ? tl[at - 1] : -1, newer = past ? (at + 1 >= tl.length - 1 ? -1 : tl[at + 1]) : -2;
  const when = (e: MouseEvent<HTMLButtonElement>) => { if (past) menu(e.currentTarget, [
    { label: '이 메시지로 가기', ic: 'search', onclick: () => opt.onJump(msgs[vi]) },
    { label: '이 시점 값으로 되돌리기', ic: 'refresh', hint: '메시지는 그대로', onclick: async () => { if (!(await confirmBox(`상태창을 ${vi + 1}번째 메시지 시점의 값으로 되돌릴까요? 메시지는 지워지지 않아요.`, '되돌리기'))) return; const next = rewound(Live.state(chat), state, lock); chat.tracker = next.w; chat.cast = next.c; chat.trackDiff = {}; chat.castDiff = {}; Live.view = null; done(); } },
    { label: '지금으로', ic: 'right', onclick: () => go(-1) }]); };
  const nav = tl.length > 1 ? <div className="hud-nav">
    <button type="button" title="이전 시점" disabled={older < 0} onClick={() => go(older)}><Icon name="left" size={13} /></button>
    <button type="button" className="hud-when" title={past ? '이 시점의 메시지로 가기 · 되돌리기' : '지금 상태예요. 화살표로 지난 시점을 훑어볼 수 있어요'} onClick={when}>{past ? `#${String(vi + 1).padStart(3, '0')}` : '지금'}{past ? <small>{`${at + 1}/${tl.length}`}</small> : null}</button>
    <button type="button" title={past ? '다음 시점' : '지금이 가장 최근이에요'} disabled={!past} onClick={() => go(newer)}><Icon name="right" size={13} /></button>
  </div> : null;
  const fold = !!chat.hudFold, head = fold ? keys.slice(0, 3).map(k => `${k} ${state.w[k] ?? '—'}`).join('  ·  ') : '';
  const castOpen = !!people.length && chat.hudCast !== false;
  return <div className={['hud', fold && 'fold', past && 'past'].filter(Boolean).join(' ')}>
    <div className="hud-line">
      <button type="button" className="hud-tab" title={fold ? '상태창 펼치기' : '상태창 접기'} onClick={() => void opt.onFold()}><i>✦</i>{fold ? <span>{head || '상태'}</span> : '상태'}</button>
      {fold ? null : <div className="hud-grid">{keys.map(cell)}{!keys.length ? <span className="hud-none">장면 항목은 모두 숨겨 두었어요</span> : null}</div>}
      {fold ? null : <div className="hud-side">{nav}
        {people.length ? <button type="button" className={'hud-people' + (castOpen ? ' on' : '')} title={castOpen ? '인물 카드 접기' : '인물 카드 펼치기'} onClick={() => { chat.hudCast = !castOpen; opt.saved(); opt.redraw(); }}><i>☾</i>{`인물 ${people.length}`}</button> : null}
        <button type="button" className="hud-edit" title="상태창 고치기 · 잠금 · 숨김" onClick={() => editState(chat, opt)}>⋯</button></div>}
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
    <input className="inp" key={gen} defaultValue={value ?? ''} placeholder={f?.desc || '아직 없음'} onChange={e => { Live.setValue(chat, key, e.target.value); flush(); }} />
    <button type="button" className={'se-tog' + (lock[key] ? ' on' : '')} title={lock[key] ? '잠겨 있어요 — 모델이 바꾸지 못합니다 (눌러서 풀기)' : '잠그기 — 모델이 이 값을 바꾸지 못하게'} onClick={() => { Live.toggle(chat, 'trackLock', key); flush(); draw(); }}><Icon name="lock" size={15} /></button>
    <button type="button" className={'se-tog' + (hide[key] ? ' on' : '')} title={hide[key] ? '띠에서 숨겨 두었어요 (눌러서 다시 보이기)' : '띠에서 숨기기 — 값은 계속 따라갑니다'} onClick={() => { Live.toggle(chat, 'trackHide', key); flush(); draw(); }}><Icon name={hide[key] ? 'eyeoff' : 'eye'} size={15} /></button>
  </div>;
  const who = (name: string): Cast | { name: string } => opt.chars.find(x => x.name === name) || { name };
  return <div className="state-edit">
    <p className="hint">값을 직접 고치면 그 자리에서 반영됩니다. 자물쇠를 채운 항목은 모델이 바꾸지 못하고, 되감아도 지금 값을 지킵니다. 눈을 감긴 항목은 띠에서만 사라지고 계속 기록됩니다.</p>
    <h3 className="form-sec"><i className="se-mark">✦</i>장면</h3>
    {keys.length ? <div className="se-list">{keys.map(k => row('w:' + k, k, w[k], fields.find(f => f.key === k)))}</div> : <p className="dim">항목이 없어요. 설정에서 항목을 적어 주세요.</p>}
    {cf.length ? <h3 className="form-sec"><i className="se-mark">☾</i>인물 카드</h3> : null}
    {cf.length ? people.map(name => <section className="se-person" key={name}>
      <header><Avatar o={who(name)} cls="xs" /><b>{name}</b>
        {opt.chars.some(x => x.name === name) ? null : <IconBtn ic="trash" title="이 카드 지우기" cls="tiny" onClick={() => { delete c[name]; for (const k of Object.keys(lock)) if (k.startsWith(`c:${name}:`)) delete lock[k]; flush(); draw(); }} />}</header>
      <div className="se-list">{cf.map(f => row(`c:${name}:${f.key}`, f.key, c[name]?.[f.key], f))}</div></section>) : null}
    {cf.length ? <div className="row"><Btn label="인물 추가" ic="plus" cls="ghost" onClick={async () => { const n = (await promptBox('카드를 만들 사람의 이름', ''))?.trim(); if (!n) return; (chat.cast ||= {})[n] ||= {}; flush(); draw(); }} /></div> : null}
    <div className="row wrap"><Btn label="상태창 설정" ic="sliders" cls="ghost" onClick={() => liveSettings('tracker', chat)} />
      <Btn label="모두 비우기" cls="ghost" onClick={async () => { if (!(await confirmBox('지금 상태창의 값을 모두 비울까요? 잠금과 숨김은 그대로 둡니다.', '비우기', true))) return; chat.tracker = {}; chat.cast = {}; chat.trackDiff = {}; chat.castDiff = {}; flush(); draw(); }} /></div>
  </div>;
}
/** 상태창 고치기: 값 · 잠금 · 숨김을 한곳에서 */
export function editState(chat: Room, opt: HudOpts = hudOpts()) {
  return openModal({ title: '상태창 고치기', wide: true, body: <StateEdit chat={chat} opt={opt} />, actions: [{ label: '닫기', cls: 'primary' }] });
}
