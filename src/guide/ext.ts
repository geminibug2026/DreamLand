// 등불지기가 만드는 확장: 드림랜드 확장(이 앱에 설치) · 실리태번 확장(zip 으로 건넨다). 모델에 줄 참고 글 · 점검 · zip · 설치와 되돌리기
// 드림랜드 확장 API 의 이름은 src/lib/ext.ts 의 makeApi 와 chatApi(CmdApi)에서 온다 — 아래 표가 그 꼴과 어긋나면 tsc 가 알려 준다
import { DB, S, download, emit } from '../lib/core';
import type { ExtApi } from '../lib/ext';
import type { CmdApi } from '../lib/hooks';
import { t } from '../i18n';
import { syntaxOf } from './syntax';

export type ExtTarget = 'dl' | 'st';
export type ExtFiles = Record<string, string>;
/** 매니페스트에서 읽은 것 (zip 의 폴더용 manifest.json · README 에 쓴다) */
export interface ExtMeta { version: string; author: string; description: string }
/** 변경 카드에 담기는 확장 한 판 */
export interface ExtOp { type: 'ext'; target: ExtTarget; id: string; name: string; main: string; files: ExtFiles; meta: ExtMeta }

// ── 드림랜드 확장이 받는 것 ── 키를 빠뜨리거나 없는 이름을 적으면 타입 검사에서 걸린다
const API: Record<keyof ExtApi, 1> = { id: 1, appVersion: 1, h: 1, icon: 1, btn: 1, iconBtn: 1, avatar: 1, toast: 1, modal: 1, menu: 1, form: 1, confirm: 1, prompt: 1, go: 1, render: 1, data: 1, store: 1, on: 1, command: 1, macro: 1, panel: 1, messageAction: 1, composerAction: 1, textFilter: 1, theme: 1, page: 1, style: 1, chat: 1, ai: 1 };
const CHAT: Record<keyof CmdApi, 1> = { current: 1, reveal: 1, roomName: 1, groupTitle: 1, generate: 1, send: 1, insert: 1, addSystemMessage: 1, save: 1, redraw: 1, setStatus: 1, scrollTo: 1, openDrawer: 1, push: 1, stop: 1, getInput: 1, setInput: 1 };
const SUB: Record<string, string[]> = { chat: Object.keys(CHAT), ai: Object.keys({ quick: 1, tokens: 1, macro: 1 } satisfies Record<keyof ExtApi['ai'], 1>), store: Object.keys({ get: 1, set: 1 } satisfies Record<keyof ExtApi['store'], 1>) };
/** 앱이 실제로 내보내는 이벤트 (emit 하는 곳: router · chat/actions · Chat 화면 · core.set · ext) */
const EVENTS = ['ready', 'route', 'chat:open', 'message:sent', 'message:received', 'prompt:ready', 'generate:start', 'generate:end', 'settings'];
const ICONS = 'home chat book sliders user code plug import upload gear plus x send stop edit trash copy refresh left right link merge mark branch eye eyeoff more lock star moon search dice panel play users lang volume feather check menu sparkle grip up down folder image clip note heart pause';

// ── 실리태번: 공개 문서에 적힌 것만 ── 여기 없는 이름은 막지 않고 "확인해 보라"고만 알린다
const ST_CTX = new Set(['chat', 'characters', 'characterId', 'groups', 'groupId', 'name1', 'name2', 'chatMetadata', 'saveMetadata', 'extensionSettings', 'saveSettingsDebounced', 'eventSource', 'event_types', 'eventTypes', 'getCurrentChatId', 'getRequestHeaders', 'renderExtensionTemplateAsync', 'callGenericPopup', 'POPUP_TYPE', 'POPUP_RESULT', 'Popup', 'SlashCommandParser', 'SlashCommand', 'SlashCommandArgument', 'SlashCommandNamedArgument', 'ARGUMENT_TYPE', 'substituteParams', 'writeExtensionField', 'registerMacro', 'generateQuietPrompt', 'generateRaw']);
const ST_EVENTS = new Set(['APP_READY', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'USER_MESSAGE_RENDERED', 'CHARACTER_MESSAGE_RENDERED', 'CHAT_CHANGED', 'CHAT_CREATED', 'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'GENERATION_AFTER_COMMANDS', 'SETTINGS_UPDATED', 'GROUP_UPDATED', 'WORLD_INFO_ACTIVATED']);
const ST_IMPORTS = new Set(['../../../extensions.js', '../../../../script.js', '../../../popup.js', '../../../utils.js', '../../../slash-commands/SlashCommandParser.js', '../../../slash-commands/SlashCommand.js', '../../../slash-commands/SlashCommandArgument.js']);
const ST_REQUIRED: [string, 's' | 'n' | 'a'][] = [['display_name', 's'], ['loading_order', 'n'], ['requires', 'a'], ['optional', 'a'], ['js', 's'], ['css', 's'], ['author', 's'], ['version', 's'], ['homePage', 's']];

/** 모델에 주는 참고 글 (영어). /확장 이 풀어 쓰는 글에 실리고, ext_reference 로도 읽는다 */
export function extRef(target: ExtTarget): string {
  if (target === 'dl') return `DREAMLAND EXTENSION — runs inside this app. One ES module file (index.js), no import statements (it is loaded from a single file, so imports cannot reach anything), no eval / new Function (blocked). Shape:
export const manifest = { id: 'date-stamp', name: 'Date stamp', version: '1.0.0', author: '…', description: '…' };   // plain string literals; id = lowercase letters, digits, dashes
export function activate(api) { /* register things */ return () => { /* optional: undo what api does not track (timers, DOM you added, listeners) */ }; }
Everything registered through api is removed by itself when the user turns the extension off. CSS: api.style(\`…\`) (also removed on turn-off). README.md may sit next to it.
api — the only names that exist:
- id, appVersion
- DOM: h(spec, props?, ...children) builds elements: spec 'div.cls#id'; props {onclick: fn, title, text, html, class, style: {…}, dataset: {…}, other attributes}. icon(name, size?) → svg (${ICONS}). btn(label, {ic, cls, onclick, title}) → button. iconBtn(ic, title, onclick, cls?). avatar(charOrPersona, cls?).
- Dialogs: toast(text, kind? 'ok'|'err'); modal({title, body: Node, actions: [{label, cls?: 'primary', onclick}], wide?}) → {close()}; menu(anchorEl, [{label, ic?, hint?, onclick}]); confirm(text, okLabel?, danger?) → Promise<boolean>; prompt(title, value?, {area?, placeholder?}) → Promise<string|null>; go(page, arg?) opens a screen (home, chat, lore, presets, regex, qr, exts, settings, or a page id from api.page).
- Registering: command(name, {help, args?, run(arg, chat)}) — /name in the chat box and in STscript; run gets the rest of the line as text and api.chat. macro(name, (args, ctx) => string) — {{name}} or {{name::a::b}}, args is an array of strings. composerAction({id, label, icon, run(textarea)}) — an item in the + menu beside the chat input; run gets the input textarea. messageAction({id, label, icon, run(msg, chat)}) — an item in each message's ⋯ menu. panel({id, title, icon, render(chat, msgs) → Node}) — a section in the chat's scene drawer (api.chat.openDrawer() opens it). textFilter((text, {role, msg, chat}) → text) — changes message text right before it is shown (display only, not saved). page({id, label, icon, render(root)}) → page id — a whole screen in the navigation. theme({id, name, tone: 'light'|'dark', c: {bg, bg2, surface, text, dim, accent, accent2, sayBg, sayText, userBg, userText, nar, think}}). style(css).
- Events: on(name, fn) — 'ready', 'route' (page name), 'chat:open' (chat), 'message:sent' ({msg, chat}), 'message:received' ({msg, chat}), 'prompt:ready' ({messages, chat, type}: change messages in place to change what is sent), 'generate:start' ({chat, type}), 'generate:end' ({chat, type}), 'settings' (changed settings).
- Saved data: await store.get(key, fallback) · await store.set(key, value) — kept per extension. data is the app store (read it: data.chars, data.settings …; do not write to it).
- Chat: chat.current() → {chat, msgs, busy}; chat.insert(text) appends to the input box and focuses it; chat.getInput(); chat.setInput(text) replaces it; chat.send(text) sends as the user; chat.generate(); chat.stop(); chat.addSystemMessage(text); chat.redraw(); chat.scrollTo(msgId); chat.reveal(msgId); chat.openDrawer(); chat.setStatus(text); chat.save().
- Model: await ai.quick(system, user) → text (one paid request on the helper connection — only when the user asked for it); ai.tokens(text) → number; ai.macro(text) fills {{char}} {{user}} and other macros.
A message: {id, role: 'user'|'assistant'|'system', name, swipes: [{text}], sw} — its text is msg.swipes[msg.sw].text. A chat: {id, name, charIds, vars}.
Colours follow the theme: var(--text), var(--dim), var(--bg), var(--surface), var(--surface2), var(--accent), var(--on-accent), var(--line), var(--ok), var(--bad); radius var(--r-xs). Tap targets at least 40px, nothing that only appears on hover, no fixed widths over 320px.
Files: index.js (+ README.md). The user presses Install on the card; it then shows in the Extensions screen where it can be turned off or deleted, and undo removes it. The zip holds the same folder plus a manifest.json for the app's extensions/ folder.`;
  return `SILLYTAVERN EXTENSION — runs in SillyTavern, not here. The card gives the user a zip with one folder <id>/ to put in SillyTavern.
Files:
- manifest.json: {"display_name": "…", "loading_order": 1, "requires": [], "optional": [], "js": "index.js", "css": "style.css", "author": "…", "version": "1.0.0", "homePage": ""}. You may leave it out — the app writes it from name, version, author and description. requires / optional are SillyTavern Extras modules: keep them empty.
- index.js: an ES module. Take what you need from the context instead of importing files by path (paths change with the install location):
  const { eventSource, event_types, extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
  Do the setup inside jQuery(async () => { … }).
- style.css (the app adds an empty one if you send none). settings.html (optional): load it with const html = await (await fetch(new URL('settings.html', import.meta.url))).text(); then $('#extensions_settings').append(html).
- README.md: what it does, how to use it, its settings, and install steps — unzip, copy the folder into SillyTavern's data/<user>/extensions/ (default user: data/default-user/extensions/), reload the page; or push the folder to a Git repository and paste its URL into Extensions › Install extension. Also list anything you are not sure works in every SillyTavern version.
Documented pieces you may use (they need a recent SillyTavern, 1.12 or newer — say so in README):
- Settings: const MODULE = '<id>'; const defaults = Object.freeze({ … }); if (!extensionSettings[MODULE]) extensionSettings[MODULE] = structuredClone(defaults); then copy any missing keys from defaults; after each change call saveSettingsDebounced().
- Settings drawer (SillyTavern opens and closes it by itself): <div class="<id>-settings"><div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>Title</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"> … </div></div></div> appended to #extensions_settings (or #extensions_settings2, the right column). Inputs: class text_pole for text boxes, label.checkbox_label around a checkbox, menu_button for buttons.
- Events: eventSource.on(event_types.X, handler) with X one of APP_READY, CHAT_CHANGED, MESSAGE_SENT, MESSAGE_RECEIVED, USER_MESSAGE_RENDERED, CHARACTER_MESSAGE_RENDERED, MESSAGE_EDITED, MESSAGE_DELETED, MESSAGE_SWIPED, GENERATION_STARTED, GENERATION_ENDED, GENERATION_STOPPED, SETTINGS_UPDATED. Message events pass the message index: SillyTavern.getContext().chat[index] has mes (text), name, is_user.
- Slash command: const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = SillyTavern.getContext();
  SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'mycmd', callback: (namedArgs, value) => { …; return ''; }, helpString: '…', unnamedArgumentList: [SlashCommandArgument.fromProps({ description: '…', typeList: [ARGUMENT_TYPE.STRING], isRequired: false })] })); the callback returns a string.
- Chat input: the box is #send_textarea — $('#send_textarea').val(text).trigger('input') (to append, read .val() first).
- A button in the wand menu beside the input: $('#extensionsMenu').append('<div id="<id>-btn" class="list-group-item flex-container flexGap5"><div class="fa-solid fa-calendar"></div><span>Label</span></div>'), then bind its click. Icons are Font Awesome 6 (fa-solid fa-…).
- Toasts: toastr.success(text) / toastr.info / toastr.error. Popup: const { callGenericPopup, POPUP_TYPE } = SillyTavern.getContext(); await callGenericPopup(html, POPUP_TYPE.TEXT).
- Context data: chat (messages), characters, characterId, name1 (user), name2 (character), getCurrentChatId().
Model calls (generateQuietPrompt, generateRaw) changed shape between versions: avoid them unless asked, and then say in README which form you used. Anything not listed here: use it only if you are sure it exists; otherwise leave it out and say in README.md what is untested and why — never invent an API.`;
}

// ── 파일 ──
const FILE_RE = /^[\w\-. ]+(\/[\w\-. ]+)?$/, KINDS = /\.(m?js|json|css|html?|md|txt)$/i;
/** 받은 파일 묶음을 고른다: 길 · 종류 · 크기. 틀리면 까닭 */
export function normFiles(raw: unknown): { files: ExtFiles; errors: string[] } {
  const errors: string[] = [], files: ExtFiles = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { files, errors: ['"files" must be an object of path → file text, e.g. {"index.js": "…"}.'] };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = k.trim().replace(/^\.?\/+/, '');
    if (!FILE_RE.test(p) || p.includes('..')) { errors.push(`Bad file path "${k}" (use names like index.js or assets/x.css, at most one folder deep).`); continue; }
    if (!KINDS.test(p)) { errors.push(`"${p}": only .js .json .css .html .md .txt files can be part of an extension.`); continue; }
    if (typeof v !== 'string') { errors.push(`"${p}" must be the file text (a string).`); continue; }
    if (v.length > 200_000) { errors.push(`"${p}" is too long (${v.length} chars; keep each file under 200,000).`); continue; }
    files[p] = v.replace(/\r\n?/g, '\n');
  }
  if (Object.keys(files).length > 12) errors.push('At most 12 files.');
  return { files, errors };
}
const ORDER = (p: string) => p === 'manifest.json' ? 0 : /\.m?js$/.test(p) ? 1 : /\.css$/.test(p) ? 2 : /\.html?$/.test(p) ? 3 : /\.json$/.test(p) ? 4 : 5;
/** 보여 줄 차례: manifest.json · 코드 · CSS · HTML · 글 */
export const fileOrder = (ps: string[]) => [...ps].sort((a, b) => ORDER(a) - ORDER(b) || a.localeCompare(b));
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/_/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
/** 바뀐 파일만 카드 칸으로 (전 → 후) */
export const fileFields = (before: ExtFiles, after: ExtFiles) => fileOrder([...new Set([...Object.keys(before), ...Object.keys(after)])]).filter(p => (before[p] ?? null) !== (after[p] ?? null)).map(p => ({ name: p, before: before[p] ?? '', after: after[p] ?? '' }));

/** 모듈 코드를 함수 몸으로 읽을 수 있게: import · export 를 걷고 import.meta 를 바꾼다 (줄 수는 그대로, 엄격 모드) */
export function moduleBody(code: string): string {
  const keep = (m: string) => m.replace(/[^\n]/g, '');
  return '"use strict";' + code
    .replace(/^[ \t]*import\s*(?:[\w$*{}\s,]+?\s*from\s*)?(['"])[^'"\n]*\1[ \t]*;?/gm, keep)
    .replace(/^[ \t]*export\s*\*\s*(?:as\s+[\w$]+\s*)?from\s*(['"])[^'"\n]*\1[ \t]*;?/gm, keep)
    .replace(/^[ \t]*export\s*\{[^}]*\}\s*(?:from\s*(['"])[^'"\n]*\1)?[ \t]*;?/gm, keep)
    .replace(/^([ \t]*)export\s+default\s+/gm, '$1const __default = ')
    .replace(/^([ \t]*)export\s+(?=(?:async\s+function|function|const|let|var|class)\b)/gm, '$1')
    .replace(/\bimport\.meta\b/g, '({url:""})');
}
/** 주석 · 문자열을 걷은 코드 (이름을 셀 때 글 속의 낱말에 걸리지 않게). 템플릿 글의 ${…} 안은 남긴다 */
function bare(code: string): string {
  let out = '', i = 0; const n = code.length, tpl: number[] = [];
  while (i < n) {
    const c = code[i], d = code[i + 1];
    if (tpl.length && c === '}' && tpl[tpl.length - 1] === 0) { tpl.pop(); i++; out += ' '; i = skipTpl(i); continue; }
    if (tpl.length && c === '{') tpl[tpl.length - 1]++; else if (tpl.length && c === '}') tpl[tpl.length - 1]--;
    if (c === '/' && d === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'") { i++; while (i < n && code[i] !== c && code[i] !== '\n') i += code[i] === '\\' ? 2 : 1; i++; out += '""'; continue; }
    if (c === '`') { i = skipTpl(i + 1); out += '""'; continue; }
    out += c; i++;
  }
  return out;
  function skipTpl(j: number): number { while (j < n) { if (code[j] === '\\') { j += 2; continue; } if (code[j] === '`') return j + 1; if (code[j] === '$' && code[j + 1] === '{') { tpl.push(0); return j + 2; } j++; } return n; }
}
/** `export const manifest = { … }` 의 낱값들 (글자 그대로 적힌 것만) */
function manifestOf(code: string): Record<string, string> | null {
  const m = /export\s+const\s+manifest\s*=\s*\{/.exec(code); if (!m) return null;
  let depth = 0, end = -1; for (let i = m.index + m[0].length - 1; i < code.length; i++) { const ch = code[i]; if (ch === '{') depth++; else if (ch === '}' && !--depth) { end = i; break; } }
  const body = code.slice(m.index + m[0].length, end < 0 ? undefined : end), out: Record<string, string> = {};
  for (const x of body.matchAll(/(?:^|[,{\s])["']?(\w+)["']?\s*:\s*(['"`])((?:\\.|(?!\2)[^\\\n])*)\2/g)) out[x[1]] = x[3];
  return out;
}
const readme = (target: ExtTarget, id: string, name: string, desc: string, main: string) => t(target === 'st' ? 'guide.ext.readme.st' : 'guide.ext.readme.dl', { name, id, desc: desc || name, file: main, exts: t('nav.exts'), install: t('exts.installFile') });

export interface ExtCheck { errors: string[]; warnings: string[]; files: ExtFiles; id: string; main: string; meta: ExtMeta; /** 앱이 채워 넣은 파일 */ added: string[] }
/** 확장 한 판을 점검한다: 문법 · 매니페스트 · 있는 API 만 쓰는지. errors 가 있으면 제안하지 않는다 */
export async function checkExt(target: ExtTarget, input: ExtFiles, o: { id?: string; name: string; version?: string; author?: string; description?: string }): Promise<ExtCheck> {
  const files = { ...input }, errors: string[] = [], warnings: string[] = [], added: string[] = [];
  const paths = Object.keys(files), js = paths.filter(p => /\.m?js$/.test(p));
  let id = slug(o.id || ''), main = '', meta: ExtMeta = { version: o.version || '1.0.0', author: o.author || '', description: o.description || '' };
  if (o.id && id !== o.id.trim()) warnings.push(`id "${o.id}" was turned into "${id}" (lowercase letters, digits and dashes only).`);
  if (target === 'dl') {
    const other = paths.filter(p => !/\.m?js$/.test(p) && !/\.(md|txt)$/i.test(p));
    if (other.length) errors.push(`${other.join(', ')}: a Dreamland extension is one JavaScript file (plus README.md). Put CSS in api.style(\`…\`) and build HTML with api.h(…) inside the JavaScript.`);
    if (js.length !== 1) errors.push(js.length ? `Several JavaScript files (${js.join(', ')}): a Dreamland extension is one file — merge them into index.js.` : 'No JavaScript file: send the code as "index.js".');
    main = js[0] || 'index.js';
    const code = files[main] || '';
    if (code) {
      const [err] = await syntaxOf([moduleBody(code)], 2500, true);
      if (err) errors.push(`${main}: syntax error — ${err}.`);
      const b = bare(code);
      if (/^[ \t]*import\b(?!\s*\()/m.test(b) || /\bimport\s*\(/.test(b)) errors.push(`${main}: no import statements — the extension is loaded from one file, so imports cannot reach anything. Put the code you need in this file.`);
      if (/\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/.test(b)) errors.push(`${main}: eval / new Function are blocked by the app's security policy.`);
      const man = manifestOf(code);
      if (!man) errors.push(`${main}: missing \`export const manifest = { id: '…', name: '…', version: '1.0.0', author: '…', description: '…' }\` (plain string values).`);
      else {
        for (const k of ['id', 'name', 'version']) if (!man[k]?.trim()) errors.push(`${main}: manifest.${k} is missing or not a plain string.`);
        if (man.id && !/^[a-z0-9][a-z0-9-]{1,47}$/.test(man.id)) errors.push(`${main}: manifest.id "${man.id}" must be 2-48 lowercase letters, digits or dashes.`);
        if (man.id && id && man.id !== id) errors.push(`${main}: manifest.id is "${man.id}" but the call says id "${id}". Use the same id in both.`);
        id ||= man.id || ''; meta = { version: man.version || meta.version, author: man.author ?? meta.author, description: man.description ?? meta.description };
      }
      if (!/export\s+(async\s+)?function\s+activate\b|export\s+(const|let)\s+activate\s*=|export\s+default\s*\{[\s\S]*\bactivate\b|export\s*\{[^}]*\bactivate\b/.test(code)) errors.push(`${main}: export a function named activate: \`export function activate(api) { … }\`.`);
      // 쓰는 API 이름: activate 의 첫 인자 이름(보통 api)으로 셈한다
      const pm = /activate\s*(?:=\s*(?:async\s*)?)?\(\s*([A-Za-z_$][\w$]*)/.exec(b) || /activate\s*=\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/.exec(b), P = pm?.[1] || 'api', esc = P.replace(/\$/g, '\\$');
      const used = new Set<string>(), bad = new Set<string>(), subBad = new Set<string>();
      for (const x of b.matchAll(new RegExp(`(?<![\\w$.])${esc}\\s*\\.\\s*([A-Za-z_$][\\w$]*)(?:\\s*\\.\\s*([A-Za-z_$][\\w$]*))?`, 'g'))) {
        const k = x[1]; used.add(k); if (!(k in API)) bad.add(k);
        else if (x[2] && SUB[k] && !SUB[k].includes(x[2])) subBad.add(`${k}.${x[2]}`);
      }
      for (const x of b.matchAll(new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${esc}\\b(?!\\s*\\.)`, 'g'))) for (const part of x[1].split(',')) { const k = part.split(/[:=]/)[0].trim().replace(/^\.\.\./, ''); if (k && !(k in API)) bad.add(k); else if (k) used.add(k); }
      if (bad.size) errors.push(`${main}: ${[...bad].map(k => `${P}.${k}`).join(', ')} ${bad.size > 1 ? 'do' : 'does'} not exist. Dreamland's extension api has only: ${Object.keys(API).join(', ')}.`);
      if (subBad.size) errors.push(`${main}: ${[...subBad].map(k => `${P}.${k}`).join(', ')} not found. ${[...new Set([...subBad].map(k => k.split('.')[0]))].map(k => `${P}.${k} has: ${SUB[k].join(', ')}`).join('; ')}.`);
      for (const x of code.matchAll(new RegExp(`(?<![\\w$.])${esc}\\s*\\.\\s*on\\s*\\(\\s*(['"\`])([^'"\`]+)\\1`, 'g'))) if (!EVENTS.includes(x[2])) warnings.push(`${P}.on('${x[2]}'): the app never sends this event. Events: ${EVENTS.join(', ')}.`);
      if (!used.size) warnings.push(`${main} never uses ${P} — it registers nothing the user can reach.`);
      if (/\bset(Interval|Timeout)\s*\(/.test(b) && /\bsetInterval\s*\(/.test(b) && !/\bclearInterval\s*\(/.test(b)) warnings.push(`${main}: setInterval is never cleared — return a cleanup function from activate that calls clearInterval, or it keeps running after the extension is turned off.`);
      if (/\b(document|window)\s*\.\s*addEventListener\s*\(/.test(b) && !/\bremoveEventListener\s*\(/.test(b)) warnings.push(`${main}: a document/window listener is never removed — remove it in the cleanup function activate returns.`);
      if (/\blocalStorage\b/.test(b)) warnings.push(`${main}: use ${P}.store.get / ${P}.store.set instead of localStorage (it is kept with the user's data and backups).`);
      if (/\binnerHTML\s*=/.test(b)) warnings.push(`${main}: innerHTML — build elements with ${P}.h(…) (or set text) so chat text cannot inject markup.`);
      if (/querySelector(All)?\s*\(\s*['"`][^'"`]*\.(composer|msg|chat-|gd-)/.test(code)) warnings.push(`${main}: reaches into the app's own markup by class name; that can change between versions. Prefer composerAction / messageAction / panel / chat.insert.`);
    }
    id ||= slug(o.name) || 'my-extension';
  } else {
    id ||= slug(o.name) || 'my-extension';
    // manifest.json: 없으면 앱이 쓴다. 있으면 칸마다 살핀다
    let man: Record<string, unknown> | null = null;
    if (files['manifest.json'] == null) {
      if (!js.length) errors.push('No JavaScript file: send the code as "index.js".');
      const entry = js.includes('index.js') ? 'index.js' : js[0] || 'index.js', css = paths.find(p => /\.css$/.test(p));
      if (!css) { files['style.css'] = `/* ${o.name} */\n`; added.push('style.css'); }
      man = { display_name: o.name, loading_order: 1, requires: [], optional: [], js: entry, css: css || 'style.css', author: meta.author || '', version: meta.version, homePage: '' };
      files['manifest.json'] = JSON.stringify(man, null, 2) + '\n'; added.push('manifest.json');
    } else {
      try { const v = JSON.parse(files['manifest.json']); if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object'); man = v as Record<string, unknown>; }
      catch (e) { errors.push(`manifest.json is not valid JSON (${(e as Error).message}).`); }
      if (man) {
        // 빠진 표준 칸은 기본값으로 채운다 (실리태번이 읽는 꼴 그대로). 꼴이 틀린 칸은 고치게 돌려준다
        const css = paths.find(p => /\.css$/.test(p)), fill: Record<string, unknown> = { loading_order: 1, requires: [], optional: [], js: js.includes('index.js') ? 'index.js' : js[0] || 'index.js', css: css || 'style.css', author: meta.author || '', version: meta.version, homePage: '' }, filled: string[] = [];
        if (man.display_name === undefined) errors.push('manifest.json: "display_name" is missing.');
        for (const [k, v] of Object.entries(fill)) if (man[k] === undefined) { man[k] = v; filled.push(k); }
        for (const [k, ty] of ST_REQUIRED) {
          const v = man[k];
          if (v === undefined) continue;
          if (ty === 's' && typeof v !== 'string') errors.push(`manifest.json: "${k}" must be a string.`);
          else if (ty === 'n' && typeof v !== 'number') errors.push(`manifest.json: "${k}" must be a number.`);
          else if (ty === 'a' && (!Array.isArray(v) || v.some(x => typeof x !== 'string'))) errors.push(`manifest.json: "${k}" must be an array of strings.`);
        }
        if (typeof man.display_name === 'string' && !man.display_name.trim()) errors.push('manifest.json: "display_name" is empty.');
        if (typeof man.js === 'string' && files[man.js] == null) errors.push(`manifest.json: "js" points to "${man.js}", which is not among the files.`);
        if (man.css === 'style.css' && files['style.css'] == null && filled.includes('css')) { files['style.css'] = `/* ${o.name} */\n`; added.push('style.css'); }
        else if (typeof man.css === 'string' && man.css && files[man.css] == null) errors.push(`manifest.json: "css" points to "${man.css}", which is not among the files.`);
        if (typeof man.version === 'string' && !/^\d+\.\d+(\.\d+)?/.test(man.version)) warnings.push(`manifest.json: version "${man.version}" is not like 1.0.0.`);
        if (filled.length) { files['manifest.json'] = JSON.stringify(man, null, 2) + '\n'; warnings.push(`manifest.json: the app filled in the missing standard fields ${filled.join(', ')}.`); }
        meta = { version: String(man.version ?? meta.version), author: String(man.author ?? meta.author), description: meta.description };
      }
    }
    main = typeof man?.js === 'string' ? man.js : js[0] || 'index.js';
    const codes = js.map(p => moduleBody(files[p])), res = await syntaxOf(codes, 2500, true);
    res.forEach((err, i) => { if (err) errors.push(`${js[i]}: syntax error — ${err}.`); });
    for (const p of paths.filter(x => /\.css$/.test(x))) { const s = files[p].replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/g, ''); const o2 = (s.match(/\{/g) || []).length, c2 = (s.match(/\}/g) || []).length; if (o2 !== c2) errors.push(`${p}: unbalanced braces (${o2} "{", ${c2} "}").`); }
    for (const p of paths.filter(x => /\.html?$/.test(x))) { if (/<script\b/i.test(files[p])) warnings.push(`${p}: keep scripts in index.js — inline <script> in settings HTML is easy to miss and hard to clean up.`); if (!js.some(j => files[j].includes(p))) warnings.push(`${p} is never loaded by the JavaScript (fetch(new URL('${p}', import.meta.url))).`); }
    for (const p of js) {
      const code = files[p], b = bare(code);
      for (const x of code.matchAll(/^[ \t]*import\s[^'"\n]*?from\s*(['"])([^'"\n]+)\1|^[ \t]*import\s*(['"])([^'"\n]+)\3/gm)) { const src = x[2] || x[4]; if (/^\.\.?\//.test(src) && files[src.replace(/^\.\//, '')] != null) continue; warnings.push(ST_IMPORTS.has(src) ? `${p}: import "${src}" depends on where SillyTavern puts the folder — SillyTavern.getContext() gives the same things without a path.` : `${p}: import "${src}" is not a documented SillyTavern module path; use SillyTavern.getContext() or say in README.md that this is untested.`); }
      if (/export\s+(async\s+)?function\s+activate\b/.test(code) && !/jQuery\s*\(|\$\s*\(\s*(async\s*)?(\(\s*\)|function)/.test(b)) warnings.push(`${p}: SillyTavern does not call activate(); run the setup at top level or inside jQuery(async () => { … }).`);
      if (/\bapi\s*\.\s*(composerAction|messageAction|textFilter|panel)\s*\(/.test(b)) errors.push(`${p}: api.composerAction / messageAction / panel / textFilter are Dreamland APIs; SillyTavern has no such object.`);
      for (const x of b.matchAll(/\{([^{}]*)\}\s*=\s*SillyTavern\s*\.\s*getContext\s*\(\s*\)/g)) for (const part of x[1].split(',')) { const k = part.split(/[:=]/)[0].trim(); if (k && !ST_CTX.has(k)) warnings.push(`${p}: getContext().${k} is not in the documented set used here — make sure it exists in the user's SillyTavern, or say so in README.md.`); }
      for (const x of b.matchAll(/getContext\s*\(\s*\)\s*\.\s*([A-Za-z_$][\w$]*)/g)) if (!ST_CTX.has(x[1])) warnings.push(`${p}: getContext().${x[1]} is not in the documented set used here — make sure it exists, or say so in README.md.`);
      for (const x of b.matchAll(/\bevent_types\s*\.\s*([A-Z_]+)/g)) if (!ST_EVENTS.has(x[1])) warnings.push(`${p}: event_types.${x[1]} is not a documented event — check the name.`);
      if (/\bextension_?[sS]ettings\b/.test(b) && /\]\s*\.\s*\w+\s*=[^=]|\]\s*\[[^\]]+\]\s*=[^=]/.test(b) && !/\bsaveSettingsDebounced\s*\(/.test(b)) warnings.push(`${p}: settings change but saveSettingsDebounced() is never called, so they are lost on reload.`);
    }
    if (files['README.md'] == null) { files['README.md'] = readme('st', id, o.name, meta.description, main); added.push('README.md'); }
    else if (!/extensions/i.test(files['README.md'])) warnings.push('README.md does not say how to install it (copy the folder into data/<user>/extensions/, or install from a Git URL).');
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)].slice(0, 12), files, id, main, meta, added };
}

/** zip 으로 받는다: <id>/… 한 폴더. 드림랜드 확장에는 폴더용 manifest.json · README.md 를 더한다 (앱의 extensions/ 폴더에 넣어도 돌게) */
export async function saveZip(op: ExtOp) {
  const { zip } = await import('../lib/assets'), enc = new TextEncoder(), out: ExtFiles = { ...op.files };
  if (op.target === 'dl') {
    out['manifest.json'] ??= JSON.stringify({ id: op.id, name: op.name, version: op.meta.version, author: op.meta.author, description: op.meta.description, main: op.main }, null, 2) + '\n';
    out['README.md'] ??= readme('dl', op.id, op.name, op.meta.description, op.main);
  }
  download(`${op.id}-${op.meta.version || '1.0.0'}.zip`, zip(fileOrder(Object.keys(out)).map(p => ({ name: `${op.id}/${p}`, data: enc.encode(out[p]) }))), 'application/zip');
}

// ── 이 앱에 설치 · 되돌리기 ── 사람이 「확장」 화면에서 코드를 넣는 것과 같은 길(install)로 넣는다: 켜고 끄기 · 지우기가 그대로 된다
export interface ExtBefore { row: Record<string, unknown> | null; on?: boolean }
/** 설치하고 켠다. 읽지 못하거나 켜다 실패하면 설치 전으로 돌리고 까닭을 던진다 */
export async function installExt(op: ExtOp): Promise<ExtBefore> {
  const E = await import('../lib/ext');
  const before: ExtBefore = { row: ((await DB.get('kv', 'ext:' + op.id)) as Record<string, unknown> | undefined) ?? null, on: S.settings.exts?.[op.id] };
  let item: Awaited<ReturnType<typeof E.install>>;
  try { item = await E.install(op.files[op.main], op.main, { ask: false }); }
  catch (e) { await restoreExt(op.id, before); throw e; }
  const err = !item ? 'not installed' : item.id !== op.id ? `the code's manifest id is "${item.id}", not "${op.id}"` : E.loaded.get(item.id)?.error;
  if (err) { if (item && item.id !== op.id) await restoreExt(item.id, { row: null }); await restoreExt(op.id, before); throw new Error(err); }
  return before;
}
/** 설치 전으로: 앞 판이 있었으면 그 코드와 켜짐을, 없었으면 지운다 (그 확장이 저장한 것도) */
export async function restoreExt(id: string, b: ExtBefore) {
  const E = await import('../lib/ext');
  E.unload(id);
  if (b.row) await DB.put('kv', b.row);
  else { await DB.del('kv', 'ext:' + id).catch(() => { }); if (!E.catalog.some(c => c.id === id && c.source === 'folder')) await DB.del('kv', 'extdata:' + id).catch(() => { }); }
  const exts = { ...(S.settings.exts || {}) }; if (b.on === undefined) delete exts[id]; else exts[id] = b.on; S.set({ exts });
  await E.readCatalog();
  const it = E.catalog.find(c => c.id === id); if (it && exts[id]) await E.setEnabled(it, true);
  emit('ext:changed');
}
/** 이미 같은 id 로 깔린 확장이 있으면 한 줄 */
export async function installedWarn(id: string): Promise<string | undefined> {
  const E = await import('../lib/ext'); await E.readCatalog().catch(() => []);
  const it = E.catalog.find(c => c.id === id);
  return it ? `An extension with id "${id}" (${it.name}) is already ${it.source === 'folder' ? 'in the app\'s extensions folder' : 'installed'}. Installing this card replaces it (undo brings it back). If the user did not mean to replace it, revise with another id.` : undefined;
}
/** target 이름을 받는다 */
export const extTarget = (v: unknown): ExtTarget | null => { const s = String(v ?? '').trim().toLowerCase(); return /^(dl|dreamland|드림랜드|梦境|梦乡)$/.test(s) ? 'dl' : /^(st|sillytavern|silly ?tavern|tavern|실리태번|酒馆)$/.test(s) ? 'st' : null; };

/** /확장 이 모델에 보내는 말: 무엇을 물을지 · 한 번에 만들기 · 참고 글 (고른 대상의 것, 안 골랐으면 둘 다 — 참고 글을 읽으러 한 번 더 부르지 않게) */
export function extAsk(rest: string, target: 'auto' | ExtTarget): string {
  const to = target === 'dl' ? 'Dreamland — this app; I will install it from the card' : target === 'st' ? 'SillyTavern — give me the zip; it will not run here' : 'not chosen — take it from my words (Dreamland unless I mention SillyTavern); if you really cannot tell, ask';
  const refs = target === 'auto' ? `${extRef('dl')}\n\n${extRef('st')}` : extRef(target);
  return `Help me build an extension (a plug-in). Target: ${to}.
${rest ? `What I want: ${rest}` : 'I have not said what it should do yet: ask me in one short message, with two or three example ideas that fit the target.'}
Settle first: what it does, where it shows up (Dreamland: an item in the + menu beside the chat input, a /command, an item in a message's ⋯ menu, a panel in the scene drawer, a screen; SillyTavern: a button in the wand menu, a slash command, a settings drawer), which settings it needs, and the target. Ask me only what my request leaves truly open — at most three short questions in one message, each with your suggested default — then stop. If nothing essential is open, do not ask: build it.
To build: two short lines on the design, then one create_extension call with every file and "end": true. No plan, no separate checks — the call checks syntax, the manifest and the API names and refuses with the exact problem; fix only that. Labels and messages in my language.
Later changes I ask for: revise_extension with small exact edits, not a new create_extension.
<extension_reference note="the real API; use nothing else">
${refs}
</extension_reference>`;
}
