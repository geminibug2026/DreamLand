// 내 PC 중계 — 클라우드(Vercel · Cloudflare) 없이 내 컴퓨터(또는 Termux)에서 도는 OpenAI 호환 중계
//
// 실리태번 · 마리나라 · 드림랜드에서 "Custom (OpenAI 호환)" 으로 붙인다:
//   주소   http://127.0.0.1:4190/v1        API 키   설정의 RELAY_KEY (기본 local-relay)
//
// 하는 일은 Vercel 중계의 OpenAI 호환 길과 같다 (같은 코드를 쓴다):
//   다른 프로젝트 키로 넘기기 → AI Studio 키로 넘기기 → 다 막히면 버티며 다시 보내기 → 대신 쓸 모델
// 내 PC 에서 계속 떠 있어서 더 잘하는 것:
//   · 하루 한도가 찬 키를 기억해 한 시간 동안 건너뛴다 (클라우드 함수는 요청마다 새로 떠서 잊는다)
//   · 버티는 시간에 제한이 없다 (클라우드는 함수 실행 시간 제한이 있다)
//   · VPN · 프록시 프로그램을 거쳐 보낼 수 있다 (VIA) — 요청이 나가는 나라를 바꿀 때
//
// 키 넣는 곳 (이 폴더의 keys/ — 깃에 올라가지 않는다)
//   keys/*.json         서비스 계정 JSON 파일을 그대로 넣는다 (여러 개면 서로 다른 프로젝트의 것으로)
//   keys/ai-studio.txt  AI Studio(Gemini API) 키, 한 줄에 하나
//   keys/express.txt    Vertex 익스프레스 키, 한 줄에 하나
// 설정 (이 폴더의 settings.txt, 이름=값 한 줄씩 · settings.example.txt 참고)
//   RELAY_KEY  PORT  LAN  WAIT_SEC  FALLBACK_MODEL  VIA  MODELS  VERTEX_LOCATION
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

// Node 18 은 웹 crypto 가 전역에 없다 (구글 서명 · 요청 번호에 쓴다)
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** settings.txt · keys/ 를 읽어 중계 코드가 보는 환경 변수로 옮긴다. 다시 부르면 새로 읽는다 (키를 바꾸고 껐다 켜지 않아도 되게) */
export function loadKeys(dir = HERE) {
  for (const k of Object.keys(process.env)) if (/^(API_|STUDIO_)/.test(k) && process.env.__LOCAL_KEYS?.split(',').includes(k)) delete process.env[k];
  const set = [], put = (k, v) => { process.env[k] = v; set.push(k); };
  const conf = path.join(dir, 'settings.txt');
  if (fs.existsSync(conf)) for (const line of fs.readFileSync(conf, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line); if (!m || line.trim().startsWith('#')) continue;
    if (!(m[1] in process.env) || process.env.__LOCAL_CONF?.split(',').includes(m[1])) { process.env[m[1]] = m[2]; process.env.__LOCAL_CONF = [...new Set([...(process.env.__LOCAL_CONF || '').split(',').filter(Boolean), m[1]])].join(','); }
  }
  const kd = path.join(dir, 'keys'); let sa = 0, st = 0, ex = 0;
  if (fs.existsSync(kd)) for (const f of fs.readdirSync(kd).sort()) {
    const full = path.join(kd, f), text = fs.statSync(full).isFile() ? fs.readFileSync(full, 'utf8') : '';
    if (/\.json$/i.test(f)) { const v = text.trim(); if (v.startsWith('{')) put('API_LOCAL_' + (++sa), v); }
    else if (/^(ai-?studio|studio|gemini)[^/]*\.txt$/i.test(f)) for (const k of lines(text)) put('STUDIO_LOCAL_' + (++st), k);
    else if (/^(express|vertex)[^/]*\.txt$/i.test(f)) for (const k of lines(text)) put('API_LOCAL_X' + (++ex), k);
  }
  process.env.__LOCAL_KEYS = set.join(',');
  return { sa, studio: st, express: ex };
}
const lines = t => t.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));

// ── VPN · 프록시 프로그램을 거쳐 보내기 (VIA = http://127.0.0.1:7890 · socks5://127.0.0.1:10808) ──
/** 구글로 가는 요청만 프록시를 거친다. 돌려주는 것은 보통 fetch 와 같은 Response */
function viaFetch(via, input, init = {}) {
  const target = new URL(typeof input === 'string' ? input : input.url);
  return new Promise((resolve, reject) => {
    let px; try { px = new URL(via); } catch { return reject(new Error('VIA 주소가 올바르지 않아요: ' + via)); }
    const socks = /^socks5h?:$/.test(px.protocol); if (!socks && px.protocol !== 'http:') return reject(new Error('VIA 는 http:// 또는 socks5:// 로 시작해야 해요'));
    const secure = target.protocol === 'https:', host = target.hostname, port = Number(target.port) || (secure ? 443 : 80);
    const sock = net.connect(Number(px.port) || (socks ? 1080 : 8080), px.hostname);
    let done = false; const fail = e => { if (done) return; done = true; sock.destroy(); reject(e); };
    const tm = setTimeout(() => fail(new Error('프록시가 응답하지 않아요 (' + via + ')')), 15000);
    sock.once('error', e => fail(new Error('프록시 연결 실패: ' + e.message + ' — VPN · 프록시 프로그램이 켜져 있는지 확인하세요')));
    const go = () => {
      clearTimeout(tm); sock.removeAllListeners('data');
      const conn = secure ? tls.connect({ socket: sock, servername: host, ALPNProtocols: ['http/1.1'] }) : sock;
      const h = {}; for (const [k, v] of Object.entries(init.headers || {})) if (!/^(host|content-length|connection)$/i.test(k)) h[k] = v;
      const body = init.body == null ? undefined : String(init.body); if (body != null) h['Content-Length'] = Buffer.byteLength(body);
      const req = (secure ? https : http).request({ host, port, path: target.pathname + target.search, method: init.method || 'GET', headers: h, agent: false, createConnection: () => conn }, res => {
        done = true; const head = new Headers(); for (const [k, v] of Object.entries(res.headers)) if (v != null) head.set(k, Array.isArray(v) ? v.join(', ') : String(v));
        resolve(new Response(res.statusCode === 204 ? null : Readable.toWeb(res), { status: res.statusCode || 502, headers: head }));
      });
      req.once('error', e => fail(new Error('프록시를 거친 연결 실패: ' + e.message)));
      req.end(body);
    };
    sock.once('connect', () => {
      if (!socks) {
        const auth = px.username ? `Proxy-Authorization: Basic ${Buffer.from(decodeURIComponent(px.username) + ':' + decodeURIComponent(px.password)).toString('base64')}\r\n` : '';
        sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
        let buf = ''; sock.on('data', d => { buf += d.toString('latin1'); if (!buf.includes('\r\n\r\n')) return; const code = Number((buf.match(/^HTTP\/1\.\d (\d{3})/) || [])[1]); if (code === 200) go(); else fail(new Error('프록시가 연결을 거절했어요 (' + (code || '?') + ')')); });
        return;
      }
      let step = 0, buf = Buffer.alloc(0);   // SOCKS5: 인증 없음, 이름 풀이도 프록시가
      sock.write(Buffer.from([5, 1, 0]));
      sock.on('data', d => {
        buf = Buffer.concat([buf, d]);
        if (step === 0 && buf.length >= 2) { if (buf[0] !== 5 || buf[1] !== 0) return fail(new Error('SOCKS5 프록시가 인증을 요구해요 (지원하지 않음)')); buf = buf.subarray(2); step = 1; const name = Buffer.from(host); sock.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([port >> 8, port & 255])])); }
        if (step === 1 && buf.length >= 5) { if (buf[1] !== 0) return fail(new Error('SOCKS5 프록시가 연결을 거절했어요 (' + buf[1] + ')')); const need = 4 + (buf[3] === 1 ? 4 : buf[3] === 4 ? 16 : 1 + buf[4]) + 2; if (buf.length >= need) { step = 2; go(); } }
      });
    });
  });
}

/** 중계를 띄운다. 돌려주는 것은 node 의 http.Server */
export async function start({ dir = HERE, log = console.log } = {}) {
  const got = loadKeys(dir);
  process.env.RELAY_HOPS = '0';   // 지역 함수가 따로 없다 — 다른 지역으로 넘기지 않는다
  const lan = /^(1|true|yes|on)$/i.test(process.env.LAN || ''), port = Number(process.env.PORT) || 4190;
  if (!process.env.RELAY_KEY) { if (lan) throw new Error('LAN=1 이면 settings.txt 에 RELAY_KEY 를 꼭 정해 주세요 (같은 와이파이의 다른 기기가 쓸 수 있게 되므로)'); process.env.RELAY_KEY = 'local-relay'; }
  const via = String(process.env.VIA || '').trim(), base = globalThis.fetch;
  if (via) globalThis.fetch = (input, init) => /^https:\/\/[^/]*googleapis\.com\//.test(typeof input === 'string' ? input : input?.url || '') ? viaFetch(via, input, init) : base(input, init);
  const { relay } = await import('../vercel/lib/relay.js');
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/reload-keys' && req.method === 'POST' && req.headers.authorization === 'Bearer ' + process.env.RELAY_KEY) { const k = loadKeys(dir); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(k)); }
      const chunks = []; if (req.method !== 'GET' && req.method !== 'HEAD') for await (const c of req) chunks.push(c);
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v != null && !/^(host|connection|content-length|transfer-encoding)$/i.test(k)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      const out = await relay(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), 'local');
      const head = {}; out.headers.forEach((v, k) => { head[k] = v; });
      res.writeHead(out.status, head);
      if (!out.body) return res.end();
      const rd = out.body.getReader(); req.on('close', () => { rd.cancel().catch(() => { }); });
      for (; ;) { const { value, done } = await rd.read(); if (done) break; res.write(value); }
      res.end();
    } catch (e) { try { res.writeHead(500, { 'Content-Type': 'application/json' }); } catch { /* 이미 보냄 */ } res.end(JSON.stringify({ error: { message: '내 PC 중계 오류: ' + (e && e.message || e) } })); }
  });
  await new Promise((ok, no) => { server.once('error', no); server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', ok); });
  log(`\n  드림랜드 내 PC 중계가 켜졌어요 (OpenAI 호환)\n`);
  log(`  주소      http://127.0.0.1:${port}/v1${lan ? '   (같은 와이파이의 다른 기기는 이 PC 의 IP 로)' : ''}`);
  log(`  API 키    ${process.env.RELAY_KEY}`);
  log(`  구글 키   서비스 계정 ${got.sa}개 · 익스프레스 ${got.express}개 · AI Studio ${got.studio}개${got.sa + got.express + got.studio ? '' : '  ← keys 폴더에 키를 넣어 주세요 (README 참고)'}`);
  log(`  버티기    ${Math.max(0, Math.min(240, Number(process.env.WAIT_SEC ?? 60) || 0))}초${process.env.FALLBACK_MODEL ? ' · 대신 쓸 모델 ' + process.env.FALLBACK_MODEL : ''}${via ? ' · 프록시 ' + via : ''}`);
  log(`  끄려면 이 창을 닫거나 Ctrl + C\n`);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start().catch(e => { console.error('\n  중계를 켜지 못했어요: ' + (e && e.message || e) + (e?.code === 'EADDRINUSE' ? ' — 이미 켜져 있거나 다른 프로그램이 그 포트를 써요. settings.txt 에 PORT=4191 처럼 바꿔 보세요' : '') + '\n'); process.exit(1); });
