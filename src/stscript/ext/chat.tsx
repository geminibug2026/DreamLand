// ── 실리태번 명령 묶음: chat ── 대화방 · 메시지 · 스와이프 · 작가 노트 · 체크포인트/분기 · 토큰
import { t } from '../../i18n';
import { def, str, type Args, type Ctx } from '../run';
import { S, emit, msgText, newMsg } from '../../lib/core';
import * as E from '../../lib/engine';
import { go } from '../../lib/router';
import { Live } from '../../lib/live';
import { Assets } from '../../lib/assets';
import { confirmBox, openModal } from '../../ui';
import { cur, ui } from '../../chat/store';
import { startChat } from '../../chat/start';
import { branch, chatApi, commandList, drawHud, drawMain, drawMsgs, drawSide, drawTop, drawDrawer, generate, roomName, setSide, swipe as swipeMsg } from '../../chat/actions';
import { addCheckpoint, branchFromCheckpoint, cps, posOf, type Checkpoint } from '../../flow/logic';
import type { Chat, Msg } from '../../lib/types';

// ════════ 도움 ════════
const K = (k: string, o?: Record<string, unknown>) => t('st.x.chat.' + k, o);
const N = (a: Args, k: string, d = '') => a.named[k] === undefined ? d : str(a.named[k]);
const yes = (s: string) => ['on', 'true', '1', 'yes'].includes(s.trim().toLowerCase());
const warn = (c: Ctx, k: string, o?: Record<string, unknown>) => { c.host.echo(K(k, o), 'warning'); return ''; };
const need = (): { chat: Chat; msgs: Msg[] } => { const { chat, msgs } = chatApi.current(); if (!chat) throw new Error(t('qr.run.noChat')); return { chat, msgs }; };
const saveChat = (chat: Chat) => S.save('chats', chat, true);
const findChar = (name: string) => { const k = name.trim().toLowerCase(); return S.chars.find(c => c.id === name.trim()) || S.chars.find(c => c.name.toLowerCase() === k) || S.chars.find(c => c.name.toLowerCase().startsWith(k)); };
/** 메시지 번호: 비었으면 마지막, 음수면 끝에서부터 */
const idxOf = (v: string, n: number) => { const s = v.trim(); if (!s) return n - 1; const i = Number(s); if (!Number.isInteger(i)) return NaN; return i < 0 ? n + i : i; };
/** 메시지가 지워진 뒤: 상태창 되감기 · 화면 · 저장 */
async function afterDelete(chat: Chat, msgs: Msg[]) {
  if (Live.rewind(chat, msgs)) drawHud();
  if (cur.chat === chat) { cur.from = Math.max(0, msgs.length - cur.shown); cur.head = Math.max(cur.from, Math.min(cur.head, msgs.length)); drawMain(); drawSide(); }
  await chatApi.save(); emit('message:deleted', { chat, msgs });
}
/** "3" · "2-5" · "-1" 여러 개 → 번호들 (겹침 없이, 큰 번호부터 지우도록 정렬은 부르는 쪽에서) */
function idsOf(spec: string, n: number): number[] {
  const out = new Set<number>();
  for (const p of spec.split(/[\s,]+/).filter(Boolean)) {
    const m = /^(-?\d+)-(-?\d+)$/.exec(p), fix = (x: number) => x < 0 ? n + x : x;
    if (m) { const a = fix(+m[1]), b = fix(+m[2]); for (let i = Math.max(0, Math.min(a, b)); i <= Math.min(n - 1, Math.max(a, b)); i++) out.add(i); }
    else { const i = fix(Number(p)); if (Number.isInteger(i) && i >= 0 && i < n) out.add(i); }
  }
  return [...out].sort((a, b) => a - b);
}

// ════════ 작가 노트 (드림랜드: 대화방의 노트 — 늘 채팅 안 depth 자리에 들어간다) ════════
const noteOf = (chat: Chat) => (chat.note ||= { text: '', depth: 4, role: 'system' });
async function noteSaved(chat: Chat) { await saveChat(chat); if (cur.drawer) drawDrawer(); }
def('note', {
  help: '',
  run: async a => {
    const { chat } = need(), v = str(a.unnamed);
    if (v) { noteOf(chat).text = v; await noteSaved(chat); }
    return noteOf(chat).text;
  },
});
def('note-depth', {
  help: '', alias: ['depth'],
  run: async (a, c) => {
    const { chat } = need(), v = str(a.unnamed).trim();
    if (v) { const n = Number(v); if (Number.isNaN(n)) { c.host.echo(K('notNumber'), 'error'); return ''; } noteOf(chat).depth = Math.abs(Math.round(n)); await noteSaved(chat); }
    return String(noteOf(chat).depth);
  },
});
def('note-frequency', {
  help: '', alias: ['freq', 'note-freq'],
  run: (a, c) => {
    const v = str(a.unnamed).trim();
    if (v) { const n = Number(v); if (Number.isNaN(n)) { c.host.echo(K('notNumber'), 'error'); return ''; } if (Math.abs(n) !== 1) warn(c, 'noteEveryTurn'); }
    return '1';
  },
});
def('note-position', {
  help: '', alias: ['pos', 'note-pos'],
  run: (a, c) => {
    const v = str(a.unnamed).trim().toLowerCase();
    if (v) { if (!['after', 'scenario', 'chat', 'before_scenario', 'before'].includes(v)) { c.host.echo(K('badPosition'), 'error'); return ''; } if (v !== 'chat') warn(c, 'noteInChat'); }
    return 'chat';
  },
});
def('note-role', {
  help: '',
  run: async (a, c) => {
    const { chat } = need(), v = str(a.unnamed).trim().toLowerCase();
    if (v) { if (!['system', 'user', 'assistant'].includes(v)) { c.host.echo(K('badRole'), 'error'); return ''; } noteOf(chat).role = v; await noteSaved(chat); }
    return noteOf(chat).role || 'system';
  },
});

// ════════ 분기 · 체크포인트 (드림랜드 체크포인트 = 이름 붙인 지점. 그 지점의 갈래 방을 checkpoint-go 로 연다) ════════
type CP = Checkpoint & { link?: string };
const cpAt = (chat: Chat, m: Msg | undefined) => m ? (cps(chat as never) as CP[]).find(x => x.msgId === m.id) : undefined;
const msgArg = (a: Args, c: Ctx, useUnnamed: boolean): Msg | null => {
  const { msgs } = need(); const raw = a.named.mesId !== undefined ? N(a, 'mesId') : useUnnamed ? str(a.unnamed) : '';
  const i = idxOf(raw, msgs.length);
  if (Number.isNaN(i)) { warn(c, 'badMsgId'); return null; }
  if (!msgs[i]) { warn(c, 'noMsg', { id: raw || i }); return null; }
  return msgs[i];
};
def('branch-create', {
  help: '',
  run: async (a, c) => {
    const { chat, msgs } = need(), m = msgArg(a, c, true); if (!m) return '';
    const before = new Set(S.chats.map(x => x.id));
    await branch(msgs.indexOf(m));
    const fresh = S.chats.find(x => !before.has(x.id) && x.parent?.id === chat.id);
    return fresh?.name || '';
  },
});
def('checkpoint-create', {
  help: '',
  run: async (a, c) => {
    const m = msgArg(a, c, false); if (!m) return '';
    const cp = await addCheckpoint(m, str(a.unnamed).trim() || undefined);
    return cp.name;
  },
});
def('checkpoint-go', {
  help: '',
  run: async (a, c) => {
    const { chat } = need(), m = msgArg(a, c, true); if (!m) return '';
    const cp = cpAt(chat, m); if (!cp) return warn(c, 'noCheckpoint');
    const linked = cp.link && S.get('chats', cp.link);
    if (linked) { go('chat', linked.id); return cp.name; }
    const fresh = await branchFromCheckpoint(cp, false);
    cp.link = fresh.id; await saveChat(chat);
    go('chat', fresh.id);
    return cp.name;
  },
});
def('checkpoint-exit', {
  help: '',
  run: () => {
    const { chat } = need(), p = chat.parent && S.get('chats', chat.parent.id);
    if (!p) return '';
    go('chat', p.id); return roomName(p);
  },
});
def('checkpoint-parent', {
  help: '',
  run: () => { const { chat } = need(), p = chat.parent && S.get('chats', chat.parent.id); return p ? roomName(p) : ''; },
});
def('checkpoint-get', {
  help: '',
  run: (a, c) => { const { chat } = need(), m = msgArg(a, c, true); return m ? cpAt(chat, m)?.name || '' : ''; },
});
def('checkpoint-list', {
  help: '',
  run: a => {
    const { chat, msgs } = need(), links = yes(N(a, 'links', 'false'));
    const list = (cps(chat as never) as CP[]).map(cp => ({ cp, i: posOf(cp, msgs) })).filter(x => x.i >= 0).sort((x, y) => x.i - y.i);
    return JSON.stringify(list.map(x => links ? x.cp.name : x.i));
  },
});

// ════════ 대화방 ════════
def('newchat', {
  help: '',
  run: async a => {
    const { chat } = need(), del = yes(N(a, 'delete', 'false'));
    const fresh = await startChat(chat.charIds, { mode: chat.mode, open: !del });
    if (del && fresh) { if (cur.gen?.chat === chat) cur.abort?.abort(); await Assets.removeOwner('chat:' + chat.id); await S.remove('chats', chat.id); go('chat', fresh.id); }
    return '';
  },
});
def('delchat', {
  help: '',
  run: async () => {
    const { chat } = need();
    if (!(await confirmBox(t('chat.menu.deleteConfirm', { name: roomName(chat) }), t('common.delete'), true))) return '';
    if (cur.gen?.chat === chat) cur.abort?.abort();
    await Assets.removeOwner('chat:' + chat.id); await S.remove('chats', chat.id);
    cur.chat = null; S.set({ lastChat: '' }); go('chat');
    return '';
  },
});
def('renamechat', {
  help: '',
  run: async (a, c) => {
    const name = str(a.unnamed).trim(); if (!name) return warn(c, 'needName');
    const { chat } = need(); chat.name = name; await saveChat(chat); drawSide(); drawTop();
    c.host.echo(K('renamed', { name }), 'success'); return '';
  },
});
def('getchatname', { help: '', run: () => { const { chat } = chatApi.current(); return chat ? roomName(chat) : ''; } });
def('closechat', { help: '', run: () => { cur.chat = null; S.set({ lastChat: '' }); go('home'); return ''; } });
def('tempchat', { help: '', run: (_a, c) => warn(c, 'noTemp') });
def('forcesave', {
  help: '',
  run: async (_a, c) => { S.saveSettings(); if (chatApi.current().chat) await chatApi.save(); c.host.echo(K('saved'), 'success'); return ''; },
});
def('chat-manager', { help: '', alias: ['chat-history', 'manage-chats'], run: () => { setSide(true); drawSide(); return ''; } });
def('chat-render', {
  help: '',
  run: a => {
    need(); const n = Number(str(a.unnamed)); cur.shown = str(a.unnamed).trim() && !Number.isNaN(n) ? cur.shown + Math.max(0, n) : Number.MAX_SAFE_INTEGER;
    drawMsgs(); if (yes(N(a, 'scroll', 'false')) && ui.scroll) ui.scroll.scrollTop = 0;
    return '';
  },
});
def('chat-reload', { help: '', run: () => { const { chat } = need(); go('chat', chat.id); return ''; } });
def('chat-jump', {
  help: '', alias: ['chat-scrollto', 'floor-teleport'],
  run: (a, c) => {
    const { msgs } = need(), raw = str(a.unnamed).trim(), i = Number(raw);
    if (!raw || !Number.isInteger(i) || i < 0 || i >= msgs.length) return warn(c, 'badIndex', { index: raw, max: msgs.length });
    if (!chatApi.reveal?.(msgs[i].id)) warn(c, 'notRendered', { index: i });
    return '';
  },
});

// ════════ 메시지 ════════
function atMsg(a: Args, c: Ctx): Msg | null {
  const { msgs } = need(), i = idxOf(N(a, 'at'), msgs.length);
  if (Number.isNaN(i) || !msgs[i]) { warn(c, 'noMsg', { id: N(a, 'at') || i }); return null; }
  return msgs[i];
}
def('message-role', {
  help: '',
  run: async (a, c) => {
    const m = atMsg(a, c); if (!m) return '';
    const v = str(a.unnamed).trim().toLowerCase();
    if (v) {
      if (!['user', 'assistant', 'system'].includes(v)) { c.host.echo(K('badRole'), 'error'); return ''; }
      m.role = v as Msg['role'];
      if (v === 'user') { m.charId = ''; m.name = S.persona(need().chat).name; }
      await chatApi.save(); chatApi.redraw();
    }
    return m.role;
  },
});
def('message-name', {
  help: '',
  run: async (a, c) => {
    const m = atMsg(a, c); if (!m) return '';
    const v = str(a.unnamed).trim();
    if (v) {
      if (m.role === 'user') { const p = S.personas.find(x => x.id === v || x.name.toLowerCase() === v.toLowerCase()); m.name = p?.name || v; }
      else { const ch = findChar(v); m.name = ch && (ch.id === v || ch.name.toLowerCase() === v.toLowerCase()) ? ch.name : v; if (ch && m.name === ch.name) m.charId = ch.id; }
      await chatApi.save(); chatApi.redraw();
    }
    return m.name || (m.role === 'user' ? S.persona(need().chat).name : '');
  },
});
const sysNameOf = (chat: Chat) => String((chat as unknown as { sysName?: string }).sysName || '');
def('sysname', {
  help: '',
  run: async a => { const { chat } = need(), v = str(a.unnamed).trim(); const x = chat as unknown as { sysName?: string }; if (v) x.sysName = v; else delete x.sysName; await saveChat(chat); return ''; },
});
/** 시스템 메시지를 넣는다 (at= 이 있으면 그 자리에) */
async function pushSys(text: string, name: string, at: string) {
  const { chat, msgs } = need(), m = newMsg('system', text, name ? { name } : {});
  const i = at.trim() === '' ? NaN : idxOf(at, msgs.length);
  if (Number.isInteger(i) && i >= 0 && i < msgs.length) { msgs.splice(i, 0, m); await chatApi.save(); chatApi.redraw(); }
  else await chatApi.push?.(m);
  void chat;
}
const trimSentence = (s: string) => { const m = /^[\s\S]*[.!?…。！？"”』」)\]*~]/.exec(s); return m ? m[0] : s; };
def('sysgen', {
  help: '',
  run: async (a, c) => {
    const prompt = str(a.unnamed).trim(); if (!prompt) return warn(c, 'needPrompt');
    const { chat } = need(), gen = c.host.gen as (p: string, o: object) => Promise<string>;
    c.host.echo(K('generating'));
    let out = await gen(prompt, {}); if (yes(N(a, 'trim', 'false'))) out = trimSentence(out);
    out = E.applyRegex(out, { who: 'slash', target: 'store', chat });
    await pushSys(out, N(a, 'name') || sysNameOf(chat), N(a, 'at'));
    const r = N(a, 'return', 'none'); return r === 'none' ? '' : out;
  },
});
def('ask', {
  help: '',
  run: async (a, c) => {
    const { chat } = need(), name = N(a, 'name').trim();
    if (!name) return warn(c, 'needCharName');
    const ch = findChar(name); if (!ch) { c.host.echo(K('noChar', { name }), 'error'); return ''; }
    const text = str(a.unnamed).trim();
    if (text) await chatApi.push?.(newMsg('user', E.applyRegex(text, { who: 'slash', target: 'store', chat }), { name: S.persona(chat).name }));
    const before = chatApi.current().msgs.length;
    await generate('normal', { speaker: ch });
    const { msgs } = chatApi.current(), last = msgs[msgs.length - 1];
    const out = msgs.length > before && last?.role === 'assistant' ? msgText(last) : '';
    return N(a, 'return', 'pipe') === 'none' ? '' : out;
  },
});
def('delname', {
  help: '', alias: ['cancel'],
  run: async (a, c) => {
    const raw = str(a.unnamed).trim(); if (!raw) return '';
    const { chat, msgs } = need(), name = findChar(raw)?.name || raw;
    const gone = msgs.filter(m => m.name === name); if (!gone.length) return '';
    for (const m of gone) msgs.splice(msgs.indexOf(m), 1);
    await afterDelete(chat, msgs);
    c.host.echo(K('deletedBy', { n: gone.length, name })); return '';
  },
});
def(['del'], {
  help: '', alias: ['delete', 'delmode'],
  run: async (a, c) => {
    const { chat, msgs } = need(), raw = str(a.unnamed).trim();
    if (!raw) return warn(c, 'delHow');
    const n = Number(raw); if (!Number.isInteger(n) || n <= 0) return warn(c, 'badNumber');
    const gone = msgs.splice(Math.max(0, msgs.length - n));
    if (gone.length) await afterDelete(chat, msgs);
    return gone.map(msgText).join('\n');
  },
});
def('cut', {
  help: '',
  run: async (a, c) => {
    const { chat, msgs } = need(), ids = idsOf(a.parts.map(str).join(' '), msgs.length);
    if (!ids.length) return warn(c, 'badRange');
    const text = ids.map(i => msgText(msgs[i])).join('\n');
    for (const i of [...ids].reverse()) msgs.splice(i, 1);
    await afterDelete(chat, msgs);
    return text;
  },
});

// ════════ 스와이프 ════════
const lastMsg = () => { const { msgs } = need(); return msgs[msgs.length - 1] as Msg | undefined; };
def('swipe', {
  help: '',
  run: async (a, c) => {
    const m = lastMsg(); if (!m) return '';
    if (cur.busy) return warn(c, 'busy');
    const p = swipeMsg(m, N(a, 'direction', 'right').toLowerCase() === 'left' ? -1 : 1);
    if (yes(N(a, 'await', 'false'))) { await p; while (cur.busy) await new Promise(r => setTimeout(r, 150)); }
    return '';
  },
});
def('delswipe', {
  help: '', alias: ['swipedel'],
  run: async (a, c) => {
    const { chat, msgs } = need(), m = lastMsg(); if (!m) return '';
    if (m.role !== 'assistant') return warn(c, 'swipeOnlyAi');
    if (m.swipes.length <= 1) return warn(c, 'lastSwipe');
    const raw = str(a.unnamed).trim(), n = Number(raw), i = raw && !Number.isNaN(n) ? n - 1 : m.sw;
    if (!Number.isInteger(i) || i < 0 || i >= m.swipes.length) return warn(c, 'badSwipe', { n: raw });
    m.swipes.splice(i, 1);
    if (m.sw > i || m.sw >= m.swipes.length) m.sw = Math.max(0, m.sw - 1);
    if (Live.rewind(chat, msgs)) drawHud();
    await chatApi.save(); chatApi.redraw(); emit('message:swiped', { chat, msg: m, msgs });
    return String(m.sw);
  },
});
def('addswipe', {
  help: '', alias: ['swipeadd'],
  run: async (a, c) => {
    const { chat, msgs } = need(), m = lastMsg(), text = str(a.unnamed);
    if (!m) return warn(c, 'noMessages');
    if (!text) return '';
    if (m.role !== 'assistant') return warn(c, 'swipeOnlyAi');
    m.swipes.push({ text, ts: Date.now(), model: 'slash command' });
    if (yes(N(a, 'switch', 'false'))) { m.sw = m.swipes.length - 1; if (Live.rewind(chat, msgs)) drawHud(); }
    await chatApi.save(); chatApi.redraw();
    return String(m.swipes.length - 1);
  },
});
def('reroll-pick', {
  help: '',
  run: async (a, c) => {
    const { chat } = need(), x = chat as unknown as { pickSeed?: number }, v = parseInt(str(a.unnamed), 10);
    x.pickSeed = Number.isNaN(v) ? (x.pickSeed || 0) + 1 : v; await saveChat(chat);
    warn(c, 'pickRandom');
    return String(x.pickSeed);
  },
});

// ════════ 캐릭터 · 방 열기 ════════
def('go', {
  help: '', alias: ['char'],
  run: async a => {
    const raw = str(a.unnamed).trim(); if (!raw) return '';
    const ch = findChar(raw);
    if (ch) {
      const last = S.chats.filter(x => x.charIds.length === 1 && x.charIds[0] === ch.id).sort((p, q) => q.updatedAt - p.updatedAt)[0];
      if (last) go('chat', last.id); else await startChat([ch.id]);
      return ch.name;
    }
    const k = raw.toLowerCase(), room = S.chats.filter(x => x.charIds.length > 1 && (roomName(x).toLowerCase() === k || (x.name || '').toLowerCase() === k || chatApi.groupTitle?.(x).toLowerCase() === k)).sort((p, q) => q.updatedAt - p.updatedAt)[0];
    if (room) { go('chat', room.id); return roomName(room); }
    return '';
  },
});
def('rename-char', {
  help: '',
  run: async (a, c) => {
    const { chat } = need(), ch = S.get('chars', chat.charIds[0]); if (!ch) return 'false';
    let name = str(a.unnamed).trim();
    if (!name && !yes(N(a, 'silent', 'true'))) name = (await (c.host.input as (q: string, d: string) => Promise<string>)(K('newCharName'), ch.name)).trim();
    if (!name || name === ch.name) return 'false';
    const old = ch.name; ch.name = name; await S.save('chars', ch);
    const fix = (list: Msg[]) => { let n = 0; for (const m of list) if (m.role === 'assistant' && m.charId === ch.id && m.name === old) { m.name = name; n++; } return n; };
    fix(need().msgs); await chatApi.save();
    const chats = N(a, 'chats');
    if (chats === '' ? true : yes(chats)) for (const x of S.chats) if (x.id !== chat.id && x.charIds.includes(ch.id)) { const list = await S.msgs(x.id); if (fix(list)) await S.saveMsgs(x, list); }
    drawTop(); drawSide(); chatApi.redraw();
    return 'true';
  },
});
def('random', {
  help: '',
  run: async a => {
    const tag = str(a.unnamed).trim().toLowerCase();
    const pool = S.chars.filter(c => !tag || (c.tags || []).some(x => x.toLowerCase() === tag));
    if (!pool.length) return '';
    await startChat([pool[Math.floor(Math.random() * pool.length)].id]);
    return '';
  },
});

// ════════ 화면 모양 (드림랜드: RP 모드의 말풍선 켜기/끄기) ════════
const style = (bubbles: boolean, novel = false) => () => {
  S.set({ rpBubbles: bubbles });
  const { chat } = chatApi.current();
  if (novel && chat && chat.mode !== 'rp') { chat.mode = 'rp'; void saveChat(chat); }
  if (chat) drawMain();
  return '';
};
def('single', { help: '', alias: ['story'], run: style(false, true) });
def('bubble', { help: '', alias: ['bubbles'], run: style(true) });
def('flat', { help: '', alias: ['default'], run: style(false) });
def('vn', { help: '', run: (_a, c) => warn(c, 'noVn') });

// ════════ 도움말 ════════
def('?', {
  help: '', alias: ['help'],
  run: a => {
    const q = str(a.unnamed).trim().replace(/^\//, '').toLowerCase();
    const all = commandList();
    const list = q && !['slash', 'macros', 'format', 'hotkeys'].includes(q) ? all.filter(x => x.cmd.slice(1).toLowerCase() === q || (x.alias || []).some(y => y.slice(1).toLowerCase() === q)) : all;
    openModal({ title: t('chat.cmd.title'), body: <div className="help">{(list.length ? list : all).map((x, i) => <div className="help-row" key={i}><code>{x.cmd}{x.args ? ' ' + x.args : ''}</code><span>{x.help}{x.alias?.length ? ` (${x.alias.join(', ')})` : ''}</span></div>)}</div> });
    return '';
  },
});

// ════════ 토큰 (드림랜드의 토큰 어림값) ════════
def('tokens', { help: '', run: a => String(E.tokens(str(a.unnamed))) });
def('count', {
  help: '',
  run: (_a, c) => {
    const { msgs } = need();
    const n = E.tokens(msgs.filter(m => m.role !== 'system').map(msgText).filter(Boolean).join(' '));
    c.host.echo(K('tokenCount', { n }), 'success'); return String(n);
  },
});
def('trimtokens', {
  help: '',
  run: (a, c) => {
    const text = str(a.unnamed), limit = Number(N(a, 'limit')), dir = N(a, 'direction').toLowerCase();
    if (!Number.isFinite(limit) || limit < 0) return warn(c, 'badLimit');
    if (dir !== 'start' && dir !== 'end') return warn(c, 'badDirection');
    if (E.tokens(text) <= limit) return text;
    // direction=start: 앞을 잘라 낸다 (뒤를 남김) · end: 뒤를 잘라 낸다 (앞을 남김)
    const cut = (len: number) => dir === 'start' ? text.slice(text.length - len) : text.slice(0, len);
    let lo = 0, hi = text.length;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (E.tokens(cut(mid)) <= limit) lo = mid; else hi = mid - 1; }
    return cut(lo);
  },
});
