// DreamLand Vertex 중계 — Vercel 판 (무료, 카드 등록 없이). Cloudflare 판(../cloudflare-worker.js)과 하는 일이 같다.
// 받은 요청을 그대로 Vertex AI 로 넘기고 답을 그대로(스트리밍 포함) 돌려준다. 구글 키는 여기에 두지 않는다 — DreamLand 가 붙여 보낸 것을 전달만 한다.
// 이 함수는 미국 동부(iad1)에서 돈다 (vercel.json). Vertex 는 요청이 내 IP 가 아니라 그곳에서 온 것으로 본다.
//
// 주소 모양:  https://<프로젝트>.vercel.app/<RELAY_KEY>/v1/projects/…   (vercel.json 이 모든 길을 이 함수로 보낸다)
// 환경 변수:  RELAY_KEY  (필수) 남이 내 중계를 쓰지 못하게 하는 암호
export const config = { runtime: 'edge', regions: ['iad1'] };

const PASS = ['authorization', 'x-goog-api-key', 'x-goog-user-project', 'content-type', 'accept'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
async function same(a, b) {
  const enc = new TextEncoder(), [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y); let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]; return d === 0;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url), given = url.searchParams.get('path');   // vercel.json 이 원래 길을 ?path= 로 넘긴다
  const parts = (given != null ? given : url.pathname).split('/').filter(Boolean), KEY = String(process.env.RELAY_KEY || '').trim();
  if (parts[0] === 'api') parts.shift();   // /api/relay 로 직접 부른 경우
  if (parts[0] === 'relay') parts.shift();
  if (parts[0] === 'health') return json(200, { ok: true, key: !!KEY, colo: process.env.VERCEL_REGION || 'iad1', country: 'US' });
  if (!KEY) return json(500, { error: 'RELAY_KEY is not set on this project.' });
  if (!parts.length || !(await same(parts[0], KEY))) return json(403, { error: 'forbidden' });
  const rest = '/' + parts.slice(1).join('/'), q = new URLSearchParams(url.search); q.delete('path');
  if (!/^\/v1(beta1)?\/(projects|publishers)\//.test(rest)) return json(404, { error: 'Only Vertex AI paths (/v1/projects/… or /v1/publishers/…) are relayed.' });
  const loc = (rest.match(/\/locations\/([a-z0-9-]+)\//) || [])[1] || 'global';
  const host = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;
  const headers = new Headers(); for (const k of PASS) { const v = request.headers.get(k); if (v) headers.set(k, v); }
  let up;
  try { up = await fetch(host + rest + (q.toString() ? '?' + q : ''), { method: request.method, headers, body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body, duplex: 'half' }); }
  catch (e) { return json(502, { error: 'relay could not reach Vertex AI: ' + (e && e.message || e) }); }
  const out = new Headers(CORS); out.set('Content-Type', up.headers.get('content-type') || 'application/octet-stream'); out.set('Cache-Control', 'no-store');
  return new Response(up.body, { status: up.status, headers: out });
}
