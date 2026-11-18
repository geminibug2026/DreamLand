// 정규식: 범위 셋(전역 · 프리셋 · 캐릭터) + 전체 · 검색 · 거르기 · 순서 바꾸기 · 일괄 조작 · 가져오기/내보내기
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import type { Regex } from '../studio/parts';
import { Cards, G, RX, allowState, chatApi, clip, exportMany, exportOne, isAllowed, isGlobal, modeShort, redrawChat, safeName, scKey, scName, setAllow, whoShort, worst, type Entry, type Sc } from '../regex/lib';
import { crossPageItems, usePaged } from '../ui';
import { openDebugger } from '../regex/Debugger';
import { openEditor } from '../regex/Editor';
import { importFlow, setsDialog } from '../regex/dialogs';
import { pickChar, pickTarget } from '../regex/pick';
import { go, route } from '../lib/router';
import { uid, S } from '../lib/core';
import * as core from '../lib/core';
import { PageHead, Switch, arr, confirmBox, errMsg, menu, plain, toast, useDragSort } from '../studio/parts';
import { t, tn } from '../i18n';

export const page = { name: 'regex', Component: RegexPage };

type Tab = 'global' | 'preset' | 'char' | 'all';
// 화면을 떠났다 돌아와도 남는 보기 상태
const view = { tab: 'global' as Tab, presetId: '', charId: '', q: '', filter: 'all', pick: false, picked: new Set<string>(), shown: 120 };
const FILTERS: [string, string, (e: Entry) => boolean][] = [['all', 'regex.filter.all', () => true], ['on', 'regex.filter.on', e => !!e.r.enabled], ['off', 'regex.filter.off', e => !e.r.enabled], ['bad', 'regex.filter.bad', e => !!worst(e.r)]];
const keyOf = (e: Entry) => `${scKey(e.sc)}|${e.r.id}`;

/** 화면에 들어올 때 한 번: 인자('preset:<id>' | 'char:<id>' | 정규식 id)에 맞춰 탭을 잡고, 바로 열 스크립트를 돌려준다 */
function enter(arg: unknown): Entry | null {
  let openAfter: Entry | null = null;
  if (typeof arg === 'string' && arg) {
    if (arg.startsWith('preset:')) { view.tab = 'preset'; view.presetId = arg.slice(7); }
    else if (arg.startsWith('char:')) { view.tab = 'char'; view.charId = arg.slice(5); }
    else { const hit = RX().findScript(arg); if (hit) { view.tab = hit.sc.kind; if (hit.sc.kind === 'preset') view.presetId = hit.sc.id || ''; if (hit.sc.kind === 'char') view.charId = hit.sc.id || ''; openAfter = hit; } }
    route.arg = null;
  }
  const chat = chatApi.current().chat;
  if (!S.get('presets', view.presetId)) view.presetId = (chat ? S.presetFor(chat) : S.preset())?.id || '';
  if (!S.get('chars', view.charId)) view.charId = chat?.charIds?.[0] || S.regex.find(r => !isGlobal(r) && S.get('chars', r.scope))?.scope || S.chars[0]?.id || '';
  view.pick = false; view.picked.clear(); view.shown = 120;
  return openAfter;
}

function RegexPage({ arg }: { arg?: unknown }) {
  const [openAfter] = useState(() => enter(arg));
  const [, bump] = useState(0), drawAll = () => bump(n => n + 1), [q, setQ] = useState(view.q);
  const Scope = RX().Scope, listEl = useRef<HTMLDivElement | null>(null), focusAt = useRef(-1);
  const curScope = (): Sc | null => (view.tab === 'global' ? G : view.tab === 'preset' ? (view.presetId ? { kind: 'preset', id: view.presetId } : null) : view.tab === 'char' ? (view.charId ? { kind: 'char', id: view.charId } : null) : null);
  const entries = (): Entry[] => { if (view.tab === 'all') return RX().everything(); const sc = curScope(); return sc ? Scope.list(sc).map(r => ({ r, sc })) : []; };
  const shownEntries = () => { const t = view.q.trim().toLowerCase(), f = (FILTERS.find(x => x[0] === view.filter) || FILTERS[0])[2]; return entries().filter(e => f(e) && (!t || `${e.r.name}\n${e.r.find}\n${e.r.replace}`.toLowerCase().includes(t))); };
  const canSort = () => view.tab !== 'all' && !view.q.trim() && view.filter === 'all' && !view.pick;
  const pickedEntries = () => entries().filter(e => view.picked.has(keyOf(e)));
  const after = () => { drawAll(); redrawChat(); };
  const showScope = (to: Sc) => { view.tab = to.kind; if (to.kind === 'preset') view.presetId = to.id || ''; if (to.kind === 'char') view.charId = to.id || ''; view.picked.clear(); after(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (openAfter) openEditor(openAfter.r, openAfter.sc, { onClose: after }); }, []);
  useEffect(() => { if (focusAt.current >= 0) { listEl.current?.children[focusAt.current - base.current.start]?.querySelector<HTMLElement>('.grip')?.focus(); focusAt.current = -1; } });

  const newScript = async () => {
    const sc = curScope() || G;
    if (view.tab === 'preset' && !curScope()) return toast(t('regex.page.pickPresetFirst'), 'err');
    if (view.tab === 'char' && !curScope()) return toast(t('regex.page.pickCharFirst'), 'err');
    const r = await Scope.add(sc, core.newRegex());
    if (!isAllowed(sc)) setAllow(sc, true);
    drawAll(); openEditor(r, sc, { onClose: after });
  };
  const move = async (sc: Sc, from: number, to: number) => { const list = Scope.list(sc); if (to < 0 || to >= list.length || to === from) return; const [x] = list.splice(from, 1); list.splice(to, 0, x); await Scope.reorder(sc, list); drawAll(); redrawChat(); };
  const base = useRef({ start: 0, per: 60 });   // 지금 쪽의 첫 자리 · 한 쪽 개수 (끌기 · 메뉴가 쪽 안 자리를 전체 자리로 바꾼다)
  const drag = useDragSort((from, to) => { const sc = curScope(); if (sc && canSort()) void move(sc, base.current.start + from, base.current.start + to); });
  const copy = async (e: Entry) => {
    const rest: Regex = structuredClone(e.r); delete rest.src; delete rest.mod;
    const c = await Scope.add(e.sc, { ...rest, id: uid(), name: t('regex.page.copyName', { name: e.r.name }) });
    const list = Scope.list(e.sc), at = list.indexOf(e.r);
    if (at >= 0) { list.splice(list.indexOf(c), 1); list.splice(at + 1, 0, c); await Scope.reorder(e.sc, list); }
    after();
  };
  const rowMenu = (anchor: Element, e: Entry, i: number, n: number) => menu(anchor, [
    { label: t('common.edit'), ic: 'edit', onclick: () => openEditor(e.r, e.sc, { onClose: after }) },
    { label: t('regex.page.menu.test'), ic: 'play', onclick: () => openEditor(e.r, e.sc, { tab: 'test', onClose: after }) },
    canSort() && i > 0 && { label: t('regex.page.menu.up'), ic: 'up', onclick: () => move(e.sc, i, i - 1) },
    canSort() && i < n - 1 && { label: t('regex.page.menu.down'), ic: 'down', onclick: () => move(e.sc, i, i + 1) },
    canSort() && i > 0 && { label: t('regex.page.menu.top'), ic: 'up', onclick: () => move(e.sc, i, 0) },
    canSort() && i < n - 1 && { label: t('regex.page.menu.bottom'), ic: 'down', onclick: () => move(e.sc, i, n - 1) },
    ...(canSort() && n > base.current.per ? crossPageItems(i, n, base.current.per, (a, b) => void move(e.sc, a, b)).slice(0, 2).filter(x => !!x) : []),   // 앞 두 개 = 앞 쪽 끝으로 · 다음 쪽 처음으로
    '-',
    { label: t('common.duplicate'), ic: 'copy', onclick: () => copy(e) },
    { label: t('regex.page.menu.move'), ic: 'right', onclick: async () => { const to = await pickTarget(anchor, e.sc); if (!to) return; await RX().moveScripts([e], to); toast(t('regex.page.moved', { scope: scName(to) }), 'ok'); after(); } },
    { label: t('regex.page.menu.export'), ic: 'import', onclick: () => exportOne(e.r) },
    '-',
    { label: t('common.delete'), ic: 'trash', danger: true, onclick: async () => { if (!(await confirmBox(t('regex.page.confirmDelete', { name: e.r.name }), t('common.delete'), true))) return; await Scope.remove(e.sc, e.r); after(); } },
  ]);
  const togglePick = (key: string, on: boolean) => { if (on) view.picked.add(key); else view.picked.delete(key); drawAll(); };
  const row = (e: Entry, i: number, n: number) => {
    const { r, sc } = e, bad = worst(r), key = keyOf(e), sortable = canSort();
    const click = (ev: MouseEvent<HTMLDivElement>) => {
      if ((ev.target as Element).closest('button, label, input')) return;
      if (view.pick) return togglePick(key, !view.picked.has(key));
      openEditor(r, sc, { onClose: after });
    };
    const keys = (ev: KeyboardEvent) => { if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return; ev.preventDefault(); const j = i + (ev.key === 'ArrowUp' ? -1 : 1); void move(sc, i, j).then(() => { focusAt.current = j; drawAll(); }); };
    return <div className={'rx-row' + (r.enabled ? '' : ' off') + (view.picked.has(key) ? ' picked' : '')} data-key={key} key={key} onClick={click}>
      {view.pick
        ? <label className="check rx-pick" onClick={ev => ev.stopPropagation()}><input type="checkbox" checked={view.picked.has(key)} aria-label={t('regex.page.pickOne', { name: r.name })} onChange={ev => togglePick(key, ev.target.checked)} /><i /></label>
        : sortable ? <button type="button" className="grip" title={t('regex.page.gripTitle')} aria-label={t('regex.page.gripLabel')} onClick={ev => ev.stopPropagation()} onKeyDown={keys}><Icon name="grip" size={16} /></button>
          : <span className="rx-no">{String(i + 1).padStart(2, '0')}</span>}
      <Switch checked={!!r.enabled} title={t('regex.page.toggleTitle', { name: r.name })} onChange={async v => { r.enabled = v; drawAll(); await Scope.save(sc, r); drawAll(); redrawChat(); }} />
      <div className="rx-row-text"><b>{r.name || t('regex.page.noName')}</b><small>{view.tab === 'all' && <span className="rx-where">{scName(sc)}</span>}<code>{clip(r.find, 80) || t('regex.page.noFind')}</code></small></div>
      <span className="rx-row-meta">{bad ? <em className={`badge rx-flag ${bad}`}>{bad === 'error' ? t('regex.level.error') : t('regex.level.warn')}</em> : null}<span className="rx-tag">{whoShort(r)}</span><span className="rx-tag">{modeShort(r)}</span></span>
      <IconBtn ic="more" title={t('regex.more')} onClick={ev => { ev.stopPropagation(); rowMenu(ev.currentTarget, e, i, n); }} />
    </div>;
  };

  // 범위 줄
  const allowRow = (sc: Sc, what: string) => <label className="rx-allow"><Switch span checked={isAllowed(sc)} title={what} onChange={v => { setAllow(sc, v); drawAll(); redrawChat(); }} /><span>{what}</span>
    {allowState(sc) === 'ask' && Scope.list(sc).length ? <em className="badge">{t('regex.page.notAllowedYet')}</em> : null}</label>;
  const sc = curScope();
  let scope: ReactNode;
  if (view.tab === 'preset') {
    const p = sc && S.get('presets', sc.id);
    const merge = async () => {
      const [f] = await core.pickFiles({ accept: '.json' }); if (!f || !sc) return;
      try { const j: unknown = JSON.parse(await f.text()); if (!plain(j)) throw new Error(t('regex.page.notPresetFile')); core.download(f.name, JSON.stringify(Cards.stPresetWithRegex(j, Scope.list(sc)), null, 4)); toast(t('regex.page.mergedDownloaded'), 'ok'); } catch (err) { toast(errMsg(err), 'err'); }
    };
    scope = <><div className="rx-scope-row">
      <select className="inp rx-owner" aria-label={t('regex.page.pickPreset')} value={view.presetId} onChange={e => { view.presetId = e.target.value; view.picked.clear(); drawAll(); }}>{S.presets.map(x => <option key={x.id} value={x.id}>{x.id === S.settings.activePreset ? t('regex.page.presetOptionActive', { name: x.name, count: arr(x.regex).length }) : t('regex.page.presetOption', { name: x.name, count: arr(x.regex).length })}</option>)}</select>
      {sc && allowRow(sc, t('regex.page.allowPreset'))}
      {p && <IconBtn ic="more" title={t('regex.page.exportPreset')} onClick={e => menu(e.currentTarget, [
        { label: t('regex.page.exportPresetSt'), ic: 'import', onclick: () => core.download(`${safeName(p.name)}.json`, JSON.stringify(Cards.presetToSt(p as unknown as Cards.DPreset), null, 4)) },
        { label: t('regex.page.mergeIntoPreset'), ic: 'merge', onclick: merge },
        { label: t('regex.page.openInPresets'), ic: 'sliders', onclick: () => go('presets', p.id) }])} />}</div>
      <small className="hint">{t('regex.page.hintPreset')}</small></>;
  } else if (view.tab === 'char') {
    const c = sc && S.get('chars', sc.id);
    scope = <><div className="rx-scope-row">
      <button type="button" className="rx-owner rx-charbtn" title={t('regex.page.pickChar')} onClick={async () => { const id = await pickChar(t('regex.page.pickCharWhich')); if (id) { view.charId = id; view.picked.clear(); drawAll(); } }}>{c ? <Avatar o={c} cls="xs" /> : <Icon name="user" size={18} />}<b>{c?.name || t('regex.page.pickChar')}</b><Icon name="down" size={14} /></button>
      {sc && allowRow(sc, t('regex.page.allowChar'))}</div>
      <small className="hint">{t('regex.page.hintChar')}</small></>;
  } else scope = <small className="hint">{view.tab === 'global' ? t('regex.page.hintGlobal') : t('regex.page.hintAll')}</small>;

  // 일괄 조작
  const bulk = (label: string, ic: string, fn: (items: Entry[], anchor: Element) => unknown, cls = '') => <Btn label={label} ic={ic} cls={cls} onClick={e => { const items = pickedEntries(), anchor = e.currentTarget; if (!items.length) return toast(t('regex.page.pickFirst')); void fn(items, anchor); }} />;
  const setOn = async (items: Entry[], v: boolean) => {
    const presets = new Set<string>();
    for (const { r, sc: s } of items) { if (!!r.enabled === v) continue; r.enabled = v; if (s.kind === 'preset') presets.add(s.id || ''); else await S.save('regex', r, true); }
    for (const id of presets) { const p = S.get('presets', id); if (p) await S.save('presets', p, true); }
    after();
  };

  const all = entries(), rows = shownEntries(), pg = usePaged(rows, { id: 'regex', perPage: 60, sizes: [30, 60, 120, 240], resetKey: [view.tab, view.presetId, view.charId, view.q, view.filter].join('|') });
  base.current = { start: pg.start, per: pg.perPage };
  const narrowed = rows.length !== all.length, allOn = rows.length > 0 && rows.every(e => view.picked.has(keyOf(e)));
  const count = { global: Scope.list(G).length, preset: view.presetId ? Scope.list({ kind: 'preset', id: view.presetId }).length : 0, char: view.charId ? Scope.list({ kind: 'char', id: view.charId }).length : 0 };
  const tabs: [Tab, string, number | null][] = [['global', t('regex.scope.global'), count.global], ['preset', t('regex.scope.preset'), count.preset], ['char', t('regex.scope.char'), count.char], ['all', t('regex.filter.all'), null]];
  const bring = () => void importFlow(curScope() || G, showScope);
  const emptyText = all.length ? t('regex.page.empty.noMatch') : view.tab === 'char' && !sc ? t('regex.page.empty.makeChar') : view.tab === 'global' ? t('regex.page.empty.global') : view.tab === 'preset' ? t('regex.page.empty.preset') : view.tab === 'char' ? t('regex.page.empty.char') : t('regex.page.empty.none');

  return <section className="rx">
    <PageHead eyebrow="regex" title={t('regex.page.title')}>
      <Btn label={t('regex.page.debugger')} ic="eye" title={t('regex.page.debuggerTitle')} onClick={() => openDebugger()} />
      <Btn label={t('regex.sets.title')} ic="mark" title={t('regex.page.setsTitle')} onClick={() => setsDialog(after)} />
      <Btn label={t('common.import')} ic="import" title={t('regex.page.importTitle')} onClick={bring} />
      <Btn label={t('regex.page.new')} ic="plus" cls="primary" onClick={() => void newScript()} />
    </PageHead>
    <div className="tabs rx-tabs">{tabs.map(([tab, label, c]) => <button key={tab} type="button" className={'tab' + (view.tab === tab ? ' on' : '')} onClick={() => { view.tab = tab; view.shown = 120; view.picked.clear(); drawAll(); }}>{label}{c !== null ? <small>{String(c)}</small> : null}</button>)}</div>
    <div className="rx-scope">{scope}</div>
    <div className="rx-tools"><div className="search-wrap"><Icon name="search" size={16} /><input className="inp search" placeholder={t('regex.page.searchPh')} value={q} onChange={e => { view.q = e.target.value; view.shown = 120; setQ(e.target.value); }} /></div>
      <div className="rx-chips">{FILTERS.map(([f, label]) => <button key={f} type="button" className={'chip' + (view.filter === f ? ' on' : '')} onClick={() => { view.filter = f; view.shown = 120; drawAll(); }}>{t(label)}</button>)}</div>
      <button type="button" className={'chip rx-pickbtn' + (view.pick ? ' on' : '')} onClick={() => { view.pick = !view.pick; if (!view.pick) view.picked.clear(); drawAll(); }}>{t('regex.page.pickMany')}</button></div>
    <div className="rx-info">
      {all.length ? <span>{narrowed ? t('regex.page.countNarrowed', { found: rows.length, total: all.length }) : t('regex.page.countAll', { total: all.length, on: all.filter(e => e.r.enabled).length })}</span> : ''}
      {all.length && view.tab !== 'all' ? <span className="dim">{canSort() ? t('regex.page.orderHint') : view.pick ? '' : t('regex.page.orderBlocked')}</span> : ''}
      {view.tab === 'all' && all.length ? <span className="dim">{t('regex.page.orderAll')}</span> : ''}
    </div>
    <div className={'rx-list' + (view.pick ? ' picking' : '')} ref={el => { listEl.current = el; pg.listRef(el); return drag(el); }}>
      {pg.rows.map((e, k) => row(e, pg.start + k, rows.length))}
      {!rows.length && <div className="empty rx-empty"><Icon name="code" size={30} /><p>{emptyText}</p>
        {!all.length && sc ? <div className="row wrap"><Btn label={t('regex.page.new')} ic="plus" cls="primary" onClick={() => void newScript()} /><Btn label={t('common.import')} ic="import" onClick={bring} /></div> : null}</div>}
    </div>
    <div className="rx-morebox">{pg.pager}</div>
    <div className="rx-bulk" hidden={!view.pick}>{view.pick ? <>
      <b className="rx-bulk-n">{tn('regex.page.pickedN', view.picked.size)}</b>
      <Btn label={allOn ? t('regex.page.unpickAll') : t('regex.page.pickVisible')} cls="ghost" onClick={() => { for (const e of rows) { if (allOn) view.picked.delete(keyOf(e)); else view.picked.add(keyOf(e)); } drawAll(); }} />
      <span className="rx-bulk-acts">
        {bulk(t('regex.page.bulkOn'), 'check', items => setOn(items, true))}{bulk(t('regex.page.bulkOff'), 'x', items => setOn(items, false))}
        {bulk(t('regex.move'), 'right', async (items, anchor) => { const to = await pickTarget(anchor); if (!to) return; const n = await RX().moveScripts(items, to); view.picked.clear(); toast(n ? tn('regex.page.movedN', n, { scope: scName(to) }) : t('regex.page.alreadyThere'), 'ok'); after(); })}
        {bulk(t('common.export'), 'import', items => exportMany(items.map(e => e.r)))}
        {bulk(t('common.delete'), 'trash', async items => { if (!(await confirmBox(tn('regex.page.confirmDeleteN', items.length), t('common.delete'), true))) return; for (const e of items) await Scope.remove(e.sc, e.r); view.picked.clear(); after(); }, 'danger')}
      </span>
      <Btn label={t('regex.page.done')} cls="ghost" onClick={() => { view.pick = false; view.picked.clear(); drawAll(); }} /></> : null}</div>
  </section>;
}
