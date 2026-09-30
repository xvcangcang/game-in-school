/**
 * 场景背景：全部程序化绘制的 320×180 像素图。
 *
 * 每个函数自己负责铺满整屏，调用方只管选哪个场景。
 * 新增场景的步骤：写一个 drawXxx → 加进 SCENE_PAINTERS → 在 SceneKind 里加名字。
 */

import { C, OUTLINE } from '@/render/palette';
import type { SceneKind } from '@/game/types';
import { SCENE_KIND_LIST, SCENE_KIND_NAME } from '@/game/types';

// 场景枚举的唯一来源是 game/types.ts（事件数据里也要用），这里只做转出
export type { SceneKind };
export { SCENE_KIND_LIST, SCENE_KIND_NAME };

/* ------------------------------------------------------------------ *
 * 通用零件
 * ------------------------------------------------------------------ */

function fill(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** 地板的横向条纹，越靠下条纹越宽，制造一点透视感 */
function drawFloor(c: CanvasRenderingContext2D, top: number, base: string, dark: string): void {
  fill(c, 0, top, 320, 180 - top, base);
  let gap = 6;
  let y = top + 6;
  while (y < 180) {
    fill(c, 0, y, 320, 1, dark);
    y += gap;
    if (gap < 16) gap += 1;
  }
}

/** 窗户：外框 + 天空 + 十字窗棂 */
function drawWindow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  sky: string,
  night = false,
): void {
  fill(c, x - 2, y - 2, w + 4, h + 4, '#8b9aa5');
  fill(c, x, y, w, h, sky);
  if (night) {
    fill(c, x + 4, y + 4, 2, 2, '#e8e6d9');
    fill(c, x + w - 12, y + 8, 2, 2, '#e8e6d9');
    fill(c, x + 14, y + h - 10, 2, 2, '#e8e6d9');
  } else {
    fill(c, x + 6, y + 5, 10, 4, '#ffffff55');
  }
  fill(c, x + Math.floor(w / 2) - 1, y, 2, h, '#8b9aa5');
  fill(c, x, y + Math.floor(h / 2) - 1, w, 2, '#8b9aa5');
}

/** 木纹桌面 */
function drawDesk(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  fill(c, x, y, w, h, C.desk);
  fill(c, x, y + h - 3, w, 3, C.deskDark);
  fill(c, x, y, w, 1, '#e8c08a');
  fill(c, x, y + h, 3, 10, '#5b4a3a');
  fill(c, x + w - 3, y + h, 3, 10, '#5b4a3a');
}

/* ------------------------------------------------------------------ *
 * 教室
 * ------------------------------------------------------------------ */

function drawClassroom(c: CanvasRenderingContext2D): void {
  fill(c, 0, 0, 320, 118, C.wall);
  fill(c, 0, 0, 320, 8, C.wallDark);

  // 黑板
  fill(c, 18, 20, 190, 66, C.wood);
  fill(c, 21, 23, 184, 60, C.blackboard);
  fill(c, 21, 23, 184, 3, C.blackboardDark);
  // 板书
  fill(c, 32, 32, 60, 2, '#ffffff88');
  fill(c, 32, 40, 96, 2, '#ffffff66');
  fill(c, 32, 48, 74, 2, '#ffffff66');
  fill(c, 32, 62, 40, 2, '#ffffff44');
  // 粉笔槽
  fill(c, 100, 86, 30, 3, '#e8dcc0');

  // 讲台
  drawDesk(c, 30, 92, 60, 20);

  // 窗户
  drawWindow(c, 232, 22, 66, 56, C.window);

  // 天花板灯
  fill(c, 110, 4, 100, 4, '#e8dcc0');
  fill(c, 120, 8, 80, 2, '#fff6cc');

  // 地板与课桌
  drawFloor(c, 118, C.floor, C.floorDark);
  const desks = [
    [40, 128],
    [130, 128],
    [220, 128],
  ];
  for (const [x, y] of desks) drawDesk(c, x, y, 62, 18);
}

/* ------------------------------------------------------------------ *
 * 走廊
 * ------------------------------------------------------------------ */

function drawCorridor(c: CanvasRenderingContext2D): void {
  fill(c, 0, 0, 320, 132, C.corridor);
  fill(c, 0, 0, 320, 6, C.corridorDark);

  // 左侧教室门
  for (let i = 0; i < 3; i++) {
    const x = 16 + i * 96;
    fill(c, x, 24, 44, 96, '#8a6f3d');
    fill(c, x + 3, 27, 38, 90, C.wood);
    fill(c, x + 3, 27, 38, 20, '#ffffff33');
    fill(c, x + 38, 66, 3, 6, '#3b3b3b');
  }

  // 右侧连廊栏杆与院子
  fill(c, 232, 30, 88, 96, '#a8dcc0');
  fill(c, 232, 84, 88, 42, C.grass);
  fill(c, 232, 92, 88, 2, C.grassDark);
  fill(c, 240, 46, 16, 20, '#6fbf73');
  fill(c, 272, 52, 20, 14, '#4f9354');

  // 地板
  drawFloor(c, 132, '#d9d9d9', '#b0b0b0');
  fill(c, 0, 130, 320, 4, C.corridorDark);
}

/* ------------------------------------------------------------------ *
 * 操场
 * ------------------------------------------------------------------ */

function drawPlayground(c: CanvasRenderingContext2D): void {
  fill(c, 0, 0, 320, 90, C.sky);
  fill(c, 0, 60, 320, 30, '#a8dcf0');
  fill(c, 250, 12, 18, 18, '#ffe89a');

  // 远处教学楼
  fill(c, 0, 52, 120, 44, '#c9bd9c');
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 2; j++) {
      fill(c, 8 + i * 22, 60 + j * 16, 12, 10, '#8fd3e8');
    }
  }

  // 围栏
  fill(c, 120, 66, 200, 4, '#b0b0b0');
  for (let x = 122; x < 320; x += 10) fill(c, x, 60, 2, 12, '#b0b0b0');

  // 跑道
  fill(c, 0, 90, 320, 26, '#b03a2e');
  fill(c, 0, 96, 320, 2, '#ffffff66');
  fill(c, 0, 112, 320, 2, '#ffffff66');

  // 草地
  fill(c, 0, 116, 320, 64, C.grass);
  fill(c, 0, 116, 320, 3, C.grassDark);
  for (let i = 0; i < 60; i++) {
    const x = (i * 53) % 320;
    const y = 124 + ((i * 37) % 50);
    fill(c, x, y, 2, 1, C.grassDark);
  }

  // 篮架
  fill(c, 250, 78, 3, 60, '#8b9aa5');
  fill(c, 236, 76, 20, 3, '#e8e6d9');
  fill(c, 240, 79, 12, 8, '#ffffff88');
  fill(c, 240, 87, 12, 2, '#e05c5c');
}

/* ------------------------------------------------------------------ *
 * 食堂
 * ------------------------------------------------------------------ */

function drawCafeteria(c: CanvasRenderingContext2D): void {
  fill(c, 0, 0, 320, 120, '#f0e6cf');
  fill(c, 0, 0, 320, 6, '#d6c9ab');

  // 打饭窗口
  fill(c, 20, 18, 140, 62, '#8b9aa5');
  fill(c, 24, 22, 132, 44, '#3d5170');
  fill(c, 24, 66, 132, 10, '#c9a227');
  // 菜盆
  fill(c, 34, 58, 24, 8, '#b0b0b0');
  fill(c, 66, 58, 24, 8, '#b0b0b0');
  fill(c, 98, 58, 24, 8, '#b0b0b0');
  fill(c, 130, 58, 20, 8, '#b0b0b0');

  // 菜单牌
  fill(c, 190, 20, 110, 52, '#2f6b4f');
  fill(c, 196, 26, 60, 2, '#ffffff88');
  fill(c, 196, 34, 84, 2, '#ffffff66');
  fill(c, 196, 42, 70, 2, '#ffffff66');
  fill(c, 196, 50, 90, 2, '#ffffff44');

  drawFloor(c, 120, '#e0d5bd', '#c4b79c');

  // 餐桌
  for (let i = 0; i < 2; i++) {
    const x = 24 + i * 150;
    fill(c, x, 132, 120, 10, '#e8e6d9');
    fill(c, x, 142, 120, 3, '#b0b0b0');
    fill(c, x + 20, 146, 8, 18, '#8b9aa5');
    fill(c, x + 92, 146, 8, 18, '#8b9aa5');
    // 凳子
    fill(c, x + 4, 152, 14, 5, '#e05c5c');
    fill(c, x + 102, 152, 14, 5, '#3d6ea8');
  }
  fill(c, 0, 164, 320, 16, '#cfc3a8');
}

/* ------------------------------------------------------------------ *
 * 家
 * ------------------------------------------------------------------ */

function drawHome(c: CanvasRenderingContext2D, night: boolean): void {
  fill(c, 0, 0, 320, 124, night ? '#3a4a5a' : '#e8dcc0');
  fill(c, 0, 116, 320, 8, '#c9bd9c');

  // 书桌 + 台灯
  fill(c, 24, 92, 110, 12, C.desk);
  fill(c, 24, 104, 110, 4, C.deskDark);
  fill(c, 34, 108, 6, 26, '#5b4a3a');
  fill(c, 118, 108, 6, 26, '#5b4a3a');
  fill(c, 130, 74, 4, 18, '#8b9aa5');
  fill(c, 122, 70, 20, 6, night ? '#ffe89a' : '#e8e6d9');
  if (night) fill(c, 108, 60, 50, 40, '#ffe89a22');

  // 书堆
  fill(c, 40, 84, 26, 8, '#b03a2e');
  fill(c, 44, 78, 22, 6, '#3d6ea8');
  fill(c, 42, 72, 20, 6, '#6fbf73');

  // 书架
  fill(c, 200, 40, 100, 84, '#8a6f3d');
  fill(c, 204, 44, 92, 76, '#6b5528');
  for (let s = 0; s < 3; s++) {
    fill(c, 206, 46 + s * 26, 88, 22, '#4a3a1a');
    for (let b = 0; b < 8; b++) {
      const h = 12 + ((b * 7 + s * 5) % 8);
      fill(c, 208 + b * 11, 68 + s * 26 - h, 8, h, ['#b03a2e', '#3d6ea8', '#6fbf73', '#f2b134'][(b + s) % 4]);
    }
  }

  // 窗户
  drawWindow(c, 152, 26, 40, 40, night ? C.nightSky : C.sky, night);

  drawFloor(c, 124, '#a9713d', '#8d5524');
}

/* ------------------------------------------------------------------ *
 * 办公室 / 教导处
 * ------------------------------------------------------------------ */

function drawOffice(c: CanvasRenderingContext2D): void {
  fill(c, 0, 0, 320, 126, '#dfe6ea');
  fill(c, 0, 0, 320, 6, '#b8c6cf');

  // 文件柜
  for (let i = 0; i < 3; i++) {
    fill(c, 18 + i * 46, 22, 40, 84, '#9aa7b4');
    fill(c, 21 + i * 46, 25, 34, 24, '#b8c6cf');
    fill(c, 21 + i * 46, 53, 34, 24, '#b8c6cf');
    fill(c, 21 + i * 46, 81, 34, 22, '#b8c6cf');
  }

  // 公告栏
  fill(c, 180, 24, 122, 62, '#8a6f3d');
  fill(c, 184, 28, 114, 54, '#f0e6cf');
  fill(c, 190, 34, 44, 40, '#ffffff');
  fill(c, 240, 34, 50, 18, '#ffe89a');
  fill(c, 240, 58, 50, 16, '#ffffff');

  drawFloor(c, 126, '#c9bd9c', '#a89a78');

  // 办公桌
  drawDesk(c, 90, 132, 140, 16);
  fill(c, 108, 120, 30, 12, '#e8e6d9');
  fill(c, 150, 118, 8, 14, '#3d5170');
}

/* ------------------------------------------------------------------ *
 * 对外接口
 * ------------------------------------------------------------------ */

export interface BackgroundOptions {
  /** 是否夜晚光照（教室/家/走廊可用） */
  night?: boolean;
}

const SCENE_PAINTERS: Record<SceneKind, (c: CanvasRenderingContext2D, o: BackgroundOptions) => void> =
  {
    classroom: (c) => drawClassroom(c),
    corridor: (c) => drawCorridor(c),
    playground: (c) => drawPlayground(c),
    cafeteria: (c) => drawCafeteria(c),
    home: (c, o) => drawHome(c, o.night ?? false),
    office: (c) => drawOffice(c),
  };

/** 画一整屏背景。画完会补一层夜间压暗（如果启用）。 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  kind: SceneKind,
  options: BackgroundOptions = {},
): void {
  const painter = SCENE_PAINTERS[kind] ?? SCENE_PAINTERS.classroom;
  painter(ctx, options);
  if (options.night) {
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#1a2340';
    ctx.fillRect(0, 0, 320, 180);
    ctx.globalAlpha = 1;
  }
  // 统一的外框，让画面和 DOM 覆盖层有视觉分隔
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(0, 0, 320, 1);
  ctx.fillRect(0, 179, 320, 1);
}
