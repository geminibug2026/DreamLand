// ── Dreamland importer: 이식 센터 ──
import { S, h, pickFiles } from './core.js';
import { icon, btn, toast, registerPage, route, pageHead } from './ui.js';
import { bridge, bridgeSource, filesSource, scanST, importST, scanME, importME, importFiles, summarize } from './cards.js';

const KIND = {
  st: { name: 'SillyTavern', hint: '설치 폴더 또는 data/default-user 폴더', scan: scanST, run: importST,
    parts: [['chars', '캐릭터', i => i.chars.length], ['chats', '대화', i => i.chats.length], ['lore', '로어북', i => i.worlds.length], ['presets', '프리셋', i => i.presets.length], ['personas', '페르소나', i => i.personas], ['regex', '정규식', i => i.regex], ['quick', '빠른 답장', i => i.quick.length]] },
  marinara: { name: 'Marinara Engine', hint: '설치 폴더 또는 packages/server/data 폴더', scan: scanME, run: importME,
    parts: [['chars', '캐릭터', i => i.chars], ['chats', '대화', i => i.chats], ['lore', '로어북', i => i.lore], ['presets', '프리셋', i => i.presets], ['personas', '페르소나', i => i.personas], ['regex', '정규식', i => i.regex]] },
};

registerPage('import', async root => {
  const log = h('div.import-log');
  const say = (text, cls = '') => { log.prepend(h(`div.log-line${cls ? '.' + cls : ''}`, text)); };
  const stBox = h('div.src-list'), meBox = h('div.src-list');
  const boxes = { st: stBox, marinara: meBox };

  const sourceCard = (kind, src, label, sub) => {
    const K = KIND[kind];
    const body = h('div.src-body', h('p.dim', '살펴보는 중…'));
    const card = h('div.src', h('div.src-head', icon('folder', 18), h('div', h('b', label), h('small', sub))), body);
    (async () => {
      let inv;
      try { inv = await K.scan(src); } catch (e) { body.replaceChildren(h('p.err', '읽지 못했어요: ' + e.message)); return; }
      const want = {};
      const checks = K.parts.map(([key, name, count]) => {
        const n = count(inv); want[key] = n > 0;
        return h(`label.check.pill${n ? '' : '.dis'}`, h('input', { type: 'checkbox', checked: n > 0, disabled: !n, onchange: e => { want[key] = e.target.checked; } }), h('i'), h('span', name), h('em', String(n)));
      });
      const prog = h('div.progress', h('i'), h('span'));
      const go = btn('드림랜드로 옮겨 오기', { ic: 'sparkle', cls: 'primary', onclick: async () => {
        go.disabled = true; prog.classList.add('on');
        try {
          const T = await K.run(src, want, t => { prog.lastChild.textContent = t; });
          say(`${K.name} → ${summarize(T)}${T.skipped ? ` · 이미 있거나 비어 있어 건너뜀 ${T.skipped}` : ''}`, 'ok');
          for (const e of T.errors.slice(0, 20)) say(e, 'err');
          toast('이식을 마쳤어요', 'ok');
        } catch (e) { say(e.message, 'err'); toast(e.message, 'err'); }
        go.disabled = false; prog.classList.remove('on'); prog.lastChild.textContent = '';
      } });
      body.replaceChildren(h('div.pills', checks), h('div.row', go, prog));
    })();
    return card;
  };

  const manual = kind => {
    const inp = h('input.inp', { placeholder: KIND[kind].hint, value: S.settings.bridge[kind === 'st' ? 'st' : 'me'] || '', spellcheck: false });
    const find = async () => {
      const p = inp.value.trim().replace(/^"|"$/g, ''); if (!p) return;
      const found = (await bridge.resolve(p)).filter(r => r.kind === kind);
      if (!found.length) return toast(`그 위치에서 ${KIND[kind].name} 데이터를 찾지 못했어요`, 'err');
      S.set({ bridge: { ...S.settings.bridge, [kind === 'st' ? 'st' : 'me']: p } });
      for (const r of found) boxes[kind].append(sourceCard(kind, bridgeSource(r.root), r.label, r.root));
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
    return h('div.row.manual', inp, btn('찾기', { ic: 'search', onclick: find }), btn('폴더 고르기', { ic: 'folder', cls: 'ghost', onclick: async () => {
      const files = await pickFiles({ dir: true }); if (!files.length) return;
      const src = filesSource(files);
      if (!src || src.kind !== kind) return toast(`고른 폴더에서 ${KIND[kind].name} 데이터를 찾지 못했어요`, 'err');
      boxes[kind].append(sourceCard(kind, src, '선택한 폴더', src.label || ''));
    } }));
  };

  const drop = h('div.dropzone', { onclick: async () => handle(await pickFiles({ multiple: true, accept: '.png,.json,.jsonl,.webp' })) }, icon('import', 30), h('b', '파일을 끌어다 놓거나 눌러서 고르기'), h('span', '캐릭터 카드 PNG · JSON, 대화 JSONL, 로어북, 프리셋, 정규식, 마리나라 내보내기, 드림랜드 백업'));
  const handle = async files => { if (!files.length) return; const T = await importFiles(files, t => { drop.querySelector('span').textContent = t; }); say(`파일 ${files.length}개 → ${summarize(T)}`, T.errors.length ? '' : 'ok'); T.errors.forEach(e => say(e, 'err')); drop.querySelector('span').textContent = '종류는 자동으로 알아냅니다.'; toast(summarize(T), T.errors.length && !T.chars && !T.chats ? 'err' : 'ok'); };
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); handle([...e.dataTransfer.files]); });

  const hasBridge = await bridge.ok();
  const section = (kind, box) => h('div.card.import-card',
    h('h3.form-sec', KIND[kind].name),
    hasBridge ? box : h('p.dim', '로컬 서버 없이 열려 있어 자동 탐색은 쓸 수 없어요. 폴더를 직접 골라 주세요.'),
    manual(kind));

  if (route.page !== 'import') return; // 탐색하는 사이 다른 화면으로 이동했다면 그리지 않는다
  root.append(h('section.pagebox',
    pageHead('migrate', '이식 센터'),
    h('p.hint', '원본은 읽기만 하고 고치지 않습니다. API 키 같은 비밀 값은 가져오지 않아요. 같은 항목을 다시 옮기면 중복되지 않고 갱신됩니다.'),
    section('st', stBox), section('marinara', meBox),
    h('div.card.import-card', h('h3.form-sec', '파일로 가져오기'), drop),
    log));

  if (hasBridge) {
    const found = await bridge.detect();
    for (const kind of ['st', 'marinara']) {
      const list = found.filter(f => f.kind === kind);
      if (!list.length) boxes[kind].append(h('p.dim', '자동으로 찾은 설치가 없어요. 아래에 폴더 경로를 넣어 주세요.'));
      for (const f of list) boxes[kind].append(sourceCard(kind, bridgeSource(f.root), kind === 'st' ? `사용자 · ${f.label}` : f.label, f.root));
    }
  }
});
