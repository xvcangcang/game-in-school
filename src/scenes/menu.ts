/**
 * 主菜单。
 *
 * 画面层（Canvas）画教室与几个站着的同学；文字层（DOM）放标题和菜单。
 * 菜单项按里程碑逐步点亮：M3 开放新游戏/继续/设置/关于，M4 角色工坊，M7 事件图鉴。
 */

import { listSlots } from '@/app/save';
import { settingsStore } from '@/app/state';
import { versionLabel } from '@/app/version';
import type { Scene, SceneContext } from '@/app/router';
import { C } from '@/render/palette';
import { drawCharacter } from '@/render/sprite';
import { drawBackground } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import { createMenuList, type MenuItem, type MenuListHandle } from '@/ui/components';
import { sfx } from '@/ui/audio';
import { h } from '@/ui/dom';
import { DEFAULT_APPEARANCE } from '@/data/appearances';

/** 站在讲台前的几个同学，纯装饰 */
const CROWD = [
  { x: 40, y: 104, pose: 'front' as const, ap: { ...DEFAULT_APPEARANCE, hair: 0, uniform: 0, accessory: 1 } },
  { x: 74, y: 104, pose: 'side' as const, ap: { ...DEFAULT_APPEARANCE, hair: 2, uniform: 1, accessory: 0 } },
  { x: 108, y: 104, pose: 'front' as const, ap: { ...DEFAULT_APPEARANCE, hair: 6, uniform: 2, accessory: 3 } },
  { x: 142, y: 104, pose: 'side' as const, ap: { ...DEFAULT_APPEARANCE, hair: 4, uniform: 3, accessory: 0 } },
  { x: 176, y: 104, pose: 'front' as const, ap: { ...DEFAULT_APPEARANCE, hair: 1, uniform: 4, accessory: 4 } },
];

export function menuScene(): Scene {
  let list: MenuListHandle | null = null;
  let t = 0;

  const buildItems = (ctx: SceneContext): MenuItem[] => {
    const slots = listSlots();
    const saveCount = slots.filter((s) => s.exists).length;

    return [
      { id: 'new', label: '新游戏', hint: '从初一 / 初二 / 初三开始', onSelect: () => ctx.go('new-game') },
      {
        id: 'load',
        label: '继续游戏',
        hint: saveCount > 0 ? `${saveCount} 个存档` : '暂无存档',
        disabled: saveCount === 0,
        onSelect: () => ctx.go('load'),
      },
      { id: 'creation', label: '角色工坊', hint: '捏主角、编辑同学和老师', onSelect: () => ctx.go('creation') },
      { id: 'gallery', label: '事件图鉴', hint: '回看触发过的剧情', onSelect: () => ctx.go('gallery') },
      { id: 'settings', label: '设置', hint: 'AI 接入 / 文字速度 / 音效', onSelect: () => ctx.go('settings') },
      { id: 'about', label: '关于', hint: versionLabel(), onSelect: () => ctx.go('about') },
    ];
  };

  return {
    id: 'menu',

    mount(ctx: SceneContext): void {
      const aiOn = settingsStore.get().ai.enabled;

      ctx.overlay.appendChild(
        h(
          'div',
          { class: 'menu-scene' },
          h(
            'div',
            { class: 'menu-brand' },
            h('h1', { class: 'title-pixel menu-title', text: '课间十分钟' }),
            h('p', { class: 'menu-tagline dim', text: '初中三年 · 每一个课间都可能出事' }),
          ),
          h('div', { class: 'menu-spacer' }),
          (() => {
            list = createMenuList(buildItems(ctx), {
              onFocusChange: () => sfx.move(),
            });
            return list.el;
          })(),
          h(
            'div',
            { class: 'menu-footer' },
            h('span', {
              class: `menu-badge ${aiOn ? 'is-on' : ''}`,
              text: aiOn ? 'AI 剧情：已启用' : 'AI 剧情：关闭（本地事件库）',
            }),
            h('span', { class: 'dim menu-ver', text: versionLabel() }),
          ),
        ),
      );
    },

    unmount(): void {
      list?.destroy();
      list = null;
    },

    update(dt: number): void {
      t += dt;
    },

    render(c: CanvasRenderingContext2D): void {
      drawBackground(c, 'classroom');

      // 站着的同学们，做一点点呼吸感
      const bob = Math.sin(t / 520) > 0 ? 0 : 1;
      CROWD.forEach((p, i) => {
        drawCharacter(c, p.ap, p.x, p.y + (i % 2 === 0 ? bob : 0), p.pose);
      });

      // 顶部暗角，让 DOM 标题更好读
      c.globalAlpha = 0.45;
      c.fillStyle = C.void;
      px(c, 0, 0, STAGE_W, 60);
      px(c, 0, STAGE_H - 26, STAGE_W, 26);
      c.globalAlpha = 1;
    },

    onKey(e: KeyboardEvent): boolean {
      return list?.handleKey(e) ?? false;
    },
  };
}
