/**
 * 程序入口。
 * 只做四件事：拿到画布 → 初始化舞台 → 注册场景 → 启动路由。
 * 任何游戏逻辑都不应该写在这里。
 */

import '@/styles/global.css';
import '@/styles/scenes.css';
import '@/styles/menu.css';

import { Router } from '@/app/router';
import { settingsStore } from '@/app/state';
import { initStage } from '@/render/canvas';
import { aboutScene } from '@/scenes/aboutScene';
import { bootScene } from '@/scenes/boot';
import { devArtScene } from '@/scenes/devArt';
import { loadScene } from '@/scenes/loadScene';
import { menuScene } from '@/scenes/menu';
import { newGameScene } from '@/scenes/newGameScene';
import { settingsScene } from '@/scenes/settingsScene';
import { stubScene } from '@/scenes/stubs';

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
const overlay = document.getElementById('overlay');

if (!canvas || !overlay) {
  throw new Error('index.html 缺少 #stage 或 #overlay 节点');
}

const stage = initStage(canvas, overlay);

/* 界面缩放：把设置里的 uiScale 落到 CSS 变量上 */
function applyUiScale(scale: number): void {
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}
applyUiScale(settingsStore.get().uiScale);
settingsStore.subscribe((s) => applyUiScale(s.uiScale));

const router = new Router(canvas, stage.ctx)
  .register('boot', bootScene)
  .register('menu', menuScene)
  .register('new-game', newGameScene)
  .register('load', loadScene)
  .register('settings', settingsScene)
  .register('about', aboutScene)
  .register('dev-art', devArtScene)
  // 以下三个是里程碑占位，实现后直接替换注册项即可
  .register('creation', () =>
    stubScene({
      id: 'creation',
      title: '角色工坊',
      milestone: 'M4',
      note: '这里会实现主角创建（姓名/性别/外观/性格）与同学、老师的自定义编辑。',
      background: 'classroom',
    }),
  )
  .register('play', () =>
    stubScene({
      id: 'play',
      title: '校园生活',
      milestone: 'M5',
      note: '这里会实现时段推进、随机事件、选择与结算的完整游玩循环。',
      background: 'classroom',
      backTo: 'menu',
    }),
  )
  .register('gallery', () =>
    stubScene({
      id: 'gallery',
      title: '事件图鉴',
      milestone: 'M7',
      note: '这里会列出你触发过的所有剧情，按学段分组，可回看当时的选择。',
      background: 'home',
    }),
  );

/* 开发用直达路由：地址栏加 #dev=art 直接进美术预览 */
const initialScene = location.hash === '#dev=art' ? 'dev-art' : 'boot';
router.start(initialScene, overlay);

// 方便在浏览器控制台里调试
declare global {
  interface Window {
    __game?: { router: Router; stage: typeof stage };
  }
}
window.__game = { router, stage };
