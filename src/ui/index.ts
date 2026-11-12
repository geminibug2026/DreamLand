// 공용 UI 부품 (옛 js/ui.js 의 React 판). 전부 여기서 가져다 쓴다: import { openModal, menu, Form, … } from '../ui';
//
// 창
//   const m = openModal({ title, body: <X close={() => m.close()} />, actions: [{ label: '취소' }, { label: '확인', cls: 'primary', onclick }], wide, onClose });
//     · m.close(), m.el(= .modal-wrap). 버튼의 onclick 이 false 를 돌려주면 닫지 않는다. 옛 DOM 은 body: <Dom node={el} /> 로.
//   <Modal title="…" actions={…} onClose={() => setOpen(false)}>…</Modal>   // 그려져 있는 동안 열려 있다
//   if (await confirmBox('지울까요?', '삭제', true)) …      const v = await promptBox('이름', '처음 값', { area, placeholder });   // 취소면 null
//   toast('저장했어요');  toast('실패', 'err');
// 메뉴
//   menu(e.currentTarget, [{ label, ic, hint, danger, onclick }, '-', 조건 && { … }]);
// 폼
//   <Form obj={o} defs={[{ section: '기본' }, { k: 'name', label: '이름', hint: '설명' }, { k: 'a.b', type: 'num', half: true }, { el: <직접 만든 것 /> }]} onChange={o => save(o)} />
//     · type: text(기본) password area num check select tags lines range color image. 그 밖에 ph rows min max step nullable opts half third count live.
//     · obj 를 그 자리에서 고치고 250ms 뒤(live 면 바로) onChange 를 부른다. 입력 칸은 처음 값만 obj 에서 읽는다 —
//       obj 가 다른 객체로 바뀌면 알아서 새로 만들고, 같은 객체를 밖에서 고쳤으면 key 를 바꿔 다시 만든다.
//   <TipBtn />   // 가까운 .check / .field 의 설명(.tip-text)을 펼치는 ? 단추
// 목록 + 편집기 2단 화면
//   <LibraryPage arg={arg} title="로어북" eyebrow="Lorebook" coll="lore" ic="book" create={newLore} label={o => o.name} sub={…} thumb={…} trail={(o, redraw) => …}
//     note={() => …} actions={[{ ic, title, onclick: draw => … }]} editor={(o, { redraw, save, reselect }) => <Editor o={o} … />} empty="…" />
//     · redraw: 목록만 다시. draw / reselect / 항목 고르기: 편집기까지 새로 만든다.
// 그 밖에
//   <PageHead eyebrow="Settings" title="설정">오른쪽 도구…</PageHead>     <TokBadge n={1234} />
//   const ref = useDragSort((from, to) => …);  <div ref={ref}>{rows.map(r => <div key=…><i className="grip" />…</div>)}</div>   // 줄은 바로 아래 자식이어야 한다
//   charPicker({ title, selected, multi, note: c => '꼬리표', onDone: ids => … });
export { Modal, openModal, confirmBox, promptBox, type ModalAction, type ModalHandle, type ModalProps } from './Modal';
export { toast } from './toast';
export { menu, type MenuItem } from './menu';
export { Form, TipBtn, installTipify, type FieldDef, type FormDefs } from './Form';
export { LibraryPage, type LibApi, type LibraryProps } from './LibraryPage';
export { PageHead, TokBadge } from './bits';
export { dragSort, useDragSort } from './dragSort';
export { charPicker, type CharPickerOptions } from './CharPicker';
