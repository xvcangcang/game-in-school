/**
 * 主菜单场景 —— **M1 占位版本**，M3 会替换成完整主菜单
 * （新游戏 / 继续游戏 / 角色工坊 / 事件图鉴 / 设置）。
 */

import type { Scene, SceneContext } from '@/app/router';
import { STAGE_H, STAGE_W } from '@/render/canvas';

export function menuScene(): Scene {
  return {
    id: 'menu',
    mount(ctx: SceneContext): void {
      ctx.overlay.innerHTML = `
        <div class="boot-scene interactive">
          <h1 class="title-pixel">主菜单</h1>
          <p class="dim">M3 阶段实现：新游戏 / 继续游戏 / 角色工坊 / 事件图鉴 / 设置</p>
          <button class="pixel-btn" id="menu-back">返回</button>
        </div>
      `;
      ctx.overlay.querySelector('#menu-back')?.addEventListener('click', () => ctx.go('boot'));
    },
    unmount(): void {},
    render(c: CanvasRenderingContext2D): void {
      c.fillStyle = '#1b2430';
      c.fillRect(0, 0, STAGE_W, STAGE_H);
    },
  };
}
