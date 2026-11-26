// 변경 카드의 적용과 되돌리기. 조수의 쓰기는 전부 여기를 지난다 — 사람이 "적용"을 눌러야만 불린다
// 되돌리기: 적용 직전의 사본을 kv 에 둔다 (gdundo:<id>). 14일이 지났거나 50건을 넘으면 오래된 것부터 버린다
import { DB, S, emit, newChar, newEntry, newLore, newPersona, newRegex, now, uid } from '../lib/core';
import { BUILTIN, applyTheme } from '../lib/theme';
import { newQrItem, newQrSet, qrSave, qrStore, type QrItem, type QrSet } from '../lib/qr-data';
import type { Char, Lore, LoreEntry, Persona, Preset, PresetBlock, Regex, Theme } from '../lib/types';
import { installExt, restoreExt, saveZip, type ExtBefore } from './ext';
import type { Change, Kind, Op, UndoRow } from './types';

const LEDGER = 'guide:undo', KEEP_DAYS = 14, KEEP_N = 50, KEEP_TH = 30;
type Obj = Record<string, unknown>;
const themes = () => (S.settings.customThemes ||= []);

/** 점으로 이은 길(depthPrompt.prompt)에 값을 넣는다 */
export function setPath(o: Obj, path: string, v: unknown) { const ks = path.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = (t[k] && typeof t[k] === 'object' ? t[k] : (t[k] = {})) as Obj; t[ks[ks.length - 1]] = v; }
export function getPath(o: unknown, path: string): unknown { let t = o; for (const k of path.split('.')) { if (!t || typeof t !== 'object') return undefined; t = (t as Obj)[k]; } return t; }

/** 지금 그 자료 (없으면 undefined) */
export function current(kind: Kind, id: string): Obj | undefined {
  if (kind === 'vars' || kind === 'settings' || kind === 'ext') return undefined;   // 서재의 자료가 아니다 (아래에서 따로 다룬다)
  if (kind === 'theme') return themes().find(t => t.id === id) as Obj | undefined;
  if (kind === 'qr') return qrStore().sets.find(s => s.id === id) as unknown as Obj | undefined;
  return S.get(kind, id) as Obj | undefined;
}
async function put(kind: Kind, obj: Obj) {
  if (kind === 'theme') { const l = themes(), i = l.findIndex(t => t.id === obj.id); if (i < 0) l.push(obj as Theme); else l[i] = obj as Theme; S.set({ customThemes: l }); if (S.settings.theme === obj.id) applyTheme(); }
  else if (kind === 'qr') { const q = qrStore(), i = q.sets.findIndex(s => s.id === obj.id); if (i < 0) q.sets.push(obj as unknown as QrSet); else q.sets[i] = obj as unknown as QrSet; qrSave(); }
  else if (kind !== 'vars' && kind !== 'settings' && kind !== 'ext') await S.save(kind, obj as never);
}
async function drop(kind: Kind, id: string) {
  if (kind === 'theme') { S.set({ customThemes: themes().filter(t => t.id !== id), ...(S.settings.theme === id ? { theme: BUILTIN[0].id } : {}) }); applyTheme(); }
  else if (kind === 'qr') { const q = qrStore(); q.sets = q.sets.filter(s => s.id !== id); qrSave(); }
  else if (kind !== 'vars' && kind !== 'settings' && kind !== 'ext') await S.remove(kind, id);
}

/** 새 자료를 그 종류의 기본 꼴 위에 만든다 */
function build(kind: Kind, o: Obj): Obj {
  if (kind === 'chars') return newChar(o as Partial<Char>);
  if (kind === 'personas') return newPersona(o as Partial<Persona>);
  if (kind === 'lore') { const b = newLore({ ...(o as Partial<Lore>), entries: [] }); b.entries = (Array.isArray(o.entries) ? o.entries as Obj[] : []).map(e => newEntry(e as Partial<LoreEntry>)); return b as unknown as Obj; }
  if (kind === 'regex') return newRegex(o as Partial<Regex>) as unknown as Obj;
  if (kind === 'theme') { const base = structuredClone(BUILTIN.find(t => t.tone === o.tone) || BUILTIN[0]); return { ...base, id: 'my-' + uid(), builtin: false, ...o, c: { ...base.c, ...(o.c as Obj || {}) } }; }
  if (kind === 'qr') return newQrSet({ ...(o as Partial<QrSet>), items: (Array.isArray(o.items) ? o.items as Obj[] : []).map(i => newQrItem(i as Partial<QrItem>)) }) as unknown as Obj;
  throw new Error('cannot create ' + kind);
}

// ── 새로 만든 자료를 캐릭터에 이어 붙이기 ──
// 조수가 캐릭터 · 로어북 · 정규식 · 퀵 리플라이를 한 번에 제안하면, 서로의 id 는 적용해야 생긴다.
// 그래서 "어느 캐릭터의 것인지"를 이름으로 적어 두고, 무엇을 먼저 적용하든 둘 다 생긴 순간에 잇는다.
const LINKS = 'guide:links';
interface LinkRow { kind: Kind; id: string; char: string; at: number }
const linkRows = async () => ((await DB.get('kv', LINKS)) as { list?: LinkRow[] } | undefined)?.list || [];
export async function linkUp(add?: LinkRow): Promise<void> {
  const rows = [...(await linkRows()), ...(add ? [add] : [])], left: LinkRow[] = [];
  for (const r of rows) {
    const item = current(r.kind, r.id); if (!item) continue;   // 그 자료가 지워졌다
    const key = r.char.trim().toLowerCase(), c = S.get('chars', r.char) || [...S.chars].reverse().find(x => (x.name || '').trim().toLowerCase() === key);
    if (!c) { if (now() - r.at < KEEP_DAYS * 864e5) left.push(r); continue; }
    if (r.kind === 'lore') { if (!(c.loreIds ||= []).includes(r.id)) { c.loreIds.push(r.id); await S.save('chars', c); } }
    else if (r.kind === 'regex') { if (item.scope !== c.id) { item.scope = c.id; await put('regex', item); } }
    else if (r.kind === 'qr') { const ids = Array.isArray(item.charIds) ? item.charIds as string[] : []; if (item.scope !== 'char' || !ids.includes(c.id)) { item.scope = 'char'; item.charIds = [...new Set([...ids, c.id])]; await put('qr', item); } }
  }
  if (left.length || (await linkRows()).length) await DB.put('kv', { id: LINKS, list: left });
}

async function ledger(): Promise<UndoRow[]> { return ((await DB.get('kv', LEDGER)) as { list?: UndoRow[] } | undefined)?.list || []; }
async function saveLedger(list: UndoRow[]) {
  // 스크립트가 적은 줄(src: 'th')은 따로 세어 조수의 되돌리기 기록을 밀어내지 않게 한다
  const min = now() - KEEP_DAYS * 864e5, live = list.filter(r => r.at >= min), mine = live.filter(r => r.src !== 'th').slice(-KEEP_N), th = live.filter(r => r.src === 'th').slice(-KEEP_TH);
  const keep = live.filter(r => mine.includes(r) || th.includes(r)), gone = list.filter(r => !keep.includes(r));
  for (const r of gone) await DB.del('kv', 'gdundo:' + r.id).catch(() => { });
  await DB.put('kv', { id: LEDGER, list: keep }); emit('guide:undo');
}
export const undoList = async () => (await ledger()).filter(r => r.at >= now() - KEEP_DAYS * 864e5).reverse();

// ── 앱 설정 · 대화 변수: 서재의 자료가 아니어서 따로 적용하고 따로 되돌린다 ──
/** 점으로 이은 길들을 설정에 적는다. 맨 위 칸 단위로 사본을 떠서 S.set 으로 넣는다 (테마 · 글꼴 같은 것은 그 알림을 듣고 바로 반영된다) */
function writeSettings(fields: Obj) {
  const patch: Obj = {};
  for (const [k, v] of Object.entries(fields)) { const top = k.split('.')[0]; if (!(top in patch)) patch[top] = structuredClone((S.settings as unknown as Obj)[top]); if (k === top) patch[top] = structuredClone(v); else setPath(patch, k, structuredClone(v)); }
  S.set(patch as never);
  if ('theme' in patch || 'font' in patch || 'chatFont' in patch || 'fontSize' in patch || 'lineHeight' in patch || 'chatWidth' in patch) applyTheme();
}
interface VarsBefore { chatId: string; msgId: string; thData: unknown; vars: unknown }
/** 대화 변수를 적용 전으로 되돌린다 (그 대화가 열려 있어야 한다) */
async function restoreVars(b: VarsBefore) {
  const [{ cur }, { setVarsOf }, { chatApi }, A] = await Promise.all([import('../chat/store'), import('../chat/msgVars'), import('../chat/actions'), import('../mvu/app')]);
  const chat = cur.chat; if (!chat || chat.id !== b.chatId) throw new Error('open the chat first');
  const m = cur.msgs.find(x => x.id === b.msgId); if (m) setVarsOf(m, b.thData === undefined || b.thData === null ? undefined : structuredClone(b.thData) as Obj);
  chat.vars = structuredClone(b.vars || {}) as typeof chat.vars;
  await chatApi.save(); chatApi.redraw?.(); A.pushFrames();
}

/** 변경 하나를 지금 자료에 적용한다. 적용 전 사본을 남기고 change 를 고쳐 적는다 */
export async function applyChange(ch: Change): Promise<void> {
  if (ch.state !== 'pending') return;
  const op: Op = ch.op, id = uid();
  let kind: Kind, targetId: string, before: Obj | null = null, after: Obj;
  try {
    if (op.type === 'settings') {   // 앱 설정: 바뀌는 칸의 옛 값만 남긴다
      const before: Obj = {}; for (const k of Object.keys(op.fields)) before[k] = structuredClone(getPath(S.settings, k) ?? null);
      await DB.put('kv', { id: 'gdundo:' + id, before });
      writeSettings(op.fields);
      await saveLedger([...(await ledger()), { id, at: now(), kind: 'settings', targetId: 'settings', target: ch.target, created: false, stamp: 0 }]);
      ch.state = 'applied'; ch.undoId = id; ch.at = now(); delete ch.err;
      return;
    }
    if (op.type === 'vars') {   // 대화 변수: 그 대화가 열려 있을 때만 (메시지에 적힌 변수와 화면이 함께 바뀌어야 한다)
      const [{ cur }, { varsOf }, { chatApi }, A] = await Promise.all([import('../chat/store'), import('../chat/msgVars'), import('../chat/actions'), import('../mvu/app')]);
      const chat = cur.chat; if (!chat || chat.id !== op.chatId) throw new Error('open the chat first');
      const m = cur.msgs.find(x => x.id === op.msgId); if (op.commands && !m) throw new Error('gone');
      const before: VarsBefore = { chatId: chat.id, msgId: op.msgId, thData: m ? structuredClone(varsOf(m) ?? null) : null, vars: structuredClone(chat.vars || {}) };
      await DB.put('kv', { id: 'gdundo:' + id, before });
      if (op.commands && m) { const ok = await A.applyTo(chat, m, () => op.commands, true); if (!ok) throw new Error('no MVU variables in this chat'); }
      if (Object.keys(op.set).length) { const vs = (chat.vars ||= {}) as unknown as Obj; for (const [k, v] of Object.entries(op.set)) { if (v === null) delete vs[k]; else vs[k] = v; } await chatApi.save(); chatApi.redraw?.(); A.pushFrames(); }
      await saveLedger([...(await ledger()), { id, at: now(), kind: 'vars', targetId: chat.id, target: ch.target, created: false, stamp: 0 }]);
      ch.state = 'applied'; ch.undoId = id; ch.at = now(); delete ch.err;
      return;
    }
    if (op.type === 'ext') {   // 확장: 실리태번 것은 zip 으로 받기만 (되돌릴 것이 없다), 드림랜드 것은 사람이 설치하는 길로 넣고 그 전 모습을 남긴다
      if (op.target === 'st') { await saveZip(op); ch.state = 'applied'; ch.at = now(); delete ch.err; return; }
      const before = await installExt(op);
      await DB.put('kv', { id: 'gdundo:' + id, before });
      await saveLedger([...(await ledger()), { id, at: now(), kind: 'ext', targetId: op.id, target: ch.target, created: !before.row, stamp: 0 }]);
      ch.state = 'applied'; ch.undoId = id; ch.at = now(); delete ch.err;
      return;
    }
    if (op.type === 'create') { kind = op.coll; after = build(kind, structuredClone(op.obj)); targetId = String(after.id); }
    else if (op.type === 'delete') {   // 통째로 지우기: 사본을 남기고 치운다 (되돌리면 사본을 다시 넣는다)
      kind = op.coll; targetId = op.id;
      const cur = current(kind, targetId); if (!cur) throw new Error('gone');
      before = structuredClone(cur);
      await DB.put('kv', { id: 'gdundo:' + id, before });
      await drop(kind, targetId);
      await saveLedger([...(await ledger()), { id, at: now(), kind, targetId, target: ch.target, created: false, stamp: 0 }]);
      ch.state = 'applied'; ch.undoId = id; ch.at = now(); delete ch.err;
      return;
    }
    else {
      kind = op.type === 'entry' || op.type === 'entrydel' ? 'lore' : op.type === 'block' ? 'presets' : op.type === 'qritem' || op.type === 'qrdel' ? 'qr' : op.coll;
      targetId = op.type === 'entry' || op.type === 'entrydel' ? op.loreId : op.type === 'block' ? op.presetId : op.type === 'qritem' || op.type === 'qrdel' ? op.setId : op.id;
      const cur = current(kind, targetId); if (!cur) throw new Error('gone');
      before = structuredClone(cur); after = cur;
      if (op.type === 'set') for (const [k, v] of Object.entries(op.fields)) setPath(after, k, structuredClone(v));
      else if (op.type === 'entrydel') {
        const b = after as unknown as Lore, e = b.entries.find(x => x.id === op.entryId);
        if (!e) throw new Error('gone'); if (e.locked) throw new Error('locked');
        b.entries = b.entries.filter(x => x.id !== op.entryId);
      } else if (op.type === 'qrdel') {
        const set = after as unknown as QrSet; if (!set.items.some(x => x.id === op.itemId)) throw new Error('gone');
        set.items = set.items.filter(x => x.id !== op.itemId);
      } else if (op.type === 'entry') {
        const b = after as unknown as Lore; let e = b.entries.find(x => x.id === op.entryId);
        if (e?.locked) throw new Error('locked');
        if (!e) { e = newEntry({ id: op.entryId }); b.entries.push(e); }
        Object.assign(e, structuredClone(op.fields));
      } else if (op.type === 'qritem') {
        const set = after as unknown as QrSet; let it = set.items.find(x => x.id === op.itemId);
        if (!it) { it = newQrItem({ id: op.itemId }); set.items.push(it); }
        Object.assign(it, structuredClone(op.fields));
      } else {
        const p = after as unknown as Preset; let bl = p.blocks.find(x => x.id === op.blockId);
        if (!bl) {
          bl = { id: op.blockId, kind: 'custom', name: '', role: 'system', content: '', enabled: true, depth: null } as PresetBlock;
          // 자리를 정하지 않았으면 대화 기록 바로 앞에 둔다 (뒤에 두면 마지막 지시가 되어 영향이 너무 크다)
          let at = op.after ? p.blocks.findIndex(x => x.id === op.after) : -1;
          at = at >= 0 ? at + 1 : p.blocks.findIndex(x => x.kind === 'chatHistory');
          p.blocks.splice(at < 0 ? p.blocks.length : at, 0, bl);
        }
        Object.assign(bl, structuredClone(op.fields));
      }
    }
    await DB.put('kv', { id: 'gdundo:' + id, before });
    await put(kind, after);
    const row: UndoRow = { id, at: now(), kind, targetId, target: ch.target, created: !before, stamp: Number(after.updatedAt) || 0 };
    await saveLedger([...(await ledger()), row]);
    ch.state = 'applied'; ch.undoId = id; ch.at = now(); delete ch.err;
    if (op.type === 'create') { ch.op = { ...op, obj: { ...op.obj, id: targetId } }; await linkUp(op.link?.char && kind !== 'chars' ? { kind, id: targetId, char: op.link.char, at: now() } : undefined).catch(e => console.warn('[등불지기] 이어 붙이기', e)); }
  } catch (e) { ch.state = 'failed'; ch.err = e instanceof Error ? e.message : String(e); throw e; }
}

/** 조수 밖에서 고친 것(실리태번 스크립트 등)도 같은 장부에 적는다: 고치기 직전 사본(before, 새로 만든 것이면 null)을 두고 되돌릴 번호를 돌려준다.
 *  고친 뒤 put 을 마친 다음에 부르면 stamp(고친 시각)가 맞게 적힌다 */
export async function keepUndo(kind: Kind, targetId: string, target: string, before: Obj | null): Promise<string> {
  const id = uid();
  await DB.put('kv', { id: 'gdundo:' + id, before: before ? structuredClone(before) : null });
  const after = current(kind, targetId);
  await saveLedger([...(await ledger()), { id, at: now(), kind, targetId, target, created: !before, stamp: Number(after?.updatedAt) || 0, src: 'th' }]);
  return id;
}

/** 되돌릴 때 그 뒤로 사람이 또 고쳤는지 (고쳤으면 화면에서 한 번 더 묻는다) */
export async function touchedSince(undoId: string): Promise<boolean> {
  const r = (await ledger()).find(x => x.id === undoId); if (!r) return false;
  const cur = current(r.kind, r.targetId); return !!cur && !!r.stamp && Number(cur.updatedAt) !== r.stamp;
}
/** 되돌리기: 만든 것은 치우고, 고친 것 · 지운 것은 사본으로 돌린다 */
export async function undoChange(undoId: string): Promise<boolean> {
  const list = await ledger(), r = list.find(x => x.id === undoId); if (!r) return false;
  const row = await DB.get('kv', 'gdundo:' + undoId) as { before?: Obj | null } | undefined;
  if (r.kind === 'settings') { if (!row?.before) return false; writeSettings(row.before); }
  else if (r.kind === 'vars') { if (!row?.before) return false; await restoreVars(row.before as unknown as VarsBefore); }
  else if (r.kind === 'ext') { if (!row?.before) return false; await restoreExt(r.targetId, row.before as unknown as ExtBefore); }
  else if (r.created) { if (current(r.kind, r.targetId)) await drop(r.kind, r.targetId); }
  else { if (!row?.before) return false; await put(r.kind, row.before); }
  await DB.del('kv', 'gdundo:' + undoId).catch(() => { });
  await saveLedger(list.filter(x => x.id !== undoId));
  return true;
}
/** 만든 자료의 id (적용된 만들기 카드에서 "열기"에 쓴다) */
export const targetOf = (ch: Change): string => ch.op.type === 'ext' ? ch.op.id : ch.op.type === 'vars' ? ch.op.chatId : ch.op.type === 'settings' ? 'settings' : ch.op.type === 'create' ? String(ch.op.obj.id || '') : ch.op.type === 'entry' || ch.op.type === 'entrydel' ? ch.op.loreId : ch.op.type === 'block' ? ch.op.presetId : ch.op.type === 'qritem' || ch.op.type === 'qrdel' ? ch.op.setId : ch.op.id;
