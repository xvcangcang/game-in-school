/**
 * 日终小结的 AI 生成。
 *
 * 与事件生成不同，这里**不要求 JSON** —— 只要一两句人话，用 schema 去卡反而别扭。
 * 所以这里没有校验，只有「长度裁剪 + 失败返回 null」。
 * 调用方拿不到就直接用本地兜底句（见 game/dailySummary.ts 的 localHeadline），
 * 保证结算卡片任何时候都有内容。
 */

import { chat } from '@/ai/client';
import { buildDailySummaryPrompt, DAILY_SUMMARY_SYSTEM_PROMPT } from '@/ai/prompts';
import type { DailySummary } from '@/game/dailySummary';
import type { GameState } from '@/game/types';

/** 小结最多留这么多字，防止模型写一大段把卡片撑爆 */
const MAX_LENGTH = 80;

export async function generateDailyComment(
  state: GameState,
  summary: DailySummary,
): Promise<string | null> {
  try {
    const text = await chat({
      messages: [
        { role: 'system', content: DAILY_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: buildDailySummaryPrompt(state, summary) },
      ],
      temperature: 1.0,
      timeoutMs: 12000,
    });

    const clean = text
      .trim()
      // 模型有时会把整段用引号包起来，或者带个「日记：」前缀
      .replace(/^["'“”「]+|["'“”」]+$/g, '')
      .replace(/^(日记|小结|今天)[：:]\s*/, '')
      .trim();

    if (!clean) return null;
    return clean.length > MAX_LENGTH ? `${clean.slice(0, MAX_LENGTH)}…` : clean;
  } catch (err) {
    console.warn('[ai] 日终小结生成失败，用本地兜底句：', err);
    return null;
  }
}
