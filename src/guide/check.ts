// 점검: 캐릭터 카드와 프리셋의 흔한 문제를 앱이 직접 센다 (모델을 부르지 않는다). 조수는 이 결과를 읽고 풀어 설명한다
import { tokens } from '../lib/engine';
import { X } from '../lib/hooks';
import type { Char, Persona, Preset } from '../lib/types';

/** 한 가지 지적. code 는 화면 글의 열쇠(guide.chk.<code>), where 는 어느 칸인지, n 은 숫자(있으면) */
export interface Finding { level: 'warn' | 'note'; code: string; where: string; n?: number; detail?: string }

const KNOWN = new Set(['user', 'char', 'group', 'persona', 'description', 'personality', 'scenario', 'mesexamples', 'model', 'input', 'lastmessage', 'lastusermessage', 'lastcharmessage', 'time', 'date', 'weekday', 'isotime', 'isodate',
  'random', 'pick', 'roll', 'getvar', 'setvar', 'addvar', 'incvar', 'decvar', 'getglobalvar', 'setglobalvar', 'addglobalvar', 'incglobalvar', 'decglobalvar', 'outlet', 'original', 'var', 'pvar', 'pipe', 'trim', 'slot', 'newline', 'noop', 'img', 'idle_duration', 'bot', 'charifnotgroup',
  'if', 'unless', 'else', 'charprompt', 'charjailbreak', 'chardepthprompt', 'creatornotes', 'charversion', 'char_version', 'mesexamplesraw', 'worldinfo', 'lorebook', 'banned', 'timediff', 'datetimeformat', 'currentswipeid', 'lastswipeid', 'lastmessageid', 'firstincludedmessageid', 'maxprompt', 'exampleseparator', 'chatstart', 'systemprompt', 'instructsystem', 'reverse']);

/** 깨진 매크로: 짝이 안 맞는 {{ }}, 모르는 이름, 흔한 오타({char} · <user>) */
export function macroIssues(text: string): string[] {
  const out: string[] = [], s = String(text || '');
  const open = (s.match(/\{\{/g) || []).length, close = (s.match(/\}\}/g) || []).length;
  if (open !== close) out.push(`unbalanced {{ }} (${open} open, ${close} close)`);
  const seen = new Set<string>();
  for (const m of s.matchAll(/\{\{\s*([#/]?)\s*([^\s:}]*)[^}]*\}\}/g)) {
    const name = m[2].toLowerCase(); if (!name || name.startsWith('//') || seen.has(name)) continue; seen.add(name);
    if (!KNOWN.has(name) && !X.macros.has(name) && !X.macros.has(m[2])) out.push(`unknown macro {{${m[2]}}}`);
  }
  const typo = s.match(/(?<!\{)\{(char|user)\}(?!\})|<(char|user|bot)>/gi);
  if (typo) out.push(`single-brace or angle placeholder ${[...new Set(typo)].join(' ')} is not replaced (use {{char}} / {{user}})`);
  const ifs = (s.match(/\{\{\s*#(if|unless)\b/g) || []).length, ends = (s.match(/\{\{\s*\/(if|unless)\s*\}\}/g) || []).length;
  if (ifs !== ends) out.push(`{{#if}} blocks not closed (${ifs} open, ${ends} close)`);
  return out;
}

// ── 카드 글의 버릇 ── 마크다운 꾸밈과 흔한 집착형 성격 낱말. 말은 모델이 읽으므로 영어로 적는다
/** 카드 · 페르소나 · 인사말 글에 쓰지 않을 꾸밈: **굵게** · *기울임(행동)* · __굵게__ · # 제목 · 장식 이모지. 찾은 종류와 수 */
export function markdownMarks(text: string): string[] {
  const s = String(text || '').replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ').replace(/\{\{[^}]*\}\}/g, ' '), out: string[] = [];
  const count = (re: RegExp) => (s.match(re) || []).length;
  const bold = count(/\*\*[^*\n]+\*\*/g) + count(/__[^_\n]+__/g);
  const ital = count(/(?<![*\w])\*(?![\s*])[^*\n]{1,300}?(?<![\s*])\*(?![*\w])/g);
  const head = count(/^[ \t]*#{1,6}[ \t]+\S/gm), emoji = count(/\p{Extended_Pictographic}/gu);
  if (bold) out.push(`**bold** ×${bold}`);
  if (ital) out.push(`*italics/asterisk actions* ×${ital}`);
  if (head) out.push(`# headers ×${head}`);
  if (emoji) out.push(`emoji ×${emoji}`);
  return out;
}
/** 사용자가 바라지 않았다면 넣지 않을 낱말 (집착 · 소유 · 통제 · 강압 · 질투를 사랑처럼 그리는 버릇). 세 언어 */
const CLICHE = /집착|소유욕|독점욕|지배욕|통제욕|통제하|강압|강요|복종|굴복|질투심|가스라이팅|감금|얀데레|나만의 것|내 거야|내 것이야|possessive(?:ness)?|obsess(?:ive|ion|ed)|controlling|coerc(?:ive|ion|e)|domineering|yandere|jealous(?:y)?|submissive|obedien(?:t|ce)|gaslight\w*|brooding|alpha male|\bmine alone\b|belongs to me|占有欲|控制欲|偏执|病娇|强迫|服从/gi;
/** 집착형 낱말과 수 */
export function clicheWords(text: string): string[] {
  const n = new Map<string, number>();
  for (const m of String(text || '').matchAll(CLICHE)) { const k = m[0].toLowerCase(); n.set(k, (n.get(k) || 0) + 1); }
  return [...n].map(([k, c]) => c > 1 ? `${k}(${c})` : k);
}
/** 카드 글 칸들에 대해 위 두 가지를 센다 */
export function styleFindings(fields: Record<string, string>): Finding[] {
  const f: Finding[] = [], words = new Map<string, string[]>();
  for (const [where, text] of Object.entries(fields)) {
    if (!String(text || '').trim()) continue;
    const md = markdownMarks(text); if (md.length) f.push({ level: 'note', code: 'markdown', where, detail: `${md.join(', ')} — write plain prose: dialogue in quotes, actions as normal sentences; the markers cost tokens and teach the model to imitate them` });
    const cl = clicheWords(text); if (cl.length) words.set(where, cl);
  }
  if (words.size) f.push({ level: 'note', code: 'cliche', where: [...words.keys()].join(', '), detail: `${[...words].map(([w, l]) => `${w}: ${l.join(', ')}`).join('; ')} — obsessive/possessive/controlling traits are a common AI-card cliche; fine if the user asked for it, otherwise prefer specific, grounded traits` });
  return f;
}
const STYLE_FIELDS: (keyof Char)[] = ['description', 'personality', 'scenario', 'firstMes', 'mesExample'];

const CHAR_TEXT: (keyof Char)[] = ['description', 'personality', 'scenario', 'firstMes', 'mesExample', 'systemPrompt', 'postHistory'];
export function checkChar(c: Char): { tokens: Record<string, number>; findings: Finding[] } {
  const f: Finding[] = [], tk: Record<string, number> = {};
  for (const k of CHAR_TEXT) tk[k] = tokens(String(c[k] || ''));
  const always = tk.description + tk.personality + tk.scenario + tk.systemPrompt + tk.postHistory + tokens(c.depthPrompt?.prompt || '');
  tk.always = always;
  if (always > 3500) f.push({ level: 'warn', code: 'heavy', where: 'description', n: always });
  else if (always > 2200) f.push({ level: 'note', code: 'heavyish', where: 'description', n: always });
  if (!String(c.description || '').trim() && !String(c.personality || '').trim()) f.push({ level: 'warn', code: 'noDesc', where: 'description' });
  if (!String(c.firstMes || '').trim()) f.push({ level: 'warn', code: 'noGreeting', where: 'firstMes' });
  (c.altGreetings || []).forEach((g, i) => { if (!String(g || '').trim()) f.push({ level: 'warn', code: 'emptyAlt', where: `altGreetings[${i}]`, n: i + 1 }); });
  if (tk.firstMes > 1200) f.push({ level: 'note', code: 'longGreeting', where: 'firstMes', n: tk.firstMes });
  if (tk.mesExample > 1500) f.push({ level: 'note', code: 'longExamples', where: 'mesExample', n: tk.mesExample });
  // 인사말이 사용자의 말 · 행동까지 대신 쓰면 모델도 그렇게 배운다
  if (/\{\{user\}\}\s*(:|：)|(^|\n)\s*\{\{user\}\}\s+(says?|said|replies|nods|smiles)/i.test(String(c.firstMes || ''))) f.push({ level: 'note', code: 'speaksForUser', where: 'firstMes' });
  if (String(c.mesExample || '').trim() && !/<START>/i.test(String(c.mesExample))) f.push({ level: 'note', code: 'noStart', where: 'mesExample' });
  for (const k of CHAR_TEXT) for (const d of macroIssues(String(c[k] || ''))) f.push({ level: 'warn', code: 'macro', where: String(k), detail: d });
  (c.altGreetings || []).forEach((g, i) => { for (const d of macroIssues(String(g || ''))) f.push({ level: 'warn', code: 'macro', where: `altGreetings[${i}]`, detail: d }); });
  if (/^\s*$/.test(c.name || '')) f.push({ level: 'warn', code: 'noName', where: 'name' });
  // 길이 지시가 서로 어긋나는지 (짧게 · 길게가 함께 있으면)
  const rules = [c.description, c.systemPrompt, c.postHistory, c.depthPrompt?.prompt].join('\n');
  if (clash(rules)) f.push({ level: 'note', code: 'clash', where: 'systemPrompt', detail: clash(rules) });
  const st: Record<string, string> = {}; for (const k of STYLE_FIELDS) st[k] = String(c[k] || ''); (c.altGreetings || []).forEach((g, i) => { st[`altGreetings[${i}]`] = String(g || ''); }); st['depthPrompt.prompt'] = String(c.depthPrompt?.prompt || '');
  f.push(...styleFindings(st));
  // 인사말이 {{user}} 의 마음 · 행동을 정해 버리는가 (사용자가 할 몫)
  for (const [k, g] of [['firstMes', c.firstMes], ...(c.altGreetings || []).map((x, i) => [`altGreetings[${i}]`, x])] as [string, string][]) if (!(k === 'firstMes' && f.some(x => x.code === 'speaksForUser')) && userAgency(String(g || ''))) f.push({ level: 'note', code: 'userAgency', where: k, detail: 'the greeting decides what {{user}} does, says or feels; leave that to the user' });
  return { tokens: tk, findings: f };
}
/** 인사말이 사용자의 행동 · 감정을 대신 정하는가: "{{user}} 는 …했다" · "you feel/you nod" 따위 */
export function userAgency(text: string): boolean {
  const s = String(text || '');
  return /\{\{user\}\}(은|는|이|가)\s*[^.\n"“]{0,40}(했다|한다|느꼈|느낀다|생각했|고개를|미소|웃었|끄덕)|\{\{user\}\}\s+(feels?|felt|nods?|nodded|smiles?|smiled|thinks?|thought|decides?|decided|blush(es|ed)?|agrees?|agreed)\b|\byou (feel|felt|nod|nodded|smile|smiled|decide|decided|blush|blushed|can't help)\b/i.test(s);
}
/** 페르소나: 비었는지 · 무게 · 꾸밈 · 집착형 낱말 · 매크로 */
export function checkPersona(p: Persona): { tokens: Record<string, number>; findings: Finding[] } {
  const f: Finding[] = [], d = String(p.description || ''), tk = { description: tokens(d) };
  if (!d.trim()) f.push({ level: 'warn', code: 'noDesc', where: 'description' });
  if (tk.description > 900) f.push({ level: 'note', code: 'heavyish', where: 'description', n: tk.description });
  if (!String(p.name || '').trim()) f.push({ level: 'warn', code: 'noName', where: 'name' });
  for (const x of macroIssues(d)) f.push({ level: 'warn', code: 'macro', where: 'description', detail: x });
  f.push(...styleFindings({ description: d }));
  return { tokens: tk, findings: f };
}
/** 서로 반대인 지시 짝이 한 글 안에 함께 있나 */
function clash(s: string): string {
  const pairs: [RegExp, RegExp, string][] = [
    [/\b(keep|write)\b[^.\n]{0,40}\b(short|brief|concise)\b|짧게|간결하게/i, /\b(long|lengthy|detailed|at least \d+ (words|paragraphs))\b|길게|자세하게|상세하게/i, 'short vs long reply length'],
    [/\b(first[- ]person|1st person)\b|1인칭/i, /\b(third[- ]person|3rd person)\b|3인칭/i, 'first vs third person'],
    [/\bpresent tense\b|현재형/i, /\bpast tense\b|과거형/i, 'present vs past tense'],
    [/never (speak|act|write) for \{\{user\}\}|do not (speak|act|write) for \{\{user\}\}/i, /(describe|write|control) \{\{user\}\}'s (actions|dialogue|thoughts)/i, 'acting for the user: forbidden vs asked'],
  ];
  return pairs.filter(([a, b]) => a.test(s) && b.test(s)).map(p => p[2]).join('; ');
}

export function checkPreset(p: Preset): { tokens: Record<string, number>; findings: Finding[] } {
  const f: Finding[] = [], on = (p.blocks || []).filter(b => b.enabled), tk: Record<string, number> = {};
  let fixed = 0;
  for (const b of on) { const n = tokens(b.content || ''); fixed += n; if (n > 1500) f.push({ level: 'note', code: 'bigBlock', where: b.name || b.kind, n }); }
  tk.fixed = fixed; tk.context = Number(p.params?.contextSize) || 0; tk.maxTokens = Number(p.params?.maxTokens) || 0;
  if (!on.some(b => b.kind === 'chatHistory')) f.push({ level: 'warn', code: 'noHistory', where: 'blocks' });
  if (!on.some(b => b.kind === 'main')) f.push({ level: 'note', code: 'noMain', where: 'blocks' });
  if (!on.some(b => b.kind === 'charDescription')) f.push({ level: 'warn', code: 'noCharDesc', where: 'blocks' });
  const kinds = new Map<string, number>(); for (const b of on) if (b.kind && b.kind !== 'custom' && b.kind !== 'text') kinds.set(b.kind, (kinds.get(b.kind) || 0) + 1);
  for (const [k, n] of kinds) if (n > 1 && ['chatHistory', 'main', 'charDescription', 'personaDescription', 'scenario', 'summary'].includes(k)) f.push({ level: 'warn', code: 'dupMarker', where: k, n });
  for (const b of on) if (!['main', 'worldInfoBefore', 'worldInfoAfter', 'personaDescription', 'charDescription', 'charPersonality', 'scenario', 'dialogueExamples', 'summary', 'chatHistory', 'jailbreak'].includes(b.kind) && !String(b.content || '').trim()) f.push({ level: 'note', code: 'emptyBlock', where: b.name || b.id });
  if (tk.context && tk.maxTokens >= tk.context) f.push({ level: 'warn', code: 'maxOverCtx', where: 'params.maxTokens', n: tk.maxTokens });
  if (tk.context && fixed > tk.context * 0.4) f.push({ level: 'warn', code: 'heavy', where: 'blocks', n: fixed });
  if (String(p.params?.prefill || '').trim()) f.push({ level: 'note', code: 'prefill', where: 'params.prefill' });
  for (const b of on) for (const d of macroIssues(b.content || '')) f.push({ level: 'warn', code: 'macro', where: b.name || b.kind, detail: d });
  const all = on.map(b => b.content || '').join('\n'); if (clash(all)) f.push({ level: 'note', code: 'clash', where: 'blocks', detail: clash(all) });
  return { tokens: tk, findings: f };
}
