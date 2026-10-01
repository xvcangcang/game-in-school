/**
 * 提示词。
 *
 * 这里写的每一句都会直接影响生成质量，改之前先想清楚。
 * 两条铁律：
 *  1. **题材边界**必须写在 system 里（角色都是初中生，只写校园日常）
 *  2. 输出格式必须写死成 JSON，并且在 schema.ts 里再校验一遍——提示词不是安全边界
 */

import { describeCharacter, relationLabel, SETTING_MAX_LENGTH } from '@/game/character';
import { npcs } from '@/game/character';
import { personalityMeta } from '@/data/personalities';
import { describeTime } from '@/game/schedule';
import { slotIdAt } from '@/game/conditions';
import { renderTemplate } from '@/game/text';
import type { DailySummary } from '@/game/dailySummary';
import type { Character, GameState, Gender, SceneKind, StatKey, TimeBand } from '@/game/types';
import { PHASE_META, SCENE_KIND_NAME, SLOT_META, STAT_META } from '@/game/types';
import type { ChatMessage } from '@/ai/client';

/* ------------------------------------------------------------------ *
 * 事件生成
 * ------------------------------------------------------------------ */

export const EVENT_SYSTEM_PROMPT = `你是中国初中校园题材文字游戏的编剧。玩家扮演一名初中生，游戏按时段推进，每个时段发生一件小事。

【硬性要求】
1. 只写校园日常：上课、作业、考试、同学关系、老师、家长、社团、值日、食堂、放学路上。
2. 出场角色都是初中生、老师或家长。禁止恋爱露骨、暴力、自伤、抽烟喝酒、欺凌细节、作弊教学、违法内容。青春期的心事可以写，但要克制健康。
3. 写具体细节，别写结论。写「粉笔灰在阳光里飘」，不写「老师很生气」。
4. 正文 40~90 字，1~3 句；标题 8 字以内。
5. 2~4 个选项，每个 6~16 字，选项之间要有真实取舍，不能全是好事或全是坏事。
6. 正文提到主角写 {主角}，提到在场角色写他们的 id，例如 {npc_deskmate}。不要写死姓名。
7. 【角色人设与设定】是硬约束：别人写下的口头禅、特长、软肋、随身物件、家里的情况，写进剧情或选项里就不能互相矛盾。**每个事件至少要自然带出其中一处具体细节**，不要整段只有泛泛的校园日常。
8. 【连贯性】选项的 resultText 必须和选项本身严丝合缝：谁选的、谁做的、谁说的要对得上，别把台词安到不在场或不相干的人身上；也要和「本局前提」里已经定下来的事一致。
9. 只输出 JSON，不要解释、不要 markdown 代码块。

【输出结构】
{
  "title": "标题",
  "text": "正文，用 {主角} / {角色id} 占位符",
  "tone": "good" | "bad" | "neutral",
  "scene": "classroom" | "corridor" | "playground" | "cafeteria" | "home" | "office",
  "participants": ["角色id（只写配角，不要写主角）"],
  "choices": [
    {
      "text": "选项文字",
      "resultText": "选完后一句反馈",
      "effects": {
        "stats": { "study": 4, "stamina": -3 },
        "relations": { "角色id": -5 },
        "flags": []
      }
    }
  ]
}

【数值规则】
- stats 的键只能是：study(学业) stamina(体力) mood(心态) popularity(人气) teacherFavor(老师好感) familyExpect(家庭期望) money(零花钱)
- 单项绝对值 ≤15，money ≤30；relations 的键必须是给定角色 id，绝对值 ≤15
- 多数选项只动 1~3 项，别每个选项都改一大堆；flags 可留空数组`;

/**
 * 角色列表的紧凑写法。
 *
 * 原来每人一句 `describeCharacter()`：身份提示 + 性格标签 + 人设 + 设定 + 好感分级，
 * 6 个人就是 600 多字，占了输入的一大半。而其中「同班同学，关系普通」「自来熟、消息灵通」
 * 这类**通用说明**对模型没有增量信息——它本来就知道「同桌」「社牛」是什么意思。
 *
 * 所以这里只留**结构性信息**：id、名字、身份、性格、好感——这些短且必需。
 * 人设与设定搬到 personaBlock() 单独成块，原因见那边。
 */
/** 性别在提示词里怎么说。'n'（不指定）就什么都不写，写了反而会诱导模型硬编一个性别 */
function genderTag(c: Character): string {
  return c.gender === 'm' ? '男' : c.gender === 'f' ? '女' : '';
}

/*
 * 默认带上 id——配角要用 id 让模型写 participants。
 * 但主角必须传 showId=false：它的 id 对模型没用，露出来只会被照抄成 {player_xxxx}。
 *
 * 主角那一行也不显示好感：「好感」说的是**别人对主角**的态度，主角对自己没意义，
 * 以前会打印出「好感100(铁哥们)」这种莫名其妙的东西。
 */
function compactCharacter(c: Character, heroGender: Gender, showId = true): string {
  const bits = [
    showId ? c.id : null,
    c.name,
    c.title ?? '',
    genderTag(c),
    personalityMeta(c.personality).name,
  ];
  const head = bits.filter(Boolean).join(' ');
  if (c.isProtagonist) return head;

  const rel = relationLabel(c.relation, {
    role: c.role,
    gender: c.gender,
    protagonistGender: heroGender,
  }).name;
  return `${head} 好感${c.relation}(${rel})`;
}

/**
 * 每个时段「说得通」的场景。
 *
 * 不给的话模型会在早读写「回到家」——scene 只被校验是不是合法枚举（见 ai/schema.ts），
 * 没人管它跟时间对不对得上。
 */
const SCENES_BY_BAND: Record<TimeBand, SceneKind[]> = {
  early: ['classroom', 'corridor'],
  am: ['classroom', 'corridor', 'playground', 'office'],
  noon: ['cafeteria', 'classroom', 'corridor'],
  pm: ['classroom', 'corridor', 'playground', 'office'],
  evening: ['classroom', 'home'],
};

/** 往提示词里带几条前情。3 条太少，接不上前面的事；再多就白烧 token 了 */
const HISTORY_IN_PROMPT = 6;

/** 预设角色的 bio 是作者写的点缀。预设里最长的一句 30 字，给 40 是为了别砍在句子中间 */
const BIO_IN_PROMPT_MAX = 40;

/**
 * 人设与设定单独成块。
 *
 * 为什么必须分开：以前这一行是 `(setting || bio).slice(0, 26)`，两种东西共用一个 26 字预算。
 * 但它们的性质完全不同——
 *  - `setting` 是**玩家自己写的**，输入框上限 SETTING_MAX_LENGTH(200) 字，
 *    UI 上明说「会原样交给 AI 当作背景设定」。截到 26 字就是一种背刺：
 *    玩家写「书包里常备水果糖」「400 米第一名」，全被丢掉，自然觉得"自定义人设没作用"。
 *  - `bio` 是预设角色的固定资料，短点无所谓。
 * 混在一行里只能取两者的最小值，所以拆开：setting 全文送达，bio 保持原来的短预算。
 */
function personaBlock(list: Character[]): string {
  const lines: string[] = [];
  for (const c of list) {
    /*
     * 主角**不打内部 id**。
     * 它的 id 对模型没用（participants 里本来就不该出现主角），写出来反而会带偏：
     * 实测有一次模型照着仿写了 `{player_xxxx}` 而不是规定的 `{主角}`。
     */
    const label = c.isProtagonist ? '主角' : c.id;
    const setting = (c.setting ?? '').trim();
    const bio = (c.bio ?? '').trim();
    if (setting) {
      // 不截断：长度已经由输入框把关，超出只可能是手改存档
      lines.push(`- ${label}（${c.name}）：${setting.replace(/\s+/g, ' ').slice(0, SETTING_MAX_LENGTH)}`);
    } else if (bio && !c.isProtagonist) {
      // 主角的 bio 是占位符「你。」，没有信息量，跳过
      lines.push(`- ${label}（${c.name}）：${bio.replace(/\s+/g, ' ').slice(0, BIO_IN_PROMPT_MAX)}`);
    }
  }
  return lines.join('\n');
}

/** 把当前局面整理成模型能读的上下文 */
export function buildEventUserPrompt(state: GameState): string {
  const protagonist = state.characters.find((c) => c.isProtagonist);
  const cast = npcs(state);

  /*
   * 名单里**只放配角**。
   * participants 的约定是「只写配角，不要写主角」（见 system 提示第 6 条），
   * 但以前主角同时出现在「主角：」和这份名单里，等于在暗示模型把主角也塞进 participants，
   * 渲染出来就会变成「{主角} 和 {主角} 说话」这种怪东西。顺手也省了一行重复内容。
   */
  const heroGender = protagonist?.gender ?? 'n';
  const roster = cast.map((c) => `- ${compactCharacter(c, heroGender)}`).join('\n');

  const personas = personaBlock(
    [protagonist, ...cast].filter((c): c is Character => Boolean(c)),
  );

  const slot = SLOT_META[slotIdAt(state.slotIndex)];

  // 前情从 3 条放宽到 6 条：只给 3 条时，模型经常接不上更早定下来的事
  const history = state.history.slice(-HISTORY_IN_PROMPT);
  const recent = history
    .map((h) => `- ${SLOT_META[h.slot].name}：${h.title}（选了「${h.choiceText}」）`)
    .join('\n');
  const recentTitles = state.history.slice(-8).map((h) => h.title);

  const statLines = (Object.keys(STAT_META) as StatKey[])
    .map((k) => `${STAT_META[k].name}${state.stats[k]}`)
    .join(' ');

  const phase = PHASE_META[state.phase];
  const difficulty =
    state.difficulty === 'hard' ? '压力很大' : state.difficulty === 'relax' ? '比较轻松' : '普通';
  const sceneHint = SCENES_BY_BAND[slot.band].map((s) => SCENE_KIND_NAME[s]).join(' / ');
  const flags = state.flags.length
    ? state.flags.map((f) => `- ${f}`).join('\n')
    : '（还没有）';
  const firstSlot = state.history.length === 0;

  /*
   * 结构说明（改之前先读这个）：
   * 模型是无状态的——每生成一段剧情都要把「这是谁、在哪、之前定了什么」重讲一遍。
   * 所以这里按「前提 → 人物 → 已定事项 → 数值 → 前情 → 场景」分段，
   * 每一段都带一句说明它该怎么用，而不是把一堆数据平铺给模型自己猜。
   */
  return `【本局前提】
世界观：中国初中校园的日常，玩家扮演的就是下面这个「主角」。
学段：${phase.name}（${phase.subtitle}）｜难度：${difficulty}
时间：${describeTime(state)}｜本局第 ${state.history.length + 1} 个时段${
    firstSlot ? '（刚开局，前面什么都没有）' : ''
  }

【主角】
${protagonist ? compactCharacter(protagonist, heroGender, false) : '（无）'}
${personas ? `\n【人设与设定（必须遵守）】\n${personas}\n` : ''}
【班里的角色】
participants 只能从这里挑，**只写配角、不要写主角**；空数组表示这一段只有旁白。
${roster}

【已经定下来的事】
${flags}
这些是不能推翻的前提：已经发生过、已经答应过、已经翻脸的事，别当成没发生，也别把同一件事再演一遍。

【属性】${statLines}

【最近发生】
${recent || '（前面没有别的事）'}
上一条选完之后的后果，应该能在这一条里看到影子，而不是各演各的。
别重复这些标题：${recentTitles.length ? recentTitles.join('、') : '（无）'}

【场景】这个时段说得通的场景：${sceneHint}。别写在时间上不可能的地方。

生成「${slot.name}」的一件小事。只输出 JSON。`;
}

/** 重试时用的提示词：把上一次的失败原因也告诉模型 */
export function buildEventRetryPrompt(state: GameState, reason: string): string {
  return `${buildEventUserPrompt(state)}

【上一次生成不合法，请修正】${reason}
再次强调：只输出一个 JSON 对象，不要任何解释文字。`;
}

/* ------------------------------------------------------------------ *
 * 日终结算的一句话小结
 * ------------------------------------------------------------------ */

export const DAILY_SUMMARY_SYSTEM_PROMPT = `你是一个中国初中生的日记代笔。

【要求】
1. 用第一人称「我」，写 1~2 句话，40 字以内。
2. 只写这一天的心情和感受，**不要复述具体事件**，不要罗列数值。
3. 语气克制、具体，像真的初中生写在日记本上的，不要鸡汤、不要正能量说教。
4. **只输出这一两句话本身**，不要 JSON、不要引号、不要标题、不要解释。
5. 角色是初中生，不写恋爱露骨内容、暴力、自伤、违法内容。`;

export function buildDailySummaryPrompt(state: GameState, summary: DailySummary): string {
  const protagonist = state.characters.find((c) => c.isProtagonist);
  const happened = summary.events.length
    ? summary.events.map((e) => `- ${SLOT_META[e.slot].name}：${e.title}（我选了「${e.choice}」）`).join('\n')
    : '（今天什么特别的事都没发生）';

  const changes = summary.deltas.length
    ? summary.deltas
        .map((d) => `${STAT_META[d.key].name} ${d.diff > 0 ? '+' : ''}${d.diff}`)
        .join('　')
    : '（属性和昨天一样）';

  return `【今天】
${PHASE_META[summary.phase].name} · 第 ${summary.week} 周 ${summary.weekday}（第 ${summary.day} 天）

【今天发生的事】
${happened}

【今天的属性变化】
${changes}

【现在的状态】
${(Object.keys(STAT_META) as StatKey[]).map((k) => `${STAT_META[k].name} ${summary.statsAfter[k]}`).join(' · ')}
心态档位：${summary.moodTier}
${protagonist ? `我是${protagonist.name}，身份是「${protagonist.title ?? '学生'}」。` : ''}${protagonist?.setting ? `\n我自己的情况：${protagonist.setting}` : ''}

请以「我」的口吻为今天写一两句日记。只输出日记内容本身。`;
}

/* ------------------------------------------------------------------ *
 * 聊完天之后「继续剧情」
 * ------------------------------------------------------------------ */

export interface ChatTurnForPrompt {
  role: 'user' | 'npc';
  text: string;
}

/**
 * 玩家没直接做选择，而是先跟某个角色聊了几句，然后点「继续剧情」。
 * 这时候让模型接着写：把对话里说定的事落进剧情，并给出新的选项。
 */
export function buildChatFollowUpPrompt(
  state: GameState,
  previous: { title: string; text: string; choices: string[] },
  characterId: string,
  log: ChatTurnForPrompt[],
): string {
  const ch = state.characters.find((c) => c.id === characterId);
  const protagonist = state.characters.find((c) => c.isProtagonist);

  // 这条以前完全没带人设，聊完接着写的时候角色就会「失忆」——
  // 明明设定里写着书包里常备水果糖，接着的剧情里却完全不像同一个人。
  const personas = personaBlock(
    [protagonist, ch].filter((c): c is Character => Boolean(c)),
  );

  const transcript = log
    .slice(-10)
    .map((turn) => `${turn.role === 'user' ? protagonist?.name ?? '主角' : ch?.name ?? '对方'}：${turn.text}`)
    .join('\n');

  return `【刚才这一幕】
标题：${previous.title}
正文：${previous.text}
玩家原本可以选的：${previous.choices.map((c, i) => `${i + 1}. ${c}`).join('　')}

【玩家没有直接选，而是先跟「${ch?.name ?? '对方'}」聊了几句】
${transcript}

【你的任务】
接着上面这一幕往下写，并根据这段对话给出新的选择。要求：
1. 对话里已经说定的事必须体现在新剧情里（答应了、拒绝了、透露了什么信息、两个人现在什么气氛）。
2. 不要复述对话原文，直接写「接下来发生了什么」。
3. 2~4 个新选项，**不要和上面已经出现过的选项重复**。
4. 请只输出 JSON，结构见系统提示。正文里提到主角用 {主角}，提到角色用 {角色id}。
5. participants 里要包含刚刚对话的角色 ${characterId}。

当前时间：${describeTime(state)}　学段：${PHASE_META[state.phase].name}
当前属性：${(Object.keys(STAT_META) as StatKey[]).map((k) => `${STAT_META[k].name} ${state.stats[k]}`).join(' · ')}
${personas ? `\n【人设与设定（必须遵守）】\n${personas}\n` : ''}`;
}

/* ------------------------------------------------------------------ *
 * NPC 自由对话
 * ------------------------------------------------------------------ */

export function buildChatMessages(
  state: GameState,
  characterId: string,
  playerMessage: string,
  history: ChatMessage[] = [],
): ChatMessage[] {
  const ch = state.characters.find((c) => c.id === characterId);
  const protagonist = state.characters.find((c) => c.isProtagonist);
  const rel = ch
    ? relationLabel(ch.relation, {
        role: ch.role,
        gender: ch.gender,
        protagonistGender: protagonist?.gender ?? 'n',
      })
    : null;

  const system: ChatMessage = {
    role: 'system',
    content: `你在一款中国初中校园题材游戏里扮演一个角色，和玩家（主角）在课间聊天。

【你的角色】
${ch ? describeCharacter(ch, protagonist?.gender ?? 'n') : '一个同班同学'}
${rel ? `你和主角的关系：${rel.name}` : ''}

【主角】
${protagonist?.name ?? '同学'}，${PHASE_META[state.phase].name}学生，当前心态 ${state.stats.mood}/100。

【说话的规矩】
1. 只说 1~3 句，像真实的初中生那样说话，口语化、带点这个年纪的用词。
2. 角色是初中生，**不写恋爱露骨内容、暴力、自伤、违法内容**。话题保持在校园日常。
3. 按你的身份和性格说话：老师会训人或啰嗦，死党会贫嘴，社恐会简短。
4. 好感度低就冷淡甚至怼人，好感度高就热络。
5. 不要用旁白体描述动作，直接说台词。可以用括号加一点点神态，例如「（挠头）」。
6. 不要提到自己是 AI 或语言模型。`,
  };

  return [system, ...history.slice(-8), { role: 'user', content: playerMessage }];
}

/* ------------------------------------------------------------------ *
 * 连通性测试
 * ------------------------------------------------------------------ */

export function buildPingMessages(): ChatMessage[] {
  return [
    { role: 'system', content: '你是一个测试用的助手，只回复 JSON。' },
    { role: 'user', content: '回复 {"ok":true}，不要任何其他内容。' },
  ];
}

/** 兜底用：把 AI 事件里的占位符渲染成人话（调试面板用） */
export function previewEventText(state: GameState, text: string): string {
  return renderTemplate(text, state);
}
