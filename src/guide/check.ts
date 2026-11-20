// 점검: 캐릭터 카드와 프리셋의 흔한 문제를 앱이 직접 센다 (모델을 부르지 않는다). 조수는 이 결과를 읽고 풀어 설명한다
import { tokens } from '../lib/engine';
import { X } from '../lib/hooks';
import type { Char, Preset } from '../lib/types';

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
  for (const k of [...CHAR_TEXT, 'creatorNotes' as const]) { if (k === 'creatorNotes') continue; for (const d of macroIssues(String(c[k] || ''))) f.push({ level: 'warn', code: 'macro', where: String(k), detail: d }); }
  (c.altGreetings || []).forEach((g, i) => { for (const d of macroIssues(String(g || ''))) f.push({ level: 'warn', code: 'macro', where: `altGreetings[${i}]`, detail: d }); });
  if (/^\s*$/.test(c.name || '')) f.push({ level: 'warn', code: 'noName', where: 'name' });
  // 길이 지시가 서로 어긋나는지 (짧게 · 길게가 함께 있으면)
  const rules = [c.description, c.systemPrompt, c.postHistory, c.depthPrompt?.prompt].join('\n');
  if (clash(rules)) f.push({ level: 'note', code: 'clash', where: 'systemPrompt', detail: clash(rules) });
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
