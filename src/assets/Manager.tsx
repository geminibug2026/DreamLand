// 에셋 관리판: 캐릭터 하나 · 페르소나 · 대화 멤버 여럿(멤버마다 접는 칸) 공용
import { useRef, useState, type ClipboardEvent, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { Avatar, Btn, Icon } from '../kit';
import { usePaged, confirmBox, promptBox, toast } from '../ui';
import { Check, PathIcon, Select, useRedraw } from '../addons/parts';
import { A, PATHS, cfg, copy, downloadAsset, exportZip, insertTag, namePasted, refreshChat, safeDecode, save, setAliases, setOff, tagOf, upload, uploadFromUrl, whoOf, type AssetRec, type Src } from './logic';
import { SBtn, Tiny, UpProgress, openGallery, sheet, smartRename, zoomAssets } from './windows';
import { S, pickFiles } from '../lib/core';
import { t } from '../i18n';

export function Sec({ ic, title, desc, children }: { ic?: ReactNode; title: string; desc?: ReactNode; children?: ReactNode }) {
  return <div className="ast-sec-head"><div><h4>{ic}{title}</h4>{desc ? <p>{desc}</p> : null}</div>{children ? <div className="ast-actions">{children}</div> : null}</div>;
}

const IMAGES = 'image/png,image/webp,image/gif,image/jpeg,image/avif';
type Card = { base: string; files: AssetRec[]; shown: AssetRec[]; ts: number };
/** 한 보관함의 카드: 같은 이름 묶음(angry_1, angry_2 …)이 한 장. 찾기는 이름 · 별칭에서, 거르기는 켜짐 · 꺼짐 */
function cardsOf(s: Src, q: string, filter: string, sort: string): Card[] {
  const As = A(), map = new Map<string, Card>();
  for (const a of As.inVer(s.src, s.ver)) {
    const b = As.baseOf(a.name), c = map.get(b) || map.set(b, { base: b, files: [], shown: [], ts: 0 }).get(b)!;
    c.files.push(a); c.ts = Math.max(c.ts, a.ts || 0);
    if ((filter === 'on' && a.disabled) || (filter === 'off' && !a.disabled)) continue;
    if (!q || a.name.includes(q) || a.aliases?.some(x => x.includes(q))) c.shown.push(a);
  }
  const list = [...map.values()].filter(c => c.shown.length), nat = (x: Card, y: Card) => x.base.localeCompare(y.base, undefined, { numeric: true });
  return list.sort(sort === 'recent' ? (x, y) => y.ts - x.ts || nat(x, y) : sort === 'files' ? (x, y) => y.files.length - x.files.length || nat(x, y) : nat);
}

interface View { q: string; filter: string; sort: string; view: string; selecting: boolean; picked: Set<string>; open: Set<string> }
/** 카드 · 목록 한 칸 (보관함 하나). 누르기는 판 전체가 한 곳에서 받는다 (data-act · data-id) */
function Cards({ s, v }: { s: Src; v: View }) {
  const As = A(), cards = cardsOf(s, v.q, v.filter, v.sort);
  const pg = usePaged(cards, { id: 'assetGroups', perPage: v.view === 'list' ? 48 : 24, sizes: [12, 24, 48, 96], resetKey: `${s.src}|${s.ver}|${v.q}|${v.filter}|${v.sort}|${v.view}` });
  if (!cards.length) return <p className="dim ast-empty">{v.q || v.filter !== 'all' ? t('assets.noMatch') : s.locked ? t('assets.mgr.emptyLinked') : t('assets.empty')}</p>;
  const row = (a: AssetRec) => <div key={a.id} className={'ast-file' + (a.disabled ? ' off' : '') + (v.picked.has(a.id) ? ' picked' : '')} data-id={a.id} data-act="pick">
    {v.view === 'list' ? <button type="button" className="ast-mini" data-act="zoom" aria-label={t('assets.zoomOf', { name: a.name })}><img src={As.url(a)} alt="" loading="lazy" decoding="async" /></button> : null}
    <span className="ast-fname" title={a.name}>{a.name}{a.aliases?.length ? <em className="ast-alias" title={a.aliases.join(', ')}>{`@${a.aliases.length}`}</em> : null}</span>
    {v.view === 'list' && a.aliases?.length ? <small className="ast-alist">{a.aliases.join(', ')}</small> : null}
    <button type="button" className="ibtn tiny" data-act="toggle" aria-pressed={!a.disabled} title={a.disabled ? t('assets.enable') : t('assets.disable')} aria-label={(a.disabled ? t('assets.enable') : t('assets.disable')) + ' · ' + a.name}><Icon name={a.disabled ? 'eyeoff' : 'eye'} size={15} /></button>
    <button type="button" className="ibtn tiny" data-act="menu" aria-haspopup="menu" title={t('common.more')} aria-label={t('assets.menuOf', { name: a.name })}><PathIcon d={PATHS.dots} size={16} /></button>
  </div>;
  return <>
    {v.view === 'list' ? <div className="ast-list fx-rows" ref={pg.listRef}>{pg.rows.flatMap(c => c.shown).map(row)}</div>
      : <div className="ast-grid" ref={pg.listRef}>{pg.rows.map(c => {
        const on = c.files.filter(a => !a.disabled), first = on[0] || c.files[0], wide = v.open.has(s.src + '|' + c.base), files = wide ? c.shown : c.shown.slice(0, 4), all = c.shown.every(a => v.picked.has(a.id));
        const solo = c.files.length === 1 && c.files[0].name === c.base;   // 파일 하나뿐인 묶음은 이름을 한 번만
        return <div key={c.base} className={'ast-group' + (on.length ? '' : ' off') + (solo ? ' solo' : '') + (v.selecting && all ? ' picked' : '')} data-card={c.base} data-src={s.src}>
          <button type="button" className="ast-thumb" data-act={v.selecting ? 'card' : 'zoom'} data-id={first.id} aria-label={t('assets.zoomOf', { name: c.base })}>
            <img src={As.url(first)} alt="" loading="lazy" decoding="async" />
            <span className="ast-count fx-num">{c.files.length > 1 ? `${on.length}/${c.files.length}` : on.length ? '' : t('common.off')}</span>
            {v.selecting ? <i className="ast-gal-mark" aria-hidden="true" /> : null}
          </button>
          {solo ? null : <div className="ast-ghead" title={c.base}><b>{c.base}</b></div>}
          <div className="ast-files">{files.map(row)}{c.shown.length > files.length ? <button type="button" className="ast-more" data-act="wide">{t('assets.mgr.moreFiles', { count: c.shown.length - files.length })}</button> : null}</div>
        </div>;
      })}</div>}
    {pg.pager}
  </>;
}

interface Props { srcs: Src[]; onChange?: () => void; tidy?: boolean }
/** 올리기(그림 · ZIP · 주소 · 끌어다 놓기 · 붙여넣기) · 진행 · 찾기 · 거르기 · 정렬 · 카드/목록 · 고르기 · 파일마다 ⋮ */
export function Board({ srcs, onChange = () => { }, tidy = true }: Props) {
  const c = cfg(), As = A(), redraw = useRedraw();
  const picked = useRef(new Set<string>()).current, open = useRef(new Set<string>()).current;
  const [q, setQ] = useState(''), [selecting, setSelecting] = useState(false), [over, setOver] = useState(false);
  const filter = c.ui.filter || 'all', sort = c.ui.sort || 'name', view = c.ui.view || 'card', closed = new Set(c.ui.closed || []);
  const many = srcs.length > 1, free = srcs.filter(s => !s.locked);
  const all = srcs.flatMap(s => As.inVer(s.src, s.ver)), byId = new Map(all.map(a => [a.id, a]));
  for (const id of [...picked]) if (!byId.has(id)) picked.delete(id);
  const srcOfRec = (a: AssetRec) => srcs.find(s => s.src === a.owner);
  const changed = () => { redraw(); onChange(); };
  const setUi = (k: 'filter' | 'sort' | 'view', val: string) => { c.ui[k] = val; save(); redraw(); };
  const guard = (s?: Src) => { if (s?.locked) { toast(t('assets.link.lockMsg', { name: whoOf(s.src)?.name || '' })); return true; } return false; };

  // ── 올리기: 멤버가 여럿이면 누구에게 올릴지 먼저 고른다 ──
  const target = (anchor: Element | null): Promise<Src | null> => new Promise(res => {
    if (!free.length) { toast(srcs[0] ? t('assets.link.lockMsg', { name: whoOf(srcs[0].src)?.name || '' }) : t('assets.locked')); return res(null); }
    if (free.length === 1) return res(free[0]);
    sheet(anchor, free.map(s => ({ label: s.label, ic: s.owner.startsWith('persona:') ? 'user' : 'users', hint: t('assets.studio.count', { count: As.inVer(s.src, s.ver).length }), run: () => res(s) })), t('assets.up.whom'), () => res(null));
  });
  const add = async (files: File[], anchor: Element | null = null) => { if (!files.length) return; const s = await target(anchor); if (!s) return; if (await upload(s.owner, s.ver, files)) changed(); };
  const pick = async (e: MouseEvent<HTMLElement>, accept: string) => { const el = e.currentTarget, s = await target(el); if (!s) return; const fs = await pickFiles({ accept, multiple: true }); if (fs.length && await upload(s.owner, s.ver, fs)) changed(); };
  const fromUrl = async (e: MouseEvent<HTMLElement>) => {
    const s = await target(e.currentTarget); if (!s) return;
    const url = await promptBox(t('assets.mgr.urlAsk'), '', { placeholder: 'https://…/joy.png' }); if (!url?.trim()) return;
    const label = await promptBox(t('assets.mgr.keyAsk'), As.keyOf(safeDecode(url.split(/[?#]/)[0].split('/').pop() || ''))); if (label == null) return;
    if (await uploadFromUrl(s.owner, s.ver, url, As.cleanName(label))) changed();
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files], e.currentTarget); };
  const onPaste = async (e: ClipboardEvent) => {
    if ((e.target as Element).closest('input, textarea')) return;
    const fs = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (!fs.length) return; e.preventDefault();
    const named = await namePasted(fs, s => promptBox(t('assets.up.pasteAsk'), s)); if (named) void add(named);
  };

  // ── 파일 하나 ──
  const rename = async (a: AssetRec) => {
    const v = await promptBox(t('assets.nameAsk'), a.name); if (v == null) return;
    const name = As.cleanName(v); if (!name || name === a.name) return;
    if (As.inVer(a.owner, a.ver || '').some(x => x.id !== a.id && x.name === name)) return toast(t('assets.nameTaken'), 'err');
    await As.update({ ...a, name }); refreshChat(); changed();   // 같은 줄을 고쳐 쓴다: 별칭 · 꺼짐 그대로
  };
  const aliases = async (a: AssetRec) => {
    const v = await promptBox(t('assets.alias.ask', { name: a.name }), (a.aliases || []).join(', '), { placeholder: t('assets.alias.ph') }); if (v == null) return;
    const skip = await setAliases(a, v.split(/[,，、\n]/)); const n = As.find(a.id)?.aliases?.length || 0;
    toast((n ? t('assets.alias.saved', { count: n }) : t('assets.alias.cleared')) + (skip ? ' · ' + t('assets.alias.clash') : ''), 'ok'); changed();
  };
  const del = async (list: AssetRec[]) => {
    if (!list.length) return toast(t('assets.pickFirst'));
    if (!(await confirmBox(list.length === 1 ? t('assets.deleteAsk', { name: list[0].name }) : t('assets.deletePickedAsk', { count: list.length }), t('common.delete'), true))) return;
    for (const a of list) { await As.remove(a); picked.delete(a.id); }
    refreshChat(); if (list.length > 1) toast(t('assets.mgr.bulkDel', { count: list.length }), 'ok'); changed();
  };
  const groupOf = (a: AssetRec) => As.inVer(a.owner, a.ver || '').filter(x => As.baseOf(x.name) === As.baseOf(a.name));
  const menu = (a: AssetRec, anchor: Element) => {
    const s = srcOfRec(a), lock = !!s?.locked;
    sheet(anchor, [
      { label: t('assets.zoom'), ic: 'search', run: () => zoomAssets(groupOf(a), a) },
      { label: t('assets.copyTag'), d: PATHS.tag, hint: tagOf(a), run: () => void copy(tagOf(a), t('assets.copiedTag', { tag: tagOf(a) })) },
      { label: t('assets.insert'), d: PATHS.insert, run: () => insertTag(a) },
      '-',
      { label: a.aliases?.length ? t('assets.alias.editN', { count: a.aliases.length }) : t('assets.alias.add'), d: PATHS.at, hint: a.aliases?.join(', ') || t('assets.alias.hint'), off: lock, run: () => void aliases(a) },
      { label: a.disabled ? t('assets.enable') : t('assets.disable'), ic: a.disabled ? 'eye' : 'eyeoff', off: lock, run: () => void setOff([a], !a.disabled).then(changed) },
      { label: t('common.rename'), ic: 'edit', off: lock, run: () => void rename(a) },
      { label: t('assets.download'), d: PATHS.down, run: () => downloadAsset(a) },
      '-',
      { label: t('common.delete'), ic: 'trash', danger: true, off: lock, run: () => void del([a]) },
    ], a.name);
  };
  const onAct = (e: MouseEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-act]'); if (!el) return;
    const act = el.dataset.act, id = el.dataset.id || el.closest<HTMLElement>('[data-id]')?.dataset.id, a = id ? byId.get(id) : undefined;
    if (act === 'fold') { const k = el.dataset.owner || ''; if (closed.has(k)) closed.delete(k); else closed.add(k); c.ui.closed = [...closed]; save(); return redraw(); }
    if (act === 'wide') { const g = el.closest<HTMLElement>('[data-card]'); if (g) { open.add(g.dataset.src + '|' + g.dataset.card); redraw(); } return; }
    if (act === 'card' || (selecting && act === 'zoom')) { const g = el.closest<HTMLElement>('[data-card]'); const files = g ? cardsOf(srcs.find(s => s.src === g.dataset.src)!, q, filter, sort).find(x => x.base === g.dataset.card)?.shown || [] : []; const on = !files.every(f => picked.has(f.id)); files.forEach(f => on ? picked.add(f.id) : picked.delete(f.id)); return redraw(); }
    if (!a) return;
    if (selecting && act !== 'menu' && act !== 'toggle') { if (picked.has(a.id)) picked.delete(a.id); else picked.add(a.id); return redraw(); }
    if (act === 'zoom' || act === 'pick') zoomAssets(groupOf(a), a);
    else if (act === 'toggle') { if (!guard(srcOfRec(a))) void setOff([a], !a.disabled).then(changed); }
    else if (act === 'menu') menu(a, el);
  };
  const bulk = async (kind: 'on' | 'off' | 'del') => {
    const list = all.filter(a => picked.has(a.id)); if (!list.length) return toast(t('assets.pickFirst'));
    if (list.some(a => srcOfRec(a)?.locked)) return toast(t('assets.gal.locked'));
    if (kind === 'del') return del(list);
    await setOff(list, kind === 'off'); toast(t(kind === 'off' ? 'assets.mgr.bulkOff' : 'assets.mgr.bulkOn', { count: list.length }), 'ok'); changed();
  };
  const more = (e: MouseEvent<HTMLElement>) => {
    const one = srcs.length === 1 ? srcs[0] : null, ch = one?.owner.startsWith('char:') ? S.get('chars', one.owner.slice(5)) : null, any = all.length > 0;
    sheet(e.currentTarget, [
      { label: t('assets.gallery'), d: PATHS.grid, run: () => openGallery(srcs, t('assets.galleryTitle', { name: one ? one.label : t('assets.gal.chatMembers') }), { onChange: changed }) },
      tidy && one && { label: t('assets.mgr.tidy'), d: PATHS.broom, hint: t('assets.mgr.tidyTip'), off: one.locked || !any, run: () => smartRename(one.src, one.ver, changed) },
      ch && { label: t('assets.tools.exportZip'), d: PATHS.zip, off: !any, run: () => void exportZip(ch) },
      '-',
      { label: t('assets.mgr.allOn'), ic: 'eye', off: !any || !free.length, run: () => void setOff(all.filter(a => !srcOfRec(a)?.locked), false).then(changed) },
      { label: t('assets.mgr.allOff'), ic: 'eyeoff', off: !any || !free.length, run: () => void setOff(all.filter(a => !srcOfRec(a)?.locked), true).then(changed) },
      { label: t('assets.mgr.copyNames'), ic: 'copy', off: !any, run: () => void copy(As.names(srcs.map(s => s.owner)).join(', '), t('assets.mgr.namesCopied')) },
    ], t('assets.mgr.tools'));
  };

  const v: View = { q, filter, sort, view, selecting, picked, open };
  const off = all.filter(a => a.disabled).length;
  const seg = ([['all', t('assets.filter.all'), all.length], ['on', t('assets.filter.on'), all.length - off], ['off', t('assets.filter.off'), off]] as const);
  return <div className={'ast-sec ast-board' + (over ? ' over' : '')} onClick={onAct} onPaste={onPaste} tabIndex={-1}
    onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }} onDrop={onDrop}>
    <div className="ast-up">
      <Btn label={t('assets.up.images')} ic="upload" cls="primary" onClick={e => void pick(e, IMAGES)} />
      <SBtn label="ZIP" d={PATHS.zip} onClick={e => void pick(e, '.zip,application/zip')} />
      <SBtn label={t('assets.mgr.fromUrl')} d={PATHS.link} onClick={e => void fromUrl(e)} />
      <button type="button" className="ibtn ast-ib" title={t('assets.mgr.tools')} aria-label={t('assets.mgr.tools')} aria-haspopup="menu" onClick={more}><PathIcon d={PATHS.dots} /></button>
    </div>
    {!free.length && srcs[0] ? <div className="ast-lock"><PathIcon d={PATHS.link} size={16} />{t('assets.link.lockMsg', { name: whoOf(srcs[0].src)?.name || '' })}</div>
      : <button type="button" className="dropzone small ast-drop" onClick={e => void pick(e, IMAGES + ',.zip')}><Icon name="upload" size={20} /><b>{t('assets.mgr.drop')}</b><span>{t('assets.mgr.dropHint')}</span></button>}
    <UpProgress />
    <div className="ast-upopts">
      <Check label={t('assets.mgr.webp')} on={c.webp} onChange={val => { c.webp = val; save(); redraw(); }} hint={t('assets.mgr.webpHint')} />
      <Check label={t('assets.mgr.overwrite')} on={c.confirmOverwrite} onChange={val => { c.confirmOverwrite = val; save(); redraw(); }} hint={t('assets.mgr.overwriteHint')} />
    </div>
    <div className="ast-toolbar">
      <div className="search-wrap"><Icon name="search" size={16} /><input className="inp" type="search" placeholder={t('assets.mgr.searchPh')} value={q} onChange={e => setQ(e.target.value.trim().toLowerCase())} /></div>
      <button type="button" className="ibtn ast-ib" title={view === 'list' ? t('assets.view.card') : t('assets.view.list')} aria-label={view === 'list' ? t('assets.view.card') : t('assets.view.list')} onClick={() => setUi('view', view === 'list' ? 'card' : 'list')}><PathIcon d={view === 'list' ? PATHS.grid : PATHS.rows} /></button>
      <button type="button" className={'ibtn ast-ib' + (selecting ? ' on' : '')} aria-pressed={selecting} title={t('assets.mgr.select')} aria-label={t('assets.mgr.select')} onClick={() => { picked.clear(); setSelecting(!selecting); }}><PathIcon d={PATHS.checks} /></button>
      <div className="ast-toolbar-row">
        <div className="ast-seg" role="radiogroup" aria-label={t('assets.filter.label')}>{seg.map(([k, l, n]) => <button key={k} type="button" role="radio" aria-checked={filter === k} className={filter === k ? 'on' : undefined} onClick={() => setUi('filter', k)}>{l}<b className="fx-num">{n}</b></button>)}</div>
        <Select value={sort} cls="ast-sort" title={t('assets.sort.label')} opts={[['name', t('assets.sort.name')], ['recent', t('assets.sort.recent')], ['files', t('assets.sort.files')]]} onChange={val => setUi('sort', val)} />
      </div>
    </div>
    {selecting ? <div className="ast-bulk">
      <label className="check"><input type="checkbox" checked={all.length > 0 && all.every(a => picked.has(a.id))} onChange={e => { all.forEach(a => e.target.checked ? picked.add(a.id) : picked.delete(a.id)); redraw(); }} /><i /><span>{picked.size ? t('assets.mgr.picked', { count: picked.size }) : t('assets.mgr.selectAll')}</span></label>
      <div className="ast-bulk-acts">
        <Tiny title={t('assets.mgr.enablePicked')} onClick={() => void bulk('on')}><Icon name="eye" size={16} /></Tiny>
        <Tiny title={t('assets.mgr.disablePicked')} onClick={() => void bulk('off')}><Icon name="eyeoff" size={16} /></Tiny>
        <Tiny title={t('assets.deletePicked')} cls="bad" onClick={() => void bulk('del')}><Icon name="trash" size={16} /></Tiny>
      </div>
    </div> : null}
    {many ? srcs.map(s => {
      const list = As.inVer(s.src, s.ver), isOpen = !closed.has(s.owner), w = whoOf(s.owner);
      return <section key={s.owner} className={'ast-member' + (isOpen ? ' open' : '')}>
        <button type="button" className="ast-member-head" data-act="fold" data-owner={s.owner} aria-expanded={isOpen}>
          {w ? <Avatar o={w} cls="xs" /> : null}<b>{s.owner.startsWith('persona:') ? t('assets.gal.personaOf', { name: s.label }) : s.label}</b>
          <span className="ast-member-n fx-num">{t('assets.studio.count', { count: list.length })}{s.locked ? ' · ' + t('assets.link.short') : ''}{s.ver ? ' · ' + s.ver : ''}</span><Icon name="down" size={16} />
        </button>
        {isOpen ? <Cards s={s} v={v} /> : null}
      </section>;
    }) : srcs[0] ? <Cards s={srcs[0]} v={v} /> : null}
  </div>;
}
