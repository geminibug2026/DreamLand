// 기능 화면 › 벡터 검색 (div.card.vec-card 안)
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Btn, IconBtn } from '../kit';
import { Form, type FormDefs, confirmBox, promptBox, toast } from '../ui';
import { errMsg } from '../addons/parts';
import { useRedraw } from '../addons/parts';
import { VEC_TEMPLATE, cfg, chatPieces, dropChat, embed, embedOpt, lastSearch, loadStore, sigOf, sync } from './logic';
import { tokens } from '../lib/engine';
import { S, chatConns, pickFiles } from '../lib/core';
import { dataBank } from '../stscript/ext/world';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';

type Opts = [string, string][];
export function VectorsPane() {
  const E = embed(), c = cfg(), redraw = useRedraw();
  const [status, setStatus] = useState<ReactNode>(null);
  const alive = useRef(true), shape = JSON.stringify([c.enabled, c.chat, c.lore, c.position, c.connId, c.kind]);
  const cur = () => chatApi.current();
  const drawStatus = async () => {
    const { chat, msgs } = cur(), conn = S.get('conns', c.connId);
    let rows: ReactNode;
    if (!conn) rows = <small className="hint">{t('vectors.status.pickConn')}</small>;
    else {
      const last = lastSearch(); let room: ReactNode = null;
      if (chat) { const st = await loadStore('vec:' + chat.id, sigOf(c), true), ps = chatPieces(chat, msgs, c), have = ps.filter(p => st.items[p.key]).length; room = <div><span>{t('vectors.status.openChat')}</span><b>{t('vectors.status.ready', { total: ps.length, have })}</b><small>{t('vectors.status.tokens', { count: ps.reduce((n, p) => n + tokens(p.text), 0).toLocaleString() })}</small></div>; }
      rows = <>
        <div><span>{t('vectors.embedding')}</span><b>{`${(E.EMBED_KINDS as Record<string, string>)[E.embedKind(conn, c.kind)].split(' — ')[0]} · ${E.embedModel(conn, c.kind, c.model)}`}</b></div>
        {room}
        {last && (last.chat.length || last.lore.length) ? <div className="vec-last"><span>{t('vectors.status.last')}</span><div>
          {last.chat.map((x, i) => <p key={i}><em>{x.score.toFixed(2)}</em>{`${x.who}: ${x.text.slice(0, 110)}${x.text.length > 110 ? '…' : ''}`}</p>)}
          {last.lore.map((x, i) => <p key={'l' + i}><em>{x.score.toFixed(2)}</em>{t('vectors.status.loreHit', { name: x.name })}</p>)}</div></div> : null}
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
  const conns: Opts = [['', t('vectors.pick')], ...chatConns().map(x => [x.id, x.name] as [string, string])], conn = S.get('conns', c.connId);
  const on = c.enabled, ch = on && c.chat, lo = on && c.lore;
  const defs: FormDefs = [
    { k: 'vectors.enabled', label: t('vectors.f.enabled'), type: 'check', live: true },
    on && { section: t('vectors.embedding') },
    on && { k: 'vectors.connId', label: t('vectors.f.connId'), type: 'select', opts: conns, half: true, live: true, hint: t('vectors.f.connIdHint') },
    on && { k: 'vectors.kind', label: t('vectors.f.kind'), type: 'select', opts: Object.entries(E.EMBED_KINDS), half: true, live: true },
    on && { k: 'vectors.model', label: t('vectors.f.model'), ph: conn ? E.embedModel(conn, c.kind, '') : 'text-embedding-3-small', half: true, hint: t('vectors.f.modelHint') },
    on && { section: t('vectors.f.chatSection') },
    on && { k: 'vectors.chat', label: t('vectors.f.chat'), type: 'check', live: true },
    ch && { k: 'vectors.insert', label: t('vectors.f.insert'), type: 'num', min: 1, max: 20, third: true },
    ch && { k: 'vectors.query', label: t('vectors.f.query'), type: 'num', min: 1, max: 10, third: true },
    ch && { k: 'vectors.protect', label: t('vectors.f.protect'), type: 'num', min: 0, max: 500, third: true, hint: t('vectors.f.protectHint') },
    ch && { k: 'vectors.threshold', label: t('vectors.f.threshold'), type: 'num', min: 0, max: 1, step: 0.01, third: true, hint: t('vectors.f.thresholdHint') },
    ch && { k: 'vectors.chunk', label: t('vectors.f.chunk'), type: 'num', min: 0, max: 4000, step: 50, third: true, hint: t('vectors.f.chunkHint') },
    ch && { k: 'vectors.position', label: t('vectors.f.position'), type: 'select', opts: [['depth', t('vectors.f.posDepth')], ['before', t('vectors.f.posBefore')]], third: true, live: true },
    ch && c.position !== 'before' && { k: 'vectors.depth', label: t('vectors.f.depth'), type: 'num', min: 0, max: 100, third: true },
    ch && { k: 'vectors.template', label: t('vectors.f.template'), type: 'area', rows: 3, ph: VEC_TEMPLATE, hint: t('vectors.f.templateHint') },
    on && { section: t('vectors.f.loreSection') },
    on && { k: 'vectors.lore', label: t('vectors.f.lore'), type: 'check', live: true, hint: t('vectors.f.loreHint') },
    lo && { k: 'vectors.loreAll', label: t('vectors.f.loreAll'), type: 'check' },
    lo && { k: 'vectors.loreMax', label: t('vectors.f.loreMax'), type: 'num', min: 1, max: 30, third: true },
    lo && { k: 'vectors.loreThreshold', label: t('vectors.f.threshold'), type: 'num', min: 0, max: 1, step: 0.01, third: true },
    on && { section: t('vectors.f.filesSection') },
    on && { k: 'vectors.files', label: t('vectors.f.files'), type: 'check', live: true, hint: t('vectors.f.filesHint') },
  ];
  return <>
    <p className="hint">{t('vectors.intro')}</p>
    <Form key={shape} obj={S.settings} defs={defs} onChange={save} />
    {on ? <div className="row wrap">
      <Btn label={t('vectors.test')} ic="plug" cls="ghost" onClick={e => void busy(e, async () => { const [v] = await E.embedTexts(['connection test'], embedOpt(c, { timeoutMs: 20000 })); toast(v?.length ? t('vectors.testOk', { dims: v.length }) : t('vectors.testEmpty'), v?.length ? 'ok' : 'err'); })} />
      <Btn label={t('vectors.build')} ic="sparkle" cls="ghost" title={t('vectors.buildTitle')} onClick={e => void busy(e, async el => {
        const { chat, msgs } = cur(); if (!chat) return toast(t('vectors.noChat'));
        const st = await loadStore('vec:' + chat.id, sigOf(c)); const n = await sync(st, chatPieces(chat, msgs, c), c, { onProgress: (d, t) => { el.textContent = `${d} / ${t}`; } });
        toast(n ? t('vectors.built', { count: n }) : t('vectors.allReady'), 'ok');
      })} />
      <Btn label={t('vectors.drop')} ic="trash" cls="ghost" onClick={e => void busy(e, async () => { const { chat } = cur(); if (!chat) return; await dropChat(chat.id); toast(t('vectors.dropped')); })} />
    </div> : null}
    {on ? <div className="vec-status">{status}</div> : null}
    <DataBank />
  </>;
}

/** 데이터 뱅크: 전역 · 이 캐릭터 · 이 대화에 붙여 둔 글. "파일 검색"이 켜져 있으면 가까운 조각이 프롬프트에 들어간다 */
function DataBank() {
  const redraw = useRedraw(), list = dataBank.list();
  const SRC = [['global', t('st.x.world.src.global')], ['character', t('st.x.world.src.character')], ['chat', t('st.x.world.src.chat')]] as const;
  const [src, setSrc] = useState<'global' | 'character' | 'chat'>('global');
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { toast(errMsg(e), 'err'); } redraw(); };
  return <div className="card vec-bank">
    <h3 className="form-sec">{t('vectors.bank.title')}</h3>
    <p className="hint">{t('vectors.bank.hint')}</p>
    <div className="row wrap">
      <select className="inp" value={src} aria-label={t('vectors.bank.where')} onChange={e => setSrc(e.target.value as typeof src)}>{SRC.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <Btn label={t('vectors.bank.addFile')} ic="upload" cls="ghost" onClick={() => void run(async () => { for (const f of await pickFiles({ accept: '.txt,.md,.json,.csv,.html,.log', multiple: true })) await dataBank.add(src, f.name, await f.text()); })} />
      <Btn label={t('vectors.bank.addText')} ic="plus" cls="ghost" onClick={() => void run(async () => { const v = await promptBox(t('vectors.bank.addText'), '', { area: true }); if (v?.trim()) await dataBank.add(src, v.trim().slice(0, 30).replace(/\s+/g, ' ') + '….txt', v); })} />
    </div>
    {list.length ? <ul className="vec-bank-list">{list.map(f => <li key={f.url} className={f.disabled ? 'off' : ''}>
      <span className="badge">{SRC.find(x => x[0] === f.src)?.[1]}</span><span className="vec-bank-name">{f.name}</span><small className="hint">{t('vectors.bank.chars', { n: f.text.length })}</small>
      <label className="check"><input type="checkbox" checked={!f.disabled} onChange={() => void run(() => dataBank.toggle(f.url))} /><i /></label>
      <IconBtn ic="trash" title={t('common.delete')} onClick={() => void run(async () => { if (await confirmBox(t('vectors.bank.deleteAsk', { name: f.name }), t('common.delete'), true)) await dataBank.remove(f.url); })} />
    </li>)}</ul> : <p className="dim">{t('vectors.bank.empty')}</p>}
  </div>;
}
