// 사진: 여러 장을 그리기 전에 묻는다 — 몇 장인지 · 요청 수 · NovelAI 라면 Anlas 짐작 (한 장씩 누르는 것은 묻지 않는다)
import { choiceBox } from '../ui';
import { t, tn } from '../i18n';
import { costOf } from './queue';

/** 비용 한 줄: "그림 요청 N번 · Opus 구독이면 무료 범위" 처럼 */
export function costLine(n: number): string {
  const c = costOf(n), parts = [tn('photos.cost.requests', n)];
  if (c.nai) parts.push(c.refs ? t('photos.cost.refs', { refs: c.refs, n, anlas: c.anlas }) : c.free ? t('photos.cost.free') : t('photos.cost.paid'));
  return parts.join(' · ');
}
/** 여러 장 그리기 전에 확인 (n 장 · 비용). 그리기로 했으면 true */
export async function confirmDraw(n: number): Promise<boolean> {
  if (n <= 0) return false;
  const c = costOf(n);
  const r = await choiceBox(tn('photos.confirm.title', n), <div className="col ph-confirm"><p>{tn('photos.confirm.body', n)}</p><p className="hint">{costLine(n)}</p><p className="hint">{t('photos.confirm.size', { w: c.w, h: c.h })}</p></div>,
    [{ key: 'go', label: tn('photos.confirm.go', n), cls: 'primary' }]);
  return r === 'go';
}
