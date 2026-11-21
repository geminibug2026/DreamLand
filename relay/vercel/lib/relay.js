// DreamLand Vertex 중계 — Vercel 판의 몸통. 지역마다 api/<지역>.js 가 이 함수를 그대로 내보낸다 (지역은 그 파일의 config 가 정한다).
// 받은 요청을 그대로 Vertex AI 로 넘기고 답을 그대로(스트리밍 포함) 돌려준다. 구글 키는 여기에 두지 않는다 — DreamLand 가 붙여 보낸 것을 전달만 한다.
//
// 주소 모양:  https://<프로젝트>.vercel.app/<지역>/<RELAY_KEY>/v1/projects/…   (지역을 빼면 iad1)
// 환경 변수:  RELAY_KEY  (필수) 남이 내 중계를 쓰지 못하게 하는 암호
import { openai } from './openai.js';

const PASS = ['authorization', 'x-goog-api-key', 'x-goog-user-project', 'content-type', 'accept'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
async function same(a, b) {
  const enc = new TextEncoder(), [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y); let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]; return d === 0;
}

export async function relay(request, region) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url), given = url.searchParams.get('path');   // vercel.json 이 원래 길을 ?path= 로 넘긴다
  const parts = (given != null ? given : url.pathname).split('/').filter(Boolean), KEY = String(process.env.RELAY_KEY || '').trim();
  // OpenAI 호환 길: /v1/… (암호는 API 키 칸) 또는 /<암호>/v1/… — Vertex 길(/v1/projects · /v1/publishers)과는 뒤의 낱말로 가린다
  const oa = i => parts[i] === 'v1' && (parts[i + 1] === 'models' || (parts[i + 1] === 'chat' && parts[i + 2] === 'completions'));
  if (oa(0)) return openai(request, region, parts, url, false);
  if (KEY && parts.length > 1 && oa(1) && (await same(parts[0], KEY))) return openai(request, region, parts.slice(1), url, true);
  if (parts[0] === 'health') return json(200, { ok: true, key: !!KEY, colo: region, country: '' });
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
