// 캐릭터 · 페르소나: Tavern Helper 의 character · persona · raw_character 함수. 카드 꼴은 내보내기와 같은 변환(charToCard)을 쓴다
import { S, newChar, newPersona, msgText } from '../lib/core';
import { charToCard, scopedRegex } from '../lib/cards';
import { deleteChars } from '../lib/bulk';
import { Assets } from '../lib/assets';
import * as TS from '../lib/thscripts';
import { go } from '../lib/router';
import type { Char, Persona, Regex } from '../lib/types';
import { t } from '../i18n';
import { toTh as regexToTh } from './regex';
import { regex as regexApi } from './regex';
import { type Ctx, type Obj, bookByName, bookName, chat, clone, curChar, fail, findChar, findPersona, isObj, mayDelete, redraw, remember, str, undoToast } from './util';

const OMIT = ['TavernHelper_scripts', 'TavernHelper_characterScriptVariables', 'fav', 'talkativeness', 'world', 'depth_prompt', 'pygmalion_id', 'github_repo', 'source_url', 'chub', 'sd_character_prompt'];
/** 카드 확장 칸의 tavern_helper (짝 배열 꼴도 받는다) */
export function thOf(ext: Obj | undefined): Obj {
  const v = ext?.tavern_helper;
  if (Array.isArray(v)) return Object.fromEntries(v.filter((p): p is [string, unknown] => Array.isArray(p) && typeof p[0] === 'string'));
  return isObj(v) ? v : {};
}
/** 실리태번 v1 카드 꼴 (getCharData · RawCharacter) */
export function cardData(ch: Char): Obj {
  const card = charToCard(ch as never) as { data: Obj }, d = card.data;
  return { name: ch.name, description: ch.description, personality: ch.personality, scenario: ch.scenario, first_mes: ch.firstMes, mes_example: ch.mesExample, creatorcomment: ch.creatorNotes, avatar: ch.id + '.png', chat: chat()?.charIds.includes(ch.id) ? chat()!.id : '', tags: ch.tags, fav: ch.fav, talkativeness: ch.talk, create_date: new Date(ch.createdAt || Date.now()).toISOString(), spec: 'chara_card_v2', spec_version: '2.0', data: d };
}
function toCharacter(ch: Char): Obj {
  const d = (charToCard(ch as never) as { data: Obj }).data, ext: Obj = { ...(d.extensions as Obj || {}) };
  ext.regex_scripts = scopedRegex(ch.id).map(r => regexToTh(r as Regex));
  ext.tavern_helper = { scripts: [], variables: {}, ...thOf(ch.ext) };
  for (const k of OMIT) delete ext[k];
  const book = (ch.loreIds || []).find(id => S.get('lore', id));
  return { avatar: ch.id + '.png', version: ch.version || '', creator: ch.creator || '', creator_notes: ch.creatorNotes || '', worldbook: bookName(book), description: ch.description || '', first_messages: [ch.firstMes || '', ...(ch.altGreetings || [])], extensions: structuredClone(ext) };
}
/** 바꿀 칸만 적는다 (Tavern Helper 의 replaceCharacter 와 같다: 적은 칸만 바뀌고, 확장 칸은 위에 덮는다) */
async function writeChar(c: Ctx, ch: Char, x: Obj, isNew: boolean) {
  const before = isNew ? null : structuredClone(ch);
  // 메시지 속 화면(격리됨)은 카드의 스크립트 코드를 바꾸지 못한다 (허락받은 스크립트 자리에 코드를 넣지 못하게)
  if (!c.script && !isNew && isObj(x.extensions) && isObj(x.extensions.tavern_helper) && 'scripts' in x.extensions.tavern_helper && JSON.stringify(x.extensions.tavern_helper.scripts ?? []) !== JSON.stringify(thOf(ch.ext).scripts ?? [])) fail('scriptOnly', { name: 'extensions.tavern_helper.scripts' });
  if (x.version !== undefined) ch.version = str(x.version);
  if (x.creator !== undefined) ch.creator = str(x.creator);
  if (x.creator_notes !== undefined) ch.creatorNotes = str(x.creator_notes);
  if (x.description !== undefined) ch.description = str(x.description);
  if (Array.isArray(x.first_messages)) { ch.firstMes = str(x.first_messages[0] ?? ''); ch.altGreetings = x.first_messages.slice(1).map(str); }
  if (typeof x.avatar === 'string' && /^data:image\//.test(x.avatar)) ch.avatar = x.avatar;   // 그림(Blob)은 화면 쪽에서 data URL 로 바꿔 보낸다
  if (x.worldbook !== undefined) { const b = x.worldbook ? bookByName(x.worldbook) : null; if (x.worldbook && !b) fail('noBook', { name: str(x.worldbook) }); ch.loreIds = [...new Set([b?.id, ...(ch.loreIds || []).slice(1)].filter((v): v is string => !!v))]; }
  let rx: unknown[] | null = null;
  if (isObj(x.extensions)) {
    const e = { ...x.extensions };
    if (Array.isArray(e.regex_scripts)) rx = e.regex_scripts; delete e.regex_scripts;
    if (e.tavern_helper !== undefined) e.tavern_helper = isObj(e.tavern_helper) ? { ...thOf(ch.ext), ...e.tavern_helper } : e.tavern_helper;
    for (const k of ['fav', 'talkativeness', 'world', 'depth_prompt']) delete e[k];   // 드림랜드 칸으로 따로 다루는 것
    ch.ext = { ...(ch.ext || {}), ...e };
  }
  await S.save('chars', ch);
  await remember('chars', ch.id, ch.name, before as unknown as Obj | null, isNew);
  // 카드에 실린 스크립트 코드가 바뀌었으면 이 캐릭터의 스크립트를 쓸지 다시 묻는다 (허락은 그 코드에 대해 받은 것이다)
  const code = (c: Char | null) => JSON.stringify(((thOf(c?.ext).scripts as unknown[]) || []).map(x => isObj(x) ? [x.content, x.scripts] : x));
  if (!isNew && before && code(before) !== code(ch)) await TS.setCharAllowed(ch.id, undefined);
  if (rx) await regexApi.replaceTavernRegexes({ f: null, script: null, msgId: -1 }, rx, { type: 'character', name: ch.id });
  if (chat()?.charIds.includes(ch.id)) redraw();
}
const needChar = (ref: unknown): Char => findChar(ref) || fail('noChar', { name: str(ref) });

// ── 페르소나 ──
function toPersona(p: Persona): Obj {
  const book = (p.loreIds || []).find(id => S.get('lore', id));
  return {
    avatar_id: p.id, avatar: p.id + '.png', name: p.name, title: str(p.title), description: p.description || '', position: Number(p.descPos ?? 0) || 0, depth: Number(p.descDepth ?? 2), role: Number(p.descRole ?? 0) || 0,
    lorebook: bookName(book) || '', connections: S.chars.filter(c => c.bind?.personaId === p.id).map(c => ({ type: 'character', id: c.id })), is_default: S.settings.activePersona === p.id,
  };
}
async function writePersona(p: Persona, x: Obj, isNew: boolean) {
  const before = isNew ? null : structuredClone(p);
  if (x.name !== undefined && str(x.name).trim()) p.name = str(x.name).trim();
  if (x.title !== undefined) p.title = str(x.title);
  if (x.description !== undefined) p.description = str(x.description);
  if (x.position !== undefined) p.descPos = Number(x.position) || 0;
  if (x.depth !== undefined) p.descDepth = Number(x.depth);
  if (x.role !== undefined) p.descRole = Number(x.role) || 0;
  if (typeof x.avatar === 'string' && /^data:image\//.test(x.avatar)) p.avatar = x.avatar;
  if (x.lorebook !== undefined) { const b = x.lorebook ? bookByName(x.lorebook) : null; if (x.lorebook && !b) fail('noBook', { name: str(x.lorebook) }); p.loreIds = [...new Set([b?.id, ...(p.loreIds || []).slice(1)].filter((v): v is string => !!v))]; }
  await S.save('personas', p);
  if (x.is_default === true) S.set({ activePersona: p.id });
  await remember('personas', p.id, p.name, before as unknown as Obj | null, isNew);
}
const needPersona = (ref: unknown): Persona => findPersona(ref) || fail('noPersona', { name: str(ref) });

type F = (c: Ctx, ...a: unknown[]) => unknown;
export const chars: Record<string, F> = {
  getCharacterNames: () => S.chars.map(c => c.name),
  getCharacterIds: () => S.chars.map(c => c.id),
  getCurrentCharacterName: () => curChar()?.name ?? null,
  getCurrentCharacterId: () => curChar()?.id ?? null,
  getCharacter: (_c, ref) => toCharacter(needChar(ref ?? 'current')),
  createCharacter: async (_c, name, x) => {
    const n = str(name).replace(/\.png$/i, '').trim(); if (!n || n === 'current') return false;
    if (findChar(n)) return false;
    const ch = newChar({ name: n }); await writeChar(_c, ch, isObj(x) ? x : {}, true); return true;
  },
  createOrReplaceCharacter: async (c, ref, x) => { const ch = findChar(ref); if (ch) { await writeChar(c, ch, isObj(x) ? x : {}, false); return false; } return chars.createCharacter(c, ref, x); },
  replaceCharacter: async (c, ref, x) => { await writeChar(c, needChar(ref ?? 'current'), isObj(x) ? x : {}, false); },
  deleteCharacter: async (c, ref, opt) => {
    const ch = findChar(ref ?? 'current'); if (!ch) return false;
    const withChats = !(isObj(opt) && opt.delete_chats === false);
    // 캐릭터는 대화 · 그림까지 함께 사라지므로 누가 부르든 한 번 묻는다
    if (!(await mayDelete(c, t('th.what.char'), ch.name, true))) return false;
    if (chat()?.charIds.includes(ch.id)) go('home');   // 열린 대화의 캐릭터면 대화를 닫고 지운다
    if (withChats) await deleteChars([ch.id]);
    else { await Assets.removeOwner(Assets.ownerOfChar(ch.id)).catch(() => { }); for (const r of S.regex) if (r.scope === ch.id) { r.scope = 'global'; r.enabled = false; await S.save('regex', r, true); } await S.remove('chars', ch.id); }
    return true;
  },
  // ── raw_character ──
  getCharData: (_c, ref) => { const ch = findChar(ref ?? 'current'); return ch ? cardData(ch) : null; },
  getCharAvatarPath: (_c, ref) => findChar(ref ?? 'current')?.avatar || null,
  rawCharIndex: (_c, ref) => { const ch = findChar(ref ?? 'current'); return ch ? S.chars.indexOf(ch) : -1; },
  getChatHistoryBrief: (_c, ref) => {
    const ch = findChar(ref ?? 'current'); if (!ch) return [];
    return S.chats.filter(x => x.charIds.includes(ch.id)).sort((a, b) => b.updatedAt - a.updatedAt).map(x => ({ file_name: x.id, file_id: x.id, chat_name: x.name, mes: x.preview || '', last_mes: x.updatedAt, chat_items: x.count || 0, file_size: '' }));
  },
  getChatHistoryDetail: async (_c, list) => {
    const out: Obj = {};
    for (const it of (Array.isArray(list) ? list : []) as Obj[]) {
      const id = str(it.file_name ?? it.file_id).replace(/\.jsonl$/, ''), c = S.get('chats', id); if (!c) continue;
      out[id] = (await S.msgs(id)).map(m => ({ name: m.name, is_user: m.role === 'user', is_system: m.role === 'system', mes: msgText(m), send_date: new Date(m.ts).toISOString(), swipe_id: m.sw, swipes: m.swipes.map(s => s.text) }));
    }
    return Object.keys(out).length ? out : null;
  },
  // ── persona ──
  getPersonaNames: () => S.personas.map(p => p.name),
  getPersonaIds: () => S.personas.map(p => p.id),
  getCurrentPersonaName: () => S.persona(chat())?.name ?? null,
  getCurrentPersonaId: () => S.persona(chat())?.id ?? null,
  getPersonaAvatarPath: (_c, ref) => findPersona(ref ?? 'current')?.avatar || null,
  getPersona: (_c, ref) => toPersona(needPersona(ref ?? 'current')),
  createPersona: async (_c, name, x) => {
    const n = str(name).trim(); if (!n || n === 'current' || S.personas.some(p => p.name === n)) return false;
    const p = newPersona({ name: n }); await writePersona(p, isObj(x) ? { ...x, name: n } : {}, true); return true;
  },
  createOrReplacePersona: async (c, name, x) => { const p = S.personas.find(y => y.name === str(name)); if (p) { await writePersona(p, isObj(x) ? x : {}, false); return false; } return chars.createPersona(c, name, x); },
  replacePersona: async (_c, ref, x) => { await writePersona(needPersona(ref ?? 'current'), isObj(x) ? x : {}, false); },
  deletePersona: async (c, ref) => {
    const p = findPersona(ref ?? 'current'); if (!p) return false;
    if (S.personas.length < 2) return fail('lastPersona');
    if (!(await mayDelete(c, t('th.what.persona'), p.name))) return false;
    const before = clone(p);
    await S.remove('personas', p.id);
    if (S.settings.activePersona === p.id) S.set({ activePersona: S.personas[0].id });
    const undo = await remember('personas', p.id, p.name, before as unknown as Obj, true);
    if (c.script) undoToast(t('th.undo.deleted', { what: t('th.what.persona'), name: p.name }), undo);
    return true;
  },
};

// ── 캐릭터 · 프리셋 · 스크립트 변수 (variables 의 character · preset · script) ──
/** 캐릭터 변수: 카드의 extensions.tavern_helper.variables (실리태번과 같은 자리라 카드와 함께 다닌다) */
export const charVars = (ch: Char | null): Obj => { const v = thOf(ch?.ext).variables; return isObj(v) ? v : {}; };
export async function setCharVars(ch: Char, v: Obj) { ch.ext = { ...(ch.ext || {}), tavern_helper: { scripts: [], ...thOf(ch.ext), variables: v } }; await S.save('chars', ch, true); }
