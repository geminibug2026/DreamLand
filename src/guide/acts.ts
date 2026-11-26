// 등불지기의 "행동" 카드: 앱에 이미 있는 기능으로 하는 일 — 대화방 만들기 · 지우기, 메시지 고치기 · 지우기, 연결 · 모델 · 프리셋 바꾸기, 장기기억, 명령 실행.
// apply 는 되돌릴 때 쓸 사본(before)을 돌려준다. undo 가 없는 행동(명령 실행)은 되돌릴 수 없다고 카드가 알린다.
// 이 파일은 changes.ts 를 부르지 않는다 (changes.ts 가 이것을 부른다)
import { DB, S, emit } from '../lib/core';
import { qrSave, qrStore } from '../lib/qr-data';
import type { Msg } from '../lib/types';

type Obj = Record<string, unknown>;
export interface ActResult { before: unknown; targetId: string; /** 모델에 돌려줄 결과 (명령의 출력 등) */ out?: string }
export interface Act {
  apply(a: Obj): Promise<ActResult>;
  undo?(before: unknown, targetId: string): Promise<void>;
}

// ── 메시지 목록: 열린 방이면 화면이 들고 있는 목록을, 아니면 저장된 목록을 ──
async function listOf(chatId: string): Promise<{ list: Msg[]; open: boolean }> {
  const { cur } = await import('../chat/store');
  if (cur.chat?.id === chatId) return { list: cur.msgs, open: true };
  if (!S.get('chats', chatId)) throw new Error('that chat no longer exists');
  return { list: await S.msgs(chatId), open: false };
}
async function saveList(chatId: string, list: Msg[], open: boolean, ev?: 'edited' | 'deleted', msg?: Msg) {
  const chat = S.get('chats', chatId); if (!chat) throw new Error('that chat no longer exists');
  if (open) {
    const { chatApi } = await import('../chat/actions');
    await chatApi.save(); chatApi.redraw?.();
    if (ev === 'edited' && msg) emit('message:edited', { chat, msg, msgs: list });
    if (ev === 'deleted') emit('message:deleted', { chat, msgs: list });
  } else await S.saveMsgs(chat, list);
}
const MSG_KEYS = ['text', 'hidden', 'pin', 'memo'] as const;

export const ACTS: Record<string, Act> = {
  /** 새 대화방: 첫 인사말을 넣고, 고른 인사말 · 페르소나 · 이름을 맞춘다 */
  newchat: {
    async apply(a) {
      const { startChat } = await import('../chat/start');
      const ids = (a.charIds as string[]).filter(id => S.get('chars', id));
      if (!ids.length) throw new Error('the character no longer exists');
      const chat = await startChat(ids, { open: false, mode: a.mode === 'talk' ? 'talk' : 'rp', setup: false });
      if (!chat) throw new Error('could not start the chat');
      if (a.personaId) chat.personaId = String(a.personaId);
      if (a.name) chat.name = String(a.name);
      const g = Number(a.greeting);
      if (g > 0) { const list = await S.msgs(chat.id), m = list.find(x => x.greeting); if (m && g < m.swipes.length) { m.sw = g; await S.saveMsgs(chat, list); } }
      await S.save('chats', chat);
      if (a.open !== false) { const { go } = await import('../lib/router'); go('chat', chat.id); }
      return { before: null, targetId: chat.id, out: `chat ${chat.id} created${a.open !== false ? ' and opened' : ''}` };
    },
    async undo(_b, id) { if (S.get('chats', id)) await leaveIfOpen(id).then(() => S.remove('chats', id)); },
  },
  /** 대화방 지우기: 방 · 메시지 · 장기기억을 통째로 남겨 두었다가 되돌리면 다시 넣는다 */
  delchat: {
    async apply(a) {
      const id = String(a.chatId), chat = S.get('chats', id); if (!chat) throw new Error('gone');
      const msgs = await S.msgs(id), mem = await DB.get('mem', id).catch(() => undefined);
      await leaveIfOpen(id);
      await S.remove('chats', id);
      return { before: { chat: structuredClone(chat), msgs: structuredClone(msgs), mem: mem ? structuredClone(mem) : null }, targetId: id };
    },
    async undo(b) {
      const { chat, msgs, mem } = b as { chat: Obj; msgs: Msg[]; mem: Obj | null };
      const saved = await S.save('chats', chat as never) as never; await S.saveMsgs(saved, msgs);
      if (mem) await DB.put('mem', mem);
    },
  },
  /** 메시지 하나 고치기: 글(지금 보이는 스와이프) · 숨김 · 고정 · 나만 보는 메모 */
  msgset: {
    async apply(a) {
      const chatId = String(a.chatId), { list, open } = await listOf(chatId), m = list.find(x => x.id === a.msgId);
      if (!m) throw new Error('that message is gone');
      const before = structuredClone(m), f = a.fields as Obj;
      if (typeof f.text === 'string') { const s = m.swipes[m.sw]; s.text = f.text; delete (s as Obj).tr; (s as Obj).showTr = false; }
      for (const k of MSG_KEYS.slice(1)) if (k in f) { if (f[k] === null || f[k] === '') delete (m as Obj)[k]; else (m as Obj)[k] = f[k]; }
      if ('hidden' in f) m.hidden = !!f.hidden;
      await saveList(chatId, list, open, 'edited', m);
      return { before, targetId: chatId };
    },
    async undo(b, chatId) {
      const was = b as Msg, { list, open } = await listOf(chatId), i = list.findIndex(x => x.id === was.id);
      if (i < 0) throw new Error('that message is gone'); list[i] = structuredClone(was);
      await saveList(chatId, list, open, 'edited', list[i]);
    },
  },
  /** 메시지 여러 개 지우기: 지운 자리와 함께 남겨 두었다가 되돌리면 그 자리에 다시 넣는다 */
  msgdel: {
    async apply(a) {
      const chatId = String(a.chatId), { list, open } = await listOf(chatId), ids = new Set(a.ids as string[]);
      const gone: { at: number; m: Msg }[] = [];
      for (let i = list.length - 1; i >= 0; i--) if (ids.has(list[i].id)) gone.unshift({ at: i, m: list.splice(i, 1)[0] });
      if (!gone.length) throw new Error('those messages are gone');
      if (open) { const { cur } = await import('../chat/store'); if (cur.cut >= list.length) cur.cut = 0; }
      await saveList(chatId, list, open, 'deleted');
      return { before: gone, targetId: chatId };
    },
    async undo(b, chatId) {
      const { list, open } = await listOf(chatId);
      for (const g of b as { at: number; m: Msg }[]) if (!list.some(x => x.id === g.m.id)) list.splice(Math.min(g.at, list.length), 0, structuredClone(g.m));
      await saveList(chatId, list, open, 'edited');
    },
  },
  /** 연결 · 모델 · 프리셋 바꾸기, 또는 연결 프로필 적용 */
  switch: {
    async apply(a) {
      const s = S.settings as unknown as Obj, ids = new Set([String(s.activeConn || ''), String(a.connId || '')].filter(Boolean));
      if (a.profileId) { const L = await import('../flow/logic'), p = L.findProfile(a.profileId); if (p?.connId) ids.add(p.connId); }
      const before = { activeConn: s.activeConn ?? '', activePreset: s.activePreset ?? '', format: structuredClone(s.format ?? null), models: Object.fromEntries([...ids].map(id => [id, S.get('conns', id)?.model ?? ''])) };
      if (a.profileId) {
        const L = await import('../flow/logic'), p = L.findProfile(a.profileId); if (!p) throw new Error('that connection profile is gone');
        const miss = await L.applyProfile(p, true);
        return { before, targetId: 'settings', out: miss.length ? `applied, but missing: ${miss.join(', ')}` : 'applied' };
      }
      const patch: Obj = {};
      if (a.connId) { if (!S.get('conns', String(a.connId))) throw new Error('that connection is gone'); patch.activeConn = a.connId; }
      if (a.presetId) { if (!S.get('presets', String(a.presetId))) throw new Error('that preset is gone'); patch.activePreset = a.presetId; }
      if (Object.keys(patch).length) S.set(patch as never);
      if (a.model) { const c = S.get('conns', String(a.connId || s.activeConn)); if (!c) throw new Error('no connection to set the model on'); c.model = String(a.model); await S.save('conns', c); }
      return { before, targetId: 'settings' };
    },
    async undo(b) {
      const was = b as { activeConn: string; activePreset: string; format: unknown; models: Record<string, string> };
      S.set({ activeConn: was.activeConn, activePreset: was.activePreset, ...(was.format ? { format: structuredClone(was.format) } : {}) } as never);
      for (const [id, model] of Object.entries(was.models)) { const c = S.get('conns', id); if (c && c.model !== model) { c.model = model; await S.save('conns', c); } }
    },
  },
  /** 연결 프로필 저장: 지금 쓰는 것(또는 고른 연결 · 모델 · 프리셋)을 묶어 둔다 */
  profileadd: {
    async apply(a) {
      const L = await import('../flow/logic'), p = L.snapshot(String(a.name));
      if (a.connId) { p.connId = String(a.connId); p.model = String(a.model || S.get('conns', p.connId)?.model || ''); } else if (a.model) p.model = String(a.model);
      if (a.presetId) p.presetId = String(a.presetId);
      const list = L.profiles(); list.push(p); S.set({ profiles: list } as never);
      return { before: { id: p.id }, targetId: 'settings', out: `profile ${p.id} saved` };
    },
    async undo(b) { const L = await import('../flow/logic'), id = (b as { id: string }).id; S.set({ profiles: L.profiles().filter(p => p.id !== id) } as never); },
  },
  /** 링크로 카드 가져오기: 가져오기 전후의 id 를 견주어 새로 생긴 것을 적어 두고, 되돌리면 그것만 치운다 */
  importurl: {
    async apply(a) {
      const colls = ['chars', 'lore', 'regex', 'presets', 'personas'] as const, ids = (c: typeof colls[number]) => new Set((S as unknown as Record<string, { id: string }[]>)[c].map(x => x.id));
      const before = Object.fromEntries(colls.map(c => [c, ids(c)])) as Record<string, Set<string>>;
      const { importFromUrl } = await import('../lib/cards'), tally = await importFromUrl(String(a.url));
      const made = Object.fromEntries(colls.map(c => [c, [...ids(c)].filter(id => !before[c].has(id))])) as Record<string, string[]>;
      const names = made.chars.map(id => S.get('chars', id)?.name).filter(Boolean);
      if (!Object.values(made).some(l => l.length)) throw new Error(tally.errors?.[0] || 'nothing was imported from that link');
      return { before: made, targetId: made.chars[0] || 'import', out: `imported: ${names.join(', ') || '—'} (${Object.entries(made).filter(([, l]) => l.length).map(([c, l]) => `${l.length} ${c}`).join(', ')})` };
    },
    async undo(b) { for (const [c, list] of Object.entries(b as Record<string, string[]>)) for (const id of list) if (S.get(c as never, id)) await S.remove(c as never, id); },
  },
  /** 장기기억 하나 더하기 */
  memadd: {
    async apply(a) {
      const { Memory } = await import('../lib/memory'), m = await Memory.add(String(a.chatId), { ...(a.rec as Obj), manual: true, tags: ['manual'] } as never);
      return { before: { id: m.id }, targetId: String(a.chatId), out: `memory ${m.id} added` };
    },
    async undo(b, chatId) { const { Memory } = await import('../lib/memory'), mem = await Memory.load(chatId), id = (b as { id: string }).id; mem.memories = mem.memories.filter(x => x.id !== id); await Memory.save(mem); },
  },
  /** 장기기억 하나 고치기 */
  memset: {
    async apply(a) {
      const { Memory } = await import('../lib/memory'), mem = await Memory.load(String(a.chatId)), m = mem.memories.find(x => x.id === a.id);
      if (!m) throw new Error('that memory is gone');
      const before = structuredClone(m), f = a.fields as Obj;
      for (const [k, v] of Object.entries(f)) { if (v === null) delete (m as Obj)[k]; else (m as Obj)[k] = structuredClone(v); }
      if ('summary' in f) { m.manual = true; delete (m as Obj).av; }
      await Memory.save(mem);
      return { before, targetId: String(a.chatId) };
    },
    async undo(b, chatId) { const { Memory } = await import('../lib/memory'), mem = await Memory.load(chatId), was = b as { id: string }, i = mem.memories.findIndex(x => x.id === was.id); if (i < 0) mem.memories.push(structuredClone(was) as never); else mem.memories[i] = structuredClone(was) as never; await Memory.save(mem); },
  },
  /** 장기기억 하나 지우기 */
  memdel: {
    async apply(a) {
      const { Memory } = await import('../lib/memory'), mem = await Memory.load(String(a.chatId)), at = mem.memories.findIndex(x => x.id === a.id);
      if (at < 0) throw new Error('that memory is gone');
      const [m] = mem.memories.splice(at, 1); await Memory.save(mem);
      return { before: { at, m: structuredClone(m) }, targetId: String(a.chatId) };
    },
    async undo(b, chatId) { const { Memory } = await import('../lib/memory'), mem = await Memory.load(chatId), g = b as { at: number; m: { id: string } }; if (!mem.memories.some(x => x.id === g.m.id)) mem.memories.splice(Math.min(g.at, mem.memories.length), 0, structuredClone(g.m) as never); await Memory.save(mem); },
  },
  /** 말로 되돌리기: 앱의 되돌리기 장부로 돌린다 (그 카드는 '되돌림'이 된다). 되돌리기를 되돌리지는 않는다 */
  undo: {
    async apply(a) {
      const { undoChange } = await import('./changes'), id = String(a.undoId);
      if (!(await undoChange(id))) throw new Error('it can no longer be undone');
      emit('guide:undone', id);
      return { before: null, targetId: id, out: 'undone' };
    },
  },
  /** STscript 실행 (퀵 리플라이 버튼을 누른 것과 같다). 되돌릴 수 없다 */
  run: {
    async apply(a) {
      const { runQrScript } = await import('../stscript/host');
      const out = await runQrScript(String(a.script));
      return { before: null, targetId: 'run', out: String(out ?? '').slice(0, 4000) };
    },
  },
};

// ── 한꺼번에 바꾸기: 검색이 훑는 칸 모두에서 찾아 바꾼다. 제안할 때 미리 보고, 적용할 때 같은 규칙으로 다시 계산한다 ──
export interface ReplaceRule { find: string; replace: string; regex?: boolean; kinds?: string[]; charIds?: string[] }
export interface ReplaceHit { kind: string; coll: 'chars' | 'personas' | 'lore' | 'presets' | 'regex' | 'qr'; id: string; name: string; field: string; before: string; after: string; n: number }
const CHAR_FIELDS = ['name', 'description', 'personality', 'scenario', 'firstMes', 'mesExample', 'systemPrompt', 'postHistory', 'creatorNotes', 'depthPrompt.prompt'];
const getP = (o: unknown, p: string) => p.split('.').reduce<unknown>((t, k) => (t && typeof t === 'object' ? (t as Obj)[k] : undefined), o);
const setP = (o: Obj, p: string, v: unknown) => { const ks = p.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = (t[k] && typeof t[k] === 'object' ? t[k] : (t[k] = {})) as Obj; t[ks[ks.length - 1]] = v; };
export function ruleRe(r: ReplaceRule): RegExp { return r.regex ? new RegExp(r.find, 'g') : new RegExp(r.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'); }
/** 바뀔 칸들 (실제로 고치지는 않는다). edit 를 주면 그 자리에서 고친다 */
export function planReplace(r: ReplaceRule, edit = false): ReplaceHit[] {
  const re = ruleRe(r), out: ReplaceHit[] = [], kinds = r.kinds?.length ? r.kinds : ['characters', 'personas', 'lorebooks', 'presets', 'regex', 'quick_replies'];
  const only = r.charIds?.length ? new Set(r.charIds) : null, books = only ? new Set(S.chars.filter(c => only.has(c.id)).flatMap(c => c.loreIds || [])) : null;
  const one = (text: string) => { re.lastIndex = 0; const n = (text.match(re) || []).length; if (!n) return null; re.lastIndex = 0; return { after: r.regex ? text.replace(re, r.replace) : text.replace(re, () => r.replace), n }; };
  const field = (hit: Omit<ReplaceHit, 'field' | 'before' | 'after' | 'n'>, obj: Obj, path: string) => {
    const v = getP(obj, path);
    if (Array.isArray(v)) { let n = 0; const after = v.map(x => { if (typeof x !== 'string') return x; const k = one(x); if (!k) return x; n += k.n; return k.after; }); if (n) { out.push({ ...hit, field: path, before: v.join(' | '), after: after.join(' | '), n }); if (edit) setP(obj, path, after); } return; }
    if (typeof v !== 'string' || !v) return; const k = one(v); if (!k) return;
    out.push({ ...hit, field: path, before: v, after: k.after, n: k.n }); if (edit) setP(obj, path, k.after);
  };
  if (kinds.includes('characters')) for (const c of S.chars) { if (only && !only.has(c.id)) continue; const h = { kind: 'character', coll: 'chars' as const, id: c.id, name: c.name }; for (const f of [...CHAR_FIELDS, 'altGreetings']) field(h, c as unknown as Obj, f); }
  if (kinds.includes('personas') && !only) for (const x of S.personas) { const h = { kind: 'persona', coll: 'personas' as const, id: x.id, name: x.name }; field(h, x as unknown as Obj, 'name'); field(h, x as unknown as Obj, 'description'); }
  if (kinds.includes('lorebooks')) for (const b of S.lore) { if (books && !books.has(b.id)) continue; b.entries.forEach((e, i) => { const h = { kind: 'lore_entry', coll: 'lore' as const, id: b.id, name: `${b.name} › ${e.name || (e.keys || []).join(', ')}` }; for (const f of ['name', 'keys', 'content']) field(h, b as unknown as Obj, `entries.${i}.${f}`); }); }
  if (kinds.includes('presets') && !only) for (const p of S.presets) p.blocks.forEach((bl, i) => { const h = { kind: 'preset_block', coll: 'presets' as const, id: p.id, name: `${p.name} › ${bl.name || bl.kind}` }; for (const f of ['name', 'content']) field(h, p as unknown as Obj, `blocks.${i}.${f}`); });
  if (kinds.includes('regex')) for (const x of S.regex) { if (only && !only.has(String(x.scope))) continue; const h = { kind: 'regex', coll: 'regex' as const, id: x.id, name: x.name }; for (const f of ['name', 'find', 'replace']) field(h, x as unknown as Obj, f); }
  if (kinds.includes('quick_replies')) for (const st of qrStore().sets) { if (only && !(st.charIds || []).some(id => only.has(id))) continue; st.items.forEach((it, i) => { const h = { kind: 'qr', coll: 'qr' as const, id: st.id, name: `${st.name} › ${it.label}` }; for (const f of ['label', 'text']) field(h, st as unknown as Obj, `items.${i}.${f}`); }); }
  return out;
}
async function putColl(coll: ReplaceHit['coll'], obj: Obj) { if (coll === 'qr') { const q = qrStore(), i = q.sets.findIndex(x => x.id === obj.id); if (i >= 0) q.sets[i] = obj as never; qrSave(); } else await S.save(coll, obj as never); }
const findColl = (coll: ReplaceHit['coll'], id: string): Obj | undefined => coll === 'qr' ? qrStore().sets.find(x => x.id === id) as unknown as Obj : S.get(coll, id) as unknown as Obj;
ACTS.bulkreplace = {
  async apply(a) {
    const rule = a.rule as ReplaceRule, hits = planReplace(rule);
    if (!hits.length) throw new Error('nothing matches any more');
    const touched = [...new Map(hits.map(h => [h.coll + ':' + h.id, { coll: h.coll, id: h.id }])).values()];
    const before = touched.map(t => ({ ...t, obj: structuredClone(findColl(t.coll, t.id)) }));
    planReplace(rule, true);   // 그 자리에서 고친다
    for (const t of touched) { const o = findColl(t.coll, t.id); if (o) await putColl(t.coll, o); }
    return { before, targetId: 'bulk', out: `${hits.reduce((n, h) => n + h.n, 0)} replacements in ${touched.length} items` };
  },
  async undo(b) { for (const t of b as { coll: ReplaceHit['coll']; id: string; obj: Obj }[]) if (t.obj) await putColl(t.coll, structuredClone(t.obj)); },
};
/** 여러 캐릭터의 태그 더하기 · 빼기 */
ACTS.tags = {
  async apply(a) {
    const ids = a.charIds as string[], add = (a.add as string[]) || [], del = new Set(((a.remove as string[]) || []).map(x => x.toLowerCase()));
    const before = ids.map(id => ({ id, tags: [...(S.get('chars', id)?.tags || [])] }));
    for (const id of ids) { const c = S.get('chars', id); if (!c) continue; const keep = (c.tags || []).filter(t => !del.has(t.toLowerCase())); for (const t of add) if (!keep.some(x => x.toLowerCase() === t.toLowerCase())) keep.push(t); c.tags = keep; await S.save('chars', c); }
    return { before, targetId: 'tags' };
  },
  async undo(b) { for (const r of b as { id: string; tags: string[] }[]) { const c = S.get('chars', r.id); if (c) { c.tags = r.tags; await S.save('chars', c); } } },
};

/** 지우려는 방이 열려 있으면 먼저 다른 화면으로 (열린 채 지우면 화면이 없는 방을 붙잡는다) */
async function leaveIfOpen(id: string) {
  const { cur } = await import('../chat/store'); if (cur.chat?.id !== id) return;
  const { go } = await import('../lib/router'); cur.chat = null; S.set({ lastChat: '' } as never); go('home');
}

/** 돈이 드는 생성이나 지우기를 하는 STscript 인가 (바로 적용 모드에서도 사람이 누르게 한다) */
const RISKY = /(^|[|\s{])\/(gen|genraw|trigger|continue|cont|regenerate|regen|swipes?-?\w*|del|cut|delchat|closechat|delname|sendas|send|ask|impersonate|imagine|sd|tts|speak|api|model|preset|profile)\b/i;
export const riskyScript = (s: string) => RISKY.test(s);
