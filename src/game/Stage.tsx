// 게임 화면: 그림 배경 위에 인물이 서고, 아래 글 상자에서 이야기를 한 문단씩 읽는다.
// 판정 · 전투 · 놀이는 이 화면에서 바로 이어지고, 가장자리에는 지금 상태(장소 · 시간 · 체력 · 시계)가 놓인다
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Chat, Msg } from '../lib/types';
import type { ChatX } from '../addons/types';
import { S } from '../lib/core';
import { t } from '../i18n';
import { cur } from '../chat/store';
import { chatApi, generate, running, shownText, stopAll } from '../chat/actions';
import { Sprites, charIdOf, currentOf } from '../expressions/store';
import { fmt, pagesOf } from '../vn/Screen';
import { Music, setSfx, sfx } from './sfx';
import { gameOf, pendingAsk, sceneOf, sheetOf, trackOf, type GameMsg, type GameRec } from './state';
import { GameCard, askLabel, openSheet, resolveAsk } from './ui';
import { bgFor, loadMedia, trackFor } from './media';
import { ClockDial, Glyph, Keystone, Rule, type GlyphName } from './Art';

interface Page { key: string; msgId: string; who: 'c' | 'u' | 'n' | 'e'; charId: string; name: string; text: string; rec?: GameRec; msg: Msg }
const LOOKBACK = 60;
function build(chat: Chat, msgs: Msg[]): Page[] {
  const out: Page[] = [], me = S.persona(chat).name || t('game.you');
  for (const m of msgs.filter(x => !x.hidden && !(x as { call?: unknown }).call).slice(-LOOKBACK)) {
    const rec = (m as GameMsg).gm;
    if (rec) { if (rec.kind !== 'start') out.push({ key: m.id, msgId: m.id, who: 'e', charId: '', name: '', text: '', rec, msg: m }); continue; }
    const who = m.role === 'user' ? 'u' : m.role === 'assistant' ? 'c' : 'n', charId = who === 'c' ? charIdOf(m, chat as ChatX) : '';
    const name = who === 'u' ? me : who === 'c' ? S.get('chars', charId)?.name || m.name || '' : '';
    pagesOf(shownText(m)).forEach((text, i) => out.push({ key: `${m.id}:${m.sw}:${i}`, msgId: m.id, who, charId, name, text, msg: m }));
  }
  return out;
}
const tail = (msgs: Msg[]) => { const m = msgs[msgs.length - 1]; return m ? `${m.id}:${m.sw}:${(m.swipes[m.sw]?.text || '').length}` : ''; };

function Screen({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const [, bump] = useState(0), [pos, setPos] = useState(-1), [draft, setDraft] = useState(''), [sound, setSound] = useState(true);
  const box = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), lastEnd = useRef(''), was = useRef({ gold: -1, scene: '', ask: false });
  const chat = cur.chat?.id === chatId ? cur.chat : null, msgs = chat ? cur.msgs : [], busy = running(), g = gameOf(chat);
  useEffect(() => { const tm = window.setInterval(() => { if (cur.chat?.id !== chatId || !gameOf(cur.chat)) return closeStage(); bump(n => n + 1); }, 160); return () => clearInterval(tm); }, [chatId]);
  useEffect(() => { void loadMedia().then(() => bump(n => n + 1)); }, []);
  useEffect(() => { if (chat) void Sprites.load(chat.charIds).then(() => bump(n => n + 1)).catch(() => { }); }, [chat]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pages = useMemo(() => chat ? build(chat, msgs) : [], [chat, msgs, msgs.length, tail(msgs)]);
  const sheet = useMemo(() => g ? sheetOf(g, msgs) : null, [g, msgs, msgs.length, tail(msgs), g?.adj?.length]);

  // 새로 온 이야기는 아직 읽지 않은 첫 문단부터 보여 준다 (판정 결과 → 이어지는 답변 순서로)
  const keys = pages.map(p => p.msgId).join('|');
  useEffect(() => {
    if (!pages.length) return setPos(0);
    const seen = lastEnd.current, at = seen ? pages.map(p => p.msgId).lastIndexOf(seen) : -1;
    // 내가 방금 보낸 말은 건너뛴다 (되돌아가면 볼 수 있다)
    if (at >= 0 && at < pages.length - 1) { let i = at + 1; while (i < pages.length - 1 && pages[i].who === 'u') i++; setPos(i); }
    else if (at < 0) { const last = pages[pages.length - 1].msgId; setPos(pages.findIndex(p => p.msgId === last)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  const at = Math.min(Math.max(pos, 0), Math.max(pages.length - 1, 0)), page = pages[at], atEnd = at >= pages.length - 1;
  useEffect(() => { if (atEnd && page && !busy) lastEnd.current = page.msgId; }, [atEnd, page, busy]);
  const ask = !busy && atEnd ? pendingAsk(msgs) : null, waiting = busy && atEnd, canAct = atEnd && !busy;
  const lastMsg = msgs[msgs.length - 1], picks = canAct && !ask && lastMsg?.role === 'assistant' ? (lastMsg.swipes[lastMsg.sw] as { gchoices?: string[] } | undefined)?.gchoices || [] : [];
  useEffect(() => { box.current?.scrollTo(0, 0); }, [page?.key]);

  // 소리: 장면에 맞는 음악, 장소가 바뀌거나 돈이 생기거나 할 일이 생기면 짧은 소리
  const fighting = !!document.querySelector('.gm-fight'), scene = sheet ? sceneOf(sheet) : 'road', on = sound && g?.music !== false;
  useEffect(() => { setSfx(sound && g?.sfx !== false); Music.set(on); if (on && sheet && g) { const tr = trackOf(sheet, g, fighting); Music.play(tr, trackFor(tr, sheet.place)); } }, [on, sound, g, sheet, fighting]);
  useEffect(() => () => Music.stop(), []);
  useEffect(() => {
    if (!sheet) return; const w = was.current;
    if (w.gold >= 0 && sheet.gold > w.gold) sfx('coin'); if (w.scene && w.scene !== scene) sfx('door'); if (ask && !w.ask) sfx('notify');
    was.current = { gold: sheet.gold, scene, ask: !!ask };
  }, [sheet, scene, ask]);

  const total = useRef(0); total.current = pages.length;
  const step = (d: number) => setPos(p => Math.min(Math.max(Math.min(Math.max(p, 0), Math.max(total.current - 1, 0)) + d, 0), Math.max(total.current - 1, 0)));
  const send = (text = draft) => { const v = text.trim(); if (!v || busy) return; setDraft(''); void chatApi.send(v); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-wrap, .menu, .palette-wrap, .call-veil')) return;
      const el = e.target as HTMLElement | null; if (el?.matches?.('textarea, input, [contenteditable]')) return;
      if ((e.key === ' ' || e.key === 'Enter') && el?.closest?.('button')) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!chat || !g || !sheet) return null;

  let standId = ''; for (let i = at; i >= 0 && !standId; i--) if (pages[i]?.who === 'c') standId = pages[i].charId;
  standId ||= chat.charIds[0] || '';
  const stand = S.get('chars', standId), sprite = standId && Sprites.has(standId) ? currentOf(chat as ChatX, msgs, standId).sprite : null;
  const bg = chat.bg || bgFor(scene, sheet.place), when = [sheet.time, sheet.weather].filter(Boolean).join(' · ');
  const hpLow = sheet.hp <= sheet.hpMax / 4, lastAi = lastMsg?.role === 'assistant';
  const Tool = ({ d, label, onClick }: { d: GlyphName; label: string; onClick(): void }) => <button type="button" title={label} aria-label={label} onClick={onClick}><Glyph name={d} /></button>;
  let body: ReactNode;
  if (!page) body = <p className="gs-text gs-faint">{busy ? '' : t('game.stage.empty')}</p>;
  else if (page.who === 'e') body = <div className="gs-event" key={page.key}><GameCard m={page.msg} /></div>;
  else body = <p className="gs-text" key={page.key}>{fmt(page.text)}{waiting ? <span className="typing"><i /><i /><i /></span> : null}</p>;

  return <div className={`gs${page?.who === 'u' ? ' is-me' : ''}${fighting ? ' is-fight' : ''}`}>
    <div className={`gs-bg${bg ? '' : ' is-plain'}`} key={bg} style={bg ? { backgroundImage: `url("${bg}")` } : undefined} />
    <div className="gs-shade" />
    <header className="gs-top">
      <div className="gs-loc">{when ? <span className="gs-eyebrow">{when}</span> : null}<h1>{sheet.place || chatApi.roomName(chat)}</h1></div>
      <nav className="gs-tools">
        <Tool d="map" label={t('game.tab.map')} onClick={() => openSheet(chat, 'map')} />
        <Tool d="journal" label={t('game.tab.journal')} onClick={() => openSheet(chat, 'journal')} />
        <Tool d="sheet" label={t('game.sheet.title')} onClick={() => openSheet(chat)} />
        <Tool d={sound ? 'soundOn' : 'soundOff'} label={t(sound ? 'game.stage.mute' : 'game.stage.unmute')} onClick={() => setSound(!sound)} />
        <Tool d="exit" label={t('game.stage.exit')} onClick={onClose} />
      </nav>
    </header>
    <aside className="gs-vitals">
      <button type="button" className="gs-hp" title={t('game.sheet.title')} onClick={() => openSheet(chat)}>
        <span className="gs-eyebrow">HP</span><b className={hpLow ? 'is-low' : ''}>{sheet.hp}<i>/{sheet.hpMax}</i></b>
        <span className="gs-meter"><i style={{ width: `${sheet.hp / sheet.hpMax * 100}%` }} className={hpLow ? 'is-low' : ''} /></span>
      </button>
      <div className="gs-stats"><span><small>LV</small>{sheet.level}</span><span><small>{t('game.gold')}</small>{sheet.gold}</span></div>
      {sheet.clocks.map(c => <div key={c.name} className={`gs-clock${c.v >= c.max ? ' is-full' : ''}`}><ClockDial v={c.v} max={c.max} /><small>{c.name}</small><em>{c.v}/{c.max}</em></div>)}
      {sheet.party.length ? <div className="gs-party">{sheet.party.map(n => { const c = S.chars.find(x => x.name.toLowerCase() === n.toLowerCase()); return <span key={n} title={n} style={c?.avatar ? { backgroundImage: `url("${c.avatar}")` } : undefined}>{c?.avatar ? '' : n.slice(0, 1)}</span>; })}</div> : null}
    </aside>
    <div className="gs-figure" onClick={() => step(1)}>
      {sprite?.data ? <img className="gs-sprite" src={sprite.data} alt="" /> : stand?.avatar ? <div className="gs-arch"><Keystone /><i style={{ backgroundImage: `url("${stand.avatar}")` }} /></div> : null}
    </div>
    <section className="gs-panel" onClick={e => { if (!(e.target as HTMLElement).closest('button, textarea, .gs-acts')) step(1); }}>
      <Rule />
      {page?.name ? <div className="gs-name"><i />{page.name}</div> : page?.who === 'e' ? <div className="gs-name is-event"><i />{t('game.stage.event')}</div> : null}
      <div className="gs-scroll" ref={box}>{body}</div>
      <div className="gs-rail">
        <button type="button" className="gs-mini" title={t('vn.back')} aria-label={t('vn.back')} disabled={at <= 0} onClick={e => { e.currentTarget.blur(); step(-1); }}><Glyph name="back" size={18} /></button>
        <span className="gs-count">{pages.length ? `${at + 1} / ${pages.length}` : ''}</span>
        <i />
        {busy ? <button type="button" className="gs-mini" title={t('vn.stop')} aria-label={t('vn.stop')} onClick={() => stopAll()}><Glyph name="stop" size={18} /></button>
          : canAct && lastAi ? <button type="button" className="gs-mini" title={t('vn.regen')} aria-label={t('vn.regen')} onClick={() => void generate('regen')}><Glyph name="redo" size={18} /></button> : null}
        {!atEnd ? <span className="gs-next">{t('game.stage.next')}</span> : null}
      </div>
      {canAct ? <div className="gs-acts">
        {ask ? <button type="button" className="gs-ask" onClick={() => resolveAsk(chat, ask)}><b>{askLabel(ask)}</b>{'why' in ask && ask.why ? <small>{ask.why}</small> : 'stake' in ask && ask.stake ? <small>{ask.stake}</small> : null}</button> : null}
        {picks.length ? <ol className="gs-picks">{picks.map((x, i) => <li key={i}><button type="button" onClick={() => send(x)}><small>{['I', 'II', 'III', 'IV', 'V'][i]}</small>{x}</button></li>)}</ol> : null}
        {!ask ? <div className="gs-write">
          <textarea ref={input} rows={1} value={draft} placeholder={t('game.stage.placeholder')} onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 132) + 'px'; }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <button type="button" className="gs-send" title={t('vn.send')} aria-label={t('vn.send')} disabled={!draft.trim()} onClick={() => send()}><Glyph name="send" size={18} /></button>
        </div> : null}
      </div> : null}
    </section>
  </div>;
}

let root: Root | null = null, host: HTMLElement | null = null, openId = '';
export const stageOpenFor = () => openId;
export function closeStage() { root?.unmount(); host?.remove(); root = null; host = null; openId = ''; document.documentElement.classList.remove('gs-on', 'vn-on'); }
export function openStage(chatId: string, onClose: () => void) {
  if (openId === chatId) return; closeStage();
  host = document.createElement('div'); host.id = 'gs-root'; document.body.append(host);
  // vn-on: 방향키가 뒤의 대화 화면(답변 넘기기)으로 새지 않게 한다
  root = createRoot(host); openId = chatId; document.documentElement.classList.add('gs-on', 'vn-on');
  root.render(<Screen chatId={chatId} onClose={onClose} />);
}
