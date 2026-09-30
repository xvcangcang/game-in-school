/**
 * 角色工具：创建、查找、好感度描述。
 * 纯逻辑，不碰 DOM。
 */

import { clampAppearance } from '@/data/appearances';
import { personalityMeta } from '@/data/personalities';
import { roleMeta } from '@/data/roles';
import type { Appearance, Character, GameState, Gender, PersonalityId, RoleId } from '@/game/types';
import { shortId } from '@/app/rng';

export interface CreateCharacterInput {
  name: string;
  role: RoleId;
  gender?: Gender;
  personality?: PersonalityId;
  appearance?: Partial<Appearance>;
  bio?: string;
  relation?: number;
  isProtagonist?: boolean;
  preset?: boolean;
  aiGenerated?: boolean;
  id?: string;
}

export function createCharacter(input: CreateCharacterInput): Character {
  const role = roleMeta(input.role);
  return {
    id: input.id ?? shortId('ch'),
    name: input.name.trim() || '无名同学',
    role: input.role,
    gender: input.gender ?? 'n',
    personality: input.personality ?? 'ordinary',
    appearance: clampAppearance(input.appearance ?? {}),
    bio: input.bio?.trim() ?? '',
    relation: clampRelation(input.relation ?? role.baseRelation),
    isProtagonist: input.isProtagonist ?? false,
    preset: input.preset ?? false,
    aiGenerated: input.aiGenerated ?? false,
  };
}

export function clampRelation(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-100, Math.min(100, Math.round(v)));
}

export function findProtagonist(state: GameState): Character | undefined {
  return state.characters.find((c) => c.isProtagonist);
}

export function characterById(state: GameState, id: string): Character | undefined {
  return state.characters.find((c) => c.id === id);
}

/** 主角之外的 NPC */
export function npcs(state: GameState): Character[] {
  return state.characters.filter((c) => !c.isProtagonist);
}

/** 好感度分级，UI 与 AI 提示词共用 */
export function relationLabel(v: number): { name: string; color: string } {
  if (v >= 80) return { name: '铁哥们', color: '#6fbf73' };
  if (v >= 50) return { name: '好朋友', color: '#9ad5a0' };
  if (v >= 20) return { name: '聊得来', color: '#f2b134' };
  if (v > -20) return { name: '普通', color: '#9aa7b4' };
  if (v > -50) return { name: '有点僵', color: '#e07a5f' };
  if (v > -80) return { name: '不对付', color: '#e05c5c' };
  return { name: '结了梁子', color: '#b03a2e' };
}

/** 角色的完整描述，丢给 AI 当上下文用 */
export function describeCharacter(c: Character): string {
  const role = roleMeta(c.role);
  const p = personalityMeta(c.personality);
  const bits = [
    `${c.name}（${role.name}，${p.name}）`,
    role.promptHint,
    p.tags.join('、'),
  ];
  if (c.bio) bits.push(c.bio);
  bits.push(`当前对主角好感 ${c.relation}（${relationLabel(c.relation).name}）`);
  return bits.filter(Boolean).join('；');
}
