// ── Dreamland 정규식 진단 ── 무엇이 잘못됐는지 한국어로 짚어 준다. 화면도 저장소도 모르는 순수 계산 (node 에서 그대로 시험할 수 있다)

/** 찾기 문장을 /패턴/플래그 로 가른다. 슬래시 꼴이 아니면 통째로 패턴이고 전체 검색(g)이다 — src/lib/engine.ts 의 compileRegex 와 같은 규칙 */
export interface Parsed { source: string; flags: string; slashed: boolean }
export function parseFind(find: unknown): Parsed {
  const s = String(find ?? ''), m = s.match(/^\/([\s\S]+)\/([a-z]*)$/i);
  return m ? { source: m[1], flags: m[2], slashed: true } : { source: s, flags: 'g', slashed: false };
}

const FLAG_INFO: Record<string, string> = { g: '맞는 곳을 모두 바꿈', i: '대소문자를 가리지 않음', m: '^ $ 가 줄마다 맞음', s: '점(.)이 줄바꿈도 잡음', u: '유니코드 모드', y: '이어 붙은 자리에서만 찾음', d: '위치 정보 기록', v: '유니코드 집합 모드' };
const FLAG_FOREIGN: Record<string, string> = { x: 'x(공백 무시)', X: 'X', U: 'U(게으른 기본값)', A: 'A(앞 고정)', J: 'J(이름 중복 허용)' };

/** 브라우저마다 다른 오류 문장을 한 가지 한국어 설명으로 */
const ERRORS: [RegExp, string][] = [
  [/unterminated group|missing \)|unterminated parenthetical/i, '여는 괄호 ( 가 닫히지 않았어요. 짝이 되는 ) 를 넣거나, 괄호를 글자로 찾으려면 \\( 로 적으세요.'],
  [/unmatched '?\)'?|unmatched \) in|unmatched parenthes/i, '닫는 괄호 ) 에 짝이 되는 여는 괄호가 없어요. 괄호를 글자로 찾으려면 \\) 로 적으세요.'],
  [/nothing to repeat/i, '* + ? 앞에 되풀이할 것이 없어요. 별표 · 더하기 · 물음표를 글자로 찾으려면 \\* \\+ \\? 처럼 역슬래시를 붙이세요.'],
  [/unterminated character class|missing terminating \]/i, '대괄호 [ 가 ] 로 닫히지 않았어요. 대괄호를 글자로 찾으려면 \\[ 로 적으세요.'],
  [/range out of order|invalid range in character class/i, '대괄호 안 범위의 순서가 거꾸로예요 (예: [z-a]). 하이픈을 글자로 쓰려면 맨 끝에 두거나 \\- 로 적으세요.'],
  [/numbers out of order/i, '{ } 안 숫자의 순서가 거꾸로예요 (예: {3,1}). 작은 수를 앞에 두세요.'],
  [/invalid capture group name|invalid group specifier name/i, '그룹 이름에 쓸 수 없는 글자가 있어요. (?<이름>…) 의 이름은 글자 · 숫자 · 밑줄만, 숫자로 시작하지 않게 적으세요.'],
  [/duplicate capture group name|duplicate group specifier name/i, '같은 이름의 그룹이 두 번 나와요. (?<이름>…) 의 이름은 서로 달라야 합니다.'],
  [/invalid named reference|invalid named capture referenced/i, '\\k<이름> 이 가리키는 그룹이 없어요. 이름을 (?<이름>…) 과 똑같이 맞추세요.'],
  [/invalid group|invalid regexp group|unrecognized character after \(\?/i, '(? 뒤가 잘못됐어요. 쓸 수 있는 꼴: (?:…) 묶기만 · (?=…) (?!…) 뒤 살피기 · (?<=…) (?<!…) 앞 살피기 · (?<이름>…) 이름 붙이기.'],
  [/lone quantifier brackets|raw brace is not allowed|incomplete quantifier/i, '{ } 가 되풀이 횟수로 읽히지 않아요. 중괄호를 글자로 찾으려면 \\{ \\} 로 적으세요.'],
  [/\\ at end of pattern/i, '맨 끝에 역슬래시(\\)만 남아 있어요. 역슬래시를 글자로 찾으려면 \\\\ 로 두 번 적으세요.'],
  [/invalid unicode escape|invalid escape|invalid identity escape|invalid property name|invalid unicode property/i, '역슬래시 뒤 표현이 잘못됐어요. u · v 플래그에서는 \\d \\w \\s \\n \\u{…} \\p{…} 같은 정해진 표현만 쓸 수 있습니다.'],
  [/invalid character class|invalid class set|invalid set operation/i, '대괄호 안 표현이 잘못됐어요. v 플래그에서는 ( ) [ ] { } / - | 같은 기호를 \\ 로 적어야 합니다.'],
  [/too large|stack overflow|too much recursion/i, '패턴이 너무 크거나 깊어요. 나눠서 여러 스크립트로 만들어 보세요.'],
  [/invalid flags/i, '플래그가 잘못됐어요. g i m s u y d v 만, 한 번씩 쓸 수 있습니다.'],
];
export function explainError(message: unknown): string {
  const tail = String(message || '').replace(/^Invalid regular expression:\s*/i, '').replace(/^\/[\s\S]*\/[a-z]*:\s*/i, '');
  for (const [re, ko] of ERRORS) if (re.test(tail) || re.test(String(message))) return ko;
  return `정규식을 읽지 못했어요: ${tail || message}`;
}

/** 패턴을 훑어 괄호 · 대괄호의 짝과 그룹 이름, 겹친 되풀이를 찾는다 */
export interface Scan { at: number; what: string; nested: number; names: string[]; groups: number; dot: boolean; anchor: boolean; tops: number[] }
interface OpenGroup { at: number; inf: boolean; capture: boolean }
export function scanSource(source: unknown): Scan {
  const s = String(source), stack: OpenGroup[] = [], names: string[] = [], out: Scan = { at: -1, what: '', nested: -1, names, groups: 0, dot: false, anchor: false, tops: [] };
  let inClass = -1, lastGroupInf = false, i = 0;
  const markInf = () => { for (const g of stack) g.inf = true; };
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; lastGroupInf = false; continue; }
    if (inClass >= 0) { if (c === ']') inClass = -1; continue; }
    if (c === '[') { inClass = i; lastGroupInf = false; continue; }
    if (c === '(') {
      const g: OpenGroup = { at: i, inf: false, capture: true };
      if (s[i + 1] === '?') { const m = s.slice(i).match(/^\(\?<([^=!>][^>]*)>/); if (m) names.push(m[1]); else g.capture = false; }
      if (g.capture) out.groups++;
      stack.push(g); lastGroupInf = false; continue;
    }
    if (c === ')') {
      const g = stack.pop();
      if (!g) { if (out.at < 0) { out.at = i; out.what = ')'; } lastGroupInf = false; continue; }
      lastGroupInf = g.inf; if (!stack.length) out.tops.push(i + 1);
      continue;
    }
    if (c === '*' || c === '+' || (c === '{' && /^\{\d+,\}/.test(s.slice(i)))) {
      if (lastGroupInf && out.nested < 0) out.nested = i;
      markInf(); lastGroupInf = false;
      if (c === '{') i = s.indexOf('}', i);
      if (s[i + 1] === '?') i++;
      if (!stack.length) out.tops.push(i + 1);
      continue;
    }
    if (c === '.') out.dot = true;
    if (c === '^' || c === '$') out.anchor = true;
    lastGroupInf = false;
    if (!stack.length && c !== '?' && c !== '|') out.tops.push(i + 1);
  }
  if (out.at < 0 && inClass >= 0) { out.at = inClass; out.what = '['; }
  if (out.at < 0 && stack.length) { out.at = stack[stack.length - 1].at; out.what = '('; }
  return out;
}

export type Level = 'error' | 'warn' | 'info';
export interface Issue { level: Level; msg: string; at?: number }
const issue = (level: Level, msg: string, extra?: { at: number }): Issue => ({ level, msg, ...extra });
export interface Lint { ok: boolean; source: string; flags: string; slashed: boolean; re: RegExp | null; groups: number; names: string[]; issues: Issue[]; flagNotes: string[] }
/**
 * 찾기 문장 진단. { ok, source, flags, slashed, re, groups, names, issues[{ level: 'error'|'warn'|'info', msg, at }] , flagNotes[] }
 * at 은 패턴 안에서 문제가 있는 글자 자리(0부터). 없으면 -1.
 */
export function lintFind(find: unknown): Lint {
  const raw = String(find ?? ''), { source, flags, slashed } = parseFind(raw), issues: Issue[] = [];
  const res: Lint = { ok: false, source, flags, slashed, re: null, groups: 0, names: [], issues, flagNotes: [] };
  if (!raw) { issues.push(issue('info', '찾을 문장이 비어 있어요. 비어 있는 스크립트는 실행되지 않습니다.')); return res; }
  if (!slashed && raw.startsWith('/') && raw.length > 1) issues.push(issue('warn', '슬래시로 시작했지만 /패턴/플래그 꼴로 끝나지 않아, 슬래시까지 통째로 찾을 글자로 읽힙니다. 닫는 슬래시를 넣었는지 확인하세요.'));
  // 플래그
  const bad = [...new Set([...flags].filter(f => !FLAG_INFO[f]))], dup = [...new Set([...flags].filter((f, i) => flags.indexOf(f) !== i))];
  if (bad.length) issues.push(issue('error', `쓸 수 없는 플래그가 있어요: ${bad.map(f => FLAG_FOREIGN[f] || f).join(', ')}. 쓸 수 있는 플래그는 g i m s u y d v 입니다.${bad.some(f => FLAG_FOREIGN[f]) ? ' (다른 정규식 엔진의 플래그는 여기서 동작하지 않아요.)' : ''}`));
  if (dup.length) issues.push(issue('error', `같은 플래그를 두 번 적었어요: ${dup.join(', ')}. 한 번씩만 적으세요.`));
  if (flags.includes('u') && flags.includes('v')) issues.push(issue('error', 'u 와 v 플래그는 함께 쓸 수 없어요. 하나만 남기세요.'));
  const scan = scanSource(source);
  res.names = scan.names;
  if (issues.some(x => x.level === 'error')) return res;
  try { res.re = new RegExp(source, flags); }
  catch (err) {
    const e = err as Error;
    const where = scan.at >= 0 ? ` (패턴의 ${scan.at + 1}번째 글자 ${scan.what})` : '';
    issues.push(issue('error', explainError(e.message) + where, { at: scan.at }));
    if (/nothing to repeat/i.test(e.message) && /(^|[^\\])\*[^*\n]+\*/.test(source)) issues.push(issue('info', '*강조* 같은 마크다운 별표를 찾으려는 것이라면 \\*([^*]+)\\* 처럼 적으세요.'));
    return res;
  }
  res.ok = true;
  try { res.groups = (new RegExp(source + '|', flags.replace(/[gy]/g, '')).exec('') as RegExpExecArray).length - 1; } catch { res.groups = scan.groups; }
  // 플래그가 뜻하는 것
  res.flagNotes.push(flags.includes('g') ? '맞는 곳을 모두 바꿈' : '처음 맞는 한 곳만 바꿈', flags.includes('i') ? '대소문자를 가리지 않음' : '대소문자를 가림');
  for (const f of 'msuyv') if (flags.includes(f)) res.flagNotes.push(FLAG_INFO[f]);
  if (slashed && !flags.includes('g')) issues.push(issue('info', 'g 플래그가 없어서 처음 맞는 한 곳만 바꿉니다. 모두 바꾸려면 끝에 g 를 붙이세요 (예: /패턴/g).'));
  // 위험 · 흔한 실수
  if (scan.nested >= 0) issues.push(issue('warn', `되풀이 안에 되풀이가 겹쳐 있어요 (${scan.nested + 1}번째 글자 근처, 예: (a+)+ 나 (.*)* ). 맞지 않는 글을 만나면 경우의 수가 폭발해 화면이 멈출 수 있습니다. 안쪽 되풀이를 [^…]+ 처럼 좁히거나 바깥 되풀이를 없애세요.`, { at: scan.nested }));
  let empty = false; try { empty = new RegExp(source, flags.replace(/[gy]/g, '')).exec('') !== null; } catch { }
  if (empty) issues.push(issue('warn', '아무 글자가 없어도 맞는 패턴이에요. 글자 사이사이(또는 줄 머리)마다 바꿀 내용이 끼어들 수 있습니다. 뜻한 것이 아니라면 * 를 + 로, ? 를 빼는 식으로 한 글자 이상 맞게 고치세요.'));
  if (scan.dot && !flags.includes('s') && /\.[*+]/.test(source)) issues.push(issue('info', '점(.)은 줄바꿈을 넘지 못해요. 여러 줄에 걸친 내용을 잡으려면 s 플래그를 붙이거나 . 대신 [\\s\\S] 를 쓰세요.'));
  if (scan.anchor && !flags.includes('m') && /(^|[^\\[])(\^|\$)/.test(source)) issues.push(issue('info', '^ 와 $ 는 글 전체의 맨 처음 · 맨 끝만 가리켜요. 줄마다 맞추려면 m 플래그를 붙이세요.'));
  if (flags.includes('y')) issues.push(issue('info', 'y 플래그는 글의 맨 앞부터 이어 붙은 자리에서만 찾습니다. 보통은 필요하지 않아요.'));
  return res;
}

/** 스크립트 전체 진단 (찾기 + 바꾸기 · 대상 · 깊이 · 매크로의 어긋남). lintFind 의 결과에 issues 를 덧붙여 돌려준다 */
export interface ScriptLike { find?: unknown; replace?: unknown; trim?: unknown; onUser?: unknown; onAI?: unknown; onSlash?: unknown; onLore?: unknown; onReason?: unknown; mode?: unknown; subst?: unknown; minDepth?: unknown; maxDepth?: unknown; runOnEdit?: unknown }
export function lintScript(r: ScriptLike): Lint {
  const res = lintFind(r?.find), is = res.issues, rep = String(r?.replace ?? ''), find = String(r?.find ?? '');
  const num = (v: unknown) => (v == null || v === '' || isNaN(+v) ? null : +v);
  if (!r.onUser && !r.onAI && !r.onSlash && !r.onLore && !r.onReason) is.push(issue('warn', '적용 대상을 하나도 고르지 않아 실행되지 않습니다. 내 입력 · AI 응답 가운데 하나 이상을 고르세요.'));
  if (res.ok) {
    const nums = [...rep.matchAll(/\$(\d+)/g)].map(m => +m[1]).filter(n => n > res.groups);
    if (nums.length) is.push(issue('warn', `바꾸기에 ${[...new Set(nums)].map(n => '$' + n).join(', ')} 을(를) 썼지만 찾기의 괄호 그룹은 ${res.groups}개뿐이에요. 그 자리는 빈칸이 됩니다.${res.groups === 0 ? ' 가져올 부분을 ( ) 로 감싸세요.' : ''}`));
    const miss = [...rep.matchAll(/\$<([^>]+)>/g)].map(m => m[1]).filter(n => !res.names.includes(n));
    if (miss.length) is.push(issue('warn', `바꾸기의 $<${miss[0]}> 에 해당하는 이름 붙은 그룹 (?<${miss[0]}>…) 이 찾기에 없어요. 그 자리는 빈칸이 됩니다.`));
  }
  if (/\$&|\$`|\$'/.test(rep)) is.push(issue('info', '$& $` $\' 는 쓰이지 않고 글자 그대로 남습니다. 찾은 글 전체는 {{match}} 또는 $0 으로 적으세요.'));
  const trims = Array.isArray(r.trim) ? (r.trim as unknown[]).filter(Boolean) : [];
  if (trims.length && !/\$\d+|\$<[^>]+>|\{\{match\}\}/i.test(rep)) is.push(issue('info', '다듬기 문자열은 $1 · {{match}} 로 가져온 부분에서만 지워집니다. 지금 바꾸기에는 가져오는 부분이 없어요.'));
  if (find.includes('{{') && Number(r.subst ?? 1) === 0) is.push(issue('warn', '찾기에 {{매크로}} 가 있지만 "찾기의 매크로" 가 "바꾸지 않음" 이라 글자 그대로 찾습니다. 이름으로 찾으려면 "값을 넣기" 로 바꾸세요.'));
  if (find.includes('{{') && Number(r.subst ?? 1) === 1) is.push(issue('info', '매크로 값에 . ( ) ? 같은 기호가 들어 있으면 정규식 기호로 읽힙니다. 글자 그대로 찾으려면 "기호를 글자로 바꿔 넣기" 를 고르세요.'));
  const lo = num(r.minDepth), hi = num(r.maxDepth);
  if (lo !== null && hi !== null && hi >= 0 && lo > hi) is.push(issue('warn', `최소 깊이(${lo})가 최대 깊이(${hi})보다 커서 어떤 메시지에도 적용되지 않습니다.`));
  if (r.mode === 'store' && (lo !== null || hi !== null)) is.push(issue('info', '원문을 바꿔 저장하는 방식에서는 깊이를 보지 않습니다. 깊이는 화면 표시 · 전송에서만 쓰여요.'));
  if (r.onLore && r.mode !== 'prompt' && r.mode !== 'both') is.push(issue('warn', '로어북 내용은 AI 에게 보낼 때만 거칩니다. 적용 방식을 "AI 에게 보낼 때만" 이나 "화면 + 전송" 으로 바꿔야 로어북에 적용돼요.'));
  if (r.runOnEdit && r.mode !== 'store') is.push(issue('info', '"메시지를 고칠 때도" 는 원문을 바꿔 저장하는 방식에서만 뜻이 있어요. 화면 표시 방식은 고친 뒤에도 늘 다시 적용됩니다.'));
  return res;
}

/** 시험 입력에서 하나도 못 찾았을 때 짚어 줄 까닭들 (문자열 배열). lint 는 lintFind/lintScript 의 결과 */
export function whyNoMatch(lint: Pick<Lint, 'ok' | 'source' | 'flags'> | null | undefined, sample: unknown): string[] {
  const out: string[] = [], text = String(sample ?? '');
  if (!lint?.ok || !text) return out;
  const { source, flags } = lint, count = (src: string, fl: string) => { try { return [...text.matchAll(new RegExp(src, fl.includes('g') ? fl : fl + 'g'))].filter(m => m[0] !== '').length; } catch { return 0; } };
  const tryFlag = (f: string, why: string) => { if (flags.includes(f)) return; const n = count(source, flags + f); if (n) out.push(`${why} — ${f} 플래그를 붙이면 ${n}곳을 찾습니다.`); };
  tryFlag('i', '대소문자가 달라요');
  if (/\./.test(source)) tryFlag('s', '찾는 내용이 여러 줄에 걸쳐 있어요 (점은 줄바꿈을 못 넘습니다)');
  if (/[\^$]/.test(source)) tryFlag('m', '^ $ 가 글 전체의 처음 · 끝만 가리키고 있어요');
  if (/["']/.test(source) && /[“”‘’「」『』]/.test(text)) { const n = count(source.replace(/"/g, '["“”]').replace(/'/g, "['‘’]"), flags); out.push(`입력에는 둥근 따옴표(“ ” ‘ ’)가 쓰였는데 패턴은 곧은 따옴표(" ')를 찾고 있어요.${n ? ` ["“”] 처럼 둘 다 받게 하면 ${n}곳을 찾습니다.` : ''}`); }
  if (/[“”‘’]/.test(source) && /["']/.test(text) && !/[“”‘’]/.test(text)) out.push('패턴은 둥근 따옴표(“ ”)를 찾는데 입력에는 곧은 따옴표(" \')만 있어요.');
  if (/ /.test(source)) { const n = count(source.replace(/ +/g, '\\s+'), flags); if (n) out.push(`띄어쓰기나 줄바꿈이 패턴과 달라요 — 빈칸 자리에 \\s+ 를 쓰면 ${n}곳을 찾습니다.`); }
  // 패턴 앞에서부터 어디까지 맞는지
  if (!out.length) {
    const tops = scanSource(source).tops.filter(n => n < source.length).reverse().slice(0, 80);
    for (const n of tops) {
      const head = source.slice(0, n);
      let hit: RegExpExecArray | null = null; try { hit = new RegExp(head, flags.replace(/[gy]/g, '')).exec(text); } catch { continue; }
      if (hit && hit[0]) { out.push(`패턴의 앞부분 ${clip(head)} 까지는 "${clip(hit[0], 40)}" 에 맞지만, 그 뒤 ${clip(source.slice(n))} 에서 막힙니다.`); break; }
    }
    if (!out.length) out.push('패턴의 첫 부분부터 이 입력과 맞지 않아요. 입력을 그대로 복사해 패턴에 넣고, 달라지는 부분만 정규식으로 바꿔 보세요.');
  }
  return out;
}
const clip = (v: unknown, n = 36) => { const s = String(v).replace(/\n/g, '⏎'); return s.length > n ? s.slice(0, n) + '…' : s; };

/** 건너뛴 까닭을 한 줄 설명으로 */
export const SKIP_TEXT: Record<string, string> = {
  off: '꺼짐', nofind: '찾기가 비어 있음', place: '대상 아님', mode: '적용 방식이 다름', edit: '고칠 때는 적용하지 않음', min: '깊이 범위 밖 (최소보다 얕음)', max: '깊이 범위 밖 (최대보다 깊음)',
  'scope:char': '범위 아님 (다른 캐릭터)', 'scope:preset': '범위 아님 (다른 프리셋)', 'blocked:char': '이 캐릭터의 정규식을 허용하지 않음', 'blocked:preset': '이 프리셋의 정규식을 허용하지 않음',
  badregex: '정규식 오류', hang: '끝나지 않아 멈춤',
};
const WHO_KO: Record<string, string> = { user: '내 입력', ai: 'AI 응답', slash: '명령어로 넣은 글', lore: '로어북 내용', reason: '생각 과정' };
const MODE_KO: Record<string, string> = { display: '화면에 보일 때만', prompt: 'AI 에게 보낼 때만', both: '화면 + 전송', store: '원문을 바꿔 저장' };
const TARGET_KO: Record<string, string> = { display: '화면 표시', prompt: '프롬프트 전송', store: '저장' };
/** 건너뛴 까닭을 스크립트 설정과 견줘 풀어 쓴다 */
export interface SkipEnv { who?: string; target?: string; depth?: number }
type SkipScript = ScriptLike & { [k: string]: unknown };
export function skipDetail(code: string, r: SkipScript | null | undefined, env: SkipEnv = {}): string {
  const ON: Record<string, string> = { user: 'onUser', ai: 'onAI', slash: 'onSlash', lore: 'onLore', reason: 'onReason' };
  const on = ['user', 'ai', 'slash', 'lore', 'reason'].filter(w => r?.[ON[w]]).map(w => WHO_KO[w]);
  switch (code) {
    case 'place': return `이 글은 ${WHO_KO[env.who as string] || 'AI 응답'}인데, 스크립트의 대상은 ${on.length ? on.join(' · ') : '없음'}입니다.`;
    case 'mode': return `지금은 ${TARGET_KO[env.target as string] || env.target} 단계인데, 스크립트의 적용 방식은 "${MODE_KO[r?.mode as string] || r?.mode}" 입니다.`;
    case 'min': return `이 메시지의 깊이는 ${env.depth}, 스크립트의 최소 깊이는 ${r?.minDepth} 입니다.`;
    case 'max': return `이 메시지의 깊이는 ${env.depth}, 스크립트의 최대 깊이는 ${r?.maxDepth} 입니다.`;
    case 'edit': return '"메시지를 고칠 때도 적용" 이 꺼져 있습니다.';
    case 'off': return '스위치가 꺼져 있습니다.';
    case 'nofind': return '찾기 문장이 비어 있습니다.';
    case 'blocked:char': return '캐릭터 탭에서 "이 캐릭터의 정규식 사용" 을 켜야 적용됩니다.';
    case 'blocked:preset': return '프리셋 탭에서 "이 프리셋의 정규식 사용" 을 켜야 적용됩니다.';
    case 'scope:char': return '이 대화에 없는 캐릭터(또는 그룹에서 다른 캐릭터의 메시지)에 묶인 스크립트입니다.';
    case 'scope:preset': return '이 대화가 쓰지 않는 프리셋에 실린 스크립트입니다.';
    case 'badregex': return '찾기 문장을 정규식으로 읽지 못했습니다. 스크립트를 열어 진단을 확인하세요.';
    case 'hang': return '이 글에서 계산이 끝나지 않아 건너뛰었습니다. 되풀이가 겹친 패턴인지 확인하세요.';
    default: return SKIP_TEXT[code] || code;
  }
}

/** 찾은 곳을 기준으로 원문을 조각낸다: [{ t, hit, i }] (hit 이면 i 번째로 찾은 곳) */
export interface MatchLike { index: number; match: string; out: string }
export interface HitPart { t: string; hit: boolean; i?: number }
export type DiffPart = { t: string } | { t?: undefined; del: string; ins: string; i: number };
export function hitParts(text: string, matches: MatchLike[] | null | undefined): HitPart[] {
  const out: HitPart[] = []; let at = 0;
  (matches || []).forEach((m, i) => {
    if (m.index < at) return;
    if (m.index > at) out.push({ t: text.slice(at, m.index), hit: false });
    out.push({ t: m.match, hit: true, i }); at = m.index + m.match.length;
  });
  if (at < text.length) out.push({ t: text.slice(at), hit: false });
  return out;
}
/** 바뀐 곳 보기: [{ t } | { del, ins, i }] — 그대로인 글과, 지워진 글(del) · 들어간 글(ins) 짝 */
export function diffParts(text: string, matches: MatchLike[] | null | undefined): DiffPart[] {
  return hitParts(text, matches).map(p => (p.hit ? { del: p.t, ins: (matches as MatchLike[])[p.i as number].out, i: p.i as number } : { t: p.t }));
}
/** 글자 수 변화 요약 */
export function tally(matches: Pick<MatchLike, 'match' | 'out'>[] | null | undefined) {
  let found = 0, removed = 0, added = 0;
  for (const m of matches || []) { found++; removed += m.match.length; added += m.out.length; }
  return { found, removed, added };
}
