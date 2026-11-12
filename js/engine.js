// ── Dreamland engine: 토큰 추정 · 매크로 · 정규식 · 로어북 · 프롬프트 조립 · API ──
import { S, msgText, arr, Secrets, on } from './core.js';
import { X } from './hooks.js';
import { condBlocks, evalCond, pvResolve } from './cond.js';
import { Clock } from './clock.js';
import { AF, resolve, TEXT_PROVIDER_KINDS, renderStory, fmtStory, fmtChat, fmtLast, parseExamples, fmtExamples, instructStops, trimToEndSentence, cleanCompletion } from './advanced.js';

// ── 토큰 추정 (정확한 토크나이저가 아니라 근사값) ──
export function tokens(text) {
  if (!text) return 0;
  let a = 0, w = 0;
  for (let i = 0; i < text.length; i++) text.charCodeAt(i) < 0x250 ? a++ : w++;
  return Math.ceil(a / 3.8 + w / 1.4);
}

// ── 주사위 ──
export function roll(expr) {
  const m = String(expr).replace(/\s+/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  const n = Math.min(100, +m[1] || 1), sides = +m[2], mod = +m[3] || 0;
  if (sides < 1) return null;
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
  return { rolls, mod, total: rolls.reduce((x, y) => x + y, 0) + mod, expr: `${n}d${sides}${mod ? (mod > 0 ? '+' : '') + mod : ''}` };
}

// ── 매크로 ──
export function macro(text, c = {}) {
  if (!text || (text.indexOf('{{') < 0 && text.indexOf('<') < 0)) return text || '';
  const vars = c.vars || {}, g = S.settings.globalVars;
  if (text.indexOf('{{') >= 0 && /\{\{\s*#(if|unless)/i.test(text)) text = condBlocks(text, cond => evalCond(macro(cond, c), condEnv(c)));   // {{#if 조건}}…{{else}}…{{/if}}
  const d = Clock.now(c.chat);   // 방마다 따로 가는 시계 (기본은 현실 시각)
  const simple = {
    user: c.user, char: c.char, charifnotgroup: c.char, group: c.group || c.char, persona: c.persona, description: c.description,
    personality: c.personality, scenario: c.scenario, mesexamples: c.mesExamples, model: c.model, input: c.input,
    lastmessage: c.lastMessage, lastusermessage: c.lastUserMessage, lastcharmessage: c.lastCharMessage,
    time: d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }), date: d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    weekday: d.toLocaleDateString('ko-KR', { weekday: 'long' }), isotime: d.toTimeString().slice(0, 5), isodate: d.toISOString().slice(0, 10),
    newline: '\n', noop: '', trim: '\u0000TRIM\u0000',
  };
  const one = (_, body) => {
    const raw = body.trim();
    if (raw.startsWith('//')) return '';
    const sep = raw.includes('::') ? '::' : ':';
    const [nameRaw, ...rest] = raw.split(sep);
    const name = nameRaw.trim().toLowerCase();
    const args = rest.map(x => x.trim());
    if (name in simple && !rest.length) return simple[name] ?? '';
    switch (name) {
      case 'random': case 'pick': { const o = args.length > 1 ? args : (args[0] || '').split(','); return o.length ? o[Math.floor(Math.random() * o.length)].trim() : ''; }
      case 'roll': { const r = roll(/d/i.test(args[0] || '') ? args[0] : 'd' + args[0]); return r ? String(r.total) : ''; }
      case 'getvar': return String(vars[args[0]] ?? '');
      case 'setvar': vars[args[0]] = args.slice(1).join(sep); return '';
      case 'addvar': { const a = Number(vars[args[0]]), b = Number(args[1]); vars[args[0]] = isNaN(a) || isNaN(b) ? String(vars[args[0]] ?? '') + (args[1] ?? '') : a + b; return ''; }
      case 'incvar': vars[args[0]] = (Number(vars[args[0]]) || 0) + 1; return String(vars[args[0]]);
      case 'decvar': vars[args[0]] = (Number(vars[args[0]]) || 0) - 1; return String(vars[args[0]]);
      case 'getglobalvar': return String(g[args[0]] ?? '');
      case 'setglobalvar': g[args[0]] = args.slice(1).join(sep); S.saveSettings(); return '';
      case 'outlet': return (c.outlets?.[args[0]] || []).join('\n');
      case 'original': return c.original ?? '';
      case 'var': case 'pvar': {   // 프리셋 변수 (명령 스크립트 안에서는 /let 으로 만든 값이 먼저)
        const k = args[0] ?? ''; if (c.scope && k in c.scope) return String(c.scope[k] ?? '');
        const p = c.pv?.[k]; return p ? (args[1] === 'label' ? p.label : args[1] === 'raw' ? String(p.raw) : p.text) : String(vars[k] ?? '');
      }
      case 'pipe': return String(c.pipe ?? '');
      default: { const ext = X.macros.get(name); if (!ext && !rest.length && c.pv?.[nameRaw.trim()]) return c.pv[nameRaw.trim()].text;   // {{이름}} 만 써도 프리셋 변수로 읽는다
        if (!ext) return null; try { return String(ext.fn(args, c) ?? ''); } catch (e) { console.warn('[확장 매크로]', name, e); return ''; } }
    }
  };
  let out = text;
  for (let pass = 0; pass < 4 && out.includes('{{'); pass++) {
    const next = out.replace(/\{\{([^{}]*)\}\}/g, (m, b) => { const r = one(m, b); return r === null ? '\u0001' + b + '\u0002' : r; });
    if (next === out) break; out = next;
  }
  out = out.replace(/\u0001/g, '{{').replace(/\u0002/g, '}}').replace(/<USER>/gi, c.user ?? '').replace(/<BOT>|<CHAR>/gi, c.char ?? '');
  if (out.includes('\u0000TRIM\u0000')) out = out.replace(/\s*\u0000TRIM\u0000\s*/g, '');
  return out;
}

/** 조건식이 읽을 값들 */
export const condEnv = c => ({ pv: c.pv, vars: c.vars, gvars: S.settings.globalVars, scope: c.scope, kw: c });
/** 조건식 하나를 지금 대화 기준으로 판정한다 */
export const testCond = (expr, c) => evalCond(macro(String(expr || ''), c), condEnv(c));

// ── 정규식 스크립트 ──
// 범위는 셋: 전역(S.regex 의 scope 'global') · 프리셋(preset.regex — 프리셋에 실려 다닌다) · 캐릭터(S.regex 의 scope = 캐릭터 id).
// 적용 순서는 과 같다: 전역 → 프리셋 → 캐릭터, 한 범위 안에서는 order 순(같으면 만든 순).
const reCache = new Map();
export function compileRegex(src) {
  if (reCache.has(src)) return reCache.get(src);
  let re = null;
  try {
    const m = String(src).match(/^\/([\s\S]+)\/([a-z]*)$/);
    re = m ? new RegExp(m[1], m[2]) : new RegExp(src, 'g');
  } catch { re = null; }
  if (reCache.size > 2000) reCache.clear();
  reCache.set(src, re);
  return re;
}
let regexChat = null;   // 지금 열려 있는 대화 — 화면 표시처럼 대화를 넘겨받지 못한 호출이 범위(캐릭터 · 프리셋)를 알 수 있게
on('chat:open', c => { regexChat = c || null; }); on('chat:deleted', id => { if (regexChat?.id === id) regexChat = null; });
const REGEX_ON = { user: 'onUser', ai: 'onAI', slash: 'onSlash', lore: 'onLore', reason: 'onReason' };
const reNum = v => (v == null || v === '' || isNaN(+v) ? null : +v);
const byOrder = list => list.map((r, i) => [r, i]).sort((a, b) => (+a[0].order || 0) - (+b[0].order || 0) || a[1] - b[1]).map(x => x[0]);
/** 캐릭터 · 프리셋에 실린 정규식을 써도 되는가. kind: 'chars' | 'presets'. 값이 없으면 허용(직접 만든 것), 'ask' 는 가져온 뒤 아직 묻지 않은 것 */
export const regexAllowed = (kind, id) => { const v = S.settings.regexAllow?.[kind]?.[id]; return v === undefined || v === true; };
/** 적용 순서대로 줄 세운 스크립트 [{ r, kind: 'global'|'preset'|'char', owner, skip }]. all 이면 지금 범위가 아닌 것도 이유(skip)를 달아 함께 돌려준다 */
export function regexScripts({ chat, charId, preset, all = false } = {}) {
  if (chat === undefined) chat = regexChat;
  const ids = chat?.charIds?.length ? chat.charIds : (charId ? [charId] : []), solo = ids.length === 1;
  const pre = preset === undefined ? (chat ? S.presetFor(chat) : S.preset()) : preset;
  const out = [];
  for (const r of byOrder(S.regex.filter(r => !r.scope || r.scope === 'global'))) out.push({ r, kind: 'global', owner: '', skip: '' });
  for (const p of all ? [pre, ...S.presets.filter(x => x !== pre)].filter(Boolean) : [pre].filter(Boolean)) {
    const skip = p !== pre ? 'scope:preset' : regexAllowed('presets', p.id) ? '' : 'blocked:preset';
    if (skip && !all) continue;
    for (const r of arr(p.regex)) if (r && typeof r === 'object') out.push({ r, kind: 'preset', owner: p.id, skip });
  }
  // 1:1 대화에서는 그 캐릭터의 스크립트가 방 전체에, 그룹에서는 그 캐릭터가 쓴 메시지에만 적용된다
  const mine = r => ids.includes(r.scope) && (solo || r.scope === charId);
  const scoped = byOrder(S.regex.filter(r => r.scope && r.scope !== 'global'));
  for (const r of [...scoped.filter(mine), ...(all ? scoped.filter(r => !mine(r)) : [])]) {
    const skip = !mine(r) ? 'scope:char' : regexAllowed('chars', r.scope) ? '' : 'blocked:char';
    if (skip && !all) continue;
    out.push({ r, kind: 'char', owner: r.scope, skip });
  }
  return out;
}
/** 이 스크립트를 건너뛰는 이유. 돌려도 되면 ''. off 꺼짐 · nofind 찾기 없음 · place 대상 아님 · mode 적용 방식 다름 · edit 고칠 때 안 돎 · min/max 깊이 밖 */
export function regexSkip(r, { who = 'ai', target = 'display', depth, edit = false } = {}) {
  if (!r.enabled) return 'off';
  if (!r.find) return 'nofind';
  if (!r[REGEX_ON[who] || 'onAI']) return 'place';
  // mode: store(저장되는 원문 변경) · display(화면만) · prompt(전송만) · both(화면+전송)
  if (target === 'store' ? r.mode !== 'store' : (r.mode !== target && r.mode !== 'both')) return 'mode';
  if (edit && r.runOnEdit !== true) return 'edit';
  if (target !== 'store' && typeof depth === 'number') {
    const lo = reNum(r.minDepth), hi = reNum(r.maxDepth);
    if (lo !== null && lo >= -1 && depth < lo) return 'min';
    if (hi !== null && hi >= 0 && depth > hi) return 'max';
  }
  return '';
}
const escMacro = x => String(x).replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/g, s => ({ '\n': '\\n', '\r': '\\r', '\t': '\\t', '\v': '\\v', '\f': '\\f', '\0': '\\0' }[s] || '\\' + s));
/** 찾기 문장에 매크로를 넣은 결과. subst: 0 그대로 · 1 값을 그대로 넣기 · 2 정규식 기호를 글자로 바꿔 넣기 (값이 없는 옛 스크립트는 매크로가 보이면 1) */
export function regexFind(r, ctx) {
  const find = String(r.find || ''), mode = Number(r.subst ?? (find.includes('{{') ? 1 : 0));
  if (!mode || !ctx || !find.includes('{{')) return find;
  return mode === 2 ? find.replace(/\{\{[^{}]*\}\}/g, t => { const v = macro(t, ctx); return v === t ? t : escMacro(v); }) : macro(find, ctx);
}
/** 스크립트 하나를 글에 돌린다. trace(빈 객체)를 주면 source · error · matches[{ index, match, groups, named, raw, cut, out }] 를 채운다 */
export function runRegexScript(r, text, ctx, trace) {
  const src = regexFind(r, ctx), re = compileRegex(src);
  if (trace) { trace.source = src; trace.matches = []; trace.error = re ? '' : 'compile'; }
  if (!re || !text) return text;
  re.lastIndex = 0;
  const rep = String(r.replace ?? '').replace(/\{\{match\}\}/gi, '$0');
  const trims = arr(r.trim).filter(t => typeof t === 'string' && t).map(t => (ctx ? macro(t, ctx) : t)).filter(Boolean);
  return text.replace(re, (...a) => {
    const named = typeof a[a.length - 1] === 'object' ? a.pop() : null;
    a.pop(); const index = a.pop(), caps = a.slice(1);
    const fill = cutting => rep.replace(/\$(\d+)|\$<([^>]+)>/g, (_, n, name) => {
      let v = name ? named?.[name] : (+n === 0 ? a[0] : caps[+n - 1]);
      if (!v) return '';
      if (cutting) for (const t of trims) v = v.split(t).join('');   // 다듬기 문자열은 가져온 부분($n · {{match}})에서만 지운다
      return v;
    });
    const cut = fill(true), out = ctx ? macro(cut, ctx) : cut;         // 매크로는 맨 마지막에
    if (trace && trace.matches.length < 2000) trace.matches.push({ index, match: a[0], groups: caps, named, raw: trims.length ? fill(false) : cut, cut, out });
    return out;
  });
}
let autoCtx = null;   // 매크로 문맥을 넘겨받지 못한 호출(화면 표시)을 위해 한 번 만들어 같은 틱 동안 돌려쓴다
function regexCtx(chat, charId) {
  if (!chat) return null;
  if (autoCtx && autoCtx.chat === chat && autoCtx.charId === charId) return autoCtx.ctx;
  const chars = arr(chat.charIds).map(id => S.get('chars', id)).filter(Boolean);
  const ctx = makeCtx({ chat, char: chars.find(c => c.id === charId) || chars[0], chars, persona: S.persona(chat), msgs: [] });
  if (!autoCtx) queueMicrotask(() => { autoCtx = null; });
  autoCtx = { chat, charId, ctx };
  return ctx;
}
/** 호출 인자를 한 벌의 조건으로. who: 'user'|'ai'|'slash'|'lore'|'reason', target: 'display'|'prompt'|'store', edit: 메시지를 고쳐 저장할 때 */
export function regexEnv({ who = 'ai', target = 'display', depth, charId, ctx, chat, preset, edit = false } = {}) {
  if (chat === undefined) chat = ctx?.chat || regexChat;
  if (target === 'prompt' && ctx?.type === 'continue' && typeof depth === 'number' && who !== 'lore') depth -= 1;   // 이어 쓰는 메시지는 깊이 -1
  let made;
  return { who, target, depth, charId, chat, preset, edit, get ctx() { return ctx || (made === undefined ? (made = regexCtx(chat, charId)) : made); } };
}
/** 파이프라인의 한 단계: 건너뛰면 { skip }, 돌리면 { before, after, source, matches } */
export function regexStep(it, text, env) {
  const base = { id: it.r.id, name: it.r.name, kind: it.kind, owner: it.owner, r: it.r }, skip = it.skip || regexSkip(it.r, env);
  if (skip) return { ...base, skip };
  const t = {}, after = runRegexScript(it.r, text, env.ctx, t);
  return { ...base, skip: t.error ? 'badregex' : '', before: text, after, source: t.source, matches: t.matches };
}
/** 글 하나가 어떤 스크립트를 어떤 순서로 거치는지 (디버거용). applyRegex 와 같은 판정 · 같은 실행을 쓴다 */
export function traceRegex(text, opts = {}) {
  const env = regexEnv(opts), steps = [];
  for (const it of regexScripts({ chat: env.chat, charId: env.charId, preset: env.preset, all: true })) { const s = regexStep(it, text, env); steps.push(s); if (!s.skip) text = s.after; }
  return { out: text, steps };
}
export function applyRegex(text, opts = {}) {
  if (!text || typeof text !== 'string') return text;
  const env = regexEnv(opts);
  for (const it of regexScripts(env)) { if (regexSkip(it.r, env)) continue; text = runRegexScript(it.r, text, env.ctx); if (!text) break; }
  return text;
}

// ── 로어북 ──
// 월드 인포의 발동 규칙을 따른다: 모든 책의 항목을 한 줄로 세워 훑고(초기 → 연쇄 → 최소 발동 수), 묶음·확률·예산 순으로 거른다.
const LORE_MAX_DEPTH = 1000, LORE_MAX_STEPS = 24;
const LORE_TRIGGER = { normal: ['normal'], continue: ['continue'], impersonate: ['impersonate'], regen: ['regenerate', 'swipe'], swipe: ['swipe', 'regenerate'], quiet: ['quiet'] };
let lastLore = [];
/** 마지막 실제 생성에서 발동한 항목들 (자동 실행 연결용) */
export const loreFired = () => lastLore;

function keyMatch(key, hay, hayLower, f) {
  key = String(key).trim();
  if (!key) return false;
  const rx = key.match(/^\/([\s\S]+)\/([a-z]*)$/);
  if (rx || f.rx) {
    try { return new RegExp(rx ? rx[1] : key, rx ? rx[2] : (f.cs ? '' : 'i')).test(hay); } catch { return false; }
  }
  const h = f.cs ? hay : hayLower, k = f.cs ? key : key.toLowerCase();
  if (f.ww && /^[\x00-\x7f]+$/.test(k)) {
    return new RegExp('(?:^|[^\\w])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[^\\w])').test(h);
  }
  return h.includes(k);
}
function entryHit(e, hay, hayLower, f) {
  if (!e.keys?.length || !e.keys.some(k => keyMatch(f.mx(k), hay, hayLower, f))) return false;
  const k2 = (e.keys2 || []).filter(Boolean);
  if (!k2.length) return true;
  const hits = k2.map(k => keyMatch(f.mx(k), hay, hayLower, f));
  switch (+e.logic || 0) {
    case 1: return !hits.every(Boolean);     // NOT ALL
    case 2: return !hits.some(Boolean);      // NOT ANY
    case 3: return hits.every(Boolean);      // AND ALL
    default: return hits.some(Boolean);      // AND ANY
  }
}
/** 묶음 점수: 걸린 키워드 수 (보조 키워드는 긍정 조건일 때만 더한다) */
function entryScore(e, hay, hayLower, f) {
  const k1 = (e.keys || []).filter(Boolean), k2 = (e.keys2 || []).filter(Boolean);
  if (!k1.length) return 0;
  const p = k1.filter(k => keyMatch(f.mx(k), hay, hayLower, f)).length, s = k2.filter(k => keyMatch(f.mx(k), hay, hayLower, f)).length;
  if (k2.length) { if ((+e.logic || 0) === 0) return p + s; if (+e.logic === 3) return s === k2.length ? p + s : p; }
  return p;
}
const groupsOf = e => String(e.group || '').split(/,\s*/).map(g => g.trim()).filter(Boolean);
const untilRec = e => e.delayUntilRecursion === true ? 1 : Math.max(0, +e.delayUntilRecursion || 0);

/**
 * books: 로어북들 · history: [{ content }] (오래된 것부터) · ctx: 매크로 문맥
 * opt: state(유지·쿨다운 기록) · count(대화 길이) · commit(실제 생성인지) · type(생성 종류) · char · persona · names(history 와 나란한 화자 이름)
 */
export function scanLore(books, history, ctx, { state = {}, count = history.length, commit = false, type = 'normal', char = null, persona = null, names = null } = {}) {
  const G = S.settings.lore || {};
  const texts = history.map((m, i) => (G.includeNames && names?.[i] ? names[i] + ': ' : '') + (m.content || ''));
  const mxk = k => { k = String(k); return k.includes('{{') ? macro(k, ctx) : k; };
  const trig = LORE_TRIGGER[type] || [type];
  const card = [['matchPersona', persona?.description], ['matchCharDesc', char?.description], ['matchCharPersonality', char?.personality], ['matchCharNote', char?.depthPrompt?.prompt], ['matchScenario', char?.scenario], ['matchCreatorNotes', char?.creatorNotes]];
  const charTags = (char?.tags || []).map(t => String(t).toLowerCase()), charName = String(char?.name || '').toLowerCase();

  const all = [];
  for (const book of books) for (const e of book.entries || []) if (e.enabled !== false && (e.content || '').trim()) all.push({ e, book });
  all.sort((a, b) => (!!b.e.constant - !!a.e.constant) || ((b.e.order ?? 100) - (a.e.order ?? 100)));
  if (!all.length) { if (commit) lastLore = []; return []; }

  const flagsOf = it => ({ cs: it.e.caseSensitive ?? it.book.caseSensitive ?? false, ww: it.e.wholeWord ?? it.book.wholeWord ?? false, rx: !!it.e.useRegex, mx: mxk });
  const isSticky = e => (state[e.id]?.sticky || 0) > count;
  const isCool = e => (state[e.id]?.cool || 0) > count;
  const baseDepth = Math.max(0, ...books.map(b => +(b.scanDepth ?? 4) || 0));
  const recurse = []; let skew = 0, st = 'initial', steps = 0, ver = 0;
  const cache = new Map();
  /** 이 항목이 살필 글: 최근 메시지 + (고른) 카드 필드 + 연쇄로 불려 나온 내용 */
  const hayOf = it => {
    const e = it.e, own = e.scanDepth != null && e.scanDepth !== '';
    const depth = Math.min(LORE_MAX_DEPTH, Math.max(0, own ? +e.scanDepth || 0 : (+(it.book.scanDepth ?? 4) || 0) + skew));
    const fields = card.filter(([k, v]) => e[k] && v).map(([k]) => k).join(','), rec = st !== 'min' && it.book.recursive && recurse.length > 0;
    const key = `${depth}|${fields}|${rec ? ver : '-'}`;
    let hit = cache.get(key);
    if (!hit) {
      const parts = depth ? texts.slice(-depth) : [];
      for (const [k, v] of card) if (e[k] && v) parts.push(mxk(v));
      if (rec) parts.push(...recurse);
      const h = parts.join('\n'); hit = { h, l: h.toLowerCase() }; cache.set(key, hit);
    }
    return hit;
  };

  const activated = new Map(), failed = new Set(), used = new Map();
  const levels = [...new Set(all.map(it => untilRec(it.e)).filter(Boolean))].sort((a, b) => a - b);
  let level = levels.shift() ?? 0;

  /** 같은 묶음에서는 하나만: 유지 중인 것 → 점수 → 우선 항목 → 가중치 추첨 */
  const filterGroups = now => {
    const groups = new Map();
    for (const it of now) for (const g of groupsOf(it.e)) { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); }
    const drop = it => { const i = now.indexOf(it); if (i >= 0) now.splice(i, 1); };
    for (const [key, members] of groups) {
      let grp = members.filter(it => now.includes(it));
      const stuck = grp.filter(it => isSticky(it.e));
      if (stuck.length) { for (const it of grp) if (!stuck.includes(it)) drop(it); continue; }
      if (grp.some(it => it.e.useGroupScoring ?? G.groupScoring)) {
        const scores = grp.map(it => { const h = hayOf(it); return entryScore(it.e, h.h, h.l, flagsOf(it)); }), max = Math.max(...scores);
        grp = grp.filter((it, i) => { if ((it.e.useGroupScoring ?? G.groupScoring) && scores[i] < max) { drop(it); return false; } return true; });
      }
      if ([...activated.values()].some(a => groupsOf(a.it.e).includes(key))) { grp.forEach(drop); continue; }
      if (grp.length <= 1) continue;
      const prio = grp.filter(it => it.e.groupOverride ?? true);   // 예전 드림랜드 항목(값 없음)은 우선순위가 가장 높은 하나
      if (prio.length) { for (const it of grp) if (it !== prio[0]) drop(it); continue; }
      const total = grp.reduce((n, it) => n + (+(it.e.groupWeight ?? 100) || 0), 0); let r = Math.random() * total, win = grp[grp.length - 1];
      for (const it of grp) { r -= (+(it.e.groupWeight ?? 100) || 0); if (r <= 0) { win = it; break; } }
      for (const it of grp) if (it !== win) drop(it);
    }
  };

  while (st && steps < LORE_MAX_STEPS) {
    if (+G.maxRecursion > 0 && +G.maxRecursion <= steps) break;
    steps++;
    const now = [];
    for (const it of all) {
      const e = it.e;
      if (failed.has(e.id) || activated.has(e.id)) continue;
      if (e.triggers?.length && !e.triggers.some(t => trig.includes(t))) continue;                    // 생성 종류
      const cf = e.charFilter;
      if (cf?.names?.length) { const inc = cf.names.some(n => String(n).toLowerCase() === charName); if (cf.exclude ? inc : !inc) continue; }
      if (cf?.tags?.length) { const inc = cf.tags.some(t => charTags.includes(String(t).toLowerCase())); if (cf.exclude ? inc : !inc) continue; }
      const sticky = isSticky(e);
      if (e.delay && count < +e.delay) continue;                                                       // 대화가 N개 쌓이기 전에는 잠듦
      if (isCool(e) && !sticky) continue;                                                              // 쿨다운 중
      const dur = untilRec(e);
      if (st !== 'recursion' && dur && !sticky) continue;                                              // 연쇄 단계에서만 깨어나는 항목
      if (st === 'recursion' && dur > level && !sticky) continue;
      if (st === 'recursion' && e.excludeRecursion && !sticky) continue;                               // 연쇄로는 깨어나지 않는 항목
      if (e.constant || sticky || (st === 'initial' && X.loreVec?.(e.id))) { now.push(it); continue; }   // 벡터 검색이 뜻으로 찾아 깨운 항목
      if (!e.keys?.length) continue;
      const hay = hayOf(it);
      if (hay.h && entryHit(e, hay.h, hay.l, flagsOf(it))) now.push(it);
    }
    if (now.length > 1) { const idx = new Map(now.map((it, i) => [it, i])); now.sort((a, b) => (isSticky(b.e) - isSticky(a.e)) || idx.get(a) - idx.get(b)); }
    filterGroups(now);
    const fresh = [];
    for (const it of now) {
      const e = it.e, bid = it.book.id;
      if ((e.probability ?? 100) < 100 && !isSticky(e) && Math.random() * 100 > +e.probability) { failed.add(e.id); continue; }
      const text = applyRegex(macro(e.content, ctx), { who: 'lore', target: 'prompt', depth: e.position === 'depth' ? +(e.depth ?? 4) : undefined, ctx }), t = tokens(text), u = used.get(bid) || 0;
      if (!e.ignoreBudget) { if (u + t > (it.book.tokenBudget || 2048) && u > 0) continue; used.set(bid, u + t); }
      activated.set(e.id, { it, text, tok: t }); fresh.push(it);
    }
    const rec = fresh.filter(it => !it.e.noRecurse && it.book.recursive);
    let next = rec.length ? 'recursion' : '';
    if (!next && st === 'min' && recurse.length) next = 'recursion';
    if (!next && +G.minActivations > 0 && activated.size < +G.minActivations) {
      const d = baseDepth + skew;
      if (!((+G.minDepthMax > 0 && d >= +G.minDepthMax) || d >= texts.length)) { next = 'min'; skew++; }   // 정한 깊이(또는 대화 끝)를 넘겨서는 살피지 않는다
    }
    if (!next && levels.length) { next = 'recursion'; level = levels.shift(); }
    st = next;
    if (st) { for (const it of rec) recurse.push(activated.get(it.e.id).text); ver++; }
  }

  if (commit) for (const { it: { e } } of activated.values()) if (!isSticky(e) && (e.sticky || e.cooldown)) state[e.id] = { sticky: e.sticky ? count + +e.sticky : 0, cool: e.cooldown ? count + (+e.sticky || 0) + +e.cooldown : 0 };
  const out = [...activated.values()].map(a => ({ ...a.it.e, text: a.text, book: a.it.book.name, bookId: a.it.book.id, tok: a.tok })).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  if (commit) lastLore = out;
  return out;
}

// ── 프롬프트 조립 ──
export const GROUP_NUDGE = '[Write the next reply only as {{char}}. Do not write for the other characters or for {{user}}.]';
export const CONTINUE_NUDGE = '[Continue your last message exactly from where it stopped. Do not repeat or restart it; write only the continuation.]';
export const IMPERSONATE_NUDGE = "[Write the next message from {{user}}'s point of view, in {{user}}'s voice, based on the story so far. Write only {{user}}'s message and do not write for {{char}}.]";

export function activeBooks(chat, chars, persona) {
  const ids = new Set([...(S.settings.activeLore || []), ...(chat.loreIds || []), ...chars.flatMap(c => c.loreIds || []), ...(persona?.loreIds || [])]);
  return [...ids].map(id => S.get('lore', id)).filter(Boolean);
}

export function makeCtx({ chat, char, chars, persona, msgs, input }) {
  const vis = msgs.filter(m => !m.hidden);
  const last = r => { const m = [...vis].reverse().find(r); return m ? msgText(m) : ''; };
  return {
    user: persona?.name || S.settings.userNameFallback, char: char?.name || '', group: chars.map(c => c.name).join(', '),
    persona: persona?.description || '', description: char?.description || '', personality: char?.personality || '', scenario: char?.scenario || '',
    mesExamples: char?.mesExample || '', model: S.connFor(chat)?.model || '', input: input || '', vars: chat.vars ||= {},
    lastMessage: last(() => true), lastUserMessage: last(m => m.role === 'user'), lastCharMessage: last(m => m.role === 'assistant'),
    pv: pvResolve(S.presetFor(chat), chat), mode: chat.mode === 'talk' ? 'talk' : 'rp', chat,
  };
}

// ── 연출 지시: 사용자가 대사가 아니라 작가로서 적은 지시 (msg.direct) ──
export const DIRECT_DEFAULT = `[Direction from the author. This is not something {{user}} says or does inside the story. Carry it out in your next reply through narration and through {{char}}'s own actions and words, keeping continuity with the scene. Do not quote, mention or answer the direction itself.]
{{direction}}`;
export const DIRECT_PAST = '[Author direction: {{direction}}]';
/** 연출 지시 메시지를 프롬프트용 글로. 마지막 것은 지시문 전체, 지난 것은 짧은 꼬리표(또는 빼기 → null) */
function directText(text, isLast, mx) {
  const D = S.settings.direct || {};
  if (isLast) return mx(D.prompt || DIRECT_DEFAULT).replace(/\{\{direction\}\}/gi, () => text);
  if (D.past === 'drop') return null;
  return mx(D.pastFormat || DIRECT_PAST).replace(/\{\{direction\}\}/gi, () => text);
}

// ════════ 대화 모드 (메신저) ════════
// 프리셋의 프롬프트 블록을 쓰지 않고, 전용 지시문 + 캐릭터 카드 + 시각이 찍힌 기록 + 지금 상황으로 조립한다.
export const TALK_DEFAULT = `You are {{char}}, texting {{user}} in a private messenger. You are a person with your own day, moods and things to do — not a narrator and not an assistant. Unless the chat shows otherwise, you two are in different places.
- Write only {{char}}'s side. Never write {{user}}'s messages, actions or feelings, and never treat a question you asked as already answered.
- Type the way {{char}} really would, in the language the chat is in: their words, their punctuation habits, emoji or none. Fragments and dropped punctuation are fine when they suit {{char}}.
- One line is one message bubble. Send 1 to 4 and let the moment decide: a bare "ok" when that is all there is, a quick burst when {{char}} is excited or upset. Do not fall into the same count and rhythm every turn.
- Each line is exactly one of these, never mixed on a line:
  plain line — a text message you send. This is almost everything you write.
  "in double quotes" — words said out loud, only while you two are together or on a call.
  'in single quotes' — a private thought {{user}} cannot see. Rare.
  *in asterisks* — one short line of action or setting, only when it matters.
- No narration and no descriptive paragraphs. Feeling shows in word choice, pace and what is left unsaid, not in explaining it.
- Answer what {{user}} just said, then add something of your own: a reaction, an opinion, a piece of your day, a question you actually want answered. Do not hand their words back to them, and do not open or close the way your recent messages did.
- {{char}}'s tone toward {{user}} follows the relationship as the chat shows it. It warms or cools only when something in this conversation gives a reason. Being brief, distracted, teasing or slow to open up is fine if that is who {{char}} is.
- Do not end the chat for {{user}} — no sending them off to bed or to eat, no goodbyes — unless {{char}} has a real reason to go. Do not suddenly turn up where {{user}} is either; you meet only when the two of you have arranged it.
- The [HH:MM] marks on messages are only for your sense of time. Never write timestamps or your own name at the start of a message.`;
export const TALK_COMMANDS = `<commands>
Optional. Add one on its own line only when it really applies; most replies need none. They are removed before {{user}} sees your message, so never mention or explain them.
[react: emoji="😂"] — put one emoji on {{user}}'s last message, with or without a written reply.
[status: state="online|idle|dnd|offline", activity="what you are doing"] — your availability just changed (falling asleep, class starting, back home).
[selfie: context="what the photo shows"] — send a photo of yourself, only when asked or when {{char}} clearly would.
[memory: summary="one full sentence, with names instead of I or you"] — a lasting fact about {{user}} or a promise between you that is worth keeping. Not for small talk.{{clock_command}}
</commands>`;
const hhmm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function buildTalkPrompt({ chat, char, chars, persona, preset, msgs, type = 'normal', commit = false, proactive = false }) {
  const P = preset.params || {}, M = S.settings.modes || {};
  const ctx = makeCtx({ chat, char, chars, persona, msgs }); ctx.type = type;
  const mx = t => macro(t || '', ctx);
  const isGroup = chars.length > 1, clockMode = Clock.mode(chat), today = Clock.now(chat).toDateString();
  let source = msgs.filter(m => !m.hidden);
  if (type === 'regen' || type === 'swipe') source = source.slice(0, -1);
  if ((S.settings.direct || {}).past === 'drop') source = source.filter((m, i) => !m.direct || i === source.length - 1);
  const history = source.map((m, i) => {
    const depth = source.length - 1 - i, t = Clock.timeOf(chat, m);
    if (m.direct && m.role === 'user') return { role: 'user', content: directText(msgText(m), depth === 0, mx), src: 'history' };
    const stamp = clockMode === 'none' ? '' : new Date(t).toDateString() === today ? `[${hhmm(t)}] ` : `[${new Date(t).getMonth() + 1}/${new Date(t).getDate()} ${hhmm(t)}] `;
    let text = applyRegex(msgText(m), { who: m.role === 'user' ? 'user' : 'ai', target: 'prompt', depth, charId: m.charId, ctx });
    if (m.role === 'system') return { role: 'system', content: `[${text}]`, src: 'history' };
    if (m.role === 'assistant' && isGroup) text = text.split('\n').filter(l => l.trim()).map(l => `${m.name || char.name}: ${l}`).join('\n');
    return { role: m.role, content: `${stamp}${text}`, src: 'history', images: m.images?.length ? m.images : undefined };
  });
  const lore = scanLore(activeBooks(chat, chars, persona), history, ctx, { state: chat.loreState ||= {}, count: msgs.length, commit, type, char, persona, names: source.map(m => m.role === 'system' ? '' : m.role === 'user' ? ctx.user : (m.name || char.name)) });
  const card = c => [`<character name="${c.name}">`, macro(c.description, { ...ctx, char: c.name }), c.personality && `Personality: ${macro(c.personality, { ...ctx, char: c.name })}`, c.scenario && `Situation: ${macro(c.scenario, { ...ctx, char: c.name })}`, c.mesExample && `How they talk:\n${macro(c.mesExample, { ...ctx, char: c.name }).replace(/<START>/gi, '').trim()}`, '</character>'].filter(Boolean).join('\n');
  const before = [{ role: 'system', src: '대화 모드 지시문', content: `<instructions>\n${mx(M.talkPrompt || TALK_DEFAULT)}${isGroup ? `\nThis is a group chat. You write only ${char.name}'s messages; ${chars.filter(c => c.id !== char.id).map(c => c.name).join(', ')} write their own, so never speak for them.` : ''}\n</instructions>` },
    { role: 'system', src: '캐릭터 카드', content: [card(char), ...chars.filter(c => c.id !== char.id).map(card)].join('\n\n') }];
  if (persona?.description) before.push({ role: 'system', src: '페르소나', content: `<user name="${ctx.user}">\n${mx(persona.description)}\n</user>` });
  if (lore.length) before.push({ role: 'system', src: '로어북', content: `<lore>\n${lore.map(e => e.text).join('\n')}\n</lore>` });
  if (chat.summary) before.push({ role: 'system', src: '옛 요약', content: `Things you must remember from past conversations:\n${chat.summary}` });
  const late = [];
  for (const p of X.prompt) {
    if (p.owner === 'mode' || p.owner === 'illust') continue;
    let parts = []; try { parts = p.fn({ chat, char, chars, persona, history, msgs, type, commit, ctx }) || []; } catch (e) { console.warn('[프롬프트 조각]', p.owner, e); }
    for (const part of parts) if (part?.content) (part.where === 'before' ? before : late).push({ role: 'system', content: part.content, src: part.src || p.owner });
  }
  if (chat.note?.text) late.push({ role: 'system', content: mx(chat.note.text), src: '작가 노트' });
  // 지금 상황: 상태 · 시각 · 먼저 말 거는 경우의 안내
  const pr = chat.presence || {};
  const quiet = source.length ? Math.round((Date.now() - (source[source.length - 1].ts || Date.now())) / 60000) : 0;
  const situation = [
    `Your current status: ${pr.status || 'online'}${pr.activity ? ` (${pr.activity})` : ''}.`,
    proactive && `There is no new message from ${ctx.user}: they have been quiet for about ${quiet} minutes, and you are the one texting first. Start from your own side — your mood, what you are doing, or something the two of you left open. Do not answer for them, and do not repeat or rephrase your previous message.`,
    Clock.line(chat),
    type === 'continue' && 'Continue your last message from exactly where it stopped. Do not restart it or repeat what is already written.',
    type === 'impersonate' && `Write ${ctx.user}'s next text message, in the voice and length their earlier messages show. Output only that message, as plain lines.`,
  ].filter(Boolean).join('\n');
  const tail = { role: 'user', src: '지금 상황 · 명령 안내', content: `<context>\n${situation}\n</context>${M.commands === false || type === 'impersonate' ? '' : '\n\n' + mx(TALK_COMMANDS.replace('{{clock_command}}', Clock.command(chat) ? '\n' + Clock.command(chat) : ''))}` };
  const fixed = [...before, ...late, tail].reduce((n, m) => n + tokens(m.content) + 4, 0);
  const budget = Math.max(500, (P.contextSize || 128000) - (M.talkTokens || 400) - fixed - (S.settings.format?.tokenPadding || 0));
  let used = 0, start = history.length;
  for (let i = history.length - 1; i >= 0; i--) { const t = tokens(history[i].content) + 4; if (used + t > budget && start < history.length) break; used += t; start = i; }
  const out = [...before, ...history.slice(start), ...late, tail];
  return { messages: out, total: out.reduce((n, m) => n + tokens(m.content) + 4, 0), lore, dropped: start, ctx, talk: true };
}

/** 대화 모드 답변 정리: 새어 나온 시각·이름을 지우고 명령을 떼어 낸다 */
export function parseTalk(text, names = []) {
  const cmds = [];
  let out = text.replace(/^[ \t]*\[(react|status|schedule_update|selfie|memory|time)\s*:?\s*([^\]\n]*)\][ \t]*$/gim, (m, name, args) => {
    const o = {}; args.replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, k, v) => { o[k] = v; });
    cmds.push({ name: name.toLowerCase() === 'schedule_update' ? 'status' : name.toLowerCase(), args: o }); return '';
  }).replace(/\[(react|status|schedule_update|selfie|memory|time)\s*:?[^\]\n]*\]/gi, '');
  out = out.split('\n').map(l => l.replace(/^\s*\[\d{1,2}(?:\/\d{1,2})?\s*\d{0,2}:?\d{0,2}\]\s*/, '')).filter(l => l.trim()).join('\n');
  return { text: out.trim(), cmds };
}

/** 마지막으로 조립한 생성 요청의 정보 (답변을 다듬을 때 쓴다) */
let gen = {};
/** 출력 다듬기 */
export function postFormat(text) {
  const f = AF(), g = gen;
  if (g.tc) text = cleanCompletion(text, { I: g.tc.instruct, stops: g.tc.stops || [], user: g.user, char: g.char, isImpersonate: g.type === 'impersonate' });
  else if (g.char && g.type !== 'impersonate') text = text.replace(new RegExp('^\\s*' + g.char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[^\\S\\n]*'), '');   // 모델이 따라 붙인 이름 꼬리표
  if (f.collapseNewlines) text = text.replace(/\n+/g, '\n');
  if (f.singleLine) text = text.split('\n').find(l => l.trim()) || text;
  if (f.fixMarkdown) text = text.split('\n').map(l => { for (const mk of ['**', '*', '"']) { const body = mk === '*' ? l.replace(/\*\*/g, '') : l; const n = body.split(mk).length - 1; if (n % 2 && !/^\s*[*-]\s/.test(l)) l = l.replace(/\s*$/, '') + mk; } return l; }).join('\n');
  if (f.trimSentences) text = trimToEndSentence(text);
  if (f.trimSpaces !== false) text = text.trim();
  return text;
}

export function buildPrompt({ chat, char, chars, persona, preset, msgs, type = 'normal', commit = false, proactive = false }) {
  if (chat.mode === 'talk') { if (commit) gen = { type }; return buildTalkPrompt({ chat, char, chars, persona, preset, msgs, type, commit, proactive }); }
  const P = preset.params || {}, F = AF();
  const ctx = makeCtx({ chat, char, chars, persona, msgs }); ctx.type = type;
  const isGroup = chars.length > 1;
  const mx = t => macro(t || '', ctx);
  // 텍스트 완성형 연결은 스토리 스트링 + 인스트럭트 템플릿으로 조립한다 (채팅 완성형은 프리셋 블록 그대로)
  const conn = S.connFor(chat), R = conn && TEXT_PROVIDER_KINDS.includes(defOf(conn).kind) && F.storyMode !== false ? resolve(conn) : null;

  // 1) 기록
  let source = msgs.filter(m => !m.hidden);
  if (type === 'regen' || type === 'swipe') source = source.slice(0, -1);
  const mk = S.settings.memory;   // 장기기억이 맡은 옛 대화는 보내지 않는다 (선택)
  if (mk?.enabled && mk.trim && (X.covered?.(chat) || 0) > 0 && source.length > (mk.keepRecent || 20)) source = source.slice(-(mk.keepRecent || 20));
  // 지난 생각 과정을 다시 넣기: 마지막 메시지부터 세어 최대 개수까지만
  const rz = F.reasoning || {}, withThink = new Set();
  if ((S.settings.direct || {}).past === 'drop') source = source.filter((m, i) => !m.direct || i === source.length - 1);
  if (rz.addToPrompts) for (let i = source.length - 1; i >= 0 && withThink.size < (rz.maxAdditions ?? 1); i--) if (source[i].role === 'assistant' && source[i].swipes[source[i].sw]?.reasoning) withThink.add(source[i]);
  const history = source.map((m, i) => {
    const depth = source.length - 1 - i;
    let text = applyRegex(msgText(m), { who: m.role === 'user' ? 'user' : 'ai', target: 'prompt', depth, charId: m.charId, ctx });
    if (m.direct && m.role === 'user') { const dt = directText(text, depth === 0, mx); return R ? { role: 'system', content: dt, name: '', src: 'history' } : { role: 'user', content: dt, src: 'history', images: m.images?.length ? m.images : undefined }; }
    if (withThink.has(m)) text = `${mx(rz.prefix)}${applyRegex(m.swipes[m.sw].reasoning, { who: 'reason', target: 'prompt', depth, charId: m.charId, ctx })}${mx(rz.suffix)}${mx(rz.separator)}${text}`;
    if (R) return { role: m.role, content: text, name: m.role === 'system' ? '' : m.role === 'user' ? ctx.user : (m.name || char.name), src: 'history' };
    if (m.role === 'assistant' && isGroup && P.namesInGroup !== false) text = `${m.name || char.name}: ${text}`;
    if (m.role === 'system') text = `[${text}]`;
    return { role: m.role === 'system' ? 'system' : m.role, content: text, src: 'history', images: m.images?.length ? m.images : undefined };
  });

  // 2) 로어북
  const lore = scanLore(activeBooks(chat, chars, persona), history, ctx, { state: chat.loreState ||= {}, count: msgs.length, commit, type, char, persona, names: source.map(m => m.role === 'system' ? '' : m.role === 'user' ? ctx.user : (m.name || char.name)) });
  const at = pos => lore.filter(e => e.position === pos).map(e => e.text).join('\n');
  ctx.outlets = {};
  for (const e of lore) if (e.position === 'outlet') (ctx.outlets[e.outlet || e.name] ||= []).push(e.text);

  // 3) 깊이 삽입: 로어북 · 작가 노트 · 캐릭터 노트 · 트래커 · 확장이 덧붙이는 조각
  const inject = [], extBefore = [], tail = [];
  for (const e of lore) if (e.position === 'depth') inject.push({ role: e.role || 'system', content: e.text, depth: e.depth ?? 4, order: e.order, src: '로어북: ' + (e.name || e.book) });
  const noteParts = [at('an_top'), mx(chat.note?.text), at('an_bottom')].filter(Boolean);
  if (noteParts.length) inject.push({ role: chat.note?.role || 'system', content: noteParts.join('\n'), depth: chat.note?.depth ?? 4, order: 200, src: '작가 노트' });
  if (char.depthPrompt?.prompt) inject.push({ role: char.depthPrompt.role || 'system', content: mx(char.depthPrompt.prompt), depth: char.depthPrompt.depth ?? 4, order: 150, src: '캐릭터 노트' });
  const tr = chat.tracker || {};
  if (S.settings.tracker.enabled && S.settings.tracker.inject && Object.keys(tr).length) {
    inject.push({ role: 'system', content: '[Current state]\n' + Object.entries(tr).map(([k, v]) => `${k}: ${v}`).join('\n'), depth: 1, order: 50, src: '트래커' });
  }
  for (const p of X.prompt) {
    let parts = []; try { parts = p.fn({ chat, char, chars, persona, history, msgs, type, commit, ctx }) || []; } catch (e) { console.warn('[프롬프트 조각]', p.owner, e); }
    for (const part of parts) { if (!part?.content) continue; const item = { role: part.role || 'system', content: part.content, src: part.src || p.owner }; if (part.where === 'before') extBefore.push({ ...item, own: p.owner }); else if (part.where === 'end') tail.push(item); else inject.push({ ...item, depth: part.depth ?? 1, order: part.order ?? 100 }); }
  }

  const over = P.cardOverrides !== false;
  const slot = (b, v) => !v ? '' : (b.content && b.content.includes('{{slot}}') ? mx(b.content).replace(/\{\{slot\}\}/g, () => v) : v);
  const charDesc = () => {
    let d = mx(char.description);
    if (isGroup) { const others = chars.filter(c => c.id !== char.id && c.description).map(c => `[${c.name}]\n${macro(c.description, { ...ctx, char: c.name })}`).join('\n\n'); if (others) d += `\n\n[Other characters in the scene]\n${others}`; }
    return d;
  };
  const bias = type === 'impersonate' ? '' : mx(P.prefill || F.startReplyWith);   // 응답 시작 문구: 프리셋의 프리필이 먼저, 없으면 고급 포맷팅의 것
  const done = out => { if (commit) gen = { tc: out.messages.tc || null, user: ctx.user, char: ctx.char, type, bias }; return out; };

  // 4-A) 텍스트 완성형: 스토리 스트링
  if (R) {
    const I = R.instruct, C = R.context, sys = F.sysprompt || {}, n = { user: ctx.user, char: ctx.char, group: isGroup, groupNames: chars.map(c => c.name), mx };
    const system = sys.enabled === false ? '' : (over && char.systemPrompt?.trim() ? macro(char.systemPrompt, { ...ctx, original: mx(sys.content) }) : mx(sys.content));
    const jb = sys.enabled === false ? '' : (over && char.postHistory?.trim() ? macro(char.postHistory, { ...ctx, original: mx(sys.post_history) }) : mx(sys.post_history));
    const emWrap = list => [at('em_top') && at('em_top') + '\n', ...list, at('em_bottom') && at('em_bottom') + '\n'].filter(Boolean);   // 로어북: 대화 예시 앞 · 뒤
    const rawEx = emWrap(parseExamples(mx(char.mesExample), false, C, mx)), ex = I ? emWrap(fmtExamples(I, C, parseExamples(mx(char.mesExample), true, C, mx), n)) : rawEx;
    const sumB = (preset.blocks || []).find(b => b.kind === 'summary' && b.enabled);
    const anchorAfter = [...extBefore.map(p => p.content), chat.summary && sumB ? slot(sumB, chat.summary) : ''].filter(Boolean).join('\n').trim();
    const story = renderStory(C, I, { description: charDesc(), personality: mx(char.personality), persona: mx(persona?.description), scenario: mx(char.scenario), system, char: ctx.char, user: ctx.user,
      wiBefore: at('before'), wiAfter: at('after'), loreBefore: at('before'), loreAfter: at('after'), anchorBefore: '', anchorAfter, mesExamples: ex.join(''), mesExamplesRaw: rawEx.join('') }, mx);
    for (const b of preset.blocks || []) if (b.enabled && b.kind === 'text' && b.depth != null && b.depth !== '' && (!b.when || testCond(b.when, ctx)) && mx(b.content).trim()) inject.push({ role: b.role || 'system', content: mx(b.content), depth: +b.depth, order: 100, src: b.name || '프롬프트' });
    for (const t of tail) inject.push({ ...t, depth: 0, order: 300 });
    const inChat = +C.story_string_position === 1;
    if (inChat && story) inject.push({ role: ROLE3[C.story_string_role] || 'system', content: story, depth: C.story_string_depth ?? 1, order: 0, src: '스토리 스트링' });
    const head = [];
    if (!inChat && story) head.push({ role: 'system', content: story, src: '스토리 스트링', part: 'story' });
    if (ex.length && !/\{\{\s*mesExamples(Raw)?\s*\}\}/.test(C.story_string || '')) head.push({ role: 'system', content: ex.join(''), src: '대화 예시', part: 'raw' });
    if (C.chat_start) head.push({ role: 'system', content: mx(C.chat_start) + '\n', src: '대화 시작 표시', part: 'raw' });
    const cost = m => tokens(m.content) + 4;
    const fixed = [...head, ...inject].reduce((s, m) => s + cost(m), 0) + tokens(jb) + tokens(bias);
    const budget = Math.max(500, (P.contextSize || 128000) - (P.maxTokens || 4096) - fixed - (F.tokenPadding || 0));
    let used = 0, start = history.length;
    for (let i = history.length - 1; i >= 0; i--) { const t = cost(history[i]); if (used + t > budget && start < history.length) break; used += t; start = i; }
    const hist = history.slice(start), cont = type === 'continue' && hist[hist.length - 1]?.role === 'assistant';
    for (const j of inject.sort((a, b) => b.depth - a.depth || a.order - b.order)) {
      const d = cont && j.depth === 0 ? 1 : j.depth;
      hist.splice(Math.max(0, hist.length - d), 0, { role: j.role, content: j.content, name: j.role === 'user' ? ctx.user : j.role === 'assistant' ? ctx.char : '', src: j.src });
    }
    if (jb) hist.splice(cont ? hist.length - 1 : hist.length, 0, { role: 'user', content: jb, name: ctx.user, src: '후속 지시' });   // 마지막 사용자 메시지로
    if (start === 0 && hist[0]) hist[0].first = true;
    const messages = [...head, ...hist];
    if (bias && !cont) messages.push({ role: 'assistant', content: bias, src: '응답 시작 문구', prefill: true });
    messages.tc = { type, instruct: I, context: C, group: isGroup, why: R.why };
    return done({ messages, total: messages.reduce((s, m) => s + cost(m), 0), lore, dropped: start, ctx, story: true });
  }

  // 4-B) 채팅 완성형: 프리셋 블록
  const value = b => {
    switch (b.kind) {
      case 'text': return mx(b.content);
      case 'main': { const base = mx(b.content); return over && char.systemPrompt ? macro(char.systemPrompt, { ...ctx, original: base }) : base; }
      case 'jailbreak': { const base = mx(b.content); return over && char.postHistory ? macro(char.postHistory, { ...ctx, original: base }) : base; }
      case 'worldInfoBefore': return slot(b, at('before'));
      case 'worldInfoAfter': return slot(b, at('after'));
      case 'personaDescription': return slot(b, mx(persona?.description));
      case 'charDescription': return slot(b, charDesc());
      case 'charPersonality': return slot(b, mx(char.personality));
      case 'scenario': return slot(b, mx(char.scenario));
      case 'dialogueExamples': return slot(b, [at('em_top'), mx(char.mesExample).replace(/<START>/gi, F.ccExampleSep || '[Example dialogue]').trim(), at('em_bottom')].filter(Boolean).join('\n'));
      case 'summary': { memSlot = true; return slot(b, [...extBefore.filter(p => p.own === 'memoria').map(p => p.content), chat.summary].filter(Boolean).join('\n\n')); }   // 장기기억 자리 (옛 요약이 남아 있으면 함께)
      default: return '';
    }
  };
  const before = [], after = [];
  let seenHistory = false, memSlot = false;
  for (const b of preset.blocks || []) {
    if (!b.enabled) continue;
    if (b.kind === 'chatHistory') { seenHistory = true; continue; }
    if (b.when && !testCond(b.when, ctx)) continue;   // 조건부 블록
    let text = value(b);
    if (!text || !text.trim()) continue;
    if (b.wrapTag) text = `<${b.wrapTag}>\n${text}\n</${b.wrapTag}>`;
    const item = { role: b.role || 'system', content: text, src: b.name || b.kind };
    if (b.depth != null && b.depth !== '') inject.push({ ...item, depth: +b.depth, order: 100 });
    else (seenHistory ? after : before).push(item);
  }
  before.push(...extBefore.filter(p => !(memSlot && p.own === 'memoria')).map(({ own, ...p }) => p));

  // 5) 컨텍스트 예산에 맞춰 오래된 기록부터 제외
  const fixed = [...before, ...after, ...inject].reduce((n, m) => n + tokens(m.content) + 4, 0);
  const budget = Math.max(500, (P.contextSize || 128000) - (P.maxTokens || 4096) - fixed - (F.tokenPadding || 0));
  let used = 0, start = history.length;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = tokens(history[i].content) + 4;
    if (used + t > budget && start < history.length) break;
    used += t; start = i;
  }
  const hist = history.slice(start);
  if (F.ccChatStart && hist.length) hist.unshift({ role: 'system', content: mx(F.ccChatStart), src: '대화 시작 표시' });
  for (const j of inject.sort((a, b) => b.depth - a.depth || a.order - b.order)) {
    const idx = Math.max(0, hist.length - j.depth);
    hist.splice(idx, 0, { role: j.role, content: j.content, src: j.src });
  }

  let out = [...before, ...hist, ...after, ...tail];
  if (isGroup) out.push({ role: 'system', content: mx(P.groupNudge || GROUP_NUDGE), src: '그룹 지시' });
  if (type === 'continue') out.push({ role: 'system', content: mx(P.continueNudge || CONTINUE_NUDGE), src: '이어쓰기 지시' });
  if (type === 'impersonate') out.push({ role: 'system', content: mx(P.impersonatePrompt || IMPERSONATE_NUDGE), src: '대필 지시' });
  if (bias) out.push({ role: 'assistant', content: bias, src: '응답 시작 문구', prefill: true });

  if (P.squash !== false) {
    const sq = [];
    for (const m of out) {
      const p = sq[sq.length - 1];
      if (p && p.role === 'system' && m.role === 'system' && p.src !== 'history' && m.src !== 'history') { p.content += '\n\n' + m.content; p.src += ' + ' + m.src; }
      else sq.push({ ...m });
    }
    out = sq;
  }
  const total = out.reduce((n, m) => n + tokens(m.content) + 4, 0);
  return done({ messages: out, total, lore, dropped: start, ctx });
}
const ROLE3 = ['system', 'user', 'assistant'];

// ── API ──
// kind: 요청 형식 (openai 호환 · anthropic · google · vertex · azure · mock)
const P = (name, group, base, models = [], extra = {}) => ({ name, group, base, models, kind: 'openai', ...extra });
export const PROVIDERS = {
  // 주요
  openai: P('OpenAI', '주요', 'https://api.openai.com/v1', ['gpt-6-astra', 'gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.3-chat-latest', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'], { official: true }),
  anthropic: P('Anthropic (Claude)', '주요', 'https://api.anthropic.com', ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'], { kind: 'anthropic' }),
  google: P('Google AI Studio (Gemini)', '주요', 'https://generativelanguage.googleapis.com', ['gemini-4-argon', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemma-4-31b-it'], { kind: 'google' }),
  openrouter: P('OpenRouter', '주요', 'https://openrouter.ai/api/v1', [], { samplers: true }),
  // 클라우드
  vertexai: P('Google Vertex AI (익스프레스 키)', '클라우드', 'https://aiplatform.googleapis.com', ['gemini-4-argon', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], { kind: 'vertex' }),
  azure: P('Azure OpenAI', '클라우드', '', [], { kind: 'azure', ph: 'https://내리소스.openai.azure.com', note: '모델 칸에는 배포(deployment) 이름을 넣습니다.' }),
  xai: P('xAI (Grok)', '클라우드', 'https://api.x.ai/v1'),
  deepseek: P('DeepSeek', '클라우드', 'https://api.deepseek.com/v1', ['deepseek-chat', 'deepseek-reasoner']),
  mistralai: P('Mistral AI', '클라우드', 'https://api.mistral.ai/v1', ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest']),
  cohere: P('Cohere', '클라우드', 'https://api.cohere.ai/compatibility/v1', ['command-a-03-2025', 'command-r-plus-08-2024', 'command-r-08-2024', 'command-r7b-12-2024']),
  perplexity: P('Perplexity', '클라우드', 'https://api.perplexity.ai', ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro', 'sonar-deep-research']),
  groq: P('Groq', '클라우드', 'https://api.groq.com/openai/v1', ['qwen/qwen3-32b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile']),
  ai21: P('AI21', '클라우드', 'https://api.ai21.com/studio/v1', ['jamba-large', 'jamba-mini']),
  moonshot: P('Moonshot (Kimi)', '클라우드', 'https://api.moonshot.ai/v1', ['kimi-latest', 'kimi-k2-0711-preview', 'kimi-thinking-preview', 'moonshot-v1-auto']),
  zai: P('Z.AI (GLM)', '클라우드', 'https://api.z.ai/api/paas/v4', ['glm-5.2', 'glm-5.1', 'glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash', 'glm-4.6']),
  minimax: P('MiniMax', '클라우드', 'https://api.minimax.io/v1', ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'M2-her']),
  fireworks: P('Fireworks', '클라우드', 'https://api.fireworks.ai/inference/v1', [], { samplers: true }),
  togetherai: P('Together AI', '클라우드', 'https://api.together.xyz/v1', [], { samplers: true }),
  siliconflow: P('SiliconFlow', '클라우드', 'https://api.siliconflow.com/v1', [], { samplers: true }),
  huggingface: P('Hugging Face', '클라우드', 'https://router.huggingface.co/v1'),
  workers_ai: P('Cloudflare Workers AI', '클라우드', '', [], { ph: 'https://api.cloudflare.com/client/v4/accounts/계정ID/ai/v1' }),
  bedrock: P('Amazon Bedrock (API 키)', '클라우드', '', [], { ph: 'https://bedrock-mantle.us-east-1.api.aws/v1', note: '리전에 맞는 주소를 넣습니다. 교차 리전 추론 프로필은 https://bedrock-runtime.리전.amazonaws.com/v1 을 씁니다.' }),
  zai_coding: P('Z.AI (코딩 플랜)', '클라우드', 'https://api.z.ai/api/coding/paas/v4', ['glm-5.2', 'glm-5.1', 'glm-5', 'glm-4.7']),
  // 중계 · 모음 서비스
  nanogpt: P('NanoGPT', '모음 서비스', 'https://nano-gpt.com/api/v1', [], { samplers: true }),
  chutes: P('Chutes', '모음 서비스', 'https://llm.chutes.ai/v1', [], { samplers: true }),
  electronhub: P('Electron Hub', '모음 서비스', 'https://api.electronhub.ai/v1'),
  aimlapi: P('AI/ML API', '모음 서비스', 'https://api.aimlapi.com/v1'),
  cometapi: P('CometAPI', '모음 서비스', 'https://api.cometapi.com/v1'),
  pollinations: P('Pollinations', '모음 서비스', 'https://gen.pollinations.ai/v1'),
  featherless: P('Featherless', '모음 서비스', 'https://api.featherless.ai/v1', [], { samplers: true }),
  infermaticai: P('Infermatic', '모음 서비스', 'https://api.totalgpt.ai/v1', [], { samplers: true }),
  arliai: P('Arli AI', '모음 서비스', 'https://api.arliai.com/v1', [], { samplers: true }),
  dreamgen: P('DreamGen', '모음 서비스', 'https://dreamgen.com/api/openai/v1', [], { kind: 'text' }),
  horde: P('AI Horde', '모음 서비스', 'https://aihorde.net/api/v2', ['any'], { kind: 'horde', keyless: true, note: '키를 비워 두면 익명으로 접속합니다. 응답이 올 때까지 기다리는 방식이라 스트리밍은 되지 않아요.' }),
  novelai: P('NovelAI (텍스트)', '모음 서비스', '', ['llama-3-erato-v1', 'kayra-v1', 'clio-v1'], { kind: 'novelai', note: '텍스트 완성 방식입니다. 연결이 막히면 고급 설정에서 서버를 거쳐 연결을 켜세요.' }),
  mancer: P('Mancer', '모음 서비스', 'https://neuro.mancer.tech/oai/v1', [], { samplers: true }),
  // 내 컴퓨터
  ollama: P('Ollama', '내 컴퓨터', 'http://127.0.0.1:11434/v1', [], { keyless: true, samplers: true }),
  koboldcpp: P('KoboldCpp', '내 컴퓨터', 'http://127.0.0.1:5001/v1', [], { keyless: true, samplers: true }),
  llamacpp: P('llama.cpp', '내 컴퓨터', 'http://127.0.0.1:8080/v1', [], { keyless: true, samplers: true }),
  lmstudio: P('LM Studio', '내 컴퓨터', 'http://127.0.0.1:1234/v1', [], { keyless: true, samplers: true }),
  ooba: P('Text Generation WebUI', '내 컴퓨터', 'http://127.0.0.1:5000/v1', [], { keyless: true, samplers: true }),
  tabby: P('TabbyAPI', '내 컴퓨터', 'http://127.0.0.1:5000/v1', [], { keyless: true, samplers: true }),
  vllm: P('vLLM', '내 컴퓨터', 'http://127.0.0.1:8000/v1', [], { keyless: true, samplers: true }),
  aphrodite: P('Aphrodite', '내 컴퓨터', 'http://127.0.0.1:2242/v1', [], { keyless: true, samplers: true }),
  koboldclassic: P('KoboldAI (클래식 API)', '내 컴퓨터', 'http://127.0.0.1:5000/api', [], { kind: 'kobold', keyless: true }),
  textcomp: P('텍스트 완성 (/v1/completions)', '내 컴퓨터', '', [], { kind: 'text', keyless: true, ph: 'http://127.0.0.1:5000/v1', note: '채팅 형식이 아닌 텍스트 완성 서버용입니다. 인스트럭트 · 컨텍스트 템플릿은 고급 포맷팅 화면에서 고릅니다.' }),
  // 기타
  custom: P('OpenAI 호환 (직접 입력)', '기타', '', [], { ph: 'https://…/v1', samplers: true, keyless: true }),
  mock: P('연습용 에코 (키 불필요)', '기타', '', ['echo'], { kind: 'mock', keyless: true }),
};
const defOf = c => PROVIDERS[c.provider] || PROVIDERS.custom;
const baseOf = c => (c.baseUrl || defOf(c).base || '').trim().replace(/\/+$/, '');
const claudeAdaptive = m => /fable|mythos|opus-(4-[6-9]|[5-9])|sonnet-(4-[6-9]|[5-9])|haiku-[5-9]/.test(m || '');
export const prefillOk = conn => !(defOf(conn).kind === 'anthropic' && claudeAdaptive(conn.model));
const num = v => v !== null && v !== '' && v !== undefined && !isNaN(+v);
const jsonOr = (text, fallback) => { if (!text || !String(text).trim()) return fallback; try { const j = JSON.parse(text); return j && typeof j === 'object' ? j : fallback; } catch { return fallback; } };

// ── Vertex AI 서비스 계정 ──
const tokenCache = new Map();
const b64url = buf => { const u = buf instanceof Uint8Array ? buf : new TextEncoder().encode(buf); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export function parseServiceAccount(text) {
  let j; try { j = JSON.parse(text); } catch { throw new Error('서비스 계정 키가 올바른 JSON 이 아닙니다.'); }
  if (!j.client_email || !j.private_key) throw new Error('서비스 계정 키에 client_email 또는 private_key 가 없습니다.');
  return j;
}
async function vertexToken(conn) {
  if (Secrets.is(conn.serviceAccount)) {   // 키가 서버에 보관돼 있으면 서버가 서명한다
    const hit = tokenCache.get('ref:' + conn.id); if (hit && hit.exp > Date.now() + 60000) return hit.token;
    const r = await fetch('/api/vertex-token', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dreamland': '1' }, body: JSON.stringify({ ref: conn.id }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Google 인증 실패');
    tokenCache.set('ref:' + conn.id, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }); return j.access_token;
  }
  const sa = parseServiceAccount(conn.serviceAccount);
  const hit = tokenCache.get(sa.client_email);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;
  let token, ttl = 3600;
  // 1) 드림랜드 서버가 대신 서명·교환 (CORS 와 비보안 접속 문제를 피한다)
  try {
    const r = await fetch('/api/vertex-token', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dreamland': '1' }, body: JSON.stringify({ serviceAccount: sa }) });
    if (r.ok) { const j = await r.json(); token = j.access_token; ttl = j.expires_in || ttl; }
    else if (r.status !== 404) throw new Error((await r.json().catch(() => ({}))).error || '토큰 발급 실패');
  } catch (e) { if (!/Failed to fetch|NetworkError|404/.test(String(e.message))) throw e; }
  // 2) 서버가 없으면 브라우저에서 직접
  if (!token) {
    if (!crypto?.subtle) throw new Error('이 접속 환경에서는 서비스 계정 서명을 할 수 없어요. 드림랜드 서버(start.bat)로 열어 주세요.');
    const now = Math.floor(Date.now() / 1000), aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
    const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud, iat: now, exp: now + 3600 }));
    const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
    const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(sig) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Google 인증 실패: ' + (j.error_description || j.error || r.status));
    token = j.access_token; ttl = j.expires_in || ttl;
  }
  tokenCache.set(sa.client_email, { token, exp: Date.now() + ttl * 1000 });
  return token;
}
/** Vertex 요청 주소와 인증 헤더 */
async function vertexTarget(conn, publisher, model, method) {
  if (!conn.serviceAccount?.trim()) {
    const key = (conn.apiKey || '').trim(), bearer = key.startsWith('ya29.') || /^[\w-]+\.[\w-]+\.[\w-]+$/.test(key);
    const region = (conn.region || 'global').trim(), project = (conn.project || '').trim();
    const host = conn.baseUrl?.trim().replace(/\/+$/, '') || (project && region !== 'global' ? `https://${region}-aiplatform.googleapis.com` : 'https://aiplatform.googleapis.com');
    return { url: `${host}/v1/${project ? `projects/${project}/locations/${region}/` : ''}publishers/${publisher}/models/${model}:${method}`, headers: bearer ? { Authorization: 'Bearer ' + key } : { 'x-goog-api-key': key } };
  }
  const sa = Secrets.is(conn.serviceAccount) ? { project_id: conn.saProject || '' } : parseServiceAccount(conn.serviceAccount), region = (conn.region || 'global').trim(), project = (conn.project || sa.project_id || '').trim();
  if (!project) throw new Error('프로젝트 ID 를 알 수 없어요. 연결 설정에 프로젝트 ID 를 넣어 주세요.');
  const host = conn.baseUrl?.trim().replace(/\/+$/, '') || (region === 'global' ? 'https://aiplatform.googleapis.com' : `https://${region}-aiplatform.googleapis.com`);
  return { url: `${host}/v1/projects/${project}/locations/${region}/publishers/${publisher}/models/${model}:${method}`, headers: { Authorization: 'Bearer ' + await vertexToken(conn) } };
}

/** 생각하는 모델에 덧붙이는 출력 여유분 */
const THINK_ROOM = () => Math.max(0, +(S.settings.format?.reasoning?.headroom ?? 8000) || 0);
async function call(conn, url, { method = 'POST', headers = {}, body, signal }) {
  headers = { ...headers, ...jsonOr(conn.extraHeaders, {}) };
  let res;
  try {
    if (conn.proxy) res = await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dreamland': '1' }, body: JSON.stringify({ url, method, headers, body }), signal });
    else res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    if (!conn.proxy) { try { res = await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dreamland': '1' }, body: JSON.stringify({ url, method, headers, body }), signal }); } catch (e2) { if (e2.name === 'AbortError') throw e2; res = null; } }
    if (!res) throw new Error(`연결하지 못했어요 (${e.message}). 주소를 확인하거나, 연결 설정에서 "드림랜드 서버를 거쳐 연결"을 켜 보세요.`);
  }
  if (!res.ok) {
    let t = await res.text().catch(() => '');
    try { const j = JSON.parse(t); const e = Array.isArray(j) ? j[0]?.error : j.error; t = e?.message || e?.type || j.message || j.detail || (typeof j.error === 'string' ? j.error : t); } catch { }
    throw new Error(`API 오류 ${res.status}: ${String(t).slice(0, 400) || res.statusText}`);
  }
  return res;
}

async function* sse(res) {
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n/)) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + (buf[i] === '\r' ? 2 : 1));
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (!d || d === '[DONE]') continue;
      try { yield JSON.parse(d); } catch { }
    }
  }
  buf += dec.decode();   // 줄바꿈 없이 끝난 마지막 줄
  if (buf.startsWith('data:')) { const d = buf.slice(5).trim(); if (d && d !== '[DONE]') { try { yield JSON.parse(d); } catch { } } }
}

/** 프롬프트 후처리
 *  merge: 같은 역할이 이어지면 합친다 · semi: 첫 system 만 남기고 나머지는 user 로 · strict: semi + user 로 시작 · single: 전부 user 한 덩어리 */
const PLACEHOLDER = "Let's get started.";
export function shapeMessages(messages, mode = 'none', names = {}) {
  if (mode === 'none' || !mode) return messages;
  const strict = mode !== 'merge', single = mode === 'single', placeholders = mode === 'strict';
  const squash = list => { const out = []; for (const m of list) { const last = out[out.length - 1]; if (last && last.role === m.role && m.content && last.content && !m.prefill) { last.content += '\n\n' + m.content; if (m.images?.length) last.images = [...(last.images || []), ...m.images]; } else out.push({ ...m }); } return out; };
  let list = messages.map(m => {
    let { role, content } = m; content ||= '';
    if (single) { const who = role === 'assistant' ? names.char : role === 'user' ? names.user : ''; if (who && !content.startsWith(who + ': ')) content = who + ': ' + content; role = 'user'; }
    return { ...m, role, content };
  });
  list = squash(list);
  if (!list.length) list = [{ role: 'user', content: PLACEHOLDER }];
  if (strict) {
    list = list.map((m, i) => i > 0 && m.role === 'system' ? { ...m, role: 'user' } : m);
    if (placeholders) {
      if (list[0].role === 'system' && (!list[1] || list[1].role !== 'user')) list.splice(1, 0, { role: 'user', content: PLACEHOLDER });
      else if (list[0].role !== 'system' && list[0].role !== 'user') list.unshift({ role: 'user', content: PLACEHOLDER });
    }
    list = squash(list);
  }
  return list;
}

/** 텍스트 완성형 백엔드를 위한 프롬프트 한 줄 만들기
 *  messages.tc 가 있으면 buildPrompt 가 스토리 스트링으로 조립한 것이고, 없으면 보조 호출·대화 모드의 일반 메시지 목록이다. */
export function flatten(messages, conn, names = {}) {
  const user = names.user || 'User', char = names.char || 'Assistant', others = names.others || [];
  const F = AF(), tc = messages.tc, R = tc || resolve(conn), I = R.instruct, C = R.context, group = tc ? tc.group : others.length > 0, type = tc?.type || 'normal';
  const mx = t => macro(String(t ?? ''), { user, char });
  const bias = messages.find(m => m.prefill)?.content || '';
  let list = messages.filter(m => !m.prefill), head = '';
  if (!tc) {   // 앞쪽에 몰려 있는 시스템 메시지는 스토리 스트링 자리로
    let n = 0; while (n < list.length && list[n].role === 'system') n++;
    if (n && n < list.length) { let story = list.slice(0, n).map(m => m.content).join('\n\n'); if (!story.endsWith('\n') && (!I || (I.wrap && !I.story_string_suffix))) story += '\n'; head = I ? fmtStory(I, { ...C, story_string_position: 0 }, story, mx) : story; list = list.slice(n); }
  }
  const items = [];
  for (const m of list) { if (m.part === 'story') head += fmtStory(I, C, m.content, mx); else if (m.part === 'raw') head += m.content; else items.push(m); }
  const isImp = type === 'impersonate', cont = type === 'continue' && items[items.length - 1]?.role === 'assistant';
  const nameOf = m => m.role === 'system' ? '' : m.name ?? (m.role === 'user' ? user : char);
  const one = (m, force) => I ? fmtChat(I, { name: nameOf(m), mes: m.content, isUser: m.role === 'user', isNarrator: m.role === 'system', force, group, user, char, mx }) : (nameOf(m) ? `${nameOf(m)}: ${m.content}\n` : `${m.content}\n`);
  const lastUser = items.map(m => m.role).lastIndexOf('user');
  const parts = items.map((m, i) => one(m, i === lastUser && !isImp ? 2 : (tc ? m.first : i === 0) ? 1 : 0));
  let cycle = '';
  if (cont) {   // 이어 쓰기: 마지막 답변을 끝 시퀀스 없이 열어 둔다
    const m = items[items.length - 1], MARK = '\u0000\ufffc\u0000';
    cycle = one({ ...m, content: m.content + MARK }, 2); cycle = cycle.slice(0, cycle.lastIndexOf(MARK)); parts.pop();
  }
  if (I?.user_alignment_message && items[0]?.role !== 'user') parts.unshift(fmtChat(I, { name: user, mes: mx(I.user_alignment_message), isUser: true, isNarrator: false, force: 1, group, user, char, mx }));
  if (!cont) {
    if (!parts.length) parts.push('');
    let last = parts[parts.length - 1];
    if (!I || I.wrap) last = last.replace(/\n?$/, '');
    if (I) last += fmtLast(I, { name: isImp ? user : char, isImpersonate: isImp, isQuiet: !tc && !names.char, bias, group, mx });
    else {
      if (isImp || F.alwaysForceName2 !== false) { if (!last.endsWith('\n')) last += '\n'; last += `${isImp ? user : char}:`; }
      if (!isImp && bias.trim()) last += /\s/.test(last.slice(-1)) ? bias.trimStart() : ` ${bias.trimStart()}`;
    }
    parts[parts.length - 1] = last;
  }
  let prompt = (head + parts.join('') + cycle).replace(/\r/g, '');
  if (F.collapseNewlines) prompt = prompt.replace(/\n+/g, '\n');
  const stop = [];
  if (C.names_as_stop_strings !== false) { stop.push(isImp ? `\n${char}:` : `\n${user}:`, `\n${user}:`); if (group) stop.push(...others.map(n => `\n${n}:`)); }
  if (I) stop.push(...instructStops(I, { user, char, mx }));
  if (C.use_stop_strings) { if (C.chat_start) stop.push('\n' + mx(C.chat_start)); if (C.example_separator) stop.push('\n' + mx(C.example_separator)); }
  if (F.singleLine) stop.unshift('\n');
  const stops = [...new Set(stop.filter(Boolean))];
  if (tc) tc.stops = stops;
  return { prompt, stop: stops };
}
function toAlternating(messages, userFirst) {
  const sys = []; const rest = []; let lead = true;
  for (const m of messages) {
    if (m.role === 'system' && lead) { sys.push(m.content); continue; }
    lead = false;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const last = rest[rest.length - 1];
    if (last && last.role === role) { last.content += '\n\n' + m.content; if (m.images?.length) last.images = [...(last.images || []), ...m.images]; }
    else rest.push({ role, content: m.content, images: m.images?.length ? [...m.images] : undefined });
  }
  if (userFirst && rest[0]?.role !== 'user') rest.unshift({ role: 'user', content: '[Start]' });
  if (!rest.length) rest.push({ role: 'user', content: '[Start]' });
  return { system: sys.join('\n\n'), rest };
}
const b64 = url => { const m = String(url).match(/^data:([^;]+);base64,(.*)$/); return m ? { mime: m[1], data: m[2] } : null; };

/** 답변 앞쪽의 생각 블록(추론 서식의 접두 … 접미)을 생각 과정으로 분리 */
export function splitThink(text) {
  const rz = AF().reasoning || {}, out = parseThink(text, rz);
  if (AF().showBias === false && gen.bias && out.text.startsWith(gen.bias)) out.text = out.text.slice(gen.bias.length).replace(/^\s+/, '');   // 응답 시작 문구를 답변에 보이지 않기
  return out;
}
function parseThink(text, rz) {
  if (rz.autoParse === false) return { text, think: '' };
  const pre = String(rz.prefix || '').trim(), suf = String(rz.suffix || '').trim();
  if (pre && suf && (pre !== '<think>' || suf !== '</think>')) {
    const t = text.trimStart(); if (!t.startsWith(pre)) return { text, think: '' };
    const end = t.indexOf(suf, pre.length);
    return end < 0 ? { text: '', think: t.slice(pre.length).trim() } : { text: t.slice(end + suf.length).replace(/^\s+/, ''), think: t.slice(pre.length, end).trim() };
  }
  if (!pre || !suf) return { text, think: '' };   // 접두·접미가 모두 있어야 분리한다
  const m = text.match(/^\s*<(think|thinking|reasoning)>([\s\S]*?)(?:<\/\1>|$)/i);
  if (!m) return { text, think: '' };
  return { text: text.slice(m[0].length).replace(/^\s+/, ''), think: m[2].trim() };
}

/** 스트리밍 채팅. onText(delta), onThink(delta) */
export async function streamChat(conn, P, messages, { signal, onText = () => { }, onThink = () => { } } = {}) {
  if (!conn) throw new Error('API 연결이 없습니다. 먼저 연결을 추가해 주세요.');
  const def = defOf(conn), kind = def.kind, model = conn.model;
  const stream = P.stream !== false;
  const extra = jsonOr(conn.extraBody, {});
  if (P.stop?.length) P = { ...P, stop: P.stop.map(x => { x = String(x).replace(/\\n/g, '\n'); return AF().stopMacro !== false && P.names ? macro(x, { user: P.names.user, char: P.names.char }) : x; }).filter(Boolean) };   // 중단 문자열 안의 \n · 매크로
  let text = '', think = '', finish = '', usage = null;
  const put = t => { if (t) { text += t; onText(t); } };
  const putThink = t => { if (t) { think += t; onThink(t); } };

  if (kind === 'mock') {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const reply = `창밖으로 별빛이 천천히 흘러내렸다.\n\n"${lastUser.replace(/["“”]/g, '').slice(0, 60) || '안녕'}… 라고 했지?" 그녀가 고개를 기울이며 웃었다.\n\n'연습용 연결이라 같은 말만 되돌려 주는 거, 들키면 안 되는데.'\n\n"진짜 대화를 하려면 API 연결을 추가해 줘."`;
    for (const ch of reply.match(/[\s\S]{1,3}/g)) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      put(ch); await new Promise(r => setTimeout(r, 12));
    }
    return { text, think, finish: 'stop', usage };
  }

  if (!model) throw new Error('모델이 선택되지 않았습니다.');
  const base = baseOf(conn);
  if (!base && kind !== 'vertex' && kind !== 'horde' && kind !== 'novelai') throw new Error('연결 주소가 비어 있습니다.');

  const claudeOnVertex = kind === 'vertex' && /^claude/i.test(model);
  if (kind === 'anthropic' || claudeOnVertex) {
    const adaptive = claudeAdaptive(model);
    let msgs = messages;
    if (adaptive && msgs[msgs.length - 1]?.prefill) msgs = msgs.slice(0, -1); // 최신 Claude 는 프리필 미지원
    const { system, rest } = toAlternating(msgs, true);
    const body = {
      model, max_tokens: (P.maxTokens || 4096) + (adaptive ? THINK_ROOM() : 0), stream,
      messages: rest.map(m => ({ role: m.role, content: m.images?.length ? [...m.images.map(b64).filter(Boolean).map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text: m.content }] : m.content })),
    };
    if (system) body.system = system;
    if (conn.cache) body.cache_control = { type: 'ephemeral' };
    if (adaptive) {
      body.thinking = { type: 'adaptive', display: 'summarized' };
      if (P.effort) body.output_config = { effort: P.effort };
    } else {
      if (num(P.temperature)) body.temperature = Math.min(1, +P.temperature);
      else if (num(P.topP)) body.top_p = +P.topP; // 구형 Claude 는 temperature 와 top_p 를 함께 받지 않는다
      if (num(P.topK)) body.top_k = +P.topK;
    }
    if (P.stop?.length) body.stop_sequences = P.stop;
    Object.assign(body, extra);
    let url = base.replace(/\/v1$/, '') + '/v1/messages';
    let headers = { 'Content-Type': 'application/json', 'x-api-key': conn.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    if (claudeOnVertex) {
      const t = await vertexTarget(conn, 'anthropic', model, stream ? 'streamRawPredict' : 'rawPredict');
      url = t.url; headers = { 'Content-Type': 'application/json', ...t.headers };
      delete body.model; body.anthropic_version = 'vertex-2023-10-16';
    }
    const res = await call(conn, url, { headers, body, signal });
    const stopNote = r => { if (r === 'refusal') put('\n\n*(모델이 이 요청에 대한 응답을 거절했습니다.)*'); };
    if (!stream) {
      const j = await res.json();
      for (const b of j.content || []) { if (b.type === 'text') put(b.text); if (b.type === 'thinking') putThink(b.thinking); }
      stopNote(j.stop_reason);
      return { text, think, finish: j.stop_reason, usage: j.usage };
    }
    for await (const ev of sse(res)) {
      if (ev.type === 'content_block_delta') { if (ev.delta?.type === 'text_delta') put(ev.delta.text); else if (ev.delta?.type === 'thinking_delta') putThink(ev.delta.thinking); }
      else if (ev.type === 'message_delta') { finish = ev.delta?.stop_reason || finish; usage = ev.usage || usage; }
      else if (ev.type === 'error') throw new Error('API 오류: ' + (ev.error?.message || 'stream error'));
    }
    stopNote(finish);
    return { text, think, finish, usage };
  }

  if (kind === 'google' || kind === 'vertex') {
    const { system, rest } = toAlternating(messages, true);
    const thinks = /gemini-(2\.5|[3-9])/.test(model);
    const gen = { maxOutputTokens: (P.maxTokens || 4096) + (thinks ? THINK_ROOM() : 0) };
    if (num(P.temperature)) gen.temperature = +P.temperature;
    if (num(P.topP)) gen.topP = +P.topP;
    if (num(P.topK)) gen.topK = +P.topK;
    if (num(P.seed)) gen.seed = +P.seed;
    if (P.stop?.length) gen.stopSequences = P.stop.slice(0, 5);
    if (thinks) gen.thinkingConfig = { includeThoughts: true };
    const body = {
      contents: rest.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [...(m.images || []).map(b64).filter(Boolean).map(i => ({ inlineData: { mimeType: i.mime, data: i.data } })), { text: m.content }] })), generationConfig: gen,
      safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map(c => ({ category: c, threshold: 'BLOCK_NONE' })),
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    Object.assign(body, extra);
    const id = encodeURIComponent(model.replace(/^models\//, '')), method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const t = kind === 'vertex' ? await vertexTarget(conn, 'google', id, method) : { url: `${base}/v1beta/models/${id}:${method}`, headers: { 'x-goog-api-key': conn.apiKey } };
    const res = await call(conn, t.url, { headers: { 'Content-Type': 'application/json', ...t.headers }, body, signal });
    const eat = j => {
      if (Array.isArray(j)) j = j[0] || {};
      if (j.error) throw new Error(`API 오류 ${j.error.code || ''}: ${j.error.message || JSON.stringify(j.error)}`);
      const c = j.candidates?.[0];
      for (const p of c?.content?.parts || []) { if (p.thought) putThink(p.text); else put(p.text); }
      if (c?.finishReason) finish = c.finishReason;
      if (j.promptFeedback?.blockReason) put(`\n\n*(요청이 차단되었습니다: ${j.promptFeedback.blockReason})*`);
      usage = j.usageMetadata || usage;
    };
    if (stream) { for await (const ev of sse(res)) eat(ev); } else eat(await res.json());
    // 글이 한 자도 안 왔으면 이유를 알려 준다
    if (!text.trim()) {
      const why = { MAX_TOKENS: '출력 토큰이 모자라 답변을 쓰기 전에 끊겼어요. 프리셋의 최대 응답 길이를 늘려 주세요.', SAFETY: '안전 필터에 걸려 답변이 비었어요.', PROHIBITED_CONTENT: '금지된 내용으로 판단되어 답변이 비었어요.', RECITATION: '인용 필터에 걸려 답변이 비었어요.', BLOCKLIST: '차단 목록에 걸려 답변이 비었어요.', SPII: '개인정보 필터에 걸려 답변이 비었어요.', OTHER: '모델이 이유를 밝히지 않고 답변을 비웠어요.' }[finish];
      if (why) throw new Error(`${why} (finishReason: ${finish})`);
      if (!think) throw new Error('모델이 빈 답변을 돌려줬어요. 모델 이름과 지역(리전), 프로젝트 ID 를 확인해 주세요.');
    }
    return { text, think, finish, usage };
  }

  if (kind === 'text' || kind === 'kobold' || kind === 'horde' || kind === 'novelai') {
    const { prompt, stop } = flatten(messages, conn, P.names || {});
    const stops = [...new Set([...(P.stop || []), ...stop])];
    if (kind === 'text') {
      const body = { model, prompt, stream, max_tokens: P.maxTokens || 512, stop: stops.slice(0, 16) };
      if (num(P.temperature)) body.temperature = +P.temperature; if (num(P.topP)) body.top_p = +P.topP; if (num(P.topK)) body.top_k = +P.topK;
      if (num(P.minP)) body.min_p = +P.minP; if (num(P.topA)) body.top_a = +P.topA; if (num(P.repPen)) body.repetition_penalty = +P.repPen; if (num(P.seed)) body.seed = +P.seed;
      Object.assign(body, extra);
      const res = await call(conn, base + '/completions', { headers: { 'Content-Type': 'application/json', ...(conn.apiKey ? { Authorization: 'Bearer ' + conn.apiKey } : {}) }, body, signal });
      if (!stream) { const j = await res.json(); put(j.choices?.[0]?.text || ''); return { text, think, finish: j.choices?.[0]?.finish_reason, usage: j.usage }; }
      for await (const ev of sse(res)) { if (ev.error) throw new Error('API 오류: ' + (ev.error.message || JSON.stringify(ev.error))); put(ev.choices?.[0]?.text || ''); if (ev.choices?.[0]?.finish_reason) finish = ev.choices[0].finish_reason; }
      return { text, think, finish, usage };
    }
    const kparams = { max_context_length: P.contextSize || 8192, max_length: Math.min(P.maxTokens || 512, 2048), stop_sequence: stops, ...(num(P.temperature) ? { temperature: +P.temperature } : {}), ...(num(P.topP) ? { top_p: +P.topP } : {}), ...(num(P.topK) ? { top_k: +P.topK } : {}), ...(num(P.topA) ? { top_a: +P.topA } : {}), ...(num(P.minP) ? { min_p: +P.minP } : {}), ...(num(P.repPen) ? { rep_pen: +P.repPen } : {}) };
    if (kind === 'kobold') {
      const res = await call(conn, base.replace(/\/v1$/, '') + '/v1/generate', { headers: { 'Content-Type': 'application/json' }, body: { prompt, ...kparams, use_story: false, use_memory: false, use_authors_note: false, use_world_info: false, ...extra }, signal });
      put((await res.json()).results?.[0]?.text || ''); return { text, think, finish: 'stop', usage };
    }
    if (kind === 'horde') {
      const hb = base || 'https://aihorde.net/api/v2', headers = { 'Content-Type': 'application/json', apikey: conn.apiKey || '0000000000', 'Client-Agent': 'Dreamland:1:local' };
      const { id } = await (await call(conn, hb + '/generate/text/async', { headers, body: { prompt, params: kparams, models: model && model !== 'any' ? [model] : [], ...extra }, signal })).json();
      try {
        for (;;) {
          await new Promise((r, j) => { const t = setTimeout(r, 2500); signal?.addEventListener('abort', () => { clearTimeout(t); j(new DOMException('aborted', 'AbortError')); }, { once: true }); });
          const st = await (await call(conn, hb + '/generate/text/status/' + id, { method: 'GET', headers, signal })).json();
          if (st.faulted) throw new Error('AI Horde 작업이 실패했어요.');
          if (st.done) { put(st.generations?.[0]?.text || ''); return { text, think, finish: 'stop', usage }; }
        }
      } catch (e) { if (e.name === 'AbortError') call(conn, hb + '/generate/text/status/' + id, { method: 'DELETE', headers }).catch(() => { }); throw e; }
    }
    // NovelAI
    const nb = base || (/kayra|erato/.test(model) ? 'https://text.novelai.net' : 'https://api.novelai.net');
    const res = await call(conn, nb + '/ai/generate', { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + conn.apiKey }, body: { input: prompt, model, parameters: { use_string: true, temperature: num(P.temperature) ? +P.temperature : 1, max_length: Math.min(P.maxTokens || 150, 250), min_length: 1, ...(num(P.topP) ? { top_p: +P.topP } : {}), ...(num(P.topK) ? { top_k: +P.topK } : {}), ...(num(P.repPen) ? { repetition_penalty: +P.repPen } : {}), generate_until_sentence: true, ...extra } }, signal });
    put((await res.json()).output || ''); return { text, think, finish: 'stop', usage };
  }

  // OpenAI 호환 (+ Azure)
  const shaped = shapeMessages(messages, conn.postProcess || 'none', P.names || {});
  const body = { model, stream, messages: shaped.map(m => ({ role: m.role, content: m.images?.length ? [{ type: 'text', text: m.content }, ...m.images.map(url => ({ type: 'image_url', image_url: { url } }))] : m.content })) };
  const official = !!def.official || kind === 'azure';
  if (num(P.maxTokens)) body[official ? 'max_completion_tokens' : 'max_tokens'] = +P.maxTokens;
  if (num(P.temperature)) body.temperature = +P.temperature;
  if (num(P.topP)) body.top_p = +P.topP;
  if (num(P.freqPen)) body.frequency_penalty = +P.freqPen;
  if (num(P.presPen)) body.presence_penalty = +P.presPen;
  if (num(P.seed)) body.seed = +P.seed;
  if (P.stop?.length) body.stop = P.stop.slice(0, 4);
  if (def.samplers) { // 표준 밖의 샘플러는 받아 주는 곳에만 보낸다
    if (num(P.topK)) body.top_k = +P.topK;
    if (num(P.minP)) body.min_p = +P.minP;
    if (num(P.topA)) body.top_a = +P.topA;
    if (num(P.repPen)) body.repetition_penalty = +P.repPen;
  }
  if (P.effort) { if (conn.provider === 'openrouter') body.reasoning = { effort: P.effort }; else body.reasoning_effort = P.effort; }
  if (stream && official) body.stream_options = { include_usage: true };
  Object.assign(body, extra);
  const headers = { 'Content-Type': 'application/json' };
  if (conn.apiKey) { if (kind === 'azure') headers['api-key'] = conn.apiKey; else headers.Authorization = 'Bearer ' + conn.apiKey; }
  if (conn.provider === 'openrouter') { headers['X-Title'] = 'Dreamland'; headers['HTTP-Referer'] = location.origin; }
  const url = kind === 'azure' ? base.replace(/\/openai(\/v1)?$/, '') + '/openai/v1/chat/completions' : base + '/chat/completions';
  const res = await call(conn, url, { headers, body, signal });
  if (!stream) {
    const j = await res.json(); const m = j.choices?.[0]?.message || {};
    putThink(m.reasoning_content || m.reasoning || ''); put(m.content || '');
    return { text, think, finish: j.choices?.[0]?.finish_reason, usage: j.usage };
  }
  for await (const ev of sse(res)) {
    if (ev.error) throw new Error('API 오류: ' + (ev.error.message || JSON.stringify(ev.error)));
    const d = ev.choices?.[0]?.delta || {};
    putThink(d.reasoning_content || d.reasoning || '');
    put(typeof d.content === 'string' ? d.content : '');
    if (ev.choices?.[0]?.finish_reason) finish = ev.choices[0].finish_reason;
    if (ev.usage) usage = ev.usage;
  }
  return { text, think, finish, usage };
}

export async function listModels(conn) {
  const def = defOf(conn), base = baseOf(conn);
  if (def.kind === 'mock') return ['echo'];
  if (def.kind === 'vertex') {   // 모델 가든에서 실제 목록을 받아 온다 (Google · Anthropic)
    const out = [];
    for (const pub of ['google', 'anthropic']) {
      try {
        const t = await vertexTarget(conn, pub, 'x', 'y');   // 주소와 인증만 빌려 쓴다
        const host = new URL(t.url).origin; let page = '';
        for (let i = 0; i < 5; i++) {
          const j = await (await call(conn, `${host}/v1beta1/publishers/${pub}/models?pageSize=200${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, { method: 'GET', headers: t.headers })).json();
          for (const m of j.publisherModels || []) { const id = String(m.name || '').split('/').pop(); if (id && (pub === 'anthropic' || /gemini|gemma/.test(id))) out.push(id); }
          page = j.nextPageToken || ''; if (!page) break;
        }
      } catch (e) { if (pub === 'google' && !out.length) console.warn('vertex models', e); }
    }
    return out.length ? [...new Set(out)].sort().reverse() : def.models;
  }
  if (def.kind === 'anthropic') {
    const r = await call(conn, base.replace(/\/v1$/, '') + '/v1/models?limit=100', { method: 'GET', headers: { 'x-api-key': conn.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    return (await r.json()).data.map(m => m.id);
  }
  if (def.kind === 'google') {
    const r = await call(conn, base + '/v1beta/models?pageSize=200', { method: 'GET', headers: { 'x-goog-api-key': conn.apiKey } });
    return (await r.json()).models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  }
  const headers = !conn.apiKey ? {} : def.kind === 'azure' ? { 'api-key': conn.apiKey } : { Authorization: 'Bearer ' + conn.apiKey };
  const url = def.kind === 'azure' ? base.replace(/\/openai(\/v1)?$/, '') + '/openai/v1/models' : base + '/models';
  const j = await (await call(conn, url, { method: 'GET', headers })).json();
  return (Array.isArray(j) ? j : (j.data || j.models || [])).map(m => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean).sort();
}

/** 보조 호출(요약·트래커·번역): 스트리밍 없이 한 번에 */
export async function quickCall(system, user, { maxTokens = 1500, signal, conn } = {}) {
  const P = { ...S.preset().params, stream: false, maxTokens, prefill: '', stop: [] };
  const r = await streamChat(conn || S.conn(), P, [{ role: 'system', content: system }, { role: 'user', content: user }], { signal });
  return splitThink(r.text).text.trim();
}
