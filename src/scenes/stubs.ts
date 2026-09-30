/**
 * 里程碑占位场景。
 *
 * 用它的地方表示「这个入口已经接上路由，但功能要到后面的里程碑才实现」。
 * 每个占位都写成独立场景，实现时直接替换注册项即可，不用改主菜单。
 */

import type { Scene, SceneContext } from '@/app/router';
import { C } from '@/render/palette';
import { drawBackground, type SceneKind } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import { createPageHeader } from '@/ui/components';
import { h } from '@/ui/dom';

export function stubScene(options: {
  id: string;
  title: string;
  milestone: string;
  note: string;
  background: SceneKind;
  backTo?: string;
}): Scene {
  return {
    id: options.id,

    mount(ctx: SceneContext): void {
      ctx.overlay.appendChild(
        h(
          'div',
          { class: 'page-scene' },
          createPageHeader(options.title, `${options.milestone} 实现`, () =>
            ctx.go(options.backTo ?? 'menu'),
          ),
          h(
            'div',
            { class: 'page-body interactive' },
            h(
              'div',
              { class: 'stub-box' },
              h('p', { class: 'stub-title', text: `${options.title} 还没做` }),
              h('p', { class: 'dim', text: options.note }),
            ),
          ),
        ),
      );
    },

    unmount(): void {},

    render(c: CanvasRenderingContext2D): void {
      drawBackground(c, options.background);
      c.globalAlpha = 0.62;
      c.fillStyle = C.void;
      px(c, 0, 0, STAGE_W, STAGE_H);
      c.globalAlpha = 1;
    },
  };
}
