
// ════════ Supabase 입구 (이 위는 relay/vercel/lib/openai.js 와 같다 — relay/check-copies.mjs --fix 가 붙여 만든다) ════════
// DreamLand 중계 — Supabase Edge Function 판 (무료 · 카드 없이 · 함수 하나로 여러 지역)
// Supabase 는 요청마다 어느 지역에서 돌릴지 고를 수 있다 (x-region 머리말). 한 지역이 429 면 다음 지역에서 다시 돌린다.
//   주소 (실리태번 · 마리나라 · 드림랜드 Custom):  https://<프로젝트>.supabase.co/functions/v1/<함수 이름>/v1     API 키 = RELAY_KEY
//   비밀(Edge Function Secrets): RELAY_KEY(필수) · API_1 … · STUDIO_1 … · WAIT_SEC · FALLBACK_MODEL · MODELS · VERTEX_LOCATION · HOP_REGIONS
//   함수 설정에서 "Enforce JWT Verification"(JWT 확인)을 꺼야 한다 — 프로그램은 Supabase 토큰이 아니라 RELAY_KEY 를 보낸다
const SB_REGIONS = ['us-east-1', 'us-west-2', 'us-west-1', 'ca-central-1', 'eu-west-2', 'eu-central-1', 'eu-west-1', 'eu-west-3', 'sa-east-1', 'ap-southeast-2', 'ap-south-1', 'ap-southeast-1', 'ap-northeast-1'];
const SB_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const sbJson = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...SB_CORS, 'Content-Type': 'application/json' } });
async function sbSame(a, b) {
  const e = new TextEncoder(), [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', e.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y); let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]; return d === 0;
}
globalThis.process ??= { env: {} };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: SB_CORS });
  Object.assign(process.env, Deno.env.toObject());
  const url = new URL(req.url); let parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'functions' && parts[1] === 'v1') parts = parts.slice(2);
  const fname = parts.shift() || 'relay', base = String(Deno.env.get('SUPABASE_URL') || url.origin).replace(/\/+$/, ''), self = `${base}/functions/v1/${fname}`;
  const regions = (l => l.length ? l : SB_REGIONS)(String(process.env.HOP_REGIONS || '').split(/[\s,]+/).filter(r => SB_REGIONS.includes(r) || /^[a-z]{2}-[a-z]+-\d$/.test(r)));
  const at = req.headers.get('x-relay-at') || '', here = at || Deno.env.get('SB_REGION') || 'edge';
  if (parts[0] === 'health') return sbJson(200, { ok: true, key: !!String(process.env.RELAY_KEY || '').trim(), region: Deno.env.get('SB_REGION') || '', regions, googleKeys: keyCount(), studioKeys: studioCount(), unreadable: bad.slice() });
  const toRegion = (region, path, init) => fetch(`${self}${path}${path.includes('?') ? '&' : '?'}forceFunctionRegion=${region}`, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers || {})), 'x-region': region, 'x-relay-at': region } });
  // 처음 받은 곳(보통 내게 가까운 서울 · 도쿄)에서 바로 구글로 보내지 않고 첫 지역에서 시작한다
  if (!at) { const rest = '/' + parts.join('/') + url.search; return toRegion(regions[0], rest, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer() }).then(r => new Response(r.body, { status: r.status, headers: r.headers })); }
  hop.regions = regions;
  hop.send = (_u, next, init) => toRegion(next, '/v1/chat/completions', init);
  const KEY = String(process.env.RELAY_KEY || '').trim();
  const oa = i => parts[i] === 'v1' && (parts[i + 1] === 'models' || (parts[i + 1] === 'chat' && parts[i + 2] === 'completions'));
  if (oa(0)) return openai(req, here, parts, url, false);
  if (KEY && parts.length > 1 && oa(1) && (await sbSame(parts[0], KEY))) return openai(req, here, parts.slice(1), url, true);
  return sbJson(404, { error: 'Use /v1/chat/completions (OpenAI-compatible).' });
});
