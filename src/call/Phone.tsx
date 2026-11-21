// 통화 화면. 휴대폰(좁은 화면)은 화면 전체 한 단, 넓은 화면 · 가로로 눕힌 휴대폰은 두 단:
// 왼쪽 = 상대 · 지금 하는 말(크게, 읽는 자리를 따라 짚음) · 단추, 오른쪽 = 주고받은 말 · 말하기
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { shownUrl } from '../lib/blobUrl';
import { createRoot } from 'react-dom/client';
import { S } from '../lib/core';
import { Emblem, Icon } from '../kit';
import { I } from '../lib/icons';
import { t } from '../i18n';
import { tt } from './strings';
import * as C from './logic';
import { cfg, saveCfg } from './cfg';
import { listen, sttSupported } from '../lib/stt';
import { TTS } from '../tts/api';
import { cfg as ttsCfg, saveCfg as saveTts } from '../tts/config';
import { ReadAlong, useReadingState } from '../tts/ReadAlong';

// 전화 아이콘들 (아이콘 표에 더한다)
Object.assign(I, {
  phone: 'M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  phoneOff: 'M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2zM3 3l18 18',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  micOff: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18',
  rec: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  keypad: 'M6 5h.01M12 5h.01M18 5h.01M6 10h.01M12 10h.01M18 10h.01M6 15h.01M12 15h.01M18 15h.01M12 20h.01',
});

const useSession = () => { useSyncExternalStore(C.subscribe, C.version); return C.session(); };
const useNow = (on: boolean) => { const [, set] = useState(0); useEffect(() => { if (!on) return; const id = setInterval(() => set(x => x + 1), 1000); return () => clearInterval(id); }, [on]); return Date.now(); };
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
/** 두 단으로 펼칠 만큼 넓은가 (PC · 태블릿 가로 · 가로로 눕힌 휴대폰) */
const WIDE = '(min-width: 900px), (orientation: landscape) and (min-width: 600px) and (max-height: 560px)';
const mqSub = (f: () => void) => { const m = matchMedia(WIDE); m.addEventListener('change', f); return () => m.removeEventListener('change', f); };
const useWide = () => useSyncExternalStore(mqSub, () => matchMedia(WIDE).matches);

function Key({ ic, label, on, onClick, cls = '', disabled }: { ic: string; label: string; on?: boolean; onClick: () => void; cls?: string; disabled?: boolean }) {
  return <button type="button" className={`call-key ${cls} ${on ? 'on' : ''}`.trim()} aria-pressed={on} disabled={disabled} onClick={onClick}><i><Icon name={ic} size={22} /></i><span>{label}</span></button>;
}
const Ava = ({ c }: { c: { avatar?: string; name?: string; tags?: string[] } }) => <span className="call-ava">{c.avatar ? <img src={shownUrl(c.avatar)} alt="" /> : <Emblem o={c as never} />}</span>;

const NOTE = /^\((.+) (joined|left) the call\)$/;
/** 이 통화의 줄을 읽고 있으면 그 줄 */
const readingLine = (s: C.Session, key: string | undefined) => key?.startsWith('call:') ? s.lines.find(l => l.who === 'c' && C.lineKey(l) === key) || null : null;
/** 지금 화면 한가운데에 크게 둘 줄: 읽는 줄 → 없으면 맨 끝 캐릭터 대사 */
const focusLine = (s: C.Session, key: string | undefined) => readingLine(s, key) || [...s.lines].reverse().find(l => l.who === 'c' && !l.note) || null;

/** 줄 하나: 말풍선. 누르면 고를 수 있고, 고른 줄 아래에 조작 단추가 나온다. 읽는 중이면 읽는 자리를 짚고, 문장을 누르면 거기부터 다시 읽는다 */
function LineRow({ s, l, i, picked, pick, lead }: { s: C.Session; l: C.Line; i: number; picked: boolean; pick: (i: number) => void; lead: boolean }) {
  const [edit, setEdit] = useState<string | null>(null);
  const group = s.chars.length > 1 || s.lines.some(x => x.by && x.by !== s.char.id), who = l.who === 'c' ? C.charOfLine(s, l) : null;
  if (l.note) { const m = l.text.match(NOTE); return <p className="note">{m ? tt(m[2] === 'joined' ? 'call.note.joined' : 'call.note.left', { name: m[1] }) : l.text}</p>; }
  const waiting = !l.text && l.who === 'c', last = C.lastReply(s) === l, idle = !s.talking;
  const save = () => { if (edit != null && edit.trim()) C.editLine(i, edit); setEdit(null); };
  const jump = (at: number, reading: boolean) => { if (!reading || C.streaming(l)) return false; C.replay(i, at); return true; };
  return <div className={`call-line ${l.who === 'u' ? 'me' : 'them'}${picked ? ' picked' : ''}${lead ? ' lead' : ''}`}>
    {group && who ? <small className="call-who">{who.name}</small> : null}
    {edit != null
      ? <div className="call-edit"><textarea className="inp" rows={3} value={edit} autoFocus onChange={e => setEdit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } if (e.key === 'Escape') setEdit(null); }} />
        <div><button type="button" className="btn sm" onClick={() => setEdit(null)}>{tt('call.do.cancel')}</button><button type="button" className="btn sm primary" onClick={save}>{tt('call.do.save')}</button></div></div>
      : <p onClick={() => { if (!waiting) pick(picked ? -1 : i); }}>{waiting ? <span className="call-dots"><i /><i /><i /></span> : l.who === 'c' ? <ReadAlong text={l.text} k={C.lineKey(l)} onJump={jump} /> : l.text}{l.cut ? <em>—</em> : null}</p>}
    {edit == null && !waiting && (picked || (last && idle)) && s.phase === 'connected' ? <div className="call-acts">
      {last && l.alts && l.alts.length > 1 ? <><button type="button" title={tt('call.do.prevAlt')} aria-label={tt('call.do.prevAlt')} disabled={!idle} onClick={() => C.swipe(-1)}><Icon name="left" size={14} /></button><span>{`${(l.alt ?? 0) + 1}/${l.alts.length}`}</span><button type="button" title={tt('call.do.nextAlt')} aria-label={tt('call.do.nextAlt')} disabled={!idle} onClick={() => C.swipe(1)}><Icon name="right" size={14} /></button></> : null}
      {last ? <button type="button" title={tt('call.do.anotherHint')} disabled={!idle} onClick={() => void C.another()}><Icon name="refresh" size={14} /><b>{tt('call.do.another')}</b></button> : null}
      {l.who === 'c' && s.speaker ? <button type="button" title={tt('call.do.replay')} aria-label={tt('call.do.replay')} onClick={() => C.replay(i)}><Icon name="volume" size={14} /></button> : null}
      <button type="button" title={tt('call.do.edit')} aria-label={tt('call.do.edit')} disabled={!idle && last} onClick={() => setEdit(l.text)}><Icon name="edit" size={14} /></button>
    </div> : null}
  </div>;
}

/** 읽기 조작: 앞 문장 · 멈춤/이어 듣기 · 다음 문장 (이 통화의 목소리가 나는 동안만 누를 수 있다) */
function ReadCtl({ on }: { on: boolean }) {
  const r = useReadingState(), mine = on && !!r?.key.startsWith('call:'), paused = mine && !!r?.paused;
  return <span className={`call-rd${mine ? ' live' : ''}`} role="group" aria-label={t('call.read.title')}>
    <button type="button" title={t('call.read.back')} aria-label={t('call.read.back')} disabled={!mine} onClick={() => TTS.step(-1)}><Icon name="skipBack" size={15} /></button>
    <button type="button" className="call-rd-main" title={paused ? t('call.read.resume') : t('call.read.pause')} aria-label={paused ? t('call.read.resume') : t('call.read.pause')} aria-pressed={paused} disabled={!mine} onClick={() => paused ? TTS.resume() : TTS.pause()}><Icon name={paused ? 'play' : 'pause'} size={15} /></button>
    <button type="button" title={t('call.read.next')} aria-label={t('call.read.next')} disabled={!mine || !r?.canNext} onClick={() => TTS.step(1)}><Icon name="skipFwd" size={15} /></button>
  </span>;
}

/** 크게 보이는 지금의 말 (넓은 화면) */
function NowCaption({ s }: { s: C.Session }) {
  const r = useReadingState(), l = focusLine(s, r?.key), who = l ? C.charOfLine(s, l) : null, i = l ? s.lines.indexOf(l) : -1;
  const reading = !!l && r?.key === C.lineKey(l);
  return <div className={`call-now${reading ? ' reading' : ''}${r?.paused && reading ? ' paused' : ''}`} aria-live="polite">
    {l && who ? <>
      <div className="call-now-who">{s.chars.length > 1 ? <Ava c={who} /> : null}<b>{who.name}</b><small>{reading ? (r?.paused ? t('call.read.pausedNow') : t('call.read.now')) : C.streaming(l) ? t('call.read.coming') : ''}</small></div>
      <div className="call-now-text">{l.text ? <ReadAlong text={l.text} k={C.lineKey(l)} onJump={(at, rd) => { if (!rd || C.streaming(l)) return false; C.replay(i, at); return true; }} /> : <span className="call-dots"><i /><i /><i /></span>}{l.cut ? <em>—</em> : null}</div>
      {s.phase === 'connected' && s.speaker ? <div className="call-now-foot"><ReadCtl on /><small>{reading ? t('call.read.tapHint') : ''}</small></div> : null}
    </> : <p className="call-now-empty">{s.phase === 'connected' ? t('call.read.waiting') : ''}</p>}
  </div>;
}

/** 더 보기: 좁은 화면에서는 키패드 · 녹음 · 사람 추가도 여기에. 말 빠르기 · 글자 크기 · 전화기 소리 */
function MoreSheet({ s, wide, adding, setAdding, close }: { s: C.Session; wide: boolean; adding: boolean; setAdding: (f: (x: boolean) => boolean) => void; close: () => void }) {
  const c = cfg(), tc = ttsCfg(), [, bump] = useState(0), canAdd = s.chat.charIds.length > 1;
  const setRate = (v: number) => { tc.rate = v; void saveTts(); bump(n => n + 1); };
  const setSize = (v: 's' | 'm' | 'l') => { c.textSize = v; void saveCfg(); C.touch(); bump(n => n + 1); };
  const rates = [0.8, 1, 1.25, 1.5];
  return <div className="call-more" role="dialog" aria-label={t('call.more.title')}>
    <div className="call-more-head"><b>{t('call.more.title')}</b><button type="button" className="call-more-x" aria-label={tt('call.do.close')} onClick={close}><Icon name="x" size={16} /></button></div>
    {!wide ? <div className="call-more-keys">
      <Key ic="keypad" label={tt('call.do.keypad')} on={s.keypad} onClick={() => { C.toggle('keypad'); close(); }} />
      <Key ic="rec" label={tt('call.do.record')} on={s.rec} onClick={() => C.toggle('rec')} />
      {canAdd ? <Key ic="plus" label={tt('call.do.add')} on={adding} disabled={s.chars.length >= C.MAX_PARTY} onClick={() => { setAdding(x => !x); close(); }} /> : null}
    </div> : null}
    <div className="call-more-row"><span>{t('call.more.rate')}</span><span className="call-seg" role="radiogroup">{rates.map(v => <button key={v} type="button" role="radio" aria-checked={Math.abs(+tc.rate - v) < 0.01} className={Math.abs(+tc.rate - v) < 0.01 ? 'on' : ''} onClick={() => setRate(v)}>{v === 1 ? t('call.more.rateNormal') : `${v}×`}</button>)}</span></div>
    <div className="call-more-row"><span>{t('call.more.size')}</span><span className="call-seg" role="radiogroup">{(['s', 'm', 'l'] as const).map(v => <button key={v} type="button" role="radio" aria-checked={c.textSize === v} className={c.textSize === v ? 'on' : ''} onClick={() => setSize(v)}>{t('call.more.size.' + v)}</button>)}</span></div>
    <label className="call-more-row call-more-check"><span>{t('call.more.lineFx')}<small>{t('call.more.lineFxHint')}</small></span><input type="checkbox" checked={!!c.lineFx} onChange={e => { c.lineFx = e.target.checked; void saveCfg(); bump(n => n + 1); }} /></label>
  </div>;
}

/** 그룹 방에서 전화 단추를 눌렀을 때: 누구에게 걸지 · 누구끼리의 통화를 엿들을지 */
function PickerScreen({ p, t: now }: { p: C.Picker; t: number }) {
  const [topic, setTopic] = useState('');
  const list = C.membersOf(p.chat), n = p.sel.length;
  return <div className="call-veil phase-pick" role="dialog" aria-label={tt('call.pick.title')}>
    <div className="call-device">
    <div className="call-phone">
      <div className="call-bar"><span>{hhmm(new Date(now))}</span><span className="call-bar-r"><i className="call-sig"><b /><b /><b /><b /></i><i className="call-bat"><b /></i></span></div>
      <div className="call-pick-head"><b>{tt('call.pick.title')}</b><small>{tt('call.pick.hint', { count: C.MAX_PARTY })}</small></div>
      <div className="call-pick-list">{list.map(c => { const on = p.sel.includes(c.id), st = C.statusOf(p.chat, c);
        return <button key={c.id} type="button" className={`call-contact${on ? ' on' : ''}`} aria-pressed={on} disabled={p.busy} onClick={() => C.togglePick(c.id)}>
          <Ava c={c} />
          <span className="call-contact-main"><b>{c.name}</b><small><i className={`call-st is-${st.status}`} />{tt('schedule.status.' + st.status)}{st.activity ? ` · ${st.activity}` : ''}</small></span>
          <i className="call-check">{on ? <Icon name="check" size={14} /> : null}</i>
        </button>; })}</div>
      {n >= 2 ? <div className="call-pick-topic"><input className="inp" value={topic} disabled={p.busy} placeholder={tt('call.listen.topicPh')} onChange={e => setTopic(e.target.value)} /><small>{tt('call.listen.hint')}</small></div> : null}
      <div className="call-pick-do">
        <button type="button" className="btn primary" disabled={!n || p.busy} onClick={C.dialPicked}><Icon name="phone" size={16} />{n > 1 ? tt('call.pick.dialMany', { count: n }) : tt('call.pick.dial')}</button>
        <button type="button" className="btn" disabled={n < 2 || p.busy} title={tt('call.listen.hint')} onClick={() => void C.overhearPicked(topic.trim())}>{p.busy ? tt('call.listen.writing') : tt('call.listen.btn')}</button>
      </div>
      <div className="call-end-row"><Key ic="x" label={tt('call.do.close')} onClick={C.closePicker} disabled={p.busy} /></div>
    </div></div>
  </div>;
}

function Phone() {
  const s = useSession(), p = C.picker(), wide = useWide(), now = useNow(!!s || !!p), [text, setText] = useState(''), [picked, setPicked] = useState(-1), [adding, setAdding] = useState(false), [ghosting, setGhosting] = useState(false), [more, setMore] = useState(false);
  const box = useRef<HTMLDivElement>(null), inp = useRef<HTMLInputElement>(null), count = s?.lines.length || 0, tail = s?.lines[count - 1]?.text.length || 0;
  const r = useReadingState(), callReading = !!r?.key.startsWith('call:') && !r.paused;
  // 새 줄이 오면 맨 아래로. 목소리가 읽는 동안은 읽는 자리를 따라가므로(ReadAlong) 건드리지 않는다
  useEffect(() => { const b = box.current; if (b && picked < 0 && !callReading && +(b.dataset.holdUntil || 0) < Date.now()) b.scrollTop = b.scrollHeight; }, [count, tail, picked, callReading]);
  useEffect(() => { if (s?.phase === 'connected') { if (matchMedia('(hover: hover)').matches) inp.current?.focus(); } else { setPicked(-1); setAdding(false); setMore(false); } }, [s?.phase]);
  const stopMic = useRef<(() => void) | null>(null), [hearing, setHearing] = useState(false);   // (훅은 아래의 이른 반환보다 앞에 둔다)
  if (!s) return p ? <PickerScreen p={p} t={now} /> : null;
  const ch = s.char, ringing = s.phase === 'ringing', dialing = s.phase === 'dialing', live = s.phase === 'connected', ended = s.phase === 'ended';
  const party = s.chars, group = party.length > 1, canAdd = live && s.chat.charIds.length > 1 && s.chars.length < C.MAX_PARTY, addable = canAdd ? C.membersOf(s.chat).filter(c => !s.chars.includes(c)) : [];
  const state = ringing ? tt('call.state.ringing') : dialing ? tt('call.state.dialing') : ended ? (s.result === 'answered' ? tt('call.state.ended') : tt('call.result.' + (s.result || 'missed'))) : s.hold ? tt('call.state.hold') : C.fmtDur(now - s.startedAt);
  const speakingId = s.talking ? [...s.lines].reverse().find(l => l.who === 'c' && !l.note)?.by : (readingLine(s, r?.key)?.by || '');
  const send = () => { const v = text.trim(); setText(''); setPicked(-1); void C.userSays(v); };
  // 말로 하기: 누르면 듣고, 말을 마치면 그대로 보낸다 (전화처럼)
  const mic = () => {
    if (hearing) return void stopMic.current?.();
    setHearing(true);
    stopMic.current = listen({ onText: (f, i) => setText(f + i), onEnd: said => { setHearing(false); stopMic.current = null; if (said) { setText(''); setPicked(-1); void C.userSays(said); } } });
  };
  const ghost = async () => { if (ghosting) return; setGhosting(true); try { const g = await C.ghost(text.trim()); if (g) { setText(g); inp.current?.focus(); } } finally { setGhosting(false); } };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  const title = group ? party.map(c => c.name).join(' · ') : ch.name;
  const hasLines = live || (ended && s.lines.length > 0), side = wide && hasLines, lead = focusLine(s, r?.key);
  const size = cfg().textSize || 'm';
  const headEl = <div className="call-head">
        {group
          ? <div className="call-party">{party.map(c => <button key={c.id} type="button" className={`call-member${speakingId === c.id ? ' talking' : ''}`} title={live ? tt('call.do.kick', { name: c.name }) : c.name} disabled={!live} onClick={() => C.kick(c.id)}>
              <Ava c={c} /><small>{c.name}</small>{live ? <i className="call-x"><Icon name="x" size={10} /></i> : null}</button>)}</div>
          : <div className={`call-portrait ${s.talking || speakingId ? 'talking' : ''}`}>{ch.avatar ? <img src={shownUrl(ch.avatar)} alt="" /> : <Emblem o={ch} />}{ringing || dialing ? <><i className="call-frame f1" aria-hidden /><i className="call-frame f2" aria-hidden /></> : null}</div>}
        <div className="call-id">
          <b className="call-name">{group ? tt('call.group.title', { count: party.length }) : ch.name}</b>
          <span className="call-state">{s.rec && live ? <i className="call-recdot" /> : null}{state}{live && (s.talking || callReading) ? <i className="call-wave"><b /><b /><b /><b /></i> : null}</span>
          {s.absent.length ? <small className="call-used">{tt('call.group.absent', { names: s.absent.map(c => c.name).join(', ') })}</small> : null}
          {s.calls ? <small className="call-used">{tt('call.used', { count: s.calls })}</small> : null}
        </div>
        {live && !wide && s.speaker ? <ReadCtl on /> : null}
      </div>;
  const linesEl = hasLines ? <div className="call-lines" ref={box}>{s.lines.map((l, i) => <LineRow key={i} s={s} l={l} i={i} picked={picked === i} pick={setPicked} lead={!wide && l === lead && l.who === 'c'} />)}</div> : <div className="call-space"><i className="call-star" /></div>;
  const extraEl = live && (adding || s.keypad) ? <div className="call-extra">{adding ? <div className="call-add">{addable.length ? addable.map(c => <button key={c.id} type="button" className="call-contact" onClick={() => { setAdding(false); void C.invite(c.id); }}>
        <Ava c={c} /><span className="call-contact-main"><b>{c.name}</b><small>{tt('schedule.status.' + C.statusOf(s.chat, c).status)}</small></span><i className="call-check"><Icon name="plus" size={14} /></i></button>) : <small>{tt('call.group.noOne')}</small>}</div> : null}
        {s.keypad ? <div className="call-pad">{keys.map(k => <button key={k} type="button" onClick={() => { C.press(k); setText(x => x + k); }}>{k}</button>)}</div> : null}</div> : null;
  const sayEl = live ? <form className="call-say" onSubmit={e => { e.preventDefault(); send(); }}>
        <button type="button" className={`ibtn call-ghost${ghosting ? ' busy' : ''}`} title={tt('call.do.ghostHint')} aria-label={tt('call.do.ghost')} disabled={s.muted || s.hold || ghosting} onClick={() => void ghost()}><Icon name="sparkle" /></button>
        {sttSupported() && S.settings.ux?.mic === true ? <button type="button" className={`ibtn call-mic${hearing ? ' on' : ''}`} title={hearing ? tt('call.do.micStop') : tt('call.do.mic')} aria-label={tt('call.do.mic')} aria-pressed={hearing} disabled={s.muted || s.hold} onClick={mic}><Icon name="mic" /></button> : null}
        <input ref={inp} className="inp" value={text} disabled={s.muted || s.hold} enterKeyHint="send" placeholder={s.muted ? tt('call.input.muted') : hearing ? tt('call.input.hearing') : ghosting ? tt('call.input.ghosting') : tt('call.input.ph')} onChange={e => setText(e.target.value)} />
        <button type="submit" className="ibtn call-send" title={text.trim() ? tt('call.do.send') : tt('call.do.nudge')} aria-label={text.trim() ? tt('call.do.send') : tt('call.do.nudge')} disabled={s.muted || s.hold}><Icon name={text.trim() ? 'send' : 'right'} /></button>
      </form> : null;
  const dockEl = <div className="call-dock">
        {live && more ? <MoreSheet s={s} wide={wide} adding={adding} setAdding={setAdding} close={() => setMore(false)} /> : null}
        {live ? <div className="call-grid">
          <Key ic={s.muted ? 'micOff' : 'mic'} label={tt('call.do.mute')} on={s.muted} onClick={() => C.toggle('muted')} />
          {wide ? <Key ic="keypad" label={tt('call.do.keypad')} on={s.keypad} onClick={() => C.toggle('keypad')} /> : null}
          <Key ic="volume" label={tt('call.do.speaker')} on={s.speaker} onClick={() => C.toggle('speaker')} />
          {wide ? <Key ic="rec" label={tt('call.do.record')} on={s.rec} onClick={() => C.toggle('rec')} /> : null}
          <Key ic="pause" label={tt('call.do.hold')} on={s.hold} onClick={() => C.toggle('hold')} />
          {wide && s.chat.charIds.length > 1 ? <Key ic="plus" label={tt('call.do.add')} on={adding} disabled={!canAdd} onClick={() => setAdding(x => !x)} /> : null}
          <Key ic="more" label={t('call.do.more')} cls="call-more-key" on={more} onClick={() => setMore(x => !x)} />
        </div> : null}
        <div className="call-end-row">
          {ringing ? <>
            <Key ic="phoneOff" label={tt('call.do.decline')} cls="hang" onClick={C.decline} />
            <Key ic="edit" label={tt('call.do.textInstead')} onClick={C.textInstead} />
            <Key ic="phone" label={tt('call.do.accept')} cls="pick" onClick={C.accept} />
          </> : ended ? <>
            <Key ic="x" label={tt('call.do.close')} onClick={C.close} />
            {s.result !== 'declined' ? <Key ic="phone" label={tt('call.card.callback')} cls="pick" onClick={() => { const chat = s.chat, who = [...s.chars, ...s.absent]; C.close(); C.dial(chat, who); }} /> : null}
          </> : <Key ic="phoneOff" label={tt('call.do.hangup')} cls="hang" onClick={C.hangup} />}
        </div>
      </div>;
  return <div className={`call-veil phase-${s.phase}${group ? ' is-group' : ''}${wide ? ' is-wide' : ' is-narrow'}${side ? ' has-side' : ''} size-${size}`} role="dialog" aria-label={title}>
    <div className="call-device">
    <div className="call-phone">
      {side
        ? <><div className="call-stage">{headEl}<NowCaption s={s} />{dockEl}</div><div className="call-side">{linesEl}{extraEl}{sayEl}</div></>
        : <>{!wide ? <div className="call-bar"><span>{hhmm(new Date(now))}</span><span className="call-bar-r"><i className="call-sig"><b /><b /><b /><b /></i><i className="call-bat"><b /></i></span></div> : null}{headEl}{linesEl}{extraEl}{sayEl}{dockEl}</>}
    </div>
    </div>
  </div>;
}

let mounted = false;
/** 통화 화면을 한 번 붙여 둔다 (통화가 없으면 아무것도 그리지 않는다) */
export function mountPhone() {
  if (mounted) return; mounted = true;
  const el = document.createElement('div'); el.id = 'call-root'; document.body.append(el);
  createRoot(el).render(<Phone />);
}
