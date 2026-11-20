// 캐릭터 전용 꾸밈: 카드에 실린 CSS 를 소독하고 대화 화면 안으로만 가둬서, 켜 둔 대화에서만 입힌다
// 보관: 카드의 extensions.dreamland_css (드림랜드에서 쓴 것) + 제작자 노트 안의 <style> (다른 앱에서 만든 카드)
import { S } from '../lib/core';
import type { Char, Chat } from '../lib/types';
import { safeCss } from '../modules/logic';
import { cfg, hash, saveCfg } from './cfg';

export const CSS_FIELD = 'dreamland_css', MAX_CSS = 24000, SCOPE = '.chat-main';
type CssChat = Chat & { charCss?: boolean };
/** 캐릭터 꾸밈이 건드리지 못하는 변수: 앱 전체의 바탕 · 글자 · 선 · 틀 치수 */
const LOCKED = /^--(bg2?|surface\d?|text|dim|faint|panel|blur|glass|line(-\d)?|ink(-line)?|fx-[\w-]+|font(-user)?|display|safe-b|chat-w|shadow(-sm)?|handles|r(-sm|-xs)?)$/i;

/** 카드에 실린 꾸밈 원문 (소독 전) */
export function rawCss(ch: Char | null | undefined): string {
  if (!ch) return '';
  const own = typeof ch.ext?.[CSS_FIELD] === 'string' ? ch.ext[CSS_FIELD] as string : '';
  const notes = [...String(ch.creatorNotes || '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  return [own, notes].filter(s => s.trim()).join('\n').slice(0, MAX_CSS);
}
/** 선언 블록 하나를 다듬는다: !important 빼기 · fixed → absolute · 잠긴 변수 빼기 */
function cleanDecls(body: string): string {
  return body.split(';').map(d => {
    const i = d.indexOf(':'); if (i < 0) return d.trim() ? '' : d;
    const prop = d.slice(0, i).trim(); let val = d.slice(i + 1).replace(/!\s*important/gi, '').trim();
    if (!prop || LOCKED.test(prop)) return '';
    if (/^position$/i.test(prop) && /\b(fixed|sticky)\b/i.test(val)) val = 'absolute';
    if (/expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(prop + val)) return '';
    return ` ${prop}: ${val}`;
  }).filter(Boolean).join(';') + (body.trim() ? ';' : '');
}
/** 선택자 앞에 대화 화면을 붙인다. html · body · :root 는 대화 화면 자체로 읽는다 */
const scopeSel = (sel: string) => sel.split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const x = s.replace(/^(html|body|:root)\b\s*/i, '').replace(/^\.chat-main\b/, '&');
  return x.startsWith('&') ? SCOPE + x.slice(1) : x ? `${SCOPE} ${x}` : SCOPE;
}).join(', ');
/** 소독 + 범위 한정. 규칙을 하나씩 읽는다: @media 같은 묶음은 안쪽까지, @keyframes 는 그대로, 그 밖의 @규칙(글꼴 · 가져오기)은 버린다 */
export function scopeCss(input: string): string {
  const css = safeCss(String(input || '').slice(0, MAX_CSS)).replace(/@charset[^;]*;/gi, '').replace(/@namespace[^;]*;/gi, '');
  let out = '', i = 0; const stack: ('group' | 'raw' | 'rule' | 'frame')[] = [];
  while (i < css.length) {
    const open = css.indexOf('{', i), close = css.indexOf('}', i);
    if (close >= 0 && (open < 0 || close < open)) {
      const top = stack.pop(), body = css.slice(i, close);
      if (top === undefined) { i = close + 1; continue; }   // 짝 없는 닫는 괄호
      out += (top === 'rule' || top === 'frame' ? cleanDecls(body) : body) + ' }\n'; i = close + 1; continue;
    }
    if (open < 0) break;   // 닫히지 않은 꼬리는 버린다
    const head = css.slice(i, open).trim(), top = stack[stack.length - 1];
    if (top === 'rule' || top === 'frame') {   // 선언 안의 중첩 규칙은 쓰지 않는다: 그 앞의 선언만 살리고 묶음째 건너뛴다
      const pre = css.slice(i, open), cut = pre.lastIndexOf(';'); out += cleanDecls(cut >= 0 ? pre.slice(0, cut) : '');
      let d = 1, j = open + 1; for (; j < css.length && d; j++) { if (css[j] === '{') d++; else if (css[j] === '}') d--; } i = j; continue;
    }
    if (top === 'raw') { out += head + ' {'; stack.push('frame'); i = open + 1; continue; }
    if (head.startsWith('@')) {
      const kind = /^@(media|supports|container|layer)\b/i.test(head) ? 'group' : /^@(-webkit-)?keyframes\b/i.test(head) ? 'raw' : null;
      if (!kind) { let d = 1, j = open + 1; for (; j < css.length && d; j++) { if (css[j] === '{') d++; else if (css[j] === '}') d--; } i = j; continue; }
      out += head.replace(/;/g, '') + ' {\n'; stack.push(kind); i = open + 1; continue;
    }
    out += scopeSel(head.replace(/;/g, '')) + ' {'; stack.push('rule'); i = open + 1;
  }
  while (stack.pop()) out += ' }\n';
  return out.trim();
}

export const cssOn = (chat?: Chat | null) => !!(chat as CssChat | null | undefined)?.charCss;
export const fingerprint = (ch: Char) => hash(rawCss(ch));
/** 이 캐릭터의 꾸밈을 허락했는가 (꾸밈 글이 바뀌면 다시 묻는다) */
export const allowed = (ch: Char) => cfg().css.ok[ch.id] === fingerprint(ch);
export const asked = (ch: Char) => { const v = cfg().css.ok[ch.id]; return v === fingerprint(ch) || v === 'no:' + fingerprint(ch); };
export function allow(ch: Char, yes: boolean) { cfg().css.ok[ch.id] = (yes ? '' : 'no:') + fingerprint(ch); saveCfg(); }
/** 이 대화의 캐릭터 가운데 꾸밈이 실린 것 */
export const withCss = (chat?: Chat | null): Char[] => (chat?.charIds || []).map(id => S.get('chars', id)).filter((c): c is Char => !!c && !!rawCss(c).trim());

/** 지금 열린 대화에 맞춰 <style> 을 입히거나 걷는다 */
export function applyCharCss(chat?: Chat | null) {
  let el = document.getElementById('xt-charcss');
  const css = cssOn(chat) ? withCss(chat).filter(allowed).map(c => `/* ${c.name.replace(/\*\//g, '')} */\n${scopeCss(rawCss(c))}`).join('\n') : '';
  if (!css) { el?.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = 'xt-charcss'; document.head.append(el); }
  if (el.textContent !== css) el.textContent = css;
}
