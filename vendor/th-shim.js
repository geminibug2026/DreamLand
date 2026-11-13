// 실리태번 JS 러너(TavernHelper)와 같은 이름의 도우미를 iframe 안에 깐다. 실제 일은 앱(부모 창)이 postMessage 로 받아 처리한다
(function () {
  var I = window.__dlInit || {}, seq = 0, wait = {}, handlers = {};
  var clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  function call(fn, args) {
    return new Promise(function (res, rej) {
      var id = ++seq; wait[id] = { res: res, rej: rej };
      var a; try { a = JSON.parse(JSON.stringify(args || [])); } catch (e) { a = []; }
      parent.postMessage({ dlCall: id, fn: fn, args: a }, "*");
    });
  }
  addEventListener("message", function (e) {
    var d = e.data; if (e.source !== parent || !d) return;
    if (d.dlRet != null && wait[d.dlRet]) { var w = wait[d.dlRet]; delete wait[d.dlRet]; if (d.ok) w.res(d.val); else w.rej(new Error(d.err || "error")); }
    if (d.dlState) { if (d.dlState.messages) I.messages = d.dlState.messages; if (d.dlState.lastId != null) I.lastId = d.dlState.lastId; if (d.dlState.vars) V = d.dlState.vars; }
    if (d.dlEvent) fire(d.dlEvent, d.args || []);
  });

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
    list.forEach(function (p) { var m = msgs().filter(function (x) { return x.message_id === idOf(p.message_id); })[0]; if (!m) return; for (var k in p) if (k !== "message_id") m[k] = clone(p[k]); });
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
  var V = I.vars || { chat: {}, global: {}, character: {}, message: {} };
  function slot(o) {
    o = o || {}; var t = o.type || "chat";
    if (t === "message") { var id = o.message_id == null || o.message_id === "latest" ? lastId() : idOf(o.message_id); var m = msgs().filter(function (x) { return x.message_id === id; })[0]; return { t: t, id: id, get: function () { return m ? (m.data || (m.data = {})) : {}; }, set: function (v) { if (m) m.data = v; } }; }
    if (t === "script" || t === "extension") t = "chat";
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
  function fire(type, args) { (handlers[type] || []).slice().forEach(function (h) { try { h.fn.apply(null, args); } catch (e) { console.error(e); } if (h.once) eventRemoveListener(type, h.fn); }); }
  function eventOn(type, fn) { (handlers[type] = handlers[type] || []).push({ fn: fn }); return { stop: function () { eventRemoveListener(type, fn); } }; }
  function eventOnce(type, fn) { (handlers[type] = handlers[type] || []).push({ fn: fn, once: true }); return { stop: function () { eventRemoveListener(type, fn); } }; }
  function eventMakeFirst(type, fn) { (handlers[type] = handlers[type] || []).unshift({ fn: fn }); return { stop: function () { eventRemoveListener(type, fn); } }; }
  function eventRemoveListener(type, fn) { handlers[type] = (handlers[type] || []).filter(function (h) { return h.fn !== fn; }); }
  function eventClearAll() { handlers = {}; }
  function eventEmit(type) { var args = [].slice.call(arguments, 1); fire(type, args); return call("emit", [type, args]); }
  var tavern_events = { APP_READY: "app_ready", MESSAGE_SENT: "message_sent", MESSAGE_RECEIVED: "message_received", MESSAGE_EDITED: "message_edited", MESSAGE_DELETED: "message_deleted", MESSAGE_SWIPED: "message_swiped", MESSAGE_UPDATED: "message_updated", USER_MESSAGE_RENDERED: "user_message_rendered", CHARACTER_MESSAGE_RENDERED: "character_message_rendered", GENERATION_STARTED: "generation_started", GENERATION_ENDED: "generation_ended", GENERATION_STOPPED: "generation_stopped", CHAT_CHANGED: "chat_id_changed", STREAM_TOKEN_RECEIVED: "stream_token_received" };
  var iframe_events = { MESSAGE_IFRAME_RENDER_STARTED: "message_iframe_render_started", MESSAGE_IFRAME_RENDER_ENDED: "message_iframe_render_ended", GENERATION_STARTED: "js_generation_started", STREAM_TOKEN_RECEIVED_FULLY: "js_stream_token_received_fully", GENERATION_ENDED: "js_generation_ended" };

  // ── 그 밖 ──
  function substitudeMacros(t) { return String(t).replace(/\{\{user\}\}/gi, I.user || "User").replace(/\{\{char\}\}/gi, I.char || "").replace(/\{\{lastMessageId\}\}/gi, String(lastId())); }
  function triggerSlash(cmd) { return call("slash", [String(cmd)]); }
  function generate(cfg) { return call("generate", [cfg || {}]); }
  function generateRaw(cfg) { return call("generateRaw", [cfg || {}]); }
  function errorCatched(fn) { return function () { try { var r = fn.apply(this, arguments); if (r && r.catch) r.catch(function (e) { console.error(e); toastr.error(String(e && e.message || e)); }); return r; } catch (e) { console.error(e); toastr.error(String(e && e.message || e)); } }; }

  var TH = {
    triggerSlash: triggerSlash, triggerSlashWithResult: triggerSlash,
    getChatMessages: getChatMessages, setChatMessages: setChatMessages, setChatMessage: setChatMessage, createChatMessages: createChatMessages, deleteChatMessages: deleteChatMessages,
    getLastMessageId: lastId, getCurrentMessageId: function () { return I.msgId != null ? I.msgId : lastId(); }, getMessageId: function () { return I.msgId; },
    getIframeName: function () { return "message-iframe-" + I.msgId; }, getScriptId: function () { return "dl-frame"; },
    getVariables: getVariables, replaceVariables: replaceVariables, insertOrAssignVariables: insertOrAssignVariables, insertVariables: insertVariables, deleteVariable: deleteVariable, updateVariablesWith: updateVariablesWith,
    eventOn: eventOn, eventOnce: eventOnce, eventMakeFirst: eventMakeFirst, eventMakeLast: eventOn, eventOnButton: eventOn, eventRemoveListener: eventRemoveListener, eventClearAll: eventClearAll, eventClearEvent: function (t) { delete handlers[t]; }, eventEmit: eventEmit,
    tavern_events: tavern_events, iframe_events: iframe_events,
    substitudeMacros: substitudeMacros, generate: generate, generateRaw: generateRaw, errorCatched: errorCatched,
    getCharAvatarPath: function () { return I.charAvatar || ""; }, getCharData: function () { return { name: I.char, avatar: I.charAvatar || "" }; },
    waitGlobalInitialized: function () { return Promise.resolve(); }, builtin: {}
  };
  for (var k in TH) window[k] = TH[k];
  window.TavernHelper = TH;
  window.toastr = toastr;
  function stChat() { return msgs().map(function (m) { return { name: m.name, is_user: m.role === "user", is_system: m.role === "system", mes: m.message, swipe_id: m.swipe_id, swipes: m.swipes, extra: {}, variables: [m.data || {}] }; }); }
  var ctx = function () {
    return { chat: stChat(), name1: I.user, name2: I.char, characterId: I.charId, chatMetadata: { variables: V.chat }, extensionSettings: {},
      event_types: tavern_events, eventSource: { on: eventOn, once: eventOnce, emit: eventEmit, removeListener: eventRemoveListener, makeFirst: eventMakeFirst },
      executeSlashCommandsWithOptions: function (t) { return triggerSlash(t).then(function (r) { return { pipe: r }; }); }, executeSlashCommands: function (t) { return triggerSlash(t).then(function (r) { return { pipe: r }; }); },
      substituteParams: substitudeMacros, generate: generate, generateRaw: generateRaw, getRequestHeaders: function () { return {}; }, saveChat: function () { return Promise.resolve(); } };
  };
  window.SillyTavern = { getContext: ctx };
  try { Object.defineProperty(window.SillyTavern, "chat", { get: function () { return stChat(); } }); } catch (e) { }
  setTimeout(function () { fire(iframe_events.MESSAGE_IFRAME_RENDER_ENDED, ["message-iframe-" + I.msgId]); }, 0);
})();
