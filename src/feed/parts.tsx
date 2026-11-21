// 밤의 게시판: 함께 쓰는 부품 — 아이콘 · 화면 이동(view) · 글 한 줄(Row) · 그림 격자 · 투표 막대 · 홈 위젯(FeedMini) · 대화 서랍 패널
// 모양은 흔한 타임라인 앱의 관습을 따른다: 둥근 얼굴, 굵은 이름 · @손잡이 · 시간 한 줄, 본문, 아래에 답글 · 재게시 · 마음.
import type { MouseEvent, ReactNode } from 'react';
import { Avatar, useEvents } from '../kit';
import { S, emit } from '../lib/core';
import { I } from '../lib/icons';
import { go, route } from '../lib/router';
import { Check, openModal } from '../addons/parts';
import { confirmBox, menu, toast } from '../ui';
import type { Chat } from '../lib/types';
import { fmtDate, t } from '../i18n';
import { ME, type ChatFeed, type Note, type Poll } from './types';
import { visible } from './logic';
import { F, account, answerNow, canDraw, cfg, draw, echo, hide, imgOf, like, remove, run, talkAbout, vote } from './store';
import { chatFeed } from './prompt';

// 24 격자 한 줄 선 아이콘. fdboard 는 옆 내비에도 쓰인다
Object.assign(I, {
  fdboard: 'M5 4h14v13H9l-4 3z M9 9h6M9 12.500h4',
  fdreply: 'M4 5h16v11h-7l-5 4v-4H4z',
  fdecho: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  fdheart: 'M12 20.500s-8-4.800-8-11a4.500 4.500 0 0 1 8-2.800 4.500 4.500 0 0 1 8 2.800c0 6.200-8 11-8 11z',
  fdpoll: 'M6 20V10M12 20V4M18 20v-7',
  fdbell: 'M6 17v-6a6 6 0 0 1 12 0v6l1.500 2h-15zM10 21h4',
  fdbrush: 'M4 20c3 0 4-1 4-3a2 2 0 0 0-4 0c0 1-.500 2-1 3zM9 15L19 4l1.500 1.500-10 11',
  fdtalk: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  fdback: 'M20 12H5M11 5l-7 7 7 7',
  fdpen: 'M4 20l1-4L16.500 4.500a2.100 2.100 0 0 1 3 3L8 19zM14 7l3 3',
  fdfollow: 'M15 20a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M16 11h6',
  fdspark: 'M12 3l1.900 6.100L20 11l-6.100 1.900L12 19l-1.900-6.100L4 11l6.100-1.900z',
});
export const Ic = ({ name, size = 19, fill = false }: { name: string; size?: number; fill?: boolean }) =>
  <svg viewBox="0 0 24 24" width={size} height={size} className="fd-ic" aria-hidden="true"><path d={I[name] || I.sparkle} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>;

// ── 화면 이동 ── 게시판 안의 화면(타임라인 · 게시물 · 프로필 · 알림)은 쌓아 두고 ← 로 돌아간다. 다른 화면에서 부르면 게시판으로 먼저 간다
export type Screen = { k: 'note'; id: string } | { k: 'profile'; id: string } | { k: 'notices' };
export const view = { tab: 'all' as 'all' | 'following', shown: 30, stack: [] as Screen[], ptab: 'notes' as 'notes' | 'replies' | 'media', top: [] as number[], compose: false };
/** 화면이 굴러가는 상자 (#page) */
export const scroller = () => document.getElementById('page');
export function show(s: Screen) {
  if (route.page !== 'feed') { view.stack = [s]; go('feed'); return; }
  const last = view.stack[view.stack.length - 1]; if (last && JSON.stringify(last) === JSON.stringify(s)) return;
  view.top[view.stack.length] = scroller()?.scrollTop || 0; view.stack.push(s); if (s.k === 'profile') view.ptab = 'notes';
  emit('feed:view'); requestAnimationFrame(() => { const el = scroller(); if (el) el.scrollTop = 0; });
}
export function back() { view.stack.pop(); const y = view.top[view.stack.length] || 0; emit('feed:view'); requestAnimationFrame(() => { const el = scroller(); if (el) el.scrollTop = y; }); }

// ── 표시 도우미 ──
/** 시간 표시: 방금 · N분 · N시간 · N일 · 날짜 */
export function agoLabel(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - ts) / 60e3));
  return m < 1 ? t('feed.ago.now') : m < 60 ? t('feed.ago.m', { n: m }) : m < 1440 ? t('feed.ago.h', { n: Math.floor(m / 60) }) : m < 7 * 1440 ? t('feed.ago.d', { n: Math.floor(m / 1440) }) : fmtDate(ts, { month: 'short', day: 'numeric' });
}
/** 계정의 얼굴 · 이름 · 손잡이 (지워진 캐릭터는 이름 없이) */
export function faceOf(id: string): { o: { avatar?: string; name?: string; tags?: string[] } | null; name: string; handle: string; gone: boolean } {
  const a = account(id);
  if (id === ME) { const p = S.persona(null); return { o: p || null, name: p?.name || t('feed.me'), handle: a?.handle || 'me', gone: false }; }
  const c = S.get('chars', id); return { o: c || null, name: c?.name || t('feed.gone'), handle: a?.handle || '—', gone: !c };
}
/** 둥근 얼굴 (누르면 프로필) */
export function Face({ id, size = 40, link = true }: { id: string; size?: number; link?: boolean }) {
  const f = faceOf(id), av = <Avatar o={f.o} cls="fd-av" />;
  return link ? <button type="button" className="fd-face" style={{ ['--s' as string]: size + 'px' }} aria-label={f.name} onClick={e => { e.stopPropagation(); show({ k: 'profile', id }); }}>{av}</button> : <span className="fd-face" style={{ ['--s' as string]: size + 'px' }}>{av}</span>;
}
export const count = (n: number) => n > 0 ? String(n) : '';
/** 줄 전체를 누르면 열리게 하되, 그 안의 단추 · 입력 · 글 고르기는 막지 않는다 */
const rowClick = (fn: () => void) => (e: MouseEvent) => { if ((e.target as HTMLElement).closest('button, a, input, textarea, label') || String(getSelection() || '')) return; fn(); };

// ── 그림 ──
export const picsOf = (n: Note) => [n.image, ...(n.images || [])].map(id => imgOf(id)).filter(Boolean);
const zoom = (src: string, alt: string) => openModal({ title: '', wide: true }, () => <img className="fd-zoom" src={src} alt={alt} />);
/** 그림: 한 장은 그대로, 여러 장은 격자 (둘은 반반, 셋은 왼쪽 크게, 넷은 2×2) */
export function Media({ n }: { n: Note }) {
  const pics = picsOf(n);
  if (pics.length) return <div className={'fd-media n' + Math.min(4, pics.length)}>{pics.slice(0, 4).map((src, i) => <button type="button" key={i} aria-label={t('feed.picture')} onClick={e => { e.stopPropagation(); zoom(src, n.imagePrompt || ''); }}><img src={src} alt={n.imagePrompt || ''} loading="lazy" /></button>)}</div>;
  // 그림 설명만 있고 삽화가 연결되지 않았으면 아무것도 보이지 않는다
  if (!n.imagePrompt || !canDraw()) return null;
  const busy = run.drawing.has(n.id);
  return <button type="button" className="fd-chip" disabled={busy} title={n.imagePrompt} onClick={e => { e.stopPropagation(); void draw(n.id); }}><Ic name="fdbrush" size={16} />{busy ? t('feed.draw.busy') : t('feed.draw.go')}<small>{t('feed.cost.image')}</small></button>;
}

// ── 투표 ── 고르기 전에는 알약 단추, 고른 뒤에는 퍼센트가 차는 둥근 막대
export function PollView({ note, poll }: { note: Note; poll: Poll }) {
  const total = Object.keys(poll.votes).length, mine = poll.votes[ME], voted = mine != null || note.by === ME;
  return <div className="fd-poll" role="group" aria-label={poll.q || t('feed.poll.label')}>
    {poll.q ? <p className="fd-poll-q">{poll.q}</p> : null}
    {poll.opts.map((o, i) => { const n = Object.values(poll.votes).filter(v => v === i).length, pct = total ? Math.round(n / total * 100) : 0, on = mine === i;
      return voted ? <button type="button" key={i} className={'fd-bar' + (on ? ' on' : '')} aria-pressed={on} disabled={note.by === ME} onClick={e => { e.stopPropagation(); vote(note.id, i); }}><i style={{ width: pct + '%' }} /><span className="fd-bar-t">{o}{on ? <Ic name="check" size={15} /> : null}</span><b>{pct}%</b></button>
        : <button type="button" key={i} className="fd-pick" onClick={e => { e.stopPropagation(); vote(note.id, i); }}>{o}</button>; })}
    <span className="fd-meta">{t('feed.poll.total', { n: total })}</span>
  </div>;
}

// ── 행동 줄 ──
export function noteMenu(e: MouseEvent, n: Note) {
  e.stopPropagation();
  menu(e.currentTarget, [
    n.by !== ME && !faceOf(n.by).gone && { label: t('feed.act.talk'), ic: 'fdtalk', hint: t('feed.act.talkHint'), onclick: () => void talkAbout(n.id) },
    n.by === ME && { label: t('feed.act.answer'), ic: 'fdspark', hint: t('feed.act.answerHint'), onclick: () => void answerNow(n.id) },
    n.imagePrompt && !n.image && canDraw() && { label: t('feed.draw.go'), ic: 'fdbrush', hint: t('feed.cost.image'), onclick: () => void draw(n.id) },
    { label: t('feed.act.profile'), ic: 'user', onclick: () => show({ k: 'profile', id: n.by }) },
    { label: t('feed.act.copy'), ic: 'copy', onclick: () => { void navigator.clipboard?.writeText(n.text).then(() => toast(t('feed.copied'), 'ok')).catch(() => { }); } },
    n.hidden ? { label: t('feed.act.unhide'), ic: 'eye', onclick: () => hide(n.id, false) } : { label: t('feed.act.hide'), ic: 'eyeoff', hint: t('feed.act.hideHint'), onclick: () => hide(n.id) },
    '-', { label: t('common.delete'), ic: 'trash', danger: true, onclick: async () => { if (await confirmBox(t('feed.act.deleteAsk'), t('common.delete'), true)) { if (view.stack.some(s => s.k === 'note' && s.id === n.id)) back(); void remove(n.id); } } },
  ]);
}
/** 답글 · 재게시 · 마음 · (대화 시작 / 지금 답 받기). 누른 것은 색이 찬다 */
export function Acts({ n, replies, onReply }: { n: Note; replies: number; onReply: () => void }) {
  const liked = n.likes.includes(ME), echoed = n.echoes.includes(ME), mine = n.by === ME, waiting = run.answering === n.id;
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };
  return <div className="fd-acts">
    <button type="button" className="fd-act reply" aria-label={t('feed.act.reply')} title={t('feed.act.reply')} onClick={stop(onReply)}><span className="fd-act-i"><Ic name="fdreply" /></span><span className="fd-act-n">{count(replies)}</span></button>
    <button type="button" className={'fd-act echo' + (echoed ? ' on' : '')} aria-pressed={echoed} aria-label={t('feed.act.echo')} title={t('feed.act.echo')} onClick={stop(() => echo(n.id))}><span className="fd-act-i"><Ic name="fdecho" /></span><span className="fd-act-n">{count(n.echoes.length)}</span></button>
    <button type="button" className={'fd-act heart' + (liked ? ' on' : '')} aria-pressed={liked} aria-label={t('feed.act.like')} title={t('feed.act.like')} onClick={stop(() => like(n.id))}><span className="fd-act-i"><Ic name="fdheart" fill={liked} /></span><span className="fd-act-n">{count(n.likes.length)}</span></button>
    {mine ? <button type="button" className={'fd-act share' + (waiting ? ' busy' : '')} disabled={run.busy || !!run.answering} aria-label={t('feed.act.answer')} title={t('feed.act.answer') + ' · ' + t('feed.cost.one')} onClick={stop(() => void answerNow(n.id))}><span className="fd-act-i"><Ic name="fdspark" /></span></button>
      : faceOf(n.by).gone ? <span className="fd-act" /> : <button type="button" className="fd-act share" aria-label={t('feed.act.talk')} title={t('feed.act.talk')} onClick={stop(() => void talkAbout(n.id))}><span className="fd-act-i"><Ic name="fdtalk" /></span></button>}
  </div>;
}

/** 이름 · @손잡이 · 시간 한 줄 (넘치면 이름부터 줄인다) */
export function Who({ n, menuBtn = true }: { n: Note; menuBtn?: boolean }) {
  const f = faceOf(n.by);
  return <div className="fd-who">
    <button type="button" className="fd-name" onClick={e => { e.stopPropagation(); show({ k: 'profile', id: n.by }); }}>{f.name}</button><span className="fd-handle">@{f.handle}</span><span className="fd-sep" aria-hidden="true">·</span>
    <time className="fd-time" dateTime={new Date(n.ts).toISOString()} title={fmtDate(n.ts, { dateStyle: 'medium', timeStyle: 'short' })}>{agoLabel(n.ts)}</time>
    {menuBtn ? <button type="button" className="fd-more" aria-label={t('feed.act.more')} onClick={e => noteMenu(e, n)}><Ic name="more" size={18} /></button> : null}
  </div>;
}
/** 글 위의 작은 줄: 누가 재게시했는지 · 대화 중에 올라온 글인지 · 숨긴 글인지 */
function Context({ n }: { n: Note }) {
  const names = n.echoes.map(id => faceOf(id).name), bits: ReactNode[] = [];
  if (names.length) bits.push(<span key="e" className="fd-ctx"><Ic name="fdecho" size={15} />{t('feed.echoedBy', { names: names[0] + (names.length > 1 ? t('feed.andMore', { n: names.length - 1 }) : '') })}</span>);
  if (n.src) bits.push(<span key="s" className="fd-ctx"><Ic name="chat" size={15} />{t('feed.tag.fromChat')}</span>);
  if (n.hidden) bits.push(<span key="h" className="fd-ctx"><Ic name="eyeoff" size={15} />{t('feed.tag.hidden')}</span>);
  return bits.length ? <>{bits}</> : null;
}
/** 글 한 줄. line: 아래 답글로 이어지는 세로선 · lite: 행동 줄 없이(위젯) · replyTo: "○○ 님에게 보내는 답글" 줄 */
export function Row({ n, line, lite, replyTo, onReply, fresh }: { n: Note; line?: boolean; lite?: boolean; replyTo?: string; onReply?: () => void; fresh?: boolean }) {
  const open = () => show({ k: 'note', id: n.root || n.id }), replies = F.notes.filter(x => x.root === n.id && visible(x)).length;
  return <article className={'fd-row' + (n.hidden ? ' hid' : '') + (fresh ? ' fresh' : '') + (lite ? ' lite' : '')} id={'fd-' + n.id} onClick={rowClick(open)}>
    <Context n={n} />
    <div className="fd-left"><Face id={n.by} size={lite ? 32 : 40} />{line ? <i className="fd-line" aria-hidden="true" /> : null}</div>
    <div className="fd-body">
      <Who n={n} menuBtn={!lite} />
      {replyTo ? <p className="fd-meta fd-replyto">{t('feed.replyingTo', { name: '@' + faceOf(replyTo).handle })}</p> : null}
      {n.text ? <p className="fd-text">{n.text}</p> : null}
      {lite ? (picsOf(n).length ? <p className="fd-meta"><Ic name="image" size={15} /> {t('feed.picture')}</p> : null) : <><Media n={n} />{n.poll ? <PollView note={n} poll={n.poll} /> : null}</>}
      {lite ? null : <Acts n={n} replies={replies} onReply={onReply || open} />}
    </div>
  </article>;
}

/** 홈 화면에 놓는 작은 게시판: 최근 글 셋 (폭 280~360px). 누르면 그 게시물로 */
export function FeedMini(): ReactNode {
  useEvents('feed:changed', 'chars', 'personas');
  const notes = F.notes.filter(n => !n.root && visible(n)).slice(-3).reverse();
  return <section className="fd-mini" aria-label={t('feed.title')}>
    <button type="button" className="fd-mini-head" onClick={() => { view.stack = []; go('feed'); }}><b>{t('feed.title')}</b><Ic name="right" size={16} /></button>
    {notes.length ? notes.map(n => <Row key={n.id} n={n} lite />) : <button type="button" className="fd-mini-empty" onClick={() => go('feed')}>{t('feed.mini.empty')}</button>}
  </section>;
}

/** 대화 서랍: 이 대화와 게시판 사이의 두 스위치와 그 캐릭터의 최근 글 */
export function ChatPanel({ chat }: { chat: Chat }) {
  const redraw = useEvents('feed:changed');
  const f = chatFeed(chat), set = (patch: ChatFeed) => { (chat as Chat & { feed?: ChatFeed }).feed = { ...f, ...patch }; void S.save('chats', chat, true); redraw(); };
  const ids = new Set(chat.charIds.filter(id => account(id)?.on)), carry = f.carry ?? (chat.mode === 'talk' && cfg().carry);
  const recent = F.notes.filter(n => ids.has(n.by) && !n.root && visible(n)).slice(-2).reverse();
  if (!ids.size) return <div className="col fd-panel"><p className="hint">{t('feed.panel.notMember')}</p><button type="button" className="btn ghost" onClick={() => go('feed')}>{t('feed.panel.open')}</button></div>;
  return <div className="col fd-panel">
    <Check label={t('feed.panel.carry')} on={carry} onChange={v => set({ carry: v })} hint={t('feed.panel.carryHint')} />
    <Check label={t('feed.panel.mention')} on={f.mention === true} onChange={v => set({ mention: v })} hint={t('feed.panel.mentionHint')} />
    {recent.length ? <div className="fd-mini">{recent.map(n => <Row key={n.id} n={n} lite />)}</div> : null}
    <button type="button" className="btn ghost" onClick={() => { view.stack = []; go('feed'); }}>{t('feed.panel.open')}</button>
  </div>;
}
