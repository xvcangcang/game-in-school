/**
 * 程序入口。
 * M0 阶段只做一件事：把画布按 320×180 内部分辨率初始化并做整数倍缩放，
 * 在 DOM 覆盖层上放一个占位标题，确认「Canvas 画图 + DOM 写字」这条双层路线跑得通。
 * M1 起这里会交给 app/router.ts 接管场景切换。
 */

import './styles/global.css';

/** 画布内部分辨率（逻辑像素）。所有绘制坐标都基于这个尺寸。 */
export const STAGE_W = 320;
export const STAGE_H = 180;

const app = document.getElementById('app');
const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
const overlay = document.getElementById('overlay');

if (!app || !canvas || !overlay) {
  throw new Error('index.html 缺少 #app / #stage / #overlay 节点');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('浏览器不支持 Canvas 2D');
}

canvas.width = STAGE_W;
canvas.height = STAGE_H;
ctx.imageSmoothingEnabled = false;

/**
 * 把画布和覆盖层按「能装下的最大整数倍」缩放到可视区域。
 * 用整数倍是为了像素不糊；小于 1 倍（手机竖屏）时退化为小数倍并保持像素化渲染。
 */
function layout(): void {
  const pad = 0;
  const availW = window.innerWidth - pad;
  const availH = window.innerHeight - pad;
  const scale = Math.min(availW / STAGE_W, availH / STAGE_H);
  const snapped = scale >= 1 ? Math.floor(scale) : scale;

  const cssW = Math.round(STAGE_W * snapped);
  const cssH = Math.round(STAGE_H * snapped);

  canvas!.style.width = `${cssW}px`;
  canvas!.style.height = `${cssH}px`;
  overlay!.style.width = `${cssW}px`;
  overlay!.style.height = `${cssH}px`;
}

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', layout);
layout();

/** M0 占位画面：一块黑板，证明渲染管线是通的 */
function drawPlaceholder(): void {
  const c = ctx!;
  c.fillStyle = '#2f6b4f';
  c.fillRect(0, 0, STAGE_W, STAGE_H);
  c.fillStyle = '#24523c';
  for (let y = 0; y < STAGE_H; y += 4) {
    for (let x = 0; x < STAGE_W; x += 4) {
      if ((x / 4 + y / 4) % 7 === 0) c.fillRect(x, y, 2, 2);
    }
  }
  c.fillStyle = '#c9a227';
  c.fillRect(0, STAGE_H - 16, STAGE_W, 16);
  c.fillStyle = '#8a6f14';
  c.fillRect(0, STAGE_H - 4, STAGE_W, 4);
}

drawPlaceholder();

overlay.innerHTML = `
  <div class="interactive" style="margin:auto;text-align:center;padding:16px;">
    <h1 class="title-pixel">课间十分钟</h1>
    <p class="dim" style="margin:6px 0 14px;">M0 · 骨架就绪</p>
    <button class="pixel-btn pixel-btn--primary" id="boot-ok">开始</button>
  </div>
`;

document.getElementById('boot-ok')?.addEventListener('click', () => {
  overlay.innerHTML = `<p class="dim" style="margin:auto;">核心层开发中……（M1）</p>`;
});
