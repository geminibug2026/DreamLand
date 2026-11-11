// ── Dreamland core: 유틸 · IndexedDB · 스토어 · 기본값 ──

// replaceChildren / append 에 null·false·undefined 가 섞여 들어가면 글자로 찍히므로 걸러 낸다
for (const name of ['replaceChildren', 'append', 'prepend']) { const orig = Element.prototype[name]; Element.prototype[name] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter(k => k != null && k !== false)); }; }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
export const now = () => Date.now();
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const bool = v => v === true || v === 'true' || v === 1;
export const arr = v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
export function parseMaybe(v, fallback) {
  if (typeof v !== 'string') return v ?? fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

export function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** h('div.cls#id', {onclick, title, html, ...attrs}, ...children) */
export function h(spec, props, ...kids) {
  const m = spec.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m?.[1] || 'div');
  (m?.[2] || '').replace(/([.#])([\w-]+)/g, (_, t, n) => { if (t === '.') el.classList.add(n); else el.id = n; });
  if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') { for (const [p, val] of Object.entries(v)) p.startsWith('--') ? el.style.setProperty(p, val) : (el.style[p] = val); }
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list' && k !== 'form') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return el;
}

export function download(name, data, type = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function pickFiles({ accept = '', multiple = false, dir = false } = {}) {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    if (dir) inp.webkitdirectory = true;
    inp.addEventListener('change', () => { resolve([...inp.files]); inp.remove(); });
    inp.addEventListener('cancel', () => { resolve([]); inp.remove(); });
    document.body.append(inp); inp.click();
  });
}

export const readText = f => f.text();
export const readBuf = f => f.arrayBuffer();
export const readDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
export function bytesToDataURL(bytes, mime = 'image/png') {
  let s = ''; const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(s)}`;
}
export function dataURLToBytes(url) {
  const b = atob(url.split(',')[1] || ''); const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
export const mimeOf = name => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }[String(name).split('.').pop().toLowerCase()] || 'image/png');

/** 큰 이미지를 줄여 dataURL 로 (DB 용량 절약) */
export function shrinkImage(src, max = 720, mime = 'image/webp', q = 0.9) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      if (k === 1 && src.length < 400000) return resolve(src);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL(mime, q));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

export function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), n = new Date();
  const same = d.toDateString() === n.toDateString();
  const hm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (same) return hm;
  if (d.getFullYear() === n.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
export function parseDate(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  let t = Date.parse(v);
  if (!isNaN(t)) return t;
  // "2024-3-1@14h05m33s" / "2024-03-01 @14h 05m 33s 120ms"
  const m = String(v).match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*@?\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return 0;
}

// ── 이벤트 버스 ──
const listeners = {};
export const on = (ev, fn) => { (listeners[ev] ||= new Set()).add(fn); return () => listeners[ev].delete(fn); };
export const emit = (ev, data) => { (listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); };

// ── IndexedDB ──
// assets: 캐릭터 에셋·삽화 이미지,  mem: 대화별 장기기억
const STORES = ['chars', 'chats', 'msgs', 'personas', 'lore', 'presets', 'conns', 'regex', 'kv', 'assets', 'mem'];
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('dreamland', 3);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
      const as = r.transaction.objectStore('assets'); if (!as.indexNames.contains('owner')) as.createIndex('owner', 'owner'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode); const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
export const DB = {
  all: s => tx(s, 'readonly', o => o.getAll()),
  get: (s, id) => tx(s, 'readonly', o => o.get(id)),
  put: (s, v) => tx(s, 'readwrite', o => o.put(v)),
  del: (s, id) => tx(s, 'readwrite', o => o.delete(id)),
  clear: s => tx(s, 'readwrite', o => o.clear()),
  byOwner: owner => tx('assets', 'readonly', o => o.index('owner').getAll(owner)),
  bulk: (s, list) => tx(s, 'readwrite', o => { list.forEach(v => o.put(v)); }),
};

// ── 기본값 ──
export const MARKERS = {
  main: '메인 프롬프트', worldInfoBefore: '로어북 (앞)', personaDescription: '페르소나', charDescription: '캐릭터 설명',
  charPersonality: '캐릭터 성격', scenario: '시나리오', worldInfoAfter: '로어북 (뒤)', dialogueExamples: '대화 예시',
  summary: '장기기억 자리', chatHistory: '채팅 기록', jailbreak: '후속 지시',
};

export function defaultPreset() {
  const b = (kind, extra = {}) => ({ id: uid(), kind, name: MARKERS[kind] || extra.name || '프롬프트', role: 'system', content: '', enabled: true, depth: null, ...extra });
  return {
    id: uid(), name: '드림랜드 기본', createdAt: now(),
    params: { temperature: 1, topP: null, topK: null, maxTokens: 4096, contextSize: 128000, freqPen: null, presPen: null, minP: null, topA: null, repPen: null, seed: null, stream: true, effort: '', squash: true, prefill: '', stop: [], cardOverrides: true, namesInGroup: true },
    blocks: [
      b('main', { content: "Write {{char}}'s next reply in a fictional roleplay between {{char}} and {{user}}. Stay in character, keep the story moving, and never write {{user}}'s actions or dialogue for them. Put spoken dialogue in double quotes and inner thoughts in single quotes." }),
      b('worldInfoBefore'),
      b('personaDescription', { content: "[{{user}}'s persona]\n{{slot}}" }),
      b('charDescription'),
      b('charPersonality', { content: "[{{char}}'s personality: {{slot}}]" }),
      b('scenario', { content: '[Scenario: {{slot}}]' }),
      b('worldInfoAfter'),
      b('dialogueExamples'),
      b('summary', { content: '{{slot}}' }),
      b('chatHistory'),
      b('jailbreak', { content: '' }),
    ],
  };
}

export const defaultSettings = () => ({
  id: 'settings', theme: 'moonpress', customThemes: [], font: 'pretendard', fontCustom: '', fontSize: 16, lineHeight: 1.8, chatWidth: 780, bubbles: true, motion: true, avatarShape: 'round', exts: {},
  enterSend: true, autoScroll: true, showMeta: true, customCss: '', userNameFallback: '나',
  activeConn: '', activePreset: '', activePersona: '', activeLore: [],
  summary: { enabled: false, every: 20, keep: 6, trim: true, prompt: 'Summarize the roleplay so far in a compact, factual way (events, relationships, current situation, unresolved threads). Merge it with the existing summary and write the result in the same language as the roleplay. Output only the summary.' },
  tracker: { enabled: false, inject: true, mode: 'call', hud: true, fields: '시간: 작중 현재 날짜와 시각\n장소: 현재 위치\n날씨: 현재 날씨\n분위기: 장면의 분위기 한 줄\n{{char}}의 기분: 현재 감정 상태' },
  translate: { lang: '한국어', auto: false, autoInput: false, inputLang: 'English', context: 3, prompt: '', maxTokens: 8000 },
  memory: { enabled: false, auto: true, tokenBudget: 8000, topK: 10, minScore: 0.12, minCosine: 0.05, mmrLambda: 0.74, maxPerKind: 3, maxPerTurn: 2, chunkTurns: 8, arcMergeAt: 6, consolidateEvery: 30, maxMemories: 400, cast: true, refProfile: true, summaryContextCount: 3, fossil: 40, language: 'auto', trim: false, keepRecent: 20, responseTokens: 6000, prompt: '' },
  illust: { auto: false, mode: 'plan', every: 1, maxScenes: 1, backend: 'nai', naiKey: '', connId: '', a1111: 'http://127.0.0.1:7860', model: 'nai-diffusion-5-full', imgModel: '', width: 832, height: 1216, steps: 23, scale: 7, sampler: 'k_euler_ancestral', style: '', direction: '', world: '', playerMode: 'auto', contextMessages: 8, negative: 'lowres, bad anatomy, watermark', quality: true, planPrompt: '', analysisPrompt: '' },
  defaultMode: 'rp', rpBubbles: false,
  modes: { talkPrompt: '', talkTokens: 400, commands: true, stagger: true, presenceDelay: false, auto: false, autoMinutes: 10, scenes: true, sceneStart: true, later: true, laterMax: 3, away: true, awayHours: 3, notify: false, autoBackoff: 2, autoStreak: 3, autoDaily: 0, quietFrom: '', quietTo: '', autoHidden: false, readReact: true, autoConn: '', autoTokens: 0 },
  // 고급 포맷팅: context · instruct · sysprompt · reasoning 은 템플릿 파일과 같은 키를 쓴다 (js/advanced.js)
  format: { v: 2, trimSpaces: true, trimSentences: false, collapseNewlines: false, singleLine: false, fixMarkdown: false, alwaysForceName2: true, stopStrings: [], stopMacro: true, tokenPadding: 64, startReplyWith: '', showBias: true, mdEscape: '', storyMode: true, ccExampleSep: '', ccChatStart: '', modelMap: {},
    context: { name: 'Default', story_string: '{{#if anchorBefore}}{{anchorBefore}}\n{{/if}}{{#if system}}{{system}}\n{{/if}}{{#if wiBefore}}{{wiBefore}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}{{#if personality}}{{personality}}\n{{/if}}{{#if scenario}}{{scenario}}\n{{/if}}{{#if wiAfter}}{{wiAfter}}\n{{/if}}{{#if persona}}{{persona}}\n{{/if}}{{#if anchorAfter}}{{anchorAfter}}\n{{/if}}{{trim}}', example_separator: '***', chat_start: '***', use_stop_strings: false, names_as_stop_strings: true, story_string_position: 0, story_string_depth: 1, story_string_role: 0 },
    instruct: { enabled: false, name: 'Alpaca', bind_to_context: false, input_sequence: '### Instruction:', input_suffix: '\n\n', output_sequence: '### Response:', output_suffix: '\n\n', system_sequence: '### Input:', system_suffix: '\n\n', last_system_sequence: '', first_input_sequence: '', first_output_sequence: '', last_input_sequence: '', last_output_sequence: '', story_string_prefix: '', story_string_suffix: '\n\n', stop_sequence: '', wrap: true, macro: true, names_behavior: 'force', activation_regex: '', skip_examples: false, user_alignment_message: '', system_same_as_user: false, sequences_as_stop_strings: true },
    sysprompt: { enabled: true, name: 'Neutral - Chat', content: "Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.", post_history: '' },
    reasoning: { name: 'Think XML', autoParse: true, autoExpand: false, addToPrompts: false, maxAdditions: 1, prefix: '<think>', suffix: '</think>', separator: '\n' } },
  templates: { context: [], instruct: [], sysprompt: [], reasoning: [] },
  security: { blockRemoteImages: false, serverKeys: true },
  assets: { inject: true, max: 2, random: true, prompt: '' },
  helpers: { all: '', translate: '', memory: '', illust: '' },
  quick: [{ label: '계속', text: '/continue' }, { label: '주사위', text: '/roll 1d20' }, { label: '장면 전환', text: '/sys 시간이 조금 흐른다.' }],
  bridge: { st: '', me: '' }, lastChat: '', lastPage: 'home', globalVars: {}, onboarded: false,
  // 로어북 전체 설정
  lore: { includeNames: false, minActivations: 0, minDepthMax: 0, maxRecursion: 0, groupScoring: false },
  // 빠른 버튼 세트 (js/qr-data.js) · 자동 이어쓰기 · 자동 다시 생성 · 재생성 이유 · 연출 지시 · 연결 프로필 (js/f-flow.js)
  qr: { v: 1, sets: [], bar: true },
  auto: { cont: { on: false, target: 400, max: 2, talk: false }, swipe: { on: false, minLen: 0, words: [], threshold: 1, max: 2 } },
  regenWhy: { ask: false, format: '', withDraft: false },
  direct: { prompt: '', past: 'note', pastFormat: '' },
  profiles: [],
});

export const newChar = (o = {}) => ({
  id: uid(), name: '새 캐릭터', avatar: '', description: '', personality: '', scenario: '', firstMes: '', altGreetings: [], mesExample: '',
  systemPrompt: '', postHistory: '', creatorNotes: '', creator: '', version: '', tags: [], fav: false, talk: 0.5,
  depthPrompt: { prompt: '', depth: 4, role: 'system' }, ext: {}, more: {}, loreIds: [], bind: { connId: '', presetId: '', personaId: '' }, createdAt: now(), updatedAt: now(), ...o,
});
export const newPersona = (o = {}) => ({ id: uid(), name: '나', avatar: '', description: '', loreIds: [], createdAt: now(), ...o });
export const newLore = (o = {}) => ({ id: uid(), name: '새 로어북', description: '', scanDepth: 4, tokenBudget: 2048, recursive: false, caseSensitive: false, wholeWord: false, entries: [], createdAt: now(), ...o });
export const newEntry = (o = {}) => ({
  id: uid(), name: '', keys: [], keys2: [], logic: 0, content: '', constant: false, enabled: true, position: 'before', depth: 4, role: 'system',
  order: 100, probability: 100, caseSensitive: null, wholeWord: null, useRegex: false, noRecurse: false, outlet: '', group: '', sticky: null, cooldown: null, delay: null, scanDepth: null,
  // 월드 인포의 고급 옵션 (caseSensitive · wholeWord · useGroupScoring 의 null 은 "로어북 설정을 따름")
  ignoreBudget: false, excludeRecursion: false, delayUntilRecursion: 0, groupOverride: false, groupWeight: 100, useGroupScoring: null,
  matchPersona: false, matchCharDesc: false, matchCharPersonality: false, matchCharNote: false, matchScenario: false, matchCreatorNotes: false,
  charFilter: { names: [], tags: [], exclude: false }, triggers: [], automationId: '', ...o,
});
export const newRegex = (o = {}) => ({ id: uid(), name: '새 정규식', find: '', replace: '', trim: [], onUser: false, onAI: true, mode: 'display', enabled: true, minDepth: null, maxDepth: null, scope: 'global', ...o });
export const newConn = (o = {}) => ({ id: uid(), name: '새 연결', provider: 'openai', baseUrl: '', apiKey: '', model: '', proxy: false, postProcess: 'none', extraHeaders: '', extraBody: '', cache: false, ...o });
export const newChat = (o = {}) => ({
  id: uid(), name: '', charIds: [], personaId: '', note: { text: '', depth: 4, role: 'system' }, summary: '', summaryAt: 0, vars: {}, loreIds: [],
  tracker: {}, bg: '', mode: 'rp', diary: [], diaryAt: 0, groupOrder: 'natural', count: 0, preview: '', createdAt: now(), updatedAt: now(), ...o,
});
export const newMsg = (role, text, o = {}) => ({ id: uid(), role, charId: '', name: '', swipes: [{ text, ts: now() }], sw: 0, hidden: false, ts: now(), ...o });
export const msgText = m => m.swipes[m.sw]?.text ?? '';

// ── 서버 보관: 드림랜드 서버가 있으면 API 키를 서버 파일에만 두고, 여기에는 꼬리표만 남긴다 ──
const SEC_RE = /@@dl:[\w-]+:\w+@@/;
export const Secrets = {
  ok: false, items: {},
  ref: (id, field) => `@@dl:${id}:${field}@@`,
  is: v => typeof v === 'string' && SEC_RE.test(v),
  get on() { return this.ok && S.settings.security?.serverKeys !== false; },
  tail(id, field) { return this.items[id]?.[field]?.tail || ''; },
  has(id, field) { return !!this.items[id]?.[field]; },
  async post(path, body) { const r = await fetch('/api/secrets/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dreamland': '1' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || '키 보관 실패'); return j; },
  async init() { try { const r = await fetch('/api/secrets'); if (r.ok && (r.headers.get('content-type') || '').includes('json')) { this.items = await r.json(); this.ok = true; } } catch { this.ok = false; } return this.ok; },
  async put(id, field, value, hosts, note = '') { const j = await this.post('put', { id, field, value, hosts, note }); (this.items[id] ||= {})[field] = { tail: j.tail || '', hosts, note }; return this.ref(id, field); },
  async del(id, field) { if (!this.ok) return; await this.post('delete', { id, field }).catch(() => { }); if (field) delete this.items[id]?.[field]; else delete this.items[id]; },
  async reveal(id, field) { return (await this.post('reveal', { id, field })).value; },
  /** 연결의 키를 보낼 수 있는 주소 */
  hostsFor(conn, fallback = '') {
    const out = []; for (const u of [conn?.baseUrl, fallback]) { try { if (u) out.push(new URL(u).hostname); } catch { } }
    if (conn?.provider === 'vertexai' || /aiplatform\.googleapis\.com/.test(fallback)) out.push('googleapis.com');
    return [...new Set(out)];
  },
  /** 브라우저에 남아 있는 키를 서버로 옮긴다. 옮긴 수를 돌려준다 */
  async sweep(baseOf = () => '') {
    if (!this.on || Vault.locked) return 0; let n = 0;
    for (const c of S.conns) {
      let touched = false;
      if (c.apiKey && !this.is(c.apiKey)) { const hosts = this.hostsFor(c, baseOf(c)); if (hosts.length) { c.apiKey = await this.put(c.id, 'apiKey', c.apiKey, hosts, c.name); touched = true; } }
      if (c.serviceAccount && !this.is(c.serviceAccount)) { try { const j = JSON.parse(c.serviceAccount); c.saEmail = j.client_email || ''; c.saProject = j.project_id || ''; c.serviceAccount = await this.put(c.id, 'serviceAccount', JSON.stringify(j), ['googleapis.com'], c.saEmail); touched = true; } catch { } }
      if (touched) { n++; await S.save('conns', c, true); }
    }
    const il = S.settings.illust; if (il?.naiKey && !this.is(il.naiKey)) { il.naiKey = await this.put('illust', 'naiKey', il.naiKey, ['novelai.net'], 'NovelAI'); S.saveSettings(); n++; }
    return n;
  },
  /** 서버 보관을 끄고 키를 브라우저로 되돌린다 (서버를 실행한 PC 에서만) */
  async restore() {
    for (const c of S.conns) { let t = false; for (const f of ['apiKey', 'serviceAccount']) if (this.is(c[f])) { c[f] = await this.reveal(c.id, f); await this.del(c.id, f); t = true; } if (t) await S.save('conns', c, true); }
    const il = S.settings.illust; if (this.is(il?.naiKey)) { il.naiKey = await this.reveal('illust', 'naiKey'); await this.del('illust', 'naiKey'); S.saveSettings(); }
  },
};
// 꼬리표가 든 요청은 반드시 드림랜드 서버를 거친다 (서버가 실제 키를 끼워 넣는다)
if (typeof window !== 'undefined' && !window.__dlFetch) {
  const raw = window.__dlFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    try {
      if (typeof input === 'string' && !input.startsWith('/api/')) {
        const hs = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : { ...(init.headers || {}) }, body = typeof init.body === 'string' ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : undefined;
        if (SEC_RE.test(input) || SEC_RE.test(JSON.stringify(hs)) || (body && SEC_RE.test(body))) return raw('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dreamland': '1' }, body: JSON.stringify({ url: input, method: init.method || 'GET', headers: hs, body }), signal: init.signal });
      }
    } catch { }
    return raw(input, init);
  };
}

// ── 금고: 암호를 걸면 API 키·서비스 계정·NovelAI 키를 암호화해서 저장한다 ──
const b64e = u => { let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const Vault = {
  key: null,
  get on() { return !!S.settings.vault; },
  get locked() { return this.on && !this.key; },
  async derive(pass, salt) {
    if (!crypto?.subtle) throw new Error('이 접속 환경(보안 연결이 아님)에서는 키 잠금을 쓸 수 없어요. localhost 로 열어 주세요.');
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async enc(text, key = this.key) { const iv = crypto.getRandomValues(new Uint8Array(12)); return 'v1:' + b64e(iv) + ':' + b64e(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)))); },
  async dec(blob, key = this.key) { const [, iv, ct] = String(blob).split(':'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(iv) }, key, b64d(ct))); },
  async enable(pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await this.derive(pass, salt);
    this.key = key; S.settings.vault = { salt: b64e(salt), check: await this.enc('dreamland', key) };
    await this.resave();
  },
  async unlock(pass) {
    const v = S.settings.vault; const key = await this.derive(pass, b64d(v.salt));
    try { if (await this.dec(v.check, key) !== 'dreamland') return false; } catch { return false; }
    this.key = key;
    for (const c of S.conns) if (c.sec) { try { Object.assign(c, JSON.parse(await this.dec(c.sec))); } catch { } }
    if (S.settings.illustSec) { try { S.settings.illust.naiKey = await this.dec(S.settings.illustSec); } catch { } }
    emit('vault'); return true;
  },
  async disable() { if (this.locked) throw new Error('먼저 잠금을 풀어 주세요.'); delete S.settings.vault; delete S.settings.illustSec; this.key = null; await this.resave(); },
  async resave() { for (const c of S.conns) await S.save('conns', c, true); await DB.put('kv', await this.packSettings()); emit('vault'); },
  /** 저장용 사본: 비밀 값은 암호문으로만 남긴다 */
  async packConn(c) {
    if (!this.on) { const { sec, ...plain } = c; return plain; }
    if (!this.key) return { ...c, apiKey: '', serviceAccount: '' };   // 잠긴 채로는 기존 암호문을 그대로 둔다
    return { ...c, apiKey: '', serviceAccount: '', sec: await this.enc(JSON.stringify({ apiKey: c.apiKey || '', serviceAccount: c.serviceAccount || '' })) };
  },
  async packSettings() {
    const s = S.settings; if (!this.on) return s;
    if (!this.key) return { ...s, illust: { ...s.illust, naiKey: '' } };
    return { ...s, illust: { ...s.illust, naiKey: '' }, illustSec: s.illust?.naiKey ? await this.enc(s.illust.naiKey) : '' };
  },
};

// ── 스토어 (메모리 캐시 + IndexedDB) ──
export const S = {
  chars: [], chats: [], personas: [], lore: [], presets: [], conns: [], regex: [], settings: defaultSettings(),
  async load() {
    for (const c of ['chars', 'chats', 'personas', 'lore', 'presets', 'conns', 'regex']) this[c] = await DB.all(c);
    const s = await DB.get('kv', 'settings');
    const d = defaultSettings();
    this.settings = { ...d, ...(s || {}) };
    const plain = v => v && typeof v === 'object' && !Array.isArray(v);
    for (const k of Object.keys(d)) if (plain(d[k])) {
      const cur = this.settings[k] = { ...d[k], ...(plain(s?.[k]) ? s[k] : {}) };
      for (const j of Object.keys(d[k])) if (plain(d[k][j]) && Object.keys(d[k][j]).length) cur[j] = { ...d[k][j], ...(plain(cur[j]) ? cur[j] : {}) };   // 한 단계 더: 새로 생긴 하위 키를 기본값으로 채운다
    }
    if (s?.format && s.format.v !== 2) this.settings.format.v = s.format.v;   // 예전 형식은 js/advanced.js 의 AF() 가 옮긴다
    if (s && !s.look4) Object.assign(this.settings, { theme: d.theme, fontSize: d.fontSize, chatWidth: d.chatWidth }); // 새 디자인으로 한 번 맞춘다
    this.settings.look4 = true;
    if (!this.presets.length) { const p = defaultPreset(); this.presets.push(p); await DB.put('presets', p); }
    if (!this.personas.length) { const p = newPersona({ name: '나' }); this.personas.push(p); await DB.put('personas', p); }
    if (!this.get('presets', this.settings.activePreset)) this.settings.activePreset = this.presets[0].id;
    if (!this.get('personas', this.settings.activePersona)) this.settings.activePersona = this.personas[0].id;
    if (!this.get('conns', this.settings.activeConn)) this.settings.activeConn = this.conns[0]?.id || '';
  },
  get(coll, id) { return this[coll].find(x => x.id === id); },
  async save(coll, obj, silent) {
    if (coll !== 'chats') obj.updatedAt = now(); // 대화의 시각은 마지막 메시지 기준 (saveMsgs)
    const i = this[coll].findIndex(x => x.id === obj.id);
    if (i >= 0) this[coll][i] = obj; else this[coll].push(obj);
    if (coll === 'conns') { const packed = await Vault.packConn(obj); if (packed.sec) obj.sec = packed.sec; await DB.put(coll, packed); } else await DB.put(coll, obj);
    if (!silent) emit(coll, obj);
    if (coll === 'conns') emit('conns:saved', obj);
    return obj;
  },
  async remove(coll, id) {
    this[coll] = this[coll].filter(x => x.id !== id);
    await DB.del(coll, id);
    if (coll === 'conns') await Secrets.del(id);
    if (coll === 'chats') { await DB.del('msgs', id); await DB.del('mem', id); await DB.del('kv', 'vec:' + id).catch(() => { }); await DB.del('kv', 'memcp:' + id).catch(() => { }); emit('chat:deleted', id); }
    emit(coll, null);
  },
  saveSettings: debounce(async () => DB.put('kv', await Vault.packSettings()), 200),
  set(patch) { Object.assign(this.settings, patch); this.saveSettings(); emit('settings', patch); },
  async msgs(chatId) { return (await DB.get('msgs', chatId))?.list || []; },
  async saveMsgs(chat, list) {
    chat.count = list.length;
    const last = [...list].reverse().find(m => m.role !== 'system') || list[list.length - 1];
    const tail = list[list.length - 1];
    chat.updatedAt = tail ? Math.max(tail.ts || 0, tail.swipes?.[tail.sw]?.ts || 0) || now() : now();
    chat.preview = last ? msgText(last).replace(/\s+/g, ' ').slice(0, 90) : '';
    await DB.put('msgs', { id: chat.id, list });
    await this.save('chats', chat, true);
  },
  conn() { return this.get('conns', this.settings.activeConn); },
  // 번역·기억·삽화 같은 보조 작업에 쓸 연결 (지정하지 않으면 대화의 연결)
  helperConn(task, chat) { return this.get('conns', this.settings.helpers?.[task]) || this.get('conns', this.settings.helpers?.all) || this.connFor(chat); },
  preset() { return this.get('presets', this.settings.activePreset) || this.presets[0]; },
  // 캐릭터에 지정해 둔 연결·프리셋·페르소나가 있으면 그것이 먼저
  bindOf(chat) { return this.get('chars', chat?.charIds?.[0])?.bind || {}; },
  connFor(chat) { return this.get('conns', this.bindOf(chat).connId) || this.conn(); },
  presetFor(chat) { return this.get('presets', this.bindOf(chat).presetId) || this.preset(); },
  persona(chat) { return this.get('personas', chat?.personaId) || this.get('personas', this.bindOf(chat).personaId) || this.get('personas', this.settings.activePersona) || this.personas[0]; },
  async exportAll() {
    const out = { app: 'dreamland', version: 1, exportedAt: new Date().toISOString() };
    for (const c of STORES) out[c] = await DB.all(c);
    out.conns = out.conns.map(({ sec, ...c }) => ({ ...c, apiKey: '', serviceAccount: '' }));   // 비밀 값은 백업에 넣지 않는다 (암호문도)
    out.mem = out.mem.map(m => JSON.parse(JSON.stringify(m, (k, v) => ArrayBuffer.isView(v) ? undefined : v)));   // 벡터는 다시 계산할 수 있는 캐시
    out.kv = out.kv.filter(r => !String(r.id).startsWith('vec:'));   // 벡터는 다시 만들 수 있는 캐시라 백업에 넣지 않는다
    out.kv = out.kv.map(r => { if (r.id !== 'settings') return r; const { vault, illustSec, ...s } = r; return { ...s, illust: { ...(s.illust || {}), naiKey: '' } }; });
    return out;
  },
  async importAll(data, replace) {
    if (data?.app !== 'dreamland') throw new Error('드림랜드 백업 파일이 아닙니다');
    // 백업에는 키가 없다: 같은 연결이 이미 있으면 그 키를 지킨다. 확장 코드와 확장 켜짐 목록, 키 잠금 정보는 파일에서 들이지 않는다
    const oldConns = new Map((await DB.all('conns')).map(c => [c.id, c])), oldSet = await DB.get('kv', 'settings');
    for (const c of STORES) {
      if (!Array.isArray(data[c])) continue;
      let rows = data[c].filter(r => r && typeof r === 'object' && r.id != null);
      if (c === 'conns') rows = rows.map(r => { const o = oldConns.get(r.id); return o ? { ...r, apiKey: r.apiKey || o.apiKey || '', serviceAccount: r.serviceAccount || o.serviceAccount || '', ...(o.sec ? { sec: o.sec } : {}) } : r; });
      if (c === 'kv') rows = rows.filter(r => !/^(ext:|extdata:|vec:)/.test(String(r.id)) && (replace || r.id !== 'settings'))   // 합쳐 넣을 때는 지금 설정을 그대로 둔다
        .map(r => r.id === 'settings' ? { ...r, exts: oldSet?.exts || {}, ...(oldSet?.vault ? { vault: oldSet.vault } : {}), ...(oldSet?.illustSec ? { illustSec: oldSet.illustSec } : {}), illust: { ...(r.illust || {}), naiKey: r.illust?.naiKey || oldSet?.illust?.naiKey || '' } } : r);
      if (replace) { if (c === 'kv') { for (const r of await DB.all('kv')) if (!/^(ext:|extdata:)/.test(String(r.id))) await DB.del('kv', r.id); } else await DB.clear(c); }
      await DB.bulk(c, rows);
    }
    await this.load();
    if (Vault.key) { for (const c of this.conns) if (c.sec) { try { Object.assign(c, JSON.parse(await Vault.dec(c.sec))); } catch { } } if (this.settings.illustSec) { try { this.settings.illust.naiKey = await Vault.dec(this.settings.illustSec); } catch { } } }
    emit('data:imported');
  },
};
