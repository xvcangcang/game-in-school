/**
 * 时间推进：时段 → 天 → 周 → 学期。
 *
 * 规则：一天 5 个时段，一周 5 天（周一到周五），一学期 16 周。
 * 跨天时恢复少量体力与心态，并让「家庭期望」每天产生一点压力。
 * 跨周时做一次小结（学业自然衰减 / 体力回满一点）。
 */

import { applyStatDelta } from '@/game/stats';
import type { GameState, SlotId, Stats } from '@/game/types';
import { SLOT_META, SLOT_ORDER } from '@/game/types';

export const SLOTS_PER_DAY = SLOT_ORDER.length;
export const DAYS_PER_WEEK = 5;
/**
 * 一学期几周。
 *
 * 原来是 16 周，那时一天只有 5 个时段（一学期 400 段剧情）。
 * 现在一天 13 个时段，16 周会变成 1040 段——一学期要玩好几个小时，太长了。
 * 所以缩到 8 周，让一学期回到 500 段左右，总时长和以前差不多。
 */
export const WEEKS_PER_TERM = 8;

export function slotIdOf(state: GameState): SlotId {
  return SLOT_ORDER[Math.max(0, Math.min(SLOT_ORDER.length - 1, state.slotIndex))];
}

export function isWeekend(state: GameState): boolean {
  return state.day % DAYS_PER_WEEK === 0;
}

export function weekOf(day: number): number {
  return Math.floor((day - 1) / DAYS_PER_WEEK) + 1;
}

export interface AdvanceResult {
  state: GameState;
  /** 是否跨天了 */
  newDay: boolean;
  /** 是否跨周了 */
  newWeek: boolean;
  /** 是否学期结束（该结算了） */
  termEnded: boolean;
  /**
   * 刚结束那一天的结算素材（只在跨天时有值）。
   * 起始属性取的是「昨天凌晨恢复完之后」的快照，结束属性取的是「今晚睡前」的，
   * 所以这段差值正好是一整个白天发生了什么，不掺杂夜间恢复。
   */
  endedDay?: {
    day: number;
    statsBefore: Stats;
    statsAfter: Stats;
  };
}

/** 推进一个时段 */
export function advanceSlot(state: GameState): AdvanceResult {
  const previousDay = state.day;
  const statsBeforeThisDay = { ...state.dayStartStats };
  const statsAtDayEnd = { ...state.stats };

  let slotIndex = state.slotIndex + 1;
  let day = state.day;
  let newDay = false;

  if (slotIndex >= SLOTS_PER_DAY) {
    slotIndex = 0;
    day += 1;
    newDay = true;
  }

  let next: GameState = { ...state, slotIndex, day, week: weekOf(day) };

  if (newDay) next = beginNewDay(next);

  const newWeek = newDay && (day - 1) % DAYS_PER_WEEK === 0;
  if (newWeek) next = beginNewWeek(next);

  return {
    state: next,
    newDay,
    newWeek,
    termEnded: next.week > WEEKS_PER_TERM,
    ...(newDay
      ? {
          endedDay: {
            day: previousDay,
            statsBefore: statsBeforeThisDay,
            statsAfter: statsAtDayEnd,
          },
        }
      : {}),
  };
}

/** 只恢复体力与心态，并记下当天起始快照（日终结算要用） */
function applyNightRecovery(state: GameState): GameState {
  // 期望越高，每天背着的心态压力越大。至少 1 点，否则玩家永远不会觉得"累"。
  const pressure = Math.max(1, Math.round(state.stats.familyExpect / 30));
  const stats = applyStatDelta(state.stats, {
    stamina: 8,
    mood: 1 - pressure,
  });
  // 快照记的是"恢复完之后"的属性，这样一天的增减只统计白天发生的事
  return { ...state, stats, dayStartStats: { ...stats } };
}

/** 新的一天：睡一觉回点血，但家里的期望还在涨 */
function beginNewDay(state: GameState): GameState {
  return applyNightRecovery(state);
}

/** 新的一周：周末补觉，学业有点自然遗忘（衰减别太狠，否则玩家只能在"补作业"里打转） */
function beginNewWeek(state: GameState): GameState {
  return {
    ...state,
    stats: applyStatDelta(state.stats, {
      stamina: 8,
      mood: 3,
      study: -2,
    }),
  };
}

/** 「第 3 周 周二 · 午休」这样的可读时间 */
export function describeTime(state: GameState): string {
  const weekday = ['周一', '周二', '周三', '周四', '周五'][(state.day - 1) % DAYS_PER_WEEK] ?? '周末';
  return `第 ${state.week} 周 ${weekday} · ${SLOT_META[slotIdOf(state)].name}`;
}

/** 晚自习才算「夜里」，渲染层据此压暗画面 */
export function isNight(state: GameState): boolean {
  return slotIdOf(state) === 'eveningStudy';
}
