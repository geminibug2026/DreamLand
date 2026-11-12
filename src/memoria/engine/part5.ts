// memory.js 2299–2693 줄을 그대로 옮긴 것. 본문은 고치지 않고 타입(Part5)만 붙인다
import type { MemoryApi } from './api';
import type { HistoryMsg } from './part3';
import type { CastInput } from './part2';
import type { Mem, MemItem, Msg, ChatM, Plan, Relation, Bond, BondStep, CastNote, CanonRow, StatusRow } from '../types';
import { KINDS, LOCKS, VIS, SCOPES, NARRATOR, PUBLIC_ONLY, SHELVES, SHELF_LABELS, DOSSIER_MAX, CHARACTER_LINES_MAX, CHARACTER_GROWTH_MAX, empty, clamp01, str, list, snake, clip, low, cleanStr, toSnake, canonSlot, copy, cleanRecord, visibleProse, prose, ekey, cleanMultiline, parseLoose, fmtDays, ago, normKind, normLockKind, normVisibility, overrides, audits, lasts, freezes, PACKET_HEADER, PACKET_FOOTER } from './base';
import { S, DB, uid, now, msgText, emit } from './legacy';
import * as MP from '../prompts';
import { stripPhrases } from '../craft';

/** AI 에게 보내는 메시지 한 줄 (글 또는 조각 목록) */
export interface PromptPart { type?: string; text?: string; [k: string]: unknown }
export interface PromptMsg { role?: string; content?: string | PromptPart[] | null; [k: string]: unknown }
/** 인물 카드 정정 내용 (편집안 character 의 patch) */
export interface EditorCastPatch { role?: string; age?: string; occupation?: string; appearance?: string; voice?: string; core?: string; traits?: string[]; aka?: string[]; relationships?: Relation[] }
/** 사서가 내놓는 편집안 하나 — op 에 따라 쓰는 칸이 다르다 (사서의 JSON 그대로라 칸은 믿을 수 없다) */
export interface EditorOp {
  op: string;
  /** canon */
  key?: string; value?: string; scope?: string; scopeName?: string;
  /** status */
  entity?: string; slot?: string; claim?: string; owner?: string;
  /** clock — 턴 번호는 t1 부터 */
  fromTurn?: number | string; toTurn?: number | string; totalDays?: number | string;
  /** 기억 · 요약 · 서약 */
  id?: string; kind?: string; summary?: string; text?: string; importance?: number | string; status?: string; priority?: number | string;
  /** character */
  name?: string; patch?: EditorCastPatch;
  /** bond */
  from?: string; to?: string; stage?: string; basis?: string; calls?: string; unsaid?: string;
}
/** 말로 고치기 대화의 한 줄 */
export interface EditorLogEntry { role: string; text?: string; content?: string; ops?: EditorOp[] }
export interface EditorProposal { reply: string; ops: EditorOp[] }
/** 복구 지점 (data 는 서고 JSON) */
export interface CheckpointInfo { id: string; label: string; at: number; turn: number; bytes: number }
export interface CheckpointPoint extends CheckpointInfo { data: string }
/** kv 저장소의 복구 지점 줄 */
export interface CheckpointRow { id: string; list: CheckpointPoint[] }
/** 두 서고의 차이 한 줄 */
export interface DiffChange { shelf: string; id: string; type: 'added' | 'removed' | 'changed'; before: string; after: string; impBefore?: number; impAfter?: number }
/** 내보낸 파일 */
export interface ExportPayload { type: 'dreamland-memoria'; version: number; exportedAt: string; chatId: string; chatName: string; store: Mem }
/** 읽어 들일 파일 — 내보낸 파일 · 다른 형식(memoria-export) · 서고 그대로 */
export interface ImportPayload { type?: string; chatId?: string; chatName?: string; store?: unknown; [k: string]: unknown }
export interface ImportResult { foreign: boolean; label: string; store: Mem }
/** 이어받을 서고 — 모양이 어긋난 줄이 섞여 있을 수 있다 */
export type CarrySource = Partial<Mem>;
export interface CarryCount { summaries: number; memories: number; cast: number; canon: number; pledges: number; bonds?: number }

/** diff 가 읽는 칸 — 선반마다 다른 줄을 한 꼴로 본다 */
interface ShelfRow {
  id?: string; msgId?: string; importance?: number; disabled?: boolean; summary?: string; text?: string; title?: string; owner?: string; status?: string; kind?: string;
  name?: string; role?: string; age?: string; occupation?: string; appearance?: string; voice?: string; aka?: string[]; core?: string; traits?: string[]; growth?: CastNote[]; lines?: CastNote[]; relationships?: Relation[]; locked?: boolean;
  visibility?: string; knowers?: string[]; pinned?: boolean;
  entity?: string; slot?: string; value?: string; claim?: string; scopeName?: string; scope?: string; key?: string;
  priority?: number; resolution?: string | null;
  from?: string | number; to?: string | number; log?: BondStep[];
  holder?: string; meaning?: string; chunks?: string[];
  digest?: string; days?: number; when?: string; where?: string;
}
/** 다른 형식(memoria-export)의 서고 — 칸 이름이 다르다. 칸마다 믿을 수 없어 읽을 때 걸러 낸다 */
interface ForeignStore {
  memories?: { summary: string; kind: string; excerpt?: string; importance?: number; entities?: string[]; tags?: string[]; hints?: string[]; visibility: string; owner?: string; knowers?: unknown[]; pinned?: boolean; manual?: boolean; disabled?: boolean; trigger?: string }[];
  worldRules?: { key: string; value?: string; scope: string; scopeName?: string }[];
  entityStates?: { entity: string; slot?: string; value?: string; claim?: string; owner?: string }[];
  locks?: { summary: string; kind?: string; status: string; resolution?: string; priority: number | string; owner?: string; manual?: boolean }[];
  characters?: {
    name: string; aliases?: string[]; role?: string; age?: string; occupation?: string; appearance?: string; voice?: string; core?: string;
    lines?: { text: string; pinned?: boolean }[]; growth?: { text: string }[]; traits?: string[]; relationships?: Relation[]; locked?: boolean; provisional?: boolean; disabled?: boolean;
  }[];
  bonds?: { from: string; to: string; manual?: boolean; disabled?: boolean; log?: { stage: string; turn: number | string; basis?: string; calls?: string; unsaid?: string; manual?: boolean }[] }[];
  bondRev?: number;
  arcSummaries?: { text: string }[]; chunkSummaries?: { text: string }[];
  milestones?: { title: string; summary?: string; participants?: string[]; grade?: string }[];
  items?: { name: string; meaning?: string; holder?: string; status?: string }[];
  dossier?: { title: string; chunks: unknown[]; disabled?: boolean }[];
}

/** 이 조각이 맡는 Memory 메서드의 서명 */
export interface Part5 {
  packetRewritePrompt(narratorMode?: boolean): string;
  rewritePacketWithLibrarian(chat: ChatM, history: HistoryMsg[] | null | undefined, signal?: AbortSignal, opts?: { msgs?: Msg[] }): Promise<string>;
  rewritePacket(chat: ChatM, history: HistoryMsg[] | null | undefined, signal?: AbortSignal, opts?: { msgs?: Msg[] }): Promise<string>;
  direct(chat: ChatM, msgs: Msg[], signal?: AbortSignal): Promise<Plan | null>;
  runSupervisor(chat: ChatM, msgs: Msg[], signal?: AbortSignal): Promise<Plan | null>;
  received(chat: ChatM, msg: Msg): Promise<void>;
  auditRecallEcho(chat: ChatM, msg: Msg): Promise<void>;
  maskBannedInPrompt(messages: PromptMsg[] | null | undefined, type?: string): number;
  dump(mem: Mem): string;
  ask(chat: ChatM | null | undefined, question: string, signal?: AbortSignal, opt?: { msgs?: Msg[] | null }): Promise<string>;
  askLibrarian(chat: ChatM | null | undefined, question: string, signal?: AbortSignal, opt?: { msgs?: Msg[] | null }): Promise<string>;
  buildEditorArchiveText(chat: ChatM, mem: Mem, instruction: string, msgs?: Msg[] | null): string;
  propose(chat: ChatM | null | undefined, request: string, log?: EditorLogEntry[] | null, signal?: AbortSignal, opt?: { msgs?: Msg[] | null }): Promise<EditorProposal>;
  proposeEditorTurn(chat: ChatM | null | undefined, request: string, log?: EditorLogEntry[] | null, signal?: AbortSignal, opt?: { msgs?: Msg[] | null }): Promise<EditorProposal>;
  describeEditorOp(op: EditorOp | null | undefined): string;
  applyOps(mem: Mem, ops: EditorOp[] | null | undefined, skipped?: string[]): number;
  applyEditorOps(mem: Mem, ops: EditorOp[] | null | undefined, skipped?: string[]): number;
  edit(chat: ChatM, request: string, signal?: AbortSignal): Promise<{ reply: string; applied: number }>;
  add(chatId: string, rec?: Partial<MemItem>): Promise<MemItem>;
  snapshot(mem: Mem): Mem;
  checkpoint(mem: Mem, label: string): Promise<CheckpointPoint | null>;
  checkpoints(chatId: string): Promise<CheckpointInfo[]>;
  checkpointData(chatId: string, id: string): Promise<Mem | null>;
  normalize(data: Partial<Mem> | null | undefined, chatId: string): Mem;
  replace(chatId: string, data: Partial<Mem> | null | undefined): Promise<Mem>;
  diff(before: Mem, after: Mem): DiffChange[];
  exportData(chat: ChatM | null | undefined, mem: Mem): ExportPayload;
  readExport(payload: ImportPayload | null | undefined): ImportResult;
  carry(mem: Mem, src: CarrySource, label?: string): CarryCount;
  importCarryOver(mem: Mem, src: CarrySource, label?: string): CarryCount;
  dossierChars(mem: Mem): number;
}

export const part5: Part5 & ThisType<MemoryApi> = {
  packetRewritePrompt(narratorMode) {
    return `You are Memoria's archivist. Below is the long-term archive of an ongoing roleplay, as it is normally injected into the story model's prompt. Rewrite it into ONE clean, well-organized briefing that the story model will read before its next reply.

- Use ONLY what the archive says. Never invent, never guess, never settle anything the archive leaves open.
- Merge duplicates. When entries disagree, the newer one wins — state the current situation plainly.
- Keep these sections in this order, as "## " headings, and drop any that would be empty: Scene Now, Pledges, Canon, Cast, Status Board, Key Past Moments, Hidden Knowledge, Story So Far.
- Pledges, secrets, and who-knows-what boundaries must survive intact — never drop or soften them. ${narratorMode ? 'Anything under Hidden Knowledge stays there with its exact holder and visibility, marked as narrator reference rather than shared character knowledge. Do not add player-only control restrictions: this chat uses novel co-writing.' : 'Anything under Hidden Knowledge stays there, marked as subtext only.'}
- Story So Far is a chronological bullet timeline, one event per bullet, earliest first.
- Keep quoted dialogue verbatim and names exactly as written.
- Be compact: clearly shorter than the input, yet lose nothing a future scene would need.
- Output the briefing only. No preamble, no commentary, no code fences, no tags.`;
  },
  /**
   * 사서가 지금의 서고(회상 · 세계 · 요약)를 보고 장부를 새로 쓴다 — 초안을 돌려줄 뿐 싣지 않는다.
   * 장부 맨 앞의 사용 규칙(출처 우선순위 · 지식 경계)은 모델에게 맡기지 않고 그대로 다시 붙인다. opts: { msgs }
   */
  async rewritePacketWithLibrarian(chat, history, signal, opts = {}) {
    const mem = await this.load(chat.id), perspective = this.perspective(mem), privateAllowed = this.cfg().authorizePrivate;
    const P = this.buildPacketSections(chat, mem, history, { msgs: opts.msgs, noDirection: true });
    // 새로 쓸 때는 연대기 · 묶음을 빠짐없이 보여준다 (평소에는 최근 묶음 3개까지만 싣는다)
    P.summaries = [...mem.arcs.filter(x => x.carried).map(x => ({ ...x, level: 'arc' })), ...[...mem.arcs.filter(x => !x.carried).map(x => ({ ...x, level: 'arc' })), ...mem.chunks.map(x => ({ ...x, level: 'chunk' }))].sort((a, b) => a.from - b.from)];
    const lines = String(this.renderPacket(P, {})).split('\n').filter((l: string) => l !== PACKET_HEADER && l !== PACKET_FOOTER), firstSection = lines.findIndex((l: string) => l.startsWith('## '));
    if (firstSection < 0) throw new Error('새로 쓸 기록이 아직 없습니다');
    const rules = lines.slice(0, firstSection), body = lines.slice(firstSection).filter((l: string) => !l.startsWith('(End of archive.')).join('\n');
    const reply = await this.call(chat, `${this.packetRewritePrompt(P.narratorMode)}\n\n${this.languageDirective()}`, `Archive:\n${body}`, 6000, signal);
    if ((this.get(chat.id) || mem) !== mem || this.perspective(mem) !== perspective || this.cfg().authorizePrivate !== privateAllowed) throw new Error('채팅 또는 기억·서술 방식이 바뀌어 이전 초안을 버렸습니다. 다시 새로 써 주세요.');
    const rewritten = cleanRecord(reply).replace(/<\/?memoria_\w+>/gi, '').trim();
    if (!rewritten || !/^##\s/m.test(rewritten)) throw new Error('사서 응답이 장부 형식이 아닙니다');
    return [PACKET_HEADER, ...rules, rewritten, PACKET_FOOTER].join('\n');
  },
  rewritePacket(chat, history, signal, opts) { return this.rewritePacketWithLibrarian(chat, history, signal, opts); },
  /**
   * 장면 연출. 프롬프트 조립이 기다릴 수 없어 답변이 끝난 뒤 다음 답변의 방향을 미리 잡아 두고(mem.direction) 그다음 장부에 싣는다.
   * 연출은 좋으면 덤이고 없어도 이야기는 굴러간다 — 실패하면 조용히 넘어간다. 반환: 계획 또는 null
   */
  async direct(chat, msgs, signal) {
    const cfg = this.cfg(), mem = await this.load(chat.id), vis = msgs.filter(m => !m.hidden && !this.isSideMessage(m)), lastAi = [...vis].reverse().find(m => m.role === 'assistant'); if (!lastAi) return null;
    const P = this.buildPacketSections(chat, mem, null, { msgs, noDirection: true });
    const contextBlock = this.renderPacket(P, { withExcerpts: false, recallLimit: 6, protectedLimit: 3, summaryLimit: 2 });
    const recent = vis.slice(-8).filter(m => m.role !== 'system').map(m => `${m.role === 'user' ? 'USER' : (m.name || 'Character')}: ${cleanStr(prose(m), 400)}`).join('\n');
    const lastUser = [...vis].reverse().find(m => m.role === 'user');
    const user = `${P.narratorMode ? 'Recall cue from the latest scene or user contribution' : 'Latest player input'}:\n${lastUser ? clip(prose(lastUser), 1200) : '(none)'}\n(The reply to that input is already the last message below. Plan the reply AFTER it — the player has not written their next message yet, so stay open to whatever they do.)\n\nRecent messages:\n${recent}\n\nArchive ledger:\n${contextBlock}`;
    let sys: (typeof cfg)['prompts']['supervisor'] = this.promptText('supervisor');
    if (P.narratorMode) sys = `${sys.replace(`- ${MP.PLAYER_CONTROL_RULE}`, '').replace(`- ${MP.PLAYER_KNOWLEDGE_RULE}`, '')}\n\nChat-specific writing mode (replaces generic player-only control and subtext-only guidance):\n${MP.NARRATOR_ROLE_GUIDANCE}\n${MP.NARRATOR_KNOWLEDGE_GUIDANCE}`;
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 60000); signal?.addEventListener('abort', () => ac.abort());
    try { const plan = parseLoose(await this.call(chat, sys, user, 2000, ac.signal)) as Plan | null; if (!plan || typeof plan !== 'object') return null; mem.direction = { plan, at: now(), afterId: lastAi.id }; await this.save(mem); return plan; }
    finally { clearTimeout(timer); }
  },
  runSupervisor(chat, msgs, signal) { return this.direct(chat, msgs, signal); },
  /**
   * 답변이 도착했을 때: 한 번짜리 장부를 치우고, 실린 기억이 답변에 실제로 반영됐는지 채점한다.
   * 반영됨 → 중요도를 아주 조금 올린다. 네 번 연달아 무시됨 → 아주 조금 내린다 (0.8 이상의 정체성급 기억은 내리지 않는다). 한두 턴의 우연이 서고를 흔들지 못하게 폭은 작고 상 · 하한이 있다
   */
  async received(chat, msg) {
    overrides.delete(chat.id);
    const a = audits.get(chat.id); audits.delete(chat.id);
    const mem = this.get(chat.id); if (!mem || !a?.ids.length || this.cfg().audit === false || now() - a.at > 30 * 60000) return;   // 낡은 감사표는 버린다
    const reply = low(visibleProse(msgText(msg))); if (reply.length < 40) return;   // 너무 짧은 답변은 판단 근거가 못 된다
    let touched = false;
    for (const id of a.ids) {
      const m = mem.memories.find(x => x.id === id); if (!m || m.pinned || m.manual || m.disabled) continue;
      const toks = [...new Set(low(`${m.summary} ${(m.entities || []).join(' ')}`).match(/[\p{L}\p{N}]{2,}/gu) || [])]; if (toks.length < 3) continue;
      const hits = toks.filter(t => reply.includes(t)).length, echoed = hits >= 2 && hits / toks.length >= 0.35;   // 조사 · 어미가 붙는 한국어라 부분 문자열로 맞춘다
      m.shown = (m.shown || 0) + 1;
      if (echoed) { m.echoes = (m.echoes || 0) + 1; m.coldRun = 0; m.importance = Math.min(0.95, (m.importance || 0.5) + 0.02); touched = true; }
      else { m.coldRun = (m.coldRun || 0) + 1; if (m.coldRun >= 4 && (m.importance || 0.5) < 0.8) { m.importance = Math.max(0.25, m.importance - 0.02); m.coldRun = 0; touched = true; } }
    }
    if (touched) await this.save(mem);
  },
  auditRecallEcho(chat, msg) { return this.received(chat, msg); },
  /**
   * AI 에게 보내는 최근 대화에서도 삼갈 표현을 뺀다 (설정 banInChat — 저장된 대화는 그대로). 모델은 자기 최근 답변을 보고 같은 말을 또 쓴다 — 장부에서만 빼서는 그 고리가 끊기지 않는다.
   * 이어쓰기일 때 이어 쓰는 마지막 답변은 건드리지 않는다 (글이 끊긴다). messages: 보낼 메시지 목록 (그 자리에서 고친다)
   */
  maskBannedInPrompt(messages, type = '') {
    const cfg = this.cfg(); if (!cfg.enabled || !cfg.banInChat || !Array.isArray(messages)) return 0;
    const banned = this.bannedPhrases(); if (!banned.length) return 0;
    let lastAssistant = -1, n = 0; messages.forEach((m, i) => { if (m?.role === 'assistant') lastAssistant = i; });
    messages.forEach((m, i) => {
      if (m?.role !== 'assistant' || (type === 'continue' && i === lastAssistant)) return;
      if (typeof m.content === 'string') { const t = stripPhrases(m.content, banned); if (t !== m.content) { m.content = t; n++; } }
      else if (Array.isArray(m.content)) for (const part of m.content) if (part?.type === 'text' && typeof part.text === 'string') part.text = stripPhrases(part.text, banned);
    });
    return n;
  },

  // ════════ 사서에게 묻기 · 말로 고치기 ════════
  /** 기록 전체를 글로 (사서에게 묻기 · 기록 고치기에 넘긴다) */
  dump(mem) {
    const sc = this.scene(mem);
    return [
      (sc.any || mem.clockDays >= 1) && 'NOW\n' + [sc.location && `place: ${sc.location}`, sc.date && `date: ${sc.date}`, sc.time && `time: ${sc.time}`, mem.clockDays >= 1 && `story clock: ~${ago(mem.clockDays)} since the story began`].filter(Boolean).join(' · '),
      mem.canon.length && 'CANON\n' + mem.canon.map(c => `${c.scope}/${c.key}: ${c.value}`).join('\n'),
      mem.status.length && 'STATUS\n' + mem.status.map(s => `${s.entity}.${s.slot}: ${s.value}${s.claim === 'belief' ? ` (belief of ${s.owner || 'someone'})` : ''}`).join('\n'),
      mem.pledges.length && 'PLEDGES\n' + mem.pledges.map(p => `[${p.id}] (${p.kind}, ${p.status}) ${p.summary}${p.status === 'resolved' && p.resolution ? ` — settled: ${p.resolution}` : ''}`).join('\n'),
      mem.cast.length && 'CAST\n' + mem.cast.map(c => `${c.name}: ${[c.role, c.age, c.occupation, c.appearance, c.core && `core: ${c.core}`, c.voice && `voice: ${c.voice}`, (c.traits || []).join(', '), ...(c.growth || []).map(g => g?.text && `changed: ${g.text}`), ...(c.relationships || []).map(r => `${r.target}=${r.relation}`)].filter(Boolean).join(' · ')}`).join('\n'),
      (mem.bonds || []).some(b => this.bondNow(b)) && 'BONDS (from → to: current stage)\n' + mem.bonds.filter(b => this.bondNow(b)).map(b => this.formatBondLine(b)).join('\n'),
      mem.milestones.length && 'TURNING POINTS\n' + mem.milestones.map(e => `(t${(e.turn ?? 0) + 1}) ${e.title}${e.summary ? ` — ${e.summary}` : ''}`).join('\n'),
      mem.items.length && 'ITEMS\n' + mem.items.map(i => `${i.name}${i.holder ? ` (held by ${i.holder})` : ''}${i.meaning ? `: ${i.meaning}` : ''}${i.status ? ` [${i.status}]` : ''}`).join('\n'),
      (mem.arcs.length || mem.chunks.length) && 'SUMMARIES\n' + [...mem.arcs, ...mem.chunks].map(c => `[${c.id}] (${c.carried ? 'earlier chat' : `t${c.from + 1}-t${c.to + 1}`}) ${c.text}`).join('\n'),
      mem.turns.some(t => t.digest) && 'TURN DIGESTS\n' + mem.turns.map((t, i) => t.digest && `(t${i + 1}${t.days ? `, +${ago(t.days)}` : ''}) ${t.digest}`).filter(Boolean).slice(-200).join('\n'),
      mem.memories.length && 'MEMORIES\n' + mem.memories.map(m => `[${m.id}] (${m.manual ? 'noted' : `t${(m.turn ?? 0) + 1}`}, ${m.kind}, ${m.visibility}${m.owner ? ':' + m.owner : ''}) ${m.summary}${m.quote ? ` — "${m.quote}"` : ''}`).join('\n'),
    ].filter(Boolean).join('\n\n');
  },
  /** 서고에 질문 — 저장된 기억 · 요약 · 캐논만 근거로 이야기에 대한 질문에 답한다. "우리 처음 만난 게 언제였지?" 같은 질문에 턴 번호를 인용해 답한다. opt.msgs: 대화 메시지 (없으면 저장된 것을 읽는다) */
  async ask(chat, question, signal, { msgs = null } = {}) {
    const q = String(question || '').trim(); if (!q) throw new Error('질문이 비어 있습니다'); if (!chat) throw new Error('열린 대화가 없습니다');
    const mem = await this.load(chat.id); if (!Array.isArray(msgs)) msgs = await Promise.resolve(S.msgs(chat.id)).catch(() => null);
    const context = this.renderPacket(this.buildPacketSections(chat, mem, null, this.archiveQueryOpt(mem, q, msgs)), { recallLimit: 14, protectedLimit: 5 });
    const answer = cleanRecord(await this.call(chat, MP.ASK_LIBRARIAN_PROMPT, `Archive records:\n${context}\n\nPlayer's question: ${q}`, 4000, signal));
    if (!answer) throw new Error('빈 응답');
    return answer;
  },
  askLibrarian(chat, question, signal, opt) { return this.ask(chat, question, signal, opt); },
  /**
   * 캐논 · 상태 · 서약 · 인물 · 관계선 전체 + 요청과 관련된 기억/요약(id 포함)을 편집용 글로.
   * 장부와 달리 id 를 보여 사서가 editMemory / editSummary 로 정확히 짚을 수 있게 한다. 턴 번호는 화면과 같이 t1 부터
   */
  buildEditorArchiveText(chat, mem, instruction, msgs = null) {
    const P = this.buildPacketSections(chat, mem, null, this.archiveQueryOpt(mem, instruction, msgs)), lines: string[] = [];
    if (P.rules?.length) { lines.push('## Canon'); for (const r of P.rules) lines.push(`- (${r.scope}${r.scopeName ? `:${r.scopeName}` : ''}) ${r.key} = ${r.value}`); }
    if (P.states?.length) { lines.push('## Status Board'); for (const s of P.states) lines.push(`- ${s.entity}.${s.slot} = ${s.value}${s.claim === 'belief' ? ` (belief${s.owner ? ` of ${s.owner}` : ''})` : ''}`); }
    if (P.locks?.length) { lines.push('## Pledges'); for (const l of P.locks) lines.push(`- [${l.id}] (${normLockKind(l.kind)}, ${l.status}) ${l.summary}`); }
    if (P.characters?.length) { lines.push('## Cast'); for (const c of P.characters) lines.push(`- ${c.name}${c.role ? ` (${c.role})` : ''}${c.age ? `, ${c.age}` : ''}${c.occupation ? `, ${c.occupation}` : ''}${c.core ? ` — core: ${c.core}` : ''}${c.voice ? ` — voice: ${c.voice}` : ''}`); }
    const bondRows = (mem.bonds || []).filter(b => this.bondNow(b));
    if (bondRows.length) { lines.push('## Bonds (from → to: current stage)'); for (const b of bondRows) lines.push(this.formatBondLine(b)); }
    const totalDays = mem.turns.reduce((a, t) => a + (t.days || 0), 0);
    lines.push(`## Story Clock\n- turns recorded: t1–t${mem.turns.length}\n- total elapsed so far: ${totalDays >= 1 ? fmtDays(totalDays) : '1일 미만'}`);
    const recalled = [...(P.publicRecall || []), ...(P.protectedRecall || [])];
    if (recalled.length) { lines.push('## Memories (id — turn — text)'); for (const m of recalled) lines.push(`- [${m.id}] (t${(m.turn ?? 0) + 1}) ${m.summary}`); }
    const sums = P.summaries || [];
    if (sums.length) { lines.push('## Summaries (id — turn range — text)'); for (const s of sums) lines.push(`- [${s.id}] (${s.carried ? 't0–t0' : `t${(s.from ?? 0) + 1}–t${(s.to ?? 0) + 1}`}) ${s.text}`); }
    return lines.join('\n');
  },
  /**
   * 말로 기록 고치기 1단계: 정정 요청을 사서에게 보내 편집안(ops)만 받아 온다 — 서고에는 아직 아무것도 반영하지 않는다.
   * log: 앞선 대화 [{ role: 'user' | 'assistant', text, ops? }] — 최근 3왕복만 쓴다. opt.msgs: 대화 메시지 (없으면 저장된 것을 읽는다)
   */
  async propose(chat, request, log = [], signal, { msgs = null } = {}) {
    const text = String(request || '').trim(); if (!text) throw new Error('요청이 비어 있습니다'); if (!chat) throw new Error('열린 대화가 없습니다');
    const mem = await this.load(chat.id); if (!Array.isArray(msgs)) msgs = await Promise.resolve(S.msgs(chat.id)).catch(() => null);
    const archive = this.buildEditorArchiveText(chat, mem, text, msgs), hist = list(log).filter(l => l && (l.text || l.content)).slice(-6);
    const historyBlock = hist.length ? `Recent conversation (for context only, e.g. "취소해" refers to the last message):\n${hist.map(l => `${l.role === 'user' ? 'User' : 'Archivist'}: ${l.text ?? l.content}${l.role !== 'user' && l.ops?.length ? ` (변경 ${l.ops.length}건 제안)` : ''}`).join('\n')}\n\n` : '';
    const parsed = await this.callJson(chat, `${MP.EDITOR_PROMPT}\n\n${this.languageDirective()}`, `Archive:\n${archive}\n\n${historyBlock}User's correction request: ${text}`, 3000, signal) as { reply?: unknown; ops?: EditorOp[] } | null;
    if (!parsed || typeof parsed.reply !== 'string') throw new Error('사서 응답을 이해하지 못했습니다');
    return { reply: String(parsed.reply).trim(), ops: list(parsed.ops).filter(o => o && typeof o === 'object' && typeof o.op === 'string') };
  },
  proposeEditorTurn(chat, request, log, signal, opt) { return this.propose(chat, request, log, signal, opt); },
  /** 편집안(op) 하나를 사람이 읽을 한 줄로 (미리보기용) */
  describeEditorOp(op) {
    switch (op?.op) {
      case 'canon': return `캐논: ${op.scopeName ? `${op.scopeName}의 ` : ''}${op.key} → "${op.value}"`;
      case 'status': return `상태: ${op.entity}.${op.slot} → "${op.value}"${op.claim === 'belief' ? ` (${op.owner || '누군가'}의 믿음)` : ''}`;
      case 'clock': return `서사시계: t${op.fromTurn}–t${op.toTurn} 구간을 총 ${op.totalDays}일로 재조정`;
      case 'addMemory': return `기억 추가 (${op.kind || 'fact'}) → "${op.summary}"`;
      case 'editMemory': return `기억 수정 (${op.id}) → "${op.summary}"`;
      case 'deleteMemory': return `기억 삭제 (${op.id})`;
      case 'editSummary': return `요약 수정 (${op.id})`;
      case 'deleteSummary': return `요약 삭제 (${op.id})`;
      case 'addPledge': return `서약 추가 (${normLockKind(op.kind)}) → "${op.summary}"`;
      case 'editPledge': return `서약 수정 (${op.id})${op.status ? ` → ${op.status}` : ''}${op.summary ? ` "${op.summary}"` : ''}`;
      case 'deletePledge': return `서약 삭제 (${op.id})`;
      case 'character': return `인물 카드: ${op.name} — ${Object.keys(op.patch || {}).join(', ')} 갱신`;
      case 'bond': return `관계선: ${op.from} → ${op.to} = "${op.stage}"`;
      default: return JSON.stringify(op);
    }
  },
  /**
   * 2단계: 사람이 확인한 편집안을 서고에 반영한다 (복구 지점 · 저장은 부른 쪽이). 반환: 적용한 수. skipped: 적용하지 못한 까닭이 담긴다.
   * 편집안의 턴 번호(clock 의 fromTurn / toTurn)는 사서에게 보여 준 대로 t1 부터 센다
   */
  applyOps(mem, ops, skipped = []) {
    let applied = 0; const T = Math.max(0, mem.turns.length - 1), by = <T extends { id: string }>(arr: T[], id: unknown) => arr.find(x => x.id === str(id)), prio: (v: unknown) => number = v => Math.max(1, Math.min(5, Number(v)));
    for (const op of list(ops)) {
      try {
        switch (op?.op) {
          case 'canon': {
            const key = cleanStr(op.key, 60), value = cleanStr(op.value, 200); if (!key || !value) break;
            this.upsertWorldRule(mem, { scope: SCOPES.includes(op.scope!) ? op.scope! : 'session', scopeName: cleanStr(op.scopeName, 60), key, value }, T);
            applied++; break;
          }
          case 'status': {
            const entity = cleanStr(op.entity, 60), slot = canonSlot(toSnake(op.slot)), value = cleanStr(op.value, 200); if (!entity || !slot || !value) break;
            this.upsertEntityState(mem, { entity, slot, value, claim: op.claim === 'belief' ? 'belief' : 'objective', owner: cleanStr(op.owner, 60) }, T);
            applied++; break;
          }
          case 'clock': {
            const fromTurn = Math.max(1, Number(op.fromTurn) || 0), toTurn = Math.max(fromTurn, Number(op.toTurn) || 0), totalDays = Math.max(0, Number(op.totalDays) || 0);
            const span = mem.turns.slice(fromTurn - 1, toTurn); if (!span.length) break;
            const currentTotal = span.reduce((a, t) => a + (t.days || 0), 0);
            if (currentTotal > 0) { const scale = totalDays / currentTotal; for (const t of span) t.days = (t.days || 0) * scale; } else span[span.length - 1].days = totalDays;
            mem.clockDays = mem.turns.reduce((a, t) => a + (t.days || 0), 0);
            applied++; break;
          }
          case 'addMemory': {
            const summary = cleanStr(op.summary, 300); if (!summary) break;
            mem.memories.push({ id: uid(), turn: T, kind: normKind(op.kind), summary, quote: '', importance: Number.isFinite(Number(op.importance)) ? clamp01(op.importance, 0.5) : 0.5, entities: [], tags: ['manual'], hints: [], visibility: 'public', owner: '', knowers: [], pinned: false, disabled: false, manual: true, trigger: '', ts: now() });
            applied++; break;
          }
          case 'editMemory': {
            const m = by(mem.memories, op.id), summary = cleanStr(op.summary, 300); if (!m || !summary) break;
            m.summary = summary; delete m.av; delete m.acv; delete m.avm;   // 임베딩은 다음 기록 · 색인 때 다시 계산한다
            applied++; break;
          }
          case 'deleteMemory': { const before = mem.memories.length; mem.memories = mem.memories.filter(x => x.id !== str(op.id)); if (mem.memories.length < before) applied++; break; }
          case 'editSummary': {
            const text = cleanMultiline(op.text, 2400), target = by(mem.chunks, op.id) || by(mem.arcs, op.id); if (!text || !target) break;   // 기록의 줄(WHEN / PLOT / SHIFTS / OPEN)은 살린다
            target.text = text; delete target.av; delete target.avm;
            applied++; break;
          }
          case 'deleteSummary': {
            const target = by(mem.chunks, op.id) || by(mem.arcs, op.id); if (!target) break;
            mem.chunks = mem.chunks.filter(x => x !== target); mem.arcs = mem.arcs.filter(x => x !== target);
            if (!target.carried) mem.chunked = Math.min(mem.chunked || 0, target.from || 0);   // 그 구간은 다음 요약 때 다시 묶인다
            applied++; break;
          }
          case 'addPledge': {
            const summary = cleanStr(op.summary, 200); if (!summary) break;
            this.upsertLock(mem, { kind: normLockKind(op.kind), summary, status: 'active', priority: Number.isFinite(Number(op.priority)) ? prio(op.priority) : 2, owner: cleanStr(op.owner, 60) }, T);
            applied++; break;
          }
          case 'editPledge': {
            const l = by(mem.pledges, op.id); if (!l) break;
            if (op.summary != null) l.summary = cleanStr(op.summary, 200) || l.summary;
            if (op.status === 'resolved' || op.status === 'active') { l.status = op.status; l.resolvedTurn = op.status === 'resolved' ? T : null; l.resolvedBy = ''; l.suggestResolved = false; if (op.status === 'active') l.resolution = null; }
            if (Number.isFinite(Number(op.priority))) l.priority = prio(op.priority);
            l.turn = T; l.manual = true;   // 직접 정정했으니 이후 사서의 재발행이 덮어쓰지 못하게 보호한다
            applied++; break;
          }
          case 'deletePledge': { const before = mem.pledges.length; mem.pledges = mem.pledges.filter(x => x.id !== str(op.id)); if (mem.pledges.length < before) applied++; break; }
          case 'bond': {
            const stage = cleanStr(op.stage, 120), row = !stage ? null : this.upsertBond(mem, { from: cleanStr(op.from, 60), to: cleanStr(op.to, 60), stage, basis: cleanStr(op.basis, 200), calls: cleanStr(op.calls, 100), unsaid: cleanStr(op.unsaid, 160) }, T, { manual: true });
            if (row && stage) { row.disabled = false; applied++; }   // 이전 단계는 지나온 길로 남는다
            break;
          }
          case 'character': {
            const name = cleanStr(op.name, 60), patch = op.patch; if (!name || !patch || typeof patch !== 'object') break;
            const existing = mem.cast.find(x => low(x.name) === low(name) || (x.aka || []).some(a => low(a) === low(name)));
            if (existing?.locked) { skipped.push(`${existing.name} 카드는 고정돼 있어 고치지 못했어요 (세계 탭에서 고정을 먼저 풀어 주세요)`); break; }
            const card: CastInput = { name };
            for (const k of ['role', 'age', 'occupation', 'appearance', 'voice'] as const) if (patch[k] != null) card[k] = cleanStr(patch[k], 200);
            // 바탕은 사서가 스스로는 못 바꾸지만, 사용자가 정정을 요청한 경우에는 바꾼다
            if (patch.core != null && existing) { existing.core = cleanStr(patch.core, 500); existing.coreTurn = null; existing.coreMsgId = ''; }
            else if (patch.core != null) card.core = cleanStr(patch.core, 500);
            if (Array.isArray(patch.traits)) card.traits = patch.traits.map(t => cleanStr(t, 40)).filter(Boolean).slice(0, 8);
            if (Array.isArray(patch.aka)) card.aka = patch.aka.map(a => cleanStr(a, 60)).filter(Boolean);
            if (Array.isArray(patch.relationships)) card.relationships = patch.relationships;
            const made = this.upsertCast(mem, card, T);
            if (made && !existing && made.core) { made.coreTurn = null; made.coreMsgId = ''; }   // 직접 적은 바탕은 턴에 묶이지 않는다
            applied++; break;
          }
          default: break;
        }
      } catch (e) { console.error('[장기기억] 사서 편집 op 적용 실패', op, e); }
    }
    return applied;
  },
  applyEditorOps(mem, ops, skipped) { return this.applyOps(mem, ops, skipped); },
  /** 제안과 적용을 한 번에 (명령어 · 예전 화면용) */
  async edit(chat, request, signal) { const mem = await this.load(chat.id), p = await this.propose(chat, request, [], signal); if (p.ops.length) await this.checkpoint(mem, '사서 정정 전').catch(() => { }); const applied = this.applyOps(mem, p.ops); await this.save(mem); return { reply: p.reply, applied }; },
  async add(chatId, rec) { const mem = await this.load(chatId); const m: MemItem = { id: uid(), kind: 'fact', summary: '', quote: '', importance: 0.6, entities: [], tags: ['manual'], hints: [], visibility: 'public', owner: '', manual: true, turn: mem.turns.length, ts: now(), ...rec }; mem.memories.push(m); await this.save(mem); return m; },

  // ════════ 복구 지점 · 비교 · 백업 ════════
  snapshot: mem => copy(mem),
  /** 지금 서고를 복구 지점으로 보관한다 (최근 3개 · 합계 6MB) */
  async checkpoint(mem, label) {
    const data = JSON.stringify(copy(mem)), bytes = new Blob([data]).size; if (bytes > 3 * 1024 * 1024) return null;
    const key = 'memcp:' + mem.id, rec: CheckpointRow = (await DB.get<CheckpointRow>('kv', key)) || { id: key, list: [] };
    const point: CheckpointPoint = { id: uid(), label: String(label).slice(0, 100), at: now(), turn: mem.turns.length, bytes, data }; let total = 0;
    rec.list = [point, ...(rec.list || [])].slice(0, 3).filter((p, i) => i === 0 || (total += p.bytes) + bytes <= 6 * 1024 * 1024);
    await DB.put('kv', rec); emit('memory:checkpoint', mem.id);
    return point;
  },
  async checkpoints(chatId) { return ((await DB.get<CheckpointRow>('kv', 'memcp:' + chatId))?.list || []).map(({ data, ...p }) => p); },
  async checkpointData(chatId, id) { const p = ((await DB.get<CheckpointRow>('kv', 'memcp:' + chatId))?.list || []).find(x => x.id === id); return p ? this.normalize(JSON.parse(p.data), chatId) : null; },
  /** 불러온 서고를 이 대화의 서고 모양으로 */
  normalize(data, chatId) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('서고 파일의 형식이 올바르지 않아요.');
    const m: Mem = { ...empty(chatId), ...data, id: chatId };
    if (m.perspective != null && typeof m.perspective !== 'string') throw new Error('기억 시점의 형식이 올바르지 않습니다.');
    if (m.perspectiveScope != null && !['default', 'chat'].includes(m.perspectiveScope)) throw new Error('기억·서술 방식의 적용 범위가 올바르지 않습니다.');
    if (m.perspectiveScope === 'chat' && typeof m.perspective !== 'string') throw new Error('이 대화에 적용할 기억·서술 방식이 없습니다.');
    if (typeof m.perspective === 'string' && !m.perspectiveScope) m.perspectiveScope = 'chat';   // 옛 서고: 글이 적혀 있으면 이 대화만의 방식이었다
    if (m.packetPin != null && typeof m.packetPin?.text !== 'string') throw new Error('고정 장부의 형식이 올바르지 않습니다.');
    if (!Array.isArray(m.turns) || m.turns.some(t => !t || typeof t !== 'object' || typeof t.msgId !== 'string')) throw new Error('서고의 턴 기록 목록이 올바르지 않아요.');
    for (const k of SHELVES) { if (!Array.isArray(m[k]) || m[k].some(x => !x || typeof x !== 'object')) throw new Error(`서고의 ${SHELF_LABELS[k]} 목록이 올바르지 않아요.`); }
    for (const k of ['memories', 'canon', 'status', 'cast', 'bonds', 'items', 'milestones', 'dossier', 'chunks', 'arcs'] as const) for (const x of m[k]) { if (!x.id) x.id = uid(); delete x.av; delete x.acv; }
    m.memories = m.memories.filter(x => typeof x.summary === 'string'); m.cast = m.cast.filter(x => typeof x.name === 'string'); m.dossier = m.dossier.filter(x => Array.isArray(x.chunks));
    for (const x of m.memories) if (x.knowers != null && !Array.isArray(x.knowers)) x.knowers = [];
    for (const c of m.cast) {   // 남긴 말 · 달라진 점 · 바탕 — 모양이 어긋난 것만 걷어 낸다
      c.lines = list(c.lines).filter(l => l && typeof l.text === 'string' && l.text.trim()).slice(-CHARACTER_LINES_MAX); c.growth = list(c.growth).filter(g => g && typeof g.text === 'string' && g.text.trim()).slice(-CHARACTER_GROWTH_MAX);
      if (c.core != null && typeof c.core !== 'string') c.core = '';
    }
    for (const b of m.bonds) b.log = list(b.log).filter(e => e && typeof e.stage === 'string' && e.stage.trim());
    m.bonds = m.bonds.filter(b => typeof b.from === 'string' && typeof b.to === 'string' && b.from.trim() && b.to.trim() && b.log.length && ekey(b.from) !== ekey(b.to));
    if (!data.bondRev) { for (const b of m.bonds) this.compactBondLog(b); } m.bondRev = 1;
    m.chunked = Math.min(+m.chunked || 0, m.turns.length); m.clockDays = m.turns.reduce((a, t) => a + (t.days || 0), 0);
    return m;
  },
  /** 서고를 통째로 바꿔 끼운다 (복구 · 파일 복원) */
  async replace(chatId, data) { const m = this.normalize(data, chatId); overrides.delete(chatId); audits.delete(chatId); lasts.delete(chatId); freezes.delete(chatId); await this.save(m); return m; },
  /** 두 서고의 차이 (검토 화면용) */
  diff(before, after) {
    const out: DiffChange[] = [], cmp: (x: unknown) => string = x => JSON.stringify(x, (k, v) => ['av', 'acv', 'avm', 'shown', 'echoes', 'coldRun', 'ts'].includes(k) ? undefined : v), key: (x: ShelfRow) => string = x => x.id ?? x.msgId as string;
    const say = (shelf: string, x: ShelfRow): string => {
      switch (shelf) {
        case 'cast': return [x.name, x.role && `역할: ${x.role}`, x.age && `나이: ${x.age}`, x.occupation && `직업: ${x.occupation}`, x.appearance && `외형: ${x.appearance}`, x.voice && `말투: ${x.voice}`, (x.aka || []).length && `다른 이름: ${x.aka!.join(', ')}`, x.core && `바탕: ${x.core}`, (x.traits || []).length && `성격: ${x.traits!.join(', ')}`, (x.growth || []).length && `달라진 점: ${x.growth!.map(g => g.text).join(' / ')}`, (x.lines || []).length && `남긴 말: ${x.lines!.map(l => `“${l.text}”`).join(' ')}`, (x.relationships || []).length && `관계: ${x.relationships!.map(r => `${r.target} — ${r.relation}`).join(', ')}`, (x.locked || x.disabled) && `${x.locked ? '고정 ' : ''}${x.disabled ? '쓰지 않음' : ''}`].filter(Boolean).join('\n');
        case 'memories': return `${x.summary}\n${KINDS[x.kind as keyof typeof KINDS] || x.kind} · ${VIS[x.visibility as keyof typeof VIS] || '공개'}${x.owner ? ` (${x.owner})` : ''}${(x.knowers || []).length ? ` · 아는 사람: ${x.knowers!.join(', ')}` : ''}${x.pinned ? ' · 고정' : ''}${x.disabled ? ' · 쓰지 않음' : ''}`;
        case 'status': return `${x.entity}.${x.slot} = ${x.value}${x.claim === 'belief' ? ` (${x.owner || '누군가'}의 믿음)` : ''}`;
        case 'canon': return `${x.scopeName || x.scope || 'world'} · ${x.key} = ${x.value}`;
        case 'pledges': return `${x.summary}\n${LOCKS[x.kind as keyof typeof LOCKS] || x.kind} · ${x.status === 'resolved' ? '해결됨' : x.status === 'dormant' ? '잠듦' : '유효'} · 우선순위 ${x.priority ?? 2}${x.owner ? ` · ${x.owner}` : ''}${x.status === 'resolved' && x.resolution ? `\n풀린 경위: ${x.resolution}` : ''}`;
        case 'bonds': { const n: Partial<BondStep> = this.bondNow(x as Bond) || {}, path = (x.log || []).map(e => e.stage); return [`${x.from} → ${x.to}: ${n.stage || ''}`, n.basis && `근거: ${n.basis}`, n.calls && `부르는 말: ${n.calls}`, n.unsaid && `말하지 못한 것: ${n.unsaid}`, path.length > 1 && `지나온 길: ${path.join(' → ')}`, x.disabled && '쓰지 않음'].filter(Boolean).join('\n'); }
        case 'items': return `${x.name} · 가진 이: ${x.holder || '모름'} · 상태: ${x.status || '모름'}${x.meaning ? '\n' + x.meaning : ''}`;
        case 'dossier': return `${x.title} (${(x.chunks || []).length}개 대목)`;
        case 'turns': return `${x.digest || '(기록 없음)'}${x.days ? ` · +${fmtDays(x.days)}` : ''}${x.when || x.where ? `\n${[x.when, x.where].filter(Boolean).join(' · ')}` : ''}`;
        default: return String(x.summary || x.text || x.title || '');
      }
    };
    for (const shelf of SHELVES) {
      const a = new Map<string, ShelfRow>((before[shelf] as ShelfRow[] || []).map(x => [key(x), x])), b = new Map<string, ShelfRow>((after[shelf] as ShelfRow[] || []).map(x => [key(x), x]));
      for (const [id, x] of a) { if (!b.has(id)) out.push({ shelf, id, type: 'removed', before: say(shelf, x), after: '' }); else if (cmp(x) !== cmp(b.get(id))) { const y = b.get(id)!, s1 = say(shelf, x), s2 = say(shelf, y); if (s1 !== s2 || x.importance !== y.importance) out.push({ shelf, id, type: 'changed', before: s1, after: s2, impBefore: x.importance, impAfter: y.importance }); } }
      for (const [id, x] of b) if (!a.has(id)) out.push({ shelf, id, type: 'added', before: '', after: say(shelf, x) });
    }
    for (const [k, label] of [['perspective', '기억·서술 방식'], ['perspectiveScope', '방식 적용 범위'], ['packetPin', '고정 장부']] as const) {
      const value: (st: Mem) => string = st => k === 'packetPin' ? st[k]?.text || '(없음)' : k === 'perspectiveScope' ? (this.hasChatPerspective(st) ? '이 대화만 따로 설정' : '공통 기본값 사용') : st[k] === NARRATOR ? '소설·풀사칭 (모든 인물 참고)' : st[k] === PUBLIC_ONLY ? '공개 기억만' : st[k] || '자동';
      if (value(before) !== value(after)) out.push({ shelf: 'archive', id: k, type: 'changed', before: `${label}: ${value(before)}`, after: `${label}: ${value(after)}` });
    }
    return out;
  },
  exportData(chat, mem) { return { type: 'dreamland-memoria', version: 1, exportedAt: new Date().toISOString(), chatId: chat?.id || mem.id, chatName: chat?.name || '', store: copy(mem) }; },
  /** 내보낸 파일에서 서고를 꺼낸다. 다른 형식의 서고 파일은 이어받기에 맞는 모양으로 바꿔 준다 */
  readExport(payload) {
    if (payload?.type === 'memoria-export' && payload.store) {
      const st = payload.store as ForeignStore, arr: <T>(v: T[] | null | undefined) => T[] = v => Array.isArray(v) ? v : [];
      return { foreign: true, label: payload.chatId || '이전 채팅', store: { ...empty('import'),
        memories: arr(st.memories).filter(m => m?.summary).map(m => ({ id: uid(), kind: KINDS[m.kind as keyof typeof KINDS] ? m.kind : 'fact', summary: str(m.summary), quote: str(m.excerpt), importance: clamp01(m.importance, 0.5), entities: arr(m.entities), tags: arr(m.tags), hints: arr(m.hints), visibility: VIS[m.visibility as keyof typeof VIS] ? m.visibility : 'public', owner: str(m.owner), knowers: arr(m.knowers).map(str).filter(Boolean), pinned: !!m.pinned, manual: !!m.manual, disabled: !!m.disabled, trigger: str(m.trigger) })),
        canon: arr(st.worldRules).filter(r => r?.key).map(r => ({ id: uid(), scope: SCOPES.includes(r.scope) ? r.scope : 'world', scopeName: str(r.scopeName), key: snake(r.key), value: str(r.value) })) as CanonRow[],
        status: arr(st.entityStates).filter(s => s?.entity).map(s => ({ id: uid(), entity: str(s.entity), slot: snake(s.slot), value: str(s.value), claim: s.claim === 'belief' ? 'belief' : 'objective', owner: str(s.owner) })) as StatusRow[],
        pledges: arr(st.locks).filter(l => l?.summary).map((l, i) => ({ id: 'p' + (i + 1), kind: normLockKind(l.kind), summary: str(l.summary), status: ['resolved', 'dormant'].includes(l.status) ? l.status : 'active', resolution: l.status === 'resolved' ? str(l.resolution) || null : null, priority: +l.priority || 2, owner: str(l.owner), manual: !!l.manual })),
        cast: arr(st.characters).filter(c => c?.name).map(c => ({ id: uid(), name: str(c.name), aka: arr(c.aliases), role: str(c.role), age: str(c.age), occupation: str(c.occupation), appearance: str(c.appearance), voice: str(c.voice), core: cleanStr(c.core, 500), coreTurn: null, lines: arr(c.lines).filter(l => l?.text).map(l => ({ text: cleanStr(l.text, 160), turn: 0, ...(l.pinned ? { pinned: true } : {}) })).slice(-CHARACTER_LINES_MAX), growth: arr(c.growth).filter(g => g?.text).map(g => ({ text: cleanStr(g.text, 200), turn: 0 })).slice(-CHARACTER_GROWTH_MAX),
          traits: arr(c.traits), relationships: arr(c.relationships), locked: !!c.locked, provisional: !!c.provisional, disabled: !!c.disabled })),
        bonds: arr(st.bonds).filter(b => b?.from && b?.to && arr(b.log).some(e => e?.stage)).map(b => { const row: Bond = { id: uid(), from: cleanStr(b.from, 60), to: cleanStr(b.to, 60), manual: !!b.manual, disabled: !!b.disabled, log: arr(b.log).filter(e => e?.stage).map(e => ({ turn: Math.max(0, (+e.turn || 0) - 1), stage: cleanStr(e.stage, 120), basis: cleanStr(e.basis, 200), calls: cleanStr(e.calls, 100), unsaid: cleanStr(e.unsaid, 160), ...(e.manual ? { manual: true } : {}) })) }; if (!st.bondRev) this.compactBondLog(row); return row; }),
        arcs: arr(st.arcSummaries).filter(s => s?.text).map(s => ({ id: 'a' + uid(), from: 0, to: 0, text: str(s.text) })), chunks: arr(st.chunkSummaries).filter(s => s?.text).map(s => ({ id: 'c' + uid(), from: 0, to: 0, text: str(s.text) })),
        milestones: arr(st.milestones).filter(e => e?.title).map(e => ({ id: uid(), title: str(e.title), summary: str(e.summary), participants: arr(e.participants), grade: e.grade === 'minor' ? 'minor' : 'major' })),
        items: arr(st.items).filter(i => i?.name).map(i => ({ id: uid(), name: str(i.name), meaning: str(i.meaning), holder: str(i.holder), status: str(i.status) })),
        dossier: arr(st.dossier).filter(d => d?.title && Array.isArray(d.chunks)).map(d => ({ id: uid(), title: str(d.title), chunks: d.chunks.map(String), disabled: !!d.disabled })) } };
    }
    const store: Partial<Mem> | null | undefined = payload?.type === 'dreamland-memoria' ? payload.store as Partial<Mem> : payload as Partial<Mem> | null | undefined;
    if (!store || !Array.isArray(store.turns) || !Array.isArray(store.memories)) throw new Error('장기기억 파일이 아니에요.');
    return { foreign: false, label: payload!.chatName || payload!.chatId || '이전 대화', store: this.normalize(store, store.id || 'import') };
  },
  /**
   * 다른 대화의 서고를 "인계" 형태로 이 대화에 쌓는다. 요약(연대기 · 묶음)은 이어받은 연대기로, 고정/수동 기억 · 캐논 · 서약 · 인물 · 관계선 · 연표 · 물건 · 자료실은 그대로 이어받는다.
   * A → B → C 순으로 계속 이어 갈 수 있다. 반환: 이어받은 수 { summaries, memories, cast, canon, pledges, bonds? }
   */
  carry(mem, src, label) {
    const n: CarryCount = { summaries: 0, memories: 0, cast: 0, canon: 0, pledges: 0 }, T = 0;
    for (const s of [...list(src.arcs), ...list(src.chunks)]) { if (!s?.text) continue; mem.arcs.push({ id: 'a' + uid(), from: 0, to: 0, text: cleanMultiline(s.text, 1600), carried: true, carriedFrom: label || '이전 대화' }); n.summaries++; }
    for (const m of list(src.memories)) {   // 고정/수동 기억만 인계
      if (!m?.summary || !(m.pinned || m.manual)) continue;
      const { av, acv, avm, msgId, ...rest } = m;
      mem.memories.push({ ...rest, id: uid(), turn: T, manual: true, kind: normKind(m.kind), visibility: normVisibility(m.visibility), tags: [...new Set([...(m.tags || []), 'carried'])] }); n.memories++;
    }
    for (const r of list(src.canon)) { if (!r?.key || !r?.value) continue; this.upsertWorldRule(mem, { scope: r.scope || 'session', scopeName: r.scopeName || '', key: r.key, value: r.value }, T); n.canon++; }
    for (const l of list(src.pledges)) { if (!l?.summary || l.status !== 'active') continue; this.upsertLock(mem, { kind: normLockKind(l.kind), summary: l.summary, status: 'active', priority: l.priority || 2, owner: l.owner || '' }, T); n.pledges++; }
    for (const c of list(src.cast)) {
      if (!c?.name) continue;
      const card = this.upsertCast(mem, { name: c.name, role: c.role, age: c.age, occupation: c.occupation, appearance: c.appearance, voice: c.voice, core: typeof c.core === 'string' ? cleanStr(c.core, 500) : '', traits: c.traits || [], relationships: c.relationships || [], aka: c.aka || c.aliases || [], locked: c.locked === true }, T);   // 고정한 프로필은 고정째로
      // 남긴 말과 달라진 점도 이어받는다 — 새 대화 첫 장면부터 같은 사람으로 말하게
      if (card) {
        if (!card.core && typeof c.core === 'string' && c.core.trim()) { card.core = cleanStr(c.core, 500); card.coreTurn = null; card.coreMsgId = ''; }
        for (const l of list(c.lines)) if (l?.text) this.addCharacterLine(card, l.text, 0);
        const notes = Array.isArray(card.growth) ? card.growth : (card.growth = []);
        for (const g of list(c.growth)) if (g?.text && !notes.some(x => x.text === g.text)) notes.push({ text: cleanStr(g.text, 200), turn: 0 });
        card.growth = notes.slice(-CHARACTER_GROWTH_MAX);
      }
      n.cast++;
    }
    // 관계선: 이전 대화에서 도달한 단계와 지나온 길을 그대로 잇는다 (이미 이 대화에 같은 줄이 있으면 그쪽이 우선)
    if (!Array.isArray(mem.bonds)) mem.bonds = [];
    for (const b of list(src.bonds)) {
      const log = list(b?.log).filter(e => e?.stage); if (!b?.from || !b?.to || !log.length || b.disabled) continue;
      const from = this.canonName(mem, cleanStr(b.from, 60)), to = this.canonName(mem, cleanStr(b.to, 60));
      if (ekey(from) === ekey(to) || mem.bonds.some(x => this.bondKey(x.from, x.to) === this.bondKey(from, to))) continue;
      mem.bonds.push({ id: uid(), from, to, manual: true, disabled: false, log: log.slice(-4).map(e => ({ turn: 0, manual: true, stage: cleanStr(e.stage, 120), basis: cleanStr(e.basis, 200), calls: cleanStr(e.calls, 100), unsaid: cleanStr(e.unsaid, 160) })) });
      n.bonds = (n.bonds || 0) + 1;
    }
    for (const e of list(src.milestones)) { if (!e?.title) continue; this.upsertMilestone(mem, { title: e.title, summary: e.summary || '', participants: e.participants || [], grade: e.grade === 'minor' ? 'minor' : 'major' }, T); }
    for (const it of list(src.items)) { if (!it?.name) continue; this.upsertItem(mem, { name: it.name, meaning: it.meaning || '', holder: it.holder || '', status: it.status || '' }, T); }
    // 자료실 문서 인계 (같은 제목은 건너뛴다)
    for (const d of list(src.dossier)) { if (!d?.title || !Array.isArray(d.chunks) || !d.chunks.length || mem.dossier.some(x => x.title === d.title)) continue; if (this.dossierChars(mem) + d.chunks.reduce((a, c) => a + c.length, 0) > DOSSIER_MAX) break; mem.dossier.push({ id: uid(), title: d.title, chunks: d.chunks, addedAt: now(), disabled: !!d.disabled }); }
    return n;
  },
  importCarryOver(mem, src, label) { return this.carry(mem, src, label); },
  dossierChars: mem => (mem.dossier || []).reduce((n, d) => n + d.chunks.reduce((a, c) => a + c.length, 0), 0),
};
