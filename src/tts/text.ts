// ── 읽어 주기: 읽을 글 다듬기 · 문장 나누기 ──
// 코드 · 주소 · 마크업 · 상태 칸은 읽지 않는다. *행동* 은 설정에 따라 읽거나 건너뛴다.

/** 소리 내어 읽을 글만 남긴다 */
export function cleanForSpeech(src: string, readActions: boolean): string {
  let s = String(src || '')
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')                                   // 코드 묶음 (상태 칸도 흔히 여기에 든다)
    .replace(/<(think|thinking|details|style|script|status|hud|statusblock|info)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>\n]+>/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]\n]+)\]\((?:[^)\s]+)\)/g, '$1')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1');
  s = readActions ? s.replace(/\*([^*]+)\*/g, '$1') : s.replace(/\*[^*]*\*/g, ' ');
  s = s.replace(/^\s*\[[^\]\n]{0,300}\]\s*$/gm, ' ')                         // [상태: …] 같은 한 줄 칸
    .replace(/^\s{0,3}(?:#{1,6}\s|>+\s?|[-+]\s|\d+\.\s)/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')                                        // 표
    .replace(/^\s*[-=_*]{3,}\s*$/gm, ' ')
    .replace(/[*_~#|<>{}\\]/g, ' ')
    .replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  return s;
}

const END = /[.!?…。！？]/;
const CLOSE = /["'”’」』)\]〉》]/;

/**
 * 버퍼에서 끝난 문장들을 떼어 낸다. force 면 남은 것까지.
 * *행동* · ``` 코드 ``` 가 열린 채로는 자르지 않는다 (너무 길어지면 자른다).
 */
export function takeSentences(buf: string, force: boolean): { parts: string[]; rest: string } {
  const parts: string[] = [];
  let start = 0, fence = false, star = false, lastCut = -1;
  const cuts: number[] = [];
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === '`' && buf.startsWith('```', i)) { fence = !fence; i += 2; continue; }
    if (fence) continue;
    if (c === '*') { if (buf[i + 1] === '*') { i++; continue; } star = !star; continue; }
    let end = -1;
    if (c === '\n') end = i + 1;
    else if (END.test(c)) {
      let j = i + 1; while (j < buf.length && (END.test(buf[j]) || CLOSE.test(buf[j]))) j++;
      if (j >= buf.length) { if (force) end = j; else break; }   // 뒤가 아직 안 왔다
      else if (/\s/.test(buf[j]) || /[。！？…]/.test(c)) end = j;
      if (end > 0) i = end - 1;
    }
    if (end > 0) { if (!star) cuts.push(end); else if (end - start > 600) cuts.push(end); lastCut = end; }
  }
  void lastCut;
  for (const e of cuts) { const p = buf.slice(start, e); if (p.trim()) parts.push(p); start = e; }
  let rest = buf.slice(start);
  if (force && rest.trim()) { parts.push(rest); rest = ''; }
  // 아주 짧은 조각은 다음 조각과 붙인다 (같은 묶음 안에서만)
  const out: string[] = [];
  for (const p of parts) { const prev = out[out.length - 1]; if (prev !== undefined && prev.trim().length < 10 && !prev.endsWith('\n')) out[out.length - 1] = prev + p; else out.push(p); }
  return { parts: out, rest };
}

/** 글에서 언어를 짐작한다 (브라우저 음성 · 언어 코드가 필요한 공급자용) */
export const guessLang = (text: string) => /[가-힣]/.test(text) ? 'ko-KR' : /[ぁ-ゟ゠-ヿ]/.test(text) ? 'ja-JP' : /[一-鿿]/.test(text) ? 'zh-CN' : 'en-US';
