// 전송될 프롬프트 살펴보기: 갈래별 띠 · 표 · 조각별 크기, 컨텍스트 대비 막대 (합치기 전 조각으로 계산)
import { useState, type ReactNode } from 'react';
import { openModal, toast } from '../ui';
import { B } from './bridge';
import { cur } from './store';
import { charsOf, drawGauge, modeOf, presenceOf } from './actions';
import type { Built, PMsg, Room } from './types';

const CATS: [string, string][] = [['history', '대화 기록'], ['preset', '프리셋 지시문'], ['char', '캐릭터'], ['persona', '페르소나'], ['lore', '로어북'], ['memory', '장기기억'], ['note', '노트'], ['feature', '기능이 덧붙인 것'], ['prefill', '응답 시작']];
const catOf = (m: PMsg) => { const s = String(m.src || ''); return m.src === 'history' ? 'history' : m.prefill || /응답 시작/.test(s) ? 'prefill' : /작가 노트|캐릭터 노트/.test(s) ? 'note' : /로어북/.test(s) ? 'lore' : /장기기억|옛 요약|벡터 검색/.test(s) ? 'memory' : /페르소나/.test(s) ? 'persona' : /캐릭터|시나리오|대화 예시|스토리 스트링|인물 카드/.test(s) ? 'char' : /삽화|에셋|상태창|트래커|지금 상태|장면|약속|표정|일정|끼어들기|교환 일기|읽지 않음|읽고 답|자리를 비운|재생성 이유|명령 안내|모듈/.test(s) ? 'feature' : 'preset'; };
interface Sum { t: number; n: number; parts: Map<string, { t: number; n: number }> }

function Inspect({ chat, built, fine }: { chat: Room; built: Built; fine: Built }) {
  const [view, setView] = useState<'map' | 'list'>('map');
  const tokens = B.engine.tokens, P = B.S.presetFor(chat).params, max = P.contextSize || 128000;
  // 어디가 얼마를 차지하는지: 갈래별로 모아 한 줄 띠와 표로 보여 준다
  const reserve = Math.min(P.maxTokens || 4096, max), sum: Record<string, Sum> = {};
  for (const m of fine.messages) { const k = catOf(m), t = tokens(m.content) + 4, c = sum[k] ||= { t: 0, n: 0, parts: new Map() }; c.t += t; c.n++; const label = m.src === 'history' ? '채팅 기록' : (m.src || '이름 없는 조각'); const p = c.parts.get(label) || { t: 0, n: 0 }; p.t += t; p.n++; c.parts.set(label, p); }
  const cats = CATS.filter(([k]) => sum[k]).sort((x, y) => sum[y[0]].t - sum[x[0]].t);
  const used = built.total, free = Math.max(0, max - used - reserve), over = used + reserve > max, pct = (n: number) => Math.round(n / max * 1000) / 10;
  const all = Math.max(1, cats.reduce((x, [k]) => x + sum[k].t, 0)), share = (n: number) => Math.round(n / all * 100);
  const fill = Math.min(1, used / max);
  const moon = <span className="pm-moon" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="pm-clip"><rect x="0" y="${40 - 40 * fill}" width="40" height="40"/></clipPath></defs><circle cx="20" cy="20" r="18" class="pm-ring"/><circle cx="20" cy="20" r="18" class="pm-fill" clip-path="url(#pm-clip)"/></svg>` }} />;
  const band = <div className="pm-band" role="img" aria-label="프롬프트 구성">{cats.map(([k, l]) => <i key={k} className={`pm-seg pm-${k}`} style={{ flexGrow: sum[k].t }} title={`${l} · ${sum[k].t.toLocaleString()} 토큰 · ${share(sum[k].t)}%`}>{share(sum[k].t) >= 12 ? <span>{`${share(sum[k].t)}%`}</span> : null}</i>)}</div>;
  const rows = cats.map(([k, l]) => { const c = sum[k], parts = [...c.parts.entries()].sort((x, y) => y[1].t - x[1].t);
    return <details className="pm-row" key={k}><summary><i className={`pm-key pm-${k}`} /><b>{l}</b><span className="pm-meter"><i style={{ width: Math.max(1, c.t / Math.max(1, used) * 100) + '%' }} /></span><span className="pm-num">{c.t.toLocaleString()}</span><small>{`${share(c.t)}%`}</small></summary>
      <div className="pm-parts">{parts.map(([name, p]) => <div className="pm-part" key={name}><span>{name.replace(/^로어북: /, '')}{p.n > 1 ? <em>{` ×${p.n}`}</em> : null}</span><span className="pm-num">{p.t.toLocaleString()}</span><small>{`${Math.round(p.t / Math.max(1, c.t) * 100)}%`}</small></div>)}</div></details>; });
  const tail = ([['pm-reserve', '답변 몫', reserve, '프리셋의 최대 응답 토큰만큼 비워 둡니다'], ['pm-free', '남은 자리', free, over ? '자리가 모자라 오래된 기록부터 빠집니다' : '']] as [string, string, number, string][]).map(([cls, l, n, hint]) =>
    <div className="pm-row flat" key={cls}><i className={`pm-key ${cls}`} /><b>{l}</b><span className="pm-hint">{hint}</span><span className="pm-num">{n.toLocaleString()}</span><small>{`${pct(n)}%`}</small></div>);
  const listView = () => {   // 채팅 기록은 이어진 것끼리 한 묶음으로 접어 둔다 (길어져도 한눈에 보이게)
    const row = (m: PMsg, key: string, label?: string) => <details className="inspect-row" key={key}><summary><i className={`pm-key pm-${catOf(m)}`} /><span className={`role ${m.role}`}>{m.role}</span><span className="src">{label || m.src}</span><small>{`≈${tokens(m.content).toLocaleString()}`}</small></summary><pre>{m.content}</pre></details>;
    const out: ReactNode[] = [], hist = built.messages.filter(m => m.src === 'history'); let run: PMsg[] = [];
    const flush = () => { if (!run.length) return; const list = run, key = 'h' + out.length; run = []; if (list.length === 1) { out.push(row(list[0], key, '채팅 기록')); return; }
      const first = hist.indexOf(list[0]);
      out.push(<details className="inspect-row inspect-group" key={key}><summary><i className="pm-key pm-history" /><span className="role history">HISTORY</span><span className="src">{`채팅 기록 ${list.length}개`}</span><small>{`≈${list.reduce((n, m) => n + tokens(m.content), 0).toLocaleString()}`}</small></summary>
        <div className="inspect-list">{list.map((m, i) => row(m, String(i), `#${first + i + 1} · ${m.content.replace(/\s+/g, ' ').slice(0, 60)}`))}</div></details>); };
    built.messages.forEach((m, i) => { if (m.src === 'history') run.push(m); else { flush(); out.push(row(m, 'm' + i)); } });
    flush(); return out;
  };
  return <div className="inspect">
    <div className="pm-head">{moon}<div className="pm-total"><b>{`≈${used.toLocaleString()}`}</b><span>{` / ${max.toLocaleString()} 토큰`}</span><small>{`${pct(used)}% 참 · 메시지 ${built.messages.length}개 · 로어북 ${built.lore.length}개 발동`}</small></div>
      {built.dropped ? <em className="badge">{`오래된 기록 ${built.dropped}개 제외`}</em> : null}{over ? <em className="badge warn">답변 몫까지 넣으면 넘쳐요</em> : null}</div>
    <div className="pm-cap"><span>보내는 것의 구성</span><span>{`≈${used.toLocaleString()} 토큰`}</span></div>{band}
    <div className="tabs pm-tabs">{([['map', '구성'], ['list', '보내는 순서대로']] as const).map(([k, l]) => <button key={k} className={'tab' + (view === k ? ' on' : '')} onClick={() => setView(k)}>{l}</button>)}</div>
    {view === 'map' ? <>
      <div className="pm-table">{rows}</div>
      <div className="pm-cap"><span>컨텍스트에서 차지하는 자리</span><span>{`${pct(used)}% 참`}</span></div>
      <div className="pm-ctx" title="컨텍스트에서 차지하는 자리"><i className="pm-ctx-used" style={{ width: Math.min(100, pct(used)) + '%' }} /><i className="pm-ctx-res" style={{ width: Math.min(100 - Math.min(100, pct(used)), pct(reserve)) + '%' }} /></div>
      <div className="pm-table pm-tail">{tail}</div>
      <p className="hint">갈래를 누르면 그 안의 조각별 크기가 펼쳐집니다. 퍼센트는 보내는 것 안에서의 비율이고, 토큰 수는 어림값이에요.</p></> : listView()}
  </div>;
}

export function inspector() {
  const chat = cur.chat; if (!chat) return;
  const S = B.S, chars = charsOf(chat);
  let built: Built, fine: Built;
  const talkNow = modeOf(chat) === 'talk' && !chat.scene?.on, keep = chat.presence, pres = talkNow ? presenceOf(chat, chars[0]) : null;
  if (pres) chat.presence = { status: pres.status, activity: pres.activity };
  const inScene = modeOf(chat) === 'talk' && !!chat.scene?.on, pchat: Room = inScene ? Object.assign(Object.create(chat) as Room, { mode: 'rp' as const, sceneLive: true }) : chat;
  try {
    const pz = S.presetFor(chat), args = { chat: pchat, char: chars[0], chars, persona: S.persona(chat), msgs: cur.msgs, type: 'normal' as const };
    built = B.engine.buildPrompt({ ...args, preset: pz });
    // 구성 보기용: 같은 역할끼리 합치기 전의 조각으로 한 번 더 조립해야 갈래별 크기가 정확하다
    try { fine = B.engine.buildPrompt({ ...args, preset: { ...pz, params: { ...pz.params, squash: false } } }); } catch { fine = built; }
  } catch (e) { return toast(e instanceof Error ? e.message : String(e), 'err'); }
  finally { if (pres) { if (keep === undefined) delete chat.presence; else chat.presence = keep; } }
  cur.lastPrompt = built; drawGauge();
  openModal({ title: '전송될 프롬프트', wide: true, body: <Inspect chat={chat} built={built} fine={fine} /> });
}
