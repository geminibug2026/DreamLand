// 화면에 넣을 스크립트의 문법만 살핀다. 앱 화면은 보안 정책 때문에 글로 된 코드를 풀어 볼 수 없으므로,
// 메시지 화면과 같은 격리된 틀(앱 저장소 · 키에 닿지 못하는 곳)에 넣어 "읽히는지"만 묻는다. 코드는 실행하지 않는다 (new Function 은 읽기만 한다)
import { Server } from '../lib/server';

/** 코드마다: 문법이 맞으면 null, 틀리면 까닭. 틀을 못 띄우거나 답이 늦으면 모두 null (점검을 건너뛴다).
 *  mod: 모듈 코드를 import · export 를 걷어 낸 몸으로 받는다 — 맨 위의 await 도 읽히게 async 함수로 읽는다 */
export function syntaxOf(codes: string[], wait = 2500, mod = false): Promise<(string | null)[]> {
  const none = codes.map(() => null);
  if (!codes.length || typeof document === 'undefined') return Promise.resolve(none);
  return new Promise(resolve => {
    const f = document.createElement('iframe'), key = 'dlsx' + Math.random().toString(36).slice(2);
    f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    let done = false;
    const end = (v: (string | null)[]) => { if (done) return; done = true; clearTimeout(timer); removeEventListener('message', on); f.remove(); resolve(v); };
    const timer = setTimeout(() => end(none), wait);
    const page = `<body><script>(function(){var c=${JSON.stringify(codes).replace(/</g, '\\u003c')},F=${mod ? 'Object.getPrototypeOf(async function(){}).constructor' : 'Function'},r=[];for(var i=0;i<c.length;i++){try{new F(c[i]);r.push(null);}catch(e){r.push(String(e&&e.message||e));}}parent.postMessage({${key}:r},"*");})();</script></body>`;
    function on(e: MessageEvent) {
      if (e.source !== f.contentWindow || !e.data) return;
      const d = e.data as Record<string, unknown>;
      if (d.dlFrameReady != null) f.contentWindow?.postMessage({ dlHtml: page, init: {} }, '*');
      else if (Array.isArray(d[key])) end((d[key] as unknown[]).map(x => typeof x === 'string' ? x : null));
    }
    addEventListener('message', on);
    f.src = Server.frameUrl; document.body.append(f);
  });
}
