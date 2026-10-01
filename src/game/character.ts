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
  title?: string;
  setting?: string;
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

/** 身份标签最大长度 */
export const TITLE_MAX_LENGTH = 10;
/** 自由设定最大长度。给 AI 的上下文，太长会挤爆提示词，也要花更多 token */
export const SETTING_MAX_LENGTH = 200;

/**
 * 没填身份时按 role 推一个默认值。
 * 主角默认叫「学生」——TA 也可能是转学生、班长，但那是玩家自己改的事。
 */
export function defaultTitleFor(role: RoleId, isProtagonist = false): string {
  if (isProtagonist) return '学生';
  return roleMeta(role).name;
}

export function createCharacter(input: CreateCharacterInput): Character {
  const role = roleMeta(input.role);
  const isProtagonist = input.isProtagonist ?? false;
  const title = (input.title ?? '').trim().slice(0, TITLE_MAX_LENGTH);
  const setting = (input.setting ?? '').trim().slice(0, SETTING_MAX_LENGTH);

  return {
    id: input.id ?? shortId('ch'),
    name: input.name.trim() || '无名同学',
    role: input.role,
    title: title || defaultTitleFor(input.role, isProtagonist),
    setting,
    gender: input.gender ?? 'n',
    personality: input.personality ?? 'ordinary',
    appearance: clampAppearance(input.appearance ?? {}),
    bio: input.bio?.trim() ?? '',
    relation: clampRelation(input.relation ?? role.baseRelation),
    isProtagonist,
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

/** 好感称呼要用到的三个前提，缺一个就会算错档 */
export interface RelationBasis {
  /** 这个角色自己的身份 */
  role: RoleId;
  /** 这个角色自己的性别 */
  gender: Gender;
  /** 主角的性别——同龄人最高一档叫「哥们」还是「喜欢你」，靠它区分 */
  protagonistGender: Gender;
}

/**
 * 好感最高一档的称呼。这一档同时受两件事影响，少看一个就会出戏：
 *
 * 1. **身份**：同龄人说「喜欢你」没问题，班主任 / 妈妈说就不合适。
 *    而且这个称呼会跟着进 AI 提示词（`好感100(喜欢你)`），
 *    容易把模型带向「老师对学生有那方面意思」——师生恋是内容规则里明确禁止的。
 * 2. **双方性别**：同龄人里同性只能是哥们 / 闺蜜。这条踩过两次：
 *    - 一律「铁哥们」→ 女生拉满也叫铁哥们，不对；
 *    - 只看角色性别 → 主角是男生时，男同学拉满显示「喜欢你」，读起来又是一层别的意思；
 *      而女同学拉满显示「闺蜜」（同性词，用在异性身上）同样不对。
 *
 * 身份判定复用 data/roles.ts 里现成的 isTeacher / peer，不再手写一份清单，
 * 以后加新身份会自动落到正确的一档。
 */
function topTierLabel(basis: RelationBasis): string {
  const meta = roleMeta(basis.role);
  if (meta.isTeacher) return '特别信任你';
  if (!meta.peer) return '最亲的人';

  // 有一边没指定性别，就别往暧昧方向写
  if (basis.gender === 'n' || basis.protagonistGender === 'n') return '死党';
  // 同性：男生是哥们，女生是闺蜜
  if (basis.gender === basis.protagonistGender) return basis.gender === 'f' ? '闺蜜' : '铁哥们';
  // 异性：才会用到这一句
  return '喜欢你';
}

/**
 * 好感度分级，UI 与 AI 提示词共用。
 * 除最高一档外的称呼与身份/性别无关，是通用词，所以不用传 basis。
 */
export function relationLabel(v: number, basis: RelationBasis): { name: string; color: string } {
  if (v >= 80) return { name: topTierLabel(basis), color: '#6fbf73' };
  if (v >= 50) return { name: '好朋友', color: '#9ad5a0' };
  if (v >= 20) return { name: '聊得来', color: '#f2b134' };
  if (v > -20) return { name: '普通', color: '#9aa7b4' };
  if (v > -50) return { name: '有点僵', color: '#e07a5f' };
  if (v > -80) return { name: '不对付', color: '#e05c5c' };
  return { name: '结了梁子', color: '#b03a2e' };
}

/**
 * 角色的完整描述，丢给 AI 当上下文用。
 * `protagonistGender` 用来算好感最高一档的称呼（同性是哥们 / 闺蜜，异性才是「喜欢你」）。
 */
export function describeCharacter(c: Character, protagonistGender: Gender): string {
  const role = roleMeta(c.role);
  const p = personalityMeta(c.personality);
  const bits = [
    `${c.name}（${c.title || role.name}，${p.name}）`,
    role.promptHint,
    p.tags.join('、'),
  ];
  if (c.bio) bits.push(c.bio);
  // 玩家自己写的设定原样交给 AI，不做任何加工
  if (c.setting) bits.push(`补充设定：${c.setting}`);
  bits.push(
    `当前对主角好感 ${c.relation}（${
      relationLabel(c.relation, { role: c.role, gender: c.gender, protagonistGender }).name
    }）`,
  );
  return bits.filter(Boolean).join('；');
}

/** 名字后面跟着的身份标签，UI 到处都在用 */
export function displayTitle(c: Character): string {
  return c.title?.trim() || roleMeta(c.role).name;
}
