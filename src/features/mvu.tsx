// 변수 갱신 틀 연결: 답변의 갱신 명령을 읽어 메시지 변수(stat_data)에 반영하고, 프롬프트 · 정규식용 매크로를 등록한다.
// 초기 변수([InitVar] 로어북 항목이나 첫 인사의 <initvar>)가 있는 대화에서만 움직인다. 추가 호출은 없다.
import type { FeatureDef } from '../main';
import type { Chat, Msg } from '../lib/types';
import { S, msgText, on } from '../lib/core';
import { activeBooks } from '../lib/engine';
import { X } from '../lib/hooks';
import { cur } from '../chat/store';
import { chatApi } from '../chat/actions';
import { applyText, clone, formatVar, greetingInit, initFrom, isMvu, readVar, type MvuData, type Obj } from '../mvu/engine';

type MsgD = Msg & { thData?: Obj };
const HOLDER = '<StatusPlaceHolderImpl/>';
const charsOf = (chat: Chat) => chat.charIds.map(id => S.get('chars', id)).filter((c): c is NonNullable<typeof c> => !!c);

/** 이 대화의 초기 자료 (로어북의 [InitVar] 항목들) */
function initOf(chat: Chat): MvuData {
  try { return initFrom(activeBooks(chat, charsOf(chat), S.persona(chat)) as unknown as Parameters<typeof initFrom>[0]); } catch (e) { console.warn('[변수 갱신] 초기 변수', e); return initFrom([]); }
}
const hasData = (d: MvuData) => Object.keys(d.stat_data).length > 0;

/**
 * from 번째 메시지부터 끝까지 변수를 다시 계산한다: 각 메시지의 상태 = 바로 앞 상태 + 그 메시지에 적힌 명령.
 * 반환: 무엇이든 바뀌었는가 (메시지 변수나 본문)
 */
export function replay(chat: Chat, msgs: MsgD[], from = 0): boolean {
  if (!msgs.length) return false;
  const init = initOf(chat), first = msgs[0], greet = first.role !== 'user' ? greetingInit(msgText(first)) : null;
  if (greet) { init.stat_data = greet; }
  if (!hasData(init) && !msgs.some(m => isMvu(m.thData))) return false;     // 이 틀을 쓰지 않는 대화
  let changed = false, prev: MvuData = init;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (i < from) { if (isMvu(m.thData)) prev = m.thData as unknown as MvuData; continue; }
    const data = clone(prev), sw = m.swipes[m.sw], text = sw?.text || '';
    if (!(m.role === 'assistant' && text.length < 5)) applyText(text, data);
    const next: Obj = { ...(m.thData || {}), initialized_lorebooks: data.initialized_lorebooks, stat_data: data.stat_data, schema: data.schema };
    if (data.display_data) next.display_data = data.display_data; else delete next.display_data;
    if (data.delta_data) next.delta_data = data.delta_data; else delete next.delta_data;
    if (JSON.stringify(m.thData || null) !== JSON.stringify(next)) { m.thData = next; changed = true; }
    // 카드의 정규식이 이 자리를 상태창으로 바꾼다
    if (m.role === 'assistant' && sw && text.length >= 5 && !text.includes(HOLDER)) { sw.text = text.replace(/\s+$/, '') + '\n\n' + HOLDER; changed = true; }
    prev = data;
  }
  return changed;
}

/** 열려 있는 대화에 적용하고, 바뀌었으면 저장 · 다시 그리기 */
async function sync(chat: Chat | null | undefined, from = 0, draw = true) {
  if (!chat || cur.chat !== chat) return;
  const msgs = cur.msgs as MsgD[];
  if (!replay(chat, msgs, Math.max(0, from))) return;
  await chatApi.save();
  if (draw) chatApi.redraw?.();
}
const latest = (): Obj => { const ms = cur.msgs as MsgD[]; for (let i = ms.length - 1; i >= 0; i--) if (isMvu(ms[i].thData)) return ms[i].thData as Obj; return cur.chat ? initOf(cur.chat) as unknown as Obj : {}; };

function setup() {
  const idx = (d: unknown) => { const m = (d as { msg?: Msg })?.msg; return m ? cur.msgs.indexOf(m) : cur.msgs.length - 1; };
  const chatOf = (d: unknown) => (d as { chat?: Chat })?.chat || cur.chat;
  on('chat:open', c => { setTimeout(() => void sync(c as Chat, 0), 0); });
  on('message:sent', d => { void sync(chatOf(d), idx(d), false); });
  on('message:received', d => { const chat = chatOf(d); if (chat && cur.chat === chat && replay(chat, cur.msgs as MsgD[], Math.max(0, idx(d)))) setTimeout(() => chatApi.redraw?.(), 0); });   // 저장은 답변 저장과 함께 된다
  on('message:edited', d => { void sync(chatOf(d), idx(d)); });
  on('message:swiped', d => { void sync(chatOf(d), idx(d)); });
  on('message:deleted', d => { void sync(chatOf(d), 0); });

  // 프롬프트 · 정규식에서 쓰는 매크로: {{get_message_variable::stat_data.체력}} · {{format_message_variable::stat_data}}
  const reg = (name: string, fn: (path: string) => string) => X.macros.set(name, { owner: 'mvu', fn: (args: string[]) => fn(args.join('::').trim()) });
  reg('get_message_variable', p => readVar(latest(), p));
  reg('format_message_variable', p => formatVar(latest(), p));
  reg('get_chat_variable', p => readVar(cur.chat?.vars || {}, p));
  reg('format_chat_variable', p => formatVar(cur.chat?.vars || {}, p));
  reg('get_global_variable', p => readVar(S.settings.globalVars || {}, p));
  reg('format_global_variable', p => formatVar(S.settings.globalVars || {}, p));
}

export const feature: FeatureDef = { name: 'mvu', setup };
