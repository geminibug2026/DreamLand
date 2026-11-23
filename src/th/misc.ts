// 그 밖의 Tavern Helper 함수: 오디오 · 스크립트(단추 · 트리 · 정보) · 확장 · 파일 · 원본 가져오기 · 그려진 메시지 · 메시지 돌리기
import { DB, S, dataURLToBytes } from '../lib/core';
import { applyRegex, macro, makeCtx } from '../lib/engine';
import { render } from '../lib/format';
import { runFilters } from '../lib/hooks';
import { importFiles, stChatToChat } from '../lib/cards';
import * as TS from '../lib/thscripts';
import { bump, cur } from '../chat/store';
import { chatApi } from '../chat/actions';
import { pushState } from '../chat/frameBridge';
import { toast } from '../ui';
import { t } from '../i18n';
import type { Char, Msg } from '../lib/types';
import { applyMacros } from './gen';
import { type Ctx, type Obj, chat, charsOf, curChar, fail, isObj, str } from './util';

// ════════ 오디오 (배경 음악 · 환경음) ════════
type AType = 'bgm' | 'ambient';
interface ASet { enabled: boolean; mode: string; muted: boolean; volume: number; list: { title: string; url: string }[] }
const MODES = ['repeat_one', 'repeat_all', 'shuffle', 'play_one_and_stop'];
const aCfg = (): Record<AType, ASet> => {
  const s = S.settings as unknown as { thAudio?: Record<AType, ASet> };
  const d = (): ASet => ({ enabled: true, mode: 'repeat_all', muted: false, volume: 50, list: [] });
  s.thAudio ||= { bgm: d(), ambient: d() }; s.thAudio.bgm ||= d(); s.thAudio.ambient ||= d();
  return s.thAudio;
};
const aType = (v: unknown): AType => v === 'ambient' ? 'ambient' : 'bgm';
const players: Partial<Record<AType, HTMLAudioElement>> = {}, srcs: Partial<Record<AType, string>> = {};
const titleOf = (url: string) => url.split('/').at(-1)?.split('.').at(0) || url;
const aSave = () => S.saveSettings();
function el(ty: AType): HTMLAudioElement {
  let a = players[ty]; if (a) return a;
  a = players[ty] = new Audio(); a.preload = 'auto';
  a.addEventListener('ended', () => {
    const c = aCfg()[ty], list = c.list, i = list.findIndex(x => x.url === srcs[ty]);
    if (c.mode === 'repeat_one') { a!.currentTime = 0; void a!.play().catch(() => { }); return; }
    if (c.mode === 'play_one_and_stop' || !list.length) return;
    const next = c.mode === 'shuffle' ? list[Math.floor(Math.random() * list.length)] : list[(i + 1) % list.length];
    if (next) play(ty, next.url);
  });
  return a;
}
function apply(ty: AType) { const a = players[ty], c = aCfg()[ty]; if (!a) return; a.volume = Math.max(0, Math.min(1, (Number(c.volume) || 0) / 100)); a.muted = !!c.muted; if (!c.enabled) a.pause(); }
function play(ty: AType, url: string) {
  const a = el(ty); srcs[ty] = url; a.src = url; apply(ty);
  if (aCfg()[ty].enabled) void a.play().catch(e => console.warn('[오디오]', e));
}
const add = (ty: AType, list: unknown, replace: boolean) => {
  const c = aCfg()[ty], items = (Array.isArray(list) ? list : []).filter(isObj).filter(x => typeof x.url === 'string').map(x => ({ title: str(x.title) || titleOf(str(x.url)), url: str(x.url) }));
  c.list = replace ? items : [...c.list, ...items]; aSave();
};
export function audioState() {
  const out: Obj = {};
  for (const ty of ['bgm', 'ambient'] as AType[]) { const c = aCfg()[ty], a = players[ty]; out[ty] = { settings: { enabled: c.enabled, mode: c.mode, muted: c.muted, volume: c.volume }, list: c.list, cur: { src: srcs[ty] || '', title: c.list.find(x => x.url === srcs[ty])?.title || '', playing: !!a && !a.paused, progress: a?.currentTime || 0 } }; }
  return out;
}
const audio: Record<string, F> = {
  playAudio: (_c, ty, x) => { const T = aType(ty); if (!isObj(x) || !x.url) return; const url = str(x.url), c = aCfg()[T], title = str(x.title) || titleOf(url), have = c.list.find(i => i.title === title || i.url === url); if (have) { have.title = title; have.url = url; } else c.list.push({ title, url }); aSave(); play(T, url); },
  pauseAudio: (_c, ty) => { players[aType(ty)]?.pause(); },
  getAudioList: (_c, ty) => structuredClone(aCfg()[aType(ty)].list),
  replaceAudioList: (_c, ty, list) => add(aType(ty), list, true),
  appendAudioList: (_c, ty, list) => add(aType(ty), list, false),
  getAudioSettings: (_c, ty) => { const c = aCfg()[aType(ty)]; return { enabled: c.enabled, mode: c.mode, muted: c.muted, volume: c.volume }; },
  setAudioSettings: (_c, ty, o) => { const T = aType(ty), c = aCfg()[T]; if (!isObj(o)) return; if (o.enabled !== undefined) c.enabled = !!o.enabled; if (MODES.includes(str(o.mode))) c.mode = str(o.mode); if (o.muted !== undefined) c.muted = !!o.muted; if (o.volume !== undefined) c.volume = Math.max(0, Math.min(100, Number(o.volume) || 0)); aSave(); apply(T); },
  getCurrentAudio: (_c, ty) => (audioState()[aType(ty)] as Obj).cur,
  // 슬래시 명령 꼴 (/audioenable · /audioplay …)
  audioEnable: (c, o) => { const a = isObj(o) ? o : {}; audio.setAudioSettings(c, a.type, { enabled: str(a.state ?? 'true') !== 'false' }); return ''; },
  audioPlay: (c, o) => { const a = isObj(o) ? o : {}, T = aType(a.type); if (str(a.play ?? 'true') === 'false') audio.pauseAudio(c, T); else { const p = players[T]; if (p?.src) void p.play().catch(() => { }); else { const first = aCfg()[T].list[0]; if (first) play(T, first.url); } } return ''; },
  audioMode: (c, o) => { const a = isObj(o) ? o : {}; const m = ({ repeat: 'repeat_all', random: 'shuffle', single: 'repeat_one', stop: 'play_one_and_stop' } as Record<string, string>)[str(a.mode)]; if (m) audio.setAudioSettings(c, a.type, { mode: m }); return ''; },
  audioImport: (c, o, urls) => { const a = isObj(o) ? o : {}, list = str(urls).split(',').map(u => u.trim()).filter(Boolean).map(url => ({ url })); add(aType(a.type), list, false); if (str(a.play ?? 'true') !== 'false' && list[0]) play(aType(a.type), list[0].url); void c; return ''; },
  audioSelect: (c, o, url) => { const a = isObj(o) ? o : {}; if (str(url)) audio.playAudio(c, a.type, { url: str(url) }); return ''; },
};

// ════════ 스크립트 (단추 · 정보 · 트리) ════════
const sid = (c: Ctx, o?: unknown) => str(isObj(o) && o.script_id ? o.script_id : c.script || '');
const treeOf = (s: TS.ThScript) => ({ type: 'script', enabled: s.enabled, name: s.name, id: s.id, content: s.content, info: s.info || '', button: s.button || { enabled: true, buttons: [] }, data: s.data || {} });
function trees(o: unknown): Obj[] {
  const ty = isObj(o) ? str(o.type) : 'global';
  if (ty === 'character') { const ch = curChar(); return ch ? TS.charScripts(ch).map(treeOf) : []; }
  if (ty === 'preset') return [];
  return TS.scripts.map(treeOf);
}
async function replaceTrees(c: Ctx, list: unknown, o: unknown) {
  const ty = isObj(o) ? str(o.type) : 'global', items = (Array.isArray(list) ? list : []).filter(isObj);
  const flat = (xs: Obj[]): Obj[] => xs.flatMap(x => x.type === 'folder' ? flat((Array.isArray(x.scripts) ? x.scripts : []).filter(isObj)) : [x]);
  if (ty === 'character') {
    const ch = curChar(); if (!ch) return fail('noChar', { name: 'current' });
    const ext = (ch.ext || {}) as Obj, th = (isObj(ext.tavern_helper) ? ext.tavern_helper : {}) as Obj, old = JSON.stringify(flat((th.scripts as Obj[]) || []).map(x => x.content));
    ch.ext = { ...ext, tavern_helper: { ...th, scripts: structuredClone(items) } };
    await S.save('chars', ch);
    // 새 코드가 들어왔으면 이 캐릭터의 스크립트를 쓸지 다시 묻는다 (허락은 그 코드에 대해 받은 것이다)
    if (JSON.stringify(flat(items).map(x => x.content)) !== old) await TS.setCharAllowed(ch.id, undefined);
    return;
  }
  if (ty === 'preset') return fail('noPresetScripts');
  // 전역(가져온 스크립트): 새로 들어온 스크립트는 꺼진 채로 들어온다 (켜려면 사용자가 직접 허락한다)
  const have = new Map(TS.scripts.map(s => [s.id, s])), next = TS.parseScripts(flat(items));
  for (const s of next) { const o2 = have.get(s.id); if (o2 && o2.content === s.content) { s.trusted = o2.trusted; s.enabled = o2.enabled && o2.trusted; } }
  for (const s of TS.scripts) if (!next.some(x => x.id === s.id)) await TS.removeScript(s.id);
  await TS.addScripts(next); void c;
}
const script: Record<string, F> = {
  getScriptName: c => TS.scriptMeta(c.script || '')?.name || '',
  getScriptInfo: c => TS.scriptMeta(c.script || '')?.info || '',
  replaceScriptInfo: (c, info) => { if (c.script) TS.setScriptInfo(c.script, str(info)); },
  getScriptButtons: (c, o) => TS.getButtons(sid(c, o)),
  replaceScriptButtons: (c, a, b) => { const id = typeof a === 'string' ? a : c.script || '', list = (typeof a === 'string' ? b : a) as TS.ThButton[]; if (id && Array.isArray(list)) TS.setButtons(id, list); },
  appendInexistentScriptButtons: (c, a, b) => { const id = typeof a === 'string' ? a : c.script || '', list = ((typeof a === 'string' ? b : a) || []) as TS.ThButton[]; if (!id || !Array.isArray(list)) return; const have = TS.getButtons(id); TS.setButtons(id, [...have, ...list.filter(x => !have.some(h => h.name === x.name))]); },
  getAllEnabledScriptButtons: () => { const out: Record<string, { button_id: string; button_name: string }[]> = {}; for (const b of TS.scriptButtons()) (out[b.script] ||= []).push({ button_id: b.id, button_name: b.name }); return out; },
  getScriptTrees: (_c, o) => trees(o),
  replaceScriptTrees: (c, list, o) => replaceTrees(c, list, o),
  // 예전 판은 스크립트 변수를 대화 변수에 함께 적었다: 이 스크립트의 새 자리가 비어 있으면 대화 변수를 읽어 설정이 처음으로 돌아가지 않게
  getScriptVars: (c, id) => { const sid = str(id || c.script), d = TS.scriptMeta(sid)?.data; return structuredClone(d && Object.keys(d).length ? d : ((cur.chat?.vars as Obj | undefined) || {})); },
};

// ════════ 확장 (드림랜드에는 실리태번 확장 설치가 없다: 이미 들어 있는 것만 깔린 것으로 알린다) ════════
const BUILTIN: Record<string, string> = { 'js-slash-runner': 'https://github.com/N0VI028/JS-Slash-Runner', 'tavern_helper': 'https://github.com/N0VI028/JS-Slash-Runner', 'magvarupdate': 'https://github.com/MagicalAstrogy/MagVarUpdate', 'sillytavern-lalib': 'https://github.com/LenAnderson/SillyTavern-LALib', 'lalib': 'https://github.com/LenAnderson/SillyTavern-LALib', 'st-prompt-template': 'https://github.com/zonde306/ST-Prompt-Template' };
const extKey = (id: unknown) => str(id).replace(/^third-party\//, '').replace(/\.git$/, '').split('/').pop()!.toLowerCase();
const builtIn = (id: unknown) => !!BUILTIN[extKey(id)];
const nope = (what: string, id: unknown) => { toast(t('th.ext.no', { what, name: str(id) }), 'warn'); return { status: 501, statusText: 'Not Implemented', body: t('th.ext.no', { what, name: str(id) }) }; };
const ext: Record<string, F> = {
  isAdmin: () => false,
  getTavernHelperExtensionId: () => 'JS-Slash-Runner',
  getExtensionType: (_c, id) => builtIn(id) ? 'global' : null,
  isInstalledExtension: (_c, id) => builtIn(id),
  getExtensionStatus: (_c, id) => builtIn(id) ? { current_branch_name: 'main', current_commit_hash: 'dreamland', is_up_to_date: true, remote_url: BUILTIN[extKey(id)] } : null,
  installExtension: (_c, url) => nope(t('th.ext.install'), url),
  uninstallExtension: (_c, id) => nope(t('th.ext.uninstall'), id),
  reinstallExtension: (_c, id) => nope(t('th.ext.reinstall'), id),
  updateExtension: (_c, id) => builtIn(id) ? { status: 200, statusText: 'OK', body: '' } : nope(t('th.ext.update'), id),
  updateTavernHelper: () => { toast(t('th.ext.selfUpdate')); return false; },
};

// ════════ 파일 (실리태번의 user/files 자리: 드림랜드 저장소에 둔다) ════════
const fileKey = (name: unknown) => 'thfile:' + str(name).replace(/^\/?(user\/files\/)?/, '');
const file: Record<string, F> = {
  getTavernFile: async (_c, name) => { const r = await DB.get('kv', fileKey(name)) as { data?: string } | undefined; return r?.data ? { status: 200, statusText: 'OK', b64: r.data } : { status: 404, statusText: 'Not Found', body: '' }; },
  uploadTavernFile: async (_c, name, b64) => { const n = str(name).replace(/^\/?(user\/files\/)?/, ''); if (!n || /[\\/]/.test(n)) return fail('badFile'); const d = str(b64).replace(/^data:[^,]*,/, ''); if (d.length > 20e6) return fail('bigFile'); await DB.put('kv', { id: fileKey(n), data: d, ts: Date.now() }); return 'user/files/' + n; },
  deleteTavernFile: async (_c, name) => { const k = fileKey(name); if (!(await DB.get('kv', k))) return false; await DB.del('kv', k); return true; },
};

// ════════ 원본 가져오기 (가져오기 화면과 같은 길) ════════
const asFile = (name: unknown, data: unknown) => { const s = str(data); return new File([/^data:/.test(s) ? dataURLToBytes(s) as BlobPart : s], str(name) || 'import'); };
const ok = (n: number) => n > 0 ? { status: 200, statusText: 'OK', body: '' } : { status: 400, statusText: 'Bad Request', body: '' };
const imp: Record<string, F> = {
  importRawCharacter: async (_c, name, data) => { const T = await importFiles([asFile(name, data)]); return ok(T.chars); },
  importRawPreset: async (_c, name, data) => (await importFiles([asFile(/\.json$/i.test(str(name)) ? name : str(name) + '.json', data)])).presets > 0,
  importRawWorldbook: async (_c, name, data) => { const T = await importFiles([asFile(/\.json$/i.test(str(name)) ? name : str(name) + '.json', data)]); return ok(T.lore); },
  importRawTavernRegex: async (_c, name, data) => (await importFiles([asFile(/\.json$/i.test(str(name)) ? name : str(name) + '.json', data)])).regex > 0,
  importRawChat: async (_c, name, data) => {
    const ch = curChar(); if (!ch) return fail('noChar', { name: 'current' });
    const { chat: c, msgs } = stChatToChat(str(data), { charIds: [ch.id], name: str(name).replace(/\.jsonl$/i, '') });
    await S.saveMsgs(c as never, msgs as never); return ok(msgs.length);
  },
};

// ════════ 그려진 메시지 ════════
function msgAt(id: unknown): { m: Msg; i: number } | null {
  const ms = cur.msgs, n = ms.length; let i = typeof id === 'number' ? id : NaN;
  if (id === 'last') i = n - 1; else if (id === 'last_user') i = ms.map(m => m.role).lastIndexOf('user'); else if (id === 'last_char') i = ms.map(m => m.role).lastIndexOf('assistant');
  if (i < 0 && Number.isInteger(i)) i = n + i;
  return Number.isInteger(i) && ms[i] ? { m: ms[i], i } : null;
}
const shown: Record<string, F> = {
  formatAsDisplayedMessage: (_c, text, o) => {
    const at = msgAt(isObj(o) && o.message_id !== undefined ? o.message_id : 'last'), m = at?.m, role = m?.role || 'assistant';
    let depth = 0; if (at) for (let k = cur.msgs.length - 1; k > at.i; k--) if (!cur.msgs[k].hidden) depth++;
    const x = runFilters(applyRegex(str(text), { who: role === 'user' ? 'user' : 'ai', target: 'display', depth, charId: m?.charId, chat: chat() }), { role, msg: m, chat: chat() });
    return render(x, { style: S.settings.rpBubbles ? 'bubbles' : 'novel', prose: role !== 'user' });
  },
  refreshOneMessage: (_c, id) => { const at = msgAt(Number(id)); if (at) bump('m:' + at.m.id); },
  msgDomId: (_c, id) => msgAt(Number(id))?.m.id || '',
  rotateChatMessages: async (_c, begin, middle, end, o) => {
    const ms = cur.msgs, b = Number(begin), mid = Number(middle), e = Number(end);
    if (!(b >= 0 && b <= mid && mid <= e && e <= ms.length)) return fail('badRange');
    const part = ms.splice(b, e - b), k = mid - b; ms.splice(b, 0, ...part.slice(k), ...part.slice(0, k));
    S.touchMsgs(...ms.slice(b, e));
    await chatApi.save(); if (!isObj(o) || o.refresh !== 'none') chatApi.redraw();
    pushState();
  },
  substitudeMacros: (_c, text) => {
    const c = chat(); if (!c) return str(text);
    const cs = charsOf(c), ctx = makeCtx({ chat: c, char: cs[0] as Char, chars: cs, persona: S.persona(c), msgs: cur.msgs });
    return applyMacros(macro(str(text), ctx), {});
  },
};

type F = (c: Ctx, ...a: unknown[]) => unknown;
export const misc: Record<string, F> = { ...audio, ...script, ...ext, ...file, ...imp, ...shown };
