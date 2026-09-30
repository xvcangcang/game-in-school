/**
 * 预设角色库的持久化。
 *
 * 主菜单的「角色工坊」编辑的就是这份名单；开新游戏时默认用它当阵容。
 * 存在 localStorage，不进存档，所以改一次以后每局都生效。
 */

import { defaultNpcRoster } from '@/data/presets';
import { clampRelation, createCharacter } from '@/game/character';
import type { Character } from '@/game/types';

const ROSTER_KEY = 'cps:roster';

/** 读取预设阵容；没有自定义过就用 data/presets.ts 的默认阵容 */
export function loadRoster(): Character[] {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (!raw) return defaultNpcRoster();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultNpcRoster();

    // 逐条重建而不是直接信任 JSON：字段缺失/越界都能被 createCharacter 兜住
    return parsed
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) =>
        createCharacter({
          id: typeof c.id === 'string' ? c.id : undefined,
          name: typeof c.name === 'string' ? c.name : '无名同学',
          role: (c.role as Character['role']) ?? 'classmate',
          gender: (c.gender as Character['gender']) ?? 'n',
          personality: (c.personality as Character['personality']) ?? 'ordinary',
          appearance: (c.appearance as Character['appearance']) ?? {},
          bio: typeof c.bio === 'string' ? c.bio : '',
          relation: typeof c.relation === 'number' ? clampRelation(c.relation) : 0,
          preset: true,
          aiGenerated: false,
        }),
      );
  } catch (err) {
    console.warn('[roster] 读取失败，回退到默认阵容：', err);
    return defaultNpcRoster();
  }
}

export function saveRoster(list: Character[]): void {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('[roster] 保存失败：', err);
  }
}

export function resetRoster(): Character[] {
  localStorage.removeItem(ROSTER_KEY);
  return defaultNpcRoster();
}

export function hasCustomRoster(): boolean {
  return localStorage.getItem(ROSTER_KEY) !== null;
}
