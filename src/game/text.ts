/**
 * 事件文本的占位符替换。
 *
 * 支持：
 *   {主角}         → 主角姓名
 *   {npc_deskmate} → 对应角色 id 的姓名（找不到就原样保留，方便发现写错）
 *   {属性:study}   → 该属性的当前值
 *
 * 为什么要这么做：玩家可以给主角和所有 NPC 改名，事件库必须与具体名字解耦。
 *
 * 这里额外提供「不依赖 GameState」的版本（`renderTemplateWith` + `NameResolver`），
 * 因为图鉴在没有进行中的对局时也要能把占位符渲染成人名——
 * 直接显示 `{npc_math_teacher}` 会让人以为是 bug。
 */

import { characterById, findProtagonist } from '@/game/character';
import type { GameState, StatKey, Stats } from '@/game/types';

const TOKEN_RE = /\{([^{}]+)\}/g;

export interface NameResolver {
  /** 主角显示成什么 */
  protagonist: string;
  /** 角色 id → 姓名 */
  byId: Record<string, string>;
  /** 有对局时带上属性，支持 {属性:xxx} */
  stats?: Partial<Stats>;
}

/** 从当前对局生成名字解析表 */
export function nameResolverFromState(state: GameState): NameResolver {
  const byId: Record<string, string> = {};
  for (const c of state.characters) byId[c.id] = c.name;
  return {
    protagonist: findProtagonist(state)?.name ?? '你',
    byId,
    stats: state.stats,
  };
}

/** 从一份角色名单生成名字解析表（图鉴在没有对局时用） */
export function nameResolverFromRoster(
  roster: { id: string; name: string }[],
  protagonistName = '你',
): NameResolver {
  const byId: Record<string, string> = {};
  for (const c of roster) byId[c.id] = c.name;
  return { protagonist: protagonistName, byId };
}

/** 用解析表渲染文本 */
export function renderTemplateWith(text: string, names: NameResolver): string {
  if (!text.includes('{')) return text;

  return text.replace(TOKEN_RE, (whole, rawToken: string) => {
    const token = rawToken.trim();

    if (token === '主角') return names.protagonist;

    if (token.startsWith('属性:')) {
      const key = token.slice(3).trim() as StatKey;
      const value = names.stats?.[key];
      return typeof value === 'number' ? String(value) : whole;
    }

    const name = names.byId[token];
    return name ?? whole;
  });
}

export function renderTemplate(text: string, state: GameState): string {
  return renderTemplateWith(text, nameResolverFromState(state));
}

/** 文本里引用了哪些角色 id（AI 生成后用它检查有没有胡说） */
export function referencedCharacterIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const token = m[1].trim();
    if (token === '主角' || token.startsWith('属性:')) continue;
    out.push(token);
  }
  return out;
}

/** 仅用于兼容旧调用：取某个角色名，取不到返回 undefined */
export function characterNameOf(state: GameState, id: string): string | undefined {
  return characterById(state, id)?.name;
}
