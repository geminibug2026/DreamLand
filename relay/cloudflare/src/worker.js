// DreamLand 중계 — Cloudflare 판 (무료 · 카드 없이 · 워커 하나로 여러 지역)
//
// 버텍스 429 는 요청이 어느 지역에서 들어오느냐를 탈 때가 있다. 보통 워커는 내게 가까운 곳(한국)에서 돌지만,
// 여기서는 지역을 정해 띄운 Durable Object(작은 일꾼)가 그 지역에서 구글로 보낸다. 한 지역이 429 면 다음 지역의 일꾼으로 넘긴다.
//   미국 동부 → 미국 서부 → 서유럽 → 동유럽 → 남미 → 오세아니아 → 아시아 (HOP_REGIONS 로 바꿀 수 있다)
//
// 두 가지 길
//   1. OpenAI 호환 (실리태번 · 마리나라 · 드림랜드의 Custom 연결):  https://<워커>.workers.dev/v1   API 키 = RELAY_KEY
//      구글 키는 워커에 둔다 — API_1 … (서비스 계정 JSON) · STUDIO_1 … (AI Studio 키). 키 돌려쓰기 · 버티기 · 대신 쓸 모델은 Vercel 판과 같다
//   2. Vertex 그대로 넘기기 (드림랜드의 Vertex 연결 주소 칸):  https://<워커>.workers.dev/<지역>/<RELAY_KEY>
//      지역: enam · wnam · weur · eeur · sam · oc · apac. 여러 지역 주소를 빈칸으로 나눠 적으면 드림랜드가 429 때 다음 주소로 넘긴다
//
// 변수(설정 › 변수 및 비밀): RELAY_KEY(필수) · API_1 … · STUDIO_1 … · WAIT_SEC · FALLBACK_MODEL · MODELS · VERTEX_LOCATION · HOP_REGIONS
// src/openai.js 는 relay/vercel/lib/openai.js 와 같은 파일이다 (relay/check-copies.mjs 로 확인)
import { openai, hop, keyCount, studioCount, bad } from './openai.js';

const HINTS = ['enam', 'wnam', 'weur', 'eeur', 'sam', 'oc', 'apac', 'apac-ne', 'apac-se', 'afr', 'me'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const PASS = ['authorization', 'x-goog-api-key', 'x-goog-user-project', 'content-type', 'accept'];
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
async function same(a, b) {
  const enc = new TextEncoder(), [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y); let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]; return d === 0;
}
/** 워커의 변수를 중계 코드가 읽는 자리로 (환경 변수에 쓰지 않는다 — 쓸 수 없는 곳이 있다) */
function setEnv(env) {
  const out = {}; for (const [k, v] of Object.entries(env || {})) if (typeof v === 'string') out[k] = v;
  globalThis.__relayEnv = out;
}
const regionsOf = env => { const l = String(env.HOP_REGIONS || '').split(/[\s,]+/).filter(r => HINTS.includes(r)); return l.length ? l : ['enam', 'wnam', 'weur', 'eeur', 'sam', 'oc', 'apac']; };
/** 그 지역의 일꾼에게 넘긴다 (지역마다 이름이 하나 — 처음 만들 때 그 지역 근처에 자리 잡는다) */
const toRegion = (env, region, request) => env.HOP.get(env.HOP.idFromName('hop-' + region), { locationHint: region }).fetch(new Request(request, { headers: (h => { h.set('x-relay-at', region); return h; })(new Headers(request.headers)) }));

/** 이 지역에서 실제로 처리한다 (일꾼 안에서 돈다) */
async function serve(request, env, region) {
  setEnv(env);
  hop.regions = regionsOf(env);
  hop.send = (_url, next, init) => toRegion(env, next, new Request('https://hop/v1/chat/completions', init));
  const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean), KEY = String(env.RELAY_KEY || '').trim();
  const oa = i => parts[i] === 'v1' && (parts[i + 1] === 'models' || (parts[i + 1] === 'chat' && parts[i + 2] === 'completions'));
  if (oa(0)) return openai(request, region, parts, url, false);
  if (KEY && parts.length > 1 && oa(1) && (await same(parts[0], KEY))) return openai(request, region, parts.slice(1), url, true);
  if (!KEY) return json(500, { error: 'RELAY_KEY is not set on this worker.' });
  if (!parts.length || !(await same(parts[0], KEY))) return json(403, { error: 'forbidden' });
  const rest = '/' + parts.slice(1).join('/');
  if (!/^\/v1(beta1)?\/(projects|publishers)\//.test(rest)) return json(404, { error: 'Only Vertex AI paths (/v1/projects/… or /v1/publishers/…) are relayed.' });
  const loc = (rest.match(/\/locations\/([a-z0-9-]+)\//) || [])[1] || 'global';
  const host = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;
  const headers = new Headers(); for (const k of PASS) { const v = request.headers.get(k); if (v) headers.set(k, v); }
  let up;
  try { up = await fetch(host + rest + url.search, { method: request.method, headers, body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body }); }
  catch (e) { return json(502, { error: 'relay could not reach Vertex AI: ' + (e && e.message || e) }); }
  const out = new Headers(CORS); out.set('Content-Type', up.headers.get('content-type') || 'application/octet-stream'); out.set('Cache-Control', 'no-store'); out.set('X-Relay-Region', region);
  return new Response(up.body, { status: up.status, headers: out });
}

/** 지역마다 하나씩 뜨는 일꾼 */
export class Hop {
  constructor(state, env) { this.env = env; }
  async fetch(request) {
    const region = request.headers.get('x-relay-at') || 'enam';
    try { return await serve(request, this.env, region); }
    catch (e) { return json(500, { error: { message: '중계 안에서 오류가 났어요: ' + String(e && e.message || e) } }); }
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    setEnv(env);
    const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'health') return json(200, { ok: true, key: !!String(env.RELAY_KEY || '').trim(), colo: request.cf?.colo || '', country: request.cf?.country || '', regions: regionsOf(env), googleKeys: keyCount(), studioKeys: studioCount(), unreadable: bad.slice() });
    if (!env.HOP) return json(500, { error: 'Durable Object 연결(HOP)이 없어요. 배포 버튼으로 다시 만들거나 wrangler.toml 대로 배포해 주세요.' });
    // /<지역>/… 로 오면 그 지역에서, 아니면 첫 지역에서 시작한다 (워커가 뜬 곳 — 보통 내게 가까운 곳 — 에서 바로 구글로 보내지 않는다)
    if (HINTS.includes(parts[0])) { const rest = parts.slice(1).join('/'); return toRegion(env, parts[0], new Request(`${url.origin}/${rest}${url.search}`, request)); }
    return toRegion(env, regionsOf(env)[0], request);
  },
};
