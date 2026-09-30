/**
 * 可播种伪随机数。
 *
 * 为什么不用 Math.random()：
 * 存档里保存 seed，读档时用同一个 seed 重建随机流，就能精确复现同一条剧情线，
 * 排查「AI 说这个事件不该出现」这类问题时极其有用。**游戏内所有随机都必须走这里。**
 */

/** mulberry32：32 位状态、质量够用、实现极短 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 随机数门面，供游戏逻辑使用 */
export class Rng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** [0, 1) */
  float(): number {
    return this.next();
  }

  /** [min, max] 的整数 */
  int(min: number, max: number): number {
    if (max < min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** [0, n) 的整数 */
  index(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** 概率判定 */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 从数组里随机取一个 */
  pick<T>(arr: readonly T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[this.index(arr.length)];
  }

  /** 洗牌（返回新数组） */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.index(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** 按权重取下标，权重需为非负数且总和大于 0 */
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
    if (total <= 0) return 0;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
}

/** 生成一个新的随机种子（只在「新建游戏」时用一次，可以用 Math.random） */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** 生成短 id，用于角色 / 事件 */
export function shortId(prefix = 'id'): string {
  const s = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${s}`;
}
