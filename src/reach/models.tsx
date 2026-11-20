// 모델 바로 고르기: 입력창 위의 작은 칩과, 누르면 뜨는 선택 창 (지금 · 별표 · 저장해 둔 것 · 전체 · 직접 입력)
// 여기서 고르면 이 대화만 바뀐다. 모든 대화의 기본으로 삼거나 기본으로 되돌릴 수 있다.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conn } from '../lib/types';
import { S, chatConns } from '../lib/core';
import { PROVIDERS } from '../lib/engine';
import { Icon, useEvents } from '../kit';
import { openModal, toast } from '../ui';
import { cur, useCh, bump } from '../chat/store';
import { I } from '../lib/icons';
import { t } from '../i18n';
import { rankModel, shortModel } from './shuffle';
import { cachedModels, chooseFor, clearChoice, forget, inMix, isStar, livePool, loadModels, makeDefault, overridden, restoreDefault, stars, toggleMix, toggleStar, type RChat, type RConn } from './route';

if (!I.mix) I.mix = 'M3 7h4l10 10h4M17 14l4 3-4 3M3 17h4l3-3M14 10l3-3h4M17 4l4 3-4 3';

// ── 연결 표식: 색 대신 작은 도형 하나로 연결을 구별한다 (칩 · 선택 창 · 연결 목록에서 같은 모양) ──
export const MARKS = ['dot', 'ring', 'diamond', 'tri', 'square', 'star', 'moon', 'cross'] as const;
const MARK_D: Record<string, { d: string; fill?: boolean }> = {
  dot: { d: 'M6 2.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 1 0 0-6.8z', fill: true }, ring: { d: 'M6 2.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2z' },
  diamond: { d: 'M6 1.6L10.4 6L6 10.4L1.6 6z' }, tri: { d: 'M6 2.2l4.2 7.4H1.8z' }, square: { d: 'M2.6 2.6h6.8v6.8H2.6z' },
  star: { d: 'M6 1.4l1.2 3.4l3.4 1.2l-3.4 1.2L6 10.6L4.8 7.2L1.4 6l3.4-1.2z', fill: true }, moon: { d: 'M9.6 7.4A4.2 4.2 0 0 1 4.6 2.4a4.2 4.2 0 1 0 5 5z' }, cross: { d: 'M6 1.8v8.4M1.8 6h8.4' },
};
/** 표식을 정하지 않은 연결은 id 로 하나를 정해 준다 (늘 같은 모양) */
export const markOf = (c?: Conn | null) => { const m = (c as RConn | undefined)?.mark; if (m && MARK_D[m]) return m; let h = 0; for (const ch of String(c?.id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return MARKS[h % MARKS.length]; };
export function Mark({ c, name, size = 12 }: { c?: Conn | null; name?: string; size?: number }) {
  const k = MARK_D[name || markOf(c)] || MARK_D.dot;
  return <svg className="rc-mark" viewBox="0 0 12 12" width={size} height={size} aria-hidden="true"><path d={k.d} fill={k.fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.1} strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

// ── 성도: 고른 모델의 이름에서 씨앗을 얻어 별 몇 개와 궤도를 그린다. 같은 모델은 늘 같은 하늘 ──
const seedOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rng = (seed: number) => () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
export function SkyDial({ seed, n = 0, size = 76 }: { seed: string; /** 섞기 풀의 크기 — 바깥 궤도에 그만큼 점을 찍는다 */ n?: number; size?: number }) {
  const art = useMemo(() => {
    const r = rng(seedOf(seed || 'dreamland')), pts = Array.from({ length: 5 + Math.floor(r() * 3) }, (_, i) => { const a = (i / 6) * Math.PI * 2 + r() * .9, d = 9 + r() * 15; return [40 + Math.cos(a) * d, 40 + Math.sin(a) * d] as const; });
    const tilt = Math.round(r() * 50 - 25), lead = Math.floor(r() * pts.length);
    return { pts, tilt, lead, path: 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') };
  }, [seed]);
  return <svg className="fx-art rc-dial" viewBox="0 0 80 80" width={size} height={size} aria-hidden="true">
    <circle className="h" cx="40" cy="40" r="37" /><circle className="d" cx="40" cy="40" r="30" />
    <ellipse className="t" cx="40" cy="40" rx="34" ry="13" transform={`rotate(${art.tilt} 40 40)`} />
    {Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2, l = i % 6 ? 2 : 4; return <path key={i} className="h" d={`M${(40 + Math.cos(a) * 37).toFixed(1)} ${(40 + Math.sin(a) * 37).toFixed(1)}L${(40 + Math.cos(a) * (37 - l)).toFixed(1)} ${(40 + Math.sin(a) * (37 - l)).toFixed(1)}`} />; })}
    <path className="t fx-draw" pathLength={1} d={art.path} />
    {art.pts.map((p, i) => i === art.lead ? <path key={i} className="af" d={`M${p[0]} ${p[1] - 3.4}l.9 2.5l2.5.9l-2.5.9l-.9 2.5l-.9-2.5l-2.5-.9l2.5-.9z`} /> : <circle key={i} className="f" cx={p[0]} cy={p[1]} r={i % 2 ? 1 : 1.4} />)}
    {Array.from({ length: Math.min(n, 12) }, (_, i) => { const a = -Math.PI / 2 + i / Math.max(n, 1) * Math.PI * 2; return <circle key={'m' + i} className="p" cx={40 + Math.cos(a) * 30} cy={40 + Math.sin(a) * 30} r="1.8" />; })}
  </svg>;
}

// ── 칩 ──
export function ModelChip() {
  useCh('composer'); useCh('top'); useEvents('settings', 'conns', 'conns:saved', 'reach:model');
  const chat = cur.chat as RChat | null; if (!chat) return null;
  const conn = S.connFor(chat), mix = !!chat.mix && livePool().length > 0;
  const label = !conn ? t('reach.chip.none') : mix ? t('reach.chip.mix', { n: livePool().length }) : shortModel(conn.model) || conn.name;
  return <button type="button" className={'rc-chip' + (overridden(chat) ? ' own' : '')} title={conn ? t('reach.chip.title', { conn: conn.name, model: conn.model || '—' }) : t('reach.chip.none')} aria-label={t('reach.pick.title')} onClick={() => openPicker(chat)}>
    {mix ? <Icon name="mix" size={12} /> : <Mark c={conn} />}<span>{label}</span>{overridden(chat) ? <i className="fx-dot" aria-label={t('reach.chip.own')} /> : null}
  </button>;
}

// ── 선택 창 ──
interface Row { conn: Conn; m: string; rank: number }
export function openPicker(chat: RChat) {
  const m = openModal({ title: t('reach.pick.title'), body: <Picker chat={chat} close={() => m.close()} /> });
  m.el?.classList.add('rc-modal');
}
const redrawChat = () => { bump('composer', 'top', 'gauge'); };

function Picker({ chat, close }: { chat: RChat; close: () => void }) {
  const [, tick] = useState(0), draw = () => tick(n => n + 1);
  const conns = chatConns(), now = S.connFor(chat);
  const [q, setQ] = useState(''), [from, setFrom] = useState(now?.id || conns[0]?.id || ''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const inp = useRef<HTMLInputElement>(null);
  const src = S.get('conns', from) || conns[0];
  const pull = async (force: boolean) => {
    if (!src) return; setBusy(true); setErr('');
    try { await loadModels(src, force); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  // 창을 열면 지금 연결의 목록을 조용히 받아 둔다 (이미 받아 둔 것이 있으면 그대로)
  useEffect(() => { if (src && !cachedModels(src) && PROVIDERS[src.provider]?.kind !== 'mock') void pull(false); else draw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from]);
  useEffect(() => { if (!matchMedia('(hover: none)').matches) inp.current?.focus(); }, []);

  const term = q.trim();
  const pick = async (c: Conn, model: string) => { await chooseFor(chat, c, model); redrawChat(); toast(t('reach.pick.chosen', { model: shortModel(model) || model }), 'ok'); close(); };
  const rowsOf = (list: { conn: Conn; m: string }[]): Row[] => list.map(x => ({ ...x, rank: rankModel(x.m, term, isStar(x.conn.id, x.m), true) })).filter(x => x.rank >= 0);
  const starred = rowsOf(stars().map(s => ({ conn: S.get('conns', s.c)!, m: s.m })).filter(x => x.conn));
  const saved = conns.map(c => ({ c, list: rowsOf([...new Set([c.model, ...((c as RConn).saved || [])].filter(Boolean))].map(mm => ({ conn: c, m: mm }))) })).filter(g => g.list.length);
  const all: Row[] = src ? (cachedModels(src) || PROVIDERS[src.provider]?.models || []).map(mm => ({ conn: src, m: mm, rank: rankModel(mm, term, isStar(src.id, mm), mm === src.model || ((src as RConn).saved || []).includes(mm)) })).filter(x => x.rank >= 0).sort((a, b) => a.rank - b.rank || a.m.localeCompare(b.m)) : [];
  const exact = term && src && !all.some(x => x.m === term);
  const pool = livePool();

  const row = (x: Row, k: string, extra?: { forget?: boolean }) => {
    const on = now?.id === x.conn.id && now.model === x.m && !chat.mix, st = isStar(x.conn.id, x.m), mx = inMix(x.conn.id, x.m);
    return <div className={'rc-row' + (on ? ' on' : '')} key={k}>
      <button type="button" className="rc-row-main" aria-current={on || undefined} onClick={() => void pick(x.conn, x.m)}>
        <Mark c={x.conn} /><span className="rc-mid">{x.m}</span><small>{x.conn.name}</small>{on ? <em className="fx-lbl kr acc">{t('reach.pick.nowTag')}</em> : null}
      </button>
      {extra?.forget && x.m !== x.conn.model ? <button type="button" className="rc-tog" title={t('reach.pick.forget')} aria-label={t('reach.pick.forget')} onClick={() => { forget(x.conn, x.m); draw(); }}><Icon name="x" size={13} /></button> : null}
      <button type="button" className={'rc-tog' + (mx ? ' on' : '')} aria-pressed={mx} title={mx ? t('reach.pick.mixOff') : t('reach.pick.mixOn')} aria-label={mx ? t('reach.pick.mixOff') : t('reach.pick.mixOn')} onClick={() => { toggleMix(x.conn.id, x.m); draw(); redrawChat(); }}><Icon name="mix" size={14} /></button>
      <button type="button" className={'rc-tog star' + (st ? ' on' : '')} aria-pressed={st} title={st ? t('reach.pick.starOff') : t('reach.pick.starOn')} aria-label={st ? t('reach.pick.starOff') : t('reach.pick.starOn')} onClick={() => { toggleStar(x.conn.id, x.m); draw(); }}><Icon name="star" size={14} /></button>
    </div>;
  };
  const sec = (label: string, en: string, kids: React.ReactNode, tail?: React.ReactNode) => <section className="rc-sec"><h4 className="fx-head"><span className="fx-lbl kr ink">{label}</span><span className="fx-lbl">{en}</span>{tail}</h4>{kids}</section>;

  if (!conns.length) return <div className="fx-empty"><SkyDial seed="empty" size={56} /><p>{t('reach.pick.noConn')}</p></div>;
  return <div className="rc-pick">
    <header className="rc-pick-head">
      <SkyDial seed={chat.mix ? 'mix' + pool.length : (now?.model || '')} n={chat.mix ? pool.length : 0} />
      <div className="rc-pick-now">
        <span className="fx-lbl">{overridden(chat) ? 'this chat only' : 'default'}</span>
        <b className="fx-serif">{chat.mix && pool.length ? t('reach.pick.mixing', { n: pool.length }) : now?.model || t('reach.pick.noModel')}</b>
        <small><Mark c={now} />{now?.name}<i>·</i>{overridden(chat) ? t('reach.pick.scopeChat') : t('reach.pick.scopeDefault')}</small>
      </div>
    </header>
    <div className="rc-pick-bar">
      <label className="rc-search"><Icon name="search" size={15} /><input ref={inp} value={q} placeholder={t('reach.pick.searchPh')} aria-label={t('reach.pick.searchPh')} spellCheck={false} autoComplete="off" onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && term && src) void pick(src, all.length === 1 ? all[0].m : term); }} /></label>
    </div>
    <div className="rc-pick-list">
      {starred.length ? sec(t('reach.pick.secStar'), 'starred', <div className="fx-rows">{starred.map((x, i) => row(x, 's' + i))}</div>) : null}
      {saved.length ? sec(t('reach.pick.secSaved'), 'saved', saved.map(g => <div className="rc-group" key={g.c.id}><div className="fx-rows">{g.list.map((x, i) => row(x, g.c.id + i, { forget: true }))}</div></div>)) : null}
      {sec(t('reach.pick.secAll'), 'all models', <>
        <div className="rc-all-bar">
          <select className="inp" value={src?.id || ''} aria-label={t('reach.pick.fromConn')} onChange={e => setFrom(e.target.value)}>{conns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void pull(true)}><Icon name="refresh" size={14} />{busy ? t('reach.pick.loading') : t('reach.pick.reload')}</button>
          <span className="fx-num rc-count">{String(all.length).padStart(3, '0')}</span>
        </div>
        {err ? <p className="rc-err">{t('reach.pick.loadFail', { err })}</p> : null}
        {exact ? <button type="button" className="rc-exact fx-tap" onClick={() => void pick(src, term)}><Icon name="edit" size={14} /><span>{t('reach.pick.useTyped', { id: term, conn: src.name })}</span></button> : null}
        {all.length ? <div className="fx-rows rc-all">{all.slice(0, 80).map((x, i) => row(x, 'a' + i))}</div> : !exact ? <p className="rc-none">{term ? t('reach.pick.noMatch') : t('reach.pick.noList')}</p> : null}
        {all.length > 80 ? <p className="rc-none">{t('reach.pick.more', { n: all.length - 80 })}</p> : null}
      </>)}
    </div>
    <footer className="rc-pick-foot">
      <label className={'rc-mixsw' + (chat.mix ? ' on' : '')} title={t('reach.pick.mixHint')}>
        <input type="checkbox" checked={!!chat.mix} disabled={!pool.length} onChange={async e => { chat.mix = e.target.checked; await S.save('chats', chat, true); draw(); redrawChat(); }} />
        <Icon name="mix" size={15} /><span>{t('reach.pick.mixChat')}</span><b className="fx-num">{String(pool.length).padStart(2, '0')}</b>
      </label>
      <span className="rc-sp" />
      <button type="button" className="btn ghost" disabled={!overridden(chat)} onClick={async () => { await clearChoice(chat); redrawChat(); draw(); toast(t('reach.pick.backDone')); }}>{t('reach.pick.back')}</button>
      <button type="button" className="btn" disabled={!overridden(chat) || !!chat.mix} onClick={async () => {
        const prev = await makeDefault(chat); if (!prev) return; redrawChat(); close();
        undoToast(t('reach.pick.madeDefault', { model: shortModel(S.conn()?.model || '') }), async () => { await restoreDefault(prev); redrawChat(); });
      }}>{t('reach.pick.makeDefault')}</button>
    </footer>
    {!pool.length ? <p className="rc-foot-hint">{t('reach.pick.mixEmpty')}</p> : chat.mix ? <p className="rc-foot-hint">{t('reach.pick.mixOnHint', { list: pool.slice(0, 4).map(x => shortModel(x.m)).join(' · ') + (pool.length > 4 ? ' …' : '') })}</p> : null}
  </div>;
}

/** 되돌리기 단추가 달린 알림 한 줄 (몇 초 뒤 사라진다) */
export function undoToast(text: string, undo: () => void | Promise<void>) {
  const el = document.createElement('div'); el.className = 'rc-undo fx-in'; el.setAttribute('role', 'status');
  const s = document.createElement('span'); s.textContent = text;
  const b = document.createElement('button'); b.type = 'button'; b.textContent = t('reach.undo');
  const off = () => el.remove(), timer = setTimeout(off, 7000);
  b.addEventListener('click', () => { clearTimeout(timer); off(); void undo(); });
  el.append(s, b); document.body.append(el);
}
