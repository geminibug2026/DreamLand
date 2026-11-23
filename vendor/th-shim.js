// 실리태번 JS 러너(TavernHelper)와 같은 이름의 도우미를 iframe 안에 깐다. 실제 일은 앱(부모 창)이 postMessage 로 받아 처리한다
(function () {
  var I = window.__dlInit || {}, seq = 0, wait = {}, handlers = {};
  var clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  function call(fn, args) {
    return new Promise(function (res, rej) {
      var id = ++seq; wait[id] = { res: res, rej: rej };
      var a; try { a = JSON.parse(JSON.stringify(args || [], function (k, v) { return v instanceof RegExp ? String(v) : typeof v === "function" ? undefined : v; })); } catch (e) { a = []; }
      parent.postMessage({ dlCall: id, fn: fn, args: a }, "*");
    });
  }
  addEventListener("message", function (e) {
    var d = e.data; if (e.source !== parent || !d) return;
    if (d.dlRet != null && wait[d.dlRet]) { var w = wait[d.dlRet]; delete wait[d.dlRet]; if (d.ok) w.res(d.val); else w.rej(new Error(d.err || "error")); }
    if (d.dlState) { takeState(d.dlState); if (d.dlState.lastId != null) I.lastId = d.dlState.lastId; if (d.dlState.vars) V = Object.assign({}, d.dlState.vars, { script: V.script, extension: V.extension }); if (d.dlState.th) I.th = d.dlState.th; if (d.dlState.thx) I.thx = d.dlState.thx; }
    if (d.dlState && d.dlState.mvuExtra != null) I.mvuExtra = !!d.dlState.mvuExtra;
    if (d.dlState && d.dlState.viewH) setVh(d.dlState.viewH);
    if (d.dlState) checkMvuWait();
    if (d.dlEvent) fire(d.dlEvent, d.args || []);
    if (d.dlInvoke != null) invoke(d);
  });
  // 메시지 사본: 통째(messages) 또는 지난 판(base)에서 달라진 것만(upd). 판이 어긋나면 통째로 다시 받는다
  function takeState(st) {
    if (st.messages) { I.messages = st.messages; if (st.ver != null) I.ver = st.ver; return; }
    if (!st.upd) return;
    if (st.base !== I.ver) { call("state", []).then(function (s) { if (s && s.messages && (I.ver == null || s.ver >= I.ver)) { I.messages = s.messages; I.ver = s.ver; } }, function () { }); return; }
    var by = {}; (I.messages || []).forEach(function (m) { by[m.message_id] = m; }); st.upd.forEach(function (m) { by[m.message_id] = m; });
    var out = []; for (var k in by) { var m = by[k]; if (m.message_id >= st.from && m.message_id <= st.lastId) out.push(m); }
    out.sort(function (a, b) { return a.message_id - b.message_id; }); I.messages = out; I.ver = st.ver;
  }
  // 앱이 부르는 이벤트 (변수 갱신 틀 등): 듣는 이를 차례로 기다리며 부르고, 고쳐진 인자를 돌려준다
  function wireClone(v) { try { return v === undefined ? null : JSON.parse(JSON.stringify(v)); } catch (e) { return null; } }
  function invoke(d) {
    var calls = [], args = (d.args || []).slice();
    (d.fns || []).forEach(function (i) { args[i] = function () { calls.push([i, wireClone([].slice.call(arguments))]); }; });
    runHandlers(d.type, args).then(function () {
      parent.postMessage({ dlInvoked: d.dlInvoke, args: args.map(function (a) { return typeof a === "function" ? null : wireClone(a); }), calls: calls }, "*");
    });
  }
  function runHandlers(type, args) {
    var list = (handlers[type] || []).slice(), i = 0;
    return new Promise(function (res) {
      (function next() {
        if (i >= list.length) return res();
        var h = list[i++], r;
        if (h.once) eventRemoveListener(type, h.fn);
        try { r = h.fn.apply(null, args); } catch (e) { console.error(e); }
        if (r && typeof r.then === "function") r.then(next, function (e) { console.error(e); next(); }); else next();
      })();
    });
  }

  // 스크립트 화면의 $ 는 앱 화면의 jQuery (Tavern Helper 와 같다: 메뉴 · 단추를 앱 화면에 붙인다)
  if (I.script) { try { if (window.parent !== window && window.parent.jQuery) { window.$ = window.jQuery = window.parent.jQuery; } } catch (e) { } }
  // ── Tavern Helper 의 미리 깔기: Vue 설정 · 앱 창 높이(--TH-viewport-height) ──
  window.__VUE_PROD_DEVTOOLS__ = true; window.__VUE_OPTIONS_API__ = true; window.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false;
  function setVh(h) { try { document.documentElement.style.setProperty("--TH-viewport-height", h + "px"); } catch (e) { } }
  setVh(I.viewH || innerHeight);
  // ── 저장소: 격리된 화면이라 진짜 localStorage 를 못 쓴다. 앱이 대신 보관한다 ──
  function store(kind) {
    var m = kind === "local" ? (I.ls || {}) : {};
    var api = {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[String(k)] = String(v); if (kind === "local") call("lsSet", [String(k), String(v)]); },
      removeItem: function (k) { delete m[String(k)]; if (kind === "local") call("lsDel", [String(k)]); },
      clear: function () { m = {}; if (kind === "local") call("lsClear", []); },
      key: function (i) { return Object.keys(m)[i] || null; }
    };
    Object.defineProperty(api, "length", { get: function () { return Object.keys(m).length; } });
    return api;
  }
  var needLs = false; try { window.localStorage.getItem("x"); } catch (e) { needLs = true; }
  if (needLs) {
    try { Object.defineProperty(window, "localStorage", { value: store("local"), configurable: true }); } catch (e) { }
    try { Object.defineProperty(window, "sessionStorage", { value: store("session"), configurable: true }); } catch (e) { }
  }

  // ── 알림 ──
  var toastr = { success: function (m, t) { call("toast", ["ok", m, t]); }, info: function (m, t) { call("toast", ["", m, t]); }, warning: function (m, t) { call("toast", ["warn", m, t]); }, error: function (m, t) { call("toast", ["err", m, t]); }, clear: function () { }, remove: function () { }, options: {} };

  // ── 메시지 ──
  var msgs = function () { return I.messages || []; };
  function lastId() { return I.lastId != null ? I.lastId : msgs().length - 1; }
  function idOf(n) { n = Number(n); return n < 0 ? lastId() + 1 + n : n; }
  function rangeOf(r) {
    if (r == null || r === "") return [0, lastId()];
    if (typeof r === "number") { var i = idOf(r); return [i, i]; }
    var s = String(r).trim(), m = s.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
    if (m) { var a = idOf(m[1]), b = idOf(m[2]); return a <= b ? [a, b] : [b, a]; }
    var j = idOf(s); return [j, j];
  }
  function getChatMessages(range, opt) {
    opt = opt || {}; var r = rangeOf(range), out = [];
    msgs().forEach(function (m) {
      if (m.message_id < r[0] || m.message_id > r[1]) return;
      if (opt.role && opt.role !== "all" && m.role !== opt.role) return;
      if (opt.hide_state === "hidden" && !m.is_hidden) return;
      if (opt.hide_state === "unhidden" && m.is_hidden) return;
      out.push(clone(m));
    });
    return out;
  }
  function refreshLocal(list) {
    list.forEach(function (p) {
      var m = msgs().filter(function (x) { return x.message_id === idOf(p.message_id); })[0]; if (!m) return;
      for (var k in p) if (k !== "message_id") m[k] = clone(p[k]);
      // 변수는 답변 후보마다: data 는 지금 후보 · swipes_data 는 후보 전체
      if (p.swipes_data && m.swipes_data) m.data = clone(m.swipes_data[m.swipe_id || 0] || {});
      else if (p.data && m.swipes_data) m.swipes_data[m.swipe_id || 0] = clone(p.data);
    });
  }
  function setChatMessages(list, opt) { list = list || []; refreshLocal(list); return call("setMsgs", [list.map(function (p) { var q = clone(p); q.message_id = idOf(p.message_id); return q; }), opt || {}]); }
  function setChatMessage(fields, id, opt) {
    if (typeof fields === "string") fields = { message: fields };
    var p = clone(fields) || {}; p.message_id = id == null ? I.msgId : id;
    return setChatMessages([p], opt);
  }
  function createChatMessages(list, opt) { return call("createMsgs", [list || [], opt || {}]); }
  function deleteChatMessages(ids, opt) { return call("delMsgs", [(ids || []).map(idOf), opt || {}]); }

  // ── 변수 ──
  var V = I.vars || { chat: {}, global: {}, character: {}, message: {} }; V.script = I.scriptVars || {}; V.extension = {};
  function slot(o) {
    o = o || {}; var t = o.type || "chat";
    if (t === "message") { var id = o.message_id == null || o.message_id === "latest" ? lastId() : idOf(o.message_id); var m = msgs().filter(function (x) { return x.message_id === id; })[0]; return { t: t, id: id, get: function () { return m ? (m.data || (m.data = {})) : {}; }, set: function (v) { if (m) { m.data = v; if (m.swipes_data) m.swipes_data[m.swipe_id || 0] = v; } } }; }
    // 스크립트 변수는 그 스크립트에 · 확장 변수는 확장 이름마다 · 캐릭터 · 프리셋 변수는 카드 · 프리셋에 (실리태번과 같다)
    if (t === "script") return { t: t, id: o.script_id || I.scriptId || null, get: function () { return V.script || (V.script = {}); }, set: function (v) { V.script = v; } };
    if (t === "extension") { var eid = String(o.extension_id || ""); return { t: t, id: eid, get: function () { return V.extension[eid] || (V.extension[eid] = {}); }, set: function (v) { V.extension[eid] = v; } }; }
    if (t !== "global" && t !== "character" && t !== "preset") t = "chat";
    return { t: t, id: null, get: function () { return V[t] || (V[t] = {}); }, set: function (v) { V[t] = v; } };
  }
  function push(s) { return call("setVars", [s.t, s.id, s.get()]); }
  function getVariables(o) { return clone(slot(o).get()); }
  function replaceVariables(v, o) { var s = slot(o); s.set(clone(v) || {}); return push(s); }
  function insertOrAssignVariables(v, o) { var s = slot(o); var cur = s.get(); _.merge(cur, clone(v)); s.set(cur); push(s); return cur; }
  function insertVariables(v, o) { var s = slot(o); var cur = s.get(); _.defaultsDeep(cur, clone(v)); s.set(cur); push(s); return cur; }
  function deleteVariable(path, o) { var s = slot(o); var cur = s.get(); var had = _.has(cur, path); _.unset(cur, path); s.set(cur); push(s); return { variables: cur, delete_occurred: had }; }
  function updateVariablesWith(fn, o) { var s = slot(o); var r = fn(clone(s.get())); var apply = function (v) { s.set(v || {}); push(s); return v; }; return r && typeof r.then === "function" ? r.then(apply) : apply(r); }

  // ── 이벤트 ──
  function fire(type, args) { (handlers[type] || []).slice().forEach(function (h) { if (h.once) eventRemoveListener(type, h.fn); try { h.fn.apply(null, args); } catch (e) { console.error(e); } }); }
  // 앱에 "이 이벤트를 듣는다"고 알린다 (앱이 변수 갱신 이벤트를 이 화면에도 보내도록)
  function told(type) { var n = (handlers[type] || []).length; parent.postMessage({ dlListen: String(type), on: n > 0 }, "*"); }
  function add(type, h, first) { var had = (handlers[type] || []).length; handlers[type] = (handlers[type] || []).filter(function (x) { return x.fn !== h.fn; }); if (first) handlers[type].unshift(h); else handlers[type].push(h); if (!had) told(type); return { stop: function () { eventRemoveListener(type, h.fn); } }; }
  function eventOn(type, fn) { return add(type, { fn: fn }); }
  function eventOnce(type, fn) { return add(type, { fn: fn, once: true }); }
  function eventMakeFirst(type, fn) { return add(type, { fn: fn }, true); }
  function eventMakeLast(type, fn) { return add(type, { fn: fn }); }
  function eventRemoveListener(type, fn) { var had = (handlers[type] || []).length; handlers[type] = (handlers[type] || []).filter(function (h) { return h.fn !== fn; }); if (had && !handlers[type].length) told(type); }
  function eventClearAll() { var ts = Object.keys(handlers); handlers = {}; ts.forEach(told); }
  // 내 화면의 듣는 이를 기다리며 부르고, 앱 · 다른 화면에도 알린 뒤 그쪽이 고친 인자를 원래 객체에 덮어쓴다
  function adopt(o, n) {
    if (typeof o === "function") return o;
    if (Array.isArray(o) && Array.isArray(n)) { o.length = 0; [].push.apply(o, n); return o; }
    if (o && n && typeof o === "object" && typeof n === "object" && !Array.isArray(o) && !Array.isArray(n)) { Object.keys(o).forEach(function (k) { if (!(k in n)) delete o[k]; }); for (var k in n) o[k] = n[k]; return o; }
    return n;
  }
  function eventEmit(type) {
    var args = [].slice.call(arguments, 1);
    return runHandlers(type, args).then(function () { return call("emit", [type, args.map(function (a) { return typeof a === "function" ? null : a; })]); }).then(function (back) {
      if (Array.isArray(back)) back.forEach(function (v, i) { if (i < args.length) adopt(args[i], v); });
    });
  }
  var tavern_events = {"APP_READY":"app_ready","EXTRAS_CONNECTED":"extras_connected","MESSAGE_SWIPED":"message_swiped","MESSAGE_SENT":"message_sent","MESSAGE_RECEIVED":"message_received","MESSAGE_EDITED":"message_edited","MESSAGE_DELETED":"message_deleted","MESSAGE_UPDATED":"message_updated","MESSAGE_FILE_EMBEDDED":"message_file_embedded","MESSAGE_REASONING_EDITED":"message_reasoning_edited","MESSAGE_REASONING_DELETED":"message_reasoning_deleted","MESSAGE_SWIPE_DELETED":"message_swipe_deleted","MORE_MESSAGES_LOADED":"more_messages_loaded","IMPERSONATE_READY":"impersonate_ready","CHAT_CHANGED":"chat_id_changed","GENERATION_AFTER_COMMANDS":"GENERATION_AFTER_COMMANDS","GENERATION_STARTED":"generation_started","GENERATION_STOPPED":"generation_stopped","GENERATION_ENDED":"generation_ended","SD_PROMPT_PROCESSING":"sd_prompt_processing","EXTENSIONS_FIRST_LOAD":"extensions_first_load","EXTENSION_SETTINGS_LOADED":"extension_settings_loaded","SETTINGS_LOADED":"settings_loaded","SETTINGS_UPDATED":"settings_updated","MOVABLE_PANELS_RESET":"movable_panels_reset","SETTINGS_LOADED_BEFORE":"settings_loaded_before","SETTINGS_LOADED_AFTER":"settings_loaded_after","CHATCOMPLETION_SOURCE_CHANGED":"chatcompletion_source_changed","CHATCOMPLETION_MODEL_CHANGED":"chatcompletion_model_changed","OAI_PRESET_CHANGED_BEFORE":"oai_preset_changed_before","OAI_PRESET_CHANGED_AFTER":"oai_preset_changed_after","OAI_PRESET_EXPORT_READY":"oai_preset_export_ready","OAI_PRESET_IMPORT_READY":"oai_preset_import_ready","WORLDINFO_SETTINGS_UPDATED":"worldinfo_settings_updated","WORLDINFO_UPDATED":"worldinfo_updated","CHARACTER_EDITOR_OPENED":"character_editor_opened","CHARACTER_EDITED":"character_edited","CHARACTER_PAGE_LOADED":"character_page_loaded","USER_MESSAGE_RENDERED":"user_message_rendered","CHARACTER_MESSAGE_RENDERED":"character_message_rendered","FORCE_SET_BACKGROUND":"force_set_background","CHAT_DELETED":"chat_deleted","CHAT_CREATED":"chat_created","GENERATE_BEFORE_COMBINE_PROMPTS":"generate_before_combine_prompts","GENERATE_AFTER_COMBINE_PROMPTS":"generate_after_combine_prompts","GENERATE_AFTER_DATA":"generate_after_data","WORLD_INFO_ACTIVATED":"world_info_activated","TEXT_COMPLETION_SETTINGS_READY":"text_completion_settings_ready","CHAT_COMPLETION_SETTINGS_READY":"chat_completion_settings_ready","CHAT_COMPLETION_PROMPT_READY":"chat_completion_prompt_ready","CHARACTER_FIRST_MESSAGE_SELECTED":"character_first_message_selected","CHARACTER_DELETED":"characterDeleted","CHARACTER_DUPLICATED":"character_duplicated","CHARACTER_RENAMED":"character_renamed","CHARACTER_RENAMED_IN_PAST_CHAT":"character_renamed_in_past_chat","SMOOTH_STREAM_TOKEN_RECEIVED":"stream_token_received","STREAM_TOKEN_RECEIVED":"stream_token_received","STREAM_REASONING_DONE":"stream_reasoning_done","FILE_ATTACHMENT_DELETED":"file_attachment_deleted","WORLDINFO_FORCE_ACTIVATE":"worldinfo_force_activate","OPEN_CHARACTER_LIBRARY":"open_character_library","ONLINE_STATUS_CHANGED":"online_status_changed","IMAGE_SWIPED":"image_swiped","CONNECTION_PROFILE_LOADED":"connection_profile_loaded","CONNECTION_PROFILE_CREATED":"connection_profile_created","CONNECTION_PROFILE_DELETED":"connection_profile_deleted","CONNECTION_PROFILE_UPDATED":"connection_profile_updated","TOOL_CALLS_PERFORMED":"tool_calls_performed","TOOL_CALLS_RENDERED":"tool_calls_rendered","CHARACTER_MANAGEMENT_DROPDOWN":"charManagementDropdown","SECRET_WRITTEN":"secret_written","SECRET_DELETED":"secret_deleted","SECRET_ROTATED":"secret_rotated","SECRET_EDITED":"secret_edited","PRESET_CHANGED":"preset_changed","PRESET_DELETED":"preset_deleted","PRESET_RENAMED":"preset_renamed","PRESET_RENAMED_BEFORE":"preset_renamed_before","MAIN_API_CHANGED":"main_api_changed","WORLDINFO_ENTRIES_LOADED":"worldinfo_entries_loaded","WORLDINFO_SCAN_DONE":"worldinfo_scan_done","MEDIA_ATTACHMENT_DELETED":"media_attachment_deleted"};
  var iframe_events = { MESSAGE_IFRAME_RENDER_STARTED: "message_iframe_render_started", MESSAGE_IFRAME_RENDER_ENDED: "message_iframe_render_ended", GENERATION_REQUESTED: "js_generation_requested", GENERATION_STARTED: "js_generation_started", STREAM_TOKEN_RECEIVED_FULLY: "js_stream_token_received_fully", STREAM_TOKEN_RECEIVED_INCREMENTALLY: "js_stream_token_received_incrementally", REASONING_TOKEN_RECEIVED_FULLY: "js_reasoning_token_received_fully", REASONING_TOKEN_RECEIVED_INCREMENTALLY: "js_reasoning_token_received_incrementally", GENERATION_ENDED: "js_generation_ended" };

  // ── 그 밖 ──
  function substitudeMacros(t) { return String(t).replace(/\{\{user\}\}/gi, I.user || "User").replace(/\{\{char\}\}/gi, I.char || "").replace(/\{\{lastMessageId\}\}/gi, String(lastId())); }
  function triggerSlash(cmd) { return call("slash", [String(cmd)]); }
  function generate(cfg) { return api("generate", [cfg || {}]); }
  function generateRaw(cfg) { return api("generateRaw", [cfg || {}]); }
  function errorCatched(fn) { return function () { try { var r = fn.apply(this, arguments); if (r && r.catch) r.catch(function (e) { console.error(e); toastr.error(String(e && e.message || e)); }); return r; } catch (e) { console.error(e); toastr.error(String(e && e.message || e)); } }; }

  var TH = {
    triggerSlash: triggerSlash, triggerSlashWithResult: triggerSlash,
    getChatMessages: getChatMessages, setChatMessages: setChatMessages, setChatMessage: setChatMessage, createChatMessages: createChatMessages, deleteChatMessages: deleteChatMessages,
    getLastMessageId: lastId, getCurrentMessageId: function () { return I.msgId != null ? I.msgId : lastId(); }, getMessageId: function () { return I.msgId; },
    getIframeName: function () { return I.script ? "TH-script--" + (I.scriptName || "") + "--" + (I.scriptId || "") : "message-iframe-" + I.msgId; }, getScriptId: function () { return I.scriptId || "dl-frame"; },
    getVariables: getVariables, replaceVariables: replaceVariables, insertOrAssignVariables: insertOrAssignVariables, insertVariables: insertVariables, deleteVariable: deleteVariable, updateVariablesWith: updateVariablesWith,
    eventOn: eventOn, eventOnce: eventOnce, eventMakeFirst: eventMakeFirst, eventMakeLast: eventMakeLast, eventOnButton: function (n, fn) { return eventOn(getButtonEvent(n), fn); }, eventRemoveListener: eventRemoveListener, eventClearAll: eventClearAll, eventClearEvent: function (t) { delete handlers[t]; told(t); }, eventClearListener: function (fn) { Object.keys(handlers).forEach(function (t) { eventRemoveListener(t, fn); }); }, eventEmit: eventEmit, eventEmitAndWait: eventEmit,
    tavern_events: tavern_events, iframe_events: iframe_events,
    substitudeMacros: substitudeMacros, generate: generate, generateRaw: generateRaw, errorCatched: errorCatched,
    getCharAvatarPath: function () { return I.charAvatar || ""; }, getCharData: function () { return { name: I.char, avatar: I.charAvatar || "" }; },
    waitGlobalInitialized: waitGlobalInitialized, initializeGlobal: initializeGlobal, builtin: {},
    getTavernHelperVersion: function () { return "4.12.2"; }, getTavernVersion: function () { return "1.13.5"; },
    registerVariableSchema: function () { }
  };
  // ══ Tavern Helper 의 나머지 함수 (로어북 · 프리셋 · 캐릭터 · 페르소나 · 정규식 · 오디오 · 끼워 넣기 · 스크립트 · 확장 …) ══
  // 실제 일은 앱이 한다 (src/th). 사용자가 허락해 켠 스크립트(같은 출처)는 앱 함수를 바로 부르고, 메시지 속 화면은 postMessage 로 부른다.
  // 실리태번에서 동기인 읽기 함수는 메시지 속 화면에서는 앱이 보내 둔 사본(I.th · I.thx)으로 바로 답한다.
  var SCRIPT = !!I.script;
  function H() { try { return SCRIPT && window.parent !== window && parent.__dlTH ? parent.__dlTH : null; } catch (e) { return null; } }
  var isRe = function (v) { return Object.prototype.toString.call(v) === "[object RegExp]"; };
  // 앱 쪽 객체를 이 화면의 것으로 베낀다 (Array.isArray · instanceof 가 이 화면 기준으로 맞게 · 정규식은 그대로)
  function own(v) {
    if (v == null || typeof v !== "object") return v;
    if (isRe(v)) return new RegExp(v.source, v.flags);
    if (Array.isArray(v)) return v.map(own);
    if (Object.prototype.toString.call(v) !== "[object Object]") return v;
    var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = own(v[k]); return o;
  }
  var T = function () { return I.th || {}; }, X = function () { return I.thx || {}; };
  /** 비동기 함수: 앱에서 처리하고 결과를 돌려받는다 */
  function api(name, args) {
    args = [].slice.call(args || []); var h = H();
    if (h) return new Promise(function (res, rej) { try { Promise.resolve(h.call(window, name, args)).then(function (v) { res(own(v)); }, rej); } catch (e) { rej(e); } });
    return call("th", [name, args]);
  }
  function getButtonEvent(n) { return I.scriptId ? I.scriptId + "_" + n : String(n); }
  // 나머지 함수(로어북 · 프리셋 · 캐릭터 …)는 쓰는 화면에만 vendor/th-more.js 로 깐다 (상태창마다 풀지 않게)
  if (window.__dlThMore) window.__dlThMore({ I: I, call: call, eventOn: eventOn, clone: clone, V: function () { return V; }, msgs: msgs, lastId: lastId, TH: TH, sub: substitudeMacros, H: H, T: T, X: X, own: own, api: api, getButtonEvent: getButtonEvent });

  // ── 전역 공유 (Mvu 등): 내 창에 두고, 같은 출처의 부모 창이면 거기에도 둔다 ──
  function parentGet(name) { try { return window.parent !== window && _.has(window.parent, name) ? _.get(window.parent, name) : undefined; } catch (e) { return undefined; } }
  function initializeGlobal(name, value) { _.set(window, name, value); try { if (window.parent !== window) _.set(window.parent, name, value); } catch (e) { } return eventEmit("global_" + name + "_initialized"); }
  var mvuWaits = [];
  function hasMvuData(m) { return !!(m && m.data && m.data.stat_data); }
  function checkMvuWait() { var ms = msgs(); if (!mvuWaits.length) return; if (hasMvuData(ms[0]) || ms.slice(-10).some(hasMvuData)) { var w = mvuWaits; mvuWaits = []; w.forEach(function (f) { f(); }); } }
  function waitGlobalInitialized(name) {
    // Mvu 는 변수가 생길 때까지 기다린다 (Tavern Helper 와 같다). 기다리는 동안 앱에 "이 화면은 준비됐다"고 알려 앱이 변수를 채우게 한다
    var ready = function () { if (name !== "Mvu") return Promise.resolve(); return new Promise(function (res) { mvuWaits.push(res); checkMvuWait(); if (mvuWaits.indexOf(res) >= 0) parent.postMessage({ dlReady: 1 }, "*"); setTimeout(function () { mvuWaits = mvuWaits.filter(function (f) { return f !== res; }); res(); }, 5000); }); };
    if (_.has(window, name)) return ready();
    var pv = parentGet(name); if (pv !== undefined) { try { Object.defineProperty(window, name, { get: function () { return parentGet(name); }, configurable: true }); } catch (e) { } return ready(); }
    return new Promise(function (res) { eventOnce("global_" + name + "_initialized", function () { var v = parentGet(name); if (v !== undefined && !_.has(window, name)) { try { Object.defineProperty(window, name, { get: function () { return parentGet(name); }, configurable: true }); } catch (e) { } } ready().then(res); }); });
  }
  // ── 변수 갱신 틀(MagVarUpdate): 카드 스크립트 · 상태창이 찾는 Mvu 전역. 계산은 앱이 맡는다 ──
  var isVwd = function (v) { return Array.isArray(v) && v.length === 2 && typeof v[1] === "string"; };
  function curId() { return I.msgId != null ? I.msgId : lastId(); }
  var Mvu = {
    events: { VARIABLE_INITIALIZED: "mag_variable_initialized", VARIABLE_UPDATE_STARTED: "mag_variable_update_started", COMMAND_PARSED: "mag_command_parsed", VARIABLE_UPDATE_ENDED: "mag_variable_update_ended", BEFORE_MESSAGE_UPDATE: "mag_before_message_update", SINGLE_VARIABLE_UPDATED: "mag_variable_updated" },
    getMvuData: function (o) { return getVariables(o); },
    replaceMvuData: function (d, o) { return replaceVariables(d, o); },
    parseMessage: function (message, old) { return call("mvuParse", [String(message), old]); },
    getCurrentMvuData: function () { return getVariables({ type: "message", message_id: curId() }); },
    replaceCurrentMvuData: function (d) { return replaceVariables(d, { type: "message", message_id: curId() }); },
    reloadInitVar: function (d) { return call("mvuReloadInit", [d]).then(function (r) { if (r && r.data && d && typeof d === "object") adopt(d, r.data); return !!(r && r.updated); }); },
    setMvuVariable: function (d, path, value, opt) {
      opt = opt || {}; var sd = d && d.stat_data; if (!sd || !_.has(sd, path)) return Promise.resolve(false);
      var cur = _.get(sd, path), old, why = opt.reason ? "(" + opt.reason + ")" : "", t = function (v) { return String(JSON.stringify(v)).replace(/^[\\"'` ]*(.*?)[\\"'` ]*$/, "$1"); };
      if (Array.isArray(cur) && cur.length === 2) { old = clone(cur[0]); cur[0] = value; _.set(sd, path, cur); } else { old = clone(cur); _.set(sd, path, value); }
      var shown = t(old) + "->" + t(value) + " " + why;
      if (sd.$internal && sd.$internal.display_data) _.set(sd.$internal.display_data, path, shown);
      if (sd.$internal && sd.$internal.delta_data) _.set(sd.$internal.delta_data, path, shown);
      return (opt.is_recursive ? eventEmit(Mvu.events.SINGLE_VARIABLE_UPDATED, sd, path, old, value) : Promise.resolve()).then(function () { return true; });
    },
    getMvuVariable: function (d, path, o) { o = o || {}; var cat = o.category === "display" ? "display_data" : o.category === "delta" ? "delta_data" : "stat_data"; var v = _.get(d && d[cat], path, o.default_value); return isVwd(v) ? v[0] : v; },
    getRecordFromMvuData: function (d, category) { return d && d[category === "display" ? "display_data" : category === "delta" ? "delta_data" : "stat_data"]; },
    isDuringExtraAnalysis: function () { return !!I.mvuExtra; }
  };
  window.Mvu = Mvu;
  setTimeout(function () { fire("global_Mvu_initialized", []); }, 0);
  for (var k in TH) window[k] = TH[k];
  window.TavernHelper = TH;
  window.toastr = toastr;
  var POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3, DISPLAY: 4, CROP: 5 }, POPUP_RESULT = { AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: null };
  function callGenericPopup(content, type, value, opt) {
    var h = H(), o = opt && typeof opt === "object" ? { okButton: typeof opt.okButton === "string" ? opt.okButton : undefined, cancelButton: typeof opt.cancelButton === "string" ? opt.cancelButton : undefined } : {};
    if (h) return Promise.resolve(h.popup(content && content.jquery ? content[0] : content, type, value, o));
    var html = content && content.jquery ? content.prop("outerHTML") : content && content.outerHTML ? content.outerHTML : String(content == null ? "" : content);
    return call("popup", [html, type, value, o]);
  }
  function stChat() { return msgs().map(function (m) { return { name: m.name, is_user: m.role === "user", is_system: m.role === "system", mes: m.message, swipe_id: m.swipe_id, swipes: m.swipes, extra: {}, variables: [m.data || {}] }; }); }
  var ctx = function () {
    return { chat: stChat(), name1: I.user, name2: I.char, characterId: I.charId, chatMetadata: { variables: V.chat }, extensionSettings: {},
      event_types: tavern_events, eventSource: { on: eventOn, once: eventOnce, emit: eventEmit, removeListener: eventRemoveListener, makeFirst: eventMakeFirst },
      executeSlashCommandsWithOptions: function (t) { return triggerSlash(t).then(function (r) { return { pipe: r }; }); }, executeSlashCommands: function (t) { return triggerSlash(t).then(function (r) { return { pipe: r }; }); },
      substituteParams: TH.substitudeMacros, generate: generate, generateRaw: generateRaw, getRequestHeaders: function () { return {}; }, saveChat: function () { return Promise.resolve(); },
      // 실리태번 알림 창: 드림랜드 창으로 띄운다 (스크립트 화면은 요소를 그대로, 메시지 속 화면은 글로 넘긴다)
      callGenericPopup: callGenericPopup, POPUP_TYPE: POPUP_TYPE, POPUP_RESULT: POPUP_RESULT, characters: (T().chars || []).map(function (x) { return { name: x[1], avatar: x[0] + ".png" }; }), characterId: T().cur ? (T().chars || []).map(function (x) { return x[0]; }).indexOf(T().cur.id) : undefined,
      reloadCurrentChat: function () { return api("refreshOneMessage", [lastId()]); }, getCurrentChatId: function () { return I.chatId || ""; } };
  };
  // Tavern Helper 처럼 SillyTavern 에서도 getContext() 의 것을 바로 쓴다 (SillyTavern.chat · SillyTavern.callGenericPopup …)
  window.SillyTavern = { getContext: ctx };
  Object.keys(ctx()).forEach(function (k) { try { Object.defineProperty(window.SillyTavern, k, { get: function () { return ctx()[k]; }, enumerable: true }); } catch (e) { } });
  setTimeout(function () { fire(iframe_events.MESSAGE_IFRAME_RENDER_ENDED, ["message-iframe-" + I.msgId]); }, 0);
  // 스크립트(모듈 포함)가 다 실리면 앱에 알린다 (앱은 카드 스크립트가 준비된 뒤에 변수를 계산한다)
  addEventListener("load", function () { setTimeout(function () { parent.postMessage({ dlReady: 1 }, "*"); }, 50); });
})();
