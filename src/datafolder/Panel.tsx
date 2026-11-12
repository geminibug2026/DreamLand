// 설정 화면의 "자료 보관" 칸: 서버 폴더 저장 상태 · 백업 목록 · 지금 백업 · 복원 · 내려받기
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Btn, Icon } from '../kit';
import { confirmBox, toast } from '../ui';
import { getMirror } from './instance';
import type { MirrorState } from './mirror';

interface Backup { name: string; at: number; kind: string; size: number }
const KIND: Record<string, string> = { daily: '하루', manual: '직접', 'pre-import': '가져오기 전', 'pre-delete': '대량 삭제 전', 'pre-restore': '복원 전' };
const OFF: MirrorState = { server: 'off', enabled: false, phase: 'idle', pending: 0, lastSync: 0, error: '', dir: '', pulled: 0, pushed: 0, conflicts: 0 };
const noop = () => () => { };

export function size(n: number) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB'; }
const when = (t: number) => { if (!t) return '아직 없음'; const d = new Date(t), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const errText = (e: unknown) => e instanceof Error ? e.message : String(e);

export function DataFolderCard() {
  const m = getMirror();
  const st = useSyncExternalStore(m ? m.subscribe : noop, m ? m.state : () => OFF);
  const [list, setList] = useState<Backup[] | null>(null), [info, setInfo] = useState<{ bytes: number; records: number; backups: { bytes: number } } | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch('/api/store/backups', { cache: 'no-store' }), fetch('/api/store/status', { cache: 'no-store' })]);
      if (!a.ok || !b.ok) throw new Error(); setList(await a.json() as Backup[]); setInfo(await b.json() as { bytes: number; records: number; backups: { bytes: number } });
    } catch { setList(null); setInfo(null); }
  }, []);
  useEffect(() => { let alive = true; void load().then(() => { if (!alive) return; }); const t = window.setInterval(() => { if (alive) void load(); }, 15000); return () => { alive = false; clearInterval(t); }; }, [load, st.server]);

  const on = !!m && st.server === 'on';
  const label = !m || st.server === 'off' ? '서버 폴더 저장을 쓸 수 없음' : !st.enabled ? '서버 폴더 저장 꺼짐' : st.phase === 'sync' ? '서버 폴더와 맞추는 중' : st.phase === 'restore' ? '복원하는 중' : '서버 폴더 저장 켜짐';
  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { toast(errText(e), 'err'); } finally { setBusy(false); void load(); } };

  return <div className="card dl-keep"><h3 className="form-sec">자료 보관</h3>
    <div className="key-state wide"><Icon name="lock" size={15} /><b>{label}</b><span className="key-where">{on ? `쌓인 것 ${st.pending}개` : '드림랜드 서버(start.bat)로 열어야 합니다'}</span></div>
    {on && <p className="hint">{`마지막 동기화 ${when(st.lastSync)} · 레코드 ${info?.records ?? '…'}개 · ${info ? size(info.bytes) : '…'}`}{st.error ? ` · ${st.error}` : ''}</p>}
    {on && st.dir && <p className="hint dl-dir">{st.dir}</p>}
    {m && st.server !== 'off' && <label className="check"><input type="checkbox" checked={st.enabled} onChange={e => m.setEnabled(e.target.checked)} /><i /><span>캐릭터 · 대화 · 설정을 서버의 자료 폴더에도 저장하기</span></label>}
    {on && <>
      <div className="row wrap">
        <Btn label="지금 백업" ic="check" cls="primary" onClick={() => run(async () => { await m.flush(); const r = await m.backupNow() as { backup?: { name: string } | null }; toast(r.backup ? '백업했어요' : '백업할 자료가 없어요', r.backup ? 'ok' : ''); })} />
        <Btn label="지금 맞추기" ic="upload" cls="ghost" onClick={() => run(() => m.sync())} />
        <small className="hint">{`백업 ${list?.length ?? 0}개 · ${info ? size(info.backups.bytes) : '…'}`}</small>
      </div>
      {list && list.length > 0 && <ul className="dl-bk">{list.map(b => <li key={b.name}>
        <span className="dl-bk-at">{when(b.at)}</span><span className="badge">{KIND[b.kind] || b.kind}</span><span className="dl-bk-size">{size(b.size)}</span>
        <span className="dl-bk-act">
          <Btn label="내려받기" cls="ghost" onClick={() => { const a = document.createElement('a'); a.href = '/api/store/backup-file?name=' + encodeURIComponent(b.name); a.download = 'dreamland-' + b.name; document.body.append(a); a.click(); a.remove(); }} />
          <Btn label="복원" cls="ghost" onClick={() => run(async () => { if (!(await confirmBox(`${when(b.at)} 백업으로 되돌릴까요? 바로 전에 지금 상태를 자동으로 백업합니다.`, '복원', true))) return; await m.restore(b.name); })} />
        </span></li>)}</ul>}
      <p className="hint">하루 한 번, 그리고 가져오기 · 대량 삭제 · 복원 직전에 자동으로 백업합니다. 최근 14일은 하루마다, 8주는 주마다, 6개월은 달마다 하나씩 남깁니다. API 키는 자료 폴더와 백업에 들어가지 않습니다.</p>
    </>}
  </div>;
}
