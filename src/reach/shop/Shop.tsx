// 서점: 앱 안에서 바깥 사이트의 캐릭터 카드를 찾아보고, 미리 본 뒤 서가에 들인다
// 들이기는 기존 가져오기(cards.importFiles · importFromUrl)를 그대로 지난다 — 내장 로어북 · 정규식의 동의 흐름도 그대로다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { S } from '../../lib/core';
import { Server } from '../../lib/server';
import { importFiles, importFromUrl, summarize, writePngCard } from '../../lib/cards';
import { Emblem, Icon } from '../../kit';
import { PageHead, confirmBox, menu, openModal, toast } from '../../ui';
import { go } from '../../lib/router';
import { t } from '../../i18n';
import { cfg, keep } from '../route';
import { makeSources, screen, type CardSource, type Http, type SearchResult, type ShopDetail, type ShopItem, type Source } from './sources';

// ── 바깥으로 나가는 길: 먼저 바로 보내 보고, 브라우저가 막으면 드림랜드 서버를 거친다. 서버 없는 웹 빌드에서는 막히면 안내만 한다 ──
async function reach(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<Response> {
  let r: Response | null = null, status = 0;
  try { r = await fetch(url, { method: init.method || 'GET', headers: init.headers, body: init.body ? JSON.stringify(init.body) : undefined }); if (!r.ok) { status = r.status; r = null; } } catch { r = null; }
  if (!r) {
    if (Server.web && !Server.app) throw new Error(status ? t('reach.shop.err.status', { status }) : t('reach.shop.err.web'));
    r = await Server.proxy({ url, method: init.method || 'GET', headers: init.headers, body: init.body });
    if (!r.ok) throw new Error(r.status === 403 || r.status === 451 ? t('reach.shop.err.region', { status: r.status }) : t('reach.shop.err.status', { status: r.status }));
  }
  return r;
}
const http: Http = { json: async (url, init) => { const r = await reach(url, init); try { return await r.json(); } catch { throw new Error(t('reach.shop.err.shape')); } } };
const SOURCES = makeSources(http);

// 화면을 떠났다 돌아와도 남는 것
const view = { q: '', tags: '', items: [] as ShopItem[], page: 0, more: false, total: null as number | null, key: '', got: new Set<string>(), peek: false };
const blocked = () => !!S.settings.security?.blockRemoteImages && !view.peek;

/** 서가 그림: 높이와 두께가 다른 책등이 선반 위에 선다. 출처 이름이 씨앗 */
function Shelf({ seed }: { seed: string }) {
  const books = useMemo(() => {
    let s = 0; for (const ch of seed) s = (s * 33 + ch.charCodeAt(0)) >>> 0;
    const r = () => { s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const out: { x: number; w: number; h: number; lean: number; band: number; mark: boolean }[] = []; let x = 6;
    while (x < 206) { const w = 5 + r() * 9, h = 24 + r() * 26, lean = r() < .12 ? (r() < .5 ? -9 : 9) : 0; out.push({ x, w, h, lean, band: Math.floor(r() * 3), mark: r() < .14 }); x += w + (lean ? 5 : .8) + (r() < .1 ? 8 : 0); }
    return out;
  }, [seed]);
  return <svg className="fx-art rc-shelf" viewBox="0 0 220 64" aria-hidden="true">
    {books.map((b, i) => <g key={i} transform={b.lean ? `rotate(${b.lean} ${b.x + b.w / 2} 58)` : undefined}>
      <rect className={i % 4 ? 't' : undefined} x={b.x} y={58 - b.h} width={b.w} height={b.h} rx=".6" />
      {b.band > 0 ? <path className="h" d={`M${b.x} ${58 - b.h + 5}h${b.w}${b.band > 1 ? `M${b.x} ${58 - 6}h${b.w}` : ''}`} /> : null}
      {b.mark ? <path className="a" d={`M${b.x + b.w / 2} ${58 - b.h}v-5`} /> : null}
    </g>)}
    <path d="M2 58.6H218" /><path className="h" d="M2 61.4H218" />
  </svg>;
}
const short = (n: number) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
const STAT_IC: Record<string, string> = { likes: 'heart', downloads: 'import', chats: 'chat', messages: 'chat' };

function Cover({ it, big = false }: { it: ShopItem; big?: boolean }) {
  const [bad, setBad] = useState(false), show = !!it.thumb && !blocked() && !bad;
  return <div className={'rc-cover' + (big ? ' big' : '') + (show ? '' : ' none')}>
    {show ? <img src={it.thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <Emblem o={{ tags: it.tags, name: it.name }} />}
  </div>;
}

/** 카드를 서가에 들인다. 초상을 받을 수 있으면 카드를 그림 안에 넣어 PNG 한 장으로 만들고(가져온 뒤에도 초상이 남게), 안 되면 글만 들인다 */
async function bringIn(src: Source, it: ShopItem): Promise<string> {
  const c: CardSource = await src.card(it);
  if (c.kind === 'url') { const T = await importFromUrl(c.url); if (T.errors.length) throw new Error(T.errors[0]); return summarize(T); }
  const safe = (c.name || 'card').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
  let file: File | null = null;
  if (c.avatar) try {
    const blob = await (await reach(c.avatar)).blob(), bmp = await createImageBitmap(blob), k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
    const png = await new Promise<Blob | null>(ok => cv.toBlob(ok, 'image/png'));
    if (png) file = new File([writePngCard(new Uint8Array(await png.arrayBuffer()), c.card) as BlobPart], safe + '.png', { type: 'image/png' });
  } catch (e) { console.warn('[서점] 초상을 받지 못해 글만 들입니다', e); }
  file ||= new File([JSON.stringify(c.card)], safe + '.json', { type: 'application/json' });
  const T = await importFiles([file]); if (T.errors.length) throw new Error(T.errors[0]);
  return summarize(T);
}

function Preview({ src, it, close, onGot }: { src: Source; it: ShopItem; close: () => void; onGot: () => void }) {
  const [d, setD] = useState<ShopDetail | null>(null), [state, setState] = useState<'load' | 'ok' | 'fail'>('load'), [busy, setBusy] = useState(false), [got, setGot] = useState(view.got.has(it.src + ':' + it.id));
  useEffect(() => { let live = true; src.detail(it).then(x => { if (live) { setD(x); setState(x ? 'ok' : 'fail'); } }, () => { if (live) setState('fail'); }); return () => { live = false; }; }, [src, it]);
  const take = async () => {
    setBusy(true);
    try { const sum = await bringIn(src, it); view.got.add(it.src + ':' + it.id); setGot(true); onGot(); toast(t('reach.shop.got', { name: it.name, sum }), 'ok'); }
    catch (e) { toast(t('reach.shop.gotFail', { err: e instanceof Error ? e.message : String(e) }), 'err'); } finally { setBusy(false); }
  };
  const tokens = d?.tokens || it.tokens;
  return <div className="rc-prev">
    <aside><Cover it={it} big />
      <div className="rc-prev-facts">
        <div className="fx-kv"><span>{t('reach.shop.fact.tokens')}</span><i /><b>{tokens ? tokens.toLocaleString() : '—'}</b></div>
        <div className="fx-kv"><span>{t('reach.shop.fact.greetings')}</span><i /><b>{d ? String(d.greetings).padStart(2, '0') : '—'}</b></div>
        <div className="fx-kv"><span>{t('reach.shop.fact.lore')}</span><i /><b>{d ? (d.lore ? t('reach.shop.fact.yes') : t('reach.shop.fact.no')) : '—'}</b></div>
        <div className="fx-kv"><span>{t('reach.shop.fact.regex')}</span><i /><b>{d ? String(d.regex).padStart(2, '0') : '—'}</b></div>
        {it.stats.map(s => <div className="fx-kv" key={s.k}><span>{t('reach.shop.stat.' + s.k)}</span><i /><b>{short(s.n)}</b></div>)}
      </div></aside>
    <div className="rc-prev-main">
      <span className="fx-lbl">{src.site}{it.creator ? ' · ' + it.creator : ''}</span>
      <h3 className="fx-title">{it.name}</h3>
      {it.tagline ? <p className="rc-prev-tag fx-body">{it.tagline}</p> : null}
      {it.tags.length ? <div className="rc-tags">{it.tags.slice(0, 14).map(x => <span key={x}>{x}</span>)}</div> : null}
      {state === 'load' ? <p className="rc-none">{t('reach.shop.loadingDetail')}</p> : state === 'fail' ? <p className="rc-none">{t('reach.shop.noDetail')}</p> : <>
        {d?.description ? <section><h4 className="fx-head"><span className="fx-lbl kr ink">{t('reach.shop.sec.desc')}</span></h4><div className="rc-prev-text">{d.description}</div></section> : null}
        {d?.scenario ? <section><h4 className="fx-head"><span className="fx-lbl kr ink">{t('reach.shop.sec.scenario')}</span></h4><div className="rc-prev-text sm">{d.scenario}</div></section> : null}
        {d?.firstMes ? <section><h4 className="fx-head"><span className="fx-lbl kr ink">{t('reach.shop.sec.first')}</span></h4><div className="rc-prev-text sm">{d.firstMes}</div></section> : null}
        {d?.notes ? <section><h4 className="fx-head"><span className="fx-lbl kr ink">{t('reach.shop.sec.notes')}</span></h4><div className="rc-prev-text sm">{d.notes}</div></section> : null}
        {d && (d.lore || d.regex) ? <p className="hint">{t('reach.shop.embedNote')}</p> : null}
      </>}
      <footer>
        <a className="btn ghost" href={it.url} target="_blank" rel="noopener noreferrer"><Icon name="link" size={14} />{t('reach.shop.openSite', { site: src.name })}</a>
        <span className="rc-sp" />
        {got ? <button type="button" className="btn ghost" onClick={() => { close(); go('home'); }}><Icon name="check" size={14} />{t('reach.shop.gotGo')}</button> : null}
        <button type="button" className="btn primary" disabled={busy} onClick={() => void take()}><Icon name="book" size={14} />{busy ? t('reach.shop.taking') : got ? t('reach.shop.takeAgain') : t('reach.shop.take')}</button>
      </footer>
    </div>
  </div>;
}

export function ShopPage() {
  const C = cfg().shop, [, tick] = useState(0), draw = () => tick(n => n + 1);
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const src = SOURCES.find(s => s.id === C.src) || SOURCES[0], run = useRef(0);
  const isUrl = /^https?:\/\/\S+$/i.test(view.q.trim());
  const tags = () => view.tags.split(/[,，]/).map(x => x.trim()).filter(Boolean).slice(0, 6);
  const keyNow = () => [src.id, view.q.trim(), C.sort, tags().join(','), C.nsfw].join('|');
  const load = async (more = false) => {
    if (isUrl) return;
    const id = ++run.current, page = more ? view.page + 1 : 1; setBusy(true); setErr('');
    try {
      const r: SearchResult = await src.search(view.q, page, { sort: C.sort === 'new' ? 'new' : 'hot', tags: tags(), nsfw: !!C.nsfw && src.adult });
      if (id !== run.current) return;
      const fresh = screen(r.items, !!C.nsfw), seen = new Set(more ? view.items.map(x => x.id) : []);
      view.items = more ? [...view.items, ...fresh.filter(x => !seen.has(x.id))] : fresh; view.page = page; view.more = r.more && r.items.length > 0; view.total = r.total; view.key = keyNow();
    } catch (e) { if (id !== run.current) return; if (!more) { view.items = []; view.key = keyNow(); } setErr(e instanceof Error ? e.message : String(e)); }
    finally { if (id === run.current) setBusy(false); }
  };
  // 처음 들어오면 그 출처의 인기 카드를 보여 준다 (돌아왔을 때는 앞의 결과 그대로)
  useEffect(() => { if (view.key !== keyNow()) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [src.id, C.sort, C.nsfw]);
  const set = (patch: Partial<typeof C>) => { Object.assign(C, patch); keep(); draw(); };
  const open = (it: ShopItem) => { const m = openModal({ title: it.name, wide: true, body: <Preview src={src} it={it} close={() => m.close()} onGot={draw} /> }); m.el?.classList.add('rc-modal'); };
  const fromLink = async () => { setBusy(true); try { toast(t('reach.shop.got', { name: view.q.trim().split('/').pop() || '', sum: summarize(await importFromUrl(view.q.trim())) }), 'ok'); } catch (e) { toast(t('reach.shop.gotFail', { err: e instanceof Error ? e.message : String(e) }), 'err'); } finally { setBusy(false); } };
  const adult = async (e: React.MouseEvent<HTMLButtonElement>) => menu(e.currentTarget, [
    { label: C.nsfw ? t('reach.shop.adultOff') : t('reach.shop.adultOn'), ic: C.nsfw ? 'eyeoff' : 'eye', hint: t('reach.shop.adultHint'), onclick: async () => { if (!C.nsfw && !(await confirmBox(t('reach.shop.adultAsk'), t('reach.shop.adultOn')))) return; set({ nsfw: !C.nsfw }); } },
    S.settings.security?.blockRemoteImages ? { label: view.peek ? t('reach.shop.peekOff') : t('reach.shop.peekOn'), ic: 'image', hint: t('reach.shop.peekHint'), onclick: () => { view.peek = !view.peek; draw(); } } : null,
    '-', { label: t('reach.shop.toImport'), ic: 'folder', onclick: () => go('import') }]);

  return <section className="pagebox rc-shop">
    <PageHead eyebrow="bookshop" title={t('reach.shop.title')}><button type="button" className="ibtn" title={t('reach.shop.settings')} aria-label={t('reach.shop.settings')} onClick={e => void adult(e)}><Icon name="more" /></button></PageHead>
    <div className="rc-shop-top"><p className="rc-shop-lead fx-body">{t('reach.shop.lead')}</p><Shelf seed={src.id + view.q} /></div>
    <div className="rc-shop-bar">
      <div className="rc-srcs" role="tablist" aria-label={t('reach.shop.source')}>{SOURCES.map(s => <button type="button" key={s.id} role="tab" aria-selected={s.id === src.id} className={'fx-pill fx-tap' + (s.id === src.id ? ' on' : '')} onClick={() => set({ src: s.id })}>{s.name}<small>{s.site}</small></button>)}</div>
      <form className="rc-shop-find" onSubmit={e => { e.preventDefault(); if (isUrl) void fromLink(); else void load(); }}>
        <label className="rc-search"><Icon name="search" size={15} /><input defaultValue={view.q} placeholder={t('reach.shop.searchPh')} aria-label={t('reach.shop.searchPh')} spellCheck={false} onChange={e => { view.q = e.target.value; draw(); }} /></label>
        <label className="rc-search tag"><span className="fx-lbl">tag</span><input defaultValue={view.tags} placeholder={t('reach.shop.tagPh')} aria-label={t('reach.shop.tagPh')} spellCheck={false} onChange={e => { view.tags = e.target.value; }} /></label>
        <button type="submit" className="btn primary" disabled={busy}>{isUrl ? t('reach.shop.fromLink') : t('common.search')}</button>
      </form>
      <div className="rc-shop-opts">
        <div className="rc-seg" role="radiogroup" aria-label={t('reach.shop.sort')}>{(['hot', 'new'] as const).map(k => <button type="button" key={k} role="radio" aria-checked={(C.sort === 'new' ? 'new' : 'hot') === k} className={(C.sort === 'new' ? 'new' : 'hot') === k ? 'on' : ''} onClick={() => set({ sort: k })}>{t('reach.shop.sort.' + k)}</button>)}</div>
        <span className="rc-veil" title={t('reach.shop.adultHint')}><Icon name={C.nsfw ? 'eye' : 'eyeoff'} size={13} />{C.nsfw ? t('reach.shop.veilOff') : t('reach.shop.veilOn')}</span>
        <span className="rc-sp" />
        <span className="fx-num rc-count">{view.total != null ? `${String(view.items.length).padStart(3, '0')} / ${view.total.toLocaleString()}` : String(view.items.length).padStart(3, '0')}</span>
      </div>
    </div>
    {blocked() && view.items.some(x => x.thumb) ? <p className="rc-note"><Icon name="eyeoff" size={13} /><span>{t('reach.shop.blockedNote')}</span><button type="button" onClick={() => { view.peek = true; draw(); }}>{t('reach.shop.peekOn')}</button></p> : null}
    {err ? <div className="fx-empty rc-shop-err"><Shelf seed="err" /><p>{t('reach.shop.err.lead', { site: src.name })}</p><small>{err}</small><button type="button" className="btn ghost" onClick={() => void load()}>{t('reach.shop.retry')}</button></div>
      : !view.items.length ? <div className="fx-empty"><Shelf seed="none" /><p>{busy ? t('reach.shop.searching') : view.key ? t('reach.shop.none') : t('reach.shop.searching')}</p></div>
      : <div className="rc-grid">{view.items.map((it, i) => <button type="button" key={it.id} className="rc-book fx-in" style={{ ['--d' as string]: Math.min(i % 24, 12) * 22 + 'ms' }} onClick={() => open(it)}>
        <Cover it={it} />
        {view.got.has(it.src + ':' + it.id) ? <em className="rc-got"><Icon name="check" size={11} />{t('reach.shop.gotTag')}</em> : null}
        <b>{it.name}</b><small>{it.creator || src.site}</small>
        <span className="rc-book-meta fx-num">{it.tokens ? <span>{short(it.tokens)} tok</span> : null}{it.stats.slice(0, 2).map(s => <span key={s.k}><Icon name={STAT_IC[s.k]} size={10} />{short(s.n)}</span>)}</span>
      </button>)}</div>}
    {view.items.length && view.more && !err ? <div className="rc-more"><button type="button" className="btn ghost" disabled={busy} onClick={() => void load(true)}>{busy ? t('reach.shop.searching') : t('reach.shop.more')}</button></div> : null}
    <p className="hint rc-shop-foot">{t('reach.shop.foot')}</p>
  </section>;
}
