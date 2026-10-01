/**
 * 版本信息。
 *
 * **唯一出处是 package.json**，构建时由 vite.config.ts 注入进来。
 *
 * 为什么费这道手续：以前版本号写在三个地方（package.json / menu.ts / aboutScene.ts），
 * 发新版时十有八九漏改一两处，线上显示的还是旧号。现在要发新版，
 * 只改 package.json 里的 "version" 一行就够了。
 */

declare const __APP_VERSION__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

/**
 * 形如 "0.2.0"。
 * 在非 Vite 环境（node 探针脚本、单元测试）里会退回 'dev'，不会炸。
 */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** 构建时刻（毫秒）。线上行为和本地对不上时，先看一眼它是不是旧包 */
export const BUILD_TIME: number = (() => {
  const raw = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
})();

/** "v0.2.0" */
export function versionLabel(): string {
  return `v${APP_VERSION}`;
}

/**
 * "构建于 10 月 2 日 09:31"。
 * 没有注入信息时返回空串，调用方自己过滤掉即可。
 */
export function buildLabel(): string {
  if (!BUILD_TIME) return '';
  const d = new Date(BUILD_TIME);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `构建于 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}