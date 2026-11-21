// DreamLand Vertex 중계 — Cloudflare Workers 판 (무료, 카드 등록 없이)
//
// 하는 일은 하나뿐이다: 받은 요청을 그대로 Vertex AI(aiplatform.googleapis.com)로 넘기고, 답을 그대로(스트리밍 포함) 돌려준다.
// 워커를 미국 쪽에 두면(설정 › 런타임 › 배치 › 지역) Vertex 는 요청이 내 IP 가 아니라 그 지역의 서버에서 온 것으로 본다.
// 인증(서비스 계정 토큰 · API 키)은 DreamLand 가 붙여 보낸 것을 그대로 전달한다. 이 워커에는 구글 키를 넣지 않는다.
//
// 주소 모양:  https://<워커 이름>.<계정>.workers.dev/<RELAY_KEY>/v1/projects/…
// DreamLand 에서는 Vertex 연결의 "주소" 칸에  https://<워커 이름>.<계정>.workers.dev/<RELAY_KEY>  만 적으면 된다.
//
// 변수(설정 › 변수 및 비밀 — "비밀"로)
//   RELAY_KEY  (필수) 남이 내 워커를 쓰지 못하게 하는 암호. 주소에 들어간다. 길고 추측하기 어렵게.

const PASS = ['authorization', 'x-goog-api-key', 'x-goog-user-project', 'content-type', 'accept'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
async function same(a, b) {   // 걸린 시간으로 암호를 짐작하지 못하게 해시끼리 비교
  const enc = new TextEncoder(), [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y); let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]; return d === 0;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean), KEY = String(env.RELAY_KEY || '').trim();
    if (parts[0] === 'health') return json(200, { ok: true, key: !!KEY, colo: request.cf?.colo || '', country: request.cf?.country || '' });
    if (!KEY) return json(500, { error: 'RELAY_KEY is not set on this worker.' });
    if (!parts.length || !(await same(parts[0], KEY))) return json(403, { error: 'forbidden' });
    const rest = '/' + parts.slice(1).join('/');
    // Vertex 의 길만 넘긴다 (아무 주소로나 보내 주는 열린 중계가 되지 않게)
    if (!/^\/v1(beta1)?\/(projects|publishers)\//.test(rest)) return json(404, { error: 'Only Vertex AI paths (/v1/projects/… or /v1/publishers/…) are relayed.' });
    const loc = (rest.match(/\/locations\/([a-z0-9-]+)\//) || [])[1] || 'global';
    const host = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;
    const headers = new Headers(); for (const k of PASS) { const v = request.headers.get(k); if (v) headers.set(k, v); }
    let up;
    try { up = await fetch(host + rest + url.search, { method: request.method, headers, body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body }); }
    catch (e) { return json(502, { error: 'relay could not reach Vertex AI: ' + (e && e.message || e) }); }
    const out = new Headers(CORS); out.set('Content-Type', up.headers.get('content-type') || 'application/octet-stream'); out.set('Cache-Control', 'no-store');
    return new Response(up.body, { status: up.status, headers: out });
  },
};
