/**
 * 假模型服务（开发用，不属于游戏运行时）。
 *
 * 用途：没有 API Key、或者不想烧额度的时候，用它在本地冒充一个 OpenAI 兼容接口，
 * 把「前端 → 代理 → 上游 → 校验 → 进游戏」这条链路完整跑通。
 *
 * 用法：
 *   node tools/mock-llm.mjs 9999
 *   # 另一个终端，让游戏服务指向它：
 *   $env:LLM_BASE_URL='http://127.0.0.1:9999/v1'; $env:LLM_API_KEY='mock'; npm run server
 *
 * 它会根据请求内容区分「生成事件」和「自由对话」，分别返回不同形状的响应。
 */

import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 9999);

/** 一串预设事件，轮流返回，免得每次都是同一条 */
const EVENTS = [
  {
    title: '窗台上的牛奶',
    text: '{主角} 回到座位，发现窗台上多了一盒温牛奶，底下压着一张没署名的便利贴：「昨天那道题，谢谢。」',
    tone: 'good',
    scene: 'classroom',
    participants: ['npc_deskmate'],
    choices: [
      {
        text: '收下，假装没看见是谁放的',
        resultText: '你把牛奶塞进抽屉，一整个上午都有点走神。',
        effects: { stats: { mood: 8, stamina: 4 }, relations: { npc_deskmate: 3 } },
      },
      {
        text: '拿着便利贴挨个问是谁',
        resultText: '{npc_deskmate} 把头埋进了英语书里，耳朵红得厉害。',
        effects: { stats: { mood: 4, popularity: -3 }, relations: { npc_deskmate: -4 } },
      },
      {
        text: '放到讲台上交给老师',
        effects: { stats: { teacherFavor: 3, mood: -4 } },
      },
    ],
  },
  {
    title: '值日表上的名字',
    text: '轮到你们组值日，{npc_class_teacher} 在门口催：「扫完再走。」黑板擦在你手里掉了一路灰。',
    tone: 'neutral',
    scene: 'classroom',
    participants: ['npc_class_teacher'],
    choices: [
      {
        text: '认真扫完再走',
        resultText: '最后一排的粉笔头你捡了十一个，手上一股灰味。',
        effects: { stats: { stamina: -6, teacherFavor: 5 } },
      },
      {
        text: '糊弄两下就跑',
        effects: { stats: { stamina: -1, teacherFavor: -6, mood: 3 } },
      },
      {
        text: '拉上班里的懒鬼一起干',
        require: { minRelation: { npc_bestfriend: 40 } },
        effects: { stats: { stamina: -3 }, relations: { npc_bestfriend: 2 } },
      },
    ],
  },
];

let cursor = 0;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

const server = createServer((req, res) => {
  if (!req.url?.startsWith('/v1/chat/completions')) {
    json(res, 404, { error: 'mock: 只提供 /v1/chat/completions' });
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let payload = {};
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      /* 忽略，当作空请求 */
    }

    const messages = payload.messages ?? [];
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const isChat = system.includes('和玩家（主角）在课间聊天');

    let content;
    if (isChat) {
      content = '（抬头看了你一眼）嗯？你说那个啊……我昨天也没做出来，第三问。';
    } else if (system.includes('测试用的助手')) {
      content = '{"ok":true}';
    } else {
      content = JSON.stringify(EVENTS[cursor++ % EVENTS.length]);
    }

    console.log(
      `[mock] 收到请求：${isChat ? '自由对话' : '生成事件'}，返回 ${content.slice(0, 40)}…`,
    );

    json(res, 200, {
      id: 'mock-' + Date.now(),
      model: payload.model ?? 'mock-model',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 },
    });
  });
});

server.listen(PORT, () => {
  console.log(`假模型服务已启动：http://127.0.0.1:${PORT}/v1/chat/completions`);
  console.log('把游戏的 LLM_BASE_URL 指到这里即可验证整条 AI 链路。');
});
