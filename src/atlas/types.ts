// 성좌 도감의 자료 꼴: 대화 한 방을 훑어 센 숫자 · 별(업적) 정의 · 저장 한 줄
/** 대화 한 방의 메시지를 훑어 센 것. 전부 숫자라 그대로 더하거나 큰 값을 고르면 된다 (days 만 날짜 목록) */
export interface MsgStat {
  /** 내가 보낸 말 · 받은 답 · 주고받은 글자 수 · 가장 긴 답의 글자 수 */
  turns: number; replies: number; ink: number; longest: number;
  /** 넘겨 본 답(스와이프) 수 · 한 답에서 가장 많이 넘긴 수 */
  swipes: number; maxSwipes: number;
  /** 자정~새벽 4시에 보낸 말 · 그중 새벽 3시대 · 보름달 날 · 그믐날 · 달의 여덟 얼굴(비트) · 하루에 가장 많이 보낸 말 */
  night: number; three: number; full: number; dark: number; phases: number; dayMax: number;
  /** 말을 건 날들 (그 지역 날짜의 일련번호, 오름차순) */
  days: number[];
  scenes: number; calls: number; callSecs: number; missed: number; illust: number; tr: number; rolls: number; react: number;
  crit: number; fumble: number; fights: number; boss: number; quests: number; minis: number; sessions: number; places: number;
  /** 장기기억 수 (mem 저장소) */
  mem: number;
}
/** 여러 방을 합친 숫자판. 열쇠는 defs.ts 의 별이 가리키는 이름 */
export type Tally = Record<string, number>;

/** 별 하나. at 은 단계별 문턱(1~3개) — 단계가 오를수록 별이 밝아진다 */
export interface StarDef {
  id: string; con: string; x: number; y: number;
  /** 숫자판의 어느 칸을 보나 */ m: string; at: number[];
  /** 조건 글에 적을 때 나눌 값 (초 → 시간 등) */ unit?: number;
  /** 숨은 별: 켜지기 전에는 조건이 ????? 로 보인다 */ hidden?: boolean;
}
/** 별자리 하나: 별들과 잇는 선, 성도에서의 자리 */
export interface ConDef { id: string; no: string; cx: number; cy: number; s: number; rot: number; edges: [string, string][]; stars: StarDef[] }
/** 한 사람과의 별자리의 마일스톤 */
export interface MileDef { id: string; m: string; at: number; /** 캐릭터가 한 번 언급할 수 있게 넣는 사실 한 줄 (영어, 모델용) */ fact: string }

/** 캐릭터에게 알려 줄, 아직 말하지 않은 별 */
export interface Fresh { charId: string; mile: string; at: number }
/** kv 의 'atlas' 한 줄 */
export interface AtlasRec {
  id: 'atlas'; v: 1;
  /** 별 id → 단계마다 켜진 때 (길이 = 지금 단계) */ got: Record<string, number[]>;
  /** 캐릭터 id → 마일스톤 id → 켜진 때 */ per: Record<string, Record<string, number>>;
  fresh: Fresh[];
  /** 방마다 훑어 둔 숫자 (sig 가 같으면 다시 읽지 않는다) */ scan: Record<string, { sig: string; s: MsgStat }>;
  /** 처음 도감을 만든 때 (그 전의 기록은 조용히 한꺼번에 켠다) */ born: number;
}
export interface AtlasCfg { /** 별이 켜질 때 구석에 카드 */ card: boolean; /** 카드와 함께 한 음 */ sound: boolean; /** 캐릭터가 최근 켜진 별을 한 번 언급할 수 있게 프롬프트에 한 줄 */ tell: boolean }
/** 방금 켜진 것 (카드가 받는다) */
export interface Lit { kind: 'star' | 'mile' | 'many'; id: string; tier: number; con?: string; charId?: string; n?: number; done?: boolean }
