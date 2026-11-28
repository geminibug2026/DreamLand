import{t as e}from"./react-DlmbjZJV.js";import{P as t,T as n,g as r,h as i,p as a,s as o,u as s,w as c,x as l}from"./ui-Cv4w_HTQ.js";import{n as u,r as d,t as f}from"./parts-BiyzwbSG.js";import{n as p}from"./router-Ck6qMUlP.js";import{t as m}from"./refresh-BTkrIv4f.js";import{A as h,c as g,f as _,m as v,o as y,q as b,s as x}from"./core-Cc2CM22O.js";import{j as S,y as C}from"./engine-hm8FKeDH.js";import{r as w}from"./advanced-DCsloKui.js";import{d as T,u as E}from"./i18n-CCI-uw3d.js";import{r as D}from"./ui-bfusME-J.js";import{i as O,r as k,t as A}from"./jobs-DXrpqzRZ.js";import{a as j}from"./route-BcwdJd0Q.js";import{n as M}from"./models-bb-0tEUD.js";import{u as N}from"./parts-DKGoSOKl.js";var P=e(),F=`// DreamLand Vertex 중계 — Cloudflare Workers 판 (무료, 카드 등록 없이)
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
    if (!/^\\/v1(beta1)?\\/(projects|publishers)\\//.test(rest)) return json(404, { error: 'Only Vertex AI paths (/v1/projects/… or /v1/publishers/…) are relayed.' });
    const loc = (rest.match(/\\/locations\\/([a-z0-9-]+)\\//) || [])[1] || 'global';
    const host = loc === 'global' ? 'https://aiplatform.googleapis.com' : \`https://\${loc}-aiplatform.googleapis.com\`;
    const headers = new Headers(); for (const k of PASS) { const v = request.headers.get(k); if (v) headers.set(k, v); }
    let up;
    try { up = await fetch(host + rest + url.search, { method: request.method, headers, body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body }); }
    catch (e) { return json(502, { error: 'relay could not reach Vertex AI: ' + (e && e.message || e) }); }
    const out = new Headers(CORS); out.set('Content-Type', up.headers.get('content-type') || 'application/octet-stream'); out.set('Cache-Control', 'no-store');
    return new Response(up.body, { status: up.status, headers: out });
  },
};
`,I=`// @ts-nocheck
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
/** 설정 읽기: 입구가 globalThis.__relayEnv 를 넣어 주면 그것을(Supabase · Cloudflare — process.env 에 쓸 수 없는 곳이 있다), 아니면 process.env 를 */
const ENV = () => globalThis.__relayEnv || (typeof process !== 'undefined' && process.env) || {};
export const REGIONS = ['iad1', 'pdx1', 'cle1', 'sfo1', 'fra1', 'lhr1'];
/** 다른 지역으로 넘기는 길. Vercel 은 같은 배포의 지역 함수(/<지역>/v1/…)로 넘긴다.
 *  다른 곳에 올린 중계(Cloudflare 는 지역을 정한 Durable Object, Supabase 는 x-region 머리말)가 regions · send 를 바꿔 끼운다 */
export const hop = {
  regions: REGIONS,
  send: (url, next, init) => fetch(\`\${url.origin}/\${next}/v1/chat/completions\`, init),
};
const DEFAULT_MODELS = ['gemini-4-hydrogen', 'gemini-4-neon', 'gemini-4-carbon', 'gemini-4-argon', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const enc = new TextEncoder();
const fail = (status, message, code) => new Response(JSON.stringify({ error: { message, type: code || 'relay_error', code: code || status } }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const b64url = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); };

// ── 키: 서비스 계정(JSON) 또는 익스프레스 API 키 ──
/** 읽지 못한 열쇠들 (이름과 까닭만 — 값은 절대 내보내지 않는다) */
export const bad = [];
/** 읽을 수 있는 구글 열쇠 수 (확인용) */
export const keyCount = () => creds().length;
function creds() {
  bad.length = 0;
  const names = new Set(['GOOGLE_SERVICE_ACCOUNT', ...Array.from({ length: 9 }, (_, i) => 'API_' + (i + 1))]);
  try { for (const k of Object.keys(ENV())) if (/^API_/.test(k)) names.add(k); } catch { /* 열쇠 이름을 훑을 수 없는 곳이면 위의 정해진 이름만 */ }
  const out = [], seen = new Set();
  for (const name of names) {
    const v = String(ENV()[name] || '').trim(); if (!v || seen.has(v)) continue; seen.add(v);
    if (v.startsWith('{')) { try { const sa = JSON.parse(v); if (sa.client_email && sa.private_key) out.push({ name, sa }); else bad.push(name + ': client_email / private_key 가 없는 JSON'); } catch { bad.push(name + ': JSON 이 깨졌어요 (처음부터 끝까지 통째로 붙여 넣었는지 확인)'); } }
    else out.push({ name, key: v });
  }
  // AI Studio(Gemini API) 키: Vertex 열쇠 뒤에 선다 (Vertex 와 따로 매기는 몫이라 둘 다 막히는 일이 드물다)
  let studio = []; try { studio = Object.keys(ENV()).filter(k => /^STUDIO_/.test(k)).sort(); } catch { /* 훑을 수 없으면 정해진 이름만 */ }
  for (const name of new Set([...Array.from({ length: 9 }, (_, i) => 'STUDIO_' + (i + 1)), ...studio])) {
    const v = String(ENV()[name] || '').trim(); if (!v || seen.has(v)) continue; seen.add(v);
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
  const pem = String(sa.private_key).replace(/\\\\n/g, '\\n').replace(/-----[^-]+-----/g, '').replace(/\\s+/g, ''), der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
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
    g.thinkingConfig = /gemini-2\\.5/.test(model) ? { includeThoughts: true, thinkingBudget: { minimal: 512, low: 2048, medium: 8192, high: 24576 }[effort] } : { includeThoughts: true, thinkingLevel: effort };
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
    let at; while ((at = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, at).trim(); buf = buf.slice(at + 1); if (line.startsWith('data:')) { try { yield JSON.parse(line.slice(5)); } catch { /* 깨진 줄은 넘긴다 */ } } }
  }
  const tail = buf.trim(); if (tail.startsWith('data:')) { try { yield JSON.parse(tail.slice(5)); } catch { /* 넘긴다 */ } }
}
function streamOut(up, model) {
  const id = 'chatcmpl-' + crypto.randomUUID(), created = Math.floor(Date.now() / 1000);
  const chunk = (delta, finish = null, usage) => enc.encode('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) }) + '\\n\\n');
  return new ReadableStream({ async start(ctl) {
    try {
      ctl.enqueue(chunk({ role: 'assistant', content: '' }));
      let fin = null, usage;
      for await (const j of events(up)) {
        const p = pieces(j);
        if (p.blocked) { ctl.enqueue(enc.encode('data: ' + JSON.stringify({ error: { message: 'Blocked by Google: ' + p.blocked, type: 'content_filter' } }) + '\\n\\n')); fin = 'content_filter'; break; }
        if (p.think) ctl.enqueue(chunk({ reasoning_content: p.think }));
        if (p.text) ctl.enqueue(chunk({ content: p.text }));
        if (p.finish) fin = p.finish; if (p.usage) usage = p.usage;
      }
      ctl.enqueue(chunk({}, fin || 'stop', usage)); ctl.enqueue(enc.encode('data: [DONE]\\n\\n'));
    } catch (e) { ctl.enqueue(enc.encode('data: ' + JSON.stringify({ error: { message: 'relay stream error: ' + (e && e.message || e) } }) + '\\n\\n')); }
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
  if (cred.studio) return fetch(\`https://generativelanguage.googleapis.com/v1beta/models/\${encodeURIComponent(model)}:streamGenerateContent?alt=sse\`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cred.studio }, body: JSON.stringify(payload) });
  const loc = String(ENV().VERTEX_LOCATION || 'global').trim() || 'global', host = loc === 'global' ? 'https://aiplatform.googleapis.com' : \`https://\${loc}-aiplatform.googleapis.com\`;
  const headers = { 'Content-Type': 'application/json' }; let path;
  if (cred.sa) { headers.Authorization = 'Bearer ' + await accessToken(cred.sa); path = \`/v1/projects/\${cred.sa.project_id}/locations/\${loc}/publishers/google/models/\${encodeURIComponent(model)}\`; }
  else { headers['x-goog-api-key'] = cred.key; path = \`/v1/publishers/google/models/\${encodeURIComponent(model)}\`; }
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
  const ts = new TransformStream(), w = ts.writable.getWriter(), tick = () => w.write(enc.encode(stream ? ': keep-alive\\n\\n' : ' ')).catch(() => { });
  tick(); const ping = setInterval(tick, PING_MS);
  (async () => {
    const r = await job; clearInterval(ping);
    try {
      if (stream && r.ok && r.body && /event-stream/.test(r.headers.get('content-type') || '')) { const rd = r.body.getReader(); for (; ;) { const { value, done } = await rd.read(); if (done) break; await w.write(value); } }
      else if (stream) { const t = await r.text(); let err = null; try { err = JSON.parse(t).error; } catch { /* 글 그대로 */ } await w.write(enc.encode('data: ' + JSON.stringify({ error: err || { message: t.slice(0, 500), code: r.status } }) + '\\n\\ndata: [DONE]\\n\\n')); }
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
  const KEY = String(ENV().RELAY_KEY || '').trim();
  if (!KEY) return fail(500, 'RELAY_KEY is not set on this project.');
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\\s+/i, '').trim();
  if (!authed && bearer !== KEY) return fail(401, 'Wrong relay password. Put RELAY_KEY in the API key field.', 'invalid_api_key');
  if (parts[1] === 'models') {
    const list = String(ENV().MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
    return new Response(JSON.stringify({ object: 'list', data: (list.length ? list : DEFAULT_MODELS).map(id => ({ id, object: 'model', created: 0, owned_by: 'google' })) }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  if (request.method !== 'POST') return fail(405, 'POST only');
  let body; try { body = await request.json(); } catch { return fail(400, 'Request body is not JSON.'); }
  const model = String(body.model || '').replace(/^(models\\/|google\\/)/, ''); if (!model) return fail(400, 'model is required.');
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
    const next = here || ENV().RELAY_HOPS === '0' ? null : hop.regions.find(x => x !== region && !tried.includes(x));   // 내 PC 중계처럼 지역 함수가 없는 곳은 넘기지 않는다
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
    const nextRelay = String(ENV().NEXT_RELAY || '').trim().replace(/\\/+$/, '').replace(/\\/chat\\/completions$/, '');
    if ((r.status === 429 || r.status === 503) && nextRelay && !chained) {
      try {
        const r2 = await fetch(nextRelay + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (String(ENV().NEXT_RELAY_KEY || '').trim() || KEY), 'x-relay-chain': '1' }, body: JSON.stringify(body) });
        if (r2.ok) { const head = new Headers(CORS); for (const k of ['content-type', 'x-relay-region', 'x-relay-key', 'x-relay-model']) { const v = r2.headers.get(k); if (v) head.set(k, v); } head.set('Cache-Control', 'no-store'); head.set('X-Relay-Via', 'next'); return new Response(r2.body, { status: 200, headers: head }); }
      } catch { /* 다른 중계에 닿지 못했다: 이 중계에서 버틴다 */ }
    }
    if (chained) return r;   // 넘겨받은 요청은 버티지 않는다 (넘긴 쪽이 버틴다)
    // 버티기: 구글 쪽이 붐비는 429 · 503 은 금방 풀리는 일이 많다. 연결을 열어 둔 채 잠깐씩 쉬며 이 지역의 열쇠를 다시 돌린다
    const t0 = Date.now(), budget = Math.max(0, Math.min(240, Number(ENV().WAIT_SEC ?? 60) || 0)) * 1000; let delay = 3000, rounds = 0;
    while ((r.status === 429 || r.status === 503) && Date.now() - t0 + delay <= budget) {
      await sleep(delay * (0.8 + Math.random() * 0.4)); delay = Math.min(delay * 2, 20000); rounds++;
      r = await attempt(model, true);
    }
    // 그래도 막히면: 정해 둔 대신 쓸 모델로 한 번 (가벼운 모델은 대개 덜 붐빈다)
    const alt = String(ENV().FALLBACK_MODEL || '').trim().replace(/^(models\\/|google\\/)/, '');
    if ((r.status === 429 || r.status === 503) && alt && alt !== model) { const r2 = await attempt(alt, false); if (r2.ok) return r2; }
    if ((r.status === 429 || r.status === 503) && rounds) return fail(r.status, \`\${Math.round((Date.now() - t0) / 1000)}초 동안 \${rounds + 1}번 돌려 봤지만 모든 키 · 지역이 막혔어요. 잠시 뒤 다시 하거나, 다른 프로젝트 키(API_2 …) · AI Studio 키(STUDIO_1 …)를 더 넣거나, FALLBACK_MODEL 을 정해 두세요.\`, r.status === 503 ? 'overloaded' : 'rate_limit_exceeded');
    return r;
  }, !!body.stream, region);
}

// ════════ Supabase 입구 (이 위는 relay/vercel/lib/openai.js 와 같다 — relay/check-copies.mjs --fix 가 붙여 만든다) ════════
// DreamLand 중계 — Supabase Edge Function 판 (무료 · 카드 없이 · 함수 하나로 여러 지역)
// Supabase 는 요청마다 어느 지역에서 돌릴지 고를 수 있다 (x-region 머리말). 한 지역이 429 면 다음 지역에서 다시 돌린다.
//   주소 (실리태번 · 마리나라 · 드림랜드 Custom):  https://<프로젝트>.supabase.co/functions/v1/<함수 이름>/v1     API 키 = RELAY_KEY
//   비밀(Edge Function Secrets): RELAY_KEY(필수) · API_1 … · STUDIO_1 … · WAIT_SEC · FALLBACK_MODEL · MODELS · VERTEX_LOCATION · HOP_REGIONS
//   함수 Details 에서 "Verify JWT with legacy secret"(예전 이름 Enforce JWT Verification)을 꺼야 한다 — 프로그램은 Supabase 토큰이 아니라 RELAY_KEY 를 보낸다
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
  const sp = new URLSearchParams(url.search); sp.delete('forceFunctionRegion'); const search = sp.toString() ? '?' + sp : '';   // 지역을 고르려고 붙인 것은 구글에 넘기지 않는다 (400 Unknown name)
  if (parts[0] === 'functions' && parts[1] === 'v1') parts = parts.slice(2);
  const fname = parts.shift() || 'relay', base = String(Deno.env.get('SUPABASE_URL') || url.origin).replace(/\\/+$/, ''), self = \`\${base}/functions/v1/\${fname}\`;
  const regions = (l => l.length ? l : SB_REGIONS)(String(E.HOP_REGIONS || '').split(/[\\s,]+/).filter(r => SB_REGIONS.includes(r) || /^[a-z]{2}-[a-z]+-\\d$/.test(r)));
  const at = req.headers.get('x-relay-at') || '', here = at || Deno.env.get('SB_REGION') || 'edge';
  if (parts[0] === 'health') return sbJson(200, { ok: true, key: !!String(E.RELAY_KEY || '').trim(), region: Deno.env.get('SB_REGION') || '', regions, googleKeys: keyCount(), studioKeys: studioCount(), unreadable: bad.slice() });
  const toRegion = (region, path, init) => fetch(\`\${self}\${path}\${path.includes('?') ? '&' : '?'}forceFunctionRegion=\${region}\`, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers || {})), 'x-region': region, 'x-relay-at': region } });
  // 처음 받은 곳(보통 내게 가까운 서울 · 도쿄)에서 바로 구글로 보내지 않는다: 주소에 지역이 있으면 그 지역, 없으면 첫 지역에서 시작한다
  const isRegion = r => SB_REGIONS.includes(r) || /^[a-z]{2}-[a-z]+-\\d$/.test(r);
  if (!at) {
    const pinned = isRegion(parts[0]) ? parts[0] : '', rest = '/' + (pinned ? parts.slice(1) : parts).join('/') + search;
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
  if (!/^\\/v1(beta1)?\\/(projects|publishers)\\//.test(rest)) return sbJson(404, { error: 'Use /v1/chat/completions (OpenAI-compatible) or a Vertex AI path.' });
  const loc = (rest.match(/\\/locations\\/([a-z0-9-]+)\\//) || [])[1] || 'global', host = loc === 'global' ? 'https://aiplatform.googleapis.com' : \`https://\${loc}-aiplatform.googleapis.com\`;
  const headers = new Headers(); for (const k of ['authorization', 'x-goog-api-key', 'x-goog-user-project', 'content-type', 'accept']) { const v = req.headers.get(k); if (v) headers.set(k, v); }
  let up; try { up = await fetch(host + rest + search, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer() }); }
  catch (e) { return sbJson(502, { error: 'relay could not reach Vertex AI: ' + (e && e.message || e) }); }
  const out = new Headers(SB_CORS); out.set('Content-Type', up.headers.get('content-type') || 'application/octet-stream'); out.set('Cache-Control', 'no-store'); out.set('X-Relay-Region', here);
  return new Response(up.body, { status: up.status, headers: out });
}
`,L=t(),R=/\.(workers\.dev|vercel\.app|supabase\.co)$/i,z=/^([a-z]{3}\d|enam|wnam|weur|eeur|sam|oc|apac(-ne|-se)?|afr|me|[a-z]{2}-[a-z]+-\d)$/,B={vc:[`iad1`,`pdx1`,`cle1`,`sfo1`,`fra1`,`lhr1`],cf:[`enam`,`wnam`,`weur`,`eeur`,`sam`,`oc`,`apac`],sb:[`us-east-1`,`us-west-2`,`us-west-1`,`ca-central-1`,`eu-west-2`,`eu-central-1`,`eu-west-1`,`eu-west-3`,`sa-east-1`,`ap-southeast-2`,`ap-south-1`,`ap-southeast-1`,`ap-northeast-1`]},V={vc:`https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgeminibug2026%2FDreamLand%2Ftree%2Fmain%2Frelay%2Fvercel&project-name=dreamland-relay&repository-name=dreamland-relay&env=RELAY_KEY&envDescription=DreamLand%20relay%20password`,cf:`https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fgeminibug2026%2FDreamLand%2Ftree%2Fmain%2Frelay%2Fcloudflare`,sb:`https://supabase.com/dashboard/projects`},H={vc:`https://dreamland-relay.vercel.app`,cf:`https://dreamland-relay.myname.workers.dev`,sb:`https://abcd.supabase.co/functions/v1/relay`},U=e=>/\.vercel\.app/i.test(e)?`vc`:/\.workers\.dev/i.test(e)?`cf`:/\.supabase\.co/i.test(e)?`sb`:null,W=()=>Array.from(crypto.getRandomValues(new Uint8Array(18)),e=>`abcdefghijkmnpqrstuvwxyz23456789`[e%32]).join(``),G=e=>{let t=[],n=``;for(let r of String(e||``).split(/[\s,]+/).filter(Boolean)){let e;try{e=new URL(r)}catch{continue}if(e.protocol!==`https:`||!R.test(e.hostname))continue;let i=e.pathname.split(`/`).filter(Boolean),a=i.pop()||``;i.length&&z.test(i[i.length-1])&&i.pop();let o=e.origin+(i.length?`/`+i.join(`/`):``);t.includes(o)||t.push(o),n||=a}return[t,n]},K=async e=>await(await fetch(e+`/health`,{cache:`no-store`})).json();function q({n:e,children:t,act:n}){return(0,L.jsxs)(`li`,{className:`rl-step`,children:[(0,L.jsx)(`span`,{className:`rl-n`,children:e}),(0,L.jsxs)(`div`,{className:`rl-step-b`,children:[(0,L.jsx)(`p`,{children:t}),n?(0,L.jsx)(`div`,{className:`rl-act`,children:n}):null]})]})}function J({c:e,onSave:t,close:r}){let[i,o]=G(e.baseUrl),[s,u]=(0,P.useState)(U(i[0]||``)||`vc`),[d,f]=(0,P.useState)(i.join(` `)),[p,m]=(0,P.useState)(o||W()),[h,g]=(0,P.useState)(null),[_,v]=(0,P.useState)(!1),y=d.split(/[\s,]+/).map(e=>e.trim().replace(/\/+$/,``)).filter(Boolean),b=async(e,t)=>{try{await navigator.clipboard.writeText(e),a(t,`ok`)}catch{a(E(`conns.cf.copyFail`),`err`)}},S=(e,t,n=!1)=>(0,L.jsxs)(`a`,{className:`btn primary sm`,href:t,target:`_blank`,rel:`noreferrer`,onClick:()=>{n&&b(p,E(`conns.cf.keyCopied`))},children:[(0,L.jsx)(`span`,{children:e}),(0,L.jsx)(c,{name:`link`,size:14})]}),C=(0,L.jsx)(l,{label:E(`conns.relay.copyKey`),ic:`copy`,cls:`ghost sm`,onClick:()=>void b(p,E(`conns.cf.keyCopied`))}),w=async()=>{let e=p.trim(),t=[];for(let n of y){let r=U(n),i=r===`vc`?B.vc:null;if(r===`cf`||r===`sb`)try{let e=await K(n);Array.isArray(e.regions)&&e.regions.length?i=e.regions:r===`sb`&&(i=B.sb)}catch{i=r===`sb`?B.sb:null}if(i)for(let r of i)t.push(`${n}/${r}/${e}`);else t.push(`${n}/${e}`)}return t},T=async()=>{let e=y[0];if(!e||!/^https:\/\//i.test(e))return g({ok:!1,text:E(`conns.cf.addrBad`)});v(!0),g({ok:!0,text:E(`conns.cf.testing`)});try{let t=await K(e);if(!t.ok)throw Error(`?`);if(!t.key)return g({ok:!1,text:E(`conns.cf.testNoKey`)});let n=(await w()).length;g({ok:!0,text:E(`conns.relay.testOk`,{n})})}catch(e){g({ok:!1,text:E(`conns.cf.testFail`,{err:e instanceof Error?e.message:String(e)})})}finally{v(!1)}},D=async t=>{for(let n of[`apiKey`,`serviceAccount`]){let r=e[n];if(!r||!x.is(r))continue;let i=x.items[e.id]?.[n]?.hosts||[],a=[...new Set([...t?i:i.filter(e=>!R.test(e)),...t||[]])];if(a.join()===i.join())continue;let o=await x.reveal(e.id,n);e[n]=await x.put(e.id,n,o,a,e.name)}},O=async()=>{if(!y.length||y.some(e=>!/^https:\/\//i.test(e)||!U(e))||!p.trim())return g({ok:!1,text:E(`conns.cf.addrBad`)});v(!0);try{try{await D(y.map(e=>new URL(e).hostname))}catch{return g({ok:!1,text:E(`conns.cf.rekey`)})}let n=await w();e.baseUrl=n.join(` `),t(),a(E(n.length>1?`conns.cf.appliedMany`:`conns.cf.applied`,{n:n.length}),`ok`),r()}finally{v(!1)}},k=async()=>{try{await D(null)}catch{}e.baseUrl=``,t(),a(E(`conns.cf.removed`),`ok`),r()},A={vc:(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(q,{n:1,act:S(E(`conns.relay.deploy`),V.vc,!0),children:E(`conns.relay.vc1`)}),(0,L.jsx)(q,{n:2,children:E(`conns.relay.vc2`)}),(0,L.jsx)(q,{n:3,children:E(`conns.relay.vc3`)})]}),cf:(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(q,{n:1,act:S(E(`conns.relay.deploy`),V.cf),children:E(`conns.relay.cf1`)}),(0,L.jsx)(q,{n:2,act:C,children:E(`conns.relay.cf2`)}),(0,L.jsx)(q,{n:3,children:E(`conns.relay.cf3`)})]}),sb:(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(q,{n:1,act:S(E(`conns.relay.openSb`),V.sb),children:E(`conns.relay.sb1`)}),(0,L.jsx)(q,{n:2,act:(0,L.jsx)(l,{label:E(`conns.relay.copyCode`),ic:`copy`,cls:`ghost sm`,onClick:()=>void b(I,E(`conns.relay.codeCopied`))}),children:E(`conns.relay.sb2`)}),(0,L.jsx)(q,{n:3,children:E(`conns.relay.sb3`)}),(0,L.jsx)(q,{n:4,act:C,children:E(`conns.relay.sb4`)}),(0,L.jsx)(q,{n:5,children:E(`conns.relay.sb5`)})]})};return(0,L.jsxs)(`div`,{className:`rl`,children:[(0,L.jsx)(`p`,{className:`rl-lead`,children:E(`conns.relay.lead`)}),(0,L.jsx)(`div`,{className:`rl-kinds`,role:`tablist`,"aria-label":E(`conns.relay.pick`),children:[`vc`,`cf`,`sb`].map(e=>(0,L.jsxs)(`button`,{type:`button`,role:`tab`,"aria-selected":s===e,className:`rl-kind`+(s===e?` on`:``),onClick:()=>u(e),children:[(0,L.jsx)(`b`,{children:E(`conns.cf.kind.`+e)}),(0,L.jsx)(`span`,{children:E(`conns.relay.where.`+e)})]},e))}),(0,L.jsx)(`ol`,{className:`rl-steps`,children:A[s]}),s===`cf`?(0,L.jsxs)(`details`,{className:`rl-more`,children:[(0,L.jsx)(`summary`,{children:E(`conns.relay.cfOld`)}),(0,L.jsx)(`ol`,{className:`rl-old`,children:[`s1`,`s2`,`s3`,`s4`,`s5`].map(e=>(0,L.jsx)(`li`,{children:E(`conns.cf.`+e)},e))}),(0,L.jsx)(l,{label:E(`conns.cf.copyCode`),ic:`copy`,cls:`ghost sm`,onClick:()=>void b(F,E(`conns.cf.codeCopied`))})]}):null,(0,L.jsxs)(`div`,{className:`rl-fields`,children:[(0,L.jsxs)(`label`,{className:`rl-field`,children:[(0,L.jsx)(`span`,{children:E(`conns.cf.key`)}),(0,L.jsxs)(`div`,{className:`rl-inrow`,children:[(0,L.jsx)(`input`,{className:`inp mono`,value:p,spellCheck:!1,autoComplete:`off`,onChange:e=>m(e.target.value.replace(/[^\w-]/g,``))}),(0,L.jsx)(n,{ic:`copy`,title:E(`conns.cf.copy`),onClick:()=>void b(p,E(`conns.cf.keyCopied`))}),(0,L.jsx)(n,{ic:`refresh`,title:E(`conns.cf.keyMake`),onClick:()=>m(W())})]}),(0,L.jsx)(`small`,{children:E(`conns.relay.keyHint`)})]}),(0,L.jsxs)(`label`,{className:`rl-field`,children:[(0,L.jsx)(`span`,{children:E(`conns.cf.addr`)}),(0,L.jsxs)(`div`,{className:`rl-inrow`,children:[(0,L.jsx)(`input`,{className:`inp`,value:d,placeholder:H[s],spellCheck:!1,autoComplete:`off`,inputMode:`url`,onChange:e=>{f(e.target.value),g(null)}}),(0,L.jsx)(l,{label:E(`conns.cf.test`),ic:`play`,cls:`ghost sm`,onClick:()=>void T()})]}),(0,L.jsx)(`small`,{children:E(`conns.relay.addrHint`)})]}),h?(0,L.jsxs)(`p`,{className:`rl-out `+(h.ok?`ok`:`bad`),role:`status`,children:[(0,L.jsx)(c,{name:h.ok?`check`:`x`,size:14}),(0,L.jsx)(`span`,{children:h.text})]}):null]}),(0,L.jsxs)(`div`,{className:`rl-foot`,children:[(0,L.jsx)(l,{label:E(_?`conns.cf.testing`:`conns.cf.apply`),ic:`check`,cls:`primary`,onClick:()=>{_||O()}}),i.length?(0,L.jsx)(l,{label:E(`conns.cf.remove`),ic:`x`,cls:`ghost`,onClick:()=>void k()}):null]}),(0,L.jsxs)(`details`,{className:`rl-more`,children:[(0,L.jsx)(`summary`,{children:E(`conns.relay.know`)}),(0,L.jsxs)(`ul`,{className:`rl-notes`,children:[(0,L.jsx)(`li`,{children:E(`conns.relay.know1`)}),(0,L.jsx)(`li`,{children:E(`conns.relay.know2`)}),(0,L.jsx)(`li`,{children:E(`conns.relay.know3`)})]})]})]})}function Y(e,t){let n=r({title:E(`conns.cf.title`),wide:!0,body:(0,L.jsx)(J,{c:e,onSave:t,close:()=>n.close()})})}var X=[`global`,`us-central1`,`us-east5`,`europe-west4`,`europe-west1`,`asia-northeast1`,`asia-southeast1`],ee={name:`conns`,Component:se},te=[`주요`,`클라우드`,`모음 서비스`,`내 컴퓨터`,`기타`,`음성`],Z={주요:`conns.group.main`,클라우드:`conns.group.cloud`,"모음 서비스":`conns.group.aggregator`,"내 컴퓨터":`conns.group.local`,기타:`conns.group.other`,음성:`conns.group.voice`},ne=e=>Z[e]?E(Z[e]):e,re=e=>x.is(e.apiKey)?x.tail(e.id,`apiKey`):String(e.apiKey||``).length>8?String(e.apiKey).slice(-4):``,Q=e=>e?E(`conns.where.server`):g.on?E(`conns.where.encrypted`):E(`conns.where.browser`);function $({c:e,def:t,api:n}){let{Secrets:r,Vault:o}=v,s=(0,P.useRef)(null),u=!!e.apiKey,d=r.is(e.apiKey),f=async()=>{let i=s.current?.value.trim();if(i)try{if(r.on){let n=r.hostsFor(e,t.base||``);if(!n.length)return a(E(`conns.key.needUrl`),`err`);e.apiKey=await r.put(e.id,`apiKey`,i,n,e.name)}else e.apiKey=i;await n.save(),a(E(`conns.key.saved`),`ok`),n.refresh()}catch(e){a(m(e),`err`)}},p=(0,P.useRef)(f);(0,P.useLayoutEffect)(()=>{p.current=f}),(0,P.useEffect)(()=>{let e=s.current,t=()=>void p.current();return e?.addEventListener(`change`,t),()=>e?.removeEventListener(`change`,t)},[]);let h=d?E(`conns.key.whereServer`,{hosts:(r.items[e.id]?.apiKey?.hosts||[]).join(`, `)||E(`conns.key.noHost`)}):r.ok?E(`conns.key.whereMoving`):o.on?E(`conns.key.whereEncrypted`):E(`conns.key.whereBrowser`);return(0,L.jsxs)(`div`,{className:`field key-field`,children:[(0,L.jsx)(`span`,{className:`field-label`,children:t.kind===`vertex`?E(`conns.key.labelVertex`):t.keyless?E(`conns.key.labelOptional`):E(`conns.key.label`)}),u?(0,L.jsxs)(`div`,{className:`key-state`,children:[(0,L.jsx)(c,{name:`lock`,size:15}),(0,L.jsx)(`b`,{children:E(`conns.key.savedBadge`)}),(0,L.jsx)(`code`,{children:`••••••••`+(re(e)||``)}),(0,L.jsx)(`span`,{className:`key-where`,children:Q(d)}),(0,L.jsx)(l,{label:E(`conns.key.clear`),cls:`ghost`,onClick:async()=>{await i(E(`conns.key.clearConfirm`),E(`conns.key.clear`),!0)&&(d&&await r.del(e.id,`apiKey`),e.apiKey=``,await n.save(),n.refresh())}})]}):null,(0,L.jsx)(`input`,{className:`inp`,ref:s,type:`password`,autoComplete:`off`,spellCheck:!1,placeholder:E(u?`conns.key.replacePh`:`conns.key.pastePh`),onKeyDown:e=>{e.key===`Enter`&&(e.preventDefault(),f())}}),(0,L.jsx)(`small`,{className:`hint`,children:E(`conns.key.hint`,{where:h})})]})}function ie({c:e,api:t}){let{Secrets:n,pickFiles:r}=v,o=(0,P.useRef)(null),s=!!e.serviceAccount,u=n.is(e.serviceAccount),d=u?e.saEmail:(()=>{try{return JSON.parse(e.serviceAccount||``).client_email}catch{return s?E(`conns.sa.badFormat`):``}})(),f=async r=>{try{let i=S(r);e.project=i.project_id||e.project||``,e.saEmail=i.client_email||``,e.saProject=i.project_id||``,e.serviceAccount=n.on?await n.put(e.id,`serviceAccount`,JSON.stringify(i),[`googleapis.com`],e.saEmail):JSON.stringify(i),await t.save(),a(E(`conns.sa.saved`,{email:i.client_email}),`ok`),t.refresh()}catch(e){a(m(e),`err`)}},p=(0,P.useRef)(f);return(0,P.useLayoutEffect)(()=>{p.current=f}),(0,P.useEffect)(()=>{let e=o.current,t=()=>{e?.value.trim()&&p.current(e.value)};return e?.addEventListener(`change`,t),()=>e?.removeEventListener(`change`,t)},[]),(0,L.jsxs)(`div`,{className:`col key-field`,children:[s?(0,L.jsxs)(`div`,{className:`key-state`,children:[(0,L.jsx)(c,{name:`lock`,size:15}),(0,L.jsx)(`b`,{children:E(`conns.key.savedBadge`)}),(0,L.jsx)(`code`,{children:d||E(`conns.sa.account`)}),(0,L.jsx)(`span`,{className:`key-where`,children:Q(u)}),(0,L.jsx)(l,{label:E(`conns.sa.clear`),cls:`ghost`,onClick:async()=>{await i(E(`conns.sa.clearConfirm`),E(`conns.key.clear`),!0)&&(u&&await n.del(e.id,`serviceAccount`),e.serviceAccount=``,e.saEmail=``,e.saProject=``,await t.save(),t.refresh())}})]}):null,(0,L.jsx)(`div`,{className:`row wrap`,children:(0,L.jsx)(l,{label:E(s?`conns.sa.replaceFile`:`conns.sa.importFile`),ic:`import`,onClick:async()=>{let[e]=await r({accept:`.json,application/json`});e&&f(await e.text())}})}),(0,L.jsxs)(`label`,{className:`field`,children:[(0,L.jsx)(`span`,{className:`field-label`,children:E(`conns.sa.label`)}),(0,L.jsx)(`textarea`,{className:`inp`,ref:o,rows:3,spellCheck:!1,autoComplete:`off`,placeholder:s?E(`conns.sa.replacePh`):`{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…" }`})]}),(0,L.jsx)(`small`,{className:`hint`,children:E(`conns.sa.hint`)})]})}function ae({c:e,api:t}){let n=j(e),r=n.filter(t=>t.provider===e.provider),i=async()=>{let n=r.length+2,i={...structuredClone(e),id:b(),name:E(`conns.rot.name`,{name:e.name.replace(/ · .*$/,``),n}),apiKey:``,serviceAccount:``,project:``,fallback:e.fallback||``};for(let e of[`saEmail`,`saProject`,`sec`,`saved`,`mark`])delete i[e];await y.save(`conns`,i,!0),e.fallback=i.id,await y.save(`conns`,e,!0),a(E(`conns.rot.added`),`ok`),t.reselect(i.id)};return(0,L.jsxs)(`section`,{className:`rc-conn fx-frame`,children:[(0,L.jsx)(`h4`,{className:`fx-head`,children:(0,L.jsx)(`span`,{className:`fx-lbl kr ink`,children:E(`conns.rot.title`)})}),(0,L.jsx)(`p`,{className:`hint`,children:E(`conns.rot.desc`)}),n.length?(0,L.jsxs)(`p`,{className:`hint`,children:[(0,L.jsx)(`b`,{children:E(`conns.rot.line`)}),` `,[e,...n].map(e=>e.name).join(` → `)]}):null,(0,L.jsx)(`div`,{className:`row wrap`,children:(0,L.jsx)(l,{label:E(`conns.rot.add`),ic:`plus`,cls:`ghost`,onClick:()=>void i()})})]})}function oe({c:e,api:t}){let{Secrets:r,uid:o}=v,{PROVIDERS:f,listModels:p,streamChat:h}=C,{TEXT_PROVIDER_KINDS:g,tplList:b,instructName:x}=w,S=u(),O=(0,P.useRef)(!0),k=f[e.provider]||f.custom,[j,M]=(0,P.useState)(null),[N,F]=(0,P.useState)(k.models),[I,R]=(0,P.useState)(e.model||``),[z,B]=(0,P.useState)({text:``,cls:``}),V=d(()=>{t.save(),t.redraw()},300),H=async t=>{try{let n=await p(e);if(!n.length)throw Error(E(`conns.models.empty`));if(!O.current)return;M(n),F([...new Set([...n,...k.models])]),t||a(T(`conns.models.loaded`,n.length),`ok`)}catch(e){t||a(m(e),`err`)}};(0,P.useLayoutEffect)(()=>{!y.settings.activeConn&&k.kind!==`tts`&&(y.set({activeConn:e.id}),S()),e.provider===`vertexai`&&!e.region&&(e.region=`global`),e.instruct&&e.instruct!==`plain`&&e.instruct!==`custom`&&(e.instruct=x(e.instruct))},[]),(0,P.useEffect)(()=>(O.current=!0,k.kind!==`mock`&&k.kind!==`tts`&&(e.apiKey||e.serviceAccount||k.keyless)&&(e.baseUrl||k.base||k.kind===`vertex`)&&H(!0),()=>{O.current=!1}),[]);let U=e.id===y.settings.activeConn,W=g.includes(k.kind),G=e=>b(e).map(e=>[e.name,e.name]),K=async()=>{B({text:E(`conns.test.sending`),cls:``});try{let t=await h(e,{stream:!1,maxTokens:64},[{role:`user`,content:`Say "hello" in one word.`}]);O.current&&B({text:E(`conns.test.reply`,{text:t.text.trim()||E(`conns.test.emptyReply`)}),cls:` ok`})}catch(e){O.current&&B({text:m(e),cls:` err`})}};return(0,L.jsxs)(`div`,{className:`editor`,children:[(0,L.jsxs)(`header`,{className:`editor-head`,children:[(0,L.jsx)(`h2`,{children:e.name}),(0,L.jsxs)(`div`,{className:`row`,children:[k.kind===`tts`?(0,L.jsx)(`em`,{className:`badge`,children:E(`conns.group.voice`)}):U?(0,L.jsx)(`em`,{className:`badge on`,children:E(`conns.inUse`)}):(0,L.jsx)(l,{label:E(`conns.use`),ic:`check`,cls:`primary`,onClick:()=>{y.set({activeConn:e.id}),t.refresh()}}),(0,L.jsx)(n,{ic:`copy`,title:E(`common.duplicate`),onClick:async()=>{await y.save(`conns`,{...structuredClone(e),id:o(),name:e.name+E(`conns.copySuffix`),apiKey:r.is(e.apiKey)?``:e.apiKey,serviceAccount:r.is(e.serviceAccount)?``:e.serviceAccount},!0),(r.is(e.apiKey)||r.is(e.serviceAccount))&&a(E(`conns.copyNoKey`)),t.refresh()}}),(0,L.jsx)(n,{ic:`trash`,title:E(`common.delete`),onClick:async()=>{await i(E(`conns.deleteConfirm`,{name:e.name}),E(`common.delete`),!0)&&(await y.remove(`conns`,e.id),U&&y.set({activeConn:_()[0]?.id||``}),t.refresh())}})]})]}),(0,L.jsxs)(`div`,{className:`form`,children:[(0,L.jsxs)(`label`,{className:`field half`,children:[(0,L.jsx)(`span`,{className:`field-label`,children:E(`common.name`)}),(0,L.jsx)(`input`,{className:`inp`,defaultValue:e.name,onChange:t=>{e.name=t.target.value,V()}})]}),(0,L.jsxs)(`label`,{className:`field half`,children:[(0,L.jsx)(`span`,{className:`field-label`,children:E(`conns.provider`)}),(0,L.jsx)(`select`,{className:`inp`,defaultValue:e.provider,onChange:async n=>{e.provider=n.target.value,e.baseUrl=``,e.model=f[e.provider].kind===`mock`?`echo`:``,(!e.name||e.name===`새 연결`||e.name===E(`core.newConn`)||Object.values(f).some(t=>t.name===e.name))&&(e.name=f[e.provider].name),await t.save(),t.refresh()},children:te.map(e=>(0,L.jsx)(`optgroup`,{label:ne(e),children:Object.entries(f).filter(([,t])=>t.group===e).map(([e,t])=>(0,L.jsx)(`option`,{value:e,children:t.name},e))},e))})]})]}),k.kind===`tts`?(0,L.jsx)(D,{c:e,api:t,keyField:(0,L.jsx)($,{c:e,def:k,api:t})}):(0,L.jsxs)(L.Fragment,{children:[k.note&&(0,L.jsx)(`p`,{className:`hint`,children:k.note}),k.kind!==`mock`&&(0,L.jsx)(s,{obj:e,defs:[{k:`baseUrl`,label:E(`conns.url`),ph:k.base||k.ph||`https://…/v1`,hint:k.base?E(`conns.urlHint`):E(`conns.urlRequired`)}],onChange:V}),(0,L.jsx)($,{c:e,def:k,api:t}),k.kind===`vertex`&&(0,L.jsxs)(`div`,{className:`card sa-box`,children:[(0,L.jsx)(`h3`,{className:`form-sec`,children:E(`conns.sa.section`)}),(0,L.jsx)(`p`,{className:`hint`,children:E(`conns.sa.sectionHint`)}),(0,L.jsx)(ie,{c:e,api:t}),(0,L.jsxs)(`div`,{className:`row cf-row`,children:[(0,L.jsx)(l,{label:/\.(workers\.dev|vercel\.app|supabase\.co)\//i.test(e.baseUrl||``)?E(`conns.cf.openOn`):E(`conns.cf.open`),ic:`sparkle`,cls:`ghost`,onClick:()=>Y(e,V)}),(0,L.jsx)(`small`,{className:`hint`,children:E(`conns.cf.openHint`)})]}),(0,L.jsx)(s,{obj:e,defs:[{k:`region`,label:E(`conns.region`),type:`select`,opts:[`global`,`us-central1`,`us-east5`,`us-east4`,`us-west1`,`europe-west1`,`europe-west4`,`asia-northeast1`,`asia-northeast3`,`asia-southeast1`],half:!0},{k:`project`,label:E(`conns.project`),half:!0,ph:E(`conns.projectPh`)}],onChange:V}),(0,L.jsx)(s,{obj:e,defs:[{k:`regions`,label:E(`conns.regions`),ph:`us-central1, europe-west4, asia-northeast1`,hint:E(`conns.regionsHint`)},{el:(0,L.jsxs)(`div`,{className:`row wrap`,children:[(0,L.jsx)(l,{label:E(`conns.regionsPick`),ic:`plus`,cls:`ghost sm`,onClick:()=>{e.regions=X.filter(t=>t!==(e.region||`global`)).join(`, `),V(),S()}}),e.regions?(0,L.jsx)(l,{label:E(`conns.regionsClear`),cls:`ghost sm`,onClick:()=>{e.regions=``,V(),S()}}):null]})}],onChange:V})]}),(0,L.jsxs)(`div`,{className:`field`,children:[(0,L.jsx)(`span`,{className:`field-label`,children:E(`conns.model`)}),(0,L.jsxs)(`div`,{className:`row`,children:[(0,L.jsx)(`input`,{className:`inp`,list:`models-`+e.id,value:I,placeholder:k.kind===`azure`?E(`conns.deployName`):E(`conns.modelId`),autoComplete:`off`,spellCheck:!1,onChange:t=>{R(t.target.value),e.model=t.target.value.trim(),V()}}),(0,L.jsx)(`datalist`,{id:`models-`+e.id,children:(j||k.models).map(e=>(0,L.jsx)(`option`,{value:e},e))}),(0,L.jsx)(l,{label:E(`conns.models.load`),ic:`refresh`,cls:`ghost`,onClick:()=>void H(!1)})]}),(0,L.jsx)(`div`,{className:`model-chips`,children:N.slice(0,24).map(t=>(0,L.jsx)(`button`,{className:`chip`+(e.model===t?` on`:``),onClick:()=>{e.model=t,R(t),V()},children:t},t))})]}),k.kind!==`mock`&&(0,L.jsxs)(`details`,{className:`adv`,children:[(0,L.jsxs)(`summary`,{children:[(0,L.jsx)(c,{name:`sliders`,size:15}),E(`conns.adv.section`)]}),(0,L.jsx)(s,{obj:e,defs:[{k:`proxy`,label:E(`conns.adv.proxy`),type:`check`,hint:E(`conns.adv.proxyHint`)},{k:`via`,label:E(`conns.adv.via`),ph:`http://127.0.0.1:7890`,hint:E(`conns.adv.viaHint`)},k.kind!==`tts`&&{section:E(`conns.adv.retrySec`)},k.kind!==`tts`&&{k:`retry429`,label:E(`conns.adv.retry429`),type:`num`,min:0,max:5,step:1,half:!0,ph:`0`,nullable:!0,hint:E(`conns.adv.retry429Hint`)},k.kind!==`tts`&&{k:`retryWait`,label:E(`conns.adv.retryWait`),type:`num`,min:.5,max:30,step:.5,half:!0,ph:`2`,nullable:!0,hint:E(`conns.adv.retryWaitHint`)},k.kind!==`tts`&&{el:(0,L.jsxs)(`p`,{className:`hint retry-warn`,children:[(0,L.jsx)(`b`,{children:E(`conns.adv.retryRec`)}),` `,E(`conns.adv.retryWarn`)]})},k.kind===`anthropic`&&{k:`cache`,label:E(`conns.adv.cache`),type:`check`,hint:E(`conns.adv.cacheHint`)},(k.kind===`openai`||k.kind===`azure`)&&{k:`postProcess`,label:E(`conns.adv.postProcess`),type:`select`,opts:[[`none`,E(`common.none`)],[`merge`,E(`conns.adv.ppMerge`)],[`semi`,E(`conns.adv.ppSemi`)],[`strict`,E(`conns.adv.ppStrict`)],[`single`,E(`conns.adv.ppSingle`)]],hint:E(`conns.adv.postProcessHint`)},W&&{k:`instruct`,label:E(`conns.adv.instruct`),type:`select`,half:!0,opts:[[``,E(`conns.adv.followFormat`)],[`plain`,E(`conns.adv.instructPlain`)],[`custom`,E(`conns.adv.instructCustom`)],...G(`instruct`)],hint:E(`conns.adv.instructHint`)},W&&{k:`context`,label:E(`conns.adv.context`),type:`select`,half:!0,opts:[[``,E(`conns.adv.followFormat`)],...G(`context`)],hint:E(`conns.adv.contextHint`)},{k:`extraBody`,label:E(`conns.adv.extraBody`),type:`area`,rows:3,ph:`{ "provider": { "order": ["…"] } }`,hint:E(`conns.adv.extraBodyHint`)},{k:`extraHeaders`,label:E(`conns.adv.extraHeaders`),type:`area`,rows:2,ph:E(`conns.adv.extraHeadersPh`)}],onChange:V})]}),(0,L.jsxs)(`div`,{className:`row`,children:[(0,L.jsx)(l,{label:E(`conns.test.run`),ic:`play`,onClick:()=>void K()}),(0,L.jsx)(`div`,{className:`test-out`+z.cls,children:z.text})]}),(0,L.jsx)(A,{c:e,onSave:V}),(k.kind===`vertex`||k.kind===`google`)&&(0,L.jsx)(ae,{c:e,api:t})]})]})}function se({arg:e}){let{PROVIDERS:t}=C;return N(`reach.css`),(0,L.jsx)(o,{arg:e,title:E(`conns.title`),eyebrow:`connect`,coll:`conns`,ic:`plug`,create:()=>h(),label:e=>e.name,sub:e=>`${t[e.provider]?.name||e.provider}${e.model?` · `+e.model:``}${e.id===y.settings.activeConn?` · `+E(`conns.inUse`):``}`,empty:E(`conns.empty`),thumb:e=>(0,L.jsx)(`span`,{className:`rc-lib-mark`,children:(0,L.jsx)(M,{c:e,size:13})}),actions:[{ic:`folder`,title:E(`conns.profiles`),onclick:()=>p(`flow`,`profiles`)},{ic:`upload`,title:E(`reach.conn.export`),onclick:()=>k()},{ic:`import`,title:E(`reach.conn.import`),onclick:e=>void O(e)}],editor:(e,t)=>(0,L.jsx)(oe,{c:e,api:f(t,`conns`)})})}export{ee as page};