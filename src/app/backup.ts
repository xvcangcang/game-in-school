/**
 * 整机配置的导出 / 导入 / 回滚。
 *
 * 为什么是「一锅端」而不是按项勾选：设置、阵容、主角模板、图鉴、三个存档本来就是一套，
 * 漏掉哪一块都会让玩家在另一台设备上觉得「少了东西」。所以直接把 localStorage 里
 * 所有 `cps:*` 打包——以后新增模块只要还用这个前缀，就会自动被带上，不用回来改这里。
 *
 * 「恢复原设定」靠的是**导入前自动存的一份快照**（`cps:pre-import`）：
 * 导错了文件不用手动清缓存，点一下就能退回导入前的状态。
 */

import { SETTINGS_KEY } from '@/app/settings';
import { slotKey } from '@/app/save';

/** 所有本机数据共用这个前缀（见 settings.ts / roster.ts / gallery.ts / save.ts） */
const PREFIX = 'cps:';

/** 导入前的快照放这儿。它自己不能被打进包里，否则每导入一次就套娃一层 */
const SNAPSHOT_KEY = 'cps:pre-import';

/** 启动自检用的临时键，不值得备份 */
const IGNORED = new Set<string>([`${PREFIX}__probe__`, SNAPSHOT_KEY]);

export const CONFIG_FORMAT = 'campus-pixel-story/config';
export const CONFIG_VERSION = 1;

export interface ConfigBundle {
  format: string;
  version: number;
  exportedAt: number;
  /** 键 → 值。原来是合法 JSON 的存成对象（人眼能看），否则原样存字符串 */
  data: Record<string, unknown>;
  /** data 里这几个键原本不是 JSON，写回时不要再 stringify */
  rawKeys?: string[];
}

export interface ConfigSummary {
  keys: number;
  hasSettings: boolean;
  rosterCount: number;
  protagonistName: string;
  galleryCount: number;
  saves: { slot: number; name: string; week: number; day: number }[];
}

export type ParseResult =
  | { ok: true; bundle: ConfigBundle }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ *
 * 读写 localStorage
 * ------------------------------------------------------------------ */

/** 列出所有属于本游戏的键 */
function listOwnKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX) && !IGNORED.has(key)) out.push(key);
    }
  } catch (err) {
    console.warn('[backup] 读取 localStorage 失败：', err);
  }
  return out;
}

function parseMaybeJson(raw: string): { value: unknown; wasJson: boolean } {
  try {
    return { value: JSON.parse(raw), wasJson: true };
  } catch {
    return { value: raw, wasJson: false };
  }
}

function writeValue(key: string, value: unknown, rawKeys: Set<string>): void {
  // 原本不是 JSON 的键，值就是那个字符串本身；其余一律 stringify，
  // 这样连「内容本身是个 JSON 字符串」这种边角情况也能原样还原
  localStorage.setItem(key, rawKeys.has(key) ? String(value) : JSON.stringify(value));
}

/** 把当前所有本机数据收成一个对象 */
export function collectAll(): { data: Record<string, unknown>; rawKeys: string[] } {
  const data: Record<string, unknown> = {};
  const rawKeys: string[] = [];

  for (const key of listOwnKeys()) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      continue;
    }
    if (raw === null) continue;

    const { value, wasJson } = parseMaybeJson(raw);
    data[key] = value;
    if (!wasJson) rawKeys.push(key);
  }

  return { data, rawKeys };
}

/** 清空本游戏的所有数据（不含快照） */
function clearAll(): void {
  for (const key of listOwnKeys()) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* 忽略 */
    }
  }
}

function writeAll(data: Record<string, unknown>, rawKeys: string[]): void {
  const raw = new Set(rawKeys);
  for (const [key, value] of Object.entries(data)) {
    // 只认自己的键，防止手改过的文件往里塞别人的数据
    if (!key.startsWith(PREFIX) || IGNORED.has(key)) continue;
    try {
      writeValue(key, value, raw);
    } catch (err) {
      console.warn(`[backup] 写入 ${key} 失败：`, err);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

export function buildBundle(): ConfigBundle {
  const { data, rawKeys } = collectAll();
  return {
    format: CONFIG_FORMAT,
    version: CONFIG_VERSION,
    exportedAt: Date.now(),
    data,
    rawKeys,
  };
}

/** 打包并下载成一个 .json 文件 */
export function downloadConfig(): void {
  const bundle = buildBundle();
  const text = JSON.stringify(bundle, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  a.href = url;
  a.download = `课间十分钟-配置-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ *
 * 解析与摘要
 * ------------------------------------------------------------------ */

/**
 * 解析玩家手动选的配置文件。
 * 严格版：必须带 format 标记，且真的含本机数据——免得误吃一个空壳文件把浏览器清空。
 */
export function parseBundle(text: string): ParseResult {
  return parseBundleText(text, true);
}

/**
 * 宽松版：允许 data 为空。
 *
 * 为什么要单独开一个口子：**在全新浏览器上导入时，导入前本来就是什么都没有**，
 * 快照自然是个空包。如果快照也走严格版，玩家一点「恢复原设定」就会得到
 * 「没有找到导入前的备份」——而这恰恰是最需要它的场景（导错了想退回空白）。
 */
function parseSnapshotBundle(text: string): ParseResult {
  return parseBundleText(text, false);
}

function parseBundleText(text: string, requireOwnData: boolean): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是合法的 JSON 文件' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: '文件内容不是一个对象' };
  }
  const b = parsed as Partial<ConfigBundle>;
  if (b.format !== CONFIG_FORMAT) {
    return { ok: false, error: '这不是「课间十分钟」的配置文件（缺少 format 标记）' };
  }
  if (typeof b.data !== 'object' || b.data === null || Array.isArray(b.data)) {
    return { ok: false, error: '配置文件里没有可用的 data' };
  }
  const own = Object.keys(b.data).filter((k) => k.startsWith(PREFIX));
  if (requireOwnData && own.length === 0) {
    return { ok: false, error: '配置文件里没有任何本机数据' };
  }

  return {
    ok: true,
    bundle: {
      format: CONFIG_FORMAT,
      version: typeof b.version === 'number' ? b.version : CONFIG_VERSION,
      exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : 0,
      data: b.data as Record<string, unknown>,
      rawKeys: Array.isArray(b.rawKeys) ? (b.rawKeys as string[]) : [],
    },
  };
}

function readFrom(data: Record<string, unknown>, key: string): unknown {
  return data[key];
}

/** 给玩家看的摘要，导入前用来确认「这个文件里到底有什么」 */
export function summarizeBundle(bundle: ConfigBundle): ConfigSummary {
  const { data } = bundle;
  const saves: ConfigSummary['saves'] = [];

  for (let slot = 1; slot <= 3; slot++) {
    const raw = readFrom(data, slotKey(slot));
    if (raw === undefined) continue;
    try {
      const s = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        characters?: { isProtagonist?: boolean; name?: string }[];
        week?: number;
        day?: number;
      };
      saves.push({
        slot,
        name: s.characters?.find((c) => c.isProtagonist)?.name ?? '无名',
        week: s.week ?? 0,
        day: s.day ?? 0,
      });
    } catch {
      saves.push({ slot, name: '（读不出来）', week: 0, day: 0 });
    }
  }

  const rosterRaw = readFrom(data, 'cps:roster');
  let rosterCount = 0;
  if (rosterRaw !== undefined) {
    try {
      const list = (typeof rosterRaw === 'string' ? JSON.parse(rosterRaw) : rosterRaw) as unknown;
      rosterCount = Array.isArray(list) ? list.length : 0;
    } catch {
      /* 读不出来就当 0 */
    }
  }

  const protagonistRaw = readFrom(data, 'cps:protagonist');
  let protagonistName = '';
  if (protagonistRaw !== undefined) {
    try {
      const t = (typeof protagonistRaw === 'string' ? JSON.parse(protagonistRaw) : protagonistRaw) as {
        name?: string;
      };
      protagonistName = t.name ?? '';
    } catch {
      /* 忽略 */
    }
  }

  const galleryRaw = readFrom(data, 'cps:gallery');
  let galleryCount = 0;
  if (galleryRaw !== undefined) {
    try {
      const g = (typeof galleryRaw === 'string' ? JSON.parse(galleryRaw) : galleryRaw) as unknown;
      galleryCount = Array.isArray(g) ? g.length : 0;
    } catch {
      /* 忽略 */
    }
  }

  return {
    keys: Object.keys(data).filter((k) => k.startsWith(PREFIX)).length,
    hasSettings: readFrom(data, SETTINGS_KEY) !== undefined,
    rosterCount,
    protagonistName,
    galleryCount,
    saves,
  };
}

/* ------------------------------------------------------------------ *
 * 导入与回滚
 * ------------------------------------------------------------------ */

/** 导入前的快照在不在 */
export function hasSnapshot(): boolean {
  try {
    return localStorage.getItem(SNAPSHOT_KEY) !== null;
  } catch {
    return false;
  }
}

/** 快照是什么时候拍的（给设置页显示用） */
export function snapshotTime(): number | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = parseSnapshotBundle(raw);
    return parsed.ok ? parsed.bundle.exportedAt : null;
  } catch {
    return null;
  }
}

function saveSnapshot(): void {
  const bundle = buildBundle();
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(bundle));
  } catch (err) {
    console.warn('[backup] 存快照失败，导入后将无法回滚：', err);
  }
}

/**
 * 应用一份配置。
 *
 * 顺序很重要：**先拍快照，再清空，最后写入**。
 * 清空是故意的——只往新配置里写、留着旧键的话，目标机器上多出来的存档位会和新配置混在一起，
 * 玩家会以为自己导错了文件。
 */
export function applyBundle(bundle: ConfigBundle): void {
  saveSnapshot();
  clearAll();
  writeAll(bundle.data, bundle.rawKeys ?? []);
}

/** 回滚到上一次导入之前。没有快照返回 false */
export function restoreSnapshot(): boolean {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SNAPSHOT_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;

  const parsed = parseSnapshotBundle(raw);
  if (!parsed.ok) return false;

  clearAll();
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* 忽略 */
  }
  writeAll(parsed.bundle.data, parsed.bundle.rawKeys ?? []);
  return true;
}