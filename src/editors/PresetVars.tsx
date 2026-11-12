// 프리셋 변수 — 프리셋에 정의하고, 대화방마다 값을 고른다
// 블록 안에서는 {{var::이름}} 과 {{#if 이름}}…{{else}}…{{/if}} 로 쓴다. 계산은 js/cond.js · js/engine.js(macro).
import { useRef, useState, type ReactNode } from 'react';
import { L } from '../legacy';
import { Btn, Icon, IconBtn } from '../kit';
import { Form, menu, openModal, toast } from '../ui';
import { cond, core, store, type PVar, type Preset, type XChat } from './bridge';
import { useBump, useDebounced } from './parts';

const newVar = (type = 'select', n = 1): PVar => ({ id: core().uid(), name: `변수${n}`, label: '', hint: '', type, default: type === 'toggle' ? false : type === 'slider' ? 3 : type === 'select' ? '보통' : '',
  options: [{ label: '보통', value: '' }, { label: '다르게', value: '' }], min: 1, max: 5, step: 1, onText: '', offText: '' });

const COND_HELP = [
  ['{{#if 이름}} … {{/if}}', '토글이 켜져 있거나 값이 비어 있지 않을 때만 넣습니다'], ['{{#if 이름 == "선택지"}}', '고른 선택지(이름 또는 그 글)로 가릅니다 · != 도 됩니다'],
  ['{{#if 길이 >= 3 && !수위}}', '숫자 비교 > < >= <= · 그리고 && · 또는 || · 아님 ! · 괄호'], ['{{else if …}} · {{else}}', '위에서부터 처음 맞는 갈래 하나만 남습니다'],
  ['{{#if 이름 contains "글"}}', '글이 들어 있는지 · not contains 는 반대'], ['char == "이름" · mode == talk', '쓸 수 있는 낱말: char user group persona scenario description personality model input mode(rp · talk) type(normal · continue · regen · impersonate)'],
  ['{{#if 호감도 > 50}}', '대화 변수(장면 패널의 변수) · 전역 변수도 이름 그대로 견줄 수 있습니다'], ['{{#unless 이름}} … {{/unless}}', '반대로: 꺼져 있거나 비어 있을 때'],
  ['블록의 "조건" 칸', '블록 하나를 통째로 넣고 뺄 때는 블록을 펼쳐 조건 칸에 식만 적습니다 (중괄호 없이)'],
];
const TYPE_HINT: Record<string, string> = { select: '여러 개 중 하나', slider: '숫자 범위', toggle: '켬 / 끔', text: '직접 적는 한 줄' };

/** 변수 하나의 입력 칸. value 는 처음 값이고, 바뀌면 set(v) 로 알린다 */
function Control({ d, value, set }: { d: PVar; value: unknown; set: (v: string | number | boolean) => void }) {
  const [v, setV] = useState(() => cond().pvCoerce(d, value));
  const put = (x: string | number | boolean) => { setV(x); set(x); };
  if (d.type === 'toggle') return <label className="pv-toggle"><span className="switch"><input type="checkbox" defaultChecked={!!v} onChange={e => put(e.target.checked)} /><i /></span><span>{v ? '켬' : '끔'}</span></label>;
  if (d.type === 'slider') return <div className="range"><input type="range" min={d.min ?? 0} max={d.max ?? 100} step={d.step || 1} defaultValue={String(v)} onChange={e => put(+e.target.value)} /><output>{String(v)}</output></div>;
  if (d.type === 'select') {
    const opts = d.options || [];
    if (opts.length <= 5 && opts.reduce((n, o) => n + o.label.length, 0) <= 26) return <div className="pv-seg">{opts.map((o, i) => <button type="button" key={i} className={o.label === v ? 'on' : undefined} onClick={() => put(o.label)}>{o.label}</button>)}</div>;
    return <select className="inp" defaultValue={String(v)} onChange={e => put(e.target.value)}>{opts.map((o, i) => <option key={i} value={o.label}>{o.label}</option>)}</select>;
  }
  return <input className="inp" defaultValue={String(v)} placeholder={d.hint || ''} spellCheck={false} onChange={e => put(e.target.value)} />;
}
const Row = ({ d, children, extra }: { d: PVar; children: ReactNode; extra?: ReactNode }) =>
  <div className="pv-row"><div className="pv-label"><b>{d.label || d.name}</b><code>{`{{var::${d.name}}}`}</code>{extra}</div>{children}{d.hint && d.type !== 'text' ? <small className="hint">{d.hint}</small> : null}</div>;

/** 대화방별 값 고르기 (장면 패널). div.col.pv-panel 안에 올린다 */
export function ChatPanel({ chat }: { chat: XChat }) {
  const S = store(), { pvDefs, pvCoerce, pvDefault } = cond(), redraw = useBump(), gen = useRef(0);
  const saveChat = useDebounced(() => S.save('chats', chat, true), 250);
  const preset = S.presetFor(chat), defs = pvDefs(preset);
  if (!defs.length) return <><p className="dim">지금 프리셋에는 변수가 없어요. 프리셋에 변수를 만들면 대화방마다 문체 · 길이 · 수위 같은 것을 여기서 바로 바꿀 수 있습니다.</p><Btn label="프리셋에서 변수 만들기" ic="sliders" cls="ghost" onClick={() => L.ui.go('presets', preset.id)} /></>;
  const mine = ((chat.pvars ||= {})[preset.id] ||= {});
  const n = defs.filter(d => mine[d.name] !== undefined && String(pvCoerce(d, mine[d.name])) !== String(pvDefault(d))).length;
  return <>
    <small className="hint">{`${preset.name} · 이 대화방에만 적용${n ? ` · 기본값과 다른 값 ${n}개` : ''}`}</small>
    {defs.map(d => <Row d={d} key={`${gen.current}-${d.id || d.name}`}><Control d={d} value={mine[d.name]} set={v => { mine[d.name] = v; saveChat(); redraw(); }} /></Row>)}
    <div className="row wrap"><Btn label="기본값으로" cls="ghost" ic="refresh" onClick={() => { delete chat.pvars?.[preset.id]; void S.save('chats', chat, true); gen.current++; redraw(); }} /><Btn label="변수 고치기" cls="ghost" ic="edit" onClick={() => L.ui.go('presets', preset.id)} /></div>
    {chat.mode === 'talk' ? <small className="hint">{'대화 모드는 프리셋 블록 대신 대화 모드 지시문을 씁니다. 그 지시문 안에 적은 {{var::이름}} 에만 적용돼요.'}</small> : null}
  </>;
}

/** 선택지 목록 고치기 */
function Options({ v, sv, changed }: { v: PVar; sv: () => void; changed: () => void }) {
  const gen = useRef(0), { pvDefault } = cond();
  const opts = v.options = Array.isArray(v.options) && v.options.length ? v.options : [{ label: '보통', value: '' }];
  const again = () => { gen.current++; changed(); };   // 개수가 바뀌면 칸을 새로 만든다
  return <div className="pv-opts">
    <div className="pv-opt pv-opt-head"><span>기본</span><span>선택지 이름</span><span>프롬프트에 들어갈 글 (비우면 아무것도 넣지 않음)</span><span /></div>
    {opts.map((o, k) => <div className="pv-opt" key={`${gen.current}-${k}`}>
      <label className="pv-radio" title="기본값으로"><input type="radio" name={'pvd-' + v.id} checked={pvDefault(v) === o.label} onChange={() => { v.default = o.label; sv(); changed(); }} /><i /></label>
      <input className="inp" defaultValue={o.label} placeholder="이름" onChange={e => { const was = o.label; o.label = e.target.value; if (v.default === was) v.default = o.label; sv(); changed(); }} />
      <textarea className="inp" defaultValue={o.value ?? ''} rows={2} placeholder={'{{var::' + v.name + '}} 자리에 들어갈 글'} spellCheck={false} onChange={e => { o.value = e.target.value; sv(); }} />
      <IconBtn ic="x" title="선택지 지우기" cls="tiny" onClick={() => { if (opts.length < 2) return toast('선택지는 하나 이상 있어야 해요'); opts.splice(k, 1); if (!opts.some(x => x.label === v.default)) v.default = opts[0].label; sv(); again(); }} />
    </div>)}
    <Btn label="선택지 추가" ic="plus" cls="ghost" onClick={() => { opts.push({ label: `선택지 ${opts.length + 1}`, value: '' }); sv(); again(); }} />
  </div>;
}

/** 프리셋 화면의 변수 정의 편집기 */
export function PresetVarsEditor({ p, sv }: { p: Preset; sv: () => void }) {
  const { PV_TYPES, pvName, pvDefault, pvCoerce, usedVars } = cond();
  const redraw = useBump(), open = useRef(new Set<string>()).current, shown = useRef(new Map<string, string>()).current, gen = useRef(0);
  const vars = p.vars = Array.isArray(p.vars) ? p.vars : [];
  const used = () => { const s = new Set<string>(); for (const b of p.blocks || []) for (const n of usedVars(b.content)) s.add(n); for (const k of ['prefill', 'continueNudge', 'impersonatePrompt', 'groupNudge']) for (const n of usedVars(p.params?.[k])) s.add(n); return s; };
  const uniq = (name: string, self?: PVar) => { let n = name || '변수', i = 2; while (vars.some(v => v !== self && v.name === n)) n = `${name}${i++}`; return n; };
  const names = new Set(vars.map(v => v.name)), missing = [...used()].filter(n => !names.has(n));
  const add = (v: PVar) => { vars.push(v); open.add(v.id); sv(); redraw(); };
  const swap = (i: number, j: number) => { [vars[i], vars[j]] = [vars[j], vars[i]]; sv(); redraw(); };

  const card = (v: PVar, i: number) => {
    const isOpen = open.has(v.id), def = pvDefault(v);
    if (isOpen && !shown.has(v.id)) shown.set(v.id, v.type);   // 이 종류로 그려 둔 칸
    return <div className={'block pv-card' + (isOpen ? ' open' : '')} key={v.id}>
      <div className="block-head" onClick={e => { if ((e.target as Element).closest('button')) return; if (isOpen) open.delete(v.id); else open.add(v.id); redraw(); }}>
        <div className="col move"><IconBtn ic="up" title="위로" cls="tiny" onClick={() => { if (i > 0) swap(i, i - 1); }} /><IconBtn ic="down" title="아래로" cls="tiny" onClick={() => { if (i < vars.length - 1) swap(i, i + 1); }} /></div>
        <Icon name="sliders" size={15} /><b>{v.label || v.name}</b><code className="pv-code">{`{{var::${v.name}}}`}</code><em className="badge">{PV_TYPES[v.type] || '짧은 글'}</em>
        <span className="tokbadge">{v.type === 'select' ? `${(v.options || []).length}개 중 ${def || '—'}` : v.type === 'toggle' ? (def ? '기본 켬' : '기본 끔') : `기본 ${def === '' ? '비어 있음' : def}`}</span>
        <IconBtn ic="trash" title="변수 삭제" cls="tiny" onClick={() => { vars.splice(i, 1); sv(); redraw(); }} />
      </div>
      {isOpen && <div className="block-body">
        {/* 종류가 바뀌면 이름 칸까지 새로 만든다 (다듬은 이름이 보이게) */}
        <Form key={v.type} obj={v} defs={[{ k: 'name', label: '이름 (블록에서 부를 때)', half: true, hint: '글자 · 숫자 · 밑줄만. 띄어쓰기는 밑줄로 바뀝니다.' }, { k: 'label', label: '화면에 보일 이름', half: true, ph: '예: 답변 길이' },
          { k: 'type', label: '종류', type: 'select', opts: Object.entries(PV_TYPES), half: true }, { k: 'hint', label: '도움말', half: true, ph: '고를 때 아래에 작게 보입니다' }]}
        onChange={() => {
          const typeChanged = v.type !== (shown.get(v.id) ?? v.type); shown.set(v.id, v.type);
          v.name = uniq(pvName(v.name) || '변수', v);
          if (typeChanged) v.default = v.type === 'toggle' ? false : v.type === 'slider' ? (Number(v.min) || 0) : v.type === 'select' ? (v.options?.[0]?.label || '') : '';
          sv(); redraw();
        }} />
        {v.type === 'select' ? <><Options v={v} sv={sv} changed={redraw} /><small className="hint">{`조건에서는 선택지 이름으로 견줍니다: {{#if ${v.name} == "${v.options?.[0]?.label ?? ''}"}} … {{/if}}`}</small></>
          : v.type === 'slider' ? <>
            <Form obj={v} defs={[{ k: 'min', label: '가장 작은 값', type: 'num', third: true }, { k: 'max', label: '가장 큰 값', type: 'num', third: true }, { k: 'step', label: '한 칸', type: 'num', third: true }]} onChange={() => { if (Number(v.max) < Number(v.min)) v.max = v.min; v.default = pvCoerce(v, v.default); sv(); gen.current++; redraw(); }} />
            <div className="pv-prev"><Row d={v} extra={<em className="badge">기본값</em>}><Control key={gen.current} d={v} value={v.default} set={x => { v.default = x; sv(); redraw(); }} /></Row></div>
            <small className="hint">{`숫자 그대로 들어갑니다. 조건 예: {{#if ${v.name} >= ${v.max ?? 5}}} … {{/if}}`}</small></>
            : v.type === 'toggle' ? <>
              <Form obj={v} defs={[{ k: 'default', label: '처음에는 켜 두기', type: 'check' }, { k: 'onText', label: '켰을 때 들어갈 글', type: 'area', rows: 2, ph: '비우면 true', half: true }, { k: 'offText', label: '껐을 때 들어갈 글', type: 'area', rows: 2, ph: '비우면 아무것도 넣지 않음', half: true }]} onChange={() => { sv(); redraw(); }} />
              <small className="hint">{`글을 통째로 넣고 빼려면: {{#if ${v.name}}} 켰을 때만 들어갈 글 {{else}} 껐을 때 {{/if}}`}</small></>
              : <><Form obj={v} defs={[{ k: 'default', label: '기본값', ph: '비워 둘 수 있어요' }]} onChange={sv} /><small className="hint">{`비어 있는지 볼 때: {{#if ${v.name}}} … {{var::${v.name}}} … {{/if}}`}</small></>}
      </div>}
    </div>;
  };
  return <div className="pv-editor">
    <p className="hint">프리셋을 쓰는 사람이 고르는 값입니다. 블록 안에 <code>{'{{var::이름}}'}</code> 을 적으면 고른 값이 들어가고, <code>{'{{#if 이름}}…{{else}}…{{/if}}'}</code> 로 글을 통째로 넣거나 뺄 수 있어요. 값은 대화 화면의 장면 패널에서 대화방마다 따로 고릅니다. 추가 호출은 없습니다.</p>
    {missing.length ? <div className="pv-missing"><span>블록에서 쓰이지만 아직 없는 변수</span>{missing.map(n => <button type="button" className="chip" key={n} title="이 이름으로 변수 만들기" onClick={() => { const v = newVar('text', vars.length + 1); v.name = pvName(n) || v.name; add(v); }}>{n} +</button>)}</div> : null}
    {vars.map(card)}
    <div className="row wrap">
      <Btn label="변수 추가" ic="plus" cls="ghost" onClick={e => menu(e.currentTarget, Object.entries(PV_TYPES).map(([t, l]) => ({ label: l, hint: TYPE_HINT[t], onclick: () => { const v = newVar(t, vars.length + 1); v.name = uniq(v.name); add(v); } })))} />
      <Btn label="조건식 쓰는 법" ic="note" cls="ghost" onClick={() => openModal({ title: '조건식 쓰는 법', body: <div className="help">{COND_HELP.map(([c, d], i) => <div className="help-row" key={i}><code>{c}</code><span>{d}</span></div>)}</div> })} />
    </div>
  </div>;
}
