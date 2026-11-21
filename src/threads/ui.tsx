// 이어진 방 · 속내 쪽지 · 귓속말 · 자리 — 화면 조각 (장면 패널 두 칸 · 입력창 위 줄 · 메시지에 붙는 표시 · 방 사이 카드 · 창)
import { useEffect, useState, type ReactNode } from 'react';
import { Btn, Icon, IconBtn } from '../kit';
import { Check, Select, errMsg, openModal, useRedraw } from '../addons/parts';
import { confirmBox, menu, promptBox, toast } from '../ui';
import { S, msgText } from '../lib/core';
import { I } from '../lib/icons';
import { go } from '../lib/router';
import type { Char, Chat, Msg } from '../lib/types';
import { ago, charsOf, chatApi, generate, modeOf, redraw } from '../chat/actions';
import { cur, bump, useCh } from '../chat/store';
import { t, tn } from '../i18n';
import { SHARE_N, type StageDraft } from './link';
import { NOTES_KEEP, cleanNote, liveNotes } from './notes';
import { aboutOf, cleanAbout, myAbout, setAbout, setMyAbout } from './about';
import { blend, candidates, comeBack, draftStage, label, link, linked, openStage, unlink } from './bridge';
import { cfg, dirty, scoresFor, setAway, setWhisper, whisperOf } from './run';
import type { Score } from './order';
import { swOf, thOf, thPeek, type Frame, type Share, type ThCard, type ThMsg } from './types';

Object.assign(I, {
  knot: I.knot || 'M6 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM18 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM9 12c2-3.2 4 3.2 6 0',
  whisper: I.whisper || 'M4 12a8 7 0 0 1 16 0a8 7 0 0 1-11 6.5L4 20l1.2-4A6.8 6.8 0 0 1 4 12zM9 12h.01M12 12h.01M15 12h.01',
  seal: I.seal || 'M4 7h16v11H4zM4 7l8 6 8-6M12 16v.01',
  door: I.door || 'M6 21V4h9v17M4 21h16M12 12.5v.01M15 7l4 1.5V21',
  ticket: I.ticket || 'M4 8h16v3a1.5 1.5 0 0 0 0 3v3H4v-3a1.5 1.5 0 0 0 0-3zM14 8v9',
  blend: I.blend || 'M7 4v5a5 5 0 0 0 5 5v6M17 4v5a5 5 0 0 1-5 5',
});
const p2 = (n: number) => String(n).padStart(2, '0');
const saveChat = (c: Chat) => void S.save('chats', c, true);
/** 씨앗 있는 난수: 같은 방은 늘 같은 그림 */
const rng = (seed: string) => { let h = 2166136261; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619); return () => { h += 0x6D2B79F5; let x = Math.imul(h ^ (h >>> 15), 1 | h); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };

// ════════ 그림: 실로 이은 방 ════════ 왼쪽의 고리가 이 방, 오른쪽의 작은 고리들이 이어진 방. 실은 방마다 다른 처짐으로 늘어지고, 실 위의 매듭이 나눈 줄 수다
function ThreadArt({ seed, n, knots }: { seed: string; n: number; knots: number }) {
  const r = rng(seed), W = 260, H = 64, rooms = Math.max(1, Math.min(4, n)), ys = Array.from({ length: rooms }, (_, i) => rooms === 1 ? 32 : 12 + i * (40 / (rooms - 1)));
  return <svg className="fx-art th-art" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
    <circle cx="26" cy="32" r="13" /><circle cx="26" cy="32" r="17" className="h" /><path d="M20 32a6 6 0 0 0 9 5a7.5 7.5 0 0 1 0-10a6 6 0 0 0-9 5z" className="t" />
    {ys.map((y, i) => {
      const sag = 6 + r() * 14, x2 = 214 + (i % 2) * 14, d = `M39 32C${90 + r() * 30} ${32 + sag} ${150 + r() * 30} ${y + sag} ${x2 - 7} ${y}`;
      return <g key={i} style={{ opacity: n ? 1 : .4 }}>
        <path d={d} pathLength={1} className={n ? 'fx-draw' : 'd'} style={{ '--d': `${i * .12}s` } as React.CSSProperties} />
        {n ? Array.from({ length: Math.min(6, knots) }, (_, k) => { const u = (k + 1) / (Math.min(6, knots) + 1), x = 39 + (x2 - 46) * u, yy = 32 + (y - 32) * u + sag * 3 * u * (1 - u); return <circle key={k} cx={x} cy={yy} r="1.3" className="f" />; }) : null}
        <circle cx={x2} cy={y} r="7" className="p" /><circle cx={x2} cy={y} r="7" /><circle cx={x2} cy={y} r="2" className={n ? 'af' : 'h'} />
      </g>;
    })}
    {Array.from({ length: 7 }, (_, i) => <circle key={'s' + i} cx={60 + r() * 130} cy={4 + r() * 12} r=".7" className="f" opacity={.3 + r() * .4} />)}
  </svg>;
}

// ════════ 장면 패널: 이어진 방 ════════
export function LinksPanel({ chat }: { chat: Chat }) {
  const draw = useRedraw(), th = thOf(chat), rooms = linked(chat), mode = modeOf(chat), share = th.share || 'lines';
  const mixed = rooms.some(o => modeOf(o) !== mode), cand = candidates(chat);
  const set = (fn: () => void) => { fn(); saveChat(chat); draw(); };
  const pick = (e: React.MouseEvent<HTMLButtonElement>) => menu(e.currentTarget, cand.slice(0, 14).map(o => ({ label: label(o), ic: modeOf(o) === 'talk' ? 'chat' : 'book', hint: `${modeOf(o) === 'talk' ? t('threads.mode.talk') : t('threads.mode.rp')} · ${t('threads.link.count', { n: o.count || 0 })}`, onclick: async () => { await link(chat, o); draw(); } })));
  return <div className="th-panel">
    <ThreadArt seed={chat.id} n={rooms.length} knots={share === 'off' ? 0 : +(th.shareN ?? SHARE_N) || SHARE_N} />
    {rooms.length ? <ul className="th-rooms fx-rows">{rooms.map((o, i) => <li key={o.id} className="fx-in" style={{ '--d': `${i * .05}s` } as React.CSSProperties}>
      <span className="fx-num th-no">{p2(i + 1)}</span>
      <button type="button" className="th-room-go fx-tap" title={t('threads.link.open')} onClick={() => go('chat', o.id)}><b>{label(o)}</b>
        <small><i className="fx-lbl">{modeOf(o) === 'talk' ? 'TALK' : 'RP'}</i>{t('threads.link.count', { n: o.count || 0 })} · {ago(o.updatedAt)}</small></button>
      <IconBtn ic="x" cls="tiny" title={t('threads.link.unlink')} onClick={async () => { await unlink(chat, o); draw(); }} /></li>)}</ul>
      : <p className="th-none">{t('threads.link.empty')}</p>}
    <div className="row wrap"><Btn label={t('threads.link.add')} ic="knot" cls="ghost" title={cand.length ? undefined : t('threads.link.noCand')} onClick={e => cand.length ? pick(e) : toast(t('threads.link.noCand'))} />
      {mode === 'talk' ? <Btn label={t('threads.stage.open')} ic="ticket" cls="ghost" title={t('threads.stage.cost')} onClick={() => stageDialog(chat)} /> : null}</div>
    {th.origin ? <ReturnStrip chat={chat} /> : null}
    {rooms.length ? <>
      <div className="th-kv"><span className="fx-lbl kr">{t('threads.share.label')}</span>
        <Select value={share} opts={[['lines', t('threads.share.lines')], ['memory', t('threads.share.memory')], ['off', t('threads.share.off')]]} onChange={v => set(() => { th.share = v as Share; })} />
        {share !== 'off' ? <label className="th-n"><input className="inp" type="number" min={1} max={20} defaultValue={th.shareN ?? SHARE_N} aria-label={t('threads.share.n')} onChange={e => { th.shareN = Math.max(1, Math.min(20, +e.target.value || SHARE_N)); saveChat(chat); }} /><span>{t('threads.share.unit')}</span></label> : null}</div>
      {mixed && share !== 'off' ? <div className="th-kv"><span className="fx-lbl kr">{t('threads.frame.label')}</span>
        <Select value={th.frame || 'self'} opts={[['self', t('threads.frame.self')], ['actor', t('threads.frame.actor')]]} onChange={v => set(() => { th.frame = v as Frame; })} /></div> : null}
      <small className="hint">{share === 'off' ? t('threads.share.offHint') : mixed ? (th.frame === 'actor' ? t('threads.frame.actorHint') : t('threads.frame.selfHint')) : t('threads.share.hint')}</small>
    </> : null}
    {mode === 'talk' ? <Check label={t('threads.stage.offer')} hint={t('threads.stage.offerHint')} on={th.stage} onChange={v => set(() => { th.stage = v; })} /> : null}
  </div>;
}
function ReturnStrip({ chat }: { chat: Chat }) {
  const o = thPeek(chat).origin, home = o && S.get('chats', o.id); if (!o || !home) return null;
  return <div className="th-return fx-corners"><div><span className="fx-lbl kr">{t('threads.back.from')}</span><b className="fx-serif">{o.title}</b></div>
    <Btn label={t('threads.back.go')} ic="left" cls="ghost" onClick={() => void goBack(chat)} /></div>;
}
async function goBack(chat: Chat) {
  const o = thPeek(chat).origin; if (!o) return;
  const v = await promptBox(t('threads.back.ask', { title: o.title }), '', { placeholder: t('threads.back.ph') }); if (v === null) return;
  await comeBack(chat, v);
}

// ════════ 장면 패널: 속내와 자리 ════════
export function InnerPanel({ chat, msgs }: { chat: Chat; msgs: Msg[] }) {
  const draw = useRedraw(), th = thOf(chat), chars = charsOf(chat), group = chars.length > 1, talk = modeOf(chat) === 'talk', away = new Set(th.away || []), C = cfg(), persona = S.persona(chat);
  const set = (fn: () => void) => { fn(); saveChat(chat); draw(); bump('composer'); };
  const shown = msgs.filter(m => !m.hidden);
  return <div className="th-panel">
    <Check label={t('threads.notes.on')} hint={t('threads.notes.hint', { n: NOTES_KEEP })} on={th.notes} onChange={v => set(() => { th.notes = v; })} />
    {th.notes ? <ul className="th-keep">{chars.map(c => { const live = liveNotes(shown as Parameters<typeof liveNotes>[0], c.id); return <li key={c.id} className="fx-kv"><span>{c.name}</span><i />
      <span className="fx-pips round" role="img" aria-label={t('threads.notes.kept', { n: live.length, max: NOTES_KEEP })} title={t('threads.notes.kept', { n: live.length, max: NOTES_KEEP })}>{Array.from({ length: NOTES_KEEP }, (_, i) => <i key={i} className={i < live.length ? 'on' : ''} />)}</span>
      {live.length ? <button type="button" className="th-link" onClick={() => { const id = live[live.length - 1].id, m = id && msgs.find(x => x.id === id); if (m) notesDialog(m, chat); }}>{t('threads.notes.peek')}</button> : null}</li>; })}</ul> : null}
    <Check label={t('threads.cut.on')} hint={t('threads.cut.hint')} on={th.cut} onChange={v => set(() => { th.cut = v; })} />
    {group ? <>
      <div className="fx-head th-head"><span className="fx-lbl kr">{t('threads.seat.title')}</span></div>
      <ul className="th-seats">{chars.map((c, i) => <li key={c.id}><button type="button" className={'th-seat fx-tap' + (away.has(c.id) ? ' away' : '')} aria-pressed={!away.has(c.id)} title={away.has(c.id) ? t('threads.seat.bring', { name: c.name }) : t('threads.seat.send', { name: c.name })} onClick={() => void setAway(chat, c.id, !away.has(c.id)).then(draw)}>
        <span className="fx-num">{p2(i + 1)}</span><Seat away={away.has(c.id)} /><b>{c.name}</b><small>{away.has(c.id) ? t('threads.seat.away') : t('threads.seat.here')}</small></button></li>)}</ul>
      <small className="hint">{t('threads.seat.hint')}</small>
      <Check label={t('threads.seat.auto')} hint={t('threads.seat.autoHint')} on={th.autoAway} onChange={v => set(() => { th.autoAway = v; })} />
      <Check label={t('threads.whisper.ai')} hint={t('threads.whisper.aiHint')} on={th.whisper !== false} onChange={v => set(() => { th.whisper = v; })} />
      {th.whisper !== false ? <Check label={t('threads.whisper.veil')} hint={t('threads.whisper.veilHint')} on={th.veilMe} onChange={v => set(() => { th.veilMe = v; chatApi.redraw(); })} /> : null}
    </> : null}
    {talk ? <>
      <div className="fx-head th-head"><span className="fx-lbl kr">{t('threads.about.title')}</span></div>
      {chars.map(c => <label key={c.id} className="th-about-row"><span>{c.name}</span><input className="inp" maxLength={80} defaultValue={aboutOf(c)} placeholder={t('threads.about.ph')} onBlur={e => { if (cleanAbout(e.target.value) !== aboutOf(c)) void setAbout(c, e.target.value).then(() => bump('dossier', 'side')); }} /></label>)}
      <label className="th-about-row"><span>{persona.name}</span><input className="inp" maxLength={80} defaultValue={myAbout(persona)} placeholder={t('threads.about.myPh')} onBlur={e => { if (cleanAbout(e.target.value) !== myAbout(persona)) void setMyAbout(persona, e.target.value); }} /></label>
      <Check label={t('threads.about.self')} hint={t('threads.about.selfHint')} on={C.aboutSelf} onChange={v => { C.aboutSelf = v; S.set({}); draw(); }} />
    </> : null}
  </div>;
}
/** 자리 그림: 의자 하나. 없는 사람의 의자는 점선으로 비어 있다 */
const Seat = ({ away }: { away: boolean }) => <svg className="fx-art th-seat-art" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
  <path d="M7 20v-7h10v7M7 13V5h10v8" className={away ? 'd' : ''} /><path d="M5 16h14" className="t" />{away ? null : <circle cx="12" cy="9" r="1.6" className="af" />}</svg>;

// ════════ 입력창 위 줄: 귓속말 대상 · 눈치껏 다음 화자 · 돌아가기 ════════
const WHY: Record<string, () => string> = {
  whisper: () => t('threads.why.whisper'), named: () => t('threads.why.named'), mine: () => t('threads.why.mine'), asked: () => t('threads.why.asked'), quiet: () => t('threads.why.quiet'),
  fresh: () => t('threads.why.fresh'), talk: () => t('threads.why.talk'), just: () => t('threads.why.just'), away: () => t('threads.why.away'), muted: () => t('threads.why.muted'),
};
const whyLine = (s: Score) => s.out ? WHY[s.why[0].key]() : s.why.map(w => `${WHY[w.key]()} ${w.pts > 0 ? '+' : '−'}${Math.abs(w.pts)}`).join(' · ');
export function ThreadsBar() {
  useCh('composer'); useCh('msgs');   // 새 말이 오가면 점수도 다시 센다
  const chat = cur.chat, chars = chat ? charsOf(chat) : [], group = chars.length > 1, th = thPeek(chat);
  const scores = chat && group ? scoresFor(chat, chars, cur.msgs) : [], smart = group && chat?.groupOrder === 'smart';
  const tips = scores.map(s => `${s.id}|${s.out ? '' : s.score}|${whyLine(s)}`).join('\n'), away = (th.away || []).join(',');
  // 화자 칩(입력창의 "누가 말할까")에 자리 표시와 점수 근거를 얹는다 — 칩은 본체가 그리므로 속성만 덧붙인다
  useEffect(() => {
    const chips = document.querySelectorAll<HTMLElement>('.composer .speakers .speaker');
    chips.forEach((el, i) => {
      const c = chars[i], s = scores.find(x => x.id === c?.id); if (!c) return;
      if ((th.away || []).includes(c.id)) el.dataset.thAway = '1'; else delete el.dataset.thAway;
      const base = el.dataset.thBase ?? (el.dataset.thBase = el.title.split('\n')[0]);
      el.title = (th.away || []).includes(c.id) ? `${base}\n${t('threads.seat.chipAway')}` : smart && s ? `${base}\n${t('threads.order.score', { n: s.score })} — ${whyLine(s)}` : base;
      if (smart && s && !s.out) el.dataset.thScore = String(s.score); else delete el.dataset.thScore;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tips, away, smart, chat?.id]);
  if (!chat) return null;
  const to = whisperOf(chat), toNames = to.map(id => chars.find(c => c.id === id)?.name).filter(Boolean).join(', ');
  const next = smart ? [...scores].filter(s => !s.out).sort((a, b) => b.score - a.score) : [];
  if (!group && !th.origin) return null;
  const pickTo = (e: React.MouseEvent<HTMLButtonElement>) => menu(e.currentTarget, [
    ...chars.map(c => ({ label: c.name, ic: to.includes(c.id) ? 'check' : 'whisper', hint: (th.away || []).includes(c.id) ? t('threads.seat.away') : undefined, onclick: () => setWhisper(chat, to.includes(c.id) ? to.filter(x => x !== c.id) : [...to, c.id]) })),
    '-', { label: t('threads.whisper.all'), ic: 'users', onclick: () => setWhisper(chat, []) }]);
  const pickNext = (e: React.MouseEvent<HTMLButtonElement>) => menu(e.currentTarget, scores.map(s => ({ label: `${s.name}${s.out ? '' : `  ${s.score}`}`, hint: whyLine(s), onclick: () => { const c = chars.find(x => x.id === s.id); if (c) void generate('normal', { speaker: c }); } })));
  return <div className="th-bar">
    {group ? <button type="button" className={'th-chip fx-tap' + (to.length ? ' on' : '')} aria-pressed={!!to.length} title={t('threads.whisper.pickHint')} onClick={pickTo}><Icon name="whisper" size={14} /><span>{to.length ? t('threads.whisper.to', { names: toNames }) : t('threads.whisper.pick')}</span></button> : null}
    {to.length ? <small className="th-bar-note">{t('threads.whisper.note')}</small> : null}
    {next.length && !to.length ? <button type="button" className="th-chip fx-tap" title={`${t('threads.order.nextHint')}\n${scores.map(s => `${s.name}: ${whyLine(s)}`).join('\n')}`} onClick={pickNext}><span className="fx-lbl kr">{t('threads.order.next')}</span><b>{next[0].name}</b><span className="fx-num">{next[0].score}</span></button> : null}
    {th.origin ? <button type="button" className="th-chip fx-tap" title={t('threads.back.hint')} onClick={() => void goBack(chat)}><Icon name="left" size={14} /><span>{t('threads.back.go')}</span></button> : null}
  </div>;
}

// ════════ 메시지에 붙는 표시 ════════
export function ThreadMarks({ m }: { m: Msg }) {
  const chat = cur.chat; if (!chat) return null;
  const mm = m as ThMsg, s = swOf(m), th = thPeek(chat), name = (id: string) => id === 'user' ? S.persona(chat).name : S.get('chars', id)?.name || '?';
  const rows: ReactNode[] = [];
  const again = () => { dirty(); redraw(m, true); };
  if (mm.thFrom) rows.push(<p key="from" className="th-mark"><Icon name="knot" size={13} /><span>{t('threads.relay.from', { room: mm.thFrom.room })}</span></p>);
  if (m.role === 'user' && mm.thW?.to.length) rows.push(<p key="w" className="th-mark whisper"><Icon name="whisper" size={13} /><span>{t('threads.whisper.badge', { names: mm.thW.to.map(name).join(', ') })}</span></p>);
  if (m.role === 'user') {
    const i = cur.msgs.indexOf(m), nx = cur.msgs[i + 1], c = nx?.role === 'assistant' ? swOf(nx).thCut : undefined;
    if (c?.id === m.id) rows.push(<p key="cut" className="th-mark cut"><span className="th-cut-line" aria-hidden="true" /><span>{t('threads.cut.badge', { name: nx.name })}</span>
      <button type="button" className="th-link" onClick={() => void confirmBox(t('threads.cut.fullTitle') + '\n\n' + msgText(m), t('threads.cut.restore')).then(async ok => { if (!ok) return; delete swOf(nx).thCut; dirty(); await chatApi.save(); redraw(m, true); })}>{t('threads.cut.see')}</button></p>);
  }
  for (const [i, w] of (s.thWh || []).entries()) {
    const veiled = !!th.veilMe && w.to !== 'user' && !w.peeked;
    rows.push(<p key={'wh' + i} className={'th-mark whisper' + (veiled ? ' veiled' : '')}><Icon name="whisper" size={13} /><span className="th-to">{t('threads.whisper.said', { name: name(w.to) })}</span>
      {veiled ? <button type="button" className="th-link" onClick={() => { w.peeked = true; void chatApi.save(); again(); }}>{t('threads.whisper.peek')}</button> : <q>{w.text}</q>}</p>);
  }
  for (const [i, r] of (s.thTo || []).entries()) rows.push(<p key={'to' + i} className="th-mark"><Icon name="knot" size={13} /><button type="button" className="th-link" onClick={() => go('chat', r.id)}>{t('threads.relay.to', { room: r.room })}</button><q>{r.text}</q></p>);
  if (s.thNotes || s.thWipe) rows.push(<p key="n" className="th-mark"><button type="button" className="th-seal fx-tap" title={t('threads.notes.sealHint')} onClick={() => notesDialog(m, chat)}><Icon name="seal" size={13} /><span>{s.thNotes ? t('threads.notes.seal') : t('threads.notes.wiped')}</span></button></p>);
  return rows.length ? <div className="th-marks">{rows}</div> : null;
}

/** 속내 보기: 가림막 뒤에 있다가, 누르면 드러난다. 고치거나 지울 수 있다 */
export function notesDialog(m: Msg, chat: Chat) {
  const s = swOf(m); let val = s.thNotes || '';
  openModal({ title: t('threads.notes.title', { name: m.name || '' }), spec: 'div.th-notes-dlg', actions: [
    { label: t('threads.notes.remove'), ic: 'trash', cls: 'ghost', onclick: () => { delete s.thNotes; delete s.thWipe; void done(); } },
    { label: t('common.save'), ic: 'check', cls: 'primary', onclick: () => { const n = cleanNote(val); if (n.text) s.thNotes = n.text; else delete s.thNotes; void done(); } }] },
    () => <NotesBody text={val} onChange={v => { val = v; }} swipes={m.swipes.length > 1 ? `${m.sw + 1} / ${m.swipes.length}` : ''} />);
  async function done() { if (chatApi.current().chat === chat) { await chatApi.save(); redraw(m, true); bump('drawer'); } }
}
function NotesBody({ text, onChange, swipes }: { text: string; onChange: (v: string) => void; swipes: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <p className="hint">{t('threads.notes.dlgHint')}{swipes ? ' ' + t('threads.notes.swipe', { n: swipes }) : ''}</p>
    <div className={'th-veil fx-frame' + (open ? ' open' : '')}>
      <textarea className="inp" rows={4} defaultValue={text} readOnly={!open} tabIndex={open ? 0 : -1} aria-hidden={!open} placeholder={t('threads.notes.ph')} onChange={e => onChange(e.target.value)} />
      {open ? null : <button type="button" className="th-veil-cover" onClick={() => setOpen(true)}>
        <svg className="fx-art" viewBox="0 0 48 32" width="56" height="38" aria-hidden="true"><path d="M3 5h42v22H3z" /><path d="M3 5l21 14L45 5" className="t" /><path d="M3 27l15-12M45 27L30 15" className="h" /><circle cx="24" cy="19" r="3.2" className="p" /><circle cx="24" cy="19" r="3.2" className="a" /></svg>
        <span>{t('threads.notes.reveal')}</span></button>}
    </div></>;
}

// ════════ 방 사이 카드 (시스템 메시지) ════════ 표 한 장: 권한 장면은 뜯지 않은 표, 다녀온 장면은 반쪽 표
export function ThreadCard({ m }: { m: Msg }) {
  const chat = cur.chat, k = (m as ThMsg).thCard as ThCard; if (!chat || !k) return null;
  const room = k.room ? S.get('chats', k.room) : null;
  const eyebrow = k.kind === 'invite' ? t('threads.card.invite', { name: k.by || '' }) : k.kind === 'left' ? t('threads.card.left') : k.kind === 'arrived' ? t('threads.card.arrived') : t('threads.card.visited');
  return <div className={'th-card fx-ticket ' + k.kind}>
    <div className="th-card-main"><span className="fx-lbl kr">{eyebrow}</span>
      <b className="fx-serif">{k.kind === 'invite' ? k.premise : k.title}</b>
      {k.place ? <small>{k.place}</small> : null}
      {k.kind === 'visited' && k.line ? <p>{k.line}</p> : null}
      {k.kind === 'arrived' && k.line ? <details><summary>{t('threads.card.plot')}</summary><p>{k.line}</p></details> : null}</div>
    <div className="th-card-stub">
      <svg className="fx-art" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9a7 7 0 0 1-9-9z" className={k.kind === 'visited' ? 't' : ''} /><path d="M17 4v3M15.5 5.5h3" className="a" /></svg>
      {k.kind === 'invite' ? <button type="button" className="th-link" title={t('threads.stage.cost')} onClick={() => stageDialog(chat, k.premise, m)}>{t('threads.card.accept')}</button>
        : k.kind !== 'arrived' && room ? <button type="button" className="th-link" onClick={() => go('chat', room.id)}>{k.kind === 'left' ? t('threads.card.goScene') : t('threads.card.reopen')}</button>
          : k.kind === 'arrived' && room && thPeek(chat).origin ? <button type="button" className="th-link" onClick={() => void goBack(chat)}>{t('threads.back.go')}</button> : <span className="fx-lbl">{k.kind === 'arrived' ? 'SCENE' : 'STUB'}</span>}
    </div>
  </div>;
}

// ════════ 장면 건네기 창 ════════ 한 줄(무슨 장면) → 초안(호출 1번) → 고쳐서 열기
export function stageDialog(chat: Chat, premise = '', invite?: Msg) {
  openModal({ title: t('threads.stage.title'), wide: true, spec: 'div.th-stage' }, close => <StageBody chat={chat} premise={premise} close={close} invite={invite} />);
}
function StageBody({ chat, premise, close, invite }: { chat: Chat; premise: string; close: () => void; invite?: Msg }) {
  const [busy, setBusy] = useState(false), [d, setD] = useState<StageDraft | null>(null), [into, setInto] = useState(''), [want, setWant] = useState(premise);
  const rp = linked(chat).filter(o => modeOf(o) === 'rp');
  const make = async () => {
    setBusy(true);
    try { const { msgs } = chatApi.current(), got = await draftStage(chat, chatApi.current().chat === chat ? msgs : await S.msgsFast(chat.id), want); if (got) setD(got); else toast(t('threads.stage.fail'), 'err'); }
    catch (e) { toast(t('threads.stage.err', { err: errMsg(e) }), 'err'); } finally { setBusy(false); }
  };
  const open = async () => {
    if (!d) return; setBusy(true);
    try { if (invite) { (invite as ThMsg).thCard!.done = true; } close(); await openStage(chat, d, rp.find(o => o.id === into) || null); }
    catch (e) { toast(t('threads.stage.err', { err: errMsg(e) }), 'err'); setBusy(false); }
  };
  const F = (k: keyof StageDraft, lbl: string, rows = 0) => <label className="th-f"><span className="fx-lbl kr">{lbl}</span>{rows
    ? <textarea className="inp" rows={rows} value={d![k]} onChange={e => setD({ ...d!, [k]: e.target.value })} /> : <input className="inp" value={d![k]} onChange={e => setD({ ...d!, [k]: e.target.value })} />}</label>;
  return <>
    <ol className="th-steps"><li className={d ? 'done' : 'on'}><span className="fx-num">01</span>{t('threads.stage.step1')}</li><li className={d ? 'on' : ''}><span className="fx-num">02</span>{t('threads.stage.step2')}</li><li><span className="fx-num">03</span>{t('threads.stage.step3')}</li></ol>
    {!d ? <>
      <label className="th-f"><span className="fx-lbl kr">{t('threads.stage.want')}</span><textarea className="inp" rows={2} value={want} placeholder={t('threads.stage.wantPh')} onChange={e => setWant(e.target.value)} /></label>
      <p className="hint">{t('threads.stage.note')}</p>
      <div className="row end"><span className="fx-lbl kr th-cost">{t('threads.stage.cost')}</span><Btn label={busy ? t('threads.stage.making') : t('threads.stage.make')} ic="feather" cls="primary" onClick={() => { if (!busy) void make(); }} /></div>
    </> : <>
      <div className="th-draft fx-frame"><div className="th-draft-top">{F('title', t('threads.stage.fTitle'))}{F('place', t('threads.stage.fPlace'))}{F('time', t('threads.stage.fTime'))}</div>
        {F('situation', t('threads.stage.fSituation'), 3)}{F('opening', t('threads.stage.fOpening'), 7)}</div>
      <div className="th-kv"><span className="fx-lbl kr">{t('threads.stage.into')}</span><Select value={into} opts={[['', t('threads.stage.newRoom')], ...rp.map((o): [string, string] => [o.id, label(o)])]} onChange={setInto} /></div>
      <div className="row end"><Btn label={t('threads.stage.again')} ic="refresh" cls="ghost" title={t('threads.stage.cost')} onClick={() => { if (!busy) void make(); }} /><Btn label={t('threads.stage.go')} ic="ticket" cls="primary" onClick={() => { if (!busy) void open(); }} /></div>
    </>}
  </>;
}

// ════════ 두 스와이프 섞기 (호출 1번) ════════
export function blendDialog(m: Msg, chat: Chat) {
  if (m.role !== 'assistant' || m.swipes.length < 2) return toast(t('threads.blend.need'));
  openModal({ title: t('threads.blend.title'), wide: true, spec: 'div.th-blend' }, close => <BlendBody m={m} chat={chat} close={close} />);
}
function BlendBody({ m, chat, close }: { m: Msg; chat: Chat; close: () => void }) {
  const [a, setA] = useState(m.sw), [b, setB] = useState(m.sw === 0 ? 1 : m.sw - 1), [busy, setBusy] = useState(false);
  const opts = m.swipes.map((_s, i): [string, string] => [String(i), t('threads.blend.nth', { n: i + 1 })]);
  const run = async () => {
    if (a === b || busy) return; setBusy(true);
    try {
      const list = chatApi.current().chat === chat ? chatApi.current().msgs : await S.msgsFast(chat.id), text = (await blend(chat, list, m, a, b)).trim();
      if (!text) return void toast(t('threads.blend.empty'), 'err');
      m.swipes.push({ text, ts: Date.now(), thBlend: [a, b] }); m.sw = m.swipes.length - 1;
      if (chatApi.current().chat === chat) { await chatApi.save(); redraw(m); } else await S.saveMsgs(chat, list);
      close();
    } catch (e) { toast(t('threads.stage.err', { err: errMsg(e) }), 'err'); } finally { setBusy(false); }
  };
  const Col = ({ v, set, tag }: { v: number; set: (n: number) => void; tag: string }) => <div className="th-blend-col fx-frame"><div className="th-blend-head"><span className="fx-lbl">{tag}</span><Select value={String(v)} opts={opts} onChange={x => set(+x)} /></div><p>{m.swipes[v]?.text}</p></div>;
  return <>
    <div className="th-blend-grid"><Col v={a} set={setA} tag="A" />
      <svg className="fx-art th-blend-art" viewBox="0 0 24 48" width="24" height="48" aria-hidden="true"><path d="M2 6c10 0 10 14 10 18s0 18 10 18" className="t" /><path d="M22 6c-10 0-10 14-10 18" /><path d="M12 24v18" className="a" /><circle cx="12" cy="42" r="2" className="af" /></svg>
      <Col v={b} set={setB} tag="B" /></div>
    <p className="hint">{a === b ? t('threads.blend.same') : t('threads.blend.hint')}</p>
    <div className="row end"><span className="fx-lbl kr th-cost">{t('threads.stage.cost')}</span><Btn label={busy ? t('threads.stage.making') : t('threads.blend.run')} ic="blend" cls="primary" onClick={() => void run()} /></div>
  </>;
}

// ════════ 방 목록 · 프로필 카드에 얹는 한 줄 ════════
/** 방 목록: 이어진 방 표시와(몇 곳과 이어졌나), 톡 방이면 캐릭터의 소개 한 줄 */
export function RoomMarks({ c }: { c: Chat }) {
  const n = (thPeek(c).links || []).filter(id => S.get('chats', id)).length, one = c.charIds.length === 1 && modeOf(c) === 'talk' ? S.get('chars', c.charIds[0]) : null, about = one ? aboutOf(one as Char) : '';
  if (!n && !about) return null;
  return <small className="th-room-marks">{n ? <span className="th-tied" title={tn('threads.link.tied', n, { n })}><Icon name="knot" size={12} />{String(n)}</span> : null}{about ? <q>{about}</q> : null}</small>;
}
/** 프로필 카드(도시에): 소개 한 줄. 누르면 고친다 */
export function AboutLine({ ch }: { ch: Char }) {
  const about = aboutOf(ch); if (!about && modeOf(cur.chat) !== 'talk') return null;
  return <button type="button" className={'th-about fx-tap' + (about ? '' : ' none')} title={t('threads.about.edit')} onClick={async () => { const v = await promptBox(t('threads.about.ask', { name: ch.name }), about, { placeholder: t('threads.about.ph') }); if (v !== null) { await setAbout(ch, v); bump('dossier', 'side', 'drawer'); } }}>
    <span aria-hidden="true">“</span>{about || t('threads.about.none')}</button>;
}
