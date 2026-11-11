// ── Dreamland cards: 캐릭터 카드(PNG/JSON) · 외부 형식 변환과 가져오기 ──
import { tplKind, tplImport, KINDS } from './advanced.js';
import { stQrToSet, qrAddSet } from './qr-data.js';
import { S, DB, uid, now, arr, bool, parseMaybe, parseDate, bytesToDataURL, dataURLToBytes, mimeOf, shrinkImage, newChar, newPersona, newLore, newEntry, newRegex, newChat, newMsg, defaultPreset, MARKERS, emit } from './core.js';

// ════════ PNG 메타데이터 ════════
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const b64ToUtf8 = s => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));
const utf8ToB64 = s => { const u = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < u.length; i += 0x8000) o += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(o); };

function* pngChunks(u) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let p = 8;
  while (p + 8 <= u.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]);
    yield { type, start: p, end: p + 12 + len, data: u.subarray(p + 8, p + 8 + len) };
    p += 12 + len;
  }
}
export function readPngCard(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u[0] !== 0x89 || u[1] !== 0x50) return null;
  const found = {};
  for (const c of pngChunks(u)) {
    if (c.type !== 'tEXt') continue;
    const z = c.data.indexOf(0); if (z < 0) continue;
    const key = String.fromCharCode(...c.data.subarray(0, z)).toLowerCase();
    if (key === 'chara' || key === 'ccv3') { let s = ''; const d = c.data.subarray(z + 1); for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000)); found[key] = s; }
  }
  const raw = found.ccv3 || found.chara;
  if (!raw) return null;
  try { return JSON.parse(b64ToUtf8(raw)); } catch { return null; }
}
export function writePngCard(pngBytes, card, v3 = null) {
  const parts = []; let iend = null;
  parts.push(pngBytes.subarray(0, 8));
  for (const c of pngChunks(pngBytes)) {
    if (c.type === 'IEND') { iend = pngBytes.subarray(c.start, c.end); continue; }
    if (c.type === 'tEXt') { const z = c.data.indexOf(0); const k = String.fromCharCode(...c.data.subarray(0, Math.max(0, z))).toLowerCase(); if (k === 'chara' || k === 'ccv3') continue; }
    parts.push(pngBytes.subarray(c.start, c.end));
  }
  const text = (key, obj) => {
    const payload = new TextEncoder().encode(key + '\0' + utf8ToB64(JSON.stringify(obj)));
    const chunk = new Uint8Array(12 + payload.length); const dv = new DataView(chunk.buffer);
    dv.setUint32(0, payload.length); chunk.set([0x74, 0x45, 0x58, 0x74], 4); chunk.set(payload, 8);
    dv.setUint32(8 + payload.length, crc32(chunk.subarray(4, 8 + payload.length)));
    return chunk;
  };
  parts.push(text('chara', card)); if (v3) parts.push(text('ccv3', v3));   // V2(chara) 와 V3(ccv3) 를 함께 넣는다
  parts.push(iend || new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ════════ 변환기 ════════
const ROLE = ['system', 'user', 'assistant'];
// 월드 인포의 삽입 위치 번호: 0 설명 앞 · 1 설명 뒤 · 2 작가 노트 위 · 3 작가 노트 아래 · 4 깊이 · 5 예시 앞 · 6 예시 뒤 · 7 아울렛
const ST_POS = ['before', 'after', 'an_top', 'an_bottom', 'depth', 'em_top', 'em_bottom', 'outlet'];
const posNum = p => Math.max(0, ST_POS.indexOf(p));
const tri = v => v === true || v === false ? v : null;                                   // 켬 · 끔 · 따름(null)
const numOrNull = v => v === null || v === undefined || v === '' || isNaN(+v) ? null : +v;
// [드림랜드 이름, 월드 인포 파일 이름, 캐릭터 카드 책(extensions) 이름, 읽을 때 변환]
const WI_FLAGS = [
  ['ignoreBudget', 'ignoreBudget', 'ignore_budget'], ['excludeRecursion', 'excludeRecursion', 'exclude_recursion'], ['noRecurse', 'preventRecursion', 'prevent_recursion'], ['groupOverride', 'groupOverride', 'group_override'],
  ['matchPersona', 'matchPersonaDescription', 'match_persona_description'], ['matchCharDesc', 'matchCharacterDescription', 'match_character_description'], ['matchCharPersonality', 'matchCharacterPersonality', 'match_character_personality'],
  ['matchCharNote', 'matchCharacterDepthPrompt', 'match_character_depth_prompt'], ['matchScenario', 'matchScenario', 'match_scenario'], ['matchCreatorNotes', 'matchCreatorNotes', 'match_creator_notes'],
];
const WI_TRIGGERS = ['normal', 'continue', 'impersonate', 'swipe', 'regenerate', 'quiet'];

/** 월드 인포(.json) · 캐릭터 카드에 든 책(character_book) → 드림랜드 로어북 */
export function worldToLore(json, name) {
  const book = newLore({ name: json.name || name || '로어북', description: json.description || '' });
  if (json.scan_depth != null) book.scanDepth = json.scan_depth;
  if (json.token_budget) book.tokenBudget = json.token_budget;
  if (json.recursive_scanning != null) book.recursive = !!json.recursive_scanning;
  const dx = json.extensions?.dreamland; if (dx && typeof dx === 'object') for (const k of ['scanDepth', 'tokenBudget', 'recursive', 'caseSensitive', 'wholeWord']) if (dx[k] !== undefined) book[k] = dx[k];
  const list = Array.isArray(json.entries) ? json.entries : Object.values(json.entries || {});
  const sorted = list.every(e => (e.displayIndex ?? e.extensions?.display_index) != null) ? [...list].sort((a, b) => (a.displayIndex ?? a.extensions.display_index) - (b.displayIndex ?? b.extensions.display_index)) : list;
  for (const e of sorted) {
    const x = e.extensions || {};
    const isCardBook = 'keys' in e || 'insertion_order' in e;
    const g = (st, cb) => isCardBook ? x[cb] : e[st];                                    // 같은 뜻의 필드를 형식에 맞게 읽는다
    const pos = isCardBook ? (x.position != null ? ST_POS[x.position] : (e.position === 'after_char' ? 'after' : 'before')) : ST_POS[e.position ?? 0];
    const cf = (isCardBook ? x.character_filter : e.characterFilter) || {}, dur = g('delayUntilRecursion', 'delay_until_recursion');
    const more = {}; const vectorized = !!g('vectorized', 'vectorized'); if (e.addMemo === false) more.addMemo = false;
    const entry = newEntry({
      name: e.comment || e.name || '', keys: arr(isCardBook ? e.keys : e.key).map(String), keys2: e.selective !== false ? arr(isCardBook ? e.secondary_keys : e.keysecondary).map(String) : [],
      logic: +((isCardBook ? (x.selectiveLogic ?? e.selectiveLogic) : e.selectiveLogic) ?? 0) || 0, content: e.content || '', constant: !!e.constant,
      enabled: isCardBook ? e.enabled !== false : !e.disable, position: pos || 'before', depth: g('depth', 'depth') ?? 4,
      role: ROLE[g('role', 'role') ?? 0] || 'system', order: (isCardBook ? e.insertion_order : e.order) ?? 100,
      probability: (g('useProbability', 'useProbability') === false ? 100 : g('probability', 'probability')) ?? 100,
      caseSensitive: tri(isCardBook ? (e.case_sensitive ?? x.case_sensitive) : e.caseSensitive), wholeWord: tri(g('matchWholeWords', 'match_whole_words')), useGroupScoring: tri(g('useGroupScoring', 'use_group_scoring')),
      outlet: g('outletName', 'outlet_name') || '', group: g('group', 'group') || '', groupWeight: numOrNull(g('groupWeight', 'group_weight')) ?? 100,
      sticky: g('sticky', 'sticky') || null, cooldown: g('cooldown', 'cooldown') || null, delay: g('delay', 'delay') || null, scanDepth: numOrNull(g('scanDepth', 'scan_depth')),
      delayUntilRecursion: dur === true ? 1 : Math.max(0, +dur || 0), automationId: g('automationId', 'automation_id') || '',
      charFilter: { names: arr(cf.names).map(String), tags: arr(cf.tags).map(String), exclude: !!cf.isExclude },
      triggers: arr(g('triggers', 'triggers')).filter(t => WI_TRIGGERS.includes(t)), useRegex: !!(e.use_regex ?? x.use_regex ?? x.dreamland_use_regex ?? e.extensions?.dreamland_use_regex),
      ...(vectorized ? { vectorized: true } : {}), ...(Object.keys(more).length ? { more } : {}),
    });
    for (const [mine, st, cb] of WI_FLAGS) entry[mine] = !!g(st, cb);
    book.entries.push(entry);
  }
  return book;
}
/** 드림랜드 로어북 → 월드 인포(.json). 드림랜드에만 있는 책 설정은 extensions.dreamland 에 담아 되돌아올 수 있게 한다 */
export function loreToWorld(book) {
  const entries = {};
  (book.entries || []).forEach((e, i) => {
    const cf = e.charFilter || {};
    entries[i] = {
      uid: i, key: e.keys || [], keysecondary: e.keys2 || [], comment: e.name || '', content: e.content || '', constant: !!e.constant, vectorized: !!(e.vectorized || e.more?.vectorized), use_regex: !!e.useRegex, selective: true, selectiveLogic: +e.logic || 0,
      addMemo: e.more?.addMemo !== false, order: e.order ?? 100, position: posNum(e.position), disable: e.enabled === false,
      probability: e.probability ?? 100, useProbability: true, depth: e.depth ?? 4, role: Math.max(0, ROLE.indexOf(e.role)), outletName: e.outlet || '',
      group: e.group || '', groupOverride: !!(e.groupOverride ?? true), groupWeight: e.groupWeight ?? 100, scanDepth: numOrNull(e.scanDepth),
      caseSensitive: tri(e.caseSensitive), matchWholeWords: tri(e.wholeWord), useGroupScoring: tri(e.useGroupScoring), automationId: e.automationId || '',
      sticky: +e.sticky || 0, cooldown: +e.cooldown || 0, delay: +e.delay || 0, delayUntilRecursion: +e.delayUntilRecursion || 0,
      characterFilter: { isExclude: !!cf.exclude, names: cf.names || [], tags: cf.tags || [] }, triggers: e.triggers || [], displayIndex: i,
      ...Object.fromEntries(WI_FLAGS.map(([mine, st]) => [st, mine === 'groupOverride' ? !!(e.groupOverride ?? true) : !!e[mine]])),
    };
  });
  return { name: book.name, description: book.description || '', entries, extensions: { dreamland: { scanDepth: book.scanDepth ?? 4, tokenBudget: book.tokenBudget || 2048, recursive: !!book.recursive, caseSensitive: !!book.caseSensitive, wholeWord: !!book.wholeWord } } };
}
/** 캐릭터 카드에 넣는 책(character_book)의 항목 */
export function loreToCardBook(book) {
  return {
    name: book.name, description: book.description || '', scan_depth: book.scanDepth ?? 4, token_budget: book.tokenBudget || 2048, recursive_scanning: !!book.recursive,
    extensions: { dreamland: { caseSensitive: !!book.caseSensitive, wholeWord: !!book.wholeWord } },
    entries: (book.entries || []).map((e, i) => {
      const cf = e.charFilter || {};
      return {
        id: i, keys: e.keys || [], secondary_keys: e.keys2 || [], comment: e.name || '', content: e.content || '', constant: !!e.constant, selective: true, insertion_order: e.order ?? 100, enabled: e.enabled !== false,
        position: e.position === 'after' ? 'after_char' : 'before_char', use_regex: !!e.useRegex,
        extensions: {
          position: posNum(e.position), depth: e.depth ?? 4, role: Math.max(0, ROLE.indexOf(e.role)), probability: e.probability ?? 100, useProbability: true, selectiveLogic: +e.logic || 0, display_index: i,
          outlet_name: e.outlet || '', group: e.group || '', group_weight: e.groupWeight ?? 100, scan_depth: numOrNull(e.scanDepth), case_sensitive: tri(e.caseSensitive), match_whole_words: tri(e.wholeWord), use_group_scoring: tri(e.useGroupScoring),
          automation_id: e.automationId || '', vectorized: !!e.more?.vectorized, sticky: +e.sticky || 0, cooldown: +e.cooldown || 0, delay: +e.delay || 0, delay_until_recursion: +e.delayUntilRecursion || 0,
          character_filter: { isExclude: !!cf.exclude, names: cf.names || [], tags: cf.tags || [] }, triggers: e.triggers || [],
          ...Object.fromEntries(WI_FLAGS.map(([mine, , cb]) => [cb, mine === 'groupOverride' ? !!(e.groupOverride ?? true) : !!e[mine]])),
        },
      };
    }),
  };
}

export function stRegexToRegex(r, scope = 'global') {
  const pl = arr(r.placement);
  return newRegex({
    name: r.scriptName || r.name || '정규식', find: r.findRegex || '', replace: r.replaceString || '', trim: arr(r.trimStrings),
    onUser: pl.includes(1) || pl.includes('user_input'), onAI: pl.includes(2) || pl.includes('ai_output'),
    mode: r.applyMode ? r.applyMode : (r.markdownOnly && r.promptOnly ? 'both' : r.markdownOnly ? 'display' : bool(r.promptOnly) ? 'prompt' : 'store'),
    enabled: r.enabled != null ? bool(r.enabled) : !r.disabled, minDepth: r.minDepth ?? null, maxDepth: r.maxDepth ?? null, scope,
  });
}

/** 캐릭터 카드(V1/V2/V3) → 드림랜드 캐릭터 (+내장 로어북, 정규식) */
export function cardToChar(card, avatar = '') {
  const d = card.data && typeof card.data === 'object' ? card.data : card;
  const x = d.extensions || {};
  const ch = newChar({
    name: d.name || card.name || '이름 없음', avatar, description: d.description || '', personality: d.personality || '', scenario: d.scenario || '',
    firstMes: d.first_mes || '', altGreetings: arr(d.alternate_greetings).filter(Boolean), mesExample: d.mes_example || '', systemPrompt: d.system_prompt || '',
    postHistory: d.post_history_instructions || '', creatorNotes: d.creator_notes || card.creatorcomment || '', creator: d.creator || '', version: d.character_version || '',
    tags: arr(d.tags).map(String), fav: bool(x.fav ?? card.fav), talk: Number(x.talkativeness ?? 0.5) || 0.5,
    depthPrompt: { prompt: x.depth_prompt?.prompt || '', depth: x.depth_prompt?.depth ?? 4, role: x.depth_prompt?.role || 'system' }, worldName: x.world || '',
    ext: Object.fromEntries(Object.entries(x).filter(([k]) => !EXT_OWN.includes(k))),                                                  // 드림랜드가 따로 다루지 않는 확장 필드는 그대로 보관
    more: Object.fromEntries(Object.entries(d).filter(([k]) => !DATA_OWN.includes(k))),                                                // V3 의 nickname · source · group_only_greetings · assets 등
  });
  if (!ch.creatorNotes && d.creator_notes_multilingual && typeof d.creator_notes_multilingual === 'object') ch.creatorNotes = d.creator_notes_multilingual.ko || d.creator_notes_multilingual.en || Object.values(d.creator_notes_multilingual)[0] || '';
  const extraBits = [x.backstory && `[Backstory]\n${x.backstory}`, x.appearance && `[Appearance]\n${x.appearance}`].filter(Boolean); // 형식 B 의 확장 필드
  if (extraBits.length) ch.description = [ch.description, ...extraBits].filter(Boolean).join('\n\n');
  const lore = d.character_book?.entries?.length ? worldToLore(d.character_book, d.character_book.name || `${ch.name}의 로어북`) : null;
  const regex = arr(x.regex_scripts).map(r => stRegexToRegex(r, ch.id));
  return { char: ch, lore, regex };
}
const EXT_OWN = ['talkativeness', 'fav', 'world', 'depth_prompt', 'regex_scripts'];
const DATA_OWN = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'alternate_greetings', 'tags', 'creator', 'character_version', 'extensions', 'character_book'];
/** v3 = true 면 캐릭터 카드 V3 스펙(chara_card_v3)으로 */
export function charToCard(ch, v3 = false) {
  const book = S.get('lore', (ch.loreIds || [])[0]);
  const more = { ...(ch.more || {}) };
  if (v3) { more.group_only_greetings = Array.isArray(more.group_only_greetings) ? more.group_only_greetings : []; more.creation_date ??= Math.floor((ch.createdAt || Date.now()) / 1000); more.modification_date = Math.floor((ch.updatedAt || Date.now()) / 1000); }
  return {
    spec: v3 ? 'chara_card_v3' : 'chara_card_v2', spec_version: v3 ? '3.0' : '2.0',
    data: {
      ...more,
      name: ch.name, description: ch.description, personality: ch.personality, scenario: ch.scenario, first_mes: ch.firstMes, mes_example: ch.mesExample,
      creator_notes: ch.creatorNotes, system_prompt: ch.systemPrompt, post_history_instructions: ch.postHistory, alternate_greetings: ch.altGreetings, tags: ch.tags,
      creator: ch.creator, character_version: ch.version,
      extensions: { ...(ch.ext || {}), talkativeness: ch.talk, fav: ch.fav, world: book?.name || '', depth_prompt: ch.depthPrompt, regex_scripts: S.regex.filter(r => r.scope === ch.id).map(regexToSt) },
      ...(book ? { character_book: loreToCardBook(book) } : {}),
    },
  };
}
export const regexToSt = r => ({ id: r.id, scriptName: r.name, findRegex: r.find, replaceString: r.replace, trimStrings: r.trim, placement: [r.onUser && 1, r.onAI && 2].filter(Boolean), disabled: !r.enabled, markdownOnly: r.mode === 'display' || r.mode === 'both', promptOnly: r.mode === 'prompt' || r.mode === 'both', minDepth: r.minDepth, maxDepth: r.maxDepth });

export async function exportCharPng(ch) {
  const img = new Image();
  const c = document.createElement('canvas');
  await new Promise(res => { img.onload = res; img.onerror = res; img.src = ch.avatar || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#8b7fd6"/></svg>'); });
  c.width = img.width || 400; c.height = img.height || 600;
  c.getContext('2d').drawImage(img, 0, 0);
  return writePngCard(dataURLToBytes(c.toDataURL('image/png')), charToCard(ch), charToCard(ch, true));
}

const ST_KIND = { main: 'main', worldInfoBefore: 'worldInfoBefore', worldInfoAfter: 'worldInfoAfter', personaDescription: 'personaDescription', charDescription: 'charDescription', charPersonality: 'charPersonality', scenario: 'scenario', dialogueExamples: 'dialogueExamples', chatHistory: 'chatHistory', jailbreak: 'jailbreak' };
const ST_NAME = { nsfw: '보조 프롬프트', enhanceDefinitions: '설정 강화' };
export function stPresetToPreset(j, name) {
  const p = defaultPreset(); p.name = name || j.name || '가져온 프리셋';
  const pick = (v, d) => (v === undefined || v === null ? d : v);
  Object.assign(p.params, {
    temperature: pick(j.temperature, 1), topP: pick(j.top_p, null), topK: j.top_k ? j.top_k : null, maxTokens: pick(j.openai_max_tokens, 4096), contextSize: pick(j.openai_max_context, 128000),
    freqPen: j.frequency_penalty || null, presPen: j.presence_penalty || null, stream: pick(j.stream_openai, true), squash: pick(j.squash_system_messages, true),
    prefill: j.assistant_prefill || '', effort: ['low', 'medium', 'high'].includes(j.reasoning_effort) ? j.reasoning_effort : '',
  });
  const prompts = new Map(arr(j.prompts).map(x => [x.identifier, x]));
  const orders = arr(j.prompt_order);
  const order = (orders.find(o => o.character_id === 100001) || orders[orders.length - 1])?.order || arr(j.prompts).map(x => ({ identifier: x.identifier, enabled: x.enabled !== false }));
  const fmt = (s, key) => typeof s === 'string' && s.trim() && s.trim() !== `{{${key}}}` && s.trim() !== '{0}' ? s.replace(`{{${key}}}`, '{{slot}}').replace('{0}', '{{slot}}') : '';
  const blocks = [];
  for (const o of order) {
    const x = prompts.get(o.identifier) || { identifier: o.identifier };
    const kind = ST_KIND[o.identifier] || 'text';
    if (kind === 'text' && !x.content && x.marker) continue;
    let content = x.content || '';
    if (kind === 'charPersonality') content = fmt(j.personality_format, 'personality');
    else if (kind === 'scenario') content = fmt(j.scenario_format, 'scenario');
    else if (kind === 'worldInfoBefore' || kind === 'worldInfoAfter') content = fmt(j.wi_format, 'x');
    else if (kind !== 'text' && kind !== 'main' && kind !== 'jailbreak') content = '';
    if (kind === 'chatHistory' && !blocks.some(b => b.kind === 'summary')) blocks.push({ id: uid(), kind: 'summary', name: MARKERS.summary, role: 'system', content: '{{slot}}', enabled: true, depth: null });
    blocks.push({ id: uid(), kind, name: kind === 'text' ? (x.name || ST_NAME[o.identifier] || o.identifier) : MARKERS[kind], role: x.role || 'system', content, enabled: o.enabled !== false, depth: x.injection_position === 1 ? (x.injection_depth ?? 4) : null });
  }
  if (!blocks.some(b => b.kind === 'chatHistory')) blocks.push({ id: uid(), kind: 'chatHistory', name: MARKERS.chatHistory, role: 'system', content: '', enabled: true, depth: null });
  p.blocks = blocks;
  return { preset: p, regex: arr(j.extensions?.regex_scripts).map(r => stRegexToRegex(r)) };
}

/** .jsonl 채팅 → { chat, msgs }.  resolve(m) 은 그룹 채팅에서 화자 캐릭터를 찾는다 */
export function stChatToChat(text, { charIds, name, resolve }) {
  const rows = text.split(/\r?\n/).filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const head = rows[0] && rows[0].mes === undefined ? rows.shift() : {};
  const meta = head.chat_metadata || {};
  const chat = newChat({ name: name || '', charIds, createdAt: parseDate(head.create_date) || now() });
  if (meta.note_prompt) chat.note = { text: meta.note_prompt, depth: meta.note_depth ?? 4, role: ROLE[meta.note_role ?? 0] || 'system' };
  if (meta.variables && typeof meta.variables === 'object') chat.vars = { ...meta.variables };
  const msgs = [];
  for (const r of rows) {
    if (typeof r.mes !== 'string') continue;
    const ts = parseDate(r.send_date) || now();
    const narrator = r.extra?.type === 'narrator' || (r.is_system && !r.is_user && r.name === 'System');
    const role = r.is_user ? 'user' : narrator ? 'system' : 'assistant';
    const swipes = (Array.isArray(r.swipes) && r.swipes.length ? r.swipes : [r.mes]).map((t, i) => ({ text: String(t), ts, reasoning: (r.swipe_info?.[i]?.extra?.reasoning) || undefined, model: r.swipe_info?.[i]?.extra?.model }));
    const sw = Math.min(swipes.length - 1, Math.max(0, r.swipe_id ?? 0));
    swipes[sw].text = r.mes;
    if (r.extra?.reasoning && !swipes[sw].reasoning) swipes[sw].reasoning = r.extra.reasoning;
    if (r.extra?.model) swipes[sw].model = r.extra.model;
    const m = newMsg(role, r.mes, { swipes, sw, ts, name: r.name || '', hidden: !!r.is_system && !narrator });
    if (role === 'assistant') m.charId = resolve ? resolve(r) : charIds[0];
    msgs.push(m);
  }
  if (msgs.length) chat.updatedAt = msgs[msgs.length - 1].ts;
  return { chat, msgs };
}
export function chatToStJsonl(chat, msgs, userName, charName) {
  const stamp = t => new Date(t).toISOString();
  const lines = [JSON.stringify({ user_name: userName, character_name: charName, create_date: stamp(chat.createdAt), chat_metadata: { note_prompt: chat.note?.text || '', note_depth: chat.note?.depth ?? 4, variables: chat.vars || {} } })];
  for (const m of msgs) lines.push(JSON.stringify({ name: m.role === 'user' ? userName : (m.name || charName), is_user: m.role === 'user', is_system: m.role === 'system' || !!m.hidden, send_date: stamp(m.ts), mes: m.swipes[m.sw].text, swipes: m.role === 'assistant' ? m.swipes.map(s => s.text) : undefined, swipe_id: m.role === 'assistant' ? m.sw : undefined, extra: m.role === 'system' ? { type: 'narrator' } : {} }));
  return lines.join('\n');
}

// ── 형식 B ──
function meCharData(row) {
  let d = row.data;
  for (let i = 0; i < 3 && typeof d === 'string'; i++) d = parseMaybe(d, {});
  if (d && typeof d === 'object' && d['0'] !== undefined) { // 문자열이 객체로 펼쳐져 저장된 행 복구
    const nk = Object.keys(d).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b);
    const base = parseMaybe(nk.map(k => d[k]).join(''), {});
    const extra = Object.fromEntries(Object.entries(d).filter(([k]) => !/^\d+$/.test(k)));
    d = { ...base, ...extra };
  }
  return d || {};
}
const ME_LOGIC = { and: 0, or: 0, not_all: 1, not: 2, and_all: 3 };
function meLoreToLore(lb, entries) {
  const book = newLore({ name: lb.name || '로어북', description: lb.description || '', scanDepth: lb.scanDepth ?? 4, tokenBudget: lb.tokenBudget || 2048, recursive: bool(lb.recursiveScanning) });
  const J = v => arr(parseMaybe(v, []));
  for (const e of [...entries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    book.entries.push(newEntry({
      name: e.name || '', keys: J(e.keys).map(String), keys2: bool(e.selective) ? J(e.secondaryKeys).map(String) : [], logic: ME_LOGIC[e.selectiveLogic] ?? 0, content: e.content || '',
      constant: bool(e.constant), enabled: bool(e.enabled ?? true), position: { 0: 'before', 1: 'after', 2: 'depth', 7: 'outlet' }[e.position] || 'before', depth: e.depth ?? 4,
      role: e.role || 'system', order: e.order ?? 100, probability: e.probability ?? 100, caseSensitive: bool(e.caseSensitive), wholeWord: bool(e.matchWholeWords),
      useRegex: bool(e.useRegex), noRecurse: bool(e.preventRecursion), outlet: e.outletName || '', group: e.group || '', sticky: e.sticky || null, cooldown: e.cooldown || null, delay: e.delay || null, scanDepth: e.scanDepth ?? null,
    }));
  }
  return book;
}
const snake = s => String(s || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'section';
function mePresetToPreset(pr, sections, groups, choices) {
  const p = defaultPreset(); p.name = pr.name || 'Marinara 프리셋';
  const P = parseMaybe(pr.parameters, {}) || {};
  Object.assign(p.params, {
    temperature: P.temperature ?? 1, topP: P.topP ?? null, topK: P.topK || null, maxTokens: P.maxTokens ?? 4096, contextSize: P.maxContext ?? 128000,
    freqPen: P.frequencyPenalty || null, presPen: P.presencePenalty || null, squash: P.squashSystemMessages ?? true, stop: arr(P.stopSequences),
    effort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(P.reasoningEffort) ? P.reasoningEffort : '',
  });
  // 변수(선택지) 값
  const vals = { ...(parseMaybe(pr.variableValues, {}) || {}), ...(parseMaybe(pr.defaultChoices, {}) || {}) };
  const sepOf = Object.fromEntries(choices.map(c => [c.variableName, c.separator || ', ']));
  // 하나만 고르는 선택지는 프리셋 변수로 옮긴다 (대화방마다 다시 고를 수 있게). 여러 개 고르는 선택지는 고른 값으로 채워 둔다
  p.vars = [];
  for (const c of choices) {
    if (!c.variableName || bool(c.multiSelect) || bool(c.randomPick)) continue;
    const opts = arr(parseMaybe(c.options, [])).map(o => ({ id: o.id, label: String(o.label ?? o.value ?? '').trim(), value: String(o.value ?? '') })).filter(o => o.label);
    if (!opts.length) continue;
    const cur = vals[c.variableName], hit = opts.find(o => o.value === cur || o.label === cur || o.id === cur);
    p.vars.push(opts.length === 1
      ? { id: uid(), name: c.variableName, label: c.question || c.variableName, type: 'toggle', default: !!hit, onText: opts[0].value }
      : { id: uid(), name: c.variableName, label: c.question || c.variableName, type: 'select', default: (hit || opts[0]).label, options: opts.map(o => ({ label: o.label, value: o.value })) });
    delete vals[c.variableName];
  }
  const fill = t => String(t || '').replace(/\{\{\s*([\w-]+)\s*\}\}/g, (m, k) => k in vals ? (Array.isArray(vals[k]) ? vals[k].join(sepOf[k] || ', ') : String(vals[k])) : m);
  const wrap = pr.wrapFormat || 'xml';
  const order = arr(parseMaybe(pr.sectionOrder, []));
  const sorted = [...sections].sort((a, b) => { const ia = order.indexOf(a.id), ib = order.indexOf(b.id); return (ia < 0 || ib < 0) ? (a.injectionOrder ?? 0) - (b.injectionOrder ?? 0) : ia - ib; });
  const gById = new Map(groups.map(g => [g.id, g]));
  const blocks = []; let openGroup = null;
  const text = (name, content, extra = {}) => blocks.push({ id: uid(), kind: 'text', name, role: 'system', content, enabled: true, depth: null, ...extra });
  const closeGroup = () => { if (openGroup && wrap === 'xml') text(`그룹 닫기: ${openGroup.name}`, `</${snake(openGroup.name)}>`); openGroup = null; };
  const frame = (s, body) => {
    if (bool(s.skipWrap)) return body;
    if (bool(s.wrapInXml) || wrap === 'xml') { const t = s.xmlTagName || snake(s.name); return `<${t}>\n${body}\n</${t}>`; }
    if (wrap === 'markdown') return `## ${s.name}\n${body}`;
    return body;
  };
  const KIND = { persona: ['personaDescription'], chat_history: ['chatHistory'], chat_summary: ['summary'], world_info_before: ['worldInfoBefore'], world_info_after: ['worldInfoAfter'], dialogue_examples: ['dialogueExamples'], lorebook: ['worldInfoBefore', 'worldInfoAfter'], character: ['charDescription', 'charPersonality', 'scenario'] };
  for (const s of sorted) {
    const g = s.groupId ? gById.get(s.groupId) : null;
    if ((g?.id || null) !== (openGroup?.id || null)) { closeGroup(); if (g && bool(g.enabled ?? true)) { openGroup = g; if (wrap === 'xml') text(`그룹 열기: ${g.name}`, `<${snake(g.name)}>`); else if (wrap === 'markdown') text(`그룹: ${g.name}`, `# ${g.name}`); } }
    const enabled = bool(s.enabled ?? true), role = s.role || 'system';
    const depth = s.injectionPosition === 'depth' ? (s.injectionDepth ?? 0) : null;
    if (bool(s.isMarker)) {
      const type = (parseMaybe(s.markerConfig, {}) || {}).type || s.identifier;
      const kinds = KIND[type]; if (!kinds) continue;
      if (kinds[0] === 'chatHistory') { closeGroup(); blocks.push({ id: uid(), kind: 'chatHistory', name: MARKERS.chatHistory, role: 'system', content: '', enabled: true, depth: null }); continue; }
      kinds.forEach((kind, i) => blocks.push({ id: uid(), kind, name: MARKERS[kind], role, enabled, depth, content: kinds.length === 1 ? frame(s, '{{slot}}') : (kind === 'charPersonality' ? "[{{char}}'s personality: {{slot}}]" : kind === 'scenario' ? '[Scenario: {{slot}}]' : '') }));
    } else if ((s.content || '').trim()) {
      text(s.name || '프롬프트', frame(s, fill(s.content)), { role, enabled, depth });
    }
  }
  closeGroup();
  if (!blocks.some(b => b.kind === 'chatHistory')) blocks.push({ id: uid(), kind: 'chatHistory', name: MARKERS.chatHistory, role: 'system', content: '', enabled: true, depth: null });
  p.blocks = blocks;
  return p;
}

// ════════ 소스 (브리지 서버 / 선택한 폴더) ════════
const BH = { 'Content-Type': 'application/json', 'x-dreamland': '1' };
export const bridge = {
  async ok() { try { return (await (await fetch('/api/ping')).json()).bridge === true; } catch { return false; } },
  async detect() { try { return await (await fetch('/api/detect')).json(); } catch { return []; } },
  async resolve(path) { const r = await fetch('/api/resolve', { method: 'POST', headers: BH, body: JSON.stringify({ path }) }); return r.ok ? r.json() : []; },
};
export function bridgeSource(root) {
  const post = (url, body) => fetch(url, { method: 'POST', headers: BH, body: JSON.stringify(body) });
  return {
    label: root,
    async list(sub) { const r = await post('/api/fs/list', { root, sub }); return r.ok ? r.json() : []; },
    async bytes(rel) { const r = await post('/api/fs/read', { root, rel }); if (!r.ok) throw new Error(`${rel} 읽기 실패`); return new Uint8Array(await r.arrayBuffer()); },
    async text(rel) { return new TextDecoder().decode(await this.bytes(rel)); },
  };
}
/** <input webkitdirectory> 로 고른 폴더. 가져올 데이터 폴더를 그 안에서 찾아낸다 */
export function filesSource(files) {
  const paths = files.map(f => (f.webkitRelativePath || f.name).replace(/\\/g, '/'));
  let prefix = null, kind = null;
  const mi = paths.find(p => /(^|\/)storage\/manifest\.json$/.test(p));
  if (mi) { prefix = mi.replace(/storage\/manifest\.json$/, ''); kind = 'marinara'; }
  else {
    const si = paths.filter(p => /(^|\/)settings\.json$/.test(p)).map(p => p.replace(/settings\.json$/, '')).filter(pre => paths.some(p => p.startsWith(pre + 'characters/')));
    if (si.length) { prefix = si.sort((a, b) => a.length - b.length)[0]; kind = 'st'; }
  }
  if (prefix === null) return null;
  const map = new Map();
  files.forEach((f, i) => { if (paths[i].startsWith(prefix)) map.set(paths[i].slice(prefix.length), f); });
  return {
    kind, label: prefix || files[0]?.name,
    async list(sub) {
      const pre = sub ? sub.replace(/\/?$/, '/') : ''; const seen = new Map();
      for (const [p, f] of map) { if (!p.startsWith(pre)) continue; const rest = p.slice(pre.length); const i = rest.indexOf('/'); const name = i < 0 ? rest : rest.slice(0, i); if (name && !seen.has(name)) seen.set(name, { name, dir: i >= 0, size: i < 0 ? f.size : 0, mtime: f.lastModified }); }
      return [...seen.values()];
    },
    async bytes(rel) { const f = map.get(rel); if (!f) throw new Error(`${rel} 없음`); return new Uint8Array(await f.arrayBuffer()); },
    async text(rel) { const f = map.get(rel); if (!f) throw new Error(`${rel} 없음`); return f.text(); },
  };
}

// ════════ 저장 도우미 (중복 가져오기 방지: src 키로 갱신) ════════
function tally() { return { chars: 0, chats: 0, msgs: 0, lore: 0, presets: 0, personas: 0, regex: 0, quick: 0, templates: 0, skipped: 0, errors: [] }; }
async function upsert(coll, obj, src) {
  obj.src = src;
  const old = src ? S[coll].find(x => x.src === src) : null;
  if (old) { obj.id = old.id; if (coll === 'chars') { obj.loreIds = [...new Set([...(old.loreIds || []), ...(obj.loreIds || [])])]; obj.createdAt = old.createdAt; } }
  await S.save(coll, obj, true);
  return obj;
}
const avatarFrom = async (bytes, name) => shrinkImage(bytesToDataURL(bytes, mimeOf(name)), 720);
const safe = async (T, label, fn) => { try { return await fn(); } catch (e) { console.warn(label, e); T.errors.push(`${label}: ${e.message}`); return null; } };

async function saveCard(card, avatar, src, T) {
  const { char, lore, regex } = cardToChar(card, avatar);
  if (lore) { const lb = await upsert('lore', lore, src ? src + '#book' : ''); char.loreIds = [lb.id]; T.lore++; }
  const saved = await upsert('chars', char, src);
  for (const r of regex) { r.scope = saved.id; await upsert('regex', r, src ? `${src}#re:${r.name}` : ''); T.regex++; }
  T.chars++;
  return saved;
}

// ════════ 가져오기: 형식 A ════════
export async function scanST(src) {
  const names = async (sub, re) => (await src.list(sub)).filter(x => !x.dir && re.test(x.name)).map(x => x.name);
  const inv = { chars: await names('characters', /\.png$/i), worlds: await names('worlds', /\.json$/i), presets: await names('OpenAI Settings', /\.json$/i), groups: await names('groups', /\.json$/i), quick: await names('QuickReplies', /\.json$/i), chats: [], personas: 0, regex: 0 };
  for (const d of (await src.list('chats')).filter(x => x.dir)) for (const f of await names('chats/' + d.name, /\.jsonl$/i)) inv.chats.push(`${d.name}/${f}`);
  try { const s = JSON.parse(await src.text('settings.json')); inv.personas = Object.keys(s.power_user?.personas || {}).length; inv.regex = arr(s.extension_settings?.regex).length; } catch { }
  return inv;
}

export async function importST(src, want, progress = () => { }) {
  const T = tally(); const inv = await scanST(src);
  const tag = s => 'st:' + s;
  let settings = {};
  try { settings = JSON.parse(await src.text('settings.json')); } catch { }
  const worldIds = new Map();

  if (want.lore) for (const f of inv.worlds) {
    progress(`로어북 · ${f}`);
    await safe(T, f, async () => {
      const name = f.replace(/\.json$/i, '');
      const book = worldToLore(JSON.parse(await src.text('worlds/' + f)), name); book.name = name;
      const wi = settings.world_info_settings || {};
      if (wi.world_info_depth != null) book.scanDepth = wi.world_info_depth;
      if (wi.world_info_recursive != null) book.recursive = !!wi.world_info_recursive;
      worldIds.set(name, (await upsert('lore', book, tag('world/' + f))).id); T.lore++;
    });
  }
  if (want.lore) {
    const sel = arr(settings.world_info_settings?.world_info?.globalSelect ?? settings.world_info?.globalSelect).map(n => worldIds.get(n)).filter(Boolean);
    if (sel.length) S.set({ activeLore: [...new Set([...S.settings.activeLore, ...sel])] });
  }

  const charByFile = new Map();
  if (want.chars) for (const f of inv.chars) {
    progress(`캐릭터 · ${f}`);
    await safe(T, f, async () => {
      const bytes = await src.bytes('characters/' + f);
      const card = readPngCard(bytes); if (!card) throw new Error('카드 정보가 없는 이미지');
      const ch = await saveCard(card, await avatarFrom(bytes, f), tag('char/' + f), T);
      const linked = worldIds.get(ch.worldName) || S.lore.find(l => l.name === ch.worldName)?.id;
      if (linked && !ch.loreIds.includes(linked)) { ch.loreIds.push(linked); await S.save('chars', ch, true); }
      charByFile.set(f, ch);
    });
  } else for (const c of S.chars) if (c.src?.startsWith('st:char/')) charByFile.set(c.src.slice(8), c);

  if (want.chats) {
    for (const rel of inv.chats) {
      const [dir, file] = rel.split('/'); const key = tag('chat/' + rel);
      const ch = charByFile.get(dir + '.png') || [...charByFile.values()].find(c => c.name === dir);
      if (!ch || S.chats.some(c => c.src === key)) { T.skipped++; continue; }
      progress(`채팅 · ${rel}`);
      await safe(T, rel, async () => {
        const { chat, msgs } = stChatToChat(await src.text('chats/' + rel), { charIds: [ch.id], name: file.replace(/\.jsonl$/i, '') });
        if (!msgs.length) { T.skipped++; return; }
        chat.src = key; await S.saveMsgs(chat, msgs); T.chats++; T.msgs += msgs.length;
      });
    }
    for (const gf of inv.groups) await safe(T, gf, async () => {
      const g = JSON.parse(await src.text('groups/' + gf));
      const members = arr(g.members).map(m => charByFile.get(m)).filter(Boolean);
      if (!members.length) { T.skipped++; return; }
      for (const id of arr(g.chats)) {
        const key = tag(`gchat/${id}`); if (S.chats.some(c => c.src === key)) { T.skipped++; continue; }
        progress(`그룹 채팅 · ${g.name}`);
        const text = await src.text(`group chats/${id}.jsonl`).catch(() => ''); if (!text) continue;
        const { chat, msgs } = stChatToChat(text, { charIds: members.map(m => m.id), name: `${g.name} · ${id}`, resolve: r => (charByFile.get(r.original_avatar) || members.find(m => m.name === r.name) || members[0]).id });
        if (!msgs.length) continue;
        chat.src = key; await S.saveMsgs(chat, msgs); T.chats++; T.msgs += msgs.length;
      }
    });
  }

  // 고급 포맷팅 템플릿 (instruct · context · sysprompt · reasoning 폴더): 기본 제공과 다른 것만 보관함에 넣는다
  if (want.presets) for (const kind of Object.keys(KINDS)) {
    let files = []; try { files = (await src.list(kind)).filter(x => !x.dir && /\.json$/i.test(x.name)).map(x => x.name); } catch { }
    for (const f of files) await safe(T, `${kind}/${f}`, async () => { const j = JSON.parse(await src.text(`${kind}/${f}`)); if (tplKind(j) !== kind) return; T.templates += tplImport(j, f).filter(x => !x.same).length; });
  }
  if (want.presets) for (const f of inv.presets) {
    progress(`프리셋 · ${f}`);
    await safe(T, f, async () => {
      const { preset, regex } = stPresetToPreset(JSON.parse(await src.text('OpenAI Settings/' + f)), f.replace(/\.json$/i, ''));
      await upsert('presets', preset, tag('preset/' + f)); T.presets++;
      if (want.regex) for (const r of regex) { await upsert('regex', r, tag(`preset/${f}#re:${r.name}`)); T.regex++; }
    });
  }

  if (want.personas) {
    const pu = settings.power_user || {};
    for (const [file, name] of Object.entries(pu.personas || {})) {
      progress(`페르소나 · ${name}`);
      await safe(T, name, async () => {
        const avatar = await src.bytes('User Avatars/' + file).then(b => avatarFrom(b, file)).catch(() => '');
        const p = await upsert('personas', newPersona({ name, avatar, description: pu.persona_descriptions?.[file]?.description || '' }), tag('persona/' + file)); T.personas++;
        if (pu.default_persona === file) S.set({ activePersona: p.id });
      });
    }
  }

  if (want.regex) for (const r of arr(settings.extension_settings?.regex)) { await upsert('regex', stRegexToRegex(r), tag('re/' + (r.id || r.scriptName))); T.regex++; }

  if (want.quick) for (const f of inv.quick) await safe(T, f, async () => {
    const q = JSON.parse(await src.text('QuickReplies/' + f));
    T.quick += qrAddSet(stQrToSet(q, f.replace(/\.json$/i, '')));   // 세트째로 (명령 스크립트 · 자동 실행 설정 포함)
  });

  emit('imported'); return T;
}

// ════════ 가져오기: 형식 B ════════
async function meTable(src, name) {
  const rowsOf = j => Array.isArray(j) ? j : arr(j?.rows);
  try { return rowsOf(JSON.parse(await src.text(`storage/tables/${name}.json`))); } catch { }
  const out = [];
  for (const f of await src.list(`storage/tables/${name}`)) {
    if (f.dir || f.name.startsWith('.') || !/\.json$/i.test(f.name)) continue;
    try { out.push(...rowsOf(JSON.parse(await src.text(`storage/tables/${name}/${f.name}`)))); } catch { }
  }
  return out;
}
const isMariBuiltin = (row, d) => row.id?.startsWith('__') || d?.extensions?.isBuiltInAssistant;

export async function scanME(src) {
  const [chars, personas, chats, lore, presets, regex] = await Promise.all(['characters', 'personas', 'chats', 'lorebooks', 'prompt_presets', 'regex_scripts'].map(t => meTable(src, t)));
  return { chars: chars.filter(r => !isMariBuiltin(r, meCharData(r))).length, personas: personas.length, chats: chats.filter(c => !arr(parseMaybe(c.characterIds, [])).some(id => String(id).startsWith('__'))).length, lore: lore.length, presets: presets.length, regex: regex.length };
}

export async function importME(src, want, progress = () => { }) {
  const T = tally(); const tag = s => 'me:' + s;
  const avatarOf = async p => {
    const m = String(p || '').match(/\/api\/avatars\/file\/([^?#]+)/); if (!m) return '';
    const f = decodeURIComponent(m[1]);
    return src.bytes('avatars/' + f).then(b => avatarFrom(b, f)).catch(() => '');
  };
  const charMap = new Map(), loreMap = new Map(), personaMap = new Map();

  if (want.lore) {
    const books = await meTable(src, 'lorebooks'), entries = await meTable(src, 'lorebook_entries');
    const globals = [];
    for (const lb of books) {
      progress(`로어북 · ${lb.name}`);
      await safe(T, lb.name, async () => {
        const mine = entries.filter(e => e.lorebookId === lb.id);
        const saved = await upsert('lore', meLoreToLore(lb, mine), tag('lore/' + lb.id));
        loreMap.set(lb.id, saved.id); T.lore++;
        // 항목에 캐릭터 필터가 걸려 있으면 전역이 아니라 그 캐릭터 전용으로 연결한다
        lb._chars = new Set([lb.characterId, ...arr(parseMaybe(lb.characterIds, [])), ...mine.flatMap(e => e.characterFilterMode === 'exclude' ? [] : arr(parseMaybe(e.characterFilterIds, [])))].filter(Boolean));
        if (bool(lb.isGlobal) && bool(lb.enabled ?? true) && !lb._chars.size) globals.push(saved.id);
      });
    }
    if (globals.length) S.set({ activeLore: [...new Set([...S.settings.activeLore, ...globals])] });
    var meBooks = books;
  }

  if (want.chars) for (const row of await meTable(src, 'characters')) {
    const d = meCharData(row); if (isMariBuiltin(row, d)) continue;
    progress(`캐릭터 · ${d.name || row.id}`);
    await safe(T, d.name || row.id, async () => {
      const ch = await saveCard({ data: d }, await avatarOf(row.avatarPath), tag('char/' + row.id), T);
      charMap.set(row.id, ch);
    });
  } else for (const c of S.chars) if (c.src?.startsWith('me:char/')) charMap.set(c.src.slice(8), c);

  for (const b of meBooks || []) for (const cid of b._chars || []) {
    const ch = charMap.get(cid), lid = loreMap.get(b.id);
    if (ch && lid && !ch.loreIds.includes(lid)) { ch.loreIds.push(lid); await S.save('chars', ch, true); }
  }

  if (want.personas) for (const p of await meTable(src, 'personas')) {
    progress(`페르소나 · ${p.name}`);
    await safe(T, p.name, async () => {
      const desc = [p.description, p.personality && `[Personality]\n${p.personality}`, p.appearance && `[Appearance]\n${p.appearance}`, p.backstory && `[Backstory]\n${p.backstory}`].filter(Boolean).join('\n\n');
      const saved = await upsert('personas', newPersona({ name: p.name || '나', avatar: await avatarOf(p.avatarPath), description: desc }), tag('persona/' + p.id));
      personaMap.set(p.id, saved.id); T.personas++;
      if (bool(p.isActive)) S.set({ activePersona: saved.id });
    });
  } else for (const p of S.personas) if (p.src?.startsWith('me:persona/')) personaMap.set(p.src.slice(11), p.id);

  if (want.presets) {
    const [sections, groups, choices] = await Promise.all(['prompt_sections', 'prompt_groups', 'choice_blocks'].map(t => meTable(src, t)));
    for (const pr of await meTable(src, 'prompt_presets')) {
      progress(`프리셋 · ${pr.name}`);
      await safe(T, pr.name, async () => { await upsert('presets', mePresetToPreset(pr, sections.filter(s => s.presetId === pr.id), groups.filter(g => g.presetId === pr.id), choices.filter(c => c.presetId === pr.id).map(c => ({ ...c }))), tag('preset/' + pr.id)); T.presets++; });
    }
  }

  if (want.regex) for (const r of await meTable(src, 'regex_scripts')) {
    const targets = arr(parseMaybe(r.targetCharacterIds, []));
    const rx = stRegexToRegex({ ...r, scriptName: r.name, placement: arr(parseMaybe(r.placement, [])), trimStrings: arr(parseMaybe(r.trimStrings, [])), applyMode: r.applyMode || (bool(r.promptOnly) ? 'prompt' : 'display'), findRegex: /^\/[\s\S]+\/[a-z]*$/.test(r.findRegex || '') ? r.findRegex : `/${String(r.findRegex || '').replace(/\//g, '\\/')}/${r.flags || 'g'}` }, charMap.get(targets[0])?.id || 'global');
    await upsert('regex', rx, tag('re/' + r.id)); T.regex++;
  }

  if (want.chats) {
    const chats = await meTable(src, 'chats'), messages = await meTable(src, 'messages'), swipes = await meTable(src, 'message_swipes');
    const swByMsg = new Map(); for (const s of swipes) (swByMsg.get(s.messageId) || swByMsg.set(s.messageId, []).get(s.messageId)).push(s);
    for (const c of chats) {
      const ids = arr(parseMaybe(c.characterIds, [])); const key = tag('chat/' + c.id);
      const members = ids.map(id => charMap.get(id)).filter(Boolean);
      if (!members.length || S.chats.some(x => x.src === key)) { T.skipped++; continue; }
      progress(`채팅 · ${c.name}`);
      await safe(T, c.name, async () => {
        const meta = parseMaybe(c.metadata, {}) || {};
        const chat = newChat({ name: c.name || '', mode: c.mode === 'conversation' ? 'talk' : 'rp', charIds: members.map(m => m.id), personaId: personaMap.get(c.personaId) || '', createdAt: parseDate(c.createdAt) || now(), summary: typeof meta.summary === 'string' ? meta.summary : '', loreIds: arr(meta.activeLorebookIds).map(id => loreMap.get(id)).filter(Boolean), src: key });
        const msgs = messages.filter(m => m.chatId === c.id).sort((a, b) => parseDate(a.createdAt) - parseDate(b.createdAt)).map(m => {
          const ts = parseDate(m.createdAt) || now(); const ex = parseMaybe(m.extra, {}) || {};
          const sw = (swByMsg.get(m.id) || []).sort((a, b) => a.index - b.index).map(s => { const e = parseMaybe(s.extra, {}) || {}; return { text: s.content || '', ts: parseDate(s.createdAt) || ts, reasoning: e.thinking || undefined, model: e.generationInfo?.model }; });
          const list = sw.length ? sw : [{ text: m.content || '', ts, reasoning: ex.thinking || undefined, model: ex.generationInfo?.model }];
          const idx = Math.min(list.length - 1, Math.max(0, m.activeSwipeIndex ?? 0));
          const role = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system';
          const who = charMap.get(m.characterId) || members[0];
          return newMsg(role, '', { swipes: list, sw: idx, ts, charId: role === 'assistant' ? who.id : '', name: role === 'assistant' ? who.name : '' });
        });
        if (!msgs.length) { T.skipped++; return; }
        chat.updatedAt = msgs[msgs.length - 1].ts; chat.summaryAt = chat.summary ? msgs.length : 0;
        await S.saveMsgs(chat, msgs); T.chats++; T.msgs += msgs.length;
      });
    }
  }
  emit('imported'); return T;
}

// ════════ 개별 파일 (자동 판별) ════════
export async function importFiles(files, progress = () => { }) {
  const T = tally();
  for (const f of files) {
    progress(f.name);
    await safe(T, f.name, async () => {
      const ext = f.name.split('.').pop().toLowerCase(); const base = f.name.replace(/\.[^.]+$/, '');
      if (['png', 'webp', 'jpg', 'jpeg'].includes(ext)) {
        const bytes = new Uint8Array(await f.arrayBuffer()); const card = readPngCard(bytes);
        if (!card) throw new Error('캐릭터 카드 정보가 들어 있지 않은 이미지입니다');
        await saveCard(card, await avatarFrom(bytes, f.name), '', T); return;
      }
      const text = await f.text();
      if (ext === 'jsonl') {
        const head = JSON.parse(text.split(/\r?\n/).find(l => l.trim()) || '{}');
        const firstAi = text.split(/\r?\n/).map(l => { try { return JSON.parse(l); } catch { return null; } }).find(r => r && r.mes !== undefined && !r.is_user);
        const cname = (head.character_name && head.character_name !== 'unused' ? head.character_name : firstAi?.name) || base;
        let ch = S.chars.find(c => c.name === cname);
        if (!ch) { ch = await S.save('chars', newChar({ name: cname }), true); T.chars++; }
        const { chat, msgs } = stChatToChat(text, { charIds: [ch.id], name: base });
        await S.saveMsgs(chat, msgs); T.chats++; T.msgs += msgs.length; return;
      }
      const j = JSON.parse(text);
      if (j.app === 'dreamland') { await S.importAll(j, false); T.chars += arr(j.chars).length; T.chats += arr(j.chats).length; return; }
      if (typeof j.type === 'string' && j.type.startsWith('marinara_') && j.data) {
        const d = j.data;
        if (j.type === 'marinara_character') { await saveCard(d.data ? d : { data: d }, d.avatar ? await shrinkImage(d.avatar, 720) : '', '', T); return; }
        if (j.type === 'marinara_persona') { await S.save('personas', newPersona({ name: d.name || '나', description: [d.description, d.personality, d.appearance, d.backstory].filter(Boolean).join('\n\n'), avatar: d.avatar ? await shrinkImage(d.avatar, 720) : '' }), true); T.personas++; return; }
        if (j.type === 'marinara_lorebook') { await S.save('lore', meLoreToLore(d.lorebook || d, arr(d.entries)), true); T.lore++; return; }
        if (j.type === 'marinara_preset') { await S.save('presets', mePresetToPreset(d.preset || d, arr(d.sections), arr(d.groups), arr(d.choiceBlocks)), true); T.presets++; return; }
        throw new Error(`아직 지원하지 않는 Marinara 내보내기 형식 (${j.type})`);
      }
      if (j.spec || (j.name && (j.first_mes !== undefined || j.description !== undefined)) || j.data?.first_mes !== undefined) { await saveCard(j, '', '', T); return; }
      if (j.entries && typeof j.entries === 'object') { const b = worldToLore(j, base); if (!j.name) b.name = base; await S.save('lore', b, true); T.lore++; return; }
      if (Array.isArray(j.prompts) || j.prompt_order || j.openai_max_tokens !== undefined) {
        const { preset, regex } = stPresetToPreset(j, base); await S.save('presets', preset, true); T.presets++;
        for (const r of regex) { await S.save('regex', r, true); T.regex++; } return;
      }
      const rs = Array.isArray(j) ? j : [j];
      if (rs.every(r => r && (r.findRegex !== undefined || r.find !== undefined))) { for (const r of rs) { await S.save('regex', r.find !== undefined ? newRegex(r) : stRegexToRegex(r), true); T.regex++; } return; }
      if (tplKind(j) || Object.keys(KINDS).some(k => tplKind(j[k]) === k)) { T.templates += tplImport(j, base).length; return; }   // 고급 포맷팅 템플릿 (낱개 · 전체 내보내기)
      if (Array.isArray(j.qrList)) { T.quick += qrAddSet(stQrToSet(j, base)); return; }   // Quick Reply 세트
      throw new Error('알 수 없는 형식의 파일입니다');
    });
  }
  emit('imported'); return T;
}

export const summarize = T => [['캐릭터', T.chars], ['채팅', T.chats], ['메시지', T.msgs], ['로어북', T.lore], ['프리셋', T.presets], ['페르소나', T.personas], ['정규식', T.regex], ['빠른 답장', T.quick], ['포맷팅 템플릿', T.templates]].filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ') || '새로 가져온 항목 없음';
