/**
 * NPC 自由对话：玩家在课间跟某个角色打字聊天。
 *
 * 注意这是一个「锦上添花」的功能：失败就显示一句「TA 没听清」，不影响主循环。
 */

import { AiError, chat, type ChatMessage } from '@/ai/client';
import { buildChatMessages, buildPingMessages } from '@/ai/prompts';
import type { GameState } from '@/game/types';

/** 每个角色的对话历史，按角色 id 分开存（不写进存档，属于会话态） */
const histories = new Map<string, ChatMessage[]>();

export function getChatHistory(characterId: string): ChatMessage[] {
  return histories.get(characterId) ?? [];
}

export function clearChatHistory(characterId?: string): void {
  if (characterId) histories.delete(characterId);
  else histories.clear();
}

export interface ReplyResult {
  text: string | null;
  error?: string;
}

export async function npcReply(
  state: GameState,
  characterId: string,
  playerMessage: string,
): Promise<ReplyResult> {
  const history = getChatHistory(characterId);
  const messages = buildChatMessages(state, characterId, playerMessage, history);

  try {
    const reply = await chat({ messages, temperature: 1.0, timeoutMs: 12000 });

    // 只有成功才写进历史，避免把失败也喂回模型
    history.push({ role: 'user', content: playerMessage });
    history.push({ role: 'assistant', content: reply });
    if (history.length > 16) history.splice(0, history.length - 16);
    histories.set(characterId, history);

    return { text: reply.trim() };
  } catch (err) {
    const code = err instanceof AiError ? err.code : 'NETWORK';
    return { text: null, error: `${code}：${err instanceof Error ? err.message : String(err)}` };
  }
}

/** 设置页「测试连接」用：发一个最小请求，确认这条路是通的 */
export async function pingAi(): Promise<{ ok: boolean; message: string }> {
  try {
    const reply = await chat({ messages: buildPingMessages(), temperature: 0, timeoutMs: 12000 });
    return { ok: true, message: `连通成功，模型回了：${reply.trim().slice(0, 60)}` };
  } catch (err) {
    const code = err instanceof AiError ? err.code : 'NETWORK';
    return { ok: false, message: `连通失败（${code}）：${err instanceof Error ? err.message : String(err)}` };
  }
}
