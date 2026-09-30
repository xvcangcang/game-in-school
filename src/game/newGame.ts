/**
 * 新游戏工厂：把「主界面选好的参数」变成一个完整的 GameState。
 */

import { randomSeed, shortId } from '@/app/rng';
import { defaultNpcRoster } from '@/data/presets';
import { createCharacter } from '@/game/character';
import { createInitialStats } from '@/game/stats';
import type {
  Appearance,
  Character,
  Difficulty,
  GameState,
  Gender,
  PersonalityId,
  PhaseId,
} from '@/game/types';
import { SAVE_VERSION } from '@/game/types';

export interface NewGameOptions {
  phase: PhaseId;
  difficulty: Difficulty;
  aiEnabled: boolean;
  protagonist: {
    name: string;
    /** 自由填写的身份，例如「转学生」「班长」 */
    title?: string;
    /** 自由填写的设定，会原样交给 AI */
    setting?: string;
    gender: Gender;
    personality: PersonalityId;
    appearance: Partial<Appearance>;
  };
  /** 自定义 NPC；不传则使用预设阵容 */
  npcs?: Character[];
}

export function createNewGame(options: NewGameOptions): GameState {
  const protagonist = createCharacter({
    id: `player_${shortId('p').slice(3)}`,
    name: options.protagonist.name,
    role: 'classmate',
    title: options.protagonist.title,
    setting: options.protagonist.setting,
    gender: options.protagonist.gender,
    personality: options.protagonist.personality,
    appearance: options.protagonist.appearance,
    bio: '你。',
    relation: 100,
    isProtagonist: true,
    preset: true,
  });

  const characters = [protagonist, ...(options.npcs ?? defaultNpcRoster())];
  const stats = createInitialStats(options.phase, options.difficulty, options.protagonist.personality);

  return {
    version: SAVE_VERSION,
    seed: randomSeed(),
    phase: options.phase,
    difficulty: options.difficulty,
    aiEnabled: options.aiEnabled,
    day: 1,
    week: 1,
    slotIndex: 0,
    stats,
    dayStartStats: { ...stats },
    protagonistId: protagonist.id,
    characters,
    flags: [],
    seenEventIds: [],
    cooldowns: {},
    history: [],
    badStreak: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
