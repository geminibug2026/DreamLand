// DreamLand Vertex 중계 — OpenAI 호환 길 (SillyTavern · Marinara 등 "Custom (OpenAI-compatible)" 로 붙는 프로그램용)
//
//   POST /v1/chat/completions   OpenAI 형식으로 받아 Vertex(Gemini) 형식으로 바꿔 보내고, 답을 다시 OpenAI 형식으로 돌려준다 (스트리밍 포함)
//   GET  /v1/models             쓸 모델 목록
//
// 이 길은 구글 키를 중계가 들고 있어야 한다 (프로그램이 OpenAI 형식으로만 말하므로). 환경 변수:
//   RELAY_KEY   (필수) 프로그램의 "API 키" 칸에 넣는 암호
//   API_1 … API_9, 또는 API_ 로 시작하는 아무 이름   서비스 계정 JSON 통째로, 또는 Vertex 익스프레스 API 키. 여럿이면 429 때 다음 것으로 넘어간다
//   STUDIO_1 …, 또는 STUDIO_ 로 시작하는 아무 이름   (선택) Google AI Studio(Gemini API) 키. Vertex 와 따로 매기는 몫이라, Vertex 키가 다 막히면 여기로 넘어간다
//   WAIT_SEC    (선택) 모든 키 · 지역이 429 일 때 중계 안에서 버티며 다시 해 볼 시간(초). 기본 60, 0 이면 바로 429 를 돌려준다 (최대 240)
//   FALLBACK_MODEL (선택) 그래도 막히면 이 모델로 한 번 답한다 (예: gemini-3.7-flash). 비우면 끔
//   NEXT_RELAY  (선택) 이 중계의 지역이 다 막히면 넘겨 볼 다른 중계의 OpenAI 주소 (예: https://<워커>.workers.dev/v1). 암호가 다르면 NEXT_RELAY_KEY
//   MODELS      (선택) 쉼표로 나눈 모델 이름
//   VERTEX_LOCATION (선택) 기본 global
//
// 429 가 나면: ① 다른 키(다른 프로젝트)로 → ② AI Studio 키로 → ③ 이 배포의 다른 지역 함수에 넘긴다 (지역 여섯 곳을 한 바퀴)
//   → ④ 그래도 다 막히면 연결을 열어 둔 채 잠깐씩 쉬며 키를 다시 돌린다(WAIT_SEC 동안) → ⑤ FALLBACK_MODEL 이 있으면 그 모델로
// 구글 쪽 전체가 붐비는 429 는 몇 초 ~ 몇십 초 안에 풀리는 일이 많아, ④가 가장 자주 듣는다. 받는 프로그램은 첫 글자가 늦게 올 뿐 오류를 보지 않는다
export const REGIONS = ['iad1', 'pdx1', 'cle1', 'sfo1', 'fra1', 'lhr1'];
/** 다른 지역으로 넘기는 길. Vercel 은 같은 배포의 지역 함수(/<지역>/v1/…)로 넘긴다.
 *  다른 곳에 올린 중계(Cloudflare 는 지역을 정한 Durable Object, Supabase 는 x-region 머리말)가 regions · send 를 바꿔 끼운다 */
export const hop = {
  regions: REGIONS,
  send: (url, next, init) => fetch(`${url.origin}/${next}/v1/chat/completions`, init),
};
const DEFAULT_MODELS = ['gemini-4-hydrogen', 'gemini-4-neon', 'gemini-4-carbon', 'gemini-4-argon', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const enc = new TextEncoder();
const fail = (status, message, code) => new Response(JSON.stringify({ error: { message, type: code || 'relay_error', code: code || status } }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const b64url = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

// ── 키: 서비스 계정(JSON) 또는 익스프레스 API 키 ──
/** 읽지 못한 열쇠들 (이름과 까닭만 — 값은 절대 내보내지 않는다) */
export const bad = [];
/** 읽을 수 있는 구글 열쇠 수 (확인용) */
export const keyCount = () => creds().length;
function creds() {
  bad.length = 0;
  const names = new Set(['GOOGLE_SERVICE_ACCOUNT', ...Array.from({ length: 9 }, (_, i) => 'API_' + (i + 1))]);
  try { for (const k of Object.keys(process.env)) if (/^API_/.test(k)) names.add(k); } catch { /* 열쇠 이름을 훑을 수 없는 곳이면 위의 정해진 이름만 */ }
  const out = [], seen = new Set();
  for (const name of names) {
    const v = String(process.env[name] || '').trim(); if (!v || seen.has(v)) continue; seen.add(v);
    if (v.startsWith('{')) { try { const sa = JSON.parse(v); if (sa.client_email && sa.private_key) out.push({ name, sa }); else bad.push(name + ': client_email / private_key 가 없는 JSON'); } catch { bad.push(name + ': JSON 이 깨졌어요 (처음부터 끝까지 통째로 붙여 넣었는지 확인)'); } }
    else out.push({ name, key: v });
  }
  // AI Studio(Gemini API) 키: Vertex 열쇠 뒤에 선다 (Vertex 와 따로 매기는 몫이라 둘 다 막히는 일이 드물다)
  let studio = []; try { studio = Object.keys(process.env).filter(k => /^STUDIO_/.test(k)).sort(); } catch { /* 훑을 수 없으면 정해진 이름만 */ }
  for (const name of new Set([...Array.from({ length: 9 }, (_, i) => 'STUDIO_' + (i + 1)), ...studio])) {
    const v = String(process.env[name] || '').trim(); if (!v || seen.has(v)) continue; seen.add(v);
    if (v.startsWith('{')) bad.push(name + ': AI Studio 키 칸에는 키(AIza…)만 넣어요 — 서비스 계정 JSON 은 API_ 칸에'); else out.push({ name, studio: v });
  }
  return out;
}
export const studioCount = () => creds().filter(c => c.studio).length;
/** 방금 429 를 받은 열쇠: 잠깐은 뒤로 미룬다 (같은 함수가 이어서 받는 요청에서 막힌 열쇠부터 두드리지 않게) */
const cooling = new Map();
/** AI Studio 에 아직 없는 모델 (404): 10분 동안은 AI Studio 열쇠를 건너뛴다 */
const studioMissing = new Map();
const tokens = new Map();
async function accessToken(sa) {
  const hit = tokens.get(sa.client_email); if (hit && hit.exp - Date.now() > 60000) return hit.token;
  const now = Math.floor(Date.now() / 1000), aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))), claim = b64url(enc.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud, iat: now, exp: now + 3600 })));
  const pem = String(sa.private_key).replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + claim)));
  const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + sig });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google token: ' + (j.error_description || j.error || r.status));
  tokens.set(sa.client_email, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}

// ── OpenAI 요청 → Gemini 요청 ──
const SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT', 'HARM_CATEGORY_CIVIC_INTEGRITY'].map(category => ({ category, threshold: 'OFF' }));
function partsOf(content) {
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  const out = [];
  for (const p of Array.isArray(content) ? content : []) {
    if (typeof p === 'string') { if (p) out.push({ text: p }); continue; }
    if (p?.type === 'text' && p.text) out.push({ text: String(p.text) });
    else if (p?.type === 'image_url') { const u = typeof p.image_url === 'string' ? p.image_url : p.image_url?.url, m = /^data:([^;,]+);base64,(.+)$/s.exec(u || ''); if (m) out.push({ inlineData: { mimeType: m[1], data: m[2] } }); }
  }
  return out;
}
export function toGemini(body) {
  const system = [], contents = []; let lead = true;
  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    const parts = partsOf(m.content); if (!parts.length) continue;
    if ((m.role === 'system' || m.role === 'developer') && lead) { system.push(...parts); continue; }
    lead = false;
    const role = m.role === 'assistant' ? 'model' : 'user', last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts); else contents.push({ role, parts });   // 같은 쪽이 이어지면 한 덩어리로 (Gemini 는 번갈아 오기를 바란다)
  }
  if (!contents.length) contents.push({ role: 'user', parts: [{ text: ' ' }] });
  const num = v => typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  const g = {}, set = (k, v) => { if (v !== undefined && v !== null) g[k] = v; };
  set('temperature', num(body.temperature)); set('topP', num(body.top_p)); set('topK', num(body.top_k));
  set('maxOutputTokens', num(body.max_completion_tokens) ?? num(body.max_tokens)); { const sd = num(body.seed); if (sd != null && sd >= 0) set('seed', sd); }   // 실리태번의 -1(무작위)은 보내지 않는다
  if (num(body.frequency_penalty)) g.frequencyPenalty = body.frequency_penalty;   // 0 은 보내지 않는다 (받지 않는 모델이 있다)
  if (num(body.presence_penalty)) g.presencePenalty = body.presence_penalty;
  const stop = (Array.isArray(body.stop) ? body.stop : body.stop ? [body.stop] : []).filter(s => typeof s === 'string' && s).slice(0, 5); if (stop.length) g.stopSequences = stop;
  // 추론: reasoning_effort 가 오면 생각을 켜고 생각 글도 받는다. 2.5 는 토큰 수로, 그 뒤 모델은 단계 이름으로
  const effort = String(body.reasoning_effort || '').toLowerCase(), model = String(body.model || '');
  if (['minimal', 'low', 'medium', 'high'].includes(effort)) {
    g.thinkingConfig = /gemini-2\.5/.test(model) ? { includeThoughts: true, thinkingBudget: { minimal: 512, low: 2048, medium: 8192, high: 24576 }[effort] } : { includeThoughts: true, thinkingLevel: effort };
  }
  const out = { contents, generationConfig: g, safetySettings: SAFETY };
  if (system.length) out.systemInstruction = { parts: system };
  return out;
}

// ── Gemini 답 → OpenAI 답 ──
const finishOf = r => !r ? null : r === 'STOP' ? 'stop' : r === 'MAX_TOKENS' ? 'length' : 'content_filter';
const usageOf = u => u ? { prompt_tokens: u.promptTokenCount || 0, completion_tokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), total_tokens: u.totalTokenCount || 0 } : undefined;
function pieces(j) {   // 한 조각에서 { text, think, finish, usage, blocked }
  const c = j?.candidates?.[0]; let text = '', think = '';
  for (const p of c?.content?.parts || []) { if (typeof p.text !== 'string') continue; if (p.thought) think += p.text; else text += p.text; }
  return { text, think, finish: finishOf(c?.finishReason), usage: usageOf(j?.usageMetadata), blocked: j?.promptFeedback?.blockReason || '' };
}
async function* events(res) {   // Vertex 의 SSE 를 JSON 조각으로
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let at; while ((at = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, at).trim(); buf = buf.slice(at + 1); if (line.startsWith('data:')) { try { yield JSON.parse(line.slice(5)); } catch { /* 깨진 줄은 넘긴다 */ } } }
  }
  const tail = buf.trim(); if (tail.startsWith('data:')) { try { yield JSON.parse(tail.slice(5)); } catch { /* 넘긴다 */ } }
}
function streamOut(up, model) {
  const id = 'chatcmpl-' + crypto.randomUUID(), created = Math.floor(Date.now() / 1000);
  const chunk = (delta, finish = null, usage) => enc.encode('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) }) + '\n\n');
  return new ReadableStream({ async start(ctl) {
    try {
      ctl.enqueue(chunk({ role: 'assistant', content: '' }));
      let fin = null, usage;
      for await (const j of events(up)) {
        const p = pieces(j);
        if (p.blocked) { ctl.enqueue(enc.encode('data: ' + JSON.stringify({ error: { message: 'Blocked by Google: ' + p.blocked, type: 'content_filter' } }) + '\n\n')); fin = 'content_filter'; break; }
        if (p.think) ctl.enqueue(chunk({ reasoning_content: p.think }));
        if (p.text) ctl.enqueue(chunk({ content: p.text }));
        if (p.finish) fin = p.finish; if (p.usage) usage = p.usage;
      }
      ctl.enqueue(chunk({}, fin || 'stop', usage)); ctl.enqueue(enc.encode('data: [DONE]\n\n'));
    } catch (e) { ctl.enqueue(enc.encode('data: ' + JSON.stringify({ error: { message: 'relay stream error: ' + (e && e.message || e) } }) + '\n\n')); }
    ctl.close();
  } });
}
function jsonOut(up, model) {   // 스트리밍을 안 쓰는 요청: 다 모아서 한 번에. 오래 걸리는 동안 빈칸을 흘려 연결이 끊기지 않게 한다 (JSON 앞의 빈칸은 무시된다)
  return new ReadableStream({ async start(ctl) {
    const beat = setInterval(() => { try { ctl.enqueue(enc.encode(' ')); } catch { /* 닫혔다 */ } }, 8000);
    let text = '', think = '', fin = null, usage, err = '';
    try { for await (const j of events(up)) { const p = pieces(j); if (p.blocked) { err = 'Blocked by Google: ' + p.blocked; break; } text += p.text; think += p.think; if (p.finish) fin = p.finish; if (p.usage) usage = p.usage; } }
    catch (e) { err = 'relay stream error: ' + (e && e.message || e); }
    clearInterval(beat);
    ctl.enqueue(enc.encode(JSON.stringify(err && !text ? { error: { message: err, type: 'relay_error' } } : { id: 'chatcmpl-' + crypto.randomUUID(), object: 'chat.completion', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: { role: 'assistant', content: text, ...(think ? { reasoning_content: think } : {}) }, finish_reason: fin || 'stop' }], ...(usage ? { usage } : {}) })));
    ctl.close();
  } });
}

async function callVertex(cred, model, payload) {
  if (cred.studio) return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cred.studio }, body: JSON.stringify(payload) });
  const loc = String(process.env.VERTEX_LOCATION || 'global').trim() || 'global', host = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;
  const headers = { 'Content-Type': 'application/json' }; let path;
  if (cred.sa) { headers.Authorization = 'Bearer ' + await accessToken(cred.sa); path = `/v1/projects/${cred.sa.project_id}/locations/${loc}/publishers/google/models/${encodeURIComponent(model)}`; }
  else { headers['x-goog-api-key'] = cred.key; path = `/v1/publishers/google/models/${encodeURIComponent(model)}`; }
  return fetch(host + path + ':streamGenerateContent?alt=sse', { method: 'POST', headers, body: JSON.stringify(payload) });
}
async function errorOf(r) { const t = await r.text().catch(() => ''); try { const j = JSON.parse(t), e = (Array.isArray(j) ? j[0] : j)?.error; return e?.message || t.slice(0, 400); } catch { return t.slice(0, 400) || r.statusText; } }

/** parts: 암호를 뗀 길 (['v1','models'] · ['v1','chat','completions']). authed: 길에 든 암호가 이미 맞았는지 */
const FAST_MS = 8000, PING_MS = 5000;
/** 오래 걸리는 답을 25초 제한에 걸리지 않게 감싼다. 빨리 끝나면 원래 상태 코드 그대로, 늦어지면 200 으로 먼저 열고 기다린다 */
async function keepAlive(run, stream, region) {
  const job = run().catch(e => fail(500, '중계 안에서 오류가 났어요: ' + String(e && e.message || e)));
  const early = await Promise.race([job, new Promise(r => setTimeout(() => r(null), FAST_MS))]);
  if (early) return early;
  const ts = new TransformStream(), w = ts.writable.getWriter(), tick = () => w.write(enc.encode(stream ? ': keep-alive\n\n' : ' ')).catch(() => { });
  tick(); const ping = setInterval(tick, PING_MS);
  (async () => {
    const r = await job; clearInterval(ping);
    try {
      if (stream && r.ok && r.body && /event-stream/.test(r.headers.get('content-type') || '')) { const rd = r.body.getReader(); for (; ;) { const { value, done } = await rd.read(); if (done) break; await w.write(value); } }
      else if (stream) { const t = await r.text(); let err = null; try { err = JSON.parse(t).error; } catch { /* 글 그대로 */ } await w.write(enc.encode('data: ' + JSON.stringify({ error: err || { message: t.slice(0, 500), code: r.status } }) + '\n\ndata: [DONE]\n\n')); }
      else await w.write(enc.encode(await r.text()));
    } catch { /* 받는 쪽이 끊었다 */ } finally { try { await w.close(); } catch { /* 이미 닫힘 */ } }
  })();
  return new Response(ts.readable, { status: 200, headers: { ...CORS, 'Cache-Control': 'no-store', 'X-Relay-Region': region, 'Content-Type': stream ? 'text/event-stream' : 'application/json' } });
}

/** 어디서든 터지면 빈 "Internal Server Error" 대신 까닭을 알린다 */
export async function openai(request, region, parts, url, authed) {
  try { return await openaiInner(request, region, parts, url, authed); }
  catch (e) { return fail(500, '중계 안에서 오류가 났어요: ' + String(e && e.message || e)); }
}
async function openaiInner(request, region, parts, url, authed) {
  const KEY = String(process.env.RELAY_KEY || '').trim();
  if (!KEY) return fail(500, 'RELAY_KEY is not set on this project.');
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!authed && bearer !== KEY) return fail(401, 'Wrong relay password. Put RELAY_KEY in the API key field.', 'invalid_api_key');
  if (parts[1] === 'models') {
    const list = String(process.env.MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
    return new Response(JSON.stringify({ object: 'list', data: (list.length ? list : DEFAULT_MODELS).map(id => ({ id, object: 'model', created: 0, owned_by: 'google' })) }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  if (request.method !== 'POST') return fail(405, 'POST only');
  let body; try { body = await request.json(); } catch { return fail(400, 'Request body is not JSON.'); }
  const model = String(body.model || '').replace(/^(models\/|google\/)/, ''); if (!model) return fail(400, 'model is required.');
  const list = creds(); if (!list.length) return fail(500, '중계에 구글 열쇠가 없어요 (No Google key). Vercel → Settings → Environment Variables 에 API_1 이름으로 서비스 계정 JSON 을 통째로 넣고, Deployments 에서 Redeploy 하세요.' + (bad.length ? ' 읽지 못한 것: ' + bad.join(' / ') : ''));
  // Vercel Edge 는 25초 안에 답을 시작해야 끊지 않는다 (FUNCTION_INVOCATION_TIMEOUT). 생각이 긴 모델은 구글이 첫 글자를 25초 넘게 안 보내므로,
  // 8초 안에 끝나지 않으면 먼저 200 으로 답을 열고 5초마다 '아직 연결돼 있음' 신호를 보내며 기다린다 (스트리밍: SSE 주석 줄, 아니면 공백 — 둘 다 받는 쪽이 무시한다)
  const tried = (request.headers.get('x-relay-tried') || '').split(',').map(s => s.trim()).filter(Boolean), entry = !tried.length;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  /** 한 바퀴: 열쇠를 차례로 (Vertex → AI Studio, 방금 막힌 것은 뒤로) → 다 막히면 아직 안 가 본 지역의 함수에 넘긴다(here 면 이 지역만) */
  const attempt = async (mdl, here) => {
    let payload = toGemini({ ...body, model: mdl }), last = '';
    const now = Date.now(), vx = list.filter(c => !c.studio), st = list.filter(c => c.studio), turn = a => { const k = Math.floor(Math.random() * (a.length || 1)); return [...a.slice(k), ...a.slice(0, k)]; };
    const stOk = (studioMissing.get(mdl) || 0) > now ? [] : st;
    const order = [...turn(vx), ...turn(stOk)].map((c, i) => ({ c, i, cool: (cooling.get(c.name) || 0) > now })).sort((x, y) => (x.cool - y.cool) || (x.i - y.i)).map(x => x.c);
    let thrown = 0, busy = 0;
    for (const cred of order) {
      let r;
      try {
        r = await callVertex(cred, mdl, payload);
        if (r.status === 400 && payload.generationConfig.thinkingConfig) {   // 이 모델이 그 추론 설정을 받지 않으면 빼고 한 번 더
          const why = await errorOf(r);
          if (/think/i.test(why)) { payload = { ...payload, generationConfig: { ...payload.generationConfig } }; delete payload.generationConfig.thinkingConfig; r = await callVertex(cred, mdl, payload); }
          else return fail(400, why);
        }
      } catch (e) { last = String(e && e.message || e); thrown++; continue; }
      if (r.ok) {
        cooling.delete(cred.name);
        const head = { ...CORS, 'Cache-Control': 'no-store', 'X-Relay-Region': region, 'X-Relay-Key': cred.name, 'X-Relay-Model': mdl };
        return body.stream ? new Response(streamOut(r, mdl), { status: 200, headers: { ...head, 'Content-Type': 'text/event-stream' } }) : new Response(jsonOut(r, mdl), { status: 200, headers: { ...head, 'Content-Type': 'application/json' } });
      }
      last = await errorOf(r);
      if (r.status === 429) cooling.set(cred.name, Date.now() + (/per.?day|daily|perday/i.test(last) ? 3600000 : 20000));   // 하루 한도가 찬 열쇠는 한 시간 뒤로 (계속 떠 있는 중계 — 내 PC 중계 — 에서 특히 듣는다)
      if (r.status === 503) busy++;
      if (r.status === 404 && cred.studio) { studioMissing.set(mdl, Date.now() + 600000); continue; }   // AI Studio 에 아직 없는 모델이면 그 키는 건너뛴다 (Vertex 전용 모델)
      if (r.status !== 429 && r.status !== 503) return fail(r.status, last);   // 키 · 요청이 잘못된 것은 다른 곳으로 넘겨도 소용없다
    }
    // 모든 열쇠가 구글 인증에서 막혔다 (429 가 아니다): 다른 지역으로 넘겨도 소용없으니 까닭을 그대로 알린다
    if (thrown === list.length) return fail(502, '구글 인증에 실패했어요. 서비스 계정 JSON 이 맞는지, 그 계정에 Vertex AI 사용자 권한이 있는지 확인하세요. (' + last + ')', 'auth_error');
    // 이 지역에서는 모든 키가 막혔다: 아직 안 가 본 지역의 함수에 넘긴다 (버티는 중의 다시 해 보기는 이 지역에서만 — 지역마다 함수를 또 부르지 않게)
    const next = here || process.env.RELAY_HOPS === '0' ? null : hop.regions.find(x => x !== region && !tried.includes(x));   // 내 PC 중계처럼 지역 함수가 없는 곳은 넘기지 않는다
    if (next) {
      try {
        const sib = await hop.send(url, next, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY, 'x-relay-tried': [...tried, region].join(','), ...(busy || request.headers.get('x-relay-busy') === '1' ? { 'x-relay-busy': '1' } : {}) }, body: JSON.stringify({ ...body, model: mdl }) });
        const head = new Headers(CORS); for (const k of ['content-type', 'x-relay-region', 'x-relay-key', 'x-relay-model']) { const v = sib.headers.get(k); if (v) head.set(k, v); } head.set('Cache-Control', 'no-store');
        return new Response(sib.body, { status: sib.status, headers: head });
      } catch (e) { last = last || String(e && e.message || e); }
    }
    // 503 은 한도가 아니라 구글 쪽 모델이 붐비는 것 — 키 · 지역을 다 돌아도 그대로면 그렇다고 알린다
    if (busy || (request.headers.get('x-relay-busy') === '1')) return fail(503, '구글 쪽 모델이 지금 붐벼요 (503 · overloaded). 모든 키 · 지역에서 같은 답이 왔어요. 잠시 뒤 다시 하거나 다른 모델(예: flash)로 바꿔 보세요. ' + last, 'overloaded');
    return fail(429, '모든 키 · 지역이 429 예요 (Every key in every region returned 429). ' + last, 'rate_limit_exceeded');
  };
  // Vercel Edge 는 25초 안에 답을 시작해야 끊지 않는다 (FUNCTION_INVOCATION_TIMEOUT). 생각이 긴 모델은 구글이 첫 글자를 25초 넘게 안 보내므로,
  // 8초 안에 끝나지 않으면 먼저 200 으로 답을 열고 5초마다 '아직 연결돼 있음' 신호를 보내며 기다린다 (스트리밍: SSE 주석 줄, 아니면 공백 — 둘 다 받는 쪽이 무시한다)
  const chained = request.headers.get('x-relay-chain') === '1';
  return keepAlive(async () => {
    let r = await attempt(model, false);
    if (!entry) return r;   // 다른 지역에서 넘겨받은 요청은 버티지 않는다 (처음 받은 함수가 버틴다)
    // 다른 중계로: 이 중계의 지역이 다 막혔으면, 다른 곳(예: Vercel ↔ Cloudflare ↔ Supabase)에 올린 중계의 지역들을 한 바퀴 더 (같은 계정 그대로, 나가는 곳만 바뀐다)
    const nextRelay = String(process.env.NEXT_RELAY || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    if ((r.status === 429 || r.status === 503) && nextRelay && !chained) {
      try {
        const r2 = await fetch(nextRelay + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (String(process.env.NEXT_RELAY_KEY || '').trim() || KEY), 'x-relay-chain': '1' }, body: JSON.stringify(body) });
        if (r2.ok) { const head = new Headers(CORS); for (const k of ['content-type', 'x-relay-region', 'x-relay-key', 'x-relay-model']) { const v = r2.headers.get(k); if (v) head.set(k, v); } head.set('Cache-Control', 'no-store'); head.set('X-Relay-Via', 'next'); return new Response(r2.body, { status: 200, headers: head }); }
      } catch { /* 다른 중계에 닿지 못했다: 이 중계에서 버틴다 */ }
    }
    if (chained) return r;   // 넘겨받은 요청은 버티지 않는다 (넘긴 쪽이 버틴다)
    // 버티기: 구글 쪽이 붐비는 429 · 503 은 금방 풀리는 일이 많다. 연결을 열어 둔 채 잠깐씩 쉬며 이 지역의 열쇠를 다시 돌린다
    const t0 = Date.now(), budget = Math.max(0, Math.min(240, Number(process.env.WAIT_SEC ?? 60) || 0)) * 1000; let delay = 3000, rounds = 0;
    while ((r.status === 429 || r.status === 503) && Date.now() - t0 + delay <= budget) {
      await sleep(delay * (0.8 + Math.random() * 0.4)); delay = Math.min(delay * 2, 20000); rounds++;
      r = await attempt(model, true);
    }
    // 그래도 막히면: 정해 둔 대신 쓸 모델로 한 번 (가벼운 모델은 대개 덜 붐빈다)
    const alt = String(process.env.FALLBACK_MODEL || '').trim().replace(/^(models\/|google\/)/, '');
    if ((r.status === 429 || r.status === 503) && alt && alt !== model) { const r2 = await attempt(alt, false); if (r2.ok) return r2; }
    if ((r.status === 429 || r.status === 503) && rounds) return fail(r.status, `${Math.round((Date.now() - t0) / 1000)}초 동안 ${rounds + 1}번 돌려 봤지만 모든 키 · 지역이 막혔어요. 잠시 뒤 다시 하거나, 다른 프로젝트 키(API_2 …) · AI Studio 키(STUDIO_1 …)를 더 넣거나, FALLBACK_MODEL 을 정해 두세요.`, r.status === 503 ? 'overloaded' : 'rate_limit_exceeded');
    return r;
  }, !!body.stream, region);
}
