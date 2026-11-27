// 사진: 삽화 대기열에 넣는 길 — 사진 한 장 = 그림 요청 1번. 늘 세로 (휴대폰 카메라)로, 그림체 프리셋 · 참조는 삽화 설정 그대로
import { S, uid } from '../lib/core';
import { Illust, MODELS, type AssetRec, type IChat, type IMsg, type ISwipe, type Job } from '../lib/illust';
import { sizeFor } from '../scenebook/framing';

/** 삽화가 연결되어 있나: NovelAI 키 · 로컬 SD · 이미지 연결 가운데 지금 고른 것이 채워져 있어야 한다 */
export function canDraw(): boolean {
  try { const c = Illust.cfg(); return c.backend === 'nai' ? !!c.naiKey : c.backend === 'a1111' ? !!c.a1111 : !!(c.connId && S.get('conns', c.connId)); } catch { return false; }
}
/** 사진 한 장의 크기: 지금 설정의 픽셀 수 그대로 세로로 */
export const portrait = () => sizeFor(Illust.genConfig() as unknown as { width: number; height: number; budgetGuard?: boolean }, 'portrait');
/** 그림 요청 1번 = 사진 한 장. 쓸 그림 크기와 NovelAI 비용 짐작 (Opus 무료 범위: 1,048,576 픽셀 · 28 Steps 이하, Precise 참조는 장마다 5 Anlas 더) */
export function costOf(n: number): { requests: number; nai: boolean; free: boolean; anlas: number; refs: number; w: number; h: number } {
  const c = Illust.genConfig(), size = portrait(), nai = c.backend === 'nai' && !!MODELS[c.model as string];
  const refs = nai ? (c.references || []).filter(r => r.kind === 'precise').length : 0;
  const free = nai && size.width * size.height <= 1048576 && Number(c.steps) <= 28;
  return { requests: n, nai, free, anlas: refs * 5 * n, refs, w: size.width, h: size.height };
}
/** 사진 열쇠 → 줄에 선 작업 · 실패한 까닭 (앱을 다시 열면 비어 있다: 그때는 글로만 있는 사진으로 보인다) */
export const tracked = new Map<string, Job>(), failed = new Map<string, string>();
/** 대기열의 그 작업 (방금 넣은 것) */
export function jobOf(done: unknown): Job | undefined { const q = Illust.queue(); for (let i = q.length - 1; i >= 0 && i >= q.length - 3; i--) if (q[i].onDone === done) return q[i]; return undefined; }

/** 대화 답장에 붙지 않는 사진(앨범 · 게시판): 빈 자리 하나를 빌려 대기열에 넣고, 다 그리면 에셋을 돌려준다. onJob 은 줄에 선 작업을 받는다 */
export function queueLoose(chat: IChat, scene: Record<string, unknown>, onJob?: (j: Job | undefined) => void): Promise<AssetRec> {
  const sw: ISwipe = { text: '', illust: [] }, holder: IMsg = { id: 'photo:' + uid(), role: 'assistant', sw: 0, swipes: [sw] };
  return new Promise((res, rej) => {
    const done = (e: Error | null, rec?: AssetRec) => { if (e || !rec) rej(e || new Error('no image')); else res(rec); };
    Illust.enqueue(chat, holder, scene, done, { manual: true, config: portrait() });
    onJob?.(jobOf(done));
  });
}
