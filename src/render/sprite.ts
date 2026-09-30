/**
 * 程序化角色精灵。
 *
 * 16×24 像素的小人，完全由代码画出来，不依赖任何图片素材。
 * 外观由 game/types.ts 的 Appearance 描述（肤色索引、发型索引、发色、校服、配饰），
 * 所以 **新增部件只需改 data/appearances.ts 的数组 + 这里的 switch 分支**。
 *
 * 性能：精灵按「外观 + 朝向」缓存成离屏 canvas，绘制时只做一次 drawImage。
 */

import { HAIR_COLORS, SKIN_TONES, UNIFORMS } from '@/data/appearances';
import type { Appearance } from '@/game/types';
import { OUTLINE } from '@/render/palette';

export const SPRITE_W = 16;
export const SPRITE_H = 24;

export type Pose = 'front' | 'side' | 'back';

interface Painter {
  (c: CanvasRenderingContext2D): void;
}

function makeOffscreen(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建离屏 canvas');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function skinOf(a: Appearance): string {
  return SKIN_TONES[a.skin] ?? SKIN_TONES[0];
}

function hairOf(a: Appearance): string {
  return HAIR_COLORS.includes(a.hairColor) || /^#[0-9a-fA-F]{6}$/.test(a.hairColor)
    ? a.hairColor
    : HAIR_COLORS[0];
}

function uniformOf(a: Appearance): { body: string; accent: string; collar: string } {
  return UNIFORMS[a.uniform] ?? UNIFORMS[0];
}

/** 把头发颜色压暗，用于头发阴影 */
function darken(hex: string, factor = 0.7): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* ------------------------------------------------------------------ *
 * 绘制
 * ------------------------------------------------------------------ */

function drawHairBack(c: CanvasRenderingContext2D, a: Appearance, pose: Pose): void {
  const hair = hairOf(a);
  const dark = darken(hair);
  switch (a.hair) {
    case 2: // 马尾
      c.fillStyle = dark;
      c.fillRect(12, 4, 3, 9);
      c.fillRect(13, 12, 2, 2);
      break;
    case 5: // 双马尾
      c.fillStyle = dark;
      c.fillRect(1, 5, 3, 7);
      c.fillRect(12, 5, 3, 7);
      break;
    case 7: // 卷发
      c.fillStyle = dark;
      c.fillRect(2, 2, 12, 9);
      break;
    default:
      break;
  }
  if (pose === 'back') {
    c.fillStyle = hair;
    c.fillRect(3, 2, 10, 10);
  }
}

function drawHairFront(c: CanvasRenderingContext2D, a: Appearance): void {
  const hair = hairOf(a);
  const dark = darken(hair);
  c.fillStyle = hair;

  // 所有发型共有的一层「头顶」
  c.fillRect(3, 1, 10, 3);
  c.fillRect(3, 1, 1, 4);
  c.fillRect(12, 1, 1, 4);

  switch (a.hair) {
    case 0: // 短发
      c.fillRect(3, 4, 2, 2);
      c.fillRect(11, 4, 2, 2);
      break;
    case 1: // 齐耳
      c.fillRect(3, 4, 2, 5);
      c.fillRect(11, 4, 2, 5);
      break;
    case 2: // 马尾
      c.fillRect(3, 4, 2, 3);
      c.fillRect(11, 4, 2, 3);
      break;
    case 3: // 寸头
      c.clearRect(3, 3, 10, 3);
      c.fillRect(4, 1, 8, 2);
      c.fillRect(4, 3, 8, 1);
      break;
    case 4: // 凌乱
      c.fillRect(2, 1, 3, 2);
      c.fillRect(6, 0, 3, 2);
      c.fillRect(10, 1, 4, 2);
      c.fillRect(3, 4, 2, 3);
      c.fillRect(11, 4, 2, 3);
      break;
    case 5: // 双马尾
      c.fillRect(3, 4, 2, 4);
      c.fillRect(11, 4, 2, 4);
      break;
    case 6: // 蘑菇头
      c.fillRect(2, 1, 12, 5);
      c.fillRect(2, 4, 1, 3);
      c.fillRect(13, 4, 1, 3);
      break;
    case 7: // 卷发
      c.fillRect(1, 3, 2, 4);
      c.fillRect(13, 3, 2, 4);
      c.fillRect(3, 1, 3, 2);
      c.fillRect(9, 1, 3, 2);
      break;
    default:
      break;
  }

  // 刘海阴影，让头顶有点体积感
  c.fillStyle = dark;
  c.fillRect(4, 3, 8, 1);
}

function drawAccessory(c: CanvasRenderingContext2D, a: Appearance): void {
  switch (a.accessory) {
    case 1: // 眼镜
      c.fillStyle = OUTLINE;
      c.fillRect(4, 6, 3, 1);
      c.fillRect(4, 9, 3, 1);
      c.fillRect(4, 6, 1, 4);
      c.fillRect(6, 6, 1, 4);
      c.fillRect(9, 6, 3, 1);
      c.fillRect(9, 9, 3, 1);
      c.fillRect(9, 6, 1, 4);
      c.fillRect(11, 6, 1, 4);
      c.fillRect(7, 7, 2, 1);
      break;
    case 2: // 发带
      c.fillStyle = '#e05c5c';
      c.fillRect(3, 3, 10, 1);
      break;
    case 3: // 鸭舌帽
      c.fillStyle = '#3d6ea8';
      c.fillRect(3, 1, 10, 2);
      c.fillRect(1, 3, 14, 1);
      c.fillStyle = '#2c5282';
      c.fillRect(3, 3, 10, 1);
      break;
    case 4: // 耳机
      c.fillStyle = '#2b3a4a';
      c.fillRect(2, 6, 2, 4);
      c.fillRect(12, 6, 2, 4);
      c.fillRect(3, 2, 10, 1);
      break;
    case 5: // 创可贴
      c.fillStyle = '#e8dcc0';
      c.fillRect(9, 8, 2, 1);
      break;
    case 6: // 蝴蝶结
      c.fillStyle = '#e87ea1';
      c.fillRect(10, 1, 2, 2);
      c.fillRect(13, 1, 2, 2);
      c.fillRect(12, 2, 1, 1);
      break;
    default:
      break;
  }
}

/**
 * 把角色画进一个 16×24 的坐标系（原点在左上角）。
 * 内部函数，外部请用 drawCharacter / characterSprite。
 */
function paintCharacter(c: CanvasRenderingContext2D, a: Appearance, pose: Pose): void {
  const skin = skinOf(a);
  const uni = uniformOf(a);
  const hair = hairOf(a);
  const pants = '#3a4a5a';
  const feet = OUTLINE;

  c.clearRect(0, 0, SPRITE_W, SPRITE_H);

  drawHairBack(c, a, pose);

  // 腿与鞋
  c.fillStyle = pants;
  c.fillRect(4, 20, 3, 3);
  c.fillRect(9, 20, 3, 3);
  c.fillStyle = feet;
  c.fillRect(3, 23, 4, 1);
  c.fillRect(9, 23, 4, 1);

  // 身体
  c.fillStyle = uni.body;
  c.fillRect(3, 12, 10, 8);
  // 领口
  c.fillStyle = uni.collar;
  c.fillRect(6, 12, 4, 2);
  // 校服色块
  c.fillStyle = uni.accent;
  c.fillRect(3, 17, 10, 1);
  if (pose === 'back') {
    c.fillStyle = uni.accent;
    c.fillRect(7, 12, 2, 8);
  }

  // 手臂
  c.fillStyle = uni.body;
  if (pose === 'side') {
    c.fillRect(11, 13, 2, 6);
  } else {
    c.fillRect(2, 13, 2, 6);
    c.fillRect(12, 13, 2, 6);
  }
  c.fillStyle = skin;
  if (pose === 'side') {
    c.fillRect(11, 19, 2, 2);
  } else {
    c.fillRect(2, 19, 2, 2);
    c.fillRect(12, 19, 2, 2);
  }

  // 脸
  c.fillStyle = skin;
  c.fillRect(4, 3, 8, 8);
  // 脖子
  c.fillRect(6, 11, 4, 1);

  // 五官
  if (pose !== 'back') {
    c.fillStyle = OUTLINE;
    if (pose === 'side') {
      c.fillRect(8, 6, 1, 2);
      c.fillRect(10, 8, 1, 1);
    } else {
      c.fillRect(5, 6, 1, 2);
      c.fillRect(10, 6, 1, 2);
      // 脸颊腮红
      c.fillStyle = '#e8a0a0';
      c.fillRect(4, 8, 1, 1);
      c.fillRect(11, 8, 1, 1);
    }
  }

  drawHairFront(c, a);

  if (pose !== 'back') drawAccessory(c, a);

  // 统一描边：外轮廓压暗一圈，避免和背景糊在一起
  c.globalAlpha = 0.25;
  c.fillStyle = OUTLINE;
  c.fillRect(3, 12, 1, 8);
  c.fillRect(12, 12, 1, 8);
  c.globalAlpha = 1;

  void hair;
}

/* ------------------------------------------------------------------ *
 * 缓存与对外接口
 * ------------------------------------------------------------------ */

const cache = new Map<string, HTMLCanvasElement>();

function appearanceKey(a: Appearance, pose: Pose): string {
  return `${pose}|${a.skin}|${a.hair}|${a.hairColor}|${a.uniform}|${a.accessory}|${a.gender}`;
}

/** 取（或生成）角色精灵的离屏画布 */
export function characterSprite(a: Appearance, pose: Pose = 'front'): HTMLCanvasElement {
  const key = appearanceKey(a, pose);
  const hit = cache.get(key);
  if (hit) return hit;
  const { canvas, ctx } = makeOffscreen(SPRITE_W, SPRITE_H);
  paintCharacter(ctx, a, pose);
  cache.set(key, canvas);
  return canvas;
}

/** 在画布上画一个角色 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  a: Appearance,
  x: number,
  y: number,
  pose: Pose = 'front',
  flip = false,
): void {
  const sprite = characterSprite(a, pose);
  const dx = Math.round(x);
  const dy = Math.round(y);
  if (flip) {
    ctx.save();
    ctx.translate(dx + SPRITE_W, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(sprite, dx, dy);
  }
}

/**
 * 半身立绘：把精灵的头部区域放大若干倍，用于对话框。
 * 只放大整数倍并关闭平滑，保持像素感。
 */
export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  a: Appearance,
  x: number,
  y: number,
  scale = 3,
  pose: Pose = 'front',
): { w: number; h: number } {
  const sprite = characterSprite(a, pose);
  const sx = 2;
  const sy = 0;
  const sw = 12;
  const sh = 16;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, sx, sy, sw, sh, Math.round(x), Math.round(y), sw * scale, sh * scale);
  return { w: sw * scale, h: sh * scale };
}

/** 剪影：用于「还没解锁 / 不认识的人」 */
export function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  a: Appearance,
  x: number,
  y: number,
  color = '#0d1117',
): void {
  const sprite = characterSprite(a, 'front');
  const { canvas, ctx: tmp } = makeOffscreen(SPRITE_W, SPRITE_H);
  tmp.drawImage(sprite, 0, 0);
  tmp.globalCompositeOperation = 'source-in';
  tmp.fillStyle = color;
  tmp.fillRect(0, 0, SPRITE_W, SPRITE_H);
  ctx.drawImage(canvas, Math.round(x), Math.round(y));
}

/** 清空精灵缓存（改了部件表之后调试用） */
export function clearSpriteCache(): void {
  cache.clear();
}

export type { Painter as SpritePainter };
