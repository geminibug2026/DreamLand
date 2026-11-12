// 드림랜드 자료 꼴. 옮기는 화면이 쓰는 것부터 적어 나간다

export interface Char {
  id: string; name: string; avatar?: string; tags: string[]; creator?: string; version?: string;
  fav?: boolean; folder?: string; createdAt: number;
  description?: string; personality?: string; scenario?: string; creatorNotes?: string;
  [k: string]: unknown;
}
export interface Chat {
  id: string; name?: string; preview?: string; charIds: string[]; createdAt: number; updatedAt: number;
  [k: string]: unknown;
}
export interface Folder { id: string; name: string }
export interface Settings {
  folders?: Folder[]; homeCols?: number; lastPage?: string; lastChat?: string;
  [k: string]: unknown;
}
export interface Colls { chars: Char; chats: Chat }
export interface Store {
  chars: Char[]; chats: Chat[]; settings: Settings;
  get<K extends keyof Colls>(coll: K, id: string): Colls[K] | undefined;
  save<K extends keyof Colls>(coll: K, obj: Colls[K], silent?: boolean): Promise<Colls[K]>;
  remove(coll: keyof Colls, id: string): Promise<void>;
  set(patch: Partial<Settings>): void;
}

export type MenuItem = { label: string; ic?: string; hint?: string; danger?: boolean; onclick: () => void } | '-' | null | false | undefined;
export interface ModalHandle { close(): void }
export interface ModalAction { label: string; cls?: string; onclick?: () => unknown }
/** [화면, 이름, 아이콘, 휴대폰 아래 탭에 고정, 상단 메뉴 영문 이름, 상단에 바로 보이기] */
export type NavItem = [page: string, label: string, icon: string, main: boolean, en?: string, top?: boolean];
