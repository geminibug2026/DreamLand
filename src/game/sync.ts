// 게임 일 → 이어 둔 상태 변수: 진행자의 답변 · 앱이 남긴 기록 · 시트에서 손으로 고친 값을 변수 갱신 틀(mvu/app)의 길로 보낸다.
// 무엇을 어떤 명령으로 바꾸는지와 겹침 규칙은 vars.ts 의 머리글에 있다. 이어 둔 칸이 없는 대화에서는 아무 일도 하지 않는다.
import type { Chat, Msg } from '../lib/types';
import { cur } from '../chat/store';
import { t } from '../i18n';
import * as A from '../mvu/app';
import { afterFx, gameOf, sheetOf, type Fx, type GameMsg, type GameSwipe } from './state';
import { commandsFor, linkOf, overlaps, type LinkKey, type VarCfg } from './vars';

const why = () => t('game.vars.why');
const cfgOf = (chat: Chat | null | undefined): VarCfg | null => { const v = gameOf(chat)?.vars; return v?.links.length ? v : null; };
/** 답변(지금 고른 후보)이 시트에 주는 변화: 한 번에 끝난 판정의 것 → 표시의 것 (sheetOf 와 같은 차례) */
const replyFx = (m: Msg): Fx[] => { const sw = m.swipes[m.sw] as GameSwipe | undefined; return [...(sw?.grolls || []).flatMap(r => r.fx || []), ...(sw?.gfx || [])]; };
/** 기록 메시지의 변화 (전투 · 판정 · 미니게임) */
const recFx = (m: Msg): Fx[] => { const r = (m as GameMsg).gm; return r && 'fx' in r && r.fx ? r.fx : []; };

/** 변수 갱신 틀에 건다: 진행자의 답변을 계산할 때 그 답변의 게임 표시를 명령으로 (답변 자신의 명령이 건드린 칸은 빼고 — 겹침 규칙) */
export function hook() {
  A.gameLink.has = (chat, msg) => !!cfgOf(chat) && msg.role === 'assistant' && replyFx(msg).length > 0;
  A.gameLink.reply = (chat, msgs, i, stat, touched) => {
    const g = gameOf(chat), cfg = cfgOf(chat), m = msgs[i]; if (!g || !cfg || !m) return '';
    const fx = replyFx(m); if (!fx.length) return '';
    const before = sheetOf(g, msgs.slice(0, i)), after = afterFx(before, fx), mine = touched();
    return commandsFor(cfg, before, after, stat, { skip: segs => mine.some(p => overlaps(p, segs)), why: why() });
  };
}
/** 앱이 남긴 기록(전투 · 판정 · 미니게임)의 변화를 그 기록 메시지의 변수로 적는다 (언제나 앞 상태에서 — 운명 점으로 바뀌어 다시 불러도 겹치지 않는다).
 *  이어 둔 칸이 있으면 바뀐 것이 없어도 앞 상태를 적어 둔다 (변수가 빈 메시지를 대화를 열 때 글로만 다시 계산해 게임이 적은 값을 잃지 않게) */
export function syncRecord(chat: Chat, m: Msg): Promise<boolean> {
  const g = gameOf(chat), cfg = cfgOf(chat); if (!g || !cfg || cur.chat !== chat || !A.hasData(chat)) return Promise.resolve(false);
  return A.applyTo(chat, m, stat => {
    const fx = recFx(m), i = cur.msgs.indexOf(m); if (!fx.length || i < 0) return '';
    const before = sheetOf(g, cur.msgs.slice(0, i));
    return commandsFor(cfg, before, afterFx(before, fx), stat, { why: why() });
  });
}
const KEY_OF: Partial<Record<Fx['k'], LinkKey>> = { hp: 'hp', hpmax: 'hpMax', gold: 'gold', xp: 'xp', item: 'items', place: 'place', time: 'time', weather: 'weather', party: 'party' };
/** 시트에서 손으로 고친 값: 이어 둔 칸이면 마지막 메시지의 변수에 적고 true (시트의 손 고침 목록에는 넣지 않는다), 아니면 false */
export function adjustVar(chat: Chat, fx: Fx): boolean {
  const g = gameOf(chat), cfg = cfgOf(chat), key = KEY_OF[fx.k], last = cur.msgs[cur.msgs.length - 1];
  if (!g || !cfg || !key || !linkOf(cfg, key) || !last || cur.chat !== chat || !A.hasData(chat)) return false;
  void A.applyTo(chat, last, stat => { const before = sheetOf(g, cur.msgs); return commandsFor({ links: cfg.links.filter(l => l.key === key) }, before, afterFx(before, [fx]), stat, { why: why() }); }, true);
  return true;
}
/** 운명 점으로 답변의 갈래가 바뀌었다: 그 답변의 변수를 앞 상태에서 다시 계산한다 */
export function recalcReply(chat: Chat, m: Msg) { if (cfgOf(chat)) void A.recalc(chat, m); }
