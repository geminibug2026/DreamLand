// 웹 검색: 답장 전에 찾아본 것을 프롬프트에 넣어 준다 (모델의 종류와 상관없이 쓸 수 있다).
// 키가 필요 없는 곳만 쓴다 — DuckDuckGo · 위키백과 · 직접 운영하는 SearXNG
import { S } from './core';
import { Server } from './server';
import { getLang } from '../i18n';

export interface Hit { title: string; url: string; text: string }
export interface SearchCfg { provider: 'ddg' | 'wiki' | 'searxng'; url: string; mode: 'off' | 'auto'; count: number }

const DEFAULTS: SearchCfg = { provider: 'ddg', url: '', mode: 'off', count: 5 };
export function searchCfg(): SearchCfg {
  const st = S.settings as unknown as { search?: Partial<SearchCfg> };
  const c = (st.search ||= {}) as SearchCfg;
  for (const k of Object.keys(DEFAULTS) as (keyof SearchCfg)[]) if (c[k] === undefined || c[k] === null) (c as unknown as Record<string, unknown>)[k] = DEFAULTS[k];
  return c;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
// 결과 속의 {{…}} 가 매크로로 풀리지 않게 벌려 둔다
const clean = (s: unknown) => String(s ?? '').replace(/\{\{/g, '{ {').replace(/\s+/g, ' ').trim();
const plain = (html: string) => clean(new DOMParser().parseFromString(`<body>${html}`, 'text/html').body.textContent);

async function grab(url: string, signal?: AbortSignal, headers: Record<string, string> = {}): Promise<Response> {
  const r = await Server.proxy({ url, method: 'GET', headers }, signal);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

/** DuckDuckGo 의 글자만 있는 결과 화면을 읽는다 */
export function parseDdg(html: string): Hit[] {
  const doc = new DOMParser().parseFromString(html, 'text/html'), out: Hit[] = [];
  for (const a of doc.querySelectorAll<HTMLAnchorElement>('a.result__a')) {
    let url = a.getAttribute('href') || '';
    const m = url.match(/[?&]uddg=([^&]+)/); if (m) { try { url = decodeURIComponent(m[1]); } catch { /* 그대로 둔다 */ } }
    if (url.startsWith('//')) url = 'https:' + url;
    if (!/^https?:/.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;   // 광고는 뺀다
    const box = a.closest('.result') || a.parentElement?.parentElement;
    out.push({ title: clean(a.textContent), url, text: clean(box?.querySelector('.result__snippet')?.textContent) });
  }
  return out;
}
async function ddg(q: string, signal?: AbortSignal) {
  const r = await grab('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), signal, { 'User-Agent': UA, Accept: 'text/html' });
  return parseDdg(await r.text());
}
async function wiki(q: string, n: number, signal?: AbortSignal) {
  const lang = getLang().startsWith('ko') ? 'ko' : getLang().startsWith('zh') ? 'zh' : 'en';
  // origin=* : 서버 없이 브라우저에서 바로 불러도 된다
  const r = await grab(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${n}&srsearch=${encodeURIComponent(q)}`, signal);
  const j = await r.json() as { query?: { search?: { title: string; snippet: string }[] } };
  return (j.query?.search || []).map(x => ({ title: x.title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(x.title.replace(/ /g, '_'))}`, text: plain(x.snippet) }));
}
async function searxng(q: string, base: string, signal?: AbortSignal) {
  const root = base.trim().replace(/\/+$/, '').replace(/\/search$/, ''); if (!/^https?:\/\//.test(root)) throw new Error('SearXNG URL');
  const r = await grab(`${root}/search?format=json&q=${encodeURIComponent(q)}`, signal, { Accept: 'application/json' });
  const j = await r.json() as { results?: { title?: string; url?: string; content?: string }[] };
  return (j.results || []).map(x => ({ title: clean(x.title), url: String(x.url || ''), text: clean(x.content) }));
}

const cache = new Map<string, { at: number; hits: Hit[] }>();
/** 찾아본다. 같은 말은 10분 동안 다시 묻지 않는다 (다시 생성할 때 등) */
export async function webSearch(query: string, signal?: AbortSignal): Promise<Hit[]> {
  const c = searchCfg(), q = clean(query).slice(0, 300); if (!q) return [];
  const n = Math.min(10, Math.max(1, Number(c.count) || 5)), key = `${c.provider}|${c.url}|${n}|${q}`, had = cache.get(key);
  if (had && Date.now() - had.at < 600_000) return had.hits;
  // 20초 안에 답이 없으면 그만둔다
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 20_000), stop = () => ac.abort();
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const all = c.provider === 'wiki' ? await wiki(q, n, ac.signal) : c.provider === 'searxng' ? await searxng(q, c.url, ac.signal) : await ddg(q, ac.signal);
    const hits = all.filter(h => h.title && h.url).slice(0, n).map(h => ({ ...h, text: h.text.slice(0, 500) }));
    cache.set(key, { at: Date.now(), hits }); if (cache.size > 30) cache.delete(cache.keys().next().value as string);
    return hits;
  } finally { clearTimeout(tm); signal?.removeEventListener('abort', stop); }
}

/** 프롬프트 · 명령 결과에 넣는 글 */
export const hitsText = (hits: Hit[]) => hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.text ? h.text + '\n' : ''}${h.url}`).join('\n\n');

/** 메시지에서 검색할 말을 고른다: 지문(*…*)과 코드 · 태그를 빼고 앞부분만 */
export function queryFrom(text: string): string {
  const s = clean(String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/<[^<>]*>/g, ' ').replace(/\*[^*\n]*\*/g, ' ').replace(/[*_`#>"“”]/g, ' '));
  return s.slice(0, 160);
}
