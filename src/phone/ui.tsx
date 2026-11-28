// 휴대폰 안에서 함께 쓰는 작은 부품: 휴대폰 조작 고리(PhoneApi) · 앱 머리 · 알약 스위치 · 큰 밀대 · 나눔 단추 · 빈 화면 · 얼굴
import { createContext, useContext, useRef, useState, type MouseEvent as RME, type ReactNode, type PointerEvent as RPE } from 'react';
import { Avatar } from '../kit';
import type { Char, Chat } from '../lib/types';
import { ago } from '../chat/actions';
import { t, locale } from '../i18n';
import { Glyph } from './art';
import type { Prefs } from './prefs';
import type { Notif, SnsNote } from './data';

export type AppId = 'messages' | 'calls' | 'contacts' | 'photos' | 'calendar' | 'notes' | 'music' | 'board' | 'settings';
export interface PhoneApi {
  /** 휴대폰의 바탕이 되는 대화 (연 자리 · 가장 최근 대화 모드 방) */ home: Chat | null;
  fav: Char | null; p: Prefs;
  /** 저장된 자료가 바뀔 때 오르는 번호 (목록 셈을 다시 할 때) */ v: number;
  /** 열려 있는 동안 새로 온 메시지 */ fresh: Map<string, { at: number; text: string; n: number }>;
  notifs: Notif[];
  /** 게시판에서 나에게 온 새 소식 (없으면 null) */ sns: SnsNote | null;
  open(app: AppId, arg?: unknown, from?: Element | null): void;
  back(): void; home2(): void;
  /** 휴대폰을 닫고 나서 after 를 한다 (다른 화면으로 가기 · 전화 걸기) */
  leave(after?: () => void): void;
  /** 그 대화방으로 (reply 가 있으면 그 말을 보낸다 — 대화 화면의 보내기 그대로) */
  toChat(c: Chat, reply?: string): void;
  /** 전화를 건다 (통화 기능에 'call:dial' 로 맡긴다) */
  dial(c: Chat): void;
  read(n: Notif): void; mute(chatId: string): void;
  setCc(open: boolean): void;
  edit: boolean; setEdit(on: boolean): void;
  /** 휴대폰 밖, 앱의 게시판 화면으로 열렸다 (src/pages/Feed.tsx) */
  inPage?: boolean;
}
export const PhoneCtx = createContext<PhoneApi | null>(null);
export const usePhone = () => useContext(PhoneCtx) as PhoneApi;
export const agoText = (ts: number) => ago(ts);
/** 목록의 때: 오늘이면 시각(오후 6:49), 어제면 「어제」, 이번 주면 요일, 그 전이면 날짜 */
export function listTime(ts: number) {
  const d = new Date(ts), day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((day(new Date()) - day(d)) / 86400000), loc = locale();
  if (diff <= 0) return d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
  if (diff === 1) return new Intl.RelativeTimeFormat(loc, { numeric: 'auto' }).format(-1, 'day');
  if (diff < 7) return d.toLocaleDateString(loc, { weekday: 'long' });
  return d.toLocaleDateString(loc, { month: 'short', day: 'numeric' });
}

/** 앱 머리: 뒤로 · 제목 · 오른쪽 단추들 */
export function AppHead({ title, big, back = true, right }: { title: string; big?: boolean; back?: boolean; right?: ReactNode }) {
  const P = usePhone();
  return <header className={'pn-ahead' + (big ? ' big' : '')}>
    {back ? <button type="button" className="pn-ib" aria-label={t('phone.back')} title={t('phone.back')} onClick={P.back}><Glyph name="back" /></button> : <i />}
    <h2>{title}</h2><div className="pn-ahead-r">{right}</div>
  </header>;
}
export function IBtn({ ic, label, onClick, cls = '', on }: { ic: string; label: string; onClick: (e: RME<HTMLButtonElement>) => void; cls?: string; on?: boolean }) {
  return <button type="button" className={'pn-ib ' + cls} aria-label={label} title={label} aria-pressed={on} onClick={onClick}><Glyph name={ic} /></button>;
}
/** 조절 센터의 알약 스위치 */
export function Pill({ ic, label, sub, on, onClick }: { ic: string; label: string; sub?: string; on: boolean; onClick: () => void }) {
  return <button type="button" className={'pn-pill' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick}><i><Glyph name={ic} size={20} /></i><span><b>{label}</b>{sub ? <small>{sub}</small> : null}</span></button>;
}
/** 설정 줄의 스위치 */
export function Switch({ on, label, hint, onChange }: { on: boolean; label: string; hint?: string; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} className="pn-row pn-sw-row" onClick={() => onChange(!on)}><span><b>{label}</b>{hint ? <small>{hint}</small> : null}</span><i className={'pn-sw' + (on ? ' on' : '')} /></button>;
}
/** 큰 둥근 밀대 (밝기 · 소리). 손가락을 따라 그리고, 뗄 때 값을 정한다 */
export function Slider({ ic, label, value, min = 0, max = 1, onChange }: { ic: string; label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  const [drag, setDrag] = useState<number | null>(null), box = useRef<HTMLDivElement>(null), rect = useRef<DOMRect | null>(null);
  const at = (e: RPE) => { const r = rect.current || box.current!.getBoundingClientRect(); return min + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (max - min); };
  const v = drag ?? value, pct = ((v - min) / (max - min)) * 100;
  return <div ref={box} className="pn-slider" role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(v * 100) / 100}
    onKeyDown={e => { const step = (max - min) / 10; if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(max, value + step)); else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(min, value - step)); }}
    onPointerDown={e => { rect.current = box.current!.getBoundingClientRect(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(at(e)); }}
    onPointerMove={e => { if (drag != null) setDrag(at(e)); }}
    onPointerUp={e => { if (drag != null) { onChange(at(e)); setDrag(null); } }} onPointerCancel={() => setDrag(null)}>
    <i className="pn-slider-fill" style={{ transform: `translateX(${pct - 100}%)` }} /><span className="pn-slider-ic"><Glyph name={ic} size={20} /></span>
  </div>;
}
/** 나눔 단추 (탭) */
export function Seg<K extends string>({ value, opts, onChange, label }: { value: K; opts: readonly (readonly [K, string])[]; onChange: (k: K) => void; label: string }) {
  return <div className="pn-seg" role="tablist" aria-label={label}>{opts.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'on' : undefined} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
/** 빈 화면: 작은 낙서 · 한 줄 · 할 수 있는 일 */
export function Empty({ art, title, text, children }: { art?: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return <div className="pn-empty">{art}<b>{title}</b>{text ? <p>{text}</p> : null}{children ? <div className="pn-empty-do">{children}</div> : null}</div>;
}
/** 둥근 얼굴 (작은 그림) + 지금 상태 점 */
export function Face({ o, size = 44, status }: { o?: { avatar?: string; name?: string; tags?: string[] } | null; size?: number; status?: string }) {
  return <i className="pn-face" style={{ width: size, height: size, fontSize: Math.round(size * .4) }}><Avatar o={o || { name: '?' }} />{status ? <i className={'pn-dot ' + status} /> : null}</i>;
}
