// ════════ 메시지 아래 삽화 꾸미기 ════════ 대화 화면(옛 chat.js)이 그린 삽화 칸에 액자 · 버전 · 도구를 올리고, 답변 아래에 진행 · 초안 · 알림을 붙인다
import { useLayoutEffect, useRef } from 'react';
import { Icon } from '../kit';
import { Btn, IBtn, make, mountNode, sweep, useBump } from './parts';
import { frameLayout } from './frames';
import { FrameArt } from './Studio';
import { compose, draw, quickDraw, regen } from './work';
import { quickEdit, slotMenu, slotViewer } from './slot';
import { showPlans } from './dialogs';
import type { Job, Msg, PlanRecord, Scene, Slot, Swipe } from './types';

import { confirmBox, menu } from '../ui';
import { chatApi } from '../chat/actions';
import { cur, flat, guard, shownTitle } from './util';
import { Illust } from './illust';
import { t, tn } from '../i18n';

/** 삽화 한 장: 액자 + 그림 + 그림 위 도구 + 아래 제목 줄. 대화 화면의 figure.illust 안에 들어간다 */
export function Figure({ fig, m, sw, it }: { fig: HTMLElement; m: Msg; sw: Swipe; it: Slot }) {
  const bump = useBump(), img = useRef<HTMLImageElement>(null), c = Illust.cfg(), v = it.versions[it.sel];
  // 액자: 그림 비율에 맞춰 그리므로 버전을 넘기면 다시 씌운다
  const lay = frameLayout(v?.config?.width || img.current?.naturalWidth || 832, v?.config?.height || img.current?.naturalHeight || 1216, c);
  useLayoutEffect(() => { fig.dataset.frame = lay.frame; });
  const step = (d: number) => { Illust.select(it, it.sel + d); bump(); void chatApi.save(); };
  return <>
    <div className="sb-frame" style={lay.wrapStyle}>
      <div className="sb-pic" style={lay.picStyle}><img ref={img} src={Illust.data(it.id)} alt={it.title || t('scenebook.illust')} loading="lazy" onClick={e => { e.stopPropagation(); e.preventDefault(); slotViewer(m, sw, it); }} /></div>
      <FrameArt lay={lay} />
      <div className="sb-fig-actions" aria-label={t('scenebook.fig.tools')}><IBtn ic="edit" title={t('scenebook.fig.editRegen')} cls="tiny" onClick={guard(() => quickEdit(m, it))} /><IBtn ic="refresh" title={t('scenebook.fig.newSeed')} cls="tiny" onClick={guard(() => regen(m, it, -1))} /></div>
    </div>
    <figcaption><span className="sb-fig-title">{shownTitle(it.title)}</span>
      {it.versions.length > 1 ? <div className="sb-ver" role="group" aria-label={t('scenebook.fig.versions')}><button type="button" title={t('scenebook.fig.prev')} aria-label={t('scenebook.fig.prev')} onClick={() => step(-1)}><Icon name="left" size={13} /></button><span className="sb-ver-count">{`${it.sel + 1}/${it.versions.length}`}</span><button type="button" title={t('scenebook.fig.next')} aria-label={t('scenebook.fig.next')} onClick={() => step(1)}><Icon name="right" size={13} /></button></div> : null}
      <IBtn ic="more" title={t('scenebook.more')} cls="tiny" onClick={e => menu(e.currentTarget, slotMenu(m, sw, it))} /></figcaption>
  </>;
}

/** 답변 아래 덧붙이는 것: 그리는 중 · 실패 · 준비된 초안 · 숨긴 삽화 · 지시 없음 */
function Extras({ m, sw, pending, failed, drafts, hidden, note }: { m: Msg; sw: Swipe; pending: Job[]; failed: Job[]; drafts: Scene[]; hidden: number; note: PlanRecord | null }) {
  const cfg = Illust.cfg();
  return <>
    {pending.length ? <div className="sb-pendings">{pending.map(j => <div key={j.id} className={`sb-pending ${j.state}`} style={{ aspectRatio: `${j.config.width} / ${j.config.height}`, maxWidth: `min(100%, ${Math.min(cfg.displayWidth || 400, 260)}px)` }}><Icon name="image" size={22} /><b>{j.state === 'running' ? t('scenebook.job.running') : t('scenebook.fig.waitingTurn')}</b><span>{j.label}</span></div>)}</div> : null}
    {failed.map(j => <div key={j.id} className="sb-note bad"><Icon name="x" size={15} /><span>{`${j.label} · ${j.error}`}</span><Btn label={t('scenebook.retry')} cls="ghost" onClick={guard(() => { j.seen = true; draw(m, [j.scene], j.config, j.slot, true); })} /><IBtn ic="x" title={t('common.close')} cls="tiny" onClick={() => { j.seen = true; schedule(); }} /></div>)}
    {drafts.length ? <div className="sb-note draft"><Icon name="sparkle" size={15} /><span><b>{tn('scenebook.fig.draftsReady', drafts.length)}</b>{' '}{drafts.map(d => shownTitle(d.title)).filter(Boolean).join(' · ')}</span>
      <Btn label={t('scenebook.draw')} ic="image" cls="primary" onClick={guard(() => quickDraw(m))} /><Btn label={t('scenebook.compose')} ic="edit" cls="ghost" onClick={guard(() => compose(m))} />
      <IBtn ic="trash" title={t('scenebook.fig.discardDraft')} cls="tiny" onClick={async () => { if (!(await confirmBox(t('scenebook.fig.discardAsk'), t('scenebook.fig.discard'), true))) return; sw.illustDraft = []; delete sw.illustDraftConfig; await chatApi.save(); schedule(); }} /></div> : null}
    {note ? <div className="sb-note"><Icon name="image" size={15} /><span>{note.error || t('scenebook.fig.noPlan')}</span><Btn label={t('scenebook.analyze')} ic="sparkle" cls="ghost" onClick={guard(() => compose(m, { manual: false }))} /><Btn label={t('scenebook.plans')} cls="ghost" onClick={showPlans} /><IBtn ic="x" title={t('common.close')} cls="tiny" onClick={async () => { note.seen = true; await chatApi.save(); schedule(); }} /></div> : null}
    {hidden ? <button type="button" className="chip sb-hidden-chip" onClick={async () => { for (const it of sw.illust || []) it.hidden = false; await chatApi.save(); chatApi.redraw(); }}>{tn('scenebook.fig.showHidden', hidden)}</button> : null}
  </>;
}

let timer = 0;
export function schedule() { if (timer) return; timer = window.setTimeout(() => { timer = 0; try { decorate(); } catch (e) { console.warn('[삽화]', e); } }, cur().busy ? 400 : 30); }
function decorate() {
  sweep();
  const { chat, msgs } = cur(); if (!chat || !msgs) return;
  const c = Illust.cfg(), jobs = Illust.queue();
  for (const art of document.querySelectorAll<HTMLElement>('.msgs article.msg[data-id]')) {
    const m = msgs.find(x => x.id === art.dataset.id), sw = m?.swipes?.[m.sw], main = art.querySelector<HTMLElement>('.msg-main');
    if (!m || !sw || !main || m.role !== 'assistant') continue;
    for (const box of art.querySelectorAll<HTMLElement>('.illusts')) {
      const figs = [...box.querySelectorAll<HTMLElement>('figure.illust')], fresh = !box.dataset.sb; box.dataset.sb = '1';
      if (!fresh && figs.length !== sw.illust?.length) continue;   // 문단 뒤로 옮긴 그림이 있으면 순서를 알 수 없다
      figs.forEach((fig, i) => { const it = sw.illust?.[i]; if (it && !fig.dataset.sb) decorateFigure(fig, art, m, sw, it, c); });   // 대화 화면이 그림 칸을 새로 그렸으면 그 칸만 다시 꾸민다
    }
    for (const fig of art.querySelectorAll<HTMLElement>('figure.illust[data-sb]')) fig.classList.toggle('sb-busy', jobs.some(j => j.slot === fig.dataset.sb && j.sw === sw && (j.state === 'waiting' || j.state === 'running')));
    extras(main, m, sw, jobs);
  }
}
function decorateFigure(fig: HTMLElement, art: HTMLElement, m: Msg, sw: Swipe, it: Slot, c: { compact?: boolean; displayWidth?: number; placement?: string }) {
  Illust.slot(it); fig.dataset.sb = it.slotId;
  if (it.hidden) { fig.classList.add('sb-off'); return; }
  const w = c.compact ? Math.min(360, c.displayWidth || 400) : (c.displayWidth || 400);
  fig.style.maxWidth = `min(100%, ${w}px)`; fig.classList.toggle('sb-compact', !!c.compact);
  // 대화 화면이 넣어 둔 그림 · 단추는 지우지 않고 가려 두고(data-sbr), 그 옆에 우리 것을 올린다 — 대화 화면이 제 요소를 계속 관리할 수 있게
  const holder = make('span'); holder.style.display = 'contents'; fig.dataset.sbr = '1'; fig.append(holder);
  mountNode(holder, <Figure fig={fig} m={m} sw={sw} it={it} />);
  if (c.placement === 'inline' && it.anchor) {   // 문단 뒤에 끼워 넣기 (못 찾으면 답변 아래 그대로)
    const key = flat(it.anchor).slice(0, 40), body = art.querySelector('.msg-body');
    const at = key && body && [...body.children].find(el => !el.matches('figure, details, pre, table') && flat(el.textContent).includes(key));
    if (at) { let tail = at; while (tail.nextElementSibling?.matches('figure.illust')) tail = tail.nextElementSibling; tail.after(fig); fig.classList.add('sb-inline'); }
  }
}
function extras(main: HTMLElement, m: Msg, sw: Swipe, jobs: Job[]) {
  const mine = jobs.filter(j => j.msg === m && j.sw === sw), pending = mine.filter(j => !j.slot && (j.state === 'waiting' || j.state === 'running')), failed = mine.filter(j => (j.state === 'failed' || j.state === 'uncertain') && !j.seen);
  const drafts = sw.illustDraft || [], hidden = (sw.illust || []).filter(it => it.hidden).length, plan = sw.illustPlan, note = !!plan && (plan.status === 'missing' || plan.status === 'failed') && !plan.seen && !drafts.length && !sw.illust?.length;
  const sig = JSON.stringify([pending.map(j => j.id + j.state), failed.map(j => j.id), drafts.length, drafts.map(d => shownTitle(d.title)), hidden, !!note]);
  const old = main.querySelector<HTMLElement>(':scope > .sb-extras');
  if (old?.dataset.sig === sig) return;
  old?.remove();
  if (!pending.length && !failed.length && !drafts.length && !hidden && !note) return;
  const node = make('div', 'sb-extras'); node.dataset.sig = sig;
  mountNode(node, <Extras m={m} sw={sw} pending={pending} failed={failed} drafts={[...drafts]} hidden={hidden} note={note ? plan : null} />);
  (main.querySelector(':scope > .msg-tools') || main.lastChild)?.before(node);
}
