// 장기기억 — 「읽는 말로 보기」의 순수 부분: 무엇을 번역할지 가리고, 묶고, 답을 읽고, 맡아 둔 번역의 크기를 지킨다
// 화면(ui/ReaderView.tsx)이 가져다 쓴다. 모델 호출 · 저장은 여기서 하지 않는다

/** 맡아 둔 번역 한 줄 (t = 번역문, at = 마지막으로 쓴 때) */
export interface ReaderHit { t: string; at: number }
export type ReaderItems = Record<string, ReaderHit>;
/** kv 저장소의 한 줄 — id 는 `memview:<대화 id>` */
export interface ReaderRow { id: string; v: 1; items: ReaderItems }
export const READER_MAX_BYTES = 300 * 1024;   // 대화 하나가 맡아 두는 번역의 상한 — 넘으면 오래 안 쓴 것부터 버린다
export const READER_LONG = 280;               // 이보다 긴 글은 묶지 않고 따로 보낸다
export const READER_BATCH_CHARS = 1800;       // 한 묶음에 담는 글자 수
export const READER_BATCH_ITEMS = 14;         // 한 묶음에 담는 항목 수
export const READER_TOO_LONG = 8000;          // 이보다 긴 글은 번역하지 않는다 (한 번의 답에 담기지 않는다)

export const READER_LANGS: Record<string, string> = { ko: 'Korean', en: 'English', 'zh-CN': 'Simplified Chinese' };
/** 번역 지시 — 모델에게 가는 글이라 영어로 쓴다. {LANG} 은 읽는 말 */
export const READER_PROMPT = `You are translating entries of a story archive into {LANG} so its reader can skim them.

INPUT: one JSON object. Each key is an entry id, each value is the entry text.
OUTPUT: exactly one JSON object with the same ids; each value is that entry rendered in {LANG}. Nothing before "{" or after "}" — no notes, no code fences.

Rules:
1. Names stay untouched. Personal names, nicknames, place names, organization names, titles of works and any other proper noun are copied exactly as written in the entry — never translated, transliterated or respelled. The names listed under KEEP AS WRITTEN are examples of this; treat unlisted proper nouns the same way.
2. Structure stays untouched. Keep line breaks, list markers ("-", "•"), separators (" · ", "→", "=") and all-caps line labels such as WHEN:, PLOT:, SHIFTS:, OPEN: exactly where they are, and translate only the wording around them. Keep numbers, dates and markers like t12, #34, ★ as they are.
3. Translate the meaning plainly and completely. Add nothing, drop nothing, do not summarize or explain. Quoted speech is translated as natural speech and keeps its quotation marks.
4. An entry that is already in {LANG} is returned unchanged.
5. Every id in the input appears once in the output.`;
export const readerSystem = (lang: string) => READER_PROMPT.replace(/\{LANG\}/g, READER_LANGS[lang] || lang);
/** 보내는 글 — 그대로 둘 이름들과 항목들. 항목의 id 는 묶음 안에서만 쓰는 번호 */
export function readerUser(texts: string[], names: string[] = []): string {
  const keep = [...new Set(names.map(n => String(n || '').trim()).filter(Boolean))].slice(0, 40);
  const body: Record<string, string> = {}; texts.forEach((t, i) => { body[String(i + 1)] = t; });
  return `${keep.length ? `KEEP AS WRITTEN: ${keep.join(', ')}\n\n` : ''}${JSON.stringify(body)}`;
}

/** 글의 지문 (원문이 한 글자라도 바뀌면 다른 번역으로 본다) */
export function textHash(s: string): string {
  let a = 5381, b = 52711;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = ((a << 5) + a + c) | 0; b = ((b << 5) + b ^ c) | 0; }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36) + s.length.toString(36);
}
export const readerKey = (text: string, lang: string) => `${lang}:${textHash(text)}`;

/** 이 글을 읽는 말로 옮길 필요가 있는가 — 이미 그 말로 적혀 있으면 요청을 아낀다. 글자가 거의 없는 글(숫자 · 기호)도 보내지 않는다 */
export function needsReading(text: unknown, lang: string): boolean {
  const s = String(text ?? ''); if (s.length > READER_TOO_LONG) return false;
  let hangul = 0, latin = 0, han = 0, kana = 0, other = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0xac00 && c <= 0xd7a3) hangul++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f)) latin++;
    else if (c >= 0x4e00 && c <= 0x9fff) han++;
    else if (c >= 0x3040 && c <= 0x30ff) kana++;
    else if (c > 0x2ff && /\p{L}/u.test(ch)) other++;
  }
  // 로마자는 낱말 하나가 여러 글자라 무게를 덜어 견준다
  const lat = latin / 3, all = hangul + lat + han + kana + other; if (all < 1.5) return false;
  if (lang === 'ko') return hangul / all < 0.5;
  if (lang === 'en') return (hangul + han + kana + other) / all > 0.25;
  if (lang === 'zh-CN') return han / all < 0.5 || kana > 0;
  return true;
}

/** 번역할 글들을 묶음으로 — 짧은 글은 여럿을 한 번에, 긴 글은 하나씩. 들어온 순서를 지킨다 (화면 위쪽부터 채워진다) */
export function packBatches(texts: string[], { long = READER_LONG, chars = READER_BATCH_CHARS, items = READER_BATCH_ITEMS }: { long?: number; chars?: number; items?: number } = {}): string[][] {
  const out: string[][] = []; let cur: string[] = [], size = 0;
  const flush = () => { if (cur.length) out.push(cur); cur = []; size = 0; };
  for (const t of texts) {
    if (t.length > long) { out.push([t]); continue; }
    if (cur.length >= items || size + t.length > chars) flush();
    cur.push(t); size += t.length;
  }
  flush();
  return out;
}
/** 답에 쓸 토큰 어림 — 번역문은 원문보다 길어질 수 있다 (한글 · 한자는 글자마다 토큰이 든다) */
export const replyBudget = (texts: string[]) => Math.max(600, Math.min(6000, Math.round(texts.reduce((n, t) => n + t.length, 0) * 1.6) + 200 + texts.length * 12));

/** 모델의 답에서 번역을 읽는다 — 순번대로 번역문 또는 null (빠졌거나 비었거나 터무니없이 긴 것). 답을 읽을 수 없으면 전부 null */
export function readReply(reply: unknown, texts: string[]): (string | null)[] {
  const none = texts.map(() => null);
  let s = String(reply ?? '').replace(/<(think|thinking|thought|reasoning)>[\s\S]*?<\/\1>/gi, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return none;
  s = s.slice(a, b + 1);
  let obj: unknown; try { obj = JSON.parse(s); } catch { return none; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return none;
  return texts.map((src, i) => {
    const v = (obj as Record<string, unknown>)[String(i + 1)]; if (typeof v !== 'string') return null;
    const t = v.trim(); if (!t || t.length > src.length * 5 + 200) return null;
    // 줄 수가 크게 달라졌으면 구조가 깨진 것 — 요약의 WHEN/PLOT 줄이 사라진 번역은 쓰지 않는다
    const lines = (x: string) => x.split('\n').filter(l => l.trim()).length;
    if (lines(src) > 1 && Math.abs(lines(src) - lines(t)) > Math.max(1, Math.floor(lines(src) / 3))) return null;
    return t;
  });
}

const bytes = (s: string) => new TextEncoder().encode(s).length;
/** 맡아 둔 번역이 상한을 넘으면 오래 안 쓴 것부터 버린다. 반환: 버린 수 */
export function trimItems(items: ReaderItems, max = READER_MAX_BYTES): number {
  const cost = (k: string, v: ReaderHit) => bytes(k) + bytes(v.t) + 40;   // 따옴표 · at · 괄호의 어림
  let total = 0; const rows = Object.entries(items).map(([k, v]) => { const c = cost(k, v); total += c; return { k, c, at: v.at || 0 }; });
  if (total <= max) return 0;
  rows.sort((x, y) => x.at - y.at); let n = 0;
  for (const r of rows) { if (total <= max) break; delete items[r.k]; total -= r.c; n++; }
  return n;
}
