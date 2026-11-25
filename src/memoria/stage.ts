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

const SAY_EN = '(?:said|asked|says|asks|replied|whispered|shouted|murmured|muttered|answered|called|snapped|sighed|laughed)';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 대사 앞의 이름표 — 같은 줄 맨 앞의 '이름:' · '이름 |' · '**이름**:' */
function speakerTag(before: string, people: AddressPerson[]): string {
    const line = before.slice(before.lastIndexOf('\n') + 1).replace(/[*_`]/g, '').trim(), m = line.match(/^(.{1,30}?)\s*[:：|｜]$/u);
    if (!m) return '';
    const tag = lowc(m[1]);
    for (const p of people) if ([p.name, ...p.forms].some(f => lowc(f).length >= 2 && lowc(f) === tag)) return p.name;
    return '';
}
/** 대사 바로 앞의 서술에서 말한 사람을 찾는다 — '보라가 말했다. "…"' · 'Mina said, "…"'. 같은 문단, 대사 바로 앞 문장만 본다 (그 문장에 사람이 둘 이상이면 모른다) */
function speakerBefore(before: string, people: AddressPerson[]): string {
    const para = before.slice(before.lastIndexOf('\n') + 1), cut = Math.max(para.lastIndexOf('. ', para.length - 3), para.lastIndexOf('? '), para.lastIndexOf('! '), para.lastIndexOf('” '), para.lastIndexOf('" '));
    const sent = para.slice(cut + 1).slice(-90), ls = lowc(sent);
    if (!sent.trim() || !/[,:.…]\s*$|(?:다|요|며|고|서)\s*$/u.test(sent.trimEnd())) return '';
    const found: string[] = [];
    for (const p of people) for (const f of [p.name, ...p.forms]) {
        const lf = lowc(f); if (lf.length < 2) continue;
        const subj = new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc(lf)}(?:이|가|은|는|께서|와|과|랑|하고)(?![\\p{L}\\p{N}])|(?:^|[^\\p{L}\\p{N}])${esc(lf)}\\s+and\\s|(?:^|[^\\p{L}\\p{N}])${esc(lf)}\\s+${SAY_EN}\\b`, 'iu');
        if (subj.test(ls)) { if (!found.includes(p.name)) found.push(p.name); break; }
    }
    return found.length === 1 ? found[0] : '';
}
/**
 * 한 대사를 누가 했는가 — 규칙으로만 가린다 (모델을 부르지 않는다). 확실하지 않으면 ''.
 * 차례: 같은 줄의 이름표 → 대사 바로 뒤의 서술 → 바로 앞의 서술 → (서술에 다른 사람이 없을 때만) 메시지를 쓴 사람.
 * author: 메시지를 쓴 사람, crowded: 서술에 글쓴이 · 상대 말고 다른 사람이 나온다
 */
export function speakerOfSpan(src: string, span: { start: number; end: number }, people: AddressPerson[], author = '', crowded = false): string {
    const tag = speakerTag(src.slice(0, span.start), people); if (tag) return tag;
    // 대사 뒤에 나온 사람이 그 대사가 부른 사람이면 말한 사람이 아니라 반응한 사람이다 ('"도윤아, 어디 가?" 도윤이 돌아봤다')
    const after = speakerAfter(src.slice(span.end), people), called = after ? calledIn(src.slice(span.start + 1, span.end - 1), people) : '';
    if (after && lowc(after) !== lowc(called)) return after;
    const before = speakerBefore(src.slice(0, span.start), people);
    if (before && !(after && lowc(before) === lowc(called))) return before;
    return crowded || after ? '' : author;
}
/** 서술(대사를 뺀 글)에 글쓴이 · 상대 말고 다른 사람이 나오는가 */
export function crowdedNarration(src: string, people: AddressPerson[], mine: string[]): boolean {
    let narration = src; for (const d of [...dialogueSpans(src)].reverse()) narration = narration.slice(0, d.start) + ' ' + narration.slice(d.end);
    const ln = lowc(narration), own = new Set(mine.map(lowc));
    return people.some(p => !own.has(lowc(p.name)) && [p.name, ...p.forms].some(f => lowc(f).length >= 2 && ln.includes(lowc(f))));
}
/** 대사가 부른 사람 — 대사 맨 앞 · 맨 끝의 부름말이 가리키는 사람 (말한 사람 자신은 아니다) */
export function calledIn(bit: string, people: AddressPerson[], speaker = '', partner = ''): string {
    for (const re of [HEAD_RE, TAIL_RE]) {
        const m = bit.match(re); if (!m) continue;
        const to = resolveTerm(m[1].replace(/[\s,.!?…~]+$/u, '').trim(), people, partner);
        if (to && lowc(to) !== lowc(speaker)) return to;
    }
    return '';
}
/**
 * 인용한 말(quote)을 글에서 찾아 말한 사람 · 들은 사람을 규칙으로 가린다.
 * 반환 { by, to, found } — found: 그 말이 글의 대사 안에 있다. by · to 는 규칙이 가린 것만 ('' = 모른다).
 * 들은 사람: 대사가 이름으로 부른 사람, 없으면 둘만 있는 대화의 상대(partner — 글쓴이 본인이 한 말일 때만)
 */
export function attributeQuote(text: unknown, quote: unknown, { author = '', people, partner = '' }: { author?: string; people: AddressPerson[]; partner?: string }): { by: string; to: string; found: boolean } {
    const src = String(text ?? ''), squash = (s: string) => s.replace(/\s+/g, ' ').trim(), q = squash(String(quote ?? '')).replace(/^["“”「」『』']+|["“”「」『』']+$/g, '');
    if (!q || !src) return { by: '', to: '', found: false };
    const span = dialogueSpans(src).find(d => { const b = squash(d.bit); return b.includes(q) || (q.length >= 8 && q.includes(b) && b.length >= q.length * 0.6); });
    if (!span) return { by: '', to: '', found: false };
    const crowded = crowdedNarration(src, people, [author, partner]), by = speakerOfSpan(src, span, people, author, crowded);
    const to = by ? calledIn(span.bit, people, by, lowc(by) === lowc(author) ? partner : '') || (lowc(by) === lowc(author) && partner && !crowded ? partner : '') : '';
    return { by, to, found: true };
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
        const who = speakerOfSpan(src, d, people, speaker, crowded);
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
 * 호칭만으로 부른 사람 — 이름 없이 "형, 오랜만이에요" (모델을 부르지 않는다)
 *
 * 오래 안 나온 사람은 이름 대신 호칭으로만 불리며 돌아오곤 한다. 이름이 없으면 장면에 온 줄 모르고, 그 사람의 카드와 관계가 장부에서 빠진다.
 * 말한 사람의 관계선에 적힌 "부르는 말"로 보아 그 호칭이 꼭 한 사람만 가리킬 때만 그 사람으로 본다 — 같은 호칭으로 부르는 사람이 둘 이상이면 누구인지 알 수 없다.
 * ------------------------------------------------------------ */

/** 누구인지 가리키지 못하는 부름말 — 호칭 낱말이어도 이것만으로는 사람을 짚지 않는다 */
const VAGUE_TITLES = new Set(['당신', '자기', '자기야', '바보', '멍청아', '아기', '애기', 'baby', 'babe', 'dear', 'love', 'honey', 'darling', 'sweetheart', 'kid']);
const isTitleWord = (t: string) => !!t && !VAGUE_TITLES.has(t) && (TITLE_WORDS.has(t) || /^[가-힣]{1,5}님$/.test(t));
/** 호칭 뒤에 붙을 수 있는 조사 · 부름 꼬리 ("형이" · "형한테" · "형아") */
const TITLE_TAIL = '(?:에게서|한테서|이라고|께서|에게|한테|이랑|하고|이야|라고|으로|부터|까지|처럼|보다|이|가|은|는|을|를|도|의|와|과|랑|야|아|께|로|만)?';

/** 관계선의 "부르는 말" 한 칸에서 호칭만 골라낸다 — "민준 형" → 형, "선배 / 형" → 선배 · 형. 이름 · 대명사 · 풀어 쓴 설명은 버린다. nameForms: 불리는 사람의 이름들 */
export function titlesInCalls(calls: unknown, nameForms: string[] = []): string[] {
    const forms = nameForms.map(lowc).filter(f => f.length >= 2), out = new Set<string>();
    for (const raw of String(calls ?? '').split(/[,，、/·|;()（）→]+|\s+(?:or|또는|혹은)\s+/)) {
        const t = lowc(raw).replace(/^["“”'‘’「」『』\s]+|["“”'‘’「」『』\s.]+$/g, '');
        if (isTitleWord(t)) { out.add(t); continue; }
        // 이름 뒤에 붙은 호칭: "민준 형" · "민준이 형" · "태호형" → 형 (앞부분이 그 사람 이름의 일부일 때만 — "예전에는 오빠" 같은 풀이는 받지 않는다)
        for (let i = 2; i < t.length; i++) {
            const head = t.slice(0, i).trim().replace(/이$/, ''), tail = t.slice(i).trim();
            if (head.length >= 2 && isTitleWord(tail) && forms.some(f => f.includes(head))) { out.add(tail); break; }
        }
    }
    return [...out];
}
/** 글에 그 호칭이 낱말로 나오는가 — 앞은 글머리나 글자가 아닌 것, 뒤는 문장부호 · 띄어쓰기 · 조사 ("형, " · "형이 " · "선배님!"). "인형" · "형편" 은 아니다 */
export function saysTitle(text: unknown, title: string): boolean {
    const t = lowc(title); if (!t) return false;
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc(t)}${[...t].length >= 2 && !t.endsWith('님') ? '님?' : ''}${TITLE_TAIL}(?![\\p{L}\\p{N}])`, 'u').test(lowc(text));
}
/**
 * 글에 나온 호칭이 가리키는 사람들. bonds: 말한 사람에게서 나가는 관계선 [{ to, calls(부르는 말), forms(그 사람의 다른 이름) }].
 * 호칭 하나가 두 사람 이상에게 적혀 있으면 고르지 않는다. 반환: [{ to, title }]
 */
export function titleTargets(text: unknown, bonds: { to: string; calls: string; forms?: string[] }[]): { to: string; title: string }[] {
    const by = new Map<string, Map<string, string>>();
    for (const b of bonds) for (const t of titlesInCalls(b.calls, [b.to, ...(b.forms || [])])) { if (!by.has(t)) by.set(t, new Map()); by.get(t)!.set(lowc(b.to), b.to); }
    const out: { to: string; title: string }[] = [];
    for (const [title, tos] of by) if (tos.size === 1 && saysTitle(text, title)) out.push({ to: [...tos.values()][0], title });
    return out;
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
