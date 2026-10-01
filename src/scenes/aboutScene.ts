/**
 * 关于页：玩法说明、操作说明、技术信息。
 * 也是给同学玩的时候唯一需要看的说明。
 */

import type { Scene, SceneContext } from '@/app/router';
import { buildLabel, versionLabel } from '@/app/version';
import { C } from '@/render/palette';
import { drawBackground } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import { createPageHeader } from '@/ui/components';
import { h } from '@/ui/dom';

const SECTIONS: { title: string; lines: string[] }[] = [
  {
    title: '怎么玩',
    lines: [
      '一天分五个时段：早自习 / 上午课 / 午休 / 下午课 / 晚自习。',
      '每个时段都可能随机发生剧情，你的选择会改变属性、同学关系和后面的剧情走向。',
      '学业、体力、心态、人气、老师好感、家庭期望、零花钱，七项属性互相牵扯。',
      '期末会按综合表现结算，三个学段走完会看到属于你的结局。',
    ],
  },
  {
    title: '操作',
    lines: [
      '键盘：↑↓ / W S 选择，Enter / 空格 确定，Esc 返回。',
      '触屏：直接点。所有按钮都做了 44px 以上的热区。',
      '手机横屏体验更好；竖屏也能玩，界面会自动收窄。',
    ],
  },
  {
    title: '关于 AI',
    lines: [
      '开着 AI：剧情会按当前学段、时段、在场角色临时生成，同一条线基本不会重样。',
      '没网 / 没配 Key / 超时：自动改用内置事件库，游戏不会卡住，剧情照样走。',
      'AI 生成的内容都会先过一遍结构校验，不合法的直接丢掉。',
    ],
  },
  {
    title: '技术',
    lines: [
      'Vite + TypeScript，画面用原生 Canvas 逐像素绘制，文字走网页层。',
      '所有美术都是代码画出来的，没有使用任何外部素材。',
      '存档只存在你自己的浏览器里；设置页可以一键导出配置（设置 + 阵容 + 全部存档），换台设备也能接着玩。',
    ],
  },
];

export function aboutScene(): Scene {
  return {
    id: 'about',

    mount(ctx: SceneContext): void {
      ctx.overlay.appendChild(
        h(
          'div',
          { class: 'page-scene' },
          createPageHeader(
            '关于《课间十分钟》',
            `${versionLabel()} · 初中校园像素剧情`,
            () => ctx.go('menu'),
          ),
          h(
            'div',
            { class: 'page-body interactive' },
            ...SECTIONS.map((sec) =>
              h(
                'section',
                { class: 'form-section' },
                h('h3', { class: 'section-title', text: sec.title }),
                ...sec.lines.map((line) => h('p', { class: 'about-line', text: line })),
              ),
            ),
            // 版本 + 构建时刻。线上行为和本地对不上时，先看这行是不是旧包
            h('p', {
              class: 'dim small-note',
              text: [versionLabel(), buildLabel()].filter(Boolean).join(' · '),
            }),
          ),
        ),
      );
    },

    unmount(): void {},

    render(c: CanvasRenderingContext2D): void {
      drawBackground(c, 'classroom', { night: true });
      c.globalAlpha = 0.68;
      c.fillStyle = C.void;
      px(c, 0, 0, STAGE_W, STAGE_H);
      c.globalAlpha = 1;
    },
  };
}
