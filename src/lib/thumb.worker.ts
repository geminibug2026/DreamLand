// 큰 초상(카드 PNG 통째인 경우가 많다)을 목록용 작은 그림으로 줄인다. 화면(메인 스레드) 밖에서 풀고 · 줄이고 · 다시 묶는다
interface Job { n: number; src: string; px: number }
self.onmessage = async (e: MessageEvent<Job>) => {
  const { n, src, px } = e.data;
  try {
    const at = src.indexOf(','), head = src.slice(5, at);
    if (!/;base64$/i.test(head)) return postMessage({ n, skip: true });
    const bin = atob(src.slice(at + 1)), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([u], { type: head.split(';')[0] || 'image/png' }));
    const { width: w, height: h } = bmp;
    if (w <= px * 1.25) { bmp.close(); return postMessage({ n, skip: true }); }   // 이미 작다: 원본 그대로
    const tw = px, th = Math.max(1, Math.round(h * px / w)), c = new OffscreenCanvas(tw, th), g = c.getContext('2d');
    if (!g) { bmp.close(); return postMessage({ n, skip: true }); }
    g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, tw, th); bmp.close();
    let out = await c.convertToBlob({ type: 'image/webp', quality: 0.86 });
    if (out.type !== 'image/webp') out = await c.convertToBlob({ type: 'image/jpeg', quality: 0.88 });   // webp 를 못 만드는 브라우저
    postMessage({ n, blob: out });
  } catch (err) { postMessage({ n, error: String(err) }); }
};
