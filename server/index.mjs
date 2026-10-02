/**
 * 课间十分钟 · Node 服务（Hono）
 *
 * 只做两件事：
 *  1. 托管 `dist/` 里的静态文件（构建产物）
 *  2. `POST /api/llm` —— 把请求转发给 OpenAI 兼容接口，**API Key 只存在服务器上**
 *
 * 为什么需要它：把 Key 写进前端等于公开。有了这一层，同学打开网址就能直接玩，
 * 不用自己申请 Key，你的 Key 也不会出现在任何人的浏览器里。
 *
 * ── 为什么底层换成了 Hono ──────────────────────────────────────
 * 原来这里是一个零依赖的 `node:http` 服务，很干净，但踩了个坑：
 * PocketBay 要从仓库推断运行方式，而它认的 Node 服务指纹是
 * 「Express / Hono / Koa / NestJS 出现在 dependencies 里」。
 * 零依赖 = 没有任何指纹 → 项目被判成静态站 → 只把 dist/ 抽出来丢进 CDN，
 * **这个进程永远不会被启动**，`/api/llm` 自然也就不存在。
 * 换成 Hono 后指纹出现，平台才会按容器跑它。
 *
 * 行为与原实现逐条保持一致（状态码、错误码、CORS、SPA 兜底、no-cache），
 * 只有绑定地址从「Node 默认的全接口」改成显式的 `0.0.0.0`——平台文档里
 * node 类型的要求原文就是 “listen on PORT; bind 0.0.0.0”。
 *
 * 启动：
 *   node server/index.mjs
 * 环境变量（或 server/.env.local）：
 *   LLM_BASE_URL   例如 https://api.deepseek.com/v1
 *   LLM_MODEL      例如 deepseek-flash
 *   LLM_API_KEY    服务端持有的密钥
 *   PORT           默认 8787
 *   DIST_DIR       默认 ../dist
 */

import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setDefaultResultOrder } from 'node:dns';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';

/*
 * 有些网络环境（校园网 / 运营商 NAT）下 api.deepseek.com 会解析出多个 IPv4 地址，
 * 其中个别不可达。Node 的 fetch 默认只尝试第一个地址，连不上就直接报 `fetch failed`；
 * 而 curl 会逐个地址重试，所以「curl 测是好的、游戏里却说连不上」——很容易误判成 Key 失效。
 * 固定成 IPv4 优先后实测可稳定命中可用地址。
 * 注意：不要再加 net.setDefaultAutoSelectFamily(true)，本机实测那一项反而会超时。
 */
setDefaultResultOrder('ipv4first');

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

/* ------------------------------------------------------------------ *
 * 配置
 * ------------------------------------------------------------------ */

/** 极简 .env 解析：KEY=VALUE，# 开头为注释。不做变量展开，够用就行。 */
function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = {
  ...loadEnvFile(join(ROOT, '.env.local')),
  ...loadEnvFile(join(__dirname, '.env.local')),
};
/** process.env 优先于文件——平台注入的 PORT 必须能盖掉 .env.local 里的 8787 */
const env = (key, fallback = '') => process.env[key] ?? fileEnv[key] ?? fallback;

const PORT = Number(env('PORT', '8787'));
const DIST_DIR = resolve(ROOT, env('DIST_DIR', 'dist'));

/** 把 baseURL 规整成不带尾斜杠的形式，并拼出 chat/completions */
function chatEndpoint(baseURL) {
  return `${baseURL.replace(/\/+$/, '')}/chat/completions`;
}

/* ------------------------------------------------------------------ *
 * 静态文件
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

async function staticResponse(urlPath) {
  if (!existsSync(DIST_DIR)) {
    return new Response('还没有构建产物。先运行：npm run build\n', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  // 目录穿越防护：规范化后必须仍在 DIST_DIR 内
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  let target = resolve(DIST_DIR, rel);
  if (target !== DIST_DIR && !target.startsWith(DIST_DIR + sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, 'index.html');
  } catch {
    // 单页应用：任何找不到的路径都回退到 index.html
    target = join(DIST_DIR, 'index.html');
  }

  try {
    const data = await readFile(target);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

/* ------------------------------------------------------------------ *
 * 应用
 * ------------------------------------------------------------------ */

const app = new Hono();

/* ---------- /api/llm ---------- */

/** CORS 与预检。前端在别的源上调试时也要能打进来。 */
app.use('/api/llm', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, x-llm-key',
      'access-control-allow-methods': 'POST, OPTIONS',
    });
  }
  c.header('access-control-allow-origin', '*');
  await next();
});

app.post('/api/llm', async (c) => {
  const apiKey = env('LLM_API_KEY');
  const baseURL = env('LLM_BASE_URL', 'https://api.deepseek.com/v1');
  const defaultModel = env('LLM_MODEL', 'deepseek-flash');

  // 前端也可以自带 Key（开发者自测 / 纯静态部署时用），带上就优先用它
  const clientKey = c.req.header('x-llm-key');
  const key = typeof clientKey === 'string' && clientKey.trim() ? clientKey.trim() : apiKey;

  if (!key) {
    return c.json(
      {
        error:
          '服务端没有配置 LLM_API_KEY。请在项目根目录建 .env.local 写入 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL，或在设置页改成「浏览器直连」并自己填 Key。',
        code: 'NO_SERVER_KEY',
      },
      503,
    );
  }

  // 请求体上限 1MB：提示词再长也够，顺便防止有人拿它当上传口
  const len = Number(c.req.header('content-length') ?? '0');
  if (Number.isFinite(len) && len > 1024 * 1024) {
    return c.json({ error: '请求体过大' }, 413);
  }

  let payload;
  try {
    payload = await c.req.json();
  } catch (err) {
    return c.json({ error: `请求体不是合法 JSON：${String(err)}` }, 400);
  }

  const {
    messages,
    temperature = 0.9,
    model,
    json: wantJson,
    reasoning_effort: reasoningEffort,
  } = payload ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'messages 不能为空' }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const upstream = await fetch(chatEndpoint(baseURL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model || defaultModel,
        messages,
        temperature,
        ...(wantJson ? { response_format: { type: 'json_object' } } : {}),
        // 透传「关掉思考」的请求（前端设置里的「省 token」开关）。
        // 只有前端明确传了才带上去，免得在不支持的服务商那里报 400。
        ...(typeof reasoningEffort === 'string' ? { reasoning_effort: reasoningEffort } : {}),
      }),
      signal: controller.signal,
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      return c.json(
        {
          error: `上游返回 ${upstream.status}：${text.slice(0, 400)}`,
          code: 'UPSTREAM_ERROR',
        },
        upstream.status,
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return c.json({ error: `上游返回的不是 JSON：${text.slice(0, 200)}` }, 502);
    }

    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return c.json({ error: '上游返回里没有 choices[0].message.content' }, 502);
    }

    return c.json({
      content,
      model: parsed?.model ?? model ?? defaultModel,
      usage: parsed?.usage ?? null,
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return c.json(
      {
        error: aborted ? '上游请求超时' : `请求上游失败：${String(err)}`,
        code: aborted ? 'TIMEOUT' : 'NETWORK',
      },
      aborted ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }
});

/** 其余方法（GET 等）落到这里 */
app.all('/api/llm', (c) => c.json({ error: '只支持 POST' }, 405));

/* ---------- /api/health ---------- */

app.all('/api/health', (c) =>
  c.json({
    ok: true,
    hasKey: Boolean(env('LLM_API_KEY')),
    baseURL: env('LLM_BASE_URL', 'https://api.deepseek.com/v1'),
    model: env('LLM_MODEL', 'deepseek-flash'),
    distReady: existsSync(DIST_DIR),
  }),
);

/* ---------- 静态文件 ---------- */

app.on(['GET', 'HEAD'], '*', (c) => staticResponse(new URL(c.req.url).pathname));
app.all('*', (c) => c.json({ error: '只支持 GET' }, 405));

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

const hasKey = Boolean(env('LLM_API_KEY'));

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, () => {
  console.log('《课间十分钟》服务已启动');
  console.log(`  监听：0.0.0.0:${PORT}（平台注入的 PORT 优先）`);
  console.log(`  本机：http://127.0.0.1:${PORT}`);
  console.log(
    `  静态目录：${DIST_DIR}${existsSync(DIST_DIR) ? '' : '（不存在，先 npm run build）'}`,
  );
  console.log(
    hasKey
      ? `  AI 代理：已配置（${env('LLM_BASE_URL', 'https://api.deepseek.com/v1')} / ${env('LLM_MODEL', 'deepseek-flash')}）`
      : '  AI 代理：未配置 Key，前端会自动降级到本地事件库（在 .env.local 里配 LLM_API_KEY 即可开启）',
  );
});