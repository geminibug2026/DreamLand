// 삽화 한 자리에서 여는 것들: 크게 보기 · 생성 기록 · 버전 비교 · AI 검수 · 더 보기 메뉴 · 장면 수정
import { useState } from 'react';
import { sceneLabel } from './tagrules';
import type { MenuItem } from '../ui';
import { Btn, Fld, Sel, Seg, openModal } from './parts';
import { CAMERA_TAGS, orientations, hasCameraTag, sizeFor, toggleCameraTag, cameraIssue } from './framing';
import { CameraWarn, PanelEditor } from './panels';
import { PAGE_FORMATS, pagesAllowed } from './comic';
import { FormatGlyph } from './glyph';
import { analyzeInto, compose, draw, regen } from './work';
import type { Chat, GenConfig, Msg, Review, Scene, Slot, Swipe, Version } from './types';
import { viewer, type ViewItem } from './viewer';

import { confirmBox, toast } from '../ui';
import { chatApi } from '../chat/actions';
import * as C from '../lib/core';
import { blankScene, clone, configLine, cur, errText, guard, mustBeOpen, saveImage, when } from './util';
import { Illust } from './illust';
import { t } from '../i18n';

// ════════ 크게 보기 · 생성 기록 · 버전 비교 ════════
export { viewer, type ViewAction, type ViewItem } from './viewer';
/** 대화에 붙은 삽화 칸이 다시 그리게 (큰 그림에서 버전을 넘겼을 때) — 자리 id → 다시 그리기 */
export const figRefresh = new Map<string, Set<() => void>>();
const refreshFig = (slotId: string) => figRefresh.get(slotId)?.forEach(f => f());
// 버전을 빠르게 넘길 때: 화면은 바로 바꾸고, 저장은 넘기기를 멈춘 뒤 한 번만 한다. 그 사이 다른 대화로 가도 원래 대화에 저장한다
let saveTimer = 0, pendingSave: (() => void) | null = null;
export function saveSoon() {
  const { chat, msgs } = cur(); if (!chat) return;
  clearTimeout(saveTimer);
  pendingSave = () => { pendingSave = null; if (cur().chat === chat) void chatApi.save(); else if (msgs && C.S.get('chats', chat.id)) void C.S.saveMsgs(chat, msgs); };
  saveTimer = window.setTimeout(() => pendingSave?.(), 700);
}
const flushSave = () => { clearTimeout(saveTimer); pendingSave?.(); };
addEventListener('pagehide', flushSave); document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
export function inspect(v: { scene?: Scene; config?: GenConfig | null; seed?: number | null; review?: Review; ts?: number }) {
  const data = { scene: v.scene, config: v.config, seed: v.seed, review: v.review };
  openModal({ title: t('scenebook.record'), wide: true, cls: 'col', actions: [{ label: t('scenebook.slot.download'), ic: 'import', onclick: () => { C.download('scenebook-image-record.json', JSON.stringify(data, null, 2)); return false; } }, { label: t('common.close'), cls: 'primary' }] },
    () => <><p className="hint">{[v.seed != null ? `Seed ${v.seed}` : '', configLine(v.config), when(v.ts)].filter(Boolean).join(' · ')}</p><pre className="regex-out sb-code">{JSON.stringify(data, null, 2)}</pre></>);
}
function ComparePane({ label, vs, start }: { label: string; vs: Version[]; start: number }) {
  const [i, setI] = useState(start), v = vs[i];
  return <section><Fld label={label}><Sel opts={vs.map((x, n) => [n, `${n + 1}${x.seed != null ? ` · Seed ${x.seed}` : ''}`])} value={start} onChange={n => setI(+n)} /></Fld><img src={Illust.url(v.id) || Illust.data(v.id)} alt={v.scene?.title || ''} /><p className="hint">{configLine(v.config)}</p></section>;
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
    { label: t('scenebook.slot.saveImage'), ic: 'import', onclick: guard(async () => saveImage(await Illust.dataOf(it.id), it.title || 'illust')) },
    { label: t('scenebook.slot.hide'), ic: 'eyeoff', onclick: async () => { it.hidden = true; await chatApi.save(); chatApi.redraw(); } },
    '-',
    { label: t('scenebook.slot.delete'), ic: 'trash', danger: true, onclick: guard(() => deleteSlot(sw, it)) },
  ];
}
export function slotViewer(m: Msg, sw: Swipe, it: Slot) {
  const S0 = Illust.slot(it);
  const item = (src: string): ViewItem => { const v: Partial<Version> = it.versions[it.sel] || {};
    return { title: withPreset(sceneLabel(it), v.preset),   // 제목은 직접 붙였을 때만 (자리표시 「삽화」 · 「장면 1」은 안 보인다)
      src, original: () => Illust.dataOf(it.id), sub: [S0.versions.length > 1 ? t('scenebook.view.version', { n: it.sel + 1, total: S0.versions.length }) : '', configLine(v.config), v.seed != null ? `Seed ${v.seed}` : ''].filter(Boolean).join(' · '),
      actions: [{ label: t('scenebook.slot.edit'), ic: 'edit', run: () => quickEdit(m, it) }, { label: t('scenebook.regen'), ic: 'refresh', run: () => regen(m, it, -1) }],
      more: slotMenu(m, sw, it).filter((a): a is Item => !!a && a !== '-' && a.label !== t('scenebook.slot.saveImage')) }; };   // 삭제는 더 보기 안에 둔다
  // 넘기면 같은 자리를 다시 그린 그림(버전)으로 바뀌고, 대화의 그림도 그 버전이 된다
  viewer(item(Illust.url(it.id) || Illust.data(it.id)), { count: S0.versions.length, index: it.sel, load: async i => {
    if (!sw.illust?.includes(it)) return null;
    Illust.select(it, i); refreshFig(it.slotId); saveSoon();
    return item(Illust.url(it.id) || Illust.data(it.id) || await Illust.dataOf(it.id));
  } });
}
/** 큰 그림 제목: 삽화 이름 · 그릴 때 쓴 프리셋 */
export const withPreset = (title: string, preset?: string) => [title, preset].filter(Boolean).join(' · ');

/** 장면 수정 창의 안쪽. hold.read 로 지금 적힌 내용을, hold.size 로 고른 화면 비율을 창 아래 단추가 읽는다 */
type QuickHold = { read: () => Scene; size: string; preset: string; seed: 'new' | 'same' };
function QuickEdit({ m, chat, start, hold, check, used, pic, seed }: { m: Msg; chat: Chat; start: Scene; hold: QuickHold; check: () => void; used?: string; pic: string; seed?: number | null }) {
  const [draft, setDraft] = useState(start), [ask, setAsk] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const presets = Illust.cfg().presets || [], active = Illust.activePreset()?.name, [preset, setPreset] = useState('');
  const [camera, setCamera] = useState(start.camera ?? ''), [prompt, setPrompt] = useState(start.prompt ?? ''), [cast, setCast] = useState(() => (start.characters ?? []).map(c => c.prompt ?? ''));
  // 만화 페이지 · 웹툰: 칸마다 글과 그 칸의 인물을 묶어 고친다 (같은 사람도 칸마다 따로). 다시 그리면 칸에서 새로 만든다
  const [page, setPage] = useState(() => start.page ? clone(start.page) : null), paged = !!page?.panels?.length;
  const read = (): Scene => ({ ...draft, camera: paged ? '' : camera.trim(), prompt: prompt.trim(), finalPrompt: false, characters: (draft.characters ?? []).map((c, i) => ({ ...c, prompt: cast[i] })), ...(paged ? { page: page! } : {}) });
  hold.read = read;
  const rewrite = guard(async () => {
    const request = ask.trim(); if (!request) throw new Error(t('scenebook.quick.askFirst'));
    setStatus(t('scenebook.quick.rewriting')); setBusy(true);
    try {
      check(); const next = { ...(await Illust.analyze(chat, cur().msgs as Msg[], m, null, { existing: [read()], direction: request, scope: 'all', manual: true }))[0] };
      setDraft(next); setCamera(next.camera ?? ''); setPrompt(next.prompt ?? ''); setCast((next.characters ?? []).map(c => c.prompt ?? '')); if (next.page) setPage(clone(next.page)); setStatus(t('scenebook.quick.rewritten'));
    } catch (e) { setStatus(t('scenebook.quick.rewriteFail')); throw e; } finally { setBusy(false); }
  });
  const lint = paged ? null : cameraIssue({ camera, prompt, characters: cast.map(p => ({ prompt: p })) });
  return <>
    {/* 고치는 그림을 옆에 두고 본다 */}
    <div className="sb-quick-top">{pic ? <img className="sb-quick-pic" src={pic} alt="" /> : null}<p className="hint">{t('scenebook.quick.hint')}</p></div>
    <section className="sb-quick-assist"><Fld label={t('scenebook.quick.ask')}><textarea className="inp" rows={2} placeholder={t('scenebook.quick.askPh')} value={ask} onChange={e => setAsk(e.target.value)} /></Fld>
      <div className="row"><p className="hint" role="status">{status}</p><span className="sb-grow" /><Btn label={t('scenebook.quick.rewrite')} ic="sparkle" disabled={busy} onClick={rewrite} /></div></section>
    {/* 구도: 이름 → 빠른 고르기 → 직접 쓰기 → 경고 순으로 한 묶음 */}
    {paged ? null : <div className="field sb-quick-cam">
      <span className="field-label">{t('scenebook.camera')}</span>
      <div className="sb-chips" role="group" aria-label={t('scenebook.quick.cameraPick')}>{CAMERA_TAGS.map(([tag, label, group]) => { const on = hasCameraTag(camera, tag);
        return <button key={tag} type="button" className={'chip' + (on ? ' on' : '')} title={tag} data-tag={tag} data-group={group} aria-pressed={on} onClick={() => setCamera(toggleCameraTag(camera, tag))}>{t(label)}</button>; })}</div>
      <input className="inp" aria-label={t('scenebook.camera')} placeholder={t('scenebook.quick.cameraPh')} spellCheck={false} autoComplete="off" value={camera} onChange={e => setCamera(e.target.value)} />
      {lint?.issue ? <CameraWarn issue={lint.issue} onFix={lint.fix ? () => setCamera(lint.fix) : undefined} /> : null}</div>}
    {presets.length ? <Fld label={t('scenebook.quick.preset')} hint={t('scenebook.quick.presetHint')}><Sel opts={[['', used ? t('scenebook.quick.presetKeepNamed', { name: used }) : t('scenebook.quick.presetKeep')], ...presets.map((p): [string, string] => [p.name, p.name + (p.name === active ? ` · ${t('scenebook.preset.active')}` : '')])]} value={preset} onChange={v => { setPreset(v); hold.preset = v; }} /></Fld> : null}
    {paged ? null : <div className="sb-shape"><span className="field-label">{t('scenebook.ratio')}</span><Seg label={t('scenebook.ratio')} choices={[['', t('scenebook.quick.keep')], ...orientations().slice(1)]} value="" onChange={val => { hold.size = val; }} /></div>}
    {/* 같은 시드는 구도를 되도록 그대로 두고 프롬프트를 바꾼 효과만 볼 때 */}
    {seed != null ? <div className="sb-shape"><span className="field-label">{t('scenebook.quick.seed')}</span><Seg label={t('scenebook.quick.seed')} choices={[['new', t('scenebook.quick.seedNew')], ['same', t('scenebook.quick.seedSame')]]} value="new" onChange={v => { hold.seed = v === 'same' ? 'same' : 'new'; }} /></div> : null}
    <Fld label={paged ? t('scenebook.page.shared') : t('scenebook.scene')} hint={paged ? t('scenebook.page.sharedHint') : null}><textarea className="inp" rows={paged ? 2 : 4} spellCheck={false} value={prompt} onChange={e => setPrompt(e.target.value)} /></Fld>
    {paged ? <PanelEditor page={page!} format={draft.pageFormat} onChange={setPage} />
      : <div className="col sb-quick-people">{(draft.characters ?? []).map((c, i) => <Fld key={i} label={c.name || t('scenebook.person.n', { n: i + 1 })}><textarea className="inp" rows={3} spellCheck={false} value={cast[i] ?? ''} onChange={e => setCast(cast.map((x, n) => n === i ? e.target.value : x))} /></Fld>)}</div>}
  </>;
}
/** 장면 수정: 그림을 가르는 몇 가지만 고쳐서 같은 자리에 다시 생성한다. 이전 그림은 버전으로 남는다 */
export function quickEdit(m: Msg, it: Slot) {
  const { chat } = cur(), sw = m.swipes[m.sw], v = Illust.slot(it).versions[it.sel]; if (!v) throw new Error(t('scenebook.quick.noImage'));
  const start: Scene = clone(v.scene || { characters: [] }), hold: QuickHold = { read: () => start, size: '', preset: '', seed: 'new' };
  const check = () => { mustBeOpen(m); if (!sw.illust?.includes(it)) throw new Error(t('scenebook.quick.changed')); };
  openModal({ title: t('scenebook.quick.title'), cls: 'col sb-quick', actions: [
    { label: t('scenebook.quick.detail'), ic: 'sliders', cls: 'ghost', onclick: () => { try { check(); const scene = hold.read(); compose(m, { initial: [scene], slot: it.slotId, config: { ...(v.config || {}), seed: v.seed ?? -1 } as GenConfig, preview: Illust.data(v.id) }).catch(e => toast(errText(e), 'err')); } catch (e) { toast(errText(e), 'err'); return false; } } },
    { label: t('scenebook.regen'), ic: 'refresh', cls: 'primary', onclick: () => { try { check(); const base = v.config || Illust.genConfig(); const p = hold.preset ? (Illust.cfg().presets || []).find(x => x.name === hold.preset) : null, cfg = { ...base, seed: hold.seed === 'same' && v.seed != null ? v.seed : -1, ...(hold.size ? sizeFor(base, hold.size) : {}) } as GenConfig; draw(m, [hold.read()], p ? Illust.withPreset(cfg, p) : cfg, it.slotId, true); } catch (e) { toast(errText(e), 'err'); return false; } } }] },
    () => <QuickEdit m={m} chat={chat as Chat} start={start} hold={hold} check={check} used={v.preset} pic={Illust.url(v.id) || Illust.data(v.id)} seed={v.seed} />);
}

/** 수동 생성: 고른 답변의 그림을 지금 만든다 (자동 삽화가 꺼져 있어도). 저장된 장면 · AI 가 장면 쓰기 · 직접 쓰기 가운데 고르고 화면 비율을 정한다 */
export function manualDialog(m: Msg) {
  const { chat } = cur(); if (!chat) throw new Error(t('scenebook.err.openChatFirst'));
  if (m.role !== 'assistant') throw new Error(t('scenebook.err.notReply'));
  mustBeOpen(m);
  // 그림 형식은 이 답변에만 (설정은 그대로). 칸이 든 형식은 V5 에서만 고를 수 있다
  const c = Illust.cfg(), pages = pagesAllowed(c), sw = m.swipes[m.sw], saved = sw.illustDraft?.length || 0, st: ManualState = { src: saved ? 'saved' : 'ai', size: '', text: '', busy: false, format: pages && c.pageFormat ? String(c.pageFormat) : 'single', pages };
  const scenesNow = async (): Promise<{ scenes: Scene[]; config: GenConfig | null }> => {
    mustBeOpen(m);
    if (st.src === 'saved') return { scenes: (sw.illustDraft || []) as Scene[], config: (sw.illustDraftConfig as GenConfig) || null };
    if (st.src === 'ai') return { scenes: await analyzeInto(m, pages ? st.format : undefined), config: (sw.illustDraftConfig as GenConfig) || null };   // 뽑은 장면은 초안으로도 남는다
    const p = st.text.trim(); if (!p) throw new Error(t('scenebook.manualDlg.needText'));
    return { scenes: [Illust.compileScene(chat as Chat, { ...blankScene(), prompt: p }) as Scene], config: null };
  };
  const go = async (edit: boolean) => {
    const { scenes, config } = await scenesNow(); if (!scenes.length) throw new Error(t('scenebook.manualDlg.noScene'));
    // 화면 비율을 골랐으면 장면이 적어 둔 비율 대신 그것을 쓴다
    const base = Illust.genConfig(config), cfg = st.size ? { ...base, ...sizeFor(base, st.size) } as GenConfig : config, list = st.size ? scenes.map(sc => ({ ...sc, size: '' })) as Scene[] : scenes;
    if (edit) { await compose(m, { initial: list, config: cfg }); return; }
    draw(m, list, cfg);
    if (st.src !== 'write') { sw.illustDraft = []; delete sw.illustDraftConfig; await chatApi.save(); }
  };
  const act = (edit: boolean) => async () => { if (st.busy) return false; st.busy = true; try { await go(edit); } catch (e) { toast(errText(e), 'err'); return false; } finally { st.busy = false; } };
  openModal({ title: t('scenebook.manualDlg.title'), cls: 'col sb-manual', actions: [
    { label: t('scenebook.compose'), ic: 'sliders', cls: 'ghost', onclick: act(true) },
    { label: t('scenebook.draw'), ic: 'image', cls: 'primary', onclick: act(false) }] },
    () => <ManualBody st={st} saved={saved} />);
}
type ManualState = { src: string; size: string; text: string; busy: boolean; format: string; pages: boolean };
function ManualBody({ st, saved }: { st: ManualState; saved: number }) {
  const [, bump] = useState(0), re = () => bump(n => n + 1), paged = st.src === 'ai' && st.format !== 'single';
  return <>
    <p className="hint">{t('scenebook.manualDlg.intro')}</p>
    <div className="field"><span className="field-label">{t('scenebook.manualDlg.source')}</span><Seg label={t('scenebook.manualDlg.source')} choices={[...(saved ? [['saved', t('scenebook.manualDlg.saved', { n: saved })] as [string, string]] : []), ['ai', t('scenebook.manualDlg.ai')], ['write', t('scenebook.manualDlg.write')]]} value={st.src} onChange={v => { st.src = v; re(); }} /><small className="hint">{t('scenebook.manualDlg.help.' + st.src)}</small></div>
    {st.src === 'ai' && st.pages ? <div className="field"><span className="field-label">{t('scenebook.manualDlg.format')}</span>
      <div className="sb-formats" role="radiogroup" aria-label={t('scenebook.manualDlg.format')}>{PAGE_FORMATS.map(id => <button key={id} type="button" role="radio" aria-checked={id === st.format} className={'sb-format' + (id === st.format ? ' on' : '')} title={t('scenebook.page.fmtHelp.' + id)} onClick={() => { st.format = id; re(); }}><FormatGlyph id={id} /><span>{t('scenebook.page.fmt.' + id)}</span></button>)}</div>
      <small className="hint">{t('scenebook.manualDlg.formatHint')}</small></div> : null}
    {st.src === 'write' ? <Fld label={t('scenebook.scene')}><textarea className="inp" rows={4} spellCheck={false} defaultValue={st.text} placeholder={t('scenebook.manualDlg.writePh')} onChange={e => { st.text = e.target.value; }} /></Fld> : null}
    {paged ? null : <div className="field"><span className="field-label">{t('scenebook.manualDlg.size')}</span><Seg label={t('scenebook.manualDlg.size')} choices={[['', t('scenebook.manualDlg.sizeAuto')], ...orientations().filter(([id]) => id)]} value={st.size} onChange={v => { st.size = v; re(); }} /></div>}
  </>;
}
