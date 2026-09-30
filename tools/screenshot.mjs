/**
 * 截图工具（开发用，不属于游戏运行时）。
 *
 * 用途：用本机已装的 Edge 无头模式给页面拍照，方便开发者和 AI 检查像素美术与界面布局。
 * 不下载任何浏览器，只驱动系统已有的 Edge。
 *
 * 用法：
 *   node tools/screenshot.mjs <url> <输出文件> [宽] [高] [等待毫秒] [截图前要执行的JS]
 *
 * 例：
 *   node tools/screenshot.mjs http://127.0.0.1:4173/ docs/shots/boot.png 900 600 1200
 *   node tools/screenshot.mjs "http://127.0.0.1:4173/#dev=art" docs/shots/art.png 900 600 1500
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function findBrowser() {
  for (const p of EDGE_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('找不到 Edge / Chrome，无法截图。请安装 Edge 或改用其他验证方式。');
}

const [, , url, out, wArg, hArg, waitArg, evalArg] = process.argv;

if (!url || !out) {
  console.error('用法：node tools/screenshot.mjs <url> <输出文件> [宽] [高] [等待毫秒] [截图前执行JS]');
  process.exit(1);
}

const width = Number(wArg ?? 900);
const height = Number(hArg ?? 600);
const waitMs = Number(waitArg ?? 1200);
const outPath = resolve(out);
mkdirSync(dirname(outPath), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, waitMs));

  if (evalArg) {
    // eslint-disable-next-line no-undef
    await page.evaluate(evalArg);
    await new Promise((r) => setTimeout(r, 400));
  }

  await page.screenshot({ path: outPath });
  console.log(`SHOT ${outPath}`);
  if (errors.length) {
    console.log('PAGE_ERRORS:');
    for (const e of errors) console.log('  - ' + e);
  } else {
    console.log('PAGE_ERRORS: none');
  }
} finally {
  await browser.close();
}
