/**
 * AI 输出的结构校验与归一化。
 *
 * **这是安全底线**：提示词只能"请求"模型听话，真正拦住垃圾数据的是这里。
 * 原则：
 *  - 结构性错误（缺字段、类型不对、选项数量不对）→ 整条丢掉，绝不半残入库
 *  - 数值类错误（属性越界、角色 id 不认识）→ 夹取或剔除，尽量救活这条事件
 *  - 无论哪种，都不允许出现事件库里没有的属性键或角色 id
 */

import type { Effects, EventTone, GameState, SceneKind, StatKey, Stats } from '@/game/types';
import { SCENE_KIND_LIST, STAT_KEYS, STAT_META } from '@/game/types';
import { referencedCharacterIds } from '@/game/text';

export interface AiChoiceDraft {
  text: string;
  resultText?: string;
  effects: Effects;
}

export interface AiEventDraft {
  title: string;
  text: string;
  tone: EventTone;
  scene: SceneKind;
  participants: string[];
  choices: AiChoiceDraft[];
}

export type ValidationResult =
  | { ok: true; value: AiEventDraft }
  | { ok: false; error: string };

const TONES: EventTone[] = ['good', 'bad', 'neutral'];

/** 单个属性一次最多能变动多少 */
const STAT_LIMIT = 15;
const MONEY_LIMIT = 30;
const RELATION_LIMIT = 15;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function clampInt(v: unknown, limit: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const rounded = Math.round(v);
  return Math.max(-limit, Math.min(limit, rounded));
}

export function validateEventDraft(raw: unknown, state: GameState): ValidationResult {
  if (!isRecord(raw)) return { ok: false, error: '返回的顶层不是 JSON 对象' };

  /* ---- 标题 ---- */
  const title = asString(raw.title)?.trim();
  if (!title) return { ok: false, error: '缺少 title' };
  if (title.length > 24) return { ok: false, error: 'title 太长（上限 24 字）' };

  /* ---- 正文 ---- */
  const text = asString(raw.text)?.trim();
  if (!text) return { ok: false, error: '缺少 text' };
  if (text.length < 10) return { ok: false, error: 'text 太短（至少 10 字）' };
  if (text.length > 260) return { ok: false, error: 'text 太长（上限 260 字）' };

  /* ---- 情绪与场景 ---- */
  const tone: EventTone = TONES.includes(raw.tone as EventTone) ? (raw.tone as EventTone) : 'neutral';
  const scene: SceneKind = SCENE_KIND_LIST.includes(raw.scene as SceneKind)
    ? (raw.scene as SceneKind)
    : 'classroom';

  /* ---- 在场角色：不认识的 id 直接剔除，空了就是纯旁白 ---- */
  const knownIds = new Set(state.characters.map((c) => c.id));
  const rawParticipants = Array.isArray(raw.participants) ? raw.participants : [];
  const participants = rawParticipants
    .filter((p): p is string => typeof p === 'string')
    .filter((p) => knownIds.has(p))
    .slice(0, 3);

  /* ---- 选项 ---- */
  const rawChoices = Array.isArray(raw.choices) ? raw.choices : [];
  if (rawChoices.length < 2) return { ok: false, error: '选项少于 2 个' };
  if (rawChoices.length > 4) return { ok: false, error: '选项多于 4 个' };

  const choices: AiChoiceDraft[] = [];
  for (let i = 0; i < rawChoices.length; i++) {
    const rc = rawChoices[i];
    if (!isRecord(rc)) return { ok: false, error: `第 ${i + 1} 个选项不是对象` };

    const choiceText = asString(rc.text)?.trim();
    if (!choiceText) return { ok: false, error: `第 ${i + 1} 个选项缺少 text` };
    if (choiceText.length > 36) return { ok: false, error: `第 ${i + 1} 个选项文字太长` };

    const resultText = asString(rc.resultText)?.trim().slice(0, 160);

    const effects = normalizeEffects(rc.effects, knownIds);
    const draftChoice: AiChoiceDraft = { text: choiceText, effects };
    if (resultText) draftChoice.resultText = resultText;
    choices.push(draftChoice);
  }

  /*
   * 占位符必须都能解析。
   * 模型有时会凭空引用一个不存在的角色（或者把 id 拼错），那样正文会原样显示
   * `{npc_xxx}`，比生成失败还糟。这里直接判不合法，让上层重试。
   */
  const dangling = new Set<string>();
  const scan = (text: string | undefined): void => {
    if (!text) return;
    for (const id of referencedCharacterIds(text)) {
      if (!knownIds.has(id)) dangling.add(id);
    }
  };
  scan(text);
  for (const c of choices) {
    scan(c.text);
    scan(c.resultText);
  }
  if (dangling.size > 0) {
    return {
      ok: false,
      error: `正文里引用了不存在的角色：${[...dangling].join('、')}。只能用给定的角色 id。`,
    };
  }

  return { ok: true, value: { title, text, tone, scene, participants, choices } };
}

/** 归一化效果：非法键丢掉，越界值夹取 */
function normalizeEffects(raw: unknown, knownIds: Set<string>): Effects {
  const out: Effects = {};
  if (!isRecord(raw)) return out;

  /* ---- 属性 ---- */
  if (isRecord(raw.stats)) {
    const stats: Partial<Stats> = {};
    let touched = 0;
    for (const [key, value] of Object.entries(raw.stats)) {
      if (!STAT_KEYS.includes(key as StatKey)) continue; // 不认识的键直接丢
      const limit = key === 'money' ? MONEY_LIMIT : STAT_LIMIT;
      const v = clampInt(value, limit);
      if (v === null || v === 0) continue;
      stats[key as StatKey] = v;
      touched++;
    }
    // 一次改太多项说明模型在乱来，只保留前 4 项
    if (touched > 0) {
      const keys = Object.keys(stats) as StatKey[];
      const kept = keys.slice(0, 4);
      const trimmed: Partial<Stats> = {};
      for (const k of kept) trimmed[k] = stats[k];
      out.stats = trimmed;
    }
  }

  /* ---- 好感 ---- */
  if (isRecord(raw.relations)) {
    const relations: Record<string, number> = {};
    for (const [id, value] of Object.entries(raw.relations)) {
      if (!knownIds.has(id)) continue;
      const v = clampInt(value, RELATION_LIMIT);
      if (v === null || v === 0) continue;
      relations[id] = v;
    }
    if (Object.keys(relations).length > 0) out.relations = relations;
  }

  /* ---- 标记：只收合法命名的，最多 2 个 ---- */
  if (Array.isArray(raw.flags)) {
    const flags = raw.flags
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.trim())
      .filter((f) => /^[a-z0-9_]{1,32}$/i.test(f))
      .slice(0, 2);
    if (flags.length > 0) out.flags = flags;
  }

  return out;
}

/** 人类可读的校验结果，用于调试面板 */
export function describeStatKeys(): string {
  return STAT_KEYS.map((k) => `${k}(${STAT_META[k].name})`).join(' ');
}
