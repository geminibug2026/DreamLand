// 문서 파일에서 글만 꺼낸다 (자료실에 넣을 때). DOCX · ODT · EPUB 는 ZIP 안의 XML/XHTML, HTML 은 태그를 걷어 낸다.
// PDF 는 글이 압축 · 글꼴 표로 들어 있어 여기서는 다루지 않는다 (글로 바꿔서 넣는다).
import { unzip } from './assets';

const dec = (u: Uint8Array) => new TextDecoder().decode(u);
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unent = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m);
/** HTML/XHTML → 글: 스크립트 · 스타일을 버리고, 문단 · 줄바꿈 태그는 줄바꿈으로 */
export function htmlToText(html: string): string {
  return unent(html.replace(/<(script|style|head|svg)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
/** 글로 읽을 수 있는 확장자 (자료실 파일 고르기) */
export const DOC_ACCEPT = '.txt,.md,.json,.csv,.html,.htm,.log,.docx,.odt,.epub,.xml,.yaml,.yml';
/** 파일 하나를 글로. 모르는 형식은 그냥 글로 읽는다 */
export async function fileToText(f: File): Promise<string> {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (ext === 'docx') {   // 문단 <w:p> · 글 <w:t> · 탭 · 줄바꿈
    const doc = (await unzip(await f.arrayBuffer())).find(x => x.name === 'word/document.xml'); if (!doc) throw new Error('word/document.xml not found');
    return unent(dec(doc.data).replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
  }
  if (ext === 'odt') {
    const doc = (await unzip(await f.arrayBuffer())).find(x => x.name === 'content.xml'); if (!doc) throw new Error('content.xml not found');
    return unent(dec(doc.data).replace(/<text:line-break\/>/g, '\n').replace(/<text:tab\/>/g, '\t').replace(/<\/text:(p|h)>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
  }
  if (ext === 'epub') {   // 책의 차례(spine) 순서대로 본문을 잇는다. 차례를 못 읽으면 파일 이름 순서
    const files = await unzip(await f.arrayBuffer()), byName = new Map(files.map(x => [x.name, x]));
    const opfPath = (dec(byName.get('META-INF/container.xml')?.data || new Uint8Array()).match(/full-path="([^"]+)"/) || [])[1];
    let order: string[] = [];
    if (opfPath && byName.has(opfPath)) {
      const opf = dec(byName.get(opfPath)!.data), base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '', href = new Map<string, string>();
      for (const m of opf.matchAll(/<item\b[^>]*>/g)) { const id = (m[0].match(/\bid="([^"]+)"/) || [])[1], h = (m[0].match(/\bhref="([^"]+)"/) || [])[1]; if (id && h) href.set(id, base + decodeURIComponent(h)); }
      order = [...opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)].map(m => href.get(m[1]) || '').filter(n => byName.has(n));
    }
    if (!order.length) order = files.map(x => x.name).filter(n => /\.x?html?$/i.test(n)).sort();
    return order.map(n => htmlToText(dec(byName.get(n)!.data))).filter(Boolean).join('\n\n');
  }
  const text = await f.text();
  return ext === 'html' || ext === 'htm' ? htmlToText(text) : text;
}
