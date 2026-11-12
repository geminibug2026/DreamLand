// 번역: 설정 · 지시문 채우기 · 번역 한 번 · 메시지 번역 · 번역 기록 지우기 · 명령어 인자
import { mod } from '../legacy';
import { B, errMsg, isAbort, type ChatX, type Msg, type TranslateOpt } from '../addons/legacy';
import { DEFAULT_PROMPT, SYSTEM, langName } from './lang';

export interface TrPreset { id: string; name: string; content: string; filter?: boolean }
export interface TrCfg {
  lang?: string; inputLang?: string; auto?: boolean; autoInput?: boolean; context?: number; prompt?: string; maxTokens?: number;
  presets: TrPreset[]; preset: string; btnTranslate?: boolean; btnRe?: boolean; btnEdit?: boolean; btnQuick?: boolean;
}
type LangKey = 'lang' | 'inputLang';
export type { LangKey };
const strip = (t: string) => mod<{ Illust: { strip(t: string): string } }>('illust').Illust.strip(t);

/** 설정을 꺼내면서 프리셋 자리를 마련한다 (예전의 지시문 한 칸은 프리셋으로 옮긴다) */
export function cfg(): TrCfg {
  const c = B.S.settings.translate as TrCfg;
  if (!Array.isArray(c.presets) || !c.presets.length) {
    c.presets = [{ id: 'default', name: '기본', content: DEFAULT_PROMPT, filter: true }];
    if (c.prompt?.trim()) c.presets.push({ id: 'custom', name: '내 지시문', filter: false, content: `${c.prompt.trim()}\n\n{{#if chat}}<context>\n{{context}}\n</context>\n\n{{/if}}<text>\n{{prompt}}\n</text>` });
    c.preset = c.presets[c.presets.length - 1].id;
  }
  if (!c.presets.some(p => p.id === c.preset)) c.preset = c.presets[0].id;
  return c;
}
export const presetOf = (key?: string) => { const c = cfg(); return (key && c.presets.find(p => p.id === key || p.name === key)) || c.presets.find(p => p.id === c.preset) || c.presets[0]; };
export const save = () => B.S.set({ translate: cfg(), helpers: B.S.settings.helpers });

interface CtxItem { name: string; mes: string; text: string;[k: string]: string }
interface FillVars { language: string; text: string; name: string; user: string; char: string; chat?: CtxItem[] }
/** 지시문 틀 채우기. 채워 넣은 글은 다시 훑지 않는다 */
export function fill(tpl: string, v: FillVars): string {
  const keep: string[] = []; const stash = (s: unknown) => { keep.push(String(s ?? '')); return `\u0000${keep.length - 1}\u0000`; };
  const chat = v.chat || [];
  const simple: Record<string, string> = { language: v.language, prompt: v.text, text: v.text, name: v.name, user: v.user, char: v.char, context: chat.map(c => `${c.name}: ${c.mes}`).join('\n') };
  const itemVal = (it: CtxItem, i: number, key: string) => {
    key = key.trim(); const add = key.match(/^add\s+@index\s+(-?\d+)$/);
    if (add) return String(i + +add[1]); if (key === '@index') return String(i);
    const k = key.replace(/^this\.?/, ''); return stash(k ? it[k] : it.mes);
  };
  let out = tpl.replace(/\{\{#each\s+(?:\(\s*slice\s+chat\s+(-?\d+)\s*\)|chat)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, n: string | undefined, body: string) =>
    (n ? chat.slice(+n) : chat).map((it, i) => body.replace(/\{\{\s*(this(?:\.\w+)?|@index|add\s+@index\s+-?\d+)\s*\}\}/g, (_m, k: string) => itemVal(it, i, k))).join('').replace(/^\n/, ''));
  out = out.replace(/\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_, k: string, yes: string, no = '') => (k === 'chat' ? chat.length : simple[k]) ? yes : no);
  out = out.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => { const n = k.match(/^chat_(\d+)$/); return n ? stash(chat[chat.length - +n[1]]?.mes) : k in simple ? stash(simple[k]) : m; });
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => keep[+i]);
}
const FENCE = /^(?:[^`]*?)\n?```[\s\S]*?\n([\s\S]*?)```(?![^`]*```)/;

/** 번역 한 번. 대화 화면의 번역(⋯ 메뉴 · 자동 번역 · 입력 번역)도 이 함수를 거친다 (X.translate) */
export async function translate(text: string, language?: string, { chat, context = [], signal, name, preset, conn }: TranslateOpt = {}): Promise<string> {
  const S = B.S, c = cfg(), p = presetOf(preset), cur = B.chat.current();
  chat ||= cur.chat;
  const persona = chat ? S.persona(chat) : S.get('personas', S.settings.activePersona as string);
  if (name == null) { const m = chat === cur.chat ? cur.msgs.find(x => strip(B.core.msgText(x)) === text) : null; name = m ? (m.role === 'user' ? persona?.name : m.name || S.get('chars', m.charId)?.name) : persona?.name; }
  const prompt = fill(p.content || DEFAULT_PROMPT, {
    language: langName(language || c.lang), text, name: name || '', user: persona?.name || '', char: S.get('chars', chat?.charIds?.[0])?.name || '',
    chat: context.map(x => ({ name: x.name, mes: String(x.text ?? x.mes ?? '').slice(0, 4000), text: String(x.text ?? x.mes ?? '').slice(0, 4000) })),
  });
  let out = await B.engine.quickCall(SYSTEM, prompt, { maxTokens: B.core.clamp(+(c.maxTokens ?? 0) || 20000, 256, 200000), signal, conn: conn || S.helperConn('translate', chat) });
  if (p.filter !== false) { const m = out.match(FENCE); if (m) out = m[1]; }
  out = out.trim();
  if (!out) throw new Error('번역 결과가 비어 있어요');
  return out;
}

// ════════ 메시지 번역 ════════
export const busy = new Set<string>();   // 번역 중인 메시지 id
export const artOf = (id: string) => document.querySelector<HTMLElement>(`article.msg[data-id="${id}"]`);
const markBusy = (id: string) => artOf(id)?.querySelectorAll('.trx-btn.trx-go, .trx-btn.trx-re').forEach(b => b.classList.toggle('busy', busy.has(id)));
const contextOf = (chat: ChatX, msgs: Msg[], m: Msg) => {
  const S = B.S, n = +(cfg().context ?? 0) || 0, idx = msgs.indexOf(m), user = S.persona(chat)?.name || '';
  return n && idx > 0 ? msgs.slice(Math.max(0, idx - n), idx).filter(x => !x.hidden).map(x => ({ name: x.role === 'user' ? user : (x.name || S.get('chars', x.charId)?.name || 'Narrator'), text: strip(B.core.msgText(x)) })) : [];
};
export const persist = async (chat: ChatX, msgs: Msg[]) => { if (B.chat.current().chat === chat) { await B.chat.save(); B.chat.redraw(); } else await B.S.saveMsgs(chat, msgs); };

/** 지구본: 번역이 없으면 번역, 있으면 원문 ↔ 번역 전환 (번역문은 지우지 않고 간직한다). again 이면 새로 번역 */
export async function translateMsg(m: Msg | undefined, again = false): Promise<void> {
  const toast = B.ui.toast, { chat, msgs, busy: generating } = B.chat.current(); const s = m?.swipes?.[m.sw];
  if (!chat || !m || !s) return;
  if (busy.has(m.id)) return toast('이 메시지는 이미 번역하고 있어요');
  if (s.tr && !again) { s.showTr = !s.showTr; return persist(chat, msgs); }
  if (generating && msgs[msgs.length - 1] === m) return toast('답변이 다 써진 뒤에 번역할 수 있어요');
  const src = strip(s.text || '').trim();
  if (!src) return toast('번역할 내용이 없어요');
  busy.add(m.id); markBusy(m.id);
  try {
    const who = m.role === 'user' ? B.S.persona(chat)?.name : (m.name || B.S.get('chars', m.charId)?.name);
    const run = B.X.translate || translate;
    const tr = await run(src, cfg().lang, { chat, context: contextOf(chat, msgs, m), name: who || '' });
    if (strip(s.text || '').trim() !== String(src).trim() && (s.text || '').trim() !== String(src).trim()) { busy.delete(m.id); markBusy(m.id); return toast('번역하는 동안 원문이 바뀌어 번역을 버렸어요'); }
    s.tr = tr; s.showTr = true;
    busy.delete(m.id); await persist(chat, msgs);
  } catch (e) { if (!isAbort(e)) toast('번역 실패: ' + errMsg(e), 'err'); }
  finally { busy.delete(m.id); markBusy(m.id); }
}

// ════════ 번역 기록 지우기 ════════
export const translatedCount = (msgs: Msg[]) => msgs.filter(m => m.swipes?.some(s => s.tr)).length;
export async function deleteRange(from: string | null, to: string | null, all: boolean): Promise<true | void> {
  const toast = B.ui.toast, clamp = B.core.clamp, { chat, msgs } = B.chat.current();
  if (!chat || !msgs.length) return toast('열린 대화에 메시지가 없어요');
  let a = 1, b = msgs.length;
  if (!all) {
    a = parseInt(from ?? '', 10); b = parseInt(to ?? '', 10);
    if (isNaN(a) || isNaN(b)) return toast('시작과 끝 번호를 모두 적어 주세요');
    if (a > b) [a, b] = [b, a];
    a = clamp(a, 1, msgs.length); b = clamp(b, 1, msgs.length);
  }
  const hit = msgs.slice(a - 1, b).filter(m => m.swipes?.some(s => s.tr));
  if (!hit.length) return toast('그 범위에는 번역이 없어요');
  if (!(await B.ui.confirmBox(all ? `이 대화의 번역 ${hit.length}개를 모두 지울까요?` : `${a}번 ~ ${b}번 메시지의 번역 ${hit.length}개를 지울까요?`, '지우기', true))) return;
  for (const m of hit) for (const s of m.swipes) { delete s.tr; s.showTr = false; }
  await persist(chat, msgs);
  toast(`번역 ${hit.length}개를 지웠어요`, 'ok');
  return true;
}

// ════════ 명령어 ════════
export function parseArgs(arg: string) {
  const named: Record<string, string> = {}; let rest = arg || ''; const re = /^\s*(target|profile|preset)=("([^"]*)"|'([^']*)'|\S+)/i; let m;
  while ((m = rest.match(re))) { named[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[2]; rest = rest.slice(m[0].length); }
  return { named, text: rest.trim() };
}
