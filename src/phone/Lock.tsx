// 잠금 화면: 큰 시계 · 날짜 · 그 사람의 지금 · 알림. 위로 밀거나(손가락을 따라 transform 만) 아래 단추를 누르면 열린다
import { useRef, type PointerEvent as RPE } from 'react';
import { t } from '../i18n';
import { STATUS } from '../lib/f-schedule';
import { Emb, Fill, Glyph } from './art';
import { NotifStack } from './Notifs';
import { toggle, useMusic } from './music';
import { usePhone } from './ui';
import { presenceOf } from './data';
import { longDate, parts, storyOn, useMinute } from './time';
import type { Wall } from './wall';

/** 음악을 틀었으면 상태 줄 밑에 얇은 한 줄: 곡 이름 · 재생/멈춤 */
function LockMusic() {
  const m = useMusic(); if (!m.cur) return null;
  return <div className="pn-lock-music"><Fill name="music" size={13} /><span>{m.cur.name}</span>
    <button type="button" aria-label={m.playing ? t('phone.music.pause') : t('phone.music.play')} title={m.playing ? t('phone.music.pause') : t('phone.music.play')} onClick={toggle}><Fill name={m.playing ? 'pause' : 'play'} size={16} /></button></div>;
}

export function Lock({ wall, out, onUnlock }: { wall: Wall; out: boolean; onUnlock: () => void }) {
  const P = usePhone(), now = useMinute(), { h, m } = parts(now), el = useRef<HTMLDivElement>(null), drag = useRef<{ y: number; t: number; dy: number; raf: number; k: number } | null>(null);
  const fav = P.fav, pr = fav ? presenceOf(fav) : null;
  const down = (e: RPE) => { if ((e.target as Element).closest('button, input, form, .pn-notes')) return; const n = e.currentTarget as HTMLElement; drag.current = { y: e.clientY, t: performance.now(), dy: 0, raf: 0, k: n.getBoundingClientRect().height / (n.offsetHeight || 1) || 1 };   /* k: 넓은 화면에서 줄인 비율 */ e.currentTarget.setPointerCapture(e.pointerId); el.current?.classList.remove('settle'); };
  const move = (e: RPE) => { const d = drag.current; if (!d) return; d.dy = Math.min(0, (e.clientY - d.y) / d.k); if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; if (el.current) el.current.style.transform = `translate3d(0,${d.dy}px,0)`; }); };
  const up = () => {
    const d = drag.current; drag.current = null; if (!d) return; cancelAnimationFrame(d.raf);
    const v = d.dy / Math.max(1, performance.now() - d.t), node = el.current; if (!node) return;
    if (d.dy < -110 || v < -0.6) onUnlock();
    else { node.classList.add('settle'); node.style.transform = ''; }
  };
  const big = P.p.theme === 'soft';
  // 날짜 한 줄: 기본 테마는 숫자 밑에 작게, 다른 테마는 위에 (이야기 시간이면 끝에 작은 말 하나)
  const date = <p className="pn-lock-date">{longDate(now)}{storyOn() ? <span className="pn-story">{t('phone.storyShort')}</span> : null}</p>;
  return <div ref={el} className={'pn-lock' + (out ? ' out' : '')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <div className="pn-wall sharp" style={wall.sharp ? { backgroundImage: `url("${wall.sharp}")` } : { background: wall.css }} />
    <div className="pn-lock-top">
      {big ? null : date}
      <h1 className={'pn-lock-clock' + (big ? ' stack' : '')} aria-label={`${h}:${m}`}>{big ? <><span>{h}</span><i /><span>{m}</span></> : <span>{h}<em>:</em>{m}</span>}</h1>
      {big ? date : null}
      {fav && pr ? <p className="pn-lock-who"><i className={'pn-dot ' + pr.status} />{fav.name} · {pr.activity || STATUS[pr.status]}</p> : null}
      <LockMusic />
    </div>
    {P.notifs.length || P.sns ? <NotifStack list={P.notifs} sns={P.sns} max={2} /> : <Emb kind="window" className="pn-lock-quiet" />}
    <div className="pn-lock-foot">
      <button type="button" className="pn-round" aria-label={t('phone.app.calls')} title={t('phone.app.calls')} onClick={e => { onUnlock(); P.open('calls', undefined, e.currentTarget); }}><Fill name="phone" size={24} /></button>
      <button type="button" className="pn-unlock" onClick={onUnlock}><Glyph name="lock" size={16} /><span>{t('phone.lock.hint')}</span></button>
      <button type="button" className="pn-round" aria-label={t('phone.app.photos')} title={t('phone.app.photos')} onClick={e => { onUnlock(); P.open('photos', undefined, e.currentTarget); }}><Fill name="camera" size={24} /></button>
    </div>
  </div>;
}
