/**
 * 程序入口。
 * 只做四件事：拿到画布 → 初始化舞台 → 注册场景 → 启动路由。
 * 任何游戏逻辑都不应该写在这里。
 */

import '@/styles/global.css';
import '@/styles/scenes.css';
import '@/styles/menu.css';
import '@/styles/play.css';

import { Router } from '@/app/router';
import { settingsStore } from '@/app/state';
import { resetAiBreaker, aiUsageStats, resetAiUsage } from '@/ai/client';
import { initStage } from '@/render/canvas';
import { aboutScene } from '@/scenes/aboutScene';
import { bootScene } from '@/scenes/boot';
import { creationScene } from '@/scenes/creation';
import { devArtScene } from '@/scenes/devArt';
import { galleryScene } from '@/scenes/gallery';
import { loadScene } from '@/scenes/loadScene';
import { menuScene } from '@/scenes/menu';
import { newGameScene } from '@/scenes/newGameScene';
import { playScene } from '@/scenes/play';
import { settingsScene } from '@/scenes/settingsScene';
import { applySfxSetting, audioStatsSnapshot, resetAudioStats, sfx } from '@/ui/audio';

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
settingsStore.subscribe((s) => {
  applyUiScale(s.uiScale);
  // 玩家刚改过 AI 配置，之前因为没 Key / 超时被熔断的请求应该立刻允许重试
  resetAiBreaker();
  // 音效开关直接作用在音频母线上，关掉时正在响的也会立刻安静
  applySfxSetting();
});

/* 全局按钮音效：一个委托监听就够，不必每个按钮自己接。
   选项按钮排除在外——它有自己的"好事/坏事"音效，再叠一层点击音就吵了。 */
document.addEventListener(
  'click',
  (e) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.classList.contains('choice-btn') || btn.classList.contains('opt')) return;
    sfx.click();
  },
  true,
);

const router = new Router(canvas, stage.ctx)
  .register('boot', bootScene)
  .register('menu', menuScene)
  .register('new-game', newGameScene)
  .register('load', loadScene)
  .register('settings', settingsScene)
  .register('about', aboutScene)
  .register('dev-art', devArtScene)
  .register('creation', creationScene)
  .register('play', playScene)
  .register('gallery', galleryScene);

/* 开发用直达路由：地址栏加 #dev=art 直接进美术预览 */
const initialScene = location.hash === '#dev=art' ? 'dev-art' : 'boot';
router.start(initialScene, overlay);

// 方便在浏览器控制台里调试
declare global {
  interface Window {
    __game?: {
      router: Router;
      stage: typeof stage;
      sfx: typeof sfx;
      audioStats: typeof audioStatsSnapshot;
      resetAudioStats: typeof resetAudioStats;
      aiUsage: typeof aiUsageStats;
      resetAiUsage: typeof resetAiUsage;
    };
  }
}
window.__game = {
  router,
  stage,
  sfx,
  audioStats: audioStatsSnapshot,
  resetAudioStats,
  // 调试用：window.__game.aiUsage() 看这次会话烧了多少 token
  aiUsage: aiUsageStats,
  resetAiUsage,
};
