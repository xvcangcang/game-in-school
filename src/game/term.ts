/**
 * 学期结算与升学。
 *
 * 一学期 16 周走完时触发：
 *  - 按综合表现给一个等第
 *  - 初一 → 初二 → 初三，属性重新洗一遍（学业更高、心态更紧）
 *  - 初三读完 = 通关，由 M7 的结局系统接手
 */

import { overallScore } from '@/game/stats';
import { applyStatDelta } from '@/game/stats';
import type { GameState, PhaseId } from '@/game/types';
import { PHASE_META } from '@/game/types';

export interface TermSummary {
  phase: PhaseId;
  score: number;
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  comment: string;
}

const RANK_COMMENTS: Record<TermSummary['rank'], string> = {
  S: '班主任在家长群里点名表扬了你。妈妈把这条消息截图存了起来。',
  A: '成绩单发下来，你自己也有点意外。这个学期没白熬。',
  B: '不好不坏，中游偏上。老师说「再努一把就能进去」。',
  C: '成绩单上的名次往后挪了几格。你把纸折起来塞进了书包最里面。',
  D: '这个学期基本是在发呆和补救之间反复横跳。假期恐怕不太平。',
};

export function summarizeTerm(state: GameState): TermSummary {
  const score = overallScore(state.stats);
  const rank: TermSummary['rank'] =
    score >= 82 ? 'S' : score >= 70 ? 'A' : score >= 58 ? 'B' : score >= 45 ? 'C' : 'D';
  return {
    phase: state.phase,
    score,
    rank,
    comment: RANK_COMMENTS[rank],
  };
}

/** 下一个学段；初三读完返回 null */
export function nextPhase(phase: PhaseId): PhaseId | null {
  if (phase === 'g1') return 'g2';
  if (phase === 'g2') return 'g3';
  return null;
}

/** 升入下一个学段：时间清零，属性按学段整体平移，角色与标记保留 */
export function promoteToNextPhase(state: GameState): GameState | null {
  const next = nextPhase(state.phase);
  if (!next) return null;

  const shift =
    next === 'g2'
      ? { study: 12, stamina: -6, mood: -6, familyExpect: 12 }
      : { study: 12, stamina: -8, mood: -8, familyExpect: 16 };

  return {
    ...state,
    phase: next,
    day: 1,
    week: 1,
    slotIndex: 0,
    stats: applyStatDelta(state.stats, shift),
    badStreak: 0,
    updatedAt: Date.now(),
  };
}

/** 「初一 · 第 3 学期」这种文案用不上，这里给的是学段名 */
export function phaseName(phase: PhaseId): string {
  return PHASE_META[phase].name;
}
