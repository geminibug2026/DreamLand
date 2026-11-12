// 폼: 정의 배열로 입력 칸을 그린다 (옛 ui.js 의 form · tipBtn)
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { L, type Legacy } from '../legacy';
import { Btn, Dom, Icon } from '../kit';

type Opt = string | number | readonly [value: string | number, label: string];
export interface FieldDef {
  /** 값이 있는 자리. 'a.b' 처럼 점으로 깊이 들어갈 수 있다 */
  k?: string;
  label?: ReactNode;
  type?: 'text' | 'password' | 'area' | 'num' | 'check' | 'select' | 'tags' | 'lines' | 'range' | 'color' | 'image' | (string & {});
  /** ? 단추 뒤에 접어 두는 설명 */
  hint?: ReactNode;
  ph?: string; rows?: number; min?: number; max?: number; step?: number | string;
  /** num: 비우면 0 대신 null */
  nullable?: boolean;
  opts?: readonly Opt[];
  half?: boolean; third?: boolean;
  /** 이름표 옆에 토큰 수 자리(em.tok[data-for])를 둔다 */
  count?: boolean;
  /** 바뀌면 기다리지 않고 바로 onChange */
  live?: boolean;
  /** 이것만 있으면 소제목 */
  section?: ReactNode;
  /** 이것만 있으면 직접 만든 것을 그대로 끼운다 (React 조각이나 옛 DOM) */
  el?: ReactNode | Node;
}
export type FormDefs = readonly (FieldDef | null | undefined | false | '' | 0)[];

const getPath = (o: unknown, p: string): unknown => p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | null | undefined)?.[k], o);
const setPath = (o: object, p: string, v: unknown) => {
  const ks = p.split('.'), last = ks.pop()!; let a = o as Record<string, unknown>;
  for (const k of ks) a = (a[k] ||= {}) as Record<string, unknown>;
  a[last] = v;
};
const str = (v: unknown) => v == null ? '' : String(v);
const list = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : [];
const HEX = /^#[0-9a-f]{6}$/i;

/** 설명 보기 단추: 누르면 그 항목(.check / .field)의 설명(.tip-text)이 펼쳐진다 */
export function TipBtn() {
  const click = (e: MouseEvent<HTMLButtonElement>) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.closest('.check, .field')?.classList.toggle('tip-open'); };
  return <button type="button" className="tip" title="설명 보기" aria-label="설명 보기" onClick={click}>?</button>;
}

/**
 * 폼 밖에서 직접 만든 체크 항목(label.check > small)의 긴 설명을 ? 단추 뒤로 접는 감시자.
 * 지금은 옛 js/ui.js 가 문서 전체를 보고 있어 켜지 않는다 — ui.js 를 뺄 때 한 번 부른다.
 */
export function installTipify(): () => void {
  const tipify = (el: Element) => {
    for (const s of el.querySelectorAll<HTMLElement>('label.check > small:not(.tip-text)')) {
      if (s.closest('.checks, .lore-picklist') || (s.textContent || '').trim().length < 16 || s.parentElement?.querySelector(':scope > .tip')) continue;
      s.classList.add('tip-text');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tip'; b.title = '설명 보기'; b.setAttribute('aria-label', '설명 보기'); b.textContent = '?';
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); b.closest('.check, .field')?.classList.toggle('tip-open'); });
      s.before(b);
    }
  };
  const mo = new MutationObserver(recs => { for (const m of recs) for (const n of m.addedNodes) if (n instanceof Element) tipify(n.parentElement || n); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  return () => mo.disconnect();
}

type Setter = (val: unknown) => void;

function RangeCtl({ d, v, set }: { d: FieldDef; v: unknown; set: Setter }) {
  const [out, setOut] = useState(str(v ?? d.min));
  return <div className="range"><input type="range" min={d.min} max={d.max} step={d.step || 1} defaultValue={str(v ?? d.min)} onChange={e => { setOut(e.target.value); set(+e.target.value); }} /><output>{out}</output></div>;
}

function ColorCtl({ v, set }: { v: unknown; set: Setter }) {
  const pick = useRef<HTMLInputElement>(null), txt = useRef<HTMLInputElement>(null);
  return <div className="color-field">
    <input type="color" ref={pick} defaultValue={HEX.test(str(v)) ? str(v) : '#888888'} onChange={e => { if (txt.current) txt.current.value = e.target.value; set(e.target.value); }} />
    <input className="inp" ref={txt} defaultValue={str(v)} placeholder="#rrggbb" spellCheck={false} onChange={e => { if (HEX.test(e.target.value) && pick.current) pick.current.value = e.target.value; set(e.target.value.trim()); }} />
  </div>;
}

interface Files { pickFiles(o?: { accept?: string; multiple?: boolean }): Promise<File[]>; readDataURL(f: File): Promise<string>; shrinkImage(src: string, max?: number): Promise<string> }
function ImageCtl({ d, v, set }: { d: FieldDef; v: unknown; set: Setter }) {
  const [url, setUrl] = useState(str(v));
  const pick = async () => {
    const core = L.core as Legacy['core'] & Files;
    const [f] = await core.pickFiles({ accept: 'image/*' }); if (!f) return;
    const u = await core.shrinkImage(await core.readDataURL(f), d.max || 720); setUrl(u); set(u);
  };
  return <div className="img-row">
    <div className="img-pick" style={url ? { backgroundImage: `url("${url}")` } : undefined}>{url ? null : <Icon name="image" size={26} />}</div>
    <div className="col"><Btn label="이미지 선택" ic="upload" onClick={() => void pick()} /><Btn label="지우기" cls="ghost" onClick={() => { setUrl(''); set(''); }} /></div>
  </div>;
}

function Row({ d, obj, set }: { d: FieldDef; obj: object; set: Setter }) {
  if (d.section) return <h3 className="form-sec">{d.section}</h3>;
  if (d.el) return d.el instanceof Node ? <Dom node={d.el} /> : <>{d.el}</>;
  const v = getPath(obj, d.k || '');
  let ctl: ReactNode;
  switch (d.type) {
    case 'area': ctl = <textarea className="inp" defaultValue={str(v)} rows={d.rows || 4} placeholder={d.ph || ''} spellCheck={false} onChange={e => set(e.target.value)} />; break;
    case 'num': ctl = <input className="inp" type="number" defaultValue={str(v)} min={d.min} max={d.max} step={d.step ?? 'any'} placeholder={d.ph || ''} onChange={e => set(e.target.value === '' ? (d.nullable ? null : 0) : +e.target.value)} />; break;
    case 'check': return <label className="check"><input type="checkbox" defaultChecked={!!v} onChange={e => set(e.target.checked)} /><i /><span>{d.label}</span>{d.hint && <TipBtn />}{d.hint && <small className="tip-text">{d.hint}</small>}</label>;
    case 'select': ctl = <select className="inp" defaultValue={str(v)} onChange={e => set(e.target.value)}>{(d.opts || []).map(o => { const [val, lab] = typeof o === 'object' ? o : [o, o]; return <option key={String(val)} value={String(val)}>{lab}</option>; })}</select>; break;
    case 'tags': ctl = <input className="inp" defaultValue={list(v).join(', ')} placeholder={d.ph || '쉼표로 구분'} onChange={e => set(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />; break;
    case 'lines': ctl = <textarea className="inp" defaultValue={list(v).join('\n')} rows={d.rows || 3} placeholder={d.ph || '한 줄에 하나씩'} onChange={e => set(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} />; break;
    case 'range': ctl = <RangeCtl d={d} v={v} set={set} />; break;
    case 'color': ctl = <ColorCtl v={v} set={set} />; break;
    case 'image': ctl = <ImageCtl d={d} v={v} set={set} />; break;
    default: ctl = <input className="inp" type={d.type === 'password' ? 'password' : 'text'} defaultValue={str(v)} placeholder={d.ph || ''} autoComplete="off" spellCheck={false} onChange={e => set(e.target.value)} />;
  }
  return <label className={'field' + (d.half ? ' half' : '') + (d.third ? ' third' : '')}>
    <span className="field-label">{d.label}{d.hint && <TipBtn />}{d.count && <em className="tok" data-for={d.k} />}</span>
    {ctl}
    {d.hint && <small className="hint tip-text">{d.hint}</small>}
  </label>;
}

function FormBody<T extends object>({ obj, defs, onChange }: { obj: T; defs: FormDefs; onChange?: (obj: T) => void }) {
  const cb = useRef(onChange);
  useLayoutEffect(() => { cb.current = onChange; });
  const timer = useRef(0);
  // 떠날 때 기다리던 알림은 버리지 않고 바로 보낸다 (옛 것은 떠난 뒤에도 250ms 뒤에 불렸다)
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); timer.current = 0; cb.current?.(obj); } }, [obj]);
  const fire = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => { timer.current = 0; cb.current?.(obj); }, 250); };
  const seen = new Set<string>();
  return <div className="form">{defs.map((d, i) => {
    if (!d) return null;
    let key = d.k ? d.k + ':' + (d.type || '') : '#' + i; if (seen.has(key)) key += '#' + i; seen.add(key);
    return <Row key={key} d={d} obj={obj} set={val => { if (d.k) setPath(obj, d.k, val); if (d.live) cb.current?.(obj); else fire(); }} />;
  })}</div>;
}

/**
 * obj 의 값을 defs 대로 고치는 폼. 값이 바뀌면 obj 를 그 자리에서 고치고 onChange(obj) 를 부른다(250ms 모아서, live 면 바로).
 * 입력 칸은 처음 값만 obj 에서 읽는다. obj 가 다른 객체로 바뀌면 새로 만들고, 같은 객체를 밖에서 고쳤으면 key 를 바꿔 다시 만든다.
 */
export function Form<T extends object>({ obj, defs, onChange }: { obj: T; defs: FormDefs; onChange?: (obj: T) => void }) {
  const [cur, setCur] = useState({ obj, n: 0 });
  let n = cur.n;
  if (cur.obj !== obj) { n++; setCur({ obj, n }); }
  return <FormBody key={n} obj={obj} defs={defs} onChange={onChange} />;
}
