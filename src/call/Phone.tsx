// 통화 화면: 휴대폰은 화면 전체, PC 는 가운데 휴대폰 한 대(몸체 · 옆 버튼 · 카메라 구멍 · 홈 막대).
// 걸려 옴 · 거는 중 · 끝남: 가운데 큰 얼굴(둥글게 솟은 판) · 큰 이름 · 지금 상황과 배경 소리.
// 통화 중: 위에 굵은 큰 숫자 시계 · 이름 · 상황 칩, 오른쪽에 말할 때 숨 쉬는 얼굴 → 지금 하는 말(소리 모양 막대 · 읽는 자리) → 주고받은 말 → 말하기 → 단추 한 줄.
// 부드럽게 솟고 눌리는 판(뉴모피즘)으로, 색은 옅은 회색 바탕에 파스텔 하늘색 하나와 아주 조금의 장밋빛. 모양은 --call-* 변수로 바꿀 수 있다 (css/call.css).
// 성능: 통화가 없으면 아무것도 그리지 않고 시계 · 그리기 루프를 돌리지 않는다. 소리 모양은 말하는 동안에만 requestAnimationFrame 으로 막대의 transform 만 바꾼다.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { S } from '../lib/core';
import { Emblem, Icon, useArt } from '../kit';
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
  voicemail: 'M6.5 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17.5 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM6.5 15.5h11',
});

const useSession = () => { useSyncExternalStore(C.subscribe, C.version); return C.session(); };
/** 지금 시각 — 쓰는 작은 조각만 다시 그린다 (통화 화면 전체가 1초마다 다시 그려지지 않게). every 밀리초마다, 그 경계에 맞춰 */
const useNow = (on: boolean, every = 1000) => {
  const [, set] = useState(0);
  useEffect(() => { if (!on) return; let id = 0; const next = () => { id = window.setTimeout(() => { set(x => x + 1); next(); }, every - (Date.now() % every) + 15); }; next(); return () => clearTimeout(id); }, [on, every]);
  return Date.now();
};
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const reduced = () => typeof matchMedia === 'function' && (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('no-motion'));

function Key({ ic, label, on, onClick, cls = '', disabled }: { ic: string; label: string; on?: boolean; onClick: () => void; cls?: string; disabled?: boolean }) {
  return <button type="button" className={`call-key ${cls} ${on ? 'on' : ''}`.trim()} aria-pressed={on} disabled={disabled} onClick={onClick}><i><Icon name={ic} size={22} /></i><span>{label}</span></button>;
}
const Face = ({ src }: { src: string }) => { const u = useArt(src); return u ? <img src={u} alt="" /> : null; };
const Ava = ({ c }: { c: { avatar?: string; name?: string; tags?: string[] } }) => <span className="call-ava">{c.avatar ? <Face src={c.avatar} /> : <Emblem o={c as never} />}</span>;
/** PC 의 휴대폰 몸체 장식: 옆 버튼 · 카메라 구멍 · 홈 막대 (휴대폰 화면에서는 CSS 가 숨긴다) */
const SideKeys = () => <><i className="call-side vol-up" aria-hidden /><i className="call-side vol-down" aria-hidden /><i className="call-side power" aria-hidden /></>;
/** 상태 줄의 시각은 분이 바뀔 때만 */
const StatusBar = () => { const now = useNow(true, 60000); return <div className="call-bar"><span>{hhmm(new Date(now))}</span><span className="call-bar-r"><i className="call-sig"><b /><b /><b /><b /></i><i className="call-bat"><b /></i></span></div>; };
/** 작은 선 그림 (우리가 그린 것): 반짝이 셋 · 소리 물결 */
const Doodle = () => <svg className="call-doodle" viewBox="0 0 120 120" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
  <path className="d1" d="M98 9c1 7 3 9 9 10-6 1-8 3-9 10-1-7-3-9-9-10 6-1 8-3 9-10zM111 33c.5 3.5 1.5 4.5 4.5 5-3 .5-4 1.5-4.5 5-.5-3.5-1.5-4.5-4.5-5 3-.5 4-1.5 4.5-5z" />
  <circle cx="84" cy="10" r="1.6" />
  <path className="d2" d="M16 92c-4-5-4-13 0-18M9 98c-7-9-7-21 0-30M23 87c-2-2-2-6 0-8" />
  <path className="d3" d="M92 104c3-2 6-2 9 0s6 2 9 0" />
</svg>;

/** 굵은 큰 숫자 시계 (분:초). from 부터 to(없으면 지금)까지 — 흐르는 동안 이것만 1초마다 다시 그린다 */
const Clock = ({ from, to, label }: { from: number; to?: number; label: string }) => {
  const now = useNow(!!from && !to), ms = from ? (to || now) - from : 0;
  const [m, sec] = C.fmtDur(ms).split(':'); return <span className="call-clock" role="timer" aria-label={label}><b>{m}</b><i aria-hidden>:</i><b>{sec}</b></span>;
};

/** 지금 상황 칩: 상태 점 · 하는 일 · 배경 소리 */
function Situation({ s, c }: { s: C.Session; c?: { id: string } }) {
  const st = c && c.id !== s.char.id ? C.statusOf(s.chat, c as never) : { status: s.status, activity: s.activity };
  return <div className="call-situ">
    <span className="call-chip"><i className={`call-st is-${st.status}`} />{st.activity || tt('schedule.status.' + st.status)}</span>
    {s.amb ? <span className="call-chip amb"><Icon name="wave" size={12} />{t('tts.bed.' + s.amb)}</span> : null}
  </div>;
}

// ── 소리 모양: 말하는 동안만 읽어 주기의 목소리 크기를 받아 막대 · 얼굴 테에 반영한다 ──
const BARS = 14;
function useMeter(active: boolean) {
  const bars = useRef<(HTMLElement | null)[]>([]), ring = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active || reduced()) return;
    let raf = 0, hist: number[] = new Array(BARS).fill(0), last = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 45) return; last = ts;   // 초당 스무 번쯤이면 충분하다 (느린 기기에서 아껴 쓴다)
      const lv = TTS.level?.() ?? 0;
      hist = [...hist.slice(1), lv];
      bars.current.forEach((b, i) => { if (b) b.style.transform = `scaleY(${(0.14 + hist[i] * 0.86).toFixed(3)})`; });
      if (ring.current) ring.current.style.transform = `scale(${(1 + lv * 0.09).toFixed(3)})`;
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); bars.current.forEach(b => { if (b) b.style.transform = ''; }); if (ring.current) ring.current.style.transform = ''; };
  }, [active]);
  return { bars, ring };
}

const NOTE = /^\((.+) (joined|left) the call\)$/;
/** 이 통화의 줄을 읽고 있으면 그 줄 */
const readingLine = (s: C.Session, key: string | undefined) => key?.startsWith('call:') ? s.lines.find(l => l.who === 'c' && C.lineKey(l) === key) || null : null;
/** 맨 끝 캐릭터 대사 */
const lastSaid = (s: C.Session) => [...s.lines].reverse().find(l => l.who === 'c' && !l.note) || null;
/** 위의 "지금 하는 말" 에 둘 줄: 읽는 줄(멈춘 것 포함) → 없으면 지금 받아 적는 줄. 둘 다 없으면 그 자리를 비운다 */
const nowLine = (s: C.Session, key: string | undefined) => readingLine(s, key) || (s.talking ? lastSaid(s) : null);

/** 줄 하나: 말풍선 (내 말은 오른쪽, 상대 말은 왼쪽). 누르면 고를 수 있고, 고른 줄 · 마지막 답 아래에 작은 도구 줄이 붙는다 */
function LineRow({ s, l, i, picked, pick }: { s: C.Session; l: C.Line; i: number; picked: boolean; pick: (i: number) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const group = s.chars.length > 1 || s.lines.some(x => x.by && x.by !== s.char.id), who = l.who === 'c' ? C.charOfLine(s, l) : null;
  if (l.note) { const m = l.text.match(NOTE); return <p className="note">{m ? tt(m[2] === 'joined' ? 'call.note.joined' : 'call.note.left', { name: m[1] }) : l.text}</p>; }
  const waiting = !l.text && l.who === 'c', last = C.lastReply(s) === l, idle = !s.talking;
  const save = () => { if (edit != null && edit.trim()) C.editLine(i, edit); setEdit(null); };
  const jump = (at: number, reading: boolean) => { if (!reading || C.streaming(l)) return false; C.replay(i, at); return true; };
  const alts = last && !!l.alts && l.alts.length > 1 ? l.alts : null;
  return <div className={`call-line ${l.who === 'u' ? 'me' : 'them'}${picked ? ' picked' : ''}${edit != null ? ' editing' : ''}`}>
    {group && who ? <small className="call-who">{who.name}</small> : null}
    {edit != null
      ? <div className="call-edit"><textarea className="inp" rows={3} value={edit} autoFocus onChange={e => setEdit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } if (e.key === 'Escape') setEdit(null); }} />
        <div><button type="button" className="btn sm" onClick={() => setEdit(null)}>{tt('call.do.cancel')}</button><button type="button" className="btn sm primary" onClick={save}>{tt('call.do.save')}</button></div></div>
      : <p onClick={() => { if (!waiting) pick(picked ? -1 : i); }}>{waiting ? <span className="call-dots"><i /><i /><i /></span> : l.who === 'c' ? <ReadAlong text={l.text} k={C.lineKey(l)} onJump={jump} /> : l.text}{l.cut ? <em>—</em> : null}</p>}
    {edit == null && !waiting && (picked || (last && idle)) && s.phase === 'connected' ? <div className="call-acts" role="toolbar">
      {alts ? <span className="call-alt"><button type="button" title={tt('call.do.prevAlt')} aria-label={tt('call.do.prevAlt')} disabled={!idle} onClick={() => C.swipe(-1)}><Icon name="left" size={14} /></button><span>{`${(l.alt ?? 0) + 1}/${alts.length}`}</span><button type="button" title={tt('call.do.nextAlt')} aria-label={tt('call.do.nextAlt')} disabled={!idle} onClick={() => C.swipe(1)}><Icon name="right" size={14} /></button></span> : null}
      {last ? <button type="button" title={tt('call.do.anotherHint')} disabled={!idle} onClick={() => void C.another()}><Icon name="refresh" size={14} /><b>{tt('call.do.another')}</b></button> : null}
      {picked && l.who === 'c' && s.speaker ? <button type="button" title={tt('call.do.replay')} aria-label={tt('call.do.replay')} onClick={() => C.replay(i)}><Icon name="volume" size={14} /></button> : null}
      <button type="button" title={tt('call.do.edit')} aria-label={tt('call.do.edit')} disabled={!idle && last} onClick={() => setEdit(l.text)}><Icon name="edit" size={14} /></button>
    </div> : null}
  </div>;
}

/** 지금 하는 말: 소리 모양 막대 · 누가 · 지금 말하는 줄(읽는 자리를 짚음). 말하는 동안만 채워지고, 그 밖에는 "듣는 중" 한 줄.
 *  누르면 멈춤 · 이어 듣기, ‹ › 로 앞뒤 문장 */
function Caption({ s }: { s: C.Session }) {
  const r = useReadingState(), l = nowLine(s, r?.key), who = l ? C.charOfLine(s, l) : null;
  const voice = s.speaker && TTS.enabled();
  const reading = voice && !!l && r?.key === C.lineKey(l), paused = reading && !!r?.paused, group = s.chars.length > 1;
  const { bars } = useMeter(reading && !paused);
  const mode = s.hold ? 'hold' : reading ? (paused ? 'paused' : 'speaking') : s.talking ? 'thinking' : 'listening';
  const label = { hold: tt('call.state.hold'), paused: t('call.read.pausedNow'), speaking: t('call.read.now'), thinking: t('call.now.thinking'), listening: t('call.now.listening') }[mode];
  const toggle = () => { if (!reading) return; if (paused) TTS.resume(); else TTS.pause(); };
  return <div className={`call-now is-${mode}`} role="group" aria-label={t('call.read.title')}>
    <div className="call-now-top">
      <button type="button" className="call-now-step" title={t('call.read.back')} aria-label={t('call.read.back')} disabled={!reading} onClick={() => TTS.step(-1)}><Icon name="left" size={14} /></button>
      <span className="call-now-tag">
        <span className="call-wave" aria-hidden>{Array.from({ length: BARS }, (_, i) => <b key={i} ref={el => { bars.current[i] = el; }} />)}</span>
        {group && who && reading ? <b className="call-now-who">{who.name}</b> : null}
        <small aria-live="polite">{label}</small>
      </span>
      <button type="button" className="call-now-step" title={t('call.read.next')} aria-label={t('call.read.next')} disabled={!reading || !r?.canNext} onClick={() => TTS.step(1)}><Icon name="right" size={14} /></button>
    </div>
    {/* 자막: 읽는 동안만 글이 있고, 그 밖에는 자리만 지킨다 (아래 기록이 오르내리지 않게) */}
    <div className="call-now-text" role="button" tabIndex={reading ? 0 : -1} aria-pressed={paused} aria-label={reading ? (paused ? t('call.read.resume') : t('call.read.pause')) : undefined} title={reading ? t('call.read.tapHint') : undefined}
      onClick={toggle} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
      {reading && l?.text ? <ReadAlong text={l.text} k={C.lineKey(l)} follow="page" /> : null}{reading && l?.cut ? <em>—</em> : null}</div>
  </div>;
}

/** 얼굴: 둥글게 솟은 판. 말하는 동안 테가 소리 크기에 맞춰 숨 쉰다 (talking: 말을 준비하거나 읽는 중) */
function Portrait({ c, big, ringingNow, talking, speaking }: { c: { avatar?: string; name?: string; tags?: string[] }; big?: boolean; ringingNow?: boolean; talking?: boolean; speaking?: boolean }) {
  const { ring } = useMeter(!!speaking);
  return <div className={`call-portrait${big ? ' big' : ''}${talking ? ' talking' : ''}`}>
    <i className="call-halo" ref={el => { ring.current = el; }} aria-hidden />
    <span className="call-face">{c.avatar ? <Face src={c.avatar} /> : <Emblem o={c as never} />}</span>
    {ringingNow ? <><i className="call-ripple r1" aria-hidden /><i className="call-ripple r2" aria-hidden /></> : null}
  </div>;
}

/** 더 보기: 키패드 · 녹음 · 사람 추가, 말 빠르기 · 글자 크기 · 전화기 소리 */
function MoreSheet({ s, adding, setAdding, close }: { s: C.Session; adding: boolean; setAdding: (f: (x: boolean) => boolean) => void; close: () => void }) {
  const c = cfg(), tc = ttsCfg(), [, bump] = useState(0), canAdd = s.chat.charIds.length > 1;
  const setRate = (v: number) => { tc.rate = v; void saveTts(); bump(n => n + 1); };
  const setSize = (v: 's' | 'm' | 'l') => { c.textSize = v; void saveCfg(); C.touch(); bump(n => n + 1); };
  const rates = [0.8, 1, 1.25, 1.5];
  return <div className="call-more" role="dialog" aria-label={t('call.more.title')}>
    <div className="call-more-head"><b>{t('call.more.title')}</b><button type="button" className="call-more-x" aria-label={tt('call.do.close')} onClick={close}><Icon name="x" size={16} /></button></div>
    <div className="call-more-keys">
      <Key ic="keypad" label={tt('call.do.keypad')} on={s.keypad} onClick={() => { C.toggle('keypad'); close(); }} />
      <Key ic="rec" label={tt('call.do.record')} on={s.rec} onClick={() => C.toggle('rec')} />
      {canAdd ? <Key ic="plus" label={tt('call.do.add')} on={adding} disabled={s.chars.length >= C.MAX_PARTY} onClick={() => { setAdding(x => !x); close(); }} /> : null}
    </div>
    <div className="call-more-row"><span>{t('call.more.rate')}</span><span className="call-seg" role="radiogroup">{rates.map(v => <button key={v} type="button" role="radio" aria-checked={Math.abs(+tc.rate - v) < 0.01} className={Math.abs(+tc.rate - v) < 0.01 ? 'on' : ''} onClick={() => setRate(v)}>{v === 1 ? t('call.more.rateNormal') : `${v}×`}</button>)}</span></div>
    <div className="call-more-row"><span>{t('call.more.size')}</span><span className="call-seg" role="radiogroup">{(['s', 'm', 'l'] as const).map(v => <button key={v} type="button" role="radio" aria-checked={c.textSize === v} className={c.textSize === v ? 'on' : ''} onClick={() => setSize(v)}>{t('call.more.size.' + v)}</button>)}</span></div>
    <label className="call-more-row call-more-check"><span>{t('call.more.lineFx')}<small>{t('call.more.lineFxHint')}</small></span><input type="checkbox" checked={!!c.lineFx} onChange={e => { c.lineFx = e.target.checked; void saveCfg(); bump(n => n + 1); }} /></label>
  </div>;
}

/** 그룹 방에서 전화 단추를 눌렀을 때: 누구에게 걸지 · 누구끼리의 통화를 엿들을지 */
function PickerScreen({ p }: { p: C.Picker }) {
  const [topic, setTopic] = useState('');
  const list = C.membersOf(p.chat), n = p.sel.length;
  return <div className="call-veil phase-pick" role="dialog" aria-label={tt('call.pick.title')}>
    <div className="call-device"><SideKeys />
    <div className="call-phone">
      <i className="call-island" aria-hidden />
      <StatusBar />
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
      <i className="call-home" aria-hidden />
    </div></div>
  </div>;
}

/** 통화 화면이 닫힐 때 잠깐 남겨 두었다가 스르르 사라지게 (마지막 모습을 들고 있는다) */
function useLeaving<T>(v: T | null, ms = 260): { shown: T | null; leaving: boolean } {
  const [kept, setKept] = useState<T | null>(v);
  useEffect(() => { if (v) { setKept(v); return; } if (!kept) return; if (reduced()) { setKept(null); return; } const id = setTimeout(() => setKept(null), ms); return () => clearTimeout(id); }, [v]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { shown: v || kept, leaving: !v && !!kept };
}

function Phone() {
  const live0 = useSession(), p = C.picker();
  const { shown: s, leaving } = useLeaving(live0);
  const [text, setText] = useState(''), [picked, setPicked] = useState(-1), [adding, setAdding] = useState(false), [ghosting, setGhosting] = useState(false), [more, setMore] = useState(false);
  const box = useRef<HTMLDivElement>(null), inp = useRef<HTMLInputElement>(null), count = s?.lines.length || 0, tail = s?.lines[count - 1]?.text.length || 0;
  const r = useReadingState(), callReading = !!r?.key.startsWith('call:') && !r.paused;
  // 새 줄이 오면 맨 아래로. 목소리가 읽는 동안은 읽는 자리를 따라가므로(ReadAlong) 건드리지 않는다
  useEffect(() => { const b = box.current; if (b && picked < 0 && !callReading && +(b.dataset.holdUntil || 0) < Date.now()) b.scrollTop = b.scrollHeight; }, [count, tail, picked, callReading]);
  useEffect(() => { if (s?.phase === 'connected' || s?.vm === 'rec') { if (matchMedia('(hover: hover)').matches) inp.current?.focus(); } else { setPicked(-1); setAdding(false); setMore(false); } }, [s?.phase, s?.vm]);
  const stopMic = useRef<(() => void) | null>(null), [hearing, setHearing] = useState(false);   // (훅은 아래의 이른 반환보다 앞에 둔다)
  if (!s) return p ? <PickerScreen p={p} /> : null;
  const ch = s.char, ringing = s.phase === 'ringing', dialing = s.phase === 'dialing', live = s.phase === 'connected', ended = s.phase === 'ended';
  const vm = ended && s.vm ? s.vm : null, canLeave = ended && s.result === 'unanswered' && !s.vm;
  const party = s.chars, group = party.length > 1, canAdd = live && s.chat.charIds.length > 1 && s.chars.length < C.MAX_PARTY, addable = canAdd ? C.membersOf(s.chat).filter(c => !s.chars.includes(c)) : [];
  const state = vm ? (vm === 'sent' ? t('call.vm.sent') : vm === 'greet' ? t('call.vm.connecting') : t('call.vm.recording')) : ringing ? tt('call.state.ringing') : dialing ? tt('call.state.dialing') : ended ? (s.result === 'answered' ? tt('call.state.ended') : tt('call.result.' + (s.result || 'missed'))) : s.hold ? tt('call.state.hold') : tt('call.state.connected');
  const speakingId = s.talking ? lastSaid(s)?.by : (readingLine(s, r?.key)?.by || '');
  const speaking = callReading && !!readingLine(s, r?.key);
  const say = (v: string) => { setText(''); setPicked(-1); if (vm === 'rec') void C.sendMessage(v); else void C.userSays(v); };
  const send = () => say(text.trim());
  // 말로 하기: 누르면 듣고, 말을 마치면 그대로 보낸다 (전화처럼)
  const mic = () => {
    if (hearing) return void stopMic.current?.();
    setHearing(true);
    stopMic.current = listen({ onText: (f, i) => setText(f + i), onEnd: said => { setHearing(false); stopMic.current = null; if (said) say(said); } });
  };
  const ghost = async () => { if (ghosting) return; setGhosting(true); try { const g = await C.ghost(text.trim()); if (g) { setText(g); inp.current?.focus(); } } finally { setGhosting(false); } };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  const title = group ? party.map(c => c.name).join(' · ') : ch.name;
  const hasLines = live || (ended && !vm && s.lines.length > 0);
  const hero = !hasLines;
  const size = cfg().textSize || 'm';
  const talkingNow = live && (s.talking || speaking);
  const canSay = live || vm === 'rec';
  return <div className={`call-veil phase-${s.phase}${vm ? ' is-vm' : ''}${group ? ' is-group' : ''}${hasLines ? ' has-lines' : ''}${talkingNow ? ' is-talking' : ''} size-${size}${leaving ? ' out' : ''}`} role="dialog" aria-label={title}>
    {/* 기기: PC 에서는 휴대폰 몸체(둥근 테 · 옆 버튼 · 카메라 구멍 · 홈 막대), 휴대폰에서는 화면 전체 */}
    <div className="call-device"><SideKeys />
    <div className="call-phone">
      <i className="call-island" aria-hidden />
      <StatusBar />
      {hero ? <div className="call-hero">
        <span className="call-kicker"><i className={`call-kdot${ringing || dialing || vm === 'rec' ? ' live' : ''}${vm === 'rec' ? ' rec' : ''}`} />{state}</span>
        {group ? <div className="call-party big">{party.map(c => <span key={c.id} className="call-member"><Ava c={c} /><small>{c.name}</small></span>)}</div>
          : <div className="call-hero-face"><Portrait c={ch} big ringingNow={ringing || dialing} /><Doodle /></div>}
        <b className="call-name">{group ? tt('call.group.title', { count: party.length }) : ch.name}</b>
        {!ended ? <Situation s={s} /> : null}
        {vm === 'rec' ? <Clock from={s.startedAt} label={t('call.vm.recording')} /> : ended && !vm && s.startedAt ? <Clock from={s.startedAt} to={s.endedAt} label={tt('call.state.ended')} /> : null}
        {vm ? <small className="call-hint">{vm === 'rec' ? t('call.vm.hint') : vm === 'sent' ? t('call.vm.sentHint', { name: ch.name }) : t('call.vm.greetHint')}</small> : null}
        {s.absent.length ? <small className="call-used">{tt('call.group.absent', { names: s.absent.map(c => c.name).join(', ') })}</small> : null}
        {ended && s.calls ? <small className="call-used">{tt('call.used', { count: s.calls })}</small> : null}
      </div> : <div className="call-top">
        <div className="call-top-main">
          <span className="call-state"><i className={`call-live${s.rec ? ' rec' : ''}${s.hold ? ' hold' : ''}${ended ? ' off' : ''}`} title={s.rec ? tt('call.do.record') : undefined} />{state}</span>
          <Clock from={s.startedAt} to={ended ? s.endedAt || Date.now() : undefined} label={state} />
          <b className="call-name">{group ? party.map(c => c.name).join(' · ') : ch.name}</b>
          {!group ? <Situation s={s} /> : null}
        </div>
        {group ? <div className="call-party">{party.map(c => <button key={c.id} type="button" className={`call-member${speakingId === c.id ? ' talking' : ''}`} title={live ? tt('call.do.kick', { name: c.name }) : c.name} disabled={!live} onClick={() => C.kick(c.id)}>
          <Ava c={c} /><small>{c.name}</small>{live ? <i className="call-x"><Icon name="x" size={10} /></i> : null}</button>)}</div>
          : <Portrait c={ch} talking={talkingNow} speaking={speaking} />}
        {group && s.absent.length ? <small className="call-used">{tt('call.group.absent', { names: s.absent.map(c => c.name).join(', ') })}</small> : null}
      </div>}
      {live ? <Caption s={s} /> : null}
      {hasLines ? <div className="call-lines" ref={box}>{s.lines.map((l, i) => <LineRow key={i} s={s} l={l} i={i} picked={picked === i} pick={setPicked} />)}</div> : null}
      {live && (adding || s.keypad) ? <div className="call-extra">{adding ? <div className="call-add">{addable.length ? addable.map(c => <button key={c.id} type="button" className="call-contact" onClick={() => { setAdding(false); void C.invite(c.id); }}>
        <Ava c={c} /><span className="call-contact-main"><b>{c.name}</b><small>{tt('schedule.status.' + C.statusOf(s.chat, c).status)}</small></span><i className="call-check"><Icon name="plus" size={14} /></i></button>) : <small>{tt('call.group.noOne')}</small>}</div> : null}
        {s.keypad ? <div className="call-pad">{keys.map(k => <button key={k} type="button" onClick={() => { C.press(k); setText(x => x + k); }}>{k}</button>)}</div> : null}</div> : null}
      {canSay ? <form className="call-say" onSubmit={e => { e.preventDefault(); send(); }}>
        {live ? <button type="button" className={`ibtn call-ghost${ghosting ? ' busy' : ''}`} title={tt('call.do.ghostHint')} aria-label={tt('call.do.ghost')} disabled={s.muted || s.hold || ghosting} onClick={() => void ghost()}><Icon name="sparkle" /></button> : null}
        {sttSupported() && S.settings.ux?.mic === true ? <button type="button" className={`ibtn call-mic${hearing ? ' on' : ''}`} title={hearing ? tt('call.do.micStop') : tt('call.do.mic')} aria-label={tt('call.do.mic')} aria-pressed={hearing} disabled={live && (s.muted || s.hold)} onClick={mic}><Icon name="mic" /></button> : null}
        <input ref={inp} className="inp" value={text} disabled={live && (s.muted || s.hold)} enterKeyHint="send" placeholder={vm ? t('call.vm.ph') : s.muted ? tt('call.input.muted') : hearing ? tt('call.input.hearing') : ghosting ? tt('call.input.ghosting') : tt('call.input.ph')} onChange={e => setText(e.target.value)} />
        <button type="submit" className={`ibtn call-send${text.trim() ? ' has-text' : ''}`} title={text.trim() || vm ? tt('call.do.send') : tt('call.do.nudge')} aria-label={text.trim() || vm ? tt('call.do.send') : tt('call.do.nudge')} disabled={(live && (s.muted || s.hold)) || (!!vm && !text.trim())}><Icon name={text.trim() || vm ? 'send' : 'right'} /></button>
      </form> : null}
      <div className="call-dock">
        {live && more ? <MoreSheet s={s} adding={adding} setAdding={setAdding} close={() => setMore(false)} /> : null}
        {/* 통화 중: 음소거 · 스피커 · [끊기] · 보류 · 더 보기 한 줄 (CSS 가 끊기를 가운데로 옮긴다) */}
        {live ? <div className="call-grid">
          <Key ic={s.muted ? 'micOff' : 'mic'} label={tt('call.do.mute')} on={s.muted} onClick={() => C.toggle('muted')} />
          <Key ic="volume" label={tt('call.do.speaker')} on={s.speaker} onClick={() => C.toggle('speaker')} />
          <Key ic="pause" label={tt('call.do.hold')} on={s.hold} onClick={() => C.toggle('hold')} />
          <Key ic="more" label={t('call.do.more')} cls="call-more-key" on={more} onClick={() => setMore(x => !x)} />
        </div> : null}
        <div className="call-end-row">
          {ringing ? <>
            <Key ic="phoneOff" label={tt('call.do.decline')} cls="hang" onClick={C.decline} />
            <Key ic="edit" label={tt('call.do.textInstead')} cls="soft" onClick={C.textInstead} />
            <Key ic="phone" label={tt('call.do.accept')} cls="pick" onClick={C.accept} />
          </> : vm ? <Key ic="x" label={vm === 'rec' ? tt('call.do.cancel') : tt('call.do.close')} onClick={C.close} />
            : ended ? <>
              <Key ic="x" label={tt('call.do.close')} onClick={C.close} />
              {canLeave ? <Key ic="voicemail" label={t('call.vm.leave')} cls="soft" onClick={() => void C.leaveMessage()} /> : null}
              {s.result !== 'declined' ? <Key ic="phone" label={tt('call.card.callback')} cls="pick" onClick={() => { const chat = s.chat, who = [...s.chars, ...s.absent]; C.close(); C.dial(chat, who); }} /> : null}
            </> : <Key ic="phoneOff" label={tt('call.do.hangup')} cls="hang" onClick={C.hangup} />}
        </div>
      </div>
      <i className="call-home" aria-hidden />
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
