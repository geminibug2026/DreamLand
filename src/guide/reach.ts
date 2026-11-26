// 등불지기가 손대는 곳 넓히기: 대화방 · 메시지 · 연결 바꾸기 · 연결 프로필 · 장기기억 · 명령 실행 · 화면 이동 · 지우기 · 새 프리셋.
// 읽기는 바로, 쓰기는 변경 카드(행동 카드 포함)로. 도우미 함수는 tools.ts 가 넘겨준다 (서로 부르지 않게)
import { S } from '../lib/core';
import type { Char, Chat, Msg } from '../lib/types';
import type { Change, FieldChange, Kind, Op, ToolDef } from './types';
import { riskyScript } from './acts';
import { t } from '../i18n';
import { hitLabel } from './labels';

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
  /** 이 대화의 변경 카드 모두 (오래된 것부터) */
  cards: () => Change[];
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
  const { str, num, clip, fail, find, propose, show, openChat, chatTitle, cur, msgText, card, cards } = h;
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
    { name: 'playbook', sig: '{topic: "game"|"panels"|"motion"|"cards"|"mvu"|"lalib"|"presets"|"lore"|"memory"}', desc: 'Long instructions for one kind of work (see PLAYBOOKS). Read the one that fits once per conversation, in the same message as your first calls.',
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
    { name: 'history', sig: '{limit?}', desc: 'What was changed recently and can be undone: the change cards of this conversation (id, what, state, undoable) and the app\'s undo list from earlier conversations and scripts (undo id, when, what). Use it before undo, or when the user asks what you changed.',
      run: async () => {
        const { undoList } = await import('./changes'), ledger = await undoList(), mine = new Set(cards().map(c => c.undoId).filter(Boolean));
        const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
        return {
          thisConversation: cards().slice(-30).reverse().map(c => ({ card: c.id, what: `${c.verb} ${c.kind}: ${c.target}`, state: c.state, undoable: c.state === 'applied' && !!c.undoId })),
          earlier: ledger.filter(r => !mine.has(r.id)).slice(0, 20).map(r => ({ undo: r.id, what: `${r.created ? 'create' : 'change'} ${r.kind}: ${r.target}`, when: ago(r.at), by: r.src === 'th' ? 'a script' : 'the Lampkeeper' })),
        };
      } },
    { name: 'preview_screen', sig: '{card? | regex? | html?, chat?, message?: <number>|"last"}', desc: 'Draw what a message will show — after the display regex scripts — off-screen at phone width (360px) and desktop width (800px), exactly as the chat draws it, and measure it: script errors inside screens, anything wider than the screen, height, text under 11px, buttons smaller than 32px, words like undefined / NaN / null showing, and the visible text. card= a create_regex / update_regex card from this conversation (it is tried on the message without saving; card="last" = the newest one, so it can ride in the same message as the proposal), regex= a saved script, html= raw text or HTML to draw. The message is the last character reply of the open chat unless message= / chat= say otherwise. Nothing is saved.',
      run: async a => {
        const { previewText } = await import('./preview'), E = await import('../lib/engine'), A = await import('../chat/actions'), C = await import('../lib/core');
        let text = '', note = '';
        if (a.html != null && str(a.html).trim()) text = str(a.html);
        else {
          const c = openChat(a.chat), list = await msgsOf(c);
          const m = a.message == null || a.message === 'last' ? [...list].reverse().find(x => x.role === 'assistant') : list[num(a.message) - 1];
          if (!m) fail(a.message == null ? 'The chat has no character reply yet; give message= or html=.' : `No message ${str(a.message)}; the chat has ${list.length}.`);
          let rx: Obj | null = null;
          if (a.card != null && str(a.card).trim()) {
            const isRx = (x: Change) => { const o = x.op as Op & { coll?: string }; return (o.type === 'create' || o.type === 'set') && o.coll === 'regex'; };
            const cd = (str(a.card) === 'last' ? [...cards()].reverse().find(isRx) : card(str(a.card))) || fail(str(a.card) === 'last' ? 'No regex card in this conversation yet.' : 'No change card with that id in this conversation.'), op = cd.op as Op & { coll?: string; obj?: Obj; id?: string; fields?: Obj };
            if (op.type === 'create' && op.coll === 'regex') rx = C.newRegex(structuredClone(op.obj) as never) as unknown as Obj;
            else if (op.type === 'set' && op.coll === 'regex') { const base = S.get('regex', str(op.id)) || fail('That regex script is gone.'); rx = { ...structuredClone(base), ...structuredClone(op.fields || {}) } as Obj; }
            else fail('That card is not a regex card.');
          } else if (a.regex != null && str(a.regex).trim()) { const r = find(S.regex, a.regex, 'regex script'); if (!r.enabled) { rx = r as unknown as Obj; note = 'The script is turned off; it was applied here only for the preview.'; } }
          const src = msgText(m!), after = rx ? E.runRegexScript(rx as never, src) : src;
          if (rx && after === src) note = 'The script did not match this message, so nothing of it is drawn. Check find= with regex_test, or preview a message that contains the placeholder.';
          const fake = { ...m!, swipes: [{ ...m!.swipes[m!.sw], text: after }], sw: 0 } as Msg;
          text = A.shownText(fake, { chat: c, msgs: list } as never);
        }
        const reps = await previewText(text), issues: string[] = [];
        for (const r of reps) {
          const tag = r.width < 600 ? 'phone' : 'desktop';
          r.screens.forEach((sc, i) => {
            const nm = r.screens.length > 1 ? `screen ${i + 1}` : 'the screen';
            if (sc.errors.length) issues.push(`${tag}: ${nm} has script errors: ${sc.errors.slice(0, 3).join(' | ')}`);
            if (sc.scrollWidth > sc.width + 1 || sc.wide.length) issues.push(`${tag}: ${nm} is wider than ${sc.width}px (${sc.wide.slice(0, 2).join('; ') || sc.scrollWidth + 'px'})`);
            if (sc.bad.length) issues.push(`${tag}: ${nm} shows ${[...new Set(sc.bad)].join(', ')} — a value is missing; guard the read`);
            if (tag === 'phone' && sc.tinyText) issues.push(`phone: ${nm} has ${sc.tinyText} text pieces under 11px`);
            if (tag === 'phone' && sc.smallButtons) issues.push(`phone: ${nm} has ${sc.smallButtons} of ${sc.buttons} tap targets under 32px`);
            if (tag === 'phone' && sc.height > 1100) issues.push(`phone: ${nm} is ${sc.height}px tall — fold the rest into tabs or <details>`);
          });
          if (r.screensMissing) issues.push(`${tag}: ${r.screensMissing} screen(s) never finished drawing (an endless loop, a script that blocks, or the screen failed to load)`);
          if (r.inline?.wide.length) issues.push(`${tag}: the inline HTML is wider than ${r.width}px (${r.inline.wide.slice(0, 2).join('; ')})`);
          if (r.inline?.bad.length) issues.push(`${tag}: the message shows ${[...new Set(r.inline.bad)].join(', ')}`);
          if (tag === 'phone' && r.inline?.tinyText) issues.push(`phone: the inline HTML has ${r.inline.tinyText} text pieces under 11px`);
        }
        const brief = (r: (typeof reps)[number]) => ({ width: r.width, screens: r.screens.map(sc => ({ height: sc.height, errors: sc.errors, wider: sc.scrollWidth > sc.width + 1 || sc.wide.length > 0, tinyText: sc.tinyText, buttons: sc.buttons, smallButtons: sc.smallButtons, text: clip(sc.text, 'text', r.width < 600 ? 400 : 160) })), ...(r.inline ? { inline: { height: r.inline.height, text: clip(r.inline.text, 'text', 240) } } : {}) });
        return { ok: !issues.length, issues: issues.length ? issues : 'none', ...(note ? { note } : {}), widths: reps.map(brief), next: issues.length ? 'Fix these (revise_card on a pending card, or update_regex), then preview again.' : 'It draws cleanly at both widths.' };
      } },
    { name: 'test_extension', sig: '{card? | id?}', desc: 'Run a Dreamland extension in an isolated sandbox with a stand-in api (nothing in the app changes): reports errors in activate(), then calls every command, panel render, message action, composer action, text filter, macro, page and event handler it registered once with sample data, and counts what it would really do (send messages, generate, call the model). card= a create_extension / revise_extension card from this conversation (pending or applied; card="last" = the newest one, so it can ride in the same message as create_extension), or id= an installed extension. SillyTavern extensions cannot run here; their checks are static.',
      run: async a => {
        let code = '', name = '';
        if (a.card != null && str(a.card).trim()) {
          const c = (str(a.card) === 'last' ? [...cards()].reverse().find(x => x.op.type === 'ext') : card(str(a.card))) || fail(str(a.card) === 'last' ? 'No extension card in this conversation yet.' : 'No change card with that id in this conversation.'), op = c.op as Op;
          if (op.type !== 'ext') return fail('That is not an extension card.'); if (op.target !== 'dl') return fail('SillyTavern extensions cannot run inside Dreamland; rely on the static checks in the card.');
          code = op.files[op.main] || fail('The card has no main file.'); name = op.name;
        } else {
          const E = await import('../lib/ext'), it = E.catalog.find(x => x.id === str(a.id)) || fail('No installed extension with that id.');
          code = it.code || fail('That extension is loaded from a folder; test its card instead.'); name = it.name;
        }
        const { trialExt } = await import('./trial'), r = await trialExt(code);
        return { extension: name, ok: r.ok, ...(r.activateError ? { activateError: r.activateError } : {}), errors: r.errors.length ? r.errors : 'none', registered: r.registered, ...(Object.keys(r.wouldDo).length ? { wouldDo: r.wouldDo } : {}), ...(r.notes.length ? { notes: r.notes } : {}), next: r.ok ? 'It runs. If wouldDo shows something the user did not ask for at that moment (sending, generating, model calls), check it is behind a setting or a user action.' : 'Fix each error with revise_extension, then test again.' };
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
    { name: 'undo', write: true, sig: '{card? | undo?}', desc: 'Propose undoing an applied change: card= a change card id from this conversation, or undo= an id from history\'s earlier list. Undoing something that was created deletes it again, and undoing an item the user edited since then loses those edits — both wait for the user\'s click.',
      run: async a => {
        const { undoList, touchedSince } = await import('./changes'), ledger = await undoList();
        let undoId = '', label = '', created = false;
        if (a.card != null && str(a.card).trim()) {
          const c = card(str(a.card)) || fail('No change card with that id in this conversation (see history).');
          if (c.state !== 'applied') fail(`That card is ${c.state}, not applied.`); if (!c.undoId) fail('That change cannot be undone (running a command, or a SillyTavern extension download).');
          undoId = c.undoId || ''; label = `${c.verb} ${c.kind}: ${c.target}`; created = c.verb === 'create';
        } else {
          const r = ledger.find(x => x.id === str(a.undo)) || fail('Give card= or undo= (see history).'); undoId = r.id; label = `${r.created ? 'create' : 'change'} ${r.kind}: ${r.target}`; created = r.created;
        }
        if (!ledger.some(x => x.id === undoId)) fail('It can no longer be undone (older than 14 days, or undone already).');
        const touched = await touchedSince(undoId);
        return act('cmd', 'update', label, 'undo', { undoId, confirm: created || touched }, [{ name: 'undo', before: label, after: '' }, ...(created ? [{ name: 'note', before: '', after: 'this removes what was created' }] : []), ...(touched ? [{ name: 'note', before: '', after: 'it was edited after the change; those edits are lost' }] : [])]);
      } },
    { name: 'replace_everywhere', write: true, sig: '{find, replace, regex?: true, in?: ["characters"|"personas"|"lorebooks"|"presets"|"regex"|"quick_replies"], character?}', desc: 'Propose one find-and-replace across every field search sweeps (character fields and greetings, personas, lorebook entry names, keys and content, preset blocks, regex scripts, quick-reply buttons) — one card, one undo. character= limits it to that character and its lorebooks, regex scripts and quick replies. With regex=true, find is a pattern and replace may use $1. Use it to rename someone everywhere or fix a phrase in many places at once; for one place use edit.',
      run: async a => {
        const find0 = str(a.find); if (!find0) fail('"find" is required.');
        const { planReplace, ruleRe } = await import('./acts');
        const rule = { find: find0, replace: str(a.replace), regex: !!a.regex, kinds: Array.isArray(a.in) ? a.in.map(str) : undefined, charIds: a.character != null && str(a.character).trim() ? [charRef(a.character).id] : undefined };
        try { ruleRe(rule); } catch (e) { fail(`"find" is not a valid pattern: ${(e as Error).message}`); }
        const hits = planReplace(rule); if (!hits.length) fail('Nothing matches.');
        const n = hits.reduce((k, x) => k + x.n, 0), items = new Set(hits.map(x => x.coll + x.id)).size;
        const snip = (t: string) => { const re = ruleRe(rule), m = re.exec(t); if (!m) return clip(t, 's', 160); const a0 = Math.max(0, m.index - 60); return (a0 ? '…' : '') + t.slice(a0, m.index + m[0].length + 80); };
        const fs: FieldChange[] = [{ name: 'summary', before: '', after: t('guide.rep.count', { n, items }) }, ...hits.slice(0, 14).map(x => ({ name: hitLabel(x.coll, x.name, x.field), before: snip(x.before), after: snip(x.after) }))];
        if (hits.length > 14) fs.push({ name: 'more', before: '', after: t('guide.rep.more', { n: hits.length - 14 }) });
        return act('chars', 'update', `"${clip(find0, 'f', 30)}" → "${clip(str(a.replace), 'r', 30)}"`, 'bulkreplace', { rule, big: items > 10 }, fs);
      } },
    { name: 'set_tags', write: true, sig: '{characters: [names or ids] | all: true, add?: [tags], remove?: [tags]}', desc: 'Propose adding and/or removing tags on many characters at once (one card, one undo).',
      run: a => {
        const cs = a.all === true ? S.chars : (Array.isArray(a.characters) ? a.characters : []).map(charRef);
        if (!cs.length) fail('Give characters=[…] or all=true.');
        const add = (Array.isArray(a.add) ? a.add : []).map(str).map(x => x.trim()).filter(Boolean), remove = (Array.isArray(a.remove) ? a.remove : []).map(str).map(x => x.trim()).filter(Boolean);
        if (!add.length && !remove.length) fail('Give add=[…] and/or remove=[…].');
        return act('chars', 'update', `${cs.length} characters`, 'tags', { charIds: cs.map(c => c.id), add, remove, big: cs.length > 10 }, [{ name: 'characters', before: '', after: cs.slice(0, 12).map(c => c.name).join(', ') + (cs.length > 12 ? ` … (${cs.length})` : '') }, ...(add.length ? [{ name: 'add', before: '', after: add.join(', ') }] : []), ...(remove.length ? [{ name: 'remove', before: remove.join(', '), after: '' }] : [])]);
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
export const mustConfirm = (ch: Change) => ch.verb === 'delete' || ch.op.type === 'ext' || (ch.op.type === 'action' && ((ch.op.name === 'run' && !!ch.op.args.risky) || (ch.op.name === 'undo' && !!ch.op.args.confirm) || ((ch.op.name === 'bulkreplace' || ch.op.name === 'tags') && !!ch.op.args.big)));
export type { Args };
