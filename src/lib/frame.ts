// ── 한 화면에 한 번: 대화 화면을 꾸미는 기능들(배지 · 번역 단추 · 그림 칸 · 조수 메모 · 표정)의 '다음 화면에' 일을 한 덩어리로 돌린다 ──
// 기능마다 requestAnimationFrame 을 따로 걸면, 하나가 DOM 을 고칠 때마다 문서를 지켜보는 관찰자(MutationObserver — 기능 · 확장마다 하나씩)가
// 그 사이사이에 매번 다시 불린다. 한 콜백 안에서 차례로 돌리면 고친 것이 한 번에 모여 관찰자가 한 번만 불린다 (확장이 많을수록 차이가 크다).
// 차례는 맡긴 순서 그대로 · 같은 일은 한 번만 · 하나가 넘어져도 나머지는 돈다. 돌리는 중에 새로 맡긴 일은 다음 화면에
const jobs = new Set<() => void>();
let raf = 0;
function run() {
  raf = 0; const list = [...jobs]; jobs.clear();
  for (const f of list) { try { f(); } catch (e) { console.warn('[화면]', e); } }
}
export function onFrame(fn: () => void) { jobs.add(fn); if (!raf) raf = requestAnimationFrame(run); }
