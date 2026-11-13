// 기능 화면 › 전화: 설정 · 호출 수 안내 · 프롬프트 · 최근 통화
import { useEffect, useRef, useState } from 'react';
import { toast } from '../ui';
import * as A from './audio';
import { SOUND_KINDS, customSound, setCustomSound, type SoundKind } from './audio';
import { Check, Field, Select, useRedraw } from '../addons/parts';
import { S, chatConns } from '../lib/core';
import { go } from '../lib/router';
import { useLang } from '../i18n';
import { cfg, saveCfg, PROMPT_DEFAULTS, PROMPT_KEYS, type CallCfg } from './cfg';
import { tt } from './strings';
import { fmtDur, type Dir, type Result } from './logic';

type Log = { at: number; dir: Dir; result: Result; dur: number; charId: string };

/** 숫자 칸: 치는 동안에는 그대로 두고(지우고 다시 칠 수 있게), 칸을 떠날 때 최솟값으로 맞춘다 */
function Num({ value, min, onCommit }: { value: number; min: number; onCommit: (v: number) => void }) {
  const [d, setD] = useState<string | null>(null);
  return <input className="inp" type="number" min={min} value={d ?? value} onChange={e => { setD(e.target.value); if (e.target.value !== '' && +e.target.value >= min) onCommit(+e.target.value); }} onBlur={() => { if (d !== null) { onCommit(Math.max(min, +d || 0)); setD(null); } }} />;
}

/** 벨 · 배경 소리를 내 파일로 바꾸기 */
function SoundFiles() {
  const [names, setNames] = useState<Partial<Record<SoundKind, string>> | null>(null);
  const [busy, setBusy] = useState('');
  const refresh = () => void Promise.all(SOUND_KINDS.map(async k => [k, (await customSound(k))?.name || ''] as const)).then(l => setNames(Object.fromEntries(l)));
  useEffect(refresh, []);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);
  const pick = async (k: SoundKind, f: File | null) => {
    if (f && f.size > 15 * 1024 * 1024) return toast(tt('call.snd.tooBig'), 'err');
    setBusy(k);
    try { await setCustomSound(k, f); refresh(); } catch (e) { toast(String((e as Error)?.message || e), 'err'); } finally { setBusy(''); }
  };
  const preview = (k: SoundKind) => {
    if (stopRef.current) { stopRef.current(); stopRef.current = null; setBusy(''); return; }
    const stop = k === 'ring' ? A.ringtone() : A.ambient(k);
    stopRef.current = stop; setBusy('play:' + k);
    window.setTimeout(() => { if (stopRef.current === stop) { stop(); stopRef.current = null; setBusy(''); } }, 6000);
  };
  return <section className="card">
    <b className="call-sec">{tt('call.snd.title')}</b>
    {SOUND_KINDS.map(k => <div key={k} className="call-snd">
      <span className="call-snd-name">{tt('call.snd.' + k)}</span>
      <small className="call-snd-file">{names?.[k] || tt(k === 'ring' ? 'call.snd.synth' : 'call.snd.default')}</small>
      <span className="call-snd-btns">
        <button type="button" className="btn ghost" onClick={() => preview(k)}>{busy === 'play:' + k ? tt('call.snd.stop') : tt('call.snd.play')}</button>
        <label className="btn ghost">{tt('call.snd.pick')}<input type="file" accept="audio/*" hidden disabled={busy === k} onChange={e => { const f = e.target.files?.[0] || null; e.target.value = ''; if (f) void pick(k, f); }} /></label>
        {names?.[k] ? <button type="button" className="btn ghost" onClick={() => void pick(k, null)}>{tt('call.set.reset')}</button> : null}
      </span>
    </div>)}
  </section>;
}

export function CallStudio() {
  useLang();
  const redraw = useRedraw(), c = cfg();
  const set = <K extends keyof CallCfg>(k: K, v: CallCfg[K]) => { c[k] = v; saveCfg(); redraw(); };
  const num = (k: 'daily' | 'gapHours' | 'chance' | 'ringSec' | 'tokens' | 'rawMax' | 'rawTotal', min = 0) => <Num value={c[k]} min={min} onCommit={v => set(k, v)} />;
  const logs = S.chats.flatMap(ch => ((ch as { callLog?: Log[] }).callLog || []).map(l => ({ ...l, chat: ch }))).sort((a, b) => b.at - a.at).slice(0, 40);
  return <div className="call-studio form">
    <section className="card">
      <div className="call-cost"><b>{tt('call.cost.title')}</b><p>{tt('call.cost.incoming')}</p><p>{tt('call.cost.outgoing')}</p><p>{tt('call.cost.summary')}</p></div>
      <Check label={tt('call.set.auto')} on={c.auto} onChange={v => set('auto', v)} hint={c.auto ? tt('call.cost.autoOn') + ' ' + tt('call.set.autoHint') : tt('call.set.autoHint')} />
      {c.auto ? <div className="call-row">
        <Field label={tt('call.set.daily')}>{num('daily')}</Field>
        <Field label={tt('call.set.gap')}>{num('gapHours')}</Field>
        <Field label={tt('call.set.chance')}>{num('chance')}</Field>
      </div> : null}
      {c.auto ? <Check label={tt('call.set.night')} on={c.night} onChange={v => set('night', v)} /> : null}
      <Field label={tt('call.set.conn')}><Select value={c.conn} opts={[['', tt('call.set.connSame')], ...chatConns().map(x => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`] as const)]} onChange={v => set('conn', v)} /></Field>
      <div className="call-row">
        <Field label={tt('call.set.ring')}>{num('ringSec', 5)}</Field>
        <Field label={tt('call.set.tokens')}>{num('tokens', 40)}</Field>
      </div>
      <Check label={tt('call.set.voicemail')} on={c.voicemail} onChange={v => set('voicemail', v)} />
      <Check label={tt('call.set.afterText')} on={c.afterText} onChange={v => set('afterText', v)} />
      <div className="call-row">
        <Field label={tt('call.set.inPrompt')}><Select value={c.inPrompt} opts={(['raw', 'summary', 'none'] as const).map(k => [k, tt('call.set.inPrompt.' + k)] as const)} onChange={v => set('inPrompt', v as CallCfg['inPrompt'])} /></Field>
        {c.inPrompt === 'raw' ? <Field label={tt('call.set.rawMax')}>{num('rawMax', 200)}</Field> : null}
        {c.inPrompt === 'raw' ? <Field label={tt('call.set.rawTotal')}>{num('rawTotal', 500)}</Field> : null}
      </div>
      <Check label={tt('call.set.rec')} on={c.rec} onChange={v => set('rec', v)} />
      <Check label={tt('call.set.recAudio')} on={c.recAudio} onChange={v => set('recAudio', v)} />
      <Check label={tt('call.set.tones')} on={c.tones} onChange={v => set('tones', v)} />
      <Field label={tt('call.set.ambient')}><Select value={c.ambient} opts={(['off', 'auto', 'cafe', 'rain', 'street'] as const).map(k => [k, tt('call.amb.' + k)] as const)} onChange={v => set('ambient', v as CallCfg['ambient'])} /></Field>
    </section>
    <SoundFiles />
    <section className="card">
      <b className="call-sec">{tt('call.set.prompts')}</b>
      {PROMPT_KEYS.map(k => <Field key={k} label={<>{tt('call.p.' + k)}{c.prompts[k] ? <button type="button" className="btn ghost call-reset" onClick={() => { delete c.prompts[k]; saveCfg(); redraw(); }}>{tt('call.set.reset')}</button> : null}</>}>
        <textarea className="inp" rows={k === 'style' ? 9 : 3} value={c.prompts[k] || PROMPT_DEFAULTS[k]} onChange={e => { c.prompts[k] = e.target.value === PROMPT_DEFAULTS[k] ? undefined : e.target.value; saveCfg(); redraw(); }} />
      </Field>)}
    </section>
    <section className="card">
      <b className="call-sec">{tt('call.log.title')}</b>
      {logs.length ? <ul className="call-log">{logs.map((l, i) => <li key={i} className={`is-${l.result}`}>
        <button type="button" onClick={() => go('chat', l.chat.id)}>
          <b>{S.get('chars', l.charId)?.name || l.chat.name}</b>
          <span>{[l.dir === 'in' ? '↙' : '↗', tt('call.result.' + l.result), l.dur ? fmtDur(l.dur) : ''].filter(Boolean).join(' ')}</span>
          <small>{new Date(l.at).toLocaleString()}</small>
        </button></li>)}</ul> : <p className="hint">{tt('call.log.empty')}</p>}
    </section>
  </div>;
}
