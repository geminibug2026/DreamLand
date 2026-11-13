// 내용 높이를 앱에 알려 iframe 높이를 맞춘다
(function () {
  var last = 0;
  var s = function () {
    var h = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (h !== last) { last = h; parent.postMessage({ dlFrame: 1, h: h }, "*"); }
  };
  addEventListener("load", s);
  try { new ResizeObserver(s).observe(document.documentElement); } catch (e) { }
  setInterval(s, 1000); s();
})();
