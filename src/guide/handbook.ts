// 드림랜드 설명서: 어디서 무엇을 하는지 주제별 짧은 문단. 등불지기가 help_search 로 찾아 읽고, 도움말 화면이 사람에게 보여 준다
// 제목 · 본문은 로케일(guide.hb.<id>.t / .b)에 있다. 본문 속 {slot} 은 아래 LABELS 가 가리키는 실제 화면 라벨로 채운다 — 그래서 언어를 바꿔도, 라벨이 바뀌어도 설명서가 화면과 어긋나지 않는다
import { has, t } from '../i18n';
import type { Topic } from './types';

/** 본문에 끼워 넣는 화면 라벨: 자리 이름 → 로케일 열쇠 */
const LABELS: Record<string, string> = {
  home: 'nav.home', chat: 'nav.chat', lore: 'nav.lore', presets: 'nav.presets', personas: 'nav.personas', conns: 'nav.conns', studio: 'nav.studio', modules: 'nav.modules', diary: 'nav.diary', themes: 'nav.themes',
  format: 'nav.format', regex: 'nav.regex', qr: 'nav.qr', flow: 'nav.flow', exts: 'nav.exts', migrate: 'nav.import', settings: 'nav.settings', atlas: 'nav.atlas', help: 'nav.help',
  panel: 'chat.drawer.title', inspect: 'chat.drawer.inspect', note: 'chat.drawer.noteSec', vars: 'chat.drawer.varsSec', bg: 'chat.drawer.bgSec', cast: 'chat.drawer.castSec',
  tabTr: 'studio.tab.translate', tabIl: 'studio.tab.illust', tabAs: 'studio.tab.assets', tabHp: 'studio.tab.helpers', tabSc: 'studio.tab.schedule', tabEx: 'studio.tab.expressions', tabVec: 'studio.tab.vectors', tabMem: 'studio.tab.memoria', tabTts: 'studio.tab.tts',
  data: 'settings.data.section', export: 'settings.data.export', restore: 'settings.data.restore', backupNow: 'datafolder.backupNow', security: 'settings.security.section', tracker: 'settings.tracker.section',
  importCard: 'home.empty.importCard', game: 'game.mode', talk: 'chat.side.talk', profiles: 'flow.page.tabProfiles', auto: 'flow.page.tabAuto', direct: 'flow.page.tabDirect', name: 'guide.name', tour: 'guide.tour.name', stx: 'stx.menu',
};
/** 지금 언어의 라벨 묶음 (없는 열쇠는 자리 이름 그대로 — 설명서가 깨지지 않게) */
export const labels = (): Record<string, string> => Object.fromEntries(Object.entries(LABELS).map(([k, key]) => [k, has(key) ? t(key) : k]));

const T = (id: string, group: string, page: string | undefined, tags: string, arg?: string): Topic => ({ id, group, page, arg, tags });
/** 주제 목록. 차례가 곧 도움말 화면의 차례다 */
export const TOPICS: Topic[] = [
  T('start', 'start', 'home', '시작 처음 first start begin 开始 入门 quick'),
  T('conns', 'start', 'conns', '연결 api 키 key 모델 model provider 제공자 连接 密钥 openai claude gemini ollama mock 에코'),
  T('relay', 'start', 'conns', '429 너무 많은 요청 중계 relay cloudflare vercel 워커 worker 지역 region 리전 돌려쓰기 대체 연결 fallback 재시도 retry 자동 재시도 버텍스 vertex 限流 中继 重试 区域 备用连接'),
  T('keys', 'start', 'settings', '키 보안 금고 vault secret password 비밀번호 密钥 安全 server'),
  T('cards', 'start', 'home', '캐릭터 카드 가져오기 import png json charx chub 링크 link 角色卡 导入 만들기 create'),
  T('migrate', 'start', 'import', '이식 옮기기 sillytavern 실리태번 marinara 마리나라 migrate 迁移 import 폴더'),
  T('toSt', 'start', 'home', '실리태번 내보내기 이식 옮기기 역방향 되돌리기 sillytavern 실리 zip 시뮬 시뮬봇 sim export tavern helper mvu lalib 导出 酒馆 迁移'),
  T('editor', 'people', 'home', '캐릭터 편집 편집기 설명 성격 시나리오 인사말 예시 editor description greeting first message 编辑 开场白'),
  T('greetings', 'people', 'home', '인사말 첫 메시지 대체 alt greeting swipe 开场白 first'),
  T('personas', 'people', 'personas', '페르소나 나 persona user 사용자 用户 人设 기본'),
  T('folders', 'people', 'home', '폴더 태그 즐겨찾기 정렬 folder tag favorite sort 文件夹 标签'),
  T('modes', 'chat', 'chat', '모드 rp 톡 대화 게임 talk game mode 메신저 소설 模式 聊天 游戏'),
  T('messages', 'chat', 'chat', '메시지 스와이프 다시 생성 이어쓰기 편집 swipe regenerate continue edit 消息 重新生成'),
  T('branches', 'chat', 'chat', '분기 체크포인트 branch checkpoint 되감기 rewind 分支 检查点'),
  T('panel', 'chat', 'chat', '장면 패널 서랍 drawer scene panel 작가 노트 author note 변수 배경 侧栏 作者注释'),
  T('inspect', 'chat', 'chat', '프롬프트 살펴보기 인스펙터 inspector 토큰 token prompt 왜 why 提示词 检查'),
  T('group', 'chat', 'chat', '그룹 여러 캐릭터 group 순서 초대 群聊 多角色'),
  T('talk', 'chat', 'chat', '톡 대화 모드 먼저 연락 선톡 proactive 상태 일정 presence schedule 主动 消息 在线'),
  T('game', 'chat', 'chat', '게임 trpg gm 주사위 전투 가방 지도 dice combat bag map 游戏 骰子 战斗'),
  T('gamevars', 'chat', 'chat', '게임 mvu 상태창 변수 잇기 연동 시트 체력 은량 행낭 소지품 판정 능력치 game link sync variables stat_data sheet 游戏 变量 联动 状态栏 体力 银两'),
  T('commands', 'chat', 'chat', '명령 슬래시 slash command roll sys 주사위 stscript 命令'),
  T('lalib', 'chat', 'qr', 'lalib 확장 명령 /ife /elseif /whilee /foreach /map /reduce /getat /setat /try /catch /switch /swipes /message /wi 식 expression stscript 扩展 命令'),
  T('lore', 'world', 'lore', '로어북 월드 인포 world info lorebook 키워드 항목 entry keyword 世界书 条目'),
  T('lorelink', 'world', 'lore', '로어북 연결 전역 캐릭터 대화 global link 발동 activate 世界书 绑定 触发'),
  T('presets', 'prompt', 'presets', '프리셋 블록 온도 샘플러 preset block temperature sampler context 预设 温度 上下文'),
  T('effort', 'prompt', 'presets', '추론 강도 생각 과추론 thinking reasoning effort budget level gemini 추론만 思考 推理 强度'),
  T('pvars', 'prompt', 'presets', '프리셋 변수 설정 후 시작 고르기 선택지 {{이름}} 빈칸 preset variable setup slot 预设 变量 选项'),
  T('blocks', 'prompt', 'presets', '프롬프트 블록 순서 깊이 depth marker main jailbreak 조건 when 提示词 块 深度'),
  T('macros', 'prompt', 'presets', '매크로 macro {{char}} {{user}} getvar setvar random 변수 宏 变量'),
  T('regex', 'prompt', 'regex', '정규식 regex 스크립트 표시 display prompt store 바꾸기 正则'),
  T('format', 'prompt', 'format', '고급 포맷팅 instruct context template 텍스트 완성 text completion 高级格式'),
  T('flow', 'prompt', 'flow', '흐름 연결 프로필 자동 이어쓰기 자동 재생성 연출 지시 profile auto continue direct 流程 配置'),
  T('memory', 'features', 'studio', '장기기억 기억 memoria memory 요약 summary 사서 长期记忆 总结', 'memoria'),
  T('mvu', 'features', 'exts', 'mvu magvarupdate 상태창 변수 stat_data initvar zod 규칙 schema 상태 바 status bar vue tavern helper 스크립트 script 变量 状态栏'),
  T('vectors', 'features', 'studio', '벡터 검색 임베딩 자료 보관 data bank vector embedding rag 向量'),
  T('tracker', 'features', 'settings', '상태 트래커 hud tracker 시간 장소 기분 状态 追踪'),
  T('translate', 'features', 'studio', '번역 translate 자동 번역 翻译'),
  T('illust', 'features', 'studio', '삽화 그림 이미지 생성 novelai illustration image 插图 生成 scenebook'),
  T('voice', 'features', 'studio', '읽어 주기 tts 음성 전화 call phone voice 表情 expressions 표정 스프라이트 朗读 语音 通话'),
  T('diary', 'features', 'diary', '일기장 꿈 편지 약속 달력 기념품 diary dream promise calendar 日记 约定'),
  T('helpers', 'features', 'studio', '보조 연결 helper 싼 모델 작업별 연결 辅助 连接 cost 비용'),
  T('qr', 'features', 'qr', '퀵 리플라이 빠른 답장 버튼 quick reply button 快速回复'),
  T('modules', 'features', 'modules', '모듈 확장 플러그인 module extension plugin 模块 扩展 插件'),
  { id: 'extMake', group: 'features', page: 'exts', key: 'guide.ext.hb', tags: '확장 만들기 플러그인 만들기 확장 기능 실리태번 확장 sillytavern extension plugin make build create manifest index.js zip 설치 install /확장 扩展 插件 制作 酒馆' },
  T('themes', 'look', 'themes', '꾸미기 테마 색 글꼴 배경 css theme color font 主题 字体 颜色'),
  T('backup', 'data', 'settings', '백업 내보내기 복원 자료 폴더 backup export restore data folder 备份 恢复'),
  T('guide', 'guide', undefined, '등불지기 조수 assistant helper 변경 카드 되돌리기 undo change card 掌灯人 助手 撤销'),
  T('guideTips', 'guide', undefined, '@ 연결 칩 점검 검사 check 새캐릭터 캐릭터 페르소나 persona 빠른답장 qr stscript mvu 변수 진단 diagnose 왜 mention slash 检查 诊断 角色 人设 变量'),
  T('tour', 'guide', undefined, '둘러보기 첫걸음 안내 tour onboarding 다시 보기 导览 引导'),
];
export const GROUPS = ['start', 'people', 'chat', 'world', 'prompt', 'features', 'look', 'data', 'guide'];

export interface HelpRow { id: string; title: string; body: string; topic: Topic }
export function topicRow(tp: Topic): HelpRow { const L = labels(), k = tp.key || 'guide.hb.' + tp.id; return { id: tp.id, title: t(k + '.t', L), body: t(k + '.b', L), topic: tp }; }
export const topicText = (id: string) => { const tp = TOPICS.find(x => x.id === id); return tp ? (r => ({ id: r.id, title: r.title, text: r.body }))(topicRow(tp)) : null; };

/** 낱말이 제목 · 꼬리표 · 본문 어디에 걸리나에 따라 점수를 매겨 찾는다. 빈 물음이면 전부 */
export function searchHelp(query: string): HelpRow[] {
  const rows = TOPICS.map(topicRow), ws = query.toLowerCase().split(/[\s,.?!·]+/).filter(w => w.length > 0);
  if (!ws.length) return rows;
  const score = (r: HelpRow) => { let s = 0; const ti = r.title.toLowerCase(), tg = r.topic.tags.toLowerCase() + ' ' + r.id.toLowerCase(), bd = r.body.toLowerCase();
    for (const w of ws) { if (ti.includes(w)) s += 6; if (tg.includes(w)) s += 4; if (bd.includes(w)) s += 1; else if (w.length > 2 && (ti + tg + bd).includes(w.slice(0, -1))) s += .5; } return s; };
  return rows.map(r => ({ r, s: score(r) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.r);
}
