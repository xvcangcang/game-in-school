/**
 * 提示词。
 *
 * 这里写的每一句都会直接影响生成质量，改之前先想清楚。
 * 两条铁律：
 *  1. **题材边界**必须写在 system 里（角色都是初中生，只写校园日常）
 *  2. 输出格式必须写死成 JSON，并且在 schema.ts 里再校验一遍——提示词不是安全边界
 */

import { describeCharacter, relationLabel } from '@/game/character';
import { npcs } from '@/game/character';
import { describeTime } from '@/game/schedule';
import { renderTemplate } from '@/game/text';
import type { GameState, StatKey } from '@/game/types';
import { PHASE_META, SLOT_META, STAT_META } from '@/game/types';
import type { ChatMessage } from '@/ai/client';

/* ------------------------------------------------------------------ *
 * 事件生成
 * ------------------------------------------------------------------ */

export const EVENT_SYSTEM_PROMPT = `你是一个中国初中校园题材文字游戏的剧情编剧。玩家扮演一名初中生，游戏按时段推进，每个时段发生一件小事。

【硬性要求】
1. 只写校园日常：上课、作业、考试、同学关系、老师、家长、社团、值日、运动会、食堂、放学路上……
2. 所有出场角色都是初中生、老师或家长。**禁止**任何恋爱露骨描写、暴力、自伤、抽烟喝酒、欺凌细节、作弊教学、违法犯罪内容。青春期的别扭和心跳可以写，但要克制、健康。
3. 写具体、有画面感的细节。写「粉笔灰在阳光里飘」，不要写「老师很生气」。
4. 正文 40~90 字，1~3 句。标题 8 字以内。
5. 2~4 个选项，选项文字 6~16 字，选项之间要有**真实取舍**（不能全是好事，也不能全是坏事）。
6. 正文里称呼主角用占位符 {主角}，称呼在场角色用 {角色id}（例如 {npc_deskmate}）。不要写死姓名。
7. **只输出 JSON**，不要解释、不要 markdown 代码块、不要多余文字。

【输出结构】
{
  "title": "标题",
  "text": "正文，可用 {主角} 与 {角色id} 占位符",
  "tone": "good" | "bad" | "neutral",
  "scene": "classroom" | "corridor" | "playground" | "cafeteria" | "home" | "office",
  "participants": ["角色id"],
  "choices": [
    {
      "text": "选项文字",
      "resultText": "选完后立刻看到的一句话反馈",
      "effects": {
        "stats": { "study": 4, "stamina": -3 },
        "relations": { "角色id": -5 },
        "flags": []
      }
    }
  ]
}

【数值规则】
- stats 只能用这些键：study(学业) stamina(体力) mood(心态) popularity(人气) teacherFavor(老师好感) familyExpect(家庭期望) money(零花钱)
- 每个数值的绝对值不超过 15；money 不超过 30
- relations 的键必须是 participants 里出现过的角色 id，绝对值不超过 15
- 大多数选项只影响 1~3 项数值，不要每个选项都改一大堆
- flags 可以留空数组，也可以写一个蛇形命名的小标记`;

/** 把当前局面整理成模型能读的上下文 */
export function buildEventUserPrompt(state: GameState): string {
  const protagonist = state.characters.find((c) => c.isProtagonist);
  const roster = [protagonist, ...npcs(state)]
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => `- ${c.id}：${describeCharacter(c)}`)
    .join('\n');

  const recent = state.history
    .slice(-5)
    .map((h) => `- 第${h.day}天 ${SLOT_META[h.slot].name}：${h.title}（玩家选了「${h.choiceText}」）`)
    .join('\n');

  const statLines = (Object.keys(STAT_META) as StatKey[])
    .map((k) => `${STAT_META[k].name} ${state.stats[k]}`)
    .join(' · ');

  const recentTitles = state.history.slice(-8).map((h) => h.title);

  return `【当前局面】
学段：${PHASE_META[state.phase].name}（${PHASE_META[state.phase].subtitle}）
时间：${describeTime(state)}
难度：${state.difficulty === 'hard' ? '课业压力很大' : state.difficulty === 'relax' ? '比较轻松' : '普通'}
属性：${statLines}

【主角】
${protagonist ? `${protagonist.id}：${describeCharacter(protagonist)}` : '（无）'}

【在场可用的角色】（participants 只能从这里挑，也可以用空数组表示纯旁白）
${roster}

【最近发生的事】
${recent || '（这是开局第一个时段）'}

【不要重复这些已经出现过的事件标题】
${recentTitles.length ? recentTitles.join('、') : '（无）'}

请生成这${SLOT_META[slotKeyOf(state)].name}发生的一件小事。只输出 JSON。`;
}

function slotKeyOf(state: GameState): keyof typeof SLOT_META {
  const order: (keyof typeof SLOT_META)[] = ['early', 'am', 'noon', 'pm', 'evening'];
  return order[Math.max(0, Math.min(order.length - 1, state.slotIndex))];
}

/** 重试时用的提示词：把上一次的失败原因也告诉模型 */
export function buildEventRetryPrompt(state: GameState, reason: string): string {
  return `${buildEventUserPrompt(state)}

【上一次生成不合法，请修正】${reason}
再次强调：只输出一个 JSON 对象，不要任何解释文字。`;
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
当前属性：${(Object.keys(STAT_META) as StatKey[]).map((k) => `${STAT_META[k].name} ${state.stats[k]}`).join(' · ')}`;
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
  const rel = ch ? relationLabel(ch.relation) : null;

  const system: ChatMessage = {
    role: 'system',
    content: `你在一款中国初中校园题材游戏里扮演一个角色，和玩家（主角）在课间聊天。

【你的角色】
${ch ? describeCharacter(ch) : '一个同班同学'}
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
