// 장기기억 — 사이 이름 · 변화 기록 · 관계도 (순수 함수: 화면 · 저장소 · 모델에 의존하지 않는다)
//
// - 사이 이름: 한 사람이 다른 한 사람에게 품은 마음의 핵심을 관계 전체에서 읽어 붙인 짧은 이름 ("죄책감 섞인 집착") 과 종류
// - 변화 기록: 한 번의 기록에서 무엇이 무엇으로 왜 바뀌었는지 (관계 · 감정 · 상황 · 성장)
// - 지금의 마음: 장면에 있는 사람들끼리의 가장 최근 마음 몇 줄 (장부의 매 턴 바뀌는 구간에 싣는다)
// - 관계도 배치: 이름 상자와 선의 자리 (그리는 일은 화면이 한다)
import { splitArrow } from './lenient';

/** 사이의 종류 — 선의 색을 정한다 */
export const TIE_KINDS = ['love', 'one_sided', 'family', 'friendship', 'colleague', 'rival', 'hostile', 'work', 'complicated'] as const;
export type TieKind = typeof TIE_KINDS[number];
const KIND_WORDS: [TieKind, RegExp][] = [
  ['complicated', /complicat|complex|mixed|ambivalen|conflicted|love.?hate|복잡|애증|양가|复杂|複雑/i],
  ['one_sided', /one.?sided|unrequited|crush|pining|짝사랑|외사랑|일방|单恋|暗恋|片思/i],
  ['love', /love|romance|romantic|lover|dating|couple|spouse|married|연인|사랑|연애|부부|恋|爱|愛/i],
  ['family', /family|sibling|brother|sister|parent|father|mother|kinship|relative|가족|남매|형제|자매|부모|혈연|家人|家族|亲/i],
  ['friendship', /friend|buddy|companion|우정|친구|벗|朋友|友/i],
  ['rival', /rival|competitor|라이벌|경쟁|앙숙|对手|ライバル/i],
  ['hostile', /hostil|enemy|enmity|hatred|antagon|adversar|적대|원수|숙적|혐오|증오|敌|敵/i],
  ['work', /work|business|employ|boss|master|servant|client|contract|professional|업무|직장|고용|주종|계약|거래|상사|부하|工作|雇|仕事/i],
  ['colleague', /colleague|coworker|co.?worker|teammate|ally|allies|comrade|partner|동료|팀|전우|동맹|同事|同僚|伙伴/i],
];
/** 모델이 적은 종류를 정해 둔 아홉 가지로 (모르는 말이면 '') */
export function tieKind(raw: unknown): TieKind | '' {
  const t = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_'); if (!t) return '';
  if ((TIE_KINDS as readonly string[]).includes(t)) return t as TieKind;
  for (const [k, rx] of KIND_WORDS) if (rx.test(t)) return k;
  return '';
}

/** 말끝을 흐리는 말 — 사이 이름은 근거대로 단정해 적는다 */
const HEDGE = /[?？]|아마|불확실|불명|모름|미정|일지도|인 ?듯|같음|같다|maybe|perhaps|unclear|uncertain|unknown|possibl|probabl|seem|\btbd\b|\bn\/a\b|不确定|可能|也许|或许|不明|たぶん|かも/i;
const squash = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const BLANK = /^(null|none|n\/a|없음|无|なし|-|—)?$/i;
/** 사이 이름 다듬기: 따옴표 · 끝 문장부호를 떼고, 말끝을 흐린 괄호는 걷어 낸다. 그래도 흐린 말이 남으면 받지 않는다 ('') */
export function cleanTieName(raw: unknown, max = 60): string {
  let t = squash(raw, max * 2).replace(/^["'“”‘’「『《〈]+|["'“”‘’」』》〉]+$/g, '').replace(/[.。,，;；:：]+$/, '').trim();
  if (BLANK.test(t)) return '';
  if (HEDGE.test(t)) t = t.replace(/\s*[(（\[][^()（）\[\]]*[)）\]]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || HEDGE.test(t)) return '';
  return t.length > max ? t.slice(0, max).trim() : t;
}

/** 변화의 종류 */
export const SHIFT_KINDS = ['relationship', 'emotion', 'situation', 'growth'] as const;
export type ShiftKind = typeof SHIFT_KINDS[number];
export function shiftKind(raw: unknown): ShiftKind {
  const t = String(raw ?? '').trim().toLowerCase();
  if ((SHIFT_KINDS as readonly string[]).includes(t)) return t as ShiftKind;
  if (/relat|bond|tie|관계|사이|关系|関係/.test(t)) return 'relationship';
  if (/grow|develop|matur|character|arc|성장|성숙|成长|成長/.test(t)) return 'growth';
  if (/situat|circum|status|state|event|상황|처지|신변|状况|状況|处境/.test(t)) return 'situation';
  return 'emotion';
}
/** 사서 · 훑기가 적은 변화 한 줄 (정제한 것) */
export interface ShiftInput { kind: ShiftKind; who: string; toward: string; from: string; to: string; why: string }
/** 변화 한 줄을 정제한다 — 누가 · 무엇으로 바뀌었는지가 없으면 받지 않는다 (null) */
export function cleanShift(raw: unknown): ShiftInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>, na = (v: unknown, n: number) => { const t = squash(v, n); return BLANK.test(t) ? '' : t; };
  let who = na(r.who, 60), toward = na(r.toward, 60), from = na(r.from, 90), to = na(r.to, 90);
  if (!toward) { const p = splitArrow(who); if (p) { who = p[0]; toward = p[1]; } }
  if (!from) { const p = splitArrow(to); if (p) { from = p[0]; to = p[1]; } }
  if (!who || !to || norm(from) === norm(to)) return null;
  return { kind: shiftKind(r.kind), who, toward, from, to, why: na(r.why, 180) };
}
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const grams = (s: string) => { const g = new Set<string>(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
/** 두 글이 사실상 같은 말인가 (띄어쓰기 · 문장부호 · 조사 조금 차이는 같은 것으로) */
export function sameText(a: unknown, b: unknown): boolean {
  const x = norm(a), y = norm(b); if (!x || !y) return x === y; if (x === y || (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)))) return true;
  const ga = grams(x), gb = grams(y); if (ga.size < 3 || gb.size < 3) return false;
  let hit = 0; for (const g of ga) if (gb.has(g)) hit++;
  return hit / Math.min(ga.size, gb.size) >= 0.75;
}
/** 같은 변화를 두 번 적은 것인가 — 같은 사람 · 같은 상대 · 같은 종류이고 "무엇으로"가 같은 말이다. key: 이름을 견줄 열쇠 */
export function sameShift(a: Pick<ShiftInput, 'kind' | 'who' | 'toward' | 'to'>, b: Pick<ShiftInput, 'kind' | 'who' | 'toward' | 'to'>, key: (n: string) => string = norm): boolean {
  return a.kind === b.kind && key(a.who) === key(b.who) && key(a.toward || '') === key(b.toward || '') && sameText(a.to, b.to);
}

/** 지금의 마음 한 줄의 재료 */
export interface FeelingRow { from: string; to: string; now: string; was: string; why: string; turn: number }
interface FeelShift { kind: string; who: string; toward?: string; from?: string; to: string; why?: string; turn?: number }
interface FeelBond { from: string; to: string; name?: string; turn?: number }
/**
 * 장면에 함께 있는 사람들끼리의 가장 최근 마음. 변화 기록(감정 · 관계) 가운데 그 둘 사이의 가장 늦은 것을 쓰고, 변화 기록이 없으면 사이 이름을 쓴다.
 * inScene: 그 이름이 지금 장면에 있는가. 늦게 적힌 것부터 max 줄
 */
export function latestFeelings(shifts: FeelShift[], bonds: FeelBond[], inScene: (name: string) => boolean, key: (n: string) => string = norm, max = 3): FeelingRow[] {
  const rows = new Map<string, FeelingRow>();
  for (const s of shifts || []) {
    if ((s.kind !== 'emotion' && s.kind !== 'relationship') || !s.toward || !s.to || !inScene(s.who) || !inScene(s.toward)) continue;
    const k = `${key(s.who)}\u0001${key(s.toward)}`, old = rows.get(k), turn = s.turn ?? -1;
    if (!old || turn >= old.turn) rows.set(k, { from: s.who, to: s.toward, now: s.to, was: s.from || '', why: s.why || '', turn });
  }
  for (const b of bonds || []) {
    if (!b.name || !inScene(b.from) || !inScene(b.to)) continue;
    const k = `${key(b.from)}\u0001${key(b.to)}`; if (!rows.has(k)) rows.set(k, { from: b.from, to: b.to, now: b.name, was: '', why: '', turn: b.turn ?? -1 });
  }
  return [...rows.values()].sort((a, b) => b.turn - a.turn || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)).slice(0, Math.max(0, max));
}

// ── 관계도 ──
export interface TieEdge { id: string; from: string; to: string; label: string; kind: string }
/** 글의 화면 너비 어림 (한글 · 한자 · 가나는 한 글자가 라틴 글자 둘쯤) */
export const textUnits = (s: string) => { let u = 0; for (const ch of s) u += /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/.test(ch) ? 2 : 1; return u; };
/** 너비에 맞춰 줄인다 (…) — 선 위의 사이 이름 · 상자 안의 이름 */
export function fitText(s: string, units: number): string {
  if (textUnits(s) <= units) return s;
  let u = 0, out = ''; for (const ch of s) { const w = textUnits(ch); if (u + w > units - 1) break; u += w; out += ch; }
  return out.trimEnd() + '…';
}
/** 인물을 관계가 많은 순으로 (같으면 먼저 나온 순) */
export function rankPeople(edges: Pick<TieEdge, 'from' | 'to'>[]): string[] {
  const deg = new Map<string, number>();
  for (const e of edges) for (const n of [e.from, e.to]) deg.set(n, (deg.get(n) || 0) + 1);
  return [...deg.entries()].map(([n, d], i) => ({ n, d, i })).sort((a, b) => b.d - a.d || a.i - b.i).map(x => x.n);
}
export interface TieNode { name: string; text: string; x: number; y: number; w: number; h: number; focus?: boolean }
export interface TieLine { id: string; from: string; to: string; kind: string; label: string; full: string; d: string; /** 화살촉 */ ah: string; lx: number; ly: number; lw: number }
export interface TieLayout { nodes: TieNode[]; lines: TieLine[]; box: [number, number, number, number]; hidden: number }
/**
 * 관계도 배치. 인물이 limit 보다 많으면 관계가 많은 사람만 그린다. focus 를 주면 그 사람을 가운데 두고 그 사람의 관계만 그린다.
 * 둘뿐이면 옆으로 나란히, 셋부터는 세로로 긴 타원 위에 (이름 상자는 옆으로 길어 세로로 벌리는 쪽이 덜 겹친다). 한 사람이 거의 모두와 이어져 있으면 그 사람을 가운데 둔다 (선이 서로 덜 가로지른다).
 * 마주 보는 두 방향의 선은 서로 반대쪽으로 휜다.
 * 틀(box)은 이름 상자와 선 위의 사이 이름까지 다 들어가게 잡는다. hidden: 그리지 않은 인물 수
 */
export function layoutTies(all: TieEdge[], { focus = '', limit = 9, width = 340 }: { focus?: string; limit?: number; width?: number } = {}): TieLayout {
  let edges = all.filter(e => e.from && e.to && e.from !== e.to);
  const everyone = rankPeople(edges);
  let names: string[], pool = everyone.length, hub = false;
  if (focus && everyone.includes(focus)) {
    edges = edges.filter(e => e.from === focus || e.to === focus);
    const around = rankPeople(edges).filter(n => n !== focus), near = around.slice(0, Math.max(1, limit - 1));
    names = [focus, ...near]; pool = around.length + 1; edges = edges.filter(e => names.includes(e.from) && names.includes(e.to));
  } else {
    names = everyone.slice(0, Math.max(2, limit)); edges = edges.filter(e => names.includes(e.from) && names.includes(e.to)); focus = '';
    const top = names[0], linked = new Set(edges.filter(e => e.from === top || e.to === top).map(e => (e.from === top ? e.to : e.from)));
    hub = names.length >= 5 && linked.size >= (names.length - 1) * 0.6;
  }
  const hidden = pool - names.length, H = 34, NAME_UNITS = 12;
  const nodes: TieNode[] = names.map(name => { const text = fitText(name, NAME_UNITS); return { name, text, x: 0, y: 0, w: Math.max(44, textUnits(text) * 6.6 + 18), h: H }; });
  const ring = focus || hub ? nodes.slice(1) : nodes, n = ring.length;
  if (!focus && n === 2) { const gap = Math.min(width - 40 - (nodes[0].w + nodes[1].w) / 2, 190); nodes[0].x = -gap / 2; nodes[1].x = gap / 2; }
  else if (focus && n === 1) { nodes[0].focus = true; nodes[0].x = -85; nodes[1].x = 85; }
  else {
    if (focus) nodes[0].focus = true;
    const maxW = Math.max(...ring.map(r => r.w)), rx = Math.max(70, (width - maxW) / 2 - 6), ry = Math.max(rx, 34 + n * 21);
    ring.forEach((r, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; r.x = rx * Math.cos(a); r.y = ry * Math.sin(a); });
  }
  const at = new Map(nodes.map(nd => [nd.name, nd])), pairs = new Set(edges.map(e => `${e.from}\u0001${e.to}`));
  /** 상자 가장자리에서 선이 나가는 점 (가운데에서 (ux,uy) 쪽으로) */
  const edgeOf = (nd: TieNode, ux: number, uy: number, pad: number) => { const tx = Math.abs(ux) < 1e-6 ? Infinity : (nd.w / 2 + pad) / Math.abs(ux), ty = Math.abs(uy) < 1e-6 ? Infinity : (nd.h / 2 + pad) / Math.abs(uy), t = Math.min(tx, ty); return [nd.x + ux * t, nd.y + uy * t]; };
  const LABEL_UNITS = 14, lines: TieLine[] = edges.map(e => {
    const p = at.get(e.from)!, q = at.get(e.to)!, dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const both = pairs.has(`${e.to}\u0001${e.from}`), bend = both ? Math.max(20, Math.min(44, len * 0.22)) : Math.min(14, len * 0.08);   // 가는 쪽에서 볼 때 오른쪽으로 휜다 — 마주 보는 선과 겹치지 않는다
    const cx = (p.x + q.x) / 2 - uy * bend * 2, cy = (p.y + q.y) / 2 + ux * bend * 2;
    const d1 = Math.hypot(cx - p.x, cy - p.y) || 1, d2 = Math.hypot(cx - q.x, cy - q.y) || 1;
    const [sx, sy] = edgeOf(p, (cx - p.x) / d1, (cy - p.y) / d1, 2), [ex, ey] = edgeOf(q, (cx - q.x) / d2, (cy - q.y) / d2, 7);
    const label = fitText(e.label, LABEL_UNITS), lx = 0.25 * sx + 0.5 * cx + 0.25 * ex, ly = 0.25 * sy + 0.5 * cy + 0.25 * ey;
    const r = (v: number) => Math.round(v * 10) / 10, el = Math.hypot(ex - cx, ey - cy) || 1, vx = (ex - cx) / el, vy = (ey - cy) / el;
    return { id: e.id, from: e.from, to: e.to, kind: e.kind, label, full: e.label, d: `M${r(sx)} ${r(sy)} Q${r(cx)} ${r(cy)} ${r(ex)} ${r(ey)}`,
      ah: `M${r(ex + vx * 5)} ${r(ey + vy * 5)} L${r(ex - vy * 3.4)} ${r(ey + vx * 3.4)} L${r(ex + vy * 3.4)} ${r(ey - vx * 3.4)} Z`, lx: r(lx), ly: r(ly), lw: textUnits(label) * 5.6 + 10 };
  });
  // 겹친 사이 이름은 위아래로 조금 벌린다
  const placed: TieLine[] = [];
  for (const l of [...lines].sort((a, b) => a.ly - b.ly)) {
    for (let tries = 0; tries < 8; tries++) { const hit = placed.find(o => Math.abs(o.ly - l.ly) < 15 && Math.abs(o.lx - l.lx) < (o.lw + l.lw) / 2); if (!hit) break; l.ly = hit.ly + 15; }
    placed.push(l);
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (ax: number, ay: number, bx: number, by: number) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); };
  for (const nd of nodes) grow(nd.x - nd.w / 2, nd.y - nd.h / 2, nd.x + nd.w / 2, nd.y + nd.h / 2);
  for (const l of lines) grow(l.lx - l.lw / 2, l.ly - 9, l.lx + l.lw / 2, l.ly + 9);
  if (!nodes.length) return { nodes, lines, box: [0, 0, width, 80], hidden };
  // 사람 수가 적어도 지나치게 크게 키우지 않는다: 틀을 화면 너비보다 좁게 잡지 않는다
  const pad = 10, w = Math.max(x1 - x0 + pad * 2, width), h = y1 - y0 + pad * 2, mx = (x0 + x1) / 2;
  return { nodes, lines, box: [Math.round(mx - w / 2), Math.round(y0 - pad), Math.round(w), Math.round(h)], hidden };
}
