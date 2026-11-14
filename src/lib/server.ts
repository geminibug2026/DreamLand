// 드림랜드 서버(server.js)와 주고받는 길은 모두 이 파일을 지난다.
// 앱의 다른 곳은 '/api/...' 주소를 직접 쓰지 않고 Server.* 를 부른다.
// 서버가 없는 곳(아이폰 앱 등)을 지원할 때는 여기 구현만 갈아 끼우면 된다.
//
// 주의: 이 파일은 아무것도 import 하지 않는다 (core.ts 의 fetch 감싸개보다 먼저 읽혀도 되게).
// fetch 는 부를 때마다 window.fetch 를 쓴다. core.ts 의 감싸개는 '/api/' 주소를 손대지 않고 그대로 넘긴다.

/** 서버의 POST 요청에 붙이는 머리글. x-dreamland 가 없으면 서버가 거절한다 (다른 사이트가 부르지 못하게) */
export const SERVER_HEADERS: Readonly<Record<string, string>> = { 'Content-Type': 'application/json', 'x-dreamland': '1' };

const API = '/api/';

/** 서버 없이 올린 웹 버전 (npm run build:web — GitHub Pages 등). 아이폰처럼 서버를 돌릴 수 없는 곳에서 주소만 열어 쓴다 */
const WEB = import.meta.env.MODE === 'web';
/** 아이폰 앱(ios-app/, Capacitor) 안인지. 앱은 웹 버전을 그대로 담고, 화면이 못 하는 일(파일 저장 · 브라우저가 막는 연결)만 기기 기능을 빌린다 */
interface NativeBridge { isNativePlatform?: () => boolean; nativePromise?: (plugin: string, method: string, opts: unknown) => Promise<unknown> }
const bridge = (): NativeBridge | undefined => (window as unknown as { Capacitor?: NativeBridge }).Capacitor;
const APP = WEB && typeof window !== 'undefined' && !!bridge()?.isNativePlatform?.();
const native = <T,>(plugin: string, method: string, opts: unknown) => {
  const b = bridge(); if (!b?.nativePromise) return Promise.reject(new Error('native bridge missing'));
  return b.nativePromise(plugin, method, opts) as Promise<T>;
};
const b64ToBytes = (s: string) => { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const blobToB64 = (blob: Blob) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
/** 앱: 기기의 연결 기능으로 보낸다 (브라우저의 다른 출처 제한을 받지 않는다). 응답은 다 받은 뒤 한 번에 온다 — 한 글자씩 흘러오지는 않는다 */
async function appProxy(req: ProxyReq, signal?: AbortSignal | null): Promise<Response> {
  const aborted = () => new DOMException('Aborted', 'AbortError');
  if (signal?.aborted) throw aborted();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers || {})) headers[k.toLowerCase() === 'content-type' ? 'Content-Type' : k] = v;
  const data = req.body == null ? undefined : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  if (data != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const r = await native<{ status: number; data?: unknown; headers?: Record<string, string> }>('CapacitorHttp', 'request', { url: req.url, method: req.method || 'POST', headers, data, responseType: 'arraybuffer' });
  if (signal?.aborted) throw aborted();
  const type = Object.entries(r.headers || {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || 'application/octet-stream';
  // JSON 응답은 기기 쪽에서 미리 풀어 주는 일이 있다 — 그때는 다시 글로 만든다
  const body = r.data == null ? null : /application\/json/i.test(type) ? (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)) : typeof r.data === 'string' ? b64ToBytes(r.data) : JSON.stringify(r.data);
  const status = r.status >= 200 && r.status <= 599 ? r.status : 502;
  return new Response([204, 205, 304].includes(status) ? null : body, { status, headers: { 'Content-Type': type } });
}
/** 앱: 파일을 임시 폴더에 쓴 뒤 공유 창을 띄운다 ("파일에 저장" 등). 화면 안에서는 내려받기가 되지 않기 때문 */
async function appSave(name: string, blob: Blob) {
  const path = name.replace(/[\\/:*?"<>|]+/g, '_');
  const { uri } = await native<{ uri: string }>('Filesystem', 'writeFile', { path, data: await blobToB64(blob), directory: 'CACHE' });
  await native('Share', 'share', { files: [uri] }).catch(() => { /* 공유 창을 그냥 닫은 경우 */ });
}
const rawFetch =(input: string, init?: RequestInit) => (window.__dlFetch || fetch)(input, init);
const noServer = () => new Response('{"error":"no server"}', { status: 503, headers: { 'Content-Type': 'text/plain' } });
/** 웹 버전에서 서버 대신 답한다: 함께 올린 확장 목록만 읽어 주고, 나머지는 "서버 없음" */
async function webFetch(path: string): Promise<Response> {
  if (path !== 'extensions') return noServer();
  try {
    const list = await (await rawFetch('extensions/index.json', { cache: 'no-cache' })).json() as { entry?: string; css?: string }[];
    const abs = (u?: string) => u ? new URL(u, document.baseURI).href : '';
    return new Response(JSON.stringify(list.map(x => ({ ...x, entry: abs(x.entry), css: abs(x.css) }))), { headers: { 'Content-Type': 'application/json' } });
  } catch { return noServer(); }
}

/** 서버를 거쳐 다른 주소로 보내는 요청 (/api/proxy) */
export interface ProxyReq { url: string; method?: string; headers?: Record<string, string>; body?: unknown }

export const Server = {
  /** 'store/status' → '/api/store/status'. 링크·sendBeacon 처럼 fetch 가 아닌 곳에서 쓴다 */
  url: (path: string) => API + path,
  /** 서버 주소인지 (core.ts 의 fetch 감싸개가 건너뛸 것) */
  isApi: (input: string) => input.startsWith(API),
  /** 메시지 속 HTML 화면을 그리는 빈 틀 (sandbox iframe 의 src) */
  frameUrl: WEB ? 'vendor/frame.html' : '/frame',
  /** 서버 없이 도는 웹 버전인지 */
  web: WEB,
  /** 아이폰 앱 안인지 */
  app: APP,
  /** 앱에서 파일을 내보낸다 (공유 창) */
  saveFile: (name: string, blob: Blob) => appSave(name, blob),

  /** 서버로 가는 모든 요청의 마지막 관문 */
  fetch: (path: string, init?: RequestInit) => WEB ? webFetch(path) : fetch(API + path, init),
  get: (path: string, init?: RequestInit) => Server.fetch(path, init),
  /** JSON 을 보낸다 (x-dreamland 머리글을 붙여서) */
  post: (path: string, body: unknown, init: RequestInit = {}) =>
    Server.fetch(path, { ...init, method: 'POST', headers: { ...SERVER_HEADERS }, body: JSON.stringify(body) }),
  /** 창을 닫을 때 보내는 것 (머리글을 달 수 없다 — 서버는 같은 출처인지로 확인한다) */
  beacon: (path: string, data: BodyInit) => WEB ? false : navigator.sendBeacon(API + path, data),

  /** 서버를 거쳐 req.url 로 보낸다. 응답은 대상 서버의 것이 그대로 흘러온다 (스트리밍 포함) */
  proxy: (req: ProxyReq, signal?: AbortSignal | null): Promise<Response> => APP ? appProxy(req, signal) : WEB
    // 웹 버전: 거칠 서버가 없으니 바로 보낸다
    ? rawFetch(req.url, { method: req.method || 'POST', headers: req.headers, body: req.body == null ? undefined : typeof req.body === 'string' ? req.body : JSON.stringify(req.body), signal })
    : Server.post('proxy', req, { signal }),
  /** 서버를 실행한 터미널에 한 줄 남긴다 (실패해도 조용히 넘어간다) */
  log: (body: { kind: string; line: string; [k: string]: unknown }) => { if (WEB) return; void Server.post('log', body).catch(() => { }); },
};
