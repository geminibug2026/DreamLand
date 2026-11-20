// 성좌 도감의 화면 조각: 도감 화면(밤하늘 · 사람별) · 대화 서랍의 "이 사람과의 별자리" · 홈에 놓을 작은 요약 · 별이 켜질 때 구석에 뜨는 카드
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { S, on } from '../lib/core';
import type { Chat, Char } from '../lib/types';
import { go } from '../lib/router';
import { Avatar, Icon, useEvents } from '../kit';
import { Switch } from '../studio/parts';
import { ux } from '../features/usersettings';
import { t, fmtNum } from '../i18n';
import { CONS, MILES, STARS, conOf, starOf } from './defs';
import { A, cfg, charTally, conDone, doneCount, litCount, recent, tierNow, worldTally } from './logic';
import { ConArt, EmptyArt, PersonArt, Sky, StarGlyph, gradeOf } from './art';
import type { ConDef, Lit, MileDef, StarDef, Tally } from './types';

// ── 글 ──
export const conName = (c: ConDef) => t('atlas.c.' + c.id + '.n');
const conLine = (c: ConDef) => t('atlas.c.' + c.id + '.d');
export const starName = (s: StarDef) => t('atlas.s.' + s.id + '.n');
/** 조건 글. 숨은 별은 켜지기 전까지 가린다. 단계가 있으면 다음 문턱(다 올랐으면 마지막 문턱)을 적는다 */
const starCond = (s: StarDef, tier: number, reached = false) => s.hidden && !tier ? '?????' : t('atlas.s.' + s.id + '.c', { n: fmtNum(s.at[Math.min(reached ? tier - 1 : tier, s.at.length - 1)] / (s.unit || 1)) });
const mileName = (m: MileDef) => t('atlas.m.' + m.id + '.n');
const mileCond = (m: MileDef) => t('atlas.m.' + m.id + '.c');
const p2 = (n: number) => String(n).padStart(2, '0');
const day = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`; };
const ROMAN = ['', 'I', 'II', 'III'];
const frac = (v: number, at: number, unit = 1) => `${fmtNum(Math.floor(Math.min(v, at) / unit))}/${fmtNum(at / unit)}`;
const One = ({ grade, hidden, gold }: { grade: number; hidden?: boolean; gold?: boolean }) => <svg className="fx-art at-one" viewBox="-10 -10 20 20" aria-hidden="true"><StarGlyph x={0} y={0} grade={grade} k={1.15} hidden={hidden} gold={gold} /></svg>;
const Meter = ({ p, label }: { p: number; label: string }) => <div className="fx-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} style={{ ['--p' as string]: Math.max(0, Math.min(1, p)) }} />;

// ── 별자리 상세 ──
function StarRow({ s, i, W, hot, onHot, gold }: { s: StarDef; i: number; W: Tally; hot: boolean; onHot: (id: string | null) => void; gold: boolean }) {
  const tier = tierNow(s.id), max = s.at.length, v = W[s.m] || 0, next = s.at[tier], at = A.rec.got[s.id]?.[tier - 1];
  return <li className={'at-row' + (tier ? ' lit' : '') + (hot ? ' hot' : '')} onMouseEnter={() => onHot(s.id)} onMouseLeave={() => onHot(null)}>
    <span className="at-rno fx-num">{p2(i + 1)}</span><One grade={gradeOf(tier, max)} hidden={s.hidden} gold={gold} />
    <div className="at-rtx"><b>{tier || !s.hidden ? starName(s) : t('atlas.hiddenStar')}{max > 1 && tier > 0 && <i className="fx-num" aria-label={t('atlas.tier', { n: tier })}>{ROMAN[tier]}</i>}</b><small>{starCond(s, tier)}</small></div>
    <div className="at-rmeta">
      {max > 1 && <span className="fx-pips round" aria-hidden="true">{s.at.map((_, k) => <i key={k} className={k < tier ? 'on' : ''} />)}</span>}
      <span className="fx-num">{tier >= max ? day(at || 0) : s.hidden && !tier ? '··/··' : frac(v, next, s.unit)}</span>
      {tier > 0 && tier < max && <span className="fx-num dim">{day(at || 0)}</span>}
    </div>
  </li>;
}
function ConDetail({ con, W, onBack }: { con: ConDef; W: Tally; onBack: () => void }) {
  const [hot, setHot] = useState<string | null>(null), lit = con.stars.filter(s => tierNow(s.id) > 0).length, done = conDone(con.id);
  return <section className="at-detail fx-in" key={con.id} aria-label={conName(con)}>
    <button className="at-back fx-tap" onClick={onBack}><Icon name="left" size={15} />{t('atlas.back')}</button>
    <div className="at-plate fx-night fx-frame fx-grain"><ConArt con={con} tiers={tierNow} nums hot={hot} onStar={setHot} starName={starName} /><span className="fx-lbl at-plno">{con.no}</span></div>
    <div className="at-dbody">
      <header><span className="fx-lbl">{t('atlas.conLabel')} {con.no}</span><h2 className="fx-title">{conName(con)}</h2><p className="fx-body dim">{conLine(con)}</p></header>
      <div className="fx-kv"><span className="fx-lbl kr">{done ? t('atlas.conDone') : t('atlas.conProgress')}</span><i /><b>{p2(lit)}/{p2(con.stars.length)}</b></div>
      <Meter p={lit / con.stars.length} label={conName(con)} />
      <ol className="at-rows fx-rows">{con.stars.map((s, i) => <StarRow key={s.id} s={s} i={i} W={W} hot={hot === s.id} onHot={setHot} gold={done} />)}</ol>
    </div>
  </section>;
}

// ── 한 사람과의 별자리 ──
const mileLit = (charId: string) => MILES.map(m => !!A.rec.per[charId]?.[m.id]);
export function PersonView({ ch, onBack }: { ch: Char; onBack?: () => void }) {
  const T = useMemo(() => charTally(ch.id), [ch.id, A.rec]), lit = mileLit(ch.id), n = lit.filter(Boolean).length, [hot, setHot] = useState<number | null>(null);
  return <section className="at-detail fx-in" aria-label={t('atlas.person.title', { name: ch.name })}>
    {onBack && <button className="at-back fx-tap" onClick={onBack}><Icon name="left" size={15} />{t('atlas.back')}</button>}
    <div className="at-plate fx-night fx-frame fx-grain"><PersonArt name={ch.name} lit={lit} nums hot={hot} /><span className="fx-lbl at-plno">{ch.name.slice(0, 14)}</span></div>
    <div className="at-dbody">
      <header><span className="fx-lbl kr">{t('atlas.person.label')}</span><h2 className="fx-title">{t('atlas.person.title', { name: ch.name })}</h2><p className="fx-body dim">{t('atlas.person.line')}</p></header>
      <div className="fx-kv"><span className="fx-lbl kr">{t('atlas.conProgress')}</span><i /><b>{p2(n)}/{p2(MILES.length)}</b></div>
      <Meter p={n / MILES.length} label={ch.name} />
      <ol className="at-rows fx-rows">{MILES.map((m, i) => { const at = A.rec.per[ch.id]?.[m.id]; return <li key={m.id} className={'at-row' + (at ? ' lit' : '') + (hot === i ? ' hot' : '')} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}>
        <span className="at-rno fx-num">{p2(i + 1)}</span><One grade={at ? 2 : 0} gold={n === MILES.length} />
        <div className="at-rtx"><b>{mileName(m)}</b><small>{mileCond(m)}</small></div>
        <div className="at-rmeta"><span className="fx-num">{at ? day(at) : frac(T[m.m] || 0, m.at)}</span></div>
      </li>; })}</ol>
    </div>
  </section>;
}
/** 만난 적 있는 사람들 (켜진 별이 많은 순) */
const people = () => S.chars.map(c => ({ c, n: mileLit(c.id).filter(Boolean).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.c.name.localeCompare(b.c.name));
function People({ pick, setPick }: { pick: string | null; setPick: (id: string | null) => void }) {
  const list = people(), cur = S.get('chars', pick || '') || null;
  if (!list.length) return <div className="fx-empty"><EmptyArt /><p>{t('atlas.person.empty')}</p></div>;
  return <div className={'at-split' + (cur ? ' has' : '')}>
    <ul className="at-people fx-rows">{list.map(({ c, n }) => <li key={c.id}><button className={'at-pbtn fx-tap' + (c.id === cur?.id ? ' on' : '')} aria-pressed={c.id === cur?.id} onClick={() => setPick(c.id)}>
      <Avatar o={c} cls="sm" /><span className="at-pname">{c.name}</span><span className="at-thumb fx-night"><PersonArt name={c.name} lit={mileLit(c.id)} draw={false} k={1.7} /></span><span className="fx-num">{p2(n)}/{p2(MILES.length)}</span></button></li>)}</ul>
    {cur ? <PersonView key={cur.id} ch={cur} onBack={() => setPick(null)} /> : <div className="fx-empty at-pick-hint"><EmptyArt /><p>{t('atlas.person.pick')}</p></div>}
  </div>;
}

// ── 도감 화면 ──
const view: { tab: 'sky' | 'people'; con: string | null; who: string | null } = { tab: 'sky', con: null, who: null };   // 화면을 떠났다 와도 보던 자리 그대로
function SetRow({ k, label, hint }: { k: 'card' | 'sound' | 'tell'; label: string; hint: string }) {
  const [, bump] = useState(0);
  return <label className="at-set"><div><b>{label}</b><small>{hint}</small></div><Switch span checked={cfg()[k]} title={label} onChange={v => { cfg()[k] = v; S.set({}); bump(x => x + 1); }} /></label>;
}
export function AtlasPage({ arg }: { arg?: unknown }) {
  useEvents('atlas:changed', 'chars', 'chats');
  const a = arg as { con?: string; charId?: string } | undefined;
  const [tab, setTab] = useState<'sky' | 'people'>(() => a?.charId ? 'people' : a?.con ? 'sky' : view.tab), [con, setCon] = useState<string | null>(() => a?.con && conOf(a.con) ? a.con : view.con), [who, setWho] = useState<string | null>(() => a?.charId || view.who);
  view.tab = tab; view.con = con; view.who = who;
  const W = useMemo(() => worldTally(), [A.rec, A.rec.got, tab, con]), lit = litCount(), total = STARS.length, hid = STARS.filter(s => s.hidden), rec = recent(4);
  const shown = conOf(con || '') || null, detailRef = useRef<HTMLDivElement>(null);
  const pick = (id: string) => { setCon(id); requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };
  return <section className={'pagebox at-page' + (tab === 'sky' && shown ? ' has-con' : '')}>
    <header className="at-head"><div><span className="fx-lbl">atlas · {p2(lit)}/{p2(total)}</span><h1 className="fx-title">{t('atlas.title')}</h1></div>
      <div className="tabs" role="tablist">{(['sky', 'people'] as const).map(k => <button key={k} role="tab" aria-selected={tab === k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{k === 'sky' ? t('atlas.tab.sky') : t('atlas.tab.people')}</button>)}</div></header>
    <p className="hint at-intro">{t('atlas.intro')}</p>
    {tab === 'people' ? <People pick={who} setPick={setWho} /> : <>
      <div className="at-sky fx-night fx-frame fx-grain"><Sky tiers={tierNow} sel={shown?.id || null} onPick={pick} name={conName} starName={starName} /></div>
      {/* 좁은 화면에서는 성도 대신 별자리 카드 목록 */}
      <ul className="at-cards">{CONS.map((c, i) => { const n = c.stars.filter(s => tierNow(s.id) > 0).length; return <li key={c.id} className="fx-in" style={{ ['--d' as string]: `${i * .03}s` }}><button className={'at-ccard fx-tap' + (shown?.id === c.id ? ' on' : '')} aria-pressed={shown?.id === c.id} onClick={() => pick(c.id)}>
        <span className="at-thumb fx-night"><ConArt con={c} tiers={tierNow} draw={false} k={1.6} /></span>
        <span className="at-ctx"><span className="fx-lbl">{c.no}</span><b>{conName(c)}</b><Meter p={n / c.stars.length} label={conName(c)} /></span><span className="fx-num">{p2(n)}/{p2(c.stars.length)}</span></button></li>; })}</ul>
      <div className="at-lower" ref={detailRef}>
        {shown ? <ConDetail con={shown} W={W} onBack={() => setCon(null)} /> : <div className="fx-empty at-pick-hint"><EmptyArt /><p>{t('atlas.pickCon')}</p></div>}
        <aside className="at-side">
          <h3 className="fx-head"><span className="fx-lbl kr">{t('atlas.sum.title')}</span></h3>
          <div className="at-big"><b className="fx-num">{p2(lit)}</b><span className="fx-num dim">/ {p2(total)}</span><span className="fx-lbl kr">{t('atlas.sum.lit')}</span></div>
          <div><Meter p={lit / total} label={t('atlas.sum.lit')} /><div className="fx-ticks" aria-hidden="true" /></div>
          <div className="at-kvs">
            <div className="fx-kv"><span>{t('atlas.sum.cons')}</span><i /><b>{p2(doneCount())}/{p2(CONS.length)}</b></div>
            <div className="fx-kv"><span>{t('atlas.sum.hidden')}</span><i /><b>{p2(hid.filter(s => tierNow(s.id) > 0).length)}/{p2(hid.length)}</b></div>
            <div className="fx-kv"><span>{t('atlas.sum.bright')}</span><i /><b>{p2(STARS.filter(s => s.at.length > 1 && tierNow(s.id) >= s.at.length).length)}/{p2(STARS.filter(s => s.at.length > 1).length)}</b></div>
            <div className="fx-kv"><span>{t('atlas.sum.people')}</span><i /><b>{p2(people().length)}</b></div>
          </div>
          <h3 className="fx-head"><span className="fx-lbl kr">{t('atlas.sum.recent')}</span></h3>
          {rec.length ? <ul className="at-recent fx-rows dash">{rec.map(({ s, at, tier }) => <li key={s.id}><button className="fx-tap" onClick={() => pick(s.con)}><One grade={gradeOf(tier, s.at.length)} /><span>{starName(s)}</span><span className="fx-num dim">{day(at)}</span></button></li>)}</ul> : <p className="dim at-none">{t('atlas.sum.none')}</p>}
          <h3 className="fx-head"><span className="fx-lbl kr">{t('atlas.set.title')}</span></h3>
          <div className="at-sets fx-rows"><SetRow k="card" label={t('atlas.set.card')} hint={t('atlas.set.cardHint')} /><SetRow k="sound" label={t('atlas.set.sound')} hint={t('atlas.set.soundHint')} /><SetRow k="tell" label={t('atlas.set.tell')} hint={t('atlas.set.tellHint')} /></div>
          <p className="at-foot dim">{t('atlas.foot')}</p>
        </aside>
      </div>
    </>}
  </section>;
}

// ── 대화 서랍: 이 사람과의 별자리 ──
export function PersonPanel({ chat }: { chat: Chat }) {
  useEvents('atlas:changed');
  const chars = (chat.charIds || []).map(id => S.get('chars', id)).filter((c): c is Char => !!c).slice(0, 4);
  if (!chars.length) return <p className="dim">{t('atlas.person.pick')}</p>;
  return <div className="at-panel">{chars.map(ch => {
    const lit = mileLit(ch.id), n = lit.filter(Boolean).length, T = charTally(ch.id), next = MILES.find((_, i) => !lit[i]);
    return <button key={ch.id} className="at-pcard fx-tap" onClick={() => go('atlas', { charId: ch.id })} title={t('atlas.open')}>
      <span className="at-pplate fx-night"><PersonArt name={ch.name} lit={lit} draw={false} k={1.3} /></span>
      <span className="at-ptx"><b>{chars.length > 1 ? ch.name : t('atlas.person.title', { name: ch.name })}</b>
        <span className="fx-kv"><span className="fx-lbl kr">{t('atlas.sum.lit')}</span><i /><b>{p2(n)}/{p2(MILES.length)}</b></span>
        <Meter p={n / MILES.length} label={ch.name} />
        <small>{next ? t('atlas.person.next', { name: mileName(next), now: frac(T[next.m] || 0, next.at) }) : t('atlas.person.full')}</small></span>
    </button>; })}</div>;
}

// ── 홈에 놓을 작은 요약: 전체 진척과 최근 켜진 별 셋 ──
export function AtlasMini(): JSX.Element {
  useEvents('atlas:changed');
  const lit = litCount(), total = STARS.length, rec = recent(3);
  return <div className="at-mini fx-night fx-frame fx-grain">
    <button className="at-mhead fx-tap" onClick={() => go('atlas')} aria-label={t('atlas.open')}><span className="fx-lbl kr">{t('atlas.title')}</span><span className="fx-num">{p2(lit)}/{p2(total)}</span></button>
    <Meter p={lit / total} label={t('atlas.sum.lit')} />
    {rec.length ? <ul className="at-recent fx-rows dash">{rec.map(({ s, at, tier }) => <li key={s.id}><button className="fx-tap" onClick={() => go('atlas', { con: s.con })}><One grade={gradeOf(tier, s.at.length)} /><span>{starName(s)}</span><span className="fx-num dim">{day(at)}</span></button></li>)}</ul>
      : <div className="at-mempty"><EmptyArt /><p>{t('atlas.sum.none')}</p></div>}
    <div className="fx-kv at-mfoot"><span>{t('atlas.sum.cons')}</span><i /><b>{p2(doneCount())}/{p2(CONS.length)}</b></div>
  </div>;
}

// ── 별이 켜지는 순간의 카드 ──
let ac: AudioContext | null = null;
/** 짧은 한 음. 설정의 알림음을 꺼 두었으면 내지 않고, 크기도 그 설정을 따른다 */
export function tone(bright = false) {
  const u = ux(); if (!cfg().sound || !u.sound) return;
  try {
    ac ||= new AudioContext(); if (ac.state === 'suspended') void ac.resume();
    const vol = Math.max(0, Math.min(100, +u.soundVolume || 0)) / 100; if (!vol) return;
    const t0 = ac.currentTime + .02, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = bright ? 1567.98 : 1174.66;
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.22 * vol, t0 + .015); g.gain.exponentialRampToValueAtTime(.0001, t0 + .9);
    o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + .95);
  } catch { /* 소리를 못 내는 환경 */ }
}
interface Card { key: number; lit: Lit }
let seq = 0;
function CardView({ lit, onClose }: { lit: Lit; onClose: () => void }) {
  let art: ReactNode, label: string, title: string, line: string, to: unknown;
  if (lit.kind === 'star') {
    const s = starOf(lit.id)!, c = conOf(s.con)!;
    art = <ConArt con={c} tiers={tierNow} hot={s.id} k={1.3} />; label = lit.done ? t('atlas.card.done', { con: conName(c) }) : lit.tier > 1 ? t('atlas.card.brighter', { tier: ROMAN[lit.tier] }) : t('atlas.card.lit');
    title = starName(s); line = starCond(s, lit.tier, true); to = { con: c.id };
  } else if (lit.kind === 'mile') {
    const m = MILES.find(x => x.id === lit.id)!, ch = S.get('chars', lit.charId || ''), name = ch?.name || '';
    art = <PersonArt name={name} lit={mileLit(lit.charId || '')} hot={MILES.indexOf(m)} k={1.3} />; label = t('atlas.card.person', { name }); title = mileName(m); line = mileCond(m); to = { charId: lit.charId };
  } else { art = <ConArt con={CONS[0]} tiers={tierNow} k={1.3} />; label = t('atlas.title'); title = lit.done ? t('atlas.card.more', { n: lit.n || 0 }) : t('atlas.card.many', { n: lit.n || 0 }); line = lit.done ? t('atlas.card.moreHint') : t('atlas.card.manyHint'); to = undefined; }
  return <div className="at-card fx-night fx-frame fx-grain">
    <button className="at-cmain" onClick={() => { onClose(); go('atlas', to); }}><span className="at-cart">{art}</span><span className="at-cbody"><span className="fx-lbl kr">{label}</span><b>{title}</b><small>{line}</small></span></button>
    <button className="at-cx" aria-label={t('common.close')} onClick={onClose}><Icon name="x" size={13} /></button>
  </div>;
}
/** 화면 구석의 카드 줄. 한꺼번에 여럿 켜지면 둘만 보여 주고 나머지는 수로 묶는다 */
export function Cards() {
  const [list, setList] = useState<Card[]>([]);
  useEffect(() => on<Lit[]>('atlas:lit', lits => {
    if (!cfg().card || !lits?.length) return;
    // 별자리를 완성한 별 · 단계가 높은 별을 앞에
    const sorted = [...lits].sort((a, b) => +(b.done || 0) - +(a.done || 0) || b.tier - a.tier), show = sorted.length > 3 ? [...sorted.slice(0, 2), { kind: 'many', id: '', tier: 0, n: sorted.length - 2, done: true } as Lit] : sorted;
    const cards = show.map(lit => ({ key: ++seq, lit }));
    setList(l => [...l, ...cards].slice(-4)); tone(sorted.some(l => l.done && l.kind === 'star'));
    for (const c of cards) setTimeout(() => setList(l => l.filter(x => x.key !== c.key)), 7500);
  }), []);
  return <div className="at-toasts" role="status" aria-live="polite">{list.map(c => <CardView key={c.key} lit={c.lit} onClose={() => setList(l => l.filter(x => x !== c))} />)}</div>;
}
