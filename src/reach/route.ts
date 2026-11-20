// 닿기(reach)의 저장 자리와, 답장 하나를 어느 연결 · 모델로 보낼지 정하는 길
// 대화마다: chat.model(모델만 덮어쓰기) · chat.modelConn(연결도 덮어쓰기) · chat.mix(섞어 쓰기) · chat.mixLast(바로 앞에 뽑힌 것)
// 설정: settings.stars = [{ c, m }] · settings.reach = { mix, modeFit, shop } · settings.helperModel = { 일: 모델 }
// 연결: conn.fallback(안 되면 이 연결로) · conn.rpm(분당 요청 수) · conn.saved(골라 쓴 모델들) · conn.mark(표식)
import type { Chat, Conn } from '../lib/types';
import { S } from '../lib/core';
import * as engine from '../lib/engine';
import { toast } from '../ui';
import { t } from '../i18n';
import { drawMix, mixKey, type MixItem } from './shuffle';
import { runWithFallback } from './fallback';
import { rpmHook } from './rpm';

export interface Star { c: string; m: string }
export interface ReachCfg { mix: MixItem[]; /** 모드(rp · talk · game)마다 새 대화에 입힐 차림 id */ modeFit: Record<string, string>; shop: { nsfw: boolean; src: string; sort: string; peek?: boolean } }
export type RChat = Chat & { model?: string; modelConn?: string; mix?: boolean; mixLast?: string };
export type RConn = Conn & { fallback?: string; rpm?: number; saved?: string[]; mark?: string };

export function cfg(): ReachCfg {
  const st = S.settings as unknown as { reach?: Partial<ReachCfg> }, c = (st.reach ||= {});
  if (!Array.isArray(c.mix)) c.mix = []; c.modeFit ||= {}; c.shop = { nsfw: false, src: 'wyvern', sort: 'hot', ...(c.shop || {}) };
  return c as ReachCfg;
}
export function stars(): Star[] { const st = S.settings as unknown as { stars?: Star[] }; if (!Array.isArray(st.stars)) st.stars = []; return st.stars; }
export const keep = () => S.set({});
export const isStar = (c: string, m: string) => stars().some(x => x.c === c && x.m === m);
export const inMix = (c: string, m: string) => cfg().mix.some(x => x.c === c && x.m === m);
export function toggleStar(c: string, m: string) { const st = S.settings as unknown as { stars: Star[] }, list = stars(); st.stars = isStar(c, m) ? list.filter(x => !(x.c === c && x.m === m)) : [...list, { c, m }]; keep(); }
export function toggleMix(c: string, m: string) { const C = cfg(); C.mix = inMix(c, m) ? C.mix.filter(x => !(x.c === c && x.m === m)) : [...C.mix, { c, m, w: 1 }]; keep(); }
/** 지워진 연결의 것은 빼고 */
export const livePool = () => cfg().mix.filter(x => S.get('conns', x.c));
export const withModel = (c: Conn, m: string): Conn => m && m !== c.model ? { ...c, model: m } : c;
/** 사본이 아닌, 저장돼 있는 그 연결 */
export const realConn = (c?: Conn | null) => c ? S.get('conns', c.id) as RConn | undefined : undefined;

/** 이 답장을 보낼 연결. 섞어 쓰는 대화면 풀에서 하나 뽑고(바로 앞과 다른 것 먼저), 흉내 내기는 따로 정해 둔 연결이 있으면 그것으로 */
export function pickReply(chat: RChat, type = 'normal', rnd: () => number = Math.random): Conn | undefined {
  if (type === 'impersonate' && S.get('conns', S.settings.helpers?.impersonate)) return S.helperConn('impersonate', chat);
  const base = S.connFor(chat);
  if (!chat.mix) return base;
  const it = drawMix(livePool(), chat.mixLast || '', rnd), conn = it && S.get('conns', it.c);
  if (!it || !conn) return base;
  chat.mixLast = mixKey(it);   // 답장을 저장할 때 대화와 함께 적힌다
  return withModel(conn, it.m);
}

export type ReplyResult = engine.StreamResult & { via: Conn; fell: boolean };
/** 주 대화의 답장 보내기: 글자가 나오기 전에 연결이 실패하면(끊김 · 429 · 5xx) conn.fallback 으로 한 번만 다시 보낸다 */
export async function streamReply(conn: Conn, P: engine.Params, messages: engine.PromptList, opts: engine.StreamOpts = {}): Promise<ReplyResult> {
  const backup = S.get('conns', (conn as RConn).fallback || '');
  const r = await runWithFallback<Conn, engine.StreamResult>(conn, backup && backup.id !== conn.id ? backup : null, opts,
    (c, sink) => engine.streamChat(c, P, messages, { ...opts, onText: sink.onText, onThink: sink.onThink, label: c === conn ? opts.label : `${opts.label || 'reply'} (fallback)` }),
    () => toast(t('reach.fb.switching', { from: conn.name, to: backup?.name || '' })));
  return { ...r.res, via: r.via, fell: r.fell };
}

// ── 이 대화의 모델 고르기 ──
export async function chooseFor(chat: RChat, conn: Conn, model: string) {
  const base = S.get('conns', S.bindOf(chat).connId as string) || S.conn();
  chat.modelConn = base && base.id === conn.id ? '' : conn.id; chat.model = model === conn.model ? '' : model; chat.mix = false;
  remember(conn as RConn, model);
  await S.save('chats', chat, true);
}
/** 골라 쓴 모델은 그 연결에 적어 둔다 (다음에 "저장해 둔 모델"로 바로 보이게) */
export function remember(conn: RConn, model: string) {
  const real = realConn(conn); if (!real || !model || model === real.model || (real.saved || []).includes(model)) return;
  real.saved = [...(real.saved || []), model].slice(-40); void S.save('conns', real, true);
}
export function forget(conn: RConn, model: string) { const real = realConn(conn); if (!real) return; real.saved = (real.saved || []).filter(x => x !== model); void S.save('conns', real, true); }
export const overridden = (chat?: RChat | null) => !!(chat && (chat.model || chat.modelConn || chat.mix));
export async function clearChoice(chat: RChat) { chat.model = ''; chat.modelConn = ''; chat.mix = false; await S.save('chats', chat, true); }
/** 이 대화에서 고른 것을 모든 대화의 기본으로 삼는다. 되돌릴 수 있게 앞의 기본을 돌려준다 */
export async function makeDefault(chat: RChat): Promise<{ connId: string; model: string } | null> {
  const now = S.connFor(chat), real = realConn(now); if (!now || !real) return null;
  const prev = { connId: (S.settings.activeConn as string) || '', model: S.conn()?.model || '' };
  if (real.model && real.model !== now.model) remember(real, real.model);   // 밀려나는 모델도 저장 목록에 남긴다
  real.model = now.model; await S.save('conns', real, true);
  S.set({ activeConn: real.id }); await clearChoice(chat);
  return prev;
}
export async function restoreDefault(prev: { connId: string; model: string }) {
  const c = S.get('conns', prev.connId); if (!c) return;
  if (prev.model) { c.model = prev.model; await S.save('conns', c, true); }
  S.set({ activeConn: c.id });
}

// ── 모델 목록 (연결마다 한 번 받아 두고 다시 쓴다) ──
const lists = new Map<string, string[]>();
export const cachedModels = (c: Conn) => lists.get(c.id) || null;
export async function loadModels(c: Conn, force = false): Promise<string[]> {
  const had = lists.get(c.id); if (had && !force) return had;
  const list = [...new Set(await engine.listModels(realConn(c) || c))]; lists.set(c.id, list); return list;
}

/** 분당 제한에 걸려 기다리게 되면 한 줄 알린다 */
export function wireRpm() {
  let last = 0;
  rpmHook.wait = (key, ms) => { if (ms < 1500 || Date.now() - last < 4000) return; last = Date.now(); toast(t('reach.rpm.waiting', { name: S.get('conns', key)?.name || '', sec: Math.ceil(ms / 1000) })); };
}
