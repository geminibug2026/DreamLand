// 흐름: 자동 이어쓰기 · 자동 다시 생성 · 재생성 이유 · 연출 지시 · 체크포인트 · 연결 프로필의 로직 (옛 js/f-flow.js, 아직 켜지 않은 기능)
// 대화 화면에는 X 등록부 · 이벤트 · chatApi 로만 닿는다.
import { L, mod } from '../legacy';
import { B, type CharX, type ChatX, type Conn, type Msg } from '../addons/legacy';

export const cur = () => B.chat.current();
const copy = <T,>(o: T): T => { try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)) as T; } };
export { copy };
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const now = () => Date.now();
export const saveChat = (c: ChatX) => B.S.save('chats', c, true);
export const charsOf = (chat?: ChatX | null): CharX[] => (chat?.charIds || []).map(id => B.S.get('chars', id)).filter((x): x is CharX => !!x);
export const waitIdle = async (stopped = () => false, max = 900000) => { const t0 = now(); while (cur().busy) { if (stopped()) throw new Error('멈췄어요'); if (now() - t0 > max) throw new Error('생성이 끝나지 않아 멈췄어요'); await sleep(150); } };

// ════════ 사용자가 생성을 멈췄는지 (자동 진행이 다시 시작하지 않도록) ════════
const gen = { startedAt: 0, abortedAt: 0 };
const userStopped = () => gen.abortedAt >= gen.startedAt && gen.startedAt > 0;

// ════════ 자동 이어쓰기 · 자동 다시 생성 ════════
// 둘 다 모델을 한 번씩 더 부른다. 기본은 꺼짐이고, 답변 하나에 쓸 수 있는 횟수를 정해 둔다.
export interface AutoCfg { cont: { on: boolean; target: number; max: number; talk: boolean }; swipe: { on: boolean; minLen: number; words: string[]; threshold: number; max: number } }
export const A = () => B.S.settings.auto as AutoCfg;
export const autoStat = { calls: 0, note: '' };
const tally = { swipes: new Map<string, number>(), conts: new Map<string, number>(), len: new Map<string, number>() };
interface Reply { msg: Msg; chat: ChatX; at: number }
let pending: Reply | null = null;
/** 다시 생성할 까닭이 있으면 그 까닭을 글로 */
export function swipeReason(text: unknown, W = A().swipe): string {
  const t = String(text || '').trim();
  if (+W.minLen > 0 && t.length < +W.minLen) return `${t.length}자 — 최소 ${W.minLen}자보다 짧음`;
  const words = (W.words || []).map(w => String(w).trim()).filter(Boolean), low = t.toLowerCase();
  const hits = words.filter(w => low.includes(w.toLowerCase()));
  if (words.length && hits.length >= Math.max(1, +W.threshold || 1)) return `금칙어 ${hits.slice(0, 3).join(', ')}${hits.length > 3 ? ` 외 ${hits.length - 3}개` : ''}`;
  return '';
}
async function afterReply(R: Reply, type?: string) {
  const a = A(), { chat, msgs, busy } = cur(), toast = B.ui.toast;
  if ((!a.cont.on && !a.swipe.on) || busy || chat !== R.chat || msgs[msgs.length - 1] !== R.msg || R.msg.role !== 'assistant' || userStopped()) return;
  const text = B.core.msgText(R.msg), key = R.msg.id;
  if (a.swipe.on) {
    const why = swipeReason(text);
    if (why) {
      const n = tally.swipes.get(key) || 0, max = Math.max(1, +a.swipe.max || 1);
      if (n >= max) { if (n === max) { tally.swipes.set(key, n + 1); toast(`자동 다시 생성을 ${max}번 했지만 조건을 채우지 못했어요 (${why})`); } return; }
      tally.swipes.set(key, n + 1); autoStat.calls++; autoStat.note = `자동 다시 생성 ${n + 1}/${max} · ${why}`;
      toast(`${autoStat.note} — 모델을 한 번 더 부릅니다`);
      return B.chat.generate('regen');
    }
  }
  if (a.cont.on && (chat.mode !== 'talk' || a.cont.talk || chat.scene?.on)) {
    const sk = key + ':' + R.msg.sw, n = tally.conts.get(sk) || 0, max = Math.max(1, +a.cont.max || 1), size = B.engine.tokens(text), prev = tally.len.get(sk);
    tally.len.set(sk, text.length);
    if (size >= (+a.cont.target || 0) || n >= max) return;
    if (type === 'continue' && prev != null && text.length - prev < 12) return;   // 더 쓸 말이 없으면 그만둔다
    tally.conts.set(sk, n + 1); autoStat.calls++; autoStat.note = `자동 이어쓰기 ${n + 1}/${max} · ≈${size}/${a.cont.target} 토큰`;
    B.chat.setStatus(autoStat.note);
    try { await B.chat.generate('continue'); } finally { B.chat.setStatus(''); }
  }
}

// ════════ 재생성 이유: 다시 생성할 때 한 줄 이유를 받아 그 한 번만 프롬프트에 넣는다 ════════
export const REGEN_DEFAULT = '[Note from the author for this reply only: the previous attempt was discarded. Rewrite the reply taking this into account: {{reason}}]';
export const REGEN_DRAFT = '[The discarded attempt, for reference only — do not continue it and do not reuse its wording]\n{{draft}}';
export interface RegenCfg { ask?: boolean; format?: string; withDraft?: boolean; recent?: string[] }
export const regenCfg = () => B.S.settings.regenWhy as RegenCfg;
const why = { text: '', draft: '' };
/** 이유를 반영해 마지막 답변을 다시 생성한다 */
export async function regenWith(reason: unknown) {
  const { chat, msgs, busy } = cur(); const last = msgs?.[msgs.length - 1];
  if (!chat || busy) return; if (last?.role !== 'assistant') return B.ui.toast('다시 생성할 답변이 없어요');
  const r = String(reason || '').trim();
  if (r) { const R = regenCfg(); R.recent = [r, ...(R.recent || []).filter(x => x !== r)].slice(0, 6); B.S.set({ regenWhy: R }); }
  why.text = r; why.draft = B.core.msgText(last).slice(0, 6000);
  try { await B.chat.generate('regen'); } finally { why.text = ''; why.draft = ''; }
}

// ════════ 연출 지시 모드: 보낸 글을 대사가 아니라 작가의 지시로 다룬다 (프롬프트 쪽은 engine.js 의 directText) ════════
export const DIRECT_HINT = "[Direction from the author. This is not something {{user}} says or does inside the story. Carry it out in your next reply … ]\n{{direction}}";
export const directOn = (chat?: ChatX | null) => !!chat?.direct?.on;
export async function setDirect(chat: ChatX | null | undefined, v: boolean | 'toggle') {
  if (!chat) return; chat.direct = { ...(chat.direct || {}), on: v === 'toggle' ? !directOn(chat) : !!v };
  await saveChat(chat); dressComposer(); B.core.emit('direct:changed', chat);
  return chat.direct.on;
}
const toBottom = () => { const s = document.querySelector('.chat-scroll'); if (s) s.scrollTop = s.scrollHeight; };
/** 지시 한 번 보내기 (모드를 켜지 않고) */
export async function sendDirection(text: unknown, trigger = true) {
  const { chat, msgs, busy } = cur(); const t = String(text || '').trim(); if (!chat || !t) return '';
  if (busy) await waitIdle();
  const m = B.core.newMsg('user', t, { name: B.S.persona(chat)?.name, direct: true, ...(chat.scene?.on ? { scene: true } : {}) });
  msgs.push(m); chat.seenAt = now(); B.core.emit('message:sent', { msg: m, chat });
  await B.chat.save(); B.chat.redraw(); toBottom();
  if (trigger) await B.chat.generate('normal');
  return t;
}
export function dressComposer() {
  const { chat } = cur(), box = document.querySelector('.composer'), inp = document.querySelector<HTMLTextAreaElement>('.composer-input'); if (!box || !inp) return;
  const onNow = directOn(chat);
  if (inp.dataset.ph == null) inp.dataset.ph = inp.placeholder;
  box.classList.toggle('is-direct', onNow);
  inp.placeholder = onNow ? '연출 지시를 적어 주세요 — 대사가 아니라 "이런 일이 벌어진다"를 작가로서 적습니다' : inp.dataset.ph;
}

// ════════ 체크포인트: 이름 붙인 지점. 그 지점에서 새 갈래를 열거나, 지금 방을 그 지점으로 되돌린다 ════════
// chat.checkpoints = [{ id, name, msgId, at, ts }] · 갈래는 기존 분기와 같은 chat.parent = { id, at } 로 이어진다
export interface Checkpoint { id: string; name: string; msgId: string; at: number; ts: number }
export const cps = (chat: ChatX) => (chat.checkpoints ||= []) as Checkpoint[];
export const posOf = (cp: Checkpoint, msgs: Msg[]) => { const i = msgs.findIndex(m => m.id === cp.msgId); return i >= 0 ? i : -1; };
export async function addCheckpoint(msg?: Msg | null, name?: string) {
  const { chat, msgs } = cur(); msg ||= msgs?.[msgs.length - 1]; if (!chat || !msg) throw new Error('체크포인트를 남길 메시지가 없어요');
  const list = cps(chat), at = msgs.indexOf(msg) + 1, id = msg.id;
  let cp = list.find(c => c.msgId === id);
  if (cp) cp.name = name || cp.name; else { cp = { id: B.core.uid(), name: name || `체크포인트 ${list.length + 1}`, msgId: id, at, ts: now() }; list.push(cp); }
  await saveChat(chat); decorate(); B.core.emit('checkpoints:changed', chat); return cp;
}
export async function removeCheckpoint(cp: Checkpoint) { const { chat } = cur(); if (!chat) return; chat.checkpoints = cps(chat).filter(c => c !== cp && c.id !== cp.id); await saveChat(chat); decorate(); B.core.emit('checkpoints:changed', chat); }
export const findCheckpoint = (key: unknown) => { const { chat } = cur(); const k = String(key || '').trim().toLowerCase(); return chat ? cps(chat).find(c => c.id === key || c.name.toLowerCase() === k) : null; };
/** 그 메시지가 보이게 한다 (위쪽에 접혀 있으면 펼친다) */
export async function showMessage(id: string) {
  for (let i = 0; i < 60 && !document.querySelector(`.msgs [data-id="${id}"]`); i++) { const more = document.querySelector<HTMLElement>('.msgs > .more-btn'); if (!more) break; more.click(); await sleep(0); }
  const el = document.querySelector(`.msgs [data-id="${id}"]`);
  if (!el) return B.ui.toast('그 메시지를 찾지 못했어요. 지워졌을 수 있어요.');
  B.chat.scrollTo(id);
  el.classList.add('cp-flash'); setTimeout(() => el.classList.remove('cp-flash'), 1600);
}
interface Diary { to?: number }
/** idx 번째 메시지까지를 담은 새 방을 만든다 (대화 화면의 "여기서 분기"와 같은 방식) */
export async function branchAt(chat: ChatX, msgs: Msg[], idx: number, name?: string) {
  const S = B.S, DB = B.core.DB, uid = B.core.uid;
  const n = S.chats.filter(x => x.parent?.id === chat.id).length + 1;
  const fresh = B.core.newChat({ ...copy(chat), id: uid(), name: name || `${B.chat.roomName(chat)} · 분기 ${n}`, createdAt: now(), src: '', pinned: false, unread: 0, parent: { id: chat.id, at: idx + 1 },
    diary: copy(((chat.diary as Diary[] | undefined) || []).filter(d => (d.to || 0) <= idx + 1)), diaryAt: Math.min((chat.diaryAt as number) || 0, idx + 1), checkpoints: copy(cps(chat).filter(c => { const p = posOf(c, msgs); return p >= 0 && p <= idx; })) });
  const list = copy(msgs.slice(0, idx + 1));
  const pics = new Map((await DB.byOwner('chat:' + chat.id)).filter(a => a.kind === 'illust').map(a => [a.id, a]));   // 삽화는 대화방마다 따로 보관한다
  for (const m of list) for (const sw of m.swipes || []) for (const it of sw.illust || []) { const a = pics.get(it.id); if (!a) continue; const id = uid(); await DB.put('assets', { ...a, id, owner: 'chat:' + fresh.id }); it.id = id; }
  const mem = await DB.get('mem', chat.id).catch(() => null) as object | null; if (mem) await DB.put('mem', { ...copy(mem), id: fresh.id });
  await S.saveMsgs(fresh, list);
  return fresh;
}
export async function branchFromCheckpoint(cp: Checkpoint, open = true) {
  const { chat, msgs } = cur(), i = chat ? posOf(cp, msgs) : -1; if (!chat || i < 0) throw new Error('그 지점의 메시지가 지워져서 갈래를 열 수 없어요');
  const fresh = await branchAt(chat, msgs, i, `${B.chat.roomName(chat)} · ${cp.name}`);
  B.ui.toast(`"${cp.name}" 지점에서 새 방을 열었어요`, 'ok'); if (open) B.ui.go('chat', fresh.id); return fresh;
}
/** 지금 방을 그 지점으로 되돌린다. 되돌리기 전 상태는 갈래 방으로 남긴다 */
export async function rewindTo(cp: Checkpoint) {
  const toast = B.ui.toast, { chat, msgs, busy } = cur(); if (!chat) return; const i = posOf(cp, msgs); if (busy) return toast('생성이 끝난 뒤에 해 주세요');
  if (i < 0) throw new Error('그 지점의 메시지가 지워져서 되돌릴 수 없어요');
  const cut = msgs.length - 1 - i; if (!cut) return toast('이미 그 지점이에요');
  if (!(await B.ui.confirmBox(`"${cp.name}" 뒤의 메시지 ${cut}개를 이 방에서 걷어 낼까요? 지금 상태는 "되돌리기 전" 방으로 따로 남겨 둡니다.`, '되돌리기'))) return;
  const d = new Date(), keep = await branchAt(chat, msgs, msgs.length - 1, `${B.chat.roomName(chat)} · 되돌리기 전 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  const alive = new Set(msgs.slice(0, i + 1).map(m => m.id));
  msgs.splice(i + 1); chat.checkpoints = cps(chat).filter(c => alive.has(c.msgId));
  if ((chat.summaryAt || 0) > msgs.length) chat.summaryAt = msgs.length;
  await B.chat.save(); B.ui.go('chat', chat.id);
  toast(`"${cp.name}"(으)로 되돌렸어요. 걷어 낸 뒤쪽은 "${keep.name}" 방에 있습니다.`, 'ok');
}

// ════════ 화면에 덧붙이는 표시: 연출 꼬리표 · 체크포인트 깃발 (남이 그린 대화 화면 위에 얹는다) ════════
const svgIcon = (name: string, size: number) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', String(size)); s.setAttribute('height', String(size)); s.classList.add('ic'); s.innerHTML = `<path d="${L.ui.I[name] || L.ui.I.sparkle}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`; return s; };
const fail = (e: unknown) => B.ui.toast(e instanceof Error ? e.message : String(e), 'err');
/** 체크포인트 깃발 · 목록에서 여는 메뉴 */
export const checkpointMenu = (anchor: Element, c: Checkpoint) => B.ui.menu(anchor, [
  { label: '이 지점에서 새 방 열기', ic: 'branch', onclick: () => { branchFromCheckpoint(c).catch(fail); } },
  { label: '이 방을 여기로 되돌리기', ic: 'refresh', hint: '뒤쪽은 따로 보관', onclick: () => { rewindTo(c).catch(fail); } },
  '-', { label: '체크포인트 지우기', ic: 'trash', danger: true, onclick: () => { void removeCheckpoint(c); } }]);
let decoQueued = false;
export function decorate() {
  if (decoQueued) return; decoQueued = true;
  requestAnimationFrame(() => {
    decoQueued = false;
    const { chat, msgs } = cur(), root = document.querySelector('.msgs'); if (!chat || !root) return;
    const byId = new Map(msgs.map(m => [m.id, m])), marks = new Map(cps(chat).map(c => [c.msgId, c]));
    for (const el of root.querySelectorAll<HTMLElement>('article.msg[data-id]')) {
      const m = byId.get(el.dataset.id || ''), head = el.querySelector('.msg-head'); if (!m || !head) continue;
      el.classList.toggle('is-direct', !!m.direct);
      const tag = head.querySelector('.direct-tag');
      if (m.direct && !tag) { const t = document.createElement('em'); t.className = 'badge direct-tag'; t.title = '대사가 아니라 연출 지시로 보낸 글'; t.textContent = '연출 지시'; head.append(t); } else if (!m.direct && tag) tag.remove();
      const cp = marks.get(m.id), flag = head.querySelector('.cp-flag');
      if (cp && !flag) {
        const b = document.createElement('button'); b.className = 'cp-flag'; b.title = '체크포인트 — 눌러서 할 일 고르기';
        b.addEventListener('click', () => { const now_ = cur().chat, c = marks.get(m.id) || (now_ ? cps(now_).find(x => x.msgId === m.id) : undefined); if (c) checkpointMenu(b, c); });
        const name = document.createElement('span'); name.textContent = cp.name; b.append(svgIcon('star', 12), name); head.append(b);
      } else if (cp && flag?.lastChild) flag.lastChild.textContent = cp.name; else if (!cp && flag) flag.remove();
      el.classList.toggle('has-cp', !!cp);
    }
  });
}

// ════════ 연결 프로필: 연결 · 모델 · 프리셋 · 고급 포맷팅 템플릿을 한 묶음으로 ════════
// S.settings.profiles = [{ id, name, connId, model, presetId, tpl: { context, instruct, sysprompt, reasoning }, instructOn }] · 묶기: chat.profileId / char.bind.profileId
export interface Profile { id: string; name: string; connId: string; model: string; presetId: string; tpl: Record<string, string>; instructOn: boolean | null | string }
interface Tpl { name?: string; enabled?: boolean }
interface Advanced { AF(): Record<string, Tpl | undefined>; KINDS: Record<string, string>; tplList(k: string): { name: string }[]; tplGet(k: string, name: string): unknown; tplApply(k: string, name: string): void }
export const adv = () => mod<Advanced>('advanced');
export const profiles = (): Profile[] => { const st = B.S.settings; if (!Array.isArray(st.profiles)) st.profiles = []; return st.profiles as Profile[]; };
export const TPL = () => Object.keys(adv().KINDS);
export const findProfile = (key: unknown) => { const k = String(key || '').trim().toLowerCase(); return profiles().find(p => p.id === key || p.name.toLowerCase() === k) || null; };
export function snapshot(name: string): Profile {
  const S = B.S, F = adv().AF(), conn = S.conn();
  return { id: B.core.uid(), name: name || '새 프로필', connId: (S.settings.activeConn as string) || '', model: conn?.model || '', presetId: (S.settings.activePreset as string) || '', tpl: Object.fromEntries(TPL().map(k => [k, F[k]?.name || ''])), instructOn: !!F.instruct?.enabled };
}
export const matches = (p: Profile) => {
  const S = B.S, F = adv().AF(), conn = S.get('conns', p.connId);
  return (!p.connId || !conn || (S.settings.activeConn === p.connId && (!p.model || conn.model === p.model))) && (!p.presetId || !S.get('presets', p.presetId) || S.settings.activePreset === p.presetId)
    && TPL().every(k => !p.tpl?.[k] || F[k]?.name === p.tpl[k]) && (p.instructOn == null || !!F.instruct?.enabled === !!p.instructOn);
};
export const describe = (p: Profile) => {
  const conn = B.S.get('conns', p.connId), pre = B.S.get('presets', p.presetId);
  return [p.connId ? (conn ? `${conn.name}${p.model ? ' · ' + p.model : ''}` : '지워진 연결') : '', p.presetId ? (pre ? pre.name : '지워진 프리셋') : '', ...TPL().filter(k => p.tpl?.[k]).map(k => p.tpl[k])].filter(Boolean).join(' / ') || '바꾸는 것 없음';
};
/** 프로필을 지금 설정에 적용한다. 빠진 것(지워진 연결 등)을 글로 돌려준다 */
export async function applyProfile(p: Profile, quiet = false): Promise<string[]> {
  const S = B.S, { AF, KINDS, tplGet, tplApply } = adv(), miss: string[] = [], patch: Record<string, unknown> = {}, F = AF(); let touched: Conn | null = null;
  if (p.connId) { const conn = S.get('conns', p.connId); if (!conn) miss.push('연결'); else { patch.activeConn = conn.id; if (p.model && conn.model !== p.model) { conn.model = p.model; touched = conn; } } }
  if (p.presetId) { if (S.get('presets', p.presetId)) patch.activePreset = p.presetId; else miss.push('프리셋'); }
  for (const k of TPL()) if (p.tpl?.[k]) { if (tplGet(k, p.tpl[k])) { if (F[k]?.name !== p.tpl[k]) tplApply(k, p.tpl[k]); } else miss.push(KINDS[k]); }
  if (p.instructOn != null && F.instruct) F.instruct.enabled = !!p.instructOn;
  S.set(patch);                                   // 여기까지는 기다림 없이 끝낸다 (대화 화면이 그려지기 전에 바뀌어 있도록)
  if (touched) await S.save('conns', touched, true);
  if (!quiet) B.ui.toast(miss.length ? `"${p.name}" 적용 — 찾지 못한 것: ${miss.join(', ')}` : `"${p.name}" 프로필을 적용했어요`, miss.length ? 'err' : 'ok');
  return miss;
}
export const boundProfile = (chat?: ChatX | null) => findProfile(chat?.profileId) || findProfile(charsOf(chat)[0]?.bind?.profileId);

/** 이벤트 · 프롬프트 조각 · 화면 감시를 건다 (켤 때 한 번) */
export function wire() {
  const on = B.core.on, X = B.X;
  on('generate:start', () => { gen.startedAt = now(); });
  document.addEventListener('click', e => { if ((e.target as Element | null)?.closest?.('.send.busy')) gen.abortedAt = now(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur().busy) gen.abortedAt = now(); }, true);
  on('message:received', d => { const { msg, chat } = d as { msg: Msg; chat: ChatX }; pending = { msg, chat, at: now() }; });
  on('generate:end', d => { const { chat, type } = d as { chat: ChatX; type?: string }; const R = pending; pending = null; if (R && R.chat === chat) setTimeout(() => { afterReply(R, type).catch(e => console.warn('[자동 진행]', e)); }, 380); });

  X.prompt = X.prompt.filter(p => p.owner !== 'flow');
  X.prompt.push({ owner: 'flow', fn: ({ type, commit, ctx }) => {
    if (type !== 'regen' || !why.text) return [];
    const R = regenCfg() || {};
    let content = B.engine.macro(R.format || REGEN_DEFAULT, ctx).replace(/\{\{reason\}\}/gi, () => why.text);
    if (!/\{\{reason\}\}/i.test(R.format || REGEN_DEFAULT)) content += '\n' + why.text;
    if (R.withDraft && why.draft) content += '\n' + REGEN_DRAFT.replace('{{draft}}', () => why.draft);
    if (commit) { why.text = ''; why.draft = ''; }
    return [{ where: 'end', role: 'system', content, src: '재생성 이유' }];
  } });

  on('message:sent', d => { const { msg, chat } = d as { msg?: Msg; chat: ChatX }; if (directOn(chat) && msg && !msg.direct && msg.role === 'user') msg.direct = true; });

  const page = document.getElementById('page');
  if (page) new MutationObserver(recs => {
    let m = false, c = false;
    for (const r of recs) {
      const t = r.target as HTMLElement, cl = t.classList; if (!cl) continue;
      if (cl.contains('msgs')) m = true; else if (cl.contains('composer') || cl.contains('chat-main') || t.id === 'page') { c = true; m = true; }
    }
    if (m) decorate(); if (c) dressComposer();
  }).observe(page, { childList: true, subtree: true });
  on('chat:open', () => { decorate(); dressComposer(); });

  // 대화방을 열 때 묶어 둔 프로필로 바꾼다 (대화 화면이 그려지기 전에)
  on('route', pg => {
    if (pg !== 'chat') return;
    const S = B.S, chat = S.get('chats', (B.ui.route.arg as string) || (S.settings.lastChat as string)) || [...S.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const p = chat && boundProfile(chat); if (!p || matches(p)) return;
    void applyProfile(p, true).then(miss => B.ui.toast(`묶어 둔 프로필 "${p.name}"(으)로 바꿨어요${miss.length ? ` — 찾지 못한 것: ${miss.join(', ')}` : ''}`));
  });
}
