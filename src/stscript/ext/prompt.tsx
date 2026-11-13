// 실리태번 명령 묶음: prompt — API · 모델 · 연결 프로필 · 프리셋 · 인스트럭트/컨텍스트/시스템 프롬프트 템플릿 · 프롬프트 주입 · 프롬프트 항목 · 생각 과정 · 중지 문자열 · 비밀 키
// 드림랜드에서 "API" 는 연결(S.conns)의 제공자, "모델" 은 그 연결의 모델이다. 비밀 키는 연결마다 하나 — 값은 절대 돌려주지 않는다.
import { S, Secrets, on, uid } from '../../lib/core';
import { X } from '../../lib/hooks';
import * as E from '../../lib/engine';
import * as A from '../../lib/advanced';
import { openModal } from '../../ui';
import { t } from '../../i18n';
import { chatApi, redraw } from '../../chat/actions';
import type { Chat, Conn, Msg, Preset } from '../../lib/types';
import { parse } from '../parse';
import { Scope, callClosure, def, isBound, str, type Args, type Ctx, type Val } from '../run';

// ════════ 값 다루기 ════════
const N = (a: Args, k: string, d = '') => a.named[k] === undefined ? d : str(a.named[k]);
const isTrue = (s: unknown) => ['on', 'true', '1', 'yes'].includes(String(s ?? '').trim().toLowerCase());
const isFalse = (s: unknown) => ['off', 'false', '0', 'no'].includes(String(s ?? '').trim().toLowerCase());
const arg = (a: Args) => a.given ? str(a.unnamed).trim() : '';
const warn = (c: Ctx, key: string, vars?: Record<string, unknown>) => c.host.echo(t('st.x.prompt.' + key, vars), 'warning');
const ok = (c: Ctx, quiet: boolean, key: string, vars?: Record<string, unknown>) => { if (!quiet) c.host.echo(t('st.x.prompt.' + key, vars), 'success'); };
const cur = () => chatApi.current() as { chat: Chat | null; msgs: Msg[] };
const chatNow = () => cur().chat;
/** 이름으로 찾기: 똑같은 것 → 앞이 같은 것 → 들어 있는 것 (실리태번의 흐린 찾기 대신) */
function fuzzy<T>(list: T[], name: string, key: (x: T) => string): T | undefined {
  const k = name.trim().toLowerCase(); if (!k) return undefined;
  return list.find(x => key(x).toLowerCase() === k) || list.find(x => key(x).toLowerCase().startsWith(k)) || list.find(x => key(x).toLowerCase().includes(k));
}
const F = () => A.AF();
const saveSettings = () => S.set({});
const conn = (): Conn | undefined => S.connFor(chatNow());
const preset = (): Preset => S.presetFor(chatNow());
/** "0-3" · "-1" · "2" → 메시지 번호들 (비우면 마지막 하나) */
function range(spec: string, n: number): number[] {
  const s = spec.trim(); if (!s) return n ? [n - 1] : [];
  const m = /^(-?\d+)\s*-\s*(-?\d+)$/.exec(s), fix = (x: number) => x < 0 ? n + x : x;
  if (m) { const a = fix(+m[1]), b = fix(+m[2]), out: number[] = []; for (let i = Math.max(0, a); i <= Math.min(n - 1, b); i++) out.push(i); return out; }
  const i = fix(+s); return Number.isInteger(i) && i >= 0 && i < n ? [i] : [];
}
const provName = (id: string) => E.PROVIDERS[id]?.name || id;
/** 실리태번의 API 이름(openai · claude · makersuite …)을 드림랜드 제공자로 */
const API_ALIAS: Record<string, string> = { claude: 'anthropic', makersuite: 'google', gemini: 'google', mistral: 'mistralai', textgenerationwebui: 'textcomp', kobold: 'koboldclassic', koboldcpp: 'koboldcpp', ooba: 'ooba', 'llama.cpp': 'llamacpp', tabbyapi: 'tabby', aphrodite: 'aphrodite', ollama: 'ollama', vllm: 'vllm', lmstudio: 'lmstudio', grok: 'xai', nanogpt: 'nanogpt', together: 'togetherai' };
function providerOf(name: string): string | undefined {
  const k = name.trim().toLowerCase().replace(/^api_key_/, ''); if (!k) return undefined;
  if (E.PROVIDERS[k]) return k;
  if (API_ALIAS[k]) return API_ALIAS[k];
  return Object.keys(E.PROVIDERS).find(id => provName(id).toLowerCase() === k) || Object.keys(E.PROVIDERS).find(id => provName(id).toLowerCase().includes(k));
}

// ════════ API · 모델 ════════
def('api', {
  help: '',
  run(a, c) {
    const name = arg(a), quiet = isTrue(N(a, 'quiet')), now = conn();
    if (!name) return now?.provider || '';
    // 연결 이름을 그대로 써도 받아 준다. 아니면 그 제공자를 쓰는 연결로 바꾼다 (지금 연결이 이미 그 제공자면 그대로)
    const byName = fuzzy(S.conns, name, x => x.name), prov = providerOf(name);
    const target = prov ? (now?.provider === prov ? now : S.conns.find(x => x.provider === prov)) : byName;
    if (!target) { warn(c, prov ? 'noConnFor' : 'apiNotFound', { name: prov ? provName(prov) : name }); return ''; }
    if (S.settings.activeConn !== target.id) S.set({ activeConn: target.id });
    ok(c, quiet, 'apiSet', { name: `${target.name} (${provName(target.provider)})` });
    return target.provider;
  },
});
def('api-url', {
  help: '', alias: ['server'],
  async run(a, c) {
    const url = arg(a), quiet = isTrue(N(a, 'quiet')), api = N(a, 'api').trim();
    let target = conn();
    if (api) { const prov = providerOf(api); target = prov ? (target?.provider === prov ? target : S.conns.find(x => x.provider === prov)) : undefined; if (!target) { warn(c, 'noConnFor', { name: api }); return ''; } }
    if (!target) { warn(c, 'noConn'); return ''; }
    if (!url) return target.baseUrl || E.PROVIDERS[target.provider]?.base || '';
    target.baseUrl = url.replace(/\/+$/, ''); await S.save('conns', target);
    ok(c, quiet, 'urlSet', { name: target.name, url: target.baseUrl });
    return target.baseUrl;
  },
});
def('model', {
  help: '',
  async run(a, c) {
    const name = arg(a), quiet = isTrue(N(a, 'quiet')), target = conn();
    if (!target) { warn(c, 'noConn'); return ''; }
    if (!name) return target.model || '';
    const known = E.PROVIDERS[target.provider]?.models || [], pick = known.find(m => m.toLowerCase() === name.toLowerCase()) || name;
    target.model = pick; await S.save('conns', target);
    ok(c, quiet, 'modelSet', { name: pick });
    return pick;
  },
});
def('tokenizer', {
  help: '',
  run(a, c) {
    // 드림랜드는 글자 수로 어림하는 셈법 하나만 쓴다
    if (arg(a) && arg(a).toLowerCase() !== 'estimate') warn(c, 'tokenizerFixed');
    return 'estimate';
  },
});
def('proxy', {
  help: '',
  async run(a, c) {
    const v = arg(a), target = conn();
    if (!target) { warn(c, 'noConn'); return ''; }
    const state = () => target.proxy ? 'on' : 'off';
    if (!v) return state();
    // 실리태번의 리버스 프록시 프리셋 대신 "드림랜드 서버를 거쳐 연결" 을 켜고 끈다
    if (isTrue(v)) target.proxy = true; else if (isFalse(v) || v.toLowerCase() === 'none') target.proxy = false;
    else { warn(c, 'proxyOnOff'); return state(); }
    await S.save('conns', target);
    ok(c, false, target.proxy ? 'proxyOn' : 'proxyOff', { name: target.name });
    return state();
  },
});
def(['prompt-post-processing'], {
  help: '', alias: ['ppp'],
  async run(a, c) {
    const v = arg(a).toLowerCase(), target = conn();
    if (!target) { warn(c, 'noConn'); return ''; }
    if (!v) return target.postProcess || 'none';
    const map: Record<string, string> = { none: 'none', '': 'none', merge: 'merge', semi: 'semi', strict: 'strict', single: 'single', claude: 'merge' };
    if (!(v in map)) { warn(c, 'pppBad', { name: v }); return target.postProcess || 'none'; }
    target.postProcess = map[v]; await S.save('conns', target);
    return target.postProcess;
  },
});

// ════════ 연결 프로필 ════════
type Profile = { id: string; name: string; connId: string; model: string; presetId: string; tpl: Record<string, string>; instructOn: boolean | null | string };
const NONE = '<None>';
let lastProfile = '';
const flow = () => import('../../flow/logic');
async function currentProfile(): Promise<Profile | null> {
  const L = await flow(), list = L.profiles();
  return list.find(p => p.id === lastProfile && L.matches(p)) || L.boundProfile(chatNow() as never) || list.find(p => L.matches(p)) || null;
}
async function profileBy(name: string): Promise<Profile | null> {
  const L = await flow(); return L.findProfile(name) || fuzzy(L.profiles(), name, p => p.name) || null;
}
def('profile', {
  help: '',
  async run(a, c) {
    const name = arg(a), L = await flow();
    if (!name) return (await currentProfile())?.name || NONE;
    if (name === NONE) { lastProfile = ''; return NONE; }
    const p = await profileBy(name);
    if (!p) { warn(c, 'profileNotFound', { name }); return ''; }
    const pending = L.applyProfile(p, true).then(miss => { if (miss.length) warn(c, 'profileMiss', { name: p.name, miss: miss.join(', ') }); });
    if (!isFalse(N(a, 'await', 'true'))) await pending;
    lastProfile = p.id;
    return p.name;
  },
});
def('profile-list', { help: '', run: async () => JSON.stringify((await flow()).profiles().map(p => p.name)) });
def('profile-create', {
  help: '',
  async run(a, c) {
    const name = arg(a), L = await flow();
    if (!name) { warn(c, 'profileNoName'); return ''; }
    if (L.profiles().some(p => p.name === name)) { warn(c, 'profileExists', { name }); return ''; }
    const p = L.snapshot(name), list = L.profiles(); list.push(p); S.set({ profiles: list }); lastProfile = p.id;
    return p.name;
  },
});
def('profile-update', {
  help: '',
  async run(_a, c) {
    const L = await flow(), p = L.profiles().find(x => x.id === lastProfile) || L.boundProfile(chatNow() as never);
    if (!p) { warn(c, 'profileNone'); return ''; }
    const snap = L.snapshot(p.name); Object.assign(p, { ...snap, id: p.id, name: p.name }); S.set({ profiles: L.profiles() });
    return p.name;
  },
});
def('profile-get', {
  help: '',
  async run(a, c) {
    const name = arg(a), p = name ? await profileBy(name) : await currentProfile();
    if (!p) { if (name) warn(c, 'profileNotFound', { name }); return ''; }
    return JSON.stringify(p);
  },
});
def('profile-genstream', {
  help: '',
  async run(a, c) {
    const prompt = arg(a); if (!prompt) return '';
    const name = N(a, 'profile').trim(), p = name ? await profileBy(name) : await currentProfile();
    if (name && !p) { warn(c, 'profileNotFound', { name }); return ''; }
    const base = p?.connId ? S.get('conns', p.connId) : conn();
    if (!base) { c.host.echo(t('st.x.prompt.noConn'), 'error'); return ''; }
    const target: Conn = p?.model ? { ...base, model: p.model } : base;
    const pre = (p?.presetId && S.get('presets', p.presetId)) || preset();
    const system = N(a, 'system'), maxTokens = Number(N(a, 'length', '2048')) || 2048, withThink = isTrue(N(a, 'reasoning'));
    const label = N(a, 'generating', t('st.x.prompt.generating')), done = N(a, 'completed', t('st.x.prompt.generated'));
    const dl = N(a, 'delay', '3000').trim().toLowerCase(), delay = dl === 'infinite' || Number(dl) < 0 ? null : (Number(dl) >= 0 ? Number(dl) : 3000);
    const showStop = !isFalse(N(a, 'stop', 'true')), onStop = a.named.onStop, onComplete = a.named.onComplete;
    const ctl = new AbortController(); let finished = false, text = '', think = '';
    let thinkEl: HTMLPreElement | null = null, textEl: HTMLDivElement | null = null;
    const head: { el: HTMLDivElement | null } = { el: null }, setTitle = (s: string) => { if (head.el) head.el.textContent = s; };
    const paint = () => { if (thinkEl) { thinkEl.textContent = think; (thinkEl.parentElement as HTMLElement).hidden = !think; } if (textEl) textEl.textContent = text; };
    const stop = async () => { if (finished || ctl.signal.aborted) return; ctl.abort(); if (isBound(onStop)) { try { await callClosure(onStop, c); } catch (e) { console.warn('[profile-genstream]', e); } } };
    const m = openModal({ title: '', onClose: () => { void stop(); },
      body: <div><div className="dim" ref={el => { head.el = el; }}>{label}</div><details className="reason"><summary>{t('chat.msg.reasoning')}</summary><pre className="pre-wrap" ref={el => { thinkEl = el; }} /></details><div className="pre-wrap" ref={el => { textEl = el; paint(); }} /></div>,
      actions: showStop ? [{ label: t('st.x.prompt.stop'), onclick: () => { void stop(); } }] : [] });
    const result = () => withThink && think ? fmtReasoning(think, text) : text;
    try {
      const msgs = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] as unknown as Parameters<typeof E.streamChat>[2];
      const r = await E.streamChat(target, { ...pre.params, maxTokens, prefill: '' }, msgs, { signal: ctl.signal, onText: d => { text += d; paint(); }, onThink: d => { think += d; paint(); } });
      const sp = E.splitThink(r.text || text); text = sp.text; think = r.think || think || sp.think; finished = true; paint();
      setTitle(done);
    } catch (e) {
      finished = true;
      if (ctl.signal.aborted) { setTitle(t('st.x.prompt.stopped', { label })); return result(); }
      m.close(); c.host.echo(e instanceof Error ? e.message : String(e), 'error'); return '';
    }
    if (delay !== null) setTimeout(() => m.close(), delay);
    if (isBound(onComplete)) { try { await callClosure(onComplete, c); } catch (e) { console.warn('[profile-genstream]', e); } }
    if (!text) { warn(c, 'empty'); return ''; }
    return result();
  },
});

// ════════ 프리셋 ════════
def('preset', {
  help: '',
  run(a, c) {
    const name = arg(a), quiet = isTrue(N(a, 'quiet'));
    if (!name) return preset().name;
    const p = fuzzy(S.presets, name, x => x.name);
    if (!p) { warn(c, 'presetNotFound', { name }); return ''; }
    S.set({ activePreset: p.id });
    if (preset().id !== p.id) warn(c, 'presetBound', { name: preset().name });
    ok(c, quiet, 'presetSet', { name: p.name });
    return p.name;
  },
});

// ════════ 고급 포맷팅 템플릿 ════════
/** 템플릿 고르기 · 지금 이름 */
function tplCmd(kind: 'instruct' | 'context' | 'sysprompt' | 'reasoning', enable: boolean) {
  return (a: Args, c: Ctx) => {
    const name = arg(a), quiet = isTrue(N(a, 'quiet')), slot = (F() as unknown as Record<string, { name?: string; enabled?: boolean }>)[kind];
    if (!name) return enable && slot.enabled === false && !isTrue(N(a, 'forceGet')) ? '' : slot.name || '';
    const found = fuzzy(A.tplList(kind), name, x => String(x.name || ''));
    if (!found?.name) { warn(c, 'tplNotFound', { kind: A.KINDS[kind], name }); return ''; }
    A.tplApply(kind, String(found.name));
    if (enable) slot.enabled = true;
    saveSettings();
    ok(c, quiet, 'tplSet', { kind: A.KINDS[kind], name: found.name });
    return String(found.name);
  };
}
/** 켜기 · 끄기 · 바꾸기 */
function stateCmd(kind: 'instruct' | 'sysprompt') {
  return (a: Args) => {
    const slot = (F() as unknown as Record<string, { enabled?: boolean }>)[kind], v = arg(a).toLowerCase();
    if (v) { slot.enabled = isTrue(v) ? true : isFalse(v) ? false : slot.enabled === false; saveSettings(); }
    return String(slot.enabled !== false);
  };
}
const setOn = (kind: 'instruct' | 'sysprompt', on_: boolean) => () => { (F() as unknown as Record<string, { enabled?: boolean }>)[kind].enabled = on_; saveSettings(); return ''; };
def('instruct', { help: '', run: tplCmd('instruct', true) });
def('instruct-on', { help: '', run: setOn('instruct', true) });
def('instruct-off', { help: '', run: setOn('instruct', false) });
def('instruct-state', { help: '', alias: ['instruct-toggle'], run: stateCmd('instruct') });
def('context', { help: '', run: tplCmd('context', false) });
def('sysprompt', { help: '', alias: ['system-prompt'], run: tplCmd('sysprompt', true) });
def('sysprompt-on', { help: '', alias: ['sysprompt-enable'], run: setOn('sysprompt', true) });
def('sysprompt-off', { help: '', alias: ['sysprompt-disable'], run: setOn('sysprompt', false) });
def('sysprompt-state', { help: '', alias: ['sysprompt-toggle'], run: stateCmd('sysprompt') });
def('reasoning-template', { help: '', alias: ['reasoning-formatting', 'reasoning-preset'], run: tplCmd('reasoning', false) });

def('stop-strings', {
  help: '', alias: ['stopping-strings', 'custom-stopping-strings', 'custom-stop-strings'],
  run(a) {
    const force = isTrue(N(a, 'force')); let v = arg(a); const f = F();
    if (!force && !v) return JSON.stringify(f.stopStrings || []);
    if (force && !v) v = '[]';
    let list: unknown; try { list = JSON.parse(v); } catch { list = null; }
    if (!Array.isArray(list)) throw new Error(t('st.x.prompt.badList'));
    f.stopStrings = list.map(x => String(x)); saveSettings();
    return JSON.stringify(f.stopStrings);
  },
});
def('start-reply-with', {
  help: '',
  run(a) {
    const force = isTrue(N(a, 'force')), v = a.given ? str(a.unnamed) : '', f = F();
    if (!force && !v) return f.startReplyWith || '';
    f.startReplyWith = v; saveSettings();
    return v;
  },
});

// ════════ 프롬프트 주입 (/inject) ════════
// 대화방에 chat.stInjects 로 저장하고, 프롬프트 조각(X.prompt)으로 실제 프롬프트에 넣는다
interface Inject { value: string; position: 'before' | 'after' | 'chat' | 'none'; depth: number; scan: boolean; role: string; filter?: string | null }
const OWNER = 'stscript-inject';
const injectsOf = (chat: Chat | null | undefined, make = false): Record<string, Inject> | undefined => {
  if (!chat) return undefined;
  if (make && !chat.stInjects) chat.stInjects = {};
  return chat.stInjects as Record<string, Inject> | undefined;
};
const saveChat = async (chat: Chat) => { await S.save('chats', chat, true); };
/** 필터 결과 (생성 전에 미리 돌려 둔다: 프롬프트 조각은 기다릴 수 없다) */
const filterOk = new Map<string, boolean>();
const truthy = (s: string) => !['', 'false', 'off', '0', 'no', 'null', 'undefined'].includes(s.trim().toLowerCase());
async function runFilter(src: string): Promise<boolean> {
  const cl = parse('/pass ' + src)[0]?.unnamed[0];
  if (!cl || typeof cl !== 'object') return true;
  const { appHost } = await import('../host');
  const scope = new Scope(null);
  return truthy(await callClosure({ kind: 'bound', closure: cl, scope }, { host: appHost(), scope, pipe: '', depth: 0 }));
}
X.prompt = X.prompt.filter(p => p.owner !== OWNER);
X.prompt.push({ owner: OWNER, fn: ({ chat }) => {
  const list = injectsOf(chat); if (!list) return [];
  return Object.entries(list).filter(([id, j]) => j.value && j.position !== 'none' && (!j.filter || filterOk.get(chat.id + ':' + id) !== false))
    .map(([id, j]) => j.position === 'chat'
      ? { where: 'depth' as const, role: j.role, content: j.value, depth: j.depth, order: 100, src: 'inject: ' + id }
      : { where: 'before' as const, role: 'system', content: j.value, order: j.position === 'before' ? 0 : 100, src: 'inject: ' + id });
} });
X.before = X.before.filter(b => b.owner !== OWNER);
X.before.push({ owner: OWNER, fn: async ({ chat }) => {
  for (const [id, j] of Object.entries(injectsOf(chat) || {})) if (j.filter) { try { filterOk.set(chat.id + ':' + id, await runFilter(j.filter)); } catch (e) { console.warn('[inject filter]', id, e); filterOk.set(chat.id + ':' + id, false); } }
} });
/** 한 번만 쓰는 주입: 생성이 끝나면 지운다 */
const ephemeral = new Set<string>();
on('generate:end', async (d: unknown) => {
  const chat = (d as { chat?: Chat })?.chat; if (!chat || !ephemeral.size) return;
  const list = injectsOf(chat); let touched = false;
  for (const key of [...ephemeral]) { const [cid, id] = key.split('\u0000'); if (cid !== chat.id) continue; ephemeral.delete(key); if (list?.[id]) { delete list[id]; touched = true; } }
  if (touched) await saveChat(chat);
});

def('inject', {
  help: '',
  async run(a, c) {
    const chat = chatNow(); if (!chat) throw new Error(t('qr.run.noChat'));
    const id = N(a, 'id').trim() || uid();
    const pos = N(a, 'position', 'after').trim().toLowerCase(), position = (['before', 'after', 'chat', 'none'].includes(pos) ? pos : 'after') as Inject['position'];
    const dn = Number(N(a, 'depth', '4')), depth = isNaN(dn) ? 4 : dn;
    const rv = N(a, 'role', 'system').trim().toLowerCase(), role = ({ system: 'system', user: 'user', assistant: 'assistant', '0': 'system', '1': 'user', '2': 'assistant' } as Record<string, string>)[rv] || 'system';
    const fv: Val | undefined = a.named.filter;
    if (fv !== undefined && !(isBound(fv) ? fv.closure.src : str(fv)).trim()) throw new Error(t('st.x.prompt.badFilter'));
    const filter = fv === undefined ? null : isBound(fv) ? fv.closure.src : str(fv);
    const value = a.given ? str(a.unnamed) : '';
    const list = injectsOf(chat, true)!;
    if (value) list[id] = { value, position, depth, scan: isTrue(N(a, 'scan')), role, filter }; else delete list[id];
    filterOk.delete(chat.id + ':' + id);
    if (value && isTrue(N(a, 'ephemeral'))) ephemeral.add(chat.id + '\u0000' + id);
    await saveChat(chat);
    if (value && isTrue(N(a, 'scan'))) warn(c, 'scanNo');
    return id;
  },
});
def('listinjects', {
  help: '',
  async run(a, c) {
    const list = injectsOf(chatNow()) || {}, how = N(a, 'return', 'popup-html').trim().toLowerCase();
    if (how === 'object') return JSON.stringify(list);
    const lines = Object.entries(list).map(([id, j]) => `* ${id}: ${j.value} (${j.position}, ${t('st.x.prompt.depth')}: ${j.depth}, scan: ${!!j.scan}, role: ${j.role})`);
    const text = `${t('st.x.prompt.injectsTitle')}\n${lines.join('\n') || t('st.x.prompt.injectsNone')}`;
    if (how === 'none') return '';
    if (how.startsWith('chat')) { await (c.host.comment as (s: string) => Promise<string>)(text); return ''; }
    if (how === 'toast-html' || how === 'toast-text') { c.host.echo(text); return ''; }
    if (how === 'console') { console.log(text); return ''; }
    if (how === 'pipe') return text;
    await (c.host.popup as (s: string) => Promise<string>)(text);
    return '';
  },
});
def('flushinject', {
  help: '', alias: ['flushinjects'],
  async run(a) {
    const chat = chatNow(), list = injectsOf(chat); if (!chat || !list) return '';
    let id = arg(a);
    if (id && !(id in list)) { const v = chat.vars?.[id] ?? S.settings.globalVars?.[id]; if (v !== undefined && String(v) in list) id = String(v); }
    for (const k of Object.keys(list)) if (!id || k === id) delete list[k];
    await saveChat(chat);
    return '';
  },
});

// ════════ 프롬프트 항목 (프리셋 블록) ════════
/** 실리태번 identifier = 드림랜드 블록의 종류(main · chatHistory …) 또는 블록 id */
const blockKey = (b: Preset['blocks'][number]) => b.kind && b.kind !== 'text' ? b.kind : b.id;
function listArg(v: Val | undefined): string[] {
  if (v === undefined) return [];
  const s = str(v); try { const j = JSON.parse(s); return Array.isArray(j) ? j.map(String) : [s]; } catch { return [s]; }
}
function pickBlocks(a: Args) {
  const p = preset(), blocks = p.blocks || [];
  const ids = listArg(a.named.identifier), names = listArg(a.named.name);
  const out = new Map<string, Preset['blocks'][number]>();
  for (const id of ids) for (const b of blocks) if (blockKey(b) === id || b.id === id) out.set(blockKey(b), b);
  for (const n of names) for (const b of blocks) if (b.name === n) out.set(blockKey(b), b);
  return { p, out };
}
def('getpromptentry', {
  help: '', alias: ['getpromptentries'],
  run(a) {
    const { out } = pickBlocks(a); let how = N(a, 'return', 'simple');
    if (how === 'simple' && out.size > 1) how = a.named.identifier !== undefined ? 'dict' : 'list';
    if (!out.size) return '';
    if (how === 'list') return JSON.stringify([...out.values()].map(b => !!b.enabled));
    if (how === 'dict') return JSON.stringify(Object.fromEntries([...out].map(([k, b]) => [k, !!b.enabled])));
    return String(!![...out.values()][0].enabled);
  },
});
def('setpromptentry', {
  help: '', alias: ['setpromptentries'],
  async run(a) {
    const { p, out } = pickBlocks(a); if (!out.size) return '';
    const v = (a.given ? str(a.unnamed) : '').trim().toLowerCase();
    for (const b of out.values()) b.enabled = ['toggle', 't', ''].includes(v) ? !b.enabled : isTrue(v) ? true : isFalse(v) ? false : b.enabled;
    await S.save('presets', p);
    return '';
  },
});
def('pm-render', { help: '', run: async () => { await S.save('presets', preset()); return ''; } });

// ════════ 생각 과정 ════════
const rz = () => F().reasoning || {};
function fmtReasoning(reasoning: string, content: string) { const r = rz(); return `${r.prefix || ''}${reasoning}${r.suffix || ''}${r.separator || ''}${content}`; }
const msgAt = (v: string): Msg | undefined => { const { msgs } = cur(), n = parseInt(v, 10); return msgs[isNaN(n) ? msgs.length - 1 : n < 0 ? msgs.length + n : n]; };
def('reasoning-get', { help: '', alias: ['get-reasoning'], run: a => { const m = msgAt(arg(a)); return String(m?.swipes[m.sw]?.reasoning ?? ''); } });
def('reasoning-set', {
  help: '', alias: ['set-reasoning'],
  async run(a) {
    const m = msgAt(N(a, 'at')); if (!m) return '';
    const sw = m.swipes[m.sw]; sw.reasoning = a.given ? str(a.unnamed) : ''; sw.reasoningType = 'manual';
    await chatApi.save(); redraw(m, true);
    const col = N(a, 'collapse');
    if (isTrue(col) || isFalse(col)) requestAnimationFrame(() => detailsOf(m).forEach(d => { d.open = isFalse(col); }));
    return sw.reasoning;
  },
});
function parseReasoning(text: string, strict: boolean): { reasoning: string; content: string } | null {
  const r = rz(), pre = String(r.prefix || ''), suf = String(r.suffix || '');
  const body = strict ? text.replace(/^\s+/, '') : text, at = body.indexOf(pre);
  if (at < 0 || (strict && at !== 0)) return null;
  const end = body.indexOf(suf, at + pre.length); if (end < 0) return null;
  return { reasoning: body.slice(at + pre.length, end).trim(), content: (body.slice(0, at) + body.slice(end + suf.length)).replace(/^\s+/, '') };
}
def('reasoning-parse', {
  help: '', alias: ['parse-reasoning'],
  run(a, c) {
    const v = a.given ? str(a.unnamed) : ''; if (!v) return '';
    const r = rz(); if (!r.prefix || !r.suffix) { warn(c, 'needPrefix'); return v; }
    const how = N(a, 'return', 'reasoning'); if (!['reasoning', 'content'].includes(how)) warn(c, 'badReturn', { name: how });
    const p = parseReasoning(v, !isFalse(N(a, 'strict')));
    if (!p) return how === 'content' ? v : '';
    if (how === 'content') return p.content;
    return isFalse(N(a, 'regex')) ? p.reasoning : E.applyRegex(p.reasoning, { who: 'reason', target: 'store', chat: chatNow() });
  },
});
def('reasoning-format', {
  help: '', alias: ['format-reasoning'],
  run(a, c) {
    const reasoning = N(a, 'reasoning'), content = a.given ? str(a.unnamed) : '', r = rz();
    if (!r.prefix || !r.suffix) { warn(c, 'needPrefix'); return ''; }
    if (!reasoning) { warn(c, 'needReasoning'); return ''; }
    return fmtReasoning(reasoning, content);
  },
});
const detailsOf = (m: Msg) => [...document.querySelectorAll<HTMLDetailsElement>(`article[data-id="${CSS.escape(m.id)}"] details.reason`)];
function visCmd(mode: 'collapse' | 'expand' | 'toggle') {
  return (a: Args, c: Ctx) => {
    const { msgs } = cur(), idx = range(arg(a), msgs.length);
    if (!idx.length) { warn(c, 'badRange', { name: arg(a) }); return ''; }
    const els = idx.flatMap(i => detailsOf(msgs[i]));
    if (!els.length) { warn(c, 'noReasoning'); return ''; }
    for (const d of els) d.open = mode === 'expand' ? true : mode === 'collapse' ? false : !d.open;
    return '';
  };
}
def('reasoning-collapse', { help: '', alias: ['collapse-reasoning'], run: visCmd('collapse') });
def('reasoning-expand', { help: '', alias: ['expand-reasoning'], run: visCmd('expand') });
def('reasoning-toggle', { help: '', alias: ['toggle-reasoning'], run: visCmd('toggle') });

// ════════ 비밀 키 ════════
// 실리태번: 키 이름(api_key_openai …)마다 비밀 여러 개, 그중 하나가 활성. 드림랜드: 연결마다 키 하나.
// 그래서 "키 이름" = 제공자, "비밀" = 그 제공자를 쓰는 연결(id · 이름), "활성" = 지금 연결. 값은 꼬리만 가려서 보인다.
function secretScope(a: Args, c: Ctx, quiet: boolean): { prov: string; list: Conn[]; active?: Conn } | null {
  const key = N(a, 'key').trim(), now = conn(), prov = key ? providerOf(key) : now?.provider;
  if (!prov) { if (!quiet) c.host.echo(t('st.x.prompt.noKey'), 'error'); return null; }
  const list = S.conns.filter(x => x.provider === prov);
  return { prov, list, active: now?.provider === prov ? now : list[0] };
}
const findSecret = (list: Conn[], id: string) => list.find(x => x.id === id) || list.find(x => x.name === id);
const hasKey = (x: Conn) => !!x.apiKey || Secrets.has(x.id, 'apiKey');
const mask = (x: Conn) => { const tail = Secrets.is(x.apiKey) ? Secrets.tail(x.id, 'apiKey') : String(x.apiKey || '').slice(-4); return hasKey(x) ? '••••' + (tail || '') : ''; };
def('secret-id', {
  help: '', alias: ['secret-rotate'],
  run(a, c) {
    const quiet = isTrue(N(a, 'quiet')), sc = secretScope(a, c, quiet); if (!sc) return '';
    if (!sc.list.length) { if (!quiet) c.host.echo(t('st.x.prompt.noSecrets', { key: provName(sc.prov) }), 'error'); return ''; }
    const id = arg(a); if (!id) return sc.active?.id || '';
    const s = findSecret(sc.list, id); if (!s) { if (!quiet) c.host.echo(t('st.x.prompt.secretNotFound', { id }), 'error'); return ''; }
    S.set({ activeConn: s.id });
    ok(c, quiet, 'secretActive', { name: s.name });
    return s.id;
  },
});
def('secret-delete', {
  help: '',
  async run(a, c) {
    const quiet = isTrue(N(a, 'quiet')), sc = secretScope(a, c, quiet); if (!sc) return '';
    const id = arg(a), s = (id && findSecret(sc.list, id)) || sc.active;
    if (!s) { if (!quiet) c.host.echo(t('st.x.prompt.noSecrets', { key: provName(sc.prov) }), 'error'); return ''; }
    if (Secrets.is(s.apiKey)) await Secrets.del(s.id, 'apiKey');
    s.apiKey = ''; await S.save('conns', s);
    ok(c, quiet, 'secretDeleted', { name: s.name });
    return s.id;
  },
});
def('secret-write', {
  help: '',
  async run(a, c) {
    const quiet = isTrue(N(a, 'quiet')), sc = secretScope(a, c, quiet); if (!sc) return '';
    const value = (a.given ? str(a.unnamed) : '').trim();
    if (!value && !isTrue(N(a, 'empty'))) { if (!quiet) c.host.echo(t('st.x.prompt.noValue'), 'error'); return ''; }
    // 새 비밀 = 같은 제공자의 새 연결 (지금 연결의 주소 · 모델을 이어받는다)
    const from = sc.active, label = N(a, 'label').trim() || new Date().toLocaleString();
    const nc: Conn = { ...(from || {}), id: uid(), name: label, provider: sc.prov, baseUrl: from?.baseUrl || '', model: from?.model || E.PROVIDERS[sc.prov]?.models?.[0] || '', apiKey: '', proxy: !!from?.proxy, postProcess: from?.postProcess || 'none', extraHeaders: from?.extraHeaders || '', extraBody: from?.extraBody || '', cache: !!from?.cache } as Conn;
    delete nc.sec; delete nc.serviceAccount;
    const hosts = Secrets.hostsFor(nc, E.PROVIDERS[sc.prov]?.base || '');
    nc.apiKey = value && Secrets.on && hosts.length ? await Secrets.put(nc.id, 'apiKey', value, hosts, label) : value;
    await S.save('conns', nc);
    ok(c, quiet, 'secretWritten', { key: provName(sc.prov) });
    return nc.id;
  },
});
def('secret-rename', {
  help: '',
  async run(a, c) {
    const quiet = isTrue(N(a, 'quiet')), sc = secretScope(a, c, quiet); if (!sc) return '';
    const label = (a.given ? str(a.unnamed) : '').trim();
    if (!label) { if (!quiet) c.host.echo(t('st.x.prompt.noLabel'), 'error'); return ''; }
    const id = N(a, 'id').trim(), s = (id && findSecret(sc.list, id)) || sc.active;
    if (!s) { if (!quiet) c.host.echo(t('st.x.prompt.noSecrets', { key: provName(sc.prov) }), 'error'); return ''; }
    s.name = label; await S.save('conns', s);
    ok(c, quiet, 'secretRenamed', { name: label });
    return s.id;
  },
});
def('secret-read', {
  help: '', alias: ['secret-find', 'secret-get'],
  run(a, c) {
    const quiet = isTrue(N(a, 'quiet')), sc = secretScope(a, c, quiet); if (!sc) return '';
    const id = arg(a), s = (id && findSecret(sc.list, id)) || sc.active;
    if (!s) { if (!quiet) c.host.echo(t('st.x.prompt.noSecrets', { key: provName(sc.prov) }), 'error'); return ''; }
    // 키 값은 스크립트에 내주지 않는다: 가린 꼬리만 돌려준다
    if (!quiet) warn(c, 'secretMasked');
    return mask(s);
  },
});
