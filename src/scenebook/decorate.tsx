// ════════ 메시지 아래 삽화 꾸미기 ════════ 대화 화면(옛 chat.js)이 그린 삽화 칸에 액자 · 버전 · 도구를 올리고, 답변 아래에 진행 · 초안 · 알림을 붙인다
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Icon } from '../kit';
import { Btn, IBtn, make, mountNode, sweep, useBump } from './parts';
import { frameLayout } from './frames';
import { FrameArt } from './frameArt';
import { Chevron } from './glyph';
import { sceneLabel } from './tagrules';
import { placementOf } from './comic';
import { placeAt } from './place';
import { compose, draw, quickDraw, regen } from './work';
import { figRefresh, quickEdit, saveSoon, slotMenu, slotViewer } from './slot';
import { showPlans } from './dialogs';
import type { Job, Msg, PlanRecord, Scene, Slot, Swipe } from './types';

import { confirmBox, menu } from '../ui';
import { chatApi } from '../chat/actions';
import { cur, flat, guard, shownTitle } from './util';
import { Illust } from './illust';
import { IllustPic } from '../chat/IllustPic';
import { t, tn } from '../i18n';
import { onFrame } from '../lib/frame';
import { on } from '../lib/core';

/** 삽화 한 장: 액자 + 그림 + 그림 위 도구 + 아래 제목 줄. 대화 화면의 figure.illust 안에 들어간다 */
export function Figure({ fig, m, sw, it }: { fig: HTMLElement; m: Msg; sw: Swipe; it: Slot }) {
  const bump = useBump(), img = useRef<HTMLImageElement>(null), c = Illust.cfg(), v = it.versions[it.sel];
  // 액자: 그림 비율에 맞춰 그리므로 버전을 넘기면 다시 씌운다. 웹툰 컷은 액자 없이 이어 보인다
  const lay = frameLayout(v?.config?.width || img.current?.naturalWidth || 832, v?.config?.height || img.current?.naturalHeight || 1216, it.cut ? { ...c, frame: 'none', frameWide: '' } : c);
  useLayoutEffect(() => { fig.dataset.frame = lay.frame; fig.classList.toggle('sb-cut', !!it.cut); });
  // 큰 그림에서 버전을 넘기면 이 칸도 따라 바뀐다
  useEffect(() => { const k = it.slotId, set = figRefresh.get(k) || new Set(); set.add(bump); figRefresh.set(k, set); return () => { set.delete(bump); if (!set.size) figRefresh.delete(k); }; }, [it.slotId, bump]);
  // 같은 자리에 다시 그린 그림이 붙으면(수정 · 재생성) 이 칸도 새 버전으로 바꾼다 — 대화 화면은 같은 칸을 그대로 두기 때문
  const seen = useRef(it.versions.length);
  useEffect(() => on('illust:jobs', () => { if (it.versions.length !== seen.current) { seen.current = it.versions.length; bump(); } }), [it, bump]);
  // 터치: 처음엔 그림만. 한 번 누르면 도구가 보이고, 그동안 한 번 더 누르면 크게 본다. 다른 곳을 누르거나 5초 지나면 숨는다 (마우스는 올리면 보인다 · 설정에서 항상 보이기)
  const hide = useRef<(() => void) | null>(null), ptr = useRef('');
  const reveal = () => {
    hide.current?.();
    const outside = (e: PointerEvent) => { if (!fig.contains(e.target as Node)) off(); };
    const off = () => { clearTimeout(timer); document.removeEventListener('pointerdown', outside, true); fig.classList.remove('sb-tools-on'); hide.current = null; };
    const timer = window.setTimeout(off, 5000); document.addEventListener('pointerdown', outside, true); fig.classList.add('sb-tools-on'); hide.current = off;
  };
  useEffect(() => () => hide.current?.(), []);
  const tap = () => {
    const touch = ptr.current ? ptr.current !== 'mouse' : matchMedia('(hover: none)').matches; ptr.current = '';
    if (Illust.cfg().imageTools !== 'always' && touch && !fig.classList.contains('sb-tools-on')) { reveal(); return; }
    hide.current?.(); slotViewer(m, sw, it);
  };
  const tool = (f: () => unknown) => guard(() => { hide.current?.(); return f(); });
  // ‹ 2/4 › 는 바로 바뀌고, 저장은 넘기기를 멈춘 뒤 한 번
  const step = (d: number) => { Illust.select(it, it.sel + d); bump(); saveSoon(); };
  return <>
    <div className="sb-frame" style={lay.wrapStyle}>
      <div className="sb-pic" style={lay.picStyle} onPointerDown={e => { ptr.current = e.pointerType; }}><IllustPic imgRef={img} id={it.id} w={v?.config?.width || 832} h={v?.config?.height || 1216} alt={sceneLabel(it) || t('scenebook.illust')} onClick={e => { e.stopPropagation(); e.preventDefault(); tap(); }} /></div>
      <FrameArt lay={lay} />
      <div className="sb-fig-actions" aria-label={t('scenebook.fig.tools')}><IBtn ic="edit" title={t('scenebook.fig.editRegen')} cls="tiny" onClick={tool(() => quickEdit(m, it))} /><IBtn ic="refresh" title={t('scenebook.fig.newSeed')} cls="tiny" onClick={tool(() => regen(m, it, -1))} /></div>
    </div>
    <figcaption><span className="sb-fig-title">{shownTitle(it.title)}</span>
      {it.versions.length > 1 ? <div className="sb-ver" role="group" aria-label={t('scenebook.fig.versions')}><button type="button" title={t('scenebook.fig.prev')} aria-label={t('scenebook.fig.prev')} onClick={() => step(-1)}><Chevron side="left" /></button><span className="sb-ver-count">{`${it.sel + 1}/${it.versions.length}`}</span><button type="button" title={t('scenebook.fig.next')} aria-label={t('scenebook.fig.next')} onClick={() => step(1)}><Chevron side="right" /></button></div> : null}
      <IBtn ic="more" title={t('scenebook.more')} cls="tiny" onClick={e => menu(e.currentTarget, slotMenu(m, sw, it))} /></figcaption>
  </>;
}

/** 삽화 한 장이 차지하는 너비 — 그리는 중인 자리도 같은 너비로 잡아, 다 그려졌을 때 화면이 밀리지 않게 한다 */
const figWidth = (c: { compact?: boolean; displayWidth?: number }) => c.compact ? Math.min(360, c.displayWidth || 400) : (c.displayWidth || 400);
/** 답변 아래 덧붙이는 것: 그리는 중 · 실패 · 준비된 초안 · 숨긴 삽화 · 지시 없음 */
function Extras({ m, sw, pending, failed, drafts, hidden, note, planning }: { m: Msg; sw: Swipe; pending: Job[]; failed: Job[]; drafts: Scene[]; hidden: number; note: PlanRecord | null; planning: boolean }) {
  const cfg = Illust.cfg();
  return <>
    {/* 장면을 고르는 중: 그릴 차례에 들어가기 전부터 같은 모양의 자리를 둔다 (다른 보조 작업이 먼저 돌아도 삽화가 오고 있음을 알게) */}
    {planning && !pending.length ? <div className="sb-pendings"><div className="sb-pending planning" style={{ aspectRatio: `${cfg.width || 832} / ${cfg.height || 1216}`, maxWidth: `min(100%, ${figWidth(cfg)}px)` }}><Icon name="image" size={22} /><b>{t('scenebook.fig.planning')}</b><span>{t('scenebook.fig.planningHint')}</span></div></div> : null}
    {pending.length ? <div className="sb-pendings">{pending.map(j => <div key={j.id} className={`sb-pending ${j.state}`} style={{ aspectRatio: `${j.config.width} / ${j.config.height}`, maxWidth: `min(100%, ${figWidth(cfg)}px)` }}><Icon name="image" size={22} /><b>{j.state === 'running' ? t('scenebook.job.running') : t('scenebook.fig.waitingTurn')}</b>{j.label ? <span>{j.label}</span> : null}</div>)}</div> : null}
    {failed.map(j => <div key={j.id} className="sb-note bad"><Icon name="x" size={15} /><span>{[j.label, j.error].filter(Boolean).join(' · ')}</span><div className="sb-note-acts"><Btn label={t('scenebook.retry')} cls="ghost" onClick={guard(() => { j.seen = true; draw(m, [j.scene], j.config, j.slot, true); })} /><IBtn ic="x" title={t('common.close')} cls="tiny" onClick={() => { j.seen = true; schedule(); }} /></div></div>)}
    {/* 단추는 한 묶음으로: 좁은 화면에서는 글 아래 한 줄에 함께 (하나만 따로 떨어지지 않게) */}
    {drafts.length ? <div className="sb-note draft"><Icon name="sparkle" size={15} /><span><b>{tn('scenebook.fig.draftsReady', drafts.length)}</b>{' '}{drafts.map(d => shownTitle(d.title)).filter(Boolean).join(' · ')}</span>
      <div className="sb-note-acts"><Btn label={t('scenebook.draw')} ic="image" cls="primary" onClick={guard(() => quickDraw(m))} /><Btn label={t('scenebook.compose')} ic="edit" cls="ghost" onClick={guard(() => compose(m))} />
      <IBtn ic="trash" title={t('scenebook.fig.discardDraft')} cls="tiny" onClick={async () => { if (!(await confirmBox(t('scenebook.fig.discardAsk'), t('scenebook.fig.discard'), true))) return; sw.illustDraft = []; delete sw.illustDraftConfig; await chatApi.save(); schedule(); }} /></div></div> : null}
    {note ? <div className="sb-note"><Icon name="image" size={15} /><span>{note.error || t('scenebook.fig.noPlan')}</span><div className="sb-note-acts"><Btn label={t('scenebook.analyze')} ic="sparkle" cls="ghost" onClick={guard(() => compose(m, { manual: false }))} /><Btn label={t('scenebook.plans')} cls="ghost" onClick={showPlans} /><IBtn ic="x" title={t('common.close')} cls="tiny" onClick={async () => { note.seen = true; await chatApi.save(); schedule(); }} /></div></div> : null}
    {hidden ? <button type="button" className="chip sb-hidden-chip" onClick={async () => { for (const it of sw.illust || []) it.hidden = false; await chatApi.save(); chatApi.redraw(); }}>{tn('scenebook.fig.showHidden', hidden)}</button> : null}
  </>;
}

/** 다른 묶음이 답변마다 덧붙이는 꾸밈 (src/photos: 메신저로 보낸 사진). 삽화 꾸미기와 같은 때 돈다 */
export const decorators: ((art: HTMLElement, m: Msg, sw: Swipe) => void)[] = [];
/** 다른 묶음이 제 자리에서 진행을 보여 주는 작업 (보낸 사진): 답변 아래에 「그리는 중」 · 실패 칸을 따로 두지 않는다 */
export const ownJobs = new WeakSet<object>();
let timer = 0;
// 문단 뒤에 둔 삽화: 대화 화면(React)이 그린 칸은 제자리에 두고 감춘 채, 우리가 만든 칸을 문단 뒤에 놓는다
// (React 가 관리하는 요소를 옮기면, 그림을 지우거나 바꿀 때 React 가 그 요소를 못 찾아 대화 화면이 깨진다)
const moved = new WeakMap<HTMLElement, HTMLElement>(), origin = new WeakMap<HTMLElement, HTMLElement>();
// 답변을 받는 중이 아니면 다음 화면을 그리기 전에 꾸민다 (꾸미기 전 모습이 한 번 비쳤다가 바뀌며 흔들리지 않게)
export function schedule() { if (timer) return; const run = () => { timer = 0; try { decorate(); } catch (e) { console.warn('[삽화]', e); } }; if (cur().busy) timer = window.setTimeout(run, 400); else { timer = -1; onFrame(run); } }
function decorate() {
  sweep();
  const { chat, msgs } = cur(); if (!chat || !msgs) return;
  const c = Illust.cfg(), jobs = Illust.queue();
  document.documentElement.style.setProperty('--sb-w', figWidth(c) + 'px');   // 꾸미기 전의 그림 칸도 같은 너비로 시작한다
  document.documentElement.dataset.sbTools = c.imageTools === 'always' ? 'always' : 'tap';   // 터치 화면의 그림 위 도구: 한 번 누르면 · 항상
  let byId: Map<string, (typeof msgs)[number]> | null = null;   // 메시지가 수천 개여도 칸마다 처음부터 찾지 않게 (꾸밀 칸이 있을 때만 만든다)
  for (const art of document.querySelectorAll<HTMLElement>('.msgs article.msg[data-id]')) {
    // 원래 칸이 사라졌으면(그림을 지움) 문단 뒤의 우리 칸도 걷는다
    for (const cl of art.querySelectorAll<HTMLElement>('figure.illust.sb-inline')) if (!origin.get(cl)?.isConnected) cl.remove();
    const m = (byId ||= new Map(msgs.map(x => [x.id, x]))).get(art.dataset.id || ''), sw = m?.swipes?.[m.sw], main = art.querySelector<HTMLElement>('.msg-main');
    if (!m || !sw || !main || m.role !== 'assistant') continue;
    for (const box of art.querySelectorAll<HTMLElement>('.illusts')) {
      const figs = [...box.querySelectorAll<HTMLElement>('figure.illust')]; box.dataset.sb = '1';
      if (figs.length !== sw.illust?.length) continue;   // 화면이 아직 바뀐 자료를 못 따라왔다
      // 답변 아래의 웹툰 컷은 좁은 틈으로 위아래로 이어 보인다
      const shownSlots = sw.illust.filter(x => !x.hidden); box.classList.toggle('sb-strip', shownSlots.length > 0 && shownSlots.every(x => x.cut));
      figs.forEach((fig, i) => {
        const it = sw.illust?.[i]; if (!it) return;
        const cl = moved.get(fig), lost = !!cl && !cl.isConnected;   // 본문을 다시 그려 문단 뒤의 칸이 지워졌으면 다시 놓는다
        if (lost) moved.delete(fig);
        if (!fig.dataset.sb || lost) decorateFigure(fig, art, m, sw, it, c);   // 대화 화면이 그림 칸을 새로 그렸으면 그 칸만 다시 꾸민다
      });
    }
    for (const fig of art.querySelectorAll<HTMLElement>('figure.illust[data-sb]')) fig.classList.toggle('sb-busy', jobs.some(j => j.slot === fig.dataset.sb && j.sw === sw && (j.state === 'waiting' || j.state === 'running')));
    extras(main, m, sw, jobs);
    for (const f of decorators) { try { f(art, m, sw); } catch (e) { console.warn('[삽화 꾸밈]', e); } }
  }
}
/** 삽화를 둘 문단 요소 (못 찾으면 null — 답변 아래 그대로) */
function spot(art: HTMLElement, sw: Swipe, it: Slot, c: { placement?: string }): Element | null {
  // 웹툰 컷은 그릴 때의 컷 놓는 자리(문단마다 · 답변 아래)를 따른다
  const place = it.cut ? (it.place || placementOf(c)) : c.placement;
  if ((place !== 'inline' && place !== 'auto') || !(it.anchor || it.at)) return null;
  const body = art.querySelector('.msg-body'), paras = body ? [...body.children].filter(el => !el.matches('figure, details, pre, table, style, script') && flat(el.textContent)) : [];
  const i = placeAt(it, paras.map(el => el.textContent || ''), Illust.blocks(sw.text).map(b => b.content));
  if (i < 0) return null;
  let tail = paras[i]; while (tail.nextElementSibling?.matches('figure.illust')) tail = tail.nextElementSibling;
  return tail;
}
function decorateFigure(fig: HTMLElement, art: HTMLElement, m: Msg, sw: Swipe, it: Slot, c: { compact?: boolean; displayWidth?: number; placement?: string }) {
  Illust.slot(it); fig.dataset.sb = it.slotId;
  if (it.hidden) { fig.classList.add('sb-off'); return; }
  if (it.photo) { fig.classList.add('sb-off'); return; }   // 메신저로 보낸 사진: 액자 없이 보낸 자리에 사진 기능(decorators)이 그린다
  const at = spot(art, sw, it, c), host = at ? make('figure', 'illust sb-inline') : fig;
  if (at) { host.dataset.sb = it.slotId; fig.classList.add('sb-moved'); moved.set(fig, host); origin.set(host, fig); at.after(host); }
  else { fig.classList.remove('sb-moved'); if (fig.querySelector(':scope > .sb-holder')) return; }   // 문단을 못 찾게 되면 제자리 칸이 다시 보인다 (이미 꾸며 두었으면 그대로)
  const w = figWidth(c);
  host.style.maxWidth = `min(100%, ${w}px)`; host.classList.toggle('sb-compact', !!c.compact);
  // 대화 화면이 넣어 둔 그림 · 단추는 지우지 않고 가려 두고(data-sbr), 그 옆에 우리 것을 올린다 — 대화 화면이 제 요소를 계속 관리할 수 있게
  const holder = make('span', 'sb-holder'); holder.style.display = 'contents'; if (!at) fig.dataset.sbr = '1'; host.append(holder);
  mountNode(holder, <Figure fig={host} m={m} sw={sw} it={it} />);
}
function extras(main: HTMLElement, m: Msg, sw: Swipe, jobs: Job[]) {
  const mine = jobs.filter(j => j.msg === m && j.sw === sw && !ownJobs.has(j)), planning = Illust.planning(sw), pending = mine.filter(j => !j.slot && (j.state === 'waiting' || j.state === 'running')), failed = mine.filter(j => (j.state === 'failed' || j.state === 'uncertain') && !j.seen);
  const drafts = sw.illustDraft || [], hidden = (sw.illust || []).filter(it => it.hidden).length, plan = sw.illustPlan, note = !!plan && (plan.status === 'missing' || plan.status === 'failed') && !plan.seen && !drafts.length && !sw.illust?.length;
  const sig = JSON.stringify([planning, pending.map(j => j.id + j.state), failed.map(j => j.id), drafts.length, drafts.map(d => shownTitle(d.title)), hidden, !!note]);
  const old = main.querySelector<HTMLElement>(':scope > .sb-extras');
  if (old?.dataset.sig === sig) return;
  old?.remove();
  if (!planning && !pending.length && !failed.length && !drafts.length && !hidden && !note) return;
  const node = make('div', 'sb-extras'); node.dataset.sig = sig;
  mountNode(node, <Extras m={m} sw={sw} pending={pending} failed={failed} drafts={[...drafts]} hidden={hidden} note={note ? plan : null} planning={planning} />);
  (main.querySelector(':scope > .msg-tools') || main.lastChild)?.before(node);
}
