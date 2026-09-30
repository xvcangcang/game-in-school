/**
 * 效果结算。全部是纯函数：返回**新的** state，不修改入参。
 *
 * 每次结算都额外产出一份 deltas 报告，UI 用它显示「学业 +4 / 体力 -3」这种飘字，
 * 也方便调试时看清到底改了什么。
 */

import { clampRelation } from '@/game/character';
import { applyStatDelta, clampStats } from '@/game/stats';
import type { Effects, GameState, StatKey } from '@/game/types';
import { STAT_KEYS, STAT_META } from '@/game/types';

export interface StatDelta {
  key: StatKey;
  from: number;
  to: number;
  diff: number;
}

export interface RelationDelta {
  id: string;
  name: string;
  from: number;
  to: number;
  diff: number;
}

export interface EffectReport {
  stats: StatDelta[];
  relations: RelationDelta[];
  addedFlags: string[];
  removedFlags: string[];
}

const EMPTY_REPORT: EffectReport = { stats: [], relations: [], addedFlags: [], removedFlags: [] };

export function emptyReport(): EffectReport {
  return { ...EMPTY_REPORT, stats: [], relations: [], addedFlags: [], removedFlags: [] };
}

/** 把一份效果应用到状态上 */
export function applyEffects(state: GameState, effects: Effects | undefined): {
  state: GameState;
  report: EffectReport;
} {
  if (!effects) return { state, report: emptyReport() };

  const report = emptyReport();

  /* ---- 属性 ---- */
  let stats = state.stats;
  if (effects.stats) {
    const before = state.stats;
    stats = applyStatDelta(state.stats, effects.stats);
    for (const key of STAT_KEYS) {
      const diff = stats[key] - before[key];
      if (diff !== 0) report.stats.push({ key, from: before[key], to: stats[key], diff });
    }
  }

  /* ---- 好感 ---- */
  let characters = state.characters;
  if (effects.relations && Object.keys(effects.relations).length > 0) {
    characters = state.characters.map((c) => {
      const delta = effects.relations?.[c.id];
      if (typeof delta !== 'number' || delta === 0) return c;
      const to = clampRelation(c.relation + delta);
      if (to !== c.relation) {
        report.relations.push({ id: c.id, name: c.name, from: c.relation, to, diff: to - c.relation });
      }
      return { ...c, relation: to };
    });
  }

  /* ---- 标记 ---- */
  let flags = state.flags;
  if (effects.flags?.length) {
    const added = effects.flags.filter((f) => !flags.includes(f));
    if (added.length) {
      flags = [...flags, ...added];
      report.addedFlags.push(...added);
    }
  }
  if (effects.clearFlags?.length) {
    const toRemove = new Set(effects.clearFlags);
    const kept = flags.filter((f) => !toRemove.has(f));
    if (kept.length !== flags.length) {
      report.removedFlags.push(...flags.filter((f) => toRemove.has(f)));
      flags = kept;
    }
  }

  return {
    state: { ...state, stats: clampStats(stats), characters, flags },
    report,
  };
}

/** 效果的简短中文描述，用于调试面板或「选择后的数值变化」提示 */
export function describeReport(report: EffectReport): string[] {
  const lines: string[] = [];
  for (const d of report.stats) {
    lines.push(`${STAT_META[d.key].name} ${d.diff > 0 ? '+' : ''}${d.diff}`);
  }
  for (const d of report.relations) {
    lines.push(`${d.name}好感 ${d.diff > 0 ? '+' : ''}${d.diff}`);
  }
  return lines;
}
