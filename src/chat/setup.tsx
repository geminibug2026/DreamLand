// 새 대화를 열기 전에: 프리셋 변수와 빈자리({{이름}})를 한 화면에서 고르고 "설정 후 시작"
// 고른 값은 그 방의 chat.pvars[프리셋 id] 에 들어가고, 다음 새 대화의 처음 값으로 기억해 둔다 (settings.pvLast)
import { useState } from 'react';
import { openModal } from '../ui';
import { S } from '../lib/core';
import { looseSlots } from '../lib/engine';
import { pvCoerce, pvDefault, pvDefs, type PvDef, type PvRaw } from '../lib/cond';
import { Control } from '../editors/PresetVars';
import type { Chat, Preset } from '../lib/types';
import { t } from '../i18n';

type Vals = Record<string, PvRaw>;
const lastOf = (p: Preset): Vals => ((S.settings as { pvLast?: Record<string, Vals> }).pvLast || {})[p.id] || {};
/** 이 프리셋으로 새 대화를 열 때 물어볼 것이 있는지 */
export const setupWanted = (p: Preset | null | undefined) => !!p && !p.noSetup && (pvDefs(p).length > 0 || looseSlots(p).length > 0);

/** 선택지: 한 개면 동그라미, 여러 개면 네모. 손가락으로 누르기 좋은 큰 칸 */
function Choices({ d, value, set }: { d: PvDef; value: PvRaw; set: (v: PvRaw) => void }) {
  const opts = d.options || [], on = d.multi ? (Array.isArray(value) ? value : []) : [String(value)];
  const tap = (label: string) => set(d.multi ? opts.filter(o => (o.label === label) !== on.includes(o.label)).map(o => o.label) : label);
  const long = opts.some(o => o.label.length > 12);
  return <div className={'su-opts' + (long ? ' long' : '')} role={d.multi ? 'group' : 'radiogroup'}>
    {opts.map((o, i) => { const sel = on.includes(o.label); return <button type="button" key={i} role={d.multi ? 'checkbox' : 'radio'} aria-checked={sel} className={'su-opt' + (sel ? ' on' : '') + (d.multi ? ' multi' : '')} onClick={() => tap(o.label)}>
      <i className="su-mark" aria-hidden="true" /><span>{o.label}</span></button>; })}
  </div>;
}

function Sheet({ preset, done }: { preset: Preset; done: (v: Vals | null, quiet: boolean) => void }) {
  const defs = pvDefs(preset), slots = looseSlots(preset), last = lastOf(preset);
  const start = (): Vals => { const o: Vals = {}; for (const d of defs) o[d.name] = pvCoerce(d, last[d.name]); for (const n of slots) o[n] = typeof last[n] === 'string' ? last[n] as string : ''; return o; };
  const [vals, setVals] = useState(start), [gen, setGen] = useState(0), [quiet, setQuiet] = useState(false);
  const put = (k: string, v: PvRaw) => setVals(o => ({ ...o, [k]: v }));
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const changed = defs.filter(d => !same(vals[d.name], pvDefault(d))).length + slots.filter(n => vals[n] !== '').length;
  const summary = (d: PvDef) => { const v = vals[d.name]; return d.type === 'select' && d.multi ? (Array.isArray(v) && v.length ? t('chat.setup.picked', { n: v.length }) : t('chat.setup.none')) : d.type === 'toggle' ? (v ? t('presets.vars.on') : t('presets.vars.off')) : String(v ?? ''); };
  return <div className="su">
    <div className="su-top"><span className="su-preset">{preset.name}</span><p>{t('chat.setup.lead')}</p></div>
    <div className="su-list">
      {defs.map(d => { const moved = !same(vals[d.name], pvDefault(d)); return <section className="su-item" key={gen + d.name}>
        <header className="su-head"><b>{d.label || d.name}</b>{d.multi ? <em className="su-tag">{t('chat.setup.multi')}</em> : null}{d.type !== 'text' ? <span className={'su-now' + (moved ? ' moved' : '')}>{summary(d)}</span> : null}</header>
        {d.hint && d.type !== 'text' ? <p className="su-hint">{d.hint}</p> : null}
        {d.type === 'select' ? <Choices d={d} value={vals[d.name]} set={v => put(d.name, v)} /> : <div className="su-ctl"><Control d={d} value={vals[d.name]} set={v => put(d.name, v)} /></div>}
      </section>; })}
      {slots.length ? <section className="su-item su-blanks">
        <header className="su-head"><b>{t('chat.setup.slots')}</b></header>
        <p className="su-hint">{t('chat.setup.slotsHint')}</p>
        {slots.map(n => <label className="su-field" key={gen + n}><span>{n}</span>
          <input className="inp" value={String(vals[n] ?? '')} placeholder={t('chat.setup.slotPh')} spellCheck={false} enterKeyHint="next" onChange={e => put(n, e.target.value)} /></label>)}
      </section> : null}
    </div>
    <footer className="su-foot">
      <button type="button" className="su-go" onClick={() => done(vals, quiet)}><span>{t('chat.setup.go')}</span>{changed ? <small>{t('chat.setup.changedN', { n: changed })}</small> : null}</button>
      <div className="su-sub">
        <button type="button" className="su-link" onClick={() => { const o: Vals = {}; for (const d of defs) o[d.name] = pvDefault(d); for (const n of slots) o[n] = ''; setVals(o); setGen(g => g + 1); }}>{t('chat.setup.reset')}</button>
        <label className="su-quiet"><input type="checkbox" checked={quiet} onChange={e => setQuiet(e.target.checked)} /><span>{t('chat.setup.quietShort')}</span></label>
      </div>
    </footer>
  </div>;
}

/** 고르는 창을 띄운다. 시작을 누르면 chat.pvars 를 채우고 true, 닫으면 false (방을 만들지 않는다) */
export function askSetup(chat: Chat): Promise<boolean> {
  const preset = S.presetFor(chat);
  if (!setupWanted(preset)) return Promise.resolve(true);
  return new Promise(res => {
    let ok = false;
    const h = openModal({ title: t('chat.setup.title2'), onClose: () => res(ok), body: <Sheet preset={preset} done={(v, quiet) => {
      if (!v) return h.close();
      ((chat as { pvars?: Record<string, Vals> }).pvars ||= {})[preset.id] = v; ok = true;
      const st = S.settings as { pvLast?: Record<string, Vals> }; S.set({ pvLast: { ...(st.pvLast || {}), [preset.id]: v } } as never);
      if (quiet) { preset.noSetup = true; void S.save('presets', preset, true); }
      h.close();
    }} /> });
  });
}
