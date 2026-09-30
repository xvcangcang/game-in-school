/**
 * 画布与缩放。
 *
 * 画面内部分辨率**永远**是 320×180（逻辑像素），所有绘制坐标都基于它。
 * 变换到屏幕靠 CSS 宽高 + image-rendering: pixelated，这样像素永远方正。
 * 千万不要按 devicePixelRatio 去放大 canvas.width/height。
 */

export const STAGE_W = 320;
export const STAGE_H = 180;

export interface Stage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** 重新计算缩放，窗口尺寸变化时调用 */
  resize(): void;
}

export function initStage(canvas: HTMLCanvasElement, overlay: HTMLElement): Stage {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D');

  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  ctx.imageSmoothingEnabled = false;

  // overlay 不再跟着画布缩放，它铺满视口；这里只负责摆好画布
  void overlay;
  const app = canvas.parentElement;

  let lastW = -1;
  let lastH = -1;

  const stage: Stage = {
    canvas,
    ctx,
    resize(): void {
      const availW = window.innerWidth;
      const availH = window.innerHeight;
      if (availW === lastW && availH === lastH) return;
      lastW = availW;
      lastH = availH;

      const raw = Math.min(availW / STAGE_W, availH / STAGE_H);
      // 空间够就取整数倍，像素绝对干净；不够 2 倍（手机）时退化为小数倍，优先占满屏幕
      const scale = raw >= 2 ? Math.floor(raw) : raw;
      const cssW = Math.max(1, Math.round(STAGE_W * scale));
      const cssH = Math.max(1, Math.round(STAGE_H * scale));

      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      // 供 CSS 使用：竖屏时界面要避开画布占掉的那条带
      document.documentElement.style.setProperty('--stage-h', `${cssH}px`);

      // 竖屏 / 方屏：画布贴顶，界面用下方空间
      app?.classList.toggle('is-portrait', availW / availH < 1.2);
    },
  };

  stage.resize();
  window.addEventListener('resize', () => stage.resize());
  window.addEventListener('orientationchange', () => stage.resize());
  // 移动端地址栏收起/展开不会触发 resize，用 visualViewport 兜底
  window.visualViewport?.addEventListener('resize', () => stage.resize());

  return stage;
}

/** 取整绘制：所有像素绘制都应该走它，避免半像素造成糊边 */
export function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
