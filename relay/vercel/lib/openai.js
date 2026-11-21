// DreamLand Vertex 중계 — OpenAI 호환 길 (SillyTavern · Marinara 등 "Custom (OpenAI-compatible)" 로 붙는 프로그램용)
//
//   POST /v1/chat/completions   OpenAI 형식으로 받아 Vertex(Gemini) 형식으로 바꿔 보내고, 답을 다시 OpenAI 형식으로 돌려준다 (스트리밍 포함)
//   GET  /v1/models             쓸 모델 목록
//
// 이 길은 구글 키를 중계가 들고 있어야 한다 (프로그램이 OpenAI 형식으로만 말하므로). 환경 변수:
//   RELAY_KEY   (필수) 프로그램의 "API 키" 칸에 넣는 암호
//   API_1 … API_9, 또는 API_ 로 시작하는 아무 이름   서비스 계정 JSON 통째로, 또는 Vertex 익스프레스 API 키. 여럿이면 429 때 다음 것으로 넘어간다
//   MODELS      (선택) 쉼표로 나눈 모델 이름
//   VERTEX_LOCATION (선택) 기본 global
//
// 429 가 나면: ① 다른 키(다른 프로젝트)로 → ② 다 막히면 이 배포의 다른 지역 함수에 넘긴다 (지역 여섯 곳을 한 바퀴)
export const REGIONS = ['iad1', 'pdx1', 'cle1', 'sfo1', 'fra1', 'lhr1'];
const DEFAULT_MODELS = ['gemini-4-argon', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];
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
  return out;
}
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
  const loc = String(process.env.VERTEX_LOCATION || 'global').trim() || 'global', host = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;
  const headers = { 'Content-Type': 'application/json' }; let path;
  if (cred.sa) { headers.Authorization = 'Bearer ' + await accessToken(cred.sa); path = `/v1/projects/${cred.sa.project_id}/locations/${loc}/publishers/google/models/${encodeURIComponent(model)}`; }
  else { headers['x-goog-api-key'] = cred.key; path = `/v1/publishers/google/models/${encodeURIComponent(model)}`; }
  return fetch(host + path + ':streamGenerateContent?alt=sse', { method: 'POST', headers, body: JSON.stringify(payload) });
}
async function errorOf(r) { const t = await r.text().catch(() => ''); try { const j = JSON.parse(t), e = (Array.isArray(j) ? j[0] : j)?.error; return e?.message || t.slice(0, 400); } catch { return t.slice(0, 400) || r.statusText; } }

/** parts: 암호를 뗀 길 (['v1','models'] · ['v1','chat','completions']). authed: 길에 든 암호가 이미 맞았는지 */
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
  const tried = (request.headers.get('x-relay-tried') || '').split(',').map(s => s.trim()).filter(Boolean);
  let payload = toGemini({ ...body, model }), last = '';
  const start = Math.floor(Math.random() * list.length); let thrown = 0;
  for (let i = 0; i < list.length; i++) {
    const cred = list[(start + i) % list.length]; let r;
    try {
      r = await callVertex(cred, model, payload);
      if (r.status === 400 && payload.generationConfig.thinkingConfig) {   // 이 모델이 그 추론 설정을 받지 않으면 빼고 한 번 더
        const why = await errorOf(r);
        if (/think/i.test(why)) { payload = { ...payload, generationConfig: { ...payload.generationConfig } }; delete payload.generationConfig.thinkingConfig; r = await callVertex(cred, model, payload); }
        else return fail(400, why);
      }
    } catch (e) { last = String(e && e.message || e); thrown++; continue; }
    if (r.ok) {
      const head = { ...CORS, 'Cache-Control': 'no-store', 'X-Relay-Region': region, 'X-Relay-Key': cred.name };
      return body.stream ? new Response(streamOut(r, model), { status: 200, headers: { ...head, 'Content-Type': 'text/event-stream' } }) : new Response(jsonOut(r, model), { status: 200, headers: { ...head, 'Content-Type': 'application/json' } });
    }
    last = await errorOf(r);
    if (r.status !== 429 && r.status !== 503) return fail(r.status, last);   // 키 · 요청이 잘못된 것은 다른 곳으로 넘겨도 소용없다
  }
  // 모든 열쇠가 구글 인증에서 막혔다 (429 가 아니다): 다른 지역으로 넘겨도 소용없으니 까닭을 그대로 알린다
  if (thrown === list.length) return fail(502, '구글 인증에 실패했어요. 서비스 계정 JSON 이 맞는지, 그 계정에 Vertex AI 사용자 권한이 있는지 확인하세요. (' + last + ')', 'auth_error');
  // 이 지역에서는 모든 키가 막혔다: 아직 안 가 본 지역의 함수에 넘긴다
  const next = REGIONS.find(x => x !== region && !tried.includes(x));
  if (next) {
    try {
      const sib = await fetch(`${url.origin}/${next}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY, 'x-relay-tried': [...tried, region].join(',') }, body: JSON.stringify(body) });
      const head = new Headers(CORS); for (const k of ['content-type', 'x-relay-region', 'x-relay-key']) { const v = sib.headers.get(k); if (v) head.set(k, v); } head.set('Cache-Control', 'no-store');
      return new Response(sib.body, { status: sib.status, headers: head });
    } catch (e) { last = last || String(e && e.message || e); }
  }
  return fail(429, 'Every key in every region returned 429. ' + last, 'rate_limit_exceeded');
}
