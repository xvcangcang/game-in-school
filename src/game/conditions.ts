/**
 * 触发条件判定。事件、选项、AI 生成结果都要过这里。
 * 纯函数，不修改 state。
 */

import { npcs } from '@/game/character';
import type { Condition, GameState, SlotId, StatKey } from '@/game/types';
import { SLOT_ORDER, STAT_KEYS } from '@/game/types';

/** 角色 id 不存在时怎么算：默认「不满足」，避免写了错 id 就无条件通过 */
export interface ConditionOptions {
  /**
   * 引用的角色不在场/不存在时是否放行。
   * 事件本身用 false（宁可不触发），选项用 false（隐藏掉）。
   */
  missingRelationPasses?: boolean;
}

export function checkCondition(
  state: GameState,
  cond: Condition | undefined,
  options: ConditionOptions = {},
): boolean {
  if (!cond) return true;

  /* ---- 学段 ---- */
  if (cond.phase && cond.phase.length > 0 && !cond.phase.includes(state.phase)) return false;

  /* ---- 时段 ---- */
  if (cond.slots && cond.slots.length > 0) {
    const slot = slotIdAt(state.slotIndex);
    if (!cond.slots.includes(slot)) return false;
  }

  /* ---- 属性下限 ---- */
  if (cond.minStats) {
    for (const key of STAT_KEYS) {
      const need = cond.minStats[key as StatKey];
      if (typeof need === 'number' && state.stats[key] < need) return false;
    }
  }

  /* ---- 属性上限 ---- */
  if (cond.maxStats) {
    for (const key of STAT_KEYS) {
      const cap = cond.maxStats[key as StatKey];
      if (typeof cap === 'number' && state.stats[key] > cap) return false;
    }
  }

  /* ---- 好感 ---- */
  if (cond.minRelation) {
    for (const [id, need] of Object.entries(cond.minRelation)) {
      const ch = state.characters.find((c) => c.id === id);
      if (!ch) {
        if (!options.missingRelationPasses) return false;
        continue;
      }
      if (ch.relation < need) return false;
    }
  }

  if (cond.maxRelation) {
    for (const [id, cap] of Object.entries(cond.maxRelation)) {
      const ch = state.characters.find((c) => c.id === id);
      if (!ch) {
        if (!options.missingRelationPasses) return false;
        continue;
      }
      if (ch.relation > cap) return false;
    }
  }

  /* ---- 标记 ---- */
  if (cond.flags) {
    for (const f of cond.flags) if (!state.flags.includes(f)) return false;
  }
  if (cond.notFlags) {
    for (const f of cond.notFlags) if (state.flags.includes(f)) return false;
  }

  /* ---- 自定义 NPC 数量 ---- */
  if (typeof cond.minCustomNpc === 'number') {
    const count = npcs(state).filter((c) => !c.preset).length;
    if (count < cond.minCustomNpc) return false;
  }

  return true;
}

/** 时段下标 → 时段 id。放这里避免各处重复 import。 */
export function slotIdAt(index: number): SlotId {
  return SLOT_ORDER[Math.max(0, Math.min(SLOT_ORDER.length - 1, index))];
}

/**
 * 条件里引用的角色是否都在场。
 * AI 生成的事件可能引用一个不存在的角色，用这个先筛一遍。
 */
export function conditionCharactersPresent(state: GameState, cond: Condition | undefined): boolean {
  if (!cond) return true;
  const ids = [...Object.keys(cond.minRelation ?? {}), ...Object.keys(cond.maxRelation ?? {})];
  return ids.every((id) => state.characters.some((c) => c.id === id));
}
