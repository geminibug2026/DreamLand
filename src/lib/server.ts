// 드림랜드 서버(server.js)와 주고받는 길은 모두 이 파일을 지난다.
// 앱의 다른 곳은 '/api/...' 주소를 직접 쓰지 않고 Server.* 를 부른다.
// 서버가 없는 곳(아이폰 앱 등)을 지원할 때는 여기 구현만 갈아 끼우면 된다.
//
// 주의: 이 파일은 아무것도 import 하지 않는다 (core.ts 의 fetch 감싸개보다 먼저 읽혀도 되게).
// fetch 는 부를 때마다 window.fetch 를 쓴다. core.ts 의 감싸개는 '/api/' 주소를 손대지 않고 그대로 넘긴다.

/** 서버의 POST 요청에 붙이는 머리글. x-dreamland 가 없으면 서버가 거절한다 (다른 사이트가 부르지 못하게) */
export const SERVER_HEADERS: Readonly<Record<string, string>> = { 'Content-Type': 'application/json', 'x-dreamland': '1' };

const API = '/api/';

/** 서버를 거쳐 다른 주소로 보내는 요청 (/api/proxy) */
export interface ProxyReq { url: string; method?: string; headers?: Record<string, string>; body?: unknown }

export const Server = {
  /** 'store/status' → '/api/store/status'. 링크·sendBeacon 처럼 fetch 가 아닌 곳에서 쓴다 */
  url: (path: string) => API + path,
  /** 서버 주소인지 (core.ts 의 fetch 감싸개가 건너뛸 것) */
  isApi: (input: string) => input.startsWith(API),
  /** 메시지 속 HTML 화면을 그리는 빈 틀 (sandbox iframe 의 src) */
  frameUrl: '/frame',

  /** 서버로 가는 모든 요청의 마지막 관문 */
  fetch: (path: string, init?: RequestInit) => fetch(API + path, init),
  get: (path: string, init?: RequestInit) => Server.fetch(path, init),
  /** JSON 을 보낸다 (x-dreamland 머리글을 붙여서) */
  post: (path: string, body: unknown, init: RequestInit = {}) =>
    Server.fetch(path, { ...init, method: 'POST', headers: { ...SERVER_HEADERS }, body: JSON.stringify(body) }),
  /** 창을 닫을 때 보내는 것 (머리글을 달 수 없다 — 서버는 같은 출처인지로 확인한다) */
  beacon: (path: string, data: BodyInit) => navigator.sendBeacon(API + path, data),

  /** 서버를 거쳐 req.url 로 보낸다. 응답은 대상 서버의 것이 그대로 흘러온다 (스트리밍 포함) */
  proxy: (req: ProxyReq, signal?: AbortSignal | null) => Server.post('proxy', req, { signal }),
  /** 서버를 실행한 터미널에 한 줄 남긴다 (실패해도 조용히 넘어간다) */
  log: (body: { kind: string; line: string; prompt?: string; out?: string }) => { void Server.post('log', body).catch(() => { }); },
};
