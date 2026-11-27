// 대화 기록에 남는 통화 카드와 녹취록 창 (전체 듣기 · 줄별 듣기)
import { useEffect, useRef, useState } from 'react';
import type { Char, Msg } from '../lib/types';
import { Icon } from '../kit';
import { S } from '../lib/core';
import { TTS } from '../tts/api';
import { openModal } from '../addons/parts';
import { cur } from '../chat/store';
import { tt } from './strings';
import { t } from '../i18n';
import { cfg } from './cfg';
import { ReadAlong, useReadingState } from '../tts/ReadAlong';
import { readMessage } from '../tts/Dock';
import { dial, fmtDur, type CallRec, type Line } from './logic';

const nameOf = (m: Msg) => S.get('chars', m.charId)?.name || m.name || '';
/** 이 통화에 함께한 캐릭터들 (단체 통화 · 엿들은 통화. 혼자면 그 한 사람) */
const partyOf = (m: Msg, r: CallRec): Char[] => (r.with?.length ? r.with : [m.charId]).map(id => S.get('chars', id)).filter((c): c is Char => !!c);
export const label = (m: Msg, r: CallRec) => {
  const names = partyOf(m, r).map(c => c.name).join(' · ') || nameOf(m);
  if (r.overheard) return tt('call.card.overheard', { names });
  if ((r.with?.length || 0) > 1) return tt('call.card.group', { names });
  return tt(r.dir === 'in' ? 'call.card.in' : 'call.card.out', { name: nameOf(m) });
};
const speakerOf = (m: Msg, l: Line) => (l.by && S.get('chars', l.by)) || S.get('chars', m.charId);
const NOTE = /^\((.+) (joined|left) the call\)$/;

/** 녹취록에서 어디까지 들었는가 (메시지 id → 줄 번호). 창을 닫았다 열어도 "이어 듣기" 로 거기부터 */
const heard = new Map<string, number>();
const keyOf = (m: Msg, i: number) => `script:${m.id}:${i}`;
/** 녹취록: 줄마다 누가 말했는지, 누르면 그 줄을 들려주고, 전체 듣기는 처음부터 화자의 목소리로 차례로 읽는다 (내 말은 건너뛴다).
 *  읽는 동안 그 줄의 읽는 자리를 짚고, 멈춤 · 앞뒤 줄로 옮길 수 있다. 읽는 줄의 문장을 누르면 거기부터 */
function Transcript({ m }: { m: Msg }) {
  const r = m.call as CallRec, me = S.persona(cur.chat).name || tt('call.card.me'), lines = r.lines || [], voice = TTS.enabled();
  const [at, setAt] = useState(-1), [, bump] = useState(0), stop = useRef<AbortController | null>(null), jump = useRef<number | null>(null);
  const rd = useReadingState(), mine = at >= 0 && !!rd?.key.startsWith(`script:${m.id}:`), paused = mine && !!rd?.paused;
  const halt = () => { stop.current?.abort(); stop.current = null; TTS.stopAll(); setAt(-1); };
  useEffect(() => () => { stop.current?.abort(); TTS.stopAll(); }, []);
  const spoken = (i: number) => { const l = lines[i]; return !!l && l.who === 'c' && !l.note && !!l.text; };
  const play = async (from: number, only = false, offset = 0) => {
    halt(); const ac = stop.current = new AbortController();
    for (let i = from; i < lines.length && !ac.signal.aborted; i++) {
      const l = lines[i]; if (!spoken(i)) { if (only) break; continue; }
      setAt(i); jump.current = null; if (!only) heard.set(m.id, i);
      const cut = i === from ? Math.max(0, Math.min(offset, l.text.length - 1)) : 0;
      try { await TTS.speak(l.text.slice(cut), { charId: speakerOf(m, l)?.id, signal: ac.signal, key: keyOf(m, i), at: cut, fx: cfg().lineFx ? 'phone' : undefined }); } catch { break; }
      if (jump.current != null) { i = jump.current - 1; continue; }   // ‹ › 로 다른 줄을 골랐다
      if (only) break;
    }
    if (stop.current === ac) { stop.current = null; setAt(-1); if (!only && !ac.signal.aborted) heard.delete(m.id); bump(n => n + 1); }
  };
  /** 앞(-1) · 다음(+1) 줄 */
  const move = (d: number) => { let i = at + d; while (i >= 0 && i < lines.length && !spoken(i)) i += d; if (i < 0 || i >= lines.length) return; jump.current = i; TTS.stopAll(); };
  const resumeAt = heard.get(m.id);
  return <>
    {r.audio ? <audio controls src={r.audio} /> : null}
    {voice && lines.some(l => l.who === 'c' && !l.note) ? <div className="call-script-bar">
      {at >= 0 ? <>
        <button type="button" className="btn sm" onClick={halt}><Icon name="stop" size={14} />{tt('call.card.stop')}</button>
        <button type="button" className="btn sm" title={t('call.read.prevLine')} aria-label={t('call.read.prevLine')} onClick={() => move(-1)}><Icon name="skipBack" size={14} /></button>
        <button type="button" className="btn sm primary" aria-pressed={paused} onClick={() => paused ? TTS.resume() : TTS.pause()}><Icon name={paused ? 'play' : 'pause'} size={14} />{paused ? t('call.read.resume') : t('call.read.pause')}</button>
        <button type="button" className="btn sm" title={t('call.read.nextLine')} aria-label={t('call.read.nextLine')} onClick={() => move(1)}><Icon name="skipFwd" size={14} /></button>
      </> : <>
        <button type="button" className="btn sm primary" onClick={() => void play(0)}><Icon name="play" size={14} />{tt('call.card.playAll')}</button>
        {resumeAt != null && resumeAt > 0 ? <button type="button" className="btn sm" onClick={() => void play(resumeAt)}><Icon name="play" size={14} />{t('call.card.resume')}</button> : null}
      </>}
      <small>{t('call.card.tapHint')}</small>
    </div> : null}
    {r.voicemail ? <p className="them"><small>{tt('call.card.voicemail')}</small>{r.voicemail}</p> : null}
    {lines.map((l, i) => {
      if (l.note) { const n = l.text.match(NOTE); return <p key={i} className="note">{n ? tt(n[2] === 'joined' ? 'call.note.joined' : 'call.note.left', { name: n[1] }) : l.text}</p>; }
      const mine = l.who === 'u', who = mine ? me : speakerOf(m, l)?.name || nameOf(m);
      return <p key={i} className={`${mine ? 'me' : 'them'}${at === i ? ' playing' : ''}${!mine && voice ? ' can-play' : ''}`} onClick={() => { if (!mine && voice) void play(i, true); }}><small>{who}</small>
        {mine ? l.text : <ReadAlong text={l.text} k={keyOf(m, i)} onJump={(x, reading) => { if (!reading) return false; void play(i, stop.current ? false : true, x); return true; }} />}{l.cut ? <em>—</em> : null}</p>;
    })}
  </>;
}
export function openTranscript(m: Msg) {
  openModal({ title: label(m, m.call as CallRec), spec: 'div.call-script' }, () => <Transcript m={m} />);
}

/** 대화 화면이 그리는 카드 (Messages 가 m.call 이 있는 시스템 메시지에 쓴다) */
export function CallCard({ m }: { m: Msg }) {
  const r = m.call as CallRec; if (!r) return null;
  const ok = r.result === 'answered', speak = (x: string) => void readMessage(x, { key: 'vm:' + m.id, charId: m.charId }).catch(() => { });
  const party = partyOf(m, r);
  return <div className={`call-card is-${r.result}${r.overheard ? ' is-overheard' : ''}`}>
    <i className="call-card-ic"><Icon name={r.overheard ? 'eye' : ok ? 'phone' : 'phoneOff'} size={16} /></i>
    <div className="call-card-main">
      <b title={label(m, r)}>{label(m, r)}</b>
      <span>{[r.overheard ? '' : tt('call.result.' + r.result), r.dur ? fmtDur(r.dur) : '', r.rec && !r.overheard ? tt('call.card.rec') : '', r.cut ? tt('call.card.cut') : '', r.missedN ? tt('call.card.missedN', { count: r.missedN }) : ''].filter(Boolean).join(' · ')}</span>
      {r.voicemail ? <q>{r.voicemail}</q> : null}
      {r.left ? <q className="left"><small>{t('call.card.left')}</small>{r.left}</q> : null}
    </div>
    <div className="call-card-do">
      {r.lines?.length || r.audio ? <button type="button" className="btn sm" onClick={() => openTranscript(m)}>{r.audio || r.overheard ? tt('call.card.play') : tt('call.card.transcript')}</button> : null}
      {r.voicemail && TTS.enabled() ? <button type="button" className="btn sm" onClick={() => speak(r.voicemail!)}>{tt('call.card.listen')}</button> : null}
      {!r.overheard ? <button type="button" className="btn sm" onClick={() => dial(cur.chat, party.length && cur.chat && party.every(c => cur.chat!.charIds.includes(c.id)) ? party : undefined)}>{tt('call.card.callback')}</button> : null}
    </div>
  </div>;
}
