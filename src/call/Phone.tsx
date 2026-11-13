// 통화 화면: 화면 위에 휴대폰 한 대 (PC 는 가운데 기기, 휴대폰은 화면 전체)
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Emblem, Icon } from '../kit';
import { I } from '../lib/icons';
import { tt } from './strings';
import * as C from './logic';

// 전화 아이콘들 (아이콘 표에 더한다)
Object.assign(I, {
  phone: 'M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  phoneOff: 'M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2zM3 3l18 18',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  micOff: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18',
  rec: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  keypad: 'M6 5h.01M12 5h.01M18 5h.01M6 10h.01M12 10h.01M18 10h.01M6 15h.01M12 15h.01M18 15h.01M12 20h.01',
  pause: 'M8 5v14M16 5v14',
});

const useSession = () => { useSyncExternalStore(C.subscribe, C.version); return C.session(); };
const useNow = (on: boolean) => { const [, set] = useState(0); useEffect(() => { if (!on) return; const id = setInterval(() => set(x => x + 1), 1000); return () => clearInterval(id); }, [on]); return Date.now(); };
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function Key({ ic, label, on, onClick, cls = '', disabled }: { ic: string; label: string; on?: boolean; onClick: () => void; cls?: string; disabled?: boolean }) {
  return <button type="button" className={`call-key ${cls} ${on ? 'on' : ''}`.trim()} aria-pressed={on} disabled={disabled} onClick={onClick}><i><Icon name={ic} size={20} /></i><span>{label}</span></button>;
}

function Phone() {
  const s = useSession(), t = useNow(!!s), [text, setText] = useState(''), box = useRef<HTMLDivElement>(null), inp = useRef<HTMLInputElement>(null);
  useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; });
  useEffect(() => { if (s?.phase === 'connected') inp.current?.focus(); }, [s?.phase]);
  if (!s) return null;
  const ch = s.char, ringing = s.phase === 'ringing', dialing = s.phase === 'dialing', live = s.phase === 'connected', ended = s.phase === 'ended';
  const state = ringing ? tt('call.state.ringing') : dialing ? tt('call.state.dialing') : ended ? (s.result === 'answered' ? tt('call.state.ended') : tt('call.result.' + (s.result || 'missed'))) : s.hold ? tt('call.state.hold') : C.fmtDur(t - s.startedAt);
  const send = () => { const v = text.trim(); if (!v) return; setText(''); void C.userSays(v); };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  return <div className={`call-veil phase-${s.phase}`} role="dialog" aria-label={ch.name}>
    {/* 기기: PC 에서는 휴대폰 몸체(둥근 검은 테 · 옆 버튼 · 카메라 구멍 · 홈 막대), 좁은 화면에서는 화면 전체 */}
    <div className="call-device"><i className="call-side vol-up" /><i className="call-side vol-down" /><i className="call-side power" />
    <div className="call-phone">
      <i className="call-island" aria-hidden />
      <div className="call-bar"><span>{hhmm(new Date(t))}</span><span className="call-bar-r"><i className="call-sig"><b /><b /><b /><b /></i><i className="call-bat"><b /></i></span></div>
      <div className="call-head">
        <div className={`call-portrait ${s.talking ? 'talking' : ''}`}>{ch.avatar ? <img src={ch.avatar} alt="" /> : <Emblem o={ch} />}<i className="call-moon"><Icon name="moon" size={16} /></i></div>
        <b className="call-name">{ch.name}</b>
        <span className="call-state">{s.rec && live ? <i className="call-recdot" /> : null}{state}</span>
        {s.calls ? <small className="call-used">{tt('call.used', { count: s.calls })}</small> : null}
      </div>
      {live || (ended && s.lines.length) ? <div className="call-lines" ref={box}>{s.lines.flatMap((l, i) => {
        const parts = l.text ? l.text.split('\n').filter(Boolean) : [s.talking && l.who === 'c' ? '…' : ''];   // 답을 준비하는 중 (그사이 내가 보낸 말이 뒤에 있어도)
        return parts.map((p, j) => <p key={`${i}-${j}`} className={l.who === 'u' ? 'me' : 'them'}>{p}{l.cut && j === parts.length - 1 ? <em>—</em> : null}</p>);
      })}</div> : <div className="call-space"><i className="call-star" /></div>}
      {live && s.keypad ? <div className="call-pad">{keys.map(k => <button key={k} type="button" onClick={() => { C.press(k); setText(x => x + k); }}>{k}</button>)}</div> : null}
      {live ? <form className="call-say" onSubmit={e => { e.preventDefault(); send(); }}>
        <input ref={inp} className="inp" value={text} disabled={s.muted || s.hold} placeholder={s.muted ? tt('call.input.muted') : tt('call.input.ph')} onChange={e => setText(e.target.value)} />
        <button type="submit" className="ibtn" title={tt('call.do.send')} aria-label={tt('call.do.send')} disabled={s.muted || s.hold || !text.trim()}><Icon name="send" /></button>
      </form> : null}
      {live ? <div className="call-grid">
        <Key ic={s.muted ? 'micOff' : 'mic'} label={tt('call.do.mute')} on={s.muted} onClick={() => C.toggle('muted')} />
        <Key ic="keypad" label={tt('call.do.keypad')} on={s.keypad} onClick={() => C.toggle('keypad')} />
        <Key ic="volume" label={tt('call.do.speaker')} on={s.speaker} onClick={() => C.toggle('speaker')} />
        <Key ic="rec" label={tt('call.do.record')} on={s.rec} onClick={() => C.toggle('rec')} />
        <Key ic="pause" label={tt('call.do.hold')} on={s.hold} onClick={() => C.toggle('hold')} />
      </div> : null}
      <div className="call-end-row">
        {ringing ? <>
          <Key ic="phoneOff" label={tt('call.do.decline')} cls="hang" onClick={C.decline} />
          <Key ic="phone" label={tt('call.do.accept')} cls="pick" onClick={C.accept} />
        </> : ended ? <Key ic="x" label={tt('call.do.close')} onClick={C.close} /> : <Key ic="phoneOff" label={tt('call.do.hangup')} cls="hang" onClick={C.hangup} />}
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
