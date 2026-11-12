// 장기기억 — 서고 목록 (옛 f-memoria.js 의 vLibrary): 모든 대화의 기록을 캐릭터별로 찾고 · 한 번에 백업
// 서고가 한 저장소(IndexedDB mem)에 있어 바로 읽는다
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Avatar, Icon } from '../../kit';
import type { ChatM, Mem } from '../types';
import { Ib, Ico, Meter, None, Sec, chatTitle, cur, useBump, type St } from './parts';
import { DB, S } from '../../lib/core';
import { Memory } from '../../lib/memory';
import { chatApi } from '../../chat/actions';
import { toast } from '../../ui';
import { t, locale } from '../../i18n';
import * as memMod from '../../lib/memory';
import * as core from '../../lib/core';

const LIB_OWNERS = 8, LIB_CHATS = 10;   // 한 번에 보여 줄 캐릭터 수 · 캐릭터마다 대화 수 — 나머지는 「더 보기」
type MemLike = Partial<Mem> & { id: string };
interface Entry { chat: ChatM; m: MemLike; key: string; name: string }
const N = (v: unknown) => Number(v || 0).toLocaleString(locale());
const has = (x: Entry) => !!(['turns', 'memories', 'chunks', 'arcs', 'cast', 'bonds', 'canon', 'status', 'pledges', 'milestones', 'items', 'dossier'].some(k => (x.m[k] as unknown[] | undefined)?.length) || x.m.packetPin?.text);
const keyOf = (c: ChatM) => (c.charIds || []).length > 1 ? 'g:' + c.charIds.join('+') : c.charIds?.[0] || '?';
const cnt = (m: MemLike) => ({ turns: m.turns?.length || 0, mem: m.memories?.length || 0, sum: (m.chunks?.length || 0) + (m.arcs?.length || 0), cast: m.cast?.length || 0 });
const day = (t?: number) => t ? new Date(t).toLocaleString(locale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const safeName = (t: string) => String(t).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
/** 끌 수 있는 단추 (Btn 과 같은 모양) */
const B = ({ label, ic, cls = '', title, disabled, onClick }: { label: string; ic?: string; cls?: string; title?: string; disabled?: boolean; onClick: (e: MouseEvent<HTMLButtonElement>) => unknown }) =>
  <button type="button" className={`btn ${cls}`.trim()} title={title} disabled={disabled} onClick={e => void onClick(e)}>{ic && <Icon name={ic} />}<span>{label}</span></button>;
const Check = ({ checked, disabled, label, indeterminate, onChange }: { checked: boolean; disabled: boolean; label: string; indeterminate?: boolean; onChange: (on: boolean) => void }) =>
  <label className="check mm-inline"><input type="checkbox" disabled={disabled} checked={checked} aria-label={label} ref={el => { if (el) el.indeterminate = !!indeterminate; }} onChange={e => onChange(e.target.checked)} /><i /></label>;

export function Library({ st }: { st: St }) {
  const [every, setEvery] = useState<Entry[] | null>(null), [err, setErr] = useState('');
  const draw = useBump(), busy = useRef(false), [note, setNote] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      const mems = new Map((await DB.all('mem') as Mem[]).map(m => [m.id, m]));
      const list = S.chats.map(chat => ({ chat, m: (mems.get(chat.id) || { id: chat.id }) as MemLike, key: keyOf(chat), name: chatApi.groupTitle(chat) || t('memoria.library.deletedChar') }));
      if (live) setEvery(list);
    })().catch(e => { console.error(e); if (live) setErr(t('memoria.library.readFail', { error: (e as Error).message })); });
    return () => { live = false; };
  }, []);
  if (err) return <div className="mm-view"><None text={err} /></div>;
  if (!every) return <div className="mm-view"><None text={t('memoria.library.loading')} /></div>;

  const { fmtDays } = memMod, { download, fmtTime } = core, M = Memory;
  const all = every.filter(has);
  const sel = (st.libSel ||= new Set<string>()) as Set<string>, open = (st.libOpen ||= new Map<string, number | null>()) as Map<string, number | null>, fold = (st.libFold ||= new Set<string>()) as Set<string>, more = (st.libMore ||= new Map<string, number>()) as Map<string, number>;
  const q = String(st.libQ || ''), sort = String(st.libSort || 'recent'), filter = String(st.libFilter || 'recorded');
  const tot = all.reduce((a, x) => { const c = cnt(x.m); a.mem += c.mem; a.sum += c.sum; return a; }, { mem: 0, sum: 0 }), owners = new Set(all.map(x => x.key)).size;
  const pass = (x: Entry) => filter === 'all' ? true : filter === 'empty' ? !has(x) : filter === 'summaries' ? cnt(x.m).sum > 0 : has(x);
  const detail = (x: Entry) => {
    const m = x.m, cps = open.get(m.id), fail = (m.turns || []).filter(t => t.failed).length;
    return <div className="mm-libmore">{[t('memoria.library.d.turns', { n: N(m.turns?.length) }) + (fail ? t('memoria.library.d.failed', { n: fail }) : ''), t('memoria.library.d.cast', { n: N(m.cast?.length) }), t('memoria.library.d.bonds', { n: N(m.bonds?.length) }), t('memoria.library.d.canon', { n: N(m.canon?.length) }), t('memoria.library.d.status', { n: N(m.status?.length) }), t('memoria.library.d.pledges', { n: N((m.pledges || []).filter(p => p.status === 'active').length) }), t('memoria.library.d.milestones', { n: N(m.milestones?.length) }), t('memoria.library.d.items', { n: N(m.items?.length) }), t('memoria.library.d.dossier', { n: N(m.dossier?.length) }), t('memoria.library.d.checkpoints', { n: cps == null ? '…' : cps }), m.packetPin?.text && t('memoria.library.d.pinned'), x.chat.updatedAt && t('memoria.library.d.recent', { date: day(x.chat.updatedAt) })].filter(Boolean).map((t, i) => <span key={i}>{t}</span>)}</div>;
  };
  const say = (t: string) => setNote(t);
  /** 백업할 때 최신 기록을 다시 읽는다 (목록을 연 뒤에 쌓인 기록도 담기게) */
  const backup = async (rows: Entry[]) => {
    rows = rows.filter(has); if (!rows.length) return toast(t('memoria.library.pickToBackup')); if (busy.current) return; busy.current = true; say(t('memoria.library.preparing'));
    try {
      const items = []; for (const x of rows) items.push(M.exportData(x.chat, M.get(x.chat.id) || (await DB.get('mem', x.chat.id) as Mem | undefined) || x.m as Mem));
      if (rows.length === 1) { download(`memoria-${safeName(chatTitle(rows[0].chat))}.json`, JSON.stringify(items[0], null, 2)); say(t('memoria.library.downloadOne')); }
      else { download(`memoria-library-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ type: 'dreamland-memoria-library', version: 1, exportedAt: new Date().toISOString(), items }, null, 2)); say(t('memoria.library.downloadMany', { n: N(rows.length) })); }
    } catch (e) { console.error('[장기기억] 서고 백업:', e); say(t('memoria.library.backupFail', { error: (e as Error).message })); } finally { busy.current = false; }
  };

  const words = q.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
  const rows = every.filter(pass).filter(x => { const t = `${x.name} ${chatTitle(x.chat)} ${chatApi.roomName(x.chat)}`.normalize('NFKC').toLowerCase(); return words.every(w => t.includes(w)); });
  const groups = new Map<string, Entry[]>(); for (const x of rows) { if (!groups.has(x.key)) groups.set(x.key, []); groups.get(x.key)!.push(x); }
  const order = (a: Entry, b: Entry) => (sort === 'mem' ? cnt(b.m).mem - cnt(a.m).mem : sort === 'sum' ? cnt(b.m).sum - cnt(a.m).sum : 0) || (b.chat.updatedAt || 0) - (a.chat.updatedAt || 0);
  const gs = [...groups].map(([key, xs]) => ({ key, name: xs[0].name, group: xs[0].chat.charIds.length > 1, char: S.get('chars', xs[0].chat.charIds[0]), xs: xs.sort(order), mem: xs.reduce((n, x) => n + cnt(x.m).mem, 0), sum: xs.reduce((n, x) => n + cnt(x.m).sum, 0), at: Math.max(...xs.map(x => x.chat.updatedAt || 0)) }))
    .sort((a, b) => (sort === 'mem' ? b.mem - a.mem : sort === 'sum' ? b.sum - a.sum : sort === 'name' ? 0 : b.at - a.at) || String(a.name).localeCompare(String(b.name), 'ko', { numeric: true }));
  const pick = rows.filter(has), shown = Number(st.libOwners) || LIB_OWNERS;
  const chatRow = (x: Entry, mx: number) => {
    const c = cnt(x.m), ok = has(x), id = x.m.id;
    return <div key={id} className={`mm-libchat${sel.has(id) ? ' on' : ''}${st.chat?.id === id ? ' cur' : ''}${ok ? '' : ' blank'}`}><Check disabled={!ok} checked={sel.has(id)} label={t('memoria.library.selectChat', { name: x.name, room: chatApi.roomName(x.chat) })} onChange={on => { if (on) sel.add(id); else sel.delete(id); draw(); }} />
      <div className="mm-libmain"><button className="mm-libopen" title={t('memoria.library.openChat')} onClick={() => { st.tab = 'overview'; void st.load(id); }}><b>{chatApi.roomName(x.chat)}</b><small>{ok ? t('memoria.library.rowStats', { sum: N(c.sum), mem: N(c.mem), turns: N(c.turns) }) + (cur().chat?.id === id ? t('memoria.library.rowCurrent') : '') + ((x.m.clockDays || 0) >= 1 ? t('memoria.library.rowClock', { days: fmtDays(x.m.clockDays || 0) }) : '') + ` · ${fmtTime(x.chat.updatedAt)}` : t('memoria.library.rowEmpty', { time: fmtTime(x.chat.updatedAt) })}</small>{ok ? <Meter v={c.mem} max={mx} /> : null}</button>{open.has(id) ? detail(x) : null}</div>
      {ok ? <Ib name={open.has(id) ? 'up' : 'down'} title={t('memoria.library.details')} onClick={async () => { if (open.has(id)) { open.delete(id); return draw(); } open.set(id, null); draw(); open.set(id, (await M.checkpoints(id).catch(() => [])).length); draw(); }} /> : null}{ok ? <Ib name="import" title={t('memoria.library.backupOne')} onClick={() => backup([x])} /> : null}</div>;
  };
  const opt = (list: [string, string][]) => list.map(([k, l]) => <option key={k} value={k}>{l}</option>);
  return <div className="mm-view">
    <div className="mm-top"><div className="mm-stats">{([[owners, t('memoria.library.s.owners')], [all.length, t('memoria.library.s.chats')], [tot.sum, t('memoria.library.s.sum')], [tot.mem, t('memoria.library.s.mem')]] as const).map(([n, l], i) => <div key={i}><b>{N(n)}</b><span>{l}</span></div>)}</div></div>
    <Sec title={t('memoria.library.title')} desc={t('memoria.library.desc')}>
      <div className="mm-toolbar"><input className="inp" type="search" placeholder={t('memoria.library.searchPh')} aria-label={t('memoria.library.searchLabel')} autoComplete="off" defaultValue={q} onChange={e => { st.libQ = e.target.value; st.libOwners = LIB_OWNERS; draw(); }} />
        <select className="inp auto" title={t('memoria.library.filter')} value={filter} onChange={e => { st.libFilter = e.target.value; st.libOwners = LIB_OWNERS; draw(); }}>{opt([['recorded', t('memoria.library.f.recorded')], ['summaries', t('memoria.library.f.summaries')], ['empty', t('memoria.library.f.empty')], ['all', t('memoria.library.f.all')]])}</select>
        <select className="inp auto" title={t('memoria.library.sort')} value={sort} onChange={e => { st.libSort = e.target.value; draw(); }}>{opt([['recent', t('memoria.library.o.recent')], ['name', t('memoria.library.o.name')], ['sum', t('memoria.library.o.sum')], ['mem', t('memoria.library.o.mem')]])}</select></div>
      <div className="mm-libbar"><b>{sel.size ? t('memoria.library.selected', { n: N(sel.size) }) : t('memoria.library.noneSelected')}<small>{t('memoria.library.barCounts', { owners: N(gs.length), chats: N(rows.length) })}</small></b>
        <B label={t('memoria.library.selectResults')} cls="ghost" title={t('memoria.library.selectResultsTitle')} disabled={!pick.length} onClick={() => { pick.forEach(x => sel.add(x.m.id)); draw(); }} />
        <B label={t('memoria.library.clear')} cls="ghost" disabled={!sel.size} onClick={() => { sel.clear(); draw(); }} />
        <B label={sel.size ? t('memoria.library.backupN', { n: N(sel.size) }) : t('memoria.library.backupSel')} ic="import" cls="primary" disabled={!sel.size} onClick={() => backup(all.filter(x => sel.has(x.m.id)))} /></div>
      <p className="mm-progress" role="status" aria-live="polite" hidden={!note}>{note}</p>
      <div className="mm-lib">{gs.slice(0, shown).map(g => {
        const ok = g.xs.filter(has), n = ok.filter(x => sel.has(x.m.id)).length, folded = fold.has(g.key), lim = more.get(g.key) || LIB_CHATS, mx = Math.max(1, ...g.xs.map(y => cnt(y.m).mem));
        return <section key={g.key} className={`mm-owner${n ? ' on' : ''}`}><header><Check disabled={!ok.length} checked={ok.length > 0 && n === ok.length} indeterminate={n > 0 && n < ok.length} label={t('memoria.library.selectOwner', { name: g.name })} onChange={on => { ok.forEach(x => { if (on) sel.add(x.m.id); else sel.delete(x.m.id); }); draw(); }} /><Avatar o={g.char || { name: g.name }} cls="xs" />
          <button className="mm-ownername" title={folded ? t('memoria.library.expand') : t('memoria.library.collapse')} aria-expanded={String(!folded) as 'true' | 'false'} onClick={() => { if (folded) fold.delete(g.key); else fold.add(g.key); draw(); }}><b>{g.name}</b><small>{t('memoria.library.ownerStats', { chats: N(g.xs.length), sum: N(g.sum), mem: N(g.mem) }) + (g.group ? t('memoria.library.groupChat') : '')}</small></button><Ico name={folded ? 'down' : 'up'} size={14} />
          <B label={t('memoria.library.backupAll', { n: N(ok.length) })} cls="ghost" ic="import" title={g.group ? t('memoria.library.backupAllGroup') : t('memoria.library.backupAllChar')} onClick={() => backup(every.filter(x => x.key === g.key))} /></header>
          {folded ? null : <>{g.xs.slice(0, lim).map(x => chatRow(x, mx))}{g.xs.length > lim ? <button className="btn ghost mm-more" onClick={() => { more.set(g.key, lim + LIB_CHATS); draw(); }}>{t('memoria.library.moreChats', { n: N(g.xs.length - lim) })}</button> : null}</>}</section>;
      })}
        {gs.length > shown ? <button className="btn ghost mm-more" onClick={() => { st.libOwners = shown + LIB_OWNERS; draw(); }}>{t('memoria.library.moreOwners', { n: N(gs.length - shown) })}</button> : null}
        {!gs.length ? <div className="mm-empty"><i className="mm-star">✦</i><b>{every.length ? t('memoria.library.emptyFiltered') : t('memoria.library.empty')}</b>{every.length ? <span>{t('memoria.library.emptyHint')}</span> : null}</div> : null}</div>
      <details className="mm-details"><summary>{t('memoria.library.helpTitle')}</summary><p className="hint">{t('memoria.library.help1Before')}<b>{t('memoria.library.help1Path')}</b>{t('memoria.library.help1After')}</p>
        <p className="hint">{t('memoria.library.help2')}</p></details>
    </Sec>
  </div>;
}
