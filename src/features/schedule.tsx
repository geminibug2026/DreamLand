// 일정: 주간 일정 편집 창 · 캐릭터 한 줄 · 기능 화면 › 일정 (옛 js/f-schedule.js 의 화면)
import type { FeatureDef } from '../main';
import { reactNode } from '../addons/parts';
import { ScheduleStudio } from '../schedule/Editor';
import { X } from '../lib/hooks';

function setup() {
  X.studio = X.studio.filter(t => t.owner !== 'schedule');
  X.studio.push({ owner: 'schedule', title: '일정', render: () => reactNode('schedule-studio', 'div.card.sched-studio', <ScheduleStudio />) });
}

export const feature: FeatureDef = { name: 'schedule', setup };
