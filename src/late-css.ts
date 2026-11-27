// 바깥 글꼴 CSS(media="print" data-late)를 받은 뒤에 화면에 붙인다: 받는 동안 첫 화면을 막지 않는다.
// 인터넷이 느리거나 막힌 곳(집 와이파이만 되는 폰 등)에서도 앱이 바로 뜨고, 글꼴은 받는 대로 바뀐다
for (const l of document.querySelectorAll<HTMLLinkElement>('link[data-late]')) {
  const on = () => { l.media = 'all'; };
  if (l.sheet) on(); else l.addEventListener('load', on, { once: true });
}
export { };
