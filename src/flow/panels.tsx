// 흐름: 창 · 장면 패널 · 흐름 화면(src/pages/Flow.tsx)의 조각 (옛 js/f-flow.js 의 화면)
import { useRef, useState } from 'react';
import { Btn, Icon, IconBtn } from '../kit';
import { Form, type FormDefs, confirmBox, menu, promptBox, toast } from '../ui';
import type { ChatX, Msg } from '../addons/types';
import { Check, openModal, useRedraw } from '../addons/parts';
import {
  A, DIRECT_HINT, REGEN_DEFAULT, TPL, addCheckpoint, adv, applyProfile, autoStat, branchFromCheckpoint, charsOf, checkpointMenu, copy, cps, cur, decorate, describe, directOn, findProfile, matches,
  posOf, profiles, regenCfg, regenWith, removeCheckpoint, rewindTo, saveChat, setDirect, showMessage, snapshot, type Profile,
} from './logic';
import { S, debounce, fmtTime, uid } from '../lib/core';
import { go } from '../lib/router';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';

const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'err');

/** 자동 이어쓰기 · 자동 다시 생성 설정 (div.col.flow-auto). 둘 다 모델을 한 번 더 부르므로 기본은 꺼짐 */
function AutoForm({ compact = false }: { compact?: boolean }) {
  const a = A(), sv = () => S.set({ auto: a });
  const defs: FormDefs = [
    !compact && { section: t('flow.auto.contSec') },
    { k: 'cont.on', label: t('flow.auto.contOn'), type: 'check', hint: t('flow.auto.contOnHint') },
    { k: 'cont.target', label: t('flow.auto.contTarget'), type: 'num', min: 0, half: true }, { k: 'cont.max', label: t('flow.auto.max'), type: 'num', min: 1, max: 10, half: true },
    !compact && { k: 'cont.talk', label: t('flow.auto.contTalk'), type: 'check', hint: t('flow.auto.contTalkHint') },
    !compact && { section: t('flow.auto.swipeSec') },
    { k: 'swipe.on', label: t('flow.auto.swipeOn'), type: 'check', hint: t('flow.auto.swipeOnHint') },
    { k: 'swipe.minLen', label: t('flow.auto.minLen'), type: 'num', min: 0, half: true, hint: t('flow.auto.minLenHint') }, { k: 'swipe.max', label: t('flow.auto.max'), type: 'num', min: 1, max: 10, half: true },
    { k: 'swipe.words', label: t('flow.auto.words'), type: compact ? 'tags' : 'lines', ph: compact ? t('flow.auto.wordsPhComma') : t('flow.auto.wordsPhLines'), half: !compact }, !compact && { k: 'swipe.threshold', label: t('flow.auto.threshold'), type: 'num', min: 1, half: true },
  ];
  return <div className="col flow-auto"><Form obj={a} defs={defs} onChange={sv} /></div>;
}

/** 다시 생성할 이유를 묻는 창 */
export function askRegen() {
  const { chat, msgs, busy } = cur(); if (!chat || busy) return; if (msgs[msgs.length - 1]?.role !== 'assistant') return toast(t('flow.regen.none'));
  const val = { text: '' }, recent = regenCfg().recent || [];
  function Body({ close }: { close: () => void }) {
    const inp = useRef<HTMLInputElement>(null);
    return <><input className="inp" ref={inp} placeholder={t('flow.regen.ph')} spellCheck={false} onChange={e => { val.text = e.target.value; }}
      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { close(); void regenWith(e.currentTarget.value); } }} />
      {recent.length ? <div className="flow-recent">{recent.map(r => <button key={r} type="button" className="chip" title={r} onClick={() => { const i = inp.current; if (i) { i.value = r; val.text = r; i.focus(); } }}>{r.length > 28 ? r.slice(0, 28) + '…' : r}</button>)}</div> : null}
      <small className="hint">{t('flow.regen.askHint')}</small></>;
  }
  openModal({ title: t('flow.regen.askTitle'), spec: 'div.col', actions: [{ label: t('flow.regen.plain'), onclick: () => { void regenWith(''); } }, { label: t('flow.regen.apply'), cls: 'primary', ic: 'refresh', onclick: () => { void regenWith(val.text); } }] }, close => <Body close={close} />);
}

/** 연출 지시 설정 */
function DirectForm() {
  const D = S.settings.direct as object;
  return <Form obj={D} onChange={() => S.set({ direct: D })} defs={[
    { k: 'prompt', label: t('flow.direct.prompt'), type: 'area', rows: 5, ph: DIRECT_HINT, hint: t('flow.direct.promptHint') },
    { k: 'past', label: t('flow.direct.past'), type: 'select', opts: [['note', t('flow.direct.pastNote')], ['drop', t('flow.direct.pastDrop')]], half: true }, { k: 'pastFormat', label: t('flow.direct.pastFormat'), half: true, ph: '[Author direction: {{direction}}]' },
  ]} />;
}

/** 장면 패널: 체크포인트 (div.col.cp-panel 안) */
export function CheckpointPanel({ chat, msgs }: { chat: ChatX; msgs: Msg[] }) {
  const draw = useRedraw(), room = (c: ChatX) => chatApi.roomName(c);
  const list = [...cps(chat)].map(c => ({ c, i: posOf(c, msgs) })).sort((a, b) => (a.i < 0 ? 1e9 : a.i) - (b.i < 0 ? 1e9 : b.i));
  const kids = S.chats.filter(x => x.parent?.id === chat.id).sort((a, b) => (a.parent?.at || 0) - (b.parent?.at || 0)), parent = chat.parent && S.get('chats', chat.parent.id);
  return <>
    <Btn label={t('flow.cp.addHere')} ic="star" cls="ghost" onClick={async () => { if (!msgs.length) return toast(t('flow.cp.noMsgs')); const name = await promptBox(t('flow.cp.nameAsk'), t('flow.cp.defaultName', { n: cps(chat).length + 1 })); if (name === null) return; await addCheckpoint(msgs[msgs.length - 1], name.trim()); draw(); }} />
    {list.length ? <div className="cp-list">{list.map(({ c, i }) => <div key={c.id} className={'cp-row' + (i < 0 ? ' gone' : '')}>
      <button className="cp-main" title={t('flow.cp.view')} onClick={() => i >= 0 ? void showMessage(c.msgId) : toast(t('flow.cp.gone'))}><i className="cp-dot" /><div className="cp-text"><b>{c.name}</b><small>{i >= 0 ? t('flow.cp.pos', { n: String(i + 1).padStart(3, '0'), where: msgs.length - 1 - i ? t('flow.cp.back', { count: msgs.length - 1 - i }) : t('flow.cp.now'), time: fmtTime(c.ts) }) : t('flow.cp.goneShort')}</small></div></button>
      <IconBtn ic="branch" title={t('flow.cp.menuBranch')} cls="tiny" onClick={() => { branchFromCheckpoint(c).catch(fail); }} />
      <IconBtn ic="more" title={t('flow.more')} cls="tiny" onClick={e => menu(e.currentTarget, [
        { label: t('flow.cp.rename'), ic: 'edit', onclick: async () => { const v = await promptBox(t('flow.cp.nameAsk'), c.name); if (v === null || !v.trim()) return; c.name = v.trim(); await saveChat(chat); decorate(); draw(); } },
        i >= 0 && i < msgs.length - 1 ? { label: t('flow.cp.menuRewind'), ic: 'refresh', hint: t('flow.cp.menuRewindHint'), onclick: () => { rewindTo(c).catch(fail); } } : null,
        '-', { label: t('flow.cp.menuDelete'), ic: 'trash', danger: true, onclick: async () => { await removeCheckpoint(c); draw(); } }])} />
    </div>)}</div> : <p className="dim">{t('flow.cp.empty')}</p>}
    {parent || kids.length ? <div className="cp-rooms"><small className="hint">{t('flow.cp.rooms')}</small>
      {parent ? <button className="cp-room" onClick={() => go('chat', parent.id)}><Icon name="left" size={14} /><span>{room(parent)}</span><small>{t('flow.cp.parentAt', { at: chat.parent?.at ?? '' })}</small></button> : null}
      {kids.map(k => <button key={k.id} className="cp-room" onClick={() => go('chat', k.id)}><Icon name="branch" size={14} /><span>{room(k)}</span><small>{t('flow.cp.kidAt', { at: k.parent?.at ?? '', count: k.count || 0 })}</small></button>)}</div> : null}
  </>;
}
/** 메시지 ⋯ 메뉴 › 체크포인트 남기기 · 고치기 */
export async function checkpointAction(msg: Msg, chat: ChatX) {
  const cp = cps(chat).find(c => c.msgId === msg.id);
  const name = await promptBox(cp ? t('flow.cp.nameAskEdit') : t('flow.cp.nameAsk'), cp ? cp.name : t('flow.cp.defaultName', { n: cps(chat).length + 1 })); if (name === null) return;
  if (cp && !name.trim()) { await removeCheckpoint(cp); return toast(t('flow.cp.removed')); }
  await addCheckpoint(msg, name.trim()); toast(t('flow.cp.added'), 'ok');
}
export { checkpointMenu };

// ── 연결 프로필 ──
function ProfileFields({ p, sv }: { p: Profile; sv: () => void }) {
  const { KINDS, tplList } = adv(), none: [string, string][] = [['', t('flow.prof.keep')]];
  return <Form obj={p} defs={[
    { k: 'name', label: t('flow.prof.name') },
    { k: 'connId', label: t('flow.prof.connField'), type: 'select', opts: [...none, ...S.conns.map(c => [c.id, c.name] as [string, string])], half: true }, { k: 'model', label: t('flow.prof.model'), half: true, ph: t('flow.prof.modelPh') },
    { k: 'presetId', label: t('flow.prof.preset'), type: 'select', opts: [...none, ...S.presets.map(x => [x.id, x.name] as [string, string])], half: true },
    { k: 'instructOn', label: t('flow.prof.instruct'), type: 'select', opts: [...none, ['true', t('flow.prof.on')], ['false', t('flow.prof.off')]], half: true },
    ...TPL().map(k => ({ k: 'tpl.' + k, label: KINDS[k], type: 'select', opts: [...none, ...tplList(k).map(x => [x.name, x.name] as [string, string])], half: true })),
  ]} onChange={() => { p.instructOn = p.instructOn === 'true' || p.instructOn === true ? true : p.instructOn === 'false' || p.instructOn === false ? false : null; sv(); }} />;
}
/** 흐름 화면: 연결 프로필 */
export function ProfilesPane() {
  const draw = useRedraw(), list = profiles();
  const [open] = useState(() => new Set<string>()), [sv] = useState(() => debounce(() => S.set({ profiles: profiles() }), 250));
  const keep = () => { S.set({ profiles: list }); draw(); };
  return <>
    <div className="card"><h3 className="form-sec">{t('flow.prof.title')}</h3>
      <p className="hint">{t('flow.prof.intro')}</p>
      <div className="row wrap"><Btn label={t('flow.prof.save')} ic="plus" cls="primary" onClick={async () => { const name = await promptBox(t('flow.prof.nameAsk'), `${S.conn()?.name || t('flow.prof.noConn')} · ${S.preset()?.name || ''}`); if (name === null) return; const p = snapshot(name.trim()); list.push(p); open.add(p.id); keep(); }} />
        <small className="hint">{t('flow.prof.now', { what: describe(snapshot('')) })}</small></div></div>
    {list.map((p, i) => {
      const on = matches(p), isOpen = open.has(p.id);
      return <div key={p.id} className={'block flow-prof' + (isOpen ? ' open' : '')}>
        <div className="block-head" onClick={e => { if ((e.target as Element).closest('button')) return; if (isOpen) open.delete(p.id); else open.add(p.id); draw(); }}>
          <Icon name="plug" size={15} /><div className="flow-prof-text"><b>{p.name}</b><small>{describe(p)}</small></div>{on ? <em className="badge on">{t('flow.prof.active')}</em> : null}
          <Btn label={t('flow.prof.apply')} cls="ghost" ic="check" onClick={async () => { await applyProfile(p); draw(); }} />
          <IconBtn ic="more" title={t('flow.more')} cls="tiny" onClick={e => menu(e.currentTarget, [
            { label: t('flow.prof.overwrite'), ic: 'refresh', onclick: () => { Object.assign(p, { ...snapshot(p.name), id: p.id }); keep(); toast(t('flow.prof.overwritten'), 'ok'); } },
            { label: t('flow.prof.dup'), ic: 'copy', onclick: () => { list.splice(i + 1, 0, { ...copy(p), id: uid(), name: t('flow.prof.copyName', { name: p.name }) }); keep(); } },
            '-', { label: t('flow.prof.del'), ic: 'trash', danger: true, onclick: async () => { if (!(await confirmBox(t('flow.prof.delAsk', { name: p.name }), t('flow.prof.delOk'), true))) return; list.splice(list.indexOf(p), 1); keep(); } }])} /></div>
        {isOpen ? <div className="block-body"><ProfileFields p={p} sv={() => { sv(); draw(); }} /></div> : null}
      </div>;
    })}
    {!list.length ? <p className="dim pad">{t('flow.prof.empty')}</p> : null}
  </>;
}
/** 장면 패널: 연결 프로필 (div.col.flow-panel 안) */
export function ProfilePanel({ chat }: { chat: ChatX }) {
  const draw = useRedraw(), list = profiles(), ch = charsOf(chat)[0], now_ = list.find(matches);
  const pick = (label: string, value: string | undefined, onchange: (v: string) => Promise<void>, first: string) => <label className="field"><span className="field-label">{label}</span>
    <select className="inp" value={value || ''} onChange={e => { void onchange(e.target.value).then(draw); }}>{[['', first], ...list.map(p => [p.id, p.name])].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  if (!list.length) return <><p className="dim">{t('flow.prof.panelEmpty')}</p><Btn label={t('flow.prof.make')} ic="plus" cls="ghost" onClick={() => go('flow', 'profiles')} /></>;
  return <>
    {pick(t('flow.prof.switchNow'), now_?.id, async v => { const p = findProfile(v); if (!p) return; await applyProfile(p); go('chat', chat.id); }, now_ ? '—' : t('flow.prof.custom'))}
    {pick(t('flow.prof.bindChat'), chat.profileId, async v => { chat.profileId = v; await saveChat(chat); const p = findProfile(v); if (p && !matches(p)) { await applyProfile(p); go('chat', chat.id); } }, t('flow.prof.unbound'))}
    {ch ? pick(t('flow.prof.bindChar', { name: ch.name }), ch.bind?.profileId, async v => { ch.bind = ch.bind ? { ...ch.bind, profileId: v } : { connId: '', presetId: '', personaId: '', profileId: v }; await S.save('chars', ch, true); const p = !chat.profileId && findProfile(v); if (p && !matches(p)) { await applyProfile(p); go('chat', chat.id); } }, t('flow.prof.unbound')) : null}
    <small className="hint">{t('flow.prof.bindHint')}</small>
    <Btn label={t('flow.prof.manage')} ic="sliders" cls="ghost" onClick={() => go('flow', 'profiles')} />
  </>;
}
/** 장면 패널: 자동 진행 · 연출 (div.col 안) */
export function AutoPanel({ chat }: { chat: ChatX }) {
  const draw = useRedraw(), R = regenCfg();
  return <>
    <Check label={t('flow.direct.mode')} on={directOn(chat)} onChange={v => { void setDirect(chat, v).then(draw); }} hint={t('flow.direct.modeHint')} />
    <Check label={t('flow.regen.askEach')} on={!!R.ask} onChange={v => { R.ask = v; S.set({ regenWhy: R }); draw(); }} hint={t('flow.regen.shiftSkip')} />
    <small className="hint">{t('flow.auto.costNote')}</small>
    <AutoForm compact />
    {autoStat.calls ? <small className="hint">{autoStat.note ? t('flow.auto.statNote', { n: autoStat.calls, note: autoStat.note }) : t('flow.auto.stat', { n: autoStat.calls })}</small> : null}
    <Btn label={t('flow.auto.more')} ic="sliders" cls="ghost" onClick={() => go('flow', 'auto')} />
  </>;
}

// ════════ 흐름 화면(src/pages/Flow.tsx)의 탭. 각각 div.col.flow-pane 안을 그린다 ════════
export const flowPanes = {
  auto: () => <div className="card"><AutoForm />
    <p className="hint">{t('flow.auto.paneCost', { swipe: A().swipe.max, cont: A().cont.max })}</p>
    <p className="hint">{t('flow.auto.paneNote')}</p></div>,
  direct: () => <>
    <div className="card"><h3 className="form-sec">{t('flow.direct.mode')}</h3>
      <p className="hint">{t('flow.direct.intro')}</p>
      <DirectForm /></div>
    <div className="card"><h3 className="form-sec">{t('flow.regen.title')}</h3>
      <p className="hint">{t('flow.regen.intro')}</p>
      <Form obj={regenCfg()} onChange={() => S.set({ regenWhy: regenCfg() })} defs={[
        { k: 'ask', label: t('flow.regen.askLabel'), type: 'check', hint: t('flow.regen.askLabelHint') },
        { k: 'withDraft', label: t('flow.regen.withDraft'), type: 'check', hint: t('flow.regen.withDraftHint') },
        { k: 'format', label: t('flow.regen.format'), type: 'area', rows: 3, ph: REGEN_DEFAULT, hint: t('flow.regen.formatHint') },
      ]} /></div></>,
  profiles: () => <ProfilesPane />,
};
