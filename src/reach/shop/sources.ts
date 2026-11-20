// 서점의 출처들: 바깥 카드 사이트를 같은 꼴(search · detail · card)로 감싼다
// 요청은 밖에서 넣어 주는 http 로만 나간다 (화면 쪽이 서버 프록시 · 직접 연결을 고른다) — node 로 따로 돌려 볼 수 있게 아무것도 import 하지 않는다.
// 응답은 믿지 않는다: 칸이 없거나 꼴이 다르면 그 항목만 건너뛴다.

export interface ShopItem {
  src: string; id: string; name: string; creator: string; tagline: string; tags: string[];
  /** 작은 그림 주소 (https 만) */ thumb: string; nsfw: boolean; /** 그 사이트의 카드 쪽 주소 */ url: string;
  tokens: number; stats: { k: 'likes' | 'downloads' | 'chats' | 'messages'; n: number }[]; raw?: unknown;
}
export interface ShopDetail { description: string; firstMes: string; scenario: string; notes: string; /** 인사말 수 (첫 인사 포함) */ greetings: number; tokens: number; lore: boolean; regex: number }
export interface SearchOpts { sort: 'hot' | 'new'; tags: string[]; nsfw: boolean }
export interface SearchResult { items: ShopItem[]; more: boolean; total: number | null }
/** 서가에 들일 것: 그 사이트의 카드 파일 주소이거나, 우리가 조립한 카드(JSON)와 초상 주소 */
export type CardSource = { kind: 'url'; url: string } | { kind: 'json'; name: string; card: Record<string, unknown>; avatar: string };
export interface Source {
  id: string; name: string; site: string; /** 성인물 가림을 풀 수 있는 출처인지 */ adult: boolean; /** 한 쪽에 몇 장 */ per: number;
  search(q: string, page: number, opts: SearchOpts): Promise<SearchResult>;
  detail(item: ShopItem): Promise<ShopDetail | null>;
  card(item: ShopItem): Promise<CardSource>;
}
export interface Http { json(url: string, init?: { method?: string; headers?: Record<string, string>; body?: unknown }): Promise<unknown> }

// ── 방어적으로 읽기 ──
type O = Record<string, unknown>;
const obj = (v: unknown): O => v && typeof v === 'object' && !Array.isArray(v) ? v as O : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown, max = 200000): string => typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : '';
const num = (v: unknown): number => { const n = typeof v === 'string' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
const tagsOf = (v: unknown) => [...new Set(arr(v).map(x => str(x, 40).trim()).filter(Boolean))].slice(0, 24);
/** 그림 주소는 https 만 받는다 (그 밖은 빈 칸 — 화면이 문양을 대신 그린다) */
export const httpsOnly = (v: unknown) => { const s = str(v, 2000).trim(); try { return new URL(s).protocol === 'https:' ? s : ''; } catch { return ''; } };
/** 설명에 섞인 HTML · 마크다운 그림을 걷어 내고 글만 남긴다 (미리보기는 글로만 보여 준다) */
export const plainText = (v: unknown, max = 6000) => str(v).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').replace(/<br\s*\/?>|<\/(p|div|h\d|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const roughTokens = (...texts: string[]) => Math.round(texts.join('').length / 3.6);
const qs = (o: Record<string, string | number | boolean | undefined>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).join('&');

// ════════ chub ════════ (검색: api.chub.ai/search · 자세히: /api/characters/<작가>/<이름>?full=true · 카드: 기존 주소 가져오기가 쓰는 내려받기)
const CHUB = 'https://api.chub.ai', CHUB_IMG = 'https://avatars.charhub.io/avatars/';
const chubPath = (v: unknown) => { const s = str(v, 300).trim().replace(/^\/+/, ''); return /^[^/\s?#]+\/[^/\s?#]+$/.test(s) ? s : ''; };
export function parseChubSearch(raw: unknown): SearchResult {
  const data = obj(obj(raw).data ?? raw), nodes = arr(data.nodes), items: ShopItem[] = [];
  for (const x of nodes) {
    const n = obj(x), path = chubPath(n.fullPath), name = str(n.name, 200).trim(); if (!path || !name) continue;
    const tags = tagsOf(n.topics);
    items.push({ src: 'chub', id: path, name, creator: path.split('/')[0], tagline: plainText(n.tagline, 400), tags: tags.filter(t => t.toLowerCase() !== 'nsfw'),
      thumb: httpsOnly(n.avatar_url) || CHUB_IMG + path.split('/').map(encodeURIComponent).join('/') + '/avatar.webp',
      nsfw: n.nsfw === true || (n.nsfw == null && tags.some(t => t.toLowerCase() === 'nsfw')), url: 'https://chub.ai/characters/' + path, tokens: num(n.nTokens),
      stats: [{ k: 'downloads' as const, n: num(n.starCount) }, { k: 'chats' as const, n: num(n.nChats) }, { k: 'likes' as const, n: num(n.n_favorites) }].filter(s => s.n), raw: n });
  }
  const total = num(data.count);
  return { items, more: !!data.cursor || (total ? false : nodes.length >= 24), total: total || null };
}
export function parseChubDetail(raw: unknown): ShopDetail | null {
  const node = obj(obj(obj(raw).data).node ?? obj(raw).node), def = obj(node.definition); if (!Object.keys(def).length) return null;
  const description = str(def.personality), firstMes = str(def.first_message), scenario = str(def.scenario), alts = arr(def.alternate_greetings).filter(x => str(x).trim());
  const book = obj(def.embedded_lorebook), ext = obj(def.extensions);
  return { description: plainText(description), firstMes: plainText(firstMes, 3000), scenario: plainText(scenario, 2000), notes: plainText(def.description, 2000), greetings: (firstMes.trim() ? 1 : 0) + alts.length,
    tokens: num(node.nTokens) || roughTokens(description, firstMes, scenario, str(def.example_dialogs)), lore: arr(book.entries).length > 0 || Object.keys(obj(book.entries)).length > 0, regex: arr(ext.regex_scripts).length };
}

// ════════ wyvern ════════ (검색: api.wyvern.chat/exploreSearch/characters · 검색 결과에 카드 본문이 함께 온다)
const WYV = 'https://api.wyvern.chat';
const wyvId = (v: unknown) => { const s = str(v, 80); return /^[\w-]{6,64}$/.test(s) ? s : ''; };
export function parseWyvernSearch(raw: unknown): SearchResult {
  const data = obj(raw), rows = arr(data.results), items: ShopItem[] = [];
  for (const x of rows) {
    const c = obj(x), id = wyvId(c.id ?? c._id), name = str(c.name, 200).trim(); if (!id || !name) continue;
    const st = obj(c.statistics_record), es = obj(c.entity_statistics), who = obj(c.creator);
    items.push({ src: 'wyvern', id, name, creator: str(who.displayName, 80) || str(who.vanityUrl, 80), tagline: plainText(c.tagline, 400), tags: tagsOf(c.tags), thumb: httpsOnly(c.avatar), nsfw: !!c.rating && c.rating !== 'none',
      url: 'https://app.wyvern.chat/characters/' + id, tokens: num(c.token_count),
      stats: [{ k: 'likes' as const, n: num(st.likes) || num(es.total_likes) || num(c.likes) }, { k: 'messages' as const, n: num(st.messages) || num(es.total_messages) }, { k: 'chats' as const, n: num(st.chats) || num(es.total_chats) }].filter(s => s.n), raw: c });
  }
  return { items, more: data.hasMore === true, total: num(data.total) || null };
}
const wyvGreets = (c: O) => [...arr(c.alternate_greetings), ...arr(c.greetings).map(g => typeof g === 'string' ? g : str(obj(g).content ?? obj(g).text ?? obj(g).message))].map(g => str(g)).filter(g => g.trim());
export function parseWyvernDetail(raw: unknown): ShopDetail | null {
  const c = obj(raw); if (!str(c.name).trim()) return null;
  const description = str(c.description), firstMes = str(c.first_mes), scenario = str(c.scenario);
  return { description: plainText(description), firstMes: plainText(firstMes, 3000), scenario: plainText(scenario, 2000), notes: plainText(c.creator_notes, 2000), greetings: (firstMes.trim() ? 1 : 0) + wyvGreets(c).length,
    tokens: num(c.token_count) || roughTokens(description, firstMes, scenario, str(c.mes_example)), lore: arr(c.lorebooks).length > 0 || arr(obj(c.character_book).entries).length > 0, regex: arr(c.regex_scripts).length };
}
/** 사이트의 캐릭터 한 건을 캐릭터 카드 V2 꼴로 옮긴다. 모르는 꼴의 로어북 · 정규식은 카드 형식과 맞는 것만 싣는다 */
export function wyvernToCard(raw: unknown): Record<string, unknown> {
  const c = obj(raw), who = obj(c.creator), note = str(c.character_note).trim(), book = obj(c.character_book ?? arr(c.lorebooks).map(obj).find(b => Array.isArray(b.entries) && b.entries.length));
  const regex = arr(c.regex_scripts).map(obj).filter(r => typeof r.findRegex === 'string');
  return { spec: 'chara_card_v2', spec_version: '2.0', data: {
    name: str(c.chat_name, 200).trim() || str(c.name, 200).trim(), description: str(c.description), personality: str(c.personality), scenario: str(c.scenario), first_mes: str(c.first_mes), mes_example: str(c.mes_example),
    creator_notes: plainText(c.creator_notes, 8000) || plainText(c.tagline, 400), system_prompt: str(c.pre_history_instructions), post_history_instructions: str(c.post_history_instructions),
    alternate_greetings: wyvGreets(c), tags: tagsOf(c.tags), creator: str(who.displayName, 80) || str(who.vanityUrl, 80), character_version: '',
    ...(Array.isArray(book.entries) && book.entries.length ? { character_book: book } : {}),
    extensions: { ...(note ? { depth_prompt: { prompt: note, depth: 4, role: 'system' } } : {}), ...(regex.length ? { regex_scripts: regex } : {}), source: 'https://app.wyvern.chat/characters/' + wyvId(c.id ?? c._id) },
  } };
}

/** 출처 목록. http 는 JSON 을 받아 오는 함수 하나 */
export function makeSources(http: Http): Source[] {
  const chub: Source = {
    id: 'chub', name: 'Chub', site: 'chub.ai', adult: true, per: 24,
    async search(q, page, o) {
      return parseChubSearch(await http.json(`${CHUB}/search?` + qs({ search: q.trim(), first: 24, page: Math.max(1, page), namespace: 'characters', nsfw: o.nsfw, nsfl: o.nsfw, nsfw_only: false, min_tokens: 50, count: true, venus: false, chub: true,
        sort: o.sort === 'new' ? 'id' : 'download_count', ...(o.tags.length ? { topics: o.tags.join(',') } : {}), ...(o.nsfw ? {} : { excludetopics: 'NSFW' }) }), { headers: { Accept: 'application/json' } }));
    },
    async detail(it) { const p = chubPath(it.id); return p ? parseChubDetail(await http.json(`${CHUB}/api/characters/${p.split('/').map(encodeURIComponent).join('/')}?full=true`, { headers: { Accept: 'application/json' } })) : null; },
    async card(it) { const p = chubPath(it.id); if (!p) throw new Error('bad id'); return { kind: 'url', url: 'https://chub.ai/characters/' + p }; },
  };
  const wyvern: Source = {
    id: 'wyvern', name: 'Wyvern', site: 'wyvern.chat', adult: true, per: 24,
    async search(q, page, o) {
      const term = q.trim();
      return parseWyvernSearch(await http.json(`${WYV}/exploreSearch/characters?` + qs({ limit: 24, page: Math.max(1, page), ...(term ? { q: term } : { sort: o.sort === 'new' ? 'created_at' : 'popular', order: 'DESC' }), ...(o.tags.length ? { tags: o.tags.join(',') } : {}), ...(o.nsfw ? {} : { rating: 'none' }) }), { headers: { Accept: 'application/json' } }));
    },
    async detail(it) { return parseWyvernDetail(it.raw) || parseWyvernDetail(await http.json(`${WYV}/characters/${wyvId(it.id)}`, { headers: { Accept: 'application/json' } })); },
    async card(it) {
      const id = wyvId(it.id); if (!id) throw new Error('bad id');
      let raw = it.raw; if (!str(obj(raw).first_mes) && !str(obj(raw).description)) raw = await http.json(`${WYV}/characters/${id}`, { headers: { Accept: 'application/json' } });
      const card = wyvernToCard(raw); if (!str(obj(card.data).name)) throw new Error('empty card');
      return { kind: 'json', name: str(obj(card.data).name, 80), card, avatar: httpsOnly(obj(raw).avatar) };
    },
  };
  return [wyvern, chub];
}
/** 가림: 성인물을 켜지 않았으면 출처가 무엇을 돌려주든 한 번 더 거른다 */
export const screen = (items: ShopItem[], nsfw: boolean) => nsfw ? items : items.filter(x => !x.nsfw);
