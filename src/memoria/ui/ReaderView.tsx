// 장기기억 — 읽는 말로 보기: 서고가 다른 말(영어 등)로 적혀 있을 때 화면 언어로 옮겨 읽는다
// 켜 두면 화면에 보이는 글만 묶어서 가벼운 작업용 연결로 번역하고, 원문 지문 + 언어로 맡아 둔다 (kv 의 memview:<대화 id> 한 줄).
// 보여 주기만 한다 — 서고의 글은 그대로이고, 편집 상자는 언제나 원문을 연다. 실패한 조각은 맡아 두지 않고 원문 그대로 둔다.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { READER_LANGS, needsReading, packBatches, readReply, readerKey, readerSystem, readerUser, replyBudget, trimItems, type ReaderItems, type ReaderRow } from '../reader';
import type { FlowNode } from '../story';
import type { ChatM, Mem } from '../types';
import { Ico, type St } from './parts';
import { Memory } from '../../lib/memory';
import { DB, on as onEvent } from '../../lib/core';
import { confirmBox } from '../../ui';
import { t, getLang } from '../../i18n';

const rowId = (chatId: string) => 'memview:' + chatId;
const WAIT_MS = 350;   // 보이기 시작한 글을 이만큼 모았다가 한 번에 보낸다 (스크롤하는 동안 묶음이 잘게 쪼개지지 않게)

/** 서고 한 벌의 읽기 상태 — 켜짐 · 맡아 둔 번역 · 기다리는 글 · 진행 */
export class Reader {
  on = false; lang = getLang();
  private chat: ChatM | null = null; private mem: Mem | null = null;
  private items: ReaderItems = {}; private ready: Promise<void> = Promise.resolve();
  private queue = new Map<string, string>(); private failed = new Set<string>(); private waiters = new Map<string, ((v: string | null) => void)[]>();
  private timer = 0; private running = false; private ac: AbortController | null = null; private saveTimer = 0; private dirty = false;
  private ver = 0; private subs = new Set<() => void>();
  /** 이번에 켠 뒤로 보낸 요청 수 · 실패한 묶음 수 */
  calls = 0; errors = 0;

  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  version = () => this.ver;
  private bump() { this.ver++; for (const fn of this.subs) fn(); }

  /** 보고 있는 대화가 바뀌면 그 대화의 번역을 읽어 온다 */
  bind(chat: ChatM | null, mem: Mem | null) {
    this.mem = mem; if (chat?.id === this.chat?.id) return;
    this.stop(); void this.flushSave(); this.chat = chat; this.items = {}; this.failed.clear();
    const id = chat?.id; if (!id) return;
    this.ready = (DB.get('kv', rowId(id)) as Promise<ReaderRow | undefined>).then(row => { if (this.chat?.id === id && row?.items && typeof row.items === 'object') { this.items = row.items; this.bump(); } }).catch(e => console.warn('[장기기억] 읽는 말 캐시', e));
  }
  setOn(v: boolean) { this.on = v; this.lang = getLang(); if (!v) this.stop(); else { this.failed.clear(); this.calls = 0; this.errors = 0; } this.bump(); }
  /** 기다리던 것을 버리고 진행 중인 요청을 끊는다 */
  private stop() { clearTimeout(this.timer); this.ac?.abort(); this.ac = null; this.queue.clear(); for (const ws of this.waiters.values()) for (const w of ws) w(null); this.waiters.clear(); }

  needs(text: string) { return this.on && needsReading(text, this.lang); }
  /** 맡아 둔 번역 (없으면 null) */
  get(text: string): string | null { const hit = this.items[readerKey(text, this.lang)]; if (!hit) return null; hit.at = Date.now(); return hit.t; }
  failedFor(text: string) { return this.failed.has(readerKey(text, this.lang)); }
  /** 남은 글 수 · 일하는 중인가 */
  pending() { return this.queue.size; }
  busy() { return this.running || this.queue.size > 0; }

  /** 이 글이 화면에 보였다 — 번역을 청한다. 번역문(실패하면 null)으로 끝나는 약속을 돌려준다 */
  want(text: string): Promise<string | null> {
    if (!this.needs(text)) return Promise.resolve(null);
    const have = this.get(text); if (have != null) return Promise.resolve(have);
    const key = readerKey(text, this.lang); if (this.failed.has(key)) return Promise.resolve(null);
    const p = new Promise<string | null>(res => { const ws = this.waiters.get(key) || []; ws.push(res); this.waiters.set(key, ws); });
    if (!this.queue.has(key)) { this.queue.set(key, text); clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.run(), WAIT_MS); this.bump(); }
    return p;
  }
  private settle(key: string, v: string | null) { for (const w of this.waiters.get(key) || []) w(v); this.waiters.delete(key); }
  private async run() {
    if (this.running || !this.on || !this.chat) return; this.running = true;
    const ac = this.ac = new AbortController(), chat = this.chat, lang = this.lang;
    const names = (this.mem?.cast || []).flatMap(c => [c.name, ...(c.aka || [])]);
    try {
      await this.ready;
      while (this.queue.size && !ac.signal.aborted) {
        // 기다리는 글을 통째로 묶음으로 나누고 맨 앞 묶음 하나만 보낸다 — 그사이 새로 보인 글이 다음 묶음에 함께 들어간다
        const texts = packBatches([...this.queue.values()])[0], keys = texts.map(x => readerKey(x, lang));
        for (const k of keys) this.queue.delete(k);
        let out: (string | null)[] = texts.map(() => null);
        try { this.calls++; this.bump(); out = readReply(await Memory.call(chat, readerSystem(lang), readerUser(texts, names), replyBudget(texts), ac.signal, 'light'), texts); }
        catch (e) { if ((e as Error)?.name === 'AbortError' || ac.signal.aborted) break; console.warn('[장기기억] 읽는 말로 보기', e); }
        if (ac.signal.aborted) break;
        if (out.every(v => v == null)) this.errors++;
        out.forEach((v, i) => { if (v != null) { this.items[keys[i]] = { t: v, at: Date.now() }; this.dirty = true; } else this.failed.add(keys[i]); this.settle(keys[i], v); });
        this.bump(); this.saveSoon();
      }
    } finally { this.running = false; if (this.ac === ac) this.ac = null; this.bump(); }
  }
  private saveSoon() { clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => void this.flushSave(), 900); }
  private async flushSave() {
    clearTimeout(this.saveTimer); const id = this.chat?.id; if (!id || !this.dirty) return; this.dirty = false;
    trimItems(this.items);
    try { await DB.put('kv', { id: rowId(id), v: 1, items: this.items } as ReaderRow); } catch (e) { console.warn('[장기기억] 읽는 말 캐시 저장', e); }
  }
}
// 대화를 지우면 그 대화의 번역도 지운다
onEvent('chat:deleted', (id?: string) => { if (id) void DB.del('kv', rowId(id)).catch(() => { }); });

/** 서고 한 벌(st)의 읽기 상태 — 처음 부를 때 만들고, 보고 있는 대화에 맞춘다 */
export function readerOf(st: St): Reader { const r = (st.reader ||= new Reader()) as Reader; r.bind(st.chat, st.mem); return r; }

const Ctx = createContext<Reader | null>(null);
export const ReaderScope = ({ st, children }: { st: St; children: ReactNode }) => <Ctx.Provider value={readerOf(st)}>{children}</Ctx.Provider>;
const noSub = () => () => { }, zero = () => 0;
/** 지금 화면의 읽기 상태를 따라 다시 그린다 (없으면 null) */
export function useReader(): Reader | null { const r = useContext(Ctx); useSyncExternalStore(r ? r.subscribe : noSub, r ? r.version : zero); return r; }

/**
 * 서고의 글 한 토막. 꺼져 있으면 글자만 낸다 (요소를 더하지 않는다).
 * 켜져 있으면 화면에 보였을 때 번역을 청하고, 오면 바꿔 보여 준다 — 원문은 title 로 남는다.
 */
export function Tr({ children }: { children?: string | null }) {
  const r = useReader(), text = String(children ?? ''), ref = useRef<HTMLSpanElement>(null);
  const live = !!r && r.needs(text), done = live ? r!.get(text) : null, wait = live && done == null && !r!.failedFor(text);
  useEffect(() => {
    const el = ref.current; if (!wait || !el || !r) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); void r.want(text); } }, { rootMargin: '80px 0px' });
    io.observe(el); return () => io.disconnect();
  }, [wait, text, r]);
  if (!live) return <>{text}</>;
  return <span ref={ref} className={`mm-tr${done != null ? ' done' : wait ? ' wait' : ' fail'}`} title={done != null ? text : undefined}>{done ?? text}</span>;
}

/** 창 머리의 토글 — 켤 때 한 번 알리고, 켜진 동안 진행을 적는다 */
export function ReaderToggle({ st }: { st: St }) {
  const r = readerOf(st); useSyncExternalStore(r.subscribe, r.version);
  if (!st.chat) return null;
  const flip = async () => {
    if (!r.on && !st.readerAsked) { if (!(await confirmBox(t('memoria.reader.ask', { lang: t('memoria.reader.lang.' + (READER_LANGS[getLang()] ? getLang() : 'en')) }), t('memoria.reader.askOk')))) return; st.readerAsked = true; }
    r.setOn(!r.on); st.draw();
  };
  const note = !r.on ? '' : r.busy() ? t('memoria.reader.busy', { left: r.pending(), calls: r.calls }) : r.calls ? t('memoria.reader.done', { calls: r.calls }) + (r.errors ? t('memoria.reader.failed', { n: r.errors }) : '') : t('memoria.reader.idle');
  return <span className="mm-rd"><button type="button" className={`btn ghost mm-rd-btn${r.on ? ' on' : ''}`} aria-pressed={r.on} title={t('memoria.reader.title')} onClick={() => void flip()}><Ico name="globe" size={15} /><span>{t('memoria.reader.label')}</span></button>
    {note ? <small className={`mm-rd-note${r.busy() ? ' busy' : ''}`} role="status" aria-live="polite">{note}</small> : null}</span>;
}

/**
 * 이야기 탭의 흐름 카드(HTML 로 그린다)용: 펼쳐져 화면에 보이는 카드의 요약을 번역해 그 카드 안의 글만 갈아 끼운다.
 * 화면을 다시 그리지 않으므로 펼쳐 둔 카드가 접히지 않는다. 끄면 화면이 통째로 다시 그려져 원문으로 돌아간다.
 */
export function useReaderFlow(box: RefObject<HTMLElement | null>, html: string, nodes: FlowNode[], render: (nodes: FlowNode[]) => string) {
  const r = useReader(), on = !!r?.on;
  useLayoutEffect(() => {
    const root = box.current; if (!r || !on || !html || !root) return;
    let live = true; const byId = new Map(nodes.map(n => [n.id, n])), asked = new Set<Element>();
    const swap = async (card: HTMLElement) => {
      const node = byId.get(card.dataset.id || ''); if (!node || asked.has(card) || !(card as HTMLDetailsElement).open) return; asked.add(card);
      const tr = await r.want(node.text); if (!live || tr == null || !card.isConnected) return;
      const tpl = document.createElement('template'); tpl.innerHTML = render([{ ...node, text: tr, open: true }]);
      for (const sel of ['.mm-st-when', '.mm-st-beats', '.mm-st-chips']) { const from = tpl.content.querySelector(sel), to = card.querySelector(sel); if (from && to) to.innerHTML = from.innerHTML; }
      card.classList.add('mm-tr-card');
    };
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) void swap(e.target as HTMLElement); }, { rootMargin: '80px 0px' });
    const cards = [...root.querySelectorAll<HTMLElement>('.mm-st-card')], onToggle = (e: Event) => { const c = e.currentTarget as HTMLElement; io.unobserve(c); io.observe(c); };
    for (const c of cards) { io.observe(c); c.addEventListener('toggle', onToggle); }
    return () => { live = false; io.disconnect(); for (const c of cards) c.removeEventListener('toggle', onToggle); };
  }, [html, on]);   // eslint-disable-line react-hooks/exhaustive-deps
}
