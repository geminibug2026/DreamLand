// 정규식 가져오기 창 · 켜짐 묶음 창
import { useState } from 'react';
import { L } from '../legacy';
import { Btn, IconBtn } from '../kit';
import { S, core, menu, openModal, promptBox, toast, type Regex } from '../studio/bridge';
import { Cards, G, RX, clip, isAllowed, scName, scOwner, setAllow, sets, snapshot, type RegexSet, type Sc } from './lib';
import { pickChar, pickPreset } from './pick';

function Target({ to }: { to: { sc: Sc } }) {
  const [, bump] = useState(0), set = (sc: Sc) => { to.sc = sc; bump(n => n + 1); }, sc = to.sc;
  return <div className="rx-target">
    <button type="button" className={'chip' + (sc.kind === 'global' ? ' on' : '')} onClick={() => set(G)}>전역</button>
    <button type="button" className={'chip' + (sc.kind === 'preset' ? ' on' : '')} onClick={async () => { const id = await pickPreset('어느 프리셋에 넣을까요?'); if (id) set({ kind: 'preset', id }); }}>{sc.kind === 'preset' ? `프리셋 · ${scOwner(sc)}` : '프리셋…'}</button>
    <button type="button" className={'chip' + (sc.kind === 'char' ? ' on' : '')} onClick={async () => { const id = await pickChar('어느 캐릭터에 넣을까요?'); if (id) set({ kind: 'char', id }); }}>{sc.kind === 'char' ? `캐릭터 · ${scOwner(sc)}` : '캐릭터…'}</button>
  </div>;
}
/** 파일을 골라 정규식을 읽고, 넣을 범위를 물어 들여놓는다 */
export async function importFlow(defaultSc: Sc | null, after?: (to: Sc) => void) {
  const files = await core().pickFiles({ accept: '.json,application/json', multiple: true }); if (!files.length) return;
  const found: Regex[] = [], bad: string[] = [];
  for (const f of files) { try { const got = Cards().regexFromJson(JSON.parse(await f.text())); if (got.length) found.push(...got); else bad.push(f.name); } catch { bad.push(f.name); } }
  if (!found.length) return toast(`정규식을 찾지 못했어요${bad.length ? ` (${bad.slice(0, 3).join(', ')})` : ''}. 실리태번 정규식 JSON(낱개 · 묶음)이나 정규식이 실린 프리셋 · 캐릭터 카드 JSON 을 골라 주세요.`, 'err');
  const to = { sc: defaultSc || G };
  openModal({ title: `정규식 ${found.length}개를 어디에 넣을까요?`, box: 'col rx-import',
    actions: [{ label: '취소' }, { label: '가져오기', cls: 'primary', onclick: async () => { for (const r of found) await RX().Scope.add(to.sc, r); if (!isAllowed(to.sc)) setAllow(to.sc, true); toast(`${scName(to.sc)}에 정규식 ${found.length}개를 넣었어요`, 'ok'); after?.(to.sc); } }] },
  () => <><Target to={to} />{bad.length ? <small className="hint err">{`읽지 못한 파일: ${bad.join(', ')}`}</small> : null}
    <div className="rx-import-list">{found.slice(0, 60).map((r, i) => <div key={i}><b>{r.name}</b><code>{clip(r.find, 60)}</code></div>)}{found.length > 60 && <p className="dim">{`… 그리고 ${found.length - 60}개 더`}</p>}</div></>);
}

function Sets({ after }: { after?: () => void }) {
  const [, bump] = useState(0), draw = () => bump(n => n + 1);
  const put = (next: RegexSet[]) => { S().set({ regexSets: next }); draw(); };
  return <>
    <div className="rx-sets">{sets().map(s => <div className={'rx-set' + (S().settings.regexSet === s.id ? ' on' : '')} key={s.id}>
      <div className="rx-set-text"><b>{s.name}</b><small>{`켜짐 ${s.on.length}개 · 기억한 스크립트 ${s.known.length}개`}</small></div>
      <Btn label="적용" cls="primary" onClick={async () => { const n = await RX().applySet(s); toast(n ? `"${s.name}" 을 적용했어요 · ${n}개 바뀜` : `이미 "${s.name}" 과 같은 상태예요`, 'ok'); draw(); after?.(); }} />
      <IconBtn ic="more" title="더 보기" onClick={e => menu(e.currentTarget, [
        { label: '지금 상태로 덮어쓰기', ic: 'refresh', onclick: () => put(sets().map(x => (x.id === s.id ? { ...x, ...snapshot() } : x))) },
        { label: '이름 바꾸기', ic: 'edit', onclick: async () => { const name = (await promptBox('묶음 이름', s.name))?.trim(); if (name) put(sets().map(x => (x.id === s.id ? { ...x, name } : x))); } },
        { label: '삭제', ic: 'trash', danger: true, onclick: () => put(sets().filter(x => x.id !== s.id)) }])} />
    </div>)}{!sets().length && <p className="dim">아직 저장한 묶음이 없어요. 지금 켜고 꺼 둔 상태를 이름 붙여 저장하면, 나중에 한 번에 되돌릴 수 있습니다.</p>}</div>
    <Btn label="지금 상태를 새 묶음으로 저장" ic="plus" onClick={async () => { const name = (await promptBox('묶음 이름', ''))?.trim(); if (!name) return; put([...sets(), { id: L.core.uid(), name, ...snapshot() }]); }} />
    <small className="hint">묶음은 저장할 때 있던 스크립트의 켜짐 · 꺼짐만 바꿉니다. 그 뒤에 만든 스크립트는 건드리지 않아요.</small>
  </>;
}
/** 켜고 꺼 둔 상태를 저장해 두고 한 번에 바꾸는 창 */
export const setsDialog = (after?: () => void) => { openModal({ title: '켜짐 묶음', box: 'col' }, () => <Sets after={after} />); };
