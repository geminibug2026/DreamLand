// Vertex 연결의 "중계로 429 피하기" 안내 창 (Cloudflare 워커 · Vercel 함수): 코드 복사 또는 배포 단추 · 암호 만들기 · 주소 확인 · 이 연결에 쓰기
import { useState } from 'react';
import { Btn } from '../kit';
import { openModal, toast } from '../ui';
import type { Conn } from '../editors/types';
import { t } from '../i18n';
import { Secrets } from '../lib/core';
import code from '../../relay/cloudflare-worker.js?raw';

const STEPS = { cf: ['s1', 's2', 's3', 's4', 's5'], vc: ['v1', 'v2', 'v3'] } as const;
const RELAY_HOST = /\.(workers\.dev|vercel\.app)$/i;
/** Vercel 배포 단추: 이 저장소의 relay/vercel 폴더를 내 GitHub 에 복사해 미국 동부에 올린다. RELAY_KEY 를 물어본다 */
const VERCEL = 'https://vercel.com/new/clone?repository-url=' + encodeURIComponent('https://github.com/geminibug2026/DreamLand/tree/main/relay/vercel') + '&project-name=dreamland-relay&repository-name=dreamland-relay&env=RELAY_KEY&envDescription=' + encodeURIComponent('DreamLand relay password');
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
/** Vercel 판이 여는 지역 (relay/vercel/api/<지역>.js). 429 가 나면 앱이 이 순서로 넘어간다 */
const VC_REGIONS = ['iad1', 'pdx1', 'cle1', 'sfo1', 'fra1', 'lhr1'];
/** 지금 주소(여럿일 수 있다)에서 [중계 주소들, 암호] */
const parse = (u?: string): [string, string] => {
  const hosts: string[] = []; let key = '';
  for (const x of String(u || '').split(/[\s,]+/).filter(Boolean)) { const m = x.match(/^(https:\/\/[^/]+\.(?:workers\.dev|vercel\.app))(?:\/[a-z]{3}\d)?\/([^/]+)\/?$/i); if (m) { if (!hosts.includes(m[1])) hosts.push(m[1]); key ||= m[2]; } }
  return [hosts.join(' '), key];
};

function Guide({ c, onSave, close }: { c: Conn; onSave: () => void; close: () => void }) {
  const [a0, k0] = parse(c.baseUrl);
  const [kind, setKind] = useState<'cf' | 'vc'>(/vercel\.app/i.test(a0) ? 'vc' : 'cf');
  const [addr, setAddr] = useState(a0), [key, setKey] = useState(k0 || newKey()), [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  const bases = addr.split(/[\s,]+/).map(x => x.trim().replace(/\/+$/, '')).filter(Boolean), base = bases[0] || '';
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
      const old = Secrets.items[c.id]?.[f]?.hosts || [], hosts = [...new Set([...(add ? old : old.filter(h => !RELAY_HOST.test(h))), ...(add ? [add] : [])])];
      if (hosts.join() === old.join()) continue;
      const value = await Secrets.reveal(c.id, f); (c as unknown as Record<string, string>)[f] = await Secrets.put(c.id, f, value, hosts, c.name);
    }
  };
  const apply = async () => {
    if (!bases.length || bases.some(x => !/^https:\/\//i.test(x)) || !key.trim()) return setOut({ ok: false, text: t('conns.cf.addrBad') });
    try { for (const x of bases) await rehost(new URL(x).hostname); } catch { return setOut({ ok: false, text: t('conns.cf.rekey') }); }
    // Vercel 은 한 번 배포로 여러 지역이 열린다: 지역마다의 주소를 모두 적어 두면 429 가 날 때 앱이 다음 지역으로 넘어간다
    const k = key.trim(), list = bases.flatMap(x => /\.vercel\.app$/i.test(x) ? VC_REGIONS.map(r => `${x}/${r}/${k}`) : [`${x}/${k}`]);
    c.baseUrl = list.join(' '); onSave(); toast(t(list.length > 1 ? 'conns.cf.appliedMany' : 'conns.cf.applied', { n: list.length }), 'ok'); close();
  };
  const remove = async () => { try { await rehost(null); } catch { /* 남겨 둬도 워커 주소로만 더 갈 수 있을 뿐 */ } c.baseUrl = ''; onSave(); toast(t('conns.cf.removed'), 'ok'); close(); };
  return <div className="col cf-guide">
    <p>{t('conns.cf.intro')}</p>
    <div className="seg-row" role="tablist">{(['cf', 'vc'] as const).map(k => <button key={k} type="button" role="tab" aria-selected={kind === k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{t('conns.cf.kind.' + k)}</button>)}</div>
    <p className="hint">{t('conns.cf.kindHint.' + kind)}</p>
    <ol className="cf-steps">{STEPS[kind].map(s => <li key={s}>{t('conns.cf.' + s)}</li>)}</ol>
    <div className="row">{kind === 'cf'
      ? <><Btn label={t('conns.cf.copyCode')} ic="copy" cls="primary" onClick={() => void copy(code, t('conns.cf.codeCopied'))} /><a className="btn ghost" href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">{t('conns.cf.openDash')}</a></>
      : <><Btn label={t('conns.cf.copyKeyFirst')} ic="copy" cls="ghost" onClick={() => void copy(key, t('conns.cf.keyCopied'))} /><a className="btn primary" href={VERCEL} target="_blank" rel="noreferrer">{t('conns.cf.deployVercel')}</a></>}</div>
    <label className="field"><span className="field-label">{t('conns.cf.key')}</span>
      <div className="row"><input className="inp" value={key} spellCheck={false} onChange={e => setKey(e.target.value.replace(/[^\w-]/g, ''))} /><Btn label={t('conns.cf.copy')} ic="copy" cls="ghost" onClick={() => void copy(key, t('conns.cf.keyCopied'))} /><Btn label={t('conns.cf.keyMake')} ic="refresh" cls="ghost" onClick={() => setKey(newKey())} /></div>
      <small className="hint">{t('conns.cf.keyHint')}</small></label>
    <label className="field"><span className="field-label">{t('conns.cf.addr')}</span>
      <div className="row"><input className="inp" value={addr} placeholder={kind === 'cf' ? 'https://dreamland-relay.myname.workers.dev' : 'https://dreamland-relay.vercel.app'} spellCheck={false} onChange={e => setAddr(e.target.value)} /><Btn label={t('conns.cf.test')} ic="play" cls="ghost" onClick={() => void test()} /></div></label>
    <small className="hint">{t('conns.cf.addrHint.' + kind)}</small>
    {out ? <p className={'hint ' + (out.ok ? 'ok' : 'bad')} role="status">{out.text}</p> : null}
    <p className="hint">{t('conns.cf.note')}</p>
    <div className="row"><Btn label={t('conns.cf.apply')} ic="check" cls="primary" onClick={() => void apply()} />{a0 ? <Btn label={t('conns.cf.remove')} ic="x" cls="ghost" onClick={() => void remove()} /> : null}</div>
  </div>;
}
export function cfRelayGuide(c: Conn, onSave: () => void) {
  const h = openModal({ title: t('conns.cf.title'), wide: true, body: <Guide c={c} onSave={onSave} close={() => h.close()} /> });
}
