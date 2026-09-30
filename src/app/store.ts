/**
 * 极简可订阅容器。
 *
 * 故意不引状态库：项目里状态只有一个游戏状态 + 一个设置，用 60 行搞定，
 * 下一位 AI 不需要学任何东西。订阅回调里**不要**再 set 同一个 store（会递归）。
 */

export type Listener<T> = (value: T, prev: T) => void;

export class Store<T> {
  private value: T;
  private readonly listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  /** 直接替换 */
  set(next: T): void {
    if (Object.is(next, this.value)) return;
    const prev = this.value;
    this.value = next;
    this.emit(prev);
  }

  /** 浅拷贝改字段后通知。需要改嵌套结构时请自己造新对象再 set()。 */
  patch(patch: Partial<T>): void {
    this.set({ ...this.value, ...patch });
  }

  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(prev: T): void {
    for (const fn of Array.from(this.listeners)) {
      try {
        fn(this.value, prev);
      } catch (err) {
        console.error('[store] 订阅回调抛错：', err);
      }
    }
  }
}

/**
 * 轻量事件总线，用于「存档完成」「AI 请求开始/结束」这类跨层通知。
 * 玩法逻辑不要依赖它，它只服务于 UI 刷新。
 */
export class Bus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<(payload: unknown) => void>>();

  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const wrapped = fn as (payload: unknown) => void;
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] ${String(type)} 处理失败：`, err);
      }
    }
  }
}

export interface AppEvents {
  /** AI 请求状态变化，UI 用来显示「AI 正在编剧情…」 */
  'ai:status': { pending: number; lastError?: string };
  /** 存档写入完成 */
  'save:written': { slot: number };
  /** 设置变化 */
  'settings:changed': Record<string, never>;
}

export const bus = new Bus<AppEvents>();
