/**
 * 本机设置持久化。
 * Key 前缀统一 cps:（Campus Pixel Story），方便一键清档。
 */

import type { AiConfig, Settings } from '@/game/types';

export const SETTINGS_KEY = 'cps:settings';
export const SETTINGS_VERSION = 1;

/**
 * 默认 AI 配置：默认走同源代理（Key 放服务端 .env.local，前端不暴露），
 * 这样同学直接用网址就能玩。开发者想直连自测，把 useProxy 关掉再填 Key 即可。
 *
 * 注意模型名会变。DeepSeek 2026 年只提供 `deepseek-flash`（便宜）和 `deepseek-v4-pro`，
 * 老的 `deepseek-chat` 已经查不到了。想知道当前有哪些，直接问接口：
 *   curl -H "Authorization: Bearer $KEY" https://api.deepseek.com/models
 */
export function defaultAiConfig(): AiConfig {
  return {
    enabled: true,
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-flash',
    apiKey: '',
    useProxy: true,
    temperature: 0.9,
    timeoutMs: 8000,
  };
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    textSpeed: 'normal',
    sfx: true,
    bgm: true,
    uiScale: 1,
    ai: defaultAiConfig(),
  };
}

/** 读取设置；任何异常都回退到默认值，绝不让游戏因为设置坏了而打不开 */
export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...base,
      ...parsed,
      version: SETTINGS_VERSION,
      ai: { ...base.ai, ...(parsed.ai ?? {}) },
    };
  } catch (err) {
    console.warn('[settings] 读取失败，使用默认设置：', err);
    return base;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[settings] 写入失败（可能是隐私模式）：', err);
  }
}
