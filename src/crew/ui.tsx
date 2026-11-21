// 막후의 기능 화면(Studio 탭): 조수 목록(켜기 · 간격 · 단계 · 이 대화에서만) · 맞춤 조수 편집기 · 검토함 · 실행 기록
import { useEffect, useState, type ReactNode } from 'react';
import { S, chatConns, download, on, pickFiles, readText } from '../lib/core';
import { Btn, Icon, IconBtn, useEvents } from '../kit';
import { Form, confirmBox, menu, toast, type FormDefs } from '../ui';
import { Select, openModal } from '../addons/parts';
import { Switch } from '../studio/parts';
import { chatApi, roomName } from '../chat/actions';
import { t } from '../i18n';
import type { CrewChat, CrewDef, LogItem } from './types';
import { SAMPLES, STYLE_IDS } from './builtin';
import { blank, budget, cfg, clearLog, defs, descOf, everyOf, exportDefs, fixDef, importDefs, isOn, loadLog, nameOf, runNow, save, setChatOn, tidy, waiting } from './logic';
import { ReviewList } from './Review';
import { EmptyLog, EmptyTray, RigArt } from './Art';

// 화면을 떠났다 돌아와도 남는 것
const view = { tab: 'list' as 'list' | 'review' | 'log', open: '' };
/** 기능 화면에서 "이 대화"는 지금 열린 대화, 없으면 마지막에 연 대화 */
export const ctxChat = (): CrewChat | null => (chatApi.current().chat as CrewChat | null) || (S.get('chats', S.settings.lastChat) as CrewChat | undefined) || null;
const pad = (n: number) => String(n).padStart(2, '0');
const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);

/** 단계 딱지: 답장 전 · 답장 뒤 · 다시쓰기 · 호출 없음 */
export function PhaseTag({ d }: { d: CrewDef }) {
  const k = d.free ? 'free' : d.out === 'rewrite' ? 'rewrite' : d.phase;
  return <span className={'cr-phase ' + k} title={t('crew.phase.' + k + '.hint')}><i />{t('crew.phase.' + k)}</span>;
}
/** 한 턴에 더 부르는 횟수: 켜진 것만큼 칸이 찬다 */
export function Budget({ chat }: { chat?: CrewChat | null }) {
  const b = budget(chat), cell = (k: 'before' | 'after' | 'rewrite') => <div className="fx-kv" key={k}><span>{t('crew.budget.' + k)}</span><i /><b>{b[k]}<small>/1</small></b></div>;
  return <div className="cr-budget">{cell('before')}{cell('after')}{cell('rewrite')}</div>;
}

// ── 조수별 설정 (펼친 줄 안) ──
function Options({ d, redraw }: { d: CrewDef; redraw: () => void }) {
  const c = cfg();
  const defsFor = (): FormDefs => {
    if (d.kind === 'seats') return [
      { k: 'seats.style', label: t('crew.seats.style'), type: 'select', opts: [...STYLE_IDS.map(id => [id, t('crew.seats.s.' + id)] as const), ['custom', t('crew.seats.s.custom')] as const], half: true, live: true },
      { k: 'seats.lines', label: t('crew.seats.lines'), type: 'num', min: 3, max: 6, half: true },
      c.seats.style === 'custom' && { k: 'seats.custom', label: t('crew.seats.custom'), type: 'area', rows: 3, ph: t('crew.seats.customPh') },
      { k: 'prompts.seats', label: t('crew.opt.prompt'), type: 'area', rows: 4, ph: d.prompt.slice(0, 400) + ' …', hint: t('crew.opt.promptHint') }];
    if (d.kind === 'proof') return [
      { k: 'proof.words', label: t('crew.proof.words'), type: 'lines', rows: 4, hint: t('crew.proof.wordsHint') },
      { k: 'proof.repeat', label: t('crew.proof.repeat'), type: 'check', hint: t('crew.proof.repeatHint') },
      { k: 'proof.opener', label: t('crew.proof.opener'), type: 'check', hint: t('crew.proof.openerHint') },
      { k: 'proof.speakFor', label: t('crew.proof.speakFor'), type: 'check', hint: t('crew.proof.speakForHint') },
      { k: 'prompts.proof', label: t('crew.opt.prompt'), type: 'area', rows: 4, ph: d.prompt.slice(0, 400) + ' …', hint: t('crew.opt.promptHint') }];
    if (d.kind === 'props') return [];
    return [{ k: 'prompts.' + d.id, label: t('crew.opt.prompt'), type: 'area', rows: 5, ph: d.prompt.slice(0, 400) + ' …', hint: t('crew.opt.promptHint') }];
  };
  return <div className="cr-opts fx-in">
    <p className="cr-note">{t('crew.b.' + d.id + '.more')}</p>
    <Form obj={c} defs={defsFor()} onChange={() => { save(); redraw(); }} />
  </div>;
}

// ── 맞춤 조수 편집기 ──
function editDef(src: CrewDef, isNew: boolean, done: () => void) {
  const d = structuredClone(src);
  const Body = () => {
    const [, bump] = useState(0), re = () => bump(n => n + 1);
    const M: FormDefs = [
      { k: 'name', label: t('crew.edit.name'), half: true }, { k: 'desc', label: t('crew.edit.desc'), half: true },
      { k: 'phase', label: t('crew.edit.phase'), type: 'select', opts: [['before', t('crew.phase.before')], ['after', t('crew.phase.after')]], third: true, live: true, hint: t('crew.edit.phaseHint') },
      { k: 'out', label: t('crew.edit.out'), type: 'select', opts: [['inject', t('crew.out.inject')], ['aside', t('crew.out.aside')], ['json', t('crew.out.json')], ...(d.phase === 'after' ? [['rewrite', t('crew.out.rewrite')] as const] : [])], third: true, live: true, hint: t('crew.edit.outHint') },
      { k: 'every', label: t('crew.edit.every'), type: 'num', min: 1, max: 99, third: true },
      d.out === 'inject' && { k: 'where', label: t('crew.edit.where'), type: 'select', opts: [['top', t('crew.where.top')], ['before', t('crew.where.before')], ['depth', t('crew.where.depth')], ['end', t('crew.where.end')]], half: true, live: true },
      d.out === 'inject' && d.where === 'depth' && { k: 'depth', label: t('crew.edit.depth'), type: 'num', min: 0, max: 20, half: true },
      { k: 'keywords', label: t('crew.edit.keywords'), type: 'tags', half: true, hint: t('crew.edit.keywordsHint') },
      { k: 'maxSkip', label: t('crew.edit.maxSkip'), type: 'num', min: 0, max: 99, half: true, hint: t('crew.edit.maxSkipHint') },
      { el: <div className="field" key="modes"><span className="field-label">{t('crew.edit.modes')}</span><div className="row wrap">{(['rp', 'talk', 'game'] as const).map(m => <button type="button" key={m} className={'fx-pill fx-tap' + (d.modes.includes(m) ? ' on' : '')} aria-pressed={d.modes.includes(m)} onClick={() => { d.modes = d.modes.includes(m) ? d.modes.filter(x => x !== m) : [...d.modes, m]; re(); }}>{t('crew.mode.' + m)}</button>)}</div></div> },
      { k: 'prompt', label: t('crew.edit.prompt'), type: 'area', rows: 10, ph: t('crew.edit.promptPh'), hint: t('crew.edit.promptHint') },
      { k: 'max', label: t('crew.edit.max'), type: 'num', min: 60, max: 2000, step: 20, third: true },
    ];
    return <Form obj={d} defs={M} onChange={re} />;
  };
  openModal({ title: isNew ? t('crew.edit.new') : t('crew.edit.title'), wide: true, spec: 'div.cr-modal', actions: [{ label: t('common.cancel') }, { label: t('common.save'), cls: 'primary', onclick: () => {
    if (!d.prompt.trim()) { toast(t('crew.edit.needPrompt'), 'err'); return false; }
    if (!d.modes.length) d.modes = ['rp'];
    const c = cfg(), i = c.custom.findIndex(x => x.id === d.id); fixDef(d);
    if (i >= 0) c.custom[i] = d; else c.custom.push(d);
    save(); done();
  } }] }, () => <Body />);
}

// ── 조수 목록 ──
function Row({ d, chat, redraw }: { d: CrewDef; chat: CrewChat | null; redraw: () => void }) {
  const c = cfg(), open = view.open === d.id, mine = chat?.crew?.on?.[d.id], onNow = isOn(d, chat);
  const more = (e: HTMLElement) => menu(e, [
    !d.builtin && { label: t('crew.row.edit'), ic: 'edit', onclick: () => editDef(d, false, redraw) },
    chat && !d.free && { label: t('crew.row.runNow'), ic: 'play', hint: roomName(chat), onclick: () => void runNow(chat, d).catch(e => toast(errMsg(e), 'err')) },
    !d.builtin && { label: t('crew.row.export'), ic: 'upload', onclick: () => download(`dreamland-crew-${d.name.replace(/[^\w가-힣-]+/g, '_').slice(0, 30) || 'helper'}.json`, exportDefs([d])) },
    !d.builtin && '-',
    !d.builtin && { label: t('common.delete'), ic: 'trash', danger: true, onclick: async () => { if (!await confirmBox(t('crew.row.delAsk', { name: d.name }), t('common.delete'), true)) return; c.custom = c.custom.filter(x => x.id !== d.id); delete c.enabled[d.id]; save(); redraw(); } },
  ]);
  return <div className={'cr-row' + (onNow ? ' on' : '') + (open ? ' open' : '')}>
    <div className="cr-row-main">
      <button type="button" className="cr-row-id" aria-expanded={open} onClick={() => { if (d.builtin) { view.open = open ? '' : d.id; redraw(); } else editDef(d, false, redraw); }}>
        <span className="cr-row-name">{nameOf(d)}{!d.builtin && <small className="fx-lbl kr">{t('crew.row.custom')}</small>}</span>
        <span className="cr-row-desc">{descOf(d)}</span>
        <span className="cr-row-meta"><PhaseTag d={d} />{d.modes.map(m => <span className="fx-lbl kr" key={m}>{t('crew.mode.' + m)}</span>)}{d.keywords?.length ? <span className="fx-lbl kr">{t('crew.row.keys', { n: d.keywords.length })}</span> : null}</span>
      </button>
      {!d.free && d.kind !== 'proof' ? <label className="cr-every" title={t('crew.row.everyHint')}><input className="inp fx-num" type="number" min={1} max={99} defaultValue={everyOf(d)} aria-label={t('crew.row.every')} onChange={e => { c.every[d.id] = Math.max(1, Math.round(+e.target.value || 1)); if (!d.builtin) d.every = c.every[d.id]; save(); }} /><span className="fx-lbl kr">{t('crew.row.every')}</span></label> : <span className="cr-every none fx-lbl kr">{d.free ? t('crew.row.noCall') : t('crew.row.onFlag')}</span>}
      {chat && <button type="button" className={'fx-pill fx-tap cr-mine' + (mine != null ? ' on' : '')} title={t('crew.row.mineHint', { name: roomName(chat) })} aria-label={t('crew.row.mineHint', { name: roomName(chat) })} onClick={() => void setChatOn(chat, d.id, mine == null ? !c.enabled[d.id] : null).then(redraw)}>{mine == null ? t('crew.row.mineFollow') : mine ? t('crew.row.mineOn') : t('crew.row.mineOff')}</button>}
      <Switch checked={!!c.enabled[d.id]} title={t('crew.row.enable', { name: nameOf(d) })} onChange={v => { c.enabled[d.id] = v; save(); redraw(); }} />
      <IconBtn ic="more" title={t('crew.row.more')} cls="tiny" onClick={e => more(e.currentTarget)} />
    </div>
    {open && d.builtin && <Options d={d} redraw={redraw} />}
  </div>;
}
function List({ chat, redraw }: { chat: CrewChat | null; redraw: () => void }) {
  const c = cfg(), all = defs(), built = all.filter(d => d.builtin), mine = all.filter(d => !d.builtin);
  const add = (e: HTMLElement) => menu(e, [
    { label: t('crew.add.blank'), ic: 'plus', onclick: () => editDef(blank(), true, redraw) },
    '-', ...SAMPLES.map(s => ({ label: t('crew.sample.' + s.key), hint: t('crew.add.sample'), ic: 'note', onclick: () => { const d = tidy(s); if (d) { d.name = t('crew.sample.' + s.key); d.desc = t('crew.sample.' + s.key + '.desc'); editDef(d, true, redraw); } } })),
    '-', { label: t('crew.add.import'), ic: 'import', onclick: async () => { const [f] = await pickFiles({ accept: '.json,application/json' }); if (!f) return; try { const got = importDefs(await readText(f)); if (!got.length) return toast(t('crew.add.importNone'), 'err'); c.custom.push(...got); save(); redraw(); toast(t('crew.add.imported', { n: got.length }), 'ok'); } catch (e) { toast(t('crew.add.importFail', { err: errMsg(e) }), 'err'); } } },
    mine.length > 0 && { label: t('crew.add.exportAll'), ic: 'upload', onclick: () => download('dreamland-crew.json', exportDefs(mine)) },
  ]);
  return <>
    <h3 className="fx-head cr-sec"><span className="fx-lbl kr ink">{t('crew.list.builtin')}</span></h3>
    <div className="cr-list fx-rows">{built.map(d => <Row key={d.id} d={d} chat={chat} redraw={redraw} />)}</div>
    <h3 className="fx-head cr-sec"><span className="fx-lbl kr ink">{t('crew.list.custom')}</span></h3>
    {mine.length ? <div className="cr-list fx-rows">{mine.map(d => <Row key={d.id} d={d} chat={chat} redraw={redraw} />)}</div> : <p className="cr-note">{t('crew.list.customEmpty')}</p>}
    <div className="row"><Btn label={t('crew.add.label')} ic="plus" cls="ghost" onClick={e => add(e.currentTarget)} /></div>
  </>;
}

// ── 실행 기록 ──
export function LogList({ chat }: { chat: CrewChat }) {
  const [list, setList] = useState<LogItem[] | null>(null), [open, setOpen] = useState(-1);
  useEffect(() => { let live = true; const load = () => void loadLog(chat.id).then(l => { if (live) setList([...l]); }); load(); const off = on('crew:log', load); return () => { live = false; off(); }; }, [chat.id]);
  const names = (ids: string[]) => ids.map(id => { const d = defs().find(x => x.id === id); return d ? nameOf(d) : id; }).join(' · ');
  if (!list) return null;
  if (!list.length) return <div className="fx-empty"><EmptyLog /><p>{t('crew.log.empty')}</p></div>;
  const sum = list.reduce((a, l) => a + l.tokIn + l.tokOut, 0);
  return <section className="cr-log">
    <div className="cr-log-top"><span className="fx-lbl kr">{t('crew.log.total', { n: list.length, tok: sum.toLocaleString() })}</span><Btn label={t('crew.log.clear')} cls="ghost" ic="trash" onClick={() => void clearLog(chat.id)} /></div>
    <div className="fx-rows">{list.map((l, i) => { const d = new Date(l.ts); return <div className={'cr-log-row' + (l.ok ? '' : ' bad')} key={l.ts + ':' + i}>
      <button type="button" className="cr-log-head" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
        <span className="fx-num cr-log-time">{pad(d.getHours())}:{pad(d.getMinutes())}</span>
        <span className="fx-lbl fx-num">T{pad(l.turn)}</span>
        <span className={'cr-phase ' + l.phase}><i />{t('crew.phase.' + l.phase)}</span>
        <span className="cr-log-names">{names(l.ids)}</span>
        <span className="fx-num cr-log-tok" title={t('crew.log.tokHint')}>≈{l.tokIn.toLocaleString()} → {l.tokOut.toLocaleString()}</span>
        <span className="cr-log-state">{l.ok ? <Icon name="check" size={14} /> : <Icon name="x" size={14} />}<span className="fx-lbl kr">{l.ok ? t('crew.log.ok') : t('crew.log.fail')}</span></span>
      </button>
      {open === i && <div className="cr-log-body fx-in">
        {l.note && <p className="cr-note">{l.note}</p>}
        {Object.entries(l.out || {}).map(([k, v]) => <div key={k}><span className="fx-lbl">{k}</span><pre>{v}</pre></div>)}
        <span className="fx-lbl fx-num">{(l.ms / 1000).toFixed(1)}s</span>
      </div>}
    </div>; })}</div>
  </section>;
}

/** 기능 화면의 「막후」 탭 */
export function CrewStudio() {
  const [, bump] = useState(0), redraw = () => bump(n => n + 1);
  useEvents('crew:changed', 'chat:open');
  const c = cfg(), chat = ctxChat(), wait = waiting(), nWait = wait.reduce((a, x) => a + (x.crew?.pending?.length || 0), 0), helpers = (S.settings.helpers ||= {});
  const onCount = defs().filter(d => c.on && c.enabled[d.id]).length;
  const conns = [['', t('crew.conn.chat')] as const, ...chatConns().map(x => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`] as const)];
  const tabs: [typeof view.tab, ReactNode][] = [['list', t('crew.tab.list')], ['review', <>{t('crew.tab.review')}{nWait ? <b className="fx-num cr-count">{pad(nWait)}</b> : null}</>], ['log', t('crew.tab.log')]];
  return <>
    <header className="cr-hero fx-frame">
      <RigArt seed="makhu" on={onCount} />
      <div className="cr-hero-text">
        <span className="fx-lbl">backstage</span>
        <h2 className="fx-title">{t('crew.title')}</h2>
        <p className="fx-body">{t('crew.lead')}</p>
      </div>
      <div className="cr-hero-side">
        <label className="cr-master"><span className="fx-lbl kr ink">{c.on ? t('crew.master.on') : t('crew.master.off')}</span><Switch span checked={c.on} title={t('crew.master.title')} onChange={v => { c.on = v; save(); redraw(); }} /></label>
        <Budget chat={null} />
        <small className="hint">{t('crew.budget.hint')}</small>
      </div>
    </header>
    <div className="cr-conn"><label className="field"><span className="field-label">{t('crew.conn.label')}</span><Select value={helpers.crew || ''} opts={conns} onChange={v => { helpers.crew = v; S.set({ helpers }); redraw(); }} /><small className="hint">{t('crew.conn.hint')}</small></label>
      {chat && <p className="cr-ctx"><span className="fx-lbl kr">{t('crew.ctx')}</span><b className="fx-serif">{roomName(chat)}</b></p>}</div>
    <nav className="cr-tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view.tab === k} className={'cr-tab' + (view.tab === k ? ' on' : '')} onClick={() => { view.tab = k; redraw(); }}>{l}</button>)}</nav>
    {view.tab === 'list' && <List chat={chat} redraw={redraw} />}
    {view.tab === 'review' && (wait.length || chat ? [...new Set([...(chat ? [chat] : []), ...wait])].map(x => <ReviewList key={x.id} chat={x} title />) : <div className="fx-empty"><EmptyTray /><p>{t('crew.review.empty')}</p></div>)}
    {view.tab === 'log' && (chat ? <LogList chat={chat} /> : <div className="fx-empty"><EmptyLog /><p>{t('crew.log.noChat')}</p></div>)}
  </>;
}
