import type { GameEvent } from '@/game/types';
import { COMMON_EVENTS } from './common';
import { G1_EVENTS } from './g1';
import { G2_EVENTS } from './g2';
import { G3_EVENTS } from './g3';

/** 全部内置事件。id 必须全局唯一，重复的会在控制台报错。 */
export const ALL_EVENTS: GameEvent[] = [...COMMON_EVENTS, ...G1_EVENTS, ...G2_EVENTS, ...G3_EVENTS];

/** 按 id 建索引，供图鉴和调试使用 */
export const EVENT_BY_ID: Record<string, GameEvent> = Object.fromEntries(
  ALL_EVENTS.map((e) => [e.id, e]),
);
