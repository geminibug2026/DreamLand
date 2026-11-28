// 밤의 게시판 (휴대폰 안): 기존 게시판(src/feed)의 자료와 새로 고침을 그대로 쓰고, 휴대폰의 모양으로 다시 그린다.
// 화면: 타임라인 · 사진 격자, 게시물(답글 타래와 내 답글), 새 글(사진 앱의 그림 한 장까지), 프로필(나 · 캐릭터), 알림.
// 모델 호출은 누를 때만: 「새 글 받기」 = 게시판 새로 고침 1번, 「답글 받기」 = 그 글에 대한 작은 호출 1번. 열 때 · 시간 따라 부르지 않는다
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Art, useEvents } from '../../kit';
import { S } from '../../lib/core';
import { Illust } from '../../lib/illust';
import { go } from '../../lib/router';
import { confirmBox, menu, promptBox, toast } from '../../ui';
import { t, tn } from '../../i18n';
import { Photos, type PhotoItem } from '../../photos/api';
import { feedPhoto } from '../../photos/prompt';
import { ME, type Note } from '../../feed/types';
import { threadOf, unseen, visible } from '../../feed/logic';
import { F, account, answerNow, cfg, echo, editText, facingOf, imgOf, like, markSeen, members, myAccount, personaFor, post, redraw, refresh, remove, run, setPersonaFor } from '../../feed/store';
import { linkedPersona, pickedPersona } from '../../feed/persona';
import { openMembers, openSettings, pickMembers } from '../../feed/ui';
import { readDataURL, shrinkImage } from '../../lib/core';
import { Emb, Fill, Glyph } from '../art';
import { AppHead, Empty, Face, IBtn, Seg, agoText, usePhone } from '../ui';
import { talkChats } from '../data';

type Screen = { k: 'note'; id: string } | { k: 'profile'; id: string } | { k: 'compose' } | { k: 'notices' };
const PAGE = 30;

/** 계정의 얼굴 · 이름 · 손잡이 · 소개 (나는 페르소나, 캐릭터는 그 카드) */
function who(id: string, n?: Note) {
  const a = account(id);
  // 내 글은 그 글이 향한 캐릭터에게 보이는 페르소나로 (내 새 글은 지금 페르소나)
  if (id === ME) { const p = personaFor(n ? facingOf(n, F.notes) : null); return { o: p || null, name: p?.name || t('feed.me'), handle: a?.handle || 'me', bio: a?.bio || '' }; }
  const c = S.get('chars', id); return { o: c || null, name: c?.name || t('feed.gone'), handle: a?.handle || '—', bio: a?.bio || String(c?.description || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
}
const picsOf = (n: Note) => [n.image, ...(n.images || [])].map(id => imgOf(id)).filter(Boolean);
const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };
const repliesOf = (id: string) => F.notes.filter(x => x.root === id && visible(x)).length;

/** 그림: 그린 것은 격자로, 그림 설명만 있으면 글로만 있는 사진 카드 (누르면 사진 입구가 그린다) */
function Pics({ n, big }: { n: Note; big?: boolean }) {
  const pics = picsOf(n);
  const busyNow = run.drawing.has(n.id);
  if (pics.length) return <div className={'pn-post-pics n' + Math.min(4, pics.length) + (big ? ' big' : '')}>{pics.slice(0, 4).map((src, i) => <img key={i} src={src} alt="" decoding="async" />)}
    {n.imagePrompt ? <button type="button" className={'pn-pic-redo' + (busyNow ? ' busy' : '')} disabled={busyNow} aria-label={t('phone.sns.redraw')} title={t('phone.sns.redraw')} onClick={stop(() => void redraw(n.id))}><Glyph name={busyNow ? 'clock' : 'redo'} size={16} />{busyNow ? <span>{t('photos.state.drawing')}</span> : null}</button> : null}</div>;
  if (!n.imagePrompt) return null;
  const p = feedPhoto(n.imagePrompt), busy = run.drawing.has(n.id);
  return <button type="button" className="pn-post-photo" disabled={busy} onClick={stop(() => void Photos.generate(['f|' + n.id]))} aria-label={t('phone.ph.makeOne') + ': ' + p.alt}>
    <Fill name="camera" size={18} /><span>{p.alt}</span><small>{busy ? t('photos.state.drawing') : t('phone.ph.makeOne')}</small></button>;
}
/** 답글 · 재게시 · 마음 (누른 것은 하늘색으로 찬다) */
function Acts({ n, onReply }: { n: Note; onReply?: () => void }) {
  const liked = n.likes.includes(ME), echoed = n.echoes.includes(ME), r = n.root ? 0 : repliesOf(n.id);
  return <div className="pn-post-acts">
    <button type="button" aria-label={t('feed.act.reply')} title={t('feed.act.reply')} onClick={stop(() => onReply?.())}><Glyph name="reply" size={17} /><span>{r || ''}</span></button>
    <button type="button" className={echoed ? 'on' : undefined} aria-pressed={echoed} aria-label={t('feed.act.echo')} title={t('feed.act.echo')} onClick={stop(() => echo(n.id))}><Glyph name="repost" size={17} /><span>{n.echoes.length || ''}</span></button>
    <button type="button" className={liked ? 'on' : undefined} aria-pressed={liked} aria-label={t('feed.act.like')} title={t('feed.act.like')} onClick={stop(() => like(n.id))}>{liked ? <Fill name="heart" size={17} /> : <Glyph name="heart" size={17} />}<span>{n.likes.length || ''}</span></button>
  </div>;
}
/** 글 한 줄 (타임라인 · 프로필) */
function Post({ n }: { n: Note }) {
  const P = usePhone(), w = who(n.by, n), open = () => P.open('board', { k: 'note', id: n.root || n.id } as Screen);
  return <li><article className="pn-post" onClick={open}>
    <button type="button" className="pn-post-face" aria-label={w.name} onClick={stop(() => P.open('board', { k: 'profile', id: n.by } as Screen))}><Face o={w.o} size={40} /></button>
    <div className="pn-post-body">
      <div className="pn-post-who"><b>{w.name}</b><span>@{w.handle} · {agoText(n.ts)}</span></div>
      {n.text ? <p className="pn-post-text">{n.text}</p> : null}
      <Pics n={n} />
      <Acts n={n} onReply={open} />
    </div>
  </article></li>;
}

/** 첫 화면: 타임라인 · 사진 */
function Home() {
  const P = usePhone(), [tab, setTab] = useState<'time' | 'photo'>('time'), [shown, setShown] = useState(PAGE);
  const roots = F.notes.filter(n => !n.root && visible(n)).slice().reverse(), news = unseen(F), mem = members(F).length;
  const withPics = roots.filter(n => picsOf(n).length || n.imagePrompt);
  const doRefresh = async () => { const n = await refresh(); toast(n ? tn('phone.sns.got', n) : t('phone.sns.gotNone'), n ? 'ok' : undefined); };
  return <div className="pn-appbody">
    <AppHead title={t('phone.app.board')} big right={<>
      <button type="button" className="pn-ib pn-bell" aria-label={news ? tn('phone.sns.noticesN', news) : t('feed.notices.title')} title={t('feed.notices.title')} onClick={() => P.open('board', { k: 'notices' } as Screen)}><Glyph name="bell" />{news ? <i className="pn-new" aria-hidden="true" /> : null}</button>
      {mem ? <IBtn ic="edit" label={t('phone.sns.write')} onClick={() => P.open('board', { k: 'compose' } as Screen)} /> : null}
      <IBtn ic="sliders" label={t('phone.sns.manage')} onClick={e => menu(e.currentTarget, [
        { label: t('feed.members.pick'), ic: 'users', onclick: () => void pickMembers() },
        { label: t('phone.sns.editMembers'), ic: 'user', onclick: () => openMembers() },
        { label: t('feed.set.title'), ic: 'sliders', onclick: () => openSettings() },
        ...(P.inPage ? [] : [{ label: t('phone.sns.openBoard'), ic: 'link', onclick: () => P.leave(() => go('feed')) }]),
      ])} /></>} />
    {!mem ? <Empty art={<Emb kind="book" className="pn-empty-art" />} title={t('phone.sns.noMembers')} text={t('phone.sns.noMembersHint')}><button type="button" className="pn-btn" onClick={() => void pickMembers()}>{t('phone.sns.pickMembers')}</button></Empty> : <>
      <Seg label={t('phone.app.board')} value={tab} onChange={k => { setTab(k); setShown(PAGE); }} opts={[['time', t('phone.sns.timeline')], ['photo', t('phone.sns.photos')]] as const} />
      <button type="button" className={'pn-sns-refresh' + (run.busy ? ' busy' : '')} disabled={run.busy} onClick={() => void doRefresh()}>
        <i className="pn-song-ic"><Glyph name={run.busy ? 'clock' : 'spark'} size={18} /></i><span><b>{run.busy ? t('feed.refresh.busy') : t('phone.sns.refresh')}</b><small>{t('feed.cost.one')}</small></span></button>
      {tab === 'time'
        ? (roots.length ? <ul className="pn-posts">{roots.slice(0, shown).map(n => <Post key={n.id} n={n} />)}</ul> : <Empty title={t('feed.empty.allTitle')} text={t('phone.sns.emptyHint')} />)
        : (withPics.length ? <ul className="pn-phgrid pn-sns-grid">{withPics.slice(0, shown).map(n => { const src = picsOf(n)[0], alt = n.imagePrompt ? feedPhoto(n.imagePrompt).alt : n.text;
          return <li key={n.id} className={'pn-ph ' + (src ? 'done' : 'text')}><button type="button" className="pn-ph-btn" aria-label={t('phone.ph.view', { alt: alt || t('feed.picture') })} onClick={() => P.open('board', { k: 'note', id: n.id } as Screen)}>
            {src ? <img src={src} alt="" decoding="async" /> : <span className="pn-ph-desc"><Glyph name="image" size={16} /><span>{alt}</span><em>{t('phone.ph.textOnly')}</em></span>}</button></li>; })}</ul>
          : <Empty title={t('phone.sns.noPhotos')} text={t('phone.sns.noPhotosHint')} />)}
      {(tab === 'time' ? roots : withPics).length > shown ? <button type="button" className="pn-btn ghost wide" onClick={() => setShown(s => s + PAGE)}>{tn('phone.more', (tab === 'time' ? roots : withPics).length - shown)}</button> : null}
    </>}
  </div>;
}

/** 휴대폰(기기)에 있는 사진 한 장을 고른다 → 게시판에 붙일 크기로 줄여서 */
function pickDevice(): Promise<Pic | null> {
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return res(null);
      try { const raw = await readDataURL(f), data = (await shrinkImage(raw, 1600, 'image/jpeg', 0.86)) || raw; res({ src: data, data }); }
      catch { toast(t('phone.sns.photoFail'), 'err'); res(null); }
    };
    inp.click();
  });
}
type Pic = { src: string; data: string };
/** 붙일 사진 고르기: 사진 앱(이야기 속 사진) · 기기(내 휴대폰의 사진) */
const choosePic = (el: Element, fromGallery: () => void, got: (p: Pic) => void) => menu(el, [
  { label: t('phone.sns.fromGallery'), ic: 'image', onclick: fromGallery },
  { label: t('phone.sns.fromDevice'), ic: 'upload', onclick: () => void pickDevice().then(p => { if (p) got(p); }) },
]);
/** 내 답글 칸 (사진 붙이기 + 한 줄 입력 + 보내기) */
function ReplyBox({ root, re, name }: { root: string; re?: string; name: string }) {
  const [v, setV] = useState(''), [busy, setBusy] = useState(false), [pic, setPic] = useState<Pic | null>(null), [picking, setPicking] = useState(false);
  const send = async () => { const s = v.trim(); if ((!s && !pic) || busy) return; setBusy(true); try { await post(s, { root, re, image: pic?.data }); setV(''); setPic(null); } finally { setBusy(false); } };
  return <>
    {pic ? <div className="pn-sns-pic sm"><img src={pic.src} alt="" /><button type="button" className="pn-rb" aria-label={t('feed.write.dropImage')} title={t('feed.write.dropImage')} onClick={() => setPic(null)}><Glyph name="x" size={16} /></button></div> : null}
    <form className="pn-sns-reply" onSubmit={e => { e.preventDefault(); void send(); }}>
      <button type="button" className="pn-sns-addpic" aria-label={t('phone.sns.addPhoto')} title={t('phone.sns.addPhoto')} onClick={e => choosePic(e.currentTarget, () => setPicking(true), setPic)}><Glyph name="image" size={20} /></button>
      <input value={v} maxLength={cfg().limit} placeholder={t('feed.replyingTo', { name: '@' + name })} aria-label={t('feed.act.reply')} enterKeyHint="send" onChange={e => setV(e.target.value)} />
      <button type="submit" className="pn-mbtn" disabled={(!v.trim() && !pic) || busy} aria-label={t('phone.notif.send')} title={t('phone.notif.send')}><Glyph name="next" size={18} /></button></form>
    {picking ? <PickPhoto onPick={p => { setPic(p); setPicking(false); }} onClose={() => setPicking(false)} /> : null}
  </>;
}
/** 게시물 하나와 답글 타래 */
function Detail({ id }: { id: string }) {
  const P = usePhone(), n = F.notes.find(x => x.id === id), [to, setTo] = useState<string | undefined>(undefined), box = useRef<HTMLDivElement>(null);
  if (!n) return <div className="pn-appbody"><AppHead title={t('phone.sns.post')} /><Empty title={t('phone.sns.gone')} /></div>;
  const w = who(n.by, n), thread = threadOf(F.notes, n.id), mineIn = [n, ...thread.map(x => x.n)].filter(x => x.by === ME).pop();
  const waiting = run.answering === mineIn?.id;
  const reTo = (x: Note) => { setTo(x.id); requestAnimationFrame(() => box.current?.querySelector('input')?.focus()); };
  // 답글 고치기 · 지우기 (지우면 그 답글에 달린 답글도 함께)
  const fix = async (x: Note) => { const v = await promptBox(t('feed.act.editReply'), x.text, { area: true }); if (v != null) editText(x.id, v); };
  const drop = async (x: Note) => { if (await confirmBox(t('feed.act.deleteReplyAsk'), t('common.delete'), true)) { if (to === x.id) setTo(undefined); await remove(x.id); } };
  return <div className="pn-appbody">
    <AppHead title={t('phone.sns.post')} />
    <article className="pn-card pn-post-big">
      <button type="button" className="pn-post-head" onClick={() => P.open('board', { k: 'profile', id: n.by } as Screen)}><Face o={w.o} size={44} /><span><b>{w.name}</b><small>@{w.handle}</small></span></button>
      {n.text ? <p className="pn-post-text big">{n.text}</p> : null}
      <Pics n={n} big />
      <small className="pn-post-time">{new Date(n.ts).toLocaleString(undefined, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
      <Acts n={n} onReply={() => reTo(n)} />
    </article>
    {thread.length ? <ul className="pn-thread">{thread.map(({ n: r, depth }) => { const rw = who(r.by, r); return <li key={r.id} className={depth ? 'deep' : undefined}>
      <button type="button" className="pn-post-face" aria-label={rw.name} onClick={() => P.open('board', { k: 'profile', id: r.by } as Screen)}><Face o={rw.o} size={32} /></button>
      <div className="pn-post-body"><div className="pn-post-who"><b>{rw.name}</b><span>{agoText(r.ts)}</span></div>{r.text ? <p className="pn-post-text">{r.text}</p> : null}<Pics n={r} />
        <div className="pn-thread-do"><button type="button" onClick={() => reTo(r)}>{t('feed.act.reply')}</button><button type="button" className={r.likes.includes(ME) ? 'on' : undefined} aria-pressed={r.likes.includes(ME)} onClick={() => like(r.id)}>{t('feed.act.like')}{r.likes.length ? ' ' + r.likes.length : ''}</button><button type="button" className="pn-thread-own" onClick={() => void fix(r)}>{t('feed.act.edit')}</button><button type="button" onClick={() => void drop(r)}>{t('common.delete')}</button></div></div></li>; })}</ul>
      : <p className="pn-hint pn-center">{t('phone.sns.noReplies')}</p>}
    {mineIn ? <button type="button" className={'pn-sns-refresh' + (waiting ? ' busy' : '')} disabled={run.busy || !!run.answering} onClick={() => void answerNow(mineIn.id)}>
      <i className="pn-song-ic"><Glyph name={waiting ? 'clock' : 'spark'} size={18} /></i><span><b>{waiting ? t('feed.act.answering') : t('phone.sns.getReplies')}</b><small>{t('feed.cost.one')}</small></span></button> : null}
    <div ref={box}><ReplyBox root={n.id} re={to && to !== n.id ? to : undefined} name={who(to ? F.notes.find(x => x.id === to)?.by || n.by : n.by).handle} /></div>
  </div>;
}

/** 프로필: 얼굴 · 이름 · @손잡이 · 한 줄 소개, 그 계정의 글 */
function Profile({ id }: { id: string }) {
  const P = usePhone(), w = who(id), list = F.notes.filter(n => n.by === id && !n.root && visible(n)).slice().reverse();
  const hearts = list.reduce((a, n) => a + n.likes.length, 0), chat = id !== ME ? talkChats().find(c => c.charIds.length === 1 && c.charIds[0] === id) : undefined;
  return <div className="pn-appbody pn-contact">
    <AppHead title="" right={id === ME ? <IBtn ic="edit" label={t('phone.sns.write')} onClick={() => P.open('board', { k: 'compose' } as Screen)} /> : null} />
    <Art o={w.o} className="pn-contact-art">{!w.o?.avatar ? <Emb kind={id === ME ? 'window' : 'teacup'} /> : null}</Art>
    <h2 className="pn-contact-name">{w.name}</h2>
    <p className="pn-contact-st">@{w.handle}</p>
    {w.bio ? <p className="pn-sns-bio">{w.bio}</p> : null}
    <div className="pn-sns-stats"><span><b>{list.length}</b><small>{t('phone.sns.posts')}</small></span><span><b>{hearts}</b><small>{t('phone.sns.hearts')}</small></span>
      {chat ? <button type="button" onClick={() => P.toChat(chat)}><b><Fill name="messages" size={18} /></b><small>{t('phone.app.messages')}</small></button> : null}</div>
    {id !== ME && S.personas.length > 1 ? <label className="pn-sns-persona"><small>{t('phone.sns.personaFor')}</small>
      <select className="pn-select" value={pickedPersona(id)} onChange={e => setPersonaFor(id, e.target.value)}>
        <option value="">{t('phone.sns.personaAuto', { name: linkedPersona(id)?.name || t('feed.me') })}</option>
        {S.personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label> : null}
    {list.length ? <ul className="pn-posts">{list.slice(0, 40).map(n => <Post key={n.id} n={n} />)}</ul> : <p className="pn-hint pn-center">{t('phone.sns.noPostsYet')}</p>}
  </div>;
}

/** 새 글: 내 얼굴 · 글 · (사진 앱의 그림 한 장) */
function Compose() {
  const P = usePhone(), [text, setText] = useState(''), [pic, setPic] = useState<{ src: string; data: string } | null>(null), [picking, setPicking] = useState(false), [busy, setBusy] = useState(false);
  const limit = cfg().limit, me = who(ME), can = !busy && text.length <= limit && (!!text.trim() || !!pic);
  const send = async () => { if (!can) return; setBusy(true); try { myAccount(); const n = await post(text, { image: pic?.data }); if (n) { toast(t('phone.sns.posted'), 'ok'); P.back(); } } finally { setBusy(false); } };
  return <div className="pn-appbody">
    <AppHead title={t('phone.sns.write')} right={<button type="button" className="pn-btn sm" disabled={!can} onClick={() => void send()}>{t('feed.write.pin')}</button>} />
    <div className="pn-card pn-sns-compose">
      <Face o={me.o} size={40} />
      <textarea autoFocus rows={5} value={text} maxLength={limit + 40} placeholder={t('feed.write.ph')} aria-label={t('phone.sns.write')} onChange={e => setText(e.target.value)} />
    </div>
    {pic ? <div className="pn-sns-pic"><img src={pic.src} alt="" /><button type="button" className="pn-rb" aria-label={t('feed.write.dropImage')} title={t('feed.write.dropImage')} onClick={() => setPic(null)}><Glyph name="x" size={16} /></button></div> : null}
    <div className="pn-pair"><button type="button" className="pn-btn ghost" onClick={() => setPicking(true)}><Fill name="photos" size={17} />{t('phone.sns.fromGallery')}</button><button type="button" className="pn-btn ghost" onClick={() => void pickDevice().then(p => { if (p) setPic(p); })}><Glyph name="image" size={17} />{t('phone.sns.fromDevice')}</button></div>
    <span className={'pn-sns-count' + (text.length > limit ? ' over' : '')}>{text.length} / {limit}</span>
    {picking ? <PickPhoto onPick={p => { setPic(p); setPicking(false); }} onClose={() => setPicking(false)} /> : null}
  </div>;
}
/** 사진 앱에서 그린 사진 한 장 고르기 (대화 모드 방들의 최근 사진) */
function PickPhoto({ onPick, onClose }: { onPick: (p: { src: string; data: string }) => void; onClose: () => void }) {
  const [list, setList] = useState<PhotoItem[] | null>(null);
  useEffect(() => { let live = true; void (async () => { const out: PhotoItem[] = []; for (const c of talkChats().slice(0, 8)) { out.push(...(await Photos.list(c.id).catch(() => [] as PhotoItem[])).filter(x => x.state === 'done' && x.image)); if (!live) return; } const seen = new Set<string>(); setList(out.sort((a, b) => b.ts - a.ts).filter(x => { const parts = x.id.split('|'), ks = [x.source === 'sent' && parts[3] ? 'sp:' + parts[3] : x.source === 'album' && parts[2] ? 'ap:' + parts[2] : x.id, 'img:' + x.image]; if (ks.some(k => seen.has(k))) return false; ks.forEach(k => seen.add(k)); return true; }).slice(0, 30));   /* 갈라 낸 방에 복사된 같은 사진은 한 장만 */ })(); return () => { live = false; }; }, []);
  const take = async (p: PhotoItem) => { const data = await Illust.dataOf(p.image); if (data) onPick({ src: Photos.thumb(p) || data, data }); else toast(t('phone.ph.gone')); };
  return <div className="pn-sheet-veil" onClick={onClose}><div className="pn-sheet" role="dialog" aria-label={t('phone.sns.fromGallery')} onClick={e => e.stopPropagation()}>
    <i className="pn-sheet-grab" aria-hidden="true" /><h3>{t('phone.sns.fromGallery')}</h3>
    {!list ? <p className="pn-wait">{t('phone.loading')}</p> : !list.length ? <p className="pn-hint">{t('phone.sns.noGallery')}</p>
      : <ul className="pn-phgrid pn-sns-grid">{list.map(p => <li key={p.id} className="pn-ph done"><button type="button" className="pn-ph-btn" aria-label={p.alt || p.shows} onClick={() => void take(p)}><Thumb p={p} /></button></li>)}</ul>}
  </div></div>;
}
function Thumb({ p }: { p: PhotoItem }) {
  const [, bump] = useState(0), u = Photos.thumb(p);
  useEffect(() => { if (u || !p.image) return; const rel = Illust.thumbHold(p.image), off = Illust.onPic(() => bump(n => n + 1)); return () => { off(); rel(); }; }, [p.image, u]);
  return u ? <img src={u} alt="" decoding="async" /> : <i className="pn-ph-wait" aria-hidden="true" />;
}

/** 알림: 내 글에 온 마음 · 답글 · 재게시 · 투표. 열면 읽은 것으로 */
function Notices() {
  const P = usePhone(), list = useMemo(() => F.notices.slice().sort((a, b) => b.ts - a.ts).slice(0, 60), [F.notices.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const seen = useRef(F.seenAt).current;
  useEffect(() => { markSeen(); }, []);
  return <div className="pn-appbody">
    <AppHead title={t('feed.notices.title')} big />
    {!list.length ? <Empty art={<Emb kind="book" className="pn-empty-art" />} title={t('feed.notices.noneTitle')} text={t('feed.notices.none')} />
      : <ul className="pn-list">{list.map(q => { const w = who(q.by), n = F.notes.find(x => x.id === q.note), root = n?.root || n?.id;
        return <li key={q.id}><button type="button" className={'pn-row' + (q.ts > seen ? ' fresh' : '')} disabled={!root} onClick={() => root && P.open('board', { k: 'note', id: root } as Screen)}>
          <Face o={w.o} size={38} /><span><b>{w.name} <em className="pn-dim">{t('feed.notices.' + q.kind)}</em></b><small>{n?.text || t('feed.picture')}</small></span><time>{agoText(q.ts)}</time></button></li>; })}</ul>}
  </div>;
}

export function Board({ arg }: { arg?: unknown }) {
  useEvents('feed:changed', 'chars');
  const s = (arg && typeof arg === 'object' ? arg : null) as Screen | null;
  let body: ReactNode;
  switch (s?.k) {
    case 'note': body = <Detail id={s.id} />; break;
    case 'profile': body = <Profile id={s.id} />; break;
    case 'compose': body = <Compose />; break;
    case 'notices': body = <Notices />; break;
    default: body = <Home />;
  }
  return body;
}
