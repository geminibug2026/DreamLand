// 손잡이를 잡고 끌어서 목록 순서 바꾸기 (마우스 · 터치 모두 포인터 이벤트로)
import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * listEl 바로 아래 자식들이 줄이다. 손잡이(handle)를 누른 채 위아래로 끌면 onMove(원래 자리, 새 자리) 를 부른다.
 * 돌려주는 함수를 부르면 뗀다.
 */
export function dragSort(listEl: HTMLElement, onMove: (from: number, to: number) => void, handle = '.grip'): () => void {
  const down = (e: PointerEvent) => {
    const hd = e.target instanceof Element ? e.target.closest<HTMLElement>(handle) : null; if (!hd || !listEl.contains(hd) || e.button > 0) return;
    const rows = [...listEl.children] as HTMLElement[], row = rows.find(r => r.contains(hd)), from = row ? rows.indexOf(row) : -1; if (!row || from < 0 || rows.length < 2) return;
    e.preventDefault();
    const box = rows.map(r => r.getBoundingClientRect()), me = box[from], step = me.height + (box[1].top - box[0].bottom);
    let scroller = listEl.parentElement; while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const scroll0 = scroller ? scroller.scrollTop : 0, startY = e.clientY; let lastY = startY, to = from, raf = 0;
    const place = () => {
      const dy = lastY - startY + ((scroller ? scroller.scrollTop : 0) - scroll0), mid = me.top + me.height / 2 + dy; let n = from;
      row.style.transform = `translateY(${dy}px)`;
      rows.forEach((r, i) => { if (i === from) return; const c = box[i].top + box[i].height / 2, dn = i > from && mid > c, up = i < from && mid < c; n += dn ? 1 : up ? -1 : 0; r.style.transform = dn ? `translateY(${-step}px)` : up ? `translateY(${step}px)` : ''; });
      to = n;
    };
    const tick = () => {   // 가장자리 가까이 끌면 목록이 따라 움직인다
      raf = 0; if (!scroller) return; const b = scroller.getBoundingClientRect(), edge = 56;
      const v = lastY < b.top + edge ? -Math.ceil((b.top + edge - lastY) / 5) : lastY > b.bottom - edge ? Math.ceil((lastY - (b.bottom - edge)) / 5) : 0;
      if (!v) return; const was = scroller.scrollTop; scroller.scrollTop += Math.max(-18, Math.min(18, v)); if (scroller.scrollTop !== was) { place(); raf = requestAnimationFrame(tick); }
    };
    const move = (ev: PointerEvent) => { lastY = ev.clientY; place(); if (!raf) raf = requestAnimationFrame(tick); };
    const end = (ev: PointerEvent) => {
      hd.removeEventListener('pointermove', move); hd.removeEventListener('pointerup', end); hd.removeEventListener('pointercancel', end); cancelAnimationFrame(raf);
      listEl.classList.remove('sorting'); rows.forEach(r => { r.style.transform = ''; r.classList.remove('dragging'); });
      if (ev.type === 'pointerup' && to !== from) onMove(from, to);
    };
    try { hd.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 끌 수는 있다 */ }
    listEl.classList.add('sorting'); row.classList.add('dragging');
    hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end);
  };
  listEl.addEventListener('pointerdown', down);
  return () => listEl.removeEventListener('pointerdown', down);
}

/** 목록 요소의 ref 로 넘기면 끌어서 정렬이 붙는다: const ref = useDragSort((from, to) => …); <div ref={ref}>… */
export function useDragSort<E extends HTMLElement = HTMLDivElement>(onMove: (from: number, to: number) => void, handle = '.grip') {
  const fn = useRef(onMove);
  useLayoutEffect(() => { fn.current = onMove; });
  return useCallback((el: E | null) => { if (el) return dragSort(el, (a, b) => fn.current(a, b), handle); }, [handle]);
}
