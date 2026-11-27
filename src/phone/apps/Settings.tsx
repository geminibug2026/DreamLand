// 설정: 테마 · 배경화면(그러데이션 · 캐릭터 그림 · 올린 사진 · 사진 앱의 그림) · 위젯 · 위젯이 보여 줄 사람 · 시계 · 알림
import { useState } from 'react';
import { useThumb } from '../../kit';
import { S, pickFiles, readDataURL, shrinkImage } from '../../lib/core';
import type { Char } from '../../lib/types';
import { toast } from '../../ui';
import { t } from '../../i18n';
import { Glyph } from '../art';
import { AppHead, Seg, Switch, usePhone } from '../ui';
import { THEMES, saveWallPhoto, setPrefs, type GaugeKind, type ThemeId } from '../prefs';
import { GRADS, THEME_WALL } from '../wall';
import { WIDGETS } from '../widgets';
import { hasStory } from '../time';
import { nameOf } from '../data';

function CharWall({ ch, on }: { ch: Char; on: boolean }) {
  const u = useThumb(ch.avatar);
  return <button type="button" className={'pn-wallopt' + (on ? ' on' : '')} aria-pressed={on} aria-label={t('phone.set.wallChar', { name: ch.name })} title={ch.name} style={u ? { backgroundImage: `url("${u}")` } : undefined} onClick={() => setPrefs({ wall: 'char:' + ch.id })} />;
}

export function Settings() {
  const P = usePhone(), p = P.p, [busy, setBusy] = useState(false);
  const withArt = S.chars.filter(c => c.avatar).slice(0, 12);
  const upload = async () => {
    const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return; setBusy(true);
    try { const small = await shrinkImage(await readDataURL(f), 1280, 'image/webp', 0.86); if (!small) throw new Error(t('phone.set.badImage')); await saveWallPhoto(small); setPrefs({ wall: 'photo' }); toast(t('phone.ph.wallSet'), 'ok'); }
    catch (e) { toast(String((e as Error)?.message || e), 'err'); } finally { setBusy(false); }
  };
  const onPage = (id: string) => p.w1.includes(id) ? 1 : p.w2.includes(id) ? 2 : 0;
  const putW = (id: string, pg: number) => setPrefs({ w1: pg === 1 ? [...p.w1.filter(x => x !== id), id] : p.w1.filter(x => x !== id), w2: pg === 2 ? [...p.w2.filter(x => x !== id), id] : p.w2.filter(x => x !== id) });
  const muted = p.muted.map(id => S.get('chats', id)).filter(Boolean);
  return <div className="pn-appbody">
    <AppHead title={t('phone.app.settings')} big />
    <section className="pn-card"><h3>{t('phone.set.theme')}</h3>
      <div className="pn-themes" role="radiogroup" aria-label={t('phone.set.theme')}>{THEMES.map((k: ThemeId) => <button key={k} type="button" role="radio" aria-checked={p.theme === k} className={'pn-theme-opt' + (p.theme === k ? ' on' : '')} onClick={() => setPrefs({ theme: k })}>
        <span className={'pn-theme-mini ' + k} style={{ background: THEME_WALL[k] }}><i /><i /><i /></span><b>{t('phone.theme.' + k)}</b></button>)}</div></section>
    <section className="pn-card"><h3>{t('phone.set.wall')}</h3>
      <div className="pn-walls">
        <button type="button" className={'pn-wallopt' + (p.wall === 'theme' ? ' on' : '')} aria-pressed={p.wall === 'theme'} aria-label={t('phone.set.wallTheme')} title={t('phone.set.wallTheme')} style={{ background: THEME_WALL[p.theme] }} onClick={() => setPrefs({ wall: 'theme' })}><Glyph name="palette" size={18} /></button>
        {Object.entries(GRADS).map(([k, g]) => <button key={k} type="button" className={'pn-wallopt' + (p.wall === 'g:' + k ? ' on' : '')} aria-pressed={p.wall === 'g:' + k} aria-label={t('phone.set.wallGrad', { n: Object.keys(GRADS).indexOf(k) + 1 })} style={{ background: g }} onClick={() => setPrefs({ wall: 'g:' + k })} />)}
        {withArt.map(ch => <CharWall key={ch.id} ch={ch} on={p.wall === 'char:' + ch.id} />)}
        <button type="button" className={'pn-wallopt up' + (p.wall === 'photo' ? ' on' : '')} disabled={busy} aria-label={t('phone.set.wallUpload')} title={t('phone.set.wallUpload')} onClick={() => void upload()}><Glyph name="upload" size={18} /></button>
      </div>
      <p className="pn-hint">{p.wall.startsWith('il:') ? t('phone.set.wallFromPhoto') : t('phone.set.wallHint')}</p></section>
    <section className="pn-card"><h3>{t('phone.set.widgets')}</h3>
      <ul className="pn-wlist">{Object.values(WIDGETS).map(w => <li key={w.id}><span>{w.title()}</span>
        <Seg label={w.title()} value={String(onPage(w.id)) as '0' | '1' | '2'} onChange={v => putW(w.id, +v)} opts={[['1', t('phone.set.page1')], ['2', t('phone.set.page2')], ['0', t('phone.off')]] as const} /></li>)}</ul>
      <button type="button" className="pn-btn ghost wide" onClick={() => { P.setEdit(true); P.home2(); }}>{t('phone.set.editHome')}</button></section>
    <section className="pn-card"><h3>{t('phone.set.fav')}</h3><p className="pn-hint">{t('phone.set.favHint')}</p>
      <select className="pn-select" value={p.fav} aria-label={t('phone.set.fav')} onChange={e => setPrefs({ fav: e.target.value })}><option value="">{t('phone.set.favAuto')}</option>{S.chars.slice(0, 300).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <h4>{t('phone.set.gauge')}</h4>
      <Seg label={t('phone.set.gauge')} value={p.gauge} onChange={(v: GaugeKind) => setPrefs({ gauge: v })} opts={[['auto', t('phone.set.gAuto')], ['day', t('phone.set.gDay')], ['together', t('phone.set.gTogether')], ['tracker', t('phone.set.gTracker')]] as const} /></section>
    <section className="pn-card">
      <Switch on={p.story} label={t('phone.set.story')} hint={hasStory(P.home) ? t('phone.set.storyHint', { name: nameOf(P.home!) }) : t('phone.set.storyNone')} onChange={v => setPrefs({ story: v })} />
      <Switch on={p.previews} label={t('phone.set.previews')} hint={t('phone.set.previewsHint')} onChange={v => setPrefs({ previews: v })} />
    </section>
    <section className="pn-card"><h3>{t('phone.set.muted')}</h3>
      {muted.length ? <ul className="pn-list">{muted.map(c => <li key={c!.id} className="pn-row"><span><b>{nameOf(c!)}</b></span><button type="button" className="pn-btn ghost sm" onClick={() => setPrefs({ muted: p.muted.filter(x => x !== c!.id) })}>{t('phone.set.unmute')}</button></li>)}</ul>
        : <p className="pn-hint">{t('phone.set.mutedNone')}</p>}</section>
    <p className="pn-foot-note">{t('phone.set.about')}</p>
  </div>;
}
