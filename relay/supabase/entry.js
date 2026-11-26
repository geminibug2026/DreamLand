
// ════════ Supabase 입구 (이 위는 relay/vercel/lib/openai.js 와 같다 — relay/check-copies.mjs --fix 가 붙여 만든다) ════════
// DreamLand 중계 — Supabase Edge Function 판 (무료 · 카드 없이 · 함수 하나로 여러 지역)
// Supabase 는 요청마다 어느 지역에서 돌릴지 고를 수 있다 (x-region 머리말). 한 지역이 429 면 다음 지역에서 다시 돌린다.
//   주소 (실리태번 · 마리나라 · 드림랜드 Custom):  https://<프로젝트>.supabase.co/functions/v1/<함수 이름>/v1     API 키 = RELAY_KEY
//   비밀(Edge Function Secrets): RELAY_KEY(필수) · API_1 … · STUDIO_1 … · WAIT_SEC · FALLBACK_MODEL · MODELS · VERTEX_LOCATION · HOP_REGIONS
//   함수 설정에서 "Enforce JWT Verification"(JWT 확인)을 꺼야 한다 — 프로그램은 Supabase 토큰이 아니라 RELAY_KEY 를 보낸다
//   드림랜드 Vertex 연결(키를 드림랜드가 붙여 보냄):  https://<프로젝트>.supabase.co/functions/v1/<함수 이름>/<지역>/<RELAY_KEY>  — 지역마다 하나씩 적으면 429 때 다음 지역으로
const SB_REGIONS = ['us-east-1', 'us-west-2', 'us-west-1', 'ca-central-1', 'eu-west-2', 'eu-central-1', 'eu-west-1', 'eu-west-3', 'sa-east-1', 'ap-southeast-2', 'ap-south-1', 'ap-southeast-1', 'ap-northeast-1'];
const SB_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const sbJson = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...SB_CORS, 'Content-Type': 'application/json' } });
async function sbSame(a, b) {
  const e = new TextEncoder(), [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', e.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y); let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]; return d === 0;
}
Deno.serve(async req => {
  try { return await handle(req); }
  catch (e) { return sbJson(500, { error: { message: '중계 안에서 오류가 났어요: ' + String(e && e.message || e) } }); }
});
async function handle(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: SB_CORS });
  const E = globalThis.__relayEnv = Deno.env.toObject();   // Supabase 는 환경 변수에 쓸 수 없다 — 중계 코드가 이것을 읽는다
  const url = new URL(req.url); let parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'functions' && parts[1] === 'v1') parts = parts.slice(2);
  const fname = parts.shift() || 'relay', base = String(Deno.env.get('SUPABASE_URL') || url.origin).replace(/\/+$/, ''), self = `${base}/functions/v1/${fname}`;
  const regions = (l => l.length ? l : SB_REGIONS)(String(E.HOP_REGIONS || '').split(/[\s,]+/).filter(r => SB_REGIONS.includes(r) || /^[a-z]{2}-[a-z]+-\d$/.test(r)));
  const at = req.headers.get('x-relay-at') || '', here = at || Deno.env.get('SB_REGION') || 'edge';
  if (parts[0] === 'health') return sbJson(200, { ok: true, key: !!String(E.RELAY_KEY || '').trim(), region: Deno.env.get('SB_REGION') || '', regions, googleKeys: keyCount(), studioKeys: studioCount(), unreadable: bad.slice() });
  const toRegion = (region, path, init) => fetch(`${self}${path}${path.includes('?') ? '&' : '?'}forceFunctionRegion=${region}`, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers || {})), 'x-region': region, 'x-relay-at': region } });
  // 처음 받은 곳(보통 내게 가까운 서울 · 도쿄)에서 바로 구글로 보내지 않는다: 주소에 지역이 있으면 그 지역, 없으면 첫 지역에서 시작한다
  const isRegion = r => SB_REGIONS.includes(r) || /^[a-z]{2}-[a-z]+-\d$/.test(r);
  if (!at) {
    const pinned = isRegion(parts[0]) ? parts[0] : '', rest = '/' + (pinned ? parts.slice(1) : parts).join('/') + url.search;
    return toRegion(pinned || regions[0], rest, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer() }).then(r => new Response(r.body, { status: r.status, headers: r.headers }));
  }
  hop.regions = regions;
  hop.send = (_u, next, init) => toRegion(next, '/v1/chat/completions', init);
  const KEY = String(E.RELAY_KEY || '').trim();
  const oa = i => parts[i] === 'v1' && (parts[i + 1] === 'models' || (parts[i + 1] === 'chat' && parts[i + 2] === 'completions'));
  if (oa(0)) return openai(req, here, parts, url, false);
  if (KEY && parts.length > 1 && oa(1) && (await sbSame(parts[0], KEY))) return openai(req, here, parts.slice(1), url, true);
  // Vertex 그대로 넘기기 (드림랜드): /<RELAY_KEY>/v1/projects/… — 키는 드림랜드가 붙여 보낸 것을 그대로 전달한다
  if (!KEY) return sbJson(500, { error: 'RELAY_KEY is not set on this function.' });
  if (!parts.length || !(await sbSame(parts[0], KEY))) return sbJson(403, { error: 'forbidden' });
  const rest = '/' + parts.slice(1).join('/');
  if (!/^\/v1(beta1)?\/(projects|publishers)\//.test(rest)) return sbJson(404, { error: 'Use /v1/chat/completions (OpenAI-compatible) or a Vertex AI path.' });
  const loc = (rest.match(/\/locations\/([a-z0-9-]+)\//) || [])[1] || 'global', host = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;
  const headers = new Headers(); for (const k of ['authorization', 'x-goog-api-key', 'x-goog-user-project', 'content-type', 'accept']) { const v = req.headers.get(k); if (v) headers.set(k, v); }
  let up; try { up = await fetch(host + rest + url.search, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer() }); }
  catch (e) { return sbJson(502, { error: 'relay could not reach Vertex AI: ' + (e && e.message || e) }); }
  const out = new Headers(SB_CORS); out.set('Content-Type', up.headers.get('content-type') || 'application/octet-stream'); out.set('Cache-Control', 'no-store'); out.set('X-Relay-Region', here);
  return new Response(up.body, { status: up.status, headers: out });
}
