// 범위 내보내기: 대화의 몇 번째부터 몇 번째까지를 골라 JSONL · Markdown · TXT 로, 그리고 여러 대화를 한 번에 ZIP 으로
import { useState } from 'react';
import { Btn } from '../kit';
import { openModal, toast, type ModalHandle } from '../ui';
import { S, download, msgText } from '../lib/core';
import { zip } from '../lib/assets';
import { chatToStJsonl } from '../lib/cards';
import type { Chat, Msg } from '../lib/types';
import { chatPicker } from '../editors/ChatPicker';
import { titleOf } from '../chat/actions';
import { t } from '../i18n';

type Fmt = 'jsonl' | 'md' | 'txt';
const EXT: Record<Fmt, [string, string]> = { jsonl: ['jsonl', 'application/jsonl'], md: ['md', 'text/markdown'], txt: ['txt', 'text/plain'] };
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'chat';
/** 한 대화를 글로. 숨긴 메시지는 hidden 을 켰을 때만 (JSONL 은 원본 그대로가 뜻이라 늘 담는다) */
export function renderChat(c: Chat, ms: Msg[], fmt: Fmt, hidden = false): string {
  const me = S.persona(c).name, title = titleOf(c);
  if (fmt === 'jsonl') return chatToStJsonl(c, ms, me, S.get('chars', c.charIds[0])?.name || 'Character');
  const list = ms.filter(m => hidden || !m.hidden);
  if (fmt === 'txt') return list.map(m => `${m.role === 'user' ? me : m.role === 'system' ? t('extras.export.narr') : (m.name || title)}: ${msgText(m)}`).join('\n\n');
  let out = `# ${title}\n\n`, last = '';
  for (const m of list) { const txt = msgText(m).trim(); if (!txt) continue;
    const d = new Date(m.ts).toLocaleDateString(); if (d !== last) { out += `## ${d}\n\n`; last = d; }
    out += m.role === 'system' ? `> ${txt.replace(/\n/g, '\n> ')}\n\n` : `**${m.role === 'user' ? me : (m.name || title)}**\n\n${txt}\n\n`; }
  return out;
}

function Dialog({ c, ms, close }: { c: Chat; ms: Msg[]; close: () => void }) {
  const n = ms.length, [fmt, setFmt] = useState<Fmt>('md'), [a, setA] = useState(1), [b, setB] = useState(n), [hidden, setHidden] = useState(false);
  const lo = Math.max(1, Math.min(a, b)), hi = Math.min(n, Math.max(a, b)), part = ms.slice(lo - 1, hi);
  const chars = part.reduce((k, m) => k + msgText(m).length, 0), pct = (v: number) => n > 1 ? (v - 1) / (n - 1) * 100 : 0;
  const peek = (m?: Msg) => m ? msgText(m).replace(/\[sticker\s*:[^\]]*\]/gi, '').replace(/\s+/g, ' ').slice(0, 64) || '—' : '—';
  const run = () => { if (!part.length) return void toast(t('extras.export.none')); download(`${safeName(titleOf(c))}${lo > 1 || hi < n ? `-${lo}-${hi}` : ''}.${EXT[fmt][0]}`, renderChat(c, part, fmt, hidden), EXT[fmt][1]); close(); };
  const many = () => chatPicker({ selected: [c.id], onDone: ids => void exportMany(ids, fmt, hidden) });
  return <div className="xt-exp">
    <div className="xt-seg" role="radiogroup" aria-label={t('extras.export.format')}>{(['md', 'txt', 'jsonl'] as Fmt[]).map(f => <button key={f} type="button" role="radio" aria-checked={fmt === f} className={'xt-seg-b fx-tap' + (fmt === f ? ' on' : '')} onClick={() => setFmt(f)}><b>{f.toUpperCase()}</b><small>{t('extras.export.fmt.' + f)}</small></button>)}</div>
    <div className="xt-range">
      <span className="fx-lbl kr fx-head">{t('extras.export.range')}</span>
      <div className="xt-range-track" style={{ ['--a' as string]: pct(lo) + '%', ['--b' as string]: pct(hi) + '%' }}><i className="fx-ticks" /><b /></div>
      <input type="range" className="xt-range-in" min={1} max={Math.max(1, n)} value={lo} aria-label={t('extras.export.from')} onChange={e => setA(Math.min(+e.target.value, hi))} />
      <input type="range" className="xt-range-in" min={1} max={Math.max(1, n)} value={hi} aria-label={t('extras.export.to')} onChange={e => setB(Math.max(+e.target.value, lo))} />
      <div className="xt-range-ends">
        <label><span className="fx-lbl kr">{t('extras.export.from')}</span><input className="inp fx-num" type="number" min={1} max={n} value={lo} onChange={e => setA(Math.max(1, Math.min(n, +e.target.value || 1)))} /><small>{peek(ms[lo - 1])}</small></label>
        <label><span className="fx-lbl kr">{t('extras.export.to')}</span><input className="inp fx-num" type="number" min={1} max={n} value={hi} onChange={e => setB(Math.max(1, Math.min(n, +e.target.value || n)))} /><small>{peek(ms[hi - 1])}</small></label>
      </div>
      <div className="fx-kv"><span>{t('extras.export.picked')}</span><i /><b>{String(part.length).padStart(3, '0')} / {String(n).padStart(3, '0')}</b></div>
      <div className="fx-kv"><span>{t('extras.export.chars')}</span><i /><b>{chars.toLocaleString()}</b></div>
    </div>
    {fmt !== 'jsonl' ? <label className="check"><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} /><i /><span>{t('extras.export.hidden')}</span></label> : <small className="hint">{t('extras.export.jsonlHint')}</small>}
    <div className="row end"><Btn label={t('extras.export.many')} ic="folder" cls="ghost" title={t('extras.export.manyHint')} onClick={many} /><Btn label={t('extras.export.go')} ic="import" cls="primary" onClick={run} /></div>
  </div>;
}
/** 여러 대화를 한 ZIP 으로 (대화마다 파일 하나) */
export async function exportMany(ids: string[], fmt: Fmt, hidden = false) {
  const chats = ids.map(id => S.get('chats', id)).filter((c): c is Chat => !!c); if (!chats.length) return;
  const enc = new TextEncoder(), used = new Set<string>(), files = [];
  for (const c of chats) {
    const ms = await S.msgs(c.id); let name = safeName(`${titleOf(c)} - ${String(c.name || '').trim() || new Date(c.createdAt).toISOString().slice(0, 10)}`), i = 2; const base = name;
    while (used.has(name)) name = `${base} (${i++})`; used.add(name);
    files.push({ name: `${name}.${EXT[fmt][0]}`, data: enc.encode(renderChat(c, ms, fmt, hidden)) });
  }
  download(`dreamland-chats-${new Date().toISOString().slice(0, 10)}.zip`, zip(files), 'application/zip');
  toast(t('extras.export.manyDone', { n: files.length }), 'ok');
}
export async function openExport(c: Chat) {
  const ms = await S.msgs(c.id);
  const m: ModalHandle = openModal({ title: t('extras.export.title'), body: <Dialog c={c} ms={ms} close={() => m.close()} /> });
}
