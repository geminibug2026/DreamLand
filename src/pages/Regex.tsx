// 정규식: 범위 셋(전역 · 프리셋 · 캐릭터) + 전체 · 검색 · 거르기 · 순서 바꾸기 · 일괄 조작 · 가져오기/내보내기
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { L } from '../legacy';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import type { Char } from '../types';
import { PageHead, S, Switch, arr, confirmBox, core, errMsg, menu, plain, toast, useDragSort, type Preset, type Regex } from '../studio/bridge';
import { Cards, G, RX, allowState, chatApi, clip, exportMany, exportOne, isAllowed, isGlobal, modeShort, needs, redrawChat, safeName, scKey, scName, setAllow, whoShort, worst, type Entry, type Sc } from '../regex/lib';
import { crossPageItems, usePaged } from '../ui';
import { openDebugger } from '../regex/Debugger';
import { openEditor } from '../regex/Editor';
import { importFlow, setsDialog } from '../regex/dialogs';
import { pickChar, pickTarget } from '../regex/pick';

export const page = { name: 'regex', Component: RegexPage, needs };

type Tab = 'global' | 'preset' | 'char' | 'all';
// 화면을 떠났다 돌아와도 남는 보기 상태
const view = { tab: 'global' as Tab, presetId: '', charId: '', q: '', filter: 'all', pick: false, picked: new Set<string>(), shown: 120 };
const FILTERS: [string, string, (e: Entry) => boolean][] = [['all', '전체', () => true], ['on', '켜짐', e => !!e.r.enabled], ['off', '꺼짐', e => !e.r.enabled], ['bad', '문제 있음', e => !!worst(e.r)]];
const keyOf = (e: Entry) => `${scKey(e.sc)}|${e.r.id}`;

/** 화면에 들어올 때 한 번: 인자('preset:<id>' | 'char:<id>' | 정규식 id)에 맞춰 탭을 잡고, 바로 열 스크립트를 돌려준다 */
function enter(arg: unknown): Entry | null {
  let openAfter: Entry | null = null;
  if (typeof arg === 'string' && arg) {
    if (arg.startsWith('preset:')) { view.tab = 'preset'; view.presetId = arg.slice(7); }
    else if (arg.startsWith('char:')) { view.tab = 'char'; view.charId = arg.slice(5); }
    else { const hit = RX().findScript(arg); if (hit) { view.tab = hit.sc.kind; if (hit.sc.kind === 'preset') view.presetId = hit.sc.id || ''; if (hit.sc.kind === 'char') view.charId = hit.sc.id || ''; openAfter = hit; } }
    L.ui.route.arg = null;
  }
  const chat = chatApi().current().chat;
  if (!S().get('presets', view.presetId)) view.presetId = (chat ? S().presetFor(chat) : S().preset())?.id || '';
  if (!S().get('chars', view.charId)) view.charId = chat?.charIds?.[0] || S().regex.find(r => !isGlobal(r) && S().get('chars', r.scope))?.scope || S().chars[0]?.id || '';
  view.pick = false; view.picked.clear(); view.shown = 120;
  return openAfter;
}

function RegexPage({ arg }: { arg?: unknown }) {
  const [openAfter] = useState(() => enter(arg));
  const [, bump] = useState(0), drawAll = () => bump(n => n + 1), [q, setQ] = useState(view.q);
  const Scope = RX().Scope, listEl = useRef<HTMLDivElement | null>(null), focusAt = useRef(-1);
  const curScope = (): Sc | null => (view.tab === 'global' ? G : view.tab === 'preset' ? (view.presetId ? { kind: 'preset', id: view.presetId } : null) : view.tab === 'char' ? (view.charId ? { kind: 'char', id: view.charId } : null) : null);
  const entries = (): Entry[] => { if (view.tab === 'all') return RX().everything(); const sc = curScope(); return sc ? Scope.list(sc).map(r => ({ r, sc })) : []; };
  const shownEntries = () => { const t = view.q.trim().toLowerCase(), f = (FILTERS.find(x => x[0] === view.filter) || FILTERS[0])[2]; return entries().filter(e => f(e) && (!t || `${e.r.name}\n${e.r.find}\n${e.r.replace}`.toLowerCase().includes(t))); };
  const canSort = () => view.tab !== 'all' && !view.q.trim() && view.filter === 'all' && !view.pick;
  const pickedEntries = () => entries().filter(e => view.picked.has(keyOf(e)));
  const after = () => { drawAll(); redrawChat(); };
  const showScope = (to: Sc) => { view.tab = to.kind; if (to.kind === 'preset') view.presetId = to.id || ''; if (to.kind === 'char') view.charId = to.id || ''; view.picked.clear(); after(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (openAfter) openEditor(openAfter.r, openAfter.sc, { onClose: after }); }, []);
  useEffect(() => { if (focusAt.current >= 0) { listEl.current?.children[focusAt.current - base.current.start]?.querySelector<HTMLElement>('.grip')?.focus(); focusAt.current = -1; } });

  const newScript = async () => {
    const sc = curScope() || G;
    if (view.tab === 'preset' && !curScope()) return toast('먼저 프리셋을 골라 주세요', 'err');
    if (view.tab === 'char' && !curScope()) return toast('먼저 캐릭터를 골라 주세요', 'err');
    const r = await Scope.add(sc, core().newRegex());
    if (!isAllowed(sc)) setAllow(sc, true);
    drawAll(); openEditor(r, sc, { onClose: after });
  };
  const move = async (sc: Sc, from: number, to: number) => { const list = Scope.list(sc); if (to < 0 || to >= list.length || to === from) return; const [x] = list.splice(from, 1); list.splice(to, 0, x); await Scope.reorder(sc, list); drawAll(); redrawChat(); };
  const base = useRef({ start: 0, per: 60 });   // 지금 쪽의 첫 자리 · 한 쪽 개수 (끌기 · 메뉴가 쪽 안 자리를 전체 자리로 바꾼다)
  const drag = useDragSort((from, to) => { const sc = curScope(); if (sc && canSort()) void move(sc, base.current.start + from, base.current.start + to); });
  const copy = async (e: Entry) => {
    const rest: Regex = structuredClone(e.r); delete rest.src; delete rest.mod;
    const c = await Scope.add(e.sc, { ...rest, id: L.core.uid(), name: `${e.r.name} (사본)` });
    const list = Scope.list(e.sc), at = list.indexOf(e.r);
    if (at >= 0) { list.splice(list.indexOf(c), 1); list.splice(at + 1, 0, c); await Scope.reorder(e.sc, list); }
    after();
  };
  const rowMenu = (anchor: Element, e: Entry, i: number, n: number) => menu(anchor, [
    { label: '편집', ic: 'edit', onclick: () => openEditor(e.r, e.sc, { onClose: after }) },
    { label: '시험해 보기', ic: 'play', onclick: () => openEditor(e.r, e.sc, { tab: 'test', onClose: after }) },
    canSort() && i > 0 && { label: '위로', ic: 'up', onclick: () => move(e.sc, i, i - 1) },
    canSort() && i < n - 1 && { label: '아래로', ic: 'down', onclick: () => move(e.sc, i, i + 1) },
    canSort() && i > 0 && { label: '맨 위로', ic: 'up', onclick: () => move(e.sc, i, 0) },
    canSort() && i < n - 1 && { label: '맨 아래로', ic: 'down', onclick: () => move(e.sc, i, n - 1) },
    ...(canSort() && n > base.current.per ? crossPageItems(i, n, base.current.per, (a, b) => void move(e.sc, a, b)).filter(x => x && x.label.includes('쪽')) : []),
    '-',
    { label: '복제', ic: 'copy', onclick: () => copy(e) },
    { label: '다른 범위로 옮기기', ic: 'right', onclick: async () => { const to = await pickTarget(anchor, e.sc); if (!to) return; await RX().moveScripts([e], to); toast(`${scName(to)}(으)로 옮겼어요`, 'ok'); after(); } },
    { label: '내보내기 (실리태번 JSON)', ic: 'import', onclick: () => exportOne(e.r) },
    '-',
    { label: '삭제', ic: 'trash', danger: true, onclick: async () => { if (!(await confirmBox(`"${e.r.name}" 정규식을 삭제할까요?`, '삭제', true))) return; await Scope.remove(e.sc, e.r); after(); } },
  ]);
  const togglePick = (key: string, on: boolean) => { if (on) view.picked.add(key); else view.picked.delete(key); drawAll(); };
  const row = (e: Entry, i: number, n: number) => {
    const { r, sc } = e, bad = worst(r), key = keyOf(e), sortable = canSort();
    const click = (ev: MouseEvent<HTMLDivElement>) => {
      if ((ev.target as Element).closest('button, label, input')) return;
      if (view.pick) return togglePick(key, !view.picked.has(key));
      openEditor(r, sc, { onClose: after });
    };
    const keys = (ev: KeyboardEvent) => { if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return; ev.preventDefault(); const j = i + (ev.key === 'ArrowUp' ? -1 : 1); void move(sc, i, j).then(() => { focusAt.current = j; drawAll(); }); };
    return <div className={'rx-row' + (r.enabled ? '' : ' off') + (view.picked.has(key) ? ' picked' : '')} data-key={key} key={key} onClick={click}>
      {view.pick
        ? <label className="check rx-pick" onClick={ev => ev.stopPropagation()}><input type="checkbox" checked={view.picked.has(key)} aria-label={`${r.name} 고르기`} onChange={ev => togglePick(key, ev.target.checked)} /><i /></label>
        : sortable ? <button type="button" className="grip" title="잡고 끌어서 순서 바꾸기 (방향키 ↑ ↓ 로도)" aria-label="순서 바꾸기" onClick={ev => ev.stopPropagation()} onKeyDown={keys}><Icon name="grip" size={16} /></button>
          : <span className="rx-no">{String(i + 1).padStart(2, '0')}</span>}
      <Switch checked={!!r.enabled} title={`${r.name} 켜기 · 끄기`} onChange={async v => { r.enabled = v; drawAll(); await Scope.save(sc, r); drawAll(); redrawChat(); }} />
      <div className="rx-row-text"><b>{r.name || '이름 없음'}</b><small>{view.tab === 'all' && <span className="rx-where">{scName(sc)}</span>}<code>{clip(r.find, 80) || '찾기 없음'}</code></small></div>
      <span className="rx-row-meta">{bad ? <em className={`badge rx-flag ${bad}`}>{bad === 'error' ? '오류' : '주의'}</em> : null}<span className="rx-tag">{whoShort(r)}</span><span className="rx-tag">{modeShort(r)}</span></span>
      <IconBtn ic="more" title="더 보기" onClick={ev => { ev.stopPropagation(); rowMenu(ev.currentTarget, e, i, n); }} />
    </div>;
  };

  // 범위 줄
  const allowRow = (sc: Sc, what: string) => <label className="rx-allow"><Switch span checked={isAllowed(sc)} title={`${what}의 정규식 사용`} onChange={v => { setAllow(sc, v); drawAll(); redrawChat(); }} /><span>{`${what}의 정규식 사용`}</span>
    {allowState(sc) === 'ask' && Scope.list(sc).length ? <em className="badge">가져온 뒤 아직 허용하지 않음</em> : null}</label>;
  const sc = curScope();
  let scope: ReactNode;
  if (view.tab === 'preset') {
    const p = sc && S().get<Preset>('presets', sc.id);
    const merge = async () => {
      const [f] = await core().pickFiles({ accept: '.json' }); if (!f || !sc) return;
      try { const j: unknown = JSON.parse(await f.text()); if (!plain(j)) throw new Error('프리셋 파일이 아니에요'); core().download(f.name, JSON.stringify(Cards().stPresetWithRegex(j, Scope.list(sc)), null, 4)); toast('정규식을 실은 프리셋 파일을 내려받았어요', 'ok'); } catch (err) { toast(errMsg(err), 'err'); }
    };
    scope = <><div className="rx-scope-row">
      <select className="inp rx-owner" aria-label="프리셋 고르기" value={view.presetId} onChange={e => { view.presetId = e.target.value; view.picked.clear(); drawAll(); }}>{S().presets.map(x => <option key={x.id} value={x.id}>{`${x.name}${x.id === S().settings.activePreset ? ' · 사용 중' : ''} (${arr(x.regex).length})`}</option>)}</select>
      {sc && allowRow(sc, '이 프리셋')}
      {p && <IconBtn ic="more" title="프리셋 내보내기" onClick={e => menu(e.currentTarget, [
        { label: '실리태번 프리셋으로 내보내기 (정규식 포함)', ic: 'import', onclick: () => core().download(`${safeName(p.name)}.json`, JSON.stringify(Cards().presetToSt(p), null, 4)) },
        { label: '가진 실리태번 프리셋 파일에 이 정규식 싣기', ic: 'merge', onclick: merge },
        { label: '프리셋 화면에서 열기', ic: 'sliders', onclick: () => L.ui.go('presets', p.id) }])} />}</div>
      <small className="hint">이 프리셋을 쓰는 대화에서만 적용되고, 프리셋을 내보내거나 복제하면 함께 따라갑니다. 전역 다음, 캐릭터 앞 순서로 돕니다.</small></>;
  } else if (view.tab === 'char') {
    const c = sc && S().get<Char>('chars', sc.id);
    scope = <><div className="rx-scope-row">
      <button type="button" className="rx-owner rx-charbtn" title="캐릭터 고르기" onClick={async () => { const id = await pickChar('어느 캐릭터의 정규식을 볼까요?'); if (id) { view.charId = id; view.picked.clear(); drawAll(); } }}>{c ? <Avatar o={c} cls="xs" /> : <Icon name="user" size={18} />}<b>{c?.name || '캐릭터 고르기'}</b><Icon name="down" size={14} /></button>
      {sc && allowRow(sc, '이 캐릭터')}</div>
      <small className="hint">이 캐릭터와의 대화에서만 적용되고, 캐릭터 카드를 내보내면 함께 따라갑니다. 그룹 대화에서는 이 캐릭터가 쓴 메시지에만 적용돼요. 순서는 맨 마지막입니다.</small></>;
  } else scope = <small className="hint">{view.tab === 'global' ? '모든 대화에 적용됩니다. 가장 먼저 돕니다.' : '모든 범위의 정규식을 한꺼번에 찾아볼 수 있어요. 순서는 범위 탭에서 바꿉니다.'}</small>;

  // 일괄 조작
  const bulk = (label: string, ic: string, fn: (items: Entry[], anchor: Element) => unknown, cls = '') => <Btn label={label} ic={ic} cls={cls} onClick={e => { const items = pickedEntries(), anchor = e.currentTarget; if (!items.length) return toast('먼저 정규식을 골라 주세요'); void fn(items, anchor); }} />;
  const setOn = async (items: Entry[], v: boolean) => {
    const presets = new Set<string>();
    for (const { r, sc: s } of items) { if (!!r.enabled === v) continue; r.enabled = v; if (s.kind === 'preset') presets.add(s.id || ''); else await S().save('regex', r, true); }
    for (const id of presets) { const p = S().get<Preset>('presets', id); if (p) await S().save('presets', p, true); }
    after();
  };

  const all = entries(), rows = shownEntries(), pg = usePaged(rows, { id: 'regex', perPage: 60, sizes: [30, 60, 120, 240], resetKey: [view.tab, view.presetId, view.charId, view.q, view.filter].join('|') });
  base.current = { start: pg.start, per: pg.perPage };
  const narrowed = rows.length !== all.length, allOn = rows.length > 0 && rows.every(e => view.picked.has(keyOf(e)));
  const count = { global: Scope.list(G).length, preset: view.presetId ? Scope.list({ kind: 'preset', id: view.presetId }).length : 0, char: view.charId ? Scope.list({ kind: 'char', id: view.charId }).length : 0 };
  const tabs: [Tab, string, number | null][] = [['global', '전역', count.global], ['preset', '프리셋', count.preset], ['char', '캐릭터', count.char], ['all', '전체', null]];
  const bring = () => void importFlow(curScope() || G, showScope);
  const emptyText = all.length ? '찾는 정규식이 없어요.' : view.tab === 'char' && !sc ? '캐릭터를 먼저 만들어 주세요.' : view.tab === 'global' ? '응답을 다듬거나 꾸미는 찾아 바꾸기 규칙을 만들 수 있어요.' : view.tab === 'preset' ? '이 프리셋에는 아직 정규식이 없어요. 여기에 만든 정규식은 프리셋과 함께 다닙니다.' : view.tab === 'char' ? '이 캐릭터에는 아직 정규식이 없어요. 여기에 만든 정규식은 캐릭터 카드와 함께 다닙니다.' : '아직 정규식이 없어요.';

  return <section className="rx">
    <PageHead eyebrow="regex" title="정규식">
      <Btn label="디버거" ic="eye" title="메시지 하나가 어떤 정규식을 거치는지 단계별로 보기" onClick={() => openDebugger()} />
      <Btn label="켜짐 묶음" ic="mark" title="켜고 꺼 둔 상태를 저장해 두고 한 번에 바꾸기" onClick={() => setsDialog(after)} />
      <Btn label="가져오기" ic="import" title="실리태번 정규식 JSON (낱개 · 묶음), 정규식이 실린 프리셋 · 캐릭터 카드 JSON" onClick={bring} />
      <Btn label="새 정규식" ic="plus" cls="primary" onClick={() => void newScript()} />
    </PageHead>
    <div className="tabs rx-tabs">{tabs.map(([t, label, c]) => <button key={t} type="button" className={'tab' + (view.tab === t ? ' on' : '')} onClick={() => { view.tab = t; view.shown = 120; view.picked.clear(); drawAll(); }}>{label}{c !== null ? <small>{String(c)}</small> : null}</button>)}</div>
    <div className="rx-scope">{scope}</div>
    <div className="rx-tools"><div className="search-wrap"><Icon name="search" size={16} /><input className="inp search" placeholder="이름 · 찾기 · 바꾸기 내용으로 찾기" value={q} onChange={e => { view.q = e.target.value; view.shown = 120; setQ(e.target.value); }} /></div>
      <div className="rx-chips">{FILTERS.map(([f, label]) => <button key={f} type="button" className={'chip' + (view.filter === f ? ' on' : '')} onClick={() => { view.filter = f; view.shown = 120; drawAll(); }}>{label}</button>)}</div>
      <button type="button" className={'chip rx-pickbtn' + (view.pick ? ' on' : '')} onClick={() => { view.pick = !view.pick; if (!view.pick) view.picked.clear(); drawAll(); }}>여러 개 고르기</button></div>
    <div className="rx-info">
      {all.length ? <span>{narrowed ? `찾은 것 ${rows.length}개 · 전체 ${all.length}개` : `${all.length}개 · 켜짐 ${all.filter(e => e.r.enabled).length}개`}</span> : ''}
      {all.length && view.tab !== 'all' ? <span className="dim">{canSort() ? '위에서부터 차례로 적용됩니다' : view.pick ? '' : '순서를 바꾸려면 검색과 거르기를 지우세요'}</span> : ''}
      {view.tab === 'all' && all.length ? <span className="dim">적용 순서: 전역 → 프리셋 → 캐릭터</span> : ''}
    </div>
    <div className={'rx-list' + (view.pick ? ' picking' : '')} ref={el => { listEl.current = el; pg.listRef(el); return drag(el); }}>
      {pg.rows.map((e, k) => row(e, pg.start + k, rows.length))}
      {!rows.length && <div className="empty rx-empty"><Icon name="code" size={30} /><p>{emptyText}</p>
        {!all.length && sc ? <div className="row wrap"><Btn label="새 정규식" ic="plus" cls="primary" onClick={() => void newScript()} /><Btn label="가져오기" ic="import" onClick={bring} /></div> : null}</div>}
    </div>
    <div className="rx-morebox">{pg.pager}</div>
    <div className="rx-bulk" hidden={!view.pick}>{view.pick ? <>
      <b className="rx-bulk-n">{`${view.picked.size}개 고름`}</b>
      <Btn label={allOn ? '모두 풀기' : '보이는 것 모두'} cls="ghost" onClick={() => { for (const e of rows) { if (allOn) view.picked.delete(keyOf(e)); else view.picked.add(keyOf(e)); } drawAll(); }} />
      <span className="rx-bulk-acts">
        {bulk('켜기', 'check', items => setOn(items, true))}{bulk('끄기', 'x', items => setOn(items, false))}
        {bulk('옮기기', 'right', async (items, anchor) => { const to = await pickTarget(anchor); if (!to) return; const n = await RX().moveScripts(items, to); view.picked.clear(); toast(n ? `${scName(to)}(으)로 ${n}개를 옮겼어요` : '이미 그 범위에 있어요', 'ok'); after(); })}
        {bulk('내보내기', 'import', items => exportMany(items.map(e => e.r)))}
        {bulk('삭제', 'trash', async items => { if (!(await confirmBox(`고른 정규식 ${items.length}개를 삭제할까요?`, '삭제', true))) return; for (const e of items) await Scope.remove(e.sc, e.r); view.picked.clear(); after(); }, 'danger')}
      </span>
      <Btn label="끝내기" cls="ghost" onClick={() => { view.pick = false; view.picked.clear(); drawAll(); }} /></> : null}</div>
  </section>;
}
