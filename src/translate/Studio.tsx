// 기능 화면 › 번역: 기본(연결 · 언어 · 지시문 프리셋 · 시험 번역) / 설정(요청 · 단추 · 번역 기록 지우기)
import { useRef, useState, type MouseEvent } from 'react';
import { Btn, Icon, IconBtn, useEvents } from '../kit';
import { errMsg } from '../addons/parts';
import { Check, Field, PathIcon, Select, type Opt } from '../addons/parts';
import { DEFAULT_PROMPT, LANGS, VARS, findLang, langDisplay, langLabel } from './lang';
import { getLang, t } from '../i18n';
import { cfg, deleteRange, presetOf, save, translate, translatedCount, type LangKey, type TrCfg, type TrPreset } from './logic';
import { GLOBE, SHEET, SPIRAL, redecorate } from './chat';
import { S, clamp } from '../lib/core';
import { confirmBox, promptBox, toast } from '../ui';
import { go } from '../lib/router';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';

let sub: 'basic' | 'options' = 'basic';
const MODE = { none: 'translate.mode.none', responses: 'translate.mode.responses', inputs: 'translate.mode.inputs', both: 'translate.mode.both' };   // 그릴 때 t()
/** 처음부터 있던 기본 프리셋 이름만 화면 언어로 (저장된 이름은 그대로) */
const presetName = (p: TrPreset) => p.id === 'default' && p.name === '기본' ? t('translate.preset.default') : p.name;
type Mode = keyof typeof MODE;

function LangSelect({ c, k, fallback, draw }: { c: TrCfg; k: LangKey; fallback: string; draw: () => void }) {
  const cur = c[k] || fallback, known = findLang(cur);
  const opts: Opt[] = [...LANGS.map(l => { const d = langDisplay(l); return [l[1], getLang() === 'ko' || d !== l[1] ? `${d} · ${l[1]}` : l[1]] as const; }), ...(known ? [] : [[cur, t('translate.lang.custom', { name: cur })] as const]), ['\u0001', t('translate.lang.typeIn')]];
  return <Select value={known ? known[1] : cur} opts={opts} onChange={async v => {
    if (v === '\u0001') { const v2 = await promptBox(t('translate.lang.namePrompt'), known ? '' : cur, { placeholder: t('translate.lang.namePh') }); if (v2?.trim()) c[k] = v2.trim(); save(); return draw(); }
    c[k] = v; save(); redecorate(); draw();
  }} />;
}

function Basic({ c, p, mode, draw }: { c: TrCfg; p: TrPreset; mode: Mode; draw: () => void }) {
  const helpers = S.settings.helpers as Record<string, string>;
  const area = useRef<HTMLTextAreaElement>(null);
  const [test, setTest] = useState(''), [out, setOut] = useState({ cls: '', text: '' });
  const alive = useRef(true);
  const runTest = async (e: MouseEvent<HTMLButtonElement>) => {
    const b = e.currentTarget; if (!test.trim()) return toast(t('translate.test.empty'));
    b.disabled = true; setOut({ cls: 'wait', text: t('translate.test.running') });
    let next;
    try { next = { cls: 'done', text: await (X.translate || translate)(test, c.lang, { chat: chatApi.current().chat, context: [] }) }; }
    catch (err) { next = { cls: 'fail', text: t('translate.test.fail', { err: errMsg(err) }) }; }
    b.disabled = false; if (alive.current && b.isConnected) setOut(next);
  };
  const named = async (title: string, first: string) => {
    const name = (await promptBox(title, first))?.trim(); if (!name || name === first) return '';
    if (c.presets.some(x => x.name === name)) { toast(t('translate.preset.dupName'), 'err'); return ''; }
    return name;
  };
  return <div className="card trx-card" ref={el => { alive.current = !!el; }}>
    <div className="form">
      <h3 className="form-sec">{t('translate.secConn')}</h3>
      <Field label={t('translate.conn')} hint={t('translate.connHint')}><div className="trx-row">
        <Select value={helpers.translate} opts={[['', t('translate.connChat')], ...S.conns.map(x => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`] as const)]} onChange={v => { helpers.translate = v; save(); draw(); }} />
        <IconBtn ic="plug" title={t('translate.conn.toConns')} onClick={() => go('conns')} /></div></Field>
      <Field label={t('translate.auto')} hint={t('translate.autoHint')}>
        <Select value={mode} opts={[['none', t('translate.auto.none')], ['responses', t('translate.auto.responses')], ['inputs', t('translate.auto.inputs')], ['both', t('translate.auto.both')]]} onChange={v => { c.auto = v === 'responses' || v === 'both'; c.autoInput = v === 'inputs' || v === 'both'; save(); draw(); }} /></Field>
      <Field label={t('translate.lang.reply')} cls="half"><LangSelect c={c} k="lang" fallback="Korean" draw={draw} /></Field>
      <Field label={t('translate.lang.input')} cls="half"><LangSelect c={c} k="inputLang" fallback="English" draw={draw} /></Field>
      <h3 className="form-sec">{t('translate.secPreset')}</h3>
      <div className="field"><div className="trx-row">
        <Select value={c.preset} opts={c.presets.map(x => [x.id, presetName(x)] as const)} onChange={v => { c.preset = v; save(); draw(); }} />
        <IconBtn ic="plus" title={t('translate.preset.copy')} onClick={async () => {
          const name = await named(t('translate.preset.newName'), ''); if (!name) return;
          const id = 'p' + Date.now().toString(36); c.presets.push({ id, name, content: p.content, filter: p.filter }); c.preset = id; save(); draw();
        }} />
        <IconBtn ic="edit" title={t('translate.preset.rename')} onClick={async () => {
          if (p.id === 'default') return toast(t('translate.preset.cantRename'));
          const name = await named(t('translate.preset.name'), p.name); if (!name) return;
          p.name = name; save(); draw();
        }} />
        <IconBtn ic="trash" title={t('translate.preset.delete')} onClick={async () => {
          if (p.id === 'default') return toast(t('translate.preset.cantDelete'));
          if (!(await confirmBox(t('translate.preset.deleteConfirm', { name: p.name }), t('common.delete'), true))) return;
          c.presets = c.presets.filter(x => x !== p); c.preset = c.presets[0].id; save(); draw();
        }} /></div></div>
      <div className="field">
        <span className="field-label">{t('translate.prompt')}<button type="button" className="trx-restore" title={t('translate.prompt.restoreHint')}
          onClick={async () => { if (await confirmBox(t('translate.prompt.restoreConfirm'), t('translate.prompt.restoreBtn'))) { p.content = DEFAULT_PROMPT; p.filter = true; save(); draw(); } }}><Icon name="refresh" size={13} />{t('translate.prompt.restore')}</button></span>
        <textarea className="inp trx-prompt" ref={area} value={p.content} rows={14} spellCheck={false} onChange={e => { p.content = e.target.value; save(); draw(); }} />
        <div className="trx-vars">{VARS().map(([v, d]) => <button key={v} type="button" className="trx-var" title={t('translate.vars.insert', { desc: d })} onClick={() => {
          const a = area.current; if (!a) return; const at = a.selectionStart ?? a.value.length; a.setRangeText(v, at, a.selectionEnd ?? at, 'end'); a.focus(); p.content = a.value; save(); draw();
        }}>{v}</button>)}</div></div>
      <h3 className="form-sec">{t('translate.secTest')}</h3>
      <div className="field"><textarea className="inp" rows={2} placeholder={t('translate.test.ph')} value={test} onChange={e => setTest(e.target.value)} />
        <div className="trx-row"><span className="hint">{t('translate.test.hint', { lang: langLabel(c.lang) })}</span><Btn label={t('translate.test.run')} ic="play" onClick={e => void runTest(e)} /></div>
        <div className={`trx-test-out ${out.cls}`.trim()}>{out.text}</div></div>
    </div></div>;
}

function Options({ c, p, draw }: { c: TrCfg; p: TrPreset; draw: () => void }) {
  const { chat, msgs } = chatApi.current();
  const tok = useRef<HTMLInputElement>(null), ok = useRef<HTMLSpanElement>(null), from = useRef<HTMLInputElement>(null), to = useRef<HTMLInputElement>(null);
  const n = chat ? translatedCount(msgs) : 0;
  const show = (k: 'btnQuick' | 'btnTranslate' | 'btnRe' | 'btnEdit') => (v: boolean) => { c[k] = v; save(); redecorate(); draw(); };
  return <div className="card trx-card">
    <div className="form">
      <h3 className="form-sec">{t('translate.secRequest')}</h3>
      <div className="field half"><span className="field-label">{t('translate.maxTokens')}</span><div className="trx-row"><input className="inp" type="number" min={1000} max={200000} step={1000} defaultValue={c.maxTokens ?? 20000} ref={tok} />
        <Btn label={t('common.apply')} onClick={() => { const el = tok.current; if (!el) return; c.maxTokens = clamp(Math.round(+el.value) || 20000, 1000, 200000); el.value = String(c.maxTokens); save(); ok.current?.classList.add('show'); setTimeout(() => ok.current?.classList.remove('show'), 1800); }} /></div>
        <span className="trx-ok" ref={ok}><Icon name="check" size={14} />{t('translate.applied')}</span></div>
      <Field label={t('translate.context')} cls="half" hint={t('translate.contextHint')}>
        <input className="inp" type="number" min={0} max={20} defaultValue={c.context ?? 3} onChange={e => { c.context = clamp(Math.round(+e.target.value) || 0, 0, 20); save(); }} /></Field>
      <Check label={t('translate.filter')} on={p.filter !== false} onChange={v => { p.filter = v; save(); draw(); }} hint={t('translate.filterHint', { name: presetName(p) })} />
      <hr className="trx-hr" />
      <h3 className="form-sec">{t('translate.secButtons')}</h3>
      <Check label={t('translate.btn.quick')} on={c.btnQuick !== false} onChange={show('btnQuick')} />
      <Check label={t('translate.btn.translate')} on={c.btnTranslate !== false} onChange={show('btnTranslate')} />
      <Check label={t('translate.btn.re')} on={c.btnRe !== false} onChange={show('btnRe')} />
      <Check label={t('translate.btn.edit')} on={c.btnEdit !== false} onChange={show('btnEdit')} />
      <div className="trx-legend"><span><PathIcon d={GLOBE} size={15} />{t('translate.legend.go')}</span><span><PathIcon d={SPIRAL} size={15} />{t('translate.legend.re')}</span><span><PathIcon d={SHEET} size={15} />{t('translate.legend.edit')}</span></div>
      <hr className="trx-hr" />
      <h3 className="form-sec">{t('translate.secClear')}</h3>
      <div className="field">
        <span className="field-label">{chat ? t('translate.clear.count', { total: msgs.length, n }) : t('translate.clear.noChat')}</span>
        <div className="trx-row trx-range"><input className="inp" type="number" min={1} step={1} placeholder={t('translate.clear.from')} ref={from} /><span className="trx-tilde">~</span><input className="inp" type="number" min={1} step={1} placeholder={t('translate.clear.to')} ref={to} />
          <Btn label={t('common.delete')} cls="danger" ic="trash" onClick={async () => { if (await deleteRange(from.current?.value ?? '', to.current?.value ?? '', false)) draw(); }} /></div>
        <div className="trx-row"><Btn label={t('translate.clear.all')} cls="danger" onClick={async () => { if (await deleteRange(null, null, true)) draw(); }} /><span className="hint">{t('translate.clear.hint')}</span></div></div>
    </div></div>;
}

/** div.trx 안을 그린다 */
export function TranslateStudio() {
  const draw = useEvents('conns');
  const c = cfg(), p = presetOf();
  const mode: Mode = c.auto && c.autoInput ? 'both' : c.auto ? 'responses' : c.autoInput ? 'inputs' : 'none';
  return <>
    <div className="trx-top">
      <div className="trx-seg">{([['basic', t('translate.tab.basic')], ['options', t('translate.tab.options')]] as const).map(([k, l]) => <button key={k} type="button" className={sub === k ? 'on' : undefined} onClick={() => { sub = k; draw(); }}>{l}</button>)}</div>
      <div className="trx-state"><span className="badge on">{langLabel(c.lang)}</span><span className="badge" title={t('translate.auto')}>{t(MODE[mode])}</span><span className="badge">{presetName(p)}</span></div></div>
    {sub === 'basic' ? <Basic c={c} p={p} mode={mode} draw={draw} /> : <Options key={p.id} c={c} p={p} draw={draw} />}
    <p className="hint">{t('translate.cmdHint')}</p>
  </>;
}
