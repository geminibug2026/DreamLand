// 게임 화면: 그림 배경 위에 인물이 서고, 아래 글 상자에서 이야기를 한 문단씩 읽는다.
// 판정 · 전투 · 놀이는 이 화면에서 바로 이어지고, 가장자리에는 지금 상태(장소 · 시간 · 체력 · 시계)가 놓인다
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Chat, Msg } from '../lib/types';
import type { ChatX } from '../addons/types';
import { S, on as listenTo } from '../lib/core';
import { t } from '../i18n';
import { cur } from '../chat/store';
import { chatApi, generate, running, shownText, stopAll } from '../chat/actions';
import { Sprites, charIdOf, currentOf } from '../expressions/store';
import { fmt, pagesOf } from '../vn/Screen';
import { Ambience, Music, setSfx, sfx } from './sfx';
import { Weather, airOf } from './Weather';
import { elapsedOf, gameOf, pendingAsk, pendingFate, sceneOf, sheetOf, trackOf, type GameMsg, type GameRec } from './state';
import { GameCard, askLabel, openSheet, resolveAsk, rewindTo, settleFate } from './ui';
import { bgFor, loadMedia, trackByName, trackFor } from './media';
import { ClockDial, Glyph, Keystone, Rule, type GlyphName } from './Art';

interface Page { key: string; msgId: string; who: 'c' | 'u' | 'n' | 'e'; charId: string; name: string; text: string; rec?: GameRec; msg: Msg }
/** 되돌아볼 수 있는 메시지 수. 세션을 마무리해 프롬프트에서 뺀(숨긴) 메시지도 읽을 수는 있다 */
const LOOKBACK = 400;
function build(chat: Chat, msgs: Msg[]): Page[] {
  const out: Page[] = [], me = S.persona(chat).name || t('game.you');
  for (const m of msgs.filter(x => !(x as { call?: unknown }).call).slice(-LOOKBACK)) {
    const rec = (m as GameMsg).gm;
    if (rec) { if (rec.kind !== 'start') out.push({ key: m.id, msgId: m.id, who: 'e', charId: '', name: '', text: '', rec, msg: m }); continue; }
    const who = m.role === 'user' ? 'u' : m.role === 'assistant' ? 'c' : 'n', charId = who === 'c' ? charIdOf(m, chat as ChatX) : '';
    const name = who === 'u' ? me : who === 'c' ? S.get('chars', charId)?.name || m.name || '' : '';
    pagesOf(shownText(m)).forEach((text, i) => out.push({ key: `${m.id}:${m.sw}:${i}`, msgId: m.id, who, charId, name, text, msg: m }));
  }
  return out;
}
const tail = (msgs: Msg[]) => { const m = msgs[msgs.length - 1]; return m ? `${m.id}:${m.sw}:${(m.swipes[m.sw]?.text || '').length}` : ''; };

// 화면을 다시 그릴 때마다 새로 만들어지지 않게 바깥에 둔다 (안에 두면 누르는 도중에 단추가 바뀌어 눌리지 않고 깜빡인다)
const Tool = ({ d, label, onClick }: { d: GlyphName; label: string; onClick(): void }) => <button type="button" title={label} aria-label={label} onClick={onClick}><Glyph name={d} /></button>;

function Screen({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const [, bump] = useState(0), [pos, setPos] = useState(-1), [draft, setDraft] = useState(''), [sound, setSound] = useState(true);
  const box = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), lastEnd = useRef(''), restored = useRef(false), was = useRef({ gold: -1, scene: '', ask: false, hp: -1 }), [cine, setCine] = useState(''), played = useRef(new Set<string>()), cineTm = useRef(0);
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
    // 다시 들어왔을 때는 보던 문단에서 이어 본다
    if (!restored.current) { restored.current = true; const i = g?.at ? pages.findIndex(p => p.key === g.at) : -1; if (i >= 0) { if (i >= pages.length - 1) lastEnd.current = pages[i].msgId; return setPos(i); } }
    const seen = lastEnd.current, at = seen ? pages.map(p => p.msgId).lastIndexOf(seen) : -1;
    // 내가 방금 보낸 말은 건너뛴다 (되돌아가면 볼 수 있다)
    if (at >= 0 && at < pages.length - 1) { let i = at + 1; while (i < pages.length - 1 && pages[i].who === 'u') i++; setPos(i); }
    else if (at < 0) { const last = pages[pages.length - 1].msgId; setPos(pages.findIndex(p => p.msgId === last)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  const at = Math.min(Math.max(pos, 0), Math.max(pages.length - 1, 0)), page = pages[at], atEnd = at >= pages.length - 1;
  useEffect(() => { if (atEnd && page && !busy) lastEnd.current = page.msgId; }, [atEnd, page, busy]);
  const fate = !busy && atEnd ? pendingFate(msgs) : null;
  const ask = !busy && atEnd ? pendingAsk(msgs) : null, waiting = busy && atEnd, canAct = atEnd && !busy;
  const lastMsg = msgs[msgs.length - 1], picks = canAct && !ask && lastMsg?.role === 'assistant' ? (lastMsg.swipes[lastMsg.sw] as { gchoices?: string[] } | undefined)?.gchoices || [] : [];
  useEffect(() => { box.current?.scrollTo(0, 0); }, [page?.key]);
  // 머리글(장소 · 상태)의 높이만큼 인물을 내려 놓는다 — 시계가 여럿이거나 이름이 길어도 겹치지 않게
  const head = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = head.current, w = wrap.current; if (!h || !w) return; const set = () => w.style.setProperty('--gs-head', Math.ceil(h.getBoundingClientRect().height) + 'px'); set(); const ro = new ResizeObserver(set); ro.observe(h); return () => ro.disconnect(); }, [!!sheet]);
  // 보던 자리를 방에 적어 둔다 (조금 머문 뒤에만 — 빠르게 넘기는 동안에는 쓰지 않는다)
  useEffect(() => {
    if (!page || !g || !chat || !restored.current || g.at === page.key) return;
    const tm = window.setTimeout(() => { g.at = page.key; void S.save('chats', chat, true); }, 700);
    return () => clearTimeout(tm);
  }, [page?.key, g, chat]);

  // 소리: 장면에 맞는 음악, 장소가 바뀌거나 돈이 생기거나 할 일이 생기면 짧은 소리
  const fighting = !!document.querySelector('.gm-fight'), scene = sheet ? sceneOf(sheet) : 'road', on = sound && g?.music !== false;
  useEffect(() => { setSfx(sound && g?.sfx !== false); Music.set(on); if (on && sheet && g) { const tr = trackOf(sheet, g, fighting), mine = !fighting && sheet.music.startsWith('name:') ? trackByName(sheet.music.slice(5)) : ''; Music.play(tr, mine || trackFor(tr, sheet.place)); } }, [on, sound, g, sheet, fighting]);
  useEffect(() => () => { Music.stop(); Ambience.stop(); }, []);
  // 날씨: 화면에는 비 · 눈 · 안개 · 낙엽을, 귀에는 빗소리와 바람을. 실내에서는 소리만 먹먹하게 들린다
  const air = useMemo(() => sheet ? airOf(sheet, scene) : null, [sheet, scene]);
  const ambOn = sound && g?.sfx !== false, wetNow = air && (air.sky === 'rain' || air.sky === 'storm');
  useEffect(() => { if (!air || !ambOn) return Ambience.set(''); Ambience.set(wetNow ? 'rain' : air.sky === 'wind' || (air.sky === 'snow' && air.power > .8) ? 'wind' : '', air.power, air.indoor); }, [air, ambOn, wetNow]);
  // 실내에서는 번개가 보이지 않지만 천둥은 가끔 들린다
  useEffect(() => { if (!air || air.sky !== 'storm' || !air.indoor || !ambOn) return; const tm = window.setInterval(() => { if (Math.random() < .5) Ambience.thunder(true); }, 14000); return () => clearInterval(tm); }, [air, ambOn]);
  useEffect(() => {
    if (!sheet) return; const w = was.current;
    if (w.gold >= 0 && sheet.gold > w.gold) sfx('coin'); if (w.scene && w.scene !== scene) sfx('door'); if (ask && !w.ask) sfx('notify');
    if (w.hp >= 0 && sheet.hp < w.hp) play('hurt');
    was.current = { gold: sheet.gold, scene, ask: !!ask, hp: sheet.hp };
  }, [sheet, scene, ask]);

  // 연출: 진행자가 붙인 효과는 그 답변을 처음 볼 때 한 번, 다치면 화면이 흔들린다
  const play = (name: string) => { clearTimeout(cineTm.current); setCine(''); requestAnimationFrame(() => setCine(name)); if (name !== 'letterbox') cineTm.current = window.setTimeout(() => setCine(c => c === name ? '' : c), 900); };
  useEffect(() => {
    if (!page || page.who === 'e') return; const list = (page.msg.swipes[page.msg.sw] as { gcine?: string[] } | undefined)?.gcine;
    if (list?.length && !played.current.has(page.msgId)) { played.current.add(page.msgId); play(list[0]); } else if (!list?.length && cine === 'letterbox') setCine('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.msgId]);
  // 자동 넘김: 다 읽을 만한 시간이 지나면 다음 문단으로 (글이 길수록 조금 더 기다린다)
  const auto = g?.auto || 0;
  useEffect(() => {
    if (!auto || atEnd || !page) return;
    const tm = window.setTimeout(() => { if (!document.querySelector('.modal-wrap, .menu')) step(1); }, auto * 1000 + (page.text?.length || 40) * 55);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, page?.key, atEnd]);
  const total = useRef(0); total.current = pages.length;
  // 세션 다시 보기 등: 그 메시지의 첫 문단으로 간다
  const pagesRef = useRef(pages); pagesRef.current = pages;
  useEffect(() => listenTo<string>('game:goto', id => { const i = pagesRef.current.findIndex(p => p.msgId === id); if (i >= 0) setPos(i); }), []);
  const [toWhom, setToWhom] = useState<'' | 'party' | 'ooc'>('');
  const step = (d: number) => setPos(p => Math.min(Math.max(Math.min(Math.max(p, 0), Math.max(total.current - 1, 0)) + d, 0), Math.max(total.current - 1, 0)));
  const send = (text = draft, plain = false) => { const v = text.trim(); if (!v || busy) return; setDraft(''); void chatApi.send(plain || !toWhom ? v : toWhom === 'ooc' ? `[OOC] ${v}` : `[To companions] ${v}`); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-wrap, .menu, .palette-wrap, .call-veil')) return;
      const el = e.target as HTMLElement | null; if (el?.matches?.('textarea, input, [contenteditable]')) return;
      if ((e.key === ' ' || e.key === 'Enter') && el?.closest?.('button')) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } else if (e.key === 'End') { e.preventDefault(); setPos(total.current - 1); } else if (e.key === 'Home') { e.preventDefault(); setPos(0); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!chat || !g || !sheet) return null;

  let standId = ''; for (let i = at; i >= 0 && !standId; i--) if (pages[i]?.who === 'c') standId = pages[i].charId;
  standId ||= chat.charIds[0] || '';
  const stand = S.get('chars', standId), sprite = standId && Sprites.has(standId) ? currentOf(chat as ChatX, msgs, standId).sprite : null;
  const bg = chat.bg || bgFor(scene, sheet.place), el = sheet.mins ? elapsedOf(sheet.mins) : null, wxText = sheet.weather || (sheet.wx ? t('game.wx.' + sheet.wx) : ''), when = [sheet.time || (el ? t('game.elapsed', { day: el.day, time: `${String(el.h).padStart(2, '0')}:${String(el.m).padStart(2, '0')}` }) : ''), wxText].filter(Boolean).join(' · ');
  const hpLow = sheet.hp <= sheet.hpMax / 4, lastAi = lastMsg?.role === 'assistant';
  let body: ReactNode;
  if (!page) body = <p className="gs-text gs-faint">{busy ? '' : t('game.stage.empty')}</p>;
  else if (page.who === 'e') body = <div className="gs-event" key={page.key}><GameCard m={page.msg} /></div>;
  else body = <p className="gs-text" key={page.key}>{fmt(page.text)}{waiting ? <span className="typing"><i /><i /><i /></span> : null}</p>;

  const title = sheet.place || chatApi.roomName(chat);
  return <div ref={wrap} className={`gs${page?.who === 'u' ? ' is-me' : ''}${fighting ? ' is-fight' : ''}${cine ? ' fx-' + cine : ''}`}>
    <div className={`gs-bg${bg ? '' : ' is-plain'}`} key={bg} style={bg ? { backgroundImage: `url("${bg}")` } : undefined} />
    {air ? <Weather air={air} onFlash={() => { if (ambOn) window.setTimeout(() => Ambience.thunder(false), 500 + Math.random() * 2200); }} /> : null}
    <div className="gs-shade" /><div className="gs-cine" />
    <div className="gs-head" ref={head}>
    <header className="gs-top">
      <div className="gs-loc">{when ? <span className="gs-eyebrow">{when}</span> : null}<h1 className={title.length > 22 ? 'is-xlong' : title.length > 12 ? 'is-long' : undefined} title={title}>{title}</h1></div>
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
      <div className="gs-stats"><span title={t('game.fate.hint')}><small>{t('game.fate')}</small>{sheet.fate}</span><span><small>LV</small>{sheet.level}</span><span><small>{t('game.gold')}</small>{sheet.gold}</span></div>
      {sheet.meters.map(m => <div key={m.name} className="gs-clock gs-mbar"><small>{m.name}</small><span className="gs-meter"><i style={{ width: `${m.v / m.max * 100}%` }} /></span><em>{m.v}/{m.max}</em></div>)}
      {sheet.clocks.map(c => <div key={c.name} className={`gs-clock${c.v >= c.max ? ' is-full' : ''}`}><ClockDial v={c.v} max={c.max} /><small>{c.name}</small><em>{c.v}/{c.max}</em></div>)}
      {sheet.party.length ? <div className="gs-party">{sheet.party.map(n => { const c = S.chars.find(x => x.name.toLowerCase() === n.toLowerCase()); return <span key={n} title={n} style={c?.avatar ? { backgroundImage: `url("${c.avatar}")` } : undefined}>{c?.avatar ? '' : n.slice(0, 1)}</span>; })}</div> : null}
    </aside>
    </div>
    <div className={`gs-figure${sprite?.data ? ' is-sprite' : ''}`} onClick={() => step(1)}>
      {sprite?.data ? <img className="gs-sprite" src={sprite.data} alt="" /> : stand?.avatar ? <div className="gs-arch"><Keystone /><i style={{ backgroundImage: `url("${stand.avatar}")` }} /></div> : null}
    </div>
    <section className="gs-panel" onClick={e => { if (!(e.target as HTMLElement).closest('button, textarea, .gs-acts, .gs-ctl')) step(1); }}>
      <Rule />
      <div className="gs-bar">
        {page?.name ? <div className="gs-name"><i />{page.name}</div> : page?.who === 'e' ? <div className="gs-name is-event"><i />{t('game.stage.event')}</div> : <span />}
        {/* 넘기기와 헷갈리지 않게, 조작 단추는 글 위 오른쪽에 따로 모아 둔다 */}
        <div className="gs-ctl">
          {page && !busy && !atEnd ? <button type="button" className="gs-mini" title={t('game.rewind.tip')} aria-label={t('game.rewind.tip')} onClick={() => void rewindTo(page.msgId)}><Glyph name="rewind" size={18} /></button> : null}
          {busy ? <button type="button" className="gs-mini is-stop" title={t('vn.stop')} aria-label={t('vn.stop')} onClick={() => stopAll()}><Glyph name="stop" size={18} /></button>
            : canAct && lastAi ? <button type="button" className="gs-mini" title={t('vn.regen')} aria-label={t('vn.regen')} onClick={() => void generate('regen')}><Glyph name="redo" size={18} /></button> : null}
          <button type="button" className={`gs-auto${auto ? ' on' : ''}`} title={t('game.stage.autoTip')} aria-pressed={!!auto} onClick={() => { g.auto = auto ? 0 : 4; void S.save('chats', chat, true); bump(n => n + 1); }}><i />AUTO</button>
        </div>
      </div>
      <div className="gs-scroll" ref={box}>{body}</div>
      <div className="gs-rail">
        <button type="button" className="gs-mini" title={t('vn.back')} aria-label={t('vn.back')} disabled={at <= 0} onClick={e => { e.currentTarget.blur(); step(-1); }}><Glyph name="back" size={18} /></button>
        <span className="gs-count">{pages.length ? `${at + 1} / ${pages.length}` : ''}</span>
        <button type="button" className="gs-mini gs-end" title={t('game.stage.toEnd')} aria-label={t('game.stage.toEnd')} disabled={atEnd} onClick={e => { e.currentTarget.blur(); setPos(pages.length - 1); }}><Glyph name="end" size={18} /></button>
        <i />
        {canAct && !lastAi && !fate && pages.length ? <button type="button" className="gs-retry" onClick={() => void generate('normal')}><Glyph name="redo" size={16} />{t('game.stage.retry')}</button> : null}
        {!atEnd ? <span className="gs-next">{t('game.stage.next')}<Glyph name="fwd" size={14} /></span> : null}
      </div>
      {canAct ? <div className="gs-acts">
        {fate ? <div className="gs-fate"><button type="button" className="gs-ask" onClick={() => void settleFate(chat, true)}><b>{t('game.fate.reroll')}</b><small>{t('game.fate.left', { n: sheet.fate })}</small></button><button type="button" className="gs-plain" onClick={() => void settleFate(chat, false)}>{t('game.fate.accept')}</button></div> : null}
        {ask ? <button type="button" className="gs-ask" onClick={() => resolveAsk(chat, ask)}><b>{askLabel(ask)}</b>{'why' in ask && ask.why ? <small>{ask.why}</small> : 'stake' in ask && ask.stake ? <small>{ask.stake}</small> : null}</button> : null}
        {picks.length ? <ol className="gs-picks">{picks.map((x, i) => <li key={i}><button type="button" onClick={() => send(x, true)}><small>{['I', 'II', 'III', 'IV', 'V'][i]}</small>{x}</button></li>)}</ol> : null}
        {!ask && !fate ? <div className="gs-whom">{([['', 'act'], ...(sheet.party.length ? [['party', 'party']] : []), ['ooc', 'ooc']] as ['' | 'party' | 'ooc', string][]).map(([k, n]) => <button key={n} type="button" className={toWhom === k ? 'on' : ''} onClick={() => setToWhom(k)}>{t('game.whom.' + n)}</button>)}</div> : null}
        {!ask && !fate ? <div className="gs-write">
          <textarea ref={input} rows={1} value={draft} placeholder={t(toWhom === 'ooc' ? 'game.whom.oocPh' : toWhom === 'party' ? 'game.whom.partyPh' : 'game.stage.placeholder')} onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 132) + 'px'; }}
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
