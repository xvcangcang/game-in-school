/**
 * 游玩场景：整个游戏的主循环界面。
 *
 * 结构上分两层：
 *  - Canvas：画当前事件发生的场景（教室/走廊/操场…）和在场角色
 *  - DOM：顶部状态条、对话框、选项按钮（中文文本一律走 DOM）
 *
 * 流程：挑事件 → 打字机显示正文 → 玩家选择 → 显示结果与数值变化 → 推进时段 → 回到第一步。
 * 每次选择后自动存档（写回开局/读档用的那个存档位）。
 */

import { Rng } from '@/app/rng';
import { saveGame } from '@/app/save';
import { gameStore, getActiveSlot, settingsStore } from '@/app/state';
import type { Scene, SceneContext } from '@/app/router';
import { C } from '@/render/palette';
import { drawCharacter } from '@/render/sprite';
import { drawBackground } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import { describeReport } from '@/game/effects';
import { availableChoices, markEventSeen, pickEvent, resolveChoice } from '@/game/engine';
import { renderTemplate } from '@/game/text';
import { describeTime, isNight } from '@/game/schedule';
import { promoteToNextPhase, summarizeTerm, type TermSummary } from '@/game/term';
import { PHASE_META, STAT_KEYS, STAT_META } from '@/game/types';
import type { GameEvent, GameState } from '@/game/types';
import { createToast, type ToastHandle } from '@/ui/components';
import { h } from '@/ui/dom';

type PlayMode = 'event' | 'result' | 'term' | 'ending';

/** 打字机速度：每毫秒显示多少字 */
const TYPE_SPEED: Record<string, number> = {
  slow: 0.018,
  normal: 0.045,
  fast: 0.09,
  instant: 10000,
};

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

  let topbarEl: HTMLElement | null = null;
  let dialogEl: HTMLElement | null = null;
  let textEl: HTMLElement | null = null;
  let choicesEl: HTMLElement | null = null;
  let ctxRef: SceneContext | null = null;

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

  /** 进入下一个时段：挑事件并显示 */
  function nextTurn(): void {
    if (!state) return;
    current = pickEvent(state, rng, { fillerSeed: fillerCounter++ });
    state = markEventSeen(state, current);
    gameStore.set(state);

    fullText = renderTemplate(current.text, state);
    typedChars = 0;
    lastResultText = '';
    resultLines = [];
    mode = 'event';
    renderAll();
  }

  function choose(choiceId: string): void {
    if (!state || !current || mode !== 'event') return;

    const result = resolveChoice(state, current, choiceId, rng);
    state = result.state;
    gameStore.set(state);
    autosave();

    lastResultText = result.choice.resultText
      ? renderTemplate(result.choice.resultText, state)
      : '（没什么特别的反应。）';
    resultLines = describeReport(result.report);

    if (result.termEnded) {
      summary = summarizeTerm(state);
      mode = 'term';
    } else {
      mode = 'result';
    }
    renderAll();
  }

  function continueFromResult(): void {
    if (mode !== 'result') return;
    nextTurn();
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
    nextTurn();
  }

  /* ------------------------------------------------------------------ *
   * 渲染
   * ------------------------------------------------------------------ */

  function renderTopbar(): void {
    if (!topbarEl || !state) return;
    const s = state;
    const participants = (current?.participants ?? [])
      .map((id) => s.characters.find((c) => c.id === id)?.name)
      .filter((n): n is string => Boolean(n));

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
        participants.length > 0
          ? h('span', { class: 'play-who', text: participants.join(' · ') })
          : null,
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

  function renderDialog(): void {
    if (!dialogEl || !state) return;
    const s = state;

    /* ---- 结局（M7 会替换成真正的结局系统） ---- */
    if (mode === 'ending') {
      dialogEl.replaceChildren(
        h('div', { class: 'dialog-title', text: '毕业' }),
        h('p', {
          class: 'dialog-text',
          text: '三年的时间在最后一场考试的铃声里结束了。你背着书包走出校门，回头看了一眼那栋教学楼。',
        }),
        h('p', { class: 'dim small-note', text: '（完整结局系统在 M7 实现）' }),
        h(
          'div',
          { class: 'dialog-actions' },
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
            onClick: continueFromResult,
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
      h('div', { class: 'dialog-title', text: current.title }),
      textEl,
      choicesEl,
      h('p', { class: 'dim dialog-hint', text: '点击文字可跳过打字 · 数字键 1-9 直接选择 · Esc 回主菜单' }),
    );

    updateTypedText();
  }

  function updateTypedText(): void {
    if (!textEl) return;
    const shown = Math.floor(typedChars);
    textEl.textContent = fullText.slice(0, shown);
    const done = shown >= fullText.length;
    choicesEl?.classList.toggle('is-ready', done);
  }

  function renderAll(): void {
    renderTopbar();
    renderDialog();
  }

  /* ------------------------------------------------------------------ *
   * 场景接口
   * ------------------------------------------------------------------ */

  return {
    id: 'play',

    mount(ctx: SceneContext, params?: unknown): void {
      ctxRef = ctx;
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

      ctx.overlay.appendChild(
        h(
          'div',
          { class: 'play-scene' },
          topbarEl,
          h('div', { class: 'play-stage' }),
          dialogEl,
          toast.el,
        ),
      );

      nextTurn();
    },

    unmount(): void {
      autosave();
      toast?.destroy();
      toast = null;
      topbarEl = null;
      dialogEl = null;
      textEl = null;
      choicesEl = null;
      ctxRef = null;
      current = null;
    },

    update(dt: number): void {
      if (mode !== 'event' || !textEl) return;
      if (typedChars >= fullText.length) return;
      const speed = TYPE_SPEED[settingsStore.get().textSpeed] ?? TYPE_SPEED.normal;
      typedChars = Math.min(fullText.length, typedChars + speed * dt);
      updateTypedText();
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
      if (e.key === ' ' || e.key === 'Enter') {
        if (mode === 'event') {
          if (typedChars < fullText.length) {
            typedChars = fullText.length;
            updateTypedText();
            return true;
          }
          // 只有一个选项时直接选中，省一次点击
          if (state && current) {
            const choices = availableChoices(state, current);
            if (choices.length === 1) {
              choose(choices[0].id);
            }
          }
          return true;
        }
        if (mode === 'result') {
          continueFromResult();
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

      if (e.key === 'Escape') {
        autosave();
        ctxRef?.go('menu');
        return true;
      }

      return false;
    },
  };
}
