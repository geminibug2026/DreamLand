// 첫걸음 안내: 조용한 제안 카드 · 단계별 스포트라이트(가는 고리와 꺾쇠) · 견본 캐릭터로 바로 해 보기
// 각 걸음은 스스로 화면을 옮기고(go), 짚을 요소가 없으면 가운데 카드로 보인다. 끝나면 settings.onboarded 를 켜고 'tour:done' 을 낸다
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { S, chatConns, emit, newChar, newConn } from '../lib/core';
import { go, route } from '../lib/router';
import { startChat } from '../chat/start';
import { toast } from '../ui';
import { t, useLang } from '../i18n';
import { labels } from './handbook';
import type { TourStep } from './types';

/** 열두 걸음과 맺음. 글은 guide.tour.<id>.t / .b */
export const STEPS: TourStep[] = [
  { id: 'hello', page: 'home', art: 'mark' },
  { id: 'conns', page: 'conns', sel: ['#rail [data-page="conns"]', '.pagebox h1'] },
  { id: 'chars', page: 'home', sel: ['.hm-acts', '.hm-grid-head', '#rail [data-page="home"]'] },
  { id: 'personas', page: 'personas', sel: ['#rail [data-page="personas"]', '.pagebox h1'] },
  { id: 'modes', sel: ['.chat-top .mode-switch'], art: 'modes' },
  { id: 'panel', sel: ['.chat-top .ibtn[title]:last-child'], art: 'panel' },
  { id: 'lore', page: 'lore', sel: ['#rail [data-page="lore"]', '.pagebox h1'] },
  { id: 'presets', page: 'presets', sel: ['#rail [data-page="presets"]', '.pagebox h1'] },
  { id: 'studio', page: 'studio', sel: ['.pagebox > .tabs', '#rail [data-page="studio"]'] },
  { id: 'memory', page: 'studio', click: '.tabs [data-tab="장기기억"]', sel: ['.tabs [data-tab="장기기억"]', '.pagebox > .tabs'] },
  { id: 'backup', page: 'settings', sel: ['[data-gd="data"]', '.pagebox h1'] },
  { id: 'migrate', page: 'import', sel: ['#rail [data-page="import"]', '.pagebox h1'] },
  { id: 'end', page: 'home', art: 'end' },
];

// ── 그림 ── 등불을 든 책갈피(드림랜드의 조수 표식)와, 가운데 카드에 쓰는 작은 도해
/** 표식: 끝이 갈라진 책갈피 끈에 작은 등불이 걸려 있다. lit 이면 불꽃이 숨 쉰다 */
export function Mark({ size = 28, lit = false, draw = false }: { size?: number; lit?: boolean; draw?: boolean }) {
  const d = draw ? 'fx-draw' : undefined;
  return <svg className="fx-art gd-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path className={d} pathLength={1} d="M12 5h15v37l-7.5-6.5L12 42z" />
    <path className="t" d="M15.5 9v23.5M23.5 9v23.5" /><path className="h" d="M12 12.5h15M12 30h15" />
    <path className="t" d="M19.5 16.2l1 2.3 2.3 1-2.3 1-1 2.3-1-2.3-2.3-1 2.3-1z" />
    <path className={d} pathLength={1} style={{ ['--d' as string]: '.25s' }} d="M27 10h6.5q4 0 4 4v2.5" />
    <path d="M34.5 16.5h6M35 18.5l-1.6 9.5h8.2L40 18.5zM32.6 30h9.8" /><path className="t" d="M37.5 30v2.2M35.6 32.2h3.8" />
    <path className={'af' + (lit ? ' fx-twinkle' : '')} style={{ ['--t' as string]: '1.6s' }} d="M37.5 20.6c1.7 1.9 1.9 3.3 0 5c-1.9-1.7-1.7-3.1 0-5z" />
    <circle className="d" cx="37.5" cy="23.5" r="9.2" />
  </svg>;
}
function Art({ kind }: { kind: NonNullable<TourStep['art']> }) {
  if (kind === 'mark' || kind === 'end') return <div className="gd-tart"><Mark size={kind === 'end' ? 64 : 76} draw lit /></div>;
  if (kind === 'modes') return <div className="gd-tart"><svg className="fx-art" viewBox="0 0 228 70" width="228" height="70" aria-hidden="true">
    {/* 세 장: 소설처럼 줄글 · 메신저 말풍선 · 주사위 */}
    <rect x="1" y="3" width="64" height="64" rx="2" /><path className="t" d="M10 16h46M10 24h46M10 32h38M10 44h46M10 52h28" /><path className="h" d="M10 38h46" />
    <rect x="82" y="3" width="64" height="64" rx="2" /><path className="t" d="M90 14h28v10H96l-6 4zM138 34h-26v10h20l6 4zM90 52h20v8H90z" />
    <rect x="163" y="3" width="64" height="64" rx="2" /><path className="fx-draw" pathLength={1} d="M195 15l17 10v20l-17 10-17-10V25z" /><path className="t" d="M178 25l17 10 17-10M195 35v20" /><path className="af" d="M194 22.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0" />
  </svg></div>;
  return <div className="gd-tart"><svg className="fx-art" viewBox="0 0 228 70" width="228" height="70" aria-hidden="true">
    {/* 대화 화면 오른쪽에서 나오는 장면 패널 */}
    <rect x="30" y="3" width="168" height="64" rx="2" /><path className="t" d="M30 13h168" /><path className="h" d="M42 24h70M42 32h84M42 40h60M42 52h76" />
    <path className="fx-draw" pathLength={1} d="M144 13v54" /><path className="t" d="M152 23h36M152 31h30M152 43h36M152 51h22" /><path className="a" d="M186 6.5h6v3.5h-6zM188.6 6.5v3.5" /><path className="d" d="M136 40h-14M126 36l-4 4 4 4" />
  </svg></div>;
}

/** 보이는 첫 요소 (화면 안에 있고 크기가 있는 것) */
function findEl(sels: string[] | undefined): HTMLElement | null {
  for (const s of sels || []) for (const el of document.querySelectorAll<HTMLElement>(s)) { const r = el.getBoundingClientRect(); if (r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden') return el; }
  return null;
}
interface Box { x: number; y: number; w: number; h: number }
/** 고리는 요소보다 조금 크게, 화면 밖으로는 나가지 않게 */
function ring(b: Box, pad: number) { const l = Math.max(3, b.x - pad), t = Math.max(3, b.y - pad), r = Math.min(innerWidth - 3, b.x + b.w + pad), bt = Math.min(innerHeight - 3, b.y + b.h + pad); return { left: l, top: t, width: Math.max(8, r - l), height: Math.max(8, bt - t) }; }

function Tour({ close, from = 0 }: { close: (done: boolean) => void; from?: number }) {
  useLang();
  const [i, setI] = useState(from), [box, setBox] = useState<Box | null>(null), [tick, setTick] = useState(0);
  const step = STEPS[i], last = i === STEPS.length - 1, card = useRef<HTMLDivElement>(null), next = useRef<HTMLButtonElement>(null);
  const move = (d: number) => { const n = i + d; if (n < 0) return; if (n >= STEPS.length) return close(true); setBox(null); setI(n); };

  // 걸음마다: 화면을 옮기고, 요소가 자리 잡을 때까지 몇 번 다시 잰다 (화면이 늦게 그려지는 것을 기다린다)
  useEffect(() => {
    if (step.page && route.page !== step.page) go(step.page, step.arg);
    let n = 0, raf = 0, clicked = false, alive = true;
    const measure = () => {
      if (!alive) return;
      if (step.click && !clicked) { const b = document.querySelector<HTMLElement>(step.click); if (b) { clicked = true; if (!b.classList.contains('on')) b.click(); } }
      const el = findEl(step.sel);
      if (el) { const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center' }); const q = el.getBoundingClientRect(); setBox(b => b && Math.abs(b.x - q.left) < .5 && Math.abs(b.y - q.top) < .5 && Math.abs(b.w - q.width) < .5 && Math.abs(b.h - q.height) < .5 ? b : { x: q.left, y: q.top, w: q.width, h: q.height }); }
      else if (n > 6) setBox(null);
      if (n++ < 45) raf = requestAnimationFrame(measure);
    };
    measure();
    const again = () => { n = 30; cancelAnimationFrame(raf); measure(); setTick(x => x + 1); };
    addEventListener('resize', again); addEventListener('scroll', again, true);
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', again); removeEventListener('scroll', again, true); };
  }, [i]);   // eslint-disable-line
  useEffect(() => { next.current?.focus({ preventScroll: true }); }, [i]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); move(-1); }
    };
    addEventListener('keydown', key, true); return () => removeEventListener('keydown', key, true);
  });

  // 카드 자리: 요소의 오른쪽 → 아래 → 위 → 왼쪽 가운데 들어가는 첫 곳. 좁은 화면에서는 요소가 없는 쪽 가장자리에 붙인다
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const c = card.current; if (!c || !box) return setPos(null);
    const W = innerWidth, H = innerHeight, cw = c.offsetWidth, ch = c.offsetHeight, g = 18, m = 12;
    const fitX = (x: number) => Math.max(m, Math.min(W - cw - m, x)), fitY = (y: number) => Math.max(m, Math.min(H - ch - m, y));
    if (W <= 820) return setPos({ left: fitX((W - cw) / 2), top: box.y + box.h / 2 > H / 2 ? m + 8 : H - ch - m - 70 });
    const cx = box.x + box.w / 2 - cw / 2, cy = box.y + box.h / 2 - ch / 2;
    if (box.x + box.w + g + cw + m <= W) setPos({ left: box.x + box.w + g, top: fitY(Math.max(cy, box.y - 8)) });
    else if (box.y + box.h + g + ch + m <= H) setPos({ left: fitX(cx), top: box.y + box.h + g });
    else if (box.y - g - ch >= m) setPos({ left: fitX(cx), top: box.y - g - ch });
    else setPos({ left: fitX(box.x - g - cw), top: fitY(cy) });
  }, [box, i, tick]);

  const L = labels(), no = String(i + 1).padStart(2, '0'), all = String(STEPS.length).padStart(2, '0'), pad = 6;
  return <div className="gd-tour" role="dialog" aria-modal="true" aria-label={t('guide.tour.name')}>
    {box ? <div className="gd-ring fx-corners" style={ring(box, pad)} /> : <div className="gd-scrim" />}
    <div ref={card} key={i} className={'gd-tcard fx-frame fx-in' + (box ? '' : ' mid')} style={box ? (pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }) : undefined}>
      {step.art && !box ? <Art kind={step.art} /> : null}
      <div className="gd-thead"><span className="fx-lbl acc">{t('guide.tour.eyebrow')}</span><span className="fx-num gd-tno">{no}<i> / {all}</i></span></div>
      <h2 className="fx-title gd-ttitle">{t('guide.tour.' + step.id + '.t', L)}</h2>
      <p className="fx-body gd-tbody">{t('guide.tour.' + step.id + '.b', L)}</p>
      <div className="gd-tpips" aria-hidden="true">{STEPS.map((s, k) => <i key={s.id} className={k === i ? 'on' : k < i ? 'past' : undefined} />)}</div>
      <div className="gd-tfoot">
        {last ? <span /> : <button type="button" className="gd-tskip" onClick={() => close(false)}>{t('guide.tour.skip')}</button>}
        <span className="row">
          {i > 0 ? <button type="button" className="btn ghost" onClick={() => move(-1)}>{t('guide.tour.prev')}</button> : null}
          <button type="button" ref={next} className="btn primary" onClick={() => move(1)}>{last ? t('guide.tour.finish') : t('guide.tour.next')}</button>
        </span>
      </div>
      {i === 0 ? <small className="gd-tkeys fx-lbl kr">{t('guide.tour.keys')}</small> : null}
    </div>
  </div>;
}

let host: HTMLDivElement | null = null;
/** 둘러보기를 연다. 끝까지 보면 'tour:done' */
export function startTour(from = 0) {
  if (host) return; closeOffer();
  host = document.createElement('div'); host.id = 'gd-tour'; document.body.append(host);
  const root = createRoot(host);
  root.render(<Tour from={from} close={done => {
    root.unmount(); host?.remove(); host = null;
    S.set({ onboarded: true }); if (done) { emit('tour:done'); go('home'); }
  }} />);
}

// ── 바로 해 보기 ── 견본 캐릭터 하나와 연습용(에코) 연결로 한 번 주고받아 본다
/** 견본 캐릭터가 이미 있으면 그것을 쓴다 (ext.guideSample 표시로 찾는다) */
export async function tryNow() {
  closeOffer(); S.set({ onboarded: true });
  let ch = S.chars.find(c => c.ext?.guideSample);
  if (!ch) ch = await S.save('chars', newChar({ name: t('guide.sample.name'), description: t('guide.sample.desc'), personality: t('guide.sample.personality'), scenario: t('guide.sample.scenario'), firstMes: t('guide.sample.first'), tags: [t('guide.sample.tag1'), t('guide.sample.tag2')], creator: 'Dreamland', creatorNotes: t('guide.sample.notes'), ext: { guideSample: true } }));
  let mock = false;
  if (!chatConns().length) { const c = await S.save('conns', newConn({ name: t('guide.sample.conn'), provider: 'mock', model: 'echo' })); S.set({ activeConn: c.id }); emit('conns:saved'); mock = true; }
  else if (S.conn()?.provider === 'mock') mock = true;
  await startChat([ch.id]);
  toast(mock ? t('guide.sample.toastMock') : t('guide.sample.toast'), 'ok');
}

// ── 조용한 제안 ── 처음 열었을 때(캐릭터도 연결도 없을 때)만, 화면 구석에 작게
function Offer({ close }: { close: () => void }) {
  useLang();
  const never = () => { S.set({ onboarded: true }); close(); };
  return <aside className="gd-offer fx-frame fx-in" role="complementary" aria-label={t('guide.offer.title')}>
    <button type="button" className="gd-x" aria-label={t('common.close')} title={t('guide.offer.dismiss')} onClick={never}><svg className="fx-art" viewBox="0 0 12 12" width="12" height="12"><path d="M2 2l8 8M10 2l-8 8" /></svg></button>
    <div className="gd-ohead"><Mark size={40} draw lit /><div><span className="fx-lbl acc">{t('guide.tour.eyebrow')}</span><h3 className="fx-serif">{t('guide.offer.title')}</h3></div></div>
    <p className="fx-body">{t('guide.offer.body')}</p>
    <div className="gd-oacts fx-rows">
      <button type="button" onClick={() => startTour()}><b>{t('guide.offer.tour')}</b><small>{t('guide.offer.tourHint', { n: STEPS.length })}</small></button>
      <button type="button" onClick={() => void tryNow()}><b>{t('guide.offer.try')}</b><small>{t('guide.offer.tryHint')}</small></button>
      <button type="button" onClick={() => { never(); go('import'); }}><b>{t('guide.offer.migrate')}</b><small>{t('guide.offer.migrateHint')}</small></button>
    </div>
  </aside>;
}
let offer: { el: HTMLElement; off: () => void } | null = null;
function closeOffer() { offer?.off(); offer?.el.remove(); offer = null; }
/** 처음 온 사람에게만 제안한다 */
export function maybeOffer() {
  if (S.settings.onboarded || S.chars.length || chatConns().length || offer || host) return;
  const el = document.createElement('div'); el.id = 'gd-offer'; document.body.append(el);
  const root = createRoot(el); offer = { el, off: () => root.unmount() };
  root.render(<Offer close={closeOffer} />);
}
