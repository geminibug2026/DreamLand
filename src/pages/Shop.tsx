// 서점: 바깥 사이트의 캐릭터 카드를 찾아 서가에 들이는 화면 (본체는 src/reach/shop/). 메뉴에는 없고 홈의 ⋯ · 명령 팔레트 · 이전 센터에서 들어온다
import { useCss } from '../addons/parts';
import { ShopPage } from '../reach/shop/Shop';

function Shop() { useCss('reach.css'); return <ShopPage />; }
export const page = { name: 'shop', Component: Shop };
