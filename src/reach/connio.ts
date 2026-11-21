// 연결을 키 없이 내보내고 다시 들일 때의 파일 꼴 (JSON). 키 · 서비스 계정은 파일에 넣지 않는다 — 들인 뒤 다시 넣어야 한다
// 꼴을 바꾸는 일만 한다 (저장 · 내려받기는 jobs.tsx). 형 말고는 import 하지 않는다.
import type { Conn } from '../lib/types';

export interface ConnFile { app: 'dreamland-conns'; v: 1; conns: Partial<Conn>[] }
const SECRET = ['apiKey', 'serviceAccount', 'sec', 'saEmail', 'saProject', 'updatedAt'];
/** 파일에 담을 꼴: 비밀은 빼고 나머지는 그대로 */
// 덧붙인 헤더 · 본문 칸에 키를 적어 두는 사람이 있다. 키처럼 보이는 낱말이 있으면 그 칸은 통째로 비우고, 프록시 주소의 아이디 · 비밀번호도 뗀다
const KEYISH = /auth|bearer|api[-_ ]?key|token|secret|cookie|password|x-[\w-]*key/i;
const scrub = (k: string, v: unknown): unknown => {
  if ((k === 'extraHeaders' || k === 'extraBody') && typeof v === 'string' && KEYISH.test(v)) return '';
  if (k === 'via' && typeof v === 'string') return v.replace(/\/\/[^/@\s]+@/, '//');
  return v;
};
export const strip = (c: Conn): Partial<Conn> => Object.fromEntries(Object.entries(c).filter(([k]) => !SECRET.includes(k)).map(([k, v]) => [k, scrub(k, v)]));
export const packConns = (list: Conn[]): ConnFile => ({ app: 'dreamland-conns', v: 1, conns: list.map(strip) });
/**
 * 파일의 연결들을 새 id 로 만든다. 서로 가리키는 "안 되면 이 연결로"는 새 id 로 이어 주고, 파일 밖의 연결을 가리키면 비운다.
 * 키가 들어 있는 파일(다른 앱에서 만든 것)이라도 키 칸은 버린다.
 */
export function unpackConns(j: unknown, make: () => string): Conn[] {
  const src = Array.isArray(j) ? j : (j as ConnFile | null)?.conns; if (!Array.isArray(src)) return [];
  const ok = src.filter((x): x is Partial<Conn> => !!x && typeof x === 'object' && typeof (x as Conn).provider === 'string');
  const ids = new Map(ok.map(x => [String(x.id || ''), make()]));
  return ok.map(x => {
    const o: Record<string, unknown> = { ...x }; for (const k of SECRET) delete o[k];
    return { name: '', baseUrl: '', model: '', proxy: false, postProcess: 'none', extraHeaders: '', extraBody: '', cache: false, ...o, id: ids.get(String(x.id || '')) || make(), apiKey: '', fallback: ids.get(String(x.fallback || '')) || '' } as unknown as Conn;
  });
}
