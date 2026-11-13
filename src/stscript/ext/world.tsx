// ── 실리태번 명령 묶음: world ── 로어북 · 정규식 · 요약 · 벡터/데이터 뱅크 · 표정 · 캡션 · 갤러리 · 그림 · 번역 · 읽어 주기 · 도구 · 확장
import { t } from '../../i18n';
import { DB, S, msgText, newEntry, newLore, newMsg, readDataURL, pickFiles, uid } from '../../lib/core';
import * as E from '../../lib/engine';
import { loreToWorld, worldToLore } from '../../lib/cards';
import { Illust } from '../../lib/illust';
import { LOOKS } from '../../scenebook/framing';
import { G, applySet, everything, regexScopeHooks, sets, snapshot, Scope, type Entry } from '../../lib/regex-scope';
import { cfg as vcfg, chunkText, dropAll, embed, embedOpt, loadStore, sigOf, sync as vsync } from '../../vectors/logic';
import { Sprites, bus, byKeyword, candidates, cfg as xcfg, classify, currentOf, lastReply, save as xsave, setExpr, universe } from '../../expressions/store';
import { canonLabel, cleanLabel, keywordLabel } from '../../expressions/pure';
import { catalog, enabled as extOn, readCatalog, setEnabled } from '../../lib/ext';
import { chatApi } from '../../chat/actions';
import { X } from '../../lib/hooks';
import type { Char, Chat, Lore, LoreEntry, Msg } from '../../lib/types';
import { callClosure, def, isBound, runScript, str, type Args, type Bound, type Ctx, type Val } from '../run';

// ════════ 공용 ════════
const A = (a: Args, k: string, d = '') => a.named[k] === undefined ? d : str(a.named[k]);
const U = (a: Args) => str(a.unnamed).trim();
const yes = (s: string) => ['on', 'true', '1', 'yes', 't'].includes(s.trim().toLowerCase());
const no = (s: string) => ['off', 'false', '0', 'no', 'f'].includes(s.trim().toLowerCase());
const tx = (k: string, v?: Record<string, unknown>) => t('st.x.world.' + k, v);
const warn = (c: Ctx, k: string, v?: Record<string, unknown>) => { c.host.echo(tx(k, v), 'warning'); return ''; };
const ok = (c: Ctx, k: string, v?: Record<string, unknown>) => c.host.echo(tx(k, v), 'success');
const cur = () => chatApi.current();
const saveChat = (ch: Chat) => S.save('chats', ch, true);
const charsOf = (ch?: Chat | null): Char[] => (ch?.charIds || []).map(id => S.get('chars', id)).filter((x): x is Char => !!x);
const findChar = (k: string): Char | undefined => { const s = k.trim(); if (!s) return undefined; const l = s.toLowerCase(); return S.chars.find(c => c.id === s) || S.chars.find(c => c.name === s) || S.chars.find(c => c.name.toLowerCase() === l); };
const popup = (c: Ctx, text: string) => (c.host.popup as ((s: string) => Promise<string>) | undefined)?.(text);
const redraw = () => { try { chatApi.redraw(); } catch { /* 대화 화면이 없으면 그대로 */ } };
const list = (s: string): string[] => { const v = s.trim(); if (!v) return []; if (v.startsWith('[')) { try { const j: unknown = JSON.parse(v); if (Array.isArray(j)) return j.map(String).map(x => x.trim()).filter(Boolean); } catch { /* 쉼표로 */ } } return v.split(',').map(x => x.trim()).filter(Boolean); };
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// ════════ 로어북 (World Info) ════════
type O = Record<string, unknown>;
const bookBy = (k: string): Lore | undefined => { const s = k.trim(); if (!s) return undefined; const l = s.toLowerCase(); return S.lore.find(b => b.id === s) || S.lore.find(b => b.name === s) || S.lore.find(b => b.name.toLowerCase() === l); };
async function makeBook(name: string, fallback: string): Promise<Lore> {
  if (name && S.lore.some(b => b.name === name)) throw new Error(tx('bookExists', { name }));
  const base = (name || fallback).slice(0, 64); let n = base, i = 1;
  while (S.lore.some(b => b.name === n)) n = `${base} (${++i})`;
  const b = newLore({ name: n }); await S.save('lore', b); return b;
}
/** 실리태번 모양의 항목들 (uid = 책 안의 차례) */
const stEntries = (b: Lore) => loreToWorld(b as Parameters<typeof loreToWorld>[0]).entries as Record<number, O>;
const entryAt = (b: Lore, uidS: string): number => { const k = uidS.trim(); if (!k) return -1; const i = b.entries.findIndex(e => e.id === k); if (i >= 0) return i; const n = Number(k); return Number.isInteger(n) && n >= 0 && n < b.entries.length ? n : -1; };
function bookOr(c: Ctx, file: string): Lore | null { const b = bookBy(file); if (!b) { warn(c, 'noBook', { name: file }); return null; } return b; }
const FILTER = { characterFilterNames: 'names', characterFilterTags: 'tags', characterFilterExclude: 'exclude' } as const;

def('world', { alias: [], run: (a, c) => {
  const name = U(a), silent = yes(A(a, 'silent')), st = A(a, 'state').trim().toLowerCase(), act = [...(S.settings.activeLore || [])];
  if (!name) { S.set({ activeLore: [] }); if (!silent) ok(c, 'worldCleared'); return ''; }
  const b = bookBy(name); if (!b) return warn(c, 'noBook', { name });
  const on = act.includes(b.id), want = no(st) ? false : st === 'toggle' ? !on : true;
  S.set({ activeLore: want ? [...new Set([...act, b.id])] : act.filter(x => x !== b.id) });
  if (!silent) ok(c, want ? 'worldOn' : 'worldOff', { name: b.name });
  return '';
} });

def('getchatbook', { alias: ['getchatlore', 'getchatwi'], run: async (a, c) => {
  const ch = cur().chat; if (!ch) return warn(c, 'openChat');
  const have = (ch.loreIds || []).map(id => S.get('lore', id)).find(Boolean); if (have) return have.name;
  if (no(A(a, 'create', 'true'))) return '';
  const b = await makeBook(A(a, 'name'), `Chat Book ${ch.name || ch.id}`);
  ch.loreIds = [...(ch.loreIds || []), b.id]; await saveChat(ch); return b.name;
} });
def('getglobalbooks', { alias: ['getgloballore', 'getglobalwi'], run: () => JSON.stringify((S.settings.activeLore || []).map(id => S.get('lore', id)?.name).filter(Boolean)) });
def('getpersonabook', { alias: ['getpersonalore', 'getpersonawi'], run: async a => {
  const p = S.persona(cur().chat); if (!p) return '';
  const have = (p.loreIds || []).map(id => S.get('lore', id)).find(Boolean); if (have) return have.name;
  if (!yes(A(a, 'create', 'false'))) return '';
  const b = await makeBook(A(a, 'name'), `Persona Book ${p.name}`);
  p.loreIds = [...(p.loreIds || []), b.id]; await S.save('personas', p, true); return b.name;
} });
def('getcharbook', { alias: ['getcharlore', 'getcharwi'], run: async (a, c) => {
  const ch = cur().chat, who = U(a);
  if (!who && (ch?.charIds.length || 0) > 1) throw new Error(tx('groupNeedsName'));
  const char = who ? findChar(who) : charsOf(ch)[0]; if (!char) { c.host.echo(tx('noChar', { name: who }), 'error'); return ''; }
  const type = (A(a, 'type').trim().toLowerCase() || 'primary'), ids = (char.loreIds || []).filter(id => S.get('lore', id));
  const names = (type === 'primary' ? ids.slice(0, 1) : type === 'additional' ? ids.slice(1) : ids).map(id => S.get('lore', id)!.name);
  if (yes(A(a, 'create', 'false')) && !names.length) {
    const b = await makeBook(A(a, 'name'), `Character Book ${char.name}`);
    char.loreIds = type === 'additional' ? [...(char.loreIds || []), b.id] : [b.id, ...(char.loreIds || [])]; await S.save('chars', char, true); names.push(b.name);
  }
  return type === 'primary' ? (names[0] ?? '') : JSON.stringify([...new Set(names)]);
} });

def('findentry', { alias: ['findlore', 'findwi'], run: (a, c) => {
  const b = bookOr(c, A(a, 'file')); if (!b) return '';
  if (!b.entries.length) return warn(c, 'noEntries');
  const field = A(a, 'field', 'key') || 'key'; let q = U(a);
  const all = stEntries(b);
  if (typeof all[0]?.[field] === 'boolean') { if (yes(q)) q = 'true'; else if (no(q)) q = 'false'; }
  const ql = q.toLowerCase(), words = ql.split(/\s+/).filter(Boolean);
  let best = -1, score = 0;
  for (const [i, e] of Object.entries(all)) {
    const v = e[field], parts = (Array.isArray(v) ? v : [v]).map(x => String(x ?? '').toLowerCase()), whole = parts.join(' ');
    let s = 0;
    if (parts.includes(ql) || whole === ql) s = 4;
    else if (ql && whole.includes(ql)) s = 3;
    else if (parts.some(p => p && ql.includes(p))) s = 2;
    else if (words.length) { const hit = words.filter(w => whole.includes(w)).length / words.length; if (hit >= 0.5) s = hit; }
    if (s > score) { score = s; best = +i; }
  }
  return best < 0 ? '' : String(best);
} });
def('getentryfield', { alias: ['getlorefield', 'getwifield'], run: (a, c) => {
  const b = bookOr(c, A(a, 'file')); if (!b) return '';
  const i = entryAt(b, U(a)); if (i < 0) return warn(c, 'badUid');
  const field = A(a, 'field', 'content') || 'content', e = stEntries(b)[i];
  const cf = e.characterFilter as { names: string[]; tags: string[]; isExclude: boolean };
  let v: unknown;
  if (field in FILTER) v = field === 'characterFilterNames' ? cf.names : field === 'characterFilterTags' ? cf.tags : cf.isExclude;
  else if (!(field in e)) return warn(c, 'badField', { field });
  else v = e[field];
  if (v === undefined || v === null) return '';
  const sub = (x: unknown) => c.host.macro(String(x), c.scope.flat(), c.pipe);
  return Array.isArray(v) ? JSON.stringify(v.map(sub)) : sub(v);
} });
def('createentry', { alias: ['createlore', 'createwi'], run: async (a, c) => {
  const b = bookOr(c, A(a, 'file')); if (!b) return '';
  const key = A(a, 'key'), content = U(a);
  b.entries.push(newEntry({ keys: key ? [key] : [], name: key || '', content }));
  await S.save('lore', b); return String(b.entries.length - 1);
} });
def('setentryfield', { alias: ['setlorefield', 'setwifield'], run: async (a, c) => {
  if (!a.given) return warn(c, 'needValue');
  const b = bookOr(c, A(a, 'file')); if (!b) return '';
  const i = entryAt(b, A(a, 'uid')); if (i < 0) return warn(c, 'badUid');
  const field = A(a, 'field', 'content') || 'content', value = str(a.unnamed).replace(/\\([{}|])/g, '$1'), e: LoreEntry = b.entries[i];
  if (field in FILTER) {
    const cf = (e.charFilter ||= { names: [], tags: [], exclude: false });
    if (field === 'characterFilterExclude') cf.exclude = yes(value); else (cf as unknown as Record<string, string[]>)[FILTER[field as 'characterFilterNames']] = list(value);
  } else {
    const st = stEntries(b)[i]; if (!(field in st)) return warn(c, 'badField', { field });
    const old = st[field];
    st[field] = Array.isArray(old) ? list(value) : typeof old === 'boolean' ? yes(value)
      : old === null || ['caseSensitive', 'matchWholeWords', 'useGroupScoring', 'scanDepth'].includes(field) ? (!value.trim() || value.trim() === 'null' ? null : field === 'scanDepth' ? Number(value) : yes(value))
      : typeof old === 'number' ? Number(value) : value;
    const conv = worldToLore({ entries: [st] }).entries[0] as LoreEntry; const { id: _id, ...rest } = conv; void _id;
    Object.assign(e, rest);
  }
  await S.save('lore', b); return '';
} });

/** 정해진 시간 효과: chat.loreState[항목 id] = { sticky: 끝나는 메시지 수, cool: 끝나는 메시지 수 } */
type LoreSt = Record<string, { sticky: number; cool: number }>;
const effKey = (eff: string) => eff === 'sticky' ? 'sticky' : eff === 'cooldown' ? 'cool' : '';
def('wi-get-timed-effect', { run: (a, c) => {
  const ch = cur().chat; if (!ch) throw new Error(tx('chatOnly'));
  const b = bookOr(c, A(a, 'file')); if (!b) return '';
  const i = entryAt(b, U(a)); if (i < 0) return warn(c, 'badUid');
  const k = effKey(A(a, 'effect').trim().toLowerCase()); if (!k) return warn(c, 'badEffect');
  const end = ((ch.loreState || {}) as LoreSt)[b.entries[i].id]?.[k] || 0, n = cur().msgs.length, on = end > n;
  return A(a, 'format').trim().toLowerCase() === 'number' ? String(on ? end - n : 0) : String(on);
} });
def('wi-set-timed-effect', { run: async (a, c) => {
  const ch = cur().chat; if (!ch) throw new Error(tx('chatOnly'));
  if (!a.given) return warn(c, 'needState');
  const b = bookOr(c, A(a, 'file')); if (!b) return '';
  const i = entryAt(b, A(a, 'uid')); if (i < 0) return warn(c, 'badUid');
  const eff = A(a, 'effect').trim().toLowerCase(), k = effKey(eff); if (!k) return warn(c, 'badEffect');
  const e = b.entries[i], len = +((eff === 'sticky' ? e.sticky : e.cooldown) || 0); if (!len) return warn(c, 'noEffect');
  const state = (ch.loreState ||= {}) as LoreSt, n = cur().msgs.length, now = (state[e.id]?.[k] || 0) > n, v = U(a).toLowerCase();
  const want = ['toggle', 't', ''].includes(v) ? !now : yes(v) ? true : no(v) ? false : now;
  const s = (state[e.id] ||= { sticky: 0, cool: 0 }); s[k] = want ? n + len : 0;
  await saveChat(ch);
  ok(c, want ? 'effectOn' : 'effectOff', { effect: eff, uid: i });
  return '';
} });

// ════════ 정규식 ════════
def('regex-preset', { run: async (a, c) => {
  const name = U(a);
  if (!name) { const now = new Set(snapshot().on); const hit = sets().find(s => s.on.length === now.size && s.on.every(id => now.has(id))); return hit?.id || ''; }
  const l = name.toLowerCase(), set = sets().find(s => s.id.toLowerCase() === l || s.name.toLowerCase() === l);
  if (!set) { if (!yes(A(a, 'quiet'))) warn(c, 'noRegexSet', { name }); return ''; }
  await applySet(set); regexScopeHooks.redrawChat(); return set.id;
} });
const inScope = (): Entry[] => E.regexScripts({ chat: cur().chat || null }).map(it => ({ r: it.r, sc: it.kind === 'global' ? G : { kind: it.kind, id: it.owner } }));
const findRegex = (name: string) => { const l = name.trim().toLowerCase(); const by = (e: Entry) => String(e.r.name).toLowerCase() === l; return inScope().find(by) || everything().find(by); };
def('regex', { run: (a, c) => {
  const name = A(a, 'name'); if (!name) return warn(c, 'needRegexName');
  const hit = findRegex(name); if (!hit) return warn(c, 'noRegex', { name });
  if (!hit.r.enabled) return warn(c, 'regexOff', { name });
  return E.runRegexScript(hit.r, str(a.unnamed));
} });
def('regex-state', { run: (a, c) => {
  const name = U(a); if (!name) return warn(c, 'needRegexName');
  const hit = findRegex(name); if (!hit) return warn(c, 'noRegex', { name });
  return hit.r.enabled ? 'true' : 'false';
} });
def('regex-toggle', { run: async (a, c) => {
  const name = U(a); if (!name) return warn(c, 'needRegexName');
  const hit = findRegex(name); if (!hit) return warn(c, 'noRegex', { name });
  const st = A(a, 'state', 'toggle').trim().toLowerCase();
  hit.r.enabled = yes(st) ? true : no(st) ? false : !hit.r.enabled;
  await Scope.save(hit.sc, hit.r); regexScopeHooks.redrawChat();
  if (!yes(A(a, 'quiet'))) ok(c, hit.r.enabled ? 'regexOn' : 'regexOffNow', { name: hit.r.name });
  return hit.r.name;
} });

// ════════ 요약 ════════
def('summarize', { run: async a => {
  const ch = cur().chat; let text = str(a.unnamed).trim();
  if (!text) {
    if (!ch) throw new Error(t('qr.run.noChat'));
    const user = S.persona(ch)?.name || 'User';
    text = cur().msgs.filter((m: Msg) => !m.hidden && m.role !== 'system').slice(-40).map(m => `${m.role === 'user' ? user : (m.name || 'Character')}: ${msgText(m)}`).join('\n\n');
  }
  const prompt = A(a, 'prompt').trim() || String(S.settings.summary?.prompt || '');
  const conn = S.helperConn('memory', ch) || (ch ? S.connFor(ch) : S.conn());
  return E.quickCall(prompt, text, { conn, maxTokens: 1500 });
} });

// ════════ 데이터 뱅크 (전역 · 캐릭터 · 대화에 붙인 글 묶음) ════════
interface DbFile { url: string; name: string; text: string; disabled?: boolean; created: number }
type Src = 'global' | 'character' | 'chat';
const SRCS: Src[] = ['global', 'character', 'chat'];
function bank(src: Src): { files: DbFile[]; save: () => Promise<unknown> } | null {
  if (src === 'global') { const st = S.settings as Record<string, unknown>; const files = (st.dataBank ||= []) as DbFile[]; return { files, save: async () => S.saveSettings() }; }
  const ch = cur().chat; if (!ch) return null;
  if (src === 'chat') { const files = (ch.dataBank ||= []) as DbFile[]; return { files, save: () => saveChat(ch) }; }
  const char = charsOf(ch)[0]; if (!char) return null;
  const files = ((char.ext ||= {}).dataBank ||= []) as DbFile[]; return { files, save: () => S.save('chars', char, true) };
}
const srcOf = (a: Args, d: Src | '' = ''): Src | '' => { const s = A(a, 'source').trim().toLowerCase(); return (SRCS as string[]).includes(s) ? s as Src : d; };
const allFiles = (src: Src | '', withOff = true) => (src ? [src] : SRCS).flatMap(s => (bank(s)?.files || []).map(f => ({ f, s }))).filter(x => withOff || !x.f.disabled);
const findFile = (src: Src | '', key: string) => { const k = key.trim(); return allFiles(src).find(x => x.f.url === k) || allFiles(src).find(x => x.f.name === k); };
async function saveSrc(s: Src) { await bank(s)?.save(); }

def('db', { alias: ['databank', 'data-bank'], run: async (_a, c) => {
  const rows = allFiles('').map(({ f, s }) => `[${t('st.x.world.src.' + s)}] ${f.name}${f.disabled ? ' ' + tx('dbOffMark') : ''} — ${f.url} (${f.text.length})`);
  await popup(c, rows.length ? `${tx('dbTitle')}\n\n${rows.join('\n')}` : tx('dbEmpty'));
  return '';
} });
def('db-list', { alias: ['databank-list', 'data-bank-list'], run: a => {
  const field = A(a, 'field', 'url').trim().toLowerCase();
  return JSON.stringify(allFiles(srcOf(a)).map(({ f }) => field === 'name' ? f.name : f.url));
} });
def('db-get', { alias: ['databank-get', 'data-bank-get'], run: (a, c) => { const x = findFile(srcOf(a), U(a)); return x ? x.f.text : warn(c, 'dbNoFile', { name: U(a) }); } });
def('db-add', { alias: ['databank-add', 'data-bank-add'], run: async (a, c) => {
  const src = srcOf(a, 'chat') as Src, b = bank(src); if (!b) return warn(c, 'dbNoSource', { source: src });
  const text = str(a.unnamed); if (!text.trim()) return warn(c, 'dbNeedText');
  const name = A(a, 'name').trim() || `${t('st.x.world.src.' + src)} ${new Date().toISOString().slice(0, 19).replace('T', ' ')}.txt`;
  const f: DbFile = { url: `databank/${src}/${uid()}.txt`, name, text, created: Date.now() };
  b.files.push(f); await b.save(); return f.url;
} });
def('db-update', { alias: ['databank-update', 'data-bank-update'], run: async (a, c) => {
  const x = findFile(srcOf(a), A(a, 'url') || A(a, 'name')); if (!x) return warn(c, 'dbNoFile', { name: A(a, 'url') || A(a, 'name') });
  x.f.text = str(a.unnamed); if (A(a, 'url') && A(a, 'name')) x.f.name = A(a, 'name'); x.f.created = Date.now(); await saveSrc(x.s); return x.f.url;
} });
const dbFlag = (on: boolean) => async (a: Args, c: Ctx) => { const x = findFile(srcOf(a), U(a)); if (!x) return warn(c, 'dbNoFile', { name: U(a) }); x.f.disabled = !on; await saveSrc(x.s); return ''; };
def('db-disable', { alias: ['databank-disable', 'data-bank-disable'], run: dbFlag(false) });
def('db-enable', { alias: ['databank-enable', 'data-bank-enable'], run: dbFlag(true) });
def('db-delete', { alias: ['databank-delete', 'data-bank-delete'], run: async (a, c) => {
  const x = findFile(srcOf(a), U(a)); if (!x) return warn(c, 'dbNoFile', { name: U(a) });
  const b = bank(x.s)!; b.files.splice(b.files.indexOf(x.f), 1); await b.save(); return '';
} });

// ── 데이터 뱅크 벡터 (벡터 검색 설정의 임베딩 연결을 쓴다. 벡터는 kv 'vec:db') ──
const DB_STORE = 'vec:db';
const piecesOf = (files: { f: DbFile }[]) => files.flatMap(({ f }) => chunkText(f.text, +vcfg().chunk || 400).map((text, k) => ({ key: `${f.url}#${k}#${hash(text)}`, text, url: f.url, k })));
async function ingest(c: Ctx, src: Src | '') {
  const vc = vcfg(); if (!S.get('conns', vc.connId)) throw new Error(tx('noVecConn'));
  const pieces = piecesOf(allFiles(src, false)), st = await loadStore(DB_STORE, sigOf(vc));
  await vsync(st, pieces, vc, { prune: !src }); void c; return { pieces, st };
}
def('db-ingest', { alias: ['databank-ingest', 'data-bank-ingest'], run: async (_a, c) => { await ingest(c, ''); return ''; } });
def('db-purge', { alias: ['databank-purge', 'data-bank-purge'], run: async () => { dropAll(); await DB.del('kv', DB_STORE); return ''; } });
def('db-search', { alias: ['databank-search', 'data-bank-search'], run: async (a, c) => {
  const vc = vcfg(), q = U(a); if (!q) return '';
  const th = Number(A(a, 'threshold', String(vc.threshold))), threshold = isNaN(th) ? +vc.threshold : Math.min(1, Math.max(0, th));
  const cn = Number(A(a, 'count')), count = Number.isInteger(cn) && cn >= 1 ? cn : 5;
  const { pieces, st } = await ingest(c, srcOf(a));
  if (!pieces.length) return A(a, 'return') === 'chunks' ? '' : '[]';
  const [qv] = await embed().embedTexts([q], embedOpt(vc, { query: true, timeoutMs: 20000 }));
  const top = pieces.map(p => ({ p, s: embed().cosine(qv, st.items[p.key]) })).filter(x => x.s >= threshold).sort((x, y) => y.s - x.s).slice(0, count);
  const ret = A(a, 'return', 'object').trim().toLowerCase();
  if (ret === 'chunks') { const by = new Map<string, typeof top>(); for (const x of top) by.set(x.p.url, [...(by.get(x.p.url) || []), x]); return [...by.values()].map(xs => xs.sort((m, n) => m.p.k - n.p.k).map(x => x.p.text).join('\n')).join('\n\n'); }
  const urls = [...new Set(top.map(x => x.p.url))];
  return doReturn(c, ret, urls);
} });

/** 실리태번의 return= 처리 (pipe · object · popup · toast · console · none) */
async function doReturn(c: Ctx, how: string, items: unknown[]): Promise<string> {
  const json = JSON.stringify(items), text = items.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('\n');
  if (how.startsWith('popup')) { await popup(c, text); return ''; }
  if (how.startsWith('toast')) { c.host.echo(text); return ''; }
  if (how.startsWith('chat')) { await (c.host.comment as ((s: string) => Promise<string>) | undefined)?.(text); return ''; }
  if (how === 'console') { console.log(items); return ''; }
  if (how === 'none') return '';
  return json;
}

// ── 벡터 설정 ──
const vecNum = (key: 'threshold' | 'query' | 'loreMax', lo: number, hi: number) => (a: Args, c: Ctx) => {
  const vc = vcfg() as unknown as Record<string, number>, v = U(a);
  if (v) { const n = Number(v); if (isNaN(n)) return warn(c, 'badNumber', { value: v }); vc[key] = Math.min(hi, Math.max(lo, key === 'threshold' ? n : Math.round(n))); S.saveSettings(); }
  return String(vc[key]);
};
const vecFlag = (key: string) => (a: Args) => {
  const vc = vcfg() as unknown as Record<string, unknown>, v = U(a);
  if (v) { vc[key] = yes(v) ? true : no(v) ? false : !vc[key]; S.saveSettings(); }
  return String(!!vc[key]);
};
def('vector-threshold', { run: vecNum('threshold', 0, 1) });
def('vector-query', { run: vecNum('query', 1, 99) });
def('vector-max-entries', { run: vecNum('loreMax', 1, 9999) });
def('vector-chats-state', { run: vecFlag('chat') });
def('vector-files-state', { run: vecFlag('files') });
def('vector-worldinfo-state', { run: vecFlag('lore') });

// ════════ 표정 ════════
async function exprTarget(name = '') {
  const { chat, msgs } = cur(); if (!chat) throw new Error(t('qr.run.noChat'));
  const char = name ? (findChar(name) || charsOf(chat).find(x => x.name.toLowerCase() === name.toLowerCase())) : charsOf(chat)[0];
  if (!char) throw new Error(tx('noChar', { name }));
  await Sprites.load(char.id); return { chat, msgs, char };
}
def('expression-set', { alias: ['sprite', 'emote'], run: async (a, c) => {
  const { chat, msgs, char } = await exprTarget(), m = lastReply(msgs, chat, char.id); if (!m) return warn(c, 'noReply');
  const v = U(a);
  if (A(a, 'type', 'expression').trim().toLowerCase() === 'sprite') {
    const sp = Sprites.list(char.id).find(s => s.name === v) || Sprites.list(char.id).find(s => s.name.toLowerCase() === v.toLowerCase());
    if (!sp) return warn(c, 'noSprite', { name: v });
    await setExpr(chat, m, sp.label, sp.id); return sp.label;
  }
  const label = canonLabel(v, universe(char.id)); if (!label) return warn(c, 'noLabel', { name: v });
  await setExpr(chat, m, label); return label;
} });
def('expression-fallback', { run: (a, c) => {
  const v = U(a), x = xcfg();
  if (v) { const label = v === '#none' || /^(none|off)$/i.test(v) ? '#none' : canonLabel(v, universe()); if (!label) return warn(c, 'noLabel', { name: v }); x.fallback = label; xsave(); bus.sync(); }
  return x.fallback === '#none' ? '' : x.fallback;
} });
def('expression-folder-override', { alias: ['spriteoverride', 'costume'], run: (_a, c) => warn(c, 'noCostume') });
def('expression-last', { alias: ['lastsprite'], run: async a => {
  const ch = cur().chat, n = U(a) || (ch ? charsOf(ch)[0]?.name || '' : '');
  const { chat, msgs, char } = await exprTarget(n); return currentOf(chat, msgs, char.id).label;
} });
def('expression-list', { alias: ['expressions'], run: async (a, c) => {
  const ch = cur().chat, char = charsOf(ch)[0]; if (char) await Sprites.load(char.id);
  let labels = yes(A(a, 'filter', 'true')) && char ? Sprites.labels(char.id) : universe(char?.id);
  if (no(A(a, 'custom', 'true'))) { const cus = new Set(xcfg().custom.map(x => x.label)); labels = labels.filter(l => !cus.has(l)); }
  const how = A(a, 'return', 'pipe').trim().toLowerCase();
  return how === 'pipe' ? labels.join(', ') : doReturn(c, how, labels);
} });
def('expression-classify', { alias: ['classify'], run: async a => {
  const text = str(a.unnamed); if (!text.trim()) return '';
  const { chat, msgs, char } = await exprTarget(), api = A(a, 'api').trim().toLowerCase(), all = no(A(a, 'filter', 'true'));
  if (['none', 'local', 'keyword', 'key'].includes(api)) return keywordLabel(text, { labels: all ? universe(char.id) : candidates(char.id), custom: xcfg().custom }).label || byKeyword(text, char.id);
  const m = newMsg('assistant', text, { name: char.name }); m.charId = char.id;
  const x = xcfg(), keep = { p: x.callPrompt, h: x.onlyHave };
  try { if (A(a, 'prompt')) x.callPrompt = A(a, 'prompt'); if (all) x.onlyHave = false; return await classify(chat, [...msgs, m], m); }
  finally { x.callPrompt = keep.p; x.onlyHave = keep.h; }
} });
def('expression-upload', { alias: ['uploadsprite'], run: async (a, c) => {
  const url = U(a); if (!url) return warn(c, 'needUrl');
  const { char } = await exprTarget(A(a, 'name')), label = cleanLabel(A(a, 'label')); if (!label) return warn(c, 'needLabel');
  const r = await fetch(url); if (!r.ok) throw new Error(tx('fetchFail', { status: r.status }));
  const data = await readDataURL(await r.blob()), name = A(a, 'spriteName').trim() || label;
  await Sprites.put(char.id, label, name, data); Sprites.note(char.id); bus.sync(); return name;
} });

// ════════ 캡션 (이미지 설명) ════════
def('caption', { run: async a => {
  const { chat, msgs } = cur(); let img = '';
  const mid = A(a, 'mesId'), idx = Math.max(0, +A(a, 'index', '0') || 0);
  if (mid !== '') {
    const m = msgs[+mid < 0 ? msgs.length + +mid : +mid]; if (!m) throw new Error(tx('noMsg', { id: mid }));
    const sw = m.swipes[m.sw], illus = (sw?.illust || []).map(x => Illust.data(x.id)).filter(Boolean);
    img = [...(m.images || []), ...illus][idx] || '';
    if (!img) throw new Error(tx('noImage'));
  } else {
    const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return '';
    img = await readDataURL(f);
  }
  const prompt = str(a.unnamed).trim() || 'Describe this image in detail.';
  const conn = S.helperConn('caption', chat) || (chat ? S.connFor(chat) : S.conn());
  const P = { ...S.preset().params, stream: false, maxTokens: 800, prefill: '', stop: [] } as Parameters<typeof E.streamChat>[1];
  const r = await E.streamChat(conn, P, [{ role: 'user', content: prompt, images: [img] }]);
  return E.splitThink(r.text).text.trim();
} });

// ════════ 갤러리 ════════
def('show-gallery', { alias: ['sg'], run: async () => { const { openStudio } = await import('../../scenebook/Studio'); openStudio('gallery'); return ''; } });
def('list-gallery', { alias: ['lg'], run: async a => {
  const who = A(a, 'char'), grp = A(a, 'group'), ch = cur().chat;
  let chats: Chat[] = [];
  if (grp) chats = S.chats.filter(x => x.id === grp || x.name === grp);
  else if (who) { const char = findChar(who); chats = char ? S.chats.filter(x => x.charIds.includes(char.id)) : []; }
  else if (ch) chats = [ch];
  const ids: string[] = [];
  for (const x of chats) for (const r of await DB.byOwner('chat:' + x.id)) if (r.kind === 'illust') ids.push(r.id);
  return JSON.stringify(ids);
} });

// ════════ 그림 만들기 (드림랜드 삽화) ════════
const SCENE_WORDS = ['last', 'scene', 'raw_last', 'you', 'me', 'face', 'background', 'character', 'user', 'portrait', 'world', 'bg', 'raw'];
def('imagine', { alias: ['sd', 'img', 'image'], run: async (a, c) => {
  const { chat, msgs } = cur(); if (!chat) throw new Error(t('qr.run.noChat'));
  const arg = str(a.unnamed).trim(), quiet = yes(A(a, 'quiet'));
  const over: Record<string, unknown> = {};
  const num = (k: string, to = k) => { const v = A(a, k); if (v !== '' && !isNaN(+v)) over[to] = +v; };
  num('seed'); num('width'); num('height'); num('steps'); num('cfg', 'scale');
  for (const k of ['sampler', 'scheduler', 'model']) if (A(a, k)) over[k] = A(a, k);
  let scene: Record<string, unknown>;
  const last = [...msgs].reverse().find(m => m.role === 'assistant');
  if (!arg || SCENE_WORDS.includes(arg.toLowerCase())) {
    if (!last) return warn(c, 'noReply');
    chatApi.setStatus?.(tx('imagining'));
    try { [scene] = await Illust.analyze(chat, msgs, last, undefined, { manual: true }) as Record<string, unknown>[]; } finally { chatApi.setStatus?.(''); }
  } else scene = { prompt: arg };
  if (A(a, 'negative')) scene.negative = A(a, 'negative');
  chatApi.setStatus?.(tx('imagining'));
  let rec;
  try { rec = await Illust.render(chat, scene, Illust.genConfig(over)); } finally { chatApi.setStatus?.(''); }
  const target = msgs[msgs.length - 1];
  if (!quiet && target) { Illust.insert(target.swipes[target.sw], rec); await chatApi.save(); redraw(); }
  return rec.data;
} });
def('imagine-source', { alias: ['sd-source', 'img-source'], run: async (a, c) => {
  const v = U(a).toLowerCase(), keys = ['nai', 'openai', 'gemini', 'a1111'];
  if (v) {
    const al: Record<string, string> = { novel: 'nai', novelai: 'nai', auto: 'a1111', sd: 'a1111', webui: 'a1111', google: 'gemini' };
    const k = keys.find(x => x === v) || al[v]; if (!k) return warn(c, 'badSource', { name: v, list: keys.join(', ') });
    Illust.saveCfg({ backend: k });
  }
  return String(Illust.cfg().backend || '');
} });
def('imagine-style', { alias: ['sd-style', 'img-style'], run: (a, c) => {
  const v = U(a).toLowerCase();
  if (v) { const look = LOOKS.find(x => x[0].toLowerCase() === v || x[1].toLowerCase() === v); if (!look) return warn(c, 'badStyle', { name: v }); Illust.saveCfg({ look: look[0] }); }
  const id = String(Illust.cfg().look || ''); return LOOKS.find(x => x[0] === id)?.[1] || id;
} });
def('imagine-comfy-workflow', { alias: ['icw'], run: (_a, c) => warn(c, 'noComfy') });

// ════════ 번역 · 읽어 주기 · 자막 ════════
def('translate', { run: async a => {
  const text = str(a.unnamed); if (!text.trim()) return '';
  const { translate, cfg } = await import('../../translate/logic');
  const pv = A(a, 'provider'), conn = pv ? S.conns.find(x => x.id === pv || x.name === pv) || null : null;
  return translate(text, A(a, 'target') || cfg().lang, { chat: cur().chat, conn });
} });
def('speak', { alias: ['narrate', 'tts'], run: (a, c) => {
  const text = str(a.unnamed).replace(/[*_`#>]/g, '').trim(); if (!text) return '';
  if (!('speechSynthesis' in window)) return warn(c, 'noTts');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text), want = A(a, 'voice').trim().toLowerCase();
  const v = want ? speechSynthesis.getVoices().find(x => x.name.toLowerCase() === want) || speechSynthesis.getVoices().find(x => x.name.toLowerCase().includes(want)) : undefined;
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = /[가-힣]/.test(text) ? 'ko-KR' : /[一-鿿]/.test(text) ? 'zh-CN' : 'en-US';
  speechSynthesis.speak(u); return '';
} });
def('yt-script', { run: (_a, c) => warn(c, 'noYt') });

// ════════ 도구 (스크립트 안에서 부르는 도구 목록) ════════
interface Tool { name: string; displayName: string; description: string; parameters: string; action: Val; formatMessage: Val; shouldRegister: Val; stealth: boolean }
const TOOLS = new Map<string, Tool>();
async function runVal(v: Val, c: Ctx, args: Record<string, string> = {}): Promise<string> {
  if (isBound(v)) return callClosure(v as Bound, c, args);
  const src = str(v).trim(); if (!src) return '';
  return runScript(src, c.host, { scope: c.scope, args });
}
def('tools-list', { alias: ['tool-list'], run: async (a, c) => {
  const items = [...TOOLS.values()].map(x => ({ type: 'function', function: { name: x.name, description: x.description, parameters: (() => { try { return JSON.parse(x.parameters); } catch { return {}; } })() }, displayName: x.displayName, stealth: x.stealth }));
  return doReturn(c, A(a, 'return', 'none').trim().toLowerCase(), items);
} });
def('tools-invoke', { alias: ['tool-invoke'], run: async (a, c) => {
  const name = U(a), tool = TOOLS.get(name); if (!tool) throw new Error(tx('noTool', { name }));
  let params: Record<string, string> = {};
  const raw = A(a, 'parameters').trim();
  if (raw) { try { const j = JSON.parse(raw) as Record<string, unknown>; params = Object.fromEntries(Object.entries(j).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])); } catch { throw new Error(tx('badParams')); } }
  if (tool.shouldRegister && no(await runVal(tool.shouldRegister, c))) throw new Error(tx('toolOff', { name }));
  if (tool.formatMessage && !tool.stealth) { const msg = await runVal(tool.formatMessage, c, params); if (msg) c.host.echo(msg); }
  return runVal(tool.action, c, { ...params, arguments: raw || '{}' });
} });
def('tools-register', { alias: ['tool-register'], run: (a, c) => {
  const name = A(a, 'name').trim(); if (!name) throw new Error(tx('needToolName'));
  if (!a.parts.length && !str(a.unnamed).trim()) throw new Error(tx('needAction'));
  const params = A(a, 'parameters').trim() || '{}'; try { JSON.parse(params); } catch { throw new Error(tx('badParams')); }
  TOOLS.set(name, { name, displayName: A(a, 'displayName') || name, description: A(a, 'description'), parameters: params, action: a.unnamed, formatMessage: a.named.formatMessage ?? '', shouldRegister: a.named.shouldRegister ?? '', stealth: yes(A(a, 'stealth', 'false')) });
  void c; return '';
} });
def('tools-unregister', { alias: ['tool-unregister'], run: (a, c) => { const name = U(a); if (!TOOLS.delete(name)) return warn(c, 'noToolWarn', { name }); return ''; } });

// ════════ 확장 ════════
async function extFind(name: string) {
  if (!catalog.length) await readCatalog();
  const n = name.trim().replace(/^third-party\//i, '').toLowerCase();
  return catalog.find(x => x.id.toLowerCase() === n) || catalog.find(x => x.name.toLowerCase() === n);
}
const extSet = (mode: 'on' | 'off' | 'toggle') => async (a: Args, c: Ctx) => {
  const it = await extFind(U(a)); if (!it) return warn(c, 'noExt', { name: U(a) });
  const st = A(a, 'state').trim().toLowerCase(), want = mode === 'on' ? true : mode === 'off' ? false : yes(st) ? true : no(st) ? false : !extOn(it.id);
  if (want !== extOn(it.id)) await setEnabled(it, want);
  ok(c, want ? 'extOn' : 'extOff', { name: it.name });
  if (yes(A(a, 'reload', 'false'))) location.reload();   // 드림랜드 확장은 바로 켜지고 꺼진다: reload=true 일 때만 새로 고침
  return it.id;
};
def('extension-enable', { run: extSet('on') });
def('extension-disable', { run: extSet('off') });
def('extension-toggle', { run: extSet('toggle') });
def('extension-state', { run: async (a, c) => { const it = await extFind(U(a)); if (!it) return warn(c, 'noExt', { name: U(a) }); return String(extOn(it.id)); } });
def('extension-exists', { alias: ['extension-installed'], run: async a => String(!!(await extFind(U(a)))) });
def('reload-page', { run: () => { location.reload(); return ''; } });

// ════════ 데이터 뱅크 → 프롬프트 ════════
// 실리태번처럼 벡터 검색의 "파일" 이 켜져 있을 때만: 생성 직전에 최근 대화로 데이터 뱅크를 찾아, 가까운 조각을 프롬프트에 넣는다
const BANK_OWNER = 'stscript-databank';
const found = new Map<string, string>();
X.before = X.before.filter(b => b.owner !== BANK_OWNER);
X.before.push({ owner: BANK_OWNER, fn: async ({ chat, msgs }) => {
  found.delete(chat.id);
  const vc = vcfg() as unknown as { files?: boolean; connId?: string; query?: number; threshold?: number };
  if (!(vc as { enabled?: boolean }).enabled || !vc.files || !S.get('conns', vc.connId)) return;
  const files = allFiles('', false); if (!files.length) return;
  const q = msgs.filter(m => !m.hidden && m.role !== 'system').slice(-(+(vc.query || 2))).map(m => msgText(m)).join('\n').trim(); if (!q) return;
  try {
    const pieces = piecesOf(files), st = await loadStore(DB_STORE, sigOf(vcfg()));
    await vsync(st, pieces, vcfg(), { prune: true });
    const [qv] = await embed().embedTexts([q], embedOpt(vcfg(), { query: true, timeoutMs: 20000 }));
    const top = pieces.map(p => ({ p, s: embed().cosine(qv, st.items[p.key]) })).filter(x => x.s >= +(vc.threshold ?? 0.25)).sort((x, y) => y.s - x.s).slice(0, 5);
    if (top.length) found.set(chat.id, top.map(x => x.p.text).join('\n\n'));
  } catch (e) { console.warn('[데이터 뱅크]', e); }
} });
X.prompt = X.prompt.filter(p => p.owner !== BANK_OWNER);
X.prompt.push({ owner: BANK_OWNER, fn: ({ chat }) => {
  const text = found.get(chat.id); if (!text) return [];
  return [{ where: 'depth' as const, role: 'system', depth: 2, content: `Related information:\n${text}`, src: tx('dbPromptSrc') }];
} });

/** 화면(벡터 검색 설정)에서 쓰는 데이터 뱅크 다루기 */
export const dataBank = {
  list: () => allFiles('').map(({ f, s }) => ({ ...f, src: s })),
  async add(src: Src, name: string, text: string) { const b = bank(src); if (!b) throw new Error(tx('dbNoSource', { source: src })); b.files.push({ url: `databank/${src}/${uid()}.txt`, name, text, created: Date.now() }); await b.save(); },
  async toggle(url: string) { const x = findFile('', url); if (!x) return; x.f.disabled = !x.f.disabled; await saveSrc(x.s); },
  async remove(url: string) { const x = findFile('', url); if (!x) return; const b = bank(x.s)!; b.files.splice(b.files.indexOf(x.f), 1); await b.save(); },
};
