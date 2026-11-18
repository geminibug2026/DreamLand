// 실리태번 명령 묶음: people — 캐릭터 · 페르소나 · 태그 · 그룹 멤버
// 실리태번의 "아바타 키"(캐릭터 · 페르소나를 가리키는 고유 값)는 드림랜드의 id 로 바꿔 쓴다.
// 그룹 = 지금 대화방의 charIds (순서 그대로), 멤버 끄기 = chat.muted, 태그 = 캐릭터 카드의 tags (드림랜드는 태그가 하나뿐이다)
import { t } from '../../i18n';
import { S, newChar, newPersona, now, pickFiles, readDataURL, shrinkImage, uid } from '../../lib/core';
import { Assets } from '../../lib/assets';
import { confirmBox } from '../../ui';
import { chatApi, drawDrawer, drawMain, drawSide } from '../../chat/actions';
import type { Char, Chat, Persona } from '../../lib/types';
import { def, str, type Args, type Ctx } from '../run';

// ════════ 도움 ════════
const arg = (a: Args, k: string): string | undefined => a.named[k] === undefined ? undefined : str(a.named[k]);
const isTrue = (v: string | undefined) => !!v && ['on', 'true', '1', 'yes'].includes(v.trim().toLowerCase());
const isFalse = (v: string | undefined) => !!v && ['off', 'false', '0', 'no'].includes(v.trim().toLowerCase());
const warn = (c: Ctx, key: string, vars?: Record<string, unknown>) => c.host.echo(t('st.x.people.' + key, vars), 'warning');
const curChat = (): Chat | null => chatApi.current().chat as Chat | null;
const curChar = (): Char | undefined => { const ch = curChat(); return ch ? S.get('chars', ch.charIds[0]) : undefined; };
const low = (s: string) => s.trim().toLowerCase();
const redrawChat = () => { try { drawMain(); drawDrawer(); drawSide(); } catch { /* 대화 화면이 없을 때 */ } };

/** 실리태번 findChar: 이름 또는 id. 같은 이름이 여럿이면 태그로 거르고, 지금 대화의 캐릭터를 먼저 */
function findChar(c: Ctx, name: string | undefined, o: { tags?: string[]; preferCurrent?: boolean; quiet?: boolean } = {}): Char | undefined {
  const n = (name ?? '').trim();
  if (!n) return curChar();
  let hits = S.chars.filter(x => x.id === n);
  if (!hits.length) hits = S.chars.filter(x => low(x.name) === low(n));
  if (o.tags?.length) hits = hits.filter(x => o.tags!.every(tg => (x.tags || []).some(y => low(y) === low(tg))));
  if (hits.length > 1 && o.preferCurrent !== false) { const ids = curChat()?.charIds || []; const mine = hits.filter(x => ids.includes(x.id)); if (mine.length) hits = mine; }
  if (hits.length > 1 && !o.quiet) warn(c, 'manyChars', { name: n, id: hits[0].id });
  return hits[0];
}
function findPersona(name: string | undefined): Persona | undefined {
  const n = (name ?? '').trim(); if (!n) return undefined;
  return S.get('personas', n) || S.personas.find(p => low(p.name) === low(n));
}
const activePersona = (): Persona => S.persona(curChat());
/** persona= 가 있으면 그것, 없으면 지금 페르소나 */
function targetPersona(c: Ctx, name: string | undefined): Persona | null {
  if (name) { const p = findPersona(name); if (!p) { warn(c, 'noPersona', { name }); return null; } return p; }
  return activePersona() || null;
}
/** char= 가 있으면 그것, 없으면 지금 대화의 캐릭터 */
function targetChar(c: Ctx, name: string | undefined): Char | null {
  if (name) { const ch = findChar(c, name, { quiet: true }); if (!ch) { warn(c, 'noChar', { name }); return null; } return ch; }
  const ch = curChar(); if (!ch) { warn(c, 'noCurrentChar'); return null; } return ch;
}
const loreByName = (name: string) => { const n = name.trim(); return S.lore.find(l => l.id === n) || S.lore.find(l => low(l.name) === low(n)); };

/** avatar= 값: prompt(파일 고르기) · 그림 주소(data:/blob:/같은 곳의 경로) · 캐릭터나 페르소나의 이름/id(그 초상을 빌린다). 바깥 주소는 받지 않는다 */
async function resolveAvatar(c: Ctx, v: string | undefined): Promise<string | null> {
  if (!v) return null; const s = v.trim(); if (!s) return null;
  if (s === 'prompt') { const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return null; return (await shrinkImage(await readDataURL(f))) || null; }
  if (/^(data:image\/|blob:)/i.test(s)) return (await shrinkImage(s)) || s;
  const own = S.get('chars', s) || S.get('personas', s) || S.chars.find(x => x.name === s) || S.personas.find(x => x.name === s);
  if (own?.avatar) return own.avatar;
  if (/^\/(?!\/)/.test(s) || /^(characters|backgrounds|assets|user|User Avatars)\//.test(s)) return (await shrinkImage(s.startsWith('/') ? s : '/' + s)) || (warn(c, 'badAvatar'), null);
  warn(c, 'badAvatar'); return null;
}

/** return= 처리 (pipe · object · popup · none · toast-*) */
async function doReturn(c: Ctx, how: string | undefined, text: string): Promise<string> {
  switch ((how || 'pipe').trim()) {
    case 'popup': { const p = c.host.popup as ((s: string) => Promise<string>) | undefined; if (p) await p(text); else c.host.echo(text); return ''; }
    case 'none': return '';
    case 'toast-success': c.host.echo(text, 'success'); return '';
    case 'toast-info': c.host.echo(text, 'info'); return '';
    case 'console': console.log(text); return '';
    default: return text;
  }
}
const asText = (v: unknown) => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);

// ════════ 캐릭터 ════════
def('char-find', {
  help: '', alias: ['findchar'],
  run(a, c) {
    const tags = arg(a, 'tag'); let list: string[] = [];
    if (tags) { try { const j = JSON.parse(tags); list = Array.isArray(j) ? j.map(String) : [tags]; } catch { list = tags.split(',').map(x => x.trim()).filter(Boolean); } }
    const name = str(a.unnamed).trim() || arg(a, 'name') || '';
    return findChar(c, name, { tags: list, preferCurrent: !isFalse(arg(a, 'preferCurrent')), quiet: isTrue(arg(a, 'quiet')) })?.id ?? '';
  },
});

/** char-create · char-update 가 함께 쓰는 칸들 → 드림랜드 캐릭터. 바꾼 것이 있으면 true */
async function applyCharFields(a: Args, c: Ctx, ch: Char): Promise<boolean> {
  let changed = false;
  const map: [string, keyof Char][] = [['name', 'name'], ['description', 'description'], ['firstMessage', 'firstMes'], ['personality', 'personality'], ['scenario', 'scenario'],
    ['messageExamples', 'mesExample'], ['creatorNotes', 'creatorNotes'], ['systemPrompt', 'systemPrompt'], ['postHistoryInstructions', 'postHistory'], ['creator', 'creator'], ['characterVersion', 'version']];
  for (const [k, f] of map) { const v = arg(a, k); if (v !== undefined) { (ch as Record<string, unknown>)[f] = v; changed = true; } }
  const tags = arg(a, 'tags'); if (tags !== undefined) { ch.tags = tags.split(',').map(x => x.trim()).filter(Boolean); changed = true; }
  const fav = arg(a, 'favorite'); if (fav !== undefined) { ch.fav = isTrue(fav); changed = true; }
  const talk = arg(a, 'talkativeness'); if (talk !== undefined && !isNaN(parseFloat(talk))) { ch.talk = Math.min(1, Math.max(0, parseFloat(talk))); changed = true; }
  const world = arg(a, 'world');
  if (world !== undefined) { if (!world.trim()) { ch.loreIds = []; changed = true; } else { const l = loreByName(world); if (l) { ch.loreIds = [...new Set([l.id, ...(ch.loreIds || [])])]; changed = true; } else warn(c, 'noLore', { name: world }); } }
  const dp = arg(a, 'depthPrompt'), dd = arg(a, 'depthPromptDepth'), dr = arg(a, 'depthPromptRole');
  if (dp !== undefined || dd !== undefined || dr !== undefined) {
    ch.depthPrompt = { ...(ch.depthPrompt || { prompt: '', depth: 4, role: 'system' }) };
    if (dp !== undefined) ch.depthPrompt.prompt = dp;
    if (dd !== undefined && !isNaN(parseInt(dd))) ch.depthPrompt.depth = parseInt(dd);
    if (dr !== undefined && ['system', 'user', 'assistant'].includes(dr.trim())) ch.depthPrompt.role = dr.trim();
    changed = true;
  }
  const av = await resolveAvatar(c, arg(a, 'avatar')); if (av) { ch.avatar = av; changed = true; }
  return changed;
}
/** 캐릭터를 열어 둔다(실리태번의 select): 마지막 대화방, 없으면 새 대화 */
async function selectChar(ch: Char) {
  const { go } = await import('../../lib/router');
  const last = S.chats.filter(x => x.charIds.includes(ch.id)).sort((x, y) => y.updatedAt - x.updatedAt)[0];
  if (last) go('chat', last.id); else { const { startChat } = await import('../../chat/start'); await startChat([ch.id]); }
}

def('char-create', {
  help: '',
  async run(a, c) {
    const name = (arg(a, 'name') || '').trim();
    if (!name) { warn(c, 'nameRequired'); return ''; }
    const ch = newChar({ name });
    await applyCharFields(a, c, ch); ch.name = name;
    await S.save('chars', ch);
    c.host.echo(t('st.x.people.charCreated', { name }), 'success');
    if (!isFalse(arg(a, 'select'))) await selectChar(ch);
    return ch.id;
  },
});
def('char-update', {
  help: '',
  async run(a, c) {
    const ch = targetChar(c, arg(a, 'char')); if (!ch) return '';
    if (!(await applyCharFields(a, c, ch))) { warn(c, 'noFields'); return ch.id; }
    if (!ch.name.trim()) ch.name = t('st.x.people.unnamed');
    await S.save('chars', ch);
    if (curChat()?.charIds.includes(ch.id)) redrawChat();
    c.host.echo(t('st.x.people.charUpdated', { name: ch.name }), 'success');
    return ch.id;
  },
});
def('char-duplicate', {
  help: '', alias: ['dupe'],
  async run(a, c) {
    const ch = targetChar(c, arg(a, 'char')); if (!ch) return '';
    const copy: Char = { ...structuredClone(ch), id: uid(), name: ch.name + t('st.x.people.copySuffix'), src: '', createdAt: now(), updatedAt: now() };
    await S.save('chars', copy);
    if (isTrue(arg(a, 'select'))) await selectChar(copy);
    return copy.id;
  },
});
/** 실리태번의 캐릭터 데이터 이름으로 */
const charData = (ch: Char) => ({
  avatar: ch.id, name: ch.name, description: ch.description, personality: ch.personality, scenario: ch.scenario, first_mes: ch.firstMes, mes_example: ch.mesExample,
  creator_notes: ch.creatorNotes, system_prompt: ch.systemPrompt, post_history_instructions: ch.postHistory, creator: ch.creator, character_version: ch.version,
  tags: ch.tags || [], talkativeness: ch.talk ?? 0.5, fav: !!ch.fav, alternate_greetings: ch.altGreetings || [],
  world: ch.loreIds?.map(id => S.get('lore', id)?.name).filter(Boolean)[0] || '', depth_prompt: ch.depthPrompt,
  chat: S.chats.filter(x => x.charIds.includes(ch.id)).sort((x, y) => y.updatedAt - x.updatedAt)[0]?.id || '', create_date: new Date(ch.createdAt).toISOString(),
});
def('char-get', {
  help: '', alias: ['char-data'],
  async run(a, c) {
    const ch = targetChar(c, arg(a, 'char')); if (!ch) return '';
    const data = charData(ch) as Record<string, unknown>;
    const field = arg(a, 'field');
    if (field) {
      let v = field === 'image' ? ch.avatar : field in data ? data[field] : (ch as Record<string, unknown>)[field];
      if (field === 'avatar') v = ch.id;
      if (field === 'tags' && Array.isArray(v)) v = v.join(', ');
      if (v === undefined) return '';
      return doReturn(c, arg(a, 'return'), asText(v));
    }
    return doReturn(c, arg(a, 'return'), JSON.stringify(data, null, 2));
  },
});
def('char-delete', {
  help: '',
  async run(a, c) {
    const ch = targetChar(c, arg(a, 'char')); if (!ch) return 'false';
    const withChats = isTrue(arg(a, 'deleteChats'));
    if (!isTrue(arg(a, 'silent'))) {
      const ok = await confirmBox(t(withChats ? 'st.x.people.confirmCharChats' : 'st.x.people.confirmChar', { name: ch.name }), t('common.delete'), true);
      if (!ok) return 'false';
    }
    try {
      await Assets.removeOwner(Assets.ownerOfChar(ch.id)).catch(() => { });
      const sa = S.settings.assets as unknown as { chars?: Record<string, unknown> } | undefined; if (sa?.chars) delete sa.chars[ch.id];
      for (const r of S.regex) if (r.scope === ch.id) { r.scope = 'global'; r.enabled = false; await S.save('regex', r, true); }
      if (withChats) for (const x of S.chats.filter(x => x.charIds.includes(ch.id))) {
        if (x.charIds.length > 1) { x.charIds = x.charIds.filter(i => i !== ch.id); await S.save('chats', x, true); } else await S.remove('chats', x.id);
      }
      await S.remove('chars', ch.id);
      redrawChat();
      return 'true';
    } catch (e) { c.host.echo(t('st.x.people.deleteFail', { msg: e instanceof Error ? e.message : String(e) }), 'error'); return 'false'; }
  },
});

// ════════ 페르소나 ════════
/** 실리태번에만 있는 칸(설명 위치 · 깊이 · 역할 · 제목)은 페르소나에 적어 두기만 한다 — 드림랜드는 프롬프트 블록 자리에 넣는다 */
async function applyPersonaFields(a: Args, c: Ctx, p: Persona): Promise<boolean> {
  let changed = false;
  const name = arg(a, 'name'); if (name !== undefined && name.trim()) { p.name = name.trim(); changed = true; }
  const desc = arg(a, 'description'); if (desc !== undefined) { p.description = desc; changed = true; }
  const title = arg(a, 'title'); if (title !== undefined) { p.title = title; changed = true; }
  const pos = arg(a, 'descriptionPosition'), dep = arg(a, 'descriptionDepth'), role = arg(a, 'descriptionRole');
  if (pos !== undefined || dep !== undefined || role !== undefined) {
    if (pos !== undefined) p.position = pos; if (dep !== undefined && !isNaN(Number(dep))) p.depth = Number(dep); if (role !== undefined) p.role = role;
    warn(c, 'personaPosition'); changed = true;
  }
  const lb = arg(a, 'lorebook');
  if (lb !== undefined) { if (!lb.trim()) { p.loreIds = []; changed = true; } else { const l = loreByName(lb); if (l) { p.loreIds = [...new Set([l.id, ...(p.loreIds || [])])]; changed = true; } else warn(c, 'noLore', { name: lb }); } }
  const av = await resolveAvatar(c, arg(a, 'avatar')); if (av) { p.avatar = av; changed = true; }
  return changed;
}
/** 페르소나 고르기: 대화방이 열려 있으면 그 방에서 쓰도록, 아니면 기본 페르소나로 */
async function selectPersona(p: Persona) {
  const chat = curChat();
  if (chat) { chat.personaId = p.id; chat.personaAuto = false; await S.save('chats', chat, true); redrawChat(); }
  else S.set({ activePersona: p.id });
}
def('persona-create', {
  help: '',
  async run(a, c) {
    const name = (arg(a, 'name') || '').trim();
    if (!name) { warn(c, 'personaNameRequired'); return ''; }
    const p = newPersona({ name });
    await applyPersonaFields(a, c, p);
    await S.save('personas', p);
    if (!isFalse(arg(a, 'select'))) await selectPersona(p);
    c.host.echo(t('st.x.people.personaCreated', { name }), 'success');
    return p.id;
  },
});
def('persona-update', {
  help: '',
  async run(a, c) {
    const p = targetPersona(c, arg(a, 'persona')); if (!p) return '';
    if (!(await applyPersonaFields(a, c, p))) { c.host.echo(t('st.x.people.noFields'), 'info'); return p.id; }
    await S.save('personas', p); redrawChat();
    c.host.echo(t('st.x.people.personaUpdated', { name: p.name }), 'success');
    return p.id;
  },
});
const personaConnections = (p: Persona) => [
  ...S.chars.filter(x => x.bind?.personaId === p.id).map(x => ({ type: 'character', id: x.id })),
  ...S.chats.filter(x => x.personaId === p.id && x.personaAuto === false).map(x => ({ type: 'chat', id: x.id })),
];
def('persona-get', {
  help: '', alias: ['persona-data'],
  async run(a, c) {
    const p = targetPersona(c, arg(a, 'persona')); if (!p) return '';
    const data: Record<string, unknown> = {
      avatar: p.id, name: p.name, description: p.description, title: p.title ?? '', position: p.position ?? 0, depth: p.depth ?? 2, role: p.role ?? 0,
      lorebook: p.loreIds?.map(id => S.get('lore', id)?.name).filter(Boolean)[0] || '', default: S.settings.activePersona === p.id, connections: personaConnections(p),
    };
    const field = arg(a, 'field');
    if (field) {
      if (!(field in data)) { warn(c, 'unknownField', { field }); return ''; }
      return doReturn(c, arg(a, 'return'), asText(data[field]));
    }
    return doReturn(c, arg(a, 'return'), JSON.stringify(data, null, 2));
  },
});
def('persona-delete', {
  help: '',
  async run(a, c) {
    const p = targetPersona(c, arg(a, 'persona')); if (!p) return 'false';
    if (S.personas.length < 2) { warn(c, 'lastPersona'); return 'false'; }
    if (!isTrue(arg(a, 'silent')) && !(await confirmBox(t('st.x.people.confirmPersona', { name: p.name }), t('common.delete'), true))) return 'false';
    await Assets.removeOwner(Assets.ownerOfPersona(p.id)).catch(() => { });
    await S.remove('personas', p.id);
    if (S.settings.activePersona === p.id) S.set({ activePersona: S.personas[0].id });
    for (const ch of S.chars) if (ch.bind?.personaId === p.id) { ch.bind = { ...ch.bind, personaId: '' }; await S.save('chars', ch, true); }
    for (const x of S.chats) if (x.personaId === p.id) { x.personaId = ''; x.personaAuto = undefined; await S.save('chats', x, true); }
    redrawChat();
    return 'true';
  },
});
def('persona-duplicate', {
  help: '',
  async run(a, c) {
    const p = targetPersona(c, arg(a, 'persona')); if (!p) return '';
    const copy: Persona = { ...structuredClone(p), id: uid(), name: p.name + t('st.x.people.copySuffix'), createdAt: now(), updatedAt: now() };
    await S.save('personas', copy);
    if (isTrue(arg(a, 'select'))) await selectPersona(copy);
    c.host.echo(t('st.x.people.personaDuplicated', { name: copy.name }), 'success');
    return copy.id;
  },
});

/** 페르소나 고정: chat = 이 대화방에 고정 · character = 지금 캐릭터에 연결 · default = 기본 페르소나 */
def('persona-lock', {
  help: '', alias: ['lock', 'bind'],
  async run(a, c) {
    const type = (arg(a, 'type') || 'chat').trim();
    if (!['chat', 'character', 'default'].includes(type)) { warn(c, 'badLockType', { type }); return ''; }
    const chat = curChat(), p = activePersona(), ch = curChar();
    const locked = () => type === 'chat' ? !!chat && chat.personaAuto === false && chat.personaId === p.id
      : type === 'character' ? !!ch && ch.bind?.personaId === p.id : S.settings.activePersona === p.id;
    const value = str(a.unnamed).trim().toLowerCase();
    if (!value) return String(locked());
    let want: boolean;
    if (value === 'toggle' || value === 't') want = !locked(); else if (isTrue(value)) want = true; else if (isFalse(value)) want = false; else return '';
    if (type === 'chat') {
      if (!chat) { warn(c, 'noChat'); return ''; }
      if (want) { chat.personaId = p.id; chat.personaAuto = false; } else { chat.personaAuto = undefined; }
      await S.save('chats', chat, true);
    } else if (type === 'character') {
      if (!ch) { warn(c, 'noCurrentChar'); return ''; }
      if (want) ch.bind = { ...(ch.bind || { connId: '', presetId: '', personaId: '' }), personaId: p.id };
      else if (ch.bind?.personaId === p.id) ch.bind = { ...ch.bind, personaId: '' };
      await S.save('chars', ch, true);
    } else {
      // 드림랜드에는 늘 기본 페르소나가 하나 있다: 풀면 다른 페르소나에게 넘긴다
      if (want) S.set({ activePersona: p.id });
      else if (S.settings.activePersona === p.id) { const other = S.personas.find(x => x.id !== p.id); if (other) S.set({ activePersona: other.id }); else { warn(c, 'lastPersona'); return 'true'; } }
    }
    redrawChat();
    return String(want);
  },
});
def('persona-set', {
  help: '', alias: ['persona', 'name'],
  async run(a, c) {
    const mode = (arg(a, 'mode') || 'all').trim();
    const name = str(a.unnamed).trim();
    if (!name) { warn(c, 'needName'); return ''; }
    if (!['lookup', 'temp', 'all'].includes(mode)) { warn(c, 'badMode'); return ''; }
    if (mode !== 'temp') {
      const p = findPersona(name);
      if (p) { await selectPersona(p); return ''; }
      if (mode === 'lookup') { warn(c, 'noPersona', { name }); return ''; }
    }
    // 임시 이름: 드림랜드에는 이름만 바꾸는 자리가 없어, 이 대화방에서만 쓰는 임시 페르소나를 만들어 고른다
    const chat = curChat(); if (!chat) { warn(c, 'noChat'); return ''; }
    const base = activePersona();
    const tmp = newPersona({ name, avatar: base?.avatar || '', description: base?.description || '', loreIds: [...(base?.loreIds || [])], temp: true });
    await S.save('personas', tmp); await selectPersona(tmp);
    c.host.echo(t('st.x.people.tempPersona', { name }), 'info');
    return '';
  },
});
def('persona-sync', {
  help: '', alias: ['sync'],
  async run(a, c) {
    const { chat, msgs } = chatApi.current() as { chat: Chat | null; msgs: { role: string; name: string }[] };
    if (!chat) { warn(c, 'noChat'); return ''; }
    const spec = str(a.unnamed).trim();
    let start = 0, end = msgs.length - 1;
    if (spec) {
      const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(spec);
      if (!m) { console.warn('[persona-sync] bad range', spec); return ''; }
      start = +m[1]; end = m[2] !== undefined ? +m[2] : start;
      end = Math.min(end, msgs.length - 1);
    }
    const p = activePersona(), from = (arg(a, 'from') || '').trim();
    const quiet = !isFalse(arg(a, 'quiet'));
    if (!quiet && !(await confirmBox(t('st.x.people.confirmSync', { name: p.name }), t('common.ok')))) return '';
    let n = 0;
    for (let i = Math.max(0, start); i <= end; i++) { const m = msgs[i]; if (m?.role === 'user' && (!from || m.name === from) && m.name !== p.name) { m.name = p.name; n++; } }
    if (n) { await chatApi.save(); chatApi.redraw(); }
    return '';
  },
});

// ════════ 태그 (캐릭터 카드의 tags) ════════
const tagChar = (a: Args, c: Ctx) => { const n = arg(a, 'name'); const ch = n ? findChar(c, n, { quiet: true }) : curChar(); if (!ch) warn(c, n ? 'noChar' : 'noCurrentChar', { name: n }); return ch; };
const tagName = (a: Args, c: Ctx) => { const tg = str(a.unnamed).trim(); if (!tg) warn(c, 'needTag'); return tg; };
def('tag-add', {
  help: '',
  async run(a, c) {
    const ch = tagChar(a, c); if (!ch) return 'false';
    const tg = tagName(a, c); if (!tg) return 'false';
    if ((ch.tags ||= []).some(x => low(x) === low(tg))) return 'false';
    ch.tags.push(tg); await S.save('chars', ch); return 'true';
  },
});
def('tag-remove', {
  help: '',
  async run(a, c) {
    const ch = tagChar(a, c); if (!ch) return 'false';
    const tg = tagName(a, c); if (!tg) return 'false';
    if (!S.chars.some(x => (x.tags || []).some(y => low(y) === low(tg)))) { warn(c, 'noTag', { name: tg }); return 'false'; }
    const before = (ch.tags || []).length; ch.tags = (ch.tags || []).filter(x => low(x) !== low(tg));
    if (ch.tags.length === before) return 'false';
    await S.save('chars', ch); return 'true';
  },
});
def('tag-exists', {
  help: '',
  run(a, c) {
    const ch = tagChar(a, c); if (!ch) return 'false';
    const tg = tagName(a, c); if (!tg) return 'false';
    return String((ch.tags || []).some(x => low(x) === low(tg)));
  },
});
def('tag-list', {
  help: '',
  run(a, c) { const ch = tagChar(a, c); return ch ? (ch.tags || []).join(', ') : ''; },
});
/** 드림랜드의 태그는 카드의 태그 그 자체라 따로 가져올 것이 없다: 카드에 태그가 있으면 true */
def('tag-import', {
  help: '',
  run(a, c) {
    const mode = arg(a, 'mode');
    if (mode && !['all', 'existing', 'none', 'ask'].includes(mode)) { warn(c, 'badImportMode', { mode }); return 'false'; }
    const ch = tagChar(a, c); if (!ch) return 'false';
    if (mode === 'none') return 'false';
    c.host.echo(t('st.x.people.tagsAlready'), 'info');
    return String((ch.tags || []).length > 0);
  },
});

// ════════ 그룹 멤버 (지금 대화방의 캐릭터들) ════════
/** 번호(0부터) · 이름 · id → 대화방 안의 자리 */
function memberIndex(chat: Chat, v: string): number {
  const s = v.trim(); if (!s) return -1;
  if (/^\d+$/.test(s)) { const i = +s; return i < chat.charIds.length ? i : -1; }
  const i = chat.charIds.indexOf(s); if (i >= 0) return i;
  return chat.charIds.findIndex(id => low(S.get('chars', id)?.name || '') === low(s));
}
function member(c: Ctx, a: Args, cmd: string): { chat: Chat; i: number } | null {
  const chat = curChat(); if (!chat) { warn(c, 'noGroup', { cmd }); return null; }
  const v = str(a.unnamed); const i = memberIndex(chat, v);
  if (i < 0) { console.warn(`[${cmd}] no member for`, v); return null; }
  return { chat, i };
}
const saveGroup = async (chat: Chat) => { await S.save('chats', chat, true); redrawChat(); };

def('member-get', {
  help: '', alias: ['getmember', 'memberget'],
  run(a, c) {
    const chat = curChat(); if (!chat) { warn(c, 'noGroup', { cmd: 'member-get' }); return ''; }
    const field = (arg(a, 'field') ?? 'name').trim();
    if (!['name', 'index', 'id', 'avatar'].includes(field)) { warn(c, 'needField'); return ''; }
    const v = str(a.unnamed), i = memberIndex(chat, v);
    if (i < 0) { warn(c, 'noMember', { arg: v }); return ''; }
    const id = chat.charIds[i], ch = S.get('chars', id);
    return field === 'name' ? ch?.name || '' : field === 'index' ? String(i) : field === 'id' ? String(S.chars.findIndex(x => x.id === id)) : id;
  },
});
const setMuted = (on: boolean, cmd: string) => async (a: Args, c: Ctx) => {
  const m = member(c, a, cmd); if (!m) return '';
  const mu = new Set(m.chat.muted || []), id = m.chat.charIds[m.i];
  if (on) mu.add(id); else mu.delete(id);
  m.chat.muted = [...mu]; await saveGroup(m.chat); return '';
};
def('member-disable', { help: '', alias: ['disable', 'disablemember', 'memberdisable'], run: setMuted(true, 'member-disable') });
def('member-enable', { help: '', alias: ['enable', 'enablemember', 'memberenable'], run: setMuted(false, 'member-enable') });
def('member-add', {
  help: '', alias: ['addmember', 'memberadd'],
  async run(a, c) {
    const chat = curChat(); if (!chat) { warn(c, 'noGroup', { cmd: 'member-add' }); return ''; }
    const name = str(a.unnamed).trim(); if (!name) return '';
    const ch = findChar(c, name, { preferCurrent: false, quiet: true }); if (!ch) { console.warn('[member-add] no character', name); return ''; }
    if (chat.charIds.includes(ch.id)) { warn(c, 'already', { name: ch.name }); return ''; }
    chat.charIds.push(ch.id); await saveGroup(chat); return ch.name;
  },
});
def('member-remove', {
  help: '', alias: ['removemember', 'memberremove'],
  async run(a, c) {
    const m = member(c, a, 'member-remove'); if (!m) return '';
    if (m.chat.charIds.length < 2) { warn(c, 'lastMember'); return ''; }
    const id = m.chat.charIds[m.i];
    m.chat.charIds = m.chat.charIds.filter(x => x !== id); m.chat.muted = (m.chat.muted || []).filter(x => x !== id);
    await saveGroup(m.chat); return '';
  },
});
const move = (d: number, cmd: string) => async (a: Args, c: Ctx) => {
  const m = member(c, a, cmd); if (!m) return '';
  const j = m.i + d; if (j < 0 || j >= m.chat.charIds.length) return '';
  const ids = [...m.chat.charIds]; [ids[m.i], ids[j]] = [ids[j], ids[m.i]]; m.chat.charIds = ids;
  await saveGroup(m.chat); return '';
};
def('member-up', { help: '', alias: ['upmember', 'memberup'], run: move(-1, 'member-up') });
def('member-down', { help: '', alias: ['downmember', 'memberdown'], run: move(1, 'member-down') });
def('member-peek', {
  help: '', alias: ['peek', 'memberpeek', 'peekmember'],
  async run(a, c) {
    if (chatApi.current().busy) { warn(c, 'peekBusy'); return ''; }
    const m = member(c, a, 'member-peek'); if (!m) return '';
    const ch = S.get('chars', m.chat.charIds[m.i]); if (!ch) return '';
    const { charSheet } = await import('../../editors/CharSheet');
    charSheet(ch); return '';
  },
});
def('member-count', {
  help: '', alias: ['countmember', 'membercount'],
  run(_a, c) { const chat = curChat(); if (!chat) { warn(c, 'noGroup', { cmd: 'member-count' }); return ''; } return String(chat.charIds.length); },
});
