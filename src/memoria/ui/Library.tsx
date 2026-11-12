// 장기기억 — 서고 목록 (옛 f-memoria.js 의 vLibrary): 모든 대화의 기록을 캐릭터별로 찾고 · 한 번에 백업
// 서고가 한 저장소(IndexedDB mem)에 있어 바로 읽는다
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Avatar, Icon } from '../../kit';
import { DB, Memory, S, chatApi, core, memMod, toast } from '../bridge';
import type { ChatM, Mem } from '../types';
import { Ib, Ico, Meter, None, Sec, chatTitle, cur, useBump, type St } from './parts';

const LIB_OWNERS = 8, LIB_CHATS = 10;   // 한 번에 보여 줄 캐릭터 수 · 캐릭터마다 대화 수 — 나머지는 「더 보기」
type MemLike = Partial<Mem> & { id: string };
interface Entry { chat: ChatM; m: MemLike; key: string; name: string }
const N = (v: unknown) => Number(v || 0).toLocaleString('ko-KR');
const has = (x: Entry) => !!(['turns', 'memories', 'chunks', 'arcs', 'cast', 'bonds', 'canon', 'status', 'pledges', 'milestones', 'items', 'dossier'].some(k => (x.m[k] as unknown[] | undefined)?.length) || x.m.packetPin?.text);
const keyOf = (c: ChatM) => (c.charIds || []).length > 1 ? 'g:' + c.charIds.join('+') : c.charIds?.[0] || '?';
const cnt = (m: MemLike) => ({ turns: m.turns?.length || 0, mem: m.memories?.length || 0, sum: (m.chunks?.length || 0) + (m.arcs?.length || 0), cast: m.cast?.length || 0 });
const day = (t?: number) => t ? new Date(t).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
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
      const mems = new Map((await DB().all<Mem>('mem')).map(m => [m.id, m]));
      const list = S().chats.map(chat => ({ chat, m: (mems.get(chat.id) || { id: chat.id }) as MemLike, key: keyOf(chat), name: chatApi().groupTitle(chat) || '삭제된 캐릭터' }));
      if (live) setEvery(list);
    })().catch(e => { console.error(e); if (live) setErr('서고를 읽지 못했어요: ' + (e as Error).message); });
    return () => { live = false; };
  }, []);
  if (err) return <div className="mm-view"><None text={err} /></div>;
  if (!every) return <div className="mm-view"><None text="서고를 살피는 중…" /></div>;

  const { fmtDays } = memMod(), { download, fmtTime } = core(), M = Memory();
  const all = every.filter(has);
  const sel = (st.libSel ||= new Set<string>()) as Set<string>, open = (st.libOpen ||= new Map<string, number | null>()) as Map<string, number | null>, fold = (st.libFold ||= new Set<string>()) as Set<string>, more = (st.libMore ||= new Map<string, number>()) as Map<string, number>;
  const q = String(st.libQ || ''), sort = String(st.libSort || 'recent'), filter = String(st.libFilter || 'recorded');
  const tot = all.reduce((a, x) => { const c = cnt(x.m); a.mem += c.mem; a.sum += c.sum; return a; }, { mem: 0, sum: 0 }), owners = new Set(all.map(x => x.key)).size;
  const pass = (x: Entry) => filter === 'all' ? true : filter === 'empty' ? !has(x) : filter === 'summaries' ? cnt(x.m).sum > 0 : has(x);
  const detail = (x: Entry) => {
    const m = x.m, cps = open.get(m.id), fail = (m.turns || []).filter(t => t.failed).length;
    return <div className="mm-libmore">{[`턴 기록 ${N(m.turns?.length)}${fail ? ` (실패 ${fail})` : ''}`, `인물 ${N(m.cast?.length)}`, `관계선 ${N(m.bonds?.length)}`, `캐논 ${N(m.canon?.length)}`, `상태 ${N(m.status?.length)}`, `서약 ${N((m.pledges || []).filter(p => p.status === 'active').length)}`, `전환점 ${N(m.milestones?.length)}`, `아이템 ${N(m.items?.length)}`, `자료실 ${N(m.dossier?.length)}`, `복구 지점 ${cps == null ? '…' : cps}`, m.packetPin?.text && '장부 고정 중', x.chat.updatedAt && `최근 대화 ${day(x.chat.updatedAt)}`].filter(Boolean).map((t, i) => <span key={i}>{t}</span>)}</div>;
  };
  const say = (t: string) => setNote(t);
  /** 백업할 때 최신 기록을 다시 읽는다 (목록을 연 뒤에 쌓인 기록도 담기게) */
  const backup = async (rows: Entry[]) => {
    rows = rows.filter(has); if (!rows.length) return toast('백업할 기록이 있는 대화를 선택해 주세요.'); if (busy.current) return; busy.current = true; say('최신 기록을 읽어 백업 파일을 준비합니다…');
    try {
      const items = []; for (const x of rows) items.push(M.exportData(x.chat, M.get(x.chat.id) || await DB().get<Mem>('mem', x.chat.id) || x.m));
      if (rows.length === 1) { download(`memoria-${safeName(chatTitle(rows[0].chat))}.json`, JSON.stringify(items[0], null, 2)); say('JSON 다운로드를 요청했습니다. 기기의 다운로드 목록에서 파일을 확인해 주세요.'); }
      else { download(`memoria-library-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ type: 'dreamland-memoria-library', version: 1, exportedAt: new Date().toISOString(), items }, null, 2)); say(`${N(rows.length)}개 대화의 묶음 백업 다운로드를 요청했습니다. 기기의 다운로드 목록에서 파일을 확인해 주세요.`); }
    } catch (e) { console.error('[장기기억] 서고 백업:', e); say('백업하지 못했습니다: ' + (e as Error).message); } finally { busy.current = false; }
  };

  const words = q.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
  const rows = every.filter(pass).filter(x => { const t = `${x.name} ${chatTitle(x.chat)} ${chatApi().roomName(x.chat)}`.normalize('NFKC').toLowerCase(); return words.every(w => t.includes(w)); });
  const groups = new Map<string, Entry[]>(); for (const x of rows) { if (!groups.has(x.key)) groups.set(x.key, []); groups.get(x.key)!.push(x); }
  const order = (a: Entry, b: Entry) => (sort === 'mem' ? cnt(b.m).mem - cnt(a.m).mem : sort === 'sum' ? cnt(b.m).sum - cnt(a.m).sum : 0) || (b.chat.updatedAt || 0) - (a.chat.updatedAt || 0);
  const gs = [...groups].map(([key, xs]) => ({ key, name: xs[0].name, group: xs[0].chat.charIds.length > 1, char: S().get('chars', xs[0].chat.charIds[0]), xs: xs.sort(order), mem: xs.reduce((n, x) => n + cnt(x.m).mem, 0), sum: xs.reduce((n, x) => n + cnt(x.m).sum, 0), at: Math.max(...xs.map(x => x.chat.updatedAt || 0)) }))
    .sort((a, b) => (sort === 'mem' ? b.mem - a.mem : sort === 'sum' ? b.sum - a.sum : sort === 'name' ? 0 : b.at - a.at) || String(a.name).localeCompare(String(b.name), 'ko', { numeric: true }));
  const pick = rows.filter(has), shown = Number(st.libOwners) || LIB_OWNERS;
  const chatRow = (x: Entry, mx: number) => {
    const c = cnt(x.m), ok = has(x), id = x.m.id;
    return <div key={id} className={`mm-libchat${sel.has(id) ? ' on' : ''}${st.chat?.id === id ? ' cur' : ''}${ok ? '' : ' blank'}`}><Check disabled={!ok} checked={sel.has(id)} label={`${x.name} · ${chatApi().roomName(x.chat)} 선택`} onChange={on => { if (on) sel.add(id); else sel.delete(id); draw(); }} />
      <div className="mm-libmain"><button className="mm-libopen" title="이 대화의 서고 열기" onClick={() => { st.tab = 'overview'; void st.load(id); }}><b>{chatApi().roomName(x.chat)}</b><small>{ok ? `요약 ${N(c.sum)} · 기억 ${N(c.mem)} · ${N(c.turns)}턴${cur().chat?.id === id ? ' · 현재 대화' : ''}${(x.m.clockDays || 0) >= 1 ? ` · 이야기 속 ${fmtDays(x.m.clockDays || 0)}` : ''} · ${fmtTime(x.chat.updatedAt)}` : `빈 서고 · ${fmtTime(x.chat.updatedAt)}`}</small>{ok ? <Meter v={c.mem} max={mx} /> : null}</button>{open.has(id) ? detail(x) : null}</div>
      {ok ? <Ib name={open.has(id) ? 'up' : 'down'} title="자세히" onClick={async () => { if (open.has(id)) { open.delete(id); return draw(); } open.set(id, null); draw(); open.set(id, (await M.checkpoints(id).catch(() => [])).length); draw(); }} /> : null}{ok ? <Ib name="import" title="이 대화 JSON 백업" onClick={() => backup([x])} /> : null}</div>;
  };
  const opt = (list: [string, string][]) => list.map(([k, l]) => <option key={k} value={k}>{l}</option>);
  return <div className="mm-view">
    <div className="mm-top"><div className="mm-stats">{([[owners, '캐릭터·그룹'], [all.length, '기록 대화'], [tot.sum, '요약'], [tot.mem, '기억']] as const).map(([n, l]) => <div key={l}><b>{N(n)}</b><span>{l}</span></div>)}</div></div>
    <Sec title="전체 서고" desc="캐릭터별로 찾고, 대화별로 보관하세요. 기록을 읽기만 합니다 · AI 호출·요금 없음">
      <div className="mm-toolbar"><input className="inp" type="search" placeholder="캐릭터 이름 또는 대화 이름" aria-label="캐릭터·대화 찾기" autoComplete="off" defaultValue={q} onChange={e => { st.libQ = e.target.value; st.libOwners = LIB_OWNERS; draw(); }} />
        <select className="inp auto" title="표시할 기록" value={filter} onChange={e => { st.libFilter = e.target.value; st.libOwners = LIB_OWNERS; draw(); }}>{opt([['recorded', '기록 있음'], ['summaries', '요약 있음'], ['empty', '빈 서고'], ['all', '모든 대화']])}</select>
        <select className="inp auto" title="정렬" value={sort} onChange={e => { st.libSort = e.target.value; draw(); }}>{opt([['recent', '최근 대화순'], ['name', '이름순'], ['sum', '요약 많은 순'], ['mem', '기억 많은 순']])}</select></div>
      <div className="mm-libbar"><b>{sel.size ? `총 ${N(sel.size)}개 선택` : '선택 없음'}<small>{` · 캐릭터·그룹 ${N(gs.length)}개 · 대화 ${N(rows.length)}개`}</small></b>
        <B label="검색 결과 선택" cls="ghost" title="현재 검색·표시 조건에 맞는 대화를 모두 선택합니다." disabled={!pick.length} onClick={() => { pick.forEach(x => sel.add(x.m.id)); draw(); }} />
        <B label="해제" cls="ghost" disabled={!sel.size} onClick={() => { sel.clear(); draw(); }} />
        <B label={sel.size ? `${N(sel.size)}개 백업` : '선택 백업'} ic="import" cls="primary" disabled={!sel.size} onClick={() => backup(all.filter(x => sel.has(x.m.id)))} /></div>
      <p className="mm-progress" role="status" aria-live="polite" hidden={!note}>{note}</p>
      <div className="mm-lib">{gs.slice(0, shown).map(g => {
        const ok = g.xs.filter(has), n = ok.filter(x => sel.has(x.m.id)).length, folded = fold.has(g.key), lim = more.get(g.key) || LIB_CHATS, mx = Math.max(1, ...g.xs.map(y => cnt(y.m).mem));
        return <section key={g.key} className={`mm-owner${n ? ' on' : ''}`}><header><Check disabled={!ok.length} checked={ok.length > 0 && n === ok.length} indeterminate={n > 0 && n < ok.length} label={`${g.name}의 검색된 대화 모두 선택`} onChange={on => { ok.forEach(x => { if (on) sel.add(x.m.id); else sel.delete(x.m.id); }); draw(); }} /><Avatar o={g.char || { name: g.name }} cls="xs" />
          <button className="mm-ownername" title={folded ? '대화 목록 펼치기' : '대화 목록 접기'} aria-expanded={String(!folded) as 'true' | 'false'} onClick={() => { if (folded) fold.delete(g.key); else fold.add(g.key); draw(); }}><b>{g.name}</b><small>{`대화 ${N(g.xs.length)} · 요약 ${N(g.sum)} · 기억 ${N(g.mem)}${g.group ? ' · 그룹 대화' : ''}`}</small></button><Ico name={folded ? 'down' : 'up'} size={14} />
          <B label={`전체 백업 · ${N(ok.length)}개`} cls="ghost" ic="import" title={`이 ${g.group ? '그룹' : '캐릭터'}의 기록 있는 대화를 모두 백업합니다`} onClick={() => backup(every.filter(x => x.key === g.key))} /></header>
          {folded ? null : <>{g.xs.slice(0, lim).map(x => chatRow(x, mx))}{g.xs.length > lim ? <button className="btn ghost mm-more" onClick={() => { more.set(g.key, lim + LIB_CHATS); draw(); }}>{`대화 더 보기 (${N(g.xs.length - lim)})`}</button> : null}</>}</section>;
      })}
        {gs.length > shown ? <button className="btn ghost mm-more" onClick={() => { st.libOwners = shown + LIB_OWNERS; draw(); }}>{`캐릭터 더 보기 (${N(gs.length - shown)})`}</button> : null}
        {!gs.length ? <div className="mm-empty"><i className="mm-star">✦</i><b>{every.length ? '표시할 대화가 없어요' : '아직 대화가 없어요'}</b>{every.length ? <span>검색어나 표시 조건을 바꿔 보세요. 빈 서고는 기본 목록에서 제외됩니다.</span> : null}</div> : null}</div>
      <details className="mm-details"><summary>백업과 복원 안내</summary><p className="hint">대화 하나는 JSON 파일 하나로, 여러 대화는 묶음 JSON 파일 하나로 받습니다. 복원할 대화를 열고 <b>도구 → 백업·복원 → 가져오기</b>에서 그 파일을 고르면 그 대화의 기록을 찾아 복원합니다 (다른 대화로 옮기려면 「인계」).</p>
        <p className="hint">백업할 때 최신 기록을 다시 읽습니다. 기억·요약·도감을 보관하며, 대화 원문과 캐릭터 카드, API 설정은 포함하지 않습니다. 복구 지점은 서고와 따로 보관되어 백업에 들어가지 않습니다.</p></details>
    </Sec>
  </div>;
}
