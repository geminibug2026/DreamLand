// 에셋 창: 고르기 메뉴(좁은 화면은 아래에서 올라옴) · 크게 보기 · 갤러리 · 이름 정돈 · 대화 속 그림과 못 찾은 이름
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Icon, IconBtn } from '../kit';
import { usePaged, confirmBox, toast, promptBox } from '../ui';
import { PathIcon, Select, openModal, useRedraw } from '../addons/parts';
import { A, PATHS, TIDY, addAlias, bytesOf, cfg, copy, downloadAsset, extOf, fmtBytes, insertTag, jobState, namePasted, refreshChat, save, setOff, stopJob, tagOf, tidyPlan, upload, whoOf, type AssetRec, type Src, type TidyOpt } from './logic';
import { assetOwners } from '../chat/actions';
import { clamp } from '../lib/core';
import { t } from '../i18n';

export function SBtn({ label, d, onClick, cls = '', title = '' }: { label?: string; d: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; cls?: string; title?: string }) {
  return <button type="button" className={`btn ${cls}`.trim()} title={title || undefined} onClick={onClick}><PathIcon d={d} />{label && <span>{label}</span>}</button>;
}
export function Tiny({ title, onClick, cls = '', children }: { title: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; cls?: string; children: ReactNode }) {
  return <button type="button" className={`ibtn tiny ${cls}`.trim()} title={title} aria-label={title} onClick={onClick}>{children}</button>;
}

// ════════ 고르기 메뉴 ════════
// 넓은 화면은 누른 단추 옆에, 좁은 화면(휴대폰)은 아래에서 올라오는 시트로. 창(#modals) 위에 떠서 뒤의 창을 닫지 않는다
export interface SheetItem { label: string; ic?: string; d?: string; hint?: string; danger?: boolean; off?: boolean; run(): void }
let closeSheet: (() => void) | null = null;
export function sheet(anchor: Element | null, items: (SheetItem | '-' | false | null | undefined)[], title = '', onCancel?: () => void) {
  closeSheet?.(); let chosen = false;
  const wrap = document.createElement('div'); wrap.className = 'ast-sheet-wrap';
  const root = createRoot(wrap), list = items.filter((x): x is SheetItem | '-' => !!x);
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const bs = [...wrap.querySelectorAll<HTMLButtonElement>('.ast-sheet-item:not([disabled])')], i = bs.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
  };
  const close = () => { if (closeSheet === close) closeSheet = null; document.removeEventListener('keydown', key, true); wrap.remove(); setTimeout(() => root.unmount()); if (anchor instanceof HTMLElement && anchor.isConnected) anchor.focus({ preventScroll: true }); if (!chosen) onCancel?.(); };
  flushSync(() => root.render(<div className="ast-sheet" role="menu" aria-label={title || undefined}>
    {title ? <div className="ast-sheet-title">{title}</div> : null}
    {list.map((it, i) => it === '-' ? <hr key={i} /> : <button key={i} type="button" role="menuitem" className={'ast-sheet-item' + (it.danger ? ' danger' : '')} disabled={it.off} onClick={() => { chosen = true; close(); it.run(); }}>
      {it.d ? <PathIcon d={it.d} size={17} /> : <Icon name={it.ic || 'sparkle'} size={17} />}<span><b>{it.label}</b>{it.hint ? <small>{it.hint}</small> : null}</span></button>)}
    <button type="button" className="ast-sheet-x" onClick={() => close()}>{t('common.close')}</button>
  </div>));
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  (document.getElementById('modals') || document.body).append(wrap); document.addEventListener('keydown', key, true);
  const box = wrap.firstElementChild as HTMLElement;
  if (anchor && innerWidth > 640) {
    const r = anchor.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = clamp(r.right - w, 8, innerWidth - w - 8) + 'px'; box.style.top = (r.bottom + 6 + h <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
  }
  box.querySelector<HTMLElement>('.ast-sheet-item:not([disabled])')?.focus({ preventScroll: true });
  closeSheet = close;
}

// ════════ 크게 보기 ════════
export interface LbItem { name: string; src: string; id?: string }
const lbOf = (a: AssetRec): LbItem => ({ name: a.name, src: A().url(a), id: a.id });
function Lb({ items, index, close, after }: { items: LbItem[]; index: number; close: () => void; after?: () => void }) {
  const [i, setI] = useState(Math.max(0, Math.min(index, items.length - 1))), [full, setFull] = useState(false), [px, setPx] = useState(''), many = items.length > 1, it = items[i];
  const rec = it.id ? A().find(it.id) : null, who = rec ? whoOf(rec.owner) : null;
  const step = (d: number) => { setI(x => (x + d + items.length) % items.length); setFull(false); setPx(''); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('.ast-sheet-wrap')) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft' && many) step(-1); else if (e.key === 'ArrowRight' && many) step(1); else return;
      e.preventDefault(); e.stopPropagation();
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (many) { const n = items[(i + 1) % items.length]; if (n) new Image().src = n.src; } }, [i, items, many]);
  // 손가락으로 넘기기 (원본 크기로 보는 중에는 끈다)
  const x0 = useRef<[number, number] | null>(null);
  const meta = [px, rec ? fmtBytes(bytesOf(rec.data)) : '', rec ? extOf(rec.data).toUpperCase() : '', who?.name || '', rec?.disabled ? t('common.off') : ''].filter(Boolean).join(' · ');
  return <>
    <header className="ast-lb-bar">
      {many ? <span className="ast-lb-count fx-num">{`${i + 1} / ${items.length}`}</span> : null}
      <IconBtn ic="copy" title={t('assets.copyTag')} onClick={() => void copy(tagOf(it), t('assets.copiedTag', { tag: tagOf(it) }))} />
      {rec ? <button type="button" className="ibtn" title={t('assets.insert')} aria-label={t('assets.insert')} onClick={() => { insertTag(rec); close(); after?.(); }}><PathIcon d={PATHS.insert} /></button> : null}
      {rec ? <button type="button" className="ibtn" title={t('assets.download')} aria-label={t('assets.download')} onClick={() => downloadAsset(rec)}><PathIcon d={PATHS.down} /></button> : null}
      <IconBtn ic="x" title={t('assets.lb.close')} onClick={close} />
    </header>
    <div className="ast-lb-title"><b>{it.name}</b><small>{meta}</small></div>
    <div className={'ast-lb-stage' + (full ? ' full' : '')} onClick={e => { if (e.target === e.currentTarget) close(); }}
      onPointerDown={e => { if (e.pointerType !== 'mouse' && !full) x0.current = [e.clientX, e.clientY]; }}
      onPointerUp={e => { const s = x0.current; x0.current = null; if (!s || !many) return; const dx = e.clientX - s[0], dy = e.clientY - s[1]; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1); }}
      onPointerCancel={() => { x0.current = null; }}>
      <img src={it.src} alt={it.name} title={t(full ? 'assets.lb.fit' : 'assets.lb.full')} onLoad={e => setPx(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} onClick={() => setFull(f => !f)} />
    </div>
    {many ? <><IconBtn ic="left" title={t('assets.lb.prev')} cls="ast-lb-nav prev" onClick={() => step(-1)} /><IconBtn ic="right" title={t('assets.lb.next')} cls="ast-lb-nav next" onClick={() => step(1)} /></> : null}
  </>;
}
/** 크게 보기: 해상도 · 크기 · 형식, 태그 복사 · 입력창에 넣기 · 받기, ←/→ · 밀어서 넘기기, 그림을 누르면 원본 크기 */
export function lightbox(items: LbItem[], index = 0, after?: () => void) {
  if (!items.length) return;
  const wrap = document.createElement('div'); wrap.className = 'ast-lb'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  const root = createRoot(wrap);
  const close = () => { wrap.remove(); setTimeout(() => root.unmount(), 0); };
  (document.getElementById('modals') || document.body).append(wrap);
  root.render(<Lb items={items} index={index} close={close} after={after} />);
}
export const zoomAssets = (list: AssetRec[], a: AssetRec, after?: () => void) => lightbox(list.map(lbOf), Math.max(0, list.indexOf(a)), after);
/** 대화 속 에셋 그림을 누르면 크게 · 못 찾은 이름표를 누르면 비슷한 에셋을 골라 별칭으로 */
export function watchChatImages() {
  document.addEventListener('click', e => {
    const el = e.target as Element | null;
    const miss = el?.closest?.<HTMLElement>('.msg-body .asset-miss, .ast-live .asset-miss');
    if (miss) { e.preventDefault(); return void missSheet(miss, miss.dataset.miss || ''); }
    const img = el?.closest?.<HTMLImageElement>('.msg-body .asset-img'); if (!img || cfg().zoom === false) return;
    const all = [...img.closest('.msg-body')!.querySelectorAll<HTMLImageElement>('.asset-img')];
    lightbox(all.map(x => ({ name: x.alt || '', src: x.src, id: x.dataset.asset })), all.indexOf(img));
  });
}
function missSheet(anchor: Element, name: string) {
  const owners = anchor.closest('.ast-live') ? previewOwners() : assetOwners(), cand = A().suggest(owners, name, 4);
  sheet(anchor, [
    ...cand.map(a => ({ label: t('assets.miss.use', { name: a.name }), hint: t('assets.miss.useHint', { alias: name }), d: PATHS.at, run: async () => { const skip = await addAlias(a, name); toast(skip ? t('assets.alias.clash') : t('assets.miss.added', { alias: name, name: a.name }), skip ? '' : 'ok'); } })),
    !cand.length && { label: t('assets.miss.none'), ic: 'search', off: true, run: () => { } },
    '-', { label: t('assets.copyTag'), ic: 'copy', run: () => void copy(`{{img::${name}}}`, t('assets.tagCopied')) },
  ], t('assets.miss.title', { name }));
}
/** 렌더링 탭의 미리 보기가 쓰는 보관함 (Studio 가 채운다) */
let previewOwners: () => string[] = () => [];
export const setPreviewOwners = (f: () => string[]) => { previewOwners = f; };

// ════════ 갤러리 ════════
interface GalleryOpt { start?: string; onChange?: () => void }
/** 여러 보관함(멤버 · 페르소나)을 오가며 본다: 찾기 · 크기 · 고르기(끄기 · 켜기 · 삭제) · 끌어다 놓아 올리기 · 그림 위 단추(넣기 · 복사 · 켜기) */
function Gallery({ srcs, start, onChange = () => { }, close }: { srcs: Src[]; close: () => void } & GalleryOpt) {
  const c = cfg(), As = A(), redraw = useRedraw(), picked = useRef(new Set<string>()).current;
  const [which, setWhich] = useState(start && srcs.some(s => s.owner === start) ? start : srcs.length > 1 && srcs.filter(s => s.owner.startsWith('char:')).length > 1 ? '#all' : srcs[0]?.owner || '');
  const [q, setQ] = useState(''), [size, setSize] = useState(c.ui.grid || 'medium'), [selecting, setSelecting] = useState(false), [over, setOver] = useState(false);
  const shownSrcs = which === '#all' ? srcs.filter(s => s.owner.startsWith('char:')) : srcs.filter(s => s.owner === which), one = shownSrcs.length === 1 ? shownSrcs[0] : null;
  const srcOfRec = (a: AssetRec) => shownSrcs.find(s => s.src === a.owner);
  const all = shownSrcs.flatMap(s => As.inVer(s.src, s.ver)), shown = all.filter(a => !q || a.name.includes(q) || a.aliases?.some(x => x.includes(q)));
  for (const id of [...picked]) if (!all.some(a => a.id === id)) picked.delete(id);
  const pg = usePaged(shown, { id: 'assetGallery', perPage: 60, sizes: [30, 60, 120, 240], resetKey: `${which}|${q}` });
  const changed = () => { redraw(); onChange(); };
  const locked = (list: AssetRec[]) => { if (list.some(a => srcOfRec(a)?.locked)) { toast(t('assets.gal.locked')); return true; } return false; };
  const hit = () => all.filter(a => picked.has(a.id));
  const del = async () => {
    const list = hit(); if (!list.length) return toast(t('assets.gal.pickFirst')); if (locked(list)) return;
    if (!(await confirmBox(t('assets.deletePickedAsk', { count: list.length }), t('common.delete'), true))) return;
    for (const a of list) await As.remove(a);
    picked.clear(); refreshChat(); toast(t('assets.gal.deleted', { count: list.length }), 'ok'); changed();
  };
  const flip = async (off: boolean) => { const list = hit(); if (!list.length) return toast(t('assets.pickFirst')); await setOff(list, off); toast(t(off ? 'assets.mgr.bulkOff' : 'assets.mgr.bulkOn', { count: list.length }), 'ok'); changed(); };
  const add = async (files: File[]) => {
    if (!one) return toast(t('assets.gal.pickOne')); if (one.locked) return toast(t('assets.gal.locked'));
    if (await upload(one.owner, one.ver, files)) changed();
  };
  const onGrid = (e: MouseEvent<HTMLDivElement>) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-act]'), item = (e.target as Element).closest<HTMLElement>('[data-id]'); if (!item) return;
    const a = all.find(x => x.id === item.dataset.id); if (!a) return;
    if (selecting) { if (picked.has(a.id)) picked.delete(a.id); else picked.add(a.id); return redraw(); }
    const act = b?.dataset.act;
    if (act === 'insert') { insertTag(a); close(); }
    else if (act === 'copy') void copy(tagOf(a), t('assets.copiedTag', { tag: tagOf(a) }));
    else if (act === 'toggle') { if (!locked([a])) void setOff([a], !a.disabled).then(changed); }
    else zoomAssets(shown, a, close);
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const fs = [...e.dataTransfer.files]; if (fs.length) void add(fs); };
  return <div className={'ast-galbox' + (over ? ' over' : '')} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }} onDragLeave={e => { if (e.currentTarget === e.target) setOver(false); }} onDrop={drop}
    onPaste={async e => { const fs = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (!fs.length) return; e.preventDefault(); const named = await namePasted(fs, s => promptBox(t('assets.up.pasteAsk'), s)); if (named) void add(named); }}>
    <div className="ast-gal-filter">
      {srcs.length > 1 ? <Select value={which} cls="ast-gal-src" opts={[...(srcs.filter(s => s.owner.startsWith('char:')).length > 1 ? [['#all', t('assets.gal.allMembers')] as const] : []), ...srcs.map(s => [s.owner, s.owner.startsWith('persona:') ? t('assets.gal.personaOf', { name: s.label }) : s.label] as const)]} onChange={v => { setWhich(v); picked.clear(); }} /> : null}
      <div className="search-wrap"><Icon name="search" size={16} /><input className="inp" placeholder={t('assets.gal.searchPh')} onChange={e => setQ(e.target.value.trim().toLowerCase())} /></div>
      <div className="ast-seg" role="radiogroup" aria-label={t('assets.gal.size')}>{(['small', 'medium', 'large'] as const).map((s, i) => <button key={s} type="button" role="radio" aria-checked={size === s} className={size === s ? 'on' : undefined} onClick={() => { setSize(s); c.ui.grid = s; save(); }}>{'SML'[i]}</button>)}</div>
      <button type="button" className={'ibtn ast-gal-sel' + (selecting ? ' on' : '')} aria-pressed={selecting} title={t('assets.gal.selectMode')} aria-label={t('assets.gal.selectMode')} onClick={() => { picked.clear(); setSelecting(!selecting); }}><PathIcon d={PATHS.checks} /></button>
    </div>
    {selecting ? <div className="ast-bulk">
      <label className="check"><input type="checkbox" checked={shown.length > 0 && shown.every(a => picked.has(a.id))} onChange={e => { shown.forEach(a => e.target.checked ? picked.add(a.id) : picked.delete(a.id)); redraw(); }} /><i /><span>{t('assets.mgr.picked', { count: picked.size })}</span></label>
      <div className="ast-bulk-acts">
        <Tiny title={t('assets.mgr.enablePicked')} onClick={() => void flip(false)}><Icon name="eye" size={16} /></Tiny>
        <Tiny title={t('assets.mgr.disablePicked')} onClick={() => void flip(true)}><Icon name="eyeoff" size={16} /></Tiny>
        <Tiny title={t('assets.deletePicked')} cls="bad" onClick={() => void del()}><Icon name="trash" size={16} /></Tiny>
      </div>
    </div> : null}
    <div className={'ast-gal ' + size + (selecting ? ' selecting' : '')} ref={pg.listRef} onClick={onGrid}>
      {shown.length ? pg.rows.map(a => <div key={a.id} data-id={a.id} className={'ast-gal-item' + (picked.has(a.id) ? ' picked' : '') + (a.disabled ? ' off' : '')}>
        <button type="button" className="ast-gal-img" data-act="open" title={a.name} aria-label={t('assets.zoomOf', { name: a.name })}><img src={As.url(a)} alt="" loading="lazy" decoding="async" /></button>
        <i className="ast-gal-mark" aria-hidden="true" />
        {selecting ? null : <span className="ast-gal-acts">
          <button type="button" className="ibtn" data-act="insert" title={t('assets.insert')} aria-label={t('assets.insert')}><PathIcon d={PATHS.insert} size={15} /></button>
          <button type="button" className="ibtn" data-act="copy" title={t('assets.copyTag')} aria-label={t('assets.copyTag')}><PathIcon d={PATHS.tag} size={15} /></button>
          <button type="button" className="ibtn" data-act="toggle" title={a.disabled ? t('assets.enable') : t('assets.disable')} aria-label={a.disabled ? t('assets.enable') : t('assets.disable')}><Icon name={a.disabled ? 'eyeoff' : 'eye'} size={15} /></button>
        </span>}
        <span className="ast-gal-cap" title={a.name}>{a.name}{a.aliases?.length ? <em>{`@${a.aliases.length}`}</em> : null}</span>
      </div>) : <p className="dim ast-empty">{q ? t('assets.noMatch') : t('assets.gal.emptyDrop')}</p>}
    </div>
    {pg.pager}
  </div>;
}
export function openGallery(srcs: Src[], title: string, o: GalleryOpt = {}) {
  if (!srcs.length) return toast(t('assets.cmd.noChar'));
  void A().load(srcs.flatMap(s => [s.owner, s.src])).then(() => openModal({ title, wide: true, spec: 'div.ast-galhost' }, close => <Gallery srcs={srcs} {...o} close={close} />));
}

// ════════ 이름 정돈 ════════
function Tidy({ list, o }: { list: AssetRec[]; o: TidyOpt }) {
  const redraw = useRedraw(), p = tidyPlan(list, o), ok = p.filter(x => !x.clash).length;
  return <>
    <p className="hint">{t('assets.tidy.desc')}</p>
    {TIDY.map(([k, label, hint]) => <label key={k} className={'check ast-tidy-opt' + (k === 'dot' || k === 'bare' ? ' key' : '')}><input type="checkbox" checked={o[k]} onChange={e => { o[k] = e.target.checked; redraw(); }} /><i /><span><strong>{t(label)}</strong><small>{t(hint)}</small></span></label>)}
    <div className="ast-tidy-sum"><b>{p.length ? t('assets.tidy.changed', { count: ok }) + (p.length - ok ? t('assets.tidy.skipped', { count: p.length - ok }) : '') : t('assets.tidy.nothing')}</b><small>{t('assets.tidy.safe')}</small></div>
    <div className="ast-tidy-list">
      {p.slice(0, 60).map(x => <div key={x.a.id} className={'ast-tidy-row' + (x.clash ? ' clash' : '')}><span>{x.a.name}</span><i>→</i><span>{x.n}</span></div>)}
      {p.length > 60 ? <div className="ast-tidy-row more">{t('assets.tidy.more', { count: p.length - 60 })}</div> : null}
    </div>
  </>;
}
export function smartRename(owner: string, ver: string, onDone: () => void) {
  const list = A().inVer(owner, ver);
  if (!list.length) return toast(t('assets.tidy.none'));
  const o = Object.fromEntries(TIDY.map(([k, , , d]) => [k, d])) as TidyOpt;
  openModal({ title: t('assets.tidy.title'), spec: 'div.ast-tidy', actions: [{ label: t('common.cancel') }, { label: t('common.apply'), cls: 'primary', onclick: async () => {
    // 이름만 고쳐 같은 줄에 다시 쓴다: 새 이름을 쓰는 한 번의 저장이라 도중에 그림이 사라지지 않고, 별칭 · 꺼짐도 그대로
    const p = tidyPlan(A().inVer(owner, ver), o).filter(x => !x.clash); let n = 0;
    for (const x of p) { try { await A().update({ ...x.a, name: x.n }); n++; } catch (e) { console.warn('[이름 정돈]', e); } }
    toast(n ? t('assets.tidy.done', { count: n }) : t('assets.tidy.noneChanged'), n ? 'ok' : ''); refreshChat(); onDone();
  } }] }, () => <Tidy list={list} o={o} />);
}

// ════════ 진행 막대 ════════
export function UpProgress() {
  const j = useSyncExternalStore(jobState.sub, jobState.get);
  if (!j) return null;
  const p = j.total ? Math.round(j.done / j.total * 100) : 0;
  return <div className={'ast-job' + (j.end ? ' end' : '')} role="status" aria-live="polite">
    <div className="ast-job-top"><b>{j.end || j.label}</b><span className="fx-num">{`${j.done} / ${j.total}`}{j.fail ? <em>{t('assets.up.failN', { count: j.fail })}</em> : null}</span>
      {!j.end ? <button type="button" className="btn ghost" disabled={j.stop} onClick={stopJob}>{j.stop ? t('assets.up.stopping') : t('assets.up.stop')}</button> : null}</div>
    <div className="fx-meter acc" style={{ '--p': p / 100 } as CSSProperties} />
  </div>;
}
