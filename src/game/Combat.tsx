// 전투: 한 차례씩 주고받는다. 계산은 모두 앱이 하고, 끝나면 결과만 진행자에게 알린다
import { useState } from 'react';
import { t } from '../i18n';
import { DIFF_HIT, d, isPotion, type Fx, type GameCfg, type Sheet } from './state';

export interface FightResult { outcome: 'win' | 'lose' | 'fled'; rounds: number; took: number; hp: number; fx: Fx[] }
type End = '' | FightResult['outcome'];
interface Foe { name: string; hp: number; atk: number }
const Bar = ({ v, max }: { v: number; max: number }) => <span className="gm-bar"><i style={{ width: `${Math.max(0, Math.min(100, v / max * 100))}%` }} /></span>;

export function Combat({ g, sheet, foe, onDone }: { g: GameCfg; sheet: Sheet; foe: Foe; onDone(r: FightResult): void }) {
  const power = Math.max(g.stats.str, g.stats.dex), potions0 = sheet.items.filter(i => isPotion(i.name));
  const [st, setSt] = useState<{ hp: number; foe: number; round: number; log: string[]; used: string[]; end: End }>({ hp: Math.max(1, sheet.hp), foe: foe.hp, round: 0, log: [], used: [], end: '' });
  const left = (name: string) => (potions0.find(p => p.name === name)?.n || 0) - st.used.filter(u => u === name).length;
  const potion = potions0.find(p => left(p.name) > 0);

  /** 상대의 차례: 맞으면 피해를 입는다. 막는 중이면 잘 맞지 않고 덜 아프다 */
  const foeTurn = (hp: number, guard: boolean, log: string[]) => {
    const die = d(20), hit = die === 20 || (die !== 1 && die + foe.atk >= 10 + g.stats.dex + (guard ? 4 : 0));
    if (!hit) { log.push(t('game.fight.log.foeMiss', { name: foe.name })); return hp; }
    const dmg = Math.max(1, Math.round((d(4) + foe.atk / 2) * DIFF_HIT[g.diff] * (guard ? .5 : 1)));
    log.push(t('game.fight.log.foeHit', { name: foe.name, n: dmg })); return Math.max(0, hp - dmg);
  };
  const act = (kind: 'attack' | 'guard' | 'potion' | 'flee') => {
    if (st.end) return; const log: string[] = []; let { hp, foe: fhp } = st; const used = [...st.used]; let end: End = '';
    if (kind === 'attack') {
      const die = d(20), hit = die === 20 || (die !== 1 && die + power >= 10);
      if (hit) { const dmg = (d(6) + Math.max(0, power)) * (die === 20 ? 2 : 1); fhp = Math.max(0, fhp - dmg); log.push(t(die === 20 ? 'game.fight.log.crit' : 'game.fight.log.hit', { n: dmg })); } else log.push(t('game.fight.log.miss'));
    } else if (kind === 'guard') log.push(t('game.fight.log.guard'));
    else if (kind === 'potion' && potion) { const heal = d(8) + 2; hp = Math.min(sheet.hpMax, hp + heal); used.push(potion.name); log.push(t('game.fight.log.potion', { item: potion.name, n: heal })); }
    else if (kind === 'flee') { if (d(20) + g.stats.dex >= 12) { end = 'fled'; log.push(t('game.fight.log.fled')); } else log.push(t('game.fight.log.noFlee')); }
    if (fhp <= 0) end = 'win';
    if (!end) { hp = foeTurn(hp, kind === 'guard', log); if (hp <= 0) end = 'lose'; }
    setSt({ hp, foe: fhp, round: st.round + 1, log: [...st.log, ...log].slice(-6), used, end });
  };
  const finish = () => {
    if (!st.end) return;
    const fx: Fx[] = []; if (st.hp !== sheet.hp) fx.push({ k: 'hp', n: st.hp - sheet.hp });
    for (const name of new Set(st.used)) fx.push({ k: 'item', name, n: -st.used.filter(u => u === name).length });
    onDone({ outcome: st.end, rounds: st.round, took: Math.max(0, sheet.hp - st.hp), hp: st.hp, fx });
  };
  return <div className="gm-mini gm-fight">
    <div className="gm-sides">
      <div><small>{t('game.you')}</small><b>{st.hp}<i>/{sheet.hpMax}</i></b><Bar v={st.hp} max={sheet.hpMax} /></div>
      <div><small>{foe.name}</small><b>{st.foe}<i>/{foe.hp}</i></b><Bar v={st.foe} max={foe.hp} /></div>
    </div>
    <ol className="gm-log">{st.log.length ? st.log.map((l, i) => <li key={i}>{l}</li>) : <li className="dim">{t('game.fight.hint', { name: foe.name })}</li>}</ol>
    {st.end ? <div className="gm-done"><b className={`gm-verdict is-${st.end === 'win' ? 'win' : st.end === 'lose' ? 'lose' : 'draw'}`}>{t('game.fight.end.' + st.end)}</b><button type="button" className="btn primary" onClick={finish}>{t('game.mini.finish')}</button></div>
      : <div className="gm-acts">
        <button type="button" className="btn primary" onClick={() => act('attack')}>{t('game.fight.attack')}</button>
        <button type="button" className="btn" onClick={() => act('guard')}>{t('game.fight.guard')}</button>
        <button type="button" className="btn" disabled={!potion} onClick={() => act('potion')}>{potion ? `${potion.name} ×${left(potion.name)}` : t('game.fight.noPotion')}</button>
        <button type="button" className="btn ghost" onClick={() => act('flee')}>{t('game.fight.flee')}</button>
      </div>}
  </div>;
}
