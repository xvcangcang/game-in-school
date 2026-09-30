/**
 * 课间十分钟 · 零依赖 Node 服务
 *
 * 只做两件事：
 *  1. 托管 `dist/` 里的静态文件（构建产物）
 *  2. `POST /api/llm` —— 把请求转发给 OpenAI 兼容接口，**API Key 只存在服务器上**
 *
 * 为什么需要它：把 Key 写进前端等于公开。有了这一层，同学打开网址就能直接玩，
 * 不用自己申请 Key，你的 Key 也不会出现在任何人的浏览器里。
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

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const fileEnv = { ...loadEnvFile(join(ROOT, '.env.local')), ...loadEnvFile(join(__dirname, '.env.local')) };
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

async function serveStatic(req, res, urlPath) {
  if (!existsSync(DIST_DIR)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('还没有构建产物。先运行：npm run build\n');
    return;
  }

  // 目录穿越防护：规范化后必须仍在 DIST_DIR 内
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  let target = resolve(DIST_DIR, rel);
  if (target !== DIST_DIR && !target.startsWith(DIST_DIR + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
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
    res.writeHead(200, {
      'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not Found');
  }
}

/* ------------------------------------------------------------------ *
 * /api/llm 代理
 * ------------------------------------------------------------------ */

function readBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        rejectPromise(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectPromise);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function handleLlm(req, res) {
  const apiKey = env('LLM_API_KEY');
  const baseURL = env('LLM_BASE_URL', 'https://api.deepseek.com/v1');
  const defaultModel = env('LLM_MODEL', 'deepseek-flash');

  // 前端也可以自带 Key（开发者自测 / 纯静态部署时用），带上就优先用它
  const clientKey = req.headers['x-llm-key'];
  const key = typeof clientKey === 'string' && clientKey.trim() ? clientKey.trim() : apiKey;

  if (!key) {
    json(res, 503, {
      error:
        '服务端没有配置 LLM_API_KEY。请在项目根目录建 .env.local 写入 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL，或在设置页改成「浏览器直连」并自己填 Key。',
      code: 'NO_SERVER_KEY',
    });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    json(res, 400, { error: `请求体不是合法 JSON：${String(err)}` });
    return;
  }

  const { messages, temperature = 0.9, model, json: wantJson, reasoning_effort: reasoningEffort } = payload ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    json(res, 400, { error: 'messages 不能为空' });
    return;
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
      json(res, upstream.status, {
        error: `上游返回 ${upstream.status}：${text.slice(0, 400)}`,
        code: 'UPSTREAM_ERROR',
      });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      json(res, 502, { error: `上游返回的不是 JSON：${text.slice(0, 200)}` });
      return;
    }

    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      json(res, 502, { error: '上游返回里没有 choices[0].message.content' });
      return;
    }

    json(res, 200, { content, model: parsed?.model ?? model ?? defaultModel, usage: parsed?.usage ?? null });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    json(res, aborted ? 504 : 502, {
      error: aborted ? '上游请求超时' : `请求上游失败：${String(err)}`,
      code: aborted ? 'TIMEOUT' : 'NETWORK',
    });
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/llm') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, x-llm-key',
        'access-control-allow-methods': 'POST, OPTIONS',
      });
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      json(res, 405, { error: '只支持 POST' });
      return;
    }
    res.setHeader('access-control-allow-origin', '*');
    await handleLlm(req, res);
    return;
  }

  if (url.pathname === '/api/health') {
    json(res, 200, {
      ok: true,
      hasKey: Boolean(env('LLM_API_KEY')),
      baseURL: env('LLM_BASE_URL', 'https://api.deepseek.com/v1'),
      model: env('LLM_MODEL', 'deepseek-flash'),
      distReady: existsSync(DIST_DIR),
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: '只支持 GET' });
    return;
  }

  await serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  const hasKey = Boolean(env('LLM_API_KEY'));
  console.log(`《课间十分钟》服务已启动`);
  console.log(`  地址：http://127.0.0.1:${PORT}`);
  console.log(`  静态目录：${DIST_DIR}${existsSync(DIST_DIR) ? '' : '（不存在，先 npm run build）'}`);
  console.log(
    hasKey
      ? `  AI 代理：已配置（${env('LLM_BASE_URL', 'https://api.deepseek.com/v1')} / ${env('LLM_MODEL', 'deepseek-flash')}）`
      : '  AI 代理：未配置 Key，前端会自动降级到本地事件库（在 .env.local 里配 LLM_API_KEY 即可开启）',
  );
});
