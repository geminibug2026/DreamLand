// 영상 컷: 스토리보드의 그림 한 장을 내 컴퓨터의 ComfyUI(LTX 등 그림→영상 워크플로)에 보내 짧은 영상으로 만든다.
// 워크플로는 ComfyUI 에서 "API 형식으로 내보낸" JSON 을 붙여 넣고, 값이 들어갈 자리에 아래 표시를 적어 둔다:
//   %prompt% 움직임 묘사 · %reference_image_name% 올린 그림의 이름 · %duration_seconds% 길이(초) · %length% 길이(프레임)
//   %fps% · %width% · %height% · %seed% · %model%
import { DB, S, now, uid } from '../lib/core';
import { Server } from '../lib/server';
import { quickCall } from '../lib/engine';

export interface VideoCfg { url: string; workflow: string; seconds: number; fps: number; width: number; height: number; model: string; plan: boolean }
const DEFAULTS: VideoCfg = { url: 'http://127.0.0.1:8188', workflow: '', seconds: 4, fps: 16, width: 768, height: 512, model: '', plan: true };
export function videoCfg(): VideoCfg {
  const st = S.settings as unknown as { gameVideo?: Partial<VideoCfg> }, c = (st.gameVideo ||= {}) as VideoCfg;
  for (const k of Object.keys(DEFAULTS) as (keyof VideoCfg)[]) if (c[k] === undefined || c[k] === null) (c as unknown as Record<string, unknown>)[k] = DEFAULTS[k];
  return c;
}
export interface Clip { id: string; owner: string; kind: 'gamevid'; label: string; data: string; ts: number }
const clips = new Map<string, Clip[]>();
export async function loadClips(chatId: string): Promise<Clip[]> {
  if (!clips.has(chatId)) clips.set(chatId, ((await DB.byOwner('chat:' + chatId)) as unknown as Clip[]).filter(a => a.kind === 'gamevid'));
  return clips.get(chatId)!;
}
export const clipFor = (chatId: string, label: string) => (clips.get(chatId) || []).find(c => c.label === label)?.data || '';

const base = () => videoCfg().url.trim().replace(/\/+$/, '');
const call = (path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown; bodyB64?: string } = {}, signal?: AbortSignal) => Server.proxy({ url: base() + path, method: init.method || 'GET', headers: init.headers, body: init.body, bodyB64: init.bodyB64 }, signal);
const toB64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
/** 그림을 PNG 로 바꿔 바이트로 (어떤 형식의 삽화든 ComfyUI 가 읽을 수 있게) */
const toPng = (src: string) => new Promise<Uint8Array>((ok, no) => {
  const im = new Image();
  im.onload = () => { try { const cv = document.createElement('canvas'); cv.width = im.naturalWidth || 768; cv.height = im.naturalHeight || 512; cv.getContext('2d')!.drawImage(im, 0, 0, cv.width, cv.height); const bin = atob(cv.toDataURL('image/png').split(',')[1]), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); ok(out); } catch (e) { no(e); } };
  im.onerror = () => no(new Error('image')); im.src = src;
});
const blobToDataUrl = (b: Blob) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(b); });
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((ok, no) => { const tm = setTimeout(ok, ms); signal?.addEventListener('abort', () => { clearTimeout(tm); no(new DOMException('Aborted', 'AbortError')); }, { once: true }); });

/** ComfyUI 가 켜져 있고 닿는지 */
export async function pingVideo(): Promise<boolean> { try { return (await call('/system_stats')).ok; } catch { return false; } }

/** 워크플로의 자리 표시를 채운다. 따옴표로 감싼 숫자 자리("%length%")는 숫자로, 글 속의 자리는 글자 그대로 넣는다 */
export function fillWorkflow(text: string, v: Record<string, string | number>): string {
  let out = text;
  for (const [k, val] of Object.entries(v)) {
    const tag = `%${k}%`;
    if (typeof val === 'number') out = out.split(`"${tag}"`).join(String(val)).split(tag).join(String(val));
    else { const esc = JSON.stringify(val).slice(1, -1); out = out.split(tag).join(esc); }
  }
  return out;
}

const PLAN = `You write image-to-video prompts. Given what happens in a story moment and a description of the still image, write ONE English paragraph (50–80 words) describing how the still should come alive as a short clip: what the subject does, small natural motion (hair, cloth, breath, light, weather), and one gentle camera move. Keep the composition and the characters as they are. No dialogue, no text on screen, no scene cuts. Output only the paragraph.`;

export interface ClipJob { chatId: string; label: string; image: string; caption: string; scene?: string }
/** 한 컷을 영상으로 만든다. 단계가 바뀔 때마다 알려 주고, 끝나면 저장한 영상을 돌려준다 */
export async function makeClip(job: ClipJob, onStep: (step: 'plan' | 'upload' | 'queue' | 'render' | 'fetch') => void, signal?: AbortSignal): Promise<Clip> {
  const c = videoCfg(); if (!c.workflow.trim()) throw new Error('NO_WORKFLOW');
  let prompt = [job.scene, job.caption].filter(Boolean).join('. ');
  if (c.plan) { onStep('plan'); try { const p = (await quickCall(PLAN, `Story moment: ${job.caption}\nStill image: ${job.scene || '(no description)'}`, { maxTokens: 400, lowThink: true, signal })).trim(); if (p) prompt = p; } catch (e) { if ((e as Error).name === 'AbortError') throw e; } }
  // 그림을 ComfyUI 에 올린다
  onStep('upload');
  const bytes = await toPng(job.image), name = `dreamland_${uid()}.png`, bd = '----dl' + uid(), enc = new TextEncoder();
  const head = enc.encode(`--${bd}\r\nContent-Disposition: form-data; name="image"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`), tail = enc.encode(`\r\n--${bd}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--${bd}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length); body.set(head); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  const up = await call('/upload/image', { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${bd}` }, bodyB64: toB64(body) }, signal);
  if (!up.ok) throw new Error(`upload ${up.status}`);
  const ref = await up.json() as { name?: string; subfolder?: string }, refName = ref.subfolder ? `${ref.subfolder}/${ref.name}` : ref.name || name;
  // 워크플로를 채워 맡긴다
  onStep('queue');
  const filled = fillWorkflow(c.workflow, { prompt, reference_image_name: refName, duration_seconds: c.seconds, length: Math.round(c.seconds * c.fps) + 1, fps: c.fps, width: c.width, height: c.height, seed: Math.floor(Math.random() * 2147483647), model: c.model });
  let graph: unknown; try { graph = JSON.parse(filled); } catch { throw new Error('BAD_WORKFLOW'); }
  const q = await call('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { prompt: graph, client_id: 'dreamland' } }, signal);
  const qj = await q.json().catch(() => ({})) as { prompt_id?: string; error?: { message?: string }; node_errors?: Record<string, unknown> };
  if (!q.ok || !qj.prompt_id) throw new Error(qj.error?.message || (qj.node_errors && Object.keys(qj.node_errors).length ? 'node errors: ' + JSON.stringify(qj.node_errors).slice(0, 300) : `queue ${q.status}`));
  // 끝날 때까지 기다린다 (길어도 20분)
  onStep('render');
  type Out = { filename: string; subfolder?: string; type?: string };
  let file = null as Out | null;
  for (let i = 0; i < 600 && !file; i++) {
    await wait(2000, signal);
    const h = await call('/history/' + qj.prompt_id, {}, signal); if (!h.ok) continue;
    const item = (await h.json() as Record<string, { outputs?: Record<string, Record<string, unknown>>; status?: { status_str?: string; completed?: boolean } }>)[qj.prompt_id]; if (!item) continue;
    if (item.status?.status_str === 'error') throw new Error('ComfyUI: render failed');
    const all = Object.values(item.outputs || {}).flatMap(o => Object.values(o).flatMap(v => Array.isArray(v) ? v as { filename?: string; subfolder?: string; type?: string }[] : [])).filter(f => f && typeof f.filename === 'string');
    file = (all.find(f => /\.(mp4|webm|mov)$/i.test(f.filename!)) || all.find(f => /\.(gif|webp)$/i.test(f.filename!)) || null) as Out | null;
    if (!file && item.status?.completed) throw new Error('NO_VIDEO_OUTPUT');
  }
  if (!file) throw new Error('timeout');
  onStep('fetch');
  const v = await call(`/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder || '')}&type=${encodeURIComponent(file.type || 'output')}`, {}, signal);
  if (!v.ok) throw new Error(`view ${v.status}`);
  const blob = await v.blob(), mime = /\.webm$/i.test(file.filename) ? 'video/webm' : /\.(gif)$/i.test(file.filename) ? 'image/gif' : /\.webp$/i.test(file.filename) ? 'image/webp' : 'video/mp4';
  const data = await blobToDataUrl(new Blob([await blob.arrayBuffer()], { type: mime }));
  const list = await loadClips(job.chatId), old = list.find(x => x.label === job.label);
  const rec: Clip = { id: old?.id || uid(), owner: 'chat:' + job.chatId, kind: 'gamevid', label: job.label, data, ts: now() };
  await DB.put('assets', rec as never); if (old) list[list.indexOf(old)] = rec; else list.push(rec);
  return rec;
}
export async function removeClip(chatId: string, label: string) { const list = await loadClips(chatId), c = list.find(x => x.label === label); if (c) { await DB.del('assets', c.id); list.splice(list.indexOf(c), 1); } }
