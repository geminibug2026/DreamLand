// 등불지기의 안내서: 특정 작업에만 필요한 긴 지침. 시스템 지침에는 요약과 "언제 읽을지"만 두고, 필요할 때 playbook 도구로 읽는다 (매 요청의 토큰을 줄인다)
// 글은 영어 (모델에 주는 지침). 여기 글을 고치면 시스템 지침의 요약과 어긋나지 않는지 함께 본다
export const PLAYBOOKS: Record<string, { what: string; text: string }> = {
  game: { what: 'building a whole simulation, game or stat-driven bot from one request (card, lorebook with [InitVar] and rules, status panel, hide-update regex, quick-reply control bar)', text: `BUILDING A WHOLE SIMULATION OR GAME FROM ONE REQUEST
The user may know nothing about lorebooks, variables or scripts. When they describe a simulation, game, management or dating sim, survival run or any stat-driven bot, you design and build all of it — they only press Apply.
- Do not interview. Decide the missing details yourself in the spirit of what they said, and state your choices in the report. Ask (at most three questions, each with a default) only if the premise itself is unclear.
- Do it in ONE message: your short report first, then the calls, with "end": true on the last one. The calls, in this order:
  1. plan (3-6 steps, all already done by this message — tick them with "tick" on the calls).
  2. create_character — the world or game-master card: description holds premise, tone, setting and how the narrator behaves; firstMes opens the first scene and ends with the line <StatusPlaceHolderImpl/>; 1-2 altGreetings with other starting situations (each ending the same way).
  3. create_lorebook with character="<that exact name>" and these entries:
     - "[InitVar] 초기 변수" — content is the variables themselves: your own keys directly at the top level ({"shelter": {…}, "chars": {…}}). Never wrap it in {"stat_data": …} — Dreamland and MVU already store the entry as stat_data, so a wrapper nests everything twice and the status bar finds nothing. Name every path in plain words the user will recognise in their language, and use exactly those words in the rules and the status bar — never one language in the data and another in the rules (affection vs 호감도), or the model invents paths. Give each value a sensible start. Objects or arrays that will gain or lose items (inventory, quests, companions) carry "$meta": {"extensible": true} (arrays: the item "$__META_EXTENSIBLE__$").
     - "[규칙] 변수 갱신" (constant: true) — the contract the model follows every reply: list each path with type, range and when it changes; then the exact output format: after the story text, an <UpdateVariable> block with _.set('path', old, new);//reason and _.add('path', delta);//reason lines, then the line <StatusPlaceHolderImpl/>. Include one complete worked example. Say that paths not listed must not be invented.
     - "[규칙] 진행" (constant: true) — how the game runs: turn structure, what a day or scene costs, win and lose states, how hard it is, what the narrator never decides for {{user}}.
     - Keyed entries for the world: places, factions, important people, items, systems (shop prices, skill list, event table). Short and concrete; each woken by the words a player would actually type.
  4. create_regex with character="<name>", mode "display", onAI true — find /<StatusPlaceHolderImpl\\/>/g, replace = the game panel, built to the QUALITY BAR. For a game make it a screen: the key numbers as bars with what changed this turn, tabs for the rest (inventory, people, quests), and the two to four most useful actions as buttons that send the player's move. For a light companion or story bot an inline panel is enough (values through {{get_message_variable::stat_data.<path>}}).
  5. create_regex with character="<name>", mode "both", onAI true — find /<UpdateVariable>[\s\S]*?<\/UpdateVariable>/g, replace "" — so the update block is neither shown nor sent back.
  6. create_qr_set with character="<name>" — the player's control bar: a "상태" button that shows the key numbers (/popup or /echo with {{getvar}} is not enough here — read MVU values with {{get_message_variable::stat_data.path}}), an action menu built with /buttons whose choice is sent as the player's move (/send or /setinput), and two or three shortcuts for the actions this game is about (rest, shop, travel, next day …). Every label in the user's language.
- A good simulation has: 4-8 core numbers that pull against each other, a clock (day, turn or phase), a place, an extensible inventory, relationships or factions with their own values, goals or quests with flags, and clear failure. Scale the number of world entries to the premise (8-20). Make the first scene playable immediately.
- If the call budget is short, merge: all world entries go inside the one create_lorebook; both regex scripts stay separate; never drop the rules entries.
- Report, briefly and without jargon: what the game is, what you decided, the cards waiting (press "모두 적용"), and the single next step — open a new chat with the character. Mention that the status panel appears from the first message.
- If a call comes back refused, fix only that call and resend it with "end": true.


QUICK-REPLY CONTROL BARS AND SCRIPTS FOR GAMES
- Simulation bots (games, stats, shops, dating or management sims):
  - Keep state in chat variables (/setvar key=… , /getvar, /addvar, /incvar); use global variables only for what must survive across chats. Use clear prefixed names (sim_day, sim_gold).
  - One idempotent init button that only fills what is unset, e.g. /if left={{getvar::sim_ready}} right=1 rule=neq {: /setvar key=sim_gold 100 | /setvar key=sim_ready 1 :}. Give it auto ["newChat"] (or ["open"]) when it should run by itself.
  - Menus: /buttons labels=["Shop","Rest","Leave"] What now? | /setvar key=sim_choice — then branch with /if. /input asks for free text; /popup or /echo shows results.
  - Small composable buttons with one job each; helpers hidden=true and called with /run Label or /:Label. Start every script with a /# comment saying what it does.
  - To let the model see the state, put {{getvar::…}} macros in the card or a lorebook entry, or write a line into the chat (/sys, /comment); /trigger asks the character to react.
  - Sturdy over clever: guard missing values, no unbounded loops, labels the user can read in their language.` },
  panels: { what: 'drawing inside messages: inline HTML vs a scripted screen, theme variables, the screen skeleton, how panels are checked', text: `- Two ways to draw inside a message — choose on purpose:
  1. Inline HTML, written straight into a regex replacement. Light and fast, and it follows the theme through var(--text), var(--dim), var(--surface), var(--accent), var(--line). It may hold <style> (scoped to the message), <details>/<summary> for folding, CSS transitions and @keyframes, SVG, tables. Scripts, <button>, form fields and on…= handlers are removed, so it can fold and animate but cannot answer a click.
  2. A screen: one fenced block (three backticks + html) holding a whole page, <body>…</body>. It runs in its own sandboxed frame with scripts, so it can be a small app: tabs, a tappable inventory, choice buttons, a map, dice, a shop. jQuery is there; Tailwind, Font Awesome and Vue load when the page uses them; no other remote scripts, styles or fonts. The frame sizes itself to the content: transparent page background, normal flow, no position: fixed and no vh heights.
     - Read state: getVariables({type: 'message', message_id: getCurrentMessageId()}).stat_data — and the same with message_id - 1 to show what changed since the last turn. A value may be a [value, "description"] pair; take [0]. Guard every read (old chats may lack a path) and show a quiet placeholder, never "undefined".
     - Act for the player: triggerSlash('/send 상점에 간다 | /trigger') — /send posts their move, /trigger asks for the reply. Any STscript runs the same way.
     - Make it feel alive the way apps do (old → new numbers, ticking steps, live updates, in-story phone UIs): read playbook "motion".
     - Follow the theme: the app passes its colours as CSS variables --dl-bg, --dl-surface, --dl-surface2, --dl-text, --dl-dim, --dl-accent, --dl-on-accent, --dl-line, --dl-ok, --dl-bad and --dl-font. Use them instead of fixed colours.
  Use a screen when pressing things is the point (a game panel, menus, anything with tabs); inline HTML for a small readout that is always visible. At most one screen per message.
- A screen skeleton that works (this whole block is the regex replacement):
\`\`\`html
<body>
<div id="app"></div>
<style>#app{font:14px/1.5 var(--dl-font);color:var(--dl-text)} /* … */</style>
<script>
(function () {
  var id = getCurrentMessageId(), val = function (v) { return Array.isArray(v) ? v[0] : v; };
  var now = (getVariables({ type: 'message', message_id: id }) || {}).stat_data || {};
  var was = id > 0 ? (getVariables({ type: 'message', message_id: id - 1 }) || {}).stat_data || {} : {};
  // build the DOM from now / was. A button: el.onclick = function () { triggerSlash('/send … | /trigger'); };
})();
</script>
</body>
\`\`\`
- The button row above the input is part of the interface too: gather the game's verbs into a few clear buttons, use /buttons for menus of choices and /popup for rich readouts (it accepts HTML), and give each button a short title= hint.
- create_regex and update_regex check the panel you send: broken JavaScript, or scripts and buttons placed outside a screen, refuse the proposal with the reason; other remarks come back under "check". Fix what they say.
- Then look at it: preview_screen card="last" (in the same message as the proposal) draws the message with the new script at 360px and 800px, runs the screen's scripts and reports errors, anything wider than the screen, the height, text under 11px, tap targets under 32px, and undefined / NaN / null showing. Fix each issue with revise_card and preview again until it says none. html= previews a draft without a card; for a bot with no chat yet the proposal checks are all there is.` },
  motion: { what: 'making status panels, screens and extensions feel alive like an app: motion that explains change, sequences, live updates, in-story phone UIs', text: `LIVELY SCREENS AND EXTENSIONS: FEEL LIKE AN APP, NOT A POSTER
Motion is for meaning: it shows what changed, what is happening and what just finished. Done well a status panel feels like a small app; done badly it is noise. Rules first:
- Animate only change: a number moving from its old value to the new one, a new item sliding in, a step finishing, a pressed button answering. No decorative loops, nothing that blinks or spins forever.
- Quick and quiet: 150-400ms per transition, the whole entrance under about 1.2s, ease-out curves, animate transform and opacity (width for bars). Two or three moving things at once at most.
- Only the newest message moves. In a message screen compare getCurrentMessageId() with getLastMessageId(): older messages draw their final state at once, so scrolling back never replays anything.
- Respect prefers-reduced-motion: matchMedia('(prefers-reduced-motion: reduce)').matches → jump straight to the final state.
- Draw the final state first, then animate into it, so a slow device or an error still shows the right numbers.
- A screen's frame grows with its content: give animated areas a fixed height (bars, step lists, toasts) so nothing jumps while it moves.

PATTERNS (plain classic scripts, no libraries needed; jQuery is there if you like)
- Count-up: function count(el, from, to, ms) { if (reduce || from === to) { el.textContent = to; return; } var t0 = performance.now(); requestAnimationFrame(function f(t) { var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); }); } — read the old value from the previous message's variables (message_id - 1) and show a small ▲3 / ▼2 chip that fades in beside it.
- Bars: render at the old percentage, then on the next frame set the new width with transition: width .6s; switch a class at thresholds (ok / low / danger) so the colour tells the story.
- Staggered entrance: give list rows animation: rise .3s both with animation-delay: calc(var(--i) * 40ms) and @keyframes rise { from { opacity: 0; transform: translateY(6px) } }.
- Steps that tick (waiting → working → done) for anything with stages — travel, crafting, a turn resolving, a background task: function play(steps) { var i = 0, stop = false; (function next() { if (stop || i >= steps.length) return; var s = steps[i++]; s.run(); setTimeout(next, reduce ? 0 : s.ms); })(); return function () { stop = true; }; } — each step swaps a class (is-wait, is-run, is-done) and a label.
- Typing: reveal one short line (a text message, a system notice) a character at a time, 18-30ms each, at most about 2s, and finish at once when tapped.
- Pops: an event notice (level up, item found, new message) slides in inside the screen (position: absolute within a position: relative box, never position: fixed) and hides itself after about 2.5s.
- Tabs with a sliding underline (move it with transform: translateX to the active tab's offsetLeft); horizontal cards that snap on phones with overflow-x: auto; scroll-snap-type: x mandatory and scroll-snap-align: start — no script needed.
- Pressed and pending: :active { transform: scale(.97) }; a tapped action button turns to a pending state (disabled, a small spinner or "…") until the reply arrives.
- Waiting for content: a skeleton block with a moving soft gradient (background-size: 200% 100% animated over 1.2s) instead of an empty box.
- On phones a short navigator.vibrate(12) on a big event is a nice touch where supported; never on every update.

LIVE WHILE OPEN (message screens)
- Screens hear the app's events in SillyTavern's names: eventOn(tavern_events.MESSAGE_RECEIVED, fn) fires after a reply and after its variables were updated; GENERATION_STARTED and GENERATION_ENDED bracket a reply; MESSAGE_SWIPED, MESSAGE_EDITED and MESSAGE_DELETED too. Re-read getVariables and animate only the difference.
- After your own button sends a move (triggerSlash('/send … | /trigger')), show the pending state at once; clear it on GENERATION_ENDED.
- toastr.success / info / warning works inside screens for short notices.

IN-STORY PHONE AND APP UIS (popular in Korean roleplay bots)
- A phone frame: rounded body, a status bar with the story's time and battery, a home grid of a few app icons (messenger, gallery, map, bank, notes) as tabs.
- Messenger: bubbles aligned by sender, read marks, a three-dot typing indicator before the newest bubble, times; the newest bubble types in.
- Notifications: a stack of small cards that slide in from the top of the phone, newest first, each tappable to open its app tab.
- Feeds and apps: an SNS feed with likes ticking up, a bank balance counting, a map with the current place highlighted — all read from variables, all with the old → new motion above.
- Keep it one screen per message, phone width first (it should look right at 320-400px), and make the phone part of the story's variables (time, messages, balance), not decoration.

EXTENSIONS
- Dreamland: the same patterns inside panels, pages and modals, with every rule under the extension's root class via api.style and every timer cleared in the cleanup activate returns. Show background work (ai.quick) as ticking steps or a skeleton, and animate the panel when its data changes by keeping the previous values.
- SillyTavern: the same in the settings drawer and your own windows; scope keyframes by prefixing their names with the extension id; toastr for notices.

BEFORE YOU SEND
Does each motion explain a change? Would it still be pleasant the fiftieth time? Does everything stop by itself? Is the final state right with motion off? Does it fit a 360px phone without jumping?` },
  cards: { what: 'writing or rewriting character card and persona text: the sheet, what makes a character compelling, first message, greetings, testing', text: `CHARACTER CARDS: WHAT MAKES ONE DELICIOUS
A card is not a profile; it is an engine for scenes. A character is good to play with when they want something, act on it, sound like nobody else, and keep surprising within their own logic. Build every card around these:
1. A want they pursue in scenes (concrete and present: keep the café alive, win {{user}} over without admitting it, find who sold the map) — plus a fear or wound that bends how they pursue it, and one contradiction (two true things in tension: ruthless in business, helpless with stray cats). The contradiction is where surprise comes from.
2. A voice. Register, rhythm, favourite words and what they never say, how they address {{user}}, how they deflect. In Korean decide the speech level (반말 / 존댓말 / 하오체 · 다나까), the 호칭 for {{user}}, dialect, and typical sentence endings, and keep them consistent. Two to four short sample lines in different moods (calm, provoked, cornered or tender) teach the voice better than any adjective.
3. Initiative. They have their own small goals in the current scene, opinions, and plans; they tease, refuse, bargain, change the subject, start things. Never a mirror, a servant or a yes-machine for {{user}}.
4. Specifics over adjectives. Habits and tells ("re-ties her hair when she lies"), objects they carry, places they go, skills and the cost of those skills, tastes, routines, money. A sentence a reader could picture beats three adjectives.
5. The relationship with {{user}}: what is between them now, what happened before, what each wants from the other, and the open question that pulls the story (a debt, a secret, a rivalry, an unspoken feeling).
6. Texture: one real competence, real flaws with consequences, how affection and anger show in behaviour, a sense of humour of a particular kind, a boundary or two.
7. Something to reveal: one or two facts that can surface later (a past, a lie, a hidden loyalty). Write them plainly as facts and say when or how they come out.
Avoid the flat card: endless agreeableness and praise, therapy-speak, everyone being "kind but mysterious", purple prose, and stock phrases (smirk, "a mix of", eyes darkening, padding, ministrations, "you're mine"). Possessive, controlling or yandere traits only when the user asks.

THE SHEET (description)
Everything about the character goes into description as one well-organised text: short labelled sections with prose inside, labels in the card's language, no markdown symbols (#, **, -) and no emoji. personality, scenario and mesExample stay empty unless the user wants them (keep them when you edit a card that already uses them). Never state a fact twice. A clean order:
  Name and premise — one or two lines: who they are, their role, what is at stake now.
  Look — the two or three things an observer notices first, how they dress and move.
  Personality — the want, the fear or wound, the contradiction, then three to five behaviours with their tells.
  Speech — register and rhythm, verbal habits, how they address {{user}}, then the sample lines written inline in quotes.
  Background — only what still shapes present behaviour, three to five sentences.
  With {{user}} — the relationship, its history, the current tension and what they want from {{user}}.
  Now — the situation the story opens in and the threads in play.
  (Optional) Narration — point of view, tense and length the story should keep, and what the narrator never decides for {{user}}.
In Korean the labels can be 기본 / 외모 / 성격 / 말투 / 배경 / {{user}}와의 관계 / 지금. Length: short 250-400 tokens, standard 400-800, detailed 800-1500 (the user may choose). Places, side characters, factions, items and history that are not needed every turn go into a lorebook linked to the character (create_lorebook with character=), one keyed entry each; the card keeps one line per important side character.

FIRST MESSAGE AND GREETINGS
The first message is the strongest style signal the model ever gets: it copies its length, point of view, tense, formatting and prose quality into every reply. Write it exactly as you want replies to read. Open in the middle of a moment: a concrete action, a line of dialogue in the character's voice, a detail of the place, and a hook — a question, an offer or a problem — that leaves {{user}} room to act. Show the want and the voice in it. Never decide what {{user}} does, says, thinks or feels. Alternate greetings are genuinely different situations (another place, time, mood or stage of the relationship), each with its own hook, not rewordings.

PERSONAS
A persona is who the user plays: third person, 100-300 tokens — name, look, background, how others see them, one or two hooks for the story. Never script their future actions or lines.

OPTIONS AND EDITS
- The user may set detail level, greeting point of view (third person by default; second person addresses {{user}} as "you" without deciding their actions; first person is {{char}} narrating) and language. Write card text in the language asked, else the language the user writes in, else the card's own.
- Rewriting one aspect ("only the speech style", "make her older"): read the card, change only the sentences about that aspect, and send the complete new text of only the fields that change; for a card still waiting for approval use revise_card.
- After proposing, read the "check" (markdown, cliché, userAgency, macro findings) and fix what you did not intend with revise_card.

BEFORE YOU SEND (in your head, no extra message)
Want, fear and contradiction are there and visible in behaviour. The voice is distinct and has sample lines. The character takes initiative. Specific details outnumber adjectives. The relationship with {{user}} has an open question. The first message reads like the replies you want and leaves room. Nothing is decided for {{user}}. No clichés, markdown or repeated facts. World material is in the lorebook.

TESTING THE VOICE
When the user wants a polished card, or when you are unsure, call try_reply on the card (it works on a card still waiting for approval) with two contrasting lines — one ordinary, one that provokes or presses — and read the replies as a player would. If they are bland, too agreeable, too long or ignore the voice, revise the specifics, sample lines or first message and say what you changed. Each try_reply is one paid request on the chat connection, so use two or three at most and tell the user you tested it.` },
  lalib: { what: 'scripts with LALib commands: expressions, branching, loops, lists and dictionaries, lorebook, message and swipe control, error handling', text: `LALIB IN DREAMLAND: PRACTICAL PATTERNS
Dreamland runs the SillyTavern extension LALib's commands natively, so scripts written for it work unchanged. Look up the exact argument order of any command with st_commands name=<command> before you write it; proposals are syntax-checked and refused with the error.

EXPRESSIONS AND BRANCHING
- /= evaluates an expression and returns the result: math (+ - * / // % **), comparison (== != < <= > >= <=>), logic (and or xor !), membership ('a' in list, starts with, ends with), type checks (x is number), regex (/oo$/ == 'foo'), assignment (x = 1, x += 1, x++). Named arguments become variables: /= hp={{getvar::hp}} dmg=3 hp - dmg | /setvar key=hp — this is the safe way to bring chat variables into an expression.
- /ife (expr) {: … :} /elseif (expr) {: … :} /else {: … :} replaces nested /if with left= right= rule=. Example: /ife hp={{getvar::hp}} (hp <= 0) {: /echo 쓰러졌다 :} /elseif (hp < 20) {: /echo 위험 :} /else {: /echo 괜찮다 :}
- /switch value with /case value {: … :} for menus with many choices (pair it with /buttons).
- /ifempty value=… fallback and /ifnullish guard values that may be missing in old chats.

LOOPS, LISTS AND DICTIONARIES
- Lists and dictionaries are JSON text. /foreach list {: … {{var::item}} {{var::index}} … :} runs once per item (/break stops). /map, /filter, /find, /reduce (initial=, acc and cur), /sorte (key= or a compare closure), /groupby, /flatten, /slice, /splice, /shuffle, /pick (random items), /reverse.
- /getat index=… reads one item or field (index=[a, b] for a path); /setat index=… value=… returns the changed list or dictionary — store it back with /setvar.
- /dict builds a dictionary from pairs; /keys lists its keys; /split and /join convert between text and lists; /json-pretty shows structures readably.
- /whilee (expr) {: … :} loops while true: always change the condition inside and keep a hard upper bound so it cannot run forever.

TEXT AND PATTERNS
- /re-test, /re-exec, /re-replace find=/…/ replace=… (or cmd={: … :} to compute the replacement); /re-escape makes user text safe inside a pattern. /substitute fills macros in text; /wordcount and /sentencecount measure; /trim cleans.

THE CHAT, MESSAGES AND SWIPES
- /message-get, /message-list read messages; /message-edit message=… text replaces (append=true adds); /message-move reorders; /role-swap swaps the user and character roles of messages. /message-on listens for clicks (or another event) on elements inside the last message and runs a closure ({{target}} is the element) — a way to make buttons in a reply work; /message-off and /message-listeners manage those listeners.
- /swipes-get, /swipes-list, /swipes-count, /swipes-index read the alternatives; /swipes-add adds one; /swipes-go jumps to one; /swipes-del removes one; /swipes-swipe generates a new one (a paid request).

LOREBOOKS
- /wi-list-books and /wi-list-entries look things up. /wi-trigger forces an entry into the next reply (for example a hidden event entry when a flag is set). /wi-activate scans the lorebooks against the chat now and runs the quick replies whose automation ID matches an activated entry.

ROBUSTNESS
- /try {: … :} | /catch {: … {{exception}} … :} around anything that may fail (missing variables, bad JSON), with a readable message for the player.
- /fireandforget runs something without waiting (a sound, a slow side effect); /timestamp gives the time for logs and day counters.
- Keep each button to one job; share helpers as hidden quick replies called with /run; start every script with a /# comment saying what it does.

GOOD USES IN GAMES
- Inventory with counts: keep a dictionary in a chat variable, update with /getat + /= + /setat + /setvar, and show it with /foreach into /popup.
- Random events: /pick from a list of event names, then /wi-trigger the matching disabled-by-default lorebook entry so the next reply weaves it in.
- Dice with modifiers: /roll for the throw, /= for the bonus and the threshold, /ife for success tiers.
- Shops: a dictionary of item → price in a lorebook-backed variable, /buttons for the choice, /ife to check money, then update money and inventory together.` },
  mvu: { what: 'setting up or repairing MVU variables: update commands, extensible objects, zod schemas, game-mode links, the extra-call mode', text: `MVU (MagVarUpdate variables)
- Dreamland keeps per-message variables in stat_data. They start from a lorebook entry whose name contains [InitVar] (content: JSON or YAML; keep that entry disabled so it is not sent to the model) in a lorebook linked to the character. A value may be a [value, "description"] pair.
- Replies carry update commands, usually inside <UpdateVariable> … </UpdateVariable>: _.set('path', old, new);//reason, _.add('path', delta);//reason, _.insert('path', value) or _.insert('path', key, value) (alias _.assign), _.remove('path') (aliases _.unset, _.delete), or a <JSONPatch>[{"op":"replace"|"delta"|"insert"|"remove"|"move", "path":"/hero/hp", "value":…}]</JSONPatch> block. Paths use dots ('hero.hp') and start inside stat_data — never 'stat_data.hero.hp' in update commands (only getVariables(...).stat_data.hero.hp in scripts and {{get_message_variable::stat_data.hero.hp}} in macros include the stat_data step). _.set and _.add never create paths, so every path must exist in the initial variables; insert/remove only work where the initial variables mark the object or array as extensible ($meta: { extensible: true } on an object, "$__META_EXTENSIBLE__$" as an array item). Commands inside <think> or <analysis> are ignored.
- Cards made for SillyTavern may also ship a Tavern Helper script that calls registerMvuSchema(z.object({…})) (zod): Dreamland runs it and the schema then checks, clamps and fills every update, like MVU zod in SillyTavern. A disabled [config_override] lorebook entry can set the update method; [mvu_update] / [mvu_plot] in an entry name only matter when the "ask once more after each reply" method is on.
- When a status bar or display shows null, empty or obviously default values, first call get_mvu on that chat and check that the variables exist (and where they came from) before you blame the regex, the HTML or macro escaping. Most often the chat simply has no MVU variables yet: the [InitVar] lorebook is not linked to the character or chat, or the chat started before it was linked.
- Game mode + MVU: in a game-mode chat the game sheet can be linked to MVU paths (the start dialog's link checkbox, or the sheet's "Link variables" tab, which suggests links by name: 체력/HP/기혈, 내공/마나/MP, 은량/골드/돈/gold, 행낭/소지품/inventory, 위치/장소/location, 레벨/경지, 근력/민첩/지능/매력 …; values may be [value, "description"] pairs). A linked value is read from stat_data (the variable is the truth). Fights, checks, minigames, sheet edits and the GM's game tags ([hp -3], [gold +10], [item +…], [place …]) become _.add/_.set/_.insert/_.remove commands run through the normal MVU update, so zod rules, events and status bars follow; checks use linked stats; the GM prompt lists only the linked paths and values. If one reply changes the same linked value with both a game tag and an MVU command, only the MVU command counts. get_mvu shows a chat's links (gameLinks). To help: make sure the chat has variables (get_mvu), point the user to that tab, and keep MVU paths short and plainly named so the matcher finds them.
- A character's systemPrompt and postHistory REPLACE the user's preset main prompt and post-history instructions (unless they contain {{original}}), so the user's writing style silently disappears. Never put game or variable rules there: they belong in a constant lorebook entry. If a card must use them, keep {{original}} in the text.
- When replies skip <UpdateVariable> or write paths that do not exist: compare the [규칙] entry's paths with get_mvu's paths first and make them identical (wording included). If the model still forgets, suggest update_settings mvu.mode="extra" ("ask once more after the reply": a separate short call that sees the exact current variables, about one extra request per reply) instead of piling more rules into the card. Fix the chat's missed values with set_variables.
- Setting up MVU: (1) design a small stat_data of what really changes in play; (2) write the [InitVar] entry and check it with mvu_check initvar=; (3) write the update rules the model follows — a constant lorebook entry listing each path, its type and range, when it changes, and the exact output format with one example; (4) test a sample update with mvu_check (update= plus initvar=); (5) optionally a status display: a regex script (mode "display", onAI) that replaces <StatusPlaceHolderImpl/> with short text or HTML using {{get_message_variable::stat_data.path}}. Propose each piece with the lorebook and regex write tools. get_mvu reads a chat's current variables.

DESIGN THAT PLAYS WELL
- Model only what changes in play and matters to decisions: 4-8 core numbers that pull against each other (money vs. food vs. health; affection vs. suspicion), a clock (day, time, phase), a place, an inventory, people with their own values, quest or event flags. Everything that never changes belongs in the card or lorebook, not in variables.
- Name every path in the user's language, short and plain (체력, 은량, 호감도.서이건), and use exactly the same words in [InitVar], the rules entry and the status panel.
- Numbers stay numbers (never "50" as text). Give each a range in the rules entry and say what crossing a threshold means in the story (호감도 70 이상: 먼저 연락한다), so changes have consequences.
- Per-person values: an object keyed by name (호감도: {서이건: 10}) marked extensible when new people can appear. Inventory: an extensible object (name → count) or an extensible array of short strings.
- Updates are small: _.add for amounts, _.set for states and places; never rewrite a whole object to change one field. Each command carries a reason after //.
- Show change: the status panel reads the previous message's variables too and shows ▲ ▼ and the amount (see playbook panels).

COMMON FAULTS AND THEIR FIX
- Panel shows null or nothing: the chat has no variables (lorebook not linked, or the chat started before it was linked) — get_mvu first; set_variables or a new chat fixes it.
- Everything nested twice: [InitVar] content wrapped in {"stat_data": …} — remove the wrapper.
- Updates silently ignored: path wording differs between rules and [InitVar], the path does not exist (_.set never creates), insert on a container not marked extensible, or the commands sit inside <think>.
- The model stops writing updates: make the [규칙] entry constant and concrete with one full example; if it still forgets, suggest update_settings mvu.mode="extra".
- Rules leak into the story or the panel never appears: the update-hiding regex is missing, or the first message lacks <StatusPlaceHolderImpl/>.
- [InitVar] entry enabled: it is sent to the model every turn — keep it disabled.` },
  presets: { what: 'tuning a preset: reply length, repetition, character breaks, cut-off or thinking-only replies, samplers per model, block order and depth, prefill', text: `PRESET TUNING
Work from the symptom. First read: get_preset (sampler settings and the list of blocks) and, when the complaint is about a real reply, diagnose_reply (what was actually sent: sizes by source, what was dropped, which lore fired, the samplers, the reply). Change one or two things per round, say why, and offer try_reply to test (one request) instead of guessing twice.

HOW A PRESET BUILDS THE PROMPT
- Blocks are sent top to bottom. Marker blocks pull in content: main (the main prompt), charDescription, charPersonality, scenario, personaDescription, dialogueExamples, worldInfoBefore / worldInfoAfter (lore entries at position before / after), summary, chatHistory, jailbreak (instructions after the chat history). {{slot}} inside a marker block is where that content goes — keep it when you edit the wrapper text. Custom text blocks are your own instructions.
- A text block with depth=N is not sent in its place: it is inserted N messages from the end of the chat history (0 = after the last message, 1 = just before it). Depth 0-2 is the strongest spot for a short standing instruction; the top of the prompt is for stable facts. Blocks at the same depth follow their order.
- role: system (default), user or assistant. Some models follow a short user-role reminder at depth 0-1 better than a system line far above.
- when: a condition such as nsfw && style == "intense" (preset variables, chat variables, char, mode). Empty = always. It lets one preset carry optional parts instead of three near-copies.
- A character's own systemPrompt / postHistory replace main / jailbreak while card overrides are on (the default), unless they contain {{original}}. When "my preset is ignored" for one character, check the card first.
- add_preset_block puts a new block just before the chat history unless you give after= or depth=. Turn blocks off (enabled=false) rather than deleting them when testing.

SETTINGS (update_preset fields)
- maxTokens: the hard cap on one reply, not a target. It only cuts. For role-play 2000-4000; with a reasoning model the thinking counts against it too, so give 6000-8000 or lower effort.
- contextSize: how much of the chat is kept. When it is full the oldest messages drop first (diagnose_reply shows "dropped"). Long chats with long-term memory on can stay moderate (32k-64k): old turns are summarised anyway. Raising it raises the cost of every request.
- effort: "" (provider default), low, medium, high — reasoning strength for models that think. high is slower and pricier; low is fine for casual RP. A reply that is only thinking and no text usually means maxTokens ran out inside the thinking: raise maxTokens or lower effort.
- temperature: 0.7-0.9 steadier, 1.0 default, 1.1-1.2 livelier. Above ~1.3 most models lose coherence.
- topP / topK / minP / topA / freqPen / presPen / repPen / seed: leave null unless there is a reason; null means "not sent". What a provider honours differs: Claude takes temperature (send temperature or topP, not both); OpenAI-compatible APIs take freqPen / presPen (0.1-0.4 against repetition); local and OpenRouter models take minP (0.05-0.1) and repPen (1.05-1.12); many reasoning models reject samplers entirely — if a request errors after a sampler change, set it back to null.
- prefill: text the reply is made to start with (sent as the start of the assistant turn). Strong for format or voice ("*" or the character's name and a quote), but some providers do not continue a prefill and some reject it. Keep it short.
- stop: strings that end the reply. A stop string that occurs in normal prose cuts replies short — check this first when replies end abruptly.
- squash: merges consecutive system messages into one. Leave on; turn off only if a provider needs separate messages.

SYMPTOM → CAUSE → FIX
- Cut off mid-sentence: maxTokens too low (or thinking eats it), or a stop string matched. Raise maxTokens, clear the stop string.
- Too short or too long: length comes from instructions and from the pattern of earlier replies, not from maxTokens. Put one concrete length line in a depth-1 block ("Write 3-5 paragraphs, about 300-500 words") and check that the first message has the length you want — models copy it.
- Repeats phrases, openings or structure: first an instruction (depth-1 block: "Do not reuse phrasing, sentence openings or structure from your last replies; move the scene forward"), then a small sampler change for that provider (temperature +0.1, or freqPen 0.2 / minP 0.05 / repPen 1.08). Cranking penalties hurts names and grammar. Long-term memory's banned phrases (memory.bannedPhrases) catch specific pet phrases.
- Speaks or acts for {{user}}: main prompt rule plus a one-line reminder in jailbreak or at depth 0-1; check that the first message and examples do not write {{user}}'s actions (the check tool flags that).
- Out of character or flat: the card is weak, missing or overridden — read the card; a block that duplicates or contradicts it; examples in another style. Fix the card before piling instructions on the preset.
- Forgets setting details: lore not firing (playbook "lore", lore_test) or the facts sit only in old messages that dropped out (turn on long-term memory).
- Refuses or softens: read the main and jailbreak text for hedging or safety lines and remove them; a short, plain statement of what the story is beats long pleading.
- Mixed languages: say the output language once in main ("Write in Korean") and once at depth 0-1.
- Same preset works on one model, not another: keep one preset, use when= conditions or a variable for the model-specific part, and samplers that model honours.

WRITING PRESET TEXT
Short, concrete, positive instructions ("Write …") beat long lists of "never". One topic per block, named clearly, so the user can switch parts on and off. No duplicates between main, jailbreak and blocks. Macros: {{char}}, {{user}}, {{getvar::name}}, {{random::a::b}}. Do not paste the card into the preset.` },
  lore: { what: 'designing or fixing a lorebook: keys and logic, always-on versus keyed, position and depth, order and budget, recursion, groups, timed entries, probability, splitting a world into entries', text: `LOREBOOK DESIGN
A lorebook keeps the prompt small: each entry is sent only in the turns where it matters. Read the book first (get_lorebook; get_lore_entry for one in full). Check wake-ups with lore_test text="…" and a real prompt with diagnose_reply. Write entry text the way card text is written: plain prose or tidy "Label: value" lines, third person, no markdown emphasis, no instructions to "remember".

SPLITTING A WORLD INTO ENTRIES
- One subject per entry: a place, a person, a faction, an item, a rule, a custom. 50-250 tokens each. A huge entry wakes on everything and wastes budget; a dozen tiny ones repeat context.
- Always-on (constant=true) only for what every reply needs: the world's core premise, the narration contract, game rules. Keep the total of always-on entries small (a few hundred tokens). Everything else is keyed.
- Each entry should make sense alone (name the subject in its first sentence) because it arrives without its neighbours.
- People who are in every scene belong in the card, not in lore.

KEYS
- keys: the words that wake it — every way the story really refers to the subject: name, nickname, title, Korean and English spellings, inflected stems ("하린", "하린이", "Harin"). Matching is substring by default, so a short stem catches particles; for short Latin words that hide inside others turn wholeWord on (entry or book).
- Avoid keys that occur everywhere ("the", "그", the user's name, the character's name) — the entry would always fire.
- keys2 + logic narrow it: 0 AND ANY (one of keys and one of keys2), 3 AND ALL (all of keys2), 1 NOT ALL, 2 NOT ANY (e.g. keys ["왕궁"], keys2 ["밤", "night"], logic 0 = the night version of the palace).
- useRegex=true makes each key a regular expression (/…/i) — for patterns only, not for lists of words.
- scanDepth: how many recent messages are searched (book default 4). Raise it on an entry that must keep firing for a while, or use sticky.

WHERE IT GOES (position) AND WHICH WINS (order, budget)
- before / after: around the character description (the worldInfoBefore / worldInfoAfter blocks of the preset). Default for setting facts.
- depth: inside the chat, depth messages from the end, as role= (system by default). Depth 1-4 for things that steer the current scene (a location's mood, a status reminder); strong, so keep such entries short.
- an_top / an_bottom: around the Author's Note. em_top / em_bottom: around the example dialogues.
- outlet: sent only where a preset block or card text writes {{outlet::<outlet name>}} — for putting a group of entries in one exact spot.
- order: higher order goes later (nearer the chat, so stronger), and when the book's tokenBudget is exceeded, always-on entries are kept first and then higher order; the rest are dropped. Give core lore a high order and trivia a low one. ignoreBudget=true keeps one entry no matter what.
- tokenBudget (book): the cap for all lore together. If entries silently vanish in long chats, raise it or trim entries.

CHAINS (recursion)
With the book's recursive=true, the text of woken entries is scanned too, so entries can wake each other (a city entry mentions its district, which wakes the district). noRecurse=true: this entry's text wakes nothing. excludeRecursion=true: this entry wakes only from the chat, never from other entries. delayUntilRecursion=N: only from the N-th level of chaining. Turn recursion on only when you designed chains; otherwise it bloats the prompt.

VARIETY AND TIME
- probability (0-100): chance to fire when woken — for flavour (rumours, weather, random encounters). Keep core facts at 100.
- group="name": of the woken entries that share a group, only one is sent. An entry with groupOverride=true wins over the others (the highest order if several have it); otherwise one is picked at random, weighted by groupWeight (default 100). Use for alternatives: three versions of an event, mood variants of a place.
- sticky=N: stays on for N messages after it fires (a poison that lasts, a scene that continues after the keyword stops appearing). cooldown=N: cannot fire again for N messages after it ends (stops a random event from repeating). delay=N: cannot fire before the chat has N messages (late-game reveals).
- ask= with askMode: a yes/no question a helper model answers about the current scene ("Is {{char}} hurt?"). need = the keys wake it and the answer must also be yes; wake = a yes wakes it even without keys. It costs one helper call per turn while such entries exist, so use it only for situations keys cannot catch.

FIXING "IT NEVER SHOWS UP"
lore_test with a sentence from the chat → is it woken? If not: the key is not in the scanned messages (scanDepth), case or wholeWord blocks it, keys2/logic excludes it, probability, delay, cooldown or a group lost. If it is woken but missing from diagnose_reply: budget dropped it (raise order or tokenBudget), or the book is not linked to this chat or character (link_lorebook) or not active.

VARIABLES AND GAMES
[InitVar] entries stay disabled (they seed variables; playbook "mvu"). Game rules the model must follow every turn are one constant entry. Rules for one phase or place are keyed entries that wake with it.` },
  memory: { what: 'long-term memory (the archive) settings: cost, how much is remembered and recalled, auto-hide of old messages, recording interval, recall style, continuity checks; and fixing "it forgot" or "it keeps bringing up the past"', text: `LONG-TERM MEMORY SETTINGS
Long-term memory records the story as it goes (a librarian model reads new replies and writes turns, memories, a cast list, promises and secrets), summarises every so often, and before each reply recalls what fits and injects it. Read the current values with get_settings part="memory" first; change them with update_settings fields={"memory.<key>": value}. If a settings set is active (activeSet), changes go into that set — say so. The librarian connection, embeddings and prompts are set by the user in the long-term memory settings screen (help_search gives the exact path); never ask for keys.

COST (each item is model calls)
- Recording: rpBatch / talkBatch replies are collected and recorded in one call (default 10 in RP, 5 in talk mode). Higher = cheaper, slightly later; 1 = every reply (most precise, most calls). Very long replies are recorded early anyway.
- Summaries: every chunkTurns replies (default 30; chunkTurnsTalk for talk mode, 0 = same).
- Archive cleanup: consolidateEvery (default 30 turns) and arcConsolidateEvery (100); 0 = off.
- Extra calls you can switch off: replyCheck / checkMode (continuity check, "each" = one call per reply, "batch" = every checkEvery replies), supervisor (scene director, one call per reply), gradeMode "every". Recall itself costs nothing unless embeddings are on.
- lowThink=true keeps the librarian's reasoning low (reasoning tokens bill as output). yieldToChat and waitTyping keep memory calls from competing with your reply.
- A cheaper librarian connection is the biggest saving; the user picks it in the settings screen.

WHAT THE AI SEES
- tokenBudget (default 8000): how much recalled memory goes into each prompt. 3000-5000 for small models or tight context, 8000-12000 for long epics.
- topK (10): memories recalled per turn. maxMemories (400): archive size before low-importance ones are pruned.
- position: split (default: the stable story up front, the changing scene near the chat — good for prompt caching), chat (one block at depth), before (before the main prompt). depth applies to chat.
- splitInjection (fixed ledger, on) keeps the stable part unchanged between turns so providers can cache it; stableRefreshTurns rebuilds it.
- autoHide (on): messages already covered by summaries are hidden from the AI, so long chats stay a steady size. keepTurns (40) recent replies always stay as text, then older ones are hidden hideUnit (20) at a time; preserveRecent always stay. Turn autoHide off only if the user wants the full raw chat sent (expensive, and the oldest messages still drop at the context limit).
- trim + keepRecent: alternative to hiding — only the last keepRecent messages are sent.

STORY QUALITY
- recallVoice: quiet / natural (default) / active — how readily characters bring up the past themselves.
- recallQuotes (on): recalled memories carry original lines. Turn off if old speech patterns keep returning. rawRecall "auto" carries one exact old passage only when the user asks about the past.
- voiceSamples (2): real lines per character in the scene, for voice consistency.
- bannedPhrases: phrases to strip from the ledger (comma or newline separated); banInChat also strips them from recent chat sent to the AI; banTell tells the model the list (can backfire).
- styleGuard (on): the archive states facts only, so its wording does not leak into the prose.
- cast, items, milestones, storyClock, dueDates, presentNow, guardSecrets, feelingLines, tieNotes: what is tracked and shown; most cost no calls.
- sceneCards and mindLines stay 0 unless asked: they pull old scenes and old feelings into the present.

COMMON REQUESTS
- "It forgot X": get_memories query="…" — if it is there, raise tokenBudget or topK (or pin it with update_memory); if not, propose remember to add it (it may have happened before memory was on). Check enabled and auto.
- "It keeps dragging up the past": recallVoice quiet, recallQuotes off, rawRecall off, lower topK.
- "Too expensive": raise rpBatch (15-20), raise chunkTurns, turn off replyCheck/supervisor, lowThink on, cheaper librarian connection.
- "Records are late": lower rpBatch; recordDelay 0.
- "The chat got slow or huge": autoHide on, keepTurns 30-40.
- Different needs per bot: the user can save settings sets and attach them to a character or chat in the settings screen.` },
};
