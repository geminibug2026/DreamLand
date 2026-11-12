// 아직 옮기지 않은 모듈(/js)을 실행 중에 불러 쓰는 다리. 화면을 옮길 때마다 여기서 쓰는 것이 줄어든다
import type { Char, Chat, MenuItem, ModalAction, ModalHandle, NavItem, Store } from './types';

interface Core {
  S: Store;
  on(ev: string, fn: (data?: unknown) => void): () => void;
  emit(ev: string, data?: unknown): void;
  uid(): string;
  newChar(o?: Partial<Char>): Char;
  fmtTime(ts: number): string;
}
interface Ui {
  I: Record<string, string>;
  route: { page: string; arg: unknown };
  go(page: string, arg?: unknown): void;
  refresh(): void;
  registerPage(name: string, render: (root: HTMLElement, arg?: unknown) => void): void;
  toast(msg: string, kind?: string): void;
  modal(o: { title?: string; body?: Node; actions?: ModalAction[]; wide?: boolean; onClose?: () => void }): ModalHandle;
  menu(anchor: Element, items: MenuItem[]): void;
  confirmBox(msg: string, okLabel?: string, danger?: boolean): Promise<boolean>;
  promptBox(title: string, value?: string, o?: { area?: boolean; placeholder?: string }): Promise<string | null | undefined>;
  charPicker(o: { title?: string; selected?: string[]; multi?: boolean; note?: (c: Char) => string; onDone: (ids: string[]) => void }): void;
  moonPhase(date?: Date): { p: number; name: string };
}
interface Boot {
  start(shell?: { rail?: () => void; palette?: () => void; pages?: () => void | Promise<void> }): Promise<void>;
  navItems(): NavItem[];
}
interface Editors { charSheet(c: Char): void; charEditor(c: Char): void; importDialog(accept?: string): Promise<void> }
interface ChatMod { startMenu(anchor: Element, charIds: string[]): void; startChat(charIds: string[], o?: { mode?: 'rp' | 'talk' }): Promise<Chat | void> }
interface Tone { tint(el: HTMLElement, o?: Char | null): void }
interface EmblemsMod { Emblems: { svg(kind: string, cls?: string): string; pick(tags: string[], name: string): string } }

export interface Legacy { core: Core; ui: Ui; boot: Boot; editors: Editors; chat: ChatMod; tone: Tone; emblems: EmblemsMod }

const load = <T,>(name: string) => import(/* @vite-ignore */ new URL(`/js/${name}.js`, location.origin).href) as Promise<T>;

export let L: Legacy;

// 화면마다 따로 필요한 옛 모듈: 화면 파일의 needs 에 이름을 적어 두면 시작할 때 불러 두고, mod('이름') 으로 꺼내 쓴다
const extra = new Map<string, unknown>();
export const preload = (names: string[]) => Promise.all(names.map(async n => { if (!extra.has(n)) extra.set(n, await load<unknown>(n)); }));
export function mod<T>(name: string): T { if (!extra.has(name)) throw new Error(`옛 모듈 ${name} 을(를) needs 에 적지 않았어요`); return extra.get(name) as T; }
export async function loadLegacy(): Promise<Legacy> {
  const [boot, core, ui, editors, chat, tone, emblems] = await Promise.all([
    load<Boot>('boot'), load<Core>('core'), load<Ui>('ui'), load<Editors>('editors'), load<ChatMod>('chat'), load<Tone>('tone'), load<EmblemsMod>('emblems')]);
  L = { boot, core, ui, editors, chat, tone, emblems };
  return L;
}
