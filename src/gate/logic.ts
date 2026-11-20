// 물음(판정문): 작은 모델에게 "지금 장면이 이러한가?"를 예/아니오로 물어 프롬프트 조각 · 로어북 항목을 켜고 끈다.
// 답변 전 준비(X.before)에서 이번 턴에 닿을 수 있는 물음을 모아 한 번의 호출로 묻고, 프롬프트를 조립할 때는 그 답만 읽는다.
// 기본은 꺼짐. 켜면 물음이 있는 턴마다 호출 1번(스와이프 · 다시 쓰기는 다시 묻지 않는다).
import type { Char, Chat, Lore, LoreEntry, Msg, Persona } from '../lib/types';
import type { Ctx } from '../lib/engine';
import * as engine from '../lib/engine';
import { S, msgText } from '../lib/core';
import { Clock } from '../lib/clock';
import { chatApi } from '../chat/actions';
import { CASE_MARK, caseFold, idleText, includeText } from '../lib/macro-extra';
import { checksText, matchOption, parseLine, parseVerdict, plan, rewriteCond, settle, siteKey, type Check, type Plan } from './pure';
import type { AskRow, AskSite, AskTag, AskTurn, GateCfg, GateData, SiteState } from './types';

export const OWNER = 'gate';
type GChat = Chat & { gate?: GateData };
export const DEFAULTS: GateCfg = { on: false, depth: 6, max: 16, timeout: 6, prompt: '' };
export function cfg(): GateCfg {
  const st = S.settings as unknown as { gate?: Partial<GateCfg> }, c = (st.gate ||= {}) as GateCfg;
  for (const k of Object.keys(DEFAULTS) as (keyof GateCfg)[]) if (c[k] == null) (c as unknown as Record<string, unknown>)[k] = DEFAULTS[k];
  return c;
}
export const saveCfg = () => S.set({ gate: cfg() } as never);

/** 모델에게 보내는 지시문 (설정에서 바꿀 수 있다) */
export const GATE_PROMPT = `You are a scene checker for an ongoing story chat. You receive the most recent messages and a numbered list of checks.
- A [yes/no] check is a statement. Answer true only if the messages shown clearly make it true right now; if they do not show it, or it is unclear, answer false.
- A [choice] check is a question with listed options. Answer with the text of the one option that fits best right now, or null if none fits.
Judge only from the messages shown. Do not continue the story and do not explain.
Reply with a single JSON object and nothing else, keyed by check number.
Example: {"1": true, "2": false, "3": "forest"}`;

// ════════ 턴 ════════
/** 이번 답변이 딛고 설 기록: 다시 쓰는 답변은 뺀다 */
const sourceOf = (msgs: Msg[], type: string) => { const vis = msgs.filter(m => !m.hidden); return type === 'regen' || type === 'swipe' ? vis.slice(0, -1) : vis; };
/** 턴 열쇠: 마지막 메시지와 그 스와이프. 같은 열쇠면 다시 묻지 않는다 */
export function turnKey(msgs: Msg[], type = 'normal'): string { const src = sourceOf(msgs, type), m = src[src.length - 1]; return m ? `${m.id}:${m.sw || 0}` : 'start'; }
/** 턴 번호: 지금 쓰려는 답변 앞에 이미 있는 답변의 수 (스와이프로는 늘지 않고, 지우면 줄어든다) */
export const turnNo = (msgs: Msg[], type = 'normal') => sourceOf(msgs, type).filter(m => m.role === 'assistant').length;

interface Found { key: string; site: AskSite; kind: 'yn' | 'pick' | 'lore'; from: string; raw: string; options?: string[] }
/** 모으는 중: 조립을 미리 돌려 닿는 물음을 적는다. assume = 아직 모르는 물음을 무엇으로 볼지 */
let collecting: { chatId: string; assume: boolean; T: number; turn: AskTurn | null; st: Record<string, SiteState>; found: Map<string, Found> } | null = null;
/** 실제 생성 중: 준비가 끝난 턴의 열쇠 (조립이 이 답을 읽는다) */
let live: { chatId: string; key: string } | null = null;
export const endLive = () => { live = null; };

const mx = (s: string, c: Ctx) => s.includes('{{') ? engine.macro(s, c) : s;
const pickKey = (q: string, options: string[]) => 'pick\u0001' + q + '\u0001' + options.join('|');

/** 지금 조립이 읽을 턴 기록: 실제 생성이면 준비해 둔 것, 미리보기면 마지막 메시지가 같을 때만 */
function turnFor(chat: GChat): AskTurn | null {
  const turn = chat.gate?.turn; if (!turn) return null;
  if (live && live.chatId === chat.id) return live.key === turn.key ? turn : null;
  const now = chatApi.current(); if (now.chat?.id !== chat.id) return null;
  return turn.key === turnKey(now.msgs) ? turn : null;
}
/** 판정 결과를 읽는다 (조립 중). 모으는 중이면 자리만 적고 어림값을 돌려준다 */
function resolve(site: AskSite, c: Ctx, kind: 'yn' | 'lore', from: string, raw: string): boolean {
  const chat = c.chat as GChat | undefined; if (!chat) return false;
  const key = siteKey(site.stmt, site.mods);
  if (collecting && collecting.chatId === chat.id) {
    const C = collecting; if (!C.found.has(key)) C.found.set(key, { key, site, kind, from, raw });
    const hit = C.turn?.res[key]; if (hit) return hit.v;
    const p = plan(C.st[key], site, C.T);
    return p.kind === 'held' ? true : p.kind === 'cool' ? false : p.kind === 'every' ? p.s.v : p.kind === 'until' ? !C.assume : C.assume;   // until 은 "끝났는가"를 묻는 것이라 뒤집힌다
  }
  if (!cfg().on) { noteOff(chat, key, site, kind, from); return false; }
  const turn = turnFor(chat), hit = turn?.res[key];
  if (hit) return hit.v;
  if (turn && live && !turn.rows.some(r => r.key === key)) turn.rows.push({ key, stmt: site.stmt, mods: site.mods, kind, from, v: false, tag: 'unasked' });   // 미리 모을 때 닿지 않았던 물음
  return false;
}
/** 꺼져 있을 때 쓰인 물음 (진단 창에 "꺼져 있음"으로 보여 준다). 저장하지 않는다 */
export const offSeen = new Map<string, AskRow[]>();
function noteOff(chat: Chat, key: string, site: AskSite, kind: 'yn' | 'pick' | 'lore', from: string) {
  const list = offSeen.get(chat.id) || []; if (!offSeen.has(chat.id)) offSeen.set(chat.id, list);
  if (list.length < 40 && !list.some(r => r.key === key)) list.push({ key, stmt: site.stmt, mods: site.mods, kind, from, v: false, tag: 'off' });
}

// ════════ 엔진에 꽂는 것 ════════
export const hook = {
  /** 조건식의 ask:"…" 를 (1 > 0) / (0 > 1) 로 */
  cond(cond: string, c: Ctx): string {
    return rewriteCond(cond, s => { const site: AskSite = { stmt: mx(s.stmt, c).trim(), mods: s.mods.until ? { ...s.mods, until: mx(s.mods.until, c).trim() } : s.mods }; return site.stmt ? resolve(site, c, 'yn', '', s.stmt) : false; });
  },
  /** 로어북 항목의 물음 */
  lore(e: LoreEntry, c: Ctx): boolean {
    const site = parseLine(mx(String(e.ask || ''), c)); if (!site) return false;
    return resolve(site, c, 'lore', 'entry:' + (e.name || e.keys?.[0] || ''), '');
  },
  /** {{#each char}}…{{/each}}: 그룹의 캐릭터마다 되풀이한다. 안의 {{char}} · {{description}} 따위가 그 캐릭터의 것이 된다 */
  each(text: string, c: Ctx): string {
    return text.replace(/\{\{\s*#each\s+(?:char|character|member)s?\s*\}\}([\s\S]*?)\{\{\s*\/each\s*\}\}/gi, (_m, bodyIn: string) => {
      const body = bodyIn.replace(/^[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*$/, ''), chat = c.chat;
      const chars = (chat?.charIds || []).map(id => S.get('chars', id) as Char | undefined).filter((x): x is Char => !!x);
      if (!chars.length) return engine.macro(body, c);
      return chars.map(ch => engine.macro(body, { ...c, char: ch.name, description: ch.description || '', personality: ch.personality || '', scenario: ch.scenario || '', mesExamples: ch.mesExample || '' })).join('\n');
    });
  },
  post: caseFold,
};

/** {{ask_pick:"물음"::가::나::다}} → 고른 값(없으면 빈 글). 같은 일괄 호출에 실린다 */
function askPick(argsIn: unknown, cIn?: unknown): string {
  const args = (argsIn as string[]) || [], c = (cIn || {}) as Ctx, chat = c.chat as GChat | undefined;
  const q = String(args[0] || '').trim().replace(/^["'“‘]|["'”’]$/g, '').trim(), options = args.slice(1).map(x => x.trim()).filter(Boolean);
  if (!chat || !q || options.length < 2) return '';
  const key = pickKey(q, options);
  if (collecting && collecting.chatId === chat.id) { if (!collecting.found.has(key)) collecting.found.set(key, { key, site: { stmt: q, mods: {} }, kind: 'pick', from: '', raw: q, options }); return collecting.turn?.picks[key] || ''; }
  if (!cfg().on) { noteOff(chat, key, { stmt: q, mods: {} }, 'pick', ''); return ''; }
  return turnFor(chat)?.picks[key] || '';
}

// ════════ 어디서 왔는지 ════════
/** 물음이 적힌 곳을 찾는다 → 'preset:이름' · 'char:이름' · 'persona:' · 'note:' · 'lore:책 › 항목' (못 찾으면 '') */
function whereFrom(raw: string, chat: Chat, chars: Char[], persona: Persona | null | undefined, books: Lore[]): string {
  if (!raw) return '';
  const has = (...texts: unknown[]) => texts.some(x => typeof x === 'string' && x.includes(raw));
  for (const b of S.presetFor(chat).blocks || []) if (b.enabled && has(b.content, b.when)) return 'preset:' + (b.name || b.kind);
  for (const ch of chars) if (has(ch.description, ch.personality, ch.scenario, ch.mesExample, ch.systemPrompt, ch.postHistory, ch.depthPrompt?.prompt)) return 'char:' + ch.name;
  if (has(persona?.description)) return 'persona:';
  if (has(chat.note?.text)) return 'note:';
  for (const b of books) for (const e of b.entries || []) if (has(e.content)) return `lore:${b.name} › ${e.name || e.keys?.[0] || ''}`;
  return '';
}

// ════════ 모델 호출 ════════
const clip = (s: string, n = 1500) => s.length > n ? s.slice(0, Math.floor(n * 0.3)) + ' … ' + s.slice(-Math.floor(n * 0.7)) : s;
/** 모델에게 보여 줄 최근 메시지 (카드 · 로어는 보내지 않는다) */
export function recentText(chat: Chat, msgs: Msg[], type = 'normal'): string {
  const user = S.persona(chat)?.name || S.settings.userNameFallback || 'User';
  return sourceOf(msgs, type).slice(-Math.max(1, +cfg().depth || 6)).map(m => m.role === 'system' ? `[${clip(msgText(m), 600)}]` : `${m.role === 'user' ? user : (m.name || 'Character')}: ${clip(msgText(m))}`).join('\n\n');
}
/** 한 번의 호출로 목록을 판정한다. 시간 안에 답이 없으면 err 를 채워 돌려준다 (던지지 않는다) */
export async function judge(chat: Chat, msgs: Msg[], type: string, list: Check[]): Promise<{ out: Record<number, boolean | string | null>; ms: number; err?: string }> {
  const t0 = Date.now(), ac = new AbortController(), limit = Math.max(1, +cfg().timeout || 6) * 1000, timer = setTimeout(() => ac.abort(), limit);
  try {
    const user = `<messages>\n${recentText(chat, msgs, type) || '(no messages yet)'}\n</messages>\n\n<checks>\n${checksText(list)}\n</checks>`;
    const text = await engine.quickCall(cfg().prompt.trim() || GATE_PROMPT, user, { maxTokens: 500, signal: ac.signal, conn: S.helperConn('gate', chat), lowThink: true });
    const out = parseVerdict(text, list);
    return { out, ms: Date.now() - t0, err: Object.keys(out).length ? undefined : 'unreadable' };
  } catch (e) {
    const err = ac.signal.aborted ? 'timeout' : (e instanceof Error ? e.message : String(e)).slice(0, 160);
    console.warn('[물음]', err);   // 조용히 넘어간다: 프롬프트 조각은 닫힌 채로 간다
    return { out: {}, ms: Date.now() - t0, err };
  } finally { clearTimeout(timer); }
}

// ════════ 답변 전 준비 ════════
const copy = <T,>(o: T): T => JSON.parse(JSON.stringify(o ?? null)) as T;
export interface PrepArgs { chat: Chat; msgs: Msg[]; type: string; chars?: Char[]; persona?: Persona; speaker?: Char }
/** 조립을 미리 돌려 이번 턴에 닿는 물음을 모은다. 변수는 건드린 만큼 되돌린다 */
function collect(a: PrepArgs, T: number, turn: AskTurn | null): Found[] {
  const chat = a.chat as GChat, chars = a.chars?.length ? a.chars : (chat.charIds || []).map(id => S.get('chars', id) as Char | undefined).filter((x): x is Char => !!x);
  const char = a.speaker || chars[0]; if (!char) return [];
  const keepVars = copy(chat.vars || {}), keepG = copy(S.settings.globalVars || {});
  const inScene = chat.mode === 'talk' && !!chat.scene?.on, pchat = inScene ? Object.assign(Object.create(chat) as Chat, { mode: 'rp' as const, sceneLive: true }) : chat;
  const found = new Map<string, Found>(), pass = (assume: boolean) => {
    collecting = { chatId: chat.id, assume, T, turn, st: chat.gate?.st || {}, found };
    try { engine.buildPrompt({ chat: pchat, char, chars, persona: a.persona || S.persona(chat), preset: S.presetFor(chat), msgs: a.msgs, type: a.type, commit: false }); }
    catch (e) { console.warn('[물음] 모으기', e); }
    finally { collecting = null; chat.vars = copy(keepVars); S.settings.globalVars = copy(keepG); }
  };
  pass(false);
  if (found.size) pass(true);   // 물음이 참일 때만 열리는 가지 안의 물음까지
  return [...found.values()];
}

/** 보기 전용 조립: 지금 보낸다면 어떤 프롬프트가 되는지 (매크로가 건드린 변수는 되돌린다) */
export function dryBuild(chat: Chat, msgs: Msg[]): engine.Built | null {
  const chars = (chat.charIds || []).map(id => S.get('chars', id) as Char | undefined).filter((x): x is Char => !!x); if (!chars.length) return null;
  const keepVars = copy(chat.vars || {}), keepG = copy(S.settings.globalVars || {});
  const inScene = chat.mode === 'talk' && !!chat.scene?.on, pchat = inScene ? Object.assign(Object.create(chat) as Chat, { mode: 'rp' as const, sceneLive: true }) : chat;
  try { return engine.buildPrompt({ chat: pchat, char: chars[0], chars, persona: S.persona(chat), preset: S.presetFor(chat), msgs, type: 'normal', commit: false }); }
  catch (e) { console.warn('[깨어난 설정] 미리 보기', e); return null; }
  finally { chat.vars = keepVars; S.settings.globalVars = keepG; }
}

/** 이번 턴의 물음을 모아 한 번에 묻고, 답과 타이머를 chat.gate 에 적는다 */
export async function prepare(a: PrepArgs): Promise<void> {
  const chat = a.chat as GChat; live = null;
  if (!cfg().on) return;
  offSeen.delete(chat.id);
  const key = turnKey(a.msgs, a.type), T = turnNo(a.msgs, a.type), old = chat.gate?.turn?.key === key ? chat.gate.turn : null;
  const found = collect(a, T, old);
  live = { chatId: chat.id, key };
  if (!found.length && !chat.gate?.turn) return;   // 물음을 쓰지 않는 방은 건드리지 않는다
  const g = (chat.gate ||= {}), st = (g.st ||= {});
  const turn: AskTurn = { key, T, ans: old?.ans || {}, picks: old?.picks || {}, res: old?.res || {}, rows: [], calls: old?.calls || 0, ms: old?.ms || 0, err: undefined, at: Date.now() };
  const books = found.some(f => f.raw) ? engine.activeBooks(chat, a.chars || [], a.persona) : [];
  const max = Math.max(1, +cfg().max || 16), queue: Check[] = [], qOf = new Map<string, number>();
  const pending: { f: Found; p?: Extract<Plan, { ask: string }>; n?: number }[] = [];
  const ask = (kind: 'yn' | 'pick', text: string, options?: string[]): number | null => {
    const id = kind + '\u0001' + text + (options ? '\u0001' + options.join('|') : ''); if (qOf.has(id)) return qOf.get(id)!;
    if (queue.length >= max) return null;
    const n = queue.length + 1; queue.push({ n, kind, text, options }); qOf.set(id, n); return n;
  };
  const row = (f: Found, v: boolean, tag: AskTag, more: Partial<AskRow> = {}) => { turn.rows.push({ key: f.key, stmt: f.site.stmt, mods: f.site.mods, kind: f.kind, from: f.from || whereFrom(f.raw, chat, a.chars || [], a.persona, books), v, tag, options: f.options, ...more }); };
  const done = (f: Found, p: Plan, answer: boolean | null, cached = false) => {
    const r = settle(st[f.key], f.site, T, p, answer);
    if (r.tag !== 'none') { st[f.key] = r.st; turn.res[f.key] = { v: r.v, tag: r.tag, left: r.left }; }
    row(f, r.v, r.tag, { left: r.left, cached });
  };
  for (const f of found) {
    if (f.kind === 'pick') {
      if (f.key in turn.picks) { row(f, !!turn.picks[f.key], turn.picks[f.key] ? 'yes' : 'no', { pick: turn.picks[f.key] || '', cached: true }); continue; }
      const n = ask('pick', f.site.stmt, f.options); if (n == null) row(f, false, 'over'); else pending.push({ f, n }); continue;
    }
    const hit = turn.res[f.key]; if (hit) { row(f, hit.v, hit.tag, { left: hit.left, cached: true }); continue; }
    const p = plan(st[f.key], f.site, T);
    if (p.kind !== 'ask' && p.kind !== 'until') { done(f, p, null); continue; }
    if (p.ask in turn.ans) { done(f, p, turn.ans[p.ask], true); continue; }
    const n = ask('yn', p.ask); if (n == null) row(f, false, 'over'); else pending.push({ f, p, n });
  }
  if (queue.length) {
    chatApi.setStatus(askingText());
    const r = await judge(chat, a.msgs, a.type, queue);
    turn.calls++; turn.ms = r.ms; turn.err = r.err;
    for (const { f, p, n } of pending) {
      const v = r.out[n!];
      if (f.kind === 'pick') { if (v === undefined) row(f, false, 'none'); else { const s = typeof v === 'string' ? matchOption(v, f.options || []) : null; turn.picks[f.key] = s; row(f, !!s, s ? 'yes' : 'no', { pick: s || '' }); } continue; }
      if (typeof v === 'boolean') turn.ans[p!.ask] = v;
      done(f, p!, typeof v === 'boolean' ? v : null);
    }
  }
  const order = new Map(found.map((f, i) => [f.key, i])); turn.rows.sort((x, y) => (order.get(x.key) ?? 0) - (order.get(y.key) ?? 0));   // 진단 창에는 프롬프트에 나온 차례대로
  for (const k of Object.keys(st)) if (st[k].at < T - 200) delete st[k];   // 오래 쓰이지 않은 자리의 기록은 치운다
  g.turn = turn;
  await S.save('chats', chat, true);
}
/** 상태 줄 글 (기능 파일이 채운다 — 여기서는 화면 글을 모른다) */
let askingText = () => '';
export const setAskingText = (fn: () => string) => { askingText = fn; };

/** 물음 시험: 문장 하나를 지금 대화에 대해 바로 판정한다 (호출 1번 · 기록에는 남기지 않는다) */
export async function testAsk(chat: Chat, msgs: Msg[], stmt: string): Promise<{ v: boolean | null; ms: number; err?: string }> {
  const r = await judge(chat, msgs, 'normal', [{ n: 1, kind: 'yn', text: mx(stmt, engine.makeCtx({ chat, char: S.get('chars', chat.charIds?.[0]) as Char | undefined, chars: [], persona: S.persona(chat), msgs })) }]);
  return { v: typeof r.out[1] === 'boolean' ? r.out[1] : null, ms: r.ms, err: r.err };
}
/** 진단 창이 보여 줄 것: 마지막으로 판정한 턴 + 꺼져 있을 때 쓰인 물음 */
export const lastTurn = (chat: Chat): AskTurn | null => (chat as GChat).gate?.turn || null;
/** 타이머 기록을 지운다 (다음 답변에서 전부 다시 묻는다) */
export async function resetGate(chat: Chat) { delete (chat as GChat).gate; offSeen.delete(chat.id); await S.save('chats', chat, true); }

// ════════ 보강 매크로 ════════
const lastType = new Map<string, string>();
export const noteGen = (chatId: string, type: string) => { lastType.set(chatId, type); };
type C2 = Ctx & { __inc?: string[] };
const title = (e: LoreEntry) => String(e.name || e.keys?.[0] || '').trim().toLowerCase();
/** {{include::항목}} · {{include::책::항목}}: 로어북 항목의 본문을 끼워 넣는다. 꺼 둔 항목도 된다(조각 보관함으로 쓸 수 있게) */
function include(argsIn: unknown, cIn?: unknown): string {
  const args = (argsIn as string[]) || [], c = (cIn || {}) as C2, chat = c.chat;
  const [book, name] = args.length > 1 ? [args[0], args.slice(1).join('::')] : ['', args[0] || ''];
  if (!name.trim()) return '';
  const near = chat ? engine.activeBooks(chat, (chat.charIds || []).map(id => S.get('chars', id) as Char | undefined).filter((x): x is Char => !!x), S.persona(chat)) : [];
  const books = [...near, ...S.lore.filter(b => !near.includes(b))].filter(b => !book.trim() || b.name.trim().toLowerCase() === book.trim().toLowerCase());
  return includeText(name, book, c.__inc || [], n => { for (const b of books) { const e = (b.entries || []).find(x => title(x) === n.trim().toLowerCase()); if (e) return { key: b.id + ':' + e.id, text: e.content || '' }; } return null; },
    (text, stack) => engine.macro(engine.tpl(text, c), { ...c, __inc: stack } as Ctx));
}
function idle(_a: unknown, cIn?: unknown): string {
  const chat = ((cIn || {}) as Ctx).chat, now = chatApi.current();
  const list = chat && now.chat?.id === chat.id ? now.msgs.filter(m => !m.hidden) : [], ts = list.length ? list[list.length - 1].ts : chat?.updatedAt;
  return ts ? idleText(Date.now() - ts) : '';
}
export const MACROS: Record<string, (args: unknown, c?: unknown) => unknown> = {
  ask_pick: askPick, include, idle_duration: idle,
  lastgenerationtype: (_a, c) => lastType.get(((c || {}) as Ctx).chat?.id || '') || 'normal',
  datetime: (_a, c) => { const d = Clock.now(((c || {}) as Ctx).chat); return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`; },
  chatid: (_a, c) => ((c || {}) as Ctx).chat?.id || '',
  uppercase: () => CASE_MARK.U, '/uppercase': () => CASE_MARK.u, lowercase: () => CASE_MARK.L, '/lowercase': () => CASE_MARK.l,
};
