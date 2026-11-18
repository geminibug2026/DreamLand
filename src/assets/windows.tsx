// 에셋 창: 크게 보기 · 갤러리 · 이름 정돈
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon, IconBtn } from '../kit';
import { usePaged, confirmBox, toast } from '../ui';
import { PathIcon, Select, openModal, useRedraw } from '../addons/parts';
import { A, PATHS, TIDY, cfg, copy, save, tidyPlan, type TidyOpt } from './logic';
import { t } from '../i18n';

export function SBtn({ label, d, onClick, cls = '', title = '' }: { label?: string; d: string; onClick: () => void; cls?: string; title?: string }) {
  return <button type="button" className={`btn ${cls}`.trim()} title={title || undefined} onClick={onClick}><PathIcon d={d} />{label && <span>{label}</span>}</button>;
}
export function Tiny({ title, onClick, cls = '', children }: { title: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; cls?: string; children: ReactNode }) {
  return <button type="button" className={`ibtn tiny ${cls}`.trim()} title={title} aria-label={title} onClick={onClick}>{children}</button>;
}

// ════════ 크게 보기 ════════
interface LbItem { name: string; data: string }
function Lb({ items, index, tag, wrap, close }: { items: LbItem[]; index: number; tag: boolean; wrap: HTMLElement; close: () => void }) {
  const [i, setI] = useState(Math.max(0, index)), many = items.length > 1, a = items[i];
  const step = (d: number) => setI(x => (x + d + items.length) % items.length);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); else return;
      e.preventDefault(); e.stopPropagation();
    };
    const click = (e: globalThis.MouseEvent) => { if (e.target === wrap || (e.target as Element).tagName === 'FIGURE') close(); };
    let x0: number | null = null;
    const ts = (e: TouchEvent) => { x0 = e.touches[0].clientX; };
    const te = (e: TouchEvent) => { if (x0 == null || !many) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); };
    document.addEventListener('keydown', key, true); wrap.addEventListener('click', click);
    wrap.addEventListener('touchstart', ts, { passive: true }); wrap.addEventListener('touchend', te);
    return () => { document.removeEventListener('keydown', key, true); wrap.removeEventListener('click', click); wrap.removeEventListener('touchstart', ts); wrap.removeEventListener('touchend', te); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>
    <IconBtn ic="x" title={t('assets.lb.close')} cls="ast-lb-x" onClick={close} />
    {many && <IconBtn ic="left" title={t('assets.lb.prev')} cls="ast-lb-nav prev" onClick={() => step(-1)} />}
    <figure><img src={a.data} alt={a.name} /><figcaption><b>{a.name}</b><span>{`${i + 1} / ${items.length}`}</span>
      {tag && <Tiny title={t('assets.copyTag')} onClick={e => { e.stopPropagation(); void copy(`{{img::${a.name}}}`, t('assets.tagCopied')); }}><PathIcon d={PATHS.tag} size={14} /></Tiny>}</figcaption></figure>
    {many && <IconBtn ic="right" title={t('assets.lb.next')} cls="ast-lb-nav next" onClick={() => step(1)} />}
  </>;
}
export function lightbox(items: LbItem[], index = 0, { tag = true }: { tag?: boolean } = {}) {
  if (!items.length) return;
  const wrap = document.createElement('div'); wrap.className = 'ast-lb';
  const root = createRoot(wrap);
  const close = () => { wrap.remove(); setTimeout(() => root.unmount(), 0); };
  (document.getElementById('modals') || document.body).append(wrap);
  root.render(<Lb items={items} index={index} tag={tag} wrap={wrap} close={close} />);
}
/** 대화 속 에셋 그림을 누르면 크게 */
export function watchChatImages() {
  document.addEventListener('click', e => {
    const img = (e.target as Element | null)?.closest?.<HTMLImageElement>('.msg-body .asset-img'); if (!img || cfg().zoom === false) return;
    const all = [...img.closest('.msg-body')!.querySelectorAll<HTMLImageElement>('.asset-img')];
    lightbox(all.map(x => ({ name: x.alt || '', data: x.src })), all.indexOf(img), { tag: false });
  });
}

// ════════ 갤러리 ════════
interface GalleryOpt { locked?: boolean; onChange?: () => void }
function Gallery({ owner, ver, locked = false, onChange = () => { } }: GalleryOpt & { owner: string; ver: string }) {
  const c = cfg(), redraw = useRedraw(), picked = useRef(new Set<string>()).current;
  const [q, setQ] = useState(''), [size, setSize] = useState(c.ui.grid || 'medium'), [selecting, setSelecting] = useState(false);
  const shown = A().inVer(owner, ver).filter(a => !q || a.name.includes(q));
  const pg = usePaged(shown, { id: 'assetGallery', perPage: 60, sizes: [30, 60, 120, 240], resetKey: `${owner}|${ver}|${q}` });
  const del = async () => {
    const hit = A().inVer(owner, ver).filter(a => picked.has(a.id)); if (!hit.length) return toast(t('assets.gal.pickFirst'));
    if (!(await confirmBox(t('assets.deletePickedAsk', { count: hit.length }), t('common.delete'), true))) return;
    for (const a of hit) await A().remove(a);
    picked.clear(); toast(t('assets.gal.deleted', { count: hit.length }), 'ok'); redraw(); onChange();
  };
  return <>
    <div className="ast-gal-filter">
      <div className="search-wrap"><Icon name="search" size={16} /><input className="inp" placeholder={t('assets.gal.searchPh')} onChange={e => setQ(e.target.value.trim().toLowerCase())} /></div>
      <Select value={size} opts={[['small', 'S'], ['medium', 'M'], ['large', 'L']]} cls="auto" onChange={v => { setSize(v); c.ui.grid = v; save(); }} />
      <button type="button" className={'ibtn ast-gal-sel' + (selecting ? ' on' : '')} title={t('assets.gal.selectMode')} onClick={() => { if (locked) return toast(t('assets.gal.locked')); picked.clear(); setSelecting(!selecting); }}><PathIcon d={PATHS.checks} /></button>
      <button type="button" className="btn danger ast-gal-del" title={t('assets.deletePicked')} style={selecting ? undefined : { display: 'none' }} onClick={() => void del()}><Icon name="trash" /><b>{String(picked.size)}</b></button>
    </div>
    <div className={'ast-gal ' + size + (selecting ? ' selecting' : '')} ref={pg.listRef}>
      {shown.length ? pg.rows.map((a, i) => <button key={a.id} type="button" className={'ast-gal-item' + (picked.has(a.id) ? ' picked' : '') + (a.disabled ? ' off' : '')} title={a.name}
        onClick={() => { if (selecting) { if (picked.has(a.id)) picked.delete(a.id); else picked.add(a.id); redraw(); } else lightbox(shown, pg.start + i); }}>
        <span className="ast-gal-img"><img src={a.data} alt={a.name} loading="lazy" /></span><span className="ast-gal-cap">{a.name}</span><i className="ast-gal-mark" /></button>)
        : <p className="dim ast-empty">{q ? t('assets.noMatch') : t('assets.gal.empty')}</p>}
    </div>
    {pg.pager}
  </>;
}
export function openGallery(owner: string, ver: string, title: string, o: GalleryOpt = {}) {
  openModal({ title, wide: true, spec: 'div.ast-galbox' }, () => <Gallery owner={owner} ver={ver} {...o} />);
}

// ════════ 이름 정돈 ════════
function Tidy({ owner, ver, o }: { owner: string; ver: string; o: TidyOpt }) {
  const redraw = useRedraw(), p = tidyPlan(A().inVer(owner, ver), o), ok = p.filter(x => !x.clash).length;
  return <>
    <p className="hint">{t('assets.tidy.desc')}</p>
    {TIDY.map(([k, label, hint]) => <label key={k} className={'check ast-tidy-opt' + (k === 'dot' || k === 'bare' ? ' key' : '')}><input type="checkbox" checked={o[k]} onChange={e => { o[k] = e.target.checked; redraw(); }} /><i /><span><strong>{t(label)}</strong><small>{t(hint)}</small></span></label>)}
    <div className="ast-tidy-sum"><b>{p.length ? t('assets.tidy.changed', { count: ok }) + (p.length - ok ? t('assets.tidy.skipped', { count: p.length - ok }) : '') : t('assets.tidy.nothing')}</b></div>
    <div className="ast-tidy-list">
      {p.slice(0, 40).map(x => <div key={x.a.id} className={'ast-tidy-row' + (x.clash ? ' clash' : '')}><span>{x.a.name}</span><i>→</i><span>{x.n}</span></div>)}
      {p.length > 40 ? <div className="ast-tidy-row more">{t('assets.tidy.more', { count: p.length - 40 })}</div> : null}
    </div>
  </>;
}
export function smartRename(owner: string, ver: string, onDone: () => void) {
  const list = A().inVer(owner, ver);
  if (!list.length) return toast(t('assets.tidy.none'));
  const o = Object.fromEntries(TIDY.map(([k, , , d]) => [k, d])) as TidyOpt;
  openModal({ title: t('assets.tidy.title'), spec: 'div.ast-tidy', actions: [{ label: t('common.cancel') }, { label: t('common.apply'), cls: 'primary', onclick: async () => {
    const p = tidyPlan(list, o).filter(x => !x.clash); let n = 0;
    for (const x of p) { try { await A().update({ ...x.a, name: x.n }); n++; } catch (e) { console.warn('[이름 정돈]', e); } }
    toast(n ? t('assets.tidy.done', { count: n }) : t('assets.tidy.noneChanged'), n ? 'ok' : ''); onDone();
  } }] }, () => <Tidy owner={owner} ver={ver} o={o} />);
}
