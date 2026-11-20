// 등불지기의 도구: 앱 자료를 읽는 것과, 변경 카드를 남기는 것. 셸도 파일도 없다 — 여기 적힌 것이 조수가 할 수 있는 전부다
// 연결 · API 키 · 서버 설정 · 확장 코드는 읽기 도구에도 쓰기 도구에도 없다. 지우는 도구도 없다
import { S, chatConns, msgText, uid } from '../lib/core';
import { tokens } from '../lib/engine';
import { allThemes, COLOR_FIELDS } from '../lib/theme';
import { qrStore } from '../lib/qr-data';
import { safeCss } from '../modules/logic';
import { cur } from '../chat/store';
import type { Char, Chat, Msg, Preset } from '../lib/types';
import { checkChar, checkPreset } from './check';
import { current, getPath } from './changes';
import { searchHelp, topicText } from './handbook';
import type { Change, FieldChange, Kind, Op, ToolDef } from './types';

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
  regex: { name: 's', find: 's', replace: 's', onUser: 'b', onAI: 'b', onSlash: 'b', onLore: 'b', onReason: 'b', mode: ['display', 'prompt', 'both', 'store'], enabled: 'b', scope: 's' },
};
/** 받은 칸을 꼴에 맞춰 고른다. 모르는 칸 · 틀린 값은 까닭과 함께 거절한다 */
function fields(kind: keyof typeof F, raw: unknown, need: string[] = []): Obj {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('"fields" must be an object of field → new value.');
  const spec = F[kind], out: Obj = {};
  for (const [k, v] of Object.entries(raw as Obj)) {
    const t = spec[k]; if (!t) fail(`Field "${k}" cannot be written. Writable: ${Object.keys(spec).join(', ')}.`);
    if (t === 's') { if (typeof v !== 'string') fail(`"${k}" must be a string.`); out[k] = v; }
    else if (t === 'n') { if (v === null && k === 'depth') out[k] = null; else if (!Number.isFinite(Number(v)) || v === '' || typeof v === 'boolean') fail(`"${k}" must be a number.`); else out[k] = Number(v); }
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
export interface Proposal { change: Change }
export const isProposal = (v: unknown): v is Proposal => !!v && typeof v === 'object' && 'change' in v && !!(v as Proposal).change?.op;
function propose(verb: Change['verb'], kind: Kind, target: string, op: Op, fs: FieldChange[]): Proposal {
  if (!fs.length) fail('Nothing would change: the new values equal the current ones.');
  return { change: { id: uid(), verb, kind, target, op, fields: fs, state: 'pending', at: Date.now() } };
}
/** 만들기 카드: 낱값 칸만 그대로 보이고, 묶음(항목 · 색)은 extra 로 풀어 적는다 */
const flat = (o: Obj) => Object.fromEntries(Object.entries(o).filter(([, v]) => !(v && typeof v === 'object' && (!Array.isArray(v) || v.some(x => x && typeof x === 'object')))));
const created = (kind: Kind, name: string, obj: Obj, extra: FieldChange[] = []) => propose('create', kind, name, { type: 'create', coll: kind, obj }, [...diffs({}, flat(obj)), ...extra]);

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
  quick_replies: a => qrStore().sets.filter(s => hit(a.query, s.name)).map(s => ({ id: s.id, name: s.name, scope: s.scope, on: s.on, buttons: s.items.map(i => i.label) })),
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
  { name: 'check', sig: '{kind: "character"|"preset", id}', desc: 'Run the app\'s built-in lint: token weight, empty greetings, broken macros, missing blocks, conflicting instructions. Returns counted facts; you explain them.',
    run: a => a.kind === 'preset' ? (p => ({ preset: p.name, ...checkPreset(p) }))(find(S.presets, a.id, 'preset') as Preset) : (c => ({ character: c.name, ...checkChar(c) }))(find(S.chars, a.id, 'character')) },
  { name: 'diagnose_reply', sig: '{}', desc: 'Why did the last reply come out this way? Reads the last prompt actually built for the open chat: sizes by source, what was dropped, which lore entries fired, sampler settings, the tail of the prompt, and the reply itself.',
    run: () => diagnose() },
];

/** 마지막 프롬프트(인스펙터가 가진 것)를 읽어 원인을 짚을 재료로 만든다. 열린 대화에서 한 번이라도 생성했거나 "프롬프트 살펴보기"를 연 뒤에만 있다 */
function diagnose() {
  const c = cur.chat as Chat | null, built = cur.lastPrompt;
  if (!c) fail('No chat is open on screen. Ask the user to open the chat first.');
  if (!built) fail('There is no built prompt yet for this chat. Ask the user to generate a reply (or open the prompt inspector from the scene panel) and then ask again.');
  const b = built!, p = S.presetFor(c), by: Record<string, { tokens: number; pieces: number }> = {};
  for (const m of b.messages) { const k = str(m.src || m.role), t = tokens(m.content); (by[k] ||= { tokens: 0, pieces: 0 }).tokens += t; by[k].pieces++; }
  const last = [...cur.msgs].reverse().find(m => m.role === 'assistant'), sw = last?.swipes[last.sw];
  const { temperature, topP, topK, maxTokens, contextSize, effort, prefill, squash } = p.params, conn = S.connFor(c);
  return { chat: chatTitle(c!), mode: c!.mode, model: conn ? `${conn.provider} · ${conn.model}` : null, preset: p.name, sampler: { temperature, topP, topK, maxTokens, contextSize, effort, squash, prefill: clip(prefill, 'prefill', 120) },
    promptTokens: b.total, contextSize, fill: contextSize ? Math.round(b.total / contextSize * 100) + '%' : null, droppedOldMessages: b.dropped, bySource: by,
    loreFired: (b.lore || []).slice(0, 30).map(h => `${h.book ? h.book + ' › ' : ''}${h.name || (h.keys || []).join('/')}`),
    promptTail: b.messages.slice(-4).map(m => ({ role: m.role, src: m.src, text: clip(m.content, 'content', 500) })),
    lastReply: last ? { name: last.name, model: sw?.model, ms: sw?.ms, swipes: last.swipes.length, length: msgText(last).length, text: clip(msgText(last), 'text (get_message)', 900) } : null,
    note: 'Compare the reply with the last instructions in promptTail (the end of the prompt weighs most), the sampler (high temperature → drift; low maxTokens → cut off), droppedOldMessages (forgotten facts), and loreFired (missing entry → the keyword did not appear recently).' };
}

// ── 쓰기 (전부 변경 카드로 보류된다) ──
const COLORS = COLOR_FIELDS.map(c => c[0]);
const W: ToolDef[] = [
  { name: 'create_character', write: true, sig: '{name, description, personality?, scenario?, firstMes, mesExample?, systemPrompt?, creatorNotes?, tags?, altGreetings?}', desc: 'Propose a new character card.',
    run: a => { const o = fields('chars', a.fields ?? a, ['name']); return created('chars', str(o.name), o); } },
  { name: 'update_character', write: true, sig: '{id, fields: {<field>: <new value>}}', desc: 'Propose edits to a character. Fields: name, description, personality, scenario, firstMes, mesExample, systemPrompt, postHistory, creatorNotes, tags, altGreetings, talk, depthPrompt.prompt, depthPrompt.depth. Send the complete new text of each field you change.',
    run: a => { const c = find(S.chars, a.id, 'character'), f = fields('chars', a.fields); return propose('update', 'chars', c.name, { type: 'set', coll: 'chars', id: c.id, fields: f }, diffs(c, f)); } },
  { name: 'add_greeting', write: true, sig: '{id, text}', desc: 'Propose one more alternate greeting for a character (existing greetings stay).',
    run: a => { const c = find(S.chars, a.id, 'character'), text = str(a.text).trim() || fail('"text" is required.'); const list = [...(c.altGreetings || []), text];
      return propose('update', 'chars', c.name, { type: 'set', coll: 'chars', id: c.id, fields: c.firstMes?.trim() ? { altGreetings: list } : { firstMes: text } }, [{ name: c.firstMes?.trim() ? `altGreetings +${list.length}` : 'firstMes', before: '', after: text }]); } },
  { name: 'create_persona', write: true, sig: '{name, description}', desc: 'Propose a new persona.',
    run: a => { const o = fields('personas', a.fields ?? a, ['name']); return created('personas', str(o.name), o); } },
  { name: 'update_persona', write: true, sig: '{id, fields}', desc: 'Propose edits to a persona (name, description).',
    run: a => { const p = find(S.personas, a.id, 'persona'), f = fields('personas', a.fields); return propose('update', 'personas', p.name, { type: 'set', coll: 'personas', id: p.id, fields: f }, diffs(p, f)); } },
  { name: 'create_lorebook', write: true, sig: '{name, description?, entries?: [{name, keys: [..], content, constant?}]}', desc: 'Propose a new lorebook, optionally with entries (at most 12 per call; add more with add_lore_entry).',
    run: a => { const name = str(a.name).trim() || fail('"name" is required.'); const es = (Array.isArray(a.entries) ? a.entries : []).slice(0, 12).map(e => fields('entry', e, ['content']));
      return created('lore', name, { name, description: str(a.description), entries: es }, es.map((e, i) => ({ name: `entry ${i + 1} · ${str(e.name) || show(e.keys)}`, before: '', after: (e.constant ? '[always on]\n' : `[keys: ${show(e.keys)}]\n`) + str(e.content) }))); } },
  { name: 'update_lorebook', write: true, sig: '{id, fields}', desc: 'Propose edits to lorebook settings (name, description, scanDepth, tokenBudget, recursive).',
    run: a => { const b = find(S.lore, a.id, 'lorebook'), f = fields('lore', a.fields); return propose('update', 'lore', b.name, { type: 'set', coll: 'lore', id: b.id, fields: f }, diffs(b, f)); } },
  { name: 'add_lore_entry', write: true, sig: '{book, name, keys: [..], content, constant?, position?: "before"|"after"|"depth", depth?, order?}', desc: 'Propose a new entry in an existing lorebook. keys are the words that wake it; constant=true means always on.',
    run: a => { const b = find(S.lore, a.book, 'lorebook'), { book: _b, ...rest } = a; void _b; const f = fields('entry', a.fields ?? rest, ['content']); if (!f.constant && !(f.keys as string[] | undefined)?.length) fail('Give "keys" (words that wake the entry) or set constant=true.');
      return propose('update', 'lore', `${b.name} › ${str(f.name) || show(f.keys)}`, { type: 'entry', loreId: b.id, entryId: uid(), fields: f }, diffs({}, f)); } },
  { name: 'update_lore_entry', write: true, sig: '{book, entry, fields}', desc: 'Propose edits to one entry (name, keys, keys2, content, constant, enabled, position, depth, order, probability, description, group). Locked entries cannot be changed.',
    run: a => { const b = find(S.lore, a.book, 'lorebook'), e = find(b.entries, a.entry, 'entry'); if (e.locked) fail('This entry is locked by the user and cannot be changed. Tell them; they can unlock it in the lorebook editor.'); const f = fields('entry', a.fields);
      return propose('update', 'lore', `${b.name} › ${e.name || show(e.keys)}`, { type: 'entry', loreId: b.id, entryId: e.id, fields: f }, diffs(e, f)); } },
  { name: 'add_preset_block', write: true, sig: '{preset, name, content, role?: "system"|"user"|"assistant", depth?, after?: <block id>, enabled?}', desc: 'Propose a new text block in a preset. Without after= it goes just before the chat history; depth=N instead injects it N messages from the end.',
    run: a => { const p = find(S.presets, a.preset, 'preset'), { preset: _p, after, ...rest } = a; void _p; const f = fields('block', a.fields ?? rest, ['name', 'content']); const aft = after ? find(p.blocks, after, 'block').id : '';
      return propose('update', 'presets', `${p.name} › ${str(f.name)}`, { type: 'block', presetId: p.id, blockId: uid(), after: aft, fields: { role: 'system', ...f } }, diffs({}, f)); } },
  { name: 'update_preset_block', write: true, sig: '{preset, block, fields}', desc: 'Propose edits to one preset block (name, role, content, enabled, depth, when).',
    run: a => { const p = find(S.presets, a.preset, 'preset'), b = find(p.blocks, a.block, 'block'), f = fields('block', a.fields); return propose('update', 'presets', `${p.name} › ${b.name || b.kind}`, { type: 'block', presetId: p.id, blockId: b.id, after: '', fields: f }, diffs(b, f)); } },
  { name: 'create_regex', write: true, sig: '{name, find, replace, onAI?, onUser?, mode?: "display"|"prompt"|"both"|"store", scope?: "global"|<character id>}', desc: 'Propose a regex script. find is /pattern/flags (JavaScript). display = only how it looks; prompt = only what is sent; store = rewrites the saved text.',
    run: a => { const f = fields('regex', a.fields ?? a, ['name', 'find']); const m = /^\/([\s\S]+)\/([a-z]*)$/.exec(str(f.find)); try { new RegExp(m ? m[1] : str(f.find), m ? m[2] : 'g'); } catch (e) { fail(`"find" is not a valid regular expression: ${(e as Error).message}`); }
      if (f.scope && f.scope !== 'global') f.scope = find(S.chars, f.scope, 'character').id; return created('regex', str(f.name), f); } },
  { name: 'create_theme', write: true, sig: `{name, tone: "light"|"dark", colors: {${COLORS.join(', ')}}, css?}`, desc: 'Propose a custom theme. All 13 colours as #rrggbb. Keep text/surface contrast readable. css is optional extra CSS (no @import, no remote url()).',
    run: a => { const name = str(a.name).trim() || fail('"name" is required.'), tone = a.tone === 'dark' ? 'dark' : a.tone === 'light' ? 'light' : fail('"tone" must be "light" or "dark".'); const cs = (a.colors && typeof a.colors === 'object' ? a.colors : fail('"colors" is required.')) as Obj, c: Record<string, string> = {};
      for (const k of COLORS) { const v = str(cs[k]).trim(); if (!/^#[0-9a-f]{6}$/i.test(v)) fail(`colors.${k} must be #rrggbb (got "${v || 'nothing'}"). All 13 are required: ${COLORS.join(', ')}.`); c[k] = v.toLowerCase(); }
      const css = safeCss(a.css).trim(); return created('theme', name, { name, tone, c, ...(css ? { css } : {}) }, COLORS.map(k => ({ name: k, before: '', after: c[k] }))); } },
  { name: 'create_quick_reply', write: true, sig: '{name, buttons: [{label, text, kind?: "insert"|"send"|"script"}]}', desc: 'Propose a quick-reply set (buttons above the input). insert puts text in the box, send sends it, script runs slash commands.',
    run: a => { const name = str(a.name).trim() || fail('"name" is required.'); const bs = (Array.isArray(a.buttons) ? a.buttons : Array.isArray(a.items) ? a.items : fail('"buttons" must be an array.')) as Obj[]; if (!bs.length || bs.length > 24) fail('Give 1 to 24 buttons.');
      const items = bs.map(b => { const label = str(b.label).trim() || fail('Each button needs a "label".'), text = str(b.text) || fail('Each button needs "text".'); const kind = ['insert', 'send', 'script'].includes(str(b.kind)) ? str(b.kind) : text.trim().startsWith('/') ? 'script' : 'insert'; return { label, text, kind }; });
      return propose('create', 'qr', name, { type: 'create', coll: 'qr', obj: { name, items } }, [{ name: 'name', before: '', after: name }, ...items.map(i => ({ name: `${i.label} · ${i.kind}`, before: '', after: i.text }))]); } },
];

export const TOOLS: ToolDef[] = [...R, ...W];
const BY = new Map(TOOLS.map(t => [t.name, t]));
export const toolDef = (name: string) => BY.get(name);
/** 모델에 보여 줄 도구 목록 */
export const toolDocs = () => { const line = (t: ToolDef) => `- ${t.name} ${t.sig} — ${t.desc}`; return `READ TOOLS (run at once)\n${R.map(line).join('\n')}\n\nWRITE TOOLS (never applied directly: each becomes a change card the user must approve)\n${W.map(line).join('\n')}`; };

/** 도구를 돌린다. 읽기는 글로, 쓰기는 변경 카드로 돌려준다. 틀린 호출은 까닭을 적어 던진다 (모델이 읽고 고친다) */
export async function runTool(name: string, args: Args): Promise<{ out: string; change?: Change }> {
  const def = BY.get(name);
  if (!def) throw new Error(`Unknown tool "${name}". Tools: ${TOOLS.map(t => t.name).join(', ')}.`);
  let res: unknown;
  try { res = await def.run(args || {}); }
  catch (e) { if (e instanceof ToolError) throw new Error(`${e.message} Usage: ${def.name} ${def.sig}`); console.warn('[등불지기]', name, e); throw new Error(`The tool failed: ${e instanceof Error ? e.message : String(e)}`); }
  if (isProposal(res)) {
    const c = res.change;
    return { change: c, out: JSON.stringify({ status: 'PENDING — not saved yet', changeCard: c.id, target: c.target, fields: c.fields.map(f => f.name), next: 'A change card is now shown to the user. Nothing is saved until they press Apply. Do not say it is done; say what you proposed and that it waits for their approval.' }) };
  }
  let out = JSON.stringify(res, null, 1); if (out.length > 14000) out = out.slice(0, 14000) + '\n… [result cut; narrow it with query/offset/field]';
  return { out };
}
export { current };
