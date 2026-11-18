// 퀵 리플라이: 세트 고르기(PC 왼쪽 목록 · 휴대폰 드롭다운) · 세트 옵션 · 버튼 목록(한 줄씩, 눌러 펼침) · 여러 개 고르기 · 모든 세트 검색 · STscript 시험 창
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { Btn, Icon, IconBtn, useEvents } from '../kit';
import { PageHead, charPicker, confirmBox, menu, promptBox, toast, useDragSort, type MenuItem } from '../ui';
import * as core from '../lib/core';
import { S } from '../lib/core';
import { QR_AUTO, QR_KINDS, QR_SCOPES, newQrItem, newQrSet, qrAddSet, qrClone, qrInline, qrSave, qrStore, qrTransfer, setToStQr, stQrToSet, type QrAuto, type QrItem, type QrSet } from '../lib/qr-data';
import { runItem, runQrScript } from '../stscript/host';
import { t, tn } from '../i18n';

export const page = { name: 'qr', Component: QuickReplies };

let saveTimer = 0;
/** 글을 칠 때마다 저장하지 않고 잠깐 모았다가 */
const saveSoon = () => { clearTimeout(saveTimer); saveTimer = window.setTimeout(qrSave, 400); };
const AUTO_KEYS: (keyof QrAuto)[] = ['open', 'newChat', 'user', 'ai', 'gen', 'start'];
const KIND_IC: Record<QrItem['kind'], string> = { insert: 'edit', send: 'send', script: 'code' };
const PICK_KEY = 'dl.qr.set';
const remember = (id: string) => { try { localStorage.setItem(PICK_KEY, id); } catch { /* 기억 못 해도 된다 */ } };
const recall = () => { try { return localStorage.getItem(PICK_KEY) || ''; } catch { return ''; } };

/** 세트를 고르는 메뉴 (옮기기 · 베끼기). 새 세트도 만들 수 있다 */
function pickTarget(el: Element, from: QrSet | null, done: (to: QrSet) => void) {
  const q = qrStore();
  menu(el, [
    ...q.sets.filter(s => s !== from).map((s): MenuItem => ({ label: s.name, ic: 'folder', hint: String(s.items.length), onclick: () => done(s) })),
    '-',
    { label: t('qr.ux.newSetTarget'), ic: 'plus', onclick: async () => { const name = (await promptBox(t('common.name'), ''))?.trim(); if (!name) return; const s = newQrSet({ name }); q.sets.push(s); done(s); } },
  ]);
}

function QuickReplies({ arg }: { arg?: unknown }) {
  const redraw = useEvents('qr:changed');
  const q = qrStore();
  const want = (arg && typeof arg === 'object' ? arg : {}) as { set?: string; item?: string };
  const [pick, setPick] = useState(() => want.set || recall());
  const [open, setOpen] = useState(want.item || '');
  const [find, setFind] = useState('');
  const [optsOpen, setOptsOpen] = useState(false);
  const set = q.sets.find(s => s.id === pick) || q.sets[0];
  useEffect(() => { if (want.set) { setPick(want.set); setOpen(want.item || ''); } }, [want.set, want.item]);
  const choose = (id: string, item = '') => { setPick(id); setOpen(item); remember(id); };
  const bring = async () => {
    const files = await core.pickFiles({ accept: '.json', multiple: true }); let n = 0, last = '';
    for (const f of files) { try { const s = stQrToSet(JSON.parse(await f.text()), f.name.replace(/\.json$/i, '')); n += qrAddSet(s); last = (q.sets.find(x => x.name === s.name) || s).id; } catch (e) { toast(`${f.name}: ${e instanceof Error ? e.message : String(e)}`, 'err'); } }
    if (files.length) toast(tn('qr.page.imported', n), n ? 'ok' : '');
    if (last) choose(last);
  };
  const addSet = () => { const s = newQrSet(); q.sets.push(s); qrSave(); choose(s.id); };
  const exportSet = (s: QrSet) => core.download(`${s.name}.json`, JSON.stringify(setToStQr(s), null, 4));
  const delSet = async (s: QrSet) => { if (await confirmBox(t('qr.page.deleteSet', { name: s.name }), t('common.delete'), true)) { q.sets = q.sets.filter(x => x !== s); qrSave(); } };
  const moveSet = (from: number, to: number) => { const [s] = q.sets.splice(from, 1); q.sets.splice(to, 0, s); qrSave(); };
  const setsRef = useDragSort<HTMLUListElement>(moveSet);
  return <section className="pagebox qr-page">
    <PageHead eyebrow="quick reply" title={t('qr.page.title')} />
    <p className="hint">{t('qr.page.intro')}</p>
    <div className="row wrap qr-top">
      <label className="qr-find"><Icon name="search" size={15} /><input className="inp" type="search" value={find} placeholder={t('qr.ux.searchAll')} aria-label={t('qr.ux.searchAll')} onChange={e => setFind(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={q.bar !== false} onChange={e => { q.bar = e.target.checked; qrSave(); }} /><i /><span>{t('qr.page.showBar')}</span></label>
    </div>
    {find.trim() ? <Results query={find} go={(s, it) => { setFind(''); choose(s.id, it.id); }} /> : null}
    <div className="qr-split">
      <aside className="qr-sets">
        <div className="row qr-sets-tools">
          <Btn label={t('qr.page.newSet')} ic="plus" cls="primary" onClick={addSet} />
          <IconBtn ic="upload" title={t('qr.page.import')} onClick={() => void bring()} />
        </div>
        <ul ref={setsRef} className="qr-setlist">{q.sets.map(s => <li key={s.id} className={(s === set ? 'on' : '') + (s.on === false ? ' off' : '')}>
          <i className="grip" title={t('qr.ux.dragHint')}><Icon name="grip" size={14} /></i>
          <button type="button" className="qr-setpick" onClick={() => choose(s.id)}>
            <span className="qr-setname">{s.name}</span>
            <small className="qr-count">{s.items.length}</small>
            {s.scope !== 'global' ? <small className="badge">{QR_SCOPES[s.scope]}</small> : null}
          </button>
          <label className="switch" title={t('qr.page.setOn')}><input type="checkbox" checked={s.on !== false} onChange={e => { s.on = e.target.checked; qrSave(); }} /><i /></label>
        </li>)}</ul>
      </aside>
      <div className="qr-main">
        <div className="row qr-picker">
          <select className="inp" value={set?.id || ''} aria-label={t('qr.ux.pickSet')} onChange={e => choose(e.target.value)}>
            {q.sets.map(s => <option key={s.id} value={s.id}>{(s.on === false ? '○ ' : '● ') + s.name + ` (${s.items.length})`}</option>)}
          </select>
          <IconBtn ic="plus" title={t('qr.page.newSet')} onClick={addSet} />
          <IconBtn ic="upload" title={t('qr.page.import')} onClick={() => void bring()} />
          <IconBtn ic="more" title={t('common.more')} onClick={e => { if (!set) return; const i = q.sets.indexOf(set); menu(e.currentTarget, [
            { label: t('common.rename'), ic: 'edit', onclick: async () => { const v = (await promptBox(t('common.name'), set.name))?.trim(); if (v) { set.name = v; qrSave(); } } },
            { label: t('qr.ux.setOptions'), ic: 'sliders', onclick: () => setOptsOpen(true) },
            { label: t('qr.page.export'), ic: 'import', onclick: () => exportSet(set) },
            i > 0 && { label: t('qr.page.moveUp'), ic: 'up', onclick: () => moveSet(i, i - 1) },
            i < q.sets.length - 1 && { label: t('qr.page.moveDown'), ic: 'down', onclick: () => moveSet(i, i + 1) },
            '-',
            { label: t('common.delete'), ic: 'trash', danger: true, onclick: () => void delSet(set) },
          ]); }} />
        </div>
        {set ? <SetEditor key={set.id} set={set} redraw={redraw} open={open} setOpen={setOpen} optsOpen={optsOpen} setOptsOpen={setOptsOpen}
          exportSet={() => exportSet(set)} delSet={() => void delSet(set)} /> : <p className="dim">{t('qr.page.empty')}</p>}
      </div>
    </div>
    <details className="card qr-console-box">
      <summary>{t('qr.page.console')}</summary>
      <Console pick={set} />
    </details>
  </section>;
}

/** 모든 세트에서 이름 · 글 찾기 */
function Results({ query, go }: { query: string; go: (s: QrSet, it: QrItem) => void }) {
  const k = query.trim().toLowerCase();
  const hits = qrStore().sets.flatMap(s => s.items.filter(i => (i.label + '\n' + i.title + '\n' + i.text).toLowerCase().includes(k)).map(it => ({ s, it })));
  const snip = (text: string) => { const i = text.toLowerCase().indexOf(k); return i < 0 ? '' : (i > 30 ? '…' : '') + text.slice(Math.max(0, i - 30), i + 60).replace(/\s+/g, ' '); };
  return <div className="card qr-results">
    <small className="hint">{tn('qr.ux.found', hits.length)}</small>
    {hits.slice(0, 80).map(({ s, it }) => <button key={s.id + it.id} type="button" className="qr-hit" onClick={() => go(s, it)}>
      <b>{it.label}</b><small className="badge">{s.name}</small><span className="qr-snip">{snip(it.text) || snip(it.title)}</span>
    </button>)}
  </div>;
}

function SetEditor({ set, redraw, open, setOpen, optsOpen, setOptsOpen, exportSet, delSet }: {
  set: QrSet; redraw: () => void; open: string; setOpen: (id: string) => void; optsOpen: boolean; setOptsOpen: (v: boolean) => void; exportSet: () => void; delSet: () => void;
}) {
  const [sel, setSel] = useState<Set<string> | null>(null);
  const listRef = useDragSort((from, to) => { const [it] = set.items.splice(from, 1); set.items.splice(to, 0, it); qrSave(); });
  const scrolled = useRef('');
  useEffect(() => {   // 검색 · 편집으로 들어왔으면 그 버튼으로
    if (!open || scrolled.current === open) return; scrolled.current = open;
    requestAnimationFrame(() => document.querySelector(`.qr-row[data-id="${CSS.escape(open)}"]`)?.scrollIntoView({ block: 'nearest' }));
  }, [open]);
  const picked = sel ? set.items.filter(i => sel.has(i.id)) : [];
  const toggle = (id: string) => { if (!sel) return; const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  const bulk = (fn: (it: QrItem) => void) => { picked.forEach(fn); qrSave(); };
  const scopeNote = set.scope === 'char' ? (set.charIds || []).map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || t('qr.page.noChar') : set.scope === 'chat' ? tn('qr.page.chatCount', (set.chatIds || []).length) : '';
  const inline = set.inline === undefined ? 'auto' : set.inline ? 'on' : 'off';
  return <div className={'card qr-card' + (set.on === false ? ' off' : '')}>
    <div className="row qr-head">
      <label className="switch" title={t('qr.page.setOn')}><input type="checkbox" checked={set.on !== false} onChange={e => { set.on = e.target.checked; qrSave(); }} /><i /></label>
      <input className="inp qr-name" value={set.name} aria-label={t('common.name')} onChange={e => { set.name = e.target.value; redraw(); saveSoon(); }} />
      <IconBtn ic="import" title={t('qr.page.export')} onClick={exportSet} />
      <IconBtn ic="trash" title={t('common.delete')} onClick={delSet} />
    </div>
    <details className="qr-opts-box" open={optsOpen} onToggle={e => setOptsOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{t('qr.ux.setOptions')}<small className="hint">{[QR_SCOPES[set.scope], scopeNote].filter(Boolean).join(' · ')}</small></summary>
      <div className="qr-opts-body">
        <label className="check"><input type="checkbox" checked={set.on !== false} onChange={e => { set.on = e.target.checked; qrSave(); }} /><i /><span>{t('qr.page.setOn')}</span></label>
        <div className="row wrap qr-scope-row">
          <span className="qr-lab">{t('qr.page.scope')}</span>
          <select className="inp qr-scope" value={set.scope} aria-label={t('qr.page.scope')} onChange={e => {
            set.scope = e.target.value as QrSet['scope'];
            if (set.scope === 'char') charPicker({ title: t('qr.page.pickChars'), selected: set.charIds || [], onDone: ids => { set.charIds = ids; qrSave(); } });
            qrSave();
          }}>{Object.entries(QR_SCOPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {set.scope === 'char' ? <Btn label={t('qr.page.pickChars')} ic="users" cls="ghost" onClick={() => charPicker({ title: t('qr.page.pickChars'), selected: set.charIds || [], onDone: ids => { set.charIds = ids; qrSave(); } })} /> : null}
          {scopeNote ? <small className="hint">{scopeNote}</small> : null}
        </div>
        {set.scope === 'chat' ? <p className="hint">{t('qr.page.chatScopeHint')}</p> : null}
        <div className="row wrap qr-opts">
          <label className="check" title={t('qr.page.nosendHint')}><input type="checkbox" checked={!!set.nosend} onChange={e => { set.nosend = e.target.checked; for (const it of set.items) if (it.kind !== 'script') it.kind = set.nosend ? 'insert' : 'send'; qrSave(); }} /><i /><span>{t('qr.page.nosend')}</span></label>
          <label className="check" title={t('qr.page.injectHint')}><input type="checkbox" checked={!!set.inject} onChange={e => { set.inject = e.target.checked; qrSave(); }} /><i /><span>{t('qr.page.inject')}</span></label>
          <label className="check" title={t('qr.page.beforeHint')}><input type="checkbox" checked={!!set.before} disabled={!set.inject} onChange={e => { set.before = e.target.checked; qrSave(); }} /><i /><span>{t('qr.page.before')}</span></label>
        </div>
        <div className="row wrap qr-scope-row">
          <span className="qr-lab">{t('qr.ux.onBar')}</span>
          <select className="inp qr-scope" value={inline} aria-label={t('qr.ux.onBar')} onChange={e => { const v = e.target.value; if (v === 'auto') delete set.inline; else set.inline = v === 'on'; qrSave(); }}>
            <option value="auto">{t('qr.ux.inlineAuto', { mode: qrInline({ ...set, inline: undefined }) ? t('qr.ux.inlineOn') : t('qr.ux.inlineOff') })}</option>
            <option value="on">{t('qr.ux.inlineOn')}</option>
            <option value="off">{t('qr.ux.inlineOff')}</option>
          </select>
        </div>
        <label className="check"><input type="checkbox" checked={set.trayClose !== false} onChange={e => { set.trayClose = e.target.checked; qrSave(); }} /><i /><span>{t('qr.ux.trayClose')}</span></label>
      </div>
    </details>
    <div className="row qr-list-tools">
      {sel ? <label className="check qr-all"><input type="checkbox" checked={!!set.items.length && picked.length === set.items.length} onChange={e => setSel(new Set(e.target.checked ? set.items.map(i => i.id) : []))} /><i /><span>{t('qr.ux.selectAll')}</span></label>
        : <small className="hint grow">{tn('qr.ux.count', set.items.length)}</small>}
      <span className="grow" />
      <Btn label={sel ? t('qr.ux.selectDone') : t('qr.ux.select')} ic="check" cls="ghost" onClick={() => setSel(sel ? null : new Set())} />
    </div>
    <div ref={listRef} className={'qr-list' + (sel ? ' selecting' : '')}>
      {set.items.map(it => <ItemRow key={it.id} set={set} it={it} redraw={redraw} open={open === it.id} toggle={() => setOpen(open === it.id ? '' : it.id)}
        sel={sel ? sel.has(it.id) : null} onSel={() => toggle(it.id)} />)}
    </div>
    <Btn label={t('qr.page.newItem')} ic="plus" cls="ghost" onClick={() => { const it = newQrItem(); set.items.push(it); qrSave(); setOpen(it.id); }} />
    {sel ? <div className="qr-bulk">
      <b>{tn('qr.ux.selected', picked.length)}</b>
      <span className="grow" />
      {picked.length ? <>
        <Btn label={t('qr.ux.moveTo')} ic="right" cls="ghost" onClick={e => pickTarget(e.currentTarget, set, to => { qrTransfer(picked, to); setSel(new Set()); toast(t('qr.ux.moved', { n: picked.length, name: to.name }), 'ok'); })} />
        <Btn label={t('qr.ux.copyTo')} ic="copy" cls="ghost" onClick={e => pickTarget(e.currentTarget, set, to => { qrTransfer(picked, to, true); toast(t('qr.ux.copied', { n: picked.length, name: to.name }), 'ok'); })} />
        <IconBtn ic="more" title={t('common.more')} onClick={(e: MouseEvent<HTMLButtonElement>) => menu(e.currentTarget, [
          { label: t('qr.ux.pin'), ic: 'star', onclick: () => bulk(i => { i.pinned = true; }) },
          { label: t('qr.ux.unpin'), ic: 'star', onclick: () => bulk(i => { delete i.pinned; }) },
          { label: t('qr.ux.show'), ic: 'eye', onclick: () => bulk(i => { i.hidden = false; }) },
          { label: t('qr.ux.hide'), ic: 'eyeoff', onclick: () => bulk(i => { i.hidden = true; }) },
          '-',
          { label: t('common.delete'), ic: 'trash', danger: true, onclick: async () => { if (await confirmBox(tn('qr.ux.deleteMany', picked.length), t('common.delete'), true)) { const ids = new Set(picked.map(i => i.id)); set.items = set.items.filter(i => !ids.has(i.id)); setSel(new Set()); qrSave(); } } },
        ])} />
      </> : null}
    </div> : null}
  </div>;
}

function ItemRow({ set, it, redraw, open, toggle, sel, onSel }: { set: QrSet; it: QrItem; redraw: () => void; open: boolean; toggle: () => void; sel: boolean | null; onSel: () => void }) {
  const autos = AUTO_KEYS.filter(k => it.auto?.[k]);
  const edit = (patch: Partial<QrItem>) => { Object.assign(it, patch); redraw(); saveSoon(); };
  const more = (e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); const el = e.currentTarget; menu(el, [
    { label: t('common.duplicate'), ic: 'copy', onclick: () => { set.items.splice(set.items.indexOf(it) + 1, 0, qrClone(it)); qrSave(); } },
    { label: t('qr.ux.moveTo'), ic: 'right', onclick: () => pickTarget(el, set, to => qrTransfer([it], to)) },
    { label: t('qr.ux.copyTo'), ic: 'copy', onclick: () => pickTarget(el, set, to => qrTransfer([it], to, true)) },
    { label: it.pinned ? t('qr.ux.unpin') : t('qr.ux.pin'), ic: 'star', onclick: () => { if (it.pinned) delete it.pinned; else it.pinned = true; qrSave(); } },
    '-',
    { label: t('common.delete'), ic: 'trash', danger: true, onclick: () => { set.items = set.items.filter(x => x !== it); qrSave(); } },
  ]); };
  return <div className={'qr-row' + (open ? ' open' : '') + (it.hidden ? ' hidden-item' : '') + (sel ? ' picked' : '')} data-id={it.id}>
    <div className="qr-row-head" onClick={() => sel !== null ? onSel() : toggle()}>
      {sel !== null ? <label className="check" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel} onChange={onSel} aria-label={it.label} /><i /></label>
        : <i className="grip" title={t('qr.ux.dragHint')} onClick={e => e.stopPropagation()}><Icon name="grip" size={14} /></i>}
      <span className="qr-kind-ic" title={QR_KINDS[it.kind]}><Icon name={KIND_IC[it.kind] || 'edit'} size={14} /></span>
      <span className="qr-row-label">{it.label || '—'}</span>
      {it.pinned ? <small className="badge on" title={t('qr.ux.pinned')}>✦</small> : null}
      {autos.length ? <small className="badge">{t('qr.page.autoBadge', { n: autos.length })}</small> : null}
      {it.hidden ? <small className="badge" title={t('qr.page.hidden')}><Icon name="eyeoff" size={12} /></small> : null}
      {sel === null ? <button type="button" className="ibtn qr-row-more" title={t('common.more')} aria-label={t('common.more')} onClick={more}><Icon name="more" size={16} /></button> : null}
    </div>
    {open && sel === null ? <div className="qr-row-body">
      <div className="row wrap">
        <input className="inp qr-label" value={it.label} aria-label={t('qr.page.label')} placeholder={t('qr.page.label')} onChange={e => edit({ label: e.target.value })} />
        <select className="inp qr-kind" value={it.kind} aria-label={t('qr.page.kind')} onChange={e => edit({ kind: e.target.value as QrItem['kind'] })}>{Object.entries(QR_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <IconBtn ic="play" title={t('qr.page.try')} onClick={() => void runItem(it)} />
      </div>
      <textarea className="inp qr-text code" rows={Math.min(14, Math.max(3, it.text.split('\n').length))} spellCheck={false} value={it.text} aria-label={t('qr.page.text')}
        placeholder={t('qr.page.textPh')} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => edit({ text: e.target.value, ...(it.kind !== 'script' && /^\s*\//.test(e.target.value) ? { kind: 'script' as const } : {}) })} />
      <input className="inp" value={it.title} placeholder={t('qr.page.titlePh')} aria-label={t('qr.page.titlePh')} onChange={e => edit({ title: e.target.value })} />
      <div className="row wrap qr-opts">
        <label className="check"><input type="checkbox" checked={!!it.hidden} onChange={e => edit({ hidden: e.target.checked })} /><i /><span>{t('qr.page.hidden')}</span></label>
        <label className="check"><input type="checkbox" checked={!!it.pinned} onChange={e => { if (e.target.checked) it.pinned = true; else delete it.pinned; qrSave(); }} /><i /><span>{t('qr.ux.pinned')}</span></label>
      </div>
      <p className="hint">{t('qr.page.autoHint')}</p>
      <div className="row wrap qr-opts">{AUTO_KEYS.map(k => <label key={k} className="check"><input type="checkbox" checked={!!it.auto?.[k]} onChange={e => edit({ auto: { ...(it.auto || {}), [k]: e.target.checked } })} /><i /><span>{QR_AUTO[k]}</span></label>)}</div>
      <CtxEditor set={set} it={it} edit={edit} />
    </div> : null}
  </div>;
}

/** 오른쪽 클릭 메뉴: 이 버튼에 이어 둘 세트들 (이어 실행이면 이 버튼 글 | 고른 버튼 글 을 함께 돌린다) */
function CtxEditor({ set, it, edit }: { set: QrSet; it: QrItem; edit: (p: Partial<QrItem>) => void }) {
  const list = it.contextList || [], names = qrStore().sets.map(s => s.name);
  const put = (next: NonNullable<QrItem['contextList']>) => edit({ contextList: next });
  return <div className="qr-ctx">
    <p className="hint">{t('qr.page.ctxHint')}</p>
    {list.map((cl, i) => <div className="row" key={i}>
      <select className="inp" value={cl.set} aria-label={t('qr.page.ctxSet')} onChange={e => put(list.map((x, j) => j === i ? { ...x, set: e.target.value } : x))}>
        {!names.includes(cl.set) ? <option value={cl.set}>{t('qr.page.ctxMissing', { name: cl.set })}</option> : null}
        {names.map(n => <option key={n} value={n}>{n === set.name ? t('qr.page.ctxOwn', { name: n }) : n}</option>)}
      </select>
      <label className="check" title={t('qr.page.chainedHint')}><input type="checkbox" checked={!!cl.isChained} onChange={e => put(list.map((x, j) => j === i ? { ...x, isChained: e.target.checked } : x))} /><i /><span>{t('qr.page.chained')}</span></label>
      <IconBtn ic="trash" title={t('common.delete')} onClick={() => put(list.filter((_x, j) => j !== i))} />
    </div>)}
    <Btn label={t('qr.page.ctxAdd')} ic="plus" cls="ghost" onClick={() => put([...list, { set: names.find(n => n !== set.name) || set.name, isChained: false }])} />
  </div>;
}

/** 스크립트를 바로 돌려 보는 창 (결과 = 마지막 {{pipe}}) */
function Console({ pick }: { pick?: QrSet }) {
  const [src, setSrc] = useState('/pass hello | /upper'), [out, setOut] = useState(''), [busy, setBusy] = useState(false);
  const run = async (debug = false) => { setBusy(true); try { setOut(await runQrScript(src, { debug })); } finally { setBusy(false); } };
  return <div className="qr-console">
    <p className="hint">{t('qr.page.consoleHint')}</p>
    <textarea className="inp code" rows={4} spellCheck={false} value={src} onChange={e => setSrc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void run(); } }} aria-label={t('qr.page.console')} />
    <div className="row wrap"><Btn label={busy ? t('qr.page.running') : t('qr.page.run')} ic="play" cls="primary" onClick={() => void run()} /><Btn label={t('qr.page.debug')} ic="code" cls="ghost" onClick={() => void run(true)} /><Btn label={t('qr.page.saveAsItem')} ic="plus" cls="ghost" onClick={async () => {
      const q = qrStore(); let set = pick || q.sets[0]; if (!set) { set = newQrSet(); q.sets.push(set); }
      const label = (await promptBox(t('qr.page.label'), ''))?.trim(); if (!label) return;
      set.items.push(newQrItem({ label, text: src, kind: /^\s*\//.test(src) ? 'script' : 'send' })); qrSave(); toast(t('qr.page.savedTo', { name: set.name }), 'ok');
    }} /></div>
    <pre className="qr-out">{out || ' '}</pre>
  </div>;
}
