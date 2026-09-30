import type { GameEvent } from '@/game/types';
import { COMMON_EVENTS } from './common';
import { G1_EVENTS } from './g1';
import { G2_EVENTS } from './g2';
import { G3_EVENTS } from './g3';
import { SUB_EVENTS } from './subs';

export { SUB_EVENTS };

/**
 * 主线事件：按时段正常抽选的那些。
 * id 必须全局唯一，重复的会在控制台报错。
 */
export const MAIN_EVENTS: GameEvent[] = [
  ...COMMON_EVENTS,
  ...G1_EVENTS,
  ...G2_EVENTS,
  ...G3_EVENTS,
];

/**
 * 全部内置事件 = 主线 + 小剧情。
 *
 * 小剧情（SUB_EVENTS）**不会**被 pickEvent 抽到，它们只在大剧情挂出的
 * `subEvents` / `followUpId` 里被点名触发（见 game/engine.ts 的 pickFollowUp）。
 * 放进 ALL_EVENTS 是为了让事件图鉴能把它们也收录进来。
 */
export const ALL_EVENTS: GameEvent[] = [...MAIN_EVENTS, ...SUB_EVENTS];

/** 按 id 建索引，供图鉴、小剧情触发和调试使用 */
export const EVENT_BY_ID: Record<string, GameEvent> = Object.fromEntries(
  ALL_EVENTS.map((e) => [e.id, e]),
);
