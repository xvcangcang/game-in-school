/**
 * 属性计算：初始值、夹取、变化量应用。
 * 纯逻辑层，不碰 DOM / Canvas。
 */

import { personalityMeta } from '@/data/personalities';
import type {
  Difficulty,
  PersonalityId,
  PhaseId,
  StatKey,
  Stats,
} from '@/game/types';
import { STAT_KEYS, STAT_META } from '@/game/types';

/** 各学段的属性起点：升一个年级，学业和家庭期望变高，心态和体力变差 */
const PHASE_BASE: Record<PhaseId, Stats> = {
  g1: {
    study: 30,
    stamina: 75,
    mood: 70,
    popularity: 30,
    teacherFavor: 30,
    familyExpect: 40,
    money: 50,
  },
  g2: {
    study: 45,
    stamina: 68,
    mood: 62,
    popularity: 40,
    teacherFavor: 35,
    familyExpect: 55,
    money: 60,
  },
  g3: {
    study: 58,
    stamina: 62,
    mood: 52,
    popularity: 45,
    teacherFavor: 40,
    familyExpect: 72,
    money: 70,
  },
};

/** 难度对起始心态的修正 */
const DIFFICULTY_MOOD: Record<Difficulty, number> = {
  relax: 10,
  normal: 0,
  hard: -8,
};

export function clampStat(key: StatKey, value: number): number {
  const meta = STAT_META[key];
  if (!Number.isFinite(value)) return meta.min;
  return Math.max(meta.min, Math.min(meta.max, Math.round(value)));
}

export function clampStats(stats: Stats): Stats {
  const out = {} as Stats;
  for (const key of STAT_KEYS) out[key] = clampStat(key, stats[key]);
  return out;
}

export function createInitialStats(
  phase: PhaseId,
  difficulty: Difficulty,
  personality: PersonalityId,
): Stats {
  const base = { ...PHASE_BASE[phase] };
  base.mood += DIFFICULTY_MOOD[difficulty];

  const bonus = personalityMeta(personality).statBonus;
  for (const key of STAT_KEYS) {
    if (typeof bonus[key] === 'number') base[key] += bonus[key] as number;
  }
  return clampStats(base);
}

/** 对一份属性施加增量，返回新对象（不修改入参） */
export function applyStatDelta(stats: Stats, delta: Partial<Stats> | undefined): Stats {
  if (!delta) return stats;
  const next = { ...stats };
  for (const key of STAT_KEYS) {
    const d = delta[key];
    if (typeof d === 'number' && d !== 0) next[key] = clampStat(key, next[key] + d);
  }
  return next;
}

/** 属性文案，例如「学业 62 / 100」 */
export function statText(key: StatKey, value: number): string {
  const meta = STAT_META[key];
  return meta.unit ? `${value}${meta.unit}` : `${value}`;
}

/** 心态档位：影响 AI 提示词与结局判定 */
export function moodTier(mood: number): '崩溃' | '低落' | '还行' | '不错' | '亢奋' {
  if (mood < 20) return '崩溃';
  if (mood < 40) return '低落';
  if (mood < 60) return '还行';
  if (mood < 85) return '不错';
  return '亢奋';
}

/** 综合评分，用于期末结算与结局 */
export function overallScore(stats: Stats): number {
  return Math.round(
    stats.study * 0.4 +
      stats.mood * 0.2 +
      stats.stamina * 0.1 +
      stats.popularity * 0.1 +
      stats.teacherFavor * 0.1 +
      (100 - Math.abs(stats.familyExpect - 60)) * 0.1,
  );
}
