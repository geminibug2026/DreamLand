// 밤의 게시판: 화면 — 타임라인(추천 / 팔로우 중) · 게시물 상세와 답글 타래 · 프로필 · 알림 · 글쓰기 · 오른쪽 보조 기둥 · 참여자와 설정 창
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar, useEvents } from '../kit';
import { S, pickFiles, readDataURL } from '../lib/core';
import { tint } from '../lib/tone';
import { Form, charPicker, confirmBox, toast } from '../ui';
import { openModal } from '../addons/parts';
import { fmtDate, t } from '../i18n';
import { ME, type Note, type Notice } from './types';
import { pairsFrom, relKey, threadOf, unseen, visible } from './logic';
import { F, account, cfg, follow, makeProfiles, markSeen, members, myAccount, post, refresh, run, save, setMembers, undo, wipe } from './store';
import { Acts, Face, Ic, Media, PollView, Row, agoLabel, back, faceOf, noteMenu, picsOf, show, view } from './parts';
import { FeedPhotosBar } from '../photos/ui';

// ── 글쓰기 ── 내 얼굴 + 자리글, 아래 줄에 그림 · 투표와 글자 수 고리, 오른쪽에 알약 단추
function Ring({ used, limit }: { used: number; limit: number }) {
  const left = limit - used, p = Math.min(1, used / limit), C = 2 * Math.PI * 9;
  return <span className={'fd-ring' + (left < 0 ? ' over' : left <= 20 ? ' near' : '')} role="img" aria-label={t('feed.write.left', { n: left })}>
    <svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="9" className="bg" /><circle cx="12" cy="12" r="9" className="fg" strokeDasharray={`${C * p} ${C}`} transform="rotate(-90 12 12)" /></svg>{left <= 20 ? <b>{left}</b> : null}</span>;
}
function Write({ root, re, onDone, autoFocus, focusKey }: { root?: string; re?: string; onDone?: () => void; autoFocus?: boolean; focusKey?: string }) {
  const [text, setText] = useState(''), [imgs, setImgs] = useState<string[]>([]), [poll, setPoll] = useState<{ q: string; opts: string[] } | null>(null), [busy, setBusy] = useState(false);
  const limit = cfg().limit, ta = useRef<HTMLTextAreaElement>(null), left = limit - text.length;
  const grow = () => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(260, el.scrollHeight) + 'px'; } };
  useEffect(() => { if (autoFocus || focusKey) ta.current?.focus(); }, [autoFocus, focusKey]);
  const pollOk = !poll || poll.opts.filter(o => o.trim()).length >= 2, can = !busy && left >= 0 && pollOk && (!!text.trim() || !!imgs.length || !!poll);
  const send = async () => { if (!can) return; setBusy(true); try { await post(text, { image: imgs[0], more: imgs.slice(1), poll: poll || undefined, root, re }); setText(''); setImgs([]); setPoll(null); requestAnimationFrame(grow); onDone?.(); } finally { setBusy(false); } };
  const attach = async () => { const fs = await pickFiles({ accept: 'image/*', multiple: !root }); const got = await Promise.all(fs.slice(0, 4).map(f => readDataURL(f))); if (got.length) setImgs(x => [...x, ...got].slice(0, root ? 1 : 4)); };
  const ph = root ? (re ? t('feed.replyingTo', { name: '@' + faceOf(F.notes.find(n => n.id === re)?.by || '').handle }) : t('feed.detail.replyPh')) : t('feed.write.ph');
  return <div className={'fd-write' + (root ? ' re' : '')}>
    <div className="fd-left"><Face id={ME} link={false} /></div>
    <div className="fd-body">
      <textarea ref={ta} className="fd-ta" rows={1} value={text} maxLength={limit + 60} placeholder={ph} aria-label={ph} onChange={e => { setText(e.target.value); grow(); }} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} />
      {imgs.length ? <div className={'fd-media n' + imgs.length}>{imgs.map((src, i) => <span key={i}><img src={src} alt="" /><button type="button" className="fd-media-x" aria-label={t('feed.write.dropImage')} onClick={() => setImgs(imgs.filter((_, j) => j !== i))}><Ic name="x" size={16} /></button></span>)}</div> : null}
      {poll ? <div className="fd-pollmake">
        <input className="fd-in" value={poll.q} maxLength={120} placeholder={t('feed.write.pollQ')} aria-label={t('feed.write.pollQ')} onChange={e => setPoll({ ...poll, q: e.target.value })} />
        {poll.opts.map((o, i) => <div className="fd-pollmake-row" key={i}><input className="fd-in" value={o} maxLength={40} placeholder={t('feed.write.pollOpt') + ' ' + (i + 1)} aria-label={t('feed.write.pollOpt') + ' ' + (i + 1)} onChange={e => setPoll({ ...poll, opts: poll.opts.map((x, j) => j === i ? e.target.value : x) })} />
          {poll.opts.length > 2 ? <button type="button" className="fd-ibtn" aria-label={t('common.delete')} onClick={() => setPoll({ ...poll, opts: poll.opts.filter((_, j) => j !== i) })}><Ic name="x" size={17} /></button> : null}</div>)}
        <div className="fd-pollmake-foot">{poll.opts.length < 4 ? <button type="button" className="fd-link" onClick={() => setPoll({ ...poll, opts: [...poll.opts, ''] })}>{t('feed.write.pollAdd')}</button> : <span />}<button type="button" className="fd-link dim" onClick={() => setPoll(null)}>{t('feed.write.pollDrop')}</button></div>
      </div> : null}
      <div className="fd-write-foot">
        <button type="button" className="fd-ibtn acc" disabled={imgs.length >= (root ? 1 : 4) || !!poll} title={t('feed.write.image')} aria-label={t('feed.write.image')} onClick={() => void attach()}><Ic name="image" /></button>
        {root ? null : <button type="button" className="fd-ibtn acc" disabled={!!imgs.length || !!poll} title={t('feed.write.poll')} aria-label={t('feed.write.poll')} onClick={() => setPoll({ q: '', opts: ['', ''] })}><Ic name="fdpoll" /></button>}
        <span className="fd-grow" />{text.length ? <Ring used={text.length} limit={limit} /> : null}
        <button type="button" className="fd-pill solid" disabled={!can} onClick={() => void send()}>{root ? t('feed.write.reply') : t('feed.write.pin')}</button>
      </div>
    </div>
  </div>;
}
function openCompose() { openModal({ title: '', wide: true, spec: 'div.fd-compose' }, close => <Write autoFocus onDone={close} />); }

/** 위에 붙는 머리: 뒤로 단추 + 제목 (+ 작은 설명) */
const Bar = ({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) =>
  <header className="fd-top"><div className="fd-bar"><button type="button" className="fd-ibtn" aria-label={t('feed.back')} onClick={back}><Ic name="fdback" size={20} /></button><div className="fd-head-t"><h2>{title}</h2>{sub ? <span className="fd-meta">{sub}</span> : null}</div>{children}</div></header>;
const Empty = ({ title, line, children }: { title: string; line?: string; children?: ReactNode }) => <div className="fd-none"><h3>{title}</h3>{line ? <p>{line}</p> : null}{children}</div>;

// ── 타임라인 ──
function Home() {
  const mem = members(F), mine = new Set([ME, ...(F.follows[ME] || [])]), news = unseen(F);
  const roots = F.notes.filter(n => !n.root && visible(n)), list = (view.tab === 'following' ? roots.filter(n => mine.has(n.by)) : roots).slice().reverse(), shown = list.slice(0, view.shown);
  const [, bump] = useState(0), setTab = (k: typeof view.tab) => { view.tab = k; view.shown = 30; bump(x => x + 1); };
  const doRefresh = async () => { const n = await refresh(); if (n) setTimeout(() => { run.fresh = new Set(); }, 5000); };
  return <>
    <header className="fd-top">
      <div className="fd-bar"><div className="fd-head-t"><h2>{t('feed.title')}</h2></div>
        <button type="button" className="fd-ibtn" aria-label={t('feed.notices.title') + (news ? ` (${news})` : '')} title={t('feed.notices.title')} onClick={() => show({ k: 'notices' })}><Ic name="fdbell" size={20} />{news ? <span className="fd-badge">{news > 9 ? '9+' : news}</span> : null}</button>
        <button type="button" className="fd-ibtn only-narrow" aria-label={t('feed.members.title')} title={t('feed.members.title')} onClick={openMembers}><Ic name="users" size={20} /></button>
        <button type="button" className="fd-ibtn only-narrow" aria-label={t('feed.set.title')} title={t('feed.set.title')} onClick={openSettings}><Ic name="gear" size={20} /></button></div>
      <div className="fd-tabs" role="tablist">{([['all', t('feed.tab.all')], ['following', t('feed.tab.following')]] as [typeof view.tab, string][]).map(([k, l]) => <button type="button" key={k} role="tab" aria-selected={view.tab === k} className={view.tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{l}</span></button>)}</div>
    </header>
    {!mem.length ? <Empty title={t('feed.welcome.title')} line={t('feed.first.line')}><button type="button" className="fd-pill solid big" onClick={pickMembers}>{t('feed.members.pick')}</button><p className="fd-meta">{t('feed.first.cost')}</p></Empty> : <>
      <div className="fd-inline-write"><Write /></div>
      <button type="button" className={'fd-band' + (run.busy ? ' busy' : '')} disabled={run.busy} onClick={() => void doRefresh()}>{run.busy ? t('feed.refresh.busy') : t('feed.band.new')}<small>{t('feed.cost.one')}</small>{run.busy ? <i className="fd-progress" aria-hidden="true" /> : null}</button>
      {F.last && !run.busy ? <UndoLine /> : null}
      <FeedPhotosBar />
      {shown.length ? shown.map(n => <Row key={n.id} n={n} fresh={run.fresh.has(n.id)} />) : <Empty title={view.tab === 'following' ? t('feed.empty.followingTitle') : t('feed.empty.allTitle')} line={view.tab === 'following' ? t('feed.empty.following') : t('feed.empty.all')} />}
      {list.length > shown.length ? <button type="button" className="fd-band" onClick={() => { view.shown += 30; bump(x => x + 1); }}>{t('feed.more', { n: list.length - shown.length })}</button> : null}
    </>}
  </>;
}
/** 방금 묶음 되돌리기: 타임라인 위의 작은 줄 */
function UndoLine() {
  const n = F.last?.notes.length || 0; if (!n) return null;
  return <div className="fd-undo"><span>{t('feed.undo.line', { n })}</span><button type="button" className="fd-link" title={t('feed.undo.hint')} onClick={async () => { if (await confirmBox(t('feed.undo.ask', { n }), t('feed.undo.go'))) { const k = await undo(); toast(t('feed.undo.done', { n: k }), 'ok'); } }}>{t('feed.undo.go')}</button></div>;
}

// ── 게시물 상세 ──
function Detail({ id }: { id: string }) {
  const n = F.notes.find(x => x.id === id), [re, setRe] = useState(''), [focus, setFocus] = useState('');
  if (!n) return <><Bar title={t('feed.detail.title')} /><Empty title={t('feed.detail.gone')} /></>;
  const f = faceOf(n.by), thread = threadOf(F.notes, n.id), reply = (rid = '') => { setRe(rid); setFocus(rid + ':' + Date.now()); };
  const names = n.echoes.map(x => faceOf(x).name);
  return <>
    <Bar title={t('feed.detail.title')} />
    <article className="fd-main" id={'fd-' + n.id}>
      {names.length ? <span className="fd-ctx"><Ic name="fdecho" size={15} />{t('feed.echoedBy', { names: names[0] + (names.length > 1 ? t('feed.andMore', { n: names.length - 1 }) : '') })}</span> : null}
      <div className="fd-main-head"><Face id={n.by} /><div className="fd-main-id"><button type="button" className="fd-name" onClick={() => show({ k: 'profile', id: n.by })}>{f.name}</button><span className="fd-handle">@{f.handle}</span></div>
        <button type="button" className="fd-more" aria-label={t('feed.act.more')} onClick={e => noteMenu(e, n)}><Ic name="more" size={18} /></button></div>
      {n.text ? <p className="fd-text big">{n.text}</p> : null}
      <Media n={n} />{n.poll ? <PollView note={n} poll={n.poll} /> : null}
      <p className="fd-meta fd-stamp"><time dateTime={new Date(n.ts).toISOString()}>{fmtDate(n.ts, { hour: 'numeric', minute: '2-digit' })} · {fmtDate(n.ts, { year: 'numeric', month: 'long', day: 'numeric' })}</time>{n.src ? <> · {t('feed.tag.fromChat')}</> : null}</p>
      {thread.length + n.echoes.length + n.likes.length ? <p className="fd-stats"><span><b>{thread.length}</b> {t('feed.act.reply')}</span><span><b>{n.echoes.length}</b> {t('feed.act.echo')}</span><span><b>{n.likes.length}</b> {t('feed.stats.likes')}</span></p> : null}
      <Acts n={n} replies={thread.length} onReply={() => reply()} />
    </article>
    <Write root={n.id} re={re || undefined} focusKey={focus} onDone={() => setRe('')} />
    {thread.map(({ n: r, depth }, i) => { const next = thread[i + 1], parent = r.re ? F.notes.find(x => x.id === r.re) : null;
      return <Row key={r.id} n={r} line={!!next && next.depth > 0} replyTo={depth && parent ? parent.by : undefined} onReply={() => reply(r.id)} fresh={run.fresh.has(r.id)} />; })}
    {thread.length ? null : <p className="fd-meta fd-quiet">{n.by === ME ? t('feed.detail.waitMine') : t('feed.detail.noReplies')}</p>}
  </>;
}

// ── 프로필 ──
function Profile({ id }: { id: string }) {
  const [, bump] = useState(0), f = faceOf(id), a = account(id), all = F.notes.filter(n => n.by === id && visible(n)).slice().reverse();
  const posts = all.filter(n => !n.root), replies = all.filter(n => n.root), media = posts.filter(n => picsOf(n).length);
  const follows = (F.follows[id] || []).filter(x => x === ME || account(x)), fans = Object.keys(F.follows).filter(k => F.follows[k].includes(id) && (k === ME || account(k))), mine = (F.follows[ME] || []).includes(id);
  const list = view.ptab === 'replies' ? replies : view.ptab === 'media' ? media : posts;
  return <>
    <Bar title={f.name} sub={t('feed.profile.count', { n: posts.length })} />
    <div className="fd-banner" ref={el => { tint(el, f.o as { avatar?: string } | null); }} />
    <div className="fd-prof">
      <div className="fd-prof-row"><span className="fd-prof-face"><Face id={id} size={84} link={false} /></span><span className="fd-grow" />
        {id === ME ? <button type="button" className="fd-pill" onClick={openMembers}>{t('feed.profile.edit')}</button> : <>
          <button type="button" className="fd-ibtn ring" aria-label={t('feed.profile.edit')} title={t('feed.profile.edit')} onClick={openMembers}><Ic name="edit" size={18} /></button>
          <button type="button" className={'fd-pill' + (mine ? '' : ' solid')} aria-pressed={mine} onClick={() => follow(id)}>{mine ? t('feed.profile.following') : t('feed.profile.follow')}</button></>}</div>
      <h3 className="fd-prof-name">{f.name}</h3><p className="fd-handle">@{f.handle}{follows.includes(ME) ? <em className="fd-tag">{t('feed.profile.followsYou')}</em> : null}</p>
      {a?.bio ? <p className="fd-text">{a.bio}</p> : null}
      <p className="fd-prof-nums"><span><b>{follows.length}</b> {t('feed.profile.follows')}</span><span><b>{fans.length}</b> {t('feed.profile.fans')}</span></p>
    </div>
    <div className="fd-tabs" role="tablist">{([['notes', t('feed.profile.notes')], ['replies', t('feed.profile.replies')], ['media', t('feed.profile.media')]] as [typeof view.ptab, string][]).map(([k, l]) => <button type="button" key={k} role="tab" aria-selected={view.ptab === k} className={view.ptab === k ? 'on' : ''} onClick={() => { view.ptab = k; bump(x => x + 1); }}><span>{l}</span></button>)}</div>
    {list.length ? list.slice(0, 60).map(n => { const parent = n.root ? F.notes.find(x => x.id === (n.re || n.root)) : null; return <Row key={n.id} n={n} replyTo={parent?.by} />; }) : <Empty title={t('feed.profile.none')} />}
  </>;
}

// ── 알림 ── 같은 글에 온 같은 종류는 한 줄로 묶는다: 종류 아이콘 + 작은 얼굴들 + 한 줄
function Notices() {
  const [from] = useState(() => F.seenAt);
  useEffect(() => { markSeen(); }, []);
  const groups: { key: string; kind: Notice['kind']; note?: Note; by: string[]; ts: number; reply?: Note }[] = [];
  for (const q of [...F.notices].reverse()) {
    const note = F.notes.find(n => n.id === q.note); if (!note) continue;
    if (q.kind === 'reply') { const reply = F.notes.filter(n => n.by === q.by && n.root === (note.root || note.id) && Math.abs(n.ts - q.ts) < 5000)[0]; groups.push({ key: q.id, kind: 'reply', note, by: [q.by], ts: q.ts, reply }); continue; }
    const g = groups.find(x => x.kind === q.kind && x.note === note); if (g) { if (!g.by.includes(q.by)) g.by.push(q.by); } else groups.push({ key: q.id, kind: q.kind, note, by: [q.by], ts: q.ts });
  }
  groups.sort((a, b) => b.ts - a.ts);
  const fans = Object.keys(F.follows).filter(k => k !== ME && F.follows[k].includes(ME) && account(k));
  const who = (ids: string[]) => faceOf(ids[0]).name + (ids.length > 1 ? t('feed.andMore', { n: ids.length - 1 }) : '');
  const icon = { like: 'fdheart', echo: 'fdecho', vote: 'fdpoll', reply: 'fdreply', quote: 'fdecho' } as const;
  return <>
    <Bar title={t('feed.notices.title')} />
    {groups.map(g => <article key={g.key} className={'fd-ntc ' + g.kind + (g.ts > from ? ' new' : '')} onClick={() => g.note && show({ k: 'note', id: g.note.root || g.note.id })}>
      <span className="fd-ntc-i"><Ic name={icon[g.kind]} size={24} fill={g.kind === 'like'} /></span>
      <div className="fd-body"><div className="fd-ntc-faces">{g.by.slice(0, 6).map(id => <Face key={id} id={id} size={30} />)}<span className="fd-grow" /><span className="fd-time">{agoLabel(g.ts)}</span></div>
        <p className="fd-text"><b>{who(g.by)}</b>{t('feed.ntc.' + g.kind)}</p>
        <p className="fd-meta fd-clip">{g.kind === 'reply' && g.reply ? g.reply.text : g.note?.text}</p></div>
    </article>)}
    {fans.length ? <article className="fd-ntc follow"><span className="fd-ntc-i"><Ic name="fdfollow" size={24} /></span><div className="fd-body"><div className="fd-ntc-faces">{fans.slice(0, 6).map(id => <Face key={id} id={id} size={30} />)}</div><p className="fd-text"><b>{who(fans)}</b>{t('feed.ntc.follow')}</p></div></article> : null}
    {groups.length || fans.length ? null : <Empty title={t('feed.notices.noneTitle')} line={t('feed.notices.none')} />}
  </>;
}

// ── 오른쪽 보조 기둥 (넓은 화면에서만) ──
function Side() {
  const mem = members(F), mine = new Set(F.follows[ME] || []), sug = [...mem.filter(m => !mine.has(m.char.id)), ...mem.filter(m => mine.has(m.char.id))].slice(0, 5), auto = cfg().auto;
  return <aside className="fd-side">
    <section className="fd-card"><h3>{t('feed.side.refreshTitle')}</h3><p className="fd-meta">{t('feed.side.refreshLine')}</p>
      <button type="button" className="fd-pill solid" disabled={run.busy || !mem.length} onClick={() => void refresh()}>{run.busy ? t('feed.refresh.busy') : t('feed.refresh.go')}<small>{t('feed.cost.one')}</small></button>
      {F.lastAt ? <p className="fd-meta">{t('feed.mast.last', { ago: agoLabel(F.lastAt) })}{auto > 0 ? ' · ' + t('feed.mast.auto', { n: F.auto.day === new Date().toDateString() ? F.auto.count : 0, max: auto }) : ''}</p> : null}</section>
    <section className="fd-card"><h3>{t('feed.side.suggest')}</h3>
      {sug.length ? sug.map(m => <div className="fd-sug" key={m.char.id} onClick={() => show({ k: 'profile', id: m.char.id })}><Face id={m.char.id} /><div className="fd-main-id"><span className="fd-name">{m.char.name}</span><span className="fd-handle">@{m.handle}</span></div>
        <button type="button" className={'fd-pill sm' + (mine.has(m.char.id) ? '' : ' solid')} onClick={e => { e.stopPropagation(); follow(m.char.id); }}>{mine.has(m.char.id) ? t('feed.profile.following') : t('feed.profile.follow')}</button></div>) : <p className="fd-meta">{t('feed.side.noMembers')}</p>}
      <button type="button" className="fd-link" onClick={openMembers}>{t('feed.side.manage')}</button></section>
    <nav className="fd-side-links"><button type="button" className="fd-link dim" onClick={openSettings}>{t('feed.set.title')}</button><button type="button" className="fd-link dim" onClick={openMembers}>{t('feed.members.title')}</button></nav>
  </aside>;
}

// ── 창: 참여자 ──
export function openMembers() { openModal({ title: t('feed.members.title'), wide: true, spec: 'div.fd-mem' }, () => <Members />); }
export function pickMembers() {
  charPicker({ title: t('feed.members.pick'), selected: F.accounts.filter(a => a.id !== ME && a.on).map(a => a.id), multi: true, note: c => account(c.id) ? '@' + account(c.id)!.handle : '', onDone: async ids => {
    const made = setMembers(ids); if (!made.length) return;
    if (await confirmBox(t('feed.members.askProfiles', { n: made.length }), t('feed.members.makeProfiles'))) void writeProfiles(made);
  } });
}
async function writeProfiles(ids: string[]) {
  toast(t('feed.members.making'));
  try { const n = await makeProfiles(ids); toast(n ? t('feed.members.made', { n }) : t('feed.err.parse'), n ? 'ok' : 'err'); } catch (e) { toast(t('feed.err.call', { err: (e as Error).message || String(e) }), 'err'); }
}
function Members() {
  useEvents('feed:changed', 'chars');
  const mine = myAccount(), rows = [mine, ...F.accounts.filter(a => a.id !== ME && S.get('chars', a.id))], fresh = rows.filter(a => a.fresh && a.on).map(a => a.id);
  const edit = (a: typeof mine, k: 'handle' | 'bio' | 'voice', v: string) => { a[k] = k === 'handle' ? v.replace(/^@/, '').replace(/\s+/g, '_').slice(0, 18) : v; delete a.fresh; save(); };
  return <>
    <p className="fd-meta">{t('feed.members.intro')}</p>
    <div className="fd-mem-tools"><button type="button" className="fd-pill solid" onClick={pickMembers}>{t('feed.members.pick')}</button>
      {fresh.length ? <button type="button" className="fd-pill" onClick={() => void writeProfiles(fresh)}>{t('feed.members.makeProfiles')}<small>{t('feed.cost.one')}</small></button> : null}</div>
    {rows.map(a => { const f = faceOf(a.id), me = a.id === ME;
      return <div className={'fd-mem-row' + (a.on ? '' : ' off')} key={a.id + (a.fresh ? ':f' : ':k')}>
        <span className="fd-face" style={{ ['--s' as string]: '40px' }}><Avatar o={f.o} cls="fd-av" /></span>
        <div className="fd-body">
          <div className="fd-mem-top"><b className="fd-name">{f.name}</b>{me ? <em className="fd-tag">{t('feed.me')}</em> : a.fresh ? <em className="fd-tag acc">{t('feed.members.fresh')}</em> : null}<span className="fd-grow" />
            {me ? null : <label className="fd-mem-on"><input type="checkbox" checked={a.on} onChange={e => { a.on = e.target.checked; save(); }} /><span>{a.on ? t('feed.members.on') : t('feed.members.off')}</span></label>}</div>
          <label className="fd-mem-f"><span>{t('feed.members.handle')}</span><input className="fd-in" defaultValue={a.handle} maxLength={18} onChange={e => edit(a, 'handle', e.target.value)} /></label>
          <label className="fd-mem-f"><span>{t('feed.members.bio')}</span><input className="fd-in" defaultValue={a.bio} maxLength={80} placeholder={t('feed.members.bioPh')} onChange={e => edit(a, 'bio', e.target.value)} /></label>
          {me ? null : <label className="fd-mem-f"><span>{t('feed.members.voice')}</span><input className="fd-in" defaultValue={a.voice} maxLength={240} placeholder={t('feed.members.voicePh')} onChange={e => edit(a, 'voice', e.target.value)} /></label>}
        </div>
      </div>; })}
  </>;
}

// ── 창: 캐릭터 사이 ── 아는 사이끼리만 서로 답하고 인용한다 (자동: 같은 대화방에 함께 있었으면 안다)
export function openRelations() { openModal({ title: t('feed.rel.title'), wide: true, spec: 'div.fd-rel' }, () => <Relations />); }
function Relations() {
  useEvents('feed:changed', 'chars');
  const ids = members(F).map(m => m.char.id), shared = new Set(pairsFrom(S.chats, ids).map(([a, b]) => relKey(a, b)));
  const set = (k: string, patch: { known?: 'auto' | 'yes' | 'no'; note?: string }) => {
    const rels = (F.rels ||= {}), prev = rels[k], next: { known: 'auto' | 'yes' | 'no'; note?: string } = { known: patch.known || prev?.known || 'auto', note: patch.note ?? prev?.note };
    if (!next.note) delete next.note; if (next.known === 'auto' && !next.note) delete rels[k]; else rels[k] = next; save();
  };
  if (ids.length < 2) return <p className="fd-meta">{t('feed.rel.needTwo')}</p>;
  const pairs: [string, string][] = []; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
  return <>
    <p className="fd-meta">{t('feed.rel.intro')}</p>
    {pairs.map(([a, b]) => { const k = relKey(a, b), r = F.rels?.[k], known = r?.known || 'auto', auto = shared.has(k), on = known === 'yes' || (known === 'auto' && auto);
      return <div className="fd-rel-row" key={k}>
        <div className="fd-rel-who"><Face id={a} size={28} link={false} /><b>{faceOf(a).name}</b><span className="fd-rel-and">↔</span><Face id={b} size={28} link={false} /><b>{faceOf(b).name}</b></div>
        <div className="fd-rel-pick" role="radiogroup" aria-label={t('feed.rel.title')}>
          {(['auto', 'yes', 'no'] as const).map(v => <button key={v} type="button" role="radio" aria-checked={known === v} className={'fd-pill sm' + (known === v ? ' solid' : '')} onClick={() => set(k, { known: v })}>{t('feed.rel.' + v)}</button>)}
        </div>
        {known === 'auto' ? <small className="fd-meta">{t(auto ? 'feed.rel.autoYes' : 'feed.rel.autoNo')}</small> : null}
        {on ? <input className="fd-in" defaultValue={r?.note || ''} maxLength={120} placeholder={t('feed.rel.notePh')} aria-label={t('feed.rel.notePh')} onChange={e => set(k, { note: e.target.value.trim() })} /> : null}
      </div>; })}
  </>;
}

// ── 창: 설정 ──
export function openSettings() {
  const c = cfg(), apply = () => S.set({});
  openModal({ title: t('feed.set.title'), wide: true, spec: 'div.col' }, close => <>
    <Form obj={c} onChange={apply} defs={[
      { section: t('feed.set.secRefresh') },
      { k: 'mingle', label: t('feed.set.mingle'), type: 'check', hint: t('feed.set.mingleHint') },
      { k: 'n', label: t('feed.set.n'), type: 'num', min: 1, max: 8, third: true, hint: t('feed.set.nHint') },
      { k: 'auto', label: t('feed.set.auto'), type: 'num', min: 0, max: 12, third: true, hint: t('feed.set.autoHint') },
      { k: 'maxTokens', label: t('feed.set.maxTokens'), type: 'num', min: 600, max: 8000, step: 100, third: true },
      { k: 'recall', label: t('feed.set.recall'), type: 'num', min: 0, max: 6, third: true, hint: t('feed.set.recallHint') },
      { k: 'mentionLines', label: t('feed.set.mentionLines'), type: 'num', min: 0, max: 20, third: true, hint: t('feed.set.mentionHint') },
      { k: 'memLines', label: t('feed.set.memLines'), type: 'num', min: 0, max: 8, third: true, hint: t('feed.set.memHint') },
      { k: 'lang', label: t('feed.set.lang'), type: 'text', ph: t('feed.set.langPh'), half: true },
      { k: 'limit', label: t('feed.set.limit'), type: 'num', min: 40, max: 2000, step: 10, half: true },
      { k: 'guide', label: t('feed.set.guide'), type: 'area', rows: 3, ph: t('feed.set.guidePh') },
      { k: 'autoImage', label: t('feed.set.autoImage'), type: 'check', hint: t('feed.set.autoImageHint') },
      { k: 'photoPosts', label: t('feed.set.photoPosts'), type: 'check', hint: t('feed.set.photoPostsHint') },
      { section: t('feed.set.secCarry') },
      { k: 'carry', label: t('feed.set.carry'), type: 'check', hint: t('feed.set.carryHint') },
      { k: 'carryHours', label: t('feed.set.carryHours'), type: 'num', min: 1, max: 336, third: true },
      { k: 'carryMax', label: t('feed.set.carryMax'), type: 'num', min: 1, max: 12, third: true },
      { k: 'carryTokens', label: t('feed.set.carryTokens'), type: 'num', min: 80, max: 1500, step: 20, third: true },
      { k: 'chatPost', label: t('feed.set.chatPost'), type: 'check', hint: t('feed.set.chatPostHint') },
    ]} />
    <div className="row end"><button type="button" className="btn danger" onClick={async () => { if (await confirmBox(t('feed.set.wipeAsk'), t('feed.set.wipe'), true)) { await wipe(); close(); } }}>{t('feed.set.wipe')}</button></div>
  </>);
}

// ── 게시판 ──
export function Board({ arg }: { arg?: unknown }) {
  useEvents('feed:changed', 'feed:view', 'chars', 'personas');
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 60e3); return () => clearInterval(id); }, []);   // "N분"이 흐르게
  useEffect(() => { if (typeof arg === 'string' && arg) { const n = F.notes.find(x => x.id === arg); if (n) { view.stack = [{ k: 'note', id: n.root || n.id }]; tick(x => x + 1); } } }, [arg]);
  const s = view.stack[view.stack.length - 1];
  return <section className={'fd-page' + (s ? ' sub' : '')}>
    <div className="fd-col">{!s ? <Home /> : s.k === 'note' ? <Detail key={s.id} id={s.id} /> : s.k === 'profile' ? <Profile key={s.id} id={s.id} /> : <Notices />}</div>
    <Side />
    {!s && members(F).length ? <button type="button" className="fd-fab" aria-label={t('feed.fab')} title={t('feed.fab')} onClick={openCompose}><Ic name="fdpen" size={24} /></button> : null}
  </section>;
}
