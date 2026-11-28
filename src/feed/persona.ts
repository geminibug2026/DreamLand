// 게시판에서 캐릭터마다 다르게 보이는 내 페르소나 (이름 · 얼굴 · 설명)
// 게시판에서 따로 고른 것 → 캐릭터에 연결된 페르소나(캐릭터의 연결 프로필) → 지금 페르소나
import { S } from '../lib/core';
import type { Persona } from '../lib/types';
import { ME, type Note } from './types';

const picks = () => ((S.settings as unknown as { feed?: { personaFor?: Record<string, string> } }).feed?.personaFor) || {};

/** 그 캐릭터에게 보이는 내 페르소나. 캐릭터가 없으면(내 새 글) 지금 페르소나 */
export function personaFor(charId?: string | null): Persona | undefined {
  if (charId && charId !== ME) {
    const pick = picks()[charId], a = pick ? S.get('personas', pick) : undefined; if (a) return a;
    const linked = S.get('chars', charId)?.bind?.personaId, b = linked ? S.get('personas', linked) : undefined; if (b) return b;
  }
  return S.persona(null);
}
/** 그 캐릭터에 연결된 페르소나 (자동일 때 쓰는 것) */
export function linkedPersona(charId: string): Persona | undefined { const id = S.get('chars', charId)?.bind?.personaId; return (id ? S.get('personas', id) : undefined) || S.persona(null); }
/** 따로 고른 페르소나 id ('' = 자동) */
export const pickedPersona = (charId: string) => { const id = picks()[charId] || ''; return id && S.get('personas', id) ? id : ''; };

/** 내 글이 향한 캐릭터 (그 캐릭터에게 보이는 페르소나로 보인다): 답한 상대 → 글타래 주인. 내 새 글이면 없음 */
export function facingOf(n: Note, notes: Note[], depth = 0): string | null {
  const re = n.re ? notes.find(x => x.id === n.re) : undefined;
  if (re) return re.by !== ME ? re.by : depth < 30 ? facingOf(re, notes, depth + 1) : null;
  const root = n.root ? notes.find(x => x.id === n.root) : undefined;
  return root && root.by !== ME ? root.by : null;
}
