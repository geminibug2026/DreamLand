// 대화 화면이 다리로 부르는 옛 모듈들 (생성 로직 · 상태 계산 · 저장소). 쓰는 것만 타입으로 적는다
import { mod } from '../legacy';
import type { MenuItem, ModalAction, ModalHandle } from '../types';
import type { Book, Built, Cast, CmdItem, Conn, Ctx, Field, GenType, IllustItem, Later, Modes, Motive, Msg, PMsg, Persona, Preset, PresenceNow, Room, SceneSpec, SettingsX, StatePatch, TrackState } from './types';

/** 화면 파일의 needs 에 그대로 넣는다 */
export const NEEDS = ['core', 'ui', 'engine', 'format', 'hooks', 'assets', 'memory', 'illust', 'live', 'clock', 'f-schedule', 'f-lore', 'cards', 'tone', 'chat'];

export interface StoreX {
  chars: Cast[]; chats: Room[]; personas: Persona[]; lore: Book[]; presets: Preset[]; conns: Conn[]; settings: SettingsX;
  get(coll: 'chars', id?: string | null): Cast | undefined;
  get(coll: 'chats', id?: string | null): Room | undefined;
  get(coll: 'personas', id?: string | null): Persona | undefined;
  get(coll: 'conns', id?: string | null): Conn | undefined;
  get(coll: 'lore', id?: string | null): Book | undefined;
  save(coll: 'chats', obj: Room, silent?: boolean): Promise<Room>;
  remove(coll: 'chats', id: string): Promise<void>;
  set(patch: Partial<SettingsX>): void;
  msgs(chatId: string): Promise<Msg[]>;
  msgsFast(chatId: string): Promise<Msg[]>;
  saveMsgs(chat: Room, list: Msg[]): Promise<void>;
  persona(chat?: Room | null): Persona;
  connFor(chat?: Room | null): Conn | undefined;
  presetFor(chat?: Room | null): Preset;
}
interface AssetRow { id: string; kind?: string; owner?: string;[k: string]: unknown }
interface CoreX {
  S: StoreX;
  DB: {
    get(store: string, id: string): Promise<Record<string, unknown> | undefined>;
    put(store: string, obj: object): Promise<unknown>;
    del(store: string, id: string): Promise<unknown>;
    byOwner(owner: string): Promise<AssetRow[]>;
  };
  on(ev: string, fn: (data?: unknown) => void): () => void;
  emit(ev: string, data?: unknown): void;
  uid(): string; now(): number;
  newChat(o?: Partial<Room>): Room;
  newMsg(role: Msg['role'], text: string, o?: Partial<Msg>): Msg;
  msgText(m: Msg): string;
  fmtTime(ts?: number): string;
  download(name: string, data: string, type?: string): void;
  pickFiles(o?: { accept?: string; multiple?: boolean }): Promise<File[]>;
  readDataURL(f: File): Promise<string>;
  shrinkImage(src: string, max?: number, mime?: string, q?: number): Promise<string>;
}
export interface FormDef { k?: string; label?: string; type?: string; hint?: string; ph?: string; rows?: number; min?: number; max?: number; step?: number; half?: boolean; third?: boolean; opts?: (string | [string, string])[]; section?: string; el?: Node }
interface UiX {
  toast(msg: string, kind?: string): void;
  modal(o: { title?: string; body?: Node; actions?: (ModalAction & { ic?: string })[]; wide?: boolean; onClose?: () => void }): ModalHandle;
  menu(anchor: Element, items: MenuItem[]): void;
  confirmBox(msg: string, okLabel?: string, danger?: boolean): Promise<boolean>;
  promptBox(title: string, value?: string, o?: { area?: boolean; placeholder?: string }): Promise<string | null>;
  charPicker(o: { title?: string; onDone: (ids: string[]) => void }): void;
  form(obj: object, defs: FormDef[], onChange?: () => void): HTMLElement;
  go(page: string, arg?: unknown): void;
  route: { page: string; arg: unknown };
}
export interface RegexOpt { who: 'user' | 'ai' | 'slash'; target: 'display' | 'store'; depth?: number; charId?: string; chat?: Room | null; ctx?: Ctx; edit?: boolean }
interface EngineX {
  buildPrompt(o: { chat: Room; char: Cast; chars: Cast[]; persona: Persona; preset: Preset; msgs: Msg[]; type: GenType; commit?: boolean; proactive?: boolean }): Built;
  streamChat(conn: Conn, P: object, messages: PMsg[], o: { signal: AbortSignal; onText(d: string): void; onThink(d: string): void }): Promise<{ text: string }>;
  applyRegex(text: string, o: RegexOpt): string;
  macro(text: string, ctx: Ctx): string;
  makeCtx(o: { chat: Room; char: Cast; chars: Cast[]; persona: Persona; msgs: Msg[]; input?: string }): Ctx;
  tokens(text: string): number;
  roll(expr: string): { expr: string; rolls: number[]; mod: number; total: number } | null;
  quickCall(system: string, user: string, o?: { maxTokens?: number; conn?: Conn }): Promise<string>;
  prefillOk(conn: Conn): boolean;
  splitThink(text: string): { text: string; think: string };
  parseTalk(text: string): { text: string; cmds: { name: string; args: Record<string, string> }[] };
  postFormat(text: string): string;
}
export interface XAction { owner: string; label: string; icon?: string; run(m: Msg, chat: Room | null): unknown }
export interface XComposer { owner: string; label: string; icon?: string; run(input: HTMLTextAreaElement): unknown }
export interface XPanel { owner: string; title: string; icon?: string; open?: boolean; render(chat: Room, msgs: Msg[]): Node }
export interface XCommand { owner: string; args?: string; help?: string; run(arg: string, api: unknown): unknown }
type Translate = (text: string, language: string, o: { chat?: Room | null; context?: { name: string; text: string }[] }) => Promise<string>;
interface HooksX {
  X: {
    commands: Map<string, XCommand>; actions: XAction[]; composer: XComposer[]; panels: XPanel[];
    before: { owner: string; fn(o: { chat: Room; msgs: Msg[]; type: GenType; chars: Cast[]; persona: Persona }): unknown }[];
    translate: Translate | null;
    prompt: { owner: string }[]; filters?: { owner?: string }[];
  };
  runFilters(text: string, info: { role: string; msg: Msg; chat: Room | null }): string;
}
interface AssetsX {
  Assets: {
    ready(owners: string[]): boolean; load(owners: string[]): Promise<void>; count(owners: string[]): number;
    expand(text: string, owners: string[], seed?: string): string;
    ownerOfChar(id: string): string; ownerOfPersona(id: string): string; removeOwner(owner: string): Promise<void>;
  };
}
export interface MemRec { memories: unknown[]; status?: { entity: string; slot: string; value: string }[] }
interface MemoryX {
  Memory: {
    get(chatId: string): MemRec | undefined; load(chatId: string): Promise<unknown>;
    add(chatId: string, rec: object): Promise<unknown>; commit(chat: Room, msgs: Msg[], ai: Msg): Promise<unknown>;
  };
}
interface IllustX {
  Illust: {
    ready(chatId: string): boolean; load(chatId: string): Promise<void>; data(id: string): string; remove(id: string): Promise<void>;
    strip(text: string): string; extract(text: string): { text: string; scenes: SceneSpec[] };
    analyze(chat: Room, msgs: Msg[], msg: Msg, signal?: AbortSignal | null, o?: { manual?: boolean }): Promise<SceneSpec[]>;
    enqueue(chat: Room, m: Msg, scene: SceneSpec, done: (err?: Error) => void): void;
  };
  translateText: Translate;
}
export interface LiveExtract { text: string; scene: { title?: string; place?: string; time?: string } | null; sceneEnd: { summary?: string } | null; later: { in?: string; about?: string }[]; patch: StatePatch | null }
export interface AutoPlan {
  plan: { at: number; kind: string; blocks: string[]; notes: string[] }; ch: Cast; due?: Later; owed: { at: number; charId: string } | null; motive: Motive;
  count: number; cap: number; streak: number; last: { kind: string; at: number; charId: string } | null; who: string; status: string; cdLeft: Record<string, number>;
}
export interface LiveObj {
  pending: Motive | null; view: { chat: string; i: number } | null;
  onChange: (() => void) | null; onUser: ((s?: string) => void) | null;
  planOf: ((chat: Room) => AutoPlan | null) | null; poke: ((chat: Room) => Promise<boolean>) | null;
  clock(t: number): string; span(ms: number): string;
  presence(chat: Room, ch?: Cast | null): PresenceNow;
  setPresence(chat: Room, ch: Cast | undefined, o: { status: string; activity?: string; durMs?: number; hold?: boolean }): unknown;
  clearPresence(chat: Room, ch: Cast): void;
  userStatus(): { status: string; auto: boolean; label: string };
  setUserStatus(s: string): void; userStatuses: Record<string, string>; touch(): void;
  fields(mx?: (t: string) => string): Field[]; castFields(mx?: (t: string) => string): Field[];
  state(chat: Room): TrackState;
  extract(text: string): LiveExtract;
  apply(chat: Room, patch: StatePatch | null, o?: { names?: string[]; mx?: (t: string) => string }): boolean;
  arm(chat: Room): void; stamp(chat: Room, m: Msg): boolean; rewind(chat: Room, msgs: Msg[], upto?: number): boolean;
  setValue(chat: Room, key: string, value: string): void;
  toggle(chat: Room, bag: 'trackLock' | 'trackHide', key: string): boolean;
  hud: unknown; editState: unknown; settings: unknown;
  trackCall(chat: Room, chars: Cast[], mx?: (t: string) => string): { system: string; prev: object; any: boolean };
  readCall(text: string): StatePatch | null;
  ping(name: string, text: string): void;
}
interface LiveX {
  Live: LiveObj;
  newLater(o: { in?: string; about?: string }): Later;
  inQuietHours(): boolean; mo(k: string): unknown; tk(k: string): unknown; cdHours(): Record<string, number>;
  quietLeft(from?: string, to?: string): number;
  snapOf(m?: Msg): TrackState | null; stateAt(msgs: Msg[], upto?: number): { i: number; state: TrackState } | null;
  timeline(msgs: Msg[]): number[]; copyState(s?: TrackState | null): TrackState;
  rewound(cur: TrackState, target: TrackState, locks?: Record<string, boolean>): TrackState;
  PROMPTS: Record<string, [string, string, string, string][]>;
}
interface ClockX {
  Clock: {
    mode(chat?: Room | null): 'real' | 'story' | 'none'; ms(chat?: Room | null): number; now(chat?: Room | null): Date;
    timeOf(chat: Room | null, m: Msg): number;
    move(chat: Room, o: { set?: string; advance?: string }): Promise<boolean>;
  };
  clockLabel(chat: Room): string; clockHint(chat: Room): string;
}
export interface Sched { days?: unknown[] }
interface ScheduleX {
  Schedule: { edit(ch: Cast): void; row(ch: Cast, done: () => void): Node; onChange: (() => void) | null };
  scheduleOf(ch?: Cast | null): Sched | null;
  STATUS: Record<string, string>; MOTIVES: Record<string, [string, number, string]>; MOTIVE_ORDER: string[];
  planAuto(env: object): AutoPlan['plan'];
  pickMotive(env: object): Motive;
  wakeIn(s: Sched): number;
  replyDelay(status: string, ranges: Record<string, unknown>, o: { named: boolean; namedPct: unknown }): number;
  motiveLabel(k?: string): string;
  cooldownLeft(kind: string, cd: Record<string, number>, hours: Record<string, number>, nowTs: number): number;
}
interface LoreX { loreLinker(holder: Room, save: () => void, o: { fixed(): [Book, string][] }): Node }
interface CardsX { chatToStJsonl(chat: Room, msgs: Msg[], user: string, char: string): string }
interface FormatX { render(text: string, o: { style: string; prose: boolean }): string }
export interface ChatApi {
  reveal(id: string): boolean; roomName(c: Room): string; groupTitle(c: Room): string;
  current(): { chat: Room | null; msgs: Msg[]; busy: boolean };
  generate(type?: GenType): unknown; send(text: string): unknown; insert(text: string): void;
  addSystemMessage(text: string): unknown; save(): unknown; redraw(): void; setStatus(t: string): void;
  scrollTo(id: string): void; openDrawer(): void;
}
interface OldChat { chatApi: ChatApi; startChat(charIds: string[], o?: { mode?: 'rp' | 'talk'; open?: boolean }): Promise<Room | null>; startMenu(anchor: Element, charIds: string[]): void }

/** 옛 모듈 꺼내 쓰기. 처음 쓸 때 한 번만 찾는다 */
const lazy = <T,>(name: string) => { let v: T | undefined; return () => (v ??= mod<T>(name)); };
const core = lazy<CoreX>('core'), uiM = lazy<UiX>('ui'), engine = lazy<EngineX>('engine'), hooks = lazy<HooksX>('hooks'), assets = lazy<AssetsX>('assets');
const memory = lazy<MemoryX>('memory'), illust = lazy<IllustX>('illust'), live = lazy<LiveX>('live'), clock = lazy<ClockX>('clock'), sched = lazy<ScheduleX>('f-schedule');
const lore = lazy<LoreX>('f-lore'), cards = lazy<CardsX>('cards'), format = lazy<FormatX>('format'), oldChat = lazy<OldChat>('chat');
export const B = {
  get core() { return core(); }, get S() { return core().S; }, get DB() { return core().DB; }, get ui() { return uiM(); }, get engine() { return engine(); },
  get X() { return hooks().X; }, get runFilters() { return hooks().runFilters; }, get Assets() { return assets().Assets; }, get Memory() { return memory().Memory; },
  get Illust() { return illust().Illust; }, get translateText() { return illust().translateText; }, get live() { return live(); }, get Live() { return live().Live; },
  get Clock() { return clock().Clock; }, get clock() { return clock(); }, get sched() { return sched(); }, get lore() { return lore(); }, get cards() { return cards(); },
  get render() { return format().render; }, get oldChat() { return oldChat(); },
};
// 다른 기능이 꽂은 것(패널 · 메뉴 항목 · 명령어 · 프롬프트 조각 · 생성 전 준비)이 놓이는 차례. 기능 모듈이 뜨는 순서가 바뀌어도 화면과 프롬프트가 늘 같은 차례로 나오게 한다
const OWNER_ORDER = ['clock', 'live', 'mode', 'illust', 'presetvars', 'translate', 'assets', 'expr', 'vectors', 'modules', 'scenebook', 'regex', 'almanac', 'memoria'];
const rank = (o?: string) => { const i = OWNER_ORDER.indexOf(o || ''); return i < 0 ? OWNER_ORDER.length : i; };
/** 꽂힌 것들을 정해 둔 차례로 다시 줄 세운다 (모르는 주인 — 확장 — 은 뒤에, 등록한 순서 그대로) */
export function orderHooks() {
  const X = hooks().X, by = (a: { owner?: string }, b: { owner?: string }) => rank(a.owner) - rank(b.owner);
  X.panels.sort(by); X.actions.sort(by); X.composer.sort(by); X.before.sort(by); X.prompt.sort(by);
  const cmds = [...X.commands].sort((a, b) => by(a[1], b[1])); X.commands.clear(); for (const [k, v] of cmds) X.commands.set(k, v);
}
/** 대화 모드 설정 값 (숫자로) */
export const moN = (k: keyof Modes & string) => +(B.live.mo(k) as number) || 0;
export type { CmdItem, IllustItem };
