// 기능 화면 › 벡터 검색 (div.card.vec-card 안)
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Btn } from '../kit';
import { Form, type FormDefs } from '../ui';
import { B, errMsg } from '../addons/legacy';
import { useRedraw } from '../addons/parts';
import { VEC_TEMPLATE, cfg, chatPieces, dropChat, embed, embedOpt, lastSearch, loadStore, sigOf, sync } from './logic';

type Opts = [string, string][];
export function VectorsPane() {
  const S = B.S, toast = B.ui.toast, E = embed(), c = cfg(), redraw = useRedraw();
  const [status, setStatus] = useState<ReactNode>(null);
  const alive = useRef(true), shape = JSON.stringify([c.enabled, c.chat, c.lore, c.position, c.connId, c.kind]);
  const cur = () => B.chat.current();
  const drawStatus = async () => {
    const { chat, msgs } = cur(), conn = S.get('conns', c.connId);
    let rows: ReactNode;
    if (!conn) rows = <small className="hint">임베딩에 쓸 연결을 고르면 여기에 상태가 보입니다.</small>;
    else {
      const last = lastSearch(); let room: ReactNode = null;
      if (chat) { const st = await loadStore('vec:' + chat.id, sigOf(c), true), ps = chatPieces(chat, msgs, c), have = ps.filter(p => st.items[p.key]).length; room = <div><span>열려 있는 대화</span><b>{`조각 ${ps.length}개 중 ${have}개 준비됨`}</b><small>{`≈${ps.reduce((n, p) => n + B.engine.tokens(p.text), 0).toLocaleString()} 토큰 분량`}</small></div>; }
      rows = <>
        <div><span>임베딩</span><b>{`${E.EMBED_KINDS[E.embedKind(conn, c.kind)].split(' — ')[0]} · ${E.embedModel(conn, c.kind, c.model)}`}</b></div>
        {room}
        {last && (last.chat.length || last.lore.length) ? <div className="vec-last"><span>마지막 검색</span><div>
          {last.chat.map((x, i) => <p key={i}><em>{x.score.toFixed(2)}</em>{`${x.who}: ${x.text.slice(0, 110)}${x.text.length > 110 ? '…' : ''}`}</p>)}
          {last.lore.map((x, i) => <p key={'l' + i}><em>{x.score.toFixed(2)}</em>{`로어북 · ${x.name}`}</p>)}</div></div> : null}
      </>;
    }
    if (alive.current) setStatus(rows);
  };
  useEffect(() => { alive.current = true; if (c.enabled) drawStatus().catch(() => { }); return () => { alive.current = false; }; }, [shape]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 칸이 늘고 주는 변화일 때만 다시 그린다 (입력 중인 칸의 초점을 지킨다)
  const shown = useRef(shape); shown.current = shape;
  const save = () => { S.set({ vectors: S.settings.vectors }); if (JSON.stringify([c.enabled, c.chat, c.lore, c.position, c.connId, c.kind]) !== shown.current) redraw(); else drawStatus().catch(() => { }); };
  const busy = async (e: MouseEvent<HTMLButtonElement>, fn: (label: HTMLElement) => Promise<unknown>) => {
    const el = e.currentTarget, label = el.querySelector('span') || el, t = label.textContent; el.disabled = true;
    try { await fn(label); } catch (err) { toast(errMsg(err).slice(0, 200), 'err'); }
    el.disabled = false; label.textContent = t; drawStatus().catch(() => { });
  };
  const conns: Opts = [['', '골라 주세요'], ...S.conns.map(x => [x.id, x.name] as [string, string])], conn = S.get('conns', c.connId);
  const on = c.enabled, ch = on && c.chat, lo = on && c.lore;
  const defs: FormDefs = [
    { k: 'vectors.enabled', label: '벡터 검색 쓰기', type: 'check', live: true },
    on && { section: '임베딩' },
    on && { k: 'vectors.connId', label: '임베딩에 쓸 연결', type: 'select', opts: conns, half: true, live: true, hint: '이 연결의 주소와 키를 빌려 씁니다.' },
    on && { k: 'vectors.kind', label: '방식', type: 'select', opts: Object.entries(E.EMBED_KINDS), half: true, live: true },
    on && { k: 'vectors.model', label: '임베딩 모델', ph: conn ? E.embedModel(conn, c.kind, '') : 'text-embedding-3-small', half: true, hint: '비우면 방식의 기본 모델. 모델을 바꾸면 벡터를 처음부터 다시 만듭니다.' },
    on && { section: '지난 대화' },
    on && { k: 'vectors.chat', label: '지난 대화에서 비슷한 대목을 찾아 싣기', type: 'check', live: true },
    ch && { k: 'vectors.insert', label: '한 번에 실을 조각 수', type: 'num', min: 1, max: 20, third: true },
    ch && { k: 'vectors.query', label: '질의로 쓸 최근 메시지 수', type: 'num', min: 1, max: 10, third: true },
    ch && { k: 'vectors.protect', label: '최근 몇 개는 찾지 않기', type: 'num', min: 0, max: 500, third: true, hint: '어차피 프롬프트에 들어가는 최근 메시지는 건너뜁니다.' },
    ch && { k: 'vectors.threshold', label: '유사도 문턱', type: 'num', min: 0, max: 1, step: 0.01, third: true, hint: '이보다 덜 비슷하면 싣지 않습니다.' },
    ch && { k: 'vectors.chunk', label: '조각 크기 (글자)', type: 'num', min: 0, max: 4000, step: 50, third: true, hint: '긴 메시지를 이 크기로 나눕니다. 0 = 나누지 않음.' },
    ch && { k: 'vectors.position', label: '싣는 자리', type: 'select', opts: [['depth', '대화 기록 사이 (깊이)'], ['before', '대화 기록 앞']], third: true, live: true },
    ch && c.position !== 'before' && { k: 'vectors.depth', label: '깊이 (끝에서 몇 번째 앞)', type: 'num', min: 0, max: 100, third: true },
    ch && { k: 'vectors.template', label: '싣는 글의 틀', type: 'area', rows: 3, ph: VEC_TEMPLATE, hint: '{{text}} 자리에 찾은 대목이 들어갑니다. 비워 두면 기본 문장을 씁니다.' },
    on && { section: '로어북' },
    on && { k: 'vectors.lore', label: '로어북 항목을 뜻으로 깨우기', type: 'check', live: true, hint: '항목 편집의 "벡터로 발동"을 켠 항목이 대상입니다. 키워드 발동은 그대로 함께 움직여요.' },
    lo && { k: 'vectors.loreAll', label: '표시하지 않은 항목도 모두 대상으로', type: 'check' },
    lo && { k: 'vectors.loreMax', label: '한 번에 깨울 항목 수', type: 'num', min: 1, max: 30, third: true },
    lo && { k: 'vectors.loreThreshold', label: '유사도 문턱', type: 'num', min: 0, max: 1, step: 0.01, third: true },
  ];
  return <>
    <p className="hint">지난 대화와 로어북을 낱말이 아니라 뜻으로 찾아 프롬프트에 싣습니다. 켜 두면 답변마다 임베딩 호출이 1회 더 나가고, 처음 한 번은 지난 메시지만큼 더 나갑니다. 임베딩은 채팅 모델보다 훨씬 싸지만 공짜는 아니에요.</p>
    <Form key={shape} obj={S.settings} defs={defs} onChange={save} />
    {on ? <div className="row wrap">
      <Btn label="연결 시험" ic="plug" cls="ghost" onClick={e => void busy(e, async () => { const [v] = await E.embedTexts(['connection test'], embedOpt(c, { timeoutMs: 20000 })); toast(v?.length ? `임베딩 연결 성공 (${v.length}차원)` : '응답이 비어 있어요', v?.length ? 'ok' : 'err'); })} />
      <Btn label="이 대화 벡터 지금 만들기" ic="sparkle" cls="ghost" title="열려 있는 대화의 지난 메시지를 미리 임베딩해 둡니다. 하지 않아도 답변 직전에 자동으로 만듭니다." onClick={e => void busy(e, async el => {
        const { chat, msgs } = cur(); if (!chat) return toast('열려 있는 대화가 없어요');
        const st = await loadStore('vec:' + chat.id, sigOf(c)); const n = await sync(st, chatPieces(chat, msgs, c), c, { onProgress: (d, t) => { el.textContent = `${d} / ${t}`; } });
        toast(n ? `조각 ${n}개의 벡터를 만들었어요.` : '이미 모두 준비되어 있어요.', 'ok');
      })} />
      <Btn label="이 대화 벡터 지우기" ic="trash" cls="ghost" onClick={e => void busy(e, async () => { const { chat } = cur(); if (!chat) return; await dropChat(chat.id); toast('이 대화의 벡터를 지웠어요.'); })} />
    </div> : null}
    {on ? <div className="vec-status">{status}</div> : null}
  </>;
}
