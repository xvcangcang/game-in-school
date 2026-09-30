/**
 * NPC 身份表。
 * isTeacher 决定 TA 是否以「老师」口吻出现在 AI 提示词里。
 */

import type { RoleId } from '@/game/types';

export interface RoleMeta {
  id: RoleId;
  name: string;
  /** 是否为教职员工 */
  isTeacher: boolean;
  /** 是否默认参与日常剧情（老师类默认不参与「同学打闹」类事件） */
  peer: boolean;
  /** 初始好感默认值 */
  baseRelation: number;
  /** 给 AI 的身份描述 */
  promptHint: string;
}

export const ROLES: Record<RoleId, RoleMeta> = {
  classmate: {
    id: 'classmate',
    name: '同学',
    isTeacher: false,
    peer: true,
    baseRelation: 0,
    promptHint: '同班同学，关系普通',
  },
  bestFriend: {
    id: 'bestFriend',
    name: '死党',
    isTeacher: false,
    peer: true,
    baseRelation: 60,
    promptHint: '从小玩到大的死党，什么话都敢说',
  },
  deskmate: {
    id: 'deskmate',
    name: '同桌',
    isTeacher: false,
    peer: true,
    baseRelation: 30,
    promptHint: '同桌，天天为三八线吵架但又互相抄作业',
  },
  classTeacher: {
    id: 'classTeacher',
    name: '班主任',
    isTeacher: true,
    peer: false,
    baseRelation: 20,
    promptHint: '班主任，管得宽，动不动就找家长',
  },
  mathTeacher: {
    id: 'mathTeacher',
    name: '数学老师',
    isTeacher: true,
    peer: false,
    baseRelation: 10,
    promptHint: '数学老师，语速快，最爱突击测验',
  },
  chineseTeacher: {
    id: 'chineseTeacher',
    name: '语文老师',
    isTeacher: true,
    peer: false,
    baseRelation: 15,
    promptHint: '语文老师，爱念范文，作业是抄写',
  },
  englishTeacher: {
    id: 'englishTeacher',
    name: '英语老师',
    isTeacher: true,
    peer: false,
    baseRelation: 15,
    promptHint: '英语老师，喜欢听写和分组对话',
  },
  peTeacher: {
    id: 'peTeacher',
    name: '体育老师',
    isTeacher: true,
    peer: false,
    baseRelation: 25,
    promptHint: '体育老师，嗓门大，最讨厌有人请假',
  },
  dean: {
    id: 'dean',
    name: '教导主任',
    isTeacher: true,
    peer: false,
    baseRelation: 0,
    promptHint: '教导主任，专抓仪容仪表和走廊追跑',
  },
  parent: {
    id: 'parent',
    name: '家长',
    isTeacher: false,
    peer: false,
    baseRelation: 40,
    promptHint: '家长，关注成绩，会用零花钱当奖惩',
  },
  crush: {
    id: 'crush',
    name: '暗恋对象',
    isTeacher: false,
    peer: true,
    baseRelation: 10,
    promptHint: '心里在意的人，说话会紧张（全程保持校园尺度，不写任何越界内容）',
  },
  bully: {
    id: 'bully',
    name: '找茬的',
    isTeacher: false,
    peer: true,
    baseRelation: -20,
    promptHint: '总爱挑事的人，嘴上不饶人',
  },
};

export const ROLE_LIST: RoleMeta[] = Object.values(ROLES);

export function roleMeta(id: RoleId): RoleMeta {
  return ROLES[id] ?? ROLES.classmate;
}

/** 可供玩家自由创建 NPC 时选择的身份（按分组给出，UI 直接渲染） */
export const ROLE_GROUPS: { label: string; roles: RoleId[] }[] = [
  { label: '同学', roles: ['classmate', 'deskmate', 'bestFriend', 'crush', 'bully'] },
  {
    label: '老师',
    roles: ['classTeacher', 'mathTeacher', 'chineseTeacher', 'englishTeacher', 'peTeacher', 'dean'],
  },
  { label: '家人', roles: ['parent'] },
];
