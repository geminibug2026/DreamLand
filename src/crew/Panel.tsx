// 막후의 대화 서랍 칸: 이 대화에서 켠 조수와 최근 결과 · 지금 실행 · 검토 대기 수 · 이야기 저울(가려 둔 줄거리와 밀어 주기) · 객석 창 열기
import { useState } from 'react';
import type { Msg } from '../lib/types';
import { go } from '../lib/router';
import { Btn, IconBtn, useEvents } from '../kit';
import { menu, toast } from '../ui';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';
import type { CrewChat, CrewDef } from './types';
import { cfg, defs, defOf, everyOf, isOn, latestOf, modeNow, nameOf, runNow, save, setChatOn, setPush, turnOf } from './logic';
import { Budget, PhaseTag } from './ui';
import { openReview } from './Review';
import { setSeatsOpen } from './Seats';
import { ScaleArt } from './Art';

const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);
const pad = (n: number) => String(n).padStart(2, '0');

/** 이야기 저울: 줄거리는 가려 두고, 누를 때만 보인다 */
function ScaleBox({ chat, d, msgs }: { chat: CrewChat; d: CrewDef; msgs: Msg[] }) {
  const [show, setShow] = useState(false), sc = chat.crew?.scale, push = !!chat.crew?.push;
  const left = sc ? Math.max(0, everyOf(d) - (turnOf(msgs) + 1 - sc.turn)) : 0;
  return <div className="cr-scale fx-frame">
    <div className="cr-scale-top"><ScaleArt tilt={push ? 0.9 : sc ? 0.35 : 0} veiled={!show} />
      <div><span className="fx-serif">{nameOf(d)}</span>
        <span className="fx-lbl kr">{sc ? t('crew.scale.next', { n: pad(left) }) : t('crew.scale.unset')}</span></div>
      {sc && <button type="button" className="fx-pill fx-tap" aria-pressed={show} onClick={() => setShow(!show)}>{show ? t('crew.scale.hide') : t('crew.scale.show')}</button>}
    </div>
    {sc && <div className={'cr-veil' + (show ? ' open' : '')} aria-hidden={!show}>
      <p><span className="fx-lbl kr">{t('crew.scale.arc')}</span>{show ? sc.arc : '— — — — — — — — — —'}</p>
      <p><span className="fx-lbl kr">{t('crew.scale.turn')}</span>{show ? sc.next : '— — — — — — —'}</p>
    </div>}
    <div className="row"><Btn label={push ? t('crew.scale.pushOn') : t('crew.scale.push')} ic="nudge" cls={push ? 'primary' : 'ghost'} title={t('crew.scale.pushHint')} onClick={() => void setPush(chat, !push).then(() => { if (!push) toast(t('crew.scale.pushed')); })} /></div>
  </div>;
}

export function CrewPanel({ chat, msgs }: { chat: CrewChat; msgs: Msg[] }) {
  const [, bump] = useState(0), redraw = () => bump(n => n + 1);
  useEvents('crew:changed', 'crew:seats');
  const c = cfg(), all = defs(), mode = modeNow(chat), mine = all.filter(d => isOn(d, chat)), pend = chat.crew?.pending?.length || 0, seats = defOf('seats')!, scale = defOf('scale')!;
  if (!c.on) return <div className="cr-panel"><p className="cr-note">{t('crew.panel.off')}</p><div className="row"><Btn label={t('crew.panel.turnOn')} cls="ghost" ic="crew" onClick={() => { c.on = true; save(); redraw(); }} /><Btn label={t('crew.panel.settings')} cls="ghost" ic="gear" onClick={() => go('studio')} /></div></div>;
  // 이 대화에서만 켜고 끄기: 전체 설정을 따름 → 반대로 → 다시 따름
  const pick = (e: HTMLElement) => menu(e, all.map(d => { const v = chat.crew?.on?.[d.id]; return { label: nameOf(d), ic: isOn(d, chat) ? 'check' : undefined, hint: v == null ? t('crew.row.mineFollow') : v ? t('crew.row.mineOn') : t('crew.row.mineOff'), onclick: () => void setChatOn(chat, d.id, v == null ? !c.enabled[d.id] : null) }; }));
  return <div className="cr-panel">
    <Budget chat={chat} />
    {mine.length ? <div className="cr-plist fx-rows">{mine.map(d => { const last = latestOf(chat, d, msgs), idle = !d.modes.includes(mode), turn = chat.crew?.last?.[d.id];
      return <div className={'cr-prow' + (idle ? ' idle' : '')} key={d.id}>
        <div className="cr-prow-top"><b>{nameOf(d)}</b><PhaseTag d={d} />{turn != null && <span className="fx-lbl fx-num">T{pad(turn)}</span>}
          {!d.free && <IconBtn ic="play" cls="tiny" title={t('crew.row.runNow')} onClick={() => void runNow(chat, d).catch(e => toast(errMsg(e), 'err'))} />}</div>
        {idle ? <small className="cr-last">{t('crew.panel.idle', { mode: t('crew.mode.' + mode) })}</small> : d.kind === 'scale' || d.kind === 'props' ? null : last ? <small className="cr-last">{last.slice(0, 140)}</small> : null}
      </div>; })}</div> : <p className="cr-note">{t('crew.panel.none')}</p>}
    {isOn(scale, chat) && scale.modes.includes(mode) && <ScaleBox chat={chat} d={scale} msgs={msgs} />}
    <div className="row wrap">
      <Btn label={t('crew.panel.pick')} ic="sliders" cls="ghost" onClick={e => pick(e.currentTarget)} />
      {pend > 0 && <Btn label={t('crew.panel.review', { n: pend })} ic="note" cls="ghost" onClick={() => openReview(chat)} />}
      {isOn(seats, chat) && chat.crew?.seats?.open === false && <Btn label={t('crew.panel.seats')} ic="seats" cls="ghost" onClick={() => void setSeatsOpen(chat, true).then(() => { redraw(); chatApi.redraw(); })} />}
      <Btn label={t('crew.panel.settings')} ic="gear" cls="ghost" onClick={() => go('studio')} />
    </div>
  </div>;
}
