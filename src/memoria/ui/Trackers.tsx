// 장기기억 — 날 세기 · D-day · 주기: 목록과 편집 상자 (세계 탭의 한 칸 · 인물 보기의 한 묶음이 함께 쓴다)
// 숫자를 적어 두지 않는다 — 저장한 날짜와 작중 오늘에서 그때그때 센다. 그래서 작중 날짜를 모르면 셀 수 없다
import { Btn } from '../../kit';
import { confirmBox, toast } from '../../ui';
import type { Tracker } from '../types';
import { isIsoDate } from '../calendar';
import { Ib, None, Sec, editBox, type StOpen } from './parts';
import { Memory } from '../../lib/memory';
import { t } from '../../i18n';

interface Draft { type: string; label: string; people: string[]; inject: string; start: string; firstDay: string; target: string; every: string; length: string; starts: string[] }
/** 날 세기 추가 · 고치기. seed: 새로 만들 때 미리 채울 칸 (인물 보기에서 그 사람을 넣어 준다) */
export async function editTracker(st: StOpen, tk?: Tracker, seed?: Partial<Tracker>) {
  const mem = st.mem, M = Memory, src: Partial<Tracker> = tk || seed || {}, today = M.storyToday(mem);
  const d = await editBox<Draft>(tk ? t('memoria.tracker.editTitle') : t('memoria.tracker.addTitle'),
    { type: src.type || 'count', label: src.label || '', people: [...(src.people || [])], inject: src.inject || 'present', start: src.start || '', firstDay: String(src.firstDay === 0 ? 0 : 1), target: src.target || '', every: src.every ? String(src.every) : '', length: src.length ? String(src.length) : '', starts: [...(src.starts || [])] }, [
      { k: 'type', label: t('memoria.tracker.f.type'), type: 'select', opts: [['count', t('memoria.tracker.type.count')], ['until', t('memoria.tracker.type.until')], ['cycle', t('memoria.tracker.type.cycle')]], half: true },
      { k: 'label', label: t('memoria.tracker.f.label'), half: true, ph: t('memoria.tracker.f.labelPh') },
      { k: 'people', label: t('memoria.tracker.f.people'), type: 'tags', half: true, ph: mem.cast.slice(0, 3).map(c => c.name).join(', '), hint: t('memoria.tracker.f.peopleHint') },
      { k: 'inject', label: t('memoria.tracker.f.inject'), type: 'select', opts: [['present', t('memoria.tracker.inject.present')], ['always', t('memoria.tracker.inject.always')], ['never', t('memoria.tracker.inject.never')]], half: true },
      { section: t('memoria.tracker.sec.count') },
      { k: 'start', label: t('memoria.tracker.f.start'), half: true, ph: today || '2024-10-18' }, { k: 'firstDay', label: t('memoria.tracker.f.firstDay'), type: 'select', opts: [['1', t('memoria.tracker.firstDay.one')], ['0', t('memoria.tracker.firstDay.zero')]], half: true },
      { section: t('memoria.tracker.sec.until') },
      { k: 'target', label: t('memoria.tracker.f.target'), ph: today || '2024-12-25' },
      { section: t('memoria.tracker.sec.cycle') },
      { k: 'every', label: t('memoria.tracker.f.every'), half: true, ph: '28' }, { k: 'length', label: t('memoria.tracker.f.length'), half: true, ph: '5' },
      { k: 'starts', label: t('memoria.tracker.f.starts'), type: 'tags', ph: today || '2024-10-18', hint: t('memoria.tracker.f.startsHint') },
    ], { wide: true });
  if (!d) return;
  const input: Partial<Tracker> = { type: d.type as Tracker['type'], label: d.label, people: d.people, inject: d.inject as Tracker['inject'], start: d.start.trim(), firstDay: d.firstDay === '0' ? 0 : 1, target: d.target.trim(), every: Number(d.every) || 0, length: Number(d.length) || 0, starts: d.starts.map(s => s.trim()) };
  // 엔진은 틀린 칸이 있으면 그냥 null 을 준다 — 무엇이 틀렸는지는 여기서 가려 알려 준다
  const bad = !d.label.trim() ? 'memoria.tracker.err.label' : d.type === 'count' && !isIsoDate(input.start) ? 'memoria.tracker.err.date' : d.type === 'until' && !isIsoDate(input.target) ? 'memoria.tracker.err.date'
    : d.type === 'cycle' && !(input.every! >= 1) ? 'memoria.tracker.err.every' : d.type === 'cycle' && input.starts!.some(s => !isIsoDate(s)) ? 'memoria.tracker.err.date' : '';
  if (bad) return toast(t(bad), 'err');
  const row = tk ? M.updateTracker(mem, tk.id, input) : M.addTracker(mem, input);
  if (!row) return toast(t(tk ? 'memoria.tracker.err.save' : 'memoria.tracker.err.full'), 'err');
  await M.save(mem); M.reinjectNow?.(st.chat); st.draw();
}

const TYPE_KEY: Record<string, string> = { count: 'memoria.tracker.type.count', until: 'memoria.tracker.type.until', cycle: 'memoria.tracker.type.cycle' };
/** 날 세기 줄들 — rows 를 주지 않으면 서고의 전부 */
export function TrackerRows({ st, rows }: { st: StOpen; rows?: { tracker: Tracker; text: string }[] }) {
  const mem = st.mem, M = Memory, list = rows || M.trackerRows(mem);
  const drop = async (tk: Tracker) => { if (!(await confirmBox(t('memoria.tracker.dropAsk', { label: tk.label }), t('common.delete'), true))) return; M.removeTracker(mem, tk.id); await M.save(mem); M.reinjectNow?.(st.chat); st.draw(); };
  const flip = async (tk: Tracker) => { M.updateTracker(mem, tk.id, { disabled: !tk.disabled }); await M.save(mem); M.reinjectNow?.(st.chat); st.draw(); };
  return <div className="mm-rows mm-tk">{list.map(({ tracker: tk, text }) => <div key={tk.id} className={`mm-row${tk.disabled ? ' off' : ''}`}>
    <div className="mm-row-text"><em className="mm-tag mm-tk-type">{t(TYPE_KEY[tk.type] || TYPE_KEY.count)}</em> <b>{tk.label}</b>{(tk.people || []).length ? <small>{tk.people!.join(' & ')}</small> : null}
      <span className="mm-tk-now">{text ? text.slice(text.indexOf(':') + 1).trim() : tk.disabled ? t('memoria.tracker.off') : t('memoria.tracker.unknown')}</span>
      <small className="mm-tk-when">{t('memoria.tracker.inject.' + (tk.inject || 'present'))}</small></div>
    <Ib name={tk.disabled ? 'eyeoff' : 'eye'} title={tk.disabled ? t('memoria.world.include') : t('memoria.world.excludeInj')} onClick={() => flip(tk)} /><Ib name="edit" title={t('common.edit')} onClick={() => editTracker(st, tk)} /><Ib name="trash" title={t('common.delete')} cls="del" onClick={() => drop(tk)} /></div>)}</div>;
}
/** 작중 날짜를 모를 때의 안내 — 도구 탭으로 보낸다 */
export function NoDateNote({ st }: { st: StOpen }) {
  if (Memory.storyToday(st.mem)) return null;
  return <p className="mm-tk-nodate"><span>{t('memoria.tracker.noDate')}</span><button type="button" className="btn ghost" onClick={() => { st.tab = 'tools'; st.draw(); }}>{t('memoria.tracker.toTools')}</button></p>;
}
/** 세계 탭의 「날 세기」 칸 */
export function TrackerSec({ st }: { st: StOpen }) {
  const mem = st.mem, today = Memory.storyToday(mem), n = (mem.trackers || []).length;
  return <Sec title={t('memoria.tracker.title')} desc={t('memoria.tracker.desc') + (today ? t('memoria.tracker.today', { date: today }) : '')} tools={<Btn label={t('common.add')} ic="plus" cls="ghost" title={t('memoria.tracker.addTitle')} onClick={() => void editTracker(st)} />}>
    {n ? <NoDateNote st={st} /> : null}{n ? <TrackerRows st={st} /> : <None text={t('memoria.tracker.empty')} />}
  </Sec>;
}
