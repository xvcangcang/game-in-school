# 课间十分钟 · 容器镜像
#
# 为什么需要这个文件：
#   PocketBay 会从仓库自动推断运行方式。我们根目录有 index.html（Vite 的硬性要求），
#   而 server/index.mjs 是**零依赖纯 Node**（没有 express / hono / koa 这类指纹），
#   于是平台把项目判成了「静态站」：只把 dist/ 塞进 nginx，Node 进程从不启动，
#   POST /api/llm 自然也不存在 ——「开发者请客」就无从谈起。
#   根目录放 Dockerfile 是平台官方支持的 dockerfile 类型，用它声明
#   「这是一个常驻 HTTP 服务」最直接。
#
# 注意：**不要把 .env.local 打进镜像**（见 .dockerignore）。
#   API Key 由平台在运行时按原路径只读挂载，server/index.mjs 会自己去读。

# ------------------------------------------------------------------
# 构建阶段：装依赖 + 产出 dist/
# ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# 先只拷贝依赖清单：源码改动就不会触发重新装包，层缓存能留住
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ------------------------------------------------------------------
# 运行阶段：只要能跑起 server/index.mjs 的那几样东西
# ------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
# server/ 是零依赖的，运行时不需要 node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist

# 平台会注入 PORT，server/index.mjs 读它（process.env 优先于 .env.local 里的 8787）。
# 这里只是文档性地声明，真正监听哪个端口以平台注入为准。
EXPOSE 8080

CMD ["node", "server/index.mjs"]