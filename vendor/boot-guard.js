// 켜기 지킴이: 앱 코드보다 먼저 읽힌다 (index.html). 앱이 끝내 그려지지 않으면 빈 화면으로 두지 않는다.
//  · 앱 파일을 읽다 실패했다 (업데이트 도중에 반만 받은 파일을 브라우저가 들고 있을 때 등) → 앱 파일을 서버에서 새로 받아 덮고 한 번 다시 연다
//  · 그래도 안 되거나 다른 까닭으로 멈췄다 → 무엇이 막혔는지와 할 일을 화면에 보여 준다 (브라우저 데이터를 지우지 않아도 되게)
(function () {
  var errs = [], KEY = 'dl-boot-heal';
  var ko = /^ko/i.test(navigator.language || 'ko');
  try { var saved = localStorage.getItem('dreamland:lang'); if (saved) ko = /^ko/i.test(saved); } catch (e) { }
  var T = ko ? {
    healing: '앱 파일을 새로 받는 중이에요…',
    title: '드림랜드를 여는 중에 멈췄어요',
    body: '기록은 그대로 있어요. 브라우저 데이터를 지우지 마세요.',
    tabs: '다른 탭에 드림랜드가 열려 있으면 모두 닫은 뒤 아래 버튼을 눌러 주세요.',
    retry: '앱 파일 새로 받아서 다시 열기'
  } : {
    healing: 'Fetching fresh app files…',
    title: 'Dreamland got stuck while opening',
    body: 'Your data is safe. Please don’t clear your browser data.',
    tabs: 'If Dreamland is open in other tabs, close them all, then press the button below.',
    retry: 'Fetch app files again and reopen'
  };
  addEventListener('error', function (e) {
    var el = e.target;
    if (el && el !== window && (el.tagName === 'SCRIPT' || el.tagName === 'LINK')) errs.push('load: ' + String(el.src || el.href || '').replace(location.origin, ''));
    else if (e.message) errs.push(e.message + (e.filename ? ' @ ' + String(e.filename).replace(location.origin, '') : ''));
  }, true);
  addEventListener('unhandledrejection', function (e) { var r = e.reason; errs.push(String((r && r.message) || r)); });
  var up = function () { var r = document.getElementById('rail'), p = document.getElementById('page'); return !!((r && r.childElementCount) || (p && p.childElementCount)); };
  var fileErr = function () { return errs.some(function (m) { return /^load: \/dist\/|SyntaxError|Unexpected (end|token)|dynamically imported module|Importing a module script failed|Failed to fetch/i.test(m); }); };

  // 앱 파일(dist/assets)을 브라우저 캐시를 거치지 않고 새로 받아 덮는다: index.html 에 적힌 것 → 받은 코드 안에 적힌 조각까지
  function heal() {
    var seen = {}, list = [], done = 0;
    var add = function (u) { try { u = new URL(u, location.href).href; } catch (e) { return; } if (!seen[u] && /\/dist\/assets\/[^/]+\.(js|css)$/.test(u)) { seen[u] = 1; list.push(u); } };
    try { performance.getEntriesByType('resource').forEach(function (r) { add(r.name); }); } catch (e) { }
    var scan = function (txt) { var re = /(?:\.\/|assets\/)([\w.-]+\.(?:js|css))/g, m; while ((m = re.exec(txt))) add('/dist/assets/' + m[1]); };
    var next = function () {
      var batch = list.slice(done); done = list.length;
      if (!batch.length || done > 800) return Promise.resolve();
      return Promise.all(batch.map(function (u) {
        return fetch(u, { cache: 'reload', credentials: 'same-origin' }).then(function (r) { return /\.js$/.test(u) && r.ok ? r.text().then(scan) : null; }).catch(function () { });
      })).then(next);
    };
    return fetch(location.pathname || '/', { cache: 'reload', credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(scan).catch(function () { }).then(next);
  }
  var recent = function () { try { return Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 120000; } catch (e) { return true; } };
  var mark = function () { try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) { } };

  var box = null;
  function show(healing) {
    if (box) box.remove();
    box = document.createElement('div');
    box.className = 'boot-guard';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg,#fbf5f2);color:var(--ink,#3a2f33);font:15px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;text-align:center';
    var card = document.createElement('div'); card.style.cssText = 'max-width:340px';
    var p = function (txt, css) { var e = document.createElement('p'); e.textContent = txt; e.style.cssText = 'margin:0 0 10px;' + (css || ''); card.appendChild(e); return e; };
    if (healing) p(T.healing, 'opacity:.75');
    else {
      p(T.title, 'font-weight:700;font-size:17px');
      p(T.body);
      p(T.tabs, 'opacity:.75;font-size:13.5px');
      var b = document.createElement('button'); b.type = 'button'; b.textContent = T.retry;
      b.style.cssText = 'margin:8px 0 14px;padding:11px 18px;border:0;border-radius:12px;background:var(--accent,#c97b8e);color:#fff;font:inherit;font-weight:600';
      b.onclick = function () { b.disabled = true; b.textContent = T.healing; mark(); heal().then(function () { location.reload(); }); };
      card.appendChild(b);
      if (errs.length) p(errs.slice(-3).join('\n'), 'white-space:pre-wrap;word-break:break-all;font:11px/1.45 ui-monospace,monospace;opacity:.55;text-align:left');
    }
    box.appendChild(card); document.body.appendChild(box);
  }
  // 앱이 늦게라도 그려지면 안내를 걷는다
  var watch = setInterval(function () { if (up()) { clearInterval(watch); if (box) { box.remove(); box = null; } } }, 1000);
  setTimeout(function () {
    if (up() || !fileErr() || recent()) return;
    mark(); show(true); heal().then(function () { location.reload(); });
  }, 3000);
  setTimeout(function () { if (!up() && !box) show(false); }, 15000);
})();
