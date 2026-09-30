/**
 * 冷场填充：当没有任何事件满足触发条件时用。
 * 作用是保证每个时段都有内容，不会出现「点了继续但什么都没有」的空档。
 */

import type { GameEvent } from '@/game/types';

export interface FillerLine {
  title: string;
  text: string;
  scene: GameEvent['scene'];
}

export const FILLER_LINES: FillerLine[] = [
  {
    title: '无事发生',
    text: '课间的十分钟长得离谱。你趴在桌上，听见走廊里有人在喊谁的名字。',
    scene: 'classroom',
  },
  {
    title: '粉笔灰',
    text: '阳光斜着穿过教室，把粉笔灰照成一柱一柱的。你盯着其中一根走了会儿神，铃就响了。',
    scene: 'classroom',
  },
  {
    title: '走廊',
    text: '你抱着作业本从走廊这头走到那头。有人在打闹，有人靠墙背单词，谁都没注意你。',
    scene: 'corridor',
  },
  {
    title: '晴',
    text: '操场上风很大，吹得旗子哗哗响。你站在栏杆边，看了一会儿远处没建完的楼。',
    scene: 'playground',
  },
  {
    title: '食堂',
    text: '食堂今天的土豆烧肉只剩下土豆。你随便扒了两口，把汤喝完了。',
    scene: 'cafeteria',
  },
  {
    title: '放学路上',
    text: '书包比早上沉了一些。路灯一盏一盏亮起来，你踩着影子往家走。',
    scene: 'home',
  },
  {
    title: '窗外',
    text: '窗外那棵树又掉了几片叶子。你数到第七片的时候，发现自己根本没在听课。',
    scene: 'classroom',
  },
];

/** 造一条临时事件：只有一个「继续」，几乎不改变数值 */
export function makeFillerEvent(index: number): GameEvent {
  const line = FILLER_LINES[index % FILLER_LINES.length];
  return {
    id: `filler_${index % FILLER_LINES.length}`,
    source: 'builtin',
    title: line.title,
    text: line.text,
    tone: 'neutral',
    weight: 1,
    scene: line.scene,
    choices: [
      {
        id: 'ok',
        text: '继续',
        effects: { stats: { stamina: 1 } },
      },
    ],
  };
}
