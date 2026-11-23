// 장기기억 — 도구 탭의 「골라서 지우기」: 초기화는 전부 아니면 전무라, 선반을 종류별로 골라 비울 수 있게 한다
// 지우기 직전의 서고는 복구 지점에 남는다. 턴 기록은 건드리지 않는다 — 지운 것이 저절로 다시 적히지는 않는다
import { useState } from 'react';
import { Btn } from '../../kit';
import { toast } from '../../ui';
import { WIPE_KINDS, wipeCounts, wipeShelves, type WipeKind } from '../wipe';
import { guardPoint } from './NameTidy';
import { Sec, confirmList, persistMsgs, type StOpen } from './parts';
import { Memory } from '../../lib/memory';
import { t, fmtNum } from '../../i18n';

export function WipeSec({ st }: { st: StOpen }) {
  const { chat, mem, msgs } = st, M = Memory, counts = wipeCounts(mem);
  const [sel, setSel] = useState<Set<WipeKind>>(() => new Set()), [keepHidden, setKeepHidden] = useState(true);
  const hidden = msgs.filter(m => m.memHidden).length, picked = WIPE_KINDS.filter(k => sel.has(k) && counts[k]), total = picked.reduce((n, k) => n + counts[k], 0);
  const flip = (k: WipeKind, on: boolean) => setSel(s => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; });
  const run = async () => {
    if (M.busy()) return toast(t('memoria.tools.reset.busy'), 'err');
    if (!picked.length) return toast(t('memoria.wipe.none'));
    const unhide = !keepHidden && hidden > 0;
    if (!(await confirmList(t('memoria.wipe.ask', { n: fmtNum(total) }), [picked.map(k => `${t('memoria.wipe.kind.' + k)} ${fmtNum(counts[k])}`).join(' · '), unhide ? t('memoria.wipe.lineUnhide', { n: hidden }) : t('memoria.wipe.lineKeep'), t('memoria.tools.reset.line3')], t('memoria.wipe.ok'), true))) return;
    if (!(await guardPoint(st, t('memoria.wipe.cp')))) return;
    const n = wipeShelves(mem, picked); await M.save(mem);
    if (unhide) { for (const x of msgs) if (x.memHidden) { x.hidden = false; delete x.memHidden; } await persistMsgs(chat, msgs); }
    M.override(chat.id, null); st.draft = null; M.reinjectNow?.(chat);
    toast(t('memoria.wipe.done', { n: fmtNum(n) }), 'ok'); st.draw();
  };
  return <Sec title={t('memoria.wipe.title')} desc={t('memoria.wipe.desc')}>
    <div className="mm-wipe">{WIPE_KINDS.map(k => <label key={k} className={`check mm-wipe-k${counts[k] ? '' : ' none'}`}><input type="checkbox" disabled={!counts[k]} checked={sel.has(k) && !!counts[k]} onChange={e => flip(k, e.target.checked)} /><i /><span>{t('memoria.wipe.kind.' + k)}</span><b className="fx-num">{fmtNum(counts[k])}</b></label>)}</div>
    <label className="check mm-wipe-hid" title={t('memoria.wipe.keepHiddenTitle')}><input type="checkbox" checked={keepHidden} onChange={e => setKeepHidden(e.target.checked)} /><i /><span>{t('memoria.wipe.keepHidden')}{hidden ? <small>{t('memoria.wipe.hiddenN', { n: hidden })}</small> : null}</span></label>
    <div className="row wrap"><Btn label={total ? t('memoria.wipe.btnN', { n: fmtNum(total) }) : t('memoria.wipe.btn')} ic="trash" cls="danger" onClick={() => void run()} /><span className="mm-progress">{t('memoria.wipe.note')}</span></div>
  </Sec>;
}
