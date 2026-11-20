// 게임 모드에 더한 화면 조각들: 답장에 붙는 굴림 카드(만남 · 눈썰미 · 한 번에 끝난 판정 · 본문 속 굴림), 사기의 깃대, 인물 수첩, 서가, 지난 이야기, 캠페인 뼈대.
// 그림은 Art.tsx 와 같은 손그림 선(24칸 · currentColor)으로 그리고, 틀과 계기는 fine.css 의 부품을 쓴다. 모양은 css/gm2.css.
import { useState, type ReactNode } from 'react';
import type { Chat, Msg } from '../lib/types';
import { S } from '../lib/core';
import { quickCall } from '../lib/engine';
import { openModal } from '../addons/parts';
import { confirmBox, toast } from '../ui';
import { has, t } from '../i18n';
import { cur } from '../chat/store';
import { running } from '../chat/actions';
import { GameCard, redrawGame } from './ui';
import { flipFate } from './turn';
import { moodTier } from './mood';
import { DANGER_EN, type Enc, type EncKind, type Seen } from './omens';
import { SAGA_PROMPT, readSaga, sagaBrief, sagaPaths, type Saga } from './saga';
import { gameOf, repTier, sheetOf, type GameChat, type GameMsg, type GameSwipe, type SessionNote, type Sheet } from './state';
import type { Person } from './bonds';

const sign = (n: number) => (n >= 0 ? '+' : '') + n, pad = (n: number, w = 2) => String(Math.max(0, n)).padStart(w, '0');
const Art = ({ children, size = 24, cls = '' }: { children: ReactNode; size?: number; cls?: string }) => <svg viewBox="0 0 24 24" width={size} height={size} className={`fx-art ${cls}`} aria-hidden="true">{children}</svg>;

// ── 작은 그림들 ──
const ENC_ART: Record<EncKind, ReactNode> = {
  // 싸움: 엇갈린 두 칼
  combat: <><path d="M4.500 4.500 15 15M19.500 4.500 9 15" /><path d="M13 17l4-4M11 17l-4-4" className="t" /><path d="M16.500 16.500l3 3M7.500 16.500l-3 3" /></>,
  // 사람: 마주 보는 두 얼굴의 옆선
  social: <><path d="M9 4.500c-2.500.500-4 2.500-4 5l-1.500 2.500 1.500.700v2.300c0 1 .800 1.800 1.800 1.800H9V19.500" /><path d="M15 4.500c2.500.500 4 2.500 4 5l1.500 2.500-1.500.700v2.300c0 1-.800 1.800-1.800 1.800H15V19.500" /><path d="M11 9h2M11 12h2" className="d" /></>,
  // 함정: 벌어진 덫의 이빨
  trap: <><path d="M3.500 15a8.500 8.500 0 0 1 17 0" /><path d="M5 14.500l1.500-3 1.500 3 1.500-3 1.500 3 1 -3 1 3 1.500-3 1.500 3 1.500-3 1.500 3" className="t" /><path d="M3.500 15h17M12 15v4.500M9 19.500h6" /></>,
  // 수수께끼: 돌에 새긴 문양과 열쇠 구멍
  puzzle: <><path d="M5 4.500h14v15H5z" /><path d="M5 4.500h14v15H5z" className="h" transform="translate(1.200 1.200)" /><circle cx="12" cy="10.500" r="2" /><path d="M11 12.300 10.300 16h3.400l-.700-3.700" /><path d="M7.500 7h2M14.500 7h2M7.500 17h2M14.500 17h2" className="t" /></>,
  // 상인: 저울
  merchant: <><path d="M12 4v15.500M7.500 19.500h9M5 7.500h14" /><path d="M5 7.500 2.800 13h4.400zM19 7.500 16.800 13h4.400z" /><path d="M2.800 13a2.200 2.200 0 0 0 4.400 0M16.800 13a2.200 2.200 0 0 0 4.400 0" className="t" /><circle cx="12" cy="4" r=".9" className="f" /></>,
  // 사건: 떨어지는 별
  event: <><path d="M15.500 5.500l1 2.600 2.700.200-2.100 1.700.700 2.600-2.300-1.500-2.300 1.500.700-2.600-2.100-1.700 2.700-.200z" /><path d="M11.500 11.500 4.500 18.500" /><path d="M9.500 10.500 5 15M13 14l-4.500 4.500" className="t" /><path d="M4 12.500l1.500-1.500M11 19.500l1.500-1.500" className="d" /></>,
};
/** 눈썰미: 반쯤 뜬 눈과 속눈썹 */
const Eye = ({ size = 18 }: { size?: number }) => <Art size={size}><path d="M2.500 12c2.800-4 6-6 9.500-6s6.700 2 9.500 6c-2.800 4-6 6-9.500 6s-6.700-2-9.500-6z" /><circle cx="12" cy="12" r="2.800" /><circle cx="12" cy="12" r=".9" className="f" /><path d="M12 3.200v1.500M6.800 4.800l.800 1.300M17.200 4.800l-.800 1.300" className="t" /></Art>;
/** 사기의 깃대: 다섯 눈금이 새겨진 장대에 깃발이 기세만큼 올라가 있다. 기세가 낮으면 깃발이 처지고, 높으면 바람을 받는다 */
export function MoodFlag({ v, size = 44 }: { v: number; size?: number }) {
  const tier = moodTier(v), y = 19 - v / 100 * 14, lift = tier >= 3 ? -1.4 : tier <= 1 ? 1.6 : 0, w = tier === 0 ? 5 : tier === 1 ? 6.500 : 8;
  return <Art size={size} cls="g2-flag"><path d="M7 2.500v19.500M4.500 22h5" /><circle cx="7" cy="2.300" r=".9" className="f" />
    {[19, 15.500, 12, 8.500, 5].map((ty, i) => <path key={i} d={`M5.800 ${ty}h1.200`} className="t" />)}
    <path d={`M7 ${y}q${w / 2} ${lift - 1.400} ${w} ${lift}t${w * .7} ${lift}l-1.600 2.300 1.600 2.300q-${w * .35} ${-lift - .800}-${w * .7} ${-lift}t-${w} ${-lift}z`} className={tier >= 3 ? 'p a' : 'p'} />
    <path d={`M8.500 ${y + 2.300}h${w - 2}`} className="h" /></Art>;
}
/** 다섯 칸 사다리: 사이의 단계 (원수 · 적대 · 중립 · 우호 · 헌신) */
const Ladder = ({ tier }: { tier: number }) => <span className="fx-pips g2-ladder" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} className={i === tier ? 'on' : i === 2 ? 'mid' : ''} />)}</span>;

// ── 답장에 붙는 카드 ──
function EncCard({ e }: { e: Enc }) {
  return <div className="g2-enc fx-frame fx-in" role="note">
    <span className="g2-enc-art"><Art size={30}>{ENC_ART[e.kind]}</Art></span>
    <div className="g2-enc-body"><span className="fx-lbl kr">{t('game.enc.title')} · {t('game.enc.act.' + e.act)}</span><b className="fx-serif">{t('game.enc.' + e.kind)}</b></div>
    <div className="g2-enc-roll" title={t('game.enc.rollTip', { roll: e.roll, under: e.under })}><span className="fx-lbl">d100</span><b className="fx-num">{pad(e.roll)}</b><small className="fx-num">≤ {pad(e.under)}</small></div>
    <span className="g2-enc-danger" title={DANGER_EN[e.danger]}><span className="fx-lbl kr">{t('game.danger.' + e.danger)}</span><span className="fx-pips">{[1, 2, 3, 4, 5, 6].map(i => <i key={i} className={i <= e.danger ? 'on' : ''} />)}</span></span>
  </div>;
}
const SeenLine = ({ list }: { list: Seen[] }) => <div className="g2-seen fx-in" role="note"><Eye /><span className="fx-lbl kr">{t('game.keen.title')}</span>{list.map((s, i) => <span key={i} className="fx-pill">{t('game.keen.' + s.k)}</span>)}<small className="fx-num" title={t('game.keen.tip')}>DC {list.map(s => pad(s.dc)).join(' · ')}</small></div>;
/** 한 번에 끝난 판정 하나: 기록 카드와 같은 모양으로 보여 주고, 실패했고 운명 점이 남았으면 뒤집을 수 있다 */
function RollCard({ m, i }: { m: Msg; i: number }) {
  const sw = m.swipes[m.sw] as GameSwipe, r = sw.grolls?.[i], chat = cur.chat, g = gameOf(chat); if (!r) return null;
  const last = cur.msgs[cur.msgs.length - 1] === m, fate = g && last ? sheetOf(g, cur.msgs).fate : 0, can = !!chat && last && !r.ok && !r.rerolled && !!sw.graw && fate > 0 && !running();
  const fake = { ...m, gm: { kind: 'check' as const, ...r, ...(r.why ? { why: r.why } : {}) } } as GameMsg;
  return <div className={`g2-roll is-${r.arm}`}><GameCard m={fake} />
    {can ? <button type="button" className="g2-flip fx-tap" onClick={() => void flipFate(chat!, m, i).then(ok => { if (ok) redrawGame(); })}><b>{t('game.fate.reroll')}</b><small>{t('game.one.flipHint', { n: fate })}</small></button> : null}</div>;
}
const DiceLine = ({ m }: { m: Msg }) => { const list = (m.swipes[m.sw] as GameSwipe).gdice || []; return list.length ? <div className="g2-dice" role="note"><span className="fx-lbl kr">{t('game.slot.title')}</span>{list.map((s, i) => <span key={i} className="fx-kv" title={s.miss ? t('game.slot.miss', { name: s.miss }) : undefined}><span>{s.name ? `${s.name} · ` : ''}{s.expr}{s.miss ? ' ?' : ''}</span><i /><small className="fx-num">{s.dice.join(' ')}{s.mod ? ` ${sign(s.mod)}` : ''}</small><b>{pad(s.total)}</b></span>)}</div> : null; };
/** 메시지 위에 얹는 카드 묶음. only 를 주면 그 하나만 (게임 화면이 문단 사이에 끼워 넣을 때) */
export function TurnCards({ m, only }: { m: Msg; only?: string }) {
  const sw = m.swipes[m.sw] as GameSwipe | undefined, gt = (m as GameMsg).gt; if (!sw) return null;
  if (m.role === 'user') return gt?.miss?.length && !only ? <p className="g2 g2-miss"><span className="fx-dot" />{t('game.miss.note', { names: gt.miss.join(', ') })}</p> : null;
  const omen = sw.gturn, rolls = sw.grolls || [];
  if (only === 'omen') return <div className="g2 g2-cards">{omen?.enc ? <EncCard e={omen.enc} /> : null}{omen?.seen?.length ? <SeenLine list={omen.seen} /> : null}</div>;
  if (only?.startsWith('roll:')) return <div className="g2 g2-cards"><RollCard m={m} i={+only.slice(5)} /></div>;
  if (only === 'dice') return <div className="g2 g2-cards"><DiceLine m={m} /></div>;
  if (!omen?.enc && !omen?.seen?.length && !rolls.length && !sw.gdice?.length) return null;
  return <div className="g2 g2-cards">{omen?.enc ? <EncCard e={omen.enc} /> : null}{omen?.seen?.length ? <SeenLine list={omen.seen} /> : null}{rolls.map((_, i) => <RollCard key={i} m={m} i={i} />)}<DiceLine m={m} /></div>;
}
/** 게임 화면의 문단들 사이에 카드가 들어갈 자리를 정한다: 만남 · 눈썰미는 맨 앞, 판정은 그 갈래가 시작되는 문단 앞, 본문 속 굴림은 맨 뒤 */
export function stageParts(m: Msg, texts: string[]): { text?: string; cards?: string }[] {
  const sw = m.swipes[m.sw] as GameSwipe | undefined, out: { text?: string; cards?: string }[] = texts.map(text => ({ text }));
  if (!sw || m.role !== 'assistant') return out;
  const bare = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 14);
  [...(sw.grolls || [])].map((r, i) => ({ r, i })).reverse().forEach(({ r, i }) => { const key = bare(r.head), at = key ? out.findIndex(p => p.text && p.text.replace(/[^\p{L}\p{N}]/gu, '').includes(key)) : -1; out.splice(at < 0 ? 0 : at, 0, { cards: 'roll:' + i }); });
  if (sw.gturn?.enc || sw.gturn?.seen?.length) out.unshift({ cards: 'omen' });
  if (sw.gdice?.length) out.push({ cards: 'dice' });
  return out;
}

// ── 사기 ──
export function MoodRow({ v }: { v: number }) {
  const tier = moodTier(v);
  return <div className="g2 g2-mood" title={t('game.mood.hint')}><MoodFlag v={v} />
    <div className="g2-mood-body"><span className="fx-kv"><span className="fx-lbl kr">{t('game.mood.title')}</span><i /><b>{pad(v, 3)}</b></span>
      <div className={`fx-meter${tier <= 1 ? ' low' : tier >= 3 ? ' acc' : ''}`} style={{ '--p': v / 100 } as React.CSSProperties} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={t('game.mood.title')} />
      <div className="g2-mood-scale" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <span key={i} className={i === tier ? 'on' : ''}>{t('game.mood.' + i)}</span>)}</div>
      {tier === 0 || tier === 4 ? <small className="g2-mood-fx">{t('game.mood.fx.' + tier)}</small> : null}</div></div>;
}

// ── 수첩: 진행자가 읽는 내 메모와 만난 사람들 ──
function PersonRow({ p, s, chat }: { p: Person; s: Sheet; chat: GameChat }) {
  const g = chat.game!, tier = repTier(p.v), key = p.name.toLowerCase(), inParty = s.party.some(n => n.toLowerCase() === key), [open, setOpen] = useState(false);
  return <li className={`g2-person${open ? ' is-open' : ''}`}>
    <button type="button" className="g2-person-head fx-tap" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="g2-person-name"><b className="fx-serif">{p.name}</b>{inParty ? <em className="fx-pill on">{t('game.party')}</em> : null}</span>
      <Ladder tier={tier} /><span className="g2-person-tier">{t('game.rep.' + tier)}</span><b className="fx-num">{sign(p.v)}</b>
    </button>
    {p.role ? <p className="g2-person-role">{p.role}</p> : null}
    {open ? <div className="g2-person-more fx-in">
      {p.met ? <span className="fx-kv"><span className="fx-lbl kr">{t('game.cast.met')}</span><i /><span>{p.met}</span></span> : null}
      {p.last ? <span className="fx-kv"><span className="fx-lbl kr">{t('game.cast.last')}</span><i /><span>{has('game.verb.' + p.last) ? t('game.verb.' + p.last) : p.last}</span></span> : null}
      {p.marks.length ? <ol className="g2-marks">{p.marks.map((m, i) => <li key={i} className={m.to > m.from ? 'is-up' : 'is-down'}><span className="fx-num">{pad(i + 1)}</span><span>{t('game.rep.' + m.from)}</span><svg viewBox="0 0 28 8" width="28" height="8" className="fx-art" aria-hidden="true"><path d="M1 4h25M22.500 1 26 4l-3.500 3" /></svg><b>{t('game.rep.' + m.to)}</b></li>)}</ol> : null}
      <textarea className="inp" rows={2} defaultValue={g.npcNotes?.[key] || ''} placeholder={t('game.cast.notePh')} aria-label={t('game.cast.notePh')} onBlur={e => { const v = e.target.value.trim(); if ((g.npcNotes?.[key] || '') === v) return; g.npcNotes = { ...(g.npcNotes || {}) }; if (v) g.npcNotes[key] = v.slice(0, 600); else delete g.npcNotes[key]; void S.save('chats', chat, true); }} />
    </div> : null}
  </li>;
}
/** 빈 수첩: 펼친 공책과 깃펜 */
const EmptyBook = () => <svg viewBox="0 0 56 56" className="fx-art" aria-hidden="true"><path d="M28 16c-5-3-11-3.500-18-2v27c7-1.500 13-1 18 2 5-3 11-3.500 18-2V14c-7-1.500-13-1-18 2z" /><path d="M28 16v27" className="t" /><path d="M14 21c3-.500 6-.300 9 .700M14 26c3-.500 6-.300 9 .700M14 31c2-.300 4-.200 6 .300" className="h" /><path d="M44 8c-5 1.500-8 5-9.500 10.500l2.500 2.500c5-1.500 6.500-6 7-13z" className="p" /><path d="M41.500 11 33 20.500" className="t" /></svg>;
export function NotebookTab({ chat, s }: { chat: GameChat; s: Sheet }) {
  const g = chat.game!, names = [...s.people, ...s.party.filter(n => !s.people.some(p => p.name.toLowerCase() === n.toLowerCase())).map(n => ({ name: n, v: 0, marks: [] } as Person))];
  return <div className="g2 g2-book">
    <section><h3 className="fx-head"><span className="fx-lbl kr ink">{t('game.notes.title')}</span></h3>
      <textarea className="inp g2-notes" rows={4} defaultValue={g.notes || ''} placeholder={t('game.notes.ph')} onBlur={e => { if ((g.notes || '') !== e.target.value) { g.notes = e.target.value.slice(0, 2000); void S.save('chats', chat, true); } }} />
      <p className="hint">{t('game.notes.hint')}</p></section>
    <section><h3 className="fx-head"><span className="fx-lbl kr ink">{t('game.cast.title')}</span><span className="fx-num g2-count">{pad(names.length)}</span></h3>
      {names.length ? <ul className="g2-people fx-rows">{names.map(p => <PersonRow key={p.name} p={p} s={s} chat={chat} />)}</ul> : <div className="fx-empty"><EmptyBook /><p>{t('game.cast.empty')}</p></div>}</section>
  </div>;
}

// ── 서가: 읽을거리를 책등으로 꽂아 두고, 뽑으면 종이 한 장으로 펼친다 ──
export function Shelf({ s }: { s: Sheet }) {
  const [at, setAt] = useState(-1), doc = s.docs[at];
  if (!s.docs.length) return <div className="g2 fx-empty"><svg viewBox="0 0 56 56" className="fx-art" aria-hidden="true"><path d="M8 44h40M12 44V18h7v26M19 44V14h8v30M27 44V22h6v22" /><path d="M35 44 40.500 19l6 1.300L41 44" /><path d="M14 23h3M21 19h4M21 38h4M29 27h2" className="t" /><path d="M8 47h40" className="h" /></svg><p>{t('game.shelf.empty')}</p></div>;
  const h = (title: string) => { let n = 0; for (const c of title) n = (n * 31 + c.charCodeAt(0)) >>> 0; return n; };
  return <div className="g2 g2-shelf">
    <div className="g2-spines" role="tablist" aria-label={t('game.shelf.title')}>{s.docs.map((d, i) => { const k = h(d.title); return <button key={d.title} type="button" role="tab" aria-selected={i === at} className={`g2-spine fx-tap${i === at ? ' on' : ''}`} style={{ '--h': `${78 + k % 5 * 7}px`, '--w': `${26 + (k >> 3) % 3 * 5}px` } as React.CSSProperties} onClick={() => setAt(i === at ? -1 : i)} title={d.title}><span>{d.title}</span><i className={`is-${(k >> 5) % 3}`} /></button>; })}</div>
    <div className="fx-ticks" />
    {doc ? <article className="g2-page fx-sheet fx-frame grain fx-in" key={doc.title}><h4 className="fx-serif">{doc.title}</h4><p>{doc.text}</p><span className="fx-lbl">{pad(at + 1)} / {pad(s.docs.length)}</span></article> : <p className="hint">{t('game.shelf.hint')}</p>}
  </div>;
}

// ── 세션: 정리된 것들을 보여 주고, 다음 회에 바라는 것을 받는다 ──
export function SessionParts({ x, wish = true }: { x: SessionNote; /** 바라는 것도 보여 준다 (바로 아래에 고치는 칸이 있으면 끈다) */ wish?: boolean }) {
  const rows: [string, string[] | undefined][] = [['hooks', x.hooks], ['moments', x.moments], ['details', x.details], ['party', x.party]];
  return <div className="g2 g2-sess">{rows.map(([k, list]) => list?.length ? <div key={k}><span className="fx-lbl kr">{t('game.session.' + k)}</span><ul>{list.map((l, i) => <li key={i}>{l}</li>)}</ul></div> : null)}
    {wish && x.wish?.trim() ? <div className="g2-wish"><span className="fx-lbl kr acc">{t('game.session.wish')}</span><p>{x.wish}</p></div> : null}</div>;
}
/** 지난 이야기: 요약을 한 단락씩 읽어 준다. 누르면 넘어가고, 언제든 건너뛸 수 있다 */
export function Recap({ note, n, onDone }: { note: SessionNote; n: number; onDone(): void }) {
  const parts = (note.text.match(/[^.!?。！？\n]+[.!?。！？]*\s*/g) || [note.text]).map(x => x.trim()).filter(Boolean).reduce<string[]>((acc, sentence, i) => { if (i % 2) acc[acc.length - 1] += ' ' + sentence; else acc.push(sentence); return acc; }, []);
  const tail = note.hooks?.length ? [note.hooks.map(h => '— ' + h).join('\n')] : [], all = [...parts, ...tail], [at, setAt] = useState(0), last = at >= all.length - 1;
  return <div className="g2 g2-recap fx-night" role="dialog" aria-label={t('game.recap.title')} onClick={() => last ? onDone() : setAt(at + 1)}>
    <svg viewBox="0 0 120 24" className="fx-art g2-recap-art" aria-hidden="true"><path d="M2 12h44M74 12h44" className="t" /><path d="M60 3a9 9 0 1 0 6.400 15.300A7 7 0 0 1 60 3z" pathLength={1} className="fx-draw" /><circle cx="50" cy="12" r="1" className="f" /><circle cx="72" cy="7" r=".8" className="f fx-twinkle" /></svg>
    <span className="fx-lbl">{t('game.recap.title')} · {t('game.journal.sessionN', { n })}</span>
    <p key={at} className={`fx-serif fx-in${at >= parts.length ? ' is-hooks' : ''}`}>{all[at]}</p>
    <div className="g2-recap-foot"><span className="fx-pips round">{all.map((_, i) => <i key={i} className={i <= at ? 'on' : ''} />)}</span>
      <button type="button" className="fx-tap" onClick={e => { e.stopPropagation(); onDone(); }}>{t(last ? 'game.recap.begin' : 'game.recap.skip')}</button></div>
  </div>;
}

// ── 캠페인 뼈대 ──
const chatOf = (chat: Chat) => chat as GameChat;
/** 뼈대를 받아 온다 (요청 한 번). 답이 깨졌으면 고쳐서 다시 읽을 수 있는 창을 띄운다. 그만두면 null */
export async function draftSaga(chat: Chat): Promise<Saga | null> {
  const g = chatOf(chat).game; if (!g) return null;
  const char = S.get('chars', chat.charIds[0]), user = S.persona(chat).name || 'User';
  let raw = '';
  try { raw = await quickCall(SAGA_PROMPT, sagaBrief(g, char?.name || 'the narrator', user, String(char?.description || '')), { maxTokens: 2400, conn: S.helperConn('all' as never, chat) || S.connFor(chat), lowThink: true }); return readSaga(raw); }
  catch (e) { if (!raw) { toast(t('game.saga.failed', { error: (e instanceof Error ? e.message : String(e)).slice(0, 120) }), 'err'); return null; } return fixSaga(raw, e instanceof Error ? e.message : String(e)); }
}
/** 고쳐서 다시: 받은 글을 손으로 고쳐 다시 읽힌다 */
function fixSaga(raw: string, why: string): Promise<Saga | null> {
  return new Promise(done => {
    let text = raw, settled = false; const end = (v: Saga | null) => { if (!settled) { settled = true; done(v); } };
    openModal({ title: t('game.saga.fixTitle'), wide: true, spec: 'div.gm', onClose: () => end(null) }, close => <FixBox raw={raw} why={why} onText={v => { text = v; }} onRead={() => { try { const s = readSaga(text); end(s); close(); return ''; } catch (e) { return e instanceof Error ? e.message : String(e); } }} onSkip={() => { end(null); close(); }} />);
  });
}
function FixBox({ raw, why, onText, onRead, onSkip }: { raw: string; why: string; onText(v: string): void; onRead(): string; onSkip(): void }) {
  const [err, setErr] = useState(why);
  return <div className="g2 g2-fix"><p className="hint">{t('game.saga.fixHint')}</p><p className="g2-fix-err fx-num">{err}</p>
    <textarea className="inp mono" rows={14} defaultValue={raw} spellCheck={false} onChange={e => onText(e.target.value)} />
    <div className="gm-foot"><button type="button" className="btn ghost" onClick={onSkip}>{t('game.saga.skip')}</button><button type="button" className="btn primary" onClick={() => setErr(onRead())}>{t('game.saga.reread')}</button></div></div>;
}
/** 뼈대를 방에 적는다: 시작 지도는 길로 깔아 둔다 (가 보지 않은 곳으로 보인다) */
export function keepSaga(chat: Chat, saga: Saga) {
  const g = chatOf(chat).game; if (!g) return;
  g.saga = saga; const had = new Set((g.adj || []).filter(f => f.k === 'path').map(f => f.k === 'path' ? `${f.a}\u0001${f.b}` : ''));
  for (const f of sagaPaths(saga)) if (f.k === 'path' && !had.has(`${f.a}\u0001${f.b}`)) (g.adj ||= []).push(f);
  void S.save('chats', chat, true); redrawGame();
}
/** 가려 둔 글: 누르기 전에는 먹줄만 보인다 */
function Veiled({ label, children, open }: { label: string; children: ReactNode; open: boolean }) {
  const [show, setShow] = useState(false), on = open || show;
  return <div className={`g2-veiled${on ? ' is-open' : ''}`}><span className="fx-lbl kr">{label}</span>{on ? <div className="fx-in">{children}</div> : <button type="button" className="g2-ink fx-tap" onClick={() => setShow(true)} aria-label={t('game.saga.show')}><i /><i /><i /><span>{t('game.saga.show')}</span></button>}</div>;
}
function SagaView({ chat, close }: { chat: GameChat; close(): void }) {
  const g = chat.game!, [s, setS] = useState(g.saga), [all, setAll] = useState(false), [busy, setBusy] = useState(false);
  const again = async () => { if (s && !(await confirmBox(t('game.saga.againAsk'), t('game.saga.again')))) return; setBusy(true); try { const next = await draftSaga(chat); if (next) { keepSaga(chat, next); setS(next); setAll(false); toast(t('game.saga.done'), 'ok'); } } finally { setBusy(false); } };
  const drop = async () => { if (!(await confirmBox(t('game.saga.dropAsk'), t('game.saga.drop'), true))) return; delete g.saga; void S.save('chats', chat, true); close(); };
  if (!s) return <div className="g2 g2-saga"><div className="fx-empty"><svg viewBox="0 0 56 56" className="fx-art" aria-hidden="true"><path d="M10 46V20l18-10 18 10v26" /><path d="M10 46h36M19 46V30h18v16M28 10v36" className="t" /><path d="M10 20l18 10 18-10" className="d" /></svg><p>{t('game.saga.empty')}</p></div>
    <div className="gm-foot"><button type="button" className="btn primary" disabled={busy} onClick={() => void again()}>{busy ? t('game.saga.busy') : t('game.saga.make')}</button></div><p className="hint">{t('game.saga.cost')}</p></div>;
  return <div className="g2 g2-saga">
    <p className="hint">{t('game.saga.hint')}</p>
    <label className="gm-check"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />{t('game.saga.showAll')}</label>
    <Veiled label={t('game.saga.plot')} open={all}><p className="fx-body">{s.plot}</p></Veiled>
    {s.twists.map((x, i) => <Veiled key={i} label={t('game.saga.twist', { n: i + 1 })} open={all}><dl className="g2-twist">{(['truth', 'clue', 'cover', 'trigger'] as const).map(k => <div key={k}><dt className="fx-lbl kr">{t('game.saga.' + k)}</dt><dd>{x[k]}</dd></div>)}</dl></Veiled>)}
    {s.clocks.length ? <Veiled label={t('game.saga.clocks')} open={all}><ul className="fx-rows">{s.clocks.map(c => <li key={c.name}><span className="fx-kv"><b className="fx-serif">{c.name}</b><i /><b>0/{c.max}</b></span><small>{c.note}</small></li>)}</ul></Veiled> : null}
    {s.factions.length ? <Veiled label={t('game.saga.factions')} open={all}><ul className="fx-rows">{s.factions.map(f => <li key={f.name}><b className="fx-serif">{f.name}</b><small>{f.wants} · {f.method}</small></li>)}</ul></Veiled> : null}
    {s.seeds.length ? <Veiled label={t('game.saga.seeds')} open={all}><ul className="fx-rows">{s.seeds.map((x, i) => <li key={i}>{x}</li>)}</ul></Veiled> : null}
    {s.npcs.length ? <Veiled label={t('game.saga.npcs')} open={all}><ul className="fx-rows">{s.npcs.map(n => <li key={n.name}><b className="fx-serif">{n.name}</b><small>{n.role} · {n.wants} · {n.secret}</small></li>)}</ul></Veiled> : null}
    {s.map.length ? <Veiled label={t('game.saga.map')} open={all}><ul className="fx-rows">{s.map.map(p => <li key={p.name}><b className="fx-serif">{p.name}</b><small>{p.note}{p.links.length ? ` → ${p.links.join(', ')}` : ''}</small></li>)}</ul></Veiled> : null}
    <div className="gm-foot"><button type="button" className="btn sm ghost" onClick={() => void drop()}>{t('game.saga.drop')}</button><button type="button" className="btn sm" disabled={busy} onClick={() => void again()}>{busy ? t('game.saga.busy') : t('game.saga.again')}</button></div>
  </div>;
}
export function openSaga(chat: Chat) { openModal({ title: t('game.saga.title'), spec: 'div.gm' }, close => <SagaView chat={chatOf(chat)} close={close} />); }
