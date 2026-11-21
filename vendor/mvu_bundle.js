// 변수 갱신 틀(MagVarUpdate) 묶음 자리: 카드가 원래 묶음 주소를 import 하면 이 빈 모듈을 받는다.
// 갱신 일은 앱(DreamLand)이 직접 맡고, Mvu 전역은 th-shim.js 가 미리 깔아 둔다.
export const Mvu = window.Mvu;
export default window.Mvu;
