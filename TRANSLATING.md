# Translating Dreamland

Screen text lives in `src/i18n/locales/<code>.json`. `ko.json` is the source; every other language has the same keys.

- **Fix a translation**: edit the value in that language's file. Keep `{slots}` exactly as they are in `ko.json`.
- **Plurals**: keys ending in `.one` / `.other` (and `.few`, `.many` … where the language needs them, per `Intl.PluralRules`). `{count}` is the number.
- **Add a language**: copy `en.json` to `<code>.json` (e.g. `ja.json`, `zh-TW.json`), translate the values, then add one line to `LOCALES` in `src/i18n/index.ts` with the language's own name.
- **Check**: `npm run i18n:check` lists missing keys, extra keys and slot mismatches. A missing key falls back to English, then Korean.

Not translated on purpose: prompts and default instructions sent to the model, and anything the user wrote (characters, presets, chats).

Terms follow SillyTavern's English and Chinese UI where the concept is the same (preset, lorebook / 世界书, persona, quick reply, extension …).
