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
  // 模型偶尔答非所问很正常，短时间闭麦即可，别把 AI 一路封死
  BAD_RESPONSE: 20 * 1000,
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

/* ------------------------------------------------------------------ *
 * 同源代理到底在不在
 * ------------------------------------------------------------------ *
 * 「开发者请客」依赖同源的 /api/llm，而纯静态托管（GitHub Pages、PocketBay 静态站…）
 * 根本没有那个 Node 进程，前端却看不出来。
 *
 * 不能只看状态码：静态站会把未知路径**回退成 index.html 并返回 200**，
 * GET /api/llm 在真实的代理上反而可能返回 405。所以判据是「返回的到底是不是 JSON」。
 * 用 /api/health 探，因为它只在真代理上存在，且不需要 Key。
 */

let proxyProbe: Promise<boolean> | null = null;

/** 探测同源代理是否可用。结果缓存，一次页面加载只探一次 */
export function hasServerProxy(): Promise<boolean> {
  proxyProbe ??= (async () => {
    try {
      const res = await fetch('/api/health', { headers: { accept: 'application/json' } });
      const payload: unknown = JSON.parse(await res.text());
      return (payload as { ok?: unknown })?.ok === true;
    } catch {
      // 不是 JSON、请求失败——都按「没有代理」处理
      return false;
    }
  })();
  return proxyProbe;
}

/* ------------------------------------------------------------------ *
 * 用量统计
 * ------------------------------------------------------------------ *
 * 起因：玩家反馈"token 消耗有点快"。光看提示词代码估不准（中文一个字大概就是一个 token，
 * 但角色列表、历史记录这些是随存档变化的），所以把上游返回的 usage 记下来，
 * 用真实数字决定该砍哪里。
 *
 * 顺带记 prompt_cache_hit_tokens：DeepSeek 这类服务会对**相同前缀**做缓存，
 * system 提示词每次一样就能命中，命中部分便宜很多。
 * 所以"砍提示词"要优先砍每次都不一样的那部分（角色列表、最近剧情），而不是 system。
 */

export interface AiUsageStats {
  calls: number;
  /** 输入 token 总数 */
  promptTokens: number;
  /** 其中命中缓存的部分 */
  cachedTokens: number;
  /** 输出 token 总数 */
  completionTokens: number;
  /** 输出里属于"模型思考"的部分（有些服务会单独返回，按输出价计费） */
  reasoningTokens: number;
}

const usageTotals: AiUsageStats = {
  calls: 0,
  promptTokens: 0,
  cachedTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
};

function recordUsage(raw: unknown): void {
  if (typeof raw !== 'object' || raw === null) return;
  const u = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const completionDetails = (u.completion_tokens_details ?? {}) as Record<string, unknown>;

  usageTotals.calls += 1;
  usageTotals.promptTokens += num(u.prompt_tokens);
  usageTotals.completionTokens += num(u.completion_tokens);
  usageTotals.cachedTokens += num(u.prompt_cache_hit_tokens);
  usageTotals.reasoningTokens += num(completionDetails.reasoning_tokens);
}

export function aiUsageStats(): AiUsageStats & {
  avgPromptTokens: number;
  avgCompletionTokens: number;
  avgReasoningTokens: number;
  cacheHitRate: number;
} {
  const c = Math.max(1, usageTotals.calls);
  return {
    ...usageTotals,
    avgPromptTokens: Math.round(usageTotals.promptTokens / c),
    avgCompletionTokens: Math.round(usageTotals.completionTokens / c),
    avgReasoningTokens: Math.round(usageTotals.reasoningTokens / c),
    cacheHitRate: Number(
      (usageTotals.promptTokens > 0
        ? usageTotals.cachedTokens / usageTotals.promptTokens
        : 0
      ).toFixed(3),
    ),
  };
}

export function resetAiUsage(): void {
  usageTotals.calls = 0;
  usageTotals.promptTokens = 0;
  usageTotals.cachedTokens = 0;
  usageTotals.completionTokens = 0;
  usageTotals.reasoningTokens = 0;
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
          // 关掉思考能砍掉六成输出 token，见 AiConfig.disableThinking
          ...(cfg.disableThinking === false ? {} : { reasoning_effort: 'none' }),
        }),
        signal: controller.signal,
      });

      const text = await res.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        // 返回的不是 JSON，说明 /api/llm 根本不是我们的代理
        // （典型情况：纯静态托管把未知路径回退成了 index.html）。
        // 这属于「接口不对」，按连接问题处理，让它触发熔断，别每回合都白试一次。
        throw new AiError(
          'NETWORK',
          `代理没有返回 JSON，可能是静态托管把 /api/llm 回退成了页面。内容开头：${text.slice(0, 80)}`,
        );
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
      recordUsage((payload as { usage?: unknown }).usage);
      const content = (payload as { content?: unknown }).content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new AiError('BAD_RESPONSE', '代理返回里没有 content 字段');
      }
      return content;
    }

    /* ---- 浏览器直连 ---- */
    if (!cfg.apiKey.trim()) {
      throw new AiError('NO_KEY', '当前是「自备 Key」模式，但还没有填写 API Key');
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
        ...(cfg.disableThinking === false ? {} : { reasoning_effort: 'none' }),
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      // 直连时返回非 JSON，通常是 baseURL 填错了（指到了某个网站的首页）
      throw new AiError(
        'NETWORK',
        `接口没有返回 JSON，检查一下接口地址是否写对。内容开头：${text.slice(0, 80)}`,
      );
    }

    if (!res.ok) {
      const msg =
        (payload as { error?: { message?: string } }).error?.message ?? `接口返回 ${res.status}`;
      throw new AiError(res.status === 401 ? 'NO_KEY' : 'UPSTREAM', msg);
    }

    recordUsage((payload as { usage?: unknown }).usage);
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
