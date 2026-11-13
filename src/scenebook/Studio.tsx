// ════════ 스튜디오 ════════ 기능 › 삽화: 연결 · 자동 처리 + 생성 · 인물 · 참조 · 갤러리 · 작업 탭, 대화 옆 패널
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../kit';
import { Form, type FieldDef, confirmBox, menu, toast } from '../ui';
import { Area, Btn, Chk, Empty, Fld, Group, IBtn, Sel, Text, openModal, useBump } from './parts';
import { Frames, frameChoices, frameLayout, validFrame, type FrameLayout } from './frames';
import { LOOKS } from './framing';
import { INKS } from './ornaments';
import { fixModel } from './Composer';
import { guide, imageImport, promptEditor, showPlans, exportChat } from './dialogs';
import { inspect, review, showReview, viewer } from './slot';
import { compose, draw, flow, generateDrafts, pendingDrafts } from './work';
import type { Asset, Chat, GenConfig, HistoryEntry, IllustCfg, Job, LibPerson, Msg, RefUse, Visual } from './types';

import { go } from '../lib/router';
import { chatApi } from '../chat/actions';
import * as IL from '../lib/illust';
import * as C from '../lib/core';
import { blankScene, clone, configLine, cur, errText, guard, lastReply, pickKeys, when } from './util';
import { Illust } from './illust';
import { locale, t, tn } from '../i18n';

type TabId = 'gen' | 'cast' | 'refs' | 'gallery' | 'queue';
let studioTab: TabId = 'gen', castScope: string | null = null;
const GEN_EXTRA = ['naiKey', 'maxScenes', 'every', 'sessionLimit', 'contextMessages', 'analysisMode', 'placement', 'displayWidth', 'compact', 'autoSize', 'look', 'leanPrompt', 'frame', 'frameWide', 'frameInk'];
const TIERS = ['Paper', 'Tablet', 'Scroll', 'Opus'];
const tierName = (t?: number | null) => t != null ? (TIERS[t] || t) : null;
const queueText = () => { const I = Illust, w = I.queue().filter(x => x.state === 'waiting').length; return I.queueRunning() && I.queue().some(x => x.state === 'running') ? t('scenebook.studio.q.drawing') + (w ? t('scenebook.studio.q.waitSuffix', { n: w }) : '') : I.queuePaused() ? t('scenebook.studio.q.paused') + (w ? t('scenebook.studio.q.waitSuffix', { n: w }) : '') : w ? t('scenebook.studio.q.wait', { n: w }) : ''; };
const statusText = () => queueText() || flow.note || t('scenebook.studio.autoSaveNote');
const active = (x: Job) => x.state === 'waiting' || x.state === 'running';

/** 액자의 선 장식 · 가져온 액자 그림 (그림 뒤에 놓는다) */
export const FrameArt = ({ lay }: { lay: FrameLayout }) => <>
  {lay.ornament ? <svg xmlns="http://www.w3.org/2000/svg" viewBox={lay.ornament.viewBox} className="sb-ornament" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: lay.ornament.inner }} /> : null}
  {lay.art ? <img className="sb-frame-art" src={lay.art} alt="" draggable={false} /> : null}</>;

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
function Workflow({ redraw }: { redraw: () => void }) {
  const c = Illust.cfg();
  const help = c.automatic === 'off' ? t('scenebook.studio.wf.offHelp')
    : `${c.mode === 'plan' ? t('scenebook.studio.wf.planHelp') : t('scenebook.studio.wf.callHelp')} → ${c.automatic === 'review' ? t('scenebook.studio.wf.draftOnly') : t('scenebook.studio.wf.drawAttach')} · ${c.every > 1 ? tn('scenebook.studio.wf.everyN', c.every) : t('scenebook.studio.wf.everyReply')}`;
  return <section className="sb-workflow">
    <div className="sb-wf-row"><Fld label={t('scenebook.studio.automatic')}><Sel opts={[['off', t('scenebook.studio.auto.off')], ['review', t('scenebook.studio.auto.review')], ['generate', t('scenebook.studio.auto.generate')]]} value={c.automatic} onChange={v => { Illust.saveCfg({ automatic: v as IllustCfg['automatic'] }); redraw(); }} /></Fld>
      <Fld label={t('scenebook.studio.wf.method')}><Sel opts={[['plan', t('scenebook.studio.wf.methodPlan')], ['call', t('scenebook.studio.wf.methodCall')]]} value={c.mode} onChange={v => { Illust.saveCfg({ mode: v }); redraw(); }} /></Fld>
      <Btn label={t('scenebook.prompt')} ic="edit" cls="ghost" title={t('scenebook.studio.wf.promptTitle')} onClick={() => promptEditor(2)} /></div>
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
      return [box.saved ? t('scenebook.studio.saved') : t('scenebook.studio.autoSaveHint'), false];
    } catch (e) { return [t('scenebook.studio.needCheck', { error: errText(e) }), true]; }
  };
  const save = () => {   // 이 화면에서 바꾼 항목만 저장한다 (다른 곳에서 바꾼 값을 덮어쓰지 않게)
    fixModel(d); box.saved = true; const patch = Object.fromEntries(GEN_KEYS.filter(k => JSON.stringify(d[k]) !== JSON.stringify(box.base[k])).map(k => [k, d[k]])); box.base = clone(d);
    if (Object.keys(patch).length) Illust.saveCfg(patch); bump(); if (d.backend + d.model !== box.shape) { box.shape = d.backend + d.model; reopen(); }
  };
  const [state, bad] = verify();
  const f = (defs: (FieldDef | false | undefined)[]) => <Form obj={d} defs={defs} onChange={save} />, conns: [string, string][] = [['', t('scenebook.studio.pick')], ...S.conns.map((x): [string, string] => [x.id, x.name])];
  const sizes = <div className="row wrap sb-sizes">{([[t('scenebook.orient.portrait'), 832, 1216], [t('scenebook.orient.square'), 1024, 1024], [t('scenebook.orient.landscape'), 1216, 832]] as [string, number, number][]).map(([l, w, hh]) => <button key={l} type="button" className={'chip' + (d.width === w && d.height === hh ? ' on' : '')} onClick={() => { d.width = w; d.height = hh; save(); reopen(); }}>{`${l} ${w}×${hh}`}</button>)}</div>;
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
  const presets = c.presets || [];
  return <div className="sb-gen">
    <Group title={t('scenebook.studio.g.image')}>{f([
      { k: 'backend', label: t('scenebook.studio.backend'), type: 'select', opts: Object.entries(BACKENDS), half: true, live: true },
      nai && { k: 'model', label: t('scenebook.gen.model'), type: 'select', opts: Object.entries(MODELS).map(([id, m]): [string, string] => [id, m.label]), half: true, live: true },
      nai && { k: 'naiKey', label: t('scenebook.studio.naiKey'), type: 'password', hint: t('scenebook.studio.naiKeyHint') },
      api && { k: 'connId', label: t('scenebook.studio.connId'), type: 'select', opts: conns, half: true }, api && { k: 'imgModel', label: t('scenebook.studio.imgModel'), ph: d.backend === 'gemini' ? 'gemini-3.1-flash-image' : 'gpt-image-1', half: true },
      sd && { k: 'a1111', label: t('scenebook.studio.a1111'), half: true },
      { k: 'width', label: t('scenebook.gen.width'), type: 'num', min: 64, max: 4096, step: 64, half: true }, { k: 'height', label: t('scenebook.gen.height'), type: 'num', min: 64, max: 4096, step: 64, half: true }, { el: sizes },
      { k: 'autoSize', label: t('scenebook.studio.autoSize'), type: 'check', hint: t('scenebook.studio.autoSizeHint') },
      (nai || sd) && { k: 'steps', label: 'Steps', type: 'num', min: 1, max: 150, step: 1, half: true }, (nai || sd) && { k: 'scale', label: 'Guidance', type: 'num', min: 0, max: 30, step: 0.1, half: true },
      { k: 'look', label: t('scenebook.studio.look'), type: 'select', opts: LOOKS.map(([id, label]): [string, string] => [id, label]), hint: t('scenebook.studio.lookHint') }])}</Group>
    <Group title={t('scenebook.prompt')}>{f([{ k: 'style', label: t('scenebook.studio.styleLabel'), type: 'area', rows: 3, ph: 'watercolor, soft lighting …' }, { k: 'negative', label: t('scenebook.uc'), type: 'area', rows: 2 }, { k: 'quality', label: t('scenebook.qualityAuto'), type: 'check' },
      { k: 'leanPrompt', label: t('scenebook.studio.lean'), type: 'check', hint: t('scenebook.studio.leanHint') }])}
      <div className="row"><Btn label={t('scenebook.studio.editShare')} ic="edit" cls="ghost" onClick={() => promptEditor(0, reopen)} /><small className="hint">{t('scenebook.studio.editShareHint')}</small></div></Group>
    <Group title={t('scenebook.manual')}><Form obj={S.settings} defs={[{ k: 'helpers.illust', label: t('scenebook.guide.topic.conn.title'), type: 'select', opts: [['', t('scenebook.studio.chatConn')], ...S.conns.map((x): [string, string] => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`])], hint: t('scenebook.studio.analysisConnHint') }]} onChange={() => S.set({})} />
      {f([{ k: 'analysisMode', label: t('scenebook.guide.topic.analysis.title'), type: 'select', opts: [['quick', t('scenebook.studio.quick')], ['precise', t('scenebook.studio.precise')]], half: true }, { k: 'contextMessages', label: t('scenebook.guide.topic.context.title'), type: 'num', min: 0, max: 30, step: 1, half: true }])}
      <div className="row"><Btn label={t('scenebook.studio.analyzeLast')} ic="sparkle" onClick={guard(() => compose(lastReply(), { manual: false }))} /><small className="hint">{t('scenebook.studio.analyzeLastHint')}</small></div></Group>
    <Group title={t('scenebook.studio.g.limits')}>{f([{ k: 'maxScenes', label: t('scenebook.studio.maxScenesPer'), type: 'num', min: 1, max: 6, step: 1, third: true }, { k: 'every', label: t('scenebook.studio.v.every'), type: 'num', min: 1, max: 20, step: 1, third: true }])}
      <small className="hint">{tn('scenebook.studio.usage', Illust.usage())}</small></Group>
    <Group title={t('scenebook.studio.g.advanced')}>{f([
      nai && { k: 'sampler', label: t('scenebook.gen.sampler'), type: 'select', opts: SAMPLERS, half: true }, nai && { k: 'scheduler', label: v5 ? t('scenebook.studio.schedulerV5') : t('scenebook.gen.scheduler'), type: 'select', opts: v5 ? ['karras'] : SCHEDULERS, half: true },
      sd && { k: 'sdSampler', label: t('scenebook.gen.sampler'), ph: 'Euler a', half: true },
      (nai || sd) && { k: 'seed', label: 'Seed', type: 'num', min: -1, max: 4294967295, step: 1, half: true, hint: t('scenebook.gen.seedHint') }, nai && { k: 'cfgRescale', label: 'CFG rescale', type: 'num', min: 0, max: 1, step: 0.05, half: true },
      { k: 'useCoords', label: t('scenebook.studio.useCoords'), type: 'check' }, { k: 'useOrder', label: t('scenebook.useOrder'), type: 'check' },
      nai && v5 && { k: 'transparent', label: t('scenebook.gen.transparent'), type: 'check' },
      nai && { k: 'budgetGuard', label: t('scenebook.gen.budget'), type: 'check', hint: t('scenebook.studio.budgetHint') }])}</Group>
    <Group title={t('scenebook.studio.g.display')}>{f([{ k: 'placement', label: t('scenebook.anchor'), type: 'select', opts: [['end', t('scenebook.para.end')], ['inline', t('scenebook.studio.inline')]], half: true }, { k: 'displayWidth', label: t('scenebook.studio.widthPx'), type: 'num', min: 240, max: 1200, step: 10, half: true }, { k: 'compact', label: t('scenebook.studio.compact'), type: 'check' }])}
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
      {presets.length ? <div className="col">{presets.map(p => <div className="sb-preset" key={p.name}><b>{p.name}</b><small>{configLine(p.config)}</small><Btn label={t('scenebook.studio.apply')} cls="ghost" onClick={() => { Illust.saveCfg(pickKeys(p.config, RENDER_KEYS), { reason: t('scenebook.studio.reason.beforePreset', { name: p.name }), force: true }); toast(t('scenebook.studio.preset.applied', { name: p.name }), 'ok'); reopen(); }} />
        <IBtn ic="trash" title={t('scenebook.studio.preset.delete')} cls="tiny" onClick={async () => { if (!(await confirmBox(t('scenebook.studio.preset.deleteAsk', { name: p.name }), t('scenebook.delete'), true))) return; Illust.saveCfg({ presets: Illust.cfg().presets.filter(x => x.name !== p.name) }); reopen(); }} /></div>)}</div>
        : <small className="hint">{t('scenebook.studio.preset.hint')}</small>}
      <div className="row wrap"><Btn label={t('scenebook.studio.history')} cls="ghost" onClick={history} /><Btn label={t('scenebook.studio.export')} ic="import" cls="ghost" onClick={exportAll} /><Btn label={t('scenebook.studio.import')} ic="upload" cls="ghost" onClick={importAll} /></div></Group>
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
async function prepareReference(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error(t('scenebook.studio.refs.pickFile'));
  const bmp = await createImageBitmap(file);
  try {
    const ratio = bmp.width / bmp.height, [width, height] = ratio > 1.2 ? [1536, 1024] : ratio < 0.83 ? [1024, 1536] : [1472, 1472];
    const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
    const ctx = cv.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    const k = Math.min(width / bmp.width, height / bmp.height); ctx.drawImage(bmp, (width - bmp.width * k) / 2, (height - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
    return { data: cv.toDataURL('image/png'), width, height };
  } finally { bmp.close(); }
}
type RefRow = RefUse & { enabled: boolean; strength: number; fidelity: number; information: number };
function Slider({ row, k, label, later }: { row: RefRow; k: 'strength' | 'fidelity' | 'information'; label: string; later: () => void }) {
  const bump = useBump();
  return <Fld label={label} cls="third"><div className="range"><input type="range" min={0} max={1} step={0.05} defaultValue={row[k]} onChange={e => { row[k] = +e.target.value; bump(); later(); }} /><output>{Number(row[k]).toFixed(2)}</output></div></Fld>;
}
function RefsPage({ reopen, refs }: { reopen: () => void; refs: Asset[] }) {
  const bump = useBump(), c = Illust.cfg(), { MODELS, REF_OWNER } = IL;
  const [m] = useState(() => { const chosen = new Map((c.references || []).map(r => [r.id, { ...r }]));
    return { state: t('scenebook.studio.autoSaved'), bad: false, rows: new Map(refs.map((r): [string, RefRow] => [r.id, { id: r.id, enabled: chosen.has(r.id), kind: 'vibe', mode: 'character', strength: 0.6, fidelity: 1, information: 1, ...(chosen.get(r.id) || {}) }])) }; });
  const [act] = useState(() => {
    const commit = () => { const references = [...m.rows.values()].filter(r => r.enabled).map(({ enabled: _e, ...r }) => r); Illust.saveCfg({ references });
      try { Illust.validate(Illust.genConfig()); m.state = t('scenebook.studio.autoSaved'); m.bad = false; } catch (e) { m.state = t('scenebook.studio.needCheck', { error: errText(e) }); m.bad = true; } bump(); };
    return { commit, later: C.debounce(commit, 300) };
  });
  const { commit, later } = act;
  const upload = guard(async () => { const [f] = await C.pickFiles({ accept: 'image/png,image/jpeg,image/webp' }); if (!f) return; const img = await prepareReference(f); await C.DB.put('assets', { id: C.uid(), owner: REF_OWNER, kind: 'illust-ref', name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 100), ...img, ts: C.now() }); toast(t('scenebook.studio.refs.added'), 'ok'); reopen(); });
  const remove = (r: Asset) => guard(async () => {
    if (!(await confirmBox(t('scenebook.studio.refs.deleteAsk', { name: r.name }), t('scenebook.delete'), true))) return;
    await C.DB.del('assets', r.id); Illust.cancelWaiting(j => j.config.references?.some(x => x.id === r.id));
    const now0 = Illust.cfg(); Illust.saveCfg({ references: (now0.references || []).filter(x => x.id !== r.id), presets: now0.presets.map(p => ({ ...p, config: { ...p.config, references: (p.config.references || []).filter(x => x.id !== r.id) } })) });
    toast(t('scenebook.studio.refs.deleted')); reopen(); });
  const off = c.backend !== 'nai' || !MODELS[c.model]?.references;
  return <div className="sb-refs">
    <p className="hint">{t('scenebook.studio.refs.intro')}</p>
    {off ? <div className="sb-note"><Icon name="image" size={15} /><span>{c.backend !== 'nai' ? t('scenebook.studio.refs.offEngine') : t('scenebook.studio.refs.offModel')}</span></div> : null}
    <div className="row wrap"><Btn label={t('scenebook.studio.refs.add')} ic="plus" onClick={upload} />{refs.length ? <Btn label={t('scenebook.studio.refs.clearAll')} cls="ghost" onClick={() => { Illust.saveCfg({ references: [] }); reopen(); }} /> : null}<span className="sb-grow" /><span className={'sb-state' + (m.bad ? ' bad' : '')}>{m.state}</span></div>
    {!refs.length ? <Empty>{t('scenebook.studio.refs.empty')}</Empty> : <div className="sb-ref-grid">{refs.map(r => { const row = m.rows.get(r.id) as RefRow;
      return <div key={r.id} className={'sb-ref' + (row.enabled ? ' on' : '')}><div className="sb-ref-img"><img src={r.data} alt={r.name} loading="lazy" /></div>
        <div className="col"><div className="row"><b className="sb-grow">{r.name}</b><IBtn ic="trash" title={t('scenebook.studio.refs.delete')} cls="tiny" onClick={remove(r)} /></div><Chk label={t('scenebook.studio.refs.use')} checked={row.enabled} onChange={val => { row.enabled = val; commit(); }} />
          <div className="form"><Fld label={t('scenebook.studio.refs.kind')} cls="half"><Sel opts={[['vibe', t('scenebook.studio.refs.kindVibe')], ['precise', t('scenebook.studio.refs.kindPrecise')]]} value={row.kind} onChange={val => { row.kind = val; commit(); }} /></Fld><Fld label={t('scenebook.studio.refs.preciseMode')} cls="half"><Sel opts={[['character', t('scenebook.person')], ['style', t('scenebook.studio.refs.style')], ['character&style', t('scenebook.studio.refs.charStyle')]]} value={row.mode} onChange={val => { row.mode = val; commit(); }} /></Fld>
            <Slider row={row} k="strength" label={t('scenebook.studio.refs.strength')} later={later} /><Slider row={row} k="fidelity" label={t('scenebook.studio.refs.fidelity')} later={later} /><Slider row={row} k="information" label={t('scenebook.studio.refs.information')} later={later} /></div></div></div>; })}</div>}
  </div>;
}

// ════════ 갤러리 탭 ════════
/** 그림을 완전히 지운다 (대화 속 버전에서도 뺀다) */
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
const jobOff = (): Record<string, string> => ({ failed: t('scenebook.studio.job.failed'), uncertain: t('scenebook.studio.job.uncertain'), running: t('scenebook.job.running'), waiting: t('scenebook.studio.job.waiting') });
function GalleryPage({ reopen, all }: { reopen: () => void; all: Asset[] }) {
  const S = C.S, I = Illust, chat = cur().chat, SIZE = 24;
  const [query, setQuery] = useState(''), [scope, setScope] = useState('all'), [page0, setPage] = useState(0);
  const chatOf = (a: Asset) => String(a.owner).replace(/^chat:/, '');
  const chatName = (a: Asset) => { const c = S.get('chats', chatOf(a)); return c ? (c.name || c.charIds.map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || t('scenebook.studio.gal.chat')) : t('scenebook.studio.gal.deletedChat'); };
  const [used] = useState(() => new Set((cur().msgs || []).flatMap(m => (m.swipes || []).flatMap(sw => (sw.illust || []).flatMap(it => [it.id, ...(it.versions || []).map(v => v.id)])))));
  const target = () => { const m = lastReply(); if (!m) throw new Error(t('scenebook.studio.gal.openChatFirst')); return m; };
  const openJob = (j: Job) => openModal({ title: j.label || t('scenebook.illust'), cls: 'col', actions: [
    { label: t('scenebook.record'), ic: 'note', cls: 'ghost', onclick: () => { inspect({ scene: j.scene, config: j.config, ts: j.ts }); return false; } },
    (j.state === 'failed' || j.state === 'uncertain') && cur().msgs?.includes(j.msg) && { label: t('scenebook.retry'), cls: 'primary', onclick: () => { try { j.seen = true; draw(j.msg, [j.scene], j.config, j.slot, true); reopen(); } catch (e) { toast(errText(e), 'err'); return false; } } }] },
    () => <><p>{j.error || t('scenebook.studio.gal.notFinal')}</p><small className="hint">{[configLine(j.config), when(j.ts)].filter(Boolean).join(' · ')}</small></>);
  const open = (a: Asset) => viewer({ title: a.title || t('scenebook.illust'), src: a.data, sub: [chatName(a), when(a.ts), configLine(a.config), a.seed != null ? `Seed ${a.seed}` : ''].filter(Boolean).join(' · '),
    actions: [
      { label: t('scenebook.studio.gal.insert'), ic: 'plus', run: async () => { const m = target(), here = 'chat:' + (cur().chat as Chat).id; let rec = a; if (a.owner !== here) { rec = { ...a, id: C.uid(), owner: here, ts: C.now() }; await C.DB.put('assets', rec); } I.insert(m.swipes[m.sw], rec); await chatApi.save(); chatApi.redraw(); toast(t('scenebook.studio.gal.inserted'), 'ok'); } },
      { label: t('scenebook.openAsScene'), ic: 'sliders', run: () => compose(target(), { initial: [a.scene || { ...blankScene(), title: a.title || '', prompt: a.prompt || '' }], config: a.config ? { ...a.config, seed: -1 } : null }) },
      { label: t('scenebook.delete'), ic: 'trash', run: async () => { if (!(await confirmBox(t('scenebook.studio.gal.deleteAsk'), t('scenebook.delete'), true))) return; await purgeAsset(a); toast(t('scenebook.studio.gal.deleted')); reopen(); } }],
    more: [{ label: t('scenebook.review.run'), ic: 'search', onclick: guard(() => review(a)) }, ...(a.review ? [{ label: t('scenebook.review.last'), ic: 'eye', onclick: () => showReview(a.review || {}) }] : []), { label: t('scenebook.record'), ic: 'note', onclick: () => inspect(a) }, ...(S.get('chats', chatOf(a)) ? [{ label: t('scenebook.studio.gal.goChat'), ic: 'chat', onclick: () => go('chat', chatOf(a)) }] : [])] });
  const q = query.trim().toLowerCase(), mine = (a: Asset) => !!chat && a.owner === 'chat:' + chat.id, off = scope === 'failed';
  const jobs = off ? [...I.queue()].reverse().filter(j => jobOff()[j.state] && (!q || [j.label, j.scene?.prompt, ...(j.scene?.characters || []).map(x => x.name)].join(' ').toLowerCase().includes(q))) : [];
  const pics = off ? [] : all.filter(a => (scope !== 'chat' || mine(a)) && (scope !== 'loose' || (mine(a) && !used.has(a.id))) && (!q || [a.title, a.prompt, a.scene?.camera, ...(a.scene?.characters || []).map(x => x.name), chatName(a)].join(' ').toLowerCase().includes(q)));
  const total = off ? jobs.length : pics.length, pages = Math.max(1, Math.ceil(total / SIZE)), page = Math.max(0, Math.min(page0, pages - 1)), cut = <T,>(l: T[]) => l.slice(page * SIZE, (page + 1) * SIZE);
  return <div className="sb-gallery-page">
    <div className="sb-gallery-bar"><input className="inp" type="search" placeholder={t('scenebook.studio.gal.searchPh')} aria-label={t('scenebook.studio.gal.search')} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} />
      <Sel opts={[['all', t('scenebook.studio.gal.all')], ...(chat ? [['chat', t('scenebook.studio.gal.thisChat')], ['loose', t('scenebook.studio.gal.loose')]] as [string, string][] : []), ['failed', t('scenebook.studio.gal.unfinished')]]} value="all" onChange={val => { setScope(val); setPage(0); }} />
      <IBtn ic="more" title={t('scenebook.more')} onClick={e => menu(e.currentTarget, [{ label: t('scenebook.studio.refresh'), ic: 'refresh', onclick: reopen }, { label: t('scenebook.studio.gal.exportChat'), ic: 'import', onclick: exportChat }])} /></div>
    <p className="hint" role="status">{tn('scenebook.studio.gal.count', total, { scope: off ? t('scenebook.studio.gal.scopeUnfinished') : scope === 'chat' ? t('scenebook.studio.gal.thisChat') : scope === 'loose' ? t('scenebook.studio.gal.scopeLoose') : t('scenebook.studio.gal.scopeAll') })}</p>
    <div className="sb-gallery">
      {cut(jobs).map(j => <button key={j.id} type="button" className="sb-shot" title={j.label || t('scenebook.illust')} aria-label={t('scenebook.studio.gal.checkJob', { title: j.label || t('scenebook.illust') })} onClick={() => openJob(j)}><i className={`sb-shot-off ${j.state}`}>{jobOff()[j.state]}</i><span>{j.label || t('scenebook.illust')}</span><small>{j.error || configLine(j.config)}</small></button>)}
      {cut(pics).map(a => <button key={a.id} type="button" className="sb-shot" title={a.title || t('scenebook.illust')} aria-label={t('scenebook.studio.gal.view', { title: a.title || t('scenebook.illust') })} onClick={() => open(a)}><img src={a.data} alt="" loading="lazy" decoding="async" />{a.review ? <em className="sb-shot-mark" title={t('scenebook.studio.gal.hasReview')}>{t('scenebook.studio.gal.reviewMark')}</em> : null}<span>{a.title || t('scenebook.illust')}</span><small>{chatName(a)}</small></button>)}
      {!total ? <Empty>{off ? (q ? t('scenebook.studio.gal.noJobMatch') : t('scenebook.studio.gal.noJobs')) : q ? t('scenebook.studio.gal.noMatch') : t('scenebook.studio.gal.empty')}</Empty> : null}</div>
    <div className="sb-pager" hidden={pages < 2}><IBtn ic="left" title={t('scenebook.studio.prevPage')} disabled={page === 0} onClick={() => setPage(page - 1)} /><span className="hint">{`${page + 1} / ${pages}`}</span><IBtn ic="right" title={t('scenebook.studio.nextPage')} disabled={page >= pages - 1} onClick={() => setPage(page + 1)} /></div>
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
      <div className="col"><b>{j.label || t('scenebook.illust')}</b><small>{[configLine(j.config), j.automatic ? t('scenebook.studio.queue.auto') : t('scenebook.studio.queue.manual'), j.slot ? t('scenebook.studio.queue.redraw') : '', new Date(j.ts).toLocaleTimeString(locale())].filter(Boolean).join(' · ')}</small>{j.error ? <small className="err">{j.error}</small> : null}</div>
      {j.state === 'waiting' ? <IBtn ic="x" title={t('scenebook.studio.queue.cancelJob')} cls="tiny" onClick={() => { I.cancelWaiting(x => x === j); }} /> : null}
      {(j.state === 'failed' || j.state === 'uncertain' || j.state === 'cancelled') && cur().msgs?.includes(j.msg) ? <Btn label={t('scenebook.retry')} cls="ghost" onClick={guard(() => { j.seen = true; draw(j.msg, [j.scene], j.config, j.slot, true); })} /> : null}
      {j.state === 'done' && cur().msgs?.includes(j.msg) ? <Btn label={t('scenebook.studio.queue.view')} cls="ghost" onClick={() => { go('chat', j.chat.id); setTimeout(() => chatApi.scrollTo(j.msg.id), 400); }} /> : null}</div>)}</div>}
  </div>;
}

// ════════ 틀 ════════
const tabs = (): [TabId, string, string][] => [['gen', t('scenebook.studio.tab.gen'), 'sliders'], ['cast', t('scenebook.cast'), 'user'], ['refs', t('scenebook.studio.tab.refs'), 'image'], ['gallery', t('scenebook.studio.tab.gallery'), 'folder'], ['queue', t('scenebook.studio.tab.queue'), 'menu']];
type Shown = { id: TabId; n: number; refs?: Asset[]; all?: Asset[]; err?: string };
/** 기능 › 삽화 화면의 안쪽 (바깥 상자 div.sb-studio 는 부르는 쪽이 만든다) */
export function Studio() {
  const bump = useBump(), [tab, setTab] = useState<TabId>(studioTab), [shown, setShown] = useState<Shown | null>(null), [hv, setHv] = useState(0);
  const ticket = useRef(0), alive = useRef(true), head = useRef<HTMLDivElement>(null);
  const open = async (id: TabId) => {
    studioTab = id; const n = ++ticket.current, next: Shown = { id, n }; if (alive.current) setTab(id);
    try {
      if (id === 'refs') next.refs = ((await C.DB.byOwner(IL.REF_OWNER)) as unknown as Asset[]).filter(r => r.kind === 'illust-ref').sort((a, b) => (a.ts || 0) - (b.ts || 0));
      if (id === 'gallery') next.all = (await C.DB.all('assets') as unknown as Asset[]).filter(a => a.kind === 'illust' && a.data).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    } catch (e) { console.error(e); next.err = errText(e); }
    if (n === ticket.current && alive.current) setShown(next);
  };
  useEffect(() => {
    alive.current = true; void open(studioTab);
    const offJobs = C.on('illust:jobs', () => { bump(); if (studioTab === 'queue') void open('queue'); });
    const offSet = C.on('settings', p => { if ((p as { illust?: unknown } | undefined)?.illust && !head.current?.contains(document.activeElement)) setHv(v => v + 1); });
    return () => { alive.current = false; offJobs(); offSet(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const reopen = () => { if (shown) void open(shown.id); }, busy = Illust.queue().filter(active).length;
  let page: ReactNode = null; const k = shown ? `${shown.id}-${shown.n}` : '';   // 탭을 다시 열 때마다 새로 만든다
  if (shown) page = shown.err ? <p className="err" key={k}>{shown.err}</p> : shown.id === 'gen' ? <GenPage key={k} reopen={reopen} /> : shown.id === 'cast' ? <CastPage key={k} reopen={reopen} /> : shown.id === 'refs' ? <RefsPage key={k} reopen={reopen} refs={shown.refs || []} /> : shown.id === 'gallery' ? <GalleryPage key={k} reopen={reopen} all={shown.all || []} /> : <QueuePage key={k} reopen={reopen} />;
  return <>
    <div className="sb-head" ref={head}><ConnBar key={hv} /><Workflow redraw={() => setHv(v => v + 1)} />
      <div className="row wrap sb-quick"><Btn label={t('scenebook.compose')} ic="edit" onClick={guard(() => compose())} /><Btn label={t('scenebook.readImage')} ic="image" onClick={() => imageImport(() => { setHv(v => v + 1); void open('gen'); })} /><Btn label={t('scenebook.plans')} ic="note" cls="ghost" onClick={showPlans} /></div></div>
    <div className="tabs sb-tabs" role="tablist" aria-label={t('scenebook.studio.tabsLabel')}>{tabs().map(([k, l, ic]) => <button key={k} type="button" className={'tab' + (k === tab ? ' on' : '')} role="tab" onClick={() => void open(k)}><Icon name={ic} size={15} />{l}{k === 'queue' && busy ? <em className="badge on">{String(busy)}</em> : null}</button>)}</div>
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
