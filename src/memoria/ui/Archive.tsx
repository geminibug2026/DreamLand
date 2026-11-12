// 장기기억 — 서고 화면 조립 (옛 f-memoria.js 의 mount · openArchive · roomPick · 머리 · 탭)
// 기능 탭(스튜디오)과 서고 창이 함께 쓴다
import { Component, memo, useEffect, useReducer, type ReactNode } from 'react';
import { Btn, IconBtn, mountInto } from '../../kit';
import type { ChatM } from '../types';
import { Config } from './Config';
import { Library } from './Library';
import { Memories } from './Memories';
import { Overview } from './Overview';
import { Story } from './Story';
import { Tools, recordNow } from './Tools';
import { World } from './World';
import { Ico, None, cur, ensureCfg, msgsOf, type St, type StOpen } from './parts';
import { Memory } from '../../lib/memory';
import { S } from '../../lib/core';
import { chatApi } from '../../chat/actions';
import { toast } from '../../ui';
import { t, getLang, fmtDate } from '../../i18n';
import * as core from '../../lib/core';

/** [id, 이름 키, 아이콘] — 이름은 그릴 때 t() */
export const TABS: [string, string, string][] = [['overview', 'memoria.archive.tab.overview', 'panel'], ['memories', 'memoria.archive.tab.memories', 'sparkle'], ['world', 'memoria.archive.tab.world', 'globe'], ['summaries', 'memoria.archive.tab.summaries', 'note'], ['config', 'memoria.archive.tab.config', 'sliders'], ['tools', 'memoria.archive.tab.tools', 'gear'], ['library', 'memoria.archive.tab.library', 'folder']];

// ════════ 모듈 상태 ════════
const mounted = new Set<St>();
let lastTab = 'overview', focus = '', activity = '';
/** 머리 · 패널의 「상태:」에 뜨는 지금 하는 일 (연속성 검사 중… 등) */
export const activityText = () => activity;
export const setActivity = (text: string) => { activity = text; refreshHeads(); };
export const setFocus = (id?: string | null) => { focus = id || focus; };
export const alive = () => [...mounted].filter(st => st.host?.isConnected || (mounted.delete(st), false));
export const refreshHeads = () => { for (const st of alive()) { if (st.chat) st.mem = Memory.get(st.chat.id) || st.mem; st.head(); } };
let wired = false;
function wire() {
  if (wired) return; wired = true;
  const { on, debounce } = core;
  on('memory', debounce(refreshHeads, 150)); on('memory:busy', refreshHeads);
  // 장부의 모양을 바꾸는 설정을 고쳤을 때(엔진의 reinjectNow) — 미리보기를 고치는 중이 아니면 개요를 다시 그린다
  on('memory:packet', (id?: string) => { for (const st of alive()) if (st.tab === 'overview' && st.chat && (!id || st.chat.id === id) && !document.activeElement?.classList?.contains('mm-preview')) st.draw(); });
}

// ════════ 머리: 상태 · 대화방 고르기 · 기록 · 갱신 ════════
/** 볼 대화방 고르기: 캐릭터별로 묶고, 방마다 분량·날짜를 붙여 구분한다. 지금 열어 둔 방이 기본 */
function RoomPick({ chats, st }: { chats: ChatM[]; st: St }) {
  const api = chatApi, hereId = cur()?.chat?.id || S.settings.lastChat, day = (at?: number) => getLang() === 'ko' ? new Date(at || 0).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : fmtDate(at || 0, { month: 'numeric', day: 'numeric' });
  const groups = new Map<string, ChatM[]>(); for (const c of chats) { const g = api.groupTitle(c); if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(c); }
  const label = (c: ChatM) => `${c.id === hereId ? t('memoria.archive.room.herePrefix') : ''}${t('memoria.archive.room.label', { name: api.roomName(c).slice(0, 28), count: c.count || 0, date: day(c.updatedAt) })}${c.parent ? t('memoria.archive.room.branch') : ''}`;
  const away = hereId && st.chat?.id !== hereId && S.get('chats', hereId);
  return <div className="mm-pickbox"><small>{st.chat?.id === hereId ? t('memoria.archive.room.here') : t('memoria.archive.room.other')}</small>
    <select className="inp auto mm-pick" title={t('memoria.archive.room.pickTitle')} value={st.chat?.id || ''} onChange={e => void st.load(e.target.value)}>
      {[...groups.entries()].map(([g, list]) => <optgroup key={g} label={`${g} (${list.length})`}>{list.map(c => <option key={c.id} value={c.id}>{label(c)}</option>)}</optgroup>)}
    </select>
    {away ? <button className="btn ghost mm-here" title={t('memoria.archive.room.goHereTitle')} onClick={() => void st.load(hereId)}>{t('memoria.archive.room.goHere')}</button> : null}</div>;
}
function Head({ st }: { st: St }) {
  const M = Memory, cfg = M.cfg(), m = st.mem, failed = m?.turns.filter(t => t.failed).length || 0, busy = M.busy();
  const state = !cfg.enabled ? t('memoria.archive.state.off') : !st.chat ? t('memoria.archive.state.noChat') : activity || (busy ? t('memoria.archive.state.busy') : t('memoria.archive.state.idle'));
  const chats = [...S.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 80); if (st.chat && !chats.includes(st.chat)) chats.unshift(st.chat);
  const refresh = () => {
    const chat = st.chat!; st.draft = null; M.override(chat.id, null); M.reinjectNow?.(chat); st.tab = 'overview'; st.draw();   // 갱신은 수정본 · 초안 폐기를 겸한다
    toast(st.mem?.packetPin?.text ? t('memoria.archive.refresh.pinned') : t('memoria.archive.refresh.done'), st.mem?.packetPin?.text ? '' : 'ok');
  };
  return <div className="mm-head"><div className="mm-status"><i className={`mm-lamp${!cfg.enabled ? ' off' : busy ? ' busy' : ''}`} /><div><b>{t('memoria.archive.state.label')}<em>{state}</em></b>
    <span>{m ? t('memoria.archive.head.counts', { turns: m.turns.length, memories: m.memories.length, cast: m.cast.length, canon: m.canon.length, status: m.status.length, pledges: m.pledges.filter(p => p.status === 'active').length, summaries: m.chunks.length + m.arcs.length }) : t('memoria.archive.openChat')}{failed ? <em className="mm-fail">{t('memoria.archive.head.failed', { count: failed })}</em> : null}</span></div></div>
    <div className="mm-head-tools">{chats.length ? <RoomPick chats={chats} st={st} /> : null}
      {st.chat ? <Btn label={t('memoria.archive.record.label')} ic="feather" title={t('memoria.archive.record.title')} onClick={async () => { await recordNow(st.chat!); void st.reload(); }} /> : null}
      {st.chat ? <Btn label={t('memoria.archive.refresh.label')} ic="refresh" cls="ghost" title={t('memoria.archive.refresh.title')} onClick={refresh} /> : null}</div></div>;
}

// ════════ 몸통: 탭에 따라 ════════
class Guard extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(e: Error) { console.error(e); }
  render() { return this.state.err ? <div className="mm-view"><None text={t('memoria.archive.drawFail', { error: this.state.err.message })} /></div> : this.props.children; }
}
function View({ st }: { st: St }) {
  const open = st.chat && st.mem ? st as StOpen : null;
  if (st.tab === 'config') return <Config st={st} />;
  if (st.tab === 'library') return <Library st={st} />;
  if (!open) return <div className="mm-view"><None text={t('memoria.archive.openChatLong')} /></div>;
  switch (st.tab) {
    case 'memories': return <Memories st={open} />;
    case 'world': return <World st={open} />;
    case 'summaries': return <Story st={open} />;
    case 'tools': return <Tools st={open} />;
    default: return <Overview st={open} />;
  }
}
const Body = memo(function Body({ st, n }: { st: St; n: number }) {
  return <div className="mm-body"><Guard key={n}><View st={st} /></Guard></div>;
});

/** 서고 한 벌 (머리 · 탭 줄 · 몸통). host 는 .mm 이 붙은 요소 */
function Archive({ st, chatId }: { st: St; chatId?: string | null }) {
  const [, bumpHead] = useReducer((x: number) => x + 1, 0), [n, bumpBody] = useReducer((x: number) => x + 1, 0);
  st.head = bumpHead;
  st.draw = () => { lastTab = st.tab; bumpHead(); bumpBody(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { wire(); mounted.add(st); void st.load(chatId || focus); return () => { mounted.delete(st); }; }, []);
  return <><Head st={st} />
    <div className="tabs mm-tabs" role="tablist" aria-label={t('memoria.archive.title')}>{TABS.map(([id, label, ic]) => <button key={id} className={`tab${st.tab === id ? ' on' : ''}`} type="button" role="tab" aria-selected={String(st.tab === id) as 'true' | 'false'} onClick={() => { st.tab = id; st.draw(); }}><Ico name={ic} size={15} /><span>{t(label)}</span></button>)}</div>
    <Body st={st} n={n} /></>;
}

function newSt(host: HTMLElement, tab?: string, close?: () => void): St {
  const st: St = {
    chat: null, mem: null, msgs: [], tab: tab || lastTab, q: '', kind: '', vis: '', owner: '', sort: 'new', only: '', log: [], draft: null, answer: '', question: '', story: null, close, host,
    draw() { }, head() { },
    async load(id) {
      const s = S, chat = s.get('chats', id) || cur().chat || s.get('chats', s.settings.lastChat) || [...s.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
      if (chat?.id !== st.chat?.id) { st.log = []; st.draft = null; st.answer = ''; st.question = ''; st.story = null; }   // 편집 대화 · 초안 · 이야기 탭의 보기 상태는 그 대화의 것
      st.chat = chat; focus = chat?.id || '';
      if (chat) { st.mem = await Memory.load(chat.id); st.msgs = await msgsOf(chat); } else { st.mem = null; st.msgs = []; }
      st.draw();
    },
    reload() { return st.load(st.chat?.id); },
  };
  return st;
}
/** host 에 서고를 올린다. 알려 주는 함수로 내린다 */
export function mount(host: HTMLElement, { chatId, tab, close }: { chatId?: string | null; tab?: string; close?: () => void } = {}) {
  ensureCfg();
  host.classList.add('mm');
  const st = newSt(host, tab, close);
  return { st, off: mountInto(host, <Archive st={st} chatId={chatId} />) };
}

/** 서고 창 (화면 전체를 덮는다) */
export function openArchive(chat?: ChatM | null, tab?: string) {
  document.querySelector('.mm-wrap')?.remove();
  const modals = document.getElementById('modals')!;
  const wrap = document.createElement('div'); wrap.className = 'mm-wrap';
  let off = () => { };
  const close = () => { wrap.classList.add('out'); setTimeout(() => { wrap.remove(); off(); }, 180); document.removeEventListener('keydown', key); if (cur().chat) chatApi.redraw(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && wrap === modals.lastElementChild && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) close(); };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  modals.append(wrap); document.addEventListener('keydown', key);
  ensureCfg();
  const host = document.createElement('div'); host.className = 'mm';
  const st = newSt(host, tab || 'overview', close);
  const offFrame = mountInto(wrap, <div className="mm-frame" role="dialog" aria-modal="true" aria-label={t('memoria.archive.title')}>
    <header className="mm-bar"><div className="phead-text"><span className="eyebrow">memoria</span><h2>{t('memoria.archive.title')}</h2></div><IconBtn ic="x" title={t('common.close')} onClick={close} /></header>
    <div className="mm-scroll" /></div>);
  wrap.querySelector('.mm-scroll')!.append(host);   // 서고는 따로 올린다 (틀은 다시 그리지 않으므로 React 가 이 자식을 건드리지 않는다)
  const offBody = mountInto(host, <Archive st={st} chatId={chat?.id} />);
  off = () => { offBody(); offFrame(); };
}
