// 등불지기의 도구: 앱 자료를 읽는 것과, 변경 카드를 남기는 것. 셸도 파일도 없다 — 여기 적힌 것이 조수가 할 수 있는 전부다
// 연결 · API 키 · 서버 설정 · 확장 코드는 읽기 도구에도 쓰기 도구에도 없다. 지우는 도구도 없다
import { S, chatConns, msgText, newRegex, uid } from '../lib/core';
import { tokens } from '../lib/engine';
import { allThemes, COLOR_FIELDS, FONTS } from '../lib/theme';
import { qrStore, type QrItem, type QrSet } from '../lib/qr-data';
import { isMvu, runtime as mvuRuntime, type Obj as MvuObj } from '../mvu/engine';
import { initBooks as mvuBooks, initOf as mvuInitOf } from '../mvu/app';
import { activeBooks, regexScripts, runRegexScript, scanLore, type LoreDiag } from '../lib/engine';
import { route } from '../lib/router';
import { t } from '../i18n';
import { varsOf } from '../chat/msgVars';
import { safeCss } from '../modules/logic';
import { cur } from '../chat/store';
import { buildNow } from '../chat/Inspector';
import type { Char, Chat, Msg, Persona, Preset } from '../lib/types';
import { checkChar, checkPersona, checkPreset, type Finding } from './check';
import { current, getPath } from './changes';
import { searchHelp, topicText } from './handbook';
import { syntaxOf } from './syntax';
import type { Change, FieldChange, Item, Kind, Op, Plan, ToolDef } from './types';

/** 도구가 지금 대화를 들여다보는 자리 (agent 가 채운다): 앞서 읽은 것 · 할 일 목록 · 기다리는 변경 카드 */
export interface ToolCtx { items(): Item[]; plan(): Plan | undefined; setPlan(p: Plan | undefined): void }
let CTX: ToolCtx = { items: () => [], plan: () => undefined, setPlan: () => { } };
export const setToolCtx = (c: ToolCtx) => { CTX = c; };

type Args = Record<string, unknown>;
type Obj = Record<string, unknown>;
const CLIP = 500, FULL = 9000, PAGE = 20;
const str = (v: unknown) => v == null ? '' : String(v);
const num = (v: unknown, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
/** 큰 칸은 잘라서 주고, 어떻게 다시 읽는지 적어 둔다 */
const clip = (v: unknown, field: string, n = CLIP) => { const s = str(v); return s.length <= n ? s : `${s.slice(0, n)}… [cut: ${s.length} chars total, read all with field="${field}"]`; };
/** field= 로 한 칸만 읽을 때: 아주 길면 offset 으로 이어 읽게 */
function whole(v: unknown, a: Args) { const s = typeof v === 'string' ? v : JSON.stringify(v ?? null, null, 1), off = Math.max(0, num(a.offset)); return { length: s.length, offset: off, text: s.slice(off, off + FULL), ...(off + FULL < s.length ? { nextOffset: off + FULL } : {}) }; }

class ToolError extends Error { }
const fail = (m: string): never => { throw new ToolError(m); };
/** id 나 이름으로 하나를 찾는다. 이름이 여럿에 걸리면 후보를 돌려줘 다시 고르게 한다 */
function find<T extends { id: string; name?: string }>(list: T[], ref: unknown, what: string): T {
  const r = str(ref).trim(); if (!r) fail(`Give the ${what} "id" (or exact name). Use list to see them.`);
  const byId = list.find(x => x.id === r); if (byId) return byId;
  const low = r.toLowerCase(), exact = list.filter(x => str(x.name).toLowerCase() === low);
  if (exact.length === 1) return exact[0];
  const part = exact.length ? exact : list.filter(x => str(x.name).toLowerCase().includes(low));
  if (part.length === 1) return part[0];
  return fail(part.length ? `"${r}" matches several ${what}s: ${part.slice(0, 8).map(x => `${x.name} (id ${x.id})`).join('; ')}. Use the id.` : `No ${what} matches "${r}". Use list to see what exists.`);
}
const page = <T,>(rows: T[], a: Args, size = PAGE) => { const off = Math.max(0, num(a.offset)); return { total: rows.length, offset: off, rows: rows.slice(off, off + size), ...(off + size < rows.length ? { nextOffset: off + size } : {}) }; };
const hit = (q: unknown, ...texts: unknown[]) => { const ws = str(q).toLowerCase().split(/\s+/).filter(Boolean); const t = texts.map(str).join(' ').toLowerCase(); return ws.every(w => t.includes(w)); };

// ── 쓸 수 있는 칸 ── 여기 없는 칸은 조수가 고칠 수 없다
type FType = 's' | 'n' | 'b' | 'list' | string[];
const F: Record<string, Record<string, FType>> = {
  chars: { name: 's', description: 's', personality: 's', scenario: 's', firstMes: 's', mesExample: 's', systemPrompt: 's', postHistory: 's', creatorNotes: 's', creator: 's', tags: 'list', altGreetings: 'list', talk: 'n', 'depthPrompt.prompt': 's', 'depthPrompt.depth': 'n' },
  personas: { name: 's', description: 's' },
  lore: { name: 's', description: 's', scanDepth: 'n', tokenBudget: 'n', recursive: 'b' },
  entry: { name: 's', keys: 'list', keys2: 'list', content: 's', constant: 'b', enabled: 'b', position: ['before', 'after', 'depth'], depth: 'n', order: 'n', probability: 'n', description: 's', group: 's' },
  block: { name: 's', role: ['system', 'user', 'assistant'], content: 's', enabled: 'b', depth: 'n', when: 's' },
  regex: { name: 's', find: 's', replace: 's', onUser: 'b', onAI: 'b', onSlash: 'b', onLore: 'b', onReason: 'b', mode: ['display', 'prompt', 'both', 'store'], enabled: 'b', scope: 's', minDepth: 'n', maxDepth: 'n', trim: 'list', runOnEdit: 'b' },
  /** 프리셋의 샘플러 · 생성 설정 (params.<이름> 으로 쓴다) */
  params: { temperature: 'n', topP: 'n', topK: 'n', minP: 'n', topA: 'n', freqPen: 'n', presPen: 'n', repPen: 'n', seed: 'n', maxTokens: 'n', contextSize: 'n', stream: 'b', effort: ['', 'low', 'medium', 'high'], squash: 'b', prefill: 's', stop: 'list' },
};
/** 비워(null) 둘 수 있는 숫자 칸 */
const NULLABLE = new Set(['depth', 'minDepth', 'maxDepth', 'temperature', 'topP', 'topK', 'minP', 'topA', 'freqPen', 'presPen', 'repPen', 'seed']);
/** 받은 칸을 꼴에 맞춰 고른다. 모르는 칸 · 틀린 값은 까닭과 함께 거절한다 */
function fields(kind: keyof typeof F, raw: unknown, need: string[] = []): Obj {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('"fields" must be an object of field → new value.');
  const spec = F[kind], out: Obj = {};
  for (const [k, v] of Object.entries(raw as Obj)) {
    const t = spec[k]; if (!t) fail(`Field "${k}" cannot be written. Writable: ${Object.keys(spec).join(', ')}.`);
    if (t === 's') { if (typeof v !== 'string') fail(`"${k}" must be a string.`); out[k] = v; }
    else if (t === 'n') { if (v === null && NULLABLE.has(k)) out[k] = null; else if (!Number.isFinite(Number(v)) || v === '' || typeof v === 'boolean') fail(`"${k}" must be a number.`); else out[k] = Number(v); }
    else if (t === 'b') { if (typeof v !== 'boolean') fail(`"${k}" must be true or false.`); out[k] = v; }
    else if (t === 'list') { if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) fail(`"${k}" must be an array of strings.`); out[k] = v; }
    else { if (!t.includes(str(v))) fail(`"${k}" must be one of: ${t.join(', ')}.`); out[k] = v; }
  }
  for (const k of need) if (!str(out[k]).trim()) fail(`"${k}" is required.`);
  if (!Object.keys(out).length) fail('No fields given.');
  return out;
}
const show = (v: unknown): string => Array.isArray(v) ? v.map(str).join(v.some(x => str(x).length > 40 || str(x).includes('\n')) ? '\n— — —\n' : ', ') : typeof v === 'boolean' ? (v ? 'on' : 'off') : v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : str(v);
const diffs = (before: unknown, after: Obj): FieldChange[] => Object.entries(after).map(([name, v]) => ({ name, before: show(getPath(before, name)), after: show(v) })).filter(f => f.before !== f.after);

/** 쓰기 도구가 돌려주는 것: 화면이 이것을 변경 카드로 만든다 */
export interface Proposal { change: Change; /** 모델에 함께 돌려줄 점검 결과 (카드 글 점검 · 스크립트 점검) */ notes?: unknown; /** 같은 이름이 이미 있을 때의 경고 (고치기 도구를 쓰라고) */ warn?: string }
export const isProposal = (v: unknown): v is Proposal => !!v && typeof v === 'object' && 'change' in v && !!(v as Proposal).change?.op;
function propose(verb: Change['verb'], kind: Kind, target: string, op: Op, fs: FieldChange[]): Proposal {
  if (!fs.length) fail('Nothing would change: the new values equal the current ones.');
  return { change: { id: uid(), verb, kind, target, op, fields: fs, state: 'pending', at: Date.now() } };
}
/** 만들기 카드: 낱값 칸만 그대로 보이고, 묶음(항목 · 색)은 extra 로 풀어 적는다 */
const flat = (o: Obj) => Object.fromEntries(Object.entries(o).filter(([, v]) => !(v && typeof v === 'object' && (!Array.isArray(v) || v.some(x => x && typeof x === 'object')))));
const created = (kind: Kind, name: string, obj: Obj, extra: FieldChange[] = [], link = '') => propose('create', kind, name, { type: 'create', coll: kind, obj, ...(link ? { link: { char: link } } : {}) }, [...diffs({}, flat(obj)), ...extra, ...(link ? [{ name: 'character', before: '', after: S.get('chars', link)?.name || link }] : [])]);
/** character= 로 받은 이름이나 id. 이미 있는 캐릭터면 그 id, 아직 없으면(같은 메시지에서 만드는 중) 이름 그대로 — 적용할 때 잇는다 */
const forChar = (v: unknown): { id: string; link: string } => { const s = str(v).trim(); if (!s) return { id: '', link: '' }; const key = s.toLowerCase(), c = S.get('chars', s) || [...S.chars].reverse().find(x => (x.name || '').trim().toLowerCase() === key); return { id: c?.id || '', link: c?.id || s }; };
/** 만들려는 것과 같은 이름이 이미 있으면 경고 한 줄: 새로 만들지 말고 고치기 도구로 */
function dupWarn(list: { id: string; name?: string }[], name: string, what: string, tool: string): string | undefined {
  const same = list.filter(x => str(x.name).trim().toLowerCase() === name.trim().toLowerCase());
  return same.length ? `A ${what} named "${name}" already exists (id ${same.map(x => x.id).join(', ')}). If the user wants to change that one, do not create a duplicate: tell the user this card would make a second copy (they can discard it), and propose ${tool} on the existing id instead.` : undefined;
}
/** 지우기 카드: 지울 것의 칸들을 "전 → 빈칸"으로 보인다 */
const gone = (o: Obj, keys: string[]): FieldChange[] => keys.map(k => ({ name: k, before: show(getPath(o, k)), after: '' })).filter(f => f.before);

// ── 고치기 전에 읽었는가 ── 코딩 도우미처럼: 읽지 않은 것은 고치지 않는다 (이 대화에서 읽기 도구가 그 대상을 성공적으로 읽었어야 한다)
const READERS: Record<string, string[]> = { chars: ['get_character'], personas: ['get_persona'], lore: ['get_lorebook', 'get_lore_entry'], presets: ['get_preset', 'get_preset_block'], qr: ['get_qr_set', 'get_qr'], regex: ['get_regex'], theme: ['get_theme'] };
let skipRead = false;
function mustHaveRead(kind: keyof typeof READERS, id: string, ...refKeys: string[]) {
  if (skipRead) return;
  const list = kind === 'chars' ? S.chars : kind === 'personas' ? S.personas : kind === 'lore' ? S.lore : kind === 'presets' ? S.presets : kind === 'regex' ? S.regex : kind === 'theme' ? allThemes() : qrStore().sets;
  const ok = CTX.items().some(it => {
    if (it.k !== 'tool' || !it.ok || !READERS[kind].includes(it.name)) return false;
    for (const k of [...refKeys, 'id', 'name', 'book', 'preset', 'set']) { const r = it.args[k]; if (r == null) continue; try { if (find(list as { id: string; name?: string }[], r, 'item').id === id) return true; } catch { /* 다른 것 */ } }
    return false;
  });
  if (!ok) fail(`Read it first: call ${READERS[kind][0]} on this item in this conversation before proposing changes, so you edit what is really there.`);
}

/** 조수가 바꿔도 되는 앱 설정 (점으로 이은 길 → 꼴). 키 · 연결 · 서버 · 보안 · 저장 위치는 넣지 않는다 */
const SETTINGS: Record<string, 'b' | 's' | [number, number] | string[]> = {
  theme: 's', font: 's', chatFont: 's', fontSize: [12, 24], lineHeight: [1.2, 2.4], chatWidth: [480, 1600], bubbles: 'b', rpBubbles: 'b', motion: 'b', autoScroll: 'b', showMeta: 'b', enterSend: ['true', 'false', 'auto'], defaultMode: ['rp', 'talk'],
  'translate.auto': 'b', 'translate.autoInput': 'b', 'translate.lang': 's', 'translate.inputLang': 's',
  'memory.enabled': 'b', 'memory.auto': 'b', 'tracker.enabled': 'b', 'tracker.hud': 'b',
  'illust.auto': 'b', 'illust.every': [1, 20], 'illust.maxScenes': [1, 4],
  'modes.choices': 'b', 'modes.choiceCount': [2, 5], 'modes.stagger': 'b', 'modes.together': 'b', 'modes.scenes': 'b', 'modes.presenceDelay': 'b', 'modes.talkTokens': [100, 4000],
};
/** 정규식의 바꿀 글(replace)에 든 HTML 을 살핀다: 화면(```html 로 감싼 한 장의 문서)의 스크립트 문법, 인라인 HTML 에서 지워지는 것, 테마를 따르는지.
 *  errors 가 있으면 제안을 거절한다 (모델이 읽고 고친다). notes 는 결과에 함께 돌려준다 */
async function panelLint(replace: string, mode: string): Promise<{ errors: string[]; notes: string[] }> {
  const errors: string[] = [], notes: string[] = [];
  if (!replace || mode === 'prompt' || mode === 'store') return { errors, notes };
  const pages: string[] = [];
  const outside = replace.replace(/(^|\n)[ \t]*(```+|~~~+)[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g, (_m, a: string, _f: string, code: string) => { if (/html>|<head>|<body|<script\b|<!doctype/i.test(code) || (/<style[\s>]/i.test(code) && /<(div|section|main|table)\b/i.test(code))) { pages.push(code); return a; } return a + code; });
  const scripts: { tag: string; no: number; code: string }[] = [];
  pages.forEach((pg, pi) => {
    const tag = pages.length > 1 ? `screen ${pi + 1}` : 'the screen'; let si = 0;
    for (const m of pg.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      si++; const attrs = m[1], code = m[2];
      if (/\bsrc\s*=/.test(attrs)) { if (/\bsrc\s*=\s*["']?https?:/i.test(attrs)) notes.push(`${tag} loads a remote script (${(/src\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1]}). It fails offline and slows every message; jQuery is already there, and Tailwind, Font Awesome and Vue load by themselves when the page uses them.`); continue; }
      if (/\btype\s*=\s*["']?(module|text\/template|application\/json)/i.test(attrs) || !code.trim()) continue;
      scripts.push({ tag, no: si, code });
    }
    if (!/<body/i.test(pg) && !/html>|<head>/i.test(pg)) notes.push(`${tag} has no <body>: wrap the page in <body>…</body> so it is always drawn as a screen.`);
    if (/url\(\s*["']?https?:|@import|<link\b[^>]*https?:/i.test(pg)) notes.push(`${tag} pulls remote styles, fonts or images. Prefer none: they fail offline.`);
    if (!/--dl-/.test(pg) && /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(pg)) notes.push(`${tag} uses fixed colours only. Use the theme variables (--dl-bg, --dl-surface, --dl-surface2, --dl-text, --dl-dim, --dl-accent, --dl-on-accent, --dl-line, --dl-ok, --dl-bad) so it fits both light and dark themes.`);
    if (/position\s*:\s*fixed|\b\d+(\.\d+)?vh\b/i.test(pg)) notes.push(`${tag} uses position: fixed or vh heights. The frame sizes itself to the content; lay out in normal flow.`);
    { const wide = [...pg.matchAll(/(?:^|[;{\s"'])(?:min-)?width\s*:\s*(\d{3,4})px/gi)].map(m => +m[1]).filter(n => n > 420); if (wide.length) notes.push(`${tag} has a fixed width of ${Math.max(...wide)}px, wider than a phone. Use width: 100% with a max-width and let rows wrap, so it fits both phones and desktops.`); }
    if (/<script\b/i.test(pg) && !/triggerSlash|getVariables|Mvu\.|eventOn/.test(pg)) notes.push(`${tag} has a script but never reads variables or acts (getVariables / triggerSlash). If it only decorates, inline HTML would be lighter.`);
  });
  // 스크립트 문법은 격리된 틀에서 살핀다 (앱 화면에서는 글로 된 코드를 풀 수 없다)
  (await syntaxOf(scripts.map(x => x.code))).forEach((err, i) => { if (err) errors.push(`${scripts[i].tag}, script ${scripts[i].no}: ${err}. Fix the JavaScript (a classic script: no top-level await or import) and send the call again.`); });
  const gone = [/<script\b/i.test(outside) && '<script>', /<button\b/i.test(outside) && '<button>', /<(input|select|textarea)\b/i.test(outside) && 'form fields', /<[a-z][^>]*\son[a-z]+\s*=/i.test(outside) && 'on…= handlers'].filter(Boolean);
  if (gone.length) errors.push(`${gone.join(', ')} outside a screen ${gone.length > 1 ? 'are' : 'is'} removed when the message is drawn, so this would not work. To make it interactive, put the whole panel in one fenced block — three backticks + html, then a page with <body>…</body>, then three backticks — or, for a readout that only folds and animates, use <details> and CSS and drop ${gone.length > 1 ? 'them' : 'it'}.`);
  { const wide = [...outside.matchAll(/(?:^|[;{\s"'])(?:min-)?width\s*:\s*(\d{3,4})px/gi)].map(m => +m[1]).filter(n => n > 420); if (wide.length) notes.push(`The inline HTML has a fixed width of ${Math.max(...wide)}px, wider than a phone. Use width: 100% with a max-width so it fits both phones and desktops.`); }
  if (!pages.length && /<(div|table|section|details)\b/i.test(outside) && !/var\(--/.test(outside) && /#[0-9a-f]{3,8}\b|rgba?\(/i.test(outside)) notes.push('The inline HTML uses fixed colours only. Use var(--text), var(--dim), var(--surface), var(--accent), var(--line) so it follows the theme.');
  return { errors, notes };
}
/** 카드 · 페르소나 글을 점검해 모델에 돌려줄 짧은 줄들 (토큰 수는 빼고) */
const brief = (fs: Finding[]) => fs.filter(f => !['heavyish'].includes(f.code)).map(f => `${f.level} ${f.code} @${f.where}${f.n != null ? ` (${f.n})` : ''}${f.detail ? ': ' + f.detail : ''}`);
function cardNotes(base: Obj, fields: Obj) {
  const c = structuredClone(base) as Obj; for (const [k, v] of Object.entries(fields)) setPathLocal(c, k, v);
  const r = checkChar(c as unknown as Char), lines = brief(r.findings);
  return lines.length ? { findings: lines, alwaysTokens: r.tokens.always } : { findings: 'none', alwaysTokens: r.tokens.always };
}
function personaNotes(base: Obj, fields: Obj) { const r = checkPersona({ ...base, ...fields } as unknown as Persona), lines = brief(r.findings); return { findings: lines.length ? lines : 'none', tokens: r.tokens.description }; }
function setPathLocal(o: Obj, path: string, v: unknown) { const ks = path.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = (t[k] && typeof t[k] === 'object' ? t[k] : (t[k] = {})) as Obj; t[ks[ks.length - 1]] = v; }

// ── 퀵 리플라이 ──
const AUTO_KEYS = ['open', 'newChat', 'user', 'ai', 'gen', 'start'] as const;
const qrRef = (ref: unknown) => find(qrStore().sets, ref, 'quick-reply set');
const itemRef = (set: QrSet, ref: unknown): QrItem => { const f = find(set.items.map(i => ({ id: i.id, name: i.label })), ref, 'button'); return set.items.find(i => i.id === f.id)!; };
const autoOn = (a: QrItem['auto'] | undefined) => AUTO_KEYS.filter(k => a?.[k]);
/** 버튼 칸을 꼴에 맞춰 고른다 (label · text · kind · title · hidden · auto) */
function qrFields(raw: unknown, need = false): Obj {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Button fields must be an object.');
  const o = raw as Obj, out: Obj = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'label' || k === 'title') { if (typeof v !== 'string') fail(`"${k}" must be a string.`); out[k] = v; }
    else if (k === 'text' || k === 'script' || k === 'message') { if (typeof v !== 'string') fail(`"${k}" must be a string.`); out.text = v; }
    else if (k === 'kind') { if (!['insert', 'send', 'script'].includes(str(v))) fail('"kind" must be "insert", "send" or "script".'); out.kind = v; }
    else if (k === 'hidden') { if (typeof v !== 'boolean') fail('"hidden" must be true or false.'); out.hidden = v; }
    else if (k === 'auto') {
      const list = Array.isArray(v) ? v.map(str) : v && typeof v === 'object' ? Object.entries(v as Obj).filter(([, x]) => x === true).map(([x]) => x) : fail('"auto" must be a list like ["open","ai"] or an object {open: true}.');
      for (const x of list) if (!(AUTO_KEYS as readonly string[]).includes(x)) fail(`Unknown auto-run "${x}". Use: open (when a chat opens), newChat (first time a new chat opens), user (after the user sends), ai (after a reply arrives), gen (when generation starts), start (when the app starts).`);
      out.auto = Object.fromEntries(list.map(x => [x, true]));
    } else if (k !== 'set' && k !== 'item') fail(`Button field "${k}" cannot be written. Writable: label, text (or script), kind, title, hidden, auto.`);
  }
  if (need && !str(out.label).trim()) fail('Each button needs a "label".');
  if (need && !str(out.text).trim()) fail('Each button needs "text" (or "script").');
  if (out.text !== undefined && !out.kind && need) out.kind = /^\s*\//.test(str(out.text)) ? 'script' : 'insert';
  return out;
}
/** 스크립트 버튼을 점검한다: 문법 오류면 거절, 경고는 돌려준다 */
async function lintButtons(list: { label: string; text: string; kind?: unknown }[], siblings: string[]) {
  const { checkScript } = await import('../stscript/ref');
  const warn: Obj = {};
  for (const b of list) {
    if (b.kind !== 'script' && !(b.kind === undefined && /^\s*\//.test(b.text))) continue;
    const r = checkScript(b.text, siblings);
    if (r.errors) fail(`The script of button "${b.label}" has errors, so it was not proposed. Fix them (st_check shows the same report):\n${r.issues.filter(i => i.level === 'error').map(i => `line ${i.line}:${i.col} ${i.msg}`).join('\n')}`);
    if (r.issues.length) warn[b.label] = r.issues.map(i => `line ${i.line}:${i.col} ${i.msg}`);
  }
  return Object.keys(warn).length ? { scriptWarnings: warn } : { scripts: 'no problems found' };
}
const qrCard = (i: Obj) => `${str(i.label)} · ${str(i.kind || 'insert')}${(i.auto && typeof i.auto === 'object' && Object.keys(i.auto).length) ? ' · auto: ' + Object.keys(i.auto as Obj).join(',') : ''}${i.hidden ? ' · hidden' : ''}`;

/** 테마 칸: name · tone · colors{…} · css → 바꿀 길(c.<색>)과 값 */
function themeFields(raw: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'name') { if (!str(v).trim()) fail('"name" cannot be empty.'); out.name = str(v); }
    else if (k === 'tone') { if (v !== 'light' && v !== 'dark') fail('"tone" must be "light" or "dark".'); out.tone = v; }
    else if (k === 'css') out.css = safeCss(v).trim();
    else if (k === 'colors' || k === 'c') { if (!v || typeof v !== 'object') fail('"colors" must be an object.'); for (const [ck, cv] of Object.entries(v as Obj)) { if (!COLORS.includes(ck)) fail(`Unknown colour "${ck}". Colours: ${COLORS.join(', ')}.`); const x = str(cv).trim(); if (!/^#[0-9a-f]{6}$/i.test(x)) fail(`colors.${ck} must be #rrggbb.`); out['c.' + ck] = x.toLowerCase(); } }
    else fail(`"${k}" cannot be written. Writable: name, tone, colors, css.`);
  }
  if (!Object.keys(out).length) fail('No fields given.');
  return out;
}
/** 프리셋 설정 칸 → params.<이름> (name 은 그대로) */
function presetFields(raw: unknown): Obj {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('"fields" must be an object.');
  const { name, ...rest } = raw as Obj, out: Obj = {};
  if (name !== undefined) { if (!str(name).trim()) fail('"name" cannot be empty.'); out.name = str(name); }
  if (Object.keys(rest).length) for (const [k, v] of Object.entries(fields('params', rest))) out['params.' + k] = v;
  if (!Object.keys(out).length) fail('No fields given.');
  return out;
}

// ── 변수 갱신 틀(MVU) ──
/** 대화의 지금 변수: 가장 마지막 메시지의 stat_data, 없으면 로어북의 [InitVar] 항목들 */
async function mvuOf(ref: unknown) {
  const c = openChat(ref), list = (cur.chat?.id === c.id ? cur.msgs : await S.msgs(c.id));
  for (let i = list.length - 1; i >= 0; i--) if (isMvu(varsOf(list[i]))) return { chat: c, source: `message ${i + 1}`, data: varsOf(list[i]) as unknown as { stat_data: MvuObj; schema?: MvuObj } };
  let init: { stat_data: MvuObj; schema?: MvuObj } | null = null;
  try { init = (await mvuInitOf(c)).data as unknown as { stat_data: MvuObj; schema?: MvuObj }; } catch { init = null; }
  return { chat: c, source: init && Object.keys(init.stat_data).length ? 'initial variables ([InitVar] lorebook entries)' : 'none', data: init };
}
const initEntries = () => S.lore.flatMap(b => b.entries.filter(e => /\[initvar\]/i.test(e.name || '')).map(e => ({ book: b.name, bookId: b.id, entry: e.id, name: e.name, enabled: e.enabled })));
const hasInit = (b: { entries?: { name?: string }[] }) => (b.entries || []).some(e => /\[initvar\]/i.test(e.name || ''));
/** 이 대화가 MVU 를 쓰는지, 처음 값은 어디서 오는지, 없으면 왜 없는지 — 사람 말 한 덩이 (모델이 짐작하지 않게) */
async function mvuDiagnosis(c: Chat) {
  const list = cur.chat?.id === c.id ? cur.msgs : await S.msgs(c.id);
  const withVars = list.map((m, i) => isMvu(varsOf(m)) ? i : -1).filter(i => i >= 0), last = list.length - 1;
  const linked = mvuBooks(c), linkedInit = linked.filter(hasInit), linkedIds = new Set(linked.map(b => b.id));
  const unlinkedInit = S.lore.filter(b => hasInit(b) && !linkedIds.has(b.id));
  const panel = t('mvu.panel.title'), reload = t('mvu.panel.reload');
  const fix = `Link that lorebook to the character (character card › lorebooks) or to this chat, then in the chat open the side panel "${panel}" and press "${reload}" (or start a new chat).`;
  let usesMvu: boolean, status: string;
  if (withVars.length) {
    usesMvu = true;
    status = `This chat uses MVU: ${withVars.length} of ${list.length} messages carry variables. The values below are from message ${withVars[withVars.length - 1] + 1}${withVars[withVars.length - 1] === last ? ' (the latest message)' : `; the latest message (${last + 1}) has none of its own yet`}.`;
    if (!linkedInit.length) status += ' Note: no linked lorebook has an [InitVar] entry now, so a NEW chat would start without variables.';
  } else if (linkedInit.length) {
    usesMvu = false;
    status = `No message in this chat carries MVU variables yet, although the linked lorebook(s) ${linkedInit.map(b => `"${b.name}" (id ${b.id})`).join(', ')} have an [InitVar] entry. The chat probably started before the lorebook was linked or before the entry existed. Every {{get_message_variable::stat_data…}} macro is empty until then, which a status bar shows as null. In the chat open the side panel "${panel}" and press "${reload}", or start a new chat. The values below are what the [InitVar] entries would give.`;
  } else if (unlinkedInit.length) {
    usesMvu = false;
    status = `This chat has NO MVU variables. Lorebook(s) ${unlinkedInit.map(b => `"${b.name}" (id ${b.id})`).join(', ')} contain an [InitVar] entry but are not linked to this chat's character, the chat, the persona, or turned on globally. So every {{get_message_variable::stat_data…}} macro is empty, which a status bar shows as null or as its own default values. ${fix}`;
  } else {
    usesMvu = false;
    status = 'This chat has NO MVU variables and no lorebook anywhere has an [InitVar] entry. Variables start from a lorebook entry whose name contains [InitVar] (JSON or YAML content, kept disabled), in a lorebook linked to the character or chat.';
  }
  return { usesMvu, status, messagesWithVars: withVars.length, linkedLorebooks: linked.map(b => ({ id: b.id, name: b.name, hasInitVar: hasInit(b) })), ...(unlinkedInit.length ? { unlinkedInitVarLorebooks: unlinkedInit.map(b => ({ id: b.id, name: b.name, usedBy: S.chars.filter(ch => (ch.loreIds || []).includes(b.id)).map(ch => ch.name) })) } : {}) };
}

/** 첫 메시지에 붙이는 지금 맥락: 열린 대화 · 캐릭터 · 이어진 로어북(항목 이름) · 프리셋 · 걸린 정규식 · MVU — list 를 따로 부르지 않아도 되게. 짧게 */
export function contextSnapshot(): string {
  const c = cur.chat as Chat | null, lines: string[] = [`page=${route.page}`];
  if (route.page !== 'chat' || !c) {
    if (route.arg && typeof route.arg === 'string') { const hit = [['chars', S.chars], ['lore', S.lore], ['presets', S.presets], ['personas', S.personas], ['regex', S.regex]].map(([k, l]) => [k, (l as { id: string; name?: string }[]).find(x => x.id === route.arg)] as const).find(x => x[1]); if (hit) lines.push(`open item: ${hit[0]} "${hit[1]!.name}" (id ${hit[1]!.id})`); }
    lines.push(`library: ${S.chars.length} characters, ${S.lore.length} lorebooks, ${S.presets.length} presets, ${S.regex.length} regex scripts, ${S.personas.length} personas`);
    return lines.join('\n');
  }
  const chars = c.charIds.map(i => S.get('chars', i)).filter(Boolean) as Char[];
  lines.push(`open chat: "${chatTitle(c)}" (id ${c.id}), mode ${c.mode}, ${cur.msgs.length} messages`);
  lines.push(`characters: ${chars.map(ch => `"${ch.name}" (id ${ch.id})`).join(', ') || 'none'}`);
  const pr = S.persona(c); if (pr) lines.push(`persona: "${pr.name}" (id ${pr.id})`);
  const p = S.presetFor(c); if (p) lines.push(`preset: "${p.name}" (id ${p.id})`);
  let books: { id: string; name: string; entries: { name?: string; keys?: string[]; enabled?: boolean; constant?: boolean }[] }[] = [];
  try { books = activeBooks(c, chars, pr) as unknown as typeof books; } catch { books = []; }
  if (books.length) lines.push('lorebooks in use:\n' + books.slice(0, 6).map(b => `- "${b.name}" (id ${b.id}), ${b.entries.length} entries: ${b.entries.slice(0, 14).map(e => (e.name || (e.keys || []).slice(0, 2).join('/') || '?').slice(0, 40) + (e.enabled === false ? ' [off]' : '')).join('; ')}${b.entries.length > 14 ? '; …' : ''}`).join('\n') + (books.length > 6 ? `\n- … ${books.length - 6} more` : ''));
  else lines.push('lorebooks in use: none');
  try { const rx = regexScripts({ chat: c }).filter(x => !x.skip); if (rx.length) lines.push(`regex scripts on this chat: ${rx.slice(0, 15).map(x => `"${x.r.name}" (id ${x.r.id}, ${x.kind}${x.r.enabled === false ? ', off' : ''}, ${x.r.mode})`).join('; ')}${rx.length > 15 ? '; …' : ''}`); } catch { /* 없으면 뺀다 */ }
  const withVars = cur.msgs.some(m => isMvu(varsOf(m))), initLinked = books.some(hasInit);
  if (withVars || initLinked) lines.push(`MVU: ${withVars ? 'this chat has variables (get_mvu shows them)' : 'a linked lorebook has [InitVar] but no message carries variables yet'}`);
  else if (S.lore.some(hasInit)) lines.push('MVU: no variables in this chat; some [InitVar] lorebook exists but is not linked here');
  return lines.join('\n');
}

// ── 읽기 ──
const charBrief = (c: Char) => ({ id: c.id, name: c.name, tags: c.tags, tokens: tokens([c.description, c.personality, c.scenario].join('\n')), greetings: (c.firstMes ? 1 : 0) + (c.altGreetings || []).length, lorebooks: (c.loreIds || []).length });
const chatTitle = (c: Chat) => c.name || c.charIds.map(i => S.get('chars', i)?.name).filter(Boolean).join(', ') || c.id;
const msgRow = (m: Msg, i: number, n = 400) => ({ no: i + 1, id: m.id, role: m.role, name: m.name, ...(m.hidden ? { hidden: true } : {}), ...(m.swipes.length > 1 ? { swipes: m.swipes.length } : {}), text: clip(msgText(m), 'text', n) });
const openChat = (ref: unknown): Chat => str(ref).trim() ? S.get('chats', find(S.chats.map(c => ({ id: c.id, name: chatTitle(c) })), ref, 'chat').id) as Chat : (cur.chat as Chat | null) || fail('No chat is open. Give a chat id (use list kind="chats").');

const LISTS: Record<string, (a: Args) => unknown[]> = {
  characters: a => S.chars.filter(c => hit(a.query, c.name, c.tags, c.description)).map(charBrief),
  personas: a => S.personas.filter(p => hit(a.query, p.name, p.description)).map(p => ({ id: p.id, name: p.name, default: S.settings.activePersona === p.id, tokens: tokens(p.description) })),
  lorebooks: a => S.lore.filter(b => hit(a.query, b.name, b.description)).map(b => ({ id: b.id, name: b.name, entries: b.entries.length, global: S.settings.activeLore.includes(b.id), usedBy: S.chars.filter(c => (c.loreIds || []).includes(b.id)).map(c => c.name) })),
  presets: a => S.presets.filter(p => hit(a.query, p.name)).map(p => ({ id: p.id, name: p.name, active: S.settings.activePreset === p.id, blocks: p.blocks.length })),
  regex: a => S.regex.filter(r => hit(a.query, r.name, r.find)).map(r => ({ id: r.id, name: r.name, enabled: r.enabled, scope: r.scope === 'global' ? 'global' : S.get('chars', r.scope)?.name || r.scope, mode: r.mode })),
  themes: a => allThemes().filter(t => hit(a.query, t.name)).map(t => ({ id: t.id, name: t.name, tone: t.tone, builtin: !!t.builtin, active: S.settings.theme === t.id })),
  chats: a => [...S.chats].filter(c => hit(a.query, chatTitle(c), c.preview) && (!a.character || c.charIds.includes(find(S.chars, a.character, 'character').id))).sort((x, y) => y.updatedAt - x.updatedAt).map(c => ({ id: c.id, title: chatTitle(c), mode: c.mode, messages: c.count, updated: new Date(c.updatedAt).toISOString().slice(0, 16), open: cur.chat?.id === c.id })),
  quick_replies: a => qrStore().sets.filter(s => hit(a.query, s.name, s.items.map(i => i.label))).map(s => ({ id: s.id, name: s.name, scope: s.scope, on: s.on, buttons: s.items.map(i => i.label), ...(s.items.some(i => autoOn(i.auto).length) ? { autoRun: s.items.filter(i => autoOn(i.auto).length).map(i => `${i.label}: ${autoOn(i.auto).join(',')}`) } : {}) })),
  // 연결은 이름 · 제공자 · 모델만. 주소와 키는 조수에게 보이지 않는다
  connections: () => chatConns().map(c => ({ name: c.name, provider: c.provider, model: c.model, active: S.settings.activeConn === c.id })),
};

const R: ToolDef[] = [
  { name: 'list', sig: '{kind: "characters"|"personas"|"lorebooks"|"presets"|"regex"|"themes"|"chats"|"quick_replies"|"connections", query?, offset?, character?}', desc: 'List items with ids. 20 per page. character= filters chats.',
    run: a => { const f = LISTS[str(a.kind)] || fail(`Unknown kind. One of: ${Object.keys(LISTS).join(', ')}.`); return page(f(a), a); } },
  { name: 'get_character', sig: '{id, field?, offset?}', desc: 'Character card. Long fields are cut; pass field="description" (etc.) to read one field in full.',
    run: a => { const c = find(S.chars, a.id ?? a.name, 'character'); if (a.field) return whole(getPath(c, str(a.field)) ?? fail(`No field "${a.field}".`), a);
      const o: Obj = { id: c.id, name: c.name, tags: c.tags, creator: c.creator }; for (const k of ['description', 'personality', 'scenario', 'firstMes', 'mesExample', 'systemPrompt', 'postHistory', 'creatorNotes']) o[k] = clip(c[k], k);
      return { ...o, altGreetings: (c.altGreetings || []).map((g, i) => clip(g, `altGreetings.${i}`, 160)), depthPrompt: { depth: c.depthPrompt?.depth, prompt: clip(c.depthPrompt?.prompt, 'depthPrompt.prompt', 200) }, lorebooks: (c.loreIds || []).map(i => ({ id: i, name: S.get('lore', i)?.name })), talk: c.talk }; } },
  { name: 'get_persona', sig: '{id, field?}', desc: 'A persona (who the user plays).',
    run: a => { const p = find(S.personas, a.id ?? a.name, 'persona'); return a.field ? whole(getPath(p, str(a.field)), a) : { id: p.id, name: p.name, description: clip(p.description, 'description', 1200), default: S.settings.activePersona === p.id }; } },
  { name: 'get_lorebook', sig: '{id, query?, offset?}', desc: 'Lorebook settings and a page of entries (id, name, keys, short content). query= filters entries by words.',
    run: a => { const b = find(S.lore, a.id ?? a.name, 'lorebook'); const rows = b.entries.filter(e => hit(a.query, e.name, e.keys, e.content)).map(e => ({ id: e.id, name: e.name, keys: e.keys, ...(e.constant ? { constant: true } : {}), ...(e.enabled ? {} : { enabled: false }), ...(e.locked ? { locked: true } : {}), position: e.position, tokens: tokens(e.content), content: clip(e.content, 'content (get_lore_entry)', 140) }));
      return { id: b.id, name: b.name, description: clip(b.description, 'description', 300), scanDepth: b.scanDepth, tokenBudget: b.tokenBudget, recursive: b.recursive, global: S.settings.activeLore.includes(b.id), entries: page(rows, a) }; } },
  { name: 'get_lore_entry', sig: '{book, entry}', desc: 'One lorebook entry in full.',
    run: a => { const b = find(S.lore, a.book, 'lorebook'), e = find(b.entries, a.entry, 'entry'); return { book: b.id, id: e.id, name: e.name, keys: e.keys, keys2: e.keys2, constant: e.constant, enabled: e.enabled, locked: !!e.locked, position: e.position, depth: e.depth, order: e.order, probability: e.probability, group: e.group, description: e.description || '', content: whole(e.content, a) }; } },
  { name: 'get_preset', sig: '{id}', desc: 'Preset sampler settings and its prompt blocks in order (short content).',
    run: a => { const p = find(S.presets, a.id ?? a.name, 'preset'); const { temperature, topP, topK, maxTokens, contextSize, effort, stream, squash, prefill, stop } = p.params;
      return { id: p.id, name: p.name, active: S.settings.activePreset === p.id, params: { temperature, topP, topK, maxTokens, contextSize, effort, stream, squash, prefill: clip(prefill, 'params.prefill', 120), stop }, blocks: p.blocks.map((b, i) => ({ no: i + 1, id: b.id, kind: b.kind, name: b.name, role: b.role, enabled: b.enabled, ...(b.depth != null && b.depth !== '' ? { depth: b.depth } : {}), ...(b.when ? { when: b.when } : {}), tokens: tokens(b.content), content: clip(b.content, 'content (get_preset_block)', 160) })) }; } },
  { name: 'get_preset_block', sig: '{preset, block}', desc: 'One prompt block in full.',
    run: a => { const p = find(S.presets, a.preset, 'preset'), b = find(p.blocks, a.block, 'block'); return { preset: p.id, id: b.id, kind: b.kind, name: b.name, role: b.role, enabled: b.enabled, depth: b.depth, when: b.when || '', content: whole(b.content, a) }; } },
  { name: 'get_regex', sig: '{id}', desc: 'One regex script.',
    run: a => { const r = find(S.regex, a.id ?? a.name, 'regex script'); const { id, name, find: f, replace, onUser, onAI, onSlash, onLore, onReason, mode, enabled, scope, minDepth, maxDepth } = r; return { id, name, find: f, replace: clip(replace, 'replace', 1500), onUser, onAI, onSlash, onLore, onReason, mode, enabled, scope, minDepth, maxDepth }; } },
  { name: 'get_theme', sig: '{id}', desc: 'A theme: tone, the 13 colours, extra CSS.',
    run: a => { const t = find(allThemes(), a.id ?? a.name, 'theme'); return { id: t.id, name: t.name, tone: t.tone, builtin: !!t.builtin, colors: t.c, radius: t.radius, pattern: t.pattern, css: clip(t.css, 'css', 1500) }; } },
  { name: 'get_chat', sig: '{id?, last?}', desc: 'A chat: who is in it, mode, author note, and its last messages (default 8, max 30). Without id: the chat open on screen.',
    run: async a => { const c = openChat(a.id), list = cur.chat?.id === c.id ? cur.msgs : await S.msgs(c.id), n = Math.min(30, Math.max(1, num(a.last, 8)));
      return { id: c.id, title: chatTitle(c), mode: c.mode, game: !!c.game, characters: c.charIds.map(i => ({ id: i, name: S.get('chars', i)?.name })), persona: S.persona(c)?.name, preset: S.presetFor(c)?.name, connection: (() => { const k = S.connFor(c); return k ? `${k.name} · ${k.model}` : null; })(),
        note: clip(c.note?.text, 'note.text', 300), lorebooks: (c.loreIds || []).map(i => S.get('lore', i)?.name), total: list.length, messages: list.slice(-n).map((m, i) => msgRow(m, list.length - Math.min(n, list.length) + i)) }; } },
  { name: 'get_message', sig: '{chat?, no}', desc: 'One message in full by its number.',
    run: async a => { const c = openChat(a.chat), list = cur.chat?.id === c.id ? cur.msgs : await S.msgs(c.id), m = list[num(a.no) - 1] || fail(`No message ${a.no}; the chat has ${list.length}.`); return { no: num(a.no), role: m.role, name: m.name, swipe: `${m.sw + 1}/${m.swipes.length}`, model: m.swipes[m.sw]?.model, text: whole(msgText(m), a) }; } },
  { name: 'search', sig: '{query, in?: ["characters"|"personas"|"lorebooks"|"presets"|"regex"|"quick_replies"], regex?: true, limit?}', desc: 'Search the whole library at once, like grep: every character field, persona, lorebook entry, preset block, regex script and quick-reply button. Returns each hit with the item id, the field it is in and the line around it — usually enough to act on without opening items one by one. query is plain text (case-insensitive); regex=true reads it as a JavaScript pattern. Up to 40 hits (limit= up to 80).',
    run: a => {
      const q = str(a.query); if (!q.trim()) fail('"query" is required.');
      let re: RegExp; try { re = a.regex ? new RegExp(q, 'gi') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); } catch (e) { fail(`"query" is not a valid pattern: ${(e as Error).message}`); }
      const kinds = Array.isArray(a.in) && a.in.length ? a.in.map(str) : ['characters', 'personas', 'lorebooks', 'presets', 'regex', 'quick_replies'], max = Math.min(80, Math.max(1, Number(a.limit) || 40));
      const hits: Obj[] = []; let total = 0;
      const scan = (base: Obj, where: string, text: unknown) => {
        const t = Array.isArray(text) ? text.map(str).join('\n') : str(text); if (!t) return;
        re!.lastIndex = 0; let m: RegExpExecArray | null, n = 0;
        while ((m = re!.exec(t)) && n < 3) { n++; total++; if (!m[0]) re!.lastIndex++; if (hits.length < max) { const a0 = Math.max(0, m.index - 70), z = Math.min(t.length, m.index + m[0].length + 70); hits.push({ ...base, where, at: m.index, text: (a0 ? '…' : '') + t.slice(a0, z).replace(/\s+/g, ' ') + (z < t.length ? '…' : '') }); } }
      };
      if (kinds.includes('characters')) for (const c of S.chars) { const b = { kind: 'character', id: c.id, name: c.name }; for (const k of ['name', 'description', 'personality', 'scenario', 'firstMes', 'mesExample', 'systemPrompt', 'postHistory', 'creatorNotes', 'depthPrompt.prompt']) scan(b, k, getPath(c, k)); (c.altGreetings || []).forEach((g, i) => scan(b, `altGreetings[${i}]`, g)); scan(b, 'tags', c.tags); }
      if (kinds.includes('personas')) for (const x of S.personas) { const b = { kind: 'persona', id: x.id, name: x.name }; scan(b, 'name', x.name); scan(b, 'description', x.description); }
      if (kinds.includes('lorebooks')) for (const bk of S.lore) for (const e of bk.entries) { const b = { kind: 'lore_entry', book: bk.id, bookName: bk.name, entry: e.id, name: e.name || show(e.keys) }; scan(b, 'name', e.name); scan(b, 'keys', e.keys); scan(b, 'content', e.content); }
      if (kinds.includes('presets')) for (const pr of S.presets) for (const bl of pr.blocks) { const b = { kind: 'preset_block', preset: pr.id, presetName: pr.name, block: bl.id, name: bl.name || bl.kind }; scan(b, 'name', bl.name); scan(b, 'content', bl.content); }
      if (kinds.includes('regex')) for (const r of S.regex) { const b = { kind: 'regex', id: r.id, name: r.name }; scan(b, 'name', r.name); scan(b, 'find', r.find); scan(b, 'replace', r.replace); }
      if (kinds.includes('quick_replies')) for (const st of qrStore().sets) for (const it of st.items) { const b = { kind: 'qr', set: st.id, setName: st.name, item: it.id, name: it.label }; scan(b, 'label', it.label); scan(b, 'text', it.text); }
      return { query: q, found: total, shown: hits.length, hits, ...(total > hits.length ? { note: 'More matches exist: narrow the query or pass in=[…].' } : {}), next: 'To change a hit, use edit with the ids above (no need to open the item first when "old" is an exact piece of this text).' };
    } },
  { name: 'search_messages', sig: '{query, chat?, offset?}', desc: 'Find messages containing all the words. Without chat: the open chat, or else the 30 most recent chats.',
    run: async a => { if (!str(a.query).trim()) fail('"query" is required.'); const rooms = str(a.chat).trim() || cur.chat ? [openChat(a.chat)] : [...S.chats].sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 30); const rows: Obj[] = [];
      for (const c of rooms) { const list = cur.chat?.id === c.id ? cur.msgs : await S.msgs(c.id); list.forEach((m, i) => { if (hit(a.query, msgText(m))) rows.push({ chat: c.id, title: chatTitle(c), ...msgRow(m, i, 220) }); }); if (rows.length > 200) break; }
      return page(rows, a, 12); } },
  { name: 'get_settings', sig: '{}', desc: 'A safe subset of app settings (look, chat modes, tracker, translation, memory, helper tasks). Never includes keys or addresses.',
    run: () => { const s = S.settings, name = (id: unknown) => S.conns.find(c => c.id === id)?.name || null, m = s.modes || {};
      return { language: document.documentElement.lang, theme: s.theme, font: s.font, fontSize: s.fontSize, defaultMode: s.defaultMode, enterSend: s.enterSend, activeConnection: name(s.activeConn), activePreset: S.get('presets', s.activePreset)?.name || null, defaultPersona: S.get('personas', s.activePersona)?.name || null, globalLorebooks: s.activeLore.map(i => S.get('lore', i)?.name),
        modes: { choices: m.choices, proactive: m.auto, scenes: m.scenes, notify: m.notify, stagger: m.stagger }, tracker: { enabled: s.tracker.enabled, mode: s.tracker.mode, fields: clip(s.tracker.fields, 'tracker.fields', 400) }, translate: { lang: s.translate.lang, auto: s.translate.auto, autoInput: s.translate.autoInput }, memory: { enabled: s.memory.enabled, auto: s.memory.auto },
        illustration: { auto: s.illust.auto, mode: s.illust.mode, backend: s.illust.backend }, helperTasks: Object.fromEntries(Object.entries(s.helpers || {}).map(([k, v]) => [k, name(v) || '(same as chat)'])), counts: { characters: S.chars.length, chats: S.chats.length, lorebooks: S.lore.length, presets: S.presets.length, personas: S.personas.length, regex: S.regex.length } }; } },
  { name: 'help_search', sig: '{query}', desc: 'Search the Dreamland handbook (where things are, what a feature does, exact menu labels in the user\'s language). Use before answering any how-do-I question.',
    run: a => { const rows = searchHelp(str(a.query)).slice(0, 5).map(h => ({ id: h.id, title: h.title, text: h.body })); return rows.length ? rows : { none: true, hint: 'No topic matched. Try other words, or say you are not sure.' }; } },
  { name: 'help_read', sig: '{id}', desc: 'Read one handbook topic by id.',
    run: a => topicText(str(a.id)) || fail('No such topic. Use help_search.') },
  { name: 'check', sig: '{kind: "character"|"persona"|"preset", id}', desc: 'Run the app\'s built-in lint: token weight, empty greetings, broken macros, missing blocks, conflicting instructions, markdown emphasis in card text, cliche obsessive/controlling trait words, greetings that act for {{user}}. Returns counted facts; you explain them.',
    run: a => a.kind === 'preset' ? (p => ({ preset: p.name, ...checkPreset(p) }))(find(S.presets, a.id, 'preset') as Preset) : a.kind === 'persona' ? (p => ({ persona: p.name, ...checkPersona(p) }))(find(S.personas, a.id, 'persona')) : (c => ({ character: c.name, ...checkChar(c) }))(find(S.chars, a.id, 'character')) },
  { name: 'plan', sig: '{steps?: [string], title?, done?: [n], doing?: n, add?: [string], skip?: [n]}', desc: 'Your visible checklist, shown to the user as a small todo list. steps= starts a new plan (3-7 short steps, in the user\'s language). Later: done=[2] ticks step 2, doing=3 marks the current one, add= appends steps, skip= drops them. Cheaper: add "tick": [n] next to any other call, or end your final answer with {"tick": [n]}.',
    run: a => {
      let p = CTX.plan();
      if (Array.isArray(a.steps)) { const steps = a.steps.map(str).map(x => x.trim()).filter(Boolean).slice(0, 12); if (!steps.length) fail('"steps" must be a list of short strings.'); p = { title: str(a.title).trim() || undefined, steps: steps.map((text, i) => ({ text, state: i ? 'todo' : 'doing' })), at: Date.now(), since: Date.now() }; }
      if (!p) fail('There is no plan yet. Start one with steps=["…", "…"].');
      const plan = p!, at = (n: unknown) => { const i = num(n) - 1; if (!plan.steps[i]) fail(`No step ${n}; the plan has ${plan.steps.length}.`); return plan.steps[i]; };
      if (Array.isArray(a.add)) for (const x of a.add.map(str).filter(Boolean)) plan.steps.push({ text: x, state: 'todo' });
      for (const n of Array.isArray(a.done) ? a.done : a.done != null ? [a.done] : []) at(n).state = 'done';
      for (const n of Array.isArray(a.skip) ? a.skip : a.skip != null ? [a.skip] : []) at(n).state = 'skip';
      if (a.doing != null) { for (const st of plan.steps) if (st.state === 'doing') st.state = 'todo'; at(a.doing).state = 'doing'; }
      else if (!plan.steps.some(st => st.state === 'doing')) { const nx = plan.steps.find(st => st.state === 'todo'); if (nx) nx.state = 'doing'; }
      plan.at = Date.now(); CTX.setPlan(plan);
      return { plan: plan.steps.map((st, i) => `${st.state === 'done' ? '[x]' : st.state === 'skip' ? '[-]' : st.state === 'doing' ? '[>]' : '[ ]'} ${i + 1}. ${st.text}`).join('\n') };
    } },
  { name: 'get_qr_set', sig: '{id}', desc: 'A quick-reply set: where it shows (scope), on/off, options, and its buttons (id, label, kind, auto-run triggers, short text).',
    run: a => { const q = qrRef(a.id ?? a.name ?? a.set); return { id: q.id, name: q.name, scope: q.scope, on: q.on !== false, characters: (q.charIds || []).map(i => S.get('chars', i)?.name || i), options: { nosend: !!q.nosend, before: !!q.before, inject: !!q.inject }, buttons: q.items.map(i => ({ id: i.id, label: i.label, kind: i.kind, ...(i.hidden ? { hidden: true } : {}), ...(autoOn(i.auto).length ? { auto: autoOn(i.auto) } : {}), ...(i.title ? { title: i.title } : {}), text: clip(i.text, 'text (get_qr)', 300) })) }; } },
  { name: 'get_qr', sig: '{set, item, offset?}', desc: 'One quick-reply button in full (label, kind, auto-run, the whole script).',
    run: a => { const q = qrRef(a.set), i = itemRef(q, a.item ?? a.id ?? a.label); return { set: q.id, setName: q.name, id: i.id, label: i.label, kind: i.kind, title: i.title, hidden: !!i.hidden, auto: autoOn(i.auto), text: whole(i.text, a) }; } },
  { name: 'st_commands', sig: '{name?, query?}', desc: 'Look up STscript commands from Dreamland\'s real command list. name="buttons" gives exact usage, named arguments it reads, aliases and help. query="variable" searches. Use before writing any command you are not sure of; never invent commands.',
    run: async a => { const R = await import('../stscript/ref');
      if (str(a.name).trim()) { const i = R.commandInfo(str(a.name)); if (!i) { const { similar } = await import('../stscript/lint'); const near = similar(str(a.name).replace(/^\//, '').toLowerCase(), R.allNames()); return fail(`No command "/${str(a.name).replace(/^\//, '')}".${near.length ? ` Close: ${near.map(n => '/' + n).join(', ')}.` : ''} Try query=.`); }
        return { command: '/' + i.name, aliases: i.names.filter(n => n !== i.name).map(n => '/' + n), usage: i.usage || '(no usage text)', help: i.help || '(no help text)', namedArgs: i.open ? 'any (passed through)' : i.named ? i.named : 'unknown (app or extension command)', source: i.source }; }
      const rows = R.searchCommands(str(a.query)); return { total: rows.length, rows: rows.slice(0, 30).map(i => ({ command: '/' + i.name, usage: i.usage.slice(0, 90), help: i.help.slice(0, 90) })), ...(rows.length > 30 ? { more: 'narrow the query' } : {}) }; } },
  { name: 'st_check', sig: '{script?, set?, item?, siblings?: [label]}', desc: 'Validate an STscript without running it, with Dreamland\'s own parser and command list: syntax errors, unclosed {: :} blocks or quotes, unknown commands, unknown or misplaced named arguments, text that would be ignored, missing quick replies for /:name. Line:col positions. Give script=, or set+item to check a saved button. siblings= labels of buttons you are about to create (so /:label calls resolve). ok=true means no errors.',
    run: async a => { const { checkScript } = await import('../stscript/ref'); let src = str(a.script);
      if (!src.trim() && a.set != null) { const q = qrRef(a.set); src = itemRef(q, a.item).text; }
      if (!src.trim()) fail('Give "script" (the text) or set+item.');
      const sib = Array.isArray(a.siblings) ? a.siblings.map(str) : [];
      const r = checkScript(src, sib); return { ok: r.ok, errors: r.errors, warnings: r.warnings, issues: r.issues.map(i => `${i.level} line ${i.line}:${i.col}${i.cmd ? ' /' + i.cmd : ''} — ${i.msg}`), commands: [...new Set(r.commands)].join(' '), ...(r.ok && !r.warnings ? { note: 'No problems found. This checks structure and names only; it does not run the script.' } : {}) }; } },
  { name: 'get_mvu', sig: '{chat?}', desc: 'Variable-update (MVU) state of a chat: whether it uses MVU at all and why not (status, in plain words), where the values come from, the current stat_data of the newest message that has it (else what the [InitVar] entries would give), its leaf paths, the linked lorebooks and any [InitVar] lorebook that is not linked, and in a game-mode chat which game sheet fields are linked to which paths (gameLinks). Call it first when a status bar shows null or default values. Without chat: the open chat.',
    run: async a => { const r = await mvuOf(a.chat), stat = r.data?.stat_data || {}, js = JSON.stringify(stat, null, 1), { leafPaths } = await mvuRuntime();
      const d = await mvuDiagnosis(r.chat);
      const gl = (r.chat as { game?: { on?: boolean; vars?: { links: { key: string; path: string }[]; show?: string[] } } }).game;
      return { chat: chatTitle(r.chat), usesMvu: d.usesMvu, status: d.status, source: r.source, ...(gl?.vars ? { gameLinks: gl.vars.links.length ? gl.vars.links.map(l => `${l.key} = ${l.path}`) : 'game mode: chose not to link', ...(gl.vars.show?.length ? { gameShown: gl.vars.show } : {}) } : gl?.on ? { gameLinks: 'game mode on, links not set up yet (sheet tab "Link variables")' } : {}), stat_data: Object.keys(stat).length ? (js.length > 6000 ? js.slice(0, 6000) + '… [cut]' : js) : 'none', paths: leafPaths(stat), messagesWithVars: d.messagesWithVars, linkedLorebooks: d.linkedLorebooks, ...(d.unlinkedInitVarLorebooks ? { unlinkedInitVarLorebooks: d.unlinkedInitVarLorebooks } : {}), initEntries: initEntries().slice(0, 20) }; } },
  { name: 'mvu_check', sig: '{update?, initvar?, stat_data?}', desc: 'Test MVU text with Dreamland\'s own engine, without saving anything. initvar= checks initial-variables JSON/YAML and lists its paths. update= runs update commands (_.set(\'path\', old, new);//reason, _.add, _.insert, _.remove, <JSONPatch>) against stat_data= (object or JSON), else against initvar=, else the open chat\'s current variables; reports per command: applied / failed (e.g. unknown path) with before → after, plus lines that look like commands but are not read.',
    run: async a => {
      const out: Obj = {}; let base: MvuObj | null = null, schema: unknown;
      const { checkInit, checkUpdate } = await mvuRuntime();
      if (a.initvar != null) { const r = checkInit(str(a.initvar)); out.initvar = r.ok ? { ok: true, paths: r.paths } : { ok: false, error: r.error }; if (r.ok) base = r.stat_data!; }
      if (a.stat_data != null) { const v = typeof a.stat_data === 'string' ? checkInit(a.stat_data) : { ok: true, stat_data: a.stat_data as MvuObj }; if (!v.ok || !v.stat_data || typeof v.stat_data !== 'object') fail('"stat_data" must be an object (or JSON text of one).'); base = v.stat_data as MvuObj; }
      if (a.update != null) {
        let from = 'given'; if (!base) { if (!cur.chat && !str(a.chat)) fail('No stat_data to test against: give stat_data= or initvar=, or open a chat that uses MVU.'); const r = await mvuOf(a.chat); base = r.data?.stat_data || {}; schema = r.data?.schema; from = 'chat: ' + r.source; }
        const r = await checkUpdate(str(a.update), base!, schema), fin = JSON.stringify(r.final);
        out.update = { against: from, applied: r.applied, failed: r.failed, commands: r.commands, ...(r.unrecognized.length ? { notRead: r.unrecognized } : {}), ...(r.ignoredBlocks ? { note: r.ignoredBlocks } : {}), ...(r.commands.length ? {} : { warning: 'No update commands were found in the text.' }), finalStat: fin.length > 3000 ? fin.slice(0, 3000) + '…' : r.final };
      }
      if (!Object.keys(out).length) fail('Give update= and/or initvar=.');
      return out;
    } },
  { name: 'regex_test', sig: '{text? | message?: <number>|"last", id? | find+replace}', desc: 'Run one regex script on real text without saving anything. Give id= of an existing script, or find= and replace= to try a new one. The input is text= (a sample you write) or message= (a message of the open chat: its number, or "last"). Returns how many times the pattern matched and the text before and after. Use it before proposing a status panel or a clean-up script, and to see why an existing script does nothing.',
    run: a => {
      const r = a.id != null ? find(S.regex, a.id, 'regex script') : newRegex({ name: 'test', find: str(a.find) || fail('Give id= of a script, or find= (and replace=).'), replace: str(a.replace) });
      let text = str(a.text);
      if (!text) { const list = cur.msgs || []; if (!list.length) fail('Give text=, or open a chat and use message=.'); const m = a.message == null || a.message === 'last' ? list[list.length - 1] : list[Number(a.message) - 1]; if (!m) fail(`No message ${str(a.message)} in the open chat (it has ${list.length}).`); text = msgText(m); }
      const m = /^\/([\s\S]+)\/([a-z]*)$/.exec(r.find); let n = 0, err = '';
      try { const re = new RegExp(m ? m[1] : r.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), m ? (m[2].includes('g') ? m[2] : m[2] + 'g') : 'g'); n = (text.match(re) || []).length; } catch (e) { err = (e as Error).message; }
      if (err) fail(`"find" is not a valid regular expression: ${err}`);
      const out = runRegexScript(r, text, null), cut = (v: string) => v.length > 2400 ? v.slice(0, 1200) + '\n… [cut] …\n' + v.slice(-1000) : v;
      return { script: a.id != null ? { id: r.id, name: r.name, enabled: r.enabled !== false, mode: r.mode, scope: r.scope || 'global' } : 'not saved (trial)', matches: n, changed: out !== text, before: cut(text), after: cut(out), ...(n === 0 ? { hint: 'The pattern matched nothing in this text. Check exact spelling, line breaks (use [\\s\\S] instead of . across lines) and flags.' } : {}) };
    } },
  { name: 'lore_test', sig: '{text, character?: <name or id>}', desc: 'Which lorebook entries would wake up for this text? Scans the lorebooks of the open chat (or of character=, plus the always-on books) exactly like a real request does, without sending anything. Returns the entries that fire (book, name, keys, always-on or keyed, tokens) and, for entries that did not, the reason when the engine gives one. Use it to check keywords after writing lore, or to find out why an entry never shows up.',
    run: a => {
      const text = str(a.text).trim() || fail('"text" is required: the words a player would type.');
      const chat = cur.chat, who = a.character != null ? find(S.chars, a.character, 'character') : chat ? (chat.charIds.map(i => S.get('chars', i)).filter(Boolean) as Char[])[0] : fail('Give character=, or open a chat first.');
      const chars = a.character != null || !chat ? [who] : (chat.charIds.map(i => S.get('chars', i)).filter(Boolean) as Char[]), persona = chat ? S.persona(chat) : null;
      const books = activeBooks((a.character != null || !chat ? { loreIds: [] } : chat) as Chat, chars, persona);
      if (!books.length) return { fired: [], note: `No lorebook is linked to ${who.name} (and none is always on). Link one with link_lorebook, or check the character's lorebook list.` };
      const diag: LoreDiag = { hit: {}, skip: {}, used: {} };
      const hits = scanLore(books as never, [{ content: text }], { char: who.name, user: persona?.name || 'User' }, { char: who, persona, commit: false, diag });
      const name = (id: string) => { for (const b of books) { const e = b.entries.find(x => x.id === id); if (e) return `${b.name} › ${e.name || show(e.keys)}`; } return id; };
      return { books: books.map(b => ({ id: b.id, name: b.name, entries: b.entries.length })), fired: hits.map(h => ({ book: h.book || h.bookId, entry: h.name || show(h.keys), why: h.constant ? 'always on' : 'keyword: ' + (diag.hit[h.id] || show(h.keys)), tokens: h.tok })), skipped: Object.entries(diag.skip).slice(0, 30).map(([id, why]) => ({ entry: name(id), why })), totalTokens: hits.reduce((n, h) => n + (h.tok || 0), 0) };
    } },
  { name: 'diagnose_reply', sig: '{}', desc: 'Why did the last reply come out this way? Reads the last prompt actually built for the open chat: sizes by source, what was dropped, which lore entries fired, sampler settings, the tail of the prompt, and the reply itself.',
    run: () => diagnose() },
];

/** 마지막 프롬프트(인스펙터가 가진 것)를 읽어 원인을 짚을 재료로 만든다. 열린 대화에서 한 번이라도 생성했거나 "프롬프트 살펴보기"를 연 뒤에만 있다 */
function diagnose() {
  const c = cur.chat as Chat | null;
  if (!c) fail('No chat is open on screen. Ask the user to open the chat first.');
  // 방을 연 뒤 아직 생성하지 않았으면(새로고침 · 다른 방에서 돌아옴) 지금 상태로 한 번 조립해 본다 — 보내지 않는다
  let built = cur.lastPrompt, rebuilt = false;
  if (!built) { try { built = buildNow()?.built ?? null; rebuilt = !!built; } catch (e) { fail('Could not assemble the prompt for this chat: ' + (e instanceof Error ? e.message : String(e))); } }
  if (!built) fail('Could not assemble the prompt for this chat.');
  const b = built!, p = S.presetFor(c), by: Record<string, { tokens: number; pieces: number }> = {};
  for (const m of b.messages) { const k = str(m.src || m.role), t = tokens(m.content); (by[k] ||= { tokens: 0, pieces: 0 }).tokens += t; by[k].pieces++; }
  const last = [...cur.msgs].reverse().find(m => m.role === 'assistant'), sw = last?.swipes[last.sw];
  const { temperature, topP, topK, maxTokens, contextSize, effort, prefill, squash } = p.params, conn = S.connFor(c);
  return { chat: chatTitle(c!), mode: c!.mode, model: conn ? `${conn.provider} · ${conn.model}` : null, preset: p.name, sampler: { temperature, topP, topK, maxTokens, contextSize, effort, squash, prefill: clip(prefill, 'prefill', 120) },
    promptTokens: b.total, contextSize, fill: contextSize ? Math.round(b.total / contextSize * 100) + '%' : null, droppedOldMessages: b.dropped, bySource: by,
    loreFired: (b.lore || []).slice(0, 30).map(h => `${h.book ? h.book + ' › ' : ''}${h.name || (h.keys || []).join('/')}`),
    promptTail: b.messages.slice(-4).map(m => ({ role: m.role, src: m.src, text: clip(m.content, 'content', 500) })),
    lastReply: last ? { name: last.name, model: sw?.model, ms: sw?.ms, swipes: last.swipes.length, length: msgText(last).length, text: clip(msgText(last), 'text (get_message)', 900) } : null,
    ...(rebuilt ? { assembledNow: 'No reply was generated since the chat was opened, so this prompt was assembled just now from the current state. It shows what the NEXT reply would receive; the last reply may have seen slightly different memory/lore.' } : {}),
    note: 'Compare the reply with the last instructions in promptTail (the end of the prompt weighs most), the sampler (high temperature → drift; low maxTokens → cut off), droppedOldMessages (forgotten facts), and loreFired (missing entry → the keyword did not appear recently).' };
}

// ── 쓰기 (전부 변경 카드로 보류된다) ──
const COLORS = COLOR_FIELDS.map(c => c[0]);
const W: ToolDef[] = [
  { name: 'create_character', write: true, sig: '{name, description, personality?, scenario?, firstMes, mesExample?, systemPrompt?, creatorNotes?, tags?, altGreetings?}', desc: 'Propose a new character card. Put the whole character into description; personality, scenario and mesExample are older boxes that current cards leave empty — omit them unless the user asks.',
    run: a => { const o = fields('chars', a.fields ?? a, ['name']); return { ...created('chars', str(o.name), o), notes: cardNotes({}, o), warn: dupWarn(S.chars, str(o.name), 'character', 'update_character') }; } },
  { name: 'update_character', write: true, sig: '{id, fields: {<field>: <new value>}}', desc: 'Propose edits to a character. Fields: name, description, personality, scenario, firstMes, mesExample, systemPrompt, postHistory, creatorNotes, tags, altGreetings, talk, depthPrompt.prompt, depthPrompt.depth. Send the complete new text of each field you change.',
    run: a => { const c = find(S.chars, a.id, 'character'), f = fields('chars', a.fields); mustHaveRead('chars', c.id); return { ...propose('update', 'chars', c.name, { type: 'set', coll: 'chars', id: c.id, fields: f }, diffs(c, f)), notes: cardNotes(c as unknown as Obj, f) }; } },
  { name: 'add_greeting', write: true, sig: '{id, text}', desc: 'Propose one more alternate greeting for a character (existing greetings stay).',
    run: a => { const c = find(S.chars, a.id, 'character'), text = str(a.text).trim() || fail('"text" is required.'); const list = [...(c.altGreetings || []), text];
      return { ...propose('update', 'chars', c.name, { type: 'set', coll: 'chars', id: c.id, fields: c.firstMes?.trim() ? { altGreetings: list } : { firstMes: text } }, [{ name: c.firstMes?.trim() ? `altGreetings +${list.length}` : 'firstMes', before: '', after: text }]), notes: cardNotes({}, { firstMes: text }) }; } },
  { name: 'create_persona', write: true, sig: '{name, description}', desc: 'Propose a new persona.',
    run: a => { const o = fields('personas', a.fields ?? a, ['name']); return { ...created('personas', str(o.name), o), notes: personaNotes({}, o), warn: dupWarn(S.personas, str(o.name), 'persona', 'update_persona') }; } },
  { name: 'update_persona', write: true, sig: '{id, fields}', desc: 'Propose edits to a persona (name, description).',
    run: a => { const p = find(S.personas, a.id, 'persona'), f = fields('personas', a.fields); mustHaveRead('personas', p.id); return { ...propose('update', 'personas', p.name, { type: 'set', coll: 'personas', id: p.id, fields: f }, diffs(p, f)), notes: personaNotes(p as unknown as Obj, f) }; } },
  { name: 'create_lorebook', write: true, sig: '{name, description?, character?: <character name or id>, entries?: [{name, keys: [..], content, constant?, enabled?, position?, depth?, order?}]}', desc: 'Propose a new lorebook, optionally with entries (at most 24 per call; add more with add_lore_entry). character= links the book to that character when the card is applied — it may be a character you are creating in this same message (give its exact name). An entry whose name contains [InitVar] is checked as MVU initial variables (errors refuse the proposal) and is saved disabled.',
    run: async a => { const name = str(a.name).trim() || fail('"name" is required.'); const es = (Array.isArray(a.entries) ? a.entries : []).slice(0, 24).map(e => fields('entry', e, ['content']));
      const notes: Obj = {};
      for (const e of es) if (/\[initvar\]/i.test(str(e.name))) {   // 초기 변수 항목: 바로 점검하고, 모델에게 보내지 않게 꺼 둔다
        const { checkInit } = await mvuRuntime(), r = checkInit(str(e.content));
        if (!r.ok) fail(`The [InitVar] entry "${str(e.name)}" is not valid initial variables: ${r.error}. Fix its content (JSON or YAML) and send the call again.`);
        if (!r.paths?.length) fail(`The [InitVar] entry "${str(e.name)}" holds no variables. Its content must be a JSON (or YAML) object of the starting values, e.g. {"hero": {"hp": 20}}.`);
        e.enabled = false; notes.initvar = { ok: true, paths: r.paths };
      }
      const who = forChar(a.character);
      return { ...created('lore', name, { name, description: str(a.description), entries: es }, es.map((e, i) => ({ name: `entry ${i + 1} · ${str(e.name) || show(e.keys)}${e.enabled === false ? ' (off)' : ''}`, before: '', after: (e.constant ? '∞\n' : `# ${show(e.keys)}\n`) + str(e.content) })), who.link), ...(Object.keys(notes).length ? { notes } : {}), warn: dupWarn(S.lore, name, 'lorebook', 'add_lore_entry / update_lore_entry / update_lorebook') }; } },
  { name: 'link_lorebook', write: true, sig: '{character, book, unlink?: true}', desc: 'Propose linking an existing lorebook to an existing character, so its entries are used in that character\'s chats (unlink=true removes the link). A book made with create_lorebook character= is linked by itself; use this for books that already exist, or when lore "does nothing" because the book was never linked.',
    run: a => { const c = find(S.chars, a.character, 'character'), b = find(S.lore, a.book, 'lorebook'), has = (c.loreIds || []).includes(b.id);
      if (a.unlink ? !has : has) fail(a.unlink ? `"${b.name}" is not linked to ${c.name}.` : `"${b.name}" is already linked to ${c.name}. If its entries still do not show up, test the keywords with lore_test.`);
      const ids = a.unlink ? (c.loreIds || []).filter(i => i !== b.id) : [...(c.loreIds || []), b.id], names = (l: string[]) => l.map(i => S.get('lore', i)?.name || i).join(', ');
      return propose('update', 'chars', `${c.name} › ${t('nav.lore')}`, { type: 'set', coll: 'chars', id: c.id, fields: { loreIds: ids } }, [{ name: 'lorebooks', before: names(c.loreIds || []), after: names(ids) }]); } },
  { name: 'update_lorebook', write: true, sig: '{id, fields}', desc: 'Propose edits to lorebook settings (name, description, scanDepth, tokenBudget, recursive).',
    run: a => { const b = find(S.lore, a.id, 'lorebook'), f = fields('lore', a.fields); mustHaveRead('lore', b.id, 'book'); return propose('update', 'lore', b.name, { type: 'set', coll: 'lore', id: b.id, fields: f }, diffs(b, f)); } },
  { name: 'add_lore_entry', write: true, sig: '{book, name, keys: [..], content, constant?, position?: "before"|"after"|"depth", depth?, order?}', desc: 'Propose a new entry in an existing lorebook. keys are the words that wake it; constant=true means always on.',
    run: a => { const b = find(S.lore, a.book, 'lorebook'), { book: _b, ...rest } = a; void _b; const f = fields('entry', a.fields ?? rest, ['content']); if (!f.constant && !(f.keys as string[] | undefined)?.length) fail('Give "keys" (words that wake the entry) or set constant=true.');
      return propose('update', 'lore', `${b.name} › ${str(f.name) || show(f.keys)}`, { type: 'entry', loreId: b.id, entryId: uid(), fields: f }, diffs({}, f)); } },
  { name: 'update_lore_entry', write: true, sig: '{book, entry, fields}', desc: 'Propose edits to one entry (name, keys, keys2, content, constant, enabled, position, depth, order, probability, description, group). Locked entries cannot be changed.',
    run: a => { const b = find(S.lore, a.book, 'lorebook'), e = find(b.entries, a.entry, 'entry'); if (e.locked) fail('This entry is locked by the user and cannot be changed. Tell them; they can unlock it in the lorebook editor.'); const f = fields('entry', a.fields); mustHaveRead('lore', b.id, 'book');
      return propose('update', 'lore', `${b.name} › ${e.name || show(e.keys)}`, { type: 'entry', loreId: b.id, entryId: e.id, fields: f }, diffs(e, f)); } },
  { name: 'add_preset_block', write: true, sig: '{preset, name, content, role?: "system"|"user"|"assistant", depth?, after?: <block id>, enabled?}', desc: 'Propose a new text block in a preset. Without after= it goes just before the chat history; depth=N instead injects it N messages from the end.',
    run: a => { const p = find(S.presets, a.preset, 'preset'), { preset: _p, after, ...rest } = a; void _p; const f = fields('block', a.fields ?? rest, ['name', 'content']); const aft = after ? find(p.blocks, after, 'block').id : '';
      return propose('update', 'presets', `${p.name} › ${str(f.name)}`, { type: 'block', presetId: p.id, blockId: uid(), after: aft, fields: { role: 'system', ...f } }, diffs({}, f)); } },
  { name: 'update_preset_block', write: true, sig: '{preset, block, fields}', desc: 'Propose edits to one preset block (name, role, content, enabled, depth, when).',
    run: a => { const p = find(S.presets, a.preset, 'preset'), b = find(p.blocks, a.block, 'block'), f = fields('block', a.fields); mustHaveRead('presets', p.id, 'preset'); return propose('update', 'presets', `${p.name} › ${b.name || b.kind}`, { type: 'block', presetId: p.id, blockId: b.id, after: '', fields: f }, diffs(b, f)); } },
  { name: 'create_regex', write: true, sig: '{name, find, replace, onAI?, onUser?, mode?: "display"|"prompt"|"both"|"store", scope?: "global"|<character id>, character?: <character name or id>}', desc: 'Propose a regex script. find is /pattern/flags (JavaScript). display = only how it looks; prompt = only what is sent; store = rewrites the saved text. character= makes it run only for that character; it may be a character you are creating in this same message (give its exact name).',
    run: async a => { const { character, ...ra } = a, who = forChar(character); const f = fields('regex', a.fields ?? ra, ['name', 'find']); if (who.link) f.scope = who.id || '~' + who.link;   // 아직 없는 캐릭터: 아무에게도 맞지 않는 자리표를 두었다가 적용할 때 그 캐릭터 id 로 바꾼다 const m = /^\/([\s\S]+)\/([a-z]*)$/.exec(str(f.find)); try { new RegExp(m ? m[1] : str(f.find), m ? m[2] : 'g'); } catch (e) { fail(`"find" is not a valid regular expression: ${(e as Error).message}`); }
      if (f.scope && f.scope !== 'global' && !who.link) f.scope = find(S.chars, f.scope, 'character').id;
      const sc = str(f.scope || 'global'), pl = await panelLint(str(f.replace), str(f.mode || 'display'));
      if (pl.errors.length) fail(pl.errors.join(' '));
      return { ...created('regex', str(f.name), f, [], who.id ? '' : who.link), ...(pl.notes.length ? { notes: { panel: pl.notes } } : {}), warn: dupWarn(S.regex.filter(r => (r.scope || 'global') === sc), str(f.name), sc === 'global' ? 'global regex script' : 'regex script for this character', 'update_regex') }; } },
  { name: 'create_theme', write: true, sig: `{name, tone: "light"|"dark", colors: {${COLORS.join(', ')}}, css?}`, desc: 'Propose a custom theme. All 13 colours as #rrggbb. Keep text/surface contrast readable. css is optional extra CSS (no @import, no remote url()).',
    run: a => { const name = str(a.name).trim() || fail('"name" is required.'), tone = a.tone === 'dark' ? 'dark' : a.tone === 'light' ? 'light' : fail('"tone" must be "light" or "dark".'); const cs = (a.colors && typeof a.colors === 'object' ? a.colors : fail('"colors" is required.')) as Obj, c: Record<string, string> = {};
      for (const k of COLORS) { const v = str(cs[k]).trim(); if (!/^#[0-9a-f]{6}$/i.test(v)) fail(`colors.${k} must be #rrggbb (got "${v || 'nothing'}"). All 13 are required: ${COLORS.join(', ')}.`); c[k] = v.toLowerCase(); }
      const css = safeCss(a.css).trim(); return { ...created('theme', name, { name, tone, c, ...(css ? { css } : {}) }, COLORS.map(k => ({ name: k, before: '', after: c[k] }))), warn: dupWarn(allThemes().filter(t => !t.builtin), name, 'custom theme', 'update_theme') }; } },
  { name: 'create_qr_set', write: true, sig: '{name, scope?: "global"|"char"|"chat", characters?: [character id], character?: <character name or id>, buttons: [{label, text, kind?: "insert"|"send"|"script", auto?: ["open"|"newChat"|"user"|"ai"|"gen"|"start"], title?, hidden?}]}', desc: 'Propose a new quick-reply set (buttons above the chat input). kind: insert puts text in the box, send sends it, script runs it as STscript (text starting with "/" defaults to script). auto runs a button by itself: open=when a chat opens, newChat=first open of a new chat, user=after the user sends, ai=after a reply, gen=when generation starts, start=app start. hidden=true keeps a helper button off the bar (still callable with /run or /:label). scope "char" shows it only with the given characters. character= is a shortcut for scope "char" with one character, and it may be a character you are creating in this same message (give its exact name). Scripts are validated first; errors refuse the proposal.',
    run: async a => { const name = str(a.name).trim() || fail('"name" is required.'); const bs = (Array.isArray(a.buttons) ? a.buttons : Array.isArray(a.items) ? a.items : fail('"buttons" must be an array.')) as Obj[]; if (!bs.length || bs.length > 40) fail('Give 1 to 40 buttons.');
      const items = bs.map(b => qrFields(b, true)), labels = items.map(i => str(i.label));
      const dup = labels.find((l, i) => labels.indexOf(l) !== i); if (dup) fail(`Two buttons are both called "${dup}". Labels must differ (scripts call them by label).`);
      const who = forChar(a.character);
      const scope = who.link ? 'char' : a.scope == null ? 'global' : ['global', 'char', 'chat'].includes(str(a.scope)) ? str(a.scope) : fail('"scope" must be "global", "char" or "chat".');
      const charIds = who.link ? (who.id ? [who.id] : []) : scope === 'char' ? (Array.isArray(a.characters) && a.characters.length ? a.characters.map(c => find(S.chars, c, 'character').id) : cur.chat?.charIds?.length ? cur.chat.charIds.slice(0, 1) : fail('scope "char" needs characters=[id].')) : [];
      const chatIds = scope === 'chat' ? (cur.chat ? [cur.chat.id] : fail('scope "chat" needs an open chat.')) : [];
      const notes = await lintButtons(items as { label: string; text: string; kind?: unknown }[], labels);
      return { warn: dupWarn(qrStore().sets, name, 'quick-reply set', 'add_qr / update_qr / update_qr_set'), ...propose('create', 'qr', name, { type: 'create', coll: 'qr', obj: { name, scope, charIds, chatIds, items }, ...(who.link && !who.id ? { link: { char: who.link } } : {}) }, [{ name: 'name', before: '', after: name }, ...(scope !== 'global' ? [{ name: 'scope', before: '', after: scope + (charIds.length ? ' · ' + charIds.map(i => S.get('chars', i)?.name).join(', ') : who.link ? ' · ' + who.link : '') }] : []), ...items.map(i => ({ name: qrCard(i), before: '', after: str(i.text) }))]), notes }; } },
  { name: 'edit', write: true, sig: '{target: "character"|"persona"|"lore_entry"|"preset_block"|"regex"|"qr", id? | book+entry | preset+block | set+item, field?, edits: [{old, new, all?}]}', desc: 'Change part of a long text without resending all of it — the cheap way to fix a sentence, a number, a name or a few script lines. Each edit replaces the exact text old with new (old must occur exactly once in the field unless all=true; include a few surrounding words to make it unique). Edits run in order on one field and become one change card showing the whole field before/after. field defaults: lore_entry → content, preset_block → content, qr → text; for character, persona and regex name the field (description, firstMes, scenario, find, replace …). Use update_* instead when you rewrite most of a field or change several fields.',
    run: async a => {
      const tgt = str(a.target), eds = (Array.isArray(a.edits) ? a.edits : a.old != null ? [{ old: a.old, new: a.new, all: a.all }] : fail('"edits" must be an array of {old, new}.')) as Obj[]; if (!eds.length) fail('Give at least one edit.');
      let cur0: string, field: string, call: [string, Args];
      if (tgt === 'character') { const c = find(S.chars, a.id, 'character'); field = str(a.field) || fail('"field" is required for a character (description, personality, scenario, firstMes, mesExample, systemPrompt, postHistory, creatorNotes).'); const v = getPath(c, field); if (typeof v !== 'string') fail(`"${field}" is not a text field. For greetings lists or tags use update_character.`); cur0 = v as string; call = ['update_character', { id: c.id, fields: {} }]; }
      else if (tgt === 'persona') { const x = find(S.personas, a.id, 'persona'); field = str(a.field) || 'description'; cur0 = str(getPath(x, field)); call = ['update_persona', { id: x.id, fields: {} }]; }
      else if (tgt === 'lore_entry') { const b = find(S.lore, a.book, 'lorebook'), e = find(b.entries, a.entry, 'entry'); field = str(a.field) || 'content'; cur0 = str(getPath(e, field)); call = ['update_lore_entry', { book: b.id, entry: e.id, fields: {} }]; }
      else if (tgt === 'preset_block') { const pr = find(S.presets, a.preset, 'preset'), bl = find(pr.blocks, a.block, 'block'); field = str(a.field) || 'content'; cur0 = str(getPath(bl, field)); call = ['update_preset_block', { preset: pr.id, block: bl.id, fields: {} }]; }
      else if (tgt === 'regex') { const r = find(S.regex, a.id, 'regex script'); field = str(a.field) || fail('"field" is required for a regex script (find or replace).'); cur0 = str(getPath(r, field)); call = ['update_regex', { id: r.id, fields: {} }]; }
      else if (tgt === 'qr') { const q = qrRef(a.set), it = itemRef(q, a.item); field = str(a.field) || 'text'; cur0 = str(getPath(it, field)); call = ['update_qr', { set: q.id, item: it.id, fields: {} }]; }
      else fail('"target" must be character, persona, lore_entry, preset_block, regex or qr.');
      let text = cur0!;
      eds.forEach((e, i) => {
        const old = str(e.old), nw = str(e.new); if (!old) fail(`edits[${i}].old is empty.`);
        const n = text.split(old).length - 1;
        if (!n) fail(`edits[${i}].old was not found in ${field!}. It must match the current text exactly (spaces, line breaks, punctuation). Read the item or run search to copy the exact text.`);
        if (n > 1 && !e.all) fail(`edits[${i}].old occurs ${n} times in ${field!}. Add surrounding words to make it unique, or set all=true to replace every one.`);
        text = e.all ? text.split(old).join(nw) : text.replace(old, () => nw);
      });
      if (text === cur0!) fail('Nothing would change.');
      (call![1].fields as Obj)[field!] = text;
      skipRead = true; try { return await toolDef(call![0])!.run(call![1]); } finally { skipRead = false; }
    } },
  { name: 'update_settings', write: true, sig: `{fields: {<setting>: <value>}}`, desc: `Propose changing app settings (a change card the user approves; it can be undone). Settings: ${Object.entries(SETTINGS).map(([k, v]) => k + (v === 'b' ? ' (true/false)' : v === 's' ? '' : Array.isArray(v) && typeof v[0] === 'number' ? ` (${v[0]}–${v[1]})` : ` (${(v as string[]).join('|')})`)).join(', ')}. theme= takes a theme id or name (list kind="themes"); font= and chatFont= take a font key (${Object.keys(FONTS).slice(0, 6).join(', ')} …; chatFont "" follows the interface font). Read the current values with get_settings first when you are not sure. Connections, keys, server and security settings are out of reach.`,
    run: a => {
      const raw = (a.fields && typeof a.fields === 'object' && !Array.isArray(a.fields) ? a.fields : fail('"fields" must be an object of setting → value.')) as Obj, out: Obj = {}, fs: FieldChange[] = [];
      for (const [k, v0] of Object.entries(raw)) {
        const spec = SETTINGS[k]; if (!spec) fail(`"${k}" cannot be changed here. Settings you can change: ${Object.keys(SETTINGS).join(', ')}.`);
        let v: unknown = v0;
        if (spec === 'b') { if (typeof v !== 'boolean') fail(`"${k}" must be true or false.`); }
        else if (spec === 's') {
          if (typeof v !== 'string') fail(`"${k}" must be a string.`);
          if (k === 'theme') { const th = allThemes().find(x => x.id === v || str(x.name).toLowerCase() === str(v).toLowerCase()); if (!th) fail(`No theme "${str(v)}". Use list kind="themes" for ids.`); v = th!.id; }
          if (k === 'font' || (k === 'chatFont' && v !== '')) { const key = Object.keys(FONTS).find(x => x === v || FONTS[x].name === v); if (!key) fail(`No font "${str(v)}". Font keys: ${Object.keys(FONTS).join(', ')}.`); v = key; }
        }
        else if (typeof spec[0] === 'number') { const n = Number(v); if (!Number.isFinite(n) || typeof v === 'boolean' || v === '') fail(`"${k}" must be a number.`); const [lo, hi] = spec as [number, number]; if (n < lo || n > hi) fail(`"${k}" must be between ${lo} and ${hi}.`); v = n; }
        else { if (!(spec as string[]).includes(str(v))) fail(`"${k}" must be one of: ${(spec as string[]).join(', ')}.`); v = k === 'enterSend' ? (str(v) === 'auto' ? 'auto' : str(v) === 'true') : str(v); }
        const before = getPath(S.settings, k); if (JSON.stringify(before ?? null) === JSON.stringify(v)) continue;
        out[k] = v; fs.push({ name: k, before: show(before), after: show(v) });
      }
      return propose('update', 'settings', t('nav.settings'), { type: 'settings', fields: out }, fs);
    } },
  { name: 'set_variables', write: true, sig: '{mvu?: "<update commands>", set?: {<chat variable>: <value>|null}}', desc: 'Propose fixing the variables of the OPEN chat (a change card; it can be undone). mvu= is MVU update text run on top of the latest variables — the same commands a reply would carry: _.set(\'path\', old, new);//reason, _.add(\'path\', delta);, _.insert(\'path\', key, value);, _.remove(\'path\'); — use it to repair a wrong number, restore a lost item, unstick a flag. set= writes plain chat variables (the /setvar kind; null deletes one). Read the current state with get_mvu first. The commands are tested before the card is made: one that would fail (unknown path, wrong type) refuses the proposal with the reason.',
    run: async a => {
      const chat = (cur.chat as Chat | null) || fail('Open the chat whose variables you want to fix, then try again.');
      const set: Record<string, string | null> = {}, fs: FieldChange[] = []; let commands = '', msgId = '';
      if (a.set != null) { if (typeof a.set !== 'object' || Array.isArray(a.set)) fail('"set" must be an object of variable → value.'); for (const [k, v] of Object.entries(a.set as Obj)) { const nv = v === null ? null : typeof v === 'object' ? JSON.stringify(v) : str(v), old = (chat.vars as unknown as Obj | undefined)?.[k]; if ((old ?? null) === nv) continue; set[k] = nv; fs.push({ name: k, before: show(old), after: nv === null ? '' : nv }); } }
      if (str(a.mvu).trim()) {
        commands = str(a.mvu); const r = await mvuOf(''), base = r.data?.stat_data;
        if (!base || !Object.keys(base).length) fail('This chat has no MVU variables yet (get_mvu shows why). There is nothing to update; fix the [InitVar] link first, or use set= for plain chat variables.');
        const list = cur.msgs || []; let at = -1; for (let i = list.length - 1; i >= 0; i--) if (isMvu(varsOf(list[i]))) { at = i; break; }
        if (at < 0) fail('No message in this chat carries MVU variables yet. Send or receive one message first.');
        msgId = list[at].id;
        const { checkUpdate } = await mvuRuntime(), rep = await checkUpdate(commands, base!, r.data?.schema);
        if (!rep.commands.length) fail('No update commands were found in mvu=. Write them like _.set(\'hero.hp\', 3, 20);//restore');
        const bad = rep.commands.filter(c => c.result === 'failed');
        if (bad.length) fail(`${bad.length} command(s) would fail: ${bad.map(c => `${c.command} — ${c.why || 'failed'}`).join(' | ')}. Fix them (get_mvu lists the real paths) and send again.`);
        for (const c of rep.commands) if (c.result === 'applied') fs.push({ name: c.path, before: show(c.before), after: show(c.after) });
      }
      if (!commands && !Object.keys(set).length) fail('Give mvu= (update commands) and/or set= (chat variables).');
      return propose('update', 'vars', chatTitle(chat), { type: 'vars', chatId: chat.id, msgId, commands, set }, fs);
    } },
  { name: 'update_qr_set', write: true, sig: '{set, fields: {name?, on?, scope?, nosend?, before?, inject?}}', desc: 'Propose set options: on (shown or not), scope, nosend (put text in the box instead of sending — this also stops scripts from running), before/inject (merge with typed text). Read it with get_qr_set first.',
    run: a => { const q = qrRef(a.set ?? a.id); mustHaveRead('qr', q.id); const raw = (a.fields && typeof a.fields === 'object' ? a.fields : fail('"fields" is required.')) as Obj, f: Obj = {};
      for (const [k, v] of Object.entries(raw)) { if (k === 'name') { if (!str(v).trim()) fail('"name" cannot be empty.'); f.name = str(v); } else if (['on', 'nosend', 'before', 'inject'].includes(k)) { if (typeof v !== 'boolean') fail(`"${k}" must be true or false.`); f[k] = v; } else if (k === 'scope') { if (!['global', 'char', 'chat'].includes(str(v))) fail('"scope" must be global, char or chat.'); f.scope = v; } else fail(`"${k}" cannot be written. Writable: name, on, scope, nosend, before, inject.`); }
      return propose('update', 'qr', q.name, { type: 'set', coll: 'qr', id: q.id, fields: f }, diffs(q, f)); } },
  { name: 'add_qr', write: true, sig: '{set, label, text, kind?, auto?, title?, hidden?}', desc: 'Propose one new button in an existing quick-reply set (other buttons stay). Script text is validated first.',
    run: async a => { const q = qrRef(a.set); mustHaveRead('qr', q.id); const { set: _s, ...rest } = a; void _s; const f = qrFields(rest, true);
      if (q.items.some(i => i.label === f.label)) fail(`The set already has a button "${str(f.label)}". Use update_qr to change it.`);
      const notes = await lintButtons([f as { label: string; text: string; kind?: unknown }], [...q.items.map(i => i.label), str(f.label)]);
      return { ...propose('update', 'qr', `${q.name} › ${str(f.label)}`, { type: 'qritem', setId: q.id, itemId: uid(), fields: f }, [{ name: qrCard(f), before: '', after: str(f.text) }]), notes }; } },
  { name: 'update_qr', write: true, sig: '{set, item, fields: {label?, text?, kind?, auto?, title?, hidden?}}', desc: 'Propose edits to one button. Send the complete new script in text. Read it with get_qr first. auto= replaces the whole auto-run list.',
    run: async a => { const q = qrRef(a.set), it = itemRef(q, a.item); mustHaveRead('qr', q.id); const f = qrFields(a.fields);
      if (!Object.keys(f).length) fail('No fields given.');
      const notes = f.text !== undefined ? await lintButtons([{ label: str(f.label ?? it.label), text: str(f.text), kind: f.kind ?? it.kind }], q.items.map(i => i.label)) : undefined;
      const view = (o: Obj) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'auto' ? autoOn(v as QrItem['auto']).join(', ') || 'none' : v]));
      return { ...propose('update', 'qr', `${q.name} › ${it.label}`, { type: 'qritem', setId: q.id, itemId: it.id, fields: f }, diffs(view(it as unknown as Obj), view(f))), ...(notes ? { notes } : {}) }; } },
  { name: 'update_regex', write: true, sig: '{id, fields: {name?, find?, replace?, onUser?, onAI?, onSlash?, onLore?, onReason?, mode?: "display"|"prompt"|"both"|"store", enabled?, scope?: "global"|<character id>, minDepth?, maxDepth?, trim?: [string], runOnEdit?}}', desc: 'Propose edits to an existing regex script (read it with get_regex first). Use this instead of creating a second script with the same name.',
    run: async a => { const r = find(S.regex, a.id ?? a.name, 'regex script'), f = fields('regex', a.fields); mustHaveRead('regex', r.id);
      if (f.find !== undefined) { const m = /^\/([\s\S]+)\/([a-z]*)$/.exec(str(f.find)); try { new RegExp(m ? m[1] : str(f.find), m ? m[2] : 'g'); } catch (e) { fail(`"find" is not a valid regular expression: ${(e as Error).message}`); } }
      if (f.scope && f.scope !== 'global') f.scope = find(S.chars, f.scope, 'character').id;
      const pl = f.replace !== undefined ? await panelLint(str(f.replace), str(f.mode ?? r.mode ?? 'display')) : { errors: [], notes: [] };
      if (pl.errors.length) fail(pl.errors.join(' '));
      return { ...propose('update', 'regex', r.name, { type: 'set', coll: 'regex', id: r.id, fields: f }, diffs(r, f)), ...(pl.notes.length ? { notes: { panel: pl.notes } } : {}) }; } },
  { name: 'update_theme', write: true, sig: `{id, fields: {name?, tone?: "light"|"dark", colors?: {${COLORS.join(', ')}} (any of them), css?}}`, desc: 'Propose edits to one of the user\'s own themes (read it with get_theme first). Built-in themes cannot be changed; make a new one with create_theme.',
    run: a => { const t = find(allThemes(), a.id ?? a.name, 'theme'); if (t.builtin) fail('Built-in themes cannot be changed. Propose create_theme with a new name instead.'); mustHaveRead('theme', t.id);
      const raw = (a.fields && typeof a.fields === 'object' ? a.fields : fail('"fields" is required.')) as Obj; return propose('update', 'theme', t.name, { type: 'set', coll: 'theme', id: t.id, fields: themeFields(raw) }, diffs(t, themeFields(raw))); } },
  { name: 'update_preset', write: true, sig: '{id, fields: {name?, temperature?, topP?, topK?, minP?, topA?, freqPen?, presPen?, repPen?, seed?, maxTokens?, contextSize?, stream?, effort?: ""|"low"|"medium"|"high", squash?, prefill?, stop?: [string]}}', desc: 'Propose preset settings (sampler, reply length, context size, reasoning effort, prefill, stop strings). null clears an optional number. Read it with get_preset first. For prompt text use update_preset_block.',
    run: a => { const p = find(S.presets, a.id ?? a.name ?? a.preset, 'preset'); mustHaveRead('presets', p.id, 'preset'); const f = presetFields(a.fields);
      return propose('update', 'presets', p.name, { type: 'set', coll: 'presets', id: p.id, fields: f }, diffs(p, f)); } },
  { name: 'delete_regex', write: true, sig: '{id}', desc: 'Propose deleting a regex script (read it with get_regex first). The user approves the card, and can undo it.',
    run: a => { const r = find(S.regex, a.id ?? a.name, 'regex script'); mustHaveRead('regex', r.id); return propose('delete', 'regex', r.name, { type: 'delete', coll: 'regex', id: r.id }, gone(r as unknown as Obj, ['name', 'find', 'replace', 'mode', 'scope'])); } },
  { name: 'delete_lore_entry', write: true, sig: '{book, entry}', desc: 'Propose deleting one lorebook entry (read the book first). Locked entries cannot be deleted. Undoable.',
    run: a => { const b = find(S.lore, a.book, 'lorebook'), e = find(b.entries, a.entry ?? a.id, 'entry'); if (e.locked) fail('This entry is locked by the user and cannot be deleted. Tell them; they can unlock it in the lorebook editor.'); mustHaveRead('lore', b.id, 'book');
      return propose('delete', 'lore', `${b.name} › ${e.name || show(e.keys)}`, { type: 'entrydel', loreId: b.id, entryId: e.id }, gone(e as unknown as Obj, ['name', 'keys', 'content'])); } },
  { name: 'delete_lore', write: true, sig: '{book}', desc: 'Propose deleting a whole lorebook with all its entries (read it first with get_lore). Undoable. Tell the user the book is also unlinked from characters that used it.',
    run: a => { const b = find(S.lore, a.book ?? a.id ?? a.name, 'lorebook'); mustHaveRead('lore', b.id); return propose('delete', 'lore', b.name, { type: 'delete', coll: 'lore', id: b.id }, [{ name: 'name', before: b.name, after: '' }, { name: 'entries', before: String(b.entries.length), after: '0' }]); } },
  { name: 'delete_qr', write: true, sig: '{set, item}', desc: 'Propose deleting one quick-reply button (read the set first). Undoable.',
    run: a => { const q = qrRef(a.set), it = itemRef(q, a.item ?? a.id ?? a.label); mustHaveRead('qr', q.id); return propose('delete', 'qr', `${q.name} › ${it.label}`, { type: 'qrdel', setId: q.id, itemId: it.id }, gone(it as unknown as Obj, ['label', 'kind', 'text'])); } },
  { name: 'delete_qr_set', write: true, sig: '{set}', desc: 'Propose deleting a whole quick-reply set with its buttons (read it first). Undoable.',
    run: a => { const q = qrRef(a.set ?? a.id); mustHaveRead('qr', q.id); return propose('delete', 'qr', q.name, { type: 'delete', coll: 'qr', id: q.id }, [{ name: 'name', before: q.name, after: '' }, ...q.items.map(i => ({ name: qrCard(i as unknown as Obj), before: str(i.text), after: '' }))]); } },
  { name: 'revise_card', write: true, sig: '{card, fields}', desc: 'Change a change card that is still waiting for approval, instead of proposing a second card. Use it to redo one field ("only rewrite the speech style") or to fix something the check flagged. fields: same names as the tool that made the card. The card is updated in place and is still not saved.',
    run: async a => {
      const all = CTX.items().filter((i): i is Extract<Item, { k: 'change' }> => i.k === 'change').map(i => i.change);
      const id = str(a.card).trim(), ch = all.find(c => c.id === id) || (id ? undefined : [...all].reverse().find(c => c.state === 'pending')) || fail(`No change card "${id}". Cards in this conversation: ${all.map(c => `${c.id} (${c.state}, ${c.verb} ${c.kind} ${c.target})`).join('; ') || 'none'}.`);
      if (ch!.state !== 'pending' && ch!.state !== 'failed') fail(`Card ${ch!.id} is ${ch!.state}; only cards waiting for approval can be revised. Propose a new change instead.`);
      const c = ch!, op = c.op, raw = (a.fields && typeof a.fields === 'object' ? a.fields : fail('"fields" is required.')) as Obj;
      let notes: unknown;
      if (op.type === 'create' && (op.coll === 'chars' || op.coll === 'personas' || op.coll === 'regex')) {
        const f = fields(op.coll === 'chars' ? 'chars' : op.coll === 'personas' ? 'personas' : 'regex', raw); Object.assign(op.obj, f);
        if (f.name) c.target = str(f.name); c.fields = diffs({}, flat(op.obj)); notes = op.coll === 'chars' ? cardNotes({}, op.obj) : op.coll === 'personas' ? personaNotes({}, op.obj) : undefined;
      } else if (op.type === 'set') {
        const target = current(op.coll, op.id) || fail('The item behind this card is gone.');
        if (op.coll === 'qr') fail('For quick-reply set options, discard this card idea and call update_qr_set again with all the options you want.');
        const f = op.coll === 'theme' ? themeFields(raw) : op.coll === 'presets' ? presetFields(raw) : fields(op.coll === 'chars' ? 'chars' : op.coll === 'personas' ? 'personas' : op.coll === 'lore' ? 'lore' : 'regex', raw);
        Object.assign(op.fields, f); c.fields = diffs(target, op.fields);
        notes = op.coll === 'chars' ? cardNotes(target as Obj, op.fields) : op.coll === 'personas' ? personaNotes(target as Obj, op.fields) : undefined;
      } else if (op.type === 'entry' || op.type === 'block') {
        const f = fields(op.type === 'entry' ? 'entry' : 'block', raw); Object.assign(op.fields, f); c.fields = diffs(op.type === 'entry' ? (S.get('lore', op.loreId)?.entries.find(e => e.id === op.entryId) || {}) : (S.get('presets', op.presetId)?.blocks.find(b => b.id === op.blockId) || {}), op.fields);
      } else if (op.type === 'qritem') {
        const f = qrFields(raw); Object.assign(op.fields, f); const set = qrStore().sets.find(q => q.id === op.setId), it = set?.items.find(i => i.id === op.itemId);
        if (f.text !== undefined) notes = await lintButtons([{ label: str(op.fields.label ?? it?.label), text: str(op.fields.text), kind: op.fields.kind ?? it?.kind }], set?.items.map(i => i.label) || []);
        c.fields = it ? diffs(it as unknown as Obj, op.fields) : [{ name: qrCard(op.fields), before: '', after: str(op.fields.text) }];
      } else if (op.type === 'create' && op.coll === 'qr') {
        // 세트 안의 버튼 하나를 이름으로 고친다: fields: {buttons: [{label, …}]} 의 label 이 같은 것을 바꾸고, 새 label 은 더한다
        const items = op.obj.items as Obj[], add = (Array.isArray(raw.buttons) ? raw.buttons : fail('For a new quick-reply set card, give fields: {buttons: [{label, text, …}]}; buttons with an existing label replace it, new labels are added.')) as Obj[];
        const fixed = add.map(b => qrFields(b)); for (const b of fixed) { const i = items.findIndex(x => x.label === b.label); if (i >= 0) items[i] = { ...items[i], ...b }; else items.push(qrFields(b, true)); }
        if (raw.name) { op.obj.name = str(raw.name); c.target = str(raw.name); }
        notes = await lintButtons(items as { label: string; text: string; kind?: unknown }[], items.map(i => str(i.label)));
        c.fields = [{ name: 'name', before: '', after: str(op.obj.name) }, ...items.map(i => ({ name: qrCard(i), before: '', after: str(i.text) }))];
      } else fail('This kind of card cannot be revised. Propose a new change instead.');
      if (!c.fields.length) fail('Nothing would change: the new values equal the current ones.');
      c.state = 'pending'; delete c.err; c.at = Date.now();
      return { revised: { card: c.id, notes } };
    } },
];

// 예전 이름도 받는다 (지난 대화 기록 · 익숙한 이름)
const ALIASES: Record<string, string> = { create_quick_reply: 'create_qr_set' };
export const TOOLS: ToolDef[] = [...R, ...W];
const BY = new Map(TOOLS.map(t => [t.name, t]));
export const toolDef = (name: string) => BY.get(name);
/** 모델에 보여 줄 도구 목록 */
export const toolDocs = () => { const line = (t: ToolDef) => `- ${t.name} ${t.sig} — ${t.desc}`; return `READ TOOLS (run at once)\n${R.map(line).join('\n')}\n\nWRITE TOOLS (never applied directly: each becomes a change card the user must approve)\n${W.map(line).join('\n')}`; };

/** 도구를 돌린다. 읽기는 글로, 쓰기는 변경 카드로 돌려준다. 틀린 호출은 까닭을 적어 던진다 (모델이 읽고 고친다) */
export async function runTool(name: string, args: Args): Promise<{ out: string; change?: Change }> {
  const def = BY.get(name) || BY.get(ALIASES[name] || '');
  if (!def) throw new Error(`Unknown tool "${name}". Tools: ${TOOLS.map(t => t.name).join(', ')}.`);
  let res: unknown;
  try { res = await def.run(args || {}); }
  catch (e) { if (e instanceof ToolError) throw new Error(`${e.message} Usage: ${def.name} ${def.sig}`); console.warn('[등불지기]', name, e); throw new Error(`The tool failed: ${e instanceof Error ? e.message : String(e)}`); }
  if (isProposal(res)) {
    const c = res.change;
    return { change: c, out: JSON.stringify({ status: 'PENDING — not saved yet', changeCard: c.id, ...(c.verb === 'delete' ? { action: 'delete (undoable after it is applied)' } : {}), target: c.target, fields: c.fields.map(f => f.name), ...(res.warn ? { warning: res.warn } : {}), ...(res.notes ? { check: res.notes } : {}), next: `A change card is now shown to the user. Nothing is saved until they press Apply. Do not say it is done; say what you proposed and that it waits for their approval.${res.notes ? ' Read "check" first: if it flags something you did not intend, fix it now with revise_card (same card) before you report.' : ''}` }, null, 1) };
  }
  let out = JSON.stringify(res, null, 1); if (out.length > 14000) out = out.slice(0, 14000) + '\n… [result cut; narrow it with query/offset/field]';
  return { out };
}
export { current };
