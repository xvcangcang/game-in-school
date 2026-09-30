/**
 * 事件图鉴的解锁记录。
 *
 * 注意和存档里的 `seenEventIds` 的区别：
 *  - `seenEventIds` 属于「这一局」，删档就没了
 *  - 这里是**跨存档的收藏**，玩过就点亮，存在本机
 */

import { ALL_EVENTS } from '@/data/events';

const GALLERY_KEY = 'cps:gallery';

export function getUnlockedEventIds(): Set<string> {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export function unlockEvent(id: string): void {
  // AI 事件每次 id 都不同，没有收藏意义；图鉴只收内置事件
  if (id.startsWith('ai_')) return;
  if (!ALL_EVENTS.some((e) => e.id === id)) return;

  const set = getUnlockedEventIds();
  if (set.has(id)) return;
  set.add(id);
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify([...set]));
  } catch {
    /* 隐私模式下写不进去就算了，不影响游戏 */
  }
}

export function resetGallery(): void {
  localStorage.removeItem(GALLERY_KEY);
}

export function galleryProgress(): { unlocked: number; total: number } {
  return { unlocked: getUnlockedEventIds().size, total: ALL_EVENTS.length };
}
