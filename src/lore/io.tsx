// 로어북을 글로 주고받기(Markdown · CSV)와 살펴보기(린트)의 창들. 계산은 text.ts · lint.ts 가 한다
import { useMemo, useRef, useState } from 'react';
import { Btn } from '../kit';
import { menu, openModal, toast, type ModalHandle } from '../ui';
import { S, download, newEntry, newLore, pickFiles } from '../lib/core';
import type { Lore, LoreEntry } from '../lib/types';
import { t } from '../i18n';
import { TEXT_MAX_BYTES, TEXT_MAX_ENTRIES, applyText, fromEntry, parseCsv, parseMarkdown, planImport, sniff, toCsv, toMarkdown, type DupMode, type TextBook } from './text';
import { lintBook, type LintEntry } from './lint';

const asText = (b: Lore): TextBook => ({ name: b.name, description: b.description || undefined, scanDepth: b.scanDepth, tokenBudget: b.tokenBudget, recursive: !!b.recursive, entries: (b.entries || []).map(e => fromEntry(e)) });
const safe = (s: string) => (s || 'lorebook').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
const pad = (n: number) => String(n).padStart(2, '0');

// ════════ 가져오기 ════════
function ImportBody({ b, done, close }: { b: Lore; done: () => void; close: () => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [src, setSrc] = useState<{ text: string; file: string } | null>(null), [mode, setMode] = useState<DupMode>('skip'), [into, setInto] = useState<'here' | 'books'>('here');
  const books = useMemo(() => { if (!src) return []; const kind = sniff(src.text, src.file); return kind === 'csv' ? parseCsv(src.text) : parseMarkdown(src.text); }, [src]);
  const count = books.reduce((n, x) => n + x.entries.length, 0), named = books.filter(x => x.name.trim()).length;
  // 넣을 곳마다의 계획: 이 책에 모두, 또는 글의 책 제목대로 (같은 이름의 책이 있으면 거기에, 없으면 새로)
  const plans = useMemo(() => (into === 'here' || !named ? [{ book: b as Lore | null, name: b.name, rows: planImport(b.entries || [], books.flatMap(x => x.entries), mode) }]
    : books.map(x => { const hit = x.name.trim() ? S.lore.find(l => l.name.trim().toLowerCase() === x.name.trim().toLowerCase()) || null : b; return { book: hit, name: hit?.name || x.name, src: x, rows: planImport(hit?.entries || [], x.entries, mode) }; })), [books, mode, into, named, b]);
  const all = plans.flatMap(p => p.rows.map(r => ({ ...r, to: p.name }))), stat = (s: string) => all.filter(r => r.status === s).length;
  const read = (text: string, file = '') => {
    if (text.length > TEXT_MAX_BYTES) return toast(t('loretext.tooBig'), 'err');
    setSrc({ text, file });
  };
  const pick = async () => { const [f] = await pickFiles({ accept: '.md,.markdown,.txt,.csv,.tsv,text/plain,text/markdown,text/csv' }); if (f) read(await f.text(), f.name); };
  const apply = async () => {
    if (count > TEXT_MAX_ENTRIES) return toast(t('loretext.tooMany', { max: TEXT_MAX_ENTRIES }), 'err');
    let added = 0, changed = 0;
    for (const p of plans) {
      const target = p.book || newLore({ name: p.name || t('loretext.newBook'), description: ('src' in p && p.src?.description) || '', ...('src' in p && p.src?.scanDepth != null ? { scanDepth: p.src.scanDepth } : {}), ...('src' in p && p.src?.tokenBudget != null ? { tokenBudget: p.src.tokenBudget } : {}) });
      target.entries ||= [];
      for (const r of p.rows) {
        if (r.status === 'skip') continue;
        if (r.status === 'overwrite' && target.entries[r.target]) { if (target.entries[r.target].locked) continue; applyText(target.entries[r.target], r.entry); changed++; }   // 잠근 항목은 덮어쓰지 않는다
        else { target.entries.push(applyText(newEntry(), r.entry, r.name) as LoreEntry); added++; }
      }
      if (p.rows.some(r => r.status !== 'skip')) await S.save('lore', target);
    }
    toast(t('loretext.done', { added, changed }), 'ok'); done(); close();
  };
  if (!src || !count) return <div className="gt-io">
    <p className="hint">{t('loretext.importHint')}</p>
    <textarea className="inp gt-paste" rows={9} ref={ta} placeholder={'# ' + t('loretext.ph.book') + '\n\n## ' + t('loretext.ph.entry') + '\nKeys: ' + t('loretext.ph.keys') + '\n\n' + t('loretext.ph.content')} aria-label={t('loretext.paste')} />
    {src && !count ? <p className="gt-note" role="status"><span className="fx-dot" /><span>{t('loretext.nothing')}</span></p> : null}
    <div className="row wrap"><Btn label={t('loretext.pickFile')} ic="upload" cls="ghost" onClick={() => void pick()} /><Btn label={t('loretext.preview')} ic="eye" cls="primary" onClick={() => read(ta.current?.value || '')} /></div>
  </div>;
  return <div className="gt-io">
    <div className="gt-facts wide">
      <span className="fx-kv"><span>{t('loretext.st.new')}</span><i /><b>{pad(stat('new'))}</b></span><span className="fx-kv"><span>{t('loretext.st.rename')}</span><i /><b>{pad(stat('rename'))}</b></span>
      <span className="fx-kv"><span>{t('loretext.st.overwrite')}</span><i /><b>{pad(stat('overwrite'))}</b></span><span className="fx-kv"><span>{t('loretext.st.skip')}</span><i /><b>{pad(stat('skip'))}</b></span>
    </div>
    <div className="gt-opts">
      <label className="field"><span className="field-label">{t('loretext.dup')}</span><select className="inp" value={mode} onChange={e => setMode(e.target.value as DupMode)}><option value="skip">{t('loretext.dup.skip')}</option><option value="rename">{t('loretext.dup.rename')}</option><option value="overwrite">{t('loretext.dup.overwrite')}</option></select></label>
      {named ? <label className="field"><span className="field-label">{t('loretext.into')}</span><select className="inp" value={into} onChange={e => setInto(e.target.value as 'here' | 'books')}><option value="here">{t('loretext.into.here', { name: b.name })}</option><option value="books">{t('loretext.into.books', { n: books.length })}</option></select></label> : null}
    </div>
    <div className="gt-list fx-rows" role="list">{all.slice(0, 200).map((r, i) => <div className={'gt-lrow' + (r.status === 'skip' ? ' off' : '')} role="listitem" key={i}>
      <span className="fx-num gt-no">{pad(i + 1)}</span>
      <div className="gt-what"><p>{r.name || r.entry.keys.slice(0, 3).join(', ') || t('lore.untitled')}</p><small><span>{r.to}</span>{r.entry.keys.length ? <code>{r.entry.keys.slice(0, 4).join(', ')}</code> : null}</small></div>
      <div className="gt-tags"><span className={'fx-pill' + (r.status === 'new' ? ' on' : '')}>{t('loretext.st.' + r.status)}</span></div><span className="fx-num gt-tok">{r.entry.content.length.toLocaleString()}</span></div>)}</div>
    {all.length > 200 ? <small className="hint">{t('loretext.more', { n: all.length - 200 })}</small> : null}
    <div className="row wrap end"><Btn label={t('loretext.back')} cls="ghost" onClick={() => setSrc(null)} /><Btn label={t('loretext.apply', { n: all.length - stat('skip') })} ic="check" cls="primary" onClick={() => void apply()} /></div>
  </div>;
}
/** 글로 주고받기 메뉴 (편집기 머리의 단추에서) */
export function loreTextMenu(anchor: Element, b: Lore, done: () => void) {
  menu(anchor, [
    { label: t('loretext.exportMd'), ic: 'note', onclick: () => download(safe(b.name) + '.md', toMarkdown([asText(b)]), 'text/markdown') },
    { label: t('loretext.exportCsv'), ic: 'note', onclick: () => download(safe(b.name) + '.csv', '﻿' + toCsv([asText(b)]), 'text/csv') },
    '-',
    { label: t('loretext.import'), ic: 'upload', onclick: () => { const m: ModalHandle = openModal({ title: t('loretext.importTitle'), wide: true, body: <ImportBody b={b} done={done} close={() => m.close()} /> }); } },
  ]);
}

// ════════ 살펴보기 ════════
function LintBody({ b, pick }: { b: Lore; pick: (id: string) => void }) {
  const rows = useMemo(() => lintBook((b.entries || []) as unknown as LintEntry[], !!b.wholeWord), [b]), byId = new Map((b.entries || []).map(e => [e.id, e]));
  const warn = rows.filter(r => r.level === 'warn').length;
  if (!rows.length) return <div className="fx-empty"><svg className="fx-art" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="19" className="t" /><path d="M19 29l6 6 12-14" className="fx-draw" pathLength={1} /></svg><p>{t('lorelint.clean')}</p></div>;
  return <div className="gt-io">
    <div className="gt-facts wide"><span className="fx-kv"><span>{t('lorelint.warn')}</span><i /><b>{pad(warn)}</b></span><span className="fx-kv"><span>{t('lorelint.info')}</span><i /><b>{pad(rows.length - warn)}</b></span></div>
    <div className="gt-list fx-rows" role="list">{rows.map((r, i) => { const e = byId.get(r.id);
      return <button type="button" className={'gt-lrow gt-lint fx-tap' + (r.level === 'info' ? ' off' : '')} role="listitem" key={i} onClick={() => pick(r.id)} title={t('lorelint.open')}>
        <span className="gt-mark" aria-hidden="true"><svg className="fx-art" viewBox="0 0 12 12" width="12" height="12">{r.level === 'warn' ? <path d="M6 1.5l5 9H1z" /> : <circle cx="6" cy="6" r="4.2" className="t" />}</svg></span>
        <div className="gt-what"><p>{e?.name || (e?.keys || []).slice(0, 3).join(', ') || t('lore.untitled')}</p><small><span>{t('lorelint.c.' + r.code)}</span>{r.detail ? <code>{r.detail}</code> : null}</small></div>
        <div className="gt-tags"><span className="fx-pill">{r.level === 'warn' ? t('lorelint.warn') : t('lorelint.info')}</span></div></button>; })}</div>
    <small className="hint">{t('lorelint.hint')}</small>
  </div>;
}
/** 살펴보기 창. pick(항목 id): 그 항목을 편집기에서 펼친다 */
export function loreLint(b: Lore, pick: (id: string) => void) {
  const m: ModalHandle = openModal({ title: t('lorelint.title', { name: b.name }), wide: true, body: <LintBody b={b} pick={id => { m.close(); pick(id); }} /> });
}
