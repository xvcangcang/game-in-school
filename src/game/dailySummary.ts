/**
 * 日终结算。
 *
 * 一天（5 个时段）走完时，把当天发生的事和属性增减汇总成一张卡片。
 * 数值部分**完全由本地计算**，不依赖 AI；AI 只负责在卡片上补一句人话的小结，
 * 拿不到就用本地兜底句。这样即便断网/没配 Key，结算页也永远有内容。
 */

import { moodTier } from '@/game/stats';
import { DAYS_PER_WEEK } from '@/game/schedule';
import type { GameState, PhaseId, SlotId, StatKey, Stats } from '@/game/types';
import { PHASE_META, SLOT_META, STAT_KEYS, STAT_META } from '@/game/types';

export interface DailyDelta {
  key: StatKey;
  from: number;
  to: number;
  diff: number;
}

export interface DailyEventLine {
  slot: SlotId;
  title: string;
  choice: string;
}

export interface DailySummary {
  day: number;
  week: number;
  weekday: string;
  phase: PhaseId;
  phaseName: string;
  /** 非零的属性增减，按绝对值从大到小排 */
  deltas: DailyDelta[];
  /** 当天发生过的剧情，按时段顺序 */
  events: DailyEventLine[];
  /** 当天下班时的属性（结算卡片上直接展示） */
  statsAfter: Stats;
  moodTier: string;
  /** 本地生成的兜底小结；AI 成功后会替换成 AI 写的那句 */
  headline: string;
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五'];

function weekdayOf(day: number): string {
  return WEEKDAYS[(day - 1) % DAYS_PER_WEEK] ?? '周末';
}

/** 把两个属性快照相减，只保留有变化的项 */
export function diffStats(before: Stats, after: Stats): DailyDelta[] {
  return STAT_KEYS.map((key) => ({
    key,
    from: before[key],
    to: after[key],
    diff: after[key] - before[key],
  }))
    .filter((d) => d.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/** 没有 AI 时用的一句话小结，靠规则拼出来 */
function localHeadline(deltas: DailyDelta[], eventCount: number, mood: number): string {
  const get = (k: StatKey): number => deltas.find((d) => d.key === k)?.diff ?? 0;
  const parts: string[] = [];

  const study = get('study');
  const moodDelta = get('mood');
  const stamina = get('stamina');
  const popularity = get('popularity');
  const favor = get('teacherFavor');

  if (study >= 6) parts.push('今天在课本上花了不少工夫');
  else if (study <= -6) parts.push('今天几乎没怎么碰书');

  if (moodDelta <= -6) parts.push('心态掉得有点厉害');
  else if (moodDelta >= 6) parts.push('心情还不错');

  if (stamina <= -10) parts.push('累得够呛');
  if (popularity >= 6) parts.push('跟同学混得挺开');
  if (favor <= -6) parts.push('惹老师不高兴了');
  else if (favor >= 6) parts.push('老师对你印象不错');

  if (parts.length === 0) {
    if (mood < 30) parts.push('靠着惯性把这一天撑完了');
    else if (eventCount >= 5) parts.push('事情不少，但都过去了');
    else parts.push('平平淡淡的一天');
  }

  return `${parts.slice(0, 3).join('，')}。`;
}

/**
 * 生成日终结算。
 * `ended` 来自 `advanceSlot()` 的 `endedDay`，是刚结束那一天的起始/结束属性。
 */
export function summarizeDay(
  state: GameState,
  ended: { day: number; statsBefore: Stats; statsAfter: Stats },
): DailySummary {
  const deltas = diffStats(ended.statsBefore, ended.statsAfter);

  const events: DailyEventLine[] = state.history
    .filter((h) => h.day === ended.day)
    .map((h) => ({ slot: h.slot, title: h.title, choice: h.choiceText }));

  return {
    day: ended.day,
    week: Math.floor((ended.day - 1) / DAYS_PER_WEEK) + 1,
    weekday: weekdayOf(ended.day),
    phase: state.phase,
    phaseName: PHASE_META[state.phase].name,
    deltas,
    events,
    statsAfter: ended.statsAfter,
    moodTier: moodTier(ended.statsAfter.mood),
    headline: localHeadline(deltas, events.length, ended.statsAfter.mood),
  };
}

/** 属性变化的中文短标签，UI 直接用 */
export function deltaLabel(d: DailyDelta): string {
  return `${STAT_META[d.key].name} ${d.diff > 0 ? '+' : ''}${d.diff}`;
}

/** 时段名，UI 用 */
export function slotName(slot: SlotId): string {
  return SLOT_META[slot].name;
}
