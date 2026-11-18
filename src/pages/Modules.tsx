// 모듈: 목록(검색 · 거르기 · 스위치) · 편집(정보 · 범위 · 담긴 것) · 가져오기 미리 보기 · 삭제 창
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import type { Char } from '../types';
import type { ChatX, Lore } from '../studio/parts';
import { Assets, Modules as Mods, modeLabel, MOD_ASSET_PROMPT, SCOPES, booksOf, cfg, counts, debounce, list, ownItems, regexOf, roomNote, roomTitle, scopeLabel, text, verLabel, type Asset, type ItemState, type Kind, type Module, type Plan, type Quick, type Scope } from '../modules/lib';
import { pickItems } from '../modules/PickItems';
import { usePaged } from '../ui';
import { go as goTo } from '../lib/router';
import { fmtTime, S } from '../lib/core';
import * as core from '../lib/core';
import { LForm, PageHead, Switch, charPicker, errMsg, imageModal, menu, openModal, promptBox, toast } from '../studio/parts';
import { t, tn } from '../i18n';

export const page = { name: 'modules', Component: Modules };

const go = (arg?: string) => goTo('modules', arg);
const Stat = ({ ic, label, n }: { ic: string; label: string; n: number }) => <span className={'mod-stat' + (n ? '' : ' zero')} title={`${label} ${n}`}><Icon name={ic} size={14} /><span>{label}</span><b>{String(n)}</b></span>;
function StatRow({ m }: { m: Module }) {
  const n = counts(m);
  return <div className="mod-stats"><Stat ic="book" label={t('modules.stat.lore')} n={n.lore} /><Stat ic="code" label={t('modules.stat.regex')} n={n.regex} /><Stat ic="image" label={t('modules.stat.assets')} n={n.assets} /><Stat ic="play" label={t('modules.stat.quick')} n={n.quick} />
    {n.css && <span className={'mod-stat' + (m.cssOn ? '' : ' zero')}><Icon name="feather" size={14} /><span>CSS</span><b>{m.cssOn ? t('modules.on') : t('modules.off')}</b></span>}</div>;
}
function warnOn(m: Module) {
  if (!m.on) return;
  if (m.scope === 'char' && !m.charIds.length) toast(t('modules.warn.noChar'));
  else if (m.scope === 'chat' && !m.chatIds.length) toast(t('modules.warn.noChat'));
}
const exportModule = (m: Module) => { Mods.exportModule(m).catch((e: unknown) => toast(errMsg(e), 'err')); };

// ── 삭제 창 ──
function removeDialog(m: Module, after: () => void) {
  const own = ownItems(m), has = own.lore.length + own.regex.length > 0, opt = { withItems: false }, n = counts(m);
  openModal({
    title: t('modules.del.title', { name: m.name }), box: 'col mod-dialog',
    actions: [{ label: t('common.cancel') }, { label: t('common.delete'), cls: 'danger', onclick: async () => { await Mods.remove(m, opt); toast(t('modules.del.done')); after(); } }],
  }, () => <>
    <p>{t('modules.del.body')}{n.lore + n.regex ? t('modules.del.bodyKeep') : ''}</p>
    {has && <LForm obj={opt} defs={[{ k: 'withItems', label: t('modules.del.withItems', { list: [own.lore.length && tn('modules.n.lorebooks', own.lore.length), own.regex.length && tn('modules.n.regexes', own.regex.length)].filter(Boolean).join(' · ') }), type: 'check', live: true }]} />}
  </>);
}

// ── 가져오기 ──
async function importDialog() {
  const [f] = await core.pickFiles({ accept: '.json,application/json' }); if (!f) return;
  let plan: Plan;
  try {
    if (f.size > 300e6) throw new Error(t('modules.imp.tooBig'));
    const raw = await f.text(); let j: unknown;
    try { j = JSON.parse(raw); } catch { throw new Error(raw.charCodeAt(0) === 111 && raw.charCodeAt(1) === 0 ? t('modules.imp.zipped') : t('modules.imp.notJson')); }
    await Mods.load(); plan = Mods.readPack(j, f.name);
  } catch (e) { return toast(errMsg(e), 'err'); }
  previewDialog(plan);
}
const PvGroup = ({ ic, label, n, open = false, children }: { ic: string; label: string; n: string; open?: boolean; children: ReactNode }) =>
  <details className="mod-pv" open={open}><summary><Icon name={ic} size={15} /><b>{label}</b><span>{n}</span></summary><div className="mod-pv-body">{children}</div></details>;
function previewDialog(plan: Plan) {
  const p = plan.module, same = Mods.list.filter(m => m.name === p.name), opt = { how: 'new' };
  const entries = plan.lore.reduce((n, b) => n + b.entries.length, 0), MAX = 14;
  const empty = !plan.lore.length && !plan.regex.length && !plan.assets.length && !p.quick.length && !p.css.trim();
  const rest = (n: number) => n > MAX ? <p className="dim">{tn('modules.n.more', n - MAX)}</p> : null;
  const install = async () => {
    try {
      const { module: m, kept } = await Mods.installPack(plan, { replace: opt.how === 'new' ? '' : opt.how });
      const left = [kept.lore && tn('modules.n.lorebooks', kept.lore), kept.regex && tn('modules.n.regexes', kept.regex)].filter(Boolean).join(' · ');
      toast(t('modules.imp.done', { name: m.name }) + (left ? t('modules.imp.doneKept', { list: left }) : ''), 'ok');
      go(m.id);
    } catch (e) { console.error(e); toast(t('modules.imp.fail', { err: errMsg(e) }), 'err'); return false; }
  };
  return openModal({ title: t('modules.imp.title'), wide: true, box: 'col mod-dialog', actions: [{ label: t('common.cancel') }, !empty && { label: t('common.import'), cls: 'primary', ic: 'import', onclick: install }] }, () => <>
    <div className="mod-pv-head"><div className="mod-pv-title"><b>{p.name}</b>{p.version && <span className="mod-ver">{verLabel(p.version)}</span>}</div>
      {p.author && <p className="mod-by"><span>{t('modules.author')}</span>{p.author}</p>}{p.description.trim() && <p className="mod-pv-desc">{p.description}</p>}<small className="hint">{plan.source}</small></div>
    {empty ? <p className="dim">{t('modules.pv.empty')}</p> : <div className="mod-pv-list">
      {plan.lore.length ? <PvGroup ic="book" label={t('modules.stat.lore')} n={t('modules.pv.loreN', { books: plan.lore.length, entries })} open>{plan.lore.slice(0, MAX).map((b, i) => <div className="mod-pv-row" key={i}><b>{b.name}</b><small>{tn('modules.n.entries', b.entries.length) + (b.entries.some(e => e.constant) ? tn('modules.n.constant', b.entries.filter(e => e.constant).length) : '')}</small></div>)}{rest(plan.lore.length)}</PvGroup> : null}
      {plan.regex.length ? <PvGroup ic="code" label={t('modules.stat.regex')} n={tn('modules.n.items', plan.regex.length)}>{plan.regex.slice(0, MAX).map((r, i) => <div className="mod-pv-row" key={i}><b>{r.name}</b><small>{modeLabel(r.mode)}</small><code>{r.find.slice(0, 80)}</code></div>)}{rest(plan.regex.length)}</PvGroup> : null}
      {plan.assets.length ? <PvGroup ic="image" label={t('modules.stat.assets')} n={tn('modules.n.pics', plan.assets.length)}><div className="mod-pv-pics">{plan.assets.slice(0, 24).map(a => <img key={a.name} src={a.data} alt={a.name} title={a.name} loading="lazy" />)}{plan.assets.length > 24 && <span className="dim">{tn('modules.n.morePics', plan.assets.length - 24)}</span>}</div></PvGroup> : null}
      {p.quick.length ? <PvGroup ic="play" label={t('modules.quickButtons')} n={tn('modules.n.items', p.quick.length)}><div className="mod-pv-chips">{p.quick.map((q, i) => <span className="chip static" title={q.text} key={i}>{q.label || q.text.slice(0, 20)}</span>)}</div></PvGroup> : null}
      {p.css.trim() ? <PvGroup ic="feather" label={t('modules.pv.css')} n={tn('modules.pv.cssLines', p.css.split('\n').length)}><small className="hint">{t('modules.pv.cssHint')}</small><pre className="mod-code">{p.css.slice(0, 6000) + (p.css.length > 6000 ? '\n…' : '')}</pre></PvGroup> : null}
    </div>}
    {plan.notes.length ? <ul className="mod-notes">{plan.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
    {same.length ? <label className="field"><span className="field-label">{t('modules.pv.same', { name: p.name })}</span>
      <select className="inp" defaultValue="new" onChange={e => { opt.how = e.target.value; }}><option value="new">{t('modules.pv.keepBoth')}</option>
        {same.map(m => <option key={m.id} value={m.id}>{t('modules.pv.overwrite') + (same.length > 1 ? t('modules.pv.edited', { time: fmtTime(m.updatedAt) }) : '')}</option>)}</select>
      <small className="hint">{t('modules.pv.overwriteHint')}</small></label> : null}
    <div className="mod-warn"><Icon name="lock" size={16} /><div><b>{t('modules.pv.warnTitle')}</b><span>{t('modules.pv.warnBody')}</span></div></div>
  </>);
}

// ── 목록 ──
const listState = { q: '', filter: 'all' };
/** [id, 글자 키, 거르기] */
const FILTERS: [string, string, (m: Module) => boolean][] = [['all', 'modules.filter.all', () => true], ['on', 'modules.filter.on', m => m.on], ['off', 'modules.filter.off', m => !m.on], ['global', 'modules.scope.global', m => m.scope === 'global'], ['char', 'modules.scope.char', m => m.scope === 'char'], ['chat', 'modules.scope.chat', m => m.scope === 'chat']];
function ListView() {
  const st = listState, all = Mods.list;
  const [q, setQ] = useState(st.q), [drawn, setDrawn] = useState(0), [, bump] = useState(0);
  const draw = () => setDrawn(n => n + 1);
  // 스위치를 눌러도 카드가 자리를 옮기지 않게, 목록의 순서와 안내 글은 다시 그릴 때만 새로 잡는다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { rows, info } = useMemo(() => {
    const qq = st.q.trim().toLowerCase(), fn = FILTERS.find(f => f[0] === st.filter)?.[2] || (() => true);
    const rows = all.filter(fn).filter(m => !qq || [m.name, m.author, m.description, ...booksOf(m).map(b => b.name), ...regexOf(m).map(r => r.name)].join(' ').toLowerCase().includes(qq))
      .sort((a, b) => +b.on - +a.on || a.name.localeCompare(b.name, 'ko'));
    return { rows, info: all.length ? (rows.length === all.length ? t('modules.list.infoAll', { n: rows.length, on: all.filter(m => m.on).length }) : t('modules.list.infoSome', { n: rows.length, total: all.length, on: all.filter(m => m.on).length })) : '' };
  }, [drawn, q, st.filter, all.length]);
  const pg = usePaged(rows, { id: 'modules', perPage: 24, sizes: [12, 24, 48, 96], resetKey: `${q}|${st.filter}` });
  const make = async () => { const m = await Mods.create(); go(m.id); };
  const setPrompt = useMemo(() => debounce((v: string) => { cfg().assetPrompt = v; S.set({ modules: cfg() }); }, 300), []);
  const card = (m: Module) => <article className={'mod-card' + (m.on ? ' on' : '')} key={m.id}>
    <header className="mod-card-head">
      <button type="button" className="mod-card-title" title={t('modules.openEdit')} onClick={() => go(m.id)}><b>{m.name}</b>{m.version && <span className="mod-ver">{verLabel(m.version)}</span>}</button>
      <Switch checked={m.on} title={t('modules.toggleTitle', { name: m.name })} onChange={async v => { m.on = v; bump(n => n + 1); await Mods.save(m); warnOn(m); bump(n => n + 1); }} /></header>
    {m.author && <p className="mod-by"><span>{t('modules.author')}</span>{m.author}</p>}
    <p className={'mod-desc' + (m.description.trim() ? '' : ' none')}>{m.description.trim() || t('modules.noDesc')}</p>
    <StatRow m={m} />
    <footer className="mod-card-foot">
      <span className="mod-scope"><Icon name={m.scope === 'global' ? 'moon' : m.scope === 'char' ? 'user' : 'chat'} size={14} /><span>{scopeLabel(m)}</span></span>
      {roomNote(m) && <small className="mod-roomnote">{roomNote(m)}</small>}{m.imported && <em className="badge">{t('modules.imported')}</em>}
      <IconBtn ic="more" title={t('modules.more')} cls="tiny" onClick={e => menu(e.currentTarget, [
        { label: t('modules.openEdit'), ic: 'edit', onclick: () => go(m.id) },
        { label: t('modules.exportFile'), ic: 'upload', onclick: () => exportModule(m) },
        { label: t('common.duplicate'), ic: 'copy', onclick: async () => { const c = await Mods.duplicate(m); toast(t('modules.dup.done', { name: c.name }), 'ok'); draw(); } },
        '-',
        { label: t('common.delete'), ic: 'trash', danger: true, onclick: () => removeDialog(m, draw) }])} />
    </footer>
  </article>;
  return <section className="mods">
    <PageHead eyebrow="modules" title={t('modules.title')}><Btn label={t('common.import')} ic="import" title={t('modules.importTitle')} onClick={() => void importDialog()} /><Btn label={t('modules.defaultName')} ic="plus" cls="primary" onClick={() => void make()} /></PageHead>
    <div className="mod-bar"><div className="search-wrap"><Icon name="search" size={16} /><input className="inp" placeholder={t('modules.searchPh')} value={q} onChange={e => { st.q = e.target.value; setQ(e.target.value); }} /></div><span className="mod-info">{info}</span></div>
    <div className="mod-filters">{FILTERS.map(([id, label, fn]) => <button key={id} type="button" className={'chip' + (st.filter === id ? ' on' : '')} onClick={() => { st.filter = id; draw(); }}>{t(label)}<small>{String(all.filter(fn).length)}</small></button>)}</div>
    <div className="mod-grid" ref={pg.listRef}>{!all.length
      ? <div className="empty mod-empty"><Icon name="panel" size={34} /><p>{t('modules.emptyBody')}</p><div className="row wrap"><Btn label={t('modules.defaultName')} ic="plus" cls="primary" onClick={() => void make()} /><Btn label={t('modules.importFromFile')} ic="import" onClick={() => void importDialog()} /></div></div>
      : !rows.length ? <p className="dim mod-none">{t('modules.noMatch')}</p> : pg.rows.map(card)}</div>
    <div className="mod-more">{pg.pager}</div>
    <details className="mod-opts"><summary><Icon name="sliders" size={15} />{t('modules.assetPrompt.title')}</summary>
      <div className="mod-opts-body"><small className="hint">{t('modules.assetPrompt.hint')}</small>
        <textarea className="inp" rows={5} spellCheck={false} placeholder={MOD_ASSET_PROMPT} defaultValue={text(cfg().assetPrompt)} onChange={e => setPrompt(e.target.value)} /></div></details>
  </section>;
}

// ── 편집: 에셋 탭 ──
function AssetsTab({ m, redraw }: { m: Module; redraw: () => void }) {
  const A = Assets, owner = Mods.ownerOf(m), alive = useRef(true);
  const [all, setAll] = useState<Asset[] | null>(null);
  const pg = usePaged(all || [], { id: 'moduleAssets', perPage: 60, sizes: [30, 60, 120, 240], resetKey: m.id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    alive.current = true;
    void A.load([owner]).then(() => { if (!alive.current) return; const got = A.list(owner); setAll(got); if (m.assetCount !== got.length) { m.assetCount = got.length; void Mods.save(m); redraw(); } });
    return () => { alive.current = false; };
  }, []);
  if (!all) return <div className="col" />;
  const after = async () => { await A.reload([owner]); m.assetCount = A.list(owner).length; await Mods.save(m); if (!alive.current) return; setAll(A.list(owner)); redraw(); };
  const rename = async (a: Asset) => {
    const v = await promptBox(t('modules.asset.name'), a.name); if (v == null) return; const name = A.cleanName(v);
    if (!name || name === a.name) return; if (all.some(o => o !== a && o.name === name)) return toast(t('modules.asset.dupName'), 'err');
    await A.update({ ...a, name }); void after();
  };
  const upload = async () => {
    const files = await core.pickFiles({ accept: 'image/*,.zip', multiple: true }); if (!files.length) return;
    try { const n = await A.addFiles(owner, files); toast(n ? tn('modules.asset.added', n) : t('modules.asset.noneFound'), n ? 'ok' : ''); } catch (e) { toast(errMsg(e), 'err'); }
    void after();
  };
  const fromChar = () => charPicker({ title: t('modules.asset.fromCharTitle'), multi: false, onDone: async ([cid]) => {
    const src = A.ownerOfChar(cid); await A.load([src]);
    const have = new Set(all.map(a => a.name)), pool = A.list(src);
    if (!pool.length) return toast(t('modules.asset.charNone'));
    pickItems({ title: t('modules.asset.ofChar', { name: S.get('chars', cid)?.name || t('modules.fallbackChar') }), okLabel: t('modules.asset.copyOk'), ph: t('modules.asset.ph'), items: pool.map(a => ({ id: a.id, thumb: a.data, title: a.name, sub: [a.ver && t('modules.asset.ver', { v: a.ver }), have.has(a.name) && t('modules.asset.willOverwrite')].filter(Boolean).join(' · '), search: a.name.toLowerCase() })),
      onDone: async sel => { for (const a of pool.filter(x => sel.includes(x.id))) await A.add(owner, a.name, a.data); toast(tn('modules.asset.copied', sel.length), 'ok'); void after(); } });
  } });
  return <div className="col">
    <div className="row wrap"><Btn label={t('modules.asset.upload')} ic="upload" title={t('modules.asset.uploadTitle')} onClick={() => void upload()} /><Btn label={t('modules.asset.fromChar')} ic="copy" onClick={fromChar} />{all.length > 0 && <span className="mod-info">{tn('modules.n.pics', all.length)}</span>}</div>
    <small className="hint">{t('modules.asset.hint')}</small>
    <div className="mod-assets" ref={pg.listRef}>{pg.rows.map(a => <figure className="mod-asset" key={a.id}>
      <button type="button" className="mod-asset-pic" title={t('modules.asset.zoom')} onClick={() => imageModal(a.name, a.data)}><img src={a.data} alt={a.name} loading="lazy" /></button>
      <figcaption><button type="button" className="mod-asset-name" title={t('common.rename')} onClick={() => void rename(a)}>{a.name}</button><IconBtn ic="x" title={t('modules.asset.remove')} cls="tiny" onClick={async () => { await A.remove(a); void after(); }} /></figcaption>
    </figure>)}{!all.length && <p className="dim mod-none">{t('modules.asset.empty')}</p>}</div>
    <div>{pg.pager}</div>
  </div>;
}

// ── 편집 ──
const quickKeys = new WeakMap<Quick, number>(); let quickSeq = 0;
const quickKey = (q: Quick) => quickKeys.get(q) ?? (quickKeys.set(q, ++quickSeq), quickSeq);
type TabId = 'lore' | 'regex' | 'assets' | 'quick' | 'css';
function Editor({ m }: { m: Module }) {
  const [tab, setTab] = useState<TabId>('lore'), [, bump] = useState(0), redraw = () => bump(n => n + 1);
  const save = useMemo(() => debounce(() => { void Mods.save(m); }, 300), [m]);
  const store = async () => { await Mods.save(m); redraw(); };
  const quickBox = useRef<HTMLDivElement>(null), focusNew = useRef(false);
  useEffect(() => { if (focusNew.current) { focusNew.current = false; quickBox.current?.lastElementChild?.querySelector('input')?.focus(); } });

  // 범위
  const note = roomNote(m);
  const extra = note ? <div className="row wrap mod-rooms-note"><small className="hint">{t('modules.scope.fromPanel', { note })}</small><Btn label={t('modules.scope.clearRooms')} cls="ghost" onClick={async () => { m.rooms = {}; await store(); }} /></div> : null;
  let scopeBody: ReactNode;
  if (m.scope === 'global') scopeBody = <><small className="hint">{t('modules.scope.hintGlobal')}</small>{extra}</>;
  else if (m.scope === 'char') {
    const cs = m.charIds.map(i => S.get('chars', i)).filter((c): c is Char => !!c);
    scopeBody = <><small className="hint">{t('modules.scope.hintChar')}</small>
      <div className="mod-targets">{cs.map(c => <span className="chip static mod-target" key={c.id}><Avatar o={c} cls="xs" /><span>{c.name}</span><button type="button" title={t('modules.remove')} aria-label={t('modules.removeName', { name: c.name })} onClick={async () => { m.charIds = m.charIds.filter(i => i !== c.id); await store(); }}><Icon name="x" size={12} /></button></span>)}
        <Btn label={cs.length ? t('modules.scope.pickChar') : t('modules.scope.pickCharPlease')} ic="users" onClick={() => charPicker({ title: t('modules.scope.charTitle'), selected: m.charIds, onDone: async sel => { m.charIds = sel; await store(); } })} /></div>{extra}</>;
  } else {
    const rooms = m.chatIds.map(i => S.get('chats', i)).filter((c): c is ChatX => !!c);
    const more = () => {
      const lastId = S.settings.lastChat, pool = S.chats.filter(c => !m.chatIds.includes(c.id)).sort((a, b) => +(b.id === lastId) - +(a.id === lastId) || b.updatedAt - a.updatedAt);
      pickItems({ title: t('modules.scope.chatTitle'), okLabel: t('modules.scope.pickOk'), ph: t('modules.scope.chatPh'), empty: t('modules.scope.chatEmpty'), items: pool.map(c => ({ id: c.id, ic: 'chat', title: roomTitle(c), sub: (c.id === lastId ? t('modules.scope.lastRoom') : '') + tn('modules.chatSub', c.count || 0, { time: fmtTime(c.updatedAt) }), search: (roomTitle(c) + ' ' + (c.preview || '')).toLowerCase() })),
        onDone: async sel => { m.chatIds = [...m.chatIds, ...sel]; await store(); } });
    };
    scopeBody = <><small className="hint">{t('modules.scope.hintChat')}</small>
      <div className="mod-rows">{rooms.slice(0, 40).map(c => <div className="mod-row" key={c.id}><span className="mod-row-ic"><Icon name="chat" size={15} /></span><div className="mod-row-text"><b>{roomTitle(c)}</b><small>{tn('modules.chatSub', c.count || 0, { time: fmtTime(c.updatedAt) })}</small></div>
        <IconBtn ic="x" title={t('modules.scope.removeRoom')} cls="tiny" onClick={async () => { m.chatIds = m.chatIds.filter(i => i !== c.id); await store(); }} /></div>)}{rooms.length > 40 && <p className="dim">{tn('modules.n.moreRooms', rooms.length - 40)}</p>}</div>
      <div className="row"><Btn label={rooms.length ? t('modules.scope.pickMoreChats') : t('modules.scope.pickChatPlease')} ic="chat" onClick={more} /></div>{extra}</>;
  }

  // 담긴 것
  const stateBadge = (kind: Kind, id: string, st: ItemState) => {
    if (st === 'mod') return <em className="badge on">{t('modules.state.mod')}</em>;
    if (st === 'muted') return <><em className="badge">{t('modules.state.muted')}</em><Btn label={t('modules.state.wake')} cls="ghost mod-mini" title={t('modules.state.wakeTitle')} onClick={async () => { await Mods.wake(kind, id); redraw(); }} /></>;
    if (st === 'user') return <><em className="badge">{t('modules.state.user')}</em><Btn label={t('modules.state.handOver')} cls="ghost mod-mini" title={t('modules.state.handOverTitle')} onClick={async () => { await Mods.handOver(kind, id); redraw(); }} /></>;
    return <em className="badge">{Mods.effective(m, null) ? t('modules.filter.off') : m.on && m.scope !== 'global' ? t('modules.state.onInChats') : t('modules.filter.off')}</em>;
  };
  const rowsBox = (rows: ReactNode[], emptyText: string) => <div className="mod-rows">{rows.length ? rows : <p className="dim mod-none">{emptyText}</p>}</div>;
  const activeLore = list<string>(S.settings.activeLore);
  const charName = (scope?: string) => S.get('chars', scope)?.name || t('modules.fallbackChar');
  const pickLore = () => pickItems({ title: t('modules.lore.pickTitle'), empty: t('modules.lore.pickEmpty'),
    items: S.lore.filter(b => !m.lore.includes(b.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((b: Lore) => ({ id: b.id, ic: 'book', title: b.name, sub: tn('modules.n.entries', list(b.entries).length) + (activeLore.includes(b.id) ? t('modules.lore.globalNow') : ''), search: (b.name + ' ' + (b.description || '')).toLowerCase() })),
    onDone: async sel => { m.lore = [...m.lore, ...sel]; await store(); } });
  const pickRegex = () => pickItems({ title: t('modules.regex.pickTitle'), empty: t('modules.regex.pickEmpty'),
    items: S.regex.filter(r => !m.regex.includes(r.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(r => ({ id: r.id, ic: 'code', title: r.name, sub: `${modeLabel(r.mode)}${r.scope && r.scope !== 'global' ? ' · ' + charName(r.scope) : ''}${r.enabled ? t('modules.regex.onNow') : ''}`, search: (r.name + ' ' + (r.find || '')).toLowerCase() })),
    onDone: async sel => { m.regex = [...m.regex, ...sel]; await store(); } });
  const TABS: Record<TabId, { label: string; n: () => number | string; draw: () => ReactNode }> = {
    lore: { label: t('modules.stat.lore'), n: () => booksOf(m).length, draw: () => <>
      <div className="row wrap"><Btn label={t('modules.lore.add')} ic="plus" onClick={pickLore} /><small className="hint">{t('modules.lore.hint')}</small></div>
      {rowsBox(booksOf(m).map(b => <div className="mod-row" key={b.id}><span className="mod-row-ic"><Icon name="book" size={15} /></span><div className="mod-row-text"><b>{b.name}</b><small>{tn('modules.n.entries', list(b.entries).length) + (b.description ? ' · ' + b.description : '')}</small></div>
        <div className="mod-row-state">{stateBadge('lore', b.id, Mods.loreState(b.id))}</div>
        <IconBtn ic="edit" title={t('modules.lore.open')} cls="tiny" onClick={() => goTo('lore', b.id)} /><IconBtn ic="x" title={t('modules.removeFromModule')} cls="tiny" onClick={async () => { m.lore = m.lore.filter(i => i !== b.id); await store(); }} /></div>), t('modules.lore.empty'))}</> },
    regex: { label: t('modules.stat.regex'), n: () => regexOf(m).length, draw: () => <>
      <div className="row wrap"><Btn label={t('modules.regex.add')} ic="plus" onClick={pickRegex} /><small className="hint">{t('modules.regex.hint')}</small></div>
      {rowsBox(regexOf(m).map(r => <div className="mod-row" key={r.id}><span className="mod-row-ic"><Icon name="code" size={15} /></span><div className="mod-row-text"><b>{r.name}</b><small>{`${modeLabel(r.mode)}${r.scope && r.scope !== 'global' ? t('modules.regex.onlyFor', { name: charName(r.scope) }) : ''}`}</small></div>
        <div className="mod-row-state">{stateBadge('regex', r.id, Mods.regexState(r))}</div>
        <IconBtn ic="edit" title={t('modules.regex.open')} cls="tiny" onClick={() => goTo('regex', r.id)} /><IconBtn ic="x" title={t('modules.removeFromModule')} cls="tiny" onClick={async () => { m.regex = m.regex.filter(i => i !== r.id); await store(); }} /></div>), t('modules.regex.empty'))}</> },
    assets: { label: t('modules.stat.assets'), n: () => m.assetCount || 0, draw: () => <AssetsTab m={m} redraw={redraw} /> },
    quick: { label: t('modules.quickButtons'), n: () => m.quick.length, draw: () => <>
      <div className="row wrap"><Btn label={t('modules.quick.add')} ic="plus" onClick={() => { m.quick.push({ label: '', text: '' }); focusNew.current = true; redraw(); }} /><small className="hint">{t('modules.quick.hint')}</small></div>
      <div className="mod-quick" ref={quickBox}>{m.quick.map((q, i) => <div className="mod-quick-row" key={quickKey(q)}>
        <input className="inp" defaultValue={q.label} placeholder={t('modules.quick.name')} aria-label={t('modules.quick.name')} onChange={e => { q.label = e.target.value.trim(); save(); redraw(); }} />
        <input className="inp" defaultValue={q.text} placeholder={t('modules.quick.textPh')} aria-label={t('modules.quick.text')} spellCheck={false} onChange={e => { q.text = e.target.value; save(); }} />
        <IconBtn ic="x" title={t('modules.quick.remove')} cls="tiny" onClick={async () => { m.quick.splice(i, 1); await store(); }} /></div>)}{!m.quick.length && <p className="dim mod-none">{t('modules.quick.empty')}</p>}</div></> },
    css: { label: 'CSS', n: () => (m.css.trim() ? (m.cssOn ? t('modules.on') : t('modules.off')) : 0), draw: () => <>
      {m.imported && <div className="mod-warn"><Icon name="lock" size={16} /><div><b>{t('modules.css.warnTitle')}</b><span>{t('modules.css.warnBody')}</span></div></div>}
      <label className="mod-switch-line"><Switch checked={m.cssOn} title={t('modules.css.applyTitle')} onChange={async v => { m.cssOn = v; redraw(); await store(); }} /><span>{t('modules.css.apply')}</span><small>{t('modules.css.applyHint')}</small></label>
      <textarea className="inp mod-code" rows={12} spellCheck={false} placeholder=".msg-body { letter-spacing: -0.01em; }" defaultValue={m.css} onChange={e => { m.css = e.target.value; save(); redraw(); }} />
      <small className="hint">{t('modules.css.hint')}</small></> },
  };

  return <section className="mods mod-edit">
    <Btn label={t('modules.backToList')} ic="left" cls="ghost mod-back" onClick={() => go()} />
    <PageHead eyebrow="module" title={m.name.trim() || t('modules.unnamed')}>
      <label className="mod-switch-line"><Switch checked={m.on} title={t('modules.toggle')} onChange={async v => { m.on = v; redraw(); await Mods.save(m); warnOn(m); redraw(); }} /><span>{t('modules.turnOn')}</span></label>
      <Btn label={t('common.export')} ic="upload" title={t('modules.exportTitle')} onClick={() => exportModule(m)} />
      <IconBtn ic="more" title={t('modules.more')} onClick={e => menu(e.currentTarget, [
        { label: t('common.duplicate'), ic: 'copy', onclick: async () => { const c = await Mods.duplicate(m); toast(t('modules.dup.doneShort'), 'ok'); go(c.id); } },
        '-', { label: t('common.delete'), ic: 'trash', danger: true, onclick: () => removeDialog(m, () => go()) }])} />
    </PageHead>
    <div className="card mod-sec"><h3 className="form-sec">{t('modules.sec.info')}</h3>
      <LForm obj={m} defs={[{ k: 'name', label: t('common.name'), half: true }, { k: 'version', label: t('modules.field.version'), third: true, ph: '1.0' }, { k: 'author', label: t('modules.author'), half: true }, { k: 'description', label: t('modules.field.desc'), type: 'area', rows: 3, ph: t('modules.field.descPh') }]}
        onChange={() => { m.name = text(m.name, 120); redraw(); save(); }} /></div>
    <div className="card mod-sec"><h3 className="form-sec">{t('modules.sec.scope')}</h3>
      <label className="field mod-scope-field"><span className="field-label">{t('modules.scope.where')}</span><select className="inp" value={m.scope} onChange={async e => { m.scope = e.target.value as Scope; redraw(); await Mods.save(m); warnOn(m); redraw(); }}>{SCOPES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></label>
      <div className="mod-scope-body">{scopeBody}</div></div>
    <div className="card mod-sec"><h3 className="form-sec">{t('modules.sec.contents')}</h3>
      <div className="tabs mod-tabs">{(Object.entries(TABS) as [TabId, typeof TABS[TabId]][]).map(([id, tb]) => { const n = tb.n(); return <button key={id} type="button" className={'tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{tb.label}{n ? <small className="mod-tab-n">{String(n)}</small> : null}</button>; })}</div>
      <div className="mod-tabbody" key={tab}>{TABS[tab].draw()}</div></div>
  </section>;
}

function Modules({ arg }: { arg?: unknown }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { let alive = true; void Mods.load().then(() => { if (alive) setReady(true); }); return () => { alive = false; }; }, []);
  if (!ready) return null;
  const m = typeof arg === 'string' && arg ? Mods.byId(arg) : undefined;
  return m ? <Editor m={m} key={m.id} /> : <ListView />;
}
