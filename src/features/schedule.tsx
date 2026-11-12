// 일정: 주간 일정 편집 창 · 캐릭터 한 줄 · 기능 화면 › 일정 (옛 js/f-schedule.js 의 화면)
// 옛 모듈은 대화 화면(chat.js · live.js)이 계산에 쓰고 있어 그대로 두고, 화면을 여는 Schedule.edit · Schedule.row 만 React 판으로 바꿔 끼운다
import type { FeatureDef } from '../main';
import { B, NEEDS } from '../addons/legacy';
import { reactNode } from '../addons/parts';
import { old } from '../schedule/store';
import { ScheduleStudio, editSchedule, rowNode } from '../schedule/Editor';

function setup() {
  const X = B.X, Schedule = old();
  Schedule.edit = (ch, o) => editSchedule(ch, o);
  Schedule.row = (ch, onDone) => rowNode(ch, onDone);
  X.studio = X.studio.filter(t => t.owner !== 'schedule');
  X.studio.push({ owner: 'schedule', title: '일정', render: () => reactNode('schedule-studio', 'div.card.sched-studio', <ScheduleStudio />) });
}

export const feature: FeatureDef = { name: 'schedule', needs: [...NEEDS, 'clock', 'f-schedule'], setup };
