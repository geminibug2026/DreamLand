// 기다리는 것들: 오늘 · 이번 주의 약속, 다가오는 기념일, 읽지 않은 메시지가 있는 방, 캐릭터의 지금 상태
import type { ReactNode } from 'react';
import { S, fmtTime } from '../../lib/core';
import type { Chat } from '../../lib/types';
import { dayKey, diffDays, promiseState } from '../../lib/f-keepsake';
import { daysTogether, firstMet, milestone } from '../../lib/together';
import { Live } from '../../lib/live';
import { STATUS } from '../../lib/f-schedule';
import { go } from '../../lib/router';
import { markLabel } from '../../features/together';
import { t } from '../../i18n';
import { Glyph } from '../art';
import { DAY, charsOf, p2, whoOf } from '../data';
import { None, Row } from '../parts';

const M = ({ children }: { children: ReactNode }) => <svg className="fx-art" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">{children}</svg>;
// 줄마다 붙는 표식: 약속(매듭) · 기념일(별) · 읽지 않음(봉투) · 지금(시계)
const MARK = {
  promise: <M><circle cx="6" cy="8" r="3.4" /><circle cx="10" cy="8" r="3.4" /></M>,
  anniv: <M><path d="M8 2v12M2 8h12" /><path className="t" d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></M>,
  unread: <M><path d="M2 4h12v8.5H2z" /><path className="t" d="M2 4l6 5 6-5" /></M>,
  now: <M><circle cx="8" cy="8" r="5.6" /><path d="M8 4.8V8l2.2 1.4" /></M>,
};
interface Item { k: keyof typeof MARK; id: string; main: string; sub: string; meta: string; rank: number; open: () => void }
const dMinus = (n: number) => n <= 0 ? t('desk.today') : 'D-' + p2(n);

export function waitingItems(now = Date.now()): Item[] {
  const today = dayKey(now), out: Item[] = [], open = (c: Chat) => () => go('chat', c.id), rooms = [...S.chats].filter(c => !c.temp).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const c of rooms) for (const p of c.promises || []) {
    const st = promiseState(p, today), n = diffDays(today, p.date); if ((st !== 'today' && st !== 'upcoming') || n > 7) continue;
    out.push({ k: 'promise', id: 'p' + c.id + p.id, main: p.what, sub: whoOf(c), meta: n ? dMinus(n) : p.time || t('desk.today'), rank: n ? 20 + n : 0, open: open(c) });
  }
  for (const c of rooms) if (c.unread) out.push({ k: 'unread', id: 'u' + c.id, main: whoOf(c) || t('home.deletedChar'), sub: t('desk.wait.unread', { n: c.unread }), meta: fmtTime(c.updatedAt), rank: 10, open: open(c) });
  for (const ch of S.chars) {   // 앞으로 두 주 안의 기념일 가운데 가장 가까운 것 하나
    if (!firstMet(ch.id)) continue;
    const n0 = daysTogether(ch.id, now);   // 하루 지나면 하루 는다: 날마다 다시 세지 않는다
    for (let d = 0; d <= 14; d++) { const at = now + d * DAY, mark = milestone(n0 + d, ch.id, at); if (!mark) continue;
      const room = rooms.find(c => c.charIds.includes(ch.id)); out.push({ k: 'anniv', id: 'a' + ch.id, main: ch.name, sub: markLabel(mark), meta: dMinus(d), rank: d ? 40 + d : 1, open: () => room && go('chat', room.id) }); break; }
  }
  // 지금 상태: 일정이 있거나 상태를 바꿔 둔 캐릭터만, 최근 방 순으로 셋까지
  const seen = new Set<string>(); let shown = 0;
  for (const c of rooms) for (const ch of charsOf(c)) {
    if (seen.has(ch.id) || shown >= 3) continue; seen.add(ch.id);
    let p; try { p = Live.presence(c, ch); } catch { continue; } if (!p.from) continue;
    shown++; out.push({ k: 'now', id: 'n' + ch.id, main: ch.name, sub: t('desk.wait.now', { what: p.activity || STATUS[p.status] || p.status }), meta: p.until ? '~' + new Date(p.until).toTimeString().slice(0, 5) : '', rank: 60 + shown, open: open(c) });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

export function Waiting() {
  const all = waitingItems(), rows = all.slice(0, 5);
  if (!rows.length) return <None art={<Glyph name="waiting" size={44} />} text={t('desk.wait.none')} />;
  return <><ul className="dk-rows fx-rows">{rows.map(r => <Row key={r.id} mark={MARK[r.k]} main={r.main} sub={r.sub} meta={r.meta} onClick={r.open} />)}</ul>
    {all.length > rows.length ? <p className="dk-more fx-num">+{p2(all.length - rows.length)}</p> : null}</>;
}
