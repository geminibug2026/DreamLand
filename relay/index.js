// DreamLand Vertex 중계 함수 (Google Cloud Run functions · Node.js)
//
// 하는 일은 하나뿐이다: 받은 요청을 그대로 Vertex AI(aiplatform.googleapis.com)로 넘기고, 답을 그대로 돌려준다.
// 이 함수를 미국 리전에 올려 두면 Vertex 는 요청이 "구글 미국 서버"에서 온 것으로 본다 — 내 컴퓨터의 IP 가 아니라.
// 인증(서비스 계정 토큰 · API 키)은 DreamLand 가 붙여 보낸 것을 그대로 전달하므로, 이 함수에는 키를 넣지 않는다.
//
// 주소 모양:  https://<함수 주소>/<RELAY_KEY>/v1/projects/…/locations/…/publishers/…
// DreamLand 에서는 Vertex 연결의 "주소" 칸에  https://<함수 주소>/<RELAY_KEY>  만 적으면 된다.
//
// 환경 변수
//   RELAY_KEY  (필수) 남이 내 함수를 쓰지 못하게 하는 암호. 주소에 들어간다. 길고 추측하기 어렵게.
const crypto = require('crypto');

const KEY = (process.env.RELAY_KEY || '').trim();
const UPSTREAM = (process.env.UPSTREAM || '').trim().replace(/\/+$/, '');   // 시험용. 비워 두면 Vertex 로 보낸다
const PASS = ['authorization', 'x-goog-api-key', 'x-goog-user-project', 'content-type', 'accept'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const same = (a, b) => { const x = crypto.createHash('sha256').update(a).digest(), y = crypto.createHash('sha256').update(b).digest(); return crypto.timingSafeEqual(x, y); };

exports.relay = async (req, res) => {
  res.set(CORS);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const url = new URL(req.originalUrl || req.url, 'http://x'), parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'health') return res.status(200).json({ ok: true, key: !!KEY });
  if (!KEY) return res.status(500).json({ error: 'RELAY_KEY is not set on this function.' });
  if (!parts.length || !same(parts[0], KEY)) return res.status(403).json({ error: 'forbidden' });
  const rest = '/' + parts.slice(1).join('/');
  // Vertex 의 길만 넘긴다 (아무 주소로나 보내 주는 열린 중계가 되지 않게)
  if (!/^\/v1(beta1)?\/(projects|publishers)\//.test(rest)) return res.status(404).json({ error: 'Only Vertex AI paths (/v1/projects/… or /v1/publishers/…) are relayed.' });
  const loc = (rest.match(/\/locations\/([a-z0-9-]+)\//) || [])[1] || 'global';
  const host = UPSTREAM || (loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`);
  const headers = {}; for (const k of PASS) if (req.headers[k]) headers[k] = req.headers[k];
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : (req.rawBody && req.rawBody.length ? req.rawBody : req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? JSON.stringify(req.body) : req.body);
  const ac = new AbortController(); res.on('close', () => ac.abort());
  let up;
  try { up = await fetch(host + rest + url.search, { method: req.method, headers, body, signal: ac.signal }); }
  catch (e) { return res.status(502).json({ error: 'relay could not reach Vertex AI: ' + (e.cause?.message || e.message) }); }
  res.status(up.status);
  res.set('Content-Type', up.headers.get('content-type') || 'application/octet-stream');
  res.set('Cache-Control', 'no-store'); res.set('X-Accel-Buffering', 'no');
  if (!up.body) return res.end();
  // 답이 흘러오는 대로 흘려보낸다 (스트리밍)
  try { for await (const chunk of up.body) { res.write(chunk); if (typeof res.flush === 'function') res.flush(); } } catch { /* 듣던 쪽이 끊었다 */ }
  res.end();
};
