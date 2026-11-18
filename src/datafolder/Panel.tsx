// 설정 화면의 "자료 보관" 칸: 서버 폴더 저장 상태 · 백업 목록 · 지금 백업 · 복원 · 내려받기
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Btn, Icon } from '../kit';
import { confirmBox, toast } from '../ui';
import { t, tn, useLang } from '../i18n';
import { getMirror } from './instance';
import { Server } from '../lib/server';
import type { MirrorState } from './mirror';

interface Backup { name: string; at: number; kind: string; size: number }
const KINDS = ['daily', 'manual', 'pre-import', 'pre-delete', 'pre-restore'];
const OFF: MirrorState = { server: 'off', enabled: false, phase: 'idle', pending: 0, lastSync: 0, error: '', dir: '', pulled: 0, pushed: 0, conflicts: 0 };
const noop = () => () => { };

export function size(n: number) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB'; }
const when = (at: number) => { if (!at) return t('datafolder.never'); const d = new Date(at), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const errText = (e: unknown) => e instanceof Error ? e.message : String(e);

export function DataFolderCard() {
  useLang();
  const m = getMirror();
  const st = useSyncExternalStore(m ? m.subscribe : noop, m ? m.state : () => OFF);
  const [list, setList] = useState<Backup[] | null>(null), [info, setInfo] = useState<{ bytes: number; records: number; backups: { bytes: number } } | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([Server.get('store/backups', { cache: 'no-store' }), Server.get('store/status', { cache: 'no-store' })]);
      if (!a.ok || !b.ok) throw new Error(); setList(await a.json() as Backup[]); setInfo(await b.json() as { bytes: number; records: number; backups: { bytes: number } });
    } catch { setList(null); setInfo(null); }
  }, []);
  useEffect(() => { let alive = true; void load().then(() => { if (!alive) return; }); const iv = window.setInterval(() => { if (alive) void load(); }, 15000); return () => { alive = false; clearInterval(iv); }; }, [load, st.server]);

  const on = !!m && st.server === 'on';
  const label = !m || st.server === 'off' ? t('datafolder.state.unavailable') : !st.enabled ? t('datafolder.state.off') : st.phase === 'sync' ? t('datafolder.state.syncing') : st.phase === 'restore' ? t('datafolder.state.restoring') : t('datafolder.state.on');
  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { toast(errText(e), 'err'); } finally { setBusy(false); void load(); } };

  return <div className="card dl-keep"><h3 className="form-sec">{t('datafolder.title')}</h3>
    <div className="key-state wide"><Icon name="lock" size={15} /><b>{label}</b><span className="key-where">{on ? tn('datafolder.pending', st.pending) : t('datafolder.needServer')}</span></div>
    {on && <p className="hint">{t('datafolder.status', { when: when(st.lastSync), records: info?.records ?? '…', size: info ? size(info.bytes) : '…' })}{st.error ? ` · ${st.error}` : ''}</p>}
    {on && st.dir && <p className="hint dl-dir">{st.dir}</p>}
    {m && st.server !== 'off' && <label className="check"><input type="checkbox" checked={st.enabled} onChange={e => m.setEnabled(e.target.checked)} /><i /><span>{t('datafolder.enable')}</span></label>}
    {on && <>
      <div className="row wrap">
        <Btn label={t('datafolder.backupNow')} ic="check" cls="primary" onClick={() => run(async () => { await m.flush(); const r = await m.backupNow() as { backup?: { name: string } | null }; toast(r.backup ? t('datafolder.backedUp') : t('datafolder.nothingToBackup'), r.backup ? 'ok' : ''); })} />
        <Btn label={t('datafolder.syncNow')} ic="upload" cls="ghost" onClick={() => run(() => m.sync())} />
        <small className="hint">{t('datafolder.backups', { count: list?.length ?? 0, size: info ? size(info.backups.bytes) : '…' })}</small>
      </div>
      {list && list.length > 0 && <ul className="dl-bk">{list.map(b => <li key={b.name}>
        <span className="dl-bk-at">{when(b.at)}</span><span className="badge">{KINDS.includes(b.kind) ? t('datafolder.kind.' + b.kind) : b.kind}</span><span className="dl-bk-size">{size(b.size)}</span>
        <span className="dl-bk-act">
          <Btn label={t('datafolder.download')} cls="ghost" onClick={() => { const a = document.createElement('a'); a.href = Server.url('store/backup-file?name=' + encodeURIComponent(b.name)); a.download = 'dreamland-' + b.name; document.body.append(a); a.click(); a.remove(); }} />
          <Btn label={t('datafolder.restore')} cls="ghost" onClick={() => run(async () => { if (!(await confirmBox(t('datafolder.restoreConfirm', { when: when(b.at) }), t('datafolder.restore'), true))) return; await m.restore(b.name); })} />
        </span></li>)}</ul>}
      <p className="hint">{t('datafolder.help')}</p>
    </>}
  </div>;
}
