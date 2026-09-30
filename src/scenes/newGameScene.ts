/**
 * 开局设置：选学段、选难度、决定要不要开 AI。
 * 选完把参数交给角色创建场景（`creation`）。
 */

import { settingsStore } from '@/app/state';
import type { Scene, SceneContext } from '@/app/router';
import { C } from '@/render/palette';
import { drawBackground } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import {
  createCardGroup,
  createPageHeader,
  createToggle,
  type CardOption,
} from '@/ui/components';
import { h } from '@/ui/dom';
import {
  DIFFICULTY_META,
  PHASE_META,
  PHASE_ORDER,
  type Difficulty,
  type PhaseId,
} from '@/game/types';

export interface NewGameParams {
  phase: PhaseId;
  difficulty: Difficulty;
  aiEnabled: boolean;
}

const PHASE_CARDS: CardOption<PhaseId>[] = PHASE_ORDER.map((p) => ({
  value: p,
  title: PHASE_META[p].name,
  desc: PHASE_META[p].desc,
  icon: p === 'g1' ? '🌱' : p === 'g2' ? '⚡' : '🔥',
}));

const DIFFICULTY_CARDS: CardOption<Difficulty>[] = (
  Object.keys(DIFFICULTY_META) as Difficulty[]
).map((d) => ({
  value: d,
  title: DIFFICULTY_META[d].name,
  desc: DIFFICULTY_META[d].desc,
}));

export function newGameScene(): Scene {
  let aiToggleEl: HTMLButtonElement | null = null;

  return {
    id: 'new-game',

    mount(ctx: SceneContext): void {
      const settings = settingsStore.get();
      const phaseCards = createCardGroup<PhaseId>(PHASE_CARDS, 'g1');
      const diffCards = createCardGroup<Difficulty>(DIFFICULTY_CARDS, 'normal');
      let aiEnabled = settings.ai.enabled;

      aiToggleEl = createToggle(aiEnabled, (v) => {
        aiEnabled = v;
      });

      ctx.overlay.appendChild(
        h(
          'div',
          { class: 'page-scene' },
          createPageHeader('新游戏', '先定好要玩哪一段，再捏人', () => ctx.go('menu')),
          h(
            'div',
            { class: 'page-body interactive' },
            h(
              'section',
              { class: 'form-section' },
              h('h3', { class: 'section-title', text: '① 从哪一学期开始' }),
              phaseCards.el,
            ),
            h(
              'section',
              { class: 'form-section' },
              h('h3', { class: 'section-title', text: '② 难度' }),
              diffCards.el,
            ),
            h(
              'section',
              { class: 'form-section' },
              h('h3', { class: 'section-title', text: '③ 剧情引擎' }),
              h(
                'div',
                { class: 'row-inline' },
                h('span', { class: 'field-label', text: 'AI 动态生成剧情' }),
                aiToggleEl,
              ),
              h('p', {
                class: 'dim small-note',
                text: aiEnabled
                  ? 'AI 会按当前学段、时段、在场角色临时编新剧情；编不出来或没网时自动用本地事件库兜底。'
                  : '只用内置事件库，剧情固定但永远可玩。之后可在「设置」里随时打开 AI。',
              }),
            ),
          ),
          h(
            'div',
            { class: 'page-actions interactive' },
            h('button', {
              class: 'pixel-btn pixel-btn--primary',
              type: 'button',
              text: '下一步：创建主角 →',
              onClick: () => {
                const params: NewGameParams = {
                  phase: phaseCards.getValue(),
                  difficulty: diffCards.getValue(),
                  aiEnabled,
                };
                ctx.go('creation', params);
              },
            }),
          ),
        ),
      );
    },

    unmount(): void {
      aiToggleEl = null;
    },

    render(c: CanvasRenderingContext2D): void {
      drawBackground(c, 'corridor');
      c.globalAlpha = 0.55;
      c.fillStyle = C.void;
      px(c, 0, 0, STAGE_W, STAGE_H);
      c.globalAlpha = 1;
    },
  };
}
