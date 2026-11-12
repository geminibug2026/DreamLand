// 장기기억 화면이 함께 쓰는 작은 부품 · 창 · 상태 꼴 (옛 f-memoria.js 의 「작은 도구」와 도우미 묶음)
import { useReducer, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Form, confirmBox, openModal, type FormDefs, toast } from '../../ui';
import type { Change, LogLine, SceneNow } from '../types';
import type { CastCard, Cfg, ChatM, Mem, MemItem, Msg } from '../types';
import { I } from '../../lib/icons';
import { go, route } from '../../lib/router';
import { Memory } from '../../lib/memory';
import { S } from '../../lib/core';
import { chatApi } from '../../chat/actions';
import { t } from '../../i18n';
import * as memMod from '../../lib/memory';
import * as core from '../../lib/core';

// ════════ 서고 화면의 상태 ════════
/**
 * 서고 한 벌의 상태. 옛 것처럼 그 자리에서 고치고 draw() 를 부른다.
 * draw() 는 지금 탭의 화면을 통째로 새로 만든다 (입력 칸은 처음 값으로 돌아간다). 입력 중인 칸을 살려야 하는 곳은 화면 안의 상태로 그 부분만 다시 그린다.
 */
export interface St {
  chat: ChatM | null; mem: Mem | null; msgs: Msg[]; tab: string;
  q: string; kind: string; vis: string; owner: string; sort: string; only: string;
  log: LogLine[]; draft: string | null; answer: string; question: string; story: unknown;
  close?: () => void; host: HTMLElement | null;
  /** 지금 탭을 통째로 다시 그린다 (머리 · 탭 줄 포함) */
  draw(): void;
  /** 머리(상태 줄)만 다시 그린다 */
  head(): void;
  load(id?: string | null): Promise<void>;
  reload(): Promise<void>;
  [k: string]: unknown;
}
/** 대화와 서고가 열려 있는 상태 (개요 · 기억 · 세계 · 이야기 · 도구 탭) */
export type StOpen = St & { chat: ChatM; mem: Mem };

export const useBump = () => useReducer((x: number) => x + 1, 0)[1];

// ════════ 아이콘 · 단추 ════════
const IC: Record<string, string> = {
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2', pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  place: 'M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1', merge: 'M6 4v16M6 12c6 0 6-6 12-6M15 3l3 3-3 3', mark: 'M7 3h10v18l-5-4-5 4z',
  glass: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9', mask: 'M3 8c3-2 6-2 9 0 3-2 6-2 9 0 0 6-3 9-6 9-1.5 0-2-1-3-1s-1.5 1-3 1c-3 0-6-3-6-9z', bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  warn: 'M12 3l10 18H2zM12 10v5M12 18v.5', shuffle: 'M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3', layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5', snow: 'M12 2v20M3.5 7l17 10M20.5 7l-17 10M9 4l3 3 3-3M9 20l3-3 3 3',
};
type ClickFn = (e: React.MouseEvent<HTMLButtonElement>) => unknown;
/** 아이콘 사전을 주면 그 사전을 먼저 찾는 Ico · Ib 를 만든다 (없는 이름은 공용 아이콘) */
export function makeIcons(dict: Record<string, string>) {
  function Ico({ name, size = 16 }: { name: string; size?: number }) {
    return <svg viewBox="0 0 24 24" width={size} height={size} className="ic"><path d={dict[name] || I[name] || I.sparkle} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  /** 작은 아이콘 단추 (button.ibtn.tiny) */
  function Ib({ name, title, onClick, cls = '' }: { name: string; title: string; onClick?: ClickFn; cls?: string }) {
    return <button type="button" className={('ibtn tiny ' + cls).trim()} title={title} aria-label={title} onClick={e => void onClick?.(e)}><Ico name={name} size={15} /></button>;
  }
  return { Ico, Ib };
}
export const { Ico, Ib } = makeIcons(IC);

// ════════ 작은 도구 ════════
export const safe = (v: unknown) => String(v ?? '').replace(/[^\w-]/g, '') || 'x';
export const pct = (v?: number | null) => `${Math.round((v || 0) * 100)}%`;
export const cur = () => chatApi.current();
export const isCur = (chat?: ChatM | null) => cur().chat?.id === chat?.id;
export const chatTitle = (chat?: ChatM | null) => chat?.name || (chat?.charIds || []).map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || t('memoria.parts.chat');
export const msgsOf = async (chat: ChatM) => isCur(chat) ? cur().msgs : await S.msgs(chat.id);
export const persistMsgs = async (chat: ChatM, msgs: Msg[]) => { if (isCur(chat)) { await chatApi.save(); chatApi.redraw(); } else await S.saveMsgs(chat, msgs); };
export const histOf = (msgs: Msg[]) => { const c = Memory.cfg(), vis = msgs.filter(m => !m.hidden); return (c.trim ? vis.slice(-(c.keepRecent || 20)) : vis.slice(-30)).map(m => ({ role: m.role, content: core.msgText(m) })); };
/** 설정에 아직 없는 키를 기본값으로 채운다 (칸이 빈 값을 보여 주지 않게) */
export function ensureCfg(): Cfg {
  const s = S.settings, m = (s.memory ||= {} as Cfg) as Record<string, unknown>;
  for (const [k, v] of Object.entries(memMod.MEMORY_DEFAULTS)) {
    if (m[k] === undefined) m[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    else if (v && typeof v === 'object' && !Array.isArray(v) && m[k] && typeof m[k] === 'object') { const t = m[k] as Record<string, unknown>; for (const [k2, v2] of Object.entries(v as object)) if (t[k2] === undefined) t[k2] = v2; }
  }
  return m as Cfg;
}
export const saveCfg = () => S.set({ memory: { ...S.settings.memory } as Cfg });
export const turnTag = (_mem: Mem, x: { manual?: boolean; turn?: number | null }) => x.manual || x.turn == null ? t('memoria.parts.manual') : `t${x.turn + 1}`;
export const copyText = (text: string) => navigator.clipboard?.writeText(text).then(() => toast(t('memoria.parts.copied')), () => toast(t('memoria.parts.copyFail'), 'err'));
/** 단추를 잠그고 일을 한다 (끝나면 푼다). 오류는 알림으로 */
export async function busyBtn<T>(b: HTMLButtonElement, fn: () => T | Promise<T>): Promise<T | undefined> {
  if (b.disabled) return; b.disabled = true; b.classList.add('mm-busy');
  try { return await fn(); } catch (e) { const err = e as Error; if (err.name !== 'AbortError') { console.error(e); toast(err.message || String(e), 'err'); } } finally { b.disabled = false; b.classList.remove('mm-busy'); }
}

export function Sec({ title, desc, tools, children }: { title: ReactNode; desc?: ReactNode; tools?: ReactNode; children?: ReactNode }) {
  return <section className="mm-sec"><header className="mm-sec-head"><div><h3>{title}</h3>{desc ? <p>{desc}</p> : null}</div>{tools ? <div className="mm-sec-tools">{tools}</div> : null}</header>{children}</section>;
}
export const None = ({ text }: { text: ReactNode }) => <div className="mm-empty"><i className="mm-star">✦</i><span>{text}</span></div>;
export const Chip = ({ text, cls = '' }: { text: ReactNode; cls?: string }) => <span className={('mm-chip ' + cls).trim()}>{text}</span>;
export const KindBadge = ({ k }: { k?: string }) => <em className={`mm-kind k-${safe(k)}`}>{memMod.KINDS[k || ''] || String(k || '')}</em>;
export const Meter = ({ v, max, cls = '' }: { v: number; max: number; cls?: string }) => <div className={('mm-meter ' + cls).trim()} title={`${Math.round(v)} / ${Math.round(max)}`}><i style={{ width: Math.min(100, max ? v / max * 100 : 0) + '%' }} /></div>;
export const VIS_IC: Record<string, string> = { public: 'globe', private: 'lock', secret: 'mask' };

/** 지금 장면 한 줄 — 장소 · 날짜 · 시간 · 자리에 있는 사람들 · 분위기 */
export function SceneLine({ m, sc = Memory.scene(m) }: { m: Mem; sc?: SceneNow }) {
  if (!sc.any) return null;
  return <div className="mm-scene">{sc.location ? <span title={t('memoria.parts.scene.place')}><Ico name="place" />{sc.location}</span> : null}{sc.date ? <span title={t('memoria.parts.scene.date')}><Ico name="cal" />{sc.date}</span> : null}{sc.time ? <span title={t('memoria.parts.scene.time')}><Ico name="clock" />{sc.time}</span> : null}
    {sc.present ? <span title={t('memoria.parts.scene.present')}><Ico name="users" />{sc.present}</span> : null}{sc.mood ? <span title={t('memoria.parts.scene.mood')}><Ico name="moon" />{sc.mood}</span> : null}</div>;
}
/** 숫자 띠 + 지금 장면 (개요 맨 위) */
export function Stats({ st }: { st: StOpen }) {
  const m = st.mem, failed = m.turns.filter(t => t.failed).length, { fmtDays } = memMod;
  const tile = (n: ReactNode, l: string, cls?: string) => <div className={cls}><b>{String(n)}</b><span>{l}</span></div>;
  return <div className="mm-top"><div className="mm-stats">{tile(m.turns.length, t('memoria.parts.stat.turns'))}{tile(m.memories.length, t('memoria.parts.stat.memories'))}{tile(m.cast.length, t('memoria.parts.stat.cast'))}{tile(m.pledges.filter(p => p.status === 'active').length, t('memoria.parts.stat.pledges'))}{tile(m.chunks.length + m.arcs.length, t('memoria.parts.stat.summaries'))}{tile(m.clockDays >= 1 / 24 ? fmtDays(m.clockDays) : '–', t('memoria.parts.stat.clock'))}{failed ? tile(failed, t('memoria.parts.stat.failed'), 'bad') : null}</div>
    <SceneLine m={m} /></div>;
}
type ArrKey = 'memories' | 'canon' | 'status' | 'pledges' | 'cast' | 'chunks' | 'arcs' | 'items' | 'milestones' | 'dossier' | 'bonds';
/** 줄 지우기 단추: 확인받고 st.mem[arr] 에서 x 를 뺀 뒤 저장하고 다시 그린다 */
export function Del({ st, arr, x, what }: { st: StOpen; arr: ArrKey; x: object; what: string }) {
  return <Ib name="trash" title={t('common.delete')} cls="del" onClick={async () => { if (!(await confirmBox(t('memoria.parts.deleteAsk', { what }), t('common.delete'), true))) return; const list = st.mem[arr] as object[], i = list.indexOf(x); if (i >= 0) list.splice(i, 1); await Memory.save(st.mem); st.draw(); }} />;
}

// ════════ 창 ════════
/** 폼으로 고쳐서 돌려받는 대화상자 (취소하면 null). 돌려받는 것은 obj 의 사본이다 */
export function editBox<T extends object>(title: string, obj: T, defs: FormDefs, { wide = false, okLabel = t('common.save') }: { wide?: boolean; okLabel?: string } = {}): Promise<T | null> {
  return new Promise(res => {
    let done = false; const draft = JSON.parse(JSON.stringify(obj, (k, v) => k === 'av' ? undefined : v)) as T;
    openModal({ title, wide, body: <Form obj={draft} defs={defs} />, onClose: () => { if (!done) res(null); }, actions: [{ label: t('common.cancel') }, { label: okLabel, cls: 'primary', onclick: () => { done = true; res(draft); } }] });
  });
}
/** 무엇이 달라지는지 항목으로 알려 주고 확인받는다 */
export const confirmList = (title: string, lines: string[], okLabel = t('common.ok'), danger = false) => new Promise<boolean>(res => {
  let ok = false;
  openModal({ title, body: <ul className="mm-points">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>, onClose: () => res(ok), actions: [{ label: t('common.cancel') }, { label: okLabel, cls: danger ? 'danger' : 'primary', onclick: () => { ok = true; } }] });
});
export interface Progress { signal: AbortSignal; stopped(): boolean; set(done: number, total: number, label?: string): void; say(t: string): void; close(): void }
export function progressBox(title: string): Progress {
  const ac = new AbortController(); let stopped = false, fin = false, text: HTMLElement | null = null, bar: HTMLElement | null = null;
  const box = openModal({ title, body: <div className="col"><p ref={el => { text = el; }}>{t('memoria.parts.progress.preparing')}</p><div className="mm-meter big"><i ref={el => { bar = el; }} /></div></div>, onClose: () => { if (!fin) { stopped = true; ac.abort(); } }, actions: [{ label: t('memoria.parts.progress.stop') }] });
  return {
    signal: ac.signal, stopped: () => stopped,
    set(done, total, label = '') { if (text) text.textContent = `${label} ${done} / ${total}`.trim(); if (bar) bar.style.width = (total ? done / total * 100 : 0) + '%'; },
    say(s) { if (text) text.textContent = s; }, close() { fin = true; box.close(); },
  };
}
/** 바뀔 내용을 먼저 보여 주고 확인받는다 */
export function review(changes: Change[], title: string, note = t('memoria.parts.review.note')): Promise<boolean> {
  const SHELF_KO: Record<string, string> = { ...memMod.SHELF_LABELS, canon: t('memoria.parts.review.canon'), pledges: t('memoria.parts.review.pledges') };
  return new Promise(res => {
    let ok = false; const n = (ty: string) => changes.filter(c => c.type === ty).length, LB = { added: t('memoria.parts.review.added'), changed: t('memoria.parts.review.changed'), removed: t('memoria.parts.review.removed') };
    openModal({
      title, wide: true, onClose: () => res(ok), actions: [{ label: t('common.cancel') }, { label: t('memoria.parts.review.apply'), cls: 'primary', onclick: () => { ok = true; } }],
      body: <div className="mm-review"><p className="hint">{note}</p><div className="mm-chips"><Chip text={t('memoria.parts.review.addedN', { count: n('added') })} cls="add" /><Chip text={t('memoria.parts.review.changedN', { count: n('changed') })} cls="chg" /><Chip text={t('memoria.parts.review.removedN', { count: n('removed') })} cls="del" /></div>
        <div className="mm-review-list">{changes.map((c, i) => <article key={i} className={`mm-diff ${c.type}`}><header><b>{SHELF_KO[c.shelf] || c.shelf}</b><em className="badge">{LB[c.type]}</em></header>{c.before ? <div className="mm-before">{c.before}</div> : null}{c.after ? <div className="mm-after">{c.after}</div> : null}{c.type === 'changed' && c.impBefore !== c.impAfter ? <small>{t('memoria.parts.review.importance', { before: pct(c.impBefore), after: pct(c.impAfter) })}</small> : null}</article>)}
          {!changes.length ? <p className="dim">{t('memoria.parts.review.noDiff')}</p> : null}</div></div>,
    });
  });
}
/** 기억이 나온 원문(그 답변과 바로 앞 입력)을 보여 준다 */
export function showSource(st: StOpen, m: MemItem) {
  const { msgText } = core, { visibleProse } = memMod;
  const i = st.msgs.findIndex(x => x.id === m.msgId), msg = st.msgs[i] as Msg | undefined, user = msg && [...st.msgs.slice(0, i)].reverse().find(x => x.role === 'user');
  const prose = (x: Msg) => visibleProse(msgText(x)) || msgText(x);
  openModal({
    title: t('memoria.parts.source.title'), wide: true,
    body: <div className="col"><p className="mm-src-sum">{m.summary}</p>
      {msg ? <>{user ? <div className="mm-src"><b>{`#${st.msgs.indexOf(user) + 1} · ${user.name || t('memoria.parts.me')}`}</b><pre>{prose(user)}</pre></div> : null}<div className="mm-src"><b>{`#${i + 1} · ${msg.name || t('memoria.parts.source.reply')}`}</b><pre>{prose(msg)}</pre></div></>
        : <p className="dim">{m.manual || (m.tags || []).includes('carried') ? t('memoria.parts.source.manual') : t('memoria.parts.source.missing')}</p>}</div>,
    actions: [...(msg && isCur(st.chat) ? [{ label: t('memoria.parts.source.inChat'), ic: 'chat', onclick: () => { st.close?.(); if (route.page !== 'chat') go('chat', st.chat.id); setTimeout(() => chatApi.scrollTo(msg.id), 300); } }] : []), { label: t('common.close'), cls: 'primary' }],
  });
}
const nkey = (v: unknown) => String(v || '').toLowerCase().replace(/[\s._\-'"`]+/g, '');
/** 다른 인물 카드나 갈라진 이름을 이 카드로 접는다 */
export async function mergeCast(st: StOpen, keep: CastCard) {
  const mem = st.mem, others = mem.cast.filter(c => c !== keep), M = Memory;
  // 카드는 없는데 상태 보드 · 기억에만 떠도는 표기
  const known = new Set(mem.cast.flatMap(c => [c.name, ...(c.aka || [])]).map(nkey)), stray = [...new Set([...mem.status.map(s => s.entity), ...mem.memories.flatMap(m => m.entities || [])])].filter(n => n && nkey(n) !== 'scene' && !known.has(nkey(n))).slice(0, 40);
  if (!others.length && !stray.length) return toast(t('memoria.parts.merge.none'));
  const d = await editBox(t('memoria.parts.merge.title', { name: keep.name }), { from: others[0] ? 'c:' + others[0].id : 'n:' + stray[0], typed: '' }, [
    { k: 'from', label: t('memoria.parts.merge.from'), type: 'select', opts: [...others.map(c => ['c:' + c.id, t('memoria.parts.merge.card', { name: c.name })] as const), ...stray.map(n => ['n:' + n, t('memoria.parts.merge.stray', { name: n })] as const)] },
    { k: 'typed', label: t('memoria.parts.merge.typed'), ph: t('memoria.parts.merge.typedPh'), hint: t('memoria.parts.merge.typedHint') }], { okLabel: t('memoria.parts.merge.ok') });
  if (!d) return;
  const typed = String(d.typed || '').trim().slice(0, 60), name = typed || (d.from.startsWith('n:') ? d.from.slice(2) : '');
  const src = typed ? others.find(c => nkey(c.name) === nkey(typed) || (c.aka || []).some(a => nkey(a) === nkey(typed))) : mem.cast.find(c => 'c:' + c.id === d.from);
  if (src) { M.mergeCast(mem, keep, src); await M.save(mem); st.draw(); return toast(t('memoria.parts.merge.doneCard', { from: src.name, to: keep.name }), 'ok'); }
  if (!name) return;
  if (!mem.status.some(s => nkey(s.entity) === nkey(name)) && !mem.memories.some(m => (m.entities || []).some(e => nkey(e) === nkey(name)))) return toast(t('memoria.parts.merge.unknown', { name }), 'err');
  keep.aka = [...new Set([...(keep.aka || []), name])].filter(a => a && nkey(a) !== nkey(keep.name)).slice(0, 8);
  const folded = M.foldAliases(mem); await M.save(mem); st.draw();
  toast(t('memoria.parts.merge.doneAlias', { from: name, to: keep.name, states: folded.states, memories: folded.memories }), 'ok');
}
/** 복구 지점을 남기고 고친 뒤 저장 · 다시 그리기 */
export async function withCheckpoint(st: StOpen, label: string, fn: () => unknown) { await Memory.checkpoint(st.mem, label).catch(() => { }); await fn(); await Memory.save(st.mem); st.draw(); }

// ════════ 옛 화면 · 옛 창에 React 올리기 ════════
interface Live { el: HTMLElement; root: Root; seen: boolean; at: number }
let live: Live[] = [];
function sweep() {
  const t = Date.now(), gone: Live[] = [];
  live = live.filter(x => { if (x.el.isConnected) { x.seen = true; return true; } if (x.seen || t - x.at > 60000) { gone.push(x); return false; } return true; });
  if (gone.length) setTimeout(() => { for (const x of gone) x.root.unmount(); });
}
/** 옛 코드가 가져다 붙일 요소에 React 조각을 올린다. 요소가 화면에서 빠지면 다음에 올릴 때 내린다 */
export function mountNode<T extends HTMLElement>(el: T, node: ReactNode): T {
  sweep();
  const root = createRoot(el); flushSync(() => root.render(node));
  live.push({ el, root, seen: el.isConnected, at: Date.now() });
  return el;
}
export const make = (tag: string, cls = '') => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };
