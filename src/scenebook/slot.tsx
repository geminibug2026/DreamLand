// 삽화 한 자리에서 여는 것들: 크게 보기 · 생성 기록 · 버전 비교 · AI 검수 · 더 보기 메뉴 · 장면 수정
import { useState } from 'react';
import type { MenuItem } from '../ui';
import { C, Illust, U, chatApi, clone, configLine, cur, errText, guard, mustBeOpen, saveImage, when } from './bridge';
import { Btn, Fld, IBtn, Sel, Seg, openModal, type Box } from './parts';
import { CAMERA_TAGS, ORIENTATIONS, hasCameraTag, sizeFor, toggleCameraTag } from './framing';
import { compose, draw, regen } from './work';
import type { Chat, GenConfig, Msg, Review, Scene, Slot, Swipe, Version } from './types';

// ════════ 크게 보기 · 생성 기록 · 버전 비교 ════════
export interface ViewAction { label: string; ic?: string; hint?: string; danger?: boolean; run?: () => unknown; onclick?: () => unknown }
export function viewer({ title, src, sub = '', actions = [], more = [] }: { title?: string; src: string; sub?: string; actions?: ViewAction[]; more?: ViewAction[] }) {
  const run = (box: Box, a: ViewAction) => async () => { box.close(); try { await (a.run || a.onclick)?.(); } catch (e) { U().toast(errText(e), 'err'); } };
  return openModal({ title: title || '삽화', wide: true, cls: 'sb-viewer' }, box => <>
    <div className="sb-viewer-frame"><img src={src} alt={title || '삽화'} /></div>{sub ? <p className="hint">{sub}</p> : null}
    <div className="sb-viewer-foot">{actions.map((a, i) => <Btn key={i} label={a.label} ic={a.ic} cls="ghost" onClick={run(box, a)} />)}<Btn label="저장" ic="import" cls="ghost" onClick={guard(() => saveImage(src, title || 'illust'))} />
      {more.length ? <IBtn ic="more" title="더 보기" onClick={e => U().menu(e.currentTarget, more.map(a => ({ label: a.label, ic: a.ic, hint: a.hint, danger: a.danger, onclick: run(box, a) })))} /> : null}</div>
  </>);
}
export function inspect(v: { scene?: Scene; config?: GenConfig | null; seed?: number | null; review?: Review; ts?: number }) {
  const data = { scene: v.scene, config: v.config, seed: v.seed, review: v.review };
  openModal({ title: '생성 기록', wide: true, cls: 'col', actions: [{ label: '내려받기', ic: 'import', onclick: () => { C().download('scenebook-image-record.json', JSON.stringify(data, null, 2)); return false; } }, { label: '닫기', cls: 'primary' }] },
    () => <><p className="hint">{[v.seed != null ? `Seed ${v.seed}` : '', configLine(v.config), when(v.ts)].filter(Boolean).join(' · ')}</p><pre className="regex-out sb-code">{JSON.stringify(data, null, 2)}</pre></>);
}
function ComparePane({ label, vs, start }: { label: string; vs: Version[]; start: number }) {
  const [i, setI] = useState(start), v = vs[i];
  return <section><Fld label={label}><Sel opts={vs.map((x, n) => [n, `${n + 1}${x.seed != null ? ` · Seed ${x.seed}` : ''}`])} value={start} onChange={n => setI(+n)} /></Fld><img src={Illust().data(v.id)} alt={v.scene?.title || ''} /><p className="hint">{configLine(v.config)}</p></section>;
}
export function compare(it: Slot) {
  openModal({ title: '버전 비교', wide: true, cls: 'sb-compare' }, () => <><ComparePane label="이전 결과" vs={it.versions} start={it.sel === 0 ? 1 : it.sel - 1} /><ComparePane label="현재 결과" vs={it.versions} start={it.sel} /></>);
}

/** AI 검수: 의견만 보여 주고 그림은 바꾸지 않는다. v 는 버전 또는 보관함 기록 { id, scene } */
export async function review(v: { id: string; scene?: Scene; review?: Review }, save = false) {
  U().toast('그림을 검수하는 중이에요…');
  const r = await Illust().review(v.id, v.scene, cur().chat); v.review = r;
  if (save && cur().chat) await chatApi().save();
  showReview(r);
}
export function showReview(r: Review) {
  openModal({ title: '이미지 검수', cls: 'col sb-review' }, () => <><p className="hint">AI 검수는 참고 의견입니다. 그림과 기존 버전을 자동으로 바꾸지 않아요.</p><p>{r.summary || '요약이 없어요.'}</p>
    {r.issues?.length ? <ul className="sb-warn">{r.issues.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="hint">눈에 띄는 문제를 찾지 못했어요.</p>}{r.created ? <small className="hint">{when(r.created)}</small> : null}</>);
}

// ════════ 삽화 한 자리 ════════
const editSlot = (m: Msg, it: Slot) => { const v = Illust().slot(it).versions[it.sel]; return compose(m, { initial: [v.scene as Scene], slot: it.slotId, config: { ...(v.config || {}), seed: v.seed ?? -1 } as GenConfig, preview: Illust().data(v.id) }); };
async function deleteSlot(sw: Swipe, it: Slot) {
  if (!(await U().confirmBox('이 삽화를 대화에서 지울까요? 이 자리의 이전 버전도 함께 빠지고, 그림은 갤러리에 남습니다.', '지우기', true))) return false;
  const i = sw.illust?.indexOf(it) ?? -1; if (i >= 0) sw.illust?.splice(i, 1);
  Illust().cancelWaiting(j => j.slot === it.slotId);
  await chatApi().save(); chatApi().redraw(); U().toast('대화에서 삽화를 지웠어요. 그림은 갤러리에 남아 있습니다.'); return true;
}
type Item = Exclude<MenuItem, '-' | null | false | undefined | '' | 0>;
export function slotMenu(m: Msg, sw: Swipe, it: Slot): MenuItem[] {
  const v: Partial<Version> = it.versions[it.sel] || {}, seed = v.seed;
  return [
    { label: '장면 편집 (인물 · 배치)', ic: 'sliders', onclick: guard(() => editSlot(m, it)) },
    seed != null && { label: '같은 시드로 생성', ic: 'refresh', onclick: guard(() => regen(m, it, seed)) },
    it.versions.length > 1 && { label: '버전 비교', ic: 'panel', onclick: () => compare(it) },
    { label: '생성 기록', ic: 'note', onclick: () => inspect(v) },
    { label: 'AI 검수', ic: 'search', onclick: guard(() => review(v as Version, true)) }, v.review && { label: '지난 검수 보기', ic: 'eye', onclick: () => showReview(v.review as Review) },
    seed != null && { label: '기본 시드로 저장', ic: 'dice', hint: String(seed), onclick: () => { Illust().saveCfg({ seed }); U().toast(`Seed ${seed} 을 기본값으로 저장했어요`); } },
    { label: '그림 저장', ic: 'import', onclick: guard(() => saveImage(Illust().data(it.id), it.title || 'illust')) },
    { label: '숨기기', ic: 'eyeoff', onclick: async () => { it.hidden = true; await chatApi().save(); chatApi().redraw(); } },
    '-',
    { label: '삽화 지우기', ic: 'trash', danger: true, onclick: guard(() => deleteSlot(sw, it)) },
  ];
}
export function slotViewer(m: Msg, sw: Swipe, it: Slot) {
  const v: Partial<Version> = it.versions[it.sel] || {};
  viewer({ title: it.title || '삽화', src: Illust().data(it.id), sub: [configLine(v.config), v.seed != null ? `Seed ${v.seed}` : ''].filter(Boolean).join(' · '),
    actions: [{ label: '수정', ic: 'edit', run: () => quickEdit(m, it) }, { label: '재생성', ic: 'refresh', run: () => regen(m, it, -1) }],
    more: slotMenu(m, sw, it).filter((a): a is Item => !!a && a !== '-' && a.label !== '그림 저장') });   // 삭제는 더 보기 안에 둔다
}

/** 장면 수정 창의 안쪽. hold.read 로 지금 적힌 내용을, hold.size 로 고른 화면 비율을 창 아래 단추가 읽는다 */
function QuickEdit({ m, chat, start, hold, check }: { m: Msg; chat: Chat; start: Scene; hold: { read: () => Scene; size: string }; check: () => void }) {
  const [draft, setDraft] = useState(start), [ask, setAsk] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(start.camera ?? ''), [prompt, setPrompt] = useState(start.prompt ?? ''), [cast, setCast] = useState(() => (start.characters ?? []).map(c => c.prompt ?? ''));
  const read = (): Scene => ({ ...draft, camera: camera.trim(), prompt: prompt.trim(), finalPrompt: false, characters: (draft.characters ?? []).map((c, i) => ({ ...c, prompt: cast[i] })) });
  hold.read = read;
  const rewrite = guard(async () => {
    const request = ask.trim(); if (!request) throw new Error('원하는 장면을 먼저 적어 주세요.');
    setStatus('AI 가 장면을 고쳐 쓰는 중…'); setBusy(true);
    try {
      check(); const next = { ...(await Illust().analyze(chat, cur().msgs as Msg[], m, null, { existing: [read()], direction: request, scope: 'all', manual: true }))[0] };
      setDraft(next); setCamera(next.camera ?? ''); setPrompt(next.prompt ?? ''); setCast((next.characters ?? []).map(c => c.prompt ?? '')); setStatus('고쳐 썼어요. 내용을 확인하고 재생성을 눌러 주세요.');
    } catch (e) { setStatus('고쳐 쓰지 못했어요. 아래 내용을 직접 고칠 수 있습니다.'); throw e; } finally { setBusy(false); }
  });
  return <>
    <p className="hint">바꿀 부분만 고친 뒤 다시 생성합니다. 이전 그림은 버전으로 남습니다.</p>
    <section className="sb-quick-assist"><Fld label="원하는 장면"><textarea className="inp" rows={2} placeholder="예: 둘이 껴안은 모습이 옆에서 보이게, 배경은 노을 진 옥상" value={ask} onChange={e => setAsk(e.target.value)} /></Fld>
      <div className="row"><p className="hint" role="status">{status}</p><span className="sb-grow" /><Btn label="AI 로 고쳐 쓰기" ic="sparkle" disabled={busy} onClick={rewrite} /></div></section>
    <div className="sb-chips" role="group" aria-label="구도 바로 고르기">{CAMERA_TAGS.map(([tag, label, group]) => { const on = hasCameraTag(camera, tag);
      return <button key={tag} type="button" className={'chip' + (on ? ' on' : '')} title={tag} data-tag={tag} data-group={group} aria-pressed={on} onClick={() => setCamera(toggleCameraTag(camera, tag))}>{label}</button>; })}</div>
    <Fld label="구도"><input className="inp" placeholder="예: from side, upper body" spellCheck={false} autoComplete="off" value={camera} onChange={e => setCamera(e.target.value)} /></Fld>
    <div className="sb-shape"><span className="field-label">화면 비율</span><Seg label="화면 비율" choices={[['', '그대로'], ...ORIENTATIONS.slice(1)]} value="" onChange={val => { hold.size = val; }} /></div>
    <Fld label="장면"><textarea className="inp" rows={4} spellCheck={false} value={prompt} onChange={e => setPrompt(e.target.value)} /></Fld>
    <div className="col sb-quick-people">{(draft.characters ?? []).map((c, i) => <Fld key={i} label={c.name || `인물 ${i + 1}`}><textarea className="inp" rows={3} spellCheck={false} value={cast[i] ?? ''} onChange={e => setCast(cast.map((x, n) => n === i ? e.target.value : x))} /></Fld>)}</div>
  </>;
}
/** 장면 수정: 그림을 가르는 몇 가지만 고쳐서 같은 자리에 다시 생성한다. 이전 그림은 버전으로 남는다 */
export function quickEdit(m: Msg, it: Slot) {
  const { chat } = cur(), sw = m.swipes[m.sw], v = Illust().slot(it).versions[it.sel]; if (!v) throw new Error('고칠 그림이 없어요.');
  const start: Scene = clone(v.scene || { characters: [] }), hold = { read: () => start, size: '' };
  const check = () => { mustBeOpen(m); if (!sw.illust?.includes(it)) throw new Error('대상 답변이 바뀌었어요. 그림을 다시 열어 주세요.'); };
  openModal({ title: '장면 수정', cls: 'col sb-quick', actions: [
    { label: '자세히 편집', ic: 'sliders', cls: 'ghost', onclick: () => { try { check(); const scene = hold.read(); compose(m, { initial: [scene], slot: it.slotId, config: { ...(v.config || {}), seed: v.seed ?? -1 } as GenConfig, preview: Illust().data(v.id) }).catch(e => U().toast(errText(e), 'err')); } catch (e) { U().toast(errText(e), 'err'); return false; } } },
    { label: '재생성', ic: 'refresh', cls: 'primary', onclick: () => { try { check(); const base = v.config || Illust().genConfig(); draw(m, [hold.read()], { ...base, seed: -1, ...(hold.size ? sizeFor(base, hold.size) : {}) }, it.slotId, true); } catch (e) { U().toast(errText(e), 'err'); return false; } } }] },
    () => <QuickEdit m={m} chat={chat as Chat} start={start} hold={hold} check={check} />);
}
