// Dreamland 로컬 서버 — 의존성 없음 (Node 18+)
// 1) 정적 파일 제공  2) CORS 우회 프록시  3) 다른 앱의 데이터 폴더 읽기 전용 브리지
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT) || 4173;
// 기본은 이 PC 에서만 접속. 같은 공유기 안의 휴대폰에서도 쓰려면  node server.js --lan
const LAN = process.argv.includes('--lan');
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// 접속 보호: 허용한 호스트 이름만 받고(DNS 리바인딩 차단), LAN 모드에서는 접속 키를 요구한다
const LAN_KEY = LAN ? require('crypto').randomBytes(6).toString('hex') : '';
const lanIps = () => Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
const hostOk = host => { const name = String(host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, ''); return ['localhost', '127.0.0.1', '::1'].includes(name) || (LAN && lanIps().includes(name)); };
// 접속 키를 마구 넣어 보는 시도 막기: 기기당 10번 틀리면 10분 동안 받지 않는다
const fails = new Map();
const blocked = ip => { const f = fails.get(ip); return !!f && f.n >= 10 && Date.now() - f.t < 600000; };
const failed = ip => { const f = fails.get(ip); if (!f || Date.now() - f.t > 600000) fails.set(ip, { n: 1, t: Date.now() }); else { f.n++; f.t = Date.now(); } };
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com; img-src 'self' data: blob: https: http:; media-src 'self' data: blob: https:; connect-src *; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

// ── 비밀 값 보관함: API 키는 이 파일에만 두고, 브라우저에는 "@@dl:연결:칸@@" 꼬리표만 돌려준다 ──
// 값은 다시 내주지 않고, 프록시가 요청을 내보낼 때에만 끼워 넣는다. 끼워 넣을 수 있는 곳은 키를 넣을 때 정한 주소로 제한한다.
const SECRET_FILE = path.join(ROOT, 'data', 'secrets.json');
const SECRET_RE = /@@dl:([\w-]+):(\w+)@@/g;
let secretCache = null;
const loadSecrets = () => { if (!secretCache) { try { secretCache = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8')); } catch { secretCache = {}; } } return secretCache; };
const saveSecrets = () => { fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true }); const tmp = SECRET_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(secretCache, null, 1), { mode: 0o600 }); fs.renameSync(tmp, SECRET_FILE); };
const hostAllowed = (hosts, name) => (hosts || []).some(h => h && (name === h || name.endsWith('.' + h)));
const tail4 = v => { const s = String(v); return s.length > 8 ? s.slice(-4) : ''; };
/** 꼬리표를 실제 값으로 바꾼다. 허락되지 않은 주소면 오류 */
function fillSecrets(text, hostname) {
  if (typeof text !== 'string' || text.indexOf('@@dl:') < 0) return text;
  const all = loadSecrets();
  return text.replace(SECRET_RE, (m, id, field) => {
    const rec = all[id]?.[field]; if (!rec) throw new Error('보관된 키를 찾을 수 없습니다. 연결 설정에서 키를 다시 넣어 주세요.');
    if (!hostAllowed(rec.hosts, hostname)) throw new Error(`이 키는 ${rec.hosts.join(', ')} 로만 보낼 수 있습니다 (요청한 곳: ${hostname}). 주소를 바꿨다면 키를 다시 넣어 주세요.`);
    return rec.value;
  });
}

const exists = async p => { try { await fsp.access(p); return true; } catch { return false; } };
const isDir = async p => { try { return (await fsp.stat(p)).isDirectory(); } catch { return false; } };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...SEC_HEADERS });
  res.end(buf);
}

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('요청이 너무 큽니다')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// ── 브리지: 허용되는 루트인지 확인 (가져오기를 허용한 데이터 폴더만) ──
async function rootKind(root) {
  if (!root || !path.isAbsolute(root)) return null;
  if (await exists(path.join(root, 'storage', 'tables'))) return 'marinara';
  if (await exists(path.join(root, 'settings.json')) && (await isDir(path.join(root, 'characters')))) return 'st';
  return null;
}
function inside(root, rel) {
  const full = path.resolve(root, rel || '.');
  const r = path.resolve(root);
  if (full !== r && !full.startsWith(r + path.sep)) throw new Error('허용되지 않은 경로');
  return full;
}

// 설치 폴더(또는 데이터 폴더)를 받아 실제 데이터 루트 후보를 찾는다
async function resolveInstall(p) {
  const out = [];
  if (!p) return out;
  p = path.resolve(p);
  const direct = await rootKind(p);
  if (direct) { out.push({ kind: direct, root: p, label: path.basename(p) }); return out; }
  // 설치 폴더 (형식 A) → data/<user>
  const dataDir = path.join(p, 'data');
  if (await isDir(dataDir)) {
    for (const name of await fsp.readdir(dataDir)) {
      const u = path.join(dataDir, name);
      if ((await rootKind(u)) === 'st') out.push({ kind: 'st', root: u, label: name });
    }
  }
  // 예전 폴더 구조 → public
  if ((await rootKind(path.join(p, 'public'))) === 'st') out.push({ kind: 'st', root: path.join(p, 'public'), label: 'public' });
  // 설치 폴더 (형식 B)
  for (const sub of ['packages/server/data', 'data']) {
    const m = path.join(p, sub);
    if ((await rootKind(m)) === 'marinara') out.push({ kind: 'marinara', root: m, label: 'Marinara Engine' });
  }
  return out;
}

async function detect() {
  const home = os.homedir();
  const bases = [path.dirname(ROOT), path.join(home, 'Documents'), home, path.join(home, 'Desktop'), path.join(home, 'Downloads')];
  const names = ['SillyTavern', 'sillytavern', 'SillyTavern-Launcher/SillyTavern', 'Marinara-Engine', 'marinara-engine', 'Marinara Engine'];
  const seen = new Set(); const found = [];
  for (const b of bases) for (const n of names) {
    const p = path.join(b, n);
    if (seen.has(p) || !(await isDir(p))) continue;
    seen.add(p);
    for (const r of await resolveInstall(p)) if (!found.some(f => f.root.toLowerCase() === r.root.toLowerCase())) found.push({ ...r, install: p });
  }
  return found;
}

const UNSAFE_KEY = /^(__proto__|constructor|prototype)$/;
async function api(req, res, url) {
  // 다른 웹사이트가 이 로컬 서버를 호출하지 못하게 한다
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'forbidden origin' });
  // 폴더 읽기는 서버를 실행한 PC 에서 접속했을 때만 허용한다
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (!local && /^\/api\/(fs|detect|resolve)/.test(url.pathname)) return send(res, 403, { error: '이 기능은 서버를 실행한 PC 에서만 쓸 수 있습니다' });
  if (req.method === 'POST' && req.headers['x-dreamland'] !== '1') return send(res, 403, { error: 'forbidden' });

  if (url.pathname === '/api/ping') return send(res, 200, { ok: true, bridge: true, secrets: true });
  if (url.pathname === '/api/secrets' && req.method === 'GET') {   // 무엇이 보관돼 있는지만 알려 준다 (값은 주지 않음)
    const out = {}; for (const [id, fields] of Object.entries(loadSecrets())) out[id] = Object.fromEntries(Object.entries(fields).map(([f, r]) => [f, { tail: r.tail || '', hosts: r.hosts || [], note: r.note || '', at: r.at || 0 }]));
    return send(res, 200, out);
  }
  if (url.pathname === '/api/detect') return send(res, 200, await detect());
  if (url.pathname === '/api/extensions') {
    const dir = path.join(ROOT, 'extensions'); const out = [];
    if (await isDir(dir)) for (const d of await fsp.readdir(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      try {
        const m = JSON.parse(await fsp.readFile(path.join(dir, d.name, 'manifest.json'), 'utf8'));
        const main = path.join(dir, d.name, m.main || 'index.js'); const st = await fsp.stat(main);
        const base = '/extensions/' + encodeURIComponent(d.name) + '/';
        out.push({ id: String(m.id || d.name), name: m.name || d.name, version: m.version || '', author: m.author || '', description: m.description || '', entry: base + (m.main || 'index.js') + '?v=' + Math.round(st.mtimeMs), css: m.css ? base + m.css : '' });
      } catch { }
    }
    return send(res, 200, out);
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const body = await readBody(req);

  if (url.pathname === '/api/resolve') return send(res, 200, await resolveInstall(body.path));

  if (url.pathname === '/api/secrets/put') {
    const { id, field, value, hosts, note } = body;
    if (UNSAFE_KEY.test(id || '') || UNSAFE_KEY.test(field || '')) return send(res, 400, { error: '잘못된 요청' });
    if (!/^[\w-]+$/.test(id || '') || !/^\w+$/.test(field || '') || typeof value !== 'string' || !value) return send(res, 400, { error: '잘못된 요청' });
    const list = (Array.isArray(hosts) ? hosts : []).map(h => String(h).toLowerCase().replace(/^\.+/, '')).filter(h => /^[a-z0-9.-]+$/.test(h));
    if (!list.length) return send(res, 400, { error: '이 키를 보낼 주소를 알 수 없습니다. 연결의 주소를 먼저 넣어 주세요.' });
    const all = loadSecrets(); (all[id] ||= {})[field] = { value, hosts: list, tail: field === 'serviceAccount' ? '' : tail4(value), note: String(note || '').slice(0, 200), at: Date.now() };
    saveSecrets(); return send(res, 200, { ok: true, tail: all[id][field].tail });
  }
  if (/^\/api\/secrets\/(delete|reveal)$/.test(url.pathname) && (UNSAFE_KEY.test(String(body.id || '')) || UNSAFE_KEY.test(String(body.field || '')))) return send(res, 400, { error: '잘못된 요청' });
  if (url.pathname === '/api/secrets/delete') {
    const all = loadSecrets(); if (body.field) { if (all[body.id]) { delete all[body.id][body.field]; if (!Object.keys(all[body.id]).length) delete all[body.id]; } } else delete all[body.id];
    saveSecrets(); return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/secrets/reveal') {   // 값 꺼내기는 서버를 실행한 PC 에서만 (서버 보관을 끌 때 쓴다)
    if (!local) return send(res, 403, { error: '키를 꺼내는 일은 서버를 실행한 PC 에서만 할 수 있습니다' });
    const rec = loadSecrets()[body.id]?.[body.field]; if (!rec) return send(res, 404, { error: 'not found' });
    return send(res, 200, { value: rec.value });
  }

  if (url.pathname === '/api/fs/list') {
    if (!(await rootKind(body.root))) return send(res, 400, { error: '지원하지 않는 폴더' });
    if (/[:\0]/.test(String(body.sub || ''))) return send(res, 403, { error: '읽을 수 없는 경로' });
    const dir = inside(body.root, body.sub);
    if (!(await isDir(dir))) return send(res, 200, []);
    const items = [];
    for (const d of await fsp.readdir(dir, { withFileTypes: true })) {
      let size = 0, mtime = 0;
      if (d.isFile()) { try { const s = await fsp.stat(path.join(dir, d.name)); size = s.size; mtime = s.mtimeMs; } catch { } }
      items.push({ name: d.name, dir: d.isDirectory(), size, mtime });
    }
    return send(res, 200, items);
  }

  if (url.pathname === '/api/fs/read') {
    if (!(await rootKind(body.root))) return send(res, 400, { error: '지원하지 않는 폴더' });
    if (/[:\0]/.test(String(body.rel || ''))) return send(res, 403, { error: '읽을 수 없는 경로' });
    const file = inside(body.root, body.rel);
    const base = path.basename(file).toLowerCase().replace(/[. ]+$/, '');
    if (base === 'secrets.json' || base.startsWith('.encryption')) return send(res, 403, { error: '비밀 값은 읽지 않습니다' });
    if (!(await exists(file))) return send(res, 404, { error: 'not found' });
    return send(res, 200, await fsp.readFile(file), 'application/octet-stream');
  }

  if (url.pathname === '/api/vertex-token') {
    let sa = body.serviceAccount || {};
    if (body.ref) { const rec = loadSecrets()[body.ref]?.serviceAccount; if (!rec) return send(res, 400, { error: '보관된 서비스 계정 키를 찾을 수 없습니다. 연결 설정에서 다시 넣어 주세요.' }); try { sa = JSON.parse(rec.value); } catch { return send(res, 400, { error: '보관된 서비스 계정 키가 올바른 JSON 이 아닙니다' }); } }
    if (!sa.client_email || !sa.private_key) return send(res, 400, { error: '서비스 계정 키가 올바르지 않습니다' });
    const aud = 'https://oauth2.googleapis.com/token';   // 키 파일의 token_uri 는 믿지 않고 고정 주소만 쓴다
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud, iat: now, exp: now + 3600 });
    let sig;
    try { sig = require('crypto').createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url'); }
    catch (e) { return send(res, 400, { error: '개인 키로 서명하지 못했습니다: ' + e.message }); }
    const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return send(res, 502, { error: 'Google 인증 실패: ' + (j.error_description || j.error || r.status) });
    return send(res, 200, { access_token: j.access_token, expires_in: j.expires_in });
  }

  if (url.pathname === '/api/proxy') {
    let target, pHeaders, pBody;
    try {
      const host0 = new URL(String(body.url).replace(SECRET_RE, 'x')).hostname;   // 주소 안의 꼬리표를 채우기 전에 어디로 가는지 먼저 본다
      target = new URL(fillSecrets(String(body.url), host0));
      if (target.hostname !== host0) return send(res, 400, { error: 'bad url' });
      pHeaders = Object.fromEntries(Object.entries(body.headers || {}).map(([k, v]) => [k, fillSecrets(String(v), target.hostname)]));
      pBody = body.body == null ? undefined : fillSecrets(typeof body.body === 'string' ? body.body : JSON.stringify(body.body), target.hostname);
    } catch (e) { return send(res, 400, { error: e.message }); }
    if (!/^https?:$/.test(target.protocol)) return send(res, 400, { error: 'bad url' });
    for (const k of Object.keys(pHeaders)) if (k.toLowerCase() === 'x-dl-proxied') delete pHeaders[k];
    pHeaders['x-dl-proxied'] = '1';
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    let up;
    try {
      up = await fetch(target, {
        method: body.method || 'POST', headers: pHeaders,
        body: pBody, redirect: 'manual',
        signal: ac.signal,
      });
    } catch (e) {
      return send(res, 502, { error: '프록시 연결 실패: ' + (e.cause?.message || e.message) });
    }
    res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (!up.body) return res.end();
    Readable.fromWeb(up.body).on('error', () => res.end()).pipe(res);
    return;
  }
  send(res, 404, { error: 'unknown api' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (!hostOk(req.headers.host)) return send(res, 403, 'forbidden host', 'text/plain');
    if (req.headers['x-dl-proxied']) return send(res, 403, 'forbidden', 'text/plain');   // 프록시를 거쳐 되돌아온 요청 ("이 PC 에서만" 제한을 우회하지 못하게)
    if (LAN && !isLocal(req)) {   // 다른 기기에서 올 때는 접속 키가 있어야 한다
      const cookie = String(req.headers.cookie || '').match(/(?:^|;\s*)dl_key=([0-9a-f]+)/)?.[1];
      const ip = req.socket.remoteAddress;
      if (blocked(ip)) return send(res, 429, '접속 키를 여러 번 틀렸습니다. 10분 뒤에 다시 시도해 주세요.', 'text/plain; charset=utf-8');
      if (url.searchParams.has('key') && url.searchParams.get('key') !== LAN_KEY) failed(ip);
      if (url.searchParams.get('key') === LAN_KEY) { fails.delete(ip); res.writeHead(302, { 'Set-Cookie': `dl_key=${LAN_KEY}; HttpOnly; SameSite=Strict; Path=/`, Location: '/' }); return res.end(); }
      if (cookie !== LAN_KEY) return send(res, 401, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dreamland</title><body style="font-family:sans-serif;display:grid;place-items:center;height:90vh;margin:0"><form method="get" action="/" style="display:grid;gap:12px;text-align:center"><b>접속 키</b><input name="key" autofocus autocomplete="off" style="font-size:20px;padding:10px;text-align:center"><button style="padding:10px">들어가기</button><small>서버를 실행한 PC 의 창에 표시된 키를 넣어 주세요.</small></form>', 'text/html; charset=utf-8');
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = (await exists(path.join(ROOT, 'dist', 'next.html'))) ? '/dist/next.html' : '/index.html';   // React 판을 빌드해 두었으면 그것을, 아니면 옛 판을 연다
    if (rel.toLowerCase().startsWith('/node_modules')) return send(res, 403, 'forbidden', 'text/plain');
    if (rel.includes(':') || rel.includes('\0')) return send(res, 403, 'forbidden', 'text/plain');
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT + path.sep) || path.basename(file).toLowerCase() === 'server.js' || /^data([\\/]|$)/i.test(path.relative(ROOT, file)) || /(^|[\\/])\./.test(path.relative(ROOT, file)) || /\.(bat|cmd|sh|md)$/i.test(file)) return send(res, 403, 'forbidden', 'text/plain');
    if (!(await exists(file)) || (await isDir(file))) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, await fsp.readFile(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: e.message });
    else res.end();
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`\n  ${PORT}번 포트를 이미 쓰고 있어요. 드림랜드가 이미 켜져 있다면 브라우저에서 http://localhost:${PORT} 를 열어 주세요.\n  다른 포트로 열려면 PORT 환경 변수를 정해 주세요. (예: PORT=4180)\n`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  const u = `http://localhost:${PORT}`;
  console.log(`\n  Dreamland  →  ${u}`);
  if (LAN) console.log(`  접속 키  →  ${LAN_KEY}   (다른 기기에서 처음 열 때 한 번 입력)`);
  if (LAN) for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  같은 공유기의 기기에서  →  http://${n.address}:${PORT}`);
  console.log('  (이 창을 닫으면 서버가 종료됩니다)\n');
  if (process.argv.includes('--open')) {
    const cmd = process.platform === 'win32' ? `start "" "${u}"` : process.platform === 'darwin' ? `open "${u}"` : process.platform === 'android' ? `termux-open-url "${u}"` : `xdg-open "${u}"`;
    require('child_process').exec(cmd, () => { });   // 열지 못해도 서버는 그대로 둔다 (주소는 위에 적혀 있다)
  }
});
