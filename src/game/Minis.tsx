// 미니게임 다섯 가지. 모두 앱이 직접 진행한다 (모델을 부르지 않는다) — 끝나면 결과만 대화에 남긴다
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
import { d, type Fx, type MiniId, type Outcome } from './state';

export interface MiniResult { outcome: Outcome; score: string; fx?: Fx[] }
export interface P { foe: string; onDone(r: MiniResult): void; /** 게임 모드일 때 걸 수 있는 골드 */ gold?: number }
/** 잠깐 뜸을 들인다 (상대가 내거나 두는 사이). 창을 닫으면 그만둔다 */
export function useLater() { const tm = useRef(0); useEffect(() => () => clearTimeout(tm.current), []); return (fn: () => void, ms: number) => { clearTimeout(tm.current); tm.current = window.setTimeout(fn, ms); }; }
const pick = <T,>(a: T[]) => a[d(a.length) - 1];
export const Score = ({ me, foe, a, b }: { me: string; foe: string; a: number | string; b: number | string }) =>
  <div className="gm-score"><span><small>{me}</small><b>{a}</b></span><i>:</i><span><small>{foe}</small><b>{b}</b></span></div>;
export const Done = ({ r, onDone }: { r: MiniResult; onDone(r: MiniResult): void }) =>
  <div className="gm-done"><b className={`gm-verdict is-${r.outcome}`}>{t('game.out.' + r.outcome)}</b><button type="button" className="btn primary" onClick={() => onDone(r)}>{t('game.mini.finish')}</button></div>;

// ── 가위바위보: 먼저 두 번 이기면 승리 ──
const HANDS = ['rock', 'scissors', 'paper'] as const, GLYPH = { rock: '✊', scissors: '✌', paper: '✋' };
function Rps({ foe, onDone }: P) {
  const [a, setA] = useState(0), [b, setB] = useState(0), [last, setLast] = useState<{ me: typeof HANDS[number]; it: typeof HANDS[number]; r: Outcome } | null>(null), [wait, setWait] = useState<typeof HANDS[number] | null>(null), later = useLater();
  const over = a >= 2 || b >= 2;
  const play = (me: typeof HANDS[number]) => {
    if (wait) return; setWait(me);
    later(() => {
      const it = pick([...HANDS]), diff = (HANDS.indexOf(it) - HANDS.indexOf(me) + 3) % 3, r: Outcome = diff === 0 ? 'draw' : diff === 1 ? 'win' : 'lose';
      setLast({ me, it, r }); setWait(null); if (r === 'win') setA(x => x + 1); if (r === 'lose') setB(x => x + 1);
    }, 520);
  };
  return <div className="gm-mini">
    <Score me={t('game.you')} foe={foe} a={a} b={b} />
    <div className="gm-table">{wait ? <><span className="gm-big">{GLYPH[wait]}</span><em>…</em><span className="gm-big gm-shake">✊</span></>
      : last ? <><span className="gm-big gm-pop">{GLYPH[last.me]}</span><em>{t('game.out.' + last.r)}</em><span className="gm-big gm-pop">{GLYPH[last.it]}</span></> : <p className="dim">{t('game.rps.hint')}</p>}</div>
    {over && !wait ? <Done r={{ outcome: a > b ? 'win' : 'lose', score: `${a} : ${b}` }} onDone={onDone} />
      : <div className="gm-acts">{HANDS.map(h => <button key={h} type="button" className="btn gm-hand" disabled={!!wait} onClick={() => play(h)}><span>{GLYPH[h]}</span>{t('game.rps.' + h)}</button>)}</div>}
  </div>;
}

// ── 주사위 대결: 2d6 을 세 번, 많이 이긴 쪽이 승리 ──
function Dice({ foe, onDone }: P) {
  const [rounds, setRounds] = useState<{ me: number[]; it: number[] }[]>([]), [spin, setSpin] = useState<number[] | null>(null), tm = useRef(0);
  useEffect(() => () => clearInterval(tm.current), []);
  const sum = (x: number[]) => x[0] + x[1], a = rounds.filter(r => sum(r.me) > sum(r.it)).length, b = rounds.filter(r => sum(r.me) < sum(r.it)).length;
  const over = rounds.length >= 3, last = rounds[rounds.length - 1];
  const roll = () => {
    if (spin) return; let n = 0; setSpin([d(6), d(6), d(6), d(6)]);
    tm.current = window.setInterval(() => { if (++n < 7) return setSpin([d(6), d(6), d(6), d(6)]); clearInterval(tm.current); setSpin(null); setRounds(r => [...r, { me: [d(6), d(6)], it: [d(6), d(6)] }]); }, 70);
  };
  const show = spin ? { me: spin.slice(0, 2), it: spin.slice(2) } : last;
  return <div className="gm-mini">
    <Score me={t('game.you')} foe={foe} a={a} b={b} />
    <div className="gm-table">{show ? <><span className={`gm-pips${spin ? ' is-spin' : ''}`}><i>{show.me[0]}</i><i>{show.me[1]}</i></span><em>{spin ? '…' : `${sum(show.me)} : ${sum(show.it)}`}</em><span className={`gm-pips${spin ? ' is-spin' : ''}`}><i>{show.it[0]}</i><i>{show.it[1]}</i></span></> : <p className="dim">{t('game.dice.hint')}</p>}</div>
    {over && !spin ? <Done r={{ outcome: a > b ? 'win' : a < b ? 'lose' : 'draw', score: `${a} : ${b}` }} onDone={onDone} />
      : <div className="gm-acts"><button type="button" className="btn primary" disabled={!!spin} onClick={roll}>{t('game.dice.roll')} · {t('game.dice.round', { n: Math.min(3, rounds.length + 1) })}</button></div>}
  </div>;
}

// ── 블랙잭: 상대가 딜러. 21 을 넘기지 않고 더 가까운 쪽이 승리 ──
export interface Card { r: string; s: string }
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUITS = ['♠', '♥', '♦', '♣'];
export const deck = () => { const all = SUITS.flatMap(s => RANKS.map(r => ({ r, s }))); for (let i = all.length - 1; i > 0; i--) { const j = d(i + 1) - 1; [all[i], all[j]] = [all[j], all[i]]; } return all; };
export const handValue = (h: Card[]) => { let v = 0, aces = 0; for (const c of h) { if (c.r === 'A') { aces++; v += 11; } else v += 'JQK'.includes(c.r) || c.r === '10' ? 10 : +c.r; } while (v > 21 && aces) { v -= 10; aces--; } return v; };
export const CardView = ({ c, down }: { c: Card; down?: boolean }) => down ? <span className="gm-card is-down" /> : <span className={`gm-card gm-pop${c.s === '♥' || c.s === '♦' ? ' is-red' : ''}`}><b>{c.r}</b><i>{c.s}</i></span>;
function Blackjack({ foe, onDone, gold = 0 }: P) {
  const dk = useRef<Card[]>([]), later = useLater();
  const [bet, setBet] = useState<number | null>(gold > 0 ? null : 0);
  const [st, setSt] = useState(() => { dk.current = deck(); return { me: [dk.current.pop()!, dk.current.pop()!], it: [dk.current.pop()!, dk.current.pop()!], stood: false, done: false }; });
  const mine = handValue(st.me), theirs = handValue(st.it), over = st.done;
  // 딜러는 17 이 될 때까지 한 장씩 뽑는다
  useEffect(() => {
    if (!st.stood || st.done) return;
    if (handValue(st.me) > 21 || handValue(st.it) >= 17) later(() => setSt(x => ({ ...x, done: true })), 350);
    else later(() => setSt(x => ({ ...x, it: [...x.it, dk.current.pop()!] })), 520);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);
  useEffect(() => { if (bet !== null && !st.stood && mine === 21) setSt(x => ({ ...x, stood: true })); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bet]);
  const hit = () => { const me = [...st.me, dk.current.pop()!]; setSt({ ...st, me, stood: handValue(me) >= 21 }); };
  const outcome: Outcome = mine > 21 ? 'lose' : theirs > 21 || mine > theirs ? 'win' : mine < theirs ? 'lose' : 'draw';
  const natural = st.me.length === 2 && mine === 21, won = bet ? (outcome === 'win' ? Math.round(bet * (natural ? 1.5 : 1)) : outcome === 'lose' ? -bet : 0) : 0;
  if (bet === null) return <div className="gm-mini">
    <p className="gm-line">{t('game.bj.betHint', { gold })}</p>
    <div className="gm-acts">{[...new Set([0, 5, 10, 25, gold].filter(n => n <= gold))].map(n => <button key={n} type="button" className={n ? 'btn' : 'btn ghost'} onClick={() => setBet(n)}>{n ? (n === gold && ![5, 10, 25].includes(n) ? t('game.bj.allIn', { n }) : `${n}`) : t('game.bj.noBet')}</button>)}</div>
  </div>;
  return <div className="gm-mini">
    <div className="gm-hands">
      <div><small>{foe}{st.stood ? ` · ${theirs}` : ''}</small><p>{st.it.map((c, i) => <CardView key={i} c={c} down={!st.stood && i > 0} />)}</p></div>
      <div><small>{t('game.you')} · {mine}{bet ? ` · ${t('game.bj.bet', { n: bet })}` : ''}</small><p>{st.me.map((c, i) => <CardView key={i} c={c} />)}</p></div>
    </div>
    {over ? <>{won ? <p className="gm-line">{t(won > 0 ? 'game.bj.won' : 'game.bj.lost', { n: Math.abs(won) })}</p> : null}<Done r={{ outcome, score: `${mine} vs ${theirs}${won ? ` (${won > 0 ? '+' : ''}${won} gold)` : ''}`, ...(won ? { fx: [{ k: 'gold' as const, n: won }] } : {}) }} onDone={onDone} /></>
      : <div className="gm-acts"><button type="button" className="btn primary" disabled={st.stood} onClick={hit}>{t('game.bj.hit')}</button><button type="button" className="btn" disabled={st.stood} onClick={() => setSt({ ...st, stood: true })}>{t('game.bj.stand')}</button></div>}
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
  const [b, setB] = useState<string[]>(() => Array(9).fill('')), [think, setThink] = useState(false), later = useLater();
  const w = winnerOf(b);
  const move = (i: number) => {
    if (b[i] || w || think) return; const n = [...b]; n[i] = 'o'; setB(n);
    if (winnerOf(n)) return; setThink(true);
    later(() => { const free = n.map((v, k) => v ? -1 : k).filter(k => k >= 0), m = [...n]; m[d(4) === 1 ? pick(free) : best([...n], 'x').i] = 'x'; setB(m); setThink(false); }, 420);
  };
  return <div className="gm-mini">
    <p className="gm-line">{w ? '' : think ? t('game.thinking', { name: foe }) : t('game.ttt.hint', { name: foe })}</p>
    <div className="gm-grid">{b.map((v, i) => <button key={i} type="button" disabled={!!v || !!w || think} onClick={() => move(i)} aria-label={String(i + 1)}>{v ? <span className="gm-pop">{v === 'o' ? '○' : '×'}</span> : ''}</button>)}</div>
    {w ? <Done r={{ outcome: w === 'o' ? 'win' : w === 'x' ? 'lose' : 'draw', score: '' }} onDone={onDone} /> : null}
  </div>;
}

// ── 오목: 9×9 판에서 다섯을 먼저 잇는다. 내가 먼저(●) ──
const GN = 9, GDIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const gAt = (b: string[], x: number, y: number) => x < 0 || y < 0 || x >= GN || y >= GN ? '#' : b[y * GN + x];
export function gomokuWin(b: string[], who: string) {
  for (let y = 0; y < GN; y++) for (let x = 0; x < GN; x++) if (b[y * GN + x] === who) for (const [dx, dy] of GDIRS) { let n = 1; while (gAt(b, x + dx * n, y + dy * n) === who) n++; if (n >= 5) return true; }
  return false;
}
/** 그 칸에 두었을 때의 값어치: 네 방향으로 이어지는 돌 수와 양 끝이 열렸는지 */
function gScore(b: string[], x: number, y: number, who: string) {
  let total = 0;
  for (const [dx, dy] of GDIRS) {
    let n = 1, open = 0, i = 1; while (gAt(b, x + dx * i, y + dy * i) === who) { n++; i++; } if (gAt(b, x + dx * i, y + dy * i) === '') open++;
    i = 1; while (gAt(b, x - dx * i, y - dy * i) === who) { n++; i++; } if (gAt(b, x - dx * i, y - dy * i) === '') open++;
    total += n >= 5 ? 100000 : n === 4 ? (open === 2 ? 12000 : open ? 1500 : 0) : n === 3 ? (open === 2 ? 900 : open ? 90 : 0) : n === 2 ? (open === 2 ? 40 : open ? 8 : 0) : open;
  }
  return total;
}
export function gomokuMove(b: string[]) {
  let bestI = -1, bestV = -1;
  for (let y = 0; y < GN; y++) for (let x = 0; x < GN; x++) { if (b[y * GN + x]) continue;
    const v = gScore(b, x, y, 'x') * 1.1 + gScore(b, x, y, 'o') + (4 - Math.max(Math.abs(x - 4), Math.abs(y - 4))) + d(3);
    if (v > bestV) { bestV = v; bestI = y * GN + x; } }
  return bestI;
}
function Gomoku({ foe, onDone }: P) {
  const [b, setB] = useState<string[]>(() => Array(GN * GN).fill('')), [think, setThink] = useState(false), [last, setLast] = useState(-1), later = useLater();
  const w = gomokuWin(b, 'o') ? 'o' : gomokuWin(b, 'x') ? 'x' : b.every(Boolean) ? 'draw' : '';
  const move = (i: number) => {
    if (b[i] || w || think) return; const n = [...b]; n[i] = 'o'; setB(n); setLast(i);
    if (gomokuWin(n, 'o') || n.every(Boolean)) return; setThink(true);
    later(() => { const m = [...n], k = gomokuMove(n); if (k >= 0) { m[k] = 'x'; setLast(k); } setB(m); setThink(false); }, 450);
  };
  const stones = b.filter(Boolean).length;
  return <div className="gm-mini">
    <p className="gm-line">{w ? '' : think ? t('game.thinking', { name: foe }) : t('game.gomoku.hint', { name: foe })}</p>
    <div className="gm-go" style={{ gridTemplateColumns: `repeat(${GN}, 1fr)` }}>{b.map((v, i) => <button key={i} type="button" disabled={!!v || !!w || think} onClick={() => move(i)} aria-label={`${i % GN + 1},${Math.floor(i / GN) + 1}`} className={i === last ? 'is-last' : ''}>{v ? <i className={v === 'o' ? 'is-me' : 'is-it'} /> : null}</button>)}</div>
    {w ? <Done r={{ outcome: w === 'o' ? 'win' : w === 'x' ? 'lose' : 'draw', score: `${stones} stones` }} onDone={onDone} /> : null}
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

// 탁자 게임은 따로 둔다 (서로 가져다 쓰므로 여기서는 아래에서 불러온다)
import { TableGame } from './Table';
export function Mini({ game, foe, onDone, gold }: { game: MiniId } & P) {
  return game === 'rps' ? <Rps foe={foe} onDone={onDone} /> : game === 'dice' ? <Dice foe={foe} onDone={onDone} /> : game === 'blackjack' ? <Blackjack foe={foe} onDone={onDone} gold={gold} />
    : game === 'poker' || game === 'uno' || game === 'chess' ? <TableGame game={game} foe={foe} onDone={onDone} /> : game === 'gomoku' ? <Gomoku foe={foe} onDone={onDone} /> : game === 'tictactoe' ? <TicTacToe foe={foe} onDone={onDone} /> : <Numbers foe={foe} onDone={onDone} />;
}
