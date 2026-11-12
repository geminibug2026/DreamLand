// 삽화(씬북)가 쓰는 자료 꼴. 저장 꼴은 옛 것 그대로다
import type { Char, Chat, IllustPerson as Person, IllustScene as Scene, IllustGenConfig as GenConfig, IllustVersion as Version, IllustItem as Slot, IllustReview as Review, Msg, Swipe } from '../lib/types';
export type { IllustPerson as Person, IllustScene as Scene, IllustRefUse as RefUse, IllustGenConfig as GenConfig, IllustReview as Review, IllustVersion as Version, IllustItem as Slot, IllustPlanRecord as PlanRecord, Msg, Swipe } from '../lib/types';

export interface Preset { name: string; config: GenConfig }
export interface HistoryEntry { time: number; reason: string; settings: IllustCfg }
export interface Profile { id: string; name?: string; condition?: string; appearance?: string; outfit?: string }
export interface LibPerson { id: string; name: string; appearance?: string; outfit?: string; negative?: string; player?: boolean; profiles?: Profile[] }
export interface Visual { world?: string; direction?: string; playerMode?: string; library?: LibPerson[] }
export interface IllustCfg extends GenConfig {
  naiKey?: string; automatic: 'off' | 'review' | 'generate'; auto: boolean; mode: string; every: number; maxScenes: number;
  contextMessages: number; analysisMode: string; placement: string; displayWidth: number; compact: boolean;
  autoSize?: boolean; look?: string; leanPrompt?: boolean; frame: string; frameWide: string; frameInk: string;
  analysisPrompt?: string; planPrompt?: string; presets: Preset[]; history: HistoryEntry[]; characterVisuals: Record<string, Visual>;
}
export interface Job {
  id: string; chat: Chat; msg: Msg; sw: Swipe; scene: Scene; slot: string | null; config: GenConfig; automatic: boolean;
  label: string; state: 'waiting' | 'running' | 'done' | 'failed' | 'uncertain' | 'cancelled'; error?: string; seen?: boolean; ts: number;
}
/** 보관함(assets)의 그림 기록 */
export interface Asset {
  id: string; owner: string; kind: string; name?: string; data: string; ts?: number; title?: string; prompt?: string;
  scene?: Scene; config?: GenConfig | null; seed?: number | null; review?: Review; width?: number; height?: number;
}
export interface FrameRec { id: string; owner: string; kind: string; name: string; data: string; width: number; height: number; window: number[]; mask: string; ts?: number }
export interface Conn { id: string; name: string; model?: string }
export interface Persona { id: string; name: string; visual?: { appearance?: string; outfit?: string; negative?: string } }
export type Card = (Char | Persona) & { visual?: { appearance?: string; outfit?: string; negative?: string } };
export interface Composed { base: string; negative: string; coords: boolean; looks: { name: string; caption: string; negative: string; x: number; y: number }[] }
export interface PlanRead { found: boolean; scenes: Scene[]; raw: string; error?: string; repairs?: string[]; warnings?: string[]; asked?: boolean }
export interface ModelInfo { label: string; family: number; characters: number; references: boolean }
export type { Char, Chat };

// ── 삽화 엔진(src/lib/illust.ts 의 Illust)을 이 묶음이 보는 꼴 ──
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
  slot(it: Slot): Slot & { versions: Version[]; sel: number }; select(it: Slot, n: number): Slot; insert(sw: Swipe, rec: Asset): Slot; remove(id: string): Promise<void>;
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
