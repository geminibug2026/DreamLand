// 등불지기가 손대는 곳 넓히기: 대화방 · 메시지 · 연결 바꾸기 · 연결 프로필 · 장기기억 · 명령 실행 · 화면 이동 · 지우기 · 새 프리셋.
// 읽기는 바로, 쓰기는 변경 카드(행동 카드 포함)로. 도우미 함수는 tools.ts 가 넘겨준다 (서로 부르지 않게)
import { S } from '../lib/core';
import type { Char, Chat, Msg } from '../lib/types';
import type { Change, FieldChange, Kind, Op, ToolDef } from './types';
import { riskyScript } from './acts';

type Obj = Record<string, unknown>;
type Args = Record<string, unknown>;
export interface Helpers {
  str: (v: unknown) => string; num: (v: unknown, d?: number) => number; clip: (v: unknown, field: string, n?: number) => string;
  fail: (m: string) => never; find: <T extends { id: string; name?: string }>(list: T[], ref: unknown, what: string) => T;
  propose: (verb: Change['verb'], kind: Kind, target: string, op: Op, fs: FieldChange[]) => { change: Change; notes?: unknown; warn?: string };
  show: (v: unknown) => string; openChat: (ref: unknown) => Chat; chatTitle: (c: Chat) => string; cur: { chat: Chat | null; msgs: Msg[] };
  msgText: (m: Pick<Msg, 'swipes' | 'sw'>) => string;
  /** 이 대화의 변경 카드 (id 로) */
  card: (id: string) => Change | undefined;
}

const KINDS: Record<string, { coll: Kind; what: string; list: () => { id: string; name?: string }[] }> = {
  character: { coll: 'chars', what: 'character', list: () => S.chars },
  persona: { coll: 'personas', what: 'persona', list: () => S.personas },
  lorebook: { coll: 'lore', what: 'lorebook', list: () => S.lore },
  preset: { coll: 'presets', what: 'preset', list: () => S.presets },
  theme: { coll: 'theme', what: 'theme', list: () => ((S.settings as unknown as { customThemes?: { id: string; name?: string }[] }).customThemes || []) },
};
const MEM_KINDS = ['event', 'fact', 'relationship', 'secret', 'emotion', 'promise', 'goal', 'item', 'place', 'rule'];

export function reachTools(h: Helpers): { read: ToolDef[]; write: ToolDef[] } {
  const { str, num, clip, fail, find, propose, show, openChat, chatTitle, cur, msgText, card } = h;
  const act = (kind: Kind, verb: Change['verb'], target: string, name: string, args: Obj, fs: FieldChange[]) => propose(verb, kind, target, { type: 'action', name, args }, fs.length ? fs : [{ name: 'do', before: '', after: name }]);
  const charRef = (ref: unknown) => find(S.chars, ref, 'character');
  const personaRef = (ref: unknown) => find(S.personas, ref, 'persona');
  const msgsOf = async (c: Chat) => cur.chat?.id === c.id ? cur.msgs : await S.msgs(c.id);
  const memChat = (ref: unknown) => openChat(ref);
  const profiles = async () => (await import('../flow/logic')).profiles();

  const read: ToolDef[] = [
    { name: 'get_memories', sig: '{chat?, query?, kind?, offset?}', desc: 'The long-term memory (Memoria) of a chat — default the open one: memory cards (id, kind, summary, importance, pinned/disabled/retired, owner and who knows), newest first, 25 per page; query= filters by words, kind= by kind. Also counts of people, pledges and summaries.',
      run: async a => {
        const c = memChat(a.chat), { Memory } = await import('../lib/memory'), mem = await Memory.load(c.id);
        const q = str(a.query).toLowerCase(), k = str(a.kind);
        const rows = [...mem.memories].reverse().filter(m => (!k || m.kind === k) && (!q || `${m.summary} ${m.quote || ''} ${(m.entities || []).join(' ')}`.toLowerCase().includes(q)));
        const off = Math.max(0, num(a.offset));
        return { chat: chatTitle(c), total: rows.length, offset: off, people: mem.cast.length, pledges: mem.pledges.filter(p => p.status === 'active').length, summaries: mem.chunks.length + mem.arcs.length,
          memories: rows.slice(off, off + 25).map(m => ({ id: m.id, kind: m.kind, summary: clip(m.summary, 'summary', 260), importance: m.importance, ...(m.pinned ? { pinned: true } : {}), ...(m.disabled ? { disabled: true } : {}), ...(m.retired ? { retired: m.retired.now || true } : {}), ...(m.visibility && m.visibility !== 'public' ? { visibility: m.visibility, owner: m.owner, knowers: m.knowers } : {}), ...(m.turn != null ? { turn: m.turn } : {}) })) };
      } },
    { name: 'playbook', sig: '{topic: "game"|"panels"|"motion"|"cards"|"mvu"|"lalib"}', desc: 'Long instructions for one kind of work (see PLAYBOOKS). Read the one that fits once per conversation, in the same message as your first calls.',
      run: async a => { const { PLAYBOOKS } = await import('./playbooks'), k = str(a.topic).trim().toLowerCase(), pb = PLAYBOOKS[k] || fail(`topic must be one of: ${Object.keys(PLAYBOOKS).join(', ')}.`); return { topic: k, about: pb.what, text: pb.text }; } },
    { name: 'try_reply', sig: '{character? | card?, message, persona?, greeting?: <0 = first>}', desc: 'Test a character before the user plays it: builds the real prompt (the card, its linked lorebooks, the preset in use) for a fresh chat that holds the greeting and your test line as the user\'s message, and returns the reply the chat connection gives. Works on a saved character or on a create_character / update_character card still waiting for approval (card=<changeCard id>). One paid request on the chat connection; nothing is saved.',
      run: async a => {
        const msg = str(a.message).trim() || fail('"message" is required: the line the user would say.');
        const C = await import('../lib/core'), E = await import('../lib/engine');
        let ch: Char;
        if (a.card != null && str(a.card).trim()) {
          const c = card(str(a.card)) || fail('No change card with that id in this conversation.'), op = c.op as Op & { coll?: string; obj?: Obj; id?: string; fields?: Obj };
          if (op.type === 'create' && op.coll === 'chars') ch = C.newChar(structuredClone(op.obj as Partial<Char>));
          else if (op.type === 'set' && op.coll === 'chars') { const base = S.get('chars', str(op.id)) || fail('That character is gone.'); ch = structuredClone(base); for (const [k, v] of Object.entries(op.fields || {})) k.split('.').reduce<Obj>((o, x, i, ks) => (i === ks.length - 1 ? (o[x] = structuredClone(v), o) : (o[x] = (o[x] && typeof o[x] === 'object' ? o[x] : {}) as Obj) as Obj), ch as unknown as Obj); }
          else fail('That card is not a character card.');
        } else ch = charRef(a.character ?? fail('Give character= or card=.'));
        const p = a.persona != null && str(a.persona).trim() ? personaRef(a.persona) : null;
        const chat = C.newChat({ charIds: [ch!.id], personaId: p?.id || '' }), persona = p || S.persona(chat), preset = S.presetFor(chat), conn = S.connFor(chat) || fail('No chat connection is set up (API connections).');
        const greets = [ch!.firstMes, ...(ch!.altGreetings || [])].filter(x => x && x.trim()), gi = Math.max(0, num(a.greeting)), msgs: Msg[] = [];
        if (greets.length) msgs.push(C.newMsg('assistant', E.macro(greets[Math.min(gi, greets.length - 1)], E.makeCtx({ chat, char: ch!, chars: [ch!], persona, msgs: [] } as never)), { charId: ch!.id, name: ch!.name, greeting: true }));
        msgs.push(C.newMsg('user', msg, { name: persona.name }));
        const built = E.buildPrompt({ chat, char: ch!, chars: [ch!], persona, preset, msgs, type: 'normal' } as never);
        const r = await E.streamChat(conn, { ...preset.params }, built.messages, { label: 'guide-try' } as never);
        const sp = E.splitThink ? E.splitThink(r.text || '') : { text: r.text || '' };
        return { character: ch!.name, connection: `${conn.name} · ${conn.model}`, promptTokens: built.total, lorebookHits: built.lore.length, reply: clip(sp.text, 'reply', 3000) };
      } },
    { name: 'get_profiles', sig: '{}', desc: 'Connection profiles (saved connection + model + preset + formatting) with what each holds, which one the open chat or its character is bound to, and the active connection, model and preset.',
      run: async () => { const L = await import('../flow/logic'), c = cur.chat, bound = L.boundProfile(c as never), conn = S.conn();
        return { active: { connection: conn ? `${conn.name} · ${conn.model}` : null, preset: S.preset()?.name }, boundToOpenChat: bound?.name || null, profiles: L.profiles().map(p => ({ id: p.id, name: p.name, holds: L.describe(p), inUse: L.matches(p) })) }; } },
    { name: 'open', sig: '{page?, chat?}', desc: 'Show a screen right away (no card, nothing is saved): page = home | chat | lore | presets | personas | conns | regex | qr | themes | flow | studio | settings | exts | diary | help | import …; chat= a chat id or title (or a character name: its latest chat) opens that chat. Use it to take the user to what you just made or to the screen they asked about.',
      run: async a => {
        const { go, pageNames } = await import('../lib/router');
        if (a.chat != null && str(a.chat).trim()) {
          let c: Chat | undefined; try { c = openChat(a.chat); } catch { const ch = charRef(a.chat); c = [...S.chats].filter(x => x.charIds.includes(ch.id)).sort((x, y) => y.updatedAt - x.updatedAt)[0]; if (!c) fail(`${ch.name} has no chat yet — use create_chat.`); }
          go('chat', c!.id); return { opened: 'chat', chat: chatTitle(c!) };
        }
        const p = str(a.page).trim() || 'home', names = pageNames();
        if (!names.includes(p)) fail(`Unknown page "${p}". Pages: ${names.join(', ')}.`);
        go(p); return { opened: p };
      } },
  ];

  const write: ToolDef[] = [
    { name: 'create_chat', write: true, sig: '{character | characters: [names or ids], mode?: "rp"|"talk", greeting?: <0 = first>, persona?, name?, open?: true}', desc: 'Propose starting a new chat with one character (or several for a group): the first greeting is posted; greeting= picks an alternate greeting by number, persona= the user persona, name= a room name. When applied the chat opens (open: false keeps the current screen).',
      run: a => {
        const refs = Array.isArray(a.characters) && a.characters.length ? a.characters : [a.character];
        if (!refs.length || refs.some(r => r == null || !str(r).trim())) fail('Give character= (or characters=[…]).');
        const cs = refs.map(charRef), p = a.persona != null && str(a.persona).trim() ? personaRef(a.persona) : null, g = Math.max(0, num(a.greeting));
        if (g && g > (cs[0].altGreetings || []).length) fail(`${cs[0].name} has ${(cs[0].altGreetings || []).length} alternate greetings.`);
        const args = { charIds: cs.map(c => c.id), mode: a.mode === 'talk' ? 'talk' : 'rp', greeting: g, personaId: p?.id || '', name: str(a.name).trim(), open: a.open !== false };
        return act('chats', 'create', cs.map(c => c.name).join(', '), 'newchat', args, [{ name: 'characters', before: '', after: cs.map(c => c.name).join(', ') }, { name: 'mode', before: '', after: args.mode }, ...(g ? [{ name: 'greeting', before: '', after: `#${g}` }] : []), ...(p ? [{ name: 'persona', before: '', after: p.name }] : []), ...(args.name ? [{ name: 'name', before: '', after: args.name }] : [])]);
      } },
    { name: 'update_chat', write: true, sig: '{chat?, name?, persona?, mode?: "rp"|"talk", profile?: <name or "">, note?, noteDepth?, noteRole?: "system"|"user"|"assistant"}', desc: 'Propose changing a chat (default the open one): its name, user persona, mode, bound connection profile ("" unbinds), or author\'s note (text, depth, role).',
      run: a => {
        const c = openChat(a.chat), f: Obj = {};
        if (a.name != null) f.name = str(a.name).trim();
        if (a.persona != null) f.personaId = str(a.persona).trim() ? personaRef(a.persona).id : '';
        if (a.mode != null) { if (!['rp', 'talk'].includes(str(a.mode))) fail('mode must be "rp" or "talk".'); f.mode = str(a.mode); }
        if (a.note != null) f['note.text'] = str(a.note);
        if (a.noteDepth != null) f['note.depth'] = Math.max(0, Math.min(100, num(a.noteDepth, 4)));
        if (a.noteRole != null) { if (!['system', 'user', 'assistant'].includes(str(a.noteRole))) fail('noteRole must be system, user or assistant.'); f['note.role'] = str(a.noteRole); }
        return (async () => {
          if (a.profile != null) { const list = await profiles(); f.profileId = str(a.profile).trim() ? find(list, a.profile, 'connection profile').id : ''; }
          const cur0 = c as unknown as Obj, get = (k: string) => k.split('.').reduce<unknown>((o, x) => (o as Obj | undefined)?.[x], cur0);
          const plist = await profiles(), disp = (k: string, v: unknown) => k === 'personaId' ? (S.get('personas', str(v))?.name || str(v)) : k === 'profileId' ? (plist.find(p => p.id === str(v))?.name || str(v)) : show(v);
          const fs = Object.entries(f).filter(([k, v]) => show(get(k)) !== show(v)).map(([k, v]) => ({ name: k, before: disp(k, get(k)), after: disp(k, v) }));
          return propose('update', 'chats', chatTitle(c), { type: 'set', coll: 'chats', id: c.id, fields: Object.fromEntries(Object.entries(f).filter(([k]) => fs.some(x => x.name === k))) }, fs);
        })();
      } },
    { name: 'delete_chat', write: true, sig: '{chat}', desc: 'Propose deleting a whole chat with its messages and long-term memory (the user confirms; undo puts all of it back).',
      run: async a => { const c = openChat(a.chat || fail('Give chat= (an id or title; list kind="chats").')), n = (await msgsOf(c)).length; return act('chats', 'delete', chatTitle(c), 'delchat', { chatId: c.id }, [{ name: 'chat', before: `${chatTitle(c)} (${n} messages)`, after: '' }]); } },
    { name: 'edit_message', write: true, sig: '{chat?, no, text? | old + new, hidden?, pin?, memo?}', desc: 'Propose changing one message (no = its number as in get_chat): text= replaces the shown swipe, or old/new replaces one exact piece of it; hidden=true keeps it out of the prompt; pin=true keeps it in the prompt even when old; memo= a private note only the user sees ("" clears).',
      run: async a => {
        const c = openChat(a.chat), list = await msgsOf(c), m = list[num(a.no) - 1] || fail(`No message ${a.no}; the chat has ${list.length}.`), f: Obj = {}, fs: FieldChange[] = [];
        const was = msgText(m);
        if (a.old != null) { const o = str(a.old); if (!o) fail('"old" is empty.'); const n = was.split(o).length - 1; if (n !== 1) fail(n ? `"old" occurs ${n} times — add a little more context.` : '"old" was not found in that message; copy it exactly from get_message.'); f.text = was.replace(o, () => str(a.new)); }
        else if (a.text != null) f.text = str(a.text);
        if (f.text != null && f.text !== was) fs.push({ name: `#${num(a.no)} text`, before: was, after: str(f.text) }); else delete f.text;
        for (const k of ['hidden', 'pin'] as const) if (a[k] != null && !!a[k] !== !!(m as Obj)[k]) { f[k] = !!a[k]; fs.push({ name: k, before: String(!!(m as Obj)[k]), after: String(!!a[k]) }); }
        if (a.memo != null && str(a.memo) !== str((m as Obj).memo)) { f.memo = str(a.memo); fs.push({ name: 'memo', before: str((m as Obj).memo), after: str(a.memo) }); }
        if (!fs.length) fail('Nothing would change.');
        return act('msgs', 'update', `${chatTitle(c)} #${num(a.no)}`, 'msgset', { chatId: c.id, msgId: m.id, fields: f }, fs);
      } },
    { name: 'delete_messages', write: true, sig: '{chat?, from, to?}', desc: 'Propose deleting messages from number from to number to (default just from) in a chat (default the open one). The user confirms; undo puts them back in place.',
      run: async a => {
        const c = openChat(a.chat), list = await msgsOf(c), from = num(a.from), to = a.to == null ? from : num(a.to);
        if (from < 1 || to < from || to > list.length) fail(`from/to must be within 1–${list.length}.`);
        const gone = list.slice(from - 1, to);
        return act('msgs', 'delete', `${chatTitle(c)} #${from}${to > from ? '–' + to : ''}`, 'msgdel', { chatId: c.id, ids: gone.map(m => m.id) }, gone.slice(0, 6).map((m, i) => ({ name: `#${from + i} ${m.name || m.role}`, before: clip(msgText(m), 'text', 160), after: '' })));
      } },
    { name: 'switch', write: true, sig: '{profile? | connection?, model?, preset?}', desc: 'Propose switching what the app talks with: a connection profile (applies its connection, model, preset and formatting at once), or a connection, a model on it, and/or a preset (by name or id). Keys stay where they are; nothing needs typing. Undo switches back.',
      run: async a => {
        if (a.profile != null && str(a.profile).trim()) { const p = find(await profiles(), a.profile, 'connection profile'); return act('switch', 'update', p.name, 'switch', { profileId: p.id }, [{ name: 'profile', before: '', after: p.name }]); }
        const conn = a.connection != null && str(a.connection).trim() ? find(S.conns, a.connection, 'connection') : null, pre = a.preset != null && str(a.preset).trim() ? find(S.presets, a.preset, 'preset') : null, model = str(a.model).trim();
        if (!conn && !pre && !model) fail('Give profile=, or connection= / model= / preset=.');
        const now = S.conn(), fs: FieldChange[] = [];
        if (conn && conn.id !== S.settings.activeConn) fs.push({ name: 'connection', before: now?.name || '', after: conn.name });
        if (model) fs.push({ name: 'model', before: (conn || now)?.model || '', after: model });
        if (pre && pre.id !== S.settings.activePreset) fs.push({ name: 'preset', before: S.preset()?.name || '', after: pre.name });
        if (!fs.length) fail('That is already in use.');
        return act('switch', 'update', [conn?.name, model, pre?.name].filter(Boolean).join(' · '), 'switch', { connId: conn?.id || '', model, presetId: pre?.id || '' }, fs);
      } },
    { name: 'save_profile', write: true, sig: '{name, connection?, model?, preset?}', desc: 'Propose saving a connection profile: what is in use now, or the connection / model / preset given. Then switch profile= or update_chat profile= binds it.',
      run: async a => {
        const name = str(a.name).trim() || fail('"name" is required.'), list = await profiles();
        if (list.some(p => p.name.toLowerCase() === name.toLowerCase())) fail(`A profile named "${name}" exists already.`);
        const conn = a.connection != null && str(a.connection).trim() ? find(S.conns, a.connection, 'connection') : null, pre = a.preset != null && str(a.preset).trim() ? find(S.presets, a.preset, 'preset') : null;
        const args = { name, connId: conn?.id || '', model: str(a.model).trim(), presetId: pre?.id || '' };
        return act('switch', 'create', name, 'profileadd', args, [{ name: 'profile', before: '', after: name }, { name: 'connection', before: '', after: (conn || S.conn())?.name || '' }, { name: 'model', before: '', after: args.model || (conn || S.conn())?.model || '' }, { name: 'preset', before: '', after: (pre || S.preset())?.name || '' }]);
      } },
    { name: 'remember', write: true, sig: '{chat?, summary, kind?, importance?: 0-1, pinned?, visibility?: "public"|"private"|"secret", owner?, knowers?: [names]}', desc: `Propose adding a long-term memory card to a chat (default the open one) — something the story must not forget. kind: ${MEM_KINDS.join(' | ')}.`,
      run: a => {
        const c = memChat(a.chat), sum = str(a.summary).trim() || fail('"summary" is required.'), vis = str(a.visibility || 'public');
        if (!['public', 'private', 'secret'].includes(vis)) fail('visibility must be public, private or secret.');
        const rec: Obj = { summary: sum.slice(0, 400), kind: MEM_KINDS.includes(str(a.kind)) ? str(a.kind) : 'fact', importance: Math.max(0, Math.min(1, num(a.importance, 0.8))), pinned: !!a.pinned, visibility: vis, ...(a.owner ? { owner: str(a.owner) } : {}), ...(Array.isArray(a.knowers) ? { knowers: a.knowers.map(str).slice(0, 6) } : {}) };
        return act('mem', 'create', chatTitle(c), 'memadd', { chatId: c.id, rec }, Object.entries(rec).map(([k, v]) => ({ name: k, before: '', after: show(v) })));
      } },
    { name: 'update_memory', write: true, sig: '{chat?, id, summary?, kind?, importance?, pinned?, disabled?, retired?: "<what is true now>"|null}', desc: 'Propose changing one memory card (ids from get_memories): wording, kind, importance, pinned, disabled (kept but never recalled), or retired (the story moved on; give what is true now, null brings it back).',
      run: async a => {
        const c = memChat(a.chat), { Memory } = await import('../lib/memory'), mem = await Memory.load(c.id), m = mem.memories.find(x => x.id === str(a.id)) || fail('No memory with that id; use get_memories.');
        const f: Obj = {};
        if (a.summary != null) f.summary = str(a.summary).slice(0, 400);
        if (a.kind != null) f.kind = MEM_KINDS.includes(str(a.kind)) ? str(a.kind) : fail(`kind must be one of ${MEM_KINDS.join(', ')}.`);
        if (a.importance != null) f.importance = Math.max(0, Math.min(1, num(a.importance)));
        for (const k of ['pinned', 'disabled'] as const) if (a[k] != null) f[k] = !!a[k];
        if ('retired' in a) f.retired = a.retired == null ? null : { turn: -1, now: str(a.retired), manual: true };
        const fs = Object.entries(f).filter(([k, v]) => show((m as Obj)[k]) !== show(v)).map(([k, v]) => ({ name: k, before: show((m as Obj)[k]), after: show(v) }));
        if (!fs.length) fail('Nothing would change.');
        return act('mem', 'update', clip(m.summary, 's', 60), 'memset', { chatId: c.id, id: m.id, fields: Object.fromEntries(fs.map(x => [x.name, f[x.name]])) }, fs);
      } },
    { name: 'forget', write: true, sig: '{chat?, id}', desc: 'Propose deleting one memory card (the user confirms; undo puts it back). To keep it but stop recalling it, use update_memory disabled=true instead.',
      run: async a => { const c = memChat(a.chat), { Memory } = await import('../lib/memory'), mem = await Memory.load(c.id), m = mem.memories.find(x => x.id === str(a.id)) || fail('No memory with that id; use get_memories.'); return act('mem', 'delete', clip(m.summary, 's', 60), 'memdel', { chatId: c.id, id: m.id }, [{ name: 'memory', before: m.summary, after: '' }]); } },
    { name: 'run_command', write: true, sig: '{script}', desc: 'Propose running STscript in the open chat, exactly as a quick-reply button would (/bg, /setvar, /sys, /echo, /buttons …), and get its output. Scripts that generate replies, send messages or delete things always wait for the user\'s click; other scripts run as soon as the card is applied. It cannot be undone.',
      run: async a => {
        const s = str(a.script).trim() || fail('"script" is required.');
        const { checkScript } = await import('../stscript/ref'), r = checkScript(s, []);
        if (r.errors) fail(`The script has errors (st_check shows the full report): ${r.issues.filter(i => i.level === 'error').slice(0, 3).map(i => `line ${i.line}:${i.col} ${i.msg}`).join(' | ')}`);
        return act('cmd', 'update', clip(s.split('\n')[0], 's', 60), 'run', { script: s, risky: riskyScript(s) }, [{ name: 'script', before: '', after: s }]);
      } },
    { name: 'delete', write: true, sig: '{kind: "character"|"persona"|"lorebook"|"preset"|"theme", id}', desc: 'Propose deleting a whole character, persona, lorebook, preset or custom theme (the user confirms; undo restores it). Chats with a deleted character stay. For chats use delete_chat; regex scripts, entries and quick replies have their own delete_* tools.',
      run: a => {
        const k = KINDS[str(a.kind)] || fail('kind must be character, persona, lorebook, preset or theme.');
        const it = find(k.list(), a.id, k.what) as Obj & { id: string; name?: string };
        if (k.coll === 'presets' && S.presets.length < 2) fail('This is the only preset; the app needs one.');
        const used = k.coll === 'chars' ? S.chats.filter(c => c.charIds.includes(it.id)).length : 0;
        return propose('delete', k.coll, str(it.name) || it.id, { type: 'delete', coll: k.coll, id: it.id }, [{ name: k.what, before: str(it.name) || it.id, after: '' }, ...(used ? [{ name: 'chats', before: `${used} chats keep their messages`, after: '' }] : [])]);
      } },
    { name: 'duplicate', write: true, sig: '{kind: "character"|"persona"|"lorebook"|"preset", id, name?}', desc: 'Propose a copy of a character, persona, lorebook or preset under a new name (default "<name> (copy)") — a safe place to try changes. A copied character keeps its lorebook links; a copied lorebook gets its own entries.',
      run: a => {
        const k = KINDS[str(a.kind)] || fail('kind must be character, persona, lorebook or preset.'); if (k.coll === 'theme') fail('Themes: use create_theme.');
        const it = find(k.list(), a.id, k.what) as Obj & { id: string; name?: string }, name = str(a.name).trim() || `${str(it.name)} (copy)`;
        if (k.list().some(x => str(x.name).toLowerCase() === name.toLowerCase())) fail(`A ${k.what} named "${name}" exists already; give name=.`);
        const obj: Obj = k.coll === 'presets' ? { name, from: it.id } : { ...structuredClone(it), name };
        if (k.coll !== 'presets') { delete obj.id; delete obj.createdAt; delete obj.updatedAt; }
        if (k.coll === 'lore' && Array.isArray(obj.entries)) obj.entries = (obj.entries as Obj[]).map(e => { const x = { ...e }; delete x.id; return x; });
        return propose('create', k.coll, name, { type: 'create', coll: k.coll, obj }, [{ name: 'copy of', before: '', after: str(it.name) }, { name: 'name', before: '', after: name }]);
      } },
    { name: 'import_card', write: true, sig: '{url}', desc: 'Propose importing a character card from a link the user gave (a card page such as chub, or a direct .png / .json / .charx link) with its embedded lorebook and scripts. Undo removes what it brought in. Never invent links.',
      run: a => { const url = str(a.url).trim(); if (!/^https?:\/\/\S+$/i.test(url)) fail('Give the full http(s) link the user gave.'); return act('chars', 'create', url.replace(/^https?:\/\//, '').slice(0, 60), 'importurl', { url }, [{ name: 'link', before: '', after: url }]); } },
    { name: 'create_preset', write: true, sig: '{name, from?}', desc: 'Propose a new preset: a copy of from= (a preset name or id) or the default preset. Then add_preset_block / update_preset / update_preset_block shape it, and switch preset= puts it in use.',
      run: a => {
        const name = str(a.name).trim() || fail('"name" is required.');
        const src = a.from != null && str(a.from).trim() ? find(S.presets, a.from, 'preset') : null;
        if (S.presets.some(p => p.name.toLowerCase() === name.toLowerCase())) fail(`A preset named "${name}" exists already; use update_preset.`);
        return propose('create', 'presets', name, { type: 'create', coll: 'presets', obj: { name, ...(src ? { from: src.id } : {}) } }, [{ name: 'name', before: '', after: name }, { name: 'from', before: '', after: src?.name || 'default' }]);
      } },
  ];
  return { read, write };
}

/** 사람이 꼭 눌러야 하는 카드: 지우기 · 돈 드는 명령 · 확장 설치 */
export const mustConfirm = (ch: Change) => ch.verb === 'delete' || ch.op.type === 'ext' || (ch.op.type === 'action' && ch.op.name === 'run' && !!ch.op.args.risky);
export type { Args };
