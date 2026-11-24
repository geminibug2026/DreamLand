// 메시지 속 HTML 화면(iframe)이 부르는 실리태번 JS 러너 도우미를 실제로 처리한다 (vendor/th-shim.js 의 짝)
import type { Msg } from '../lib/types';
import { DB, S, msgText, newMsg, on } from '../lib/core';
import { bridgeFrames, frameHooks, framePost, frameSource } from '../lib/format';
import * as TH from '../lib/thscripts';
import { toast } from '../ui';
import { t } from '../i18n';
import { bump, cur } from './store';
import { chatApi } from './actions';
import { appHost, runQrScript } from '../stscript/host';
import { appCalls, hasListeners, onFrameMessage, relayEmit } from './frameEvents';
import { setVarsOf, swipesVars, varsOf } from './msgVars';
import { isDuringExtra, pending as mvuPending } from '../mvu/app';
import { regexAllowed } from '../lib/engine';

type Obj = Record<string, unknown>;
const hostGen = (p: string, o: { raw?: boolean }) => (appHost() as unknown as { gen: (p: string, o: { raw?: boolean }) => Promise<string> }).gen(p, o);

// 화면 안의 localStorage 를 대신 보관한다 (모든 화면이 함께 쓴다)
let ls: Record<string, string> = {};
const lsReady = DB.get('kv', 'frame-ls').then(r => { ls = ((r as { data?: Record<string, string> } | undefined)?.data) || {}; }).catch(() => { });
let lsTimer = 0;
const lsSave = () => { clearTimeout(lsTimer); lsTimer = window.setTimeout(() => void DB.put('kv', { id: 'frame-ls', data: ls }), 300); };

const roleOf = (m: Msg) => m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant';
const view = (m: Msg, i: number) => ({ message_id: i, name: m.name || (m.role === 'user' ? S.persona(cur.chat!)?.name : '') || '', role: roleOf(m), is_hidden: !!m.hidden, message: msgText(m), data: varsOf(m) || {}, swipe_id: m.sw, swipes: m.swipes.map(s => s.text), swipes_data: swipesVars(m) });
const LIMIT = 300;
// 화면들이 들고 있는 메시지 사본 (실리태번 도우미의 getChatMessages 는 바로 답해야 한다).
// 일이 있을 때마다 최근 300개를 통째로 화면마다 보내면 (변수가 큰 방은 수 MB) 그동안 화면이 멈춘다 — 지난번에 보낸 것과 달라진 메시지만 보낸다.
// 화면은 받은 판(ver)을 적어 두고, 자기 판(base)이 아닌 것을 받으면 통째로 다시 달라고 한다 (vendor/th-shim.js)
let stateVer = 0, sentFrom = 0, sentChat = '';
const sent = new Map<number, string>(), sentView = new Map<number, Obj>();
/** 지금 메시지들을 지난번 보낸 것과 견준다. 달라진 것이 없으면 null */
function stateDelta(): Obj | null {
  const ms = cur.msgs, from = Math.max(0, ms.length - LIMIT), lastId = ms.length - 1, chatId = cur.chat?.id || '';
  if (chatId !== sentChat) { sent.clear(); sentView.clear(); sentChat = chatId; }
  const upd: Obj[] = [], next = new Map<number, string>(), nextView = new Map<number, Obj>();
  for (let i = from; i < ms.length; i++) {
    const v = view(ms[i], i) as Obj; let j: string; try { j = JSON.stringify(v); } catch { j = String(Math.random()); }
    next.set(i, j); nextView.set(i, v); if (sent.get(i) !== j) upd.push(v);
  }
  if (!upd.length && from === sentFrom && sent.size === next.size) return null;
  const base = stateVer; stateVer++;
  sent.clear(); sentView.clear(); for (const [k, j] of next) sent.set(k, j); for (const [k, v] of nextView) sentView.set(k, v); sentFrom = from;
  return upd.length > LIMIT / 2 ? { ver: stateVer, messages: [...sentView.values()], lastId } : { ver: stateVer, base, from, lastId, upd };
}
/** 지금 상태를 보낸 것으로 맞춘 뒤 (달라졌으면 화면들에 먼저 알리고) 통째 사본 */
function fullState() {
  const d = stateDelta(); if (d) framePost({ dlState: d });
  return { ver: stateVer, messages: [...sentView.values()] };
}
// 캐릭터 변수: 카드의 extensions.tavern_helper.variables · 프리셋 변수: 프리셋의 extensions.tavern_helper.variables (실리태번과 같은 자리)
type ThBox = { tavern_helper?: unknown };
const thVarsOf = (ext: unknown): Obj => { let th = (ext as ThBox | undefined)?.tavern_helper; if (Array.isArray(th)) th = Object.fromEntries(th.filter((p): p is [string, unknown] => Array.isArray(p) && typeof p[0] === 'string')); const v = (th as { variables?: unknown } | undefined)?.variables; return v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {}; };
const curCharOf = () => cur.chat ? S.get('chars', cur.chat.charIds[0]) : undefined;
const presetExt = () => (((S.presetFor(cur.chat) as { st?: { cc?: { extensions?: unknown } } }).st?.cc?.extensions) as unknown);
const vars = () => ({ chat: cur.chat?.vars || {}, global: S.settings.globalVars || {}, character: thVarsOf(curCharOf()?.ext), preset: thVarsOf(presetExt()), message: {} });
async function setThVars(kind: 'character' | 'preset', v: Obj) {
  if (kind === 'character') { const ch = curCharOf(); if (!ch) return; let th = (ch.ext as ThBox)?.tavern_helper; if (Array.isArray(th)) th = Object.fromEntries(th as [string, unknown][]); ch.ext = { ...(ch.ext || {}), tavern_helper: { scripts: [], ...(th && typeof th === 'object' ? th : {}), variables: v } }; await S.save('chars', ch, true); return; }
  const p = S.presetFor(cur.chat) as { st?: { cc?: Obj } } & Parameters<typeof S.save<'presets'>>[1]; const st = (p.st ||= {}), cc = (st.cc ||= {}), ext = (cc.extensions && typeof cc.extensions === 'object' ? cc.extensions : {}) as Obj, th = (ext.tavern_helper && typeof ext.tavern_helper === 'object' ? ext.tavern_helper : {}) as Obj;
  cc.extensions = { ...ext, tavern_helper: { scripts: [], ...th, variables: v } }; await S.save('presets', p, true);
}
// ── 메시지 속 화면이 바로(동기로) 읽는 가벼운 사본: 로어북 · 캐릭터 · 페르소나 · 프리셋 이름 같은 것. 바뀔 때만 다시 만든다 ──
let metaCache: Obj | null = null;
function thMeta(): Obj {
  if (metaCache) return metaCache;
  const c = cur.chat, ch = curCharOf(), p = S.persona(c), bn = (id?: string) => (id && S.get('lore', id)?.name) || null;
  const books = (ids?: string[]) => { const l = (ids || []).filter(id => S.get('lore', id)); return { primary: bn(l[0]), additional: l.slice(1).map(bn).filter(Boolean) }; };
  const G = (S.settings.lore || {}) as Obj, st = (G.st || {}) as Obj;
  // 페르소나 설명은 모두 합쳐 길면 지금 페르소나 것만 싣는다 (화면마다 시작 자료에 들어가므로)
  const long = S.personas.reduce((n, x) => n + (x.description || '').length, 0) > 20000, desc = (x: { id: string; description?: string }) => !long || x.id === p?.id ? x.description || '' : '';
  return metaCache = {
    wb: S.lore.map(b => b.name), gwb: (S.settings.activeLore || []).map(bn).filter(Boolean), chatWb: bn(c?.loreIds?.[0]), cwb: ch ? books(ch.loreIds) : { primary: null, additional: [] },
    chars: S.chars.map(x => [x.id, x.name]), cur: ch ? { id: ch.id, name: ch.name } : null,
    personas: S.personas.map(x => ({ avatar_id: x.id, avatar: x.id + '.png', name: x.name, title: String(x.title || ''), description: desc(x), position: 0, depth: 2, role: 0, lorebook: bn(x.loreIds?.[0]) || '', connections: [], is_default: S.settings.activePersona === x.id })),
    persona: p ? { id: p.id, name: p.name } : null, presets: S.presets.map(x => x.name), preset: S.presetFor(c).name,
    rxChar: !!ch && regexAllowed('chars', ch.id),
    lbs: { selected_global_lorebooks: (S.settings.activeLore || []).map(bn).filter(Boolean), scan_depth: st.scan_depth ?? 2, context_percentage: st.context_percentage ?? 25, budget_cap: st.budget_cap ?? 0, min_activations: Number(G.minActivations) || 0, max_depth: Number(G.minDepthMax) || 0, max_recursion_steps: Number(G.maxRecursion) || 0, insertion_strategy: st.insertion_strategy ?? 'character_first', include_names: !!G.includeNames, recursive: st.recursive ?? true, case_sensitive: st.case_sensitive ?? false, match_whole_words: st.match_whole_words ?? false, use_group_scoring: !!G.groupScoring, overflow_alert: st.overflow_alert ?? false },
  };
}
let metaSent = '', metaTimer = 0;
const metaDirty = () => {
  metaCache = null; if (metaTimer) return;
  metaTimer = window.setTimeout(() => {
    metaTimer = 0; if (!document.querySelector('iframe.dl-frame-el')) return;
    const m = thMeta(), j = JSON.stringify(m); if (j !== metaSent) { metaSent = j; framePost({ dlState: { th: m, vars: vars() } }); }
    // 무거운 사본을 받은 화면에는 그것도 새로 (그런 화면이 있을 때만)
    for (const f of heavyFrames.keys()) if (!f.isConnected) heavyFrames.delete(f);
    if (heavyFrames.size) void thMod().then(M => { for (const [f, src] of heavyFrames) f.contentWindow?.postMessage({ dlState: { thx: M.heavy(src) } }, '*'); });
  }, 200);
};
const heavyFrames = new Map<HTMLIFrameElement, string>();
for (const ev of ['lore', 'chars', 'personas', 'presets', 'regex', 'settings', 'chat:open']) on(ev, metaDirty);
/** 화면 글이 무거운 사본(프리셋 · 정규식 · 카드)을 쓰는 함수를 부르면 그것도 넣는다 (그때만 도우미 묶음을 불러온다) */
const HEAVY = /getPreset\b|updatePresetWith|setPreset\b|getTavernRegexes|formatAsTavernRegexedString|updateTavernRegexesWith|getCharData|RawCharacter|getAudio|playAudio|getCurrentAudio/;
const thMod = () => import('../th');
/** 화면 글이 vendor/th-more.js 의 함수를 쓰는가 (이름이 보이거나, 밖에서 스크립트를 불러와 무엇을 부를지 모르면 깐다). 아니면 상태창마다 풀지 않는다 */
const MORE = /\b(?:isCharacterTavernRegexesEnabled|appendInexistentScriptButtons|getCurrentCharPrimaryLorebook|builtin_prompt_default_order|formatAsTavernRegexedString|getAllEnabledScriptButtons|getTavernHelperExtensionId|updateLorebookEntriesWith|isPresetPlaceholderPrompt|createOrReplaceCharacter|retrieveDisplayedMessage|getOrCreateChatWorldbook|formatAsDisplayedMessage|createOrReplaceWorldbook|updateTavernRegexesWith|getGlobalWorldbookNames|getOrCreateChatLorebook|updateScriptButtonsWith|setCurrentCharLorebooks|getCurrentCharacterName|deleteWorldbookEntries|rebindGlobalWorldbooks|createWorldbookEntries|createOrReplacePersona|replaceLorebookEntries|deleteLorebookEntries|createOrReplacePreset|getCurrentPersonaName|getCharWorldbookNames|updateFrontendVersion|createLorebookEntries|getCurrentCharacterId|updateScriptTreesWith|isPresetSystemPrompt|rebindCharWorldbooks|importRawTavernRegex|getChatHistoryDetail|replaceScriptButtons|getChatWorldbookName|isInstalledExtension|replaceTavernRegexes|getPersonaAvatarPath|isPresetNormalPrompt|setLorebookSettings|rebindChatWorldbook|createLorebookEntry|getChatHistoryBrief|deleteLorebookEntry|unregisterMacroLike|getLorebookSettings|updateCharacterWith|getCurrentPersonaId|updateWorldbookWith|getProxyPresetNames|getLoadedPresetName|rotateChatMessages|getFrontendVersion|importRawCharacter|getLorebookEntries|reinstallExtension|importRawWorldbook|updateTavernHelper|getExtensionStatus|setLorebookEntries|stopGenerationById|replaceScriptTrees|uninstallExtension|updatePersonaWith|registerMacroLike|stopAllGeneration|getCharAvatarPath|getCharacterNames|replaceScriptInfo|refreshOneMessage|getWorldbookNames|installExtension|deleteTavernFile|getScriptButtons|getCharLorebooks|getTavernRegexes|updatePresetWith|getAudioSettings|setAudioSettings|replaceWorldbook|substitudeMacros|replaceCharacter|replaceAudioList|uploadTavernFile|getExtensionType|getCharacterIds|setChatLorebook|getChatLorebook|deleteCharacter|createWorldbook|appendAudioList|updateExtension|createCharacter|importRawPreset|getCurrentAudio|getPersonaNames|uninjectPrompts|deleteWorldbook|getAllVariables|createLorebook|deleteLorebook|getScriptTrees|getPresetNames|replacePersona|default_preset|createPersona|replacePreset|getPersonaIds|importRawChat|getTavernFile|getScriptName|injectPrompts|deletePersona|getScriptInfo|deletePreset|getCharacter|getWorldbook|reloadIframe|getLorebooks|getAudioList|getModelList|renamePreset|createPreset|RawCharacter|audioEnable|audioImport|audioSelect|getCharData|getPersona|pauseAudio|loadPreset|audioMode|audioPlay|setPreset|getPreset|playAudio|isAdmin|builtin)\b|TavernHelper\s*[.[]|<script[^>]*\bsrc\s*=|\bimport\s*[('"{*\w]/;

function msgIndexOf(f: HTMLIFrameElement) {
  const id = f.closest<HTMLElement>('[data-id]')?.dataset.id;
  const i = id ? cur.msgs.findIndex(m => m.id === id) : -1;
  return i >= 0 ? i : cur.msgs.length - 1;
}

frameHooks.msg = onFrameMessage;
/** zod 스키마 카드 도우미(vendor/mvu_zod.js)가 띄우는 말 */
const mvuText = () => ({ path: t('mvu.zod.path'), input: t('mvu.zod.input'), cmdErr: t('mvu.zod.cmdErr', { cmd: '{cmd}' }), initErr: t('mvu.zod.initErr', { n: '{n}' }), notNumber: t('mvu.zod.notNumber', { type: '{type}' }), moveMissing: t('mvu.zod.moveMissing', { path: '{path}' }), ok: t('mvu.zod.ok') });
/** 화면(iframe)은 앱의 CSS 변수를 물려받지 못한다. 지금 테마의 색 · 글꼴을 넘겨, 화면 안에서 var(--dl-text) 처럼 쓰게 한다 */
function themeForFrames() {
  const cs = getComputedStyle(document.documentElement), g = (n: string) => cs.getPropertyValue(n).trim();
  return { bg: g('--bg'), surface: g('--surface'), text: g('--text'), dim: g('--dim'), accent: g('--accent'), onAccent: g('--on-accent'), ok: g('--ok'), bad: g('--bad'), font: g('--font'), fontChat: g('--font-chat') || g('--font'), fs: g('--fs'), tone: document.documentElement.dataset.tone || 'light' };
}
frameHooks.init = async f => {
  await lsReady;
  const chat = cur.chat, ch = chat ? S.get('chars', chat.charIds[0]) : undefined;
  const st = fullState();
  const sid = f.dataset.script || '', src = sid ? '' : frameSource(f.dataset.frame || '');
  const more = !!sid || MORE.test(src), thx = more && src && HEAVY.test(src) ? (await thMod()).heavy(src) : undefined;
  if (thx) heavyFrames.set(f, src);
  return { ls, msgId: msgIndexOf(f), lastId: cur.msgs.length - 1, messages: st.messages, ver: st.ver, vars: vars(), user: chat ? S.persona(chat)?.name : '', char: ch?.name || '', charId: ch?.id || '', charAvatar: S.avatarNow(ch), userAvatar: chat ? S.persona(chat)?.avatar || '' : '', viewH: innerHeight, theme: themeForFrames(), mvuExtra: isDuringExtra(), mvuNotify: !!(S.settings as { mvu?: { notifyErr?: boolean } }).mvu?.notifyErr, mvuText: mvuText(),
    ...(more ? { more: true, th: thMeta() } : {}), chatId: chat?.id || '', busy: cur.busy, ...(thx ? { thx } : {}), ...(sid ? { scriptId: sid, scriptName: TH.scriptMeta(sid)?.name || '', scriptVars: TH.scriptVars(sid) } : {}) };
};

async function commit() { await chatApi.save(); chatApi.redraw?.(); }
/** 메시지를 고친 뒤: refresh 'none' 이면 다시 그리지 않고, 'affected'(기본)면 고친 메시지만, 'all' 이면 전부 (Tavern Helper 와 같다) */
async function refreshAfter(list: Obj[], how: unknown) {
  const ms = cur.msgs, hit = list.map(p => ms[Number(p.message_id)]).filter((m): m is Msg => !!m);
  S.touchMsgs(...hit); await chatApi.save();
  if (how === 'none') return;
  if (how === 'all' || hit.length > 20) { chatApi.redraw?.(); return; }
  bump(...hit.map(m => 'm:' + m.id));
}

frameHooks.call = async (f, fn, args) => {
  const chat = cur.chat;
  const own = appCalls[fn]; if (own) return await own(f, args);
  switch (fn) {
    case 'lsSet': ls[String(args[0])] = String(args[1]); lsSave(); return null;
    case 'lsDel': delete ls[String(args[0])]; lsSave(); return null;
    case 'lsClear': ls = {}; lsSave(); return null;
    case 'toast': { const [kind, m, title] = args as string[]; toast([title, m].filter(Boolean).join(' — '), (kind || '') as 'ok'); return null; }
    case 'slash': return await runQrScript(String(args[0] || ''));
    case 'emit': return await relayEmit(f, String(args[0] ?? ''), Array.isArray(args[1]) ? args[1] as unknown[] : []);   // 다른 화면 · 앱에도 알리고, 고쳐진 인자를 돌려준다
    case 'state': return { ...fullState(), lastId: cur.msgs.length - 1 };   // 화면이 받은 판이 어긋났다: 통째로 다시
    case 'th': return await (await thMod()).fromFrame(f, String(args[0] ?? ''), Array.isArray(args[1]) ? args[1] as unknown[] : []);   // 그 밖의 Tavern Helper 함수 (src/th)
    case 'popup': return await (await thMod()).popup(String(args[0] ?? ''), args[1], args[2], args[3]);
    case 'reloadFrame': { if (f.dataset.script) { await TH.restart(f.dataset.script); return null; } const box = f.parentElement; if (box?.classList.contains('dl-frame')) { const n = box.cloneNode(false) as HTMLElement; n.removeAttribute('data-on'); n.removeAttribute('data-wait'); n.style.minHeight = f.offsetHeight + 'px'; bridgeFrames(); box.replaceWith(n); } return null; }   // 자리를 새로 만들면 화면이 다시 뜬다
  }
  if (!chat) throw new Error('no chat open');
  const ms = cur.msgs;
  switch (fn) {
    case 'setMsgs': {
      for (const p of (args[0] as Obj[]) || []) {
        const m = ms[Number(p.message_id)]; if (!m) continue;
        if (typeof p.message === 'string') { const s = m.swipes[m.sw]; if (s) { s.text = p.message; delete s.tr; } }
        if (typeof p.name === 'string') m.name = p.name;
        if (typeof p.is_hidden === 'boolean') m.hidden = p.is_hidden;
        if (Array.isArray(p.swipes) && p.swipes.length) { const texts = p.swipes.map(x => String(x ?? '')); m.swipes = texts.map((tx, k) => m.swipes[k] ? { ...m.swipes[k], text: tx } : { text: tx, ts: Date.now() }); m.sw = Math.min(m.sw, m.swipes.length - 1); }
        if (typeof p.swipe_id === 'number' && m.swipes[p.swipe_id]) m.sw = p.swipe_id;
        if (Array.isArray(p.swipes_data)) p.swipes_data.forEach((v, k) => { if (m.swipes[k] && v && typeof v === 'object') setVarsOf(m, v as Obj, k); });
        if (p.data && typeof p.data === 'object') setVarsOf(m, p.data as Obj);
      }
      await refreshAfter((args[0] as Obj[]) || [], (args[1] as Obj)?.refresh); pushState(); return null;
    }
    case 'createMsgs': {
      const list = (args[0] as Obj[]) || [], at = (args[1] as Obj)?.insert_at;
      const made = list.map(p => { const role = p.role === 'user' ? 'user' : p.role === 'system' ? 'system' : 'assistant'; const m = newMsg(role, String(p.message ?? ''), { name: String(p.name || '') }); if (role === 'assistant') m.charId = chat.charIds[0] || ''; if (p.is_hidden) m.hidden = true; if (p.data && typeof p.data === 'object') setVarsOf(m, p.data as Obj); return m; });
      const pos = typeof at === 'number' ? (at < 0 ? ms.length + 1 + at : at) : ms.length;
      ms.splice(Math.max(0, Math.min(ms.length, pos)), 0, ...made);
      await commit(); pushState(); return null;
    }
    case 'delMsgs': {
      const ids = new Set(((args[0] as number[]) || []).map(Number));
      for (let i = ms.length - 1; i >= 0; i--) if (ids.has(i)) ms.splice(i, 1);
      await commit(); pushState(); return null;
    }
    case 'setVars': {
      const [t, id, v] = args as [string, number | string | null, Obj];
      if (t === 'message') { const m = ms[Number(id)]; if (m) { setVarsOf(m, v || {}); S.touchMsgs(m); } await chatApi.save(); }
      else if (t === 'global') { S.settings.globalVars = v as Record<string, string>; S.saveSettings(); }
      else if (t === 'character' || t === 'preset') await setThVars(t, v || {});
      else if (t === 'script') { const sid = String(id || f.dataset.script || ''); if (sid) await TH.setScriptVars(sid, v || {}); }
      else if (t === 'extension') { const box = ((S.settings as { thExtVars?: Record<string, Obj> }).thExtVars ||= {}); box[String(id || '')] = v || {}; S.saveSettings(); }
      else { chat.vars = v as Record<string, string>; await S.save('chats', chat, true); }
      return null;
    }
    case 'generate': { const c = (args[0] || {}) as Obj; return await hostGen(String(c.user_input ?? c.prompt ?? ''), {}); }
    case 'generateRaw': {
      const c = (args[0] || {}) as Obj, ordered = Array.isArray(c.ordered_prompts) ? (c.ordered_prompts as unknown[]).map(x => typeof x === 'string' ? x : String((x as Obj)?.content ?? '')).join('\n\n') : '';
      return await hostGen([ordered, String(c.user_input ?? '')].filter(Boolean).join('\n\n'), { raw: true });
    }
  }
  throw new Error(`${fn} is not supported`);
};

// 앱에서 일어난 일을 화면들에 알린다 (실리태번 이벤트 이름으로)
const state = () => ({ ...(stateDelta() || {}), lastId: cur.msgs.length - 1, vars: vars(), mvuExtra: isDuringExtra() });
const anyFrame = () => !!document.querySelector('iframe.dl-frame-el');   // 화면이 하나도 없으면 사본을 만들 것도 없다
const send = (ev: string, i?: number) => { if (anyFrame()) framePost({ dlState: state(), dlEvent: ev, args: i == null ? [] : [i] }); };
/** 스크립트 · 화면이 메시지를 고친 뒤: 다른 화면들의 사본도 맞춘다 (달라진 것만 보낸다) */
let pushTimer = 0;
export const pushState = () => { if (pushTimer) return; pushTimer = window.setTimeout(() => { pushTimer = 0; if (anyFrame()) framePost({ dlState: state() }); }, 30); };   // 잇달아 고치면 한 번만
/** 변수 갱신이 끝난 뒤에 알린다 (실리태번에서 변수 갱신이 먼저 끝나는 것과 같게) */
const after = (ev: string, d: unknown, i: () => number) => { const chat = (d as { chat?: unknown })?.chat || cur.chat; void Promise.resolve().then(() => mvuPending(chat as typeof cur.chat)).then(() => send(ev, i())); };
on('mvu:updated', () => { if (anyFrame()) framePost({ dlState: state() }); });
const idx = (d: unknown) => { const m = (d as { msg?: Msg })?.msg; return m ? cur.msgs.indexOf(m) : cur.msgs.length - 1; };
// 그려졌다는 알림 (실리태번의 *_MESSAGE_RENDERED): 듣는 화면이 있을 때만 보낸다
on('message:received', d => { const i = idx(d); after('message_received', d, () => i); if (hasListeners('character_message_rendered')) after('character_message_rendered', d, () => i); });
on('message:sent', d => { const i = idx(d); after('message_sent', d, () => i); if (hasListeners('user_message_rendered')) after('user_message_rendered', d, () => i); });
on('message:edited', d => { const i = idx(d); after('message_edited', d, () => i); });
on('message:swiped', d => { const i = idx(d); after('message_swiped', d, () => i); });
on('message:deleted', () => send('message_deleted', cur.msgs.length));
on('generate:start', () => send('generation_started'));
on('generate:end', () => send('generation_ended', cur.msgs.length - 1));
// 앱 창 높이가 바뀌면 화면들의 --TH-viewport-height 를 맞춘다
let vhTimer = 0;
addEventListener('resize', () => { clearTimeout(vhTimer); vhTimer = window.setTimeout(() => framePost({ dlState: { viewH: innerHeight } }), 150); });
