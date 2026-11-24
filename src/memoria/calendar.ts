// 작중 달력 · 날 세기 · 장면 카드 · 작가 계획의 누설 검사 — 모두 순수 함수 (모델을 부르지 않는다)
import type { Beat, Tracker } from './types';

/* ------------------------------------------------------------
 * 작중 날짜 읽기
 *
 * 상태창의 "언제" 글에서 달력 날짜만 읽는다. "3/10"처럼 연도도 없는 숫자 쌍은 점수 · 진행도일 때가 많아 읽지 않고,
 * "3일차 · Day 3"처럼 날을 세는 말은 날짜가 아니다 (이야기 시계가 따로 센다).
 * base: 앞서 읽은 날짜 — 연도가 없는 "10월 18일"은 그 해로, 두 자리 연도는 그 세기로 읽는다.
 * ------------------------------------------------------------ */
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');
const realDate = (y: number, m: number, d: number) => { if (!(y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return ''; const t = new Date(Date.UTC(2000, m - 1, d)); t.setUTCFullYear(y); return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}` : ''; };
const century = (two: number, base?: string | null) => { const by = base ? +base.slice(0, 4) : 0; if (!by) return 2000 + two; const c = Math.floor(by / 100) * 100, cands = [c - 100 + two, c + two, c + 100 + two]; return cands.sort((a, b) => Math.abs(a - by) - Math.abs(b - by))[0]; };

/** 글에서 달력 날짜 하나를 읽어 'YYYY-MM-DD' 로. 못 읽으면 '' */
export function parseStoryDate(text: unknown, base?: string | null): string {
    const s = String(text ?? '').normalize('NFKC'); if (!s.trim()) return '';
    let m: RegExpMatchArray | null;
    if ((m = s.match(/(?<![\d.])(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})(?![\d])/))) return realDate(+m[1], +m[2], +m[3]);
    if ((m = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) return realDate(+m[1], +m[2], +m[3]);
    if ((m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/))) return realDate(+m[1], +m[2], +m[3]);
    if ((m = s.match(/(?<![\d.:])(\d{2})\s*[-.]\s*(\d{1,2})\s*[-.]\s*(\d{1,2})(?![\d:])/))) return realDate(century(+m[1], base), +m[2], +m[3]);
    const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
    if ((m = s.match(new RegExp(`\\b${mon}\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'i')))) { const y = m[3] ? +m[3] : base ? +base.slice(0, 4) : 0; return y ? realDate(y, MONTHS[m[1].toLowerCase()], +m[2]) : ''; }
    if ((m = s.match(new RegExp(`\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${mon}(?:,?\\s+(\\d{4}))?`, 'i')))) { const y = m[3] ? +m[3] : base ? +base.slice(0, 4) : 0; return y ? realDate(y, MONTHS[m[2].toLowerCase()], +m[1]) : ''; }
    if (base && (m = s.match(/(\d{1,2})\s*[월月]\s*(\d{1,2})\s*[일日]/))) {   // 연도 없는 날짜 — 앞 날짜의 해로. 12월에서 1월로 넘어갔으면 다음 해
        const by = +base.slice(0, 4), bm = +base.slice(5, 7), y = +m[1] < bm && bm - +m[1] >= 6 ? by + 1 : by; return realDate(y, +m[1], +m[2]);
    }
    return '';
}
const toUtc = (iso: string) => { const t = new Date(Date.UTC(2000, +iso.slice(5, 7) - 1, +iso.slice(8, 10))); t.setUTCFullYear(+iso.slice(0, 4)); return t.getTime(); };
export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && realDate(+v.slice(0, 4), +v.slice(5, 7), +v.slice(8, 10)) === v;
/** b - a (일) */
export const dayDiff = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
export function addDays(iso: string, days: number): string { const t = new Date(toUtc(iso) + Math.round(days) * 86400000); return `${String(t.getUTCFullYear()).padStart(4, '0')}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }

/**
 * 달력 날짜가 적힌 두 턴 사이의 날짜 차이가 그 사이에 센 날(days)보다 크면, 모자란 만큼을 뒤쪽 턴에 더한다 — 이야기 시계가 달력을 따라가게.
 * ("두 달 뒤"를 사서가 놓쳐 시계가 사흘에 머무는 일을 막는다. 날짜가 거꾸로 간 턴(회상 · 오타)은 건너뛴다.) 여러 번 불러도 같다. 고친 턴 수를 돌려준다
 */
export function syncDaysToDates(turns: { date?: string; days?: number }[] | null | undefined): number {
    let prev = '', sum = 0, changed = 0;
    for (const t of turns || []) {
        sum += Math.max(0, Number(t.days) || 0);
        if (!isIsoDate(t.date)) continue;
        if (!prev) { prev = t.date; sum = 0; continue; }
        const gap = dayDiff(prev, t.date); if (gap < 0) continue;
        if (gap <= 36500 && gap - sum >= 1) { t.days = (Number(t.days) || 0) + (gap - sum); changed++; }
        prev = t.date; sum = 0;
    }
    return changed;
}

/**
 * 턴마다의 작중 날짜. turns: { msgId, date(상태창에서 읽은 날짜), days(그 턴에서 흐른 날) }, fixes: 직접 고친 날짜 (msgId → 날짜).
 * 고친 날짜가 있으면 그 턴부터 그 날짜로 잇는다 — 그 뒤에 읽힌 날짜는 같은 만큼 옮기고, 날짜가 없는 턴은 흐른 날만큼 넘긴다. 날짜를 모르는 앞부분은 ''
 */
export function storyDatesOf(turns: { msgId?: string; date?: string; days?: number }[], fixes?: { msgId: string; date: string }[] | null): string[] {
    const fx = new Map((fixes || []).filter(f => f && isIsoDate(f.date)).map(f => [f.msgId, f.date])), out: string[] = [];
    let cur = '', shift = 0, carry = 0;
    for (const t of turns) {
        const fix = t.msgId ? fx.get(t.msgId) : undefined, read = isIsoDate(t.date) ? t.date : '';
        if (fix) { shift = read ? dayDiff(read, fix) : 0; cur = fix; carry = 0; }
        else if (read) { cur = addDays(read, shift); carry = 0; }
        else if (cur) { carry += Math.max(0, Number(t.days) || 0); const whole = Math.floor(carry); if (whole >= 1) { cur = addDays(cur, whole); carry -= whole; } }
        out.push(cur);
    }
    return out;
}

/* ------------------------------------------------------------
 * 날 세기 · D-day · 주기 — 저장한 날짜에서 그때그때 센다 (적어 둔 숫자가 낡지 않는다)
 * ------------------------------------------------------------ */
/** 날 세기 한 줄의 글 (모델에게 가는 글이라 영어). 셀 수 없으면 '' */
export function trackerText(tk: Tracker, today: string): string {
    if (!tk || tk.disabled || !isIsoDate(today)) return '';
    if (tk.type === 'count') { if (!isIsoDate(tk.start)) return ''; const n = dayDiff(tk.start, today) + (tk.firstDay === 0 ? 0 : 1); return n >= 0 ? `${tk.label}: day ${n}` : ''; }
    if (tk.type === 'until') { if (!isIsoDate(tk.target)) return ''; const left = dayDiff(today, tk.target); return `${tk.label}: ${left > 0 ? `D-${left}` : left === 0 ? 'D-day' : `D+${-left}`}`; }
    if (tk.type === 'cycle') {
        const every = Math.max(1, Math.round(Number(tk.every) || 0)), length = Math.max(1, Math.round(Number(tk.length) || 1)), starts = (tk.starts || []).filter(isIsoDate).filter(s => dayDiff(s, today) >= 0).sort();
        if (!starts.length || !(Number(tk.every) > 0)) return '';
        let s = starts[starts.length - 1]; const gone = dayDiff(s, today); if (gone >= every) s = addDays(s, Math.floor(gone / every) * every);
        const k = dayDiff(s, today);
        return k < length ? `${tk.label}: in progress (day ${k + 1} of ${length})` : `${tk.label}: next in D-${every - k}`;
    }
    return '';
}
/** 장부에 싣는 한 줄. present: 지금 장면에 있는 사람(소문자 · 공백 없는 키), key: 이름 → 키 */
export function trackerLineOf(trackers: Tracker[] | null | undefined, today: string, present: Set<string>, key: (n: string) => string, max = 6): string {
    if (!isIsoDate(today)) return '';
    const on = (trackers || []).filter(tk => tk && !tk.disabled && tk.inject !== 'never' && (tk.inject === 'always' || !(tk.people || []).length || (tk.people || []).some(p => present.has(key(p)))));
    const bits = [...on.filter(tk => tk.inject === 'always'), ...on.filter(tk => tk.inject !== 'always')].map(tk => { const txt = trackerText(tk, today); return txt ? `${(tk.people || []).length ? `${tk.people!.join(' & ')} — ` : ''}${txt}` : ''; }).filter(Boolean).slice(0, max);
    return bits.length ? `(Counted days as of ${today} in-story — ${bits.join(' · ')})` : '';
}

/* ------------------------------------------------------------
 * 장면 카드 — 옛 묶음을 떠올릴 때, 그때 있었던 일을 순서대로 펼친다
 * ------------------------------------------------------------ */
/** 실을 대목 고르기: 순서를 지키고, 넘치면 전환점(major)과 대사가 있는 대목을 먼저 남긴다 */
export function pickBeats(beats: Beat[], max = 8): Beat[] {
    const all = (beats || []).filter(b => b && b.text); if (all.length <= max) return all;
    const rank = (b: Beat) => (b.major ? 2 : 0) + (b.q ? 1 : 0), keep = new Set([...all].map((b, i) => ({ b, i })).sort((x, y) => rank(y.b) - rank(x.b) || x.i - y.i).slice(0, max).map(x => x.i));
    return all.filter((_, i) => keep.has(i));
}
/** 카드의 줄들. away(with): 그 대목에 없던, 지금 장면의 사람들 · quote(b): 실을 대사(없으면 '') */
export function beatLines(beats: Beat[], { away = () => [], quote = b => b.q || '', maxChars = 1500 }: { away?: (b: Beat) => string[]; quote?: (b: Beat) => string; maxChars?: number } = {}): string[] {
    const out: string[] = []; let used = 0;
    for (const b of beats) {
        const q = quote(b), gone = away(b), line = `- ${b.major ? '★ ' : ''}${b.text}${q ? ` — ${b.by ? `${b.by}${b.to ? ` to ${b.to}` : ''}: ` : ''}"${q}"` : ''}${gone.length ? ` [${gone.join(', ')} not there]` : ''}`;
        if (used + line.length > maxChars && out.length) break;
        out.push(line); used += line.length;
    }
    return out;
}

/* ------------------------------------------------------------
 * 작가 계획 — 답은 가리고 "가린 줄"만 싣는다. 가린 줄이 답을 흘리는지 글자로 본다
 * ------------------------------------------------------------ */
const GENERIC = new Set(('real reason truth secret identity cause behind true actual hidden mystery who whom what why how when where the and for with that this from into about still not yet must stay keep leave left '
    + '진짜 정체 이유 비밀 진실 원인 누구 무엇 어째서 아직 그대로 밝히지 말것 사실 까닭').split(' '));
const JOSA = /(으로|에서|에게|한테|까지|부터|처럼|보다|이라는|라는|이라고|라고|에는|에도|은|는|이|가|을|를|의|에|로|와|과|도|만)$/;
function planWords(text: unknown, names: string[]): Set<string> {
    const skip = new Set(names.map(n => n.toLowerCase())), out = new Set<string>();
    for (const raw of String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []) {
        const latin = /^[a-z0-9']+$/.test(raw); let w = latin ? raw.replace(/(?:'s|es|s|ed|ing)$/, '') : raw.replace(JOSA, '');
        if (w.length < 2 || GENERIC.has(raw) || GENERIC.has(w) || skip.has(raw) || skip.has(w) || [...skip].some(n => n.includes(raw) || n.includes(w))) continue;
        if (!latin && w.length > 3) w = w.slice(0, 3);
        out.add(w);
    }
    return out;
}
/**
 * 가린 줄이 계획의 답을 흘리는가. names: 이야기 속 사람 이름 (겹쳐도 뜻이 없다).
 * 계획에만 있는 고유한 말(대문자로 시작하는 낱말 · 두 자리 이상 숫자)이 가린 줄에 그대로 있거나, 가린 줄의 낱말 대부분이 계획의 낱말이면 흘린 것이다.
 * 소재 한두 낱말("손목의 흉터")이 겹치는 것은 괜찮다
 */
export function veilLeaks(veil: unknown, plan: unknown, names: string[] = []): boolean {
    const v = String(veil ?? '').trim(), p = String(plan ?? ''); if (!v) return true;
    const nameSet = new Set(names.map(n => n.toLowerCase()));
    for (const w of p.match(/\b[A-Z][a-z]{2,}\b|\d{2,}/g) || []) { if (nameSet.has(w.toLowerCase()) || /^(The|This|That|She|He|They|When|After|Before|But|And|His|Her)$/.test(w)) continue; if (new RegExp(`(?<![\\p{L}\\p{N}])${w}(?![\\p{L}\\p{N}])`, 'u').test(v) && !p.trimStart().startsWith(w)) return true; }
    const vw = planWords(v, names), pw = planWords(p, names); if (!vw.size) return false;
    let shared = 0; for (const w of vw) if (pw.has(w)) shared++;
    return shared >= 3 && shared / vw.size >= 0.6 || (pw.size >= 3 && shared / pw.size >= 0.7);
}
