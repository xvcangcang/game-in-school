/**
 * 预设角色库的持久化。
 *
 * 存两份东西：
 *  - `cps:roster`      班里的其他角色（NPC），开新游戏时的默认阵容
 *  - `cps:protagonist` 默认主角模板，开新游戏时用它预填创建表单
 *
 * 两者都只存在本机，不进存档，所以改一次以后每局都生效。
 */

import { clampAppearance } from '@/data/appearances';
import { defaultNpcRoster, DEFAULT_PROTAGONIST_M } from '@/data/presets';
import {
  clampRelation,
  createCharacter,
  SETTING_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '@/game/character';
import type { Appearance, Character, Gender, PersonalityId } from '@/game/types';

const ROSTER_KEY = 'cps:roster';
const PROTAGONIST_KEY = 'cps:protagonist';

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
          title: typeof c.title === 'string' ? c.title : undefined,
          setting: typeof c.setting === 'string' ? c.setting : '',
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

/* ------------------------------------------------------------------ *
 * 默认主角模板
 * ------------------------------------------------------------------ */

/**
 * 开新游戏时预填用的主角初值。
 * 角色工坊里编辑主角，改的就是这份模板——不然工坊里的主角编辑就是个死胡同
 * （改动没有任何地方会用到）。
 */
export interface ProtagonistTemplate {
  name: string;
  title: string;
  setting: string;
  gender: Gender;
  personality: PersonalityId;
  appearance: Appearance;
}

export function defaultProtagonistTemplate(): ProtagonistTemplate {
  return {
    name: '',
    title: '学生',
    setting: '',
    gender: 'm',
    personality: 'ordinary',
    appearance: clampAppearance({ ...DEFAULT_PROTAGONIST_M, gender: 'm' }),
  };
}

export function loadProtagonistTemplate(): ProtagonistTemplate {
  const base = defaultProtagonistTemplate();
  try {
    const raw = localStorage.getItem(PROTAGONIST_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 12) : base.name,
      title:
        typeof parsed.title === 'string' ? parsed.title.slice(0, TITLE_MAX_LENGTH) : base.title,
      setting:
        typeof parsed.setting === 'string'
          ? parsed.setting.slice(0, SETTING_MAX_LENGTH)
          : base.setting,
      gender:
        parsed.gender === 'm' || parsed.gender === 'f' || parsed.gender === 'n'
          ? parsed.gender
          : base.gender,
      personality: (parsed.personality as PersonalityId) ?? base.personality,
      appearance: clampAppearance((parsed.appearance as Partial<Appearance>) ?? {}),
    };
  } catch (err) {
    console.warn('[roster] 主角模板读取失败，用默认值：', err);
    return base;
  }
}

export function saveProtagonistTemplate(template: ProtagonistTemplate): void {
  try {
    localStorage.setItem(PROTAGONIST_KEY, JSON.stringify(template));
  } catch (err) {
    console.warn('[roster] 主角模板保存失败：', err);
  }
}

export function resetProtagonistTemplate(): ProtagonistTemplate {
  localStorage.removeItem(PROTAGONIST_KEY);
  return defaultProtagonistTemplate();
}
