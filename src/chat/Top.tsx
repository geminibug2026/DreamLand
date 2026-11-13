// 대화 화면 상단 줄(휴대폰에서는 제목 · 상태 한 줄 + 메뉴 · 패널만 남는다)과 옆 프로필 한 장
import { memo, useEffect } from 'react';
import { Avatar, Emblem, Icon, IconBtn, InkName, Moon, artStyle, tintRef } from '../kit';
import { menu, openModal, toast } from '../ui';
import { cur, ui, useCh } from './store';
import { armAuto, charsOf, daysOf, drawMain, generate, modeOf, presenceOf, roomName, setDrawer, setSide, titleOf } from './actions';
import { chatMenu, findInChat, meItems, presItems } from './menus';
import { inspector } from './Inspector';
import { tint } from '../lib/tone';
import { S, emit } from '../lib/core';
import { go } from '../lib/router';
import { clockLabel } from '../lib/clock';
import { STATUS } from '../lib/f-schedule';
import { startMenu } from './start';
import { Memory } from '../lib/memory';
import { Live } from '../lib/live';
import { t } from '../i18n';

function Status() { useCh('status'); return <span className={'status' + (cur.status ? ' on' : '')}>{cur.status}</span>; }
const short = (v: number) => v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : v.toLocaleString();
function Gauge() {
  useCh('gauge');
  const max = S.presetFor(cur.chat).params.contextSize || 128000, n = cur.lastPrompt?.total;
  return <button className="gauge" title={n != null ? t('chat.top.gaugeTitle', { n: n.toLocaleString(), max: max.toLocaleString() }) : t('chat.menu.inspect')} onClick={inspector}>
    <i style={{ width: Math.min(100, Math.max(0, (n || 0) / max * 100)) + '%' }} /><span>{n != null ? `≈${short(n)} / ${short(max)}` : t('chat.top.prompt')}</span></button>;
}

export const Top = memo(function Top() {
  useCh('top');
  const c = cur.chat!, chars = charsOf(c), conn = S.connFor(c);
  useEffect(() => { if (ui.layout) tint(ui.layout, chars[0] ?? null); });   // 대화 화면 전체가 주인공 초상의 색을 띤다
  const talk = modeOf(c) === 'talk', p0 = talk && chars[0] ? presenceOf(c, chars[0]) : null, label = clockLabel(c);
  const setMode = async (k: 'rp' | 'talk') => { if (modeOf(c) === k) return; if (cur.busy) return toast(t('chat.top.busyMode')); c.mode = k; await S.save('chats', c, true); drawMain(); armAuto(); if (k === 'rp' && c.scene?.on) toast(t('chat.top.sceneKept')); };
  const parent = c.parent;
  const branchBtn = parent ? <button className="top-branch" title={t('chat.top.toParent')} onClick={() => { if (S.get('chats', parent.id)) go('chat', parent.id); else toast(t('chat.top.parentGone')); }}><Icon name="branch" size={12} /></button> : null;
  const connText = conn ? `${conn.name}${conn.model ? ' · ' + conn.model : ''}` : t('chat.drawer.noConn');
  const u = talk ? Live.userStatus() : null;
  return <header className="chat-top">
    <button className="ibtn" title={t('chat.top.chatList')} onClick={() => setSide(!cur.sideOpen)}><Icon name="menu" /></button>
    <div className="av-stack">{chars.slice(0, 3).map(ch => <Avatar key={ch.id} o={ch} cls="sm" />)}</div>
    <div className="top-title" title={t('chat.top.titleTip', { room: roomName(c), count: cur.msgs.length, conn: connText })}><b>{titleOf(c)}</b>
      {p0 ? <div className="top-sub">{branchBtn}
        <button type="button" className="top-pres" title={t('chat.top.pres')} onClick={e => menu(e.currentTarget, presItems(c, chars))}>{chars.slice(0, 3).map(ch => <i key={ch.id} className={'presence ' + presenceOf(c, ch).status} />)}<span>{[chars.length > 1 ? t('chat.top.people', { count: chars.length }) : (p0.activity || STATUS[p0.status]), label].filter(Boolean).join(' · ')}</span></button>
        <span className="top-room">{t('chat.top.roomCount', { room: roomName(c), count: cur.msgs.length })}</span></div>
        : <small className="top-meta">{branchBtn}{talk && label ? <span className="top-clock">{label}</span> : null}{t('chat.top.roomCountConn', { room: roomName(c), count: cur.msgs.length, conn: connText })}</small>}</div>
    <Status /><Gauge />
    {u ? <button type="button" className={`me-btn top-wide is-${u.status}`} title={u.auto ? t('chat.top.meAuto', { status: u.label }) : t('chat.top.me', { status: u.label })} onClick={e => menu(e.currentTarget, meItems())}><i /><span>{t('chat.top.meShort')}</span></button> : null}
    <div className="mode-switch top-wide" title={t('chat.top.modeSwitch')}>{([['rp', 'RP'], ['talk', t('chat.side.talk')]] as const).map(([k, l]) => <button key={k} className={modeOf(c) === k ? 'on' : undefined} onClick={() => void setMode(k)}>{l}</button>)}</div>
    {talk ? <IconBtn ic="phone" title={t('call.btn')} cls="top-call" onClick={() => emit('call:dial', c)} /> : null}
    <IconBtn ic="book" title={t('chat.top.diary')} cls="top-wide" onClick={() => emit('diary:open', c)} />
    <IconBtn ic="search" title={t('chat.top.find')} cls="top-wide" onClick={findInChat} />
    <IconBtn ic="plus" title={t('chat.top.newChat')} cls="top-wide" onClick={e => startMenu(e.currentTarget, c.charIds)} />
    {/* 좁은 화면에서는 위에서 뺀 단추들이 이 메뉴 안으로 들어온다 */}
    <IconBtn ic="more" title={t('chat.top.menu')} onClick={e => chatMenu(e.currentTarget, c, { narrow: matchMedia('(max-width: 820px)').matches, setMode: k => void setMode(k), find: findInChat, me: a => menu(a, meItems()), pres: a => menu(a, presItems(c, chars)) })} />
    <IconBtn ic="panel" title={t('chat.top.panel')} onClick={() => setDrawer(!cur.drawer)} />
  </header>;
});

const p2 = (n: number) => String(n).padStart(2, '0');
/** 옆 프로필: 초상과 정보가 한 장. 턴 수는 초상 색 책갈피에, 맨 밑 띠에는 대화를 시작한 날의 달 · 날짜와 며칠째인지 */
export const Dossier = memo(function Dossier() {
  useCh('dossier');
  const c = cur.chat; if (!c) return null;
  const chars = charsOf(c), ch = chars[0]; if (!ch) return null;
  const turns = cur.msgs.filter(m => m.role === 'assistant').length;
  if (chars.length > 1) return <div className="dream-card">
    <div className="cast-grid">{chars.map(x => <button key={x.id} ref={tintRef(x)} className={'cast' + ((c.muted || []).includes(x.id) ? ' muted' : '')} title={t('chat.composer.speakerTurn', { name: x.name })} onClick={() => void generate('normal', { speaker: x })}>
      <div className="arch" style={artStyle(x)}>{!x.avatar && <Emblem o={x} />}</div><b>{x.name}</b></button>)}</div>
    <div className="dream-rows"><div><span>{t('chat.top.cast')}</span><b>{t('chat.top.people', { count: chars.length })}</b></div><div><span>{t('chat.top.talk')}</span><b>{t('chat.top.turns', { count: turns })}</b></div></div>
  </div>;
  const mem = Memory.get(c.id), tr = Object.entries(c.tracker || {});
  const scene = (mem?.status || []).filter(s => s.entity === 'scene').slice(0, 3).map((s): [string, string] => [s.slot, s.value]);
  const rows: [string, string][] = [...tr.slice(0, 4), ...(tr.length ? [] : scene), ...(S.settings.memory.enabled ? [[t('chat.top.memories'), t('chat.side.count', { count: mem?.memories.length || 0 })] as [string, string]] : [])];
  const born = new Date(c.createdAt || Date.now());
  return <div className="dream-card leaf">
    <div className="sheet-window"><i className="orbit" />
      <button className="arch lg" title={t('chat.top.portrait')} style={artStyle(ch)} onClick={() => { if (ch.avatar) openModal({ title: ch.name, wide: true, body: <img className="full-img" src={ch.avatar} /> }); }}>{!ch.avatar && <Emblem o={ch} />}</button>
      <span className="leaf-mark"><b>{String(turns)}</b><span>{t('chat.top.turn')}</span></span></div>
    <div className="leaf-head"><b className="dream-card-name"><InkName name={titleOf(c)} /></b>{ch.tags.length ? <small>{ch.tags.slice(0, 3).map(t => '#' + t).join(' ')}</small> : null}</div>
    {rows.length ? <div className="dream-rows">{rows.map(([k, v], i) => <div key={i}><span>{k}</span><b>{v}</b></div>)}</div> : null}
    <div className="leaf-foot"><span><Moon size={13} date={born} />{`${born.getFullYear()}.${p2(born.getMonth() + 1)}.${p2(born.getDate())}`}</span><span>{t('chat.top.dayN', { count: daysOf(c) })}</span></div>
  </div>;
});
