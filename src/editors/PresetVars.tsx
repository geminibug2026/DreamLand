// 프리셋 변수 — 프리셋에 정의하고, 대화방마다 값을 고른다
// 블록 안에서는 {{var::이름}} 과 {{#if 이름}}…{{else}}…{{/if}} 로 쓴다. 계산은 js/cond.js · js/engine.js(macro).
import { useRef, useState, type ReactNode } from 'react';
import { Btn, Icon, IconBtn } from '../kit';
import { Form, menu, openModal, toast } from '../ui';
import type { PVar, Preset, XChat } from './types';
import { useBump, useDebounced } from './parts';
import { go } from '../lib/router';
import { S } from '../lib/core';
import * as core from '../lib/core';
import * as cond from '../lib/cond';
import { t } from '../i18n';

const newVar = (type = 'select', n = 1): PVar => ({ id: core.uid(), name: `변수${n}`, label: '', hint: '', type, default: type === 'toggle' ? false : type === 'slider' ? 3 : type === 'select' ? '보통' : '',
  options: [{ label: '보통', value: '' }, { label: '다르게', value: '' }], min: 1, max: 5, step: 1, onText: '', offText: '' });

// 조건식 도움말: 키만 두고 그릴 때 번역한다 (presets.vars.help.N.code / .desc)
const COND_HELP = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const KNOWN = ['select', 'slider', 'toggle', 'text'];
const TYPE_HINT = (k: string) => KNOWN.includes(k) ? t('presets.vars.typeHint.' + k) : '';
/** 변수 종류 이름 (cond.PV_TYPES 는 한국어 원문 · 아는 종류만 번역) */
const typeLabel = (k: string) => KNOWN.includes(k) ? t('presets.vars.type.' + k) : cond.PV_TYPES[k];

/** 변수 하나의 입력 칸. value 는 처음 값이고, 바뀌면 set(v) 로 알린다 */
function Control({ d, value, set }: { d: PVar; value: unknown; set: (v: string | number | boolean) => void }) {
  const [v, setV] = useState(() => cond.pvCoerce(d, value));
  const put = (x: string | number | boolean) => { setV(x); set(x); };
  if (d.type === 'toggle') return <label className="pv-toggle"><span className="switch"><input type="checkbox" defaultChecked={!!v} onChange={e => put(e.target.checked)} /><i /></span><span>{v ? t('presets.vars.on') : t('presets.vars.off')}</span></label>;
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
  const { pvDefs, pvCoerce, pvDefault } = cond, redraw = useBump(), gen = useRef(0);
  const saveChat = useDebounced(() => S.save('chats', chat, true), 250);
  const preset = S.presetFor(chat), defs = pvDefs(preset);
  if (!defs.length) return <><p className="dim">{t('presets.vars.panel.empty')}</p><Btn label={t('presets.vars.panel.create')} ic="sliders" cls="ghost" onClick={() => go('presets', preset.id)} /></>;
  const mine = ((chat.pvars ||= {})[preset.id] ||= {});
  const n = defs.filter(d => mine[d.name] !== undefined && String(pvCoerce(d, mine[d.name])) !== String(pvDefault(d))).length;
  return <>
    <small className="hint">{t('presets.vars.panel.scope', { name: preset.name }) + (n ? t('presets.vars.panel.changed', { n }) : '')}</small>
    {defs.map(d => <Row d={d} key={`${gen.current}-${d.id || d.name}`}><Control d={d} value={mine[d.name]} set={v => { mine[d.name] = v; saveChat(); redraw(); }} /></Row>)}
    <div className="row wrap"><Btn label={t('presets.vars.panel.reset')} cls="ghost" ic="refresh" onClick={() => { delete chat.pvars?.[preset.id]; void S.save('chats', chat, true); gen.current++; redraw(); }} /><Btn label={t('presets.vars.panel.edit')} cls="ghost" ic="edit" onClick={() => go('presets', preset.id)} /></div>
    {chat.mode === 'talk' ? <small className="hint">{t('presets.vars.panel.talkNote')}</small> : null}
  </>;
}

/** 선택지 목록 고치기 */
function Options({ v, sv, changed }: { v: PVar; sv: () => void; changed: () => void }) {
  const gen = useRef(0), { pvDefault } = cond;
  const opts = v.options = Array.isArray(v.options) && v.options.length ? v.options : [{ label: '보통', value: '' }];
  const again = () => { gen.current++; changed(); };   // 개수가 바뀌면 칸을 새로 만든다
  return <div className="pv-opts">
    <div className="pv-opt pv-opt-head"><span>{t('presets.vars.opt.default')}</span><span>{t('presets.vars.opt.name')}</span><span>{t('presets.vars.opt.text')}</span><span /></div>
    {opts.map((o, k) => <div className="pv-opt" key={`${gen.current}-${k}`}>
      <label className="pv-radio" title={t('presets.vars.opt.makeDefault')}><input type="radio" name={'pvd-' + v.id} checked={pvDefault(v) === o.label} onChange={() => { v.default = o.label; sv(); changed(); }} /><i /></label>
      <input className="inp" defaultValue={o.label} placeholder={t('common.name')} onChange={e => { const was = o.label; o.label = e.target.value; if (v.default === was) v.default = o.label; sv(); changed(); }} />
      <textarea className="inp" defaultValue={o.value ?? ''} rows={2} placeholder={t('presets.vars.opt.textPh', { name: v.name })} spellCheck={false} onChange={e => { o.value = e.target.value; sv(); }} />
      <IconBtn ic="x" title={t('presets.vars.opt.remove')} cls="tiny" onClick={() => { if (opts.length < 2) return toast(t('presets.vars.opt.needOne')); opts.splice(k, 1); if (!opts.some(x => x.label === v.default)) v.default = opts[0].label; sv(); again(); }} />
    </div>)}
    <Btn label={t('presets.vars.opt.add')} ic="plus" cls="ghost" onClick={() => { opts.push({ label: `선택지 ${opts.length + 1}`, value: '' }); sv(); again(); }} />
  </div>;
}

/** 프리셋 화면의 변수 정의 편집기 */
export function PresetVarsEditor({ p, sv }: { p: Preset; sv: () => void }) {
  const { PV_TYPES, pvName, pvDefault, pvCoerce, usedVars } = cond;
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
        <div className="col move"><IconBtn ic="up" title={t('editors.moveUp')} cls="tiny" onClick={() => { if (i > 0) swap(i, i - 1); }} /><IconBtn ic="down" title={t('editors.moveDown')} cls="tiny" onClick={() => { if (i < vars.length - 1) swap(i, i + 1); }} /></div>
        <Icon name="sliders" size={15} /><b>{v.label || v.name}</b><code className="pv-code">{`{{var::${v.name}}}`}</code><em className="badge">{typeLabel(v.type) || t('presets.vars.type.text')}</em>
        <span className="tokbadge">{v.type === 'select' ? t('presets.vars.sum.select', { n: (v.options || []).length, def: def || '—' }) : v.type === 'toggle' ? (def ? t('presets.vars.sum.on') : t('presets.vars.sum.off')) : t('presets.vars.sum.value', { def: def === '' ? t('presets.vars.sum.empty') : def })}</span>
        <IconBtn ic="trash" title={t('presets.vars.delete')} cls="tiny" onClick={() => { vars.splice(i, 1); sv(); redraw(); }} />
      </div>
      {isOpen && <div className="block-body">
        {/* 종류가 바뀌면 이름 칸까지 새로 만든다 (다듬은 이름이 보이게) */}
        <Form key={v.type} obj={v} defs={[{ k: 'name', label: t('presets.vars.f.name'), half: true, hint: t('presets.vars.f.nameHint') }, { k: 'label', label: t('presets.vars.f.label'), half: true, ph: t('presets.vars.f.labelPh') },
          { k: 'type', label: t('presets.vars.f.type'), type: 'select', opts: Object.keys(PV_TYPES).map(k => [k, typeLabel(k)] as const), half: true }, { k: 'hint', label: t('presets.vars.f.hint'), half: true, ph: t('presets.vars.f.hintPh') }]}
        onChange={() => {
          const typeChanged = v.type !== (shown.get(v.id) ?? v.type); shown.set(v.id, v.type);
          v.name = uniq(pvName(v.name) || '변수', v);
          if (typeChanged) v.default = v.type === 'toggle' ? false : v.type === 'slider' ? (Number(v.min) || 0) : v.type === 'select' ? (v.options?.[0]?.label || '') : '';
          sv(); redraw();
        }} />
        {v.type === 'select' ? <><Options v={v} sv={sv} changed={redraw} /><small className="hint">{t('presets.vars.ex.select', { name: v.name, opt: v.options?.[0]?.label ?? '' })}</small></>
          : v.type === 'slider' ? <>
            <Form obj={v} defs={[{ k: 'min', label: t('presets.vars.f.min'), type: 'num', third: true }, { k: 'max', label: t('presets.vars.f.max'), type: 'num', third: true }, { k: 'step', label: t('presets.vars.f.step'), type: 'num', third: true }]} onChange={() => { if (Number(v.max) < Number(v.min)) v.max = v.min; v.default = pvCoerce(v, v.default); sv(); gen.current++; redraw(); }} />
            <div className="pv-prev"><Row d={v} extra={<em className="badge">{t('presets.vars.f.default')}</em>}><Control key={gen.current} d={v} value={v.default} set={x => { v.default = x; sv(); redraw(); }} /></Row></div>
            <small className="hint">{t('presets.vars.ex.slider', { name: v.name, max: v.max ?? 5 })}</small></>
            : v.type === 'toggle' ? <>
              <Form obj={v} defs={[{ k: 'default', label: t('presets.vars.f.startOn'), type: 'check' }, { k: 'onText', label: t('presets.vars.f.onText'), type: 'area', rows: 2, ph: t('presets.vars.f.onTextPh'), half: true }, { k: 'offText', label: t('presets.vars.f.offText'), type: 'area', rows: 2, ph: t('presets.vars.f.offTextPh'), half: true }]} onChange={() => { sv(); redraw(); }} />
              <small className="hint">{t('presets.vars.ex.toggle', { name: v.name })}</small></>
              : <><Form obj={v} defs={[{ k: 'default', label: t('presets.vars.f.default'), ph: t('presets.vars.f.defaultPh') }]} onChange={sv} /><small className="hint">{t('presets.vars.ex.text', { name: v.name })}</small></>}
      </div>}
    </div>;
  };
  return <div className="pv-editor">
    <p className="hint">{t('presets.vars.intro.a')}<code>{t('presets.vars.intro.code1')}</code>{t('presets.vars.intro.b')}<code>{t('presets.vars.intro.code2')}</code>{t('presets.vars.intro.c')}</p>
    {missing.length ? <div className="pv-missing"><span>{t('presets.vars.missing')}</span>{missing.map(n => <button type="button" className="chip" key={n} title={t('presets.vars.missingCreate')} onClick={() => { const v = newVar('text', vars.length + 1); v.name = pvName(n) || v.name; add(v); }}>{n} +</button>)}</div> : null}
    {vars.map(card)}
    <div className="row wrap">
      <Btn label={t('presets.vars.add')} ic="plus" cls="ghost" onClick={e => menu(e.currentTarget, Object.keys(PV_TYPES).map(k => ({ label: typeLabel(k), hint: TYPE_HINT(k), onclick: () => { const v = newVar(k, vars.length + 1); v.name = uniq(v.name); add(v); } })))} />
      <Btn label={t('presets.vars.help.title')} ic="note" cls="ghost" onClick={() => openModal({ title: t('presets.vars.help.title'), body: <div className="help">{COND_HELP.map(i => <div className="help-row" key={i}><code>{t(`presets.vars.help.${i}.code`)}</code><span>{t(`presets.vars.help.${i}.desc`)}</span></div>)}</div> })} />
    </div>
  </div>;
}
