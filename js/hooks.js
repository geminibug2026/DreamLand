// ── Dreamland hooks: 확장 기능이 끼어드는 지점들의 등록부 ──
// 각 항목은 { owner, ... } 형태. owner 는 확장 id.
export const X = {
  commands: new Map(),   // '/이름' → { owner, help, run(arg, ctx) }
  macros: new Map(),     // 이름 → { owner, fn(args, ctx) }
  panels: [],            // { owner, id, title, icon, render(chat, msgs) → Node }
  actions: [],           // { owner, id, label, icon, run(msg, chat) }
  pages: [],             // { owner, id, label, icon, render(root) }
  filters: [],           // { owner, fn(text, info) → text }   화면 표시 직전 텍스트 변환
  themes: [],            // { owner, theme }
  composer: [],
  prompt: [],            // { owner, fn(info) → [{ where: 'before'|'depth'|'end', role, content, depth, order, src }] }  프롬프트에 덧붙일 조각
  studio: [],            // { owner, title, render() → Node }  기능 화면의 탭
  before: [],            // { owner, fn({ chat, msgs, type, signal }) → Promise }  프롬프트를 조립하기 직전에 기다려 주는 준비 (임베딩 왕복 등)
  loreVec: null,         // (entryId) → 벡터 검색이 이번 턴에 깨운 로어북 항목인가
  translate: null,       // (text, language, { chat, context, signal }) → 번역문. 번역 기능이 등록한다
  covered: null,         // (chat) → 장기기억이 기록해 둔 턴 수          // { owner, id, label, icon, run(input) }   입력창 + 메뉴 항목
};
export function dropOwner(owner) {
  for (const [k, v] of X.commands) if (v.owner === owner) X.commands.delete(k);
  for (const [k, v] of X.macros) if (v.owner === owner) X.macros.delete(k);
  for (const key of ['panels', 'actions', 'pages', 'filters', 'themes', 'composer', 'prompt', 'before']) X[key] = X[key].filter(v => v.owner !== owner);
}
export function runFilters(text, info) {
  for (const f of X.filters) { try { const r = f.fn(text, info); if (typeof r === 'string') text = r; } catch (e) { console.warn('[확장 필터]', f.owner, e); } }
  return text;
}
