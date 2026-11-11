// 명장면 책갈피 — 드림랜드 예제 확장
// 메시지 메뉴(책갈피) · 장면 패널(모아 보기) · 명령어(/moments) · 저장소 · 스타일을 한 번씩 써 봅니다.
export function activate(api) {
  const { h } = api;
  let marks = {};                                   // { chatId: [{ id, text, who, at }] }
  const ready = api.store.get('marks', {}).then(v => { marks = v || {}; });
  const save = () => api.store.set('marks', marks);
  const listOf = chat => marks[chat?.id] || [];

  const paint = () => {                             // 책갈피가 꽂힌 메시지에 표시
    const { chat } = api.chat.current(); const ids = new Set(listOf(chat).map(m => m.id));
    document.querySelectorAll('.msg[data-id]').forEach(el => el.classList.toggle('moment', ids.has(el.dataset.id)));
  };
  const toggle = async (msg, chat) => {
    await ready;
    const list = marks[chat.id] ||= [];
    const i = list.findIndex(m => m.id === msg.id);
    if (i >= 0) { list.splice(i, 1); api.toast('책갈피를 뺐어요'); }
    else { list.push({ id: msg.id, who: msg.role === 'user' ? '나' : (msg.name || ''), text: msg.swipes[msg.sw].text.replace(/\s+/g, ' ').slice(0, 120), at: Date.now() }); api.toast('책갈피를 꽂았어요'); }
    await save(); api.chat.redraw(); paint();
  };

  api.style(`
    .msg.moment .msg-head b::after { content: " ♥"; color: var(--accent); }
    .moment-list { display: flex; flex-direction: column; gap: 6px; }
    .moment-item { text-align: left; padding: 9px 12px; border-radius: var(--r-xs); background: var(--surface2); font-size: .9em; line-height: 1.5; }
    .moment-item:hover { background: var(--soft); }
    .moment-item b { display: block; font-size: .85em; color: var(--accent); }
  `);

  api.messageAction({ label: '명장면 책갈피', icon: 'heart', run: toggle });

  api.panel({
    title: '명장면 책갈피', icon: 'heart',
    render: chat => {
      const list = listOf(chat);
      if (!list.length) return h('p.dim', '메시지의 ⋯ 메뉴에서 책갈피를 꽂아 보세요.');
      return h('div.moment-list', list.map(m => h('button.moment-item', { onclick: () => api.chat.scrollTo(m.id) }, h('b', m.who), m.text)));
    },
  });

  api.command('moments', { help: '이 대화의 명장면 책갈피를 엽니다', run: () => api.chat.openDrawer() });
  api.macro('moments', (args, ctx) => String(listOf(api.chat.current().chat).length));

  api.on('chat:open', () => ready.then(() => setTimeout(paint, 50)));
  api.on('message:received', () => setTimeout(paint, 50));
  ready.then(paint);
}
