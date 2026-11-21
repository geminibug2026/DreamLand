// 등불지기 옆 창: 어느 화면에서든 여는 대화 창 — 기록 · 흘러나오는 답 · 접힌 도구 줄 · 변경 카드 · 상태
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon, useEvents } from '../kit';
import { S } from '../lib/core';
import { go, route } from '../lib/router';
import { confirmBox, menu, toast } from '../ui';
import { fmtDate, has, t, useLang } from '../i18n';
import { cur } from '../chat/store';
import { G, apply, applyAll, closeGuide, discard, newTalk, openTalk, poke, removeTalk, resume, send, stop, undo } from './agent';
import { targetOf, touchedSince } from './changes';
import { diffWords, fold, tally } from './diff';
import { Mark, startTour } from './Tour';
import type { Change, FieldChange, Item, Plan, Ref } from './types';

// ── 작은 마크다운 ── 조수의 답을 HTML 을 거치지 않고 React 요소로 그린다 (문단 · 목록 · 굵게 · `코드` · 코드 덩이 · 제목)
function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [], re = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*/g; let last = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(s))) { if (m.index > last) out.push(s.slice(last, m.index)); out.push(m[1] ? <b key={key + n++}>{m[1]}</b> : m[2] ? <code key={key + n++}>{m[2]}</code> : <em key={key + n++}>{m[3]}</em>); last = re.lastIndex; }
  if (last < s.length) out.push(s.slice(last)); return out;
}
export function Md({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const out: ReactNode[] = [], lines = text.replace(/\r/g, '').split('\n'); let i = 0, k = 0;
    while (i < lines.length) {
      const ln = lines[i];
      if (/^```/.test(ln)) { const buf: string[] = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(<pre key={k++}>{buf.join('\n')}</pre>); continue; }
      if (!ln.trim()) { i++; continue; }
      const hd = /^(#{1,4})\s+(.*)$/.exec(ln); if (hd) { out.push(<h4 key={k++}>{inline(hd[2], 'h')}</h4>); i++; continue; }
      if (/^\s*([-*•]|\d+[.)])\s+/.test(ln)) { const ord = /^\s*\d+[.)]/.test(ln), items: ReactNode[] = []; while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) { items.push(<li key={i}>{inline(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''), 'l' + i)}</li>); i++; } out.push(ord ? <ol key={k++}>{items}</ol> : <ul key={k++}>{items}</ul>); continue; }
      const buf: string[] = []; while (i < lines.length && lines[i].trim() && !/^```|^#{1,4}\s|^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) buf.push(lines[i++]);
      out.push(<p key={k++}>{buf.map((b, j) => <Fragment key={j}>{j ? <br /> : null}{inline(b, 'p' + j)}</Fragment>)}</p>);
    }
    return out;
  }, [text]);
  return <div className="gd-md fx-body">{blocks}</div>;
}

// ── 변경 카드 ──
const KIND_KEY: Record<string, string> = { chars: 'guide.kind.chars', personas: 'guide.kind.personas', lore: 'guide.kind.lore', presets: 'guide.kind.presets', regex: 'guide.kind.regex', theme: 'guide.kind.theme', qr: 'guide.kind.qr' };
const PAGE_OF: Record<string, string> = { chars: 'home', personas: 'personas', lore: 'lore', presets: 'presets', regex: 'regex', theme: 'themes', qr: 'qr' };
/** 칸 이름을 사람 말로 (모르는 칸은 그대로) */
const fieldName = (n: string) => { const m = /^([\w.]+)(.*)$/.exec(n), k = m ? m[1].replace(/\./g, '_') : ''; return k && has('guide.f.' + k) ? t('guide.f.' + k) + (m![2] || '') : n; };
const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

/** 아직 적용하지 않은 캐릭터 · 페르소나 카드의 한 칸을 다시 써 달라고 입력창을 채운다 */
const redoField = (ch: Change, f: FieldChange) => { G.redo = { card: ch.id, field: f.name }; G.draft = t('guide.card.redoDraft', { field: fieldName(f.name) }); G.refs = []; G.focus++; poke(); };
function FieldView({ f, ch }: { f: FieldChange; ch?: Change }) {
  const [open, setOpen] = useState(false);
  const short = f.before.length + f.after.length < 90 && !/\n/.test(f.before + f.after);
  const segs = useMemo(() => f.before && !short ? diffWords(f.before, f.after) : null, [f, short]);
  const n = segs ? tally(segs) : { add: f.after.length, del: f.before.length }, long = (segs ? f.before.length + f.after.length : f.after.length) > 420;
  let body: ReactNode;
  if (isHex(f.after)) body = <span className="gd-sw"><i style={{ background: f.after }} /><code>{f.after}</code></span>;
  else if (short) body = <span className="gd-short">{f.before ? <><del>{f.before}</del><svg className="fx-art gd-arrow" viewBox="0 0 16 8" width="16" height="8" aria-hidden="true"><path d="M1 4h13M11 1l3 3-3 3" /></svg></> : null}<ins>{f.after || '∅'}</ins></span>;
  else if (segs) body = <div className={'gd-diff' + (open ? ' open' : long ? ' long' : '')}>{(open ? segs : fold(segs)).map((s, i) => s.t === '=' ? <span key={i}>{s.s}</span> : s.t === '+' ? <ins key={i}>{s.s}</ins> : <del key={i}>{s.s}</del>)}</div>;
  else body = <div className={'gd-diff new' + (open ? ' open' : long ? ' long' : '')}>{open || !long ? f.after : f.after.slice(0, 380) + ' ⋯'}</div>;
  return <div className="gd-f">
    <div className="gd-fh"><span className="fx-lbl kr ink">{fieldName(f.name)}</span>
      {isHex(f.after) ? null : <span className="fx-num gd-cnt" title={t('guide.card.count')}>{n.add ? <b>+{n.add}</b> : null}{n.del ? <s>−{n.del}</s> : null}</span>}
      {long ? <button type="button" className="gd-more" onClick={() => setOpen(!open)}>{open ? t('guide.card.less') : t('guide.card.all')}</button> : null}
      {ch && ch.state === 'pending' && (ch.kind === 'chars' || ch.kind === 'personas') && !G.busy ? <button type="button" className="gd-more gd-redo" title={t('guide.card.redoHint')} onClick={() => redoField(ch, f)}>{t('guide.card.redo')}</button> : null}</div>
    {body}
  </div>;
}
const STATE_KEY: Record<string, string> = { pending: 'guide.card.pending', applied: 'guide.card.applied', dropped: 'guide.card.dropped', undone: 'guide.card.undone', failed: 'guide.card.failed' };
function ChangeCard({ ch }: { ch: Change }) {
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown>) => async () => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { toast(t('guide.card.failToast', { err: e instanceof Error && e.message === 'gone' ? t('guide.card.gone') : e instanceof Error && e.message === 'locked' ? t('guide.card.locked') : String(e instanceof Error ? e.message : e) }), 'err'); } finally { setBusy(false); } };
  const doUndo = run(async () => { if (ch.undoId && await touchedSince(ch.undoId) && !(await confirmBox(t('guide.card.undoTouched'), t('guide.card.undo')))) return; await undo(ch); toast(t('guide.card.undoneToast'), 'ok'); });
  const open = () => { const p = PAGE_OF[ch.kind], id = targetOf(ch); if (ch.kind === 'chars') go('home'); else if (ch.kind === 'qr') go('qr', id ? { set: id } : undefined); else go(p, id || undefined); };
  const colors = ch.kind === 'theme' ? ch.fields.filter(f => isHex(f.after)) : [];
  return <article className={'gd-card fx-frame is-' + ch.state} aria-label={t('guide.card.aria', { target: ch.target })}>
    <header className="gd-ch">
      <span className="fx-lbl acc">{ch.verb === 'create' ? t('guide.card.create') : t('guide.card.update')} · {t(KIND_KEY[ch.kind] || 'guide.kind.chars')}</span>
      <b className="fx-serif">{ch.target}</b>
      <span className={'fx-pill gd-st st-' + ch.state}><i className="fx-dot" />{t(STATE_KEY[ch.state] || 'guide.card.pending')}</span>
    </header>
    {colors.length ? <div className="gd-pal" aria-hidden="true">{colors.map(f => <i key={f.name} style={{ background: f.after }} title={fieldName(f.name)} />)}</div> : null}
    {colors.length ? <div className="gd-cols">{colors.map(f => <span key={f.name}><i style={{ background: f.after }} /><b>{fieldName(f.name)}</b><code>{f.after}</code></span>)}</div> : null}
    <div className="gd-fs fx-rows">{ch.fields.filter(f => !colors.includes(f)).map((f, i) => <FieldView key={i + ':' + ch.at} f={f} ch={ch} />)}</div>
    {ch.err && ch.state === 'failed' ? <p className="gd-err">{ch.err === 'gone' ? t('guide.card.gone') : ch.err === 'locked' ? t('guide.card.locked') : ch.err}</p> : null}
    <footer className="gd-cf">
      {ch.state === 'pending' || ch.state === 'failed' ? <><button type="button" className="btn ghost" disabled={busy} onClick={run(() => discard(ch))}>{t('guide.card.discard')}</button>
        <button type="button" className="btn primary" disabled={busy} onClick={run(async () => { await apply(ch); toast(t('guide.card.appliedToast'), 'ok'); })}><Icon name="check" size={15} />{t('common.apply')}</button></> : null}
      {ch.state === 'applied' ? <><small className="dim">{t('guide.card.undoHint')}</small><button type="button" className="btn ghost" disabled={busy} onClick={doUndo}>{t('guide.card.undo')}</button><button type="button" className="btn" onClick={open}>{t('guide.card.open')}</button></> : null}
    </footer>
  </article>;
}

// ── 기록의 한 줄 ──
const argBrief = (a: Record<string, unknown>) => Object.entries(a).filter(([k]) => k !== 'fields' && k !== 'colors' && k !== 'entries' && k !== 'buttons').map(([k, v]) => `${k}=${String(typeof v === 'object' ? '…' : v).slice(0, 28)}`).join(' ').slice(0, 64);
function ItemView({ it, last }: { it: Item; last?: boolean }) {
  if (it.k === 'user') return <div className="gd-u"><span className="fx-lbl kr">{t('guide.you')}</span>{it.refs?.length ? <div className="gd-refs">{it.refs.map(r => <span key={r.kind + r.id} className="fx-pill">@{r.name}</span>)}</div> : null}<p>{it.text}</p></div>;
  if (it.k === 'ai') return it.text ? <div className="gd-a"><Md text={it.text} /></div> : null;
  if (it.k === 'tool') return <details className={'gd-tool' + (it.ok ? '' : ' bad')}>
    <summary><svg className="fx-art" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">{it.ok ? <path d="M1.5 5.2l2.4 2.4L8.5 2.6" /> : <path d="M2 2l6 6M8 2l-6 6" />}</svg><code>{it.name}</code><span>{argBrief(it.args)}</span><em>{!it.ok ? t('guide.tool.bad') : /^(create|update|add|revise)_/.test(it.name) ? t('guide.tool.proposed') : t('guide.tool.ok')}</em></summary>
    <pre>{it.out.length > 2400 ? it.out.slice(0, 2400) + '\n⋯' : it.out}</pre>
  </details>;
  if (it.k === 'change') return <ChangeCard ch={it.change} />;
  if (it.text === 'limit' || it.text === 'loop') return <div className="gd-e gd-limit" role="status"><p>{t(it.text === 'loop' ? 'guide.err.loop' : 'guide.err.limit')}</p>{last && !G.busy ? <button type="button" className="btn primary" onClick={() => void resume(t('guide.cont.say'))}><Icon name="play" size={15} />{t('guide.cont.btn')}</button> : null}</div>;
  return <div className="gd-e" role="alert"><span className="fx-lbl">{t('guide.err.label')}</span><p>{it.text === 'noconn' ? t('guide.err.noconn') : it.text === 'empty' ? t('guide.err.empty') : it.text}</p>{it.text === 'noconn' ? <button type="button" className="btn" onClick={() => { closeGuide(); go('conns'); }}>{t('nav.conns')}</button> : null}</div>;
}

// ── 입력: @ 로 맥락 붙이기, / 로 명령 ──
const REF_KINDS: [Ref['kind'], string][] = [['chars', 'guide.kind.chars'], ['lore', 'guide.kind.lore'], ['presets', 'guide.kind.presets'], ['personas', 'guide.kind.personas'], ['regex', 'guide.kind.regex']];
function refsFor(q: string): Ref[] {
  const low = q.toLowerCase(), out: Ref[] = [];
  for (const [kind] of REF_KINDS) for (const o of S[kind] as { id: string; name: string }[]) if (!low || String(o.name).toLowerCase().includes(low)) { out.push({ kind, id: o.id, name: o.name }); if (out.length >= 40) break; }
  return out.sort((a, b) => Number(b.name.toLowerCase().startsWith(low)) - Number(a.name.toLowerCase().startsWith(low))).slice(0, 8);
}
/** 지금 화면이 가리키는 것 (열린 대화의 캐릭터) — @ 없이도 명령이 대상을 알게 */
const here = (): Ref[] => route.page === 'chat' && cur.chat ? cur.chat.charIds.slice(0, 2).map(i => S.get('chars', i)).filter(Boolean).map(c => ({ kind: 'chars' as const, id: c!.id, name: c!.name })) : [];
const named = (rs: Ref[]) => rs.map(r => `${r.kind === 'chars' ? 'character' : r.kind === 'presets' ? 'preset' : r.kind} "${r.name}" (id ${r.id})`).join(', ');
/** /캐릭터 · /페르소나 옆에 고르는 것: 분량 · 시점 · 언어 */
interface Opts { detail: 'short' | 'standard' | 'detailed'; pov: 'third' | 'second' | 'first'; lang: 'auto' | 'ko' | 'en' | 'ja' | 'zh' }
const OPT0: Opts = { detail: 'standard', pov: 'third', lang: 'auto' };
const LANG_NAME: Record<Opts['lang'], string> = { auto: '', ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Simplified Chinese' };
/** 고르기 단추의 이름 (열쇠를 이어 붙이지 않고 하나씩) */
const OPT_LABEL: { [K in keyof Opts]: Record<Opts[K], () => string> } = {
  detail: { short: () => t('guide.opt.detail.short'), standard: () => t('guide.opt.detail.standard'), detailed: () => t('guide.opt.detail.detailed') },
  pov: { third: () => t('guide.opt.pov.third'), second: () => t('guide.opt.pov.second'), first: () => t('guide.opt.pov.first') },
  lang: { auto: () => t('guide.opt.lang.auto'), ko: () => t('guide.opt.lang.ko'), en: () => t('guide.opt.lang.en'), ja: () => t('guide.opt.lang.ja'), zh: () => t('guide.opt.lang.zh') },
};
const optLine = (o: Opts, pov: boolean) => `Options: detail=${o.detail}${pov ? `, greeting point of view=${o.pov} person` : ''}, language=${o.lang === 'auto' ? 'the language I write in' : LANG_NAME[o.lang]}.`;
type CmdId = 'char' | 'persona' | 'qr' | 'mvu' | 'check' | 'why' | 'help';
interface Cmd { id: CmdId; names: string[]; opts?: 'char' | 'persona'; label(): string; hint(): string; ask(rest: string, refs: Ref[], o: Opts): string }
const CMDS: Cmd[] = [
  { id: 'char', label: () => t('guide.cmd.char.name'), hint: () => t('guide.cmd.char.hint'), opts: 'char', names: ['/캐릭터', '/새캐릭터', '/character', '/new', '/角色', '/新角色'], ask: (rest, refs, o) => {
    const tg = refs.filter(r => r.kind === 'chars');
    return tg.length && rest ? `Work on the character ${named(tg)}: ${rest}\nRead the card first. Change only what I ask, following the CARD AND PERSONA WRITING rules, and propose it with update_character. ${optLine(o, true)}`
      : `Help me make a new character.${rest ? ` My idea: ${rest}` : ' I have not given an idea yet: ask me for one in a single short question, with two or three example ideas.'}\n${optLine(o, true)}\nFollow the CARD AND PERSONA WRITING rules. If the idea is clear enough, make a short plan, draft the complete card and propose it with create_character, then read the check and fix anything it flags with revise_card. Ask at most three short questions first, and only if something essential is truly ambiguous.`; } },
  { id: 'persona', label: () => t('guide.cmd.persona.name'), hint: () => t('guide.cmd.persona.hint'), opts: 'persona', names: ['/페르소나', '/persona', '/人设'], ask: (rest, refs, o) => {
    const tg = refs.filter(r => r.kind === 'personas');
    return tg.length && rest ? `Work on the persona ${named(tg)}: ${rest}\nRead it first, change only what I ask, and propose it with update_persona. ${optLine(o, false)}`
      : `Help me make a persona (the character I play).${rest ? ` My idea: ${rest}` : ' Ask me in one short question who I want to be, with two or three example ideas.'}\n${optLine(o, false)}\nFollow the CARD AND PERSONA WRITING rules for personas. If it is clear enough, propose it with create_persona, then read the check and fix what it flags with revise_card.`; } },
  { id: 'qr', label: () => t('guide.cmd.qr.name'), hint: () => t('guide.cmd.qr.hint'), names: ['/qr', '/빠른답장', '/퀵리플', '/quickreply', '/快速回复'], ask: rest => `Help me with quick replies (STscript buttons).${rest ? ` What I want: ${rest}` : ' Ask me in one short question what the buttons should do, and list a few things you could build (for example a simple simulation with stats and a menu).'}\nIf I mean an existing set, list and read it first. Make a short plan, look up every command you use with st_commands, run st_check until each script is clean, then propose with create_qr_set, add_qr or update_qr. Tell me how to try it.` },
  { id: 'mvu', label: () => t('guide.cmd.mvu.name'), hint: () => t('guide.cmd.mvu.hint'), names: ['/mvu', '/변수', '/상태변수', '/变量'], ask: (rest, refs) => { const tg = refs.filter(r => r.kind === 'chars'); return `Help me set up MVU status variables${tg.length ? ` for ${named(tg)}` : ''}.${rest ? ` What I want to track: ${rest}` : ' If I have not said what to track, suggest a small set based on the card and ask me to confirm in one short question.'}\nRead the card and its lorebooks first (and get_mvu if a chat is open). Plan: initial variables ([InitVar] entry) → update rules → test a sample update with mvu_check → optional status display. Propose each piece with the lorebook / regex tools.`; } },
  { id: 'check', label: () => t('guide.cmd.check.name'), hint: () => t('guide.cmd.check.hint'), names: ['/검사', '/점검', '/check', '/检查'], ask: (rest, refs) => { const tg = refs.filter(r => r.kind === 'chars' || r.kind === 'presets' || r.kind === 'personas'); return `Run the built-in check on ${tg.length ? named(tg) : 'the item I mean — if nothing is attached and no chat is open, ask me which character, persona or preset'}${rest ? ` (${rest})` : ''}. Then read the fields it flags, and read the instructions for contradictions. Explain the findings in order of importance, each with one concrete fix. Do not propose changes unless I ask.`; } },
  { id: 'why', label: () => t('guide.cmd.why.name'), hint: () => t('guide.cmd.why.hint'), names: ['/진단', '/why', '/诊断'], ask: rest => `Explain why the last reply in the open chat came out the way it did${rest ? ` — specifically: ${rest}` : ''}. Use diagnose_reply, read whatever else you need, then name the most likely causes in order and what I can change for each.` },
  { id: 'help', label: () => t('guide.cmd.help.name'), hint: () => t('guide.cmd.help.hint'), names: ['/도움', '/help', '/帮助'], ask: rest => rest ? `Search the handbook and answer: ${rest}` : 'Briefly list what you can help me with here, and the / commands and @ attach chips I can use.' },
];
const cmdName = (c: Cmd) => c.label();
const cmdHint = (c: Cmd) => c.hint();
const CMD = (id: CmdId) => CMDS.find(c => c.id === id)!;
/** 입력 글 맨 앞의 /명령 (이름 · 별칭 · 지금 언어의 이름) */
const cmdOf = (word: string) => CMDS.find(x => x.names.includes(word.toLowerCase()) || cmdName(x).toLowerCase() === word.toLowerCase()) || null;

/** /캐릭터 · /페르소나 를 고르면 입력창 위에 뜨는 고르기 줄 */
function OptRow({ kind, o, set }: { kind: 'char' | 'persona'; o: Opts; set: (o: Opts) => void }) {
  const group = <K extends keyof Opts>(k: K, label: string, vals: Opts[K][]) => <span className="gd-og" role="radiogroup" aria-label={label}>
    <small className="fx-lbl kr">{label}</small>
    {vals.map(v => <button key={v} type="button" role="radio" aria-checked={o[k] === v} className={'gd-o' + (o[k] === v ? ' on' : '')} onClick={() => set({ ...o, [k]: v })}>{(OPT_LABEL[k] as Record<string, () => string>)[v as string]()}</button>)}
  </span>;
  return <div className="gd-opts">
    {group('detail', t('guide.opt.detail'), ['short', 'standard', 'detailed'])}
    {kind === 'char' ? group('pov', t('guide.opt.pov'), ['third', 'second', 'first']) : null}
    {group('lang', t('guide.opt.lang'), ['auto', 'ko', 'en', 'ja', 'zh'])}
  </div>;
}
/** 할 일 목록: 조수가 plan 으로 세운 걸음과 지금 하는 것 */
function PlanView({ plan }: { plan: Plan }) {
  const done = plan.steps.filter(s => s.state === 'done' || s.state === 'skip').length, all = done === plan.steps.length;
  const [open, setOpen] = useState(true);
  useEffect(() => { if (all && !G.busy) setOpen(false); else if (!all) setOpen(true); }, [all, G.busy, plan.at]);   // eslint-disable-line
  return <section className={'gd-plan' + (all ? ' all' : '')} aria-label={t('guide.plan.title')}>
    <button type="button" className="gd-plan-h" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="fx-lbl kr">{t('guide.plan.title')}</span>{plan.title ? <b>{plan.title}</b> : null}<span className="fx-num">{t('guide.plan.count', { done, n: plan.steps.length })}</span>
    </button>
    {open ? <ol>{plan.steps.map((s, i) => <li key={i} className={'st-' + s.state}><i aria-hidden="true">{s.state === 'done' ? '✓' : s.state === 'skip' ? '–' : s.state === 'doing' ? '›' : ''}</i><span>{s.text}</span>{s.state === 'doing' ? <small className="dim">{t('guide.plan.doing')}</small> : null}</li>)}</ol> : null}
  </section>;
}

function Composer() {
  const ta = useRef<HTMLTextAreaElement>(null), [text, setText] = useState(G.draft), [refs, setRefs] = useState<Ref[]>(G.refs), [sel, setSel] = useState(0), [caret, setCaret] = useState(0);
  useEffect(() => { setText(G.draft); setRefs(G.refs); G.draft = ''; G.refs = []; ta.current?.focus(); }, [G.focus]);   // eslint-disable-line
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(180, el.scrollHeight) + 'px'; } }, [text]);
  const at = /(^|\s)@([^\s@]{0,24})$/.exec(text.slice(0, caret)), slash = /^\/([^\s]*)$/.exec(text);
  const atList = at ? refsFor(at[2]).filter(r => !refs.some(x => x.id === r.id)) : [], cmdList = slash ? CMDS.filter(c => c.names.some(n => n.startsWith('/' + slash[1].toLowerCase())) || cmdName(c).toLowerCase().startsWith('/' + slash[1].toLowerCase())) : [];
  const [opts, setOpts] = useState<Opts>(OPT0);
  const head = /^(\/\S+)(\s|$)/.exec(text), typed = head ? cmdOf(head[1]) : null;
  const pop = at ? atList.length : cmdList.length, pick = Math.min(sel, Math.max(0, pop - 1));
  const addRef = (r: Ref) => { if (refs.length >= 8) return toast(t('guide.ref.max')); const head = text.slice(0, caret).replace(/@[^\s@]*$/, ''), tail = text.slice(caret); setRefs([...refs, r]); setText(head + tail); requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(head.length, head.length); setCaret(head.length); }); };
  const useCmd = (c: Cmd) => { setText(cmdName(c) + ' '); requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }); };
  const submit = () => {
    const s = text.trim(); if (!s || G.busy) return;
    const m = /^(\/\S+)\s*([\s\S]*)$/.exec(s), c = m ? cmdOf(m[1]) : null;
    // 열린 대화의 캐릭터를 저절로 붙인다 — 새로 만드는 /캐릭터 · /페르소나 는 빼고 (붙이면 "그 캐릭터를 고쳐"로 읽힌다)
    const all = c && !refs.length && !c.opts ? here() : refs;
    // 변경 카드의 한 칸을 다시 써 달라고 했으면 그 카드 · 칸을 붙인다
    const redo = G.redo; G.redo = null;
    const ask = c ? c.ask(m![2].trim(), all, opts) : redo ? `${s}\n<app_note>The user means the field "${redo.field}" of change card ${redo.card}, which is still waiting for approval. Rewrite only that field and update the card with revise_card.</app_note>` : undefined;
    setText(''); setRefs([]); void send(s, { refs: all, ask });
  };
  return <footer className="gd-comp">
    {pop ? <div className="gd-pop fx-rows" role="listbox">{at
      ? atList.map((r, i) => <button key={r.kind + r.id} type="button" role="option" aria-selected={i === pick} className={i === pick ? 'on' : undefined} onMouseDown={e => { e.preventDefault(); addRef(r); }}><b>{r.name}</b><small className="fx-lbl kr">{t(REF_KINDS.find(k => k[0] === r.kind)![1])}</small></button>)
      : cmdList.map((c, i) => <button key={c.id} type="button" role="option" aria-selected={i === pick} className={i === pick ? 'on' : undefined} onMouseDown={e => { e.preventDefault(); useCmd(c); }}><b className="fx-num">{cmdName(c)}</b><small>{cmdHint(c)}</small></button>)}</div> : null}
    {typed?.opts ? <OptRow kind={typed.opts} o={opts} set={setOpts} /> : null}
    {refs.length ? <div className="gd-refs">{refs.map(r => <button key={r.kind + r.id} type="button" className="fx-pill" title={t('guide.ref.remove')} onClick={() => setRefs(refs.filter(x => x !== r))}>@{r.name}<svg className="fx-art" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" /></svg></button>)}</div> : null}
    <div className="gd-box">
      <button type="button" className="gd-slash" title={t('guide.cmd.menu')} aria-label={t('guide.cmd.menu')} onClick={e => menu(e.currentTarget, CMDS.map(c => ({ label: cmdHint(c), hint: cmdName(c), ic: c.id === 'char' ? 'sparkle' : c.id === 'persona' ? 'user' : c.id === 'qr' ? 'play' : c.id === 'mvu' ? 'sliders' : c.id === 'check' ? 'check' : c.id === 'why' ? 'search' : 'book', onclick: () => useCmd(c) })))}>/</button>
      <textarea ref={ta} rows={1} value={text} placeholder={t('guide.ph')} aria-label={t('guide.ph')} spellCheck={false}
        onChange={e => { setText(e.target.value); setCaret(e.target.selectionStart); setSel(0); }} onSelect={e => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyDown={e => {
          if (pop && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setSel((pick + (e.key === 'ArrowDown' ? 1 : pop - 1)) % pop); }
          else if (pop && (e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) { e.preventDefault(); if (at) addRef(atList[pick]); else useCmd(cmdList[pick]); }
          else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !matchMedia('(max-width: 820px)').matches) { e.preventDefault(); submit(); }
          else if (e.key === 'Escape' && !pop) closeGuide();
        }} />
      {G.busy ? <button type="button" className="gd-send stop" title={t('guide.stop')} aria-label={t('guide.stop')} onClick={stop}><Icon name="stop" size={17} /></button>
        : <button type="button" className="gd-send" title={t('guide.send')} aria-label={t('guide.send')} disabled={!text.trim()} onClick={submit}><Icon name="send" size={17} /></button>}
    </div>
    <ConnLine />
  </footer>;
}
function ConnLine() {
  const c = S.helperConn('guide', null);
  return <p className="gd-meta"><span className="fx-num">{c ? `${c.name}${c.model ? ' · ' + c.model : ''}` : t('guide.noConn')}</span><span>{t('guide.cost')}</span></p>;
}

// ── 빈 자리: 무엇을 물을 수 있는지 몇 줄 ──
function Empty() {
  const h = here(), ask = (text: string, refs: Ref[] = []) => { G.draft = text; G.refs = refs; G.focus++; poke(); };
  const rows: [string, () => void][] = [
    [t('guide.empty.q1'), () => ask(t('guide.empty.q1'))],
    h.length ? [t('guide.empty.qCheck', { name: h[0].name }), () => ask(cmdName(CMD('check')) + ' ', h)] : [t('guide.empty.q2'), () => ask(cmdName(CMD('char')) + ' ')],
    route.page === 'chat' && cur.chat ? [t('guide.empty.qWhy'), () => ask(cmdName(CMD('why')) + ' ')] : [t('guide.empty.q3'), () => ask(t('guide.empty.q3'))],
  ];
  return <div className="gd-empty">
    <Mark size={84} draw lit />
    <h3 className="fx-title">{t('guide.empty.title')}</h3>
    <p className="fx-body dim">{t('guide.empty.body')}</p>
    <div className="gd-tasks" role="group" aria-label={t('guide.empty.tasks')}>{(['char', 'persona', 'qr', 'mvu', 'check'] as CmdId[]).map(id => { const c = CMD(id); return <button key={id} type="button" className="gd-task" onClick={() => ask(cmdName(c) + ' ', id === 'check' || id === 'mvu' ? h : [])}><b>{cmdHint(c)}</b><small className="fx-num">{cmdName(c)}</small></button>; })}</div>
    <div className="gd-sugg fx-rows">{rows.map(([label, run], i) => <button key={i} type="button" className="fx-in" style={{ ['--d' as string]: `${.08 * i + .1}s` }} onClick={run}><span className="fx-num">{String(i + 1).padStart(2, '0')}</span>{label}</button>)}</div>
    <p className="gd-tips fx-lbl kr">{t('guide.empty.tips')}</p>
  </div>;
}

const STATUS_KEY = { idle: '', working: 'guide.status.working', review: 'guide.status.review', done: 'guide.status.done' } as const;
function Panel() {
  useEvents('guide', 'route'); useLang();
  const scroll = useRef<HTMLDivElement>(null), stick = useRef(true);
  const items = G.talk?.items || [], n = items.length;
  useEffect(() => { const el = scroll.current; if (el && stick.current) el.scrollTop = el.scrollHeight; });
  useEffect(() => { stick.current = true; }, [n, G.talk?.id]);
  if (!G.open) return null;
  const waiting = items.filter(i => i.k === 'change' && i.change.state === 'pending').length;
  const talks = (e: React.MouseEvent<HTMLButtonElement>) => menu(e.currentTarget, [
    { label: t('guide.talk.new'), ic: 'plus', onclick: newTalk }, G.heads.length ? '-' : null,
    ...G.heads.slice(0, 14).map(h => ({ label: h.title || t('guide.talk.untitled'), hint: fmtDate(h.at, { month: 'numeric', day: 'numeric' }), ic: h.id === G.talk?.id ? 'check' : 'note', onclick: () => void openTalk(h.id) })),
    G.talk && G.heads.some(h => h.id === G.talk?.id) ? '-' : null,
    G.talk && G.heads.some(h => h.id === G.talk?.id) ? { label: t('guide.talk.remove'), ic: 'trash', danger: true, onclick: async () => { if (await confirmBox(t('guide.talk.removeConfirm'), t('common.delete'), true)) void removeTalk(G.talk!.id); } } : null,
  ]);
  return <aside className="gd-panel" role="complementary" aria-label={t('guide.name')}>
    <header className="gd-head">
      <Mark size={34} lit={G.busy} />
      <div className="gd-title"><span className="fx-lbl">Lampkeeper</span><h2 className="fx-serif">{t('guide.name')}</h2></div>
      {G.status !== 'idle' ? <span className={'fx-pill gd-status is-' + G.status} role="status"><i className="fx-dot" />{t(STATUS_KEY[G.status])}{G.busy ? <b className="fx-num">{t('guide.calls', { n: G.calls })}</b> : null}</span> : null}
      <span className="gd-hbtns">
        <button type="button" className="ibtn" title={t('guide.talk.list')} aria-label={t('guide.talk.list')} onClick={talks}><Icon name="note" size={17} /></button>
        <button type="button" className="ibtn" title={t('nav.help')} aria-label={t('nav.help')} onClick={e => menu(e.currentTarget, [{ label: t('nav.help'), ic: 'book', onclick: () => { closeGuide(); go('help'); } }, { label: t('guide.tour.again'), ic: 'play', onclick: () => { closeGuide(); startTour(); } }])}><Icon name="book" size={17} /></button>
        <button type="button" className="ibtn" title={t('common.close')} aria-label={t('common.close')} onClick={closeGuide}><Icon name="x" size={17} /></button>
      </span>
    </header>
    <div className="fx-ticks gd-rule" aria-hidden="true" />
    <div className="gd-scroll" ref={scroll} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      {G.talk?.plan && (n || G.busy) ? <PlanView plan={G.talk.plan} /> : null}
      {!n && !G.busy ? <Empty /> : <div className="gd-items">
        {items.map((it, i) => <ItemView key={i + ':' + it.at} it={it} last={i === n - 1} />)}
        {G.busy ? <div className="gd-a live">{G.stream ? <Md text={G.stream} /> : null}<span className="gd-wait" aria-label={t('guide.status.working')}><i /><i /><i /></span></div> : null}
      </div>}
    </div>
    {waiting > 1 ? <div className="gd-bulk"><span>{t('guide.card.waiting', { n: waiting })}</span><button type="button" className="btn" onClick={() => void applyAll().then(() => toast(t('guide.card.appliedToast'), 'ok'))}>{t('guide.card.applyAll')}</button></div> : null}
    <Composer key={G.talk?.id || 'new'} />
  </aside>;
}

/** 옆 창을 body 에 한 번 올린다 */
export function mountGuide() {
  if (document.getElementById('gd-root')) return;
  const el = document.createElement('div'); el.id = 'gd-root'; document.body.append(el);
  createRoot(el).render(<Panel />);
}
