// 밤의 게시판: 작은 부품 — 선 아이콘 · 압정과 빈 게시판 그림 · 시간 표시 · 투표 계기 · 홈 화면용 작은 게시판 · 대화 서랍의 스위치
import { useMemo, type ReactNode } from 'react';
import { Avatar, useEvents } from '../kit';
import { S } from '../lib/core';
import { I } from '../lib/icons';
import { go } from '../lib/router';
import { Check } from '../addons/parts';
import type { Chat } from '../lib/types';
import { fmtDate, t } from '../i18n';
import { ME, type ChatFeed, type Note, type Poll } from './types';
import { rng, seedOf, visible } from './logic';
import { F, account, cfg, vote } from './store';
import { chatFeed } from './prompt';

// 24 격자 한 줄 선 아이콘. fdboard 는 옆 내비에도 쓰인다
Object.assign(I, {
  fdboard: I.fdboard || 'M5 6h14v13H5zM12 3v5M9 12h6M9 15h4',
  fdstar: 'M12 4l1.7 6.3L20 12l-6.3 1.7L12 20l-1.7-6.3L4 12l6.3-1.7z',
  fdecho: 'M8 8h11v11H8zM5 16V5h11',
  fdreply: 'M5 5v6a4 4 0 0 0 4 4h10M15 11l4 4-4 4',
  fdpoll: 'M5 7h9M5 12h14M5 17h6',
  fdbell: 'M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4',
  fdbrush: 'M4 20c3 0 4-1 4-3a2 2 0 0 0-4 0c0 1-.5 2-1 3zM9 15L19 4l1.5 1.5-10 11',
  fdtalk: 'M4 5h16v11H10l-5 4v-4H4zM8 9h8M8 12h5',
  fdundo: 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3',
});
/** 가는 선 아이콘 (공용 Icon 보다 선이 가늘다 — 게시판의 숫자 옆에 놓는 것) */
export const Ln = ({ name, size = 16, fill = false }: { name: string; size?: number; fill?: boolean }) =>
  <svg viewBox="0 0 24 24" width={size} height={size} className="fd-ln" aria-hidden="true"><path d={I[name] || I.sparkle} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** 압정 하나. 글마다 씨앗(글 id)으로 살짝 다르게 기운다 */
export function Pin({ seed, size = 18 }: { seed: string; size?: number }) {
  const a = useMemo(() => Math.round((rng(seedOf(seed))() - 0.5) * 34), [seed]);
  return <svg viewBox="0 0 24 24" width={size} height={size} className="fx-art fd-pin" aria-hidden="true" style={{ transform: `rotate(${a}deg)` }}>
    <path d="M12 13.5V21" className="t" /><path d="M8.2 4h7.6l-1 5.2 2.7 2.6v1.7h-11v-1.7l2.7-2.6z" /><path d="M9.6 9.2h4.8" className="h" />
  </svg>;
}
/** 빈 게시판: 이중 괘선 판, 쪽지가 붙을 자리의 점선, 그리고 압정 하나에 매달린 빈 쪽지 */
export function EmptyBoard({ seed = 'board' }: { seed?: string }) {
  const ghosts = useMemo(() => { const r = rng(seedOf(seed)); return [[14, 16], [78, 14], [22, 56], [82, 52]].map(([x, y]) => ({ x: x + r() * 6, y: y + r() * 5, w: 24 + r() * 10, h: 16 + r() * 8, a: (r() - 0.5) * 8 })); }, [seed]);
  return <svg viewBox="0 0 140 96" className="fx-art fd-empty-art" role="img" aria-label="">
    <rect x="2" y="2" width="136" height="92" rx="1.5" className="t" /><rect x="5.5" y="5.5" width="129" height="85" rx="1" className="h" />
    {ghosts.map((g, i) => <rect key={i} x={g.x} y={g.y} width={g.w} height={g.h} className="d" transform={`rotate(${g.a} ${g.x + g.w / 2} ${g.y + g.h / 2})`} />)}
    <g transform="rotate(-4 70 40)"><path d="M54 30h32v26l-6 6H54z" className="p fx-draw" pathLength={1} /><path d="M86 56h-6v6" className="t" /><path d="M59 40h20M59 46h14" className="h" /></g>
    <g transform="translate(64 22)"><path d="M6 8v5" className="t" /><path d="M3 0h6l-.8 4 2.2 2v1.4H1.600V6l2.2-2z" className="a" /><circle cx="6" cy="2.4" r=".9" className="af" /></g>
  </svg>;
}

/** 시간 표시: 방금 · N분 · N시간 · N일 · 날짜 (모노 작은 글자로 쓴다) */
export function agoLabel(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - ts) / 60e3));
  return m < 1 ? t('feed.ago.now') : m < 60 ? t('feed.ago.m', { n: m }) : m < 1440 ? t('feed.ago.h', { n: Math.floor(m / 60) }) : m < 7 * 1440 ? t('feed.ago.d', { n: Math.floor(m / 1440) }) : fmtDate(ts, { month: 'numeric', day: 'numeric' });
}
/** 계정의 얼굴 · 이름 · 손잡이 (지워진 캐릭터는 이름 없이) */
export function faceOf(id: string): { o: { avatar?: string; name?: string; tags?: string[] } | null; name: string; handle: string; gone: boolean } {
  const a = account(id);
  if (id === ME) { const p = S.persona(null); return { o: p || null, name: p?.name || t('feed.me'), handle: a?.handle || 'me', gone: false }; }
  const c = S.get('chars', id); return { o: c || null, name: c?.name || t('feed.gone'), handle: a?.handle || '—', gone: !c };
}
export const pad2 = (n: number) => String(Math.min(999, n)).padStart(2, '0');

/** 투표: 칸마다 가는 계기. 내가 고르면 그 칸이 강조되고, 고르기 전에는 수치를 흐리게 둔다 */
export function PollView({ note, poll, readOnly }: { note: Note; poll: Poll; readOnly?: boolean }) {
  const total = Object.keys(poll.votes).length, mine = poll.votes[ME];
  return <div className="fd-poll" role="group" aria-label={poll.q || t('feed.poll.label')}>
    {poll.q ? <p className="fd-poll-q">{poll.q}</p> : null}
    {poll.opts.map((o, i) => { const n = Object.values(poll.votes).filter(v => v === i).length, p = total ? n / total : 0, on = mine === i;
      return <button key={i} type="button" className={'fd-opt' + (on ? ' on' : '')} disabled={readOnly} aria-pressed={on} onClick={() => vote(note.id, i)}>
        <span className="fd-opt-t">{on ? <i className="fx-dot" aria-hidden="true" /> : null}{o}</span><span className="fx-num fd-opt-n">{pad2(n)}</span>
        <span className={'fx-meter' + (on ? ' acc' : n ? '' : ' low')} style={{ ['--p' as string]: p }} />
      </button>; })}
    <span className="fx-lbl kr">{t('feed.poll.total', { n: total })}</span>
  </div>;
}

/** 홈 화면에 놓는 작은 게시판: 최근 글 셋 (폭 280~360px). 누르면 게시판으로 */
export function FeedMini(): ReactNode {
  useEvents('feed:changed', 'chars', 'personas');
  const notes = F.notes.filter(n => !n.root && visible(n)).slice(-3).reverse();
  return <section className="fd-mini" aria-label={t('feed.title')}>
    <button type="button" className="fd-mini-head fx-head" onClick={() => go('feed')}><span className="fx-lbl kr ink">{t('feed.title')}</span></button>
    {notes.length ? <div className="fx-rows fd-mini-rows">{notes.map((n, i) => { const f = faceOf(n.by);
      return <button type="button" key={n.id} className="fd-mini-row fx-in" style={{ ['--d' as string]: `${i * 60}ms` }} onClick={() => go('feed', n.id)}>
        <Avatar o={f.o} cls="xs" /><span className="fd-mini-txt"><b className="fx-serif">{f.name}</b><span className="fx-lbl fd-mini-time">{agoLabel(n.ts)}</span><span className="fd-mini-body">{n.text || (n.image ? t('feed.picture') : '')}</span></span>
      </button>; })}</div>
      : <button type="button" className="fd-mini-empty" onClick={() => go('feed')}><Pin seed="mini" /><span>{t('feed.mini.empty')}</span></button>}
  </section>;
}

/** 대화 서랍: 이 대화와 게시판 사이의 두 스위치와 그 캐릭터의 최근 글 */
export function ChatPanel({ chat }: { chat: Chat }) {
  const redraw = useEvents('feed:changed');
  const f = chatFeed(chat), set = (patch: ChatFeed) => { (chat as Chat & { feed?: ChatFeed }).feed = { ...f, ...patch }; void S.save('chats', chat, true); redraw(); };
  const ids = new Set(chat.charIds.filter(id => account(id)?.on)), carry = f.carry ?? (chat.mode === 'talk' && cfg().carry);
  const recent = F.notes.filter(n => ids.has(n.by) && visible(n)).slice(-2).reverse();
  if (!ids.size) return <div className="col fd-panel"><p className="hint">{t('feed.panel.notMember')}</p><button type="button" className="btn ghost" onClick={() => go('feed')}>{t('feed.panel.open')}</button></div>;
  return <div className="col fd-panel">
    <Check label={t('feed.panel.carry')} on={carry} onChange={v => set({ carry: v })} hint={t('feed.panel.carryHint')} />
    <Check label={t('feed.panel.mention')} on={f.mention === true} onChange={v => set({ mention: v })} hint={t('feed.panel.mentionHint')} />
    {recent.length ? <div className="fx-rows fd-mini-rows">{recent.map(n => <button type="button" key={n.id} className="fd-mini-row" onClick={() => go('feed', n.id)}><span className="fd-mini-txt"><b className="fx-serif">{faceOf(n.by).name}</b><span className="fx-lbl fd-mini-time">{agoLabel(n.ts)}</span><span className="fd-mini-body">{n.text}</span></span></button>)}</div> : null}
    <button type="button" className="btn ghost" onClick={() => go('feed')}>{t('feed.panel.open')}</button>
  </div>;
}
