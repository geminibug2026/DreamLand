// 사진: 대화 모드 방들의 사진(보낸 사진 · 앨범 — src/photos 의 Photos 입구) · 밤의 게시판 사진 · 예전 삽화를 한 앨범으로.
// 한 장은 GItem 하나 (어디서 왔든 toItem · fromCard 가 이 꼴로 바꾼다). 글로만 있는 사진은 설명 카드 — 누르면 그 한 장의 설명과
// 「이 사진 만들기」가 아래에서 올라오고, 위 띠의 「골라서 만들기 · 전부 만들기」는 Photos.generate 가 장 수 · 비용을 먼저 묻는다.
// 보이는 동안만 Photos.subscribe 로 듣는다 (차례 기다림 · 그리는 중 · 다 그림이 그 자리에서 바뀐다)
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { S } from '../../lib/core';
import { Illust } from '../../lib/illust';
import { toast } from '../../ui';
import { t, tn, locale } from '../../i18n';
import { Photos, type PhotoItem, type PhotoKind, type PhotoState } from '../../photos/api';
import { Emb, Glyph } from '../art';
import { AppHead, Empty, IBtn, usePhone } from '../ui';
import { chatWith, talkChats } from '../data';
import { setPrefs } from '../prefs';
import type { Card } from '../../scenebook/shelf';

const PAGE = 45, ROOMS = 8;
/** 갤러리의 한 장 */
interface GItem { id: string; p?: PhotoItem; /** 예전 삽화 (에셋 id) */ illust?: string; chatId?: string; by: string; ts: number; alt: string; state: PhotoState; kind: PhotoKind | 'scene'; error?: string }
/** 사진 입구의 한 장 → 갤러리의 한 장 */
const toItem = (p: PhotoItem): GItem => ({ id: p.id, p, chatId: p.chatId, by: p.by, ts: p.ts, alt: p.alt || p.shows, state: p.state, kind: p.kind, error: p.error });
/** 예전 삽화(삽화 선반의 한 줄) → 갤러리의 한 장 */
function fromCard(c: Card): GItem | null {
  const chatId = c.owner.replace(/^chat:/, ''), chat = S.get('chats', chatId); if (!chat) return null;
  return { id: 'i|' + c.id, illust: c.id, chatId, by: chat.charIds.length === 1 ? chat.charIds[0] : '', ts: c.ts, alt: c.title || c.hint || '', state: 'done', kind: /\bselfie\b/i.test(c.find || '') ? 'selfie' : 'scene' };
}
/** 아직 그리지 않은(또는 그리지 못한) 사진 */
const missing = (x: GItem) => !!x.p && (x.state === 'text' || x.state === 'failed');
const imageOf = (x: GItem) => x.illust || (x.p && x.p.source !== 'feed' ? x.p.image : '');
const KIND_IC: Record<string, string> = { selfie: 'camera', mirror: 'contacts', shot: 'image', scene: 'image' };
const kindName = (x: GItem) => x.kind === 'scene' ? t('phone.ph.scene') : t('photos.kind.' + x.kind);
const when = (ts: number) => new Date(ts).toLocaleString(locale(), { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** 작은 그림: 화면 가까이 왔을 때만 만들고, 보이는 동안만 붙잡는다 */
function Thumb({ x }: { x: GItem }) {
  const [near, setNear] = useState(false), [, bump] = useState(0), box = useRef<HTMLElement>(null), img = imageOf(x);
  useEffect(() => { if (near) return; const el = box.current; if (!el) return; const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); setNear(true); } }, { root: el.closest('.pn-appscroll'), rootMargin: '300px 0px' }); io.observe(el); return () => io.disconnect(); }, [near]);
  const u = !near ? '' : x.p ? Photos.thumb(x.p) : Illust.thumb(img);
  useEffect(() => { if (!near || u || !img) return; const rel = Illust.thumbHold(img), off = Illust.onPic(() => bump(n => n + 1)); return () => { off(); rel(); }; }, [img, near, u]);
  return u ? <img src={u} alt="" decoding="async" /> : <i ref={box} className="pn-ph-wait" aria-hidden="true" />;
}
/** 사진 한 칸 (그림 · 글로만 있는 사진 · 차례 기다림 · 그리는 중 모두 여기서) */
function Tile({ x, picking, picked, onTap }: { x: GItem; picking: boolean; picked: boolean; onTap: () => void }) {
  const st = x.state, drawn = st === 'done', busy = st === 'queued' || st === 'drawing';
  const label = drawn ? t('phone.ph.view', { alt: x.alt || kindName(x) }) : busy ? `${x.alt} · ${t('photos.state.' + st)}` : t('phone.ph.about', { alt: x.alt });
  return <li className={`pn-ph ${st}` + (picked ? ' picked' : '')}>
    <button type="button" className="pn-ph-btn" aria-label={label} aria-pressed={picking ? picked : undefined} disabled={(picking && !missing(x)) || busy} onClick={onTap}>
      {drawn ? <Thumb x={x} /> : <span className="pn-ph-desc"><Glyph name={KIND_IC[x.kind] || 'image'} size={16} /><span>{x.alt}</span>
        <em>{busy ? <i className="pn-ph-spin" aria-hidden="true" /> : null}{busy ? t('photos.state.' + st) : st === 'failed' ? t('phone.ph.failed') : t('phone.ph.textOnly')}</em></span>}
      {drawn && (x.kind === 'selfie' || x.kind === 'mirror') ? <em className="pn-ph-tag">{t('photos.kind.' + x.kind)}</em> : null}
      {picking && missing(x) ? <i className="pn-ph-check" aria-hidden="true">{picked ? <Glyph name="check" size={13} w={2.4} /> : null}</i> : null}
    </button>
  </li>;
}
/** 글로만 있는 사진 한 장: 설명 · 누가 · 언제 · 비용 한 줄, 그리고 「이 사진 만들기」 */
function MakeSheet({ x, onClose, onMake }: { x: GItem; onClose: () => void; onMake: () => void }) {
  const who = x.by && x.by !== 'me' ? S.get('chars', x.by)?.name : '', c = Photos.cost(1);
  const cost = c.nai ? (c.refs ? t('photos.cost.refs', { refs: c.refs, n: 1, anlas: c.anlas }) : c.free ? t('photos.cost.free') : t('photos.cost.paid')) : t('photos.cost.one');
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true); }, [onClose]);
  return <div className="pn-sheet-veil" onClick={onClose}><div className="pn-sheet pn-ph-sheet" role="dialog" aria-label={t('phone.ph.makeOne')} onClick={e => e.stopPropagation()}>
    <i className="pn-sheet-grab" aria-hidden="true" />
    <span className="pn-ph-meta"><Glyph name={KIND_IC[x.kind] || 'image'} size={15} />{[kindName(x), who, when(x.ts)].filter(Boolean).join(' · ')}</span>
    <p className="pn-ph-alt">{x.alt}</p>
    {x.state === 'failed' && x.error ? <p className="pn-ph-err">{x.error}</p> : null}
    <p className="pn-hint">{cost}</p>
    <div className="pn-pair"><button type="button" className="pn-btn ghost" onClick={onClose}>{t('phone.cancel')}</button><button type="button" className="pn-btn" onClick={onMake}><Glyph name="camera" size={17} />{x.state === 'failed' ? t('phone.ph.retry') : t('phone.ph.makeOne')}</button></div>
  </div></div>;
}

export function Gallery({ arg }: { arg?: unknown }) {
  const P = usePhone(), first = typeof arg === 'string' && S.get('chars', arg) ? 'c:' + arg : 'all';
  const [items, setItems] = useState<GItem[] | null>(null), [scenes, setScenes] = useState<GItem[] | null>(null), [scope, setScope] = useState(first), [rooms, setRooms] = useState(ROOMS);
  const [shown, setShown] = useState(PAGE), [picking, setPicking] = useState(false), [sel, setSel] = useState<Set<string>>(() => new Set()), [filling, setFilling] = useState(false), [sheet, setSheet] = useState<GItem | null>(null), more = useRef<HTMLDivElement>(null);
  const chats = useMemo(() => talkChats(), [P.v]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 대화 모드 방들의 사진 (최근 방부터 rooms 개) + 게시판 사진. 보이는 동안만 듣고, 알림이 몰려도 한 번만 다시 읽는다
  useEffect(() => {
    let live = true, timer = 0;
    const load = async () => {
      const out: GItem[] = [];
      for (const c of chats.slice(0, rooms)) { try { out.push(...(await Photos.list(c.id)).map(toItem)); } catch (e) { console.warn('[휴대폰 사진]', e); } if (!live) return; }
      out.push(...Photos.feed().map(toItem));
      // 같은 사진은 한 장만: 갈래로 나눈 · 복사한 대화방에는 같은 메시지와 그 사진이 그대로 들어 있어 방마다 한 번씩 잡힌다 — 같은 그림이거나 같은 메시지의 같은 사진이면 최근 것 하나만
      const seen = new Set<string>(), uniq = out.sort((a, b) => b.ts - a.ts).filter(x => { const img = imageOf(x), k = img ? 'img:' + img : x.p?.msgId ? `msg:${x.p.msgId}|${x.p.kind}|${x.p.shows}` : x.id; if (seen.has(k)) return false; seen.add(k); return true; });
      if (live) setItems(uniq);
    };
    void load();
    const off = Photos.subscribe(() => { if (timer || document.hidden) return; timer = window.setTimeout(() => { timer = 0; void load(); }, 300); });
    return () => { live = false; clearTimeout(timer); off(); };
  }, [chats, rooms]);
  // 예전 삽화는 그 묶음을 고를 때만 읽는다 (삽화 선반 — 그림 글자는 읽지 않는다)
  useEffect(() => {
    if (scope !== 'scene' || scenes) return; let live = true;
    void import('../../scenebook/shelf').then(async ({ shelf }) => { const hide = new Set(Illust.cfg().galleryHide || []), list = (await shelf()).filter(c => c.kind === 'illust' && c.owner.startsWith('chat:') && !hide.has(c.id)).map(fromCard).filter((x): x is GItem => !!x); if (live) setScenes(list.sort((a, b) => b.ts - a.ts)); }).catch(() => { if (live) setScenes([]); });
    return () => { live = false; };
  }, [scope, scenes]);
  const people = useMemo(() => [...new Set((items || []).filter(x => x.p?.source !== 'feed').map(x => x.by).filter(id => id && id !== 'me'))].map(id => S.get('chars', id)).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 10), [items]);
  const base = scope === 'scene' ? scenes : items;
  const list = (base || []).filter(x => scope === 'all' ? x.p?.source !== 'feed' : scope === 'feed' ? x.p?.source === 'feed' : scope === 'selfie' ? (x.kind === 'selfie' || x.kind === 'mirror') && x.p?.source !== 'feed' : scope === 'scene' ? true : x.by === scope.slice(2) && x.p?.source !== 'feed');
  const todo = list.filter(missing), queued = list.filter(x => x.state === 'queued').length, drawing = list.filter(x => x.state === 'drawing').length;
  useEffect(() => { const el = more.current; if (!el || shown >= list.length) return; const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setShown(s => s + PAGE); }, { root: el.closest('.pn-appscroll'), rootMargin: '400px 0px' }); io.observe(el); return () => io.disconnect(); }, [shown, list.length]);
  // 고른 사진 중 그새 그려진 것은 놓는다
  useEffect(() => { if (!picking) return; const ok = new Set(todo.map(x => x.id)); setSel(s => { const n = new Set([...s].filter(id => ok.has(id))); return n.size === s.size ? s : n; }); }, [picking, todo.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const stopPick = () => { setPicking(false); setSel(new Set()); };
  const make = async (ids: string[]) => { if (!ids.length) return; const r = await Photos.generate(ids); if (r.queued) stopPick(); };
  const view = async (x: GItem) => {
    const chat = x.chatId ? S.get('chats', x.chatId) : undefined, img = imageOf(x);
    const src = x.p ? Photos.url(x.p) || (img ? await Illust.dataOf(img) : '') : (await Illust.dataOf(img)) && Illust.url(img);
    if (!src) { if (x.p) return void Photos.open(x.p); return toast(t('phone.ph.gone')); }
    const { viewer } = await import('../../scenebook/viewer');
    viewer({ title: '', src, sub: [x.alt, when(x.ts)].filter(Boolean).join(' · '),
      actions: [...(img ? [{ label: t('phone.ph.asWall'), ic: 'image', run: () => { setPrefs({ wall: 'il:' + img }); toast(t('phone.ph.wallSet'), 'ok'); } }] : []),
        ...(chat ? [{ label: t('phone.ph.toChat'), ic: 'chat', run: () => { document.querySelector<HTMLElement>('.modal-wrap .modal-x')?.click(); P.toChat(chat); } }] : [])] });
  };
  const tap = (x: GItem) => {
    if (picking) { if (missing(x)) setSel(p => { const s = new Set(p); if (s.has(x.id)) s.delete(x.id); else s.add(x.id); return s; }); return; }
    if (x.state === 'done') return void view(x);
    if (missing(x)) setSheet(x);
  };
  const fillChat = scope.startsWith('c:') ? chatWith(scope.slice(2)) : null;
  const fill = async () => { if (!fillChat || filling) return; setFilling(true); try { const made = await Photos.describe(fillChat.id); toast(tn('phone.ph.filled', made.length), 'ok'); } catch (e) { toast(String((e as Error)?.message || e), 'err'); } finally { setFilling(false); } };
  // 날짜 머리줄
  const rows: ReactNode[] = []; let lastDay = '';
  for (const x of list.slice(0, shown)) {
    const d = new Date(x.ts), k = d.toDateString(); if (k !== lastDay) { lastDay = k; rows.push(<li key={'d' + k} className="pn-ph-day">{d.toLocaleDateString(locale(), { month: 'long', day: 'numeric', weekday: 'short' })}</li>); }
    rows.push(<Tile key={x.id} x={x} picking={picking} picked={sel.has(x.id)} onTap={() => tap(x)} />);
  }
  const chips: [string, string][] = [['all', t('phone.ph.all')], ['selfie', t('phone.ph.selfies')], ...people.map(c => ['c:' + c.id, c.name] as [string, string]), ['feed', t('phone.app.board')], ['scene', t('phone.ph.scenes')]];
  const emptyText = scope === 'feed' ? [t('photos.emptyFeed'), t('photos.emptyFeedLong')] : scope === 'scene' ? [t('phone.ph.noScenes'), t('phone.ph.noScenesHint')] : scope === 'selfie' ? [t('phone.ph.noSelfie'), t('phone.ph.noSelfieHint')] : scope.startsWith('c:') ? [t('phone.ph.noneHere'), t('phone.ph.noneHereHint')] : [t('phone.ph.none'), t('phone.ph.noneHint')];
  const busyLine = [drawing ? tn('phone.ph.drawing', drawing) : '', queued ? tn('phone.ph.queued', queued) : ''].filter(Boolean).join(' · ');
  return <div className="pn-appbody">
    <AppHead title={t('phone.app.photos')} big right={fillChat ? <IBtn ic="spark" label={filling ? t('phone.loading') : t('phone.ph.fill')} onClick={() => void fill()} /> : null} />
    <div className="pn-chips" role="tablist" aria-label={t('phone.ph.scope')}>{chips.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={scope === k} className={scope === k ? 'on' : undefined} onClick={() => { setScope(k); setShown(PAGE); stopPick(); }}>{l}</button>)}</div>
    {todo.length || busyLine ? <section className={'pn-ph-bar' + (picking ? ' picking' : '')} aria-live="polite">
      <div className="pn-ph-bar-top"><i className="pn-ph-bar-ic"><Glyph name={picking ? 'check' : busyLine && !todo.length ? 'clock' : 'camera'} size={18} /></i>
        <span><b>{picking ? tn('phone.ph.picked', sel.size) : todo.length ? tn('phone.ph.textN', todo.length) : busyLine}</b>
          <small>{picking ? t('phone.ph.pickHint') : todo.length ? busyLine || t('phone.ph.barHint') : t('phone.ph.busyHint')}</small></span></div>
      {todo.length ? <div className="pn-pair">{picking
        ? <><button type="button" className="pn-btn ghost" onClick={stopPick}>{t('phone.cancel')}</button><button type="button" className="pn-btn" disabled={!sel.size} onClick={() => void make(todo.filter(x => sel.has(x.id)).map(x => x.id))}>{tn('phone.ph.makeSel', sel.size)}</button></>
        : <><button type="button" className="pn-btn ghost" onClick={() => setPicking(true)}>{t('phone.ph.pick')}</button><button type="button" className="pn-btn" onClick={() => void make(todo.map(x => x.id))}>{tn('phone.ph.makeAll', todo.length)}</button></>}</div> : null}
    </section> : null}
    {!base ? <p className="pn-wait">{t('phone.loading')}</p>
      : !list.length ? <Empty art={<Emb kind="lantern" className="pn-empty-art" />} title={emptyText[0]} text={emptyText[1]}>{fillChat ? <button type="button" className="pn-btn" disabled={filling} onClick={() => void fill()}>{filling ? t('phone.loading') : t('phone.ph.fill')}</button> : null}</Empty>
        : <ul className="pn-phgrid">{rows}</ul>}
    {list.length > shown ? <div ref={more} className="pn-ph-more">{tn('phone.more', list.length - shown)}</div> : null}
    {scope !== 'feed' && scope !== 'scene' && chats.length > rooms ? <button type="button" className="pn-btn ghost wide" onClick={() => setRooms(r => r + ROOMS)}>{t('phone.ph.moreRooms')}</button> : null}
    {sheet ? <MakeSheet x={sheet} onClose={() => setSheet(null)} onMake={() => { const id = sheet.id; setSheet(null); void Photos.generate([id]); }} /> : null}
  </div>;
}
