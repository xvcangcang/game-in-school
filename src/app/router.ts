/**
 * 场景路由。
 *
 * 每个场景被激活时拿到一块专属的 overlay div（路由器负责创建和销毁），
 * 场景卸载时把它自己的 DOM 和事件监听都清干净——这样场景之间不会互相污染。
 *
 * 场景生命周期：mount() → 每帧 update()/render() → unmount()
 */

export interface SceneContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** 该场景专属的文本/菜单容器，卸载时会被整个删除 */
  overlay: HTMLElement;
  /** 切换到另一个场景 */
  go: (id: string, params?: unknown) => void;
}

export interface Scene {
  readonly id: string;
  mount(ctx: SceneContext, params?: unknown): void;
  unmount(): void;
  /** 每帧调用，dt 为距上一帧的毫秒数 */
  update?(dt: number): void;
  /** 每帧调用，负责画面绘制 */
  render?(ctx: CanvasRenderingContext2D, dt: number): void;
  /** 键盘事件；返回 true 表示已消化，不再向下传 */
  onKey?(e: KeyboardEvent): boolean;
}

export type SceneFactory = () => Scene;

export class Router {
  private readonly factories = new Map<string, SceneFactory>();
  private current: Scene | null = null;
  private currentId = '';
  private currentOverlay: HTMLElement | null = null;
  private host: HTMLElement | null = null;
  private rafId = 0;
  private lastTs = 0;

  private readonly keyHandler = (e: KeyboardEvent): void => {
    if (this.current?.onKey?.(e)) e.preventDefault();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
  ) {}

  register(id: string, factory: SceneFactory): this {
    this.factories.set(id, factory);
    return this;
  }

  currentSceneId(): string {
    return this.currentId;
  }

  /** 启动主循环 */
  start(initialSceneId: string, host: HTMLElement): void {
    this.host = host;
    window.addEventListener('keydown', this.keyHandler);
    this.go(initialSceneId);
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.keyHandler);
    try {
      this.current?.unmount();
    } catch (err) {
      console.error('[router] 场景卸载异常：', err);
    }
    this.current = null;
    this.currentOverlay?.remove();
    this.currentOverlay = null;
  }

  go(id: string, params?: unknown): void {
    const factory = this.factories.get(id);
    if (!factory) {
      console.error(`[router] 场景未注册：${id}`);
      return;
    }

    try {
      this.current?.unmount();
    } catch (err) {
      console.error(`[router] ${this.currentId} 卸载异常：`, err);
    }
    this.currentOverlay?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'scene-overlay';
    overlay.dataset.scene = id;
    this.host?.appendChild(overlay);
    this.currentOverlay = overlay;

    const sceneCtx: SceneContext = {
      canvas: this.canvas,
      ctx: this.ctx,
      overlay,
      go: (nextId, nextParams) => this.go(nextId, nextParams),
    };

    const scene = factory();
    this.current = scene;
    this.currentId = id;
    try {
      scene.mount(sceneCtx, params);
    } catch (err) {
      console.error(`[router] 场景 ${id} 挂载失败：`, err);
      overlay.innerHTML = `<p class="dim" style="padding:12px;">场景加载失败：${String(err)}</p>`;
    }
  }

  private readonly tick = (ts: number): void => {
    const dt = Math.min(100, ts - this.lastTs); // 夹取，避免切后台回来后一帧跳太远
    this.lastTs = ts;
    try {
      this.current?.update?.(dt);
      this.current?.render?.(this.ctx, dt);
    } catch (err) {
      console.error('[router] 场景渲染异常：', err);
    }
    this.rafId = requestAnimationFrame(this.tick);
  };
}
