// 대화 기록에 남는 통화 카드와 녹취록 창
import type { Msg } from '../lib/types';
import { Icon } from '../kit';
import { S } from '../lib/core';
import { TTS } from '../tts/api';
import { openModal } from '../addons/parts';
import { cur } from '../chat/store';
import { tt } from './strings';
import { dial, fmtDur, type CallRec } from './logic';

const nameOf = (m: Msg) => S.get('chars', m.charId)?.name || m.name || '';
export const label = (m: Msg, r: CallRec) => tt(r.dir === 'in' ? 'call.card.in' : 'call.card.out', { name: nameOf(m) });

export function openTranscript(m: Msg) {
  const r = m.call as CallRec, who = nameOf(m), me = S.persona(cur.chat).name;
  openModal({ title: label(m, r), spec: 'div.call-script' }, () => <>
    {r.audio ? <audio controls src={r.audio} /> : null}
    {r.voicemail ? <p className="them"><small>{tt('call.card.voicemail')}</small>{r.voicemail}</p> : null}
    {(r.lines || []).map((l, i) => <p key={i} className={l.who === 'u' ? 'me' : 'them'}><small>{l.who === 'u' ? me : who}</small>{l.text}{l.cut ? <em>—</em> : null}</p>)}
  </>);
}

/** 대화 화면이 그리는 카드 (Messages 가 m.call 이 있는 시스템 메시지에 쓴다) */
export function CallCard({ m }: { m: Msg }) {
  const r = m.call as CallRec; if (!r) return null;
  const ok = r.result === 'answered', speak = (x: string) => void TTS.speak(x, { charId: m.charId });
  return <div className={`call-card is-${r.result}`}>
    <i className="call-card-ic"><Icon name={ok ? 'phone' : 'phoneOff'} size={16} /></i>
    <div className="call-card-main">
      <b title={label(m, r)}>{label(m, r)}</b>
      <span>{[tt('call.result.' + r.result), r.dur ? fmtDur(r.dur) : '', r.rec ? tt('call.card.rec') : '', r.cut ? tt('call.card.cut') : '', r.missedN ? tt('call.card.missedN', { count: r.missedN }) : ''].filter(Boolean).join(' · ')}</span>
      {r.voicemail ? <q>{r.voicemail}</q> : null}
    </div>
    <div className="call-card-do">
      {r.lines?.length || r.audio ? <button type="button" className="btn sm" onClick={() => openTranscript(m)}>{r.audio ? tt('call.card.play') : tt('call.card.transcript')}</button> : null}
      {r.voicemail && TTS.enabled() ? <button type="button" className="btn sm" onClick={() => speak(r.voicemail!)}>{tt('call.card.listen')}</button> : null}
      <button type="button" className="btn sm" onClick={() => dial(cur.chat)}>{tt('call.card.callback')}</button>
    </div>
  </div>;
}
