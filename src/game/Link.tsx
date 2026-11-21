// 게임 시트 ↔ 카드의 상태 변수(MVU) 잇기 화면: 시트의 「변수 잇기」 탭 · 시작 창의 한 줄 · 입력창 위의 권유.
// 계산은 vars.ts, 게임 일을 변수에 적는 것은 sync.ts 가 한다.
import { useEffect, useMemo, useState } from 'react';
import type { Chat } from '../lib/types';
import { S } from '../lib/core';
import { t } from '../i18n';
import { toast } from '../ui';
import { bump, cur, useCh } from '../chat/store';
import * as A from '../mvu/app';
import { gameOf, statsOf, statCfg, statVal, sheetOf, ruleOf, type GameCfg, type StatKey } from './state';
import { FIELDS, kindsFor, latestStat, leavesOf, linkOf, preview, readLinks, suggest, toRule, type LinkKey, type VarCfg, type VarLink } from './vars';

type Obj = Record<string, unknown>;
const userOf = (chat: Chat) => S.persona(chat)?.name || '';
const sign = (n: number) => (n >= 0 ? '+' : '') + n;
/** 이 대화가 상태 변수를 쓰는가 (탭을 보일지) */
export const linkable = (chat: Chat | null | undefined) => !!chat && A.usesMvu(chat);
const save = (chat: Chat) => { void S.save('chats', chat, true); bump('game'); };
/** 이어 둔 체력이 시작할 때의 최대 체력보다 크면 (최대 체력을 따로 잇지 않았을 때) 최대 체력을 그만큼으로 */
function fitMax(g: GameCfg, stat: unknown) { if (!g.vars || linkOf(g.vars, 'hpMax')) return; const r = readLinks(stat, g.vars); if (r.hp !== undefined && r.hp > g.hpMax) g.hpMax = Math.round(r.hp); }

/** 새 게임을 시작할 때: 추천대로 이어 둔다 (변수가 아직 없으면 나중에 권한다) */
export function startLinks(chat: Chat, g: GameCfg) {
  const st = latestStat(cur.chat === chat ? cur.msgs : []); if (!st) return;
  const links = suggest(st, statsOf(g), userOf(chat)); if (!links.length) return;
  g.vars = { links }; fitMax(g, st);
}
/** 시작 창의 한 줄: 켜 두면 시작할 때 추천대로 잇는다 */
export function SetupLink({ chat, g, on, setOn }: { chat: Chat; g: GameCfg; on: boolean; setOn(v: boolean): void }) {
  const st = latestStat(cur.chat === chat ? cur.msgs : []), sug = useMemo(() => st ? suggest(st, statsOf(g), userOf(chat)) : [], [st, g.rule]);
  if (!linkable(chat)) return null;
  return <div className="gm-sec g2-vlink-setup">
    <label className="gm-check"><input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} />{t('game.vars.setup')}</label>
    <small className="hint g2-sub">{sug.length ? t('game.vars.setupFound', { list: sug.slice(0, 5).map(l => `${label(l.key)} → ${l.path}`).join(' · ') }) : t('game.vars.setupNone')}</small>
  </div>;
}
/** 입력창 위: 상태 변수가 있는데 아직 정하지 않았으면 잇기를 권한다 */
export function LinkOffer({ chat, open }: { chat: Chat; open(): void }) {
  // 입력창과 함께 자주 다시 그려지므로 최근 메시지 몇 개만 본다 (변수 갱신 틀은 최근 메시지에 변수를 남긴다)
  const g = gameOf(chat); if (!g || g.vars || cur.chat !== chat || !latestStat(cur.msgs.slice(-40))) return null;
  return <button type="button" className="g2-vlink-offer" onClick={open}><b>{t('game.vars.offer')}</b><small>{t('game.vars.offerHint')}</small></button>;
}

function label(key: LinkKey): string {
  if (key.startsWith('stat.')) return t('game.stat.' + key.slice(5));
  if (key.startsWith('bond.')) return t('game.vars.f.bond', { name: key.slice(5) });
  return t('game.vars.f.' + key);
}
/** 시트의 「변수 잇기」 탭 */
export function LinkTab({ chat, onDone }: { chat: Chat; onDone?: () => void }) {
  useCh('game');
  const g = gameOf(chat)!, [stat, setStat] = useState<Obj | null>(() => latestStat(cur.chat === chat ? cur.msgs : [])), [ready, setReady] = useState(!!stat);
  useEffect(() => { if (stat) return; let live = true; void A.initOf(chat).then(r => { if (live && r.updated) setStat(r.data.stat_data as Obj); }).catch(() => { }).finally(() => { if (live) setReady(true); }); return () => { live = false; }; }, [chat.id]);
  const leaves = useMemo(() => leavesOf(stat), [stat]), stats = statsOf(g);
  const sug = useMemo(() => stat ? suggest(stat, stats, userOf(chat)) : [], [stat, g.rule]);
  const [links, setLinks] = useState<VarLink[]>(() => g.vars?.links || []), [show, setShow] = useState<string[]>(() => g.vars?.show || []);
  // 아직 정한 적이 없으면 추천으로 채워 둔다 (저장해야 이어진다)
  useEffect(() => { if (!g.vars && sug.length && !links.length) setLinks(sug); }, [sug]);
  if (!ready) return <p className="dim">{t('game.vars.loading')}</p>;
  if (!stat) return <div className="gm-sec"><p className="hint">{t('game.vars.noData')}</p></div>;
  const pathOfKey = (k: LinkKey) => links.find(l => l.key === k)?.path || '';
  const put = (k: LinkKey, path: string) => setLinks([...links.filter(l => l.key !== k), ...(path ? [{ key: k, path }] : [])]);
  const bonds = [...new Set([...links, ...sug].filter(l => l.key.startsWith('bond.')).map(l => l.key))];
  const keys: LinkKey[] = [...FIELDS, ...stats.map(k => `stat.${k}` as LinkKey), ...bonds];
  const cfg: VarCfg = { links }, r = readLinks(stat, cfg), rule = ruleOf(g);
  const keep = (ls: VarLink[]) => {
    g.vars = { links: ls.filter(l => l.path), ...(show.length ? { show: show.slice(0, 4) } : {}) }; fitMax(g, stat); save(chat);
    toast(ls.length ? t('game.vars.saved', { n: g.vars.links.length }) : t('game.vars.off'), 'ok'); onDone?.();
  };
  const sh = sheetOf(g, cur.chat === chat ? cur.msgs : []);
  return <div className="gm-sec g2-vlink">
    <p className="hint">{t('game.vars.about')}</p>
    {(() => {
      // 이어 둔 칸을 먼저 보이고, 나머지는 「다른 칸도 잇기」 안에 접어 둔다 (처음 보는 사람에게 열두 칸을 한꺼번에 내밀지 않게)
      const row = (k: LinkKey) => {
        const kinds = kindsFor(k), opts = leaves.filter(l => kinds.includes(l.kind)), now = pathOfKey(k), stat0 = k.startsWith('stat.') ? r.stats[k.slice(5) as StatKey] : undefined;
        if (!opts.length && !now) return null;
        return <label key={k} className="field g2-vlink-row"><span className="field-label">{label(k)}{sug.some(l => l.key === k && l.path === now) && now ? <em className="g2-vlink-tag">{t('game.vars.suggested')}</em> : null}</span>
          <select className="inp" value={now} onChange={e => put(k, e.target.value)}>
            <option value="">{t('game.vars.none')}</option>
            {now && !opts.some(l => l.path === now) ? <option value={now}>{now}</option> : null}
            {opts.map(l => <option key={l.path} value={l.path}>{l.path} = {preview(l.v)}</option>)}
          </select>
          {stat0 !== undefined ? <small className="hint">{t('game.vars.statAs', { v: stat0, n: rule === 'd20' || rule === '2d6' ? sign(toRule(rule, stat0)) : toRule(rule, stat0) })}</small> : null}
        </label>;
      };
      const on = keys.filter(k => pathOfKey(k)), off = keys.filter(k => !pathOfKey(k)).map(row).filter(Boolean);
      return <>
        {on.length ? <div className="g2-vlink-rows">{on.map(row)}</div> : <p className="hint">{t('game.vars.nothing')}</p>}
        {off.length ? <details className="g2-vlink-more" open={!on.length}><summary>{t('game.vars.more', { n: off.length })}</summary><div className="g2-vlink-rows">{off}</div></details> : null}
      </>;
    })()}
    {leaves.some(l => l.kind !== 'obj') ? <details className="g2-vlink-show"><summary>{t('game.vars.show', { n: show.length })}</summary>
      <p className="hint">{t('game.vars.showHint')}</p>
      <div className="g2-vlink-pins">{leaves.filter(l => l.kind !== 'obj').slice(0, 120).map(l => <label key={l.path} className="gm-check"><input type="checkbox" checked={show.includes(l.path)} disabled={!show.includes(l.path) && show.length >= 4} onChange={e => setShow(e.target.checked ? [...show, l.path] : show.filter(x => x !== l.path))} /><span>{l.path} = {preview(l.v)}</span></label>)}</div>
    </details> : null}
    <p className="hint g2-vlink-rule">{t('game.vars.rule')}</p>
    {g.vars?.links.length ? <p className="hint">{t('game.vars.nowStats', { list: stats.map(k => { const v = statVal(statCfg(g, sh), k); return `${t('game.stat.' + k)} ${rule === 'd20' || rule === '2d6' ? sign(v) : v}${sh.vlab?.[k] ? '*' : ''}`; }).join(' · ') })}</p> : null}
    <div className="gm-foot">
      {sug.length ? <button type="button" className="btn sm" onClick={() => setLinks(sug)}>{t('game.vars.useSuggested')}</button> : null}
      <button type="button" className="btn sm ghost" onClick={() => { setLinks([]); keep([]); }}>{t('game.vars.unlink')}</button>
      <button type="button" className="btn primary" onClick={() => keep(links)}>{t('game.vars.save')}</button>
    </div>
  </div>;
}
