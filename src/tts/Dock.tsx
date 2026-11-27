// ── 읽는 곳 띠: 대화의 메시지를 읽어 주는 동안, 화면 위(대화 머리 아래) 또는 입력창 위에 가는 한 줄 띠를 띄운다 ──
// 자리를 차지하지 않고(떠 있음) 글을 한 줄로 흘려 지금 읽는 낱말이 늘 보이게 옆으로 따라간다.
// 띠를 누르면 멈춤 · 이어 듣기, ‹ › 앞뒤 문장, × 그만 읽기. 위쪽 가장자리에 읽는 사람 이름표.
// (설정: 띠 자리 위/아래 · 메시지 안에서도 읽는 곳 옅게 짚기)
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Avatar, Icon } from '../kit';
import { S } from '../lib/core';
import type { Chat, Msg } from '../lib/types';
import { cur } from '../chat/store';
import { t } from '../i18n';
import { TTS, type Reading, type Take } from './api';
import { cfg } from './config';
import { cleanForSpeech } from './text';
import { norm, type Norm } from './follow';
import { buildScript } from './script';
import type { VoiceMeta } from './marks';
import { ReadAlong, spot, useReading, type SpotMemo } from './ReadAlong';

/** 이 이름의 읽기만 띄운다 (대화 메시지 · 통화 기록 카드의 음성 메시지) */
const MINE = /^(msg|vm):/;
/** 읽기를 시작할 때 받은 글 (중간부터 읽어도 처음 글을 그대로 보여 준다) */
const shown = new Map<string, { text: string; charId?: string | null }>();
const remember = (key: string, text: string, charId?: string | null) => { shown.set(key, { text: cleanForSpeech(text, true), charId }); if (shown.size > 40) shown.delete(shown.keys().next().value!); };

/** 글 하나를 한 목소리로 읽는다: 읽던 것은 멈추고 새로 (queue 면 읽던 것 뒤에 이어서) */
export function readMessage(text: string, o: { key: string; charId?: string | null; queue?: boolean }) {
  remember(o.key, text, o.charId);
  if (!o.queue) TTS.stopAll();
  return TTS.speak(text, { charId: o.charId, key: o.key });
}

/** 대화 화면이 채워 주는 것: 메시지의 화면 글 (정규식 · 표시 필터 · 번역을 거친 것) */
export const readHooks: { shown?: (m: Msg) => string } = {};
/** 메시지 → 대본 (목소리 연기를 켰을 때). 끄면 한 덩어리 */
export function scriptOf(m: Msg, chat: Chat | null, text: string): Take[] {
  const c = cfg(), sw = m.swipes[m.sw] as { voice?: VoiceMeta } | undefined;
  if (!c.act || m.role !== 'assistant') return [{ text, charId: m.charId }];
  const people = (chat?.charIds || [m.charId]).map(id => S.get('chars', id)).filter(Boolean).map(ch => ({ id: ch!.id, name: ch!.name }));
  return buildScript(text, { charId: m.charId, people, mode: chat?.mode === 'talk' && !m.scene ? 'talk' : 'rp', meta: sw?.voice, narrator: c.narrator, extras: c.extras, actions: c.actions, only: c.only });
}
/** 대화 메시지를 읽는다 (목소리 연기). queue: 읽던 것 뒤에 · 다 읽으면 설정에 따라 다음 답변으로 이어서 */
export async function readMsg(m: Msg, o: { chat?: Chat | null; queue?: boolean } = {}): Promise<void> {
  const chat = o.chat ?? cur.chat, text = readHooks.shown?.(m) ?? (m.swipes[m.sw]?.text || ''), key = 'msg:' + m.id;
  remember(key, text, m.charId);
  if (!o.queue) TTS.stopAll();
  const epoch = TTS.epoch?.() ?? 0;
  await TTS.perform!(scriptOf(m, chat, text), { charId: m.charId, key });
  // 이어 읽기: 멈추지 않고 끝까지 읽었으면 같은 방의 다음 답변으로
  if (!cfg().chain || (TTS.epoch?.() ?? 0) !== epoch || cur.chat !== chat || !chat) return;
  const list = cur.msgs, i = list.indexOf(m); if (i < 0) return;
  const next = list.slice(i + 1).find(x => x.role === 'assistant' && !x.hidden && (x.swipes[x.sw]?.text || '').trim());
  if (next) { await new Promise(r => setTimeout(r, 450)); if ((TTS.epoch?.() ?? 0) === epoch && cur.chat === chat && !TTS.reading()) await readMsg(next, { chat, queue: true }); }
}

const visible = (el: Element | null) => { const r = el?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0 ? r : null; };
/** 띠 자리: 위 = 대화 머리(.chat-top) 바로 아래, 아래 = 입력창 바로 위. 그 폭의 가운데, 720px 까지 */
function place(el: HTMLElement, at: 'top' | 'bottom') {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const anchor = at === 'top' ? visible(document.querySelector('.chat-top')) : visible(document.querySelector('.composer'));
  const left = anchor ? anchor.left : 0, width = anchor ? anchor.width : vw;
  el.style.left = `${Math.round(left + width / 2)}px`;
  el.style.width = `${Math.round(Math.max(200, Math.min(720, width - 24, vw - 16)))}px`;
  if (at === 'top') { el.style.top = anchor ? `${Math.round(anchor.bottom + 12)}px` : 'calc(14px + env(safe-area-inset-top, 0px))'; el.style.bottom = ''; }
  else { el.style.bottom = anchor && anchor.top > 80 ? `${Math.round(vh - anchor.top + 12)}px` : 'calc(16px + var(--safe-b, 0px))'; el.style.top = ''; }
}

// ── 메시지 안에서도 읽는 곳 짚기 (설정을 켰을 때만) — 글을 건드리지 않고 CSS 강조(::highlight)로 ──
type Highlights = { set(name: string, h: unknown): void; delete(name: string): boolean };
const highlights = (): Highlights | null => (globalThis.CSS as unknown as { highlights?: Highlights } | undefined)?.highlights ?? null;
const HighlightOf = () => (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
/** root 의 글(textContent) 위치 a~b 를 덮는 범위 */
function rangeIn(root: Element, a: number, b: number): Range | null {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), r = document.createRange(); let pos = 0, started = false;
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    const len = n.data.length;
    if (!started && a < pos + len) { r.setStart(n, Math.max(0, a - pos)); started = true; }
    if (started && b <= pos + len) { r.setEnd(n, Math.max(0, b - pos)); return r; }
    pos += len;
  }
  return null;
}
function useInMessage(r: Reading | null) {
  const memo = useRef<SpotMemo | null>(null), seen = useRef<{ el: Element; text: string; n: Norm } | null>(null);
  const on = !!r && r.key.startsWith('msg:') && cfg().inMsg === true;
  useEffect(() => {
    const H = highlights(), Ctor = HighlightOf(); if (!H || !Ctor) return;
    const clear = () => { H.delete('rd-word'); };
    if (!on || !r) return clear();
    const el = document.querySelector(`article[data-id="${CSS.escape(r.key.slice(4))}"] .msg-body`);
    if (!el) return clear();
    const text = el.textContent || '';
    if (!seen.current || seen.current.el !== el || seen.current.text !== text) seen.current = { el, text, n: norm(text) };
    const { word } = spot(memo, seen.current.n, text, r, 0);
    const rg = word ? rangeIn(el, word.start, word.end) : null;
    if (rg) H.set('rd-word', new Ctor(rg)); else clear();
  }, [on, r]);
  useEffect(() => () => { highlights()?.delete('rd-word'); }, []);
}

function Strip() {
  const r = useReading(), el = useRef<HTMLDivElement>(null), view = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  const mine = !!r && MINE.test(r.key) && cfg().follow !== false, at = cfg().stripAt === 'bottom' ? 'bottom' : 'top';
  useInMessage(r);
  // 다 읽은 뒤에는 잠깐 남겨 두었다가 스르르 사라진다
  const [last, setLast] = useState<{ key: string; charId?: string | null } | null>(null);
  useEffect(() => { if (mine) setLast({ key: r!.key, charId: r!.charId }); else if (last) { const id = setTimeout(() => setLast(null), 450); return () => clearTimeout(id); } }, [mine, r?.key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const key = mine ? r!.key : last?.key || '';
  useEffect(() => {
    const d = el.current; if (!d || !key) return;
    place(d, at);
    const f = () => place(d, at); window.addEventListener('resize', f); window.visualViewport?.addEventListener('resize', f);
    return () => { window.removeEventListener('resize', f); window.visualViewport?.removeEventListener('resize', f); };
  }, [key, at]);
  // 옆으로 따라가기: 짚은 낱말이 띠의 40% 쯤에 오게 글줄을 민다 (멈춘 동안은 낱말이 그대로라 움직이지 않는다)
  const word = mine ? `${r!.job}:${r!.segNo}:${r!.char}` : '';
  useLayoutEffect(() => {
    const v = view.current, tr = track.current; if (!v || !tr) return;
    const m = tr.querySelector<HTMLElement>('mark') || tr.querySelector<HTMLElement>('.rd-s.now'); if (!m) return;
    const W = v.clientWidth, max = Math.max(0, tr.scrollWidth - W);
    const x = Math.max(0, Math.min(max, m.offsetLeft + m.offsetWidth / 2 - W * 0.4));
    tr.style.transform = `translate3d(${-Math.round(x)}px, 0, 0)`;
  }, [word, key]);
  if (!key || document.querySelector('.call-veil')) return null;
  const info = shown.get(key) || (r && r.key === key ? { text: cleanForSpeech(r.src, true), charId: r.charId } : null);
  if (!info) return null;
  // 이름표는 지금 읽는 토막의 사람 (목소리 연기: 조연 이름 · 해설)
  const who = mine && r ? (r.kind === 'narr' && cfg().narrator?.provider ? { name: t('tts.follow.narr') } : r.name ? { name: r.name } : r.charId ? S.get('chars', r.charId) : null) : (info.charId ? S.get('chars', info.charId) : null);
  const ch = who as { name?: string; avatar?: string; id?: string } | null, paused = !!(mine && r!.paused);
  const toggle = () => { if (!mine) return; if (paused) TTS.resume(); else TTS.pause(); };
  const line = info.text.replace(/[\r\n\t]/g, ' ');   // 한 줄로 (글자 수는 그대로라 읽는 자리가 맞는다)
  const label = paused ? t('tts.follow.resume') : t('tts.follow.pause');
  return <div ref={el} className={`rd-strip at-${at}${mine ? ' on' : ' out'}${paused ? ' paused' : ''}`} role="region" aria-label={t('tts.follow.title')}>
    <span className={`rd-strip-tag${r?.kind ? ' k-' + r.kind : ''}`}>{ch && 'id' in ch && ch.id ? <Avatar o={ch as never} cls="xs" /> : <i className="rd-strip-dot" />}{ch?.name ? <b>{ch.name}</b> : null}<small>{!mine ? t('tts.follow.done') : paused ? t('tts.follow.paused') : r?.kind === 'think' ? t('tts.follow.think') : t('tts.follow.reading')}</small></span>
    <div className="rd-strip-line" role="button" tabIndex={0} aria-pressed={paused} aria-label={label} title={t('tts.follow.tip')} onClick={toggle} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
      <i className="rd-rule" aria-hidden />
      <div className="rd-strip-view" ref={view}><div className="rd-strip-track" ref={track}><ReadAlong text={line} k={key} follow={false} /></div></div>
      <i className="rd-rule" aria-hidden />
    </div>
    <span className="rd-strip-ctl">
      <button type="button" title={t('tts.follow.back')} aria-label={t('tts.follow.back')} disabled={!mine} onClick={() => TTS.step(-1)}><Icon name="left" size={15} /></button>
      <button type="button" title={t('tts.follow.next')} aria-label={t('tts.follow.next')} disabled={!mine || !r!.canNext} onClick={() => TTS.step(1)}><Icon name="right" size={15} /></button>
      <button type="button" className="rd-strip-x" title={t('tts.follow.close')} aria-label={t('tts.follow.close')} onClick={() => { TTS.stopAll(); setLast(null); }}><Icon name="x" size={13} /></button>
    </span>
  </div>;
}

let mounted = false;
export function mountDock() {
  if (mounted) return; mounted = true;
  const el = document.createElement('div'); el.id = 'rd-dock-root'; document.body.append(el);
  createRoot(el).render(<Strip />);
}
