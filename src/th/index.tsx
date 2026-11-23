// 실리태번 Tavern Helper 함수의 앱 쪽 (vendor/th-shim.js 의 짝). 스크립트 · 화면이 처음 부를 때만 불러온다.
// - 사용자가 허락해 켠 스크립트(숨은 화면, 같은 출처)는 window.__dlTH.call 로 바로 부른다 (실리태번처럼 동기 함수도 바로 답한다)
// - 메시지 속 화면(격리됨)은 postMessage 로 부르고, 동기 함수는 앱이 보내 둔 사본으로 답한다 (heavy · frameBridge 의 thMeta)
import { S } from '../lib/core';
import { cur } from '../chat/store';
import { openModal, promptBox, confirmBox } from '../ui';
import { sanitize } from '../lib/format';
import { t } from '../i18n';
import { world } from './world';
import { preset, presetToTh } from './preset';
import { regex } from './regex';
import { chars, cardData } from './chars';
import { gen } from './gen';
import { misc, audioState } from './misc';
import { type Ctx, curChar, str } from './util';

type F = (c: Ctx, ...a: unknown[]) => unknown;
export const API: Record<string, F> = { ...world, ...preset, ...regex, ...chars, ...gen, ...misc };
/** 메시지 속 화면에는 열지 않는 것: 스크립트 코드를 바꾸는 것 (격리된 화면이 허락받은 스크립트 자리에 코드를 넣지 못하게) · 앱 밖 주소로 모델 목록을 묻는 것 */
const SCRIPT_ONLY = new Set(['replaceScriptTrees', 'getModelList']);

function ctxOf(f: HTMLIFrameElement | null): Ctx {
  const id = f?.dataset.script || null;
  let msgId = cur.msgs.length - 1;
  const mid = f?.closest<HTMLElement>('[data-id]')?.dataset.id; if (mid) { const i = cur.msgs.findIndex(m => m.id === mid); if (i >= 0) msgId = i; }
  return { f, script: id, msgId };
}
export function run(c: Ctx, name: string, args: unknown[]): unknown {
  const fn = Object.prototype.hasOwnProperty.call(API, name) ? API[name] : undefined;
  if (!fn) throw new Error(t('th.err.unsupported', { name }));
  if (!c.script && SCRIPT_ONLY.has(name)) throw new Error(t('th.err.scriptOnly', { name }));
  return fn(c, ...(Array.isArray(args) ? args : []));
}
/** 메시지 속 화면이 부른 것 (frameBridge 가 넘긴다) */
export const fromFrame = (f: HTMLIFrameElement, name: string, args: unknown[]) => run(ctxOf(f), name, args);

/** 실리태번 알림 창 (SillyTavern.callGenericPopup): 1 글 · 2 확인 · 3 입력. 스크립트 화면이 넘긴 요소는 그대로 넣는다 */
export async function popup(content: unknown, type: unknown, value?: unknown, opt?: unknown): Promise<unknown> {
  const ty = Number(type) || 1, o = (opt && typeof opt === 'object' ? opt : {}) as { okButton?: unknown; cancelButton?: unknown };
  const asText = typeof content === 'string' ? content : '';
  if (ty === 3) { const r = await promptBox(asText.replace(/<[^>]+>/g, ' ').trim() || t('th.popup.input'), str(value ?? '')); return r === null ? null : r; }
  if (ty === 2 && typeof content === 'string' && !/<[a-z]/i.test(content)) return (await confirmBox(content, typeof o.okButton === 'string' ? o.okButton : t('common.ok'))) ? 1 : 0;
  return new Promise(res => {
    let v: number | null = ty === 2 ? 0 : 1;
    const holder = document.createElement('div');
    if (content instanceof Node || (content && typeof (content as Node).nodeType === 'number')) holder.append(content as Node);
    else holder.innerHTML = sanitize(asText);
    const m = openModal({
      title: '', body: <div ref={el => { if (el && !el.contains(holder)) el.append(holder); }} />, onClose: () => res(v),
      actions: ty === 2 ? [{ label: typeof o.cancelButton === 'string' ? o.cancelButton : t('common.cancel'), onclick: () => { v = 0; } }, { label: typeof o.okButton === 'string' ? o.okButton : t('common.ok'), cls: 'primary', onclick: () => { v = 1; } }] : [{ label: t('common.ok'), cls: 'primary', onclick: () => { v = 1; } }],
    });
    m.el.classList.add('dialog');
  });
}

/** 메시지 속 화면이 동기 함수로 읽는 무거운 사본: 화면 글이 그 함수를 쓸 때만 만든다 */
export function heavy(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}, has = (re: RegExp) => re.test(src), c: Ctx = { f: null, script: null, msgId: -1 };
  try {
    if (has(/getPreset\b|updatePresetWith|setPreset\b/)) { const p = S.presetFor(cur.chat); out.preset = { in_use: presetToTh(p), [p.name]: presetToTh(p) }; }
    if (has(/getTavernRegexes|formatAsTavernRegexedString|updateTavernRegexesWith|isCharacterTavernRegexesEnabled/)) out.regex = { global: regex.getTavernRegexes(c, { type: 'global' }), character: curChar() ? regex.getTavernRegexes(c, { type: 'character' }) : [], preset: regex.getTavernRegexes(c, { type: 'preset' }) };
    if (has(/getCharData|RawCharacter/)) { const ch = curChar(); out.charData = ch ? cardData(ch) : null; }
    if (has(/Audio\b|getAudio|audio[A-Z]/)) out.audio = audioState();
  } catch (e) { console.warn('[도우미 사본]', e); }
  return out;
}

/** 스크립트 화면의 객체를 앱 쪽 것으로 베낀다 (앱 저장소에 다른 화면의 객체가 남지 않게). 함수는 그대로, 정규식은 앱의 정규식으로 */
function norm(v: unknown, depth = 0): unknown {
  if (v == null || typeof v !== 'object' || depth > 60) return v;
  const tag = Object.prototype.toString.call(v);
  if (tag === '[object RegExp]') { const r = v as RegExp; return new RegExp(r.source, r.flags); }
  if (Array.isArray(v)) return v.map(x => norm(x, depth + 1));
  if (tag !== '[object Object]') return v;   // Blob · File · 요소 같은 것은 그대로
  const o: Record<string, unknown> = {}; for (const k of Object.keys(v)) o[k] = norm((v as Record<string, unknown>)[k], depth + 1); return o;
}
/** 스크립트 화면에 여는 길 (같은 출처의 숨은 화면만 닿는다) */
export function install() {
  const w = window as unknown as { __dlTH?: unknown };
  if (w.__dlTH) return;
  const frameOf = (win: unknown) => [...document.querySelectorAll<HTMLIFrameElement>('iframe.dl-script-frame')].find(f => f.contentWindow === win) || null;
  w.__dlTH = {
    call(win: unknown, name: string, args: unknown[]) { const f = frameOf(win); if (!f) throw new Error(t('th.err.noFrame')); return run(ctxOf(f), name, norm(args) as unknown[]); },
    popup,
  };
}
