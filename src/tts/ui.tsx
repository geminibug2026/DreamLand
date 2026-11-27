// ── 읽어 주기 화면: 기능 › 읽어 주기 탭 · 연결 화면의 음성 연결 편집 · 캐릭터 편집기의 목소리 칸 ──
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import { Check, Field, Select, type Opt } from '../addons/parts';
import { Form, toast } from '../ui';
import { S, newConn } from '../lib/core';
import { go } from '../lib/router';
import { PROVIDERS } from '../lib/engine';
import type { Conn } from '../lib/types';
import type { EditorApi } from '../editors/parts';
import { t } from '../i18n';
import { TTS, type VoicePick } from './api';
import { cfg, connOf, saveCfg, ttsConns, DEFAULT_VOICE } from './config';
import { listVoices, TTS_PROVIDERS, type VoiceOpt } from './providers';
import { BED_IDS, SOUND_IDS } from './marks';
import { playSound, setBed } from './sfx';
import { cacheInfo, clearCache } from './cache';
import type { PronWord } from './config';

const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);
const sample = () => t('tts.sample');

/** 공급자마다 받아 온 목소리 목록 (연결 id → 목록) */
const voiceCache = new Map<string, VoiceOpt[]>();
function useBrowserVoices() {
  const [vs, setVs] = useState<SpeechSynthesisVoice[]>(() => 'speechSynthesis' in window ? speechSynthesis.getVoices() : []);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const f = () => setVs(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', f); return () => speechSynthesis.removeEventListener('voiceschanged', f);
  }, []);
  return vs;
}

/** 시험 듣기 버튼: 누르면 읽고, 읽는 동안 누르면 멈춘다. compact = 둥근 아이콘 단추 (입력칸 옆에 붙일 때) */
function TestBtn({ voice, text, compact }: { voice: () => Partial<VoicePick>; text?: string; compact?: boolean }) {
  const [on, setOn] = useState(false), ac = useRef<AbortController | null>(null);
  useEffect(() => () => ac.current?.abort(), []);
  const run = async () => {
    if (on) { ac.current?.abort(); return; }
    TTS.stopAll(); const a = ac.current = new AbortController(); setOn(true);
    try { await TTS.speak(text || sample(), { voice: voice(), signal: a.signal }); }
    catch (e) { toast(t('tts.test.fail', { err: errMsg(e) }), 'err'); }
    finally { if (ac.current === a) { ac.current = null; setOn(false); } }
  };
  if (compact) return <IconBtn ic={on ? 'stop' : 'play'} title={on ? t('tts.test.stop') : t('tts.test.play')} cls={on ? 'on' : ''} onClick={() => void run()} />;
  return <Btn label={on ? t('tts.test.stop') : t('tts.test.play')} ic={on ? 'stop' : 'play'} cls="ghost" onClick={() => void run()} />;
}

/** 목소리 고르기 (출처 · 목소리 · 모델 · 속도 · 높이 · 공급자별 스타일 · 시험 듣기) */
export function VoiceEditor({ v, onChange }: { v: VoicePick; onChange: () => void }) {
  const [, bump] = useState(0), redraw = () => bump(n => n + 1);
  const set = (patch: Partial<VoicePick>) => { Object.assign(v, patch); onChange(); redraw(); };
  const conns = ttsConns(), conn = connOf(v), browser = useBrowserVoices();
  const [list, setList] = useState<VoiceOpt[] | null>(() => conn ? voiceCache.get(conn.id) || null : null);
  const src = v.provider === 'browser' || !conn ? 'browser' : conn.id;
  const load = async (quiet: boolean) => {
    if (!conn) return;
    try { const l = await listVoices(conn); voiceCache.set(conn.id, l); setList(l); if (!quiet) toast(t('tts.voices.loaded', { n: l.length }), 'ok'); }
    catch (e) { if (!quiet) toast(errMsg(e), 'err'); }
  };
  useEffect(() => { setList(conn ? voiceCache.get(conn.id) || null : null); if (conn && !voiceCache.has(conn.id) && (conn.apiKey || PROVIDERS[conn.provider]?.keyless || conn.provider === 'tts_openai')) void load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [conn?.id]);
  const srcOpts: Opt[] = [['browser', t('tts.src.browser')], ...conns.map(c => [c.id, `${c.name} · ${PROVIDERS[c.provider]?.name || c.provider}`] as const)];
  const models = conn ? TTS_PROVIDERS[conn.provider]?.models || [] : [];
  const p = conn?.provider || 'browser', id = useRef('tv' + Math.random().toString(36).slice(2, 8)).current;
  const range = (k: string, label: string, min: number, max: number, step: number, d: number) => <Field label={`${label} · ${(+(v[k] as number ?? d)).toFixed(2)}`} cls="half"><input type="range" min={min} max={max} step={step} value={+(v[k] as number ?? d)} onChange={e => set({ [k]: +e.target.value })} /></Field>;
  return <div className="tts-voice form">
    <Field label={t('tts.voice.src')} cls="half"><Select value={src} opts={srcOpts} onChange={x => x === 'browser' ? set({ provider: 'browser', connId: undefined, voice: '', model: undefined }) : set({ provider: S.get('conns', x)?.provider || '', connId: x, voice: '', model: undefined })} /></Field>
    {/* 목소리 칸 옆에 시험 듣기 (단추가 혼자 한 줄을 차지하지 않게) */}
    {src === 'browser'
      ? <Field label={t('tts.voice.voice')} cls="half"><div className="tts-row"><Select value={v.voice} opts={[['', t('tts.voice.auto')], ...browser.map(b => [b.name, `${b.name} · ${b.lang}`] as const)]} onChange={x => set({ voice: x })} /><TestBtn compact voice={() => ({ ...v })} /></div></Field>
      : <Field label={t('tts.voice.voice')} cls="half"><div className="tts-row">
        <input className="inp" list={id} value={v.voice} placeholder={t('tts.voice.voicePh')} spellCheck={false} autoComplete="off" onChange={e => set({ voice: e.target.value.trim() })} />
        <datalist id={id}>{(list || []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</datalist>
        <IconBtn ic="refresh" title={t('tts.voices.load')} onClick={() => void load(false)} /><TestBtn compact voice={() => ({ ...v })} /></div></Field>}
    {src !== 'browser' && models.length > 0 && <Field label={t('tts.voice.model')} cls="half"><Select value={v.model || conn?.model || models[0]} opts={[...new Set([...(conn?.model ? [conn.model] : []), ...models])].map(m => [m, m] as const)} onChange={x => set({ model: x })} /></Field>}
    {range('rate', t('tts.voice.rate'), 0.5, 2, 0.05, 1)}
    {(p === 'browser' || p === 'tts_google' || p === 'tts_azure' || p === 'tts_minimax') && range('pitch', t('tts.voice.pitch'), 0.5, 1.5, 0.05, 1)}
    {(p === 'tts_openai' || p === 'tts_compat') && /gpt-4o.*tts/.test(String(v.model || conn?.model || models[0] || '')) && <Field label={t('tts.voice.instructions')} hint={t('tts.voice.instructionsHint')}><textarea className="inp" rows={2} value={String(v.instructions || '')} placeholder={t('tts.voice.instructionsPh')} onChange={e => set({ instructions: e.target.value })} /></Field>}
    {p === 'tts_eleven' && <>{range('stability', t('tts.voice.stability'), 0, 1, 0.05, 0.5)}{range('similarity', t('tts.voice.similarity'), 0, 1, 0.05, 0.75)}{range('style', t('tts.voice.style'), 0, 1, 0.05, 0)}</>}
    {p === 'tts_azure' && <Field label={t('tts.voice.azStyle')} cls="half" hint={t('tts.voice.azStyleHint')}><input className="inp" value={String(v.azStyle || '')} placeholder="cheerful, sad, whispering…" onChange={e => set({ azStyle: e.target.value.trim() })} /></Field>}
    {p === 'tts_minimax' && <Field label={t('tts.voice.emotion')} cls="half"><Select value={v.emotion || ''} opts={[['', t('tts.voice.auto')], ...['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm'].map(x => [x, x] as const)]} onChange={x => set({ emotion: x })} /></Field>}
  </div>;
}

/** 목소리를 한 줄로 */
export function voiceLabel(v?: Partial<VoicePick>) {
  if (!v?.provider) return t('tts.voice.default');
  const c = connOf(v), who = v.provider === 'browser' || !c ? t('tts.src.browser') : c.name;
  return `${who}${v.voice ? ' · ' + v.voice : ''}`;
}

/** 캐릭터 한 명의 목소리 (기본값 따르기 / 따로 정하기) */
export function CharVoice({ charId, open0 = false }: { charId: string; open0?: boolean }) {
  const c = cfg(), [, bump] = useState(0), [open, setOpen] = useState(open0);
  const own = c.chars[charId];
  return <div className="tts-char-voice">
    <div className="tts-row">
      <Check label={t('tts.char.own')} on={!!own} onChange={on => { if (on) { c.chars[charId] = { ...structuredClone(c.voice) }; setOpen(true); } else delete c.chars[charId]; saveCfg(); bump(n => n + 1); }} />
      <span className="tts-sum">{voiceLabel(own || c.voice)}</span>
      {own && <IconBtn ic="edit" title={t('tts.char.edit')} onClick={() => setOpen(!open)} />}
    </div>
    {own && open && <VoiceEditor v={own} onChange={saveCfg} />}
  </div>;
}
/** 캐릭터 편집기에 넣는 칸 */
export function CharVoiceField({ charId }: { charId: string }) {
  return <div className="field tts-charfield"><span className="field-label">{t('tts.char.field')}</span><CharVoice charId={charId} /><small className="hint">{t('tts.char.fieldHint')}</small></div>;
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <><h3 className="form-sec">{title}{action ? <span className="tts-sec-do">{action}</span> : null}</h3>{children}</>;
}

/** 고르기 단추 줄 (둥근 알약) */
function Seg<T extends string | number>({ value, opts, onChange, label }: { value: T; opts: [T, string][]; onChange: (v: T) => void; label: string }) {
  return <span className="tts-seg" role="radiogroup" aria-label={label}>{opts.map(([v, l]) => <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</span>;
}
/** 목소리 하나를 켜고 고르는 칸 (따로 정하지 않으면 다른 목소리를 따른다) */
function OptVoice({ v, set, label, offLabel }: { v?: VoicePick; set: (v: VoicePick | undefined) => void; label: string; offLabel: string }) {
  const [open, setOpen] = useState(false), c = cfg();
  return <div className="tts-optvoice">
    <div className="tts-row">
      <Check label={label} on={!!v?.provider} onChange={on => { set(on ? { ...structuredClone(c.voice) } : undefined); setOpen(on); saveCfg(); }} />
      <span className="tts-sum">{v?.provider ? voiceLabel(v) : offLabel}</span>
      {v?.provider ? <IconBtn ic="edit" title={t('tts.char.edit')} onClick={() => setOpen(!open)} /> : null}
    </div>
    {v?.provider && open ? <VoiceEditor v={v} onChange={saveCfg} /> : null}
  </div>;
}

/** 목소리 연기: 사람마다 목소리 · 해설 · 말투 · 쉼 */
function ActSection({ redraw }: { redraw: () => void }) {
  const c = cfg(), save = () => { saveCfg(); redraw(); };
  const [more, setMore] = useState(false);
  return <Section title={t('tts.sec.act')}>
    <Check label={t('tts.act.on')} on={c.act} hint={t('tts.act.onHint')} onChange={v => { c.act = v; save(); }} />
    {c.act ? <>
      <Check label={t('tts.act.ask')} on={c.ask} hint={t('tts.act.askHint')} onChange={v => { c.ask = v; save(); }} />
      <p className="hint tts-cost">{c.ask ? t('tts.act.askCost') : t('tts.act.askOff')}</p>
      <OptVoice v={c.narrator} set={v => { c.narrator = v; redraw(); }} label={t('tts.act.narrator')} offLabel={t('tts.act.narratorOff')} />
      <div className="tts-line"><span>{t('tts.act.only')}</span><Seg label={t('tts.act.only')} value={c.only} opts={[['all', t('tts.act.only.all')], ['lines', t('tts.act.only.lines')]]} onChange={v => { c.only = v; save(); }} /></div>
      <div className="tts-line"><span>{t('tts.act.power')}</span><Seg label={t('tts.act.power')} value={Math.round(+c.acting * 2) / 2} opts={[[0, t('tts.act.power.0')], [1, t('tts.act.power.1')], [2, t('tts.act.power.2')]]} onChange={v => { c.acting = v; save(); }} /></div>
      <Field label={`${t('tts.act.gap')} · ${(+c.gap / 1000).toFixed(2)}s`} cls="half"><input type="range" min={0} max={900} step={20} value={c.gap} onChange={e => { c.gap = +e.target.value; save(); }} /></Field>
      <Check label={t('tts.act.even')} on={c.even !== false} hint={t('tts.act.evenHint')} onChange={v => { c.even = v; save(); }} cls="half" />
      <button type="button" className={`tts-more${more ? ' open' : ''}`} aria-expanded={more} onClick={() => setMore(!more)}><span>{t('tts.act.extras')}</span><small>{t('tts.act.extrasHint')}</small><Icon name={more ? 'up' : 'down'} size={14} /></button>
      {more ? <div className="tts-extras">
        {(['f', 'm', 'x'] as const).map(k => <OptVoice key={k} v={c.extras[k]} set={v => { if (v) c.extras[k] = v; else delete c.extras[k]; redraw(); }} label={t('tts.act.extra.' + k)} offLabel={t('tts.voice.default')} />)}
      </div> : null}
    </> : null}
  </Section>;
}

/** 장면 소리: 켜기 · 크기 · 들어 보기 */
function SoundSection({ redraw }: { redraw: () => void }) {
  const c = cfg(), save = () => { saveCfg(); redraw(); };
  const [bed, setBedNow] = useState('');
  useEffect(() => () => { void setBed('', 0, 0.6, 'preview'); }, []);
  const tryBed = (id: string) => { const next = bed === id ? '' : id; setBedNow(next); void setBed(next, c.bedVol || 0.45, 0.8, 'preview'); };
  return <Section title={t('tts.sec.sound')}>
    <Check label={t('tts.sfx.on')} on={c.sfx !== false} hint={t('tts.sfx.onHint')} onChange={v => { c.sfx = v; if (!v) { void setBed('', 0, 0.6, 'preview'); setBedNow(''); } save(); }} />
    {c.sfx !== false ? <>
      <Field label={`${t('tts.sfx.vol')} · ${Math.round(c.sfxVol * 100)}%`} cls="half"><input type="range" min={0} max={1} step={0.05} value={c.sfxVol} onChange={e => { c.sfxVol = +e.target.value; save(); }} /></Field>
      <Field label={`${t('tts.sfx.bedVol')} · ${Math.round(c.bedVol * 100)}%`} cls="half"><input type="range" min={0} max={1} step={0.05} value={c.bedVol} onChange={e => { c.bedVol = +e.target.value; save(); if (bed) void setBed(bed, c.bedVol, 0.3, 'preview'); }} /></Field>
      <div className="field"><span className="field-label">{t('tts.sfx.try')}</span>
        <div className="tts-chips">{SOUND_IDS.map(id => <button key={id} type="button" className="tts-chip" onClick={() => void playSound(id, c.sfxVol || 0.8)}><Icon name="play" size={11} />{t('tts.snd.' + id)}</button>)}</div>
        <div className="tts-chips">{BED_IDS.map(id => <button key={id} type="button" className={`tts-chip bed${bed === id ? ' on' : ''}`} aria-pressed={bed === id} onClick={() => tryBed(id)}><Icon name={bed === id ? 'stop' : 'play'} size={11} />{t('tts.bed.' + id)}</button>)}</div>
        <small className="hint">{t('tts.sfx.tryHint')}</small></div>
    </> : null}
  </Section>;
}

/** 발음 사전: 이 글자는 이렇게 읽는다 (화면 글은 그대로) */
function PronSection({ redraw }: { redraw: () => void }) {
  const c = cfg(), list = c.pron;
  const save = () => { saveCfg(); redraw(); };
  const set = (i: number, patch: Partial<PronWord>) => { Object.assign(list[i], patch); save(); };
  const who: Opt[] = [['', t('tts.pron.all')], ...S.chars.slice(0, 200).map(ch => [ch.id, ch.name] as const)];
  return <Section title={t('tts.sec.pron')} action={<Btn label={t('tts.pron.add')} ic="plus" cls="ghost sm" onClick={() => { list.push({ from: '', to: '' }); save(); }} />}>
    <p className="hint">{t('tts.pron.hint')}</p>
    {list.length ? <ul className="tts-pron">{list.map((w, i) => <li key={i}>
      <input className="inp" value={w.from} placeholder={t('tts.pron.from')} aria-label={t('tts.pron.from')} onChange={e => set(i, { from: e.target.value })} />
      <Icon name="right" size={13} />
      <input className="inp" value={w.to} placeholder={t('tts.pron.to')} aria-label={t('tts.pron.to')} onChange={e => set(i, { to: e.target.value })} />
      <Select value={w.charId || ''} opts={who} title={t('tts.pron.who')} onChange={v => set(i, { charId: v || undefined })} />
      <span className="tts-pron-do"><TestBtn compact voice={() => ({ ...(w.charId ? TTS.voiceFor(w.charId) : c.voice) })} text={w.from || sample()} /><IconBtn ic="x" title={t('tts.pron.remove')} onClick={() => { list.splice(i, 1); save(); }} /></span>
    </li>)}</ul> : null}
  </Section>;
}

/** 만든 목소리 보관: 켜기 · 얼마나 · 지우기 */
function KeepRow({ redraw }: { redraw: () => void }) {
  const c = cfg(), [info, setInfo] = useState<{ count: number; bytes: number } | null>(null);
  useEffect(() => { void cacheInfo().then(setInfo); }, []);
  return <div className="tts-keep">
    <Check label={t('tts.keep.on')} on={c.keep !== false} hint={t('tts.keep.hint')} onChange={v => { c.keep = v; saveCfg(); redraw(); }} />
    {info && info.count ? <span className="tts-keep-n"><small>{t('tts.keep.count', { n: info.count, mb: (info.bytes / 1048576).toFixed(1) })}</small><Btn label={t('tts.keep.clear')} cls="ghost sm" onClick={async () => { await clearCache(); setInfo(await cacheInfo()); toast(t('tts.keep.cleared'), 'ok'); }} /></span> : null}
  </div>;
}

/** 기능 › 읽어 주기 */
export function TtsStudio() {
  const c = cfg(), [, bump] = useState(0), redraw = () => bump(n => n + 1);
  const save = () => { saveCfg(); redraw(); };
  const [q, setQ] = useState(''), [openId, setOpenId] = useState('');
  const conns = ttsConns();
  const chars = S.chars.filter(x => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  const addConn = async (provider: string) => {
    const def = TTS_PROVIDERS[provider];
    const nc: Conn = newConn({ provider, name: def.name, model: def.models[0] || '' });
    await S.save('conns', nc, true); go('conns', nc.id);
  };
  return <div className="card tts-card">
    <div className="form">
      <Section title={t('tts.sec.basic')}>
        <Check label={t('tts.on')} on={c.on} hint={t('tts.onHint')} onChange={v => { c.on = v; if (!v) TTS.stopAll(); save(); }} />
        <Check label={t('tts.autoRead')} on={c.autoRead} hint={t('tts.autoReadHint')} onChange={v => { c.autoRead = v; save(); }} />
        <Check label={t('tts.follow.set')} on={c.follow !== false} hint={t('tts.follow.setHint')} onChange={v => { c.follow = v; save(); }} />
        {c.follow !== false ? <Field label={t('tts.follow.at')} cls="half"><Select value={c.stripAt} opts={[['top', t('tts.follow.at.top')], ['bottom', t('tts.follow.at.bottom')]]} onChange={v => { c.stripAt = v === 'bottom' ? 'bottom' : 'top'; save(); }} /></Field> : null}
        <Check label={t('tts.follow.inMsg')} on={c.inMsg === true} hint={t('tts.follow.inMsgHint')} onChange={v => { c.inMsg = v; save(); }} />
        <Check label={t('tts.chain')} on={c.chain} hint={t('tts.chainHint')} onChange={v => { c.chain = v; save(); }} />
        <Field label={t('tts.actions')} cls="half"><Select value={c.actions} opts={[['read', t('tts.actions.read')], ['skip', t('tts.actions.skip')]]} onChange={v => { c.actions = v as 'read' | 'skip'; save(); }} /></Field>
        <Field label={`${t('tts.rate')} · ${(+c.rate).toFixed(2)}`} cls="half"><input type="range" min={0.5} max={2} step={0.05} value={c.rate} onChange={e => { c.rate = +e.target.value; save(); }} /></Field>
        <Field label={`${t('tts.volume')} · ${Math.round(c.volume * 100)}%`} cls="half"><input type="range" min={0} max={1} step={0.05} value={c.volume} onChange={e => { c.volume = +e.target.value; save(); }} /></Field>
        <KeepRow redraw={redraw} />
      </Section>
      <ActSection redraw={redraw} />
      <SoundSection redraw={redraw} />
      <Section title={t('tts.sec.conns')}>
        <p className="hint">{t('tts.connsHint')}</p>
        <ul className="tts-conns">{conns.length ? conns.map(x => <li key={x.id}><span className="tts-conn-name">{x.name}</span><small>{PROVIDERS[x.provider]?.name}{x.apiKey ? ' · ' + t('tts.conn.keySaved') : PROVIDERS[x.provider]?.keyless ? '' : ' · ' + t('tts.conn.noKey')}</small><IconBtn ic="edit" title={t('tts.conn.open')} onClick={() => go('conns', x.id)} /></li>) : <li className="tts-empty">{t('tts.conns.empty')}</li>}</ul>
        <Field label={t('tts.conn.add')}><Select value="" opts={[['', t('tts.conn.addPick')], ...Object.entries(TTS_PROVIDERS).map(([k, d]) => [k, d.name] as const)]} onChange={v => { if (v) void addConn(v); }} /></Field>
        <p className="hint tts-cost">{t('tts.cost')}</p>
      </Section>
      <Section title={t('tts.sec.default')}>
        <VoiceEditor v={c.voice} onChange={saveCfg} />
      </Section>
      <PronSection redraw={redraw} />
      <Section title={t('tts.sec.chars')}>
        <p className="hint">{t('tts.charsHint')}</p>
        <input className="inp tts-search" value={q} placeholder={t('tts.chars.search')} onChange={e => setQ(e.target.value)} />
        <ul className="tts-chars">{chars.map(ch => <li key={ch.id} className={openId === ch.id ? 'open' : ''}>
          <button type="button" className="tts-char-head" onClick={() => setOpenId(openId === ch.id ? '' : ch.id)}><Avatar o={ch} cls="xs" /><span className="tts-conn-name">{ch.name}</span><small>{c.chars[ch.id] ? voiceLabel(c.chars[ch.id]) : t('tts.voice.default')}</small></button>
          {openId === ch.id && <CharVoice charId={ch.id} open0 />}
        </li>)}</ul>
      </Section>
    </div>
  </div>;
}

/** 연결 화면: 음성 연결의 본문 (주소 · 키 · 지역 · 서버 거치기 · 시험) */
export function TtsConnBody({ c, api, keyField }: { c: Conn; api: EditorApi; keyField: ReactNode }) {
  const def = TTS_PROVIDERS[c.provider] || TTS_PROVIDERS.tts_compat, [, bump] = useState(0);
  const sv = () => { void api.save(); api.redraw(); bump(n => n + 1); };
  const region = c.provider === 'tts_azure' ? (/^https:\/\/([\w-]+)\.tts\.speech\.microsoft\.com/.exec(c.baseUrl || '')?.[1] || '') : '';
  const [voice, setVoice] = useState(''), [list, setList] = useState<VoiceOpt[]>([]);
  const id = 'tc' + c.id;
  return <>
    {def.note && <p className="hint">{def.note}</p>}
    {c.provider === 'tts_azure' && <Field label={t('tts.conn.region')} hint={t('tts.conn.regionHint')}><input className="inp" defaultValue={region} placeholder="eastus, koreacentral…" onChange={e => { const r = e.target.value.trim().toLowerCase(); c.baseUrl = r ? `https://${r}.tts.speech.microsoft.com` : ''; sv(); }} /></Field>}
    {c.provider !== 'tts_azure' && <Form obj={c} defs={[{ k: 'baseUrl', label: t('conns.url'), ph: def.base || def.ph || 'https://…/v1', hint: def.base ? t('conns.urlHint') : t('conns.urlRequired') }]} onChange={sv} />}
    {keyField}
    {def.models.length > 0 && <Field label={t('tts.conn.model')}><Select value={c.model || def.models[0]} opts={[...new Set([...(c.model ? [c.model] : []), ...def.models])].map(m => [m, m] as const)} onChange={v => { c.model = v; sv(); }} /></Field>}
    <Form obj={c} defs={[{ k: 'proxy', label: t('conns.adv.proxy'), type: 'check', hint: t('conns.adv.proxyHint') }]} onChange={sv} />
    <div className="field"><span className="field-label">{t('tts.conn.testVoice')}</span><div className="tts-row">
      <input className="inp" list={id} value={voice} placeholder={t('tts.voice.voicePh')} onChange={e => setVoice(e.target.value.trim())} />
      <datalist id={id}>{list.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</datalist>
      <Btn label={t('tts.voices.load')} ic="refresh" cls="ghost" onClick={async () => { try { const l = await listVoices(c); voiceCache.set(c.id, l); setList(l); if (!voice && l[0]) setVoice(l[0].id); toast(t('tts.voices.loaded', { n: l.length }), 'ok'); } catch (e) { toast(errMsg(e), 'err'); } }} />
      <TestBtn voice={() => ({ provider: c.provider, connId: c.id, voice, model: c.model, rate: 1, pitch: 1 })} /></div>
      <small className="hint">{t('tts.cost')}</small></div>
  </>;
}
export { DEFAULT_VOICE };
