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
import { t, tn } from '../../i18n';
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
export function bundleOwner(chat?: ChatM | null) { const c = S.get('chars', chat?.charIds?.[0]); return c ? { key: `char:${c.id}`, label: t('memoria.config.bundle.ownerNamed', { name: c.name || '' }) } : { key: '', label: t('memoria.config.bundle.owner') }; }
/** 장부의 모양을 바꾸는 설정 — 얼려 둔 고정 장부를 버리고 다음 답변에 바로 다시 짓게 한다 */
export const reinject = (chat?: ChatM | null) => { try { M().reinjectNow?.(chat as ChatM); } catch (e) { console.warn('[장기기억]', e); } };

/** 요소에 직접 이벤트를 건다 (change 는 입력을 마쳤을 때만 와야 한다) */
function useNative<E extends HTMLElement>(types: string[], fn: (el: E) => void) {
  const ref = useRef<E>(null), f = useRef(fn);
  useEffect(() => { f.current = fn; });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const run = () => f.current(el);
    for (const ty of types) el.addEventListener(ty, run);
    return () => { for (const ty of types) el.removeEventListener(ty, run); };
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
    inp.type = 'search'; inp.autocomplete = 'off';
    inp.addEventListener('input', () => applySearch(st.cfgRoot as HTMLElement | null, inp.value));
    inp.addEventListener('keydown', e => { if (e.key === 'Escape' && inp.value) { e.stopPropagation(); inp.value = ''; applySearch(st.cfgRoot as HTMLElement | null, ''); } });
  }
  { const inp = searchInput(st); if (inp) { inp.placeholder = t('memoria.config.search.ph'); inp.setAttribute('aria-label', t('memoria.config.search.aria')); } }   // 언어를 바꾸면 다시 그릴 때 새 글자로
  return <label className="mm-search" ref={el => { const inp = searchInput(st); if (el && inp && inp.parentElement !== el) el.append(inp); }}><Ico name="search" size={15} /></label>;
}

// ════════ 설정 세트 — 봇 · 대화마다 다른 설정 ════════
export function BundleBar({ st }: { st: St }) {
  const m = ensureCfg(), active = m.activeBundle || '', open = cur().chat || st.chat;   // 세트는 열려 있는 대화를 따라 갈아 끼워진다
  const where = !active ? '' : open?.memBundle === active ? (open.id === st.chat?.id ? t('memoria.config.bundle.onThisChat') : t('memoria.config.bundle.onOpenChat', { name: chatTitle(open).slice(0, 24) })) : t('memoria.config.bundle.onOwner', { owner: bundleOwner(open).label });
  return <div className={active ? 'mm-bundle-bar on' : 'mm-bundle-bar'}><Ico name="layers" size={16} />
    <span>{active ? <><b>{active}</b><small>{t('memoria.config.bundle.activeHint', { where })}</small></> : <><b>{t('memoria.config.bundle.defaultName')}</b><small>{t('memoria.config.bundle.defaultHint')}</small></>}</span>
    <Btn label={t('memoria.config.bundle.btn')} cls="ghost" title={t('memoria.config.bundle.btnTitle')} onClick={() => openBundleManager(st)} /></div>;
}
const askName = async (title: string, initial = '') => { const v = await promptBox(title, initial); return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 40) : ''; };
function BundleManager({ st }: { st: St }) {
  const [rev, setRev] = useState(0), chat = st.chat;
  const refreshAll = async () => { try { await M().applyBundleForChat?.(cur().chat || chat); } catch (e) { console.error(e); toast((e as Error).message || String(e), 'err'); } reinject(chat); st.draw(); setRev(x => x + 1); };
  const m = ensureCfg(), names = Object.keys(m.bundles || {}).sort((a, b) => a.localeCompare(b)), own = bundleOwner(chat), useCount = (n: string) => Object.values(m.bundleByOwner || {}).filter(v => v === n).length;
  const pick = (label: string, now: string, off: boolean, onChange: (v: string) => unknown) => <label className="field half"><span className="field-label">{label}</span>
    <select className="inp" disabled={off} defaultValue={now} onChange={e => void onChange(String(e.target.value || ''))}>{[['', t('common.none')], ...names.map(n => [n, n])].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  const row = (n: string) => <div className="mm-row" key={n}><span className="mm-row-text"><b>{n}</b>{n === m.activeBundle ? <em className="mm-tag on">{t('memoria.config.bundle.inUse')}</em> : null}{' '}<small>{tn('memoria.config.bundle.useCount', useCount(n))}</small></span>
    <span className="mm-actions">
      <Ib name="save" title={t('memoria.config.bundle.overwriteTitle')} onClick={async () => { if (!(await confirmBox(t('memoria.config.bundle.overwriteAsk', { name: n }), t('memoria.config.bundle.overwrite')))) return; saveBundle(ensureCfg(), n, bundleDefaults()); saveCfg(); void refreshAll(); }} />
      <Ib name="edit" title={t('common.rename')} onClick={async () => {
        const to = await askName(t('memoria.config.bundle.newName'), n); if (!to || to === n) return; if (!renameBundle(ensureCfg(), n, to)) return toast(t('memoria.config.bundle.dupName'), 'err');
        for (const c of S.chats) if (c.memBundle === n) { c.memBundle = to; await SX().save('chats', c, true); }   // 대화에 붙인 것도 새 이름을 따라간다
        saveCfg(); void refreshAll();
      }} />
      <Ib name="export" title={t('memoria.config.bundle.exportTitle')} onClick={() => { const text = exportBundle(ensureCfg(), n, bundleDefaults()); if (text) core.download(`memoria-bundle-${n.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.json`, text, 'application/json'); }} />
      <Ib name="trash" title={t('common.delete')} cls="del" onClick={async () => { if (!(await confirmBox(t('memoria.config.bundle.deleteAsk', { name: n }), t('common.delete'), true))) return; deleteBundle(ensureCfg(), n, bundleDefaults()); saveCfg(); void refreshAll(); }} />
    </span></div>;
  // 옛 것처럼 다시 그릴 때마다 안쪽을 통째로 새로 만든다 (고르는 칸이 저장된 값으로 돌아간다)
  return <div className="mm-dlg" key={rev}>
    <p className="hint">{t('memoria.config.bundle.introBefore')}<b>{t('memoria.config.bundle.introBold')}</b>{t('memoria.config.bundle.introAfter')}</p>
    <div className="form">
      {pick(chat ? t('memoria.config.bundle.thisChatNamed', { name: chatTitle(chat).slice(0, 24) }) : t('memoria.config.bundle.thisChat'), String(chat?.memBundle || ''), !chat, async v => { if (!chat) return; if (v) chat.memBundle = v; else delete chat.memBundle; await SX().save('chats', chat, true); void refreshAll(); })}
      {pick(own.label, m.bundleByOwner?.[own.key] || '', !own.key, v => { if (!own.key) return; const x = ensureCfg(); x.bundleByOwner ||= {}; if (v) x.bundleByOwner[own.key] = v; else delete x.bundleByOwner[own.key]; saveCfg(); void refreshAll(); })}
    </div>
    <div className="mm-rows">{names.length ? names.map(row) : <None text={t('memoria.config.bundle.empty')} />}</div>
    <div className="row wrap">
      <Tb label={t('memoria.config.bundle.new')} name="plus" title={t('memoria.config.bundle.newTitle')} cls="" onClick={async () => {
        const name = await askName(t('memoria.config.bundle.newAsk')); if (!name) return; const x = ensureCfg();
        if (x.bundles?.[name] && !(await confirmBox(t('memoria.config.bundle.existsAsk', { name }), t('memoria.config.bundle.overwrite')))) return;
        saveBundle(ensureCfg(), name, bundleDefaults()); saveCfg(); toast(t('memoria.config.bundle.saved', { name }), 'ok'); void refreshAll();
      }} />
      <Tb label={t('common.import')} name="import" title={t('memoria.config.bundle.importTitle')} onClick={async () => {
        const [file] = await core.pickFiles({ accept: '.json' }); if (!file) return; const parsed = parseBundleFile(await file.text(), bundleDefaults());
        if (!parsed) return toast(t('memoria.config.bundle.notBundle'), 'err');
        const x = ensureCfg(); x.bundles ||= {}; let name = parsed.name; for (let n = 2; x.bundles[name]; n++) name = `${parsed.name} (${n})`;
        x.bundles[name] = parsed.values; saveCfg(); toast(t('memoria.config.bundle.imported', { name }), 'ok'); void refreshAll();
      }} />
    </div>
    <p className="hint">{t('memoria.config.bundle.excluded')}</p>
  </div>;
}
function openBundleManager(st: St) {
  openModal({ title: t('memoria.config.bundle.manager'), wide: true, body: <BundleManager st={st} />, actions: [{ label: t('common.close'), cls: 'primary' }] });
}

// ════════ 묵은 말투 · 삼갈 표현 ════════
/** 최근 AI 답변 40개에서 여러 답변에 되풀이된 표현을 찾아, 고른 것을 삼갈 표현에 넣는다 */
export function openRepeatFinder(st: St, onDone?: (v: string) => void) {
  const { msgText } = core, { visibleProse } = memMod, msgs = st.msgs || [], replies: string[] = [];
  for (let i = msgs.length - 1; i >= 0 && replies.length < 40; i--) { const m = msgs[i]; if (!m || m.role !== 'assistant' || m.hidden) continue; const text = visibleProse(msgText(m) || ''); if (text.trim()) replies.push(text); }
  if (replies.length < 3) return toast(t('memoria.config.repeat.tooFew'));
  const names = [SX().persona(st.chat)?.name, ...(st.chat?.charIds || []).map(id => S.get('chars', id)?.name), ...(st.mem?.cast || []).flatMap(c => [c.name, ...(c.aka || [])])].filter(Boolean);
  const already = new Set(parsePhraseList(ensureCfg().bannedPhrases).map(p => p.toLowerCase()));
  const found = findRepeatedPhrases(replies, { names }).filter(f => !already.has(f.phrase.toLowerCase()));
  if (!found.length) return toast(t('memoria.config.repeat.none', { count: replies.length }));
  const boxes: (HTMLInputElement | null)[] = [];
  openModal({
    title: t('memoria.config.repeat.title'), body: <div className="mm-dlg">
      <p className="hint">{t('memoria.config.repeat.introBefore', { count: replies.length })}<b>{t('memoria.config.repeat.introBold')}</b>{t('memoria.config.repeat.introAfter')}</p>
      <div className="mm-rows mm-scrolly">{found.map((f, i) => <label className="check mm-row mm-rep" key={i}><input type="checkbox" ref={el => { boxes[i] = el; }} /><i /><span className="mm-row-text">{f.phrase}</span><small>{tn('memoria.config.repeat.count', f.count)}</small></label>)}</div></div>,
    actions: [{ label: t('common.close') }, {
      label: t('memoria.config.repeat.add'), cls: 'primary', onclick: () => {
        const picked = found.filter((_f, i) => boxes[i]?.checked).map(f => f.phrase); if (!picked.length) return;
        const m = ensureCfg(); m.bannedPhrases = [String(m.bannedPhrases || '').trim(), ...picked].filter(Boolean).join('\n').slice(0, 4000);
        saveCfg(); reinject(st.chat); onDone?.(m.bannedPhrases); toast(t('memoria.config.repeat.added', { count: picked.length }), 'ok');
      },
    }],
  });
}

// ════════ 막간 분류 ════════
/** 빠른 답장 · 명령어로 들어온 메시지를 막간/이야기로 직접 고른다 */
export function openSideSorter(st: St) {
  const { chat, mem, msgs } = st; if (!chat || !mem) return toast(t('memoria.config.noChat'));
  const { msgText } = core, { visibleProse } = memMod, Mm = M();
  const isSide = (m: Msg) => Mm.isSideMessage ? Mm.isSideMessage(m) : m.memSide === true, found: { i: number; m: Msg; side: boolean; guess: boolean }[] = [];
  msgs.forEach((m, i) => {
    if (!m) return;
    const slash = m.role === 'system', tagged = typeof m.memSide === 'boolean', pause = m.role === 'user' && isPauseMessage(msgText(m));   // 명령어(/sys 등)로 들어온 서술 · 이미 고른 것 · "롤플을 멈춰라" 지시
    if (!slash && !tagged && !pause) return;
    found.push({ i, m, side: tagged ? !!m.memSide : (pause || isSide(m)), guess: !tagged });
  });
  if (!found.length) return toast(t('memoria.config.sorter.none'));
  const jump = (f: { i: number; m: Msg }) => { if (isCur(chat) && route.page === 'chat') chatApi.scrollTo(f.m.id); else toast(t('memoria.parts.notLoaded', { n: f.i + 1 })); };
  const picks: (HTMLSelectElement | null)[] = [];
  openModal({
    title: t('memoria.config.sorter.title'), wide: true, body: <div className="mm-dlg">
      <p className="hint">{t('memoria.config.sorter.intro')}</p>
      <div className="mm-rows mm-scrolly">{found.map((f, i) => <div className={f.guess ? 'mm-row guess' : 'mm-row'} key={i}><button type="button" className="mm-jump" onClick={() => jump(f)}>{`#${f.i + 1}`}</button>
        <span className="mm-row-text"><b>{f.m.name || (f.m.role === 'user' ? t('memoria.parts.me') : '')}</b>{' '}{(visibleProse(msgText(f.m)) || msgText(f.m)).replace(/\s+/g, ' ').trim().slice(0, 90)}</span>
        <select className="inp auto" defaultValue={f.side ? 'side' : 'story'} ref={el => { picks[i] = el; }}><option value="story">{t('memoria.config.sorter.story')}</option><option value="side">{t('memoria.config.sorter.side')}</option></select></div>)}</div></div>,
    actions: [{ label: t('common.close') }, {
      label: t('common.save'), cls: 'primary', onclick: async () => {
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
        toast(t('memoria.config.sorter.saved') + (toSide ? t('memoria.config.sorter.savedSide', { count: toSide }) : '') + (toStory.length ? t('memoria.config.sorter.savedStory', { count: toStory.length }) : ''), 'ok');
      },
    }],
  });
}
