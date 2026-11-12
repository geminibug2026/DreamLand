// ── 페이지 라우터 ── (옛 js/ui.js 의 route · registerPage · go · refresh · popstate 처리 그대로)
import { S, emit } from './core';

export type PageRender = (root: HTMLElement, arg?: unknown) => unknown;
const pages: Record<string, PageRender> = {};
export const route: { page: string; arg: unknown } = { page: '', arg: null };
export const registerPage = (name: string, render: PageRender) => { pages[name] = render; };
export function go(page: string, arg?: unknown, fromHistory?: boolean) {
  if (!pages[page]) page = 'home';
  if (!fromHistory) try {   // 뒤로 가기가 앱 밖으로 나가지 않고 앞 화면으로 돌아가게 기록해 둔다 (같은 화면을 다시 그릴 때는 쌓지 않는다)
    const st = history.state as { dl?: number; page?: string; arg?: unknown } | null, next = { dl: 1, page, arg: arg ?? null };
    if (st?.dl !== 1) history.replaceState(next, ''); else if (st.page !== page || st.arg !== next.arg) history.pushState(next, '');
  } catch { }
  route.page = page; route.arg = arg;
  const root = document.getElementById('page') as HTMLElement;
  root.className = 'page-' + page; root.replaceChildren();
  document.querySelectorAll<HTMLElement>('#rail [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  pages[page](root, arg);
  S.set({ lastPage: page });
  emit('route', page);
}
export const refresh = () => go(route.page, route.arg);

addEventListener('popstate', e => {
  const st = e.state as { dl?: number; page: string; arg?: unknown } | null; if (st?.dl !== 1) return;
  for (const m of document.querySelectorAll('.modal-wrap')) { const x = m.querySelector<HTMLElement>('button[title="닫기"]'); if (x) x.click(); else m.remove(); }
  go(st.page, st.arg ?? undefined, true);
});
