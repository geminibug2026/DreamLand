// ── Dreamland 삽화 (씬북): 등록(X.studio / X.actions / X.panels / X.commands / X.composer)과 이벤트 ──
// 엔진은 옛 illust.js. 화면은 src/scenebook/ 이 맡는다 (옛 js/f-scenebook.js 를 대신한다)
import { make, mountNode } from '../scenebook/parts';
import { Frames } from '../scenebook/frames';
import { Panel, Studio, openStudio } from '../scenebook/Studio';
import { schedule } from '../scenebook/decorate';
import { compose, flow, quickDraw } from '../scenebook/work';
import type { Msg } from '../scenebook/types';

import { toast } from '../ui';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';
import * as C from '../lib/core';
import { cur, guard } from '../scenebook/util';
import { Illust } from '../scenebook/illust';
import { t, tn } from '../i18n';

const OWNER = 'scenebook';
const TAB_WORDS: Record<string, string> = { 갤러리: 'gallery', 작업: 'queue', 인물: 'cast', 참조: 'refs', 생성: 'gen', gallery: 'gallery', queue: 'queue' };

function setup() {
  if (!document.querySelector('link[data-sb]')) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'css/f-scenebook.css'; link.dataset.sb = '1'; document.head.append(link); }
  const x = X, { on, now } = C;

  // ════════ 등록 ════════ (옛 모듈이 남긴 것이 있으면 걷어 내고 한 번만)
  x.studio = x.studio.filter(t => t.owner !== OWNER); x.actions = x.actions.filter(a => a.owner !== OWNER); x.composer = x.composer.filter(a => a.owner !== OWNER); x.panels = x.panels.filter(p => p.owner !== OWNER);
  x.studio.push({ owner: OWNER, get title() { return t('scenebook.illust'); }, render: () => mountNode(make('div', 'card sb-studio'), <Studio />) });
  x.actions.push(
    { owner: OWNER, id: 'sb-draw', get label() { return t('scenebook.action.autoDraw'); }, icon: 'image', run: guard(async (m: Msg) => { if (m.role !== 'assistant') throw new Error(t('scenebook.err.notReply')); await quickDraw(m); }) },
    { owner: OWNER, id: 'sb-analyze', get label() { return t('scenebook.analyze'); }, icon: 'sparkle', run: guard((m: Msg) => compose(m, { manual: false })) },
    { owner: OWNER, id: 'sb-compose', get label() { return t('scenebook.compose'); }, icon: 'sliders', run: guard((m: Msg) => compose(m)) });
  x.composer.push({ owner: OWNER, id: 'sb-studio', get label() { return t('scenebook.action.studio'); }, icon: 'image', run: () => openStudio() });
  for (const name of ['/scenebook', '/삽화']) x.commands.set(name, { owner: OWNER, get help() { return t('scenebook.cmd.help'); }, run: arg => openStudio(TAB_WORDS[String(arg || '').trim()]) });
  x.panels.push({ owner: OWNER, id: 'scenebook', get title() { return t('scenebook.illust'); }, icon: 'image', render: () => mountNode(make('div', 'col sb-panel'), <Panel />) });

  // ════════ 이벤트 ════════
  const shown = () => !!cur().chat && !!document.querySelector('.illusts[data-sb]');
  on('illust:jobs', schedule);
  on('illust:draft', schedule);
  on('chat:open', () => { Illust.cfg(); schedule(); });
  void Frames.load().then(() => { const f = Illust.cfg(); if ([f.frame, f.frameWide].some(v => String(v || '').startsWith('image:')) && shown()) chatApi.redraw(); });   // 가져온 액자 그림은 읽은 뒤에 씌운다
  let lookSig = '';
  on('settings', p => {   // 표시 설정이 바뀌면 열려 있는 대화의 삽화를 다시 그린다
    if (!(p as { illust?: unknown } | undefined)?.illust) return; const c = Illust.cfg(), sig = [c.placement, c.displayWidth, c.compact, c.frame, c.frameWide, c.frameInk, Frames.list().length].join('|'), changed = lookSig && sig !== lookSig; lookSig = sig;
    if (changed && shown()) chatApi.redraw();
  });
  on('message:received', data => {
    const d = data as { msg?: Msg; chat?: { id?: string } } | undefined, msg = d?.msg, plan = Illust.takePlan(), c = Illust.cfg(), sw = msg?.swipes?.[msg.sw];
    if (plan && sw && (plan.found || (plan.asked && c.auto))) {
      const queued = Illust.queue().some(j => j.sw === sw && j.state !== 'cancelled');
      sw.illustPlan = !plan.found ? { status: 'missing', error: t('scenebook.plan.missing'), ts: now() }
        : plan.error ? { status: 'failed', raw: plan.raw, error: plan.error, ts: now() }
          : { status: queued ? 'queued' : sw.illustDraft?.length ? 'ready' : 'failed', raw: plan.raw, repairs: plan.repairs, warnings: plan.warnings, ts: now() };
      if (sw.illustPlan.status === 'missing' || plan.error) toast(t('scenebook.plan.missingToast', { error: sw.illustPlan.error }));
      else if (sw.illustPlan.status === 'ready') toast(tn('scenebook.plan.draftSaved', sw.illustDraft?.length ?? 0));
      flow.note = sw.illustPlan.error || ({ queued: t('scenebook.plan.queued'), ready: tn('scenebook.plan.ready', sw.illustDraft?.length || 0) } as Record<string, string>)[sw.illustPlan.status || ''] || flow.note;
      // 답변이 속한 방이 열려 있을 때만 여기서 저장한다. 다른 방의 답변은 생성 쪽이 이 알림 바로 뒤에 그 방에 저장한다
      if (!d?.chat || cur().chat?.id === d.chat.id) void chatApi.save();
    }
    schedule();
  });
  new MutationObserver(schedule).observe(document.getElementById('page') || document.body, { childList: true, subtree: true });
}

export const feature = { name: 'scenebook', setup };
