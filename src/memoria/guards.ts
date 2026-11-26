// 장기기억 — 기록에 들어가면 안 되는 것을 가리는 작은 검사들 (순수 함수: 화면 · 저장소 · 모델에 의존하지 않는다)
//
// - storyOnly: 메시지 중간의 이야기 밖 메모((OOC: …) · ((…)))와 내 메시지의 "이렇게 전개해 줘" 지시 줄을 사서에게 보이기 전에 걷어 낸다
// - endsMidSentence: 답변이 문장 중간에서 끊겼는가
// - mergeLoss: 요약 여럿을 하나로 합친 글이 넣은 것에 비해 너무 짧거나 앞부분을 잃었는가
// - cardVoicesMany: 카드 글이 여러 사람을 소개하고 그 가운데 카드 이름이 없는가 (무대 카드 — 카드 하나가 한 무리의 사람을 연기하는 대화)

/** 메시지 중간의 이야기 밖 메모: (OOC: …) · [OOC: …] · 【OOC …】 · ((…)) · <ooc>…</ooc> */
const OOC_SPANS = [/[(（\[［【]\s*ooc\b[^)）\]］】]{0,800}[)）\]］】]/gi, /\(\([^()]{0,800}\)\)/g, /<ooc\b[^>]*>[\s\S]{0,2000}?<\/ooc>/gi];
/** 전개 지시의 머리말 — "전개: …", "지시: …", "Direction: …" */
const DIRECT_HEAD = '(?:다음\\s*전개|전개\\s*(?:지시|방향|요청)?|진행\\s*(?:지시|방향|요청)|지시\\s*(?:사항)?|연출\\s*(?:지시|요청)?|요청\\s*사항|scene\\s*direction|story\\s*direction|direction|directive|instructions?|plot|system\\s*note|剧情|指示|展開)';
const DIRECT_LINE = new RegExp(`^[ \\t]*[*_>#\\-]*[ \\t]*[\\[(（【]?[ \\t]*${DIRECT_HEAD}[ \\t]*[:：][^\\n]*$`, 'gimu');
const DIRECT_SPAN = new RegExp(`[\\[(（【][ \\t]*${DIRECT_HEAD}[ \\t]*[:：][^\\])）】\\n]{0,800}[\\])）】]`, 'giu');
/**
 * 사서에게 보일 글에서 이야기가 아닌 대목을 걷어 낸다. 메시지 중간의 이야기 밖 메모는 누구의 글에서든, "전개: …" 같은 진행 지시는 내 메시지에서만 뺀다 —
 * 지시는 일어난 일이 아니라 바람이고, 그대로 이루어졌다면 답변에 적혀 있다. 걷어 낼 것이 없으면 받은 글 그대로
 */
export function storyOnly(text: unknown, user = false): string {
  const src = String(text ?? ''); let t = src;
  if (/ooc|\(\(/i.test(t)) for (const rx of OOC_SPANS) t = t.replace(rx, ' ');
  if (user && /[:：]/.test(t)) t = t.replace(DIRECT_SPAN, ' ').replace(DIRECT_LINE, '');
  return t === src ? src : t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * 글이 문장 중간에서 끊겼는가 — 끝 글자가 글자 · 숫자 · 쉼표 · 여는 괄호처럼 "더 이어질" 것이고, 끝줄이 문장답게 길 때만 그렇게 본다.
 * 짧은 글, 목록 · 표 · "이름: 값" 꼴로 끝나는 글(상태창 · 꼬리표)은 끊긴 것으로 보지 않는다
 */
export function endsMidSentence(text: unknown): boolean {
  const t = String(text ?? '').replace(/[\s*_~`]+$/, ''); if (t.length < 80) return false;
  const line = t.slice(t.lastIndexOf('\n') + 1).trim();
  if (line.length < 16 || /^(?:[-*#>|•·]|\d+[.)]|[\[(（【<])/.test(line) || /^\S{1,14}\s*[:：]/.test(line) || /\|/.test(line)) return false;
  const last = [...t].pop() || '';
  return /[\p{L}\p{N},，、;；:：(（\[「『“‘—–\-]/u.test(last);
}

const bigrams = (s: string) => { const f = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''), g = new Set<string>(); for (let i = 0; i < f.length - 1; i++) g.add(f.slice(i, i + 2)); return g; };
const cover = (part: Set<string>, whole: Set<string>) => { if (part.size < 8) return 1; let hit = 0; for (const g of part) if (whole.has(g)) hit++; return hit / part.size; };
/**
 * 합친 요약이 넣은 것을 잃었는가. 'short' = 넣은 양에 비해 너무 짧다 · 'head' = 가장 앞 기록의 내용이 거의 남지 않았다(뒤쪽 이야기만 남았다) · '' = 괜찮다.
 * parts: 합치기 전 글들(오래된 것부터), max: 합친 글의 길이 상한. 넣은 것이 적으면 따지지 않는다
 */
export function mergeLoss(parts: string[], merged: string, max = 2400): '' | 'short' | 'head' {
  const src = (parts || []).map(p => String(p || '')).filter(p => p.trim()), out = String(merged || ''), total = src.reduce((a, p) => a + p.length, 0);
  if (src.length < 2 || total < 800 || !out.trim()) return '';
  if (out.length < Math.min(max, total * 0.3) * 0.4) return 'short';
  const whole = bigrams(out), all = cover(bigrams(src.join(' ')), whole);
  if (all < 0.12) return '';   // 요약 언어가 달라 글자로 견줄 수 없다
  const head = cover(bigrams(src[0]), whole), tail = cover(bigrams(src[src.length - 1]), whole);
  return head < 0.2 && head < tail * 0.45 ? 'head' : '';
}

const nameKey = (s: unknown) => String(s ?? '').toLowerCase().replace(/[\s._\-'"`·]+/g, '');
/** 인물 소개 줄의 머리말 — "이름: 한서진", "Name: Jun", "캐릭터 1: …", "[인물] …" */
const NAME_LINE = /^[ \t>*_#\-•·\d.)\[\]【】]*(?:이름|성명|캐릭터(?:\s*이름|\s*\d+)?|인물(?:\s*\d+)?|등장인물(?:\s*\d+)?|name|full\s*name|character(?:\s*name|\s*\d+)?|npc(?:\s*\d+)?|姓名|名字|名前)[ \t*_\]】]*[:：=][ \t*_"'「『]*([^\n,，/(（|:：*"'」』]{1,40})/gimu;
/**
 * 카드 글(소개 · 성격 · 시나리오)이 인물을 둘 넘게 소개하고 그 가운데 카드 이름이 없으면, 이 카드는 무대 카드다 — 소개된 이름들을 돌려준다 (아니면 빈 목록).
 * 인물 명단이 비어 있는 첫 턴에도 알아볼 수 있다. 내 캐릭터(사용자) 이름과 {{user}} · {{char}} 자리는 세지 않는다
 */
export function cardVoicesMany(card: { name?: string; description?: string; personality?: string; scenario?: string } | null | undefined, userName = ''): string[] {
  const label = nameKey(card?.name), text = [card?.description, card?.personality, card?.scenario].filter(Boolean).join('\n'); if (!label || text.length < 40) return [];
  const names = new Map<string, string>(); let self = false;
  for (const m of text.matchAll(NAME_LINE)) {
    const raw = m[1].replace(/\{\{[^}]*\}\}/g, '').trim(), k = nameKey(raw); if (!k) { if (/\{\{\s*char\s*\}\}/i.test(m[1])) self = true; continue; }
    if (k.length > 24 || k === nameKey(userName)) continue;
    if (k === label || k.includes(label) || (label.includes(k) && k.length * 2 >= label.length)) { self = true; continue; }
    if (!names.has(k)) names.set(k, raw);
  }
  return !self && names.size >= 2 ? [...names.values()].slice(0, 12) : [];
}
