/**
 * 性格标签表。
 * 影响三件事：初始属性、AI 生成事件时的角色塑造、部分选项的可见性（M5 接入）。
 */

import type { PersonalityId, Stats } from '@/game/types';

export interface PersonalityMeta {
  id: PersonalityId;
  name: string;
  desc: string;
  /** 初始属性加成（可以为负） */
  statBonus: Partial<Stats>;
  /** 给 AI 的性格关键词，写提示词时直接用 */
  tags: string[];
  /** 该性格更容易触发的标记（M5 事件引擎读取） */
  flags: string[];
}

export const PERSONALITIES: Record<PersonalityId, PersonalityMeta> = {
  scholar: {
    id: 'scholar',
    name: '学霸',
    desc: '作业从不欠交，考试前反而最淡定。',
    statBonus: { study: 15, teacherFavor: 10, mood: -5, popularity: -5 },
    tags: ['成绩好', '自律', '不太会玩', '被老师当典型'],
    flags: ['personality:scholar'],
  },
  social: {
    id: 'social',
    name: '社牛',
    desc: '走廊上能跟半个年级打招呼。',
    statBonus: { popularity: 20, mood: 10, study: -5 },
    tags: ['自来熟', '消息灵通', '爱组织活动'],
    flags: ['personality:social'],
  },
  shy: {
    id: 'shy',
    name: '社恐',
    desc: '被点名回答问题时耳朵会红。',
    statBonus: { study: 5, mood: -5, popularity: -15 },
    tags: ['话少', '观察力强', '容易紧张'],
    flags: ['personality:shy'],
  },
  rebel: {
    id: 'rebel',
    name: '刺头',
    desc: '教导主任办公室的常客。',
    statBonus: { popularity: 10, teacherFavor: -20, mood: 5 },
    tags: ['不服管', '讲义气', '爱顶嘴'],
    flags: ['personality:rebel'],
  },
  artsy: {
    id: 'artsy',
    name: '文艺',
    desc: '课本空白处画满了小人。',
    statBonus: { mood: 10, popularity: 5, study: -5 },
    tags: ['爱画画', '写日记', '情绪细腻'],
    flags: ['personality:artsy'],
  },
  sporty: {
    id: 'sporty',
    name: '运动系',
    desc: '体育课是唯一不会犯困的课。',
    statBonus: { stamina: 25, popularity: 10, study: -10 },
    tags: ['跑得快', '打球好', '坐不住'],
    flags: ['personality:sporty'],
  },
  ordinary: {
    id: 'ordinary',
    name: '普通',
    desc: '不好也不坏，什么都沾一点。',
    statBonus: {},
    tags: ['没什么特点', '随大流'],
    flags: ['personality:ordinary'],
  },
};

export const PERSONALITY_LIST: PersonalityMeta[] = Object.values(PERSONALITIES);

export function personalityMeta(id: PersonalityId): PersonalityMeta {
  return PERSONALITIES[id] ?? PERSONALITIES.ordinary;
}
