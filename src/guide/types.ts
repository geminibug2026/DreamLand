// 등불지기(앱 안의 조수)와 첫걸음 안내의 자료 꼴
/** 모델이 답 끝에 적는 도구 호출 한 번 */
export interface ToolCall { tool: string; args: Record<string, unknown>; /** 계획의 몇째 걸음(1 부터)을 끝냈다고 표시하는가 — 호출과 함께 적으면 왕복을 따로 쓰지 않는다 */ tick?: number[]; /** 이 답으로 맺는다 (읽어 들이는 동안만) */ end?: boolean }
/** 답 한 덩이를 읽은 결과: 사람이 볼 글 · 도구 호출(있으면) · 호출이 틀렸을 때 모델에 돌려줄 말 */
export interface Parsed { text: string; call?: ToolCall; /** 한 답에 적은 호출 모두 (call 은 그 첫째) */ calls?: ToolCall[]; error?: string; /** 도구 없이 끝맺으며 계획 걸음만 표시할 때 ({"tick": [3]}) */ tick?: number[]; /** "end": true — 제안만 한 답이면 결과를 다시 묻지 않고 맺는다 */ end?: boolean; /** end 일 때 덩이 뒤에 적은 맺음말 */ tail?: string }

/** 변경 카드의 한 칸: 바꾸기 전과 후 */
export interface FieldChange { name: string; before: string; after: string }
/** 쓰기 도구가 남기는 일거리. 적용을 누를 때 지금 자료에 다시 대 본다 (그 사이 사람이 고친 것을 덮지 않게 칸 단위로만 쓴다) */
export type Op =
  | { type: 'create'; coll: Kind; obj: Record<string, unknown> }
  | { type: 'set'; coll: Kind; id: string; fields: Record<string, unknown> }
  | { type: 'entry'; loreId: string; entryId: string; fields: Record<string, unknown> }
  | { type: 'block'; presetId: string; blockId: string; after: string; fields: Record<string, unknown> }
  /** 퀵 리플라이 세트 안의 버튼 하나 (없으면 끝에 더한다) */
  | { type: 'qritem'; setId: string; itemId: string; fields: Record<string, unknown> }
  /** 지우기: 자료 하나 통째로 (정규식 · 퀵 리플라이 세트) */
  | { type: 'delete'; coll: Kind; id: string }
  /** 로어북 항목 하나 지우기 */
  | { type: 'entrydel'; loreId: string; entryId: string }
  /** 퀵 리플라이 버튼 하나 지우기 */
  | { type: 'qrdel'; setId: string; itemId: string };
/** 조수가 손댈 수 있는 자료 종류. theme · qr 은 설정 안에 산다 */
export type Kind = 'chars' | 'personas' | 'lore' | 'presets' | 'regex' | 'theme' | 'qr';
export type ChangeState = 'pending' | 'applied' | 'dropped' | 'undone' | 'failed';
export interface Change {
  id: string; verb: 'create' | 'update' | 'delete'; kind: Kind; target: string; op: Op; fields: FieldChange[];
  state: ChangeState; at: number; undoId?: string; err?: string;
}
/** 되돌리기 장부의 한 줄. 사본(before)은 따로 한 줄씩 둔다 (kv 의 gdundo:<id>) */
export interface UndoRow { id: string; at: number; kind: Kind; targetId: string; target: string; created: boolean; stamp?: number; /** 'th': 실리태번 스크립트가 고친 것 (조수의 기록과 따로 센다) */ src?: string }

/** 입력창에서 @ 로 붙인 맥락 */
export interface Ref { kind: 'chars' | 'personas' | 'lore' | 'presets' | 'chats' | 'regex'; id: string; name: string }
/** 말에 붙인 파일 하나. 그림은 줄여서 dataURL 로, 글 파일은 글로 (길면 잘라서), 캐릭터 카드는 카드 JSON 글 + 그림 */
export interface Attach { kind: 'image' | 'text' | 'card'; name: string; /** 원래 파일 크기 (바이트) */ size: number; /** 줄인 그림 (dataURL) */ image?: string; text?: string; /** 글을 잘랐으면 원래 글자 수 */ full?: number }
/** 대화 기록의 한 줄 */
export type Item =
  | { k: 'user'; text: string; refs?: Ref[]; /** 모델에는 text 대신 이것을 보낸다 (/명령을 풀어 쓴 것) */ ask?: string; /** 붙인 파일 */ files?: Attach[]; at: number }
  /** echo: 보이기만 하는 맺음말 (모델에는 앞의 말 raw 에 이미 들어 있다) */
  | { k: 'ai'; text: string; raw: string; at: number; echo?: boolean }
  | { k: 'tool'; name: string; args: Record<string, unknown>; ok: boolean; out: string; at: number }
  /** kept: 다시 생성 · 고쳐 보내기로 지운 시도에서 이미 적용해 둔 카드 (그대로 남긴다) */
  | { k: 'change'; change: Change; at: number; kept?: boolean }
  /** 오류 · 멈춤. detail: 원래 오류 글 (그림을 못 읽는 모델 등) */
  | { k: 'err'; text: string; detail?: string; at: number }
  /** 앱이 사용자에게만 남기는 짧은 알림 (모델에는 가지 않는다) */
  | { k: 'note'; text: string; at: number };
export interface Talk { id: string; title: string; at: number; items: Item[]; /** 조수가 세운 할 일 목록 (plan 도구) */ plan?: Plan; /** 그림을 빼고 보낸다 (그림을 못 읽는 모델) */ noImages?: boolean }
/** 할 일 목록의 한 걸음 */
export interface PlanStep { text: string; state: 'todo' | 'doing' | 'done' | 'skip' }
export interface Plan { title?: string; steps: PlanStep[]; at: number; /** 처음 세운 때 */ since?: number }
export interface TalkHead { id: string; title: string; at: number }
export type Status = 'idle' | 'working' | 'review' | 'done';

/** 도구 하나. write 인 것은 바로 쓰지 않고 변경 카드를 돌려준다 */
export interface ToolDef {
  name: string; write?: boolean; /** 모델에 보여 줄 인자 꼴과 한 줄 설명 (영어) */ sig: string; desc: string;
  run(args: Record<string, unknown>): unknown | Promise<unknown>;
}
/** 설명서의 한 주제. 제목과 본문은 로케일(guide.hb.<id>.t / .b)에 있고, 본문의 {slot} 은 실제 화면 라벨로 채운다 */
export interface Topic { id: string; group: string; page?: string; arg?: string; /** 찾기에 쓰는 낱말 (세 언어 섞어서) */ tags: string }
/** 둘러보기의 한 걸음 */
export interface TourStep { id: string; page?: string; arg?: string; /** 고리를 두를 요소 (앞에서부터 보이는 첫째). 없으면 가운데 카드 */ sel?: string[]; /** 재기 전에 한 번 누를 것 (탭 등) */ click?: string; art?: 'mark' | 'modes' | 'panel' | 'end' }
