// 몰입 소품: 답장 속 [[prop:종류|머리|본문]] 꼬리표를 드림랜드가 직접 그리는 종이 소품으로 바꾼다. 모델은 글만 내고 모양은 전부 여기서 정한다 (임의 HTML 을 받지 않는다)
import { hash, rng } from './text';

const KINDS = new Set(['letter', 'note', 'sms', 'news', 'sign', 'receipt', 'card']);
const TAG = /\[\[prop:\s*([a-z]+)\s*\|([^|\]\n]*)\|([\s\S]*?)\]\]/gi;
/** 꺾쇠는 모양이 비슷한 글자로 바꾼다 — 소품 안에 태그가 생기지 않게 (& 는 뒤의 렌더러가 처리한다) */
const safe = (s: string) => String(s).replace(/</g, '‹').replace(/>/g, '›').replace(/\u0000/g, '').trim();
const lines = (body: string) => body.split(/\s+\/\s+|\n+/).map(safe).filter(Boolean);
const svg = (w: number, h: number, cls: string, inner: string) => `<svg class="fx-art ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${inner}</svg>`;
const f1 = (n: number) => n.toFixed(1);

/** 소인: 겹고리와 물결 소인선. 씨앗에 따라 물결 수와 기울기가 다르다 */
function postmark(seed: number) {
  const r = rng(seed), tilt = Math.round(r() * 24 - 12), n = 3 + Math.floor(r() * 2);
  let w = ''; for (let i = 0; i < n; i++) { const y = 14 + i * 6; w += `<path class="t" d="M44 ${y}q5 -3 10 0t10 0t10 0t10 0"/>`; }
  return svg(88, 48, 'cr-pmark', `<g transform="rotate(${tilt} 24 24)"><circle cx="24" cy="24" r="17"/><circle class="t" cx="24" cy="24" r="12.5"/><path class="h" d="M12 24h24M24 12v24"/><circle class="f" cx="24" cy="24" r="1.4"/></g>${w}`);
}
/** 막대 부호: 글에서 뽑은 씨앗으로 굵기가 다른 세로줄 */
function barcode(seed: number) {
  const r = rng(seed); let x = 0, d = '';
  while (x < 118) { const w = r() < 0.3 ? 2.2 : r() < 0.6 ? 1.4 : 0.7; d += `<path d="M${f1(x)} 0v${r() < 0.12 ? 22 : 18}" style="stroke-width:${w}"/>`; x += w + 1.2 + r() * 2.2; }
  return svg(120, 22, 'cr-bars', d);
}
/** 간판을 매단 사슬 두 줄 */
const chains = () => svg(200, 18, 'cr-chain', [40, 160].map(x => `<path class="t" d="M${x} 0v18"/>` + [3, 9, 15].map(y => `<ellipse class="h" cx="${x}" cy="${y}" rx="2" ry="3"/>`).join('')).join(''));
/** 명함 귀퉁이의 작은 문양: 씨앗에 따라 살의 수가 다른 별꼴 */
function mark(seed: number) {
  const r = rng(seed), n = 5 + Math.floor(r() * 4), rot = r() * 60; let d = '';
  for (let i = 0; i < n; i++) { const a = (rot + i * 360 / n) * Math.PI / 180; d += `M${f1(14 + Math.cos(a) * 4)} ${f1(14 + Math.sin(a) * 4)}L${f1(14 + Math.cos(a) * 11)} ${f1(14 + Math.sin(a) * 11)}`; }
  return svg(28, 28, 'cr-mark', `<circle class="t" cx="14" cy="14" r="13"/><path d="${d}"/><circle class="f" cx="14" cy="14" r="1.3"/>`);
}

/** 값 읽기: "아메리카노 ... 4,500원" → 품목과 값. 숫자를 읽을 수 있으면 합계는 앱이 낸다 */
export function receiptRows(body: string): { rows: { item: string; price: string; n: number | null }[]; total: string } {
  const rows = lines(body).map(l => {
    const m = /^(.*?)(?:\s*[.·…]{2,}\s*|\s{2,}|\s+)(\S*\d[\d,.]*\S*)$/.exec(l);
    if (!m || !m[1].trim()) return { item: l, price: '', n: null };
    const num = m[2].replace(/[^\d.,]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'), n = Number(num);
    return { item: m[1].replace(/[\s.·…]+$/, ''), price: m[2], n: num && isFinite(n) ? n : null };
  });
  const priced = rows.filter(r => r.price), ok = priced.length > 0 && priced.every(r => r.n != null);
  if (!ok) return { rows, total: '' };
  const first = priced[0].price, pre = (/^[^\d]*/.exec(first) || [''])[0], post = (/[^\d.,]*$/.exec(first) || [''])[0], dec = priced.some(r => /[.,]\d{1,2}(?!\d)/.test(r.price.replace(/,(?=\d{3}\b)/g, ''))) ? 2 : 0;
  const sum = priced.reduce((a, r) => a + (r.n || 0), 0);
  return { rows, total: pre + sum.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post };
}

const D = (cls: string, inner: string) => `<div class="${cls}">${inner}</div>`;
const S = (cls: string, inner: string) => `<span class="${cls}">${inner}</span>`;
/** 소품 하나를 한 줄짜리 HTML 로 (렌더러가 빈 줄까지를 한 덩어리 HTML 로 다루므로 줄을 나누지 않는다) */
export function propHtml(kind: string, headIn: string, bodyIn: string, labels: Record<string, string> = {}): string {
  const head = safe(headIn), ls = lines(bodyIn), seed = hash(kind + head + bodyIn), L = (k: string, d: string) => safe(labels[k] || d);
  const lbl = S('fx-lbl cr-kind', L(kind, kind));
  switch (kind) {
    case 'letter': return D('cr-prop cr-letter fx-sheet fx-grain', D('cr-ptop', lbl + postmark(seed)) + (head ? D('cr-phead', head) : '') + D('cr-pbody', ls.join('<br>')) + D('cr-fold', ''));
    case 'note': return D('cr-prop cr-note fx-sheet', `<span class="cr-pin"></span>` + (head ? D('cr-phead', head) : '') + D('cr-pbody', ls.join('<br>')));
    case 'sms': {
      const first = (/^([^:：]{1,24})[:：]/.exec(ls[0] || '') || [])[1]?.trim();
      const rows = ls.map(l => { const m = /^([^:：]{1,24})[:：]\s*(.*)$/.exec(l); const who = m ? m[1].trim() : '', tx = m ? m[2] : l; return D('cr-sms-row' + (who && who !== first ? ' me' : ''), (who ? S('fx-lbl kr', who) : '') + S('cr-bub', tx)); }).join('');
      return D('cr-prop cr-sms', D('cr-ptop', lbl + (head ? S('cr-sms-head fx-num', head) : '') + S('cr-sig', '<i></i><i></i><i></i><i></i>')) + D('cr-sms-list', rows));
    }
    case 'news': return D('cr-prop cr-news fx-sheet fx-grain', D('cr-mast', S('cr-mast-name', head || L('news', 'news')) + S('fx-lbl', L('newsEd', 'late edition'))) + D('cr-headline', ls[0] || '') + (ls.length > 1 ? D('cr-cols', ls.slice(1).map(l => `<p>${l}</p>`).join('')) : ''));
    case 'sign': return D('cr-prop cr-signwrap', chains() + D('cr-sign fx-corners', (head ? D('cr-sign-head', head) : '') + ls.map((l, i) => D(i || head ? 'cr-sign-line' : 'cr-sign-head', l)).join('')));
    case 'receipt': {
      const { rows, total } = receiptRows(bodyIn);
      return D('cr-prop cr-receipt fx-sheet', D('cr-rc-shop', head || L('receipt', 'receipt')) + D('cr-rc-no fx-num', `No. ${String(seed % 100000).padStart(5, '0')}`) + D('fx-tear', '') + D('cr-rc-rows', rows.map(r => r.price ? D('fx-kv', S('', r.item) + '<i></i>' + `<b>${r.price}</b>`) : D('cr-rc-plain', r.item)).join(''))
        + (total ? D('fx-tear', '') + D('fx-kv cr-rc-total', S('fx-lbl ink', L('total', 'total')) + '<i></i>' + `<b>${safe(total)}</b>`) : '') + D('cr-rc-foot', barcode(seed)));
    }
    case 'card': return D('cr-prop cr-card fx-frame', mark(seed) + D('cr-card-name', ls[0] || head) + (ls[1] ? D('fx-lbl kr cr-card-title', ls[1]) : '') + (head && ls[0] ? D('cr-card-org', head) : '') + (ls.length > 2 ? D('cr-card-contact fx-num', ls.slice(2).join('<br>')) : ''));
    default: return '';
  }
}
/** 답장 글 속의 소품 꼬리표를 카드로. 아직 닫히지 않은 꼬리표(받는 중)는 가려 둔다 */
export function renderProps(text: string, labels: Record<string, string> = {}): string {
  if (text.indexOf('[[prop:') < 0) return text;
  let out = text.replace(TAG, (m, k: string, h: string, b: string) => { const kind = k.toLowerCase(); return KINDS.has(kind) && b.trim() ? `\n\n${propHtml(kind, h, b, labels)}\n\n` : m; });
  const open = out.lastIndexOf('[[prop:'); if (open >= 0 && out.indexOf(']]', open) < 0) out = out.slice(0, open) + `\n\n<div class="cr-prop cr-wait"><span class="fx-lbl">· · ·</span></div>`;
  return out;
}
/** 꼬리표를 걷어 낸 맨글 (조수에게 보내는 글 · 길이 비교에 쓴다) */
export const stripProps = (text: string) => text.replace(TAG, (_m, _k, h: string, b: string) => `${h ? h + ': ' : ''}${b}`);
/** 꼬리표를 이야기 속 글로: "(문자) 차유원 선배: …" — 기억 · 요약처럼 답장을 글로 읽는 곳이 쓴다. label 은 종류 이름을 준다 */
export const propsAsText = (text: string, label: (kind: string) => string = k => k): string => text.indexOf('[[prop:') < 0 ? text
  : text.replace(TAG, (_m, k: string, h: string, b: string) => `\n(${label(k.toLowerCase())}) ${h.trim() ? h.trim() + ': ' : ''}${b.trim()}\n`);
/** 꼬리표를 통째로 뺀 글 — 본문의 다른 줄만 봐야 하는 곳(상태창 찾기)에서 쓴다 */
export const dropProps = (text: string): string => text.indexOf('[[prop:') < 0 ? text : text.replace(TAG, '\n');
