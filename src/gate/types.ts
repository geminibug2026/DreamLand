// 물음(판정문)이 쓰는 자료 꼴

/** 물음에 붙는 수식어: sticky(참이 되면 N턴 더 유지) · cooldown(참이었다가 꺼지면 N턴 쉬기) · every(N턴마다만 다시 묻기) · until(이 문장이 참이 될 때까지 유지) */
export interface AskMods { sticky?: number; cooldown?: number; every?: number; until?: string }
/** 물음 하나가 쓰인 자리: 문장 + 수식어 */
export interface AskSite { stmt: string; mods: AskMods }
/** 자리마다의 타이머 기록 (chat.gate.st). at: 마지막으로 계산한 턴 · on: 유지가 시작된 턴 · cool: 쉬기가 끝나는 턴 · asked: 마지막으로 실제로 물은 턴 · p: 그 턴 앞의 모습 */
export interface SiteState { at: number; v: boolean; on?: number | null; cool?: number | null; asked?: number | null; p?: SiteState }

/** 결과 꼬리표: 예 · 아니오 · 캐시(같은 턴에 이미 물음) · 유지 중 · 쉬는 중 · 주기 대기 · 답 없음(시간 초과 · 실패) · 상한 넘김 · 꺼짐 · 묻지 못함 */
export type AskTag = 'yes' | 'no' | 'held' | 'cool' | 'every' | 'none' | 'over' | 'off' | 'unasked';
export interface AskRow { key: string; stmt: string; mods: AskMods; kind: 'yn' | 'pick' | 'lore'; from: string; v: boolean; tag: AskTag; cached?: boolean; left?: number; pick?: string; options?: string[] }
/** 한 턴의 판정 기록 (chat.gate.turn). key 가 같으면(마지막 메시지 + 스와이프) 다시 묻지 않는다 */
export interface AskTurn { key: string; T: number; ans: Record<string, boolean>; picks: Record<string, string | null>; res: Record<string, { v: boolean; tag: AskTag; left?: number }>; rows: AskRow[]; calls: number; ms: number; err?: string; at: number }
export interface GateData { st?: Record<string, SiteState>; turn?: AskTurn; lastType?: string }
export interface GateCfg { on: boolean; depth: number; max: number; timeout: number; prompt: string }
