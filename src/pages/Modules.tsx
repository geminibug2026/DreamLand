// 모듈: 목록(검색 · 거르기 · 스위치) · 편집(정보 · 범위 · 담긴 것) · 가져오기 미리 보기 · 삭제 창
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { L } from '../legacy';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import type { Char } from '../types';
import { toast, promptBox, menu, charPicker, LForm, PageHead, S, Switch, core, errMsg, imageModal, openModal, type ChatX, type Lore } from '../studio/bridge';
import { Assets, M, MODE_LABEL, MOD_ASSET_PROMPT, SCOPES, booksOf, cfg, counts, debounce, list, needs, ownItems, regexOf, roomNote, roomTitle, scopeLabel, text, verLabel, type Asset, type ItemState, type Kind, type Module, type Plan, type Quick, type Scope } from '../modules/lib';
import { pickItems } from '../modules/PickItems';
import { usePaged } from '../ui';

export const page = { name: 'modules', Component: Modules, needs };

const go = (arg?: string) => L.ui.go('modules', arg);
const Stat = ({ ic, label, n }: { ic: string; label: string; n: number }) => <span className={'mod-stat' + (n ? '' : ' zero')} title={`${label} ${n}`}><Icon name={ic} size={14} /><span>{label}</span><b>{String(n)}</b></span>;
function StatRow({ m }: { m: Module }) {
  const n = counts(m);
  return <div className="mod-stats"><Stat ic="book" label="로어북" n={n.lore} /><Stat ic="code" label="정규식" n={n.regex} /><Stat ic="image" label="에셋" n={n.assets} /><Stat ic="play" label="버튼" n={n.quick} />
    {n.css && <span className={'mod-stat' + (m.cssOn ? '' : ' zero')}><Icon name="feather" size={14} /><span>CSS</span><b>{m.cssOn ? '켬' : '끔'}</b></span>}</div>;
}
function warnOn(m: Module) {
  if (!m.on) return;
  if (m.scope === 'char' && !m.charIds.length) toast('켰지만 아직 캐릭터를 고르지 않았어요. 모듈을 열어 범위에서 골라 주세요.');
  else if (m.scope === 'chat' && !m.chatIds.length) toast('켰지만 아직 대화방을 고르지 않았어요. 모듈을 열어 범위에서 골라 주세요.');
}
const exportModule = (m: Module) => { M().exportModule(m).catch((e: unknown) => toast(errMsg(e), 'err')); };

// ── 삭제 창 ──
function removeDialog(m: Module, after: () => void) {
  const own = ownItems(m), has = own.lore.length + own.regex.length > 0, opt = { withItems: false }, n = counts(m);
  openModal({
    title: `"${m.name}" 모듈을 삭제할까요?`, box: 'col mod-dialog',
    actions: [{ label: '취소' }, { label: '삭제', cls: 'danger', onclick: async () => { await M().remove(m, opt); toast('모듈을 삭제했어요'); after(); } }],
  }, () => <>
    <p>모듈이 켜 두었던 것은 꺼지고, 모듈에 담아 둔 그림은 함께 지워집니다.{n.lore + n.regex ? ' 로어북과 정규식은 보관함에 그대로 남아요.' : ''}</p>
    {has && <LForm obj={opt} defs={[{ k: 'withItems', label: `이 모듈과 함께 들어온 ${[own.lore.length && `로어북 ${own.lore.length}권`, own.regex.length && `정규식 ${own.regex.length}개`].filter(Boolean).join(' · ')}도 지우기`, type: 'check', live: true }]} />}
  </>);
}

// ── 가져오기 ──
async function importDialog() {
  const [f] = await core().pickFiles({ accept: '.json,application/json' }); if (!f) return;
  let plan: Plan;
  try {
    if (f.size > 300e6) throw new Error('파일이 너무 커요.');
    const raw = await f.text(); let j: unknown;
    try { j = JSON.parse(raw); } catch { throw new Error(raw.charCodeAt(0) === 111 && raw.charCodeAt(1) === 0 ? '묶어서 압축한 모듈 파일은 읽지 못해요. JSON 으로 내보낸 파일을 써 주세요.' : 'JSON 파일이 아니에요.'); }
    await M().load(); plan = M().readPack(j, f.name);
  } catch (e) { return toast(errMsg(e), 'err'); }
  previewDialog(plan);
}
const PvGroup = ({ ic, label, n, open = false, children }: { ic: string; label: string; n: string; open?: boolean; children: ReactNode }) =>
  <details className="mod-pv" open={open}><summary><Icon name={ic} size={15} /><b>{label}</b><span>{n}</span></summary><div className="mod-pv-body">{children}</div></details>;
function previewDialog(plan: Plan) {
  const p = plan.module, same = M().list.filter(m => m.name === p.name), opt = { how: 'new' };
  const entries = plan.lore.reduce((n, b) => n + b.entries.length, 0), MAX = 14;
  const empty = !plan.lore.length && !plan.regex.length && !plan.assets.length && !p.quick.length && !p.css.trim();
  const rest = (n: number) => n > MAX ? <p className="dim">{`외 ${n - MAX}개`}</p> : null;
  const install = async () => {
    try {
      const { module: m, kept } = await M().installPack(plan, { replace: opt.how === 'new' ? '' : opt.how });
      const left = [kept.lore && `로어북 ${kept.lore}권`, kept.regex && `정규식 ${kept.regex}개`].filter(Boolean).join(' · ');
      toast(`"${m.name}" 모듈을 들여놓았어요.${left ? ` 예전 ${left}은(는) 보관함에 남겼어요.` : ''}`, 'ok');
      go(m.id);
    } catch (e) { console.error(e); toast('가져오지 못했어요: ' + errMsg(e), 'err'); return false; }
  };
  return openModal({ title: '모듈 가져오기', wide: true, box: 'col mod-dialog', actions: [{ label: '취소' }, !empty && { label: '가져오기', cls: 'primary', ic: 'import', onclick: install }] }, () => <>
    <div className="mod-pv-head"><div className="mod-pv-title"><b>{p.name}</b>{p.version && <span className="mod-ver">{verLabel(p.version)}</span>}</div>
      {p.author && <p className="mod-by"><span>만든이</span>{p.author}</p>}{p.description.trim() && <p className="mod-pv-desc">{p.description}</p>}<small className="hint">{plan.source}</small></div>
    {empty ? <p className="dim">가져올 내용이 들어 있지 않아요.</p> : <div className="mod-pv-list">
      {plan.lore.length ? <PvGroup ic="book" label="로어북" n={`${plan.lore.length}권 · 항목 ${entries}개`} open>{plan.lore.slice(0, MAX).map((b, i) => <div className="mod-pv-row" key={i}><b>{b.name}</b><small>{`항목 ${b.entries.length}개${b.entries.some(e => e.constant) ? ` · 상시 ${b.entries.filter(e => e.constant).length}개` : ''}`}</small></div>)}{rest(plan.lore.length)}</PvGroup> : null}
      {plan.regex.length ? <PvGroup ic="code" label="정규식" n={`${plan.regex.length}개`}>{plan.regex.slice(0, MAX).map((r, i) => <div className="mod-pv-row" key={i}><b>{r.name}</b><small>{MODE_LABEL[r.mode] || r.mode}</small><code>{r.find.slice(0, 80)}</code></div>)}{rest(plan.regex.length)}</PvGroup> : null}
      {plan.assets.length ? <PvGroup ic="image" label="에셋" n={`${plan.assets.length}장`}><div className="mod-pv-pics">{plan.assets.slice(0, 24).map(a => <img key={a.name} src={a.data} alt={a.name} title={a.name} loading="lazy" />)}{plan.assets.length > 24 && <span className="dim">{`외 ${plan.assets.length - 24}장`}</span>}</div></PvGroup> : null}
      {p.quick.length ? <PvGroup ic="play" label="빠른 버튼" n={`${p.quick.length}개`}><div className="mod-pv-chips">{p.quick.map((q, i) => <span className="chip static" title={q.text} key={i}>{q.label || q.text.slice(0, 20)}</span>)}</div></PvGroup> : null}
      {p.css.trim() ? <PvGroup ic="feather" label="CSS 조각" n={`${p.css.split('\n').length}줄 · 꺼진 채로 들어옵니다`}><small className="hint">화면 모양을 바꾸는 코드입니다. 들여온 뒤 모듈의 CSS 탭에서 읽어 보고 직접 켜야 적용돼요.</small><pre className="mod-code">{p.css.slice(0, 6000) + (p.css.length > 6000 ? '\n…' : '')}</pre></PvGroup> : null}
    </div>}
    {plan.notes.length ? <ul className="mod-notes">{plan.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
    {same.length ? <label className="field"><span className="field-label">{`같은 이름의 모듈 "${p.name}" 이(가) 이미 있어요`}</span>
      <select className="inp" defaultValue="new" onChange={e => { opt.how = e.target.value; }}><option value="new">따로 두기 · 이름 뒤에 번호를 붙여 새로 들여놓기</option>
        {same.map(m => <option key={m.id} value={m.id}>{`덮어쓰기 · 기존 모듈의 내용을 이 파일로 바꾸기${same.length > 1 ? ` (${L.core.fmtTime(m.updatedAt)} 고침)` : ''}`}</option>)}</select>
      <small className="hint">덮어써도 스위치와 범위는 그대로 둡니다. 이름이 같은 로어북 · 정규식은 내용만 바꾸고, 새 파일에 없는 예전 항목은 지우지 않고 모듈에서만 뺍니다.</small></label> : null}
    <div className="mod-warn"><Icon name="lock" size={16} /><div><b>가져온 파일은 믿을 수 없는 데이터로 다룹니다.</b><span> 들여놓아도 모듈은 꺼져 있고, 로어북은 전역에 올리지 않으며, 정규식과 CSS 도 꺼진 채입니다. 내용을 확인한 뒤 직접 켜세요.</span></div></div>
  </>);
}

// ── 목록 ──
const listState = { q: '', filter: 'all' };
const FILTERS: [string, string, (m: Module) => boolean][] = [['all', '전체', () => true], ['on', '켜짐', m => m.on], ['off', '꺼짐', m => !m.on], ['global', '전역', m => m.scope === 'global'], ['char', '캐릭터', m => m.scope === 'char'], ['chat', '대화방', m => m.scope === 'chat']];
function ListView() {
  const st = listState, all = M().list;
  const [q, setQ] = useState(st.q), [drawn, setDrawn] = useState(0), [, bump] = useState(0);
  const draw = () => setDrawn(n => n + 1);
  // 스위치를 눌러도 카드가 자리를 옮기지 않게, 목록의 순서와 안내 글은 다시 그릴 때만 새로 잡는다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { rows, info } = useMemo(() => {
    const t = st.q.trim().toLowerCase(), fn = FILTERS.find(f => f[0] === st.filter)?.[2] || (() => true);
    const rows = all.filter(fn).filter(m => !t || [m.name, m.author, m.description, ...booksOf(m).map(b => b.name), ...regexOf(m).map(r => r.name)].join(' ').toLowerCase().includes(t))
      .sort((a, b) => +b.on - +a.on || a.name.localeCompare(b.name, 'ko'));
    return { rows, info: all.length ? `${rows.length === all.length ? `모두 ${rows.length}개` : `${rows.length}개 / 전체 ${all.length}개`} · 켜진 것 ${all.filter(m => m.on).length}개` : '' };
  }, [drawn, q, st.filter, all.length]);
  const pg = usePaged(rows, { id: 'modules', perPage: 24, sizes: [12, 24, 48, 96], resetKey: `${q}|${st.filter}` });
  const make = async () => { const m = await M().create(); go(m.id); };
  const setPrompt = useMemo(() => debounce((v: string) => { cfg().assetPrompt = v; S().set({ modules: cfg() }); }, 300), []);
  const card = (m: Module) => <article className={'mod-card' + (m.on ? ' on' : '')} key={m.id}>
    <header className="mod-card-head">
      <button type="button" className="mod-card-title" title="열어서 고치기" onClick={() => go(m.id)}><b>{m.name}</b>{m.version && <span className="mod-ver">{verLabel(m.version)}</span>}</button>
      <Switch checked={m.on} title={`${m.name} 켜기 · 끄기`} onChange={async v => { m.on = v; bump(n => n + 1); await M().save(m); warnOn(m); bump(n => n + 1); }} /></header>
    {m.author && <p className="mod-by"><span>만든이</span>{m.author}</p>}
    <p className={'mod-desc' + (m.description.trim() ? '' : ' none')}>{m.description.trim() || '설명을 적어 두지 않았어요.'}</p>
    <StatRow m={m} />
    <footer className="mod-card-foot">
      <span className="mod-scope"><Icon name={m.scope === 'global' ? 'moon' : m.scope === 'char' ? 'user' : 'chat'} size={14} /><span>{scopeLabel(m)}</span></span>
      {roomNote(m) && <small className="mod-roomnote">{roomNote(m)}</small>}{m.imported && <em className="badge">가져옴</em>}
      <IconBtn ic="more" title="더 보기" cls="tiny" onClick={e => menu(e.currentTarget, [
        { label: '열어서 고치기', ic: 'edit', onclick: () => go(m.id) },
        { label: '파일로 내보내기', ic: 'upload', onclick: () => exportModule(m) },
        { label: '복제', ic: 'copy', onclick: async () => { const c = await M().duplicate(m); toast(`"${c.name}" 을(를) 만들었어요. 꺼진 채로 들어 있어요.`, 'ok'); draw(); } },
        '-',
        { label: '삭제', ic: 'trash', danger: true, onclick: () => removeDialog(m, draw) }])} />
    </footer>
  </article>;
  return <section className="mods">
    <PageHead eyebrow="modules" title="모듈"><Btn label="가져오기" ic="import" title="모듈 파일(JSON) 가져오기" onClick={() => void importDialog()} /><Btn label="새 모듈" ic="plus" cls="primary" onClick={() => void make()} /></PageHead>
    <div className="mod-bar"><div className="search-wrap"><Icon name="search" size={16} /><input className="inp" placeholder="모듈 이름 · 만든이 · 담긴 로어북 이름으로 찾기" value={q} onChange={e => { st.q = e.target.value; setQ(e.target.value); }} /></div><span className="mod-info">{info}</span></div>
    <div className="mod-filters">{FILTERS.map(([id, label, fn]) => <button key={id} type="button" className={'chip' + (st.filter === id ? ' on' : '')} onClick={() => { st.filter = id; draw(); }}>{label}<small>{String(all.filter(fn).length)}</small></button>)}</div>
    <div className="mod-grid" ref={pg.listRef}>{!all.length
      ? <div className="empty mod-empty"><Icon name="panel" size={34} /><p>로어북 · 정규식 · 에셋을 한 묶음으로 만들어 두면 스위치 하나로 켜고 끌 수 있어요.</p><div className="row wrap"><Btn label="새 모듈" ic="plus" cls="primary" onClick={() => void make()} /><Btn label="파일에서 가져오기" ic="import" onClick={() => void importDialog()} /></div></div>
      : !rows.length ? <p className="dim mod-none">찾는 모듈이 없어요.</p> : pg.rows.map(card)}</div>
    <div className="mod-more">{pg.pager}</div>
    <details className="mod-opts"><summary><Icon name="sliders" size={15} />모듈 에셋 안내문</summary>
      <div className="mod-opts-body"><small className="hint">{'켜진 모듈에 그림이 들어 있을 때만 프롬프트에 덧붙습니다(추가 호출 없음). 비워 두면 아래 회색 글이 쓰여요. {{keywords}} 는 그림 이름 목록, {{max}} 는 답변당 최대 개수로 바뀝니다.'}</small>
        <textarea className="inp" rows={5} spellCheck={false} placeholder={MOD_ASSET_PROMPT()} defaultValue={text(cfg().assetPrompt)} onChange={e => setPrompt(e.target.value)} /></div></details>
  </section>;
}

// ── 편집: 에셋 탭 ──
function AssetsTab({ m, redraw }: { m: Module; redraw: () => void }) {
  const A = Assets(), owner = M().ownerOf(m), alive = useRef(true);
  const [all, setAll] = useState<Asset[] | null>(null);
  const pg = usePaged(all || [], { id: 'moduleAssets', perPage: 60, sizes: [30, 60, 120, 240], resetKey: m.id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    alive.current = true;
    void A.load([owner]).then(() => { if (!alive.current) return; const got = A.list(owner); setAll(got); if (m.assetCount !== got.length) { m.assetCount = got.length; void M().save(m); redraw(); } });
    return () => { alive.current = false; };
  }, []);
  if (!all) return <div className="col" />;
  const after = async () => { await A.reload([owner]); m.assetCount = A.list(owner).length; await M().save(m); if (!alive.current) return; setAll(A.list(owner)); redraw(); };
  const rename = async (a: Asset) => {
    const v = await promptBox('에셋 이름', a.name); if (v == null) return; const name = A.cleanName(v);
    if (!name || name === a.name) return; if (all.some(o => o !== a && o.name === name)) return toast('같은 이름의 그림이 이미 있어요', 'err');
    await A.update({ ...a, name }); void after();
  };
  const upload = async () => {
    const files = await core().pickFiles({ accept: 'image/*,.zip', multiple: true }); if (!files.length) return;
    try { const n = await A.addFiles(owner, files); toast(n ? `그림 ${n}장을 담았어요` : '담을 그림을 찾지 못했어요', n ? 'ok' : ''); } catch (e) { toast(errMsg(e), 'err'); }
    void after();
  };
  const fromChar = () => charPicker({ title: '어느 캐릭터의 에셋에서 담을까요?', multi: false, onDone: async ([cid]) => {
    const src = A.ownerOfChar(cid); await A.load([src]);
    const have = new Set(all.map(a => a.name)), pool = A.list(src);
    if (!pool.length) return toast('그 캐릭터에는 에셋이 없어요');
    pickItems({ title: `${S().get<Char>('chars', cid)?.name || '캐릭터'}의 에셋`, okLabel: '복사해서 담기', ph: '그림 이름으로 찾기', items: pool.map(a => ({ id: a.id, thumb: a.data, title: a.name, sub: [a.ver && `버전 ${a.ver}`, have.has(a.name) && '같은 이름이 이미 있음 · 덮어씀'].filter(Boolean).join(' · '), search: a.name.toLowerCase() })),
      onDone: async sel => { for (const a of pool.filter(x => sel.includes(x.id))) await A.add(owner, a.name, a.data); toast(`그림 ${sel.length}장을 복사해 담았어요`, 'ok'); void after(); } });
  } });
  return <div className="col">
    <div className="row wrap"><Btn label="그림 올리기" ic="upload" title="이미지 여러 장 또는 ZIP" onClick={() => void upload()} /><Btn label="캐릭터 에셋에서 담기" ic="copy" onClick={fromChar} />{all.length > 0 && <span className="mod-info">{`${all.length}장`}</span>}</div>
    <small className="hint">{'모듈이 켜진 대화에서 {{img::이름}} 으로 불러옵니다. 같은 이름이 캐릭터나 페르소나 에셋에 있으면 그쪽이 먼저예요. 그림은 원본을 복사해 모듈 안에 따로 보관합니다.'}</small>
    <div className="mod-assets" ref={pg.listRef}>{pg.rows.map(a => <figure className="mod-asset" key={a.id}>
      <button type="button" className="mod-asset-pic" title="크게 보기" onClick={() => imageModal(a.name, a.data)}><img src={a.data} alt={a.name} loading="lazy" /></button>
      <figcaption><button type="button" className="mod-asset-name" title="이름 바꾸기" onClick={() => void rename(a)}>{a.name}</button><IconBtn ic="x" title="그림 빼기" cls="tiny" onClick={async () => { await A.remove(a); void after(); }} /></figcaption>
    </figure>)}{!all.length && <p className="dim mod-none">아직 담긴 그림이 없어요.</p>}</div>
    <div>{pg.pager}</div>
  </div>;
}

// ── 편집 ──
const quickKeys = new WeakMap<Quick, number>(); let quickSeq = 0;
const quickKey = (q: Quick) => quickKeys.get(q) ?? (quickKeys.set(q, ++quickSeq), quickSeq);
type TabId = 'lore' | 'regex' | 'assets' | 'quick' | 'css';
function Editor({ m }: { m: Module }) {
  const [tab, setTab] = useState<TabId>('lore'), [, bump] = useState(0), redraw = () => bump(n => n + 1);
  const save = useMemo(() => debounce(() => { void M().save(m); }, 300), [m]);
  const store = async () => { await M().save(m); redraw(); };
  const quickBox = useRef<HTMLDivElement>(null), focusNew = useRef(false);
  useEffect(() => { if (focusNew.current) { focusNew.current = false; quickBox.current?.lastElementChild?.querySelector('input')?.focus(); } });

  // 범위
  const note = roomNote(m);
  const extra = note ? <div className="row wrap mod-rooms-note"><small className="hint">{`장면 패널에서 ${note}`}</small><Btn label="방마다 바꾼 것 지우기" cls="ghost" onClick={async () => { m.rooms = {}; await store(); }} /></div> : null;
  let scopeBody: ReactNode;
  if (m.scope === 'global') scopeBody = <><small className="hint">스위치를 켜면 모든 대화에 적용됩니다.</small>{extra}</>;
  else if (m.scope === 'char') {
    const cs = m.charIds.map(i => S().get<Char>('chars', i)).filter((c): c is Char => !!c);
    scopeBody = <><small className="hint">스위치가 켜져 있으면, 고른 캐릭터가 나오는 대화방을 열 때 적용되고 떠날 때 되돌립니다.</small>
      <div className="mod-targets">{cs.map(c => <span className="chip static mod-target" key={c.id}><Avatar o={c} cls="xs" /><span>{c.name}</span><button type="button" title="빼기" aria-label={`${c.name} 빼기`} onClick={async () => { m.charIds = m.charIds.filter(i => i !== c.id); await store(); }}><Icon name="x" size={12} /></button></span>)}
        <Btn label={cs.length ? '캐릭터 고르기' : '캐릭터를 골라 주세요'} ic="users" onClick={() => charPicker({ title: '이 모듈을 쓸 캐릭터', selected: m.charIds, onDone: async sel => { m.charIds = sel; await store(); } })} /></div>{extra}</>;
  } else {
    const rooms = m.chatIds.map(i => S().get<ChatX>('chats', i)).filter((c): c is ChatX => !!c);
    const more = () => {
      const lastId = S().settings.lastChat, pool = S().chats.filter(c => !m.chatIds.includes(c.id)).sort((a, b) => +(b.id === lastId) - +(a.id === lastId) || b.updatedAt - a.updatedAt);
      pickItems({ title: '이 모듈을 쓸 대화방', okLabel: '고르기', ph: '캐릭터나 방 이름으로 찾기', empty: '고를 대화방이 없어요.', items: pool.map(c => ({ id: c.id, ic: 'chat', title: roomTitle(c), sub: `${c.id === lastId ? '마지막으로 연 방 · ' : ''}메시지 ${c.count || 0}개 · ${L.core.fmtTime(c.updatedAt)}`, search: (roomTitle(c) + ' ' + (c.preview || '')).toLowerCase() })),
        onDone: async sel => { m.chatIds = [...m.chatIds, ...sel]; await store(); } });
    };
    scopeBody = <><small className="hint">스위치가 켜져 있으면, 고른 대화방을 열 때 적용되고 떠날 때 되돌립니다. 대화 화면의 장면 패널에서도 방마다 켜고 끌 수 있어요.</small>
      <div className="mod-rows">{rooms.slice(0, 40).map(c => <div className="mod-row" key={c.id}><span className="mod-row-ic"><Icon name="chat" size={15} /></span><div className="mod-row-text"><b>{roomTitle(c)}</b><small>{`메시지 ${c.count || 0}개 · ${L.core.fmtTime(c.updatedAt)}`}</small></div>
        <IconBtn ic="x" title="이 방 빼기" cls="tiny" onClick={async () => { m.chatIds = m.chatIds.filter(i => i !== c.id); await store(); }} /></div>)}{rooms.length > 40 && <p className="dim">{`외 ${rooms.length - 40}곳`}</p>}</div>
      <div className="row"><Btn label={rooms.length ? '대화방 더 고르기' : '대화방을 골라 주세요'} ic="chat" onClick={more} /></div>{extra}</>;
  }

  // 담긴 것
  const stateBadge = (kind: Kind, id: string, st: ItemState) => {
    if (st === 'mod') return <em className="badge on">모듈이 켬</em>;
    if (st === 'muted') return <><em className="badge">직접 꺼 둠</em><Btn label="모듈에 맞추기" cls="ghost mod-mini" title="직접 꺼 둔 것을 풀고 모듈 스위치를 따르게 합니다" onClick={async () => { await M().wake(kind, id); redraw(); }} /></>;
    if (st === 'user') return <><em className="badge">직접 켜 둠</em><Btn label="모듈에 맡기기" cls="ghost mod-mini" title="지금은 모듈을 꺼도 켜져 있어요. 맡기면 모듈 스위치를 따라 켜지고 꺼집니다" onClick={async () => { await M().handOver(kind, id); redraw(); }} /></>;
    return <em className="badge">{M().effective(m, null) ? '꺼짐' : m.on && m.scope !== 'global' ? '해당 대화에서 켜짐' : '꺼짐'}</em>;
  };
  const rowsBox = (rows: ReactNode[], emptyText: string) => <div className="mod-rows">{rows.length ? rows : <p className="dim mod-none">{emptyText}</p>}</div>;
  const activeLore = list<string>(S().settings.activeLore);
  const charName = (scope?: string) => S().get<Char>('chars', scope)?.name || '캐릭터';
  const pickLore = () => pickItems({ title: '모듈에 담을 로어북', empty: '담을 로어북이 없어요. 로어북 화면에서 먼저 만들어 주세요.',
    items: S().lore.filter(b => !m.lore.includes(b.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((b: Lore) => ({ id: b.id, ic: 'book', title: b.name, sub: `항목 ${list(b.entries).length}개${activeLore.includes(b.id) ? ' · 지금 전역으로 켜져 있음' : ''}`, search: (b.name + ' ' + (b.description || '')).toLowerCase() })),
    onDone: async sel => { m.lore = [...m.lore, ...sel]; await store(); } });
  const pickRegex = () => pickItems({ title: '모듈에 담을 정규식', empty: '담을 정규식이 없어요. 정규식 화면에서 먼저 만들어 주세요.',
    items: S().regex.filter(r => !m.regex.includes(r.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(r => ({ id: r.id, ic: 'code', title: r.name, sub: `${MODE_LABEL[r.mode] || r.mode}${r.scope && r.scope !== 'global' ? ' · ' + charName(r.scope) : ''}${r.enabled ? ' · 지금 켜져 있음' : ''}`, search: (r.name + ' ' + (r.find || '')).toLowerCase() })),
    onDone: async sel => { m.regex = [...m.regex, ...sel]; await store(); } });
  const TABS: Record<TabId, { label: string; n: () => number | string; draw: () => ReactNode }> = {
    lore: { label: '로어북', n: () => booksOf(m).length, draw: () => <>
      <div className="row wrap"><Btn label="로어북 담기" ic="plus" onClick={pickLore} /><small className="hint">모듈이 켜지면 담긴 로어북을 전역 목록에 올리고, 꺼지면 모듈이 올린 것만 내립니다.</small></div>
      {rowsBox(booksOf(m).map(b => <div className="mod-row" key={b.id}><span className="mod-row-ic"><Icon name="book" size={15} /></span><div className="mod-row-text"><b>{b.name}</b><small>{`항목 ${list(b.entries).length}개${b.description ? ' · ' + b.description : ''}`}</small></div>
        <div className="mod-row-state">{stateBadge('lore', b.id, M().loreState(b.id))}</div>
        <IconBtn ic="edit" title="로어북 화면에서 열기" cls="tiny" onClick={() => L.ui.go('lore', b.id)} /><IconBtn ic="x" title="모듈에서 빼기" cls="tiny" onClick={async () => { m.lore = m.lore.filter(i => i !== b.id); await store(); }} /></div>), '아직 담긴 로어북이 없어요.')}</> },
    regex: { label: '정규식', n: () => regexOf(m).length, draw: () => <>
      <div className="row wrap"><Btn label="정규식 담기" ic="plus" onClick={pickRegex} /><small className="hint">모듈이 켜지면 담긴 정규식을 켜고, 꺼지면 모듈이 켠 것만 끕니다.</small></div>
      {rowsBox(regexOf(m).map(r => <div className="mod-row" key={r.id}><span className="mod-row-ic"><Icon name="code" size={15} /></span><div className="mod-row-text"><b>{r.name}</b><small>{`${MODE_LABEL[r.mode] || r.mode}${r.scope && r.scope !== 'global' ? ' · ' + charName(r.scope) + ' 전용' : ''}`}</small></div>
        <div className="mod-row-state">{stateBadge('regex', r.id, M().regexState(r))}</div>
        <IconBtn ic="edit" title="정규식 화면에서 열기" cls="tiny" onClick={() => L.ui.go('regex', r.id)} /><IconBtn ic="x" title="모듈에서 빼기" cls="tiny" onClick={async () => { m.regex = m.regex.filter(i => i !== r.id); await store(); }} /></div>), '아직 담긴 정규식이 없어요.')}</> },
    assets: { label: '에셋', n: () => m.assetCount || 0, draw: () => <AssetsTab m={m} redraw={redraw} /> },
    quick: { label: '빠른 버튼', n: () => m.quick.length, draw: () => <>
      <div className="row wrap"><Btn label="버튼 추가" ic="plus" onClick={() => { m.quick.push({ label: '', text: '' }); focusNew.current = true; redraw(); }} /><small className="hint">모듈이 켜져 있는 동안 입력창 위에 나타납니다. 내용이 / 로 시작하면 명령어로 실행돼요. 이름과 내용을 모두 적은 버튼만 나옵니다.</small></div>
      <div className="mod-quick" ref={quickBox}>{m.quick.map((q, i) => <div className="mod-quick-row" key={quickKey(q)}>
        <input className="inp" defaultValue={q.label} placeholder="버튼 이름" aria-label="버튼 이름" onChange={e => { q.label = e.target.value.trim(); save(); redraw(); }} />
        <input className="inp" defaultValue={q.text} placeholder="넣을 글 또는 /명령어" aria-label="버튼 내용" spellCheck={false} onChange={e => { q.text = e.target.value; save(); }} />
        <IconBtn ic="x" title="버튼 지우기" cls="tiny" onClick={async () => { m.quick.splice(i, 1); await store(); }} /></div>)}{!m.quick.length && <p className="dim mod-none">아직 버튼이 없어요.</p>}</div></> },
    css: { label: 'CSS', n: () => (m.css.trim() ? (m.cssOn ? '켬' : '끔') : 0), draw: () => <>
      {m.imported && <div className="mod-warn"><Icon name="lock" size={16} /><div><b>가져온 모듈의 CSS 입니다.</b><span> 화면을 가리거나 다르게 보이게 만들 수 있으니, 내용을 읽어 보고 믿을 수 있을 때만 켜세요. 가져올 때는 항상 꺼진 채로 들어옵니다.</span></div></div>}
      <label className="mod-switch-line"><Switch checked={m.cssOn} title="CSS 조각 적용" onChange={async v => { m.cssOn = v; redraw(); await store(); }} /><span>이 CSS 조각 적용</span><small>모듈이 켜져 있을 때만 함께 적용됩니다</small></label>
      <textarea className="inp mod-code" rows={12} spellCheck={false} placeholder=".msg-body { letter-spacing: -0.01em; }" defaultValue={m.css} onChange={e => { m.css = e.target.value; save(); redraw(); }} />
      <small className="hint">바깥 주소를 부르는 @import 와 url() 은 빼고 적용합니다(그림은 data: 주소만).</small></> },
  };

  return <section className="mods mod-edit">
    <Btn label="모듈 목록" ic="left" cls="ghost mod-back" onClick={() => go()} />
    <PageHead eyebrow="module" title={m.name.trim() || '이름 없는 모듈'}>
      <label className="mod-switch-line"><Switch checked={m.on} title="모듈 켜기 · 끄기" onChange={async v => { m.on = v; redraw(); await M().save(m); warnOn(m); redraw(); }} /><span>켜기</span></label>
      <Btn label="내보내기" ic="upload" title="이 모듈을 파일 하나로 내보내기" onClick={() => exportModule(m)} />
      <IconBtn ic="more" title="더 보기" onClick={e => menu(e.currentTarget, [
        { label: '복제', ic: 'copy', onclick: async () => { const c = await M().duplicate(m); toast('복제했어요. 꺼진 채로 들어 있어요.', 'ok'); go(c.id); } },
        '-', { label: '삭제', ic: 'trash', danger: true, onclick: () => removeDialog(m, () => go()) }])} />
    </PageHead>
    <div className="card mod-sec"><h3 className="form-sec">정보</h3>
      <LForm obj={m} defs={[{ k: 'name', label: '이름', half: true }, { k: 'version', label: '버전', third: true, ph: '1.0' }, { k: 'author', label: '만든이', half: true }, { k: 'description', label: '설명', type: 'area', rows: 3, ph: '무엇을 하는 모듈인지, 어떤 캐릭터와 쓰면 좋은지' }]}
        onChange={() => { m.name = text(m.name, 120); redraw(); save(); }} /></div>
    <div className="card mod-sec"><h3 className="form-sec">범위</h3>
      <label className="field mod-scope-field"><span className="field-label">어디에 적용할까요</span><select className="inp" value={m.scope} onChange={async e => { m.scope = e.target.value as Scope; redraw(); await M().save(m); warnOn(m); redraw(); }}>{SCOPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className="mod-scope-body">{scopeBody}</div></div>
    <div className="card mod-sec"><h3 className="form-sec">담긴 것</h3>
      <div className="tabs mod-tabs">{(Object.entries(TABS) as [TabId, typeof TABS[TabId]][]).map(([id, t]) => { const n = t.n(); return <button key={id} type="button" className={'tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{t.label}{n ? <small className="mod-tab-n">{String(n)}</small> : null}</button>; })}</div>
      <div className="mod-tabbody" key={tab}>{TABS[tab].draw()}</div></div>
  </section>;
}

function Modules({ arg }: { arg?: unknown }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { let alive = true; void M().load().then(() => { if (alive) setReady(true); }); return () => { alive = false; }; }, []);
  if (!ready) return null;
  const m = typeof arg === 'string' && arg ? M().byId(arg) : undefined;
  return m ? <Editor m={m} key={m.id} /> : <ListView />;
}
