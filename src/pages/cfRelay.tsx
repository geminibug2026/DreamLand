// Vertex 연결의 "중계로 429 피하기" 창: Vercel · Cloudflare · Supabase 중 하나를 골라 단계대로 → 암호 · 주소 → 이 연결에 쓰기
// 중계는 요청이 나가는 곳(지역)만 바꾼다. 키는 드림랜드가 붙여 보내므로 중계에 넣지 않아도 된다
import { useState, type ReactNode } from 'react';
import { Btn, Icon, IconBtn } from '../kit';
import { openModal, toast } from '../ui';
import type { Conn } from '../editors/types';
import { t } from '../i18n';
import { Secrets } from '../lib/core';
import oneRegionCode from '../../relay/cloudflare-worker.js?raw';
import supabaseCode from '../../relay/supabase/index.ts?raw';

type Kind = 'vc' | 'cf' | 'sb';
const RELAY_HOST = /\.(workers\.dev|vercel\.app|supabase\.co)$/i;
/** 주소 끝의 지역 칸: Vercel(iad1) · Cloudflare(enam) · Supabase(us-east-1) */
const REGION_SEG = /^([a-z]{3}\d|enam|wnam|weur|eeur|sam|oc|apac(-ne|-se)?|afr|me|[a-z]{2}-[a-z]+-\d)$/;
/** 지역 기본값 (중계가 /health 로 알려 주면 그쪽을 쓴다) */
const REGIONS: Record<Kind, string[]> = {
  vc: ['iad1', 'pdx1', 'cle1', 'sfo1', 'fra1', 'lhr1'],
  cf: ['enam', 'wnam', 'weur', 'eeur', 'sam', 'oc', 'apac'],
  sb: ['us-east-1', 'us-west-2', 'us-west-1', 'ca-central-1', 'eu-west-2', 'eu-central-1', 'eu-west-1', 'eu-west-3', 'sa-east-1', 'ap-southeast-2', 'ap-south-1', 'ap-southeast-1', 'ap-northeast-1'],
};
const LINK: Record<Kind, string> = {
  vc: 'https://vercel.com/new/clone?repository-url=' + encodeURIComponent('https://github.com/geminibug2026/DreamLand/tree/main/relay/vercel') + '&project-name=dreamland-relay&repository-name=dreamland-relay&env=RELAY_KEY&envDescription=' + encodeURIComponent('DreamLand relay password'),
  cf: 'https://deploy.workers.cloudflare.com/?url=' + encodeURIComponent('https://github.com/geminibug2026/DreamLand/tree/main/relay/cloudflare'),
  sb: 'https://supabase.com/dashboard/projects',
};
const PH: Record<Kind, string> = { vc: 'https://dreamland-relay.vercel.app', cf: 'https://dreamland-relay.myname.workers.dev', sb: 'https://abcd.supabase.co/functions/v1/relay' };
const kindOf = (u: string): Kind | null => /\.vercel\.app/i.test(u) ? 'vc' : /\.workers\.dev/i.test(u) ? 'cf' : /\.supabase\.co/i.test(u) ? 'sb' : null;
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
/** 지금 주소(여럿일 수 있다)에서 [중계 주소들, 암호]. 주소 끝은 /<지역>?/<암호> */
const parse = (u?: string): [string[], string] => {
  const bases: string[] = []; let key = '';
  for (const x of String(u || '').split(/[\s,]+/).filter(Boolean)) {
    let url: URL; try { url = new URL(x); } catch { continue; }
    if (url.protocol !== 'https:' || !RELAY_HOST.test(url.hostname)) continue;
    const segs = url.pathname.split('/').filter(Boolean), k = segs.pop() || ''; if (segs.length && REGION_SEG.test(segs[segs.length - 1])) segs.pop();
    const base = url.origin + (segs.length ? '/' + segs.join('/') : ''); if (!bases.includes(base)) bases.push(base); key ||= k;
  }
  return [bases, key];
};
interface Health { ok?: boolean; key?: boolean; colo?: string; country?: string; region?: string; regions?: string[] }
const health = async (base: string): Promise<Health> => { const r = await fetch(base + '/health', { cache: 'no-store' }); return await r.json() as Health; };

function Step({ n, children, act }: { n: number; children: ReactNode; act?: ReactNode }) {
  return <li className="rl-step"><span className="rl-n">{n}</span><div className="rl-step-b"><p>{children}</p>{act ? <div className="rl-act">{act}</div> : null}</div></li>;
}

function Guide({ c, onSave, close }: { c: Conn; onSave: () => void; close: () => void }) {
  const [b0, k0] = parse(c.baseUrl);
  const [kind, setKind] = useState<Kind>(kindOf(b0[0] || '') || 'vc');
  const [addr, setAddr] = useState(b0.join(' ')), [key, setKey] = useState(k0 || newKey());
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false);
  const bases = addr.split(/[\s,]+/).map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
  const copy = async (s: string, msg: string) => { try { await navigator.clipboard.writeText(s); toast(msg, 'ok'); } catch { toast(t('conns.cf.copyFail'), 'err'); } };
  const ext = (label: string, href: string, withKey = false) => <a className="btn primary sm" href={href} target="_blank" rel="noreferrer" onClick={() => { if (withKey) void copy(key, t('conns.cf.keyCopied')); }}><span>{label}</span><Icon name="link" size={14} /></a>;
  const keyBtn = <Btn label={t('conns.relay.copyKey')} ic="copy" cls="ghost sm" onClick={() => void copy(key, t('conns.cf.keyCopied'))} />;
  /** 등록할 주소: 주소마다 그 중계가 여는 지역을 모두 */
  const plan = async (): Promise<string[]> => {
    const k = key.trim(), list: string[] = [];
    for (const x of bases) {
      const kd = kindOf(x); let regions: string[] | null = kd === 'vc' ? REGIONS.vc : null;
      if (kd === 'cf' || kd === 'sb') { try { const h = await health(x); if (Array.isArray(h.regions) && h.regions.length) regions = h.regions; else if (kd === 'sb') regions = REGIONS.sb; } catch { regions = kd === 'sb' ? REGIONS.sb : null; } }
      if (regions) for (const r of regions) list.push(`${x}/${r}/${k}`); else list.push(`${x}/${k}`);   // 지역을 고를 수 없는 한 지역용 워커
    }
    return list;
  };
  const test = async () => {
    const base = bases[0]; if (!base || !/^https:\/\//i.test(base)) return setOut({ ok: false, text: t('conns.cf.addrBad') });
    setBusy(true); setOut({ ok: true, text: t('conns.cf.testing') });
    try {
      const h = await health(base); if (!h.ok) throw new Error('?');
      if (!h.key) return setOut({ ok: false, text: t('conns.cf.testNoKey') });
      const n = (await plan()).length;
      setOut({ ok: true, text: t('conns.relay.testOk', { n }) });
    } catch (e) { setOut({ ok: false, text: t('conns.cf.testFail', { err: e instanceof Error ? e.message : String(e) }) }); }
    finally { setBusy(false); }
  };
  // 서버에 보관한 키는 정해 둔 주소(구글)로만 나간다: 중계 주소도 받게 한 번 다시 보관한다 (서버를 켠 PC 에서만 된다)
  const rehost = async (add: string[] | null) => {
    for (const f of ['apiKey', 'serviceAccount'] as const) {
      const v = c[f] as string | undefined; if (!v || !Secrets.is(v)) continue;
      const old = Secrets.items[c.id]?.[f]?.hosts || [], hosts = [...new Set([...(add ? old : old.filter(h => !RELAY_HOST.test(h))), ...(add || [])])];
      if (hosts.join() === old.join()) continue;
      const value = await Secrets.reveal(c.id, f); (c as unknown as Record<string, string>)[f] = await Secrets.put(c.id, f, value, hosts, c.name);
    }
  };
  const apply = async () => {
    if (!bases.length || bases.some(x => !/^https:\/\//i.test(x) || !kindOf(x)) || !key.trim()) return setOut({ ok: false, text: t('conns.cf.addrBad') });
    setBusy(true);
    try {
      try { await rehost(bases.map(x => new URL(x).hostname)); } catch { return setOut({ ok: false, text: t('conns.cf.rekey') }); }
      const list = await plan();
      c.baseUrl = list.join(' '); onSave(); toast(t(list.length > 1 ? 'conns.cf.appliedMany' : 'conns.cf.applied', { n: list.length }), 'ok'); close();
    } finally { setBusy(false); }
  };
  const remove = async () => { try { await rehost(null); } catch { /* 남겨 둬도 중계 주소로만 더 갈 수 있을 뿐 */ } c.baseUrl = ''; onSave(); toast(t('conns.cf.removed'), 'ok'); close(); };

  const steps: Record<Kind, ReactNode> = {
    vc: <>
      <Step n={1} act={ext(t('conns.relay.deploy'), LINK.vc, true)}>{t('conns.relay.vc1')}</Step>
      <Step n={2}>{t('conns.relay.vc2')}</Step>
      <Step n={3}>{t('conns.relay.vc3')}</Step></>,
    cf: <>
      <Step n={1} act={ext(t('conns.relay.deploy'), LINK.cf)}>{t('conns.relay.cf1')}</Step>
      <Step n={2} act={keyBtn}>{t('conns.relay.cf2')}</Step>
      <Step n={3}>{t('conns.relay.cf3')}</Step></>,
    sb: <>
      <Step n={1} act={ext(t('conns.relay.openSb'), LINK.sb)}>{t('conns.relay.sb1')}</Step>
      <Step n={2} act={<Btn label={t('conns.relay.copyCode')} ic="copy" cls="ghost sm" onClick={() => void copy(supabaseCode, t('conns.relay.codeCopied'))} />}>{t('conns.relay.sb2')}</Step>
      <Step n={3}>{t('conns.relay.sb3')}</Step>
      <Step n={4} act={keyBtn}>{t('conns.relay.sb4')}</Step>
      <Step n={5}>{t('conns.relay.sb5')}</Step></>,
  };
  return <div className="rl">
    <p className="rl-lead">{t('conns.relay.lead')}</p>
    <div className="rl-kinds" role="tablist" aria-label={t('conns.relay.pick')}>
      {(['vc', 'cf', 'sb'] as const).map(k => <button key={k} type="button" role="tab" aria-selected={kind === k} className={'rl-kind' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
        <b>{t('conns.cf.kind.' + k)}</b><span>{t('conns.relay.where.' + k)}</span></button>)}
    </div>
    <ol className="rl-steps">{steps[kind]}</ol>
    {kind === 'cf' ? <details className="rl-more"><summary>{t('conns.relay.cfOld')}</summary>
      <ol className="rl-old">{(['s1', 's2', 's3', 's4', 's5'] as const).map(s => <li key={s}>{t('conns.cf.' + s)}</li>)}</ol>
      <Btn label={t('conns.cf.copyCode')} ic="copy" cls="ghost sm" onClick={() => void copy(oneRegionCode, t('conns.cf.codeCopied'))} /></details> : null}

    <div className="rl-fields">
      <label className="rl-field"><span>{t('conns.cf.key')}</span>
        <div className="rl-inrow"><input className="inp mono" value={key} spellCheck={false} autoComplete="off" onChange={e => setKey(e.target.value.replace(/[^\w-]/g, ''))} />
          <IconBtn ic="copy" title={t('conns.cf.copy')} onClick={() => void copy(key, t('conns.cf.keyCopied'))} /><IconBtn ic="refresh" title={t('conns.cf.keyMake')} onClick={() => setKey(newKey())} /></div>
        <small>{t('conns.relay.keyHint')}</small></label>
      <label className="rl-field"><span>{t('conns.cf.addr')}</span>
        <div className="rl-inrow"><input className="inp" value={addr} placeholder={PH[kind]} spellCheck={false} autoComplete="off" inputMode="url" onChange={e => { setAddr(e.target.value); setOut(null); }} />
          <Btn label={t('conns.cf.test')} ic="play" cls="ghost sm" onClick={() => void test()} /></div>
        <small>{t('conns.relay.addrHint')}</small></label>
      {out ? <p className={'rl-out ' + (out.ok ? 'ok' : 'bad')} role="status"><Icon name={out.ok ? 'check' : 'x'} size={14} /><span>{out.text}</span></p> : null}
    </div>

    <div className="rl-foot">
      <Btn label={busy ? t('conns.cf.testing') : t('conns.cf.apply')} ic="check" cls="primary" onClick={() => { if (!busy) void apply(); }} />
      {b0.length ? <Btn label={t('conns.cf.remove')} ic="x" cls="ghost" onClick={() => void remove()} /> : null}
    </div>
    <details className="rl-more"><summary>{t('conns.relay.know')}</summary>
      <ul className="rl-notes"><li>{t('conns.relay.know1')}</li><li>{t('conns.relay.know2')}</li><li>{t('conns.relay.know3')}</li></ul></details>
  </div>;
}
export function cfRelayGuide(c: Conn, onSave: () => void) {
  const h = openModal({ title: t('conns.cf.title'), wide: true, body: <Guide c={c} onSave={onSave} close={() => h.close()} /> });
}
