// 생성 · 프롬프트 끼워 넣기 · 매크로 닮은 것: Tavern Helper 의 generate · generateRaw · injectPrompts · registerMacroLike
// 끼워 넣기 · 매크로가 하나라도 있을 때만 엔진에 끼어든다 (없으면 생성 · 답 그리기에 아무 일도 더하지 않는다)
import { S, emit, newMsg, on, msgText, uid } from '../lib/core';
import * as E from '../lib/engine';
import { X, type PromptPiece } from '../lib/hooks';
import { framePost } from '../lib/format';
import { invokeFrames } from '../chat/frameEvents';
import { chatApi } from '../chat/actions';
import { cur } from '../chat/store';
import type { Conn, Msg } from '../lib/types';
import { type Ctx, type Obj, chat, charsOf, fail, isObj, presetOf, str } from './util';

// ════════ 프롬프트 끼워 넣기 ════════
interface Inj { id: string; position: string; depth: number; role: string; content: string; f: HTMLIFrameElement | null; filter?: () => unknown; /** 메시지 속 화면의 거르기 (그 화면에 물어본다) */ askFrame?: boolean; once?: boolean }
const injects = new Map<string, Inj>();
const passed = new Map<string, boolean>();
let hooked = false;
const alive = (j: Inj) => !j.f || j.f.isConnected;   // 화면이 사라지면 그 화면이 넣은 것도 사라진다 (Tavern Helper 와 같다)
function prune() { for (const [k, j] of injects) if (!alive(j)) injects.delete(k); }
/** 거르기(filter)를 생성 전에 미리 돌려 둔다 (함수가 비동기일 수 있다) */
async function runFilters() {
  prune(); passed.clear();
  const asks: Inj[] = [];
  for (const j of injects.values()) {
    if (j.askFrame) { asks.push(j); continue; }
    if (!j.filter) continue;
    try { passed.set(j.id, !!(await j.filter())); } catch (e) { console.warn('[스크립트 끼워 넣기]', j.id, e); passed.set(j.id, false); }
  }
  if (asks.length) {   // 메시지 속 화면: 그 화면이 들고 있는 거르기 함수에 물어본다
    const res: Obj = {}; await invokeFrames('__th_filter', [res], { timeout: 3000 }).catch(() => { });
    for (const j of asks) passed.set(j.id, res[j.id] === true);
  }
}
function pieces(): PromptPiece[] {
  const out: PromptPiece[] = [];
  for (const j of injects.values()) {
    if (j.position !== 'in_chat' || !alive(j) || !j.content) continue;
    if ((j.filter || j.askFrame) && passed.get(j.id) === false) continue;
    out.push({ where: 'depth', depth: Math.max(0, j.depth || 0), role: j.role || 'system', content: j.content, order: 100, src: 'script: ' + j.id });
  }
  return out;
}
function hook() {
  if (hooked) return; hooked = true;
  X.prompt.push({ owner: 'th-inject', fn: () => injects.size ? pieces() : [] });
  X.before.push({ owner: 'th-inject', fn: async () => { if (injects.size) await runFilters(); } });
  const dropOnce = () => { for (const [k, j] of injects) if (j.once) injects.delete(k); };
  on('generate:end', dropOnce);
}
function inject(c: Ctx, list: unknown, opt: unknown) {
  const once = isObj(opt) && !!opt.once, ids: string[] = [];
  for (const p of (Array.isArray(list) ? list : []).filter(isObj)) {
    const id = str(p.id) || uid(); ids.push(id);
    injects.set(id, { id, position: p.position === 'none' ? 'none' : 'in_chat', depth: Number(p.depth) || 0, role: ['system', 'user', 'assistant'].includes(str(p.role)) ? str(p.role) : 'system', content: str(p.content), f: c.f, once,
      ...(typeof p.filter === 'function' ? { filter: p.filter as () => unknown } : p.filter === '__frame' ? { askFrame: true } : {}) });
  }
  if (injects.size) hook();
  return ids;
}

// ════════ 매크로 닮은 것 (registerMacroLike) ════════
interface MacroLike { re: RegExp; fn: (ctx: Obj, sub: string, ...a: unknown[]) => unknown; f: HTMLIFrameElement | null }
const macros: MacroLike[] = [];
let mHooked = false;
const mAlive = () => { for (let i = macros.length - 1; i >= 0; i--) if (macros[i].f && !macros[i].f!.isConnected) macros.splice(i, 1); return macros.length > 0; };
export function applyMacros(text: string, ctx: Obj): string {
  if (!text || !mAlive()) return text;
  for (const m of macros) {
    m.re.lastIndex = 0;
    try { text = text.replace(m.re, (sub: string, ...a: unknown[]) => { try { return str(m.fn(ctx, sub, ...a)); } catch (e) { console.warn('[스크립트 매크로]', e); return sub; } }); } catch (e) { console.warn('[스크립트 매크로]', e); }
  }
  return text;
}
function mHook() {
  if (mHooked) return; mHooked = true;
  // 보내는 프롬프트: 다 조립된 메시지마다 (Tavern Helper 처럼 맨 마지막에)
  on('prompt:ready', d => { if (!mAlive()) return; for (const m of (d as { messages: { role: string; content: unknown }[] }).messages) if (typeof m.content === 'string') m.content = applyMacros(m.content, { role: m.role }); });
  // 화면에 그리는 글
  X.filters.push({ owner: 'th-macro', fn: (text, info) => { if (!macros.length) return text; const i = info?.msg ? cur.msgs.indexOf(info.msg) : -1; return applyMacros(text, { ...(i >= 0 ? { message_id: i } : {}), role: info?.role === 'user' ? 'user' : info?.role === 'system' ? 'system' : 'assistant' }); } });
}
function register(c: Ctx, re: unknown, fn: unknown) {
  if (!(re instanceof RegExp) && !(re && typeof (re as RegExp).source === 'string')) return fail('badRegex');
  if (typeof fn !== 'function') { console.warn('[스크립트 매크로] 메시지 속 화면에서는 registerMacroLike 를 쓸 수 없어 건너뜁니다'); return false; }
  const r = re as RegExp;
  if (!macros.some(m => m.re.source === r.source)) { macros.push({ re: r, fn: fn as MacroLike['fn'], f: c.f }); mHook(); chatApi.redraw(); }
  return true;
}
function unregister(re: unknown) { const src = re instanceof RegExp ? re.source : isObj(re) ? str((re as { source?: unknown }).source) : str(re); const i = macros.findIndex(m => m.re.source === src); if (i >= 0) { macros.splice(i, 1); chatApi.redraw(); } }

// ════════ 생성 ════════
const gens = new Map<string, AbortController>();
const DEFAULT_ORDER = ['world_info_before', 'persona_description', 'char_description', 'char_personality', 'scenario', 'world_info_after', 'dialogue_examples', 'chat_history', 'user_input'];
/** custom_api: 스크립트가 직접 준 주소 · 키 · 모델로 한 번만 부르는 연결 (저장하지 않는다) */
function connOf(cfg: Obj): Conn | undefined {
  const base = chat() ? S.connFor(chat()) : S.conn(), api = isObj(cfg.custom_api) ? cfg.custom_api : null;
  if (!api || (!api.apiurl && !api.model)) return base;
  const src = str(api.source || 'openai').toLowerCase(), provider = src === 'claude' ? 'anthropic' : src === 'makersuite' ? 'gemini' : src === 'openrouter' ? 'openrouter' : 'openai';
  // 주소를 준 경우: 스크립트가 준 키만 쓴다 (사용자의 키 · 서비스 계정 · 추가 헤더는 다른 주소로 보내지 않는다)
  if (api.apiurl) return { id: 'th-custom', name: 'script', provider, baseUrl: str(api.apiurl), apiKey: str(api.key || ''), model: str(api.model || ''), proxy: false, postProcess: 'none', extraHeaders: '', extraBody: '', cache: false } as Conn;
  return base ? { ...base, model: str(api.model || base.model) } : undefined;
}
function paramsOf(cfg: Obj) {
  const p = (cfg.preset_name && cfg.preset_name !== 'in_use' ? presetOf(cfg.preset_name) : null) || S.presetFor(chat()), P: E.Params = { ...p.params, prefill: '' };
  const api = isObj(cfg.custom_api) ? cfg.custom_api : {};
  const num = (k: string, mine: keyof E.Params) => { const v = api[k]; if (v === 'unset') delete P[mine]; else if (typeof v === 'number') (P as Obj)[mine] = v; };
  num('max_tokens', 'maxTokens'); num('temperature', 'temperature'); num('frequency_penalty', 'freqPen'); num('presence_penalty', 'presPen'); num('top_p', 'topP'); num('top_k', 'topK');
  return { preset: p, P };
}
/** 대화 기록 고르기: max_chat_history · overrides.chat_history.prompts */
function historyOf(cfg: Obj): Msg[] {
  const ov = isObj(cfg.overrides) && isObj(cfg.overrides.chat_history) ? cfg.overrides.chat_history : null;
  if (ov && Array.isArray(ov.prompts)) return (ov.prompts as Obj[]).filter(isObj).map(p => newMsg(p.role === 'user' ? 'user' : p.role === 'assistant' ? 'assistant' : 'system', str(p.content)));
  const all = cur.msgs.filter(m => !m.hidden), n = cfg.max_chat_history;
  return typeof n === 'number' && n >= 0 ? all.slice(Math.max(0, all.length - n)) : all;
}
/** 캐릭터 · 페르소나 글을 overrides 로 바꾼 사본 */
function people(cfg: Obj) {
  const c = chat()!, cs = charsOf(c), ov = isObj(cfg.overrides) ? cfg.overrides : {};
  const ch = cs[0] ? { ...cs[0], ...(ov.char_description !== undefined ? { description: str(ov.char_description) } : {}), ...(ov.char_personality !== undefined ? { personality: str(ov.char_personality) } : {}), ...(ov.scenario !== undefined ? { scenario: str(ov.scenario) } : {}), ...(ov.dialogue_examples !== undefined ? { mesExample: str(ov.dialogue_examples) } : {}) } : undefined;
  const pe = S.persona(c), persona = ov.persona_description !== undefined ? { ...pe, description: str(ov.persona_description) } : pe;
  return { c, chars: ch ? [ch, ...cs.slice(1)] : cs, char: ch, persona, ov };
}
/** generate: 지금 대화의 프롬프트(프리셋 · 카드 · 로어북 · 기록)에 사용자 입력을 더해 한 번 부른다. 대화에는 남기지 않는다 */
function normalMessages(cfg: Obj): E.PromptList {
  const input = str(cfg.user_input ?? cfg.prompt ?? '');
  if (!chat()) return [{ role: 'user', content: input }] as E.PromptList;
  const { c, chars, char, persona } = people(cfg), { preset } = paramsOf(cfg);
  const msgs = historyOf(cfg); if (input) msgs.push(newMsg('user', input, { name: persona.name }));
  const tmp = Array.isArray(cfg.injects) ? (cfg.injects as Obj[]).filter(isObj).filter(j => j.position !== 'none') : [];
  const hookOne = tmp.length ? { owner: 'th-gen-inject', fn: () => tmp.map(j => ({ where: 'depth' as const, depth: Number(j.depth) || 0, role: str(j.role || 'system'), content: str(j.content), order: 100, src: 'script' })) } : null;
  if (hookOne) X.prompt.push(hookOne);
  try { return E.buildPrompt({ chat: c, char: char!, chars, persona, preset, msgs, type: 'quiet' }).messages; }
  finally { if (hookOne) X.prompt.splice(X.prompt.indexOf(hookOne), 1); }
}
/** generateRaw: ordered_prompts 가 정한 차례대로만 조립한다 (프리셋 블록은 쓰지 않는다) */
function rawMessages(cfg: Obj): E.PromptList {
  const order = (Array.isArray(cfg.ordered_prompts) ? cfg.ordered_prompts : DEFAULT_ORDER) as unknown[], input = str(cfg.user_input ?? '');
  const out: E.PromptMsg[] = [];
  if (!chat()) { for (const o of order) if (isObj(o)) out.push({ role: str(o.role || 'system'), content: str(o.content) }); else if (o === 'user_input' && input) out.push({ role: 'user', content: input }); return out as E.PromptList; }
  const { c, chars, char, persona, ov } = people(cfg), msgs = historyOf(cfg);
  const ctx = E.makeCtx({ chat: c, char: char!, chars, persona, msgs, input }), mx = (s?: string) => E.macro(E.tpl(s || '', ctx), ctx);
  const hist = msgs.map((m, i) => ({ role: m.role, content: E.applyRegex(msgText(m), { who: m.role === 'user' ? 'user' : 'ai', target: 'prompt', depth: msgs.length - 1 - i, charId: m.charId, ctx }) }));
  const lore = E.scanLore(E.loreBooksFor(c, chars, persona), hist, ctx, { state: structuredClone(c.loreState || {}) as E.LoreState, count: msgs.length, commit: false, type: 'quiet', char: char || null, persona });
  const at = (p: string) => lore.filter(e => e.position === p).map(e => e.text).join('\n');
  const val: Record<string, () => string> = {
    world_info_before: () => ov.world_info_before !== undefined ? str(ov.world_info_before) : at('before'), world_info_after: () => ov.world_info_after !== undefined ? str(ov.world_info_after) : at('after'),
    persona_description: () => mx(persona?.description), char_description: () => mx(char?.description), char_personality: () => mx(char?.personality), scenario: () => mx(char?.scenario), dialogue_examples: () => mx(char?.mesExample).replace(/<START>/gi, '').trim(),
  };
  for (const o of order) {
    if (isObj(o)) { out.push({ role: str(o.role || 'system'), content: mx(str(o.content)) }); continue; }
    const k = str(o);
    if (k === 'chat_history') {
      const h: E.PromptMsg[] = hist.map(x => ({ role: x.role === 'system' ? 'system' : x.role, content: x.content }));
      for (const e of lore.filter(x => x.position === 'depth')) h.splice(Math.max(0, h.length - (Number(e.depth) || 0)), 0, { role: e.role || 'system', content: e.text });
      for (const j of (Array.isArray(cfg.injects) ? cfg.injects as Obj[] : []).filter(isObj)) if (j.position !== 'none') h.splice(Math.max(0, h.length - (Number(j.depth) || 0)), 0, { role: str(j.role || 'system'), content: str(j.content) });
      out.push(...h); continue;
    }
    if (k === 'user_input') { if (input) out.push({ role: 'user', content: input }); continue; }
    const v = val[k]?.(); if (v && v.trim()) out.push({ role: 'system', content: v });
  }
  return out as E.PromptList;
}
const send = (ev: string, ...args: unknown[]) => framePost({ dlEvent: ev, args });
async function generate(c: Ctx, cfgIn: unknown, raw: boolean) {
  void c;
  const cfg = isObj(cfgIn) ? cfgIn : {}, id = str(cfg.generation_id) || uid(), conn = connOf(cfg);
  if (!conn) return fail('noConn');
  const ac = new AbortController(); gens.set(id, ac);
  const { P } = paramsOf(cfg);
  try {
    if (injects.size) await runFilters();
    const messages = raw ? rawMessages(cfg) : normalMessages(cfg);
    if (macros.length) for (const m of messages) m.content = applyMacros(m.content, { role: m.role });
    send('js_generation_started', id);
    let full = '', think = '', last = 0, timer = 0, sent = 0;
    const stream = !!cfg.should_stream;
    const flush = () => { timer = 0; last = Date.now(); const d = full.slice(sent); sent = full.length; if (d) { send('js_stream_token_received_incrementally', d, id); send('js_stream_token_received_fully', full, id); } };
    const r = await E.streamChat(conn, { ...P, stream }, messages, {
      signal: ac.signal, label: 'script ' + (raw ? 'generateRaw' : 'generate'),
      // 조각마다 화면에 보내지 않고 짧게 모아 보낸다 (스트리밍 중 화면 사이 왕래를 줄인다)
      onText: stream ? (d: string) => { full += d; if (!timer) timer = window.setTimeout(flush, Math.max(0, 60 - (Date.now() - last))); } : undefined,
      onThink: (d: string) => { think += d; },
    });
    if (timer) { clearTimeout(timer); flush(); }
    const sp = E.splitThink(r.text), text = sp.text.trim(), reasoning = (r.think || think || sp.think || '').trim();
    send('js_generation_ended', text, id);
    return cfg.should_return_reasoning ? { content: text, reasoning } : text;
  } finally { gens.delete(id); }
}

type F = (c: Ctx, ...a: unknown[]) => unknown;
export const gen: Record<string, F> = {
  injectPrompts: (c, list, opt) => inject(c, list, opt),
  uninjectPrompts: (_c, ids) => { for (const id of Array.isArray(ids) ? ids : []) injects.delete(str(id)); },
  registerMacroLike: (c, re, fn) => register(c, re, fn),
  unregisterMacroLike: (_c, re) => unregister(re),
  generate: (c, cfg) => generate(c, cfg, false),
  generateRaw: (c, cfg) => generate(c, cfg, true),
  stopGenerationById: (_c, id) => { const a = gens.get(str(id)); if (!a) return false; a.abort(); return true; },
  stopAllGeneration: () => { const any = gens.size > 0 || cur.busy; for (const a of gens.values()) a.abort(); chatApi.stop?.(); emit('th:stop'); return any; },
  getProxyPresetNames: () => [],
  getModelList: async (_c, api) => {
    const a = isObj(api) ? api : {}; if (!a.apiurl) return [];
    return E.listModels({ id: 'th-models', name: 'script', provider: 'openai', baseUrl: str(a.apiurl), apiKey: str(a.key || ''), model: '', proxy: false, postProcess: 'none', extraHeaders: '', extraBody: '', cache: false } as Conn);
  },
};
/** 스크립트 매크로가 하나라도 있는가 (substitudeMacros 가 함께 푼다) */
export const hasMacros = () => mAlive();
