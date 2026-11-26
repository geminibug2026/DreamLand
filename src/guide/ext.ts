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
const ST_CTX = new Set(['chat', 'characters', 'characterId', 'groups', 'groupId', 'name1', 'name2', 'chatMetadata', 'saveMetadata', 'extensionSettings', 'saveSettingsDebounced', 'eventSource', 'event_types', 'eventTypes', 'getCurrentChatId', 'getRequestHeaders', 'renderExtensionTemplateAsync', 'callGenericPopup', 'POPUP_TYPE', 'POPUP_RESULT', 'Popup', 'SlashCommandParser', 'SlashCommand', 'SlashCommandArgument', 'SlashCommandNamedArgument', 'ARGUMENT_TYPE', 'substituteParams', 'writeExtensionField', 'registerMacro', 'generateQuietPrompt', 'generateRaw', 'ConnectionManagerRequestService', 'saveChat', 'updateMessageBlock', 'isMobile', 'getCurrentLocale', 'setExtensionPrompt']);
const ST_EVENTS = new Set(['APP_READY', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'USER_MESSAGE_RENDERED', 'CHARACTER_MESSAGE_RENDERED', 'CHAT_CHANGED', 'CHAT_CREATED', 'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'GENERATION_AFTER_COMMANDS', 'SETTINGS_UPDATED', 'GROUP_UPDATED', 'WORLD_INFO_ACTIVATED', 'CONNECTION_PROFILE_LOADED', 'MESSAGE_UPDATED']);
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
- Model: await ai.quick(system, user) → text (one paid request on the user's helper connection — only when the user asked for it; it already has the key and address, so never ask for an API key, URL or proxy); ai.tokens(text) → number; ai.macro(text) fills {{char}} {{user}} and other macros.
A message: {id, role: 'user'|'assistant'|'system', name, swipes: [{text}], sw} — its text is msg.swipes[msg.sw].text. A chat: {id, name, charIds, vars}.
Colours follow the theme: var(--text), var(--dim), var(--bg), var(--surface), var(--surface2), var(--accent), var(--on-accent), var(--line), var(--ok), var(--bad); radius var(--r-xs). Tap targets at least 40px, nothing that only appears on hover, no fixed widths over 320px.
BUILD IT LIKE A BUILT-IN FEATURE:
- Shape of index.js: manifest; constants and defaults; load settings with store.get and fill missing keys from defaults; small render functions that build UI from state; the event wiring; one cleanup for timers and outside listeners. Prefix every class with the extension id.
- Labels in the user's language: api.data.settings.lang is 'ko', 'en' or 'zh-CN' — keep a tiny label table and pick from it.
- Per-chat state: store.get(chat.id + ':state') — never one global value for something that belongs to a chat.
- Put context into the prompt like the app's own features do: on('prompt:ready', ({ messages, chat, type }) => { … }) and splice one short { role: 'system', content } in front of the last user message. Keep it a few lines, only when it is switched on and relevant, and never touch other messages.
- Background model work like Memoria: on('message:received', ({ msg, chat }) => …) then ai.quick(system, user) once per message, with an in-flight guard and a short debounce; save the result keyed by msg.id, show progress with chat.setStatus and clear it in finally. Only when the user turned it on: it is paid.
- Panels that stay current: panel({ id, title, icon, render(chat, msgs) }) — keep the node you return, and when your data changes rebuild its children from state (replaceChildren) instead of waiting for the drawer to redraw.
- Per-message tools: messageAction({ id, label, icon, run(msg, chat) }) opens a modal or does the job; show the result with textFilter (fast, pure, cached — never call a model inside it).
- Composer helpers: composerAction({ id, label, icon, run(textarea) }) for things that write into the input box.
- Commands and macros: command('name', { help, run(arg, chat) }) for scripts and power users; macro('name', (args, ctx) => text) so cards, lorebooks and presets can use {{name::a::b}} live values.
- A full settings or dashboard screen: page({ id, label, icon, render(root) }) built with form(…) and h(…); link to it from the panel.
- RECIPE tracker: settings toggle → per-chat state → prompt:ready injects the current state → message:received asks ai.quick for the new state as JSON (validate it, keep the old one on failure) → panel shows it with what changed.
- RECIPE per-message translator or rewriter: messageAction runs ai.quick, saves under chat.id:msg.id with msg.sw and a text hash, textFilter shows the saved version when it still matches, a toggle shows the original.
- Lively like an app (old → new values, ticking steps for background work, skeletons while waiting, pops for events, all short and switched off under reduced motion): read playbook "motion".
QUALITY (check every point before sending):
- Phone first (360px wide): rows are display:flex; flex-wrap:wrap; gap:8px; an input beside a button gets flex:1 1 auto; min-width:0; buttons come from btn / iconBtn (they never wrap their label) and never shrink below their label (flex:0 0 auto).
- One value, one home: a setting is stored once; a free-form box (extra JSON) never repeats a key that has its own field; if two can overlap, apply the free-form one first and the dedicated field last, and say so in README.
- Per-message data is keyed by the message's id, never by its position in msgs (positions shift on delete; regenerate and swipe reuse the position): store.set(chat.id + ':' + msg.id, { …, sw: msg.sw, src: shortHash(text) }) and treat it as stale when sw or the text changed. Show other text without changing what is sent with textFilter.
- What you add to the chat view is redrawn by the app: use messageAction / panel / textFilter / composerAction instead of reaching into the page; re-check on 'chat:open'.
- Live updates: build each list, count and empty state from the data with a render function; after every change save, then re-render every open part that shows it (the open modal's body, a panel, a message badge) so nothing needs closing and reopening. After adding: clear and refocus the input, show the new row highlighted.
- One request at a time per message; show progress and always clear it; catch errors and toast a plain fix.
DESIGN: default is the app's own look (btn, iconBtn, theme variables). When the user asks for something prettier or describes a style, design from a concept: one real object or medium that fits the job (e-book page, cinema ticket, newspaper or magazine, porcelain, letter paper, scrapbook, index card, receipt, diary, terminal, game HUD, night sky, archive ledger); if vague, propose two or three in one line each. Turn it into a small system used everywhere: palette, shape (radius, line weight, double rules), type scale (optional monospace for labels and numbers), CSS-only ornaments (perforated dashed edges, barcode with repeating-linear-gradient, crescent with an inset box-shadow, drop cap, stamp) and a layout pattern (masthead, stub, card, stat strip). Colours either from the theme (--x-ink: var(--text); --x-line: var(--line); --x-soft: var(--surface2); --x-accent: var(--accent); --x-accent-ink: var(--accent-ink, var(--accent)); --x-tint: color-mix(in srgb, var(--accent) 14%, transparent)) or a complete own palette that paints its own background and every text colour, with 3-4 colour chips (one dark) as a setting; body text at least 4.5:1. Put every api.style rule under one root class (.<id>-ui) on what you render, inherit the user's font (no web fonts unless asked), transitions .2s or less, same-height pill badges, and a "Look" setting (plain + your looks) that only switches root classes. Windows wear the look too: put the root class on the body Node you pass to modal, or for a fully custom window build h('dialog.<id>-ui.<id>-modal', …), append it to document.body, showModal(), style its ::backdrop, close on Esc and backdrop click, and remove it on close and in the cleanup that activate returns.
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
- Model calls go through a connection profile (SillyTavern's built-in Connection Manager). A profile is the user's saved connection: API type, model, preset, proxy preset, server URL and which saved key to use. The key and the address stay inside SillyTavern, so the extension never asks for, stores or sends an API key or URL and never fetches a provider's URL itself. A custom endpoint with its own key and address is a different thing: build that only when the user explicitly wants their own address.
  const { ConnectionManagerRequestService } = SillyTavern.getContext();
  Let the user pick a profile in the settings drawer: <select id="<id>-profile" class="text_pole"></select>, then ConnectionManagerRequestService.handleDropdown('#<id>-profile', settings.profileId, (profile) => { settings.profileId = profile?.id ?? ''; saveSettingsDebounced(); }); (it fills the list and calls back when the choice changes, or the chosen profile is edited or deleted).
  Send: const res = await ConnectionManagerRequestService.sendRequest(settings.profileId, [{ role: 'system', content: '…' }, { role: 'user', content: '…' }], 800); then res.content is the reply text and res.reasoning the thinking. A plain string works as the prompt too. The profile's own preset is applied unless you pass { includePreset: false } as the fourth argument. Text Completion profiles format the messages with the profile's instruct template.
  Only Chat Completion and Text Completion profiles work. sendRequest throws when no profile is chosen, the profile was deleted, the profile has no API, or the Connection Manager extension is turned off: catch it and show toastr.error with a plain fix ("Pick a connection profile in this extension's settings"). Written against SillyTavern 1.19.1: say in README that it needs a recent SillyTavern with the Connection Manager.
  Switching the whole chat instead: the slash command /profile <name> (/profile-list lists them); event_types.CONNECTION_PROFILE_LOADED fires after a switch.
- Other model calls (generateQuietPrompt, generateRaw) use the chat's current connection and changed shape between versions: use them only when the user wants the chat's own connection, and say in README which form you used.
BUILD IT LIKE A BUILT-IN FEATURE:
- Shape of index.js: constants (MODULE = '<id>'), defaults, settings load with missing keys filled, render functions per area, event wiring, and a notify() set for open windows. Prefix every id and class with the extension id.
- Labels in the user's language: SillyTavern.getContext().getCurrentLocale() (for example 'ko-kr', 'en-us') picks from a small label table.
- Context into the prompt: setExtensionPrompt(MODULE, text, position, depth, scan, role) from getContext() — position 0 = in the prompt, 1 = in the chat at depth messages from the end, 2 = before the prompt; role 0 = system. Refresh it on CHAT_CHANGED and after each reply, and set it to '' when switched off. For a last-moment look at the outgoing chat, a manifest "generate_interceptor": "<fnName>" calls globalThis.<fnName>(chat, contextSize, abort, type) before every generation; chat there is a copy you may change.
- Background model work after a reply: eventSource.on(event_types.MESSAGE_RECEIVED, id => …) → ConnectionManagerRequestService.sendRequest with the user's chosen profile, once per message, guarded; keep the result on chat[id].extra['<id>'] and show it with updateMessageBlock.
- Buttons on each message: on CHARACTER_MESSAGE_RENDERED / USER_MESSAGE_RENDERED add your button (once) inside that message's .extraMesButtons, inside .mes_buttons — $('#chat .mes[mesid="' + id + '"] .extraMesButtons'). Re-add after CHAT_CHANGED.
- Macros and commands: registerMacro('<name>', () => text) for live values in cards and prompts; SlashCommandParser.addCommandObject for scripts.
- RECIPE tracker: settings drawer toggle and profile picker → per-chat state in chatMetadata['<id>'] (saveMetadata()) → setExtensionPrompt with the current state → after each reply sendRequest asks for the new state as JSON, validated, old state kept on failure → a panel or popup shows it with what changed.
- RECIPE translator: per-message button → sendRequest → msg.extra.display_text + updateMessageBlock + saveChat, with the swipe number and a text hash beside it so a swipe or edit re-translates or reverts.
- Lively like an app (old → new values, ticking steps for background work, skeletons while waiting, pops for events, all short and switched off under reduced motion): read playbook "motion".
QUALITY: what reviewers keep catching. Go through every point before you send the files, and fix it in the first version.
Layout (SillyTavern is used on phones a lot: picture every screen at 360px wide):
- SillyTavern's .menu_button has width: min-content. With Korean, Chinese or Japanese labels that is ONE character wide, so a button next to an input shows its label one letter per line (추 / 가). Give every button of yours white-space: nowrap; width: auto; flex: 0 0 auto; scoped to your own classes (e.g. .<id>-settings .menu_button, .<id>-popup .menu_button), and give the input in the same row flex: 1 1 auto; min-width: 0.
- Rows: <div class="flex-container alignItemsCenter"> (flex-container already wraps, with a 5px gap). A group of buttons wraps to the next line instead of overflowing. Text boxes: class text_pole (add wide100p for full width). No fixed widths over 300px and no sideways scrolling.
- Popups: callGenericPopup(elementOrHtml, POPUP_TYPE.TEXT, '', { wide: true, allowVerticalScrolling: true }) for anything with a list; long content scrolls inside the popup.
- Colours follow the user's theme: var(--SmartThemeBodyColor) text, var(--SmartThemeBorderColor) lines, var(--SmartThemeBlurTintColor) backgrounds, var(--SmartThemeQuoteColor) or var(--SmartThemeEmColor) accents. No hard-coded white or black. Icons: Font Awesome 6.
- Short labels in the user's language. Each control has a visible label or title.
Settings: one value, one home.
- Each setting lives in exactly one place. Never pre-fill a free-form box (extra parameters JSON, custom headers) with a key that also has its own field: no {"temperature": 0.3} default in a "custom parameters" box when there is a Temperature setting. If two places can hold the same key, decide which wins, apply them in that order in code (free-form box first, dedicated fields last) and say so next to the box and in README.
- Sampling for a profile request goes in the fifth argument: ConnectionManagerRequestService.sendRequest(id, messages, maxTokens, {}, { temperature: settings.temperature }) overrides the profile preset's value.
- On load, copy missing keys from defaults (old installs keep working after an update); never reset what the user set.
Per-message data (translations, notes, "show original" toggles, cached results):
- Never key it by the message's position (chat index / mesid) in extensionSettings, chatMetadata or localStorage. Positions shift when an earlier message is deleted, and regenerate or swipe put a new reply at the same position, so the data jumps to the wrong message or sticks to the new reply.
- Keep it on the message itself: const msg = SillyTavern.getContext().chat[id]; msg.extra ??= {}; msg.extra['<id>'] = { …, swipe: msg.swipe_id ?? 0, src: hash(msg.mes) }; then await SillyTavern.getContext().saveChat(). Before using it, compare swipe and src with the message now; if either differs it is stale (after a swipe, regenerate or edit): drop it or redo it.
- To show other text without changing what the model receives (translations), do what SillyTavern's own translator does: msg.extra.display_text = shown; updateMessageBlock(id, msg); await saveChat(). Delete display_text to show the original again.
- Listen to MESSAGE_SWIPED, MESSAGE_UPDATED (edited) and MESSAGE_DELETED and drop or redo what went stale.
UI that SillyTavern redraws:
- The chat is redrawn on CHAT_CHANGED and a message on swipe or edit, so anything you put inside a message, the chat or the input area disappears. Add it again on CHAT_CHANGED and, per message, on CHARACTER_MESSAGE_RENDERED / USER_MESSAGE_RENDERED (they pass the message id; the element is $('#chat .mes[mesid="' + id + '"]')). Adding must be idempotent: skip when your element is already there.
Live updates (the user never closes and reopens a window to see a change):
- Keep the data in one place in memory (the settings object or the chat data) and build every list, count and empty state from it with a render function per area (renderList(), renderCounts()). Never keep a second copy in the page.
- After any change (add, edit, delete, import, reorder, a finished model request): save, then call the render of every area that shows that data at that moment: the open window, the settings drawer, badges on messages. A tiny notify() helps: a Set of refresh callbacks that each open window adds while it is open and removes when it closes.
- After adding: clear the input, keep the focus in it, scroll the new row into view and highlight it briefly. After deleting: remove the row in place, and for anything hard to redo offer an undo for a few seconds. Counts and the empty state change in the same moment.
- While saving or waiting for a model, disable that button and show progress; turn it back on after success or error.
Requests:
- One request per message at a time: remember what is in flight and ignore repeat clicks. Show progress (a spinner on the button or toastr.info) and always clear it, on errors too.
- Catch every error and show toastr.error with a plain fix. Never log keys or whole chat text.
- Text from the chat or the model goes into the page with .text() / textContent, never unescaped .html() or innerHTML.
DESIGN (the look):
- Default is the plain SillyTavern look (its classes and theme variables). When the user asks for something prettier or describes a style (cute, elegant, dark, vintage, "like a ticket", certain colours, a screenshot of something they like), design a custom look. It must still read well on phones and in the user's theme, and still meet QUALITY. With the plain look you may offer a custom one in a single line of your report.
- Design from a concept, not from decoration. Pick one real object or medium that fits the extension's job and the user's words, and let it decide everything: e-book page, movie ticket and poster, newspaper or magazine spread, blue-and-white porcelain, letter paper and envelope, polaroid scrapbook, library index card, receipt, diary with washi tape, terminal console, game HUD, night sky, archive ledger with ink lines. If the request is vague, propose two or three concepts in one line each and build the one the user picks (or the first).
- Turn the concept into a small system and use it everywhere: palette (background, surface, ink, muted, line, accent, accent-ink), shape (corner radius and line weight: hairline, 1.5px, double rule), type (a scale of 3-4 sizes, weights, letter-spacing, an optional monospace for labels and numbers), ornaments made with CSS (double rules with border-style: double, perforated edges with a dashed border plus round notches, barcode with repeating-linear-gradient, a crescent with box-shadow: inset on a circle, corner marks, a drop cap with ::first-letter, a stamp with a rotated outlined box), layout pattern (masthead, ticket stub, index card, stat strip, page with margins) and motion (subtle, .2s or less).
- Colours, two safe ways, never half of each:
  - From the theme, so it follows the user's light or dark theme: .<id>-ui { --x-ink: var(--SmartThemeBodyColor); --x-line: color-mix(in srgb, var(--SmartThemeBodyColor) 22%, transparent); --x-soft: color-mix(in srgb, var(--SmartThemeBodyColor) 6%, transparent); --x-accent: var(--SmartThemeQuoteColor); --x-accent-ink: color-mix(in srgb, var(--SmartThemeQuoteColor) 65%, var(--SmartThemeBodyColor)); --x-tint: color-mix(in srgb, var(--SmartThemeQuoteColor) 14%, transparent); }
  - Its own palette: the component paints its own background AND every text, line and icon colour inside it, so the host theme cannot make it unreadable. Offer 3-4 colour chips (one of them dark) as a setting, each a class on the root that redefines the same tokens.
  Body text at least 4.5:1 against its background, large titles and labels at least 3:1; text on a tint uses accent-ink, never the raw accent. Body text 13px or more, small labels 11.5px or more.
- Starting points (blend or invent; each is a concept, not a template): archive ledger (flat 1px ink lines, tiny uppercase eyebrow, bold title, drawn crescent and ✦ ✧, ◆ section titles, a stat strip split by hairlines, cards with a 3px accent bar, same-height pill badges); letter paper (warm cream, rounded 14-18px cards, soft shadow, pill buttons, dashed dividers); editorial (big tight bold title, 1.5px lines, 01 / 02 numbered cells, one dark full-width action bar); cinema ticket (dark poster area, scene number and time in monospace, a stub with a perforated edge and a barcode); porcelain (white ground, cobalt ink, double-rule masthead, a round medallion for the portrait); e-book page (paper colour, generous margins, NOW READING label, comfortable line height); night glass (see-through panels with backdrop-filter: blur(8px), thin light lines, a soft glow on the accent).
- Pieces under .<id>-ui: badges all the same height (22px, 12px bold, pill), chips smaller with a 1px line, main button tinted with an accent border, other buttons outlined, :focus-visible outline 2px accent, empty states as one short centred sentence. Icons: Font Awesome 6, or small SVG masks in CSS (mask-image with a data URI SVG, background-color: currentColor) for a custom icon set.
- Fonts: inherit the user's font by default. A concept may use a different font only from what the device already has (system stacks) or what the user names; load no web fonts unless asked, and no old system serif (Batang, Gulim, Gungsuh style). Optional settings for font size and line height suit reading-heavy looks.
- Windows are part of the look. A custom look covers every window the extension opens (lists, editors, confirmations), not only the settings drawer. Two ways:
  - Your own window (best for a custom look): a native <dialog class="<id>-ui <id>-modal <id>-look-…"> appended to document.body and opened with dialog.showModal(). It sits above everything and Esc closes it. Style its ::backdrop (a tinted blur), close it too on a click on the backdrop (event.target === dialog), and remove it on 'close'. Inside: a header (title, a × close button with aria-label), a body that scrolls, a footer with the actions. Phones: width: min(560px, calc(100vw - 16px)); max-height: 88dvh; only the body scrolls. Give focus to the first field when it opens and back to the button that opened it when it closes.
  - SillyTavern's popup wearing your look: callGenericPopup(el, POPUP_TYPE.TEXT, '', { onOpen: (popup) => popup.dlg.classList.add('<id>-ui', '<id>-look-…') }) and style .popup.<id>-ui and its .popup-controls buttons under your class. With the plain look use the popup as it is.
- Scope and switching: wrap everything you draw (settings drawer, popups, panels, message parts) in a root like <div class="<id>-ui <id>-look-ticket <id>-chip-2">, start every rule with .<id>-ui, never restyle SillyTavern's own elements, body or :root, and add a setting "Look" (plain + your looks, with colour chips) that only switches those root classes.
README: list every setting, which one wins when two overlap, and what is untested.
Anything not listed here: use it only if you are sure it exists; otherwise leave it out and say in README.md what is untested and why — never invent an API.`;
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
/** 확장이 모델 연결을 제 손으로 다루나: 키 칸(api key · Authorization · Bearer) 이나 바깥 주소로 바로 fetch */
const ownEndpoint = (code: string) => /\b(api[_-]?key|apikey|x-api-key)\b|['"`]Authorization['"`]\s*:|\bBearer\s/i.test(code) || /\bfetch\s*\(\s*['"`]https?:\/\//.test(code);
/** 확장 CSS 가 앱 · 실리태번 자체 요소를 감싸지 않고 고치나 (고친 선택자 몇 개), 색을 테마 변수 없이 박아 넣었나 */
const HOST_SEL = /^(html|body|:root|\*|button|input|select|textarea|a|p|div|span|label|h[1-6]|ul|ol|li|img|\.menu_button|\.text_pole|\.mes\b|\.mes_text|#chat\b|#send_form|#send_textarea|\.popup\b|\.inline-drawer|\.flex-container|\.btn\b|\.inp\b|\.msg\b|\.composer)/i;
function cssIssues(css: string, id: string): { global: string[]; hard: boolean } {
  const c = css.replace(/\/\*[\s\S]*?\*\//g, ''), global: string[] = [], low = id.toLowerCase();
  for (const m of c.matchAll(/([^{}]+)\{[^{}]*\}/g)) for (const sel of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
    if (/^(@|from\b|to\b|\d)/.test(sel) || (low && sel.toLowerCase().includes(low))) continue;
    if (HOST_SEL.test(sel)) global.push(sel);
  }
  const hard = (c.match(/(?:^|[;{\s])(?:color|background(?:-color)?|border(?:-color)?)\s*:[^;}]*(#[0-9a-f]{3,8}\b|rgba?\()/gi) || []).length >= 4 && !/var\(--/.test(c);
  return { global: [...new Set(global)].slice(0, 4), hard };
}
/** 창 안에서 자료를 바꾸고 저장하는데 다시 그리는 함수 부르기가 없나 (render · refresh · redraw · update… 이름) */
const staleWindow = (b: string, save: RegExp) => save.test(b) && /\.(push|splice|unshift)\s*\(|\bdelete\s+[\w$.[\]]+|\.filter\s*\([^)]*\)\s*;?/.test(b) && !/\b(render|refresh|redraw|rerender|repaint|update|draw|paint|fill|rebuild)[A-Z_]?\w*\s*\(/.test(b);
/** 확장 설정에서 흔히 두 곳에 같이 들어가는 샘플링 값 */
const SAMPLING = ['temperature', 'top_p', 'top_k', 'max_tokens', 'frequency_penalty', 'presence_penalty', 'repetition_penalty', 'min_p'];
/** 메시지별 자료를 메시지 자리(번호)로 저장하나: 설정 · 대화 메타 · localStorage 에 [mesId] 로 쓰거나 `${mesId}` 를 열쇠로 */
const POS = '(?:mes_?id|message_?id|message_?index|mes_?index|msg_?id|msg_?index|messageIdx)';
const byPosition = (code: string, b: string) => /\b(extensionSettings|extension_settings|chatMetadata|chat_metadata|settings|cache|store|state)\b/.test(b)
  && (new RegExp(`\\[\\s*${POS}\\s*\\]\\s*(=[^=]|\\?\\?=|\\|\\|=)`, 'i').test(b) || new RegExp(`\\$\\{\\s*${POS}\\s*\\}`, 'i').test(code) && /\b(localStorage|extensionSettings|extension_settings|chatMetadata|chat_metadata)\b/.test(b));
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
      if (new RegExp(`${esc}\\s*\\.\\s*modal\\s*\\(|\\bshowModal\\s*\\(`).test(b) && staleWindow(b, new RegExp(`${esc}\\s*\\.\\s*store\\s*\\.\\s*set\\s*\\(`))) warnings.push(`${main}: a window changes saved data but nothing redraws it, so the user has to close and reopen to see the change. Rebuild the list from the data right after each store.set.`);
      if (ownEndpoint(code) && !/\bai\s*\.\s*quick\b/.test(b)) warnings.push(`${main}: asks for an API key or calls a provider's URL itself. Dreamland already holds the keys in its connections — use ${P}.ai.quick(system, user), which goes through the user's helper connection, unless the user asked for their own endpoint.`);
      { const css = [...code.matchAll(new RegExp(`${esc}\\s*\\.\\s*style\\s*\\(\\s*\`([\\s\\S]*?)\`\\s*\\)`, 'g'))].map(m => m[1]).join('\n'), ci = cssIssues(css, id || '');
        if (ci.global.length) warnings.push(`${main}: ${P}.style changes the app's own elements without your scope (${ci.global.join(', ')}). Put every rule under your root class (.${id || 'my-ext'}-ui).`);
        if (ci.hard) warnings.push(`${main}: ${P}.style hard-codes colours; use the theme variables (var(--text), var(--line), var(--accent), var(--accent-ink), color-mix for tints) so every theme works.`); }
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
      if (/\b(showModal|callGenericPopup)\s*\(|\bnew\s+Popup\s*\(/.test(b) && staleWindow(b, /\b(saveSettingsDebounced|saveChat|saveMetadata)\s*\(/)) warnings.push(`${p}: a window changes saved data but nothing redraws it, so the user has to close and reopen to see the change. Build the list from the data with a render function and call it right after each save.`);
      if (/\bshowModal\s*\(/.test(b) && !/addEventListener\s*\(\s*['"]close['"]|\.onclose\s*=/.test(code)) warnings.push(`${p}: a <dialog> is opened with showModal() but never removed when it closes — listen to 'close' and remove it, or windows pile up in the page.`);
      if (byPosition(code, b)) warnings.push(`${p}: keeps per-message data under the message's position (index / mesid). Positions shift when a message is deleted and regenerate or swipe reuse them, so it lands on the wrong reply — keep it on the message (chat[id].extra['${id}']) with the swipe number and a hash of the text, then saveChat().`);
      if (/#chat\b|\.mes\b|#send_form|#leftSendForm|#rightSendForm|#send_but|#form_sheld/.test(code) && /\.(append|prepend|after|before|appendTo|prependTo|insertAfter|insertBefore)\s*\(|insertAdjacent(HTML|Element)/.test(b) && !/\bCHAT_CHANGED\b/.test(b)) warnings.push(`${p}: adds elements to the chat or input area but never listens to CHAT_CHANGED. SillyTavern redraws those parts when the chat changes, so add them again on CHAT_CHANGED (and per message on CHARACTER_MESSAGE_RENDERED / USER_MESSAGE_RENDERED), skipping ones already there.`);
      if (/\.innerHTML\s*=\s*(?!['"`]\s*['"`]?\s*;)|\.html\s*\(\s*(?!['"`)])/.test(b)) warnings.push(`${p}: puts built HTML into the page. Anything from the chat or the model must go in with .text() / textContent (or be escaped), or a message can inject markup.`);
      const dup = SAMPLING.filter(k => new RegExp(`\\b${k}\\s*:`).test(b) && new RegExp(`\\\\?"${k}\\\\?"\\s*:`).test(code));
      if (dup.length) warnings.push(`${p}: ${dup.join(', ')} is set in two places — its own setting and inside a JSON text default. Keep it in one place; if both stay, apply the JSON box first and the dedicated setting last, and say which wins.`);
      if (ownEndpoint(code) && !/\bConnectionManagerRequestService\b/.test(b)) warnings.push(`${p}: asks for an API key or calls a provider's URL itself. SillyTavern already keeps keys and addresses in its connection profiles — let the user pick one (ConnectionManagerRequestService.handleDropdown) and send with ConnectionManagerRequestService.sendRequest(profileId, messages, maxTokens), unless the user asked for their own endpoint.`);
      if (/\bextension_?[sS]ettings\b/.test(b) && /\]\s*\.\s*\w+\s*=[^=]|\]\s*\[[^\]]+\]\s*=[^=]/.test(b) && !/\bsaveSettingsDebounced\s*\(/.test(b)) warnings.push(`${p}: settings change but saveSettingsDebounced() is never called, so they are lost on reload.`);
    }
    { const css = paths.filter(x => /\.css$/.test(x)).map(x => files[x]).concat(paths.filter(x => /\.html?$/.test(x)).flatMap(x => [...files[x].matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]))).join('\n'), ci = cssIssues(css, id);
      if (ci.global.length) warnings.push(`CSS restyles SillyTavern's own elements without your scope (${ci.global.join(', ')}). Start every rule with your root class (.${id}-ui or .${id}-settings) so other screens are not changed.`);
      if (ci.hard) warnings.push(`CSS hard-codes colours without the theme variables, so it breaks in the other light/dark theme. Build them from var(--SmartThemeBodyColor), var(--SmartThemeBorderColor), var(--SmartThemeQuoteColor) (color-mix for tints).`); }
    if (paths.some(x => /menu_button/.test(files[x])) && !paths.some(x => /white-space\s*:\s*nowrap/.test(files[x]))) warnings.push(`.menu_button is width: min-content in SillyTavern, so a Korean / Chinese / Japanese label squeezed beside an input stacks one letter per line. Add white-space: nowrap; width: auto; flex: 0 0 auto; to your buttons in style.css (scoped to your classes) and min-width: 0 to the input beside them.`);
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
