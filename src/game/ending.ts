/**
 * 结局判定。
 *
 * 初三读完后按「最终属性 + 关键标记 + 履历」给一个结局。
 * 判定顺序即优先级：越靠前的条件越"特色"，兜底结局放最后。
 *
 * 想加结局：往 ENDINGS 里插一条，写好 rank / when() 和文本即可，不用改别的代码。
 */

import { overallScore, moodTier } from '@/game/stats';
import type { GameState } from '@/game/types';

export interface EndingHighlight {
  day: number;
  title: string;
  choice: string;
}

export interface Ending {
  id: string;
  title: string;
  subtitle: string;
  /** 正文段落 */
  paragraphs: string[];
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  score: number;
  highlights: EndingHighlight[];
}

interface EndingRule {
  id: string;
  title: string;
  subtitle: string;
  /**
   * 这个结局的等第。等第跟着结局走，不跟着分数走——
   * 否则会出现「S 等第 + 普通人的三年」这种自相矛盾的画面。
   */
  rank: Ending['rank'];
  /** 满足就选它 */
  when: (state: GameState, score: number) => boolean;
  paragraphs: string[];
}

const ENDINGS: EndingRule[] = [
  {
    id: 'burnout',
    title: '撑不住了',
    subtitle: '心态崩盘',
    rank: 'D',
    when: (s) => s.stats.mood < 22,
    paragraphs: [
      '最后一门考完的那天下午，你一个人坐在空教室里，卷子摊在桌上一个字也没写。',
      '这三年你确实拼过，只是没有人问过你累不累。班主任在门口站了一会儿，最后只说了句「回家好好睡一觉」。',
      '成绩单出来那天，妈妈没有像你想象中那样发火。她把纸折好放进抽屉，说：「以后慢慢来。」',
    ],
  },
  {
    id: 'scholar',
    title: '稳坐第一排',
    subtitle: '学神路线',
    rank: 'S',
    when: (s) => s.stats.study >= 88 && s.stats.mood >= 55,
    paragraphs: [
      '成绩单贴出来的那天早上，你的名字在第一个。走廊里有人小声念了一遍，你假装没听见。',
      '这三年你把每一张卷子都留了下来，摞起来比课桌还高。有人问你有什么诀窍，你想了想说：「就是每次都做完了。」',
      '毕业照上你站在第二排中间，笑得有点僵。但那支用了三年的笔，你一直留到了现在。',
    ],
  },
  {
    id: 'popular',
    title: '谁都认识你',
    subtitle: '社交之王',
    rank: 'A',
    when: (s) => s.stats.popularity >= 85,
    paragraphs: [
      '毕业那天，走廊上每隔三步就有人喊你的名字。你签了四十多张同学录，写到手腕发酸。',
      '你算不上成绩最好的那一个，但这三年班里的每一件热闹事里都有你。',
      '很多年后同学聚会，大家说起初中，第一个想起的还是你。',
    ],
  },
  {
    id: 'teacher_pet',
    title: '办公室的常客',
    subtitle: '老师心腹',
    rank: 'A',
    when: (s) => s.stats.teacherFavor >= 85,
    paragraphs: [
      '毕业前的最后一天，班主任把你叫到办公室，从抽屉里翻出一沓你交过的作业本。',
      '「留着吧，」她说，「以后要是当老师，就知道该怎么改作业了。」',
      '你抱着那沓本子走出办公室，走廊里正在放学，光从窗户里斜过来，落了一地。',
    ],
  },
  {
    id: 'family_pressure',
    title: '为了那句话',
    subtitle: '家里的期望',
    rank: 'A',
    when: (s) => s.stats.familyExpect >= 85 && s.stats.study >= 70,
    paragraphs: [
      '你做到了。成绩出来那天，妈妈把那张纸翻来覆去看了三遍，然后去厨房给你煮了碗面。',
      '这三年里你听过太多次「别人家的孩子」，也见过太多次她欲言又止的表情。',
      '面端上来的时候，她说：「以后别这么大压力了。」你点点头，没敢抬头。',
    ],
  },
  {
    id: 'slacker',
    title: '快乐但危险',
    subtitle: '摆烂路线',
    rank: 'C',
    when: (s) => s.stats.study < 38 && s.stats.mood >= 65,
    paragraphs: [
      '三年下来，你的课本干净得像新的一样，但你的课间十分钟比谁都热闹。',
      '中考前一天你还在操场上打球。成绩出来的时候，家里人沉默了很久。',
      '你倒是不太后悔。只是偶尔会想，如果那时候少玩两节课，现在会不会站在另一所学校门口。',
    ],
  },
  {
    id: 'ordinary',
    title: '就这样过来了',
    subtitle: '普通人的三年',
    rank: 'B',
    when: () => true,
    paragraphs: [
      '没有特别出彩的地方，也没有特别糟糕的地方。三年就这样一节一课地上完了。',
      '你记得某个下午的阳光，记得食堂那碗总是少肉的土豆烧肉，记得有人在你桌上画了一个很难看的小人。',
      '毕业那天你把书包甩在肩上，心想：哦，结束了。然后你就走进了下一个夏天。',
    ],
  },
];

/** 从履历里挑几条最"有故事"的瞬间 */
function pickHighlights(state: GameState): EndingHighlight[] {
  const out: EndingHighlight[] = [];
  const seen = new Set<string>();
  const sorted = [...state.history].sort((a, b) => a.day - b.day);

  for (const h of sorted) {
    if (out.length >= 3) break;
    if (seen.has(h.title)) continue;
    if (h.title.length <= 2) continue;
    seen.add(h.title);
    out.push({ day: h.day, title: h.title, choice: h.choiceText });
  }

  const first = sorted[0];
  if (first && out.length < 4) {
    out.unshift({ day: first.day, title: first.title, choice: first.choiceText });
  }
  return out.slice(0, 4);
}

export function computeEnding(state: GameState): Ending {
  const score = overallScore(state.stats);
  const rule = ENDINGS.find((r) => r.when(state, score)) ?? ENDINGS[ENDINGS.length - 1];

  const paragraphs = [...rule.paragraphs];
  // 追加一句基于心态档位的补充，让结局读起来更"贴合这一局"
  paragraphs.push(`（这三年你的心态大体上是「${moodTier(state.stats.mood)}」，最终综合评分 ${score}。）`);

  return {
    id: rule.id,
    title: rule.title,
    subtitle: rule.subtitle,
    paragraphs,
    rank: rule.rank,
    score,
    highlights: pickHighlights(state),
  };
}

/** 给调试面板用：列出所有结局 */
export function listEndings(): { id: string; title: string; subtitle: string; rank: string }[] {
  return ENDINGS.map((e) => ({ id: e.id, title: e.title, subtitle: e.subtitle, rank: e.rank }));
}
