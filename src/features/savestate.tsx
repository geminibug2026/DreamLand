// "고치는 중 → 저장 중 → 저장됨" 표시. 저장은 자동이므로 버튼 대신 상태를 보여 준다 (옛 js/savestate.js 를 대신한다)
import { useSyncExternalStore } from 'react';
import { mod } from '../legacy';
import { mountInto } from '../kit';

type DbFn = (...a: unknown[]) => unknown;
interface Db { put: DbFn; del: DbFn }

const view = { state: '', text: '', on: false };
let snap = { ...view };
const subs = new Set<() => void>();
const push = () => { snap = { ...view }; subs.forEach(f => f()); };
let pending = 0, dirtyAt = 0, fade = 0, quiet = 0, mine = false;   // mine: 내가 고친 것을 저장하는 중인가 (뒤에서 저절로 일어나는 저장은 알리지 않는다)
function show(state: string, text: string) {
  view.state = state; view.text = text; view.on = true; push();
  clearTimeout(fade); if (state === 'saved') fade = window.setTimeout(() => { view.on = false; push(); }, 2200);
}
const hide = () => { view.on = false; push(); };
const saved = () => { dirtyAt = 0; if (mine) show('saved', '저장됨'); mine = false; };

function Pill() {
  const v = useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => snap);
  return <div className={'save-pill' + (v.on ? ' on' : '')} role="status" aria-live="polite" data-state={v.state || undefined}><i>✦</i><span>{v.text}</span></div>;
}

// 저장되지 않는 칸(검색 · 메시지 입력창)은 잠시 뒤 조용히 원래대로
const skip = (t: Element) => !!t.closest('.composer, .palette, .side-head, [data-nosave]') || (t as HTMLInputElement).type === 'search' || t.classList.contains('search');
function touched(e: Event) {
  const t = e.target; if (!(t instanceof HTMLElement) || skip(t) || (!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable)) return;
  if (!t.closest('#page, #modals, .drawer')) return;
  dirtyAt = Date.now(); if (!pending) show('dirty', '고치는 중…');
  clearTimeout(quiet); quiet = window.setTimeout(() => { if (pending || !dirtyAt) return; dirtyAt = 0; hide(); }, 3000);
}

export const feature = {
  name: 'savestate', needs: ['core'],
  setup() {
    document.querySelectorAll('body > .save-pill').forEach(el => el.remove());   // 옛 표시는 내린다 (옛 모듈의 감시는 떼어 낸 요소만 건드린다)
    const DB = mod<{ DB: Db }>('core').DB;
    // 저장소에 쓰는 모든 길목을 지켜본다 (어느 화면에서 저장하든 같은 표시)
    for (const fn of ['put', 'del'] as const) {
      const raw = DB[fn];
      DB[fn] = (...a: unknown[]) => {
        pending++; if (dirtyAt && Date.now() - dirtyAt < 6000) { mine = true; clearTimeout(quiet); show('saving', '저장 중…'); }
        let p: Promise<unknown>; try { p = Promise.resolve(raw(...a)); } catch (e) { p = Promise.reject(e); }
        p.then(() => { if (--pending <= 0) { pending = 0; saved(); } }, e => { pending = Math.max(0, pending - 1); show('error', '저장하지 못했어요'); console.error('저장 실패', e); });
        return p;
      };
    }
    document.addEventListener('input', touched, true); document.addEventListener('change', touched, true);
    // 저장이 끝나기 전에 창을 닫으려 하면 한 번 붙잡는다
    addEventListener('beforeunload', e => { if (pending > 0 || (dirtyAt && Date.now() - dirtyAt < 700)) { e.preventDefault(); e.returnValue = ''; } });
    const holder = document.createElement('div'); holder.style.display = 'contents'; document.body.append(holder);
    mountInto(holder, <Pill />);
  },
};
