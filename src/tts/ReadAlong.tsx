// ── 따라 읽기 표시: 글을 보여 주고, 지금 읽는 문장 · 낱말을 짚으며 화면을 따라 내린다 ──
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type MouseEvent } from 'react';
import { TTS, type Reading } from './api';
import { locate, norm, sentences, toDisplay, wordAt, type Norm, type Span } from './follow';

/** 지금 읽는 자리 (모든 읽기) */
export const useReading = (): Reading | null => useSyncExternalStore(TTS.watch, TTS.reading);
/** 무엇을 읽는지 · 멈췄는지 · 앞뒤로 옮길 수 있는지만 (낱말이 넘어갈 때는 다시 그리지 않는다) */
export interface ReadingState { key: string; paused: boolean; canNext: boolean; canBack: boolean }
const stateOf = (): string => { const r = TTS.reading(); return r ? JSON.stringify([r.key, r.paused, r.canNext, r.canBack]) : ''; };
export function useReadingState(): ReadingState | null {
  const s = useSyncExternalStore(TTS.watch, stateOf);
  return useMemo(() => { if (!s) return null; const [key, paused, canNext, canBack] = JSON.parse(s) as [string, boolean, boolean, boolean]; return { key, paused, canNext, canBack }; }, [s]);
}
/** 이 이름(key)의 글을 읽을 때만 그 자리, 아니면 null — 다른 글을 읽는 동안에는 다시 그리지 않는다 */
export function useReadingOf(key: string): Reading | null {
  return useSyncExternalStore(TTS.watch, () => { const r = TTS.reading(); return r && key && r.key === key ? r : null; });
}

// ── 화면 따라 내리기: 짚은 낱말이 보이는 곳 가운데쯤에 오게. 사람이 직접 굴리면 잠깐 따라가지 않는다 ──
const hooked = new WeakSet<Element>();
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p), oy = cs.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 2) return p;
    if (cs.position === 'fixed') return null;   // 떠 있는 판(통화 화면 · 읽는 글 띄우기) 밖의 화면은 건드리지 않는다
  }
  return null;
}
/** page = 자막처럼: 짚은 낱말이 상자 밖으로 나가면 그 줄이 맨 윗줄이 되게 줄 단위로 넘긴다 */
export function followMark(mark: HTMLElement, page = false) {
  const box = scroller(mark); if (!box) return;
  if (!hooked.has(box)) {
    hooked.add(box);
    const hold = () => { box.dataset.holdUntil = String(Date.now() + 3500); };
    box.addEventListener('wheel', hold, { passive: true }); box.addEventListener('touchmove', hold, { passive: true });
  }
  if (+(box.dataset.holdUntil || 0) > Date.now()) return;
  const b = box.getBoundingClientRect(), m = mark.getBoundingClientRect();
  if (page) {
    if (m.top >= b.top - 1 && m.bottom <= b.bottom + 1) return;
    const lh = parseFloat(getComputedStyle(box).lineHeight) || m.height, raw = box.scrollTop + (m.top - b.top);
    box.scrollTop = Math.max(0, Math.round(raw / lh) * lh);
    return;
  }
  if (m.top >= b.top + b.height * 0.12 && m.bottom <= b.bottom - b.height * 0.3) return;
  const top = box.scrollTop + (m.top - b.top) - b.height * 0.35;
  if (typeof box.scrollTo === 'function') box.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); else box.scrollTop = top;
}

/** 조각마다 화면 글의 어디인지 기억해 둔 것 (앞 조각이 끝난 뒤에서 찾는다). 읽기(job)가 바뀌면 새로 */
export interface SpotMemo { job: number; len: number; spans: Map<number, Span | null> }
/** 지금 읽는 문장(cur) · 낱말(word)이 화면 글 text 의 어디인지. n = norm(text). from = 찾기 시작할 위치(없으면 읽기가 시작한 자리) */
export function spot(memo: { current: SpotMemo | null }, n: Norm, text: string, r: Reading | null, from0?: number): { cur: Span | null; word: Span | null } {
  let cur: Span | null = null, word: Span | null = null;
  if (!r) return { cur, word };
  if (!memo.current || memo.current.job !== r.job || memo.current.len !== text.length) memo.current = { job: r.job, len: text.length, spans: new Map() };
  const spans = memo.current.spans;
  let sp = spans.get(r.segNo);
  if (sp === undefined) {
    let from = from0 ?? r.at;
    for (const [no, s] of spans) if (no < r.segNo && s && s.end > from) from = s.end;
    sp = locate(n, r.seg, from) ?? (r.segNo === 0 ? locate(n, r.seg, 0) : null);
    spans.set(r.segNo, sp);
  }
  if (sp) { cur = sp; const p = toDisplay(n, sp, r.seg, r.char), w = wordAt(text, p); word = { start: Math.max(sp.start, w.start), end: Math.min(sp.end, w.end) }; if (word.end <= word.start) word = null; }
  return { cur, word };
}

interface Props {
  text: string; k: string; cls?: string;
  /** 문장을 눌렀다 (offset = 그 문장이 시작하는 위치). true 를 돌려주면 누름이 위로 번지지 않는다 */
  onJump?: (offset: number, reading: boolean) => boolean | void;
  /** 짚은 낱말을 따라 화면을 내린다 ('page' = 자막처럼 줄 단위로 넘김) */
  follow?: boolean | 'page';
}
/** 글 한 덩어리. 읽는 중이면: 읽은 곳 · 지금 문장 · 지금 낱말 · 아직 읽지 않은 곳을 달리 보인다 */
export function ReadAlong({ text, k, cls = '', onJump, follow = true }: Props) {
  const r = useReadingOf(k), box = useRef<HTMLSpanElement>(null);
  const n = useMemo(() => norm(text), [text]), sents = useMemo(() => sentences(text), [text]);
  const memo = useRef<SpotMemo | null>(null);
  const { cur, word } = spot(memo, n, text, r);
  useLayoutEffect(() => { if (!follow || !r || r.paused) return; const m = box.current?.querySelector<HTMLElement>('mark'); if (m) followMark(m, follow === 'page'); }, [follow, r, word?.start]);

  const click = (e: MouseEvent, at: number) => { if (onJump?.(at, !!r) === true) e.stopPropagation(); };
  const cuts = [...new Set([0, text.length, ...(cur ? [cur.start, cur.end] : []), ...(word ? [word.start, word.end] : [])])].sort((a, b) => a - b);
  const piece = (a: number, b: number, key: string) => {
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const x = Math.max(a, cuts[i]), y = Math.min(b, cuts[i + 1]); if (y <= x) continue;
      const s = text.slice(x, y);
      if (word && x >= word.start && y <= word.end) out.push(<mark key={key + x}>{s}</mark>);
      else if (cur && x >= cur.end) out.push(<span key={key + x} className="rd-ahead">{s}</span>);
      else if (cur && x < cur.start) out.push(<span key={key + x} className="rd-done">{s}</span>);
      else out.push(s);
    }
    return out;
  };
  const state = r ? (r.paused ? ' is-paused' : ' is-reading') : '';
  return <span ref={box} className={`rd${state}${cls ? ' ' + cls : ''}`}>
    {sents.map((s, i) => {
      const now = !!cur && s.start < cur.end && s.end > cur.start;
      return <span key={i} className={`rd-s${now ? ' now' : ''}${onJump ? ' can-jump' : ''}`} onClick={onJump ? e => click(e, s.start) : undefined}>{piece(s.start, s.end, i + ':')}</span>;
    })}
  </span>;
}
