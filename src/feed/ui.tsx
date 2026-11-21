// 밤의 게시판: 화면 — 한 줄 기둥에 꽂힌 쪽지들. 글 쓰기 · 글 한 장(답글 레일 · 투표 · 그림) · 참여자 · 프로필 · 나에게 온 것 · 설정
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Avatar, useEvents } from '../kit';
import { S, emit, pickFiles, readDataURL } from '../lib/core';
import { Form, PageHead, charPicker, confirmBox, menu, toast } from '../ui';
import { openModal } from '../addons/parts';
import { fmtDate, t } from '../i18n';
import { ME, type Note } from './types';
import { threadOf, unseen, visible } from './logic';
import { F, account, answerNow, canDraw, cfg, draw, echo, follow, hide, imgOf, like, makeProfiles, markSeen, members, myAccount, post, refresh, remove, run, save, setMembers, talkAbout, undo, wipe } from './store';
import { EmptyBoard, Ln, Pin, PollView, agoLabel, faceOf, pad2 } from './parts';

// 화면을 떠났다 와도 남는 것
const view = { tab: 'all' as 'all' | 'mine' | 'hidden', shown: 30, replyTo: '' as string, replyRe: '' as string };
const copyText = (s: string) => { void navigator.clipboard?.writeText(s).then(() => toast(t('feed.copied'), 'ok')).catch(() => { }); };

// ── 글 쓰기 ──
function Write({ root, re, onDone, autoFocus }: { root?: string; re?: string; onDone?: () => void; autoFocus?: boolean }) {
  const [text, setText] = useState(''), [img, setImg] = useState(''), [poll, setPoll] = useState<{ q: string; opts: string[] } | null>(null), [busy, setBusy] = useState(false);
  const limit = cfg().limit, ta = useRef<HTMLTextAreaElement>(null), left = limit - text.length;
  const grow = () => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(240, el.scrollHeight) + 'px'; } };
  useEffect(() => { if (autoFocus) ta.current?.focus(); }, [autoFocus]);
  const pollOk = !poll || poll.opts.filter(o => o.trim()).length >= 2, can = !busy && left >= 0 && pollOk && (!!text.trim() || !!img || (!!poll && pollOk));
  const send = async () => { if (!can) return; setBusy(true); try { await post(text, { image: img || undefined, poll: poll || undefined, root, re }); setText(''); setImg(''); setPoll(null); requestAnimationFrame(grow); onDone?.(); } finally { setBusy(false); } };
  const attach = async () => { const [f] = await pickFiles({ accept: 'image/*' }); if (f) setImg(await readDataURL(f)); };
  return <div className={'fd-write' + (root ? ' re' : '')}>
    <textarea ref={ta} className="fd-ta" rows={1} value={text} maxLength={limit + 40} placeholder={root ? t('feed.write.replyPh') : t('feed.write.ph')} aria-label={root ? t('feed.write.replyPh') : t('feed.write.ph')}
      onChange={e => { setText(e.target.value); grow(); }} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} />
    {img ? <div className="fd-pic fx-frame"><img src={img} alt="" /><button type="button" className="fd-pic-x" aria-label={t('feed.write.dropImage')} onClick={() => setImg('')}><Ln name="x" size={14} /></button></div> : null}
    {poll ? <div className="fd-pollmake">
      <input className="fd-in" value={poll.q} maxLength={120} placeholder={t('feed.write.pollQ')} aria-label={t('feed.write.pollQ')} onChange={e => setPoll({ ...poll, q: e.target.value })} />
      {poll.opts.map((o, i) => <div className="fd-pollmake-row" key={i}><span className="fx-num">{pad2(i + 1)}</span><input className="fd-in" value={o} maxLength={40} placeholder={t('feed.write.pollOpt')} aria-label={t('feed.write.pollOpt') + ' ' + (i + 1)} onChange={e => setPoll({ ...poll, opts: poll.opts.map((x, j) => j === i ? e.target.value : x) })} />
        {poll.opts.length > 2 ? <button type="button" className="fd-tool" aria-label={t('common.delete')} onClick={() => setPoll({ ...poll, opts: poll.opts.filter((_, j) => j !== i) })}><Ln name="x" size={14} /></button> : null}</div>)}
      {poll.opts.length < 4 ? <button type="button" className="fd-link" onClick={() => setPoll({ ...poll, opts: [...poll.opts, ''] })}>{t('feed.write.pollAdd')}</button> : null}
    </div> : null}
    <div className="fd-write-foot">
      {root ? null : <><button type="button" className={'fd-tool' + (img ? ' on' : '')} title={t('feed.write.image')} aria-label={t('feed.write.image')} onClick={() => void attach()}><Ln name="image" /></button>
        <button type="button" className={'fd-tool' + (poll ? ' on' : '')} title={t('feed.write.poll')} aria-label={t('feed.write.poll')} aria-pressed={!!poll} onClick={() => setPoll(poll ? null : { q: '', opts: ['', ''] })}><Ln name="fdpoll" /></button></>}
      <span className={'fx-num fd-count' + (left < 0 ? ' over' : '')} aria-label={t('feed.write.left', { n: left })}>{String(text.length).padStart(3, '0')}<i>/</i>{limit}</span>
      <button type="button" className="fd-pinbtn fx-tap inv" disabled={!can} onClick={() => void send()}>{root ? t('feed.write.reply') : t('feed.write.pin')}</button>
    </div>
  </div>;
}

// ── 글 한 장 ──
function noteMenu(e: MouseEvent, n: Note) {
  menu(e.currentTarget, [
    n.by !== ME && { label: t('feed.act.profile'), ic: 'user', onclick: () => openProfile(n.by) },
    { label: t('feed.act.copy'), ic: 'copy', onclick: () => copyText(n.text) },
    n.hidden ? { label: t('feed.act.unhide'), ic: 'eye', onclick: () => hide(n.id, false) } : { label: t('feed.act.hide'), ic: 'eyeoff', hint: t('feed.act.hideHint'), onclick: () => hide(n.id) },
    '-', { label: t('common.delete'), ic: 'trash', danger: true, onclick: async () => { if (await confirmBox(t('feed.act.deleteAsk'), t('common.delete'), true)) void remove(n.id); } },
  ]);
}
/** 공감 · 옮겨 적기 · 답글 단추 줄 */
function Acts({ n, replies, onReply, small }: { n: Note; replies?: number; onReply: () => void; small?: boolean }) {
  const mine = n.by === ME, liked = n.likes.includes(ME), echoed = n.echoes.includes(ME);
  return <footer className={'fd-acts' + (small ? ' sm' : '')}>
    <button type="button" className="fd-act" aria-label={t('feed.act.reply')} title={t('feed.act.reply')} onClick={onReply}><Ln name="fdreply" />{replies != null ? <span className="fx-num">{pad2(replies)}</span> : null}</button>
    <button type="button" className={'fd-act' + (liked ? ' on' : '')} aria-pressed={liked} aria-label={t('feed.act.like')} title={t('feed.act.like')} onClick={() => like(n.id)}><Ln name="fdstar" fill={liked} /><span className="fx-num">{pad2(n.likes.length)}</span></button>
    {small ? null : <button type="button" className={'fd-act' + (echoed ? ' on' : '')} aria-pressed={echoed} aria-label={t('feed.act.echo')} title={t('feed.act.echo')} onClick={() => echo(n.id)}><Ln name="fdecho" /><span className="fx-num">{pad2(n.echoes.length)}</span></button>}
    <span className="fd-acts-gap" />
    {mine ? <button type="button" className="fd-act word" disabled={run.busy || !!run.answering} title={t('feed.act.answerHint')} onClick={() => void answerNow(n.id)}>{run.answering === n.id ? t('feed.act.answering') : t('feed.act.answer')}<span className="fx-lbl fd-cost">{t('feed.cost.one')}</span></button>
      : small || faceOf(n.by).gone ? null : <button type="button" className="fd-act word" title={t('feed.act.talkHint')} onClick={() => void talkAbout(n.id)}><Ln name="fdtalk" />{t('feed.act.talk')}</button>}
  </footer>;
}
function Picture({ n }: { n: Note }) {
  const src = imgOf(n.image);
  if (src) return <button type="button" className="fd-pic fx-frame" aria-label={t('feed.picture')} onClick={() => openModal({ title: faceOf(n.by).name, wide: true }, () => <img className="fd-pic-full" src={src} alt={n.imagePrompt || ''} />)}><img src={src} alt={n.imagePrompt || ''} loading="lazy" /></button>;
  // 그림 설명만 있고 삽화가 연결되지 않았으면 아무것도 보이지 않는다
  if (!n.imagePrompt || !canDraw()) return null;
  const busy = run.drawing.has(n.id);
  return <div className="fd-sketch fx-corners"><span className="fd-sketch-t">{n.imagePrompt}</span><button type="button" className="fd-act word" disabled={busy} onClick={() => void draw(n.id)}><Ln name="fdbrush" />{busy ? t('feed.draw.busy') : t('feed.draw.go')}<span className="fx-lbl fd-cost">{t('feed.cost.image')}</span></button></div>;
}
function Reply({ n, depth, onReply }: { n: Note; depth: number; onReply: () => void }) {
  const f = faceOf(n.by);
  return <div className={'fd-re' + (depth ? ' d1' : '') + (run.fresh.has(n.id) ? ' fx-in' : '') + (n.by === ME ? ' me' : '')} id={'fd-' + n.id}>
    <i className="fd-elbow" aria-hidden="true" />
    <div className="fd-re-main">
      <header className="fd-head"><button type="button" className="fd-name fx-serif" onClick={() => n.by === ME ? openMembers() : openProfile(n.by)}>{f.name}</button><span className="fx-lbl fd-handle">@{f.handle}</span><time className="fx-lbl fd-time" dateTime={new Date(n.ts).toISOString()} title={fmtDate(n.ts, { dateStyle: 'medium', timeStyle: 'short' })}>{agoLabel(n.ts)}</time>
        <button type="button" className="fd-more" aria-label={t('feed.act.more')} onClick={e => noteMenu(e, n)}><Ln name="more" /></button></header>
      <p className="fd-text">{n.text}</p>
      <Acts n={n} onReply={onReply} small />
    </div>
  </div>;
}
function NoteItem({ n, i }: { n: Note; i: number }) {
  const [, bump] = useState(0), f = faceOf(n.by), thread = threadOf(F.notes, n.id), open = view.replyTo === n.id;
  const setReply = (re = '') => { if (open && view.replyRe === re) { view.replyTo = ''; view.replyRe = ''; } else { view.replyTo = n.id; view.replyRe = re; } bump(x => x + 1); };
  const echoers = n.echoes.map(id => faceOf(id).name);
  return <article className={'fd-note' + (run.fresh.has(n.id) ? ' fx-in fresh' : '') + (n.hidden ? ' hid' : '') + (n.by === ME ? ' me' : '')} id={'fd-' + n.id} style={{ ['--d' as string]: `${Math.min(i, 8) * 70}ms` }}>
    <div className="fd-gut"><Pin seed={n.id} /><button type="button" className="fd-face" aria-label={f.name} onClick={() => n.by === ME ? openMembers() : openProfile(n.by)}><Avatar o={f.o} cls="sm" /></button></div>
    <div className="fd-main">
      <header className="fd-head"><button type="button" className="fd-name fx-serif" onClick={() => n.by === ME ? openMembers() : openProfile(n.by)}>{f.name}</button><span className="fx-lbl fd-handle">@{f.handle}</span>
        <time className="fx-lbl fd-time" dateTime={new Date(n.ts).toISOString()} title={fmtDate(n.ts, { dateStyle: 'medium', timeStyle: 'short' })}>{agoLabel(n.ts)}</time>
        {n.src ? <span className="fx-lbl kr fd-tag">{t('feed.tag.fromChat')}</span> : null}{n.hidden ? <span className="fx-lbl kr fd-tag">{t('feed.tag.hidden')}</span> : null}
        <button type="button" className="fd-more" aria-label={t('feed.act.more')} onClick={e => noteMenu(e, n)}><Ln name="more" /></button></header>
      {n.text ? <p className="fd-text">{n.text}</p> : null}
      <Picture n={n} />
      {n.poll ? <PollView note={n} poll={n.poll} /> : null}
      {echoers.length ? <p className="fx-lbl kr fd-echoed"><Ln name="fdecho" size={12} />{t('feed.echoedBy', { names: echoers.slice(0, 3).join(' · ') + (echoers.length > 3 ? ' +' + (echoers.length - 3) : '') })}</p> : null}
      <Acts n={n} replies={thread.length} onReply={() => setReply()} />
      {thread.length || open ? <div className="fd-thread">
        {thread.map(({ n: r, depth }) => <Reply key={r.id} n={r} depth={depth} onReply={() => setReply(r.id)} />)}
        {open ? <div className="fd-re write"><i className="fd-elbow" aria-hidden="true" /><div className="fd-re-main">{view.replyRe ? <span className="fx-lbl kr">{t('feed.write.replyingTo', { name: faceOf(F.notes.find(x => x.id === view.replyRe)?.by || '').name })}</span> : null}
          <Write root={n.id} re={view.replyRe || undefined} autoFocus onDone={() => { view.replyTo = ''; view.replyRe = ''; bump(x => x + 1); }} /></div></div> : null}
      </div> : null}
    </div>
  </article>;
}

// ── 창: 프로필 ──
export function openProfile(id: string) {
  openModal({ title: t('feed.profile.title'), spec: 'div.fd-prof' }, close => <Profile id={id} close={close} />);
}
function Profile({ id, close }: { id: string; close: () => void }) {
  useEvents('feed:changed');
  const f = faceOf(id), a = account(id), notes = F.notes.filter(n => n.by === id && visible(n)).slice(-30).reverse(), follows = (F.follows[id] || []).filter(x => x === ME || account(x)), fans = Object.keys(F.follows).filter(k => F.follows[k].includes(id));
  const mineFollows = (F.follows[ME] || []).includes(id);
  return <>
    <div className="fd-prof-top"><div className="fd-prof-face fx-ring"><Avatar o={f.o} /></div>
      <div className="fd-prof-id"><h3 className="fx-serif">{f.name}</h3><span className="fx-lbl fd-handle">@{f.handle}</span>{a?.bio ? <p className="fd-prof-bio">{a.bio}</p> : null}</div>
      {id !== ME ? <button type="button" className={'fx-pill fx-tap' + (mineFollows ? ' on' : '')} aria-pressed={mineFollows} onClick={() => follow(id)}>{mineFollows ? t('feed.profile.following') : t('feed.profile.follow')}</button> : null}</div>
    <div className="fd-prof-kv">
      <div className="fx-kv"><span className="fx-lbl kr">{t('feed.profile.notes')}</span><i /><b>{pad2(F.notes.filter(n => n.by === id && !n.root && visible(n)).length)}</b></div>
      <div className="fx-kv"><span className="fx-lbl kr">{t('feed.profile.follows')}</span><i /><b>{pad2(follows.length)}</b></div>
      <div className="fx-kv"><span className="fx-lbl kr">{t('feed.profile.fans')}</span><i /><b>{pad2(fans.length)}</b></div>
    </div>
    {follows.length ? <div className="fd-prof-ties"><span className="fx-lbl kr">{t('feed.profile.follows')}</span>{follows.map(x => <button type="button" key={x} className="fx-pill fx-tap" disabled={x === ME} onClick={() => { close(); openProfile(x); }}>{faceOf(x).name}</button>)}</div> : null}
    <div className="fx-head"><span className="fx-lbl kr ink">{t('feed.profile.recent')}</span></div>
    {notes.length ? <div className="fx-rows fd-prof-list">{notes.map(n => { const root = n.root ? F.notes.find(x => x.id === (n.re || n.root)) || F.notes.find(x => x.id === n.root) : null;
      return <button type="button" key={n.id} className="fd-prof-row" onClick={() => { close(); jump(n.root || n.id); }}>
        <span className="fx-lbl fd-time">{agoLabel(n.ts)}</span><span className="fd-prof-txt">{root ? <em className="fx-lbl kr">{t('feed.profile.repliedTo', { name: faceOf(root.by).name })}</em> : null}{n.text || t('feed.picture')}</span>
        <span className="fx-num fd-prof-n"><Ln name="fdstar" size={12} />{pad2(n.likes.length)}</span></button>; })}</div>
      : <p className="hint">{t('feed.profile.none')}</p>}
  </>;
}
/** 그 글이 보이게 화면을 옮긴다 */
function jump(id: string) { const roots = F.notes.filter(n => !n.root); view.tab = 'all'; view.shown = Math.max(view.shown, roots.length - roots.findIndex(n => n.id === id)); emit('feed:changed'); setTimeout(() => { const el = document.getElementById('fd-' + id); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el?.classList.add('flash'); setTimeout(() => el?.classList.remove('flash'), 1600); }, 80); }

// ── 창: 참여자 ──
export function openMembers() { openModal({ title: t('feed.members.title'), wide: true, spec: 'div.fd-mem' }, () => <Members />); }
function pickMembers() {
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
    <p className="hint">{t('feed.members.intro')}</p>
    <div className="row wrap fd-mem-tools"><button type="button" className="btn" onClick={pickMembers}>{t('feed.members.pick')}</button>
      {fresh.length ? <button type="button" className="btn ghost" onClick={() => void writeProfiles(fresh)}>{t('feed.members.makeProfiles')} <span className="fx-lbl fd-cost">{t('feed.cost.one')}</span></button> : null}</div>
    <div className="fx-rows fd-mem-list">{rows.map(a => { const f = faceOf(a.id), me = a.id === ME;
      return <div className={'fd-mem-row' + (a.on ? '' : ' off')} key={a.id + ':' + (a.fresh ? 'f' : a.handle.length + a.bio.length + a.voice.length > 0 ? 'k' : '')}>
        <Avatar o={f.o} cls="sm" />
        <div className="fd-mem-body">
          <div className="fd-mem-top"><b className="fx-serif">{f.name}</b>{me ? <span className="fx-lbl kr">{t('feed.me')}</span> : a.fresh ? <span className="fx-lbl kr acc">{t('feed.members.fresh')}</span> : null}
            {me ? null : <label className="fd-mem-on"><input type="checkbox" checked={a.on} onChange={e => { a.on = e.target.checked; save(); }} /><span className="fx-lbl kr">{a.on ? t('feed.members.on') : t('feed.members.off')}</span></label>}</div>
          <label className="fd-mem-f"><span className="fx-lbl kr">{t('feed.members.handle')}</span><span className="fd-at fx-num">@</span><input className="fd-in fx-num" defaultValue={a.handle} maxLength={18} onChange={e => edit(a, 'handle', e.target.value)} /></label>
          <label className="fd-mem-f"><span className="fx-lbl kr">{t('feed.members.bio')}</span><input className="fd-in" defaultValue={a.bio} maxLength={80} placeholder={t('feed.members.bioPh')} onChange={e => edit(a, 'bio', e.target.value)} /></label>
          {me ? null : <label className="fd-mem-f"><span className="fx-lbl kr">{t('feed.members.voice')}</span><input className="fd-in" defaultValue={a.voice} maxLength={240} placeholder={t('feed.members.voicePh')} onChange={e => edit(a, 'voice', e.target.value)} /></label>}
        </div>
      </div>; })}</div>
  </>;
}

// ── 창: 나에게 온 것 ──
function openNotices() {
  const list = [...F.notices].reverse().slice(0, 40), from = F.seenAt; markSeen();
  openModal({ title: t('feed.notices.title'), spec: 'div.fd-ntc' }, close => list.length ? <div className="fx-rows">{list.map(q => { const f = faceOf(q.by), n = F.notes.find(x => x.id === q.note);
    return <button type="button" key={q.id} className={'fd-ntc-row' + (q.ts > from ? ' new' : '')} onClick={() => { close(); if (n) jump(n.root || n.id); }}>
      <Ln name={q.kind === 'like' ? 'fdstar' : q.kind === 'echo' ? 'fdecho' : q.kind === 'vote' ? 'fdpoll' : 'fdreply'} /><span className="fd-ntc-txt"><b className="fx-serif">{f.name}</b> {t('feed.notices.' + q.kind)}{n ? <em>{n.text.slice(0, 60)}</em> : null}</span><span className="fx-lbl fd-time">{agoLabel(q.ts)}</span></button>; })}</div>
    : <div className="fx-empty"><Pin seed="notices" size={40} /><p>{t('feed.notices.none')}</p></div>);
}

// ── 창: 설정 ──
function openSettings() {
  const c = cfg(), apply = () => S.set({});
  openModal({ title: t('feed.set.title'), wide: true, spec: 'div.col' }, close => <>
    <Form obj={c} onChange={apply} defs={[
      { section: t('feed.set.secRefresh') },
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
  useEvents('feed:changed', 'chars', 'personas');
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 60e3); return () => clearInterval(id); }, []);   // "N분 전"이 흐르게
  useEffect(() => { if (typeof arg === 'string' && arg) jump(arg); }, [arg]);
  const mem = members(F), roots = F.notes.filter(n => !n.root && !n.off), hiddenN = roots.filter(n => n.hidden).length, news = unseen(F);
  const list = (view.tab === 'hidden' ? roots.filter(n => n.hidden) : view.tab === 'mine' ? roots.filter(n => !n.hidden && (n.by === ME || F.notes.some(x => x.root === n.id && x.by === ME))) : roots.filter(n => !n.hidden)).slice().reverse();
  const shown = list.slice(0, view.shown), setTab = (k: typeof view.tab) => { view.tab = k; view.shown = 30; tick(x => x + 1); };
  const doRefresh = async () => { const n = await refresh(); if (n) setTimeout(() => { run.fresh = new Set(); }, 4000); };
  return <section className="pagebox fd-page">
    <PageHead eyebrow="night board" title={t('feed.title')}>
      <button type="button" className="fd-tool bell" aria-label={t('feed.notices.title') + (news ? ` (${news})` : '')} title={t('feed.notices.title')} onClick={openNotices}><Ln name="fdbell" size={18} />{news ? <i className="fd-dot" aria-hidden="true" /> : null}{news ? <span className="fx-num">{pad2(news)}</span> : null}</button>
      <button type="button" className="fd-tool" aria-label={t('feed.members.title')} title={t('feed.members.title')} onClick={openMembers}><Ln name="users" size={18} /></button>
      <button type="button" className="fd-tool" aria-label={t('feed.set.title')} title={t('feed.set.title')} onClick={openSettings}><Ln name="gear" size={18} /></button>
    </PageHead>
    {!mem.length ? <div className="fx-empty fd-first"><EmptyBoard /><p>{t('feed.first.line')}</p><button type="button" className="fd-pinbtn fx-tap inv" onClick={pickMembers}>{t('feed.members.pick')}</button><small className="hint">{t('feed.first.cost')}</small></div> : <>
      <div className="fd-mast">
        <div className="fd-mast-kv"><span className="fx-lbl">notes <b className="fx-num">{String(roots.length).padStart(3, '0')}</b></span><span className="fx-lbl">members <b className="fx-num">{pad2(mem.length)}</b></span>{F.lastAt ? <span className="fx-lbl kr">{t('feed.mast.last', { ago: agoLabel(F.lastAt) })}</span> : null}{cfg().auto > 0 ? <span className="fx-lbl kr">{t('feed.mast.auto', { n: F.auto.day === new Date().toDateString() ? F.auto.count : 0, max: cfg().auto })}</span> : null}</div>
        <div className="fd-mast-do">
          {F.last && !run.busy ? <button type="button" className="fd-act word" title={t('feed.undo.hint')} onClick={async () => { if (await confirmBox(t('feed.undo.ask', { n: F.last?.notes.length || 0 }), t('feed.undo.go'))) { const n = await undo(); toast(t('feed.undo.done', { n }), 'ok'); } }}><Ln name="fdundo" />{t('feed.undo.go')}</button> : null}
          <button type="button" className="fd-refresh fx-tap inv" disabled={run.busy} onClick={() => void doRefresh()}><Ln name="refresh" />{run.busy ? t('feed.refresh.busy') : t('feed.refresh.go')}<span className="fx-lbl fd-cost">{t('feed.cost.one')}</span></button>
        </div>
      </div>
      <div className={'fd-wire' + (run.busy ? ' on' : '')} role="status" aria-live="polite">{run.busy ? <span className="sr">{t('feed.refresh.busy')}</span> : null}</div>
      <Write />
      <div className="fd-tabs" role="tablist">{([['all', t('feed.tab.all')], ['mine', t('feed.tab.mine')], ...(hiddenN || view.tab === 'hidden' ? [['hidden', t('feed.tab.hidden')]] : [])] as [typeof view.tab, string][]).map(([k, l]) =>
        <button type="button" key={k} role="tab" aria-selected={view.tab === k} className={'fx-pill fx-tap' + (view.tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}{k === 'hidden' ? <span className="fx-num">{pad2(hiddenN)}</span> : null}</button>)}</div>
      {shown.length ? <div className="fd-list fx-rows">{shown.map((n, i) => <NoteItem key={n.id} n={n} i={i} />)}</div>
        : <div className="fx-empty"><EmptyBoard seed={view.tab} /><p>{view.tab === 'all' ? t('feed.empty.all') : view.tab === 'mine' ? t('feed.empty.mine') : t('feed.empty.hidden')}</p></div>}
      {list.length > shown.length ? <button type="button" className="fd-link fd-moreb" onClick={() => { view.shown += 30; tick(x => x + 1); }}>{t('feed.more', { n: list.length - shown.length })}</button> : null}
    </>}
  </section>;
}
