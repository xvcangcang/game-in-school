/**
 * 全局单例状态。
 *
 * - gameStore：当前进行中的对局（null = 还没开始/在主菜单）
 * - settingsStore：设置，变更会自动写回 localStorage
 *
 * 只允许通过 app/actions.ts 里的动作函数修改对局状态，不要在 UI 里直接 set，
 * 否则存档和 UI 会不同步。
 */

import { loadSettings, saveSettings } from '@/app/settings';
import { Store } from '@/app/store';
import type { GameState, Settings } from '@/game/types';

export const gameStore = new Store<GameState | null>(null);
export const settingsStore = new Store<Settings>(loadSettings());

// 设置一变就落盘。这里捕获异常，避免写盘失败把整个应用带崩。
settingsStore.subscribe((next) => {
  saveSettings(next);
});
