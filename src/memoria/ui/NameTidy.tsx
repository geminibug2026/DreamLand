// 장기기억 — 이름 정리: 한 사람이 여러 이름으로 흩어진 것을 찾아 합치고, 잘못 합친 것은 다시 뗀다
// 권하기만 한다 — 저절로 합치지 않는다. 합치기 · 떼기 앞에는 복구 지점을 남긴다 (도구 탭에서 되돌릴 수 있다)
import { Btn } from '../../kit';
import { confirmBox, toast } from '../../ui';
import type { CastCard } from '../types';
import { crossScriptSame } from '../craft';
import { nameKey, nameSuggestions, pairKey, planMerge, strayPeople, type NameSuggestion } from '../people';
import { Ico, None, chatTitle, confirmList, editBox, type StOpen } from './parts';
import { Memory } from '../../lib/memory';
import * as core from '../../lib/core';
import { t } from '../../i18n';

const AKA_MAX = 8;   // 엔진이 카드를 합칠 때 남기는 다른 이름의 수와 같다
interface TidyState { sel: Set<string>; rep: string }
const tidyState = (st: StOpen): TidyState => (st.tidy ||= { sel: new Set<string>(), rep: '' }) as TidyState;

/** 되돌릴 수 없는 일 앞에서 복구 지점을 만든다. 서고가 너무 커서 못 만들면 파일 백업을 먼저 받게 한다 (취소하면 하지 않는다) */
export async function guardPoint(st: StOpen, label: string): Promise<boolean> {
  const M = Memory;
  if (await M.checkpoint(st.mem, label).catch(() => null)) return true;
  if (!(await confirmBox(t('memoria.tools.cp.tooBig'), t('memoria.tools.cp.backupGo')))) return false;
  core.download(`memoria-${chatTitle(st.chat).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}.json`, JSON.stringify(M.exportData(st.chat, st.mem), null, 2)); return true;
}

/** 고른 이름들을 대표 이름 하나로 합친다 — 카드는 엔진의 합치기로 접고, 카드 없는 이름은 다른 이름으로 단 뒤 기록을 접는다 */
async function mergeNames(st: StOpen, names: string[], rep: string) {
  const mem = st.mem, M = Memory, T = mem.turns.length;
  if (M.busy()) return toast(t('memoria.tidy.busy'), 'err');
  const plan = planMerge(mem, names, rep), others = [...plan.cards.map(c => c.name), ...plan.aliases];
  if (!others.length && !plan.rename) return toast(t('memoria.tidy.nothing'));
  if (!(await confirmList(t('memoria.tidy.mergeAsk', { name: rep }), [t('memoria.tidy.mergeLine1', { names: [...new Set([...(plan.keep && plan.rename ? [plan.keep.name] : []), ...others])].join(', '), name: rep }), t('memoria.tidy.mergeLine2'), t('memoria.tidy.mergeLine3')], t('memoria.tidy.mergeOk')))) return;
  if (!(await guardPoint(st, t('memoria.tidy.cpMerge')))) return;
  let keep = plan.keep;
  if (!keep) { keep = { id: core.uid(), name: rep, provisional: true, manual: true, first: T, updated: T }; mem.cast.push(keep); }
  else if (plan.rename) { const old = keep.name; keep.name = rep; keep.aka = [old, ...(keep.aka || [])].filter(a => nameKey(a) !== nameKey(rep)); keep.manual = true; }
  for (const c of plan.cards) M.mergeCast(mem, keep, c);
  const aka = [...(keep.aka || [])], left: string[] = [];
  for (const a of plan.aliases) { if (aka.some(x => nameKey(x) === nameKey(a)) || nameKey(a) === nameKey(keep.name)) continue; if (aka.length < AKA_MAX) aka.push(a); else left.push(a); }
  keep.aka = aka;
  const folded = M.foldAliases(mem); await M.save(mem); M.reinjectNow?.(st.chat);
  const v = tidyState(st); v.sel.clear(); v.rep = ''; st.draw();
  toast(t('memoria.tidy.merged', { name: keep.name, states: folded.states, memories: folded.memories }) + (left.length ? t('memoria.tidy.akaFull', { names: left.join(', ') }) : ''), left.length ? '' : 'ok');
}
/** 권유 한 건을 합친다 — 어느 이름을 대표로 둘지 묻는다 (카드가 있는 쪽이 먼저) */
async function mergePair(st: StOpen, s: NameSuggestion) {
  const first = s.bCard && !s.aCard ? s.b : s.a, d = await editBox(t('memoria.tidy.pairTitle'), { rep: first }, [{ k: 'rep', label: t('memoria.tidy.rep'), type: 'select', opts: [[s.a, s.a], [s.b, s.b]], hint: t('memoria.tidy.repHint') }], { okLabel: t('memoria.tidy.mergeOk') });
  if (d) await mergeNames(st, [s.a, s.b], d.rep);
}
/** 다른 이름 하나를 카드에서 떼어 따로 선 인물로 만든다. 이미 한 이름으로 접힌 기록은 가를 수 없다 — 앞으로의 기록부터 따로 쌓인다 */
async function splitAka(st: StOpen, card: CastCard, aka: string) {
  const mem = st.mem, M = Memory, T = mem.turns.length;
  if (M.busy()) return toast(t('memoria.tidy.busy'), 'err');
  if (!(await confirmList(t('memoria.tidy.splitAsk', { aka, name: card.name }), [t('memoria.tidy.splitLine1', { aka }), t('memoria.tidy.splitLine2', { name: card.name }), t('memoria.tidy.mergeLine3')], t('memoria.tidy.splitOk')))) return;
  if (!(await guardPoint(st, t('memoria.tidy.cpSplit')))) return;
  card.aka = (card.aka || []).filter(a => a !== aka); card.manual = true;
  if (!mem.cast.some(c => nameKey(c.name) === nameKey(aka))) mem.cast.push({ id: core.uid(), name: aka, provisional: true, manual: true, first: T, updated: T });
  mem.nameApart = [...new Set([...(mem.nameApart || []), pairKey(card.name, aka)])].slice(-200);   // 방금 뗀 짝을 곧바로 다시 권하지 않는다
  await M.save(mem); M.reinjectNow?.(st.chat); st.draw(); toast(t('memoria.tidy.splitDone', { aka }), 'ok');
}

const WHY: Record<NameSuggestion['why'], string> = { aka: 'memoria.tidy.why.aka', sound: 'memoria.tidy.why.sound', part: 'memoria.tidy.why.part' };

export function NameTidy({ st, back }: { st: StOpen; back: () => void }) {
  const mem = st.mem, M = Memory, v = tidyState(st), hints = nameSuggestions(mem, crossScriptSame);
  const apart = async (s: NameSuggestion) => { mem.nameApart = [...new Set([...(mem.nameApart || []), s.key])].slice(-200); await M.save(mem); st.draw(); };
  const forget = async () => { delete mem.nameApart; await M.save(mem); st.draw(); };
  // 고를 수 있는 이름: 카드, 그리고 카드 없이 사람 자리에 적힌 이름
  const ids = [...mem.cast.map(c => ({ name: c.name, sub: (c.aka || []).join(', '), card: true })), ...strayPeople(mem).map(n => ({ name: n, sub: t('memoria.people.noCard'), card: false }))];
  for (const k of [...v.sel]) if (!ids.some(x => x.name === k)) v.sel.delete(k);
  const picked = ids.filter(x => v.sel.has(x.name)), rep = picked.some(x => x.name === v.rep) ? v.rep : (picked.find(x => x.card) || picked[0])?.name || '';
  const toggle = (name: string, on: boolean) => { if (on) v.sel.add(name); else v.sel.delete(name); st.draw(); };
  const withAka = mem.cast.filter(c => (c.aka || []).length);
  return <div className="mm-view mm-nt">
    <button type="button" className="mm-pp-back show" onClick={back}><Ico name="left" size={15} /><span>{t('memoria.people.back')}</span></button>
    <header className="mm-pp-listhead"><div><h3>{t('memoria.tidy.title')}</h3><p>{t('memoria.tidy.desc')}</p></div></header>

    <section className="mm-pp-sec"><header className="mm-pp-h"><div className="fx-head"><h4>{t('memoria.tidy.hintsTitle')}</h4>{hints.length ? <b className="fx-num">{hints.length}</b> : null}</div></header>
      <div className="fx-rows">{hints.map(s => <div key={s.key} className="mm-nt-hint">
        <p><b>{s.a}</b><i className="mm-nt-eq" aria-hidden="true">≈</i><b>{s.b}</b><small>{t(WHY[s.why])}</small></p>
        <span className="mm-nt-acts"><Btn label={t('memoria.tidy.merge')} ic="merge" cls="ghost" onClick={() => void mergePair(st, s)} /><Btn label={t('memoria.tidy.apart')} cls="ghost" title={t('memoria.tidy.apartTitle')} onClick={() => void apart(s)} /></span></div>)}</div>
      {!hints.length ? <p className="mm-pp-blank">{t('memoria.tidy.hintsEmpty')}</p> : null}
      {(mem.nameApart || []).length ? <p className="mm-pp-hint">{t('memoria.tidy.apartCount', { n: mem.nameApart!.length })} <button type="button" className="mm-nt-link" onClick={() => void forget()}>{t('memoria.tidy.apartReset')}</button></p> : null}
    </section>

    <section className="mm-pp-sec"><header className="mm-pp-h"><div className="fx-head"><h4>{t('memoria.tidy.pickTitle')}</h4>{picked.length ? <b className="fx-num">{picked.length}</b> : null}</div></header>
      <p className="mm-pp-hint">{t('memoria.tidy.pickHint')}</p>
      <div className="mm-nt-picks fx-rows">{ids.map(x => <label key={x.name} className={`check mm-nt-pick${v.sel.has(x.name) ? ' on' : ''}`}><input type="checkbox" checked={v.sel.has(x.name)} onChange={e => toggle(x.name, e.target.checked)} /><i /><span><b>{x.name}</b>{x.sub ? <small>{x.sub}</small> : null}</span></label>)}</div>
      {!ids.length ? <None text={t('memoria.people.empty')} /> : null}
      {picked.length >= 2 ? <div className="mm-nt-go"><label><span className="fx-lbl kr">{t('memoria.tidy.rep')}</span><select className="inp" value={rep} onChange={e => { v.rep = e.target.value; st.draw(); }}>{picked.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
        <Btn label={t('memoria.tidy.mergeN', { n: picked.length })} ic="merge" cls="primary" onClick={() => void mergeNames(st, picked.map(x => x.name), rep)} /></div> : null}
    </section>

    <section className="mm-pp-sec"><header className="mm-pp-h"><div className="fx-head"><h4>{t('memoria.tidy.splitTitle')}</h4></div></header>
      <p className="mm-pp-hint">{t('memoria.tidy.splitHint')}</p>
      <div className="fx-rows">{withAka.map(c => <div key={c.id} className="mm-nt-card"><b>{c.name}</b><span className="mm-nt-akas">{c.aka!.map(a => <button key={a} type="button" className="mm-nt-aka" title={t('memoria.tidy.splitBtn', { aka: a })} onClick={() => void splitAka(st, c, a)}><span>{a}</span><Ico name="x" size={12} /></button>)}</span></div>)}</div>
      {!withAka.length ? <p className="mm-pp-blank">{t('memoria.tidy.splitEmpty')}</p> : null}
    </section>
  </div>;
}
