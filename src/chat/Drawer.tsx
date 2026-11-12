// 장면 패널: 연결 · 등장인물 · 상태 · 작가 노트 · 상태 트래커 · 로어북 · 변수 · 배경 + 다른 기능이 꽂는 칸(X.panels)
import { editSchedule } from '../schedule/Editor';
import { memo, useRef, type ReactNode } from 'react';
import { Avatar, Btn, Dom, Icon, IconBtn } from '../kit';
import { menu } from '../ui';
import { cur, useCh } from './store';
import { armAuto, charsOf, drawDrawer, drawGauge, drawMain, drawMsgs, drawSide, drawTop, hudOpts, modeOf, moveOldSummary, presenceOf, setDrawer, track } from './actions';
import { editState } from './Hud';
import { inspector } from './Inspector';
import { liveSettings } from './LiveSettings';
import type { Cast, Room } from './types';
import { S, pickFiles, readDataURL, shrinkImage } from '../lib/core';
import { STATUS, scheduleOf } from '../lib/f-schedule';
import { LoreLinker } from '../editors/lore';
import { X } from '../lib/hooks';
import { Live } from '../lib/live';
import { t } from '../i18n';

const Sec = ({ title, ic, open, children }: { title: string; ic: string; open: boolean; children: ReactNode }) =>
  <details className="dsec" open={open}><summary><Icon name={ic} size={16} />{title}</summary><div className="dsec-body">{children}</div></details>;
const Sel = ({ label, value, opts, onChange }: { label: string; value: string; opts: [string, string][]; onChange: (v: string) => void }) =>
  <label className="field"><span className="field-label">{label}</span><select className="inp" defaultValue={value} onChange={e => onChange(e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;

function Body({ c }: { c: Room }) {
  const chars = charsOf(c);
  const timer = useRef(0);
  const saveChat = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => void S.save('chats', c, true), 300); };
  const muted = (ch: Cast) => (c.muted || []).includes(ch.id);
  // 상태: 캐릭터마다 지금 상태(일정 또는 직접 고른 것)와 일정 편집
  const presRow = (ch: Cast) => {
    const p = presenceOf(c, ch), over = p.from === 'override', has = !!scheduleOf(ch);
    return <div className="pres-row" key={ch.id}>
      <div className="pres-who"><i className={'presence ' + p.status} /><b>{ch.name}</b><small>{[STATUS[p.status], p.activity, over ? (p.until ? t('chat.drawer.until', { time: Live.clock(p.until) }) : t('chat.drawer.manual')) : has ? t('chat.drawer.bySchedule') : ''].filter(Boolean).join(' · ')}</small></div>
      <div className="pres-set">
        <select className="inp" title={t('chat.drawer.setStatus')} defaultValue={over ? p.status : ''} onChange={e => { const v = e.target.value; if (v) Live.setPresence(c, ch, { status: v, activity: over ? p.activity : '', hold: true }); else Live.clearPresence(c, ch); saveChat(); drawTop(); drawDrawer(); armAuto(); }}>
          {([['', has ? t('chat.drawer.bySchedule') : t('chat.drawer.onlineDefault')], ...Object.entries(STATUS)] as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <IconBtn ic="moon" title={t('chat.drawer.weekly', { name: ch.name })} onClick={() => editSchedule(ch)} /></div>
      {over ? <input className="inp" defaultValue={p.activity || ''} placeholder={t('chat.drawer.activityPh')} onChange={e => { const o = c.presenceBy?.[ch.id] || c.presence; if (o) o.activity = e.target.value; saveChat(); }} /> : null}
    </div>;
  };
  const trk = Object.entries(c.tracker || {}).filter(([k]) => !c.trackHide?.['w:' + k]), people = Object.keys(c.cast || {});
  const globals = new Set(S.settings.activeLore), charBooks = new Set(chars.flatMap(x => x.loreIds || []));
  const hits = cur.lastPrompt?.lore || [];
  const trackOn = !!S.settings.tracker.enabled;
  return <div className="drawer-body">
    <Sec title={t('chat.drawer.connSec')} ic="plug" open>
      <Sel label={t('chat.drawer.conn')} value={S.settings.activeConn || ''} opts={S.conns.length ? S.conns.map((x): [string, string] => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`]) : [['', t('chat.drawer.noConn')]]} onChange={v => { S.set({ activeConn: v }); drawTop(); }} />
      <Sel label={t('chat.drawer.preset')} value={S.settings.activePreset || ''} opts={S.presets.map((x): [string, string] => [x.id, x.name])} onChange={v => { S.set({ activePreset: v }); drawGauge(); }} />
      <Sel label={t('chat.drawer.persona')} value={S.persona(c)?.id || ''} opts={S.personas.map((x): [string, string] => [x.id, x.name])} onChange={v => { c.personaId = v; c.personaAuto = false; saveChat(); drawMsgs(); }} />
    </Sec>
    {modeOf(c) === 'talk' ? <Sec title={t('chat.drawer.statusSec')} ic="heart" open={false}>{chars.map(presRow)}<small className="hint">{t('chat.drawer.statusHint')}</small><Btn label={t('chat.drawer.liveSettings')} ic="sliders" cls="ghost" onClick={() => liveSettings('auto', c)} /></Sec> : null}
    <Sec title={t('chat.drawer.castSec')} ic="users" open={chars.length > 1}>
      <div className="members">{chars.map(ch => <div key={ch.id} className={'member' + (muted(ch) ? ' muted' : '')}><Avatar o={ch} cls="xs" /><span>{ch.name}</span>
        {chars.length > 1 && <IconBtn ic={muted(ch) ? 'eyeoff' : 'eye'} title={t('chat.drawer.mute')} onClick={() => { const mu = new Set(c.muted || []); if (!mu.delete(ch.id)) mu.add(ch.id); c.muted = [...mu]; saveChat(); drawDrawer(); }} />}
        {chars.length > 1 && <IconBtn ic="x" title={t('chat.drawer.removeChar')} onClick={async () => { c.charIds = c.charIds.filter(i => i !== ch.id); await S.save('chats', c, true); drawMain(); drawDrawer(); drawSide(); }} />}</div>)}</div>
      <div className="row"><Btn label={t('chat.drawer.invite')} ic="plus" cls="ghost" onClick={e => menu(e.currentTarget, S.chars.filter(x => !c.charIds.includes(x.id)).map(x => ({ label: x.name, onclick: async () => { c.charIds.push(x.id); await S.save('chats', c, true); drawMain(); drawDrawer(); drawSide(); } })))} /></div>
      {chars.length > 1 && <Sel label={t('chat.drawer.order')} value={c.groupOrder || ''} opts={[['natural', t('chat.drawer.orderNatural')], ['list', t('chat.drawer.orderList')]]} onChange={v => { c.groupOrder = v; saveChat(); }} />}
    </Sec>
    <Sec title={t('chat.drawer.noteSec')} ic="note" open={!!c.note?.text}>
      <textarea className="inp" rows={4} defaultValue={c.note?.text || ''} placeholder={t('chat.drawer.notePh')} onChange={e => { c.note = c.note ? { ...c.note, text: e.target.value } : { depth: 4, role: 'system', text: e.target.value }; saveChat(); }} />
      <label className="field inline"><span className="field-label">{t('chat.drawer.noteDepth')}</span><input className="inp" type="number" min={0} defaultValue={c.note?.depth ?? 4} onChange={e => { c.note = c.note ? { ...c.note, depth: +e.target.value || 0 } : { text: '', role: 'system', depth: +e.target.value || 0 }; saveChat(); }} /></label>
    </Sec>
    {c.summary ? <Sec title={t('chat.drawer.oldSummarySec')} ic="sparkle" open={false}>
      <textarea className="inp" rows={5} defaultValue={c.summary} onChange={e => { c.summary = e.target.value; saveChat(); }} />
      <small className="hint">{t('chat.drawer.oldSummaryHint')}</small>
      <div className="row"><Btn label={t('chat.drawer.moveSummary')} ic="sparkle" cls="ghost" onClick={() => void moveOldSummary(c)} /><Btn label={t('chat.drawer.clear')} cls="ghost" onClick={() => { c.summary = ''; c.summaryAt = 0; saveChat(); drawDrawer(); }} /></div>
    </Sec> : null}
    <Sec title={t('chat.drawer.trackerSec')} ic="heart" open={trackOn}>{trackOn ? <>
      {trk.length ? <div className="tracker read">{trk.map(([k, v]) => <div className="trk" key={k}><span>{k}{c.trackLock?.['w:' + k] ? <Icon name="lock" size={11} /> : null}</span><b>{v || '—'}</b></div>)}</div> : <p className="dim">{t('chat.drawer.trackerEmpty')}</p>}
      {people.length ? <small className="hint">{t('chat.drawer.people', { count: people.length, names: people.join(', ') })}</small> : null}
      <div className="row wrap"><Btn label={t('chat.drawer.trackerEdit')} ic="edit" cls="ghost" onClick={() => editState(c, hudOpts())} /><Btn label={t('chat.drawer.trackerNow')} ic="refresh" cls="ghost" title={t('chat.drawer.oneCall')} onClick={() => void track(c, cur.msgs)} /><Btn label={t('chat.drawer.trackerSettings')} ic="sliders" cls="ghost" onClick={() => liveSettings('tracker', c)} /></div>
    </> : <><p className="dim">{t('chat.drawer.trackerOff')}</p><Btn label={t('chat.drawer.trackerOn')} ic="sliders" cls="ghost" onClick={() => liveSettings('tracker', c)} /></>}</Sec>
    <Sec title={t('chat.drawer.loreSec')} ic="book" open={false}>
      <LoreLinker holder={c} save={saveChat} fixed={() => S.lore.filter(b => globals.has(b.id) || charBooks.has(b.id)).map(b => [b, globals.has(b.id) ? t('chat.drawer.loreGlobal') : t('chat.drawer.loreChar')])} />
      {hits.length ? <div className="hits"><small className="hint">{t('chat.drawer.loreHits', { count: hits.length })}</small>{hits.map((e, i) => <span className="chip static" key={i}>{e.name || e.keys?.[0] || e.book}</span>)}</div> : null}
    </Sec>
    <Sec title={t('chat.drawer.varsSec')} ic="code" open={false}>
      <textarea className="inp" rows={3} placeholder={t('chat.drawer.varsPh')} defaultValue={Object.entries(c.vars || {}).map(([k, v]) => `${k}=${v}`).join('\n')} onChange={e => { c.vars = Object.fromEntries(e.target.value.split('\n').map(l => l.split('=')).filter(p => p[0].trim()).map(p => [p[0].trim(), p.slice(1).join('=')])); saveChat(); }} />
      <small className="hint">{t('chat.drawer.varsHint')}</small>
    </Sec>
    <Sec title={t('chat.drawer.bgSec')} ic="image" open={false}><div className="row">
      <Btn label={t('chat.drawer.pickImage')} ic="upload" cls="ghost" onClick={async () => { const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return; c.bg = await shrinkImage(await readDataURL(f), 1920, 'image/jpeg', 0.85); await S.save('chats', c, true); drawMain(); }} />
      {c.bg && <Btn label={t('chat.drawer.clear')} cls="ghost" onClick={async () => { c.bg = ''; await S.save('chats', c, true); drawMain(); }} />}</div></Sec>
    {X.panels.map((p, i) => { try { return <Sec key={i} title={p.title || ''} ic={p.icon || 'sparkle'} open={!!p.open}><Dom node={p.render(c, cur.msgs)} /></Sec>; } catch (e) { console.warn('[확장 패널]', p.owner, e); return null; } })}
    <Btn label={t('chat.drawer.inspect')} ic="search" cls="ghost wide" onClick={inspector} />
  </div>;
}

export const Drawer = memo(function Drawer() {
  const ver = useCh('drawer'), kept = useRef<ReactNode>(null);
  const c = cur.chat;
  if (!cur.drawer || !c) return kept.current;   // 닫혀 있으면 열 때 그린다
  // 옛 것처럼 그릴 때마다 통째로 새로 만든다 (다른 기능이 꽂은 칸도 그때 다시 그려진다)
  return kept.current = <><header className="drawer-head"><b>{t('chat.drawer.title')}</b><IconBtn ic="x" title={t('common.close')} onClick={() => setDrawer(false)} /></header><Body key={ver} c={c} /></>;
});
