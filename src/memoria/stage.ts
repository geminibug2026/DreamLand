/**
 * 장기기억 — 지금 무대 위의 사정을 모델이 알아보기 쉽게 정리하는 순수 함수 (화면 · 저장소에 의존하지 않는다. 모델도 부르지 않는다).
 *
 * - 이야기 밖 대화(OOC): 사용자가 이야기를 멈추고 따로 건넨 말과, 그에 대한 AI 의 이야기 밖 대답을 가린다
 * - 서로 부르는 말: 대사 속 부름말("하린아", "선배님,")을 모아 누가 누구를 어떻게 부르는지 센다
 * - 약속 · 기한: 작중 시간으로 남은 날을 센다 ("D-2", "3 days overdue")
 * - 장면 인물의 지금 모습: 상태 보드의 칸들을 사람마다 한 줄로 묶는다
 */

/* ------------------------------------------------------------
 * 이야기 밖 대화 (OOC)
 * ------------------------------------------------------------ */

/** 이야기 밖이라는 표시로 시작하는가 — "OOC", "(OOC", "[OOC", "((" (앞의 공백 · 태그는 건너뛴다) */
const OOC_START = /^(?:\(\(|[(\[（［【]\s*ooc\b|ooc\b)/i;
const leadIn = (text: unknown) => String(text ?? '').replace(/^(?:\s|<[^<>]{0,200}>)+/, '');
export function isOocText(text: unknown): boolean {
    return OOC_START.test(leadIn(text));
}

/**
 * 이야기 밖 질문에 대한 답처럼 보이는가 — 스스로 OOC 표시로 시작하거나, 글 전체가 괄호 하나에 싸여 있다.
 * 이야기 밖 질문 바로 뒤의 답에만 쓴다 (괄호로 싼 이야기 답장은 드물지만, 질문과 짝일 때만 본다)
 */
export function looksOocReply(text: unknown): boolean {
    const t = leadIn(text).trim();
    if (!t) return false;
    if (OOC_START.test(t)) return true;
    const m = t.match(/^([(（\[［])+/);
    if (!m) return false;
    const close: Record<string, string> = { '(': ')', '（': '）', '[': ']', '［': '］' };
    const want = close[m[0][0]];
    if (!t.endsWith(want)) return false;
    // 괄호가 중간에 닫혔다 다시 열리면(괄호 + 이야기 + 괄호) 하나로 싼 것이 아니다
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (c === m[0][0]) depth++;
        else if (c === want && --depth === 0 && i < t.length - 1 && t.slice(i + 1).replace(/[)）\]］\s]/g, '')) return false;
    }
    return true;
}

/* ------------------------------------------------------------
 * 서로 부르는 말 — 대사에서 모은다 (모델을 부르지 않는다)
 *
 * 대사 맨 앞이나 맨 끝의 부름말만 본다: "하린아, 잠깐만." / "그만해, 선배." / "Mina, wait."
 * 이름이 든 부름말은 그 사람을 부른 것이고, 호칭(오빠 · 선배님 · sir)은 둘만 있는 대화에서 글쓴이가 한 말일 때만 상대를 부른 것으로 친다.
 * 말한 사람은 대사 바로 뒤의 서술("…" 보라가 외쳤다)에서 찾고, 없으면 메시지를 쓴 사람으로 본다 — 서술에 다른 사람이 나오면 그 대사는 세지 않는다.
 * 한 번 나온 말은 우연일 수 있다 — 서로 다른 메시지 두 번 이상 나온 것만 쓴다.
 * ------------------------------------------------------------ */

export interface AddressPerson { name: string; forms: string[] }
export interface AddressHit { from: string; to: string; term: string }
export interface AddressRow extends AddressHit { count: number; last: number }

/** 이름 뒤에 붙어 부름말이 되는 꼬리 (하린아 · 민호야 · 은영 씨 · 민호 선배 · 美咲ちゃん) */
const NAME_TAIL = /^(?:아|야|이|씨|님|군|양|선배(?:님)?|언니|오빠|누나|형(?:님)?|선생님|쌤|ちゃん|さん|くん|様|さま|君)$/;
/** 이름 앞에 붙는 호칭 (Miss Lee · Dr. Kim · 김 대리처럼 뒤에 붙는 것은 NAME_TAIL 이 본다) */
const NAME_HEAD = /^(?:miss|mr|mrs|ms|dr|lady|lord|sir|captain|master|professor|prof)\.?$/i;
/** 이름 없이 상대를 부르는 말 — 둘만 있는 대화에서만 상대로 본다 */
const TITLE_WORDS = new Set([
    '오빠', '언니', '형', '누나', '형님', '선배', '선배님', '후배', '아가씨', '도련님', '주인님', '선생님', '쌤', '사장님', '대표님', '팀장님', '부장님', '과장님', '실장님', '교수님',
    '아저씨', '아줌마', '이모', '삼촌', '자기', '자기야', '여보', '당신', '아빠', '엄마', '아버지', '어머니', '할머니', '할아버지', '공주님', '왕자님', '전하', '폐하', '마마', '아씨', '나리', '대감',
    '꼬맹이', '아기', '애기', '귀염둥이', '바보', '멍청아', '꼬마', '손님', '보스', '마스터', '주군', '각하', '도령',
    'sir', "ma'am", 'madam', 'boss', 'master', 'captain', 'darling', 'honey', 'sweetheart', 'babe', 'baby', 'dear', 'kid', 'love', 'princess', 'my lord', 'my lady', 'your highness', 'your majesty',
    'お兄ちゃん', 'お姉ちゃん', '先輩', '先生', 'ご主人様', 'お嬢様',
]);
const lowc = (s: unknown) => String(s ?? '').toLowerCase().trim();

/** 글 속 대사들과 그 자리 (큰따옴표 · 곧은 따옴표 · 낫표) — 글에 나온 차례대로 */
export function dialogueSpans(text: unknown): { bit: string; start: number; end: number }[] {
    const src = String(text ?? ''), out: { bit: string; start: number; end: number }[] = [];
    for (const re of [/"([^"\n]{1,400})"/g, /“([^”\n]{1,400})”/g, /「([^」\n]{1,400})」/g, /『([^』\n]{1,400})』/g]) for (const m of src.matchAll(re)) out.push({ bit: m[1], start: m.index!, end: m.index! + m[0].length });
    return out.sort((a, b) => a.start - b.start);
}
export function dialogueBits(text: unknown): string[] { return dialogueSpans(text).map(d => d.bit); }

/** 대사 바로 뒤의 서술에서 말한 사람을 찾는다 — '"…" 아리아가 말했다' · '"…" said Mina' · '"…" Mina said' */
function speakerAfter(after: string, people: AddressPerson[]): string {
    const a = after.replace(/^[\s,.]+/, '').slice(0, 40), la = lowc(a);
    for (const p of people) for (const f of [p.name, ...p.forms]) {
        const lf = lowc(f); if (lf.length < 2) continue;
        if (la.startsWith(lf) && /^(?:이|가|은|는|도|의|께서|,|\s+(?:said|asked|says|asks|replied|whispered|shouted)\b)/.test(a.slice(f.length))) return p.name;
        if (new RegExp(`^(?:said|asked|says|asks|replied|whispered|shouted)\\s+${lf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(a)) return p.name;
    }
    return '';
}

const WORD = '[^\\s,.!?…~"“”「」『』]';
const HEAD_RE = new RegExp(`^\\s*(${WORD}{1,12}(?:\\s${WORD}{1,10})?)\\s*[,!…~]`, 'u');
const TAIL_RE = new RegExp(`[,…]\\s*(${WORD}{1,12}(?:\\s${WORD}{1,10})?)\\s*[.!?~…]*\\s*$`, 'u');

/** 부름말 후보 하나를 사람에게 잇는다 — 이름이 든 것만, 또는 둘만 있는 대화의 호칭 */
function resolveTerm(term: string, people: AddressPerson[], partner: string): string {
    const t = term.trim(), lt = lowc(t);
    if (!t) return '';
    for (const p of people) {
        for (const f of [p.name, ...p.forms]) {
            const lf = lowc(f);
            if (lf.length < 2) continue;
            if (lt === lf) return p.name;
            if (lt.startsWith(lf) && NAME_TAIL.test(lt.slice(lf.length).trim())) return p.name;
            if (lt.endsWith(lf) && NAME_HEAD.test(lt.slice(0, lt.length - lf.length).trim())) return p.name;
        }
    }
    return partner && TITLE_WORDS.has(lt) ? partner : '';
}

/**
 * 한 메시지에서 부름말을 찾는다. speaker: 이 말을 한 사람, partner: 둘만 있는 대화의 상대 (없으면 호칭은 보지 않는다).
 * 자기 이름을 부르는 것(혼잣말 · 잘못 짚음)은 뺀다
 */
export function addressTermsIn(text: unknown, { speaker, people, partner = '' }: { speaker: string; people: AddressPerson[]; partner?: string }): AddressHit[] {
    if (!speaker) return [];
    const src = String(text ?? ''), spans = dialogueSpans(src), out: AddressHit[] = [], seen = new Set<string>();
    // 서술에 글쓴이 · 상대 말고 다른 사람이 나오면, 누가 말했는지 적히지 않은 대사는 누구 말인지 알 수 없다 — 세지 않는다
    let narration = src; for (const d of [...spans].reverse()) narration = narration.slice(0, d.start) + ' ' + narration.slice(d.end);
    const ln = lowc(narration), mine = new Set([lowc(speaker), lowc(partner)]);
    const crowded = people.some(p => !mine.has(lowc(p.name)) && [p.name, ...p.forms].some(f => lowc(f).length >= 2 && ln.includes(lowc(f))));
    for (const d of spans) {
        const named = speakerAfter(src.slice(d.end), people), who = named || (crowded ? '' : speaker);
        if (!who) continue;
        // 호칭(오빠 · 선배님)이 상대를 가리키는 것은 글쓴이 본인이 말했을 때뿐이다 (다른 인물의 호칭은 누구를 부르는지 모른다)
        const pal = lowc(who) === lowc(speaker) ? partner : '', me = lowc(who);
        for (const re of [HEAD_RE, TAIL_RE]) {
            const m = d.bit.match(re); if (!m) continue;
            const term = m[1].replace(/[\s,.!?…~]+$/u, '').trim();
            if ([...term].length < 1 || term.length > 24) continue;
            const to = resolveTerm(term, people, pal);
            if (!to || lowc(to) === me) continue;
            const k = `${me}|${lowc(to)}|${lowc(term)}`;
            if (seen.has(k)) continue;
            seen.add(k); out.push({ from: who, to, term });
        }
    }
    return out;
}

/** 메시지별 부름말을 모아 센다 (같은 메시지 안의 반복은 한 번). at: 메시지 순번 — 최근에 쓴 것을 앞에 둔다 */
export function tallyAddress(perMessage: { at: number; hits: AddressHit[] }[]): AddressRow[] {
    const rows = new Map<string, AddressRow>();
    for (const { at, hits } of perMessage) {
        for (const h of hits) {
            const k = `${lowc(h.from)}|${lowc(h.to)}|${lowc(h.term)}`, r = rows.get(k);
            if (r) { r.count++; r.last = Math.max(r.last, at); } else rows.set(k, { ...h, count: 1, last: at });
        }
    }
    return [...rows.values()];
}

/**
 * 지금 장면에 함께 있는 두 사람 사이의 부름말만 골라 줄로 만든다.
 * present: 장면에 있는 사람(소문자 이름). known(from, to): 이미 관계선에 적힌 부르는 말 — 같은 말은 다시 적지 않는다.
 * 반환: [{ from, to, terms }] — 짝마다 최근에 쓴 것부터 두 개까지
 */
export function pickAddressLines(rows: AddressRow[], present: Set<string>, { minCount = 2, perPair = 2, max = 6, known = () => '' }: { minCount?: number; perPair?: number; max?: number; known?: (from: string, to: string) => string } = {}): { from: string; to: string; terms: string[] }[] {
    const pairs = new Map<string, { from: string; to: string; rows: AddressRow[]; last: number }>();
    for (const r of rows) {
        if (r.count < minCount || !present.has(lowc(r.from)) || !present.has(lowc(r.to))) continue;
        const have = lowc(known(r.from, r.to));
        if (have && have.includes(lowc(r.term))) continue;
        const k = `${lowc(r.from)}|${lowc(r.to)}`, p = pairs.get(k) || { from: r.from, to: r.to, rows: [], last: 0 };
        p.rows.push(r); p.last = Math.max(p.last, r.last); pairs.set(k, p);
    }
    return [...pairs.values()].sort((a, b) => b.last - a.last || a.from.localeCompare(b.from)).slice(0, max)
        .map(p => ({ from: p.from, to: p.to, terms: p.rows.sort((a, b) => b.last - a.last || b.count - a.count).slice(0, perPair).map(r => r.term) }))
        .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));   // 줄 순서는 이름 순 — 매 턴 같은 장면이면 같은 글이 나간다
}

/* ------------------------------------------------------------
 * 약속 · 기한 — 작중 시간으로 센다
 *
 * 기한은 { turn: 그 말이 나온 턴, in: 그때부터 며칠 뒤 } 로 둔다. 날짜는 턴마다 흐른 시간(이야기 시계)으로 잰다 —
 * 앞쪽 턴이 지워져도 다시 계산하면 맞는다.
 * ------------------------------------------------------------ */

export interface DueMark { turn: number; in: number }

/** 남은 날을 사람이 읽는 꼬리표로 (모델에게 가는 글이라 영어) */
export function dueLabel(remaining: number): string {
    if (!Number.isFinite(remaining)) return '';
    if (remaining > 0.75) return `D-${Math.max(1, Math.round(remaining))}`;
    if (remaining >= 1 / 24) return `D-day (in ~${Math.max(1, Math.round(remaining * 24))}h)`;
    if (remaining >= -0.5) return 'D-day (due now)';
    const n = Math.max(1, Math.round(-remaining));
    return `${n} day${n === 1 ? '' : 's'} overdue`;
}

/** 턴마다 흐른 날(days)에서 "그 턴이 끝난 때의 작중 날" 표를 만든다 — dayAt[i] = 0..i 턴에 흐른 날의 합 */
export function storyDays(daysPerTurn: (number | undefined)[]): number[] {
    const out: number[] = []; let acc = 0;
    for (const d of daysPerTurn) { acc += Number(d) || 0; out.push(acc); }
    return out;
}

/**
 * 기한이 있는 일을 가까운 것부터. rows: { due, touched(마지막으로 움직인 턴) } 를 가진 것들.
 * dayAt: storyDays 의 표, turnNow: 지금 턴 수. 기한을 넘긴 지 오래고(staleTurns 턴) 그사이 언급도 없으면 뺀다 — 잊힌 약속을 매 턴 떠올리게 하지 않는다
 */
export function pickDeadlines<R extends { due?: DueMark | null }>(rows: R[], { dayAt, turnNow, touched, staleTurns = 50, max = 5 }: { dayAt: number[]; turnNow: number; touched: (r: R) => number; staleTurns?: number; max?: number }): { row: R; remaining: number; label: string }[] {
    const now = dayAt.length ? dayAt[dayAt.length - 1] : 0, out: { row: R; remaining: number; label: string }[] = [];
    for (const row of rows) {
        const d = row.due; if (!d || !(Number(d.in) > 0) || !Number.isInteger(d.turn)) continue;
        const start = d.turn >= 0 && d.turn < dayAt.length ? dayAt[d.turn] : d.turn < 0 ? 0 : now;
        const remaining = start + Number(d.in) - now;
        if (remaining < -0.5 && turnNow - 1 - touched(row) > staleTurns) continue;
        out.push({ row, remaining, label: dueLabel(remaining) });
    }
    return out.sort((a, b) => Math.abs(a.remaining) - Math.abs(b.remaining)).slice(0, max);
}

/* ------------------------------------------------------------
 * 장면 인물의 지금 모습 — 상태 보드의 칸들을 사람마다 한 줄로
 * ------------------------------------------------------------ */

/** 칸 이름 → 읽기 쉬운 말과 순서 (모르는 칸은 칸 이름 그대로, 뒤쪽에) */
const LOOK_SLOTS: [string, string][] = [['location', 'at'], ['whereabouts', 'gone to'], ['activity', 'doing'], ['outfit', 'wearing'], ['injury', 'injured'], ['condition', 'condition'], ['holding', 'holding'], ['mood', 'mood'], ['goal', 'wants']];
const LOOK_ORDER = new Map(LOOK_SLOTS.map(([k], i) => [k, i]));
const LOOK_WORD = new Map(LOOK_SLOTS);
export interface LookSlot { slot: string; value: string; note?: string }
/** 한 사람의 지금 모습 한 줄: "- 하린: at 집무실 · wearing 젖은 셔츠 · injured 왼팔 (was: 멀쩡함)" */
export function personNowLine(name: string, slots: LookSlot[]): string {
    const bits = [...slots].sort((a, b) => (LOOK_ORDER.get(a.slot) ?? 99) - (LOOK_ORDER.get(b.slot) ?? 99) || a.slot.localeCompare(b.slot))
        .map(s => `${LOOK_WORD.get(s.slot) || s.slot.replace(/_/g, ' ')} ${s.value}${s.note ? ` ${s.note}` : ''}`);
    return bits.length ? `- ${name}: ${bits.join(' · ')}` : '';
}
