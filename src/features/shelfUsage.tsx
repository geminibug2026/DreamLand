// 프리셋 · 페르소나 사용 기록: 고를 때(설정의 activePreset · activePersona 가 바뀔 때)와 대화에 실제로 쓰일 때(생성 시작) 시각 · 횟수를 남긴다
import { L } from '../legacy';
import { markUsed } from '../ui';

interface UseStore { settings: Record<string, unknown>; presetFor?(chat: unknown): { id: string } | undefined; persona?(chat: unknown): { id: string } | undefined }

function setup() {
  const S = L.core.S as unknown as UseStore;
  L.core.on('settings', d => {
    const patch = (d || {}) as Record<string, unknown>;
    if (typeof patch.activePreset === 'string') void markUsed('presets', patch.activePreset);
    if (typeof patch.activePersona === 'string') void markUsed('personas', patch.activePersona);
  });
  L.core.on('generate:start', d => {
    const chat = (d as { chat?: unknown } | undefined)?.chat; if (!chat) return;
    void markUsed('presets', S.presetFor?.(chat)?.id, false);
    void markUsed('personas', S.persona?.(chat)?.id, false);
  });
}

export const feature = { name: 'shelfUsage', setup };
