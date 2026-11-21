// Vertex 연결의 "Cloudflare 중계로 429 피하기" 안내 창: 워커 코드 복사 · 암호 만들기 · 주소 확인 · 이 연결에 쓰기
import { useState } from 'react';
import { Btn } from '../kit';
import { openModal, toast } from '../ui';
import type { Conn } from '../editors/types';
import { t } from '../i18n';
import { Secrets } from '../lib/core';
import code from '../../relay/cloudflare-worker.js?raw';

const STEPS = ['s1', 's2', 's3', 's4', 's5'];
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
/** 지금 주소가 중계 주소면 [워커 주소, 암호] */
const parse = (u?: string) => { const m = String(u || '').trim().match(/^(https:\/\/[^/]+\.workers\.dev)\/([^/]+)\/?$/i); return m ? [m[1], m[2]] : ['', '']; };

function Guide({ c, onSave, close }: { c: Conn; onSave: () => void; close: () => void }) {
  const [a0, k0] = parse(c.baseUrl);
  const [addr, setAddr] = useState(a0), [key, setKey] = useState(k0 || newKey()), [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  const base = addr.trim().replace(/\/+$/, '');
  const copy = async (s: string, msg: string) => { try { await navigator.clipboard.writeText(s); toast(msg, 'ok'); } catch { toast(t('conns.cf.copyFail'), 'err'); } };
  const test = async () => {
    if (!/^https:\/\//i.test(base)) return setOut({ ok: false, text: t('conns.cf.addrBad') });
    setOut({ ok: true, text: t('conns.cf.testing') });
    try {
      const j = await (await fetch(base + '/health', { cache: 'no-store' })).json() as { ok?: boolean; key?: boolean; colo?: string; country?: string };
      if (!j.ok) throw new Error('?');
      setOut(j.key ? { ok: true, text: t('conns.cf.testOk', { where: [j.colo, j.country].filter(Boolean).join(' · ') || '—' }) } : { ok: false, text: t('conns.cf.testNoKey') });
    } catch (e) { setOut({ ok: false, text: t('conns.cf.testFail', { err: e instanceof Error ? e.message : String(e) }) }); }
  };
  // 서버에 보관한 키는 정해 둔 주소(구글)로만 나간다: 이 워커 주소도 받게 한 번 다시 보관한다 (서버를 켠 PC 에서만 된다)
  const rehost = async (add: string | null) => {
    for (const f of ['apiKey', 'serviceAccount'] as const) {
      const v = c[f] as string | undefined; if (!v || !Secrets.is(v)) continue;
      const old = Secrets.items[c.id]?.[f]?.hosts || [], hosts = [...new Set([...old.filter(h => !/\.workers\.dev$/i.test(h)), ...(add ? [add] : [])])];
      if (hosts.join() === old.join()) continue;
      const value = await Secrets.reveal(c.id, f); (c as unknown as Record<string, string>)[f] = await Secrets.put(c.id, f, value, hosts, c.name);
    }
  };
  const apply = async () => {
    if (!/^https:\/\//i.test(base) || !key.trim()) return setOut({ ok: false, text: t('conns.cf.addrBad') });
    try { await rehost(new URL(base).hostname); } catch { return setOut({ ok: false, text: t('conns.cf.rekey') }); }
    c.baseUrl = base + '/' + key.trim(); onSave(); toast(t('conns.cf.applied'), 'ok'); close();
  };
  const remove = async () => { try { await rehost(null); } catch { /* 남겨 둬도 워커 주소로만 더 갈 수 있을 뿐 */ } c.baseUrl = ''; onSave(); toast(t('conns.cf.removed'), 'ok'); close(); };
  return <div className="col cf-guide">
    <p>{t('conns.cf.intro')}</p>
    <ol className="cf-steps">{STEPS.map(s => <li key={s}>{t('conns.cf.' + s)}</li>)}</ol>
    <div className="row"><Btn label={t('conns.cf.copyCode')} ic="copy" cls="primary" onClick={() => void copy(code, t('conns.cf.codeCopied'))} /><a className="btn ghost" href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">{t('conns.cf.openDash')}</a></div>
    <label className="field"><span className="field-label">{t('conns.cf.key')}</span>
      <div className="row"><input className="inp" value={key} spellCheck={false} onChange={e => setKey(e.target.value.replace(/[^\w-]/g, ''))} /><Btn label={t('conns.cf.copy')} ic="copy" cls="ghost" onClick={() => void copy(key, t('conns.cf.keyCopied'))} /><Btn label={t('conns.cf.keyMake')} ic="refresh" cls="ghost" onClick={() => setKey(newKey())} /></div>
      <small className="hint">{t('conns.cf.keyHint')}</small></label>
    <label className="field"><span className="field-label">{t('conns.cf.addr')}</span>
      <div className="row"><input className="inp" value={addr} placeholder="https://dreamland-relay.myname.workers.dev" spellCheck={false} onChange={e => setAddr(e.target.value.trim())} /><Btn label={t('conns.cf.test')} ic="play" cls="ghost" onClick={() => void test()} /></div></label>
    {out ? <p className={'hint ' + (out.ok ? 'ok' : 'bad')} role="status">{out.text}</p> : null}
    <p className="hint">{t('conns.cf.note')}</p>
    <div className="row"><Btn label={t('conns.cf.apply')} ic="check" cls="primary" onClick={() => void apply()} />{a0 ? <Btn label={t('conns.cf.remove')} ic="x" cls="ghost" onClick={() => void remove()} /> : null}</div>
  </div>;
}
export function cfRelayGuide(c: Conn, onSave: () => void) {
  const h = openModal({ title: t('conns.cf.title'), wide: true, body: <Guide c={c} onSave={onSave} close={() => h.close()} /> });
}
