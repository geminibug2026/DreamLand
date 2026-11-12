// 삽화(씬북) 화면이 함께 쓰는 작은 도우미
import { msgText, download } from '../lib/core';
import { MODELS, BACKENDS } from '../lib/illust';
import { chatApi } from '../chat/actions';
import { toast } from '../ui';
import type { GenConfig, Msg, Scene } from './types';

// ════════ 작은 도우미 ════════
export const cur = () => chatApi.current();
export const clone = <T,>(v: T): T => v == null ? v : structuredClone(v);
export const pickKeys = (o: object | null | undefined, keys: string[]): Record<string, unknown> => { const r = (o ?? {}) as Record<string, unknown>; return Object.fromEntries(keys.filter(k => r[k] !== undefined).map(k => [k, clone(r[k])])); };
export const errText = (e: unknown) => (e instanceof Error ? e.message : '') || String(e);
/** 실패하면 알림으로 이유를 보여 준다 */
export const guard = <A extends unknown[]>(fn: (...a: A) => unknown) => async (...a: A): Promise<void> => { try { await fn(...a); } catch (e) { console.error(e); toast(errText(e), 'err'); } };
export const modelLabel = (c?: GenConfig | null) => c?.backend && c.backend !== 'nai' ? BACKENDS[c.backend] : (MODELS[c?.model ?? '']?.label || c?.model || '');
export const configLine = (c?: GenConfig | null) => c ? [modelLabel(c), `${c.width} × ${c.height}`, c.backend === 'nai' || c.backend === 'a1111' ? `${c.steps} Steps` : ''].filter(Boolean).join(' · ') : '';
export const flat = (s: unknown) => String(s ?? '').normalize('NFC').replace(/[\s*_~`"'“”‘’「」『』]/g, '');
export const lastReply = (): Msg | null => { const { msgs } = cur(); return msgs ? [...msgs].reverse().find(m => m.role === 'assistant' && msgText(m).trim()) ?? null : null; };
export const mustBeOpen = (msg: Msg) => { if (!cur().msgs?.includes(msg)) throw new Error('대상 답변이 있는 대화가 열려 있지 않아요. 대화를 다시 열어 주세요.'); };
export async function saveImage(src: string, name: string) { const blob = await (await fetch(src)).blob(); download(`${name}.${(blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, blob); }
export const blankScene = (n = 1): Scene => ({ title: `장면 ${n}`, prompt: '', camera: '', negative: '', anchor: '', finalPrompt: false, characters: [] });
/** 지시문이 제목을 쓰지 않게 된 뒤로 붙는 기본 이름(장면 1 …)은 화면에 따로 적지 않는다 */
export const shownTitle = (t?: string) => /^(?:장면 \d+|새 장면)$/.test(t || '') ? '' : (t || '');
export const when = (ts?: number) => ts ? new Date(ts).toLocaleString('ko-KR') : '';
