// 매크로 사전의 등록부: 엔진이 아는 매크로를 한 줄씩 적어 둔다 (쓰는 꼴 · 예시 · 갈래). 설명 글은 i18n 의 gate.m.<id> 에 있다.
// 다른 기능이 X.macros 에 꽂은 매크로는 여기 없어도 사전 끝의 "기능이 더한 것"에 저절로 나온다.
import { X } from '../lib/hooks';

export interface MacroDoc { id: string; sig: string; ex?: string; group: string; /** 등록부(X.macros)의 이름들 — 저절로 나오는 목록에서 뺀다 */ names?: string[] }
export const GROUPS = ['who', 'chat', 'time', 'random', 'vars', 'flow', 'ask', 'lore', 'format'] as const;
const d = (group: string, id: string, sig: string, ex?: string, names?: string[]): MacroDoc => ({ id, sig, ex, group, names });
export const MACRO_DOCS: MacroDoc[] = [
  d('who', 'user', '{{user}}'), d('who', 'char', '{{char}}'), d('who', 'group', '{{group}}'), d('who', 'groupnotmuted', '{{groupNotMuted}}'),
  d('who', 'persona', '{{persona}}'), d('who', 'description', '{{description}}'), d('who', 'personality', '{{personality}}'), d('who', 'scenario', '{{scenario}}'), d('who', 'mesexamples', '{{mesExamples}}'), d('who', 'model', '{{model}}'),
  d('chat', 'input', '{{input}}'), d('chat', 'lastmessage', '{{lastMessage}}'), d('chat', 'lastusermessage', '{{lastUserMessage}}'), d('chat', 'lastcharmessage', '{{lastCharMessage}}'),
  d('chat', 'idle', '{{idle_duration}}', '[{{user}} has been away for {{idle_duration}}.]', ['idle_duration']), d('chat', 'lastgen', '{{lastGenerationType}}', '{{#if {{lastGenerationType}} == "continue"}}…{{/if}}', ['lastgenerationtype']), d('chat', 'chatid', '{{chatId}}', undefined, ['chatid']),
  d('time', 'time', '{{time}}'), d('time', 'date', '{{date}}'), d('time', 'weekday', '{{weekday}}'), d('time', 'isotime', '{{isotime}}'), d('time', 'isodate', '{{isodate}}'), d('time', 'datetime', '{{datetime}}', undefined, ['datetime']),
  d('random', 'random', '{{random::A::B::C}}', '{{random::sunny::rainy::foggy}}'), d('random', 'weighted', '{{random::A@3::B@1::C@0.5}}', 'The stranger is {{random::friendly@3::wary@1::hostile@0.5}}.'),
  d('random', 'pick', '{{pick::A::B::C}}', '{{pick::north@2::south}}'), d('random', 'roll', '{{roll::2d6+1}}'),
  d('vars', 'getvar', '{{getvar::name}}'), d('vars', 'setvar', '{{setvar::name::value}}'), d('vars', 'addvar', '{{addvar::name::value}}'), d('vars', 'incvar', '{{incvar::name}}'), d('vars', 'decvar', '{{decvar::name}}'),
  d('vars', 'hasvar', '{{hasvar::name}}'), d('vars', 'deletevar', '{{deletevar::name}}'), d('vars', 'getvarkey', '{{getvarkey::name::key}}', '{{getvarkey::bag::0}}'), d('vars', 'setvarkey', '{{setvarkey::name::key::value}}', '{{setvarkey::hero::hp::10}}'),
  d('vars', 'varshort', '{{.name}}  ·  {{.name = value}}  ·  {{.name += 1}}  ·  {{.name++}}', '{{.visits++}}{{#if {{.visits}} > 3}}They know each other well.{{/if}}'), d('vars', 'gvarshort', '{{$name}}  ·  {{$name ?? default}}'),
  d('vars', 'getglobalvar', '{{getglobalvar::name}}'), d('vars', 'setglobalvar', '{{setglobalvar::name::value}}'), d('vars', 'var', '{{var::name}}'), d('vars', 'pipe', '{{pipe}}'),
  d('flow', 'if', '{{#if cond}} … {{else if cond}} … {{else}} … {{/if}}', '{{#if mode == "talk"}}Keep it short.{{else}}Write a full scene.{{/if}}'), d('flow', 'unless', '{{#unless cond}} … {{/unless}}'),
  d('flow', 'each', '{{#each char}} … {{/each}}', '{{#each char}}\n- {{char}}: {{personality}}\n{{/each}}'), d('flow', 'comment', '{{// note}}'),
  d('ask', 'ask', '{{#if ask:"statement"}} … {{/if}}', '{{#if ask:"{{char}} and {{user}} are arguing"}}\nKeep the replies short and sharp.\n{{/if}}'),
  d('ask', 'asksticky', 'ask:"…" sticky:N', '{{#if ask:"a fight has started" sticky:3}}…{{/if}}'), d('ask', 'askcooldown', 'ask:"…" cooldown:N'), d('ask', 'askevery', 'ask:"…" every:N', '{{#if ask:"it is night" every:4}}…{{/if}}'),
  d('ask', 'askuntil', 'ask:"…" until:"…"', '{{#if ask:"they entered the cave" until:"they left the cave"}}…{{/if}}'), d('ask', 'askpick', '{{ask_pick:"question"::A::B::C}}', 'Current place: {{ask_pick:"Where is the scene now?"::tavern::forest::castle}}', ['ask_pick']),
  d('lore', 'outlet', '{{outlet::name}}'), d('lore', 'include', '{{include::entry}}  ·  {{include::book::entry}}', '{{include::House rules}}', ['include']), d('lore', 'original', '{{original}}'),
  d('format', 'newline', '{{newline}}'), d('format', 'trim', '{{trim}}'), d('format', 'noop', '{{noop}}'),
  d('format', 'uppercase', '{{uppercase}} … {{/uppercase}}', '{{uppercase}}{{char}}{{/uppercase}}', ['uppercase', '/uppercase']), d('format', 'lowercase', '{{lowercase}} … {{/lowercase}}', undefined, ['lowercase', '/lowercase']),
];
/** 다른 기능이 꽂았고 위 목록에 없는 매크로들 */
export function extraMacros(): { name: string; owner: string }[] {
  const known = new Set(MACRO_DOCS.flatMap(m => m.names || []));
  return [...X.macros].filter(([k]) => !known.has(k) && !k.startsWith('/')).map(([name, m]) => ({ name, owner: m.owner || '' })).sort((a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name));
}
