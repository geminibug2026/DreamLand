// 책상 위젯들이 같이 쓰는 작은 부품: 초상 · 한 줄 · 빈 자리 · 대화의 그 메시지로 가기
import type { ReactNode } from 'react';
import { Emblem, artStyle } from '../kit';
import type { Char } from '../lib/types';
import { go } from '../lib/router';
import { chatApi, jumpTo } from '../chat/actions';

/** 초상: 그림이 없으면 밤하늘 바탕에 문양 */
export const Port = ({ c, cls = '' }: { c?: Char | null; cls?: string }) => <i className={'dk-port ' + cls} style={artStyle(c)}>{c && !c.avatar ? <Emblem o={c} mini /> : null}</i>;
/** 목록의 한 줄: 표식 · 글 두 줄 · 오른쪽의 모노 메타 */
export const Row = ({ mark, main, sub, meta, onClick, label }: { mark?: ReactNode; main: ReactNode; sub?: ReactNode; meta?: ReactNode; onClick: () => void; label?: string }) =>
  <li><button className="dk-row fx-tap" onClick={onClick} aria-label={label}>{mark ? <span className="dk-mk">{mark}</span> : null}<span className="dk-rt"><b>{main}</b>{sub ? <small>{sub}</small> : null}</span>{meta ? <span className="dk-meta fx-num">{meta}</span> : null}</button></li>;
/** 빈 자리: 작은 그림과 한 줄 */
export const None = ({ art, text }: { art: ReactNode; text: string }) => <div className="dk-none">{art}<p>{text}</p></div>;
/** 구획 이름표 */
export const Lbl = ({ children }: { children: ReactNode }) => <div className="dk-lbl fx-lbl kr fx-head">{children}</div>;

/** 그 대화를 열고, 메시지가 그려지면 그 메시지로 간다 */
export function openAt(chatId: string, msgId: string) {
  go('chat', chatId); let tries = 0;
  const seek = () => { const cur = chatApi.current(), m = cur.chat?.id === chatId ? cur.msgs.find(x => x.id === msgId) : null; if (m) jumpTo(m); else if (tries++ < 12) setTimeout(seek, 200); };
  setTimeout(seek, 300);
}
