// 밤의 게시판: 순수 계산 — 묶음 읽기(깨진 JSON 복구) · 내 이름으로 쓴 것 걸러 내기 · 묶음 넣기와 되돌리기 · 옛 글 회상 뽑기 · 글 몫 나누기
// 여기에는 저장소도 화면도 없다(자료 모양만 들여온다). 그래서 node 로 그대로 돌려 볼 수 있다. 숫자(누가 몇 개 쓰나 · 시각 · 표 수)는 모델이 아니라 여기서 정한다.
import { ME, type Account, type BatchLog, type CleanAct, type CleanBatch, type CleanNote, type FeedState, type Note, type Notice, type RawBatch } from './types';

// ── 씨앗 있는 난수 ── (시험과 회상 뽑기가 같은 씨앗에서 같은 답을 내게)
export type Rnd = () => number;
export const seedOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const rng = (seed: number): Rnd => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
let seq = 0;
export const nid = (p = 'n') => p + Date.now().toString(36) + (seq++ % 1296).toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);

// ── 손잡이 이름 ──
/** 이름 → 손잡이 (글자 · 숫자 · 밑줄만, 18자까지). 다 지워지면 'note' */
export const slug = (name: unknown) => String(name ?? '').normalize('NFKC').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 18) || 'note';
export const uniqueHandle = (base: string, taken: Iterable<string>) => { const used = new Set([...taken].map(h => h.toLowerCase())); let h = slug(base), i = 2; while (used.has(h)) h = slug(base).slice(0, 15) + '_' + i++; return h; };

// ── 깨진 JSON 복구 ──
/** 모델 답에서 JSON 을 꺼낸다. 코드 울타리 · 앞뒤 군말을 걷고, 잘렸으면 마지막으로 온전했던 자리까지만 살려 괄호를 닫는다. 끝내 못 읽으면 null */
export function repairJson(text: unknown): unknown | null {
  let s = String(text ?? '').replace(/<think(ing)?>[\s\S]*?<\/think(ing)?>/gi, '').replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');
  const at = s.search(/[{[]/); if (at < 0) return null; s = s.slice(at);
  const stack: string[] = []; let str = false, esc = false, end = -1;
  let safe = { pos: 0, stack: [] as string[] };   // 마지막으로 값 하나가 온전히 끝난 자리와 그때 열려 있던 괄호
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { if (stack[stack.length - 1] !== c) break; stack.pop(); if (!stack.length) { end = i + 1; break; } safe = { pos: i + 1, stack: [...stack] }; }
  }
  const tryParse = (t: string) => { try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')) as unknown; } catch { return undefined; } };
  if (end > 0) { const v = tryParse(s.slice(0, end)); if (v !== undefined) return v; }
  // 잘린 경우 1: 지금 자리에서 그대로 닫아 본다 (열린 문자열을 닫고, 매달린 쉼표 · 열쇠를 떼고)
  const tail = s.slice(0, end > 0 ? end : s.length);
  if (end < 0 && stack.length) {
    const closed = (str ? tail + (esc ? '\\' : '') + '"' : tail).replace(/[,:\s]+$/, '').replace(/,\s*"(?:[^"\\]|\\.)*"\s*$/, '').replace(/([{[])\s*"(?:[^"\\]|\\.)*"\s*$/, '$1');
    const v = tryParse(closed + [...stack].reverse().join('')); if (v !== undefined) return v;
  }
  // 잘린 경우 2: 마지막으로 온전했던 값까지만
  if (safe.pos > 0) { const v = tryParse(s.slice(0, safe.pos) + [...safe.stack].reverse().join('')); if (v !== undefined) return v; }
  return null;
}

// ── 걸러 내기 ──
/** 걸러 낼 때 아는 사람들. 손잡이나 이름으로 찾는다 */
export interface Who { id: string; handle: string; name: string }
export interface CleanCtx {
  /** 글을 쓸 수 있는 계정(켜진 캐릭터). 나는 넣지 않는다 */ who: Who[]; /** 내 손잡이 · 이름들 — 이 이름의 활동은 버린다 */ me: string[];
  /** 프롬프트에 적어 준 짧은 표(e1, e2 …) → 실제 글 id */ refs: Record<string, string>; /** 지금 있는 글 (투표 · 중복 확인) */ notes: Note[];
  /** 이번에 누가 몇 개까지 쓰나 (없으면 제한 없음) */ quota?: Record<string, number>; /** 글 최대 길이 */ maxText?: number;
}
const norm = (s: unknown) => String(s ?? '').replace(/^@/, '').normalize('NFKC').trim().toLowerCase();
const flat = (s: unknown) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const clip = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const list = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)) : [];
const DO: Record<string, CleanAct['do']> = { like: 'like', heart: 'like', mark: 'like', star: 'like', echo: 'echo', repost: 'echo', share: 'echo', copy: 'echo', reply: 'reply', comment: 'reply', answer: 'reply', vote: 'vote' };

/** 모델이 낸 묶음을 믿을 수 있는 모양으로. 내 이름으로 쓴 것 · 모르는 계정 · 없는 글을 가리키는 것 · 겹치는 것 · 몫을 넘는 것은 버리고 dropped 에 까닭을 적는다 */
export function cleanBatch(raw: unknown, ctx: CleanCtx): CleanBatch {
  const out: CleanBatch = { notes: [], acts: [], ties: [], dropped: [] }, drop = (why: string) => { out.dropped.push(why); };
  const b = (raw && typeof raw === 'object' ? (Array.isArray(raw) ? { notes: raw } : raw) : {}) as RawBatch;
  const mine = new Set(ctx.me.map(norm).filter(Boolean)), byKey = new Map<string, Who>();
  for (const w of ctx.who) { if (w.id === ME) continue; for (const k of [w.handle, w.name, w.id]) { const n = norm(k); if (n && !mine.has(n) && !byKey.has(n)) byKey.set(n, w); } }
  /** 누구인가: 나(또는 나와 같은 이름)면 'me', 모르면 null */
  const whoIs = (v: unknown): Who | 'me' | null => { const n = norm(v); if (!n) return null; if (n === ME || mine.has(n)) return 'me'; return byKey.get(n) || null; };
  const max = ctx.maxText || 500, existing = new Map(ctx.notes.map(n => [n.id, n])), seenText = new Set(ctx.notes.slice(-80).map(n => flat(n.text)).filter(Boolean));
  const quota = ctx.quota, total = quota ? Object.values(quota).reduce((a, n) => a + n, 0) + 2 : 12, wrote: Record<string, number> = {};

  // 글
  const local = new Map<string, CleanNote>();
  list(b.notes ?? b.posts).forEach((r, i) => {
    const w = whoIs(r.by ?? r.author ?? r.handle); if (w === 'me') return drop('note:me'); if (!w) return drop('note:who');
    const text = clip(r.text ?? r.content, max), tkey = flat(text); if (!text) return drop('note:empty');
    if (seenText.has(tkey)) return drop('note:dup');
    if (out.notes.length >= total || (quota && (wrote[w.id] || 0) >= (quota[w.id] || 0) + 1)) return drop('note:quota');
    const k = String(r.k ?? r.tempId ?? r.id ?? `n${i + 1}`).trim() || `n${i + 1}`; if (local.has(k)) return drop('note:key');
    const n: CleanNote = { k, by: w.id, text }, p = r.poll as Record<string, unknown> | undefined;
    if (p && typeof p === 'object') { const opts = (Array.isArray(p.opts ?? p.options) ? (p.opts ?? p.options) as unknown[] : []).map(o => clip(o, 40)).filter(Boolean).slice(0, 4), q = clip(p.q ?? p.question ?? '', 120); if (opts.length >= 2) n.poll = { q, opts }; }
    const img = clip(r.image ?? r.imagePrompt ?? '', 300); if (img) n.image = img;
    seenText.add(tkey); wrote[w.id] = (wrote[w.id] || 0) + 1; local.set(k, n); out.notes.push(n);
  });

  // 답글 · 공감 · 옮겨 적기 · 투표
  const replyKeys = new Map<string, string>(), done = new Set<string>();   // 묶음 안 답글 열쇠 → 매달린 글 · 한 번 한 일
  list(b.acts ?? b.interactions).forEach(r => {
    const w = whoIs(r.by ?? r.actor ?? r.actorHandle); if (w === 'me') return drop('act:me'); if (!w) return drop('act:who');
    const kind = DO[norm(r.do ?? r.type)]; if (!kind) return drop('act:kind');
    const ref = String(r.on ?? r.target ?? r.targetTempId ?? r.targetPostId ?? '').trim().replace(/^#/, '');
    const loc = local.get(ref), realId = loc ? '' : (ctx.refs[ref] || (existing.has(ref) ? ref : '')), old = realId ? existing.get(realId) : undefined;
    if (!loc && !old) return drop('act:target');
    // 답글을 가리켰으면 그 답글이 매달린 글로 올리고, 답글의 답글로 본다
    const rootId = old?.root || realId, root = loc ? null : existing.get(rootId) || null; if (!loc && !root) return drop('act:target');
    const on = loc ? loc.k : rootId, author = loc ? loc.by : root!.by, key = `${kind}|${w.id}|${loc ? 'k:' : ''}${on}`;
    if (kind === 'reply') {
      const text = clip(r.text ?? r.content, max); if (!text) return drop('act:empty'); if (seenText.has(flat(text))) return drop('act:dup');
      const a: CleanAct = { by: w.id, do: 'reply', on, local: !!loc, text }, k = String(r.k ?? r.tempId ?? '').trim();
      let under = String(r.under ?? r.parent ?? r.parentInteractionId ?? '').trim().replace(/^#/, '');
      if (!under && old?.root) under = realId;   // 기존 답글을 바로 가리킨 경우
      if (under) { if (replyKeys.get(under) === (loc ? 'k:' : '') + on) { a.under = under; a.underLocal = true; } else { const u = existing.get(ctx.refs[under] || under); if (u && u.root === on && !loc) a.under = u.id; } }
      if (k && !replyKeys.has(k) && !local.has(k)) { a.k = k; replyKeys.set(k, (loc ? 'k:' : '') + on); }
      seenText.add(flat(text)); out.acts.push(a); return;
    }
    if (done.has(key)) return drop('act:twice');
    if (kind === 'vote') {
      const poll = loc ? loc.poll : root!.poll; if (!poll) return drop('vote:nopoll');
      const pick = Math.round(Number(r.pick ?? r.pollOptionIndex ?? r.option)); if (!Number.isFinite(pick) || pick < 0 || pick >= poll.opts.length) return drop('vote:range');
      if (author === w.id) return drop('vote:own'); if (root?.poll && w.id in root.poll.votes) return drop('vote:twice');
      done.add(key); out.acts.push({ by: w.id, do: 'vote', on, local: !!loc, pick }); return;
    }
    if (author === w.id) return drop('act:self');
    if (root && (kind === 'like' ? root.likes : root.echoes).includes(w.id)) return drop('act:twice');
    done.add(key); out.acts.push({ by: w.id, do: kind, on, local: !!loc });
  });

  // 따르기 (캐릭터가 누군가를 — 나를 따르는 것은 된다)
  const tied = new Set<string>();
  list(b.ties ?? b.follows).forEach(r => {
    const a = whoIs(r.a ?? r.actor ?? r.actorHandle), z = whoIs(r.b ?? r.target ?? r.targetHandle); if (a === 'me') return drop('tie:me'); if (!a || !z) return drop('tie:who');
    const zid = z === 'me' ? ME : z.id, key = a.id + '>' + zid; if (a.id === zid || tied.has(key)) return; tied.add(key); out.ties.push([a.id, zid]);
  });
  return out;
}

// ── 묶음 넣기 · 되돌리기 ──
/** 걸러 낸 묶음을 게시판에 넣고, 되돌릴 수 있게 무엇을 했는지 돌려준다. 시각은 여기서 정한다: 지난 새로 고침부터 지금까지(10분~3시간)에 고루 흩는다 */
export function applyBatch(st: FeedState, b: CleanBatch, { id, now, rnd = Math.random }: { id: string; now: number; rnd?: Rnd }): BatchLog {
  const log: BatchLog = { id, ts: now, notes: [], likes: [], echoes: [], votes: [], ties: [] };
  const span = Math.min(3 * 3600e3, Math.max(600e3, now - (st.lastAt || now - 3600e3))), n = b.notes.length, keyId = new Map<string, string>(), byId = new Map(st.notes.map(x => [x.id, x]));
  const notice = (kind: Notice['kind'], by: string, note: Note, ts: number) => { if (note.by === ME && by !== ME) st.notices.push({ id: nid('q'), kind, by, note: note.id, ts, batch: id }); };
  b.notes.forEach((c, i) => {
    const ts = Math.round(now - span * (1 - (i + 0.3 + rnd() * 0.5) / Math.max(1, n)) - 60e3);
    const note: Note = { id: nid(), by: c.by, text: c.text, ts: Math.min(now - 30e3, ts), likes: [], echoes: [], batch: id };
    if (c.poll) note.poll = { q: c.poll.q, opts: [...c.poll.opts], votes: {} }; if (c.image) note.imagePrompt = c.image;
    st.notes.push(note); byId.set(note.id, note); keyId.set(c.k, note.id); log.notes.push(note.id);
  });
  const replyId = new Map<string, string>();
  b.acts.forEach((a, i) => {
    const target = byId.get(a.local ? keyId.get(a.on) || '' : a.on); if (!target) return;
    // 반응은 그 글보다 뒤, 지금보다 앞
    const ts = Math.round(Math.min(now - 1e3, Math.max(target.ts + 60e3, target.ts + (now - target.ts) * (0.2 + 0.7 * rnd()))) + i);
    if (a.do === 'reply') {
      const re = a.under ? (a.underLocal ? replyId.get(a.under) : a.under) : undefined, prev = re ? byId.get(re) : undefined;
      const r: Note = { id: nid('r'), by: a.by, text: a.text || '', ts: Math.max(ts, (prev?.ts || 0) + 30e3), root: target.id, likes: [], echoes: [], batch: id }; if (re && prev) r.re = re;
      st.notes.push(r); byId.set(r.id, r); log.notes.push(r.id); if (a.k) replyId.set(a.k, r.id);
      notice('reply', a.by, prev?.by === ME ? prev : target, r.ts);
    } else if (a.do === 'vote') { if (target.poll && !(a.by in target.poll.votes)) { target.poll.votes[a.by] = a.pick || 0; log.votes.push([target.id, a.by]); notice('vote', a.by, target, ts); } }
    else { const bag = a.do === 'like' ? target.likes : target.echoes; if (!bag.includes(a.by)) { bag.push(a.by); (a.do === 'like' ? log.likes : log.echoes).push([target.id, a.by]); notice(a.do, a.by, target, ts); } }
  });
  for (const [a, z] of b.ties) { const f = (st.follows[a] ||= []); if (!f.includes(z)) { f.push(z); log.ties.push([a, z]); } }
  st.notes.sort((x, y) => x.ts - y.ts); st.last = log; st.lastAt = now;
  if (st.notices.length > 80) st.notices = st.notices.slice(-80);
  return log;
}
/** 방금 묶음을 통째로 거둔다. 그 뒤에 내가 그 묶음의 글에 단 답글도 함께 사라진다. 지운 글의 그림 id 를 돌려준다 */
export function undoBatch(st: FeedState, log: BatchLog | null = st.last): string[] {
  if (!log) return [];
  const gone = new Set(log.notes), imgs: string[] = [];
  for (const n of st.notes) if (n.root && gone.has(n.root)) gone.add(n.id);
  st.notes = st.notes.filter(n => { if (!gone.has(n.id)) return true; if (n.image) imgs.push(n.image); return false; });
  const byId = new Map(st.notes.map(n => [n.id, n]));
  for (const [id, by] of log.likes) { const n = byId.get(id); if (n) n.likes = n.likes.filter(x => x !== by); }
  for (const [id, by] of log.echoes) { const n = byId.get(id); if (n) n.echoes = n.echoes.filter(x => x !== by); }
  for (const [id, by] of log.votes) { const n = byId.get(id); if (n?.poll) delete n.poll.votes[by]; }
  for (const [a, z] of log.ties) if (st.follows[a]) st.follows[a] = st.follows[a].filter(x => x !== z);
  st.notices = st.notices.filter(q => q.batch !== log.id && byId.has(q.note));
  if (st.last?.id === log.id) st.last = null;
  return imgs;
}
/** 글 하나를 지운다 (매달린 답글도). 지운 그림 id 를 돌려준다 */
export function removeNote(st: FeedState, id: string): string[] {
  const gone = new Set([id]); let grew = true;
  while (grew) { grew = false; for (const n of st.notes) if (!gone.has(n.id) && ((n.root && gone.has(n.root)) || (n.re && gone.has(n.re)))) { gone.add(n.id); grew = true; } }
  const imgs = st.notes.filter(n => gone.has(n.id) && n.image).map(n => n.image!);
  st.notes = st.notes.filter(n => !gone.has(n.id)); st.notices = st.notices.filter(q => !gone.has(q.note));
  if (st.last) st.last.notes = st.last.notes.filter(x => !gone.has(x));
  return imgs;
}
/** 글이 max 개를 넘으면 오래된 글(과 그 답글)부터 덜어 낸다. 지운 그림 id 를 돌려준다 */
export function prune(st: FeedState, max = 500): string[] {
  if (st.notes.length <= max) return [];
  const roots = st.notes.filter(n => !n.root).sort((a, b) => a.ts - b.ts), imgs: string[] = []; let over = st.notes.length - max;
  for (const r of roots) { if (over <= 0) break; const before = st.notes.length; imgs.push(...removeNote(st, r.id)); over -= before - st.notes.length; }
  return imgs;
}

// ── 누가 몇 개 쓰나 · 누구와 가까운가 ──
/** 수다 정도(0~1)로 이번 묶음의 글 몫을 나눈다. 말수가 적은 캐릭터는 드물게 뽑히고, 한 사람이 다 가져가지 않게 한 사람 몫은 절반 + 1 까지 */
export function quotaFor(members: { id: string; talk?: number }[], n: number, rnd: Rnd = Math.random): Record<string, number> {
  const out: Record<string, number> = {}; if (!members.length || n <= 0) return out;
  const w = (m: { talk?: number }) => { const t = Number(m.talk); return 0.12 + Math.pow(Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5, 1.4); };
  const cap = Math.max(1, Math.ceil(n / 2) + (members.length === 1 ? n : 0));
  for (let i = 0; i < n; i++) {
    const pool = members.filter(m => (out[m.id] || 0) < cap); if (!pool.length) break;
    const sum = pool.reduce((a, m) => a + w(m) / (1 + (out[m.id] || 0)), 0); let x = rnd() * sum, pick = pool[pool.length - 1];
    for (const m of pool) { x -= w(m) / (1 + (out[m.id] || 0)); if (x <= 0) { pick = m; break; } }
    out[pick.id] = (out[pick.id] || 0) + 1;
  }
  return out;
}
/** 같은 그룹 대화에 있던 사이 → [a, b, 함께한 방 수] (많은 순). 답글이 오가기 쉬운 짝으로 프롬프트에 적는다 */
export function pairsFrom(chats: { charIds?: string[] }[], ids: string[]): [string, string, number][] {
  const on = new Set(ids), tally = new Map<string, number>();
  for (const c of chats) { const g = [...new Set((c.charIds || []).filter(x => on.has(x)))].sort(); for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) tally.set(g[i] + '|' + g[j], (tally.get(g[i] + '|' + g[j]) || 0) + 1); }
  return [...tally].map(([k, n]): [string, string, number] => { const [a, b] = k.split('|'); return [a, b, n]; }).sort((x, y) => y[2] - x[2]);
}

// ── 옛 글 회상 ──
/** 48시간 넘은 글 가운데 몇 개를 뽑는다. chance 의 확률로만 떠올리고, 반응이 많았던 글 · 나와 얽힌 글이 더 잘 뽑힌다 (겹치지 않게) */
export function sampleRecall(notes: Note[], { now, k = 3, chance = 0.6, hours = 48, rnd = Math.random }: { now: number; k?: number; chance?: number; hours?: number; rnd?: Rnd }): Note[] {
  if (k <= 0 || rnd() >= chance) return [];
  const replies = new Map<string, number>(), mine = new Set<string>();
  for (const n of notes) if (n.root) { replies.set(n.root, (replies.get(n.root) || 0) + 1); if (n.by === ME) mine.add(n.root); }
  const pool = notes.filter(n => !n.root && !n.hidden && !n.off && now - n.ts > hours * 3600e3).map(n => ({ n, w: 1 + n.likes.length * 0.5 + n.echoes.length + (replies.get(n.id) || 0) * 0.8 + (n.by === ME || mine.has(n.id) || n.likes.includes(ME) ? 2 : 0) }));
  const out: Note[] = [];
  while (out.length < k && pool.length) { const sum = pool.reduce((a, p) => a + p.w, 0); let x = rnd() * sum, i = pool.length - 1; for (let j = 0; j < pool.length; j++) { x -= pool[j].w; if (x <= 0) { i = j; break; } } out.push(pool.splice(i, 1)[0].n); }
  return out.sort((a, b) => a.ts - b.ts);
}

// ── 읽기 도우미 ──
export const visible = (n: Note) => !n.hidden && !n.off;
/** 글에 매달린 답글을 레일 차례로: 위 답글 바로 밑에 그 답글의 답글이 온다. depth 는 0(글에 바로) 또는 1 */
export function threadOf(notes: Note[], rootId: string): { n: Note; depth: number }[] {
  const all = notes.filter(n => n.root === rootId && visible(n)).sort((a, b) => a.ts - b.ts), ids = new Set(all.map(n => n.id)), out: { n: Note; depth: number }[] = [];
  const kids = (id: string | undefined, depth: number) => { for (const n of all) if ((n.re && ids.has(n.re) ? n.re : undefined) === id) { out.push({ n, depth: Math.min(1, depth) }); kids(n.id, depth + 1); } };
  kids(undefined, 0); return out;
}
/** 내가 쓴 글 · 답글 가운데 아직 아무 캐릭터도 답하지 않은 것 (다음 새로 고침이 챙길 것들) */
export function waiting(st: FeedState, now: number, hours = 72): Note[] {
  const answered = new Set<string>();
  for (const n of st.notes) if (n.by !== ME && n.root) { answered.add(n.re || n.root); }
  return st.notes.filter(n => n.by === ME && visible(n) && now - n.ts < hours * 3600e3 && !answered.has(n.id) && !(n.root && st.notes.some(x => x.root === n.root && x.by !== ME && x.ts > n.ts))).slice(-6);
}
export const unseen = (st: FeedState) => st.notices.filter(q => q.ts > st.seenAt).length;
/** 프롬프트에 쓰는 "얼마 전" (영어) */
export const ago = (ts: number, now: number) => { const m = Math.max(0, Math.round((now - ts) / 60e3)); return m < 2 ? 'just now' : m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

// ── 대화로 되돌아오기 ──
export interface CarryItem { ts: number; kind: 'note' | 'reply'; text: string; poll?: string; /** 답글이면 누구의 어떤 글에 */ toBy?: string; toText?: string; marks: number; iLiked: boolean; /** 내가 그 글에 단 답글들 */ myReplies: string[] }
/** 그 캐릭터가 창(hours) 안에 게시판에서 한 일을 새것부터 max 개. 내가 반응한 것이 먼저 남는다 */
export function carryItems(st: FeedState, charId: string, { now, hours, max }: { now: number; hours: number; max: number }): CarryItem[] {
  const byId = new Map(st.notes.map(n => [n.id, n])), from = now - hours * 3600e3;
  const items = st.notes.filter(n => n.by === charId && visible(n) && n.ts >= from && n.ts <= now).map((n): CarryItem => {
    const to = n.root ? byId.get(n.re || n.root) || byId.get(n.root) : undefined;
    return { ts: n.ts, kind: n.root ? 'reply' : 'note', text: n.text, poll: n.poll ? `${n.poll.q ? n.poll.q + ' — ' : ''}${n.poll.opts.join(' / ')}` : undefined, toBy: to?.by, toText: to?.text, marks: n.likes.length + n.echoes.length, iLiked: n.likes.includes(ME),
      myReplies: n.root ? [] : st.notes.filter(x => x.root === n.id && x.by === ME && visible(x)).map(x => x.text) };
  });
  const score = (c: CarryItem) => (c.iLiked ? 1 : 0) + c.myReplies.length * 2 + (c.toBy === ME ? 2 : 0);
  return items.sort((a, b) => score(b) - score(a) || b.ts - a.ts).slice(0, Math.max(0, max)).sort((a, b) => a.ts - b.ts);
}

// ── 대화 중 [post: …] ──
const POST_RE = /^[ \t]*\[post\s*[:：]\s*([^\]\n]{1,600})\][ \t]*\n?/gim;
/** 답장에서 [post: …] 줄을 떼어 낸다 → 남은 글과 올릴 글들 (한 답장에 둘까지) */
export function takePosts(text: string): { text: string; posts: string[] } {
  const posts: string[] = [];
  const rest = String(text ?? '').replace(POST_RE, (_m, p: string) => { const s = p.trim().replace(/^["“'「]+|["”'」]+$/g, '').trim(); if (s && posts.length < 2) posts.push(s); return ''; });
  return { text: posts.length || rest !== text ? rest.replace(/\n{3,}/g, '\n\n').trim() : text, posts };
}
/** 화면에서 가린다 (쓰는 중이라 아직 닫히지 않은 꼬리도) */
export const hidePosts = (text: string) => /\[post/i.test(text) ? text.replace(POST_RE, '').replace(/(^|\n)[ \t]*\[post\s*[:：]?[^\]\n]*$/i, '$1').replace(/\n{3,}/g, '\n\n') : text;

/** 계정 찾기 */
export const acct = (st: FeedState, id: string): Account | undefined => st.accounts.find(a => a.id === id);
