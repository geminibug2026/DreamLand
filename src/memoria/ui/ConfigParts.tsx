// 장기기억 설정 탭의 부품: 아이콘 · 설정 값 읽고 쓰기 · 칸 만들기 · 설정 찾기 · 설정 세트 · 말버릇 찾기 · 막간 분류
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Btn } from '../../kit';
import { confirmBox, openModal, promptBox, toast } from '../../ui';
import type { MemoryUi, Obj } from '../types';
import { BUNDLE_EXCLUDED, deleteBundle, exportBundle, findRepeatedPhrases, parseBundleFile, parsePhraseList, renameBundle, saveBundle } from '../craft';
import { isPauseMessage } from '../scene';
import type { ChatM, Mem, Msg } from '../types';
import { None, chatTitle, cur, ensureCfg, isCur, makeIcons, persistMsgs, saveCfg, type St } from './parts';
import { Memory } from '../../lib/memory';
import { S } from '../../lib/core';
import { chatApi } from '../../chat/actions';
import { route } from '../../lib/router';
import * as memMod from '../../lib/memory';
import * as core from '../../lib/core';

// ════════ 작은 도구 ════════
const IC: Record<string, string> = {
  layers: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5', save: 'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7', repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5', export: 'M12 15V3M8 7l4-4 4 4M5 13v7h14v-7', bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
};
export const { Ico, Ib } = makeIcons(IC);
type Click = (e: MouseEvent<HTMLButtonElement>) => unknown;
/** 아이콘이 앞에 붙은 글자 단추 */
export const Tb = ({ label, name, title, onClick, cls = 'ghost' }: { label: string; name: string; title: string; onClick: Click; cls?: string }) =>
  <button type="button" className={`btn ${cls}`.trim()} title={title} onClick={e => void onClick(e)}><Ico name={name} size={15} /><span>{label}</span></button>;

/** 설정 화면이 더 부르는 Memory 메서드 */
export type MemX = MemoryUi & {
  bundleDefaults?(): Record<string, unknown>;
  applyBundleForChat?(chat?: ChatM | null): unknown;
  hasChatPerspective?(mem: Mem): unknown;
  setPerspectivePreference?(mem: Mem | null, value: string, local: boolean): Promise<unknown>;
  perspective(mem: Mem): string;
  promptDefault?(k: string): string;
  promptOutdated?(): string[];
  resetPrompt?(k: string): void;
  call(chat: ChatM | { charIds: string[] }, system: string, user: string, maxTokens?: number): Promise<unknown>;
  embedCall(texts: string[]): Promise<number[][] | null | undefined>;
  embedMemories(chat: ChatM, mem: Mem, o?: { all?: boolean; onProgress?: (done: number, total: number) => void }): Promise<number>;
  embedQuery(chat: ChatM, msgs: Msg[]): Promise<unknown>;
};
export const M = () => (Memory as unknown as MemX);
export const SX = () => S;

const gp = (o: unknown, p: string) => p.split('.').reduce<unknown>((a, k) => (a as Obj | null | undefined)?.[k], o);
const sp = (o: Obj, p: string, v: unknown) => { const ks = p.split('.'), last = ks.pop()!; ks.reduce<Obj>((a, k) => (a[k] ||= {}) as Obj, o)[last] = v; };

// ════════ 설정 값 ════════
let soon: (() => void) | null = null;
const saveSoon = () => (soon ||= core.debounce(saveCfg, 250))();
/** 설정 경로: 'x' 는 S.settings.memory.x, '@a.b' 는 S.settings.a.b */
const kp = (k: string) => k[0] === '@' ? k.slice(1) : 'memory.' + k;
export const get = (k: string) => gp(S.settings, kp(k));
export const put = (k: string, v: unknown) => sp(S.settings as Obj, kp(k), v);
/**
 * 세트에 담을 수 있는 키의 기본값 — BUNDLE_EXCLUDED 의 이름(customApi · embedApi · prompts · defaultPerspective) 가운데
 * 여기서 이름이 다른 것(embed · prompt · perspective)은 미리 빼고 넘긴다. 사서 연결은 S.settings.helpers 에 있어 처음부터 들지 않는다.
 */
const BUNDLE_SKIP = ['embed', 'prompt', 'perspective'];
export const bundleDefaults = (): Record<string, unknown> => M().bundleDefaults?.() || Object.fromEntries(Object.entries(memMod.MEMORY_DEFAULTS).filter(([k]) => !BUNDLE_SKIP.includes(k) && !BUNDLE_EXCLUDED.includes(k)));
/** 세트를 붙일 대상 — 이 대화의 (첫) 캐릭터 */
export function bundleOwner(chat?: ChatM | null) { const c = S.get('chars', chat?.charIds?.[0]); return c ? { key: `char:${c.id}`, label: `이 캐릭터 (${c.name || ''})` } : { key: '', label: '이 캐릭터' }; }
/** 장부의 모양을 바꾸는 설정 — 얼려 둔 고정 장부를 버리고 다음 답변에 바로 다시 짓게 한다 */
export const reinject = (chat?: ChatM | null) => { try { M().reinjectNow?.(chat as ChatM); } catch (e) { console.warn('[장기기억]', e); } };

/** 요소에 직접 이벤트를 건다 (change 는 입력을 마쳤을 때만 와야 한다) */
function useNative<E extends HTMLElement>(types: string[], fn: (el: E) => void) {
  const ref = useRef<E>(null), f = useRef(fn);
  useEffect(() => { f.current = fn; });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const run = () => f.current(el);
    for (const t of types) el.addEventListener(t, run);
    return () => { for (const t of types) el.removeEventListener(t, run); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}
export { useNative };

// ════════ 칸 만들기 ════════
// 켜고 끄는 줄과 칸에는 .mm-opt, 그것들을 품는 묶음(서술 방식 · 접힌 구역 · 삼갈 표현)에는 .mm-optset — 설정 찾기가 이 표시로 걸러 낸다
export function Tog({ k, label, hint, after }: { k: string; label: string; hint?: ReactNode; after?: (on: boolean) => unknown }) {
  return <label className="check mm-opt"><input type="checkbox" defaultChecked={!!get(k)} onChange={e => { put(k, e.target.checked); saveCfg(); void after?.(e.target.checked); }} /><i /><span className="mm-opt-text"><b>{label}</b>{hint ? <small>{hint}</small> : null}</span></label>;
}
export function Num({ k, label, title, min, max, step, after, cls = 'third', int = true, children }: { k: string; label: string; title: string; min: number; max: number; step: number; after?: () => void; cls?: string; int?: boolean; children?: ReactNode }) {
  const ref = useNative<HTMLInputElement>(['input', 'change'], inp => { const v = Number(inp.value); if (inp.value === '' || !Number.isFinite(v)) return; put(k, Math.max(min, Math.min(max, int ? Math.round(v) : v))); saveSoon(); after?.(); });
  return <label className={`field ${cls} mm-opt`} title={title}><span className="field-label">{label}</span><input className="inp" type="number" min={min} max={max} step={step} defaultValue={String(get(k) ?? '')} ref={ref} />{children}</label>;
}
export function Sel({ k, label, title, opts, after, cls = 'third', extra }: { k: string; label: string; title?: string | null; opts: (readonly [string, string])[]; after?: (v: string) => void; cls?: string; extra?: ReactNode }) {
  const s = <select className="inp" defaultValue={String(get(k) ?? '')} onChange={e => { put(k, e.target.value); saveCfg(); after?.(e.target.value); }}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  return <label className={`field ${cls} mm-opt`} title={title ?? undefined}><span className="field-label">{label}</span>{extra ? <div className="mm-field-inline">{s}{extra}</div> : s}</label>;
}
export function Txt({ k, label, title, ph, after, cls = 'third', max = 300, check }: { k: string; label: string; title?: string | null; ph?: string; after?: (v: string) => void; cls?: string; max?: number; check?: (v: string) => boolean | void }) {
  const ref = useNative<HTMLInputElement>(['change'], inp => { const v = String(inp.value || '').trim().slice(0, max); if (check && check(v) === false) return; put(k, v); saveCfg(); after?.(v); });
  return <label className={`field ${cls} mm-opt`} title={title ?? undefined}><span className="field-label">{label}</span><input className="inp" type="text" defaultValue={String(get(k) ?? '')} placeholder={ph || ''} autoComplete="off" ref={ref} /></label>;
}
export const Grid = ({ children }: { children?: ReactNode }) => <div className="form">{children}</div>;
export const Note = ({ children }: { children?: ReactNode }) => <p className="hint mm-cfg-hint">{children}</p>;

// ════════ 설정 찾기 ════════
/** 검색어에 맞는 설정만 남긴다. 구역 머리말이 맞으면 그 구역은 통째로 보여 준다 */
export function applySearch(root: HTMLElement | null | undefined, raw: unknown) {
  if (!root) return;
  const q = String(raw || '').trim().toLowerCase(), items = [...root.querySelectorAll('.mm-opt, .mm-optset')], secs = [...root.querySelectorAll('.mm-sec')];
  root.classList.toggle('searching', !!q);
  for (const el of [...items, ...secs]) el.classList.remove('mm-hide');
  if (!q) return;
  for (const el of items) {
    if (el.matches('.mm-optset') && el.querySelector('.mm-opt')) continue;   // 묶음 안에 든 항목은 안쪽 항목이 스스로 판정한다
    const hay = `${el.textContent} ${[el, ...el.querySelectorAll('[title]')].map(x => x.getAttribute('title') || '').join(' ')}`.toLowerCase();
    if (!hay.includes(q)) el.classList.add('mm-hide');
  }
  for (const s of secs) {
    if ((s.querySelector('.mm-sec-head')?.textContent || '').toLowerCase().includes(q)) { s.querySelectorAll('.mm-hide').forEach(x => x.classList.remove('mm-hide')); continue; }
    if (![...s.querySelectorAll('.mm-opt')].some(x => !x.classList.contains('mm-hide'))) s.classList.add('mm-hide');
    else s.querySelectorAll('details').forEach(d => { d.open = true; });
  }
}
export const searchInput = (st: St) => st.cfgSearch as HTMLInputElement | undefined;
/** 입력칸은 한 번만 만들어 다시 그릴 때마다 옮겨 붙인다 — 다시 만들면 한글 조합이 끊긴다 */
export function SearchBox({ st }: { st: St }) {
  if (!st.cfgSearch) {
    const inp = document.createElement('input'); st.cfgSearch = inp;
    inp.type = 'search'; inp.placeholder = '설정 찾기 — 예: 숨김, 임베딩, 삼갈 표현'; inp.autocomplete = 'off'; inp.setAttribute('aria-label', '설정 찾기');
    inp.addEventListener('input', () => applySearch(st.cfgRoot as HTMLElement | null, inp.value));
    inp.addEventListener('keydown', e => { if (e.key === 'Escape' && inp.value) { e.stopPropagation(); inp.value = ''; applySearch(st.cfgRoot as HTMLElement | null, ''); } });
  }
  return <label className="mm-search" ref={el => { const inp = searchInput(st); if (el && inp && inp.parentElement !== el) el.append(inp); }}><Ico name="search" size={15} /></label>;
}

// ════════ 설정 세트 — 봇 · 대화마다 다른 설정 ════════
export function BundleBar({ st }: { st: St }) {
  const m = ensureCfg(), active = m.activeBundle || '', open = cur().chat || st.chat;   // 세트는 열려 있는 대화를 따라 갈아 끼워진다
  const where = !active ? '' : open?.memBundle === active ? (open.id === st.chat?.id ? '이 대화에 붙음' : `열려 있는 대화 「${chatTitle(open).slice(0, 24)}」에 붙음`) : `${bundleOwner(open).label}에 붙음`;
  return <div className={active ? 'mm-bundle-bar on' : 'mm-bundle-bar'}><Ico name="layers" size={16} />
    <span>{active ? <><b>{active}</b><small>{`${where} · 지금 바꾸는 설정은 이 세트에 저장됩니다`}</small></> : <><b>기본 설정</b><small>세트를 만들어 봇·대화마다 다른 설정을 쓸 수 있어요</small></>}</span>
    <Btn label="세트" cls="ghost" title="세트 관리" onClick={() => openBundleManager(st)} /></div>;
}
const askName = async (title: string, initial = '') => { const v = await promptBox(title, initial); return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 40) : ''; };
function BundleManager({ st }: { st: St }) {
  const [rev, setRev] = useState(0), chat = st.chat;
  const refreshAll = async () => { try { await M().applyBundleForChat?.(cur().chat || chat); } catch (e) { console.error(e); toast((e as Error).message || String(e), 'err'); } reinject(chat); st.draw(); setRev(x => x + 1); };
  const m = ensureCfg(), names = Object.keys(m.bundles || {}).sort((a, b) => a.localeCompare(b)), own = bundleOwner(chat), useCount = (n: string) => Object.values(m.bundleByOwner || {}).filter(v => v === n).length;
  const pick = (label: string, now: string, off: boolean, onChange: (v: string) => unknown) => <label className="field half"><span className="field-label">{label}</span>
    <select className="inp" disabled={off} defaultValue={now} onChange={e => void onChange(String(e.target.value || ''))}>{[['', '없음'], ...names.map(n => [n, n])].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  const row = (n: string) => <div className="mm-row" key={n}><span className="mm-row-text"><b>{n}</b>{n === m.activeBundle ? <em className="mm-tag on">지금 사용 중</em> : null}{' '}<small>{`캐릭터 ${useCount(n)}곳에 붙음`}</small></span>
    <span className="mm-actions">
      <Ib name="save" title="지금 설정으로 덮어쓰기" onClick={async () => { if (!(await confirmBox(`"${n}" 세트를 지금 설정으로 덮어쓸까요?`, '덮어쓰기'))) return; saveBundle(ensureCfg(), n, bundleDefaults()); saveCfg(); void refreshAll(); }} />
      <Ib name="edit" title="이름 바꾸기" onClick={async () => {
        const to = await askName('새 이름', n); if (!to || to === n) return; if (!renameBundle(ensureCfg(), n, to)) return toast('같은 이름의 세트가 이미 있습니다.', 'err');
        for (const c of S.chats) if (c.memBundle === n) { c.memBundle = to; await SX().save('chats', c, true); }   // 대화에 붙인 것도 새 이름을 따라간다
        saveCfg(); void refreshAll();
      }} />
      <Ib name="export" title="파일로 내보내기" onClick={() => { const text = exportBundle(ensureCfg(), n, bundleDefaults()); if (text) core.download(`memoria-bundle-${n.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.json`, text, 'application/json'); }} />
      <Ib name="trash" title="삭제" cls="del" onClick={async () => { if (!(await confirmBox(`세트 "${n}"을(를) 삭제할까요?`, '삭제', true))) return; deleteBundle(ensureCfg(), n, bundleDefaults()); saveCfg(); void refreshAll(); }} />
    </span></div>;
  // 옛 것처럼 다시 그릴 때마다 안쪽을 통째로 새로 만든다 (고르는 칸이 저장된 값으로 돌아간다)
  return <div className="mm-dlg" key={rev}>
    <p className="hint">{'봇마다 다른 설정을 이름 붙여 저장하고, 대화나 캐릭터에 붙여 두면 그 대화를 열 때 알아서 바뀝니다. 먼저 보는 순서: '}<b>이 대화 → 이 캐릭터 → 기본 설정</b>.</p>
    <div className="form">
      {pick(chat ? `이 대화 (${chatTitle(chat).slice(0, 24)})` : '이 대화', String(chat?.memBundle || ''), !chat, async v => { if (!chat) return; if (v) chat.memBundle = v; else delete chat.memBundle; await SX().save('chats', chat, true); void refreshAll(); })}
      {pick(own.label, m.bundleByOwner?.[own.key] || '', !own.key, v => { if (!own.key) return; const x = ensureCfg(); x.bundleByOwner ||= {}; if (v) x.bundleByOwner[own.key] = v; else delete x.bundleByOwner[own.key]; saveCfg(); void refreshAll(); })}
    </div>
    <div className="mm-rows">{names.length ? names.map(row) : <None text="아직 세트가 없습니다. 설정을 원하는 대로 바꾼 뒤 아래 버튼으로 저장하세요." />}</div>
    <div className="row wrap">
      <Tb label="새 세트" name="plus" title="지금 설정을 새 세트로 저장" cls="" onClick={async () => {
        const name = await askName('새 세트 이름 (예: 시뮬봇, 1인봇)'); if (!name) return; const x = ensureCfg();
        if (x.bundles?.[name] && !(await confirmBox(`"${name}" 세트가 이미 있습니다. 지금 설정으로 덮어쓸까요?`, '덮어쓰기'))) return;
        saveBundle(ensureCfg(), name, bundleDefaults()); saveCfg(); toast(`"${name}" 세트를 저장했습니다. 위에서 대화나 캐릭터에 붙이면 적용됩니다.`, 'ok'); void refreshAll();
      }} />
      <Tb label="가져오기" name="import" title="세트 파일 가져오기" onClick={async () => {
        const [file] = await core.pickFiles({ accept: '.json' }); if (!file) return; const parsed = parseBundleFile(await file.text(), bundleDefaults());
        if (!parsed) return toast('장기기억 설정 세트 파일이 아닙니다.', 'err');
        const x = ensureCfg(); x.bundles ||= {}; let name = parsed.name; for (let n = 2; x.bundles[name]; n++) name = `${parsed.name} (${n})`;
        x.bundles[name] = parsed.values; saveCfg(); toast(`"${name}" 세트를 가져왔습니다.`, 'ok'); void refreshAll();
      }} />
    </div>
    <p className="hint">세트에 들어가지 않는 것: 장기기억 켜기/끄기, 사서에 쓸 연결·임베딩 설정, 프롬프트, 공통 기억·서술 방식. 세트가 적용된 대화에서 설정을 바꾸면 기본 설정이 아니라 그 세트가 바뀝니다.</p>
  </div>;
}
function openBundleManager(st: St) {
  openModal({ title: '설정 세트', wide: true, body: <BundleManager st={st} />, actions: [{ label: '닫기', cls: 'primary' }] });
}

// ════════ 묵은 말투 · 삼갈 표현 ════════
/** 최근 AI 답변 40개에서 여러 답변에 되풀이된 표현을 찾아, 고른 것을 삼갈 표현에 넣는다 */
export function openRepeatFinder(st: St, onDone?: (v: string) => void) {
  const { msgText } = core, { visibleProse } = memMod, msgs = st.msgs || [], replies: string[] = [];
  for (let i = msgs.length - 1; i >= 0 && replies.length < 40; i--) { const m = msgs[i]; if (!m || m.role !== 'assistant' || m.hidden) continue; const text = visibleProse(msgText(m) || ''); if (text.trim()) replies.push(text); }
  if (replies.length < 3) return toast('AI 답변이 3개 이상 쌓인 뒤에 찾을 수 있습니다.');
  const names = [SX().persona(st.chat)?.name, ...(st.chat?.charIds || []).map(id => S.get('chars', id)?.name), ...(st.mem?.cast || []).flatMap(c => [c.name, ...(c.aka || [])])].filter(Boolean);
  const already = new Set(parsePhraseList(ensureCfg().bannedPhrases).map(p => p.toLowerCase()));
  const found = findRepeatedPhrases(replies, { names }).filter(f => !already.has(f.phrase.toLowerCase()));
  if (!found.length) return toast(`최근 답변 ${replies.length}개에서 되풀이된 표현을 찾지 못했습니다.`);
  const boxes: (HTMLInputElement | null)[] = [];
  openModal({
    title: '말버릇 찾기', body: <div className="mm-dlg">
      <p className="hint">{`최근 AI 답변 ${replies.length}개에서 여러 답변에 나온 표현입니다. 체크한 표현을 삼갈 표현에 넣습니다. `}<b>캐릭터 고유의 말투는 체크하지 마세요</b>{' — 남긴 말과 회상에서도 빠집니다.'}</p>
      <div className="mm-rows mm-scrolly">{found.map((f, i) => <label className="check mm-row mm-rep" key={i}><input type="checkbox" ref={el => { boxes[i] = el; }} /><i /><span className="mm-row-text">{f.phrase}</span><small>{`답변 ${f.count}개`}</small></label>)}</div></div>,
    actions: [{ label: '닫기' }, {
      label: '삼갈 표현에 넣기', cls: 'primary', onclick: () => {
        const picked = found.filter((_f, i) => boxes[i]?.checked).map(f => f.phrase); if (!picked.length) return;
        const m = ensureCfg(); m.bannedPhrases = [String(m.bannedPhrases || '').trim(), ...picked].filter(Boolean).join('\n').slice(0, 4000);
        saveCfg(); reinject(st.chat); onDone?.(m.bannedPhrases); toast(`${picked.length}개 표현을 삼갈 표현에 넣었습니다.`, 'ok');
      },
    }],
  });
}

// ════════ 막간 분류 ════════
/** 빠른 답장 · 명령어로 들어온 메시지를 막간/이야기로 직접 고른다 */
export function openSideSorter(st: St) {
  const { chat, mem, msgs } = st; if (!chat || !mem) return toast('열린 대화가 없습니다.');
  const { msgText } = core, { visibleProse } = memMod, Mm = M();
  const isSide = (m: Msg) => Mm.isSideMessage ? Mm.isSideMessage(m) : m.memSide === true, found: { i: number; m: Msg; side: boolean; guess: boolean }[] = [];
  msgs.forEach((m, i) => {
    if (!m) return;
    const slash = m.role === 'system', tagged = typeof m.memSide === 'boolean', pause = m.role === 'user' && isPauseMessage(msgText(m));   // 명령어(/sys 등)로 들어온 서술 · 이미 고른 것 · "롤플을 멈춰라" 지시
    if (!slash && !tagged && !pause) return;
    found.push({ i, m, side: tagged ? !!m.memSide : (pause || isSide(m)), guess: !tagged });
  });
  if (!found.length) return toast('명령어로 들어온 메시지가 없습니다.');
  const jump = (f: { i: number; m: Msg }) => { if (isCur(chat) && route.page === 'chat') chatApi.scrollTo(f.m.id); else toast(`#${f.i + 1} 메시지는 지금 화면에 불러와져 있지 않아요.`); };
  const picks: (HTMLSelectElement | null)[] = [];
  openModal({
    title: '막간 분류', wide: true, body: <div className="mm-dlg">
      <p className="hint">막간은 기억·회상·점검에서 빠집니다. 흐리게 보이는 줄은 아직 고르지 않은 추정입니다.</p>
      <div className="mm-rows mm-scrolly">{found.map((f, i) => <div className={f.guess ? 'mm-row guess' : 'mm-row'} key={i}><button type="button" className="mm-jump" onClick={() => jump(f)}>{`#${f.i + 1}`}</button>
        <span className="mm-row-text"><b>{f.m.name || (f.m.role === 'user' ? '나' : '')}</b>{' '}{(visibleProse(msgText(f.m)) || msgText(f.m)).replace(/\s+/g, ' ').trim().slice(0, 90)}</span>
        <select className="inp auto" defaultValue={f.side ? 'side' : 'story'} ref={el => { picks[i] = el; }}><option value="story">이야기</option><option value="side">막간</option></select></div>)}</div></div>,
    actions: [{ label: '닫기' }, {
      label: '저장', cls: 'primary', onclick: async () => {
        let toSide = 0; const toStory: Msg[] = [];
        found.forEach((f, i) => {
          const m = f.m, side = picks[i]?.value === 'side', was = isSide(m);
          m.memSide = side;
          if (m.role === 'user' || side === was) return;
          if (side) { Mm.dropTurn(mem, m.id); toSide++; }   // 이미 기록된 막간은 그 턴의 기억째로 걷어 낸다
          else if (Mm.cfg().auto && m.role === 'assistant') toStory.push(m);
        });
        await persistMsgs(chat, msgs); Mm.reconcile(mem, msgs); await Mm.save(mem);
        for (const m of toStory) Promise.resolve(Mm.commit(chat, msgs, m)).catch(e => console.warn('[장기기억]', e));   // 기록 지연은 commit 이 스스로 따진다
        reinject(chat); st.draw();
        toast(`분류를 저장했습니다.${toSide ? ` 막간 ${toSide}개를 기억에서 뺐어요.` : ''}${toStory.length ? ` 이야기 ${toStory.length}개를 기록합니다.` : ''}`, 'ok');
      },
    }],
  });
}
