// 삽화(씬북)가 쓰는 자료 꼴. 저장 꼴은 옛 것 그대로다
import type { Char, Chat } from '../types';

/** 장면 속 인물 한 명 */
export interface Person { name?: string; prompt?: string; negative?: string; x?: number; y?: number; id?: string }
/** 편집 · 생성에 쓰는 장면 */
export interface Scene { title?: string; prompt?: string; camera?: string; negative?: string; anchor?: string; finalPrompt?: boolean; characters: Person[]; size?: string }
export interface RefUse { id: string; kind: string; mode?: string; strength?: number; fidelity?: number; information?: number }
/** 그림 한 장에 얼려 두는 생성 설정 */
export interface GenConfig {
  backend: string; model: string; width: number; height: number; steps: number; scale: number; seed?: number;
  sampler?: string; scheduler?: string; cfgRescale?: number; style?: string; negative?: string; quality?: boolean;
  budgetGuard?: boolean; transparent?: boolean; references?: RefUse[]; useCoords?: boolean; useOrder?: boolean;
  imgModel?: string; connId?: string; a1111?: string; sdSampler?: string;
  [k: string]: unknown;
}
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
export interface Review { summary?: string; issues?: string[]; created?: number }
export interface Version { id: string; seed?: number | null; ts?: number; scene?: Scene; config?: GenConfig | null; review?: Review }
/** 답변에 붙은 삽화 한 자리 (버전 여러 장) */
export interface Slot { id: string; slotId: string; title?: string; anchor?: string; hidden?: boolean; sel: number; versions: Version[] }
export interface PlanRecord { status?: string; raw?: string; error?: string; repairs?: string[]; warnings?: string[]; seen?: boolean; ts?: number }
export interface Swipe { text?: string; illust?: Slot[]; illustDraft?: Scene[]; illustDraftConfig?: GenConfig; illustPlan?: PlanRecord }
export interface Msg { id: string; role: 'user' | 'assistant' | 'system'; name?: string; swipes: Swipe[]; sw: number; hidden?: boolean }
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
