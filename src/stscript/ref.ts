// ── STscript 명령 표: 실제로 등록된 명령(COMMANDS) + 드림랜드 · 확장 명령 + 소스에서 뽑은 이름 붙은 값 ──
// 등불지기의 스크립트 점검(st_check) · 명령 찾기(st_commands)가 읽는다. 손으로 적은 목록은 없다:
//   이름 · 별칭 · 쓰는 법 · 설명은 등록된 정의와 로케일(st.cmd.* · st.args.*)에서, 이름 붙은 값은 빌드 때 소스에서 뽑는다 (scripts/st-ref.mjs)
import stRef from 'virtual:st-ref';
import { has, t } from '../i18n';
import { X } from '../lib/hooks';
import { qrStore } from '../lib/qr-data';
import { COMMANDS, type CmdDef } from './run';
import { NATIVE } from './host';
import { lintScript, type CmdInfo, type LintEnv, type LintResult } from './lint';

const PATTERNS = Object.entries(stRef).filter(([k]) => k.startsWith('/')).map(([k, v]) => ({ re: new RegExp(k.slice(1, -1)), v }));
/** 이름 하나의 뽑힌 정보 (정확한 이름 → 틀 글자 순) */
const refOf = (n: string) => stRef[n] || PATTERNS.find(p => p.re.test(n))?.v;

let cache: { defs: Map<CmdDef, string[]>; size: number } | null = null;
/** 정의 → 그 정의를 가리키는 모든 이름 (등록 순) */
function defs() {
  if (cache && cache.size === COMMANDS.size) return cache.defs;
  const m = new Map<CmdDef, string[]>();
  for (const [k, d] of COMMANDS) { const l = m.get(d) || []; l.push(k); m.set(d, l); }
  cache = { defs: m, size: COMMANDS.size }; return m;
}
function infoOf(d: CmdDef, name: string): CmdInfo {
  const names = defs().get(d) || [name], main = names[0];
  const hk = names.find(n => has('st.cmd.' + n)), ak = names.find(n => has('st.args.' + n));
  // 이름 붙은 값: 이 정의의 이름 가운데 뽑힌 것을 모두 합친다 (별칭은 같은 정의)
  let named: string[] | null = null, open = false;
  for (const n of names) { const r = refOf(n); if (r) { named = [...new Set([...(named || []), ...r.named])]; open ||= !!r.open; } }
  return { name: main, names, usage: ak ? t('st.args.' + ak) : d.args || '', help: hk ? t('st.cmd.' + hk) : d.help || '', named: named ? named.sort() : null, ...(open ? { open: true } : {}), source: 'stscript' };
}

/** 이름(앞의 / 는 있어도 없어도)으로 명령 정보. 없으면 null */
export function commandInfo(raw: string): CmdInfo | null {
  const name = raw.trim().replace(/^\//, '').toLowerCase(); if (!name) return null;
  const d = COMMANDS.get(name); if (d) return infoOf(d, name);
  const ext = X.commands.get('/' + name);
  if (ext) return { name, names: [name], usage: String((ext as { args?: string }).args || ''), help: String(ext.help || ''), named: null, source: 'extension' };
  if (NATIVE.has(name)) return { name, names: [name], usage: '', help: '', named: null, source: 'app' };
  return null;
}
/** 명령 이름 전부 (STscript · 드림랜드 · 확장) */
export const allNames = () => [...new Set([...COMMANDS.keys(), ...[...X.commands.keys()].map(k => k.replace(/^\//, '')), ...NATIVE])].sort();

/** 찾기: 낱말이 이름 · 설명 · 쓰는 법에 걸리는 명령 (정의마다 한 줄). 빈 물음이면 전부 */
export function searchCommands(query: string): CmdInfo[] {
  const ws = query.toLowerCase().split(/\s+/).filter(Boolean), seen = new Set<string>(), out: CmdInfo[] = [];
  for (const n of allNames()) {
    const i = commandInfo(n); if (!i || seen.has(i.name)) continue; seen.add(i.name);
    const hay = [i.names.join(' '), i.help, i.usage, (i.named || []).join(' ')].join(' ').toLowerCase();
    if (ws.every(w => hay.includes(w))) out.push(i);
  }
  // 이름이 낱말로 시작하는 것을 앞으로
  return out.sort((a, b) => Number(ws.some(w => b.names.some(n => n.startsWith(w)))) - Number(ws.some(w => a.names.some(n => n.startsWith(w)))));
}

/** 앱의 명령 표로 스크립트를 점검한다 */
export function checkScript(src: string, extraQr: string[] = []): LintResult {
  const env: LintEnv = {
    cmd: commandInfo, names: allNames,
    qr: name => extraQr.includes(name) || qrStore().sets.some(s => s.items.some(i => i.label === name || `${s.name}.${i.label}` === name)),
  };
  return lintScript(src, env);
}
