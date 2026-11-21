// 변수 갱신 틀(MVU) 연결: 대화 이벤트 · 생성 전후 · 프롬프트 · 로어북 · 매크로 · 화면(iframe) 이벤트를 src/mvu/app 에 잇는다.
// 이 틀을 쓰지 않는 대화에서는 아무 일도 하지 않는다 (추가 호출도 없다).
import type { FeatureDef } from '../main';
import type { Chat, Msg } from '../lib/types';
import { S, on } from '../lib/core';
import { X } from '../lib/hooks';
import { reactNode } from '../addons/parts';
import { cur } from '../chat/store';
import { appCalls, appEvents } from '../chat/frameEvents';
import { t } from '../i18n';
import { formatVar, runtime, type Obj } from '../mvu/engine';
import { get, isPlainObject } from '../mvu/lo';
import * as A from '../mvu/app';
import { MvuPanel } from '../mvu/Ui';

type R = Awaited<ReturnType<typeof runtime>>;
let R0: R | null = null;   // 매크로는 그 자리에서 풀어야 하므로, 한 번 불러온 무거운 부분을 쥐고 있는다
const load = async () => (R0 ||= await runtime());

// ── {{get_message_variable::경로}} · {{format_message_variable::경로}} (_quoted · chat · global · character · preset) ──
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_m, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[k] as string));
/** '$' 로 시작하는 칸($meta 등)은 빼고 보인다 */
const no$ = (v: unknown): unknown => Array.isArray(v) ? v.map(no$) : isPlainObject(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('$')).map(([k, x]) => [k, no$(x)])) : v;
function varsOf(type: string, chat: Chat | null | undefined): unknown {
  if (type === 'message') return A.latestData(chat) || {};
  if (type === 'chat') return chat?.vars || {};
  if (type === 'global') return S.settings.globalVars || {};
  return {};
}
const valueAt = (type: string, path: string, chat: Chat | null | undefined) => no$(get(varsOf(type, chat), unescape(path), null));
const yamlOf = (v: unknown, quoted: boolean) => {
  if (!R0) return formatVar(v, '') || 'null';
  return R0.lo.isString(v) ? v : (quoted ? R0.yamlStringifyQuoted(v) : R0.yamlStringify(v)).trimEnd();
};
const GET = /\{\{get_(message|chat|character|preset|global)_variable::(.*?)\}\}/gi;
const FMT = /\{\{format_(message|chat|character|preset|global)_variable(_quoted)?::(.*?)\}\}/i;
function macroLike(text: string, c: { chat?: unknown }): string {
  if (text.indexOf('_variable') < 0) return text;
  const chat = c.chat as Chat | undefined;
  let out = text.replace(GET, (_m, type: string, path: string) => { const v = valueAt(type, path, chat); return typeof v === 'string' ? v : JSON.stringify(v) ?? 'null'; });
  if (!FMT.test(out)) return out;
  // 여러 줄 값은 그 줄에서 앞선 글자 수만큼 들여 써 맞춘다 (실리태번 도우미와 같다)
  out = out.split('\n').map(line => {
    let guard = 0;
    for (let m = FMT.exec(line); m && guard++ < 50; m = FMT.exec(line)) {
      const prefix = line.slice(0, m.index), v = valueAt(m[1], m[3], chat);
      const body = yamlOf(v, !!m[2]).replaceAll('\n', '\n' + ' '.repeat(prefix.length));
      line = prefix + body + line.slice(m.index + m[0].length);
    }
    return line;
  }).join('\n');
  return out;
}

function setup() {
  const idx = (d: unknown) => { const m = (d as { msg?: Msg })?.msg; return m ? cur.msgs.indexOf(m) : cur.msgs.length - 1; };
  const chatOf = (d: unknown) => ((d as { chat?: Chat })?.chat || cur.chat) as Chat | null;
  const warm = (c: Chat | null) => { if (c && A.usesMvu(c)) void load(); };
  on('chat:open', c => { warm(c as Chat); setTimeout(() => void A.check(c as Chat), 0); });
  on('message:sent', d => { const c = chatOf(d), i = idx(d); warm(c); void A.sync(c, i, { fresh: i, draw: false }); });
  on('message:edited', d => { void A.sync(chatOf(d), idx(d)); });
  on('message:swiped', d => { void A.sync(chatOf(d), idx(d)); });
  let trashAt = Infinity;
  on('message:trashed', d => { const at = Number((d as { at?: number })?.at); if (Number.isFinite(at)) trashAt = Math.min(trashAt, at); });
  on('message:deleted', d => { const at = trashAt; trashAt = Infinity; void A.sync(chatOf(d), Number.isFinite(at) ? at : 0); });

  // 답을 받아 저장하기 전: (추가 호출 방식이면 한 번 더 물어) 변수를 계산한다
  X.received.push({ owner: 'mvu', fn: ({ chat, msgs, msg }) => A.onReceived(chat, msgs as never, msg as never) });
  // 생성 전: 앞의 변수 갱신이 끝나기를 기다리고, 나중에 붙은 로어북의 초기 변수를 합친다
  X.before.push({ owner: 'mvu', fn: async ({ chat }) => { if (!A.usesMvu(chat)) return; await load(); await A.pending(chat); await A.check(chat); } });
  // 로어북: 추가 호출 방식에서 [mvu_update] 항목은 본 답변에 싣지 않는다
  X.loreFilter = (books, { chat }) => A.usesMvu(chat) && A.eff(chat).mode === 'extra' ? A.filterBooks(books, chat, false) : books;
  // EJS 의 getvar('stat_data') 가 마지막 메시지 변수를 읽게 한다
  X.varsOf = chat => A.latestData(chat);
  X.macroLike.push(macroLike);
  // 보내는 프롬프트에서 상태창 자리 표시 · (추가 호출 방식이면) 옛 갱신 블록을 뺀다
  on('prompt:ready', d => {
    const { messages, chat } = d as { messages: { content: unknown }[]; chat: Chat };
    if (!chat || !A.usesMvu(chat)) return;
    const extra = A.eff(chat).mode === 'extra';
    for (const m of messages || []) {
      if (typeof m.content !== 'string') continue;
      let s = m.content;
      if (extra && s.includes('<UpdateVariable>')) s = s.replace(/\n<(update(?:variable)?|variableupdate)>(?:(?!<\1>).)*<\/\1?>/gis, '');
      if (s.includes(A.HOLDER)) s = s.replaceAll('\n' + A.HOLDER, '');
      m.content = s;
    }
  });

  // 화면(카드 스크립트 · 상태창)이 부르는 일
  appCalls.mvuParse = async (_f, args) => { const R = await load(), chat = cur.chat, old = args[1] as Obj; if (!chat || !old || typeof old !== 'object') return old; return await R.parseMessage(String(args[0] ?? ''), old as never, A.hostFor(chat)); };
  appCalls.mvuReloadInit = async (_f, args) => { const R = await load(), chat = cur.chat, d = (args[0] || {}) as never; if (!chat) return { updated: false, data: d }; const updated = R.loadInitVarData(d, A.initBooks(chat), A.mxOf(chat)); return { updated, data: d }; };
  appEvents.mag_invoke_mvu = async args => {   // eventEmit('mag_invoke_mvu', 글, { old_variables }) → new_variables 를 채운다
    const info = args[1] as { old_variables?: Obj; new_variables?: Obj } | undefined, chat = cur.chat; if (!info?.old_variables || !chat) return;
    const R = await load(), nv = R.lo.clone(info.old_variables) as never; await R.updateVariables(String(args[0] ?? ''), nv, undefined, A.hostFor(chat)); info.new_variables = nv;
  };
  appEvents.mag_update_variable = async args => { const chat = cur.chat; if (!chat || !args[0] || typeof args[0] !== 'object') return; const R = await load(); await R.updateVariable(args[0] as Obj, String(args[1] ?? ''), args[2], String(args[3] ?? ''), !!args[4], A.hostFor(chat)); };

  X.panels.push({ owner: 'mvu', id: 'mvu', get title() { return t('mvu.panel.title'); }, icon: 'code', render: (chat, msgs) => reactNode('mvu-panel', 'div.mvu-panel-root', <MvuPanel chat={chat} msgs={msgs} />) });
}

export const feature: FeatureDef = { name: 'mvu', setup };
