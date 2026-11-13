// 설정: 대화 화면 · 고급 포맷팅 · 상태 트래커 · 입력 도우미 · 보안 · 데이터
import { useEffect, useRef } from 'react';
import { Btn, Icon } from '../kit';
import { Form, PageHead, confirmBox, promptBox, toast } from '../ui';
import { useBump } from '../editors/parts';
import { playChime, ux } from '../features/usersettings';
import { DataFolderCard } from '../datafolder/Panel';
import { go } from '../lib/router';
import { errMsg } from '../editors/refresh';
import { S } from '../lib/core';
import * as theme from '../lib/theme';
import * as engine from '../lib/engine';
import * as core from '../lib/core';
import * as adv from '../lib/advanced';
import { LOCALES, getLang, setLang, t, tn, useLang } from '../i18n';

export const page = { name: 'settings', Component: SettingsPage };

const STORES = ['chars', 'chats', 'msgs', 'personas', 'lore', 'presets', 'conns', 'regex', 'kv', 'assets', 'mem'];

function SettingsPage() {
  useLang();
  const { Vault, Secrets, DB, download, pickFiles } = core, st = S.settings, F = adv.AF();
  (st as { termLog?: string }).termLog ||= 'brief';
  const refresh = useBump(), timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const apply = () => { S.set({}); theme.applyTheme(); };
  const kept = Object.values(Secrets.items).reduce((n, f) => n + Object.keys(f).length, 0);
  const manual = t('settings.format.manual');
  return <section className="pagebox">
    <PageHead eyebrow="settings" title={t('settings.title')} />
    <div className="card"><label className="field"><span className="field-label">{t('settings.language')}</span>
      <select className="inp" value={getLang()} onChange={e => setLang(e.target.value)}>{LOCALES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
      <small className="hint">{t('settings.languageHint')}</small></label>
      <p className="hint">{t('settings.languageHelp')}</p></div>
    <div className="card"><Form obj={st} defs={[{ section: t('settings.chat.section') }, { k: 'showMeta', label: t('settings.chat.showMeta'), type: 'check' }, { k: 'chatTruncation', label: t('settings.chat.truncation'), type: 'num', min: 0, max: 1000, step: 5, ph: '100', nullable: true, half: true, hint: t('settings.chat.truncationHint') }, { k: 'defaultMode', label: t('settings.chat.defaultMode'), type: 'select', opts: [['rp', t('settings.chat.modeRp')], ['talk', t('settings.chat.modeTalk')]], half: true }, { k: 'modes.talkTokens', label: t('settings.chat.talkTokens'), type: 'num', half: true },
      { k: 'modes.talkPrompt', label: t('settings.chat.talkPrompt'), type: 'area', rows: 4, ph: engine.TALK_DEFAULT, hint: t('settings.chat.talkPromptHint') },
      { k: 'modes.stagger', label: t('settings.chat.stagger'), type: 'check' }, { k: 'modes.commands', label: t('settings.chat.commands'), type: 'check' },
      { k: 'modes.presenceDelay', label: t('settings.chat.presenceDelay'), type: 'check' },
      { k: 'modes.scenes', label: t('settings.chat.scenes'), type: 'check' }, { k: 'modes.sceneStart', label: t('settings.chat.sceneStart'), type: 'check' },
      { k: 'modes.later', label: t('settings.chat.later'), type: 'check' }, { k: 'modes.away', label: t('settings.chat.away'), type: 'check' }, { k: 'modes.notify', label: t('settings.chat.notify'), type: 'check' },
      { k: 'modes.auto', label: t('settings.chat.auto'), type: 'check' }, { k: 'modes.autoMinutes', label: t('settings.chat.autoMinutes'), type: 'num', min: 1, half: true },
      { k: 'autoScroll', label: t('settings.chat.autoScroll'), type: 'check' }]} onChange={apply} />
      <p className="hint">{t('settings.chat.lookBefore')}<a href="#" onClick={e => { e.preventDefault(); go('themes'); }}>{t('settings.chat.lookLink')}</a>{t('settings.chat.lookAfter')}</p></div>
    <div className="card"><Form obj={st} defs={[{ section: t('settings.input.section') },
      { el: <label className="field"><span className="field-label">{t('settings.input.enterSend')}</span>
        <select className="inp" defaultValue={st.enterSend === 'auto' ? 'auto' : st.enterSend ? 'on' : 'off'} onChange={e => { const v = e.target.value; S.set({ enterSend: v === 'auto' ? 'auto' : v === 'on' }); }}>
          <option value="auto">{t('settings.input.enterAuto')}</option><option value="on">{t('settings.input.enterOn')}</option><option value="off">{t('settings.input.enterOff')}</option></select></label> },
      { k: 'ux.restoreInput', label: t('settings.input.restoreInput'), type: 'check' },
      { k: 'ux.mdKeys', label: t('settings.input.mdKeys'), type: 'check' }]} onChange={apply} /></div>
    <div className="card"><Form obj={st} defs={[{ section: t('settings.msg.section') },
      { k: 'ux.metaTime', label: t('settings.msg.metaTime'), type: 'check' }, { k: 'ux.showIds', label: t('settings.msg.showIds'), type: 'check' }, { k: 'ux.showAvatars', label: t('settings.msg.showAvatars'), type: 'check' },
      { k: 'ux.metaModel', label: t('settings.msg.metaModel'), type: 'check', hint: t('settings.msg.metaModelHint') }, { k: 'ux.metaTimer', label: t('settings.msg.metaTimer'), type: 'check' }, { k: 'ux.metaTokens', label: t('settings.msg.metaTokens'), type: 'check' },
      { k: 'ux.swipes', label: t('settings.msg.swipes'), type: 'check' },
      { k: 'ux.gestures', label: t('settings.msg.gestures'), type: 'check', hint: t('settings.msg.gesturesHint') },
      { k: 'ux.clickEdit', label: t('settings.msg.clickEdit'), type: 'check' },
      { k: 'ux.confirmDelete', label: t('settings.msg.confirmDelete'), type: 'check' }]} onChange={apply} /></div>
    <div className="card"><Form obj={st} defs={[{ section: t('settings.sound.section') },
      { k: 'ux.sound', label: t('settings.sound.sound'), type: 'check' }, { k: 'ux.soundUnfocused', label: t('settings.sound.unfocused'), type: 'check' },
      { k: 'ux.soundVolume', label: t('settings.sound.volume'), type: 'range', min: 0, max: 100, step: 5, half: true },
      { k: 'ux.toastPos', label: t('settings.sound.toastPos'), type: 'select', half: true, opts: [['bottom', t('settings.sound.posBottom')], ['bottom-left', t('settings.sound.posBottomLeft')], ['bottom-right', t('settings.sound.posBottomRight')], ['top', t('settings.sound.posTop')], ['top-left', t('settings.sound.posTopLeft')], ['top-right', t('settings.sound.posTopRight')]] }]} onChange={apply} />
      <div className="row wrap"><Btn label={t('settings.sound.test')} ic="volume" cls="ghost" onClick={() => { if (!playChime(ux().soundVolume)) toast(t('settings.sound.testFail'), 'err'); }} /></div></div>
    <div className="card"><Form obj={st} defs={[{ section: t('settings.start.section') },
      { k: 'ux.autoLoadChat', label: t('settings.start.autoLoadChat'), type: 'check' },
      { k: 'ux.logPrompts', label: t('settings.start.logPrompts'), type: 'check' }]} onChange={apply} /></div>
    <div className="card"><h3 className="form-sec">{t('settings.format.section')}</h3><p className="hint">{t('settings.format.hint')}</p>
      <div className="row wrap"><Btn label={t('settings.format.open')} ic="sliders" cls="primary" onClick={() => go('format')} /><small className="hint">{t('settings.format.summary', { context: F.context.name || manual, instruct: F.instruct.enabled ? F.instruct.name || manual : t('common.off'), reasoning: F.reasoning.name || manual })}</small></div></div>
    <div className="card"><Form obj={st} defs={[{ section: t('settings.tracker.section') }, { k: 'tracker.enabled', label: t('settings.tracker.enabled'), type: 'check' }, { k: 'tracker.mode', label: t('settings.tracker.mode'), type: 'select', opts: [['call', t('settings.tracker.modeCall')], ['inline', t('settings.tracker.modeInline')]] }, { k: 'tracker.hud', label: t('settings.tracker.hud'), type: 'check' }, { k: 'tracker.inject', label: t('settings.tracker.inject'), type: 'check' }, { k: 'tracker.fields', label: t('settings.tracker.fields'), type: 'area', rows: 5, hint: t('settings.tracker.fieldsHint') }]} onChange={apply} /></div>
    <div className="card"><Form obj={st} defs={[{ section: t('settings.helper.section') }, { k: 'translate.auto', label: t('settings.helper.translateAuto'), type: 'check' }, { k: 'translate.lang', label: t('settings.helper.translateLang'), half: true }, { k: 'userNameFallback', label: t('settings.helper.userNameFallback'), half: true }]} onChange={apply} />
      <div className="row wrap"><Btn label={t('settings.helper.quick')} ic="play" cls="ghost" onClick={() => go('quick')} /><small className="hint">{t('settings.helper.quickHint')}</small></div></div>
    <div className="card"><h3 className="form-sec">{t('settings.security.section')}</h3>
      <p className="hint">{Vault.on ? (Vault.locked ? t('settings.security.vaultLocked') : t('settings.security.vaultOn')) : t('settings.security.vaultOff')}</p>
      <div className="row wrap">
        {!Vault.on && <Btn label={t('settings.security.enable')} ic="check" cls="primary" onClick={async () => { const a = await promptBox(t('settings.security.newPass')); if (!a) return; const b = await promptBox(t('settings.security.repeatPass')); if (a !== b) return toast(t('settings.security.passMismatch'), 'err'); try { await Vault.enable(a); toast(t('settings.security.enabled'), 'ok'); refresh(); } catch (e) { toast(errMsg(e), 'err'); } }} />}
        {Vault.locked && <Btn label={t('settings.security.unlock')} ic="check" cls="primary" onClick={async () => { const p = await promptBox(t('settings.security.pass')); if (p == null) return; if (await Vault.unlock(p).catch(() => false)) { toast(t('settings.security.unlocked'), 'ok'); refresh(); } else toast(t('settings.security.wrongPass'), 'err'); }} />}
        {Vault.on && !Vault.locked && <Btn label={t('settings.security.disable')} cls="ghost" onClick={async () => { if (!(await confirmBox(t('settings.security.disableConfirm'), t('settings.security.disableOk'), true))) return; await Vault.disable(); refresh(); }} />}
      </div>
      <div className="key-state wide"><Icon name="lock" size={15} /><b>{Secrets.ok ? (Secrets.on ? t('settings.security.serverOn') : t('settings.security.serverOff')) : t('settings.security.serverNone')}</b><span className="key-where">{Secrets.ok ? tn('settings.security.kept', kept) : t('settings.security.needServer')}</span></div>
      <p className="hint">{t('settings.security.serverHint')}</p>
      {Secrets.ok ? <div className="row wrap">{Secrets.on
        ? <Btn label={t('settings.security.restore')} cls="ghost" onClick={async () => { if (!(await confirmBox(t('settings.security.restoreConfirm'), t('settings.security.restoreOk'), true))) return; try { await Secrets.restore(); st.security = { ...st.security, serverKeys: false }; S.set({}); toast(t('settings.security.restored')); refresh(); } catch (e) { toast(errMsg(e), 'err'); } }} />
        : <Btn label={t('settings.security.serverEnable')} ic="check" cls="primary" onClick={() => { st.security = { ...st.security, serverKeys: true }; S.set({}); toast(t('settings.security.serverMoving'), 'ok'); timer.current = window.setTimeout(refresh, 1500); }} />}</div> : null}
      <Form obj={st} defs={[{ k: 'security.blockRemoteImages', label: t('settings.security.blockRemoteImages'), type: 'check' }, { k: 'security.noFrames', label: t('settings.security.noFrames'), type: 'check', hint: t('settings.security.noFramesHint') }]} onChange={apply} />
      <p className="hint">{t('settings.security.htmlHint')}</p></div>
    <div className="card"><h3 className="form-sec">{t('settings.term.section')}</h3>
      <Form obj={st} defs={[{ k: 'termLog', label: t('settings.term.label'), type: 'select', opts: [['off', t('settings.term.off')], ['brief', t('settings.term.brief')], ['full', t('settings.term.full')]], hint: t('settings.term.hint') }]} onChange={apply} /></div>
    <div className="card"><h3 className="form-sec">{t('settings.data.section')}</h3><p className="hint">{t('settings.data.hint')}</p>
      <div className="row wrap">
        <Btn label={t('settings.data.export')} ic="import" onClick={async () => download(`dreamland-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await S.exportAll()))} />
        <Btn label={t('settings.data.restore')} ic="upload" onClick={async () => { const [f] = await pickFiles({ accept: '.json' }); if (!f) return; try { await S.importAll(JSON.parse(await f.text()), false); toast(t('settings.data.restored'), 'ok'); setTimeout(() => location.reload(), 700); } catch (e) { toast(errMsg(e), 'err'); } }} />
        <Btn label={t('settings.data.wipe')} ic="trash" cls="danger" onClick={async () => { if (!(await confirmBox(t('settings.data.wipeConfirm'), t('settings.data.wipeOk'), true))) return; for (const c of S.conns) await Secrets.del(c.id).catch(() => { }); for (const s of STORES) await DB.clear(s as Parameters<typeof DB.clear>[0]); location.reload(); }} />
      </div></div>
    <DataFolderCard />
  </section>;
}
