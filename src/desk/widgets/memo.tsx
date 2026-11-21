// 한 줄 쪽지: 내가 적어 두는 메모지. 여러 장을 넘겨 가며 쓴다 (모델에는 보내지 않는다)
import { useState } from 'react';
import { IconBtn } from '../../kit';
import { confirmBox } from '../../ui';
import { t } from '../../i18n';
import { p2 } from '../data';
import { addNote, cfg, dropNote, saveNotes } from '../registry';

let page = 0;   // 홈을 떠났다 와도 보던 장을 기억한다
export function Memo() {
  const [, bump] = useState(0), notes = cfg().notes, at = Math.min(page, Math.max(0, notes.length - 1)), n = notes[at], turn = (i: number) => { page = i; bump(x => x + 1); };
  return <div className="dk-memo">
    <div className="dk-paper">{n
      ? <textarea key={n.id} defaultValue={n.text} placeholder={t('desk.memo.ph')} aria-label={t('desk.memo.label', { n: at + 1 })} maxLength={600} onChange={e => { n.text = e.target.value; saveNotes(); }} />
      : <button className="dk-paper-new" onClick={() => { addNote(); turn(0); }}>{t('desk.memo.first')}</button>}</div>
    <div className="dk-memo-f">
      <IconBtn ic="left" cls="dk-ib" title={t('desk.memo.prev')} onClick={() => turn(Math.max(0, at - 1))} />
      <span className="fx-num">{p2(notes.length ? at + 1 : 0)}<i>/</i>{p2(notes.length)}</span>
      <IconBtn ic="right" cls="dk-ib" title={t('desk.memo.next')} onClick={() => turn(Math.min(notes.length - 1, at + 1))} />
      <span className="dk-sp" />
      {n ? <IconBtn ic="trash" cls="dk-ib" title={t('desk.memo.drop')} onClick={async () => { if (n.text.trim() && !(await confirmBox(t('desk.memo.dropAsk'), t('common.delete'), true))) return; dropNote(n.id); turn(Math.max(0, at - 1)); }} /> : null}
      <IconBtn ic="plus" cls="dk-ib" title={t('desk.memo.add')} onClick={() => { addNote(); turn(cfg().notes.length - 1); }} />
    </div>
  </div>;
}
