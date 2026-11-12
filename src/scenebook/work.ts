// ════════ 그리기 요청 ════════ 대기열에 넣기 · 초안 · 장면 분석 · 장면 편집기 열기
import { schedule } from './decorate';
import { openComposer } from './Composer';
import type { Chat, GenConfig, Msg, Scene, Slot } from './types';

import { toast } from '../ui';
import { chatApi } from '../chat/actions';
import * as IL from '../lib/illust';
import * as C from '../lib/core';
import { blankScene, cur, lastReply, mustBeOpen } from './util';
import { Illust } from './illust';
import { t } from '../i18n';

/** 마지막 처리 결과 (스튜디오 · 장면 패널의 상태 줄) */
export const flow = { note: '' };

const doneFor = (msg: Msg, title?: string) => async (err?: Error | null) => {
  if (err) { flow.note = t('scenebook.work.failNote', { error: err.message }); return toast(t('scenebook.work.failToast', { error: err.message }), 'err'); }
  flow.note = t('scenebook.work.done', { title: title || t('scenebook.illust') });
  if (cur().msgs?.includes(msg)) { await chatApi.save(); chatApi.redraw(); toast(t('scenebook.work.done', { title: title || t('scenebook.illust') }), 'ok'); }
  else toast(t('scenebook.work.doneElsewhere'));
};
/** 장면들을 대기열에 넣는다. slot 을 주면 첫 장면은 그 자리의 새 버전이 된다. exact: 기록된 설정 그대로 (다시 그리기). 아니면 그림체 · 장면별 화면 비율을 적용한다 */
export function draw(msg: Msg, scenes: Scene[], config?: GenConfig | null, slot: string | null = null, exact = false, quiet = false) {
  const { chat } = cur(); mustBeOpen(msg);
  Illust.validate(Illust.genConfig(config));
  scenes.forEach((sc, i) => Illust.enqueue(chat as Chat, msg, sc, doneFor(msg, sc.title), { manual: true, config, slot: i === 0 ? slot : null, exact }));
  if (scenes.length && !quiet) toast(t('scenebook.work.queued'));
  schedule();
}
export function regen(msg: Msg, it: Slot, seed: number) { const v = Illust.slot(it).versions[it.sel]; draw(msg, [v.scene as Scene], { ...(v.config || {}), seed } as GenConfig, it.slotId, true); }
/** 초안만 있고 그림이 없는 답변들 */
export const pendingDrafts = () => (cur().msgs || []).filter(m => { const sw = m.role === 'assistant' && m.swipes?.[m.sw]; return !!sw && (sw.illustDraft?.length ?? 0) > 0 && !sw.illust?.length; });
/** 그 초안들을 한꺼번에 대기열에 넣는다 → { count: 넣은 장면 수, left: 한도 때문에 남긴 답변 수 } */
export async function generateDrafts() {
  const waiting = Illust.queue().filter(x => x.state === 'waiting').length, room = 20 - waiting; let count = 0, left = 0;
  for (const m of pendingDrafts()) {
    const sw = m.swipes[m.sw], scenes = sw.illustDraft || [];
    if (count + scenes.length > room) { left++; continue; }
    draw(m, scenes, sw.illustDraftConfig, null, false, true); count += scenes.length; sw.illustDraft = []; delete sw.illustDraftConfig;
  }
  if (count) await chatApi.save(); schedule(); return { count, left };
}
/** 답변에서 장면을 뽑아 초안으로 저장 */
export async function analyzeInto(msg: Msg): Promise<Scene[]> {
  const { chat, msgs } = cur(); mustBeOpen(msg);
  if (msg.role !== 'assistant') throw new Error(t('scenebook.err.notReply'));
  chatApi.setStatus(t('scenebook.analyzing'));
  try {
    const scenes = (await Illust.analyze(chat as Chat, msgs as Msg[], msg, null, { manual: true })).map(sc => Illust.compileScene(chat as Chat, sc)), sw = msg.swipes[msg.sw];
    sw.illustDraft = scenes; sw.illustDraftConfig = Illust.genConfig(); await chatApi.save(); schedule();
    return scenes;
  } finally { chatApi.setStatus(''); }
}
/** 초안이 있으면 그대로, 없으면 장면을 뽑아서 바로 그린다 */
export async function quickDraw(msg: Msg) {
  mustBeOpen(msg); const sw = msg.swipes[msg.sw];
  const scenes = sw.illustDraft?.length ? sw.illustDraft : await analyzeInto(msg), config = sw.illustDraftConfig;
  draw(msg, scenes, config); sw.illustDraft = []; delete sw.illustDraftConfig; await chatApi.save(); schedule();
}
/** 장면 편집기 열기. manual=false 면 먼저 분석한다 */
export async function compose(msg: Msg | null = lastReply(), { manual = true, initial = null, slot = null, config = null, preview = '' }: { manual?: boolean; initial?: Scene[] | null; slot?: string | null; config?: GenConfig | null; preview?: string } = {}) {
  const { chat } = cur(); if (!chat || !msg) throw new Error(t('scenebook.err.openChatFirst'));
  if (msg.role !== 'assistant') throw new Error(t('scenebook.err.notReply'));
  mustBeOpen(msg); const sw = msg.swipes[msg.sw];
  let scenes = initial || (sw.illustDraft?.length ? sw.illustDraft : null), cfg = config || (!initial && sw.illustDraftConfig) || null;
  if (!scenes && !manual) scenes = await analyzeInto(msg);
  if (!scenes) { const plan = sw.illustPlan?.raw ? Illust.readPlan(sw.illustPlan.raw) : null; scenes = plan?.scenes.length ? plan.scenes.slice(0, 6) : [blankScene()]; }
  if (!preview) { const it = (slot && sw.illust?.find(x => x.slotId === slot)) || sw.illust?.find(x => !x.hidden && x.id); preview = it ? Illust.data(it.id) : ''; }   // 배치판 배경: 고치는 그림, 없으면 이 답변의 첫 그림
  if (cfg?.references?.length) { const have = new Set((await C.DB.byOwner(IL.REF_OWNER)).map(r => r.id)), kept = cfg.references.filter(r => have.has(r.id)); if (kept.length !== cfg.references.length) { cfg = { ...cfg, references: kept }; toast(t('scenebook.work.refsDropped')); } }
  openComposer({ chat, msg, scenes: scenes.map(sc => Illust.compileScene(chat, sc)), config: Illust.genConfig(cfg), slot, preview });
}
