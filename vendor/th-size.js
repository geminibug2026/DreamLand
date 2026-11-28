// 내용 높이를 앱에 알려 iframe 높이를 맞춘다.
// 문서 전체의 scrollHeight 는 iframe 의 지금 높이보다 작아지지 않는다 — 상태창을 펼쳤다 접으면 펼친 만큼 빈자리가 남던 까닭.
// 그래서 "내용이 실제로 끝나는 곳"을 잰다: body 안의 모든 내용(글 · 요소)을 감싼 범위의 아래 끝 + 마지막 요소의 아래 여백 + body 의 아래 안쪽 여백
(function () {
  var last = 0, queued = 0;
  var px = function (v) { return parseFloat(v) || 0; };
  var contentBottom = function () {
    var b = document.body; if (!b) return 0;
    var bottom = 0;
    try { var r = document.createRange(); r.selectNodeContents(b); bottom = r.getBoundingClientRect().bottom; } catch (e) { }
    // 범위가 놓치는 것(떠 있는 · 절대 위치 요소)과 아래 여백까지
    var kids = b.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i], cs = getComputedStyle(el);
      if (cs.display === "none" || cs.position === "fixed") continue;
      var rb = el.getBoundingClientRect().bottom + px(cs.marginBottom);
      if (rb > bottom) bottom = rb;
    }
    var bs = getComputedStyle(b);
    return Math.ceil(bottom + px(bs.paddingBottom) + px(bs.borderBottomWidth) + px(bs.marginBottom) + (window.scrollY || 0));
  };
  var s = function () {
    queued = 0;
    var h = contentBottom();
    if (!h) h = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (h !== last) { last = h; parent.postMessage({ dlFrame: 1, h: h }, "*"); }
  };
  var soon = function () { if (!queued) queued = requestAnimationFrame(s); };
  addEventListener("load", s);
  try { var ro = new ResizeObserver(soon); ro.observe(document.documentElement); if (document.body) ro.observe(document.body); else addEventListener("DOMContentLoaded", function () { ro.observe(document.body); }); } catch (e) { }
  // 펼치기 · 접기(details), 누르기로 바뀌는 상태창은 바로 다시 잰다 (body 높이가 화면 높이에 묶여 있어도)
  document.addEventListener("toggle", soon, true);
  document.addEventListener("click", function () { soon(); setTimeout(soon, 350); }, true);
  document.addEventListener("transitionend", soon, true);
  setInterval(s, 1000); s();
})();
