// 자기소개 한 줄: 톡 프로필에 걸어 두는 문구 (지금 상태를 알리는 [status:] 와 다르다 — 이건 오래 걸려 있는 프로필 글)
// 게시판(src/feed)에 계정이 있는 캐릭터는 그 계정의 소개 글을 그대로 쓴다. 한 사람의 소개가 두 군데서 따로 놀지 않게, 고칠 때도 그쪽에 적는다.
import { S } from '../lib/core';
import type { Char, Persona } from '../lib/types';
import { account, save as saveFeed } from '../feed/store';
import { ME } from '../feed/types';

export const ABOUT_MAX = 80;
/** 스스로 고칠 수 있는 간격: 문구가 턴마다 바뀌면 프로필이 아니라 상태가 된다 */
export const ABOUT_REST = 12 * 3600_000;
export const ABOUT_GUIDE = `[about: one line] — rewrite the short "about me" line on {{char}}'s own profile (under 60 characters, in {{char}}'s voice: a motto, a mood, a private joke). It stays up for days, so change it only when something in {{char}}'s life or heart has really shifted. Never announce that you changed it.`;
export const cleanAbout = (s: string) => String(s || '').replace(/\s+/g, ' ').replace(/^["“'「]+|["”'」]+$/g, '').trim().slice(0, ABOUT_MAX);
type Ext = { about?: string; aboutAt?: number };
export const aboutOf = (c?: Char | null): string => !c ? '' : account(c.id)?.bio || String((c.ext as Ext | undefined)?.about || '');
export const aboutAt = (c: Char): number => +((c.ext as Ext | undefined)?.aboutAt || 0);
/** 소개를 바꾼다. by = 'self' 면 캐릭터가 스스로 바꾼 것 (바꾼 때를 적어 한동안 쉬게 한다) */
export async function setAbout(c: Char, text: string, by: 'self' | 'user' = 'user') {
  const v = cleanAbout(text), a = account(c.id), ext = (c.ext ||= {}) as Ext;
  if (a) { a.bio = v; delete a.fresh; saveFeed(); } else ext.about = v;
  if (by === 'self') ext.aboutAt = Date.now();
  if (!a || by === 'self') await S.save('chars', c, true);
}
type PersonaA = Persona & { about?: string };
/** 내 소개: 페르소나에 적은 것, 없으면 게시판의 내 계정 소개 */
export const myAbout = (p?: Persona | null): string => String((p as PersonaA | null | undefined)?.about || '') || account(ME)?.bio || '';
export async function setMyAbout(p: Persona, text: string) {
  const v = cleanAbout(text), a = account(ME); (p as PersonaA).about = v;
  if (a && (!a.bio || S.persona(null)?.id === p.id)) { a.bio = v; saveFeed(); }
  await S.save('personas', p, true);
}
/** 프롬프트에 싣는 프로필 줄 (자기가 쓴 소개라는 것만 알린다) */
export function aboutBlock(chars: Char[], persona: Persona | null | undefined, user: string): string {
  const rows = [...chars.map(c => [c.name, aboutOf(c)]), [user, myAbout(persona)]].filter(r => r[1]);
  return rows.length ? `Profile lines — the short "about me" each person wrote on their own messenger profile. Take them as how that person chooses to present themselves:\n${rows.map(r => `- ${r[0]}: ${r[1]}`).join('\n')}` : '';
}
