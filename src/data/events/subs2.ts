import type { GameEvent } from '@/game/types';

/**
 * 扩充小剧情 · 第一批。
 *
 * 与 subs.ts 同一套约定：`isSubEvent: true`、篇幅短（正文 25~60 字）、
 * 选项 2~3 个、数值变动小（±2~6）、`slots` 尽量精确到具体某一节，避免穿帮。
 *
 * 它们不会被主线抽选抽到，只在大剧情结算时按概率或 subEvents / followUpId 接上来。
 */
export const SUB_EVENTS_2: GameEvent[] = [
  /* ---------------- 早读 ---------------- */
  {
    id: 'sub2_reading_echo',
    source: 'builtin',
    title: '齐读的声浪',
    text: '全班一起念课文，声音像一排浪拍过来。你听见自己的声音混在里面，分不清哪个是自己的。',
    tone: 'neutral',
    weight: 12,
    cooldownDays: 14,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['morningReading'],
    choices: [
      {
        id: 'loud',
        text: '跟着大声念',
        resultText: '念到最后一句，你的嗓子有点热。',
        effects: { stats: { study: 3, stamina: -2, mood: 2 } },
      },
      {
        id: 'mouth',
        text: '只动嘴不出声',
        effects: { stats: { stamina: 1, study: -2 } },
      },
      {
        id: 'read_ahead',
        text: '偷偷往后翻两页先看',
        effects: { stats: { study: 2 } },
      },
    ],
  },

  /* ---------------- 上午 ---------------- */
  {
    id: 'sub2_homework_check',
    source: 'builtin',
    title: '抽查作业',
    text: '{npc_math_teacher} 走下讲台，一本一本翻过去。脚步声在你身后停了一下，又往前走了。',
    tone: 'bad',
    weight: 12,
    cooldownDays: 14,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['early', 'am'],
    participants: ['npc_math_teacher'],
    choices: [
      {
        id: 'relief',
        text: '暗暗松了口气',
        resultText: '你才发现自己刚才一直屏着呼吸。',
        effects: { stats: { mood: -2, stamina: -1 } },
      },
      {
        id: 'check_self',
        text: '趁这会儿把没写的补两行',
        effects: { stats: { study: 2, stamina: -2 } },
      },
      {
        id: 'borrow',
        text: '跟同桌对一下答案',
        effects: { stats: { study: 2, mood: 1 }, relations: { npc_deskmate: 2 } },
      },
    ],
  },
  {
    id: 'sub2_window_knock',
    source: 'builtin',
    title: '窗外有人敲',
    text: '上课上到一半，窗户被人从外面敲了两下。是隔壁班同学来还笔的，{npc_class_teacher} 的目光已经转了过来。',
    tone: 'bad',
    weight: 11,
    cooldownDays: 15,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['am', 'pm'],
    participants: ['npc_class_teacher'],
    choices: [
      {
        id: 'wave_off',
        text: '摆手让他待会儿再来',
        effects: { stats: { mood: -1, popularity: 1 } },
      },
      {
        id: 'take_it',
        text: '趁老师转身把笔接过来',
        resultText: '笔接住了，你的手却悬在半空——老师正好回头。',
        effects: { stats: { teacherFavor: -3, mood: -2 } },
      },
      {
        id: 'ignore',
        text: '装作没看见',
        effects: { stats: { study: 2 } },
      },
    ],
  },
  {
    id: 'sub2_morning_run_line',
    source: 'builtin',
    title: '跑操的队形',
    text: '音乐一响，全年级的队伍往操场推。你前面的班级忽然停了半步，后面的人撞到了你的背上。',
    tone: 'neutral',
    weight: 12,
    cooldownDays: 15,
    isSubEvent: true,
    scene: 'playground',
    slots: ['morningRun'],
    choices: [
      {
        id: 'steady',
        text: '稳住脚步，跟着节奏',
        effects: { stats: { stamina: -3 } },
      },
      {
        id: 'joke',
        text: '回头跟撞你的人开个玩笑',
        resultText: '两个人一边跑一边笑，队伍乱了半排。',
        effects: { stats: { mood: 3, popularity: 2, stamina: -2 } },
      },
      {
        id: 'step_wide',
        text: '把步子迈大一点，拉开距离',
        effects: { stats: { stamina: -4 } },
      },
    ],
  },

  /* ---------------- 中午 ---------------- */
  {
    id: 'sub2_lunch_tray',
    source: 'builtin',
    title: '打翻的餐盘',
    text: '你端着餐盘转身，和迎面的人碰了个正着。汤洒了半盘，对方的鞋上溅到了几点。',
    tone: 'bad',
    weight: 11,
    cooldownDays: 16,
    isSubEvent: true,
    scene: 'cafeteria',
    slots: ['lunch'],
    choices: [
      {
        id: 'apologize',
        text: '连声道歉，先道歉再说',
        resultText: '对方反而笑起来：「没事没事，我也没看路。」',
        effects: { stats: { popularity: 3, mood: -1 } },
      },
      {
        id: 'clean',
        text: '蹲下去帮忙擦鞋',
        effects: { stats: { stamina: -2, popularity: 4, mood: 1 } },
      },
      {
        id: 'grumpy',
        text: '嘟囔一句，端着盘子走开',
        effects: { stats: { mood: -3, popularity: -3 } },
      },
    ],
  },
  {
    id: 'sub2_noon_doodle',
    source: 'builtin',
    title: '桌上的涂鸦',
    text: '午休趴着睡不着，你发现自己的桌面上被人用铅笔描了一只很丑的小狗，旁边写着「猜猜是谁」。',
    tone: 'good',
    weight: 11,
    cooldownDays: 16,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['noonBreak'],
    choices: [
      {
        id: 'add',
        text: '给它添一顶帽子',
        resultText: '第二天桌上多了一顶歪掉的帽子——有人接着画了。',
        effects: { stats: { mood: 4, popularity: 2 } },
      },
      {
        id: 'erase',
        text: '用橡皮擦掉',
        effects: { stats: { mood: -1 } },
      },
      {
        id: 'guess',
        text: '回头看看是谁',
        resultText: '你回头时，{npc_deskmate} 正趴在胳膊上假装睡觉，耳朵红了。',
        effects: { stats: { mood: 3 }, relations: { npc_deskmate: 3 } },
      },
    ],
  },

  /* ---------------- 下午 ---------------- */
  {
    id: 'sub2_deskmate_pen',
    source: 'builtin',
    title: '笔没水了',
    text: '{npc_deskmate} 在一张纸上反复划同一道线，划了七八遍，还是没颜色。',
    tone: 'neutral',
    weight: 12,
    cooldownDays: 14,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['pm', 'am'],
    participants: ['npc_deskmate'],
    choices: [
      {
        id: 'lend',
        text: '把自己的备用笔递过去',
        resultText: '她接过笔的时候指尖凉凉的，小声说了句「谢啦」。',
        effects: { stats: { mood: 3 }, relations: { npc_deskmate: 4 } },
      },
      {
        id: 'watch',
        text: '看着她又划了一遍',
        effects: { stats: { mood: 1 } },
      },
      {
        id: 'borrow_back',
        text: '说「借我一支，我的也没水了」',
        resultText: '她翻遍笔袋，最后把彩笔借给了你。',
        effects: { stats: { mood: 2 }, relations: { npc_deskmate: 2 } },
      },
    ],
  },
  {
    id: 'sub2_period8_early',
    source: 'builtin',
    title: '班会提前结束',
    text: '{npc_class_teacher} 讲了十分钟就看了看表：「行，剩下的时间你们自由安排。」教室里先是安静了两秒，然后响起纸页翻动的声音。',
    tone: 'good',
    weight: 11,
    cooldownDays: 18,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['period8'],
    participants: ['npc_class_teacher'],
    choices: [
      {
        id: 'homework',
        text: '把作业摊开先写一会儿',
        effects: { stats: { study: 4, stamina: -2 } },
      },
      {
        id: 'chat',
        text: '和旁边的人聊两句',
        effects: { stats: { mood: 4, popularity: 2, study: -1 } },
      },
      {
        id: 'plan',
        text: '掏出明天的课程表看看',
        effects: { stats: { study: 1, mood: 1 } },
      },
    ],
  },

  /* ---------------- 晚自习 ---------------- */
  {
    id: 'sub2_evening_patrol',
    source: 'builtin',
    title: '巡堂的脚步声',
    text: '走廊上传来不急不缓的脚步声，由远及近，在你们班门口停了一下。教室里翻书的声音忽然小了一半。',
    tone: 'bad',
    weight: 12,
    cooldownDays: 14,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['eveningStudy'],
    choices: [
      {
        id: 'sit_up',
        text: '坐直了，把练习册往前推推',
        effects: { stats: { study: 2, mood: -1 } },
      },
      {
        id: 'pretend',
        text: '假装在看题，其实在走神',
        effects: { stats: { mood: 1, study: -2 } },
      },
      {
        id: 'hide',
        text: '把不该带的东西塞进抽屉',
        effects: { stats: { mood: -2, teacherFavor: 1 } },
      },
    ],
  },
  {
    id: 'sub2_evening_rain',
    source: 'builtin',
    title: '晚自习的雨',
    text: '雨不知道什么时候下起来的，敲在窗户上，一声接一声。教室里没人说话，只有笔尖沙沙地响。',
    tone: 'neutral',
    weight: 11,
    cooldownDays: 15,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['eveningStudy'],
    choices: [
      {
        id: 'listen',
        text: '停下笔，听一会儿雨',
        resultText: '再低头时，卷子上多了一小片没被写过的空白。',
        effects: { stats: { mood: 4, study: -2 } },
      },
      {
        id: 'focus',
        text: '把心思收回来继续写',
        effects: { stats: { study: 3, mood: -1 } },
      },
      {
        id: 'worry',
        text: '开始担心怎么回家',
        effects: { stats: { mood: -3 } },
      },
    ],
  },
];