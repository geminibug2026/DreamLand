// 대화 모드 설정 창: 선톡 · 일정 · 상태 · 장면 · 상태창을 한곳에서 (옛 js/live.js 의 settings)
import { rowNode } from '../schedule/Editor';
import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import * as sched from '../lib/f-schedule';
import { Btn, Dom, Icon } from '../kit';
import { Form, openModal, toast, type FieldDef, type ModalHandle } from '../ui';
import { charsOf } from './actions';
import type { Room } from './types';
import { Live, PROMPTS } from '../lib/live';
import { S, chatConns } from '../lib/core';
import * as libLive from '../lib/live';
import { t } from '../i18n';

type Tab = 'auto' | 'sched' | 'presence' | 'scene' | 'tracker';
const TABS: [Tab, string][] = [['auto', 'chat.live.tab.auto'], ['sched', 'chat.live.tab.sched'], ['presence', 'chat.live.tab.presence'], ['scene', 'chat.live.tab.scene'], ['tracker', 'chat.live.tab.tracker']];   // 이름은 그릴 때 t()

/** 연락 현황판: 다음 연락 예정과 막힌 이유 */
function Board({ chat, close }: { chat?: Room; close: () => void }) {
  const { MOTIVES, MOTIVE_ORDER, motiveLabel } = sched;
  const p = chat ? Live.planOf?.(chat) : null;
  if (!p) return <div className="plan-board"><p className="hint">{chat ? t('chat.live.board.openChat') : t('chat.live.board.inChat')}</p></div>;
  const next = p.plan.at ? `${Live.clock(p.plan.at)}` : t('chat.live.board.none'), kindName = p.plan.kind === 'later' ? t('chat.live.board.later') : p.plan.kind === 'owed' ? t('chat.live.board.owed') : p.plan.kind === 'auto' ? t('chat.live.board.expected', { motive: motiveLabel(p.motive?.kind) || t('chat.live.board.justHi') }) : '';
  return <div className="plan-board">
    <div className="plan-cells">
      <div className="plan-cell"><span>{t('chat.live.board.sent')}</span><b>{`${p.count} / ${p.cap}`}</b><i className="plan-bar"><i style={{ width: Math.min(100, p.count / Math.max(1, p.cap) * 100) + '%' }} /></i></div>
      <div className="plan-cell"><span>{t('chat.live.board.next')}</span><b>{next}</b>{kindName ? <small>{kindName}</small> : null}</div>
      <div className="plan-cell"><span>{t('chat.live.board.last')}</span><b>{p.last?.at ? Live.clock(p.last.at) : t('chat.live.board.notYet')}</b>{p.last?.kind ? <small>{motiveLabel(p.last.kind)}</small> : null}</div>
      <div className="plan-cell"><span>{t('chat.live.board.nowStatus')}</span><b>{p.who || ''}</b><small>{p.status || ''}</small></div>
    </div>
    {p.plan.blocks.length ? <div className="plan-why"><b>{t('chat.live.board.why')}</b><ul>{p.plan.blocks.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null}
    {p.plan.notes.length ? <div className="plan-why soft"><b>{t('chat.live.board.notes')}</b><ul>{p.plan.notes.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null}
    <div className="plan-cds"><span className="plan-cds-label">{t('chat.live.board.motives')}</span>{MOTIVE_ORDER.map(k => { const left = p.cdLeft?.[k] || 0; return <span key={k} className={'plan-cd' + (left ? ' wait' : '')} title={MOTIVES[k][2]}>{motiveLabel(k)}<small>{left ? t('chat.live.board.after', { span: Live.span(left) }) : t('chat.live.board.ready')}</small></span>; })}</div>
    <div className="row wrap"><Btn label={t('chat.live.board.poke')} ic="send" cls="ghost" title={t('chat.live.board.pokeCost')} onClick={async () => { const r = chat ? await Live.poke?.(chat) : false; if (r === false) toast(t('chat.live.board.cantPoke')); else close(); }} />
      <small className="hint">{t('chat.live.board.pokeHint')}</small></div>
  </div>;
}

function Settings({ first, chat, close }: { first: Tab; chat?: Room; close: () => void }) {
  const [tab, setTab] = useState<Tab>(first), [, redraw] = useReducer((x: number) => x + 1, 0);
  const st = S.settings, { MOTIVES, MOTIVE_ORDER, motiveLabel } = sched;
  const apply = () => { S.set({}); Live.onChange?.(); redraw(); };
  useEffect(() => { const t = setInterval(redraw, 20000); return () => clearInterval(t); }, []);
  const prompts = (kind: string): FieldDef[] => PROMPTS[kind].map(([k, label, dflt, hint]) => ({ k, label, type: 'area', rows: 5, ph: dflt, hint: `${hint ? hint + ' ' : ''}${t('chat.live.promptHint')}` }));
  const form = (defs: (FieldDef | null)[]) => <Form obj={st} defs={defs} onChange={apply} />;
  const fold = (title: string, defs: FieldDef[]): FieldDef => ({ el: <details className="live-fold"><summary><Icon name="edit" size={14} />{title}</summary>{form(defs)}</details> });
  const conns: [string, string][] = [['', t('chat.live.conns.same')], ...chatConns().map((c): [string, string] => [c.id, `${c.name}${c.model ? ' · ' + c.model : ''}`])];
  const chars = chat ? charsOf(chat) : [];
  // 일정 줄은 옛 화면 조각이다. 일정이 바뀔 때만 새로 만든다
  const [schedGen, bumpSched] = useReducer((x: number) => x + 1, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const schedRows = useMemo(() => chars.map(c => <Dom key={c.id} node={rowNode(c, () => { Live.onChange?.(); bumpSched(); })} />), [schedGen, chat]);
  const cdDefs: FieldDef[] = MOTIVE_ORDER.map(k => ({ k: `modes.cd.${k}`, label: t('chat.live.cdLabel', { motive: motiveLabel(k) }), type: 'num', min: 0, step: 0.5, third: true, hint: MOTIVES[k][2] }));
  const body: Record<Tab, () => ReactNode> = {
    auto: () => <><p className="hint">{t('chat.live.auto.hint')}</p><Board chat={chat} close={close} />
      {form([{ section: t('chat.live.auto.secQuiet') }, { k: 'modes.auto', label: t('chat.live.auto.on'), type: 'check' },
        { k: 'modes.autoMinutes', label: t('chat.live.auto.minutes'), type: 'num', min: 1, third: true }, { k: 'modes.autoBackoff', label: t('chat.live.auto.backoff'), type: 'num', min: 1, step: 0.5, third: true, hint: t('chat.live.auto.backoffHint') }, { k: 'modes.autoStreak', label: t('chat.live.auto.streak'), type: 'num', min: 1, max: 10, third: true },
        { k: 'modes.autoDaily', label: t('chat.live.auto.daily'), type: 'num', min: 0, third: true, hint: t('chat.live.auto.dailyHint') }, { k: 'modes.quietFrom', label: t('chat.live.auto.quietFrom'), third: true, ph: '01:00' }, { k: 'modes.quietTo', label: t('chat.live.auto.quietTo'), third: true, ph: '08:00' },
        { k: 'modes.autoHidden', label: t('chat.live.auto.hidden'), type: 'check' },
        { section: t('chat.live.board.motives') }, { k: 'modes.motives', label: t('chat.live.auto.motives'), type: 'check', hint: t('chat.live.auto.motivesHint') },
        { k: 'modes.readReact', label: t('chat.live.auto.readReact'), type: 'check' }, { k: 'modes.showWhy', label: t('chat.live.auto.showWhy'), type: 'check' },
        { k: 'modes.longHours', label: t('chat.live.auto.longHours'), type: 'num', min: 1, third: true, hint: t('chat.live.auto.longHoursHint') },
        fold(t('chat.live.auto.cdFold'), [...cdDefs, { el: <small className="hint">{t('chat.live.auto.cdHint')}</small> }]),
        { section: t('chat.live.auto.secLater') }, { k: 'modes.later', label: t('chat.live.auto.later'), type: 'check' }, { k: 'modes.laterMax', label: t('chat.live.auto.laterMax'), type: 'num', min: 1, max: 10, half: true },
        { k: 'modes.away', label: t('chat.live.auto.away'), type: 'check' }, { k: 'modes.awayHours', label: t('chat.live.auto.awayHours'), type: 'num', min: 1, half: true },
        { section: t('chat.live.auto.secCost') }, { k: 'modes.autoConn', label: t('chat.live.auto.conn'), type: 'select', opts: conns, half: true, hint: t('chat.live.auto.connHint') }, { k: 'modes.autoTokens', label: t('chat.live.auto.tokens'), type: 'num', min: 0, half: true, hint: t('chat.live.auto.tokensHint') },
        { k: 'modes.notify', label: t('chat.live.auto.notify'), type: 'check' },
        fold(t('chat.live.editPrompts'), prompts('auto'))])}</>,
    sched: () => <><p className="hint">{t('chat.live.sched.hint')}</p>
      {form([{ k: 'modes.sched', label: t('chat.live.sched.on'), type: 'check', hint: t('chat.live.sched.onHint') }])}
      <div className="sched-items">{chars.length ? schedRows : <p className="dim">{t('chat.live.sched.noChat')}</p>}</div>
      {form([fold(t('chat.live.editPrompts'), prompts('sched'))])}</>,
    presence: () => <><p className="hint">{t('chat.live.pres.hint')}</p>
      {form([{ section: t('chat.live.pres.secMe') }, { k: 'modes.userStatus', label: t('chat.live.pres.userStatus'), type: 'select', half: true, opts: Object.entries(Live.userStatuses), hint: t('chat.live.pres.userStatusHint') }, { k: 'modes.userActivity', label: t('chat.live.pres.userActivity'), half: true, ph: t('chat.live.pres.userActivityPh') },
        { k: 'modes.userIdleMin', label: t('chat.live.pres.idleMin'), type: 'num', min: 0, third: true, hint: t('chat.live.pres.idleMinHint') },
        { section: t('chat.live.pres.secDelay') }, { k: 'modes.presenceDelay', label: t('chat.live.pres.delay'), type: 'check', hint: t('chat.live.pres.delayHint') },
        { k: 'modes.delayOnline', label: t('chat.live.pres.delayOnline'), third: true, ph: '0' }, { k: 'modes.delayIdle', label: t('chat.live.pres.delayIdle'), third: true, ph: '4-10' }, { k: 'modes.delayDnd', label: t('chat.live.pres.delayDnd'), third: true, ph: '9-18', hint: t('chat.live.pres.delayDndHint') },
        { k: 'modes.delayNamed', label: t('chat.live.pres.delayNamed'), type: 'num', min: 0, max: 100, third: true, hint: t('chat.live.pres.delayNamedHint') },
        { k: 'modes.offlineWake', label: t('chat.live.pres.offlineWake'), type: 'check' },
        { section: t('chat.live.pres.secChime') }, { k: 'modes.chime', label: t('chat.live.pres.chime'), type: 'check', hint: t('chat.live.pres.chimeHint') },
        { k: 'modes.chimeChance', label: t('chat.live.pres.chimeChance'), type: 'num', min: 0, max: 100, third: true, hint: t('chat.live.pres.chimeChanceHint') }, { k: 'modes.chimeMax', label: t('chat.live.pres.chimeMax'), type: 'num', min: 1, max: 5, third: true }, { k: 'modes.chimeDaily', label: t('chat.live.pres.chimeDaily'), type: 'num', min: 1, third: true },
        fold(t('chat.live.editPrompts'), prompts('group'))])}</>,
    scene: () => <><p className="hint">{t('chat.live.scene.hint')}</p>
      {form([{ k: 'modes.scenes', label: t('chat.live.scene.on'), type: 'check' }, { k: 'modes.sceneStart', label: t('chat.live.scene.start'), type: 'check' }, fold(t('chat.live.editPrompts'), prompts('scene'))])}</>,
    tracker: () => <><p className="hint">{t('chat.live.trk.hint')}</p>
      {form([{ k: 'tracker.enabled', label: t('chat.live.trk.on'), type: 'check' }, { k: 'tracker.mode', label: t('chat.live.trk.mode'), type: 'select', opts: [['call', t('chat.live.trk.modeCall')], ['inline', t('chat.live.trk.modeInline')]], hint: t('chat.live.trk.modeHint') },
        { k: 'tracker.hud', label: t('chat.live.trk.hud'), type: 'check' }, { k: 'tracker.inject', label: t('chat.live.trk.inject'), type: 'check' },
        { k: 'tracker.fields', label: t('chat.live.trk.fields'), type: 'area', rows: 6, hint: t('chat.live.trk.fieldsHint') },
        { section: t('chat.live.trk.secCast') }, { k: 'tracker.cast', label: t('chat.live.trk.cast'), type: 'check', hint: t('chat.live.trk.castHint') },
        { k: 'tracker.castFields', label: t('chat.live.trk.castFields'), type: 'area', rows: 4, hint: t('chat.live.trk.castFieldsHint') },
        { k: 'tracker.castOthers', label: t('chat.live.trk.castOthers'), type: 'check', half: true }, { k: 'tracker.castMax', label: t('chat.live.trk.castMax'), type: 'num', min: 1, max: 12, half: true },
        { el: <p className="hint">{t('chat.live.trk.footHint')}</p> },
        fold(t('chat.live.editPrompts'), prompts('tracker'))])}</>,
  };
  return <div className="col">
    <div className="tabs live-tabs">{TABS.map(([k, l]) => <button key={k} type="button" className={'tab' + (k === tab ? ' on' : '')} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
    <div className="live-set" key={tab}>{body[tab]()}</div>
  </div>;
}

/** 대화 모드 설정 창을 연다 */
export function liveSettings(tab: string = 'auto', chat?: Room | null): ModalHandle {
  libLive.ensureDefaults();
  const first: Tab = TABS.some(t => t[0] === tab) ? tab as Tab : 'auto';
  const box: ModalHandle = openModal({ title: t('chat.live.title'), wide: true, body: <Settings first={first} chat={chat ?? undefined} close={() => box.close()} />, actions: [{ label: t('common.close'), cls: 'primary' }] });
  return box;
}
