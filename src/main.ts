/**
 * 程序入口。
 * 只做四件事：拿到画布 → 初始化舞台 → 注册场景 → 启动路由。
 * 任何游戏逻辑都不应该写在这里。
 */

import '@/styles/global.css';
import '@/styles/scenes.css';

import { Router } from '@/app/router';
import { initStage } from '@/render/canvas';
import { bootScene } from '@/scenes/boot';
import { menuScene } from '@/scenes/menu';

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
const overlay = document.getElementById('overlay');

if (!canvas || !overlay) {
  throw new Error('index.html 缺少 #stage 或 #overlay 节点');
}

const stage = initStage(canvas, overlay);

const router = new Router(canvas, stage.ctx)
  .register('boot', bootScene)
  .register('menu', menuScene);

router.start('boot', overlay);

// 方便在浏览器控制台里调试：window.__game.router / window.__game.stage
declare global {
  interface Window {
    __game?: { router: Router; stage: typeof stage };
  }
}
window.__game = { router, stage };
