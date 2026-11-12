// 삽화가 빌려 쓰는 옛 모듈(core · hooks · illust · chat)의 다리와 작은 도우미. 창 · 메뉴 · 알림은 공용 부품(src/ui)을 쓴다
import { L, mod } from '../legacy';
import { confirmBox, menu, toast } from '../ui';
import type { Asset, Card, Char, Chat, Composed, Conn, FrameRec, GenConfig, IllustCfg, Job, LibPerson, ModelInfo, Msg, Person, Persona, PlanRead, Review, Scene, Slot, Swipe, Visual } from './types';

export const NEEDS = ['core', 'hooks', 'illust', 'chat'];

interface SbStore {
  chars: Char[]; conns: Conn[]; settings: Record<string, unknown>;
  get(coll: 'chars', id: string): Char | undefined;
  get(coll: 'chats', id: string): Chat | undefined;
  get(coll: 'conns', id?: string): Conn | undefined;
  set(patch: Record<string, unknown>): void;
  persona(chat?: Chat | null): Persona | undefined;
  msgs(chatId: string): Promise<Msg[]>;
  saveMsgs(chat: Chat, list: Msg[]): Promise<void>;
}
type Rec = Asset | FrameRec;
interface CoreMod {
  S: SbStore;
  DB: { get(store: string, id: string): Promise<Rec | undefined>; put(store: string, rec: object): Promise<void>; del(store: string, id: string): Promise<void>; all(store: string): Promise<Asset[]>; byOwner(owner: string): Promise<Rec[]> };
  on(ev: string, fn: (data?: unknown) => void): () => void;
  uid(): string; now(): number; esc(s: unknown): string;
  debounce<A extends unknown[]>(fn: (...a: A) => void, ms?: number): (...a: A) => void;
  download(name: string, data: string | Blob, type?: string): void;
  pickFiles(o?: { accept?: string; multiple?: boolean }): Promise<File[]>;
  msgText(m: Msg): string;
}
export interface HookDefs {
  studio: { owner: string; title: string; render(): Node }[];
  actions: { owner: string; id?: string; label: string; icon?: string; run(m: Msg, chat?: Chat): unknown }[];
  composer: { owner: string; id?: string; label: string; icon?: string; run(input?: unknown): unknown }[];
  panels: { owner: string; id?: string; title: string; icon?: string; render(chat?: Chat, msgs?: Msg[]): Node }[];
  commands: Map<string, { owner: string; help?: string; run(arg?: string): unknown }>;
}
export interface EnqueueOpts { manual?: boolean; config?: GenConfig | null; slot?: string | null; exact?: boolean }
export interface AnalyzeOpts { existing?: Scene[] | null; direction?: string; scope?: string; manual?: boolean }
export interface IllustApi {
  cfg(): IllustCfg;
  saveCfg(patch: Partial<IllustCfg>, o?: { reason?: string; force?: boolean }): IllustCfg;
  data(id: string): string;
  validate<T extends GenConfig>(c: T): T;
  genConfig(over?: Partial<GenConfig> | null): GenConfig;
  enqueue(chat: Chat, msg: Msg, scene: Scene, onDone: (err?: Error | null) => unknown, opts?: EnqueueOpts): void;
  queue(): Job[]; queuePaused(): boolean; queueRunning(): boolean; usage(): number; cooldown(): number;
  toggleQueue(): void; cancelWaiting(pred?: (j: Job) => boolean | undefined): number;
  slot(it: Slot): Slot; select(it: Slot, n: number): Slot; insert(sw: Swipe, rec: Asset): Slot; remove(id: string): Promise<void>;
  analyze(chat: Chat, msgs: Msg[], msg: Msg, signal: AbortSignal | null, o?: AnalyzeOpts): Promise<Scene[]>;
  compileScene(chat: Chat, scene: Scene): Scene;
  compileCharacter(x: { name?: string; id?: string }, lib: LibPerson[], mode?: string): Person | null;
  compose(chat: Chat, scene: Scene, cfg?: GenConfig): Composed;
  readPlan(text: string): PlanRead; takePlan(): PlanRead | null;
  blocks(text: string): { index: number; content: string }[]; strip(text: string): string;
  review(id: string, scene: Scene | undefined, chat?: Chat | null): Promise<Review>;
  library(chat?: Chat | null): LibPerson[];
  visualKey(chat?: Chat | null): string | null; hasVisual(chat: Chat | null | undefined, where: string): boolean; visualScope(chat?: Chat | null): string;
  visual(chat?: Chat | null, where?: string | null): Visual;
  saveVisual(chat: Chat | null | undefined, where: string, value: Visual): Promise<void>;
  resetVisual(chat: Chat | null | undefined, where: string): Promise<void>;
  account(): Promise<{ active: boolean; tier?: number | null; anlas: number | null }>;
  analysisRules(): string; outputRules(): string;
}
interface IllustMod {
  Illust: IllustApi; MODELS: Record<string, ModelInfo>; SAMPLERS: string[]; SCHEDULERS: string[]; BACKENDS: Record<string, string>;
  RENDER_KEYS: string[]; REF_OWNER: string; PLAN_PROMPT: string; LEAN_PROMPT: string; ANALYSIS_PROMPT: string;
  snapPoint(x: unknown, y: unknown, model: string): { x: number; y: number };
}
interface ChatApi {
  current(): { chat?: Chat | null; msgs?: Msg[] | null; busy?: boolean };
  redraw(): void; save(): Promise<void> | undefined; scrollTo(id: string): void; setStatus(t: string): void;
}

export const C = () => mod<CoreMod>('core');
const ui = { toast, menu, confirmBox, go: (page: string, arg?: unknown) => L.ui.go(page, arg) };
export const U = () => ui;
export const IL = () => mod<IllustMod>('illust');
export const Illust = () => IL().Illust;
export const X = () => mod<{ X: HookDefs }>('hooks').X;
export const chatApi = () => mod<{ chatApi: ChatApi }>('chat').chatApi;

// ════════ 작은 도우미 ════════
export const cur = () => chatApi().current();
export const clone = <T,>(v: T): T => v == null ? v : structuredClone(v);
export const pickKeys = (o: object | null | undefined, keys: string[]): Record<string, unknown> => { const r = (o ?? {}) as Record<string, unknown>; return Object.fromEntries(keys.filter(k => r[k] !== undefined).map(k => [k, clone(r[k])])); };
export const errText = (e: unknown) => (e instanceof Error ? e.message : '') || String(e);
/** 실패하면 알림으로 이유를 보여 준다 */
export const guard = <A extends unknown[]>(fn: (...a: A) => unknown) => async (...a: A): Promise<void> => { try { await fn(...a); } catch (e) { console.error(e); U().toast(errText(e), 'err'); } };
export const modelLabel = (c?: GenConfig | null) => c?.backend && c.backend !== 'nai' ? IL().BACKENDS[c.backend] : (IL().MODELS[c?.model ?? '']?.label || c?.model || '');
export const configLine = (c?: GenConfig | null) => c ? [modelLabel(c), `${c.width} × ${c.height}`, c.backend === 'nai' || c.backend === 'a1111' ? `${c.steps} Steps` : ''].filter(Boolean).join(' · ') : '';
export const flat = (s: unknown) => String(s ?? '').normalize('NFC').replace(/[\s*_~`"'“”‘’「」『』]/g, '');
export const lastReply = (): Msg | null => { const { msgs } = cur(); return msgs ? [...msgs].reverse().find(m => m.role === 'assistant' && C().msgText(m).trim()) ?? null : null; };
export const mustBeOpen = (msg: Msg) => { if (!cur().msgs?.includes(msg)) throw new Error('대상 답변이 있는 대화가 열려 있지 않아요. 대화를 다시 열어 주세요.'); };
export async function saveImage(src: string, name: string) { const blob = await (await fetch(src)).blob(); C().download(`${name}.${(blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, blob); }
export const blankScene = (n = 1): Scene => ({ title: `장면 ${n}`, prompt: '', camera: '', negative: '', anchor: '', finalPrompt: false, characters: [] });
/** 지시문이 제목을 쓰지 않게 된 뒤로 붙는 기본 이름(장면 1 …)은 화면에 따로 적지 않는다 */
export const shownTitle = (t?: string) => /^(?:장면 \d+|새 장면)$/.test(t || '') ? '' : (t || '');
export const when = (ts?: number) => ts ? new Date(ts).toLocaleString('ko-KR') : '';
export type { Card };
