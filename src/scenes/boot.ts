/**
 * 启动场景。
 *
 * 职责有二：
 * 1. 做一次核心层自检（存档 API、设置读写、随机数可复现），把结果显示出来；
 * 2. 显示标题画面，等玩家按「开始」进入主菜单。
 *
 * 自检失败不会中断游戏，只会在界面上标红提示——玩家机器上的隐私模式可能禁用 localStorage。
 */

import { loadSettings } from '@/app/settings';
import { mulberry32 } from '@/app/rng';
import type { Scene, SceneContext } from '@/app/router';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

function runSelfCheck(): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. localStorage
  try {
    const probe = 'cps:__probe__';
    localStorage.setItem(probe, '1');
    const back = localStorage.getItem(probe);
    localStorage.removeItem(probe);
    results.push({ name: '本机存储', ok: back === '1', detail: back === '1' ? '可用' : '读写不一致' });
  } catch (err) {
    results.push({ name: '本机存储', ok: false, detail: `不可用：${String(err)}` });
  }

  // 2. 设置读写
  try {
    const s = loadSettings();
    results.push({
      name: '设置系统',
      ok: typeof s.textSpeed === 'string' && !!s.ai,
      detail: `文字速度=${s.textSpeed}，AI=${s.ai.enabled ? '启用' : '关闭'}`,
    });
  } catch (err) {
    results.push({ name: '设置系统', ok: false, detail: String(err) });
  }

  // 3. 随机数可复现
  try {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    let same = true;
    for (let i = 0; i < 16; i++) if (a() !== b()) same = false;
    results.push({
      name: '随机数种子',
      ok: same,
      detail: same ? '同种子结果一致（可复现剧情线）' : '同种子结果不一致！',
    });
  } catch (err) {
    results.push({ name: '随机数种子', ok: false, detail: String(err) });
  }

  return results;
}

export function bootScene(): Scene {
  let t = 0;

  return {
    id: 'boot',

    mount(ctx: SceneContext): void {
      const checks = runSelfCheck();
      const failed = checks.filter((c) => !c.ok);

      ctx.overlay.innerHTML = `
        <div class="boot-scene interactive">
          <h1 class="title-pixel">课间十分钟</h1>
          <p class="dim boot-sub">初中校园 · 像素剧情</p>
          <div class="boot-checks">
            ${checks
              .map(
                (c) =>
                  `<div class="boot-check"><span class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✔' : '✘'}</span> ${c.name}<span class="dim"> · ${c.detail}</span></div>`,
              )
              .join('')}
          </div>
          <button class="pixel-btn pixel-btn--primary" id="boot-start">开始游戏</button>
          <p class="dim boot-ver">v0.1.0 · M1 核心层</p>
        </div>
      `;

      const btn = ctx.overlay.querySelector<HTMLButtonElement>('#boot-start');
      btn?.addEventListener('click', () => {
        ctx.go('menu');
      });

      if (failed.length > 0) {
        console.warn('[boot] 自检未全部通过：', failed);
      }
    },

    unmount(): void {
      /* DOM 由路由器统一清理 */
    },

    update(dt: number): void {
      t += dt;
    },

    render(c: CanvasRenderingContext2D): void {
      // 黑板背景（真正的场景美术在 M2 接入）
      c.fillStyle = '#2f6b4f';
      px(c, 0, 0, STAGE_W, STAGE_H);
      c.fillStyle = '#24523c';
      const off = Math.floor(t / 400) % 2;
      for (let y = off; y < STAGE_H; y += 6) {
        for (let x = off; x < STAGE_W; x += 6) {
          px(c, x, y, 2, 2);
        }
      }
      c.fillStyle = '#c9a227';
      px(c, 0, STAGE_H - 14, STAGE_W, 14);
      c.fillStyle = '#8a6f14';
      px(c, 0, STAGE_H - 3, STAGE_W, 3);
    },

    onKey(e: KeyboardEvent): boolean {
      if (e.key === 'Enter' || e.key === ' ') return true;
      return false;
    },
  };
}
