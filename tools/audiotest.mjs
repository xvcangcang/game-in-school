/**
 * 音效回归测试（开发用）。
 *
 * 用途：音频不像画面，截图看不出来，只能靠计数。
 * 这个脚本模拟「鼠标在菜单上来回划」「连玩几个时段」，统计实际排了多少个音、
 * 有多少被节流/复音上限拦下。改完 audio.ts 跑一遍，能立刻看出有没有又变成机关枪。
 *
 * 用法：
 *   node tools/audiotest.mjs [url]
 */

import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function findBrowser() {
  for (const p of EDGE_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('找不到 Edge / Chrome');
}

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';

const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-gpu',
    // 无头模式下没有真实用户手势，必须放开自动播放限制，否则 AudioContext 一直是 suspended
    '--autoplay-policy=no-user-gesture-required',
  ],
  protocolTimeout: 10 * 60 * 1000,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 读统计。
 * 注意：必须传一个「在页面里执行并返回对象」的函数。
 * 早先写成 `() => 'window.__game.audioStats()'`（返回字符串字面量），
 * puppeteer 会把字符串原样返回，字段全是 undefined，测试会假通过。
 */
async function readStats(page) {
  return page.evaluate(() => {
    const g = window.__game;
    return g && typeof g.audioStats === 'function' ? g.audioStats() : null;
  });
}

async function resetStats(page) {
  await page.evaluate(() => {
    window.__game?.resetAudioStats?.();
  });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // 点一下「开始游戏」进主菜单（同时满足用户手势要求，让 AudioContext 能启动）
  await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    document.getElementById('boot-start').click();
    await s(300);
  });

  const probe = await readStats(page);
  if (!probe) {
    console.error('页面里没有 __game.audioStats，可能加载的是旧构建。先 npm run build。');
    process.exit(1);
  }

  /* ---------- 测试 1：鼠标在菜单上来回划 ---------- */
  await resetStats(page);

  const box = await page.evaluate(() => {
    const items = document.querySelectorAll('.menu-item');
    if (items.length < 2) return null;
    const first = items[0].getBoundingClientRect();
    const last = items[items.length - 1].getBoundingClientRect();
    return { top: first.top + 5, bottom: last.top + 5, x: first.left + 40, count: items.length };
  });

  const sweepStart = Date.now();
  if (box) {
    const span = box.bottom - box.top;
    for (let pass = 0; pass < 20; pass++) {
      for (let i = 0; i < box.count; i++) {
        await page.mouse.move(box.x, box.top + (span / (box.count - 1)) * i);
        await sleep(12);
      }
      for (let i = box.count - 1; i >= 0; i--) {
        await page.mouse.move(box.x, box.top + (span / (box.count - 1)) * i);
        await sleep(12);
      }
    }
  }
  const sweepMs = Date.now() - sweepStart;
  const hoverStats = await readStats(page);

  console.log('=== 测试 1：鼠标在主菜单上来回扫 20 遍 ===');
  console.log(`时长 ${sweepMs} ms`);
  console.log(`实际发声 ${hoverStats.scheduled} 个，节流拦下 ${hoverStats.droppedThrottle} 个`);
  const hoverRate = hoverStats.scheduled / (sweepMs / 1000);
  console.log(`发声频率 ${hoverRate.toFixed(1)} 个/秒   （超过 15 说明节流失效）`);

  /* ---------- 测试 2：连玩若干时段 ---------- */
  await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    localStorage.setItem(
      'cps:settings',
      JSON.stringify({
        version: 1,
        textSpeed: 'normal',
        sfx: true,
        bgm: false,
        uiScale: 1,
        ai: {
          enabled: false,
          baseURL: 'https://api.deepseek.com/v1',
          model: 'deepseek-flash',
          apiKey: '',
          useProxy: true,
          temperature: 0.9,
          timeoutMs: 8000,
        },
      }),
    );
    document.querySelectorAll('.menu-item')[0].click();
    await s(150);
    document.querySelector('.page-actions .pixel-btn').click();
    await s(150);
    const i = document.querySelector('.pixel-input');
    i.value = '音频测试';
    i.dispatchEvent(new Event('input'));
    await s(80);
    document.querySelector('.page-actions .pixel-btn').click();
    await s(200);
    document.querySelector('.page-actions .pixel-btn--primary').click();
    await s(250);
    document.querySelector('.page-actions .pixel-btn--primary').click();
    await s(600);
  });

  await resetStats(page);
  const playStart = Date.now();
  let turnsPlayed = 0;

  for (let turn = 0; turn < 6; turn++) {
    let guard = 0;
    while (guard++ < 200 && !(await page.$('.dialog-choices.is-ready .choice-btn'))) {
      await sleep(50);
    }
    const clicked = await page.evaluate(() => {
      const b = document.querySelector('.dialog-choices.is-ready .choice-btn');
      if (!b) return false;
      b.click();
      return true;
    });
    if (!clicked) break;
    turnsPlayed++;
    await sleep(300);
    await page.evaluate(() => {
      const c = document.querySelector('.dialog-actions .pixel-btn');
      if (c) c.click();
    });
    await sleep(200);
  }

  const playMs = Date.now() - playStart;
  const playStats = await readStats(page);

  console.log('');
  console.log(`=== 测试 2：连玩 ${turnsPlayed} 个时段（正常文字速度，打字机音开着）===`);
  console.log(`时长 ${playMs} ms`);
  console.log(
    `实际发声 ${playStats.scheduled} 个（节流拦下 ${playStats.droppedThrottle}，复音上限拦下 ${playStats.droppedVoices}）`,
  );
  const playRate = playStats.scheduled / (playMs / 1000);
  console.log(`发声频率 ${playRate.toFixed(1)} 个/秒   （超过 12 偏吵）`);
  console.log(`同时发声的声部：${playStats.voices}`);
  console.log(`音频上下文：${playStats.running ? 'running' : '未运行'}`);

  /* ---------- 判定 ---------- */
  const failures = [];
  if (hoverRate > 15) failures.push(`菜单悬停发声频率过高：${hoverRate.toFixed(1)}/秒`);
  if (playRate > 12) failures.push(`游玩发声频率过高：${playRate.toFixed(1)}/秒`);
  if (playStats.voices > 8) failures.push(`同时发声声部超限：${playStats.voices}`);
  if (turnsPlayed < 3) failures.push(`只玩到 ${turnsPlayed} 个时段，样本太少`);

  console.log('');
  if (failures.length) {
    console.log('结果：不合格');
    for (const f of failures) console.log('  x ' + f);
    process.exitCode = 1;
  } else {
    console.log('结果：合格');
  }
} finally {
  await browser.close();
}
