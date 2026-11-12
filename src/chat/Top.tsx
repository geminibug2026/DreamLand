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

function Status() { useCh('status'); return <span className={'status' + (cur.status ? ' on' : '')}>{cur.status}</span>; }
const short = (v: number) => v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : v.toLocaleString();
function Gauge() {
  useCh('gauge');
  const max = S.presetFor(cur.chat).params.contextSize || 128000, n = cur.lastPrompt?.total;
  return <button className="gauge" title={n != null ? `프롬프트 살펴보기 · ≈${n.toLocaleString()} / ${max.toLocaleString()} 토큰` : '프롬프트 살펴보기'} onClick={inspector}>
    <i style={{ width: Math.min(100, Math.max(0, (n || 0) / max * 100)) + '%' }} /><span>{n != null ? `≈${short(n)} / ${short(max)}` : '프롬프트'}</span></button>;
}

export const Top = memo(function Top() {
  useCh('top');
  const c = cur.chat!, chars = charsOf(c), conn = S.connFor(c);
  useEffect(() => { if (ui.layout) tint(ui.layout, chars[0] ?? null); });   // 대화 화면 전체가 주인공 초상의 색을 띤다
  const talk = modeOf(c) === 'talk', p0 = talk && chars[0] ? presenceOf(c, chars[0]) : null, label = clockLabel(c);
  const setMode = async (k: 'rp' | 'talk') => { if (modeOf(c) === k) return; if (cur.busy) return toast('답변이 끝난 뒤에 바꿀 수 있어요'); c.mode = k; await S.save('chats', c, true); drawMain(); armAuto(); if (k === 'rp' && c.scene?.on) toast('열어 둔 장면은 대화 모드로 돌아오면 이어져요'); };
  const parent = c.parent;
  const branchBtn = parent ? <button className="top-branch" title="원래 대화방으로" onClick={() => { if (S.get('chats', parent.id)) go('chat', parent.id); else toast('원래 대화방이 지워졌어요'); }}><Icon name="branch" size={12} /></button> : null;
  const connText = conn ? `${conn.name}${conn.model ? ' · ' + conn.model : ''}` : '연결 없음';
  const u = talk ? Live.userStatus() : null;
  return <header className="chat-top">
    <button className="ibtn" title="대화 목록" onClick={() => setSide(!cur.sideOpen)}><Icon name="menu" /></button>
    <div className="av-stack">{chars.slice(0, 3).map(ch => <Avatar key={ch.id} o={ch} cls="sm" />)}</div>
    <div className="top-title" title={`${roomName(c)} · 메시지 ${cur.msgs.length}개 · ${connText}`}><b>{titleOf(c)}</b>
      {p0 ? <div className="top-sub">{branchBtn}
        <button type="button" className="top-pres" title="캐릭터 상태 · 일정" onClick={e => menu(e.currentTarget, presItems(c, chars))}>{chars.slice(0, 3).map(ch => <i key={ch.id} className={'presence ' + presenceOf(c, ch).status} />)}<span>{[chars.length > 1 ? `${chars.length}명` : (p0.activity || STATUS[p0.status]), label].filter(Boolean).join(' · ')}</span></button>
        <span className="top-room">{`${roomName(c)} · ${cur.msgs.length}개`}</span></div>
        : <small className="top-meta">{branchBtn}{talk && label ? <span className="top-clock">{label}</span> : null}{`${roomName(c)} · ${cur.msgs.length}개 · ${connText}`}</small>}</div>
    <Status /><Gauge />
    {u ? <button type="button" className={`me-btn top-wide is-${u.status}`} title={`내 상태: ${u.label}${u.auto ? ' (입력이 없어 자동으로)' : ''}`} onClick={e => menu(e.currentTarget, meItems())}><i /><span>나</span></button> : null}
    <div className="mode-switch top-wide" title="보는 방식과 답변 방식을 바꿉니다">{([['rp', 'RP'], ['talk', '대화']] as const).map(([k, l]) => <button key={k} className={modeOf(c) === k ? 'on' : undefined} onClick={() => void setMode(k)}>{l}</button>)}</div>
    <IconBtn ic="book" title="꿈 일기장" cls="top-wide" onClick={() => emit('diary:open', c)} />
    <IconBtn ic="search" title="이 대화에서 찾기" cls="top-wide" onClick={findInChat} />
    <IconBtn ic="plus" title="같은 캐릭터와 새 대화" cls="top-wide" onClick={e => startMenu(e.currentTarget, c.charIds)} />
    {/* 좁은 화면에서는 위에서 뺀 단추들이 이 메뉴 안으로 들어온다 */}
    <IconBtn ic="more" title="대화 메뉴" onClick={e => chatMenu(e.currentTarget, c, { narrow: matchMedia('(max-width: 820px)').matches, setMode: k => void setMode(k), find: findInChat, me: a => menu(a, meItems()), pres: a => menu(a, presItems(c, chars)) })} />
    <IconBtn ic="panel" title="장면 패널" onClick={() => setDrawer(!cur.drawer)} />
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
    <div className="cast-grid">{chars.map(x => <button key={x.id} ref={tintRef(x)} className={'cast' + ((c.muted || []).includes(x.id) ? ' muted' : '')} title={`${x.name}의 차례로`} onClick={() => void generate('normal', { speaker: x })}>
      <div className="arch" style={artStyle(x)}>{!x.avatar && <Emblem o={x} />}</div><b>{x.name}</b></button>)}</div>
    <div className="dream-rows"><div><span>등장인물</span><b>{`${chars.length}명`}</b></div><div><span>대화</span><b>{`${turns}턴`}</b></div></div>
  </div>;
  const mem = Memory.get(c.id), tr = Object.entries(c.tracker || {});
  const scene = (mem?.status || []).filter(s => s.entity === 'scene').slice(0, 3).map((s): [string, string] => [s.slot, s.value]);
  const rows: [string, string][] = [...tr.slice(0, 4), ...(tr.length ? [] : scene), ...(S.settings.memory.enabled ? [['기억', `${mem?.memories.length || 0}개`] as [string, string]] : [])];
  const born = new Date(c.createdAt || Date.now());
  return <div className="dream-card leaf">
    <div className="sheet-window"><i className="orbit" />
      <button className="arch lg" title="초상 크게 보기" style={artStyle(ch)} onClick={() => { if (ch.avatar) openModal({ title: ch.name, wide: true, body: <img className="full-img" src={ch.avatar} /> }); }}>{!ch.avatar && <Emblem o={ch} />}</button>
      <span className="leaf-mark"><b>{String(turns)}</b><span>턴</span></span></div>
    <div className="leaf-head"><b className="dream-card-name"><InkName name={titleOf(c)} /></b>{ch.tags.length ? <small>{ch.tags.slice(0, 3).map(t => '#' + t).join(' ')}</small> : null}</div>
    {rows.length ? <div className="dream-rows">{rows.map(([k, v], i) => <div key={i}><span>{k}</span><b>{v}</b></div>)}</div> : null}
    <div className="leaf-foot"><span><Moon size={13} date={born} />{`${born.getFullYear()}.${p2(born.getMonth() + 1)}.${p2(born.getDate())}`}</span><span>{`${daysOf(c)}일째`}</span></div>
  </div>;
});
