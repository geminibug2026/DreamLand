// 미니게임 다섯 가지. 모두 앱이 직접 진행한다 (모델을 부르지 않는다) — 끝나면 결과만 대화에 남긴다
import { useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
import { d, type MiniId, type Outcome } from './state';

export interface MiniResult { outcome: Outcome; score: string }
interface P { foe: string; onDone(r: MiniResult): void }
const pick = <T,>(a: T[]) => a[d(a.length) - 1];
const Score = ({ me, foe, a, b }: { me: string; foe: string; a: number | string; b: number | string }) =>
  <div className="gm-score"><span><small>{me}</small><b>{a}</b></span><i>:</i><span><small>{foe}</small><b>{b}</b></span></div>;
const Done = ({ r, onDone }: { r: MiniResult; onDone(r: MiniResult): void }) =>
  <div className="gm-done"><b className={`gm-verdict is-${r.outcome}`}>{t('game.out.' + r.outcome)}</b><button type="button" className="btn primary" onClick={() => onDone(r)}>{t('game.mini.finish')}</button></div>;

// ── 가위바위보: 먼저 두 번 이기면 승리 ──
const HANDS = ['rock', 'scissors', 'paper'] as const, GLYPH = { rock: '✊', scissors: '✌', paper: '✋' };
function Rps({ foe, onDone }: P) {
  const [a, setA] = useState(0), [b, setB] = useState(0), [last, setLast] = useState<{ me: typeof HANDS[number]; it: typeof HANDS[number]; r: Outcome } | null>(null);
  const over = a >= 2 || b >= 2;
  const play = (me: typeof HANDS[number]) => {
    const it = pick([...HANDS]), diff = (HANDS.indexOf(it) - HANDS.indexOf(me) + 3) % 3, r: Outcome = diff === 0 ? 'draw' : diff === 1 ? 'win' : 'lose';
    setLast({ me, it, r }); if (r === 'win') setA(a + 1); if (r === 'lose') setB(b + 1);
  };
  return <div className="gm-mini">
    <Score me={t('game.you')} foe={foe} a={a} b={b} />
    <div className="gm-table">{last ? <><span className="gm-big">{GLYPH[last.me]}</span><em>{t('game.out.' + last.r)}</em><span className="gm-big">{GLYPH[last.it]}</span></> : <p className="dim">{t('game.rps.hint')}</p>}</div>
    {over ? <Done r={{ outcome: a > b ? 'win' : 'lose', score: `${a} : ${b}` }} onDone={onDone} />
      : <div className="gm-acts">{HANDS.map(h => <button key={h} type="button" className="btn gm-hand" onClick={() => play(h)}><span>{GLYPH[h]}</span>{t('game.rps.' + h)}</button>)}</div>}
  </div>;
}

// ── 주사위 대결: 2d6 을 세 번, 많이 이긴 쪽이 승리 ──
function Dice({ foe, onDone }: P) {
  const [rounds, setRounds] = useState<{ me: number[]; it: number[] }[]>([]);
  const sum = (x: number[]) => x[0] + x[1], a = rounds.filter(r => sum(r.me) > sum(r.it)).length, b = rounds.filter(r => sum(r.me) < sum(r.it)).length;
  const over = rounds.length >= 3, last = rounds[rounds.length - 1];
  return <div className="gm-mini">
    <Score me={t('game.you')} foe={foe} a={a} b={b} />
    <div className="gm-table">{last ? <><span className="gm-pips"><i>{last.me[0]}</i><i>{last.me[1]}</i></span><em>{t('game.dice.round', { n: rounds.length })}</em><span className="gm-pips"><i>{last.it[0]}</i><i>{last.it[1]}</i></span></> : <p className="dim">{t('game.dice.hint')}</p>}</div>
    {over ? <Done r={{ outcome: a > b ? 'win' : a < b ? 'lose' : 'draw', score: `${a} : ${b}` }} onDone={onDone} />
      : <div className="gm-acts"><button type="button" className="btn primary" onClick={() => setRounds([...rounds, { me: [d(6), d(6)], it: [d(6), d(6)] }])}>{t('game.dice.roll')}</button></div>}
  </div>;
}

// ── 블랙잭: 상대가 딜러. 21 을 넘기지 않고 더 가까운 쪽이 승리 ──
interface Card { r: string; s: string }
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUITS = ['♠', '♥', '♦', '♣'];
const deck = () => { const all = SUITS.flatMap(s => RANKS.map(r => ({ r, s }))); for (let i = all.length - 1; i > 0; i--) { const j = d(i + 1) - 1; [all[i], all[j]] = [all[j], all[i]]; } return all; };
export const handValue = (h: Card[]) => { let v = 0, aces = 0; for (const c of h) { if (c.r === 'A') { aces++; v += 11; } else v += 'JQK'.includes(c.r) || c.r === '10' ? 10 : +c.r; } while (v > 21 && aces) { v -= 10; aces--; } return v; };
const CardView = ({ c, down }: { c: Card; down?: boolean }) => down ? <span className="gm-card is-down" /> : <span className={`gm-card${c.s === '♥' || c.s === '♦' ? ' is-red' : ''}`}><b>{c.r}</b><i>{c.s}</i></span>;
function Blackjack({ foe, onDone }: P) {
  const dk = useRef<Card[]>([]);
  const [st, setSt] = useState(() => { dk.current = deck(); return { me: [dk.current.pop()!, dk.current.pop()!], it: [dk.current.pop()!, dk.current.pop()!], stood: false }; });
  const mine = handValue(st.me), theirs = handValue(st.it), over = st.stood || mine >= 21;
  const stand = (me = st.me) => { const it = [...st.it]; if (handValue(me) <= 21) while (handValue(it) < 17) it.push(dk.current.pop()!); setSt({ me, it, stood: true }); };
  const hit = () => { const me = [...st.me, dk.current.pop()!]; if (handValue(me) >= 21) stand(me); else setSt({ ...st, me }); };
  const outcome: Outcome = mine > 21 ? 'lose' : theirs > 21 || mine > theirs ? 'win' : mine < theirs ? 'lose' : 'draw';
  return <div className="gm-mini">
    <div className="gm-hands">
      <div><small>{foe}{over ? ` · ${theirs}` : ''}</small><p>{st.it.map((c, i) => <CardView key={i} c={c} down={!over && i > 0} />)}</p></div>
      <div><small>{t('game.you')} · {mine}</small><p>{st.me.map((c, i) => <CardView key={i} c={c} />)}</p></div>
    </div>
    {over ? <Done r={{ outcome, score: `${mine} vs ${theirs}` }} onDone={onDone} />
      : <div className="gm-acts"><button type="button" className="btn primary" onClick={hit}>{t('game.bj.hit')}</button><button type="button" className="btn" onClick={() => stand()}>{t('game.bj.stand')}</button></div>}
  </div>;
}

// ── 틱택토: 내가 먼저(○). 상대는 대체로 잘 두지만 가끔 실수한다 ──
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const winnerOf = (b: string[]) => { for (const [x, y, z] of LINES) if (b[x] && b[x] === b[y] && b[y] === b[z]) return b[x]; return b.every(Boolean) ? 'draw' : ''; };
function best(b: string[], who: string): { v: number; i: number } {
  const w = winnerOf(b); if (w) return { v: w === 'x' ? 1 : w === 'o' ? -1 : 0, i: -1 };
  let out = { v: who === 'x' ? -2 : 2, i: -1 };
  for (let i = 0; i < 9; i++) if (!b[i]) { b[i] = who; const r = best(b, who === 'x' ? 'o' : 'x').v; b[i] = ''; if (who === 'x' ? r > out.v : r < out.v) out = { v: r, i }; }
  return out;
}
function TicTacToe({ foe, onDone }: P) {
  const [b, setB] = useState<string[]>(() => Array(9).fill(''));
  const w = winnerOf(b);
  const move = (i: number) => {
    if (b[i] || w) return; const n = [...b]; n[i] = 'o';
    if (!winnerOf(n)) { const free = n.map((v, k) => v ? -1 : k).filter(k => k >= 0); n[d(4) === 1 ? pick(free) : best([...n], 'x').i] = 'x'; }
    setB(n);
  };
  return <div className="gm-mini">
    <p className="gm-line">{w ? '' : t('game.ttt.hint', { name: foe })}</p>
    <div className="gm-grid">{b.map((v, i) => <button key={i} type="button" disabled={!!v || !!w} onClick={() => move(i)} aria-label={String(i + 1)}>{v === 'o' ? '○' : v === 'x' ? '×' : ''}</button>)}</div>
    {w ? <Done r={{ outcome: w === 'o' ? 'win' : w === 'x' ? 'lose' : 'draw', score: '' }} onDone={onDone} /> : null}
  </div>;
}

// ── 숫자 야구: 상대가 정한 서로 다른 세 자리 숫자를 아홉 번 안에 맞힌다 ──
export const judge = (secret: string, guess: string) => { let s = 0, b = 0; for (let i = 0; i < 3; i++) { if (guess[i] === secret[i]) s++; else if (secret.includes(guess[i])) b++; } return { s, b }; };
const MAX_TRY = 9;
function Numbers({ foe, onDone }: P) {
  const secret = useMemo(() => { const ds = '0123456789'.split(''); let s = ''; while (s.length < 3) s += ds.splice(d(ds.length) - 1, 1)[0]; return s; }, []);
  const [tries, setTries] = useState<{ g: string; s: number; b: number }[]>([]), [g, setG] = useState('');
  const solved = tries.some(x => x.s === 3), over = solved || tries.length >= MAX_TRY, valid = /^\d{3}$/.test(g) && new Set(g).size === 3;
  const go = () => { if (!valid || over) return; setTries([...tries, { g, ...judge(secret, g) }]); setG(''); };
  return <div className="gm-mini">
    <p className="gm-line">{t('game.num.hint', { name: foe, max: MAX_TRY })}</p>
    <ol className="gm-tries">{tries.map((x, i) => <li key={i}><b>{x.g}</b><span>{x.s === 0 && x.b === 0 ? t('game.num.out') : `${x.s}S ${x.b}B`}</span></li>)}</ol>
    {over ? <><p className="gm-line">{t('game.num.answer', { n: secret })}</p><Done r={{ outcome: solved ? 'win' : 'lose', score: solved ? `${tries.length}/${MAX_TRY}` : `✗ ${MAX_TRY}/${MAX_TRY}` }} onDone={onDone} /></>
      : <form className="gm-acts" onSubmit={e => { e.preventDefault(); go(); }}><input className="inp gm-num" inputMode="numeric" maxLength={3} value={g} placeholder="123" autoFocus onChange={e => setG(e.target.value.replace(/\D/g, '').slice(0, 3))} /><button type="submit" className="btn primary" disabled={!valid}>{t('game.num.guess')}</button></form>}
  </div>;
}

export function Mini({ game, foe, onDone }: { game: MiniId } & P) {
  return game === 'rps' ? <Rps foe={foe} onDone={onDone} /> : game === 'dice' ? <Dice foe={foe} onDone={onDone} /> : game === 'blackjack' ? <Blackjack foe={foe} onDone={onDone} />
    : game === 'tictactoe' ? <TicTacToe foe={foe} onDone={onDone} /> : <Numbers foe={foe} onDone={onDone} />;
}
