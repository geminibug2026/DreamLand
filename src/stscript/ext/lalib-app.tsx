// ── LALib 명령 묶음 (2): 앱과 닿는 것 — 복사 · 내려받기 · 화면 요소 · 캐릭터 · 그룹 · 로어북 · 퀵 리플라이 · 스와이프 · 메시지 · 대화 · 이벤트 · 소리 · 글꼴 · 웹 ──
// 실리태번의 메시지 모양(name · is_user · is_system · send_date · mes · swipes · swipe_id · swipe_info · extra)으로 읽고, 드림랜드의 메시지(역할 · 스와이프 목록)에 고쳐 쓴다.
// 실리태번에만 있는 것(코스튬 플러그인)은 실리태번에서 그 플러그인이 없을 때처럼 오류를 알리고 빈 목록을 돌려준다
import { useMemo, useState, type CSSProperties } from 'react';
import { t } from '../../i18n';
import { S, download, emit, msgText, on } from '../../lib/core';
import * as E from '../../lib/engine';
import { loreToWorld } from '../../lib/cards';
import { Live } from '../../lib/live';
import { go } from '../../lib/router';
import { Server } from '../../lib/server';
import { newQrItem, qrActive, qrSave, qrStore } from '../../lib/qr-data';
import { chatApi, drawHud, roomName, swipe as swipeMsg } from '../../chat/actions';
import { cur, ui } from '../../chat/store';
import { openModal } from '../../ui';
import type { Char, Chat, Lore, Msg } from '../../lib/types';
import { callClosure, def, isBound, str, type Args, type Bound, type Ctx } from '../run';
import { charData } from './people';
import { N, callFn, exprEnv, exprOf, fail, flag, isFalse, isTrue, jsonOf, out, tx } from './lalib';

// ════════ 도움 ════════
const has = (a: Args, k: string) => a.named[k] !== undefined;
const need = (): { chat: Chat; msgs: Msg[] } => { const { chat, msgs } = chatApi.current(); if (!chat) fail('noChat'); return { chat: chat as Chat, msgs }; };
const charsOf = (chat: Chat | null | undefined): Char[] => (chat?.charIds || []).map(id => S.get('chars', id)).filter((x): x is Char => !!x);
const lowEq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const redraw = () => { try { chatApi.redraw(); } catch { /* 대화 화면이 없으면 그대로 */ } };
async function saved(chat: Chat, msgs: Msg[], m?: Msg, ev = '') {
  if (m && Live.rewind(chat, msgs)) drawHud();
  await chatApi.save(); redraw();
  if (ev) emit(ev, { chat, msg: m, msgs });
}
const iso = (ts?: number) => new Date(ts || Date.now()).toISOString();
/** 드림랜드 메시지 → 실리태번 메시지 모양 */
function stMsg(m: Msg, chat: Chat): Record<string, unknown> {
  const sw = m.swipes[m.sw] || { text: '' };
  const info = m.swipes.map(s => ({ send_date: iso(s.ts || m.ts), gen_started: null, gen_finished: null, extra: { ...(s.model ? { model: s.model } : {}), ...(s.reasoning ? { reasoning: s.reasoning } : {}) } }));
  return {
    name: m.role === 'user' ? (m.name || S.persona(chat).name) : m.name || charsOf(chat).find(c => c.id === m.charId)?.name || '',
    is_user: m.role === 'user', is_system: m.role === 'system' || !!m.hidden, send_date: iso(m.ts), mes: msgText(m),
    swipes: m.swipes.map(s => s.text), swipe_id: m.sw, swipe_info: info,
    extra: { ...(m.role === 'system' ? { type: 'narrator' } : {}), ...(sw.model ? { model: sw.model } : {}), ...(sw.reasoning ? { reasoning: sw.reasoning } : {}) },
    ...(m.role === 'assistant' && m.charId ? { original_avatar: m.charId } : {}),
  };
}
/** LALib getRange: "3" · "-1" · "2-5" · "-3-" · "0--5" (끝 번호 포함) */
function getRange<T>(text: string, list: T[]): T[] {
  const m = /^(-?\d+)(?:(-)(-?\d+)?)?$/.exec(text.trim());
  if (!m) fail('badRange', { value: text });
  const [, a, dash, b] = m as RegExpExecArray, s = parseInt(a, 10);
  if (!dash) return s === -1 ? list.slice(s) : list.slice(s, s + 1);
  if (b === undefined || parseInt(b, 10) === -1) return list.slice(s);
  return list.slice(s, parseInt(b, 10) + 1);
}
/** message= : 번호 (없으면 마지막). 실리태번처럼 0 부터, 음수는 끝에서부터 */
function msgAt(a: Args, k = 'message'): { chat: Chat; msgs: Msg[]; m: Msg | undefined; i: number } {
  const { chat, msgs } = need(), raw = N(a, k).trim(), n = Number(raw);
  const i = raw && !Number.isNaN(n) ? (n < 0 ? msgs.length + n : n) : msgs.length - 1;
  return { chat, msgs, m: msgs[i], i };
}
const lastMsgEl = (): Element | null => { const { msgs } = chatApi.current(), m = msgs[msgs.length - 1]; return m ? (ui.msgs || document).querySelector(`article.msg[data-id="${CSS.escape(m.id)}"]`) : null; };

// ════════ 복사 · 내려받기 ════════
def('copy', {
  help: '', run: async a => {
    const text = str(a.unnamed);
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.inset = '0'; document.body.append(ta); ta.focus(); ta.select();
      try { document.execCommand('copy'); } catch (e) { console.warn('[/copy]', e); }
      ta.remove();
    }
    return '';
  },
});
def('download', {
  help: '', run: a => {
    const name = N(a, 'name') || `DreamLand-${new Date().toISOString()}`, ext = N(a, 'ext', 'txt') || 'txt';
    download(`${name}.${ext}`, str(a.unnamed), 'text/plain');
    return '';
  },
});

// ════════ 화면 요소 ════════
/** 입력칸 값 바꾸기: React 가 알아채도록 원래 setter 로 넣고 input · change 를 보낸다 */
function setValue(el: Element, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (set) set.call(el, v); else (el as HTMLInputElement).value = v;
  for (const ev of ['input', 'change', 'mouseup']) el.dispatchEvent(new Event(ev, { bubbles: true }));
}
def('dom', {
  help: '', run: (a, c) => {
    const quiet = isTrue(N(a, 'quiet')), multi = isTrue(N(a, 'multi')), q = str(a.unnamed).trim(), action = N(a, 'action');
    const warn = (k: string, o?: Record<string, unknown>) => { if (!quiet) c.host.echo(tx(k, o), 'warning'); return ''; };
    if (!['click', 'value', 'property', 'attribute', 'call'].includes(action)) fail('domAction', { value: action });
    let els: Element[];
    try { els = (multi ? [...document.querySelectorAll(q)] : [document.querySelector(q)]).filter((x): x is Element => !!x); }
    catch (e) { c.host.echo((e as Error).message, 'error'); return ''; }
    if (!els.length) return warn('domNone', { query: q });
    const one = (el: Element): unknown => {
      const o = el as unknown as Record<string, unknown>;
      switch (action) {
        case 'click': for (const ev of ['pointerdown', 'click', 'pointerup']) el.dispatchEvent(ev === 'click' ? new MouseEvent('click', { bubbles: true, cancelable: true }) : new Event(ev, { bubbles: true })); return '';
        case 'value': if (!('value' in el)) return warn('domNoValue', { tag: el.tagName }); setValue(el, N(a, 'value')); return '';
        case 'property': { const p = N(a, 'property'); if (has(a, 'value')) o[p] = N(a, 'value'); if (o[p] === undefined) return warn('domNoProp', { prop: p, tag: el.tagName }); return o[p] ?? ''; }
        case 'attribute': { const p = N(a, 'attribute'); if (has(a, 'value')) el.setAttribute(p, N(a, 'value')); return el.getAttribute(p) ?? ''; }
        default: {
          const p = N(a, 'property'), f = o[p];
          if (typeof f !== 'function') return warn('domNoCall', { prop: p, tag: el.tagName });
          let args: unknown[] = [];
          if (has(a, 'args')) { const j = jsonOf(N(a, 'args')); args = j === undefined ? [N(a, 'args')] : Array.isArray(j) ? j : [j]; }
          return (f as (...x: unknown[]) => unknown).apply(el, args) ?? '';
        }
      }
    };
    const target = has(a, 'target') ? Number(N(a, 'target')) : null;
    const res = els.map((el, i) => target !== null && i !== target ? '' : one(el));
    const fix = (v: unknown) => v instanceof Element ? v.outerHTML : v;
    if (multi && target !== null) return out(fix(res[target]));
    if (multi) return JSON.stringify(res.map(fix));
    return out(fix(res[0]));
  },
});

// ════════ 캐릭터 · 그룹 ════════
// /char-get 은 people.tsx (LALib 꼴: 이름 없는 값 = 캐릭터, index= = 칸)
def('memberpos', {
  help: '', run: async (a, c) => {
    const chat = chatApi.current().chat as Chat | null;
    if (!chat || chat.charIds.length < 2) { c.host.echo(tx('noGroup', { cmd: 'memberpos' }), 'warning'); return ''; }
    const m = /^(.+?)(?:\s+(\d+))?$/.exec(str(a.unnamed).trim()); if (!m) return '';
    const name = m[1], ch = S.chars.find(x => chat.charIds.includes(x.id) && (x.id === name || lowEq(x.name, name)));
    if (!ch) fail('noMember', { name });
    const ids = chat.charIds.filter(id => id !== (ch as Char).id), from = chat.charIds.indexOf((ch as Char).id);
    if (m[2] === undefined) return String(from);
    const to = Math.max(0, Math.min(chat.charIds.length - 1, parseInt(m[2], 10)));
    ids.splice(to, 0, (ch as Char).id); chat.charIds = ids;
    await S.save('chats', chat, true); redraw();
    return String(to);
  },
});
/** 그룹 = 캐릭터가 둘 이상인 대화방. 이름은 방 이름 */
const groupOf = (name: string): Chat | undefined => {
  const now = chatApi.current().chat as Chat | null;
  if (!name.trim()) return now && now.charIds.length > 1 ? now : undefined;
  const list = S.chats.filter(x => x.charIds.length > 1);
  return list.find(x => x.id === name.trim()) || list.find(x => lowEq(roomName(x), name) || lowEq(String(x.name || ''), name) || lowEq(chatApi.groupTitle?.(x) || '', name));
};
const sameCast = (x: Chat, y: Chat) => x.charIds.length === y.charIds.length && x.charIds.every(id => y.charIds.includes(id));
def('group-get', {
  help: '', run: a => {
    const g = groupOf(str(a.unnamed)); if (!g) return '';
    const members = g.charIds.map(id => S.get('chars', id)).filter((x): x is Char => !!x);
    let r: unknown = {
      id: g.id, name: roomName(g), members: flag(a, 'chars') ? members.map(charData) : members.map(m => m.id),
      disabled_members: g.muted || [], chat_id: g.id, chats: S.chats.filter(x => sameCast(x, g)).map(x => x.id),
      fav: !!g.pinned, avatar_url: '', allow_self_responses: false, activation_strategy: 0, generation_mode: 0,
    };
    if (N(a, 'index')) r = (r as Record<string, unknown>)[N(a, 'index')];
    return out(r);
  },
});

// ════════ 대화 ════════
def('chat-list', {
  help: '', run: (a, c) => {
    const now = chatApi.current().chat as Chat | null, key = N(a, 'char').trim();
    let list: Chat[] = [];
    if (key) {
      const ch = S.chars.find(x => x.id === key || lowEq(x.name, key) || lowEq(String(x.avatar || '').replace(/\.[^.]*$/, ''), key));
      const g = ch ? null : groupOf(key);
      if (ch) list = S.chats.filter(x => x.charIds.length === 1 && x.charIds[0] === ch.id);
      else if (g) list = S.chats.filter(x => sameCast(x, g));
      else { c.host.echo(tx('noCharOrGroup', { name: key }), 'warning'); return ''; }
    } else if (now) list = S.chats.filter(x => sameCast(x, now));
    else { c.host.echo(tx('noCharOrGroup', { name: '' }), 'warning'); return ''; }
    return JSON.stringify([...list].sort((x, y) => y.updatedAt - x.updatedAt).map(x => roomName(x)));
  },
});
def('chat-parent', {
  help: '', noPipe: true, run: () => {
    const chat = chatApi.current().chat as Chat | null, p = chat?.parent && S.get('chats', chat.parent.id);
    return p ? roomName(p) : '';
  },
});

// ════════ 로어북 ════════
interface BookSrc { global: string[]; chat: string | null; chatAuxiliary?: string[]; character: string | null; characterAuxiliary: string[]; group: Record<string, { character: string | null; auxiliary: string[] }>; persona: string | null; inactive: string[] }
const nameOf = (id: string) => (S.get('lore', id) as Lore | undefined)?.name;
const names = (ids: string[] | undefined) => (ids || []).map(nameOf).filter((x): x is string => !!x);
function bookSources(): BookSrc {
  const chat = chatApi.current().chat as Chat | null, cs = charsOf(chat), chatBooks = names(chat?.loreIds), persona = chat ? names(S.persona(chat)?.loreIds) : [];
  const src: BookSrc = {
    global: names(S.settings.activeLore), chat: chatBooks[0] ?? null, ...(chatBooks.length > 1 ? { chatAuxiliary: chatBooks.slice(1) } : {}),
    character: null, characterAuxiliary: [], group: {}, persona: persona[0] ?? null, inactive: [],
  };
  if (cs.length === 1) { const b = names(cs[0].loreIds); src.character = b[0] ?? null; src.characterAuxiliary = b.slice(1); }
  else for (const ch of cs) { const b = names(ch.loreIds); src.group[ch.id] = { character: b[0] ?? null, auxiliary: b.slice(1) }; }
  const used = new Set([...src.global, ...chatBooks, ...persona, src.character, ...src.characterAuxiliary, ...Object.values(src.group).flatMap(g => [g.character, ...g.auxiliary])].filter(Boolean));
  src.inactive = S.lore.map(b => b.name).filter(n => !used.has(n));
  return src;
}
const activeNames = () => { const s = bookSources(); return [...new Set([...s.global, s.chat, ...(s.chatAuxiliary || []), s.character, ...s.characterAuxiliary, ...Object.values(s.group).flatMap(g => [g.character, ...g.auxiliary]), s.persona].filter((x): x is string => !!x))]; };
def('wi-list-books', {
  help: '', noPipe: true, run: a => {
    if (flag(a, 'source')) return JSON.stringify(bookSources());
    return JSON.stringify(flag(a, 'all') ? S.lore.map(b => b.name) : activeNames());
  },
});
const bookByName = (n: string) => S.lore.find(b => b.name === n) || S.lore.find(b => lowEq(b.name, n)) || S.lore.find(b => b.id === n);
function bookData(b: Lore) {
  const w = loreToWorld(b as Parameters<typeof loreToWorld>[0]) as { entries: Record<string, Record<string, unknown>> } & Record<string, unknown>;
  return { ...w, entries: Object.values(w.entries).map(e => ({ ...e, book: b.name })), book: b.name };
}
def('wi-list-entries', {
  help: '', run: (a, c) => {
    const given = str(a.unnamed).trim(), list = given ? [given] : activeNames(), books: Record<string, ReturnType<typeof bookData>> = {};
    for (const n of list) { const b = bookByName(n); if (b) books[n] = bookData(b); else c.host.echo(tx('noBook', { name: n }), 'warning'); }
    if (flag(a, 'flat') || given) return JSON.stringify(Object.values(books).flatMap(b => b.entries));
    return JSON.stringify(books);
  },
});
/** 지금 대화로 로어북을 훑어 깨어난 항목을 표시해 두고(유지 · 쿨다운), 그 항목의 자동화 ID 를 가진 퀵 리플라이를 돌린다 */
def('wi-activate', {
  help: '', noPipe: true, run: async () => {
    const { chat, msgs } = need(), cs = charsOf(chat), persona = S.persona(chat);
    const history = msgs.filter(m => !m.hidden && m.role !== 'system').map(m => ({ role: m.role, content: msgText(m) }));
    const ctx = E.makeCtx({ chat, char: cs[0], chars: cs, persona, msgs });
    const hits = E.scanLore(E.activeBooks(chat, cs, persona), history, ctx, { state: (chat.loreState ||= {}) as E.LoreState, count: msgs.length, commit: true, char: cs[0] || null, persona });
    await S.save('chats', chat, true);
    const ids = new Set(hits.map(h => String(h.automationId || '').trim()).filter(Boolean));
    if (ids.size) {
      const { runItem } = await import('../host');
      for (const s of qrActive(chat)) for (const it of s.items) if (it.automationId && ids.has(it.automationId.trim())) await runItem(it, { set: s, auto: true });
    }
    return '';
  },
});
def('wi-trigger', {
  help: '', run: async (a, c) => {
    const { chat, msgs } = need(), b = bookByName(N(a, 'file'));
    if (!b) { c.host.echo(tx('noBook', { name: N(a, 'file') }), 'warning'); return ''; }
    const k = N(a, 'uid').trim(), i = b.entries.findIndex(e => e.id === k), n = Number(k), idx = i >= 0 ? i : Number.isInteger(n) ? n : -1, e = b.entries[idx];
    if (!e) fail('noEntry', { uid: k, book: b.name });
    if (!e.sticky) { e.sticky = 1; await S.save('lore', b); }
    const state = (chat.loreState ||= {}) as E.LoreState, len = msgs.length;
    // now=: 지금 스와이프 · /gen 에, 아니면 다음 답에 (내 메시지가 하나 더 붙은 뒤)
    state[e.id] = { sticky: len + (flag(a, 'now') ? 1 : 2), cool: state[e.id]?.cool || 0 };
    await S.save('chats', chat, true);
    return '';
  },
});

// ════════ 코스튬 (실리태번 코스튬 플러그인) ════════
def('costumes', {
  help: '', run: (_a, c) => { c.host.echo(tx('noCostumes'), 'error'); return '[]'; },
});

// ════════ 퀵 리플라이 ════════
def('qr-edit', {
  help: '', run: (a, c) => {
    const label = N(a, 'label') || str(a.unnamed).trim(), chat = chatApi.current().chat as Chat | null;
    const sets = has(a, 'set') ? qrStore().sets.filter(s => s.name === N(a, 'set')) : qrActive(chat);
    for (const s of sets) { const it = s.items.find(i => i.label === label); if (it) { go('qr', { set: s.id, item: it.id }); return ''; } }
    c.host.echo(tx('noQr', { label }), 'warning'); return '';
  },
});
def('qr-add', {
  help: '', run: (a, c) => {
    const chat = chatApi.current().chat as Chat | null, active = qrActive(chat);
    const set = has(a, 'set') ? qrStore().sets.find(s => s.name === N(a, 'set')) : active.find(s => s.scope === 'global') || active[0];
    if (!set) { c.host.echo(has(a, 'set') ? tx('noQrSet', { name: N(a, 'set') }) : tx('noActiveSet'), 'error'); return ''; }
    const it = newQrItem({ label: N(a, 'label') || str(a.unnamed).trim() || t('qr.newItem'), kind: 'script' });
    set.items.push(it); qrSave(); go('qr', { set: set.id, item: it.id });
    return '';
  },
});

// ════════ 스와이프 ════════
def('swipes-get', {
  help: '', alias: ['getswipe'], run: a => {
    const { m } = msgAt(a), i = Number(str(a.unnamed).trim());
    return m && Number.isInteger(i) ? m.swipes[i]?.text ?? '' : '';
  },
});
def('swipes-list', { help: '', noPipe: true, run: a => JSON.stringify(msgAt(a).m?.swipes.map(s => s.text) ?? []) });
def('swipes-count', { help: '', noPipe: true, run: a => String(msgAt(a).m?.swipes.length ?? 0) });
def('swipes-index', { help: '', noPipe: true, run: a => String(msgAt(a).m?.sw ?? 0) });
def('swipes-add', {
  help: '', run: async a => {
    const { chat, msgs, m } = msgAt(a); if (!m) fail('noMsg', { id: N(a, 'message') || -1 });
    const msg = m as Msg;
    msg.swipes.push({ text: str(a.unnamed), ts: Date.now(), model: 'slash command' });
    msg.sw = msg.swipes.length - 1;
    await saved(chat, msgs, msg, 'message:swiped');
    return '';
  },
});
/** 실리태번 스와이프 하나의 모양 (filter= 가 읽는다) */
const swipeObj = (m: Msg, i: number) => ({ index: i, mes: m.swipes[i].text, send_date: iso(m.swipes[i].ts || m.ts), gen_started: null, gen_finished: null, extra: m.swipes[i].model ? { model: m.swipes[i].model } : {} });
def('swipes-del', {
  help: '', run: async (a, c) => {
    const { chat, msgs, m } = msgAt(a); if (!m || m.swipes.length < 2) return '';
    const kill: number[] = [], f = a.named.filter;
    if (f !== undefined) {
      if (isBound(f)) {
        if (!f.closure.args.length) fail('swipeFilterArg');
        for (let i = 0; i < m.swipes.length; i++) if (isTrue(await callFn(f, c, [JSON.stringify(swipeObj(m, i))]))) kill.push(i);
      } else {
        const env = exprEnv(a, c, { swipe: '' }), test = exprOf(str(f), env);
        for (let i = 0; i < m.swipes.length; i++) { env.local.vars.set('swipe', JSON.stringify(swipeObj(m, i))); if (test()) kill.push(i); }
        await env.flush();
      }
    } else { const raw = str(a.unnamed).trim(), n = raw === '' ? m.sw : Number(raw); if (Number.isInteger(n) && n >= 0 && n < m.swipes.length) kill.push(n); }
    if (!kill.length) return '';
    if (kill.length >= m.swipes.length) fail('swipeDelAll');
    for (const i of [...kill].sort((x, y) => y - x)) {
      if (m.sw === i) m.sw = i + 1 < m.swipes.length ? i : i - 1; else if (m.sw > i) m.sw--;
      m.swipes.splice(i, 1);
    }
    m.sw = Math.max(0, Math.min(m.sw, m.swipes.length - 1));
    await saved(chat, msgs, m, 'message:swiped');
    return '';
  },
});
def('swipes-go', {
  help: '', run: async a => {
    const { chat, msgs, m } = msgAt(a); if (!m || m.swipes.length < 2) return '';
    const i = Number(str(a.unnamed).trim()); if (!Number.isInteger(i) || i < 0 || i >= m.swipes.length) fail('badSwipe', { n: str(a.unnamed).trim() });
    m.sw = i; await saved(chat, msgs, m, 'message:swiped');
    return '';
  },
});
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
def('swipes-swipe', {
  help: '', noPipe: true, run: async () => {
    const { msgs } = need(), m = msgs[msgs.length - 1]; if (!m) return '';
    if (cur.busy) fail('busy');
    m.sw = m.swipes.length - 1;
    await swipeMsg(m, 1);
    for (let i = 0; i < 40 && !cur.busy; i++) await wait(50);   // 생성이 시작되기를 잠깐 기다린다
    while (cur.busy) await wait(200);
    await wait(200);
    const now = chatApi.current().msgs; return now.includes(m) ? msgText(m) : msgText(now[now.length - 1] as Msg);
  },
});

// ════════ 메시지 ════════
def('message-edit', {
  help: '', run: async a => {
    const { chat, msgs } = need(); let i = parseInt(N(a, 'message', '-1') || '-1', 10); if (i < 0) i += msgs.length;
    const m = msgs[i]; if (!m) fail('noMsg', { id: N(a, 'message') || -1 });
    let v = str(a.unnamed).replace(/\{\{space\}\}/g, ' ');
    if (flag(a, 'append')) v = msgText(m) + v;
    m.swipes[m.sw] = { ...(m.swipes[m.sw] || {}), text: v };
    const p = saved(chat, msgs, undefined, 'message:edited');
    if (flag(a, 'await')) await p; else void p;
    return '';
  },
});
def('message-move', {
  help: '', noPipe: true, run: async a => {
    const { chat, msgs } = need(), from = parseInt(N(a, 'from'), 10);
    if (!msgs[from]) fail('noMsg', { id: N(a, 'from') });
    let to = parseInt(N(a, 'to'), 10);
    if (has(a, 'up')) to = from - parseInt(N(a, 'up'), 10); else if (has(a, 'down')) to = from + parseInt(N(a, 'down'), 10);
    if (Number.isNaN(to)) return '';
    to = Math.max(0, Math.min(msgs.length - 1, to));
    if (to === from) return '';
    const [m] = msgs.splice(from, 1); msgs.splice(to, 0, m);
    await saved(chat, msgs);
    return '';
  },
});
def('message-get', {
  help: '', run: a => {
    const { chat, msgs } = need(); let i = parseInt(str(a.unnamed), 10); if (i < 0) i += msgs.length;
    const m = msgs[i]; return m ? JSON.stringify(stMsg(m, chat)) : '';
  },
});
def('message-list', {
  help: '', run: a => {
    const { chat, msgs } = need(), r = str(a.unnamed).trim() || '0--1';
    return JSON.stringify(getRange(r, msgs.map((m, id) => ({ id, ...stMsg(m, chat) }))));
  },
});
def('role-swap', {
  help: '', run: async a => {
    const { chat, msgs } = need(), r = str(a.unnamed).trim(), pick = r ? getRange(r, msgs) : msgs, first = charsOf(chat)[0];
    for (const m of pick) {
      if (m.role === 'user') { m.role = 'assistant'; const ch = S.chars.find(x => chat.charIds.includes(x.id) && x.name === m.name); m.charId = ch?.id || ''; if (!m.name) m.name = S.persona(chat).name; }
      else if (m.role === 'assistant') { m.role = 'user'; m.name = m.name || first?.name || ''; m.charId = ''; }
    }
    await saved(chat, msgs);
    return '';
  },
});

// ════════ 마지막 메시지의 이벤트 ════════
// /message-on: 마지막 메시지 안의 요소(CSS 선택자)에 이벤트를 건다. 메시지가 다시 그려지면 새 요소에 다시 걸고, 다른 대화로 가면 모두 푼다
interface Listener { id: string; event: string; query: string; cb: Bound; c: Ctx; els: Element[]; fn: (e: Event) => void }
const listeners: Listener[] = [];
let mo: MutationObserver | null = null, relistenT = 0, seq = 0;
const listen = (l: Listener) => { const box = lastMsgEl(); l.els = box ? [...box.querySelectorAll(l.query)] : []; for (const el of l.els) el.addEventListener(l.event, l.fn, { once: true }); return l.els.length; };
const unlisten = (l: Listener) => { for (const el of l.els) el.removeEventListener(l.event, l.fn); l.els = []; };
const relisten = () => { for (const l of listeners) { unlisten(l); listen(l); } };
function watchDom() {
  if (listeners.length && !mo && typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(muts => {
      // 걸어 둔 요소가 그대로 붙어 있으면 다시 걸지 않는다 (요소 속성만 바뀐 것은 건너뛴다)
      if (muts.every(m => m.type !== 'childList') || listeners.every(l => l.els.length && l.els.every(el => el.isConnected) && l.els[0].closest('article.msg') === lastMsgEl())) return;
      clearTimeout(relistenT); relistenT = window.setTimeout(relisten, 80);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } else if (!listeners.length && mo) { mo.disconnect(); mo = null; }
}
on('chat:open', () => { for (const l of listeners.splice(0)) unlisten(l); watchDom(); });
for (const ev of ['message:swiped', 'message:edited', 'message:received', 'message:deleted', 'message:sent']) on(ev, () => { clearTimeout(relistenT); relistenT = window.setTimeout(relisten, 80); });
def('message-on', {
  help: '', run: async (a, c) => {
    const event = N(a, 'event').trim(), cb = a.named.callback, query = str(a.unnamed).trim();
    if (!event) fail('needArg', { cmd: 'message-on', arg: 'event=' });
    if (!isBound(cb)) fail('needArg', { cmd: 'message-on', arg: 'callback={: … :}' });
    if (!query) fail('needQuery');
    const id = `lsn-${Date.now().toString(36)}-${++seq}`;
    const l: Listener = {
      id, event, query, cb: cb as Bound, c, els: [],
      fn: e => {
        const target = (e.currentTarget as Element | null)?.outerHTML ?? '';
        void (async () => {
          const { appHost } = await import('../host');
          const ctx: Ctx = { host: appHost(), scope: l.cb.scope, pipe: '', depth: 0 };
          try { await callClosure(l.cb, ctx, {}, '', { target }); } catch (err) { if (err instanceof Error && err.message !== 'abort') ctx.host.echo(err.message, 'error'); }
        })();
      },
    };
    const n = listen(l); listeners.push(l); watchDom();
    if (isFalse(N(a, 'quiet', 'true'))) c.host.echo(tx('listenOn', { n }), 'info');
    return id;
  },
});
def('message-off', {
  help: '', run: (a, c) => {
    const event = N(a, 'event'), query = N(a, 'query'), id = N(a, 'id');
    if (!event && !query && !id) fail('offNeed');
    let n = 0;
    for (const l of [...listeners]) if ((!event || l.event === event) && (!query || l.query === query) && (!id || l.id === id)) { unlisten(l); listeners.splice(listeners.indexOf(l), 1); n++; }
    watchDom();
    if (isFalse(N(a, 'quiet', 'true'))) c.host.echo(tx('listenOff', { n }), 'info');
    return '';
  },
});
def('message-listeners', { help: '', noPipe: true, run: () => JSON.stringify(listeners.map(l => ({ id: l.id, query: l.query, event: l.event }))) });

// ════════ 글 비교 ════════
type Piece = { k: '=' | '+' | '-'; s: string };
/** 낱말(+공백) 단위 비교. 너무 길면 줄 단위 */
export function diffWords(a: string, b: string): Piece[] {
  let A = a.split(/(\s+)/).filter(Boolean), B = b.split(/(\s+)/).filter(Boolean);
  if (A.length * B.length > 4e6) { A = a.split(/(?<=\n)/); B = b.split(/(?<=\n)/); }
  const n = A.length, m = B.length, dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const outP: Piece[] = [], push = (k: Piece['k'], s: string) => { const l = outP[outP.length - 1]; if (l && l.k === k) l.s += s; else outP.push({ k, s }); };
  let i = 0, j = 0;
  while (i < n && j < m) { if (A[i] === B[j]) { push('=', A[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) push('-', A[i++]); else push('+', B[j++]); }
  while (i < n) push('-', A[i++]); while (j < m) push('+', B[j++]);
  return outP;
}
const PANE: CSSProperties = { flex: '1 1 0', minWidth: 0, maxHeight: '55vh', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '88%', lineHeight: 1.6, padding: '.5em', borderRadius: 6, background: 'var(--surface2, rgba(127,127,127,.08))' };
function DiffView({ old, init, all, onNew }: { old: string; init: string; all: boolean; onNew: (s: string) => void }) {
  const [now, setNow] = useState(init);
  const parts = useMemo(() => diffWords(old, now), [old, now]);
  return <div style={{ display: 'flex', gap: '1em', flexWrap: 'wrap' }}>
    {all ? <div style={PANE} aria-label={tx('diffOld')}>{old}</div> : null}
    {all ? <textarea style={{ ...PANE, resize: 'vertical', minHeight: '12em' }} aria-label={tx('diffNew')} value={now} onChange={e => { setNow(e.target.value); onNew(e.target.value); }} /> : null}
    <div style={PANE} aria-label={tx('diffDiff')}>{parts.map((p, i) => p.k === '=' ? <span key={i}>{p.s}</span> : p.k === '+' ? <ins key={i} style={{ background: 'rgba(80,200,120,.3)', textDecoration: 'none' }}>{p.s}</ins> : <del key={i} style={{ background: 'rgba(240,90,90,.3)' }}>{p.s}</del>)}</div>
  </div>;
}
def('diff', {
  help: '', run: a => new Promise<string>(res => {
    const strip = (s: string) => flag(a, 'stripcode') ? s.split('```').filter((_x, i) => i % 2 === 0).join('') : s;
    const old = strip(N(a, 'old')); let now = strip(N(a, 'new')), result = '';
    const notes = N(a, 'notes');
    const m = openModal({
      title: tx('diffTitle'), wide: true, onClose: () => res(result),
      actions: flag(a, 'buttons') ? [{ label: tx('diffUseOld'), cls: 'ghost', onclick: () => { result = old; } }, { label: tx('diffUseNew'), onclick: () => { result = now; } }] : [{ label: t('common.close'), cls: 'ghost' }],
      body: <div>{notes ? <p style={{ whiteSpace: 'pre-wrap', fontSize: '88%' }}>{notes}</p> : null}<DiffView old={old} init={now} all={flag(a, 'all')} onNew={s => { now = s; }} /></div>,
    });
    void m;
  }),
});

// ════════ 소리 · 글꼴 ════════
def('sfx', {
  help: '', run: async a => {
    const url = str(a.unnamed).trim(); if (!url) fail('needUrl', { cmd: 'sfx' });
    const r = await fetch(url); if (!r.ok) fail('sfxFail', { status: `${r.status} ${r.statusText}`, url });
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) fail('noAudio');
    const ac = new (Ctor as typeof AudioContext)(), src = ac.createBufferSource(), gain = ac.createGain();
    src.buffer = await ac.decodeAudioData(await r.arrayBuffer());
    const vol = Number(N(a, 'volume', '1')); gain.gain.value = Number.isFinite(vol) ? vol : 1;
    gain.connect(ac.destination); src.connect(gain);
    const ended = new Promise<void>(ok => src.addEventListener('ended', () => { ok(); void ac.close(); }));
    src.start();
    if (isTrue(N(a, 'await'))) await ended;
    return '';
  },
});
def('fonts', {
  help: '', noPipe: true, run: async (_a, c) => {
    const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
    if (!q) { c.host.echo(tx('noFonts'), 'warning'); return '[]'; }
    try { return JSON.stringify([...new Set((await q()).map(f => f.family))]); }
    catch (e) { c.host.echo(tx('fontsDenied', { msg: (e as Error).message }), 'warning'); return '[]'; }
  },
});

// ════════ 웹 ════════
const ALLOW_KEY = 'dreamland:st-fetch-allow';
const allowList = (): string[] => { try { const j = JSON.parse(localStorage.getItem(ALLOW_KEY) || '[]'); return Array.isArray(j) ? j.map(String) : []; } catch { return []; } };
/** 처음 가는 주소는 물어본다: 이번만 · 이 주소 늘 · 이 사이트 늘 · 막기 */
const askFetch = (url: URL) => new Promise<boolean>(res => {
  let ok = false;
  const keep = (k: string) => { try { localStorage.setItem(ALLOW_KEY, JSON.stringify([...new Set([...allowList(), k])])); } catch { /* 저장 못 해도 이번은 연다 */ } ok = true; };
  openModal({
    title: tx('fetchAsk'), onClose: () => res(ok),
    body: <p><code style={{ wordBreak: 'break-all' }}>{url.href}</code></p>,
    actions: [
      { label: tx('fetchBlock'), cls: 'ghost' },
      { label: tx('fetchSite', { host: url.hostname }), cls: 'ghost', onclick: () => keep(url.hostname) },
      { label: tx('fetchPath', { path: url.hostname + url.pathname }), cls: 'ghost', onclick: () => keep(url.hostname + url.pathname) },
      { label: tx('fetchOnce'), onclick: () => { ok = true; } },
    ],
  });
});
def('fetch', {
  help: '', run: async (a, c) => {
    const raw = str(a.unnamed).trim(); if (!raw) fail('needUrl', { cmd: 'fetch' });
    let url: URL; try { url = new URL(raw, location.href); } catch { return fail('badUrl', { url: raw }); }
    if (!/^https?:$/.test(url.protocol)) fail('badUrl', { url: raw });
    const same = url.origin === location.origin, list = allowList();
    if (!same && !list.includes(url.hostname) && !list.includes(url.hostname + url.pathname) && !(await askFetch(url))) { c.host.echo(tx('fetchBlocked', { url: raw }), 'error'); return ''; }
    const r = same ? await fetch(url.href) : await Server.proxy({ url: url.href, method: 'GET' });
    if (!r.ok) fail('fetchFail', { status: r.status, url: raw });
    return await r.text();
  },
});
/** HTML 글 → 안전한(스크립트 · 그림을 불러오지 않는) 문서 조각 */
const htmlDoc = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
const take = (el: Element | null | undefined, prop: string): unknown => el ? (el as unknown as Record<string, unknown>)[prop] : undefined;
const outer = (body: HTMLElement) => [...body.children].map(x => x.outerHTML).join('\n');
def('$', {
  help: '', run: a => {
    const body = htmlDoc(str(a.unnamed)), q = N(a, 'query');
    let el: Element | null;
    if (q) el = body.querySelector(q);
    else if (body.children.length === 1) el = body.children[0];
    else { const d = body.ownerDocument.createElement('div'); d.append(...body.children); body.append(d); el = d; }
    if (N(a, 'call')) { const f = take(el, N(a, 'call')); if (typeof f === 'function') (f as () => unknown).call(el); return outer(body); }
    return out(take(el, N(a, 'take', 'outerHTML') || 'outerHTML'));
  },
});
def('$$', {
  help: '', run: a => {
    const body = htmlDoc(str(a.unnamed)), q = N(a, 'query'), els = q ? [...body.querySelectorAll(q)] : [...body.children];
    if (N(a, 'call')) { for (const el of els) { const f = take(el, N(a, 'call')); if (typeof f === 'function') (f as () => unknown).call(el); } return outer(body); }
    const prop = N(a, 'take', 'outerHTML') || 'outerHTML';
    return JSON.stringify(els.map(el => take(el, prop) ?? null));
  },
});
