// ── 페이지 라우터 ── (옛 js/ui.js 의 route · registerPage · go · refresh · popstate 처리 그대로)
import { S, emit } from './core';

export type PageRender = (root: HTMLElement, arg?: unknown) => unknown;
const pages: Record<string, PageRender> = {};
export const route: { page: string; arg: unknown; from: string } = { page: '', arg: null, from: '' };
export const registerPage = (name: string, render: PageRender) => { pages[name] = render; };
/** 등록된 화면 이름들 (등불지기의 open 도구가 쓴다) */
export const pageNames = () => Object.keys(pages);
export function go(page: string, arg?: unknown, fromHistory?: boolean) {
  if (!pages[page]) page = 'home';
  if (!fromHistory) try {   // 뒤로 가기가 앱 밖으로 나가지 않고 앞 화면으로 돌아가게 기록해 둔다 (같은 화면을 다시 그릴 때는 쌓지 않는다)
    const st = history.state as { dl?: number; page?: string; arg?: unknown } | null, next = { dl: 1, page, arg: arg ?? null };
    if (st?.dl !== 1) history.replaceState(next, ''); else if (st.page !== page || st.arg !== next.arg) history.pushState(next, '');
  } catch { }
  if (route.page && route.page !== page) route.from = route.page;   // 바로 앞 화면 (같은 화면을 다시 그릴 때는 그대로)
  route.page = page; route.arg = arg;
  const root = document.getElementById('page') as HTMLElement;
  root.className = 'page-' + page; root.replaceChildren();
  document.querySelectorAll<HTMLElement>('#rail [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  pages[page](root, arg);
  S.set({ lastPage: page });
  emit('route', page);
}
export const refresh = () => go(route.page, route.arg);

/** 뒤로 가기를 먼저 받아 보는 겹 (화면 위에 뜬 휴대폰 등). true 를 돌려주면 그 겹이 처리한 것 — 창을 닫거나 화면을 다시 그리지 않는다 */
export const backFirst = new Set<() => boolean>();
addEventListener('popstate', e => {
  for (const f of backFirst) if (f()) return;
  const st = e.state as { dl?: number; page: string; arg?: unknown } | null; if (st?.dl !== 1) return;
  // 창의 닫기(X) 단추: src/ui/Modal.tsx 의 .modal-x (언어와 상관없이). title="닫기" 는 옛 창을 위한 예비
  for (const m of document.querySelectorAll('.modal-wrap')) { const x = m.querySelector<HTMLElement>('.modal-head .modal-x, button[title="닫기"]'); if (x) x.click(); else m.remove(); }
  go(st.page, st.arg ?? undefined, true);
});
