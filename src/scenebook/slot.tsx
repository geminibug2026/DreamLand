// 삽화 한 자리에서 여는 것들: 크게 보기 · 생성 기록 · 버전 비교 · AI 검수 · 더 보기 메뉴 · 장면 수정
import { useState } from 'react';
import type { MenuItem } from '../ui';
import { Btn, Fld, IBtn, Sel, Seg, openModal, type Box } from './parts';
import { CAMERA_TAGS, orientations, hasCameraTag, sizeFor, toggleCameraTag } from './framing';
import { compose, draw, regen } from './work';
import type { Chat, GenConfig, Msg, Review, Scene, Slot, Swipe, Version } from './types';

import { confirmBox, menu, toast } from '../ui';
import { chatApi } from '../chat/actions';
import * as C from '../lib/core';
import { clone, configLine, cur, errText, guard, mustBeOpen, saveImage, when } from './util';
import { Illust } from './illust';
import { t } from '../i18n';

// ════════ 크게 보기 · 생성 기록 · 버전 비교 ════════
export interface ViewAction { label: string; ic?: string; hint?: string; danger?: boolean; run?: () => unknown; onclick?: () => unknown }
export function viewer({ title, src, sub = '', actions = [], more = [] }: { title?: string; src: string; sub?: string; actions?: ViewAction[]; more?: ViewAction[] }) {
  const run = (box: Box, a: ViewAction) => async () => { box.close(); try { await (a.run || a.onclick)?.(); } catch (e) { toast(errText(e), 'err'); } };
  return openModal({ title: title || t('scenebook.illust'), wide: true, cls: 'sb-viewer' }, box => <>
    <div className="sb-viewer-frame"><img src={src} alt={title || t('scenebook.illust')} /></div>{sub ? <p className="hint">{sub}</p> : null}
    <div className="sb-viewer-foot">{actions.map((a, i) => <Btn key={i} label={a.label} ic={a.ic} cls="ghost" onClick={run(box, a)} />)}<Btn label={t('common.save')} ic="import" cls="ghost" onClick={guard(() => saveImage(src, title || 'illust'))} />
      {more.length ? <IBtn ic="more" title={t('scenebook.more')} onClick={e => menu(e.currentTarget, more.map(a => ({ label: a.label, ic: a.ic, hint: a.hint, danger: a.danger, onclick: run(box, a) })))} /> : null}</div>
  </>);
}
export function inspect(v: { scene?: Scene; config?: GenConfig | null; seed?: number | null; review?: Review; ts?: number }) {
  const data = { scene: v.scene, config: v.config, seed: v.seed, review: v.review };
  openModal({ title: t('scenebook.record'), wide: true, cls: 'col', actions: [{ label: t('scenebook.slot.download'), ic: 'import', onclick: () => { C.download('scenebook-image-record.json', JSON.stringify(data, null, 2)); return false; } }, { label: t('common.close'), cls: 'primary' }] },
    () => <><p className="hint">{[v.seed != null ? `Seed ${v.seed}` : '', configLine(v.config), when(v.ts)].filter(Boolean).join(' · ')}</p><pre className="regex-out sb-code">{JSON.stringify(data, null, 2)}</pre></>);
}
function ComparePane({ label, vs, start }: { label: string; vs: Version[]; start: number }) {
  const [i, setI] = useState(start), v = vs[i];
  return <section><Fld label={label}><Sel opts={vs.map((x, n) => [n, `${n + 1}${x.seed != null ? ` · Seed ${x.seed}` : ''}`])} value={start} onChange={n => setI(+n)} /></Fld><img src={Illust.data(v.id)} alt={v.scene?.title || ''} /><p className="hint">{configLine(v.config)}</p></section>;
}
export function compare(it: Slot) {
  openModal({ title: t('scenebook.slot.compare'), wide: true, cls: 'sb-compare' }, () => <><ComparePane label={t('scenebook.slot.before')} vs={it.versions} start={it.sel === 0 ? 1 : it.sel - 1} /><ComparePane label={t('scenebook.slot.current')} vs={it.versions} start={it.sel} /></>);
}

/** AI 검수: 의견만 보여 주고 그림은 바꾸지 않는다. v 는 버전 또는 보관함 기록 { id, scene } */
export async function review(v: { id: string; scene?: Scene; review?: Review }, save = false) {
  toast(t('scenebook.review.busy'));
  const r = await Illust.review(v.id, v.scene, cur().chat); v.review = r;
  if (save && cur().chat) await chatApi.save();
  showReview(r);
}
export function showReview(r: Review) {
  openModal({ title: t('scenebook.review.title'), cls: 'col sb-review' }, () => <><p className="hint">{t('scenebook.review.note')}</p><p>{r.summary || t('scenebook.review.noSummary')}</p>
    {r.issues?.length ? <ul className="sb-warn">{r.issues.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="hint">{t('scenebook.review.clean')}</p>}{r.created ? <small className="hint">{when(r.created)}</small> : null}</>);
}

// ════════ 삽화 한 자리 ════════
const editSlot = (m: Msg, it: Slot) => { const v = Illust.slot(it).versions[it.sel]; return compose(m, { initial: [v.scene as Scene], slot: it.slotId, config: { ...(v.config || {}), seed: v.seed ?? -1 } as GenConfig, preview: Illust.data(v.id) }); };
async function deleteSlot(sw: Swipe, it: Slot) {
  if (!(await confirmBox(t('scenebook.slot.deleteAsk'), t('scenebook.delete'), true))) return false;
  const i = sw.illust?.indexOf(it) ?? -1; if (i >= 0) sw.illust?.splice(i, 1);
  Illust.cancelWaiting(j => j.slot === it.slotId);
  await chatApi.save(); chatApi.redraw(); toast(t('scenebook.slot.deleted')); return true;
}
type Item = Exclude<MenuItem, '-' | null | false | undefined | '' | 0> & { label: string };
export function slotMenu(m: Msg, sw: Swipe, it: Slot): MenuItem[] {
  const v: Partial<Version> = it.versions[it.sel] || {}, seed = v.seed;
  return [
    { label: t('scenebook.slot.editFull'), ic: 'sliders', onclick: guard(() => editSlot(m, it)) },
    seed != null && { label: t('scenebook.slot.sameSeed'), ic: 'refresh', onclick: guard(() => regen(m, it, seed)) },
    it.versions.length > 1 && { label: t('scenebook.slot.compare'), ic: 'panel', onclick: () => compare(it) },
    { label: t('scenebook.record'), ic: 'note', onclick: () => inspect(v) },
    { label: t('scenebook.review.run'), ic: 'search', onclick: guard(() => review(v as Version, true)) }, v.review && { label: t('scenebook.review.last'), ic: 'eye', onclick: () => showReview(v.review as Review) },
    seed != null && { label: t('scenebook.slot.saveSeed'), ic: 'dice', hint: String(seed), onclick: () => { Illust.saveCfg({ seed }); toast(t('scenebook.slot.seedSaved', { seed })); } },
    { label: t('scenebook.slot.saveImage'), ic: 'import', onclick: guard(() => saveImage(Illust.data(it.id), it.title || 'illust')) },
    { label: t('scenebook.slot.hide'), ic: 'eyeoff', onclick: async () => { it.hidden = true; await chatApi.save(); chatApi.redraw(); } },
    '-',
    { label: t('scenebook.slot.delete'), ic: 'trash', danger: true, onclick: guard(() => deleteSlot(sw, it)) },
  ];
}
export function slotViewer(m: Msg, sw: Swipe, it: Slot) {
  const v: Partial<Version> = it.versions[it.sel] || {};
  viewer({ title: it.title || t('scenebook.illust'), src: Illust.data(it.id), sub: [configLine(v.config), v.seed != null ? `Seed ${v.seed}` : ''].filter(Boolean).join(' · '),
    actions: [{ label: t('scenebook.slot.edit'), ic: 'edit', run: () => quickEdit(m, it) }, { label: t('scenebook.regen'), ic: 'refresh', run: () => regen(m, it, -1) }],
    more: slotMenu(m, sw, it).filter((a): a is Item => !!a && a !== '-' && a.label !== t('scenebook.slot.saveImage')) });   // 삭제는 더 보기 안에 둔다
}

/** 장면 수정 창의 안쪽. hold.read 로 지금 적힌 내용을, hold.size 로 고른 화면 비율을 창 아래 단추가 읽는다 */
function QuickEdit({ m, chat, start, hold, check }: { m: Msg; chat: Chat; start: Scene; hold: { read: () => Scene; size: string }; check: () => void }) {
  const [draft, setDraft] = useState(start), [ask, setAsk] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(start.camera ?? ''), [prompt, setPrompt] = useState(start.prompt ?? ''), [cast, setCast] = useState(() => (start.characters ?? []).map(c => c.prompt ?? ''));
  const read = (): Scene => ({ ...draft, camera: camera.trim(), prompt: prompt.trim(), finalPrompt: false, characters: (draft.characters ?? []).map((c, i) => ({ ...c, prompt: cast[i] })) });
  hold.read = read;
  const rewrite = guard(async () => {
    const request = ask.trim(); if (!request) throw new Error(t('scenebook.quick.askFirst'));
    setStatus(t('scenebook.quick.rewriting')); setBusy(true);
    try {
      check(); const next = { ...(await Illust.analyze(chat, cur().msgs as Msg[], m, null, { existing: [read()], direction: request, scope: 'all', manual: true }))[0] };
      setDraft(next); setCamera(next.camera ?? ''); setPrompt(next.prompt ?? ''); setCast((next.characters ?? []).map(c => c.prompt ?? '')); setStatus(t('scenebook.quick.rewritten'));
    } catch (e) { setStatus(t('scenebook.quick.rewriteFail')); throw e; } finally { setBusy(false); }
  });
  return <>
    <p className="hint">{t('scenebook.quick.hint')}</p>
    <section className="sb-quick-assist"><Fld label={t('scenebook.quick.ask')}><textarea className="inp" rows={2} placeholder={t('scenebook.quick.askPh')} value={ask} onChange={e => setAsk(e.target.value)} /></Fld>
      <div className="row"><p className="hint" role="status">{status}</p><span className="sb-grow" /><Btn label={t('scenebook.quick.rewrite')} ic="sparkle" disabled={busy} onClick={rewrite} /></div></section>
    <div className="sb-chips" role="group" aria-label={t('scenebook.quick.cameraPick')}>{CAMERA_TAGS.map(([tag, label, group]) => { const on = hasCameraTag(camera, tag);
      return <button key={tag} type="button" className={'chip' + (on ? ' on' : '')} title={tag} data-tag={tag} data-group={group} aria-pressed={on} onClick={() => setCamera(toggleCameraTag(camera, tag))}>{t(label)}</button>; })}</div>
    <Fld label={t('scenebook.camera')}><input className="inp" placeholder={t('scenebook.quick.cameraPh')} spellCheck={false} autoComplete="off" value={camera} onChange={e => setCamera(e.target.value)} /></Fld>
    <div className="sb-shape"><span className="field-label">{t('scenebook.ratio')}</span><Seg label={t('scenebook.ratio')} choices={[['', t('scenebook.quick.keep')], ...orientations().slice(1)]} value="" onChange={val => { hold.size = val; }} /></div>
    <Fld label={t('scenebook.scene')}><textarea className="inp" rows={4} spellCheck={false} value={prompt} onChange={e => setPrompt(e.target.value)} /></Fld>
    <div className="col sb-quick-people">{(draft.characters ?? []).map((c, i) => <Fld key={i} label={c.name || t('scenebook.person.n', { n: i + 1 })}><textarea className="inp" rows={3} spellCheck={false} value={cast[i] ?? ''} onChange={e => setCast(cast.map((x, n) => n === i ? e.target.value : x))} /></Fld>)}</div>
  </>;
}
/** 장면 수정: 그림을 가르는 몇 가지만 고쳐서 같은 자리에 다시 생성한다. 이전 그림은 버전으로 남는다 */
export function quickEdit(m: Msg, it: Slot) {
  const { chat } = cur(), sw = m.swipes[m.sw], v = Illust.slot(it).versions[it.sel]; if (!v) throw new Error(t('scenebook.quick.noImage'));
  const start: Scene = clone(v.scene || { characters: [] }), hold = { read: () => start, size: '' };
  const check = () => { mustBeOpen(m); if (!sw.illust?.includes(it)) throw new Error(t('scenebook.quick.changed')); };
  openModal({ title: t('scenebook.quick.title'), cls: 'col sb-quick', actions: [
    { label: t('scenebook.quick.detail'), ic: 'sliders', cls: 'ghost', onclick: () => { try { check(); const scene = hold.read(); compose(m, { initial: [scene], slot: it.slotId, config: { ...(v.config || {}), seed: v.seed ?? -1 } as GenConfig, preview: Illust.data(v.id) }).catch(e => toast(errText(e), 'err')); } catch (e) { toast(errText(e), 'err'); return false; } } },
    { label: t('scenebook.regen'), ic: 'refresh', cls: 'primary', onclick: () => { try { check(); const base = v.config || Illust.genConfig(); draw(m, [hold.read()], { ...base, seed: -1, ...(hold.size ? sizeFor(base, hold.size) : {}) }, it.slotId, true); } catch (e) { toast(errText(e), 'err'); return false; } } }] },
    () => <QuickEdit m={m} chat={chat as Chat} start={start} hold={hold} check={check} />);
}
