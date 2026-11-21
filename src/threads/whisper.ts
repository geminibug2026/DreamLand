// 귓속말: 그룹에서 한 사람에게만 한 말. "이번에 말할 캐릭터"가 들은 말인지에 따라 프롬프트의 기록을 가리는 순수 함수
import type { Whisper } from './types';

export const WHISPER_GUIDE = `[whisper: Name | words] — {{char}} says something only that one person hears (another character by name, or {{user}}). Everyone else in the room only notices that something was whispered. For secrets, warnings and asides that would really be said under the breath; not for ordinary lines. Keep it to one or two sentences.`;
export interface Who { id: string; name: string }
/** 이름으로 사람을 찾는다: 똑같은 이름 → 앞머리가 같은 이름 → 이름의 한 토막. 사용자는 'user' */
export function findWho(name: string, cast: Who[], user: string): string | null {
  const n = name.trim().toLowerCase().replace(/^@/, ''); if (!n) return null;
  const all: Who[] = [...cast, { id: 'user', name: user }];
  if (/^(user|you|\{\{user\}\})$/.test(n)) return 'user';
  const hit = all.find(c => c.name.toLowerCase() === n) || all.find(c => c.name.toLowerCase().startsWith(n) || n.startsWith(c.name.toLowerCase())) || all.find(c => c.name.toLowerCase().split(/\s+/).includes(n));
  return hit ? hit.id : null;
}
const nameOf = (id: string, cast: Who[], user: string) => id === 'user' ? user : cast.find(c => c.id === id)?.name || 'someone';
const list = (ids: string[], cast: Who[], user: string) => ids.map(id => nameOf(id, cast, user)).join(' and ');
/**
 * 내(사용자) 귓속말을 viewer 가 읽을 글로. 들은 사람에게는 "너에게만" 이라는 말머리를 붙이고, 못 들은 사람에게는 내용 없이 낌새만 남긴다
 */
export function veilUser(text: string, to: string[], viewer: string, cast: Who[], user: string): string {
  if (!to.length) return text;
  return to.includes(viewer)
    ? `(${user} leans in and whispers this to ${to.length > 1 ? list(to.filter(i => i !== viewer), cast, user) + ' and you' : 'you alone'} — nobody else in the room hears it)\n${text}`
    : `[${user} whispers something to ${list(to, cast, user)}. You cannot hear what was said.]`;
}
/** 캐릭터의 귓속말을 viewer 가 읽을 덧글로 (답장 본문 뒤에 붙인다). 한 사람·들은 사람·나머지에게 각각 다르게 */
export function veilChar(whispers: Whisper[], author: Who, viewer: string, cast: Who[], user: string): string {
  return whispers.filter(w => w.text).map(w => {
    const to = nameOf(w.to, cast, user);
    if (viewer === author.id) return `(You whispered to ${to}, unheard by the others: "${w.text}")`;
    if (viewer === w.to) return `(${author.name} whispers to you alone: "${w.text}")`;
    return `[${author.name} whispers something to ${to}. You cannot hear what was said.]`;
  }).join('\n');
}
