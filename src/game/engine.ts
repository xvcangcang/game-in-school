/**
 * 事件引擎：挑事件、算选项、结算。
 *
 * 设计原则
 * - 引擎不认识 AI。AI 生成的事件在 scenes/play.ts 里先转成 GameEvent 再交给这里。
 * - 所有随机都走传入的 Rng（可播种），保证同一种子 + 同样选择 = 同一条剧情线。
 * - 坏事件保底：连续出现 2 个负面事件后，下一次强制挑非负面事件。
 */

import { ALL_EVENTS, EVENT_BY_ID, MAIN_EVENTS, SUB_EVENTS } from '@/data/events';
import { makeFillerEvent } from '@/data/fillers';
import { checkCondition, slotIdAt, slotMatches } from '@/game/conditions';
import { applyEffects, type EffectReport } from '@/game/effects';
import { advanceSlot } from '@/game/schedule';
import { referencedCharacterIds } from '@/game/text';
import type { Rng } from '@/app/rng';
import type { Choice, GameEvent, GameState, LogEntry, SlotId, Stats } from '@/game/types';
import { DIFFICULTY_META } from '@/game/types';

/** 连续几个负面事件之后强制来点好事 */
export const MAX_BAD_STREAK = 2;

/** 出现过的事件再次出现时的权重折扣 */
const REPEAT_WEIGHT_FACTOR = 0.3;

export interface PickOptions {
  /** 候选事件池，默认是内置事件库 */
  pool?: GameEvent[];
  /** 是否允许用冷场填充兜底，默认允许 */
  allowFiller?: boolean;
  /** 用于冷场填充的计数器，避免每次都是同一条 */
  fillerSeed?: number;
}

/**
 * 一个事件在正文/选项里引用到的全部角色 id（含 participants）。
 *
 * 为什么需要它：玩家可以在角色工坊里删掉「刘主任」，这时再触发点名刘主任的事件，
 * 正文就会直接显示 `{npc_dean}` 这种原始占位符——非常出戏。
 * 所以事件触发前必须确认它引用的每个角色都还在场。
 */
export function referencedIdsOf(event: GameEvent): string[] {
  const ids = new Set<string>(event.participants ?? []);
  const scan = (text: string | undefined): void => {
    if (!text) return;
    for (const id of referencedCharacterIds(text)) ids.add(id);
  };
  scan(event.text);
  for (const choice of event.choices) {
    scan(choice.text);
    scan(choice.resultText);
  }
  return [...ids];
}

/** 事件是否满足发生条件（不含权重） */
export function eventEligible(state: GameState, event: GameEvent): boolean {
  if (event.phase && event.phase.length > 0 && !event.phase.includes(state.phase)) return false;

  /*
   * 顶层 slots：限定某个时段。
   * 数据里一般写大段（am/pm…），也可以精确到某一节（eveningStudy）。
   * 注意这是「与」require.slots 独立的一层，两处都要判。
   */
  if (event.slots && event.slots.length > 0) {
    if (!slotMatches(state.slotIndex, event.slots)) return false;
  }

  if (!checkCondition(state, event.require)) return false;

  // 引用的角色必须都还在（玩家可能已经在角色工坊里删掉了某个预设角色）
  for (const id of referencedIdsOf(event)) {
    if (!state.characters.some((c) => c.id === id)) return false;
  }

  // 冷却中
  const until = state.cooldowns[event.id];
  if (typeof until === 'number' && state.day < until) return false;

  // 至少要有一个选项能选，否则这事件等于死局
  if (availableChoices(state, event).length === 0) return false;

  return true;
}

/** 当前可选的选项（条件不满足的直接不显示） */
export function availableChoices(state: GameState, event: GameEvent): Choice[] {
  return event.choices.filter((c) => checkCondition(state, c.require));
}

function eventWeight(state: GameState, event: GameEvent): number {
  const bias = DIFFICULTY_META[state.difficulty].badBias;
  let w = Math.max(0, event.weight);
  if (event.tone === 'bad') w *= bias;
  if (state.seenEventIds.includes(event.id)) w *= REPEAT_WEIGHT_FACTOR;
  return w;
}

/**
 * 挑一个事件。挑不到就返回冷场填充；连冷场都不允许时返回 null。
 */
export function pickEvent(state: GameState, rng: Rng, options: PickOptions = {}): GameEvent {
  // 默认只从「主线事件」里挑。小剧情（SUB_EVENTS）不进这个池子，
  // 它们只由 resolveChoice 结算时按大剧情挂出来的 subEvents / followUpId 触发。
  const pool = options.pool ?? MAIN_EVENTS;

  let candidates = pool.filter((e) => eventEligible(state, e));

  // 坏事件保底
  if (state.badStreak >= MAX_BAD_STREAK) {
    const nonBad = candidates.filter((e) => e.tone !== 'bad');
    if (nonBad.length > 0) candidates = nonBad;
  }

  if (candidates.length === 0) {
    if (options.allowFiller === false) {
      // 调用方明确说不要兜底，这里给一个最小的空事件
      return makeFillerEvent(options.fillerSeed ?? 0);
    }
    return makeFillerEvent(options.fillerSeed ?? Math.floor(rng.float() * 1000));
  }

  const weights = candidates.map((e) => eventWeight(state, e));
  const picked = candidates[rng.weightedIndex(weights)];
  return picked ?? makeFillerEvent(options.fillerSeed ?? 0);
}

/** 标记事件已发生：记冷却、记已见、累计坏事件连击 */
export function markEventSeen(state: GameState, event: GameEvent): GameState {
  return {
    ...state,
    // AI 事件 id 每次都不同，记进 seenEventIds 只会把存档撑大，没有意义
    seenEventIds:
      event.source === 'builtin' && !state.seenEventIds.includes(event.id)
        ? [...state.seenEventIds, event.id]
        : state.seenEventIds,
    cooldowns:
      event.source === 'builtin' && typeof event.cooldownDays === 'number'
        ? { ...state.cooldowns, [event.id]: state.day + event.cooldownDays }
        : state.cooldowns,
    badStreak: event.tone === 'bad' ? state.badStreak + 1 : 0,
  };
}

function slotKeyOf(state: GameState): SlotId {
  return slotIdAt(state.slotIndex);
}

export interface ResolveResult {
  state: GameState;
  report: EffectReport;
  choice: Choice;
  /** 是否已经推进到下一个时段 */
  advanced: boolean;
  /** 是否跨天了（用于触发日终结算） */
  newDay: boolean;
  /** 刚结束那一天的结算素材，见 schedule.ts 的 AdvanceResult.endedDay */
  endedDay?: { day: number; statsBefore: Stats; statsAfter: Stats };
  termEnded: boolean;
  /**
   * 有一段**小剧情**要接着演（同一时段内，不推进时间）。
   * 有值时 advanced 一定是 false —— 这一段还没结束。
   */
  followUp?: GameEvent;
}

/**
 * 结算时决定"要不要接着演一段小剧情"。
 *
 * 三条路，优先级从高到低：
 *  1. 选项里显式写了 `followUpId` —— 作者钦定
 *  2. 事件挂了 `subEvents` 池 —— 从池子里挑一段当时符合条件的
 *  3. 什么都没挂 —— 有 `SUB_EVENT_CHANCE` 的概率从**全局小剧情池**里挑一段
 *
 * 第 3 条是关键：不然「每个大剧情都能分支」就得给上百条主线一条条挂池子，
 * 而且新写的主线很容易忘了挂，功能等于没有。
 *
 * 小剧情本身不会再套小剧情（看 event.isSubEvent），所以不会无限递归。
 */
const SUB_EVENT_CHANCE = 0.38;

function pickFollowUp(
  state: GameState,
  event: GameEvent,
  choice: Choice,
  rng: Rng,
): GameEvent | undefined {
  // 小剧情演完就结束，不再往下套
  if (event.isSubEvent) return undefined;

  // 1）显式指定
  const forcedId = choice.effects.followUpId;
  if (forcedId) {
    const forced = EVENT_BY_ID[forcedId];
    if (forced && eventEligible(state, forced)) return forced;
    if (forced) {
      console.warn(`[engine] followUpId「${forcedId}」当前不满足条件，已忽略`);
    } else {
      console.warn(`[engine] followUpId「${forcedId}」找不到对应事件`);
    }
  }

  // 2）事件自己的小剧情池；没有就用 3）全局池
  const explicit = event.subEvents ?? [];
  const useGlobal = explicit.length === 0;
  if (useGlobal && !rng.chance(SUB_EVENT_CHANCE)) return undefined;

  const source = useGlobal ? SUB_EVENTS : explicit.map((id) => EVENT_BY_ID[id]).filter(Boolean);

  const candidates = source.filter((e): e is GameEvent => Boolean(e)).filter((e) => eventEligible(state, e));
  if (candidates.length === 0) return undefined;

  // 没看过的优先，权重照常算
  const fresh = candidates.filter((e) => !state.seenEventIds.includes(e.id));
  const pool = fresh.length > 0 ? fresh : candidates;

  return pool[rng.weightedIndex(pool.map((e) => Math.max(1, e.weight)))] ?? pool[0];
}

/**
 * 结算一个选择：应用效果 → 写历史 → （接着演小剧情 | 推进时段）。
 */
export function resolveChoice(
  state: GameState,
  event: GameEvent,
  choiceId: string,
  rng: Rng,
): ResolveResult {
  const choice = event.choices.find((c) => c.id === choiceId) ?? event.choices[0];

  const withChoiceApplied = applyEffects(state, choice.effects);
  let next = withChoiceApplied.state;

  const entry: LogEntry = {
    day: state.day,
    slot: slotKeyOf(state),
    eventId: event.id,
    title: event.title,
    choiceText: choice.text,
    resultText: choice.resultText,
  };

  next = { ...next, history: [...next.history, entry].slice(-200), updatedAt: Date.now() };

  // 先看有没有小剧情要接。有的话这一段就还没结束，时段不动。
  // 注意用的是**结算后**的 state 去判定，这样「选完之后条件才满足」的小剧情也能触发。
  const followUp = choice.effects.advance === false ? undefined : pickFollowUp(next, event, choice, rng);

  if (followUp) {
    return {
      state: next,
      report: withChoiceApplied.report,
      choice,
      advanced: false,
      newDay: false,
      termEnded: false,
      followUp,
    };
  }

  const shouldAdvance = choice.effects.advance !== false;
  let advanced = false;
  let newDay = false;
  let termEnded = false;
  let endedDay: ResolveResult['endedDay'];

  if (shouldAdvance) {
    const res = advanceSlot(next);
    next = res.state;
    advanced = true;
    newDay = res.newDay;
    termEnded = res.termEnded;
    endedDay = res.endedDay;
  }

  return {
    state: next,
    report: withChoiceApplied.report,
    choice,
    advanced,
    newDay,
    termEnded,
    ...(endedDay ? { endedDay } : {}),
  };
}

/** 调试用：当前状态下有多少事件可以触发 */
export function eligibleCount(state: GameState): number {
  return ALL_EVENTS.filter((e) => eventEligible(state, e)).length;
}
