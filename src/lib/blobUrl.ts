// 긴 data: 그림(캐릭터 초상 등)을 화면에 걸 때는 짧은 blob: 주소로 바꿔 건다.
// 같은 그림을 수십 장 그리거나 다시 그릴 때마다 수 MB 글자를 스타일 · 속성에 다시 풀지 않게. 한 번 바꾼 것은 기억한다
const memo = new Map<string, string>();
const MIN = 4096;   // 짧은 것은 그대로

export function dataToBlob(d: string): Blob | null {
  if (!d.startsWith('data:')) return null;
  try {
    const at = d.indexOf(','), head = d.slice(5, at), b64 = /;base64$/i.test(head), body = d.slice(at + 1);
    const bin = b64 ? atob(body) : decodeURIComponent(body), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: head.split(';')[0] || 'image/png' });
  } catch { return null; }
}
/** 화면에 걸 주소 */
export function shownUrl(src?: string | null): string {
  if (!src || src.length < MIN || !src.startsWith('data:')) return src || '';
  let u = memo.get(src); if (u) return u;
  const b = dataToBlob(src); u = b ? URL.createObjectURL(b) : src;
  memo.set(src, u);
  if (memo.size > 400) { const [k, v] = memo.entries().next().value as [string, string]; memo.delete(k); if (v.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(v), 60000); }
  return u;
}
