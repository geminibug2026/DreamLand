// 차림: 대화 하나의 차림 전체에 이름을 붙여 두고 다른 대화에 입힌다
// 기존 "연결 프로필"(settings.profiles — 연결 · 모델 · 프리셋 · 서식)에 fit 칸 하나를 더한 것이다. fit 이 없는 옛 프로필도 그대로 차림이다.
//   fit = { persona, lore, note, tr, crew, bg } — 들어 있는 칸만 입힌다
// 입히면 chat.profileId 에 묶인다 (대화를 열 때 연결 · 프리셋이 따라 바뀌는 것은 src/flow 가 하던 그대로).
import type { Chat, Note } from '../lib/types';
import { S, uid } from '../lib/core';
import { applyProfile, findProfile, profiles, snapshot, type Profile } from '../flow/logic';
import { t } from '../i18n';
import { cfg, keep, type RChat } from './route';

export interface TrFit { auto: boolean; lang: string; autoInput: boolean; inputLang: string }
export interface Fit { persona?: string; lore?: string[]; note?: Note; tr?: TrFit; crew?: Record<string, boolean>; bg?: string }
export type Outfit = Profile & { fit?: Fit };
export type Part = 'conn' | 'preset' | keyof Fit;
export const PARTS: Part[] = ['conn', 'preset', 'persona', 'lore', 'note', 'tr', 'crew', 'bg'];
type FChat = RChat & { crew?: { on?: Record<string, boolean> } };
const copy = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
/** 배경 그림은 설정에 함께 저장되므로 너무 크면 담지 않는다 */
const BG_MAX = 400000;

export const outfits = () => profiles() as Outfit[];
export const wornBy = (chat?: Chat | null) => (chat?.profileId ? findProfile(chat.profileId) : null) as Outfit | null;
export const wearers = (o: Outfit, except = '') => S.chats.filter(c => c.profileId === o.id && c.id !== except);
/** 이 차림에 들어 있는 칸들 */
export const partsOf = (o: Outfit): Part[] => PARTS.filter(k => k === 'conn' ? !!o.connId : k === 'preset' ? !!o.presetId || Object.values(o.tpl || {}).some(Boolean) : o.fit?.[k] !== undefined);

/** 지금 대화의 차림을 뜬다. parts 에 든 칸만 담는다 */
export function capture(chat: FChat, name: string, parts: Part[] = PARTS): Outfit {
  const base = snapshot(name) as Outfit, has = (k: Part) => parts.includes(k), conn = S.connFor(chat), tr = S.settings.translate;
  if (has('conn')) { base.connId = conn?.id || ''; base.model = conn?.model || ''; } else { base.connId = ''; base.model = ''; }
  if (has('preset')) base.presetId = S.presetFor(chat)?.id || base.presetId; else { base.presetId = ''; base.tpl = {}; base.instructOn = null; }
  const fit: Fit = {};
  if (has('persona')) fit.persona = S.persona(chat)?.id || '';
  if (has('lore')) fit.lore = [...(chat.loreIds || [])];
  if (has('note')) fit.note = copy(chat.note || { text: '', depth: 4, role: 'system' });
  if (has('tr')) fit.tr = { auto: !!tr.auto, lang: tr.lang || '', autoInput: !!tr.autoInput, inputLang: tr.inputLang || '' };
  if (has('crew')) fit.crew = copy(chat.crew?.on || {});
  if (has('bg') && String(chat.bg || '').length <= BG_MAX) fit.bg = chat.bg || '';
  base.fit = fit; return base;
}
/** 대화에 적히는 칸만 입힌다 (저장은 부른 쪽이). 지워진 페르소나 · 로어북은 건너뛰고 그 이름을 돌려준다 */
export function dress(chat: FChat, o: Outfit): string[] {
  const f = o.fit || {}, miss: string[] = [];
  chat.profileId = o.id;
  if (f.persona !== undefined && f.persona) { if (S.get('personas', f.persona)) { chat.personaId = f.persona; chat.personaAuto = false; } else miss.push(t('reach.fit.part.persona')); }
  if (f.lore) { const live = f.lore.filter(id => S.get('lore', id)); chat.loreIds = live; if (live.length < f.lore.length) miss.push(t('reach.fit.part.lore')); }
  if (f.note) chat.note = copy(f.note);
  if (f.crew) chat.crew = { ...(chat.crew || {}), on: copy(f.crew) };
  if (f.bg !== undefined) chat.bg = f.bg;
  if (o.connId && S.get('conns', o.connId)) { chat.modelConn = ''; chat.model = ''; chat.mix = false; }   // 차림의 연결이 이 대화에서 따로 고른 모델보다 앞선다
  return miss;
}
/** 번역 설정처럼 대화가 아니라 앱 설정에 있는 칸: 그 차림의 대화를 열 때 맞춘다 */
export function applyGlobals(o: Outfit) { const tr = o.fit?.tr; if (!tr) return; const cur = S.settings.translate; if (cur.auto === tr.auto && cur.lang === tr.lang && cur.autoInput === tr.autoInput && cur.inputLang === tr.inputLang) return; Object.assign(cur, tr); S.set({}); }
/** 대화에 차림을 입힌다. 열려 있는 대화면 연결 · 프리셋도 바로 맞춘다 */
export async function wear(chat: FChat, o: Outfit, open = true): Promise<string[]> {
  const miss = dress(chat, o); await S.save('chats', chat, true);
  if (open) { applyGlobals(o); miss.push(...await applyProfile(o, true)); }
  return miss;
}
export async function undress(chat: FChat) { chat.profileId = ''; await S.save('chats', chat, true); }
/** 이 차림을 쓰는 다른 대화들에도 다시 입힌다 */
export async function syncWearers(o: Outfit, except = ''): Promise<number> {
  const list = wearers(o, except) as FChat[];
  for (const c of list) { dress(c, o); await S.save('chats', c, true); }
  return list.length;
}
/** 지금 대화의 모습으로 차림을 다시 뜬다 (이름 · id · 담는 칸은 그대로) */
export function retake(o: Outfit, chat: FChat) { const fresh = capture(chat, o.name, partsOf(o).length ? partsOf(o) : PARTS); Object.assign(o, { ...fresh, id: o.id }); S.set({ profiles: outfits() }); }
export function addOutfit(o: Outfit) { outfits().push(o); S.set({ profiles: outfits() }); return o; }
export function removeOutfit(o: Outfit) {
  const st = S.settings as unknown as { profiles: Outfit[] }; st.profiles = outfits().filter(x => x.id !== o.id);
  const C = cfg(); for (const k of Object.keys(C.modeFit)) if (C.modeFit[k] === o.id) delete C.modeFit[k];
  S.set({ profiles: st.profiles });
}
export const dupOutfit = (o: Outfit) => addOutfit({ ...copy(o), id: uid(), name: t('reach.fit.copyName', { name: o.name }) });

// ── 모드별 기본 차림: 새 대화를 열 때(게임은 게임을 시작할 때) 저절로 입힌다 ──
export const MODES = ['rp', 'talk', 'game'] as const;
export const modeFit = (mode: string) => outfits().find(o => o.id === cfg().modeFit[mode]) || null;
export function setModeFit(mode: string, id: string) { const C = cfg(); if (id) C.modeFit[mode] = id; else delete C.modeFit[mode]; keep(); }
/** 아직 아무 차림도 입지 않은 대화에만 입힌다 */
export async function autoDress(chat: FChat, mode: string, open: boolean): Promise<Outfit | null> {
  const o = modeFit(mode); if (!o || chat.profileId || chat.temp) return null;
  await wear(chat, o, open); return o;
}
