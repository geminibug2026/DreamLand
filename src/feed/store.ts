// 밤의 게시판: 저장과 움직임 — 게시판 자료(kv 의 'feed' 한 줄) · 그림(assets, owner 'feed') · 새로 고침(호출 1번) · 내 글과 반응 · 대화에서 온 글
// 자료는 kv 한 줄이라 백업 · 자료 폴더에 저절로 들어간다. 글이 500개를 넘으면 오래된 것부터 덜어 낸다.
import { DB, S, debounce, emit, shrinkImage, uid } from '../lib/core';
import { quickCall } from '../lib/engine';
import type { IChat } from '../lib/illust';
import { canDraw as canDrawPhoto, failed, queueLoose, tracked } from '../photos/queue';
import { feedPhoto, photoScene } from '../photos/prompt';
import { go } from '../lib/router';
import { startChat } from '../chat/start';
import { chatApi } from '../chat/actions';
import type { Char, Chat, Msg } from '../lib/types';
import { toast } from '../ui';
import { t } from '../i18n';
import { ME, FEED_DEFAULTS, emptyState, type Account, type FeedCfg, type FeedState, type Note } from './types';
import { applyBatch, cleanBatch, nid, prune, removeNote, repairJson, rng, seedOf, slug, undoBatch, uniqueHandle, unseen } from './logic';
import { buildBoard, buildProfiles, members, meOf } from './prompt';

export const OWNER = 'feed';
/** 게시판 자료 (load 뒤에 채워진다) */
export let F: FeedState = emptyState();
/** 화면에 알릴 진행 상태 */
export const run = { busy: false, answering: '', drawing: new Set<string>(), fresh: new Set<string>(), loaded: false };
export const cfg = (): FeedCfg => { const s = S.settings as unknown as { feed?: Partial<FeedCfg> }, c = (s.feed ||= {}); for (const k of Object.keys(FEED_DEFAULTS) as (keyof FeedCfg)[]) if (c[k] === undefined) (c as Record<string, unknown>)[k] = FEED_DEFAULTS[k]; return c as FeedCfg; };
const changed = () => emit('feed:changed');
const write = debounce(() => { void DB.put('kv', F).catch(e => console.warn('[게시판 저장]', e)); }, 300);
export const save = () => { write(); changed(); };

// ── 그림 ──
const imgs = new Map<string, string>();
export const imgOf = (id?: string) => (id && imgs.get(id)) || '';
async function dropImgs(ids: string[]) { for (const id of ids) { imgs.delete(id); try { await DB.del('assets', id); } catch { } } }
async function putImg(data: string, name: string, more: Record<string, unknown> = {}) { const id = uid(); await DB.put('assets', { id, owner: OWNER, kind: 'feed', name, data, ts: Date.now(), ...more }); imgs.set(id, data); return id; }

export async function load() {
  const row = await DB.get('kv', 'feed') as Partial<FeedState> | undefined;
  F = { ...emptyState(), ...(row || {}), id: 'feed' } as FeedState;
  F.notes = (F.notes || []).filter(n => n && n.id && typeof n.text === 'string').map(n => ({ ...n, likes: n.likes || [], echoes: n.echoes || [] }));
  imgs.clear(); for (const a of await DB.byOwner(OWNER)) imgs.set(a.id, a.data);
  // 주인 없는 그림은 치운다 (글이 정리되며 남은 것)
  const used = new Set(F.notes.flatMap(n => [n.image, ...(n.images || [])]).filter(Boolean)); void dropImgs([...imgs.keys()].filter(id => !used.has(id)));
  run.loaded = true; changed();
}

// ── 계정 ──
export const account = (id: string): Account | undefined => F.accounts.find(a => a.id === id);
/** 내 계정 (없으면 페르소나 이름으로 만든다) */
export function myAccount(): Account {
  let a = account(ME); if (!a) { a = { id: ME, handle: uniqueHandle(S.persona(null)?.name || 'me', F.accounts.map(x => x.handle)), bio: '', voice: '', on: true, at: Date.now() }; F.accounts.push(a); }
  return a;
}
/** 참여자를 고른다. 새 캐릭터는 이름에서 딴 손잡이로 계정을 만들고(소개는 아직), 빠진 캐릭터는 끄기만 한다(글은 남는다). 새로 생긴 계정의 id 를 돌려준다 */
export function setMembers(ids: string[]): string[] {
  const want = new Set(ids), made: string[] = []; myAccount();
  for (const a of F.accounts) if (a.id !== ME) a.on = want.has(a.id);
  for (const id of ids) { if (account(id)) continue; const c = S.get('chars', id); if (!c) continue; F.accounts.push({ id, handle: uniqueHandle(c.name, F.accounts.map(x => x.handle)), bio: '', voice: '', on: true, at: Date.now(), fresh: true }); made.push(id); }
  save(); return made;
}
const helper = () => S.helperConn('all', null);
/** 새 계정들의 손잡이 · 한 줄 소개 · 말투 메모를 한 번의 호출로 짓는다 */
export async function makeProfiles(ids: string[]): Promise<number> {
  const chars = ids.map(id => S.get('chars', id)).filter((c): c is Char => !!c); if (!chars.length) return 0;
  const p = buildProfiles(chars, cfg()), raw = await quickCall(p.system, p.user, { maxTokens: 300 + chars.length * 220, conn: helper(), lowThink: true });
  const got = repairJson(raw) as { profiles?: unknown } | unknown[] | null, rows = Array.isArray(got) ? got : Array.isArray(got?.profiles) ? got!.profiles as unknown[] : [];
  let n = 0;
  rows.forEach((r, i) => {
    const o = (r || {}) as Record<string, unknown>, c = chars.find(x => x.name.trim().toLowerCase() === String(o.name ?? '').trim().toLowerCase()) || (rows.length === chars.length ? chars[i] : undefined), a = c && account(c.id); if (!a) return;
    const h = slug(String(o.handle ?? '').replace(/^@/, '')).slice(0, 16); if (h && h !== 'note') a.handle = uniqueHandle(h, F.accounts.filter(x => x !== a).map(x => x.handle));
    a.bio = String(o.bio ?? '').replace(/\s+/g, ' ').trim().slice(0, 80); a.voice = String(o.voice ?? '').replace(/\s+/g, ' ').trim().slice(0, 240); delete a.fresh; n++;
  });
  save(); return n;
}

// ── 새로 고침 ──
const tidy = async () => { const gone = prune(F, 500); if (gone.length) await dropImgs(gone); };
/** 게시판을 한 번 새로 고친다 = 호출 1번 (답이 깨져 끝내 못 읽으면 한 번 더). 새로 들어온 글 수를 돌려준다 */
export async function refresh({ auto = false }: { auto?: boolean } = {}): Promise<number> {
  if (run.busy) return 0;
  if (!members(F).length) { if (!auto) toast(t('feed.err.noMembers'), 'err'); return 0; }
  run.busy = true; changed();
  try {
    const now = Date.now(), c = cfg(), id = nid('b'), built = await buildBoard(F, c, { now, rnd: rng(seedOf(id)) });
    let clean = null as ReturnType<typeof cleanBatch> | null;
    for (let turn = 0; turn < 2 && !clean; turn++) {
      const raw = await quickCall(built.system, built.user, { maxTokens: c.maxTokens, conn: helper() });
      const got = repairJson(raw), cb = got ? cleanBatch(got, { who: built.who, me: built.me, refs: built.refs, notes: F.notes, quota: built.quota, maxText: 500 }) : null;
      if (cb && (cb.notes.length || cb.acts.length)) clean = cb; else console.warn('[게시판] 답을 읽지 못했어요', turn ? '(다시 해도)' : '(한 번 더 해 봅니다)', cb?.dropped || String(raw).slice(0, 200));
    }
    if (!clean) { if (!auto) toast(t('feed.err.parse'), 'err'); return 0; }
    const log = applyBatch(F, clean, { id, now, rnd: rng(seedOf(id) + 1) });
    run.fresh = new Set(log.notes); await tidy(); save();
    if (c.autoImage && canDraw()) { const first = F.notes.find(n => log.notes.includes(n.id) && n.imagePrompt && !n.image); if (first) void draw(first.id); }   // 저절로 그리는 것은 묶음마다 한 장만
    return log.notes.length;
  } catch (e) { console.warn('[게시판]', e); if (!auto) toast(t('feed.err.call', { err: (e as Error).message || String(e) }), 'err'); return 0; }
  finally { run.busy = false; changed(); }
}
/** 이 글(내 글이나 내 답글)에 대해서만 지금 답을 받는다 = 작은 호출 1번 */
export async function answerNow(noteId: string): Promise<number> {
  const note = F.notes.find(n => n.id === noteId); if (!note || run.busy || run.answering) return 0;
  if (!members(F).length) { toast(t('feed.err.noMembers'), 'err'); return 0; }
  run.answering = noteId; changed();
  try {
    const now = Date.now(), id = nid('b'), built = await buildBoard(F, cfg(), { now, only: note });
    const raw = await quickCall(built.system, built.user, { maxTokens: 500, conn: helper(), lowThink: true });
    const got = repairJson(raw), clean = got ? cleanBatch({ acts: (got as { acts?: unknown }).acts }, { who: built.who, me: built.me, refs: built.refs, notes: F.notes, maxText: 400 }) : null;
    if (!clean?.acts.length) { toast(t('feed.answer.none')); return 0; }
    // 작은 호출은 "방금 묶음"을 덮지 않는다 — 되돌리기는 새로 고침 것만
    const keep = F.last, keepAt = F.lastAt, log = applyBatch(F, clean, { id, now: now + 1000, rnd: () => 0.95 }); F.last = keep; F.lastAt = keepAt;
    run.fresh = new Set(log.notes); save(); return log.notes.length + log.likes.length;
  } catch (e) { toast(t('feed.err.call', { err: (e as Error).message || String(e) }), 'err'); return 0; }
  finally { run.answering = ''; changed(); }
}
export async function undo() { const n = F.last?.notes.length || 0; await dropImgs(undoBatch(F)); save(); return n; }

// ── 내가 하는 일 ──
export async function post(text: string, { poll, image, more, root, re }: { poll?: { q: string; opts: string[] }; image?: string; /** 둘째 그림부터 (넷까지) */ more?: string[]; root?: string; re?: string } = {}): Promise<Note | null> {
  const body = text.trim().slice(0, cfg().limit); if (!body && !image && !poll) return null;
  myAccount();
  const n: Note = { id: nid(root ? 'r' : 'n'), by: ME, text: body, ts: Date.now(), likes: [], echoes: [] };
  if (root) { n.root = root; if (re) n.re = re; }
  if (poll && !root) n.poll = { q: poll.q.trim().slice(0, 120), opts: poll.opts.map(o => o.trim().slice(0, 40)).filter(Boolean).slice(0, 4), votes: {} };
  if (n.poll && n.poll.opts.length < 2) delete n.poll;
  if (image) n.image = await putImg(await shrinkImage(image, 1280, 'image/webp', 0.88).catch(() => image) || image, 'note');
  if (image && more?.length) { n.images = []; for (const m of more.slice(0, 3)) n.images.push(await putImg(await shrinkImage(m, 1280, 'image/webp', 0.88).catch(() => m) || m, 'note')); }
  F.notes.push(n); await tidy(); save(); return n;
}
const flip = (bag: string[], who: string) => { const i = bag.indexOf(who); if (i >= 0) bag.splice(i, 1); else bag.push(who); };
export function like(id: string) { const n = F.notes.find(x => x.id === id); if (n) { flip(n.likes, ME); save(); } }
export function echo(id: string) { const n = F.notes.find(x => x.id === id); if (n) { flip(n.echoes, ME); save(); } }
export function vote(id: string, pick: number) { const n = F.notes.find(x => x.id === id); if (n?.poll && pick >= 0 && pick < n.poll.opts.length) { if (n.poll.votes[ME] === pick) delete n.poll.votes[ME]; else n.poll.votes[ME] = pick; save(); } }
export function hide(id: string, on = true) { const n = F.notes.find(x => x.id === id); if (n) { if (on) n.hidden = true; else delete n.hidden; save(); } }
export async function remove(id: string) { await dropImgs(removeNote(F, id)); save(); }
export function follow(id: string) { flip((F.follows[ME] ||= []), id); save(); }
export function markSeen() { if (unseen(F)) { F.seenAt = Date.now(); save(); } }
export async function wipe() { await dropImgs([...imgs.keys()]); const keep = F.accounts; F = { ...emptyState(), accounts: keep }; save(); }

// ── 그림 그리기 ── (사진처럼: 삽화 대기열에 넣는다. 그림 한 장 = 삽화 요청 1번)
/** 삽화가 연결되어 있나: NovelAI 키 · 로컬 SD · 이미지 연결 가운데 지금 고른 것이 채워져 있어야 한다 */
export const canDraw = canDrawPhoto;
export async function draw(noteId: string, quiet = false) {
  const n = F.notes.find(x => x.id === noteId); if (!n?.imagePrompt || n.image || run.drawing.has(noteId)) return;
  const key = 'f|' + noteId; run.drawing.add(noteId); failed.delete(key); changed();
  try {
    // 삽화 엔진은 대화 하나를 받는다 — 글쓴이만 있는 빈 방을 건네 그 캐릭터의 생김새 설정이 쓰이게 한다. 그린 뒤 보관 주인을 게시판으로 옮긴다
    // 그림 설명은 휴대폰 사진으로 그린다: "selfie: …" 처럼 종류가 앞에 있으면 그 종류로, 없으면 보여 주는 사진(찍은 사람 없이)으로 — 예전처럼 글쓴이 없이 그 장면만
    const room = { id: OWNER, charIds: n.by === ME ? [] : [n.by] } as IChat, p = feedPhoto(n.imagePrompt);
    const rec = await queueLoose(room, photoScene(room, { ...p, ...(n.by === ME ? {} : { by: n.by }) }) as unknown as Record<string, unknown>, j => { if (j) { tracked.set(key, j); changed(); } });
    await DB.put('assets', { ...rec, owner: OWNER, kind: 'feed' }); imgs.set(rec.id, rec.data); n.image = rec.id; save();
  } catch (e) { const err = (e as Error).message || String(e); failed.set(key, err); if (!quiet) toast(t('feed.err.draw', { err }), 'err'); }
  finally { tracked.delete(key); run.drawing.delete(noteId); changed(); }
}

// ── 대화에서 온 글 ── ([post: …]) 스와이프마다 따로 기억해, 넘기면 거두고 돌아오면 되살린다
export function chatPost(chat: Chat, msg: Msg, texts: string[]): string[] {
  const a = account(msg.charId); if (!a?.on || !texts.length) return [];
  // 같은 답장 자리에서 이미 올린 글이 있으면 다시 올리지 않는다 (이어쓰기로 같은 답이 다시 올 때)
  const have = F.notes.filter(n => n.src && n.src.chatId === chat.id && n.src.msgId === msg.id && n.src.sw === msg.sw);
  const ids = texts.filter(tx => !have.some(n => n.text === tx)).map(tx => { const n: Note = { id: nid(), by: msg.charId, text: tx.slice(0, 500), ts: Date.now(), likes: [], echoes: [], src: { chatId: chat.id, msgId: msg.id, sw: msg.sw } }; F.notes.push(n); return n.id; });
  if (ids.length) { run.fresh = new Set(ids); save(); }
  return ids;
}
/** 대화의 메시지가 넘겨지거나 지워졌을 때: 지금 보이는 스와이프의 글만 남긴다 */
export async function reconcile(chat: Chat, msgs: Msg[]) {
  const mine = F.notes.filter(n => n.src?.chatId === chat.id); if (!mine.length) return;
  const byId = new Map(msgs.map(m => [m.id, m])); let dirty = false;
  for (const n of mine) { const m = byId.get(n.src!.msgId); if (!m) { await dropImgs(removeNote(F, n.id)); dirty = true; } else { const off = m.sw !== n.src!.sw; if (!!n.off !== off) { if (off) n.off = true; else delete n.off; dirty = true; } } }
  if (dirty) save();
}
/** 대화가 지워지면 거기서 올라온 글도 거둔다 */
export async function dropChat(chatId: string) { const ids = F.notes.filter(n => n.src?.chatId === chatId).map(n => n.id); for (const id of ids) await dropImgs(removeNote(F, id)); if (ids.length) save(); }

// ── 이 글로 대화 시작 ──
/** 그 캐릭터와의 대화(가장 최근의 1:1, 없으면 새 대화 모드 방)를 열고 입력창에 글을 인용해 둔다. 보내는 것은 내가 */
export async function talkAbout(noteId: string) {
  const n = F.notes.find(x => x.id === noteId); if (!n || n.by === ME) return;
  const room = S.chats.filter(c => c.charIds.length === 1 && c.charIds[0] === n.by && !(c as { temp?: boolean }).temp).sort((a, b) => (b.mode === 'talk' ? 1 : 0) - (a.mode === 'talk' ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0))[0] || await startChat([n.by], { open: false, mode: 'talk' });
  if (!room) return;
  const quote = t('feed.quote', { text: n.text.replace(/\s+/g, ' ').slice(0, 160) }) + '\n';
  go('chat', room.id);
  // 방이 열려 입력창이 생길 때까지 잠깐 기다린다
  let tries = 0; const put = () => { const cur = chatApi.current().chat; if (cur?.id === room.id && chatApi.getInput && chatApi.setInput) { if (!chatApi.getInput().includes(quote.trim())) chatApi.setInput(quote + chatApi.getInput()); } else if (tries++ < 20) setTimeout(put, 150); };
  setTimeout(put, 200);
}

// ── 자동 새로 고침 ── (기본 꺼짐. 앱이 열려 있고 화면이 보일 때만, 깨어 있는 16시간을 횟수로 나눈 간격으로)
export function autoTick() {
  const c = cfg(), per = Math.max(0, Math.min(12, Math.round(c.auto || 0))); if (!per || run.busy || !run.loaded || document.hidden || !members(F).length) return;
  const day = new Date().toDateString(); if (F.auto.day !== day) F.auto = { day, count: 0, at: F.auto.at };
  if (F.auto.count >= per || Date.now() - Math.max(F.auto.at, F.lastAt) < 16 * 3600e3 / per) return;
  F.auto.count++; F.auto.at = Date.now(); save(); void refresh({ auto: true });
}
export { meOf, members };
