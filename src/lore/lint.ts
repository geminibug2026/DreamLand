// 로어북 살펴보기(린트): 깨어나지 못할 항목 · 겹친 키워드 · 너무 흔한 키워드 · 깨진 정규식 같은 것을 찾아 준다 (순수 계산 — 고치지는 않는다)

export interface LintEntry { id: string; name?: string; keys?: unknown[]; keys2?: unknown[]; content?: string; constant?: boolean; enabled?: boolean; useRegex?: boolean; wholeWord?: boolean | null; probability?: unknown; vectorized?: unknown; ask?: unknown; askMode?: unknown; [k: string]: unknown }
/** code: nokey 깨울 길이 없음 · emptykey 빈 키워드 · dupkey 한 항목 안에서 겹침 · shared 여러 항목이 같은 키워드 · short 너무 흔한 짧은 키워드 · regex 깨진 정규식 ·
 *  empty 본문 없음 · never 확률 0 · askempty 방식만 있고 물음이 없음 · askoff 물음은 있는데 방식이 끔 · block 닫히지 않은 {{#if}} */
export interface LintRow { id: string; level: 'warn' | 'info'; code: string; detail: string }

const RX = /^\/([\s\S]+)\/([a-z]*)$/;
/** 정규식으로 쓰인 키워드가 깨졌으면 오류 글, 멀쩡하면 '' */
export function regexError(key: string, asRegex = false): string {
  const m = RX.exec(key.trim()); if (!m && !asRegex) return '';
  try { new RegExp(m ? m[1] : key, m ? m[2] : 'i'); return ''; } catch (e) { return e instanceof Error ? e.message : String(e); }
}
const count = (s: string, re: RegExp) => (s.match(re) || []).length;

export function lintBook(entries: LintEntry[], bookWholeWord = false): LintRow[] {
  const out: LintRow[] = [], seen = new Map<string, string[]>();
  for (const e of entries) {
    if (e.enabled === false) continue;   // 꺼 둔 항목은 일부러 그런 것으로 본다
    const add = (level: 'warn' | 'info', code: string, detail = '') => out.push({ id: e.id, level, code, detail });
    const raw = (e.keys || []).map(k => String(k)), keys = raw.map(k => k.trim()).filter(Boolean), wake = e.askMode === 'wake' && String(e.ask || '').trim();
    if (!String(e.content || '').trim()) add('warn', 'empty');
    if (!keys.length && !e.constant && !e.vectorized && !wake) add('warn', 'nokey');
    if (raw.length !== keys.length) add('info', 'emptykey');
    const low = keys.map(k => k.toLowerCase()), dup = [...new Set(low.filter((k, i) => low.indexOf(k) !== i))];
    if (dup.length) add('info', 'dupkey', dup.join(', '));
    for (const k of [...keys, ...(e.keys2 || []).map(x => String(x).trim()).filter(Boolean)]) {
      const isRx = RX.test(k) || !!e.useRegex, err = regexError(k, !!e.useRegex);
      if (err) { add('warn', 'regex', `${k} — ${err}`); continue; }
      if (isRx) continue;
      // 한 글자(한글 · 한자 포함)나 두 글자 이하의 영문은 거의 모든 글에 걸린다. 낱말 단위 검사를 켠 영문은 봐준다
      // eslint-disable-next-line no-control-regex
      const ascii = /^[\x00-\x7f]+$/.test(k), ww = e.wholeWord ?? bookWholeWord;
      if ([...k].length === 1 || (ascii && k.length <= 2 && !ww)) add('warn', 'short', k);
    }
    if (!e.constant) for (const k of new Set(low)) { if (!seen.has(k)) seen.set(k, []); seen.get(k)!.push(e.id); }
    if (Number(e.probability ?? 100) <= 0) add('warn', 'never');
    const hasAsk = !!String(e.ask || '').trim(), mode = e.askMode === 'need' || e.askMode === 'wake';
    if (mode && !hasAsk) add('warn', 'askempty'); else if (hasAsk && !mode) add('info', 'askoff');
    const c = String(e.content || '');
    if (count(c, /\{\{\s*#if\b/gi) + count(c, /\{\{\s*#unless\b/gi) !== count(c, /\{\{\s*\/(if|unless)\s*\}\}/gi)) add('warn', 'block');
  }
  // 같은 키워드를 여러 항목이 쓰는 것: 틀린 것은 아니지만 함께 깨어난다는 것을 알려 준다 (항목마다 한 줄)
  const shared = new Map<string, string[]>();
  for (const [k, ids] of seen) { const uniq = [...new Set(ids)]; if (uniq.length > 1) for (const id of uniq) { if (!shared.has(id)) shared.set(id, []); shared.get(id)!.push(`${k} ×${uniq.length}`); } }
  for (const [id, list] of shared) out.push({ id, level: 'info', code: 'shared', detail: list.slice(0, 6).join(', ') + (list.length > 6 ? ' …' : '') });
  const rank = new Map(entries.map((e, i) => [e.id, i]));
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1) || (rank.get(a.id)! - rank.get(b.id)!));
}
