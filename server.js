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
// 자료 폴더: 기본은 이 폴더의 data/. 시험할 때는 DL_DATA_DIR 로 다른 폴더를 쓴다
const DATA_DIR = process.env.DL_DATA_DIR ? path.resolve(process.env.DL_DATA_DIR) : path.join(ROOT, 'data');
const SECRET_FILE = path.join(DATA_DIR, 'secrets.json');
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

// ── 자료 폴더: 브라우저 저장소(IndexedDB)의 거울. 저장소마다 폴더, 레코드마다 파일 하나 ──
// 파일 꼴: 1줄 = 머리 {v,store,id,hash,at,dev,size}, 2줄 = 값(JSON). 긴 base64 · dataURL 은 _bin/ 의 파일로 빼고 {"$dlbin":sha,"h":앞머리} 로 남긴다.
// 지우기 · 덮어쓰기는 조용히 버리지 않는다: 지운 것은 _trash/ 로, 다른 기기의 것과 부딪친 것은 _conflicts/ 로 옮긴다.
const STORE_DIR = path.join(DATA_DIR, 'store');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BIN_MIN = 8192;
const DAY = 86400000;
let clockShift = Number(process.env.DL_CLOCK_SHIFT || 0);   // 시험용: 시계를 앞뒤로 돌린다
const clock = () => Date.now() + clockShift;
const Store = {};

/** 브라우저(src/datafolder/codec.ts)와 똑같은 해시. 값의 JSON 글자열로 계산한다 */
function dlHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x9e3779b9 ^ str.length, h4 = 0x85ebca6b;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    h3 = Math.imul(h3 ^ c, 2246822507); h4 = Math.imul(h4 ^ c, 3266489909);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  const x = n => (n >>> 0).toString(16).padStart(8, '0');
  return x(h1) + x(h2) + x(h3) + x(h4) + str.length.toString(36);
}

const storeOk = s => typeof s === 'string' && /^[a-z][a-z0-9_]{0,31}$/.test(s);
const idOk = id => (typeof id === 'string' && id.length > 0 && id.length <= 1000) || (typeof id === 'number' && Number.isFinite(id));
/** 레코드 id → 파일 이름. Windows 는 대소문자를 가리지 않으므로 소문자 · 숫자 · _ · - 만 그대로 두고 나머지는 ~hh 로 */
function fileOf(id) {
  let s = typeof id === 'number' ? 'n~' + String(id).replace(/[^0-9a-z]/g, c => '~' + c.charCodeAt(0).toString(16).padStart(2, '0')) : '';
  if (!s) for (const b of Buffer.from(id, 'utf8')) { const c = String.fromCharCode(b); s += /[a-z0-9_-]/.test(c) ? c : '~' + b.toString(16).padStart(2, '0'); }
  if (s.length > 150) s = 'h~' + require('crypto').createHash('sha1').update(typeof id + ':' + id).digest('hex');
  return s + '.json';
}
const recPath = (store, id) => path.join(STORE_DIR, store, fileOf(id));

async function fsyncFile(p) { let fh; try { fh = await fsp.open(p, 'r+'); await fh.sync(); } catch { } finally { await fh?.close().catch(() => { }); } }
async function renameRetry(a, b) {
  for (let i = 0; ; i++) { try { return await fsp.rename(a, b); } catch (e) { if (i >= 8 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e; await new Promise(r => setTimeout(r, 30 * (i + 1))); } }
}
/** 원자적 쓰기: 같은 폴더의 임시 파일에 쓰고 fsync → rename. 반쯤 쓴 파일은 남지 않는다 */
async function atomicWrite(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2) + '-' + path.basename(file));
  const fh = await fsp.open(tmp, 'w');
  try { await fh.writeFile(data); await fh.sync(); } finally { await fh.close(); }
  try { await renameRetry(tmp, file); } catch (e) { await fsp.unlink(tmp).catch(() => { }); throw e; }
}

// 모든 쓰기 · 백업 · 복원은 한 줄로 차례차례 (같은 레코드를 동시에 써도 들어온 순서대로)
let chain = Promise.resolve();
const serial = fn => { const p = chain.then(fn); chain = p.catch(() => { }); return p; };

// 비밀 값(secrets.json)이 자료에 섞여 들어오면 지운다 — 자료 폴더 · 백업에는 꼬리표만
let scrubbed = 0;
function scrubSecrets(str) {
  const all = loadSecrets();
  for (const fields of Object.values(all)) for (const rec of Object.values(fields || {})) {
    const v = rec && rec.value; if (typeof v !== 'string' || v.length < 6) continue;
    for (const form of [JSON.stringify(v).slice(1, -1), JSON.stringify(JSON.stringify(v).slice(1, -1)).slice(1, -1)]) if (str.includes(form)) { str = str.split(form).join(''); scrubbed++; }
  }
  return str;
}

const canonB64 = s => /^[A-Za-z0-9+/]*={0,2}$/.test(s) && s.length % 4 === 0 && Buffer.from(s, 'base64').toString('base64') === s;
const binPath = sha => path.join(STORE_DIR, '_bin', sha.slice(0, 2), sha + '.bin');
/** 값 안의 긴 base64 를 파일로 뺀다. esc(이스케이프된 객체)의 자기 키는 건드리지 않는다 */
async function extractBins(v, out) {
  if (typeof v === 'string') {
    if (v.length < BIN_MIN) return v;
    const m = /^(data:[^,]{0,200};base64,)/.exec(v); const head = m ? m[1] : '', body = v.slice(head.length);
    if ((m || !v.startsWith('data:')) && canonB64(body)) {
      const buf = Buffer.from(body, 'base64'); const sha = require('crypto').createHash('sha256').update(buf).digest('hex');
      out.set(sha, buf); return { $dlbin: sha, h: head };
    }
    return v;
  }
  if (Array.isArray(v)) { const a = []; for (const x of v) a.push(await extractBins(x, out)); return a; }
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await extractBins(v[k], out); return o; }
  return v;
}
const isBinRef = v => v && typeof v === 'object' && !Array.isArray(v) && typeof v.$dlbin === 'string' && Object.keys(v).length === 2 && 'h' in v;
async function resolveBins(v, get) {
  if (Array.isArray(v)) { const a = []; for (const x of v) a.push(await resolveBins(x, get)); return a; }
  if (v && typeof v === 'object') {
    if (isBinRef(v)) return v.h + (await get(v.$dlbin)).toString('base64');
    const o = {}; for (const k of Object.keys(v)) o[k] = await resolveBins(v[k], get); return o;
  }
  return v;
}
const readBin = sha => { if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('bad bin'); return fsp.readFile(binPath(sha)); };
async function writeBins(map) { for (const [sha, buf] of map) { const p = binPath(sha); if (!(await exists(p))) await atomicWrite(p, buf); } }

/** 레코드 파일 읽기: { meta, raw(2줄 글자) } */
async function readRec(file) {
  let txt; try { txt = await fsp.readFile(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  const nl = txt.indexOf('\n'); if (nl < 0) return null;
  return { meta: JSON.parse(txt.slice(0, nl)), raw: txt.slice(nl + 1) };
}
async function readMeta(file) {
  let fh; try { fh = await fsp.open(file, 'r'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  try {
    let size = 4096, pos = 0, acc = Buffer.alloc(0);
    for (; ;) { const b = Buffer.alloc(size); const { bytesRead } = await fh.read(b, 0, size, pos); acc = Buffer.concat([acc, b.subarray(0, bytesRead)]); const i = acc.indexOf(10); if (i >= 0) return JSON.parse(acc.subarray(0, i).toString('utf8')); if (!bytesRead) return null; pos += bytesRead; size *= 2; }
  } finally { await fh.close(); }
}
async function storeNames() { try { return (await fsp.readdir(STORE_DIR, { withFileTypes: true })).filter(d => d.isDirectory() && storeOk(d.name)).map(d => d.name); } catch { return []; } }
async function listMetas(only) {
  const out = [];
  for (const s of await storeNames()) {
    if (only && s !== only) continue;
    for (const f of await fsp.readdir(path.join(STORE_DIR, s))) { if (!f.endsWith('.json') || f.startsWith('.')) continue; try { const m = await readMeta(path.join(STORE_DIR, s, f)); if (m) out.push(m); } catch { } }
  }
  return out;
}
async function moveAside(kind, store, id, note) {   // _trash 또는 _conflicts 로 옮긴다 (지우지 않는다)
  const src = recPath(store, id); const rec = await readRec(src); if (!rec) return false;
  const dst = path.join(STORE_DIR, kind, store, clock() + '-' + Math.random().toString(36).slice(2, 6) + '-' + fileOf(id));
  await atomicWrite(dst, JSON.stringify({ ...rec.meta, [kind === '_trash' ? 'deletedAt' : 'asideAt']: clock(), note: note || '' }) + '\n' + rec.raw);
  if (kind === '_trash') await fsp.unlink(src);
  return true;
}
let lastWrite = 0;
/** 레코드 하나 쓰기 (serial 안에서 부른다). value 는 브라우저가 보낸 JSON 값 */
async function putRec(store, id, value, { dev = '', base, at, keep } = {}) {
  let str = JSON.stringify(value === undefined ? null : value); str = scrubSecrets(str); value = JSON.parse(str);
  const hash = dlHash(str), file = recPath(store, id); const cur = await readMeta(file);
  if (cur && cur.hash === hash) return { ok: true, hash, same: true };
  if (cur && keep) await moveAside('_conflicts', store, id, '양쪽이 다 바뀌어 서버 판을 남겨 둠');
  else if (cur && base === undefined) await moveAside('_conflicts', store, id, '이전 판을 모르는 채로 덮어씀');
  else if (cur && base !== undefined && cur.hash !== base && cur.dev && cur.dev !== dev) await moveAside('_conflicts', store, id, '다른 기기의 저장과 부딪침');
  const bins = new Map(); const packed = await extractBins(value, bins); await writeBins(bins);
  const meta = { v: 1, store, id, hash, at: at || clock(), dev, size: str.length };
  await atomicWrite(file, JSON.stringify(meta) + '\n' + JSON.stringify(packed)); lastWrite = clock();
  return { ok: true, hash };
}
async function delRec(store, id, { dev = '', base } = {}) {
  const file = recPath(store, id); const cur = await readMeta(file); if (!cur) return { ok: true, gone: true };
  await moveAside('_trash', store, id, base !== undefined && cur.hash !== base && cur.dev !== dev ? '다른 기기에서 고친 뒤 지워짐' : ''); lastWrite = clock();
  return { ok: true };
}
async function getRec(store, id) {
  const rec = await readRec(recPath(store, id)); if (!rec) return null;
  return { store, id: rec.meta.id, hash: rec.meta.hash, at: rec.meta.at, value: await resolveBins(JSON.parse(rec.raw), readBin) };
}

// ── 백업: 전체를 한 파일(줄 단위 JSON + gzip)로. 이름 = YYYYMMDD-HHMMSS-종류.dlbak.gz ──
const zlib = require('zlib');
const pad = n => String(n).padStart(2, '0');
const stamp = t => { const d = new Date(t); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
const BK_RE = /^(\d{8})-(\d{6})-([a-z-]+)(?:-\d+)?\.dlbak\.gz$/;
const parseBk = name => { const m = BK_RE.exec(name); if (!m) return null; const [y, mo, d] = [m[1].slice(0, 4), m[1].slice(4, 6), m[1].slice(6)], [hh, mi, ss] = [m[2].slice(0, 2), m[2].slice(2, 4), m[2].slice(4)]; return { name, at: new Date(+y, +mo - 1, +d, +hh, +mi, +ss).getTime(), kind: m[3] }; };
async function listBackups() {
  let names = []; try { names = await fsp.readdir(BACKUP_DIR); } catch { }
  const out = [];
  for (const n of names) { const b = parseBk(n); if (!b) continue; try { b.size = (await fsp.stat(path.join(BACKUP_DIR, n))).size; } catch { continue; } out.push(b); }
  return out.sort((a, b) => b.at - a.at);
}
/** 보관 규칙: 최근 3일은 모두, 최근 14일은 하루에 하나, 최근 8주는 주마다 하나, 최근 6개월은 달마다 하나 (각 칸의 가장 새 것). 나머지만 지운다 */
function planPrune(list, now) {
  const keep = new Set(), sorted = [...list].sort((a, b) => b.at - a.at);
  const firstIn = (keyOf, from) => { const seen = new Set(); for (const b of sorted) { if (b.at < from || b.at > now + DAY) continue; const k = keyOf(b.at); if (!seen.has(k)) { seen.add(k); keep.add(b.name); } } };
  for (const b of sorted) if (b.at >= now - 3 * DAY) keep.add(b.name);
  const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  firstIn(dayKey, startOfDay(now) - 13 * DAY);
  const weekKey = t => { const d = new Date(startOfDay(t)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d.getTime()); };
  firstIn(weekKey, startOfDay(now) - 8 * 7 * DAY);
  const n = new Date(now); const m6 = new Date(n.getFullYear(), n.getMonth() - 5, 1).getTime();
  firstIn(t => { const d = new Date(t); return d.getFullYear() * 100 + d.getMonth(); }, m6);
  return { keep: sorted.filter(b => keep.has(b.name)), drop: sorted.filter(b => !keep.has(b.name)) };
}
async function pruneBackups() {
  const { drop } = planPrune(await listBackups(), clock());
  for (const b of drop) await fsp.unlink(path.join(BACKUP_DIR, b.name)).catch(() => { });
  // 지운 자료(_trash)는 30일 뒤에 정리한다 (그 사이의 하루 백업에 들어 있다)
  const tdir = path.join(STORE_DIR, '_trash');
  for (const s of await fsp.readdir(tdir).catch(() => [])) for (const f of await fsp.readdir(path.join(tdir, s)).catch(() => [])) { const t = Number(f.split('-')[0]); if (t && t < clock() - 30 * DAY) await fsp.unlink(path.join(tdir, s, f)).catch(() => { }); }
  return drop.length;
}
async function countRecords() { let n = 0; for (const s of await storeNames()) n += (await fsp.readdir(path.join(STORE_DIR, s))).filter(f => f.endsWith('.json') && !f.startsWith('.')).length; return n; }
/** 전체 스냅숏을 만든다 (serial 안에서 부른다). 자료가 없으면 만들지 않는다 */
async function makeBackup(reason) {
  if (!(await countRecords())) return null;
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  let name = `${stamp(clock())}-${reason}.dlbak.gz`; for (let i = 2; await exists(path.join(BACKUP_DIR, name)); i++) name = `${stamp(clock())}-${reason}-${i}.dlbak.gz`;
  const file = path.join(BACKUP_DIR, name), tmp = path.join(BACKUP_DIR, '.tmp-' + name);
  const gz = zlib.createGzip({ level: 6 }); const ws = fs.createWriteStream(tmp);
  const done = new Promise((res, rej) => { ws.on('finish', res); ws.on('error', rej); gz.on('error', rej); });
  gz.pipe(ws);
  const write = s => new Promise(r => { if (gz.write(s)) r(); else gz.once('drain', r); });
  let records = 0; const seenBins = new Set(); const recs = [];
  for (const s of await storeNames()) for (const f of await fsp.readdir(path.join(STORE_DIR, s))) if (f.endsWith('.json') && !f.startsWith('.')) recs.push(path.join(STORE_DIR, s, f));
  await write(JSON.stringify({ t: 'head', app: 'dreamland-backup', v: 1, at: clock(), reason, records: recs.length }) + '\n');
  for (const f of recs) {
    const rec = await readRec(f); if (!rec) continue;
    const refs = []; JSON.parse(rec.raw, (k, v) => { if (isBinRef(v)) refs.push(v.$dlbin); return v; });
    for (const sha of refs) if (!seenBins.has(sha)) { seenBins.add(sha); await write(JSON.stringify({ t: 'bin', sha, b64: (await readBin(sha)).toString('base64') }) + '\n'); }
    await write('{"t":"rec","meta":' + JSON.stringify(rec.meta) + ',"value":' + rec.raw + '}\n'); records++;
  }
  await write(JSON.stringify({ t: 'end', records }) + '\n');
  gz.end(); await done; await fsyncFile(tmp); await renameRetry(tmp, file);
  await pruneBackups();
  return { name, records };
}
async function readBackup(name, onLine) {
  if (!parseBk(name)) throw new Error('백업 이름이 올바르지 않습니다');
  const rl = require('readline').createInterface({ input: fs.createReadStream(path.join(BACKUP_DIR, name)).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let head = null, end = null;
  for await (const line of rl) { if (!line) continue; const o = JSON.parse(line); if (o.t === 'head') head = o; else if (o.t === 'end') end = o; else await onLine(o); }
  if (!head || head.app !== 'dreamland-backup' || !end) throw new Error('백업 파일이 온전하지 않습니다');
  return { head, end };
}
/** 복원: 고른 백업으로 되돌린다. 바로 전에 지금 상태를 백업하고, 백업에 없는 레코드는 _trash 로 옮긴다 */
async function restoreBackup(name) {
  // 먼저 끝까지 읽어 온전한지 확인한다 (깨진 백업으로 지금 자료를 덮지 않게)
  let n = 0; await readBackup(name, async o => { if (o.t === 'rec') n++; });
  const pre = await makeBackup('pre-restore');
  const keepKeys = new Set(); let written = 0;
  await readBackup(name, async o => {
    if (o.t === 'bin') { const p = binPath(o.sha); if (!(await exists(p))) await atomicWrite(p, Buffer.from(o.b64, 'base64')); return; }
    if (o.t !== 'rec' || !storeOk(o.meta.store) || !idOk(o.meta.id)) return;
    const file = recPath(o.meta.store, o.meta.id); keepKeys.add(file.toLowerCase());
    const cur = await readMeta(file); if (cur && cur.hash === o.meta.hash) return;
    await atomicWrite(file, JSON.stringify({ ...o.meta, at: clock(), restoredFrom: name }) + '\n' + JSON.stringify(o.value)); written++;
  });
  let trashed = 0;
  for (const m of await listMetas()) if (!keepKeys.has(recPath(m.store, m.id).toLowerCase())) { await moveAside('_trash', m.store, m.id, '복원: ' + name); trashed++; }
  lastWrite = clock();
  return { records: n, written, trashed, pre: pre?.name || '' };
}
let lastDaily = '', lastBig = 0;
async function dailyCheck() {   // 오늘 백업이 없으면 하나 만든다 (serial 안에서)
  const today = dayKey(clock()); if (lastDaily === today) return null;
  const has = (await listBackups()).some(b => dayKey(b.at) === today);
  if (has) { lastDaily = today; await pruneBackups(); return null; }
  const r = await makeBackup('daily'); if (r) lastDaily = today;   // 자료가 아직 없으면 다음 저장 때 다시 본다
  return r;
}
async function bigBackup(reason) { if (clock() - lastBig < 120000) return null; lastBig = clock(); return makeBackup(reason); }   // 큰 작업 직전 (2분에 한 번까지)
async function dirSize(dir) { let n = 0; for (const d of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) { const p = path.join(dir, d.name); n += d.isDirectory() ? await dirSize(p) : (await fsp.stat(p).catch(() => ({ size: 0 }))).size; } return n; }
async function cleanTmp(dir) { for (const d of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) { const p = path.join(dir, d.name); if (d.isDirectory()) await cleanTmp(p); else if (d.name.startsWith('.tmp-')) await fsp.unlink(p).catch(() => { }); } }

async function storeOps(body) {
  const ops = Array.isArray(body.ops) ? body.ops : []; const dev = String(body.dev || '').slice(0, 64);
  return serial(async () => {
    await dailyCheck().catch(e => console.error('하루 백업 실패', e));
    if (ops.filter(o => o && o.op === 'del').length >= 20) await bigBackup('pre-delete').catch(e => console.error('백업 실패', e));
    const results = [];
    for (const o of ops) {
      try {
        if (!o || !storeOk(o.store) || !idOk(o.id)) { results.push({ ok: false, error: '잘못된 레코드' }); continue; }
        results.push(o.op === 'del' ? await delRec(o.store, o.id, { dev, base: o.base }) : await putRec(o.store, o.id, o.value, { dev, base: o.base, keep: o.keep === true }));
      } catch (e) { results.push({ ok: false, error: e.message }); }
    }
    return { results };
  });
}

async function storeApi(req, res, url) {
  const p = url.pathname.slice('/api/store/'.length);
  if (req.method === 'GET') {
    if (p === 'status') {
      const backups = await listBackups();
      return send(res, 200, { on: true, dir: STORE_DIR, backupDir: BACKUP_DIR, records: await countRecords(), bytes: await dirSize(STORE_DIR), lastWrite, scrubbed, backups: { count: backups.length, bytes: backups.reduce((n, b) => n + b.size, 0), last: backups[0]?.at || 0 }, now: clock() });
    }
    if (p === 'list') { const s = url.searchParams.get('store'); return send(res, 200, await listMetas(s && storeOk(s) ? s : '')); }
    if (p === 'dump') {   // 한꺼번에 받기: 줄 단위 JSON 으로 흘려 보낸다
      const only = url.searchParams.get('store');
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS });
      for (const s of await storeNames()) {
        if (only && s !== only) continue;
        for (const f of await fsp.readdir(path.join(STORE_DIR, s))) {
          if (!f.endsWith('.json') || f.startsWith('.')) continue;
          const rec = await readRec(path.join(STORE_DIR, s, f)).catch(() => null); if (!rec) continue;
          const line = JSON.stringify({ store: s, id: rec.meta.id, hash: rec.meta.hash, at: rec.meta.at, value: await resolveBins(JSON.parse(rec.raw), readBin) }) + '\n';
          if (!res.write(line)) await new Promise(r => res.once('drain', r));
        }
      }
      return res.end();
    }
    if (p === 'backups') return send(res, 200, await listBackups());
    if (p === 'backup-file') {
      const name = url.searchParams.get('name') || ''; if (!parseBk(name) || !(await exists(path.join(BACKUP_DIR, name)))) return send(res, 404, { error: 'not found' });
      const st = await fsp.stat(path.join(BACKUP_DIR, name));
      res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': st.size, 'Content-Disposition': `attachment; filename="dreamland-${name}"`, 'Cache-Control': 'no-store', ...SEC_HEADERS });
      return fs.createReadStream(path.join(BACKUP_DIR, name)).pipe(res);
    }
    return send(res, 404, { error: 'unknown api' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  // 창을 닫을 때의 sendBeacon 은 머리글을 달 수 없다: 같은 출처(Origin)일 때만 받는다
  if (p === 'beacon') { if (req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'forbidden' }); }
  else if (req.headers['x-dreamland'] !== '1') return send(res, 403, { error: 'forbidden' });
  const body = await readBody(req, 512 * 1024 * 1024);
  if (p === 'put' || p === 'beacon') return send(res, 200, await storeOps(body));
  if (p === 'get') {
    const out = []; for (const k of Array.isArray(body.keys) ? body.keys : []) if (k && storeOk(k.store) && idOk(k.id)) out.push(await getRec(k.store, k.id));
    return send(res, 200, out);
  }
  if (p === 'conflict') {   // 브라우저 쪽에서 밀려난 판을 남겨 둔다
    if (!storeOk(body.store) || !idOk(body.id)) return send(res, 400, { error: '잘못된 레코드' });
    await serial(async () => { const str = scrubSecrets(JSON.stringify(body.value ?? null)); const bins = new Map(); const packed = await extractBins(JSON.parse(str), bins); await writeBins(bins);
      await atomicWrite(path.join(STORE_DIR, '_conflicts', body.store, clock() + '-' + Math.random().toString(36).slice(2, 6) + '-' + fileOf(body.id)), JSON.stringify({ v: 1, store: body.store, id: body.id, hash: dlHash(str), at: clock(), dev: String(body.dev || ''), note: String(body.note || '').slice(0, 200) }) + '\n' + JSON.stringify(packed)); });
    return send(res, 200, { ok: true });
  }
  if (p === 'backup') { const r = await serial(() => body.reason && body.reason !== 'manual' ? bigBackup(String(body.reason).replace(/[^a-z-]/g, '').slice(0, 20) || 'manual') : makeBackup('manual')); return send(res, 200, { ok: true, backup: r }); }
  if (p === 'restore') { try { return send(res, 200, { ok: true, ...(await serial(() => restoreBackup(String(body.name || '')))) }); } catch (e) { return send(res, 400, { error: e.message }); } }
  return send(res, 404, { error: 'unknown api' });
}
Object.assign(Store, { dlHash, planPrune, makeBackup, restoreBackup, listBackups, pruneBackups, fileOf, setClockShift: n => { clockShift = n; lastDaily = ''; }, serial, storeOps, STORE_DIR, BACKUP_DIR });

const UNSAFE_KEY = /^(__proto__|constructor|prototype)$/;
async function api(req, res, url) {
  // 다른 웹사이트가 이 로컬 서버를 호출하지 못하게 한다
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'forbidden origin' });
  // 폴더 읽기는 서버를 실행한 PC 에서 접속했을 때만 허용한다
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (!local && /^\/api\/(fs|detect|resolve)/.test(url.pathname)) return send(res, 403, { error: '이 기능은 서버를 실행한 PC 에서만 쓸 수 있습니다' });
  if (url.pathname.startsWith('/api/store/')) return storeApi(req, res, url);
  if (req.method === 'POST' && req.headers['x-dreamland'] !== '1') return send(res, 403, { error: 'forbidden' });

  if (url.pathname === '/api/ping') return send(res, 200, { ok: true, bridge: true, secrets: true, store: true });
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
    const inData = (() => { const r = path.relative(DATA_DIR, file); return !r.startsWith('..') && !path.isAbsolute(r); })();
    if (!file.startsWith(ROOT + path.sep) || inData || path.basename(file).toLowerCase() === 'server.js' || /^data([\\/]|$)/i.test(path.relative(ROOT, file)) || /(^|[\\/])\./.test(path.relative(ROOT, file)) || /\.(bat|cmd|sh|md)$/i.test(file)) return send(res, 403, 'forbidden', 'text/plain');
    if (!(await exists(file)) || (await isDir(file))) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, await fsp.readFile(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: e.message });
    else res.end();
  }
});

module.exports = { Store, server };
if (require.main !== module) return;
cleanTmp(STORE_DIR).then(() => cleanTmp(BACKUP_DIR)).then(() => serial(dailyCheck)).catch(e => console.error('자료 폴더 확인 실패', e));
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
