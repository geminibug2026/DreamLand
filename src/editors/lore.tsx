// 로어북 편집기 (항목이 수백 개여도 찾고 · 접고 · 한꺼번에 고칠 수 있게) + 로어북 스위치 · 연결 · 전체 설정
import { LORE_POS, loreLinks, lorePosOpts } from '../lib/f-lore';
import { useRef, useState, type ReactNode } from 'react';
import { Btn, Icon, IconBtn, useEvents } from '../kit';
import { Form, confirmBox, menu, openModal, toast, usePaged, type FormDefs, type ModalHandle } from '../ui';
import type { Entry, Lore, LoreHit } from './types';
import { useBump, useDebounced, type EditorApi } from './parts';
import { S } from '../lib/core';
import * as engine from '../lib/engine';
import * as core from '../lib/core';
import * as cards from '../lib/cards';
import { t, tn } from '../i18n';

const POS_KEYS = ['before', 'after', 'em_top', 'em_bottom', 'an_top', 'an_bottom', 'depth', 'outlet'];
const posShort = (p: string) => POS_KEYS.includes(p) ? t('lore.posShort.' + p) : '';
const TRIGGERS = ['normal', 'continue', 'impersonate', 'regenerate', 'swipe', 'quiet'];
const trigLabel = (v: string) => t('lore.trigger.' + v);
const TRI = (): [string, string][] => [['', t('lore.tri.inherit')], ['true', t('lore.tri.on')], ['false', t('lore.tri.off')]];
const tri = (v: unknown) => v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;
const MATCH = ['matchPersona', 'matchCharDesc', 'matchCharPersonality', 'matchScenario', 'matchCharNote', 'matchCreatorNotes'];
const PAGE = 40;
const titleOf = (e: Entry) => e.name || (e.keys || []).slice(0, 3).join(', ') || t('lore.untitled');
const copy = <T,>(o: T): T => { try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)) as T; } };
const tok = (e: Entry) => engine.tokens(e.content);

/** 값이 빠진 예전 항목을 편집할 수 있게 채운다 (저장된 뜻은 바꾸지 않는다) */
function ready(e: Entry) {
  e.charFilter ||= { names: [], tags: [], exclude: false }; e.charFilter.names ||= []; e.charFilter.tags ||= [];
  e.triggers ||= []; e.keys ||= []; e.keys2 ||= [];
  if (e.groupWeight == null) e.groupWeight = 100;
  if (e.groupOverride == null) e.groupOverride = true;   // 예전 항목: 같은 묶음에서는 우선순위가 가장 높은 하나
  return e;
}

/** 로어북 전체 설정 (모든 로어북에 함께 적용) */
export function loreSettingsDialog() {
  const G = S.settings.lore ||= {};
  openModal({ title: t('lore.global.title'), body: <div className="col">
    <Form obj={G} defs={[
      { k: 'includeNames', label: t('lore.global.includeNames'), type: 'check', hint: t('lore.global.includeNamesHint') },
      { k: 'groupScoring', label: t('lore.global.groupScoring'), type: 'check', hint: t('lore.global.groupScoringHint') },
      { k: 'minActivations', label: t('lore.global.minActivations'), type: 'num', min: 0, half: true, hint: t('lore.global.minActivationsHint') },
      { k: 'minDepthMax', label: t('lore.global.minDepthMax'), type: 'num', min: 0, half: true, hint: t('lore.global.minDepthMaxHint') },
      { k: 'maxRecursion', label: t('lore.global.maxRecursion'), type: 'num', min: 0, half: true, hint: t('lore.global.maxRecursionHint') },
    ]} onChange={() => S.set({ lore: G })} />
    <p className="hint">{t('lore.global.note')}</p>
  </div>, actions: [{ label: t('common.close'), cls: 'primary' }] });
}

/** 발동 시험: 적은 글에 어떤 항목이 걸리는지 */
function TestBody({ b }: { b: Lore }) {
  const ta = useRef<HTMLTextAreaElement>(null), kind = useRef<HTMLSelectElement>(null);
  const [out, setOut] = useState<ReactNode>(null);
  const run = () => {
    const text = ta.current?.value || ''; if (!text.trim()) return setOut(<p className="dim">{t('lore.test.empty')}</p>);
    const chat = S.get('chats', S.settings.lastChat), ch = S.get('chars', chat?.charIds?.[0]) || null, persona = chat ? S.persona(chat) : null;
    const k = kind.current?.value || 'normal', type = k === 'regenerate' ? 'regen' : k;
    const hits: LoreHit[] = engine.scanLore([b], [{ content: text }], { user: persona?.name || '', char: ch?.name || '', vars: {} }, { count: 9999, type, char: ch, persona });
    const total = hits.reduce((n, e) => n + e.tok, 0);
    setOut(<><small className="hint">{hits.length ? (ch ? t('lore.test.hitsChar', { n: hits.length, tok: total, name: ch.name }) : t('lore.test.hits', { n: hits.length, tok: total })) : t('lore.test.none')}</small>
      {hits.map((e, i) => <div className="lore-test-row" key={i}><b>{titleOf(e)}</b><span>{posShort(e.position || '')}</span><span className="tokbadge">{`≈${e.tok}`}</span></div>)}</>);
  };
  return <div className="col">
    <textarea className="inp" rows={5} ref={ta} placeholder={t('lore.test.ph')} />
    <div className="row wrap"><span className="field-label">{t('lore.test.kind')}</span><select className="inp auto" ref={kind}>{TRIGGERS.map(v => <option key={v} value={v}>{trigLabel(v)}</option>)}</select><Btn label={t('lore.test.run')} ic="play" cls="primary" onClick={run} /></div>
    <div className="lore-test">{out}</div>
  </div>;
}


/** 로어북 켜고 끄기: 켜면 모든 대화에서 쓰인다. 목록과 편집기의 스위치가 서로 맞춰진다 */
export { LORE_POS, loreLinks };
export function LoreSwitch({ b, after }: { b: Lore; after?: (on: boolean) => void }) {
  useEvents('settings');
  return <label className="switch lore-sw" title={t('lore.switchTitle')} onClick={e => e.stopPropagation()}>
    <input type="checkbox" data-lore-sw={b.id} checked={S.settings.activeLore.includes(b.id)} onChange={e => {
      const on = e.target.checked; S.set({ activeLore: on ? [...new Set([...S.settings.activeLore, b.id])] : S.settings.activeLore.filter(i => i !== b.id) });
      for (const x of document.querySelectorAll<HTMLInputElement>('input[data-lore-sw]')) if (x.dataset.loreSw === b.id) x.checked = on;
      after?.(on);
    }} /><i /></label>;
}

type Fixed = () => [Lore, string][];
/** 로어북 고르는 창의 내용 */
function PickList({ holder, toggle, fixed, mine }: { holder: { loreIds?: string[] }; toggle: (id: string) => void; fixed: Fixed; mine: () => string[] }) {
  const redraw = useBump(), [q, setQ] = useState('');
  const [fx] = useState(() => new Map(fixed().map(([b, tag]) => [b.id, tag])));
  const [all] = useState(() => { const on = new Set(holder.loreIds); const w = (b: Lore) => +(on.has(b.id) || fx.has(b.id)); return [...S.lore].sort((a, b) => w(b) - w(a)); });   // 열 때 한 번만: 연결된 것 먼저
  const hit = all.filter(b => !q || `${b.name} ${b.description || ''}`.toLowerCase().includes(q));
  return <div className="col">
    <input className="inp" placeholder={t('lore.pick.search')} onChange={e => setQ(e.target.value.trim().toLowerCase())} />
    <small className="hint">{t('lore.pick.status', { total: S.lore.length, n: mine().length }) + (q ? t('lore.pick.found', { n: hit.length }) : '')}</small>
    <div className="lore-picklist">{hit.length ? hit.map(b => <label className="check lore-pickrow" key={b.id}>
      <input type="checkbox" checked={fx.has(b.id) || (holder.loreIds || []).includes(b.id)} disabled={fx.has(b.id)} onChange={() => { toggle(b.id); redraw(); }} /><i />
      <span>{b.name}</span><small>{fx.get(b.id) || tn('lore.entries', b.entries.length)}</small></label>) : <p className="dim">{t('lore.pick.none')}</p>}</div>
  </div>;
}

/** 연결한 로어북만 꼬리표로 보여 주고, 더 고를 때는 찾기 창을 연다 (로어북이 아주 많아도 화면이 길어지지 않게).
 *  fixed(): 여기서 끊을 수 없는 것들 [[로어북, '전역' | '캐릭터'], …] */
export function LoreLinker({ holder, save, fixed = () => [] }: { holder: { loreIds?: string[] }; save: () => void; fixed?: Fixed }) {
  const redraw = useBump(); holder.loreIds ||= [];
  const mine = () => { const fx = new Set(fixed().map(([b]) => b.id)); return (holder.loreIds || []).filter(id => S.get('lore', id) && !fx.has(id)); };
  const toggle = (id: string) => { const ids = holder.loreIds || []; holder.loreIds = ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]; save(); };
  const open = () => {
    if (!S.lore.length) return toast(t('lore.pick.noLore'));
    openModal({ title: t('lore.pick.title'), body: <PickList holder={holder} toggle={toggle} fixed={fixed} mine={mine} />, onClose: redraw, actions: [{ label: t('common.close'), cls: 'primary' }] });
  };
  const fx = fixed(), ids = mine();
  return <div className="lore-linked">
    {fx.length || ids.length ? <div className="lore-chips">
      {fx.map(([b, tag]) => <span className="chip lore-chip fixed" key={b.id} title={t('lore.pick.fixed', { tag })}><span>{b.name}</span><small>{tag}</small></span>)}
      {ids.map(id => <span className="chip on lore-chip" key={id}><span>{S.get('lore', id)?.name}</span><button type="button" title={t('lore.pick.unlink')} aria-label={t('lore.pick.unlink')} onClick={() => { toggle(id); redraw(); }}>×</button></span>)}
    </div> : <small className="hint">{t('lore.pick.noneLinked')}</small>}
    <Btn label={ids.length ? t('lore.pick.title') : t('lore.pick.link')} ic="plus" cls="ghost" onClick={open} />
  </div>;
}

/** 로어북 고르기 (페르소나 · 그 밖의 묶을 곳). holder.loreIds 를 고친다 */
export const LorePicker = ({ holder, save, hint = '' }: { holder: { loreIds?: string[] }; save: () => void; hint?: string }) =>
  <div className="card lore-link"><h3 className="form-sec">{t('lore.title')}</h3>{hint && <p className="hint">{hint}</p>}<LoreLinker holder={holder} save={save} /></div>;

type Pred = (e: Entry) => boolean;
const FILTERS: Record<string, Pred> = { all: () => true, on: e => e.enabled !== false, off: e => e.enabled === false, constant: e => !!e.constant, keyed: e => !e.constant, grouped: e => !!e.group, timed: e => !!(e.sticky || e.cooldown || e.delay), filtered: e => !!(e.charFilter?.names?.length || e.charFilter?.tags?.length || e.triggers?.length) };
const SORTS: Record<string, ((a: Entry, c: Entry) => number) | null> = { list: null, order: (a, c) => (c.order ?? 100) - (a.order ?? 100), name: (a, c) => titleOf(a).localeCompare(titleOf(c), 'ko'), tok: (a, c) => tok(c) - tok(a) };
const hay = (e: Entry) => [e.name, ...(e.keys || []), ...(e.keys2 || []), e.group, e.outlet, e.automationId, e.content].join('\n').toLowerCase();
const FILTER_OPTS = ['all', 'on', 'off', 'constant', 'keyed', 'grouped', 'timed', 'filtered'];
const SORT_OPTS = ['list', 'order', 'name', 'tok'];

/** 접었다 펴는 묶음. 처음 열림 여부는 만들 때 한 번만 정한다 (고치는 도중에 저절로 접히지 않게) */
function Sec({ title, on, children }: { title: string; on: boolean; children: ReactNode }) {
  const [open] = useState(on);
  return <details className="lore-sec" open={open}><summary>{title}</summary><div className="lore-sec-body">{children}</div></details>;
}

/** 항목 하나의 펼친 내용 */
function EntryBody({ e, sv, changed, draw }: { e: Entry; sv: () => void; changed: () => void; draw: () => void }) {
  ready(e);
  const redraw = useBump(), pos = useRef(e.position), cf = e.charFilter!, trig = e.triggers!;
  const fix = () => { e.logic = +(e.logic ?? 0) || 0; e.caseSensitive = tri(e.caseSensitive); e.wholeWord = tri(e.wholeWord); e.useGroupScoring = tri(e.useGroupScoring); sv(); };
  const depth = e.position === 'depth', outlet = e.position === 'outlet';
  const main: FormDefs = [
    { k: 'name', label: t('lore.e.name'), half: true }, { k: 'position', label: t('lore.e.position'), type: 'select', opts: lorePosOpts(), half: true },
    depth && { k: 'depth', label: t('lore.e.depth'), type: 'num', min: 0, half: true }, depth && { k: 'role', label: t('lore.e.role'), type: 'select', opts: ['system', 'user', 'assistant'], half: true },
    outlet && { k: 'outlet', label: t('lore.e.outlet'), ph: t('lore.e.outletPh') },
    { k: 'keys', label: t('lore.e.keys'), type: 'tags', ph: t('lore.e.keysPh'), half: true }, { k: 'keys2', label: t('lore.e.keys2'), type: 'tags', half: true },
    { k: 'logic', label: t('lore.e.logic'), type: 'select', opts: [[0, t('lore.e.logic.anyOf')], [3, t('lore.e.logic.allOf')], [2, t('lore.e.logic.noneOf')], [1, t('lore.e.logic.notAll')]] },
    { k: 'content', label: t('lore.e.content'), type: 'area', rows: 7 },
    { k: 'order', label: t('lore.e.order'), type: 'num', third: true }, { k: 'probability', label: t('lore.e.probability'), type: 'num', min: 0, max: 100, third: true }, { k: 'scanDepth', label: t('lore.e.scanDepth'), type: 'num', nullable: true, third: true, ph: t('lore.tri.inherit') },
    { k: 'constant', label: t('lore.e.constant'), type: 'check' },
    { k: 'vectorized', label: t('lore.e.vectorized'), type: 'check' },
  ];
  return <div className="entry-body">
    {/* 위치가 바뀌면 그 위치에 딸린 칸을 다시 그린다 */}
    <Form key={e.position} obj={e} defs={main} onChange={() => { fix(); const moved = e.position !== pos.current; pos.current = e.position; if (moved) draw(); else changed(); }} />
    <Sec title={t('lore.e.sec.activation')} on={!!(e.useRegex || e.caseSensitive != null || e.wholeWord != null || trig.length || cf.names!.length || cf.tags!.length || MATCH.some(k => e[k]))}>
      <Form obj={e} defs={[{ k: 'caseSensitive', label: t('lore.e.caseSensitive'), type: 'select', opts: TRI(), half: true }, { k: 'wholeWord', label: t('lore.e.wholeWord'), type: 'select', opts: TRI(), half: true }, { k: 'useRegex', label: t('lore.e.useRegex'), type: 'check' }]} onChange={fix} />
      <div className="field"><span className="field-label">{t('lore.e.triggers')}</span>
        <div className="lore-chips">{TRIGGERS.map(v => <button type="button" key={v} className={'chip' + (e.triggers!.includes(v) ? ' on' : '')} onClick={() => { const tr = e.triggers!; e.triggers = tr.includes(v) ? tr.filter(x => x !== v) : [...tr, v]; sv(); redraw(); }}>{trigLabel(v)}</button>)}</div>
        <small className="hint">{t('lore.e.triggersHint')}</small></div>
      <div className="field"><span className="field-label">{t('lore.e.match')}</span>
        <div className="lore-chips">{MATCH.map(k => <button type="button" key={k} className={'chip' + (e[k] ? ' on' : '')} onClick={() => { e[k] = !e[k]; sv(); redraw(); }}>{t('lore.match.' + k)}</button>)}</div></div>
      <Form obj={e} defs={[{ k: 'charFilter.names', label: t('lore.e.cfNames'), type: 'tags', half: true, ph: t('lore.e.cfNamesPh') }, { k: 'charFilter.tags', label: t('lore.e.cfTags'), type: 'tags', half: true, ph: t('lore.e.cfTagsPh') }, { k: 'charFilter.exclude', label: t('lore.e.cfExclude'), type: 'check' }]} onChange={fix} />
    </Sec>
    <Sec title={t('lore.e.sec.group')} on={!!(e.group || e.ignoreBudget)}>
      <Form obj={e} defs={[{ k: 'group', label: t('lore.e.group'), half: true, ph: t('lore.e.groupPh') }, { k: 'groupWeight', label: t('lore.e.groupWeight'), type: 'num', min: 0, half: true },
        { k: 'groupOverride', label: t('lore.e.groupOverride'), type: 'check' }, { k: 'useGroupScoring', label: t('lore.e.groupScoring'), type: 'select', opts: [['', t('lore.e.groupScoringInherit')], ['true', t('lore.tri.on')], ['false', t('lore.tri.off')]], half: true },
        { k: 'ignoreBudget', label: t('lore.e.ignoreBudget'), type: 'check' }]} onChange={fix} />
    </Sec>
    <Sec title={t('lore.e.sec.timed')} on={!!(e.sticky || e.cooldown || e.delay || e.noRecurse || e.excludeRecursion || +(e.delayUntilRecursion ?? 0) || e.automationId)}>
      <Form obj={e} defs={[{ k: 'sticky', label: t('lore.e.sticky'), type: 'num', nullable: true, third: true, ph: t('common.none') }, { k: 'cooldown', label: t('lore.e.cooldown'), type: 'num', nullable: true, third: true, ph: t('common.none') }, { k: 'delay', label: t('lore.e.delay'), type: 'num', nullable: true, third: true, ph: t('common.none') },
        { k: 'noRecurse', label: t('lore.e.noRecurse'), type: 'check' }, { k: 'excludeRecursion', label: t('lore.e.excludeRecursion'), type: 'check' },
        { k: 'delayUntilRecursion', label: t('lore.e.delayUntilRecursion'), type: 'num', min: 0, half: true, hint: t('lore.e.delayUntilRecursionHint') },
        { k: 'automationId', label: t('lore.e.automationId'), half: true, ph: t('common.none'), hint: t('lore.e.automationIdHint') }]} onChange={fix} />
    </Sec>
  </div>;
}

export function LoreEditor({ b, api }: { b: Lore; api: EditorApi }) {
  b.entries ||= [];
  const { uid, download, newEntry } = core;
  const redraw = useBump(), sv = useDebounced(() => api.save(), 300);
  const st = useRef({ q: '', filter: 'all', sort: 'list', shown: PAGE, pick: false, open: new Set<string>(), picked: new Set<string>(), gen: 0, at: -1, rows: [] as Entry[] }).current;
  /** 목록을 다시 고르고 그린다 (옛 drawEntries). redraw 만 부르면 머리줄 · 집계만 바뀐다 — 고치는 도중에 항목이 자리를 옮기지 않게 */
  const draw = () => { st.gen++; redraw(); };
  const [qText, setQText] = useState('');
  const search = useDebounced((v: string) => { st.q = v; st.shown = PAGE; draw(); }, 180);
  const touch = () => { sv(); api.redraw(); };
  const { open, picked } = st;

  if (st.at !== st.gen) {
    const t = st.q.trim().toLowerCase(), sorter = SORTS[st.sort];
    st.rows = b.entries.filter(e => FILTERS[st.filter](e) && (!t || hay(e).includes(t)));
    if (sorter) st.rows = [...st.rows].sort(sorter);
    st.at = st.gen;
  }
  const rows = st.rows, pg = usePaged(rows, { id: 'loreEntries', perPage: PAGE, sizes: [20, 40, 80, 160], resetKey: `${b.id}|${st.q}|${st.filter}|${st.sort}` }), vis = pg.rows, on = b.entries.filter(e => e.enabled !== false);

  const moveTo = (list: Entry[]) => {
    const others = S.lore.filter(x => x.id !== b.id);
    const m: ModalHandle = openModal({ title: tn('lore.move.title', list.length), body: <div className="col">{others.map(o => <button key={o.id} className="picker-row" onClick={async () => {
      o.entries.push(...list); b.entries = b.entries.filter(x => !list.includes(x)); list.forEach(r => picked.delete(r.id));
      await S.save('lore', o, true); await api.save(); m.close(); toast(t('lore.move.done', { name: o.name }), 'ok'); api.redraw(); draw();
    }}><Icon name="book" size={18} /><div className="picker-text"><b>{o.name}</b><small>{tn('lore.entries', o.entries.length)}</small></div></button>)}</div> });
  };
  const entryMenu = (anchor: Element, e: Entry) => menu(anchor, [
    { label: t('common.duplicate'), ic: 'copy', onclick: () => { const c = { ...copy(e), id: uid(), name: (e.name || titleOf(e)) + ' (사본)' }; b.entries.splice(b.entries.indexOf(e) + 1, 0, c); open.add(c.id); touch(); draw(); } },
    { label: t('lore.menu.top'), ic: 'up', onclick: () => { b.entries.splice(b.entries.indexOf(e), 1); b.entries.unshift(e); touch(); draw(); } },
    { label: t('lore.menu.bottom'), ic: 'down', onclick: () => { b.entries.splice(b.entries.indexOf(e), 1); b.entries.push(e); touch(); draw(); } },
    S.lore.length > 1 && { label: t('lore.menu.move'), ic: 'book', onclick: () => moveTo([e]) },
    '-',
    { label: t('lore.menu.delete'), ic: 'trash', danger: true, onclick: () => { b.entries.splice(b.entries.indexOf(e), 1); picked.delete(e.id); touch(); draw(); } },
  ]);

  // 한꺼번에 고치기
  const target = st.pick ? rows.filter(e => picked.has(e.id)) : rows, label = st.pick ? t('lore.bulk.picked', { n: target.length }) : (rows.length === b.entries.length ? t('lore.bulk.all') : t('lore.bulk.visible', { n: rows.length }));
  const setAll = (v: boolean) => { target.forEach(e => { e.enabled = v; }); touch(); draw(); };
  const allOpen = vis.length > 0 && vis.every(e => open.has(e.id));

  const links = loreLinks(b), active = S.settings.activeLore.includes(b.id);
  return <div className="editor lore-editor">
    <header className="editor-head"><h2>{b.name}</h2><div className="row">
      <Btn label={t('lore.addEntry')} ic="plus" cls="primary" onClick={() => { const e = newEntry(); b.entries.unshift(e); open.add(e.id); st.q = ''; setQText(''); st.filter = 'all'; pg.setPage(0); void api.save(); draw(); api.redraw(); }} />
      <IconBtn ic="play" title={t('lore.test.title')} onClick={() => openModal({ title: t('lore.test.titleOf', { name: b.name }), wide: true, body: <TestBody b={b} /> })} />
      <IconBtn ic="sliders" title={t('lore.global.title')} onClick={() => loreSettingsDialog()} />
      <IconBtn ic="import" title={t('lore.exportSt')} onClick={() => download(`${b.name}.json`, JSON.stringify(cards.loreToWorld(b), null, 2))} />
      <IconBtn ic="trash" title={t('lore.delete')} onClick={async () => { if (await confirmBox(t('lore.confirmDelete', { name: b.name }), t('common.delete'), true)) { await S.remove('lore', b.id); S.set({ activeLore: S.settings.activeLore.filter(i => i !== b.id) }); api.refresh(); } }} />
    </div></header>
    <div className="lore-power"><LoreSwitch b={b} after={() => { redraw(); api.redraw(); }} /><div><b>{t('lore.power.title')}</b><small>{active ? t('lore.power.on') : links.length ? t('lore.power.linked', { links: links.join(' · ') }) : t('lore.power.off')}</small></div></div>
    <Form obj={b} defs={[{ k: 'name', label: t('common.name'), half: true }, { k: 'description', label: t('lore.b.description'), half: true }, { k: 'scanDepth', label: t('lore.b.scanDepth'), type: 'num', min: 0, half: true }, { k: 'tokenBudget', label: t('lore.b.tokenBudget'), type: 'num', half: true },
      { k: 'recursive', label: t('lore.b.recursive'), type: 'check' }, { k: 'caseSensitive', label: t('lore.b.caseSensitive'), type: 'check' }, { k: 'wholeWord', label: t('lore.b.wholeWord'), type: 'check' }]} onChange={sv} />
    <p className="hint">{t('lore.b.linkHint')}</p>
    <div className="lore-tools">
      <div className="lore-bar">
        <input className="inp search" placeholder={t('lore.search')} value={qText} onChange={e => { setQText(e.target.value); search(e.target.value); }} />
        <select className="inp" value={st.filter} onChange={e => { st.filter = e.target.value; st.shown = PAGE; draw(); }}>{FILTER_OPTS.map(v => <option key={v} value={v}>{t('lore.filter.' + v)}</option>)}</select>
        <select className="inp" value={st.sort} onChange={e => { st.sort = e.target.value; st.shown = PAGE; draw(); }}>{SORT_OPTS.map(v => <option key={v} value={v}>{t('lore.sort.' + v)}</option>)}</select>
      </div>
      <div className="lore-status"><span className="lore-count">{t('lore.status', { n: b.entries.length, on: on.length, tok: on.reduce((n, e) => n + tok(e), 0).toLocaleString() }) + (rows.length !== b.entries.length ? t('lore.statusMatch', { n: rows.length }) : '')}</span></div>
      <div className="lore-bulk">
        <button className={'chip' + (st.pick ? ' on' : '')} title={t('lore.bulk.pickTitle')} onClick={() => { st.pick = !st.pick; picked.clear(); draw(); }}>{t('lore.bulk.pick')}</button>
        {st.pick ? <button className="chip" onClick={() => { const all = rows.every(e => picked.has(e.id)); rows.forEach(e => all ? picked.delete(e.id) : picked.add(e.id)); draw(); }}>{t('lore.bulk.pickVisible')}</button> : null}
        <span className="lore-bulk-label">{label}</span>
        <button className="chip" disabled={!target.length} onClick={() => setAll(true)}>{t('lore.bulk.enable')}</button><button className="chip" disabled={!target.length} onClick={() => setAll(false)}>{t('lore.bulk.disable')}</button>
        {st.pick && S.lore.length > 1 ? <button className="chip" disabled={!target.length} onClick={() => { if (target.length) moveTo(target); }}>{t('lore.bulk.move')}</button> : null}
        {st.pick ? <button className="chip danger" disabled={!target.length} onClick={async () => { if (!target.length || !(await confirmBox(tn('lore.bulk.confirmDelete', target.length), t('common.delete'), true))) return; b.entries = b.entries.filter(e => !target.includes(e)); picked.clear(); touch(); draw(); }}>{t('common.delete')}</button> : null}
        <i className="lore-gap" />
        <button className="chip" onClick={() => { vis.forEach(e => allOpen ? open.delete(e.id) : open.add(e.id)); draw(); }}>{allOpen ? t('lore.bulk.collapse') : t('lore.bulk.expand')}</button>
      </div>
    </div>
    <div className="entries" ref={pg.listRef}>
      {vis.map(e => <div key={e.id} className={'entry' + (open.has(e.id) ? ' open' : '') + (e.enabled !== false ? '' : ' off')}>
        <div className="entry-head" onClick={ev => { if ((ev.target as Element).closest('button,label,input')) return; if (open.has(e.id)) open.delete(e.id); else open.add(e.id); draw(); }}>
          {st.pick ? <label className="check lore-pick"><input type="checkbox" checked={picked.has(e.id)} onChange={ev => { if (ev.target.checked) picked.add(e.id); else picked.delete(e.id); redraw(); }} /><i /></label> : null}
          <label className="switch"><input type="checkbox" checked={e.enabled !== false} onChange={ev => { e.enabled = ev.target.checked; touch(); redraw(); }} /><i /></label>
          <div className="lore-title"><b>{titleOf(e)}</b><small>{e.constant ? t('lore.filter.constant') : ((e.keys || []).slice(0, 5).join(', ') || t('lore.noKeys'))}</small></div>
          <div className="lore-tags">{e.constant ? <em className="badge">{t('lore.badge.constant')}</em> : null}{e.group ? <em className="badge">{e.group}</em> : null}{(e.probability ?? 100) < 100 ? <em className="badge">{`${e.probability}%`}</em> : null}{(e.sticky || e.cooldown || e.delay) ? <em className="badge">{t('lore.badge.timed')}</em> : null}<em className="badge">{posShort(e.position || '') || t('lore.posShort.before')}</em></div>
          <span className="tokbadge">{`≈${tok(e)}`}</span>
          <IconBtn ic="more" title={t('lore.menu.title')} cls="tiny" onClick={ev => entryMenu(ev.currentTarget, e)} />
        </div>
        {open.has(e.id) && <EntryBody e={e} sv={sv} changed={redraw} draw={draw} />}
      </div>)}
      {!rows.length ? <p className="dim pad">{b.entries.length ? t('lore.noMatch') : t('lore.noEntries')}</p> : null}
    </div>
    {pg.pager}
  </div>;
}
