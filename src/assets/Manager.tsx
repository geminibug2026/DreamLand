// 에셋 관리판 (캐릭터 · 페르소나 공용)
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Btn, Icon } from '../kit';
import { usePaged, confirmBox, promptBox, toast } from '../ui';
import type { AssetRec } from '../addons/types';
import { Check, PathIcon, useRedraw } from '../addons/parts';
import { A, PATHS, cfg, copy, safeDecode, save, upload, uploadFromUrl } from './logic';
import { SBtn, Tiny, lightbox, openGallery, smartRename } from './windows';
import { pickFiles } from '../lib/core';
import { t } from '../i18n';

export function Sec({ ic, title, desc, children }: { ic?: ReactNode; title: string; desc?: ReactNode; children?: ReactNode }) {
  return <div className="ast-sec-head"><div><h4>{ic}{title}</h4>{desc ? <p>{desc}</p> : null}</div>{children ? <div className="ast-actions">{children}</div> : null}</div>;
}

interface Props { owner: string; ver?: string; src?: string; locked?: boolean; lockMsg?: string; title?: string; onChange?: () => void }
export function Manager({ owner, ver = '', src = owner, locked = false, lockMsg = '', title = '', onChange = () => { } }: Props) {
  const c = cfg(), As = A(); title ||= t('assets.title');
  const redraw = useRedraw(), picked = useRef(new Set<string>()).current, [q, setQ] = useState('');
  const prog = useRef<HTMLDivElement>(null), bar = useRef<HTMLElement>(null);
  useEffect(() => { let alive = true; void As.load([owner, src]).then(() => { if (alive) redraw(); }); return () => { alive = false; }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const guard = () => { if (locked) toast(lockMsg || t('assets.locked')); return locked; };
  const changed = () => { redraw(); onChange(); };
  const progress = (n: number, total: number) => { prog.current?.classList.toggle('on', n < total); if (bar.current) bar.current.style.width = Math.round(n / total * 100) + '%'; };
  const add = async (files: File[]) => { if (guard() || !files.length) return; prog.current?.classList.add('on'); if (bar.current) bar.current.style.width = '4%'; try { await upload(owner, ver, files, progress); } finally { prog.current?.classList.remove('on'); } changed(); };
  const rename = async (a: AssetRec) => {
    if (guard()) return;
    const v = await promptBox(t('assets.nameAsk'), a.name); if (v == null) return;
    const name = As.cleanName(v); if (!name || name === a.name) return;
    if (As.inVer(src, ver).some(x => x.name === name)) return toast(t('assets.nameTaken'), 'err');
    await As.update({ ...a, name }); changed();
  };
  const bulk = async (label: string, fn: (a: AssetRec) => Promise<void>, danger = false) => {
    if (guard()) return;
    const hit = As.inVer(src, ver).filter(a => picked.has(a.id)); if (!hit.length) return toast(t('assets.pickFirst'));
    if (danger && !(await confirmBox(t('assets.deletePickedAsk', { count: hit.length }), t('common.delete'), true))) return;
    for (const a of hit) await fn(a);
    if (danger) picked.clear(); toast(t(label, { count: hit.length }), 'ok'); changed();
  };

  const all = As.inVer(src, ver), shown = all.filter(a => !q || a.name.includes(q));
  for (const id of [...picked]) if (!all.some(a => a.id === id)) picked.delete(id);
  const groups = new Map<string, AssetRec[]>(); for (const a of shown) { const b = As.baseOf(a.name); (groups.get(b) || groups.set(b, []).get(b)!).push(a); }
  const pg = usePaged([...groups], { id: 'assetGroups', perPage: 24, sizes: [12, 24, 48, 96], resetKey: `${src}|${ver}|${q}` });

  const fileRow = (a: AssetRec) => <div key={a.id} className={'ast-file' + (a.disabled ? ' off' : '')}>
    <span className="ast-fname" title={a.name}>{a.name}</span>
    <Tiny title={t('assets.copyTag')} onClick={() => void copy(`{{img::${a.name}}}`, t('assets.copiedTag', { tag: `{{img::${a.name}}}` }))}><PathIcon d={PATHS.tag} size={14} /></Tiny>
    <Tiny title={t('common.rename')} onClick={() => void rename(a)}><Icon name="edit" size={14} /></Tiny>
    <Tiny title={a.disabled ? t('assets.enable') : t('assets.disable')} onClick={async () => { if (guard()) return; await As.update({ ...a, disabled: !a.disabled }); changed(); }}><Icon name={a.disabled ? 'eyeoff' : 'eye'} size={14} /></Tiny>
    <Tiny title={t('common.delete')} cls="bad" onClick={async () => { if (guard()) return; if (!(await confirmBox(t('assets.deleteAsk', { name: a.name }), t('common.delete'), true))) return; await As.remove(a); picked.delete(a.id); changed(); }}><Icon name="trash" size={14} /></Tiny>
  </div>;
  const groupCard = (base: string, files: AssetRec[]) => {
    const on = files.filter(a => !a.disabled), first = on[0] || files[0];
    return <div key={base} className={'ast-group' + (on.length ? '' : ' off')}>
      <button type="button" className="ast-thumb" title={t('assets.zoom')} onClick={() => lightbox(files, files.indexOf(first))}><img src={first.data} alt={first.name} loading="lazy" /><span className="ast-count">{`${on.length}/${files.length}`}</span></button>
      <label className="check ast-ghead"><input type="checkbox" checked={files.every(a => picked.has(a.id))} onChange={e => { files.forEach(a => e.target.checked ? picked.add(a.id) : picked.delete(a.id)); redraw(); }} /><i /><span title={base}>{base}</span></label>
      <div className="ast-files">{files.map(fileRow)}</div>
    </div>;
  };

  return <div className="ast-sec">
    <Sec title={title} desc={<span>{t('assets.mgr.desc')}<code>joy.png</code>, <code>street-night.webp</code></span>}>
      <SBtn label="ZIP" d={PATHS.zip} onClick={async () => { if (!guard()) void add(await pickFiles({ accept: '.zip' })); }} />
      <Btn label={t('assets.upload')} ic="upload" onClick={async () => { if (!guard()) void add(await pickFiles({ accept: 'image/png,image/webp,image/gif,image/jpeg', multiple: true })); }} />
      <SBtn label={t('assets.mgr.fromUrl')} d={PATHS.link} onClick={async () => {
        if (guard()) return;
        const url = await promptBox(t('assets.mgr.urlAsk'), '', { placeholder: 'https://…/joy.png' }); if (!url?.trim()) return;
        const label = await promptBox(t('assets.mgr.keyAsk'), As.keyOf(safeDecode(url.split(/[?#]/)[0].split('/').pop() || '')));
        if (label == null) return; if (await uploadFromUrl(owner, ver, url, As.cleanName(label))) changed();
      }} />
      <SBtn label={t('assets.gallery')} d={PATHS.grid} onClick={() => openGallery(src, ver, t('assets.galleryTitle', { name: title }), { locked, onChange: changed })} />
      <SBtn label={t('assets.mgr.tidy')} d={PATHS.broom} title={t('assets.mgr.tidyTip')} onClick={() => { if (!guard()) smartRename(src, ver, changed); }} />
    </Sec>
    <div className="ast-upopts">
      <Check label={t('assets.mgr.webp')} on={c.webp} onChange={v => { c.webp = v; save(); redraw(); }} hint={t('assets.mgr.webpHint')} />
      <Check label={t('assets.mgr.overwrite')} on={c.confirmOverwrite} onChange={v => { c.confirmOverwrite = v; save(); redraw(); }} hint={t('assets.mgr.overwriteHint')} />
    </div>
    {locked ? <div className="ast-lock"><PathIcon d={PATHS.link} size={16} />{lockMsg}</div>
      : <div className="dropzone small ast-drop" onClick={async () => { if (!guard()) void add(await pickFiles({ accept: 'image/png,image/webp,image/gif,image/jpeg,.zip', multiple: true })); }}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('over'); }} onDragLeave={e => e.currentTarget.classList.remove('over')}
        onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('over'); void add([...e.dataTransfer.files]); }}>
        <Icon name="upload" size={22} /><b>{t('assets.mgr.drop')}</b><span>{t('assets.mgr.dropHint')}</span></div>}
    <div className="ast-prog" ref={prog}><i ref={bar} /></div>
    <div className="ast-toolbar">
      <div className="search-wrap"><Icon name="search" size={16} /><input className="inp" placeholder={t('assets.mgr.searchPh')} onChange={e => setQ(e.target.value.trim().toLowerCase())} /></div>
      <div className="ast-toolbar-actions">
        <label className="check ast-all"><input type="checkbox" checked={shown.length > 0 && shown.every(a => picked.has(a.id))} onChange={e => { shown.forEach(a => e.target.checked ? picked.add(a.id) : picked.delete(a.id)); redraw(); }} /><i /><span>{t('assets.mgr.selectAll')}</span></label>
        <span className="ast-selinfo">{picked.size ? t('assets.mgr.picked', { count: picked.size }) : t('assets.mgr.sum', { count: shown.length, keys: groups.size })}</span>
        <Tiny title={t('assets.mgr.enablePicked')} onClick={() => void bulk('assets.mgr.bulkOn', a => As.update({ ...a, disabled: false }))}><Icon name="eye" size={14} /></Tiny>
        <Tiny title={t('assets.mgr.disablePicked')} onClick={() => void bulk('assets.mgr.bulkOff', a => As.update({ ...a, disabled: true }))}><Icon name="eyeoff" size={14} /></Tiny>
        <Btn label={t('assets.deletePicked')} cls="danger" ic="trash" onClick={() => void bulk('assets.mgr.bulkDel', a => As.remove(a), true)} />
      </div>
    </div>
    <div className="ast-grid" ref={pg.listRef}>
      {groups.size ? pg.rows.map(([b, fs]) => groupCard(b, fs)) : <p className="dim ast-empty">{q ? t('assets.noMatch') : locked ? t('assets.mgr.emptyLinked') : t('assets.empty')}</p>}
    </div>
    {pg.pager}
  </div>;
}
