// 조절 센터: 드림랜드의 실제 설정에 이어진 스위치(방해 금지 · 먼저 연락 · 읽어 주기 · 알림음 · 기기 알림 · 이야기 시간) · 밝기 · 알림음 크기 밀대 ·
// 지금 소리(읽어 주기가 읽는 글 · 아니면 튼 곡) · 알림 · 테마 색. 위로 밀거나 손잡이를 누르면 닫힌다
import { useRef, type CSSProperties, type RefObject } from 'react';
import { S } from '../lib/core';
import { Live } from '../lib/live';
import { t } from '../i18n';
import { Fill, Glyph } from './art';
import { NotifStack } from './Notifs';
import { Face, Pill, Slider, usePhone } from './ui';
import { THEMES, setPrefs } from './prefs';
import { hasStory, longDate, hhmm, useMinute } from './time';
import { tts, useLevel, usePlaying, type Playing } from './playing';
import { step, toggle, useMusic, useProgress } from './music';

const SWATCH: Record<string, string> = { soft: '#e9e9ec', frost: '#a9b6c9', mono: '#6b6b6e', night: '#16181d' };

/** 동그란 스위치 (아래에 작은 이름) */
function Round({ ic, label, on, onClick }: { ic: string; label: string; on: boolean; onClick: () => void }) {
  return <button type="button" className={'pn-rt' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick}><i><Glyph name={ic} size={20} /></i><small>{label}</small></button>;
}

/** 지금 읽는 글 (읽어 주기가 읽는 동안) */
function TtsCard({ p }: { p: Playing }) {
  const lv = useLevel(!p.paused), ch = p.charId ? S.get('chars', p.charId) : null, who = p.name || ch?.name || '';
  return <section className="pn-media" aria-label={t('phone.cc.playing')}>
    <div className="pn-media-top"><Face o={ch || { name: who || '·' }} size={30} /><span><small>{t('phone.cc.playing')}</small><b>{who || t('phone.cc.tts')}</b></span>
      {lv.has ? <i ref={lv.ref as RefObject<HTMLElement>} className={'pn-lv' + (p.paused ? ' still' : '')} aria-hidden="true"><i /><i /><i /><i /></i> : null}</div>
    <p>{p.line}</p>
    <div className="pn-media-do">
      <button type="button" aria-label={t('phone.cc.prev')} title={t('phone.cc.prev')} disabled={!p.canBack} onClick={() => tts.step(-1)}><Fill name="prev" size={20} /></button>
      <button type="button" className="big" aria-label={p.paused ? t('phone.cc.resume') : t('phone.cc.pause')} title={p.paused ? t('phone.cc.resume') : t('phone.cc.pause')} onClick={() => p.paused ? tts.resume() : tts.pause()}><Fill name={p.paused ? 'play' : 'pause'} size={22} /></button>
      <button type="button" aria-label={t('phone.cc.next')} title={t('phone.cc.next')} disabled={!p.canNext} onClick={() => tts.step(1)}><Fill name="next" size={20} /></button>
    </div>
  </section>;
}
/** 지금 곡 (음악) */
function MusicCard() {
  const m = useMusic(), pr = useProgress(), r = pr.dur ? Math.min(1, pr.at / pr.dur) : 0;
  if (!m.cur) return null;
  return <section className="pn-media" aria-label={t('phone.app.music')}>
    <div className="pn-media-top"><i className="pn-song-ic"><Fill name="music" size={16} /></i><span><small>{t('phone.app.music')}</small><b>{m.cur.name}</b></span></div>
    <div className="pn-mbar thin" aria-hidden="true"><i style={{ transform: `scaleX(${r})` }} /></div>
    <div className="pn-media-do">
      <button type="button" aria-label={t('phone.music.prev')} title={t('phone.music.prev')} onClick={() => void step(-1)}><Fill name="prev" size={20} /></button>
      <button type="button" className="big" aria-label={m.playing ? t('phone.music.pause') : t('phone.music.play')} title={m.playing ? t('phone.music.pause') : t('phone.music.play')} onClick={toggle}><Fill name={m.playing ? 'pause' : 'play'} size={22} /></button>
      <button type="button" aria-label={t('phone.music.next')} title={t('phone.music.next')} onClick={() => void step(1)}><Fill name="next" size={20} /></button>
    </div>
  </section>;
}
/** 지금 소리: 읽어 주기가 읽는 동안은 그 글, 아니면 이번에 튼 곡 (둘 다 없으면 아무것도 없다) */
function NowPlaying() { const p = usePlaying(); return p ? <TtsCard p={p} /> : <MusicCard />; }

export function Control({ out, onClose }: { out: boolean; onClose: () => void }) {
  const P = usePhone(), now = useMinute(), y0 = useRef<number | null>(null);
  const modes = S.settings.modes as { auto?: boolean; notify?: boolean }, ux = S.settings.ux;
  const save = () => S.set({});
  const dnd = Live.userStatus().status === 'dnd', story = hasStory(P.home);
  return <div className={'pn-cc' + (out ? ' out' : '')} role="dialog" aria-label={t('phone.cc.title')}
    onPointerDown={e => { if (!(e.target as Element).closest('button, input, form, [role=slider]')) y0.current = e.clientY; }}
    onPointerUp={e => { if (y0.current != null && e.clientY - y0.current < -40) onClose(); y0.current = null; }}>
    <div className="pn-cc-head"><div><b>{hhmm(now)}</b><span>{longDate(now)}</span></div>
      <button type="button" className="pn-ib" aria-label={t('phone.app.settings')} title={t('phone.app.settings')} onClick={e => { onClose(); P.open('settings', undefined, e.currentTarget); }}><Glyph name="settings" /></button>
      <button type="button" className="pn-ib" aria-label={t('phone.close')} title={t('phone.close')} onClick={() => P.leave()}><Glyph name="power" /></button></div>
    <div className="pn-cc-pills">
      <Pill ic="moon" label={t('phone.cc.dnd')} sub={dnd ? t('phone.on') : t('phone.off')} on={dnd} onClick={() => Live.setUserStatus(dnd ? 'online' : 'dnd')} />
      <Pill ic="spark" label={t('phone.cc.auto')} sub={modes.auto ? t('phone.on') : t('phone.off')} on={!!modes.auto} onClick={() => { modes.auto = !modes.auto; save(); }} />
    </div>
    <div className="pn-cc-rounds" style={{ '--n': story ? 4 : 3 } as CSSProperties}>
      <Round ic="listen" label={t('phone.cc.tts')} on={tts.on()} onClick={tts.toggle} />
      <Round ic="bell" label={t('phone.cc.sound')} on={!!ux.sound} onClick={() => { ux.sound = !ux.sound; save(); }} />
      <Round ic="messages" label={t('phone.cc.notify')} on={!!modes.notify} onClick={() => { modes.notify = !modes.notify; save(); }} />
      {story ? <Round ic="clock" label={t('phone.story')} on={P.p.story} onClick={() => setPrefs({ story: !P.p.story })} /> : null}
    </div>
    <Slider ic="sun" label={t('phone.cc.bright')} value={P.p.bright} min={0.45} max={1} onChange={v => setPrefs({ bright: Math.round(v * 100) / 100 })} />
    <Slider ic="sound" label={t('phone.cc.chime')} value={(ux.soundVolume ?? 60) / 100} onChange={v => { ux.soundVolume = Math.round(v * 100); save(); }} />
    <NowPlaying />
    <NotifStack list={P.notifs} sns={P.sns} max={2} />
    <div className="pn-cc-theme"><span>{t('phone.set.theme')}</span>
      <div className="pn-swatches" role="radiogroup" aria-label={t('phone.set.theme')}>{THEMES.map(k => <button key={k} type="button" role="radio" aria-checked={P.p.theme === k} aria-label={t('phone.theme.' + k)} title={t('phone.theme.' + k)} style={{ background: SWATCH[k] }} className={P.p.theme === k ? 'on' : undefined} onClick={() => setPrefs({ theme: k })} />)}</div></div>
    <button type="button" className="pn-cc-grab" aria-label={t('phone.cc.close')} onClick={onClose}
      onPointerDown={e => { y0.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={e => { if (y0.current != null && e.clientY - y0.current < -30) onClose(); y0.current = null; }}><i /></button>
  </div>;
}
