// 게임 모드의 화면: 시작 창 · 시트 · 입력창 위의 띠 · 대화에 남는 기록 카드 · 미니게임 고르기
import { useEffect, useRef, useState } from 'react';
import { setSfx, sfx } from './sfx';
import type { Chat, Msg } from '../lib/types';
import { Icon } from '../kit';
import { S, emit, newMsg } from '../lib/core';
import { openModal } from '../addons/parts';
import { confirmBox, promptBox, toast } from '../ui';
import { t } from '../i18n';
import { bump, cur, useCh } from '../chat/store';
import { chatApi, drawMain, generate, running } from '../chat/actions';
import { Combat } from './Combat';
import { ClockDial, D20, PlaceGlyph } from './Art';
import { BUILTIN_BG, MAX_AUDIO, TRACKS, addMedia, loadMedia, myMedia, removeMedia } from './media';
import { SCENES, sceneOf } from './state';
import { pickFiles } from '../lib/core';
import { Illust } from '../lib/illust';
import { Mini } from './Minis';
import { Bag } from './Bag';
import { clipFor, loadClips, makeClip, pingVideo, removeClip, videoCfg } from './video';
import { quickCall } from '../lib/engine';
import { msgText } from '../lib/core';
import { MINIS, PRESET_IDS, RULES, RULE_IDS, SESSION_PROMPT, gameOf, levelOf, presetStats, ruleOf, statVal, statsOf, journalOf, layoutMap, newGame, pendingAsk, pendingFate, recText, repTier, rollCheck, sheetOf, tallyOf, type Ask, type Fx, type GameCfg, type GameChat, type GameMsg, type GameRec, type MiniId, type Sheet as SheetData, type StatKey } from './state';

const foeName = (chat: Chat) => S.get('chars', chat.charIds[0])?.name || t('game.foe');
const userName = (chat: Chat) => S.persona(chat).name || 'User';
const sign = (n: number) => (n >= 0 ? '+' : '') + n;
export const redrawGame = () => bump('game');
const saveChat = (chat: Chat) => { void S.save('chats', chat, true); redrawGame(); };

/** 기록을 대화에 남기고, 이어서 답을 받는다 */
async function record(chat: Chat, rec: GameRec, reply = true) {
  setSfx(gameOf(chat)?.sfx !== false);
  const first = S.get('chars', chat.charIds[0]);
  const m = newMsg('system', recText(rec, userName(chat), foeName(chat)), { gm: rec, charId: first?.id || '', name: first?.name || '' } as Partial<Msg>);
  if (cur.chat === chat && chatApi.push) await chatApi.push(m); else { const msgs = await S.msgs(chat.id); msgs.push(m); await S.saveMsgs(chat, msgs); }
  redrawGame();
  // 전투와 세션의 끝은 나중에 돌아올 수 있게 체크포인트로 남긴다
  if (cur.chat === chat && (rec.kind === 'fight' || rec.kind === 'session')) void import('../flow/logic').then(f => f.addCheckpoint(m, rec.kind === 'fight' ? `${t('game.rec.fight')} · ${rec.name}` : t('game.journal.sessionN', { n: rec.n }))).catch(() => { });
  if (reply && cur.chat === chat && !running()) void generate('normal');
}

/** 삽화: 켜 두었으면 새 장소에 도착했거나 전투가 끝난 답변을 그린다 (그림 설정이 되어 있을 때만) */
export async function drawFor(chat: Chat, msg?: Msg) {
  const g = gameOf(chat); if (!g?.art || cur.chat !== chat) return;
  const m = msg || [...cur.msgs].reverse().find(x => x.role === 'assistant'); if (!m || m.role !== 'assistant') return;
  try { const { quickDraw } = await import('../scenebook/work'); await quickDraw(m as never); } catch (e) { console.warn('[게임 삽화]', e); }
}
export { levelOf };

// ── 미니게임 ──
export function playMini(chat: Chat, game: MiniId, stake = '') {
  const g = gameOf(chat);
  const box = openModal({ title: t('game.mini.' + game), spec: 'div.gm' }, close => <Mini game={game} foe={foeName(chat)} gold={g ? sheetOf(g, cur.chat === chat ? cur.msgs : []).gold : 0} onDone={r => { close(); void record(chat, { kind: 'play', game, outcome: r.outcome, score: r.score, ...(stake ? { stake } : {}), ...(r.fx ? { fx: r.fx } : {}) }); }} />);
  return box;
}
export function openMiniPicker(chat: Chat) {
  openModal({ title: t('game.mini.title'), spec: 'div.gm' }, close => <div className="gm-pick">
    <p className="hint">{t('game.mini.pickHint', { name: foeName(chat) })}</p>
    {(() => { const n = tallyOf(cur.chat === chat ? cur.msgs : []); return n.win + n.lose + n.draw ? <p className="gm-tally"><span className="eyebrow">{t('game.mini.tally')}</span><b>{t('game.mini.tallyLine', n)}</b></p> : null; })()}
    {MINIS.map(id => <button key={id} type="button" className="gm-pick-row" onClick={() => { close(); playMini(chat, id); }}><b>{t('game.mini.' + id)}</b><span>{t('game.mini.' + id + '.rule')}</span></button>)}
  </div>);
}

// ── 진행자가 맡긴 일 ──
export function resolveAsk(chat: Chat, ask: Ask) {
  const g = gameOf(chat); if (!g || running()) return;
  setSfx(g.sfx !== false);
  if (ask.k === 'qte') return void openModal({ title: t('game.qte.title'), spec: 'div.gm' }, close => <Qte ask={ask} onDone={r => { close(); void record(chat, { kind: 'qte', ...r, secs: ask.secs }); }} />);
  if (ask.k === 'check') {
    sfx('dice'); const sh = sheetOf(g, cur.msgs), r = rollCheck(g, ask, sh.level), fumble = r.grade === 'fumble';
    // 실패했고 운명 점이 있으면 바로 넘어가지 않고, 받아들일지 다시 굴릴지 묻는다. 대실패는 운명 점을 하나 준다
    const open = !r.ok && sh.fate + (fumble ? 1 : 0) > 0;
    return void record(chat, { kind: 'check', ...r, ...(ask.why ? { why: ask.why } : {}), ...(fumble ? { fx: [{ k: 'fate' as const, n: 1 }] } : {}), ...(open ? { open: true } : {}) }, !open);
  }
  if (ask.k === 'play') return void playMini(chat, ask.game, ask.stake);
  const sheet = sheetOf(g, cur.msgs), foes = ask.foes?.length ? ask.foes : [{ name: (ask as unknown as { name?: string }).name || t('game.foe'), hp: 12, atk: 3 }];
  const names = [...new Set(foes.map(f => f.name.replace(/ \d+$/, '')))].join(', ');
  const faces: Record<string, string> = {}; { const me = S.persona(chat).avatar; if (me) faces.me = me; for (const n of sheet.party) { const c = S.chars.find(x => x.name.toLowerCase() === n.toLowerCase()); if (c?.avatar) faces[n.toLowerCase()] = c.avatar; } }
  openModal({ title: t('game.fight.title', { name: names }), spec: 'div.gm' }, close => <Combat g={g} sheet={sheet} foes={foes} faces={faces} onDone={r => { close(); void record(chat, { kind: 'fight', name: names, outcome: r.outcome, rounds: r.rounds, took: r.took, hp: r.hp, hpMax: sheet.hpMax, fx: r.fx, ...(r.gold || r.xp ? { loot: `${r.gold} gold and ${r.xp} XP${r.loot ? ' and ' + r.loot : ''}` } : {}), ...(r.fallen.length ? { fallen: r.fallen } : {}) }); }} />);
}

/** 순간 반응: 시간이 줄어드는 동안 하나를 고른다. 빨리 고를수록 유리하고, 놓치면 나쁘게 흘러간다 */
function Qte({ ask, onDone }: { ask: Extract<Ask, { k: 'qte' }>; onDone(r: { choice: string; took: number; speed: 'fast' | 'ok' | 'late' | 'timeout' }): void }) {
  const [left, setLeft] = useState(ask.secs), start = useRef(Date.now()), done = useRef(false);
  const end = (choice: string) => { if (done.current) return; done.current = true; const took = Math.min(ask.secs, (Date.now() - start.current) / 1000), f = took / ask.secs; onDone({ choice, took, speed: !choice ? 'timeout' : f <= .35 ? 'fast' : f <= .75 ? 'ok' : 'late' }); };
  useEffect(() => {
    const tm = window.setInterval(() => { const l = ask.secs - (Date.now() - start.current) / 1000; setLeft(Math.max(0, l)); if (l <= 0) { clearInterval(tm); end(''); } }, 50);
    return () => clearInterval(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="gm-mini gm-qte">
    <div className="gm-qte-time"><span className="gm-bar"><i style={{ width: `${left / ask.secs * 100}%` }} /></span><b>{left.toFixed(1)}</b></div>
    <div className="gm-qte-opts">{ask.options.map((o, i) => <button key={i} type="button" className="btn" onClick={() => end(o)}><small>{i + 1}</small>{o}</button>)}</div>
  </div>;
}

/** 실패한 판정: 받아들이거나(false), 운명 점을 써서 다시 굴린다(true) */
export async function settleFate(chat: Chat, reroll: boolean) {
  const g = gameOf(chat), m = pendingFate(cur.msgs); if (!g || !m || m.gm?.kind !== 'check' || cur.chat !== chat) return;
  const old = m.gm;
  if (reroll) {
    sfx('dice'); const r = rollCheck(g, { k: 'check', stat: old.stat, dc: old.rule === '2d6' || old.rule === 'd100' ? 0 : old.dc, why: old.why || '', ...(old.note?.includes('advantage') && !old.note.includes('dis') ? { adv: 'adv' as const } : old.note?.includes('disadvantage') ? { adv: 'dis' as const } : {}), ...(old.note?.includes('proficient') ? { prof: true } : {}), ...(old.note === 'hard' || old.note === 'extreme' ? { hard: old.note } : {}) }, sheetOf(g, cur.msgs).level);
    m.gm = { kind: 'check', ...r, ...(old.why ? { why: old.why } : {}), fx: [...(old.fx || []), { k: 'fate', n: -1 }], rerolled: true };
  } else m.gm = { ...old, open: false };
  delete (m.gm as { open?: boolean }).open;
  m.swipes[0].text = recText(m.gm, userName(chat), foeName(chat));
  await chatApi.save(); chatApi.redraw(); redrawGame();
  if (!running()) void generate('normal');
}

// ── 시작 · 설정 창 ──
const GENRES = ['fantasy', 'modern', 'scifi', 'horror', 'wuxia', 'school', 'mystery'];
function Setup({ chat, close }: { chat: GameChat; close(): void }) {
  const editing = !!gameOf(chat);
  const [g, setG] = useState<GameCfg>(() => structuredClone(chat.game?.on ? chat.game : { ...newGame(), hero: '' }));
  const [items, setItems] = useState(() => g.items.join(', '));
  const set = <K extends keyof GameCfg>(k: K, v: GameCfg[K]) => setG({ ...g, [k]: v });
  const rule = ruleOf(g), R = RULES[rule], keys = R.stats;
  const preset = PRESET_IDS.find(k => { const p = presetStats(rule, k); return keys.every(s => p[s] === g.stats[s]); }) || '';
  const done = () => {
    const next: GameCfg = { ...g, on: true, hpMax: Math.max(1, Math.round(g.hpMax) || 20), gold: Math.max(0, Math.round(g.gold) || 0), items: items.split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 20), adj: editing ? g.adj || [] : [] };
    if (!editing && chat.mode !== 'rp') { next.prev = chat.mode; chat.mode = 'rp'; }
    chat.game = next; saveChat(chat); close(); drawMain();
    if (!editing) { emit('game:start', chat); void record(chat, { kind: 'start' }); }
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
        <select className="inp" value={preset} onChange={e => { if (e.target.value) set('stats', presetStats(rule, e.target.value)); }}>{!preset ? <option value="">{t('game.preset.custom')}</option> : null}{PRESET_IDS.map(k => <option key={k} value={k}>{t('game.preset.' + k)}</option>)}</select></label>
    </div>
    <label className="field"><span className="field-label">{t('game.setup.rule')}</span>
      <select className="inp" value={rule} onChange={e => { const r = e.target.value as GameCfg['rule'] & string; setG({ ...g, rule: r as GameCfg['rule'], stats: presetStats(r as never, preset || 'balanced') }); }}>{RULE_IDS.map(k => <option key={k} value={k}>{t('game.rule.' + k)}</option>)}</select>
      <small className="hint">{t('game.rule.' + rule + '.hint')}</small></label>
    <div className="gm-stats" style={{ gridTemplateColumns: `repeat(${keys.length > 4 ? 3 : 4}, 1fr)` }}>{keys.map(s => <label key={s} className="field"><span className="field-label">{t('game.stat.' + s)}</span>
      <input className="inp" type="number" min={R.min} max={R.max} value={statVal(g, s)} onChange={e => set('stats', { ...g.stats, [s]: Math.max(R.min, Math.min(R.max, Math.round(+e.target.value) || 0)) })} /></label>)}</div>
    <div className="gm-cols">
      <label className="field"><span className="field-label">{t('game.setup.hp')}</span><input className="inp" type="number" min={1} max={999} value={g.hpMax} onChange={e => set('hpMax', +e.target.value)} /></label>
      <label className="field"><span className="field-label">{t('game.setup.gold')}</span><input className="inp" type="number" min={0} value={g.gold} onChange={e => set('gold', +e.target.value)} /></label>
    </div>
    <label className="field"><span className="field-label">{t('game.setup.items')}</span><input className="inp" value={items} placeholder={t('game.setup.itemsPh')} onChange={e => setItems(e.target.value)} /></label>
    <label className="field"><span className="field-label">{t('game.setup.secret')}</span><textarea className="inp" rows={3} value={g.secret || ''} placeholder={t('game.setup.secretPh')} onChange={e => set('secret', e.target.value)} /><small className="hint">{t('game.setup.secretHint')}</small></label>
    <label className="field"><span className="field-label">{t('game.setup.auto')}</span>
      <select className="inp" value={g.auto || 0} onChange={e => set('auto', +e.target.value)}>{[0, 2, 4, 6, 9].map(n => <option key={n} value={n}>{n ? t('game.setup.autoN', { n }) : t('game.setup.autoOff')}</option>)}</select></label>
    <label className="gm-check"><input type="checkbox" checked={g.autoWeather !== false} onChange={e => set('autoWeather', e.target.checked)} />{t('game.setup.autoWeather')}</label>
    <label className="gm-check"><input type="checkbox" checked={g.music !== false} onChange={e => set('music', e.target.checked)} />{t('game.setup.music')}</label>
    <label className="gm-check"><input type="checkbox" checked={g.sfx !== false} onChange={e => set('sfx', e.target.checked)} />{t('game.setup.sfx')}</label>
    <label className="gm-check"><input type="checkbox" checked={!!g.art} onChange={e => set('art', e.target.checked)} />{t('game.setup.art')}</label>
    <div className="gm-foot"><button type="button" className="btn primary" onClick={done}>{t(editing ? 'game.setup.save' : 'game.setup.start')}</button></div>
  </div>;
}
export function openSetup(chat: Chat) { openModal({ title: t(gameOf(chat) ? 'game.setup.editTitle' : 'game.setup.title'), spec: 'div.gm' }, close => <Setup chat={chat as GameChat} close={close} />); }

// ── 시트 ──
function adjust(chat: GameChat, fx: Fx) { const g = chat.game; if (!g) return; (g.adj ||= []).push(fx); saveChat(chat); }
/** 지도: 비스듬히 내려다본 판. 장소마다 블록이 하나씩 솟아 있고, 간 곳은 그림이 얹히고 들어만 본 곳은 낮고 흐리다. 이어진 곳을 누르면 그리로 간다고 적는다 */
/** 입력창에 적어 둔다. 게임 화면이 떠 있으면 그 화면의 입력창에, 아니면 대화 입력창에 */
const putDraft = (text: string) => { if (document.documentElement.classList.contains('gs-on')) emit('game:draft', text); else chatApi.insert(text); };
function MapView({ s, onGo }: { s: SheetData; onGo(name: string): void }) {
  const m = layoutMap(s); if (!m.nodes.length) return <p className="dim">{t('game.map.empty')}</p>;
  const TW = 74, TH = 44, iso = (n: { x: number; y: number }) => ({ x: (n.x - n.y) * TW, y: (n.x + n.y) * TH });   // 블록 사이에 이름이 들어갈 틈을 둔다
  const pts = m.nodes.map(n => ({ n, ...iso(n), h: n.here ? 20 : n.seen ? 13 : 6, scene: sceneOf({ ...s, scene: '', place: n.name, time: '' }) }));
  const minX = Math.min(...pts.map(p => p.x)) - 78, maxX = Math.max(...pts.map(p => p.x)) + 78, minY = Math.min(...pts.map(p => p.y)) - 86, maxY = Math.max(...pts.map(p => p.y)) + 58;
  const near = (name: string) => s.paths.some(([a, b]) => (a === s.place && b === name) || (b === s.place && a === name));
  const at = (name: string) => pts.find(p => p.n.name === name)!;
  const W = 40, D = 21;   // 블록 윗면의 반너비 · 반높이
  // 장소가 몇 없을 때 지나치게 커지지 않게, 그림의 실제 크기보다 조금만 키운다
  const lines = (name: string) => { if (name.length <= 13) return [name]; const cut = name.lastIndexOf(' ', 13), at = cut > 4 ? cut : 13, rest = name.slice(at).trim(); return [name.slice(0, at).trim(), rest.length > 14 ? rest.slice(0, 13) + '…' : rest]; };
  return <div className="gm-map"><svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY + 12}`} style={{ width: `min(100%, ${Math.round((maxX - minX) * 1.35)}px)`, maxHeight: '52vh' }} role="img" aria-label={t('game.map.title')}>
    <defs><pattern id="gm-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" strokeWidth=".8" opacity=".5" /></pattern></defs>
    {m.edges.map(([a, b], i) => { const p = at(a.name), q = at(b.name), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2 + 6; return <path key={i} d={`M${p.x} ${p.y + 2}Q${mx} ${my} ${q.x} ${q.y + 2}`} className={`gm-road${a.seen && b.seen ? '' : ' is-faint'}`} />; })}
    {[...pts].sort((p, q) => p.y - q.y).map(p => { const { n, x, y, h } = p, can = !n.here && near(n.name), top = y - h;
      return <g key={n.name} className={`gm-spot${n.here ? ' is-here' : ''}${n.seen ? '' : ' is-new'}${can ? ' is-can' : ''}`} onClick={() => { if (can) onGo(n.name); }}>
        <title>{n.name}</title>
        <ellipse cx={x} cy={y + D + 5} rx={W * .9} ry={D * .55} className="gm-shadow" />
        <path d={`M${x - W} ${top}L${x} ${top + D}V${y + D}L${x - W} ${y}z`} className="gm-side-l" />
        <path d={`M${x + W} ${top}L${x} ${top + D}V${y + D}L${x + W} ${y}z`} className="gm-side-r" />
        <path d={`M${x} ${top - D}L${x + W} ${top}L${x} ${top + D}L${x - W} ${top}z`} className="gm-top" />
        {!n.seen ? <path d={`M${x} ${top - D}L${x + W} ${top}L${x} ${top + D}L${x - W} ${top}z`} fill="url(#gm-hatch)" /> : null}
        {n.seen ? <g transform={`translate(${x - 13} ${top - 14}) scale(1.08)`} className="gm-icon"><PlaceGlyph scene={p.scene} /></g> : <text x={x} y={top + 5} textAnchor="middle" className="gm-q">?</text>}
        {n.here ? <g className="gm-pin"><path d={`M${x} ${top - D - 14}c-6.500 -8 -8.500 -11.500 -8.500 -15.500a8.500 8.500 0 0 1 17 0c0 4 -2 7.500 -8.500 15.500z`} /><circle cx={x} cy={top - D - 30} r="3" /></g> : null}
      </g>; })}
    {/* 이름은 블록에 가리지 않게 맨 위에 그린다 */}
    {pts.map(p => <text key={'l' + p.n.name} x={p.x} y={p.y + D + 15} textAnchor="middle" className={`gm-label${p.n.seen ? '' : ' is-new'}`}>{lines(p.n.name).map((l, i) => <tspan key={i} x={p.x} dy={i ? 12 : 0}>{l}</tspan>)}</text>)}
    <g transform={`translate(${maxX - 30} ${minY + 30})`} className="gm-compass"><circle r="15" /><path d="M0 -12 3.500 0 0 12 -3.500 0z" /><path d="M0 -12 3.500 0H-3.500z" className="is-n" /><text y="-18" textAnchor="middle">N</text></g>
  </svg><p className="hint">{t('game.map.hint')}</p></div>;
}
/** 그 메시지까지만 남긴 새 갈래를 만들어 그리로 간다 (지금 대화는 그대로 남는다). 시트 · 지도는 그 시점의 것으로 저절로 맞는다 */
export async function rewindTo(msgId: string, onClose?: () => void) {
  const i = cur.msgs.findIndex(m => m.id === msgId); if (i < 0 || running()) return;
  if (!(await confirmBox(t('game.rewind.ask'), t('game.rewind.go')))) return;
  onClose?.(); const { branch } = await import('../chat/actions'); await branch(i);
}
function Journal({ msgs, onClose }: { msgs: Msg[]; onClose?: () => void }) {
  const rows = journalOf(msgs); if (!rows.length) return <p className="dim">{t('game.journal.empty')}</p>;
  return <ol className="gm-journal">{rows.map((r, i) => <li key={i} className={`is-${r.kind}`}><span className="eyebrow">{t('game.journal.' + r.kind)}</span>
    <span>{r.kind === 'party' ? r.text : r.kind === 'play' ? t('game.mini.' + r.text) : r.kind === 'session' ? t('game.journal.sessionN', { n: r.text }) : r.text || '—'}</span>{r.ok === undefined ? <em /> : <em>{r.kind === 'party' ? t(r.ok ? 'game.journal.joined' : 'game.journal.left') : t(r.ok ? 'game.rec.ok' : 'game.rec.fail')}</em>}<button type="button" className="gm-back" title={t('game.rewind.tip')} aria-label={t('game.rewind.tip')} onClick={() => void rewindTo(r.id, onClose)}>↺</button></li>)}</ol>;
}
/** 세션 마무리: 지금까지를 요약해 두고(요청 한 번), 지난 메시지는 프롬프트에서 뺀다. 시트 · 지도 · 일지는 그대로 이어진다 */
async function endSession(chat: GameChat, trim: boolean) {
  const g = chat.game; if (!g || cur.chat !== chat) return false;
  const msgs = cur.msgs, from = Math.max(0, ...msgs.map((m, i) => (m as GameMsg).gm?.kind === 'session' ? i + 1 : 0));
  const part = msgs.slice(from).filter(m => !m.hidden || true), lines = part.map(m => `${m.role === 'user' ? userName(chat) : m.role === 'assistant' ? (m.name || foeName(chat)) : 'Event'}: ${msgText(m)}`).join('\n').slice(-60000);
  if (part.filter(m => m.role === 'assistant').length < 2) { toast(t('game.session.tooShort'), 'err'); return false; }
  const text = (await quickCall(SESSION_PROMPT, lines, { maxTokens: 1200, lowThink: true })).trim(); if (!text) throw new Error('empty');
  (g.sessions ||= []).push({ text, at: Date.now() });
  if (trim) for (const m of part) m.hidden = true;
  await S.save('chats', chat, true); await chatApi.save(); chatApi.redraw();
  await record(chat, { kind: 'session', n: g.sessions.length, text }, false);
  return true;
}
function SessionBox({ chat, onClose }: { chat: GameChat; onClose?: () => void }) {
  const [busy, setBusy] = useState(false), [trim, setTrim] = useState(true), list = chat.game?.sessions || [];
  const go = async () => { setBusy(true); try { if (await endSession(chat, trim)) { toast(t('game.session.done'), 'ok'); onClose?.(); } } catch (e) { toast(t('game.session.failed', { error: (e instanceof Error ? e.message : String(e)).slice(0, 120) }), 'err'); } finally { setBusy(false); } };
  return <div className="gm-sec">
    {list.length ? <ol className="gm-sessions">{list.map((x, i) => <li key={i}><span className="eyebrow">{t('game.journal.sessionN', { n: i + 1 })}</span><button type="button" className="gm-link" onClick={() => { const ends = cur.msgs.map((m, k) => (m as GameMsg).gm?.kind === 'session' ? k : -1).filter(k => k >= 0), from = i ? ends[i - 1] + 1 : 0, first = cur.msgs.slice(from).find(m => !(m as GameMsg).gm); onClose?.(); if (first) { emit('game:enter', chat); window.setTimeout(() => emit('game:goto', first.id), 500); } }}>{t('game.session.replay')}</button><p>{x.text}</p></li>)}</ol> : null}
    <p className="hint">{t('game.session.hint')}</p>
    <label className="gm-check"><input type="checkbox" checked={trim} onChange={e => setTrim(e.target.checked)} />{t('game.session.trim')}</label>
    <div className="gm-foot"><button type="button" className="btn primary" disabled={busy} onClick={() => void go()}>{busy ? t('game.session.busy') : t('game.session.end')}</button></div>
  </div>;
}
/** 배경 · 음악: 장면마다 내 사진을, 분위기마다 내 음악을 올린다. 올린 것이 있으면 그 장면 · 분위기는 내 것만 쓴다 */
function MediaBox() {
  const [, draw] = useState(0), [scene, setScene] = useState('forest'), [busy, setBusy] = useState(false), audio = useRef<HTMLAudioElement | null>(null), [playing, setPlaying] = useState('');
  useEffect(() => { void loadMedia().then(() => draw(n => n + 1)); return () => audio.current?.pause(); }, []);
  const mine = myMedia(), pics = mine.filter(m => m.kind === 'gamebg' && m.label === scene), built = BUILTIN_BG[scene] || [];
  const add = async (kind: 'gamebg' | 'gamebgm', label: string) => {
    const files = await pickFiles({ accept: kind === 'gamebg' ? 'image/*' : 'audio/*', multiple: true }); if (!files?.length) return;
    setBusy(true);
    try { for (const f of files) { if (kind === 'gamebgm' && f.size > MAX_AUDIO) { toast(t('game.media.tooBig', { name: f.name }), 'err'); continue; } await addMedia(kind, label, f); } }
    catch (e) { toast(t('game.media.failed', { error: (e instanceof Error ? e.message : String(e)).slice(0, 100) }), 'err'); }
    finally { setBusy(false); draw(n => n + 1); redrawGame(); }
  };
  const drop = async (id: string) => { await removeMedia(id); draw(n => n + 1); redrawGame(); };
  const listen = (key: string, src: string) => { audio.current?.pause(); if (playing === key) return setPlaying(''); const a = audio.current = new Audio(src); a.volume = .5; a.onended = () => setPlaying(''); void a.play().catch(() => setPlaying('')); setPlaying(key); };
  return <div className="gm-media">
    <div className="gm-sec"><span className="eyebrow">{t('game.media.bg')}</span>
      <p className="hint">{t('game.media.bgHint')}</p>
      <select className="inp" value={scene} onChange={e => setScene(e.target.value)}>{SCENES.map(k => { const n = mine.filter(m => m.kind === 'gamebg' && m.label === k).length; return <option key={k} value={k}>{t('game.scene.' + k)}{n ? ` · ${t('game.media.mineN', { n })}` : ''}</option>; })}</select>
      <div className="gm-thumbs">
        {pics.map(m => <figure key={m.id}><img src={m.data} alt={m.name} /><button type="button" title={t('game.media.remove')} aria-label={t('game.media.remove')} onClick={() => void drop(m.id)}>×</button></figure>)}
        {!pics.length ? built.map(b => <figure key={b} className="is-built"><img src={`game/bg/${b}.jpg`} alt="" /><figcaption>{t('game.media.builtin')}</figcaption></figure>) : null}
        {!pics.length && !built.length ? <p className="dim">{t('game.media.none')}</p> : null}
        <button type="button" className="gm-add" disabled={busy} onClick={() => void add('gamebg', scene)}><b>+</b>{t('game.media.addPic')}</button>
      </div></div>
    <div className="gm-sec"><span className="eyebrow">{t('game.media.music')}</span>
      <p className="hint">{t('game.media.musicHint')}</p>
      <ul className="gm-tracks">{TRACKS.map(k => { const own = mine.filter(m => m.kind === 'gamebgm' && m.label === k);
        return <li key={k}><div><b>{t('game.track.' + k)}</b><button type="button" className="gm-link" disabled={busy} onClick={() => void add('gamebgm', k)}>{t('game.media.addMusic')}</button></div>
          {own.length ? own.map(m => <p key={m.id}><button type="button" className="gm-play" aria-label={t('game.media.listen')} onClick={() => listen(m.id, m.data)}>{playing === m.id ? '■' : '▶'}</button><span>{m.name}</span><button type="button" className="gm-x" title={t('game.media.remove')} aria-label={t('game.media.remove')} onClick={() => void drop(m.id)}>×</button></p>)
            : <p className="is-built"><button type="button" className="gm-play" aria-label={t('game.media.listen')} onClick={() => listen(k, `game/music/${k}.mp3`)}>{playing === k ? '■' : '▶'}</button><span>{t('game.media.builtin')}</span></p>}</li>; })}</ul></div>
  </div>;
}
/** 스토리보드: 이 대화에 그려 둔 삽화를 이야기 차례대로 만화 컷처럼 늘어놓는다. 빠진 주요 장면(새 장소 · 전투 뒤)은 여기서 그릴 수 있다 */
interface Panel { key: string; msgId: string; src: string; caption: string; place: string }
function storyPanels(msgs: Msg[]): { panels: Panel[]; missing: Msg[] } {
  const panels: Panel[] = [], missing: Msg[] = []; let place = '';
  msgs.forEach((m, i) => {
    const sw = m.swipes[m.sw] as (Msg['swipes'][number] & { gfx?: Fx[] }) | undefined; if (!sw) return;
    const moved = sw.gfx?.find(f => f.k === 'place'); if (moved && moved.k === 'place') place = moved.name;
    if (m.role !== 'assistant') return;
    const pics = (sw.illust || []).map(it => { const s = Illust.slot(it as never) as unknown as { versions: { id?: string }[]; sel: number; id?: string }; const id = s.versions[s.sel]?.id || s.id || ''; return { id, src: Illust.data(id) }; }).filter(p => p.src);
    const caption = msgText(m).replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 110);
    for (const p of pics) panels.push({ msgId: m.id, key: p.id, src: p.src, caption, place });
    const key = !!moved || (msgs[i - 1] as GameMsg | undefined)?.gm?.kind === 'fight' || (msgs[i - 1] as GameMsg | undefined)?.gm?.kind === 'start';
    if (key && !pics.length && !m.hidden) missing.push(m);
  });
  return { panels, missing: missing.slice(-6) };
}
function VideoSetup() {
  const c = videoCfg(), [, draw] = useState(0), [state, setState] = useState('');
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) => { c[k] = v; S.set({}); draw(n => n + 1); };
  const num = (k: 'seconds' | 'fps' | 'width' | 'height', min: number, max: number) => <label className="field"><span className="field-label">{t('game.video.' + k)}</span><input className="inp" type="number" min={min} max={max} value={c[k]} onChange={e => set(k, Math.min(max, Math.max(min, Number(e.target.value) || min)))} /></label>;
  return <div className="gm-video-box">
    <p className="hint">{t('game.video.about')}</p>
    <label className="field"><span className="field-label">{t('game.video.url')}</span>
      <span className="gm-inline"><input className="inp" value={c.url} placeholder="http://127.0.0.1:8188" onChange={e => set('url', e.target.value)} />
        <button type="button" className="btn sm" onClick={() => { setState('…'); void pingVideo().then(ok => setState(t(ok ? 'game.video.ok' : 'game.video.unreachable'))); }}>{t('game.video.test')}</button></span>
      {state ? <small className="hint">{state}</small> : null}</label>
    <label className="field"><span className="field-label">{t('game.video.workflow')}</span>
      <textarea className="inp mono" rows={5} value={c.workflow} placeholder={'{ "1": { "class_type": "LoadImage", "inputs": { "image": "%reference_image_name%" } }, … }'} onChange={e => set('workflow', e.target.value)} />
      <small className="hint">{t('game.video.workflowHint')}</small></label>
    <div className="gm-nums">{num('seconds', 1, 20)}{num('fps', 8, 60)}{num('width', 256, 1920)}{num('height', 256, 1920)}</div>
    <label className="field"><span className="field-label">{t('game.video.model')}</span><input className="inp" value={c.model} onChange={e => set('model', e.target.value)} /></label>
    <label className="check"><input type="checkbox" checked={c.plan} onChange={e => set('plan', e.target.checked)} /><span>{t('game.video.plan')}</span></label>
  </div>;
}
function Storyboard({ chat, close }: { chat: Chat; close(): void }) {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(0), [, tick] = useState(0);
  const [making, setMaking] = useState<Record<string, string>>({}), [setup, setSetup] = useState(false), stops = useRef<Record<string, AbortController>>({});
  useEffect(() => { void Promise.all([Illust.load(chat.id), loadClips(chat.id)]).then(() => setReady(true)).catch(() => setReady(true)); const tm = window.setInterval(() => tick(n => n + 1), 1500); return () => clearInterval(tm); }, [chat.id]);
  if (!ready) return <p className="dim">{t('game.story.loading')}</p>;
  const { panels, missing } = storyPanels(cur.chat === chat ? cur.msgs : []);
  const drawAll = async () => {
    setBusy(missing.length);
    try { const { quickDraw } = await import('../scenebook/work'); for (const m of missing) { await quickDraw(m as never); setBusy(n => n - 1); } toast(t('game.story.queued'), 'ok'); }
    catch (e) { toast(t('game.story.failed', { error: (e instanceof Error ? e.message : String(e)).slice(0, 140) }), 'err'); }
    finally { setBusy(0); }
  };
  const film = async (p: Panel) => {
    if (!videoCfg().workflow.trim()) { setSetup(true); toast(t('game.video.need')); return; }
    const ac = new AbortController(); stops.current[p.key] = ac; setMaking(m => ({ ...m, [p.key]: 'upload' }));
    try { await makeClip({ chatId: chat.id, label: p.key, image: p.src, caption: p.caption, scene: p.place }, step => setMaking(m => ({ ...m, [p.key]: step })), ac.signal); toast(t('game.video.done'), 'ok'); }
    catch (e) { if ((e as Error).name !== 'AbortError') { const msg = (e as Error).message || String(e); toast(t('game.video.failed', { error: msg === 'BAD_WORKFLOW' ? t('game.video.badWorkflow') : msg === 'NO_VIDEO_OUTPUT' ? t('game.video.noOutput') : /fetch|network|ECONN|502|504/i.test(msg) ? t('game.video.unreachable') : msg.slice(0, 160) }), 'err'); } }
    finally { delete stops.current[p.key]; setMaking(m => { const n = { ...m }; delete n[p.key]; return n; }); }
  };
  return <div className="gm-story">
    {panels.length ? <div className="gm-strip-grid">{panels.map((p, i) => { const clip = clipFor(chat.id, p.key), st = making[p.key]; return <figure key={p.key || i} className={i % 5 === 0 ? 'is-wide' : ''} onClick={() => { close(); emit('game:enter', chat); window.setTimeout(() => emit('game:goto', p.msgId), 500); }}>
      {clip && !/^data:image/.test(clip) ? <video src={clip} poster={p.src} muted loop playsInline autoPlay /> : <img src={clip || p.src} alt="" loading="lazy" />}{p.place ? <span className="gm-where-tag">{p.place}</span> : null}
      <span className="gm-clip" onClick={e => e.stopPropagation()}>
        {st ? <><i>{t('game.video.step.' + st)}</i><button type="button" onClick={() => stops.current[p.key]?.abort()}>{t('common.cancel')}</button></>
          : clip ? <><button type="button" onClick={() => void film(p)}>{t('game.video.again')}</button><button type="button" onClick={() => void removeClip(chat.id, p.key).then(() => tick(n => n + 1))}>{t('game.video.remove')}</button></>
            : <button type="button" onClick={() => void film(p)}>{t('game.video.make')}</button>}
      </span>
      <figcaption>{p.caption}</figcaption></figure>; })}</div>
      : <p className="dim">{t('game.story.empty')}</p>}
    <div className="gm-foot">{missing.length ? <button type="button" className="btn primary" disabled={!!busy} onClick={() => void drawAll()}>{busy ? t('game.story.drawing', { n: busy }) : t('game.story.draw', { n: missing.length })}</button> : null}</div>
    {missing.length ? <p className="hint">{t('game.story.hint')}</p> : null}
    <details className="gm-video" open={setup} onToggle={e => setSetup((e.target as HTMLDetailsElement).open)}><summary>{t('game.video.title')}</summary><VideoSetup /></details>
  </div>;
}
export function openStoryboard(chat: Chat) { openModal({ title: t('game.story.title'), wide: true, spec: 'div.gm' }, close => <Storyboard chat={chat} close={close} />); }
type Tab = 'sheet' | 'bag' | 'map' | 'journal' | 'session' | 'media';
const StepBtn = ({ chat, fx, label }: { chat: GameChat; fx: Fx; label: string }) => <button type="button" className="gm-step" aria-label={label} title={label} onClick={() => adjust(chat, fx)}>{'n' in fx && fx.n > 0 ? '+' : '−'}</button>;
export function Sheet({ chat, msgs, onClose, first = 'sheet' }: { chat: Chat; msgs: Msg[]; onClose?: () => void; first?: Tab }) {
  useCh('game'); const [tab, setTab] = useState<Tab>(first);
  const g = gameOf(chat); if (!g) return <><p className="dim">{t('game.sheet.off')}</p><button type="button" className="btn" onClick={() => openSetup(chat)}>{t('game.setup.title')}</button></>;
  const s = sheetOf(g, msgs), gc = chat as GameChat;
  const addItem = async () => { const v = await promptBox(t('game.sheet.addItem'), ''); if (v?.trim()) adjust(gc, { k: 'item', name: v.trim().slice(0, 60), n: 1 }); };
  const tabs = <div className="gm-tabs">{(['sheet', 'bag', 'map', 'journal', 'session', 'media'] as const).map(k => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t('game.tab.' + k)}</button>)}</div>;
  if (tab === 'bag') return <div className="gm-sheet">{tabs}<Bag g={g} sheet={s} onSave={() => saveChat(chat)} onDrop={name => adjust(gc, { k: 'item', name, n: -1 })} onAdd={() => void addItem()} /></div>;
  if (tab === 'map') return <div className="gm-sheet">{tabs}<MapView s={s} onGo={name => { putDraft(t('game.map.go', { place: name })); onClose?.(); }} /></div>;
  if (tab === 'journal') return <div className="gm-sheet">{tabs}
    <div className="gm-sec"><span className="eyebrow">{t('game.memo')}</span><textarea className="inp" rows={3} defaultValue={g.memo || ''} placeholder={t('game.memoPh')} onBlur={e => { if ((g.memo || '') !== e.target.value) { g.memo = e.target.value; saveChat(chat); } }} /></div>
    {s.docs.length ? <div className="gm-sec"><span className="eyebrow">{t('game.docs')}</span>{s.docs.map(d => <details key={d.title} className="gm-doc"><summary>{d.title}</summary><p>{d.text}</p></details>)}</div> : null}
    <div className="gm-foot"><button type="button" className="btn sm" onClick={() => { onClose?.(); openStoryboard(chat); }}>{t('game.story.title')}</button></div>
    <p className="hint">{t('game.rewind.hint')}</p><Journal msgs={msgs} onClose={onClose} /></div>;
  if (tab === 'media') return <div className="gm-sheet">{tabs}<MediaBox /></div>;
  if (tab === 'session') return <div className="gm-sheet">{tabs}<SessionBox chat={gc} onClose={onClose} /></div>;
  return <div className="gm-sheet">{tabs}
    <div className="gm-row"><span className="eyebrow">HP</span><b className="gm-n">{s.hp}<i>/{s.hpMax}</i></b><span className="gm-bar"><i style={{ width: `${s.hp / s.hpMax * 100}%` }} /></span><StepBtn chat={gc} fx={{ k: 'hp', n: -1 }} label="HP −1" /><StepBtn chat={gc} fx={{ k: 'hp', n: 1 }} label="HP +1" /></div>
    <div className="gm-row"><span className="eyebrow">{t('game.gold')}</span><b className="gm-n">{s.gold}</b><i className="gm-fill" /><StepBtn chat={gc} fx={{ k: 'gold', n: -1 }} label={t('game.gold') + ' −1'} /><StepBtn chat={gc} fx={{ k: 'gold', n: 1 }} label={t('game.gold') + ' +1'} /></div>
    <div className="gm-row"><span className="eyebrow">{t('game.fate')}</span><b className="gm-n">{s.fate}</b><span className="gm-fates">{Array.from({ length: Math.max(s.fate, 3) }, (_, i) => <i key={i} className={i < s.fate ? 'on' : ''} />)}</span></div>
    <p className="hint gm-note">{t('game.fate.hint')}</p>
    <div className="gm-row"><span className="eyebrow">LV</span><b className="gm-n">{s.level}</b><span className="gm-bar"><i style={{ width: `${s.level >= 20 ? 100 : s.xp % 100}%` }} /></span><small className="gm-xp">{s.xp} XP</small></div>
    <div className="gm-statline" style={{ gridTemplateColumns: `repeat(${statsOf(g).length > 4 ? 3 : 4}, 1fr)` }}>{statsOf(g).map(k => <span key={k}><small>{t('game.stat.' + k)}</small><b>{ruleOf(g) === 'd20' || ruleOf(g) === '2d6' ? sign(statVal(g, k)) : statVal(g, k)}</b></span>)}</div>
    {s.time || s.weather || s.wx ? <div className="gm-sec"><span className="eyebrow">{t('game.time')}</span><p>{[s.time, s.weather || (s.wx ? t('game.wx.' + s.wx) : '')].filter(Boolean).join(' · ')}</p></div> : null}
    {s.meters.length ? <div className="gm-sec"><span className="eyebrow">{t('game.meters')}</span>{s.meters.map(m => <div key={m.name} className="gm-row"><span className="gm-mname">{m.name}</span><span className="gm-bar"><i style={{ width: `${m.v / m.max * 100}%` }} /></span><small className="gm-xp">{m.v}/{m.max}</small></div>)}</div> : null}
    {s.clocks.length ? <div className="gm-sec"><span className="eyebrow">{t('game.clocks')}</span>{s.clocks.map(c => <div key={c.name} className={`gm-clock${c.v >= c.max ? ' is-full' : ''}`}><span>{c.name}</span><b>{c.v}/{c.max}</b><ClockDial v={c.v} max={c.max} size={26} /></div>)}</div> : null}
    {s.party.length || s.people.length ? <div className="gm-sec"><span className="eyebrow">{t('game.people')}</span>
      <ul className="gm-people">{s.party.filter(n => !s.people.some(p => p.name.toLowerCase() === n.toLowerCase())).map(n => <li key={'p' + n}><span>{n}</span><em>{t('game.party')}</em></li>)}
        {s.people.map(p => <li key={p.name}><span>{p.name}</span><i className="gm-rep"><b style={{ left: `${(p.v + 100) / 2}%` }} /></i><em>{s.party.some(n => n.toLowerCase() === p.name.toLowerCase()) ? t('game.party') + ' · ' : ''}{t('game.rep.' + repTier(p.v))} {sign(p.v)}</em></li>)}</ul></div> : null}
    <div className="gm-sec"><span className="eyebrow">{t('game.items')}</span>
      {s.items.length ? <p className="gm-carry">{s.items.map(i => i.n > 1 ? `${i.name} ×${i.n}` : i.name).join(' · ')}</p> : <p className="dim">{t('game.items.none')}</p>}
      <button type="button" className="gm-link" onClick={() => setTab('bag')}>{t('game.bag.open')}</button></div>
    <div className="gm-sec"><span className="eyebrow">{t('game.quests')}</span>
      {s.quests.length ? <ul className="gm-quests">{s.quests.map(q => <li key={q.title} className={q.done ? 'is-done' : ''}><i>{q.done ? '✓' : '○'}</i>{q.title}</li>)}</ul> : <p className="dim">{t('game.quests.none')}</p>}</div>
    <div className="gm-foot">
      <button type="button" className="btn sm" onClick={() => { onClose?.(); openMiniPicker(chat); }}>{t('game.mini.title')}</button>
      <button type="button" className="btn sm" onClick={() => { onClose?.(); openSetup(chat); }}>{t('game.sheet.settings')}</button>
      <button type="button" className="btn sm ghost" onClick={() => { g.on = false; saveChat(chat); onClose?.(); drawMain(); toast(t('game.ended')); }}>{t('game.sheet.end')}</button>
    </div>
  </div>;
}
export function openSheet(chat: Chat, first: Tab = 'sheet') { openModal({ title: t('game.sheet.title'), spec: 'div.gm' }, close => <Sheet chat={chat} msgs={cur.chat === chat ? cur.msgs : []} onClose={close} first={first} />); }
/** 입력창 + 메뉴 · /game: 게임 중이면 시트를, 아니면 시작 창을 연다 */
export const openGame = (chat: Chat) => gameOf(chat) ? openSheet(chat) : openSetup(chat);

export function askLabel(ask: Ask): string {
  return ask.k === 'check' ? t('game.ask.check', { stat: t('game.stat.' + ask.stat), dc: ask.dc }) : ask.k === 'qte' ? t('game.ask.qte', { n: ask.secs }) : ask.k === 'fight' ? t('game.ask.fight', { name: [...new Set((ask.foes || []).map(f => f.name.replace(/ \d+$/, '')))].join(', ') }) : t('game.ask.play', { game: t('game.mini.' + ask.game) });
}
// ── 입력창 위의 띠: 지금 상태 한 줄 + 진행자가 맡긴 일 ──
export function GameBar() {
  useCh('game'); useCh('busy');
  const chat = cur.chat, g = gameOf(chat); if (!chat || !g) return null;
  const s = sheetOf(g, cur.msgs), ask = pendingAsk(cur.msgs), busy = running(), fate = pendingFate(cur.msgs);
  const label = ask ? askLabel(ask) : '';
  const why = ask && (ask.k === 'check' ? ask.why : ask.k === 'play' ? ask.stake : '');
  const tail = cur.msgs[cur.msgs.length - 1], picks = !busy && !ask && tail?.role === 'assistant' ? (tail.swipes[tail.sw] as { gchoices?: string[] } | undefined)?.gchoices || [] : [];
  return <div className="gm-strip">
    <button type="button" className="gm-status" title={t('game.sheet.title')} onClick={() => openSheet(chat)}>
      <span><small>HP</small><b className={s.hp <= s.hpMax / 4 ? 'is-low' : ''}>{s.hp}/{s.hpMax}</b></span><span><small>{t('game.gold')}</small><b>{s.gold}</b></span>{s.place || s.time ? <span className="gm-where"><small>{t(s.place ? 'game.place' : 'game.time')}</small><b>{[s.place, s.time].filter(Boolean).join(' · ')}</b></span> : null}
    </button>
    {fate && !busy ? <div className="gm-fate"><button type="button" className="gm-ask" onClick={() => void settleFate(chat, true)}><Icon name="dice" size={15} /><span><b>{t('game.fate.reroll')}</b><small>{t('game.fate.left', { n: s.fate })}</small></span></button><button type="button" className="btn" onClick={() => void settleFate(chat, false)}>{t('game.fate.accept')}</button></div> : null}
    {ask && !busy ? <button type="button" className="gm-ask" onClick={() => resolveAsk(chat, ask)}><Icon name={ask.k === 'check' ? 'dice' : ask.k === 'fight' ? 'star' : 'play'} size={15} /><span><b>{label}</b>{why ? <small>{why}</small> : null}</span></button> : null}
    {picks.length ? <div className="choices gm-picks">{picks.map((x, i) => <button key={i} type="button" className="choice" onClick={e => { if (e.shiftKey) putDraft(x); else void chatApi.send(x); }}>{x}</button>)}</div> : null}
  </div>;
}

// ── 대화에 남는 기록 카드 ──
export function GameCard({ m }: { m: Msg }) {
  const r = (m as GameMsg).gm; if (!r) return null;
  if (r.kind === 'start') return <div className="gm-card-rec is-start"><span className="eyebrow">game</span><b>{t('game.rec.start')}</b></div>;
  if (r.kind === 'qte') return <div className={`gm-card-rec is-${r.speed === 'timeout' ? 'lose' : 'win'}`}><span className="eyebrow">{t('game.qte.title')}</span><b>{r.speed === 'timeout' ? t('game.qte.timeout') : r.choice}</b>{r.speed === 'timeout' ? null : <small>{r.took.toFixed(1)}s / {r.secs}s · {t('game.qte.' + r.speed)}</small>}</div>;
  if (r.kind === 'session') return <div className="gm-card-rec is-start"><span className="eyebrow">{t('game.journal.sessionN', { n: r.n })}</span><b>{t('game.rec.session')}</b><small>{r.text}</small></div>;
  if (r.kind === 'check') {
    const grade = r.grade || (r.crit === 'hit' ? 'crit' : r.crit === 'miss' ? 'fumble' : r.ok ? 'ok' : 'fail'), dice = r.dice?.length ? r.dice : [r.die], rule = r.rule || 'd20';
    return <div className={`gm-card-rec is-${r.ok ? 'win' : 'lose'}`}>
      <span className="eyebrow">{t('game.rec.check', { stat: t('game.stat.' + r.stat) })}{rule === '2d6' ? '' : rule === 'd100' ? ` · ≤ ${r.dc}` : rule === 'pool' ? ` · ${t('game.rec.need', { n: r.dc })}` : ` · DC ${r.dc}`}{r.note ? ` · ${r.note}` : ''}</span>
      <div className="gm-roll">{dice.map((v, i) => rule === 'd20' || rule === '5e' ? <D20 key={i} dim={dice.length > 1 && i !== dice.indexOf(r.die)}>{v}</D20> : <i key={i} className={`gm-die${rule === 'pool' && v >= 5 ? ' is-hit' : ''}`}>{v}</i>)}
        {rule === 'd100' ? null : rule === 'pool' ? <><span>→</span><strong>{r.total}</strong></> : <><span>{sign(r.mod)}</span><span>=</span><strong>{r.total}</strong></>}
        <em>{t(r.open ? 'game.fate.pending' : 'game.grade.' + grade)}</em></div>
      {r.why || r.rerolled ? <small>{[r.why, r.rerolled ? t('game.fate.used') : ''].filter(Boolean).join(' · ')}</small> : null}</div>;
  }
  if (r.kind === 'fight') return <div className={`gm-card-rec is-${r.outcome === 'win' ? 'win' : r.outcome === 'lose' ? 'lose' : 'draw'}`}>
    <span className="eyebrow">{t('game.rec.fight')}</span><b>{r.name}</b>
    <small>{t('game.fight.end.' + r.outcome)} · {t('game.rec.rounds', { n: r.rounds })} · {t('game.rec.took', { n: r.took })} · HP {r.hp}/{r.hpMax}{r.loot ? ` · +${r.loot}` : ''}</small></div>;
  const foe = S.get('chars', m.charId)?.name || m.name || t('game.foe');
  return <div className={`gm-card-rec is-${r.outcome}`}>
    <span className="eyebrow">{t('game.mini.' + r.game)}</span><b>{r.outcome === 'win' ? t('game.rec.youWon') : r.outcome === 'lose' ? t('game.rec.foeWon', { name: foe }) : t('game.out.draw')}</b>
    {r.score || r.stake ? <small>{[r.score, r.stake].filter(Boolean).join(' · ')}</small> : null}</div>;
}
export type { StatKey };
