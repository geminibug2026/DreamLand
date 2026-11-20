// 막후의 검토: 낱말 단위 비교 보기 · 제안 카드(수락 / 거절) · 받아들인 이력과 되돌리기 · 교정자가 고친 답장의 원문 보기
import { useMemo } from 'react';
import type { Msg } from '../lib/types';
import { S } from '../lib/core';
import { Btn, useEvents } from '../kit';
import { openModal } from '../addons/parts';
import { roomName } from '../chat/actions';
import { t } from '../i18n';
import type { Applied, CrewChat, CrewSwipe, Proposal } from './types';
import { accept, bookOf, isStale, reject, revertFix, sidesOf, undo } from './logic';
import { countChanges, diffWords } from './text';
import { EmptyTray } from './Art';

/** 두 글의 차이: 지운 말은 줄을 긋고 옅게, 넣은 말은 밑줄과 포인트 색. 색만으로 가르지 않는다 */
export function Diff({ a, b }: { a: string; b: string }) {
  const parts = useMemo(() => diffWords(a, b), [a, b]);
  return <p className="cr-diff">{parts.map((p, i) => p.op === 'same' ? <span key={i}>{p.text}</span> : p.op === 'ins' ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>)}</p>;
}
const pad = (n: number) => String(n).padStart(2, '0');
const fieldName = (f?: string) => f === 'personality' ? t('crew.review.f.personality') : f === 'scenario' ? t('crew.review.f.scenario') : t('crew.review.f.description');

function Card({ chat, p }: { chat: CrewChat; p: Proposal }) {
  const stale = isStale(chat, p), s = sidesOf(chat, p), ch = S.get('chars', p.charId || ''), isNew = p.kind === 'lore' && !s.before;
  return <article className={'cr-pcard fx-frame' + (stale ? ' stale' : '')}>
    <header className="cr-pcard-head">
      <span className="fx-lbl kr ink">{p.kind === 'card' ? t('crew.review.card', { name: ch?.name || '?', field: fieldName(p.field) }) : isNew ? t('crew.review.loreAdd') : t('crew.review.loreUpdate')}</span>
      <span className="fx-lbl fx-num">T{pad(p.turn)}</span>
      {stale && <span className="fx-pill">{t('crew.review.staleTag')}</span>}
    </header>
    {p.kind === 'lore' && <h4 className="cr-pcard-name">{p.name}{p.keys?.length ? <small className="fx-num">{p.keys.join(' · ')}</small> : null}</h4>}
    {s.before ? <Diff a={s.before} b={s.after} /> : <p className="cr-diff new">{s.after}</p>}
    {p.kind === 'card' && !p.oldText && <small className="hint">{t('crew.review.append')}</small>}
    {p.reason && <p className="cr-why"><span className="fx-lbl kr">{t('crew.review.why')}</span>{p.reason}</p>}
    {stale && <small className="hint">{t('crew.review.stale')}</small>}
    <footer className="row end">
      <Btn label={t('crew.review.reject')} cls="ghost" onClick={() => void reject(chat, p)} />
      {!stale && <Btn label={t('crew.review.accept')} ic="check" cls="primary" onClick={() => void accept(chat, p)} />}
    </footer>
  </article>;
}
function Done({ chat, a }: { chat: CrewChat; a: Applied }) {
  const ch = S.get('chars', a.charId || '');
  return <div className={'cr-done' + (a.undone ? ' undone' : '')}>
    <span className="fx-lbl fx-num">{new Date(a.at).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })}</span>
    <span className="cr-done-what">{a.kind === 'card' ? `${ch?.name || '?'} · ${fieldName(a.field)}` : a.name}<small>{(a.kind === 'card' ? a.newText : a.content || '')!.slice(0, 90)}</small></span>
    {a.undone ? <span className="fx-lbl kr">{t('crew.review.undone')}</span> : <Btn label={t('crew.review.undo')} cls="ghost" ic="refresh" onClick={() => void undo(chat, a)} />}
  </div>;
}
/** 한 대화의 검토함: 기다리는 제안과 받아들인 이력 */
export function ReviewList({ chat, title = false }: { chat: CrewChat; title?: boolean }) {
  useEvents('crew:changed', 'chars', 'lore');
  const pend = chat.crew?.pending || [], done = chat.crew?.done || [], book = bookOf(chat);
  return <section className="cr-review">
    {title && <h3 className="fx-head cr-room"><span className="fx-serif">{roomName(chat)}</span></h3>}
    {pend.length ? pend.map((p, i) => <div className="fx-in" style={{ ['--d' as string]: `${i * 0.04}s` }} key={p.id}><Card chat={chat} p={p} /></div>)
      : <div className="fx-empty"><EmptyTray /><p>{t('crew.review.empty')}</p></div>}
    {book && <small className="hint">{t('crew.review.book', { name: book.name, n: book.entries.length })}</small>}
    {done.length > 0 && <details className="cr-hist"><summary className="fx-lbl kr">{t('crew.review.history', { n: done.length })}</summary><div className="fx-rows">{done.map((a, i) => <Done key={a.id + i} chat={chat} a={a} />)}</div></details>}
  </section>;
}
export const openReview = (chat: CrewChat) => { openModal({ title: t('crew.review.title'), wide: true, spec: 'div.cr-modal' }, () => <ReviewList chat={chat} />); };

/** 교정자가 고친 답장: 원문과 나란히 견주고, 원문으로 되돌릴 수 있다 */
export function openFix(m: Msg) {
  const s = m.swipes[m.sw] as CrewSwipe; if (s.crewOrig == null) return;
  const n = countChanges(diffWords(s.crewOrig, s.text));
  const box = openModal({ title: t('crew.proof.title'), wide: true, spec: 'div.cr-modal', actions: [{ label: t('common.close') }, { label: t('crew.proof.revert'), ic: 'refresh', onclick: () => { void revertFix(m); } }] }, () => <section className="cr-review">
    <header className="cr-pcard-head"><span className="fx-lbl kr ink">{t('crew.proof.count', { n })}</span></header>
    {s.crewFix?.length ? <ul className="cr-fixes">{s.crewFix.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}
    <Diff a={s.crewOrig!} b={s.text} />
  </section>);
  return box;
}
