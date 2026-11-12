// 전송될 프롬프트 살펴보기: 갈래별 띠 · 표 · 조각별 크기, 컨텍스트 대비 막대 (합치기 전 조각으로 계산)
import { useState, type ReactNode } from 'react';
import { openModal, toast } from '../ui';
import { cur } from './store';
import { charsOf, drawGauge, modeOf, presenceOf } from './actions';
import type { Built, PMsg, Room } from './types';
import { buildPrompt, tokens } from '../lib/engine';
import { S } from '../lib/core';
import { t as tr } from '../i18n';

const CATS = (): [string, string][] => (['history', 'preset', 'char', 'persona', 'lore', 'memory', 'note', 'feature', 'prefill']).map((k): [string, string] => [k, tr('chat.inspect.cat.' + k)]);
const catOf = (m: PMsg) => { const s = String(m.src || ''); return m.src === 'history' ? 'history' : m.prefill || /응답 시작/.test(s) ? 'prefill' : /작가 노트|캐릭터 노트/.test(s) ? 'note' : /로어북/.test(s) ? 'lore' : /장기기억|옛 요약|벡터 검색/.test(s) ? 'memory' : /페르소나/.test(s) ? 'persona' : /캐릭터|시나리오|대화 예시|스토리 스트링|인물 카드/.test(s) ? 'char' : /삽화|에셋|상태창|트래커|지금 상태|장면|약속|표정|일정|끼어들기|교환 일기|읽지 않음|읽고 답|자리를 비운|재생성 이유|명령 안내|모듈/.test(s) ? 'feature' : 'preset'; };
interface Sum { t: number; n: number; parts: Map<string, { t: number; n: number }> }

function Inspect({ chat, built, fine }: { chat: Room; built: Built; fine: Built }) {
  const [view, setView] = useState<'map' | 'list'>('map');
  const P = S.presetFor(chat).params, max = P.contextSize || 128000;
  // 어디가 얼마를 차지하는지: 갈래별로 모아 한 줄 띠와 표로 보여 준다
  const reserve = Math.min(P.maxTokens || 4096, max), sum: Record<string, Sum> = {};
  for (const m of fine.messages) { const k = catOf(m), t = tokens(m.content) + 4, c = sum[k] ||= { t: 0, n: 0, parts: new Map() }; c.t += t; c.n++; const label = m.src === 'history' ? tr('chat.inspect.history') : (m.src || tr('chat.inspect.unnamed')); const p = c.parts.get(label) || { t: 0, n: 0 }; p.t += t; p.n++; c.parts.set(label, p); }
  const cats = CATS().filter(([k]) => sum[k]).sort((x, y) => sum[y[0]].t - sum[x[0]].t);
  const used = built.total, free = Math.max(0, max - used - reserve), over = used + reserve > max, pct = (n: number) => Math.round(n / max * 1000) / 10;
  const all = Math.max(1, cats.reduce((x, [k]) => x + sum[k].t, 0)), share = (n: number) => Math.round(n / all * 100);
  const fill = Math.min(1, used / max);
  const moon = <span className="pm-moon" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="pm-clip"><rect x="0" y="${40 - 40 * fill}" width="40" height="40"/></clipPath></defs><circle cx="20" cy="20" r="18" class="pm-ring"/><circle cx="20" cy="20" r="18" class="pm-fill" clip-path="url(#pm-clip)"/></svg>` }} />;
  const band = <div className="pm-band" role="img" aria-label={tr('chat.inspect.composition')}>{cats.map(([k, l]) => <i key={k} className={`pm-seg pm-${k}`} style={{ flexGrow: sum[k].t }} title={tr('chat.inspect.segTitle', { label: l, tokens: sum[k].t.toLocaleString(), pct: share(sum[k].t) })}>{share(sum[k].t) >= 12 ? <span>{`${share(sum[k].t)}%`}</span> : null}</i>)}</div>;
  const rows = cats.map(([k, l]) => { const c = sum[k], parts = [...c.parts.entries()].sort((x, y) => y[1].t - x[1].t);
    return <details className="pm-row" key={k}><summary><i className={`pm-key pm-${k}`} /><b>{l}</b><span className="pm-meter"><i style={{ width: Math.max(1, c.t / Math.max(1, used) * 100) + '%' }} /></span><span className="pm-num">{c.t.toLocaleString()}</span><small>{`${share(c.t)}%`}</small></summary>
      <div className="pm-parts">{parts.map(([name, p]) => <div className="pm-part" key={name}><span>{name.replace(/^로어북: /, '')}{p.n > 1 ? <em>{` ×${p.n}`}</em> : null}</span><span className="pm-num">{p.t.toLocaleString()}</span><small>{`${Math.round(p.t / Math.max(1, c.t) * 100)}%`}</small></div>)}</div></details>; });
  const tail = ([['pm-reserve', tr('chat.inspect.reserve'), reserve, tr('chat.inspect.reserveHint')], ['pm-free', tr('chat.inspect.free'), free, over ? tr('chat.inspect.overHint') : '']] as [string, string, number, string][]).map(([cls, l, n, hint]) =>
    <div className="pm-row flat" key={cls}><i className={`pm-key ${cls}`} /><b>{l}</b><span className="pm-hint">{hint}</span><span className="pm-num">{n.toLocaleString()}</span><small>{`${pct(n)}%`}</small></div>);
  const listView = () => {   // 채팅 기록은 이어진 것끼리 한 묶음으로 접어 둔다 (길어져도 한눈에 보이게)
    const row = (m: PMsg, key: string, label?: string) => <details className="inspect-row" key={key}><summary><i className={`pm-key pm-${catOf(m)}`} /><span className={`role ${m.role}`}>{m.role}</span><span className="src">{label || m.src}</span><small>{`≈${tokens(m.content).toLocaleString()}`}</small></summary><pre>{m.content}</pre></details>;
    const out: ReactNode[] = [], hist = built.messages.filter(m => m.src === 'history'); let run: PMsg[] = [];
    const flush = () => { if (!run.length) return; const list = run, key = 'h' + out.length; run = []; if (list.length === 1) { out.push(row(list[0], key, tr('chat.inspect.history'))); return; }
      const first = hist.indexOf(list[0]);
      out.push(<details className="inspect-row inspect-group" key={key}><summary><i className="pm-key pm-history" /><span className="role history">HISTORY</span><span className="src">{tr('chat.inspect.historyN', { count: list.length })}</span><small>{`≈${list.reduce((n, m) => n + tokens(m.content), 0).toLocaleString()}`}</small></summary>
        <div className="inspect-list">{list.map((m, i) => row(m, String(i), `#${first + i + 1} · ${m.content.replace(/\s+/g, ' ').slice(0, 60)}`))}</div></details>); };
    built.messages.forEach((m, i) => { if (m.src === 'history') run.push(m); else { flush(); out.push(row(m, 'm' + i)); } });
    flush(); return out;
  };
  return <div className="inspect">
    <div className="pm-head">{moon}<div className="pm-total"><b>{`≈${used.toLocaleString()}`}</b><span>{tr('chat.inspect.ofMax', { max: max.toLocaleString() })}</span><small>{tr('chat.inspect.summary', { pct: pct(used), msgs: built.messages.length, lore: built.lore.length })}</small></div>
      {built.dropped ? <em className="badge">{tr('chat.inspect.dropped', { count: built.dropped })}</em> : null}{over ? <em className="badge warn">{tr('chat.inspect.overflow')}</em> : null}</div>
    <div className="pm-cap"><span>{tr('chat.inspect.compCap')}</span><span>{tr('chat.inspect.approxTokens', { tokens: used.toLocaleString() })}</span></div>{band}
    <div className="tabs pm-tabs">{([['map', tr('chat.inspect.tabMap')], ['list', tr('chat.inspect.tabList')]] as const).map(([k, l]) => <button key={k} className={'tab' + (view === k ? ' on' : '')} onClick={() => setView(k)}>{l}</button>)}</div>
    {view === 'map' ? <>
      <div className="pm-table">{rows}</div>
      <div className="pm-cap"><span>{tr('chat.inspect.ctxCap')}</span><span>{tr('chat.inspect.full', { pct: pct(used) })}</span></div>
      <div className="pm-ctx" title={tr('chat.inspect.ctxCap')}><i className="pm-ctx-used" style={{ width: Math.min(100, pct(used)) + '%' }} /><i className="pm-ctx-res" style={{ width: Math.min(100 - Math.min(100, pct(used)), pct(reserve)) + '%' }} /></div>
      <div className="pm-table pm-tail">{tail}</div>
      <p className="hint">{tr('chat.inspect.hint')}</p></> : listView()}
  </div>;
}

export function inspector() {
  const chat = cur.chat; if (!chat) return;
  const chars = charsOf(chat);
  let built: Built, fine: Built;
  const talkNow = modeOf(chat) === 'talk' && !chat.scene?.on, keep = chat.presence, pres = talkNow ? presenceOf(chat, chars[0]) : null;
  if (pres) chat.presence = { status: pres.status, activity: pres.activity };
  const inScene = modeOf(chat) === 'talk' && !!chat.scene?.on, pchat: Room = inScene ? Object.assign(Object.create(chat) as Room, { mode: 'rp' as const, sceneLive: true }) : chat;
  try {
    const pz = S.presetFor(chat), args = { chat: pchat, char: chars[0], chars, persona: S.persona(chat), msgs: cur.msgs, type: 'normal' as const };
    built = buildPrompt({ ...args, preset: pz });
    // 구성 보기용: 같은 역할끼리 합치기 전의 조각으로 한 번 더 조립해야 갈래별 크기가 정확하다
    try { fine = buildPrompt({ ...args, preset: { ...pz, params: { ...pz.params, squash: false } } }); } catch { fine = built; }
  } catch (e) { return toast(e instanceof Error ? e.message : String(e), 'err'); }
  finally { if (pres) { if (keep === undefined) delete chat.presence; else chat.presence = keep; } }
  cur.lastPrompt = built; drawGauge();
  openModal({ title: tr('chat.inspect.title'), wide: true, body: <Inspect chat={chat} built={built} fine={fine} /> });
}
