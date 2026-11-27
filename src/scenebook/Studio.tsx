// ════════ 스튜디오 ════════ 기능 › 삽화: 연결 · 자동 처리 + 생성 · 인물 · 참조 · 갤러리 · 작업 탭, 대화 옆 패널
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../kit';
import { Form, type FieldDef, choiceBox, confirmBox, menu, toast } from '../ui';
import { Area, Btn, Chk, Empty, Fld, Group, IBtn, Sel, Seg, Text, openGroups, openModal, useBump } from './parts';
import { CUT_LAYOUTS, PAGE_FORMATS, PANEL_COUNTS, SCENE_COUNTS, pagesAllowed } from './comic';
import { FormatGlyph } from './glyph';
import { Frames, frameChoices, frameLayout, validFrame } from './frames';
import { FrameArt } from './frameArt';
import { LOOKS } from './framing';
import { prepareReference } from './refimg';
import { shelf, type Card } from './shelf';
import { UC_PRESETS, mergeTags, sceneLabel } from './tagrules';
import { INKS } from './ornaments';
import { fixModel } from './Composer';
import { guide, imageImport, promptEditor, showPlans, exportChat } from './dialogs';
import { inspect, review, showReview, viewer, withPreset, type ViewItem } from './slot';
import { compose, draw, flow, generateDrafts, pendingDrafts } from './work';
import type { Asset, Chat, GenConfig, HistoryEntry, IllustCfg, Job, LibPerson, Msg, RefUse, Visual } from './types';

import { go } from '../lib/router';
import { chatApi } from '../chat/actions';
import * as IL from '../lib/illust';
import * as C from '../lib/core';
import { dataToBlob } from '../lib/blobUrl';
import { blankScene, clone, configLine, cur, errText, guard, lastReply, pickKeys, when } from './util';
import { Illust } from './illust';
import { locale, t, tn } from '../i18n';

type TabId = 'gen' | 'cast' | 'refs' | 'gallery' | 'queue';
let studioTab: TabId = 'gen', castScope: string | null = null;
const GEN_EXTRA = ['naiKey', 'maxScenes', 'every', 'contextMessages', 'analysisMode', 'placement', 'displayWidth', 'compact', 'autoSize', 'look', 'leanPrompt', 'frame', 'frameWide', 'frameInk', 'analysisTokens', 'pageFormat', 'panelCount', 'speechBubbles', 'cutLayout', 'imageTools'];
const TIERS = ['Paper', 'Tablet', 'Scroll', 'Opus'];
const tierName = (t?: number | null) => t != null ? (TIERS[t] || t) : null;
const queueText = () => { const I = Illust, w = I.queue().filter(x => x.state === 'waiting').length; return I.queueRunning() && I.queue().some(x => x.state === 'running') ? t('scenebook.studio.q.drawing') + (w ? t('scenebook.studio.q.waitSuffix', { n: w }) : '') : I.queuePaused() ? t('scenebook.studio.q.paused') + (w ? t('scenebook.studio.q.waitSuffix', { n: w }) : '') : w ? t('scenebook.studio.q.wait', { n: w }) : ''; };
const statusText = () => queueText() || flow.note || t('scenebook.studio.autoSaveNote');
const active = (x: Job) => x.state === 'waiting' || x.state === 'running';

/** 액자의 선 장식 · 가져온 액자 그림 (그림 뒤에 놓는다) */
export { FrameArt };

function connHelp() {
  openModal({ title: t('scenebook.studio.connHelp'), cls: 'col' }, () => <><p>{t('scenebook.studio.connHelp.intro')}</p><ol className="sb-help-steps">
    <li>{t('scenebook.studio.connHelp.step1')}</li>
    <li>{t('scenebook.studio.connHelp.step2')}</li>
    <li>{t('scenebook.studio.connHelp.step3')}</li></ol>
    <p className="hint">{t('scenebook.studio.connHelp.other')}</p></>);
}
function ConnBar() {
  const c = Illust.cfg(), { BACKENDS } = IL, nai = c.backend === 'nai', alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const [st, setSt] = useState<[string, string]>(() => {
    if (nai) return [c.naiKey ? t('scenebook.studio.conn.keySaved') : t('scenebook.studio.conn.needKey'), c.naiKey ? 'ready' : 'warn'];
    if (c.backend === 'a1111') return [`Stable Diffusion WebUI · ${c.a1111 || 'http://127.0.0.1:7860'}`, 'ready'];
    const conn = C.S.get('conns', c.connId); return [conn ? `${BACKENDS[c.backend]} · ${conn.name}${c.imgModel ? ' · ' + c.imgModel : ''}` : t('scenebook.studio.conn.pickConn', { backend: BACKENDS[c.backend] }), conn ? 'ready' : 'warn'];
  });
  const set = (s: string, state = '') => { if (alive.current) setSt([s, state]); };
  const check = async () => { set(t('scenebook.studio.conn.checking')); try { const a = await Illust.account(); set(`NovelAI · ${a.active ? t('scenebook.studio.subActive') : t('scenebook.studio.subInactive')}${a.tier != null ? ` · ${tierName(a.tier)}` : ''}${a.anlas != null ? ` · Anlas ${a.anlas.toLocaleString()}` : ''}`, a.active ? 'ready' : 'warn'); } catch (e) { set(errText(e), 'warn'); } };
  return <div className="sb-conn" data-state={st[1]}><span className="sb-conn-label">{st[0]}</span>
    {nai ? <Btn label={t('scenebook.studio.check')} ic="refresh" cls="ghost" onClick={() => void check()} /> : null}{nai ? <Btn label={t('scenebook.studio.connHelp')} ic="plug" cls="ghost" onClick={connHelp} /> : null}<Btn label={t('scenebook.guide')} ic="note" cls="ghost" onClick={guide} /></div>;
}
// 장면을 답변 끝에 같이 쓰면 답이 길어진다: 잘리지 않게 권하는 최대 응답 길이와, 그만큼 떼어 줘도 대화가 들어갈 자리
const REPLY_ADVICE = 40000, CHAT_ROOM = 16000;
const replyPreset = () => { const chat = cur().chat; return chat ? C.S.presetFor(chat as never) : C.S.preset(); };
function Workflow({ redraw, toWriter }: { redraw: () => void; toWriter: () => void }) {
  const c = Illust.cfg(), on = c.automatic !== 'off', call = c.mode === 'call', n = REPLY_ADVICE.toLocaleString();
  const help = !on ? t('scenebook.studio.wf.offHelp') : `${c.automatic === 'review' ? t('scenebook.studio.wf.draftOnly') : t('scenebook.studio.wf.drawAttach')} · ${c.every > 1 ? tn('scenebook.studio.wf.everyN', c.every) : t('scenebook.studio.wf.everyReply')}`;
  const p = on && !call ? replyPreset() : null, now = Number(p?.params?.maxTokens) || 0;
  const helperName = () => { const id = (C.S.settings as { helpers?: Record<string, string> }).helpers?.illust, x = id ? C.chatConns().find(k => k.id === id) : null; return x ? x.name : t('scenebook.studio.chatConn'); };
  const setReply = guard(async () => {
    const pr = replyPreset(), ctx = Number(pr.params.contextSize) || 128000;
    if (ctx < REPLY_ADVICE + CHAT_ROOM) throw new Error(t('scenebook.studio.wf.replyNoRoom', { preset: pr.name, ctx: ctx.toLocaleString(), n }));
    await C.S.save('presets', { ...pr, params: { ...pr.params, maxTokens: REPLY_ADVICE }, updatedAt: Date.now() });
    toast(t('scenebook.studio.wf.replyDone', { preset: pr.name, n })); redraw();
  });
  return <section className="sb-workflow">
    <div className="sb-wf-row"><Fld label={t('scenebook.studio.automatic')}><Sel opts={[['off', t('scenebook.studio.auto.off')], ['review', t('scenebook.studio.auto.review')], ['generate', t('scenebook.studio.auto.generate')]]} value={c.automatic} onChange={v => { Illust.saveCfg({ automatic: v as IllustCfg['automatic'] }); redraw(); }} /></Fld>
      <Btn label={t('scenebook.prompt')} ic="edit" cls="ghost" title={t('scenebook.studio.wf.promptTitle')} onClick={() => promptEditor(2)} /></div>
    {/* 장면 쓰는 곳: 답변에 함께(요청 그대로) · 답변 후 보조 모델(요청 +1). 고른 쪽의 장단점을 바로 아래에 */}
    {on ? <div className="sb-wf-src"><span className="field-label">{t('scenebook.studio.wf.method')}</span>
      <div className="sb-wf-tiles" role="radiogroup" aria-label={t('scenebook.studio.wf.method')}>{(['plan', 'call'] as const).map(id => { const sel = (id === 'call') === call, k = id === 'call' ? 'Call' : 'Plan';
        return <button key={id} type="button" role="radio" aria-checked={sel} className={'sb-wf-tile' + (sel ? ' on' : '')} onClick={() => { if (!sel) { Illust.saveCfg({ mode: id }); redraw(); } }}><b>{t('scenebook.studio.wf.method' + k)}</b><small>{t('scenebook.studio.wf.method' + k + 'Sub')}</small></button>; })}</div>
      <p className="hint">{call ? t('scenebook.studio.wf.callHelp') : t('scenebook.studio.wf.planHelp')}</p>
      {call ? <div className="sb-wf-line"><span>{t('scenebook.studio.wf.helperLine', { conn: helperName(), tokens: Illust.analysisTokens(c).toLocaleString() })}</span><button type="button" className="btn" onClick={toWriter}>{t('scenebook.studio.wf.helperEdit')}</button></div>
        : p && now < REPLY_ADVICE ? <div className="sb-wf-line sb-wf-advice"><span>{t('scenebook.studio.wf.replyAdvice', { n, preset: p.name, now: now ? now.toLocaleString() : '-' })}</span><button type="button" className="btn" onClick={setReply}>{t('scenebook.studio.wf.replySet', { n })}</button></div> : null}
    </div> : null}
    <p className="hint">{help}</p><p className="hint sb-wf-status" role="status">{statusText()}</p>
  </section>;
}

// ════════ 생성 탭 ════════
function GenPage({ reopen }: { reopen: () => void }) {
  const bump = useBump(), S = C.S, { MODELS, BACKENDS, SAMPLERS, SCHEDULERS, RENDER_KEYS } = IL, GEN_KEYS = [...RENDER_KEYS, ...GEN_EXTRA];
  const [box] = useState(() => {
    const c = Illust.cfg(), d = clone(Object.fromEntries(GEN_KEYS.map(k => [k, c[k]]))) as IllustCfg;
    if (!validFrame(d.frame)) d.frame = 'soft'; if (d.frameWide && !validFrame(d.frameWide)) d.frameWide = '';
    return { d, base: clone(d), saved: false, shape: d.backend + d.model };
  });
  const d = box.d, c = Illust.cfg(), nai = d.backend === 'nai', api = d.backend === 'openai' || d.backend === 'gemini', sd = d.backend === 'a1111', v5 = MODELS[d.model]?.family === 5;
  const verify = (): [string, boolean] => {
    try {
      Illust.validate(Illust.genConfig(d));
      for (const [k, a, b, n] of [['maxScenes', 1, 6, t('scenebook.studio.v.maxScenes')], ['every', 1, 20, t('scenebook.studio.v.every')], ['contextMessages', 0, 30, t('scenebook.studio.v.context')], ['displayWidth', 240, 1200, t('scenebook.studio.v.width')]] as [string, number, number, string][]) { const v = d[k]; if (!Number.isInteger(v) || (v as number) < a || (v as number) > b) throw new Error(t('scenebook.studio.v.intRange', { name: n, min: a, max: b })); }
      { const v = Number(d.analysisTokens) || 0; if (v && (!Number.isInteger(v) || v < 1000 || v > 128000)) throw new Error(t('scenebook.studio.v.intRange', { name: t('scenebook.studio.alenTokens'), min: 1000, max: 128000 })); }
      return [box.saved ? t('scenebook.studio.saved') : t('scenebook.studio.autoSaveHint'), false];
    } catch (e) { return [t('scenebook.studio.needCheck', { error: errText(e) }), true]; }
  };
  const save = () => {   // 이 화면에서 바꾼 항목만 저장한다 (다른 곳에서 바꾼 값을 덮어쓰지 않게)
    fixModel(d); box.saved = true; const patch = Object.fromEntries(GEN_KEYS.filter(k => JSON.stringify(d[k]) !== JSON.stringify(box.base[k])).map(k => [k, d[k]])); box.base = clone(d);
    if (Object.keys(patch).length) Illust.saveCfg(patch); bump(); if (d.backend + d.model !== box.shape) { box.shape = d.backend + d.model; reopen(); }
  };
  const [state, bad] = verify();
  const f = (defs: (FieldDef | false | undefined)[]) => <Form obj={d} defs={defs} onChange={save} />, conns: [string, string][] = [['', t('scenebook.studio.pick')], ...C.chatConns().map((x): [string, string] => [x.id, x.name])];
  // 크기: 이름 위 · 픽셀 아래 두 줄의 같은 칸 셋 (휴대폰에서도 글자가 칸 밖으로 넘치지 않게)
  const sizes = <div className="sb-sizes" role="radiogroup" aria-label={t('scenebook.studio.sizePick')}>{([[t('scenebook.orient.portrait'), 832, 1216], [t('scenebook.orient.square'), 1024, 1024], [t('scenebook.orient.landscape'), 1216, 832]] as [string, number, number][]).map(([l, w, hh]) => { const on = d.width === w && d.height === hh;
    return <button key={l} type="button" role="radio" aria-checked={on} className={'sb-size' + (on ? ' on' : '')} onClick={() => { d.width = w; d.height = hh; save(); reopen(); }}><span className="sb-size-shape" style={{ aspectRatio: `${w} / ${hh}` }} /><b>{l}</b><small>{`${w}×${hh}`}</small></button>; })}</div>;
  // 그림 형식: 삽화 · 웹툰 컷 · 만화 페이지. 칸이 든 그림(웹툰 컷 · 만화)은 NovelAI V5 에서만. 최대 장 수는 형식 바로 아래
  const v5ok = pagesAllowed(d), fmt = v5ok && PAGE_FORMATS.includes(d.pageFormat as never) ? String(d.pageFormat) : 'single', cuts = fmt === 'cuts', page = !['single', 'cuts'].includes(fmt);
  const pickFormat = (id: string) => { if (id === fmt) return; if (id === 'cuts' && (d.maxScenes || 1) < 2) d.maxScenes = 4; d.pageFormat = id; save(); };   // 웹툰 컷을 처음 고를 때 한 장이면 네 장으로
  const formatBox = <>
    <div className="sb-formats" role="radiogroup" aria-label={t('scenebook.page.format')}>{PAGE_FORMATS.map(id => { const on = id === fmt, off = !v5ok && id !== 'single';
      return <button key={id} type="button" role="radio" aria-checked={on} disabled={off} className={'sb-format' + (on ? ' on' : '')} title={t('scenebook.page.fmtHelp.' + id)} onClick={() => pickFormat(id)}><FormatGlyph id={id} /><span>{t('scenebook.page.fmt.' + id)}</span></button>; })}</div>
    <p className="hint sb-format-help">{t('scenebook.page.fmtHelp.' + fmt)}{!v5ok ? ` ${t('scenebook.page.needV5')}` : ''}</p>
    <div className="sb-shape"><span className="field-label">{t(page ? 'scenebook.page.maxPages' : cuts ? 'scenebook.page.maxStrips' : 'scenebook.page.maxScenes')}</span><Seg key={`n${d.maxScenes}`} label={t('scenebook.page.maxScenes')} choices={SCENE_COUNTS.map(n => [String(n), String(n)])} value={String(d.maxScenes || 1)} onChange={v => { d.maxScenes = +v; save(); }} /></div>
    <small className="hint">{t(cuts ? 'scenebook.page.maxStripsHint' : 'scenebook.page.maxHint')}</small>
    {page || cuts ? <div className="sb-shape"><span className="field-label">{t('scenebook.page.panels')}</span><Seg label={t('scenebook.page.panels')} choices={PANEL_COUNTS.map(n => [String(n), n ? t('scenebook.page.panelsN', { n }) : t('scenebook.page.panelsAuto')])} value={String(d.panelCount || 0)} onChange={v => { d.panelCount = +v; save(); }} /></div> : null}
    {cuts ? <><div className="sb-shape"><span className="field-label">{t('scenebook.page.layout')}</span><Seg label={t('scenebook.page.layout')} choices={CUT_LAYOUTS.map(id => [id, t('scenebook.page.layout.' + id)])} value={d.cutLayout === 'stack' ? 'stack' : 'story'} onChange={v => { d.cutLayout = v; save(); }} /></div>
      <small className="hint">{t('scenebook.page.layoutHint.' + (d.cutLayout === 'stack' ? 'stack' : 'story'))}</small></> : null}
    {page || cuts ? <><Chk label={t('scenebook.page.bubbles')} checked={!!d.speechBubbles} onChange={v => { d.speechBubbles = v; save(); }} /><small className="hint">{t('scenebook.page.bubblesHint')}</small></> : null}
  </>;
  const customFrames = Frames.list(), presetName = useRef<HTMLInputElement>(null);
  const addFrame = guard(async () => { const [file] = await C.pickFiles({ accept: 'image/png,image/webp' }); if (!file) return; const rec = await Frames.add(file); Illust.saveCfg({ frame: `image:${rec.id}` }); toast(t('scenebook.studio.frame.added'), 'ok'); reopen(); });
  const frameMenu = (anchor: Element) => menu(anchor, customFrames.map(fr => ({ label: t('scenebook.studio.deleteNamed', { name: fr.name }), ic: 'trash', onclick: guard(async () => {
    if (!(await confirmBox(t('scenebook.studio.frame.deleteAsk', { name: fr.name }), t('scenebook.delete'), true))) return;
    const now0 = Illust.cfg(), id = `image:${fr.id}`; await Frames.remove(fr.id); Illust.saveCfg({ frame: now0.frame === id ? 'soft' : now0.frame, frameWide: now0.frameWide === id ? '' : now0.frameWide }); reopen(); }) })));
  const history = () => { const list = Illust.cfg().history || [];
    openModal({ title: t('scenebook.studio.history'), cls: 'col' }, m => !list.length ? <Empty>{t('scenebook.studio.history.empty')}</Empty> : list.map((e: HistoryEntry, i) => <div className="sb-preset" key={i}><b>{`${when(e.time)} · ${e.reason}`}</b><small>{configLine(e.settings)}</small><Btn label={t('scenebook.undo')} cls="ghost" onClick={() => { const { history: _h, ...rest } = e.settings; Illust.saveCfg(rest, { reason: t('scenebook.studio.reason.beforeRevert'), force: true }); m.close(); reopen(); toast(t('scenebook.studio.history.reverted'), 'ok'); }} /></div>)); };
  const exportAll = () => { const { naiKey: _k, history: _h, ...rest } = Illust.cfg(); C.download('scenebook-settings.json', JSON.stringify({ kind: 'dreamland-illust', schema: 1, settings: rest }, null, 2)); };
  const importAll = guard(async () => {
    const [file] = await C.pickFiles({ accept: '.json,application/json' }); if (!file) return; if (file.size > 1000000) throw new Error(t('scenebook.studio.import.pickFile'));
    const v = JSON.parse(await file.text()) as { schema?: number; kind?: string; settings?: Record<string, unknown> } | null; if (v?.schema !== 1 || !v.settings || typeof v.settings !== 'object') throw new Error(t('scenebook.studio.import.notFile'));
    const s: Record<string, unknown> = { ...v.settings }; if (s.injectionPrompt !== undefined && s.planPrompt === undefined) s.planPrompt = s.injectionPrompt;   // 예전 형식의 설정 파일도 받는다
    if (!v.kind) { delete s.references; delete s.characterVisuals; s.presets = ((s.presets || []) as { name: string; config?: object }[]).map(p => ({ name: p.name, config: { ...pickKeys(p.config || {}, RENDER_KEYS), references: [] } })); if (s.promptInjection !== undefined) s.mode = 'plan'; }
    const known = Object.keys(Illust.cfg()).filter(k => !['naiKey', 'history', 'auto'].includes(k));
    Illust.saveCfg({ ...pickKeys(s, known), automatic: 'off' }, { reason: t('scenebook.studio.reason.beforeImport'), force: true }); reopen(); toast(t('scenebook.studio.import.done'), 'ok');
  });
  const savePreset = guard(() => { const name = presetName.current?.value.trim(); if (!name) throw new Error(t('scenebook.studio.preset.needName')); const list = Illust.cfg().presets || []; if (list.some(p => p.name === name)) throw new Error(t('scenebook.studio.preset.dup')); if (list.length >= 30) throw new Error(t('scenebook.studio.preset.max')); Illust.saveCfg({ presets: [...list, { name, config: pickKeys(Illust.cfg(), RENDER_KEYS) as GenConfig }] }); reopen(); });
  const presets = c.presets || [], active = Illust.activePreset()?.name || '';
  const applyPreset = (p: { name: string; config: object }) => { Illust.saveCfg(pickKeys(p.config, RENDER_KEYS), { reason: t('scenebook.studio.reason.beforePreset', { name: p.name }), force: true }); toast(t('scenebook.studio.preset.applied', { name: p.name }), 'ok'); reopen(); };
  return <div className="sb-gen">
    {/* 그림체 프리셋 빠른 선택: 맨 위에서 바로 고른다. 지금 설정과 같은 프리셋에는 '적용 중' */}
    <section className="sb-quickpreset"><Fld label={t('scenebook.studio.preset.quick')}>{presets.length
      ? <Sel opts={[...(active ? [] : [['', t('scenebook.studio.preset.custom')] as [string, string]]), ...presets.map((p): [string, string] => [p.name, p.name + (p.name === active ? ` · ${t('scenebook.preset.active')}` : '')])]} value={active} onChange={name => { const p = presets.find(x => x.name === name); if (p) applyPreset(p); }} />
      : <small className="hint">{t('scenebook.studio.preset.quickEmpty')}</small>}</Fld></section>
    <Group title={t('scenebook.studio.g.image')} id="image">{f([
      { k: 'backend', label: t('scenebook.studio.backend'), type: 'select', opts: Object.entries(BACKENDS), half: true, live: true },
      nai && { k: 'model', label: t('scenebook.gen.model'), type: 'select', opts: Object.entries(MODELS).map(([id, m]): [string, string] => [id, m.label]), half: true, live: true },
      nai && { k: 'naiKey', label: t('scenebook.studio.naiKey'), type: 'password', hint: t('scenebook.studio.naiKeyHint') },
      api && { k: 'connId', label: t('scenebook.studio.connId'), type: 'select', opts: conns, half: true }, api && { k: 'imgModel', label: t('scenebook.studio.imgModel'), ph: d.backend === 'gemini' ? 'gemini-3.1-flash-image' : 'gpt-image-1', half: true },
      sd && { k: 'a1111', label: t('scenebook.studio.a1111'), half: true },
      { k: 'width', label: t('scenebook.gen.width'), type: 'num', min: 64, max: 4096, step: 64, half: true }, { k: 'height', label: t('scenebook.gen.height'), type: 'num', min: 64, max: 4096, step: 64, half: true }, { el: sizes },
      { k: 'autoSize', label: t('scenebook.studio.autoSize'), type: 'check', hint: t('scenebook.studio.autoSizeHint') },
      (nai || sd) && { k: 'steps', label: 'Steps', type: 'num', min: 1, max: 150, step: 1, half: true }, (nai || sd) && { k: 'scale', label: 'Guidance', type: 'num', min: 0, max: 30, step: 0.1, half: true },
      { k: 'look', label: t('scenebook.studio.look'), type: 'select', opts: LOOKS.map(([id, label]): [string, string] => [id, t(label)]), hint: t('scenebook.studio.lookHint') }])}</Group>
    <Group title={t('scenebook.page.format')} id="format">{formatBox}</Group>
    <Group title={t('scenebook.prompt')}>{f([{ k: 'style', label: t('scenebook.studio.styleLabel'), type: 'area', rows: 3, ph: 'watercolor, soft lighting …' }, { k: 'negative', label: t('scenebook.uc'), type: 'area', rows: 2 }, { k: 'quality', label: t('scenebook.qualityAuto'), type: 'check' },
      { k: 'leanPrompt', label: t('scenebook.studio.lean'), type: 'check', hint: t('scenebook.studio.leanHint') }])}
      <div className="row wrap">{UC_PRESETS.map(([id, text]) => <Btn key={id} label={t('scenebook.studio.uc.' + id)} ic="plus" cls="ghost" title={t('scenebook.studio.uc.hint')} onClick={() => { Illust.saveCfg({ negative: mergeTags(text, String(Illust.cfg().negative || '')) }); reopen(); }} />)}</div>
      <div className="row"><Btn label={t('scenebook.studio.editShare')} ic="edit" cls="ghost" onClick={() => promptEditor(0, reopen)} /><small className="hint">{t('scenebook.studio.editShareHint')}</small></div></Group>
    <Group title={t('scenebook.studio.g.writer')} id="writer"><Form obj={S.settings} defs={[{ k: 'helpers.illust', label: t('scenebook.guide.topic.conn.title'), type: 'select', opts: [['', t('scenebook.studio.chatConn')], ...C.chatConns().map((x): [string, string] => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`])], hint: t('scenebook.studio.analysisConnHint') }]} onChange={() => S.set({})} />
      {f([{ k: 'analysisMode', label: t('scenebook.guide.topic.analysis.title'), type: 'select', opts: [['quick', t('scenebook.studio.quick')], ['precise', t('scenebook.studio.precise')]], half: true }, { k: 'contextMessages', label: t('scenebook.guide.topic.context.title'), type: 'num', min: 0, max: 30, step: 1, half: true }])}
      {/* 장면 쓰기 답 길이: 자동(장면 수에 맞춤) 또는 직접. 생각하는 AI 가 길이를 생각에 다 써서 빈 답이 오면 늘린다 */}
      <div className="sb-alen"><Fld label={t('scenebook.studio.alen')} hint={t('scenebook.studio.alenHint')}><Sel opts={[['auto', t('scenebook.studio.alenAuto', { n: Illust.analysisTokens({ ...c, ...d, analysisTokens: 0 }).toLocaleString() })], ['manual', t('scenebook.studio.alenManual')]]} value={Number(d.analysisTokens) >= 1000 ? 'manual' : 'auto'} onChange={v => { d.analysisTokens = v === 'manual' ? 16000 : 0; save(); }} /></Fld>
        {Number(d.analysisTokens) >= 1000 ? f([{ k: 'analysisTokens', label: t('scenebook.studio.alenTokens'), type: 'num', min: 1000, max: 128000, step: 1000, half: true }]) : null}</div>
      <div className="row"><Btn label={t('scenebook.studio.analyzeLast')} ic="sparkle" onClick={guard(() => compose(lastReply(), { manual: false }))} /><small className="hint">{t('scenebook.studio.analyzeLastHint')}</small></div></Group>
    <Group title={t('scenebook.studio.g.limits')}>{f([{ k: 'every', label: t('scenebook.studio.v.every'), type: 'num', min: 1, max: 20, step: 1, half: true }])}
      <small className="hint">{tn('scenebook.studio.usage', Illust.usage())}</small></Group>
    <Group title={t('scenebook.studio.g.advanced')}>{f([
      nai && { k: 'sampler', label: t('scenebook.gen.sampler'), type: 'select', opts: SAMPLERS, half: true }, nai && { k: 'scheduler', label: v5 ? t('scenebook.studio.schedulerV5') : t('scenebook.gen.scheduler'), type: 'select', opts: v5 ? ['karras'] : SCHEDULERS, half: true },
      sd && { k: 'sdSampler', label: t('scenebook.gen.sampler'), ph: 'Euler a', half: true },
      (nai || sd) && { k: 'seed', label: 'Seed', type: 'num', min: -1, max: 4294967295, step: 1, half: true, hint: t('scenebook.gen.seedHint') }, nai && { k: 'cfgRescale', label: 'CFG rescale', type: 'num', min: 0, max: 1, step: 0.05, half: true },
      { k: 'useCoords', label: t('scenebook.studio.useCoords'), type: 'check' }, { k: 'useOrder', label: t('scenebook.useOrder'), type: 'check' },
      nai && v5 && { k: 'transparent', label: t('scenebook.gen.transparent'), type: 'check' },
      nai && { k: 'budgetGuard', label: t('scenebook.gen.budget'), type: 'check', hint: t('scenebook.studio.budgetHint') }])}</Group>
    <Group title={t('scenebook.studio.g.display')}>{f([{ k: 'placement', label: t('scenebook.anchor'), type: 'select', opts: [['end', t('scenebook.para.end')], ['inline', t('scenebook.studio.inline')], ['auto', t('scenebook.studio.placeAuto')]], half: true, hint: t('scenebook.studio.placeHint') }, { k: 'displayWidth', label: t('scenebook.studio.widthPx'), type: 'num', min: 240, max: 1200, step: 10, half: true }, { k: 'compact', label: t('scenebook.studio.compact'), type: 'check' },
      { k: 'imageTools', label: t('scenebook.studio.imageTools'), type: 'select', opts: [['tap', t('scenebook.studio.imageTools.tap')], ['always', t('scenebook.studio.imageTools.always')]], hint: t('scenebook.studio.imageToolsHint') }])}
      {cuts ? <small className="hint">{t('scenebook.studio.placeCutsNote')}</small> : null}
      <span className="field-label">{t('scenebook.guide.topic.frame.title')}</span>
      {/* 삽화 액자: 고르는 칸마다 대화에서 쓰는 것과 같은 계산으로 액자를 그려 보여 준다 */}
      <div className="sb-frames" role="radiogroup" aria-label={t('scenebook.guide.topic.frame.title')}>{frameChoices().map(item => { const lay = frameLayout(4, 5, { frame: item.id, frameInk: d.frameInk });
        return <button key={item.id} type="button" className={'sb-frame-choice' + (item.id === d.frame ? ' on' : '')} role="radio" aria-checked={item.id === d.frame} title={item.label} onClick={() => { d.frame = item.id; save(); reopen(); }}>
          <span className="illust sb-frame-fig" data-frame={lay.frame}><span className="sb-frame" style={lay.wrapStyle}><span className="sb-pic" style={lay.picStyle}><span className="sb-frame-sample" /></span><FrameArt lay={lay} /></span></span><span className="sb-frame-name">{item.label}</span></button>; })}</div>
      <Form obj={d} defs={[{ k: 'frameInk', label: t('scenebook.studio.frameInk'), type: 'select', opts: INKS.map(([ink, label]): [string, string] => [ink, label]), half: true, live: true }]} onChange={() => { save(); reopen(); }} />
      {customFrames.length ? <Fld label={t('scenebook.studio.frameWide')}><Sel opts={[['', t('scenebook.studio.sameFrame')], ...frameChoices().map((x): [string, string] => [x.id, x.label])]} value={d.frameWide} onChange={val => { d.frameWide = val; save(); }} /></Fld> : null}
      <div className="row wrap"><Btn label={t('scenebook.studio.frame.add')} ic="plus" cls="ghost" onClick={addFrame} />{customFrames.length ? <Btn label={t('scenebook.studio.frame.manage')} ic="more" cls="ghost" onClick={e => frameMenu(e.currentTarget)} /> : null}</div>
      <small className="hint">{t('scenebook.studio.frame.hint')}</small></Group>
    <div className="sb-savebar"><span className={'sb-state' + (bad ? ' bad' : '')} role="status">{state}</span></div>
    <Group title={t('scenebook.guide.topic.presets.title')}><div className="row"><input className="inp" placeholder={t('scenebook.studio.preset.name')} ref={presetName} /><Btn label={t('scenebook.studio.preset.save')} ic="plus" onClick={savePreset} /></div>
      {presets.length ? <div className="col">{presets.map(p => <div className={'sb-preset' + (p.name === active ? ' on' : '')} key={p.name}><b>{p.name}{p.name === active ? <em className="sb-badge">{t('scenebook.preset.active')}</em> : null}</b><small>{configLine(p.config)}</small><Btn label={p.name === active ? t('scenebook.preset.active') : t('scenebook.studio.apply')} cls="ghost" disabled={p.name === active} onClick={() => applyPreset(p)} />
        <IBtn ic="trash" title={t('scenebook.studio.preset.delete')} cls="tiny" onClick={async () => { if (!(await confirmBox(t('scenebook.studio.preset.deleteAsk', { name: p.name }), t('scenebook.delete'), true))) return; Illust.saveCfg({ presets: Illust.cfg().presets.filter(x => x.name !== p.name) }); reopen(); }} /></div>)}</div>
        : <small className="hint">{t('scenebook.studio.preset.hint')}</small>}
      <div className="sb-backup"><span className="field-label">{t('scenebook.studio.backupTitle')}</span>
        <div className="sb-backup-btns sb-tiles"><Btn label={t('scenebook.studio.history')} ic="refresh" onClick={history} /><Btn label={t('scenebook.studio.export')} ic="import" onClick={exportAll} /><Btn label={t('scenebook.studio.import')} ic="upload" onClick={importAll} /></div></div></Group>
  </div>;
}

// ════════ 인물 탭 ════════
const scopeName = (w: string) => ({ account: t('scenebook.ed.scopeAll'), character: t('scenebook.studio.scope.character'), chat: t('scenebook.studio.scope.chat') } as Record<string, string>)[w];
function CharCard({ item, i, n, later, commit, change }: { item: LibPerson; i: number; n: number; later: () => void; commit: () => void; /** 되돌릴 수 있게 적어 두고 목록을 고친 뒤 다시 그린다 */ change: (fn: (list: LibPerson[]) => void) => void }) {
  const bump = useBump(), [open] = useState(n === 1 || !item.name), profiles = (item.profiles ||= []);
  return <details className="sb-char" open={open}>
    <summary><span className="sb-char-no">{String(i + 1).padStart(2, '0')}</span><span>{item.name || t('scenebook.studio.cast.newPerson')}</span><em className="badge" hidden={!item.player}>{t('scenebook.myChar')}</em><small>{[item.appearance, item.outfit].filter(Boolean).join(' · ').slice(0, 80)}</small></summary>
    <div className="col">
      <Text obj={item} k="name" label={t('scenebook.studio.cast.name')} ph={t('scenebook.studio.cast.namePh')} onInput={() => { bump(); later(); }} />
      <Area obj={item} k="appearance" label={t('scenebook.studio.cast.appearance')} rows={3} ph="long silver hair, amber eyes, slender build …" onInput={later} hint={t('scenebook.studio.cast.appearanceHint')} />
      <Area obj={item} k="outfit" label={t('scenebook.studio.cast.outfit')} rows={2} ph="white blouse, navy pleated skirt …" onInput={later} hint={t('scenebook.studio.cast.outfitHint')} />
      <Area obj={item} k="negative" label={t('scenebook.personNeg')} rows={2} onInput={later} />
      <Chk label={t('scenebook.studio.cast.player')} checked={item.player} onChange={val => { item.player = val; bump(); commit(); }} />
      <details className="sb-fold"><summary>{tn('scenebook.studio.cast.profiles', profiles.length)}</summary>
        {profiles.map((p, pi) => <div className="sb-profile" key={p.id || pi}><Text obj={p} k="name" label={t('scenebook.studio.cast.profileName')} ph={t('scenebook.studio.cast.profileNamePh')} onInput={later} /><Area obj={p} k="condition" label={t('scenebook.studio.cast.condition')} rows={2} ph={t('scenebook.studio.cast.conditionPh')} onInput={later} /><Area obj={p} k="appearance" label={t('scenebook.studio.cast.profileAppearance')} rows={2} onInput={later} /><Area obj={p} k="outfit" label={t('scenebook.studio.cast.profileOutfit')} rows={2} onInput={later} />
          <div className="row end"><Btn label={t('scenebook.studio.cast.deleteProfile')} ic="trash" cls="ghost" onClick={async () => { if (!(await confirmBox(t('scenebook.studio.cast.deleteProfileAsk', { name: p.name || t('scenebook.studio.cast.thisProfile') }), t('scenebook.delete'), true))) return; change(() => { profiles.splice(pi, 1); }); }} /></div></div>)}
        <Btn label={t('scenebook.studio.cast.addProfile')} ic="plus" cls="ghost" onClick={() => { if (profiles.length >= 10) return toast(t('scenebook.studio.cast.profileMax')); change(() => { profiles.push({ id: C.uid(), name: '새 외형', condition: '', appearance: '', outfit: '' }); }); }} /></details>
      <div className="row end"><IBtn ic="up" title={t('scenebook.studio.up')} cls="tiny" disabled={i === 0} onClick={() => change(l => { [l[i - 1], l[i]] = [l[i], l[i - 1]]; })} /><IBtn ic="down" title={t('scenebook.studio.down')} cls="tiny" disabled={i === n - 1} onClick={() => change(l => { [l[i + 1], l[i]] = [l[i], l[i + 1]]; })} />
        <Btn label={t('scenebook.deletePerson')} ic="trash" cls="ghost" onClick={async () => { if (!(await confirmBox(t('scenebook.studio.cast.deleteAsk', { name: item.name || t('scenebook.studio.cast.thisPerson') }), t('scenebook.delete'), true))) return; change(l => { l.splice(i, 1); }); }} /></div>
    </div>
  </details>;
}
function CastPage({ reopen }: { reopen: () => void }) {
  const bump = useBump(), S = C.S, I = Illust, chat = cur().chat ?? null, key = I.visualKey(chat), alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const choices: [string, string][] = [['account', t('scenebook.studio.scope.accountFull')], ...(key ? [['character', t('scenebook.studio.scope.characterNamed', { name: S.get('chars', key)?.name || '' })] as [string, string]] : []), ...(chat ? [['chat', t('scenebook.studio.scope.chat')] as [string, string]] : [])];
  if (!choices.some(([w]) => w === castScope)) castScope = I.visualScope(chat);
  const [m] = useState(() => { const scope = castScope as string, v = clone(I.visual(chat, scope)); return { scope, v, drafts: v.library || [], history: [] as LibPerson[][], state: t('scenebook.studio.autoSaved'), bad: false, ver: 0 }; });
  const { scope, v } = m;
  const value = (): Visual => ({ world: v.world || '', direction: v.direction || '', playerMode: v.playerMode || 'auto', library: clone(m.drafts) });
  const [act] = useState(() => {
    const commit = async () => {
      try {
        if (m.drafts.length > 100) throw new Error(t('scenebook.studio.cast.max'));
        if (m.drafts.some(x => !x.name?.trim())) throw new Error(t('scenebook.studio.cast.needName'));
        if (new Set(m.drafts.map(x => x.name.trim())).size !== m.drafts.length) throw new Error(t('scenebook.studio.cast.dupName'));
        if (m.drafts.some(x => (x.profiles || []).some(p => !p.name?.trim()))) throw new Error(t('scenebook.studio.cast.needProfileName'));
        await I.saveVisual(chat, scope, value()); m.state = t('scenebook.studio.autoSaved'); m.bad = false;
      } catch (e) { m.state = t('scenebook.studio.notSaved', { error: errText(e) }); m.bad = true; }
      if (alive.current) bump();
    };
    return { commit: () => void commit(), later: C.debounce(() => void commit(), 400) };
  });
  const { commit, later } = act;
  const remember = () => { m.history.push(clone(m.drafts)); if (m.history.length > 20) m.history.shift(); };
  const render = () => { m.ver++; bump(); };
  const add = (base?: Partial<LibPerson>) => { remember(); m.drafts.push({ id: C.uid(), name: '', appearance: '', outfit: '', negative: '', player: false, profiles: [], ...base }); render(); if (base?.name) commit(); };
  const fromCards = (anchor: Element) => { const me = chat ? S.persona(chat) : undefined, cards = chat ? [...chat.charIds.map(id => S.get('chars', id)), me].filter(x => !!x) : [...S.chars]; if (!cards.length) return toast(t('scenebook.studio.cast.noCards'));
    menu(anchor, cards.slice(0, 40).map(p => ({ label: p.name, ic: 'user', onclick: () => { const vis = (p as { visual?: { appearance?: string; outfit?: string; negative?: string } }).visual; if (m.drafts.some(x => x.name === p.name)) return toast(t('scenebook.studio.cast.exists')); add({ id: p.id, name: p.name, appearance: vis?.appearance || '', outfit: vis?.outfit || '', negative: vis?.negative || '', player: !!chat && p === me }); if (!vis?.appearance) toast(t('scenebook.studio.cast.noVisual')); } }))); };
  const copyMenu = (anchor: Element) => menu(anchor, choices.filter(([w]) => w !== scope).map(([w]) => ({ label: t('scenebook.studio.scope.copyTo', { scope: scopeName(w) }), ic: 'copy', onclick: guard(async () => {
    if (w !== 'account' && I.hasVisual(chat, w) && !(await confirmBox(t('scenebook.studio.scope.copyAsk', { scope: scopeName(w) }), t('scenebook.studio.copy')))) return;
    if (w === 'account' && !(await confirmBox(t('scenebook.studio.scope.copyAskAccount'), t('scenebook.studio.copy')))) return;
    await I.saveVisual(chat, w, value()); castScope = w; reopen(); toast(t('scenebook.studio.scope.copied', { scope: scopeName(w) }), 'ok'); }) })));
  const reset = guard(async () => { if (!(await confirmBox(t('scenebook.studio.scope.resetAsk'), t('scenebook.studio.release')))) return; await I.resetVisual(chat, scope); reopen(); });
  const scopeHelp = `${scope === 'character' ? t('scenebook.studio.scope.helpCharacter') : scope === 'chat' ? t('scenebook.studio.scope.helpChat') : t('scenebook.studio.scope.helpAccount')} ${t('scenebook.studio.scope.order', { scope: scopeName(I.visualScope(chat)) })}${chat && !key ? ' ' + t('scenebook.studio.scope.oneOnOne') : ''}${!chat ? ' ' + t('scenebook.studio.scope.openChat') : ''}`;
  return <div className="sb-cast-page">
    <div className="sb-wf-row"><Fld label={t('scenebook.studio.scope.label')}><Sel opts={choices} value={scope} onChange={w => { castScope = w; reopen(); }} /></Fld>
      <div className="row wrap"><Btn label={t('scenebook.addPerson')} ic="plus" onClick={() => add()} /><Btn label={t('scenebook.studio.cast.fromCards')} ic="users" cls="ghost" onClick={e => fromCards(e.currentTarget)} />
        <Btn label={t('scenebook.undo')} ic="left" cls="ghost" disabled={!m.history.length} onClick={() => { const last = m.history.pop(); if (!last) return; m.drafts = last; render(); commit(); }} />
        {choices.length > 1 ? <IBtn ic="copy" title={t('scenebook.studio.scope.copyOther')} onClick={e => copyMenu(e.currentTarget)} /> : null}<IBtn ic="refresh" title={t('scenebook.studio.reload')} onClick={reopen} /></div></div>
    <p className="hint">{scopeHelp}</p>
    <Group title={t('scenebook.studio.world.title')}><Area obj={v} k="world" label={t('scenebook.studio.world.world')} rows={3} ph={t('scenebook.studio.world.worldPh')} onInput={later} hint={t('scenebook.studio.world.worldHint')} /><Area obj={v} k="direction" label={t('scenebook.studio.world.direction')} rows={2} ph={t('scenebook.studio.world.directionPh')} onInput={later} />
      <Fld label={t('scenebook.guide.topic.player.title')}><Sel opts={[['auto', t('scenebook.studio.player.auto')], ['always', t('scenebook.studio.player.always')], ['never', t('scenebook.studio.player.never')]]} value={v.playerMode === 'pov' ? 'never' : v.playerMode === 'visible' ? 'always' : v.playerMode} onChange={val => { v.playerMode = val; commit(); }} /></Fld></Group>
    <div className="col sb-chars">{m.drafts.map((item, i) => <CharCard key={`${m.ver}-${i}`} item={item} i={i} n={m.drafts.length} later={later} commit={commit} change={fn => { remember(); fn(m.drafts); render(); commit(); }} />)}
      {!m.drafts.length ? <Empty>{t('scenebook.studio.cast.empty')}</Empty> : null}</div>
    <div className="sb-savebar"><span className={'sb-state' + (m.bad ? ' bad' : '')}>{m.state}</span>{scope !== 'account' ? <Btn label={scope === 'chat' && I.hasVisual(chat, 'character') ? t('scenebook.studio.scope.useCharacter') : t('scenebook.studio.scope.useAccount')} cls="ghost" disabled={!I.hasVisual(chat, scope)} onClick={reset} /> : null}</div>
  </div>;
}

// ════════ 참조 탭 ════════
/** 용도: 분위기(Vibe) 또는 Precise 의 유형 */
const USES: [id: string, label: string, help: string][] = [['character&style', 'scenebook.studio.refs.use.charStyle', 'scenebook.studio.refs.use.charStyleHelp'], ['character', 'scenebook.studio.refs.use.char', 'scenebook.studio.refs.use.charHelp'], ['style', 'scenebook.studio.refs.use.style', 'scenebook.studio.refs.use.styleHelp'], ['outfit', 'scenebook.studio.refs.use.outfit', 'scenebook.studio.refs.use.outfitHelp'], ['vibe', 'scenebook.studio.refs.use.vibe', 'scenebook.studio.refs.use.vibeHelp']];
type RefRow = { id: string; enabled: boolean; use: string; sameOutfit: boolean; strength: number; fidelity: number; information: number };
const rowRef = (r: RefRow): RefUse => { const vibe = r.use === 'vibe'; return { id: r.id, kind: vibe ? 'vibe' : 'precise', mode: vibe ? 'character' : r.use, sameOutfit: r.sameOutfit, strength: r.strength, fidelity: r.fidelity, information: r.information }; };
function Slider({ row, k, label, max = 1, hint, later }: { row: RefRow; k: 'strength' | 'fidelity' | 'information'; label: string; max?: number; hint?: string; later: () => void }) {
  const bump = useBump(), v = Math.min(row[k], max);
  return <Fld label={label} cls="third" hint={hint}><div className="range"><input type="range" min={0} max={max} step={0.05} value={v} onChange={e => { row[k] = +e.target.value; bump(); later(); }} /><output>{Number(v).toFixed(2)}</output></div></Fld>;
}
/** 가장 가까운 스크롤 상자 (없으면 화면) */
const scrollParent = (el: Element): Element | null => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') return p; } return null; };
/** el 이 스크롤 상자 안에서 화면 가까이 오면 f 를 한 번 부른다 → 끊는 함수 */
function whenNear(el: Element, f: () => void, margin = 300): () => void {
  if (typeof IntersectionObserver === 'undefined') { f(); return () => { }; }
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); f(); } }, { root: scrollParent(el), rootMargin: `${margin}px 0px` });
  io.observe(el); return () => io.disconnect();
}
/** 목록용 작은 그림. 화면 가까이 오기 전에는 읽지도 만들지도 않는다 — 그림이 수천 장이어도 보이는 칸만큼만 일한다.
 *  아직 없으면 같은 크기의 빈 칸을 두었다가 바꿔 낀다 (자리가 흔들리지 않게) */
function Thumb({ id, alt = '' }: { id: string; alt?: string }) {
  const [, bump] = useState(0), [near, setNear] = useState(false), box = useRef<HTMLElement>(null);
  useEffect(() => { if (near) return; const el = box.current; if (!el) { setNear(true); return; } return whenNear(el, () => setNear(true)); }, [near]);
  const u = near ? Illust.thumb(id) : '';
  // 이 칸이 보이는 동안만 만들게 붙잡아 둔다. 붙기 직전에 이미 만들어졌거나 줄에서 빠졌을 수 있어 한 번 더 청한다
  useEffect(() => { if (!near || u) return; const release = Illust.thumbHold(id), check = () => { if (Illust.thumb(id)) bump(n => n + 1); }, off = Illust.onPic(check); check(); return () => { off(); release(); }; }, [id, u, near]);
  return u ? <img src={u} alt={alt} decoding="async" /> : <i ref={box} className="sb-thumb-wait" aria-hidden="true" />;
}
/** 바이트 → 사람이 읽는 크기 */
const sizeText = (n: number) => n >= 1073741824 ? `${(n / 1073741824).toFixed(1)}GB` : n >= 10485760 ? `${Math.round(n / 1048576)}MB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
function RefsPage({ reopen, refs }: { reopen: () => void; refs: Card[] }) {
  const bump = useBump(), S = C.S, c = Illust.cfg(), { MODELS, REF_OWNER, REFERENCE_LIMIT, referencePlan } = IL;
  const nai = c.backend === 'nai', sp = nai ? MODELS[c.model]?.references : undefined, fresh = sp?.bucket ? 'character&style' : 'vibe';
  const [m] = useState(() => { const chosen = new Map((c.references || []).map(r => [r.id, r]));
    return { state: t('scenebook.studio.autoSaved'), bad: false, rows: new Map(refs.map((r): [string, RefRow] => { const sv = chosen.get(r.id), use = sv ? (sv.kind === 'vibe' ? 'vibe' : sv.mode || 'character') : fresh;
      return [r.id, { id: r.id, enabled: !!sv, use, sameOutfit: sv?.sameOutfit ?? use === 'character&style', strength: sv?.strength ?? (use === 'vibe' ? 0.6 : 1), fidelity: sv?.fidelity ?? 1, information: sv?.information ?? 1 }]; })) }; });
  const active = () => [...m.rows.values()].filter(r => r.enabled);
  const [act] = useState(() => {
    const commit = () => { Illust.saveCfg({ references: active().map(rowRef) });
      try { Illust.validate(Illust.genConfig()); m.state = t('scenebook.studio.autoSaved'); m.bad = false; } catch (e) { m.state = t('scenebook.studio.needCheck', { error: errText(e) }); m.bad = true; } bump(); };
    return { commit, later: C.debounce(commit, 300) };
  });
  const { commit, later } = act;
  const store = async (blob: Blob, name: string, extra: object = {}) => { const img = await prepareReference(blob), id = C.uid(); await C.DB.put('assets', { id, owner: REF_OWNER, kind: 'illust-ref', name: name.slice(0, 100), ...img, ts: C.now(), ...extra }); return id; };
  const upload = guard(async () => { const [f] = await C.pickFiles({ accept: 'image/png,image/jpeg,image/webp' }); if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 10 * 1024 * 1024) throw new Error(t('scenebook.studio.refs.pickFile'));
    await store(f, f.name.replace(/\.[a-z0-9]+$/i, '')); toast(t('scenebook.studio.refs.added'), 'ok'); reopen(); });
  // 이 대화 캐릭터의 초상을 인물 참조로: 같은 얼굴이 그림마다 이어지게. 이미 가져온 초상은 건너뛴다
  const fromAvatars = guard(async () => {
    const chat = cur().chat; if (!chat) throw new Error(t('scenebook.studio.refs.needChat'));
    const have = new Set(refs.map(r => r.src || '')), added: string[] = [];
    for (const cid of chat.charIds || []) {
      const ch = S.get('chars', cid); if (!ch || have.has('avatar:' + cid)) continue;
      const data = await S.avatarData(ch).catch(() => ''); if (!data || !/^data:image\//.test(data)) continue;
      const blob = dataToBlob(data); if (!blob) continue;
      added.push(await store(blob, ch.name || t('scenebook.person'), { src: 'avatar:' + cid }));
    }
    if (!added.length) { toast(t('scenebook.studio.refs.avatarsNone')); return; }
    // 인물 참조로 바로 켠다 (옷차림은 따르지 않는다: 장면마다 옷이 달라질 수 있다)
    const now0 = Illust.cfg(), room = Math.max(0, REFERENCE_LIMIT - (now0.references || []).length);
    Illust.saveCfg({ references: [...(now0.references || []), ...added.slice(0, room).map((id): RefUse => ({ id, kind: 'precise', mode: 'character', sameOutfit: false, strength: 1, fidelity: 1, information: 1 }))] });
    toast(t('scenebook.studio.refs.avatarsAdded', { n: added.length }), 'ok'); reopen();
  });
  const remove = (r: Card) => guard(async () => {
    if (!(await confirmBox(t('scenebook.studio.refs.deleteAsk', { name: r.name || '' }), t('scenebook.delete'), true))) return;
    await C.DB.del('assets', r.id); Illust.cancelWaiting(j => j.config.references?.some(x => x.id === r.id));
    const now0 = Illust.cfg(); Illust.saveCfg({ references: (now0.references || []).filter(x => x.id !== r.id), presets: now0.presets.map(p => ({ ...p, config: { ...p.config, references: (p.config.references || []).filter(x => x.id !== r.id) } })) });
    toast(t('scenebook.studio.refs.deleted')); reopen(); });
  // 지금 모델이 못 쓰는 참조와 그 까닭, 그리고 더 드는 값
  const on = active(), plan = sp ? referencePlan(c.model, on.map(rowRef)) : [], skipOf = new Map(plan.map((x, i) => [on[i].id, x.skip]));
  const applied = plan.filter(x => !x.skip), precise = applied.filter(x => x.ref.kind === 'precise').length;
  return <div className="sb-refs">
    <p className="hint">{t('scenebook.studio.refs.intro')}</p>
    {!nai ? <div className="sb-note"><Icon name="image" size={15} /><span>{t('scenebook.studio.refs.offEngine')}</span></div> : null}
    <div className="row wrap"><Btn label={t('scenebook.studio.refs.add')} ic="plus" onClick={upload} /><Btn label={t('scenebook.studio.refs.fromAvatars')} ic="user" cls="ghost" onClick={fromAvatars} />{refs.length ? <Btn label={t('scenebook.studio.refs.clearAll')} cls="ghost" onClick={() => { Illust.saveCfg({ references: [] }); reopen(); }} /> : null}<span className="sb-grow" /><span className={'sb-state' + (m.bad ? ' bad' : '')}>{m.state}</span></div>
    <small className="hint">{t('scenebook.studio.refs.fromAvatarsHint')}</small>
    {nai && refs.length ? <p className="sb-ref-cost" role="status">{!applied.length ? t('scenebook.studio.refs.costNone') : t('scenebook.studio.refs.cost', { n: applied.length }) + (precise ? t('scenebook.studio.refs.costPrecise', { n: precise, anlas: precise * 5 }) : '') + t('scenebook.studio.refs.costOpus')}</p> : null}
    {!refs.length ? <Empty>{t('scenebook.studio.refs.empty')}</Empty> : <div className="sb-ref-grid">{refs.map(r => { const row = m.rows.get(r.id) as RefRow, vibe = row.use === 'vibe', skip = row.enabled ? skipOf.get(r.id) : '';
      const pickUse = (val: string) => { row.use = val; if (val === 'character' || val === 'character&style') row.sameOutfit = val === 'character&style'; if (val === 'vibe') row.strength = Math.min(row.strength, 1); commit(); };
      const toggle = (val: boolean) => { if (val && active().length >= REFERENCE_LIMIT) { toast(t('scenebook.studio.refs.limit', { n: REFERENCE_LIMIT })); return; } row.enabled = val; commit(); };
      return <div key={r.id} className={'sb-ref' + (row.enabled ? ' on' : '')}><div className="sb-ref-img"><Thumb id={r.id} alt={r.name || ''} /></div>
        <div className="col"><div className="row"><b className="sb-grow">{r.name}</b><IBtn ic="trash" title={t('scenebook.studio.refs.delete')} cls="tiny" onClick={remove(r)} /></div><Chk label={t('scenebook.studio.refs.use')} checked={row.enabled} onChange={toggle} />
          {row.enabled ? <div className="form">
            <Fld label={t('scenebook.studio.refs.kind')} hint={t(USES.find(u => u[0] === row.use)?.[2] || USES[0][2])}><Sel opts={USES.map(([id, label]): [string, string] => [id, t(label)])} value={row.use} onChange={pickUse} /></Fld>
            {sp?.outfit && (row.use === 'character' || row.use === 'character&style') ? <Chk label={t('scenebook.studio.refs.sameOutfit')} checked={row.sameOutfit} onChange={val => { row.sameOutfit = val; commit(); }} /> : null}
            <Slider row={row} k="strength" label={t('scenebook.studio.refs.strength')} max={vibe ? 1 : Math.max(1, sp?.strengthMax || 1)} later={later} />
            {!vibe && sp?.fidelity ? <Slider row={row} k="fidelity" label={t('scenebook.studio.refs.fidelity')} hint={t('scenebook.studio.refs.fidelityHelp')} later={later} /> : null}
            {vibe ? <Slider row={row} k="information" label={t('scenebook.studio.refs.information')} hint={t('scenebook.studio.refs.informationHelp')} later={later} /> : null}
          </div> : null}
          {skip ? <p className="sb-ref-skip" role="status">{t('scenebook.studio.refs.skipped', { why: skip })}</p> : null}</div></div>; })}</div>}
  </div>;
}

// ════════ 갤러리 탭 ════════
/** 그림을 완전히 지운다 (대화 속 버전에서도 뺀다) */
/** 갤러리에서 지우기: 갤러리에서만 빼기(대화 · 그림은 그대로) 또는 완전히 삭제(그림 파일까지, 대화에서도 뺀다). 고른 것 · 취소면 null */
const removeHow = (n: number, size: string) => choiceBox(n === 1 ? t('scenebook.studio.gal.removeOneAsk') : t('scenebook.studio.gal.removeManyAsk', { n, size }),
  <div className="col sb-remove-how"><p><b>{t('scenebook.studio.gal.hideOnly')}</b> — {t('scenebook.studio.gal.hideOnlyNote')}</p><p><b>{t('scenebook.studio.gal.purge')}</b> — {t('scenebook.studio.gal.purgeNote')}</p></div>,
  [{ key: 'hide', label: t('scenebook.studio.gal.hideOnly') }, { key: 'purge', label: t('scenebook.studio.gal.purge'), cls: 'danger' }]) as Promise<'hide' | 'purge' | null>;
async function purgeAsset(rec: Asset) {
  const S = C.S, I = Illust;
  await I.remove(rec.id);
  const chatId = String(rec.owner || '').replace(/^chat:/, ''), live = cur().chat?.id === chatId, chat = S.get('chats', chatId), list: Msg[] = live ? (cur().msgs || []) : chat ? await S.msgs(chatId) : []; let hit = false;
  for (const m of list) for (const sw of m.swipes || []) {
    if (!sw.illust?.some(it => it.id === rec.id || it.versions?.some(v => v.id === rec.id))) continue; hit = true;
    sw.illust = sw.illust.filter(it => { I.slot(it); it.versions = it.versions.filter(v => v.id !== rec.id); if (!it.versions.length) return false; I.select(it, Math.min(it.sel, it.versions.length - 1)); return true; });
  }
  if (hit) { if (live) { await chatApi.save(); chatApi.redraw(); } else if (chat) await S.saveMsgs(chat, list); }
}
/** 여러 장을 한꺼번에 지운다: 대화마다 메시지를 한 번 읽고 한 번 저장한다 (먼저 대화에서 빼고, 그다음 그림을 지운다 — 중간에 멈춰도 대화에 빈 칸이 남지 않게) */
async function purgeMany(cards: { id: string; owner: string }[]) {
  const S = C.S, I = Illust, byChat = new Map<string, Set<string>>();
  for (const c of cards) { const k = String(c.owner || '').replace(/^chat:/, ''); if (!byChat.has(k)) byChat.set(k, new Set()); byChat.get(k)!.add(c.id); }
  for (const [chatId, ids] of byChat) {
    const live = cur().chat?.id === chatId, chat = S.get('chats', chatId), list: Msg[] = live ? (cur().msgs || []) : chat ? await S.msgs(chatId) : []; let hit = false;
    for (const m of list) for (const sw of m.swipes || []) {
      if (!sw.illust?.some(it => ids.has(it.id) || it.versions?.some(v => ids.has(v.id)))) continue; hit = true;
      sw.illust = sw.illust.filter(it => { I.slot(it); it.versions = it.versions.filter(v => !ids.has(v.id)); if (!it.versions.length) return false; I.select(it, Math.min(it.sel, it.versions.length - 1)); return true; });
    }
    if (hit) { if (live) { await chatApi.save(); chatApi.redraw(); } else if (chat) await S.saveMsgs(chat, list); }
    for (const id of ids) await I.remove(id);
  }
}
const jobOff = (): Record<string, string> => ({ failed: t('scenebook.studio.job.failed'), uncertain: t('scenebook.studio.job.uncertain'), running: t('scenebook.job.running'), waiting: t('scenebook.studio.job.waiting') });
const PAGE = 36;
const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
/** 갤러리: 날짜별로 이어 보고(쪽 넘기기 없이 내려가면 더 불러온다), 대화별로 묶어 보고, 골라서 여러 장 지운다. 목록은 가벼운 정보 · 칸은 작은 그림만 */
function GalleryPage({ reopen, all }: { reopen: () => void; all: Card[] }) {
  const S = C.S, I = Illust, chat = cur().chat;
  const [query, setQuery] = useState(''), [scope, setScope0] = useState('all'), [limit, setLimit] = useState(PAGE), [picking, setPicking] = useState(false), [sel, setSel] = useState<Set<string>>(() => new Set());
  const more = useRef<HTMLDivElement>(null);
  // 갤러리에서만 뺀 그림: 대화 · 그림 파일은 그대로 두고 목록에만 안 보인다 (숨긴 그림 보기에서 다시 보이게 할 수 있다)
  const hidden = new Set(Illust.cfg().galleryHide || []);
  const hide = (ids: string[]) => Illust.saveCfg({ galleryHide: [...new Set([...(Illust.cfg().galleryHide || []), ...ids])].filter(id => known.has(id) || ids.includes(id)) });
  const unhide = (ids: string[]) => Illust.saveCfg({ galleryHide: (Illust.cfg().galleryHide || []).filter(id => !ids.includes(id)) });
  const known = new Set(all.map(a => a.id));
  const setScope = (v: string) => { setScope0(v); setLimit(PAGE); setSel(new Set()); };
  const chatOf = (a: { owner: string }) => String(a.owner).replace(/^chat:/, '');
  const chatName = (a: { owner: string }) => { const c = S.get('chats', chatOf(a)); return c ? (c.name || c.charIds.map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || t('scenebook.studio.gal.chat')) : t('scenebook.studio.gal.deletedChat'); };
  const [used] = useState(() => new Set((cur().msgs || []).flatMap(m => (m.swipes || []).flatMap(sw => (sw.illust || []).flatMap(it => [it.id, ...(it.versions || []).map(v => v.id)])))));
  const target = () => { const m = lastReply(); if (!m) throw new Error(t('scenebook.studio.gal.openChatFirst')); return m; };
  const openJob = (j: Job) => openModal({ title: j.label || jobOff()[j.state] || '', cls: 'col', actions: [
    { label: t('scenebook.record'), ic: 'note', cls: 'ghost', onclick: () => { inspect({ scene: j.scene, config: j.config, ts: j.ts }); return false; } },
    (j.state === 'failed' || j.state === 'uncertain') && cur().msgs?.includes(j.msg) && { label: t('scenebook.retry'), cls: 'primary', onclick: () => { try { j.seen = true; draw(j.msg, [j.scene], j.config, j.slot, true); reopen(); } catch (e) { toast(errText(e), 'err'); return false; } } }] },
    () => <><p>{j.error || t('scenebook.studio.gal.notFinal')}</p><small className="hint">{[configLine(j.config), when(j.ts)].filter(Boolean).join(' · ')}</small></>);
  const item = (a: Asset): ViewItem => ({ title: withPreset(sceneLabel(a) || chatName(a), a.preset), src: a.data, sub: [chatName(a), when(a.ts), configLine(a.config), a.seed != null ? `Seed ${a.seed}` : ''].filter(Boolean).join(' · '),
    actions: [
      { label: t('scenebook.studio.gal.insert'), ic: 'plus', run: async () => { const m = target(), here = 'chat:' + (cur().chat as Chat).id; let rec = a; if (a.owner !== here) { rec = { ...a, id: C.uid(), owner: here, ts: C.now() }; await C.DB.put('assets', rec); } I.insert(m.swipes[m.sw], rec); await chatApi.save(); chatApi.redraw(); toast(t('scenebook.studio.gal.inserted'), 'ok'); } },
      { label: t('scenebook.openAsScene'), ic: 'sliders', run: () => compose(target(), { initial: [a.scene || { ...blankScene(), title: a.title || '', prompt: a.prompt || '' }], config: a.config ? { ...a.config, seed: -1 } : null }) },
      hidden.has(a.id) ? { label: t('scenebook.studio.gal.unhide'), ic: 'eye', run: () => { unhide([a.id]); toast(t('scenebook.studio.gal.unhidden'), 'ok'); reopen(); } }
        : { label: t('scenebook.delete'), ic: 'trash', run: async () => { const how = await removeHow(1, sizeText(Math.round(String(a.data).length * 0.75))); if (!how) return; if (how === 'hide') { hide([a.id]); toast(t('scenebook.studio.gal.hiddenOne')); } else { await purgeAsset(a); toast(t('scenebook.studio.gal.deleted')); } reopen(); } }],
    more: [{ label: t('scenebook.review.run'), ic: 'search', onclick: guard(() => review(a)) }, ...(a.review ? [{ label: t('scenebook.review.last'), ic: 'eye', onclick: () => showReview(a.review || {}) }] : []), { label: t('scenebook.record'), ic: 'note', onclick: () => inspect(a) }, ...(S.get('chats', chatOf(a)) ? [{ label: t('scenebook.studio.gal.goChat'), ic: 'chat', onclick: () => go('chat', chatOf(a)) }] : [])] });
  const read = async (c: Card) => { const a = await C.DB.get('assets', c.id) as unknown as Asset | undefined; return a?.data ? a : null; };
  // 목록은 가벼운 정보만 들고 있다: 그림을 열 때 그 한 장만 읽는다. 큰 그림에서 넘기면 지금 보이는 목록(검색 · 범위 그대로)의 앞뒤 그림으로 간다
  const open = guard(async (c: Card) => { const a = await read(c); if (!a) { toast(t('scenebook.studio.gal.gone')); reopen(); return; } const list = [...pics]; viewer(item(a), { count: list.length, index: Math.max(0, list.findIndex(x => x.id === c.id)), load: async i => { const x = await read(list[i]); return x ? item(x) : null; } }); });
  const q = query.trim().toLowerCase(), mine = (a: Card) => !!chat && a.owner === 'chat:' + chat.id, off = scope === 'failed', folders = scope === 'chats', inChat = scope.startsWith('in:') ? scope.slice(3) : '';
  const jobs = off ? [...I.queue()].reverse().filter(j => jobOff()[j.state] && (!q || [j.label, j.scene?.prompt, ...(j.scene?.characters || []).map(x => x.name)].join(' ').toLowerCase().includes(q))) : [];
  const hidScope = scope === 'hidden', pics = off ? [] : all.filter(a => hidden.has(a.id) === hidScope && (scope !== 'chat' || mine(a)) && (scope !== 'loose' || (mine(a) && !used.has(a.id))) && (!inChat || chatOf(a) === inChat) && (!q || `${a.find || ''} ${chatName(a).toLowerCase()}`.includes(q)));
  // 대화별 묶음: 가장 최근에 그린 대화부터, 표지는 그 대화의 가장 새 그림
  const groups = folders ? [...pics.reduce((m, a) => { const k = chatOf(a), g = m.get(k) || { id: k, n: 0, size: 0, top: a }; g.n++; g.size += a.size || 0; if (a.ts > g.top.ts) g.top = a; return m.set(k, g); }, new Map<string, { id: string; n: number; size: number; top: Card }>()).values()].sort((x, y) => y.top.ts - x.top.ts) : [];
  const total = off ? jobs.length : folders ? groups.length : pics.length, bytes = pics.reduce((n, a) => n + (a.size || 0), 0);
  // 내려가면 더 불러온다 (맨 끝 표시가 화면 가까이 오면)
  useEffect(() => { const el = more.current; if (!el || limit >= total) return; return whenNear(el, () => setLimit(l => l + PAGE), 700); }, [limit, total, scope, query]);
  const flip = (id: string) => setSel(p => { const x = new Set(p); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const allPicked = pics.length > 0 && pics.every(a => sel.has(a.id)), selBytes = pics.reduce((n, a) => n + (sel.has(a.id) ? a.size || 0 : 0), 0);
  const stopPick = () => { setPicking(false); setSel(new Set()); };
  const delSel = guard(async () => {
    const cards = pics.filter(a => sel.has(a.id)); if (!cards.length) return;
    if (hidScope) { unhide(cards.map(a => a.id)); toast(t('scenebook.studio.gal.unhiddenN', { n: cards.length }), 'ok'); stopPick(); reopen(); return; }
    const how = await removeHow(cards.length, sizeText(selBytes)); if (!how) return;
    if (how === 'hide') { hide(cards.map(a => a.id)); toast(t('scenebook.studio.gal.hiddenN', { n: cards.length }), 'ok'); }
    else { await purgeMany(cards); toast(t('scenebook.studio.gal.removedN', { n: cards.length }), 'ok'); }
    stopPick(); reopen();
  });
  // 저장 공간: 원본 · 지워도 되는 사본 · 이 기기에서 쓰는 공간
  const storage = guard(async () => {
    const box = await IL.boxUsage(), est = await (navigator.storage?.estimate?.() ?? Promise.resolve(null)).catch(() => null), orig = all.reduce((n, a) => n + (a.size || 0), 0);
    openModal({ title: t('scenebook.studio.gal.storage'), cls: 'col', actions: [
      { label: t('scenebook.studio.gal.st.clear'), ic: 'trash', cls: 'ghost', onclick: async () => { if (!(await confirmBox(t('scenebook.studio.gal.st.clearAsk'), t('scenebook.studio.gal.st.clear'), true))) return false; await IL.clearBox(); toast(t('scenebook.studio.gal.st.cleared', { size: sizeText(box.copies + box.thumbs) }), 'ok'); } },
      { label: t('common.close'), cls: 'primary' }] },
      () => <>
        <dl className="facts">
          <div><dt>{t('scenebook.studio.gal.st.originals')}</dt><dd>{t('scenebook.studio.gal.st.originalsValue', { n: all.length, size: sizeText(orig) })}</dd></div>
          <div><dt>{t('scenebook.studio.gal.st.copies')}</dt><dd>{sizeText(box.copies)}</dd></div>
          <div><dt>{t('scenebook.studio.gal.st.thumbs')}</dt><dd>{sizeText(box.thumbs)}</dd></div>
          {est?.usage != null ? <div><dt>{t('scenebook.studio.gal.st.device')}</dt><dd>{t('scenebook.studio.gal.st.deviceValue', { used: sizeText(est.usage), quota: sizeText(est.quota || 0) })}</dd></div> : null}
        </dl>
        <p className="hint">{t('scenebook.studio.gal.st.copiesNote')}</p>
        <p className="hint">{t('scenebook.studio.gal.st.note')}</p>
      </>);
  });
  const scopeLabel = off ? t('scenebook.studio.gal.scopeUnfinished') : inChat ? chatName({ owner: 'chat:' + inChat }) : scope === 'chat' ? t('scenebook.studio.gal.thisChat') : scope === 'loose' ? t('scenebook.studio.gal.scopeLoose') : hidScope ? t('scenebook.studio.gal.scopeHidden') : t('scenebook.studio.gal.scopeAll');
  const countLine = folders ? t('scenebook.studio.gal.chatsLine', { chats: groups.length, n: pics.length, size: sizeText(bytes) }) : tn('scenebook.studio.gal.count', total, { scope: scopeLabel }) + (!off && bytes ? ` · ${t('scenebook.studio.gal.sizeAbout', { size: sizeText(bytes) })}` : '');
  // 날짜 머리줄 (그날 그린 장 수와 함께) — 지금 대화 안에서는 대화 이름 대신 시각을 적는다
  const dayCount = new Map<string, number>(); if (!folders && !off) for (const a of pics) { const k = dayKey(a.ts); dayCount.set(k, (dayCount.get(k) || 0) + 1); }
  const thisYear = new Date().getFullYear(), dayLabel = (ts: number) => new Date(ts).toLocaleDateString(locale(), { ...(new Date(ts).getFullYear() !== thisYear ? { year: 'numeric' } : {}), month: 'long', day: 'numeric', weekday: 'short' });
  const oneChat = !!inChat || scope === 'chat' || scope === 'loose';
  const tile = (a: Card) => { const picked = sel.has(a.id);
    return <button key={a.id} type="button" className={'sb-shot' + (picked ? ' picked' : '')} title={a.hint || sceneLabel(a) || undefined} aria-label={t('scenebook.studio.gal.view', { title: sceneLabel(a) || chatName(a) })} {...(picking ? { 'aria-pressed': picked } : {})} onClick={() => (picking ? flip(a.id) : void open(a))}>
      <Thumb id={a.id} />{picking ? <i className="sb-shot-pick" aria-hidden="true">{picked ? <Icon name="check" size={13} /> : null}</i> : null}{a.review ? <em className="sb-shot-mark" title={t('scenebook.studio.gal.hasReview')}>{t('scenebook.studio.gal.reviewMark')}</em> : null}
      {sceneLabel(a) ? <span>{sceneLabel(a)}</span> : null}<small>{oneChat ? new Date(a.ts).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }) : chatName(a)}</small></button>; };   // 제목은 사람이 직접 붙였을 때만 (「삽화」 · 「장면 1」 같은 자리표시는 안 보인다)   // 날짜는 머리줄에 있다
  const body: ReactNode[] = []; let lastDay = '';
  if (off) for (const j of jobs.slice(0, limit)) body.push(<button key={j.id} type="button" className="sb-shot" title={j.label || undefined} aria-label={t('scenebook.studio.gal.checkJob', { title: j.label || jobOff()[j.state] })} onClick={() => openJob(j)}><i className={`sb-shot-off ${j.state}`}>{jobOff()[j.state]}</i>{j.label ? <span>{j.label}</span> : null}<small>{j.error || configLine(j.config)}</small></button>);
  else if (folders) for (const g of groups.slice(0, limit)) body.push(<button key={g.id} type="button" className="sb-shot sb-folder" title={chatName({ owner: 'chat:' + g.id })} onClick={() => setScope('in:' + g.id)}><Thumb id={g.top.id} /><em className="sb-folder-n">{t('scenebook.studio.gal.picsN', { n: g.n })}</em><span>{chatName({ owner: 'chat:' + g.id })}</span><small>{[new Date(g.top.ts).toLocaleDateString(locale(), { ...(new Date(g.top.ts).getFullYear() !== thisYear ? { year: '2-digit' } : {}), month: 'numeric', day: 'numeric' }), g.size ? sizeText(g.size) : ''].filter(Boolean).join(' · ')}</small></button>);
  else for (const a of pics.slice(0, limit)) { const k = dayKey(a.ts); if (k !== lastDay) { lastDay = k; body.push(<h4 key={'d' + k} className="sb-gal-day"><span>{dayLabel(a.ts)}</span><small>{t('scenebook.studio.gal.picsN', { n: dayCount.get(k) || 0 })}</small></h4>); } body.push(tile(a)); }
  return <div className="sb-gallery-page">
    <div className="sb-gallery-bar"><input className="inp" type="search" placeholder={t('scenebook.studio.gal.searchPh')} aria-label={t('scenebook.studio.gal.search')} value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE); }} />
      <Sel opts={[['all', t('scenebook.studio.gal.all')], ['chats', t('scenebook.studio.gal.byChat')], ...(chat ? [['chat', t('scenebook.studio.gal.thisChat')], ['loose', t('scenebook.studio.gal.loose')]] as [string, string][] : []), ['failed', t('scenebook.studio.gal.unfinished')], ...(hidden.size || hidScope ? [['hidden', t('scenebook.studio.gal.hiddenScope', { n: all.filter(a => hidden.has(a.id)).length })] as [string, string]] : [])]} value={inChat ? 'chats' : scope} onChange={val => { stopPick(); setScope(val); }} />
      <IBtn ic="more" title={t('scenebook.more')} onClick={e => menu(e.currentTarget, [
        !off && !folders && pics.length ? { label: t('scenebook.studio.gal.pick'), ic: 'check', onclick: () => setPicking(true) } : null,
        { label: t('scenebook.studio.gal.storage'), ic: 'folder', onclick: storage },
        { label: t('scenebook.studio.refresh'), ic: 'refresh', onclick: reopen }, { label: t('scenebook.studio.gal.exportChat'), ic: 'import', onclick: exportChat }])} /></div>
    {inChat ? <div className="sb-gal-crumb"><button type="button" className="btn ghost" onClick={() => { stopPick(); setScope('chats'); }}><Icon name="left" size={15} />{t('scenebook.studio.gal.byChat')}</button><b>{scopeLabel}</b></div> : null}
    {picking ? <div className="sb-gal-pickbar" role="status">
      <b>{t('scenebook.studio.gal.picked', { n: sel.size })}{sel.size ? <small>{` · ${sizeText(selBytes)}`}</small> : null}</b>
      <button type="button" className="btn ghost" onClick={() => setSel(allPicked ? new Set() : new Set(pics.map(a => a.id)))}>{allPicked ? t('scenebook.studio.gal.pickNone') : t('scenebook.studio.gal.pickAll', { n: pics.length })}</button>
      <button type="button" className={'btn ' + (hidScope ? 'primary' : 'danger')} disabled={!sel.size} onClick={delSel}><Icon name={hidScope ? 'eye' : 'trash'} size={15} />{t(hidScope ? 'scenebook.studio.gal.unhideN' : 'scenebook.studio.gal.removeN', { n: sel.size })}</button>
      <button type="button" className="ibtn" title={t('common.cancel')} aria-label={t('common.cancel')} onClick={stopPick}><Icon name="x" size={17} /></button>
    </div> : <p className="hint" role="status">{countLine}</p>}
    <div className={'sb-gallery' + (folders ? ' sb-gal-chats' : '')}>
      {body}
      {!total ? <Empty>{off ? (q ? t('scenebook.studio.gal.noJobMatch') : t('scenebook.studio.gal.noJobs')) : q ? t('scenebook.studio.gal.noMatch') : hidScope ? t('scenebook.studio.gal.noHidden') : t('scenebook.studio.gal.empty')}</Empty> : null}
      {limit < total ? <div ref={more} className="sb-gal-more"><button type="button" className="btn ghost" onClick={() => setLimit(l => l + PAGE)}>{t('scenebook.studio.gal.loadMore', { n: total - limit })}</button></div> : null}</div>
  </div>;
}

// ════════ 작업 탭 ════════
const jobLabels = (): Record<string, string> => ({ waiting: t('scenebook.studio.job.waiting'), running: t('scenebook.job.running'), done: t('scenebook.studio.job.done'), failed: t('scenebook.studio.job.failed'), uncertain: t('scenebook.studio.job.uncertain'), cancelled: t('scenebook.studio.job.cancelled') });
function QueuePage({ reopen }: { reopen: () => void }) {
  const I = Illust, items = [...I.queue()].reverse(), wait = Math.ceil(I.cooldown() / 1000), paused = I.queuePaused();
  const stats: [string, string | number][] = [[t('scenebook.studio.queue.sessionRequests'), `${I.usage()}`], [t('scenebook.studio.job.waiting'), items.filter(x => x.state === 'waiting').length], [t('scenebook.studio.job.done'), items.filter(x => x.state === 'done').length], [t('scenebook.studio.job.failed'), items.filter(x => x.state === 'failed' || x.state === 'uncertain').length]];
  const drafts = pendingDrafts().length;
  return <div className="sb-queue">
    <div className="mem-stats">{stats.map(([l, n]) => <div key={l}><b>{String(n)}</b><span>{l}</span></div>)}</div>
    <div className="row wrap">{drafts ? <Btn label={tn('scenebook.studio.queue.genDrafts', drafts)} ic="image" cls="primary" onClick={guard(async () => {
      if (!(await confirmBox(tn('scenebook.studio.queue.genDraftsAsk', drafts), t('scenebook.studio.queue.generate')))) return;
      const r = await generateDrafts(); toast(tn('scenebook.studio.queue.queued', r.count) + (r.left ? tn('scenebook.studio.queue.leftSuffix', r.left) : ''), r.count ? 'ok' : undefined); reopen(); })} /> : null}
      <Btn label={paused ? t('scenebook.studio.resume') : t('scenebook.studio.pause')} ic={paused ? 'play' : 'stop'} cls={paused ? 'primary' : ''} onClick={() => I.toggleQueue()} /><Btn label={t('scenebook.studio.queue.cancelWaiting')} cls="ghost" onClick={() => { const n = I.cancelWaiting(); toast(n ? tn('scenebook.studio.queue.cancelled', n) : t('scenebook.studio.queue.noneWaiting')); }} />
      <Btn label={t('scenebook.plans')} ic="note" cls="ghost" onClick={showPlans} />
      {I.cfg().backend === 'nai' ? <Btn label={t('scenebook.studio.queue.account')} ic="user" cls="ghost" onClick={guard(async () => { const a = await I.account(); openModal({ title: t('scenebook.studio.queue.account'), cls: 'col' }, () => <><p>{t('scenebook.studio.queue.accountTier', { sub: a.active ? t('scenebook.studio.subActive') : t('scenebook.studio.subInactive'), tier: tierName(a.tier) ?? t('scenebook.studio.unknown') })}</p><p>{t('scenebook.studio.queue.anlas', { n: a.anlas != null ? a.anlas.toLocaleString() : t('scenebook.studio.unknown') })}</p></>); })} /> : null}
      <IBtn ic="refresh" title={t('scenebook.studio.refresh')} onClick={reopen} /></div>
    <p className="hint">{`${paused ? t('scenebook.studio.queue.pausedNote') + ' ' : ''}${wait ? t('scenebook.studio.queue.cooldown', { n: wait }) + ' ' : ''}${t('scenebook.studio.queue.note')}`}</p>
    {!items.length ? <Empty>{t('scenebook.studio.queue.empty')}</Empty> : <div className="col">{items.map(j => <div key={j.id} className={`sb-job ${j.state}`}><span className="sb-job-state">{jobLabels()[j.state] || j.state}</span>
      <div className="col">{j.label ? <b>{j.label}</b> : null}<small>{[configLine(j.config), j.automatic ? t('scenebook.studio.queue.auto') : t('scenebook.studio.queue.manual'), j.slot ? t('scenebook.studio.queue.redraw') : '', new Date(j.ts).toLocaleTimeString(locale())].filter(Boolean).join(' · ')}</small>{j.error ? <small className="err">{j.error}</small> : null}</div>
      {j.state === 'waiting' ? <IBtn ic="x" title={t('scenebook.studio.queue.cancelJob')} cls="tiny" onClick={() => { I.cancelWaiting(x => x === j); }} /> : null}
      {(j.state === 'failed' || j.state === 'uncertain' || j.state === 'cancelled') && cur().msgs?.includes(j.msg) ? <Btn label={t('scenebook.retry')} cls="ghost" onClick={guard(() => { j.seen = true; draw(j.msg, [j.scene], j.config, j.slot, true); })} /> : null}
      {j.state === 'done' && cur().msgs?.includes(j.msg) ? <Btn label={t('scenebook.studio.queue.view')} cls="ghost" onClick={() => { go('chat', j.chat.id); setTimeout(() => chatApi.scrollTo(j.msg.id), 400); }} /> : null}</div>)}</div>}
  </div>;
}

// ════════ 틀 ════════
const tabs = (): [TabId, string, string][] => [['gen', t('scenebook.studio.tab.gen'), 'sliders'], ['cast', t('scenebook.cast'), 'user'], ['refs', t('scenebook.studio.tab.refs'), 'image'], ['gallery', t('scenebook.studio.tab.gallery'), 'folder'], ['queue', t('scenebook.studio.tab.queue'), 'menu']];
type Shown = { id: TabId; n: number; refs?: Card[]; all?: Card[]; err?: string };
/** 기능 › 삽화 화면의 안쪽 (바깥 상자 div.sb-studio 는 부르는 쪽이 만든다) */
export function Studio() {
  const bump = useBump(), [tab, setTab] = useState<TabId>(studioTab), [shown, setShown] = useState<Shown | null>(null), [hv, setHv] = useState(0), [note, setNote] = useState('');
  const ticket = useRef(0), alive = useRef(true), head = useRef<HTMLDivElement>(null);
  const open = async (id: TabId) => {
    studioTab = id; const n = ++ticket.current, next: Shown = { id, n }; if (alive.current) setTab(id);
    try {
      if (id === 'refs' || id === 'gallery') {
        // 처음 한 번(또는 새 그림이 많이 생긴 뒤)만 줄마다 읽는다. 오래 걸리면 얼마나 읽었는지 알려 준다
        const pics = (l: Card[]) => l.filter(a => a.kind === 'illust').sort((a, b) => b.ts - a.ts);
        let early = 0;
        const list = await shelf((done, total, part) => {
          if (total <= 12 || n !== ticket.current || !alive.current) return;
          setNote(t('scenebook.studio.gal.indexing', { done, total }));
          // 읽은 데까지 먼저 보여 준다 — 첫 화면이 찰 때까지만. 그 뒤로 계속 바꿔 끼우면 보이던 칸이 자꾸 바뀌어 작은 그림을 만들다 버리기를 되풀이한다
          if (id === 'gallery' && done < total && early < PAGE) { const p = pics(part); early = p.length; setShown({ id, n, all: p }); }
        });
        if (id === 'refs') next.refs = list.filter(r => r.kind === 'illust-ref').sort((a, b) => a.ts - b.ts);
        else next.all = pics(list);
      }
    } catch (e) { console.error(e); next.err = errText(e); }
    if (n === ticket.current && alive.current) setNote('');
    if (n === ticket.current && alive.current) setShown(next);
  };
  useEffect(() => {
    alive.current = true; void open(studioTab);
    const offJobs = C.on('illust:jobs', () => { bump(); if (studioTab === 'queue') void open('queue'); });
    const offSet = C.on('settings', p => { if ((p as { illust?: unknown } | undefined)?.illust && !head.current?.contains(document.activeElement)) setHv(v => v + 1); });
    return () => { alive.current = false; offJobs(); offSet(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 머리의 「바꾸기」: 생성 탭의 장면 쓰기 묶음을 펴서 그 자리로
  const toWriter = async () => { openGroups.add('writer'); await open('gen'); requestAnimationFrame(() => document.querySelector('.sb-studio details[data-g="writer"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' })); };
  const reopen = () => { if (shown) void open(shown.id); }, busy = Illust.queue().filter(active).length;
  let page: ReactNode = null; const k = shown ? `${shown.id}-${shown.n}` : '';   // 탭을 다시 열 때마다 새로 만든다
  if (shown) page = shown.err ? <p className="err" key={k}>{shown.err}</p> : shown.id === 'gen' ? <GenPage key={k} reopen={reopen} /> : shown.id === 'cast' ? <CastPage key={k} reopen={reopen} /> : shown.id === 'refs' ? <RefsPage key={k} reopen={reopen} refs={shown.refs || []} /> : shown.id === 'gallery' ? <GalleryPage key={k} reopen={reopen} all={shown.all || []} /> : <QueuePage key={k} reopen={reopen} />;
  return <>
    <div className="sb-head" ref={head}><ConnBar key={hv} /><Workflow redraw={() => setHv(v => v + 1)} toWriter={toWriter} />
      <div className="sb-quick sb-tiles"><Btn label={t('scenebook.compose')} ic="edit" onClick={guard(() => compose())} /><Btn label={t('scenebook.readImage')} ic="image" onClick={() => imageImport(() => { setHv(v => v + 1); void open('gen'); })} /><Btn label={t('scenebook.plans')} ic="note" onClick={showPlans} /></div></div>
    <div className="tabs sb-tabs" role="tablist" aria-label={t('scenebook.studio.tabsLabel')}>{tabs().map(([k, l, ic]) => <button key={k} type="button" className={'tab' + (k === tab ? ' on' : '')} role="tab" onClick={() => void open(k)}><Icon name={ic} size={15} />{l}{k === 'queue' && busy ? <em className="badge on">{String(busy)}</em> : null}</button>)}</div>
    {note ? <p className="hint sb-indexing" role="status">{note}</p> : null}
    <div className="sb-page">{page}</div>
  </>;
}
export function openStudio(tab?: string) {
  if (tab && tabs().some(x => x[0] === tab)) studioTab = tab as TabId;
  openModal({ title: t('scenebook.illust'), wide: true, cls: 'sb-studio' }, () => <Studio />).el.querySelector('.modal')?.classList.add('sb-editor');
}

/** 대화 옆 패널의 삽화 칸 */
export function Panel() {
  const bump = useBump(), I = Illust;
  useEffect(() => C.on('illust:jobs', bump), [bump]);
  const c = I.cfg(), q = I.queue(), { msgs } = cur(), n = (msgs || []).reduce((a, m) => a + (m.swipes?.[m.sw]?.illust?.filter(it => !it.hidden).length || 0), 0);
  const mode = { off: t('scenebook.studio.panel.off'), review: t('scenebook.studio.auto.review'), generate: t('scenebook.studio.auto.generate') }[c.automatic], paused = I.queuePaused(), line = queueText() || flow.note;
  return <>
    <div className="mem-stats">{([[t('scenebook.studio.panel.inChat'), n], [t('scenebook.studio.job.waiting'), q.filter(x => x.state === 'waiting').length], [t('scenebook.studio.panel.session'), `${I.usage()}`], [t('scenebook.studio.automatic'), mode]] as [string, string | number][]).map(([l, v]) => <div key={l}><b>{String(v)}</b><span>{l}</span></div>)}</div>
    {line ? <small className="hint">{line}</small> : null}
    <div className="row wrap"><Btn label={t('scenebook.studio.panel.studio')} ic="image" cls="ghost" onClick={() => openStudio()} /><Btn label={t('scenebook.compose')} ic="edit" cls="ghost" onClick={guard(() => compose())} /><Btn label={t('scenebook.studio.tab.gallery')} ic="folder" cls="ghost" onClick={() => openStudio('gallery')} />
      {q.some(active) || paused ? <Btn label={paused ? t('scenebook.studio.resume') : t('scenebook.studio.pause')} ic={paused ? 'play' : 'stop'} cls="ghost" onClick={() => I.toggleQueue()} /> : null}</div>
  </>;
}
