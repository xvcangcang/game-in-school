/**
 * AI 事件生成。
 *
 * 调用链：prompts 组装上下文 → client 请求 → extractJson → schema 校验 → 转成 GameEvent。
 * 任何一步失败都返回 null，由 play 场景静默降级到内置事件库。**绝不抛给玩家看**。
 */

import { AiError, chat, extractJson } from '@/ai/client';
import { buildEventRetryPrompt, buildEventUserPrompt, EVENT_SYSTEM_PROMPT } from '@/ai/prompts';
import { validateEventDraft, type AiEventDraft } from '@/ai/schema';
import { checkCondition } from '@/game/conditions';
import type { GameEvent, GameState } from '@/game/types';

export interface GenerateEventResult {
  event: GameEvent | null;
  /** 失败原因，只用于日志/调试面板 */
  error?: string;
  /** 实际发起的请求次数 */
  attempts: number;
  /** 原始返回，调试用 */
  raw?: string;
}

let counter = 0;

/** 把校验通过的草稿转成引擎认识的 GameEvent */
export function draftToEvent(draft: AiEventDraft): GameEvent {
  counter += 1;
  return {
    id: `ai_${Date.now().toString(36)}_${counter}`,
    source: 'ai',
    title: draft.title,
    text: draft.text,
    tone: draft.tone,
    // AI 事件之间基本不会重复，权重给个中位数；冷却给 3 天避免同一局刷太多次相似的
    weight: 12,
    cooldownDays: 3,
    participants: draft.participants,
    scene: draft.scene,
    choices: draft.choices.map((c, i) => ({
      id: `c${i + 1}`,
      text: c.text,
      effects: c.effects,
      ...(c.resultText ? { resultText: c.resultText } : {}),
    })),
  };
}

/**
 * 生成一个 AI 事件。
 * 失败重试一次（带上失败原因），仍失败就返回 null。
 */
export async function generateAiEvent(state: GameState): Promise<GenerateEventResult> {
  let lastError = '';
  let rawText = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const userContent =
      attempt === 1 ? buildEventUserPrompt(state) : buildEventRetryPrompt(state, lastError);

    try {
      rawText = await chat({
        messages: [
          { role: 'system', content: EVENT_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        json: true,
      });
    } catch (err) {
      // 网络/超时/没 Key：重试没有意义，直接放弃
      const code = err instanceof AiError ? err.code : 'NETWORK';
      console.warn('[ai] 生成事件失败：', err);
      return { event: null, error: `${code}：${err instanceof Error ? err.message : String(err)}`, attempts: attempt };
    }

    let parsed: unknown;
    try {
      parsed = extractJson(rawText);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn('[ai] 返回不是合法 JSON：', lastError);
      continue;
    }

    const result = validateEventDraft(parsed, state);
    if (!result.ok) {
      lastError = result.error;
      console.warn('[ai] 校验不通过：', lastError);
      continue;
    }

    const event = draftToEvent(result.value);

    // 最后一道闸：选项条件必须至少有一个能选，否则这个事件玩家点了也没法继续
    if (!event.choices.some((c) => checkCondition(state, c.require))) {
      lastError = '生成的选项条件互相冲突，导致没有可选项';
      console.warn('[ai] ' + lastError);
      continue;
    }

    return { event, attempts: attempt, raw: rawText };
  }

  return { event: null, error: lastError || '未知错误', attempts: 2, raw: rawText };
}

/** 调试面板用：把一条 AI 事件还原成可读文本 */
export function describeAiEvent(event: GameEvent): string {
  const lines = [`【${event.title}】${event.text}`, `情绪：${event.tone}　场景：${event.scene}`];
  event.choices.forEach((c, i) => {
    const effects = JSON.stringify(c.effects);
    lines.push(`  ${i + 1}. ${c.text}${c.resultText ? ` → ${c.resultText}` : ''}　${effects}`);
  });
  return lines.join('\n');
}
