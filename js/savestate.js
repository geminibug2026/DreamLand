// ── Dreamland savestate: "고치는 중 → 저장 중 → 저장됨" 표시. 저장은 자동이므로 버튼 대신 상태를 보여 준다 ──
import { DB, h } from './core.js';

const el = h('div.save-pill', { role: 'status', 'aria-live': 'polite' }, h('i', '✦'), h('span', ''));
const label = el.lastChild;
let pending = 0, dirtyAt = 0, fade = 0, quiet = 0, lastSaved = 0, mine = false;   // mine: 내가 고친 것을 저장하는 중인가 (뒤에서 저절로 일어나는 저장은 알리지 않는다)
const time = t => new Date(t).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
function show(state, text) {
  el.dataset.state = state; label.textContent = text; el.classList.add('on'); el.classList.remove('dim');
  clearTimeout(fade); if (state === 'saved') fade = setTimeout(() => el.classList.remove('on'), 2200);
}
const saved = () => { lastSaved = Date.now(); dirtyAt = 0; if (mine) show('saved', '저장됨'); mine = false; };

// 저장소에 쓰는 모든 길목을 지켜본다 (어느 화면에서 저장하든 같은 표시)
for (const fn of ['put', 'del']) {
  const raw = DB[fn]; if (typeof raw !== 'function' || raw.__watched) continue;
  const wrapped = (...a) => {
    pending++; if (dirtyAt && Date.now() - dirtyAt < 6000) { mine = true; clearTimeout(quiet); show('saving', '저장 중…'); }
    let p; try { p = Promise.resolve(raw(...a)); } catch (e) { p = Promise.reject(e); }
    p.then(() => { if (--pending <= 0) { pending = 0; saved(); } }, e => { pending = Math.max(0, pending - 1); show('error', '저장하지 못했어요'); console.error('저장 실패', e); });
    return p;
  };
  wrapped.__watched = true; DB[fn] = wrapped;
}

// 값을 고치는 순간 바로 알려 준다. 저장되지 않는 칸(검색 · 메시지 입력창)은 잠시 뒤 조용히 원래대로
const skip = t => !t?.closest || t.closest('.composer, .palette, .side-head, [data-nosave]') || t.type === 'search' || t.classList?.contains('search');
const touched = e => {
  const t = e.target; if (!t || skip(t) || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') && !t.isContentEditable) return;
  if (!t.closest('#page, #modals, .drawer')) return;
  dirtyAt = Date.now(); if (!pending) show('dirty', '고치는 중…');
  clearTimeout(quiet); quiet = setTimeout(() => { if (pending || !dirtyAt) return; dirtyAt = 0; el.classList.remove('on'); }, 3000);
};
document.addEventListener('input', touched, true); document.addEventListener('change', touched, true);

// 저장이 끝나기 전에 창을 닫으려 하면 한 번 붙잡는다
addEventListener('beforeunload', e => { if (pending > 0 || (dirtyAt && Date.now() - dirtyAt < 700)) { e.preventDefault(); e.returnValue = ''; } });

document.body.append(el);
