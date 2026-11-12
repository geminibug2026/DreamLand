// memory.js 865–1335 줄을 그대로 옮긴 것. 본문은 고치지 않고 타입(Part2)만 붙인다
import { S, uid, now, msgText } from '../../lib/core';
import { activeBooks } from '../../lib/engine';
import type { Char as CharM } from '../../lib/types';
import type { MemoryApi } from './api';
import type { Part1 } from './part1';
import type { Part3 } from './part3';
import type { Mem, Msg, ChatM, CastCard, Bond, BondStep, MemItem, Pledge, Relation, StatusRow } from '../types';
import { SCOPES, NARRATOR, MEMORY_DEFAULTS, CHARACTER_LINES_MAX, CHARACTER_GROWTH_MAX, BOND_LOG_MAX, BOND_SETTLE_TURNS, cache, mesHashOf, list, low, cleanStr, clipStr, toSnake, num01, firstSentence, canonSlot, na, visibleProse, ekey, overlap, parseDurationDays, normKind, normLockKind, normVisibility, pledgeId, upsertRow } from './base';
import { THREAD_KINDS } from '../craft';
import { t as tr } from '../../i18n';

/** 사서가 돌려준 JSON (읽기 전의 날것 — 칸마다 믿을 수 없다) */
export interface RawExtraction {
  digest?: unknown; turn_summary?: unknown; weight?: unknown; importance?: unknown; time_passed?: unknown; memories?: unknown; settled?: unknown;
  canon?: unknown; world_rules?: unknown; status?: unknown; entity_states?: unknown; pledges?: unknown; locks?: unknown; cast?: unknown; characters?: unknown;
  bonds?: unknown; milestones?: unknown; items?: unknown;
}
/** 정제한 사서의 답 (sanitizeExtraction) */
export interface ExtMemory { kind: string; summary: string; excerpt: string | null; importance: number; entities: string[]; tags: string[]; hints?: string[]; visibility: string; owner: string | null; knowers?: string[] }
export interface RuleInput { scope: string; scopeName?: string; key: string; value: string }
export interface StateInput { entity: string; slot: string; value: string; claim?: string; owner?: string }
export interface LockInput { kind: string; summary: string; status: string; priority?: number; owner?: string; manual?: boolean }
/** upsertCast 가 받는 인물 정보 — 사서의 답 · 화면의 직접 입력 둘 다 */
export interface CastInput {
  name?: string; aka?: string[]; aliases?: string[]; provisional?: boolean; locked?: boolean; traits?: string[]; relationships?: Relation[];
  role?: string | null; age?: string | null; occupation?: string | null; appearance?: string | null; voice?: string | null; core?: string | null; line?: string | null; growth?: string | null;
  [k: string]: unknown;
}
export type ExtCast = {
  name: string; provisional: boolean; aka: string[]; role: string | null; age: string | null; occupation: string | null; appearance: string | null; voice: string | null;
  core: string | null; line: string | null; growth: string | null; traits: string[]; relationships: Relation[];
};
export interface BondInput { from: string; to: string; stage: string; basis?: string; calls?: string; unsaid?: string }
export interface MilestoneInput { title: string; summary?: string; participants?: string[]; grade?: string }
export interface ItemInput { name: string; meaning?: string; holder?: string; status?: string }
export interface Extraction {
  turnSummary: string; importance: number; elapsedDays: number; memories: ExtMemory[]; worldRules: Required<RuleInput>[]; entityStates: Required<StateInput>[];
  locks: (Required<Omit<LockInput, 'manual'>>)[]; characters: ExtCast[]; milestones: Required<MilestoneInput>[]; items: Required<ItemInput>[]; bonds: Required<BondInput>[];
  settledPledges: string[]; settledHow: Record<string, string>;
}
/** 사서의 답 속 한 줄 (정제 전) */
type RawRow = { [k: string]: unknown };
export interface CommitOpts { signal?: AbortSignal; force?: boolean; retry?: number }

/** 이 조각이 맡는 Memory 메서드의 서명 */
export interface Part2 {
  buildProfileReference(chat: ChatM | null | undefined, lean?: boolean, ai?: Msg | null): string;
  buildWorldInfoReference(chat: ChatM | null | undefined): string;
  reference(chat: ChatM | null | undefined, mem: Mem | null, ai?: Msg | null, lean?: boolean): Promise<string[]>;
  buildReferenceBlock(chat: ChatM | null | undefined, opts?: { lean?: boolean; ai?: Msg | null }): Promise<string>;
  archivistTrackingDirective(): string;
  trackingDirective(): string;
  validExcerpt(excerpt: unknown, userText: string, assistantText: string): string | null;
  validLine(line: unknown, userText: string, assistantText: string): string | null;
  sanitizeExtraction(raw: RawExtraction | null | undefined, userText: string, assistantText: string): Extraction;
  findPrecedingUserMessage(msgs: Msg[], idx: number): Msg | null;
  commitOne(chat: ChatM, msgs: Msg[], ai: Msg, opts?: CommitOpts): Promise<Mem>;
  commitTurn(chat: ChatM, msgs: Msg[], ai: Msg, opts?: CommitOpts): Promise<Mem>;
  sleepStaleThreads(mem: Mem, after?: number): number;
  upsertWorldRule(mem: Mem, rule: RuleInput, turn: number, msgId?: string): void;
  upsertEntityState(mem: Mem, state: StateInput, turn: number, msgId?: string): void;
  upsertLock(mem: Mem, lock: LockInput, turn: number, msgId?: string): Pledge;
  upsertMilestone(mem: Mem, e: MilestoneInput, turn: number | null, msgId?: string): void;
  upsertItem(mem: Mem, it: ItemInput, turn: number, msgId?: string): void;
  canonName(mem: Mem, name: string | null | undefined): string;
  foldAliases(mem: Mem): { states: number; memories: number };
  keepsLinesFor(mem: Mem, card: { name: string; aka?: string[] }): boolean;
  addCharacterLine(card: CastCard, text: string, turn: number, msgId?: string): boolean;
  mergeCast(mem: Mem, keep: CastCard, src: CastCard): { states: number; memories: number };
  upsertCast(mem: Mem, c: CastInput, turn: number, msgId?: string): CastCard | null;
  bondKey(from: string, to: string): string;
  bondNow(b: Bond | null | undefined): BondStep | null;
  upsertBond(mem: Mem, b: BondInput, turn: number, opts?: { manual?: boolean; msgId?: string }): Bond | null;
  sameBondStep(last: BondStep, next: BondStep): boolean;
  compactBondLog(row: Bond): boolean;
  formatBondLine(b: Bond, opts?: { path?: boolean }): string;
  removeDerivedForTurn(mem: Mem, msgId: string): ReturnType<Part1['clearDerived']>;
  canonEntityName(mem: Mem, name: string | null | undefined): string;
  foldEntityAliases(mem: Mem): { states: number; memories: number };
  upsertCharacter(mem: Mem, c: CastInput, turn: number, msgId?: string): CastCard | null;
  mergeCharacterCards(mem: Mem, keep: CastCard, absorb: CastCard): { states: number; memories: number };
  pruneMemories(mem: Mem): void;
  getSceneSnapshot(mem: Mem): ReturnType<Part3['scene']>;
  prune(mem: Mem): void;
  housekeeping(chat: ChatM, mem: Mem, signal?: AbortSignal): Promise<number>;
}

export const part2: Part2 & ThisType<MemoryApi> = {
  // ── 참고 자료 (캐릭터 카드 · 페르소나 · 로어북) ──
  /** 캐릭터 카드 · 페르소나 요지. lean: 이름만 — 인물의 바탕이 이미 서고에 있으면 카드 본문을 매번 다시 보낼 이유가 없다 */
  buildProfileReference(chat, lean = false, ai = null) {
    const parts: string[] = [], ch = S.get('chars', ai?.charId) || S.get('chars', chat?.charIds?.[0]), persona = chat ? S.persona(chat) : null;
    if (ch) { const bits: string[] = []; if (ch.name) bits.push(`Name: ${ch.name}`); if (ch.description && !lean) bits.push(`About: ${cleanStr(ch.description, 800)}`); if (ch.personality && !lean) bits.push(`Personality: ${cleanStr(ch.personality, 400)}`); if (bits.length) parts.push(`[Main character card]\n${bits.join('\n')}`); }
    if (persona?.name || persona?.description) { const bits: string[] = []; if (persona.name) bits.push(`Name: ${persona.name}`); if (persona.description && !lean) bits.push(`About: ${cleanStr(persona.description, 600)}`); parts.push(`[Player persona]\n${bits.join('\n')}`); }
    return parts.join('\n\n');
  },
  /** 지금 켜져 있는 로어북 요지 — 개수 · 길이 제한 */
  buildWorldInfoReference(chat) {
    try {
      const chars = (chat?.charIds || []).map(id => S.get('chars', id)).filter(Boolean) as CharM[];
      const usable = activeBooks(chat!, chars).flatMap(b => b.entries || []).filter(e => e?.content && e.enabled !== false).slice(0, 20); if (!usable.length) return '';
      return `[World Info / Lorebook]\n${usable.map(e => { const keys = Array.isArray(e.keys) ? e.keys.join(', ') : (e.keys || ''); return `- ${keys ? `(${cleanStr(keys, 80)}) ` : ''}${cleanStr(e.content, 300)}`; }).join('\n')}`;
    } catch (e) { console.debug('[장기기억] 로어북 읽기 실패', e); return ''; }
  },
  /** 참고 자료 조각들 (설정에 따라). 요약 호출도 쓴다 */
  async reference(chat, mem, ai, lean = false) {
    const cfg = this.cfg(), parts: string[] = [] satisfies string[] | typeof mem;   // mem 은 옛 서명에만 남은 매개변수 — 타입에서 가리켜 둔다
    if (cfg.refProfile !== false) { const p = this.buildProfileReference(chat, lean, ai); if (p) parts.push(p); }
    if (cfg.refLore) { const w = this.buildWorldInfoReference(chat); if (w) parts.push(w); }
    return parts;
  },
  /** 사서 · 요약 호출에 붙일 배경 참고 블록 */
  async buildReferenceBlock(chat, { lean = false, ai = null } = {}) {
    const parts = await this.reference(chat, null, ai, lean);
    return parts.length ? `Background reference (context only — never archive or summarize from this):\n${parts.join('\n\n')}\n` : '';
  },
  /** 연표 · 물건 추적이 켜졌을 때 사서 프롬프트에 덧붙일 지시 */
  archivistTrackingDirective() {
    const cfg = this.cfg(), parts: string[] = [];
    if (cfg.milestones) parts.push('EXTRA SHELF — milestones: also include a top-level array "milestones" for true turning points only — a moment the whole story will remember (a confession, a reveal, a death, a vow, an irreversible choice). Never: everyday conversation, meals, walks, recurring routines, minor quarrels, or emotional beats that change nothing permanent. When in doubt, leave it out. Shape: {"title":"...","summary":"one sentence","participants":["Name"],"grade":"major|minor"}. Max 2.');
    if (cfg.items) parts.push('EXTRA SHELF — items: also include a top-level array "items" for objects that matter to the story (gifts with meaning, plot-critical tools, signature belongings). Ignore food, clothing, and one-off props. Shape: {"name":"...","meaning":"why it matters","holder":"Name or null","status":"kept|given|lost|broken|..."}. Max 2.');
    return parts.length ? `\n\n${parts.join('\n')}` : '';
  },
  trackingDirective() { return this.archivistTrackingDirective(); },

  // ── 사서의 답 정제 ──
  /** 인용이 원문의 실제 부분 문자열일 때만 남긴다 (지어낸 증거 차단) — 공백 차이는 허용. 문단 통짜 인용은 받지 않는다 */
  validExcerpt(excerpt, userText, assistantText) {
    const e = String(excerpt || '').trim(); if (!e || e.length < 3 || e.length > 160) return null;
    const squash: (s: string) => string = s => String(s || '').replace(/\s+/g, ' '), en = squash(e);
    return squash(userText).includes(en) || squash(assistantText).includes(en) ? e : null;
  },
  /** 남긴 말 검증 — 모델이 덧씌운 따옴표를 벗긴 뒤, 원문에 그대로 있는 한 줄만 받는다 */
  validLine(line, userText, assistantText) {
    const bare = String(line ?? '').trim().replace(/^["“”‘’'「『《]+|["“”‘’'」』》]+$/g, '').trim();
    return bare.length >= 4 ? this.validExcerpt(bare, userText, assistantText) : null;
  },
  sanitizeExtraction(raw, userText, assistantText) {
    const arr: (v: unknown) => RawRow[] = v => Array.isArray(v) ? v : [];
    const out = { turnSummary: clipStr(raw?.digest ?? raw?.turn_summary, 700), importance: num01(raw?.weight ?? raw?.importance, 0.4), elapsedDays: parseDurationDays(raw?.time_passed), memories: [], worldRules: [], entityStates: [], locks: [], characters: [], milestones: [], items: [], bonds: [] } as unknown as Extraction;
    for (const m of arr(raw?.memories).slice(0, 12)) {
      const summary = clipStr(m?.summary, 400); if (!summary) continue;
      out.memories.push({
        kind: normKind(m?.kind), summary, excerpt: this.validExcerpt(m?.quote ?? m?.excerpt, userText, assistantText), importance: num01(m?.importance, 0.5),
        entities: arr(m?.entities).map(e => cleanStr(e, 60)).filter(Boolean).slice(0, 6), tags: arr(m?.tags).map(toSnake).filter(Boolean).slice(0, 6), hints: arr(m?.recall).map(h => cleanStr(h, 40)).filter(Boolean).slice(0, 5),
        visibility: normVisibility(m?.visibility), owner: na(cleanStr(m?.owner, 60)) || null,
        knowers: arr(m?.known_by).map(e => cleanStr(e, 60)).filter(Boolean).slice(0, 6),   // 누가 아는가 — 소유자 말고도 이 비밀 · 속사정을 아는 인물 (공개 기억에는 의미가 없다)
      });
    }
    // 서약 자동 해소: 프롬프트에 준 [p1] 꼬리표 목록에서 이번 턴에 해소된 것. "p1" 또는 {"tag":"p1","how":"어떻게 풀렸는지"} — 복선은 어떻게 회수됐는지가 기록의 절반이다
    out.settledHow = {};
    out.settledPledges = arr(raw?.settled).map(t => { const tag = String((t && typeof t === 'object' ? t.tag : t) || '').trim().toLowerCase(), how = t && typeof t === 'object' ? cleanStr(t.how, 200) : ''; if (tag && how) out.settledHow[tag] = how; return tag; }).filter(Boolean).slice(0, 8);
    for (const r of (Array.isArray(raw?.canon) ? raw.canon : arr(raw?.world_rules)).slice(0, 8)) {
      const key = toSnake(r?.key), value = cleanStr(r?.value, 200); if (!key || !value) continue;
      out.worldRules.push({ scope: SCOPES.includes(r?.scope) ? r.scope : 'session', scopeName: cleanStr(r?.scope_name, 60), key, value });
    }
    for (const s of (Array.isArray(raw?.status) ? raw.status : arr(raw?.entity_states)).slice(0, 10)) {
      const entity = cleanStr(s?.entity, 60), slot = canonSlot(toSnake(s?.slot)), value = cleanStr(s?.value, 200); if (!entity || !slot || !value) continue;
      out.entityStates.push({ entity, slot, value, claim: s?.claim === 'belief' ? 'belief' : 'objective', owner: na(cleanStr(s?.owner, 60)) });
    }
    for (const l of (Array.isArray(raw?.pledges) ? raw.pledges : arr(raw?.locks)).slice(0, 8)) {
      const summary = cleanStr(l?.summary, 200); if (!summary) continue;
      out.locks.push({ kind: normLockKind(l?.kind), summary, status: l?.status === 'resolved' ? 'resolved' : 'active', priority: [1, 2, 3].includes(Number(l?.priority)) ? Number(l.priority) : 2, owner: na(cleanStr(l?.owner, 60)) });
    }
    const naLike: (v: unknown) => string | null = v => na(cleanStr(v, 120)) || null;
    for (const c of (Array.isArray(raw?.cast) ? raw.cast : arr(raw?.characters)).slice(0, 5)) {
      const name = cleanStr(c?.name, 60); if (!name) continue;
      out.characters.push({
        name, provisional: c?.provisional === true, aka: arr(c?.aka).map(a => cleanStr(a, 60)).filter(Boolean).slice(0, 4),
        role: naLike(c?.role), age: naLike(c?.age), occupation: naLike(c?.occupation), appearance: naLike(c?.appearance) ? cleanStr(c.appearance, 200) : null, voice: naLike(c?.voice) ? cleanStr(c.voice, 200) : null,
        core: naLike(c?.core) ? cleanStr(c.core, 500) : null,             // 바탕 — 카드가 비어 있을 때 한 번만 받는다 (upsertCast 가 덮어쓰기를 막는다)
        line: this.validLine(c?.line, userText, assistantText),          // 실제로 한 대사 한 줄 — 원문에 그대로 있는 문장만 (지어낸 대사는 버린다)
        growth: naLike(c?.growth) ? cleanStr(c.growth, 200) : null,      // 이야기 속에서 생긴, 원인이 분명하고 오래갈 변화
        traits: arr(c?.traits).map(t => cleanStr(t, 40)).filter(Boolean).slice(0, 8),
        relationships: arr(c?.relationships).map(r => ({ target: cleanStr(r?.target, 60), relation: cleanStr(r?.relation, 80) })).filter(r => r.target && r.relation).slice(0, 8),
      });
    }
    // 관계선: 한 사람이 다른 한 사람을 지금 어떻게 대하는가 (방향이 있다 — A→B 와 B→A 는 다른 줄)
    for (const b of arr(raw?.bonds).slice(0, 6)) {
      const from = cleanStr(b?.from, 60), to = cleanStr(b?.to, 60), stage = cleanStr(b?.stage, 120); if (!from || !to || !stage || ekey(from) === ekey(to)) continue;
      out.bonds.push({ from, to, stage, basis: cleanStr(b?.basis, 200), calls: naLike(b?.calls) ? cleanStr(b.calls, 100) : '', unsaid: naLike(b?.unsaid) ? cleanStr(b.unsaid, 160) : '' });
    }
    for (const e of arr(raw?.milestones).slice(0, 4)) { const title = cleanStr(e?.title, 80); if (title) out.milestones.push({ title, summary: cleanStr(e?.summary, 200), participants: arr(e?.participants).map(p => cleanStr(p, 60)).filter(Boolean).slice(0, 6), grade: e?.grade === 'minor' ? 'minor' : 'major' }); }
    for (const it of arr(raw?.items).slice(0, 4)) { const name = cleanStr(it?.name, 60); if (name) out.items.push({ name, meaning: cleanStr(it?.meaning, 160), holder: na(cleanStr(it?.holder, 60)), status: na(cleanStr(it?.status, 60)) }); }
    return out;
  },

  // ── 턴 기록 ──
  /** 바로 앞의 사용자 메시지 — 사이에 다른 답변이 끼어 있으면 짝이 아니다 (숨긴 메시지 · 시스템 메시지는 건너뛴다) */
  findPrecedingUserMessage(msgs, idx) {
    for (let i = idx - 1; i >= 0; i--) { const m = msgs[i]; if (!m) continue; if (m.role === 'user') return m; if (m.role !== 'system' && !m.hidden) return null; }
    return null;
  },
  /**
   * 완결된 (사용자, 답변) 턴 하나를 기록한다. 같은 답변의 턴이 이미 있으면(리롤 · 스와이프 · 편집) 그 턴에서 나온 기록을 걷어내고 같은 자리에 다시 기록한다.
   * force: 숨긴 답변 · 이미 기록된 답변도 다시. retry: 사서를 기다리는 동안 본문이 바뀌었을 때 새 내용으로 다시 기록할 횟수
   */
  async commitOne(chat, msgs, ai, { signal, force = false, retry = 1 } = {}) {
    const cfg = this.cfg();
    await this.waitForChatIdle('턴 기록');   // 답변을 생성하는 중이면 끝날 때까지 기다린다
    const mem = await this.load(chat.id);
    this.reconcile(mem, msgs);
    const idx = msgs.indexOf(ai); if (idx < 0 || ai.role === 'user') return mem;
    if (ai.hidden && !force) return mem;      // 숨긴 메시지는 건너뛰되, 자동 숨김으로 가려진 턴의 재기록(force)은 허용
    if (this.isSideMessage(ai)) return mem;   // 막간은 이야기가 아니다
    const userMes = this.findPrecedingUserMessage(msgs, idx);
    // 사서에게는 화면에 보이는 이야기만 보여준다 — 연출 계획 · 상태창 · 그림 프롬프트 · 서식 태그를 걷어 낸다
    const userText = userMes ? visibleProse(msgText(userMes)) : '', assistantText = visibleProse(msgText(ai)), h0 = mesHashOf(ai);
    if (!assistantText.trim()) return mem;
    const order = new Map(msgs.map((m, i) => [m.id, i]));
    const place = () => { const a = mem.turns.findIndex(t => t.msgId === ai.id); return a >= 0 ? a : mem.turns.filter(t => (order.get(t.msgId) ?? -1) < idx).length; };   // 대화 순서에 맞는 자리
    let at = mem.turns.findIndex(t => t.msgId === ai.id);
    if (at >= 0) { if (!force && !mem.turns[at].failed) return mem; this.clearDerived(mem, ai.id); }   // 이미 같은 내용으로 기록됨
    // 최근 턴 참고 자료 (기록 품질용, 기록 대상 아님)
    const recent = mem.turns.slice(0, place()).map((t, i) => t.digest && `[t${i + 1}] ${t.digest}`).filter(Boolean).slice(-3).join('\n');
    const persona = S.persona(chat), char = S.get('chars', ai.charId) || S.get('chars', chat.charIds?.[0]);
    const userLabel = userMes?.name || persona?.name || 'User', charLabel = ai.name || char?.name || 'Assistant';
    // 활성 서약 목록 — 사서가 이번 턴에 해소된 서약을 판정할 수 있게 꼬리표를 붙여 건넨다
    const openPledges = mem.pledges.filter(l => l.status === 'active').slice(0, 12), pledgeTagMap = new Map<string, Pledge>();
    const pledgeLines = openPledges.map((l, i) => { const tag = `p${i + 1}`; pledgeTagMap.set(tag, l); return `[${tag}] (${normLockKind(l.kind)}) ${l.summary}`; });
    const pledgeDirective = pledgeLines.length ? '\n\nPLEDGE CHECK: the file below lists open pledges with tags like [p1]. If this exchange clearly settles one ON-SCREEN (the secret is revealed, the promise is kept, the thread is closed), include a top-level array "settled" naming the tag and, in one clause, how it was settled, e.g. "settled":[{"tag":"p1","how":"Mina read the letter aloud at dinner"}]. Only what actually happened — never predict, never guess.' : '';
    // 인물 명단 — 누가 아직 카드가 없는지 사서가 추측하지 않게 한다. 명단에 없는 등장인물(주역 포함)은 이번 턴에 바로 카드를 연다.
    // 쓰지 않는 카드도 올린다 — 사용자가 치운 인물을 사서가 새 카드로 되살리지 못하게
    const tracking = cfg.cast !== false;
    const filedCast = tracking ? mem.cast.slice(0, 40).map(c => `${c.name}${c.locked ? ' [LOCKED]' : ''}${!c.core && !c.locked && !c.disabled ? ' [no core yet]' : ''}`) : null;
    const lockedNote = tracking && mem.cast.some(c => c.locked) ? ' Cards marked [LOCKED] are fixed by the user: never restate or revise their name, age, role, occupation, looks, core, voice, or traits — for them file relationship changes and a spoken "line" only.' : '';
    const castLine = !tracking ? '' : filedCast!.length
      ? `Cast already on file: ${filedCast!.join(', ')}. Anyone present in this exchange who is NOT on this list — the leads included — gets a card now; for those already listed, file only meaningful changes. Spell every one of these names EXACTLY as written here (same script, same characters) everywhere you use them this turn: cast names, status "entity" and "owner", and memories "entities". A name respelled (romanized, translated, or abbreviated) opens a second record for the same person, and the two then hold different versions of where they are and how they feel.${lockedNote}\n`
      : 'The cast shelf is empty — no one has a card yet, not even the leads. Anyone characterized in this exchange gets a card now.\n';
    // 관계선의 현재 단계 — 사서가 이미 적힌 단계를 되풀이하거나 몇 단계를 건너뛰어 적지 않게
    const bondLines = (mem.bonds || []).filter(b => !b.disabled && this.bondNow(b)).sort((a, b) => (this.bondNow(b)!.turn || 0) - (this.bondNow(a)!.turn || 0)).slice(0, 12)
      .map(b => { const n = this.bondNow(b)!; return `${b.from} → ${b.to}: ${n.stage}${n.calls ? ` (calls them: ${n.calls})` : ''}`; });
    // 카드 본문은 바탕을 적을 때 필요하다 — 주요 인물의 바탕이 다 적혔으면 이름만 보낸다 (턴마다 수백 토큰 절약)
    const coreSettled = mem.cast.length >= 2 && mem.cast.filter(c => !c.disabled).slice(0, 4).every(c => c.core || c.locked);
    const refBlock = await this.buildReferenceBlock(chat, { lean: coreSettled, ai });
    const userPrompt = [
      refBlock,
      pledgeLines.length ? `Open pledges on file:\n${pledgeLines.join('\n')}\n` : '',
      castLine,
      bondLines.length ? `Bonds on file (current stage — refile one only if this exchange moved it):\n${bondLines.join('\n')}\n` : '',
      recent ? `Already shelved (do not refile) — recent turn digests:\n${recent}\n` : '',
      'The exchange to shelve:',
      `<user name="${userLabel}">\n${userText.slice(0, 4000)}\n</user>`,
      `<assistant name="${charLabel}">\n${assistantText.slice(0, 6000)}\n</assistant>`,
    ].filter(Boolean).join('\n');
    let ext: Extraction | null = null, error = '', answered = false;
    try {   // 읽지 못한 답 · API 오류(순간 혼잡 · 속도 제한) 모두 간격을 두고 세 번까지 (callJson)
      const parsed = await this.callJson(chat, `${this.promptText('archivist')}${this.archivistTrackingDirective()}${pledgeDirective}${this.langLine()}`, userPrompt, cfg.responseTokens || MEMORY_DEFAULTS.responseTokens, signal);
      if (parsed) { answered = true; ext = this.sanitizeExtraction(parsed, userText, assistantText); }
    } catch (e: any) { if (e.name === 'AbortError' || signal?.aborted) throw e; error = e.message || String(e); }
    // 사서를 기다리는 동안 메시지가 바뀌었으면 낡은 결과를 버린다. 삭제 · 교체면 맞추기가 턴을 정리하므로 조용히 물러나고,
    // 내용만 바뀐 경우(편집 · 번역 같은 후처리)는 실패로 찍지 말고 새 내용으로 다시 기록한다
    if (!S.get('chats', chat.id) || (cache.get(chat.id) && cache.get(chat.id) !== mem)) return mem;
    if (!msgs.includes(ai)) { await this.save(mem); return mem; }
    let stale = false;
    if (mesHashOf(ai) !== h0) {
      if (retry > 0) { await this.save(mem); return this.commitOne(chat, msgs, ai, { signal, force, retry: retry - 1 }); }
      stale = true; ext = null; error = tr('memoria.engine.turn.staleLong');   // 재기록도 어긋나면 색인 재시도 대상으로만 남긴다
    }
    const failed = !ext || (!ext.turnSummary && !ext.memories.length);
    if (!ext) this.logActivity('error', tr('memoria.engine.log.turnFailed', { why: stale ? tr('memoria.engine.turn.stale') : tr('memoria.engine.turn.unreadable') }));
    if (!ext) ext = { turnSummary: '', importance: 0.3, elapsedDays: 0, memories: [], worldRules: [], entityStates: [], locks: [], characters: [], milestones: [], items: [], bonds: [], settledPledges: [], settledHow: {} };   // 사서가 실패해도 원문 발췌 기억은 남긴다
    const turn = { msgId: ai.id, hash: mesHashOf(ai), digest: ext.turnSummary, weight: ext.importance, days: cfg.storyClock !== false ? (ext.elapsedDays || 0) : 0, when: '', where: '', failed, error: failed ? (error || (answered ? tr('memoria.engine.turn.nothing') : tr('memoria.engine.turn.noAnswer'))) : '', ts: now() };
    at = mem.turns.findIndex(t => t.msgId === ai.id);   // 기다리는 사이 다른 턴이 지워졌을 수 있다 — 자리를 다시 잡는다
    if (at >= 0) mem.turns[at] = turn; else { at = place(); mem.turns.splice(at, 0, turn); if (at < mem.turns.length - 1) this.shiftTurns(mem, at, 1); }
    if (stale) { await this.save(mem); return mem; }
    // 원문 증거 기억(항상 남긴다) — 사서 없이도 회상할 수 있게. 요약 자리에는 턴 기록(없으면 첫 문장)만 넣고, 원문 발췌는 인용 칸에만 둔다.
    // 사서가 턴 기록에 원문을 그대로 복사해 온 경우(부분 문자열 일치)도 첫 문장으로 바꾼다
    const rawEpisode = cleanStr(assistantText, 240), digestIsCopy = ext.turnSummary && ext.turnSummary.length > 120 && cleanStr(assistantText, 100000).includes(ext.turnSummary);
    const episodeSummary = ext.turnSummary && !digestIsCopy ? ext.turnSummary : firstSentence(assistantText);
    if (digestIsCopy) turn.digest = episodeSummary;
    const rows: ExtMemory[] = [{ kind: 'event', summary: episodeSummary, excerpt: rawEpisode === episodeSummary ? null : rawEpisode, importance: Math.max(0.25, ext.importance - 0.1), entities: [charLabel], tags: ['episode_raw'], visibility: 'public', owner: null }, ...ext.memories];
    for (const m of rows) {
      const visibility = m.visibility || 'public';
      mem.memories.push({ id: uid(), turn: at, msgId: ai.id, kind: m.kind, summary: m.summary, quote: m.excerpt || '', importance: m.importance, entities: [...new Set((m.entities || []).map(e => this.canonName(mem, e)).filter(Boolean))], tags: m.tags || [], hints: m.hints || [],
        visibility, owner: m.owner ? this.canonName(mem, m.owner) : '', knowers: visibility === 'public' ? [] : (m.knowers || []).map(e => this.canonName(mem, e)), pinned: false, disabled: false, manual: false, trigger: '', ts: now() });
    }
    for (const r of ext.worldRules) this.upsertWorldRule(mem, r, at, ai.id);
    for (const s of ext.entityStates) this.upsertEntityState(mem, s, at, ai.id);
    for (const l of ext.locks) this.upsertLock(mem, l, at, ai.id);
    // 이 턴이 끝난 시점의 작중 시간 · 장소를 턴에 찍어 둔다 — 요약이 "언제 · 어디서"를 지어내지 않고 받아 적게.
    // 답변에 상태창이 있으면 그쪽이 더 정확하다 (모델이 적은 그대로)
    const sceneAt = this.scene(mem), ownBar = this.messageStatusBars(ai).slice(-1)[0];
    turn.when = ownBar?.when || [sceneAt.date, sceneAt.time].filter(Boolean).join(' ') || '';
    turn.where = ownBar?.place || sceneAt.location || '';
    // 사서가 해소됐다고 판정한 서약 (스와이프 때 되돌릴 수 있게 턴을 적어 둔다). 직접 적은 서약은 사서가 닫지 못한다 — "해소된 듯" 의견만 붙인다
    for (const tag of ext.settledPledges || []) {
      const lock = pledgeTagMap.get(tag); if (!lock || lock.status !== 'active') continue;
      if (lock.manual) { lock.suggestResolved = true; lock.suggestTurn = at; lock.suggestBy = ai.id; }
      else { lock.status = 'resolved'; lock.resolvedTurn = at; lock.resolvedBy = ai.id; lock.resolution = ext.settledHow?.[tag] || null; }   // 어떻게 풀렸는지 (복선 회수의 기록)
    }
    for (const b of ext.bonds || []) this.upsertBond(mem, b, at, { msgId: ai.id });
    if (tracking) for (const c of ext.characters || []) this.upsertCast(mem, c, at, ai.id);
    if (cfg.milestones) for (const e of ext.milestones || []) this.upsertMilestone(mem, e, at, ai.id);
    if (cfg.items) for (const it of ext.items || []) this.upsertItem(mem, it, at, ai.id);
    mem.clockDays = mem.turns.reduce((a, t) => a + (t.days || 0), 0);
    this.prune(mem);
    if (!turn.failed) this.logActivity('record', tr('memoria.engine.log.recorded', { n: at + 1, count: rows.length }));
    await this.save(mem);
    if (!failed) await this.embedMemories(chat, mem, { signal }).catch(e => console.warn('[장기기억] 임베딩', e));
    await this.waitForChatIdle('요약·서고 정리');   // 요약 · 정리는 급하지 않다 — 그사이 새 답변을 생성하기 시작했으면 끝난 뒤에 한다
    await this.housekeeping(chat, mem, signal);
    const slept = this.sleepStaleThreads(mem);
    if (slept) { this.logActivity('summary', tr('memoria.engine.log.slept', { n: slept })); await this.save(mem); }
    return mem;
  },
  commitTurn(chat, msgs, ai, opts) { return this.commitOne(chat, msgs, ai, opts); },
  /** 오래 손대지 않은 떡밥을 잠재운다 (지우지 않는다 — 서고에 남고, 다시 언급되면 깨어난다). 직접 적은 것과 최우선(P1)은 건드리지 않는다. 반환: 잠재운 수 */
  sleepStaleThreads(this: MemoryApi, mem, after = Number(this.cfg().threadSleepTurns) || 0) {
    if (!(after > 0)) return 0;
    const turnNow = mem.turns.length - 1; let slept = 0;
    for (const l of mem.pledges || []) {
      if (l.status !== 'active' || l.manual || !THREAD_KINDS.includes(l.kind) || (l.priority ?? 2) <= 1) continue;
      if (turnNow - (l.turn || 0) < after) continue;
      l.status = 'dormant'; l.sleptTurn = turnNow; slept++;
    }
    return slept;
  },

  // ── 서가별 넣기 ──
  upsertWorldRule(mem, rule, turn, msgId = '') {
    upsertRow(mem.canon, mem.canon.findIndex(r => r.scope === rule.scope && (r.scopeName || '') === (rule.scopeName || '') && r.key === rule.key), { ...rule, scopeName: rule.scopeName || '' }, turn, msgId);
  },
  upsertEntityState(mem, state, turn, msgId = '') {
    // 이름 별칭 병합: 사서가 같은 인물을 원어 · 로마자로 번갈아 적어도 인물 카드의 이름 한 줄로 합친다. 슬롯 별칭도 같은 줄로
    state = { ...state, entity: this.canonName(mem, state.entity), slot: canonSlot(state.slot), claim: state.claim === 'belief' ? 'belief' : 'objective', owner: state.owner ? this.canonName(mem, state.owner) : '' };
    upsertRow(mem.status, mem.status.findIndex(s => ekey(s.entity) === ekey(state.entity) && canonSlot(s.slot) === state.slot && (s.claim || 'objective') === state.claim && ekey(s.owner || '') === ekey(state.owner)), state, turn, msgId);
  },
  upsertLock(mem, lock, turn, msgId = '') {
    lock = { ...lock, owner: lock.owner || '' };
    let idx = mem.pledges.findIndex(l => l.kind === lock.kind && l.summary === lock.summary);
    if (idx < 0) idx = mem.pledges.findIndex(l => l.kind === lock.kind && overlap(l.summary, lock.summary) >= 0.55);   // 같은 종류의 사실상 같은 서약(문구만 다른 재발행)은 새 문구로 갱신 — 목록 증식 방지
    if (idx < 0) { const row = { id: pledgeId(mem), ...lock, turn, createdTurn: turn, prev: null, prevTurn: null, msgId }; mem.pledges.push(row); return row; }
    const cur = mem.pledges[idx];
    if (cur.manual && !lock.manual) return cur;   // 직접 적은 서약은 사서의 재발행이 건드리지 못한다
    const createdTurn = cur.createdTurn ?? cur.created ?? cur.turn;   // 다시 적혀도 "처음 생긴 턴"은 지킨다
    if (cur.summary === lock.summary && cur.status === lock.status && cur.priority === lock.priority && (cur.owner || '') === lock.owner) {   // 내용은 그대로, 재확인만 — 이전 값 이력은 건드리지 않는다
      cur.turn = turn; cur.createdTurn = createdTurn; if (msgId && cur.msgId !== msgId && cur.updMsgId !== msgId) cur.reMsgId = msgId;
      return cur;
    }
    // 내용이 실제로 바뀐 재발행 — 이전 값을 남겨 둬야 이 턴이 지워질 때 되돌릴 수 있다
    return mem.pledges[idx] = { id: cur.id, ...lock, turn, manual: cur.manual || lock.manual || false, createdTurn, msgId: cur.msgId || '', updMsgId: msgId, reMsgId: '', prev: { summary: cur.summary, status: cur.status, priority: cur.priority, owner: cur.owner || '' }, prevTurn: cur.turn };
  },
  /** 연표: 같은 제목 또는 사실상 같은 사건이면 건너뛴다 */
  upsertMilestone(mem, e, turn, msgId = '') {
    const incoming = `${e.title || ''} ${e.summary || ''}`;
    if (mem.milestones.some(x => low(x.title) === low(e.title) || overlap(`${x.title || ''} ${x.summary || ''}`, incoming) >= 0.7)) return;
    mem.milestones.push({ id: uid(), ...e, turn, msgId, manual: false });
  },
  /** 물건: 이름 기준 병합 — 의미는 새 정보만 채우고 가진 이 · 상태는 최신값으로 */
  upsertItem(mem, it, turn, msgId = '') {
    const old = mem.items.find(x => low(x.name) === low(it.name));
    if (!old) { mem.items.push({ id: uid(), ...it, turn, first: turn, updated: turn, msgId, disabled: false, manual: false }); return; }
    if (it.meaning && !old.meaning) old.meaning = it.meaning; if (it.holder) old.holder = it.holder; if (it.status) old.status = it.status; old.updated = turn;
  },

  // ── 이름 정규화 — 한 사람이 두 이름으로 갈라지는 것을 막는다 ──
  /** 별칭으로 적힌 이름을 인물 카드의 이름으로 */
  canonName(mem, name) { const raw = String(name || '').trim(), k = ekey(raw); if (!k) return raw; const c = mem.cast.find(x => ekey(x.name) === k || (x.aka || []).some(a => ekey(a) === k)); return c ? c.name : raw; },
  /** 상태 보드 · 기억 · 약속 · 관계 · 관계선에 적힌 이름을 인물 카드의 이름으로 접고, 그 결과 같아진 줄을 합친다 (카드를 합치거나 다른 이름을 고쳤을 때). 반환: 바뀐 수 { states, memories } */
  foldAliases(mem) {
    let states = 0, memories = 0; const by = new Map<string, StatusRow>(), kept: StatusRow[] = [];
    for (const s of mem.status) {
      const c = this.canonName(mem, s.entity); if (c !== s.entity) { s.entity = c; states++; }
      if (s.owner) s.owner = this.canonName(mem, s.owner);
      const k = `${ekey(s.entity)}|${canonSlot(s.slot)}|${s.claim || ''}|${ekey(s.owner)}`, p = by.get(k);
      if (!p) { by.set(k, s); kept.push(s); continue; }
      const win = (s.turn || 0) >= (p.turn || 0) ? s : p, lose = win === s ? p : s;   // 같은 줄이 둘이면 최신 턴을 남기고, 처음 생긴 턴은 더 이른 쪽을 물려받는다
      win.createdTurn = Math.min(win.createdTurn ?? win.turn ?? 0, lose.createdTurn ?? lose.turn ?? 0);
      if (win !== p) { by.set(k, win); kept[kept.indexOf(p)] = win; } states++;
    }
    mem.status = kept;
    for (const m of mem.memories) {
      if (m.owner) m.owner = this.canonName(mem, m.owner);
      if (m.knowers?.length) m.knowers = [...new Set(m.knowers.map(k => this.canonName(mem, k)))];
      if (!m.entities?.length) continue;
      const f: string[] = []; let touched = false;
      for (const e of m.entities) { const c = this.canonName(mem, e); if (c !== e) touched = true; if (!f.some(x => ekey(x) === ekey(c))) f.push(c); }
      if (touched || f.length !== m.entities.length) { m.entities = f; delete m.av; delete m.acv; memories++; }   // 인물 이름은 색인 글에 들어가므로 벡터를 다시 잡는다
    }
    for (const l of mem.pledges) if (l.owner) l.owner = this.canonName(mem, l.owner);
    for (const c of mem.cast) for (const r of c.relationships || []) r.target = this.canonName(mem, r.target);
    // 관계선 — 이름을 접은 뒤 같은 방향의 줄이 둘이 되면 지나온 길을 시간순으로 합친다
    const bondBy = new Map<string, Bond>();
    for (const b of mem.bonds || []) {
      b.from = this.canonName(mem, b.from); b.to = this.canonName(mem, b.to);
      const k = this.bondKey(b.from, b.to), p = bondBy.get(k);
      if (!p) { bondBy.set(k, b); continue; }
      p.log = [...p.log, ...b.log].sort((a, z) => (a.turn || 0) - (z.turn || 0)).slice(-BOND_LOG_MAX); p.manual = p.manual || b.manual; b.log = [];
    }
    if (mem.bonds) mem.bonds = mem.bonds.filter(b => b.log?.length && ekey(b.from) !== ekey(b.to));
    return { states, memories };
  },

  // ── 인물 카드 ──
  /** 이 인물의 남긴 말을 모을 것인가. 사용자의 캐릭터는 사용자가 직접 쓰므로 모델에게 말투 표본을 보여줄 이유가 없다 — 소설 · 풀사칭 방식에서만 모은다 */
  keepsLinesFor(mem, card) {
    const chat = mem?.id ? S.get('chats', mem.id) : null; let me = ''; try { me = chat ? S.persona(chat)?.name || '' : ''; } catch { }
    const mine = [card.name, ...(card.aka || [])].some(n => ekey(n) === ekey(me));
    return !mine || this.perspective(mem) === NARRATOR;
  },
  /** 남긴 말 추가 — 같은 말은 한 번만, 넘치면 고정하지 않은 가장 오래된 것부터 밀어낸다 */
  addCharacterLine(card, text, turn, msgId = '') {
    const lines = Array.isArray(card.lines) ? card.lines : (card.lines = []), clean = cleanStr(text, 160);
    if (!clean || lines.some(l => l.text === clean)) return false;
    lines.push(msgId ? { text: clean, turn, msgId } : { text: clean, turn });
    while (lines.length > CHARACTER_LINES_MAX) { const idx = lines.findIndex(l => !l.pinned); if (idx < 0) { lines.pop(); break; } lines.splice(idx, 1); }
    return true;
  },
  /** 인물 카드 합치기: src 를 keep 으로 접는다 (이름은 다른 이름으로 남긴다) */
  mergeCast(mem, keep, src) {
    keep.aka = [...new Set([...(keep.aka || []), src.name, ...(src.aka || [])])].filter(a => a && low(a) !== low(keep.name)).slice(0, 8);
    for (const k of ['role', 'age', 'occupation', 'appearance', 'voice']) if (!keep[k] && src[k]) keep[k] = src[k];
    keep.traits = [...new Set([...(keep.traits || []), ...(src.traits || [])])].slice(0, 10);
    if (!keep.core && src.core) { keep.core = src.core; keep.coreTurn = src.coreTurn ?? null; keep.coreMsgId = src.coreMsgId || ''; }
    for (const l of src.lines || []) this.addCharacterLine(keep, l.text, l.turn || 0, l.msgId || '');
    keep.growth = [...(keep.growth || []), ...(src.growth || [])].sort((a, b) => (a.turn || 0) - (b.turn || 0)).slice(-CHARACTER_GROWTH_MAX);
    for (const r of src.relationships || []) if (!(keep.relationships ||= []).some(x => low(x.target) === low(r.target))) keep.relationships.push(r);
    keep.relationships = (keep.relationships || []).slice(0, 10);
    keep.first = Math.min(keep.first ?? Infinity, src.first ?? Infinity); if (!isFinite(keep.first)) delete keep.first;
    keep.updated = Math.max(keep.updated || 0, src.updated || 0); keep.provisional = keep.provisional === true && src.provisional === true;
    if (src.manual) keep.manual = true; if (src.locked) keep.locked = true;   // 접힌 쪽이 고정돼 있었다면 보호를 물려받는다
    mem.cast = mem.cast.filter(c => c !== src);
    return this.foldAliases(mem);   // 카드만 합치고 끝내면 상태 보드에는 접힌 이름의 줄이 그대로 남는다 — 기록까지 같은 이름으로 접는다
  },
  /**
   * 인물 카드: 새 정보만 채우고, 관계는 대상별 최신값으로. 이름 또는 다른 이름이 겹치면 같은 인물 — 이름 없는 인물의 호칭 카드가 본명 카드로 접힌다.
   * 고정된 카드는 프로필 칸(이름 · 다른 이름 · 역할 · 나이 · 직업 · 외모 · 말투 · 특성 · 바탕 · 달라진 점)이 얼고 관계와 남긴 말만 갱신된다.
   * c: { name, aka, provisional, role, age, occupation, appearance, voice, core, line, growth(글 한 줄), traits, relationships, locked }
   */
  upsertCast(mem, c, turn, msgId = '') {
    const name = cleanStr(c?.name, 60); if (!name) return null;
    const aka = list(c.aka ?? c.aliases).map(a => cleanStr(a, 60)).filter(Boolean), findCard: (n: string) => CastCard | undefined = n => mem.cast.find(x => low(x.name) === low(n) || (x.aka || []).some(a => low(a) === low(n)));
    const val: (k: string) => string = k => typeof c[k] === 'string' ? na(c[k]) : '', line = val('line'), growth = val('growth'), core = val('core'), traits = list(c.traits).map(t => cleanStr(t, 40)).filter(Boolean);
    const rels = list(c.relationships).map(r => ({ target: cleanStr(r?.target, 60), relation: cleanStr(r?.relation, 80) })).filter(r => r.target && r.relation);
    let card = findCard(name);
    // 정체 공개: 새 카드가 aka 로 기존 카드(옛 호칭)를 가리키면 그 카드를 본명으로 올린다. 고정된 카드는 이름도 사용자가 정한 그대로
    if (!card && aka.length) for (const handle of aka) {
      const old = findCard(handle); if (!old) continue;
      card = old;
      if (!card.locked) { card.aka = [...new Set([...(card.aka || []), card.name, ...aka])].filter(a => low(a) !== low(name)).slice(0, 6); card.name = name; card.provisional = false; }
      break;
    }
    if (!card) {
      card = { id: uid(), name, provisional: c.provisional === true, core, coreTurn: core ? turn : null, coreMsgId: core ? msgId : '', lines: [], growth: growth ? [msgId ? { text: growth, turn, msgId } : { text: growth, turn }] : [], traits: traits.slice(0, 10), relationships: rels.slice(0, 10),
        aka: aka.filter(a => low(a) !== low(name)).slice(0, 6), first: turn, updated: turn, disabled: false, manual: false, locked: c.locked === true, prev: null, prevTurn: null, msgId, firstMsgId: msgId };
      for (const k of ['role', 'age', 'occupation', 'appearance', 'voice']) if (val(k)) card[k] = val(k);
      if (line && this.keepsLinesFor(mem, card)) this.addCharacterLine(card, line, turn, msgId);
      mem.cast.push(card);
      return card;
    }
    if (card.disabled) return card;   // 쓰지 않는 카드는 기록도 얼린다 — 사용자가 치운 인물을 사서가 계속 되살리지 못하게
    if (!card.locked) {
      if (aka.length) card.aka = [...new Set([...(card.aka || []), ...aka])].filter(a => low(a) !== low(card.name)).slice(0, 6);
      if (card.provisional && c.provisional !== true) card.provisional = false;
      // 실제로 내용이 바뀌는지 먼저 본다 — 재확인(변화 없음)이면 이전 값 이력을 건드리지 않는다
      const scalarChanged = ['role', 'age', 'occupation', 'appearance', 'voice'].some(k => val(k) && val(k) !== card[k]), incoming = traits.filter(t => !(card.traits || []).includes(t));
      if (scalarChanged || incoming.length) {   // 이 턴이 지워지면 되돌릴 수 있게, 바뀌기 직전 값을 한 단계만 남겨 둔다
        card.prev = { role: card.role, age: card.age, occupation: card.occupation, appearance: card.appearance, voice: card.voice, traits: card.traits ? [...card.traits] : [] };
        card.prevTurn = card.updated; card.prevBy = msgId;
      }
      for (const k of ['role', 'age', 'occupation', 'appearance', 'voice']) if (val(k)) card[k] = val(k);
      if (traits.length) card.traits = [...new Set([...(card.traits || []), ...traits])].slice(0, 10);
      // 바탕은 한 번 적히면 사서가 다시 쓰지 못한다 — 장면 하나가 사람을 새로 규정하지 못하게.
      // 바꾸는 길은 사용자의 직접 수정뿐이고, 달라진 점은 growth 에 원인과 함께 따로 쌓인다
      if (core && !card.core) { card.core = core; card.coreTurn = turn; card.coreMsgId = msgId; }
      if (growth) {
        const notes = Array.isArray(card.growth) ? card.growth : (card.growth = []);
        if (!notes.some(g => overlap(g.text, growth) >= 0.7)) notes.push(msgId ? { text: growth, turn, msgId } : { text: growth, turn });
        card.growth = notes.slice(-CHARACTER_GROWTH_MAX);
      }
      if (c.locked === true) card.locked = true;
    }
    // 남긴 말은 고정된 카드에도 모은다 — 프로필이 아니라 "실제로 한 말"의 표본이라 설정을 바꾸지 않는다
    if (line && this.keepsLinesFor(mem, card)) this.addCharacterLine(card, line, turn, msgId);
    for (const rel of rels) { const arr = card.relationships || (card.relationships = []), i = arr.findIndex(r => low(r.target) === low(rel.target)); if (i >= 0) arr[i] = rel; else arr.push(rel); card.relationships = arr.slice(0, 10); }
    card.updated = turn; if (msgId) card.msgId = msgId;
    return card;
  },

  // ── 관계선 — 감정선의 현재 단계와 지나온 길 ──
  // 인물 카드의 relationships 는 "소꿉친구" · "상사"처럼 변하지 않는 사이를 적는 칸이고, 기억의 relationship 종류는 회상 경쟁에서 밀리면 보이지 않는다.
  // 그래서 관계가 지금 어디까지 와 있는지는 늘 실리는 줄로 따로 둔다: 단계, 그 근거가 된 장면, 서로를 부르는 말, 아직 말하지 못한 것.
  // 단계가 바뀔 때마다 이전 단계를 남겨 감정선이 지나온 길을 보여준다 — 모델이 갑자기 몇 단계를 건너뛰거나 처음으로 되돌아가지 않게
  bondKey(from, to) { return `${ekey(from)}\u0001${ekey(to)}`; },
  bondNow(b) { return b?.log?.[b.log.length - 1] || null; },
  /** b: { from, to, stage, basis, calls, unsaid }. opts: { manual, msgId }. 반환: 관계선 줄 (받지 않았으면 null) */
  upsertBond(mem, b, turn, { manual = false, msgId = '' } = {}) {
    const from = this.canonName(mem, b.from), to = this.canonName(mem, b.to);
    if (!from || !to || ekey(from) === ekey(to)) return null;
    if (!Array.isArray(mem.bonds)) mem.bonds = [];
    let row = mem.bonds.find(x => this.bondKey(x.from, x.to) === this.bondKey(from, to));
    if (row?.disabled && !manual) return null;   // 사용자가 치운 줄은 사서가 되살리지 않는다
    const entry: BondStep = { turn, stage: b.stage, basis: b.basis || '', calls: b.calls || '', unsaid: b.unsaid || '' };
    if (manual) entry.manual = true; else if (msgId) entry.msgId = msgId;
    if (!row) { row = { id: uid(), from, to, log: [entry], manual, disabled: false }; mem.bonds.push(row); return row; }
    const last = this.bondNow(row);
    if (last && !manual) { if (!entry.calls) entry.calls = last.calls || ''; if (!entry.basis) entry.basis = last.basis || ''; }   // 사서가 비워 보낸 칸은 "변화 없음"이다 — 부르는 말이 한 번 빠졌다고 지워지지 않게 이어받는다
    if (last && last.stage === entry.stage && (last.calls || '') === entry.calls && (last.unsaid || '') === entry.unsaid) return row;   // 재확인일 뿐
    if (last && (msgId ? last.msgId === msgId : last.turn === turn) && !last.manual && !manual) row.log[row.log.length - 1] = last.was ? { ...entry, was: last.was } : entry;   // 같은 턴의 재기록
    else if (last && !manual && !last.manual && this.sameBondStep(last, entry)) {
      // 같은 단계를 다듬어 적은 것 — 계단을 새로 놓지 않고 그 칸의 글만 고친다. 고치기 전 글은 was 에 맡아 뒀다가, 이 턴이 지워지면 되돌린다
      const { was, ...before } = last;
      row.log[row.log.length - 1] = { ...entry, was: before };
    } else row.log.push(entry);
    if (row.log.length > BOND_LOG_MAX) row.log = row.log.slice(-BOND_LOG_MAX);
    return row;
  },
  /**
   * 새로 온 단계가 직전 단계와 "같은 계단"인가. 사서는 관계가 움직이지 않았는데도 같은 단계를 말만 바꿔 다시 적곤 한다.
   * 직전 단계가 적힌 지 몇 턴 안 됐거나 문구가 크게 겹치면 새 계단이 아니라 같은 계단을 고쳐 쓴 것으로 본다 — 감정선은 그렇게 빨리 여러 칸을 오르지 않는다
   */
  sameBondStep(last, next) { if ((next.turn || 0) - (last.turn || 0) <= BOND_SETTLE_TURNS) return true; return overlap(last.stage, next.stage) >= 0.45; },
  /** 이미 쌓인 계단 가운데 같은 계단을 되풀이한 것을 하나로 접는다 (마지막 문구를 남긴다). 반환: 접힌 것이 있었는지 */
  compactBondLog(row) {
    const out: BondStep[] = [];
    for (const e of row.log || []) { const prev = out[out.length - 1]; if (prev && !prev.manual && !e.manual && this.sameBondStep(prev, e)) out[out.length - 1] = { ...e, turn: e.turn }; else out.push(e); }
    const changed = out.length !== (row.log || []).length; row.log = out;
    return changed;
  },
  /** 관계선 한 줄 — 현재 단계와 근거, 부르는 말, 말하지 못한 것, 지나온 길 */
  formatBondLine(b, { path = true } = {}) {
    const n = this.bondNow(b); if (!n) return '';
    const bits = [n.stage]; if (n.basis) bits.push(`shown by: ${n.basis}`); if (n.calls) bits.push(`calls them: ${n.calls}`); if (n.unsaid) bits.push(`unsaid: ${n.unsaid}`);
    const earlier: string[] = []; for (const e of b.log.slice(0, -1)) if (e.stage !== n.stage && earlier[earlier.length - 1] !== e.stage) earlier.push(e.stage);
    return `- ${b.from} → ${b.to}: ${bits.join(' | ')}${path && earlier.length ? ` | path: ${earlier.slice(-2).join(' → ')} → now` : ''}`;
  },

  // ── 다른 이름으로도 부를 수 있게 ──
  removeDerivedForTurn(mem, msgId) { return this.clearDerived(mem, msgId); },
  canonEntityName(mem, name) { return this.canonName(mem, name); },
  foldEntityAliases(mem) { return this.foldAliases(mem); },
  upsertCharacter(mem, c, turn, msgId) { return this.upsertCast(mem, c, turn, msgId); },
  mergeCharacterCards(mem, keep, absorb) { return this.mergeCast(mem, keep, absorb); },
  pruneMemories(mem) { return this.prune(mem); },
  getSceneSnapshot(mem) { return this.scene(mem); },

  /** 기억이 너무 많으면 요약으로 이미 보존된 옛 기억부터, 덜 중요한 순으로 정리한다 */
  prune(mem) {
    const max = Math.max(50, this.cfg().maxMemories || 400); if (mem.memories.length <= max) return;
    const need = mem.memories.length - max, key: (m: MemItem) => number = m => (m.importance || 0) + (m.turn || 0) / 10000;
    let pool = mem.memories.filter(m => !m.pinned && !m.manual && (m.turn ?? 0) < (mem.chunked || 0)).sort((a, b) => key(a) - key(b));
    if (pool.length < need) pool = mem.memories.filter(m => !m.pinned && !m.manual).sort((a, b) => key(a) - key(b));
    const gone = new Set(pool.slice(0, need).map(m => m.id));
    mem.memories = mem.memories.filter(m => !gone.has(m.id));
  },

  // ════════ 요약 · 연대기 · 서고 정리 ════════
  /** 턴이 쌓이면: 묶음 요약(WHEN/PLOT/SHIFTS/OPEN) → 서고 정리 + 묶음을 사건별로 다시 묶기 → 연대기 정리 → 옛 이야기 접기. 반환: 새로 만든 묶음 수 */
  async housekeeping(chat, mem, signal) {
    const before = mem.chunks.length + mem.arcs.length;
    const made = await this.maybeSummarizeChunk(chat, mem, { signal });
    await this.maybeConsolidate(chat, mem, signal);
    await this.maybeConsolidateArcs(chat, mem, signal);
    await this.maybeFoldEras(chat, mem, signal);
    if (mem.chunks.length + mem.arcs.length !== before) this.logActivity('summary', tr('memoria.engine.log.summaryUpdated'));
    await this.save(mem);
    return made;
  },
};
