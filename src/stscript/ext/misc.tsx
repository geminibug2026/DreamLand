// 실리태번 명령 묶음: misc — 로딩 표시 · 배경 · 겉모습 · 클립보드 · 배열 · 닫힌 블록 직렬화 · 파서 깃발 · 가져오기 · 퀵 리플라이 관리
import { t } from '../../i18n';
import { S } from '../../lib/core';
import { Assets } from '../../lib/assets';
import { allThemes, applyTheme, BUILTIN, currentTheme, newCustomTheme, themeName } from '../../lib/theme';
import { newQrItem, newQrSet, qrActive, qrSave, qrStore, setToStQr, type QrItem, type QrSet } from '../../lib/qr-data';
import { chatApi, drawMain, setDrawer, setSide } from '../../chat/actions';
import { cur } from '../../chat/store';
import { playChime, ux } from '../../features/usersettings';
import { openModal, toast } from '../../ui';
import { Icon } from '../../kit';
import { I } from '../../lib/icons';
import type { Theme } from '../../lib/types';
import { parse, type Closure } from '../parse';
import { Scope, callClosure, def, isBound, str, type Args, type Bound, type Ctx } from '../run';

// ════════ 도움 ════════
const N = (a: Args, k: string, d = '') => a.named[k] === undefined ? d : str(a.named[k]);
const has = (a: Args, k: string) => a.named[k] !== undefined;
const isTrue = (s: string) => ['on', 'true'].includes(s.trim().toLowerCase());
const isFalse = (s: string) => ['off', 'false'].includes(s.trim().toLowerCase());
const warn = (c: Ctx, key: string, slots?: Record<string, unknown>) => { c.host.echo(t('st.x.misc.' + key, slots), 'warning'); return ''; };
const fail = (key: string, slots?: Record<string, unknown>): never => { throw new Error(t('st.x.misc.' + key, slots)); };
const chatNow = () => chatApi.current().chat;
const needChat = () => chatNow() || fail('noChat');

// ════════ 로딩 표시 (/loader-*) ════════
// 드림랜드는 화면을 덮는 판 대신 대화창 아래 상태 줄에 글을 띄우고, 원하면 알림을 함께 낸다
interface Loader { id: string; message: string; onStop: Bound | null; onHide: Bound | null; c: Ctx }
const loaders = new Map<string, Loader>();
let loaderSeq = 0;
const refreshStatus = () => { const last = [...loaders.values()].pop(); chatApi.setStatus?.(last ? last.message : ''); };
const closureArg = (a: Args, k: string): Bound | null => { const v = a.named[k]; if (v === undefined) return null; if (!isBound(v)) { if (str(v).trim()) fail('notClosure', { name: k }); return null; } return v; };
function showLoader(a: Args, c: Ctx, slug: string): Loader {
  const message = N(a, 'message', t('st.x.misc.generating'));
  const L: Loader = { id: `${N(a, 'slug', slug)}-${++loaderSeq}`, message, onStop: closureArg(a, 'onStop'), onHide: closureArg(a, 'onHide'), c };
  loaders.set(L.id, L); refreshStatus();
  if (N(a, 'toast', 'stoppable') !== 'none') toast(N(a, 'title') ? `${N(a, 'title')} · ${message}` : message);
  return L;
}
async function hideLoader(L: Loader, runHide = true) {
  if (!loaders.delete(L.id)) return false;
  refreshStatus();
  if (runHide && L.onHide) { try { await callClosure(L.onHide, L.c); } catch (e) { console.warn('[STscript] onHide', e); } }
  return true;
}
async function stopLoader(L: Loader) {
  if (!loaders.has(L.id)) return false;
  if (L.onStop) { try { await callClosure(L.onStop, L.c); } catch (e) { console.warn('[STscript] onStop', e); } }
  else chatApi.stop?.();
  await hideLoader(L, false); return true;
}
def('loader-wrap', { help: '', run: async (a, c) => {
  const body = a.parts.find(isBound) as Bound | undefined; if (!body) fail('notClosure', { name: 'closure' });
  const L = showLoader(a, c, 'slash-wrap');
  try { return await callClosure(body as Bound, c); } finally { await hideLoader(L); }
} });
def('loader-show', { help: '', noPipe: true, run: (a, c) => showLoader(a, c, 'slash-show').id });
def('loader-hide', { help: '', noPipe: true, run: async a => {
  const id = N(a, 'handle').trim();
  if (id) { const L = loaders.get(id); return L ? String(await hideLoader(L)) : 'false'; }
  if (!loaders.size) return 'false';
  for (const L of [...loaders.values()]) await hideLoader(L);
  return 'true';
} });
def('loader-stop', { help: '', noPipe: true, run: async (a, c) => {
  const id = N(a, 'handle').trim(); if (!id) { warn(c, 'noHandle'); return 'false'; }
  const L = loaders.get(id); return L ? String(await stopLoader(L)) : 'false';
} });

// ════════ 배경 ════════
// 실리태번의 배경 목록 → 이 대화의 캐릭터 · 페르소나 · 대화 에셋. 배경은 원래 대화마다 따로 저장된다 (chat.bg)
const ownersOf = (chat: NonNullable<ReturnType<typeof chatNow>>) => [Assets.ownerOfChat(chat.id), ...chat.charIds.map(Assets.ownerOfChar), Assets.ownerOfPersona(S.persona(chat)?.id || '')];
const isUrl = (s: string) => /^(https?:|data:|blob:|\/|\.\/)/i.test(s.trim());
async function bgAssets(chat: NonNullable<ReturnType<typeof chatNow>>) { const os = ownersOf(chat); await Assets.load(os); return os.flatMap(o => Assets.active(o)); }
async function setBg(chat: NonNullable<ReturnType<typeof chatNow>>, url: string) { chat.bg = url; await S.save('chats', chat, true); drawMain(); }
async function bgName(chat: NonNullable<ReturnType<typeof chatNow>>) {
  const bg = String(chat.bg || ''); if (!bg) return '';
  const hit = (await bgAssets(chat)).find(x => x.data === bg); if (hit) return hit.name;
  return bg.startsWith('data:') ? t('st.x.misc.customBg') : bg;
}
def('bg', { help: '', alias: ['background'], run: async (a, c) => {
  const chat = needChat(); const arg = str(a.unnamed).trim();
  if (!arg) return bgName(chat);
  if (isUrl(arg)) { await setBg(chat, arg); return ''; }
  const list = await bgAssets(chat), k = arg.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  const pick = list.find(x => x.name.toLowerCase() === k) || list.find(x => x.name.toLowerCase().startsWith(k)) || list.find(x => x.name.toLowerCase().includes(k));
  if (!pick) return warn(c, 'noBg', { name: arg });
  await setBg(chat, pick.data); return '';
} });
def('lockbg', { help: '', alias: ['bglock'], run: async () => {
  const chat = needChat();
  // 대화 배경은 늘 이 대화에 묶여 있다. 비어 있으면 지금 테마의 배경 그림을 이 대화에 고정한다
  if (!chat.bg && currentTheme().bgImage) await setBg(chat, currentTheme().bgImage as string);
  toast(t('st.x.misc.bgLocked')); return '';
} });
def('unlockbg', { help: '', alias: ['bgunlock'], run: async () => {
  const chat = needChat(); if (chat.bg) await setBg(chat, '');
  toast(t('st.x.misc.bgUnlocked')); return '';
} });
def('autobg', { help: '', alias: ['bgauto'], run: async (_a, c) => {
  const chat = needChat(); const list = await bgAssets(chat);
  if (!list.length) return warn(c, 'noBgList');
  const names = [...new Set(list.map(x => x.name))];
  const gen = c.host.gen as ((p: string, o: object) => Promise<string>) | undefined;
  if (!gen) return warn(c, 'noGen');
  const reply = String(await gen(`Pick the background image that best fits the current scene of this chat. Reply ONLY with one name from this list, nothing else:\n${names.join('\n')}`, {})).trim().toLowerCase();
  const pick = list.find(x => x.name.toLowerCase() === reply) || list.find(x => reply.includes(x.name.toLowerCase())) || list.find(x => x.name.toLowerCase().includes(reply));
  if (!pick) return warn(c, 'noBg', { name: reply });
  await setBg(chat, pick.data); return '';
} });

// ════════ 겉모습 (드림랜드 테마 안에서) ════════
const setTheme = (id: string) => { S.set({ theme: id }); applyTheme(); };
def('theme', { help: '', run: (a, c) => {
  const name = str(a.unnamed).trim();
  if (!name) return themeName(currentTheme());
  const k = name.toLowerCase(), list = allThemes();
  const th = list.find(x => x.id.toLowerCase() === k || themeName(x).toLowerCase() === k || String(x.name).toLowerCase() === k)
    || list.find(x => themeName(x).toLowerCase().includes(k) || String(x.name).toLowerCase().includes(k));
  if (!th) return warn(c, 'noTheme', { name });
  setTheme(th.id); return '';
} });
const lum = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const mix = (a: string, b: string, k: number) => { const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const [x, y] = [p(a), p(b)]; return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const avgColor = (url: string) => new Promise<string>((res, rej) => {
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => { try { const cv = document.createElement('canvas'); cv.width = cv.height = 24; const g = cv.getContext('2d')!; g.drawImage(img, 0, 0, 24, 24); const d = g.getImageData(0, 0, 24, 24).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; res('#' + [r, gg, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('')); } catch (e) { rej(e); } };
  img.onerror = () => rej(new Error('image')); img.src = url;
});
// 배경 그림의 평균 색으로 드림랜드 테마를 하나 만든다 (기본 테마의 틀 · 대비는 그대로, 색만 물들인다)
def('bgcol', { help: '', run: async (a, c) => {
  const chat = chatNow();
  let url = chat?.bg || currentTheme().bgImage || '';
  if (has(a, 'bg')) { const want = N(a, 'bg').trim(); if (isUrl(want)) url = want; else if (chat) { const k = want.toLowerCase(); const hit = (await bgAssets(chat)).find(x => x.name.toLowerCase().includes(k)); if (hit) url = hit.data; else return warn(c, 'noBg', { name: want }); } }
  if (!url) return warn(c, 'noBgImage');
  let col: string; try { col = await avgColor(url); } catch { return warn(c, 'bgcolFail'); }
  const name = N(a, 'name') || `bgcol - ${chat ? (await bgName(chat)) || 'bg' : 'bg'}`;
  const st = S.settings as unknown as { customThemes?: Theme[] };
  const mine = st.customThemes || [];
  const old = mine.find(x => x.name === name);
  if (old && !isTrue(N(a, 'force', 'false'))) { setTheme(old.id); return ''; }
  const dark = lum(col) < 0.5, base = BUILTIN.find(x => x.id === (dark ? 'nocturne' : 'moonpress'))!;
  const th = newCustomTheme(base); th.name = name; if (old) th.id = old.id;
  const k = th.c as Record<string, string>;
  k.bg = mix(k.bg, col, 0.18); k.bg2 = mix(k.bg2 || k.bg, col, 0.28); k.surface = mix(k.surface, col, 0.08); k.sayBg = mix(k.sayBg || k.surface, col, 0.1);
  k.accent = mix(col, dark ? '#ffffff' : '#000000', 0.15); k.accent2 = k.accent; k.userBg = k.accent; k.userText = lum(k.accent) > 0.6 ? '#1b1b1f' : '#ffffff';
  S.set({ customThemes: [...mine.filter(x => x.id !== th.id), th], theme: th.id }); applyTheme();
  return '';
} });
// CSS 변수는 대화 화면의 요소에만 (테마 전체는 건드리지 않는다). 저장되지 않는다
const CSS_TARGET: Record<string, string> = { chat: '.chat-main', background: '.chat-main', gallery: '.modal', zoomedAvatar: '.modal' };
def('css-var', { help: '', run: (a, c) => {
  const to = N(a, 'to', 'chat'), sel = CSS_TARGET[to], name = N(a, 'varname').trim();
  if (!sel) return warn(c, 'cssBadTarget', { to });
  if (!name) return warn(c, 'cssNoName');
  if (!name.startsWith('--')) return warn(c, 'cssDash');
  const els = document.querySelectorAll<HTMLElement>(sel);
  if (!els.length) return warn(c, 'cssNoEl', { to });
  els.forEach(el => el.style.setProperty(name, str(a.unnamed)));
  return '';
} });
def('movingui', { help: '', run: (_a, c) => warn(c, 'noMovingUi') });
def('resetpanels', { help: '', alias: ['resetui'], run: () => {
  for (const el of document.querySelectorAll<HTMLElement>('.chat-main')) el.removeAttribute('style');
  setDrawer(false); setSide(window.innerWidth > 900); drawMain();
  return '';
} });
def('panels', { help: '', alias: ['togglepanels'], run: () => { setDrawer(!cur.drawer); return ''; } });

// ════════ 기기 · 소리 · 클립보드 ════════
def('pick-icon', { help: '', noPipe: true, run: () => new Promise<string>(res => {
  let done = false;
  const m = openModal({ title: t('st.x.misc.pickIcon'), onClose: () => { if (!done) res('false'); },
    body: <div className="row wrap">{Object.keys(I).map(n => <button key={n} type="button" className="ibtn" title={n} aria-label={n} onClick={() => { done = true; res(n); m.close(); }}><Icon name={n} /></button>)}</div> });
}) });
def('is-mobile', { help: '', noPipe: true, run: () => String(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820)) });
def('clipboard-get', { help: '', noPipe: true, run: async (_a, c) => {
  if (!navigator.clipboard) return warn(c, 'noClipboard');
  try { return await navigator.clipboard.readText(); } catch { return warn(c, 'clipReadFail'); }
} });
def('clipboard-set', { help: '', run: async (a, c) => {
  try { await navigator.clipboard.writeText(str(a.unnamed)); } catch { return warn(c, 'clipWriteFail'); }
  return '';
} });
def('beep', { help: '', alias: ['ding'], noPipe: true, run: () => { playChime(ux().soundVolume || 60); return ''; } });

// ════════ 배열 ════════
def('array-wrap', { help: '', alias: ['list-wrap'], run: a => {
  if (isBound(a.unnamed)) fail('closureArray', { name: 'array-wrap' });
  const value = str(a.unnamed);
  if (value === '') return '[]';
  try {
    const p = JSON.parse(value);
    if (Array.isArray(p)) return value;
    if (p && typeof p === 'object') return JSON.stringify([p]);
    if (isFalse(N(a, 'stringify', 'true'))) return JSON.stringify([p]);
    return JSON.stringify([value]);
  } catch { return JSON.stringify([value]); }
} });
def('array-unwrap', { help: '', alias: ['list-unwrap'], run: a => {
  if (isBound(a.unnamed)) fail('closureArray', { name: 'array-unwrap' });
  const value = str(a.unnamed);
  try {
    const p = JSON.parse(value);
    if (!Array.isArray(p)) return value;
    const v = p[0]; if (v == null) return '';
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  } catch { return value; }
} });

// ════════ 닫힌 블록 · 파서 ════════
const closureFrom = (text: string): Closure | null => { const s = text.trim(); const src = s.startsWith('{:') ? s : `{: ${s} :}`; const p = parse('/pass ' + src)[0]?.unnamed.find(x => typeof x === 'object'); return p && typeof p === 'object' ? p : null; };
def('closure-serialize', { help: '', run: a => {
  const b = a.parts.find(isBound) as Bound | undefined; if (!b) fail('notClosure', { name: 'closure' });
  return (b as Bound).closure.src;
} });
def('closure-deserialize', { help: '', run: (a, c) => {
  if (isBound(a.unnamed)) return a.unnamed;
  const cl = closureFrom(str(a.unnamed)); if (!cl) fail('badClosure');
  return { kind: 'bound', closure: cl as Closure, scope: c.scope } as Bound;
} });
// 드림랜드 파서는 실리태번의 두 깃발(엄격한 이스케이프 · getvar 바꾸기)을 늘 같은 방식으로 다룬다 — 받아 두기만 한다
const FLAGS = new Set(['STRICT_ESCAPING', 'REPLACE_GETVAR']);
def('parser-flag', { help: '', run: (a, c) => { const [flag] = str(a.unnamed).trim().split(/\s+/); if (flag && !FLAGS.has(flag.toUpperCase())) warn(c, 'badFlag', { flag }); return ''; } });
// 퀵 리플라이 편집기의 디버거가 없으므로 그냥 지나간다
def('breakpoint', { help: '', run: () => undefined });

// /import from=세트.버튼 이름 [as 새이름] … — 그 버튼 스크립트의 맨 위 /let · /var 로 담은 닫힌 블록을 지금 범위로 가져온다
def('import', { help: '', run: (a, c) => {
  const from = N(a, 'from').trim(); if (!from) fail('importNoFrom');
  const words = str(a.unnamed).trim().split(/\s+/).filter(Boolean); if (!words.length) fail('importNoWhat');
  let text: string | null = null;
  const chat = chatNow(), sets = [...qrActive(chat), ...qrStore().sets];
  for (const s of sets) { const it = s.items.find(i => i.label === from); if (it) { text = it.text; break; } }
  if (text == null) { const [setName, ...rest] = from.split('.'); const s = qrStore().sets.find(x => x.name === setName); const it = s?.items.find(i => i.label === rest.join('.')); if (it) text = it.text; }
  if (text == null) fail('importNoQr', { name: from });
  const lib = new Scope(null), found = new Map<string, Bound>();
  for (const cmd of parse(text as string)) {
    if (cmd.name !== 'let' && cmd.name !== 'var') continue;
    const cl = cmd.unnamed.find(x => typeof x === 'object') as Closure | undefined; if (!cl) continue;
    const keyV = cmd.named.key;
    const key = keyV ? keyV.map(x => typeof x === 'string' ? x : '').join('').trim() : String(cmd.unnamed.find(x => typeof x === 'string' && x.trim()) || '').trim().split(/\s+/)[0];
    if (!key) continue;
    const b: Bound = { kind: 'bound', closure: cl, scope: lib }; lib.let(key, b); found.set(key, b);
  }
  for (let i = 0; i < words.length; i++) {
    const src = words[i]; let dst = src;
    if (i + 2 < words.length && words[i + 1] === 'as') { dst = words[i + 2]; i += 2; }
    const pick = found.get(src); if (!pick) fail('importNoClosure', { name: src, from });
    if (c.scope.has(dst)) c.scope.set(dst, pick as Bound); else c.scope.let(dst, pick as Bound);
  }
  return '';
} });

// ════════ 퀵 리플라이 관리 ════════
// 드림랜드 세트 = 실리태번 QR 세트. 실리태번의 숫자 id 는 세트 안의 순번(1 부터)으로 본다. 드림랜드 버튼 id 도 받는다
type StSetOpt = { nosend?: boolean; before?: boolean; inject?: boolean };
type QrItemX = QrItem & { contextList?: { set: string; isChained: boolean }[]; showLabel?: boolean };
const setOf = (name: string) => { const s = qrStore().sets.find(x => x.name === name); return s || fail('noSet', { name }); };
function itemOf(set: QrSet, a: Args, label = ''): { it: QrItemX; idx: number } {
  const id = N(a, 'id').trim(); const lb = N(a, 'label', label);
  let idx = -1;
  if (id) { const n = Number(id); idx = Number.isInteger(n) && n >= 1 && n <= set.items.length ? n - 1 : set.items.findIndex(i => i.id === id); }
  else if (lb) idx = set.items.findIndex(i => i.label === lb);
  if (idx < 0) fail('noQr', { label: id || lb, set: set.name });
  return { it: set.items[idx] as QrItemX, idx };
}
const kindFor = (set: QrSet, text: string): QrItem['kind'] => /^\s*\//.test(text) ? 'script' : (set as QrSet & StSetOpt).nosend ? 'insert' : 'send';
const bool = (a: Args, k: string) => has(a, k) ? isTrue(N(a, k)) : undefined;
function applyQrArgs(it: QrItemX, a: Args) {
  if (has(a, 'icon')) it.stIcon = N(a, 'icon');
  if (has(a, 'showlabel')) it.showLabel = isTrue(N(a, 'showlabel'));
  if (has(a, 'title')) it.title = N(a, 'title');
  if (has(a, 'hidden')) it.hidden = isTrue(N(a, 'hidden'));
  if (has(a, 'automationId')) it.automationId = N(a, 'automationId');
  const map: [string, keyof QrItem['auto']][] = [['startup', 'start'], ['user', 'user'], ['bot', 'ai'], ['load', 'open'], ['new', 'newChat'], ['generation', 'gen']];
  for (const [k, f] of map) { const v = bool(a, k); if (v !== undefined) it.auto = { ...it.auto, [f]: v }; }
}
def('qrset', { help: '', run: (_a, c) => warn(c, 'qrsetDeprecated') });
def('qr-set-list', { help: '', run: a => {
  const src = str(a.unnamed).trim() || 'all', sets = qrStore().sets;
  const list = src === 'global' ? sets.filter(s => s.on !== false && s.scope === 'global') : src === 'chat' ? qrActive(chatNow()).filter(s => s.scope !== 'global') : sets;
  return JSON.stringify(list.map(s => s.name));
} });
def('qr-list', { help: '', run: a => JSON.stringify(setOf(str(a.unnamed).trim()).items.map(i => i.label)) });
def('qr-create', { help: '', run: (a, c) => {
  try {
    const set = setOf(N(a, 'set')), label = N(a, 'label'), text = str(a.unnamed);
    if (label && set.items.some(i => i.label === label)) fail('qrExists', { label, set: set.name });
    const it = newQrItem({ label, text, kind: kindFor(set, text) }) as QrItemX;
    applyQrArgs(it, a); set.items.push(it); qrSave();
  } catch (e) { c.host.echo((e as Error).message, 'error'); }
  return '';
} });
def('qr-get', { help: '', noPipe: true, run: (a, c) => {
  if (!has(a, 'id') && !has(a, 'label')) return warn(c, 'qrNeedId');
  try {
    const set = setOf(N(a, 'set')), { it, idx } = itemOf(set, a);
    const j = setToStQr(set).qrList[idx];
    return JSON.stringify({ ...j, showLabel: it.showLabel ?? j.showLabel, contextList: it.contextList || [], set: set.name });
  } catch (e) { c.host.echo((e as Error).message, 'error'); return ''; }
} });
def('qr-update', { help: '', run: (a, c) => {
  try {
    const set = setOf(N(a, 'set')), { it } = itemOf(set, a);
    if (has(a, 'newlabel')) it.label = N(a, 'newlabel');
    const text = a.given ? str(a.unnamed) : '';
    if (text.trim()) { it.text = text; it.kind = kindFor(set, text); }
    applyQrArgs(it, a); qrSave();
  } catch (e) { c.host.echo((e as Error).message, 'error'); }
  return '';
} });
def('qr-delete', { help: '', run: (a, c) => {
  try { const set = setOf(N(a, 'set')), { idx } = itemOf(set, a, str(a.unnamed).trim()); set.items.splice(idx, 1); qrSave(); }
  catch (e) { c.host.echo((e as Error).message, 'error'); }
  return '';
} });
// 오른쪽 클릭 메뉴(contextList)는 드림랜드 버튼 화면에 아직 없어 버튼 자료에만 적어 둔다 (내보내기 · /qr-get 에서 보인다)
def('qr-contextadd', { help: '', run: (a, c) => {
  try {
    const set = setOf(N(a, 'set')), { it } = itemOf(set, a), name = str(a.unnamed).trim(); setOf(name);
    const list = (it.contextList ||= []).filter(x => x.set !== name); list.push({ set: name, isChained: isTrue(N(a, 'chain', 'false')) }); it.contextList = list; qrSave();
  } catch (e) { c.host.echo((e as Error).message, 'error'); }
  return '';
} });
def('qr-contextdel', { help: '', run: (a, c) => {
  try { const set = setOf(N(a, 'set')), { it } = itemOf(set, a), name = str(a.unnamed).trim(); it.contextList = (it.contextList || []).filter(x => x.set !== name); qrSave(); }
  catch (e) { c.host.echo((e as Error).message, 'error'); }
  return '';
} });
def('qr-contextclear', { help: '', run: (a, c) => {
  try { const set = setOf(N(a, 'set')), { it } = itemOf(set, a, str(a.unnamed).trim()); it.contextList = []; qrSave(); }
  catch (e) { c.host.echo((e as Error).message, 'error'); }
  return '';
} });
const setOpts = (s: QrSet & StSetOpt, a: Args, reset: boolean) => {
  for (const k of ['nosend', 'before', 'inject'] as const) { const v = bool(a, k); if (v !== undefined) s[k] = v; else if (reset) s[k] = false; }
  // nosend 는 드림랜드의 버튼 종류로 옮긴다: 명령이 아닌 버튼은 끄면 "보내기", 켜면 "입력창에 넣기"
  if (has(a, 'nosend')) for (const it of s.items) if (it.kind !== 'script') it.kind = s.nosend ? 'insert' : 'send';
};
def('qr-set-create', { help: '', alias: ['qr-presetadd'], run: (a, c) => {
  const name = (N(a, 'name') || str(a.unnamed)).trim(); if (!name) return warn(c, 'noSetName');
  const q = qrStore(); let s = q.sets.find(x => x.name === name);
  if (!s) { s = newQrSet({ name }); q.sets.push(s); }
  setOpts(s, a, true); qrSave(); return '';
} });
def('qr-set-update', { help: '', alias: ['qr-presetupdate'], run: (a, c) => {
  try { const s = setOf((N(a, 'name') || str(a.unnamed)).trim()); setOpts(s, a, false); if (has(a, 'enabled')) s.on = isTrue(N(a, 'enabled')); qrSave(); }
  catch (e) { c.host.echo((e as Error).message, 'error'); }
  return '';
} });
def('qr-set-delete', { help: '', alias: ['qr-presetdelete'], run: (a, c) => {
  try { const q = qrStore(), s = setOf(str(a.unnamed).trim()); q.sets = q.sets.filter(x => x !== s); qrSave(); }
  catch (e) { c.host.echo((e as Error).message, 'error'); }
  return '';
} });
// /qr-arg 이름 값 — {{arg::이름}} 의 기본값 (넘겨받은 값이 있으면 그것이 이긴다)
// 넘겨받은 값은 범위에 담겨 있으므로 (runScript · callNamed 의 args), 범위에 없을 때만 담는다
def('qr-arg', { help: '', run: (a, c) => {
  const m = /^(\S+)\s*([\s\S]*)$/.exec(str(a.unnamed).trim()); if (!m) fail('qrArgNoName');
  const [, key, value] = m as RegExpExecArray;
  if (!key.includes('*') && !c.scope.has(key)) c.scope.let(key, value);
  return '';
} });
