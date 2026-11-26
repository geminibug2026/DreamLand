// 장기기억 — 가벼운 모델이 조금 틀리게 쓴 답도 읽는다 (순수 함수: 화면 · 저장소 · 모델에 의존하지 않는다)
//
// - mendJson: 따옴표 없는 키 · 홑따옴표 · 둥근 따옴표 · 끝 쉼표 · 주석 · 문자열 속 줄바꿈 · 4/5 같은 값을 JSON 으로 고친다
// - salvageJson: 출력 한도에서 잘린 답에서 "끝까지 적힌 항목"까지만 살린다 (반쯤 적힌 마지막 항목은 버린다 — 비밀이 공개로, 반 토막 문장이 사실로 적히지 않게)
// - canonRecord: 번역된 칸 이름 · 가벼운 모델이 흔히 쓰는 다른 칸 이름 · 화살표로 적은 관계 · 목록 대신 쓴 글 · 5점 만점 중요도를 정해 둔 꼴로 맞춘다

export type LooseObj = Record<string, unknown>;

const isObj = (v: unknown): v is LooseObj => !!v && typeof v === 'object' && !Array.isArray(v);
const WORD_VALUES: Record<string, string> = { true: 'true', false: 'false', null: 'null', none: 'null', nil: 'null', undefined: 'null', nan: 'null' };

/** JSON 처럼 생겼지만 조금 틀린 글을 고친다. 고칠 것이 없으면 받은 글 그대로 */
export function mendJson(src: string): string {
  const s = String(src ?? ''), n = s.length, out: string[] = [];
  /** 닫는 따옴표로 볼 수 있는가 — 뒤에 구분 기호(쉼표 · 닫는 괄호 · 쌍점)나 글의 끝이 온다 */
  const closes = (i: number) => { let k = i + 1; while (k < n && /\s/.test(s[k])) k++; return k >= n || ',}]:'.includes(s[k]); };
  /** 문자열 하나를 읽어 JSON 문자열로 적는다. open = 여는 따옴표, 반환: 다음 자리 */
  const readString = (i: number, open: string): number => {
    const close = open === '“' ? '”' : open === '‘' ? '’' : open; let k = i + 1, body = '';
    for (; k < n; k++) {
      const c = s[k];
      if (c === '\\' && k + 1 < n) { const e = s[k + 1]; body += e === "'" ? "'" : c + e; k++; continue; }
      if (c === close || (open === '“' && c === '"')) { if (open !== '"' || closes(k)) break; body += '\\"'; continue; }   // 큰따옴표 문자열 속의 큰따옴표는 뒤에 구분 기호가 올 때만 닫는 것으로 본다
      body += c === '"' ? '\\"' : c === '\n' ? '\\n' : c === '\r' ? '' : c === '\t' ? '\\t' : c;
    }
    out.push('"' + body + (k < n ? '"' : ''));   // 닫히지 않은 채 끝났으면 닫지 않는다 (잘린 답은 살리기 단계가 맡는다)
    return k < n ? k + 1 : n;
  };
  let prev = '';   // 공백을 뺀 직전 기호
  for (let i = 0; i < n;) {
    const c = s[i];
    if (/\s/.test(c)) { out.push(c); i++; continue; }
    if (c === '"' || c === "'" || c === '“' || c === '‘') { i = readString(i, c); prev = '"'; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '：') { out.push(':'); prev = ':'; i++; continue; }
    if (c === '，') { out.push(','); prev = ','; i++; continue; }
    if (c === ',') { let k = i + 1; while (k < n && /\s/.test(s[k])) k++; if (k < n && (s[k] === '}' || s[k] === ']')) { i++; continue; } out.push(c); prev = c; i++; continue; }   // 끝 쉼표
    if ('{}[]:'.includes(c)) { out.push(c); prev = c; i++; continue; }
    // 따옴표 없이 적은 낱말: 키 자리면 키로, 값 자리면 숫자 · 참거짓 · 글로
    let k = i; while (k < n && !',}]:\n'.includes(s[k]) && !(s[k] === '/' && (s[k + 1] === '/' || s[k + 1] === '*'))) k++;
    let word = s.slice(i, k).trim(); const after = s[k];
    if ((prev === '{' || prev === ',') && after === ':') { out.push(JSON.stringify(word)); prev = '"'; i = k; continue; }
    if (after === ':' && prev === ':') { // 값 안의 쌍점 ("time: 3:00") — 줄 끝까지를 글로
      while (k < n && !',}]\n'.includes(s[k])) k++; word = s.slice(i, k).trim();
    }
    const frac = word.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (frac && +frac[2] > 0) out.push(String(Math.round((+frac[1] / +frac[2]) * 1000) / 1000));
    else if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(word)) out.push(word);
    else if (/^[+-]?\.\d+$/.test(word) || /^\+\d/.test(word)) out.push(String(Number(word)));
    else if (Object.hasOwn(WORD_VALUES, word.toLowerCase())) out.push(WORD_VALUES[word.toLowerCase()]);
    else if (word) out.push(JSON.stringify(word));
    prev = '"'; i = k;
  }
  return out.join('');
}

/**
 * 끝이 잘린 JSON 객체에서 끝까지 적힌 항목까지만 살려 닫는다. 살릴 수 있는 자리는 둘뿐이다 — 맨 바깥 객체의 칸 하나가 끝난 곳, 맨 바깥 객체에 든 목록의 항목 하나가 끝난 곳.
 * 그보다 안쪽에서 끊기면(항목 하나를 쓰다 만 것) 그 항목은 통째로 버린다. 잘리지 않은 글이면 null. 반환: 닫아 놓은 글 후보들 (뒤에서 끊은 것부터)
 */
export function salvageJson(src: string): string[] | null {
  const s = String(src ?? ''), stack: string[] = [], cuts: [number, string][] = [];
  let inStr = false, esc = false, wasValue = false;   // wasValue: 맨 바깥 객체에서 쌍점 뒤의 값을 읽는 중인가
  const safe = () => stack.length === 1 || (stack.length === 2 && stack[1] === ']');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false; else if (c === '\\') esc = true;
      else if (c === '"') { inStr = false; if (stack.length === 1 && wasValue) cuts.push([i + 1, '}']); }   // 맨 바깥 칸의 글 값이 닫혔다
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') { stack.pop(); if (!stack.length) return null; if (safe()) cuts.push([i + 1, [...stack].reverse().join('')]); }
    else if (c === ':' && stack.length === 1) wasValue = true;
    else if (c === ',' && safe()) { cuts.push([i, [...stack].reverse().join('')]); if (stack.length === 1) wasValue = false; }
  }
  if (!stack.length || !cuts.length) return null;
  return cuts.slice(-12).reverse().map(([at, close]) => s.slice(0, at).replace(/[\s,]+$/, '') + close);
}

/** 0~1 점수 읽기 — "4/5", "80%", 5점 · 10점 만점 숫자, 높음 · 중간 · 낮음 같은 말도 받는다. 읽지 못하면 d */
const SCORE_WORDS: [RegExp, number][] = [
  [/^(critical|crucial|essential|vital|very high|max|매우 ?높음|최상|필수|핵심|极高|最高)$/i, 0.95], [/^(high|major|important|높음|상|중요|高|重要)$/i, 0.8],
  [/^(medium|mid|moderate|normal|average|보통|중간|중|中|普通)$/i, 0.5], [/^(low|minor|trivial|낮음|하|사소|低)$/i, 0.3], [/^(very low|none|negligible|매우 ?낮음|最低)$/i, 0.15],
];
export function readScore(v: unknown, d = 0.5): number {
  if (v == null || v === '') return d;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  if (typeof v === 'number') return !Number.isFinite(v) ? d : v <= 1 ? clamp(v) : v <= 5 ? v / 5 : v <= 10 ? v / 10 : v <= 100 ? v / 100 : 1;
  const t = String(v).trim(), frac = t.match(/^(-?\d+(?:\.\d+)?)\s*(?:\/|out of|점? ?만점에?|\s+of\s+)\s*(\d+(?:\.\d+)?)/i);
  if (frac) return +frac[2] > 0 ? clamp(+frac[1] / +frac[2]) : d;
  const pct = t.match(/^(\d+(?:\.\d+)?)\s*%$/); if (pct) return clamp(+pct[1] / 100);
  const stars = (t.match(/[★⭐]/g) || []).length; if (stars) return clamp(stars / 5);
  const n = Number(t.replace(/[^\d.+-]/g, '')); if (/\d/.test(t) && Number.isFinite(n)) return readScore(n, d);
  for (const [rx, score] of SCORE_WORDS) if (rx.test(t)) return score;
  return d;
}

// ── 칸 이름 맞추기 ──
const keyOf = (k: string) => String(k).trim().toLowerCase().replace(/[\s\-·.]+/g, '_').replace(/^_+|_+$/g, '');
/** 정해 둔 이름 → 그 자리에 흔히 적히는 다른 이름들 */
const table = (spec: Record<string, string>) => { const m = new Map<string, string>(); for (const [canon, alts] of Object.entries(spec)) { m.set(canon, canon); for (const a of alts.split(' ')) if (a) m.set(a, canon); } return m; };
const TOP = table({
  digest: 'turn_summary summary synopsis recap gist 요약 턴_요약 턴요약 줄거리 요지 摘要 概要 要約',
  weight: 'importance turn_weight turn_importance 무게 중요도 权重 重要度 重要性',
  time_passed: 'time_elapsed elapsed elapsed_time timepassed 흐른_시간 경과 경과_시간 지난_시간 经过时间 経過時間',
  clock: 'story_clock 시계 이야기_시계 时钟',
  memories: 'memory events facts moments 기억 기억들 사건 记忆 記憶',
  canon: 'world_rules world worldbuilding lore rules 설정 캐논 세계관 设定 設定',
  status: 'entity_states states state statuses 상태 상태들 状态 状態',
  pledges: 'locks threads promises 서약 약속 떡밥 誓约 约定 約束',
  bonds: 'relationships relationship relations relation ties 관계 관계선 사이 关系 関係',
  cast: 'characters character people persons npcs 인물 등장인물 캐릭터 角色 人物 キャラクター',
  shifts: 'changes change shift transitions developments 변화 변화들 변화_기록 变化 変化',
  beats: 'scene_beats scenes 장면 비트 场景',
  settled: 'resolved closed 해소 해결', moved: 'progress advanced 진전', outdated: 'stale obsolete 지나간', learned: 'found_out discoveries 알게_됨',
  milestones: 'turning_points 전환점 연표', items: 'objects props 물건 아이템',
});
const ROW: Record<string, Map<string, string>> = {
  memories: table({ summary: 'text content description desc detail body 내용 요약 설명 内容 摘要', kind: 'type category 종류 유형 类型 種類', importance: 'priority score weight significance 중요도 重要度 重要性', quote: 'excerpt line dialogue 인용 대사 引用', entities: 'people characters who participants names involved 인물 등장인물 관련_인물 人物 角色', tags: 'tag keywords 태그', recall: 'cues hints triggers 단서 떠올릴_말', visibility: 'privacy access 공개_범위 공개범위 可见性', owner: 'holder 소유자 주인', known_by: 'knowers knows known_to 아는_사람' }),
  canon: table({ key: 'name fact_key 키 항목 이름', value: 'fact text content 값 내용', scope: '범위' }),
  status: table({ entity: 'name who character subject target 대상 인물 이름', slot: 'key field attribute aspect 칸 항목 속성', value: 'state text content current 값 내용 상태', claim: '주장', owner: 'holder believer 주인' }),
  pledges: table({ summary: 'text content description 내용 요약', kind: 'type category 종류 유형', status: 'state 상태', priority: '우선순위', due: 'deadline 기한', cause: 'reason 원인', needs: 'requires 필요' }),
  bonds: table({ from: 'source a subject who 주체 누가 from_name', to: 'target b toward object whom 대상 누구에게 to_name', stage: 'status state level standing current 단계 현재 지금', basis: 'evidence reason shown_by 근거', calls: 'address addresses 호칭 부르는_말', unsaid: 'withheld 말하지_못한_것', name: 'label title relation_name 이름 사이 사이_이름 관계명 关系名', kind: 'type category 종류 유형 类型' }),
  cast: table({ name: '이름 名字 名前', role: '역할', age: '나이', occupation: 'job 직업', appearance: 'looks 외모 외형', voice: 'speech speech_style 말투', core: 'personality_core 바탕', line: 'sample_line 대사', traits: '성격 특징', growth: 'development 성장 달라진_점', relationships: 'relations 관계', aka: 'aliases alias nicknames 별칭 다른_이름' }),
  shifts: table({ kind: 'type category 종류 유형 类型', who: 'name character subject person 인물 누가 주체', toward: 'target to_whom about with 대상 누구에게 상대', from: 'before was old previous prev 이전 전 원래', to: 'after now new current 이후 후 지금 현재', why: 'reason cause because trigger 이유 원인 왜 계기' }),
  beats: table({ text: 'summary content 내용', quote: 'line 대사', with: 'present people 함께' }),
};
/** 목록이어야 하는 칸 — 글 하나로 적혀 오면 쉼표에서 나눈다 */
const LIST_FIELDS = new Set(['entities', 'tags', 'recall', 'known_by', 'guess_by', 'with', 'traits', 'aka', 'participants']);
/** 방향 화살표 — 깡→린, 깡->린, 깡 ⇒ 린, 깡 ▶ 린 을 같은 것으로 읽는다 */
const ARROW = /\s*(?:[→⇒➔➜➝➞⟶➡▶►]|[-=–—~]{1,2}>|>>)\s*/;
export function splitArrow(text: unknown): [string, string] | null {
  const parts = String(text ?? '').split(ARROW).map(x => x.trim().replace(/^["'「『(\[]+|["'」』)\]]+$/g, '')).filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}
const rename = (row: LooseObj, map: Map<string, string>): LooseObj => {
  const out: LooseObj = {};
  for (const [k, v] of Object.entries(row)) { const c = map.get(keyOf(k)) || k; if (!(c in out) || c === k) out[c] = v; }   // 정해 둔 이름으로 적힌 칸이 다른 이름의 칸보다 먼저다
  for (const f of LIST_FIELDS) if (typeof out[f] === 'string') out[f] = String(out[f]).split(/\s*[,，、;/]\s*/).map(x => x.trim()).filter(x => x && !/^(none|null|n\/a|없음|无)$/i.test(x));
  return out;
};
/** 목록 칸 하나를 목록으로 — 객체 하나만 적혔으면 감싸고, {"add":[…],"update":[…]} 처럼 나눠 적었으면 이어 붙인다 */
const rowsOf = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (!isObj(v)) return [];
  const vals = Object.values(v);
  if (vals.length && vals.every(x => Array.isArray(x))) return (vals as unknown[][]).flat();
  return [v];
};

/** 사서의 답이 정해 둔 꼴에서 벗어났는가 — 칸 이름을 바꿔 적었거나(번역 · 다른 이름), 중요도를 0~1 이 아닌 값으로 적었거나, 목록을 글 하나로 적었다. 형식 도움말을 붙일지 정하는 데 쓴다 */
export function offFormat(raw: unknown): boolean {
  if (!isObj(raw)) return false;
  const canon = canonRecord(raw); if (!canon) return false;
  const keys = (o: unknown) => (isObj(o) ? Object.keys(o).sort().join('\u0001') : ''), score = (v: unknown) => v == null || (typeof v === 'number' && v >= 0 && v <= 1);
  if (keys(raw) !== keys(canon) || !score(raw.weight)) return true;
  for (const shelf of ['memories', 'status', 'bonds', 'shifts']) {
    const a = raw[shelf], b = canon[shelf]; if (a == null) continue; if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) if (keys(a[i]) !== keys(b[i]) || (shelf === 'memories' && isObj(a[i]) && (!score(a[i].importance) || typeof a[i].entities === 'string'))) return true;
  }
  return false;
}

/** 사서의 답을 정해 둔 꼴로 맞춘다 (내용은 손대지 않는다 — 칸 이름과 값의 꼴만). 읽을 수 없으면 받은 것 그대로 */
export function canonRecord(raw: unknown): LooseObj | null {
  if (!isObj(raw)) return null;
  let top = rename(raw, TOP);
  // {"result":{…}} · {"archive":{…}} 처럼 한 겹 싸여 온 답
  if (!['digest', 'memories', 'status', 'bonds', 'cast', 'clock', 'canon', 'pledges'].some(k => k in top)) {
    const inner = Object.values(top).filter(isObj).map(v => rename(v, TOP)).find(v => 'digest' in v || 'memories' in v);
    if (inner) top = inner;
  }
  const out: LooseObj = { ...top };
  if (typeof out.digest !== 'string' && isObj(out.digest)) out.digest = String((out.digest as LooseObj).text ?? (out.digest as LooseObj).summary ?? '');
  if ('weight' in out) out.weight = readScore(out.weight, 0.4);
  if (!isObj(out.clock)) { const day = out.day ?? (typeof out.clock === 'number' || typeof out.clock === 'string' ? out.clock : undefined), now = out.now; if (day != null || now != null) out.clock = { day, now }; }
  for (const shelf of Object.keys(ROW)) {
    if (!(shelf in out)) continue;
    let rows = rowsOf(out[shelf]);
    // 관계를 {"깡→린":"…"} 꼴의 사전으로 적은 답
    if (shelf === 'bonds' && isObj(out[shelf]) && rows.length === 1 && rows[0] === out[shelf] && Object.keys(out[shelf] as LooseObj).some(k => splitArrow(k))) {
      rows = Object.entries(out[shelf] as LooseObj).map(([k, v]) => { const p = splitArrow(k); return p ? { from: p[0], to: p[1], ...(isObj(v) ? v : { stage: v }) } : null; }).filter(Boolean);
    }
    out[shelf] = rows.filter(isObj).map(r => {
      const row = rename(r, ROW[shelf]);
      if (shelf === 'memories' && 'importance' in row) row.importance = readScore(row.importance, 0.5);
      if (shelf === 'bonds' && !row.to) { const p = splitArrow(row.from) || splitArrow(row.pair) || splitArrow(row.between); if (p) { row.from = p[0]; row.to = p[1]; } }
      if (shelf === 'shifts') {
        const p = !row.toward ? splitArrow(row.who) : null; if (p) { row.who = p[0]; row.toward = p[1]; }
        const c = !row.from || !row.to ? splitArrow(row.change ?? row.to ?? row.summary) : null; if (c) { row.from = c[0]; row.to = c[1]; }
      }
      return row;
    });
  }
  // 장면에 있는 사람을 맨 바깥 목록으로 적은 답 → 장면 상태 한 줄
  const present = out.present ?? out.present_characters ?? out.characters_present ?? out['등장'];
  if (present != null && !(Array.isArray(out.status) && (out.status as LooseObj[]).some(s => String(s.entity).toLowerCase() === 'scene' && String(s.slot).toLowerCase() === 'present'))) {
    const names = (Array.isArray(present) ? present : String(present).split(/\s*[,，、]\s*/)).map(x => String(isObj(x) ? x.name ?? '' : x).trim()).filter(Boolean);
    if (names.length) out.status = [...(Array.isArray(out.status) ? out.status as unknown[] : []), { entity: 'scene', slot: 'present', value: names.join(', ') }];
  }
  return out;
}
