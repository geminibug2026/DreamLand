// ════════ 장면 편집기 ════════ 장면 · 인물 배치 · 최종 프롬프트 + 이번 작업의 생성 설정
import { useEffect, useRef, useState } from 'react';
import { Form, type FieldDef } from '../ui';
import { C, IL, Illust, U, blankScene, chatApi, clone, configLine, cur, errText, flat, guard, mustBeOpen, pickKeys } from './bridge';
import { Area, Btn, Chk, Empty, Fld, IBtn, Sel, Seg, Text, openModal, useBump, type Box } from './parts';
import { Board } from './Board';
import { ORIENTATIONS } from './framing';
import { draw } from './work';
import { schedule } from './decorate';
import { guide } from './dialogs';
import type { Chat, GenConfig, Msg, Person, Scene, Swipe } from './types';

// ════════ 이번 작업의 생성 설정 ════════
function genFields(d: GenConfig): (FieldDef | false)[] {
  const { MODELS, SAMPLERS, SCHEDULERS } = IL(), nai = d.backend === 'nai', v5 = MODELS[d.model]?.family === 5, sd = d.backend === 'a1111';
  return [
    nai && { k: 'model', label: '모델', type: 'select', opts: Object.entries(MODELS).map(([id, m]) => [id, m.label]), half: true, live: true },
    { k: 'width', label: '가로', type: 'num', min: 64, max: 4096, step: 64, third: true }, { k: 'height', label: '세로', type: 'num', min: 64, max: 4096, step: 64, third: true },
    (nai || sd) && { k: 'steps', label: 'Steps', type: 'num', min: 1, max: 150, step: 1, third: true }, (nai || sd) && { k: 'scale', label: 'Guidance', type: 'num', min: 0, max: 30, step: 0.1, third: true },
    (nai || sd) && { k: 'seed', label: 'Seed', type: 'num', min: -1, max: 4294967295, step: 1, third: true, hint: '-1: 매번 새 값' },
    nai && { k: 'sampler', label: '샘플러', type: 'select', opts: SAMPLERS, half: true }, nai && !v5 && { k: 'scheduler', label: '스케줄러', type: 'select', opts: SCHEDULERS, half: true },
    sd && { k: 'sdSampler', label: '샘플러', half: true, ph: 'Euler a' },
    nai && { k: 'cfgRescale', label: 'CFG rescale', type: 'num', min: 0, max: 1, step: 0.05, third: true },
    nai && v5 && { k: 'transparent', label: '투명 배경 (V5 전용)', type: 'check' },
    nai && { k: 'budgetGuard', label: '비용 보호', type: 'check', hint: '1,048,576픽셀 · 28 Steps 를 넘는 요청을 막습니다. 무료 생성을 보장하지는 않아요.' },
  ];
}
export function fixModel(d: GenConfig) { if (d.backend !== 'nai') return; if (IL().MODELS[d.model]?.family === 5) d.scheduler = 'karras'; else d.transparent = false; }
function GenForm({ d, hold }: { d: GenConfig; hold: { redo: () => void } }) {
  const [ver, setVer] = useState(0), last = useRef(d.model);
  hold.redo = () => setVer(v => v + 1);
  return <><p className="hint">이번 작업에만 적용합니다. 기본 설정은 바꾸지 않아요.</p><Form key={ver} obj={d} defs={genFields(d)} onChange={() => { fixModel(d); if (d.model !== last.current) { last.current = d.model; setVer(v => v + 1); } }} /></>;
}
function genEditor(config: GenConfig, onApply: (c: GenConfig) => void) {
  const d = clone(config), hold = { redo: () => { } };
  openModal({ title: '생성 설정', cls: 'col', actions: [
    { label: '무작위 시드', cls: 'ghost', onclick: () => { d.seed = -1; hold.redo(); return false; } },
    { label: '적용', cls: 'primary', onclick: () => { try { fixModel(d); onApply(Illust().validate(d)); } catch (e) { U().toast(errText(e), 'err'); return false; } } }] }, () => <GenForm d={d} hold={hold} />);
}

// ════════ 장면 편집기 ════════
const LIMIT = 6;
type Tab = 'scene' | 'cast' | 'final';
interface Snap { drafts: Scene[]; cfg: GenConfig; at: number; person: number }
interface Ctx {
  chat: Chat; msg: Msg; sw: Swipe; slot: string | null; preview: string; inline: boolean; blocks: { index: number; content: string }[];
  /** 편집 중인 값 (옛 편집기의 let 변수들) */
  st: Snap & { tab: Tab; dirty: boolean; undo: Snap[] };
  saveDraft(quiet: boolean): Promise<void>; close(): void;
}
/** 편집기 안쪽 탭들이 쓰는 것 */
interface Tools { x: Ctx; s: Scene; snap(): void; touch(): void; redo(): void; note(t: string): void }

function ParaPicker({ t, pickAt }: { t: Tools; pickAt: (b: { index: number; content: string } | null) => void }) {
  const SIZE = 20, [q, setQ] = useState(''), [page0, setPage] = useState(0), list = useRef<HTMLDivElement>(null);
  const { blocks } = t.x, s = t.s;
  const here = s.anchor ? blocks.find(b => flat(b.content).includes(flat(s.anchor).slice(0, 40)))?.index : 0;
  const k = flat(q).toLowerCase(), hits = blocks.filter(b => !k || flat(b.content).toLowerCase().includes(k)), pages = Math.max(1, Math.ceil(hits.length / SIZE)), page = Math.max(0, Math.min(page0, pages - 1));
  useEffect(() => { if (list.current) list.current.scrollTop = 0; }, [q, page]);
  return <>
    <input className="inp" type="search" placeholder="단어나 문장으로 찾기" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} />
    <small className="hint" role="status">{`전체 ${blocks.length}문단 · ${hits.length}개 일치`}</small>
    <div className="sb-para-list" aria-label="본문 문단" ref={list}>
      {page === 0 && !k ? <button type="button" className={'sb-para' + (here ? '' : ' on')} onClick={() => pickAt(null)}><b>{`답변 아래${here ? '' : ' · 현재 위치'}`}</b><span>문단을 고르지 않고 답변 끝에 붙입니다.</span></button> : null}
      {hits.slice(page * SIZE, (page + 1) * SIZE).map(b => <button key={b.index} type="button" className={'sb-para' + (b.index === here ? ' on' : '')} aria-pressed={b.index === here} onClick={() => pickAt(b)}><b>{`${b.index}번 문단${b.index === here ? ' · 현재 위치' : ''}`}</b><span>{b.content}</span></button>)}
      {!hits.length ? <Empty>일치하는 문단이 없어요.</Empty> : null}
    </div>
    <div className="sb-pager" hidden={pages < 2}><Btn label="이전" cls="ghost" disabled={page === 0} onClick={() => setPage(page - 1)} /><span className="hint">{`${page + 1} / ${pages}`}</span><Btn label="다음" cls="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} /></div>
  </>;
}
function AnchorPicker({ t }: { t: Tools }) {
  const bump = useBump(), s = t.s, b = s.anchor ? t.x.blocks.find(x => flat(x.content).includes(flat(s.anchor).slice(0, 40))) : undefined;
  const choose = () => { const m: Box = openModal({ title: '삽입 위치', wide: true, cls: 'col' }, () => <ParaPicker t={t} pickAt={p => { t.snap(); s.anchor = p ? p.content.slice(0, 200) : ''; bump(); m.close(); }} />); };
  return <section className="sb-anchor"><div className="row"><b>{b ? `삽입 위치 · ${b.index}번 문단 뒤` : '삽입 위치 · 답변 아래'}</b><Btn label="변경" cls="ghost" onClick={choose} /></div><blockquote className="sb-excerpt" hidden={!b}>{b ? b.content : ''}</blockquote></section>;
}

function SceneTab({ t }: { t: Tools }) {
  const { x, s } = t, st = x.st, [dir, setDir] = useState(''), [busy, setBusy] = useState(false), scope = useRef('all'), [showFinal] = useState(!!s.finalPrompt), alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const reanalyze = async () => {
    const before = JSON.stringify(st.drafts); setBusy(true); t.note('장면 분석 중…');
    try {
      mustBeOpen(x.msg);
      const out = await Illust().analyze(x.chat, cur().msgs as Msg[], x.msg, null, { existing: clone(st.drafts), direction: dir, scope: scope.current, manual: true });
      if (JSON.stringify(st.drafts) !== before) throw new Error('분석하는 동안 고친 내용이 있어 결과로 덮어쓰지 않았어요.');
      t.snap(); st.drafts = out; t.redo(); U().toast('분석 완료 · 바뀐 내용을 확인해 주세요', 'ok');
    } catch (err) { t.note(''); U().toast('분석 실패 · 기존 내용을 그대로 두었어요. ' + errText(err), 'err'); } finally { if (alive.current) setBusy(false); }
  };
  return <div className="col sb-ed-pane">
    {x.inline ? <AnchorPicker t={t} /> : null}
    <div className="sb-shape"><span className="field-label">화면 비율</span><Seg label="화면 비율" choices={ORIENTATIONS} value={s.size ?? ''} onChange={val => { t.snap(); if (val) s.size = val; else delete s.size; }} /></div>
    <Area obj={s} k="prompt" label="장면 프롬프트" rows={5} ph="배경, 조명, 장면의 시각적 상황을 적어 주세요." onInput={t.touch} />
    {showFinal ? <Chk label="최종 프롬프트 직접 사용" checked onChange={v => { s.finalPrompt = v; t.touch(); }} hint="이 장면에는 공통 화풍 · 구도 · 품질 태그를 덧붙이지 않습니다." /> : null}
    <div className="sb-two"><Area obj={s} k="camera" label="구도" rows={3} ph="medium shot, from the side …" onInput={t.touch} /><Area obj={s} k="negative" label="장면에서 피할 것" rows={3} onInput={t.touch} /></div>
    <details className="sb-fold"><summary>공통 프롬프트 · 이번 작업</summary><div className="col"><Area obj={st.cfg} k="style" label="화풍" rows={3} onInput={t.touch} /><Area obj={st.cfg} k="negative" label="공통으로 피할 것" rows={2} onInput={t.touch} /><Chk label="품질 태그 붙이기" checked={st.cfg.quality} onChange={v => { st.cfg.quality = v; t.touch(); }} /></div></details>
    <details className="sb-fold"><summary>AI 에게 고쳐 달라고 하기</summary><div className="col">
      <Fld label="고칠 방향"><textarea className="inp" rows={2} placeholder="예: 인물은 그대로 두고 카메라만 멀리" value={dir} onChange={e => setDir(e.target.value)} /></Fld>
      <Fld label="고칠 범위"><Sel opts={[['all', '전체'], ['camera', '구도'], ['background', '배경'], ['characters', '인물']]} value="all" onChange={v => { scope.current = v; }} /></Fld>
      <div className="row"><Btn label="다시 분석" ic="sparkle" disabled={busy} onClick={() => void reanalyze()} /><small className="hint">추가 호출이 한 번 일어납니다.</small></div></div></details>
  </div>;
}

function CastTab({ t }: { t: Tools }) {
  const bump = useBump(), { x, s } = t, st = x.st, cfg = st.cfg, { MODELS } = IL();
  const cast: Person[] = (s.characters ||= []); st.person = Math.max(0, Math.min(st.person, cast.length - 1));
  const person = st.person, c: Person | undefined = cast[person], fx = useRef<HTMLInputElement>(null), fy = useRef<HTMLInputElement>(null);
  const castMax = () => cfg.backend === 'nai' ? (MODELS[cfg.model]?.characters || 6) : 4;
  const boardModel = cfg.backend !== 'nai' || MODELS[cfg.model]?.family === 5 ? 'nai-diffusion-5-full' : cfg.model;
  const moved = () => { cfg.useCoords = true; t.touch(); bump(); };
  const swap = (d: number) => { const to = person + d; if (to < 0 || to >= cast.length) return; t.snap(); [cast[person], cast[to]] = [cast[to], cast[person]]; st.person = to; t.redo(); };
  const del = async () => { if (!c || !(await U().confirmBox(`“${c.name || '선택한 인물'}”을 이 장면에서 뺄까요? 되돌리기로 살릴 수 있어요.`, '빼기', true))) return; t.snap(); cast.splice(person, 1); st.person = Math.max(0, person - 1); t.redo(); };
  const lib = Illust().library(x.chat).filter(p => !cast.some(q => q.name === p.name));
  const add = (base?: Person | null) => { if (cast.length >= castMax()) return U().toast(`이 모델은 인물 ${castMax()}명까지예요`); t.snap(); cast.push(base || { name: `인물 ${cast.length + 1}`, prompt: '', negative: '', x: 0.5, y: 0.5 }); st.person = cast.length - 1; t.redo(); };
  const num = (k: 'x' | 'y', ref: typeof fx) => <input ref={ref} className="inp" type="number" min={0} max={1} step={0.01} defaultValue={c?.[k] ?? 0.5} onChange={e => { if (c) c[k] = Math.min(1, Math.max(0, +e.target.value || 0)); moved(); }} />;
  return <div className="sb-cast">
    <div className="sb-cast-visual">
      <Board model={boardModel} width={cfg.width} height={cfg.height} bg={x.preview} selected={person} onMove={moved} onSelect={i => { st.person = i; bump(); }}
        entries={cast.map((p, i) => ({ name: p.name, x: p.x ?? 0.5, y: p.y ?? 0.5, set: (px: number, py: number) => { p.x = px; p.y = py; if (i === st.person) { if (fx.current) fx.current.value = String(px); if (fy.current) fy.current.value = String(py); } } }))} />
      <div className="col"><Chk label="좌표 적용" checked={cfg.useCoords !== false} onChange={v => { cfg.useCoords = v; t.touch(); }} /><Chk label="인물 순서 적용" checked={cfg.useOrder !== false} onChange={v => { cfg.useOrder = v; t.touch(); }} /></div>
    </div>
    <div className="sb-cast-editor">
      <div className="sb-cast-list">{cast.map((p, i) => <button key={i} type="button" className={'chip' + (i === person ? ' on' : '')} title={p.name || `인물 ${i + 1}`} onClick={() => { st.person = i; bump(); }}>{`${i + 1}. ${p.name || `인물 ${i + 1}`}`}</button>)}</div>
      <div className="sb-cast-fields col" key={person}>
        <div className="row sb-cast-actions">
          <Btn label="인물 추가" ic="plus" cls="ghost" onClick={e => lib.length ? U().menu(e.currentTarget, [{ label: '빈 인물', ic: 'plus', onclick: () => add() }, '-', ...lib.map(p => ({ label: p.name, ic: 'user', hint: p.player ? '내 캐릭터' : '', onclick: () => add(Illust().compileCharacter({ name: p.name, id: p.id }, Illust().library(x.chat), 'always')) }))]) : add()} />
          <span className="sb-grow" /><IBtn ic="up" title="인물 앞으로" disabled={person === 0 || !c} onClick={() => swap(-1)} /><IBtn ic="down" title="인물 뒤로" disabled={person >= cast.length - 1} onClick={() => swap(1)} /><IBtn ic="trash" title="인물 삭제" disabled={!c} onClick={() => void del()} />
        </div>
        {!c ? <Empty>인물을 추가하면 프롬프트와 위치를 고칠 수 있어요.</Empty> : <>
          <Text obj={c} k="name" label="이름" onInput={() => { t.touch(); bump(); }} />
          <Area obj={c} k="prompt" label="인물 프롬프트" rows={5} ph="외형, 지금 입은 옷, 동작과 표정" onInput={t.touch} />
          <Area obj={c} k="negative" label="이 인물에서 피할 것" rows={2} onInput={t.touch} />
          <div className="sb-two"><Fld label="가로 위치">{num('x', fx)}</Fld><Fld label="세로 위치">{num('y', fy)}</Fld></div></>}
      </div>
    </div>
  </div>;
}

function FinalTab({ t }: { t: Tools }) {
  const { x, s } = t, cfg = x.st.cfg, { MODELS, snapPoint } = IL();
  const [made] = useState(() => { try { return { p: Illust().compose(x.chat, s, cfg), err: '' }; } catch (e) { return { p: null, err: errText(e) }; } });
  const [pos, setPos] = useState(made.p?.base ?? ''), [neg, setNeg] = useState(made.p?.negative ?? '');
  if (!made.p) return <p className="err">{made.err}</p>;
  const p = made.p, boardModel = cfg.backend !== 'nai' || MODELS[cfg.model]?.family === 5 ? 'nai-diffusion-5-full' : cfg.model;
  const lock = (prompt: string, negative: string) => { Object.assign(s, { prompt, negative, camera: '', finalPrompt: true }); t.touch(); };
  return <div className="col sb-ed-pane">
    <p className="hint">실제로 보낼 프롬프트입니다. 여기서 직접 고치면 이 장면은 적은 내용을 그대로 씁니다. 인물별 프롬프트는 따로 보냅니다.</p>
    <Fld label="최종 장면 프롬프트"><textarea className="inp" rows={7} spellCheck={false} value={pos} onChange={e => { setPos(e.target.value); lock(e.target.value, neg); }} /></Fld>
    <Fld label="최종 제외 요소"><textarea className="inp" rows={4} spellCheck={false} value={neg} onChange={e => { setNeg(e.target.value); lock(pos, e.target.value); }} /></Fld>
    {p.looks.length ? <div className="col"><span className="field-label">{`인물 ${p.looks.length}명 · 인물 · 배치에서 고칩니다`}</span>{p.looks.map((l, i) => { const pt = snapPoint(l.x, l.y, boardModel);
      return <div className="sb-caption" key={i}><b>{`${i + 1}. ${l.name || '인물'}`}</b><span>{l.caption}</span><small>{`${p.coords ? `위치 ${pt.x}, ${pt.y}` : '좌표 미적용'}${l.negative ? ` · 제외: ${l.negative}` : ''}`}</small></div>; })}</div>
      : <small className="hint">등장 인물이 없는 장면입니다.</small>}
  </div>;
}

function Composer({ x }: { x: Ctx }) {
  const bump = useBump(), [ver, setVer] = useState(0), [busyNote, setNote] = useState(''), st = x.st, { MODELS, RENDER_KEYS } = IL();
  st.at = Math.max(0, Math.min(st.at, st.drafts.length - 1));
  const s: Scene | undefined = st.drafts[st.at];
  const redo = () => { setNote(''); setVer(v => v + 1); };
  const touch = () => { st.dirty = true; };
  const snap = () => { st.undo.push(clone({ drafts: st.drafts, cfg: st.cfg, at: st.at, person: st.person })); if (st.undo.length > 20) st.undo.shift(); st.dirty = true; bump(); };
  const move = (d: number) => { const to = st.at + d; if (to < 0 || to >= st.drafts.length) return; snap(); [st.drafts[st.at], st.drafts[to]] = [st.drafts[to], st.drafts[st.at]]; st.at = to; redo(); };
  const undo = () => { const u = st.undo.pop(); if (!u) return; Object.assign(st, u); st.dirty = true; redo(); };
  const add = () => { if (st.drafts.length >= LIMIT) return U().toast(`장면은 최대 ${LIMIT}개예요`); snap(); st.drafts.push(blankScene(st.drafts.length + 1)); st.at = st.drafts.length - 1; st.person = 0; redo(); };
  const del = async () => { if (!s || !(await U().confirmBox(`장면 ${st.at + 1}을 지울까요? 되돌리기로 살릴 수 있어요.`, '지우기', true))) return; snap(); st.drafts.splice(st.at, 1); st.at = Math.max(0, st.at - 1); st.person = 0; redo(); };
  const gen = guard(async () => { draw(x.msg, st.drafts, st.cfg, x.slot); if (!x.slot) { x.sw.illustDraft = []; delete x.sw.illustDraftConfig; } st.dirty = false; await chatApi().save(); x.close(); });
  const fileMenu = (anchor: Element) => U().menu(anchor, [
    { label: '장면 내보내기', ic: 'import', onclick: () => C().download('scenebook-scenes.json', JSON.stringify({ kind: 'scenebook-scenes', schema: 1, config: pickKeys(st.cfg, RENDER_KEYS.filter(k => !['references', 'connId', 'a1111'].includes(k))), scenes: st.drafts.map(({ anchor: _a, ...rest }) => rest) }, null, 2)) },
    { label: '장면 가져오기', ic: 'upload', onclick: guard(async () => {
      const [f] = await C().pickFiles({ accept: '.json,application/json' }); if (!f) return; if (f.size > 300000) throw new Error('300KB 이하 장면 파일을 골라 주세요.');
      const v = JSON.parse(await f.text()) as { kind?: string; scenes?: Scene[]; config?: object } | null; if (v?.kind !== 'scenebook-scenes' || !Array.isArray(v.scenes) || !v.scenes.length) throw new Error('장면 파일이 아니에요.');
      const next = Illust().validate({ ...st.cfg, ...pickKeys(v.config || {}, RENDER_KEYS.filter(k => !['references', 'connId', 'a1111', 'budgetGuard', 'backend'].includes(k))) });
      snap(); st.drafts = v.scenes.slice(0, LIMIT).map(sc => Illust().compileScene(x.chat, { ...sc, anchor: '' })); st.cfg = next; st.at = st.person = 0; redo(); U().toast('장면을 불러왔어요', 'ok');
    }) },
    { label: '사용법', ic: 'note', onclick: guide },
  ]);
  const applyGen = (next: GenConfig) => {
    if (next.backend === 'nai' && st.drafts.some(d => d.characters.length > MODELS[next.model].characters)) throw new Error(`이 모델은 인물 ${MODELS[next.model].characters}명까지예요.`);
    snap(); if (next.width !== st.cfg.width || next.height !== st.cfg.height) for (const d of st.drafts) delete d.size; st.cfg = next; redo();
  };
  const t: Tools | null = s ? { x, s, snap, touch, redo, note: setNote } : null, tab = st.tab;
  return <>
    <div className="sb-ed-bar"><div className="row wrap">
      <div className="sb-scenes">{st.drafts.map((_d, i) => <button key={i} type="button" className={'chip' + (i === st.at ? ' on' : '')} onClick={() => { st.at = i; st.person = 0; redo(); }}>{`장면 ${i + 1} / ${st.drafts.length}`}</button>)}</div>
      <span className="sb-grow" />
      <IBtn ic="left" title="장면 앞으로" hidden={st.drafts.length < 2} disabled={st.at === 0 || !st.drafts.length} onClick={() => move(-1)} /><IBtn ic="right" title="장면 뒤로" hidden={st.drafts.length < 2} disabled={st.at >= st.drafts.length - 1} onClick={() => move(1)} />
      <Btn label="장면 추가" ic="plus" cls="ghost" onClick={add} /><IBtn ic="trash" title="장면 삭제" disabled={!s} onClick={() => void del()} />
    </div></div>
    <div className="row sb-ed-status"><span className="sb-state">{busyNote || configLine(st.cfg)}</span><span className="sb-grow" /><Btn label="생성 설정" ic="sliders" cls="ghost" onClick={() => genEditor(st.cfg, applyGen)} /></div>
    <div className="tabs sb-tabs">{([['scene', '장면'], ['cast', '인물 · 배치'], ['final', '프롬프트']] as [Tab, string][]).map(([k, l]) => <button key={k} type="button" className={'tab' + (k === tab ? ' on' : '')} onClick={() => { st.tab = k; redo(); }}>{l}</button>)}</div>
    <div className="sb-ed-content" key={ver}>{!t ? <Empty>장면을 추가하거나 파일을 가져와 주세요.</Empty> : tab === 'scene' ? <SceneTab t={t} /> : tab === 'cast' ? <CastTab t={t} /> : <FinalTab t={t} />}</div>
    <div className="sb-ed-foot"><Btn label="되돌리기" ic="left" cls="ghost" disabled={!st.undo.length} onClick={undo} /><IBtn ic="more" title="내보내기 · 가져오기 · 사용법" onClick={e => fileMenu(e.currentTarget)} /><span className="sb-grow" /><Btn label="초안 저장" ic="check" onClick={guard(() => x.saveDraft(false))} /><Btn label="그리기" ic="image" cls="primary" disabled={!st.drafts.length} onClick={gen} /></div>
  </>;
}

export function openComposer({ chat, msg, scenes, config, slot = null, preview = '' }: { chat: Chat; msg: Msg; scenes: Scene[]; config: GenConfig; slot?: string | null; preview?: string }) {
  const sw = msg.swipes[msg.sw], st: Ctx['st'] = { drafts: clone(scenes), cfg: clone(config), at: 0, person: 0, tab: 'scene', dirty: false, undo: [] };
  const saveDraft = async (quiet: boolean) => { mustBeOpen(msg); sw.illustDraft = clone(st.drafts); sw.illustDraftConfig = clone(st.cfg); st.dirty = false; await chatApi().save(); schedule(); U().toast(quiet ? '편집하던 장면을 초안으로 저장했어요' : '초안을 저장했어요'); };
  let asking = false;
  const askClose = () => {   // 저장하지 않은 변경이 있으면 닫기 전에 물어본다
    if (!st.dirty) return box.close(); if (asking) return; asking = true;
    openModal({ title: '편집 내용', tag: 'p', onClose: () => { asking = false; }, actions: [
      { label: '계속 편집', cls: 'ghost' },
      { label: '저장 없이 닫기', cls: 'ghost', onclick: () => { st.dirty = false; box.close(); } },
      { label: '저장 후 닫기', cls: 'primary', onclick: async () => { try { await saveDraft(true); box.close(); } catch (e) { U().toast(errText(e), 'err'); return false; } } }] }, () => '저장하지 않은 변경 사항이 있어요.');
  };
  const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && box.el === document.getElementById('modals')?.lastElementChild) { e.stopImmediatePropagation(); e.preventDefault(); askClose(); } };
  const box: Box = openModal({ title: slot ? '장면 편집 · 다시 그리기' : '장면 편집', wide: true, cls: 'sb-ed', onClose: () => { document.removeEventListener('keydown', onEsc, true); if (st.dirty && !slot) saveDraft(true).catch(e => U().toast(errText(e), 'err')); } },
    b => <Composer x={{ chat, msg, sw, slot, preview, inline: Illust().cfg().placement === 'inline', blocks: Illust().blocks(C().msgText(msg)), st, saveDraft, close: () => b.close() }} />);
  document.addEventListener('keydown', onEsc, true);
  box.el.addEventListener('mousedown', e => { if (e.target === box.el) e.stopImmediatePropagation(); }, true);   // 바깥을 잘못 눌러도 편집하던 내용이 사라지지 않게
  box.el.querySelector('.modal-head .ibtn')?.addEventListener('click', e => { e.stopImmediatePropagation(); e.stopPropagation(); askClose(); }, true);   // 닫기 단추도 물어보고 닫는다
  box.el.querySelector('.modal')?.classList.add('sb-editor');
}
