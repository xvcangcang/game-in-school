/**
 * Canvas 侧的像素 UI 工具。
 *
 * 注意：这里**只画框、条、图标**，不画中文。
 * 所有文字（尤其中文）都交给 DOM 覆盖层，原因见 docs/设计方案.md 第 2 节。
 */

import { C, OUTLINE } from '@/render/palette';
import { drawPixelText, drawPixelTextRight } from '@/render/pixelFont';

export interface PanelOptions {
  fill?: string;
  border?: string;
  /** 是否画右下角的立体投影 */
  shadow?: boolean;
  /** 内层高光 */
  highlight?: boolean;
}

/** 像素面板：3px 硬边框 + 直角 + 可选投影 */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PanelOptions = {},
): void {
  const fillColor = opts.fill ?? C.panel;
  const border = opts.border ?? OUTLINE;
  const px = Math.round(x);
  const py = Math.round(y);
  const pw = Math.round(w);
  const ph = Math.round(h);

  if (opts.shadow) {
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(px + 3, py + 3, pw, ph);
  }
  ctx.fillStyle = fillColor;
  ctx.fillRect(px, py, pw, ph);

  if (opts.highlight) {
    ctx.fillStyle = '#ffffff22';
    ctx.fillRect(px + 3, py + 3, pw - 6, 2);
  }

  ctx.fillStyle = border;
  ctx.fillRect(px, py, pw, 3);
  ctx.fillRect(px, py + ph - 3, pw, 3);
  ctx.fillRect(px, py, 3, ph);
  ctx.fillRect(px + pw - 3, py, 3, ph);
}

export interface BarOptions {
  bg?: string;
  border?: string;
  /** 右侧是否显示数字（用点阵字，仅数字有效） */
  showValue?: boolean;
  label?: string;
  height?: number;
}

/** 属性条 */
export function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  value: number,
  max: number,
  color: string,
  opts: BarOptions = {},
): void {
  const h = opts.height ?? 7;
  const px = Math.round(x);
  const py = Math.round(y);
  const pw = Math.round(w);
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const innerW = pw - 4;
  const fillW = Math.round(innerW * ratio);

  ctx.fillStyle = opts.border ?? OUTLINE;
  ctx.fillRect(px, py, pw, h);
  ctx.fillStyle = opts.bg ?? '#1b2430';
  ctx.fillRect(px + 1, py + 1, pw - 2, h - 2);
  ctx.fillStyle = color;
  ctx.fillRect(px + 2, py + 2, fillW, h - 4);
  // 高光
  ctx.fillStyle = '#ffffff33';
  ctx.fillRect(px + 2, py + 2, fillW, 1);

  if (opts.label) {
    drawPixelText(ctx, opts.label, px, py - 7, C.textDim, 1);
  }
  if (opts.showValue) {
    drawPixelTextRight(ctx, String(Math.round(value)), px + pw - 3, py + h + 2, C.textDim, 1);
  }
}

/** 对话框外框（正文由 DOM 画在上面） */
export function drawDialogFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  drawPanel(ctx, x, y, w, h, { fill: '#101821', border: C.line, shadow: true, highlight: true });
}

/** 名牌 */
export function drawNamePlate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h = 16,
): void {
  drawPanel(ctx, x, y, w, h, { fill: C.panel2, border: C.accent, shadow: false });
}

/** 选中光标（一个闪烁的小三角） */
export function drawCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  blinkPhase: number,
): void {
  if (blinkPhase % 2 > 0.5) return;
  ctx.fillStyle = C.accent;
  const px = Math.round(x);
  const py = Math.round(y);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(px + i, py + i, 2, 2);
    ctx.fillRect(px + i, py + 8 - i, 2, 2);
  }
}

/** 头顶的对话气泡小三角 */
export function drawSpeechTail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color = '#101821',
): void {
  ctx.fillStyle = color;
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.fillRect(px, py, 10, 3);
  ctx.fillRect(px + 2, py + 3, 6, 3);
  ctx.fillRect(px + 4, py + 6, 2, 3);
}

/** 全屏渐暗，用于「重要剧情」聚焦 */
export function drawDim(ctx: CanvasRenderingContext2D, alpha = 0.5): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, 320, 180);
  ctx.globalAlpha = 1;
}

/** 顶部场景标签条（左侧显示场景名，右侧显示时间），文字走 DOM，这里只画条 */
export function drawTopBar(ctx: CanvasRenderingContext2D, x = 6, y = 5, w = 308, h = 15): void {
  drawPanel(ctx, x, y, w, h, { fill: '#101821cc', border: C.panel2, shadow: false });
}

/** 简单的八方向箭头（用于翻页提示），不依赖文本 */
export function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, color = C.accent): void {
  ctx.fillStyle = color;
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.fillRect(px, py, 2, 6);
  ctx.fillRect(px + 2, py + 2, 2, 2);
  ctx.fillRect(px - 2, py + 2, 2, 2);
}
