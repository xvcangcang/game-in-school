/**
 * 自动跑局工具（开发用，不属于游戏运行时）。
 *
 * 用途：让机器替你把游戏玩几百个时段，检查事件引擎会不会崩、属性会不会越界、
 * 控制台有没有报错。改完事件库或引擎后跑一遍，比手点靠谱得多。
 *
 * 用法：
 *   node tools/playtest.mjs [url] [turns]
 *   node tools/playtest.mjs http://127.0.0.1:4173/ 300
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
const turns = Number(process.argv[3] ?? 300);

const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  // 自动跑局是在页面里跑一个大循环，默认 180 秒的协议超时不够用
  protocolTimeout: 30 * 60 * 1000,
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const errors = [];
  /** 网络层的 404/503 属于「可预期的降级」（比如服务端没配 Key），单独统计，不算失败 */
  const networkNoise = [];
  /** AI 校验失败 / 降级的警告，单独统计——它不代表游戏坏了，但值得知道比率 */
  const aiWarnings = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'warning' && text.includes('[ai]')) {
      aiWarnings.push(text);
      return;
    }
    if (m.type() !== 'error') return;
    if (text.includes('favicon')) return;
    if (/Failed to load resource/.test(text)) {
      networkNoise.push(text);
      return;
    }
    errors.push(text);
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  const result = await page.evaluate(async (maxTurns) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // 把文字速度调成瞬间，否则跑一轮要等打字机
    const settings = JSON.parse(localStorage.getItem('cps:settings') ?? '{}');
    localStorage.setItem('cps:settings', JSON.stringify({ ...settings, textSpeed: 'instant' }));
    localStorage.clear();
    localStorage.setItem('cps:settings', JSON.stringify({ ...settings, textSpeed: 'instant' }));

    // ---- 开一局新游戏 ----
    document.getElementById('boot-start').click();
    await sleep(120);
    document.querySelectorAll('.menu-item')[0].click();
    await sleep(150);
    document.querySelector('.page-actions .pixel-btn').click();
    await sleep(150);
    const nameInput = document.querySelector('.pixel-input');
    nameInput.value = '自动测试';
    nameInput.dispatchEvent(new Event('input'));
    await sleep(80);
    document.querySelector('.page-actions .pixel-btn').click();
    await sleep(200);
    document.querySelector('.page-actions .pixel-btn--primary').click();
    await sleep(200);
    document.querySelector('.page-actions .pixel-btn--primary').click();
    await sleep(400);

    // ---- 自动选选项 ----
    let played = 0;
    let stuck = 0;
    const titles = [];

    for (let t = 0; t < maxTurns; t++) {
      // 等打字机跑完；开了真 AI 时每次要等模型返回，所以给足 20 秒
      let guard = 0;
      while (guard++ < 400 && !document.querySelector('.dialog-choices.is-ready .choice-btn')) {
        await sleep(50);
      }

      const buttons = document.querySelectorAll('.dialog-choices .choice-btn');
      if (buttons.length === 0) {
        // 可能停在成绩单或结局页
        const cont = document.querySelector('.dialog-actions .pixel-btn');
        if (cont) {
          cont.click();
          await sleep(60);
          continue;
        }
        stuck++;
        if (stuck > 5) break;
        await sleep(60);
        continue;
      }
      stuck = 0;

      const titleEl = document.querySelector('.dialog-title');
      if (titleEl) titles.push(titleEl.textContent ?? '');

      buttons[Math.floor(Math.random() * buttons.length)].click();
      played++;
      await sleep(30);

      const cont = document.querySelector('.dialog-actions .pixel-btn');
      if (cont) {
        cont.click();
        await sleep(30);
      }
    }

    const raw = localStorage.getItem('cps:save:1');
    return {
      played,
      titles,
      state: raw ? JSON.parse(raw) : null,
      scene: window.__game?.router.currentSceneId?.() ?? 'unknown',
    };
  }, turns);

  console.log(`PLAYED ${result.played} 个选择，结束场景：${result.scene}`);

  if (result.state) {
    const s = result.state;
    console.log(`进度：${s.phase} 第 ${s.week} 周 第 ${s.day} 天（slotIndex=${s.slotIndex}）`);
    console.log('属性：', JSON.stringify(s.stats));
    console.log(
      `事件：已见 ${s.seenEventIds.length} 种，历史记录 ${s.history.length} 条，标记 ${s.flags.length} 个`,
    );
    const uniq = [...new Set(result.titles)];
    console.log(`本局出现过 ${uniq.length} 种不同事件标题`);

    // 属性越界检查
    const limits = {
      study: 100,
      stamina: 100,
      mood: 100,
      popularity: 100,
      teacherFavor: 100,
      familyExpect: 100,
      money: 999,
    };
    const bad = Object.entries(s.stats).filter(
      ([k, v]) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > limits[k],
    );
    console.log(bad.length === 0 ? '属性范围：OK' : `属性越界：${JSON.stringify(bad)}`);
    const badRel = s.characters.filter((c) => c.relation < -100 || c.relation > 100);
    console.log(badRel.length === 0 ? '好感范围：OK' : `好感越界：${JSON.stringify(badRel)}`);
  } else {
    console.log('没有读到存档，可能是流程没走通');
  }

  if (networkNoise.length) {
    console.log(`网络降级次数：${networkNoise.length}（多数是服务端没配 Key 时的 503，属正常降级）`);
  }

  if (aiWarnings.length) {
    console.log(`AI 生成告警：${aiWarnings.length} 条`);
    const uniq = [...new Set(aiWarnings.map((w) => w.replace(/^.*\[ai\]\s*/, '').slice(0, 90)))];
    for (const w of uniq.slice(0, 6)) console.log('  · ' + w);
  } else {
    console.log('AI 生成告警：0（或因未启用 AI）');
  }

  if (errors.length) {
    console.log('PAGE_ERRORS:');
    for (const e of errors.slice(0, 20)) console.log('  - ' + e);
    process.exitCode = 1;
  } else {
    console.log('PAGE_ERRORS: none');
  }
} finally {
  await browser.close();
}
