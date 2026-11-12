// 로어북 편집기 (항목이 수백 개여도 찾고 · 접고 · 한꺼번에 고칠 수 있게) + 로어북 스위치 · 연결 · 전체 설정
import { LORE_POS, loreLinks } from '../lib/f-lore';
import { useRef, useState, type ReactNode } from 'react';
import { Btn, Icon, IconBtn, useEvents } from '../kit';
import { Form, confirmBox, menu, openModal, toast, usePaged, type FormDefs, type ModalHandle } from '../ui';
import type { Entry, Lore, LoreHit } from './types';
import { useBump, useDebounced, type EditorApi } from './parts';
import { S } from '../lib/core';
import * as engine from '../lib/engine';
import * as core from '../lib/core';
import * as cards from '../lib/cards';

const POS_SHORT: Record<string, string> = { before: '설명 앞', after: '설명 뒤', em_top: '예시 앞', em_bottom: '예시 뒤', an_top: '노트 위', an_bottom: '노트 아래', depth: '깊이', outlet: '아울렛' };
const TRIGGERS: [string, string][] = [['normal', '일반 답변'], ['continue', '이어 쓰기'], ['impersonate', '대신 써 주기'], ['regenerate', '다시 생성'], ['swipe', '답변 넘기기'], ['quiet', '조용한 생성 (/gen)']];
const TRI: [string, string][] = [['', '로어북 설정을 따름'], ['true', '켬'], ['false', '끔']];
const tri = (v: unknown) => v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;
const MATCH: [string, string][] = [['matchPersona', '페르소나 설명'], ['matchCharDesc', '캐릭터 설명'], ['matchCharPersonality', '캐릭터 성격'], ['matchScenario', '시나리오'], ['matchCharNote', '캐릭터 노트'], ['matchCreatorNotes', '제작자 노트']];
const PAGE = 40;
const titleOf = (e: Entry) => e.name || (e.keys || []).slice(0, 3).join(', ') || '(이름 없는 항목)';
const copy = <T,>(o: T): T => { try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)) as T; } };
const tok = (e: Entry) => engine.tokens(e.content);

/** 값이 빠진 예전 항목을 편집할 수 있게 채운다 (저장된 뜻은 바꾸지 않는다) */
function ready(e: Entry) {
  e.charFilter ||= { names: [], tags: [], exclude: false }; e.charFilter.names ||= []; e.charFilter.tags ||= [];
  e.triggers ||= []; e.keys ||= []; e.keys2 ||= [];
  if (e.groupWeight == null) e.groupWeight = 100;
  if (e.groupOverride == null) e.groupOverride = true;   // 예전 항목: 같은 묶음에서는 우선순위가 가장 높은 하나
  return e;
}

/** 로어북 전체 설정 (모든 로어북에 함께 적용) */
export function loreSettingsDialog() {
  const G = S.settings.lore ||= {};
  openModal({ title: '로어북 전체 설정', body: <div className="col">
    <Form obj={G} defs={[
      { k: 'includeNames', label: '살필 때 말한 사람 이름을 앞에 붙이기', type: 'check', hint: '"이름: 대사" 꼴로 살핍니다. 캐릭터 이름을 키워드로 쓰면 그 캐릭터가 말할 때마다 발동해요.' },
      { k: 'groupScoring', label: '묶음 안에서 키워드가 더 많이 걸린 항목을 먼저', type: 'check', hint: '항목마다 따로 정하지 않았을 때의 기본값입니다.' },
      { k: 'minActivations', label: '최소 발동 수', type: 'num', min: 0, half: true, hint: '이 수를 채울 때까지 더 옛 메시지로 거슬러 올라가며 살핍니다. 0 이면 쓰지 않아요.' },
      { k: 'minDepthMax', label: '거슬러 올라갈 최대 메시지 수', type: 'num', min: 0, half: true, hint: '0 이면 대화 처음까지.' },
      { k: 'maxRecursion', label: '연쇄 발동 단계 한도', type: 'num', min: 0, half: true, hint: '0 은 제한 없음, 1 은 연쇄 없음, 2 는 한 번만 더.' },
    ]} onChange={() => S.set({ lore: G })} />
    <p className="hint">살필 메시지 수 · 토큰 예산 · 연쇄 발동 · 대소문자 · 단어 단위는 로어북마다 따로 정합니다. 모두 추가 호출 없이 프롬프트를 만들 때 계산돼요.</p>
  </div>, actions: [{ label: '닫기', cls: 'primary' }] });
}

/** 발동 시험: 적은 글에 어떤 항목이 걸리는지 */
function TestBody({ b }: { b: Lore }) {
  const ta = useRef<HTMLTextAreaElement>(null), kind = useRef<HTMLSelectElement>(null);
  const [out, setOut] = useState<ReactNode>(null);
  const run = () => {
    const text = ta.current?.value || ''; if (!text.trim()) return setOut(<p className="dim">글을 적어 주세요.</p>);
    const chat = S.get('chats', S.settings.lastChat), ch = S.get('chars', chat?.charIds?.[0]) || null, persona = chat ? S.persona(chat) : null;
    const k = kind.current?.value || 'normal', type = k === 'regenerate' ? 'regen' : k;
    const hits: LoreHit[] = engine.scanLore([b], [{ content: text }], { user: persona?.name || '', char: ch?.name || '', vars: {} }, { count: 9999, type, char: ch, persona });
    const total = hits.reduce((n, e) => n + e.tok, 0);
    setOut(<><small className="hint">{hits.length ? `${hits.length}개 발동 · ≈${total} 토큰${ch ? ` · 캐릭터 조건은 "${ch.name}" 기준` : ''} · 확률과 묶음 추첨은 누를 때마다 달라질 수 있어요` : '발동한 항목이 없어요. (지연 · 쿨다운은 시험에서 빼고 봅니다)'}</small>
      {hits.map((e, i) => <div className="lore-test-row" key={i}><b>{titleOf(e)}</b><span>{POS_SHORT[e.position || ''] || ''}</span><span className="tokbadge">{`≈${e.tok}`}</span></div>)}</>);
  };
  return <div className="col">
    <textarea className="inp" rows={5} ref={ta} placeholder="여기에 대화 한 토막을 적으면, 이 로어북에서 어떤 항목이 발동하는지 보여 줍니다." />
    <div className="row wrap"><span className="field-label">생성 종류</span><select className="inp auto" ref={kind}>{TRIGGERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><Btn label="시험하기" ic="play" cls="primary" onClick={run} /></div>
    <div className="lore-test">{out}</div>
  </div>;
}


/** 로어북 켜고 끄기: 켜면 모든 대화에서 쓰인다. 목록과 편집기의 스위치가 서로 맞춰진다 */
export { LORE_POS, loreLinks };
export function LoreSwitch({ b, after }: { b: Lore; after?: (on: boolean) => void }) {
  useEvents('settings');
  return <label className="switch lore-sw" title="모든 대화에서 켜기 / 끄기" onClick={e => e.stopPropagation()}>
    <input type="checkbox" data-lore-sw={b.id} checked={S.settings.activeLore.includes(b.id)} onChange={e => {
      const on = e.target.checked; S.set({ activeLore: on ? [...new Set([...S.settings.activeLore, b.id])] : S.settings.activeLore.filter(i => i !== b.id) });
      for (const x of document.querySelectorAll<HTMLInputElement>('input[data-lore-sw]')) if (x.dataset.loreSw === b.id) x.checked = on;
      after?.(on);
    }} /><i /></label>;
}

type Fixed = () => [Lore, string][];
/** 로어북 고르는 창의 내용 */
function PickList({ holder, toggle, fixed, mine }: { holder: { loreIds?: string[] }; toggle: (id: string) => void; fixed: Fixed; mine: () => string[] }) {
  const redraw = useBump(), [q, setQ] = useState('');
  const [fx] = useState(() => new Map(fixed().map(([b, tag]) => [b.id, tag])));
  const [all] = useState(() => { const on = new Set(holder.loreIds); const w = (b: Lore) => +(on.has(b.id) || fx.has(b.id)); return [...S.lore].sort((a, b) => w(b) - w(a)); });   // 열 때 한 번만: 연결된 것 먼저
  const hit = all.filter(b => !q || `${b.name} ${b.description || ''}`.toLowerCase().includes(q));
  return <div className="col">
    <input className="inp" placeholder="이름 · 설명으로 찾기" onChange={e => setQ(e.target.value.trim().toLowerCase())} />
    <small className="hint">{`${S.lore.length}개 중 ${mine().length}개 연결됨${q ? ` · 찾은 것 ${hit.length}개` : ''}`}</small>
    <div className="lore-picklist">{hit.length ? hit.map(b => <label className="check lore-pickrow" key={b.id}>
      <input type="checkbox" checked={fx.has(b.id) || (holder.loreIds || []).includes(b.id)} disabled={fx.has(b.id)} onChange={() => { toggle(b.id); redraw(); }} /><i />
      <span>{b.name}</span><small>{fx.get(b.id) || `항목 ${b.entries.length}개`}</small></label>) : <p className="dim">찾는 로어북이 없어요.</p>}</div>
  </div>;
}

/** 연결한 로어북만 꼬리표로 보여 주고, 더 고를 때는 찾기 창을 연다 (로어북이 아주 많아도 화면이 길어지지 않게).
 *  fixed(): 여기서 끊을 수 없는 것들 [[로어북, '전역' | '캐릭터'], …] */
export function LoreLinker({ holder, save, fixed = () => [] }: { holder: { loreIds?: string[] }; save: () => void; fixed?: Fixed }) {
  const redraw = useBump(); holder.loreIds ||= [];
  const mine = () => { const fx = new Set(fixed().map(([b]) => b.id)); return (holder.loreIds || []).filter(id => S.get('lore', id) && !fx.has(id)); };
  const toggle = (id: string) => { const ids = holder.loreIds || []; holder.loreIds = ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]; save(); };
  const open = () => {
    if (!S.lore.length) return toast('로어북이 아직 없어요. 로어북 화면에서 먼저 만들어 주세요.');
    openModal({ title: '로어북 고르기', body: <PickList holder={holder} toggle={toggle} fixed={fixed} mine={mine} />, onClose: redraw, actions: [{ label: '닫기', cls: 'primary' }] });
  };
  const fx = fixed(), ids = mine();
  return <div className="lore-linked">
    {fx.length || ids.length ? <div className="lore-chips">
      {fx.map(([b, tag]) => <span className="chip lore-chip fixed" key={b.id} title={`${tag} 로어북이라 여기서는 끊을 수 없어요`}><span>{b.name}</span><small>{tag}</small></span>)}
      {ids.map(id => <span className="chip on lore-chip" key={id}><span>{S.get('lore', id)?.name}</span><button type="button" title="연결 끊기" aria-label="연결 끊기" onClick={() => { toggle(id); redraw(); }}>×</button></span>)}
    </div> : <small className="hint">연결한 로어북이 없어요.</small>}
    <Btn label={ids.length ? '로어북 고르기' : '로어북 연결'} ic="plus" cls="ghost" onClick={open} />
  </div>;
}

/** 로어북 고르기 (페르소나 · 그 밖의 묶을 곳). holder.loreIds 를 고친다 */
export const LorePicker = ({ holder, save, hint = '' }: { holder: { loreIds?: string[] }; save: () => void; hint?: string }) =>
  <div className="card lore-link"><h3 className="form-sec">로어북</h3>{hint && <p className="hint">{hint}</p>}<LoreLinker holder={holder} save={save} /></div>;

type Pred = (e: Entry) => boolean;
const FILTERS: Record<string, Pred> = { all: () => true, on: e => e.enabled !== false, off: e => e.enabled === false, constant: e => !!e.constant, keyed: e => !e.constant, grouped: e => !!e.group, timed: e => !!(e.sticky || e.cooldown || e.delay), filtered: e => !!(e.charFilter?.names?.length || e.charFilter?.tags?.length || e.triggers?.length) };
const SORTS: Record<string, ((a: Entry, c: Entry) => number) | null> = { list: null, order: (a, c) => (c.order ?? 100) - (a.order ?? 100), name: (a, c) => titleOf(a).localeCompare(titleOf(c), 'ko'), tok: (a, c) => tok(c) - tok(a) };
const hay = (e: Entry) => [e.name, ...(e.keys || []), ...(e.keys2 || []), e.group, e.outlet, e.automationId, e.content].join('\n').toLowerCase();
const FILTER_OPTS = [['all', '모든 항목'], ['on', '켜진 항목'], ['off', '꺼진 항목'], ['constant', '상시 발동'], ['keyed', '키워드 발동'], ['grouped', '묶음이 있는 항목'], ['timed', '시간 효과가 있는 항목'], ['filtered', '조건이 걸린 항목']];
const SORT_OPTS = [['list', '목록 순서'], ['order', '우선순위 높은 순'], ['name', '이름순'], ['tok', '토큰 많은 순']];

/** 접었다 펴는 묶음. 처음 열림 여부는 만들 때 한 번만 정한다 (고치는 도중에 저절로 접히지 않게) */
function Sec({ title, on, children }: { title: string; on: boolean; children: ReactNode }) {
  const [open] = useState(on);
  return <details className="lore-sec" open={open}><summary>{title}</summary><div className="lore-sec-body">{children}</div></details>;
}

/** 항목 하나의 펼친 내용 */
function EntryBody({ e, sv, changed, draw }: { e: Entry; sv: () => void; changed: () => void; draw: () => void }) {
  ready(e);
  const redraw = useBump(), pos = useRef(e.position), cf = e.charFilter!, trig = e.triggers!;
  const fix = () => { e.logic = +(e.logic ?? 0) || 0; e.caseSensitive = tri(e.caseSensitive); e.wholeWord = tri(e.wholeWord); e.useGroupScoring = tri(e.useGroupScoring); sv(); };
  const depth = e.position === 'depth', outlet = e.position === 'outlet';
  const main: FormDefs = [
    { k: 'name', label: '제목', half: true }, { k: 'position', label: '삽입 위치', type: 'select', opts: LORE_POS, half: true },
    depth && { k: 'depth', label: '깊이 (끝에서 몇 번째 메시지 앞)', type: 'num', min: 0, half: true }, depth && { k: 'role', label: '역할', type: 'select', opts: ['system', 'user', 'assistant'], half: true },
    outlet && { k: 'outlet', label: '아울렛 이름', ph: '프리셋에서 {{outlet::이름}} 으로 불러옵니다' },
    { k: 'keys', label: '키워드', type: 'tags', ph: '쉼표로 구분 · /정규식/i 가능', half: true }, { k: 'keys2', label: '보조 키워드', type: 'tags', half: true },
    { k: 'logic', label: '보조 키워드 조건 (보조 키워드가 있을 때)', type: 'select', opts: [[0, '하나라도 포함'], [3, '모두 포함'], [2, '하나도 없음'], [1, '전부는 아님']] },
    { k: 'content', label: '내용', type: 'area', rows: 7 },
    { k: 'order', label: '우선순위 (클수록 먼저 · 뒤쪽에 놓임)', type: 'num', third: true }, { k: 'probability', label: '발동 확률 %', type: 'num', min: 0, max: 100, third: true }, { k: 'scanDepth', label: '이 항목만 살필 메시지 수', type: 'num', nullable: true, third: true, ph: '로어북 설정을 따름' },
    { k: 'constant', label: '상시 발동 (키워드 없이 항상)', type: 'check' },
    { k: 'vectorized', label: '벡터로 발동 (키워드가 없어도 뜻이 비슷하면) — 기능 › 벡터 검색을 켰을 때', type: 'check' },
  ];
  return <div className="entry-body">
    {/* 위치가 바뀌면 그 위치에 딸린 칸을 다시 그린다 */}
    <Form key={e.position} obj={e} defs={main} onChange={() => { fix(); const moved = e.position !== pos.current; pos.current = e.position; if (moved) draw(); else changed(); }} />
    <Sec title="발동 조건" on={!!(e.useRegex || e.caseSensitive != null || e.wholeWord != null || trig.length || cf.names!.length || cf.tags!.length || MATCH.some(([k]) => e[k]))}>
      <Form obj={e} defs={[{ k: 'caseSensitive', label: '대소문자 구분', type: 'select', opts: TRI, half: true }, { k: 'wholeWord', label: '단어 단위로만 (영문)', type: 'select', opts: TRI, half: true }, { k: 'useRegex', label: '키워드를 모두 정규식으로 읽기', type: 'check' }]} onChange={fix} />
      <div className="field"><span className="field-label">이 생성 종류에서만 발동</span>
        <div className="lore-chips">{TRIGGERS.map(([v, l]) => <button type="button" key={v} className={'chip' + (e.triggers!.includes(v) ? ' on' : '')} onClick={() => { const t = e.triggers!; e.triggers = t.includes(v) ? t.filter(x => x !== v) : [...t, v]; sv(); redraw(); }}>{l}</button>)}</div>
        <small className="hint">아무것도 고르지 않으면 언제나 발동할 수 있어요.</small></div>
      <div className="field"><span className="field-label">메시지 말고 여기서도 키워드 찾기</span>
        <div className="lore-chips">{MATCH.map(([k, l]) => <button type="button" key={k} className={'chip' + (e[k] ? ' on' : '')} onClick={() => { e[k] = !e[k]; sv(); redraw(); }}>{l}</button>)}</div></div>
      <Form obj={e} defs={[{ k: 'charFilter.names', label: '캐릭터 조건 — 이름', type: 'tags', half: true, ph: '쉼표로 구분 · 비우면 모든 캐릭터' }, { k: 'charFilter.tags', label: '캐릭터 조건 — 태그', type: 'tags', half: true, ph: '쉼표로 구분' }, { k: 'charFilter.exclude', label: '위 캐릭터 · 태그일 때는 발동하지 않기 (반대로)', type: 'check' }]} onChange={fix} />
    </Sec>
    <Sec title="묶음 · 예산" on={!!(e.group || e.ignoreBudget)}>
      <Form obj={e} defs={[{ k: 'group', label: '묶음 이름', half: true, ph: '같은 묶음에서는 하나만 발동 · 쉼표로 여러 묶음' }, { k: 'groupWeight', label: '추첨 가중치', type: 'num', min: 0, half: true },
        { k: 'groupOverride', label: '추첨하지 않고 우선순위가 가장 높은 항목으로 정하기', type: 'check' }, { k: 'useGroupScoring', label: '키워드가 더 많이 걸린 항목 먼저', type: 'select', opts: [['', '전체 설정을 따름'], ['true', '켬'], ['false', '끔']], half: true },
        { k: 'ignoreBudget', label: '토큰 예산이 모자라도 넣기', type: 'check' }]} onChange={fix} />
    </Sec>
    <Sec title="시간 효과 · 연쇄" on={!!(e.sticky || e.cooldown || e.delay || e.noRecurse || e.excludeRecursion || +(e.delayUntilRecursion ?? 0) || e.automationId)}>
      <Form obj={e} defs={[{ k: 'sticky', label: '유지 (메시지 수)', type: 'num', nullable: true, third: true, ph: '없음' }, { k: 'cooldown', label: '쿨다운 (메시지 수)', type: 'num', nullable: true, third: true, ph: '없음' }, { k: 'delay', label: '지연 (대화가 이만큼 쌓인 뒤)', type: 'num', nullable: true, third: true, ph: '없음' },
        { k: 'noRecurse', label: '이 내용으로 다른 항목을 깨우지 않기', type: 'check' }, { k: 'excludeRecursion', label: '다른 항목의 내용으로는 깨어나지 않기', type: 'check' },
        { k: 'delayUntilRecursion', label: '연쇄 단계에서만 깨어나기 (단계 번호)', type: 'num', min: 0, half: true, hint: '0 은 끔. 1 이상이면 메시지로는 깨어나지 않고, 다른 항목이 불려 나온 뒤 그 단계에서만 살핍니다.' },
        { k: 'automationId', label: '자동 실행 이름', half: true, ph: '없음', hint: '이 항목이 발동하면 같은 이름을 가진 빠른 버튼이 실행됩니다.' }]} onChange={fix} />
    </Sec>
  </div>;
}

export function LoreEditor({ b, api }: { b: Lore; api: EditorApi }) {
  b.entries ||= [];
  const { uid, download, newEntry } = core;
  const redraw = useBump(), sv = useDebounced(() => api.save(), 300);
  const st = useRef({ q: '', filter: 'all', sort: 'list', shown: PAGE, pick: false, open: new Set<string>(), picked: new Set<string>(), gen: 0, at: -1, rows: [] as Entry[] }).current;
  /** 목록을 다시 고르고 그린다 (옛 drawEntries). redraw 만 부르면 머리줄 · 집계만 바뀐다 — 고치는 도중에 항목이 자리를 옮기지 않게 */
  const draw = () => { st.gen++; redraw(); };
  const [qText, setQText] = useState('');
  const search = useDebounced((v: string) => { st.q = v; st.shown = PAGE; draw(); }, 180);
  const touch = () => { sv(); api.redraw(); };
  const { open, picked } = st;

  if (st.at !== st.gen) {
    const t = st.q.trim().toLowerCase(), sorter = SORTS[st.sort];
    st.rows = b.entries.filter(e => FILTERS[st.filter](e) && (!t || hay(e).includes(t)));
    if (sorter) st.rows = [...st.rows].sort(sorter);
    st.at = st.gen;
  }
  const rows = st.rows, pg = usePaged(rows, { id: 'loreEntries', perPage: PAGE, sizes: [20, 40, 80, 160], resetKey: `${b.id}|${st.q}|${st.filter}|${st.sort}` }), vis = pg.rows, on = b.entries.filter(e => e.enabled !== false);

  const moveTo = (list: Entry[]) => {
    const others = S.lore.filter(x => x.id !== b.id);
    const m: ModalHandle = openModal({ title: `항목 ${list.length}개를 옮길 로어북`, body: <div className="col">{others.map(o => <button key={o.id} className="picker-row" onClick={async () => {
      o.entries.push(...list); b.entries = b.entries.filter(x => !list.includes(x)); list.forEach(r => picked.delete(r.id));
      await S.save('lore', o, true); await api.save(); m.close(); toast(`"${o.name}"(으)로 옮겼어요`, 'ok'); api.redraw(); draw();
    }}><Icon name="book" size={18} /><div className="picker-text"><b>{o.name}</b><small>{`항목 ${o.entries.length}개`}</small></div></button>)}</div> });
  };
  const entryMenu = (anchor: Element, e: Entry) => menu(anchor, [
    { label: '복제', ic: 'copy', onclick: () => { const c = { ...copy(e), id: uid(), name: (e.name || titleOf(e)) + ' (사본)' }; b.entries.splice(b.entries.indexOf(e) + 1, 0, c); open.add(c.id); touch(); draw(); } },
    { label: '맨 위로', ic: 'up', onclick: () => { b.entries.splice(b.entries.indexOf(e), 1); b.entries.unshift(e); touch(); draw(); } },
    { label: '맨 아래로', ic: 'down', onclick: () => { b.entries.splice(b.entries.indexOf(e), 1); b.entries.push(e); touch(); draw(); } },
    S.lore.length > 1 && { label: '다른 로어북으로 옮기기', ic: 'book', onclick: () => moveTo([e]) },
    '-',
    { label: '항목 삭제', ic: 'trash', danger: true, onclick: () => { b.entries.splice(b.entries.indexOf(e), 1); picked.delete(e.id); touch(); draw(); } },
  ]);

  // 한꺼번에 고치기
  const target = st.pick ? rows.filter(e => picked.has(e.id)) : rows, label = st.pick ? `고른 ${target.length}개` : (rows.length === b.entries.length ? '전체' : `보이는 ${rows.length}개`);
  const setAll = (v: boolean) => { target.forEach(e => { e.enabled = v; }); touch(); draw(); };
  const allOpen = vis.length > 0 && vis.every(e => open.has(e.id));

  const links = loreLinks(b), active = S.settings.activeLore.includes(b.id);
  return <div className="editor lore-editor">
    <header className="editor-head"><h2>{b.name}</h2><div className="row">
      <Btn label="항목 추가" ic="plus" cls="primary" onClick={() => { const e = newEntry(); b.entries.unshift(e); open.add(e.id); st.q = ''; setQText(''); st.filter = 'all'; pg.setPage(0); void api.save(); draw(); api.redraw(); }} />
      <IconBtn ic="play" title="발동 시험" onClick={() => openModal({ title: `발동 시험 · ${b.name}`, wide: true, body: <TestBody b={b} /> })} />
      <IconBtn ic="sliders" title="로어북 전체 설정" onClick={() => loreSettingsDialog()} />
      <IconBtn ic="import" title="실리태번 형식으로 내보내기" onClick={() => download(`${b.name}.json`, JSON.stringify(cards.loreToWorld(b), null, 2))} />
      <IconBtn ic="trash" title="로어북 삭제" onClick={async () => { if (await confirmBox(`"${b.name}" 로어북을 삭제할까요?`, '삭제', true)) { await S.remove('lore', b.id); S.set({ activeLore: S.settings.activeLore.filter(i => i !== b.id) }); api.refresh(); } }} />
    </div></header>
    <div className="lore-power"><LoreSwitch b={b} after={() => { redraw(); api.redraw(); }} /><div><b>이 로어북 켜기</b><small>{active ? '모든 대화에서 쓰이는 중' : links.length ? `꺼짐 · 묶어 둔 곳(${links.join(' · ')})에서만 쓰여요` : '꺼짐 · 어느 대화에서도 쓰이지 않아요'}</small></div></div>
    <Form obj={b} defs={[{ k: 'name', label: '이름', half: true }, { k: 'description', label: '설명', half: true }, { k: 'scanDepth', label: '최근 몇 개 메시지를 살필지', type: 'num', min: 0, half: true }, { k: 'tokenBudget', label: '토큰 예산', type: 'num', half: true },
      { k: 'recursive', label: '연쇄 발동 — 불려 나온 내용에 든 키워드로 다른 항목도 깨우기', type: 'check' }, { k: 'caseSensitive', label: '대소문자 구분 (항목에서 따로 정하지 않았을 때)', type: 'check' }, { k: 'wholeWord', label: '단어 단위로만 (항목에서 따로 정하지 않았을 때)', type: 'check' }]} onChange={sv} />
    <p className="hint">캐릭터 편집 화면에서는 캐릭터에, 페르소나 화면에서는 페르소나에, 대화의 장면 패널에서는 그 대화방에만 묶을 수 있습니다.</p>
    <div className="lore-tools">
      <div className="lore-bar">
        <input className="inp search" placeholder="제목 · 키워드 · 내용 · 묶음에서 찾기" value={qText} onChange={e => { setQText(e.target.value); search(e.target.value); }} />
        <select className="inp" value={st.filter} onChange={e => { st.filter = e.target.value; st.shown = PAGE; draw(); }}>{FILTER_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select className="inp" value={st.sort} onChange={e => { st.sort = e.target.value; st.shown = PAGE; draw(); }}>{SORT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <div className="lore-status"><span className="lore-count">{`항목 ${b.entries.length}개 · 켜짐 ${on.length}개 · ≈${on.reduce((n, e) => n + tok(e), 0).toLocaleString()} 토큰` + (rows.length !== b.entries.length ? ` · 조건에 맞는 항목 ${rows.length}개` : '')}</span></div>
      <div className="lore-bulk">
        <button className={'chip' + (st.pick ? ' on' : '')} title="항목을 골라서 한꺼번에 고칩니다" onClick={() => { st.pick = !st.pick; picked.clear(); draw(); }}>골라서 고치기</button>
        {st.pick ? <button className="chip" onClick={() => { const all = rows.every(e => picked.has(e.id)); rows.forEach(e => all ? picked.delete(e.id) : picked.add(e.id)); draw(); }}>보이는 항목 모두 고르기</button> : null}
        <span className="lore-bulk-label">{label}</span>
        <button className="chip" disabled={!target.length} onClick={() => setAll(true)}>켜기</button><button className="chip" disabled={!target.length} onClick={() => setAll(false)}>끄기</button>
        {st.pick && S.lore.length > 1 ? <button className="chip" disabled={!target.length} onClick={() => { if (target.length) moveTo(target); }}>옮기기</button> : null}
        {st.pick ? <button className="chip danger" disabled={!target.length} onClick={async () => { if (!target.length || !(await confirmBox(`항목 ${target.length}개를 삭제할까요?`, '삭제', true))) return; b.entries = b.entries.filter(e => !target.includes(e)); picked.clear(); touch(); draw(); }}>삭제</button> : null}
        <i className="lore-gap" />
        <button className="chip" onClick={() => { vis.forEach(e => allOpen ? open.delete(e.id) : open.add(e.id)); draw(); }}>{allOpen ? '모두 접기' : '모두 펼치기'}</button>
      </div>
    </div>
    <div className="entries" ref={pg.listRef}>
      {vis.map(e => <div key={e.id} className={'entry' + (open.has(e.id) ? ' open' : '') + (e.enabled !== false ? '' : ' off')}>
        <div className="entry-head" onClick={ev => { if ((ev.target as Element).closest('button,label,input')) return; if (open.has(e.id)) open.delete(e.id); else open.add(e.id); draw(); }}>
          {st.pick ? <label className="check lore-pick"><input type="checkbox" checked={picked.has(e.id)} onChange={ev => { if (ev.target.checked) picked.add(e.id); else picked.delete(e.id); redraw(); }} /><i /></label> : null}
          <label className="switch"><input type="checkbox" checked={e.enabled !== false} onChange={ev => { e.enabled = ev.target.checked; touch(); redraw(); }} /><i /></label>
          <div className="lore-title"><b>{titleOf(e)}</b><small>{e.constant ? '상시 발동' : ((e.keys || []).slice(0, 5).join(', ') || '키워드 없음')}</small></div>
          <div className="lore-tags">{e.constant ? <em className="badge">상시</em> : null}{e.group ? <em className="badge">{e.group}</em> : null}{(e.probability ?? 100) < 100 ? <em className="badge">{`${e.probability}%`}</em> : null}{(e.sticky || e.cooldown || e.delay) ? <em className="badge">시간</em> : null}<em className="badge">{POS_SHORT[e.position || ''] || '설명 앞'}</em></div>
          <span className="tokbadge">{`≈${tok(e)}`}</span>
          <IconBtn ic="more" title="항목 메뉴" cls="tiny" onClick={ev => entryMenu(ev.currentTarget, e)} />
        </div>
        {open.has(e.id) && <EntryBody e={e} sv={sv} changed={redraw} draw={draw} />}
      </div>)}
      {!rows.length ? <p className="dim pad">{b.entries.length ? '조건에 맞는 항목이 없어요.' : '아직 항목이 없어요. "항목 추가"로 첫 설정을 적어 보세요.'}</p> : null}
    </div>
    {pg.pager}
  </div>;
}
