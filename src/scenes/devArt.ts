/**
 * 开发用美术预览场景（不属于正式玩法）。
 *
 * 打开方式：在地址栏加 `#dev=art`，或在 boot 场景点「美术预览」。
 * 用途：一屏看完所有发型、配饰、校服、朝向以及所有场景背景，
 * 改完 render/ 下的绘制代码后用它自查，不需要在游戏里跑半天才看到效果。
 *
 * 快捷键/按钮：切场景、切朝向。
 */

import { ACCESSORIES, HAIR_STYLES, SKIN_TONES, UNIFORMS } from '@/data/appearances';
import type { Scene, SceneContext } from '@/app/router';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import { drawPortrait, drawSilhouette, drawCharacter } from '@/render/sprite';
import {
  SCENE_KIND_LIST,
  SCENE_KIND_NAME,
  type SceneKind,
} from '@/render/tiles';
import { drawBackground } from '@/render/tiles';
import { C } from '@/render/palette';
import type { Appearance } from '@/game/types';

function specToAppearance(i: number, poseSkins = true): Appearance {
  return {
    gender: i % 3 === 0 ? 'm' : i % 3 === 1 ? 'f' : 'n',
    skin: poseSkins ? i % SKIN_TONES.length : 1,
    hair: i % HAIR_STYLES.length,
    hairColor: ['#1b1b1f', '#3b2314', '#6b4423', '#c9a227', '#b03a2e', '#2e86c1', '#d5d8dc'][i % 7],
    uniform: i % UNIFORMS.length,
    accessory: i % ACCESSORIES.length,
  };
}

export function devArtScene(): Scene {
  let kindIndex = 0;
  let t = 0;
  let showPortraits = false;

  const redrawLabels = (ctx: SceneContext): void => {
    const kind = SCENE_KIND_LIST[kindIndex];
    ctx.overlay.innerHTML = `
      <div class="dev-art-bar interactive">
        <button class="pixel-btn" id="dev-prev">◀ 场景</button>
        <span class="dev-art-name">${SCENE_KIND_NAME[kind]}</span>
        <button class="pixel-btn" id="dev-next">场景 ▶</button>
        <button class="pixel-btn" id="dev-portrait">${showPortraits ? '看全员' : '看立绘'}</button>
        <button class="pixel-btn" id="dev-back">返回</button>
      </div>
    `;
    ctx.overlay.querySelector('#dev-prev')?.addEventListener('click', () => {
      kindIndex = (kindIndex - 1 + SCENE_KIND_LIST.length) % SCENE_KIND_LIST.length;
      redrawLabels(ctx);
    });
    ctx.overlay.querySelector('#dev-next')?.addEventListener('click', () => {
      kindIndex = (kindIndex + 1) % SCENE_KIND_LIST.length;
      redrawLabels(ctx);
    });
    ctx.overlay.querySelector('#dev-portrait')?.addEventListener('click', () => {
      showPortraits = !showPortraits;
      redrawLabels(ctx);
    });
    ctx.overlay.querySelector('#dev-back')?.addEventListener('click', () => ctx.go('boot'));
  };

  return {
    id: 'dev-art',
    mount(ctx: SceneContext): void {
      redrawLabels(ctx);
    },
    unmount(): void {},
    update(dt: number): void {
      t += dt;
    },
    render(c: CanvasRenderingContext2D): void {
      const kind: SceneKind = SCENE_KIND_LIST[kindIndex];
      drawBackground(c, kind);

      if (showPortraits) {
        // 立绘网格：4 列 3 排
        for (let i = 0; i < 12; i++) {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const a = specToAppearance(i);
          drawPortrait(c, a, 10 + col * 76, 14 + row * 52, 3);
        }
        return;
      }

      // 精灵网格：8 列 5 排，展示发型 × 配饰
      const bob = Math.sin(t / 400) > 0 ? 0 : 1;
      for (let i = 0; i < 40; i++) {
        const col = i % 8;
        const row = Math.floor(i / 8);
        const a = specToAppearance(i);
        const x = 12 + col * 37;
        const y = 8 + row * 33 + (i % 3 === 0 ? bob : 0);
        drawCharacter(c, a, x, y, row % 3 === 0 ? 'front' : row % 3 === 1 ? 'side' : 'back');
      }

      // 剪影示例
      drawSilhouette(c, specToAppearance(4), 286, 140);
      drawSilhouette(c, specToAppearance(9), 300, 140, '#3d5170');

      // 底部说明条（DOM 里放文字，这里只压一条深色带）
      c.globalAlpha = 0.6;
      c.fillStyle = C.void;
      px(c, 0, STAGE_H - 14, STAGE_W, 14);
      c.globalAlpha = 1;
    },
    onKey(e: KeyboardEvent): boolean {
      if (e.key === 'ArrowRight') {
        kindIndex = (kindIndex + 1) % SCENE_KIND_LIST.length;
        return true;
      }
      if (e.key === 'ArrowLeft') {
        kindIndex = (kindIndex - 1 + SCENE_KIND_LIST.length) % SCENE_KIND_LIST.length;
        return true;
      }
      return false;
    },
  };
}
