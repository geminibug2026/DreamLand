// 변수 갱신 틀(MVU) 화면: 확장 화면의 설정 칸 · 장면 패널의 "상태창 변수" 칸
import { useState } from 'react';
import type { Chat, Msg } from '../lib/types';
import { Btn, useEvents } from '../kit';
import { Check, Field, Select, openModal } from '../addons/parts';
import { promptBox, toast } from '../ui';
import { cur } from '../chat/store';
import { t } from '../i18n';
import { formatVar } from './engine';
import * as A from './app';

/** 확장 화면의 설정 칸 */
export function MvuSettings() {
  useEvents('mvu:changed');
  const c = A.cfg(), set = (p: Partial<A.MvuCfg>) => A.setCfg(p);
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  return <div className="card mvu-set">
    <h3 className="form-sec">{t('mvu.set.title')}</h3>
    <p className="hint">{t('mvu.set.intro')}</p>
    <Field label={t('mvu.set.mode')} hint={c.mode === 'extra' ? t('mvu.set.costNote') : t('mvu.set.modeInlineHint')}>
      <Select value={c.mode} opts={[['inline', t('mvu.set.modeInline')], ['extra', t('mvu.set.modeExtra')]]} onChange={v => set({ mode: v as A.MvuCfg['mode'] })} />
    </Field>
    {c.mode === 'extra' ? <>
      <Check label={t('mvu.set.auto')} hint={t('mvu.set.autoHint')} on={c.auto} onChange={v => set({ auto: v })} />
      <div className="row wrap">
        <Field label={t('mvu.set.minLen')} hint={t('mvu.set.minLenHint')}><input className="inp" type="number" min={0} defaultValue={c.minLen} onChange={e => set({ minLen: num(e.target.value, 0, 100000) })} /></Field>
        <Field label={t('mvu.set.history')} hint={t('mvu.set.historyHint')}><input className="inp" type="number" min={1} max={100} defaultValue={c.history} onChange={e => set({ history: num(e.target.value, 1, 100) })} /></Field>
        <Field label={t('mvu.set.tries')} hint={t('mvu.set.triesHint')}><input className="inp" type="number" min={1} max={5} defaultValue={c.tries} onChange={e => set({ tries: num(e.target.value, 1, 5) })} /></Field>
      </div>
      <Field label={t('mvu.set.trigger')} hint={t('mvu.set.triggerHint')}><input className="inp" defaultValue={c.trigger} spellCheck={false} onChange={e => set({ trigger: e.target.value })} /></Field>
      <Field label={t('mvu.set.white')} hint={t('mvu.set.whiteHint')}><input className="inp" defaultValue={c.white} spellCheck={false} onChange={e => set({ white: e.target.value })} /></Field>
      <Field label={t('mvu.set.black')} hint={t('mvu.set.blackHint')}><input className="inp" defaultValue={c.black} spellCheck={false} onChange={e => set({ black: e.target.value })} /></Field>
    </> : null}
    <Check label={t('mvu.set.notifyErr')} on={c.notifyErr} onChange={v => set({ notifyErr: v })} />
    <Check label={t('mvu.set.notifyInit')} on={c.notifyInit} onChange={v => set({ notifyInit: v })} />
    <details className="api-doc"><summary>{t('mvu.set.more')}</summary>
      <Check label={t('mvu.set.toChat')} hint={t('mvu.set.toChatHint')} on={c.toChat} onChange={v => set({ toChat: v })} />
      <Check label={t('mvu.set.sendas')} hint={t('mvu.set.sendasHint')} on={c.sendas} onChange={v => set({ sendas: v })} />
    </details>
  </div>;
}

const short = (s: string, n = 6000) => s.length > n ? s.slice(0, n) + '\n…' : s;
/** 장면 패널: 지금 변수 · 카드가 정한 설정 · 손으로 하는 일 */
export function MvuPanel({ chat }: { chat: Chat; msgs: Msg[] }) {
  useEvents('mvu:updated', 'mvu:changed');
  const [busy, setBusy] = useState(false);
  if (!A.usesMvu(chat)) return <p className="hint">{t('mvu.panel.none')}</p>;
  const E = A.eff(chat), d = A.latestData(chat), card = E.card;
  const cardBits = [card.mode && t('mvu.panel.cardMode', { mode: t(card.mode === 'extra' ? 'mvu.set.modeExtra' : 'mvu.set.modeInline') }), card.auto !== undefined && t(card.auto ? 'mvu.panel.cardAutoOn' : 'mvu.panel.cardAutoOff'), card.toChat !== undefined && t('mvu.set.toChat'), (card.white || card.black) && t('mvu.panel.cardFilter')].filter(Boolean);
  const go = (fn: () => Promise<unknown>) => async () => { if (busy || cur.busy) return; setBusy(true); try { await fn(); } catch (e) { toast(String((e as Error)?.message || e), 'err'); } finally { setBusy(false); } };
  const repair = async () => {
    const dir = await promptBox(t('mvu.panel.repairAsk'), '', { placeholder: t('mvu.panel.repairPh') }); if (dir === null) return;
    await A.repairLast(dir, (cmds, block) => new Promise<boolean>(res => {
      let done = false; const fin = (v: boolean) => { if (!done) { done = true; res(v); } };
      openModal({ title: t('mvu.panel.repairTitle'), onClose: () => fin(false), actions: [{ label: t('common.cancel'), onclick: () => fin(false) }, { label: t('mvu.panel.repairApply'), cls: 'primary', onclick: () => fin(true) }] },
        () => <div><p>{t('mvu.panel.repairN', { n: cmds.length })}</p><ol>{cmds.map((c, i) => <li key={i}><code>{c}</code></li>)}</ol><details><summary>{t('mvu.panel.repairRaw')}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{block}</pre></details></div>);
    }));
  };
  return <div className="col mvu-panel">
    <small className="hint">{E.mode === 'extra' ? t('mvu.panel.modeExtra') : t('mvu.panel.modeInline')}</small>
    {cardBits.length ? <small className="hint">{t('mvu.panel.card', { what: cardBits.join(' · ') })}</small> : null}
    {d ? <pre className="mvu-vars" style={{ maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.85em' }}>{short(formatVar(d, 'stat_data') || '{}')}</pre> : <p className="hint">{t('mvu.panel.empty')}</p>}
    <div className="row wrap">
      <Btn label={t('mvu.panel.redo')} ic="refresh" cls="ghost" title={t('mvu.panel.redoHint')} onClick={go(A.reprocessLast)} />
      <Btn label={t('mvu.panel.reload')} ic="book" cls="ghost" title={t('mvu.panel.reloadHint')} onClick={go(A.reloadInit)} />
      {E.mode === 'extra' ? <>
        <Btn label={t('mvu.panel.retry')} ic="refresh" cls="ghost" title={t('mvu.panel.retryHint')} onClick={go(A.retryExtra)} />
        <Btn label={t('mvu.panel.repair')} ic="sparkle" cls="ghost" title={t('mvu.panel.repairHint')} onClick={go(repair)} />
      </> : null}
    </div>
    {busy ? <small className="hint">{t('mvu.panel.working')}</small> : null}
  </div>;
}
