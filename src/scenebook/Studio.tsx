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

type TabId = 'gen' | 'cast' | 'refs' | 'gallery' | 'queue';
let studioTab: TabId = 'gen', castScope: string | null = null;
const GEN_EXTRA = ['naiKey', 'maxScenes', 'every', 'sessionLimit', 'contextMessages', 'analysisMode', 'placement', 'displayWidth', 'compact', 'autoSize', 'look', 'leanPrompt', 'frame', 'frameWide', 'frameInk'];
const TIERS = ['Paper', 'Tablet', 'Scroll', 'Opus'];
const tierName = (t?: number | null) => t != null ? (TIERS[t] || t) : null;
const queueText = () => { const I = Illust, w = I.queue().filter(x => x.state === 'waiting').length; return I.queueRunning() && I.queue().some(x => x.state === 'running') ? `삽화 그리는 중${w ? ` · 대기 ${w}` : ''}` : I.queuePaused() ? `생성 일시정지${w ? ` · 대기 ${w}` : ''}` : w ? `대기 ${w}` : ''; };
const statusText = () => queueText() || flow.note || '설정은 자동으로 저장됩니다.';
const active = (x: Job) => x.state === 'waiting' || x.state === 'running';

/** 액자의 선 장식 · 가져온 액자 그림 (그림 뒤에 놓는다) */
export const FrameArt = ({ lay }: { lay: FrameLayout }) => <>
  {lay.ornament ? <svg xmlns="http://www.w3.org/2000/svg" viewBox={lay.ornament.viewBox} className="sb-ornament" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: lay.ornament.inner }} /> : null}
  {lay.art ? <img className="sb-frame-art" src={lay.art} alt="" draggable={false} /> : null}</>;

function connHelp() {
  openModal({ title: '연결 안내', cls: 'col' }, () => <><p>NovelAI 로 그리려면 드림랜드 서버와 NovelAI 키가 필요합니다.</p><ol className="sb-help-steps">
    <li>드림랜드 폴더의 start.bat 을 실행하고, 거기서 알려 주는 주소로 드림랜드를 엽니다. NovelAI 는 브라우저에서 바로 부를 수 없어 이 서버를 거칩니다.</li>
    <li>NovelAI 사이트의 계정 설정에서 Persistent API Token 을 만들어 생성 탭의 NovelAI 키에 넣습니다. 키는 이 기기에만 저장됩니다.</li>
    <li>위의 확인을 눌러 구독 상태와 남은 Anlas 가 보이면 준비가 끝난 것입니다.</li></ol>
    <p className="hint">다른 그림 엔진(OpenAI 호환 · Gemini · Stable Diffusion WebUI)은 생성 탭의 그림 엔진에서 고릅니다.</p></>);
}
function ConnBar() {
  const c = Illust.cfg(), { BACKENDS } = IL, nai = c.backend === 'nai', alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const [st, setSt] = useState<[string, string]>(() => {
    if (nai) return [c.naiKey ? 'NovelAI · 키 저장됨' : 'NovelAI · 키를 넣어 주세요', c.naiKey ? 'ready' : 'warn'];
    if (c.backend === 'a1111') return [`Stable Diffusion WebUI · ${c.a1111 || 'http://127.0.0.1:7860'}`, 'ready'];
    const conn = C.S.get('conns', c.connId); return [conn ? `${BACKENDS[c.backend]} · ${conn.name}${c.imgModel ? ' · ' + c.imgModel : ''}` : `${BACKENDS[c.backend]} · 쓸 연결을 골라 주세요`, conn ? 'ready' : 'warn'];
  });
  const set = (t: string, state = '') => { if (alive.current) setSt([t, state]); };
  const check = async () => { set('연결 확인 중…'); try { const a = await Illust.account(); set(`NovelAI · 구독 ${a.active ? '활성' : '비활성'}${a.tier != null ? ` · ${tierName(a.tier)}` : ''}${a.anlas != null ? ` · Anlas ${a.anlas.toLocaleString()}` : ''}`, a.active ? 'ready' : 'warn'); } catch (e) { set(errText(e), 'warn'); } };
  return <div className="sb-conn" data-state={st[1]}><span className="sb-conn-label">{st[0]}</span>
    {nai ? <Btn label="확인" ic="refresh" cls="ghost" onClick={() => void check()} /> : null}{nai ? <Btn label="연결 안내" ic="plug" cls="ghost" onClick={connHelp} /> : null}<Btn label="사용법" ic="note" cls="ghost" onClick={guide} /></div>;
}
function Workflow({ redraw }: { redraw: () => void }) {
  const c = Illust.cfg();
  const help = c.automatic === 'off' ? '꺼짐 · 삽화 계획 지시와 자동 처리를 모두 멈춥니다. 메시지의 ⋯ 메뉴로 직접 그릴 수 있어요.'
    : `${c.mode === 'plan' ? '답변을 쓰는 모델이 답변 끝에 계획을 함께 적습니다 (추가 호출 없음)' : '답변이 끝난 뒤 보조 연결로 장면을 따로 뽑습니다 (추가 호출 1회)'} → ${c.automatic === 'review' ? '초안만 저장' : '바로 그려서 붙임'} · ${c.every > 1 ? `답변 ${c.every}개마다` : '답변마다'}`;
  return <section className="sb-workflow">
    <div className="sb-wf-row"><Fld label="자동 처리"><Sel opts={[['off', '끄기'], ['review', '초안만'], ['generate', '자동 생성']]} value={c.automatic} onChange={v => { Illust.saveCfg({ automatic: v as IllustCfg['automatic'] }); redraw(); }} /></Fld>
      <Fld label="장면을 정하는 방법"><Sel opts={[['plan', '답변과 함께 계획 (프롬프트 주입)'], ['call', '답변 뒤에 따로 분석']]} value={c.mode} onChange={v => { Illust.saveCfg({ mode: v }); redraw(); }} /></Fld>
      <Btn label="프롬프트" ic="edit" cls="ghost" title="삽화 계획 지시문 보기 · 고치기" onClick={() => promptEditor(2)} /></div>
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
      for (const [k, a, b, n] of [['maxScenes', 1, 6, '최대 장면'], ['every', 1, 20, '답변 간격'], ['contextMessages', 0, 30, '이전 메시지'], ['displayWidth', 240, 1200, '최대 너비']] as [string, number, number, string][]) { const v = d[k]; if (!Number.isInteger(v) || (v as number) < a || (v as number) > b) throw new Error(`${n}: ${a}~${b} 정수를 입력해 주세요.`); }
      return [box.saved ? '저장됨' : '변경하면 자동으로 저장됩니다', false];
    } catch (e) { return ['확인 필요 · ' + errText(e), true]; }
  };
  const save = () => {   // 이 화면에서 바꾼 항목만 저장한다 (다른 곳에서 바꾼 값을 덮어쓰지 않게)
    fixModel(d); box.saved = true; const patch = Object.fromEntries(GEN_KEYS.filter(k => JSON.stringify(d[k]) !== JSON.stringify(box.base[k])).map(k => [k, d[k]])); box.base = clone(d);
    if (Object.keys(patch).length) Illust.saveCfg(patch); bump(); if (d.backend + d.model !== box.shape) { box.shape = d.backend + d.model; reopen(); }
  };
  const [state, bad] = verify();
  const f = (defs: (FieldDef | false | undefined)[]) => <Form obj={d} defs={defs} onChange={save} />, conns: [string, string][] = [['', '골라 주세요'], ...S.conns.map((x): [string, string] => [x.id, x.name])];
  const sizes = <div className="row wrap sb-sizes">{([['세로', 832, 1216], ['정사각', 1024, 1024], ['가로', 1216, 832]] as [string, number, number][]).map(([l, w, hh]) => <button key={l} type="button" className={'chip' + (d.width === w && d.height === hh ? ' on' : '')} onClick={() => { d.width = w; d.height = hh; save(); reopen(); }}>{`${l} ${w}×${hh}`}</button>)}</div>;
  const customFrames = Frames.list(), presetName = useRef<HTMLInputElement>(null);
  const addFrame = guard(async () => { const [file] = await C.pickFiles({ accept: 'image/png,image/webp' }); if (!file) return; const rec = await Frames.add(file); Illust.saveCfg({ frame: `image:${rec.id}` }); toast('액자 그림을 추가했어요', 'ok'); reopen(); });
  const frameMenu = (anchor: Element) => menu(anchor, customFrames.map(fr => ({ label: `“${fr.name}” 삭제`, ic: 'trash', onclick: guard(async () => {
    if (!(await confirmBox(`“${fr.name}” 액자 그림을 지울까요?`, '지우기', true))) return;
    const now0 = Illust.cfg(), id = `image:${fr.id}`; await Frames.remove(fr.id); Illust.saveCfg({ frame: now0.frame === id ? 'soft' : now0.frame, frameWide: now0.frameWide === id ? '' : now0.frameWide }); reopen(); }) })));
  const history = () => { const list = Illust.cfg().history || [];
    openModal({ title: '이전 설정', cls: 'col' }, m => !list.length ? <Empty>보관된 이전 설정이 없어요. 다음 변경부터 자동으로 보관합니다.</Empty> : list.map((e: HistoryEntry, i) => <div className="sb-preset" key={i}><b>{`${when(e.time)} · ${e.reason}`}</b><small>{configLine(e.settings)}</small><Btn label="되돌리기" cls="ghost" onClick={() => { const { history: _h, ...rest } = e.settings; Illust.saveCfg(rest, { reason: '되돌리기 전', force: true }); m.close(); reopen(); toast('이전 설정으로 되돌렸어요', 'ok'); }} /></div>)); };
  const exportAll = () => { const { naiKey: _k, history: _h, ...rest } = Illust.cfg(); C.download('scenebook-settings.json', JSON.stringify({ kind: 'dreamland-illust', schema: 1, settings: rest }, null, 2)); };
  const importAll = guard(async () => {
    const [file] = await C.pickFiles({ accept: '.json,application/json' }); if (!file) return; if (file.size > 1000000) throw new Error('1MB 이하 설정 파일을 골라 주세요.');
    const v = JSON.parse(await file.text()) as { schema?: number; kind?: string; settings?: Record<string, unknown> } | null; if (v?.schema !== 1 || !v.settings || typeof v.settings !== 'object') throw new Error('삽화 설정 파일이 아니에요.');
    const s: Record<string, unknown> = { ...v.settings }; if (s.injectionPrompt !== undefined && s.planPrompt === undefined) s.planPrompt = s.injectionPrompt;   // 예전 형식의 설정 파일도 받는다
    if (!v.kind) { delete s.references; delete s.characterVisuals; s.presets = ((s.presets || []) as { name: string; config?: object }[]).map(p => ({ name: p.name, config: { ...pickKeys(p.config || {}, RENDER_KEYS), references: [] } })); if (s.promptInjection !== undefined) s.mode = 'plan'; }
    const known = Object.keys(Illust.cfg()).filter(k => !['naiKey', 'history', 'auto'].includes(k));
    Illust.saveCfg({ ...pickKeys(s, known), automatic: 'off' }, { reason: '가져오기 전', force: true }); reopen(); toast('설정을 가져왔어요. 자동 처리는 꺼 두었습니다.', 'ok');
  });
  const savePreset = guard(() => { const name = presetName.current?.value.trim(); if (!name) throw new Error('프리셋 이름을 적어 주세요.'); const list = Illust.cfg().presets || []; if (list.some(p => p.name === name)) throw new Error('같은 이름의 프리셋이 있어요.'); if (list.length >= 30) throw new Error('프리셋은 최대 30개예요.'); Illust.saveCfg({ presets: [...list, { name, config: pickKeys(Illust.cfg(), RENDER_KEYS) as GenConfig }] }); reopen(); });
  const presets = c.presets || [];
  return <div className="sb-gen">
    <Group title="이미지">{f([
      { k: 'backend', label: '그림 엔진', type: 'select', opts: Object.entries(BACKENDS), half: true, live: true },
      nai && { k: 'model', label: '모델', type: 'select', opts: Object.entries(MODELS).map(([id, m]): [string, string] => [id, m.label]), half: true, live: true },
      nai && { k: 'naiKey', label: 'NovelAI 키 (Persistent API Token)', type: 'password', hint: '이 기기에만 저장되고 백업 파일에는 들어가지 않습니다.' },
      api && { k: 'connId', label: '쓸 연결 (키와 주소를 빌려 씁니다)', type: 'select', opts: conns, half: true }, api && { k: 'imgModel', label: '이미지 모델', ph: d.backend === 'gemini' ? 'gemini-3.1-flash-image' : 'gpt-image-1', half: true },
      sd && { k: 'a1111', label: 'WebUI 주소 (--api 로 실행)', half: true },
      { k: 'width', label: '가로', type: 'num', min: 64, max: 4096, step: 64, half: true }, { k: 'height', label: '세로', type: 'num', min: 64, max: 4096, step: 64, half: true }, { el: sizes },
      { k: 'autoSize', label: '장면에 맞춰 세로 · 가로 전환', type: 'check', hint: '누운 장면은 가로, 서 있는 장면은 세로처럼 AI 가 장면마다 화면 비율을 고릅니다. 픽셀 수는 위 설정과 비슷하게 유지합니다.' },
      (nai || sd) && { k: 'steps', label: 'Steps', type: 'num', min: 1, max: 150, step: 1, half: true }, (nai || sd) && { k: 'scale', label: 'Guidance', type: 'num', min: 0, max: 30, step: 0.1, half: true },
      { k: 'look', label: '그림체', type: 'select', opts: LOOKS.map(([id, label]): [string, string] => [id, label]), hint: '선택 사항입니다. 고르면 그 그림체의 태그를 메인 프롬프트 앞에 붙입니다.' }])}</Group>
    <Group title="프롬프트">{f([{ k: 'style', label: '메인 프롬프트 (화풍 · 모든 그림 앞에 붙습니다)', type: 'area', rows: 3, ph: 'watercolor, soft lighting …' }, { k: 'negative', label: '피할 것 (UC)', type: 'area', rows: 2 }, { k: 'quality', label: '품질 태그 자동으로 붙이기', type: 'check' },
      { k: 'leanPrompt', label: '간결한 삽화 지시문', type: 'check', hint: '답변을 쓰는 모델에게 매번 보내는 삽화 지시문을 짧은 버전으로 바꿔 입력 토큰을 줄입니다. 삽화 지시가 자주 빠지면 끄세요.' }])}
      <div className="row"><Btn label="편집 · 공유" ic="edit" cls="ghost" onClick={() => promptEditor(0, reopen)} /><small className="hint">분석 · 주입 지시문도 여기서 고치고 파일로 주고받습니다.</small></div></Group>
    <Group title="수동 분석"><Form obj={S.settings} defs={[{ k: 'helpers.illust', label: '분석에 쓸 연결', type: 'select', opts: [['', '대화에 쓰는 연결'], ...S.conns.map((x): [string, string] => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`])], hint: '따로 고르지 않으면 지금 대화에 쓰는 연결로 분석합니다.' }]} onChange={() => S.set({})} />
      {f([{ k: 'analysisMode', label: '분석 방식', type: 'select', opts: [['quick', '빠르게'], ['precise', '정밀하게 (복장 변화 추적 · 호출 1회 추가)']], half: true }, { k: 'contextMessages', label: '참고할 앞 메시지 수', type: 'num', min: 0, max: 30, step: 1, half: true }])}
      <div className="row"><Btn label="마지막 답변 분석" ic="sparkle" onClick={guard(() => compose(lastReply(), { manual: false }))} /><small className="hint">삽화 지시가 없는 답변을 따로 분석해 장면 편집기를 엽니다.</small></div></Group>
    <Group title="자동 생성 한도">{f([{ k: 'maxScenes', label: '답변당 최대 장면', type: 'num', min: 1, max: 6, step: 1, third: true }, { k: 'every', label: '답변 간격', type: 'num', min: 1, max: 20, step: 1, third: true }])}
      <small className="hint">{`이번 접속에서 보낸 그림 요청 ${Illust.usage()}회`}</small></Group>
    <Group title="고급 설정">{f([
      nai && { k: 'sampler', label: '샘플러', type: 'select', opts: SAMPLERS, half: true }, nai && { k: 'scheduler', label: v5 ? '스케줄러 (V5 는 Karras 고정)' : '스케줄러', type: 'select', opts: v5 ? ['karras'] : SCHEDULERS, half: true },
      sd && { k: 'sdSampler', label: '샘플러', ph: 'Euler a', half: true },
      (nai || sd) && { k: 'seed', label: 'Seed', type: 'num', min: -1, max: 4294967295, step: 1, half: true, hint: '-1: 매번 새 값' }, nai && { k: 'cfgRescale', label: 'CFG rescale', type: 'num', min: 0, max: 1, step: 0.05, half: true },
      { k: 'useCoords', label: '인물 좌표 적용', type: 'check' }, { k: 'useOrder', label: '인물 순서 적용', type: 'check' },
      nai && v5 && { k: 'transparent', label: '투명 배경 (V5 전용)', type: 'check' },
      nai && { k: 'budgetGuard', label: '비용 보호', type: 'check', hint: '1메가픽셀 · 28 Steps 제한. 무료 생성을 보장하지는 않아요.' }])}</Group>
    <Group title="대화 표시">{f([{ k: 'placement', label: '삽입 위치', type: 'select', opts: [['end', '답변 아래'], ['inline', '문단 뒤 (못 찾으면 답변 아래)']], half: true }, { k: 'displayWidth', label: '최대 너비 (px)', type: 'num', min: 240, max: 1200, step: 10, half: true }, { k: 'compact', label: '작게 표시', type: 'check' }])}
      <span className="field-label">삽화 액자</span>
      {/* 삽화 액자: 고르는 칸마다 대화에서 쓰는 것과 같은 계산으로 액자를 그려 보여 준다 */}
      <div className="sb-frames" role="radiogroup" aria-label="삽화 액자">{frameChoices().map(item => { const lay = frameLayout(4, 5, { frame: item.id, frameInk: d.frameInk });
        return <button key={item.id} type="button" className={'sb-frame-choice' + (item.id === d.frame ? ' on' : '')} role="radio" aria-checked={item.id === d.frame} title={item.label} onClick={() => { d.frame = item.id; save(); reopen(); }}>
          <span className="illust sb-frame-fig" data-frame={lay.frame}><span className="sb-frame" style={lay.wrapStyle}><span className="sb-pic" style={lay.picStyle}><span className="sb-frame-sample" /></span><FrameArt lay={lay} /></span></span><span className="sb-frame-name">{item.label}</span></button>; })}</div>
      <Form obj={d} defs={[{ k: 'frameInk', label: '장식 액자 색', type: 'select', opts: INKS.map(([ink, label]): [string, string] => [ink, label]), half: true, live: true }]} onChange={() => { save(); reopen(); }} />
      {customFrames.length ? <Fld label="가로 그림에는"><Sel opts={[['', '같은 액자'], ...frameChoices().map((x): [string, string] => [x.id, x.label])]} value={d.frameWide} onChange={val => { d.frameWide = val; save(); }} /></Fld> : null}
      <div className="row wrap"><Btn label="액자 그림 추가" ic="plus" cls="ghost" onClick={addFrame} />{customFrames.length ? <Btn label="액자 그림 관리" ic="more" cls="ghost" onClick={e => frameMenu(e.currentTarget)} /> : null}</div>
      <small className="hint">가운데가 투명한 PNG · WebP 액자 그림을 추가하면 삽화에 씌웁니다. 세로용 · 가로용을 따로 넣을 수 있어요. 화면 표시만 바꾸며 그림 원본은 그대로입니다.</small></Group>
    <div className="sb-savebar"><span className={'sb-state' + (bad ? ' bad' : '')} role="status">{state}</span></div>
    <Group title="프리셋 · 백업"><div className="row"><input className="inp" placeholder="프리셋 이름" ref={presetName} /><Btn label="프리셋 저장" ic="plus" onClick={savePreset} /></div>
      {presets.length ? <div className="col">{presets.map(p => <div className="sb-preset" key={p.name}><b>{p.name}</b><small>{configLine(p.config)}</small><Btn label="적용" cls="ghost" onClick={() => { Illust.saveCfg(pickKeys(p.config, RENDER_KEYS), { reason: `프리셋 “${p.name}” 적용 전`, force: true }); toast(`“${p.name}” 프리셋을 적용했어요`, 'ok'); reopen(); }} />
        <IBtn ic="trash" title="프리셋 삭제" cls="tiny" onClick={async () => { if (!(await confirmBox(`“${p.name}” 프리셋을 지울까요?`, '지우기', true))) return; Illust.saveCfg({ presets: Illust.cfg().presets.filter(x => x.name !== p.name) }); reopen(); }} /></div>)}</div>
        : <small className="hint">지금 생성 설정(모델 · 크기 · 화풍 · 참조 …)을 이름 붙여 저장해 두고 바꿔 쓸 수 있어요.</small>}
      <div className="row wrap"><Btn label="이전 설정" cls="ghost" onClick={history} /><Btn label="내보내기" ic="import" cls="ghost" onClick={exportAll} /><Btn label="가져오기" ic="upload" cls="ghost" onClick={importAll} /></div></Group>
  </div>;
}

// ════════ 인물 탭 ════════
const SCOPE_NAMES: Record<string, string> = { account: '전체', character: '현재 캐릭터', chat: '현재 대화' };
function CharCard({ item, i, n, later, commit, change }: { item: LibPerson; i: number; n: number; later: () => void; commit: () => void; /** 되돌릴 수 있게 적어 두고 목록을 고친 뒤 다시 그린다 */ change: (fn: (list: LibPerson[]) => void) => void }) {
  const bump = useBump(), [open] = useState(n === 1 || !item.name), profiles = (item.profiles ||= []);
  return <details className="sb-char" open={open}>
    <summary><span className="sb-char-no">{String(i + 1).padStart(2, '0')}</span><span>{item.name || '새 인물'}</span><em className="badge" hidden={!item.player}>내 캐릭터</em><small>{[item.appearance, item.outfit].filter(Boolean).join(' · ').slice(0, 80)}</small></summary>
    <div className="col">
      <Text obj={item} k="name" label="이름" ph="이야기에 나오는 이름 그대로" onInput={() => { bump(); later(); }} />
      <Area obj={item} k="appearance" label="고정 외형" rows={3} ph="long silver hair, amber eyes, slender build …" onInput={later} hint="그림에 이 인물이 나오면 그대로 붙습니다." />
      <Area obj={item} k="outfit" label="기본 복장" rows={2} ph="white blouse, navy pleated skirt …" onInput={later} hint="장면에서 옷이 바뀌면 그 장면의 옷이 우선합니다." />
      <Area obj={item} k="negative" label="이 인물에서 피할 것" rows={2} onInput={later} />
      <Chk label="내 캐릭터 (플레이어)" checked={item.player} onChange={val => { item.player = val; bump(); commit(); }} />
      <details className="sb-fold"><summary>{`다른 외형 프로필 · ${profiles.length}개`}</summary>
        {profiles.map((p, pi) => <div className="sb-profile" key={p.id || pi}><Text obj={p} k="name" label="프로필 이름" ph="예: 드레스 차림" onInput={later} /><Area obj={p} k="condition" label="이 외형을 쓰는 조건" rows={2} ph="예: 무도회 장면에서" onInput={later} /><Area obj={p} k="appearance" label="이 외형의 고정 특징 (비우면 기본 외형)" rows={2} onInput={later} /><Area obj={p} k="outfit" label="이 외형의 기본 복장" rows={2} onInput={later} />
          <div className="row end"><Btn label="외형 삭제" ic="trash" cls="ghost" onClick={async () => { if (!(await confirmBox(`“${p.name || '이 외형'}”을 지울까요?`, '지우기', true))) return; change(() => { profiles.splice(pi, 1); }); }} /></div></div>)}
        <Btn label="외형 추가" ic="plus" cls="ghost" onClick={() => { if (profiles.length >= 10) return toast('외형 프로필은 최대 10개예요'); change(() => { profiles.push({ id: C.uid(), name: '새 외형', condition: '', appearance: '', outfit: '' }); }); }} /></details>
      <div className="row end"><IBtn ic="up" title="위로" cls="tiny" disabled={i === 0} onClick={() => change(l => { [l[i - 1], l[i]] = [l[i], l[i - 1]]; })} /><IBtn ic="down" title="아래로" cls="tiny" disabled={i === n - 1} onClick={() => change(l => { [l[i + 1], l[i]] = [l[i], l[i + 1]]; })} />
        <Btn label="인물 삭제" ic="trash" cls="ghost" onClick={async () => { if (!(await confirmBox(`“${item.name || '이 인물'}”을 인물 목록에서 지울까요? 이 탭을 떠나기 전에는 되돌리기로 살릴 수 있어요.`, '지우기', true))) return; change(l => { l.splice(i, 1); }); }} /></div>
    </div>
  </details>;
}
function CastPage({ reopen }: { reopen: () => void }) {
  const bump = useBump(), S = C.S, I = Illust, chat = cur().chat ?? null, key = I.visualKey(chat), alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const choices: [string, string][] = [['account', '전체 (모든 대화의 기본값)'], ...(key ? [['character', `현재 캐릭터 · ${S.get('chars', key)?.name || ''}`] as [string, string]] : []), ...(chat ? [['chat', '현재 대화'] as [string, string]] : [])];
  if (!choices.some(([w]) => w === castScope)) castScope = I.visualScope(chat);
  const [m] = useState(() => { const scope = castScope as string, v = clone(I.visual(chat, scope)); return { scope, v, drafts: v.library || [], history: [] as LibPerson[][], state: '자동 저장', bad: false, ver: 0 }; });
  const { scope, v } = m;
  const value = (): Visual => ({ world: v.world || '', direction: v.direction || '', playerMode: v.playerMode || 'auto', library: clone(m.drafts) });
  const [act] = useState(() => {
    const commit = async () => {
      try {
        if (m.drafts.length > 100) throw new Error('인물은 최대 100명이에요.');
        if (m.drafts.some(x => !x.name?.trim())) throw new Error('인물 이름을 적어 주세요.');
        if (new Set(m.drafts.map(x => x.name.trim())).size !== m.drafts.length) throw new Error('인물 이름이 겹쳐요.');
        if (m.drafts.some(x => (x.profiles || []).some(p => !p.name?.trim()))) throw new Error('외형 프로필 이름을 적어 주세요.');
        await I.saveVisual(chat, scope, value()); m.state = '자동 저장'; m.bad = false;
      } catch (e) { m.state = '저장 안 됨 · ' + errText(e); m.bad = true; }
      if (alive.current) bump();
    };
    return { commit: () => void commit(), later: C.debounce(() => void commit(), 400) };
  });
  const { commit, later } = act;
  const remember = () => { m.history.push(clone(m.drafts)); if (m.history.length > 20) m.history.shift(); };
  const render = () => { m.ver++; bump(); };
  const add = (base?: Partial<LibPerson>) => { remember(); m.drafts.push({ id: C.uid(), name: '', appearance: '', outfit: '', negative: '', player: false, profiles: [], ...base }); render(); if (base?.name) commit(); };
  const fromCards = (anchor: Element) => { const me = chat ? S.persona(chat) : undefined, cards = chat ? [...chat.charIds.map(id => S.get('chars', id)), me].filter(x => !!x) : [...S.chars]; if (!cards.length) return toast('가져올 캐릭터가 없어요');
    menu(anchor, cards.slice(0, 40).map(p => ({ label: p.name, ic: 'user', onclick: () => { const vis = (p as { visual?: { appearance?: string; outfit?: string; negative?: string } }).visual; if (m.drafts.some(x => x.name === p.name)) return toast('이미 같은 이름의 인물이 있어요'); add({ id: p.id, name: p.name, appearance: vis?.appearance || '', outfit: vis?.outfit || '', negative: vis?.negative || '', player: !!chat && p === me }); if (!vis?.appearance) toast('이 캐릭터에는 적어 둔 외형이 없어요. 고정 외형을 영어 태그나 문장으로 적어 주세요.'); } }))); };
  const copyMenu = (anchor: Element) => menu(anchor, choices.filter(([w]) => w !== scope).map(([w]) => ({ label: `${SCOPE_NAMES[w]}(으)로 복사`, ic: 'copy', onclick: guard(async () => {
    if (w !== 'account' && I.hasVisual(chat, w) && !(await confirmBox(`${SCOPE_NAMES[w]}의 기존 인물 · 세계관 설정을 지금 편집 내용으로 바꿀까요?`, '복사'))) return;
    if (w === 'account' && !(await confirmBox('전체 기본값의 인물 · 세계관 설정을 지금 편집 내용으로 바꿀까요?', '복사'))) return;
    await I.saveVisual(chat, w, value()); castScope = w; reopen(); toast(`${SCOPE_NAMES[w]}(으)로 복사했어요`, 'ok'); }) })));
  const reset = guard(async () => { if (!(await confirmBox('이 범위에 저장한 인물 · 세계관 설정을 해제하고 윗 범위의 설정을 쓸까요?', '해제'))) return; await I.resetVisual(chat, scope); reopen(); });
  const scopeHelp = `${scope === 'character' ? '같은 캐릭터의 모든 대화에 저장합니다.' : scope === 'chat' ? '이 대화에만 저장합니다.' : '모든 캐릭터 · 대화의 기본값입니다.'} 적용 순서: 대화 → 캐릭터 → 전체. 지금 적용 중: ${SCOPE_NAMES[I.visualScope(chat)]}.${chat && !key ? ' 캐릭터 범위는 1:1 대화에서 설정합니다.' : ''}${!chat ? ' 대화를 열면 캐릭터 · 대화 범위도 고를 수 있어요.' : ''}`;
  return <div className="sb-cast-page">
    <div className="sb-wf-row"><Fld label="저장 범위"><Sel opts={choices} value={scope} onChange={w => { castScope = w; reopen(); }} /></Fld>
      <div className="row wrap"><Btn label="인물 추가" ic="plus" onClick={() => add()} /><Btn label="캐릭터에서 가져오기" ic="users" cls="ghost" onClick={e => fromCards(e.currentTarget)} />
        <Btn label="되돌리기" ic="left" cls="ghost" disabled={!m.history.length} onClick={() => { const last = m.history.pop(); if (!last) return; m.drafts = last; render(); commit(); }} />
        {choices.length > 1 ? <IBtn ic="copy" title="다른 범위로 복사" onClick={e => copyMenu(e.currentTarget)} /> : null}<IBtn ic="refresh" title="다시 불러오기" onClick={reopen} /></div></div>
    <p className="hint">{scopeHelp}</p>
    <Group title="세계관 · 연출"><Area obj={v} k="world" label="세계 · 배경 메모" rows={3} ph="근미래 서울, 비가 잦은 도시 …" onInput={later} hint="시대 · 건축 · 문화권의 기본값입니다. 본문에 적힌 사실이 우선합니다." /><Area obj={v} k="direction" label="연출 방향 (계획을 세우는 모델에게 전하는 말)" rows={2} ph="인물 표정이 잘 보이는 구도 위주로 …" onInput={later} />
      <Fld label="내 캐릭터 그리기"><Sel opts={[['auto', '답변에 등장할 때만'], ['always', '함께 있으면 항상'], ['never', '그리지 않기 (화면 밖 · 1인칭)']]} value={v.playerMode === 'pov' ? 'never' : v.playerMode === 'visible' ? 'always' : v.playerMode} onChange={val => { v.playerMode = val; commit(); }} /></Fld></Group>
    <div className="col sb-chars">{m.drafts.map((item, i) => <CharCard key={`${m.ver}-${i}`} item={item} i={i} n={m.drafts.length} later={later} commit={commit} change={fn => { remember(); fn(m.drafts); render(); commit(); }} />)}
      {!m.drafts.length ? <Empty>등록한 인물이 없어요. 캐릭터 · 페르소나 편집기의 에셋 탭에 적어 둔 외형은 등록하지 않아도 자동으로 쓰입니다.</Empty> : null}</div>
    <div className="sb-savebar"><span className={'sb-state' + (m.bad ? ' bad' : '')}>{m.state}</span>{scope !== 'account' ? <Btn label={scope === 'chat' && I.hasVisual(chat, 'character') ? '캐릭터 설정 사용' : '전체 설정 사용'} cls="ghost" disabled={!I.hasVisual(chat, scope)} onClick={reset} /> : null}</div>
  </div>;
}

// ════════ 참조 탭 ════════
async function prepareReference(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('10MB 이하 PNG · JPEG · WebP 이미지를 골라 주세요.');
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
    return { state: '자동 저장', bad: false, rows: new Map(refs.map((r): [string, RefRow] => [r.id, { id: r.id, enabled: chosen.has(r.id), kind: 'vibe', mode: 'character', strength: 0.6, fidelity: 1, information: 1, ...(chosen.get(r.id) || {}) }])) }; });
  const [act] = useState(() => {
    const commit = () => { const references = [...m.rows.values()].filter(r => r.enabled).map(({ enabled: _e, ...r }) => r); Illust.saveCfg({ references });
      try { Illust.validate(Illust.genConfig()); m.state = '자동 저장'; m.bad = false; } catch (e) { m.state = '확인 필요 · ' + errText(e); m.bad = true; } bump(); };
    return { commit, later: C.debounce(commit, 300) };
  });
  const { commit, later } = act;
  const upload = guard(async () => { const [f] = await C.pickFiles({ accept: 'image/png,image/jpeg,image/webp' }); if (!f) return; const img = await prepareReference(f); await C.DB.put('assets', { id: C.uid(), owner: REF_OWNER, kind: 'illust-ref', name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 100), ...img, ts: C.now() }); toast('참조 이미지를 등록했어요', 'ok'); reopen(); });
  const remove = (r: Asset) => guard(async () => {
    if (!(await confirmBox(`“${r.name}” 참조를 지울까요? 적용 목록과 프리셋에서도 빠집니다. 이미 그린 삽화는 그대로예요.`, '지우기', true))) return;
    await C.DB.del('assets', r.id); Illust.cancelWaiting(j => j.config.references?.some(x => x.id === r.id));
    const now0 = Illust.cfg(); Illust.saveCfg({ references: (now0.references || []).filter(x => x.id !== r.id), presets: now0.presets.map(p => ({ ...p, config: { ...p.config, references: (p.config.references || []).filter(x => x.id !== r.id) } })) });
    toast('참조 이미지를 지웠어요'); reopen(); });
  const off = c.backend !== 'nai' || !MODELS[c.model]?.references;
  return <div className="sb-refs">
    <p className="hint">NovelAI V4.5 에서 쓰는 이미지 참조입니다. Vibe 는 분위기 · 그림체, Precise 는 인물 · 스타일을 새 그림에 반영합니다. V5 는 아직 지원하지 않아요.</p>
    {off ? <div className="sb-note"><Icon name="image" size={15} /><span>{c.backend !== 'nai' ? '지금 그림 엔진에서는 참조를 쓰지 않습니다.' : '지금 고른 모델(V5)에서는 참조를 적용할 수 없어요. 생성 탭에서 V4.5 를 고르면 쓸 수 있습니다.'}</span></div> : null}
    <div className="row wrap"><Btn label="이미지 추가" ic="plus" onClick={upload} />{refs.length ? <Btn label="모두 해제" cls="ghost" onClick={() => { Illust.saveCfg({ references: [] }); reopen(); }} /> : null}<span className="sb-grow" /><span className={'sb-state' + (m.bad ? ' bad' : '')}>{m.state}</span></div>
    {!refs.length ? <Empty>등록한 참조 이미지가 없어요.</Empty> : <div className="sb-ref-grid">{refs.map(r => { const row = m.rows.get(r.id) as RefRow;
      return <div key={r.id} className={'sb-ref' + (row.enabled ? ' on' : '')}><div className="sb-ref-img"><img src={r.data} alt={r.name} loading="lazy" /></div>
        <div className="col"><div className="row"><b className="sb-grow">{r.name}</b><IBtn ic="trash" title="참조 삭제" cls="tiny" onClick={remove(r)} /></div><Chk label="이 참조 적용" checked={row.enabled} onChange={val => { row.enabled = val; commit(); }} />
          <div className="form"><Fld label="용도" cls="half"><Sel opts={[['vibe', 'Vibe · 그림체 / 분위기'], ['precise', 'Precise · 인물 / 스타일']]} value={row.kind} onChange={val => { row.kind = val; commit(); }} /></Fld><Fld label="Precise 모드" cls="half"><Sel opts={[['character', '인물'], ['style', '스타일'], ['character&style', '인물과 스타일']]} value={row.mode} onChange={val => { row.mode = val; commit(); }} /></Fld>
            <Slider row={row} k="strength" label="강도" later={later} /><Slider row={row} k="fidelity" label="Precise 충실도" later={later} /><Slider row={row} k="information" label="Vibe 정보량" later={later} /></div></div></div>; })}</div>}
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
const JOB_OFF: Record<string, string> = { failed: '실패', uncertain: '확인 필요', running: '그리는 중', waiting: '대기' };
function GalleryPage({ reopen, all }: { reopen: () => void; all: Asset[] }) {
  const S = C.S, I = Illust, chat = cur().chat, SIZE = 24;
  const [query, setQuery] = useState(''), [scope, setScope] = useState('all'), [page0, setPage] = useState(0);
  const chatOf = (a: Asset) => String(a.owner).replace(/^chat:/, '');
  const chatName = (a: Asset) => { const c = S.get('chats', chatOf(a)); return c ? (c.name || c.charIds.map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || '대화') : '지워진 대화'; };
  const [used] = useState(() => new Set((cur().msgs || []).flatMap(m => (m.swipes || []).flatMap(sw => (sw.illust || []).flatMap(it => [it.id, ...(it.versions || []).map(v => v.id)])))));
  const target = () => { const m = lastReply(); if (!m) throw new Error('그림을 넣을 답변이 있는 대화를 먼저 열어 주세요.'); return m; };
  const openJob = (j: Job) => openModal({ title: j.label || '삽화', cls: 'col', actions: [
    { label: '생성 기록', ic: 'note', cls: 'ghost', onclick: () => { inspect({ scene: j.scene, config: j.config, ts: j.ts }); return false; } },
    (j.state === 'failed' || j.state === 'uncertain') && cur().msgs?.includes(j.msg) && { label: '다시 요청', cls: 'primary', onclick: () => { try { j.seen = true; draw(j.msg, [j.scene], j.config, j.slot, true); reopen(); } catch (e) { toast(errText(e), 'err'); return false; } } }] },
    () => <><p>{j.error || '결과가 아직 확정되지 않았어요.'}</p><small className="hint">{[configLine(j.config), when(j.ts)].filter(Boolean).join(' · ')}</small></>);
  const open = (a: Asset) => viewer({ title: a.title || '삽화', src: a.data, sub: [chatName(a), when(a.ts), configLine(a.config), a.seed != null ? `Seed ${a.seed}` : ''].filter(Boolean).join(' · '),
    actions: [
      { label: '지금 대화에 넣기', ic: 'plus', run: async () => { const m = target(), here = 'chat:' + (cur().chat as Chat).id; let rec = a; if (a.owner !== here) { rec = { ...a, id: C.uid(), owner: here, ts: C.now() }; await C.DB.put('assets', rec); } I.insert(m.swipes[m.sw], rec); await chatApi.save(); chatApi.redraw(); toast('마지막 답변 아래에 넣었어요', 'ok'); } },
      { label: '장면으로 열기', ic: 'sliders', run: () => compose(target(), { initial: [a.scene || { ...blankScene(), title: a.title || '', prompt: a.prompt || '' }], config: a.config ? { ...a.config, seed: -1 } : null }) },
      { label: '지우기', ic: 'trash', run: async () => { if (!(await confirmBox('이 그림을 완전히 지울까요? 대화에 붙어 있다면 거기서도 사라지고, 되돌릴 수 없어요.', '지우기', true))) return; await purgeAsset(a); toast('그림을 지웠어요'); reopen(); } }],
    more: [{ label: 'AI 검수', ic: 'search', onclick: guard(() => review(a)) }, ...(a.review ? [{ label: '지난 검수 보기', ic: 'eye', onclick: () => showReview(a.review || {}) }] : []), { label: '생성 기록', ic: 'note', onclick: () => inspect(a) }, ...(S.get('chats', chatOf(a)) ? [{ label: '이 대화로 가기', ic: 'chat', onclick: () => go('chat', chatOf(a)) }] : [])] });
  const q = query.trim().toLowerCase(), mine = (a: Asset) => !!chat && a.owner === 'chat:' + chat.id, off = scope === 'failed';
  const jobs = off ? [...I.queue()].reverse().filter(j => JOB_OFF[j.state] && (!q || [j.label, j.scene?.prompt, ...(j.scene?.characters || []).map(x => x.name)].join(' ').toLowerCase().includes(q))) : [];
  const pics = off ? [] : all.filter(a => (scope !== 'chat' || mine(a)) && (scope !== 'loose' || (mine(a) && !used.has(a.id))) && (!q || [a.title, a.prompt, a.scene?.camera, ...(a.scene?.characters || []).map(x => x.name), chatName(a)].join(' ').toLowerCase().includes(q)));
  const total = off ? jobs.length : pics.length, pages = Math.max(1, Math.ceil(total / SIZE)), page = Math.max(0, Math.min(page0, pages - 1)), cut = <T,>(l: T[]) => l.slice(page * SIZE, (page + 1) * SIZE);
  return <div className="sb-gallery-page">
    <div className="sb-gallery-bar"><input className="inp" type="search" placeholder="제목 · 프롬프트 · 인물 · 대화 이름으로 찾기" aria-label="갤러리 검색" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} />
      <Sel opts={[['all', '모든 삽화'], ...(chat ? [['chat', '지금 대화'], ['loose', '대화에서 빠진 그림']] as [string, string][] : []), ['failed', '미완료']]} value="all" onChange={val => { setScope(val); setPage(0); }} />
      <IBtn ic="more" title="더 보기" onClick={e => menu(e.currentTarget, [{ label: '새로 고침', ic: 'refresh', onclick: reopen }, { label: '지금 대화 내보내기 (HTML)', ic: 'import', onclick: exportChat }])} /></div>
    <p className="hint" role="status">{`${total}개 · ${off ? '이번 접속에서 끝내지 못한 작업' : scope === 'chat' ? '지금 대화' : scope === 'loose' ? '지금 대화에서 빠진 그림' : '모든 대화'}`}</p>
    <div className="sb-gallery">
      {cut(jobs).map(j => <button key={j.id} type="button" className="sb-shot" title={j.label || '삽화'} aria-label={`${j.label || '삽화'} · 작업 확인`} onClick={() => openJob(j)}><i className={`sb-shot-off ${j.state}`}>{JOB_OFF[j.state]}</i><span>{j.label || '삽화'}</span><small>{j.error || configLine(j.config)}</small></button>)}
      {cut(pics).map(a => <button key={a.id} type="button" className="sb-shot" title={a.title || '삽화'} aria-label={`${a.title || '삽화'} · 그림 보기`} onClick={() => open(a)}><img src={a.data} alt="" loading="lazy" decoding="async" />{a.review ? <em className="sb-shot-mark" title="검수 의견 있음">검수</em> : null}<span>{a.title || '삽화'}</span><small>{chatName(a)}</small></button>)}
      {!total ? <Empty>{off ? (q ? '찾는 작업이 없어요.' : '끝내지 못한 작업이 없어요.') : q ? '찾는 그림이 없어요.' : '아직 그린 삽화가 없어요.'}</Empty> : null}</div>
    <div className="sb-pager" hidden={pages < 2}><IBtn ic="left" title="이전 쪽" disabled={page === 0} onClick={() => setPage(page - 1)} /><span className="hint">{`${page + 1} / ${pages}`}</span><IBtn ic="right" title="다음 쪽" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} /></div>
  </div>;
}

// ════════ 작업 탭 ════════
const JOB_LABELS: Record<string, string> = { waiting: '대기', running: '그리는 중', done: '완성', failed: '실패', uncertain: '확인 필요', cancelled: '취소' };
function QueuePage({ reopen }: { reopen: () => void }) {
  const I = Illust, items = [...I.queue()].reverse(), wait = Math.ceil(I.cooldown() / 1000), paused = I.queuePaused();
  const stats: [string, string | number][] = [['이번 접속 요청', `${I.usage()}`], ['대기', items.filter(x => x.state === 'waiting').length], ['완성', items.filter(x => x.state === 'done').length], ['실패', items.filter(x => x.state === 'failed' || x.state === 'uncertain').length]];
  const drafts = pendingDrafts().length;
  return <div className="sb-queue">
    <div className="mem-stats">{stats.map(([l, n]) => <div key={l}><b>{String(n)}</b><span>{l}</span></div>)}</div>
    <div className="row wrap">{drafts ? <Btn label={`초안 ${drafts}개 생성`} ic="image" cls="primary" onClick={guard(async () => {
      if (!(await confirmBox(`그림이 없는 답변 ${drafts}개의 초안을 모두 생성 대기열에 넣을까요?`, '생성'))) return;
      const r = await generateDrafts(); toast(`${r.count}개 장면을 대기열에 넣었어요${r.left ? ` · 한도 때문에 답변 ${r.left}개의 초안은 남겨 두었습니다` : ''}`, r.count ? 'ok' : undefined); reopen(); })} /> : null}
      <Btn label={paused ? '재개' : '일시정지'} ic={paused ? 'play' : 'stop'} cls={paused ? 'primary' : ''} onClick={() => I.toggleQueue()} /><Btn label="대기 취소" cls="ghost" onClick={() => { const n = I.cancelWaiting(); toast(n ? `대기 중이던 ${n}개를 취소했어요` : '대기 중인 작업이 없어요'); }} />
      <Btn label="지시 기록" ic="note" cls="ghost" onClick={showPlans} />
      {I.cfg().backend === 'nai' ? <Btn label="계정 사용량" ic="user" cls="ghost" onClick={guard(async () => { const a = await I.account(); openModal({ title: '계정 사용량', cls: 'col' }, () => <><p>{`구독 ${a.active ? '활성' : '비활성'} · 등급 ${tierName(a.tier) ?? '확인 불가'}`}</p><p>{`남은 Anlas ${a.anlas != null ? a.anlas.toLocaleString() : '확인 불가'}`}</p></>); })} /> : null}
      <IBtn ic="refresh" title="새로 고침" onClick={reopen} /></div>
    <p className="hint">{`${paused ? '일시정지 중입니다. 재개하면 다음 요청부터 이어집니다. ' : ''}${wait ? `NovelAI 요청 제한으로 ${wait}초 기다리는 중입니다. ` : ''}이미 보낸 요청은 취소되지 않고, 실패한 유료 요청은 자동으로 다시 보내지 않습니다.`}</p>
    {!items.length ? <Empty>진행 중인 작업이 없어요.</Empty> : <div className="col">{items.map(j => <div key={j.id} className={`sb-job ${j.state}`}><span className="sb-job-state">{JOB_LABELS[j.state] || j.state}</span>
      <div className="col"><b>{j.label || '삽화'}</b><small>{[configLine(j.config), j.automatic ? '자동' : '직접', j.slot ? '다시 그리기' : '', new Date(j.ts).toLocaleTimeString('ko-KR')].filter(Boolean).join(' · ')}</small>{j.error ? <small className="err">{j.error}</small> : null}</div>
      {j.state === 'waiting' ? <IBtn ic="x" title="이 작업 취소" cls="tiny" onClick={() => { I.cancelWaiting(x => x === j); }} /> : null}
      {(j.state === 'failed' || j.state === 'uncertain' || j.state === 'cancelled') && cur().msgs?.includes(j.msg) ? <Btn label="다시 요청" cls="ghost" onClick={guard(() => { j.seen = true; draw(j.msg, [j.scene], j.config, j.slot, true); })} /> : null}
      {j.state === 'done' && cur().msgs?.includes(j.msg) ? <Btn label="보기" cls="ghost" onClick={() => { go('chat', j.chat.id); setTimeout(() => chatApi.scrollTo(j.msg.id), 400); }} /> : null}</div>)}</div>}
  </div>;
}

// ════════ 틀 ════════
const TABS: [TabId, string, string][] = [['gen', '생성', 'sliders'], ['cast', '인물', 'user'], ['refs', '참조', 'image'], ['gallery', '갤러리', 'folder'], ['queue', '작업', 'menu']];
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
      <div className="row wrap sb-quick"><Btn label="장면 편집" ic="edit" onClick={guard(() => compose())} /><Btn label="이미지 읽기" ic="image" onClick={() => imageImport(() => { setHv(v => v + 1); void open('gen'); })} /><Btn label="지시 기록" ic="note" cls="ghost" onClick={showPlans} /></div></div>
    <div className="tabs sb-tabs" role="tablist" aria-label="삽화 설정">{TABS.map(([k, l, ic]) => <button key={k} type="button" className={'tab' + (k === tab ? ' on' : '')} role="tab" onClick={() => void open(k)}><Icon name={ic} size={15} />{l}{k === 'queue' && busy ? <em className="badge on">{String(busy)}</em> : null}</button>)}</div>
    <div className="sb-page">{page}</div>
  </>;
}
export function openStudio(tab?: string) {
  if (tab && TABS.some(t => t[0] === tab)) studioTab = tab as TabId;
  openModal({ title: '삽화', wide: true, cls: 'sb-studio' }, () => <Studio />).el.querySelector('.modal')?.classList.add('sb-editor');
}

/** 대화 옆 패널의 삽화 칸 */
export function Panel() {
  const bump = useBump(), I = Illust;
  useEffect(() => C.on('illust:jobs', bump), [bump]);
  const c = I.cfg(), q = I.queue(), { msgs } = cur(), n = (msgs || []).reduce((a, m) => a + (m.swipes?.[m.sw]?.illust?.filter(it => !it.hidden).length || 0), 0);
  const mode = { off: '꺼짐', review: '초안만', generate: '자동 생성' }[c.automatic], paused = I.queuePaused(), line = queueText() || flow.note;
  return <>
    <div className="mem-stats">{([['이 대화의 삽화', n], ['대기', q.filter(x => x.state === 'waiting').length], ['이번 접속', `${I.usage()}`], ['자동 처리', mode]] as [string, string | number][]).map(([l, v]) => <div key={l}><b>{String(v)}</b><span>{l}</span></div>)}</div>
    {line ? <small className="hint">{line}</small> : null}
    <div className="row wrap"><Btn label="스튜디오" ic="image" cls="ghost" onClick={() => openStudio()} /><Btn label="장면 편집" ic="edit" cls="ghost" onClick={guard(() => compose())} /><Btn label="갤러리" ic="folder" cls="ghost" onClick={() => openStudio('gallery')} />
      {q.some(active) || paused ? <Btn label={paused ? '재개' : '일시정지'} ic={paused ? 'play' : 'stop'} cls="ghost" onClick={() => I.toggleQueue()} /> : null}</div>
  </>;
}
