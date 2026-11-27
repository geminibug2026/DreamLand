// 만화 페이지 · 세로 웹툰의 칸 고치기 (장면 수정 · 장면 편집이 함께 쓴다) + 카메라가 자세와 어긋날 때의 알림
import { Fld, Sel, Seg } from './parts';
import { PAGE_GRIDS, STRIP_HEIGHTS, gridFor } from './comic';
import { cameraIssue } from './framing';
import type { Scene } from './types';
import { t } from '../i18n';

type Page = NonNullable<Scene['page']>;
/** 칸들: 격자(만화) · 칸 높이(웹툰) · 칸 글 · 칸마다 보이는 인물. 고치면 onChange 로 새 페이지를 준다 */
export function PanelEditor({ page, format, onChange }: { page: Page; format?: string; onChange: (p: Page) => void }) {
  const webtoon = format === 'webtoon', grids = page.local && !webtoon ? PAGE_GRIDS[page.panels.length] : null, grid = gridFor(page as never)?.[0] ?? '';
  const set = (i: number, patch: Partial<Page['panels'][number]>) => onChange({ ...page, panels: page.panels.map((p, n) => n === i ? { ...p, ...patch } : p) });
  return <section className="sb-panels">
    <div className="sb-panels-head"><b>{t('scenebook.page.kind.' + (format || 'manga'))}</b><small>{t('scenebook.page.panelsN', { n: page.panels.length })}</small></div>
    <p className="hint">{t('scenebook.page.editHint')}</p>
    {grids ? <Fld label={t('scenebook.page.grid')}><Sel opts={grids.map(g => [g[0], t('scenebook.page.grid.' + g[0])])} value={grid} onChange={v => onChange({ ...page, grid: v })} /></Fld> : null}
    {page.layout ? <Fld label={t('scenebook.page.layoutText')}><textarea className="inp" rows={2} spellCheck={false} value={page.layout} onChange={e => onChange({ ...page, layout: e.target.value })} /></Fld> : null}
    {page.panels.map((p, i) => { const k = cameraIssue({ characters: p.characters }, p.text);
      return <div className="sb-panel" key={i}>
        {/* 칸 번호는 어느 칸을 고치는지 가리키는 데만 쓴다 (그림에는 붙지 않는다) */}
        <Fld label={t('scenebook.page.panelLabel', { n: i + 1 })}><textarea className="inp" rows={2} spellCheck={false} value={p.text} onChange={e => set(i, { text: e.target.value })} /></Fld>
        {k.issue ? <CameraWarn issue={k.issue} onFix={k.fix ? () => set(i, { text: k.fix }) : undefined} /> : null}
        {webtoon && page.local ? <div className="sb-shape"><span className="field-label">{t('scenebook.page.height')}</span><Seg label={t('scenebook.page.height')} choices={STRIP_HEIGHTS.map(h => [h, t('scenebook.page.height.' + h)])} value={p.height || 'medium'} onChange={v => set(i, { height: v })} /></div> : null}
        {p.characters.map((c, j) => <Fld key={j} cls="sb-panel-person" label={c.name || t('scenebook.person.n', { n: j + 1 })}><textarea className="inp" rows={2} spellCheck={false} value={c.prompt ?? ''} onChange={e => set(i, { characters: p.characters.map((x, n) => n === j ? { ...x, prompt: e.target.value } : x) })} /></Fld>)}
      </div>; })}
  </section>;
}
/** 카메라가 자세와 맞지 않을 때: 까닭 + (고칠 수 있으면) 바꾸기 단추 */
export function CameraWarn({ issue, onFix }: { issue: string; onFix?: () => void }) {
  return <p className="sb-cam-warn" role="status"><span>{t('scenebook.cam.warn.' + issue)}</span>{onFix ? <button type="button" className="btn ghost" onClick={onFix}>{t('scenebook.cam.fix')}</button> : null}</p>;
}
