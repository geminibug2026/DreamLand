// 실리태번 Tavern Helper 의 나머지 함수 (로어북 · 프리셋 · 캐릭터 · 페르소나 · 정규식 · 오디오 · 끼워 넣기 · 스크립트 · 확장 …).
// th-shim.js 가 부른다. 스크립트 화면과, 이 함수들을 쓰는 메시지 속 화면에만 깐다 (앱이 화면 글을 보고 정한다 — init.more)
window.__dlThMore = function (E) {
  var I = E.I, call = E.call, eventOn = E.eventOn, clone = E.clone, msgs = E.msgs, lastId = E.lastId, TH = E.TH, substitudeMacros = E.sub;
  var H = E.H, T = E.T, X = E.X, own = E.own, api = E.api, getButtonEvent = E.getButtonEvent, SCRIPT = !!I.script;
  /** 동기 함수: 스크립트는 앱에서 바로, 메시지 속 화면은 사본(local)으로 */
  function sync(name, local) { return function () { var h = H(); if (h) { var r = h.call(window, name, [].slice.call(arguments)); return r && typeof r.then === "function" ? (r.catch(function (e) { console.error(e); }), undefined) : own(r); } return local.apply(null, arguments); }; }
  /** 메시지 속 화면의 동기 쓰기: 앱에 보내 두고 기다리지 않는다 */
  function fireTh(name, args) { call("th", [name, [].slice.call(args || [])]).catch(function (e) { console.warn("[" + name + "]", e && e.message || e); }); }
  var A = function (name) { return function () { return api(name, arguments); }; };
  var then = function (v, f) { return v && typeof v.then === "function" ? v.then(f) : f(v); };
  var blobUrl = function (b) { return new Promise(function (res) { if (!b || typeof b !== "object" || typeof b.arrayBuffer !== "function") return res(b); var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { res(""); }; r.readAsDataURL(b); }); };
  var resp = function (r) { r = r || {}; var body = r.b64 != null ? Uint8Array.from(atob(r.b64), function (c) { return c.charCodeAt(0); }) : (r.body || ""); return new Response(r.status === 204 ? null : body, { status: r.status || 200, statusText: r.statusText || "" }); };
  var Ar = function (name) { return function () { return api(name, arguments).then(resp); }; };
  function warnOnce(k) { if (warnOnce[k]) return; warnOnce[k] = 1; console.warn("[DreamLand] " + k + ": 메시지 속 화면에서는 앱이 보내 둔 사본으로 답합니다 (바로 바뀐 값이 늦게 보일 수 있습니다)"); }
  var curName = function (n) { return n == null || n === "current" || (T().cur && (n === T().cur.name || n === T().cur.id || n === T().cur.id + ".png")); };

  // ── 로어북 (worldbook · lorebook) ──
  var wb = function () { return (T().wb || []).slice(); };
  var charWb = function (n) { return curName(n) ? own(T().cwb || { primary: null, additional: [] }) : { primary: null, additional: [] }; };
  function updateWorldbookWith(name, fn, opt) { return api("getWorldbook", [name]).then(function (l) { return fn(l); }).then(function (l) { return api("replaceWorldbook", [name, l, opt]); }).then(function () { return api("getWorldbook", [name]); }); }
  function deleteWorldbookEntries(name, pred, opt) { var gone = []; return updateWorldbookWith(name, function (l) { var keep = []; l.forEach(function (e) { (pred(e) ? gone : keep).push(e); }); return keep; }, opt).then(function (w) { return { worldbook: w, deleted_entries: gone }; }); }
  function updateLorebookEntriesWith(name, fn) { return api("getLorebookEntries", [name]).then(function (l) { return fn(l); }).then(function (l) { return api("replaceLorebookEntries", [name, l]); }).then(function () { return api("getLorebookEntries", [name]); }); }
  // ── 프리셋 ──
  var SYS_P = ["main", "nsfw", "jailbreak", "enhanceDefinitions"], HOLD_P = ["worldInfoBefore", "personaDescription", "charDescription", "charPersonality", "scenario", "worldInfoAfter", "dialogueExamples", "chatHistory"];
  var isPresetSystemPrompt = function (p) { return SYS_P.indexOf(p && p.id) >= 0; }, isPresetPlaceholderPrompt = function (p) { return HOLD_P.indexOf(p && p.id) >= 0; }, isPresetNormalPrompt = function (p) { return !isPresetSystemPrompt(p) && !isPresetPlaceholderPrompt(p); };
  var holderNames = { worldInfoBefore: "World Info (before)", personaDescription: "Persona Description", charDescription: "Char Description", charPersonality: "Char Personality", scenario: "Scenario", worldInfoAfter: "World Info (after)", dialogueExamples: "Chat Examples", chatHistory: "Chat History" };
  var default_preset = { settings: { max_context: 2000000, max_completion_tokens: 300, reply_count: 1, should_stream: false, temperature: 1, frequency_penalty: 0, presence_penalty: 0, repetition_penalty: 1, top_p: 1, min_p: 0, top_k: 0, top_a: 0, seed: -1, squash_system_messages: false, reasoning_effort: "auto", request_thoughts: false, request_images: false, enable_function_calling: false, enable_web_search: false, allow_sending_images: "disabled", allow_sending_videos: false, character_name_prefix: "none", wrap_user_messages_in_quotes: false },
    prompts: HOLD_P.map(function (id) { return { id: id, name: holderNames[id], enabled: true, position: { type: "relative" }, role: "system" }; }), prompts_unused: [], extensions: { tavern_helper: { scripts: [], variables: {} } } };
  function getPresetLocal(n) { var p = X().preset; n = n == null ? "in_use" : n; if (p && (p[n] || (n === T().preset && p.in_use))) return own(p[n] || p.in_use); warnOnce("getPreset"); return own(default_preset); }
  function updatePresetWith(name, fn, opt) { return api("getPreset", [name]).then(function (p) { return fn(p); }).then(function (p) { return api("replacePreset", [name, p, opt]); }).then(function () { return api("getPreset", [name]); }); }
  // ── 캐릭터 · 페르소나 ──
  function withAvatar(x) { if (!x || typeof x !== "object" || !x.avatar || typeof x.avatar === "string") return Promise.resolve(x); return blobUrl(x.avatar).then(function (u) { var y = Object.assign({}, x); y.avatar = u; return y; }); }
  var charA = function (name) { return function (ref, x, opt) { return withAvatar(x).then(function (y) { return api(name, [ref, y, opt]); }); }; };
  function updateCharacterWith(ref, fn) { return api("getCharacter", [ref]).then(function (c) { return fn(c); }).then(function (c) { return charA("replaceCharacter")(ref, c); }).then(function () { return api("getCharacter", [ref]); }); }
  function updatePersonaWith(ref, fn, opt) { return api("getPersona", [ref]).then(function (p) { return fn(p); }).then(function (p) { return charA("replacePersona")(ref, p, opt); }).then(function () { return api("getPersona", [ref]); }); }
  var personaLocal = function (ref) { var l = T().personas || [], cur = T().persona || {}; var id = ref == null || ref === "current" ? cur.id : ref; for (var i = 0; i < l.length; i++) if (l[i].avatar_id === id || l[i].name === id) return own(l[i]); throw new Error("persona '" + ref + "' not found"); };
  var getCharData = sync("getCharData", function (n) { return curName(n) ? own(X().charData || { name: I.char, avatar: I.charAvatar || "", data: {} }) : null; });
  function RawCharacter(d) { this.d = d || {}; }
  RawCharacter.find = function (o) { return getCharData((o && o.name) || "current"); };
  RawCharacter.findIndex = sync("rawCharIndex", function (n) { var l = T().chars || []; for (var i = 0; i < l.length; i++) if (l[i][0] === n || l[i][1] === n || (curName(n) && T().cur && l[i][0] === T().cur.id)) return i; return -1; });
  RawCharacter.getChatsFromFiles = function (data) { return api("getChatHistoryDetail", [data]).then(function (r) { return r || {}; }); };
  RawCharacter.prototype.getCardData = function () { return this.d; };
  RawCharacter.prototype.getAvatarId = function () { return this.d.avatar || ""; };
  RawCharacter.prototype.getRegexScripts = function () { return ((this.d.data || {}).extensions || {}).regex_scripts || []; };
  RawCharacter.prototype.getCharacterBook = function () { return (this.d.data || {}).character_book || null; };
  RawCharacter.prototype.getWorldName = function () { return ((this.d.data || {}).extensions || {}).world || ""; };
  // ── 정규식 ──
  var rxList = function (o) { var x = X().regex; o = o || { type: "global" }; if (!x) { warnOnce("getTavernRegexes"); return []; } return own(x[o.type === "character" ? "character" : o.type === "preset" ? "preset" : "global"] || []); };
  function rxRun(text, source, dest, o) {
    // 메시지 속 화면: 사본의 정규식을 이 화면에서 돌린다 (앱과 같은 차례: 전역 → 프리셋 → 캐릭터)
    var x = X().regex; if (!x) { warnOnce("formatAsTavernRegexedString"); return String(text); }
    o = o || {}; var out = String(text);
    [].concat(x.global || [], x.preset || [], T().rxChar ? x.character || [] : []).forEach(function (r) {
      if (!r.enabled || !r.source || !r.source[source] || !r.destination || !(r.destination[dest] || (!r.destination.display && !r.destination.prompt))) return;
      if (typeof o.depth === "number" && ((r.min_depth != null && r.min_depth >= -1 && o.depth < r.min_depth) || (r.max_depth != null && r.max_depth >= 0 && o.depth > r.max_depth))) return;
      var m = /^\/([\s\S]+)\/([a-z]*)$/.exec(r.find_regex || ""), re; try { re = m ? new RegExp(m[1], m[2]) : new RegExp(r.find_regex); } catch (e) { return; }
      var rep = String(r.replace_string || "").replace(/\{\{match\}\}/gi, "$0");
      out = out.replace(re, function () { var a = [].slice.call(arguments), whole = a[0]; return rep.replace(/\$(\d+)/g, function (_m, n) { var v = +n === 0 ? whole : a[+n]; v = v == null ? "" : String(v); (r.trim_strings || []).forEach(function (t) { if (t) v = v.split(t).join(""); }); return v; }); });
    });
    return out;
  }
  function updateTavernRegexesWith(fn, o) { return api("getTavernRegexes", [o]).then(function (l) { return fn(l); }).then(function (l) { return api("replaceTavernRegexes", [l, o]); }).then(function () { return api("getTavernRegexes", [o]); }); }
  // ── 끼워 넣기 · 매크로 ──
  var filters = {}, filterOn = false;
  function injectPrompts(list, opt) {
    list = (list || []).map(function (p) { return Object.assign({}, p, { id: p.id || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) }); });
    var ids = list.map(function (p) { return p.id; }), h = H();
    if (h) h.call(window, "injectPrompts", [list, opt]);
    else {
      list.forEach(function (p) { if (typeof p.filter === "function") filters[p.id] = p.filter; });
      // 앱이 생성 전에 물어보면 이 화면이 들고 있는 거르기 함수를 돌려 답한다
      if (!filterOn && Object.keys(filters).length) { filterOn = true; eventOn("__th_filter", function (res) { var ks = Object.keys(filters); return Promise.all(ks.map(function (k) { try { return Promise.resolve(filters[k]()).then(function (v) { res[k] = !!v; }, function () { res[k] = false; }); } catch (e) { res[k] = false; } })); }); }
      fireTh("injectPrompts", [list.map(function (p) { var q = Object.assign({}, p); if (typeof q.filter === "function") q.filter = "__frame"; return q; }), opt]);
    }
    var done = false;
    return { uninject: function () { if (done) return; done = true; uninjectPrompts(ids); } };
  }
  function uninjectPrompts(ids) { (ids || []).forEach(function (k) { delete filters[k]; }); var h = H(); if (h) h.call(window, "uninjectPrompts", [ids]); else fireTh("uninjectPrompts", [ids]); }
  function registerMacroLike(re, fn) { var h = H(); if (h) h.call(window, "registerMacroLike", [re, fn]); else warnOnce("registerMacroLike (메시지 속 화면에서는 쓸 수 없음)"); return { unregister: function () { unregisterMacroLike(re); } }; }
  function unregisterMacroLike(re) { var h = H(); if (h) h.call(window, "unregisterMacroLike", [re]); }
  // ── 오디오 ──
  var aud = function (ty) { var a = (X().audio || {})[ty === "ambient" ? "ambient" : "bgm"]; return a || { settings: { enabled: true, mode: "repeat_all", muted: false, volume: 50 }, list: [], cur: { src: "", title: "", playing: false, progress: 0 } }; };
  var audioW = function (name, local) { return sync(name, function () { if (local) local.apply(null, arguments); fireTh(name, arguments); }); };
  // ── 스크립트 단추 ──
  var btnLocal = [];
  var getScriptButtons = sync("getScriptButtons", function () { return own(btnLocal); });
  var replaceScriptButtons = sync("replaceScriptButtons", function (a, b) { btnLocal = own(typeof a === "string" ? b : a) || []; });
  function updateScriptButtonsWith(fn) { var r = fn(getScriptButtons()); return then(r, function (l) { replaceScriptButtons(l); return l; }); }
  var appendInexistentScriptButtons = sync("appendInexistentScriptButtons", function (a, b) { var l = typeof a === "string" ? b : a; (l || []).forEach(function (x) { if (!btnLocal.some(function (y) { return y.name === x.name; })) btnLocal.push(own(x)); }); });
  var getScriptTrees = sync("getScriptTrees", function () { return []; }), replaceScriptTrees = sync("replaceScriptTrees", function () { throw new Error("replaceScriptTrees: 메시지 속 화면에서는 스크립트를 바꿀 수 없어요"); });
  function updateScriptTreesWith(fn, o) { var r = fn(getScriptTrees(o)); return then(r, function (l) { replaceScriptTrees(l, o); return getScriptTrees(o); }); }
  // ── 확장 (드림랜드에 이미 들어 있는 것만 깔린 것으로 알린다) ──
  var BUILT = ["js-slash-runner", "tavern_helper", "magvarupdate", "sillytavern-lalib", "lalib", "st-prompt-template"];
  var extKey = function (id) { return String(id || "").replace(/^third-party\//, "").replace(/\.git$/, "").split("/").pop().toLowerCase(); };
  // ── 변수 모두 ──
  function getAllVariables() {
    var out = Object.assign({}, clone(E.V().global || {}), clone(E.V().character || {}));
    if (SCRIPT) Object.assign(out, clone(E.V().script || {}));
    Object.assign(out, clone(E.V().chat || {}));
    if (!SCRIPT) { var id = I.msgId != null ? I.msgId : lastId(); msgs().forEach(function (m) { if (m.message_id <= id && m.data) Object.assign(out, clone(m.data)); }); }
    return out;
  }
  var builtin = {
    addOneMessage: function () { return api("refreshOneMessage", [lastId()]); }, copyText: function (t) { try { navigator.clipboard.writeText(String(t)); } catch (e) { } },
    duringGenerating: function () { return !!I.busy; }, getImageTokenCost: function () { return Promise.resolve(0); }, getVideoTokenCost: function () { return Promise.resolve(0); },
    parseRegexFromString: function (s) { var m = /^\/([\w\W]+?)\/([gimsuy]*)$/.exec(String(s)); if (!m || /(^|[^\\])\//.test(m[1])) return null; try { return new RegExp(m[1].replace("\\/", "/"), m[2]); } catch (e) { return null; } },
    promptManager: { messages: [], getPromptCollection: function () { return { collection: (getPresetLocal("in_use").prompts || []).map(function (p) { return { identifier: p.id, name: p.name, enabled: p.enabled, role: p.role, content: p.content || "", system_prompt: !isPresetNormalPrompt(p), marker: isPresetPlaceholderPrompt(p) }; }) }; } },
    reloadAndRenderChatWithoutEvents: function () { return api("refreshOneMessage", [lastId()]); }, reloadChatWithoutEvents: function () { return Promise.resolve(); },
    reloadEditor: function () { }, reloadEditorDebounced: function () { }, renderPromptManager: function () { }, renderPromptManagerDebounced: function () { },
    renderMarkdown: function (t) { return formatAsDisplayedMessage(String(t)); }, saveSettings: function () { return Promise.resolve(); },
    uuidv4: function () { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(); }
  };
  var formatAsDisplayedMessage = sync("formatAsDisplayedMessage", function (t) { return rxRun(t, "ai_output", "display", {}); });
  var more = {
    // worldbook
    getWorldbookNames: sync("getWorldbookNames", wb), getGlobalWorldbookNames: sync("getGlobalWorldbookNames", function () { return (T().gwb || []).slice(); }),
    getCharWorldbookNames: sync("getCharWorldbookNames", charWb), getChatWorldbookName: sync("getChatWorldbookName", function () { return T().chatWb || null; }),
    rebindGlobalWorldbooks: A("rebindGlobalWorldbooks"), rebindCharWorldbooks: A("rebindCharWorldbooks"), rebindChatWorldbook: A("rebindChatWorldbook"), getOrCreateChatWorldbook: A("getOrCreateChatWorldbook"),
    getWorldbook: A("getWorldbook"), createWorldbook: A("createWorldbook"), createOrReplaceWorldbook: A("createOrReplaceWorldbook"), deleteWorldbook: A("deleteWorldbook"), replaceWorldbook: A("replaceWorldbook"),
    updateWorldbookWith: updateWorldbookWith, createWorldbookEntries: A("createWorldbookEntries"), deleteWorldbookEntries: deleteWorldbookEntries,
    // lorebook (옛 꼴)
    getLorebookSettings: sync("getLorebookSettings", function () { return own(T().lbs || {}); }), setLorebookSettings: sync("setLorebookSettings", function (o) { Object.assign(T().lbs || {}, o || {}); fireTh("setLorebookSettings", [o]); }),
    getLorebooks: sync("getLorebooks", wb), getCharLorebooks: sync("getCharLorebooks", function (o) { o = o || {}; var r = charWb(o.name); return o.type === "primary" ? { primary: r.primary, additional: [] } : o.type === "additional" ? { primary: null, additional: r.additional } : r; }),
    getCurrentCharPrimaryLorebook: sync("getCurrentCharPrimaryLorebook", function () { return charWb().primary; }), getChatLorebook: sync("getChatLorebook", function () { return T().chatWb || null; }),
    setCurrentCharLorebooks: A("setCurrentCharLorebooks"), setChatLorebook: A("setChatLorebook"), getOrCreateChatLorebook: A("getOrCreateChatLorebook"), createLorebook: A("createLorebook"), deleteLorebook: A("deleteLorebook"),
    getLorebookEntries: A("getLorebookEntries"), replaceLorebookEntries: A("replaceLorebookEntries"), updateLorebookEntriesWith: updateLorebookEntriesWith, setLorebookEntries: A("setLorebookEntries"),
    createLorebookEntries: A("createLorebookEntries"), createLorebookEntry: A("createLorebookEntry"), deleteLorebookEntries: A("deleteLorebookEntries"), deleteLorebookEntry: A("deleteLorebookEntry"),
    // preset
    isPresetNormalPrompt: isPresetNormalPrompt, isPresetSystemPrompt: isPresetSystemPrompt, isPresetPlaceholderPrompt: isPresetPlaceholderPrompt, default_preset: default_preset,
    getPresetNames: sync("getPresetNames", function () { return ["in_use"].concat(T().presets || []); }), getLoadedPresetName: sync("getLoadedPresetName", function () { return T().preset || ""; }),
    loadPreset: sync("loadPreset", function (n) { if ((T().presets || []).indexOf(n) < 0) return false; I.th.preset = n; fireTh("loadPreset", [n]); return true; }),
    getPreset: sync("getPreset", getPresetLocal), createPreset: A("createPreset"), createOrReplacePreset: A("createOrReplacePreset"), deletePreset: A("deletePreset"), renamePreset: A("renamePreset"),
    replacePreset: A("replacePreset"), updatePresetWith: updatePresetWith, setPreset: A("setPreset"),
    // character
    getCharacterNames: sync("getCharacterNames", function () { return (T().chars || []).map(function (x) { return x[1]; }); }), getCharacterIds: sync("getCharacterIds", function () { return (T().chars || []).map(function (x) { return x[0]; }); }),
    getCurrentCharacterName: sync("getCurrentCharacterName", function () { return T().cur ? T().cur.name : null; }), getCurrentCharacterId: sync("getCurrentCharacterId", function () { return T().cur ? T().cur.id : null; }),
    createCharacter: charA("createCharacter"), createOrReplaceCharacter: charA("createOrReplaceCharacter"), deleteCharacter: A("deleteCharacter"), getCharacter: A("getCharacter"), replaceCharacter: charA("replaceCharacter"), updateCharacterWith: updateCharacterWith,
    RawCharacter: RawCharacter, getCharData: getCharData, getCharAvatarPath: sync("getCharAvatarPath", function () { return I.charAvatar || null; }), getChatHistoryBrief: A("getChatHistoryBrief"), getChatHistoryDetail: A("getChatHistoryDetail"),
    // persona
    getPersonaNames: sync("getPersonaNames", function () { return (T().personas || []).map(function (p) { return p.name; }); }), getPersonaIds: sync("getPersonaIds", function () { return (T().personas || []).map(function (p) { return p.avatar_id; }); }),
    getCurrentPersonaName: sync("getCurrentPersonaName", function () { return T().persona ? T().persona.name : null; }), getCurrentPersonaId: sync("getCurrentPersonaId", function () { return T().persona ? T().persona.id : null; }),
    getPersonaAvatarPath: sync("getPersonaAvatarPath", function () { return I.userAvatar || null; }), getPersona: sync("getPersona", personaLocal),
    createPersona: charA("createPersona"), createOrReplacePersona: charA("createOrReplacePersona"), deletePersona: A("deletePersona"), replacePersona: charA("replacePersona"), updatePersonaWith: updatePersonaWith,
    // regex
    formatAsTavernRegexedString: sync("formatAsTavernRegexedString", rxRun), isCharacterTavernRegexesEnabled: sync("isCharacterTavernRegexesEnabled", function () { return !!T().rxChar; }),
    getTavernRegexes: sync("getTavernRegexes", rxList), replaceTavernRegexes: A("replaceTavernRegexes"), updateTavernRegexesWith: updateTavernRegexesWith,
    // generate · inject · macro
    builtin_prompt_default_order: ["world_info_before", "persona_description", "char_description", "char_personality", "scenario", "world_info_after", "dialogue_examples", "chat_history", "user_input"],
    getModelList: A("getModelList"), getProxyPresetNames: function () { return []; },
    stopGenerationById: sync("stopGenerationById", function (id) { fireTh("stopGenerationById", [id]); return true; }), stopAllGeneration: sync("stopAllGeneration", function () { fireTh("stopAllGeneration", []); return true; }),
    injectPrompts: injectPrompts, uninjectPrompts: uninjectPrompts, registerMacroLike: registerMacroLike, unregisterMacroLike: unregisterMacroLike,
    // audio
    playAudio: audioW("playAudio"), pauseAudio: audioW("pauseAudio"), getAudioList: sync("getAudioList", function (ty) { return own(aud(ty).list); }),
    replaceAudioList: audioW("replaceAudioList", function (ty, l) { aud(ty).list = own(l || []); }), appendAudioList: audioW("appendAudioList", function (ty, l) { aud(ty).list = aud(ty).list.concat(own(l || [])); }),
    getAudioSettings: sync("getAudioSettings", function (ty) { return own(aud(ty).settings); }), setAudioSettings: audioW("setAudioSettings", function (ty, o) { Object.assign(aud(ty).settings, o || {}); }),
    getCurrentAudio: sync("getCurrentAudio", function (ty) { return own(aud(ty).cur); }),
    audioEnable: audioW("audioEnable"), audioImport: audioW("audioImport"), audioMode: audioW("audioMode"), audioPlay: audioW("audioPlay"), audioSelect: audioW("audioSelect"),
    // chat · displayed message
    rotateChatMessages: A("rotateChatMessages"), formatAsDisplayedMessage: formatAsDisplayedMessage, refreshOneMessage: A("refreshOneMessage"),
    retrieveDisplayedMessage: function (id) { var h = H(), $p = window.jQuery || window.$; if (!h || !$p) return $p ? $p() : []; var did = h.call(window, "msgDomId", [id]); return $p(did ? '.msgs article.msg[data-id="' + did + '"] .msg-body' : []); },
    // script
    getButtonEvent: getButtonEvent, getScriptButtons: getScriptButtons, replaceScriptButtons: replaceScriptButtons, updateScriptButtonsWith: updateScriptButtonsWith, appendInexistentScriptButtons: appendInexistentScriptButtons,
    getAllEnabledScriptButtons: sync("getAllEnabledScriptButtons", function () { return {}; }), getScriptName: function () { return I.scriptName || ""; }, getScriptInfo: sync("getScriptInfo", function () { return ""; }), replaceScriptInfo: sync("replaceScriptInfo", function () { }),
    getScriptTrees: getScriptTrees, replaceScriptTrees: replaceScriptTrees, updateScriptTreesWith: updateScriptTreesWith,
    // extension · file · import
    isAdmin: function () { return false; }, getTavernHelperExtensionId: function () { return "JS-Slash-Runner"; },
    getExtensionType: function (id) { return BUILT.indexOf(extKey(id)) >= 0 ? "global" : null; }, isInstalledExtension: function (id) { return BUILT.indexOf(extKey(id)) >= 0; },
    getExtensionStatus: A("getExtensionStatus"), installExtension: Ar("installExtension"), uninstallExtension: Ar("uninstallExtension"), reinstallExtension: Ar("reinstallExtension"), updateExtension: Ar("updateExtension"),
    getTavernFile: Ar("getTavernFile"), uploadTavernFile: A("uploadTavernFile"), deleteTavernFile: A("deleteTavernFile"),
    importRawCharacter: function (name, blob) { return blobUrl(blob).then(function (u) { return api("importRawCharacter", [name, u]); }).then(resp); },
    importRawChat: Ar("importRawChat"), importRawPreset: A("importRawPreset"), importRawWorldbook: Ar("importRawWorldbook"),
    importRawTavernRegex: function (name, text) { api("importRawTavernRegex", [name, text]).catch(function (e) { console.warn(e); }); return true; },
    // util · version · variables
    getAllVariables: getAllVariables, reloadIframe: function () { call("reloadFrame", []); }, getFrontendVersion: TH.getTavernHelperVersion,
    updateTavernHelper: A("updateTavernHelper"), updateFrontendVersion: A("updateTavernHelper"), builtin: builtin,
    substitudeMacros: sync("substitudeMacros", substitudeMacros)
  };
  for (var mk in more) TH[mk] = more[mk];
};
