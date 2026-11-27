// 사진: 화면 — 대화에 보낸 사진 말풍선 · 글로만 있는 사진 카드 · 갤러리의 「사진」 보기(전부 만들기 · 골라서 만들기 · 하나씩) · 대화 모드 삽화 고르기 · 게시판 사진
// 보낸 사진은 메신저에서 받은 사진처럼: 둥근 사진 한 장, 액자 · 제목 없이, 누르면 크게 본다. 그리기 전에는 설명 카드에 「사진 보기」
import { useEffect, useRef, useState } from 'react';
import { Icon, useEvents } from '../kit';
import { I } from '../lib/icons';
import { S, on } from '../lib/core';
import { Illust } from '../lib/illust';
import { GONE, useIllustUrl } from '../lib/useIllust';
import type { Chat, Msg, Swipe } from '../lib/types';
import { go } from '../lib/router';
import { chatApi } from '../chat/actions';
import { Btn, Empty } from '../scenebook/parts';
import { openModal } from '../scenebook/parts';
import { slotViewer } from '../scenebook/slot';
import { toast } from '../ui';
import { locale, t, tn } from '../i18n';
import type { PhotoItem, PhotoKind, SentPhoto } from './types';
import { canDraw, portrait } from './queue';
import { readable } from './prompt';
import { costLine } from './confirm';
import { Photos } from './api';
import { cfg, dropAlbum, drawSent, sentKey, setCfg, slotOf, stateOf } from './store';

// 24 격자 한 줄 선 아이콘: 사진기 (보여 주는 사진) · 앞 카메라 휴대폰 (셀카) · 거울
Object.assign(I, {
  phcam: 'M4 8h3.500l1.500-2.500h6L16.500 8H20v11H4z M12 16.500a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7z',
  phselfie: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M9.500 16a3 3 0 0 1 5 0',
  phmirror: 'M12 3c3.300 0 6 3.600 6 8s-2.700 8-6 8-6-3.600-6-8 2.700-8 6-8z M12 19v2 M9 21h6 M10 9.500l3-2.500 M10.500 13l4-3.500',
});
const KIND_IC: Record<PhotoKind, string> = { selfie: 'phselfie', mirror: 'phmirror', shot: 'phcam' };
export const KindIcon = ({ kind, size = 18 }: { kind: PhotoKind; size?: number }) => <Icon name={KIND_IC[kind] || 'phcam'} size={size} />;
const errText = (e: unknown) => (e instanceof Error ? e.message : '') || String(e);
const ratio = (w?: number, h?: number) => { const p = portrait(); return `${w || p.width} / ${h || p.height}`; };

/** 사진 한 장 (읽는 동안은 같은 크기의 빈 칸) */
function Pic({ id, alt, w, h }: { id: string; alt: string; w?: number; h?: number }) {
  const src = useIllustUrl(id);
  return src && src !== GONE ? <img src={src} alt={alt} decoding="async" style={{ aspectRatio: ratio(w, h) }} /> : <span className="ph-wait-pic" role="img" aria-label={alt} style={{ aspectRatio: ratio(w, h) }} />;
}
/** 글로만 있는 사진: 설명과 「사진 보기」 (그림 1장). 실패했으면 까닭과 다시 하기 */
export function PhotoCard({ kind, alt, error, onDraw, compact }: { kind: PhotoKind; alt: string; error?: string; onDraw: () => void; compact?: boolean }) {
  return <div className={'ph-card' + (error ? ' bad' : '') + (compact ? ' compact' : '')}>
    <span className="ph-card-ic"><KindIcon kind={kind} size={20} /></span>
    <p className="ph-card-alt">{alt}</p>
    <div className="ph-card-foot"><small>{error || t('photos.cost.one')}</small>
      <button type="button" className="btn primary ph-go" onClick={e => { e.stopPropagation(); onDraw(); }}><Icon name={error ? 'refresh' : 'image'} size={15} /><span>{error ? t('photos.retry') : t('photos.show')}</span></button></div>
  </div>;
}
/** 그리는 중 · 차례를 기다리는 사진 (움직임을 줄이는 설정이면 반짝이지 않는다) */
const Waiting = ({ kind, state, w, h }: { kind: PhotoKind; state: string; w?: number; h?: number }) =>
  <div className={'ph-pic ph-wait ' + state} role="status" style={{ aspectRatio: ratio(w, h) }}><KindIcon kind={kind} size={22} /><small>{state === 'drawing' ? t('photos.state.drawing') : t('photos.state.queued')}</small></div>;

// ════════ 대화: 보낸 사진 말풍선 ════════
/** 답장에 실려 보낸 사진 한 장 (src/photos/chat 이 보낸 자리에 놓는다) */
export function SentBubble({ chat, m, sw, p }: { chat: Chat; m: Msg; sw: Swipe; p: SentPhoto }) {
  useEvents('photos:changed', 'illust:jobs');
  const it = slotOf(sw, p), img = it?.id && !Illust.missing(it.id) ? it.id : '', st = stateOf(sentKey(chat.id, m.id, p.id), !!img), cf = it?.versions?.[it.sel ?? 0]?.config, alt = p.alt || readable(p.shows) || p.shows;
  const draw = () => { if (!canDraw()) return toast(t('photos.err.noDraw'), 'err'); if (!drawSent(chat, m, p)) toast(t('photos.err.busy')); };
  const again = !!it && Illust.queue().some(j => j.slot === it.slotId && j.sw === sw && (j.state === 'waiting' || j.state === 'running'));   // 같은 자리에 다시 찍는 중
  if (st.state === 'done' && it) return <button type="button" className={'ph-pic' + (again ? ' busy' : '')} aria-busy={again || undefined} title={alt} aria-label={t('photos.view', { alt })} onClick={() => slotViewer(m, sw, it)}><Pic id={img} alt={alt} w={cf?.width} h={cf?.height} /></button>;
  if (st.state === 'queued' || st.state === 'drawing') return <Waiting kind={p.kind} state={st.state} />;
  return <PhotoCard kind={p.kind} alt={alt} error={st.error} onDraw={draw} />;
}

// ════════ 갤러리: 사진 ════════
/** 목록용 작은 그림: 화면 가까이 올 때만 만든다 */
function Thumb({ item }: { item: PhotoItem }) {
  const [, bump] = useState(0), small = Photos.thumb(item);
  useEffect(() => { if (small || item.source === 'feed' || !item.image) return; const release = Illust.thumbHold(item.image), off = Illust.onPic(() => { if (Photos.thumb(item)) bump(n => n + 1); }); return () => { off(); release(); }; }, [item, small]);
  return small ? <img src={small} alt={item.alt} decoding="async" /> : <i className="sb-thumb-wait" aria-hidden="true" />;
}
const STATE_KEY: Record<string, string> = { text: 'photos.state.text', queued: 'photos.state.queued', drawing: 'photos.state.drawing', failed: 'photos.state.failed', done: '' };
const missing = (x: PhotoItem) => x.state === 'text' || x.state === 'failed';
/** 글로만 있는 사진 하나를 펴 본다: 설명 · 어디서 왔는지 + 만들기 (한 장은 묻지 않는다) */
function openText(item: PhotoItem) {
  const when = new Date(item.ts).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const chatOk = item.source === 'sent' && !!item.chatId && !!S.get('chats', item.chatId);
  openModal({ title: '', cls: 'col ph-sheet', actions: [
    chatOk && { label: t('photos.goChat'), ic: 'chat', cls: 'ghost', onclick: () => { go('chat', item.chatId as string); setTimeout(() => chatApi.scrollTo(item.msgId as string), 500); } },
    item.source === 'album' && { label: t('photos.album.drop'), ic: 'trash', cls: 'ghost', onclick: () => { void dropAlbum(item.chatId as string, item.id.split('|')[2]); } },
    { label: t('photos.make'), ic: 'image', cls: 'primary', onclick: () => { void Photos.generate([item.id]); } }] },
    () => <><div className="ph-sheet-top"><span className="ph-card-ic"><KindIcon kind={item.kind} size={22} /></span><div className="col"><b>{item.alt}</b><small className="hint">{[t('photos.kind.' + item.kind), t('photos.src.' + item.source), when].join(' · ')}</small></div></div>
      {readable(item.shows) && readable(item.shows) !== item.alt ? <p className="hint ph-shows" lang="en">{readable(item.shows)}</p> : null}<p className="hint">{costLine(1)}</p></>);
}
/** 갤러리의 「사진」: 이 대화(또는 게시판)의 사진. 위의 세 칸 — 전부 만들기 · 골라서 만들기 · 하나씩 */
export function PhotosView({ chatId, feed = false, query = '' }: { chatId?: string; feed?: boolean; /** 찾기 (설명 · 영어 설명) */ query?: string }) {
  const [items, setItems] = useState<PhotoItem[] | null>(null), [picking, setPicking] = useState(false), [sel, setSel] = useState<Set<string>>(() => new Set()), [filling, setFilling] = useState(false);
  const alive = useRef(true), timer = useRef(0);
  useEffect(() => {
    alive.current = true;
    const load = async () => { const list = feed ? Photos.feed() : chatId ? await Photos.list(chatId) : []; if (alive.current) setItems(list); };
    const soon = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => void load(), 120); };   // 여러 알림이 한꺼번에 와도 한 번만 다시 읽는다
    void load();
    const offs = ['photos:changed', 'illust:jobs', 'feed:changed'].map(e => on(e, soon));
    return () => { alive.current = false; clearTimeout(timer.current); offs.forEach(f => f()); };
  }, [chatId, feed]);
  if (!items) return <p className="hint" role="status">{t('photos.loading')}</p>;
  const q = query.trim().toLowerCase(), shown = q ? items.filter(x => `${x.alt} ${x.shows}`.toLowerCase().includes(q)) : items;
  const todo = shown.filter(missing), done = shown.filter(x => x.state === 'done').length, busy = shown.filter(x => x.state === 'queued' || x.state === 'drawing').length;
  const all = () => void Photos.generate(todo.map(x => x.id));
  const next = () => { const x = todo[0]; if (x) void Photos.generate([x.id]); };
  const flip = (id: string) => setSel(p => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const stop = () => { setPicking(false); setSel(new Set()); };
  const makeSel = async () => { const ids = todo.filter(x => sel.has(x.id)).map(x => x.id); if (!ids.length) return; const r = await Photos.generate(ids); if (r.queued) stop(); };
  const fill = async () => {
    if (!chatId || filling) return; setFilling(true);
    try { const made = await Photos.describe(chatId); toast(tn('photos.album.made', made.length), 'ok'); } catch (e) { toast(t('photos.album.fail', { err: errText(e) }), 'err'); } finally { if (alive.current) setFilling(false); }
  };
  const tile = (x: PhotoItem) => {
    const picked = sel.has(x.id), can = missing(x), label = STATE_KEY[x.state] ? t(STATE_KEY[x.state]) : new Date(x.ts).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' });
    const click = () => picking ? (can && flip(x.id)) : x.state === 'done' ? void Photos.open(x) : can ? openText(x) : undefined;
    return <button key={x.id} type="button" className={'sb-shot ph-shot ' + x.state + (picked ? ' picked' : '')} title={x.alt} aria-label={t('photos.view', { alt: x.alt })} {...(picking ? { 'aria-pressed': picked, disabled: !can } : {})} onClick={click}>
      {x.state === 'done' ? <Thumb item={x} /> : <i className="ph-shot-card"><KindIcon kind={x.kind} size={20} /><span>{x.alt}</span></i>}
      {picking && can ? <i className="sb-shot-pick" aria-hidden="true">{picked ? <Icon name="check" size={13} /> : null}</i> : null}
      <small>{label}</small></button>;
  };
  return <div className="ph-view">
    <p className="hint" role="status">{shown.length ? t('photos.count', { n: shown.length, done, todo: todo.length }) + (busy ? ' · ' + tn('photos.busyN', busy) : '') : feed ? t('photos.emptyFeed') : t('photos.empty')}</p>
    {/* 세 칸: 전부 · 골라서 · 하나씩 (그릴 것이 없으면 잠긴다) */}
    <div className="sb-quick sb-tiles ph-tiles">
      <Btn label={tn('photos.all', todo.length)} ic="image" disabled={!todo.length} onClick={all} />
      <Btn label={picking ? t('photos.pickStop') : t('photos.pick')} ic="check" cls={picking ? 'on' : ''} disabled={!todo.length && !picking} onClick={() => (picking ? stop() : setPicking(true))} />
      <Btn label={t('photos.next')} ic="right" disabled={!todo.length} onClick={next} />
    </div>
    {picking ? <div className="sb-gal-pickbar ph-pickbar" role="status"><b>{t('photos.picked', { n: sel.size })}</b>
      <button type="button" className="btn ghost" onClick={() => setSel(todo.every(x => sel.has(x.id)) ? new Set() : new Set(todo.map(x => x.id)))}>{todo.every(x => sel.has(x.id)) ? t('photos.pickNone') : t('photos.pickAll', { n: todo.length })}</button>
      <button type="button" className="btn primary" disabled={!sel.size} onClick={() => void makeSel()}><Icon name="image" size={15} />{tn('photos.makeN', sel.size)}</button></div> : null}
    <div className="sb-gallery ph-grid">{shown.map(tile)}{!shown.length ? <Empty>{feed ? t('photos.emptyFeedLong') : t('photos.emptyLong')}</Empty> : null}</div>
    {/* 앨범 채우기: 누를 때만 (모델 호출 1번 · 그림은 그리지 않는다) */}
    {!feed && chatId ? <div className="ph-album"><span className="hint">{t('photos.album.hint', { n: cfg().albumN })}</span><Btn label={filling ? t('photos.album.busy') : t('photos.album.fill')} ic="sparkle" cls="ghost" disabled={filling} onClick={() => void fill()} /></div> : null}
  </div>;
}
/** 게시판 사진을 모아 보는 창 */
export function openFeedPhotos() { openModal({ title: t('photos.feedTitle'), wide: true, cls: 'col ph-modal' }, () => <PhotosView feed />); }

// ════════ 설정: 대화 모드의 삽화 ════════
/** 장면처럼 · 사진 주고받기 (삽화 작업실의 자동 처리 묶음 안) */
export function TalkTiles({ onChange }: { onChange?: () => void }) {
  const c = cfg();
  return <div className="sb-wf-src ph-talk"><span className="field-label">{t('photos.talk.label')}</span>
    <div className="sb-wf-tiles" role="radiogroup" aria-label={t('photos.talk.label')}>{(['scene', 'photo'] as const).map(id => { const sel = c.talk === id;
      return <button key={id} type="button" role="radio" aria-checked={sel} className={'sb-wf-tile' + (sel ? ' on' : '')} onClick={() => { if (!sel) { setCfg({ talk: id }); onChange?.(); } }}><b>{t('photos.talk.' + id)}</b><small>{t('photos.talk.' + id + 'Sub')}</small></button>; })}</div>
    <p className="hint">{t('photos.talk.' + c.talk + 'Help')}</p></div>;
}

// ════════ 밤의 게시판 ════════
/** 그림 설명만 있는 게시판 글의 사진 카드 (그리면 글의 그림 칸이 된다) */
export function FeedPhotoCard({ id, kind, alt }: { id: string; kind: PhotoKind; alt: string }) {
  useEvents('feed:changed', 'illust:jobs', 'photos:changed');
  const key = 'f|' + id, st = stateOf(key, false);
  if (st.state === 'queued' || st.state === 'drawing') return <div className="ph-feed"><Waiting kind={kind} state={st.state} /></div>;
  return <div className="ph-feed"><PhotoCard kind={kind} alt={alt} error={st.error} compact onDraw={() => void Photos.generate([key])} /></div>;
}
/** 타임라인 위의 한 줄: 글로만 있는 사진 N장 · 모아 보기 */
export function FeedPhotosBar() {
  useEvents('feed:changed', 'illust:jobs', 'photos:changed');
  const todo = Photos.feed().filter(missing).length; if (!todo) return null;
  return <div className="ph-feedbar"><span><KindIcon kind="shot" size={16} />{tn('photos.feedBar', todo)}</span><button type="button" className="fd-link" onClick={openFeedPhotos}>{t('photos.feedOpen')}</button></div>;
}
