// 사진: 자료와 움직임 — 설정 · 답장에 실려 온 [photo:] 받기 · 기록에 다시 싣기 · 대기열로 그리기 · 저장 · 앨범 채우기(호출 1번)
// 모델 호출은 늘지 않는다: 사진 명령은 보통 답장에 실려 오고, 그림은 삽화의 자동 처리(바로 그리기 · 초안만)를 따른다. 앨범 채우기만 누를 때 호출 1번.
import { S, emit, msgText, now, uid } from '../lib/core';
import { Illust, type AssetRec, type IChat, type IMsg } from '../lib/illust';
import { TALK_SELFIE_LINE, quickCall, type TalkCmd } from '../lib/engine';
import { parseLoose } from '../lib/memory';
import type { PromptInfo, PromptPiece } from '../lib/hooks';
import type { Chat, IllustItem, Msg, Swipe } from '../lib/types';
import { chatApi, redraw } from '../chat/actions';
import { inCall } from '../call/logic';
import { ownJobs, schedule } from '../scenebook/decorate';
import { toast } from '../ui';
import { getLang, t } from '../i18n';
import { PHOTO_DEFAULTS, type AlbumPhoto, type PhotoCfg, type PhotoItem, type PhotoState, type SentPhoto } from './types';
import { ALBUM_PROMPT, PHOTO_PROMPT, kindOf, photoScene, readable, withPhotoLines } from './prompt';
import { failed, jobOf, portrait, queueLoose, tracked } from './queue';

type Bag = Record<string, unknown>;
type LiveChat = Chat & { sceneLive?: boolean; photoAlbum?: AlbumPhoto[] };

// ── 설정 ──
export const cfg = (): PhotoCfg => { const s = S.settings as unknown as { photos?: Partial<PhotoCfg> }, c = (s.photos ||= {}) as Bag; for (const [k, v] of Object.entries(PHOTO_DEFAULTS)) if (c[k] === undefined) c[k] = v; return c as unknown as PhotoCfg; };
export function setCfg(patch: Partial<PhotoCfg>) { Object.assign(cfg(), patch); S.set({}); changed(); }
/** 알림: 사진 목록 · 상태가 바뀌었다 (대화의 사진 말풍선도 다시 놓는다) */
export function changed() { emit('photos:changed'); schedule(); }

/** 지금 이 대화가 사진 주고받기로 문자하는 중인가: 설정이 켜져 있고, 대화 모드이고, 마주 보는 장면이 열려 있지 않고, 통화(음성 메시지 포함) 중이 아니다 */
export const photoTalk = (chat: Chat | null | undefined, call = false): boolean => !!chat && cfg().talk === 'photo' && chat.mode === 'talk' && !(chat as LiveChat).sceneLive && !chat.scene?.on && !call && !inCall(chat);

// ── 자료 ──
export const photosOf = (sw: Swipe | undefined): SentPhoto[] => (sw?.photos as SentPhoto[] | undefined) || [];
export const albumOf = (chat: Chat): AlbumPhoto[] => ((chat as LiveChat).photoAlbum ||= []);
/** 그 사진을 그린 삽화 자리 (없으면 아직 글로만 있다) */
export const slotOf = (sw: Swipe | undefined, p: SentPhoto): IllustItem | undefined => (sw?.illust || []).find(it => (!!p.slot && it.slotId === p.slot) || it.photo === p.id);
export const sentKey = (chatId: string, msgId: string, id: string) => `s|${chatId}|${msgId}|${id}`;
export const albumKey = (chatId: string, id: string) => `a|${chatId}|${id}`;
export const feedKey = (noteId: string) => `f|${noteId}`;
/** 그 사진의 지금 상태 (그림이 있으면 done) */
export function stateOf(key: string, drawn: boolean): { state: PhotoState; error?: string } {
  if (drawn) return { state: 'done' };
  const j = tracked.get(key); if (j && (j.state === 'waiting' || j.state === 'running')) return { state: j.state === 'running' ? 'drawing' : 'queued' };
  const e = failed.get(key); return e ? { state: 'failed', error: e } : { state: 'text' };
}
const busy = (key: string) => { const s = stateOf(key, false).state; return s === 'queued' || s === 'drawing'; };

// ── 답장에 실려 온 사진 ── (src/chat/actions 의 photoHook.take)
/** [photo: …] · [selfie: …] 를 받아 그 답장에 사진으로 붙인다. 사진 주고받기가 아니면 false (예전처럼 셀카 장면을 그린다) */
export function takeCommand(chat: Chat, _msgs: Msg[], target: Msg, c: TalkCmd): boolean {
  if (!photoTalk(chat) || target.scene) return false;
  const sw = target.swipes[target.sw]; if (!sw) return false;
  const list = ((sw.photos as SentPhoto[] | undefined) ||= []);
  if (list.length >= 4) return true;   // 한 답장에 넷까지 (넘치는 것은 버린다)
  const a = c.args, kind = c.name === 'selfie' ? 'selfie' : kindOf(a.kind), alt = (a.alt || a.caption || '').trim(), outfit = (a.outfit || '').trim();
  const shows = (a.shows || a.context || a.prompt || '').trim() || alt || (kind === 'shot' ? 'scenery' : 'smile');
  const lines = msgText(target).split('\n').filter(l => l.trim()).length;
  const p: SentPhoto = { id: uid(), kind, shows: shows.slice(0, 600), ...(alt ? { alt: alt.slice(0, 200) } : {}), ...(outfit ? { outfit: outfit.slice(0, 200) } : {}), at: Math.min(lines, c.at ?? lines), ...(c.after ? { after: c.after.slice(0, 200) } : {}), by: target.charId, ts: now() };
  list.push(p);
  if (Illust.cfg().automatic === 'generate') drawSent(chat, target, p, true);   // 바로 그리기: 지금 그린다. 초안만 · 끄기: 사진 카드로 두고 누를 때 그린다
  changed(); return true;
}
/** 이 답장에 장면 삽화를 따로 그리지 않는다: 사진 주고받기에서 문자로 주고받은 답장 (마주 보는 장면의 답장은 그대로) */
export const noScene = (chat: Chat, m: Msg) => cfg().talk === 'photo' && chat.mode === 'talk' && !m.scene;
/** 명령 안내의 사진 줄: 사진 주고받기면 따로 싣는 <photos> 안내가 맡고, 장면처럼이면 예전 셀카 줄. 통화 · 음성 메시지에는 없다 */
export const photoLine = (chat: Chat) => inCall(chat) ? '' : photoTalk(chat) ? '' : TALK_SELFIE_LINE;
/** 기록에 다시 싣는 보낸 사진 (사진 주고받기에서만) */
export function historyText(m: Msg, text: string, chat: Chat): string { const list = photosOf(m.swipes?.[m.sw]); return list.length && photoTalk(chat) ? withPhotoLines(text, list) : text; }
/** 프롬프트 조각: 사진 주고받기 안내 (대화 모드에서 문자할 때만 — RP · 마주 보는 장면 · 통화 · 음성 메시지 · 대신 쓰기에는 싣지 않는다) */
export function promptPieces(info: PromptInfo): PromptPiece[] {
  return info.type !== 'impersonate' && photoTalk(info.chat, !!info.call) ? [{ where: 'end', content: PHOTO_PROMPT, src: '사진 주고받기' }] : [];
}

// ── 그리기 ──
/** 받는 동안 다른 곳에서 다시 읽은 메시지로 옮겨 적는다 (스와이프 글이 같을 때만) */
function carry(from: Msg, to: Msg) { from.swipes.forEach((sw, i) => { const x = to.swipes?.[i]; if (x && x.text === sw.text) { if (sw.illust) x.illust = sw.illust; if (sw.photos) x.photos = sw.photos; } }); }
/** 고친 메시지를 그 방에 저장한다. 열려 있는 방이면 화면도 고친다 (오래된 메시지라도 바로 쓰이게 알린다) */
async function persist(chat: Chat, m: Msg) {
  const c = chatApi.current();
  if (c.chat?.id === chat.id) { const live = c.msgs.find(x => x.id === m.id); if (!live) return; if (live !== m) carry(m, live); S.touchMsgs(live); await chatApi.save(); redraw(live, true); return; }
  const room = S.get('chats', chat.id); if (!room) return;
  const list = await S.msgsFast(chat.id), live = list.find(x => x.id === m.id); if (!live) return;
  if (live !== m) carry(m, live);
  S.touchMsgs(live); await S.saveMsgs(room, list);
}
/** 보낸 사진 한 장을 그린다 (대기열에 넣는다). 지금 보이는 스와이프의 사진만 · 이미 그렸거나 그리는 중이면 false */
export function drawSent(chat: Chat, m: Msg, p: SentPhoto, quiet = false): boolean {
  const sw = m.swipes[m.sw], key = sentKey(chat.id, m.id, p.id);
  if (!sw || !photosOf(sw).includes(p) || busy(key)) return false;
  const old = slotOf(sw, p); if (old?.id && !Illust.missing(old.id)) return false;
  failed.delete(key);
  const done = async (e: Error | null, rec?: AssetRec) => {
    tracked.delete(key);
    if (e) { failed.set(key, e.message); if (!quiet) toast(t('photos.err.draw', { err: e.message }), 'err'); changed(); return; }
    const it = rec && (sw.illust || []).find(x => x.versions?.some(v => v.id === rec.id));
    if (it) { it.photo = p.id; p.slot = it.slotId; }
    await persist(chat, m).catch(x => console.warn('[사진 저장]', x));
    changed();
  };
  Illust.enqueue(chat as unknown as IChat, m as unknown as IMsg, photoScene(chat as unknown as IChat, p) as unknown as Bag, done, { manual: true, config: portrait(), ...(old?.versions?.length ? { slot: old.slotId } : {}) });
  const j = jobOf(done); if (j) { tracked.set(key, j); ownJobs.add(j); }   // 진행은 사진 말풍선이 보여 준다 (답변 아래 삽화 칸은 두지 않는다)
  changed(); return true;
}
/** 앨범 사진 한 장을 그린다 */
export function drawAlbum(chat: Chat, a: AlbumPhoto, quiet = false): boolean {
  const key = albumKey(chat.id, a.id); if (busy(key) || (a.image && !Illust.missing(a.image))) return false;
  failed.delete(key);
  queueLoose(chat as unknown as IChat, photoScene(chat as unknown as IChat, a) as unknown as Bag, j => { if (j) tracked.set(key, j); }).then(async rec => {
    tracked.delete(key); a.image = rec.id; await S.save('chats', chat, true); changed();
  }, (e: Error) => { tracked.delete(key); failed.set(key, e.message); if (!quiet) toast(t('photos.err.draw', { err: e.message }), 'err'); changed(); });
  changed(); return true;
}

// ── 목록 ──
/** 그 방의 메시지 (열려 있으면 화면의 것) */
export async function msgsOf(chatId: string): Promise<Msg[]> { const c = chatApi.current(); return c.chat?.id === chatId ? c.msgs : S.msgsFast(chatId); }
const sizeOf = (it?: IllustItem) => { const v = it?.versions?.[it.sel ?? 0], c = v?.config; return c?.width && c?.height ? { w: c.width, h: c.height } : {}; };
/** 그 대화의 사진: 보낸 사진(지금 보이는 스와이프) + 앨범 사진. 새것부터 */
export async function listChat(chatId: string): Promise<PhotoItem[]> {
  const chat = S.get('chats', chatId); if (!chat) return [];
  const out: PhotoItem[] = [];
  for (const m of await msgsOf(chatId)) {
    if (m.role !== 'assistant') continue;
    const sw = m.swipes?.[m.sw];
    for (const p of photosOf(sw)) { const it = slotOf(sw, p), image = it?.id && !Illust.missing(it.id) ? it.id : '', key = sentKey(chatId, m.id, p.id);
      out.push({ id: key, source: 'sent', chatId, msgId: m.id, kind: p.kind, by: p.by || m.charId, shows: p.shows, alt: p.alt || readable(p.shows) || p.shows, ts: p.ts || m.ts, image, ...stateOf(key, !!image), ...sizeOf(it) }); }
  }
  for (const a of albumOf(chat)) { const key = albumKey(chatId, a.id), image = a.image && !Illust.missing(a.image) ? a.image : '';
    out.push({ id: key, source: 'album', chatId, kind: a.kind, by: a.by || chat.charIds[0] || '', shows: a.shows, alt: a.alt || readable(a.shows) || a.shows, ts: a.ts, image, ...stateOf(key, !!image) }); }
  return out.sort((x, y) => y.ts - x.ts);
}
/** id 로 그 사진을 그린다 (대화 · 앨범). 그리기 시작했으면 true */
export async function drawChatPhoto(id: string, quiet = true): Promise<boolean> {
  const [src, chatId, a, b] = id.split('|'), chat = chatId ? S.get('chats', chatId) : undefined; if (!chat) return false;
  if (src === 'a') { const e = albumOf(chat).find(x => x.id === a); return !!e && drawAlbum(chat, e, quiet); }
  if (src !== 's') return false;
  const m = (await msgsOf(chatId)).find(x => x.id === a), p = m && photosOf(m.swipes[m.sw]).find(x => x.id === b);
  return !!m && !!p && drawSent(chat, m, p, quiet);
}
/** 앨범 사진 하나를 뺀다 (그린 그림은 갤러리에 남는다) */
export async function dropAlbum(chatId: string, id: string) { const chat = S.get('chats', chatId); if (!chat) return; const list = albumOf(chat), i = list.findIndex(x => x.id === id); if (i < 0) return; list.splice(i, 1); await S.save('chats', chat, true); changed(); }

// ── 앨범 채우기 (호출 1번, 누를 때만) ──
const LANGS: Record<string, string> = { ko: 'Korean', en: 'English', 'zh-CN': 'Simplified Chinese' };
const one = (s: unknown, n: number) => { const x = String(s ?? '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
/** 지금까지의 대화를 보고 그럴듯한 사진 설명 몇 장을 앨범에 쓴다 (그림은 그리지 않는다) → 새로 넣은 사진 */
export async function describe(chatId: string, n = cfg().albumN, signal?: AbortSignal): Promise<AlbumPhoto[]> {
  const chat = S.get('chats', chatId); if (!chat) throw new Error(t('photos.err.noChat'));
  const chars = chat.charIds.map(id => S.get('chars', id)).filter((c): c is NonNullable<typeof c> => !!c); if (!chars.length) throw new Error(t('photos.err.noChat'));
  const msgs = await msgsOf(chatId), persona = S.persona(chat), k = Math.max(1, Math.min(8, Math.round(n)));
  const recent = msgs.filter(m => !m.hidden && m.role !== 'system').slice(-30).map(m => `${m.role === 'user' ? persona?.name || 'User' : m.name || chars[0].name}: ${one(msgText(m), 400)}`);
  const have = (await listChat(chatId)).slice(0, 24).map(p => `- ${p.kind}: ${one(p.shows, 120)}`);
  const sys = ALBUM_PROMPT.replace('{{n}}', String(k)).replace('{{lang}}', LANGS[getLang()] || 'the language of the chat');
  const user = [`## Characters\n${chars.map(c => `- ${c.name}: ${one([c.description, c.personality].filter(Boolean).join(' '), 300)}`).join('\n')}`, have.length ? `## Already in the album\n${have.join('\n')}` : '', `## Chat so far (oldest first)\n${recent.join('\n') || '(nothing yet)'}`].filter(Boolean).join('\n\n');
  const out = await quickCall(sys, user, { maxTokens: 250 + 160 * k, conn: S.helperConn('all', chat) || S.connFor(chat), lowThink: true, signal });
  const j = parseLoose(out) as { photos?: unknown } | unknown[] | null, rows = (Array.isArray(j) ? j : Array.isArray((j as { photos?: unknown })?.photos) ? (j as { photos: unknown[] }).photos : []) as Bag[];
  const byName = (s: unknown) => { const x = String(s ?? '').trim().toLowerCase(); return chars.find(c => c.name.trim().toLowerCase() === x) || chars.find(c => x && (c.name.toLowerCase().includes(x) || x.includes(c.name.toLowerCase()))); };
  const made: AlbumPhoto[] = rows.filter(r => r && typeof r === 'object' && String(r.shows ?? '').trim()).slice(0, k).map((r, i) => ({ id: uid(), kind: kindOf(r.kind), shows: one(r.shows, 600), ...(String(r.alt ?? '').trim() ? { alt: one(r.alt, 200) } : {}), ...(String(r.outfit ?? '').trim() ? { outfit: one(r.outfit, 200) } : {}), by: (byName(r.by) || chars[0]).id, ts: now() - (k - i) * 1000 }));
  if (!made.length) throw new Error(t('photos.album.none'));
  albumOf(chat).push(...made); await S.save('chats', chat, true); changed();
  return made;
}
