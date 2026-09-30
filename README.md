# 课间十分钟

> 初中校园主题 · 像素风 · 剧情 / 模拟养成游戏

打开游戏进入主界面，选择游戏阶段（初一 / 初二 / 初三）开始你的三年。
每逢课间都可能随机触发剧情：突击考试、和同学起争执、老师抽风布置一堆作业、拖堂占课……

剧情由 **AI 动态生成 + 内置事件库兜底** 双模式驱动：配了 API 就千变万化，没配也能完整通关。
所有美术（角色精灵、教室、操场……）都是代码逐像素画出来的，没有使用任何外部素材。

## 快速开始

```bash
npm install
npm run dev        # 开发模式：http://localhost:5173
```

## 正式玩（推荐，AI 已就绪）

```bash
npm run build
cp server/.env.example .env.local     # Windows: copy server\.env.example .env.local
# 编辑 .env.local，填上 LLM_API_KEY（以及 LLM_BASE_URL / LLM_MODEL）
npm run server                        # http://127.0.0.1:8787
```

`.env.local` 长这样：

```
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-你的密钥
PORT=8787
```

**为什么要有服务端**：把 Key 写进网页等于公开。有了这一层，同学打开网址就能直接玩，
不用自己申请 Key，你的 Key 也不会出现在任何人的浏览器里。

不想用服务器、只想发一个纯静态页面（GitHub Pages 之类）？也可以——把 `dist/` 传上去，
玩家在「设置 → AI 剧情」里把连接方式改成「浏览器直连」并填自己的 Key 即可。

## 没配 API 也能玩

AI 关闭 / 没网 / 超时 / 返回的数据不合法 —— 任何一种情况都会**自动降级**到内置的
64 条手写事件库，玩家侧只会觉得「这次比较平常」。游戏永远不会卡住。

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器（热更新） |
| `npm run build` | 类型检查 + 产出 `dist/` |
| `npm run server` | 启动生产服务（静态托管 + AI 代理） |
| `npm start` | 构建并启动生产服务 |
| `npm run typecheck` | 只做类型检查 |
| `npm run shot -- <url> <文件> [宽] [高] [等待ms] [JS]` | 用本机 Edge 无头截图 |
| `npm run playtest -- <url> [回合数]` | 自动把游戏玩 N 个时段，检查越界与报错 |
| `npm run mock-llm` | 启动假模型服务，不用真 Key 就能验证 AI 链路 |

## 文档

| 文档 | 用途 |
| --- | --- |
| [设计方案](docs/设计方案.md) | 玩法、技术选型、目录分层、里程碑 |
| [开发日志](docs/开发日志.md) | 每次提交做了什么、踩了什么坑 |
| [交接文档](docs/交接文档.md) | **接手项目先读这个** |

## 技术栈

Vite 8 · TypeScript 7 · 原生 Canvas 2D + DOM 双层渲染 · 零依赖 Node 代理 · 全程序化像素美术
