/**
 * 模型调用的唯一出口。
 *
 * 两种模式：
 *  - 走本站代理（settings.ai.useProxy）：请求发到 /api/llm，Key 在服务器上，前端看不到。
 *    这是分享给同学玩时的正确姿势。
 *  - 浏览器直连：直接打 {baseURL}/chat/completions，Key 来自本机 localStorage。
 *    只在开发者自测或纯静态部署时用。
 *
 * 无论哪种模式，都必须有超时；失败一律抛 AiError，由上层决定降级。
 */

import { settingsStore } from '@/app/state';
import type { AiConfig } from '@/game/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  /** 要求上游返回 JSON 对象（不是所有服务商都支持，不支持时会忽略） */
  json?: boolean;
  /** 覆盖设置里的超时 */
  timeoutMs?: number;
}

export type AiErrorCode =
  | 'DISABLED'
  | 'NO_KEY'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'BAD_RESPONSE'
  | 'ABORTED';

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}

/** AI 这条路现在通不通（注意：通 ≠ 一定成功，只是具备尝试条件） */
export function aiConfigured(): boolean {
  const cfg = settingsStore.get().ai;
  if (!cfg.enabled) return false;
  if (cfg.useProxy) return true; // 服务端有没有 Key 要请求了才知道
  return cfg.apiKey.trim().length > 0;
}

/* ------------------------------------------------------------------ *
 * 熔断
 * ------------------------------------------------------------------ *
 * 没有配 Key 的时候，每个时段都发一次注定失败的请求既费时又刷屏。
 * 连续失败就暂时闭麦一段时间，期间直接走本地事件库，到点了再试一次。
 */

const BREAKER_MS: Partial<Record<AiErrorCode, number>> = {
  NO_KEY: 5 * 60 * 1000,
  DISABLED: 60 * 1000,
  TIMEOUT: 45 * 1000,
  NETWORK: 45 * 1000,
  UPSTREAM: 60 * 1000,
  // BAD_RESPONSE 属于"这次答得不好"，不算连接问题，不触发熔断
};

let breakerUntil = 0;
let breakerCode: AiErrorCode | null = null;

function tripBreaker(code: AiErrorCode): void {
  const ms = BREAKER_MS[code];
  if (!ms) return;
  breakerUntil = Date.now() + ms;
  breakerCode = code;
}

/** 熔断中（这段时间内不要再尝试 AI） */
export function aiCircuitOpen(): boolean {
  return Date.now() < breakerUntil;
}

export function aiBreakerInfo(): { code: AiErrorCode | null; secondsLeft: number } {
  return {
    code: breakerCode,
    secondsLeft: Math.max(0, Math.ceil((breakerUntil - Date.now()) / 1000)),
  };
}

export function resetAiBreaker(): void {
  breakerUntil = 0;
  breakerCode = null;
}

/** 真正可以被调用的判断：配置齐全且没被熔断 */
export function aiReadyForAttempt(): boolean {
  return aiConfigured() && !aiCircuitOpen();
}

function endpointOf(cfg: AiConfig): string {
  return `${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`;
}

/** 从模型返回里抠出正文文本 */
function extractContent(payload: unknown): string {
  const p = payload as { choices?: { message?: { content?: unknown } }[]; error?: unknown };
  const content = p?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  throw new AiError('BAD_RESPONSE', '模型返回里没有可用的正文内容');
}

export async function chat(options: ChatOptions): Promise<string> {
  const cfg = settingsStore.get().ai;

  if (!cfg.enabled) throw new AiError('DISABLED', 'AI 生成已在设置里关闭');

  const timeoutMs = options.timeoutMs ?? cfg.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (cfg.useProxy) {
      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(cfg.apiKey.trim() ? { 'x-llm-key': cfg.apiKey.trim() } : {}),
        },
        body: JSON.stringify({
          messages: options.messages,
          temperature: options.temperature ?? cfg.temperature,
          model: cfg.model,
          json: options.json ?? false,
        }),
        signal: controller.signal,
      });

      const text = await res.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new AiError('BAD_RESPONSE', `代理返回的不是 JSON：${text.slice(0, 160)}`);
      }

      if (!res.ok) {
        const msg = (payload as { error?: string }).error ?? `代理返回 ${res.status}`;
        const code = (payload as { code?: string }).code;
        if (code === 'NO_SERVER_KEY') throw new AiError('NO_KEY', msg);
        if (code === 'TIMEOUT') throw new AiError('TIMEOUT', msg);
        throw new AiError('UPSTREAM', msg);
      }

      // 注意：本站代理返回的是已经规整过的 { content }，
      // 不是 OpenAI 原始的 choices[0].message.content，两者不能混用。
      const content = (payload as { content?: unknown }).content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new AiError('BAD_RESPONSE', '代理返回里没有 content 字段');
      }
      return content;
    }

    /* ---- 浏览器直连 ---- */
    if (!cfg.apiKey.trim()) {
      throw new AiError('NO_KEY', '没有填写 API Key，且当前是「浏览器直连」模式');
    }

    const res = await fetch(endpointOf(cfg), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: options.messages,
        temperature: options.temperature ?? cfg.temperature,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new AiError('BAD_RESPONSE', `接口返回的不是 JSON：${text.slice(0, 160)}`);
    }

    if (!res.ok) {
      const msg =
        (payload as { error?: { message?: string } }).error?.message ?? `接口返回 ${res.status}`;
      throw new AiError(res.status === 401 ? 'NO_KEY' : 'UPSTREAM', msg);
    }

    return extractContent(payload);
  } catch (err) {
    if (err instanceof AiError) {
      tripBreaker(err.code);
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      tripBreaker('TIMEOUT');
      throw new AiError('TIMEOUT', `超过 ${Math.round(timeoutMs / 1000)} 秒没有响应`);
    }
    tripBreaker('NETWORK');
    throw new AiError('NETWORK', `请求失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 从可能带 markdown 代码块的回复里抠出 JSON 对象 */
export function extractJson(text: string): unknown {
  let s = text.trim();

  // 去掉 ```json ... ``` 包裹
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1].trim();

  try {
    return JSON.parse(s);
  } catch {
    // 兜底：截取第一个 { 到最后一个 }
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        /* 继续往下抛 */
      }
    }
    throw new AiError('BAD_RESPONSE', `模型没有返回合法 JSON：${text.slice(0, 160)}`);
  }
}
