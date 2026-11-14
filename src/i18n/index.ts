// ── 다국어(i18n) ── 화면 글자는 모두 여기의 t() 로 꺼낸다. 언어 파일은 ./locales/*.json (ko.json 이 원본)
// 새 언어를 더하는 방법은 저장소 루트의 TRANSLATING.md
import { useSyncExternalStore } from 'react';
import ko from './locales/ko.json';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

type Dict = Record<string, string>;
export interface LocaleInfo { code: string; name: string; dict: Dict }
/** 고를 수 있는 언어. 새 언어는 여기에 한 줄 더한다 (name 은 그 언어로 쓴 이름) */
export const LOCALES: LocaleInfo[] = [
  { code: 'ko', name: '한국어', dict: ko },
  { code: 'en', name: 'English', dict: en },
  { code: 'zh-CN', name: '简体中文', dict: zhCN },
];
const KEY = 'dreamland:lang';
const byCode = new Map(LOCALES.map(l => [l.code, l]));

function pick(): string {
  try { const s = localStorage.getItem(KEY); if (s && byCode.has(s)) return s; } catch { }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const raw of nav) {
    if (!raw) continue;
    const l = raw.toLowerCase();
    const exact = LOCALES.find(x => x.code.toLowerCase() === l); if (exact) return exact.code;
    if (l.startsWith('zh')) { if (/(tw|hk|mo|hant)/.test(l) && byCode.has('zh-TW')) return 'zh-TW'; if (byCode.has('zh-CN')) return 'zh-CN'; }
    const base = LOCALES.find(x => x.code.toLowerCase().split('-')[0] === l.split('-')[0]); if (base) return base.code;
  }
  return 'ko';
}

let lang = pick();
let dict: Dict = byCode.get(lang)!.dict;
const subs = new Set<() => void>();
const setHtml = () => { if (typeof document !== 'undefined') document.documentElement.lang = lang; };
setHtml();

/** 지금 언어 코드 ('ko' · 'en' · 'zh-CN' …) */
export const getLang = () => lang;
/** Intl 에 넘길 지역 이름 */
export const locale = () => lang === 'ko' ? 'ko-KR' : lang;

/** 언어를 바꾼다. 저장하고, <html lang> 을 바꾸고, 구독한 곳(틀 · 지금 화면)을 다시 그린다 */
export function setLang(code: string) {
  if (!byCode.has(code) || code === lang) return;
  lang = code; dict = byCode.get(code)!.dict;
  try { localStorage.setItem(KEY, code); } catch { }
  setHtml(); nf.clear(); df.clear(); pr.clear();
  for (const f of [...subs]) try { f(); } catch (e) { console.warn('[i18n]', e); }
}
export function onLang(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
/** React: 언어가 바뀌면 다시 그린다. 지금 언어 코드를 돌려준다 */
export const useLang = () => useSyncExternalStore(onLang, getLang, getLang);

const warned = new Set<string>();
const IN_APP = import.meta.env.MODE === 'web' && typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
function raw(key: string): string | undefined {
  if (IN_APP) { const k = key + '.app', a = dict[k] ?? (en as Dict)[k] ?? (ko as Dict)[k]; if (a !== undefined) return a; }
  const v = dict[key] ?? (en as Dict)[key] ?? (ko as Dict)[key];
  if (v === undefined && !warned.has(key)) { warned.add(key); console.warn('[i18n] 없는 키', key); }
  return v;
}
const fill = (s: string, vars?: Record<string, unknown>) => vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => k in vars ? String(vars[k] ?? '') : m) : s;

/** 글자 꺼내기. vars 는 {name} 자리에 들어간다. 빠진 키는 영어 → 한국어 순으로 대신 쓰고, 그래도 없으면 빈 글자 */
export function t(key: string, vars?: Record<string, unknown>): string {
  return fill(raw(key) ?? '', vars);
}
const pr = new Map<string, Intl.PluralRules>();
/** 복수형: key.one / key.other … 중 Intl.PluralRules 로 골라 쓴다. {count} 에 n 이 들어간다 */
export function tn(key: string, count: number, vars?: Record<string, unknown>): string {
  let rules = pr.get(lang); if (!rules) { rules = new Intl.PluralRules(locale()); pr.set(lang, rules); }
  const form = rules.select(count);
  const v = dict[`${key}.${form}`] ?? dict[`${key}.other`] ?? (en as Dict)[`${key}.${new Intl.PluralRules('en').select(count)}`] ?? (en as Dict)[`${key}.other`] ?? (ko as Dict)[`${key}.other`];
  if (v === undefined) return t(key, { count, ...vars });
  return fill(v, { count, ...vars });
}
/** 키가 있는지 (명령 설명처럼 없을 수도 있는 것) */
export const has = (key: string) => key in dict || key in (en as Dict) || key in (ko as Dict);

const nf = new Map<string, Intl.NumberFormat>();
/** 숫자를 그 언어 꼴로 */
export function fmtNum(n: number, opts?: Intl.NumberFormatOptions) {
  const k = JSON.stringify(opts || {}); let f = nf.get(k); if (!f) { f = new Intl.NumberFormat(locale(), opts); nf.set(k, f); }
  return f.format(n);
}
const df = new Map<string, Intl.DateTimeFormat>();
/** 날짜 · 시각을 그 언어 꼴로 */
export function fmtDate(d: Date | number | string, opts: Intl.DateTimeFormatOptions) {
  const k = JSON.stringify(opts); let f = df.get(k); if (!f) { f = new Intl.DateTimeFormat(locale(), opts); df.set(k, f); }
  return f.format(new Date(d));
}
