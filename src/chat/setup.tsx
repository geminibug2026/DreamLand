// 새 대화를 열기 전에: 프리셋 변수와 빈자리({{이름}})를 한 화면에서 고르고 "설정 후 시작"
// 고른 값은 그 방의 chat.pvars[프리셋 id] 에 들어가고, 다음 새 대화의 처음 값으로 기억해 둔다 (settings.pvLast)
import { useState } from 'react';
import { Btn } from '../kit';
import { openModal } from '../ui';
import { S } from '../lib/core';
import { looseSlots } from '../lib/engine';
import { pvCoerce, pvDefault, pvDefs, type PvRaw } from '../lib/cond';
import { Control } from '../editors/PresetVars';
import type { Chat, Preset } from '../lib/types';
import { t } from '../i18n';

type Vals = Record<string, PvRaw>;
const lastOf = (p: Preset): Vals => ((S.settings as { pvLast?: Record<string, Vals> }).pvLast || {})[p.id] || {};
/** 이 프리셋으로 새 대화를 열 때 물어볼 것이 있는지 */
export const setupWanted = (p: Preset | null | undefined) => !!p && !p.noSetup && (pvDefs(p).length > 0 || looseSlots(p).length > 0);

function Sheet({ preset, done }: { preset: Preset; done: (v: Vals | null, quiet: boolean) => void }) {
  const defs = pvDefs(preset), slots = looseSlots(preset), last = lastOf(preset);
  const start = (): Vals => { const o: Vals = {}; for (const d of defs) o[d.name] = pvCoerce(d, last[d.name]); for (const n of slots) o[n] = typeof last[n] === 'string' ? last[n] as string : ''; return o; };
  const [vals, setVals] = useState(start), [gen, setGen] = useState(0), [quiet, setQuiet] = useState(false);
  const put = (k: string, v: PvRaw) => setVals(o => ({ ...o, [k]: v }));
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const changed = defs.filter(d => !same(vals[d.name], pvDefault(d))).length + slots.filter(n => vals[n] !== '').length;
  return <div className="setup">
    <p className="setup-lead">{t('chat.setup.lead')}</p>
    {defs.length ? <section className="setup-sec">{defs.map(d => <div className={'setup-row' + (same(vals[d.name], pvDefault(d)) ? '' : ' moved')} key={gen + d.name}>
      <div className="setup-head"><b>{d.label || d.name}</b>{d.multi ? <em className="setup-tag">{t('chat.setup.multi')}</em> : null}</div>
      {d.hint && d.type !== 'text' ? <small className="hint">{d.hint}</small> : null}
      <Control d={d} value={vals[d.name]} set={v => put(d.name, v)} />
    </div>)}</section> : null}
    {slots.length ? <section className="setup-sec setup-slots">
      <div className="setup-sub"><b>{t('chat.setup.slots')}</b><small className="hint">{t('chat.setup.slotsHint')}</small></div>
      {slots.map(n => <label className="setup-row" key={gen + n}><div className="setup-head"><b>{n}</b></div>
        <input className="inp" value={String(vals[n] ?? '')} placeholder={t('chat.setup.slotPh')} spellCheck={false} onChange={e => put(n, e.target.value)} /></label>)}
    </section> : null}
    <footer className="setup-foot">
      <label className="setup-quiet"><input type="checkbox" checked={quiet} onChange={e => setQuiet(e.target.checked)} /><span>{t('chat.setup.quiet')}</span></label>
      <div className="setup-btns">
        <Btn label={t('chat.setup.reset')} cls="ghost" ic="refresh" title={t('chat.setup.resetHint')} onClick={() => { const o: Vals = {}; for (const d of defs) o[d.name] = pvDefault(d); for (const n of slots) o[n] = ''; setVals(o); setGen(g => g + 1); }} />
        <Btn label={changed ? t('chat.setup.goN', { n: changed }) : t('chat.setup.go')} ic="play" cls="primary" onClick={() => done(vals, quiet)} />
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
    const h = openModal({ title: t('chat.setup.title', { name: preset.name }), onClose: () => res(ok), body: <Sheet preset={preset} done={(v, quiet) => {
      if (!v) return h.close();
      ((chat as { pvars?: Record<string, Vals> }).pvars ||= {})[preset.id] = v; ok = true;
      const st = S.settings as { pvLast?: Record<string, Vals> }; S.set({ pvLast: { ...(st.pvLast || {}), [preset.id]: v } } as never);
      if (quiet) { preset.noSetup = true; void S.save('presets', preset, true); }
      h.close();
    }} /> });
  });
}
