# 남은 다리 목록 (2단계 갈아 끼우기용)

`src/` (`src/lib` 제외)에서 옛 `/js` 모듈을 부르는 곳 전부. 1단계 마지막(2026-11-13)에 뽑았다.
- 뽑는 법: `mod<T>('이름')` · `lazy<T>('이름')` 호출의 타입 `T` 에 적힌 이름(화면 파일은 "쓰는 만큼만" 타입을 적었다), 구조 분해한 이름, `.이름` 으로 바로 꺼낸 것, 그리고 `L.<모듈>.<이름>`.
  "부르는 파일" 은 다리를 적은 파일과, 그 다리 파일을 import 하면서 그 이름이 실제로 나오는 파일이다(같은 이름의 다른 것과 겹쳐 조금 넓게 잡혔을 수 있다).
- "대신하는 곳" = 2단계에서 import 할 `src` 파일. `src/lib/<옛 이름>.ts` 는 1단계 담당들이 같은 이름 · 같은 꼴로 만든다. 그 안의 멤버(예: `S.get`)는 이름 옆 괄호에 적었다.
- 다리를 묶는 파일: `src/legacy.ts`(L · mod · preload), `src/chat/bridge.ts`(B), `src/editors/bridge.ts`, `src/studio/bridge.tsx`, `src/diary/bridge.ts`, `src/memoria/bridge.ts` · `src/memoria/engine/legacy.ts`, `src/scenebook/bridge.ts`, `src/regex/lib.ts`, `src/modules/lib.ts`, `src/addons/legacy.ts`(확장 API).

## advanced

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `AF` | src/lib/advanced.ts | editors/bridge.ts, flow/logic.ts, pages/Format.tsx, pages/Settings.tsx |
| `instructName` | src/lib/advanced.ts | editors/bridge.ts, pages/Conns.tsx |
| `KINDS` | src/lib/advanced.ts | flow/logic.ts, flow/panels.tsx, pages/Format.tsx |
| `masterExport` | src/lib/advanced.ts | pages/Format.tsx |
| `resolve` | src/lib/advanced.ts | pages/Format.tsx |
| `TEXT_PROVIDER_KINDS` | src/lib/advanced.ts | editors/bridge.ts, pages/Conns.tsx, pages/Format.tsx |
| `tplApply` | src/lib/advanced.ts | flow/logic.ts, pages/Format.tsx |
| `tplCurrent` | src/lib/advanced.ts | pages/Format.tsx |
| `tplDelete` | src/lib/advanced.ts | pages/Format.tsx |
| `tplDirty` | src/lib/advanced.ts | pages/Format.tsx |
| `tplGet` | src/lib/advanced.ts | flow/logic.ts |
| `tplImport` | src/lib/advanced.ts | pages/Format.tsx |
| `tplIsBuiltin` | src/lib/advanced.ts | pages/Format.tsx |
| `tplList` | src/lib/advanced.ts | editors/bridge.ts, flow/logic.ts, flow/panels.tsx, pages/Conns.tsx, pages/Format.tsx |
| `tplSave` | src/lib/advanced.ts | pages/Format.tsx |

## assets

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `ASSET_PROMPT` | src/lib/assets.ts | assets/logic.ts, pages/Studio.tsx |
| `Assets` (IMG, active, add, addFiles, baseOf, cleanName, count, expand, grouped, inVer, keyOf, keywords, list, load, names, ownerOfChar, ownerOfPersona, ready, reload, remove, removeOwner, resolve, source, update, verOf) | src/lib/assets.ts | assets/Studio.tsx, assets/logic.ts, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, editors/bridge.ts, features/assets.tsx, modules/lib.ts, modules/logic.ts, pages/Chat.tsx, pages/Modules.tsx |
| `unzip` | src/lib/assets.ts | assets/logic.ts |
| `zip` | src/lib/assets.ts | assets/Manager.tsx, assets/Studio.tsx, assets/logic.ts, expressions/Studio.tsx, expressions/upload.tsx |

## boot

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `navItems` | 2단계 (시작 절차를 src/ 로) | Shell.tsx |
| `start` | 2단계 (시작 절차를 src/ 로) | main.tsx |

## cards

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `bridge` (detect, ok, resolve) | src/lib/cards.ts | editors/CharEditor.tsx, editors/CharSheet.tsx, editors/ChatPicker.tsx, editors/PresetVars.tsx, editors/bridge.ts, editors/index.tsx, editors/lore.tsx, editors/parts.tsx, features/editors.tsx, pages/Conns.tsx, pages/Import.tsx, pages/Lore.tsx, pages/Personas.tsx, pages/Presets.tsx, pages/Settings.tsx |
| `bridgeSource` | src/lib/cards.ts | editors/bridge.ts, pages/Import.tsx |
| `charToCard` | src/lib/cards.ts | editors/CharSheet.tsx, editors/bridge.ts |
| `chatToStJsonl` | src/lib/cards.ts | chat/bridge.ts, chat/menus.tsx |
| `exportCharPng` | src/lib/cards.ts | editors/CharSheet.tsx, editors/bridge.ts |
| `filesSource` | src/lib/cards.ts | editors/bridge.ts, pages/Import.tsx |
| `importFiles` | src/lib/cards.ts | editors/bridge.ts, editors/index.tsx, pages/Import.tsx, pages/Presets.tsx |
| `importME` | src/lib/cards.ts | editors/bridge.ts, pages/Import.tsx |
| `importST` | src/lib/cards.ts | editors/bridge.ts, pages/Import.tsx |
| `loreToWorld` | src/lib/cards.ts | editors/bridge.ts, editors/lore.tsx |
| `presetToSt` | src/lib/cards.ts | pages/Regex.tsx, regex/lib.ts |
| `regexFromJson` | src/lib/cards.ts | regex/dialogs.tsx, regex/lib.ts |
| `regexToSt` | src/lib/cards.ts | regex/lib.ts |
| `scanME` | src/lib/cards.ts | editors/bridge.ts, pages/Import.tsx |
| `scanST` | src/lib/cards.ts | editors/bridge.ts, pages/Import.tsx |
| `scopedRegex` | src/lib/cards.ts | features/regex.tsx, regex/lib.ts, regex/pick.tsx |
| `stPresetWithRegex` | src/lib/cards.ts | pages/Regex.tsx, regex/lib.ts |
| `summarize` | src/lib/cards.ts | editors/bridge.ts, editors/index.tsx, pages/Import.tsx, pages/Presets.tsx |

## chat

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `chatApi` (addSystemMessage, current, generate, groupTitle, insert, openDrawer, redraw, reveal, roomName, save, scrollTo, send, setStatus) | src/chat/actions.tsx (chatApi — features/chat.tsx 가 이미 옛 객체에 덮어씀) | addons/legacy.ts, chat/actions.tsx, chat/bridge.ts, diary/bridge.ts, diary/logic.ts, features/chat.tsx, features/diary.tsx, features/memoria.tsx, features/regex.tsx, features/scenebook.tsx, flow/logic.ts, memoria/bridge.ts, memoria/ui/Archive.tsx, memoria/ui/ConfigParts.tsx, memoria/ui/Library.tsx, memoria/ui/Tools.tsx, memoria/ui/parts.tsx, memoria/ui/viewsShared.tsx, modules/lib.ts, modules/logic.ts, pages/Regex.tsx, regex/lib.ts, regex/pick.tsx, scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/decorate.tsx, scenebook/dialogs.tsx, scenebook/slot.tsx, scenebook/work.ts |
| `startChat` | src/chat/start.ts (이번에 옮김) | Shell.tsx, chat/bridge.ts, editors/CharSheet.tsx, features/chat.tsx |
| `startMenu` | src/chat/start.ts (이번에 옮김) | chat/Side.tsx, chat/Top.tsx, chat/bridge.ts, chat/menus.tsx, features/chat.tsx, pages/Home.tsx |

## clock

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `Clock` (date, mode, move, ms, now, timeOf) | src/lib/clock.ts | chat/Messages.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, schedule/Editor.tsx, schedule/logic.ts |
| `clockHint` | src/lib/clock.ts | chat/bridge.ts, chat/menus.tsx |
| `clockLabel` | src/lib/clock.ts | chat/Top.tsx, chat/bridge.ts |

## cond

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `PV_TYPES` | src/lib/cond.ts | editors/PresetVars.tsx, editors/bridge.ts |
| `pvCoerce` | src/lib/cond.ts | editors/PresetVars.tsx, editors/bridge.ts |
| `pvDefault` | src/lib/cond.ts | editors/PresetVars.tsx, editors/bridge.ts |
| `pvDefs` | src/lib/cond.ts | editors/PresetVars.tsx, editors/bridge.ts |
| `pvName` | src/lib/cond.ts | editors/PresetVars.tsx, editors/bridge.ts |
| `usedVars` | src/lib/cond.ts | editors/PresetVars.tsx, editors/bridge.ts |

## core

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `arr` | src/lib/core.ts | addons/legacy.ts, assets/logic.ts, expressions/upload.tsx, flow/logic.ts, flow/qrData.ts, translate/logic.ts |
| `bytesToDataURL` | src/lib/core.ts | addons/legacy.ts, assets/logic.ts, expressions/upload.tsx |
| `clamp` | src/lib/core.ts | addons/legacy.ts, translate/Studio.tsx, translate/logic.ts |
| `dataURLToBytes` | src/lib/core.ts | addons/legacy.ts, assets/logic.ts, expressions/upload.tsx |
| `DB` (all, byOwner, clear, del, get, put) | src/lib/core.ts | addons/legacy.ts, chat/actions.tsx, chat/bridge.ts, editors/bridge.ts, expressions/store.ts, features/expressions.tsx, features/savestate.tsx, flow/logic.ts, memoria/bridge.ts, memoria/engine/legacy.ts, memoria/engine/part1.ts, memoria/engine/part3.ts, memoria/engine/part5.ts, memoria/ui/Library.tsx, memoria/ui/Tools.tsx, pages/Settings.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/frames.ts, scenebook/work.ts, vectors/logic.ts |
| `debounce` | src/lib/core.ts | addons/legacy.ts, editors/bridge.ts, editors/parts.tsx, flow/panels.tsx, memoria/bridge.ts, memoria/ui/Archive.tsx, memoria/ui/Config.tsx, memoria/ui/ConfigParts.tsx, memoria/ui/Tools.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, schedule/store.ts |
| `defaultPreset` | src/lib/core.ts | editors/bridge.ts, pages/Presets.tsx |
| `download` | src/lib/core.ts | addons/legacy.ts, assets/logic.ts, chat/bridge.ts, chat/menus.tsx, diary/Book.tsx, diary/bridge.ts, diary/dialogs.tsx, editors/CharSheet.tsx, editors/bridge.ts, editors/lore.tsx, expressions/upload.tsx, memoria/bridge.ts, memoria/ui/ConfigParts.tsx, memoria/ui/Library.tsx, memoria/ui/Story.tsx, memoria/ui/Tools.tsx, pages/Presets.tsx, pages/Settings.tsx, scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/dialogs.tsx, scenebook/slot.tsx |
| `emit` | src/lib/core.ts | addons/legacy.ts, chat/Top.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts, diary/tabs.tsx, editors/bridge.ts, flow/logic.ts, main.tsx, memoria/bridge.ts, memoria/engine/events.ts, memoria/engine/legacy.ts, memoria/engine/part1.ts, memoria/engine/part4.ts, memoria/engine/part5.ts, pages/Chat.tsx |
| `esc` | src/lib/core.ts | scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/dialogs.tsx, scenebook/png.ts |
| `fmtTime` | src/lib/core.ts | addons/legacy.ts, chat/actions.tsx, chat/bridge.ts, editors/CharSheet.tsx, flow/panels.tsx, memoria/bridge.ts, memoria/ui/Library.tsx, pages/Home.tsx, pages/Modules.tsx |
| `h` | src/lib/core.ts | editors/CharEditor.tsx, editors/CharSheet.tsx, editors/ChatPicker.tsx, editors/PresetVars.tsx, editors/bridge.ts, editors/index.tsx, editors/lore.tsx, editors/parts.tsx, features/editors.tsx, pages/Conns.tsx, pages/Import.tsx, pages/Lore.tsx, pages/Personas.tsx, pages/Presets.tsx, pages/Settings.tsx |
| `MARKERS` | src/lib/core.ts | editors/bridge.ts, pages/Presets.tsx |
| `mimeOf` | src/lib/core.ts | addons/legacy.ts, assets/logic.ts, expressions/upload.tsx |
| `msgText` | src/lib/core.ts | addons/legacy.ts, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, diary/bridge.ts, diary/logic.ts, expressions/store.ts, flow/logic.ts, memoria/bridge.ts, memoria/engine/base.ts, memoria/engine/events.ts, memoria/engine/legacy.ts, memoria/engine/part1.ts, memoria/engine/part2.ts, memoria/engine/part3.ts, memoria/engine/part5.ts, memoria/ui/ConfigParts.tsx, memoria/ui/parts.tsx, scenebook/Composer.tsx, scenebook/bridge.ts, translate/logic.ts, vectors/logic.ts |
| `newChar` | src/lib/core.ts | pages/Home.tsx |
| `newChat` | src/lib/core.ts | addons/legacy.ts, chat/actions.tsx, chat/bridge.ts, flow/logic.ts, flow/qrData.ts |
| `newConn` | src/lib/core.ts | editors/bridge.ts, pages/Conns.tsx |
| `newEntry` | src/lib/core.ts | editors/bridge.ts, editors/lore.tsx |
| `newLore` | src/lib/core.ts | editors/bridge.ts, pages/Lore.tsx |
| `newMsg` | src/lib/core.ts | addons/legacy.ts, chat/actions.tsx, chat/bridge.ts, flow/logic.ts |
| `newPersona` | src/lib/core.ts | editors/bridge.ts, pages/Personas.tsx |
| `now` | src/lib/core.ts | addons/legacy.ts, assets/Studio.tsx, assets/logic.ts, chat/Dice.tsx, chat/Hud.tsx, chat/Top.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, diary/Book.tsx, diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts, diary/parts.tsx, diary/tabs.tsx, editors/CharEditor.tsx, editors/CharSheet.tsx, editors/PresetVars.tsx, editors/bridge.ts, editors/lore.tsx, editors/parts.tsx, expressions/Picker.tsx, expressions/Studio.tsx, expressions/store.ts, features/diary.tsx, features/memoria.tsx, features/scenebook.tsx, flow/logic.ts, flow/panels.tsx, flow/qrData.ts, memoria/bridge.ts, memoria/engine/base.ts, memoria/engine/events.ts, memoria/engine/legacy.ts, memoria/engine/part1.ts, memoria/engine/part2.ts, memoria/engine/part3.ts, memoria/engine/part4.ts, memoria/engine/part5.ts, memoria/ui/Config.tsx, memoria/ui/ConfigParts.tsx, memoria/ui/Library.tsx, memoria/ui/Memories.tsx, memoria/ui/Overview.tsx, memoria/ui/Tools.tsx, memoria/ui/World.tsx, memoria/ui/parts.tsx, memoria/ui/viewsShared.tsx, pages/Chat.tsx, pages/Conns.tsx, pages/Diary.tsx, pages/Import.tsx, pages/Lore.tsx, pages/Personas.tsx, pages/Presets.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/dialogs.tsx, scenebook/frames.ts, scenebook/png.ts, scenebook/slot.tsx, schedule/Editor.tsx, schedule/store.ts, translate/Studio.tsx, translate/logic.ts, vectors/Pane.tsx, vectors/logic.ts |
| `on` | src/lib/core.ts | addons/legacy.ts, assets/Manager.tsx, assets/Studio.tsx, assets/logic.ts, assets/windows.tsx, chat/Composer.tsx, chat/Dice.tsx, chat/Drawer.tsx, chat/Hud.tsx, chat/Inspector.tsx, chat/LiveSettings.tsx, chat/Messages.tsx, chat/Side.tsx, chat/Top.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, diary/Book.tsx, diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts, diary/parts.tsx, diary/tabs.tsx, expressions/Picker.tsx, expressions/Studio.tsx, expressions/stage.ts, expressions/store.ts, expressions/upload.tsx, features/assets.tsx, features/chat.tsx, features/diary.tsx, features/expressions.tsx, features/memoria.tsx, features/regex.tsx, features/scenebook.tsx, features/schedule.tsx, features/translate.tsx, features/vectors.tsx, flow/logic.ts, flow/panels.tsx, flow/qrData.ts, flow/setup.tsx, kit.tsx, main.tsx, memoria/bridge.ts, memoria/engine/base.ts, memoria/engine/events.ts, memoria/engine/legacy.ts, memoria/engine/part1.ts, memoria/engine/part2.ts, memoria/engine/part3.ts, memoria/engine/part4.ts, memoria/engine/part5.ts, memoria/ui/Archive.tsx, memoria/ui/Config.tsx, memoria/ui/ConfigParts.tsx, memoria/ui/Library.tsx, memoria/ui/Memories.tsx, memoria/ui/Overview.tsx, memoria/ui/Story.tsx, memoria/ui/Tools.tsx, memoria/ui/World.tsx, memoria/ui/parts.tsx, memoria/ui/viewsShared.tsx, pages/Chat.tsx, pages/Diary.tsx, scenebook/Board.tsx, scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/decorate.tsx, scenebook/dialogs.tsx, scenebook/frames.ts, scenebook/png.ts, scenebook/slot.tsx, scenebook/work.ts, schedule/Editor.tsx, schedule/store.ts, translate/Studio.tsx, translate/chat.tsx, translate/logic.ts, vectors/Pane.tsx, vectors/logic.ts |
| `pickFiles` | src/lib/core.ts | addons/legacy.ts, assets/Manager.tsx, assets/logic.ts, chat/Composer.tsx, chat/Drawer.tsx, chat/bridge.ts, editors/bridge.ts, editors/index.tsx, expressions/Studio.tsx, memoria/bridge.ts, memoria/ui/ConfigParts.tsx, memoria/ui/Tools.tsx, memoria/ui/World.tsx, pages/Conns.tsx, pages/Import.tsx, pages/Presets.tsx, pages/Settings.tsx, scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/dialogs.tsx |
| `readDataURL` | src/lib/core.ts | addons/legacy.ts, assets/logic.ts, chat/Composer.tsx, chat/Drawer.tsx, chat/bridge.ts, expressions/upload.tsx |
| `S` (chars, chats, conn, connFor, conns, exportAll, get, helperConn, importAll, lore, msgs, msgsFast, persona, personas, preset, presetFor, presets, regex, remove, save, saveMsgs, saveSettings, set, settings) | src/lib/core.ts | Shell.tsx, addons/legacy.ts, assets/Manager.tsx, assets/Studio.tsx, assets/logic.ts, assets/windows.tsx, chat/Composer.tsx, chat/Dice.tsx, chat/Drawer.tsx, chat/Hud.tsx, chat/Inspector.tsx, chat/LiveSettings.tsx, chat/Messages.tsx, chat/Side.tsx, chat/Top.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, diary/Book.tsx, diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts, diary/parts.tsx, diary/tabs.tsx, editors/CharEditor.tsx, editors/CharSheet.tsx, editors/ChatPicker.tsx, editors/PresetVars.tsx, editors/bridge.ts, editors/index.tsx, editors/lore.tsx, editors/parts.tsx, expressions/Picker.tsx, expressions/Studio.tsx, expressions/stage.ts, expressions/store.ts, expressions/upload.tsx, features/assets.tsx, features/chat.tsx, features/diary.tsx, features/editors.tsx, features/expressions.tsx, features/memoria.tsx, features/scenebook.tsx, features/schedule.tsx, features/translate.tsx, features/usersettings.tsx, features/vectors.tsx, flow/logic.ts, flow/panels.tsx, flow/qrData.ts, flow/setup.tsx, memoria/bridge.ts, memoria/engine/base.ts, memoria/engine/events.ts, memoria/engine/legacy.ts, memoria/engine/part1.ts, memoria/engine/part2.ts, memoria/engine/part3.ts, memoria/engine/part4.ts, memoria/engine/part5.ts, memoria/ui/Archive.tsx, memoria/ui/Config.tsx, memoria/ui/ConfigParts.tsx, memoria/ui/Library.tsx, memoria/ui/Memories.tsx, memoria/ui/Overview.tsx, memoria/ui/Story.tsx, memoria/ui/Tools.tsx, memoria/ui/World.tsx, memoria/ui/parts.tsx, memoria/ui/viewsShared.tsx, pages/Chat.tsx, pages/Conns.tsx, pages/Diary.tsx, pages/Home.tsx, pages/Import.tsx, pages/Lore.tsx, pages/Personas.tsx, pages/Presets.tsx, pages/Settings.tsx, scenebook/Board.tsx, scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/decorate.tsx, scenebook/dialogs.tsx, scenebook/frames.ts, scenebook/png.ts, scenebook/slot.tsx, scenebook/work.ts, schedule/Editor.tsx, schedule/store.ts, studio/bridge.tsx, translate/Studio.tsx, translate/chat.tsx, translate/logic.ts, ui/CharPicker.tsx, ui/LibraryPage.tsx, vectors/Pane.tsx, vectors/logic.ts |
| `Secrets` (del, hostsFor, is, items, ok, on, put, restore, tail) | src/lib/core.ts | editors/bridge.ts, pages/Conns.tsx, pages/Settings.tsx |
| `shrinkImage` | src/lib/core.ts | addons/legacy.ts, chat/Composer.tsx, chat/Drawer.tsx, chat/bridge.ts, expressions/upload.tsx |
| `sleep` | src/lib/core.ts | diary/bridge.ts, diary/logic.ts |
| `uid` | src/lib/core.ts | addons/legacy.ts, assets/logic.ts, chat/actions.tsx, chat/bridge.ts, diary/bridge.ts, diary/logic.ts, diary/parts.tsx, editors/CharSheet.tsx, editors/PresetVars.tsx, editors/bridge.ts, editors/lore.tsx, expressions/store.ts, flow/logic.ts, flow/panels.tsx, flow/qrData.ts, memoria/bridge.ts, memoria/engine/base.ts, memoria/engine/legacy.ts, memoria/engine/part1.ts, memoria/engine/part2.ts, memoria/engine/part3.ts, memoria/engine/part4.ts, memoria/engine/part5.ts, memoria/ui/Story.tsx, memoria/ui/World.tsx, pages/Conns.tsx, pages/Home.tsx, pages/Presets.tsx, pages/Regex.tsx, regex/dialogs.tsx, regex/lib.ts, scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/dialogs.tsx, scenebook/frames.ts, scenebook/png.ts, schedule/Editor.tsx, schedule/store.ts |
| `Vault` (disable, enable, locked, on, unlock) | src/lib/core.ts | editors/bridge.ts, pages/Conns.tsx, pages/Settings.tsx |

## editors

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `charEditor` | src/editors (이미 React 판 · features/editors.tsx 가 L.editors 를 바꿔 끼움) | pages/Home.tsx |
| `charSheet` | src/editors (이미 React 판 · features/editors.tsx 가 L.editors 를 바꿔 끼움) | pages/Home.tsx |
| `importDialog` | src/editors (이미 React 판 · features/editors.tsx 가 L.editors 를 바꿔 끼움) | pages/Home.tsx |

## embed

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `cosine` | src/lib/embed.ts | vectors/logic.ts |
| `EMBED_KINDS` | src/lib/embed.ts | memoria/ui/Config.tsx, vectors/Pane.tsx, vectors/logic.ts |
| `embedKind` | src/lib/embed.ts | memoria/engine/legacy.ts, memoria/engine/part3.ts, vectors/Pane.tsx, vectors/logic.ts |
| `embedModel` | src/lib/embed.ts | memoria/engine/legacy.ts, memoria/engine/part3.ts, vectors/Pane.tsx, vectors/logic.ts |
| `embedTexts` | src/lib/embed.ts | memoria/engine/legacy.ts, memoria/engine/part3.ts, vectors/Pane.tsx, vectors/logic.ts |

## emblems

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `Emblems` | src/lib/emblems.ts | kit.tsx |

## engine

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `activeBooks` | src/lib/engine.ts | addons/legacy.ts, memoria/engine/legacy.ts, memoria/engine/part2.ts, vectors/logic.ts |
| `applyRegex` | src/lib/engine.ts | chat/actions.tsx, chat/bridge.ts |
| `buildPrompt` | src/lib/engine.ts | chat/Inspector.tsx, chat/actions.tsx, chat/bridge.ts |
| `compileRegex` | src/lib/engine.ts | regex/Debugger.tsx, regex/Editor.tsx, regex/lib.ts |
| `CONTINUE_NUDGE` | src/lib/engine.ts | editors/bridge.ts, pages/Presets.tsx |
| `GROUP_NUDGE` | src/lib/engine.ts | editors/bridge.ts, pages/Presets.tsx |
| `IMPERSONATE_NUDGE` | src/lib/engine.ts | editors/bridge.ts, pages/Presets.tsx |
| `listModels` | src/lib/engine.ts | editors/bridge.ts, pages/Conns.tsx |
| `macro` | src/lib/engine.ts | addons/legacy.ts, assets/Studio.tsx, assets/logic.ts, chat/actions.tsx, chat/bridge.ts, expressions/Studio.tsx, expressions/store.ts, features/expressions.tsx, flow/logic.ts |
| `makeCtx` | src/lib/engine.ts | addons/legacy.ts, chat/actions.tsx, chat/bridge.ts, expressions/store.ts |
| `parseServiceAccount` | src/lib/engine.ts | editors/bridge.ts, pages/Conns.tsx |
| `parseTalk` | src/lib/engine.ts | chat/actions.tsx, chat/bridge.ts |
| `postFormat` | src/lib/engine.ts | chat/actions.tsx, chat/bridge.ts |
| `prefillOk` | src/lib/engine.ts | chat/actions.tsx, chat/bridge.ts |
| `PROVIDERS` | src/lib/engine.ts | editors/bridge.ts, memoria/engine/legacy.ts, pages/Conns.tsx, pages/Format.tsx |
| `quickCall` | src/lib/engine.ts | addons/legacy.ts, chat/actions.tsx, chat/bridge.ts, diary/bridge.ts, diary/logic.ts, expressions/Studio.tsx, expressions/store.ts, memoria/engine/legacy.ts, memoria/engine/part1.ts, schedule/store.ts, translate/logic.ts |
| `regexAllowed` | src/lib/engine.ts | regex/lib.ts |
| `regexEnv` | src/lib/engine.ts | regex/Debugger.tsx, regex/lib.ts |
| `regexFind` | src/lib/engine.ts | regex/Debugger.tsx, regex/Editor.tsx, regex/lib.ts |
| `regexScripts` | src/lib/engine.ts | features/regex.tsx, regex/Debugger.tsx, regex/lib.ts |
| `regexSkip` | src/lib/engine.ts | regex/Debugger.tsx, regex/lib.ts |
| `regexStep` | src/lib/engine.ts | regex/Debugger.tsx, regex/lib.ts |
| `roll` | src/lib/engine.ts | chat/Composer.tsx, chat/Dice.tsx, chat/Messages.tsx, chat/actions.tsx, chat/bridge.ts, features/chat.tsx, pages/Chat.tsx |
| `runRegexScript` | src/lib/engine.ts | regex/Editor.tsx, regex/lib.ts |
| `scanLore` | src/lib/engine.ts | editors/bridge.ts, editors/lore.tsx |
| `splitThink` | src/lib/engine.ts | chat/actions.tsx, chat/bridge.ts |
| `streamChat` | src/lib/engine.ts | chat/actions.tsx, chat/bridge.ts, editors/bridge.ts, pages/Conns.tsx |
| `TALK_DEFAULT` | src/lib/engine.ts | editors/bridge.ts, pages/Settings.tsx |
| `tokens` | src/lib/engine.ts | addons/legacy.ts, chat/Inspector.tsx, chat/Messages.tsx, chat/bridge.ts, editors/CharEditor.tsx, editors/CharSheet.tsx, editors/bridge.ts, editors/lore.tsx, expressions/Studio.tsx, features/memoria.tsx, flow/logic.ts, memoria/bridge.ts, memoria/engine/base.ts, memoria/engine/legacy.ts, memoria/engine/part4.ts, memoria/ui/Config.tsx, memoria/ui/Overview.tsx, pages/Personas.tsx, pages/Presets.tsx, vectors/Pane.tsx |

## ext

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `catalog` (author, description, id, name, source, version) | src/lib/ext.ts | pages/Exts.tsx |
| `enabled` | src/lib/ext.ts | pages/Exts.tsx |
| `install` | src/lib/ext.ts | pages/Exts.tsx |
| `installFromUrl` | src/lib/ext.ts | pages/Exts.tsx |
| `loaded` | src/lib/ext.ts | pages/Exts.tsx |
| `readCatalog` | src/lib/ext.ts | pages/Exts.tsx |
| `setEnabled` | src/lib/ext.ts | pages/Exts.tsx |
| `TEMPLATE` | src/lib/ext.ts | pages/Exts.tsx |
| `unload` | src/lib/ext.ts | pages/Exts.tsx |

## f-bind

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `buildBook` | src/lib/f-bind.ts | diary/bridge.ts, diary/logic.ts |

## f-keepsake

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `addDays` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/dialogs.tsx, features/diary.tsx |
| `chaptersOf` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts |
| `collectDays` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, diary/tabs.tsx, features/diary.tsx |
| `dayKey` | src/lib/f-keepsake.ts | diary/Book.tsx, diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts, diary/tabs.tsx, features/diary.tsx |
| `diffDays` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, diary/tabs.tsx, features/diary.tsx |
| `extractPromises` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts |
| `fillToPhase` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/parts.tsx, diary/tabs.tsx, features/diary.tsx |
| `keyDate` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, diary/tabs.tsx |
| `koDate` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, diary/tabs.tsx, features/diary.tsx |
| `mergePromises` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts |
| `monthGrid` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, diary/tabs.tsx |
| `monthKey` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, diary/tabs.tsx, features/diary.tsx |
| `MONTHS_EN` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/dialogs.tsx, diary/tabs.tsx |
| `monthStats` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, diary/tabs.tsx, features/diary.tsx |
| `moonPath` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/parts.tsx |
| `msgTs` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, features/diary.tsx |
| `normTime` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts, features/diary.tsx |
| `pad` | src/lib/f-keepsake.ts | diary/Book.tsx, diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts, diary/parts.tsx, diary/tabs.tsx |
| `phaseAt` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts |
| `phaseIndex` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts |
| `phaseName` | src/lib/f-keepsake.ts | diary/Book.tsx, diary/bridge.ts, diary/logic.ts, diary/tabs.tsx, features/diary.tsx |
| `PHASES` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts |
| `photosOf` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts |
| `promiseDigest` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts |
| `promiseState` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, diary/tabs.tsx, features/diary.tsx |
| `resolveDate` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts, features/diary.tsx |
| `scenesOf` | src/lib/f-keepsake.ts | diary/Book.tsx, diary/bridge.ts |
| `seatOf` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/parts.tsx |
| `shiftMonth` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, diary/tabs.tsx |
| `stripPromiseTags` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts, features/diary.tsx |
| `swipeOf` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts |
| `syncKeepsakes` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/logic.ts |
| `validKey` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts, diary/tabs.tsx |
| `WEEK` | src/lib/f-keepsake.ts | diary/bridge.ts, diary/tabs.tsx |

## f-lore

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `loreLinker` | src/editors/lore.tsx (<LoreLinker holder save fixed />, 꼴 같음) | chat/Drawer.tsx, chat/bridge.ts |

## f-modules

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `MOD_ASSET_PROMPT` | src/modules/logic.ts (이번에 옮김) | modules/lib.ts, modules/logic.ts, pages/Modules.tsx |
| `Modules` (byId, create, duplicate, effective, exportModule, handOver, installPack, list, load, loreState, ownerOf, readPack, regexState, remove, save, setRoom, wake) | src/modules/logic.ts (Modules · 이번에 옮김) | modules/lib.ts, modules/logic.ts, pages/Modules.tsx |

## f-schedule

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `cooldownLeft` | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/actions.tsx, chat/bridge.ts |
| `MOTIVE_ORDER` | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/LiveSettings.tsx, chat/actions.tsx, chat/bridge.ts |
| `motiveLabel` | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/LiveSettings.tsx, chat/Messages.tsx, chat/bridge.ts |
| `MOTIVES` | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/LiveSettings.tsx, chat/bridge.ts |
| `pickMotive` | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/actions.tsx, chat/bridge.ts |
| `planAuto` | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/actions.tsx, chat/bridge.ts |
| `replyDelay` | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/actions.tsx, chat/bridge.ts |
| `Schedule` (edit, onChange, row) | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/Drawer.tsx, chat/LiveSettings.tsx, chat/bridge.ts, chat/menus.tsx, features/schedule.tsx, schedule/Editor.tsx, schedule/store.ts |
| `scheduleOf` | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/Drawer.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx |
| `STATUS` | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/Drawer.tsx, chat/Top.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx |
| `wakeIn` | src/lib/f-schedule.ts (화면 쪽 Schedule.edit/row 는 src/schedule) | chat/actions.tsx, chat/bridge.ts |

## format

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `render` | src/lib/format.ts | chat/Drawer.tsx, chat/actions.tsx, chat/bridge.ts, pages/Themes.tsx |

## hooks

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `dropOwner` | src/lib/hooks.ts | diary/bridge.ts, features/diary.tsx |
| `runFilters` | src/lib/hooks.ts | chat/actions.tsx, chat/bridge.ts |
| `X` (actions, before, commands, composer, filters, loreVec, macros, panels, prompt, studio, translate) | src/lib/hooks.ts | addons/legacy.ts, assets/logic.ts, assets/windows.tsx, chat/Composer.tsx, chat/Dice.tsx, chat/Drawer.tsx, chat/Messages.tsx, chat/actions.tsx, chat/bridge.ts, diary/bridge.ts, editors/CharEditor.tsx, editors/CharSheet.tsx, editors/ChatPicker.tsx, editors/PresetVars.tsx, editors/bridge.ts, expressions/Picker.tsx, expressions/Studio.tsx, expressions/stage.ts, expressions/store.ts, expressions/upload.tsx, features/assets.tsx, features/diary.tsx, features/editors.tsx, features/expressions.tsx, features/memoria.tsx, features/modulesPanel.tsx, features/regex.tsx, features/scenebook.tsx, features/schedule.tsx, features/translate.tsx, features/vectors.tsx, flow/logic.ts, flow/panels.tsx, flow/qrData.ts, flow/setup.tsx, memoria/bridge.ts, memoria/ui/Archive.tsx, memoria/ui/Config.tsx, memoria/ui/ConfigParts.tsx, memoria/ui/Memories.tsx, memoria/ui/Story.tsx, memoria/ui/World.tsx, memoria/ui/viewsShared.tsx, pages/Conns.tsx, pages/Personas.tsx, pages/Studio.tsx, scenebook/Board.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/png.ts, schedule/Editor.tsx, schedule/store.ts, translate/Studio.tsx, translate/chat.tsx, translate/logic.ts, vectors/logic.ts |

## illust

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `ANALYSIS_PROMPT` | src/lib/illust.ts | scenebook/bridge.ts, scenebook/dialogs.tsx |
| `BACKENDS` | src/lib/illust.ts | scenebook/Studio.tsx, scenebook/bridge.ts |
| `Illust` (account, analysisRules, analyze, blocks, cancelWaiting, cfg, compileCharacter, compileScene, compose, cooldown, data, enqueue, extract, genConfig, hasVisual, insert, library, load, outputRules, queue, queuePaused, queueRunning, readPlan, ready, remove, resetVisual, review, saveCfg, saveVisual, select, slot, strip, takePlan, toggleQueue, usage, validate, visual, visualKey, visualScope) | src/lib/illust.ts | chat/Messages.tsx, chat/actions.tsx, chat/bridge.ts, diary/Book.tsx, diary/bridge.ts, diary/logic.ts, diary/tabs.tsx, features/scenebook.tsx, pages/Chat.tsx, scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/decorate.tsx, scenebook/dialogs.tsx, scenebook/png.ts, scenebook/slot.tsx, scenebook/work.ts, translate/logic.ts |
| `LEAN_PROMPT` | src/lib/illust.ts | scenebook/bridge.ts, scenebook/dialogs.tsx |
| `MODELS` | src/lib/illust.ts | scenebook/Board.tsx, scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/dialogs.tsx, scenebook/png.ts |
| `NAI_MODELS` | src/lib/illust.ts | pages/Studio.tsx |
| `PLAN_PROMPT` | src/lib/illust.ts | pages/Studio.tsx, scenebook/bridge.ts, scenebook/dialogs.tsx |
| `REF_OWNER` | src/lib/illust.ts | scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/work.ts |
| `RENDER_KEYS` | src/lib/illust.ts | scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts |
| `SAMPLERS` | src/lib/illust.ts | scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/png.ts |
| `SCHEDULERS` | src/lib/illust.ts | scenebook/Composer.tsx, scenebook/Studio.tsx, scenebook/bridge.ts, scenebook/png.ts |
| `snapPoint` | src/lib/illust.ts | scenebook/Board.tsx, scenebook/Composer.tsx, scenebook/bridge.ts |
| `TRANSLATE_PROMPT` | src/lib/illust.ts | pages/Studio.tsx |
| `translateText` | src/lib/illust.ts | chat/actions.tsx, chat/bridge.ts |

## live

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `cdHours` | src/lib/live.ts | chat/actions.tsx, chat/bridge.ts |
| `copyState` | src/lib/live.ts | chat/Hud.tsx, chat/bridge.ts |
| `ensureDefaults` | src/lib/live.ts | chat/LiveSettings.tsx |
| `inQuietHours` | src/lib/live.ts | chat/actions.tsx, chat/bridge.ts |
| `Live` (apply, arm, castFields, clearPresence, clock, editState, extract, fields, hud, onChange, onUser, pending, ping, planOf, poke, presence, readCall, rewind, setPresence, setUserStatus, setValue, settings, span, stamp, state, toggle, touch, trackCall, userStatus, userStatuses, view) | src/lib/live.ts | chat/Drawer.tsx, chat/Hud.tsx, chat/Inspector.tsx, chat/LiveSettings.tsx, chat/Top.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, features/chat.tsx |
| `mo` | src/lib/live.ts | chat/Composer.tsx, chat/Dice.tsx, chat/Drawer.tsx, chat/Hud.tsx, chat/Inspector.tsx, chat/LiveSettings.tsx, chat/Messages.tsx, chat/Side.tsx, chat/Top.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, features/chat.tsx, pages/Chat.tsx |
| `newLater` | src/lib/live.ts | chat/actions.tsx, chat/bridge.ts |
| `PROMPTS` | src/lib/live.ts | chat/LiveSettings.tsx, chat/bridge.ts |
| `quietLeft` | src/lib/live.ts | chat/actions.tsx, chat/bridge.ts |
| `rewound` | src/lib/live.ts | chat/Hud.tsx, chat/bridge.ts |
| `snapOf` | src/lib/live.ts | chat/Hud.tsx, chat/bridge.ts |
| `stateAt` | src/lib/live.ts | chat/Hud.tsx, chat/bridge.ts |
| `timeline` | src/lib/live.ts | chat/Hud.tsx, chat/bridge.ts |
| `tk` | src/lib/live.ts | chat/bridge.ts |

## memory

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `chunkDossier` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/World.tsx |
| `DOSSIER_MAX` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/World.tsx |
| `fmtDays` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | features/memoria.tsx, memoria/bridge.ts, memoria/ui/Library.tsx, memoria/ui/Overview.tsx, memoria/ui/Story.tsx, memoria/ui/Tools.tsx, memoria/ui/parts.tsx |
| `KINDS` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/Config.tsx, memoria/ui/Memories.tsx, memoria/ui/Overview.tsx, memoria/ui/Story.tsx, memoria/ui/Tools.tsx, memoria/ui/parts.tsx |
| `LANGS` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/Config.tsx |
| `LOCKS` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/Overview.tsx, memoria/ui/Tools.tsx, memoria/ui/World.tsx |
| `Memory` (activity, activityLog, add, applyOps, ask, autoHide, bondNow, busy, carry, cfg, checkOf, checkReply, checkpoint, checkpointData, checkpoints, clearActivity, commit, consolidate, diff, direct, dropTurn, exportData, foldAliases, get, injection, isSideMessage, last, load, logActivity, mergeCast, normalize, overridden, override, packet, pending, pin, post, prepare, propose, readExport, recalClock, recallEx, received, reconcile, regroup, reinjectNow, replace, reset, rewritePacket, save, scene, snapshot, tagSideMessage) | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | chat/Top.tsx, chat/actions.tsx, chat/bridge.ts, diary/bridge.ts, diary/logic.ts, features/memoria.tsx, memoria/bridge.ts, memoria/ui/Archive.tsx, memoria/ui/Config.tsx, memoria/ui/ConfigParts.tsx, memoria/ui/Library.tsx, memoria/ui/Overview.tsx, memoria/ui/Tools.tsx, memoria/ui/parts.tsx, memoria/ui/viewsShared.tsx, pages/Chat.tsx |
| `MEMORY_DEFAULTS` (activeBundle, arcConsolidateEvery, arcMergeAt, associative, audit, authorizePrivate, auto, autoHide, banInChat, banTell, bannedPhrases, bundleBase, bundleByOwner, bundles, cast, chunkTurns, consolidateEvery, depth, embed, enabled, eraKeep, fossil, items, keepRecent, language, lockEdited, maxMemories, maxPerKind, maxPerTurn, milestones, minCosine, minScore, mmrLambda, multiQueryRecent, noticed, perspective, position, preserveRecent, prompt, promptOutdated, promptRev, prompts, qrMode, reasoningHeadroom, recallQuotes, recallWaitSec, recordDelay, refLore, refProfile, replyCheck, responseTokens, settingsRev, splitInjection, stableRefreshTurns, statusInject, statusMode, statusPattern, storyClock, styleGuard, summaryContextCount, supervisor, threadSleepTurns, tokenBudget, topK, trim, voiceSamples, watchUpdates, yieldToChat) | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/Config.tsx, memoria/ui/ConfigParts.tsx, memoria/ui/parts.tsx |
| `NARRATOR` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/Config.tsx |
| `parseLoose` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | diary/bridge.ts, diary/logic.ts |
| `PROMPTS` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/Config.tsx |
| `PUBLIC_ONLY` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/Config.tsx |
| `SCOPES` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/World.tsx |
| `SHELF_LABELS` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/parts.tsx |
| `VIS` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/Memories.tsx, memoria/ui/parts.tsx |
| `visibleProse` | src/memoria/engine (Memory) · 상수는 src/memoria/prompts 등 | memoria/bridge.ts, memoria/ui/ConfigParts.tsx, memoria/ui/parts.tsx |

## regex-lint

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `diffParts` | src/lib/regex-lint.ts | regex/lib.ts, regex/parts.tsx |
| `hitParts` | src/lib/regex-lint.ts | regex/lib.ts, regex/parts.tsx |
| `lintScript` | src/lib/regex-lint.ts | regex/Editor.tsx, regex/lib.ts |
| `SKIP_TEXT` | src/lib/regex-lint.ts | regex/Debugger.tsx, regex/lib.ts |
| `skipDetail` | src/lib/regex-lint.ts | regex/Debugger.tsx, regex/lib.ts |
| `tally` | src/lib/regex-lint.ts | regex/Debugger.tsx, regex/Editor.tsx, regex/lib.ts |
| `whyNoMatch` | src/lib/regex-lint.ts | regex/Debugger.tsx, regex/Editor.tsx, regex/lib.ts |

## studio

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `assetsPane` | src/studio/AssetsPane.tsx (assetsPane · 이번에 옮김) | editors/CharEditor.tsx, editors/bridge.ts, pages/Personas.tsx |

## theme

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `allThemes` | src/lib/theme.ts | pages/Themes.tsx |
| `applyTheme` | src/lib/theme.ts | editors/bridge.ts, pages/Settings.tsx, pages/Themes.tsx |
| `COLOR_FIELDS` | src/lib/theme.ts | pages/Themes.tsx |
| `currentTheme` | src/lib/theme.ts | pages/Themes.tsx |
| `FONTS` | src/lib/theme.ts | pages/Themes.tsx |
| `importThemeText` | src/lib/theme.ts | pages/Themes.tsx |
| `newCustomTheme` | src/lib/theme.ts | pages/Themes.tsx |

## tone

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `tint` | src/lib/tone.ts | chat/Messages.tsx, chat/Top.tsx, kit.tsx, pages/Chat.tsx, pages/Home.tsx |

## ui

| 이름 | 대신하는 곳 | 부르는 파일 |
|---|---|---|
| `charPicker` | src/ui | addons/legacy.ts, chat/bridge.ts, chat/menus.tsx, expressions/Studio.tsx |
| `confirmBox` | src/ui | addons/legacy.ts, assets/Manager.tsx, assets/Studio.tsx, assets/logic.ts, assets/windows.tsx, chat/Hud.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, expressions/Studio.tsx, flow/logic.ts, flow/panels.tsx, schedule/Editor.tsx, translate/Studio.tsx, translate/logic.ts |
| `form` | src/ui (<Form>) | addons/legacy.ts, assets/logic.ts, chat/Dice.tsx, chat/Hud.tsx, chat/LiveSettings.tsx, chat/Messages.tsx, chat/actions.tsx, chat/bridge.ts, expressions/Studio.tsx, flow/logic.ts, flow/panels.tsx, memoria/bridge.ts, memoria/ui/ConfigParts.tsx, translate/Studio.tsx |
| `go` | src/lib/router.ts | Shell.tsx, addons/legacy.ts, chat/Hud.tsx, chat/Side.tsx, chat/Top.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, diary/Book.tsx, diary/bridge.ts, diary/dialogs.tsx, diary/logic.ts, diary/tabs.tsx, editors/CharSheet.tsx, editors/PresetVars.tsx, expressions/stage.ts, expressions/upload.tsx, features/diary.tsx, features/expressions.tsx, features/modulesPanel.tsx, features/regex.tsx, flow/logic.ts, flow/panels.tsx, memoria/ui/parts.tsx, memoria/ui/viewsShared.tsx, pages/Chat.tsx, pages/Conns.tsx, pages/Home.tsx, pages/Modules.tsx, pages/Presets.tsx, pages/Regex.tsx, pages/Settings.tsx, scenebook/bridge.ts, schedule/store.ts, translate/Studio.tsx, translate/chat.tsx, translate/logic.ts |
| `I` | src/lib/icons.ts | expressions/stage.ts, flow/logic.ts, kit.tsx, memoria/ui/parts.tsx |
| `menu` | src/ui (menu) | addons/legacy.ts, chat/Composer.tsx, chat/Drawer.tsx, chat/Hud.tsx, chat/Messages.tsx, chat/Side.tsx, chat/Top.tsx, chat/bridge.ts, chat/menus.tsx, flow/logic.ts, flow/panels.tsx, schedule/Editor.tsx |
| `modal` | src/ui (openModal) | addons/legacy.ts, assets/windows.tsx, chat/actions.tsx, chat/bridge.ts, expressions/Studio.tsx, expressions/stage.ts, memoria/bridge.ts, memoria/ui/Archive.tsx |
| `moonPhase` | src/lib/moon.ts | diary/Book.tsx, diary/bridge.ts, diary/tabs.tsx, kit.tsx, pages/Home.tsx |
| `promptBox` | src/ui | addons/legacy.ts, assets/Manager.tsx, assets/Studio.tsx, chat/Composer.tsx, chat/Hud.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, expressions/Studio.tsx, flow/panels.tsx, translate/Studio.tsx |
| `refresh` | src/lib/router.ts | editors/bridge.ts |
| `registerPage` | src/lib/router.ts | main.tsx |
| `route` (arg, page) | src/lib/router.ts | Shell.tsx, addons/legacy.ts, chat/actions.tsx, chat/bridge.ts, diary/Book.tsx, diary/bridge.ts, diary/logic.ts, editors/bridge.ts, editors/parts.tsx, features/chat.tsx, features/regex.tsx, features/usersettings.tsx, flow/logic.ts, memoria/bridge.ts, memoria/ui/ConfigParts.tsx, memoria/ui/parts.tsx, memoria/ui/viewsShared.tsx, pages/Chat.tsx, pages/Regex.tsx, regex/lib.ts, ui/LibraryPage.tsx |
| `toast` | src/ui (toast) | addons/legacy.ts, assets/Manager.tsx, assets/Studio.tsx, assets/logic.ts, assets/windows.tsx, chat/Inspector.tsx, chat/LiveSettings.tsx, chat/Messages.tsx, chat/Top.tsx, chat/actions.tsx, chat/bridge.ts, chat/menus.tsx, expressions/Picker.tsx, expressions/Studio.tsx, expressions/stage.ts, expressions/upload.tsx, features/assets.tsx, features/expressions.tsx, features/translate.tsx, features/vectors.tsx, flow/logic.ts, flow/panels.tsx, flow/setup.tsx, main.tsx, memoria/bridge.ts, schedule/Editor.tsx, translate/Studio.tsx, translate/chat.tsx, translate/logic.ts, vectors/Pane.tsx |

## 담당별 개수

| 대신하는 곳 | 이름 수 |
|---|---|
| src/lib/f-keepsake.ts | 34 |
| src/lib/core.ts | 32 |
| src/lib/engine.ts | 29 |
| src/lib/cards.ts | 18 |
| src/memoria/engine | 16 |
| src/lib/advanced.ts | 15 |
| src/lib/illust.ts | 14 |
| src/lib/live.ts | 14 |
| src/lib/f-schedule.ts | 11 |
| src/lib/ext.ts | 9 |
| src/lib/regex-lint.ts | 7 |
| src/lib/theme.ts | 7 |
| src/ui | 7 |
| src/lib/cond.ts | 6 |
| src/lib/embed.ts | 5 |
| src/lib/assets.ts | 4 |
| src/lib/router.ts | 4 |
| src/lib/clock.ts | 3 |
| src/editors | 3 |
| src/lib/hooks.ts | 3 |
| 2단계 | 2 |
| src/chat/start.ts | 2 |
| src/modules/logic.ts | 2 |
| src/chat/actions.tsx | 1 |
| src/lib/emblems.ts | 1 |
| src/lib/f-bind.ts | 1 |
| src/editors/lore.tsx | 1 |
| src/lib/format.ts | 1 |
| src/studio/AssetsPane.tsx | 1 |
| src/lib/tone.ts | 1 |
| src/lib/icons.ts | 1 |
| src/lib/moon.ts | 1 |

모두 256개.

## 다리가 아닌 "뜨면서 하던 등록" (2단계에서 두 번 등록되지 않게)

옛 파일은 import 되는 순간 훅 · 명령 · 이벤트를 등록한다. 지금 실제로 뜨는 옛 파일(boot.js 의 import + FEATURES `f-modules`, `f-regex` + needs 로 미리 부르는 것)의 등록과 그 TS 판:

| 옛 파일 | 등록 | TS 판 | 상태 |
|---|---|---|---|
| studio.js | `X.covered`, X.prompt `mode` · `illust` (그리고 `assets`) | `src/next-features/studioPrompts.tsx` → `src/studio/prompts.ts` `registerStudioPrompts()` (`assets` 는 `src/assets/logic.ts` 가 이미 갈아 끼움) | 꺼 둠 |
| f-modules.js | X.prompt `modules`, X.filters `modules`, `on('chat:open')`, `on('route')`, X.panels `modules` | `src/next-features/modulesHooks.tsx` → `src/modules/logic.ts` `wireModules()` + 빈 패널 자리 (내용은 `features/modulesPanel.tsx` 가 render 를 바꿔 끼움) | 꺼 둠 |
| f-presetvars.js | X.panels `presetvars` | `src/features/editors.tsx` | 켜짐 |
| f-regex.js | 명령 2개 · `chat:open` | `src/features/regex.tsx` | 켜짐 |
| f-schedule.js | X.studio `schedule` | `src/features/schedule.tsx` | 켜짐 |
| chat.js | `clock` · `clock:tick` · `settings` · keydown · visibilitychange · 30초 타이머 | `src/features/chat.tsx` | 켜짐 (옛 것도 같이 돌지만 화면 검사로 막힘) |
| savestate.js | input/change · beforeunload · 표시 | `src/features/savestate.tsx` | 켜짐 |
| clock.js · live.js · engine.js · illust.js · memory.js · advanced.js · ui.js · boot.js | 모듈 맨 위의 on · X 등록 · 타이머 | 각 `src/lib/*.ts` (모듈을 import 하는 순간 등록됨) | 2단계에서 옛 것을 지울 때 함께 |

켜는 순서 (2단계):
1. 다리를 `src/lib` 로 돌리기 전에 `next-features` 두 파일을 `src/features/` 로 옮기고 `feature` 로 이름을 바꾼다. `modulesHooks` 는 이름 차례가 `modulesPanel` 보다 앞이어야 한다(그래야 패널 자리가 먼저 생긴다).
2. 같은 커밋에서 boot.js FEATURES 의 `'f-modules'` 와 boot.js 의 `import './studio.js'` 를 뺀다 (`wireModules` 의 프롬프트 · 걸러내기는 주인 이름으로 걸러 내고 넣지만 `on('chat:open')` · `on('route')` 는 두 번 걸린다).
3. 옛 `f-modules.js` 가 사라지면 `src/modules/lib.ts` 의 `M()` 은 `logic.ts` 의 `Modules`, `MOD_ASSET_PROMPT()` 는 같은 파일의 상수로.
4. 훅 차례: 새 판은 `mode` 가 `assets` 뒤에 들어가지만 `src/chat/bridge.ts` 의 `orderHooks()` 가 화면 이동 때마다 정해진 차례로 다시 줄 세우므로 프롬프트 차례는 같다.
