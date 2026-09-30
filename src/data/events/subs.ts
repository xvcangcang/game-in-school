import type { GameEvent } from '@/game/types';

/**
 * 小剧情（插曲）。
 *
 * 它们**不会**被主线抽选抽到，只在大剧情演完之后被接上去，用来把一段时间"填满"：
 * 上课上到一半同桌偷偷跟你说话、跑操时鞋带松了、晚自习突然停电……
 *
 * 写法约定：
 * - `isSubEvent: true`，引擎据此保证小剧情不再套小剧情
 * - 篇幅比主线短（正文 30~70 字），选项 2~3 个，数值变动小（±2~6）
 * - `slots` 尽量精确到大段甚至某一节（跑操就写 `morningRun`，晚自习就写 `eveningStudy`），
 *   否则会出现"午休时在跑操"的穿帮
 * - `cooldownDays` 给大一点，插曲重复出现比主线更明显
 */
export const SUB_EVENTS: GameEvent[] = [
  /* ---------------- 早读 ---------------- */
  {
    id: 'sub_early_sleepy',
    source: 'builtin',
    title: '眼皮打架',
    text: '早读的声音像一层温水。你盯着课本上同一行字看了很久，字开始重影。',
    tone: 'neutral',
    weight: 12,
    cooldownDays: 14,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['morningReading'],
    choices: [
      {
        id: 'stand',
        text: '站起来读，醒醒脑',
        resultText: '你站到桌子边上，声音有点抖，但人是清醒的。',
        effects: { stats: { study: 3, stamina: -3 } },
      },
      {
        id: 'pinch',
        text: '掐一下自己的手背',
        effects: { stats: { study: 1, stamina: -1 } },
      },
      {
        id: 'doze',
        text: '趴下去眯五分钟',
        resultText: '你被自己的名字惊醒了——老师站在门口点了你。',
        effects: { stats: { stamina: 5, teacherFavor: -4, study: -2 } },
      },
    ],
  },

  /* ---------------- 上午 ---------------- */
  {
    id: 'sub_period_note_passing',
    source: 'builtin',
    title: '传纸条',
    text: '一张折成小方块的纸从后排一路挪过来，停在你手边。上面写着：「下节体育课带球了吗？」',
    tone: 'neutral',
    weight: 14,
    cooldownDays: 12,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['am'],
    participants: ['npc_bestfriend'],
    choices: [
      {
        id: 'reply',
        text: '回一句，再传回去',
        resultText: '你写「带了」，纸条原路返回。{npc_bestfriend} 在后排比了个 OK。',
        effects: { stats: { popularity: 3, study: -2 }, relations: { npc_bestfriend: 2 } },
      },
      {
        id: 'ignore',
        text: '扣在课本底下，先听课',
        effects: { stats: { study: 2, popularity: -1 } },
      },
      {
        id: 'hand_in',
        text: '举手交给老师',
        resultText: '老师念了半句就停住了，后排安静了一整节课。',
        effects: { stats: { teacherFavor: 4, popularity: -5 }, relations: { npc_bestfriend: -6 } },
      },
    ],
  },
  {
    id: 'sub_period_stomach',
    source: 'builtin',
    title: '肚子叫了',
    text: '教室里很安静，你的肚子偏偏在这个节骨眼上响了一声。前排有人回过头。',
    tone: 'bad',
    weight: 11,
    cooldownDays: 14,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['am', 'pm'],
    choices: [
      {
        id: 'pretend',
        text: '假装是椅子响',
        resultText: '你挪了挪椅子，声音混过去了。前排的人将信将疑地转回去。',
        effects: { stats: { mood: 2, popularity: -1 } },
      },
      {
        id: 'admit',
        text: '小声说「早上没吃饭」',
        resultText: '同桌从笔袋里摸出一颗糖推过来。',
        effects: { stats: { mood: 4, popularity: 2 }, relations: { npc_deskmate: 2 } },
      },
      {
        id: 'endure',
        text: '绷住，熬到下课',
        effects: { stats: { stamina: -3, mood: -2 } },
      },
    ],
  },
  {
    id: 'sub_morning_run_shoelace',
    source: 'builtin',
    title: '鞋带松了',
    text: '跑操跑到第二圈，你感觉右脚松了。整个班正踩着同一步点往前推，你不好停。',
    tone: 'bad',
    weight: 13,
    cooldownDays: 16,
    isSubEvent: true,
    scene: 'playground',
    slots: ['morningRun'],
    choices: [
      {
        id: 'hold',
        text: '咬牙跑完全程',
        resultText: '你一半注意力在脚上，跑到终点时鞋带已经拖到地上。',
        effects: { stats: { stamina: -6, mood: -2 } },
      },
      {
        id: 'step_out',
        text: '出列，蹲下系好',
        resultText: '你退出队列三秒。体育老师在远处看了你一眼。',
        effects: { stats: { stamina: -2 }, relations: { npc_class_teacher: -1 } },
      },
      {
        id: 'slow',
        text: '放慢半步，用脚后跟拖着',
        effects: { stats: { stamina: -3 } },
      },
    ],
  },

  /* ---------------- 中午 ---------------- */
  {
    id: 'sub_lunch_queue',
    source: 'builtin',
    title: '打饭的队伍',
    text: '队伍排到走廊拐角，前面忽然挤进来两个人。打饭阿姨没有抬头。',
    tone: 'neutral',
    weight: 13,
    cooldownDays: 12,
    isSubEvent: true,
    scene: 'cafeteria',
    slots: ['lunch'],
    choices: [
      {
        id: 'swallow',
        text: '算了，多站两分钟',
        effects: { stats: { mood: -3 } },
      },
      {
        id: 'call_out',
        text: '说一句「后面排着呢」',
        resultText: '那两人回头看了看，磨磨蹭蹭退到了后面。后面有人说「行啊」。',
        effects: { stats: { popularity: 3, mood: 2 }, relations: { npc_bully: -2 } },
      },
      {
        id: 'go_other',
        text: '换一个窗口排',
        effects: { stats: { stamina: -2 } },
      },
    ],
  },
  {
    id: 'sub_noon_sleepless',
    source: 'builtin',
    title: '趴不着的午休',
    text: '教室里拉上了窗帘。同桌已经睡熟了，你趴在胳膊上，脑子反而越来越清醒。',
    tone: 'neutral',
    weight: 12,
    cooldownDays: 14,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['noonBreak'],
    participants: ['npc_deskmate'],
    choices: [
      {
        id: 'try_sleep',
        text: '闭眼数呼吸',
        effects: { stats: { stamina: 5, mood: 2 } },
      },
      {
        id: 'read',
        text: '摸出课本悄悄看两页',
        effects: { stats: { study: 3, stamina: -3 } },
      },
      {
        id: 'stare',
        text: '看着窗帘上的一块光发呆',
        resultText: '光斑慢慢挪过整张课桌。铃响的时候你有点恍惚。',
        effects: { stats: { mood: 3 } },
      },
    ],
  },

  /* ---------------- 下午 ---------------- */
  {
    id: 'sub_period_pencil_broken',
    source: 'builtin',
    title: '笔断了',
    text: '铅笔芯「啪」地断在答题卡上，笔袋里一支能用的都没有。',
    tone: 'bad',
    weight: 11,
    cooldownDays: 15,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['pm'],
    choices: [
      {
        id: 'borrow_deskmate',
        text: '戳一下同桌',
        resultText: '同桌把笔袋整个推过来，用嘴型说「随便挑」。',
        effects: { stats: { mood: 2 }, relations: { npc_deskmate: 2 } },
      },
      {
        id: 'ask_teacher',
        text: '举手问老师借',
        effects: { stats: { teacherFavor: 2, popularity: -1 } },
      },
      {
        id: 'pen',
        text: '换钢笔，字丑就丑吧',
        effects: { stats: { study: -1, mood: -1 } },
      },
    ],
  },
  {
    id: 'sub_period_rain',
    source: 'builtin',
    title: '外面的雨',
    text: '雨点忽然大起来，砸在窗玻璃上。靠窗那排的人齐刷刷偏了头，老师还在讲台上写板书。',
    tone: 'neutral',
    weight: 12,
    cooldownDays: 15,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['pm', 'am'],
    choices: [
      {
        id: 'watch',
        text: '跟着看了一会儿',
        resultText: '你看清雨水是怎么在玻璃上拐弯的。回过头时黑板已经写满了。',
        effects: { stats: { mood: 4, study: -3 } },
      },
      {
        id: 'note_down',
        text: '低头把板书补上',
        effects: { stats: { study: 3, mood: -1 } },
      },
      {
        id: 'umbrella',
        text: '开始担心自己没带伞',
        effects: { stats: { mood: -3 } },
      },
    ],
  },
  {
    id: 'sub_period8_class_meeting',
    source: 'builtin',
    title: '班会的最后一分钟',
    text: '{npc_class_teacher} 看了看表：「还有一分钟，谁想说点什么？」教室里安静得能听见日光灯的声音。',
    tone: 'neutral',
    weight: 12,
    cooldownDays: 18,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['period8'],
    participants: ['npc_class_teacher'],
    choices: [
      {
        id: 'speak',
        text: '举手说两句',
        resultText: '你说了个不大不小的建议。老赵点点头，记在了本子上。',
        effects: { stats: { popularity: 4, teacherFavor: 4, mood: -2 } },
      },
      {
        id: 'silent',
        text: '低头收拾书包',
        effects: { stats: { mood: 1 } },
      },
      {
        id: 'nudge',
        text: '用胳膊肘怂恿同桌说',
        resultText: '同桌站起来磕磕绊绊说了一句，坐下时狠狠瞪了你一眼，嘴角却是笑的。',
        effects: { stats: { popularity: 2, mood: 2 }, relations: { npc_deskmate: 3 } },
      },
    ],
  },

  /* ---------------- 晚自习 ---------------- */
  {
    id: 'sub_evening_deskmate_chat',
    source: 'builtin',
    title: '晚自习的悄悄话',
    text: '晚自习的灯管嗡嗡响。{npc_deskmate} 把练习册立起来挡着，侧过头压着嗓子说：「你觉不觉得，咱们班那个转学生挺怪的。」',
    tone: 'neutral',
    weight: 15,
    cooldownDays: 10,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['eveningStudy'],
    participants: ['npc_deskmate'],
    choices: [
      {
        id: 'gossip',
        text: '凑过去一起分析',
        resultText: '你们越说越起劲，直到前排传来一声轻咳——值班老师正站在后门口。',
        effects: {
          stats: { popularity: 3, mood: 5, teacherFavor: -4, study: -3 },
          relations: { npc_deskmate: 4 },
        },
      },
      {
        id: 'shush',
        text: '「先写作业吧」',
        resultText: '{npc_deskmate} 撇撇嘴，把练习册放下了。',
        effects: { stats: { study: 3 }, relations: { npc_deskmate: -2 } },
      },
      {
        id: 'whisper_back',
        text: '小声回一句，但不接话头',
        effects: { stats: { mood: 2 }, relations: { npc_deskmate: 1 } },
      },
    ],
  },
  {
    id: 'sub_evening_lights_out',
    source: 'builtin',
    title: '停电',
    text: '灯管闪了两下，整栋楼黑了下去。三秒之后，教室里炸开了锅。',
    tone: 'good',
    weight: 8,
    cooldownDays: 25,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['eveningStudy'],
    choices: [
      {
        id: 'shout',
        text: '跟着起哄喊一声',
        resultText: '你喊完就后悔了——广播里传来教导主任的声音。',
        effects: { stats: { mood: 6, popularity: 3, teacherFavor: -5 } },
      },
      {
        id: 'quiet',
        text: '坐着不动，等灯亮',
        resultText: '黑暗里有人轻轻碰了碰你的胳膊，又缩回去了。',
        effects: { stats: { mood: 3 } },
      },
      {
        id: 'phone',
        text: '摸出手机照个亮',
        effects: { stats: { popularity: 2, teacherFavor: -6, mood: 3 } },
      },
    ],
  },
  {
    id: 'sub_evening_homework_left',
    source: 'builtin',
    title: '还剩三页',
    text: '晚自习最后一节，你翻到练习册还剩三页没写。走廊上已经有班级在收拾书包了。',
    tone: 'bad',
    weight: 12,
    cooldownDays: 14,
    isSubEvent: true,
    scene: 'classroom',
    slots: ['eveningStudy'],
    choices: [
      {
        id: 'rush',
        text: '加快速度硬写完',
        resultText: '字迹越来越飞，但三页确实写完了。收书包时手有点抖。',
        effects: { stats: { study: 4, stamina: -6, mood: -2 } },
      },
      {
        id: 'copy',
        text: '借同桌的抄最后两页',
        require: { minRelation: { npc_deskmate: 20 } },
        effects: { stats: { study: -1, mood: 2, teacherFavor: -2 }, relations: { npc_deskmate: -1 } },
      },
      {
        id: 'leave',
        text: '合上本子，明天早点来补',
        effects: { stats: { mood: 4, study: -3, teacherFavor: -2 } },
      },
    ],
  },
];
