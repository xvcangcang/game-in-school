/**
 * 预设角色库：一局新游戏的默认出场阵容。
 * 玩家可以在「角色工坊」里改名、改外观、删除（preset 标记的角色仅可改名/改外观）。
 */

import { HAIR_COLORS } from '@/data/appearances';
import { createCharacter } from '@/game/character';
import type { Character } from '@/game/types';

/** 生成默认 NPC 名单（每次调用返回全新对象，角色 id 用固定值便于事件库引用） */
export function defaultNpcRoster(): Character[] {
  return [
    createCharacter({
      id: 'npc_deskmate',
      name: '林小雨',
      role: 'deskmate',
      gender: 'f',
      personality: 'social',
      appearance: { gender: 'f', skin: 1, hair: 2, hairColor: HAIR_COLORS[0], uniform: 0, accessory: 6 },
      bio: '同桌，画画特别好，课本边上全是她的涂鸦。',
      relation: 30,
      preset: true,
    }),
    createCharacter({
      id: 'npc_bestfriend',
      name: '王大力',
      role: 'bestFriend',
      gender: 'm',
      personality: 'sporty',
      appearance: { gender: 'm', skin: 2, hair: 3, hairColor: HAIR_COLORS[0], uniform: 1, accessory: 0 },
      bio: '从小一起长大的死党，篮球场上谁都拦不住，作业本上谁都能拦住。',
      relation: 60,
      preset: true,
    }),
    createCharacter({
      id: 'npc_class_teacher',
      name: '老赵',
      role: 'classTeacher',
      gender: 'm',
      personality: 'ordinary',
      appearance: { gender: 'm', skin: 2, hair: 4, hairColor: HAIR_COLORS[1], uniform: 3, accessory: 1 },
      bio: '班主任，五十出头，口头禅是「我再讲两分钟」。',
      relation: 20,
      preset: true,
    }),
    createCharacter({
      id: 'npc_math_teacher',
      name: '陈老师',
      role: 'mathTeacher',
      gender: 'f',
      personality: 'scholar',
      appearance: { gender: 'f', skin: 0, hair: 1, hairColor: HAIR_COLORS[1], uniform: 2, accessory: 1 },
      bio: '数学老师，语速是全年级最快的，最爱说「这张卷子很简单」。',
      relation: 10,
      preset: true,
    }),
    createCharacter({
      id: 'npc_dean',
      name: '刘主任',
      role: 'dean',
      gender: 'm',
      personality: 'ordinary',
      appearance: { gender: 'm', skin: 2, hair: 3, hairColor: HAIR_COLORS[0], uniform: 3, accessory: 1 },
      bio: '教导主任，课间操的时候永远站在最中间那个位置。',
      relation: 0,
      preset: true,
    }),
    createCharacter({
      id: 'npc_mom',
      name: '妈妈',
      role: 'parent',
      gender: 'f',
      personality: 'ordinary',
      appearance: { gender: 'f', skin: 1, hair: 1, hairColor: HAIR_COLORS[2], uniform: 4, accessory: 0 },
      bio: '最关心月考排名的人，也是最会往书包里塞水果的人。',
      relation: 40,
      preset: true,
    }),
  ];
}

/** 玩家自建男性主角的默认外观 */
export const DEFAULT_PROTAGONIST_M = {
  gender: 'm' as const,
  skin: 1,
  hair: 0,
  hairColor: HAIR_COLORS[0],
  uniform: 0,
  accessory: 0,
};

export const DEFAULT_PROTAGONIST_F = {
  gender: 'f' as const,
  skin: 1,
  hair: 2,
  hairColor: HAIR_COLORS[0],
  uniform: 0,
  accessory: 0,
};
