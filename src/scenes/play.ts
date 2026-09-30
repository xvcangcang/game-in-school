/**
 * 游玩场景：整个游戏的主循环界面。
 *
 * 结构上分两层：
 *  - Canvas：画当前事件发生的场景（教室/走廊/操场…）和在场角色
 *  - DOM：顶部状态条、对话框、选项按钮、NPC 聊天面板（中文文本一律走 DOM）
 *
 * 流程：挑事件 → 打字机显示正文 → 玩家选择 → 显示结果与数值变化 → 推进时段 → 回到第一步。
 *
 * 事件来源是「双模式」：
 *  - 开了 AI 且配置可用 → 先请 AI 现场编一个，校验通过就用它
 *  - AI 关闭 / 超时 / 返回不合法 → 静默降级到内置事件库，玩家侧只会觉得"这次比较平常"
 */

import { aiReadyForAttempt } from '@/ai/client';
import { generateAiEvent } from '@/ai/generator';
import { npcReply } from '@/ai/chat';
import { unlockEvent } from '@/app/gallery';
import { Rng } from '@/app/rng';
import { saveGame } from '@/app/save';
import { gameStore, getActiveSlot, settingsStore } from '@/app/state';
import type { Scene, SceneContext } from '@/app/router';
import { C } from '@/render/palette';
import { drawCharacter } from '@/render/sprite';
import { drawBackground } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import { computeEnding } from '@/game/ending';
import { describeReport } from '@/game/effects';
import { availableChoices, markEventSeen, pickEvent, resolveChoice } from '@/game/engine';
import { renderTemplate } from '@/game/text';
import { describeTime, isNight } from '@/game/schedule';
import { promoteToNextPhase, summarizeTerm, type TermSummary } from '@/game/term';
import { PHASE_META, STAT_KEYS, STAT_META } from '@/game/types';
import type { GameEvent, GameState } from '@/game/types';
import { sfx } from '@/ui/audio';
import { createToast, type ToastHandle } from '@/ui/components';
import { h } from '@/ui/dom';

type PlayMode = 'event' | 'result' | 'term' | 'ending' | 'thinking';

/** 打字机速度：每毫秒显示多少字 */
const TYPE_SPEED: Record<string, number> = {
  slow: 0.018,
  normal: 0.045,
  fast: 0.09,
  instant: 10000,
};

interface ChatBubble {
  role: 'user' | 'npc';
  text: string;
}

export function playScene(): Scene {
  let state: GameState | null = null;
  let rng = new Rng(1);
  let current: GameEvent | null = null;
  let mode: PlayMode = 'event';
  let typedChars = 0;
  let fullText = '';
  let lastResultText = '';
  let resultLines: string[] = [];
  let summary: TermSummary | null = null;
  let toast: ToastHandle | null = null;
  let fillerCounter = 0;
  let lastTickChars = 0;
  /** 每次推进时段都 +1；异步的 AI 请求回来时用它判断"这一轮是不是已经作废了" */
  let turnToken = 0;
  let lastAiNote = '';

  let topbarEl: HTMLElement | null = null;
  let dialogEl: HTMLElement | null = null;
  let textEl: HTMLElement | null = null;
  let choicesEl: HTMLElement | null = null;
  let talkTargetsRef: { id: string; name: string }[] = [];

  let ctxRef: SceneContext | null = null;
  let mounted = false;

  /* ---- NPC 聊天面板 ---- */
  const chatLogs = new Map<string, ChatBubble[]>();
  let chatWith: string | null = null;
  let chatPanelEl: HTMLElement | null = null;
  let chatBusy = false;

  /* ------------------------------------------------------------------ *
   * 状态推进
   * ------------------------------------------------------------------ */

  function autosave(): void {
    if (!state) return;
    try {
      saveGame(getActiveSlot(), state);
    } catch (err) {
      console.warn('[play] 自动存档失败：', err);
    }
  }

  /** 进入下一个时段 */
  async function nextTurn(): Promise<void> {
    if (!state) return;
    const token = ++turnToken;
    const s = state;

    current = null;
    fullText = '';
    typedChars = 0;
    lastTickChars = 0;
    lastResultText = '';
    resultLines = [];
    mode = 'event';

    // 要开 AI 就先显示"正在编剧情"
    const wantAi = s.aiEnabled && aiReadyForAttempt();
    if (wantAi) {
      mode = 'thinking';
      renderAll();
    }

    let event: GameEvent | null = null;

    if (wantAi && mounted) {
      const result = await generateAiEvent(s);
      if (token !== turnToken || !mounted) return; // 场景已切换或已推进，丢弃这次结果
      if (result.event) {
        event = result.event;
        lastAiNote = '';
      } else {
        lastAiNote = result.error ?? '';
        console.warn('[play] AI 生成失败，降级到内置事件库：', lastAiNote);
      }
    }

    if (!event && token === turnToken) {
      event = pickEvent(s, rng, { fillerSeed: fillerCounter++ });
    }
    if (!event) return;

    state = markEventSeen(s, event);
    gameStore.set(state);
    current = event;
    fullText = renderTemplate(event.text, state);
    typedChars = 0;
    mode = 'event';
    // 收集进图鉴
    unlockEvent(event.id);
    renderAll();
  }

  function choose(choiceId: string): void {
    if (!state || !current || mode !== 'event') return;

    const previousDay = state.day;
    const result = resolveChoice(state, current, choiceId, rng);
    state = result.state;
    gameStore.set(state);
    autosave();

    lastResultText = result.choice.resultText
      ? renderTemplate(result.choice.resultText, state)
      : '（没什么特别的反应。）';
    resultLines = describeReport(result.report);

    // 用实际数值变化决定是"好事音"还是"坏事音"
    const net = result.report.stats.reduce((sum, d) => sum + d.diff, 0);
    if (current.tone === 'bad' || net < 0) sfx.bad();
    else if (current.tone === 'good' || net > 0) sfx.good();

    // 上课铃只在跨天时响一次。原来每个时段都响，几秒一敲，纯噪音。
    if (state.day !== previousDay) sfx.bell();

    if (result.termEnded) {
      summary = summarizeTerm(state);
      mode = 'term';
      sfx.fanfare();
    } else {
      mode = 'result';
    }
    renderAll();
  }

  function advancePhase(): void {
    if (!state) return;
    const promoted = promoteToNextPhase(state);
    if (!promoted) {
      mode = 'ending';
      renderAll();
      return;
    }
    state = promoted;
    gameStore.set(state);
    autosave();
    summary = null;
    toast?.show(`升入${PHASE_META[state.phase].name}`, 'ok');
    void nextTurn();
  }

  /* ------------------------------------------------------------------ *
   * 顶部状态条
   * ------------------------------------------------------------------ */

  function renderTopbar(): void {
    if (!topbarEl || !state) return;
    const s = state;

    topbarEl.replaceChildren(
      h(
        'div',
        { class: 'play-time' },
        h('span', { class: 'play-phase', text: PHASE_META[s.phase].name }),
        h('span', { class: 'play-when', text: describeTime(s) }),
        isNight(s) ? h('span', { class: 'play-night', text: '夜' }) : null,
      ),
      h(
        'div',
        { class: 'play-stats' },
        ...STAT_KEYS.map((key) => {
          const meta = STAT_META[key];
          const value = s.stats[key];
          const ratio = meta.unit ? Math.min(1, value / 200) : value / 100;
          return h(
            'div',
            { class: 'stat-chip', title: `${meta.name}：${value}` },
            h('span', { class: 'stat-name', text: meta.name }),
            h('span', { class: 'stat-name-short', text: meta.short }),
            h(
              'span',
              { class: 'stat-bar' },
              h('span', {
                class: 'stat-fill',
                style: `width:${Math.round(ratio * 100)}%;background:${meta.color}`,
              }),
            ),
            h('span', { class: 'stat-value', text: String(value) }),
          );
        }),
      ),
      h(
        'div',
        { class: 'play-tools' },
        // 「说话」入口不在这里——它放在对话框的选项列表第一条，见 renderDialog()
        h('button', {
          class: 'pixel-btn play-menu-btn',
          type: 'button',
          text: '菜单',
          onClick: () => {
            autosave();
            ctxRef?.go('menu');
          },
        }),
      ),
    );
  }

  /* ------------------------------------------------------------------ *
   * 对话框
   * ------------------------------------------------------------------ */

  function renderDialog(): void {
    if (!dialogEl || !state) return;
    const s = state;

    /* ---- 结局 ---- */
    if (mode === 'ending') {
      const ending = computeEnding(s);
      const parts: HTMLElement[] = [
        h(
          'div',
          { class: 'ending-head' },
          h('span', { class: 'ending-rank', text: ending.rank }),
          h(
            'span',
            { class: 'ending-head-text' },
            h('span', { class: 'ending-title', text: ending.title }),
            h('span', {
              class: 'ending-subtitle dim',
              text: `${ending.subtitle} · 综合评分 ${ending.score}`,
            }),
          ),
        ),
        ...ending.paragraphs.map((p) => h('p', { class: 'dialog-text', text: p })),
      ];

      if (ending.highlights.length > 0) {
        parts.push(
          h(
            'div',
            { class: 'ending-highlights' },
            h('h4', { class: 'section-title', text: '这三年你还记得的几件事' }),
            ...ending.highlights.map((hl) =>
              h('p', {
                class: 'small-note',
                text: `第 ${hl.day} 天 · ${hl.title} —— 你选了「${hl.choice}」`,
              }),
            ),
          ),
        );
      }

      parts.push(
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', {
            class: 'pixel-btn',
            type: 'button',
            text: '再来一局',
            onClick: () => {
              ctxRef?.go('new-game');
            },
          }),
          h('button', {
            class: 'pixel-btn pixel-btn--primary',
            type: 'button',
            text: '回到主菜单',
            onClick: () => {
              autosave();
              ctxRef?.go('menu');
            },
          }),
        ),
      );

      dialogEl.replaceChildren(...parts);
      return;
    }

    /* ---- 期末成绩单 ---- */
    if (mode === 'term' && summary) {
      dialogEl.replaceChildren(
        h('div', { class: 'dialog-title', text: `${PHASE_META[summary.phase].name} · 期末成绩单` }),
        h(
          'p',
          { class: 'dialog-text' },
          h('span', { class: 'term-rank', text: summary.rank }),
          h('span', { text: `　综合评分 ${summary.score}` }),
        ),
        h('p', { class: 'dialog-text', text: summary.comment }),
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', {
            class: 'pixel-btn pixel-btn--primary',
            type: 'button',
            text: '继续',
            onClick: advancePhase,
          }),
        ),
      );
      return;
    }

    /* ---- AI 正在编剧情 ---- */
    if (mode === 'thinking') {
      dialogEl.replaceChildren(
        h('div', { class: 'dialog-title', text: '……' }),
        h(
          'p',
          { class: 'dialog-text thinking' },
          h('span', { class: 'dot' }, h('span'), h('span'), h('span')),
          h('span', { text: 'AI 正在编这一段剧情' }),
        ),
        h('p', { class: 'dim small-note', text: '最多等几秒；没编出来就用内置事件库顶上，不影响继续玩。' }),
      );
      return;
    }

    /* ---- 选择结果 ---- */
    if (mode === 'result' && current) {
      const parts: HTMLElement[] = [
        h('div', { class: 'dialog-title', text: '结果' }),
        h('p', { class: 'dialog-text', text: lastResultText }),
      ];

      if (resultLines.length > 0) {
        parts.push(
          h(
            'div',
            { class: 'delta-list' },
            ...resultLines.map((line) =>
              h('span', {
                class: `delta ${line.includes('+') ? 'is-up' : 'is-down'}`,
                text: line,
              }),
            ),
          ),
        );
      }

      parts.push(
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', {
            class: 'pixel-btn pixel-btn--primary',
            type: 'button',
            text: '继续 →',
            onClick: () => void nextTurn(),
          }),
        ),
      );

      dialogEl.replaceChildren(...parts);
      return;
    }

    /* ---- 事件正文 ---- */
    if (!current) {
      dialogEl.replaceChildren(h('p', { class: 'dialog-text', text: '……' }));
      return;
    }

    textEl = h('p', { class: 'dialog-text', text: '' });
    choicesEl = h('div', { class: 'dialog-choices interactive' });

    /*
     * 「说话」放在回复栏的第一条。
     * 之前它藏在右上角状态条里，而玩家的视线焦点在对话框上，根本不会往那儿看。
     * 它**不参与数字键编号**：1/2/3 始终留给真正的剧情选项，聊天用 T 键或直接点。
     */
    const talkTargets = (current.participants ?? [])
      .map((id) => s.characters.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .slice(0, 3);

    talkTargetsRef = talkTargets.map((c) => ({ id: c.id, name: c.name }));

    for (const person of talkTargets) {
      choicesEl.appendChild(
        h(
          'button',
          {
            class: 'choice-btn talk-btn',
            type: 'button',
            onClick: () => openChat(person.id),
          },
          h('span', { class: 'choice-index talk-index', text: '话' }),
          h('span', { class: 'choice-text', text: `和${person.name}说句话` }),
        ),
      );
    }

    const choices = availableChoices(s, current);
    choices.forEach((choice, i) => {
      choicesEl?.appendChild(
        h(
          'button',
          {
            class: 'choice-btn',
            type: 'button',
            onClick: () => choose(choice.id),
          },
          h('span', { class: 'choice-index', text: String(i + 1) }),
          h('span', { class: 'choice-text', text: renderTemplate(choice.text, s) }),
        ),
      );
    });

    dialogEl.replaceChildren(
      h(
        'div',
        { class: 'dialog-title' },
        h('span', { text: current.title }),
        current.source === 'ai' ? h('span', { class: 'ai-badge', text: 'AI' }) : null,
      ),
      textEl,
      choicesEl,
      h('p', {
        class: 'dim dialog-hint',
        text: talkTargets.length
          ? '点击文字可跳过打字 · 数字键 1-9 直接选择 · T 跟同学说话 · Esc 回主菜单'
          : '点击文字可跳过打字 · 数字键 1-9 直接选择 · Esc 回主菜单',
      }),
    );

    updateTypedText();
  }

  function updateTypedText(): void {
    if (!textEl) return;
    const shown = Math.floor(typedChars);
    textEl.textContent = fullText.slice(0, shown);
    choicesEl?.classList.toggle('is-ready', shown >= fullText.length);
  }

  function renderAll(): void {
    renderTopbar();
    renderDialog();
    renderChat();
  }

  /* ------------------------------------------------------------------ *
   * NPC 聊天面板
   * ------------------------------------------------------------------ */

  function openChat(characterId: string): void {
    chatWith = characterId;
    renderChat();
  }

  function closeChat(): void {
    chatWith = null;
    renderChat();
  }

  async function sendChat(text: string): Promise<void> {
    if (!state || !chatWith || chatBusy) return;
    const message = text.trim();
    if (!message) return;

    const id = chatWith;
    const log = chatLogs.get(id) ?? [];
    log.push({ role: 'user', text: message });
    chatLogs.set(id, log);
    chatBusy = true;
    renderChat();

    const result = await npcReply(state, id, message);
    if (!mounted || chatWith !== id) return;

    const after = chatLogs.get(id) ?? [];
    after.push(
      result.text
        ? { role: 'npc', text: result.text }
        : { role: 'npc', text: '（TA 好像没听清你在说什么。）' },
    );
    chatLogs.set(id, after);
    chatBusy = false;
    if (!result.text) console.warn('[play] NPC 对话失败：', result.error);
    renderChat();
  }

  function renderChat(): void {
    if (!chatPanelEl) return;

    if (!chatWith || !state) {
      chatPanelEl.classList.remove('is-open');
      chatPanelEl.replaceChildren();
      return;
    }

    const ch = state.characters.find((c) => c.id === chatWith);
    if (!ch) {
      chatWith = null;
      chatPanelEl.classList.remove('is-open');
      return;
    }

    const log = chatLogs.get(ch.id) ?? [];
    const listEl = h(
      'div',
      { class: 'chat-log' },
      log.length === 0
        ? h('p', { class: 'dim', text: `课间十分钟，你想跟${ch.name}说点什么？` })
        : null,
      ...log.map((b) =>
        h('div', { class: `chat-bubble ${b.role === 'user' ? 'is-me' : 'is-npc'}` }, b.text),
      ),
      chatBusy ? h('div', { class: 'chat-bubble is-npc dim', text: '……' }) : null,
    );

    const input = h('input', {
      class: 'pixel-input chat-input',
      type: 'text',
      maxlength: '80',
      placeholder: `对 ${ch.name} 说……`,
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        void sendChat(input.value);
        input.value = '';
      }
    });

    chatPanelEl.replaceChildren(
      h(
        'div',
        { class: 'chat-head' },
        h('span', { class: 'chat-title', text: `和 ${ch.name} 说话` }),
        h('button', { class: 'pixel-btn chat-close', type: 'button', text: '✕', onClick: closeChat }),
      ),
      listEl,
      h(
        'div',
        { class: 'chat-input-row' },
        input,
        h('button', {
          class: 'pixel-btn pixel-btn--primary',
          type: 'button',
          text: '发送',
          onClick: () => {
            void sendChat(input.value);
            input.value = '';
          },
        }),
      ),
    );

    chatPanelEl.classList.add('is-open');
    // 滚到底部
    listEl.scrollTop = listEl.scrollHeight;
    input.focus();
  }

  /* ------------------------------------------------------------------ *
   * 场景接口
   * ------------------------------------------------------------------ */

  return {
    id: 'play',

    mount(ctx: SceneContext, params?: unknown): void {
      ctxRef = ctx;
      mounted = true;
      toast = createToast();

      const loaded = (params as GameState | undefined) ?? gameStore.get();
      if (!loaded) {
        ctx.overlay.appendChild(
          h(
            'div',
            { class: 'page-scene' },
            h('p', { class: 'dim', text: '没有正在进行的对局。' }),
            h('button', {
              class: 'pixel-btn',
              type: 'button',
              text: '回主菜单',
              onClick: () => ctx.go('menu'),
            }),
          ),
        );
        return;
      }

      state = loaded;
      // 用「种子 + 当前天数」派生本次的随机流：读档后同一天不会刷出不同剧情
      rng = new Rng((loaded.seed ^ Math.imul(loaded.day, 2654435761)) >>> 0);

      topbarEl = h('div', { class: 'play-topbar interactive' });
      dialogEl = h('div', { class: 'play-dialog interactive' });
      chatPanelEl = h('div', { class: 'play-chat interactive' });

      ctx.overlay.appendChild(
        h(
          'div',
          { class: 'play-scene' },
          topbarEl,
          h('div', { class: 'play-stage' }),
          dialogEl,
          chatPanelEl,
          toast.el,
        ),
      );

      void nextTurn();
    },

    unmount(): void {
      mounted = false;
      turnToken += 1; // 让还在飞的 AI 请求作废
      autosave();
      toast?.destroy();
      toast = null;
      topbarEl = null;
      dialogEl = null;
      textEl = null;
      choicesEl = null;
      chatPanelEl = null;
      chatWith = null;
      ctxRef = null;
      current = null;
    },

    update(dt: number): void {
      if (mode !== 'event' || !textEl) return;
      if (typedChars >= fullText.length) return;

      const speedKey = settingsStore.get().textSpeed;
      const speed = TYPE_SPEED[speedKey] ?? TYPE_SPEED.normal;
      typedChars = Math.min(fullText.length, typedChars + speed * dt);
      updateTypedText();

      // 打字机的轻微"哒"声：每 12 个字一下，且只有慢速/常速才播。
      // 快速和瞬间模式下文字是成片刷出来的，再配打字音只会变成噪音。
      if (speedKey === 'fast' || speedKey === 'instant') return;
      const shown = Math.floor(typedChars);
      if (shown >= lastTickChars + 12 && shown < fullText.length) {
        lastTickChars = shown;
        sfx.type();
      }
    },

    render(c: CanvasRenderingContext2D): void {
      if (!state) {
        c.fillStyle = C.bg;
        c.fillRect(0, 0, STAGE_W, STAGE_H);
        return;
      }

      drawBackground(c, current?.scene ?? 'classroom', { night: isNight(state) });

      // 在场角色站在画面上部——对话框会盖住下面三分之一
      const ids = current?.participants ?? [];
      const actors = ids
        .map((id) => state?.characters.find((ch) => ch.id === id))
        .filter((ch): ch is NonNullable<typeof ch> => Boolean(ch));

      if (actors.length === 0) {
        const protagonist = state.characters.find((ch) => ch.isProtagonist);
        if (protagonist) actors.push(protagonist);
      }

      const spacing = Math.min(46, Math.floor(240 / Math.max(1, actors.length)));
      const startX = Math.round(160 - ((actors.length - 1) * spacing) / 2);
      actors.forEach((ch, i) => {
        const x = startX + i * spacing - 8;
        const bob = Math.sin((performance.now() + i * 300) / 620) > 0 ? 0 : 1;
        drawCharacter(c, ch.appearance, x, 70 + bob, i % 2 === 0 ? 'front' : 'side');
      });

      // 顶栏压暗，让 DOM 状态条读得清
      c.globalAlpha = 0.5;
      c.fillStyle = C.void;
      px(c, 0, 0, STAGE_W, 32);
      c.globalAlpha = 1;
    },

    onKey(e: KeyboardEvent): boolean {
      if (chatWith) {
        if (e.key === 'Escape') {
          closeChat();
          return true;
        }
        return false; // 输入框里正常打字
      }

      if (e.key === ' ' || e.key === 'Enter') {
        if (mode === 'event') {
          if (typedChars < fullText.length) {
            typedChars = fullText.length;
            updateTypedText();
            return true;
          }
          if (state && current) {
            const choices = availableChoices(state, current);
            if (choices.length === 1) choose(choices[0].id);
          }
          return true;
        }
        if (mode === 'result') {
          void nextTurn();
          return true;
        }
      }

      if (mode === 'event' && typedChars >= fullText.length && state && current) {
        const n = Number(e.key);
        if (n >= 1 && n <= 9) {
          const choices = availableChoices(state, current);
          const choice = choices[n - 1];
          if (choice) {
            choose(choice.id);
            return true;
          }
        }
      }

      // T：跟在场的人说话（和「说话」那条按钮等价，不影响 1-9 的编号）
      if ((e.key === 't' || e.key === 'T') && talkTargetsRef.length > 0) {
        const target = talkTargetsRef[0];
        if (target) {
          openChat(target.id);
          return true;
        }
      }

      if (e.key === 'Escape') {
        autosave();
        ctxRef?.go('menu');
        return true;
      }

      return false;
    },
  };
}
