// 일 → 모델: 어떤 일을 어느 연결 · 모델이 맡는지 한 표로 (기능 › 보조 연결). 연결 화면의 덧붙임 칸도 여기 있다
// 일(작업 키) 목록은 JOBS 한 곳에서 나온다. 새 기능이 S.helperConn('<키>', chat) 을 쓰면 여기에 한 줄을 더한다.
import { useState } from 'react';
import type { Conn } from '../lib/types';
import { S, chatConns, download, pickFiles, uid } from '../lib/core';
import { toast } from '../ui';
import { Icon } from '../kit';
import { t } from '../i18n';
import { MARKS, Mark, markOf } from './models';
import { realConn, type RConn } from './route';
import { packConns, unpackConns } from './connio';
import { shortModel } from './shuffle';

export interface Job { /** 작업 키 = S.helperConn 의 첫 인자. 이름 · 설명은 reach.job.<키> · reach.job.<키>Hint */ key: string; group: 'talk' | 'help' | 'crew'; /** 연결 id 가 적히는 설정 자리 (없으면 helpers.<키>) */ path?: string; /** 모델만 따로 정할 수 있는지 */ model?: boolean }
export const JOBS: Job[] = [
  { key: 'main', group: 'talk', path: 'activeConn' },
  { key: 'impersonate', group: 'talk', model: true },
  { key: 'auto', group: 'talk', path: 'modes.autoConn' },
  { key: 'all', group: 'help', model: true },
  { key: 'translate', group: 'help', model: true }, { key: 'memory', group: 'help', model: true }, { key: 'illust', group: 'help', model: true },
  { key: 'expr', group: 'help', model: true }, { key: 'caption', group: 'help', model: true }, { key: 'choices', group: 'help', model: true }, { key: 'mvu', group: 'help', model: true },
  { key: 'crew', group: 'crew', model: true }, { key: 'gate', group: 'crew', model: true }, { key: 'guide', group: 'crew', model: true }, { key: 'feed', group: 'crew', model: true },
];
const GROUPS: [Job['group'], string][] = [['talk', 'conversation'], ['help', 'helpers'], ['crew', 'backstage']];
const pathOf = (j: Job) => j.path || 'helpers.' + j.key;
const read = (path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], S.settings) as string | undefined;
function write(path: string, v: string) {
  const ks = path.split('.'), last = ks.pop()!; let o = S.settings as unknown as Record<string, unknown>;
  for (const k of ks) o = (o[k] ||= {}) as Record<string, unknown>;
  o[last] = v; S.set({});
}
const models = () => ((S.settings as unknown as { helperModel?: Record<string, string> }).helperModel ||= {});
/** 지금 이 일을 실제로 맡는 연결 */
const resolved = (j: Job): Conn | undefined => j.key === 'main' ? S.conn() : j.key === 'auto' ? S.get('conns', S.settings.modes.autoConn) || S.conn() : S.helperConn(j.key);

/** 배선 그림: 왼쪽의 일들이 오른쪽의 몇 개 모델로 모인다 */
function Wires({ n, m }: { n: number; m: number }) {
  const L = Math.min(n, 9), R = Math.max(1, Math.min(m, 4));
  return <svg className="fx-art rc-wires" viewBox="0 0 120 56" width="120" height="56" aria-hidden="true">
    {Array.from({ length: L }, (_, i) => { const y = 5 + i * (46 / Math.max(1, L - 1)), to = 10 + (i % R) * (36 / Math.max(1, R - 1 || 1)); return <g key={i}><path className={i % 3 ? 'h' : 't'} d={`M8 ${y.toFixed(1)}C52 ${y.toFixed(1)} 62 ${to.toFixed(1)} 108 ${to.toFixed(1)}`} /><circle className="f" cx="8" cy={y} r="1.3" /></g>; })}
    {Array.from({ length: R }, (_, i) => <circle key={i} className={i ? 'p' : 'af'} cx="110" cy={10 + i * (36 / Math.max(1, R - 1 || 1))} r="2.6" />)}
  </svg>;
}

export function JobsTable() {
  const [, tick] = useState(0), draw = () => tick(n => n + 1);
  const conns = chatConns(), hm = models();
  const used = new Set(JOBS.map(j => { const c = resolved(j); return c ? c.id + '|' + c.model : ''; }).filter(Boolean));
  const row = (j: Job) => {
    const path = pathOf(j), v = read(path) || '', now = resolved(j), own = j.key === 'main' || !!v || !!(j.model && hm[j.key]);
    const first = j.key === 'main' ? null : <option value="">{j.key === 'all' || j.group === 'talk' ? t('reach.job.sameMain') : t('reach.job.followAll')}</option>;
    return <div className={'rc-job' + (own ? ' own' : '')} key={j.key}>
      <div className="rc-job-name"><b>{t('reach.job.' + j.key)}</b><small>{t('reach.job.' + j.key + 'Hint')}</small></div>
      <div className="rc-job-set">
        <select className="inp" value={v} aria-label={t('reach.job.connOf', { job: t('reach.job.' + j.key) })} onChange={e => { write(path, e.target.value); draw(); }}>{first}{conns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {j.model ? <input className="inp rc-job-model" defaultValue={hm[j.key] || ''} placeholder={now?.model ? shortModel(now.model) : t('reach.job.modelPh')} aria-label={t('reach.job.modelOf', { job: t('reach.job.' + j.key) })} spellCheck={false} autoComplete="off" list="rc-job-models"
          onChange={e => { const m = e.target.value.trim(); if (m) hm[j.key] = m; else delete hm[j.key]; S.set({}); draw(); }} /> : <span className="rc-job-model rc-fixed fx-num">{now?.model ? shortModel(now.model) : '—'}</span>}
      </div>
      <div className="rc-job-now"><Mark c={now} /><span className="fx-num">{now ? `${now.name} · ${now.model || '—'}` : t('reach.job.none')}</span></div>
    </div>;
  };
  const main = realConn(S.conn());
  return <div className="card rc-jobs">
    <header className="rc-jobs-head"><div><span className="fx-lbl">job → model</span><h3 className="fx-title">{t('reach.job.title')}</h3><p className="hint">{t('reach.job.lead')}</p></div><Wires n={JOBS.length} m={used.size} /></header>
    <datalist id="rc-job-models">{[...new Set(conns.flatMap(c => [c.model, ...((c as RConn).saved || [])]).filter(Boolean))].map(m => <option key={m} value={m} />)}</datalist>
    {GROUPS.map(([g, en]) => <section key={g} className="rc-jobs-sec"><h4 className="fx-head"><span className="fx-lbl kr ink">{t('reach.job.group.' + g)}</span><span className="fx-lbl">{en}</span></h4>
      <div className="fx-rows">{JOBS.filter(j => j.group === g).map(row)}</div>
      {g === 'talk' && main ? <div className="rc-job rc-job-fb"><div className="rc-job-name"><b>{t('reach.fb.label')}</b><small>{t('reach.fb.hint')}</small></div>
        <div className="rc-job-set"><FallbackSelect c={main} onChange={draw} /></div><div className="rc-job-now" /></div> : null}
    </section>)}
    <p className="hint">{t('reach.job.foot')}</p>
  </div>;
}

function FallbackSelect({ c, onChange }: { c: RConn; onChange?: () => void }) {
  return <select className="inp" value={S.get('conns', c.fallback || '') ? c.fallback : ''} aria-label={t('reach.fb.label')} onChange={async e => { c.fallback = e.target.value; await S.save('conns', c, true); onChange?.(); }}>
    <option value="">{t('reach.fb.off')}</option>{chatConns().filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.id}>{`${x.name}${x.model ? ' · ' + x.model : ''}`}</option>)}</select>;
}

/** 연결 편집 화면 아래에 붙는 칸: 표식 · 분당 요청 수 · 안 되면 넘길 연결 · 저장해 둔 모델 */
export function ConnExtras({ c, onSave }: { c: Conn; onSave: () => void }) {
  const [, tick] = useState(0), draw = () => tick(n => n + 1), r = c as RConn;
  const save = () => { onSave(); draw(); };
  return <section className="rc-conn fx-frame">
    <h4 className="fx-head"><span className="fx-lbl kr ink">{t('reach.conn.title')}</span><span className="fx-lbl">routing</span></h4>
    <div className="rc-conn-grid">
      <div className="rc-conn-f"><span className="field-label">{t('reach.conn.mark')}</span>
        <div className="rc-marks" role="radiogroup" aria-label={t('reach.conn.mark')}>{MARKS.map(k => <button type="button" key={k} role="radio" aria-checked={markOf(c) === k} className={markOf(c) === k ? 'on' : ''} title={t('reach.conn.markN', { n: MARKS.indexOf(k) + 1 })} onClick={() => { r.mark = k; save(); }}><Mark name={k} size={14} /></button>)}</div>
        <small className="hint">{t('reach.conn.markHint')}</small></div>
      <label className="rc-conn-f"><span className="field-label">{t('reach.conn.rpm')}</span>
        <input className="inp" type="number" min={0} max={600} step={1} defaultValue={r.rpm || ''} placeholder={t('reach.conn.rpmPh')} onChange={e => { const n = Math.max(0, Math.floor(+e.target.value || 0)); if (n) r.rpm = n; else delete r.rpm; onSave(); }} />
        <small className="hint">{t('reach.conn.rpmHint')}</small></label>
      <div className="rc-conn-f"><span className="field-label">{t('reach.fb.label')}</span><FallbackSelect c={r} onChange={draw} /><small className="hint">{t('reach.fb.hint')}</small></div>
    </div>
    {(r.saved || []).length ? <div className="rc-conn-f"><span className="field-label">{t('reach.conn.saved')}</span>
      <div className="rc-saved">{(r.saved || []).map(m => <span className="fx-pill" key={m}><button type="button" title={t('reach.conn.useModel')} onClick={() => { const old = c.model; c.model = m; r.saved = [...(r.saved || []).filter(x => x !== m), old].filter(Boolean); save(); }}>{m}</button><button type="button" aria-label={t('reach.pick.forget')} title={t('reach.pick.forget')} onClick={() => { r.saved = (r.saved || []).filter(x => x !== m); save(); }}><Icon name="x" size={11} /></button></span>)}</div></div> : null}
  </section>;
}

/** 연결 목록 위 단추들이 부르는 것: 키 없이 내보내기 · 가져오기 */
export function exportAllConns() { const list = chatConns(), n = list.length; download(`dreamland-connections-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(packConns(list), null, 2)); toast(t('reach.conn.exported', { n }), 'ok'); }
export async function importConnFile(after: () => void) {
  const [f] = await pickFiles({ accept: '.json,application/json' }); if (!f) return;
  try { const list = unpackConns(JSON.parse(await f.text()), uid), n = list.length; for (const c of list) await S.save('conns', c, true); if (!n) throw new Error(t('reach.conn.importNone')); toast(t('reach.conn.imported', { n }), 'ok'); after(); }
  catch (e) { toast(t('reach.conn.importFail', { err: e instanceof Error ? e.message : String(e) }), 'err'); }
}
