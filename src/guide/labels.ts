// 변경 카드에 보이는 칸 이름 · 값을 사람이 읽는 말로 (모르는 것은 그대로 둔다)
import { has, t } from '../i18n';
import { S } from '../lib/core';

/** 장기기억 설정 화면의 칸 이름 (설정 화면과 같은 말을 쓴다) */
const MEM_SECS = ['basic', 'track', 'aid', 'model', 'inject', 'status', 'voice', 'speed'];
export function memLabel(k: string): string {
  for (const s of MEM_SECS) { const key = `memoria.config.${s}.${k}.label`; if (has(key)) return t(key); }
  const own = `guide.f.memory_${k}`;   // 설정 화면에 이름이 없는 칸
  return has(own) ? t(own) : '';
}
/** 칸 이름: 등불지기 칸 이름 → 로어북 편집 화면의 이름 → 장기기억 설정 이름 */
export function fieldLabel(n: string): string {
  if (n.startsWith('memory.')) { const l = memLabel(n.slice(7)); return l ? t('guide.f.memoryPre', { name: l }) : n; }
  const m = /^([\w.]+)(.*)$/.exec(n); if (!m) return n;
  const k = m[1].replace(/\./g, '_');
  if (has('guide.f.' + k)) return t('guide.f.' + k) + m[2];
  if (!m[1].includes('.') && has('lore.e.' + m[1])) return t('lore.e.' + m[1]) + m[2];
  return n;
}
/** 값: 로어북 항목의 넣는 자리 · 보조 키워드 조건 · 물음 방식 */
const LOGIC: Record<string, string> = { 0: 'anyOf', 3: 'allOf', 2: 'noneOf', 1: 'notAll' };
export function valueLabel(name: string, v: string): string {
  if (v === 'on' || v === 'off') return t(v === 'on' ? 'common.on' : 'common.off');
  if (name.startsWith('memory.')) { const k = name.slice(7); for (const s of MEM_SECS) { const key = `memoria.config.${s}.${k}.${v}`; if (has(key)) return t(key); } return v; }
  if (name === 'scope') { if (v === 'global' || v === 'preset') return t(v === 'global' ? 'regex.scope.global' : 'regex.scope.preset'); const c = S.chars.find(x => x.id === v); if (c) return `${t('regex.scope.char')} · ${c.name}`; return v; }   // 정규식 범위: 캐릭터 id 대신 이름
  if (name === 'position' && has('lore.posShort.' + v)) return t('lore.posShort.' + v);
  if (name === 'logic' && LOGIC[v]) return t('lore.e.logic.' + LOGIC[v]);
  if (name === 'askMode' && has('lore.e.askMode.' + v)) return t('lore.e.askMode.' + v);
  return v;
}
/** 여러 곳을 한꺼번에 바꾸는 카드의 한 줄 이름: "캐릭터: 서이건 › 설명" */
export function hitLabel(coll: string, name: string, path: string): string {
  const last = path.split('.').pop() || path;
  return `${has('guide.kind.' + coll) ? t('guide.kind.' + coll) : coll}: ${name} › ${fieldLabel(last)}`;
}
