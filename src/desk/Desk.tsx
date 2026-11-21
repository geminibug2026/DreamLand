// 책상: 홈의 한 단. 등록된 위젯을 저장된 순서 · 크기로 늘어놓고, "꾸미기"에서 끌어 옮기고 크기를 바꾸고 서랍에 넣었다 뺀다
import { Component, useRef, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { Btn, IconBtn, useEvents } from '../kit';
import { t } from '../i18n';
import { DeskEmpty, Glyph } from './art';
import { p2 } from './data';
import { SIZES, cfg, foldDesk, layout, moveWidget, resetDesk, sizeWidget, toggleWidget, touchVisit, type Placed } from './registry';

let editing = false;   // 홈을 다시 그려도 꾸미는 중이면 그대로
/** 남이 만든 위젯 하나가 넘어져도 홈은 서 있게 */
class Guard extends Component<{ children: ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch(e: unknown) { console.warn('[책상] 위젯을 그리지 못했어요', e); }
  render() { return this.state.bad ? <p className="dk-bad">{t('desk.broken')}</p> : this.props.children; }
}
const inside = (r: DOMRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

export function Desk() {
  const redraw = useEvents('desk:changed', 'chars', 'chats'), grid = useRef<HTMLDivElement | null>(null);
  touchVisit();
  const c = cfg(), all = layout(), on = all.filter(p => !p.off), off = all.filter(p => p.off);
  const setEdit = (v: boolean) => { editing = v; redraw(); };

  // 끌어 옮기기: 끄는 동안에는 자리를 바꾸지 않고(손잡이가 포인터를 놓치지 않게) 놓을 자리만 표시했다가, 놓을 때 한 번에 옮긴다
  const drag = (e: RPointerEvent<HTMLButtonElement>) => {
    const host = grid.current, hd = e.currentTarget, el = hd.closest<HTMLElement>('.dk-w'); if (!host || !el || e.button > 0) return;
    e.preventDefault();
    const items = [...host.querySelectorAll<HTMLElement>(':scope > .dk-w')], from = items.indexOf(el), r0 = el.getBoundingClientRect(), gx = e.clientX - r0.left, gy = e.clientY - r0.top;
    const scroller = document.getElementById('page'); let to = from;
    const move = (ev: PointerEvent) => {
      if (scroller) { const edge = 70; if (ev.clientY < edge) scroller.scrollTop -= 12; else if (ev.clientY > innerHeight - edge) scroller.scrollTop += 12; }
      el.style.transform = ''; const r = el.getBoundingClientRect(); el.style.transform = `translate(${ev.clientX - gx - r.left}px, ${ev.clientY - gy - r.top}px)`;
      const hit = items.findIndex((n, i) => i !== from && inside(n.getBoundingClientRect(), ev.clientX, ev.clientY)); to = hit < 0 ? from : hit;
      items.forEach((n, i) => n.classList.toggle('over', i === to && to !== from));
    };
    const end = (ev: PointerEvent) => {
      hd.removeEventListener('pointermove', move); hd.removeEventListener('pointerup', end); hd.removeEventListener('pointercancel', end);
      el.style.transform = ''; el.classList.remove('drag'); host.classList.remove('sorting'); items.forEach(n => n.classList.remove('over'));
      if (ev.type === 'pointerup' && to !== from) moveWidget(from, to);
    };
    try { hd.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 끌 수는 있다 */ }
    el.classList.add('drag'); host.classList.add('sorting');
    hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end);
  };

  const tools = (p: Placed, i: number) => <div className="dk-tools">
    <button className="dk-grip" onPointerDown={drag} aria-label={t('desk.edit.drag', { name: p.w.title })} title={t('desk.edit.dragTip')}><svg className="fx-art" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path className="b" d="M5.5 3v10.5M10.5 3v10.5" /></svg></button>
    <b>{p.w.title}</b>
    <IconBtn ic="left" cls="dk-ib" title={t('desk.edit.earlier')} onClick={() => moveWidget(i, Math.max(0, i - 1))} />
    <IconBtn ic="right" cls="dk-ib" title={t('desk.edit.later')} onClick={() => moveWidget(i, Math.min(on.length - 1, i + 1))} />
    <span className="dk-sizes" role="radiogroup" aria-label={t('desk.edit.size')}>{SIZES.map(s => <button key={s} role="radio" aria-checked={p.size === s} className={p.size === s ? 'on' : undefined} title={t('desk.size.' + s)} aria-label={t('desk.size.' + s)} onClick={() => sizeWidget(p.w.id, s)}>{s.toUpperCase()}</button>)}</span>
    <IconBtn ic="x" cls="dk-ib" title={t('desk.edit.remove')} onClick={() => toggleWidget(p.w.id, true)} />
  </div>;

  return <div className={'dk' + (editing ? ' editing' : '')}>
    <header className="hm-sh"><h2>{t('desk.title')}<i>desk</i></h2><em>{p2(on.length)}</em><span className="hm-sp" />
      {!c.fold ? <Btn label={editing ? t('desk.edit.done') : t('desk.edit.start')} ic={editing ? 'check' : 'sliders'} cls={'hm-line' + (editing ? ' on' : '')} onClick={() => setEdit(!editing)} /> : null}
      <IconBtn ic={c.fold ? 'down' : 'up'} cls="hm-line" title={c.fold ? t('desk.unfold') : t('desk.fold')} onClick={() => { editing = false; foldDesk(!c.fold); }} />
    </header>
    {c.fold ? null : <>
      {editing ? <p className="dk-tip">{t('desk.edit.tip')}</p> : null}
      {on.length ? <div className="dk-grid" ref={grid}>{on.map((p, i) => <article key={p.w.id} className={`dk-w ${p.size}${p.w.bare ? ' bare' : ''} fx-in`} style={{ ['--d' as string]: i * 40 + 'ms' }} data-id={p.w.id} aria-label={p.w.title}>
        {editing ? tools(p, i) : null}
        <div className="dk-in" inert={editing || undefined}>{p.w.bare ? <Guard>{p.w.render()}</Guard>
          : <div className="dk-card fx-frame"><header className="dk-h fx-head">{p.w.art ? p.w.art() : <i className="fx-dot" />}<h3>{p.w.title}</h3></header><div className="dk-b"><Guard>{p.w.render()}</Guard></div></div>}</div>
      </article>)}</div>
        : <div className="fx-empty dk-empty"><DeskEmpty /><p>{t('desk.empty')}</p>{editing ? null : <Btn label={t('desk.edit.start')} ic="sliders" cls="hm-line" onClick={() => setEdit(true)} />}</div>}
      {editing ? <div className="dk-drawer"><div className="dk-drawer-h fx-head"><Glyph name="drawer" size={18} /><span className="fx-lbl kr ink">{t('desk.drawer.title')}</span><span className="fx-num">{p2(off.length)}</span></div>
        {off.length ? <ul>{off.map(p => <li key={p.w.id}><button className="dk-slip fx-tap" onClick={() => toggleWidget(p.w.id, false)} aria-label={t('desk.drawer.put', { name: p.w.title })}>{p.w.art ? p.w.art() : <i className="fx-dot" />}<span><b>{p.w.title}</b>{p.w.hint ? <small>{p.w.hint}</small> : null}</span><i className="dk-plus" aria-hidden="true">+</i></button></li>)}</ul>
          : <p className="dk-drawer-none">{t('desk.drawer.none')}</p>}
        <div className="dk-drawer-f"><Btn label={t('desk.edit.reset')} ic="refresh" cls="hm-line" onClick={resetDesk} /></div></div> : null}
    </>}
  </div>;
}
