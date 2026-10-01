/**
 * 设置页。
 *
 * 分三块：显示 / 声音 / AI 剧情。
 * AI 这块是给「分享给同学玩」场景准备的：
 *  - 用代理（推荐）：Key 在服务器上，同学打开就能用；
 *  - 直连 + 自己填 Key：纯静态部署（GitHub Pages 等）时的退路。
 */

import { pingAi } from '@/ai/chat';
import { aiUsageStats, hasServerProxy, resetAiUsage } from '@/ai/client';
import { settingsStore } from '@/app/state';
import { applySfxSetting, playAllSfx } from '@/ui/audio';
import type { Scene, SceneContext } from '@/app/router';
import { C } from '@/render/palette';
import { drawBackground } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import {
  createField,
  createPageHeader,
  createSelect,
  createSlider,
  createTextInput,
  createToast,
  createToggle,
  type ToastHandle,
} from '@/ui/components';
import { h } from '@/ui/dom';
import type { Settings } from '@/game/types';

const TEXT_SPEEDS: { value: Settings['textSpeed']; label: string }[] = [
  { value: 'slow', label: '慢（一字一顿）' },
  { value: 'normal', label: '正常' },
  { value: 'fast', label: '快' },
  { value: 'instant', label: '瞬间全出' },
];

const PRESET_PROVIDERS = [
  { label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-flash' },
  { label: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Moonshot', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: '本地 Ollama', baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' },
];

export function settingsScene(): Scene {
  let toast: ToastHandle | null = null;
  /** 需要在场景卸载时执行的清理（定时器之类），避免它们跟着场景一直跑 */
  const pendingCleanups: (() => void)[] = [];

  const patch = (fn: (s: Settings) => Settings): void => {
    settingsStore.set(fn(settingsStore.get()));
  };

  return {
    id: 'settings',

    mount(ctx: SceneContext): void {
      const s = settingsStore.get();
      toast = createToast();

      /*
       * 两种连接方式。
       * 玩家看的是「谁掏钱」，所以按钮文案走人话：
       *   开发者请客 = 请求打到本站 /api/llm，Key 在服务器上，玩家什么都不用配
       *   自备 Key   = 浏览器直连模型接口，Key 存在玩家自己机器上
       */
      const PROXY_HINT = '由本站服务器带着 Key 转发，你什么都不用配，Key 也不会出现在浏览器里。';
      const DIRECT_HINT =
        '浏览器直接连模型接口，需要你自己填一个 Key（只存在这台机器上）。纯静态部署或自测时用。';

      /*
       * API Key 输入框**永远可填**，不做禁用。
       *
       * 之前走代理时会把它灰掉，结果玩家根本没法粘贴自己的 Key，只会以为"输入框坏了"。
       * 而且灰掉在功能上也是错的：代理模式下一旦填了 Key，前端会把它作为 x-llm-key
       * 发出去，服务端优先用它（见 server/index.mjs 的 handleLlm）。
       * 所以正确的说法是「留空就用开发者的，填了就用你的」，而不是「不许填」。
       */
      const keyInput = createTextInput(
        s.ai.apiKey,
        (v) => patch((cur) => ({ ...cur, ai: { ...cur.ai, apiKey: v.trim() } })),
        { type: 'password', placeholder: 'sk-...（留空则用开发者提供的）', maxLength: 200 },
      );

      const proxyHint = h('p', {
        class: 'dim small-note',
        text: s.ai.useProxy ? PROXY_HINT : DIRECT_HINT,
      });

      /*
       * 「开发者请客」依赖同源的 /api/llm 代理，而纯静态托管（PocketBay 静态站、GitHub Pages…）
       * 上那个 Node 进程根本不存在，选了也是白等一轮超时再降级。
       *
       * 但不能无脑常显：本地开发（vite 的 /api 代理）和自建服务器上，这个选项是**好用**的，
       * 常显等于把一个能用的功能说死了。所以改成运行时探测（见 ai/client.ts 的 hasServerProxy），
       * 只在这台机器上确实没有代理时才警告。
       * 探测结果回来之前先不显示——宁可晚半秒，也别冤枉一个能用的功能。
       */
      let proxyAvailable: boolean | null = null;

      const proxyWarn = h(
        'span',
        { class: 'warn-inline' },
        h('span', { class: 'warn-mark', text: '!' }),
        h('span', { class: 'warn-text', text: '因部署平台自身问题，此选项不可用，请切换到自备APIkey' }),
      );

      const syncProxyWarn = (): void => {
        const missing = settingsStore.get().ai.useProxy && proxyAvailable === false;
        proxyWarn.style.display = missing ? '' : 'none';
      };
      syncProxyWarn();
      void hasServerProxy().then((ok) => {
        proxyAvailable = ok;
        syncProxyWarn();
      });

      const proxyToggle = createToggle(
        s.ai.useProxy,
        (v) => {
          patch((cur) => ({ ...cur, ai: { ...cur.ai, useProxy: v } }));
          proxyHint.textContent = v ? PROXY_HINT : DIRECT_HINT;
          syncProxyWarn();
        },
        ['开发者请客', '自备 Key'],
      );

      ctx.overlay.appendChild(
        h(
          'div',
          { class: 'page-scene' },
          createPageHeader('设置', '改完立刻生效并自动保存', () => ctx.go('menu')),
          h(
            'div',
            { class: 'page-body interactive' },
            /* ---------- 显示 ---------- */
            h(
              'section',
              { class: 'form-section' },
              h('h3', { class: 'section-title', text: '显示' }),
              createField({
                label: '文字速度',
                control: createSelect(TEXT_SPEEDS, s.textSpeed, (v) =>
                  patch((cur) => ({ ...cur, textSpeed: v })),
                ),
              }),
              createField({
                label: '界面缩放',
                hint: '手机上字太小时调大',
                control: createSlider(
                  s.uiScale,
                  0.8,
                  1.4,
                  0.05,
                  (v) => {
                    patch((cur) => ({ ...cur, uiScale: v }));
                    document.documentElement.style.setProperty('--ui-scale', String(v));
                  },
                  (v) => `${Math.round(v * 100)}%`,
                ),
              }),
            ),

            /* ---------- 声音 ---------- */
            h(
              'section',
              { class: 'form-section' },
              h('h3', { class: 'section-title', text: '声音' }),
              h(
                'div',
                { class: 'row-inline' },
                h('span', { class: 'field-label', text: '音效' }),
                createToggle(s.sfx, (v) => patch((cur) => ({ ...cur, sfx: v }))),
              ),
              createField({
                label: '音效音量',
                hint: '嫌吵就调小，或者直接关掉',
                control: createSlider(
                  typeof s.sfxVolume === 'number' ? s.sfxVolume : 0.5,
                  0,
                  1,
                  0.05,
                  (v) => {
                    patch((cur) => ({ ...cur, sfxVolume: v }));
                    applySfxSetting();
                  },
                  (v) => `${Math.round(v * 100)}%`,
                ),
              }),
              h(
                'div',
                { class: 'row-inline' },
                h('button', {
                  class: 'pixel-btn',
                  type: 'button',
                  text: '试听全部音效',
                  onClick: () => playAllSfx(),
                }),
                h('span', {
                  class: 'dim small-note',
                  text: '依次是：移动 / 点击 / 确认 / 好事 / 坏事 / 上课铃 / 升学 / 打字',
                }),
              ),
              h(
                'div',
                { class: 'row-inline' },
                h('span', { class: 'field-label', text: '背景音乐' }),
                createToggle(s.bgm, (v) => patch((cur) => ({ ...cur, bgm: v }))),
                h('span', { class: 'dim small-note', text: '（还没做，先占位）' }),
              ),
            ),

            /* ---------- AI ---------- */
            h(
              'section',
              { class: 'form-section' },
              h('h3', { class: 'section-title', text: 'AI 剧情' }),
              h(
                'div',
                { class: 'row-inline' },
                h('span', { class: 'field-label', text: '启用 AI 动态生成' }),
                createToggle(
                  s.ai.enabled,
                  (v) => patch((cur) => ({ ...cur, ai: { ...cur.ai, enabled: v } })),
                ),
              ),
              h(
                'div',
                { class: 'row-inline' },
                h('span', { class: 'field-label', text: '连接方式' }),
                proxyToggle,
                proxyWarn,
              ),
              proxyHint,
              h(
                'div',
                { class: 'row-inline preset-row' },
                h('span', { class: 'field-label', text: '预设服务商' }),
                ...PRESET_PROVIDERS.map((p) =>
                  h('button', {
                    class: 'pixel-btn chip',
                    type: 'button',
                    text: p.label,
                    onClick: () => {
                      patch((cur) => ({
                        ...cur,
                        ai: { ...cur.ai, baseURL: p.baseURL, model: p.model },
                      }));
                      toast?.show(`已填入 ${p.label}，记得确认模型名`, 'ok');
                      ctx.go('settings');
                    },
                  }),
                ),
              ),
              createField({
                label: '接口地址',
                hint: 'OpenAI 兼容，通常以 /v1 结尾',
                control: createTextInput(
                  s.ai.baseURL,
                  (v) => patch((cur) => ({ ...cur, ai: { ...cur.ai, baseURL: v.trim() } })),
                  { placeholder: 'https://api.deepseek.com/v1', maxLength: 200 },
                ),
              }),
              createField({
                label: '模型名',
                control: createTextInput(
                  s.ai.model,
                  (v) => patch((cur) => ({ ...cur, ai: { ...cur.ai, model: v.trim() } })),
                  { placeholder: 'deepseek-flash', maxLength: 100 },
                ),
              }),
              createField({
                label: 'API Key',
                hint: '留空就用开发者提供的；填了就用你自己的',
                control: keyInput,
              }),
              createField({
                label: '省 token',
                hint: '关掉模型的思考过程',
                control: createToggle(
                  s.ai.disableThinking !== false,
                  (v) => patch((cur) => ({ ...cur, ai: { ...cur.ai, disableThinking: v } })),
                  ['关思考', '让它想'],
                ),
              }),
              h('p', {
                class: 'dim small-note',
                text:
                  s.ai.disableThinking !== false
                    ? '实测一段剧情的输出里有六成是「思考」token，关掉能省一大笔。剧情质量略降，但没接上时还有内置事件库兜底。'
                    : '开着思考，剧情更稳，但每段要贵不少。',
              }),
              createField({
                label: '创造性',
                hint: '越高剧情越野',
                control: createSlider(
                  s.ai.temperature,
                  0,
                  1.5,
                  0.1,
                  (v) => patch((cur) => ({ ...cur, ai: { ...cur.ai, temperature: v } })),
                  (v) => v.toFixed(1),
                ),
              }),
              createField({
                label: '超时',
                hint: '超过就自动改用本地事件库',
                control: createSlider(
                  s.ai.timeoutMs,
                  3000,
                  20000,
                  1000,
                  (v) => patch((cur) => ({ ...cur, ai: { ...cur.ai, timeoutMs: v } })),
                  (v) => `${(v / 1000).toFixed(0)} 秒`,
                ),
              }),
              h(
                'div',
                { class: 'row-inline' },
                (() => {
                  const usageText = h('span', { class: 'dim small-note' });
                  const refreshUsage = (): void => {
                    const u = aiUsageStats();
                    usageText.textContent =
                      u.calls === 0
                        ? '本次会话还没调用过 AI。'
                        : `本次会话：${u.calls} 次调用 · 输入 ${u.promptTokens}（缓存命中 ${Math.round(
                            u.cacheHitRate * 100,
                          )}%）· 输出 ${u.completionTokens}（思考 ${u.reasoningTokens}）· 平均每次 ${u.avgPromptTokens}+${u.avgCompletionTokens} token`;
                  };
                  refreshUsage();

                  const timer = window.setInterval(refreshUsage, 1500);
                  // 场景卸载时清掉，别让定时器跟着跑
                  pendingCleanups.push(() => window.clearInterval(timer));

                  return h(
                    'div',
                    { class: 'form-section' },
                    h('h3', { class: 'section-title', text: '用量' }),
                    usageText,
                    h(
                      'div',
                      { class: 'row-inline' },
                      h('button', {
                        class: 'pixel-btn',
                        type: 'button',
                        text: '重置统计',
                        onClick: () => {
                          resetAiUsage();
                          refreshUsage();
                        },
                      }),
                      h('span', {
                        class: 'dim small-note',
                        text: '按上游返回的真实 usage 统计，只算本次打开页面之后的。',
                      }),
                    ),
                  );
                })(),
              ),
              h(
                'div',
                { class: 'row-inline' },
                (() => {
                  const btn = h('button', {
                    class: 'pixel-btn',
                    type: 'button',
                    text: '测试连接',
                  });
                  btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    const original = btn.textContent;
                    btn.textContent = '测试中…';
                    toast?.show('正在请求模型，最多等 12 秒', 'info');
                    const result = await pingAi();
                    btn.textContent = original;
                    btn.disabled = false;
                    toast?.show(result.message, result.ok ? 'ok' : 'error');
                  });
                  return btn;
                })(),
                h('span', { class: 'dim small-note', text: '发一个最小请求验证 Key、地址和模型名。' }),
              ),
            ),
          ),
          toast.el,
        ),
      );
    },

    unmount(): void {
      toast?.destroy();
      toast = null;
      for (const cleanup of pendingCleanups.splice(0)) cleanup();
    },

    render(c: CanvasRenderingContext2D): void {
      drawBackground(c, 'office');
      c.globalAlpha = 0.62;
      c.fillStyle = C.void;
      px(c, 0, 0, STAGE_W, STAGE_H);
      c.globalAlpha = 1;
    },
  };
}
