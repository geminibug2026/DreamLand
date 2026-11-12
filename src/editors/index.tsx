// 편집 화면 묶음이 밖에 내놓는 것: 캐릭터 프로필 창 · 캐릭터 편집기 · 카드 가져오기
import { openModal, toast } from '../ui';
import { cards, core, pageRefresh } from './bridge';

export { charSheet } from './CharSheet';
export { charEditor } from './CharEditor';
export { LoreLinker, LorePicker, LoreSwitch, loreSettingsDialog, loreLinks, LORE_POS } from './lore';
export { PresetVarsEditor, ChatPanel as PresetVarsPanel } from './PresetVars';
export { chatPicker, roomLabel } from './ChatPicker';

/** 파일을 골라 가져온다. after 를 주지 않으면 지금 화면을 다시 그린다 */
export async function importDialog(accept = '.png,.json,.jsonl,.webp', after: () => void = pageRefresh) {
  const files = await core().pickFiles({ accept, multiple: true }); if (!files.length) return;
  const T = await cards().importFiles(files);
  toast(cards().summarize(T), T.errors.length ? 'err' : 'ok');
  if (T.errors.length) openModal({ title: '가져오지 못한 파일', body: <ul className="errs">{T.errors.map((e, i) => <li key={i}>{e}</li>)}</ul> });
  after();
}
