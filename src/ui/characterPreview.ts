/**
 * 角色预览控件：一个正面 + 一个侧面小人，加一张放大的半身立绘。
 *
 * 内部分辨率很小（像素画本来就小），靠 CSS 放大 + image-rendering:pixelated 保持像素感。
 * 部件一改就 update()，不需要重建 DOM。
 */

import type { Appearance } from '@/game/types';
import { SPRITE_H, SPRITE_W, drawCharacter, drawPortrait } from '@/render/sprite';
import { h } from '@/ui/dom';

export interface PreviewHandle {
  el: HTMLElement;
  update(a: Appearance): void;
  /** 手动重绘（精灵缓存被清空后调用） */
  redraw(): void;
}

export function createCharacterPreview(initial: Appearance, opts: { showPortrait?: boolean } = {}): PreviewHandle {
  let current = initial;
  const showPortrait = opts.showPortrait ?? true;

  // 小人预览：左边正面、右边侧面，都是 1× 绘制，CSS 放大
  const body = h('canvas', { class: 'preview-sprite' });
  body.width = SPRITE_W * 2 + 6;
  body.height = SPRITE_H + 4;
  const bctx = body.getContext('2d');
  if (bctx) bctx.imageSmoothingEnabled = false;

  // 立绘预览：只裁头部区域
  const bust = h('canvas', { class: 'preview-bust' });
  const BUST_SCALE = 2;
  bust.width = 12 * BUST_SCALE;
  bust.height = 16 * BUST_SCALE;
  const uctx = bust.getContext('2d');
  if (uctx) uctx.imageSmoothingEnabled = false;

  function paint(): void {
    if (bctx) {
      bctx.clearRect(0, 0, body.width, body.height);
      drawCharacter(bctx, current, 1, 2, 'front');
      drawCharacter(bctx, current, SPRITE_W + 5, 2, 'side');
    }
    if (uctx && showPortrait) {
      uctx.clearRect(0, 0, bust.width, bust.height);
      drawPortrait(uctx, current, 0, 0, BUST_SCALE);
    }
  }

  paint();

  const el = h(
    'div',
    { class: 'char-preview' },
    h('div', { class: 'preview-stage' }, body),
    showPortrait ? h('div', { class: 'preview-stage' }, bust) : null,
    h('p', { class: 'dim preview-hint', text: '正面 / 侧面 · 立绘' }),
  );

  return {
    el,
    update(a: Appearance): void {
      current = a;
      paint();
    },
    redraw(): void {
      paint();
    },
  };
}
