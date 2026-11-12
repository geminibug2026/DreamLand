// 설정: 대화 화면 · 고급 포맷팅 · 상태 트래커 · 입력 도우미 · 보안 · 데이터
import { useEffect, useRef } from 'react';
import { L } from '../legacy';
import { Btn, Icon } from '../kit';
import { Form, PageHead, confirmBox, promptBox, toast } from '../ui';
import { NEEDS, adv, core, engine, errMsg, store, theme } from '../editors/bridge';
import { useBump } from '../editors/parts';
import { playChime, ux } from '../features/usersettings';
import { DataFolderCard } from '../datafolder/Panel';

export const page = { name: 'settings', Component: SettingsPage, needs: NEEDS };

const STORES = ['chars', 'chats', 'msgs', 'personas', 'lore', 'presets', 'conns', 'regex', 'kv', 'assets', 'mem'];

function SettingsPage() {
  const S = store(), { Vault, Secrets, DB, download, pickFiles } = core(), st = S.settings, F = adv().AF();
  const refresh = useBump(), timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const apply = () => { S.set({}); theme().applyTheme(); };
  const kept = Object.values(Secrets.items).reduce((n, f) => n + Object.keys(f).length, 0);
  return <section className="pagebox">
    <PageHead eyebrow="settings" title="설정" />
    <div className="card"><Form obj={st} defs={[{ section: '대화 화면' }, { k: 'showMeta', label: '메시지에 모델·시간·토큰 표시', type: 'check' }, { k: 'defaultMode', label: '새 대화의 기본 모드', type: 'select', opts: [['rp', 'RP 모드 (소설처럼)'], ['talk', '대화 모드 (메신저처럼)']], half: true }, { k: 'modes.talkTokens', label: '대화 모드 최대 응답 토큰', type: 'num', half: true },
      { k: 'modes.talkPrompt', label: '대화 모드 지시문', type: 'area', rows: 4, ph: engine().TALK_DEFAULT, hint: '비워 두면 기본 지시문을 씁니다. 대화 모드는 프리셋의 프롬프트 블록 대신 이 지시문과 캐릭터 카드, 시각이 찍힌 기록으로 조립됩니다.' },
      { k: 'modes.stagger', label: '대화 모드: 말풍선을 한 줄씩 차례로 보여 주기', type: 'check' }, { k: 'modes.commands', label: '대화 모드: 캐릭터가 반응 · 상태 변경 · 셀카 · 기억 명령을 쓸 수 있게 하기', type: 'check' },
      { k: 'modes.presenceDelay', label: '대화 모드: 상태에 따라 답장을 늦추기 (자리 비움·방해 금지는 늦게, 오프라인은 답장 없음)', type: 'check' },
      { k: 'modes.scenes', label: '대화 모드: 만나거나 일이 벌어지면 장면으로 넘어가기 (캐릭터가 스스로 열 수 있음)', type: 'check' }, { k: 'modes.sceneStart', label: '대화 모드: 장면이 열리면 캐릭터가 바로 첫 장면을 쓰기', type: 'check' },
      { k: 'modes.later', label: '대화 모드: "이따 연락할게" 같은 약속을 기억했다가 그 시간에 먼저 연락하기', type: 'check' }, { k: 'modes.away', label: '대화 모드: 오래 자리를 비우면 그 사이에 온 연락 남겨 두기', type: 'check' }, { k: 'modes.notify', label: '대화 모드: 화면을 안 보고 있을 때 온 연락을 알림으로 받기', type: 'check' },
      { k: 'modes.auto', label: '대화 모드: 내가 조용하면 캐릭터가 먼저 말 걸기', type: 'check' }, { k: 'modes.autoMinutes', label: '몇 분 조용하면 (연달아 걸 때마다 두 배)', type: 'num', min: 1, half: true },
      { k: 'autoScroll', label: '답변을 따라 자동 스크롤', type: 'check' }]} onChange={apply} />
      <p className="hint">색·글꼴·말풍선 같은 겉모습은 <a href="#" onClick={e => { e.preventDefault(); L.ui.go('themes'); }}>꾸미기</a> 화면에서 바꿉니다.</p></div>
    <div className="card"><Form obj={st} defs={[{ section: '입력과 전송' },
      { el: <label className="field"><span className="field-label">Enter 키로 보내기</span>
        <select className="inp" defaultValue={st.enterSend === 'auto' ? 'auto' : st.enterSend ? 'on' : 'off'} onChange={e => { const v = e.target.value; S.set({ enterSend: v === 'auto' ? 'auto' : v === 'on' }); }}>
          <option value="auto">자동 — PC 에서는 Enter 로 보내고, 휴대폰에서는 줄바꿈</option><option value="on">항상 Enter 로 보내기 (Shift+Enter 줄바꿈)</option><option value="off">끄기 — Enter 는 줄바꿈, Ctrl+Enter 나 보내기 버튼으로 보내기</option></select></label> },
      { k: 'ux.restoreInput', label: '보내지 않고 남겨 둔 글을 새로 고친 뒤에도 입력창에 되살리기', type: 'check' },
      { k: 'ux.mdKeys', label: '서식 단축키 (입력창 · 메시지 수정에서 Ctrl+B 굵게, Ctrl+I 기울임, Ctrl+U 밑줄)', type: 'check' }]} onChange={apply} /></div>
    <div className="card"><Form obj={st} defs={[{ section: '메시지 표시와 동작' },
      { k: 'ux.metaTime', label: '메시지에 보낸 시각 표시', type: 'check' }, { k: 'ux.showIds', label: '메시지 번호 표시', type: 'check' }, { k: 'ux.showAvatars', label: '메시지 옆에 초상 표시', type: 'check' },
      { k: 'ux.metaModel', label: '모델 이름 표시', type: 'check', hint: '모델 · 걸린 시간 · 토큰 수는 위의 "메시지에 모델·시간·토큰 표시" 가 켜져 있을 때만 보입니다.' }, { k: 'ux.metaTimer', label: '답변에 걸린 시간 표시', type: 'check' }, { k: 'ux.metaTokens', label: '메시지 토큰 수 표시', type: 'check' },
      { k: 'ux.swipes', label: '답변 넘기기 (◀ ▶ 버튼과 방향키로 다른 답변 보기 · 새로 만들기)', type: 'check' },
      { k: 'ux.gestures', label: '휴대폰에서 마지막 답변을 옆으로 밀어 넘기기', type: 'check', hint: '왼쪽으로 밀면 다음 답변, 오른쪽으로 밀면 이전 답변입니다. 마지막 답변에서 더 넘기면 새 답변을 만듭니다.' },
      { k: 'ux.clickEdit', label: '메시지 본문을 누르면 바로 고치기', type: 'check' },
      { k: 'ux.confirmDelete', label: '메시지를 지우기 전에 물어보기', type: 'check' }]} onChange={apply} /></div>
    <div className="card"><Form obj={st} defs={[{ section: '소리와 알림' },
      { k: 'ux.sound', label: '답변이 오면 소리 내기', type: 'check' }, { k: 'ux.soundUnfocused', label: '이 창을 보고 있지 않을 때만 소리 내기', type: 'check' },
      { k: 'ux.soundVolume', label: '알림음 크기', type: 'range', min: 0, max: 100, step: 5, half: true },
      { k: 'ux.toastPos', label: '알림 글이 뜨는 자리', type: 'select', half: true, opts: [['bottom', '아래 가운데'], ['bottom-left', '아래 왼쪽'], ['bottom-right', '아래 오른쪽'], ['top', '위 가운데'], ['top-left', '위 왼쪽'], ['top-right', '위 오른쪽']] }]} onChange={apply} />
      <div className="row wrap"><Btn label="알림음 들어 보기" ic="volume" cls="ghost" onClick={() => { if (!playChime(ux().soundVolume)) toast('소리 크기가 0 이거나 이 브라우저에서 소리를 낼 수 없어요', 'err'); }} /></div></div>
    <div className="card"><Form obj={st} defs={[{ section: '시작과 진단' },
      { k: 'ux.autoLoadChat', label: '앱을 열 때 마지막으로 하던 대화 바로 열기', type: 'check' },
      { k: 'ux.logPrompts', label: '모델에 보내는 프롬프트를 브라우저 콘솔에 기록하기', type: 'check' }]} onChange={apply} /></div>
    <div className="card"><h3 className="form-sec">고급 포맷팅</h3><p className="hint">컨텍스트 템플릿(스토리 스트링) · 인스트럭트 템플릿 · 시스템 프롬프트 · 추론 서식 · 중단 문자열 · 응답 시작 문구는 한 화면에 모여 있습니다.</p>
      <div className="row wrap"><Btn label="고급 포맷팅 열기" ic="sliders" cls="primary" onClick={() => L.ui.go('format')} /><small className="hint">{`컨텍스트 ${F.context.name || '직접 설정'} · 인스트럭트 ${F.instruct.enabled ? F.instruct.name || '직접 설정' : '꺼짐'} · 추론 ${F.reasoning.name || '직접 설정'}`}</small></div></div>
    <div className="card"><Form obj={st} defs={[{ section: '상태 트래커' }, { k: 'tracker.enabled', label: '상태창 켜기 — 대화 위에 지금 상태를 띄웁니다', type: 'check' }, { k: 'tracker.mode', label: '상태를 갱신하는 방법', type: 'select', opts: [['call', '답변 뒤에 따로 묻기 (추가 호출 1회, 안정적)'], ['inline', '답변에 함께 적게 하기 (추가 호출 없음)']] }, { k: 'tracker.hud', label: '대화 화면 위에 상태창 보이기', type: 'check' }, { k: 'tracker.inject', label: '추적한 상태를 프롬프트에 넣기', type: 'check' }, { k: 'tracker.fields', label: '추적 항목', type: 'area', rows: 5, hint: '한 줄에 하나씩 "이름: 설명" 으로 적습니다. "호감도 (0-100): 설명" 처럼 범위를 적으면 막대로 보입니다.' }]} onChange={apply} /></div>
    <div className="card"><Form obj={st} defs={[{ section: '입력 도우미' }, { k: 'translate.auto', label: '답변이 오면 자동으로 번역해서 보여 주기 (추가 호출 1회)', type: 'check' }, { k: 'translate.lang', label: '번역 대상 언어', half: true }, { k: 'userNameFallback', label: '페르소나가 없을 때 이름', half: true }]} onChange={apply} />
      <div className="row wrap"><Btn label="빠른 버튼 세트 · 자동 진행 · 명령어" ic="play" cls="ghost" onClick={() => L.ui.go('quick')} /><small className="hint">입력창 위의 버튼은 세트로 묶어 캐릭터 · 대화방마다 다르게 둘 수 있습니다.</small></div></div>
    <div className="card"><h3 className="form-sec">보안</h3>
      <p className="hint">{Vault.on ? (Vault.locked ? 'API 키가 잠겨 있습니다. 잠금을 풀어야 모델을 호출할 수 있어요.' : 'API 키 · 서비스 계정 키 · NovelAI 키가 암호화되어 저장되고 있습니다.') : '암호를 걸면 API 키 · 서비스 계정 키 · NovelAI 키를 암호화해서 저장합니다. 앱을 열 때마다 암호를 한 번 입력합니다. 암호를 잊으면 키를 다시 넣어야 해요.'}</p>
      <div className="row wrap">
        {!Vault.on && <Btn label="키 잠금 켜기" ic="check" cls="primary" onClick={async () => { const a = await promptBox('새 잠금 암호 (8자 이상 권장)'); if (!a) return; const b = await promptBox('암호를 한 번 더 입력'); if (a !== b) return toast('두 암호가 달라요', 'err'); try { await Vault.enable(a); toast('키를 암호화했어요', 'ok'); refresh(); } catch (e) { toast(errMsg(e), 'err'); } }} />}
        {Vault.locked && <Btn label="잠금 풀기" ic="check" cls="primary" onClick={async () => { const p = await promptBox('잠금 암호'); if (p == null) return; if (await Vault.unlock(p).catch(() => false)) { toast('잠금을 풀었어요', 'ok'); refresh(); } else toast('암호가 맞지 않아요', 'err'); }} />}
        {Vault.on && !Vault.locked && <Btn label="키 잠금 끄기" cls="ghost" onClick={async () => { if (!(await confirmBox('키 잠금을 끄면 키가 다시 평문으로 저장됩니다. 끌까요?', '끄기', true))) return; await Vault.disable(); refresh(); }} />}
      </div>
      <div className="key-state wide"><Icon name="lock" size={15} /><b>{Secrets.ok ? (Secrets.on ? '키를 드림랜드 서버에 보관하는 중' : '서버 보관 꺼짐') : '서버 보관을 쓸 수 없음'}</b><span className="key-where">{Secrets.ok ? `보관된 키 ${kept}개` : '드림랜드 서버(start.bat)로 열어야 합니다'}</span></div>
      <p className="hint">API 키를 서버의 파일(data/secrets.json)에만 두고 브라우저에는 남기지 않습니다. 저장한 키는 화면에 다시 나오지 않고, 요청을 보낼 때 서버가 끼워 넣으며, 키를 넣을 때의 주소로만 보냅니다. 확장이나 가져온 카드가 키를 읽어 갈 수 없습니다.</p>
      {Secrets.ok ? <div className="row wrap">{Secrets.on
        ? <Btn label="서버 보관 끄고 키를 브라우저로 되돌리기" cls="ghost" onClick={async () => { if (!(await confirmBox('키를 서버에서 꺼내 이 브라우저에 다시 저장합니다. 서버를 실행한 PC 에서만 할 수 있어요. 계속할까요?', '되돌리기', true))) return; try { await Secrets.restore(); st.security = { ...st.security, serverKeys: false }; S.set({}); toast('키를 브라우저로 되돌렸어요'); refresh(); } catch (e) { toast(errMsg(e), 'err'); } }} />
        : <Btn label="서버 보관 켜기" ic="check" cls="primary" onClick={() => { st.security = { ...st.security, serverKeys: true }; S.set({}); toast('잠시 뒤 키가 서버 보관으로 옮겨집니다', 'ok'); timer.current = window.setTimeout(refresh, 1500); }} />}</div> : null}
      <Form obj={st} defs={[{ k: 'security.blockRemoteImages', label: '메시지 속 외부 이미지를 자동으로 불러오지 않기 (추적 방지)', type: 'check' }]} onChange={apply} />
      <p className="hint">메시지와 카드에 든 HTML 은 스크립트·이벤트 속성·폼을 걸러 낸 뒤 보여 줍니다. 확장은 모든 데이터에 접근할 수 있으니 믿을 수 있는 것만 켜세요. 다른 기기에서 접속(start-lan.bat)할 때는 실행 창에 표시되는 접속 키가 필요합니다.</p></div>
    <div className="card"><h3 className="form-sec">데이터</h3><p className="hint">모든 데이터는 이 브라우저의 저장소에 보관됩니다. 가끔 백업 파일을 받아 두세요.</p>
      <div className="row wrap">
        <Btn label="백업 내보내기" ic="import" onClick={async () => download(`dreamland-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await S.exportAll()))} />
        <Btn label="백업에서 복원" ic="upload" onClick={async () => { const [f] = await pickFiles({ accept: '.json' }); if (!f) return; try { await S.importAll(JSON.parse(await f.text()), false); toast('복원했어요. 화면을 새로 엽니다.', 'ok'); setTimeout(() => location.reload(), 700); } catch (e) { toast(errMsg(e), 'err'); } }} />
        <Btn label="모든 데이터 지우기" ic="trash" cls="danger" onClick={async () => { if (!(await confirmBox('캐릭터·대화·설정을 모두 지울까요? 되돌릴 수 없습니다.', '모두 지우기', true))) return; for (const c of S.conns) await Secrets.del(c.id).catch(() => { }); for (const s of STORES) await DB.clear(s); location.reload(); }} />
      </div></div>
    <DataFolderCard />
  </section>;
}
