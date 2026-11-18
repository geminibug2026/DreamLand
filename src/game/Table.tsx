// 탁자 게임: 포커(텍사스 홀덤 1:1) · 우노 · 체스. 규칙과 상대의 수는 모두 앱이 계산한다
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
import { d } from './state';
import { CardView, Done, RANKS, Score, deck, useLater, type Card, type P } from './Minis';

// ════════ 포커 ════════
const rv = (c: Card) => RANKS.indexOf(c.r) === 0 ? 14 : RANKS.indexOf(c.r) + 1;
/** 일곱 장에서 가장 좋은 다섯 장의 값. 앞에서부터 견주어 큰 쪽이 이긴다 ([족보, 그다음에 견줄 숫자들]) */
export function pokerRank(cards: Card[]): number[] {
  const vs = cards.map(rv).sort((a, b) => b - a), cnt = new Map<number, number>(); for (const v of vs) cnt.set(v, (cnt.get(v) || 0) + 1);
  const groups = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const straight = (arr: number[]) => { const u = [...new Set(arr)].sort((a, b) => b - a); if (u.includes(14)) u.push(1); for (let i = 0; i + 4 < u.length; i++) if (u[i] - u[i + 4] === 4) return u[i]; return 0; };
  const suit = ['♠', '♥', '♦', '♣'].find(s => cards.filter(c => c.s === s).length >= 5), fv = suit ? cards.filter(c => c.s === suit).map(rv).sort((a, b) => b - a) : [];
  if (suit) { const sf = straight(fv); if (sf) return [8, sf]; }
  const [g0, g1] = groups, rest = (...skip: number[]) => vs.filter(v => !skip.includes(v));
  if (g0[1] === 4) return [7, g0[0], rest(g0[0])[0]];
  if (g0[1] === 3 && g1 && g1[1] >= 2) return [6, g0[0], g1[0]];
  if (suit) return [5, ...fv.slice(0, 5)];
  const st = straight(vs); if (st) return [4, st];
  if (g0[1] === 3) return [3, g0[0], ...rest(g0[0]).slice(0, 2)];
  if (g0[1] === 2 && g1 && g1[1] === 2) { const hi = Math.max(g0[0], g1[0]), lo = Math.min(g0[0], g1[0]); return [2, hi, lo, rest(hi, lo)[0]]; }
  if (g0[1] === 2) return [1, g0[0], ...rest(g0[0]).slice(0, 3)];
  return [0, ...vs.slice(0, 5)];
}
export const cmpRank = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0); return 0; };
const HANDS = 5, ANTE = 5, BET = 10;
interface PokerSt { me: Card[]; it: Card[]; board: Card[]; street: number; pot: number; mine: number; theirs: number; toCall: number; hand: number; note: string; end: '' | 'me' | 'it' | 'tie' | 'fold-me' | 'fold-it' }
function Poker({ foe, onDone }: P) {
  const later = useLater();
  const deal = (hand: number, mine: number, theirs: number): PokerSt => { const dk = deck(), a = Math.min(ANTE, mine, theirs); return { me: [dk.pop()!, dk.pop()!], it: [dk.pop()!, dk.pop()!], board: [dk.pop()!, dk.pop()!, dk.pop()!, dk.pop()!, dk.pop()!], street: 0, pot: a * 2, mine: mine - a, theirs: theirs - a, toCall: 0, hand, note: '', end: '' }; };
  const [s, setS] = useState<PokerSt>(() => deal(1, 100, 100)), [wait, setWait] = useState(false);
  const shown = s.board.slice(0, [0, 3, 4, 5][s.street]);
  /** 상대가 자기 패를 얼마나 좋게 보는지 (0~1) */
  const strength = (st: PokerSt) => { const b = st.board.slice(0, [0, 3, 4, 5][st.street]); if (!b.length) { const [x, y] = st.it.map(rv); return Math.min(1, (x + y) / 30 + (x === y ? .35 : 0) + (st.it[0].s === st.it[1].s ? .05 : 0)); } const r = pokerRank([...st.it, ...b]); return [.18 + r[1] / 100, .5, .7, .82, .92, .95, .98, 1, 1][r[0]]; };
  const finish = (st: PokerSt): PokerSt => { const c = cmpRank(pokerRank([...st.me, ...st.board]), pokerRank([...st.it, ...st.board])); return c > 0 ? { ...st, street: 3, mine: st.mine + st.pot, pot: 0, end: 'me' } : c < 0 ? { ...st, street: 3, theirs: st.theirs + st.pot, pot: 0, end: 'it' } : { ...st, street: 3, mine: st.mine + st.pot / 2, theirs: st.theirs + st.pot / 2, pot: 0, end: 'tie' }; };
  const next = (st: PokerSt): PokerSt => st.street >= 3 ? finish(st) : { ...st, street: st.street + 1, toCall: 0, note: '' };
  /** 한 번의 판돈 올리기가 끝난 뒤: 둘 중 하나가 칩이 없으면 남은 장을 다 깔고 승부한다 */
  const settle = (st: PokerSt) => setS(st.end ? st : (st.mine <= 0 || st.theirs <= 0) && !st.toCall ? finish(st) : st);
  const act = (kind: 'check' | 'bet' | 'call' | 'fold') => {
    if (s.end || wait) return;
    if (kind === 'fold') return setS({ ...s, theirs: s.theirs + s.pot, pot: 0, end: 'fold-me' });
    if (kind === 'call') { const pay = Math.min(s.toCall, s.mine); return settle(next({ ...s, mine: s.mine - pay, pot: s.pot + pay, toCall: 0 })); }
    const bet = kind === 'bet' ? Math.min(BET, s.mine, s.theirs) : 0, mid: PokerSt = { ...s, mine: s.mine - bet, pot: s.pot + bet, note: '' };
    setS(mid); setWait(true);
    later(() => {   // 상대가 생각한 뒤 답한다
      setWait(false); const v = strength(mid), r = Math.random();
      if (bet) {
        if (v < .34 && r > .12) return setS({ ...mid, mine: mid.mine + mid.pot, pot: 0, end: 'fold-it' });
        const pay = Math.min(bet, mid.theirs), called: PokerSt = { ...mid, theirs: mid.theirs - pay, pot: mid.pot + pay };
        if (v > .78 && called.theirs > 0 && called.mine > 0) { const up = Math.min(BET, called.theirs, called.mine); return setS({ ...called, theirs: called.theirs - up, pot: called.pot + up, toCall: up, note: t('game.poker.raised', { name: foe, n: up }) }); }
        return settle(next({ ...called, note: t('game.poker.called', { name: foe }) }));
      }
      if ((v > .56 || r < .14) && mid.theirs > 0 && mid.mine > 0) { const up = Math.min(BET, mid.theirs, mid.mine); return setS({ ...mid, theirs: mid.theirs - up, pot: mid.pot + up, toCall: up, note: t('game.poker.bet', { name: foe, n: up }) }); }
      settle(next({ ...mid, note: t('game.poker.checked', { name: foe }) }));
    }, 650);
  };
  const matchOver = !!s.end && (s.hand >= HANDS || s.mine <= 0 || s.theirs <= 0), HAND = ['high', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'full', 'quads', 'sflush'];
  const name = (cs: Card[]) => t('game.poker.hand.' + HAND[pokerRank(cs)[0]]);
  const showIt = s.end === 'me' || s.end === 'it' || s.end === 'tie';
  return <div className="gm-mini gm-poker">
    <Score me={t('game.you')} foe={foe} a={s.mine} b={s.theirs} />
    <div className="gm-hands">
      <div><small>{foe}{showIt ? ` · ${name([...s.it, ...s.board])}` : ''}</small><p>{s.it.map((c, i) => <CardView key={i} c={c} down={!showIt} />)}</p></div>
      <div className="gm-board5"><small>{t('game.poker.pot', { n: s.pot })} · {t('game.poker.handN', { n: s.hand, max: HANDS })}</small><p>{s.board.map((c, i) => <CardView key={i} c={c} down={i >= shown.length} />)}</p></div>
      <div><small>{t('game.you')} · {name([...s.me, ...shown])}</small><p>{s.me.map((c, i) => <CardView key={i} c={c} />)}</p></div>
    </div>
    <p className="gm-line">{s.end ? t('game.poker.end.' + s.end, { name: foe }) : wait ? t('game.thinking', { name: foe }) : s.note}</p>
    {matchOver ? <Done r={{ outcome: s.mine > s.theirs ? 'win' : s.mine < s.theirs ? 'lose' : 'draw', score: `${s.mine} : ${s.theirs}` }} onDone={onDone} />
      : s.end ? <div className="gm-acts"><button type="button" className="btn primary" onClick={() => setS(deal(s.hand + 1, s.mine, s.theirs))}>{t('game.poker.nextHand')}</button></div>
        : s.toCall ? <div className="gm-acts"><button type="button" className="btn primary" disabled={wait} onClick={() => act('call')}>{t('game.poker.call', { n: Math.min(s.toCall, s.mine) })}</button><button type="button" className="btn" disabled={wait} onClick={() => act('fold')}>{t('game.poker.fold')}</button></div>
          : <div className="gm-acts"><button type="button" className="btn" disabled={wait} onClick={() => act('check')}>{t('game.poker.check')}</button><button type="button" className="btn primary" disabled={wait || s.mine <= 0 || s.theirs <= 0} onClick={() => act('bet')}>{t('game.poker.betN', { n: Math.min(BET, s.mine, s.theirs) })}</button><button type="button" className="btn ghost" disabled={wait} onClick={() => act('fold')}>{t('game.poker.fold')}</button></div>}
  </div>;
}

// ════════ 우노 ════════
type UColor = 'r' | 'y' | 'g' | 'b';
interface UCard { c: UColor | 'w'; v: string; id: number }
const UCOLORS: UColor[] = ['r', 'y', 'g', 'b'];
function unoDeck(): UCard[] {
  const all: UCard[] = []; let id = 0;
  for (const c of UCOLORS) { all.push({ c, v: '0', id: id++ }); for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', '+2']) { all.push({ c, v, id: id++ }); all.push({ c, v, id: id++ }); } }
  for (let i = 0; i < 4; i++) { all.push({ c: 'w', v: 'wild', id: id++ }); all.push({ c: 'w', v: '+4', id: id++ }); }
  for (let i = all.length - 1; i > 0; i--) { const j = d(i + 1) - 1; [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}
export const unoPlayable = (c: UCard, top: UCard, color: UColor) => c.c === 'w' || c.c === color || c.v === top.v;
const face = (c: UCard) => c.v === 'skip' ? '⊘' : c.v === 'rev' ? '⇄' : c.v === 'wild' ? '★' : c.v;
const Ucard = ({ c, on, onClick }: { c: UCard; on?: boolean; onClick?: () => void }) => <button type="button" className={`gm-uno is-${c.c}${on ? ' is-on' : ''}`} disabled={!onClick || !on} onClick={onClick} aria-label={`${c.c} ${c.v}`}><b>{face(c)}</b></button>;
interface UnoSt { me: UCard[]; it: UCard[]; pile: UCard[]; top: UCard; color: UColor; turn: 'me' | 'it'; drew: boolean; pick: UCard | null; note: string }
function Uno({ foe, onDone }: P) {
  const later = useLater();
  const [s, setS] = useState<UnoSt>(() => { const pile = unoDeck(), me = pile.splice(0, 7), it = pile.splice(0, 7); let i = pile.findIndex(c => c.c !== 'w' && !['skip', 'rev', '+2'].includes(c.v)); if (i < 0) i = 0; const top = pile.splice(i, 1)[0]; return { me, it, pile, top, color: top.c as UColor, turn: 'me', drew: false, pick: null, note: '' }; });
  const over = !s.me.length || !s.it.length;
  const take = (st: UnoSt, n: number): UCard[] => { const out: UCard[] = []; for (let i = 0; i < n; i++) { if (!st.pile.length) st.pile = unoDeck().filter(c => !st.me.some(x => x.id === c.id) && !st.it.some(x => x.id === c.id) && c.id !== st.top.id); const c = st.pile.pop(); if (c) out.push(c); } return out; };
  /** 카드를 낸다. 둘이서 하므로 건너뛰기 · 뒤집기 · +2 · +4 는 모두 "상대가 한 차례 쉰다" */
  const play = (st0: UnoSt, who: 'me' | 'it', card: UCard, color?: UColor): UnoSt => {
    const st: UnoSt = { ...st0, me: [...st0.me], it: [...st0.it], pile: [...st0.pile], pick: null, drew: false }, hand = who === 'me' ? st.me : st.it, other = who === 'me' ? st.it : st.me;
    hand.splice(hand.findIndex(c => c.id === card.id), 1); st.top = card; st.color = card.c === 'w' ? color! : card.c;
    const n = card.v === '+2' ? 2 : card.v === '+4' ? 4 : 0; if (n) other.push(...take(st, n));
    const again = n > 0 || card.v === 'skip' || card.v === 'rev';
    st.turn = again ? who : who === 'me' ? 'it' : 'me'; st.note = again && hand.length ? t(who === 'me' ? 'game.uno.again' : 'game.uno.foeAgain', { name: foe }) : '';
    return st;
  };
  useEffect(() => {   // 상대의 차례: 낼 수 있으면 내고(공격 카드부터), 없으면 한 장 뽑는다
    if (s.turn !== 'it' || over) return;
    later(() => setS(st => {
      if (st.turn !== 'it') return st;
      const can = st.it.filter(c => unoPlayable(c, st.top, st.color)).sort((a, b) => +(b.c !== 'w') - +(a.c !== 'w') || +isNaN(+b.v) - +isNaN(+a.v));
      const best = () => UCOLORS.map(c => [c, st.it.filter(x => x.c === c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
      if (can.length) return play(st, 'it', can[0], best());
      const n: UnoSt = { ...st, it: [...st.it], pile: [...st.pile] }, got = take(n, 1); n.it.push(...got);
      if (got[0] && unoPlayable(got[0], n.top, n.color)) return play(n, 'it', got[0], best());
      return { ...n, turn: 'me', drew: false, note: t('game.uno.foeDrew', { name: foe }) };
    }), 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.turn, s.it.length, s.top.id, over]);
  const tap = (c: UCard) => { if (s.turn !== 'me' || over || s.pick || !unoPlayable(c, s.top, s.color)) return; if (c.c === 'w') setS({ ...s, pick: c }); else setS(play(s, 'me', c)); };
  const draw = () => { if (s.turn !== 'me' || over || s.drew || s.pick) return; const n: UnoSt = { ...s, me: [...s.me], pile: [...s.pile] }, got = take(n, 1); n.me.push(...got); setS(got[0] && unoPlayable(got[0], n.top, n.color) ? { ...n, drew: true, note: t('game.uno.drewCan') } : { ...n, turn: 'it', note: '' }); };
  return <div className="gm-mini gm-unobox">
    <Score me={t('game.you')} foe={foe} a={s.me.length} b={s.it.length} />
    <div className="gm-table"><span className="gm-uno is-back"><b>{s.it.length}</b></span><em className={`gm-unocolor is-${s.color}`}>{t('game.uno.color.' + s.color)}</em><span className={`gm-uno is-${s.top.c === 'w' ? s.color : s.top.c}`}><b>{face(s.top)}</b></span></div>
    <p className="gm-line">{over ? '' : s.pick ? t('game.uno.pick') : s.turn === 'it' ? t('game.thinking', { name: foe }) : s.note || t('game.uno.hint')}</p>
    {s.pick ? <div className="gm-acts">{UCOLORS.map(c => <button key={c} type="button" className={`btn gm-unopick is-${c}`} onClick={() => setS(play(s, 'me', s.pick!, c))}>{t('game.uno.color.' + c)}</button>)}</div> : null}
    <div className="gm-unohand">{s.me.map(c => <Ucard key={c.id} c={c} on={s.turn === 'me' && !over && !s.pick && unoPlayable(c, s.top, s.color)} onClick={() => tap(c)} />)}</div>
    {over ? <Done r={{ outcome: s.me.length ? 'lose' : 'win', score: `${s.me.length} : ${s.it.length}` }} onDone={onDone} />
      : <div className="gm-acts">{s.drew ? <button type="button" className="btn" onClick={() => setS({ ...s, turn: 'it', drew: false, note: '' })}>{t('game.uno.pass')}</button> : <button type="button" className="btn" disabled={s.turn !== 'me' || !!s.pick} onClick={draw}>{t('game.uno.draw')}</button>}</div>}
  </div>;
}

// ════════ 체스 ════════
// 판은 64칸 배열 (0 = a8 … 63 = h1). 대문자는 흰 말(나), 소문자는 검은 말(상대)
export interface ChessSt { b: string[]; white: boolean; castle: string; ep: number }
export interface Move { f: number; t: number; ep?: boolean; cs?: 'k' | 'q'; promo?: boolean }
export const chessStart = (): ChessSt => ({ b: 'rnbqkbnrpppppppp' .split('').concat(Array(32).fill(''), 'PPPPPPPPRNBQKBNR'.split('')), white: true, castle: 'KQkq', ep: -1 });
const isW = (p: string) => p !== '' && p === p.toUpperCase(), X = (i: number) => i % 8, Y = (i: number) => i >> 3, at = (x: number, y: number) => x < 0 || y < 0 || x > 7 || y > 7 ? -1 : y * 8 + x;
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** 그 칸이 by 쪽 말의 공격을 받는가 */
export function attacked(b: string[], sq: number, byWhite: boolean): boolean {
  const x = X(sq), y = Y(sq), own = (p: string) => p !== '' && isW(p) === byWhite, is = (i: number, k: string) => i >= 0 && own(b[i]) && b[i].toLowerCase() === k;
  const py = byWhite ? y + 1 : y - 1; if (is(at(x - 1, py), 'p') || is(at(x + 1, py), 'p')) return true;
  for (const [dx, dy] of KN) if (is(at(x + dx, y + dy), 'n')) return true;
  for (const [dx, dy] of [...DIAG, ...ORTH]) if (is(at(x + dx, y + dy), 'k')) return true;
  for (const [dirs, ks] of [[DIAG, 'bq'], [ORTH, 'rq']] as const) for (const [dx, dy] of dirs) for (let n = 1; n < 8; n++) { const i = at(x + dx * n, y + dy * n); if (i < 0) break; if (b[i]) { if (own(b[i]) && ks.includes(b[i].toLowerCase())) return true; break; } }
  return false;
}
export function chessApply(s: ChessSt, m: Move): ChessSt {
  const b = [...s.b], p = b[m.f]; let castle = s.castle, ep = -1;
  b[m.t] = m.promo ? (isW(p) ? 'Q' : 'q') : p; b[m.f] = '';
  if (m.ep) b[at(X(m.t), Y(m.f))] = '';
  if (m.cs) { const y = Y(m.f), [rf, rt] = m.cs === 'k' ? [at(7, y), at(5, y)] : [at(0, y), at(3, y)]; b[rt] = b[rf]; b[rf] = ''; }
  if (p.toLowerCase() === 'p' && Math.abs(m.t - m.f) === 16) ep = (m.f + m.t) / 2;
  if (p === 'K') castle = castle.replace(/[KQ]/g, ''); if (p === 'k') castle = castle.replace(/[kq]/g, '');
  for (const [sq, c] of [[56, 'Q'], [63, 'K'], [0, 'q'], [7, 'k']] as const) if (m.f === sq || m.t === sq) castle = castle.replace(c, '');
  return { b, white: !s.white, castle, ep };
}
const kingOf = (b: string[], white: boolean) => b.indexOf(white ? 'K' : 'k');
/** 둘 수 있는 수 (자기 왕이 잡히는 수는 뺀다) */
export function chessMoves(s: ChessSt): Move[] {
  const out: Move[] = [], { b, white } = s, mine = (p: string) => p !== '' && isW(p) === white, foe = (p: string) => p !== '' && isW(p) !== white;
  for (let f = 0; f < 64; f++) { const p = b[f]; if (!mine(p)) continue; const x = X(f), y = Y(f), k = p.toLowerCase();
    const slide = (dirs: number[][], far: boolean) => { for (const [dx, dy] of dirs) for (let n = 1; n < (far ? 8 : 2); n++) { const i = at(x + dx * n, y + dy * n); if (i < 0 || mine(b[i])) break; out.push({ f, t: i }); if (b[i]) break; } };
    if (k === 'p') { const dy = white ? -1 : 1, start = white ? 6 : 1, last = white ? 0 : 7, one = at(x, y + dy);
      if (one >= 0 && !b[one]) { out.push({ f, t: one, promo: Y(one) === last }); const two = at(x, y + dy * 2); if (y === start && !b[two]) out.push({ f, t: two }); }
      for (const dx of [-1, 1]) { const i = at(x + dx, y + dy); if (i < 0) continue; if (foe(b[i])) out.push({ f, t: i, promo: Y(i) === last }); else if (i === s.ep) out.push({ f, t: i, ep: true }); } }
    else if (k === 'n') slide(KN, false); else if (k === 'b') slide(DIAG, true); else if (k === 'r') slide(ORTH, true); else if (k === 'q') slide([...DIAG, ...ORTH], true);
    else { slide([...DIAG, ...ORTH], false);
      if (!attacked(b, f, !white)) { const [ks, qs] = white ? ['K', 'Q'] : ['k', 'q'];
        if (s.castle.includes(ks) && !b[f + 1] && !b[f + 2] && !attacked(b, f + 1, !white) && !attacked(b, f + 2, !white)) out.push({ f, t: f + 2, cs: 'k' });
        if (s.castle.includes(qs) && !b[f - 1] && !b[f - 2] && !b[f - 3] && !attacked(b, f - 1, !white) && !attacked(b, f - 2, !white)) out.push({ f, t: f - 2, cs: 'q' }); } }
  }
  return out.filter(m => { const n = chessApply(s, m); return !attacked(n.b, kingOf(n.b, white), !white); });
}
const VAL: Record<string, number> = { p: 100, n: 310, b: 320, r: 500, q: 900, k: 0 };
/** 검은 쪽(상대)에게 좋을수록 큰 값: 말의 값 + 가운데로 나온 정도 */
function chessEval(b: string[]): number { let v = 0; for (let i = 0; i < 64; i++) { const p = b[i]; if (!p) continue; const k = p.toLowerCase(), c = 3.5 - Math.max(Math.abs(X(i) - 3.5), Math.abs(Y(i) - 3.5)), val = VAL[k] + (k === 'p' ? (isW(p) ? 6 - Y(i) : Y(i) - 1) * 6 : k === 'k' ? 0 : c * 6); v += isW(p) ? -val : val; } return v; }
function search(s: ChessSt, depth: number, alpha: number, beta: number): number {
  const moves = chessMoves(s); if (!moves.length) return attacked(s.b, kingOf(s.b, s.white), !s.white) ? (s.white ? 99999 : -99999) : 0;
  if (!depth) return chessEval(s.b);
  moves.sort((a, b) => +!!s.b[b.t] - +!!s.b[a.t]);
  if (!s.white) { let best = -Infinity; for (const m of moves) { best = Math.max(best, search(chessApply(s, m), depth - 1, alpha, beta)); alpha = Math.max(alpha, best); if (alpha >= beta) break; } return best; }
  let best = Infinity; for (const m of moves) { best = Math.min(best, search(chessApply(s, m), depth - 1, alpha, beta)); beta = Math.min(beta, best); if (alpha >= beta) break; } return best;
}
/** 상대(검은 쪽)의 수: 두 수 앞까지 내다보고, 비슷한 수 가운데서는 고른다 */
export function chessReply(s: ChessSt): Move | null {
  const moves = chessMoves(s); if (!moves.length) return null;
  const scored = moves.map(m => ({ m, v: search(chessApply(s, m), 2, -Infinity, Infinity) + d(12) })).sort((a, b) => b.v - a.v);
  return scored[0].m;
}
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
function Chess({ foe, onDone }: P) {
  const [s, setS] = useState<ChessSt>(chessStart), [sel, setSel] = useState(-1), [last, setLast] = useState<number[]>([]), [think, setThink] = useState(false), later = useLater(), count = useRef(0);
  const moves = useMemo(() => chessMoves(s), [s]), check = attacked(s.b, kingOf(s.b, s.white), !s.white);
  // 체크: 몰린 킹과 그 킹을 노리는 말을 찾아 둔다
  const kingSq = check ? kingOf(s.b, s.white) : -1;
  const checkers = useMemo(() => { if (kingSq < 0) return [] as number[]; const out: number[] = []; for (let i = 0; i < 64; i++) { const p = s.b[i]; if (!p || isW(p) === s.white) continue; const b = s.b.map((q, j) => q && j !== i && isW(q) !== s.white ? (s.white ? 'P' : 'p') : q); if (attacked(b, kingSq, !s.white)) out.push(i); } return out; }, [s, kingSq]);
  const [stuck, setStuck] = useState(false);
  const end = !moves.length ? (check ? (s.white ? 'lose' : 'win') : 'draw') : count.current >= 200 ? 'draw' : '';
  const targets = sel >= 0 ? moves.filter(m => m.f === sel) : [];
  const tap = (i: number) => {
    if (!s.white || end || think) return;
    const m = targets.find(x => x.t === i);
    if (!m) { const mine = isW(s.b[i]) && s.b[i] !== ''; setStuck(mine && check && !moves.some(x => x.f === i)); return setSel(mine ? i : -1); }
    setStuck(false);
    const n = chessApply(s, m); count.current++; setS(n); setSel(-1); setLast([m.f, m.t]); setThink(true);
    later(() => { const r = chessReply(n); if (r) { count.current++; setS(chessApply(n, r)); setLast([r.f, r.t]); } setThink(false); }, 350);
  };
  return <div className="gm-mini">
    <p className={`gm-line${check && !end ? ' is-check' : ''}`} role="status">{end ? t(end === 'draw' ? (check || moves.length ? 'game.chess.draw' : 'game.chess.stale') : 'game.chess.mate') : check && !s.white ? t('game.chess.gave', { name: foe }) : think ? t('game.thinking', { name: foe }) : check ? t(stuck ? 'game.chess.stuck' : 'game.chess.check') : t('game.chess.hint', { name: foe })}</p>
    <div className="gm-chess">{s.b.map((p, i) => <button key={i} type="button" onClick={() => tap(i)} aria-label={`${'abcdefgh'[X(i)]}${8 - Y(i)} ${p}`}
      className={`${(X(i) + Y(i)) % 2 ? 'is-dark' : ''}${sel === i ? ' is-sel' : ''}${targets.some(m => m.t === i) ? ' is-to' : ''}${last.includes(i) ? ' is-last' : ''}${p ? (isW(p) ? ' is-w' : ' is-b') : ''}${i === kingSq ? (end ? ' is-mate' : ' is-check') : ''}${checkers.includes(i) ? ' is-threat' : ''}${check && s.white && !end && !think && sel < 0 && moves.some(m => m.f === i) ? ' is-can' : ''}`}>{p ? GLYPH[p.toLowerCase()] : ''}</button>)}</div>
    {end ? <Done r={{ outcome: end as 'win' | 'lose' | 'draw', score: `${Math.ceil(count.current / 2)} moves` }} onDone={onDone} />
      : <div className="gm-acts"><button type="button" className="btn ghost" onClick={() => onDone({ outcome: 'lose', score: 'resigned' })}>{t('game.chess.resign')}</button></div>}
  </div>;
}

export function TableGame({ game, foe, onDone }: { game: 'poker' | 'uno' | 'chess' } & P) {
  return game === 'poker' ? <Poker foe={foe} onDone={onDone} /> : game === 'uno' ? <Uno foe={foe} onDone={onDone} /> : <Chess foe={foe} onDone={onDone} />;
}
