/**
 * 存档层：localStorage 多存档位 + JSON 导入导出 + 版本迁移。
 *
 * 设计要点
 * - 所有读取路径都保证「要么返回一个完整的 GameState，要么抛出一个可读的错误」，
 *   绝不返回半残对象，避免读取失败在游戏中途才炸。
 * - 迁移钩子 MIGRATIONS 从版本 n 迁到 n+1，逐级调用。
 */

import { defaultTitleFor } from '@/game/character';
import type { GameState, PhaseId, RoleId, SaveSlotMeta } from '@/game/types';
import { SAVE_VERSION } from '@/game/types';

export const SLOT_COUNT = 3;
const SLOT_PREFIX = 'cps:save:';

export function slotKey(slot: number): string {
  return `${SLOT_PREFIX}${slot}`;
}

/**
 * 版本迁移表：MIGRATIONS[n] 把版本 n 的存档升级到 n+1。
 * 加新版本时请**同时**在 game/types.ts 里把 SAVE_VERSION +1。
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  /** 1 → 2：Character 新增自由填写的 `title`（身份），按 role 补一个默认值 */
  1: (raw) => {
    const characters = Array.isArray(raw.characters) ? raw.characters : [];
    return {
      ...raw,
      version: 2,
      characters: characters.map((entry) => {
        if (typeof entry !== 'object' || entry === null) return entry;
        const ch = entry as Record<string, unknown>;
        if (typeof ch.title === 'string' && ch.title.trim()) return ch;

        const role = typeof ch.role === 'string' ? (ch.role as RoleId) : 'classmate';
        const isProtagonist = ch.isProtagonist === true;
        return { ...ch, title: defaultTitleFor(role, isProtagonist) };
      }),
    };
  },
};

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

/* ------------------------------------------------------------------ *
 * 校验与迁移
 * ------------------------------------------------------------------ */

/** 结构完整性检查：宁可报错，也不要让坏存档进到游戏里 */
function assertValidState(raw: unknown): asserts raw is GameState {
  if (typeof raw !== 'object' || raw === null) {
    throw new SaveError('存档内容不是对象');
  }
  const s = raw as Partial<GameState>;
  if (typeof s.day !== 'number' || typeof s.week !== 'number') {
    throw new SaveError('存档缺少时间字段');
  }
  if (!s.stats || typeof s.stats.study !== 'number') {
    throw new SaveError('存档缺少属性字段');
  }
  if (!Array.isArray(s.characters) || typeof s.protagonistId !== 'string') {
    throw new SaveError('存档缺少角色字段');
  }
}

/** 逐级迁移到当前版本 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let cur = raw;
  let guard = 0;
  while (typeof cur.version === 'number' && cur.version < SAVE_VERSION) {
    const from = cur.version;
    const fn = MIGRATIONS[from];
    if (!fn) break; // 没有迁移函数就停在这里，交给后续校验决定成败
    cur = fn(cur);
    if (typeof cur.version !== 'number' || cur.version <= from) {
      throw new SaveError(`迁移函数 ${from} 没有正确提升 version，已中止`);
    }
    if (++guard > 50) throw new SaveError('迁移循环过深，疑似迁移函数有误');
  }
  return cur;
}

/* ------------------------------------------------------------------ *
 * 读写
 * ------------------------------------------------------------------ */

export function saveGame(slot: number, state: GameState): void {
  const payload: GameState = { ...state, version: SAVE_VERSION, updatedAt: Date.now() };
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(payload));
  } catch (err) {
    throw new SaveError(`写入存档 ${slot} 失败（可能是空间不足或隐私模式）：${String(err)}`);
  }
}

export function loadGame(slot: number): GameState {
  const raw = localStorage.getItem(slotKey(slot));
  if (!raw) throw new SaveError(`存档 ${slot} 不存在`);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new SaveError(`存档 ${slot} 已损坏（JSON 解析失败）`);
  }
  const migrated = migrate(parsed);
  assertValidState(migrated);
  // 补齐可选字段，防止老存档缺键导致运行时 undefined
  const state = migrated as GameState;
  state.flags ??= [];
  state.seenEventIds ??= [];
  state.cooldowns ??= {};
  state.history ??= [];
  state.badStreak ??= 0;
  // 身份可能是空的（手改过存档、或迁移没覆盖到），补一个默认值，UI 就不会出现空白标签
  state.characters = state.characters.map((c) =>
    c.title?.trim() ? c : { ...c, title: defaultTitleFor(c.role, c.isProtagonist) },
  );
  return state;
}

export function deleteSlot(slot: number): void {
  localStorage.removeItem(slotKey(slot));
}

export function listSlots(): SaveSlotMeta[] {
  const out: SaveSlotMeta[] = [];
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    try {
      const state = loadGame(slot);
      out.push({
        slot,
        exists: true,
        phase: state.phase,
        protagonistName: state.characters.find((c) => c.isProtagonist)?.name,
        day: state.day,
        week: state.week,
        updatedAt: state.updatedAt,
      });
    } catch {
      out.push({ slot, exists: false });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 导入导出
 * ------------------------------------------------------------------ */

export function exportGame(slot: number): string {
  const state = loadGame(slot);
  return JSON.stringify(state, null, 2);
}

/** 从 JSON 文本导入，返回校验通过的存档对象（不自动写入某个槽位） */
export function importGame(json: string): GameState {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new SaveError('导入失败：不是合法的 JSON 文本');
  }
  const migrated = migrate(parsed);
  assertValidState(migrated);
  return migrated as GameState;
}

/** 下载为 .json 文件，方便同学之间互相传存档 */
export function downloadSave(slot: number, filename?: string): void {
  const text = exportGame(slot);
  const state = loadGame(slot);
  const name = filename ?? `${state.characters.find((c) => c.isProtagonist)?.name ?? '存档'}-第${state.week}周.json`;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type { PhaseId };
