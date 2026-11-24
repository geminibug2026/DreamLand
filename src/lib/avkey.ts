// 캐릭터 초상을 메모리에 통째로 들고 있지 않기 위한 "꼬리표".
// 저장소(IndexedDB 의 chars)에는 예전 그대로 그림(data URL)이 들어 있다. 앱이 켜질 때는 그림을 뺀 나머지만 읽고,
// 메모리의 c.avatar 에는 `dlav:<길이>:<해시>:<캐릭터 id>` 꼴의 짧은 글만 둔다. 그림이 필요한 곳은 그때 저장소에서 읽는다.
// 화면(메인 스레드)과 일꾼(worker)이 같이 쓴다 — 여기에는 화면 · 저장소에 닿는 코드가 없다.

export const AV_TOK = 'dlav:';
/** 이 길이를 넘는 data: 그림만 꼬리표로 바꾼다 (짧은 그림 · 웹 주소는 그대로 둔다) */
export const AV_MIN = 4096;
export const isAvTok = (s: unknown): boolean => typeof s === 'string' && s.startsWith(AV_TOK);
/** 꼬리표로 바꿀 만한 그림인가 */
export const avHeavy = (s: unknown): s is string => typeof s === 'string' && s.length >= AV_MIN && s.startsWith('data:');

/** 그림을 가리키는 짧은 열쇠: 길이 + 군데군데 뽑은 글자의 해시 (수 MB 를 통째로 해시하지 않는다) */
export function avKey(src: string): string {
  let h = 2166136261; const step = Math.max(1, Math.floor(src.length / 512));
  for (let i = 0; i < src.length; i += step) h = Math.imul(h ^ src.charCodeAt(i), 16777619);
  for (let i = 0; i < Math.min(src.length, 1024); i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619);   // 머리(카드 PNG 는 앞쪽 글자 자료가 다르다)
  for (let i = Math.max(0, src.length - 64); i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619);
  return `${src.length}:${(h >>> 0).toString(36)}`;
}
export const avTok = (key: string, id: string) => AV_TOK + key + ':' + id;
/** 꼬리표 → { key: 그림 열쇠, id: 그 그림이 든 캐릭터, len: 원본 글자 수 } */
export function tokParts(t: unknown): { key: string; id: string; len: number } | null {
  const tok = t as string;
  if (!isAvTok(tok)) return null;
  const a = tok.indexOf(':', AV_TOK.length), b = a < 0 ? -1 : tok.indexOf(':', a + 1); if (b < 0) return null;
  return { key: tok.slice(AV_TOK.length, b), id: tok.slice(b + 1), len: Number(tok.slice(AV_TOK.length, a)) || 0 };
}

/** 글의 지문 (두 갈래 32비트 + 길이) */
export function strHash(s: string): string {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822507) ^ (b >>> 13); }
  return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36) + '.' + s.length.toString(36);
}
export interface LiteRow { id: string; v: Record<string, unknown>; fp: string }
/** 저장된 한 줄 → 그림을 꼬리표로 바꾼 사본과 그 지문. 저장소에 꼬리표가 들어 있으면(있어서는 안 된다) 그림 없음으로 본다 */
export function liteOf(row: Record<string, unknown>): LiteRow {
  const id = String(row.id), a = row.avatar;
  const v = { ...row, avatar: avHeavy(a) ? avTok(avKey(a), id) : isAvTok(a) ? '' : a };
  return { id, v, fp: strHash(JSON.stringify(v)) };
}
