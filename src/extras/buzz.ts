// 손끝 울림: 휴대폰 진동(navigator.vibrate)으로 답장 · 캐릭터의 [buzz: …] · 게임 연출 · 전화 벨을 손에 전한다. 기본은 꺼 둔다
import { cfg } from './cfg';

/** 진동이 되는 기기인가 (안 되면 설정 칸도 숨긴다) */
export const canBuzz = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
// 울림(ms) · 쉼(ms) 이 번갈아 온다
export const PATTERNS: Record<string, number[]> = {
  soft: [16], double: [22, 70, 22], heartbeat: [28, 90, 44, 420, 28, 90, 44], long: [240],
  reply: [12], hit: [42, 34, 84], crit: [18, 40, 18, 40, 130], qte: [10], fail: [90, 60, 90],
  ring: [360, 240, 360, 1100, 360, 240, 360, 1100, 360, 240, 360],
};
export const AI_PATTERNS = ['soft', 'double', 'heartbeat', 'long'];
/** 패턴 이름(또는 숫자 배열)으로 울린다. kind 는 설정의 어느 스위치에 걸리는지 */
export function buzz(pattern: string | number[], kind: 'reply' | 'ai' | 'game' | 'call' | 'test' = 'test') {
  const c = cfg().buzz; if (!canBuzz() || (kind !== 'test' && (!c.on || c[kind] === false))) return false;
  const p = Array.isArray(pattern) ? pattern : PATTERNS[String(pattern).toLowerCase()]; if (!p) return false;
  const k = Math.max(0.4, Math.min(1.8, +c.level || 1));
  try { return navigator.vibrate(p.map((n, i) => i % 2 ? n : Math.round(n * k))); } catch { return false; }   // 쉼은 그대로 두고 울림 길이만 세기에 맞춘다
}
export const stopBuzz = () => { try { if (canBuzz()) navigator.vibrate(0); } catch { /* 없는 기기 */ } };

export const BUZZ_PROMPT = `{{user}}'s phone can buzz in their hand. Very rarely, when a moment truly calls for touch rather than words (a nudge to get attention, a racing heart), you may add [buzz: soft|double|heartbeat|long] alone on its own line. It is removed before {{user}} sees the message; never mention it.`;
const BUZZ_RE = /^[ \t]*\[buzz\s*:\s*"?([a-z]+)"?\s*\][ \t]*\n?/gim;
/** 답장에서 [buzz: …] 를 떼어 낸다 → 남은 글과 패턴 이름들 */
export function takeBuzz(text: string): { text: string; names: string[] } {
  if (text.indexOf('[buzz') < 0) return { text, names: [] };
  const names: string[] = [];
  const out = text.replace(BUZZ_RE, (_m, n: string) => { if (AI_PATTERNS.includes(n.toLowerCase())) names.push(n.toLowerCase()); return ''; }).replace(/\[buzz\s*:[^\]\n]*\]/gi, '');
  return { text: out.replace(/\n{3,}/g, '\n\n').trim(), names: names.slice(0, 1) };
}
/** 화면 표시: 스트리밍 중에 보이는 꼬리표를 감춘다 */
export const hideBuzz = (text: string) => text.indexOf('[buzz') < 0 ? text : text.replace(/\[buzz\b[^\]\n]*(\]|$)/gi, '');
