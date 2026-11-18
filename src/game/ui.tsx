// 게임 모드의 화면: 시작 창 · 시트 · 입력창 위의 띠 · 대화에 남는 기록 카드 · 미니게임 고르기
import { useState } from 'react';
import type { Chat, Msg } from '../lib/types';
import { Icon } from '../kit';
import { S, newMsg } from '../lib/core';
import { openModal } from '../addons/parts';
import { promptBox, toast } from '../ui';
import { t } from '../i18n';
import { bump, cur, useCh } from '../chat/store';
import { chatApi, generate, running } from '../chat/actions';
import { Combat } from './Combat';
import { Mini } from './Minis';
import { MINIS, PRESETS, STATS, gameOf, newGame, pendingAsk, recText, rollCheck, sheetOf, type Ask, type Fx, type GameCfg, type GameChat, type GameMsg, type GameRec, type MiniId, type StatKey } from './state';

const foeName = (chat: Chat) => S.get('chars', chat.charIds[0])?.name || t('game.foe');
const userName = (chat: Chat) => S.persona(chat).name || 'User';
const sign = (n: number) => (n >= 0 ? '+' : '') + n;
export const redrawGame = () => bump('game');
const saveChat = (chat: Chat) => { void S.save('chats', chat, true); redrawGame(); };

/** 기록을 대화에 남기고, 이어서 답을 받는다 */
async function record(chat: Chat, rec: GameRec, reply = true) {
  const first = S.get('chars', chat.charIds[0]);
  const m = newMsg('system', recText(rec, userName(chat), foeName(chat)), { gm: rec, charId: first?.id || '', name: first?.name || '' } as Partial<Msg>);
  if (cur.chat === chat && chatApi.push) await chatApi.push(m); else { const msgs = await S.msgs(chat.id); msgs.push(m); await S.saveMsgs(chat, msgs); }
  redrawGame();
  if (reply && cur.chat === chat && !running()) void generate('normal');
}

// ── 미니게임 ──
export function playMini(chat: Chat, game: MiniId, stake = '') {
  const box = openModal({ title: t('game.mini.' + game), spec: 'div.gm' }, close => <Mini game={game} foe={foeName(chat)} onDone={r => { close(); void record(chat, { kind: 'play', game, outcome: r.outcome, score: r.score, ...(stake ? { stake } : {}) }); }} />);
  return box;
}
export function openMiniPicker(chat: Chat) {
  openModal({ title: t('game.mini.title'), spec: 'div.gm' }, close => <div className="gm-pick">
    <p className="hint">{t('game.mini.pickHint', { name: foeName(chat) })}</p>
    {MINIS.map(id => <button key={id} type="button" className="gm-pick-row" onClick={() => { close(); playMini(chat, id); }}><b>{t('game.mini.' + id)}</b><span>{t('game.mini.' + id + '.rule')}</span></button>)}
  </div>);
}

// ── 진행자가 맡긴 일 ──
export function resolveAsk(chat: Chat, ask: Ask) {
  const g = gameOf(chat); if (!g || running()) return;
  if (ask.k === 'check') { const r = rollCheck(g, ask.stat, ask.dc); return void record(chat, { kind: 'check', stat: ask.stat, dc: ask.dc, ...r, ...(ask.why ? { why: ask.why } : {}) }); }
  if (ask.k === 'play') return void playMini(chat, ask.game, ask.stake);
  const sheet = sheetOf(g, cur.msgs);
  openModal({ title: t('game.fight.title', { name: ask.name }), spec: 'div.gm' }, close => <Combat g={g} sheet={sheet} foe={ask} onDone={r => { close(); void record(chat, { kind: 'fight', name: ask.name, outcome: r.outcome, rounds: r.rounds, took: r.took, hp: r.hp, hpMax: sheet.hpMax, fx: r.fx }); }} />);
}

// ── 시작 · 설정 창 ──
const GENRES = ['fantasy', 'modern', 'scifi', 'horror', 'wuxia', 'school', 'mystery'];
function Setup({ chat, close }: { chat: GameChat; close(): void }) {
  const editing = !!gameOf(chat);
  const [g, setG] = useState<GameCfg>(() => structuredClone(chat.game?.on ? chat.game : { ...newGame(), hero: '' }));
  const [items, setItems] = useState(() => g.items.join(', '));
  const set = <K extends keyof GameCfg>(k: K, v: GameCfg[K]) => setG({ ...g, [k]: v });
  const preset = Object.keys(PRESETS).find(k => STATS.every(s => PRESETS[k][s] === g.stats[s])) || '';
  const done = () => {
    const next: GameCfg = { ...g, on: true, hpMax: Math.max(1, Math.round(g.hpMax) || 20), gold: Math.max(0, Math.round(g.gold) || 0), items: items.split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 20), adj: editing ? g.adj || [] : [] };
    chat.game = next; saveChat(chat); close();
    if (!editing) void record(chat, { kind: 'start' });
  };
  return <div className="gm-setup">
    <p className="hint">{t(editing ? 'game.setup.editHint' : 'game.setup.hint', { name: foeName(chat) })}</p>
    <label className="field"><span className="field-label">{t('game.setup.genre')}</span>
      <input className="inp" value={g.genre} placeholder={t('game.setup.genrePh')} onChange={e => set('genre', e.target.value)} />
      <span className="gm-chips">{GENRES.map(k => <button key={k} type="button" className={`chip${g.genre === t('game.genre.' + k) ? ' on' : ''}`} onClick={() => set('genre', t('game.genre.' + k))}>{t('game.genre.' + k)}</button>)}</span></label>
    <label className="field"><span className="field-label">{t('game.setup.tone')}</span><input className="inp" value={g.tone} placeholder={t('game.setup.tonePh')} onChange={e => set('tone', e.target.value)} /></label>
    <label className="field"><span className="field-label">{t('game.setup.hero')}</span><input className="inp" value={g.hero} placeholder={t('game.setup.heroPh')} onChange={e => set('hero', e.target.value)} /></label>
    <label className="field"><span className="field-label">{t('game.setup.goal')}</span><input className="inp" value={g.goal} placeholder={t('game.setup.goalPh')} onChange={e => set('goal', e.target.value)} /></label>
    <div className="gm-cols">
      <label className="field"><span className="field-label">{t('game.setup.diff')}</span>
        <select className="inp" value={g.diff} onChange={e => set('diff', e.target.value as GameCfg['diff'])}>{(['easy', 'normal', 'hard'] as const).map(k => <option key={k} value={k}>{t('game.diff.' + k)}</option>)}</select></label>
      <label className="field"><span className="field-label">{t('game.setup.preset')}</span>
        <select className="inp" value={preset} onChange={e => { if (PRESETS[e.target.value]) set('stats', { ...PRESETS[e.target.value] }); }}>{!preset ? <option value="">{t('game.preset.custom')}</option> : null}{Object.keys(PRESETS).map(k => <option key={k} value={k}>{t('game.preset.' + k)}</option>)}</select></label>
    </div>
    <div className="gm-stats">{STATS.map(s => <label key={s} className="field"><span className="field-label">{t('game.stat.' + s)}</span>
      <input className="inp" type="number" min={-2} max={6} value={g.stats[s]} onChange={e => set('stats', { ...g.stats, [s]: Math.max(-2, Math.min(6, Math.round(+e.target.value) || 0)) })} /></label>)}</div>
    <div className="gm-cols">
      <label className="field"><span className="field-label">{t('game.setup.hp')}</span><input className="inp" type="number" min={1} max={999} value={g.hpMax} onChange={e => set('hpMax', +e.target.value)} /></label>
      <label className="field"><span className="field-label">{t('game.setup.gold')}</span><input className="inp" type="number" min={0} value={g.gold} onChange={e => set('gold', +e.target.value)} /></label>
    </div>
    <label className="field"><span className="field-label">{t('game.setup.items')}</span><input className="inp" value={items} placeholder={t('game.setup.itemsPh')} onChange={e => setItems(e.target.value)} /></label>
    <div className="gm-foot"><button type="button" className="btn primary" onClick={done}>{t(editing ? 'game.setup.save' : 'game.setup.start')}</button></div>
  </div>;
}
export function openSetup(chat: Chat) { openModal({ title: t(gameOf(chat) ? 'game.setup.editTitle' : 'game.setup.title'), spec: 'div.gm' }, close => <Setup chat={chat as GameChat} close={close} />); }

// ── 시트 ──
function adjust(chat: GameChat, fx: Fx) { const g = chat.game; if (!g) return; (g.adj ||= []).push(fx); saveChat(chat); }
export function Sheet({ chat, msgs, onClose }: { chat: Chat; msgs: Msg[]; onClose?: () => void }) {
  useCh('game');
  const g = gameOf(chat); if (!g) return <><p className="dim">{t('game.sheet.off')}</p><button type="button" className="btn" onClick={() => openSetup(chat)}>{t('game.setup.title')}</button></>;
  const s = sheetOf(g, msgs), gc = chat as GameChat;
  const Step = ({ fx, label }: { fx: Fx; label: string }) => <button type="button" className="gm-step" aria-label={label} title={label} onClick={() => adjust(gc, fx)}>{'n' in fx && fx.n > 0 ? '+' : '−'}</button>;
  const addItem = async () => { const v = await promptBox(t('game.sheet.addItem'), ''); if (v?.trim()) adjust(gc, { k: 'item', name: v.trim().slice(0, 60), n: 1 }); };
  return <div className="gm-sheet">
    <div className="gm-row"><span className="eyebrow">HP</span><b className="gm-n">{s.hp}<i>/{s.hpMax}</i></b><span className="gm-bar"><i style={{ width: `${s.hp / s.hpMax * 100}%` }} /></span><Step fx={{ k: 'hp', n: -1 }} label="HP −1" /><Step fx={{ k: 'hp', n: 1 }} label="HP +1" /></div>
    <div className="gm-row"><span className="eyebrow">{t('game.gold')}</span><b className="gm-n">{s.gold}</b><i className="gm-fill" /><Step fx={{ k: 'gold', n: -1 }} label={t('game.gold') + ' −1'} /><Step fx={{ k: 'gold', n: 1 }} label={t('game.gold') + ' +1'} /></div>
    <div className="gm-statline">{STATS.map(k => <span key={k}><small>{t('game.stat.' + k)}</small><b>{sign(g.stats[k])}</b></span>)}</div>
    {s.place ? <div className="gm-sec"><span className="eyebrow">{t('game.place')}</span><p>{s.place}</p></div> : null}
    <div className="gm-sec"><span className="eyebrow">{t('game.items')}</span>
      {s.items.length ? <ul className="gm-items">{s.items.map(i => <li key={i.name}><span>{i.name}{i.n > 1 ? <em> ×{i.n}</em> : null}</span><button type="button" title={t('game.sheet.drop')} aria-label={t('game.sheet.drop')} onClick={() => adjust(gc, { k: 'item', name: i.name, n: -1 })}>−</button></li>)}</ul> : <p className="dim">{t('game.items.none')}</p>}
      <button type="button" className="gm-link" onClick={() => void addItem()}>{t('game.sheet.addItem')}</button></div>
    <div className="gm-sec"><span className="eyebrow">{t('game.quests')}</span>
      {s.quests.length ? <ul className="gm-quests">{s.quests.map(q => <li key={q.title} className={q.done ? 'is-done' : ''}><i>{q.done ? '✓' : '○'}</i>{q.title}</li>)}</ul> : <p className="dim">{t('game.quests.none')}</p>}</div>
    <div className="gm-foot">
      <button type="button" className="btn sm" onClick={() => { onClose?.(); openMiniPicker(chat); }}>{t('game.mini.title')}</button>
      <button type="button" className="btn sm" onClick={() => { onClose?.(); openSetup(chat); }}>{t('game.sheet.settings')}</button>
      <button type="button" className="btn sm ghost" onClick={() => { g.on = false; saveChat(chat); onClose?.(); toast(t('game.ended')); }}>{t('game.sheet.end')}</button>
    </div>
  </div>;
}
export function openSheet(chat: Chat) { openModal({ title: t('game.sheet.title'), spec: 'div.gm' }, close => <Sheet chat={chat} msgs={cur.chat === chat ? cur.msgs : []} onClose={close} />); }
/** 입력창 + 메뉴 · /game: 게임 중이면 시트를, 아니면 시작 창을 연다 */
export const openGame = (chat: Chat) => gameOf(chat) ? openSheet(chat) : openSetup(chat);

// ── 입력창 위의 띠: 지금 상태 한 줄 + 진행자가 맡긴 일 ──
export function GameBar() {
  useCh('game'); useCh('busy');
  const chat = cur.chat, g = gameOf(chat); if (!chat || !g) return null;
  const s = sheetOf(g, cur.msgs), ask = pendingAsk(cur.msgs), busy = running();
  const label = !ask ? '' : ask.k === 'check' ? t('game.ask.check', { stat: t('game.stat.' + ask.stat), dc: ask.dc }) : ask.k === 'fight' ? t('game.ask.fight', { name: ask.name }) : t('game.ask.play', { game: t('game.mini.' + ask.game) });
  const why = ask && (ask.k === 'check' ? ask.why : ask.k === 'play' ? ask.stake : '');
  return <div className="gm-strip">
    <button type="button" className="gm-status" title={t('game.sheet.title')} onClick={() => openSheet(chat)}>
      <span><small>HP</small><b className={s.hp <= s.hpMax / 4 ? 'is-low' : ''}>{s.hp}/{s.hpMax}</b></span><span><small>{t('game.gold')}</small><b>{s.gold}</b></span>{s.place ? <span className="gm-where"><small>{t('game.place')}</small><b>{s.place}</b></span> : null}
    </button>
    {ask && !busy ? <button type="button" className="gm-ask" onClick={() => resolveAsk(chat, ask)}><Icon name={ask.k === 'check' ? 'dice' : ask.k === 'fight' ? 'star' : 'play'} size={15} /><span><b>{label}</b>{why ? <small>{why}</small> : null}</span></button> : null}
  </div>;
}

// ── 대화에 남는 기록 카드 ──
export function GameCard({ m }: { m: Msg }) {
  const r = (m as GameMsg).gm; if (!r) return null;
  if (r.kind === 'start') return <div className="gm-card-rec is-start"><span className="eyebrow">game</span><b>{t('game.rec.start')}</b></div>;
  if (r.kind === 'check') return <div className={`gm-card-rec is-${r.ok ? 'win' : 'lose'}`}>
    <span className="eyebrow">{t('game.rec.check', { stat: t('game.stat.' + r.stat) })} · DC {r.dc}</span>
    <div className="gm-roll"><i className="gm-die">{r.die}</i><span>{sign(r.mod)}</span><span>=</span><strong>{r.total}</strong><em>{t(r.crit === 'hit' ? 'game.rec.crit' : r.crit === 'miss' ? 'game.rec.fumble' : r.ok ? 'game.rec.ok' : 'game.rec.fail')}</em></div>
    {r.why ? <small>{r.why}</small> : null}</div>;
  if (r.kind === 'fight') return <div className={`gm-card-rec is-${r.outcome === 'win' ? 'win' : r.outcome === 'lose' ? 'lose' : 'draw'}`}>
    <span className="eyebrow">{t('game.rec.fight')}</span><b>{r.name}</b>
    <small>{t('game.fight.end.' + r.outcome)} · {t('game.rec.rounds', { n: r.rounds })} · {t('game.rec.took', { n: r.took })} · HP {r.hp}/{r.hpMax}</small></div>;
  const foe = S.get('chars', m.charId)?.name || m.name || t('game.foe');
  return <div className={`gm-card-rec is-${r.outcome}`}>
    <span className="eyebrow">{t('game.mini.' + r.game)}</span><b>{r.outcome === 'win' ? t('game.rec.youWon') : r.outcome === 'lose' ? t('game.rec.foeWon', { name: foe }) : t('game.out.draw')}</b>
    {r.score || r.stake ? <small>{[r.score, r.stake].filter(Boolean).join(' · ')}</small> : null}</div>;
}
export type { StatKey };
