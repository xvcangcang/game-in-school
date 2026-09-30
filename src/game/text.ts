/**
 * 事件文本的占位符替换。
 *
 * 支持：
 *   {主角}         → 主角姓名
 *   {npc_deskmate} → 对应角色 id 的姓名（找不到就原样保留，方便发现写错）
 *   {属性:study}   → 该属性的当前值
 *
 * 为什么要这么做：玩家可以给主角和所有 NPC 改名，事件库必须与具体名字解耦。
 */

import { characterById, findProtagonist } from '@/game/character';
import type { GameState, StatKey } from '@/game/types';

const TOKEN_RE = /\{([^{}]+)\}/g;

export function renderTemplate(text: string, state: GameState): string {
  if (!text.includes('{')) return text;

  const protagonist = findProtagonist(state);

  return text.replace(TOKEN_RE, (whole, rawToken: string) => {
    const token = rawToken.trim();

    if (token === '主角') return protagonist?.name ?? '你';

    if (token.startsWith('属性:')) {
      const key = token.slice(3).trim() as StatKey;
      const value = state.stats[key];
      return typeof value === 'number' ? String(value) : whole;
    }

    const ch = characterById(state, token);
    if (ch) return ch.name;

    // 主角 id 也可能被直接引用
    if (protagonist && protagonist.id === token) return protagonist.name;

    return whole;
  });
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
