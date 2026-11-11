// ── Dreamland embed: 글 → 벡터. 여러 임베딩 소스를 한 함수로 부른다 ──
// 장기기억의 임베딩 회상과 벡터 검색(지난 대화 · 로어북)이 함께 쓴다. 키는 연결에 저장된 것을 빌리고, 서버 보관 키는 core 의 fetch 가 알아서 프록시로 돌린다.
import { S } from './core.js';
import { PROVIDERS } from './engine.js';

/** 임베딩 방식. auto 는 연결의 종류를 보고 고른다 */
export const EMBED_KINDS = {
  auto: '자동 (연결을 보고 고름)',
  openai: 'OpenAI 호환 — /embeddings (OpenAI · OpenRouter · Mistral · Together · Voyage · llama.cpp · vLLM · LM Studio …)',
  google: 'Google Gemini — batchEmbedContents',
  ollama: 'Ollama — /api/embed',
  cohere: 'Cohere — /v2/embed',
};
export const EMBED_MODELS = { openai: 'text-embedding-3-small', google: 'gemini-embedding-001', ollama: 'nomic-embed-text', cohere: 'embed-multilingual-v3.0' };

const trim = u => String(u || '').trim().replace(/\/+$/, '');
export function embedKind(conn, pick = 'auto') {
  if (pick && pick !== 'auto' && EMBED_KINDS[pick]) return pick;
  const def = PROVIDERS[conn?.provider] || {}, base = trim(conn?.baseUrl || def.base).toLowerCase(), id = String(conn?.provider || '').toLowerCase();
  if (def.kind === 'google' || base.includes('generativelanguage.googleapis.com')) return 'google';
  if (id.includes('cohere') || base.includes('cohere.')) return 'cohere';
  if (id.includes('ollama') || /:11434(\/|$)/.test(base)) return 'ollama';
  return 'openai';
}
export const embedModel = (conn, kind = 'auto', model = '') => String(model || '').trim() || EMBED_MODELS[embedKind(conn, kind)];

function unit(arr) { const v = Float32Array.from(arr || []); let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; for (let k = 0; k < v.length; k++) v[k] /= n; return v; }
export function cosine(a, b) { if (!a || !b || a.length !== b.length) return 0; let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

/**
 * 글 목록 → 길이 1 로 맞춘 벡터 목록 (Float32Array). 실패하면 오류를 던진다.
 * opt: { conn | connId, model, kind, signal, timeoutMs, query(질의용이면 true — 소스가 질의/문서를 구분할 때만 쓰인다), onProgress(done, total) }
 */
export async function embedTexts(texts, opt = {}) {
  const conn = opt.conn || S.get('conns', opt.connId);
  if (!conn) throw new Error('임베딩에 쓸 연결을 골라 주세요.');
  const kind = embedKind(conn, opt.kind), model = embedModel(conn, kind, opt.model), def = PROVIDERS[conn.provider] || {};
  let base = trim(conn.baseUrl || def.base);
  if (kind === 'google') base = (base.includes('googleapis.com') ? base.replace(/\/v1(beta)?$/, '') : 'https://generativelanguage.googleapis.com') + '/v1beta';
  if (kind === 'cohere') { try { base = base.includes('cohere') ? new URL(base).origin : 'https://api.cohere.com'; } catch { base = 'https://api.cohere.com'; } }
  if (kind === 'ollama') base = base.replace(/\/v1$/, '') || 'http://127.0.0.1:11434';
  if (!base) throw new Error('임베딩에 쓸 연결의 주소가 비어 있어요.');
  const key = conn.apiKey || '', json = { 'Content-Type': 'application/json' }, bearer = key ? { Authorization: 'Bearer ' + key } : {};
  const ac = opt.timeoutMs > 0 ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), opt.timeoutMs) : 0;
  if (ac && opt.signal) opt.signal.addEventListener('abort', () => ac.abort(), { once: true });
  const signal = ac ? ac.signal : opt.signal;
  const call = async (url, headers, body) => {
    const res = conn.proxy ? await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dreamland': '1' }, body: JSON.stringify({ url, method: 'POST', headers, body }), signal })
      : await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok) throw new Error(`임베딩 API 오류 ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return res.json();
  };
  const out = [], size = kind === 'google' ? 100 : kind === 'cohere' ? 96 : 64;
  try {
    for (let i = 0; i < texts.length; i += size) {
      const part = texts.slice(i, i + size).map(t => String(t || ' ')); let vecs;
      if (kind === 'google') {
        const name = model.startsWith('models/') ? model : 'models/' + model;
        const j = await call(`${base}/${name}:batchEmbedContents`, { ...json, ...(key ? { 'x-goog-api-key': key } : {}) }, { requests: part.map(t => ({ model: name, content: { parts: [{ text: t }] }, taskType: opt.query ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' })) });
        vecs = (j.embeddings || []).map(e => e.values);
      } else if (kind === 'ollama') {
        const j = await call(`${base}/api/embed`, { ...json, ...bearer }, { model, input: part });
        vecs = j.embeddings || [];
      } else if (kind === 'cohere') {
        const j = await call(`${base}/v2/embed`, { ...json, ...bearer }, { model, texts: part, input_type: opt.query ? 'search_query' : 'search_document', embedding_types: ['float'] });
        vecs = j.embeddings?.float || (Array.isArray(j.embeddings) ? j.embeddings : []);
      } else {
        const j = await call(`${base}/embeddings`, { ...json, ...bearer }, { model, input: part });
        vecs = [...(j.data || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(d => d.embedding);
      }
      if (vecs.length !== part.length) throw new Error('임베딩 응답의 개수가 맞지 않아요.');
      for (const v of vecs) out.push(unit(v));
      opt.onProgress?.(Math.min(i + size, texts.length), texts.length);
    }
  } finally { if (timer) clearTimeout(timer); }
  return out;
}
