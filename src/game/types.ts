/**
 * 全局类型定义 —— 整个项目的「单一事实来源」。
 *
 * 铁律：这一层不 import 任何东西（除了类型），不碰 DOM、不碰 Canvas。
 * 事件库、AI 生成、存档、渲染全都以这里的结构为准。
 * 改这里的字段 = 改存档格式，记得同步 save.ts 里的 SAVE_VERSION。
 */

/* ------------------------------------------------------------------ *
 * 时间与阶段
 * ------------------------------------------------------------------ */

/** 学段：初一 / 初二 / 初三 */
export type PhaseId = 'g1' | 'g2' | 'g3';

/** 一天中的五个时段 */
export type SlotId = 'early' | 'am' | 'noon' | 'pm' | 'evening';

/** 难度 */
export type Difficulty = 'relax' | 'normal' | 'hard';

export const PHASE_ORDER: PhaseId[] = ['g1', 'g2', 'g3'];

export const PHASE_META: Record<PhaseId, { name: string; subtitle: string; desc: string }> = {
  g1: {
    name: '初一',
    subtitle: '适应新环境',
    desc: '刚进校门，谁都还不认识。事件以温和的日常为主，认识新同学的好时机。',
  },
  g2: {
    name: '初二',
    subtitle: '分水岭',
    desc: '开始偏科、开始较劲、开始有心事。争执和暗恋类事件明显变多。',
  },
  g3: {
    name: '初三',
    subtitle: '中考压力',
    desc: '作业爆炸、突击考试、排名公布。抗压能力决定你能走多远。',
  },
};

export const SLOT_ORDER: SlotId[] = ['early', 'am', 'noon', 'pm', 'evening'];

export const SLOT_META: Record<SlotId, { name: string; icon: string }> = {
  early: { name: '早自习', icon: '🌅' },
  am: { name: '上午课', icon: '📖' },
  noon: { name: '午休', icon: '🍚' },
  pm: { name: '下午课', icon: '🏃' },
  evening: { name: '晚自习', icon: '🌙' },
};

/** 事件发生的场景。渲染层按它选背景图。 */
export type SceneKind = 'classroom' | 'corridor' | 'playground' | 'cafeteria' | 'home' | 'office';

export const SCENE_KIND_LIST: SceneKind[] = [
  'classroom',
  'corridor',
  'playground',
  'cafeteria',
  'home',
  'office',
];

export const SCENE_KIND_NAME: Record<SceneKind, string> = {
  classroom: '教室',
  corridor: '走廊',
  playground: '操场',
  cafeteria: '食堂',
  home: '家',
  office: '办公室',
};

export const DIFFICULTY_META: Record<Difficulty, { name: string; desc: string; badBias: number }> =
  {
    relax: { name: '摆烂模式', desc: '坏事权重降低，属性下滑更慢。', badBias: 0.6 },
    normal: { name: '普通学生', desc: '标准体验。', badBias: 1 },
    hard: { name: '卷王模式', desc: '坏事权重提高，考试更难。', badBias: 1.5 },
  };

/* ------------------------------------------------------------------ *
 * 角色
 * ------------------------------------------------------------------ */

export type StatKey =
  | 'study' // 学业
  | 'stamina' // 体力
  | 'mood' // 心态（越高越稳，低到 0 会崩溃）
  | 'popularity' // 人气
  | 'teacherFavor' // 老师好感
  | 'familyExpect' // 家庭期望（压力源）
  | 'money'; // 零花钱

export const STAT_KEYS: StatKey[] = [
  'study',
  'stamina',
  'mood',
  'popularity',
  'teacherFavor',
  'familyExpect',
  'money',
];

export const STAT_META: Record<
  StatKey,
  { name: string; short: string; color: string; min: number; max: number; unit?: string }
> = {
  study: { name: '学业', short: '学', color: '#6fc3df', min: 0, max: 100 },
  stamina: { name: '体力', short: '体', color: '#6fbf73', min: 0, max: 100 },
  mood: { name: '心态', short: '心', color: '#e87ea1', min: 0, max: 100 },
  popularity: { name: '人气', short: '人', color: '#f2b134', min: 0, max: 100 },
  teacherFavor: { name: '老师好感', short: '师', color: '#c39bd3', min: 0, max: 100 },
  familyExpect: { name: '家庭期望', short: '家', color: '#e07a5f', min: 0, max: 100 },
  money: { name: '零花钱', short: '钱', color: '#9ad5a0', min: 0, max: 999, unit: '元' },
};

export type Stats = Record<StatKey, number>;

/** 性格标签：影响初始属性与部分选项加成 */
export type PersonalityId =
  | 'scholar' // 学霸
  | 'social' // 社牛
  | 'shy' // 社恐
  | 'rebel' // 刺头
  | 'artsy' // 文艺
  | 'sporty' // 运动系
  | 'ordinary'; // 普通

export type Gender = 'm' | 'f' | 'n';

/** NPC 身份 */
export type RoleId =
  | 'classmate' // 同学
  | 'bestFriend' // 死党
  | 'deskmate' // 同桌
  | 'classTeacher' // 班主任
  | 'mathTeacher' // 数学老师
  | 'chineseTeacher' // 语文老师
  | 'englishTeacher' // 英语老师
  | 'peTeacher' // 体育老师
  | 'dean' // 教导主任
  | 'parent' // 家长
  | 'crush' // 暗恋对象
  | 'bully'; // 找茬的

/** 像素外观：全部用索引指向 data/appearances.ts 里的部件，保证程序化可绘制 */
export interface Appearance {
  gender: Gender;
  /** 肤色索引 */
  skin: number;
  /** 发型索引 */
  hair: number;
  /** 发色（十六进制） */
  hairColor: string;
  /** 校服配色索引 */
  uniform: number;
  /** 配饰索引（0 = 无） */
  accessory: number;
}

export interface Character {
  id: string;
  name: string;
  role: RoleId;
  /**
   * 自由填写的身份/职务，显示在名字后面，也会喂给 AI 当上下文。
   * 与 role 的区别：role 是给引擎和事件库用的枚举（决定说话口气、能否参与某类事件），
   * title 纯粹是给玩家看的、可以随便写（「转学生」「班长」「隔壁班来借书的」）。
   * 为空时按 role 推一个默认值，见 game/character.ts 的 defaultTitleFor()。
   */
  title?: string;
  gender: Gender;
  personality: PersonalityId;
  appearance: Appearance;
  /** 一句话人设，AI 生成时会作为上下文 */
  bio: string;
  /** 对主角的好感度 -100 ~ 100 */
  relation: number;
  /** 是否是玩家扮演的主角 */
  isProtagonist: boolean;
  /** 预设角色：不可删除，只能改名/改外观 */
  preset: boolean;
  /** 是否由 AI 生成 */
  aiGenerated: boolean;
}

/* ------------------------------------------------------------------ *
 * 事件
 * ------------------------------------------------------------------ */

/** 触发条件。所有字段都是「与」关系，留空表示不限制。 */
export interface Condition {
  minStats?: Partial<Stats>;
  maxStats?: Partial<Stats>;
  /** 角色 id -> 最低好感 */
  minRelation?: Record<string, number>;
  /** 角色 id -> 最高好感 */
  maxRelation?: Record<string, number>;
  /** 必须全部带有这些标记 */
  flags?: string[];
  /** 必须一个都没有 */
  notFlags?: string[];
  phase?: PhaseId[];
  slots?: SlotId[];
  /** 需要至少几名自定义 NPC 在场 */
  minCustomNpc?: number;
}

/** 事件结算效果 */
export interface Effects {
  stats?: Partial<Stats>;
  /** 角色 id -> 好感变化量 */
  relations?: Record<string, number>;
  /** 添加标记 */
  flags?: string[];
  /** 移除标记 */
  clearFlags?: string[];
  /** 是否推进到下一时段（默认 true） */
  advance?: boolean;
}

export interface Choice {
  id: string;
  text: string;
  /** 不满足条件时该选项隐藏（默认）还是置灰 */
  showWhenLocked?: boolean;
  require?: Condition;
  effects: Effects;
  /** 选择后追加一句反馈，给玩家即时反馈 */
  resultText?: string;
}

/** 事件情绪倾向，用于坏事件保底机制 */
export type EventTone = 'good' | 'bad' | 'neutral';

export interface GameEvent {
  id: string;
  source: 'builtin' | 'ai';
  title: string;
  /**
   * 正文。支持占位符，由 game/text.ts 的 renderTemplate() 统一替换：
   *   {主角}      → 主角姓名
   *   {deskmate}  → 角色 id 对应的姓名（如 {npc_deskmate}）
   *   {属性:study} → 该属性的当前值
   * **不要在事件里写死角色名**，否则玩家改了名字就会出戏。
   */
  text: string;
  tone: EventTone;
  /** 权重，越大越容易出现 */
  weight: number;
  /** 冷却天数：触发后多少天内不再出现 */
  cooldownDays?: number;
  /** 参与角色 id；为空表示纯旁白或只有老师等固定角色 */
  participants?: string[];
  /** 发生场景，默认教室 */
  scene?: SceneKind;
  /** 适用学段，留空 = 全部 */
  phase?: PhaseId[];
  /** 适用时段，留空 = 全部 */
  slots?: SlotId[];
  require?: Condition;
  choices: Choice[];
}

/* ------------------------------------------------------------------ *
 * 存档 / 游戏状态
 * ------------------------------------------------------------------ */

export interface LogEntry {
  /** 游戏内第几天 */
  day: number;
  slot: SlotId;
  eventId: string;
  title: string;
  choiceText: string;
  resultText?: string;
}

export interface GameState {
  /** 存档版本号，用于迁移 */
  version: number;
  /** 随机种子：同一个种子 + 同样的选择 = 同样的剧情线，方便复现 bug */
  seed: number;
  phase: PhaseId;
  difficulty: Difficulty;
  /** 本局是否启用 AI 生成 */
  aiEnabled: boolean;
  /** 游戏内第几天，从 1 开始 */
  day: number;
  /** 第几周，从 1 开始 */
  week: number;
  /** 当前时段在 SLOT_ORDER 中的下标 0~4 */
  slotIndex: number;
  stats: Stats;
  /**
   * 本天开始时的属性快照（每天凌晨恢复完后记录）。
   * 日终结算要靠它算出「今天涨了什么、掉了什么」——历史记录里只有事件标题，
   * 没有数值变化，光靠 history 是算不出来的。
   */
  dayStartStats: Stats;
  protagonistId: string;
  characters: Character[];
  flags: string[];
  /** 已经出现过的事件 id（避免重复） */
  seenEventIds: string[];
  /** 事件 id -> 冷却结束的 day */
  cooldowns: Record<string, number>;
  /** 最近若干条剧情记录 */
  history: LogEntry[];
  /** 本局已触发的负面事件连续次数，用于坏事件保底 */
  badStreak: number;
  /** 玩家创建时间戳 */
  createdAt: number;
  /** 最后游玩时间戳 */
  updatedAt: number;
}

export interface SaveSlotMeta {
  slot: number;
  exists: boolean;
  phase?: PhaseId;
  protagonistName?: string;
  day?: number;
  week?: number;
  updatedAt?: number;
}

/* ------------------------------------------------------------------ *
 * 设置
 * ------------------------------------------------------------------ */

export interface AiConfig {
  /** 是否启用 AI 生成（这是「双模式」的总开关） */
  enabled: boolean;
  /** OpenAI 兼容接口的 baseURL，例如 https://api.deepseek.com/v1 */
  baseURL: string;
  model: string;
  /** 只存本机 localStorage，仅用于开发者自测；正式分享请走服务端代理 */
  apiKey: string;
  /** true = 走同源 /api/llm 代理（Key 在服务端），false = 浏览器直连 */
  useProxy: boolean;
  temperature: number;
  /** 单次请求超时（毫秒） */
  timeoutMs: number;
}

export interface Settings {
  version: number;
  /** 文字速度 */
  textSpeed: 'slow' | 'normal' | 'fast' | 'instant';
  /** 音效开关 */
  sfx: boolean;
  /** 音效音量 0 ~ 1 */
  sfxVolume: number;
  /** 背景音乐开关（目前还没有 BGM，先占位） */
  bgm: boolean;
  /** 界面缩放微调 0.8 ~ 1.4 */
  uiScale: number;
  ai: AiConfig;
}

/* ------------------------------------------------------------------ *
 * 存档版本
 * ------------------------------------------------------------------ */

/**
 * 存档格式版本。**改动 GameState / Character / GameEvent 的结构时必须 +1**，
 * 并在 app/save.ts 的 MIGRATIONS 里补一条迁移函数，否则老存档会读不出来。
 *
 * 1 → 初版
 * 2 → Character 增加自由填写的 `title`（身份），迁移时按 role 补默认值
 * 3 → GameState 增加 `dayStartStats`（日终结算用），迁移时用当前属性兜底
 */
export const SAVE_VERSION = 3;
